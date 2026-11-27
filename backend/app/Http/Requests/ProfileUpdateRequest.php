<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProfileUpdateRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'full_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'avatar' => ['sometimes', 'nullable', 'image', 'max:2048', 'mimes:png,jpg,jpeg,webp'],
        ];
    }
}
