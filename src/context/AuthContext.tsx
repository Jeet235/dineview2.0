import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getStaffSession, staffLogout } from '../services/staffAuthService';

interface AuthContextType {
  isAdmin: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dineview_admin_auth') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let active = true;
    getStaffSession()
      .then((session) => {
        if (!active) return;
        if (session.authenticated && session.role === 'admin') {
          setIsAdmin(true);
          try {
            sessionStorage.setItem('dineview_admin_auth', 'true');
          } catch {}
        } else {
          setIsAdmin(false);
          try {
            sessionStorage.removeItem('dineview_admin_auth');
          } catch {}
        }
      })
      .catch(() => {
        // Keep current state if transient network issue
      });
    return () => {
      active = false;
    };
  }, []);

  const login = () => {
    setIsAdmin(true);
    try {
      sessionStorage.setItem('dineview_admin_auth', 'true');
    } catch {}
  };

  const logout = () => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem('dineview_admin_auth');
    } catch {}
    staffLogout().catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
