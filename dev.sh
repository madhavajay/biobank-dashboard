#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

SEED_MARKER=".wrangler/.seeded"

if [ ! -d node_modules ]; then
	echo "==> Installing dependencies"
	bun install
fi

echo "==> Building app"
bun run build

echo "==> Migrating local D1 database"
bun run db:migrate:local

if [ ! -f "$SEED_MARKER" ] || [ "${SEED:-}" = "1" ]; then
	echo "==> Seeding local D1 database"
	bun run db:seed:local
	mkdir -p "$(dirname "$SEED_MARKER")"
	touch "$SEED_MARKER"
else
	echo "==> Skipping seed (marker exists; run with SEED=1 ./dev.sh to re-seed)"
fi

echo "==> Starting Wrangler in local mode"
exec wrangler dev
