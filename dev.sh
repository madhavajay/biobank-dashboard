#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

SEED_MARKER=".wrangler/.seeded"
MODE="${MODE:-vite}"
PORT="${PORT:-8787}"

if [ ! -d node_modules ]; then
	echo "==> Installing dependencies"
	bun install
fi

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

case "$MODE" in
	vite|hmr)
		echo "==> Starting Vite dev server with HMR on http://localhost:${PORT}"
		echo "==> Cloudflare bindings are provided by adapter-cloudflare's local platform proxy"
		exec bun run dev -- --host 0.0.0.0 --port "$PORT" --strictPort
		;;
	wrangler|worker)
		echo "==> Starting Wrangler in local Worker mode on http://localhost:${PORT}"
		echo "==> HMR is limited in this mode; use MODE=vite ./dev.sh for frontend hot reload"
		exec wrangler dev --port "$PORT"
		;;
	*)
		echo "Unknown MODE=$MODE. Use MODE=vite or MODE=wrangler." >&2
		exit 1
		;;
esac
