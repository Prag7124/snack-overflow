import { useState, type FormEvent } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';

function EyeToggleButton({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 cursor-pointer"
    >
      {visible ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      )}
    </button>
  );
}

export function LoginView() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setResetToken(res.reset_token);
      setInfoMsg(res.message);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setMode('reset');
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
      setShowPassword(false);
      setMode('login');
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
              ? 'Verify your active workspace email to reset your password'
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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <EyeToggleButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  label={showPassword ? 'Hide password' : 'Show password'}
                />
              </div>
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
              {submitting ? 'Verifying Account...' : 'Verify & Continue'}
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

        {mode === 'reset' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            {infoMsg && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
                {infoMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                New Password (min 6 chars)
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <EyeToggleButton
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((v) => !v)}
                  label={showNewPassword ? 'Hide new password' : 'Show new password'}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <EyeToggleButton
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((v) => !v)}
                  label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                />
              </div>
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
                setResetToken('');
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
