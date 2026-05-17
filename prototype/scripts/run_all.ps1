# Start or manage the MediSphere Docker Compose stack.
# Usage: .\scripts\run_all.ps1
#        .\scripts\run_all.ps1 -Down
#        .\scripts\run_all.ps1 -Local

param(
    [switch]$Local,
    [switch]$PostgresOnly,
    [switch]$Down,
    [switch]$Volumes,
    [switch]$Logs,
    [switch]$NoBuild
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$Python = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

$Args = @("$Root\scripts\run_all.py")
if ($Local) { $Args += "--local" }
if ($PostgresOnly) { $Args += "--postgres-only" }
if ($Down) { $Args += "--down" }
if ($Volumes) { $Args += "-v" }
if ($Logs) { $Args += "--logs" }
if ($NoBuild) { $Args += "--no-build" }

& $Python @Args
exit $LASTEXITCODE
