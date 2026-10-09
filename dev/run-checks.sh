#!/bin/sh
# Runs dev checks by group or name with their fixtures and flags (see dev/run-checks.js for the details).
#   sh dev/run-checks.sh [qa|board|editor|capture|journeys|chat|lab|video|nodes|smooth|astra|unit|all|<check>…] [--out dir] [--list]
cd "$(dirname "$0")/.." && exec node dev/run-checks.js "$@"
