<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Complaint;
use App\Models\TelegramConversation;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use SergiX44\Nutgram\Nutgram;
use SergiX44\Nutgram\Telegram\Types\Keyboard\InlineKeyboardButton;
use SergiX44\Nutgram\Telegram\Types\Keyboard\InlineKeyboardMarkup;
use SergiX44\Nutgram\Telegram\Types\Keyboard\KeyboardButton;
use SergiX44\Nutgram\Telegram\Types\Keyboard\ReplyKeyboardMarkup;
use SergiX44\Nutgram\Telegram\Types\Keyboard\ReplyKeyboardRemove;
use SergiX44\Nutgram\Telegram\Types\Location\Location;
use SergiX44\Nutgram\Telegram\Types\Media\Contact;
use Throwable;

/**
 * The Gamfix Telegram citizen bot: a fixed conversation state machine
 * that walks a citizen through reporting a problem.
 */
class TelegramBotService
{
    private const STALE_AFTER_MINUTES = 360;

    private const MAX_PHOTOS = 5;

    public function __construct(
        private ComplaintService $complaints,
        private TelegramLinkService $links,
    ) {}

    public function start(Nutgram $bot): void
    {
        $text = (string) ($bot->message()?->text ?? '');
        $token = trim((string) preg_replace('~^/start(?:@\S+)?\s*~i', '', $text));
        if ($token !== '' && ! str_contains($token, ' ')) {
            $this->linkWithToken($bot, $token);

            return;
        }

        $conversation = $this->resolve($bot);
        if ($conversation === null) {
            return;
        }
        $this->expireIfStale($bot, $conversation);

        if ($conversation->citizen_id === null) {
            $name = $conversation->telegram_name ?: 'there';
            $this->send($bot,
                "👋 Welcome to Gamfix, {$name}!\n\n".
                'I help citizens report public problems — garbage, broken street lights, damaged roads, water issues — and give you a tracking number so you can follow the fix.'."\n\n".
                'Tap the button below to share your phone number and link your verified Gamfix account. '.
                'No account yet? Register online first — you can use the web app and this bot with the same account:');
            $this->send($bot, $this->registerUrl(), $this->sharePhoneKeyboard());
            $this->send($bot, 'After linking, I will remember you and guide you step by step through reporting a problem. Type /help any time.');

            return;
        }

        $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
        $this->send($bot,
            "👋 Hello {$this->greetingName($conversation)}! Your account is linked — ready to report a problem?",
            $this->reportKeyboard());
    }

    private function linkWithToken(Nutgram $bot, string $token): void
    {
        $telegramId = (string) ($bot->userId() ?? '');
        $chatId = (string) ($bot->chatId() ?? '');
        if ($telegramId === '' || $chatId === '') {
            return;
        }

        $result = $this->links->consume($token, $telegramId, $chatId, $bot->user()?->first_name);
        if ($result['ok'] ?? false) {
            $user = $result['user'];
            $this->send($bot,
                '✅ Linked! Hello '.$this->displayName($user, $bot->user()?->first_name).'! Your Gamfix account now answers here — report a problem any time:',
                $this->reportKeyboard());

            return;
        }

        $this->send($bot, match ($result['reason'] ?? 'invalid') {
            'taken' => 'This Telegram account is already linked to a different Gamfix account. Disconnect it there first (Settings → Connect Telegram), then try again.',
            default => 'That link has expired or was already used. Open the Gamfix app → Settings → Connect Telegram to get a fresh link.',
        });
    }

    private function greetingName(TelegramConversation $conversation): string
    {
        $citizen = $conversation->citizen_id !== null ? User::find($conversation->citizen_id) : null;

        return $this->displayName($citizen, $conversation->telegram_name);
    }

    private function displayName(?User $citizen, ?string $telegramName): string
    {
        foreach ([trim((string) ($citizen?->full_name ?? '')), trim((string) ($citizen?->name ?? '')), $telegramName] as $candidate) {
            if ($candidate !== null && $candidate !== '') {
                return $candidate;
            }
        }

        return 'there';
    }

