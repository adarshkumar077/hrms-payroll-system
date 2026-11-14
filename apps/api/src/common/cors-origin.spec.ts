import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorsOriginAllowed, parseTrustProxy } from './cors-origin';

const prod = { isProd: true, corsOrigins: 'https://hr.example.com,*', publicAppUrl: 'https://app.example.com/x' };
const dev = { isProd: false, corsOrigins: 'http://localhost:3000' };

test('prod: allows configured, public url origin, and no origin', () => {
  assert.equal(isCorsOriginAllowed('https://hr.example.com', prod), true);
  assert.equal(isCorsOriginAllowed('https://app.example.com', prod), true);
  assert.equal(isCorsOriginAllowed(undefined, prod), true);
});

test('prod: wildcard ignored, LAN/loopback/tunnels blocked', () => {
  for (const o of [
    'https://evil.com',
    'http://192.168.1.5:3000',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://localhost:3000',
    'https://a.trycloudflare.com',
    'https://a.cfargotunnel.com',
    'https://a.ngrok-free.app',
  ])
    assert.equal(isCorsOriginAllowed(o, prod), false, o);
});

test('dev: LAN/loopback/tunnels allowed, others blocked', () => {
  for (const o of [
    'http://192.168.1.5:3000',
    'http://10.1.1.1',
    'http://172.20.0.1',
    'http://127.0.0.1:3000',
    'https://a.trycloudflare.com',
    'https://a.cfargotunnel.com',
    'https://a.ngrok-free.app',
    'https://a.ngrok.io',
  ])
    assert.equal(isCorsOriginAllowed(o, dev), true, o);
  assert.equal(isCorsOriginAllowed('https://evil.com', dev), false);
  assert.equal(isCorsOriginAllowed('http://172.32.0.1', dev), false);
});

test('parseTrustProxy', () => {
  assert.deepEqual(parseTrustProxy(undefined), ['loopback', 'linklocal', 'uniquelocal']);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('false'), false);
  assert.deepEqual(parseTrustProxy('10.0.0.0/8, loopback'), ['10.0.0.0/8', 'loopback']);
});
