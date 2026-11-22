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

const QUICK_QUESTIONS = [
  'What snacks are running low or out?',
  'Which healthy-ish snacks are in stock?',
  'What should we restock first?',
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
    await submitQuestion(question);
    setQuestion('');
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
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Pantry Copilot</h2>
              <p className="text-xs text-slate-500">
                Demand &amp; restock intelligence powered by live pantry data
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Ask Input */}
          <form onSubmit={handleAskForm} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask about stock, healthy options, restocks..."
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
              {QUICK_QUESTIONS.map((q) => (
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
              Analyzing pantry stock, votes &amp; 7-day velocity...
            </div>
          ) : (
            data && (
              <>
                {/* Briefing Card */}
                <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Copilot Briefing
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800">
                      {data.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Smart Engine'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed">{data.answer}</p>
                </div>

                {/* Priority Restock Recommendations */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Recommended Restock Queue ({data.recommendations.length})
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
                            <span className="font-semibold text-amber-800">
                              Suggested +{rec.suggested_restock_qty}
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
