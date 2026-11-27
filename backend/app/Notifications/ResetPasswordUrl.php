<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

class ResetPasswordUrl extends ResetPassword
{
    protected function resetUrl($notifiable): string
    {
        return rtrim((string) config('gamfix.frontend_url'), '/')
            .'/reset-password?token='.$this->token.'&email='.urlencode($notifiable->email);
    }

    protected function buildMailMessage($url, $user): MailMessage
    {
        return (new MailMessage)
            ->subject('Reset your GamFix password')
            ->line('You are receiving this email because we received a password reset request for your account.')
            ->action('Reset Password', $url)
            ->line('This link expires in '.config('auth.passwords.'.config('auth.defaults.passwords').'.expire').' minutes.')
            ->line('If you did not request a password reset, no action is needed.');
    }
}