    public function help(Nutgram $bot): void
    {
        $this->send($bot,
            "❔ How I work (fixed steps, no surprises):\n\n".
            "/start — link your account or get the report button\n".
            "📱 Share my phone — one tap to link your verified account\n".
            "📄 Report a problem — a guided form like the web app: category, title, description, photos, location\n".
            "/track ABC123XYZ — check the status of a report\n".
            "/cancel — stop the current form\n".
            "/help — this list\n\n".
            'This bot is for citizens. Reports you file here go to the same institution queue as the Gamfix app.');
    }

    public function cancel(Nutgram $bot): void
    {
        $conversation = $this->resolve($bot);
        if ($conversation === null) {
            return;
        }
        $hadForm = in_array($conversation->state, ['report_category', 'report_title', 'report_description', 'report_photos', 'report_location', 'report_confirm'], true);
        $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
        $this->send($bot,
            $hadForm ? 'Cancelled. Tap the button when you want to start again.' : 'Nothing to cancel.',
            $this->reportKeyboard());
    }

    public function track(Nutgram $bot): void
    {
        $text = (string) ($bot->message()?->text ?? '');
        $tracking = strtoupper(trim((string) preg_replace('/^\/track(@\S+)?\s*/i', '', $text)));
        if ($tracking === '') {
            $this->send($bot, 'Send the tracking number like this: /track ABC123XYZ');

            return;
        }

        $complaint = Complaint::with(['institution', 'category'])->where('tracking_no', $tracking)->first();
        if (! $complaint) {
            $this->send($bot, "No report found with tracking number {$tracking}. Check the number and try again.");

            return;
        }

        $this->send($bot,
            "🔎 Report {$complaint->tracking_no}\n".
            "• Status: {$complaint->status->value}\n".
            '• Category: '.($complaint->category?->name ?? '—')."\n".
            '• Institution: '.($complaint->institution?->name ?? '—')."\n".
            '• Submitted: '.$complaint->created_at->format('Y-m-d'));
    }

    public function contact(Nutgram $bot, ?Contact $contact): void
    {
        if ($contact === null) {
            return;
        }

        $conversation = $this->resolve($bot);
        if ($conversation === null) {
            return;
        }

        $fromId = (string) ($bot->userId() ?? '');
        $contactUserId = (string) ($contact->user_id ?? '');
        if ($fromId === '' || ($contactUserId !== '' && $contactUserId !== $fromId)) {
            $this->send($bot,
                'For your safety I can only accept the number of YOUR Telegram account. Tap the button below and confirm sharing your own number.');
            $this->send($bot, 'Tap the button to share:', $this->sharePhoneKeyboard());

            return;
        }

        $phone = PhoneOtpService::normalize((string) ($contact->phone_number ?? ''));
        if ($phone === null) {
            $this->send($bot,
                'That number is not a Gambian mobile number. Tap the share button again, or type /cancel.');

            return;
        }

        $citizen = User::where('phone', $phone)->where('phone_verified', true)->first();
        if (! $citizen) {
            $this->send($bot,
                'I could not find a Gamfix account with that phone number yet. Register online first — it takes a minute, and the same account works in the web app and here:');
            $this->send($bot, $this->registerUrl($phone),
                InlineKeyboardMarkup::make()->addRow(
                    InlineKeyboardButton::make('🔗 Open registration', url: $this->registerUrl($phone))
                ));

            return;
        }

        if ($citizen->role !== 'citizen') {
            $this->send($bot,
                "This bot is for citizen accounts only. {$citizen->name}, please use the Gamfix web console to process reports.");

            return;
        }

        if (! $this->links->bind($citizen, $fromId, (string) ($bot->chatId() ?? ''), $bot->user()?->first_name)) {
            $this->send($bot,
                'This Telegram account is already linked to a different Gamfix account. Disconnect it there first (Settings → Connect Telegram).');

            return;
        }

        $this->send($bot,
            '🎉 Hello '.$this->displayName($citizen, $bot->user()?->first_name).'! Your Gamfix account is linked — use the web app or this bot with the same account.',
            ReplyKeyboardRemove::make(remove_keyboard: true));
        $this->send($bot, 'Ready when you are:', $this->reportKeyboard());
    }

