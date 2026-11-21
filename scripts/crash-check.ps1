# CRYPY crash check. Reads public blockchain data only; sends nothing private.
# Starts the app server, opens one big wallet three ways, notes whether the server survives,
# collects Windows' crash records for node.exe, stops the server and writes everything to crash-check.txt.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
$out = Join-Path (Get-Location) "crash-check.txt"
$start = Get-Date
function Note($text) { $text | Out-File $out -Append -Encoding utf8; Write-Host $text }

"CRYPY crash check $($start.ToString('s'))" | Out-File $out -Encoding utf8
Note "node: $(node -v)"

Write-Host "Building the site (about 1 minute)..."
cmd.exe /c "pnpm build > build-log.txt 2>&1"
Note "build exit code: $LASTEXITCODE"

$env:CRYPY_DEBUG_MEMORY = "1"
$env:CRYPY_DEBUG_TIMING = "1"
Write-Host "Starting the server (about 10 seconds)..."
$server = Start-Process -FilePath "cmd.exe" -ArgumentList "/c pnpm start --port 3200 > server-log.txt 2>&1" -PassThru -WindowStyle Minimized

function Alive {
  try { Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3200/en" -TimeoutSec 15 | Out-Null; return $true } catch { return $false }
}

$ready = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 1; if (Alive) { $ready = $true; break } }
Note "server ready: $ready"

if ($ready) {
  $b = "0x28C6c06298d514Db089934071355E5743bf21d60"
  $checks = @(
    @("V vitalik address", "/en/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    @("U usdt contract address", "/en/address/0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    @("A balances", "/en/address/$b"),
    @("B approvals", "/api/v1/address/$b/approvals"),
    @("C portfolio", "/api/v1/address/$b/portfolio")
  )
  foreach ($c in $checks) {
    Write-Host "Checking $($c[0]) (can take up to 3 minutes)..."
    $result = curl.exe -s -o NUL -w "%{http_code} in %{time_total}s" --max-time 180 "http://localhost:3200$($c[1])"
    Note "$($c[0]): status $result"
    if (Alive) { Note "  server still running" } else { Note "  SERVER STOPPED after $($c[0])"; break }
  }
}

Note "--- Windows crash records for node.exe since the start ---"
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error'; StartTime = $start } -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -like '*node.exe*' }
if ($events) { ($events | Format-List TimeCreated, Message | Out-String) | Out-File $out -Append -Encoding utf8 } else { Note "none" }

Note "--- server log ---"
if (Test-Path "server-log.txt") { Get-Content "server-log.txt" | Out-File $out -Append -Encoding utf8 }

taskkill /PID $server.Id /T /F 2>&1 | Out-Null
Write-Host ""
Write-Host "Done. Results saved to crash-check.txt. Tell Claude 'done'."
