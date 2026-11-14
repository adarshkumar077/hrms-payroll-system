import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { Roles, ROLES_KEY } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { RolesGuard } from './roles.guard';

// Real decorators applied to real classes, read back through a real Reflector.
class NoRolesController {
  open() {}
  @Public()
  pub() {}
}

@Roles('HR' as any, 'ADMIN' as any)
class AnyOfController {
  inherited() {}
  @Roles('SUPER_ADMIN' as any)
  override() {}
  @Public()
  publicHandler() {}
}

function ctx(cls: any, handler: string, user: unknown) {
  return {
    getHandler: () => cls.prototype[handler],
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

const guard = new RolesGuard(new Reflector());
const as = (...roles: string[]) => ({ id: 'u', roles });

describe('RolesGuard', () => {
  test('decorator stores the role list under ROLES_KEY', () => {
    assert.deepEqual(new Reflector().get(ROLES_KEY, AnyOfController), ['HR', 'ADMIN']);
  });

  test('no @Roles: any authenticated user passes', () => {
    assert.equal(guard.canActivate(ctx(NoRolesController, 'open', as('EMPLOYEE'))), true);
  });

  test('no @Roles: passes even for an empty role list (authentication is the JWT guard job)', () => {
    assert.equal(guard.canActivate(ctx(NoRolesController, 'open', as())), true);
  });

  test('@Roles is any-of: one matching role is enough', () => {
    assert.equal(guard.canActivate(ctx(AnyOfController, 'inherited', as('HR'))), true);
    assert.equal(guard.canActivate(ctx(AnyOfController, 'inherited', as('ADMIN'))), true);
    assert.equal(guard.canActivate(ctx(AnyOfController, 'inherited', as('EMPLOYEE', 'ADMIN'))), true);
  });

  test('@Roles: a user with none of the required roles is denied', () => {
    assert.equal(guard.canActivate(ctx(AnyOfController, 'inherited', as('EMPLOYEE'))), false);
  });

  test('@Roles: a user with no roles or no user is denied', () => {
    assert.equal(guard.canActivate(ctx(AnyOfController, 'inherited', as())), false);
    assert.equal(guard.canActivate(ctx(AnyOfController, 'inherited', undefined)), false);
  });

  test('method-level @Roles overrides class-level (not merged)', () => {
    assert.equal(guard.canActivate(ctx(AnyOfController, 'override', as('SUPER_ADMIN'))), true);
    assert.equal(guard.canActivate(ctx(AnyOfController, 'override', as('HR'))), false);
  });

  test('@Public bypasses role checks and works without a user', () => {
    assert.equal(guard.canActivate(ctx(NoRolesController, 'pub', undefined)), true);
    assert.equal(guard.canActivate(ctx(AnyOfController, 'publicHandler', undefined)), true);
    assert.equal(guard.canActivate(ctx(AnyOfController, 'publicHandler', as('EMPLOYEE'))), true);
  });
});
