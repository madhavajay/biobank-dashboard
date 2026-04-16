#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing dependencies"
bun install

echo "==> Applying remote D1 migrations"
bun run db:migrate:remote

echo "==> Seeding remote D1 database"
bun run db:seed:remote

echo "==> Deploying Worker"
exec bun run deploy
