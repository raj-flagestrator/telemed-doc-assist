#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Postgres only (for local uvicorn via run_all.py --local).
exec python "${ROOT}/scripts/run_all.py" --postgres-only
