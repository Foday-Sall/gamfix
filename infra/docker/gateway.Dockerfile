# GamFix gateway: nginx in front of the API (php-fpm) and the websocket
# server. The site itself is not served from here.
#
# The configuration is rendered at start by entrypoint.sh, so the certificate
# and the site address are known without rebuilding the image.
FROM nginx:1.27-alpine

# The image's default server would answer for the real host name otherwise.
RUN rm /etc/nginx/conf.d/default.conf

COPY infra/docker/gateway/locations.conf.template /etc/nginx/gateway/locations.conf.template
COPY infra/docker/gateway/gateway.conf.template /etc/nginx/gateway/gateway.conf.template
COPY infra/docker/gateway/tls.conf.template /etc/nginx/gateway/tls.conf.template
COPY infra/docker/gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
