#!/bin/sh
set -e

# Apply pending migrations before serving. Single-instance MVP deployment makes this safe;
# set RUN_MIGRATIONS=false to manage migrations separately.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  alembic upgrade head
fi

exec "$@"
