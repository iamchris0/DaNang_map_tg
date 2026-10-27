#!/bin/sh
# Print the current quick-tunnel address and, with --apply, put it into PUBLIC_APP_URL in
# .env.production and restart the services that use it. The address changes whenever the
# tunnel container restarts (e.g. after a reboot); then update the Mini App URL in @BotFather.
set -eu
cd "$(dirname "$0")/.."
ENV_FILE=.env.production
compose() {
  docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml --env-file "$ENV_FILE" "$@"
}

url=""
for _ in $(seq 1 30); do
  url=$(compose logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] && break
  sleep 2
done
if [ -z "$url" ]; then
  echo "No quick-tunnel address found (is the tunnel running? compose logs tunnel)" >&2
  exit 1
fi
echo "$url"

if [ "${1:-}" = "--apply" ]; then
  if grep -q '^PUBLIC_APP_URL=' "$ENV_FILE"; then
    sed -i "s#^PUBLIC_APP_URL=.*#PUBLIC_APP_URL=$url#" "$ENV_FILE"
  else
    echo "PUBLIC_APP_URL=$url" >> "$ENV_FILE"
  fi
  ENV_FILE="$ENV_FILE" compose up -d backend bot >/dev/null
  echo "PUBLIC_APP_URL updated; backend and bot restarted."
  echo "Now set this URL in @BotFather: /myapps → your app → Edit Web App URL."
fi
