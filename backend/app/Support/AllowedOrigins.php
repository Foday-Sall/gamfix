<?php

namespace App\Support;

/**
 * Which browser origins may call the API and may receive sign-in redirects.
 *
 * The list is APP_URL plus CORS_ORIGINS (comma-separated). An entry may
 * contain `*`, standing for one label of the host name, so a single line
 * covers the production address and every preview deployment of a Vercel
 * project:
 *
 *     CORS_ORIGINS=https://*-salldevvv-4600.vercel.app
 *
 * matches https://gamfix-salldevvv-4600.vercel.app and
 * https://gamfix-abc123-salldevvv-4600.vercel.app — and nothing else.
 */
class AllowedOrigins
{
    /** Origins listed one by one: APP_URL plus the CORS_ORIGINS entries without `*`. */
    public static function exact(): array
    {
        $exact = [];
        $origins = array_merge([config('app.url')], self::entries());

        foreach ($origins as $origin) {
            $origin = self::normalize((string) $origin);

            if ($origin !== '' && ! str_contains($origin, '*')) {
                $exact[] = $origin;
            }
        }

        return array_values(array_unique($exact));
    }

    /** The CORS_ORIGINS entries that contain `*`, as regular expressions. */
    public static function patterns(): array
    {
        $patterns = [];

        foreach (self::entries() as $origin) {
            if (! str_contains($origin, '*')) {
                continue;
            }

            $literal = array_map(
                fn (string $part) => preg_quote($part, '#'),
                explode('*', self::normalize($origin))
            );

            $patterns[] = '#^'.implode('[a-z0-9-]*', $literal).'$#';
        }

        return array_values(array_unique($patterns));
    }

    public static function isAllowed(string $origin): bool
    {
        $origin = self::normalize($origin);

        if ($origin === '') {
            return false;
        }

        if (in_array($origin, self::exact(), true)) {
            return true;
        }

        foreach (self::patterns() as $pattern) {
            if (preg_match($pattern, $origin) === 1) {
                return true;
            }
        }

        return false;
    }

    /** @return string[] */
    private static function entries(): array
    {
        $entries = array_map('trim', explode(',', (string) env('CORS_ORIGINS', '')));

        return array_values(array_filter($entries, fn (string $entry) => $entry !== ''));
    }

    private static function normalize(string $origin): string
    {
        return rtrim(strtolower(trim($origin)), '/');
    }
}
