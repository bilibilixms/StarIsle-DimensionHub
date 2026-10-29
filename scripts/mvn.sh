#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
if [[ -f "$STARISLE_ROOT/.env" ]]; then
  set -a
  source "$STARISLE_ROOT/.env"
  set +a
fi
cd "$STARISLE_ROOT/backend"
exec ./mvnw "-Dmaven.repo.local=$MAVEN_USER_HOME/repository" "$@"