    public function location(Nutgram $bot, ?Location $location): void
    {
        if ($location === null || $location->latitude === null || $location->longitude === null) {
            return;
        }

        $conversation = $this->resolve($bot);
        if ($conversation === null || $conversation->state !== 'report_location') {
            return;
        }

        $conversation->forceFill([
            'state' => 'report_confirm',
            'data' => array_merge($conversation->data ?? [], [
                'lat' => (float) $location->latitude,
                'lng' => (float) $location->longitude,
            ]),
        ])->save();
        $this->send($bot, 'Thanks — location saved.', ReplyKeyboardRemove::make(remove_keyboard: true));
        $this->sendConfirmation($bot, $conversation);
    }

    public function photo(Nutgram $bot): void
    {
        $conversation = $this->resolve($bot);
        if ($conversation === null || $conversation->state !== 'report_photos') {
            return;
        }

        $photos = $bot->message()?->photo ?? [];
        if ($photos === []) {
            return;
        }
        $fileId = (string) (end($photos)->file_id ?? '');
        if ($fileId === '') {
            return;
        }

        $data = $conversation->data ?? [];
        $data['photos'] = array_values(array_slice(array_merge($data['photos'] ?? [], [$fileId]), 0, self::MAX_PHOTOS));
        $count = count($data['photos']);
        $conversation->forceFill(['data' => $data])->save();

        if ($count >= self::MAX_PHOTOS) {
            $this->askLocation($bot, $conversation, 'That is the last photo I can take ('.self::MAX_PHOTOS.' max).');

            return;
        }

        $this->send($bot,
            "🖼 Photo {$count} saved. Send another photo, or tap ✅ Done.",
            $this->photoKeyboard());
    }

