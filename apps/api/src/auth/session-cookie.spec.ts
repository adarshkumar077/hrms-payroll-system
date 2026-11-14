import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { PasswordChangeGuard, PASSWORD_CHANGE_REQUIRED } from './guards/password-change.guard';
import { REFRESH_COOKIE } from './session-cookie';

/**
 * Exercises AuthController's session transport over real HTTP (express + cookie-parser, as in
 * main.ts) with a stub AuthService. Nest DI is bypassed because tsx does not emit decorator
 * metadata; the controller is constructed directly.
 */

const env: Record<string, string> = { API_PREFIX: 'api/v1', JWT_REFRESH_TTL: '7d' };
const config = { get: (k: string, fallback?: unknown) => (k in env ? env[k] : fallback) } as any;

let issued = 0;
const live = new Set<string>();
const logouts: { userId: string; token?: string }[] = [];
const user = { id: 'u1', companyId: 'c1', displayName: 'U', roles: ['EMP'], moduleAccess: [] };

function newSession() {
  const refreshToken = `rt-${++issued}`;
  live.add(refreshToken);
  return { accessToken: `at-${issued}`, refreshToken, forcePasswordChange: false, user };
}

const stubAuth = {
  loginPassword: async () => newSession(),
  verifyOtp: async () => newSession(),
  setupSuperAdmin: async () => newSession(),
  refresh: async (token: string) => {
    if (!live.delete(token)) throw new UnauthorizedException('Invalid refresh token');
    return newSession();
  },
  logout: async (userId: string, token?: string) => {
    logouts.push({ userId, token });
    if (token) live.delete(token);
    return { message: 'Logged out' };
  },
} as unknown as AuthService;

const ctl = new AuthController(stubAuth, config);

function route(fn: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return async (req: Request, res: Response) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      if (err instanceof HttpException) {
        res.status(err.getStatus()).json(err.getResponse());
      } else {
        res.status(500).json({ message: String(err) });
      }
    }
  };
}

let server: Server;
let base = '';

