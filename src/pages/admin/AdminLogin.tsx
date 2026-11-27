import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock } from 'lucide-react';
import { staffLogin } from '../../services/staffAuthService';

export default function AdminLogin() {
  const { isAdmin, login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await staffLogin('admin', password, 'Admin');
      if (!result.ok) {
        setError(result.error || 'Incorrect password.');
        return;
      }
      login();
      navigate('/admin');
    } catch (err: any) {
      setError(err?.message || 'Incorrect password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white p-8 md:p-10 rounded-sm border border-border">
        <div className="mb-8">
          <p className="text-xs font-medium text-accent mb-1">DineView Administration</p>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-text-primary tracking-tight">
            Admin Sign In
          </h1>
          <p className="text-sm text-text-secondary mt-1.5">
            Sign in to manage orders, table sessions, QR codes, and menu items.
          </p>
        </div>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label htmlFor="admin-password" className="block text-xs font-medium text-text-secondary mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                autoFocus
                className={`w-full px-3.5 py-2.5 pe-10 rounded-sm border text-sm text-text-primary outline-none transition-colors ${
                  error ? 'border-red-500 bg-red-50/40' : 'border-border focus:border-text-primary bg-white'
                }`}
              />
              <Lock className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-text-primary text-bg-primary px-6 py-3 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors mt-2 disabled:opacity-60"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
