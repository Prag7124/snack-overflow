import { LoginView } from './components/LoginView';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppShell() {
  const { user, loading, logout } = useAuth();

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍿</span>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">Snack Overflow</h1>
            <p className="text-xs text-slate-500">Authenticated as {user.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
            {user.role}
          </span>
          <button
            onClick={logout}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <div className="rounded-xl bg-white border border-slate-200 p-6 text-sm text-slate-600">
          M06 Auth & API Client active! Ready for M07 Pantry Board + Real-Time SSE.
        </div>
      </main>
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
