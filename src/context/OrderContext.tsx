import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CartItem } from './CartContext';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, getDoc } from 'firebase/firestore';
import { ensureSession, addOrderToSession, recalcSessionTotal, getSessionById } from '../services/sessionService';
import { maskPhone, hashPhone } from '../services/customerService';
import { protectOrderPhone } from '../services/staffAuthService';

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  tableId?: string;
  tableName?: string;
  tableSessionId?: string;
  customerPhone?: string;
  customerPhoneHash?: string;
  hasProtectedPhone?: boolean;
  phoneVerified?: boolean;
  guestUid?: string;
  managerConfirmed?: boolean;
  managerConfirmedAt?: string;
  managerConfirmedBy?: string;
  kitchenNotes?: string;
}

interface OrderContextType {
  orders: Order[];
  placeOrder: (
    items: CartItem[],
    total: number,
    tableId?: string,
    tableName?: string,
    customerPhone?: string
  ) => Promise<string>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  updateOrderItems: (
    orderId: string,
    items: CartItem[],
    total: number,
    kitchenNotes?: string
  ) => Promise<void>;
  confirmOrder: (
    orderId: string,
    managerName?: string,
    kitchenNotes?: string
  ) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  getOrderById: (orderId: string) => Order | undefined;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const location = useLocation();

