<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;

class VerifyEmailUrl extends VerifyEmail
{
    protected function verificationUrl($notifiable): string
    {
        return URL::temporarySignedRoute(
            'email.verify',
            Carbon::now()->addMinutes(60),
            ['user' => $notifiable->getKey()],
        );
    }

    protected function buildMailMessage($url): MailMessage
    {
        return (new MailMessage)
            ->subject('Verify your GamFix email address')
            ->line('Welcome to GamFix! Please confirm your email address to continue.')
            ->action('Verify Email', $url)
            ->line('This link expires in 60 minutes. If you did not create a GamFix account, no action is needed.');
    }
}
