#!/usr/bin/env bash
# Full production deploy to the remote (live) Cloudflare Worker + D1.
#
# Always, in order:
#   1. apply pending D1 migrations (remote)
#   2. re-seed DB-resident static data (genes) from the local D1
#   3. re-generate the prebaked stats/explore cache (incl. gene annotations) and load it
#   4. build + deploy the Worker (uploads static assets too)
#
# Static data (genes) and the cache are generated from the LOCAL D1, which must be
# fully seeded first (./dev.sh, or SEED=1 ./dev.sh to force a reseed). The remote
# carries CariGenetics + BIPMed only, so the global cache is scoped to those biobanks
# inside bake-stats-remote-sql.ts. All loads are idempotent (DELETE + INSERT).
#
# NOTE: this does NOT re-seed the multi-million-row variants/frequencies tables — that
# is a one-off (bun run db:seed:remote). This script is for routine deploys.

set -euo pipefail
cd "$(dirname "$0")"

DB=DB

echo "==> 1/4 Applying remote D1 migrations"
wrangler d1 migrations apply "$DB" --remote

echo "==> 2/4 Re-seeding DB static data (genes) from local"
bun scripts/dump-genes-remote-sql.ts
wrangler d1 execute "$DB" --remote --file data/genes-remote.sql

echo "==> 3/4 Re-generating + loading the prebaked stats/explore cache"
bun scripts/bake-stats-remote-sql.ts
wrangler d1 execute "$DB" --remote --file data/stats-remote.sql

echo "==> 4/4 Building + deploying the Worker"
bun run build
wrangler deploy

echo "==> Done. Live on data/bipmed/carigenetics/pgp-harvard.biovault.net"