    public function message(Nutgram $bot): void
    {
        $conversation = $this->resolve($bot);
        if ($conversation === null) {
            return;
        }
        $this->expireIfStale($bot, $conversation);
        $text = trim((string) ($bot->message()?->text ?? ''));
        $normalized = mb_strtolower((string) preg_replace('/^[^\p{L}\p{N}]+/u', '', $text));

        if (preg_match('~^/([a-z_]+)(@\S+)?($|\s)~i', $text, $m)) {
            switch (strtolower($m[1])) {
                case 'start':
                    $this->start($bot);

                    return;
                case 'help':
                    $this->help($bot);

                    return;
                case 'cancel':
                    $this->cancel($bot);

                    return;
                case 'track':
                    $this->track($bot);

                    return;
            }
        }

        switch ($conversation->state) {
            case 'report_title':
                $title = trim($text);
                if (mb_strlen($title) < 3 || mb_strlen($title) > 120) {
                    $this->send($bot, 'Give a short title (3–120 characters), e.g. "Overflowing bins at Serrekunda market".');

                    return;
                }
                $conversation->forceFill([
                    'state' => 'report_description',
                    'data' => array_merge($conversation->data ?? [], ['title' => $title]),
                ])->save();
                $this->send($bot,
                    '📝 Good. Now describe the problem in a few sentences (at least 10 characters): what is wrong, where exactly, and since when?');

                return;

            case 'report_description':
                $description = trim($text);
                if (mb_strlen($description) < 10) {
                    $this->send($bot, 'A few more words please — the institution needs at least 10 characters to understand the problem.');

                    return;
                }
                $conversation->forceFill([
                    'state' => 'report_photos',
                    'data' => array_merge($conversation->data ?? [], ['description' => $description]),
                ])->save();
                $this->send($bot,
                    '📷 Optional: send up to '.self::MAX_PHOTOS.' photos of the problem, tap ✅ Done when finished, or ⏭ No photo.',
                    $this->photoKeyboard());

                return;

            case 'report_photos':
                // Word-boundary match: "the bins are not done" must not skip.
                if (preg_match('/\b(done|skip|next|no photo)\b/iu', $normalized) === 1) {
                    $this->askLocation($bot, $conversation);

                    return;
                }
                $this->send($bot, 'Send a photo here, tap ✅ Done, or ⏭ No photo.', $this->photoKeyboard());

                return;

            case 'report_location':
                if (preg_match('/\b(skip|next|no location)\b/iu', $normalized) === 1) {
                    $this->askLocationConfirm($bot, $conversation);

                    return;
                }
                $this->send($bot, 'Tap 📍 My current location below (Telegram sends it as an attachment), or tap ⏭ Skip.',
                    ReplyKeyboardMarkup::make(resize_keyboard: true, one_time_keyboard: true)
                        ->addRow(
                            KeyboardButton::make('📍 My current location', request_location: true),
                            KeyboardButton::make('⏭ Skip'),
                        ));

                return;

            case 'report_confirm':
                // Whole words only: "known", "now", "north" must not read as "no".
                if (preg_match('/\b(yes|yeah|submit|ok|okay|confirm|correct|send it)\b/iu', $normalized) === 1) {
                    $this->submitReport($bot, $conversation);

                    return;
                }
                if (preg_match('/\b(no|nope|cancel|discard|wrong|stop)\b/iu', $normalized) === 1) {
                    $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
                    $this->send($bot, 'Report discarded. Tap the button when you want to start again.', $this->reportKeyboard());

                    return;
                }
                $this->sendConfirmation($bot, $conversation);

                return;

            default:
                if ($conversation->citizen_id !== null) {
                    $this->send($bot, 'Tap the button below to report a problem 📄', $this->reportKeyboard());

                    return;
                }
                $this->start($bot);
        }
    }

    public function callback(Nutgram $bot, string $action): void
    {
        $conversation = $this->resolve($bot);
        if ($conversation === null) {
            return;
        }
        $this->expireIfStale($bot, $conversation);

        if ($action === 'noop_help') {
            $bot->answerCallbackQuery();
            $this->help($bot);

            return;
        }

        // Deterministic guard: every button belongs to exactly one wizard
        // state, so a stale keyboard can never corrupt a conversation (e.g.
        // an old category button creating a report without its external_id).
        $ownerState = match (true) {
            $action === 'start_report' => 'idle',
            str_starts_with($action, 'cat_') => 'report_category',
            $action === 'photo_done', $action === 'photo_skip' => 'report_photos',
            $action === 'loc_skip' => 'report_location',
            $action === 'confirm_yes', $action === 'confirm_no' => 'report_confirm',
            default => null,
        };
        if ($ownerState === null || $conversation->state !== $ownerState) {
            $bot->answerCallbackQuery(text: 'This button expired — send /start for the current menu');

            return;
        }

        switch (true) {
            case $action === 'start_report':
                if ($conversation->citizen_id === null) {
                    $bot->answerCallbackQuery(text: 'Link your account first');
                    $this->send($bot,
                        'First, link your account: tap the button below to share your phone number. '.
                        'No Gamfix account yet? Register online and come back — the same account works in the web app and here:');
                    $this->send($bot, $this->registerUrl(), $this->sharePhoneKeyboard());

                    return;
                }
                $bot->answerCallbackQuery();
                $externalId = 'tg:'.$conversation->chat_id.':'.strtoupper(bin2hex(random_bytes(4)));
                $conversation->forceFill([
                    'state' => 'report_category',
                    'data' => ['external_id' => $externalId],
                ])->save();
                $this->send($bot,
                    "🏷 Step 1 of 5 — pick what the problem is:\n\n".
                    'For fire or police emergencies, please call the emergency services or use the app instead.',
                    $this->categoryKeyboard());

                return;

            case str_starts_with($action, 'cat_'):
                $bot->answerCallbackQuery();
                $category = Category::where('slug', substr($action, 4))
                    ->where('active', true)
                    ->where('is_emergency', false)
                    ->first();
                if (! $category) {
                    $this->send($bot, 'That category is not available. Pick one from the list:', $this->categoryKeyboard());

                    return;
                }
                $conversation->forceFill([
                    'state' => 'report_title',
                    'data' => array_merge($conversation->data ?? [], [
                        'category' => $category->slug,
                        'category_name' => $category->name,
                    ]),
                ])->save();
                $this->send($bot,
                    "✅ {$category->name} — the responsible institution is {$category->defaultInstitution?->name}.\n\n".
                    '📝 Step 2 of 5 — give the report a short title (3–120 characters).');

                return;

            case $action === 'photo_done' || $action === 'photo_skip':
                $bot->answerCallbackQuery();
                $this->askLocation($bot, $conversation);

                return;

            case $action === 'loc_skip':
                $bot->answerCallbackQuery();
                $this->askLocationConfirm($bot, $conversation);

                return;

            case $action === 'confirm_yes':
                $bot->answerCallbackQuery(text: 'Submitting…');
                $this->submitReport($bot, $conversation);

                return;

            case $action === 'confirm_no':
                $bot->answerCallbackQuery();
                $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
                $this->send($bot, 'Report discarded. Tap the button when you want to start again.', $this->reportKeyboard());

                return;

            default:
                $bot->answerCallbackQuery(text: 'Unknown action');
        }
    }

