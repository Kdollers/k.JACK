#!/usr/bin/env bash
# Restores the parts of the workspace the sandbox snapshot does not keep.
#   * .git is reset to a bare clone on every turn  -> re-attach to the branch
#   * node_modules, build/ and dist/ are excluded  -> reinstall / restore
# Nothing here is committed; node_modules is git-ignored.
set -e
cd /home/user/k.JACK

git fetch origin arena/a2c625e8-k-jack >/dev/null 2>&1 || true
git reset --mixed origin/arena/a2c625e8-k-jack >/dev/null
git checkout -- JENESIS/build JENESIS/dist 2>/dev/null || true
echo "HEAD: $(git rev-parse --short HEAD)"

if [ ! -d JENESIS/node_modules ]; then
  (cd JENESIS && npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1)
  echo "node_modules installed"
fi

# better-sqlite3 cannot be compiled here; the tests run on Node's built-in
# node:sqlite through this shim. Test-only, git-ignored, never packaged.
if ! grep -q "SANDBOX ONLY" JENESIS/node_modules/better-sqlite3/lib/index.js 2>/dev/null; then
  bash "$(dirname "$0")/make-sqlite-shim.sh"
fi
echo "restore complete"
