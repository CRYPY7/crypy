# CRYPY full check: starts the app server with a log, runs the whole browser test suite against it,
# then collects Windows' crash records for node.exe. Results: full-check.txt, server-log.txt, playwright-run.txt.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
$out = Join-Path (Get-Location) "full-check.txt"
$start = Get-Date
function Note($text) { $text | Out-File $out -Append -Encoding utf8; Write-Host $text }
"CRYPY full check $($start.ToString('s'))" | Out-File $out -Encoding utf8
Note "node: $(node -v)"

Write-Host "Building the site (about 1 minute)..."
cmd.exe /c "pnpm build > build-log.txt 2>&1"
Note "build exit code: $LASTEXITCODE"

$env:CRYPY_DEBUG_MEMORY = "1"
$env:CRYPY_DEBUG_TIMING = "1"
$server = Start-Process -FilePath "cmd.exe" -ArgumentList "/c pnpm start --port 3200 > server-log.txt 2>&1" -PassThru -WindowStyle Minimized
function Alive {
  try { Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3200/en" -TimeoutSec 15 | Out-Null; return $true } catch { return $false }
}
$ready = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 1; if (Alive) { $ready = $true; break } }
Note "server ready: $ready"

if ($ready) {
  Write-Host "Running the browser tests (about 5 minutes)..."
  cmd.exe /c "pnpm test:e2e > playwright-run.txt 2>&1"
  $summary = Select-String -Path "playwright-run.txt" -Pattern "^\s+\d+ (passed|failed|skipped|flaky)" | ForEach-Object { $_.Line.Trim() }
  Note "tests: $($summary -join ', ')"
  if (Alive) { Note "server still running at the end" } else { Note "SERVER STOPPED during the tests" }
}

Note "--- Windows crash records for node.exe since the start ---"
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $start } -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -like '*node.exe*' }
if ($events) { ($events | Format-List TimeCreated, ProviderName, Id, Message | Out-String) | Out-File $out -Append -Encoding utf8 } else { Note "none" }
Note "--- server log ---"
if (Test-Path "server-log.txt") { Get-Content "server-log.txt" | Out-File $out -Append -Encoding utf8 }
taskkill /PID $server.Id /T /F 2>&1 | Out-Null
Write-Host "Done. Results saved to full-check.txt."
