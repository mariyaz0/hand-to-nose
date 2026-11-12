#!/usr/bin/env bash
# Publish web/ to the gh-pages branch (GitHub Pages serves it at
# https://mariyaz0.github.io/hand-to-nose/). Tests are not published.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
src_rev=$(git rev-parse --short HEAD)
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true' EXIT

git fetch -q origin +gh-pages:refs/remotes/origin/gh-pages 2>/dev/null || true
if git show-ref -q --verify refs/remotes/origin/gh-pages; then
  git worktree add -q -B gh-pages "$tmp" origin/gh-pages
else
  git worktree add -q --detach "$tmp"
  git -C "$tmp" checkout -q --orphan gh-pages
fi
git -C "$tmp" rm -rqf --ignore-unmatch . >/dev/null
git -C "$tmp" clean -fdxq
(cd web && tar --exclude=./tests -cf - .) | (cd "$tmp" && tar -xf -)
# Version tag on every CSS/JS address: a phone that cached an older file must not
# combine it with the new page (D-38). The source in web/ stays without tags.
sed -i -E "s#(href=\"css/[^\"?]+\.css)\"#\1?v=${src_rev}\"#g; s#(src=\"js/[^\"?]+\.js)\"#\1?v=${src_rev}\"#g" "$tmp/index.html"
sed -i -E "s#(from '\./[^'?]+\.js)'#\1?v=${src_rev}'#g" "$tmp"/js/*.js
if grep -qE "(href=\"css/[^\"?]+\.css\"|src=\"js/[^\"?]+\.js\")" "$tmp/index.html" \
   || grep -qE "from '\./[^'?]+\.js'" "$tmp"/js/*.js; then
  echo "Version tag missing on some CSS/JS address." >&2
  exit 1
fi
touch "$tmp/.nojekyll"
git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
  echo "Nothing to publish."
  exit 0
fi
git -C "$tmp" commit -q -m "Publish web app from main@${src_rev}"
git -C "$tmp" push -q origin gh-pages
echo "Published main@${src_rev} to gh-pages."
