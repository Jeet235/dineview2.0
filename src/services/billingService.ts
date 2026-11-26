import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order } from '../context/OrderContext';
import { TableSession } from './sessionService';
import { formatPhone, hashPhone, maskPhone } from './customerService';

/**
 * Only manager-confirmed and valid order statuses contribute to the payable table bill.
 * Pending (unconfirmed), cancelled, and deleted orders are strictly excluded.
 */
export const CONFIRMED_PAYABLE_STATUSES: ReadonlyArray<string> = [
  'preparing',
  'ready',
  'completed',
];

export function isPayableOrder(order: { status?: string } | null | undefined): boolean {
  return Boolean(order?.status && CONFIRMED_PAYABLE_STATUSES.includes(order.status));
}

export const RESTAURANT_DETAILS = {
  name: 'DineView Restaurant',
  tagline: 'Fine Dining & Gastronomy',
  address: '123 Culinary Ave, Food District',
  city: 'Mumbai, Maharashtra 400001',
  phone: '+91 22 5550 1928',
  email: 'reservations@dineview.com',
  gstNumber: 'GSTIN: 27AADCD1234F1Z5',
  fssaiNumber: 'FSSAI Lic: 11521001000456',
};

export interface ReceiptItem {
  cartItemId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  orderId?: string;
}

export interface ReceiptOrder {
  id: string;
  createdAt: string;
  customerPhone?: string;
  status: string;
  total: number;
  items: ReceiptItem[];
}

export interface ReceiptData {
  billType: 'CONSOLIDATED_SESSION' | 'INDIVIDUAL_CUSTOMER';
  title: string;
  subtitle: string;
  restaurant: typeof RESTAURANT_DETAILS;
  tableId: string;
  tableName: string;
  sessionId: string;
  sessionShortId: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  closedBy?: string | null;
  customerPhone?: string | null;
  orders: ReceiptOrder[];
  pendingOrders?: ReceiptOrder[];
  cancelledOrders?: ReceiptOrder[];
  consolidatedItems: ReceiptItem[];
  subtotal: number;
  taxLabel: string;
  taxAmount: number;
  discountLabel: string;
  discountAmount: number;
  grandTotal: number;
  paymentStatus: string;
  printedAt: string;
}

/**
 * Normalizes phone numbers consistently for comparison and lookup.
 * Strips whitespace, hyphens, parentheses, and standardizes to E.164.
 */
export function normalizePhone(raw?: string | null): string {
  if (!raw) return '';
  return formatPhone(raw);
}

/**
 * Checks whether two phone numbers represent the same customer,
 * accounting for formatting differences (+91, spaces, dashes).
 */
export function isSameCustomerPhone(phoneA?: string | null, phoneB?: string | null): boolean {
  if (!phoneA || !phoneB) return false;
  const normA = normalizePhone(phoneA);
  const normB = normalizePhone(phoneB);
  if (!normA || !normB) return false;
  return normA === normB;
}

/**
 * Fetches only orders belonging to the specified customer within a table session.
 * Enforces server-side filtering via Firestore queries, never returning other customers' orders.
 */
