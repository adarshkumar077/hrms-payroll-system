'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, getStoredUser, setSession, SessionUser } from '@/lib/api';
import { getHomePathForUser } from '@/lib/home';

type LoginMode = 'password' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [setupUsername, setSetupUsername] = useState('');
  const [setupMobile, setSetupMobile] = useState('');
  const [setupDisplayName, setSetupDisplayName] = useState('Super Admin');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) return;
    router.replace(
      u.forcePasswordChange ? '/account/password?required=true' : getHomePathForUser(u),
    );
  }, [router]);

  useEffect(() => {
    api<{ needsSetup: boolean }>('/auth/setup/status', { auth: false })
      .then((res) => setNeedsSetup(res.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function onSetupSuperAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const data = await api<{
        accessToken: string;
        refreshToken: string;
        user: SessionUser;
        forcePasswordChange?: boolean;
      }>(
        '/auth/setup/super-admin',
        {
          method: 'POST',
          auth: false,
          body: JSON.stringify({
            email: setupUsername,
            mobile: setupMobile,
            displayName: setupDisplayName,
            password: setupPassword,
            confirmPassword: setupConfirmPassword,
          }),
        },
      );
      setSession(data.accessToken, data.refreshToken, {
        ...data.user,
        forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
      });
      const nextUser = {
        ...data.user,
        forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
      };
      router.push(
        nextUser.forcePasswordChange ? '/account/password?required=true' : getHomePathForUser(nextUser),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<{
        accessToken: string;
        refreshToken: string;
        user: SessionUser;
        forcePasswordChange?: boolean;
      }>('/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ identifier, password, totpCode: totpCode || undefined }),
      });
      setSession(data.accessToken, data.refreshToken, {
        ...data.user,
        forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
      });
      const nextUser = {
        ...data.user,
        forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
      };
      router.push(
        nextUser.forcePasswordChange ? '/account/password?required=true' : getHomePathForUser(nextUser),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/otp/request', { method: 'POST', auth: false, body: JSON.stringify({ mobile }) });
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP request failed');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<{
        accessToken: string;
        refreshToken: string;
        user: SessionUser;
        forcePasswordChange?: boolean;
      }>('/auth/otp/verify', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ mobile, code: otp, totpCode: totpCode || undefined }),
      });
      setSession(data.accessToken, data.refreshToken, {
        ...data.user,
        forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
      });
      const nextUser = {
        ...data.user,
        forcePasswordChange: data.forcePasswordChange ?? data.user.forcePasswordChange,
      };
      router.push(
        nextUser.forcePasswordChange ? '/account/password?required=true' : getHomePathForUser(nextUser),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verify failed');
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: LoginMode; label: string }[] = [
    { key: 'password', label: 'User ID / Email' },
    { key: 'otp', label: 'Mobile OTP' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] gradient-banner relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6bTAtNHYyaDJ2LTJoLTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40" />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <div>
            <div className="flex items-center gap-3 mb-16">
              <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white/15 backdrop-blur flex items-center justify-center shrink-0 ring-1 ring-white/20">
                <img
                  src="/brand/bk-infotech-logo.png"
                  alt="BkInfotech"
                  width={44}
                  height={44}
                  className="w-[170%] max-w-none -ml-[17%] -mt-[4%] mix-blend-screen contrast-[1.05]"
                />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="font-display font-bold text-xl tracking-tight">EITF</p>
                <p className="text-sm font-medium text-white/70">Enhancing IT Infrastructure</p>
                <p className="text-xs text-white/50">BkInfotech</p>
              </div>
            </div>
            <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight mb-6">
              Enterprise Human<br />Resources Management
            </h1>
            <p className="text-lg text-white/80 max-w-md leading-relaxed">
              Streamline your workforce operations with a premium, all-in-one platform for people, payroll, and performance.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[
              { stat: '99.9%', label: 'Uptime' },
              { stat: '50+', label: 'Modules' },
              { stat: '24/7', label: 'Support' },
            ].map((s) => (
              <div key={s.label} className="glass-dark rounded-2xl p-4">
                <p className="text-2xl font-display font-bold">{s.stat}</p>
                <p className="text-sm text-white/60 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-surface-muted">
        <div className="w-full max-w-md animate-slide-in">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white ring-1 ring-ink-200/60 shadow-sm flex items-center justify-center shrink-0">
              <img
                src="/brand/bk-infotech-logo.png"
                alt="BkInfotech"
                width={40}
                height={40}
                className="w-[170%] max-w-none -ml-[17%] -mt-[4%] mix-blend-screen contrast-[1.04]"
              />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="font-display font-bold text-lg text-ink-900">EITF</p>
              <p className="text-[11px] font-medium text-ink-400">Enhancing IT Infrastructure</p>
              <p className="text-[10px] text-ink-400/80">BkInfotech</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold text-ink-900 mb-2">
            {needsSetup ? 'Initial Super Admin Setup' : 'Welcome back'}
          </h2>
          <p className="text-sm text-ink-500 mb-8">
            {needsSetup
              ? 'Create the first Super Admin account. No default credentials exist.'
              : 'Sign in to access your workspace'}
          </p>

          {needsSetup === null && (
            <p className="text-sm text-ink/60">Checking system status…</p>
          )}

          {needsSetup && (
            <form onSubmit={onSetupSuperAdmin} className="card p-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Email Address</span>
                <input
                  className="input mt-1.5"
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  required
                  minLength={5}
                  placeholder="Enter your email address"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Mobile number</span>
                <input
                  className="input mt-1.5"
                  value={setupMobile}
                  onChange={(e) => setSetupMobile(e.target.value)}
                  required
                  minLength={10}
                  maxLength={15}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Display name</span>
                <input
                  className="input mt-1.5"
                  value={setupDisplayName}
                  onChange={(e) => setSetupDisplayName(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Password</span>
                <input
                  className="input mt-1.5"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  type="password"
                  required
                  minLength={5}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Confirm password</span>
                <input
                  className="input mt-1.5"
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  type="password"
                  required
                  minLength={5}
                />
              </label>
              {error && <p className="text-sm text-danger bg-danger-light/50 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Creating account…' : 'Create Super Admin'}
              </button>
            </form>
          )}

          {needsSetup === false && (
          <>
          <div className="flex gap-1 p-1 bg-ink-100/60 rounded-xl mb-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setMode(t.key); setError(''); }}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  mode === t.key ? 'bg-white text-brand-700 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === 'password' && (
            <form onSubmit={onPasswordLogin} className="card p-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">User ID / Email Address</span>
                <input
                  className="input mt-1.5"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  minLength={3}
                  autoComplete="username"
                  placeholder="admin, hr001, or emp001"
                />
                <p className="text-xs text-ink-400 mt-1.5">
                  Use User ID (<strong>admin</strong>, <strong>hr001</strong>, <strong>emp001</strong>),
                  employee code (<strong>ADM001</strong>, <strong>HR001</strong>, <strong>EMP001</strong>),
                  or email.
                </p>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Password</span>
                <input className="input mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-700">2FA code <span className="text-ink-400 font-normal">(optional)</span></span>
                <input className="input mt-1.5" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} inputMode="numeric" />
              </label>
              {error && <p className="text-sm text-danger bg-danger-light/50 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {mode === 'otp' && (
            <form onSubmit={otpSent ? onVerifyOtp : onRequestOtp} className="card p-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Mobile number</span>
                <input className="input mt-1.5" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              </label>
              {otpSent && (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-ink-700">OTP code</span>
                    <input className="input mt-1.5" value={otp} onChange={(e) => setOtp(e.target.value)} required />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-ink-700">2FA code <span className="text-ink-400 font-normal">(optional)</span></span>
                    <input className="input mt-1.5" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
                  </label>
                </>
              )}
              {error && <p className="text-sm text-danger bg-danger-light/50 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Please wait…' : otpSent ? 'Verify OTP' : 'Send OTP'}
              </button>
            </form>
          )}

          <button
            type="button"
            className="mt-6 text-xs text-ink-400 hover:text-ink-600 transition-colors"
            onClick={() => { clearSession(); setError(''); }}
          >
            Clear local session
          </button>
          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-4 text-xs text-ink-500 bg-white/80 border border-ink-100 rounded-xl px-3 py-2.5 space-y-1">
              <p className="font-medium text-ink-700">Demo accounts</p>
              <p>Admin — <span className="font-mono">admin</span> / Admin@123</p>
              <p>HR — <span className="font-mono">hr001</span> / HR@123</p>
              <p>Employee — <span className="font-mono">emp001</span> / Emp@123</p>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
