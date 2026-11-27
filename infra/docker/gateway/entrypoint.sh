#!/bin/sh
# Gateway entrypoint: render the nginx configuration for this server, start
# nginx, and reload it whenever the TLS certificate changes (the certbot
# container renews it in the background).
set -e

CERTS=/etc/nginx/certs
TEMPLATES=/etc/nginx/gateway
mkdir -p "$CERTS"

render() {
    if [ -n "${TLS_HOST:-}" ] && [ -f "/etc/letsencrypt/live/$TLS_HOST/fullchain.pem" ]; then
        # Issued or renewed by the certbot container.
        ln -sfn "/etc/letsencrypt/live/$TLS_HOST/fullchain.pem" "$CERTS/fullchain.pem"
        ln -sfn "/etc/letsencrypt/live/$TLS_HOST/privkey.pem" "$CERTS/privkey.pem"
    elif [ -f /etc/nginx/tls/fullchain.pem ] && [ -f /etc/nginx/tls/privkey.pem ]; then
        # Certificate placed by hand in infra/docker/tls/.
        ln -sfn /etc/nginx/tls/fullchain.pem "$CERTS/fullchain.pem"
        ln -sfn /etc/nginx/tls/privkey.pem "$CERTS/privkey.pem"
    fi

    # @@FRONTEND_URL@@ without a trailing slash; nginx's own $names stay as they are.
    sed "s|@@FRONTEND_URL@@|${FRONTEND_URL%/}|g" \
        "$TEMPLATES/locations.conf.template" > "$TEMPLATES/locations.conf"

    sed "s|@@FRONTEND_URL@@|${FRONTEND_URL%/}|g" \
        "$TEMPLATES/gateway.conf.template" > /etc/nginx/conf.d/gateway.conf

    if [ -n "${TLS_HOST:-}" ] && [ -f "$CERTS/fullchain.pem" ]; then
        sed "s|@@TLS_HOST@@|$TLS_HOST|g" \
            "$TEMPLATES/tls.conf.template" > /etc/nginx/conf.d/tls.conf
    else
        rm -f /etc/nginx/conf.d/tls.conf
    fi
}

fingerprint() {
    # Empty when there is no certificate; changes when certbot installs a new one.
    for file in "$CERTS/fullchain.pem" "$CERTS/privkey.pem"; do
        [ -f "$file" ] && md5sum < "$file"
    done
    true
}

render
nginx -t

state="$(fingerprint)"
(
    while sleep 3600; do
        now="$(fingerprint)"
        if [ "$now" != "$state" ]; then
            render && nginx -t && nginx -s reload && state="$now"
        fi
    done
) &

exec /docker-entrypoint.sh nginx -g 'daemon off;'
