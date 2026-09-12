import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { verifyTotp, generateSecret, otpauthUri, qrSvg, generateRecoveryCodes } from "./totp";
import { encrypt, decrypt, hashToken } from "./crypto";

// GAPS #4: a forgeable session if AUTH_SECRET is missing in prod — fail fast instead.
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production (sessions would otherwise be forgeable).");
}
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");
const COOKIE = "orbit_session";

export type Session = {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  isCeo: boolean;
  roleId: string | null;
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(session: Session) {
  const token = await new SignJWT(session as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

export function clearSession() {
  cookies().delete(COOKIE);
}

// (GAPS #13) The legacy, non-2FA `login()` was removed — use `startLogin()` which enforces 2FA.

// ── Phase A: signup / reset / invite ─────────────────────────
function token(len = 24) {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) s += a[bytes[i] % a.length];
  return s;
}

/** Create a new tenant + its CEO user, log them in. */
export async function signup(params: { org: string; name: string; email: string; password: string }): Promise<Session | { error: string }> {
  const existing = await db.user.findUnique({ where: { email: params.email } });
  if (existing) return { error: "An account with this email already exists." };
  const tenant = await db.tenant.create({ data: { name: params.org } });
  await db.subscription.create({ data: { tenantId: tenant.id, plan: "free", seats: 5 } }).catch(() => {});
  const user = await db.user.create({
    data: { tenantId: tenant.id, name: params.name, email: params.email, passwordHash: await hashPassword(params.password), isCeo: true, emailVerified: true },
  });
  const session: Session = { userId: user.id, tenantId: tenant.id, name: user.name, email: user.email, isCeo: true, roleId: null };
  await createSession(session);
  return session;
}

/** Generate a reset token. Returns it so the caller can display/deliver it (no email provider yet). */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  const t = token();
  // Store only a hash of the token (GAPS #4); the plaintext is returned once to build the link.
  await db.user.update({ where: { id: user.id }, data: { resetToken: hashToken(t), resetTokenExp: new Date(Date.now() + 3600_000) } });
  return t;
}

export async function resetPassword(resetToken: string, newPassword: string): Promise<boolean> {
  const user = await db.user.findFirst({ where: { resetToken: hashToken(resetToken) } });
  if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) return false;
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), resetToken: null, resetTokenExp: null, mustReset: false } });
  return true;
}

export async function changePassword(userId: string, current: string, next: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(current, user.passwordHash))) return false;
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  return true;
}

/** Invite a teammate. Returns the invite token (share the accept link since no email yet). */
export async function inviteUser(tenantId: string, email: string, name: string, roleId: string | null): Promise<string | { error: string }> {
  if (await db.user.findUnique({ where: { email } })) return { error: "Email already in use." };
  // RBAC is fail-closed: a roleless user has no access, so invites without an
  // explicit role get the tenant's default Member role.
  const { ensureDefaultRole } = await import("./rbac");
  const effectiveRoleId = roleId ?? (await ensureDefaultRole(tenantId));
  const t = token();
  await db.user.create({ data: { tenantId, email, name, roleId: effectiveRoleId, passwordHash: await hashPassword(token()), mustReset: true, inviteToken: hashToken(t) } });
  return t;
}

export async function acceptInvite(inviteToken: string, password: string): Promise<boolean> {
  const user = await db.user.findFirst({ where: { inviteToken: hashToken(inviteToken) } });
  if (!user) return false;
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), inviteToken: null, mustReset: false, emailVerified: true } });
  return true;
}

// ── Phase C: two-factor (TOTP) login flow ────────────────────
const PENDING = "orbit_2fa_pending";

/** Step 1 of login. Verifies credentials; if 2FA is on, stashes a short-lived pending
 *  cookie and returns {twoFactorRequired}. Otherwise creates the full session. */
export async function startLogin(email: string, password: string): Promise<{ session?: Session; twoFactorRequired?: boolean; error?: boolean }> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) return { error: true };
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const t = await new SignJWT({ uid: user.id, pending: true }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(secret);
    cookies().set(PENDING, t, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
    return { twoFactorRequired: true };
  }
  const session: Session = { userId: user.id, tenantId: user.tenantId, name: user.name, email: user.email, isCeo: user.isCeo, roleId: user.roleId };
  await createSession(session);
  return { session };
}

export async function pendingUserId(): Promise<string | null> {
  const t = cookies().get(PENDING)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret);
    return (payload as any).pending ? (payload as any).uid : null;
  } catch {
    return null;
  }
}

/** Step 2 of login. Accepts a TOTP token OR a recovery code. */
export async function completeTwoFactor(code: string): Promise<Session | null> {
  const uid = await pendingUserId();
  if (!uid) return null;
  const user = await db.user.findUnique({ where: { id: uid } });
  if (!user || !user.twoFactorSecret) return null;

  let ok = verifyTotp(decrypt(user.twoFactorSecret), code);
  if (!ok && user.recoveryCodes) {
    const hashes: string[] = JSON.parse(user.recoveryCodes); // stored as sha256 hashes (GAPS #4)
    const idx = hashes.indexOf(hashToken(code));
    if (idx >= 0) {
      ok = true;
      hashes.splice(idx, 1); // single-use
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(hashes) } });
    }
  }
  if (!ok) return null;

  cookies().delete(PENDING);
  const session: Session = { userId: user.id, tenantId: user.tenantId, name: user.name, email: user.email, isCeo: user.isCeo, roleId: user.roleId };
  await createSession(session);
  return session;
}

// ── 2FA enrollment (from settings) ───────────────────────────
export async function beginEnroll2FA(userId: string, account: string): Promise<{ secret: string; uri: string; svg: string }> {
  const secretB32 = generateSecret();
  // Encrypt the TOTP secret at rest (GAPS #4).
  await db.user.update({ where: { id: userId }, data: { twoFactorSecret: encrypt(secretB32), twoFactorEnabled: false } });
  const uri = otpauthUri(secretB32, account);
  return { secret: secretB32, uri, svg: await qrSvg(uri) };
}

/** Confirm the code, enable 2FA, return one-time recovery codes to show the user. */
export async function confirmEnroll2FA(userId: string, code: string): Promise<string[] | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorSecret) return null;
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) return null;
  const codes = generateRecoveryCodes();
  // Store hashes; the plaintext codes are shown to the user once and never persisted (GAPS #4).
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, recoveryCodes: JSON.stringify(codes.map(hashToken)) } });
  return codes;
}

export async function disable2FA(userId: string, password: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return false;
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: null } });
  return true;
}

export async function is2FAEnabled(userId: string): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });
  return !!u?.twoFactorEnabled;
}

/** Establish a session for an already-authenticated user (e.g. via SSO), ENFORCING 2FA.
 *  If the user has 2FA on, stashes the pending cookie and signals twoFactorRequired so the
 *  caller redirects to /login/2fa (same second factor as password login). */
export async function establishSession(userId: string): Promise<{ session?: Session; twoFactorRequired?: boolean }> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return {};
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const t = await new SignJWT({ uid: user.id, pending: true }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(secret);
    cookies().set(PENDING, t, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
    return { twoFactorRequired: true };
  }
  const session: Session = { userId: user.id, tenantId: user.tenantId, name: user.name, email: user.email, isCeo: user.isCeo, roleId: user.roleId };
  await createSession(session);
  return { session };
}
