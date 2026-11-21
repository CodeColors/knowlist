#!/usr/bin/env bash
# Retour arrière en une commande vers l'image précédente.
#   ./deploy/rollback.sh               → code précédent, données conservées
#   ./deploy/rollback.sh --with-data   → restaure aussi la sauvegarde faite juste avant le dernier déploiement
set -euo pipefail
cd "$(dirname "$0")/.."
PREV="$(cat .previous-tag 2>/dev/null || true)"
[ -n "$PREV" ] || { echo "Aucune version précédente connue."; exit 1; }
if [ "${1:-}" = "--with-data" ]; then
  LAST="$(ls -1t data/backups/knowlist-*.tar.gz | head -n1)"
  echo "→ Restauration des données depuis $LAST"
  docker compose stop app
  KNOWLIST_TAG="$PREV" docker compose run --rm --no-deps app node server/dist/cli.js restore "/data/backups/$(basename "$LAST")"
fi
KNOWLIST_TAG="$PREV" docker compose up -d --no-build app
cp .deployed-tag .previous-tag 2>/dev/null || true
echo "$PREV" > .deployed-tag
echo "✔ Revenu à knowlist:$PREV"
