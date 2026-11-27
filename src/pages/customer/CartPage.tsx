import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useOrder } from '../../context/OrderContext';
import { useTable } from '../../context/TableContext';
import { ChevronLeft, Plus, Minus, Trash2, Phone, Lock, ArrowRight, Loader2, AlertCircle, X } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { getMenuItemName } from '../../data/menu';
import { formatPhone, recordCustomerOrder } from '../../services/customerService';

export default function CartPage() {
  const { items, updateQuantity, removeItem, total, clearCart } = useCart();
  const { placeOrder } = useOrder();
  const { activeTableId, activeTableName } = useTable();
  const navigate = useNavigate();
  const { lang, t } = useOutletContext<{ lang: string; t: Record<string, string>; isRTL?: boolean }>();

  // Guard scrollTo(0,0) to 'only on first load' so opening /cart lands at top, not bottom,
  // without triggering re-scrolls when adjusting item quantities or typing.
  const hasScrolledOnMountRef = React.useRef(false);
  useEffect(() => {
    if (!hasScrolledOnMountRef.current) {
      hasScrolledOnMountRef.current = true;
      window.scrollTo(0, 0);
    }
  }, []);

  // Fixed phone number captured during initial customer entry
  const [savedPhone, setSavedPhone] = useState<string>(() => {
    try {
      return localStorage.getItem('dineview_phone') || '';
    } catch {
      return '';
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<{ code: string; message: string } | null>(null);

  // Stay in sync when the initial phone gate saves the number
  useEffect(() => {
    const syncPhone = () => {
      try {
        setSavedPhone(localStorage.getItem('dineview_phone') || '');
      } catch {}
    };
    window.addEventListener('dineview:phone_updated', syncPhone);
    window.addEventListener('storage', syncPhone);
    return () => {
      window.removeEventListener('dineview:phone_updated', syncPhone);
      window.removeEventListener('storage', syncPhone);
    };
  }, []);

  const getFullPhoneNumber = (): string => {
    const raw = savedPhone.trim();
    if (!raw) return '';
    return formatPhone(raw);
  };

  const handlePlaceOrder = async () => {
    if (items.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setOrderError(null);
    try {
      const fullPhone = getFullPhoneNumber();

      // If user provided a phone number, persist to localStorage for AI memory
      if (fullPhone) {
        try {
          localStorage.setItem('dineview_phone', fullPhone);
        } catch {}
      }

      // Place order in Firestore
      const orderId = await placeOrder(
        items,
        total,
        activeTableId,
        activeTableName,
        fullPhone || undefined
      );

      // Record customer profile in Firestore for AI assistant history if phone provided
      if (fullPhone) {
        try {
          await recordCustomerOrder(
            {
              id: orderId,
              items,
              total,
              status: 'pending',
              createdAt: new Date().toISOString(),
              tableId: activeTableId,
              tableName: activeTableName,
              customerPhone: fullPhone,
              phoneVerified: false,
            },
            fullPhone
          );
        } catch (err) {
          console.warn('Could not record customer profile:', err);
        }
      }

      // Track placed order ID in device history for multi-order customer session tracking
      try {
        const stored = JSON.parse(localStorage.getItem('dineview_my_orders') || '[]');
        if (Array.isArray(stored)) {
          if (!stored.includes(orderId)) stored.push(orderId);
          localStorage.setItem('dineview_my_orders', JSON.stringify(stored));
        } else {
          localStorage.setItem('dineview_my_orders', JSON.stringify([orderId]));
        }
      } catch {}

      clearCart();
      navigate(`/order/${orderId}`);
    } catch (err: any) {
      console.error('[CartPage] Failed to place order:', err);
      const code = err?.code || (err?.message?.includes(':') ? err.message.split(':')[0].trim() : 'ORDER_FAILED');
      const message = err?.message || 'Could not place order. Please try again.';
      setOrderError({ code, message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center">
        <h2 className="text-3xl font-serif text-text-primary mb-3">
          {t.cart_empty_title || 'Your cart is empty'}
        </h2>
        <p className="text-sm text-text-secondary mb-8 max-w-sm">
          {t.cart_empty_desc || 'Add dishes from our menu to start your table order.'}
        </p>
        <button 
          type="button"
          onClick={() => navigate('/')}
          className="bg-text-primary text-bg-primary px-6 py-3 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors"
        >
          {t.cart_view_menu || 'Explore Menu'}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 md:py-14">
      <div className="flex items-center justify-between gap-4 pb-6 mb-10 border-b border-border">
        <button 
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors text-xs font-medium whitespace-nowrap shrink-0"
        >
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          <span>{t.cart_continue_browsing || 'Continue Browsing'}</span>
        </button>
        <h1 className="text-2xl sm:text-3xl font-serif font-medium text-text-primary">
          {t.cart_title || 'Your Order'}
        </h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-10 lg:gap-14 items-start">
        {/* Cart Items List */}
        <div className="flex-1 w-full divide-y divide-border">
          {items.map((item) => {
            const itemName = getMenuItemName(item, lang);
            return (
              <div key={item.cartItemId} className="flex gap-4 sm:gap-5 items-center py-5 first:pt-0">
                <div className="w-20 h-20 bg-bg-secondary border border-border rounded-sm overflow-hidden shrink-0">
                  <img
                    src={item.image}
                    alt={itemName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-base sm:text-lg text-text-primary mb-1 truncate">{itemName}</h3>
                  <span className="font-mono tabular-nums text-sm text-text-secondary">{formatCurrency(item.price)}</span>
                </div>
                
                <div className="flex items-center border border-border rounded-sm bg-white h-9 shrink-0">
                  <button 
                    type="button"
                    onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                    className="h-full px-2.5 text-text-secondary hover:text-text-primary transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center text-xs font-mono tabular-nums font-medium text-text-primary">
                    {item.quantity}
                  </span>
                  <button 
                    type="button"
                    onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                    disabled={item.quantity >= (item.maxPerOrder ?? 20)}
                    className={`h-full px-2.5 transition-colors ${
                      item.quantity >= (item.maxPerOrder ?? 20)
                        ? 'text-text-muted cursor-not-allowed opacity-40'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button 
                  type="button"
                  onClick={() => removeItem(item.cartItemId)}
                  className="p-2 text-text-muted hover:text-red-600 transition-colors shrink-0 rounded-sm"
                  aria-label={`Remove ${itemName}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Checkout Summary & Place Order */}
        <div className="w-full lg:w-96 shrink-0">
          <div className="bg-white border border-border rounded-sm p-6 sm:p-7 sticky top-24">
            <h3 className="font-serif text-xl font-medium text-text-primary mb-5">
              {t.cart_order_summary || 'Order Summary'}
            </h3>

            {/* Seating / Table */}
            <div className="flex justify-between items-center mb-3 text-sm text-text-secondary pb-3 border-b border-border">
              <span>{t.cart_table || 'Seating'}</span>
              <span className="font-mono text-xs font-medium text-text-primary">
                {activeTableId && activeTableId !== 'COUNTER' ? `Table ${activeTableId}` : 'Counter'}
              </span>
            </div>
            
            <div className="flex justify-between items-center mb-2 text-sm text-text-secondary">
              <span>{t.cart_subtotal || 'Subtotal'}</span>
              <span className="font-mono tabular-nums text-text-primary">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between items-center mb-4 text-sm text-text-secondary">
              <span>{t.cart_taxes || 'Taxes & Service'}</span>
              <span>{t.cart_taxes_notice || 'Inclusive'}</span>
            </div>
            
            <div className="border-t border-border pt-4 mb-6 flex justify-between items-baseline">
              <span className="text-sm font-medium text-text-primary">{t.cart_total || 'Total'}</span>
              <span className="text-xl font-mono tabular-nums font-medium text-text-primary">{formatCurrency(total)}</span>
            </div>

            {/* Fixed Mobile Phone Display */}
            {savedPhone && (
              <div className="border-t border-border pt-4 mb-6">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                    <Phone className="w-3.5 h-3.5 text-accent" />
                    <span>Mobile Phone</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                    <Lock className="w-3 h-3" />
                    <span>Fixed</span>
                  </span>
                </div>
                <div className="w-full border border-border bg-bg-secondary px-3 py-2 rounded-sm text-sm font-mono tabular-nums text-text-primary select-none">
                  {savedPhone}
                </div>
              </div>
            )}

            {/* Error Surface */}
            {orderError && (
              <div className="mb-4 p-3.5 rounded-sm bg-red-50 border border-red-200 text-red-900 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-xs text-red-900">Order Error</span>
                        <span className="font-mono text-[11px] text-red-700">
                          {orderError.code}
                        </span>
                      </div>
                      <p className="text-xs text-red-800 mt-1 leading-snug">{orderError.message}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderError(null)}
                    className="text-red-600 hover:text-red-800 shrink-0 p-0.5"
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Direct Place Order Button */}
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={isSubmitting || items.length === 0}
              className="w-full bg-text-primary text-bg-primary py-3.5 px-6 rounded-sm text-xs font-medium tracking-wide hover:bg-text-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Placing Order...</span>
                </>
              ) : (
                <>
                  <span>Place Order</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-xs text-text-muted mt-4">
              {activeTableId && activeTableId !== 'COUNTER' ? 'Direct table service' : 'Pay at the counter'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
