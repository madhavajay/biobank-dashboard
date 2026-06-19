#!/usr/bin/env bash
# Preview deploy: separate Worker on *.workers.dev, prod data via Hyperdrive.
# Does not attach biovault.net custom domains (production stays on ./deploy.sh).

set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building + deploying preview Worker (bipmed-biobank-preview)"
bun run build
bunx wrangler deploy --env preview

echo "==> Done. Open the workers.dev URL from the output above."
echo "    Tenant portals need ?tenant=, e.g. ?tenant=bipmed or ?tenant=carigenetics"
