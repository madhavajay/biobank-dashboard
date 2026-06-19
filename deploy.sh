#!/usr/bin/env bash
# Production deploy to the Cloudflare Worker. Data lives in PostgreSQL and is
# accessed through the Hyperdrive binding in wrangler.jsonc.

set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building + deploying the Worker"
bun run build
bunx wrangler deploy

echo "==> Done. Live on data/bipmed/carigenetics/pgp-harvard/1kgp.biovault.net"
