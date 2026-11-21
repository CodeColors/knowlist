#!/usr/bin/env bash
# Copie chiffrée hors du VPS de la dernière sauvegarde (à lancer chaque nuit par cron, après la sauvegarde).
# Chiffrement « age » avec une clé PUBLIQUE : le VPS ne peut pas déchiffrer les copies (clé privée gardée ailleurs).
# Variables : AGE_RECIPIENT (clé publique age1…), RCLONE_REMOTE (ex. « s3:mon-bucket/knowlist »), KEEP_DAYS (défaut 60)
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AGE_RECIPIENT:?clé publique age manquante}"
: "${RCLONE_REMOTE:?destination rclone manquante}"
LAST="$(ls -1t data/backups/knowlist-*.tar.gz 2>/dev/null | head -n1)"
[ -n "$LAST" ] || { echo "Aucune sauvegarde locale."; exit 1; }
OUT="/tmp/$(basename "$LAST").age"
age -r "$AGE_RECIPIENT" -o "$OUT" "$LAST"
rclone copy "$OUT" "$RCLONE_REMOTE/"
rclone delete --min-age "${KEEP_DAYS:-60}d" "$RCLONE_REMOTE/"
rm -f "$OUT"
echo "✔ Copie chiffrée envoyée : $(basename "$OUT")"
