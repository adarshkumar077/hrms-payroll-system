"use client";

// LIST FRAMEWORK (E1): client half of SavedSearchBar (components/SavedSearchBar.tsx,
// a server component — this file only holds the bits that need interactivity:
// the save-view mini-form and the star/delete buttons on each chip). Mirrors
// the useTransition + inline-error pattern of components/TagChips.tsx.

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveViewAction, deleteViewAction, setDefaultViewAction, unsetDefaultViewAction } from "@/app/(app)/saved-searches/actions";

export function SaveViewForm({
  module,
  currentParamsJson,
  canShare,
}: {
  module: string;
  currentParamsJson: string;
  /** CEO/admin gate for the "Shared" checkbox — non-admins can only save
   *  personal views (server action re-checks this; the checkbox is just UX). */
  canShare: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    start(async () => {
      const res = await saveViewAction(module, trimmed, currentParamsJson, shared);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setName("");
      setShared(false);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(true)}>
        + Save view
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="inline-flex items-center gap-1"
    >
      <input
        className="input !py-1 text-xs w-32"
        placeholder="View name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        maxLength={60}
        autoFocus
      />
      {canShare && (
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={pending} />
          Shared
        </label>
      )}
      <button type="submit" className="btn-ghost text-xs" disabled={pending || !name.trim()}>
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        disabled={pending}
      >
        Cancel
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  );
}

export function SavedSearchChip({
  id,
  name,
  href,
  isDefault,
  canManage,
  shared,
}: {
  id: string;
  name: string;
  href: string;
  isDefault: boolean;
  /** Own view, or any view if the caller is CEO/admin — gates both the star
   *  toggle and the delete button (server actions re-check ownership too). */
  canManage: boolean;
  shared: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <span className="badge bg-slate-100 text-slate-600 inline-flex items-center gap-1">
      <Link href={href} className="hover:underline">
        {name}
      </Link>
      {shared && (
        <span title="Shared with the whole team" className="text-[10px]">
          🌐
        </span>
      )}
      {canManage && (
        <button
          type="button"
          title={isDefault ? "Default view — click to unstar" : "Set as default view"}
          className="leading-none opacity-70 hover:opacity-100"
          disabled={pending}
          onClick={() => start(() => (isDefault ? unsetDefaultViewAction(id) : setDefaultViewAction(id)))}
        >
          {isDefault ? "★" : "☆"}
        </button>
      )}
      {canManage && (
        <button
          type="button"
          title={`Delete "${name}"`}
          className="leading-none opacity-60 hover:opacity-100"
          disabled={pending}
          onClick={() => start(() => deleteViewAction(id))}
          aria-label={`Delete view ${name}`}
        >
          ✕
        </button>
      )}
    </span>
  );
}
