#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$STARISLE_ROOT"
exec npm --cache "$STARISLE_ROOT/.tools/npm-cache" "$@"
