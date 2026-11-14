import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { assertEmployeeScope, isHrOrAbove, isPrivileged, requireLinkedEmployee } from './authorization.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

const user = (roles: string[], employeeId: string | null = null, companyId = 'c1'): AuthUser => ({
  id: 'u',
  companyId,
  displayName: 'U',
  roles,
  employeeId,
  moduleAccess: [],
});

describe('isPrivileged / isHrOrAbove', () => {
  test('SUPER_ADMIN, HR and ADMIN are privileged; EMPLOYEE is not', () => {
    for (const r of ['SUPER_ADMIN', 'HR', 'ADMIN']) assert.equal(isPrivileged(user([r])), true, r);
    assert.equal(isPrivileged(user(['EMPLOYEE'])), false);
    assert.equal(isPrivileged(user([])), false);
    assert.equal(isPrivileged(user(['EMPLOYEE', 'HR'])), true);
  });

  test('isHrOrAbove excludes ADMIN', () => {
    assert.equal(isHrOrAbove(user(['SUPER_ADMIN'])), true);
    assert.equal(isHrOrAbove(user(['HR'])), true);
    assert.equal(isHrOrAbove(user(['ADMIN'])), false);
    assert.equal(isHrOrAbove(user(['EMPLOYEE'])), false);
  });
});

describe('assertEmployeeScope (IDOR guard)', () => {
  test('an EMPLOYEE can access their own employeeId', () => {
    assert.doesNotThrow(() => assertEmployeeScope(user(['EMPLOYEE'], 'e1'), 'e1'));
  });

  test('an EMPLOYEE cannot access another employee (profile / payslip / attendance ids)', () => {
    assert.throws(() => assertEmployeeScope(user(['EMPLOYEE'], 'e1'), 'e2'), ForbiddenException);
  });

  test('an EMPLOYEE with no linked profile is denied everything', () => {
    assert.throws(() => assertEmployeeScope(user(['EMPLOYEE'], null), 'e1'), ForbiddenException);
    assert.throws(() => assertEmployeeScope(user(['EMPLOYEE'], undefined as any), 'e1'), ForbiddenException);
  });

  test('a custom message is used', () => {
    assert.throws(
      () => assertEmployeeScope(user(['EMPLOYEE'], 'e1'), 'e2', 'only yours'),
      (e: any) => e instanceof ForbiddenException && e.message === 'only yours',
    );
  });

  test('HR / ADMIN / SUPER_ADMIN may access any employeeId (company filtering is done by services)', () => {
    for (const r of ['HR', 'ADMIN', 'SUPER_ADMIN']) {
      assert.doesNotThrow(() => assertEmployeeScope(user([r], null), 'e2'), r);
    }
  });
});

describe('requireLinkedEmployee', () => {
  test('returns the linked employeeId for employees', () => {
    assert.equal(requireLinkedEmployee(user(['EMPLOYEE'], 'e1')), 'e1');
  });
  test('an employee with no profile is forbidden', () => {
    assert.throws(() => requireLinkedEmployee(user(['EMPLOYEE'], null)), ForbiddenException);
  });
  test('privileged users without a profile are allowed (returns null)', () => {
    assert.equal(requireLinkedEmployee(user(['HR'], null)), null);
  });
});
