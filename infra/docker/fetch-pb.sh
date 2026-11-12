#!/usr/bin/env bash
# Fetch a PocketBase release binary into infra/docker/pb-bin/pocketbase
# so the Docker image can package it.
#
# Usage:
#   ./fetch-pb.sh                 # latest GitHub release
#   ./fetch-pb.sh v0.40.6         # a specific release tag
#   ./fetch-pb.sh /path/to/binary # copy an existing (e.g. production) binary
set -euo pipefail

DEST_DIR="$(cd "$(dirname "$0")" && pwd)/pb-bin"
DEST="$DEST_DIR/pocketbase"
mkdir -p "$DEST_DIR"

ARG="${1:-latest}"

if [[ "$ARG" == latest ]]; then
  VERSION=$(curl -fsSL https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+')
elif [[ "$ARG" == */* && -f "$ARG" ]]; then
  cp "$ARG" "$DEST" && chmod +x "$DEST" && echo "Copied $ARG -> $DEST" && "$DEST" --version && exit 0
else
  VERSION="$ARG"
fi

ARCH=$(uname -m)
case "$ARCH" in
  x86_64) PB_ARCH=amd64 ;;
  aarch64 | arm64) PB_ARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

URL="https://github.com/pocketbase/pocketbase/releases/download/${VERSION}/pocketbase_${VERSION#v}_linux_${PB_ARCH}.zip"
echo "Downloading $URL"
TMP=$(mktemp -d)
curl -fsSL "$URL" -o "$TMP/pb.zip"
unzip -o -q "$TMP/pb.zip" -d "$TMP"
mv "$TMP/pocketbase" "$DEST"
chmod +x "$DEST"
rm -rf "$TMP"
"$DEST" --version
echo "OK -> $DEST"
