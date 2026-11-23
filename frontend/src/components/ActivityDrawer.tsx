import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import type { ActivityAction, ActivitySummary, PantryOrder } from '../types';

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
}

const ACTION_BADGES: Record<ActivityAction, { label: string; style: string }> = {
  consumed: { label: 'Ordered', style: 'bg-slate-100 text-slate-800' },
  restocked: { label: 'Restocked', style: 'bg-emerald-100 text-emerald-800' },
  voted: { label: 'Upvoted', style: 'bg-amber-100 text-amber-800' },
};

export function ActivityDrawer({ open, onClose }: ActivityDrawerProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<'orders' | 'audit'>('orders');
  const [orders, setOrders] = useState<PantryOrder[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [handingOverId, setHandingOverId] = useState<string | null>(null);

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
        const [ordersRes, activityRes] = await Promise.all([
          api.listOrders(token!, { search: orderSearch }),
          api.getActivity(token!, filter, 60),
        ]);
        if (active) {
          setOrders(ordersRes);
          setSummary(activityRes);
          if (ordersRes.length > 0 && !expandedOrderId) {
            setExpandedOrderId(ordersRes[0].id);
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load logs');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [open, token, filter, orderSearch]);

  if (!open) return null;

  async function handleHandover(order: PantryOrder) {
    if (!token || handingOverId) return;
    setHandingOverId(order.id);
    try {
      const updated = await api.handoverOrder(token, order.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Handover update failed');
    } finally {
      setHandingOverId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Pickup Orders &amp; Pantry Audit
            </h2>
            <p className="text-xs text-slate-500">
              Verify member Order Numbers at pickup &amp; review 7-day velocity
            </p>
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

          {/* Switcher between Unified Orders & Raw Stock/Vote Audit */}
          <div className="flex border-b border-slate-200 gap-4">
            <button
              type="button"
              onClick={() => setTab('orders')}
              className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                tab === 'orders'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              Pickup Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('audit')}
              className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                tab === 'audit'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              Stock &amp; Vote Audit Log
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          {tab === 'orders' ? (
            <div className="space-y-3">
              <input
                type="search"
                placeholder="Search by Order # (e.g. ORD-1001) or member name..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              {orders.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded-xl">
                  No pickup orders found.
                </div>
              ) : (
                orders.map((ord) => {
                  const isExpanded = expandedOrderId === ord.id;
                  return (
                    <div
                      key={ord.id}
                      className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">
                              {ord.order_code}
                            </span>
                            <span className="text-xs font-semibold text-slate-700">
                              &bull; {ord.user_name}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(ord.created_at).toLocaleString()} &bull; {ord.total_items}{' '}
                            item(s)
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                              ord.status === 'handed_over'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ord.status === 'handed_over' ? 'Handed Over' : 'Awaiting Pickup'}
                          </span>
                          <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/60 space-y-3 text-xs">
                          <div className="space-y-1">
                            {ord.items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between bg-white px-3 py-1.5 rounded-md border border-slate-200"
                              >
                                <span className="font-medium text-slate-800">{it.snack_name}</span>
                                <span className="font-bold text-slate-900">× {it.quantity}</span>
                              </div>
                            ))}
                          </div>

                          {ord.status === 'pending_pickup' && (
                            <button
                              type="button"
                              disabled={handingOverId === ord.id}
                              onClick={() => handleHandover(ord)}
                              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 text-xs transition cursor-pointer"
                            >
                              {handingOverId === ord.id
                                ? 'Confirming...'
                                : `✓ Verify ${ord.order_code} & Mark Handed Over`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <>
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

              {loading ? (
                <div className="text-center py-8 text-xs text-slate-500">Loading audit...</div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {summary?.items.map((item) => {
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
                            {item.order_code && (
                              <span className="ml-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                {item.order_code}
                              </span>
                            )}
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
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
