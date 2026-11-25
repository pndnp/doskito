#!/bin/sh
set -eu

mkdir -p /app/data
chown node:node /app/data

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  runuser -u node -- npm run migrate
  runuser -u node -- node -e 'const { PrismaClient } = require("@prisma/client"); const prisma = new PrismaClient(); prisma.board.findFirst().then(() => prisma.$disconnect()).catch((error) => { console.error("Database schema check failed", error); process.exit(1); });'
fi

exec runuser -u node -- "$@"
