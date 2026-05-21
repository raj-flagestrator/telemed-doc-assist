# Doctor Copilot — Steps to Run

## Prereqs (one-time installs on the host)

- Docker Desktop (running)
- Python 3.11+ (just to invoke `scripts/run_all.py`)
- Free ports: `5173-5175`, `4100-4102`, `4001-4010`, `5434`

## Setup

```bash
git clone https://github.com/raj-flagestrator/telemed-doc-assist.git
cd telemed-doc-assist/prototype
```

Now add your `ANTHROPIC_API_KEY` in `prototype/deploy/.env` (file is gitignored).

```bash
python scripts/run_all.py   # auto-creates deploy/.env from .env.example on first run
```

Open `http://localhost:5174` → log in as any doctor with OTP `123456` → open a visit → click the **AI copilot** button.
