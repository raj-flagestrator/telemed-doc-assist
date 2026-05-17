# Start pharmacy portal on http://localhost:5175 (fails if port taken — do not use doctor-web on this port)
$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "apps\pharmacy-web")

if (-not (Test-Path "node_modules\picomatch")) {
    Write-Host "Installing pharmacy-web dependencies…"
    npm install
}

Write-Host "Pharmacy portal → http://localhost:5175"
npm run dev
