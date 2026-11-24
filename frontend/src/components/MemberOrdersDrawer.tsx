import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import type { PantryOrder, Snack } from '../types';

export interface TrayItem {
  snack: Snack;
  quantity: number;
}

interface MemberOrdersDrawerProps {
  open: boolean;
  tray: TrayItem[];
  onUpdateQty: (snackId: string, qty: number) => void;
  onClearTray: () => void;
  onOrderPlaced: (order: PantryOrder) => void;
  onClose: () => void;
}

export function MemberOrdersDrawer({
  open,
  tray,
  onUpdateQty,
  onClearTray,
  onOrderPlaced,
  onClose,
}: MemberOrdersDrawerProps) {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<PantryOrder[]>([]);
  const [latestOrder, setLatestOrder] = useState<PantryOrder | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let active = true;
    async function loadOrders() {
      setLoadingOrders(true);
      try {
        const list = await api.listOrders(token!);
        if (active) setOrders(list);
      } catch {
        // Non-blocking
      } finally {
        if (active) setLoadingOrders(false);
      }
    }
    loadOrders();
    return () => {
      active = false;
    };
  }, [open, token]);

  if (!open) return null;

  async function handleCheckout() {
    if (!token || tray.length === 0 || checkingOut) return;
    setError(null);
    setCheckingOut(true);
    try {
      const created = await api.createOrder(
        token,
        tray.map((t) => ({ snack_id: t.snack.id, quantity: t.quantity }))
      );
      setLatestOrder(created);
      setOrders((prev) => [created, ...prev]);
      onClearTray();
      onOrderPlaced(created);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="font-bold text-slate-900 text-base">My Snack Tray &amp; Pickup Passes</h2>
            <p className="text-xs text-slate-500">
              Checkout items together to generate your unified Order Number
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Current Tray Checkout Box */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Current Tray ({tray.reduce((s, i) => s + i.quantity, 0)} items)
              </h3>
              {tray.length > 0 && (
                <button
                  type="button"
                  onClick={onClearTray}
                  className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  Clear tray
                </button>
              )}
            </div>

            {tray.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Your tray is empty. Click <strong>+ Tray</strong> on any snack card to bundle multiple snacks into one order pass.
              </p>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {tray.map(({ snack, quantity }) => (
                    <div key={snack.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{snack.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {snack.quantity} available in pantry
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(snack.id, quantity - 1)}
                          className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{quantity}</span>
                        <button
                          type="button"
                          disabled={quantity >= snack.quantity}
                          onClick={() => onUpdateQty(snack.id, quantity + 1)}
                          className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  disabled={checkingOut}
                  onClick={handleCheckout}
                  className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 text-xs transition cursor-pointer"
                >
                  {checkingOut
                    ? 'Confirming Stock & Generating Order Pass...'
                    : 'Confirm Order & Get Pickup Pass'}
                </button>
              </>
            )}
          </div>

          {/* Highlighted Latest Order Receipt */}
          {latestOrder && latestOrder.status !== 'handed_over' && (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Active Pickup Receipt — Show to Admin
                </span>
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">
                  {latestOrder.order_code}
                </span>
              </div>
              <p className="text-xs text-slate-700">
                Ordered by <strong>{user?.name}</strong> &bull;{' '}
                {new Date(latestOrder.created_at).toLocaleString()}
              </p>
              <ul className="text-xs text-slate-900 space-y-1 bg-white rounded-lg p-3 border border-emerald-200">
                {latestOrder.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between font-medium">
                    <span>{it.snack_name}</span>
                    <span className="font-bold">× {it.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Past Orders History */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              My Order History ({orders.length})
            </h3>

            {loadingOrders ? (
              <p className="text-xs text-slate-500">Loading your orders...</p>
            ) : orders.length === 0 ? (
              <p className="text-xs text-slate-500">No orders placed yet.</p>
            ) : (
              orders.filter((o) => o.id !== latestOrder?.id || o.status === 'handed_over').slice(0, 5).map((ord) => (
                <div
                  key={ord.id}
                  className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-sm">
                      {ord.order_code}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        ord.status === 'handed_over'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {ord.status === 'handed_over' ? 'Picked Up' : 'Ready for Pickup'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {new Date(ord.created_at).toLocaleString()}
                  </p>
                  <div className="pt-1.5 border-t border-slate-100 space-y-1">
                    {ord.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-slate-700">
                        <span>{it.snack_name}</span>
                        <span className="font-semibold">× {it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
