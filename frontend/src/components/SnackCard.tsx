import { useState } from 'react';
import type { Snack } from '../types';

interface SnackCardProps {
  snack: Snack;
  isAdmin: boolean;
  inTrayQty?: number;
  onAddToTray?: (snack: Snack) => void;
  onToggleVote: (snack: Snack) => Promise<void>;
  onQuickRestock: (snack: Snack, amount: number) => Promise<void>;
  onEditClick?: (snack: Snack) => void;
  onDeleteClick?: (snack: Snack) => void;
}

const STATUS_STYLES = {
  stocked: {
    badge: 'bg-emerald-50/95 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Stocked',
  },
  running_low: {
    badge: 'bg-amber-50/95 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'Running Low',
  },
  gone: {
    badge: 'bg-rose-50/95 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    label: 'Gone',
  },
};

const CATEGORY_FALLBACK_IMG: Record<Snack['category'], string> = {
  sweet: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=600&q=80',
  savoury: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=600&q=80',
  drink: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=600&q=80',
  'healthy-ish': 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=600&q=80',
};

export function SnackCard({
  snack,
  isAdmin,
  inTrayQty = 0,
  onAddToTray,
  onToggleVote,
  onQuickRestock,
  onEditClick,
  onDeleteClick,
}: SnackCardProps) {
  const [busyAction, setBusyAction] = useState<'vote' | 'restock' | null>(null);
  const [restockQty, setRestockQty] = useState<number>(10);
  const style = STATUS_STYLES[snack.status];
  const imgSrc = snack.image_url || CATEGORY_FALLBACK_IMG[snack.category];

  async function handleVote() {
    if (busyAction) return;
    setBusyAction('vote');
    try {
      await onToggleVote(snack);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCustomRestock() {
    if (busyAction || !Number.isFinite(restockQty) || restockQty < 1) return;
    setBusyAction('restock');
    try {
      await onQuickRestock(snack, Math.floor(restockQty));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between">
      <div>
        <div className="relative h-36 w-full bg-slate-100 overflow-hidden">
          <img
            src={imgSrc}
            alt={snack.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <span
            title={`Current stock status: ${style.label}`}
            className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border backdrop-blur-xs ${style.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span
            title={`Snack category: ${snack.category}`}
            className="absolute bottom-2 left-2.5 text-[10px] font-bold uppercase tracking-wider bg-slate-900/75 text-white px-2 py-0.5 rounded-md"
          >
            {snack.category}
          </span>
        </div>

        <div className="p-4 pb-0">
          <h3 className="text-base font-bold text-slate-900 leading-snug">{snack.name}</h3>

          <div className="mt-2.5 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-extrabold text-slate-900">{snack.quantity}</span>
              <span className="text-xs text-slate-500 ml-1.5">units left</span>
            </div>
            <span
              title={
                isAdmin
                  ? 'Total member restock requests for this snack'
                  : 'Low-stock warning threshold'
              }
              className="text-[11px] text-slate-500 font-medium"
            >
              {isAdmin
                ? `${snack.vote_count} restock vote(s)`
                : `Low alert ≤ ${snack.low_stock_threshold}`}
            </span>
          </div>
        </div>
      </div>

      {/* Role-Specific Actions */}
      <div className="p-4 mt-3 pt-3 border-t border-slate-100">
        {isAdmin ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={100}
                value={restockQty}
                onChange={(e) => setRestockQty(Math.max(1, Number(e.target.value)))}
                title="Enter quantity to add to stock"
                aria-label={`Restock quantity for ${snack.name}`}
                className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                disabled={busyAction !== null || restockQty < 1}
                onClick={handleCustomRestock}
                title={`Add ${restockQty} units to ${snack.name}`}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold py-1.5 px-2.5 transition cursor-pointer"
              >
                {busyAction === 'restock' ? 'Adding...' : '+ Restock'}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {onEditClick && (
                <button
                  type="button"
                  onClick={() => onEditClick(snack)}
                  title="Edit snack name, category, photo, or threshold"
                  className="flex-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium py-1.5 px-2.5 transition cursor-pointer"
                >
                  Edit
                </button>
              )}
              {onDeleteClick && (
                <button
                  type="button"
                  onClick={() => onDeleteClick(snack)}
                  title="Delete this snack from the pantry"
                  className="flex-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium py-1.5 px-2.5 transition cursor-pointer"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={snack.quantity <= 0 || inTrayQty >= snack.quantity}
              onClick={() => onAddToTray?.(snack)}
              title={
                snack.quantity <= 0
                  ? 'Currently out of stock'
                  : 'Add to your Snack Tray, then open My Tray & Orders to checkout and get your Order Number'
              }
              className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2 px-3 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {snack.quantity <= 0
                ? 'Out of Stock'
                : inTrayQty > 0
                ? `+ Add Another (In Tray: ${inTrayQty})`
                : '+ Add to Tray'}
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleVote}
              title={
                snack.user_has_voted
                  ? 'Click to remove your restock request vote'
                  : 'Request restock — upvote to tell Admin we want more of this snack'
              }
              className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                snack.user_has_voted
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>
                {busyAction === 'vote'
                  ? 'Updating...'
                  : snack.user_has_voted
                  ? '▲ Upvoted'
                  : '△ Vote for Restock'}
              </span>
              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 text-[11px]">
                {snack.vote_count}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
