import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  runTransaction, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Order } from '../context/OrderContext';
import { maskPhone } from './customerService';
import { isPayableOrder } from './billingService';

export interface TableSession {
  id: string;
  isSession?: boolean;
  shortId: string;
  tableId: string;
  tableName: string;
  status: 'active' | 'closed';
  startedAt: string; // ISO 8601
  endedAt: string | null;
  durationMinutes: number | null;
  totalAmount: number;
  itemsCount: number;
  orderIds: string[];
  createdByPhone: string | null;
  closedBy: string | null;
}

export function generateShortId(): string {
  // 4 uppercase alphanumeric characters e.g. B72A
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Retrieves the currently active session for a dining table, if one exists.
 * Queries the orders collection with isSession: true to adhere to deployed permissions.
 */
export async function getActiveSession(tableId: string): Promise<TableSession | null> {
  const cleanTableId = tableId ? tableId.trim().toUpperCase() : '';
  if (!cleanTableId || cleanTableId === 'COUNTER') return null;

  try {
    const q = query(
      collection(db, 'orders'),
      where('isSession', '==', true),
      where('tableId', '==', cleanTableId),
      where('status', '==', 'active')
    );
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const sessions: TableSession[] = [];
      querySnap.forEach((docSnap) => {
        sessions.push(docSnap.data() as TableSession);
      });
      // Deterministically pick the earliest started active session for this table
      sessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      return sessions[0];
    }

    return null;
  } catch (err) {
    console.warn(`[sessionService] getActiveSession notice for table ${cleanTableId}:`, err);
    return null;
  }
}

/**
 * Retrieves a session document by its ID (active or closed).
 */
export async function getSessionById(sessionId: string): Promise<TableSession | null> {
  if (!sessionId) return null;
  try {
    const snap = await getDoc(doc(db, 'orders', sessionId));
    if (snap.exists()) {
      return snap.data() as TableSession;
    }
    return null;
  } catch (err) {
    console.warn(`[sessionService] getSessionById failed for ${sessionId}:`, err);
    return null;
  }
}

/**
 * Ensures an active session exists for a table before an order is saved.
 * Skips counter/takeaway orders.
 */
export async function ensureSession(
  tableId: string, 
  tableName: string, 
  phone?: string
): Promise<TableSession | null> {
  const cleanTableId = tableId ? tableId.trim().toUpperCase() : '';
  if (!cleanTableId || cleanTableId === 'COUNTER') {
    return null;
  }

  console.log('[sessionService] ensureSession -> checking table:', cleanTableId);

  try {
    // 1. Check if an active session already exists for this table
    const existing = await getActiveSession(cleanTableId);
    if (existing) {
      console.log('[sessionService] ensureSession -> found active session for', cleanTableId, 'shortId:', existing.shortId);
      return existing;
    }

    // 2. Generate unique session ID and friendly shortId
    const sessionId = `sess_${cleanTableId}_${Date.now().toString(36)}`;
    const shortId = generateShortId();

    console.log('[sessionService] ensureSession -> creating new session for', cleanTableId, 'shortId:', shortId);

    const newSession: TableSession = {
      id: sessionId,
      isSession: true,
      shortId,
      tableId: cleanTableId,
      tableName: tableName ? tableName.trim() : `Table ${cleanTableId}`,
      status: 'active',
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMinutes: null,
      totalAmount: 0,
      itemsCount: 0,
      orderIds: [],
      createdByPhone: phone ? maskPhone(phone) : null,
      closedBy: null,
    };

    // Save session in orders collection (which is verified permitted in cloud rules)
    await setDoc(doc(db, 'orders', sessionId), newSession);

    // Also attempt to link table document if permitted
    try {
      const tableRef = doc(db, 'tables', cleanTableId);
      await setDoc(tableRef, { 
        id: cleanTableId, 
        name: tableName ? tableName.trim() : `Table ${cleanTableId}`, 
        active: true, 
        activeSessionId: sessionId 
      }, { merge: true });
    } catch (tblErr) {
      console.warn(`[sessionService] Note: table document pointer saved locally for ${cleanTableId}`);
    }

    return newSession;
  } catch (err: any) {
    console.error(`[sessionService] ensureSession error for table ${cleanTableId}:`, err?.code, err?.message, err?.stack);
    throw new Error(`[sessionService] ensureSession failed: ${err?.message || err}`);
  }
}

/**
 * Atomically links an order to a session.
 * Only confirmed/payable orders contribute to totalAmount and itemsCount;
 * pending orders are linked via orderIds and added to payable totals once confirmed.
 */
