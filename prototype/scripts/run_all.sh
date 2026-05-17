#!/usr/bin/env bash
# Start the MediSphere Docker stack (no Python required for default).
# Git Bash on Windows: use this script, not ./scripts/run_all.py
#
#   ./scripts/run_all.sh
#   ./scripts/run_all.sh --down
#   ./scripts/run_all.sh --local    # needs .venv Python

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

COMPOSE_FILE="${ROOT}/deploy/docker-compose.yml"
ENV_FILE="${ROOT}/deploy/.env"
ENV_EXAMPLE="${ROOT}/deploy/.env.example"

ensure_deploy_env() {
  if [[ ! -f "${ENV_FILE}" && -f "${ENV_EXAMPLE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    echo "Created deploy/.env from deploy/.env.example"
  fi
}

run_compose() {
  ensure_deploy_env
  local -a cmd=(docker compose -f "${COMPOSE_FILE}")
  if [[ -f "${ENV_FILE}" ]]; then
    cmd+=(--env-file "${ENV_FILE}")
  fi
  echo "  $ ${cmd[*]} $*"
  "${cmd[@]}" "$@"
}

print_urls() {
  cat <<'EOF'

MediSphere prototype (Docker)

  Patient portal   http://localhost:5173
  Doctor portal    http://localhost:5174
  Pharmacy portal  http://localhost:5175

  Patient BFF      http://localhost:4100
  Doctor BFF       http://localhost:4101
  Pharmacy BFF     http://localhost:4102

  Postgres         localhost:5434

  Demo patient OTP: 123456  (phone +9607712345)

Stop stack:  ./scripts/run_all.sh --down
View logs:   ./scripts/run_all.sh --logs
EOF
}

resolve_venv_python() {
  if [[ -x "${ROOT}/.venv/Scripts/python.exe" ]]; then
    echo "${ROOT}/.venv/Scripts/python.exe"
  elif [[ -x "${ROOT}/.venv/bin/python" ]]; then
    echo "${ROOT}/.venv/bin/python"
  elif command -v py >/dev/null 2>&1; then
    echo "py -3"
  else
    return 1
  fi
}

# --local needs Python with project deps; delegate to run_all.py
for arg in "$@"; do
  if [[ "${arg}" == "--local" ]]; then
    PYTHON="$(resolve_venv_python)" || {
      echo "No Python for --local. Run: ./scripts/setup.sh" >&2
      exit 1
    }
    export PYTHONPATH="${ROOT}${PYTHONPATH:+:${PYTHONPATH}}"
    exec "${PYTHON}" "${ROOT}/scripts/run_all.py" "$@"
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH." >&2
  exit 1
fi

down=0
volumes=0
logs=0
postgres_only=0
no_build=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --down) down=1 ;;
    -v | --volumes) volumes=1 ;;
    --logs) logs=1 ;;
    --postgres-only) postgres_only=1 ;;
    --no-build) no_build=1 ;;
    -h | --help)
      echo "Usage: ./scripts/run_all.sh [--down] [-v] [--logs] [--postgres-only] [--no-build] [--local]"
      echo "  Default: docker compose up -d --build (full stack)"
      echo "  --local: run uvicorn on host (requires venv Python)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ${logs} -eq 1 ]]; then
  run_compose logs -f --tail 100
  exit 0
fi

if [[ ${down} -eq 1 ]]; then
  down_args=(down --remove-orphans)
  [[ ${volumes} -eq 1 ]] && down_args+=(-v)
  run_compose "${down_args[@]}"
  echo "Stack stopped."
  exit 0
fi

if [[ ${postgres_only} -eq 1 ]]; then
  run_compose up -d postgres
  echo "Postgres is starting on localhost:5434"
  exit 0
fi

up_args=(up -d)
[[ ${no_build} -eq 0 ]] && up_args+=(--build)

echo "Starting MediSphere prototype (Docker Compose)…"
run_compose "${up_args[@]}"
print_urls
