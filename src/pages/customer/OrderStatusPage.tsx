import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Order, OrderStatus } from '../../context/OrderContext';
import { useTable } from '../../context/TableContext';
import {
  CheckCircle2,
  Clock,
  ChefHat,
  PackageCheck,
  ChevronLeft,
  Users,
  Receipt,
  Printer,
  XCircle,
  User,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatCurrency } from '../../utils/currency';
import { getMenuItemName } from '../../data/menu';
import {
  TableSession,
  subscribeActiveSessionForTable,
  subscribeSessionOrders,
} from '../../services/sessionService';
import {
  buildConsolidatedSessionBill,
  buildCustomerIndividualBill,
  isPayableOrder,
  isSameCustomerPhone,
  ReceiptData,
} from '../../services/billingService';
import { ReceiptModal } from '../../components/ReceiptModal';
import { hashPhone, isMaskedPhone, maskPhone } from '../../services/customerService';

const STATUS_TEXT_STYLES: Record<OrderStatus, string> = {
  pending: 'text-amber-700',
  preparing: 'text-blue-700',
  ready: 'text-emerald-700',
  completed: 'text-text-muted',
  cancelled: 'text-red-700',
};

export default function OrderStatusPage() {
  const { id } = useParams<{ id?: string }>();
  const { activeTableId, activeTableName } = useTable();
  const [order, setOrder] = useState<Order | null>(null);
  const [lockedSessionId, setLockedSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { lang, t } = useOutletContext<{ lang: string; t: Record<string, string>; isRTL?: boolean }>();

  // Local device identifiers used only for visual labeling ("Your Order" vs "Table Guest")
  const myOrderIds = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('dineview_my_orders') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [id, sessionOrders.length]);

  const myPhone = useMemo<string>(() => {
    try {
      return localStorage.getItem('dineview_phone') || '';
    } catch {
      return '';
    }
  }, []);

  const myPhoneHash = useMemo<string>(() => {
    return myPhone ? hashPhone(myPhone) : '';
  }, [myPhone]);

  // 1. When viewing /order/:id, subscribe to that specific order in real time
  useEffect(() => {
    if (!id) {
      setOrder(null);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'orders', id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setOrder(docSnapshot.data() as Order);
        } else {
          setOrder(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe to order updates:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  // 2. When viewing /table-orders (no order :id), discover and lock onto the table's active session
  useEffect(() => {
    if (id) {
      setLockedSessionId(null);
      return;
    }

    setLockedSessionId(null);
    setSession(null);
    setSessionOrders([]);

    if (!activeTableId || activeTableId === 'COUNTER') {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeActiveSessionForTable(activeTableId, (activeSess) => {
      if (activeSess?.id) {
        setLockedSessionId(activeSess.id);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, activeTableId]);

  const resolvedSessionId = order?.tableSessionId || lockedSessionId || null;
  const resolvedTableId = order?.tableId || session?.tableId || activeTableId || 'COUNTER';
  const resolvedTableName =
    session?.tableName ||
    order?.tableName ||
    (resolvedTableId === activeTableId ? activeTableName : '') ||
    (resolvedTableId !== 'COUNTER' ? `Table ${resolvedTableId}` : 'Counter');
  const isTableSession = Boolean(resolvedSessionId && resolvedTableId !== 'COUNTER');

  // 3. Subscribe to parent table session document (active or closed) in real time
  useEffect(() => {
    if (!resolvedSessionId) {
      setSession(null);
      return;
    }

    const unsubscribeSession = onSnapshot(
      doc(db, 'orders', resolvedSessionId),
      (sessDoc) => {
        if (sessDoc.exists()) {
          setSession(sessDoc.data() as TableSession);
        } else {
          setSession(null);
        }
      },
      (err) => {
        console.warn('Could not subscribe to session:', err);
      }
    );

    return () => unsubscribeSession();
  }, [resolvedSessionId]);

  // 4. Subscribe in real time to ALL orders belonging to this table session (all phones at this table)
  useEffect(() => {
    if (!resolvedSessionId) {
      setSessionOrders([]);
      return;
    }

    const unsubscribeOrders = subscribeSessionOrders(
      resolvedSessionId,
      (fetchedOrders) => {
        setSessionOrders(fetchedOrders);
      },
      resolvedTableId
    );

    return () => unsubscribeOrders();
  }, [resolvedSessionId, resolvedTableId]);

  // Combine live session orders (ensuring the viewed order is present immediately before snapshot resolves)
  const displayedOrders = useMemo<Order[]>(() => {
    if (!isTableSession) {
      return order ? [order] : [];
    }
    if (order && !sessionOrders.some((o) => o.id === order.id)) {
      return [...sessionOrders, order].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    return sessionOrders;
  }, [isTableSession, order, sessionOrders]);

  const isOwnOrder = (ord: Order): boolean => {
    if (myOrderIds.includes(ord.id)) return true;
    if (myPhoneHash && ord.customerPhoneHash && ord.customerPhoneHash === myPhoneHash) {
      return true;
    }
    if (
      myPhone &&
      ord.customerPhone &&
      !isMaskedPhone(ord.customerPhone) &&
      isSameCustomerPhone(ord.customerPhone, myPhone)
    ) {
      return true;
    }
    return false;
  };

  // Strictly confirmed/payable orders contribute to the combined table bill.
  // Pending, cancelled, and deleted orders are excluded from payable totals.
  const confirmedOrders = useMemo(
    () => displayedOrders.filter((o) => isPayableOrder(o)),
    [displayedOrders]
  );

  const pendingOrders = useMemo(
    () => displayedOrders.filter((o) => o.status === 'pending'),
    [displayedOrders]
  );

  const cancelledOrders = useMemo(
    () => displayedOrders.filter((o) => o.status === 'cancelled'),
    [displayedOrders]
  );

  const combinedSubtotal = useMemo(
    () => confirmedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
    [confirmedOrders]
  );

  const combinedGrandTotal = combinedSubtotal;

  const combinedTotalDishes = useMemo(
    () =>
      confirmedOrders.reduce(
        (sum, o) => sum + (o.items || []).reduce((a, b) => a + (b.quantity || 1), 0),
        0
      ),
    [confirmedOrders]
  );

  const myOrdersCount = useMemo(
    () => displayedOrders.filter((o) => isOwnOrder(o)).length,
    [displayedOrders, myOrderIds, myPhone, myPhoneHash]
  );

  const otherGuestsOrdersCount = displayedOrders.length - myOrdersCount;

  const isSessionClosed = session?.status === 'closed';

  // Build live ReceiptData whenever the modal is open so any new order, edit, or session close updates it automatically
  const activeReceipt = useMemo<ReceiptData | null>(() => {
    if (!isReceiptOpen) return null;

    if (isTableSession && resolvedSessionId) {
      const effectiveSession: TableSession = session || {
        id: resolvedSessionId,
        isSession: true,
        shortId: resolvedSessionId.slice(-4).toUpperCase(),
        tableId: resolvedTableId,
        tableName: resolvedTableName,
        status: 'active',
        startedAt: displayedOrders[0]?.createdAt || new Date().toISOString(),
        endedAt: null,
        durationMinutes: null,
        totalAmount: combinedGrandTotal,
        itemsCount: combinedTotalDishes,
        orderIds: displayedOrders.map((o) => o.id),
        createdByPhone: displayedOrders[0]?.customerPhone ? maskPhone(displayedOrders[0].customerPhone) : null,
        closedBy: null,
      };
      return buildConsolidatedSessionBill(effectiveSession, displayedOrders);
    }

    if (order) {
      const phone = maskPhone(order.customerPhone || myPhone || '');
      return buildCustomerIndividualBill(null, [order], phone);
    }

    return null;
  }, [
    isReceiptOpen,
    isTableSession,
    resolvedSessionId,
    session,
    resolvedTableId,
    resolvedTableName,
    displayedOrders,
    combinedGrandTotal,
    combinedTotalDishes,
    order,
    myPhone,
  ]);

  const handleOpenBill = () => {
    setIsReceiptOpen(true);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center py-24">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-serif text-text-primary">
          {t.order_loading || 'Loading order...'}
        </h2>
      </div>
    );
  }

  if (id && !order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center py-24">
        <h2 className="text-2xl font-serif text-text-primary mb-4">
          {t.order_not_found || 'Order not found'}
        </h2>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-text-primary text-bg-primary px-6 py-2.5 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors"
        >
          {t.order_return_to_menu || 'Return to Menu'}
        </button>
      </div>
    );
  }

  if (!id && !resolvedSessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center py-24">
        <Users className="w-7 h-7 text-text-muted mb-4" />
        <h2 className="text-2xl font-serif text-text-primary mb-2">
          {activeTableId && activeTableId !== 'COUNTER'
            ? `No Active Session for ${activeTableName || `Table ${activeTableId}`}`
            : 'No Active Table Session'}
        </h2>
        <p className="text-sm text-text-secondary max-w-md mb-6 leading-relaxed">
          {activeTableId && activeTableId !== 'COUNTER'
            ? 'Orders placed from any phone at this table will appear here together with a combined table bill.'
            : 'Scan a table QR code and place an order to view shared table orders and your combined bill.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-text-primary text-bg-primary px-6 py-2.5 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors"
        >
          {t.order_return_to_menu || 'Return to Menu'}
        </button>
      </div>
    );
  }

  const steps = [
    { id: 'pending', label: t.order_step_placed || 'Order Placed', icon: Clock },
    { id: 'preparing', label: t.order_step_preparing || 'Preparing', icon: ChefHat },
    { id: 'ready', label: t.order_step_ready || 'Ready to Serve', icon: PackageCheck },
    { id: 'completed', label: t.order_step_completed || 'Completed', icon: CheckCircle2 },
  ];

  const currentStepIndex = order ? steps.findIndex((s) => s.id === order.status) : -1;

  const sessionStartTime = session?.startedAt
    ? new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 md:py-14">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors mb-8 text-xs font-medium"
      >
        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
        <span>{t.back_to_menu || 'Back to Menu'}</span>
      </button>

      <div className="mb-10">
        {/* Unboxed Table & Session Metadata */}
        <p className="text-xs font-mono text-text-muted mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-text-primary font-medium">
            {resolvedTableId && resolvedTableId !== 'COUNTER'
              ? `Table ${resolvedTableId}`
              : 'Counter'}
          </span>
          {session?.shortId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-accent">Session #{session.shortId}</span>
            </>
          )}
          {sessionStartTime && (
            <>
              <span aria-hidden="true">·</span>
              <span>Started {sessionStartTime}</span>
            </>
          )}
          {session && (
            <>
              <span aria-hidden="true">·</span>
              <span className={isSessionClosed ? 'text-text-muted' : 'text-emerald-700'}>
                {isSessionClosed ? 'Closed' : 'Active'}
              </span>
            </>
          )}
        </p>

        <h1 className="text-3xl sm:text-4xl font-serif font-medium text-text-primary mb-3 tracking-tight">
          {order
            ? `${t.order_number || 'Order'} #${order.id}`
            : `${resolvedTableName} Orders`}
        </h1>

        <p className="text-text-secondary text-sm leading-relaxed max-w-xl">
          {isSessionClosed
            ? 'This table session is closed. No new items or orders can be added to this bill. Ordering from the menu will start a new table session.'
            : resolvedTableId && resolvedTableId !== 'COUNTER'
            ? 'Your dishes are being prepared by our culinary team and will be brought directly to your table.'
            : t.order_pay_counter_desc ||
              'Please proceed to the counter to pay and mention your order number.'}
        </p>

        {/* Combined Table Session Bill Card */}
        {isTableSession && isSessionClosed ? (
          <div className="mt-6 p-5 sm:p-6 rounded-sm border border-accent/50 bg-white text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-border">
              <div>
                <p className="text-xs font-medium text-accent mb-1">
                  Session Closed by Manager
                </p>
                <h3 className="font-serif text-xl font-medium text-text-primary">
                  Combined Table Bill is Ready
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenBill}
                  className="px-3.5 py-2 border border-border text-text-primary hover:border-text-primary rounded-sm text-xs font-medium transition-colors whitespace-nowrap"
                >
                  View Bill
                </button>
                <button
                  type="button"
                  onClick={handleOpenBill}
                  className="px-4 py-2 bg-text-primary hover:bg-text-primary/90 text-bg-primary rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Bill</span>
                </button>
              </div>
            </div>

            {/* Combined Table Financial Details */}
            <div className="space-y-2 text-xs mb-4">
              <div className="flex justify-between text-text-secondary">
                <span>Table & Session</span>
                <span className="font-mono text-text-primary">
                  {resolvedTableName} · #{session?.shortId}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Confirmed Payable Orders</span>
                <span className="font-mono tabular-nums text-text-primary">
                  {confirmedOrders.length} confirmed ticket{confirmedOrders.length !== 1 ? 's' : ''}
                  {pendingOrders.length > 0 ? ` (${pendingOrders.length} pending excluded)` : ''}
                  {cancelledOrders.length > 0 ? ` (${cancelledOrders.length} cancelled)` : ''}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Confirmed Dishes Ordered</span>
                <span className="font-mono tabular-nums text-text-primary">{combinedTotalDishes} items</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Combined Subtotal</span>
                <span className="font-mono tabular-nums text-text-primary">
                  {formatCurrency(combinedSubtotal)}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Taxes & Service</span>
                <span className="text-text-primary">Inclusive (5% GST)</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between items-baseline text-sm">
                <span className="font-medium text-text-primary">Combined Table Grand Total</span>
                <span className="font-mono tabular-nums font-medium text-text-primary text-lg">
                  {formatCurrency(combinedGrandTotal)}
                </span>
              </div>
            </div>

            <p className="text-xs text-text-muted border-t border-border pt-3">
              Includes all confirmed orders placed at {resolvedTableName} during this session. Please settle payment at the counter.
            </p>
          </div>
        ) : isTableSession ? (
          /* Active Table Session: Live Combined Bill shared across all phones at the table */
          <div className="mt-6 p-5 sm:p-6 rounded-sm border border-border bg-white text-left">
            <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Users className="w-4 h-4 text-accent shrink-0" />
                <span>
                  {resolvedTableName} Combined Bill
                  {session?.shortId ? ` · #${session.shortId}` : ''}
                </span>
              </div>
              <span className="text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
                Session Active
              </span>
            </div>

            <div className="space-y-2 text-xs mb-4">
              <div className="flex items-center justify-between text-text-secondary">
                <span>
                  Confirmed Orders ({confirmedOrders.length} confirmed
                  {pendingOrders.length > 0 ? `, ${pendingOrders.length} pending` : ''}
                  {cancelledOrders.length > 0 ? `, ${cancelledOrders.length} cancelled` : ''})
                </span>
                <span className="font-mono tabular-nums text-text-primary">
                  {combinedTotalDishes} dish{combinedTotalDishes !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Combined Subtotal</span>
                <span className="font-mono tabular-nums text-text-primary">
                  {formatCurrency(combinedSubtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-text-secondary">
                <span>Taxes & Service</span>
                <span className="text-text-primary">Inclusive (5% GST)</span>
              </div>
              <div className="flex items-baseline justify-between pt-3 border-t border-border">
                <span className="font-medium text-text-primary text-sm">Combined Grand Total</span>
                <span className="font-mono tabular-nums font-medium text-text-primary text-lg">
                  {formatCurrency(combinedGrandTotal)}
                </span>
              </div>
              {pendingOrders.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50/70 border border-amber-200 rounded-sm px-3 py-2 mt-2">
                  {pendingOrders.length} pending order{pendingOrders.length !== 1 ? 's' : ''} awaiting manager confirmation — excluded from the payable bill until confirmed.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-text-muted pt-3 border-t border-border">
              <span className="leading-snug">
                Shared across all phones at this table. Updates live; pay at the counter when the session closes.
              </span>
              <button
                type="button"
                onClick={handleOpenBill}
                className="text-xs text-accent hover:text-text-primary font-medium flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Combined Bill</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Progress Line for the currently opened order */}
      {order && order.status === 'cancelled' ? (
        <div className="mb-10 p-4 rounded-sm border border-red-200 bg-red-50/60 flex items-center gap-2.5 text-xs font-medium text-red-800">
          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            Order #{order.id} was cancelled and is excluded from the combined bill.
          </span>
        </div>
      ) : order ? (
        <div className="relative mb-12 py-2">
          <div className="absolute top-6 left-6 right-6 h-px bg-border -z-10" />
          <div
            className="absolute top-6 left-6 rtl:left-auto rtl:right-6 h-px bg-accent -z-10 transition-all duration-500"
            style={{ width: `calc(${(Math.max(0, currentStepIndex) / (steps.length - 1)) * 100}% - 3rem)` }}
          />

          <div className="grid grid-cols-4 gap-2 relative">
            {steps.map((step, index) => {
              const isCompleted = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const Icon = step.icon;

              return (
                <div key={step.id} className="flex flex-col items-center gap-2.5 text-center">
                  <div
                    className={`w-10 h-10 rounded-sm flex items-center justify-center transition-colors border ${
                      isCompleted
                        ? 'bg-accent border-accent text-white'
                        : 'bg-bg-primary border-border text-text-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      isCurrent ? 'text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Shared Table Orders Breakdown */}
      <div className="space-y-5">
        {isTableSession && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-border">
            <div>
              <h2 className="text-sm font-medium text-text-primary">
                Shared Table Orders ({displayedOrders.length})
              </h2>
              {otherGuestsOrdersCount > 0 && (
                <p className="text-xs text-text-muted mt-0.5">
                  {myOrdersCount} yours · {otherGuestsOrdersCount} from other guests at this table
                </p>
              )}
            </div>
            <span className="font-mono tabular-nums text-sm font-medium text-text-primary">
              Total: {formatCurrency(combinedGrandTotal)}
            </span>
          </div>
        )}

        {displayedOrders.length === 0 ? (
          <div className="rounded-sm p-8 bg-white border border-border text-center text-sm text-text-secondary">
            Waiting for orders in this table session...
          </div>
        ) : (
          displayedOrders.map((ord) => {
            const isThisOrder = Boolean(order && ord.id === order.id);
            const mine = isOwnOrder(ord);
            const isCancelled = ord.status === 'cancelled';
            const isPending = ord.status === 'pending';

            return (
              <div
                key={ord.id}
                className={`rounded-sm p-5 sm:p-6 border transition-colors ${
                  isCancelled
                    ? 'bg-bg-secondary border-red-200/80 opacity-85'
                    : isThisOrder
                    ? 'bg-white border-accent/50'
                    : 'bg-white border-border'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5 pb-3 border-b border-border">
                  <div>
                    <h3 className="font-serif text-lg text-text-primary">
                      {isThisOrder
                        ? t.order_details || 'Order Details'
                        : `Table Order #${ord.id}`}
                    </h3>
                    <p className="text-xs text-text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono tabular-nums">
                        {new Date(ord.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isTableSession && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-text-secondary">
                            <User className="w-3 h-3" />
                            <span>{mine ? 'Your Order' : 'Table Guest'}</span>
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-text-muted">#{ord.id}</span>
                    <span
                      className={`font-medium capitalize ${
                        STATUS_TEXT_STYLES[ord.status] || 'text-amber-700'
                      }`}
                    >
                      {ord.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mb-5">
                  {ord.items.map((item) => {
                    const itemName = getMenuItemName(item, lang);
                    return (
                      <div
                        key={item.cartItemId}
                        className="flex justify-between items-baseline gap-4 text-sm"
                      >
                        <div className="text-text-primary">
                          <span className="font-mono tabular-nums text-text-muted me-2">{item.quantity}x</span>
                          <span>{itemName}</span>
                          {item.quantity > 1 && (
                            <span className="text-xs font-mono tabular-nums text-text-muted ms-2">
                              ({formatCurrency(item.price)} each)
                            </span>
                          )}
                        </div>
                        <span className="font-mono tabular-nums text-text-primary shrink-0">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-border pt-3 mb-2 flex justify-between items-center text-xs text-text-secondary">
                  <span>Table</span>
                  <span className="font-mono text-text-primary">
                    {ord.tableId && ord.tableId !== 'COUNTER' ? `Table ${ord.tableId}` : 'Counter'}
                  </span>
                </div>

                {ord.kitchenNotes && (
                  <div className="border-t border-border pt-3 mb-2 text-xs text-text-secondary">
                    <span className="font-medium text-text-primary">Kitchen Note: </span>
                    <span>{ord.kitchenNotes}</span>
                  </div>
                )}

                <div className="border-t border-border pt-3.5 flex justify-between items-baseline">
                  <span className="text-xs font-medium text-text-primary">
                    {isCancelled
                      ? 'Order Total (Excluded from Bill)'
                      : isPending
                      ? 'Order Total (Pending Confirmation)'
                      : 'Order Total'}
                  </span>
                  <span
                    className={`text-base font-mono tabular-nums font-medium ${
                      isCancelled
                        ? 'text-red-700 line-through'
                        : isPending
                        ? 'text-amber-700'
                        : 'text-text-primary'
                    }`}
                  >
                    {formatCurrency(ord.total)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Live Combined Table Bill Modal */}
      <ReceiptModal
        receipt={activeReceipt}
        onClose={() => setIsReceiptOpen(false)}
        maskGuestPhones={isTableSession}
      />
    </div>
  );
}
