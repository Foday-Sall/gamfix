<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TrackRequest extends FormRequest
{
    public function rules(): array
    {
        return ['p_tracking_no' => ['required', 'string', 'max:32']];
    }
}
