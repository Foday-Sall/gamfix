<?php

namespace App\Services;

use App\Models\OtpCode;
use App\Models\User;
use App\Models\WhatsappNumber;
use Illuminate\Support\Facades\RateLimiter;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberUtil;

class PhoneOtpService
{
    public function __construct(private GowaService $gowa) {}

    public static function normalize(?string $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();

        try {
            $number = $util->parse($raw, 'GM');
        } catch (NumberParseException) {
            return null;
        }

        if ($number->getCountryCode() !== 220 || ! $util->isValidNumber($number)) {
            $digits = preg_replace('/\D+/', '', $raw);

            return preg_match('/^(?:220)?86\d{7}$/', $digits) === 1 ? '220'.substr($digits, -9) : null;
        }

        return '220'.$number->getNationalNumber();
    }

    public function send(User $user, string $rawPhone, ?string $ip = null): array
    {
        $phone = static::normalize($rawPhone);
        if ($phone === null) {
            return ['ok' => false, 'status' => 400, 'error' => 'That is not a Gambian mobile number.'];
        }

        if ($user->phone_verified) {
            return ['ok' => false, 'status' => 409, 'error' => 'Phone is already verified.'];
        }

        if (! $user->hasVerifiedEmail()) {
            return ['ok' => false, 'status' => 403, 'error' => 'Verify your email first, then verify your phone.'];
        }

        $taken = User::where('phone', $phone)->where('id', '!=', $user->id)->exists();
        if ($taken) {
            return ['ok' => false, 'status' => 409, 'error' => 'This phone number is already linked to another Gamfix account.'];
        }

        $maxPerIp = (int) config('gamfix.otp.max_per_ip', 10);
        if ($ip !== null && RateLimiter::tooManyAttempts('otp-ip:'.$ip, $maxPerIp)) {
            return ['ok' => false, 'status' => 429, 'error' => 'Too many codes requested. Please wait before trying again.'];
        }

        $window = (int) config('gamfix.otp.resend_window_seconds');
        $latest = OtpCode::where('phone', $phone)->orderByDesc('created_at')->first();
        if ($latest !== null && $latest->created_at->gt(now()->subSeconds($window))) {
            return ['ok' => false, 'status' => 429, 'error' => 'Too many codes requested. Please wait before trying again.'];
        }

        if (! $this->gowa->configured()) {
            return ['ok' => false, 'status' => 503, 'error' => 'WhatsApp delivery is not configured.'];
        }

        $device = WhatsappNumber::where('role', 'otp')
            ->where('status', 'linked')
            ->orderByDesc('linked_at')
            ->first();
        $deviceId = (string) ($device?->gowa_instance ?? config('gamfix.gowa.device_id') ?? '');
        if ($deviceId === '') {
            return ['ok' => false, 'status' => 503, 'error' => 'WhatsApp is not paired yet. Link a number in the admin dashboard first.'];
        }

        $code = (string) random_int(100000, 999999);
        $ttl = (int) config('gamfix.otp.ttl_seconds');
        OtpCode::pruneFor($phone);
        $otp = OtpCode::create([
            'user_id' => $user->id,
            'phone' => $phone,
            'code_hash' => OtpCode::hash($code),
            'expires_at' => now()->addSeconds($ttl),
            'requested_ip' => $ip,
        ]);

        [$ok, $detail] = $this->gowa->sendText(
            $phone.'@s.whatsapp.net',
            "Your Gamfix verification code is: {$code}\n\nIt expires in 10 minutes. Do not share it.",
            $deviceId,
        );
        if (! $ok) {
            $otp->delete();
            report('GowaService OTP delivery failed: '.$detail);

            return ['ok' => false, 'status' => 502, 'error' => 'Could not deliver the WhatsApp code. Please try again shortly.'];
        }

        if ($ip !== null) {
            RateLimiter::hit('otp-ip:'.$ip, 3600);
        }

        return ['ok' => true, 'status' => 200];
    }

    public function verify(User $user, string $code): array
    {
        $otp = OtpCode::where('user_id', $user->id)
            ->whereNull('consumed_at')
            ->orderByDesc('created_at')
            ->first();

        if ($otp === null || $otp->expires_at->lte(now())) {
            return ['ok' => false, 'status' => 400, 'error' => 'The code is incorrect or has expired.'];
        }

        if ($otp->attempts >= (int) config('gamfix.otp.max_attempts')) {
            $otp->forceFill(['consumed_at' => now()])->save();

            return ['ok' => false, 'status' => 429, 'error' => 'Too many wrong attempts. Request a new code.'];
        }

        if (! hash_equals($otp->code_hash, OtpCode::hash(trim($code)))) {
            $otp->forceFill(['attempts' => $otp->attempts + 1])->save();

            return ['ok' => false, 'status' => 400, 'error' => 'The code is incorrect or has expired.'];
        }

        $phone = $otp->phone;
        $taken = User::where('phone', $phone)->where('id', '!=', $user->id)->exists();
        if ($taken) {
            return ['ok' => false, 'status' => 409, 'error' => 'This phone number is already linked to another Gamfix account.'];
        }

        $user->forceFill(['phone' => $phone, 'phone_verified' => true])->save();
        OtpCode::where('user_id', $user->id)->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);
        OtpCode::pruneFor($phone);

        return ['ok' => true, 'status' => 200];
    }
}
