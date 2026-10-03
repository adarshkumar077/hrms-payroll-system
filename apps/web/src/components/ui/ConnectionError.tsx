'use client';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
};

/** Finite connection failure UI — never an infinite spinner. */
export function ConnectionError({
  title = 'Connection problem',
  message = 'Unable to reach the HRMS server. Check Wi‑Fi, then try again.',
  onRetry,
  retrying,
}: Props) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-light/40 px-4 py-5 text-center max-w-md mx-auto">
      <p className="font-display font-semibold text-ink-900">{title}</p>
      <p className="text-sm text-ink-600 mt-1.5">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="btn-primary mt-4 min-h-[44px] px-5"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
