import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type StaffRole = 'manager' | 'admin';

export interface StaffSessionInfo {
  authenticated: boolean;
  role?: StaffRole;
  name?: string;
}

// Keep staff bearer token strictly in JS memory (never persisted in localStorage/sessionStorage).
// Page reloads authenticate seamlessly via the server-set HttpOnly cookie.
let inMemoryStaffToken: string | null = null;

function buildStaffHeaders(includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'DineView-Staff',
  };
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (inMemoryStaffToken) {
    headers['Authorization'] = `Bearer ${inMemoryStaffToken}`;
  }
  return headers;
}

export async function staffLogin(
  role: StaffRole,
  passcode: string,
  name?: string
): Promise<{ ok: boolean; role?: StaffRole; name?: string; error?: string }> {
  try {
    const res = await fetch('/api/staff/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'DineView-Staff',
      },
      body: JSON.stringify({ role, passcode, name }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Authentication failed.' };
    }

    if (typeof data.token === 'string' && data.token) {
      inMemoryStaffToken = data.token;
    }

    return {
      ok: true,
      role: data.role,
      name: data.name,
    };
  } catch (err) {
    console.error('[staffAuthService] login request failed:', err);
    return { ok: false, error: 'Unable to reach authentication server. Please try again.' };
  }
}

export async function getStaffSession(): Promise<StaffSessionInfo> {
  try {
    const res = await fetch('/api/staff/session', {
      method: 'GET',
      credentials: 'include',
      headers: buildStaffHeaders(false),
    });
    if (!res.ok) {
      return { authenticated: false };
    }
    const data = await res.json().catch(() => ({}));
    return {
      authenticated: Boolean(data.authenticated),
      role: data.role,
      name: data.name,
    };
  } catch {
    return { authenticated: false };
  }
}

export async function staffLogout(): Promise<void> {
  inMemoryStaffToken = null;
  try {
    await fetch('/api/staff/logout', {
      method: 'POST',
      credentials: 'include',
      headers: buildStaffHeaders(false),
    });
  } catch {}
}

export interface ProtectedPhonePayload {
  maskedPhone: string;
  phoneHash: string;
  encryptedPhone: string;
}

/**
 * Encrypts a customer mobile number on the backend before writing to Firestore.
 * Returns a masked display string (XXXXXX1234), a non-reversible lookup hash,
 * and an AES-256-GCM ciphertext bound to the orderId.
 */
export async function protectOrderPhone(
  orderId: string,
  rawPhone: string
): Promise<ProtectedPhonePayload> {
  const res = await fetch('/api/orders/protect-phone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, phone: rawPhone }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.maskedPhone || !data.encryptedPhone) {
    throw new Error(data.error || 'Could not protect customer phone number.');
  }

  return {
    maskedPhone: data.maskedPhone,
    phoneHash: data.phoneHash || '',
    encryptedPhone: data.encryptedPhone,
  };
}

/**
 * Authorized staff-only helper to reveal a customer's complete mobile number for an order.
 * Access is strictly enforced by the server (/api/staff/reveal-phone); unauthorized
 * requests are rejected with 401 Unauthorized.
 */
export async function revealOrderFullPhone(
  orderId: string,
  legacyCustomerPhone?: string
): Promise<{ ok: boolean; fullPhone?: string; error?: string; authRequired?: boolean }> {
  try {
    let encryptedPhone: string | undefined;

    try {
      const contactSnap = await getDoc(doc(db, 'order_contacts', orderId));
      if (contactSnap.exists()) {
        const contactData = contactSnap.data();
        if (typeof contactData?.encryptedPhone === 'string') {
          encryptedPhone = contactData.encryptedPhone;
        }
      }
    } catch (err) {
      console.warn('[staffAuthService] Could not fetch order_contacts record:', err);
    }

    const res = await fetch('/api/staff/reveal-phone', {
      method: 'POST',
      credentials: 'include',
      headers: buildStaffHeaders(true),
      body: JSON.stringify({
        orderId,
        encryptedPhone,
        legacyPhone: !encryptedPhone ? legacyCustomerPhone : undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        authRequired: true,
        error:
          data.error ||
          'Staff authorization required. Please sign in again to view full customer numbers.',
      };
    }

    if (!res.ok || !data.fullPhone) {
      return {
        ok: false,
        error: data.error || 'Full mobile number is unavailable for this order.',
      };
    }

    return { ok: true, fullPhone: data.fullPhone };
  } catch (err) {
    console.error('[staffAuthService] revealOrderFullPhone failed:', err);
    return { ok: false, error: 'Failed to retrieve full customer number.' };
  }
}