before(async () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.post('/api/v1/auth/login', route((req, res) => ctl.login(req.body, req, res)));
  app.post('/api/v1/auth/refresh', route((req, res) => ctl.refresh(req.body ?? {}, req, res)));
  app.post(
    '/api/v1/auth/logout',
    route((req, res) => ctl.logout(user as any, req.body ?? {}, req, res)),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(() => server?.close());

const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

function cookieValue(res: globalThis.Response): string | null {
  const sc = res.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!sc) return null;
  return decodeURIComponent(sc.split(';')[0].slice(REFRESH_COOKIE.length + 1));
}

test('web login sets httpOnly/Secure/SameSite=Strict cookie on /api/v1/auth and omits refreshToken', async () => {
  const res = await post('/auth/login', { 'X-Client': 'web' }, { identifier: 'a', password: 'b' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.accessToken);
  assert.equal('refreshToken' in body, false, 'refresh token must not be readable by page JS');
  const sc = res.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  assert.ok(sc, 'refresh cookie set');
  assert.match(sc!, /;\s*HttpOnly/i);
  assert.match(sc!, /;\s*Secure/i);
  assert.match(sc!, /;\s*SameSite=Strict/i);
  assert.match(sc!, /;\s*Path=\/api\/v1\/auth(;|$)/);
  assert.match(sc!, /;\s*Max-Age=604800/);
});

test('mobile login (no X-Client) keeps refreshToken in body and sets no cookie', async () => {
  const res = await post('/auth/login', {}, { identifier: 'a', password: 'b' });
  const body = await res.json();
  assert.ok(body.accessToken);
  assert.match(body.refreshToken, /^rt-/);
  assert.equal(cookieValue(res), null);
});

test('COOKIE_SECURE=false drops the Secure flag (http localhost dev)', async () => {
  env.COOKIE_SECURE = 'false';
  try {
    const res = await post('/auth/login', { 'X-Client': 'web' });
    const sc = res.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!;
    assert.doesNotMatch(sc, /;\s*Secure/i);
    assert.match(sc, /HttpOnly/i);
  } finally {
    delete env.COOKIE_SECURE;
  }
});

test('refresh via cookie + X-CSRF rotates the cookie and returns a new access token', async () => {
  const login = await post('/auth/login', { 'X-Client': 'web' });
  const rt = cookieValue(login)!;
  const res = await post('/auth/refresh', {
    Cookie: `${REFRESH_COOKIE}=${rt}`,
    'X-CSRF': '1',
    'X-Client': 'web',
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.accessToken);
  assert.equal('refreshToken' in body, false);
  const rotated = cookieValue(res);
  assert.ok(rotated && rotated !== rt, 'cookie rotated');

  // Old cookie is single-use: replay fails and clears the cookie.
  const replay = await post('/auth/refresh', { Cookie: `${REFRESH_COOKIE}=${rt}`, 'X-CSRF': '1' });
  assert.equal(replay.status, 401);
  const cleared = replay.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  assert.ok(cleared && /Expires=Thu, 01 Jan 1970/i.test(cleared), 'cookie cleared on failure');
});

test('refresh via cookie WITHOUT the CSRF header is rejected (403) and token is not consumed', async () => {
  const login = await post('/auth/login', { 'X-Client': 'web' });
  const rt = cookieValue(login)!;
  const res = await post('/auth/refresh', { Cookie: `${REFRESH_COOKIE}=${rt}` });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'CSRF_HEADER_REQUIRED');
  assert.ok(live.has(rt), 'token still valid after rejected CSRF attempt');

  const wrong = await post('/auth/refresh', { Cookie: `${REFRESH_COOKIE}=${rt}`, 'X-CSRF': '0' });
  assert.equal(wrong.status, 403);
});

test('mobile refresh with body token needs no CSRF header and still returns refreshToken', async () => {
  const login = await (await post('/auth/login')).json();
  const res = await post('/auth/refresh', {}, { refreshToken: login.refreshToken });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.refreshToken, /^rt-/);
  assert.equal(cookieValue(res), null);
});

test('refresh with no token at all is 401', async () => {
  const res = await post('/auth/refresh', { 'X-CSRF': '1' });
  assert.equal(res.status, 401);
});

test('logout via cookie requires CSRF header, revokes that token and clears the cookie', async () => {
  const login = await post('/auth/login', { 'X-Client': 'web' });
  const rt = cookieValue(login)!;

  const noCsrf = await post('/auth/logout', { Cookie: `${REFRESH_COOKIE}=${rt}` });
  assert.equal(noCsrf.status, 403);
  assert.ok(live.has(rt));

  const res = await post('/auth/logout', { Cookie: `${REFRESH_COOKIE}=${rt}`, 'X-CSRF': '1' });
  assert.equal(res.status, 200);
  assert.deepEqual(logouts.at(-1), { userId: 'u1', token: rt });
  assert.equal(live.has(rt), false);
  const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  assert.ok(cleared && /Path=\/api\/v1\/auth/.test(cleared) && /Expires=Thu, 01 Jan 1970/i.test(cleared));
});

// ---- PasswordChangeGuard -------------------------------------------------------------------

class OtherController {
  list() {
    return [];
  }
}

function guardCtx(handler: (...args: never[]) => unknown, cls: abstract new (...args: never[]) => unknown, reqUser: unknown) {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user: reqUser }) }),
  } as any;
}

const guard = new PasswordChangeGuard(new Reflector());
const mustChange = { id: 'u1', companyId: 'c1', forcePasswordChange: true };
const P = AuthController.prototype;

test('password-change guard blocks every other authenticated route with PASSWORD_CHANGE_REQUIRED', () => {
  for (const [h, c] of [
    [OtherController.prototype.list, OtherController],
    [P.setup2fa, AuthController],
    [P.changeUsername, AuthController],
    [P.listAdminUsers, AuthController],
  ] as const) {
    assert.throws(
      () => guard.canActivate(guardCtx(h, c, mustChange)),
      (err: any) => err.getStatus() === 403 && err.getResponse().code === PASSWORD_CHANGE_REQUIRED,
    );
  }
});

test('password-change guard allows change-password, logout, refresh, auth/me and public routes', () => {
  for (const h of [P.changePassword, P.logout, P.refresh, P.me, P.login]) {
    assert.equal(guard.canActivate(guardCtx(h, AuthController, mustChange)), true);
  }
});

test('password-change guard lets the user through once the flag is cleared', () => {
  const cleared = { ...mustChange, forcePasswordChange: false };
  assert.equal(guard.canActivate(guardCtx(OtherController.prototype.list, OtherController, cleared)), true);
  assert.equal(guard.canActivate(guardCtx(P.setup2fa, AuthController, cleared)), true);
});
