"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  function onSubmit(formData: FormData) {
    setMessage(null);
    start(async () => {
      const result = await changePasswordAction(formData);
      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "ok", text: "Password updated." });
        const form = document.getElementById("change-password-form") as HTMLFormElement | null;
        form?.reset();
      }
    });
  }

  return (
    <form id="change-password-form" action={onSubmit} className="space-y-4 max-w-sm">
      {message && (
        <div
          className={`rounded-lg text-sm px-3 py-2 ${
            message.type === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      )}
      <div>
        <label className="label">Current password</label>
        <input name="current" type="password" className="input" required disabled={pending} />
      </div>
      <div>
        <label className="label">New password</label>
        <input name="next" type="password" className="input" required minLength={8} disabled={pending} />
      </div>
      <button className="btn" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}
