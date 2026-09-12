import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/auth";

async function doAcceptInvite(formData: FormData) {
  "use server";
  const inviteToken = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const ok = await acceptInvite(inviteToken, password);
  if (!ok) {
    redirect(`/accept-invite?token=${encodeURIComponent(inviteToken)}&error=1`);
  }
  redirect("/login");
}

export default function AcceptInvitePage({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  const { token, error } = searchParams;

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

        {!token ? (
          <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">
            This invite link is missing a token. Ask your admin to resend the invite.
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold mb-1">Accept invitation</h1>
            <p className="text-sm text-slate-500 mb-5">Set a password to activate your account.</p>
            {error && (
              <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">
                This invite link is invalid or has already been used.
              </div>
            )}
            <form action={doAcceptInvite} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label className="label">Set a password</label>
                <input name="password" type="password" className="input" required minLength={8} />
              </div>
              <button className="btn w-full justify-center">Activate account →</button>
            </form>
          </>
        )}

        <div className="mt-5 text-xs text-slate-400 border-t border-slate-100 pt-4">
          Already active? <Link href="/login" className="text-brand-700 font-medium hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
