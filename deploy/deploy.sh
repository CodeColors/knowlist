#!/usr/bin/env bash
# Déploiement continu : construit l'image, sauvegarde, redémarre (migrations automatiques au démarrage), vérifie.
#   ./deploy/deploy.sh [révision git]   (par défaut : origin/main)
set -euo pipefail
cd "$(dirname "$0")/.."
REV="${1:-origin/main}"

git fetch --quiet origin
git checkout --quiet --detach "$REV"
TAG="$(git rev-parse --short HEAD)"
PREV="$(cat .deployed-tag 2>/dev/null || echo latest)"

echo "→ Construction de l'image knowlist:$TAG"
docker build -t "knowlist:$TAG" .

if docker compose ps --status running app >/dev/null 2>&1 && [ -n "$(docker compose ps -q app)" ]; then
  echo "→ Sauvegarde avant mise à jour"
  docker compose exec -T app node server/dist/cli.js backup
fi

echo "→ Redémarrage (Caddy met les requêtes en attente pendant la bascule)"
KNOWLIST_TAG="$TAG" docker compose up -d --no-build app
KNOWLIST_TAG="$TAG" docker compose up -d caddy

echo "→ Vérification de santé"
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "$PREV" > .previous-tag
    echo "$TAG" > .deployed-tag
    echo "✔ Déployé : knowlist:$TAG (précédent : $PREV). Retour arrière : ./deploy/rollback.sh"
    exit 0
  fi
  sleep 2
done
echo "✖ L'application ne répond pas : retour arrière automatique vers $PREV"
KNOWLIST_TAG="$PREV" docker compose up -d --no-build app
exit 1
