#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
if [[ -f "$STARISLE_ROOT/.env" ]]; then
  set -a
  source "$STARISLE_ROOT/.env"
  set +a
fi
export STARISLE_PRODUCT_IMAGE_DIR="${STARISLE_PRODUCT_IMAGE_DIR:-$STARISLE_ROOT/.tools/spring-uploads}"
export STARISLE_PRODUCT_VIDEO_DIR="${STARISLE_PRODUCT_VIDEO_DIR:-$STARISLE_ROOT/.tools/spring-videos}"
cd "$STARISLE_ROOT/backend"
exec ./mvnw "-Dmaven.repo.local=$MAVEN_USER_HOME/repository" "$@"
