#!/bin/sh
# Keeps the TLS certificate valid: issues it on the first start and renews it
# afterwards (Let's Encrypt, validated through the gateway's
# /.well-known/acme-challenge/). Sleeps when TLS_HOST is empty.
set -u

while [ -z "${TLS_HOST:-}" ]; do
    echo "certbot: TLS_HOST is not set, HTTPS is off, nothing to do"
    sleep 86400
done

mkdir -p /var/www/certbot

args="--webroot -w /var/www/certbot --non-interactive --agree-tos \
    --keep-until-expiring --cert-name $TLS_HOST -d $TLS_HOST"
if [ -n "${TLS_EMAIL:-}" ]; then
    args="$args --email $TLS_EMAIL"
else
    args="$args --register-unsafely-without-email"
fi

while :; do
    if certbot certonly $args; then
        echo "certbot: certificate for $TLS_HOST is ready"
    else
        echo "certbot: could not issue or renew, trying again in 12 hours" >&2
    fi
    # The gateway notices a new certificate on its own and reloads.
    sleep 43200
done
