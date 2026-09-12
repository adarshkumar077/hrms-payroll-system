import Link from "next/link";
import { redirect } from "next/navigation";
import { signup, getSession } from "@/lib/auth";

async function doSignup(formData: FormData) {
  "use server";
  const org = String(formData.get("org") || "");
  const name = String(formData.get("name") || "");
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const result = await signup({ org, name, email, password });
  if ("error" in result) {
    redirect(`/signup?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/studio/templates?welcome=1");
}

export default async function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  if (await getSession()) redirect("/dashboard");
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
        <h1 className="text-lg font-semibold mb-1">Create your workspace</h1>
        <p className="text-sm text-slate-500 mb-5">Set up your organization in a minute.</p>
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{searchParams.error}</div>
        )}
        <form action={doSignup} className="space-y-4">
          <div>
            <label className="label">Organization name</label>
            <input name="org" type="text" className="input" required />
          </div>
          <div>
            <label className="label">Your name</label>
            <input name="name" type="text" className="input" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" className="input" required minLength={8} />
          </div>
          <button className="btn w-full justify-center">Create workspace →</button>
        </form>
        <div className="mt-5 text-xs text-slate-400 border-t border-slate-100 pt-4">
          Already have an account? <Link href="/login" className="text-brand-700 font-medium hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
