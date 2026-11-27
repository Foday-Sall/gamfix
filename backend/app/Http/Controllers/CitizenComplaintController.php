<?php

namespace App\Http\Controllers;

use App\Http\Requests\AttachPhotosRequest;
use App\Http\Requests\StoreComplaintRequest;
use App\Models\Complaint;
use App\Services\ComplaintService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class CitizenComplaintController extends Controller
{
    public function __construct(private ComplaintService $creator) {}

    public function store(StoreComplaintRequest $request): JsonResponse
    {
        $data = $request->validated();

        $result = $this->creator->create($request->user(), $data);

        if (! $result['ok']) {
            return response()->json(['error' => $result['error']], $result['status']);
        }

        return response()->json($result['data']);
    }

    public function index(Request $request): JsonResponse
    {
        $rows = Complaint::with(['institution', 'category'])
            ->where('citizen_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(500)
            ->get()
            ->map(fn (Complaint $c) => $c->citizenDto());

        return response()->json(['complaints' => $rows]);
    }

    public function attachPhotos(AttachPhotosRequest $request, string $complaint): JsonResponse
    {
        $validated = $request->validated();
        $disk = Storage::disk('local');
        $ownerId = $request->user()->id;

        // The cap check and the merge run inside one row lock: two concurrent
        // uploads can never both pass the room check and overshoot 5 photos.
        $result = DB::transaction(function () use ($complaint, $ownerId, $validated, $disk) {
            $row = Complaint::whereKey($complaint)->lockForUpdate()->first();
            if (! $row || $row->citizen_id !== $ownerId) {
                return ['status' => 403, 'error' => 'Only the report owner can attach photos.'];
            }

            $existing = $row->photos ?? [];
            $room = max(0, 5 - count($existing));
            if (count($validated['photos']) > $room) {
                return ['status' => 422, 'error' => $room === 0
                    ? 'This report already has the maximum of 5 photos.'
                    : "This report can take {$room} more photo".($room === 1 ? '' : 's').'.'];
            }

            $paths = [];
            foreach ($validated['photos'] as $photo) {
                $path = 'complaints/'.$row->id.'/'.bin2hex(random_bytes(8)).'.'
                    .strtolower($photo->getClientOriginalExtension() ?: 'jpg');
                $disk->put($path, $photo->getContent());
                $paths[] = $path;
            }

            try {
                $row->photos = array_merge($existing, $paths);
                $row->save();
            } catch (\Throwable $e) {
                foreach ($paths as $path) {
                    $disk->delete($path);
                }
                report($e);

                return ['status' => 500, 'error' => 'Could not attach the photos. Please try again.'];
            }

            return ['status' => 200, 'photos' => $row->photos];
        });

        if ($result['status'] !== 200) {
            return response()->json(['error' => $result['error']], $result['status']);
        }

        return response()->json(['ok' => true, 'photos' => $result['photos']]);
    }

    public function photo(Request $request, string $complaint, string $photo): Response
    {
        $row = Complaint::find($complaint);
        if (! $row || ! is_array($row->photos) || ! in_array($photo, $row->photos, true)) {
            abort(404);
        }

        $disk = Storage::disk('local');
        if (! $disk->exists($photo)) {
            abort(404);
        }

        return $disk->response($photo);
    }
}
