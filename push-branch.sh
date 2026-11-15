#!/usr/bin/env bash
#
# Pushes HEAD to the branch this workflow is running on. Best-effort: always
# exits 0.
#
# Three steps commit back to the branch -- the Linux test transcript, the
# screenshots of the installed applications, and the smoke-test diagnostics --
# and a build runs for half an hour, so the branch moves underneath it. A push
# from a developer, or from the other job, lands while the installer is still
# being built, and `git push` is then rejected as a non-fast-forward.
#
# Run 138 is what that costs. Every real step passed: the installer was built,
# the package was verified, the smoke test installed and signed in and closed
# and uninstalled cleanly, the portable package and checksums were written.
# Then the screenshot step could not push, failed, and the two steps guarded by
# `if: success()` -- the portable upload and the release itself -- were
# skipped. A build that had done all of its work published none of it, because
# a record of the work could not be committed.
#
# So: retry on top of the branch as it now stands, and if it still cannot be
# pushed, say so and carry on. Nothing in these three steps is part of the
# product; a missing screenshot or transcript is a gap in the record, and a
# failed release is not.
set -u

BRANCH="${GITHUB_REF_NAME:-}"
if [ -z "$BRANCH" ]; then
  echo "push-branch: GITHUB_REF_NAME is not set; nothing pushed"
  exit 0
fi

for attempt in 1 2 3 4 5 6; do
  git fetch -q origin "$BRANCH" >/dev/null 2>&1 || true

  # Rebase onto the branch. The commits we add touch screenshots/ and ci-logs/
  # only, so a conflict means another run wrote the same file; taking the
  # version already on the branch is right, and dropping ours is survivable.
  if ! git rebase -q "origin/$BRANCH" >/dev/null 2>&1; then
    if ! git rebase -q --skip >/dev/null 2>&1; then
      git rebase --abort >/dev/null 2>&1 || true
    fi
  fi

  if git push -q origin "HEAD:$BRANCH" >/dev/null 2>&1; then
    echo "push-branch: pushed to $BRANCH (attempt $attempt)"
    exit 0
  fi

  sleep $((attempt * 5))
done

echo "push-branch: could not push to $BRANCH after $attempt attempts -- continuing"
exit 0
