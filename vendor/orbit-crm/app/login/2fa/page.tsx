import { redirect } from "next/navigation";
import { completeTwoFactor, pendingUserId } from "@/lib/auth";

async function verify(formData: FormData) {
  "use server";
  const code = String(formData.get("code") || "");
  const session = await completeTwoFactor(code);
  if (session) redirect("/dashboard");
  redirect("/login/2fa?error=1");
}

export default async function TwoFactorPage({ searchParams }: { searchParams: { error?: string } }) {
  // Guard: only reachable mid-login (pending cookie present).
  if (!(await pendingUserId())) redirect("/login");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-3xl">🔐</span>
          <div>
            <div className="text-xl font-bold text-brand-700">Two-factor verification</div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Enter your 6-digit code</div>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-5">Open your authenticator app and enter the current code. You can also use a recovery code.</p>
        {searchParams.error && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">Invalid code. Try again.</div>}
        <form action={verify} className="space-y-4">
          <div>
            <label className="label">Authentication code</label>
            <input name="code" inputMode="text" autoComplete="one-time-code" placeholder="123456 or recovery code" className="input tracking-widest text-center text-lg" required autoFocus />
          </div>
          <button className="btn w-full justify-center">Verify →</button>
        </form>
        <a href="/login" className="mt-5 block text-center text-xs text-slate-400">← Back to sign in</a>
      </div>
    </div>
  );
}
