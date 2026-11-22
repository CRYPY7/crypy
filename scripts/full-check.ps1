# CRYPY full check: starts the app server with a log, runs the whole browser test suite against it,
# then collects Windows' crash records for node.exe. Results: full-check.txt, server-log.txt, playwright-run.txt.
param([string]$TestArgs = "")
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
$out = Join-Path (Get-Location) "full-check.txt"
$start = Get-Date
function Note($text) { $text | Out-File $out -Append -Encoding utf8; Write-Host $text }
"CRYPY full check $($start.ToString('s'))" | Out-File $out -Encoding utf8
Note "node: $(node -v)"
Note "test arguments: $TestArgs"

# A running CRYPY server (pnpm start on 3000, or a leftover test server on 3200) locks files the build replaces.
foreach ($port in 3000, 3200) {
  $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($id in $owners) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") {
      taskkill /PID $id /T /F 2>&1 | Out-Null
      Note "stopped the server that was running on port $port (start it again with pnpm start)"
    }
  }
}

# Dependencies exactly as in pnpm-lock.yaml (new packages arrive with updates; supply-chain checks stay on).
Write-Host "Installing dependencies from the lock file..."
cmd.exe /c "pnpm install --frozen-lockfile > install-log.txt 2>&1"
Note "install exit code: $LASTEXITCODE"

Write-Host "Building the site (about 1 minute)..."
cmd.exe /c "pnpm build > build-log.txt 2>&1"
Note "build exit code: $LASTEXITCODE"

$env:CRYPY_DEBUG_MEMORY = "1"
$env:CRYPY_DEBUG_TIMING = "1"
# Test accounts go to a throwaway in-memory database, never to your own .data/pglite.
$env:PGLITE_DIR = "memory"
# Telegram tests use a stand-in Telegram server on this computer, never your real bot (tests/e2e/fake-telegram.ts).
$env:CRYPY_FAKE_TELEGRAM = "1"
$env:TELEGRAM_API_URL = "http://127.0.0.1:3299"
$env:TELEGRAM_BOT_TOKEN = "123456789:AAfakefakefakefakefakefakefakefake12"
# If Node stops on a fatal error, it writes a diagnostic report into .crash-reports (crash details, no secrets).
New-Item -ItemType Directory -Force ".crash-reports" | Out-Null
Get-ChildItem ".crash-reports" -Include "*.json", "*.txt" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
# Diagnosis only: CRYPY_SERVER_NODE_FLAGS passes extra Node/V8 flags to the server (flags NODE_OPTIONS refuses).
$startCommand = if ($env:CRYPY_SERVER_NODE_FLAGS) { "node $env:CRYPY_SERVER_NODE_FLAGS node_modules\next\dist\bin\next start --port 3200" } else { "pnpm start --port 3200" }
Note "server command: $startCommand"
$server = Start-Process -FilePath "cmd.exe" -ArgumentList "/c set ""NODE_OPTIONS=%NODE_OPTIONS% --report-on-fatalerror --report-directory=.crash-reports"" && $startCommand > server-log.txt 2>&1" -PassThru -WindowStyle Minimized
function Alive {
  try { Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3200/en" -TimeoutSec 15 | Out-Null; return $true } catch { return $false }
}
$ready = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 1; if (Alive) { $ready = $true; break } }
Note "server ready: $ready"
# The built-in database opens in the background at start; the tests begin once it is ready (at most 30 s more).
if ($ready -and $env:CRYPY_WORKER -ne "off") {
  for ($i = 0; $i -lt 30; $i++) {
    if (Select-String -Path "server-log.txt" -Pattern "database ready" -Quiet) { break }
    Start-Sleep -Seconds 1
  }
  Note "database ready before the tests: $(Select-String -Path 'server-log.txt' -Pattern 'database ready' -Quiet)"
}

