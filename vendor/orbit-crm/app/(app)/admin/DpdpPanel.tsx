"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportTenantDataAction, deleteOrganizationAction } from "./actions";

export function ExportDataButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    start(async () => {
      try {
        const json = await exportTenantDataAction();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orbit-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        setError(e?.message || "Export failed.");
      }
    });
  }

  return (
    <div>
      <button className="btn-ghost" onClick={download} disabled={pending}>
        {pending ? "Preparing export…" : "⬇ Export my data"}
      </button>
      {error && <div className="mt-2 text-sm text-rose-700">{error}</div>}
    </div>
  );
}

export function DeleteOrgButton({ orgName, isCeo }: { orgName: string; isCeo: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!isCeo) {
    return <p className="text-sm text-slate-400">Only the CEO can delete the organization.</p>;
  }

  if (!open) {
    return (
      <button className="btn-ghost text-rose-700 border-rose-200 hover:bg-rose-50" onClick={() => setOpen(true)}>
        Delete organization
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm text-rose-800 font-medium">
        This permanently deletes all data for &quot;{orgName}&quot; — users, CRM, HR, payroll, inventory and finance
        records. This cannot be undone.
      </p>
      <p className="text-sm text-rose-700 mt-2">
        Type <span className="font-mono font-semibold">{orgName}</span> to confirm.
      </p>
      <input
        className="input mt-2 max-w-sm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={orgName}
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          className="btn bg-rose-600 hover:bg-rose-700"
          disabled={pending || confirmText !== orgName}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await deleteOrganizationAction(confirmText);
              if (res.ok) {
                router.push("/login");
              } else {
                setError(res.error);
              }
            })
          }
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
      {error && <div className="mt-2 text-sm text-rose-700">{error}</div>}
    </div>
  );
}
