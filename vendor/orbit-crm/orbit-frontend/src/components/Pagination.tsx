// Presentational pagination control. Callers own the page state and data fetch;
// this just renders Prev / "Page X of Y · N records" / Next.
export interface PaginationProps {
  page: number;
  lastPage: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, lastPage, total, onPage }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="btn-ghost py-1.5 px-3 text-sm disabled:opacity-50"
      >
        ← Prev
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {lastPage} · {total} records
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(lastPage, page + 1))}
        disabled={page >= lastPage}
        className="btn-ghost py-1.5 px-3 text-sm disabled:opacity-50"
      >
        Next →
      </button>
    </div>
  );
}
