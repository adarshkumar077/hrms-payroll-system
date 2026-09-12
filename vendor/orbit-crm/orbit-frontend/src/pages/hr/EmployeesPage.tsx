import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError, inrLakh } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type Employee = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  department?: string | null;
  designation?: string | null;
  ctc: number;
  active?: boolean;
};

const emptyForm = { name: "", email: "", department: "", designation: "", ctc: "" };

export function EmployeesPage() {
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setErr("");
    apiGet<any>("/hr/employees")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  function openModal() {
    setForm(emptyForm);
    setFormErr("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormErr("Name is required.");
      return;
    }
    if (!form.ctc || Number(form.ctc) <= 0) {
      setFormErr("CTC must be a positive number.");
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await apiPost("/hr/employees", {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        department: form.department.trim() || undefined,
        designation: form.designation.trim() || undefined,
        ctc: Number(form.ctc),
      });
      setOpen(false);
      load();
    } catch (e: any) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to add employee.");
    } finally {
      setSaving(false);
    }
  }

  const totalCtc = (rows || []).reduce((s, r) => s + Number(r.ctc || 0), 0);

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={rows ? `${rows.length} employee${rows.length === 1 ? "" : "s"}` : undefined}
        action={
          <button className="btn" onClick={openModal}>
            + Add Employee
          </button>
        }
      />

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard label="Headcount" value={String(rows.length)} accent="brand" />
          <StatCard label="Total CTC (annual)" value={inrLakh(totalCtc)} accent="green" />
          <StatCard
            label="Active"
            value={String(rows.filter((r) => r.active === undefined || r.active === true || Number(r.active) === 1).length)}
            accent="blue"
          />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Code</th>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Department</th>
              <th className="th">Designation</th>
              <th className="th">CTC (annual)</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No employees yet.
                </td>
              </tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.id}>
                <td className="td">{r.code}</td>
                <td className="td font-medium text-slate-800">{r.name}</td>
                <td className="td">{r.email || <span className="text-slate-300">—</span>}</td>
                <td className="td">{r.department || <span className="text-slate-300">—</span>}</td>
                <td className="td">{r.designation || <span className="text-slate-300">—</span>}</td>
                <td className="td">{inrLakh(Number(r.ctc || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Add Employee" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
                autoFocus
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@company.com"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">
                <input
                  className="input"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Engineering"
                />
              </Field>
              <Field label="Designation">
                <input
                  className="input"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="Software Engineer"
                />
              </Field>
            </div>
            <Field label="CTC (annual, ₹)">
              <input
                className="input"
                type="number"
                min="0"
                step="1000"
                value={form.ctc}
                onChange={(e) => setForm({ ...form, ctc: e.target.value })}
                placeholder="1200000"
              />
            </Field>
            <p className="text-xs text-slate-400">
              A compliant salary structure (basic/HRA/allowances) is auto-created from CTC.
            </p>
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Saving…" : "Add Employee"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
