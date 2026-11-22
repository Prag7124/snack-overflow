import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiClientError } from '../api';
import { useAuth } from '../context/AuthContext';
import type { CopilotResponse, RestockRecommendation } from '../types';

interface CopilotPanelProps {
  open: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onRestockApplied: () => void;
}

const ADMIN_PROMPTS = [
  'What needs urgent restocking first?',
  'Which snacks have the highest team votes?',
  'Summarize current pantry stock levels',
];

const MEMBER_PROMPTS = [
  'Which healthy-ish snacks are in stock?',
  'What sweet or savoury snacks are available?',
  'What are the most popular snacks?',
];

export function CopilotPanel({
  open,
  isAdmin,
  onClose,
  onRestockApplied,
}: CopilotPanelProps) {
  const { token } = useAuth();
  const [data, setData] = useState<CopilotResponse | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
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
        if (active) setData(res);
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
    if (!token || !q.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const res = await api.askCopilot(token, q.trim());
      setData(res);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not ask Copilot');
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

  async function handleApproveRestock(rec: RestockRecommendation) {
    if (!token || restockingId) return;
    setRestockingId(rec.snack_id);
    try {
      await api.restockSnack(token, rec.snack_id, rec.suggested_restock_qty);
      onRestockApplied();
      const refreshed = await api.getRestockPlan(token);
      setData(refreshed);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Restock failed');
    } finally {
      setRestockingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                {isAdmin ? 'Admin Procurement Copilot' : 'Member Snack Concierge'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAdmin
                  ? 'Velocity & upvote-driven restock intelligence'
                  : 'Live pantry picks & restock request assistant'}
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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <form onSubmit={handleAskForm} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  isAdmin
                    ? 'Ask about restock priorities, votes, or stock levels...'
                    : 'Ask about available snacks, healthy picks, or favorites...'
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 cursor-pointer"
              >
                {asking ? '...' : 'Ask'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={asking}
                  onClick={() => submitQuestion(q)}
                  className="text-[11px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 rounded-full px-2.5 py-1 transition cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </form>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-sm text-slate-500">
              Analyzing live pantry data...
            </div>
          ) : (
            data && (
              <>
                <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      {isAdmin ? 'Restock Briefing' : 'Pantry Guide'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800">
                      {data.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Smart Pantry Engine'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed">{data.answer}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {isAdmin
                      ? `Actionable Restock Queue (${data.recommendations.length})`
                      : `Low / Out-of-Stock Items (${data.recommendations.length})`}
                  </h3>

                  {data.recommendations.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 p-5 text-center text-xs text-slate-500">
                      All snacks are comfortably stocked above thresholds!
                    </div>
                  ) : (
                    data.recommendations.map((rec) => (
                      <div
                        key={rec.snack_id}
                        className="rounded-xl border border-slate-200 p-4 bg-white shadow-2xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-sm text-slate-900">{rec.snack_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{rec.reason}</p>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              rec.priority === 'high'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {rec.priority}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <span className="text-slate-600">
                            In stock: <strong>{rec.current_quantity}</strong> &bull; Votes:{' '}
                            <strong>{rec.vote_count}</strong>
                          </span>

                          {isAdmin ? (
                            <button
                              type="button"
                              disabled={restockingId === rec.snack_id}
                              onClick={() => handleApproveRestock(rec)}
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 text-xs transition cursor-pointer"
                            >
                              {restockingId === rec.snack_id
                                ? 'Restocking...'
                                : `Order +${rec.suggested_restock_qty}`}
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-800">
                              Upvote on board to request
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
