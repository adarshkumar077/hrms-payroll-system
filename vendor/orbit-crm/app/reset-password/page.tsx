import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requestPasswordReset, resetPassword } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { sendEmail, emailConfigured } from "@/lib/email";

async function doRequestReset(formData: FormData) {
  "use server";
  const key = `reset:${clientKey(headers())}`;
  const { ok } = rateLimit(key, 5, 15 * 60_000); // 5 requests / 15 min per IP
  if (!ok) {
    redirect("/reset-password?requestError=1&rate=1");
  }

  const email = String(formData.get("email") || "");
  const t = await requestPasswordReset(email);
  if (!t) {
    redirect("/reset-password?requestError=1");
  }

  const host = headers().get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const link = `${proto}://${host}/reset-password?token=${encodeURIComponent(t)}`;

  // Best-effort — sendEmail() never throws, so this can never break the reset flow.
  const result = await sendEmail({
    to: email,
    subject: "Reset your Orbit password",
    html: `<p>We received a request to reset your Orbit password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
  });

  // Only skip the on-screen link once we know it was actually emailed —
  // if SMTP isn't configured (or the send failed), still fall back to showing it.
  if (emailConfigured && result.sent) {
    redirect("/reset-password?sent=emailed");
  }
  redirect(`/reset-password?sent=${encodeURIComponent(t)}`);
}

async function doResetPassword(formData: FormData) {
  "use server";
  const resetToken = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const ok = await resetPassword(resetToken, password);
  if (!ok) {
    redirect(`/reset-password?token=${encodeURIComponent(resetToken)}&resetError=1`);
  }
  redirect("/login");
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string; sent?: string; requestError?: string; resetError?: string; rate?: string };
}) {
  const { token, sent, requestError, resetError, rate } = searchParams;

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

        {token ? (
          <>
            <h1 className="text-lg font-semibold mb-1">Set a new password</h1>
            <p className="text-sm text-slate-500 mb-5">Choose a new password for your account.</p>
            {resetError && (
              <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">
                This reset link is invalid or has expired. Please request a new one.
              </div>
            )}
            <form action={doResetPassword} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label className="label">New password</label>
                <input name="password" type="password" className="input" required minLength={8} />
              </div>
              <button className="btn w-full justify-center">Reset password →</button>
            </form>
            <div className="mt-5 text-xs text-slate-400 border-t border-slate-100 pt-4">
              <Link href="/reset-password" className="text-brand-700 font-medium hover:underline">Request a new link</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold mb-1">Forgot password</h1>
            <p className="text-sm text-slate-500 mb-5">Enter your email and we'll generate a reset link.</p>
            {requestError && (
              <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">
                {rate ? "Too many reset requests. Please wait a few minutes and try again." : "No account found with that email."}
              </div>
            )}
            {sent && sent === "emailed" && (
              <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">
                We've emailed you a link to reset your password. Check your inbox (and spam folder).
              </div>
            )}
            {sent && sent !== "emailed" && (
              <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2 break-words">
                No email provider is configured yet — use this link to reset your password:
                <div className="mt-2">
                  <Link
                    href={`/reset-password?token=${encodeURIComponent(sent)}`}
                    className="font-medium underline break-all"
                  >
                    {`/reset-password?token=${sent}`}
                  </Link>
                </div>
              </div>
            )}
            <form action={doRequestReset} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input name="email" type="email" className="input" required />
              </div>
              <button className="btn w-full justify-center">Send reset link →</button>
            </form>
            <div className="mt-5 text-xs text-slate-400 border-t border-slate-100 pt-4">
              Remembered your password? <Link href="/login" className="text-brand-700 font-medium hover:underline">Sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
