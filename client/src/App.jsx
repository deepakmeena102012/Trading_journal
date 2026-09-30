import { lazy, Suspense, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { ErrorBanner, Spinner } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Trades = lazy(() => import('./pages/Trades'));
const TradeForm = lazy(() => import('./pages/TradeForm'));
const TradeDetail = lazy(() => import('./pages/TradeDetail'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Strategies = lazy(() => import('./pages/Strategies'));
const StrategyForm = lazy(() => import('./pages/StrategyForm'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children }) {
  const { user, loading, bootError, restoreSession, logout } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner className="min-h-screen" label="Connecting to server…" />;
  if (bootError && !user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4">
        <ErrorBanner message={bootError} onRetry={restoreSession} />
        <p className="text-sm text-muted">
          If the server was idle it can take up to a minute to wake up.{' '}
          <button type="button" className="text-accent hover:underline" onClick={logout}>Log in again</button>
        </p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/**
 * Keeps already-signed-in users away from login/register. A user who signs in *on* these
 * pages is redirected by the page itself (register → settings, login → original page).
 */
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  const signedInOnArrival = useRef(null);
  if (loading) return <Spinner className="min-h-screen" />;
  if (signedInOnArrival.current === null) signedInOnArrival.current = Boolean(user);
  if (user && signedInOnArrival.current) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-screen" />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="trades" element={<Trades />} />
          <Route path="trades/new" element={<TradeForm />} />
          <Route path="trades/:id" element={<TradeDetail />} />
          <Route path="trades/:id/edit" element={<TradeForm />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="strategies" element={<Strategies />} />
          <Route path="strategies/new" element={<StrategyForm />} />
          <Route path="strategies/:id/edit" element={<StrategyForm />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
