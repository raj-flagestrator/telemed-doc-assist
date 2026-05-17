#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv 2>/dev/null || python -m venv .venv
else
  echo "Using existing .venv (skip: python -m venv .venv)"
fi

# shellcheck source=activate.sh
source "${ROOT}/scripts/activate.sh"

python -m pip install --upgrade pip || true
python -m pip install -r requirements.txt

if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Setup complete. Activate anytime with:"
echo "  source scripts/activate.sh"
echo ""
echo "Start the full prototype stack (Docker):"
echo "  python scripts/run_all.py"
echo "  # or: ./scripts/run_all.sh"
