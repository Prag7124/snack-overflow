import { LoginView } from './components/LoginView';
import { PantryBoard } from './components/PantryBoard';
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

  const isAdmin = user.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍿</span>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">Snack Overflow</h1>
              <p className="text-xs text-slate-500">Signed in as {user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
        <PantryBoard isAdmin={isAdmin} />
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
