# GamFix Laravel API container.
#
# Serves the JSON REST API on php-fpm :9000 behind
# the web container's nginx. Migrations + seeders run on boot (idempotent),
# then php-fpm takes over. Build context is the repo root; the Laravel app
# lives in ./backend.
FROM php:8.3-fpm-alpine

RUN apk add --no-cache icu-dev libzip-dev zip oniguruma-dev \
        libpng-dev libjpeg-turbo-dev freetype-dev mysql-client \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install pdo_mysql gd intl zip bcmath exif pcntl \
    && apk del --no-cache $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/gamfix-api

# Dependencies first for layer caching.
COPY backend/composer.json backend/artisan ./
RUN mkdir -p app/Http/Controllers app/Models bootstrap/cache \
        && COMPOSER_ALLOW_SUPERUSER=1 composer install \
        --no-interaction --no-progress --no-scripts --prefer-dist

# Full application source.
COPY backend/ .
RUN COMPOSER_ALLOW_SUPERUSER=1 composer dump-autoload --optimize \
    && chown -R www-data:www-data storage bootstrap/cache

COPY infra/docker/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9000

ENTRYPOINT ["/entrypoint.sh"]
