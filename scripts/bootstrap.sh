#!/usr/bin/env bash
# Optional portable toolchains for Linux x86_64 / WSL2. No system changes.
set -euo pipefail
STARISLE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Install Node.js 22.23.4 and JDK 21 for your OS, then use scripts/env.sh.' >&2
  exit 1
fi
mkdir -p "$STARISLE_ROOT/.tools"
STARISLE_TEMP="$(mktemp -d)"
trap 'rm -rf "$STARISLE_TEMP"' EXIT

install_tool() {
  local name="$1" url="$2" sha="$3" destination="$STARISLE_ROOT/.tools/$1"
  if [[ -d "$destination" ]]; then
    echo "$name already installed at $destination"
    return
  fi
  curl --fail --location --retry 2 --connect-timeout 15 --max-time 600 "$url" -o "$STARISLE_TEMP/archive"
  printf '%s  %s\n' "$sha" "$STARISLE_TEMP/archive" | sha256sum --check --status
  mkdir "$STARISLE_TEMP/$name"
  tar -xf "$STARISLE_TEMP/archive" -C "$STARISLE_TEMP/$name" --strip-components=1
  mv "$STARISLE_TEMP/$name" "$destination"
}

install_tool node \
  'https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz' \
  '1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce'
install_tool java \
  'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.13_9.tar.gz' \
  'd7f5d5cf865a2902b70ff549b97586a7d3f234e016f041ab447ea740c7d66d1c'
source "$STARISLE_ROOT/scripts/env.sh"
node --version
java -version