export async function addOrderToSession(
  sessionId: string,
  order: { id: string; total: number; itemsCount: number; status?: string }
): Promise<void> {
  if (!sessionId) return;

  try {
    await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, 'orders', sessionId);
      const sessionDoc = await transaction.get(sessionRef);

      if (!sessionDoc.exists()) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const current = sessionDoc.data() as TableSession;
      if (current.status === 'closed') {
        const closedErr: any = new Error(
          'This table session is closed. New items or orders cannot be added to a closed session.'
        );
        closedErr.code = 'SESSION_CLOSED';
        throw closedErr;
      }

      const orderIds = Array.isArray(current.orderIds) ? current.orderIds : [];
      const alreadyLinked = orderIds.includes(order.id);
      const updatedOrderIds = alreadyLinked ? orderIds : [...orderIds, order.id];

      const isConfirmedPayable = isPayableOrder({ status: order.status });
      const newTotal =
        !alreadyLinked && isConfirmedPayable
          ? Number((current.totalAmount || 0) + (order.total || 0))
          : Number(current.totalAmount || 0);
      const newItemsCount =
        !alreadyLinked && isConfirmedPayable
          ? Number((current.itemsCount || 0) + (order.itemsCount || 0))
          : Number(current.itemsCount || 0);

      transaction.update(sessionRef, {
        totalAmount: newTotal,
        itemsCount: newItemsCount,
        orderIds: updatedOrderIds,
      });
    });
    console.log('[sessionService] addOrderToSession -> linked order', order.id, 'to session', sessionId);
  } catch (err: any) {
    console.error(`[sessionService] addOrderToSession failed for session ${sessionId}, order ${order.id}:`, err?.code, err?.message);
    if (err?.code === 'SESSION_CLOSED') {
      throw err;
    }
    // Recalculate fallback (skips automatically if session is closed)
    recalcSessionTotal(sessionId).catch(console.error);
    throw new Error(`[sessionService] addOrderToSession failed: ${err?.message || err}`);
  }
}

/**
 * Closes an active table session transactionally:
 * Marks session closed, sets endedAt and durationMinutes, and clears table.activeSessionId.
 */
export async function closeSession(sessionId: string, managerId = 'Kitchen Manager'): Promise<void> {
  if (!sessionId) return;

  try {
    let tableIdToClear: string | null = null;

    await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, 'orders', sessionId);
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error(`Session ${sessionId} not found.`);
      }

      const sessionData = sessionSnap.data() as TableSession;
      if (sessionData.status === 'closed') {
        return; // Already closed
      }

      tableIdToClear = sessionData.tableId || null;
      const endedAt = new Date().toISOString();
      const startTime = new Date(sessionData.startedAt).getTime();
      const endTime = new Date(endedAt).getTime();
      const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));

      // Close session in orders collection
      transaction.update(sessionRef, {
        status: 'closed',
        endedAt,
        durationMinutes,
        closedBy: managerId,
      });
    });

    // Outside transaction, clear table pointer if possible (non-blocking)
    if (tableIdToClear && tableIdToClear !== 'COUNTER') {
      try {
        const tableRef = doc(db, 'tables', tableIdToClear);
        await updateDoc(tableRef, { activeSessionId: null });
      } catch {
        // Ignore if tables collection permissions are restricted in cloud
      }
    }
  } catch (err) {
    console.error(`Failed to close session ${sessionId}:`, err);
    throw err;
  }
}

/**
 * Recalculates payable totalAmount and itemsCount for a session by summing ONLY
 * confirmed and valid orders (preparing, ready, completed).
 * Pending, cancelled, and deleted orders are strictly excluded from payable totals.
 */
export async function recalcSessionTotal(
  sessionId: string
): Promise<{ totalAmount: number; itemsCount: number }> {
  if (!sessionId) return { totalAmount: 0, itemsCount: 0 };

  try {
    const sessionRef = doc(db, 'orders', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) {
      return { totalAmount: 0, itemsCount: 0 };
    }
    const existingSession = sessionSnap.data() as TableSession;
    // Never mutate a closed table session — preserve its finalized bill and history
    if (existingSession.status === 'closed') {
      return {
        totalAmount: Number(existingSession.totalAmount || 0),
        itemsCount: Number(existingSession.itemsCount || 0),
      };
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('tableSessionId', '==', sessionId)
    );
    const snap = await getDocs(ordersQuery);

    let totalAmount = 0;
    let itemsCount = 0;
    const orderIds: string[] = [];

    snap.forEach((docSnap) => {
      const order = docSnap.data();
      if (order.isSession) return; // Skip session header
      if (order.id) orderIds.push(order.id);
      
      // Only confirmed & valid orders contribute to the payable session bill
      if (isPayableOrder(order)) {
        totalAmount += Number(order.total || 0);
        if (Array.isArray(order.items)) {
          itemsCount += order.items.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
        }
      }
    });

    await updateDoc(sessionRef, {
      totalAmount,
      itemsCount,
      orderIds,
    });

    return { totalAmount, itemsCount };
  } catch (err) {
    console.error(`Failed to recalc session total for ${sessionId}:`, err);
    return { totalAmount: 0, itemsCount: 0 };
  }
}

