import { NextResponse } from "next/server";
import { ssoConfigured, exchangeCodeForProfile } from "@/lib/sso";
import { establishSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { SSO_STATE_COOKIE } from "@/lib/sso";

/**
 * Google redirects here with `?code=...&state=...` after the user consents.
 *
 * Flow: verify the CSRF `state` (query param must match the httpOnly cookie
 * set by /api/auth/sso/google), exchange the code for a Google profile, then
 * look the user up by email. We deliberately do NOT auto-provision an
 * account on first SSO login (JIT provisioning) — whether to create a
 * user/tenant automatically on a first-ever SSO sign-in is a policy decision
 * (which role? which tenant? is self-signup even allowed?) that belongs to a
 * real deployment, not a technical default here. So: known + active user →
 * session; anyone else → a clear "no account" message back on /login.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (!ssoConfigured) {
    return NextResponse.redirect(new URL("/login?sso=unconfigured", url.origin));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?sso=error", url.origin));
  }

  // CSRF check (GAPS #5): the state we handed Google must round-trip and
  // match the value we stashed in the httpOnly cookie on initiate. Missing
  // or mismatched → reject before ever exchanging the code.
  const queryState = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SSO_STATE_COOKIE}=`))
    ?.slice(SSO_STATE_COOKIE.length + 1);

  if (!queryState || !cookieState || queryState !== cookieState) {
    const res = NextResponse.redirect(new URL("/login?sso=error", url.origin));
    res.cookies.delete(SSO_STATE_COOKIE);
    return res;
  }

  try {
    const redirectUri = `${url.origin}/api/auth/sso/google/callback`;
    const profile = await exchangeCodeForProfile(code, redirectUri);
    if (!profile) {
      const res = NextResponse.redirect(new URL("/login?sso=error", url.origin));
      res.cookies.delete(SSO_STATE_COOKIE);
      return res;
    }

    const user = await db.user.findUnique({ where: { email: profile.email } });
    if (!user || !user.active) {
      const res = NextResponse.redirect(new URL("/login?sso=nouser", url.origin));
      res.cookies.delete(SSO_STATE_COOKIE);
      return res;
    }

    // Enforce 2FA on SSO too: if the user has 2FA enabled, establishSession sets the
    // pending cookie and signals twoFactorRequired → route to the same /login/2fa step.
    const authRes = await establishSession(user.id);
    const target = !authRes.session && !authRes.twoFactorRequired
      ? "/login?sso=error"
      : authRes.twoFactorRequired
        ? "/login/2fa"
        : "/dashboard";
    const res = NextResponse.redirect(new URL(target, url.origin));
    res.cookies.delete(SSO_STATE_COOKIE);
    return res;
  } catch (err) {
    console.error("[sso] Google callback failed:", err);
    const res = NextResponse.redirect(new URL("/login?sso=error", url.origin));
    res.cookies.delete(SSO_STATE_COOKIE);
    return res;
  }
}
