import { type ReactNode } from "react";

export type DetailField = { label: string; value: ReactNode };

// Reusable right-side detail drawer. Render conditionally: {open && <DetailDrawer ...>}.
// Shows a read-only list of fields for the selected record, with optional Edit/Delete actions.
export function DetailDrawer({
  title,
  subtitle,
  fields,
  onClose,
  onEdit,
  onDelete,
  deleting,
  children,
}: {
  title: string;
  subtitle?: string;
  fields: DetailField[];
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="card h-full w-full max-w-md rounded-none overflow-y-auto p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={i}>
              <div className="label mb-0.5">{f.label}</div>
              <div className="text-sm text-slate-800">{f.value ?? <span className="text-slate-300">—</span>}</div>
            </div>
          ))}
        </div>

        {children}

        {(onEdit || onDelete) && (
          <div className="flex justify-end gap-2 pt-6 mt-6 border-t border-slate-100">
            {onDelete && (
              <button
                className="btn-ghost text-rose-600 hover:text-rose-700 disabled:opacity-50"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            {onEdit && (
              <button className="btn" onClick={onEdit}>Edit</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
