# MediSphere AI — Prototype

FastAPI monorepo implementing the **patient golden path** from `Planning-Docs/`.

## Stack

- **FastAPI** + **Uvicorn** — HTTP services & BFF
- **asyncpg** — PostgreSQL
- **python-jose** — JWT auth
- **httpx** — service-to-service calls
- **React (Vite)** — `apps/patient-web`, `apps/doctor-web`, and `apps/pharmacy-web` (channel UIs, proxy to BFFs)

## Structure

```text
prototype/
  medisphere/              # Shared auth, DB, app factory, triage engine
  services/                # 9 microservices (ports 4001–4009)
  bff/patient_bff/         # Patient BFF (port 4100)
  bff/doctor_bff/          # Doctor BFF (port 4101)
  bff/pharmacy_bff/        # Pharmacy BFF (port 4102)
  apps/patient-web/        # Mobile-first patient wizard
  apps/doctor-web/         # Doctor portal (schedule, consult, eRx)
  apps/pharmacy-web/       # Pharmacy portal (queue, stock, dispatch)
  scripts/run_all.py       # Start all backends locally
  deploy/docker-compose.yml
```

## Prerequisites

- Python 3.11+
- Docker Desktop (PostgreSQL on port **5434**)
- Node.js 20+ (only for patient-web UI)

## Quick start

### Windows (PowerShell)

```powershell
cd c:\Jim\Workspace\FGS\MediSphereAI\prototype

docker compose -f deploy/docker-compose.yml up -d

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python scripts/run_all.py

# Patient UI (new terminal)
cd apps\patient-web
npm install
npm run dev
```

### Git Bash on Windows — notes

- If you see `(.venv)` in your prompt, the venv is **already active** — do **not** run `python -m venv .venv` again (that causes `Permission denied`).
- If `setup.sh` stops on a pip upgrade warning, run: `python -m pip install -r requirements.txt`

### macOS / Linux / Git Bash (`.sh`)

```bash
cd prototype

chmod +x scripts/*.sh
./scripts/setup.sh          # venv + pip + .env
./scripts/db_up.sh          # PostgreSQL on :5434
./scripts/run_all.sh        # all backends

# Patient UI (new terminal)
./scripts/dev_web.sh
```

Activate the venv in any shell session (same as `Activate.ps1`):

```bash
source scripts/activate.sh
```

Open **http://localhost:5173** — patient OTP **`123456`**.

In **My care**, tap any appointment to open visit details (triage, consultation notes, prescription, delivery) — same data model as the doctor schedule detail view.

### Doctor portal (second terminal)

```bash
./scripts/dev_doctor_web.sh
```

Open **http://localhost:5174** — prototype doctor accounts (OTP **`123456`** for all):

| Email | Specialty | Practitioner |
|-------|-----------|--------------|
| `doctor@medisphere.mv` | Cardiology | Dr. Aishath Hassan |
| `ent@medisphere.mv` | ENT | Dr. Mariyam Rasheed |
| `gastro@medisphere.mv` | Gastroenterology | Dr. Ahmed Naeem |
| `gp@medisphere.mv` | General Practice | Dr. Ibrahim Waheed |

Patient triage routes to **Cardiology**, **ENT**, **Gastroenterology**, or **GP** from symptom keywords; booking shows the matching specialist slot.

After a patient completes booking on the patient app, the appointment appears on the doctor schedule for that practitioner.

### Pharmacy portal (third terminal)

```bash
./scripts/dev_pharmacy_web.sh
```

Open **http://localhost:5175** — prototype pharmacy staff (OTP **`123456`** for all):

| Email | Role |
|-------|------|
| `pharmacist@medisphere.mv` | Lead pharmacist · Male Central Pharmacy |
| `dispatch@medisphere.mv` | Fulfillment / dispatch desk |

**Workflow:** routed ePrescriptions appear in the **Queue** after a doctor signs (auto-routed) or the patient routes from the ePrescription step. For each order: verify insurance → reserve stock & prepare → mark ready → create island delivery → dispatch. **Stock** tab shows on-hand quantities and low-stock alerts.