    public function unknownCallback(Nutgram $bot): void
    {
        $bot->answerCallbackQuery(text: 'Unknown action');
    }

    private function resolve(Nutgram $bot): ?TelegramConversation
    {
        $chatId = $bot->chatId();
        if ($chatId === null) {
            return null;
        }
        $userId = $bot->userId();

        $conversation = TelegramConversation::forChat(
            (string) $chatId,
            $userId !== null ? (string) $userId : null,
            $bot->user()?->first_name,
        );

        if ($conversation->citizen_id === null && $userId !== null) {
            $user = User::where('telegram_id', (string) $userId)->first();
            if ($user !== null && $user->role === 'citizen') {
                $conversation->forceFill(['citizen_id' => $user->id])->save();
            }
        }

        return $conversation;
    }

    private function submitReport(Nutgram $bot, TelegramConversation $conversation): void
    {
        $citizen = $conversation->citizen_id !== null ? User::find($conversation->citizen_id) : null;
        $data = $conversation->data ?? [];
        if (! $citizen || ($data['category'] ?? '') === '' || ($data['title'] ?? '') === '') {
            $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
            $this->send($bot, 'The form expired or is incomplete. Tap the button to start a fresh report.', $this->reportKeyboard());

            return;
        }

        $result = $this->complaints->create($citizen, [
            'p_title' => (string) $data['title'],
            'p_description' => (string) ($data['description'] ?? ''),
            'p_category_hint' => (string) $data['category'],
            'p_lat' => $data['lat'] ?? null,
            'p_lng' => $data['lng'] ?? null,
            'p_channel' => 'telegram',
            'p_external_id' => (string) ($data['external_id'] ?? ''),
        ]);

        if (! ($result['ok'] ?? false)) {
            $this->send($bot,
                '⚠️ '.(string) ($result['error'] ?? 'The report could not be saved.').' Your answers are still here — tap Submit to try again.',
                InlineKeyboardMarkup::make()
                    ->addRow(
                        InlineKeyboardButton::make('✅ Try again', callback_data: 'confirm_yes'),
                        InlineKeyboardButton::make('❌ Discard', callback_data: 'confirm_no'),
                    ));

            return;
        }

        $complaint = Complaint::find($result['data']['complaint_id'] ?? null);
        $photos = count($data['photos'] ?? []);
        $stored = $complaint ? $this->attachPhotos($complaint, array_slice($data['photos'] ?? [], 0, self::MAX_PHOTOS)) : 0;
        $photoNote = $photos > 0
            ? ($stored === $photos ? "\n• All {$stored} photo(s) were attached." : "\n• {$stored} of {$photos} photo(s) were attached (you can add more in the app).")
            : '';

        $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
        $this->send($bot,
            "🎉 Report filed!\n\n".
            '• Tracking number: '.($result['data']['tracking_no'] ?? '—')."\n".
            '• Institution: '.($result['data']['institution_name'] ?? '—')."\n".
            '• Check the status any time with /track '.($result['data']['tracking_no'] ?? '').$photoNote,
            $this->reportKeyboard());
    }

