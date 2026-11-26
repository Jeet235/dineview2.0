import React from 'react';
import { X, Printer, Download, AlertCircle, Clock } from 'lucide-react';
import { ReceiptData } from '../services/billingService';
import { formatCurrency } from '../utils/currency';
import { maskPhone } from '../services/customerService';

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
  maskGuestPhones?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const isManagerBill = receipt.billType === 'CONSOLIDATED_SESSION';

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dateStr;
    }
  };

  const handleDownloadReceipt = () => {
    const lines: string[] = [
      receipt.restaurant.name.toUpperCase(),
      receipt.restaurant.tagline,
      `${receipt.restaurant.address}, ${receipt.restaurant.city}`,
      `Phone: ${receipt.restaurant.phone} | ${receipt.restaurant.email}`,
      `${receipt.restaurant.gstNumber} | ${receipt.restaurant.fssaiNumber}`,
      '----------------------------------------',
      receipt.title,
      receipt.subtitle,
      '----------------------------------------',
      `Table: ${receipt.tableName}`,
      `Session ID: #${receipt.sessionShortId} (${receipt.sessionId})`,
      `Session Started: ${formatDate(receipt.startedAt)}`,
    ];

    if (receipt.endedAt) lines.push(`Session Closed: ${formatDate(receipt.endedAt)}`);
    if (receipt.durationMinutes) lines.push(`Seated Duration: ${receipt.durationMinutes} minutes`);
    if (receipt.closedBy) lines.push(`Settled By: ${receipt.closedBy}`);
    if (receipt.customerPhone) lines.push(`Customer Mobile: ${maskPhone(receipt.customerPhone)}`);
    lines.push(`Payment Status: ${receipt.paymentStatus}`);
    lines.push('----------------------------------------');
    lines.push('CONFIRMED PAYABLE ITEMS:');

    if (receipt.consolidatedItems.length === 0) {
      lines.push('  (No confirmed payable items)');
    } else {
      receipt.consolidatedItems.forEach((item) => {
        lines.push(`  ${item.quantity}x ${item.name} @ ${formatCurrency(item.price)} = ${formatCurrency(item.total)}`);
      });
    }

    lines.push('----------------------------------------');
    lines.push(`CONFIRMED ORDER TICKETS (${receipt.orders.length}):`);
    receipt.orders.forEach((ord) => {
      const guestTag = ord.customerPhone ? ` | Guest: ${maskPhone(ord.customerPhone)}` : '';
      lines.push(`  Ticket #${ord.id} [${ord.status.toUpperCase()}]${guestTag} - ${formatCurrency(ord.total)}`);
    });

    if (receipt.pendingOrders && receipt.pendingOrders.length > 0) {
      lines.push('----------------------------------------');
      lines.push('PENDING ORDERS (EXCLUDED FROM PAYABLE BILL):');
      receipt.pendingOrders.forEach((pend) => {
        lines.push(`  Ticket #${pend.id} [PENDING] - Excluded (₹0)`);
      });
    }

    if (receipt.cancelledOrders && receipt.cancelledOrders.length > 0) {
      lines.push('----------------------------------------');
      lines.push('CANCELLED ORDERS (EXCLUDED FROM BILL):');
      receipt.cancelledOrders.forEach((canc) => {
        lines.push(`  Ticket #${canc.id} [CANCELLED] - Excluded (₹0)`);
      });
    }

    lines.push('----------------------------------------');
    lines.push(`Subtotal: ${formatCurrency(receipt.subtotal)}`);
    lines.push(`${receipt.taxLabel}: Inclusive`);
    lines.push(`${receipt.discountLabel}: ${formatCurrency(receipt.discountAmount)}`);
    lines.push(`FINAL GRAND TOTAL: ${formatCurrency(receipt.grandTotal)}`);
    lines.push('----------------------------------------');
    lines.push('Thank you for dining with DineView!');
    lines.push(`Generated: ${formatDate(receipt.printedAt)}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DineView-Bill-${receipt.tableId}-${receipt.sessionShortId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-sm max-w-xl w-full my-auto shadow-2xl border border-neutral-300 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Control Bar (Screen only, hidden on print) */}
        <div className="no-print p-4 border-b border-border bg-[#FBF9F7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
              {isManagerBill ? 'Consolidated Table Session Bill' : 'Your Individual Bill'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadReceipt}
              className="bg-white border border-border hover:bg-neutral-50 text-text-primary px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
              title="Download receipt with masked customer numbers"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="bg-text-primary hover:bg-black text-white px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Bill</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-text-secondary hover:text-text-primary rounded-sm transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#FAF9F6]">
          <div 
            id="receipt-print-area" 
            className="bg-white border border-neutral-200 p-6 sm:p-8 rounded-sm shadow-xs max-w-md mx-auto text-black font-sans leading-tight text-xs"
          >
            {/* Restaurant Brand Header */}
            <div className="text-center pb-4 border-b border-dashed border-neutral-400">
              <h2 className="text-2xl font-serif font-extrabold tracking-tight text-black uppercase mb-1">
                {receipt.restaurant.name}
              </h2>
              <p className="text-[11px] font-serif italic text-neutral-600 mb-1">
                {receipt.restaurant.tagline}
              </p>
              <p className="text-[10px] text-neutral-600">
                {receipt.restaurant.address}, {receipt.restaurant.city}
              </p>
              <p className="text-[10px] text-neutral-600">
                Phone: {receipt.restaurant.phone} | {receipt.restaurant.email}
              </p>
              <div className="mt-1 flex items-center justify-center gap-3 text-[9px] text-neutral-500 font-mono">
                <span>{receipt.restaurant.gstNumber}</span>
                <span>•</span>
                <span>{receipt.restaurant.fssaiNumber}</span>
              </div>
            </div>

            {/* Receipt Type Banner */}
            <div className="my-3 py-1.5 px-2 bg-neutral-100 border border-neutral-300 text-center rounded-xs">
              <span className="font-bold uppercase tracking-widest text-[11px] block text-black">
                {receipt.title}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-neutral-600 block">
                {receipt.subtitle}
              </span>
            </div>

            {/* Session & Table Metadata */}
            <div className="py-2.5 border-b border-dashed border-neutral-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-neutral-600">Table:</span>
                <span className="font-bold text-black">{receipt.tableName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Table Session ID:</span>
                <span className="font-mono font-bold text-black">
                  #{receipt.sessionShortId}
                  <span className="text-[9px] text-neutral-400 ms-1 font-normal">({receipt.sessionId})</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Session Started:</span>
                <span className="font-medium text-black">{formatDate(receipt.startedAt)}</span>
              </div>
              {receipt.endedAt && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Session Closed:</span>
                  <span className="font-medium text-black">{formatDate(receipt.endedAt)}</span>
                </div>
              )}
              {receipt.durationMinutes && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Seated Duration:</span>
                  <span className="font-medium text-black">{receipt.durationMinutes} minutes</span>
                </div>
              )}
              {receipt.closedBy && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Settled By:</span>
                  <span className="font-medium text-black">{receipt.closedBy}</span>
                </div>
              )}
              {receipt.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Customer Mobile:</span>
                  <span className="font-mono font-semibold text-black">{maskPhone(receipt.customerPhone)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-neutral-600">Payment Status:</span>
                <span className="font-bold text-emerald-800 uppercase text-[10px] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  {receipt.paymentStatus}
                </span>
              </div>
            </div>

            {/* Consolidated Itemized Summary Table */}
            <div className="py-3 border-b border-dashed border-neutral-300">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-700 mb-2">
                {isManagerBill ? 'Confirmed Payable Menu Items' : 'Your Ordered Items'}
              </div>

              {receipt.consolidatedItems.length === 0 ? (
                <p className="text-[11px] text-neutral-500 italic py-2 text-center">
                  No confirmed payable orders yet.
                </p>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-neutral-300 text-[10px] text-neutral-600 font-bold uppercase tracking-wider">
                      <th className="pb-1.5 text-left">Item</th>
                      <th className="pb-1.5 text-center w-10">Qty</th>
                      <th className="pb-1.5 text-right w-16">Price</th>
                      <th className="pb-1.5 text-right w-18">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {receipt.consolidatedItems.map((item) => (
                      <tr key={item.cartItemId || item.name} className="py-1">
                        <td className="py-1.5 text-left font-medium text-black pr-2">
                          {item.name}
                        </td>
                        <td className="py-1.5 text-center font-mono text-neutral-800">
                          {item.quantity}
                        </td>
                        <td className="py-1.5 text-right font-mono text-neutral-600">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="py-1.5 text-right font-mono font-bold text-black">
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Order Tickets Breakdown (Shows confirmed payable order IDs and timestamps) */}
            <div className="py-3 border-b border-dashed border-neutral-300">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-700 mb-2">
                {isManagerBill ? `Confirmed Session Sub-Orders (${receipt.orders.length})` : `Your Order Tickets (${receipt.orders.length})`}
              </div>

              {receipt.orders.length === 0 ? (
                <p className="text-[10px] text-neutral-500 italic">
                  Pending orders will appear in the payable bill once confirmed by the manager.
                </p>
              ) : (
                <div className="space-y-2">
                  {receipt.orders.map((ord) => (
                    <div key={ord.id} className="bg-neutral-50 p-2 rounded-xs border border-neutral-200 text-[10px]">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-black">Ticket #{ord.id}</span>
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-neutral-200/80 text-neutral-700">
                            {ord.status}
                          </span>
                        </div>
                        <span className="text-neutral-500">{formatDate(ord.createdAt)}</span>
                      </div>
                      {ord.customerPhone && (
                        <div className="text-[9px] text-neutral-600 mb-1 font-mono">
                          Guest: {maskPhone(ord.customerPhone)}
                        </div>
                      )}
                      <div className="space-y-0.5 text-neutral-700">
                        {ord.items.map((it) => (
                          <div key={it.cartItemId} className="flex justify-between">
                            <span>{it.quantity}x {it.name}</span>
                            <span className="font-mono">{formatCurrency(it.total)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 pt-1 border-t border-neutral-200 flex justify-between font-bold text-black">
                        <span>Ticket Subtotal:</span>
                        <span className="font-mono">{formatCurrency(ord.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Orders (Excluded from payable bill until confirmed) */}
            {receipt.pendingOrders && receipt.pendingOrders.length > 0 && (
              <div className="py-2.5 border-b border-dashed border-neutral-300 bg-amber-50/60 p-2 rounded-xs mt-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>Pending Confirmation (Excluded from Payable Bill)</span>
                </div>
                <div className="space-y-1 text-[10px] text-neutral-600">
                  {receipt.pendingOrders.map((pend) => (
                    <div key={pend.id} className="flex justify-between">
                      <span>Ticket #{pend.id} ({pend.items.length} items)</span>
                      <span className="text-amber-800 font-mono">Pending (₹0)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancelled Orders (if any, kept for transparency but excluded from total) */}
            {receipt.cancelledOrders && receipt.cancelledOrders.length > 0 && (
              <div className="py-2.5 border-b border-dashed border-neutral-300 bg-red-50/50 p-2 rounded-xs mt-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-800 mb-1">
                  <AlertCircle className="w-3 h-3 text-red-600" />
                  <span>Cancelled Orders (Excluded from Bill)</span>
                </div>
                <div className="space-y-1 text-[10px] text-neutral-600">
                  {receipt.cancelledOrders.map((canc) => (
                    <div key={canc.id} className="flex justify-between">
                      <span>Ticket #{canc.id} ({canc.items.length} items)</span>
                      <span className="text-red-700 font-mono line-through">{formatCurrency(canc.total)} (₹0)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals & Financial Calculations */}
            <div className="py-3 border-b border-dashed border-neutral-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-neutral-600">Subtotal:</span>
                <span className="font-mono font-medium text-black">
                  {formatCurrency(receipt.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>{receipt.taxLabel}:</span>
                <span className="font-mono">Inclusive</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>{receipt.discountLabel}:</span>
                <span className="font-mono">{formatCurrency(receipt.discountAmount)}</span>
              </div>
              <div className="pt-2 border-t border-neutral-400 flex justify-between items-baseline">
                <span className="text-sm font-bold uppercase tracking-wider text-black">
                  Final Grand Total:
                </span>
                <span className="text-xl font-serif font-black text-black">
                  {formatCurrency(receipt.grandTotal)}
                </span>
              </div>
            </div>

            {/* Receipt Footer & Barcode Simulation */}
            <div className="pt-4 text-center text-neutral-500 space-y-2">
              {/* Simulated barcode */}
              <div className="font-mono tracking-[0.3em] text-[10px] py-1 border-y border-neutral-200 text-neutral-800 font-bold">
                ||| | |||| | ||| |||| | || |||| |
              </div>
              <p className="text-[10px] font-serif italic text-neutral-700">
                Thank you for dining with DineView!
              </p>
              <p className="text-[9px] text-neutral-400">
                Printed: {formatDate(receipt.printedAt)} • Have a pleasant day
              </p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions (Screen only, hidden on print) */}
        <div className="no-print p-4 border-t border-border bg-[#FBF9F7] flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {isManagerBill ? 'Consolidated Master Session Bill' : 'Customer Individual Bill'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-sm text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-border/30 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleDownloadReceipt}
              className="px-4 py-2 border border-border bg-white rounded-sm text-xs font-bold uppercase tracking-wider text-text-primary hover:bg-neutral-50 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2 bg-text-primary hover:bg-black text-white rounded-sm text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Bill</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
