#!/usr/bin/env bash
# Writes the Homebrew cask for a release from packaging/homebrew/nara.rb.
#
#   scripts/update-cask.sh <version> <folder with the two .dmg files> <cask to write>
set -euo pipefail

version="$1"
dmgs="$2"
out="$3"
template="$(dirname "$0")/../packaging/homebrew/nara.rb"

sum() {
  local file="$dmgs/nara-$version-$1.dmg"
  [ -f "$file" ] || { echo "missing $file" >&2; exit 1; }
  if command -v sha256sum >/dev/null; then sha256sum "$file"; else shasum -a 256 "$file"; fi | cut -d' ' -f1
}

sed -e "s/{{VERSION}}/$version/" \
    -e "s/{{SHA256_ARM64}}/$(sum arm64)/" \
    -e "s/{{SHA256_X64}}/$(sum x64)/" \
    "$template" > "$out"
echo "wrote $out for $version"
