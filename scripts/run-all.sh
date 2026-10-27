#!/usr/bin/env bash
# Run unit tests, live smoke tests and health checks for every tool. Usage: scripts/run-all.sh [--no-live]
set -u
cd "$(dirname "$0")/.."
node scripts/sync-shared.mjs >/dev/null
rc=0
for t in tools/*/; do
  name=$(basename "$t")
  echo "=== $name: unit tests"; (cd "$t" && npm test --silent 2>&1 | grep -E '^# (tests|pass|fail)') || rc=1
  if [ "${1:-}" != "--no-live" ]; then
    echo "=== $name: live smoke"; (cd "$t" && out=$(node test/smoke.live.mjs); code=$?; echo "${out: -400}"; echo " exit=$code (0=pass, 2=skipped)")
    echo "=== $name: health"; (cd "$t" && node scripts/health.mjs)
  fi
done
exit $rc
