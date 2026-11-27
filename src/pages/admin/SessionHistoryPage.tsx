import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Calendar, 
  CalendarRange, 
  Filter, 
  Eye, 
  X, 
  RefreshCw,
  Printer
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { maskPhone } from '../../services/customerService';
import { TableSession, fetchSessionHistory } from '../../services/sessionService';
import { useOrder, Order } from '../../context/OrderContext';
import { useTable } from '../../context/TableContext';
import { DateFilterState, DateFilterType } from '../../utils/orderFilters';
import { ReceiptModal } from '../../components/ReceiptModal';
import { ReceiptData, buildConsolidatedSessionBill } from '../../services/billingService';

const DATE_PRESETS: { id: DateFilterType; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 days' },
  { id: '30days', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
  { id: 'all', label: 'All Time' },
];

export default function SessionHistoryPage() {
  const { orders } = useOrder();
  const { allTables } = useTable();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterState>({
    type: 'today',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // Modal inspecting sub-orders of a specific session
  const [inspectSession, setInspectSession] = useState<TableSession | null>(null);
  const [receiptToPrint, setReceiptToPrint] = useState<ReceiptData | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await fetchSessionHistory();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
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

  // Combine tables for filter
  const availableTableIds = useMemo(() => {
    const ids = new Set<string>();
    allTables.forEach(t => ids.add(t.id));
    sessions.forEach(s => {
      if (s.tableId && s.tableId !== 'COUNTER') ids.add(s.tableId);
    });
    return Array.from(ids).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allTables, sessions]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // 1. Status filter
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;

      // 2. Table filter
      if (tableFilter !== 'all' && s.tableId !== tableFilter) return false;

      // 3. Date filter
      if (dateFilter.type !== 'all' && s.startedAt) {
        const sessionTime = new Date(s.startedAt).getTime();
        if (dateFilter.startDate) {
          const startTime = new Date(dateFilter.startDate).getTime();
          if (sessionTime < startTime) return false;
        }
        if (dateFilter.endDate) {
          const endTime = new Date(dateFilter.endDate).getTime() + 86400000;
          if (sessionTime > endTime) return false;
        }
      }

      return true;
    });
  }, [sessions, statusFilter, tableFilter, dateFilter]);

  // Aggregate stats
  const totalSales = useMemo(() => {
    return filteredSessions.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [filteredSessions]);

  const activeCount = useMemo(() => {
    return filteredSessions.filter(s => s.status === 'active').length;
  }, [filteredSessions]);

  const avgDurationMins = useMemo(() => {
    const closedSessions = filteredSessions.filter(s => s.durationMinutes && s.durationMinutes > 0);
    if (closedSessions.length === 0) return 0;
    const sum = closedSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    return Math.round(sum / closedSessions.length);
  }, [filteredSessions]);

  // Orders linked to inspected session
  const inspectOrders = useMemo(() => {
    if (!inspectSession) return [];
    return orders.filter(o => o.tableSessionId === inspectSession.id);
  }, [inspectSession, orders]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-text-primary tracking-tight">
            Shared Table Sessions
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Audit log of shared table sessions, consolidated tabs, and dining durations.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSessions}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-border rounded-sm text-xs font-medium text-text-secondary hover:text-text-primary hover:border-text-primary transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Log</span>
        </button>
      </div>

      {/* Flat 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-border rounded-sm divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="p-5">
          <span className="text-xs font-medium text-text-muted block mb-1.5">Filtered Sessions</span>
          <span className="text-2xl font-mono tabular-nums font-medium text-text-primary">
            {filteredSessions.length}
          </span>
        </div>

        <div className="p-5">
          <span className="text-xs font-medium text-text-muted block mb-1.5">Active Tables</span>
          <span className={`text-2xl font-mono tabular-nums font-medium ${activeCount > 0 ? 'text-emerald-700' : 'text-text-primary'}`}>
            {activeCount}
          </span>
        </div>

        <div className="p-5">
          <span className="text-xs font-medium text-text-muted block mb-1.5">Avg Seated Duration</span>
          <span className="text-2xl font-mono tabular-nums font-medium text-text-primary">
            {avgDurationMins > 0 ? `${avgDurationMins} min` : '—'}
          </span>
        </div>

        <div className="p-5">
          <span className="text-xs font-medium text-text-muted block mb-1.5">Consolidated Revenue</span>
          <span className="text-2xl font-mono tabular-nums font-medium text-accent">
            {formatCurrency(totalSales)}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-border rounded-sm p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-muted me-2">Status</span>
            {(['all', 'active', 'closed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-sm text-xs font-medium capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-text-primary text-bg-primary'
                    : 'bg-bg-primary text-text-secondary hover:text-text-primary border border-border'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs font-medium text-text-muted">Table</span>
            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="bg-bg-primary border border-border rounded-sm px-3 py-1.5 text-xs font-medium text-text-primary focus:outline-none focus:border-text-primary"
            >
              <option value="all">All Tables</option>
              {availableTableIds.map((tid) => (
                <option key={tid} value={tid}>Table {tid}</option>
              ))}
            </select>
          </div>
        </div>

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

        {dateFilter.type === 'custom' && (
          <div className="pt-3 border-t border-border flex flex-wrap items-center gap-4 text-xs">
            <span className="text-text-muted font-medium flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" /> Date Bounds
            </span>
            <div className="flex items-center gap-2">
              <label className="text-text-secondary">From</label>
              <input
                type="date"
                value={dateFilter.startDate || ''}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                className="bg-bg-primary border border-border px-2.5 py-1 rounded-sm text-xs font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-text-secondary">To</label>
              <input
                type="date"
                value={dateFilter.endDate || ''}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))}
                className="bg-bg-primary border border-border px-2.5 py-1 rounded-sm text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Sessions Table */}
      <div className="bg-white border border-border rounded-sm overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="p-12 text-center text-text-secondary">
            <Users className="w-8 h-8 text-text-muted mx-auto mb-3" />
            <h3 className="font-serif text-lg text-text-primary mb-1">No Table Sessions Found</h3>
            <p className="text-xs text-text-muted">
              {loading ? 'Loading session records...' : 'Try adjusting the date range or status filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-bg-primary border-b border-border text-xs font-medium text-text-muted">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Session</th>
                  <th className="px-5 py-3.5 font-medium">Table</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 font-medium">Started</th>
                  <th className="px-5 py-3.5 font-medium">Duration</th>
                  <th className="px-5 py-3.5 font-medium text-right">Dishes</th>
                  <th className="px-5 py-3.5 font-medium text-right">Total</th>
                  <th className="px-5 py-3.5 font-medium">Host Phone</th>
                  <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredSessions.map((sess) => {
                  const startDate = new Date(sess.startedAt);
                  const isCurrentActive = sess.status === 'active';

                  return (
                    <tr key={sess.id} className="hover:bg-bg-primary/60 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-accent">
                        #{sess.shortId || sess.id.slice(-4).toUpperCase()}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-text-primary whitespace-nowrap">
                        {sess.tableName || `Table ${sess.tableId}`}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`font-medium capitalize ${isCurrentActive ? 'text-emerald-700' : 'text-text-muted'}`}>
                          {sess.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-text-primary">
                          {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums whitespace-nowrap">
                        {isCurrentActive ? (
                          <span className="text-amber-700 font-medium font-sans">Live Seated</span>
                        ) : sess.durationMinutes ? (
                          <span className="text-text-primary">{sess.durationMinutes} min</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-text-primary">
                        {sess.itemsCount}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-medium text-text-primary whitespace-nowrap">
                        {formatCurrency(sess.totalAmount)}
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary whitespace-nowrap font-mono tabular-nums">
                        {sess.createdByPhone ? maskPhone(sess.createdByPhone) : <span className="text-text-muted font-sans">Walk-in</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setInspectSession(sess)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium text-text-secondary hover:text-text-primary hover:border-text-primary border border-border transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Orders</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Session Orders Modal */}
      {inspectSession && (
        <div className="fixed inset-0 z-50 bg-neutral-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-2xl w-full p-6 shadow-xl border border-border max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-4 border-b border-border mb-4">
              <div>
                <p className="text-xs font-mono text-accent mb-0.5">Session #{inspectSession.shortId}</p>
                <h3 className="font-serif text-xl font-medium text-text-primary">
                  {inspectSession.tableName} Breakdown
                </h3>
                <span className="text-xs font-mono text-text-muted">
                  Started {new Date(inspectSession.startedAt).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectSession(null)}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-sm"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Session Stats banner */}
            <div className="grid grid-cols-3 bg-bg-primary rounded-sm border border-border divide-x divide-border mb-4 text-xs">
              <div className="p-3">
                <span className="text-text-muted block mb-0.5">Total Tab</span>
                <span className="font-mono tabular-nums font-medium text-sm text-text-primary">
                  {formatCurrency(inspectSession.totalAmount)}
                </span>
              </div>
              <div className="p-3">
                <span className="text-text-muted block mb-0.5">Total Dishes</span>
                <span className="font-mono tabular-nums font-medium text-sm text-text-primary">
                  {inspectSession.itemsCount} items
                </span>
              </div>
              <div className="p-3">
                <span className="text-text-muted block mb-0.5">Duration</span>
                <span className="font-mono tabular-nums font-medium text-sm text-text-primary">
                  {inspectSession.durationMinutes ? `${inspectSession.durationMinutes} min` : 'Active'}
                </span>
              </div>
            </div>

            {/* Orders list in this session */}
            <div className="flex-1 overflow-y-auto space-y-3 pe-1">
              <span className="text-xs font-medium text-text-muted block">
                Sub-Orders Linked to this Session ({inspectOrders.length})
              </span>

              {inspectOrders.length === 0 ? (
                <div className="p-8 text-center border border-border rounded-sm">
                  <p className="text-xs text-text-muted">
                    Sub-orders are stored in the historical archive.
                  </p>
                </div>
              ) : (
                inspectOrders.map((order) => (
                  <div key={order.id} className="border border-border rounded-sm p-4 bg-bg-primary">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                        <span className="font-medium text-text-primary">#{order.id}</span>
                        <span className="text-text-muted">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-xs font-medium capitalize text-text-secondary">
                        {order.status}
                      </span>
                    </div>

                    <div className="space-y-1 mb-2 border-t border-border pt-2 text-xs">
                      {order.items.map((it) => (
                        <div key={it.cartItemId} className="flex justify-between">
                          <span className="text-text-primary">{it.quantity}x {it.name}</span>
                          <span className="font-mono tabular-nums text-text-secondary">
                            {formatCurrency(it.price * it.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-border pt-2 flex justify-between items-center text-xs font-medium text-text-primary">
                      <span>Sub-Order Total</span>
                      <span className="font-mono tabular-nums">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-border mt-4 flex items-center justify-between">
              <span className="text-xs text-text-muted">
                {inspectSession.status === 'closed' ? 'Closed Session Record' : 'Active Table Session'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectSession(null)}
                  className="px-4 py-2 border border-border rounded-sm text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const bill = buildConsolidatedSessionBill(inspectSession, inspectOrders);
                    setReceiptToPrint(bill);
                  }}
                  className="px-4 py-2 bg-text-primary text-bg-primary rounded-sm text-xs font-medium hover:bg-text-primary/90 flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Complete Bill</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      <ReceiptModal receipt={receiptToPrint} onClose={() => setReceiptToPrint(null)} />
    </div>
  );
}
