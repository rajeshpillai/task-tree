#!/usr/bin/env bash
# Build the vendored zen-ui into the dist the app compiles against.
#
# zen-ui is a submodule (vendor/zen-ui) pinned to a commit on its dev branch.
# Its dist/ is gitignored upstream, so a fresh clone has source but no build
# output, and the Vite alias points straight at that output. Hence this script.
#
#   npm run zen              build the pinned commit
#   npm run zen -- --update  fast-forward to origin/dev first, then build
#
# --update moves the pin. Commit vendor/zen-ui afterwards or the change is
# yours alone: everyone else still builds the old commit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

UPDATE=0
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    -h|--help)
      echo "usage: npm run zen [-- --update]"
      echo "  --update   fast-forward vendor/zen-ui to origin/dev before building"
      exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

SUB="$ROOT/vendor/zen-ui"

# An uninitialised submodule is an empty directory, not an error, so check for
# the source rather than the path.
if [ ! -f "$SUB/packages/react/package.json" ]; then
  echo "vendor/zen-ui is empty; initialising submodule..."
  git submodule update --init --recursive vendor/zen-ui
fi

if [ "$UPDATE" = "1" ]; then
  echo "fetching origin/dev..."
  git -C "$SUB" fetch origin dev
  git -C "$SUB" checkout dev
  git -C "$SUB" merge --ff-only origin/dev
fi

echo "zen-ui at $(git -C "$SUB" rev-parse --short HEAD) on $(git -C "$SUB" rev-parse --abbrev-ref HEAD)"

( cd "$SUB" && bun install && bun run build:lib )

# The Vite alias and the tsconfig path resolve these four by name. A build that
# exits 0 but leaves one missing fails later as an opaque import error, so
# check here where the cause is still obvious.
DIST="$SUB/packages/react/dist"
for f in index.js index.d.ts style.css preflight.css; do
  if [ ! -f "$DIST/$f" ]; then
    echo "error: build finished but $DIST/$f is missing" >&2
    exit 1
  fi
done

echo "zen-ui react dist ready at $DIST"
