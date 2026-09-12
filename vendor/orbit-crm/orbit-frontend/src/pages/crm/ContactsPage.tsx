import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, ApiError } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type Account = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  account_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
};

const emptyForm = { account_id: "", name: "", email: "", phone: "", title: "" };

// Contacts list: search + create modal + delete.
export function ContactsPage() {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/contacts")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  const loadAccounts = () => {
    apiGet<any>("/crm/accounts")
      .then((r) => setAccounts(Array.isArray(r) ? r : r?.data ?? []))
      .catch(() => setAccounts([]));
  };

  useEffect(() => {
    load();
    loadAccounts();
  }, []);

  const filtered = (rows || []).filter((row) =>
    !q ||
    [row.name, row.email, row.phone, row.title].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.name || accountId;
  };

  async function submit() {
    setFormErr("");
    if (!form.account_id.trim()) { setFormErr("Account is required."); return; }
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/contacts", {
        account_id: form.account_id,
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        title: form.title || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create contact.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    setDeleting(id);
    try {
      await apiDelete(`/crm/contacts/${id}`);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete contact.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={() => { setForm(emptyForm); setFormErr(""); setOpen(true); }}>+ New Contact</button>}
      />
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Account</th>
              <th className="th">Email</th>
              <th className="th">Phone</th>
              <th className="th">Title</th>
              <th className="th">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td className="td text-slate-400" colSpan={6}>Loading…</td></tr>
            )}
            {rows !== null && filtered.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={6}>No records yet.</td></tr>
            )}
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="td font-medium text-slate-800">{row.name}</td>
                <td className="td text-sm text-slate-600">{getAccountName(row.account_id)}</td>
                <td className="td text-sm">{row.email || <span className="text-slate-300">—</span>}</td>
                <td className="td text-sm">{row.phone || <span className="text-slate-300">—</span>}</td>
                <td className="td text-sm">{row.title || <span className="text-slate-300">—</span>}</td>
                <td className="td">
                  <button
                    className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    onClick={() => deleteContact(row.id)}
                    disabled={deleting === row.id}
                  >
                    {deleting === row.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="New Contact" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Account *">
              <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Choose account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Name *">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Title">
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Contact"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
