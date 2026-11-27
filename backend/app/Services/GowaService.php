<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GowaService
{
    private ?string $basicAuth;

    private string $baseUrl;

    private string $deviceId;

    public function __construct()
    {
        $this->basicAuth = config('gamfix.gowa.basic_auth');
        $this->baseUrl = rtrim((string) config('gamfix.gowa.base_url'), '/');
        $this->deviceId = (string) config('gamfix.gowa.device_id');
    }

    public function configured(): bool
    {
        return (bool) $this->basicAuth;
    }

    private function call(string $path, string $method = 'GET', array $body = [], ?string $deviceId = null): array
    {
        if (! $this->configured()) {
            throw new ConnectionException('GOWA_BASIC_AUTH not configured');
        }

        [$user, $pass] = array_pad(explode(':', (string) $this->basicAuth, 2), 2, '');
        $request = Http::withBasicAuth($user, $pass)
            ->withHeaders(array_filter([
                'X-Device-Id' => $deviceId ?? $this->deviceId,
            ]))
            ->baseUrl($this->baseUrl);

        $response = match ($method) {
            'POST' => $request->post($path, $body),
            'DELETE' => $request->delete($path),
            default => $request->get($path),
        };

        return [
            'status' => $response->status(),
            'json' => $response->json() ?? [],
        ];
    }

    public function sendText(string $chatJid, string $text, ?string $deviceId = null): array
    {
        try {
            $res = $this->call('/send/message', 'POST', [
                'phone' => $chatJid,
                'message' => $text,
            ], $deviceId);
            $code = $res['json']['code'] ?? '';
            if ($code !== 'SUCCESS') {
                return [false, 'gowa error '.($code ?: $res['status'])];
            }

            return [true, 'sent'];
        } catch (\Throwable $e) {
            Log::warning('GowaService sendText failed: '.$e->getMessage());

            return [false, $e->getMessage()];
        }
    }

    public function devices(): array
    {
        return $this->call('/devices');
    }

    public function createDevice(string $jid): array
    {
        return $this->call('/devices', 'POST', ['device_id' => $jid]);
    }

    public function pairingCode(string $jid, string $phone): array
    {
        return $this->call('/devices/'.$jid.'/login/code?phone='.rawurlencode($phone), 'POST');
    }

    public function deviceStatus(string $jid): array
    {
        return $this->call('/devices/'.$jid.'/status');
    }

    public function deviceDisconnect(string $jid): array
    {
        return $this->call('/devices/'.$jid.'/logout', 'POST');
    }

    public function deviceDelete(string $jid): array
    {
        return $this->call('/devices/'.$jid, 'DELETE');
    }
}
