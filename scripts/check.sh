#!/bin/sh
set -eu

COMPOSE="docker compose -f compose.yaml -f compose.dev.yaml"

# Lint, format check, typecheck и production build в dev-контейнерах.
# Тесты (unit/integration, Playwright E2E) запускаются на хосте: npm run test / npm run test:e2e.
$COMPOSE build --target development server client
$COMPOSE run --rm --no-deps server sh -c "npm run lint && npm run format:check && npm run typecheck && npm run build"
$COMPOSE run --rm --no-deps client sh -c "npm run lint && npm run format:check && npm run typecheck && npm run build"
$COMPOSE down --remove-orphans
$COMPOSE up -d --build --wait server client
