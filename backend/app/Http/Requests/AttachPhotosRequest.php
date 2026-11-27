<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AttachPhotosRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'photos' => ['required', 'array', 'min:1', 'max:5'],
            'photos.*' => ['required', 'file', 'image', 'max:10240', 'mimes:jpg,jpeg,png,webp'],
        ];
    }
}