    private function attachPhotos(Complaint $complaint, array $fileIds): int
    {
        $token = (string) config('nutgram.token');
        if ($token === '') {
            return 0;
        }

        $stored = 0;
        foreach ($fileIds as $fileId) {
            try {
                $meta = Http::asJson()->timeout(15)
                    ->post("https://api.telegram.org/bot{$token}/getFile", ['file_id' => $fileId])
                    ->json();
                $filePath = $meta['result']['file_path'] ?? null;
                if (! is_string($filePath) || $filePath === '') {
                    continue;
                }

                $response = Http::timeout(30)->get("https://api.telegram.org/file/bot{$token}/{$filePath}");
                $decoded = $response->body();
                $kind = null;
                $max = (int) config('gamfix.uploads.resolution_max');
                if ($response->successful() && $decoded !== '' && strlen($decoded) <= $max) {
                    $kind = str_starts_with($decoded, "\xFF\xD8\xFF") ? 'jpg'
                        : (str_starts_with($decoded, "\x89PNG\r\n\x1A\n") ? 'png'
                        : (str_starts_with($decoded, 'RIFF') && substr($decoded, 8, 4) === 'WEBP' ? 'webp' : null));
                }
                if ($kind === null) {
                    continue;
                }

                $storagePath = 'complaints/'.$complaint->id.'/'.bin2hex(random_bytes(8)).'.'.$kind;
                Storage::disk('local')->put($storagePath, $decoded);
                $photos = $complaint->photos ?? [];
                $complaint->photos = array_slice(array_merge($photos, [$storagePath]), 0, (int) config('gamfix.uploads.photos_max_count'));
                $complaint->save();
                $stored++;
            } catch (Throwable $e) {
                report($e);
            }
        }

        return $stored;
    }

    private function askLocation(Nutgram $bot, TelegramConversation $conversation, string $prefix = ''): void
    {
        $conversation->forceFill(['state' => 'report_location'])->save();
        $this->send($bot,
            ($prefix === '' ? '' : $prefix."\n").'📍 Step 4 of 5 — where exactly is the problem? Tap 📍 My current location (Telegram sends it as an attachment), or ⏭ Skip.',
            ReplyKeyboardMarkup::make(resize_keyboard: true, one_time_keyboard: true)
                ->addRow(
                    KeyboardButton::make('📍 My current location', request_location: true),
                    KeyboardButton::make('⏭ Skip'),
                ));
    }

    private function askLocationConfirm(Nutgram $bot, TelegramConversation $conversation): void
    {
        $conversation->forceFill([
            'state' => 'report_confirm',
            'data' => array_merge($conversation->data ?? [], ['lat' => null, 'lng' => null]),
        ])->save();
        $this->send($bot, 'Okay, no location — the institution will use your description.', ReplyKeyboardRemove::make(remove_keyboard: true));
        $this->sendConfirmation($bot, $conversation);
    }

