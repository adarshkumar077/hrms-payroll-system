"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { createActivityAction } from "./actions";
import type { ParsedRelatedTo } from "./relatedTo";

export type ActivityTypeOption = {
  value: string;
  label: string;
};

export function CreateActivityForm({
  typeOptions,
  ownerOptions,
  currentUserId,
  relatedTo,
}: {
  typeOptions: ActivityTypeOption[];
  ownerOptions: { id: string; name: string }[];
  currentUserId: string;
  relatedTo?: ParsedRelatedTo | null;
}) {
  // Auto-open when arriving via ?relatedTo=Module:id (e.g. a "+ Task" link
  // from another record) so the create form is already in front of the user.
  const [open, setOpen] = useState(!!relatedTo);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Task
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createActivityAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setError(null);
          formRef.current?.reset();
          setOpen(false);
        })
      }
      className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {error && <div className="md:col-span-3 rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
      {relatedTo && (
        <div className="md:col-span-3 flex items-center gap-2 rounded-lg text-sm px-3 py-2 bg-brand-50 text-brand-700">
          <span>Linked to</span>
          <Link href={relatedTo.href} className="font-medium hover:underline">
            {relatedTo.label} ↗
          </Link>
          <input type="hidden" name="relatedTo" value={`${relatedTo.module}:${relatedTo.id}`} />
        </div>
      )}
      <div>
        <label className="label">Subject *</label>
        <input name="subject" required className="input" placeholder="Follow up on quote" />
      </div>
      <div>
        <label className="label">Type</label>
        <select name="type" className="input" defaultValue={typeOptions[0]?.value || ""}>
          {typeOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Due date</label>
        <input name="dueDate" type="date" className="input" />
      </div>
      <div>
        <label className="label">Owner</label>
        <select name="ownerId" className="input" defaultValue={currentUserId}>
          <option value="">— Unassigned —</option>
          {ownerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
