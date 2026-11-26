import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order } from '../context/OrderContext';
import { CartItem } from '../context/CartContext';
import { MENU_DATA } from '../data/menu';

export interface RecentDishItem {
  id: string;
  name: string;
  quantity: number;
  orderedAt: string;
}

export interface CustomerProfile {
  phone: string;
  uid?: string;
  firstSeenAt: string;
  lastOrderAt: string;
  totalOrders: number;
  totalSpent: number;
  favoriteDishIds: string[];
  recentOrderIds: string[];
  recentDishes: RecentDishItem[];
  lastTableId?: string;
}

/**
 * Normalizes input to E.164 standard phone format (+[country code][digits]).
 * Default country code is +91 (India) if none provided.
 */
export function formatPhone(raw: string, defaultCountryCode = '+91'): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // Strip spaces, dashes, parentheses
  const sanitized = trimmed.replace(/[\s\-()]/g, '');
  
  if (sanitized.startsWith('+')) {
    return sanitized;
  }
  
  if (sanitized.startsWith('00')) {
    return `+${sanitized.slice(2)}`;
  }
  
  // If 10 digits standard mobile number, prepend default country code
  if (/^\d{10}$/.test(sanitized)) {
    return `${defaultCountryCode}${sanitized}`;
  }
  
  // Fallback: prepend '+' if just numbers
  return `+${sanitized.replace(/^\+/, '')}`;
}

/**
 * Returns true if the given string is already a masked mobile number (e.g. "XXXXXX1234").
 */
export function isMaskedPhone(phone?: string | null): boolean {
  if (!phone) return false;
  return /^X+\d{2,4}$/.test(phone.trim());
}

/**
 * Masks phone number using privacy-safe XXXXXX1234 format (last 4 digits visible).
 * Idempotent if the phone is already masked.
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (isMaskedPhone(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 4) {
    const visible = digits.slice(-2);
    return `${'X'.repeat(Math.max(2, digits.length - visible.length))}${visible}`;
  }

  // Normalize to the 10-digit subscriber number when country code is included
  const localDigits = digits.length > 10 ? digits.slice(-10) : digits;
  const last4 = localDigits.slice(-4);
  const maskLen = Math.max(4, localDigits.length - 4);
  return `${'X'.repeat(maskLen)}${last4}`;
}

/**
 * Synchronous SHA-256 hex digest (works on HTTP LAN Wi-Fi, HTTPS, and Node without requiring crypto.subtle).
 */
function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Deterministic non-reversible hash matching the server's phone hash for own-order lookup
 * without storing plaintext mobile numbers inside shared order documents.
 */
export function hashPhone(raw?: string | null): string {
  if (!raw || isMaskedPhone(raw)) return '';
  const normalized = formatPhone(raw);
  if (!normalized) return '';
  return sha256Hex(`dineview-phone-hash-v1:${normalized}`).slice(0, 24);
}

/**
 * Fetches existing customer profile by normalized phone number
 */
