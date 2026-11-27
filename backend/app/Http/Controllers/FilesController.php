<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class FilesController extends Controller
{
    public function logo(string $institution, string $photo): Response
    {
        $row = Institution::find($institution);
        if (! $row || ! $row->logo || basename($row->logo) !== $photo) {
            abort(404);
        }

        if (! Storage::disk('local')->exists($row->logo)) {
            abort(404);
        }

        return Storage::disk('local')->response($row->logo);
    }
}
