"use client";

import { useRef, useState } from "react";
import { addEmployee } from "./actions";

export function AddEmployeeForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        {open ? "Close" : "+ Add employee"}
      </button>

      {open && (
        <form
          ref={formRef}
          action={async (fd) => {
            await addEmployee(fd);
            formRef.current?.reset();
            setOpen(false);
          }}
          className="card p-4 mt-3 grid gap-3 md:grid-cols-2"
        >
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" placeholder="Full name" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" placeholder="name@company.com" />
          </div>
          <div>
            <label className="label">Department</label>
            <input name="department" className="input" placeholder="Engineering" />
          </div>
          <div>
            <label className="label">Designation</label>
            <input name="designation" className="input" placeholder="Software Engineer" />
          </div>
          <div>
            <label className="label">Annual CTC (₹)</label>
            <input name="ctc" type="number" min="0" step="1000" className="input" placeholder="1200000" required />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn">
              Create + salary structure
            </button>
          </div>
          <p className="md:col-span-2 text-xs text-slate-400">
            A Labour-Code compliant salary structure (basic = 50% of gross) is auto-generated from monthly gross = CTC / 12.
          </p>
        </form>
      )}
    </div>
  );
}
