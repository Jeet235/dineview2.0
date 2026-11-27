import React, { useState, useMemo, useEffect } from 'react';
import { useOrder, OrderStatus } from '../../context/OrderContext';
import { useTable } from '../../context/TableContext';
import { formatCurrency } from '../../utils/currency';
import { 
  Filter, 
  ArrowUpDown, 
  Calendar, 
  CalendarRange
} from 'lucide-react';
import { 
  DateFilterState, 
  DateFilterType, 
  SortOptionType, 
  filterOrdersByDate, 
  sortOrders, 
  getOrderCountsPerDay 
} from '../../utils/orderFilters';
import { maskPhone } from '../../services/customerService';
import { isPayableOrder } from '../../services/billingService';
import { revealOrderFullPhone } from '../../services/staffAuthService';
import { subscribeClosedSessionIds } from '../../services/sessionService';

const DATE_PRESETS: { id: DateFilterType; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 days' },
  { id: '30days', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
  { id: 'all', label: 'All Time' },
];

export default function OrderManager() {
  const { orders, updateOrderStatus } = useOrder();
  const { allTables } = useTable();

  // Date and Sort filter states
  const [dateFilter, setDateFilter] = useState<DateFilterState>({
    type: 'today',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [sortBy, setSortBy] = useState<SortOptionType>('newest');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [revealedPhones, setRevealedPhones] = useState<Record<string, string>>({});
  const [revealingPhoneId, setRevealingPhoneId] = useState<string | null>(null);
  const [phoneRevealError, setPhoneRevealError] = useState<Record<string, string>>({});
  const [closedSessionIds, setClosedSessionIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const unsubscribe = subscribeClosedSessionIds((ids) => {
      setClosedSessionIds(ids);
    });
    return () => unsubscribe();
  }, []);

  const handleToggleFullPhone = async (orderId: string, customerPhone?: string) => {
    if (revealedPhones[orderId]) {
      setRevealedPhones((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      return;
    }

    setRevealingPhoneId(orderId);
    setPhoneRevealError((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });

    try {
      const result = await revealOrderFullPhone(orderId, customerPhone);
      if (!result.ok || !result.fullPhone) {
        setPhoneRevealError((prev) => ({
          ...prev,
          [orderId]: result.error || 'Authorized staff access required.',
        }));
        return;
      }
      setRevealedPhones((prev) => ({ ...prev, [orderId]: result.fullPhone! }));
    } catch (err: any) {
      setPhoneRevealError((prev) => ({
        ...prev,
        [orderId]: err?.message || 'Authorized staff access required.',
      }));
    } finally {
      setRevealingPhoneId(null);
    }
  };

  const statuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];

  // Combine tables from table context and existing orders
  const availableTableIds = Array.from(
    new Set([
      ...allTables.map(t => t.id),
      ...orders.map(o => o.tableId).filter((id): id is string => Boolean(id && id !== 'COUNTER'))
    ])
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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

  // 1. Filter by Table
  const tableFiltered = useMemo(() => {
    return orders.filter((order) => {
      if (tableFilter === 'all') return true;
      if (tableFilter === 'COUNTER') {
        return !order.tableId || order.tableId === 'COUNTER';
      }
      return order.tableId === tableFilter;
    });
  }, [orders, tableFilter]);

  // 2. Filter by Date (applied to orders by createdAt)
  const dateFiltered = useMemo(() => {
    return filterOrdersByDate(tableFiltered, dateFilter);
  }, [tableFiltered, dateFilter]);

  // 3. Sort orders
  const sortedOrders = useMemo(() => {
    return sortOrders(dateFiltered, sortBy);
  }, [dateFiltered, sortBy]);

  // 4. Calculate counts per day
  const countsPerDay = useMemo(() => {
    return getOrderCountsPerDay(sortedOrders);
  }, [sortedOrders]);

  // Total sales for confirmed/payable filtered orders only (excludes pending and cancelled)
  const totalSales = useMemo(() => {
    return sortedOrders
      .filter((o) => isPayableOrder(o))
      .reduce((sum, o) => sum + o.total, 0);
  }, [sortedOrders]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-text-primary tracking-tight">
            Order Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Track, filter, and update dine-in table and counter orders in real time.
          </p>
        </div>

        {/* Controls: Table Filter & Sort Dropdown */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-border px-3 py-2 rounded-sm">
            <Filter className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <label htmlFor="table-filter" className="text-xs font-medium text-text-muted whitespace-nowrap">
              Table
            </label>
            <select
              id="table-filter"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="bg-transparent text-xs font-medium text-text-primary outline-none cursor-pointer"
            >
              <option value="all">All Tables ({orders.length})</option>
              <option value="COUNTER">Counter</option>
              {availableTableIds.map((tid) => {
                const matchedTable = allTables.find((t) => t.id === tid);
                const label = matchedTable ? `${matchedTable.name} (${tid})` : `Table ${tid}`;
                return (
                  <option key={tid} value={tid}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white border border-border px-3 py-2 rounded-sm">
            <ArrowUpDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <label htmlFor="sort-order" className="text-xs font-medium text-text-muted whitespace-nowrap">
              Sort
            </label>
            <select
              id="sort-order"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOptionType)}
              className="bg-transparent text-xs font-medium text-text-primary outline-none cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="total-high-low">Total High-Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white border border-border rounded-sm p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-text-muted flex items-center gap-1.5 me-2">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Range</span>
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
                      : 'bg-bg-primary text-text-secondary hover:text-text-primary border border-border'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Range Pickers */}
          {dateFilter.type === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 bg-bg-primary px-3 py-1.5 rounded-sm border border-border">
              <CalendarRange className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={dateFilter.startDate || ''}
                  onChange={(e) =>
                    setDateFilter(prev => ({ ...prev, startDate: e.target.value }))
                  }
                  className="bg-white border border-border px-2 py-1 rounded-sm text-xs font-mono text-text-primary outline-none focus:border-text-primary"
                  aria-label="Start Date"
                />
                <span className="text-text-muted">—</span>
                <input
                  type="date"
                  value={dateFilter.endDate || ''}
                  onChange={(e) =>
                    setDateFilter(prev => ({ ...prev, endDate: e.target.value }))
                  }
                  className="bg-white border border-border px-2 py-1 rounded-sm text-xs font-mono text-text-primary outline-none focus:border-text-primary"
                  aria-label="End Date"
                />
              </div>
            </div>
          )}
        </div>

        {/* Unboxed Summary Strip & Daily Breakdown */}
        <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
            <span className="font-mono tabular-nums font-medium text-text-primary">
              {sortedOrders.length} {sortedOrders.length === 1 ? 'order' : 'orders'}
            </span>
            <span className="text-text-muted" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-medium text-text-primary">
              {formatCurrency(totalSales)} payable
            </span>
            {tableFilter !== 'all' && (
              <>
                <span className="text-text-muted" aria-hidden="true">·</span>
                <span>Table {tableFilter}</span>
              </>
            )}
            {Object.keys(countsPerDay).length > 0 && (
              <>
                <span className="text-text-muted" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-text-muted">
                  {Object.entries(countsPerDay)
                    .map(([dateStr, count]) => `${dateStr}: ${count}`)
                    .join(' / ')}
                </span>
              </>
            )}
          </div>

          {(dateFilter.type !== 'today' || tableFilter !== 'all' || sortBy !== 'newest') && (
            <button
              type="button"
              onClick={() => {
                handleDatePresetClick('today');
                setTableFilter('all');
                setSortBy('newest');
              }}
              className="text-xs font-medium text-accent hover:text-text-primary transition-colors self-start sm:self-auto whitespace-nowrap"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-border rounded-sm overflow-hidden">
        {sortedOrders.length === 0 ? (
          <div className="p-12 text-center text-text-secondary">
            <p className="font-serif text-lg text-text-primary mb-1">No orders found</p>
            <p className="text-xs text-text-muted">
              {orders.length === 0 
                ? 'No orders have been recorded yet.' 
                : 'No orders matched the selected date and table filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-bg-primary border-b border-border text-xs font-medium text-text-muted">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Order ID</th>
                  <th className="px-5 py-3.5 font-medium">Seating</th>
                  <th className="px-5 py-3.5 font-medium">Date & Time</th>
                  <th className="px-5 py-3.5 font-medium">Items</th>
                  <th className="px-5 py-3.5 font-medium text-right">Total</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedOrders.map(order => {
                  const dateObj = new Date(order.createdAt);
                  const formattedDate = dateObj.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });
                  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={order.id} className="hover:bg-bg-primary/60 transition-colors">
                      <td className="px-5 py-3.5 align-top">
                        <span className="font-mono text-xs font-medium text-text-primary">#{order.id}</span>
                        {order.customerPhone && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex items-center gap-2 text-[11px] text-text-muted font-mono tabular-nums">
                              <span>
                                {revealedPhones[order.id] || maskPhone(order.customerPhone)}
                              </span>
                              <button
                                type="button"
                                disabled={revealingPhoneId === order.id}
                                onClick={() => handleToggleFullPhone(order.id, order.customerPhone)}
                                className="text-[11px] font-sans text-accent hover:text-text-primary underline disabled:opacity-50"
                              >
                                {revealingPhoneId === order.id
                                  ? 'Verifying...'
                                  : revealedPhones[order.id]
                                  ? 'Hide'
                                  : 'Reveal'}
                              </button>
                            </div>
                            {phoneRevealError[order.id] && (
                              <span className="block text-[11px] text-red-600 font-sans">
                                {phoneRevealError[order.id]}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top whitespace-nowrap">
                        <div className="text-xs font-medium text-text-primary">
                          {order.tableId && order.tableId !== 'COUNTER' ? `Table ${order.tableId}` : 'Counter'}
                        </div>
                        {order.tableSessionId && (
                          <div className="text-[11px] font-mono text-text-muted mt-0.5">
                            Session #{order.tableSessionId.split('_').pop()?.substring(0, 4).toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top text-xs whitespace-nowrap font-mono tabular-nums">
                        <div className="text-text-primary">{formattedTime}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">{formattedDate}</div>
                      </td>
                      <td className="px-5 py-3.5 align-top text-xs text-text-secondary max-w-xs">
                        <div className="line-clamp-2 leading-relaxed">
                          {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top text-right text-xs font-mono tabular-nums font-medium text-text-primary whitespace-nowrap">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-5 py-3.5 align-top whitespace-nowrap">
                        {(() => {
                          const isOrderSessionClosed = Boolean(
                            order.tableSessionId && closedSessionIds.has(order.tableSessionId)
                          );
                          return (
                            <div className="flex flex-col items-start gap-1">
                              <select
                                value={order.status}
                                disabled={isOrderSessionClosed}
                                title={isOrderSessionClosed ? 'Session closed — order is locked' : 'Update order status'}
                                onChange={(e) => {
                                  if (isOrderSessionClosed) return;
                                  updateOrderStatus(order.id, e.target.value as OrderStatus).catch(console.error);
                                }}
                                className={`text-xs font-medium capitalize px-2.5 py-1.5 rounded-sm outline-none border bg-white ${
                                  isOrderSessionClosed ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                  order.status === 'completed' ? 'border-emerald-200 text-emerald-700' :
                                  order.status === 'cancelled' ? 'border-red-200 text-red-700' :
                                  order.status === 'ready' ? 'border-blue-200 text-blue-700' :
                                  'border-amber-200 text-amber-800'
                                }`}
                              >
                                {statuses.map(status => (
                                  <option key={status} value={status} className="bg-white text-text-primary">
                                    {status}
                                  </option>
                                ))}
                              </select>
                              {isOrderSessionClosed && (
                                <span className="text-[11px] text-text-muted">
                                  Session Closed
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
