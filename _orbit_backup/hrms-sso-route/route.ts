import { NextRequest, NextResponse } from "next/server";
import { verifyHrmsToken, establishOrbitSessionFromHrms } from "@/lib/hrms-sso";

/**
 * POST /api/auth/hrms-sso
 * Body: { email, name, roles? } — or Authorization: Bearer <HRMS access JWT>
 * Fetches identity from HRMS /auth/me when only the bearer token is provided.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing HRMS bearer token" }, { status: 401 });
    }

    await verifyHrmsToken(token);

    const hrmsApi = process.env.HRMS_API_URL || "http://127.0.0.1:3001/api/v1";
    const meRes = await fetch(`${hrmsApi}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: "HRMS /auth/me failed" }, { status: 401 });
    }
    const me = (await meRes.json()) as {
      email?: string;
      displayName?: string;
      loginId?: string;
      roles?: string[];
    };

    const email = (me.email || "").trim();
    if (!email) {
      return NextResponse.json({ error: "HRMS user has no email" }, { status: 400 });
    }

    const session = await establishOrbitSessionFromHrms({
      email,
      name: me.displayName || me.loginId || email,
      roles: me.roles || [],
    });

    const body = await req.json().catch(() => ({} as { next?: string }));
    const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/dashboard";

    // basePath is /orbit — Next will serve under that prefix when configured.
    return NextResponse.json({ ok: true, session: { email: session.email, name: session.name }, next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SSO failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
