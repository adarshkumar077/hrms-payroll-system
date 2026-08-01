'use client';

export function UnsavedChangesDialog({
  open,
  onAction,
}: {
  open: boolean;
  onAction: (action: 'save' | 'discard' | 'cancel') => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg text-brand-700">Unsaved changes</h3>
        <p className="mt-2 text-sm text-ink/70">You have unsaved changes. What would you like to do?</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="px-3 py-2 text-sm rounded border border-mist" onClick={() => onAction('cancel')}>
            Cancel
          </button>
          <button type="button" className="px-3 py-2 text-sm rounded border border-red-200 text-red-700" onClick={() => onAction('discard')}>
            Discard
          </button>
          <button type="button" className="px-4 py-2 text-sm rounded bg-brand-600 text-white" onClick={() => onAction('save')}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
