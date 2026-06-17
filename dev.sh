#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

SEED_MARKER=".wrangler/.seeded"
MODE="${MODE:-remote}"
PORT="${PORT:-8787}"
REMOTE=0

case "$MODE" in
	remote|wrangler-remote)
		REMOTE=1
		;;
esac

if [ ! -d node_modules ]; then
	echo "==> Installing dependencies"
	bun install
fi

if [ "$REMOTE" = "0" ]; then
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
else
	echo "==> Using remote Cloudflare bindings; skipping local migrate/seed"
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
		exec bunx wrangler dev --port "$PORT"
		;;
	remote|wrangler-remote)
		echo "==> Starting Wrangler with remote Cloudflare bindings on http://localhost:${PORT}"
		echo "==> This uses production D1 data; avoid write/test seed operations unless intentional"
		exec bunx wrangler dev --remote --port "$PORT"
		;;
	*)
		echo "Unknown MODE=$MODE. Use MODE=vite, MODE=wrangler, or MODE=remote." >&2
		exit 1
		;;
esac
