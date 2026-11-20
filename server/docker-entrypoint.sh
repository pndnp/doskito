#!/bin/sh
set -eu

mkdir -p /app/data
chown node:node /app/data

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  runuser -u node -- npm run migrate
fi

exec runuser -u node -- "$@"
