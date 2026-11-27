import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTable } from '../../context/TableContext';
import { LanguageSelector } from '../../components/LanguageSelector';
import { Footer } from '../../components/Footer';
import { FoodAssistantModal } from '../../components/FoodAssistantModal';
import { CartButton } from '../../components/CartButton';
import { PhoneGateModal } from '../../components/PhoneGateModal';
import { clearMenuScrollPosition } from '../../utils/scrollRestoration';
import { subscribeActiveSessionForTable, TableSession } from '../../services/sessionService';

export default function CustomerLayout() {
  const { lang, t, isRTL, tKey } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount } = useCart();
  const { activeTableId, activeTableName } = useTable();

  // Mandatory phone entry gate state
  const [hasPhone, setHasPhone] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('dineview_phone'));
    } catch {
      return false;
    }
  });

  // Listen to phone updates across tabs and within app
  useEffect(() => {
    const handlePhoneUpdated = () => {
      try {
        if (localStorage.getItem('dineview_phone')) {
          setHasPhone(true);
        }
      } catch {}
    };
    window.addEventListener('dineview:phone_updated', handlePhoneUpdated);
    window.addEventListener('storage', handlePhoneUpdated);
    return () => {
      window.removeEventListener('dineview:phone_updated', handlePhoneUpdated);
      window.removeEventListener('storage', handlePhoneUpdated);
    };
  }, []);

  const [activeTableSession, setActiveTableSession] = useState<TableSession | null>(null);

  const pathname = location.pathname;

  // Explicitly bypass gate for /admin/* and /manager/* paths
  const isAdminOrManagerPath = pathname.startsWith('/admin') || pathname.startsWith('/manager');

  // Subscribe to the active shared session for the current table (so any phone at the table can access shared orders & combined bill)
  useEffect(() => {
    if (isAdminOrManagerPath || !activeTableId || activeTableId === 'COUNTER') {
      setActiveTableSession(null);
      return;
    }

    const unsubscribe = subscribeActiveSessionForTable(activeTableId, (sess) => {
      setActiveTableSession(sess);
    });

    return () => unsubscribe();
  }, [activeTableId, isAdminOrManagerPath]);

  // Customer routes guarded: / , /menu , /item/:id , /cart , /order/:id , /table-orders
  const isCustomerProtectedPath = 
    !isAdminOrManagerPath && (
      pathname === '/' || 
      pathname === '/menu' || 
      pathname.startsWith('/item/') || 
      pathname === '/cart' || 
      pathname.startsWith('/order/') ||
      pathname === '/table-orders'
    );

  // Auto-skip gate if phone already saved in localStorage
  const shouldShowGate = !hasPhone && isCustomerProtectedPath;

  const handleNavClick = (sectionId: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    clearMenuScrollPosition();
    if (sectionId === 'top') {
      if (window.location.pathname !== '/') {
        navigate('/');
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    if (window.location.pathname === `/${sectionId}` || (window.location.pathname === '/' && sectionId === 'menu')) {
      scrollToSection(sectionId);
    } else {
      navigate(`/${sectionId}`);
    }
  };

  const scrollToSection = (sectionId: string) => {
    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -68;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const sessionOrderCount = Array.isArray(activeTableSession?.orderIds)
    ? activeTableSession.orderIds.length
    : 0;

  return (
    <div className={`min-h-screen bg-bg-primary font-sans text-text-primary flex flex-col ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Top Bar: 3-zone contract, single-line controls */}
      <header className="h-16 border-b border-border shrink-0 bg-bg-primary/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-8 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={(e) => handleNavClick('top', e)}
            className="text-xl sm:text-2xl font-serif tracking-tight font-semibold text-text-primary whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
          >
            DineView
          </button>

          {/* Zone 2: Clean single-line text navigation */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-text-secondary">
            <a
              href="#menu"
              onClick={(e) => handleNavClick('menu', e)}
              className="hover:text-text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav_menu}
            </a>
            <a
              href="#locations"
              onClick={(e) => handleNavClick('locations', e)}
              className="hover:text-text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav_locations}
            </a>
            {activeTableSession && activeTableId && activeTableId !== 'COUNTER' && (
              <button
                type="button"
                onClick={() => navigate('/table-orders')}
                className="hover:text-text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 text-accent font-medium cursor-pointer tabular-nums"
                title={`View shared orders and combined bill for Table ${activeTableId}`}
              >
                Table Bill{sessionOrderCount > 0 ? ` (${sessionOrderCount})` : ''}
              </button>
            )}
          </nav>

          {/* Zone 3: Table context + Language + Cart */}
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            <span
              className="hidden sm:inline text-xs font-medium text-text-secondary whitespace-nowrap shrink-0 tabular-nums"
              title={activeTableId && activeTableId !== 'COUNTER' ? `Assigned to Table ${activeTableId}` : 'Ordering at Counter'}
            >
              {activeTableId && activeTableId !== 'COUNTER' ? `Table ${activeTableId}` : 'Counter'}
            </span>

            {activeTableSession && activeTableId && activeTableId !== 'COUNTER' && (
              <button
                type="button"
                onClick={() => navigate('/table-orders')}
                className="md:hidden text-xs font-medium text-accent hover:underline underline-offset-4 whitespace-nowrap shrink-0 tabular-nums"
                title={`View shared orders and combined bill for Table ${activeTableId}`}
              >
                Bill{sessionOrderCount > 0 ? ` (${sessionOrderCount})` : ''}
              </button>
            )}

            <LanguageSelector />
            <CartButton variant="header" t={t} />
          </div>
        </div>
      </header>

      {/* Main Content Area - Guard MenuPage behind phone gate */}
      <div className="flex-1">
        {shouldShowGate ? (
          <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center">
            <h2 className="font-serif text-2xl md:text-3xl text-text-primary mb-3">Welcome to DineView</h2>
            <p className="max-w-md text-sm text-text-secondary leading-relaxed">
              Enter your mobile number to view our seasonal menu and place orders from your table.
            </p>
          </div>
        ) : (
          <Outlet context={{ lang, t, isRTL, tKey }} />
        )}
      </div>

      {/* Footer */}
      <Footer t={t} isRTL={isRTL} onNavigate={handleNavClick} />

      {/* AI Food Recommendation Assistant — displayed only on the initial customer menu page */}
      {(pathname === '/' || pathname === '/menu') && <FoodAssistantModal />}

      {/* Mandatory Phone Gate Modal - Only for guarded customer routes; preserves URL and ?table */}
      {shouldShowGate && (
        <PhoneGateModal
          isOpen={shouldShowGate}
          tableId={activeTableId}
          tableName={activeTableName}
          onSuccess={() => {
            setHasPhone(true);
            // Preserves current route and URL search params (?table=...)
          }}
        />
      )}
    </div>
  );
}
