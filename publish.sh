#!/bin/bash
# DEV -> MAIN en mode écrasement total
# Puis dev repart propre depuis main

set -e

echo "=== Sauvegarde des modifications locales (si besoin) ==="
if [[ -n $(git status --porcelain) ]]; then
  git add .
  git commit -m "Release $(date '+%Y-%m-%d %H:%M')"
fi

echo "=== Passage sur dev ==="
git switch dev

echo "=== Push dev ==="
git push origin dev

echo "=== main = copie exacte de dev ==="
git push origin dev:main --force

echo "=== Recalage de dev sur main (nouveau cycle propre) ==="
git fetch origin
git reset --hard origin/main
git push origin dev --force

echo "=== OK ==="
echo "main et dev sont identiques. Nouveau cycle prêt."