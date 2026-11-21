#!/usr/bin/env bash
# Démarre un serveur KnowList jetable pour les tests de bout en bout.
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${E2E_DATA_DIR:-$(pwd)/test-results/e2e-data}"
rm -rf "$DATA" && mkdir -p "$DATA"
export KNOWLIST_DATA_DIR="$DATA" PORT="${E2E_PORT:-3998}" LOG_LEVEL=warn
node server/dist/cli.js create-admin admin --name "Admin E2E" </dev/null | sed -n 's/.*temporaire : //p' > "$DATA/admin-password.txt"
exec node server/dist/server.js
