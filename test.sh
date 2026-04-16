#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules/@playwright/test ]; then
	echo "==> Installing @playwright/test"
	bun add -d @playwright/test
fi

echo "==> Ensuring Chromium browser is installed"
bunx playwright install chromium

echo "==> Building app (required for wrangler dev)"
bun run build

echo "==> Running Playwright smoke tests"
bunx playwright test "$@"
