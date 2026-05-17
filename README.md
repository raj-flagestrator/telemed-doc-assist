# MediSphere AI

Planning documents: [Planning-Docs/](Planning-Docs/) — includes [architecture](Planning-Docs/architecture.md)

**Runnable prototype:** [prototype/](prototype/) — Python (FastAPI) + React patient golden path.

```bash
cd prototype
./scripts/setup.sh      # or see prototype/README.md (PowerShell)
./scripts/db_up.sh
./scripts/run_all.sh    # terminal 1
./scripts/dev_web.sh    # terminal 2 → http://localhost:5173
# Optional: ./scripts/dev_doctor_web.sh (5174), ./scripts/dev_pharmacy_web.sh (5175)
```

OTP for demo: **123456**


Primary command
From prototype/:

python scripts/run_all.py
Or on Windows:

.\scripts\run_all.ps1
This runs docker compose up -d --build with deploy/.env (created from deploy/.env.example if missing) and prints portal/BFF URLs.

Other options
Command	Action
python scripts/run_all.py --down
Stop all containers
python scripts/run_all.py --down -v
Stop and remove volumes
python scripts/run_all.py --logs
Follow container logs
python scripts/run_all.py --no-build
Start without rebuilding images
python scripts/run_all.py --postgres-only
Postgres only (for host dev)
python scripts/run_all.py --local
Old uvicorn-on-host backends
Files touched