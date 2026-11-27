<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign-in failed</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f4f5f7; margin: 0; min-height: 100vh; display: grid; place-items: center; }
        .card { background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.08); padding: 40px 44px; text-align: center; max-width: 380px; }
        .x { width: 54px; height: 54px; border-radius: 50%; background: #ef4444; color: #fff; display: grid; place-items: center; font-size: 28px; margin: 0 auto 18px; }
        h1 { font-size: 20px; margin: 0 0 8px; }
        p { color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="x">&#10007;</div>
        <h1>Sign-in failed</h1>
        <p>{{ $message }}</p>
    </div>
</body>
</html>
