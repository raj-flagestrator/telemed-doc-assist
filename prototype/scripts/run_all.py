#!/usr/bin/env python3
"""
Start the MediSphere prototype stack.

Default: all services via Docker Compose (APIs, BFFs, portals, Postgres).

Usage (from prototype/):
  ./scripts/run_all.sh                   # recommended (Git Bash / macOS / Linux)
  .venv/Scripts/python.exe scripts/run_all.py   # Windows if python is not on PATH

  python scripts/run_all.py              # up -d --build
  python scripts/run_all.py --logs       # follow container logs
  python scripts/run_all.py --down       # stop containers
  python scripts/run_all.py --down -v    # stop and remove volumes
  python scripts/run_all.py --local      # uvicorn on host (needs Postgres + .venv)

Do not use ./scripts/run_all.py on Git Bash — it hits the Windows Store Python stub.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SERVICES: list[tuple[str, int]] = [
    ("services.identity_service.app:app", 4001),
    ("services.tenant_config_service.app:app", 4002),
    ("services.patient_service.app:app", 4003),
    ("services.appointment_service.app:app", 4004),
    ("services.consultation_service.app:app", 4005),
    ("services.prescription_service.app:app", 4006),
    ("services.ai_triage_service.app:app", 4007),
    ("services.delivery_service.app:app", 4008),
    ("services.pharmacy_service.app:app", 4009),
    ("bff.patient_bff.app:app", 4100),
    ("bff.doctor_bff.app:app", 4101),
    ("bff.pharmacy_bff.app:app", 4102),
]


def run_local() -> None:
    from scripts._compose import docker_available

    if not docker_available():
        print("Docker not found. Install Docker or use an existing Postgres on :5434.", file=sys.stderr)
        raise SystemExit(1)

    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    venv_python = ROOT / ".venv" / ("Scripts" if os.name == "nt" else "bin") / (
        "python.exe" if os.name == "nt" else "python"
    )
    python = str(venv_python) if venv_python.is_file() else sys.executable

    procs: list[subprocess.Popen] = []
    try:
        for target, port in SERVICES:
            cmd = [
                python,
                "-m",
                "uvicorn",
                target,
                "--host",
                "0.0.0.0",
                "--port",
                str(port),
            ]
            print(f"Starting {target} on :{port}")
            procs.append(subprocess.Popen(cmd, cwd=ROOT, env=env))
        print(f"Using Python: {python}")
        print("Local backends running. Press Ctrl+C to stop.")
        print("Tip: start Postgres with  python scripts/run_all.py --postgres-only")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping services…")
        for proc in procs:
            proc.terminate()


def main() -> None:
    parser = argparse.ArgumentParser(description="Start or manage the MediSphere prototype stack.")
    parser.add_argument(
        "--local",
        action="store_true",
        help="Run uvicorn backends on the host (not Docker). Portals still need npm dev or Docker.",
    )
    parser.add_argument(
        "--postgres-only",
        action="store_true",
        help="Start only the Postgres container (for --local dev).",
    )
    parser.add_argument(
        "--down",
        action="store_true",
        help="Stop Docker Compose services.",
    )
    parser.add_argument(
        "-v",
        "--volumes",
        action="store_true",
        help="With --down, also remove named volumes.",
    )
    parser.add_argument(
        "--no-build",
        action="store_true",
        help="Skip image build on start (default is --build).",
    )
    parser.add_argument(
        "--logs",
        action="store_true",
        help="Follow compose logs (blocks until Ctrl+C).",
    )
    args = parser.parse_args()

    if args.local:
        run_local()
        return

    from scripts._compose import STACK_URLS, docker_available, run_compose

    if not docker_available():
        print("Docker is not installed or not on PATH.", file=sys.stderr)
        raise SystemExit(1)

    if args.down:
        down_args = ["down", "--remove-orphans"]
        if args.volumes:
            down_args.append("-v")
        run_compose(*down_args)
        print("Stack stopped.")
        return

    if args.postgres_only:
        run_compose("up", "-d", "postgres")
        print("Postgres is starting on localhost:5434")
        return

    if args.logs:
        run_compose("logs", "-f", "--tail", "100")
        return

    up_args = ["up", "-d"]
    if not args.no_build:
        up_args.append("--build")

    print("Starting MediSphere prototype (Docker Compose)…")
    run_compose(*up_args)
    print(STACK_URLS)
    print("Stop stack:  python scripts/run_all.py --down")
    print("View logs:   python scripts/run_all.py --logs")


if __name__ == "__main__":
    main()
