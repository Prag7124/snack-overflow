import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import type { ActivityAction, ActivitySummary } from '../types';

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
}

const ACTION_BADGES: Record<ActivityAction, { label: string; style: string }> = {
  consumed: { label: 'Grabbed', style: 'bg-slate-100 text-slate-800' },
  restocked: { label: 'Restocked', style: 'bg-emerald-100 text-emerald-800' },
  voted: { label: 'Upvoted', style: 'bg-amber-100 text-amber-800' },
};

export function ActivityDrawer({ open, onClose }: ActivityDrawerProps) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [filter, setFilter] = useState<ActivityAction | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getActivity(token!, filter, 60);
        if (active) setSummary(res);
      } catch (err) {
        if (active) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load activity');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [open, token, filter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Pantry Activity &amp; 7-Day Metrics</h2>
            <p className="text-xs text-slate-500">Immutable audit trail of grabs, restocks &amp; votes</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-lg font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {summary && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50">
                <p className="text-[11px] text-slate-500">7d Grabbed</p>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {summary.total_consumed_7d}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5 bg-emerald-50/50">
                <p className="text-[11px] text-emerald-700">7d Restocked</p>
                <p className="text-xl font-extrabold text-emerald-800 mt-0.5">
                  {summary.total_restocked_7d}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5 bg-amber-50/50">
                <p className="text-[11px] text-amber-800">Top Snack (7d)</p>
                <p className="text-xs font-bold text-slate-900 mt-1.5 truncate">
                  {summary.top_consumed_snack || '—'}
                </p>
              </div>
            </div>
          )}

          {/* Action Filter Pills */}
          <div className="flex gap-2">
            {(['', 'consumed', 'restocked', 'voted'] as const).map((act) => (
              <button
                key={act || 'all'}
                type="button"
                onClick={() => setFilter(act)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                  filter === act
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {act === '' ? 'All' : ACTION_BADGES[act].label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-sm text-slate-500">Loading audit events...</div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {summary?.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No activity events yet.</div>
              ) : (
                summary?.items.map((item) => {
                  const badge = ACTION_BADGES[item.action];
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 bg-white flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="text-slate-900 font-medium">
                          <strong>{item.user_name}</strong>{' '}
                          <span className="text-slate-500">
                            {item.action === 'voted'
                              ? 'upvoted'
                              : `${item.action} ${item.amount} ×`}
                          </span>{' '}
                          <strong>{item.snack_name}</strong>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badge.style}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
