#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
QUALITY_NODE="${SDD_NODE_BINARY:-$HOME/.nvm/versions/node/v24.15.0/bin/node}"
if [ ! -x "$QUALITY_NODE" ]; then QUALITY_NODE="$(command -v node)"; fi
"$QUALITY_NODE" -e "if(Number(process.versions.node.split('.')[0])<24){console.error('QUALITY_REQUIRES_NODE_24');process.exit(1)}"
case "${1:-}" in
 --fast) shift; exec "$QUALITY_NODE" scripts/quality/fast.cjs "$@" ;;
 --review-reference) shift; exec "$QUALITY_NODE" scripts/quality/promote.cjs "$@" ;;
 --eval-prepare) shift; exec "$QUALITY_NODE" evals/prepare.cjs "$@" ;;
 --eval-grade) shift; exec "$QUALITY_NODE" evals/grade.cjs "$@" ;;
 --baseline) shift; exec "$QUALITY_NODE" scripts/quality/baseline.cjs "$@" ;;
 --unit) shift; exec "$QUALITY_NODE" --test --test-concurrency=1 --test-reporter=tap test/*-unit.test.cjs test/date-policy.test.cjs "$@" ;;
 *) exec "$QUALITY_NODE" scripts/quality/run.cjs "$@" ;;
esac