export async function fetchCustomerSessionOrders(
  sessionId: string,
  customerPhone?: string | null,
  currentOrderId?: string | null
): Promise<Order[]> {
  if (!sessionId) {
    if (currentOrderId) {
      try {
        const snap = await getDoc(doc(db, 'orders', currentOrderId));
        if (snap.exists()) {
          const ord = snap.data() as Order;
          return [ord];
        }
      } catch (err) {
        console.warn('[billingService] Could not fetch single order:', err);
      }
    }
    return [];
  }

  const matchedOrders: Order[] = [];
  const normalizedTargetPhone = normalizePhone(customerPhone);

  try {
    // 1. If we have a normalized customer phone, query all orders in this session matching this phone hash or legacy phone
    if (normalizedTargetPhone) {
      const targetHash = hashPhone(normalizedTargetPhone);
      if (targetHash) {
        const qHash = query(
          collection(db, 'orders'),
          where('tableSessionId', '==', sessionId),
          where('customerPhoneHash', '==', targetHash)
        );
        const snapHash = await getDocs(qHash);
        snapHash.forEach((d) => {
          const data = d.data() as any;
          if (!data.isSession && data.items && Array.isArray(data.items)) {
            if (!matchedOrders.some((o) => o.id === data.id)) {
              matchedOrders.push(data as Order);
            }
          }
        });
      }

      // Legacy fallback: query by normalized phone
      const qNorm = query(
        collection(db, 'orders'),
        where('tableSessionId', '==', sessionId),
        where('customerPhone', '==', normalizedTargetPhone)
      );
      const snapNorm = await getDocs(qNorm);
      snapNorm.forEach((d) => {
        const data = d.data() as any;
        if (!data.isSession && data.items && Array.isArray(data.items)) {
          if (!matchedOrders.some((o) => o.id === data.id)) {
            matchedOrders.push(data as Order);
          }
        }
      });

      // Also check if any legacy order was stored with the raw un-normalized phone string (if different)
      if (customerPhone && customerPhone.trim() !== normalizedTargetPhone) {
        const qRaw = query(
          collection(db, 'orders'),
          where('tableSessionId', '==', sessionId),
          where('customerPhone', '==', customerPhone.trim())
        );
        const snapRaw = await getDocs(qRaw);
        snapRaw.forEach((d) => {
          const data = d.data() as any;
          if (!data.isSession && data.items && Array.isArray(data.items)) {
            if (!matchedOrders.some((o) => o.id === data.id)) {
              matchedOrders.push(data as Order);
            }
          }
        });
      }
    }

    // 2. If no orders found via phone query or if customerPhone was empty/unregistered,
    // ensure at least the customer's own confirmed order (if provided) is included
    if (currentOrderId && !matchedOrders.some((o) => o.id === currentOrderId)) {
      try {
        const snap = await getDoc(doc(db, 'orders', currentOrderId));
        if (snap.exists()) {
          const ord = snap.data() as Order;
          if (!ord.tableSessionId || ord.tableSessionId === sessionId) {
            matchedOrders.push(ord);
          }
        }
      } catch (err) {
        console.warn('[billingService] Could not fetch fallback order:', err);
      }
    }

    // 3. Sort orders by creation time ascending
    matchedOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return matchedOrders;
  } catch (err) {
    console.error('[billingService] fetchCustomerSessionOrders error:', err);
    // Fallback: If query fails (e.g. offline/network), try fetching current order directly
    if (currentOrderId && matchedOrders.length === 0) {
      try {
        const snap = await getDoc(doc(db, 'orders', currentOrderId));
        if (snap.exists()) {
          return [snap.data() as Order];
        }
      } catch {}
    }
    return matchedOrders;
  }
}

/**
 * Builds the complete Consolidated Table Session Bill for Managers.
 * Aggregates all orders placed during that session.
 * Excludes cancelled orders from payable total, but includes them in cancelledOrders.
 */
export function buildConsolidatedSessionBill(
  session: TableSession,
  sessionOrders: Order[]
): ReceiptData {
  const payableOrders: ReceiptOrder[] = [];
  const pendingOrders: ReceiptOrder[] = [];
  const cancelledOrders: ReceiptOrder[] = [];
  const consolidatedMap: Record<string, ReceiptItem> = {};

  let subtotal = 0;

  sessionOrders.forEach((order) => {
    const isCancelled = order.status === 'cancelled';
    const isPending = order.status === 'pending';
    const isConfirmedPayable = isPayableOrder(order);

    const orderItems: ReceiptItem[] = (order.items || []).map((it) => {
      const lineTotal = it.price * it.quantity;
      return {
        cartItemId: it.cartItemId,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        total: lineTotal,
        orderId: order.id,
      };
    });

    const receiptOrder: ReceiptOrder = {
      id: order.id,
      createdAt: order.createdAt,
      customerPhone: order.customerPhone ? maskPhone(order.customerPhone) : undefined,
      status: order.status,
      total: order.total,
      items: orderItems,
    };

    if (isCancelled) {
      cancelledOrders.push(receiptOrder);
    } else if (isPending || !isConfirmedPayable) {
      pendingOrders.push(receiptOrder);
    } else {
      payableOrders.push(receiptOrder);
      subtotal += Number(order.total || 0);

      // Consolidate identical dish names across confirmed orders
      orderItems.forEach((it) => {
        const key = `${it.name}_${it.price}`;
        if (!consolidatedMap[key]) {
          consolidatedMap[key] = {
            cartItemId: it.cartItemId,
            name: it.name,
            quantity: 0,
            price: it.price,
            total: 0,
          };
        }
        consolidatedMap[key].quantity += it.quantity;
        consolidatedMap[key].total += it.total;
      });
    }
  });

  const consolidatedItems = Object.values(consolidatedMap);

  return {
    billType: 'CONSOLIDATED_SESSION',
    title: 'CONSOLIDATED TABLE SESSION BILL',
    subtitle: 'Official Restaurant Settlement Receipt',
    restaurant: RESTAURANT_DETAILS,
    tableId: session.tableId,
    tableName: session.tableName || `Table ${session.tableId}`,
    sessionId: session.id,
    sessionShortId: session.shortId,
    startedAt: session.startedAt,
    endedAt: session.endedAt || (session.status === 'closed' ? new Date().toISOString() : null),
    durationMinutes: session.durationMinutes,
    closedBy: session.status === 'closed' ? (session.closedBy || 'Kitchen Supervisor') : null,
    orders: payableOrders,
    pendingOrders: pendingOrders.length > 0 ? pendingOrders : undefined,
    cancelledOrders: cancelledOrders.length > 0 ? cancelledOrders : undefined,
    consolidatedItems,
    subtotal,
    taxLabel: 'Taxes & GST (5%)',
    taxAmount: 0, // Inclusive as per Dineview pricing
    discountLabel: 'Discount',
    discountAmount: 0,
    grandTotal: subtotal,
    paymentStatus: session.status === 'closed' ? 'Settled & Closed' : 'Active Tab — Pay at Counter',
    printedAt: new Date().toISOString(),
  };
}

