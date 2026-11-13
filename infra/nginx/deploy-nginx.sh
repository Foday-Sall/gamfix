#!/bin/bash
# Sync the GamFix nginx/infra files to the VPS and reload nginx.
# Run from the sandbox:  bash /home/z/my-project/gamfix-SL/infra/nginx/deploy-nginx.sh
# Files pushed:
#   infra/nginx/gamfix-vps.conf   -> /etc/nginx/sites-enabled/pocketbase
#   infra/nginx/snippets/*.conf   -> /etc/nginx/snippets/
#   infra/systemd/cert-issue.sh   -> /opt/gamfix-src/cert-issue.sh
set -eu

REPO=/home/z/my-project/gamfix-SL
TAR=/tmp/gamfix-infra-sync.tar.gz

tar czf "$TAR" -C "$REPO" infra/nginx/gamfix-vps.conf infra/nginx/snippets infra/systemd/cert-issue.sh
python3 /home/z/my-project/scripts/ssh_put.py "$TAR" /tmp/gamfix-infra-sync.tar.gz
python3 /home/z/my-project/scripts/ssh_run.py "
set -e
sudo mkdir -p /tmp/gamfix-infra-sync
sudo tar xzf /tmp/gamfix-infra-sync.tar.gz -C /tmp/gamfix-infra-sync --strip-components=1
# self-signed placeholders for any missing cert are created by cert-issue.sh
# itself (real files only — never through certbot symlinks); run it after the
# configs are in place, then validate and reload
sudo cp /tmp/gamfix-infra-sync/nginx/gamfix-vps.conf /etc/nginx/sites-enabled/pocketbase
sudo cp /tmp/gamfix-infra-sync/nginx/snippets/*.conf /etc/nginx/snippets/
# retired vhosts/domains: backend (old Worker domain) + bare pocketsoftware.dev
sudo rm -f /etc/nginx/snippets/gamfix-backend-certs.conf
sudo rm -f /etc/nginx/snippets/gamfix-root-certs.conf
sudo rm -rf /etc/letsencrypt/live/pocketsoftware.dev
sudo cp /tmp/gamfix-infra-sync/systemd/cert-issue.sh /opt/gamfix-src/cert-issue.sh
sudo chmod +x /opt/gamfix-src/cert-issue.sh
# placeholders/certs must exist BEFORE nginx -t (vhosts reference the paths)
sudo /opt/gamfix-src/cert-issue.sh || true
sudo nginx -t && sudo systemctl reload nginx && echo NGINX-SYNCED
"
