#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

PG_SEED_MARKER=".postgres/.seeded"
MODE="${MODE:-worker}"
PORT="${PORT:-8787}"
LOCAL_DATABASE_URL="postgresql://biovault_data_user:biovault_data_password@127.0.0.1:55432/biovault_data?sslmode=disable"

if [ -z "${DATABASE_URL:-}" ]; then
	if [ -f .env ] && grep -Eq '^[[:space:]]*DATABASE_URL=' .env; then
		DATABASE_URL="$(sed -n -E 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' .env | tail -n 1)"
		DATABASE_URL="${DATABASE_URL%\"}"
		DATABASE_URL="${DATABASE_URL#\"}"
		DATABASE_URL="${DATABASE_URL%\'}"
		DATABASE_URL="${DATABASE_URL#\'}"
	else
		DATABASE_URL="$LOCAL_DATABASE_URL"
	fi
	export DATABASE_URL
fi

export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="${CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:-$DATABASE_URL}"
export CLOUDFLARE_INCLUDE_PROCESS_ENV="${CLOUDFLARE_INCLUDE_PROCESS_ENV:-true}"

if [ ! -d node_modules ]; then
	echo "==> Installing dependencies"
	bun install
fi

echo "==> Starting local PostgreSQL"
docker compose up -d biovault-postgres
echo "==> Waiting for local PostgreSQL"
for _ in $(seq 1 60); do
	if docker compose exec -T biovault-postgres pg_isready -U biovault_data_user -d biovault_data >/dev/null 2>&1; then
		break
	fi
	sleep 1
done
if ! docker compose exec -T biovault-postgres pg_isready -U biovault_data_user -d biovault_data >/dev/null 2>&1; then
	echo "PostgreSQL did not become ready in time" >&2
	exit 1
fi

if [ ! -f "$PG_SEED_MARKER" ] || [ "${SEED:-}" = "1" ]; then
	echo "==> Seeding local PostgreSQL"
	bun run db:pg:seed
	mkdir -p "$(dirname "$PG_SEED_MARKER")"
	touch "$PG_SEED_MARKER"
else
	echo "==> Skipping PostgreSQL seed (marker exists; run with SEED=1 ./dev.sh to re-seed)"
fi

case "$MODE" in
	vite|hmr)
		if [ "$MODE" = "hmr" ]; then
			export VITE_HMR=1
			export VITE_HMR_PORT="$PORT"
			echo "==> Starting Vite dev server with HMR on http://localhost:${PORT}"
		else
			export VITE_HMR=0
			echo "==> Starting Vite dev server without HMR on http://localhost:${PORT}"
		fi
		echo "==> Cloudflare bindings are provided by adapter-cloudflare's local platform proxy"
		exec npm run dev -- --host 0.0.0.0 --port "$PORT" --strictPort
		;;
	wrangler|worker)
		echo "==> Building Worker bundle"
		bun run build
		echo "==> Starting Wrangler in local Worker mode on http://localhost:${PORT}"
		echo "==> HMR is disabled in this mode; use MODE=vite ./dev.sh for frontend hot reload"
		exec bunx wrangler dev --port "$PORT"
		;;
	*)
		echo "Unknown MODE=$MODE. Use MODE=vite or MODE=wrangler." >&2
		exit 1
		;;
esac
