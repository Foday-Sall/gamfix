<?php

namespace App\Http\Controllers;

use App\Http\Requests\SendOtpRequest;
use App\Http\Requests\VerifyOtpRequest;
use App\Services\PhoneOtpService;
use Illuminate\Http\JsonResponse;

class PhoneOtpController extends Controller
{
    public function __construct(private PhoneOtpService $otp) {}

    public function send(SendOtpRequest $request): JsonResponse
    {
        $data = $request->validated();

        $result = $this->otp->send($request->user(), $data['phone']);
        if (! $result['ok']) {
            return response()->json(['error' => $result['error']], $result['status']);
        }

        return response()->json(['ok' => true, 'sent' => true]);
    }

    public function verify(VerifyOtpRequest $request): JsonResponse
    {
        $data = $request->validated();

        $result = $this->otp->verify($request->user(), $data['code']);
        if (! $result['ok']) {
            return response()->json(['error' => $result['error']], $result['status']);
        }

        return response()->json([
            'ok' => true,
            'user' => $request->user()->fresh()->dto(),
        ]);
    }
}