    private function sendConfirmation(Nutgram $bot, TelegramConversation $conversation): void
    {
        $data = $conversation->data ?? [];
        $photoCount = count($data['photos'] ?? []);
        $location = isset($data['lat']) && $data['lat'] !== null
            ? sprintf('yes (%.5f, %.5f)', (float) $data['lat'], (float) $data['lng'])
            : 'no';

        $this->send($bot,
            "🧾 Please check your report:\n\n".
            '• Category: '.($data['category_name'] ?? '?')."\n".
            '• Title: '.($data['title'] ?? '?')."\n".
            '• Description: '.mb_substr((string) ($data['description'] ?? ''), 0, 120).(mb_strlen((string) ($data['description'] ?? '')) > 120 ? '…' : '')."\n".
            "• Photos: {$photoCount}\n".
            "• Location: {$location}\n\n".
            'Submit it?',
            InlineKeyboardMarkup::make()
                ->addRow(
                    InlineKeyboardButton::make('✅ Submit report', callback_data: 'confirm_yes'),
                    InlineKeyboardButton::make('❌ Discard', callback_data: 'confirm_no'),
                ));
    }

    private function expireIfStale(Nutgram $bot, TelegramConversation $conversation): void
    {
        $wizardStates = ['report_category', 'report_title', 'report_description', 'report_photos', 'report_location', 'report_confirm'];
        if (in_array($conversation->state, $wizardStates, true)
            && $conversation->last_step_at !== null
            && $conversation->last_step_at->lt(now()->subMinutes(self::STALE_AFTER_MINUTES))) {
            $hadLink = $conversation->citizen_id !== null;
            $conversation->forceFill(['state' => 'idle', 'data' => null])->save();
            $this->send($bot,
                'This conversation expired, so I started fresh. '.($hadLink ? 'Your account is still linked — ' : '').'send /start.',
                $this->reportKeyboard());
        }
    }

    private function reportKeyboard(): InlineKeyboardMarkup
    {
        return InlineKeyboardMarkup::make()
            ->addRow(InlineKeyboardButton::make('📄 Report a problem', callback_data: 'start_report'))
            ->addRow(InlineKeyboardButton::make('❔ Help', callback_data: 'noop_help'));
    }

    private function photoKeyboard(): InlineKeyboardMarkup
    {
        return InlineKeyboardMarkup::make()
            ->addRow(
                InlineKeyboardButton::make('✅ Done', callback_data: 'photo_done'),
                InlineKeyboardButton::make('⏭ No photo', callback_data: 'photo_skip'),
            );
    }

    private function sharePhoneKeyboard(): ReplyKeyboardMarkup
    {
        return ReplyKeyboardMarkup::make(resize_keyboard: true, one_time_keyboard: true)
            ->addRow(KeyboardButton::make('📱 Share my phone number', request_contact: true));
    }

    private function categoryKeyboard(): InlineKeyboardMarkup
    {
        $categories = Category::where('active', true)->where('is_emergency', false)
            ->orderBy('name')->get(['slug', 'name']);
        $keyboard = InlineKeyboardMarkup::make();
        foreach ($categories->chunk(2) as $chunk) {
            $keyboard->addRow(...$chunk->map(fn (Category $category) => InlineKeyboardButton::make(
                $category->name,
                callback_data: 'cat_'.$category->slug,
            ))->all());
        }

        return $keyboard;
    }

    private function registerUrl(?string $phone = null): string
    {
        if ($phone !== null) {
            return URL::temporarySignedRoute('auth.register-prefill', now()->addMinutes(30), ['phone' => $phone]);
        }

        return rtrim((string) config('gamfix.frontend_url'), '/').'/app/signup';
    }

    private function send(Nutgram $bot, string $text, InlineKeyboardMarkup|ReplyKeyboardMarkup|ReplyKeyboardRemove|null $markup = null): void
    {
        try {
            $bot->sendMessage(text: $text, disable_web_page_preview: true, reply_markup: $markup);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
