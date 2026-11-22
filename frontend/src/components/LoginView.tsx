import { useState, type FormEvent } from 'react';
import { ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';

export function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('member@snackoverflow.dev');
  const [password, setPassword] = useState('member123');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to connect to Snack Overflow API. Is FastAPI running on port 8000?');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(role: 'admin' | 'member') {
    setError(null);
    if (role === 'admin') {
      setEmail('admin@snackoverflow.dev');
      setPassword('admin123');
    } else {
      setEmail('member@snackoverflow.dev');
      setPassword('member123');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-slate-50 to-orange-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 text-white text-2xl font-bold mb-3 shadow-sm">
            🍿
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Snack Overflow</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time engineering pantry tracker & restock copilot
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            type="button"
            onClick={() => fillDemo('member')}
            className="text-xs font-medium py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
          >
            Fill Member Demo
          </button>
          <button
            type="button"
            onClick={() => fillDemo('admin')}
            className="text-xs font-medium py-2 px-3 rounded-lg border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 text-amber-900 transition cursor-pointer"
          >
            Fill Admin Demo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 text-sm transition cursor-pointer"
          >
            {submitting ? 'Signing in...' : 'Sign In to Pantry'}
          </button>
        </form>
      </div>
    </div>
  );
}
