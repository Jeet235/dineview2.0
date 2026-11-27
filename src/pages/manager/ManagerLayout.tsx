import React, { useEffect, useState } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ChefHat, QrCode, LogOut, UtensilsCrossed, Bell } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { getStaffSession, staffLogout } from '../../services/staffAuthService';

export default function ManagerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orders } = useOrder();
  const [authStatus, setAuthStatus] = useState<'checking' | 'authorized' | 'unauthorized'>(() => {
    try {
      return sessionStorage.getItem('dineview_manager_auth') === 'true' ? 'authorized' : 'checking';
    } catch {
      return 'checking';
    }
  });

  useEffect(() => {
    let active = true;
    getStaffSession()
      .then((session) => {
        if (!active) return;
        if (session.authenticated && (session.role === 'manager' || session.role === 'admin')) {
          try {
            sessionStorage.setItem('dineview_manager_auth', 'true');
            if (session.name) {
              sessionStorage.setItem('dineview_manager_name', session.name);
            }
          } catch {}
          setAuthStatus('authorized');
        } else {
          try {
            sessionStorage.removeItem('dineview_manager_auth');
          } catch {}
          setAuthStatus('unauthorized');
        }
      })
      .catch(() => {
        if (!active) return;
        setAuthStatus('unauthorized');
      });
    return () => {
      active = false;
    };
  }, []);

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authStatus === 'unauthorized') {
    return <Navigate to="/manager/login" state={{ from: location }} replace />;
  }

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('dineview_manager_auth');
    } catch {}
    await staffLogout().catch(() => {});
    navigate('/manager/login');
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <div className="flex items-baseline gap-2.5 shrink-0">
              <span className="font-serif font-semibold text-text-primary text-lg tracking-tight whitespace-nowrap">
                DineView
              </span>
              <span className="text-xs text-text-muted whitespace-nowrap">
                Kitchen Manager
              </span>
            </div>

            <nav className="hidden sm:flex items-center gap-1">
              <button
                onClick={() => navigate('/manager/orders')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  location.pathname.includes('/manager/orders') || location.pathname === '/manager'
                    ? 'bg-text-primary text-bg-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                }`}
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>Orders</span>
                {pendingCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] opacity-85">
                    ({pendingCount})
                  </span>
                )}
              </button>

              <button
                onClick={() => navigate('/admin/tables')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap shrink-0 text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Table QRs</span>
              </button>

              <button
                onClick={() => navigate('/admin/menu')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap shrink-0 text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Menu Manager</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {pendingCount > 0 && (
              <div className="hidden md:flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap">
                <Bell className="w-3.5 h-3.5 text-amber-700" />
                <span className="font-mono tabular-nums">{pendingCount}</span>
                <span>pending confirmation</span>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm text-xs font-medium whitespace-nowrap text-text-secondary hover:text-red-700 hover:border-red-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
