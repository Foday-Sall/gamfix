<?php

// Laravel 12 public entry point (standard skeleton file).

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request.
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
