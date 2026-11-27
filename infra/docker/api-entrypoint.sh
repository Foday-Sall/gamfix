#!/bin/sh
# GamFix Laravel API entrypoint: wait for MariaDB, then (in the container
# flagged RUN_MIGRATIONS=1) migrate + seed, then run the service command.
# Startup fails closed: no APP_KEY, no database, or a failed migration
# means the container exits non-zero instead of serving a broken stack.
set -e

cd /var/www/gamfix-api

if [ -z "${APP_KEY:-}" ]; then
    echo "gamfix-api: APP_KEY is empty — refusing to start. Run 'php artisan key:generate' and put the key in backend/.env (it must stay the same across restarts)." >&2
    exit 1
fi

echo "gamfix-api: waiting for database ${DB_HOST:-mariadb}..."
i=0
until php -r '
    try {
        new PDO(
            "mysql:host=".getenv("DB_HOST").";port=".(getenv("DB_PORT") ?: 3306).";dbname=".getenv("DB_DATABASE"),
            getenv("DB_USERNAME"),
            getenv("DB_PASSWORD"),
            [PDO::ATTR_TIMEOUT => 3]
        );
        exit(0);
    } catch (Throwable $e) {
        exit(1);
    }
' 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
        echo "gamfix-api: database not reachable after 120s" >&2
        exit 1
    fi
    sleep 2
done

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    php artisan migrate --force --no-interaction || exit 1
    php artisan db:seed --force --no-interaction || exit 1
    chown -R www-data:www-data storage bootstrap/cache || true
fi

# A service may pass its own command (e.g. `php artisan reverb:start`) — run
# it after the database setup instead of the default php-fpm.
if [ "${1:-}" = "php" ]; then
    echo "gamfix-api: starting $*"
    exec "$@"
fi

echo "gamfix-api: starting php-fpm"
exec php-fpm
