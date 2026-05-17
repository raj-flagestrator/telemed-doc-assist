# Reset prototype Postgres to a clean demo state.
# Usage: .\scripts\reset_prototype.ps1 [-y] [-DbOnly] [-NoDocker]

param(
    [switch]$y,
    [switch]$DbOnly,
    [switch]$NoDocker
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$Python = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

$Args = @("$Root\scripts\reset_prototype.py")
if ($y) { $Args += "-y" }
if ($DbOnly) { $Args += "--db-only" }
if ($NoDocker) { $Args += "--no-docker" }

& $Python @Args
exit $LASTEXITCODE