### Reset database (fresh prototype)

Stops Postgres, deletes the Docker data volume, recreates the DB, and re-applies all service schemas. **Stop `run_all.py` first.**

**PowerShell**

```powershell
.\scripts\reset_prototype.ps1 -y
```

**Bash**

```bash
./scripts/reset_prototype.sh -y
```

**Python (any shell)**

```bash
python scripts/reset_prototype.py -y
```

| Flag | Effect |
|------|--------|
| `-y` / `--yes` | Skip confirmation |
| `--db-only` | Keep the container; `DROP SCHEMA` and re-migrate (faster) |
| `--no-docker` | Schema wipe only (Postgres must already be on port **5434**) |

Then restart backends: `python scripts/run_all.py`. Clear browser `localStorage` if you want new login sessions.

## Service ports

| Service | Port |
|---------|------|
| identity-service | 4001 |
| tenant-config-service | 4002 |
| patient-service | 4003 |
| appointment-service | 4004 |
| consultation-service | 4005 |
| prescription-service | 4006 |
| ai-triage-service | 4007 |
| delivery-service | 4008 |
| pharmacy-service | 4009 |
| patient-bff | 4100 |
| doctor-bff | 4101 |
| pharmacy-bff | 4102 |
| patient-web | 5173 |
| doctor-web | 5174 |
| pharmacy-web | 5175 |

Each service exposes `/health`, `/ready`, `/metrics`, `/version`.

## Appointment & visit statuses

Portals show an **Appointment ID** (UUID) on schedule cards, visit detail, and each step of the golden path so patient and doctor views stay aligned.

### Unified visit status (`visitStatus`)

Both portals derive a single **visit status** from the appointment row, consultation, and prescription (`medisphere/visit_status.py`). This is what schedule badges and My Care section headers use.

| `visitStatus` | Meaning |
|---------------|---------|
| `booked` | Appointment created; no consultation room yet. |
| `ready` | Consultation exists with status `waiting` (room ready; patient can join). |
| `in_progress` | Video consult active (`consultation.status == in_progress`). |
| `awaiting_rx` | Consultation completed; doctor has not issued a prescription yet. |
| `completed` | Prescription exists for the visit, or `appointments.status` is `completed`. |

**Patient My Care buckets**

| Section | Visit statuses included |
|---------|-------------------------|
| Upcoming appointments | `booked`, `ready`, `in_progress` |
| Awaiting prescription | `awaiting_rx` |
| Past visits | `completed` |

### Database / service statuses

These are stored on individual records and shown on My Care detail lines (consultation, prescription, delivery).

**Appointment** (`appointment-service`, `appointments.status`)

| Status | Meaning |
|--------|---------|
| `booked` | Slot reserved after patient booking. |
| `completed` | Visit closed (often set when prescription is issued). |

**Consultation** (`consultation-service`)

| Status | Meaning |
|--------|---------|
| `waiting` | Room created; patient or doctor not yet in active call. |
| `in_progress` | Call in progress. |
| `completed` | Call ended; clinical notes may be saved. |

**Prescription** (`prescription-service`)

| Status | Meaning |
|--------|---------|
| `signed` | ePrescription created and digitally signed. |
| `routed` | Sent to pharmacy (e.g. Male Central Pharmacy). |
| `fulfilled` | Pharmacy dispatched medicines to courier. |

**Delivery** (`delivery-service`)

| Status | Meaning |
|--------|---------|
| `preparing` | Pharmacy preparing the order. |
| `dispatched` | Handed to courier. |
| `in_transit` | En route to the patient’s island. |
| `delivered` | Delivered to patient. |

## Run a single service

**PowerShell**

```powershell
$env:PYTHONPATH = (Get-Location)
python -m uvicorn services.identity_service.app:app --port 4001 --reload
```

**Bash**

```bash
source scripts/activate.sh
python -m uvicorn services.identity_service.app:app --port 4001 --reload
```
