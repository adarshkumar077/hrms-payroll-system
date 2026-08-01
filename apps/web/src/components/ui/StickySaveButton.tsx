'use client';

type Props = {
  saving?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
};

export function StickySaveButton({ saving, disabled, onClick, label = 'Save' }: Props) {
  return (
    <div className="fixed top-[4.25rem] right-4 z-40">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
        )}
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
}
