import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePantryStream, type SseEventMessage } from '../hooks/usePantryStream';
import type { PantryOrder, Snack, SnackCategory, SnackStatus } from '../types';
import type { TrayItem } from './MemberOrdersDrawer';
import { SnackCard } from './SnackCard';

interface PantryBoardProps {
  isAdmin: boolean;
  tray?: TrayItem[];
  onAddToTray?: (snack: Snack) => void;
  onOrderCreated?: (order: PantryOrder) => void;
  onEditSnack?: (snack: Snack) => void;
  onDeleteSnack?: (snack: Snack) => void;
  refreshTrigger?: number;
}

const CATEGORIES: Array<{ value: SnackCategory | ''; label: string }> = [
  { value: '', label: 'All Categories' },
  { value: 'sweet', label: 'Sweet' },
  { value: 'savoury', label: 'Savoury' },
  { value: 'drink', label: 'Drinks' },
  { value: 'healthy-ish', label: 'Healthy-ish' },
];

const STATUSES: Array<{ value: SnackStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'stocked', label: 'Stocked' },
  { value: 'running_low', label: 'Running Low' },
  { value: 'gone', label: 'Gone' },
];

export function PantryBoard({
  isAdmin,
  tray = [],
  onAddToTray,
  onOrderCreated,
  onEditSnack,
  onDeleteSnack,
  refreshTrigger = 0,
}: PantryBoardProps) {
  const { token, user } = useAuth();
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SnackCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<SnackStatus | ''>('');
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const showToast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchSnacks = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listSnacks(token);
      setSnacks(data);
    } catch (err) {
      showToast(
        err instanceof ApiClientError ? err.message : 'Failed to load pantry snacks',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    fetchSnacks();
  }, [fetchSnacks, refreshTrigger]);

  const handleSseEvent = useCallback(
    (event: SseEventMessage) => {
      if (event.type === 'snack.created' || event.type === 'snack.deleted') {
        fetchSnacks();
        if (event.type === 'snack.created') {
          showToast(`New snack added: ${String(event.data.name || 'Snack')}`);
        }
        return;
      }

      if (event.type === 'snack.updated') {
        const updatedId = String(event.data.id);
        setSnacks((prev) =>
          prev.map((s) =>
            s.id === updatedId
              ? {
                  ...s,
                  name: (event.data.name as string) ?? s.name,
                  category: (event.data.category as SnackCategory) ?? s.category,
                  image_url:
                    event.data.image_url !== undefined
                      ? (event.data.image_url as string | null)
                      : s.image_url,
                  quantity:
                    typeof event.data.quantity === 'number' ? event.data.quantity : s.quantity,
                  low_stock_threshold:
                    typeof event.data.low_stock_threshold === 'number'
                      ? event.data.low_stock_threshold
                      : s.low_stock_threshold,
                  status: (event.data.status as SnackStatus) ?? s.status,
                  vote_count:
                    typeof event.data.vote_count === 'number'
                      ? event.data.vote_count
                      : s.vote_count,
                }
              : s
          )
        );

        const actor = event.data.actor as string | undefined;
        const action = event.data.action as string | undefined;
        const snackName = event.data.name as string | undefined;
        const amount = event.data.amount as number | undefined;
        const orderCode = event.data.order_code as string | undefined;
        if (actor && action && snackName && actor !== user?.name) {
          showToast(
            `${actor} ${action} ${amount ?? 1} × ${snackName}${orderCode ? ` (${orderCode})` : ''}`
          );
        }
      }

      if (event.type === 'vote.updated') {
        const updatedId = String(event.data.id);
        const newVotes = event.data.vote_count;
        if (typeof newVotes === 'number') {
          setSnacks((prev) =>
            prev.map((s) => (s.id === updatedId ? { ...s, vote_count: newVotes } : s))
          );
        }
      }
    },
    [fetchSnacks, showToast, user?.name]
  );

  usePantryStream(token, handleSseEvent);

  const filteredSnacks = useMemo(() => {
    return snacks.filter((s) => {
      if (category && s.category !== category) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [snacks, category, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      total: snacks.length,
      stocked: snacks.filter((s) => s.status === 'stocked').length,
      running_low: snacks.filter((s) => s.status === 'running_low').length,
      gone: snacks.filter((s) => s.status === 'gone').length,
    };
  }, [snacks]);

  async function handleQuickOrder(snack: Snack) {
    if (!token) return;
    try {
      const order = await api.createOrder(token, [{ snack_id: snack.id, quantity: 1 }]);
      fetchSnacks();
      showToast(`Order ${order.order_code} confirmed for 1 × ${snack.name}!`);
      onOrderCreated?.(order);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : 'Could not place order', 'error');
      fetchSnacks();
    }
  }

  async function handleToggleVote(snack: Snack) {
    if (!token) return;
    try {
      const updated = snack.user_has_voted
        ? await api.unvoteSnack(token, snack.id)
        : await api.voteSnack(token, snack.id);
      setSnacks((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : 'Vote failed', 'error');
    }
  }

  async function handleQuickRestock(snack: Snack, amount: number) {
    if (!token) return;
    try {
      const updated = await api.restockSnack(token, snack.id, amount);
      setSnacks((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Restocked +${amount} × ${snack.name}`);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : 'Restock failed', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-xs font-semibold shadow-lg border transition ${
            toast.tone === 'error'
              ? 'bg-rose-900 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Clean 4-Card KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Total Snacks</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{counts.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-emerald-600 font-medium">Stocked</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{counts.stocked}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-amber-600 font-medium">Running Low</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{counts.running_low}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-rose-600 font-medium">Gone</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">{counts.gone}</p>
        </div>
      </div>

      {/* Unified Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <input
          type="search"
          placeholder="Search snacks by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search snacks by name"
          className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SnackCategory | '')}
            aria-label="Filter by snack category"
            title="Filter snacks by category"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SnackStatus | '')}
            aria-label="Filter by stock status"
            title="Filter snacks by stock status"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Snack Grid */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-500">Loading pantry...</div>
      ) : filteredSnacks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          No snacks match your current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSnacks.map((snack) => {
            const trayEntry = tray.find((t) => t.snack.id === snack.id);
            return (
              <SnackCard
                key={snack.id}
                snack={snack}
                isAdmin={isAdmin}
                inTrayQty={trayEntry?.quantity ?? 0}
                onConsume={handleQuickOrder}
                onAddToTray={onAddToTray}
                onToggleVote={handleToggleVote}
                onQuickRestock={handleQuickRestock}
                onEditClick={onEditSnack}
                onDeleteClick={onDeleteSnack}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
