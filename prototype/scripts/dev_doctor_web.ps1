# Doctor portal → http://localhost:5174
$Root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $Root "apps\doctor-web")

if (-not (Test-Path "node_modules\picomatch")) {
    Write-Host "Installing doctor-web dependencies…"
    npm install
}

Write-Host "Doctor portal → http://localhost:5174"
npm run dev
