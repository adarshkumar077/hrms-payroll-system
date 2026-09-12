"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createFieldAction } from "./actions";
import { FIELD_TYPES, SELECTABLE_MODULES } from "./constants";

type PicklistOption = { id: string; key: string; label: string };

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  longtext: "Long text",
  number: "Number",
  currency: "Currency",
  date: "Date",
  datetime: "Date & time",
  checkbox: "Checkbox",
  picklist: "Picklist (single-select)",
  multipicklist: "Multi-select picklist",
  phone: "Phone",
  email: "Email",
  url: "URL",
  lookup: "Lookup (link to another record)",
};

/** "New field" form for /studio/fields. Disables itself at the per-module cap. */
export function FieldForm({
  module,
  picklists,
  atCap,
  planCap,
  planName,
}: {
  module: string;
  picklists: PicklistOption[];
  atCap: boolean;
  planCap: number;
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>(FIELD_TYPES[0]);
  const [picklistMode, setPicklistMode] = useState<"existing" | "new">(picklists.length ? "existing" : "new");

  const wantsPicklist = type === "picklist" || type === "multipicklist";
  const wantsLookup = type === "lookup";

  if (atCap && !open) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        This module has reached the {planCap} custom field limit on the {planName} plan.{" "}
        <Link href="/billing" className="text-brand-700 font-medium hover:underline">
          Upgrade in Billing
        </Link>{" "}
        to add more.
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New field
      </button>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">New field on {module}</h3>
        <button className="btn-ghost text-xs py-1" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>

      {atCap && (
        <div className="mb-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          This module is at the {planCap} custom field limit on the {planName} plan — saving will be rejected until
          an existing field is archived or you{" "}
          <Link href="/billing" className="font-medium hover:underline">
            upgrade
          </Link>
          .
        </div>
      )}

      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            const res = await createFieldAction(fd);
            if (res?.error) setError(res.error);
            else setOpen(false);
          })
        }
        className="grid grid-cols-2 gap-3"
      >
        <input type="hidden" name="module" value={module} />

        <div>
          <label className="label">Label</label>
          <input name="label" className="input" placeholder="e.g. Vehicle Number" required disabled={atCap} />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            name="type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={atCap}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="label">Help text</label>
          <input name="helpText" className="input" placeholder="Shown under the field on the form (optional)" disabled={atCap} />
        </div>

        <label className="col-span-2 flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" name="required" disabled={atCap} />
          Required
        </label>

        {wantsPicklist && (
          <div className="col-span-2 card p-3 bg-slate-50">
            <div className="flex items-center gap-4 mb-2 text-xs text-slate-600">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="picklistMode"
                  value="existing"
                  checked={picklistMode === "existing"}
                  onChange={() => setPicklistMode("existing")}
                  disabled={atCap || picklists.length === 0}
                />
                Use existing list
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="picklistMode"
                  value="new"
                  checked={picklistMode === "new"}
                  onChange={() => setPicklistMode("new")}
                  disabled={atCap}
                />
                Create new list
              </label>
            </div>

            {picklistMode === "existing" ? (
              <select name="picklistId" className="input" disabled={atCap || picklists.length === 0}>
                {picklists.length === 0 && <option value="">No picklists yet — create one instead</option>}
                {picklists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.key})
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <input name="newPicklistName" className="input" placeholder="e.g. Vehicle Type" disabled={atCap} />
                <p className="text-xs text-slate-400 mt-1">
                  Creates an empty list — add options afterwards in the picklist editor.
                </p>
              </div>
            )}
          </div>
        )}

        {wantsLookup && (
          <div className="col-span-2">
            <label className="label">Links to</label>
            <select name="lookupModule" className="input" disabled={atCap}>
              {SELECTABLE_MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <div className="col-span-2 text-sm text-rose-600">{error}</div>}

        <div className="col-span-2 flex justify-end">
          <button className="btn" disabled={pending || atCap}>
            {pending ? "Creating…" : "Create field"}
          </button>
        </div>
      </form>
    </div>
  );
}
