import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';

export function LoginView() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Open the clean "Set New Password" form only when arriving from the email link (?reset_token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('reset_token');
    if (tokenParam) {
      setResetToken(tokenParam);
      setMode('reset');
    }
  }, []);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to connect to Snack Overflow API. Verify FastAPI is running on port 8000.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setInfoMsg(res.message);
      setMode('sent');
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not verify email for password reset.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please enter the same password twice.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.resetPassword(resetToken, newPassword);
      setInfoMsg(res.message);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setMode('login');
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Could not reset password.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200/80 p-8 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-2xl">
            🍿
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Snack Overflow</h1>
          <p className="text-sm text-slate-500">
            {mode === 'login'
              ? 'Real-time office pantry inventory & AI restock copilot'
              : mode === 'forgot'
              ? 'Enter your active workspace email to receive a reset link'
              : mode === 'sent'
              ? 'Check your email inbox to continue'
              : 'Choose your new Snack Overflow password'}
          </p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                Workspace Email
              </label>
              <input
                type="email"
                required
                placeholder="you@snackoverflow.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setInfoMsg(null);
                  }}
                  className="text-xs font-medium text-amber-800 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {infoMsg && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
                {infoMsg}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 text-sm transition cursor-pointer"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                Active Employee / Admin Email
              </label>
              <input
                type="email"
                required
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 text-sm transition cursor-pointer"
            >
              {submitting ? 'Sending Reset Link...' : 'Send Password Reset Email'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="w-full text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              ← Back to Sign In
            </button>
          </form>
        )}

        {mode === 'sent' && (
          <div className="space-y-4 text-center">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 space-y-1.5">
              <p className="font-bold text-sm">📬 Reset Link Sent</p>
              <p>{infoMsg}</p>
              <p className="text-[11px] text-emerald-700 pt-1">
                Open the link in your email within 15 minutes to set your new password.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfoMsg(null);
              }}
              className="w-full rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 text-xs transition cursor-pointer"
            >
              ← Back to Sign In
            </button>
          </div>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                New Password (min 6 chars)
              </label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 text-sm transition cursor-pointer"
            >
              {submitting ? 'Updating Password...' : 'Save New Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="w-full text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              ← Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
