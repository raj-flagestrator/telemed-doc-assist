"""Shared paths and helpers for deploy/docker-compose.yml."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE_FILE = ROOT / "deploy" / "docker-compose.yml"
ENV_EXAMPLE = ROOT / "deploy" / ".env.example"
ENV_FILE = ROOT / "deploy" / ".env"


def docker_available() -> bool:
    return shutil.which("docker") is not None


def ensure_deploy_env() -> Path:
    if not ENV_FILE.is_file() and ENV_EXAMPLE.is_file():
        ENV_FILE.write_text(ENV_EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Created {ENV_FILE.relative_to(ROOT)} from deploy/.env.example")
    return ENV_FILE


def compose_base_cmd() -> list[str]:
    ensure_deploy_env()
    cmd = ["docker", "compose", "-f", str(COMPOSE_FILE)]
    if ENV_FILE.is_file():
        cmd.extend(["--env-file", str(ENV_FILE)])
    return cmd


def run_compose(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = compose_base_cmd() + list(args)
    print("  $", " ".join(cmd))
    return subprocess.run(cmd, cwd=ROOT, check=check, text=True)


STACK_URLS = """
MediSphere prototype (Docker)

  Patient portal   http://localhost:5173
  Doctor portal    http://localhost:5174
  Pharmacy portal  http://localhost:5175

  Patient BFF      http://localhost:4100
  Doctor BFF       http://localhost:4101
  Pharmacy BFF     http://localhost:4102

  Postgres         localhost:5434

  Demo patient OTP: 123456  (phone +9607712345)
"""