if ($ready) {
  Write-Host "Running the browser tests (about 5 minutes)..."
  # Every 5 s: the computer's free memory and what the node processes use (memory-log.txt).
  $sampler = Start-Job -ScriptBlock {
    param($file)
    "time, free RAM MB, free commit MB, node private MB, node processes, server MB, biggest node (pid MB command)" | Out-File $file -Encoding utf8
    while ($true) {
      $os = Get-CimInstance Win32_OperatingSystem
      $nodes = @(Get-Process node -ErrorAction SilentlyContinue)
      $private = [math]::Round((($nodes | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB)
      $serverPid = Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
      $serverMb = ($nodes | Where-Object Id -eq $serverPid | ForEach-Object { [math]::Round($_.PrivateMemorySize64 / 1MB) })
      $big = $nodes | Sort-Object PrivateMemorySize64 -Descending | Select-Object -First 1
      $bigCmd = if ($big) { (Get-CimInstance Win32_Process -Filter "ProcessId = $($big.Id)").CommandLine } else { "" }
      if ($bigCmd.Length -gt 90) { $bigCmd = $bigCmd.Substring($bigCmd.Length - 90) }
      "$((Get-Date).ToString('HH:mm:ss')), $([math]::Round($os.FreePhysicalMemory / 1KB)), $([math]::Round($os.FreeVirtualMemory / 1KB)), $private, $($nodes.Count), $serverMb, $($big.Id) $([math]::Round($big.PrivateMemorySize64 / 1MB)) $bigCmd" |
        Out-File $file -Append -Encoding utf8
      Start-Sleep -Seconds 5
    }
  } -ArgumentList (Join-Path (Get-Location) "memory-log.txt")
  cmd.exe /c "pnpm test:e2e $TestArgs > playwright-run.txt 2>&1"
  Stop-Job $sampler -ErrorAction SilentlyContinue; Remove-Job $sampler -Force -ErrorAction SilentlyContinue
  $summary = Select-String -Path "playwright-run.txt" -Pattern "^\s+\d+ (passed|failed|skipped|flaky)" | ForEach-Object { $_.Line.Trim() }
  Note "tests: $($summary -join ', ')"
  if (Alive) { Note "server still running at the end" } else { Note "SERVER STOPPED during the tests" }
}

Note "--- Windows crash records for node.exe since the start ---"
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $start } -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -like '*node.exe*' }
if ($events) { ($events | Format-List TimeCreated, ProviderName, Id, Message | Out-String) | Out-File $out -Append -Encoding utf8 } else { Note "none" }
$os = Get-CimInstance Win32_OperatingSystem
Note "computer memory: $([math]::Round($os.TotalVisibleMemorySize / 1MB, 1)) GB RAM, $([math]::Round($os.TotalVirtualMemorySize / 1MB, 1)) GB with the page file"
Note "--- memory during the tests (lowest free RAM first, 8 rows) ---"
if (Test-Path "memory-log.txt") {
  Get-Content "memory-log.txt" | Select-Object -Skip 1 | Sort-Object { [int](($_ -split ',')[1]) } | Select-Object -First 6 |
    ForEach-Object { Note $_ }
  Note "last rows:"; Get-Content "memory-log.txt" | Select-Object -Last 4 | ForEach-Object { Note $_ }
}
$reports = @(Get-ChildItem ".crash-reports" -Filter "*.json" -ErrorAction SilentlyContinue)
Note "Node crash reports: $($reports.Count)"
foreach ($r in $reports) {
  $j = Get-Content $r.FullName -Raw | ConvertFrom-Json
  Note "report $($r.Name): event '$($j.header.event)', trigger '$($j.header.trigger)'"
  ($j.nativeStack | Select-Object -First 15 | ForEach-Object { "  $($_.symbol)" }) | Out-File $out -Append -Encoding utf8
  ($j.javascriptStack.stack | Select-Object -First 10 | ForEach-Object { "  js $_" }) | Out-File $out -Append -Encoding utf8
  $handles = $j.libuv | Group-Object type | ForEach-Object { "$($_.Name) $($_.Count)" }
  Note "  libuv handles: $($handles -join ', ')"
  Note "  threads in the pool: $($j.header.cpus.Count) cpus; worker threads: $(@($j.workers).Count)"
  ($j.javaScriptHeap.heapSpaces.PSObject.Properties | ForEach-Object { "  heap $($_.Name): $([math]::Round($_.Value.memorySize / 1MB)) MB" }) | Out-File $out -Append -Encoding utf8
  Note "  resource usage: $($j.resourceUsage | ConvertTo-Json -Compress)"
}
Note "--- main thread busy (watchdog) ---"
if (Test-Path ".crash-reports\blocked-main-thread.txt") { Get-Content ".crash-reports\blocked-main-thread.txt" | Select-Object -First 80 | ForEach-Object { Note $_ } } else { Note "never" }
Note "--- sudden growth lines from the server ---"
if (Test-Path "server-log.txt") { Select-String -Path "server-log.txt" -Pattern "memory JUMP|SYSTEM MEMORY DROP|diagnostic report" | Select-Object -First 12 | ForEach-Object { Note $_.Line } }
Note "--- server log ---"
if (Test-Path "server-log.txt") { Get-Content "server-log.txt" | Out-File $out -Append -Encoding utf8 }
taskkill /PID $server.Id /T /F 2>&1 | Out-Null
Write-Host "Done. Results saved to full-check.txt."
