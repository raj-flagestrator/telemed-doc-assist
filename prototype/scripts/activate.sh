#!/usr/bin/env bash
# Unix / Git Bash equivalent of:  .\.venv\Scripts\Activate.ps1
# Usage (must source):  source scripts/activate.sh

_MEDISPHERE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${_MEDISPHERE_ROOT}/.venv/bin/activate" ]]; then
  # Linux, macOS, WSL
  # shellcheck source=/dev/null
  source "${_MEDISPHERE_ROOT}/.venv/bin/activate"
elif [[ -f "${_MEDISPHERE_ROOT}/.venv/Scripts/activate" ]]; then
  # Windows Git Bash / MSYS (venv created on Windows)
  # shellcheck source=/dev/null
  source "${_MEDISPHERE_ROOT}/.venv/Scripts/activate"
else
  echo "Virtual environment not found. Run:  ./scripts/setup.sh" >&2
  return 1 2>/dev/null || exit 1
fi

export PYTHONPATH="${_MEDISPHERE_ROOT}${PYTHONPATH:+:${PYTHONPATH}}"
cd "${_MEDISPHERE_ROOT}" || return 1 2>/dev/null || exit 1

unset _MEDISPHERE_ROOT
