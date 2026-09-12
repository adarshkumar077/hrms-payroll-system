import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Login() {
  const { login, signup } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(org, name, email, password);
      nav("/");
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-3xl">🛰️</span>
          <div>
            <div className="text-xl font-bold text-brand-700">Orbit</div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Business Operating System</div>
          </div>
        </div>
        <h1 className="text-lg font-semibold mb-1">{mode === "login" ? "Sign in" : "Create your workspace"}</h1>
        <p className="text-sm text-slate-500 mb-5">One screen for leads, people, stock &amp; money.</p>
        {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div><label className="label">Organization</label><input className="input" value={org} onChange={(e) => setOrg(e.target.value)} required /></div>
              <div><label className="label">Your name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            </>
          )}
          <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label className="label">Password</label><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <button className="btn w-full justify-center" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in →" : "Create workspace →"}</button>
        </form>
        <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="mt-4 text-xs text-brand-700 w-full text-center">
          {mode === "login" ? "New here? Create a workspace" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
