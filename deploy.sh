#!/usr/bin/env bash
# Production deploy to the remote Cloudflare Worker + D1.
#
# Always, in order:
#   1. apply pending D1 migrations (remote)
#   2. verify the prebaked explore cache is present
#   3. build + deploy the Worker (uploads static assets too)
#
# If the underlying data changed, run:
#   DATA_CHANGED=1 ./deploy.sh
#
# That refreshes the default explore cache after migrations. UI-only deploys should
# not rebuild stats. The variants/frequencies seed remains a separate one-off task.

set -euo pipefail
cd "$(dirname "$0")"

DB=DB

echo "==> 1/3 Applying remote D1 migrations"
wrangler d1 migrations apply "$DB" --remote

if [ "${DATA_CHANGED:-0}" = "1" ]; then
	echo "==> Data changed; refreshing remote explore stats cache"
	bun run db:refresh-stats:remote
else
	echo "==> 2/3 Verifying remote explore stats cache"
	bun run db:verify-stats:remote
fi

echo "==> 3/3 Building + deploying the Worker"
bun run build
wrangler deploy

echo "==> Done. Live on data/bipmed/carigenetics/pgp-harvard.biovault.net"
