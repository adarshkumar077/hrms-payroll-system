"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createTicketAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

// Hours-from-now choices for the SLA due date. "" (the default) defers to
// the tenant's configured per-priority SLA (Studio → SLA hours); "none" is
// an explicit opt-out (no SLA at all, always honored). createTicketAction
// computes the actual Date server-side — never trust a client timestamp.
const SLA_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default (by priority)" },
  { value: "none", label: "No SLA" },
  { value: "4", label: "4 hours" },
  { value: "8", label: "8 hours" },
  { value: "24", label: "24 hours" },
  { value: "48", label: "48 hours" },
];

export function CreateTicketForm({
  accountOptions,
  priorityOptions,
  typeOptions,
  defaultTypeKey,
  contractOptions,
  installedProductOptions,
  customFields,
}: {
  accountOptions: { id: string; name: string }[];
  priorityOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  defaultTypeKey?: string;
  contractOptions: { id: string; number: string; name: string }[];
  installedProductOptions: { id: string; name: string; serialNo: string | null; accountId: string }[];
  customFields: CustomFieldSpec[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Installed products are filtered to the chosen account when one is
  // selected; with no account chosen yet, show the full tenant list so the
  // field is still usable (accountId isn't required on a ticket).
  const filteredInstalledProducts = useMemo(
    () => (accountId ? installedProductOptions.filter((ip) => ip.accountId === accountId) : installedProductOptions),
    [installedProductOptions, accountId]
  );

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Ticket
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createTicketAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setError(null);
          formRef.current?.reset();
          setAccountId("");
          setOpen(false);
        })
      }
      className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {error && <div className="md:col-span-3 rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
      <div>
        <label className="label">Subject *</label>
        <input name="subject" required className="input" placeholder="Delayed shipment" />
      </div>
      <div>
        <label className="label">Type</label>
        <select name="typeKey" className="input" defaultValue={defaultTypeKey ?? ""}>
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Priority</label>
        <select name="priority" className="input" defaultValue="">
          <option value="">— Default —</option>
          {priorityOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Account</label>
        <select
          name="accountId"
          className="input"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">— None —</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Contract</label>
        <select name="contractId" className="input" defaultValue="">
          <option value="">— None —</option>
          {contractOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.number} — {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Installed Product</label>
        <select name="installedProductId" className="input" defaultValue="">
          <option value="">— None —</option>
          {filteredInstalledProducts.map((ip) => (
            <option key={ip.id} value={ip.id}>
              {ip.name}
              {ip.serialNo ? ` (${ip.serialNo})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Charges (₹)</label>
        <input name="charges" type="number" min={0} step="0.01" className="input" placeholder="0" />
      </div>
      <div>
        <label className="label">SLA</label>
        <select name="slaHours" className="input" defaultValue="">
          {SLA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create ticket"}
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
