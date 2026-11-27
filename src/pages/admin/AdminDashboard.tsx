import React from 'react';
import { useOrder } from '../../context/OrderContext';
import { useMenu } from '../../context/MenuContext';
import { formatCurrency } from '../../utils/currency';
import { isPayableOrder } from '../../services/billingService';

const STATUS_TEXT_CLASS: Record<string, string> = {
  completed: 'text-emerald-700',
  cancelled: 'text-red-700',
  ready: 'text-blue-700',
  preparing: 'text-blue-700',
  pending: 'text-amber-700',
};

export default function AdminDashboard() {
  const { orders } = useOrder();
  const { categories } = useMenu();
  
  const todayOrders = orders.filter(
    (o) => new Date(o.createdAt).toDateString() === new Date().toDateString()
  );
  const todayRevenue = todayOrders
    .filter((o) => isPayableOrder(o))
    .reduce((sum, o) => sum + o.total, 0);
  const activeOrders = orders.filter((o) => o.status === 'pending' || o.status === 'preparing');
  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-serif font-medium text-text-primary tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Daily revenue summary, active kitchen workload, and recent order activity.
        </p>
      </div>
      
      {/* Flat 3-Column KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 bg-white border border-border rounded-sm divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-6">
          <p className="text-xs font-medium text-text-muted mb-2">Today's Revenue</p>
          <p className="text-2xl font-mono tabular-nums font-medium text-text-primary">
            {formatCurrency(todayRevenue)}
          </p>
          <p className="text-xs text-text-secondary mt-1 font-mono tabular-nums">
            {todayOrders.length} {todayOrders.length === 1 ? 'order' : 'orders'} today
          </p>
        </div>
        
        <div className="p-6">
          <p className="text-xs font-medium text-text-muted mb-2">Active Orders</p>
          <p className="text-2xl font-mono tabular-nums font-medium text-text-primary">
            {activeOrders.length}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Pending confirmation or preparing
          </p>
        </div>
        
        <div className="p-6">
          <p className="text-xs font-medium text-text-muted mb-2">Menu Catalog</p>
          <p className="text-2xl font-mono tabular-nums font-medium text-text-primary">
            {totalItems}
          </p>
          <p className="text-xs text-text-secondary mt-1 font-mono tabular-nums">
            Across {categories.length} categories
          </p>
        </div>
      </div>

      {/* Recent Activity Ledger */}
      <div className="bg-white border border-border rounded-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-baseline justify-between">
          <h2 className="text-lg font-serif font-medium text-text-primary">Recent Activity</h2>
          <span className="text-xs font-mono tabular-nums text-text-muted">
            Latest {Math.min(orders.length, 5)} of {orders.length}
          </span>
        </div>

        {orders.length === 0 ? (
          <p className="px-6 py-10 text-text-secondary text-sm text-center">No recent activity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-primary border-b border-border text-xs font-medium text-text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Order</th>
                  <th className="px-6 py-3 font-medium">Seating</th>
                  <th className="px-6 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id} className="hover:bg-bg-primary/60 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs font-medium text-text-primary">
                      #{order.id}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-text-secondary">
                      {order.tableId && order.tableId !== 'COUNTER' ? `Table ${order.tableId}` : 'Counter'}
                    </td>
                    <td className="px-6 py-3.5 font-mono tabular-nums text-xs text-text-secondary">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-xs">
                      <span className={`font-medium capitalize ${STATUS_TEXT_CLASS[order.status] || 'text-text-secondary'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono tabular-nums text-xs font-medium text-text-primary">
                      {formatCurrency(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
