#!/usr/bin/env bash
# test -> build -> clasp push -> redeploy the existing deployment (keeps the Web App URL stable)
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOYMENT_ID="${DEPLOYMENT_ID:-$(cat .deployment-id 2>/dev/null || true)}"
if [ -z "$DEPLOYMENT_ID" ]; then
  echo "Set DEPLOYMENT_ID or write it to .deployment-id (see docs/sheet-setup.md)" >&2
  exit 1
fi

npm test
npm run build
npx clasp push --force
npx clasp deploy -i "$DEPLOYMENT_ID" -d "deploy $(date -u +%Y-%m-%dT%H:%MZ)"
