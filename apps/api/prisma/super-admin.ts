/**
 * Super Admin account management from the SERVER CONSOLE (production-safe).
 *
 *   docker compose exec api npx tsx prisma/super-admin.ts create --email you@company.com --mobile 98XXXXXXXX [--name "Full Name"]
 *   docker compose exec api npx tsx prisma/super-admin.ts create --break-glass --email it@company.com --mobile 97XXXXXXXX
 *   docker compose exec api npx tsx prisma/super-admin.ts reset --login SA001 [--reset-2fa]
 *   docker compose exec api npx tsx prisma/super-admin.ts list
 *
 * Passwords are generated here (crypto-random), printed ONCE to this terminal and never stored in
 * plain text, logs, .env files or the audit log. The user must change it at first sign-in.
 * Only someone with console access to the server can run this; that is the recovery path when the
 * last Super Admin is locked out.
 */
import { PrismaClient, RoleCode, UserStatus, AuditAction } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** 16 chars from an unambiguous alphabet; always includes upper, lower and a digit. */
export function generatePassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits + '@#%+=';
  for (;;) {
    let p = '';
    for (let i = 0; i < length; i++) p += all[randomInt(all.length)];
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p)) return p;
  }
}

const mask = (e?: string | null) => (e && e.includes('@') ? `${e[0]}***@${e.split('@')[1]}` : '—');

function showOnce(loginId: string, password: string, what: string) {
  const line = '='.repeat(64);
  process.stdout.write(
    `\n${line}\n ${what}\n\n   User ID          : ${loginId}\n   One-time password: ${password}\n\n` +
      ' Shown only now. Write it down or hand it over in person, then clear this screen\n' +
      ' (cls / clear). The password must be changed at the first sign-in.\n' +
      `${line}\n\n`,
  );
}

async function company() {
  const c = await prisma.company.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  if (!c) throw new Error('No active company. Start the API once (it seeds the company) and retry.');
  return c;
}

async function nextLoginId(companyId: string) {
  const users = await prisma.user.findMany({ where: { companyId, loginId: { startsWith: 'SA' } }, select: { loginId: true } });
  let next = 1;
  for (const u of users) {
    const m = u.loginId?.match(/^SA(\d+)$/i);
    if (m) next = Math.max(next, Number.parseInt(m[1], 10) + 1);
  }
  return `SA${String(next).padStart(3, '0')}`;
}

async function activeSuperAdmins(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, status: { not: UserStatus.INACTIVE }, userRoles: { some: { role: { code: RoleCode.SUPER_ADMIN } } } },
    select: { id: true, loginId: true, email: true, status: true, totpEnabled: true, forcePasswordChange: true, lockedAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function create() {
  const email = arg('email')?.trim().toLowerCase();
  const mobile = arg('mobile')?.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, '');
  const name = arg('name')?.trim() || (flag('break-glass') ? 'Break-glass Super Admin' : 'Super Admin');
  if (!email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new Error('--email is required (a valid address).');
  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) throw new Error('--mobile is required (10-digit Indian mobile).');

  const c = await company();
  const existing = await activeSuperAdmins(c.id);
  if (existing.length && !flag('break-glass')) {
    throw new Error(
      `A Super Admin already exists (${existing.map((u) => u.loginId).join(', ')}). ` +
        'Use "reset --login <ID>" to recover it, or add --break-glass to create an emergency second account.',
    );
  }
  const taken = await prisma.user.findFirst({ where: { companyId: c.id, OR: [{ email: { equals: email, mode: 'insensitive' } }, { mobile }] } });
  if (taken) throw new Error('That email or mobile is already used by another account.');
  const role = await prisma.role.findFirst({ where: { companyId: c.id, code: RoleCode.SUPER_ADMIN } });
  if (!role) throw new Error('Super Admin role missing. Start the API once (it seeds roles) and retry.');

  const password = generatePassword();
  const loginId = await nextLoginId(c.id);
  const user = await prisma.user.create({
    data: {
      companyId: c.id,
      loginId,
      email,
      mobile,
      displayName: name,
      passwordHash: await bcrypt.hash(password, 12),
      status: UserStatus.ACTIVE,
      forcePasswordChange: true,
      userRoles: { create: [{ roleId: role.id }] },
    },
  });
  await prisma.auditLog.create({
    data: {
      companyId: c.id,
      actorId: null,
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: flag('break-glass') ? 'break_glass_super_admin_created_console' : 'super_admin_created_console', loginId },
    },
  });
  showOnce(loginId, password, flag('break-glass') ? 'Break-glass Super Admin created' : 'Super Admin created');
}

async function reset() {
  const loginId = arg('login')?.trim().toUpperCase();
  if (!loginId) throw new Error('--login <User ID> is required (see "list").');
  const c = await company();
  const user = await prisma.user.findFirst({
    where: { companyId: c.id, loginId: { equals: loginId, mode: 'insensitive' }, userRoles: { some: { role: { code: RoleCode.SUPER_ADMIN } } } },
  });
  if (!user) throw new Error(`No Super Admin with User ID ${loginId}.`);
  const password = generatePassword();
  const reset2fa = flag('reset-2fa');
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        forcePasswordChange: true,
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedAt: null,
        ...(reset2fa ? { totpEnabled: false, totpSecret: null } : {}),
      },
    }),
    // Sign out every existing session of this account.
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        companyId: c.id,
        actorId: null,
        action: AuditAction.PASSWORD_RESET,
        entityType: 'User',
        entityId: user.id,
        metadata: { event: 'super_admin_reset_console', loginId: user.loginId, reset2fa },
      },
    }),
  ]);
  showOnce(user.loginId ?? loginId, password, `Super Admin ${user.loginId} reset${reset2fa ? ' (2FA removed: set it up again after sign-in)' : ''}; all sessions signed out`);
}

async function list() {
  const c = await company();
  const rows = await activeSuperAdmins(c.id);
  if (!rows.length) return console.log('No Super Admin exists yet. Run: create --email … --mobile …');
  for (const u of rows) {
    console.log(
      `${u.loginId}  ${mask(u.email)}  status=${u.status}  2FA=${u.totpEnabled ? 'on' : 'off'}` +
        `${u.forcePasswordChange ? '  (must change password)' : ''}${u.lockedAt ? '  LOCKED' : ''}`,
    );
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'create') return create();
  if (cmd === 'reset') return reset();
  if (cmd === 'list') return list();
  console.log('Usage: super-admin.ts create --email E --mobile M [--name N] [--break-glass] | reset --login SA001 [--reset-2fa] | list');
  process.exitCode = 2;
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
