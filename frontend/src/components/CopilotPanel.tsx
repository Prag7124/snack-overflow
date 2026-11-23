import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import type { CopilotResponse, PantryOrder, RestockRecommendation } from '../types';

interface CopilotPanelProps {
  open: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onRestockApplied: () => void;
}

interface ChatTurn {
  id: string;
  sender: 'user' | 'copilot';
  text: string;
  response?: CopilotResponse;
  confirmedOrder?: PantryOrder | null;
}

const ADMIN_PROMPTS = [
  'What needs urgent restocking first?',
  'Show pending pickup orders',
  'Which snacks have the highest team votes?',
];

const MEMBER_PROMPTS = [
  'Order 1 Aloo bonda',
  'Which healthy-ish snacks are in stock?',
  'Check my pickup passes',
];

export function CopilotPanel({
  open,
  isAdmin,
  onClose,
  onRestockApplied,
}: CopilotPanelProps) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [latestRecs, setLatestRecs] = useState<RestockRecommendation[]>([]);
  const [sourceTag, setSourceTag] = useState<'gemini' | 'smart-fallback'>('smart-fallback');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [confirmingTurnId, setConfirmingTurnId] = useState<string | null>(null);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quickQuestions = isAdmin ? ADMIN_PROMPTS : MEMBER_PROMPTS;

  useEffect(() => {
    if (!open || !token) return;
    let active = true;
    async function loadPlan() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getRestockPlan(token!);
        if (!active) return;
        setLatestRecs(res.recommendations);
        setSourceTag(res.source);
        setMessages((prev) =>
          prev.length === 0
            ? [{ id: 'welcome', sender: 'copilot', text: res.answer, response: res }]
            : prev
        );
      } catch (err) {
        if (active) {
          setError(err instanceof ApiClientError ? err.message : 'Copilot unavailable');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPlan();
    return () => {
      active = false;
    };
  }, [open, token]);

  if (!open) return null;

  async function submitQuestion(q: string) {
    if (!token || !q.trim() || asking) return;
    const trimmed = q.trim();
    const userTurnId = `u-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userTurnId, sender: 'user', text: trimmed }]);
    setAsking(true);
    setError(null);
    try {
      const res = await api.askCopilot(token, trimmed);
      setSourceTag(res.source);
      if (res.recommendations && res.recommendations.length > 0) {
        setLatestRecs(res.recommendations);
      }
      if (res.action_type === 'vote_added' || res.action_type === 'restocked') {
        onRestockApplied();
      }
      setMessages((prev) => [
        ...prev,
        { id: `c-${Date.now()}`, sender: 'copilot', text: res.answer, response: res },
      ]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reach Pantry Copilot');
    } finally {
      setAsking(false);
    }
  }

  async function handleAskForm(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    const currentQ = question;
    setQuestion('');
    await submitQuestion(currentQ);
  }

  async function handleConfirmChatOrder(
    turnId: string,
    items: Array<{ snack_id: string; snack_name: string; quantity: number }>
  ) {
    if (!token || confirmingTurnId) return;
    setConfirmingTurnId(turnId);
    setError(null);
    try {
      const created = await api.createOrder(
        token,
        items.map((i) => ({ snack_id: i.snack_id, quantity: i.quantity }))
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === turnId ? { ...m, confirmedOrder: created } : m))
      );
      onRestockApplied();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not place order');
    } finally {
      setConfirmingTurnId(null);
    }
  }

  async function handleApproveRestock(rec: RestockRecommendation) {
    if (!token || restockingId) return;
    setRestockingId(rec.snack_id);
    try {
      await api.restockSnack(token, rec.snack_id, rec.suggested_restock_qty);
      onRestockApplied();
      const refreshed = await api.getRestockPlan(token);
      setLatestRecs(refreshed.recommendations);
      setMessages((prev) => [
        ...prev,
        {
          id: `r-${Date.now()}`,
          sender: 'copilot',
          text: `Restocked ${rec.snack_name} (+${rec.suggested_restock_qty} units). Live pantry inventory updated!`,
        },
      ]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Restock failed');
    } finally {
      setRestockingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-base">
                  {isAdmin ? 'Admin Pantry Copilot' : 'Pantry Assistant'}
                </h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800">
                  {sourceTag === 'gemini' ? 'Gemini + Guardrails' : 'Pantry Engine'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isAdmin
                  ? 'Ask, check pickups, or restock snacks directly in chat'
                  : 'Ask about snacks, vote, or order your pickup pass in chat'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-lg font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Conversation & Action Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && messages.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              Connecting to live pantry...
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((turn) => {
                if (turn.sender === 'user') {
                  return (
                    <div key={turn.id} className="flex justify-end">
                      <div className="max-w-[82%] rounded-2xl rounded-br-xs bg-slate-900 text-white px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs">
                        {turn.text}
                      </div>
                    </div>
                  );
                }

                const pendingItems = turn.response?.pending_order_items ?? [];
                const userOrders = turn.response?.user_orders ?? [];

                return (
                  <div key={turn.id} className="space-y-2">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-xs bg-amber-50/80 border border-amber-200 px-4 py-3 text-xs text-slate-800 leading-relaxed">
                      {turn.text}
                    </div>

                    {/* Interactive 1-Click Order Confirmation Card */}
                    {turn.response?.action_type === 'order_confirm' &&
                      pendingItems.length > 0 &&
                      !turn.confirmedOrder && (
                        <div className="max-w-[92%] rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            Ready to Checkout
                          </p>
                          <ul className="text-xs text-slate-800 space-y-1">
                            {pendingItems.map((it) => (
                              <li key={it.snack_id} className="flex justify-between">
                                <span>{it.snack_name}</span>
                                <span className="font-bold">× {it.quantity}</span>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            disabled={confirmingTurnId === turn.id}
                            onClick={() => handleConfirmChatOrder(turn.id, pendingItems)}
                            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2 text-xs transition cursor-pointer"
                          >
                            {confirmingTurnId === turn.id
                              ? 'Generating Pickup Pass...'
                              : 'Confirm Order & Get Pickup Pass'}
                          </button>
                        </div>
                      )}

                    {/* Confirmed Pickup Pass Receipt inside Copilot */}
                    {turn.confirmedOrder && (
                      <div className="max-w-[92%] rounded-xl border-2 border-emerald-500 bg-emerald-50/70 p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            Pickup Pass Generated
                          </span>
                          <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">
                            {turn.confirmedOrder.order_code}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700">
                          Ordered by <strong>{user?.name}</strong> — show this code at the pantry!
                        </p>
                        <ul className="text-xs bg-white rounded-lg p-2.5 border border-emerald-200 space-y-1">
                          {turn.confirmedOrder.items.map((it, idx) => (
                            <li key={idx} className="flex justify-between font-medium">
                              <span>{it.snack_name}</span>
                              <span className="font-bold">× {it.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Orders / Pending Pickups List inside Copilot */}
                    {turn.response?.action_type === 'orders_list' && userOrders.length > 0 && (
                      <div className="max-w-[92%] space-y-2">
                        {userOrders.map((ord) => (
                          <div
                            key={ord.id}
                            className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-900">
                                {ord.order_code} {isAdmin ? `• ${ord.user_name}` : ''}
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
                            <p className="text-[11px] text-slate-600">
                              {ord.items.map((i) => `${i.snack_name} ×${i.quantity}`).join(', ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {asking && (
                <div className="max-w-[70%] rounded-2xl bg-slate-100 px-3.5 py-2 text-xs text-slate-500">
                  Checking pantry...
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Admin Actionable Restock Queue */}
          {isAdmin && latestRecs.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Quick Restock Queue ({latestRecs.length})
              </h3>
              {latestRecs.slice(0, 3).map((rec) => (
                <div
                  key={rec.snack_id}
                  className="rounded-xl border border-slate-200 p-3 bg-white flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900">{rec.snack_name}</p>
                    <p className="text-[11px] text-slate-500">
                      {rec.current_quantity} left • {rec.vote_count} votes
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={restockingId === rec.snack_id}
                    onClick={() => handleApproveRestock(rec)}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 text-xs transition cursor-pointer"
                  >
                    {restockingId === rec.snack_id ? '...' : `Order +${rec.suggested_restock_qty}`}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Chat Input + Starter Chips */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={asking}
                onClick={() => submitQuestion(q)}
                className="text-[11px] bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-slate-700 rounded-full px-2.5 py-1 transition cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={handleAskForm} className="flex gap-2">
            <input
              type="text"
              placeholder={
                isAdmin
                  ? "Ask stock, 'Show pending pickups', or 'Restock Aloo bonda by 10'..."
                  : "Try 'Order 1 Aloo bonda', 'Vote for Cold Coffee', or ask what's available..."
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
