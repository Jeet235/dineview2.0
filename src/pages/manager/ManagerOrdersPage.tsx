import React, { useState, useMemo, useEffect } from 'react';
import { useOrder, Order, OrderStatus } from '../../context/OrderContext';
import { CartItem } from '../../context/CartContext';
import { 
  ChefHat, 
  CheckCircle2, 
  Clock, 
  PackageCheck, 
  AlertCircle, 
  Edit3, 
  Plus, 
  Minus, 
  Trash2, 
  X, 
  Search, 
  Phone, 
  ShieldCheck, 
  Save, 
  Calendar, 
  CalendarRange,
  FileText,
  UserCheck,
  ArrowUpDown,
  Receipt,
  TrendingUp,
  Filter,
  Users,
  Layers,
  ListFilter,
  Lock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Printer,
  Utensils,
  Check,
  ShoppingBag
} from 'lucide-react';
import { useMenu } from '../../context/MenuContext';
import { MenuItem } from '../../data/menu';
import { formatCurrency } from '../../utils/currency';
import { maskPhone, updateCustomerSpendDelta } from '../../services/customerService';
import { 
  DateFilterState, 
  DateFilterType, 
  SortOptionType, 
  filterOrdersByDate, 
  sortOrders, 
  getOrderCountsPerDay 
} from '../../utils/orderFilters';
import { 
  TableSession, 
  subscribeActiveSessions, 
  subscribeClosedSessionIds,
  closeSession, 
  recalcSessionTotal,
  getSessionById
} from '../../services/sessionService';
import { ReceiptModal } from '../../components/ReceiptModal';
import { ReceiptData, buildConsolidatedSessionBill, isPayableOrder } from '../../services/billingService';
import { revealOrderFullPhone } from '../../services/staffAuthService';

