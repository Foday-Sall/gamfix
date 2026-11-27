<?php

use App\Http\Controllers\AdminPanelController;
use App\Http\Controllers\AdminSecretsController;
use App\Http\Controllers\AdminWhatsAppController;
use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CitizenActionController;
use App\Http\Controllers\CitizenComplaintController;
use App\Http\Controllers\FilesController;
use App\Http\Controllers\PhoneOtpController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\PublicDataController;
use App\Http\Controllers\StaffAccessController;
use App\Http\Controllers\StaffActionController;
use App\Http\Controllers\StaffComplaintController;
use App\Http\Controllers\StaffMapController;
use App\Http\Controllers\StaffStatsController;
use App\Http\Controllers\TelegramSettingsController;
use App\Http\Controllers\TelegramWebhookController;
use App\Http\Controllers\TrackController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;
use Nutgram\Laravel\Middleware\SendWebhookResponse;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);

Route::get('/auth/register-prefill', [AuthController::class, 'registerPrefill'])
    ->middleware('signed')->name('auth.register-prefill');
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
});

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);
Route::post('/auth/google/exchange', [GoogleAuthController::class, 'exchange']);

Route::post('/email/request-verification', [EmailVerificationController::class, 'request']);
Route::get('/email/verify', [EmailVerificationController::class, 'verify'])
    ->middleware('signed')->name('email.verify');
Route::post('/password/request-reset', [PasswordResetController::class, 'request']);
Route::post('/password/confirm-reset', [PasswordResetController::class, 'confirm']);

Route::get('/institutions', [PublicDataController::class, 'institutions']);
Route::get('/categories', [PublicDataController::class, 'categories']);
Route::get('/config', [PublicDataController::class, 'clientConfig']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/complaints', [CitizenComplaintController::class, 'index']);
    Route::get('/complaint-updates', [CitizenActionController::class, 'updates']);
    Route::patch('/users/me', [ProfileController::class, 'update']);
    Route::post('/users/avatar', [ProfileController::class, 'avatar']);
});

Route::get('/files/complaints/{complaint}/{photo}', [CitizenComplaintController::class, 'photo'])
    ->name('complaint.photo')->middleware('signed');
Route::get('/files/users/{user}/{photo}', [ProfileController::class, 'show'])
    ->name('user.avatar')->middleware('signed');
Route::get('/files/institutions/{institution}/{photo}', [FilesController::class, 'logo']);

Route::middleware(['auth:sanctum', 'throttle:otp-send'])->group(function () {
    Route::post('/gamfix/phone-otp/send', [PhoneOtpController::class, 'send']);
    Route::post('/gamfix/phone-otp/verify', [PhoneOtpController::class, 'verify']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/users/me/telegram/link', [TelegramSettingsController::class, 'create']);
    Route::delete('/users/me/telegram/link', [TelegramSettingsController::class, 'destroy']);
});

Route::post('/gamfix/complaints', [CitizenComplaintController::class, 'store'])
    ->middleware(['auth:sanctum', 'phone.verified']);
Route::post('/gamfix/complaints/{complaint}/photos', [CitizenComplaintController::class, 'attachPhotos'])
    ->middleware('auth:sanctum');
Route::post('/gamfix/track', [TrackController::class, 'track']);
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/gamfix/can-confirm', [CitizenActionController::class, 'canConfirm']);
    Route::post('/gamfix/confirm', [CitizenActionController::class, 'confirm']);
    Route::post('/gamfix/reopen', [CitizenActionController::class, 'reopen']);
});

Route::middleware('auth:sanctum')->post('/gamfix/access', [StaffAccessController::class, 'resolve']);

Route::middleware(['auth:sanctum', 'phone.verified'])->group(function () {
    Route::post('/gamfix/staff/complaints', [StaffComplaintController::class, 'index']);
    Route::post('/gamfix/staff/stats', [StaffStatsController::class, 'index']);
    Route::post('/gamfix/staff/complaint', [StaffComplaintController::class, 'show']);
    Route::post('/gamfix/staff/accept', [StaffActionController::class, 'accept']);
    Route::post('/gamfix/staff/status', [StaffActionController::class, 'setStatus']);
    Route::post('/gamfix/staff/resolution', [StaffActionController::class, 'resolution']);
    Route::post('/gamfix/staff/map', [StaffMapController::class, 'index']);
    Route::post('/gamfix/staff/reject', [StaffActionController::class, 'reject']);
    Route::post('/gamfix/staff/request-info', [StaffActionController::class, 'requestInfo']);
    Route::post('/gamfix/staff/forward', [StaffActionController::class, 'forward']);
    Route::post('/gamfix/staff/proof', [StaffActionController::class, 'proof']);
});

Route::middleware(['auth:sanctum', 'admin'])->group(function () {
    Route::post('/gamfix/admin', [AdminPanelController::class, 'action']);
    Route::post('/gamfix/admin-secrets', [AdminSecretsController::class, 'action']);
    Route::post('/gamfix/admin-whatsapp', [AdminWhatsAppController::class, 'action']);
});

Route::post('/telegram/webhook', [TelegramWebhookController::class, '__invoke'])
    ->middleware([SendWebhookResponse::class, 'throttle:120,1']);

Route::middleware('auth:sanctum')->post('/broadcasting/auth', function (Request $request) {
    return Broadcast::auth($request);
});
