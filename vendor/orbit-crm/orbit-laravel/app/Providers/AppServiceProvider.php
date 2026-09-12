<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login/signup throttle: 10 attempts/min per IP+email in production,
        // unlimited under tests so the feature suite isn't rate-limited.
        RateLimiter::for('login', function (Request $request) {
            if ($this->app->environment('testing')) {
                return Limit::none();
            }

            return Limit::perMinute(10)->by($request->ip().'|'.(string) $request->input('email'));
        });
    }
}
