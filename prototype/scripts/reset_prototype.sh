#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ -f "${ROOT}/scripts/activate.sh" ]]; then
  # shellcheck source=activate.sh
  source "${ROOT}/scripts/activate.sh"
fi

exec python "${ROOT}/scripts/reset_prototype.py" "$@"