/**
 * Builds the Individual Customer Bill for a Customer.
 * Contains ONLY the customer's own orders and individual total.
 * Excludes cancelled orders from payable total.
 */
export function buildCustomerIndividualBill(
  session: TableSession | null,
  customerOrders: Order[],
  customerPhone?: string | null
): ReceiptData {
  const payableOrders: ReceiptOrder[] = [];
  const pendingOrders: ReceiptOrder[] = [];
  const cancelledOrders: ReceiptOrder[] = [];
  const consolidatedMap: Record<string, ReceiptItem> = {};

  let subtotal = 0;

  customerOrders.forEach((order) => {
    const isCancelled = order.status === 'cancelled';
    const isPending = order.status === 'pending';
    const isConfirmedPayable = isPayableOrder(order);

    const orderItems: ReceiptItem[] = (order.items || []).map((it) => {
      const lineTotal = it.price * it.quantity;
      return {
        cartItemId: it.cartItemId,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        total: lineTotal,
        orderId: order.id,
      };
    });

    const receiptOrder: ReceiptOrder = {
      id: order.id,
      createdAt: order.createdAt,
      customerPhone: order.customerPhone ? maskPhone(order.customerPhone) : undefined,
      status: order.status,
      total: order.total,
      items: orderItems,
    };

    if (isCancelled) {
      cancelledOrders.push(receiptOrder);
    } else if (isPending || !isConfirmedPayable) {
      pendingOrders.push(receiptOrder);
    } else {
      payableOrders.push(receiptOrder);
      subtotal += Number(order.total || 0);

      // Consolidate identical dishes for this customer
      orderItems.forEach((it) => {
        const key = `${it.name}_${it.price}`;
        if (!consolidatedMap[key]) {
          consolidatedMap[key] = {
            cartItemId: it.cartItemId,
            name: it.name,
            quantity: 0,
            price: it.price,
            total: 0,
          };
        }
        consolidatedMap[key].quantity += it.quantity;
        consolidatedMap[key].total += it.total;
      });
    }
  });

  const consolidatedItems = Object.values(consolidatedMap);
  const firstOrder = customerOrders[0];
  const tableId = session?.tableId || firstOrder?.tableId || 'COUNTER';
  const tableName = session?.tableName || firstOrder?.tableName || (tableId === 'COUNTER' ? 'Counter' : `Table ${tableId}`);
  const resolvedPhone = maskPhone(customerPhone || firstOrder?.customerPhone);

  return {
    billType: 'INDIVIDUAL_CUSTOMER',
    title: 'INDIVIDUAL GUEST RECEIPT',
    subtitle: 'Guest Itemized Dining Bill',
    restaurant: RESTAURANT_DETAILS,
    tableId,
    tableName,
    sessionId: session?.id || firstOrder?.tableSessionId || 'N/A',
    sessionShortId: session?.shortId || (firstOrder?.tableSessionId ? firstOrder.tableSessionId.slice(-4).toUpperCase() : 'N/A'),
    startedAt: session?.startedAt || firstOrder?.createdAt || new Date().toISOString(),
    endedAt: session?.endedAt || null,
    durationMinutes: session?.durationMinutes || null,
    customerPhone: resolvedPhone || null,
    orders: payableOrders,
    pendingOrders: pendingOrders.length > 0 ? pendingOrders : undefined,
    cancelledOrders: cancelledOrders.length > 0 ? cancelledOrders : undefined,
    consolidatedItems,
    subtotal,
    taxLabel: 'Taxes & GST (5%)',
    taxAmount: 0, // Inclusive as per Dineview pricing
    discountLabel: 'Discount',
    discountAmount: 0,
    grandTotal: subtotal,
    paymentStatus: session?.status === 'closed' || firstOrder?.status === 'completed' ? 'Paid / Settled' : 'Pending at Counter',
    printedAt: new Date().toISOString(),
  };
}
