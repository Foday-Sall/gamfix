<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\ImageManager;
use Laravel\Fortify\Contracts\UpdatesUserProfileInformation;
use Symfony\Component\HttpFoundation\Response;

class ProfileController extends Controller
{
    public function __construct(
        private UpdatesUserProfileInformation $updateProfile,
    ) {}

    public function update(ProfileUpdateRequest $request): JsonResponse
    {
        $user = $request->user();

        // Fortify profile pipeline (re-validates and saves; the
        // request-level rules already constrained the shape).
        $this->updateProfile->update($user, $request->validated());

        return response()->json($user->dto());
    }

    public function avatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'max:2048', 'mimes:png,jpg,jpeg,webp'],
        ]);

        $user = $request->user();
        $disk = Storage::disk('local');
        if ($user->avatar) {
            $disk->delete([
                $user->avatar,
                'avatars/'.$user->id.'/thumb_100_'.$user->id.'.png',
                'avatars/'.$user->id.'/thumb_300_'.$user->id.'.png',
            ]);
        }
        $path = 'avatars/'.$user->id.'/'.bin2hex(random_bytes(8)).'.'
            .strtolower($request->file('avatar')->getClientOriginalExtension() ?: 'png');
        $disk->put($path, $request->file('avatar')->getContent());
        $user->avatar = $path;

        try {
            $manager = new ImageManager(new GdDriver);
            foreach ([100, 300] as $size) {
                $image = $manager->read($request->file('avatar')->getRealPath())->cover($size, $size);
                $disk->put('avatars/'.$user->id.'/thumb_'.$size.'_'.$user->id.'.png', $image->toPng());
            }
        } catch (\Throwable $e) {
            report($e);
        }

        $user->save();

        return response()->json($user->dto());
    }

    public function show(Request $request, string $user, string $photo): Response
    {
        $target = User::find($user);
        if (! $target || ! $target->avatar || basename($target->avatar) !== $photo) {
            abort(404);
        }

        if (! Storage::disk('local')->exists($target->avatar)) {
            abort(404);
        }

        return Storage::disk('local')->response($target->avatar);
    }
}