export async function getCustomerProfile(phone: string): Promise<CustomerProfile | null> {
  if (!phone) return null;
  const normalized = formatPhone(phone);

  // Try Firestore first
  try {
    const snap = await getDoc(doc(db, 'customers', normalized));
    if (snap.exists()) {
      const data = snap.data() as CustomerProfile;
      try {
        localStorage.setItem(`dineview_cust_${normalized}`, JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (error) {
    console.warn('Could not fetch customer profile from Firestore, checking local storage cache:', error);
  }

  // Fallback to localStorage cache
  try {
    const cached = localStorage.getItem(`dineview_cust_${normalized}`);
    if (cached) {
      return JSON.parse(cached) as CustomerProfile;
    }
  } catch {}

  return null;
}

/**
 * Records or updates a customer profile upon placing an order
 */
export async function recordCustomerOrder(
  order: Order,
  phone: string,
  uid?: string
): Promise<CustomerProfile | null> {
  if (!phone) return null;
  const normalized = formatPhone(phone);
  const now = new Date().toISOString();

  try {
    const existing = await getCustomerProfile(normalized);

    const newRecentDishes: RecentDishItem[] = order.items.map((item: CartItem) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      orderedAt: order.createdAt || now,
    }));

    // Aggregate recent dishes (up to 15 latest)
    const combinedDishes = [...newRecentDishes, ...(existing?.recentDishes || [])].slice(0, 15);

    // Track recent order IDs (up to 5 latest)
    const recentOrderIds = [order.id, ...(existing?.recentOrderIds || []).filter((id) => id !== order.id)].slice(0, 5);

    // Compute favorite dish IDs based on frequency in recent dishes
    const frequencyMap: Record<string, number> = {};
    for (const d of combinedDishes) {
      frequencyMap[d.id] = (frequencyMap[d.id] || 0) + (d.quantity || 1);
    }
    const favoriteDishIds = Object.keys(frequencyMap).sort(
      (a, b) => frequencyMap[b] - frequencyMap[a]
    ).slice(0, 5);

    const updatedProfile: CustomerProfile = {
      phone: normalized,
      uid: uid || existing?.uid || '',
      firstSeenAt: existing?.firstSeenAt || order.createdAt || now,
      lastOrderAt: order.createdAt || now,
      totalOrders: (existing?.totalOrders || 0) + 1,
      totalSpent: (existing?.totalSpent || 0) + (order.total || 0),
      favoriteDishIds,
      recentOrderIds,
      recentDishes: combinedDishes,
      lastTableId: order.tableId || existing?.lastTableId || 'COUNTER',
    };

    // Cache to localStorage
    try {
      localStorage.setItem(`dineview_cust_${normalized}`, JSON.stringify(updatedProfile));
    } catch {}

    // Sync to Firestore
    try {
      await setDoc(doc(db, 'customers', normalized), updatedProfile, { merge: true });
    } catch (fsErr) {
      console.warn('Firestore customer profile write notice (cached locally):', fsErr);
    }

    return updatedProfile;
  } catch (error) {
    console.warn('Failed to record customer profile:', error);
    return null;
  }
}

/**
 * Synchronizes spend changes when manager updates order items/prices
 */
export async function updateCustomerSpendDelta(phone: string, deltaAmount: number): Promise<void> {
  if (!phone || deltaAmount === 0 || isMaskedPhone(phone)) return;
  const normalized = formatPhone(phone);
  try {
    const existing = await getCustomerProfile(normalized);
    if (!existing) return;
    const newTotal = Math.max(0, (existing.totalSpent || 0) + deltaAmount);
    await updateDoc(doc(db, 'customers', normalized), {
      totalSpent: newTotal,
    });
  } catch (err) {
    console.warn('Could not update customer spend delta:', err);
  }
}

export interface LastCustomerOrderResult {
  orderId?: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    calories?: number;
    image?: string;
  }>;
  date: string;
  table: string;
  total: number;
}

/**
 * Fetches last customer order by orderedAt desc from customers/{phone}.recentDishes + orders where phone==
 */
export async function fetchLastCustomerOrder(phone: string): Promise<LastCustomerOrderResult | null> {
  if (!phone) return null;
  const normalized = formatPhone(phone);

  const allMenuItems = MENU_DATA.flatMap(c => c.items);

  let profileOrder: LastCustomerOrderResult | null = null;
  let firestoreOrder: LastCustomerOrderResult | null = null;

  // 1. Fetch customer profile
  const profile = await getCustomerProfile(normalized);

  if (profile && profile.recentDishes && profile.recentDishes.length > 0) {
    // Sort recent dishes by orderedAt desc
    const sortedDishes = [...profile.recentDishes].sort((a, b) => {
      const timeA = new Date(a.orderedAt).getTime() || 0;
      const timeB = new Date(b.orderedAt).getTime() || 0;
      return timeB - timeA;
    });

    const latestOrderedAt = sortedDishes[0]?.orderedAt;
    // Group all dishes ordered at this latest timestamp (within 60 seconds)
    const latestTimestamp = new Date(latestOrderedAt).getTime();
    const batchDishes = sortedDishes.filter(d => {
      const t = new Date(d.orderedAt).getTime();
      return Math.abs(t - latestTimestamp) <= 60000;
    });

    let total = 0;
    const items = batchDishes.map(d => {
      const match = allMenuItems.find(m => m.id === d.id);
      const price = match ? match.price : 0;
      const calories = match ? match.calories : undefined;
      const image = match ? match.image : '';
      total += price * (d.quantity || 1);
      return {
        id: d.id,
        name: d.name || match?.name || d.id,
        quantity: d.quantity || 1,
        price,
        calories,
        image,
      };
    });

    profileOrder = {
      orderId: profile.recentOrderIds?.[0],
      items,
      date: latestOrderedAt || profile.lastOrderAt || new Date().toISOString(),
      table: profile.lastTableId ? (profile.lastTableId === 'COUNTER' ? 'Counter' : (profile.lastTableId.startsWith('Table') ? profile.lastTableId : `Table ${profile.lastTableId}`)) : 'Table T01',
      total: total > 0 ? total : (profile.totalSpent || 0),
    };
  }

  // 2. Fetch from orders collection where customerPhone == normalized or phone
  try {
    const ordersList: Order[] = [];

    // Check recentOrderIds[0] directly first if known
    if (profile?.recentOrderIds && profile.recentOrderIds.length > 0) {
      try {
        const snap = await getDoc(doc(db, 'orders', profile.recentOrderIds[0]));
        if (snap.exists()) {
          ordersList.push(snap.data() as Order);
        }
      } catch {}
    }

    // Query privacy-protected orders by customerPhoneHash
    const phoneHash = hashPhone(normalized);
    if (phoneHash) {
      try {
        const qHash = query(collection(db, 'orders'), where('customerPhoneHash', '==', phoneHash));
        const snapsHash = await getDocs(qHash);
        snapsHash.forEach(s => {
          const o = s.data() as Order;
          if (!(o as any).isSession && !ordersList.some(existing => existing.id === o.id)) {
            ordersList.push(o);
          }
        });
      } catch {}
    }

    // Legacy fallback: query orders collection where customerPhone == normalized
    try {
      const q = query(collection(db, 'orders'), where('customerPhone', '==', normalized));
      const snaps = await getDocs(q);
      snaps.forEach(s => {
        const o = s.data() as Order;
        if (!(o as any).isSession && !ordersList.some(existing => existing.id === o.id)) {
          ordersList.push(o);
        }
      });
    } catch {}

    // Legacy fallback: query orders collection where customerPhone == raw phone if different
    if (phone !== normalized) {
      try {
        const qRaw = query(collection(db, 'orders'), where('customerPhone', '==', phone));
        const snapsRaw = await getDocs(qRaw);
        snapsRaw.forEach(s => {
          const o = s.data() as Order;
          if (!(o as any).isSession && !ordersList.some(existing => existing.id === o.id)) {
            ordersList.push(o);
          }
        });
      } catch {}
    }

    if (ordersList.length > 0) {
      // Sort orders by createdAt desc
      ordersList.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeB - timeA;
      });

      const best = ordersList[0];
      const items = (best.items || []).map(i => {
        const match = allMenuItems.find(m => m.id === i.id);
        return {
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          calories: match?.calories,
          image: match?.image || i.image,
        };
      });

      firestoreOrder = {
        orderId: best.id,
        items,
        date: best.createdAt,
        table: best.tableName || (best.tableId ? (best.tableId === 'COUNTER' ? 'Counter' : (best.tableId.startsWith('Table') ? best.tableId : `Table ${best.tableId}`)) : 'Table T01'),
        total: best.total,
      };
    }
  } catch (err) {
    console.warn('Could not query orders collection for phone:', err);
  }

  // 3. Compare orderedAt desc between customers/{phone}.recentDishes and orders
  if (profileOrder && firestoreOrder) {
    const profileTime = new Date(profileOrder.date).getTime() || 0;
    const firestoreTime = new Date(firestoreOrder.date).getTime() || 0;
    // Return whichever has newer orderedAt desc (or prefer firestoreOrder if within 10s because of rich order data)
    if (firestoreTime >= profileTime - 10000) {
      return firestoreOrder;
    }
    return profileOrder;
  }

  return firestoreOrder || profileOrder || null;
}
