import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { startLogin, getSession } from "@/lib/auth";
import { ssoConfigured } from "@/lib/sso";
import { rateLimit, clientKey } from "@/lib/ratelimit";

async function doLogin(formData: FormData) {
  "use server";
  const key = `login:${clientKey(headers())}`;
  const { ok } = rateLimit(key, 10, 5 * 60_000); // 10 attempts / 5 min per IP
  if (!ok) redirect("/login?error=1&rate=1");

  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const res = await startLogin(email, password);
  if (res.twoFactorRequired) redirect("/login/2fa");
  if (res.session) redirect("/dashboard");
  redirect("/login?error=1");
}

const SSO_NOTICES: Record<string, string> = {
  unconfigured: "Single Sign-On isn't configured yet — sign in with email/password below.",
  nouser: "No account found for that Google email. Ask an admin to invite you first.",
  error: "Google sign-in failed. Please try again or use email/password.",
};

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; sso?: string; rate?: string } }) {
  if (await getSession()) redirect("/dashboard");
  const ssoNotice = searchParams.sso ? SSO_NOTICES[searchParams.sso] : undefined;

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
        <h1 className="text-lg font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-5">One screen for leads, people, stock & money.</p>
        {searchParams.rate && (
          <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">
            Too many sign-in attempts. Please wait a few minutes and try again.
          </div>
        )}
        {searchParams.error && !searchParams.rate && (
          <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">Invalid credentials.</div>
        )}
        {ssoNotice && (
          <div className="mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm px-3 py-2">{ssoNotice}</div>
        )}
        <a
          href="/api/auth/sso/google"
          className="btn-ghost w-full justify-center flex items-center gap-2 mb-4"
          title={ssoConfigured ? "Sign in with Google" : "Single Sign-On not configured — set GOOGLE_CLIENT_ID/SECRET"}
        >
          <span>🔐</span> Sign in with Google
        </a>
        {!ssoConfigured && (
          <p className="text-xs text-slate-400 -mt-3 mb-4">SSO not configured on this deployment.</p>
        )}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-xs text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>
        <form action={doLogin} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" defaultValue="ceo@demo.orbit" className="input" required />
          </div>
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" defaultValue="orbit123" className="input" required />
          </div>
          <button className="btn w-full justify-center">Sign in →</button>
        </form>
        <div className="mt-5 text-xs text-slate-400 border-t border-slate-100 pt-4">
          Demo: <b>ceo@demo.orbit</b> / <b>orbit123</b> (CEO) · sales@demo.orbit / orbit123 (Sales)
        </div>
        <div className="mt-3 text-center text-xs text-slate-400 space-x-3">
          <Link href="/legal/terms" className="hover:text-slate-600">Terms</Link>
          <span>·</span>
          <Link href="/legal/privacy" className="hover:text-slate-600">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
