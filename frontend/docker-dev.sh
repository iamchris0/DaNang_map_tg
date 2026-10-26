#!/bin/sh
# Dev container entrypoint. node_modules lives in a named volume (so host and container
# installs don't clash); reinstall it whenever package-lock.json changes.
set -e
hash=$(md5sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$hash" ]; then
  npm ci
  echo "$hash" > node_modules/.lock-hash
fi
exec npm run dev -- --host 0.0.0.0
