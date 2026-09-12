"use client";

// Tiny client island so the print routes stay server components everywhere else.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition"
    >
      Print / Save PDF
    </button>
  );
}
