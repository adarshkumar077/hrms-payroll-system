"use client";

import { useState, useTransition } from "react";
import { inviteUserAction } from "./actions";

type Role = { id: string; name: string };

export function InviteUserForm({ roles }: { roles: Role[] }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLink(null);
    start(async () => {
      const res = await inviteUserAction(email, name, roleId || null);
      if (res.ok) {
        setLink(res.link);
        setEmailed(res.emailed);
        setName("");
        setEmail("");
        setRoleId("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="card p-4 mb-4">
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            required
          />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">No role (unrestricted)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" disabled={pending} type="submit">
          {pending ? "Inviting…" : "Invite user"}
        </button>
      </form>

      {error && (
        <div className="mt-3 text-sm rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700">{error}</div>
      )}

      {link && emailed && (
        <div className="mt-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="font-medium text-emerald-800">Invite emailed.</div>
          <div className="text-emerald-700 mt-1">
            You can also share this accept link directly: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">{link}</code>
          </div>
        </div>
      )}

      {link && !emailed && (
        <div className="mt-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="font-medium text-emerald-800">Invite created — no email provider configured yet.</div>
          <div className="text-emerald-700 mt-1">
            Share this accept link: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">{link}</code>
          </div>
        </div>
      )}
    </div>
  );
}
