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
# self-signed placeholders so vhosts can boot before certbot runs
# (\$ escaped: the whole remote script travels inside a double-quoted string)
for D in api.pocketsoftware.dev pocketsoftware.dev; do
  if [ ! -s "/etc/letsencrypt/live/\$D/fullchain.pem" ]; then
    sudo mkdir -p "/etc/letsencrypt/live/\$D"
    sudo openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
      -keyout "/etc/letsencrypt/live/\$D/privkey.pem" \
      -out "/etc/letsencrypt/live/\$D/fullchain.pem" -subj "/CN=\$D" 2>/dev/null
  fi
done
sudo cp /tmp/gamfix-infra-sync/nginx/gamfix-vps.conf /etc/nginx/sites-enabled/pocketbase
sudo cp /tmp/gamfix-infra-sync/nginx/snippets/*.conf /etc/nginx/snippets/
sudo rm -f /etc/nginx/snippets/gamfix-backend-certs.conf
sudo cp /tmp/gamfix-infra-sync/systemd/cert-issue.sh /opt/gamfix-src/cert-issue.sh
sudo chmod +x /opt/gamfix-src/cert-issue.sh
sudo nginx -t && sudo systemctl reload nginx
echo NGINX-SYNCED
"
