<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // Module route files that self-prefix 'api' load standalone here
            // (hr.php, finance.php). Files that self-prefix their module name
            // (crm.php, inventory.php) are required from within routes/api.php.
            Route::middleware('api')->group(base_path('routes/hr.php'));
            Route::middleware('api')->group(base_path('routes/finance.php'));
            Route::middleware('api')->group(base_path('routes/ai.php'));
            Route::middleware('api')->group(base_path('routes/settings.php'));
            Route::middleware('api')->group(base_path('routes/reports.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
