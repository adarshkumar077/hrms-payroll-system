"use client";

import { useState, useTransition } from "react";
import { updateRolePermissionsAction, createRoleAction } from "./actions";

type Role = { id: string; name: string; permissions: string; _count?: { users: number } };

export function RoleEditor({ roles }: { roles: Role[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {roles.map((role) => (
        <RoleRow
          key={role.id}
          role={role}
          open={openId === role.id}
          onToggle={() => setOpenId(openId === role.id ? null : role.id)}
        />
      ))}

      <div className="card p-4">
        {creating ? (
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                await createRoleAction(newRoleName);
                setNewRoleName("");
                setCreating(false);
              });
            }}
          >
            <div className="flex-1">
              <label className="label">New role name</label>
              <input className="input" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required autoFocus />
            </div>
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create role"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button className="btn-ghost text-sm" onClick={() => setCreating(true)}>
            + New role
          </button>
        )}
      </div>
    </div>
  );
}

function RoleRow({ role, open, onToggle }: { role: Role; open: boolean; onToggle: () => void }) {
  const [json, setJson] = useState(role.permissions);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateRolePermissionsAction(role.id, json);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900">{role.name}</div>
          <div className="text-xs text-slate-500">{role._count?.users ?? 0} user(s)</div>
        </div>
        <button className="btn-ghost text-xs py-1" onClick={onToggle}>
          {open ? "Close" : "Edit permissions"}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 mb-2">
            Shape: <code className="font-mono">{`{ "leads": ["read","write"], "payroll": ["read"], "_fields": {"opportunity.amount":"hidden"} }`}</code>
            {" "}— top-level keys are modules mapped to allowed actions; <code className="font-mono">_fields</code> hides specific fields per role.
          </p>
          <textarea
            className="input font-mono text-xs h-40"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 flex items-center gap-3">
            <button className="btn" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save permissions"}
            </button>
            {saved && <span className="text-sm text-emerald-700">Saved.</span>}
            {error && <span className="text-sm text-rose-700">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