  useEffect(() => {
    // Subscribe to the global orders list if we are in admin or manager sections
    const isStaffSection = location.pathname.startsWith('/admin') || location.pathname.startsWith('/manager');
    if (!isStaffSection) {
      setOrders([]); // Clear memory when leaving staff areas
      return;
    }

    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders: Order[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          if (!data.isSession && data.items && Array.isArray(data.items)) {
            fetchedOrders.push(data as Order);
          }
        });
        setOrders(fetchedOrders);
      },
      (error) => {
        console.error('Failed to subscribe to orders collection:', error);
      }
    );

    return () => unsubscribe();
  }, [location.pathname]);

  const placeOrder = async (
    items: CartItem[],
    total: number,
    tableId?: string,
    tableName?: string,
    customerPhone?: string
  ): Promise<string> => {
    try {
      // 1. Validate cart inputs
      if (!items || items.length === 0) {
        const err: any = new Error('Your cart is empty. Please add menu items before ordering.');
        err.code = 'CART_EMPTY';
        throw err;
      }

      if (typeof total !== 'number' || total <= 0) {
        const err: any = new Error('Invalid order total.');
        err.code = 'INVALID_TOTAL';
        throw err;
      }

      // 2. Validate inputs before session
      const resolvedTableId = tableId && tableId.trim() ? tableId.trim().toUpperCase() : 'COUNTER';
      const resolvedTableName = tableName && tableName.trim()
        ? tableName.trim()
        : (resolvedTableId === 'COUNTER' ? 'Counter' : `Table ${resolvedTableId}`);

      const orderId = Math.random().toString(36).substring(2, 9).toUpperCase();
      const createdAt = new Date().toISOString();
      const rawPhone = customerPhone ? customerPhone.trim() : '';

      // Protect customer mobile number before writing to Firestore:
      // Never store raw unmasked phone numbers in shared order or session documents.
      let maskedCustomerPhone = '';
      let customerPhoneHash = '';
      let encryptedPhone = '';

      if (rawPhone) {
        try {
          const protectedData = await protectOrderPhone(orderId, rawPhone);
          maskedCustomerPhone = protectedData.maskedPhone;
          customerPhoneHash = protectedData.phoneHash;
          encryptedPhone = protectedData.encryptedPhone;
        } catch (protectErr) {
          console.warn('[placeOrder] Server phone protection fallback (storing masked only):', protectErr);
          maskedCustomerPhone = maskPhone(rawPhone);
          customerPhoneHash = hashPhone(rawPhone);
        }
      }

      let tableSessionId: string | undefined = undefined;

      // If tableId === 'COUNTER' skip ensureSession entirely and set tableSessionId = undefined
      if (resolvedTableId !== 'COUNTER') {
        try {
          const session = await ensureSession(resolvedTableId, resolvedTableName, maskedCustomerPhone || undefined);
          if (session?.id) {
            tableSessionId = session.id;
          }
        } catch (sessErr: any) {
          console.error('[placeOrder] ensureSession failed for table', resolvedTableId, sessErr);
          throw sessErr;
        }
      }

      // 3. Create order entity with tableSessionId and masked phone only
      const newOrder: Order = {
        id: orderId,
        items,
        total,
        status: 'pending',
        createdAt,
        tableId: resolvedTableId,
        tableName: resolvedTableName,
        customerPhone: maskedCustomerPhone,
        phoneVerified: false,
      };

      if (customerPhoneHash) {
        newOrder.customerPhoneHash = customerPhoneHash;
      }
      if (encryptedPhone) {
        newOrder.hasProtectedPhone = true;
      }

      // Only attach tableSessionId if defined (avoiding undefined in Firestore)
      if (tableSessionId) {
        newOrder.tableSessionId = tableSessionId;
      }

      // Write order to Firestore (if the table session closed mid-flight, open a brand-new active session for this visit)
      try {
        await setDoc(doc(db, 'orders', orderId), newOrder);
      } catch (writeErr: any) {
        if (tableSessionId && resolvedTableId !== 'COUNTER') {
          const checkSess = await getSessionById(tableSessionId);
          if (checkSess?.status === 'closed') {
            const freshSession = await ensureSession(
              resolvedTableId,
              resolvedTableName,
              maskedCustomerPhone || undefined
            );
            if (!freshSession?.id) {
              throw writeErr;
            }
            tableSessionId = freshSession.id;
            newOrder.tableSessionId = tableSessionId;
            await setDoc(doc(db, 'orders', orderId), newOrder);
          } else {
            throw writeErr;
          }
        } else {
          throw writeErr;
        }
      }
      console.log('[placeOrder] Order created in firestore:', orderId, 'table:', resolvedTableId, 'session:', tableSessionId);

      // Write encrypted contact payload to separate order_contacts collection (decryptable only by authorized staff via backend)
      if (encryptedPhone) {
        try {
          await setDoc(doc(db, 'order_contacts', orderId), {
            orderId,
            maskedPhone: maskedCustomerPhone,
            encryptedPhone,
            createdAt,
          });
        } catch (contactErr) {
          console.warn('[placeOrder] Could not write protected order contact record:', contactErr);
        }
      }

      // 4. Atomically link pending order to table session (does not add to payable total until confirmed)
      if (tableSessionId) {
        try {
          const itemsCount = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
          await addOrderToSession(tableSessionId, {
            id: orderId,
            total,
            itemsCount,
            status: 'pending',
          });
        } catch (sessionErr: any) {
          console.error('[placeOrder] addOrderToSession failed:', sessionErr);
          if (sessionErr?.code !== 'SESSION_CLOSED') {
            try {
              await updateDoc(doc(db, 'orders', orderId), { 
                status: 'cancelled',
                kitchenNotes: `Session aggregation failed: ${sessionErr?.message || sessionErr}`
              });
            } catch (cleanupErr) {
              console.warn('[placeOrder] Could not mark orphan order cancelled:', cleanupErr);
            }
          }
          throw sessionErr;
        }
      }

      return orderId;
    } catch (error: any) {
      console.error('[placeOrder] error', error?.code, error?.message, error?.stack);
      throw error;
    }
  };

  const assertSessionNotClosed = async (sessionId?: string) => {
    if (!sessionId) return;
    const sess = await getSessionById(sessionId);
    if (sess?.status === 'closed') {
      const err: any = new Error(
        'This table session is closed. Items and orders can no longer be added or modified.'
      );
      err.code = 'SESSION_CLOSED';
      throw err;
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const existingOrder = orders.find(o => o.id === orderId);
      let sessionId = existingOrder?.tableSessionId;

      if (!sessionId) {
        const snap = await getDoc(orderRef);
        sessionId = snap.data()?.tableSessionId;
      }

      await assertSessionNotClosed(sessionId);
      await updateDoc(orderRef, { status });

      // Recalculate payable session totals whenever an order status changes
      if (sessionId) {
        await recalcSessionTotal(sessionId);
      }
    } catch (err) {
      console.error('Failed to update order status in Firestore', err);
      throw err;
    }
  };

  const updateOrderItems = async (
    orderId: string,
    items: CartItem[],
    total: number,
    kitchenNotes?: string
  ) => {
    const orderRef = doc(db, 'orders', orderId);
    const order = orders.find(o => o.id === orderId);
    let sessionId = order?.tableSessionId;
    if (!sessionId) {
      const snap = await getDoc(orderRef);
      sessionId = snap.data()?.tableSessionId;
    }

    await assertSessionNotClosed(sessionId);

    const payload: Partial<Order> = {
      items,
      total,
    };
    if (kitchenNotes !== undefined) {
      payload.kitchenNotes = kitchenNotes;
    }

    await updateDoc(orderRef, payload);

    // Recalculate parent table session to keep bill in sync
    if (sessionId) {
      await recalcSessionTotal(sessionId);
    }
  };

  const confirmOrder = async (
    orderId: string,
    managerName = 'Kitchen Manager',
    kitchenNotes?: string
  ) => {
    const orderRef = doc(db, 'orders', orderId);
    const existingOrder = orders.find(o => o.id === orderId);
    let sessionId = existingOrder?.tableSessionId;
    if (!sessionId) {
      const snap = await getDoc(orderRef);
      sessionId = snap.data()?.tableSessionId;
    }

    await assertSessionNotClosed(sessionId);

    const payload: Partial<Order> = {
      status: 'preparing',
      managerConfirmed: true,
      managerConfirmedAt: new Date().toISOString(),
      managerConfirmedBy: managerName,
    };
    if (kitchenNotes !== undefined) {
      payload.kitchenNotes = kitchenNotes;
    }
    await updateDoc(orderRef, payload);

    // Recalculate session payable bill immediately once order is confirmed
    if (sessionId) {
      await recalcSessionTotal(sessionId);
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const existingOrder = orders.find(o => o.id === orderId);
      let sessionId = existingOrder?.tableSessionId;

      if (!sessionId) {
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
          sessionId = snap.data()?.tableSessionId;
        }
      }

      await assertSessionNotClosed(sessionId);

      // Permanently delete the order document so it cannot reappear on refresh
      await deleteDoc(orderRef);

      // Also remove protected phone record if present
      try {
        await deleteDoc(doc(db, 'order_contacts', orderId));
      } catch {
        // Ignore if order had no protected contact record
      }

      // Recalculate parent session totals and orderIds so remaining valid orders stay accurate
      if (sessionId) {
        await recalcSessionTotal(sessionId);
      }
    } catch (err) {
      console.error('Failed to delete order from Firestore:', err);
      throw err;
    }
  };

  const getOrderById = (orderId: string) => {
    return orders.find((o) => o.id === orderId);
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        placeOrder,
        updateOrderStatus,
        updateOrderItems,
        confirmOrder,
        deleteOrder,
        getOrderById,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrder must be used within an OrderProvider');
  }
  return context;
}
