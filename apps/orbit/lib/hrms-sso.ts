/**
 * Bridge HRMS JWT → Orbit session.
 * HRMS remains the identity source; Orbit maps by email into its tenant user.
 */
import { jwtVerify } from "jose";
import { db } from "./db";
import { createSession, type Session } from "./auth";

type HrmsJwt = { sub: string; companyId: string; roles: string[] };

function hrmsSecret() {
  const s = process.env.HRMS_JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error("HRMS_JWT_ACCESS_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export async function verifyHrmsToken(token: string): Promise<HrmsJwt> {
  const { payload } = await jwtVerify(token, hrmsSecret());
  return payload as unknown as HrmsJwt;
}

/** Upsert an Orbit user for the HRMS identity and create an orbit_session. */
export async function establishOrbitSessionFromHrms(opts: {
  email: string;
  name: string;
  roles: string[];
}): Promise<Session> {
  const email = opts.email.trim().toLowerCase();
  const isCeo = opts.roles.includes("SUPER_ADMIN") || opts.roles.includes("ADMIN");

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    // Attach to first tenant (seeded) or create a bridge tenant.
    let tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
    if (!tenant) {
      tenant = await db.tenant.create({
        data: { name: "HRMS Linked Org", gstin: "N/A" },
      });
    }
    const ceoRole = await db.role.findFirst({
      where: { tenantId: tenant.id, name: "CEO" },
    });
    user = await db.user.create({
      data: {
        email,
        name: opts.name || email,
        passwordHash: "", // SSO-only; password login disabled for bridge users
        tenantId: tenant.id,
        isCeo,
        roleId: ceoRole?.id ?? null,
      },
    });
  } else if (isCeo && !user.isCeo) {
    user = await db.user.update({
      where: { id: user.id },
      data: { isCeo: true },
    });
  }

  const session: Session = {
    userId: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    isCeo: user.isCeo,
    roleId: user.roleId,
  };
  await createSession(session);
  return session;
}
