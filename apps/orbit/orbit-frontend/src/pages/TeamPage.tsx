import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, ApiError } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Modal, Field } from "../components/Modal";
import { useAuth } from "../lib/auth";

type Member = {
  id: string;
  name: string;
  email: string;
  is_ceo: boolean;
  active: boolean;
  role_id: string | null;
};

type Role = { id: string; name: string };

const emptyForm = { name: "", email: "", password: "", role_id: "" };

// Team list: CEO can invite members, toggle active/inactive, and assign roles.
// Non-CEO users see a read-only roster.
export function TeamPage() {
  const { user } = useAuth();
  const isCeo = !!user?.is_ceo;

  const [rows, setRows] = useState<Member[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setErr("");
    apiGet<Member[]>("/team")
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    load();
    if (isCeo) {
      apiGet<Role[]>("/roles").then((r) => setRoles(Array.isArray(r) ? r : [])).catch(() => {});
    }
  }, [isCeo]);

  async function submit() {
    setFormErr("");
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    if (!form.email.trim()) { setFormErr("Email is required."); return; }
    if (form.password.length < 8) { setFormErr("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await apiPost("/team", {
        name: form.name,
        email: form.email,
        password: form.password,
        role_id: form.role_id || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to invite member.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: Member) {
    setBusyId(row.id);
    setErr("");
    try {
      const updated = await apiPatch<Member>(`/team/${row.id}`, { active: !row.active });
      setRows((rs) => (rs || []).map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to update member.");
    } finally {
      setBusyId(null);
    }
  }

  async function setRole(row: Member, role_id: string) {
    setBusyId(row.id);
    setErr("");
    try {
      const updated = await apiPatch<Member>(`/team/${row.id}`, { role_id: role_id || null });
      setRows((rs) => (rs || []).map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to update role.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={rows ? `${rows.length} member${rows.length === 1 ? "" : "s"}` : undefined}
        action={isCeo ? <button className="btn" onClick={() => { setForm(emptyForm); setFormErr(""); setOpen(true); }}>+ Invite member</button> : undefined}
      />
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              {isCeo && <th className="th"></th>}
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td className="td text-slate-400" colSpan={isCeo ? 5 : 4}>Loading…</td></tr>
            )}
            {rows !== null && rows.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={isCeo ? 5 : 4}>No team members yet.</td></tr>
            )}
            {rows?.map((row) => (
              <tr key={row.id}>
                <td className="td font-medium text-slate-800">
                  {row.name}{row.is_ceo && <span className="badge ml-2">CEO</span>}
                </td>
                <td className="td">{row.email}</td>
                <td className="td">
                  {isCeo && !row.is_ceo ? (
                    <select
                      className="input py-1 text-xs w-36"
                      value={row.role_id || ""}
                      disabled={busyId === row.id}
                      onChange={(e) => setRole(row, e.target.value)}
                    >
                      <option value="">— None —</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (
                    roles.find((r) => r.id === row.role_id)?.name || <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="td">
                  <span className={`badge ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {row.active ? "Active" : "Inactive"}
                  </span>
                </td>
                {isCeo && (
                  <td className="td">
                    {!row.is_ceo && (
                      <button
                        className="btn-ghost text-xs py-1"
                        disabled={busyId === row.id}
                        onClick={() => toggleActive(row)}
                      >
                        {busyId === row.id ? "Saving…" : row.active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Invite Member" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Name *">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email *">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Password *">
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <select className="input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
                <option value="">— None —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Inviting…" : "Invite Member"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
