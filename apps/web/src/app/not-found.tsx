import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-3xl text-brand-700">Page not found</h1>
      <p className="text-sm text-ink/60 max-w-md">
        The page you requested does not exist or you may not have permission to view it.
      </p>
      <Link href="/dashboard" className="bg-brand-600 text-white px-4 py-2 rounded text-sm">
        Go to dashboard
      </Link>
    </main>
  );
}
