import { NavLink, Outlet, Link } from 'react-router-dom';
import { BarChart3, BookOpen, LayoutDashboard, ListChecks, LogOut, PlusCircle, Settings, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/trades', label: 'Trades', icon: BookOpen },
  { to: '/trades/new', label: 'Add Trade', icon: PlusCircle, primary: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/strategies', label: 'Strategies', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <Link to="/" className="flex items-center gap-2 px-5 py-5 font-semibold">
          <TrendingUp size={20} className="text-accent" aria-hidden />
          TradeJournal
        </Link>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end || item.to === '/trades'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-raised text-ink' : 'text-soft hover:bg-raised/60 hover:text-ink'
                }`
              }
            >
              <item.icon size={17} aria-hidden className={item.primary ? 'text-accent' : ''} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.accountName}</p>
          </div>
          <button type="button" onClick={logout} className="btn-ghost w-full justify-start">
            <LogOut size={16} aria-hidden /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <TrendingUp size={18} className="text-accent" aria-hidden />
          TradeJournal
        </Link>
        <div className="flex items-center gap-1">
          <NavLink to="/strategies" className="btn-ghost p-2" aria-label="Strategies">
            <ListChecks size={18} />
          </NavLink>
          <NavLink to="/settings" className="btn-ghost p-2" aria-label="Settings">
            <Settings size={18} />
          </NavLink>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Main"
      >
        {NAV.filter((n) => ['/', '/trades', '/trades/new', '/analytics'].includes(n.to)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end || item.to === '/trades'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-muted'}`
            }
          >
            <item.icon size={20} aria-hidden className={item.primary ? 'text-accent' : ''} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
