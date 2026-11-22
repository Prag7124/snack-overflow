import { useState } from 'react';
import { api, ApiClientError } from './api';
import { ActivityDrawer } from './components/ActivityDrawer';
import { CopilotPanel } from './components/CopilotPanel';
import { LoginView } from './components/LoginView';
import { PantryBoard } from './components/PantryBoard';
import { SnackFormModal } from './components/SnackFormModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Snack } from './types';

function AppShell() {
  const { user, token, loading, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSnack, setEditingSnack] = useState<Snack | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Loading pantry session...
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const isAdmin = user.role === 'admin';

  function openAddModal() {
    setEditingSnack(null);
    setModalOpen(true);
  }

  function openEditModal(snack: Snack) {
    setEditingSnack(snack);
    setModalOpen(true);
  }

  async function handleDeleteSnack(snack: Snack) {
    if (!token) return;
    if (!window.confirm(`Delete "${snack.name}" from the pantry?`)) return;
    try {
      await api.deleteSnack(token, snack.id);
      setRefreshTrigger((n) => n + 1);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Delete failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍿</span>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">Snack Overflow</h1>
              <p className="text-xs text-slate-500">Signed in as {user.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCopilotOpen(true)}
              className="rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold px-3.5 py-2 transition cursor-pointer"
            >
              ✨ Pantry Copilot
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setActivityOpen(true)}
                  className="rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold px-3.5 py-2 transition cursor-pointer"
                >
                  📊 Activity Log
                </button>

                <button
                  type="button"
                  onClick={openAddModal}
                  className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 transition cursor-pointer"
                >
                  + Add Snack
                </button>
              </>
            )}

            <span
              className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-full ${
                isAdmin ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {user.role}
            </span>

            <button
              onClick={logout}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <PantryBoard
          isAdmin={isAdmin}
          onEditSnack={isAdmin ? openEditModal : undefined}
          onDeleteSnack={isAdmin ? handleDeleteSnack : undefined}
          refreshTrigger={refreshTrigger}
        />
      </main>

      <SnackFormModal
        open={modalOpen}
        editingSnack={editingSnack}
        onClose={() => setModalOpen(false)}
        onSaved={() => setRefreshTrigger((n) => n + 1)}
      />

      <CopilotPanel
        open={copilotOpen}
        isAdmin={isAdmin}
        onClose={() => setCopilotOpen(false)}
        onRestockApplied={() => setRefreshTrigger((n) => n + 1)}
      />

      {isAdmin && (
        <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
