#!/usr/bin/env bash
# Source this file to use the optional project-local toolchains.
STARISLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -x "$STARISLE_ROOT/.tools/node/bin/node" ]]; then
  export PATH="$STARISLE_ROOT/.tools/node/bin:$PATH"
fi
if [[ -x "$STARISLE_ROOT/.tools/java/bin/java" ]]; then
  export JAVA_HOME="$STARISLE_ROOT/.tools/java"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
export MAVEN_USER_HOME="$STARISLE_ROOT/.tools/m2"
