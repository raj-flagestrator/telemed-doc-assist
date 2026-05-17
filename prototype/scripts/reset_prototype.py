#!/usr/bin/env python3
"""
Reset the MediSphere prototype database to a clean state.

By default this:
  1. Stops and removes the Docker Postgres container and its data volume
  2. Starts a fresh Postgres container (deploy/docker-compose.yml)
  3. Re-applies all service DDL and seeds default tenant config

Stop the stack first (`python scripts/run_all.py --down`) so nothing holds DB connections.

Usage (from prototype/):
  python scripts/reset_prototype.py
  python scripts/reset_prototype.py -y
  python scripts/reset_prototype.py --db-only    # keep container; DROP SCHEMA + migrate
  python scripts/reset_prototype.py --no-docker  # only wipe schema (Postgres must be up)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts._compose import run_compose  # noqa: E402

DB_CONTAINER = "medisphere-prototype-db"

# Apply in dependency-friendly order (all tables are independent in prototype).
MIGRATION_SOURCES: list[tuple[str, str, str]] = [
    ("identity-service", "services.identity_service.app", "MIGRATION"),
    ("tenant-config-service", "services.tenant_config_service.app", "MIGRATION"),
    ("patient-service", "services.patient_service.app", "MIGRATION"),
    ("appointment-service", "services.appointment_service.app", "MIGRATION"),
    ("consultation-service", "services.consultation_service.app", "MIGRATION"),
    ("prescription-service", "services.prescription_service.app", "MIGRATION"),
    ("ai-triage-service", "services.ai_triage_service.app", "MIGRATION"),
    ("delivery-service", "services.delivery_service.app", "MIGRATION"),
]


def run_cmd(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("  $", " ".join(cmd))
    return subprocess.run(cmd, cwd=ROOT, check=check, text=True)


def docker_available() -> bool:
    try:
        run_cmd(["docker", "version"], check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def reset_docker_postgres() -> None:
    if not docker_available():
        raise SystemExit("Docker is not available. Use --no-docker if Postgres is already running.")

    print("\n[1/3] Stopping stack and removing Postgres volume…")
    run_compose("down", "-v", "--remove-orphans")

    print("\n[2/3] Starting fresh Postgres…")
    run_compose("up", "-d", "postgres")

    print("\n[3/3] Waiting for Postgres to accept connections…")
    deadline = time.time() + 90
    while time.time() < deadline:
        try:
            proc = run_cmd(
                [
                    "docker",
                    "exec",
                    DB_CONTAINER,
                    "pg_isready",
                    "-U",
                    "medisphere",
                    "-d",
                    "medisphere",
                ],
                check=False,
            )
            if proc.returncode == 0:
                print("  Postgres is ready.")
                return
        except subprocess.CalledProcessError:
            pass
        time.sleep(2)
    raise SystemExit("Postgres did not become ready in time.")


async def wipe_public_schema() -> None:
    from medisphere.db import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            DROP SCHEMA IF EXISTS public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO medisphere;
            GRANT ALL ON SCHEMA public TO public;
            """
        )
    print("  Dropped and recreated schema public.")


def load_migrations() -> list[tuple[str, str]]:
    import importlib

    out: list[tuple[str, str]] = []
    for service_name, module_path, attr in MIGRATION_SOURCES:
        mod = importlib.import_module(module_path)
        sql = getattr(mod, attr)
        out.append((service_name, sql))
    return out


async def apply_migrations() -> None:
    from medisphere.db import close_pool, run_migrations

    print("\nApplying service migrations…")
    for service_name, sql in load_migrations():
        await run_migrations(service_name, sql)
        print(f"  ✓ {service_name}")

    await seed_tenant_config()
    await close_pool()


async def seed_tenant_config() -> None:
    from medisphere.db import get_pool
    from services.tenant_config_service.app import DEFAULT_THEME

    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO tenant_config (tenant_id, config) VALUES ($1, $2::jsonb)
        ON CONFLICT (tenant_id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
        """,
        DEFAULT_THEME["tenantId"],
        json.dumps(DEFAULT_THEME),
    )
    print(f"  ✓ Seeded tenant config ({DEFAULT_THEME['tenantId']})")


async def async_main(args: argparse.Namespace) -> None:
    os.chdir(ROOT)
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    os.environ.update(env)

    if not args.no_docker and not args.db_only:
        reset_docker_postgres()
    elif not args.no_docker and args.db_only:
        print("\nKeeping Docker Postgres; wiping schema only…")
        if docker_available():
            try:
                run_cmd(
                    [
                        "docker",
                        "compose",
                        "-f",
                        str(COMPOSE_FILE),
                        "up",
                        "-d",
                        "postgres",
                    ],
                    check=False,
                )
            except subprocess.CalledProcessError:
                pass
        await wipe_public_schema()
    elif args.no_docker:
        print("\nWiping database schema (no Docker changes)…")
        await wipe_public_schema()
    else:
        # Fresh volume from docker reset — schema is already empty
        pass

    await apply_migrations()

    print(
        "\nPrototype database reset complete.\n"
        "  • Restart stack: python scripts/run_all.py\n"
        "  • Patient OTP: 123456 · Doctor: doctor@medisphere.mv\n"
        "  • Clear browser localStorage if you want fresh portal sessions\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete all prototype DB data and re-initialize schema."
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    parser.add_argument(
        "--db-only",
        action="store_true",
        help="Do not remove Docker volume; DROP SCHEMA and re-migrate",
    )
    parser.add_argument(
        "--no-docker",
        action="store_true",
        help="Only DROP SCHEMA + migrate (Postgres must already be running on :5434)",
    )
    args = parser.parse_args()

    if args.db_only and args.no_docker:
        parser.error("Use only one of --db-only or --no-docker")

    if not args.yes:
        mode = "full Docker volume reset" if not args.db_only and not args.no_docker else "schema wipe"
        print(
            f"This will {mode} and delete ALL prototype data "
            "(patients, appointments, consultations, prescriptions, deliveries).\n"
        )
        try:
            answer = input("Continue? [y/N] ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.")
            raise SystemExit(1) from None
        if answer not in ("y", "yes"):
            print("Cancelled.")
            raise SystemExit(0)

    try:
        asyncio.run(async_main(args))
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
