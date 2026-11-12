#!/usr/bin/env bash
# Deploy the combined GamFix site to Cloudflare Pages (project: gamfix).
# Production layout: landing at /, citizen app routes (/login /report ...)
# rewritten to the app bundle via _redirects.
#
# Expects a deploy dir laid out per docs/DEPLOY.md section 4 (pass it as $1,
# default ./pages-deploy). Requires CLOUDFLARE_API_TOKEN (Pages Edit) and
# CLOUDFLARE_ACCOUNT_ID env vars.
set -euo pipefail

DIST_DIR="${1:-./pages-deploy}"
PROJECT="${PROJECT:-gamfix}"
BRANCH="${BRANCH:-main}"

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (needs Cloudflare Pages Edit)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"

# wrangler v4.160+ requires an account-listing token scope; v3 works with CLOUDFLARE_ACCOUNT_ID.
npx --yes wrangler@3 pages deploy "$DIST_DIR" \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-dirty=true

echo "--- verification ---"
sleep 5
for p in / /login /track /signup /report; do
  printf "%-10s " "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://gamfix.pocketsoftware.dev$p"
done
