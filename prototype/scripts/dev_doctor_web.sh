#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}/apps/doctor-web"

if [[ ! -d node_modules ]] || [[ ! -d node_modules/picomatch ]]; then
  echo "Installing doctor-web dependencies…"
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm install
fi

npm run dev
