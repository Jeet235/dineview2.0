import React from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, LayoutDashboard, UtensilsCrossed, ClipboardList, QrCode, Users } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { path: '/admin/sessions', label: 'Sessions', icon: Users },
  { path: '/admin/tables', label: 'Tables & QRs', icon: QrCode },
  { path: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
];

export default function AdminLayout() {
  const { isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoginPage = location.pathname === '/admin/login';

  if (!isAdmin && !isLoginPage) {
    return <Navigate to="/admin/login" replace />;
  }

  if (isLoginPage) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Flat Fixed Sidebar */}
      <aside className="w-60 bg-white border-r border-border flex flex-col fixed inset-y-0 z-10">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-serif tracking-tight font-semibold text-text-primary">
              DineView
            </span>
            <span className="text-xs text-text-muted">Admin</span>
          </div>
        </div>

        <nav className="flex-1 py-5 px-3 flex flex-col gap-1" aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-sm text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-text-primary text-bg-primary'
                    : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-sm text-sm font-medium text-text-muted hover:bg-bg-secondary hover:text-red-600 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60 p-6 lg:p-8 max-w-[1440px]">
        <Outlet />
      </main>
    </div>
  );
}
