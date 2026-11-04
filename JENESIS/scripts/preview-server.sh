#!/usr/bin/env bash
# Runs the JENESIS server for live browser checks WITHOUT touching the
# repository's baseline genesis.db.
#
# The server migrates the database it opens, in place. Pointing it at
# JENESIS/genesis.db therefore upgrades the pristine pre-migration baseline
# that tests/auth-security.test.js needs, and every later run of the suite
# fails with confusing count mismatches. This script always hands the server a
# throwaway copy in /tmp instead.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COPY="${GENESIS_PREVIEW_DB:-/tmp/genesis-preview.db}"

rm -f "$COPY" "$COPY-wal" "$COPY-shm"
cp "$ROOT/genesis.db" "$COPY"

export GENESIS_DB_PATH="$COPY"
export GENESIS_DIST_DIR="$ROOT/dist"
echo "preview database: $COPY (a copy; JENESIS/genesis.db is not touched)"
exec node "$ROOT/server/index.js"
