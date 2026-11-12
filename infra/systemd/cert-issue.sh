#!/bin/bash
# Issue/refresh the Let's Encrypt certs for the pocketsoftware.dev hosts and
# point the nginx cert snippets at them. Safe to run repeatedly: it exits 0
# quickly once both certs exist. A pocketsoftware.dev host can only validate
# once its DNS record points directly at this VPS (grey cloud), so a systemd
# timer (gamfix-cert-issue.timer) reruns this every 10 minutes; when both
# certs are in place it disables itself.
#
# IMPORTANT (bug fixed 2026-11-12): certbot keeps /etc/letsencrypt/live/<d>/
# as SYMLINKS into archive/<d>/NN/. The old placeholder logic wrote the
# self-signed fallback through those symlinks and STOMPED the real LE cert in
# the archive. Now: live/<d> is always rm -rf'd first, placeholders are real
# files in a fresh dir, and a domain with an existing renewal config is
# force-renewed so a stomped/missing live cert self-heals.
# backend.pocketsoftware.dev was retired 2026-11-12 (was a Cloudflare Workers
# custom domain); api.pocketsoftware.dev replaced it as the API alias.
set -u

WEBROOT=/var/www/certbot
SNIP=/etc/nginx/snippets
MARK=/opt/gamfix-src
OK=0

issued() { # marker present AND the live cert is a real LE one (self-healing:
           # a marker alone once hid a stomped archive behind a placeholder)
    [ -f "$MARK/.cert-issued-$1" ] && \
    openssl x509 -in "/etc/letsencrypt/live/$1/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt"
}

issue() { # $1 = domain
    # full clean slate: certbot's renew paths refuse to self-heal a lineage
    # with missing/dangling live symlinks ("expected cert.pem to be a
    # symlink"), and a half-stomped archive is worthless — so remove the
    # whole lineage and issue fresh. Nothing can be followed into archive/
    # because it is gone too.
    sudo rm -rf "/etc/letsencrypt/live/$1" "/etc/letsencrypt/archive/$1"
    sudo rm -f "/etc/letsencrypt/renewal/$1.conf"
    rm -f "$MARK/.cert-issued-$1"
    certbot certonly --webroot -w "$WEBROOT" -d "$1" \
        --non-interactive --agree-tos \
        -m admin@pocketsoftware.dev \
        --deploy-hook "systemctl reload nginx" >"/tmp/certbot-$1.log" 2>&1
    if [ -f "/etc/letsencrypt/live/$1/fullchain.pem" ] && \
       openssl x509 -in "/etc/letsencrypt/live/$1/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt"; then
        touch "$MARK/.cert-issued-$1"
        return 0
    fi
    # issuance failed (DNS not pointing here, most likely): drop a REAL-FILE
    # self-signed placeholder (live/$1 was rm -rf'd above, so nothing can be
    # followed into archive/) so nginx stays reloadable, and try later
    if [ ! -s "/etc/letsencrypt/live/$1/fullchain.pem" ]; then
        sudo mkdir -p "/etc/letsencrypt/live/$1"
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
    echo "all certs present - disabling retry timer"
    systemctl disable --now gamfix-cert-issue.timer 2>/dev/null || true
    exit 0
fi
echo "certs ready: $OK/2 - will retry"
exit 0
