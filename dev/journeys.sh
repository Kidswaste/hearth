#!/bin/sh
# Runs the five end-to-end journeys (dev/checks/journey-*.js) one after another and prints each step's ✓ / ✖.
#   sh dev/journeys.sh [lab|video|chat|commands|upgrade ...] [--shots <dir>]
# Needs ffmpeg (test videos) and the Linux Electron at /opt/hearth-electron (see dev/smoke.js). Each journey takes
# 1–4 minutes; step pictures land in --shots (default /tmp/hearth-journeys).
set -e
cd "$(dirname "$0")/.."
SHOTS=/tmp/hearth-journeys
LIST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --shots) SHOTS="$2"; shift 2 ;;
    *) LIST="$LIST $1"; shift ;;
  esac
done
[ -z "$LIST" ] && LIST="lab video chat commands upgrade"
[ -f /tmp/hearth-test-song.wav ] || node dev/make-test-song.js /tmp/hearth-test-song.wav >/dev/null
[ -d /tmp/hearth-test-videos ] || sh dev/make-test-videos.sh /tmp/hearth-test-videos >/dev/null
for j in $LIST; do
  mkdir -p "$SHOTS/$j"
  echo "== journey: $j"
  EXTRA=""
  [ "$j" = upgrade ] && EXTRA="--data dev/fixtures/old-data"
  node dev/smoke.js --fake-engines $EXTRA --check-timeout 600000 --eval "window.JOURNEY_SHOTS='$SHOTS/$j'" \
    --lib dev/checks/journey-lib.js --script "dev/checks/journey-$j.js" --shot "$SHOTS/$j/final.png" 2>&1 \
    | grep -E '✓|✖|"ok"|misses|→ covered|OK: no page errors|problem|main:|check failed' || true
done