/**
 * Real-time subscription to all currently active sessions.
 */
export function subscribeActiveSessions(callback: (sessions: TableSession[]) => void): () => void {
  const q = query(
    collection(db, 'orders'),
    where('isSession', '==', true),
    where('status', '==', 'active')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sessions: TableSession[] = [];
      snapshot.forEach((d) => {
        sessions.push(d.data() as TableSession);
      });
      // Sort by startedAt desc
      sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      callback(sessions);
    },
    (err) => {
      console.warn('[sessionService] subscribeActiveSessions notice:', err);
    }
  );
}

/**
 * Real-time subscription to closed table session IDs so staff UIs can reliably lock
 * closed-session orders against editing or adding items.
 */
export function subscribeClosedSessionIds(callback: (closedIds: Set<string>) => void): () => void {
  const q = query(
    collection(db, 'orders'),
    where('isSession', '==', true),
    where('status', '==', 'closed')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const ids = new Set<string>();
      snapshot.forEach((d) => {
        ids.add(d.id);
      });
      callback(ids);
    },
    (err) => {
      console.warn('[sessionService] subscribeClosedSessionIds notice:', err);
    }
  );
}

/**
 * Real-time subscription to the currently active session for a specific table.
 * Emits null when the table has no active session or once the session is closed.
 */
export function subscribeActiveSessionForTable(
  tableId: string,
  callback: (session: TableSession | null) => void
): () => void {
  const cleanTableId = tableId ? tableId.trim().toUpperCase() : '';
  if (!cleanTableId || cleanTableId === 'COUNTER') {
    callback(null);
    return () => {};
  }

  const q = query(
    collection(db, 'orders'),
    where('isSession', '==', true),
    where('tableId', '==', cleanTableId),
    where('status', '==', 'active')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      const sessions: TableSession[] = [];
      snapshot.forEach((d) => {
        sessions.push(d.data() as TableSession);
      });
      sessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      callback(sessions[0] || null);
    },
    (err) => {
      console.warn(`[sessionService] subscribeActiveSessionForTable notice for ${cleanTableId}:`, err);
      callback(null);
    }
  );
}

/**
 * Real-time subscription to ALL orders belonging to a specific table session.
 * Strictly scopes results to the matching tableSessionId (and tableId when provided)
 * so orders from other tables or sessions are never combined.
 */
export function subscribeSessionOrders(
  sessionId: string,
  callback: (orders: Order[]) => void,
  tableId?: string
): () => void {
  if (!sessionId) {
    callback([]);
    return () => {};
  }

  const normalizedTableId = tableId && tableId.trim() ? tableId.trim().toUpperCase() : '';

  const q = query(
    collection(db, 'orders'),
    where('tableSessionId', '==', sessionId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sessionOrders: Order[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        if (data.isSession || !Array.isArray(data.items)) return;
        if (data.tableSessionId !== sessionId) return;
        if (
          normalizedTableId &&
          normalizedTableId !== 'COUNTER' &&
          data.tableId &&
          String(data.tableId).trim().toUpperCase() !== normalizedTableId
        ) {
          return;
        }
        sessionOrders.push(data as Order);
      });

      // Chronological order (oldest first)
      sessionOrders.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      callback(sessionOrders);
    },
    (err) => {
      console.warn(`[sessionService] subscribeSessionOrders notice for ${sessionId}:`, err);
    }
  );
}

/**
 * Fetches all sessions with optional status and date filters.
 */
export async function fetchSessionHistory(filter?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  tableId?: string;
}): Promise<TableSession[]> {
  try {
    const q = query(
      collection(db, 'orders'),
      where('isSession', '==', true),
      limit(150)
    );
    const snap = await getDocs(q);
    let sessions: TableSession[] = [];

    snap.forEach((d) => {
      sessions.push(d.data() as TableSession);
    });

    sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (filter) {
      if (filter.status && filter.status !== 'all') {
        sessions = sessions.filter((s) => s.status === filter.status);
      }
      if (filter.tableId && filter.tableId !== 'all') {
        sessions = sessions.filter((s) => s.tableId === filter.tableId);
      }
      if (filter.startDate) {
        const start = new Date(filter.startDate).getTime();
        sessions = sessions.filter((s) => new Date(s.startedAt).getTime() >= start);
      }
      if (filter.endDate) {
        // End of day
        const end = new Date(filter.endDate).getTime() + 86400000;
        sessions = sessions.filter((s) => new Date(s.startedAt).getTime() <= end);
      }
    }

    return sessions;
  } catch (err) {
    console.error('Failed to fetch session history:', err);
    return [];
  }
}
