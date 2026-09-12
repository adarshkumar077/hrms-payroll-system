"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { beginEnroll2FAAction, confirmEnroll2FAAction, disable2FAAction } from "./actions";

type EnrollStep = "idle" | "scan" | "done";

export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  if (enabled) return <Disable2FA />;
  return <Enroll2FA />;
}

function Enroll2FA() {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<EnrollStep>("idle");
  const [svg, setSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onBegin() {
    setError(null);
    start(async () => {
      const result = await beginEnroll2FAAction();
      setSvg(result.svg);
      setSecret(result.secret);
      setStep("scan");
    });
  }

  function onConfirm(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await confirmEnroll2FAAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setCodes(result.codes || []);
      setStep("done");
    });
  }

  if (step === "idle") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone="slate">Disabled</Badge>
        </div>
        <p className="text-sm text-slate-500">
          Add an extra layer of security to your account by requiring a 6-digit code from an authenticator app at login.
        </p>
        <button className="btn" onClick={onBegin} disabled={pending}>
          {pending ? "Starting…" : "Enable 2FA"}
        </button>
      </div>
    );
  }

  if (step === "scan") {
    return (
      <div className="space-y-4 max-w-sm">
        {error && <div className="rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
        <p className="text-sm text-slate-600">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator).
        </p>
        {svg && <div className="bg-white p-3 rounded-lg border border-slate-200 w-fit" dangerouslySetInnerHTML={{ __html: svg }} />}
        {secret && (
          <div>
            <div className="label mb-0.5">Can&apos;t scan? Enter this code manually</div>
            <div className="text-sm font-mono text-slate-700 break-all bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
              {secret}
            </div>
          </div>
        )}
        <form action={onConfirm} className="space-y-3">
          <div>
            <label className="label">6-digit code</label>
            <input
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="input"
              placeholder="123456"
              required
              disabled={pending}
            />
          </div>
          <button className="btn" disabled={pending}>
            {pending ? "Verifying…" : "Verify & enable"}
          </button>
        </form>
      </div>
    );
  }

  // step === "done"
  return (
    <div className="space-y-4 max-w-sm">
      <div className="rounded-lg text-sm px-3 py-2 bg-emerald-50 text-emerald-700">Two-factor authentication is now enabled.</div>
      <div>
        <div className="label mb-1">Recovery codes — save these, each works once</div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-2 font-mono text-sm text-slate-700">
          {codes?.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Store these somewhere safe. If you lose access to your authenticator app, a recovery code is the only way back in.
        </p>
      </div>
    </div>
  );
}

function Disable2FA() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await disable2FAAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return <div className="rounded-lg text-sm px-3 py-2 bg-slate-50 text-slate-600">Two-factor authentication has been disabled.</div>;
  }

  return (
    <div className="space-y-4 max-w-sm">
      <div className="flex items-center gap-2">
        <Badge tone="green">Enabled</Badge>
      </div>
      {error && <div className="rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
      <form action={onSubmit} className="space-y-3">
        <div>
          <label className="label">Current password</label>
          <input name="password" type="password" className="input" required disabled={pending} />
        </div>
        <button className="btn-ghost" disabled={pending}>
          {pending ? "Disabling…" : "Disable 2FA"}
        </button>
      </form>
    </div>
  );
}
