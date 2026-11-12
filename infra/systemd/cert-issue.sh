#!/bin/bash
# Issue/refresh the Let's Encrypt certs for the pocketsoftware.dev hosts and
# point the nginx cert snippets at them. Safe to run repeatedly: it exits 0
# quickly once both certs exist. A pocketsoftware.dev host can only validate
# once its DNS record points directly at this VPS (grey cloud), so a systemd
# timer (gamfix-cert-issue.timer) reruns this every 10 minutes; when both
# certs are in place it disables itself.
# backend.pocketsoftware.dev was retired 2026-11-12 (was a Cloudflare Workers
# custom domain); api.pocketsoftware.dev replaced it as the API alias.
set -u

WEBROOT=/var/www/certbot
SNIP=/etc/nginx/snippets
MARK=/opt/gamfix-src
OK=0

issued() { [ -f "$MARK/.cert-issued-$1" ]; }

issue() { # $1 = domain
    # nginx boots on self-signed placeholders at the LE path until now; the
    # running master holds the fds, so removing them is safe (we reload after)
    sudo rm -f "/etc/letsencrypt/live/$1/fullchain.pem" "/etc/letsencrypt/live/$1/privkey.pem"
    certbot certonly --webroot -w "$WEBROOT" -d "$1" \
        --non-interactive --agree-tos --keep-until-expiring \
        -m admin@pocketsoftware.dev \
        --deploy-hook "systemctl reload nginx" >"/tmp/certbot-$1.log" 2>&1
    if [ -f "/etc/letsencrypt/live/$1/fullchain.pem" ] && \
       openssl x509 -in "/etc/letsencrypt/live/$1/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt"; then
        touch "$MARK/.cert-issued-$1"
        return 0
    fi
    # issuance failed (DNS still proxied by Cloudflare, most likely): put the
    # self-signed placeholder back so nginx stays reloadable, and try later
    if [ ! -s "/etc/letsencrypt/live/$1/fullchain.pem" ]; then
        sudo openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
            -keyout "/etc/letsencrypt/live/$1/privkey.pem" \
            -out "/etc/letsencrypt/live/$1/fullchain.pem" -subj "/CN=$1" 2>/dev/null
    fi
    return 1
}

# api.pocketsoftware.dev ------------------------------------------------------
if issued api.pocketsoftware.dev; then
    OK=$((OK+1))
elif issue api.pocketsoftware.dev; then
    OK=$((OK+1))
    systemctl reload nginx
fi

# gamfix.pocketsoftware.dev ---------------------------------------------------
if issued gamfix.pocketsoftware.dev; then
    OK=$((OK+1))
elif issue gamfix.pocketsoftware.dev; then
    OK=$((OK+1))
    systemctl reload nginx
fi

if [ "$OK" -ge 2 ]; then
    echo "both certs present - disabling retry timer"
    systemctl disable --now gamfix-cert-issue.timer 2>/dev/null || true
    exit 0
fi
echo "certs ready: $OK/2 - will retry"
exit 0
