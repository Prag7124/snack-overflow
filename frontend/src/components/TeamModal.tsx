import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import type { User, UserRole } from '../types';

interface TeamModalProps {
  open: boolean;
  onClose: () => void;
}

export function TeamModal({ open, onClose }: TeamModalProps) {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    setError(null);
    setSuccessMsg(null);
    api.listUsers(token).then(setUsers).catch((err) => setError(err instanceof ApiClientError ? err.message : "Failed to load team list"));
  }, [open, token]);

  if (!open) return null;

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const created = await api.createUser(token, {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      setUsers((prev) => [created, ...prev]);
      setSuccessMsg(`Created ${created.role} account for ${created.name} (${created.email})`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('member');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(target: User) {
    if (!token || deletingId) return;
    if (
      !window.confirm(
        `Remove ${target.name} (${target.email}) from Snack Overflow? They will immediately lose login and password-reset access.`
      )
    ) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setDeletingId(target.id);
    try {
      await api.deleteUser(token, target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setSuccessMsg(`Removed ${target.name} (${target.email}). Access revoked immediately.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not remove user');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl p-6 max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Manage Team Members &amp; Admins</h2>
            <p className="text-xs text-slate-500">
              Add new employees or remove ex-employees to revoke pantry access immediately
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-lg font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleCreateUser} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                placeholder="e.g., Kavya Nair"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="member">Member (Employee)</option>
                <option value="admin">Admin (Pantry Manager)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Workspace Email
              </label>
              <input
                type="email"
                required
                placeholder="kavya@snackoverflow.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                Initial Password (min 6 chars)
              </label>
              <input
                type="text"
                required
                minLength={6}
                placeholder="member123"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2 text-xs transition cursor-pointer"
          >
            {submitting ? 'Creating Account...' : '+ Create Account'}
          </button>
        </form>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Active Accounts ({users.length})
          </h3>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <div key={u.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {u.name}{' '}
                      {isSelf && (
                        <span className="text-[10px] font-normal text-slate-400">(You)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">{u.email}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        u.role === 'admin'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {u.role}
                    </span>

                    {!isSelf && (
                      <button
                        type="button"
                        disabled={deletingId === u.id}
                        onClick={() => handleDeleteUser(u)}
                        title={`Remove ${u.name} from the company workspace`}
                        className="rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 text-[11px] font-semibold transition cursor-pointer"
                      >
                        {deletingId === u.id ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
