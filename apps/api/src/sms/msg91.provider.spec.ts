import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Msg91OtpProvider } from './msg91.provider';

const AUTH = 'secret-auth-key-123';
const CODE = '482913';

function cfg(env: Record<string, string | undefined>) {
  return { get: (k: string) => env[k] } as any;
}

function fakeFetch(status: number, body: unknown, calls: any[]) {
  return (async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
}

describe('Msg91OtpProvider', () => {
  test('is not configured without auth key and template id', () => {
    assert.equal(new Msg91OtpProvider(cfg({})).isConfigured(), false);
    assert.equal(new Msg91OtpProvider(cfg({ MSG91_AUTH_KEY: AUTH })).isConfigured(), false);
    assert.equal(new Msg91OtpProvider(cfg({ MSG91_OTP_TEMPLATE_ID: 't' })).isConfigured(), false);
  });

  test('sends the flow request in the documented format', async () => {
    const calls: any[] = [];
    const p = new Msg91OtpProvider(
      cfg({ MSG91_AUTH_KEY: AUTH, MSG91_OTP_TEMPLATE_ID: 'tmpl-1', MSG91_BASE_URL: 'http://mock.local/' }),
      fakeFetch(200, { type: 'success', message: 'req-42' }, calls),
    );
    const res = await p.sendOtp('9876543210', CODE);
    assert.deepEqual(res, { ok: true, providerMessageId: 'req-42' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://mock.local/api/v5/flow');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.authkey, AUTH);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body, {
      template_id: 'tmpl-1',
      short_url: '0',
      recipients: [{ mobiles: '919876543210', otp: CODE }],
    });
  });

  test('uses a custom template variable name', async () => {
    const calls: any[] = [];
    const p = new Msg91OtpProvider(
      cfg({ MSG91_AUTH_KEY: AUTH, MSG91_OTP_TEMPLATE_ID: 't', MSG91_OTP_VAR: 'var1' }),
      fakeFetch(200, { type: 'success' }, calls),
    );
    await p.sendOtp('9876543210', CODE);
    assert.equal(JSON.parse(calls[0].init.body).recipients[0].var1, CODE);
  });

  test('provider errors never contain the OTP or the auth key', async () => {
    const p = new Msg91OtpProvider(
      cfg({ MSG91_AUTH_KEY: AUTH, MSG91_OTP_TEMPLATE_ID: 't' }),
      fakeFetch(401, { type: 'error', message: `bad key ${AUTH} for ${CODE}` }, []),
    );
    const res = await p.sendOtp('9876543210', CODE);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'msg91_http_401_error');
    assert.ok(!JSON.stringify(res).includes(CODE));
    assert.ok(!JSON.stringify(res).includes(AUTH));
  });

  test('network failures are reported without details', async () => {
    const p = new Msg91OtpProvider(
      cfg({ MSG91_AUTH_KEY: AUTH, MSG91_OTP_TEMPLATE_ID: 't' }),
      (async () => {
        throw new Error(`connect failed ${AUTH}`);
      }) as unknown as typeof fetch,
    );
    assert.deepEqual(await p.sendOtp('9876543210', CODE), { ok: false, error: 'msg91_network_error' });
  });
});
