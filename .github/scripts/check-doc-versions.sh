#!/usr/bin/env bash
# Fails if README.md / docs/03-development/project-structure.md cite a Node or Next.js major
# version that no longer matches frontend/package.json. Run from repo root.
set -euo pipefail

cd "$(dirname "$0")/../.."

node_major=$(grep -oE '"node": *"[0-9]+' frontend/package.json | grep -oE '[0-9]+$')
next_major=$(grep -oE '"next": *"\^?[0-9]+' frontend/package.json | grep -oE '[0-9]+$')

fail=0

if ! grep -qE "Node\.js ${node_major}\.x" README.md; then
    echo "README.md doesn't mention Node.js ${node_major}.x — frontend/package.json now pins that major. Update README.md's Node.js line."
    fail=1
fi

if ! grep -qE "Next\.js ${next_major}" docs/03-development/project-structure.md; then
    echo "docs/03-development/project-structure.md doesn't mention Next.js ${next_major} — frontend/package.json now pins that major. Update the Framework row."
    fail=1
fi

if [ "$fail" -eq 0 ]; then
    echo "README.md and docs/03-development/project-structure.md are in sync with Node ${node_major}.x / Next.js ${next_major}."
fi

exit "$fail"
