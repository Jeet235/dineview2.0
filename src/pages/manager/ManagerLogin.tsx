import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { staffLogin } from '../../services/staffAuthService';

export default function ManagerLogin() {
  const [passcode, setPasscode] = useState('');
  const [managerName, setManagerName] = useState('Chef Robert');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const resolvedName = managerName.trim() || 'Kitchen Manager';
      const result = await staffLogin('manager', passcode.trim(), resolvedName);
      if (!result.ok) {
        setError(result.error || 'Invalid manager passcode.');
        return;
      }
      try {
        sessionStorage.setItem('dineview_manager_auth', 'true');
        sessionStorage.setItem('dineview_manager_name', resolvedName);
      } catch {}

      const destination = (location.state as any)?.from?.pathname || '/manager/orders';
      navigate(destination, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Invalid manager passcode.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-border rounded-sm p-8">
        <div className="mb-8">
          <span className="text-xs font-medium text-accent block mb-1">
            DineView Dispatch
          </span>
          <h1 className="text-2xl font-serif font-semibold text-text-primary tracking-tight">
            Kitchen Manager
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Sign in with your manager passcode to access live kitchen tickets.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Manager / Chef Name
            </label>
            <input
              type="text"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="e.g. Chef Robert"
              className="w-full border border-border bg-bg-primary px-3.5 py-2.5 rounded-sm text-sm text-text-primary focus:outline-none focus:border-text-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Manager Passcode
            </label>
            <div className="relative">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter manager passcode"
                className="w-full border border-border bg-bg-primary px-3.5 py-2.5 rounded-sm text-sm text-text-primary focus:outline-none focus:border-text-primary pe-10"
                required
                autoFocus
              />
              <Lock className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-text-primary text-bg-primary py-3 px-6 rounded-sm text-sm font-medium hover:bg-text-primary/90 transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
          >
            <span>{submitting ? 'Verifying Passcode...' : 'Access Kitchen Queue'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-border text-center">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-text-secondary hover:text-text-primary font-medium transition-colors"
          >
            ← Return to Customer Menu
          </button>
        </div>
      </div>
    </div>
  );
}
