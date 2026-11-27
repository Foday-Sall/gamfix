<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreComplaintRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'p_title' => ['required', 'string', 'min:3', 'max:120'],
            'p_description' => ['required', 'string', 'min:10', 'max:5000'],
            'p_category_hint' => ['sometimes', 'nullable', 'string', 'max:80'],
            'p_institution_code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'p_urgency_hint' => ['sometimes', 'nullable', 'string', 'max:20'],
            'p_council_area' => ['sometimes', 'nullable', 'string', 'max:80'],
            'p_region' => ['sometimes', 'nullable', 'string', 'max:80'],
            'p_ward' => ['sometimes', 'nullable', 'string', 'max:160'],
            'p_landmark' => ['sometimes', 'nullable', 'string', 'max:300'],
            'p_is_anonymous' => ['sometimes', 'boolean'],
            'p_lat' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'p_lng' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'p_external_id' => ['sometimes', 'nullable', 'string', 'max:100'],
            'p_channel' => ['sometimes', 'nullable', 'string', 'max:20'],
        ];
    }
}