const DATE_PRESETS: { id: DateFilterType; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 days' },
  { id: '30days', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
  { id: 'all', label: 'All Time' },
];

export default function ManagerOrdersPage() {
  const { orders, confirmOrder, updateOrderStatus, updateOrderItems, deleteOrder } = useOrder();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'sessions' | 'stream'>('sessions');

  // Real-time active & closed sessions
  const [activeSessions, setActiveSessions] = useState<TableSession[]>([]);
  const [closedSessionIds, setClosedSessionIds] = useState<Set<string>>(() => new Set());
  const [, setClockTick] = useState<number>(0);

  // Close Session Confirmation Modal
  const [closingSession, setClosingSession] = useState<TableSession | null>(null);
  const [isClosingAction, setIsClosingAction] = useState<boolean>(false);
  const [closeSessionError, setCloseSessionError] = useState<string | null>(null);
  const [sessionJustClosed, setSessionJustClosed] = useState<{ session: TableSession; orders: Order[] } | null>(null);
  const [receiptToPrint, setReceiptToPrint] = useState<ReceiptData | null>(null);

  // Delete Order Confirmation Modal
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Expanded session accordions in session view
  const [collapsedSessions, setCollapsedSessions] = useState<Record<string, boolean>>({});
  
  // Date and Sort filter states
  const [dateFilter, setDateFilter] = useState<DateFilterState>({
    type: 'today',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [sortBy, setSortBy] = useState<SortOptionType>('newest');

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<CartItem[]>([]);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingPhoneId, setRevealingPhoneId] = useState<string | null>(null);
  const [phoneRevealError, setPhoneRevealError] = useState<Record<string, string>>({});

  // Menu item addition modal state
  const { categories } = useMenu();
  const [isAddMenuModalOpen, setIsAddMenuModalOpen] = useState<boolean>(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');

  const managerName = typeof window !== 'undefined'
    ? sessionStorage.getItem('dineview_manager_name') || 'Kitchen Supervisor'
    : 'Kitchen Supervisor';

  // Real-time subscription to active & closed table sessions
  useEffect(() => {
    const unsubscribeActive = subscribeActiveSessions((sessions) => {
      setActiveSessions(sessions);
    });
    const unsubscribeClosed = subscribeClosedSessionIds((ids) => {
      setClosedSessionIds(ids);
    });
    return () => {
      unsubscribeActive();
      unsubscribeClosed();
    };
  }, []);

  const isOrderInClosedSession = (order: Order | null | undefined): boolean => {
    if (!order?.tableSessionId) return false;
    return closedSessionIds.has(order.tableSessionId);
  };

  const isEditingSessionClosed = isOrderInClosedSession(editingOrder);

  // If the session of the currently open Edit modal gets closed (e.g. from another device),
  // immediately close the Add Item menu picker so no new items can be added.
  useEffect(() => {
    if (isEditingSessionClosed && isAddMenuModalOpen) {
      setIsAddMenuModalOpen(false);
    }
  }, [isEditingSessionClosed, isAddMenuModalOpen]);

  // Timer tick every 30s to update elapsed duration badges
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick(prev => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleDatePresetClick = (preset: DateFilterType) => {
    if (preset === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      setDateFilter({ type: 'today', startDate: todayStr, endDate: todayStr });
    } else if (preset === '7days') {
      const now = new Date();
      const past7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      setDateFilter({
        type: '7days',
        startDate: past7.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      });
    } else if (preset === '30days') {
      const now = new Date();
      const past30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      setDateFilter({
        type: '30days',
        startDate: past30.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      });
    } else if (preset === 'custom') {
      setDateFilter(prev => ({
        type: 'custom',
        startDate: prev.startDate || new Date().toISOString().split('T')[0],
        endDate: prev.endDate || new Date().toISOString().split('T')[0],
      }));
    } else {
      setDateFilter({ type: 'all' });
    }
  };

  // 1. Filter by Status & Search Query
  const baseFiltered = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        (order.tableId && order.tableId.toLowerCase().includes(q)) ||
        (order.tableName && order.tableName.toLowerCase().includes(q)) ||
        (order.customerPhone && order.customerPhone.toLowerCase().includes(q)) ||
        order.items.some((i) => i.name.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [orders, selectedStatus, searchQuery]);

  // 2. Filter by Date (applied to orders by createdAt)
  const dateFiltered = useMemo(() => {
    return filterOrdersByDate(baseFiltered, dateFilter);
  }, [baseFiltered, dateFilter]);

  // 3. Sort orders
  const filteredOrders = useMemo(() => {
    return sortOrders(dateFiltered, sortBy);
  }, [dateFiltered, sortBy]);

  // 4. Counts per day
  const countsPerDay = useMemo(() => {
    return getOrderCountsPerDay(filteredOrders);
  }, [filteredOrders]);

  const totalFilteredSales = useMemo(() => {
    return filteredOrders
      .filter((o) => isPayableOrder(o))
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [filteredOrders]);

  const pendingOrders = filteredOrders.filter((o) => o.status === 'pending');
  const preparingOrders = filteredOrders.filter((o) => o.status === 'preparing');
  const readyOrders = filteredOrders.filter((o) => o.status === 'ready');
  const completedOrders = filteredOrders.filter((o) => o.status === 'completed');

  // Map of active session ID to TableSession
  const activeSessionMap = useMemo(() => {
    const map: Record<string, TableSession> = {};
    activeSessions.forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [activeSessions]);

  // Group filtered orders by table session (while computing payable totals across ALL confirmed orders in each session)
  const sessionGroups = useMemo(() => {
    const groups: {
      session: TableSession | null;
      key: string;
      title: string;
      orders: Order[];
      allSessionOrders: Order[];
      totalAmount: number;
      itemsCount: number;
      confirmedCount: number;
      pendingCount: number;
    }[] = [];

    // Grouping dictionary for currently visible (filtered) orders
    const dict: Record<string, Order[]> = {};
    const counterOrders: Order[] = [];

    filteredOrders.forEach((o) => {
      if (o.tableSessionId) {
        if (!dict[o.tableSessionId]) dict[o.tableSessionId] = [];
        dict[o.tableSessionId].push(o);
      } else {
        counterOrders.push(o);
      }
    });

    // Unfiltered orders grouped by session ID so consolidated payable totals never include pending/deleted
    // and never undercount due to status filters
    const allBySession: Record<string, Order[]> = {};
    orders.forEach((o) => {
      if (o.tableSessionId) {
        if (!allBySession[o.tableSessionId]) allBySession[o.tableSessionId] = [];
        allBySession[o.tableSessionId].push(o);
      }
    });

    const summarizeSessionOrders = (list: Order[]) => {
      const payable = list.filter((o) => isPayableOrder(o));
      const pending = list.filter((o) => o.status === 'pending');
      const totalAmount = payable.reduce((s, o) => s + Number(o.total || 0), 0);
      const itemsCount = payable.reduce(
        (s, o) => s + (o.items || []).reduce((a, b) => a + (b.quantity || 1), 0),
        0
      );
      return {
        totalAmount,
        itemsCount,
        confirmedCount: payable.length,
        pendingCount: pending.length,
      };
    };

    // Add active sessions (even if they have orders outside current status filter)
    activeSessions.forEach((sess) => {
      const sessOrders = dict[sess.id] || [];
      const fullSessOrders = allBySession[sess.id] || sessOrders;
      const summary = summarizeSessionOrders(fullSessOrders);

      groups.push({
        session: sess,
        key: sess.id,
        title: `${sess.tableName || `Table ${sess.tableId}`} • #${sess.shortId}`,
        orders: sessOrders,
        allSessionOrders: fullSessOrders,
        totalAmount: summary.totalAmount,
        itemsCount: summary.itemsCount,
        confirmedCount: summary.confirmedCount,
        pendingCount: summary.pendingCount,
      });

      delete dict[sess.id];
    });

    // Add any remaining historical closed sessions that have orders matching the filter
    Object.keys(dict).forEach((sessId) => {
      const sessOrders = dict[sessId];
      const fullSessOrders = allBySession[sessId] || sessOrders;
      const firstOrder = fullSessOrders[0] || sessOrders[0];
      const summary = summarizeSessionOrders(fullSessOrders);

      groups.push({
        session: null,
        key: sessId,
        title: `${firstOrder?.tableName || 'Table Session'} • Closed Tab`,
        orders: sessOrders,
        allSessionOrders: fullSessOrders,
        totalAmount: summary.totalAmount,
        itemsCount: summary.itemsCount,
        confirmedCount: summary.confirmedCount,
        pendingCount: summary.pendingCount,
      });
    });

    // Add Counter / Takeaway group if any exist
    if (counterOrders.length > 0) {
      const summary = summarizeSessionOrders(counterOrders);
      groups.push({
        session: null,
        key: 'COUNTER',
        title: 'Counter & Takeaway Tickets',
        orders: counterOrders,
        allSessionOrders: counterOrders,
        totalAmount: summary.totalAmount,
        itemsCount: summary.itemsCount,
        confirmedCount: summary.confirmedCount,
        pendingCount: summary.pendingCount,
      });
    }

    return groups;
  }, [filteredOrders, orders, activeSessions]);

  // Flatten all menu items from categories
  const allMenuItems = useMemo(() => {
    const list: (MenuItem & { categoryName: string; categoryId: string })[] = [];
    categories.forEach((cat) => {
      (cat.items || []).forEach((item) => {
        list.push({
          ...item,
          categoryName: cat.name,
          categoryId: cat.id,
        });
      });
    });
    return list;
  }, [categories]);

  // Filtered menu items based on search query and category tab
  const filteredMenuItems = useMemo(() => {
    const q = menuSearchQuery.trim().toLowerCase();
    return allMenuItems.filter((item) => {
      const matchesCategory =
        selectedCategoryTab === 'all' || item.categoryId === selectedCategoryTab;
      const matchesSearch =
        q === '' ||
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [allMenuItems, selectedCategoryTab, menuSearchQuery]);

  const handleOpenEdit = (order: Order, openMenuPickerImmediately = false) => {
    if (isOrderInClosedSession(order)) return;
    setEditingOrder(order);
    setEditItems(JSON.parse(JSON.stringify(order.items || [])));
    setEditNotes(order.kitchenNotes || '');
    setEditError(null);
    setMenuSearchQuery('');
    setSelectedCategoryTab('all');
    setIsAddMenuModalOpen(openMenuPickerImmediately);
  };

  const handleUpdateItemQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      setEditItems((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
    } else {
      setEditItems((prev) =>
        prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: newQty } : i))
      );
    }
  };

  const handleRemoveItem = (cartItemId: string) => {
    setEditItems((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  };

  // Add new menu item to current order, or increment quantity if already present
  const handleAddMenuItemToOrder = (item: MenuItem, qtyToAdd = 1) => {
    if (qtyToAdd <= 0) return;
    setEditItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      const limit = item.maxPerOrder ?? 20;
      if (existingIndex >= 0) {
        const updated = [...prev];
        const newQty = Math.min(updated[existingIndex].quantity + qtyToAdd, limit);
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQty,
        };
        return updated;
      }
      const cartItemId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      return [
        ...prev,
        {
          ...item,
          cartItemId,
          quantity: Math.min(qtyToAdd, limit),
        },
      ];
    });
  };

  // Adjust item quantity directly from the menu picker
  const handleSetMenuItemQuantityInOrder = (itemId: string, qty: number, fallbackItem?: MenuItem) => {
    setEditItems((prev) => {
      const existing = prev.find((i) => i.id === itemId);
      if (qty <= 0) {
        return prev.filter((i) => i.id !== itemId);
      }
      const limit = (existing?.maxPerOrder || fallbackItem?.maxPerOrder) ?? 20;
      const targetQty = Math.min(qty, limit);
      if (existing) {
        return prev.map((i) => (i.id === itemId ? { ...i, quantity: targetQty } : i));
      }
      if (fallbackItem) {
        const cartItemId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        return [...prev, { ...fallbackItem, cartItemId, quantity: targetQty }];
      }
      return prev;
    });
  };

  const calculateEditTotal = (): number => {
    return editItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    if (isOrderInClosedSession(editingOrder)) {
      setEditError('This table session is closed. New items and edits are disabled.');
      return;
    }
    if (editItems.length === 0) {
      setEditError('Order must contain at least one dish.');
      return;
    }

    setEditError(null);
    setIsSavingEdit(true);
    const newTotal = calculateEditTotal();
    const delta = newTotal - editingOrder.total;

    try {
      await updateOrderItems(editingOrder.id, editItems, newTotal, editNotes.trim());
      // Sync customer spend delta if customer phone is recorded
      if (editingOrder.customerPhone && delta !== 0) {
        await updateCustomerSpendDelta(editingOrder.customerPhone, delta);
      }
      setEditingOrder(null);
      setIsAddMenuModalOpen(false);
    } catch (err: any) {
      console.error('Failed to save order edit:', err);
      if (err?.code === 'SESSION_CLOSED' || err?.code === 'permission-denied') {
        setEditError('This table session is closed. Items and orders can no longer be modified.');
      } else {
        setEditError('Could not update order items. Please try again.');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Save changes and confirm order to kitchen in one single action
  const handleSaveAndConfirmEdit = async () => {
    if (!editingOrder) return;
    if (isOrderInClosedSession(editingOrder)) {
      setEditError('This table session is closed. New items and edits are disabled.');
      return;
    }
    if (editItems.length === 0) {
      setEditError('Order must contain at least one dish.');
      return;
    }

    setEditError(null);
    setIsSavingEdit(true);
    const newTotal = calculateEditTotal();
    const delta = newTotal - editingOrder.total;

    try {
      await updateOrderItems(editingOrder.id, editItems, newTotal, editNotes.trim());
      if (editingOrder.customerPhone && delta !== 0) {
        await updateCustomerSpendDelta(editingOrder.customerPhone, delta);
      }
      await confirmOrder(editingOrder.id, managerName, editNotes.trim());
      setEditingOrder(null);
      setIsAddMenuModalOpen(false);
    } catch (err: any) {
      console.error('Failed to save and confirm order:', err);
      if (err?.code === 'SESSION_CLOSED' || err?.code === 'permission-denied') {
        setEditError('This table session is closed. Items and orders can no longer be modified.');
      } else {
        setEditError('Could not update and confirm order. Please try again.');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (isOrderInClosedSession(targetOrder)) return;
    try {
      await confirmOrder(orderId, managerName);
    } catch (err) {
      console.error('Failed to confirm order:', err);
    }
  };

  const handleRequestDeleteOrder = (order: Order) => {
    if (isOrderInClosedSession(order)) return;
    setDeleteError(null);
    setDeletingOrder(order);
  };

  const handleConfirmDeleteOrder = async () => {
    if (!deletingOrder) return;
    if (isOrderInClosedSession(deletingOrder)) {
      setDeleteError('This table session is closed. Orders in a closed session cannot be deleted.');
      return;
    }
    setIsDeletingOrder(true);
    setDeleteError(null);
    try {
      await deleteOrder(deletingOrder.id);
      if (editingOrder?.id === deletingOrder.id) {
        setEditingOrder(null);
        setIsAddMenuModalOpen(false);
      }
      setDeletingOrder(null);
    } catch (err: any) {
      console.error('Failed to delete order:', err);
      setDeleteError(err?.message || 'Could not delete order. Please try again.');
    } finally {
      setIsDeletingOrder(false);
    }
  };

  const handleCloseSessionConfirm = async () => {
    if (!closingSession) return;
    setIsClosingAction(true);
    setCloseSessionError(null);
    try {
      await closeSession(closingSession.id, managerName);
      if (editingOrder?.tableSessionId === closingSession.id) {
        setEditingOrder(null);
        setIsAddMenuModalOpen(false);
      }
      const sessOrders = orders.filter((o) => o.tableSessionId === closingSession.id);
      const payableSessOrders = sessOrders.filter((o) => isPayableOrder(o));
      const confirmedTotal = payableSessOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const confirmedItems = payableSessOrders.reduce(
        (s, o) => s + (o.items || []).reduce((a, b) => a + (b.quantity || 1), 0),
        0
      );
      const updatedSession: TableSession = {
        ...closingSession,
        status: 'closed',
        endedAt: new Date().toISOString(),
        closedBy: managerName,
        totalAmount: confirmedTotal,
        itemsCount: confirmedItems,
      };
      setSessionJustClosed({ session: updatedSession, orders: sessOrders });
      setClosingSession(null);
    } catch (err) {
      console.error('Failed to close session:', err);
      setCloseSessionError('Failed to close table session. Please try again.');
    } finally {
      setIsClosingAction(false);
    }
  };

  const handlePrintConsolidatedBill = async (
    session: TableSession | null,
    sessionKey: string,
    sessionOrders: Order[]
  ) => {
    // Always consolidate across ALL orders in this session, independent of active status filters
    const fullSessionOrders =
      sessionKey && sessionKey !== 'COUNTER'
        ? orders.filter((o) => o.tableSessionId === sessionKey)
        : sessionOrders;
    const effectiveOrders = fullSessionOrders.length > 0 ? fullSessionOrders : sessionOrders;

    let targetSession = session;
    if (!targetSession && sessionKey && sessionKey !== 'COUNTER') {
      targetSession = await getSessionById(sessionKey);
    }

    if (!targetSession) {
      const firstOrder = effectiveOrders[0];
      const payableOrders = effectiveOrders.filter((o) => isPayableOrder(o));
      const computedTotal = payableOrders.reduce((s, o) => s + Number(o.total || 0), 0);
      const computedItems = payableOrders.reduce(
        (s, o) => s + (o.items || []).reduce((a, b) => a + (b.quantity || 1), 0),
        0
      );

      targetSession = {
        id: sessionKey,
        shortId: sessionKey.length > 4 ? sessionKey.slice(-4).toUpperCase() : sessionKey,
        tableId: firstOrder?.tableId || 'COUNTER',
        tableName: firstOrder?.tableName || 'Table Tab',
        status: 'closed',
        startedAt: firstOrder?.createdAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMinutes: null,
        totalAmount: computedTotal,
        itemsCount: computedItems,
        orderIds: effectiveOrders.map((o) => o.id),
        createdByPhone: firstOrder?.customerPhone ? maskPhone(firstOrder.customerPhone) : null,
        closedBy: managerName,
      };
    }

    const bill = buildConsolidatedSessionBill(targetSession, effectiveOrders);
    setReceiptToPrint(bill);
  };

  const handleToggleFullPhone = async (order: Order) => {
    if (revealedPhones[order.id]) {
      setRevealedPhones((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      return;
    }

    setRevealingPhoneId(order.id);
    setPhoneRevealError((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });

    try {
      const result = await revealOrderFullPhone(order.id, order.customerPhone);
      if (!result.ok || !result.fullPhone) {
        setPhoneRevealError((prev) => ({
          ...prev,
          [order.id]: result.error || 'Authorized staff access required.',
        }));
        return;
      }
      setRevealedPhones((prev) => ({ ...prev, [order.id]: result.fullPhone! }));
    } catch (err: any) {
      setPhoneRevealError((prev) => ({
        ...prev,
        [order.id]: err?.message || 'Authorized staff access required.',
      }));
    } finally {
      setRevealingPhoneId(null);
    }
  };

  const toggleCollapseSession = (key: string) => {
    setCollapsedSessions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getElapsedDuration = (startedAt: string): string => {
    const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m seated`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m seated`;
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            Pending Confirmation
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 whitespace-nowrap">
            <ChefHat className="w-3.5 h-3.5 text-blue-700" />
            Preparing
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 whitespace-nowrap">
            <PackageCheck className="w-3.5 h-3.5 text-emerald-700" />
            Ready for Table
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-text-muted" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
            <X className="w-3.5 h-3.5 text-red-600" />
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-text-primary tracking-tight">
            Kitchen Dispatch & Orders
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Table session bill consolidation, live seated duration, and kitchen ticket dispatch.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-xs text-text-muted block">Active Supervisor</span>
          <span className="text-sm font-medium text-text-primary">{managerName}</span>
        </div>
      </div>

      {/* Flat Hairline KPI Strip */}
      <div className="bg-white border border-border rounded-sm grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-border mb-6">
        <div className="p-4 sm:p-5">
          <span className="text-xs text-text-secondary block mb-1">Active Table Sessions</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-mono tabular-nums font-medium text-text-primary">
              {activeSessions.length}
            </span>
            <span className="text-xs font-medium text-emerald-700">Live</span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs text-text-secondary block mb-1">Pending Confirmation</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-2xl font-mono tabular-nums font-medium ${pendingOrders.length > 0 ? 'text-amber-800' : 'text-text-primary'}`}>
              {pendingOrders.length}
            </span>
            <span className="text-xs text-text-muted">
              {pendingOrders.length > 0 ? 'Needs review' : 'All clear'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs text-text-secondary block mb-1">In Kitchen</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-mono tabular-nums font-medium text-text-primary">
              {preparingOrders.length}
            </span>
            <span className="text-xs text-text-muted">Preparing</span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs text-text-secondary block mb-1">Filtered Tickets</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-mono tabular-nums font-medium text-text-primary">
              {filteredOrders.length}
            </span>
            <span className="text-xs font-mono tabular-nums text-text-secondary">
              {formatCurrency(totalFilteredSales)}
            </span>
          </div>
        </div>
      </div>

      {/* Date Filter & Sort Bar */}
      <div className="bg-white border border-border rounded-sm p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-text-secondary flex items-center gap-1.5 me-2">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Date</span>
            </span>

            {DATE_PRESETS.map((preset) => {
              const isActive = dateFilter.type === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleDatePresetClick(preset.id)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-text-primary text-bg-primary'
                      : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span>{preset.label}</span>
                  {countsPerDay[preset.id] !== undefined && (
                    <span className="ms-1.5 font-mono tabular-nums text-[11px] opacity-80">
                      ({countsPerDay[preset.id]})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sort Selector & View Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-sm p-0.5 bg-bg-secondary border border-border">
              <button
                type="button"
                onClick={() => setViewMode('sessions')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'sessions'
                    ? 'bg-white text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-accent" />
                Table Sessions
              </button>
              <button
                type="button"
                onClick={() => setViewMode('stream')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'stream'
                    ? 'bg-white text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                Ticket Stream
              </button>
            </div>

            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOptionType)}
                className="bg-bg-primary border border-border rounded-sm px-3 py-1.5 text-xs font-medium text-text-primary focus:outline-hidden focus:border-text-primary"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest-amount">Highest Amount</option>
                <option value="lowest-amount">Lowest Amount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter.type === 'custom' && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-4 text-xs">
            <span className="text-text-secondary font-medium flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5 text-accent" /> Custom Range
            </span>
            <div className="flex items-center gap-2">
              <label className="text-text-secondary">From</label>
              <input
                type="date"
                value={dateFilter.startDate || ''}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                className="bg-bg-primary border border-border px-2.5 py-1 rounded-sm text-xs font-mono tabular-nums"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-text-secondary">To</label>
              <input
                type="date"
                value={dateFilter.endDate || ''}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))}
                className="bg-bg-primary border border-border px-2.5 py-1 rounded-sm text-xs font-mono tabular-nums"
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ticket #, table, dish name, or customer phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-sm text-sm focus:outline-hidden focus:border-text-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', 'pending', 'preparing', 'ready', 'completed'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-3.5 py-2 rounded-sm text-xs font-medium capitalize transition-colors ${
                selectedStatus === status
                  ? 'bg-text-primary text-bg-primary'
                  : 'bg-white border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* VIEW MODE 1: GROUP BY TABLE SESSION */}
      {viewMode === 'sessions' ? (
        <div className="space-y-6">
          {sessionGroups.length === 0 ? (
            <div className="bg-white border border-border rounded-sm p-12 text-center">
              <Users className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <h3 className="font-serif text-lg text-text-primary mb-1">No Active Table Sessions</h3>
              <p className="text-xs text-text-secondary">
                When dining parties scan table QRs and submit orders, active sessions appear here consolidated.
              </p>
            </div>
          ) : (
            sessionGroups.map((group) => {
              const session = group.session;
              const isCollapsed = Boolean(collapsedSessions[group.key]);
              const isGroupClosedSession =
                group.key !== 'COUNTER' &&
                (!session || session.status === 'closed' || closedSessionIds.has(group.key));

              return (
                <div
                  key={group.key}
                  className={`bg-white border border-border rounded-sm transition-colors ${
                    session?.status === 'active'
                      ? 'border-l-2 border-l-accent'
                      : ''
                  }`}
                >
                  {/* Session Header Card */}
                  <div className="p-5 border-b border-border bg-bg-primary">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Table Title & Session ID */}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <h3 className="font-serif text-xl font-semibold text-text-primary">
                            {session?.tableName || (group.key === 'COUNTER' ? 'Counter & Takeaway' : `Table ${session?.tableId || ''}`)}
                          </h3>
                          {session?.shortId && (
                            <span className="font-mono tabular-nums text-xs font-medium text-accent">
                              #{session.shortId}
                            </span>
                          )}
                          <span className="text-text-muted">·</span>
                          <span className={`text-xs font-medium ${
                            session?.status === 'active'
                              ? 'text-emerald-700'
                              : 'text-text-muted'
                          }`}>
                            {session?.status === 'active' ? 'Active Table' : (group.key === 'COUNTER' ? 'Quick Service' : 'Closed Tab')}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary mt-1.5">
                          {session?.startedAt && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Clock className="w-3.5 h-3.5 text-text-muted" />
                              Started {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {session?.startedAt && session.status === 'active' && (
                            <>
                              <span className="text-text-muted">·</span>
                              <span className="font-mono tabular-nums font-medium text-amber-800">
                                {getElapsedDuration(session.startedAt)}
                              </span>
                            </>
                          )}
                          {session?.createdByPhone && (
                            <>
                              <span className="text-text-muted">·</span>
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-text-muted">
                                <Phone className="w-3 h-3" />
                                Host {maskPhone(session.createdByPhone)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Consolidated Totals & Actions */}
                      <div className="flex items-center gap-4 flex-wrap justify-between lg:justify-end">
                        <div className="text-left lg:text-right">
                          <span className="text-xs text-text-muted block">
                            Confirmed Tab ({group.itemsCount} dishes)
                          </span>
                          <span className="text-xl font-mono tabular-nums font-semibold text-text-primary">
                            {formatCurrency(group.totalAmount)}
                          </span>
                          <span className="text-[11px] text-text-secondary block font-mono tabular-nums">
                            {group.confirmedCount} confirmed
                            {group.pendingCount > 0 ? ` · ${group.pendingCount} pending (excluded)` : ''}
                          </span>
                        </div>

                        {/* Close Session Button (only for active sessions) vs Print Complete Bill (for closed sessions) */}
                        {session && session.status === 'active' ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePrintConsolidatedBill(session, group.key, group.allSessionOrders)}
                              className="bg-white border border-border text-text-primary hover:bg-bg-secondary px-3 py-2 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
                              title="Preview bill without closing session"
                            >
                              <Printer className="w-3.5 h-3.5 text-accent" />
                              <span>Preview Bill</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCloseSessionError(null);
                                setClosingSession(session);
                              }}
                              className="bg-text-primary text-bg-primary hover:bg-text-primary/90 px-4 py-2 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Lock className="w-3.5 h-3.5 text-amber-300" />
                              Close Session
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePrintConsolidatedBill(session, group.key, group.allSessionOrders)}
                            className="bg-text-primary text-bg-primary hover:bg-text-primary/90 px-4 py-2 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print Complete Bill
                          </button>
                        )}

                        {/* Accordion toggle */}
                        <button
                          type="button"
                          onClick={() => toggleCollapseSession(group.key)}
                          className="p-2 text-text-muted hover:text-text-primary rounded-sm transition-colors"
                          title="Toggle sub-orders list"
                        >
                          {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sub-Orders List for this session */}
                  {!isCollapsed && (
                    <div className="p-5 bg-white">
                      {group.orders.length === 0 ? (
                        <p className="text-xs text-text-muted italic py-4 text-center">
                          No sub-orders currently match the selected status filter.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <span className="text-xs font-medium text-text-muted block">
                            Sub-Orders in Session ({group.orders.length})
                          </span>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {group.orders.map((order) => {
                              const isLockedClosed = isGroupClosedSession || isOrderInClosedSession(order);
                              return (
                              <div
                                key={order.id}
                                className="border border-border rounded-sm p-4 bg-bg-primary flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 font-mono tabular-nums">
                                      <span className="font-semibold text-sm text-text-primary">
                                        #{order.id}
                                      </span>
                                      <span className="text-xs text-text-muted">
                                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <div>{getStatusBadge(order.status)}</div>
                                  </div>

                                  {/* Guest Phone Info (Masked by default; authorized staff reveal) */}
                                  {order.customerPhone && (
                                    <div className="mb-3 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                                        <Phone className="w-3.5 h-3.5 text-text-muted" />
                                        <span className="font-mono tabular-nums">
                                          {revealedPhones[order.id] || maskPhone(order.customerPhone)}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={revealingPhoneId === order.id}
                                          onClick={() => handleToggleFullPhone(order)}
                                          className="text-xs text-accent font-medium underline disabled:opacity-50"
                                        >
                                          {revealingPhoneId === order.id
                                            ? 'Verifying...'
                                            : revealedPhones[order.id]
                                            ? 'Hide'
                                            : 'View Full Number'}
                                        </button>
                                      </div>
                                      {phoneRevealError[order.id] && (
                                        <p className="text-[11px] text-red-600">{phoneRevealError[order.id]}</p>
                                      )}
                                    </div>
                                  )}

                                  {/* Dish Items */}
                                  <div className="space-y-1.5 mb-3 border-t border-border pt-2">
                                    {order.items.map((item) => (
                                      <div key={item.cartItemId} className="flex justify-between items-center text-xs gap-2">
                                        <span className="text-text-primary font-medium">
                                          <span className="font-mono tabular-nums">{item.quantity}×</span> {item.name}
                                        </span>
                                        <span className="font-mono tabular-nums text-text-secondary shrink-0">
                                          {formatCurrency(item.price * item.quantity)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>

                                  {order.kitchenNotes && (
                                    <div className="p-2.5 rounded-sm bg-amber-50/70 border border-amber-200 text-xs text-amber-900 mb-3">
                                      <span className="font-medium">Note: </span>
                                      <span>{order.kitchenNotes}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Order Action Buttons */}
                                <div className="border-t border-border pt-3 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <span className="font-mono tabular-nums font-semibold text-sm text-text-primary block">
                                      {formatCurrency(order.total)}
                                    </span>
                                    {order.status === 'pending' && (
                                      <span className="text-[11px] text-amber-800">
                                        Not yet in payable bill
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isLockedClosed}
                                      onClick={() => handleOpenEdit(order, false)}
                                      className={`px-2 py-1.5 border rounded-sm text-xs font-medium flex items-center gap-1 transition-colors ${
                                        isLockedClosed
                                          ? 'text-text-muted bg-bg-secondary border-border cursor-not-allowed opacity-60'
                                          : 'text-text-secondary hover:text-text-primary border-border bg-white hover:bg-bg-secondary'
                                      }`}
                                      title={isLockedClosed ? 'Session closed — order is locked' : 'Edit Order Dishes'}
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Edit</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={isLockedClosed}
                                      onClick={() => handleOpenEdit(order, true)}
                                      className={`px-2.5 py-1.5 border rounded-sm text-xs font-medium flex items-center gap-1 transition-colors ${
                                        isLockedClosed
                                          ? 'text-text-muted bg-bg-secondary border-border cursor-not-allowed opacity-60'
                                          : 'text-accent hover:text-accent-hover border-accent/40 bg-white hover:bg-bg-secondary'
                                      }`}
                                      title={isLockedClosed ? 'Session closed — cannot add items' : 'Add Menu Item to Order'}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Add Item</span>
                                    </button>

                                    {isLockedClosed ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-muted">
                                        <Lock className="w-3 h-3" />
                                        Session Closed
                                      </span>
                                    ) : (
                                      <>
                                        {order.status === 'pending' && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleRequestDeleteOrder(order)}
                                              className="px-2.5 py-1.5 text-red-700 hover:bg-red-100 bg-red-50 border border-red-200 rounded-sm text-xs font-medium flex items-center gap-1 transition-colors"
                                              title="Delete Pending Order"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                              <span>Delete</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleConfirmOrder(order.id)}
                                              className="bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-sm text-xs font-medium transition-colors"
                                            >
                                              Confirm
                                            </button>
                                          </>
                                        )}

                                        {order.status === 'preparing' && (
                                          <button
                                            type="button"
                                            onClick={() => updateOrderStatus(order.id, 'ready')}
                                            className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-sm text-xs font-medium transition-colors"
                                          >
                                            Mark Ready
                                          </button>
                                        )}

                                        {order.status === 'ready' && (
                                          <button
                                            type="button"
                                            onClick={() => updateOrderStatus(order.id, 'completed')}
                                            className="bg-text-primary hover:bg-text-primary/90 text-bg-primary px-3 py-1.5 rounded-sm text-xs font-medium transition-colors"
                                          >
                                            Served
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* VIEW MODE 2: TRADITIONAL TICKET STREAM */
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-border rounded-sm p-12 text-center">
              <Receipt className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <h3 className="font-serif text-lg text-text-primary mb-1">No Orders Found</h3>
              <p className="text-xs text-text-secondary">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const linkedSession = order.tableSessionId ? activeSessionMap[order.tableSessionId] : null;
              const isLockedClosed = isOrderInClosedSession(order);

              return (
                <div
                  key={order.id}
                  className="bg-white border border-border rounded-sm p-5 hover:border-text-secondary/50 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-4 border-b border-border">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-mono tabular-nums text-lg font-semibold text-text-primary">
                        #{order.id}
                      </span>
                      <span className="text-text-muted">·</span>
                      <span className="text-xs font-medium text-text-primary">
                        {order.tableId && order.tableId !== 'COUNTER' ? `Table ${order.tableId}` : 'Counter'}
                      </span>
                      {order.tableSessionId && (
                        <>
                          <span className="text-text-muted">·</span>
                          <span className="font-mono tabular-nums text-xs font-medium text-accent">
                            Session #{linkedSession?.shortId || order.tableSessionId.substring(order.tableSessionId.length - 4).toUpperCase()}
                          </span>
                        </>
                      )}
                      <span className="text-text-muted">·</span>
                      <div>{getStatusBadge(order.status)}</div>
                    </div>

                    <div className="flex items-baseline gap-4 text-xs text-text-secondary">
                      <span className="font-mono tabular-nums">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-lg font-mono tabular-nums font-semibold text-text-primary">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  </div>

                  {/* Customer Phone Information (Masked by default; authorized staff reveal) */}
                  {order.customerPhone && (
                    <div className="mb-4 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <Phone className="w-3.5 h-3.5 text-text-muted" />
                        <span>Customer</span>
                        <span className="font-mono tabular-nums font-medium text-text-primary">
                          {revealedPhones[order.id] || maskPhone(order.customerPhone)}
                        </span>
                        <button
                          type="button"
                          disabled={revealingPhoneId === order.id}
                          onClick={() => handleToggleFullPhone(order)}
                          className="text-xs text-accent font-medium underline ms-1 disabled:opacity-50"
                        >
                          {revealingPhoneId === order.id
                            ? 'Verifying...'
                            : revealedPhones[order.id]
                            ? 'Hide'
                            : 'View Full Number'}
                        </button>
                      </div>
                      {phoneRevealError[order.id] && (
                        <p className="text-[11px] text-red-600">{phoneRevealError[order.id]}</p>
                      )}
                    </div>
                  )}

                  {/* Items list */}
                  <div className="space-y-2 mb-4">
                    {order.items.map((item) => (
                      <div key={item.cartItemId} className="flex justify-between items-center text-sm gap-2">
                        <span className="text-text-primary font-medium">
                          <span className="font-mono tabular-nums">{item.quantity}×</span> {item.name}
                        </span>
                        <span className="font-mono tabular-nums text-text-secondary shrink-0">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {order.kitchenNotes && (
                    <div className="p-3 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-900 mb-4">
                      <span className="font-medium">Kitchen Instructions: </span>
                      <span>{order.kitchenNotes}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-border">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isLockedClosed}
                        onClick={() => handleOpenEdit(order, false)}
                        title={isLockedClosed ? 'Session closed — order is locked' : 'Edit Dishes'}
                        className={`flex items-center gap-1.5 text-xs font-medium border px-3 py-1.5 rounded-sm transition-colors ${
                          isLockedClosed
                            ? 'text-text-muted bg-bg-secondary border-border cursor-not-allowed opacity-60'
                            : 'text-text-secondary hover:text-text-primary border-border hover:bg-bg-secondary'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit Dishes
                      </button>
                      <button
                        type="button"
                        disabled={isLockedClosed}
                        onClick={() => handleOpenEdit(order, true)}
                        title={isLockedClosed ? 'Session closed — cannot add items' : 'Add Menu Item to Order'}
                        className={`flex items-center gap-1.5 text-xs font-medium border px-3 py-1.5 rounded-sm transition-colors ${
                          isLockedClosed
                            ? 'text-text-muted bg-bg-secondary border-border cursor-not-allowed opacity-60'
                            : 'text-accent hover:text-accent-hover border-accent/40 bg-white hover:bg-bg-secondary'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Item
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {isLockedClosed ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-muted">
                          <Lock className="w-3.5 h-3.5" />
                          Session Closed
                        </span>
                      ) : (
                        <>
                          {order.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRequestDeleteOrder(order)}
                                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3.5 py-2 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Order
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmOrder(order.id)}
                                className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-sm text-xs font-medium transition-colors"
                              >
                                Confirm Order
                              </button>
                            </>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              type="button"
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-sm text-xs font-medium transition-colors"
                            >
                              Mark Ready
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <button
                              type="button"
                              onClick={() => updateOrderStatus(order.id, 'completed')}
                              className="bg-text-primary hover:bg-text-primary/90 text-bg-primary px-4 py-2 rounded-sm text-xs font-medium transition-colors"
                            >
                              Mark Served
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Close Session Confirmation Modal */}
      {closingSession && (() => {
        const sessOrders = orders.filter((o) => o.tableSessionId === closingSession.id);
        const confirmedOrders = sessOrders.filter((o) => isPayableOrder(o));
        const unconfirmedPending = sessOrders.filter((o) => o.status === 'pending');
        const confirmedTotal = confirmedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
        const confirmedDishes = confirmedOrders.reduce(
          (s, o) => s + (o.items || []).reduce((a, b) => a + (b.quantity || 1), 0),
          0
        );

        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-sm max-w-md w-full p-6 shadow-xl border border-border animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Lock className="w-5 h-5 text-accent" />
                  <h3 className="font-serif text-xl font-bold">Close Table Session</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setClosingSession(null)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-sm text-text-secondary">
                  Are you sure you want to close and settle the consolidated tab for{' '}
                  <span className="font-bold text-text-primary">{closingSession.tableName}</span> (Session #{closingSession.shortId})?
                </p>

                {closeSessionError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-sm text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{closeSessionError}</span>
                  </div>
                )}

                {unconfirmedPending.length > 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-sm text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      {unconfirmedPending.length} pending order{unconfirmedPending.length !== 1 ? 's' : ''} are unconfirmed and will NOT be included in the payable bill.
                    </span>
                  </div>
                )}

              <div className="bg-bg-primary p-4 rounded-sm border border-border space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Table</span>
                    <span className="font-medium text-text-primary">{closingSession.tableName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Session Started</span>
                    <span className="font-mono tabular-nums font-medium text-text-primary">
                      {new Date(closingSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Elapsed Dining Time</span>
                    <span className="font-mono tabular-nums font-medium text-text-primary">
                      {getElapsedDuration(closingSession.startedAt)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Confirmed Dishes Served</span>
                    <span className="font-mono tabular-nums font-medium text-text-primary">
                      {confirmedDishes} items ({confirmedOrders.length} orders)
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between text-sm">
                    <span className="font-medium text-text-primary">Final Consolidated Bill</span>
                    <span className="font-mono tabular-nums font-semibold text-text-primary text-base">
                      {formatCurrency(confirmedTotal)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-text-muted">
                  Closing will archive this session. Any subsequent order scanned from this table will automatically open a fresh session.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setClosingSession(null)}
                  disabled={isClosingAction}
                  className="px-4 py-2 border border-border rounded-sm text-xs font-medium text-text-secondary hover:bg-bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCloseSessionConfirm}
                  disabled={isClosingAction}
                  className="px-5 py-2 bg-text-primary hover:bg-text-primary/90 text-bg-primary rounded-sm text-xs font-medium flex items-center gap-1.5"
                >
                  {isClosingAction ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Closing Tab...
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-300" />
                      Confirm & Close Session
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Session Just Closed - Immediate Print Complete Bill Modal */}
      {sessionJustClosed && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-md w-full p-6 border border-border">
            <div className="flex items-start justify-between pb-4 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <h3 className="font-serif text-lg font-semibold text-text-primary">Session Closed</h3>
                  <span className="text-xs text-text-muted">Consolidated Tab Settled</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSessionJustClosed(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-xs text-text-secondary">
                The session for <span className="font-semibold text-text-primary">{sessionJustClosed.session.tableName}</span> (Session #{sessionJustClosed.session.shortId}) is closed. You can print the complete consolidated session bill now or reopen it anytime from the closed tab history.
              </p>

              <div className="bg-bg-primary p-4 rounded-sm border border-border space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Table</span>
                  <span className="font-medium text-text-primary">{sessionJustClosed.session.tableName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Session ID</span>
                  <span className="font-mono tabular-nums font-medium text-accent">#{sessionJustClosed.session.shortId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Confirmed Orders Settled</span>
                  <span className="font-mono tabular-nums font-medium text-text-primary">
                    {sessionJustClosed.orders.filter((o) => isPayableOrder(o)).length} tickets
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Confirmed Dishes</span>
                  <span className="font-mono tabular-nums font-medium text-text-primary">{sessionJustClosed.session.itemsCount} dishes</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-sm">
                  <span className="font-medium text-text-primary">Consolidated Total</span>
                  <span className="font-mono tabular-nums font-semibold text-text-primary text-base">
                    {formatCurrency(sessionJustClosed.session.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSessionJustClosed(null)}
                className="px-4 py-2 border border-border rounded-sm text-xs font-medium text-text-secondary hover:bg-bg-secondary"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = sessionJustClosed;
                  setSessionJustClosed(null);
                  handlePrintConsolidatedBill(target.session, target.session.id, target.orders);
                }}
                className="px-5 py-2 bg-text-primary hover:bg-text-primary/90 text-bg-primary rounded-sm text-xs font-medium flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Print Complete Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-2xs">
          <div className="bg-white rounded-sm max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-[#FAF9F8]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-serif text-xl font-bold text-text-primary">
                    {editingOrder.status === 'pending' ? 'Review & Confirm Order' : 'Edit Order Dishes'}
                  </h3>
                  {getStatusBadge(editingOrder.status)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="font-mono font-bold text-text-primary">Ticket #{editingOrder.id}</span>
                  <span>•</span>
                  <span>{editingOrder.tableName || (editingOrder.tableId === 'COUNTER' ? 'Counter' : `Table ${editingOrder.tableId}`)}</span>
                  {editingOrder.tableSessionId && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-accent">Session #{editingOrder.tableSessionId.slice(-4).toUpperCase()}</span>
                    </>
                  )}
                  {editingOrder.customerPhone && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1.5 font-mono">
                        <Phone className="w-3 h-3 text-text-muted" />
                        {revealedPhones[editingOrder.id] || maskPhone(editingOrder.customerPhone)}
                        <button
                          type="button"
                          disabled={revealingPhoneId === editingOrder.id}
                          onClick={() => handleToggleFullPhone(editingOrder)}
                          className="text-[10px] font-sans text-accent font-bold uppercase underline disabled:opacity-50"
                        >
                          {revealingPhoneId === editingOrder.id
                            ? 'Verifying...'
                            : revealedPhones[editingOrder.id]
                            ? 'Hide'
                            : 'View Full Number'}
                        </button>
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingOrder(null);
                  setIsAddMenuModalOpen(false);
                }}
                className="text-text-muted hover:text-text-primary p-1.5 rounded hover:bg-border/30 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Bar to Add New Menu Items (or Locked Banner if session closed) */}
            {isEditingSessionClosed ? (
              <div className="px-5 py-3 bg-bg-secondary border-b border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Lock className="w-4 h-4 text-text-muted shrink-0" />
                  <span>
                    <strong className="text-text-primary">Session Closed:</strong> This table session has been closed. Adding items and editing dishes are disabled.
                  </span>
                </div>
                <button
                  type="button"
                  disabled
                  className="shrink-0 px-3.5 py-1.5 bg-border text-text-muted rounded-sm text-xs font-medium flex items-center gap-1.5 cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Item
                </button>
              </div>
            ) : (
              <div className="px-5 py-3 bg-bg-secondary border-b border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Utensils className="w-4 h-4 text-accent shrink-0" />
                  <span>
                    <strong className="text-text-primary">Add extra dishes:</strong> Browse the restaurant menu to append items to this tab.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddMenuModalOpen(true)}
                  className="shrink-0 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Item
                </button>
              </div>
            )}

            {/* Scrollable Order Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {editError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-sm text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-text-secondary font-medium pb-1 border-b border-border">
                <span>Ordered Dishes ({editItems.reduce((s, i) => s + i.quantity, 0)} total)</span>
                <span>Price & Quantity</span>
              </div>

              {editItems.length === 0 ? (
                <div className="py-8 text-center bg-bg-primary rounded-sm border border-dashed border-border">
                  <Utensils className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-sm font-medium text-text-primary">No dishes on this ticket</p>
                  <p className="text-xs text-text-muted mb-3">Add items from the menu to populate this order.</p>
                  <button
                    type="button"
                    onClick={() => setIsAddMenuModalOpen(true)}
                    className="px-4 py-2 bg-text-primary text-bg-primary text-xs font-medium rounded-sm hover:bg-text-primary/90 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Browse Menu to Add Dishes
                  </button>
                </div>
              ) : (
                editItems.map((item) => {
                  const isNewItem = !(editingOrder.items || []).some((orig) => orig.id === item.id);

                  return (
                    <div
                      key={item.cartItemId}
                      className={`flex items-center justify-between p-3 rounded-sm border transition-colors ${
                        isNewItem
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-bg-primary border-border'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-12 h-12 rounded-sm object-cover border border-border shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-sm bg-bg-secondary flex items-center justify-center text-text-muted shrink-0">
                            <Utensils className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary block truncate">
                              {item.name}
                            </span>
                            {isNewItem && (
                              <span className="text-xs text-emerald-700 font-medium shrink-0">
                                · Added
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono tabular-nums text-text-muted">
                            {formatCurrency(item.price)} each
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Stepper */}
                        <div className="flex items-center gap-1 bg-white border border-border rounded-sm p-0.5">
                          <button
                            type="button"
                            disabled={isEditingSessionClosed}
                            onClick={() => handleUpdateItemQuantity(item.cartItemId, item.quantity - 1)}
                            className="w-7 h-7 rounded-sm flex items-center justify-center hover:bg-bg-secondary text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-medium w-7 text-center font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isEditingSessionClosed}
                            onClick={() => handleUpdateItemQuantity(item.cartItemId, item.quantity + 1)}
                            className="w-7 h-7 rounded-sm flex items-center justify-center hover:bg-bg-secondary text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Line Total */}
                        <span className="text-sm font-mono tabular-nums font-medium text-text-primary w-20 text-end">
                          {formatCurrency(item.price * item.quantity)}
                        </span>

                        {/* Delete Button */}
                        <button
                          type="button"
                          disabled={isEditingSessionClosed}
                          onClick={() => handleRemoveItem(item.cartItemId)}
                          className="text-red-600 hover:text-red-700 p-1 rounded-sm hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Remove item from order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Kitchen Notes Input */}
              <div className="mt-4 pt-3 border-t border-border">
                <label className="text-xs font-medium text-text-secondary block mb-1.5">
                  Kitchen Instructions / Special Prep Note
                </label>
                <textarea
                  value={editNotes}
                  disabled={isEditingSessionClosed}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Extra spicy, dressing on the side, allergies, extra cutlery..."
                  rows={2}
                  className="w-full text-xs p-2.5 border border-border rounded-sm bg-bg-primary focus:outline-hidden focus:border-text-primary disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* Financial Calculation Summary */}
              <div className="bg-bg-primary p-4 rounded-sm border border-border space-y-2 text-xs mt-3">
                <div className="flex justify-between text-text-secondary">
                  <span>Order Subtotal</span>
                  <span className="font-mono tabular-nums font-medium text-text-primary">
                    {formatCurrency(calculateEditTotal())}
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Applicable GST (5% inclusive)</span>
                  <span className="font-mono tabular-nums text-text-muted">
                    {formatCurrency((calculateEditTotal() * 5) / 105)} (Included)
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Applicable Discounts</span>
                  <span className="font-mono tabular-nums text-text-muted">₹0.00</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between items-baseline text-sm">
                  <span className="font-medium text-text-primary">Final Grand Total</span>
                  <span className="font-mono tabular-nums font-semibold text-text-primary text-lg">
                    {formatCurrency(calculateEditTotal())}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-bg-primary flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={isEditingSessionClosed}
                onClick={() => setIsAddMenuModalOpen(true)}
                className="px-3.5 py-2 border border-border bg-white hover:bg-bg-secondary text-text-primary rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                Add More Dishes
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {editingOrder.status === 'pending' && !isEditingSessionClosed && (
                  <button
                    type="button"
                    onClick={() => handleRequestDeleteOrder(editingOrder)}
                    disabled={isSavingEdit}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Order
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEditingOrder(null);
                    setIsAddMenuModalOpen(false);
                  }}
                  disabled={isSavingEdit}
                  className="px-4 py-2 border border-border rounded-sm text-xs font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                >
                  {isEditingSessionClosed ? 'Close' : 'Cancel'}
                </button>

                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || editItems.length === 0 || isEditingSessionClosed}
                  className="px-4 py-2 bg-white border border-text-primary text-text-primary rounded-sm text-xs font-medium hover:bg-bg-secondary flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>

                {editingOrder.status === 'pending' && (
                  <button
                    type="button"
                    onClick={handleSaveAndConfirmEdit}
                    disabled={isSavingEdit || editItems.length === 0 || isEditingSessionClosed}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    {isSavingEdit ? 'Confirming...' : 'Save & Confirm Order'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu Selection Modal (Add New Items to Order) */}
      {isAddMenuModalOpen && editingOrder && (
        <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
          <div className="bg-white rounded-sm max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-border bg-[#FAF9F8] flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-text-primary flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-accent" />
                  Add Items to Order #{editingOrder.id}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Browse and select dishes from the restaurant menu. Items will be added directly to the customer tab.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMenuModalOpen(false)}
                className="text-text-muted hover:text-text-primary p-1.5 rounded hover:bg-border/30 transition-colors"
                title="Return to order review"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Category Filter Bar */}
            <div className="p-4 border-b border-border bg-white space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search dishes by name, description, or ingredients..."
                  value={menuSearchQuery}
                  onChange={(e) => setMenuSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 bg-bg-primary border border-border rounded-sm text-sm focus:outline-hidden focus:border-text-primary"
                />
                {menuSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMenuSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryTab('all')}
                  className={`px-3 py-1.5 rounded-sm font-medium shrink-0 transition-colors ${
                    selectedCategoryTab === 'all'
                      ? 'bg-text-primary text-bg-primary'
                      : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  All Dishes ({allMenuItems.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryTab(cat.id)}
                    className={`px-3 py-1.5 rounded-sm font-medium shrink-0 transition-colors ${
                      selectedCategoryTab === cat.id
                        ? 'bg-text-primary text-bg-primary'
                        : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {cat.name} ({cat.items ? cat.items.length : 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Ticket Snapshot Bar */}
            <div className="px-4 py-2 bg-bg-primary border-b border-border flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                Currently on Ticket: <strong className="font-mono tabular-nums text-text-primary">{editItems.reduce((s, i) => s + i.quantity, 0)} items</strong> ({editItems.length} distinct dishes)
              </span>
              <span className="font-medium text-text-primary">
                Total <span className="font-mono tabular-nums font-semibold text-accent">{formatCurrency(calculateEditTotal())}</span>
              </span>
            </div>

            {/* Menu Items List / Grid */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[52vh]">
              {filteredMenuItems.length === 0 ? (
                <div className="py-12 text-center text-text-muted">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No menu items match your search.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuSearchQuery('');
                      setSelectedCategoryTab('all');
                    }}
                    className="mt-2 text-xs text-accent font-medium underline"
                  >
                    Reset Search & Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredMenuItems.map((menuItem) => {
                    const existingItem = editItems.find((i) => i.id === menuItem.id);
                    const currentQty = existingItem ? existingItem.quantity : 0;
                    const isAvailable = menuItem.available !== false;

                    return (
                      <div
                        key={menuItem.id}
                        className={`p-3 rounded-sm border flex items-center justify-between gap-3 transition-colors ${
                          !isAvailable
                            ? 'bg-bg-secondary border-border opacity-60'
                            : currentQty > 0
                            ? 'bg-emerald-50/30 border-emerald-300'
                            : 'bg-white border-border hover:border-text-secondary/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {menuItem.image ? (
                            <img
                              src={menuItem.image}
                              alt={menuItem.name}
                              className="w-16 h-16 rounded-sm object-cover border border-border shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-sm bg-bg-secondary flex items-center justify-center text-text-muted shrink-0">
                              <Utensils className="w-6 h-6" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <span className="text-[11px] font-medium text-accent block truncate">
                              {menuItem.categoryName}
                            </span>
                            <h4 className="text-sm font-semibold text-text-primary leading-tight truncate">
                              {menuItem.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-mono tabular-nums font-medium text-text-primary">
                                {formatCurrency(menuItem.price)}
                              </span>
                              {menuItem.calories && (
                                <span className="text-[11px] font-mono tabular-nums text-text-muted">
                                  · {menuItem.calories} kcal
                                </span>
                              )}
                            </div>
                            {menuItem.tags && menuItem.tags.length > 0 && (
                              <p className="text-[11px] text-text-muted mt-0.5 truncate">
                                {menuItem.tags.slice(0, 2).map((t) => t.label).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          {!isAvailable ? (
                            <span className="text-xs font-medium text-red-700">
                              Out of Stock
                            </span>
                          ) : currentQty > 0 ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1 bg-white border border-emerald-300 rounded-sm p-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleSetMenuItemQuantityInOrder(menuItem.id, currentQty - 1, menuItem)}
                                  className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-emerald-50 text-emerald-900"
                                  title="Decrease"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-xs font-medium w-6 text-center font-mono tabular-nums text-emerald-900">
                                  {currentQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddMenuItemToOrder(menuItem, 1)}
                                  className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-emerald-50 text-emerald-900"
                                  title="Add one more"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> On tab
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddMenuItemToOrder(menuItem, 1)}
                              className="px-3.5 py-1.5 bg-text-primary hover:bg-text-primary/90 text-bg-primary rounded-sm text-xs font-medium flex items-center gap-1 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-bg-primary flex items-center justify-between gap-3">
              <div className="text-xs text-text-secondary">
                <span>Selected: </span>
                <strong className="font-mono tabular-nums text-text-primary">
                  {editItems.reduce((s, i) => s + i.quantity, 0)} ({formatCurrency(calculateEditTotal())})
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setIsAddMenuModalOpen(false)}
                className="px-5 py-2 bg-text-primary hover:bg-text-primary/90 text-bg-primary rounded-sm text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Check className="w-4 h-4" />
                Done Adding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {deletingOrder && (
        <div className="fixed inset-0 z-70 bg-black/65 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-md w-full p-6 border border-border">
            <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
              <div className="flex items-center gap-2 text-red-700">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-serif text-xl font-semibold text-text-primary">Delete Pending Order</h3>
              </div>
              <button
                type="button"
                disabled={isDeletingOrder}
                onClick={() => setDeletingOrder(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-sm text-text-secondary">
                Are you sure you want to permanently delete Order{' '}
                <span className="font-mono tabular-nums font-semibold text-text-primary">#{deletingOrder.id}</span>? This order will be completely removed from the table session and excluded from the final bill.
              </p>

              {deleteError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-sm text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="bg-bg-primary p-4 rounded-sm border border-border space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Table</span>
                  <span className="font-medium text-text-primary">
                    {deletingOrder.tableName || (deletingOrder.tableId && deletingOrder.tableId !== 'COUNTER' ? `Table ${deletingOrder.tableId}` : 'Counter')}
                  </span>
                </div>
                {deletingOrder.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Customer</span>
                    <span className="font-mono tabular-nums text-text-primary">{maskPhone(deletingOrder.customerPhone)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 space-y-1">
                  {(deletingOrder.items || []).map((item) => (
                    <div key={item.cartItemId} className="flex justify-between">
                      <span className="text-text-primary">
                        <span className="font-mono tabular-nums">{item.quantity}×</span> {item.name}
                      </span>
                      <span className="font-mono tabular-nums text-text-secondary">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-sm font-medium text-text-primary">
                  <span>Order Total to Remove</span>
                  <span className="font-mono tabular-nums font-semibold text-red-700">{formatCurrency(deletingOrder.total)}</span>
                </div>
              </div>

              <p className="text-xs text-text-muted">
                Other orders placed at this table will remain unaffected. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingOrder(null)}
                disabled={isDeletingOrder}
                className="px-4 py-2 border border-border rounded-sm text-xs font-medium text-text-secondary hover:bg-bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOrder}
                disabled={isDeletingOrder}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-sm text-xs font-medium flex items-center gap-1.5 disabled:opacity-60"
              >
                {isDeletingOrder ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      <ReceiptModal receipt={receiptToPrint} onClose={() => setReceiptToPrint(null)} />
    </div>
  );
}
