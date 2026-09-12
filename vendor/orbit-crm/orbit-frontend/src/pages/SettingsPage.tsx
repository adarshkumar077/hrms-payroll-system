import { useState } from "react";
import { apiPost, apiPatch, ApiError } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Field } from "../components/Modal";
import { useAuth } from "../lib/auth";

// Profile + password + 2FA settings for the current user.
export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile, password, and two-factor authentication." />
      <div className="space-y-6 max-w-xl">
        <ProfileCard name={user?.name} />
        <PasswordCard />
        <TwoFactorCard enabledInitially={(user as any)?.two_factor_enabled} />
      </div>
    </div>
  );
}

function ProfileCard({ name }: { name?: string }) {
  const [value, setValue] = useState(name || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setErr("");
    setOk(false);
    if (!value.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    try {
      await apiPatch("/profile", { name: value });
      setOk(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">Profile</h2>
      {err && <div className="mb-3 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      {ok && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">Profile updated.</div>}
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={value} onChange={(e) => { setValue(e.target.value); setOk(false); }} />
        </Field>
        <div className="flex justify-end">
          <button className="btn" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setErr("");
    setOk(false);
    if (!current) { setErr("Current password is required."); return; }
    if (next.length < 8) { setErr("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setErr("New password and confirmation do not match."); return; }
    setSaving(true);
    try {
      await apiPost("/change-password", { current_password: current, new_password: next });
      setOk(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">Change Password</h2>
      {err && <div className="mb-3 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      {ok && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">Password updated.</div>}
      <div className="space-y-3">
        <Field label="Current Password">
          <input className="input" type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setOk(false); }} />
        </Field>
        <Field label="New Password">
          <input className="input" type="password" value={next} onChange={(e) => { setNext(e.target.value); setOk(false); }} />
        </Field>
        <Field label="Confirm New Password">
          <input className="input" type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setOk(false); }} />
        </Field>
        <div className="flex justify-end">
          <button className="btn" disabled={saving} onClick={save}>{saving ? "Updating…" : "Update Password"}</button>
        </div>
      </div>
    </div>
  );
}

function TwoFactorCard({ enabledInitially }: { enabledInitially?: boolean }) {
  const [enabled, setEnabled] = useState(!!enabledInitially);
  const [pending, setPending] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function begin() {
    setErr("");
    setOk("");
    setBusy(true);
    try {
      const res = await apiPost<{ secret: string; otpauth_uri: string }>("/2fa/begin");
      setPending(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to start 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setErr("");
    if (!code.trim()) { setErr("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    try {
      await apiPost("/2fa/confirm", { code });
      setEnabled(true);
      setPending(null);
      setCode("");
      setOk("Two-factor authentication enabled.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setErr("");
    if (!password) { setErr("Enter your password to disable 2FA."); return; }
    setBusy(true);
    try {
      await apiPost("/2fa/disable", { password });
      setEnabled(false);
      setPassword("");
      setOk("Two-factor authentication disabled.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-800">Two-Factor Authentication</h2>
        <span className={`badge ${enabled ? "bg-emerald-50 text-emerald-700" : ""}`}>{enabled ? "Enabled" : "Disabled"}</span>
      </div>
      {err && <div className="mb-3 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      {ok && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">{ok}</div>}

      {!enabled && !pending && (
        <div className="flex justify-end">
          <button className="btn" disabled={busy} onClick={begin}>{busy ? "Starting…" : "Enable 2FA"}</button>
        </div>
      )}

      {!enabled && pending && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Add this to your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code below.
          </p>
          <Field label="Setup key (secret)">
            <input className="input font-mono text-xs" readOnly value={pending.secret} onClick={(e) => (e.target as HTMLInputElement).select()} />
          </Field>
          <Field label="otpauth URI">
            <input className="input font-mono text-xs" readOnly value={pending.otpauth_uri} onClick={(e) => (e.target as HTMLInputElement).select()} />
          </Field>
          <Field label="6-digit code">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" disabled={busy} onClick={() => { setPending(null); setCode(""); }}>Cancel</button>
            <button className="btn" disabled={busy} onClick={confirm}>{busy ? "Confirming…" : "Confirm & Enable"}</button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Enter your password to disable two-factor authentication.</p>
          <Field label="Password">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <button className="btn-ghost text-rose-600 hover:text-rose-700" disabled={busy} onClick={disable}>{busy ? "Disabling…" : "Disable 2FA"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
