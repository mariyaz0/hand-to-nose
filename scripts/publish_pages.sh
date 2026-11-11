#!/usr/bin/env bash
# Publish web/ to the gh-pages branch (GitHub Pages serves it at
# https://mariyaz0.github.io/hand-to-nose/). Tests are not published.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
src_rev=$(git rev-parse --short HEAD)
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true' EXIT

git fetch -q origin gh-pages 2>/dev/null || true
if git show-ref -q --verify refs/remotes/origin/gh-pages; then
  git worktree add -q -B gh-pages "$tmp" origin/gh-pages
else
  git worktree add -q --detach "$tmp"
  git -C "$tmp" checkout -q --orphan gh-pages
fi
git -C "$tmp" rm -rq --ignore-unmatch . >/dev/null
rsync -a --exclude tests web/ "$tmp"/
touch "$tmp/.nojekyll"
git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
  echo "Nothing to publish."
  exit 0
fi
git -C "$tmp" commit -q -m "Publish web app from main@${src_rev}"
git -C "$tmp" push -q origin gh-pages
echo "Published main@${src_rev} to gh-pages."
