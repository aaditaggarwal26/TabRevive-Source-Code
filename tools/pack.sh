#!/bin/sh
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./extension/manifest.json').version")
mkdir -p dist
out="dist/tabrevive-$version.zip"
rm -f "$out"
(cd extension && zip -qr -X "../$out" . -x '.*' -x '*/.*')
echo "$out"
