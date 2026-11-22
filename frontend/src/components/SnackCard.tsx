import { useState } from 'react';
import type { Snack } from '../types';

interface SnackCardProps {
  snack: Snack;
  isAdmin: boolean;
  onConsume: (snack: Snack) => Promise<void>;
  onToggleVote: (snack: Snack) => Promise<void>;
  onQuickRestock: (snack: Snack, amount: number) => Promise<void>;
  onEditClick?: (snack: Snack) => void;
  onDeleteClick?: (snack: Snack) => void;
}

const STATUS_STYLES = {
  stocked: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Stocked',
  },
  running_low: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'Running Low',
  },
  gone: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    label: 'Gone',
  },
};

const CATEGORY_EMOJI: Record<Snack['category'], string> = {
  sweet: '🍪',
  savoury: '🥨',
  drink: '🥤',
  'healthy-ish': '🥜',
};

export function SnackCard({
  snack,
  isAdmin,
  onConsume,
  onToggleVote,
  onQuickRestock,
  onEditClick,
  onDeleteClick,
}: SnackCardProps) {
  const [busyAction, setBusyAction] = useState<'consume' | 'vote' | 'restock' | null>(null);
  const style = STATUS_STYLES[snack.status];

  async function handleConsume() {
    if (snack.quantity <= 0 || busyAction) return;
    setBusyAction('consume');
    try {
      await onConsume(snack);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVote() {
    if (busyAction) return;
    setBusyAction('vote');
    try {
      await onToggleVote(snack);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestock(amount: number) {
    if (busyAction) return;
    setBusyAction('restock');
    try {
      await onQuickRestock(snack, amount);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">
              {CATEGORY_EMOJI[snack.category]}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {snack.category}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${style.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        </div>

        <h3 className="text-base font-bold text-slate-900 mt-3 leading-snug">{snack.name}</h3>

        <div className="mt-3 flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-extrabold text-slate-900">{snack.quantity}</span>
            <span className="text-xs text-slate-500 ml-1.5">units left</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Low alert &le; {snack.low_stock_threshold}
          </span>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={snack.quantity <= 0 || busyAction !== null}
            onClick={handleConsume}
            className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2 px-3 transition cursor-pointer disabled:cursor-not-allowed"
          >
            {busyAction === 'consume'
              ? 'Grabbing...'
              : snack.quantity <= 0
              ? 'Out of Stock'
              : 'Grab 1'}
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleVote}
            title={snack.user_has_voted ? 'Remove restock vote' : 'Upvote for restock'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition cursor-pointer ${
              snack.user_has_voted
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{snack.user_has_voted ? '▲' : '△'}</span>
            <span>{snack.vote_count}</span>
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center justify-between gap-1.5 pt-1">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleRestock(5)}
              className="flex-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold py-1.5 px-2 transition cursor-pointer"
            >
              {busyAction === 'restock' ? 'Restocking...' : '+5 Restock'}
            </button>
            {onEditClick && (
              <button
                type="button"
                onClick={() => onEditClick(snack)}
                className="rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-medium py-1.5 px-2.5 transition cursor-pointer"
              >
                Edit
              </button>
            )}
            {onDeleteClick && (
              <button
                type="button"
                onClick={() => onDeleteClick(snack)}
                className="rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-medium py-1.5 px-2.5 transition cursor-pointer"
              >
                Del
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
