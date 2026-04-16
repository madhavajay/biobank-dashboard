#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing dependencies"
bun install

echo "==> Building app"
bun run build

echo "==> Migrating local D1 database"
bun run db:migrate:local

echo "==> Seeding local D1 database"
bun run db:seed:local

echo "==> Starting Wrangler in local mode"
wrangler dev