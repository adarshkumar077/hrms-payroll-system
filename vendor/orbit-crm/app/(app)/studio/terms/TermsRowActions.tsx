"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { deleteTermsAction, setDefaultAction } from "./actions";
import type { QuoteTerms } from "@prisma/client";

/**
 * One row of the QuoteTerms table. Shows name, body preview, default badge,
 * and actions. No inline editing — just show/delete/set-default actions.
 */
export function TermsRowActions({ term }: { term: QuoteTerms }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const bodyPreview = term.body.length > 80 ? term.body.substring(0, 80) + "…" : term.body;

  const handleDelete = () => {
    start(async () => {
      const res = await deleteTermsAction(term.id);
      setError(res?.error ?? null);
      if (!res?.error) setShowDeleteConfirm(false);
    });
  };

  const handleSetDefault = () => {
    start(async () => {
      const res = await setDefaultAction(term.id);
      setError(res?.error ?? null);
    });
  };

  return (
    <>
      <tr>
        <td className="td">{term.name}</td>
        <td className="td text-xs text-slate-500 font-mono">{bodyPreview}</td>
        <td className="td">
          {term.isDefault && <Badge tone="brand">default</Badge>}
        </td>
        <td className="td text-right flex flex-wrap gap-1 justify-end">
          {!term.isDefault && (
            <button
              className="btn-ghost text-xs py-1"
              disabled={pending}
              onClick={handleSetDefault}
            >
              {pending ? "…" : "Set default"}
            </button>
          )}
          <button
            className="btn-ghost text-xs py-1"
            disabled={pending}
            onClick={() => setShowDeleteConfirm(true)}
          >
            {pending ? "…" : "Delete"}
          </button>
        </td>
      </tr>

      {/* Delete confirmation row (slides out below) */}
      {showDeleteConfirm && (
        <tr className="bg-rose-50">
          <td colSpan={4} className="td">
            <div className="flex items-center justify-between">
              <span className="text-xs text-rose-700">Delete "{term.name}"? This cannot be undone.</span>
              <div className="flex gap-2">
                <button
                  className="btn-ghost text-xs py-1 text-rose-700 hover:bg-rose-100"
                  disabled={pending}
                  onClick={handleDelete}
                >
                  {pending ? "…" : "Confirm delete"}
                </button>
                <button
                  className="btn-ghost text-xs py-1"
                  disabled={pending}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
            {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
          </td>
        </tr>
      )}
    </>
  );
}
