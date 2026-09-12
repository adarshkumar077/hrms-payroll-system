<?php

// CORS for the static SPA. Auth is a bearer token (not cookies), so credentials
// are off and origins are restricted to the configured front-end host(s).
// In production set FRONTEND_URLS to your SPA domain(s), comma-separated.
return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => explode(',', env('FRONTEND_URLS', 'http://localhost:5173,http://127.0.0.1:5173')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
