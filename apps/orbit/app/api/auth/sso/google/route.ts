import { NextResponse } from "next/server";
import { ssoConfigured, googleAuthUrl, SSO_STATE_COOKIE } from "@/lib/sso";
// (SSO_STATE_COOKIE lives in lib/sso.ts — Next route files may only export route handlers.)

/**
 * Entry point for "Sign in with Google". If SSO isn't configured (no
 * GOOGLE_CLIENT_ID/SECRET in env), bounce back to /login with a clear
 * message instead of attempting an OAuth round-trip that can't work.
 *
 * CSRF protection (GAPS #5): generate a random per-request `state`, stash it
 * in a short-lived httpOnly cookie, and pass the same value to Google. The
 * callback route verifies the query `state` matches the cookie before
 * trusting the code exchange.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (!ssoConfigured) {
    return NextResponse.redirect(new URL("/login?sso=unconfigured", url.origin));
  }

  const redirectUri = `${url.origin}/api/auth/sso/google/callback`;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, state));
  res.cookies.set(SSO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });
  return res;
}
