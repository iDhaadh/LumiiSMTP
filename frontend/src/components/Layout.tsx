import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Mail, Globe, Key, Webhook, Settings, LogOut, Send,
  ShieldOff, ShieldAlert,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import clsx from 'clsx';

const baseNav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, adminOnly: false },
  { to: '/logs', label: 'Email Logs', icon: Mail, adminOnly: false },
  { to: '/domains', label: 'Domains', icon: Globe, adminOnly: false },
  { to: '/apikeys', label: 'API Keys', icon: Key, adminOnly: false },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook, adminOnly: false },
  { to: '/suppressions', label: 'Suppressions', icon: ShieldOff, adminOnly: false },
  { to: '/admin', label: 'Admin', icon: ShieldAlert, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const nav = baseNav.filter((item) => !item.adminOnly || user?.isAdmin);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-700">
          <Send className="text-blue-400" size={20} />
          <span className="text-white font-semibold text-sm">SMTP Relay</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon, end, adminOnly: _a }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-1 truncate">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
