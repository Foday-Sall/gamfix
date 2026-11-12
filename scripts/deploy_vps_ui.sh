#!/usr/bin/env bash
# Deploy GamFix to the production VPS (bare-metal layout, not Docker):
#   - citizen app   -> /opt/gamfix-pocket/app
#   - landing       -> /opt/gamfix-pocket/landing
#   - dashboard     -> /opt/gamfix-pocket/dash   (dist snapshot, no build)
#   - PB hooks + migrations -> /opt/pocketbase/pb_hooks + pb_migrations, restart PB
#
# Run ON the VPS with the repo checked out at ~/gamfix-SL
# (or rsync the repo there first).
#
# Usage: ./scripts/deploy_vps_ui.sh [citizen|landing|dashboard|server|all]
set -euo pipefail

VPS_DIR="/opt/gamfix-pocket"
PB_DIR="/opt/pocketbase"
SUDO="sudo -n"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

build() {  # build <app-dir>
  npm ci --prefix "$REPO/$1"
  npm run build --prefix "$REPO/$1"
}

deploy_citizen() {
  build apps/citizen
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  $SUDO cp -a "$VPS_DIR/app" "$VPS_DIR/app.backup-$STAMP"
  $SUDO rsync -a --delete "$REPO/apps/citizen/dist/" "$VPS_DIR/app/"
  echo "citizen app deployed (backup: app.backup-$STAMP)"
}

deploy_landing() {
  build apps/landing
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  $SUDO cp -a "$VPS_DIR/landing" "$VPS_DIR/landing.backup-$STAMP"
  $SUDO rsync -a --delete "$REPO/apps/landing/dist/" "$VPS_DIR/landing/"
  echo "landing deployed (backup: landing.backup-$STAMP)"
}

deploy_dashboard() {
  # Dashboard source is lost; apps/dashboard is the exact production dist.
  $SUDO rsync -a --delete "$REPO/apps/dashboard/" "$VPS_DIR/dash/"
  echo "dashboard deployed (dist snapshot, no build)"
}

deploy_server() {
  for f in "$REPO"/backend/pb_hooks/*.pb.js; do
    $SUDO install -o pocketbase -g pocketbase -m 640 "$f" "$PB_DIR/pb_hooks/$(basename "$f")"
  done
  for f in "$REPO"/backend/pb_migrations/*.js; do
    $SUDO install -o pocketbase -g pocketbase -m 640 "$f" "$PB_DIR/pb_migrations/$(basename "$f")"
  done
  $SUDO systemctl restart pocketbase
  sleep 2
  echo "--- smoke test ---"
  curl -s -o /dev/null -w "PB health: %{http_code}\n" http://127.0.0.1:8090/api/health
  echo "--- recent logs ---"
  $SUDO journalctl -u pocketbase --since "1 min ago" --no-pager | tail -20
}

case "${1:-all}" in
  citizen)   deploy_citizen ;;
  landing)   deploy_landing ;;
  dashboard) deploy_dashboard ;;
  server)    deploy_server ;;
  all)       deploy_citizen; deploy_landing; deploy_dashboard; deploy_server ;;
  *) echo "usage: $0 [citizen|landing|dashboard|server|all]"; exit 2 ;;
esac

echo "Done."
