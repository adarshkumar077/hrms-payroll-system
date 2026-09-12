<?php

namespace App\Services;

use App\Models\EventLog;
use App\Models\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Notification dispatch — ported 1:1 from lib/notify.ts + lib/events.ts.
 *
 * Always creates an in-app Notification row. Email is PLUGGABLE: reuses Laravel's
 * own MAIL_* env (config/mail.php) — when MAIL_MAILER is set to a real transport
 * (not the "log"/"array" defaults) and host/credentials/from-address are present,
 * `notify()` best-effort sends via the Mail facade. Otherwise it no-ops (logged).
 * Same graceful-degradation law as AiService/OcrService: never throws.
 */
class Notifier
{
    /**
     * Event type -> notification rule. Mirrors lib/events.ts NOTIFY_RULES.
     * Add an entry here to make a new event type "notification-worthy" without
     * hand-calling notify() at every call site.
     *
     * @var array<string, array{title: string, link?: string}>
     */
    private const NOTIFY_RULES = [
        'invoice.finalized' => ['title' => 'Invoice finalized', 'link' => '/finance/invoices'],
        'payment.recorded' => ['title' => 'Payment recorded', 'link' => '/finance/invoices'],
        'payroll.run.locked' => ['title' => 'Payroll run locked', 'link' => '/payroll'],
        'lead.captured' => ['title' => 'New lead captured', 'link' => '/leads'],
    ];

    /** True only when a real (non-log/array) mailer is fully configured. */
    public static function emailConfigured(): bool
    {
        $mailer = env('MAIL_MAILER');

        return (bool) (
            $mailer
            && ! in_array($mailer, ['log', 'array', null], true)
            && env('MAIL_HOST')
            && env('MAIL_USERNAME')
            && env('MAIL_PASSWORD')
            && env('MAIL_FROM_ADDRESS')
        );
    }

    /**
     * Create an in-app notification row. Best-effort emails $to when SMTP is
     * configured; never throws — a delivery failure must never break the caller.
     */
    public static function notify(
        string $tenantId,
        ?string $userId,
        string $type,
        string $title,
        ?string $link = null,
        ?string $body = null,
        ?string $to = null,
    ): Notification {
        $n = Notification::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'body' => $body ?? '',
            'link' => $link,
        ]);

        if ($to && self::emailConfigured()) {
            try {
                Mail::raw($body ?? $title, function ($message) use ($to, $title) {
                    $message->to($to)->subject($title);
                });
            } catch (Throwable $e) {
                Log::warning("[notifier] email dispatch failed (non-fatal): {$e->getMessage()}");
            }
        }

        return $n;
    }

    /**
     * The event bus. Every meaningful module write should emit() — the cockpit and
     * automation engine read from EventLog. Writes an EventLog row and, for
     * "notification-worthy" event types (NOTIFY_RULES), best-effort fires a
     * matching in-app notification. A notification failure never breaks the
     * caller's write path or makes emit() itself throw.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function emit(
        string $tenantId,
        string $type,
        string $entity,
        string $entityId,
        array $payload = [],
        ?string $actorId = null,
    ): EventLog {
        $row = EventLog::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'type' => $type,
            'entity' => $entity,
            'entity_id' => $entityId,
            'payload' => json_encode($payload ?: (object) []),
            'actor_id' => $actorId,
        ]);

        $rule = self::NOTIFY_RULES[$type] ?? null;
        if ($rule) {
            try {
                self::notify($tenantId, null, $type, $rule['title'], $rule['link'] ?? null);
            } catch (Throwable $e) {
                Log::warning("[notifier] notify() failed for {$type} (non-fatal): {$e->getMessage()}");
            }
        }

        return $row;
    }

    public static function recentEvents(string $tenantId, int $limit = 15)
    {
        return EventLog::forTenant($tenantId)->orderByDesc('created_at')->take($limit)->get();
    }

    public static function unreadCount(string $tenantId, string $userId): int
    {
        return Notification::forTenant($tenantId)
            ->where('read', false)
            ->where(fn ($q) => $q->where('user_id', $userId)->orWhereNull('user_id'))
            ->count();
    }

    public static function listNotifications(string $tenantId, string $userId, int $take = 30)
    {
        return Notification::forTenant($tenantId)
            ->where(fn ($q) => $q->where('user_id', $userId)->orWhereNull('user_id'))
            ->orderByDesc('created_at')
            ->take($take)
            ->get();
    }

    public static function markAllRead(string $tenantId, string $userId): int
    {
        return Notification::forTenant($tenantId)
            ->where('read', false)
            ->where(fn ($q) => $q->where('user_id', $userId)->orWhereNull('user_id'))
            ->update(['read' => true]);
    }
}
