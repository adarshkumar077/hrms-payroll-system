'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="font-display text-lg font-semibold text-ink-900">Something went wrong</h2>
      <p className="text-sm text-ink-500 max-w-md">
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      <button
        type="button"
        className="bg-brand-600 text-white px-4 py-2 rounded"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
