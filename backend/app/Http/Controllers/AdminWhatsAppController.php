<?php

namespace App\Http\Controllers;

use App\Models\AdminSetting;
use App\Models\WhatsappNumber;
use App\Services\GowaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminWhatsAppController extends Controller
{
    public function __construct(private GowaService $gowa) {}

    public function action(Request $request): JsonResponse
    {
        $action = (string) $request->input('action', '');
        $params = (array) $request->input('params', []);
        $p = fn (string $key) => $params[$key] ?? null;

        $findRow = function () use ($params, $p): ?WhatsappNumber {
            $digits = preg_replace('/\D+/', '', (string) ($params['phone'] ?? $params['p_number'] ?? ''));
            if ($digits !== '') {
                $row = WhatsappNumber::where('number', $digits)->orderByDesc('created_at')->first();
                if ($row) {
                    return $row;
                }
            }

            $id = (string) ($p('p_number_id') ?? $p('number_id') ?? '');

            return $id !== '' ? WhatsappNumber::find($id) : null;
        };

        try {
            switch ($action) {
                case 'list_numbers':
                    $registry = WhatsappNumber::orderBy('number')->get()->map(
                        fn (WhatsappNumber $n) => $n->dto()
                    )->all();

                    return response()->json(['ok' => true, 'data' => ['numbers' => $registry]]);

                case 'start_link':
                    $number = preg_replace('/\D+/', '', (string) ($p('phone') ?? $p('p_number') ?? ''));
                    $role = (string) ($p('role') ?? $p('p_role') ?? 'otp');
                    if (! in_array($role, ['otp', 'chat'], true)) {
                        $role = 'otp';
                    }
                    if ($number === '') {
                        return response()->json(['message' => 'Please provide a valid phone number.', 'data' => new \stdClass], 400);
                    }
                    if (WhatsappNumber::where('number', $number)->where('status', '!=', 'revoked')->exists()) {
                        return response()->json(['message' => 'That number is already linked or pending.', 'data' => new \stdClass], 400);
                    }

                    $jid = $number.'@s.whatsapp.net';
                    $res = $this->gowa->createDevice($jid);
                    if (($res['json']['code'] ?? '') !== 'SUCCESS') {
                        return response()->json(['message' => 'GOWA gateway did not accept the device.', 'data' => new \stdClass], 502);
                    }

                    $pair = $this->gowa->pairingCode($jid, $number);
                    $pairingCode = $pair['json']['results']['pair_code'] ?? null;
                    if ($pairingCode === null) {
                        $this->gowa->deviceDelete($jid);

                        return response()->json(['message' => 'No pairing code returned - is the GOWA gateway reachable?', 'data' => new \stdClass], 502);
                    }

                    $row = WhatsappNumber::create([
                        'number' => $number,
                        'role' => $role,
                        'status' => 'pending',
                        'gowa_instance' => $jid,
                        'gowa_state' => 'pairing',
                    ]);

                    return response()->json(['ok' => true, 'data' => [
                        'number' => $row->dto(),
                        'pairingCode' => $pairingCode,
                        'pairing_code' => $pairingCode, // legacy field name
                        'role' => $role,
                    ]]);

                case 'confirm_link':
                    $row = $findRow();
                    if (! $row) {
                        return response()->json(['message' => 'Number not found - start the link first.', 'data' => new \stdClass], 404);
                    }
                    $status = $this->gowa->deviceStatus((string) $row->gowa_instance);
                    if (($status['status'] ?? 0) >= 300) {
                        return response()->json(['message' => 'Could not reach the GOWA gateway — try again.', 'data' => new \stdClass], 502);
                    }
                    $results = (array) ($status['json']['results'] ?? []);
                    $loggedIn = (bool) ($results['is_logged_in'] ?? false);
                    if ($loggedIn) {
                        $row->status = 'linked';
                        $row->gowa_state = 'connected';
                        $row->gowa_jid = $row->gowa_instance;
                        $row->linked_at = now();
                    } else {
                        $row->gowa_state = ($results['is_connected'] ?? false) ? 'connecting' : 'pairing';
                    }
                    $row->save();

                    return response()->json(['ok' => true, 'data' => [
                        'loggedIn' => $loggedIn,
                        'gowaState' => $row->gowa_state,
                        'number' => $row->dto(),
                    ]]);

                case 'set_role':
                    $row = $findRow();
                    $role = (string) ($p('role') ?? $p('p_role') ?? '');
                    if (! $row || ! in_array($role, ['otp', 'chat'], true)) {
                        return response()->json(['ok' => false, 'error' => 'invalid_params']);
                    }
                    $row->role = $role;
                    $row->save();

                    return response()->json(['ok' => true, 'data' => $row->dto()]);

                case 'revoke':
                    $row = $findRow();
                    if (! $row) {
                        return response()->json(['message' => 'Number not found.', 'data' => new \stdClass], 404);
                    }
                    $res = $this->gowa->deviceDisconnect((string) $row->gowa_instance);
                    if (($res['status'] ?? 0) >= 300 || ($res['json']['code'] ?? 'SUCCESS') !== 'SUCCESS') {
                        return response()->json(['message' => 'GOWA refused the logout — number stays linked. Try again.', 'data' => new \stdClass], 502);
                    }
                    $row->status = 'revoked';
                    $row->gowa_state = 'disconnected';
                    $row->revoked_at = now();
                    $row->save();

                    return response()->json(['ok' => true, 'data' => $row->dto()]);

                case 'delete_number':
                    $row = $findRow();
                    if (! $row) {
                        return response()->json(['message' => 'Number not found.', 'data' => new \stdClass], 404);
                    }
                    $res = $this->gowa->deviceDelete((string) $row->gowa_instance);
                    if (($res['status'] ?? 0) >= 300 || ($res['json']['code'] ?? 'SUCCESS') !== 'SUCCESS') {
                        return response()->json(['message' => 'GOWA refused the removal — number stays linked. Try again.', 'data' => new \stdClass], 502);
                    }
                    $row->delete();

                    return response()->json(['ok' => true]);

                case 'get_sender':
                    $sender = AdminSetting::value('whatsapp_sender');
                    if (is_string($sender) && $sender !== '') {
                        return response()->json(['ok' => true, 'data' => ['number' => $sender]]);
                    }
                    $otpDevice = WhatsappNumber::where('role', 'otp')->where('status', 'linked')->orderBy('linked_at')->first();

                    return response()->json(['ok' => true, 'data' => ['number' => $otpDevice?->number]]);

                default:
                    return response()->json(['ok' => false, 'error' => 'unknown_action']);
            }
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['ok' => false, 'error' => 'gowa_unavailable']);
        }
    }
}
