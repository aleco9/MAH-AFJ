#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob
cd "$(dirname "$0")/.."
NODE_BINARY="${SDD_NODE_BINARY:-$HOME/.nvm/versions/node/v24.15.0/bin/node}"
"$NODE_BINARY" -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
for f in src/*.cjs scripts/*.cjs web/*.js; do "$NODE_BINARY" --check "$f"; done
exec "$NODE_BINARY" scripts/quality/run.cjs
