// Cookie name for the CSRF `state` round-trip (GAPS #5). Defined here (not in the
// route file) because Next route modules may only export route handlers.
export const SSO_STATE_COOKIE = "orbit_sso_state";

// ─────────────────────────────────────────────────────────────
// Pluggable SSO adapter — Google OAuth 2.0 (Authorization Code flow).
//
// Real SSO needs a real Identity Provider (IdP): a registered OAuth client
// (client id/secret) in Google Cloud Console, and a callback URL Google is
// allowed to redirect back to. Without that, there is nothing to plug into —
// so this adapter is gated on env, exactly like `lib/irp.ts` and
// `lib/payments.ts`:
//   • GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET both set → SSO is "configured":
//     the login button and the routes drive a real Google OAuth round-trip.
//   • Either missing → `ssoConfigured` is false; the route handler redirects
//     straight back to /login with a clear "not configured" message instead
//     of attempting anything.
//
// Slotting in real creds: fill `.env.sso.example` values into `.env` —
// nothing else needs to change. See `SSO_SETUP_DOC` below.
// ─────────────────────────────────────────────────────────────

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * True only when both Google OAuth client credentials are present. Callers
 * (route handlers, the login page, the admin status card) use this to decide
 * between the live OAuth flow and a clear "not configured" fallback.
 */
export const ssoConfigured: boolean = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export type GoogleProfile = {
  email: string;
  name: string;
};

/**
 * Build the Google OAuth 2.0 consent-screen URL for the "Authorization Code"
 * flow. `redirectUri` must exactly match a URI registered on the Google Cloud
 * Console OAuth client (Authorized redirect URIs).
 *
 * `state` — a real implementation MUST generate this as a random, single-use
 * nonce, stash it (signed cookie or server-side store) before redirecting,
 * and verify it on the callback to prevent CSRF / login-request forgery. This
 * adapter accepts a caller-supplied `state` so that plumbing can be added
 * without changing this function's signature; the callback route below
 * currently does not verify it end-to-end (see the note in the callback).
 */
export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange an OAuth "code" for the user's Google profile:
 *   1. POST the code to Google's token endpoint (`redirect_uri` must match
 *      the one used to build the original consent URL exactly).
 *   2. GET the userinfo endpoint with the returned access token.
 *
 * Never throws — any failure (network, bad code, malformed response) is
 * caught and logged; callers get `null` and should treat it as "SSO failed".
 */
export async function exchangeCodeForProfile(
  code: string,
  redirectUri: string,
): Promise<GoogleProfile | null> {
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!tokenRes.ok) throw new Error(`Google token endpoint HTTP ${tokenRes.status}`);
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error("Google token response missing access_token");

    const userRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!userRes.ok) throw new Error(`Google userinfo endpoint HTTP ${userRes.status}`);
    const profile = (await userRes.json()) as { email?: string; name?: string };
    if (!profile.email) throw new Error("Google userinfo response missing email");

    return { email: profile.email, name: profile.name || profile.email };
  } catch (err) {
    console.error("[sso] Google code exchange failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Setup documentation — surfaced in the admin status card and for operators.
// ─────────────────────────────────────────────────────────────
export const SSO_SETUP_DOC = `Orbit SSO — go live with Google

Orbit can let users sign in via "Sign in with Google" instead of (or alongside)
email/password. With no credentials set, the button redirects back to /login
with a clear "SSO not configured" message — the app never breaks.

To go live, set these in your .env (see .env.sso.example):

  GOOGLE_CLIENT_ID       OAuth 2.0 Client ID from Google Cloud Console
  GOOGLE_CLIENT_SECRET   OAuth 2.0 Client Secret (server-only, never expose)

Where to get credentials:
  1. Go to https://console.cloud.google.com/apis/credentials
  2. Create (or pick) a project → "Create Credentials" → "OAuth client ID"
     → Application type: "Web application".
  3. Under "Authorized redirect URIs" add exactly:
       <your-app-origin>/api/auth/sso/google/callback
     e.g. http://localhost:3000/api/auth/sso/google/callback for local dev.
  4. Copy the generated Client ID + Client Secret into GOOGLE_CLIENT_ID /
     GOOGLE_CLIENT_SECRET.

Production notes (not implemented in this scaffold — real IdP hardening):
  • CSRF/state: generate a random per-request "state" value, store it
    server-side (or in a signed short-lived cookie) before redirecting to
    Google, and verify it matches on the callback before trusting the code.
  • Nonce/replay: for OpenID Connect (id_token) flows, verify the "nonce"
    claim and the token signature (JWKS) rather than trusting the userinfo
    endpoint response alone.
  • Account linking / JIT provisioning: this scaffold only signs in EXISTING
    users matched by email — it deliberately does not auto-create accounts on
    first SSO login. Whether to auto-provision (and with what default role)
    is a policy decision for a real deployment, not a technical default.`;
