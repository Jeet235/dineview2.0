import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTable } from '../../context/TableContext';
import { Globe, Wifi, Laptop, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function SmartConnectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setActiveTable } = useTable();

  const tableParam = searchParams.get('table')?.trim().toUpperCase() || 'COUNTER';
  const envAppUrl = (import.meta.env.VITE_APP_URL || import.meta.env.APP_URL || '').replace(/\/$/, '');
  const [networkInfo, setNetworkInfo] = useState<{
    tunnelUrl: string;
    lanUrl: string;
    localUrl: string;
  }>({
    tunnelUrl: envAppUrl,
    lanUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    localUrl: 'http://localhost:3000',
  });

  const [countdown, setCountdown] = useState<number>(3);
  const [autoRedirect, setAutoRedirect] = useState<boolean>(true);

  // Sync table to context and localStorage
  useEffect(() => {
    if (tableParam) {
      setActiveTable(tableParam);
      try {
        localStorage.setItem('dineview_table', tableParam);
      } catch {}
    }
  }, [tableParam, setActiveTable]);

  // Fetch live network info
  useEffect(() => {
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data) => {
        const publicTunnel = data.publicUrl || data.tunnelUrl || envAppUrl;
        const localLan = data.localUrl || data.lanUrl || 'http://localhost:3000';
        setNetworkInfo({
          tunnelUrl: publicTunnel,
          lanUrl: localLan,
          localUrl: data.localUrl || 'http://localhost:3000',
        });
      })
      .catch((err) => console.warn('Could not fetch network info:', err));
  }, [envAppUrl]);

  // Countdown auto-redirect to menu
  useEffect(() => {
    if (!autoRedirect) return;

    if (countdown <= 0) {
      navigate(`/?table=${tableParam}`);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, autoRedirect, navigate, tableParam]);

  const handleConnect = (targetBaseUrl: string) => {
    setAutoRedirect(false);
    try {
      localStorage.setItem('dineview_table', tableParam);
    } catch {}

    const cleanBase = targetBaseUrl.replace(/\/$/, '');
    const currentOrigin = window.location.origin.replace(/\/$/, '');

    // If destination matches current origin, navigate internally to avoid reload
    if (cleanBase === currentOrigin) {
      navigate(`/?table=${tableParam}`);
    } else {
      window.location.href = `${cleanBase}/?table=${tableParam}`;
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full bg-white border border-border rounded-sm p-6 sm:p-8">
        <p className="text-xs font-mono text-accent mb-1">
          {tableParam !== 'COUNTER' ? `Table ${tableParam}` : 'Counter Order'}
        </p>
        <h1 className="text-2xl font-serif font-medium text-text-primary tracking-tight">
          DineView Menu
        </h1>
        <p className="text-xs text-text-muted mt-1 mb-6">
          Connection Portal
        </p>

        {/* Auto-connect Banner */}
        {autoRedirect ? (
          <div className="bg-bg-secondary border border-border rounded-sm p-3.5 mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <p className="text-xs text-text-primary">
                Opening menu in <strong className="font-mono tabular-nums font-medium">{countdown}s</strong>…
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoRedirect(false)}
              className="text-xs font-medium text-text-secondary hover:text-text-primary px-2.5 py-1 bg-white border border-border rounded-sm whitespace-nowrap shrink-0 transition-colors"
            >
              Choose Server
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-secondary mb-5">
            Select your preferred connection option below:
          </p>
        )}

        {/* 3 Connection Options */}
        <div className="flex flex-col gap-3 text-left mb-6">
          {/* Option 1: Online Cloud Server */}
          <button
            type="button"
            onClick={() => handleConnect(networkInfo.tunnelUrl)}
            className="p-4 rounded-sm border border-accent/60 bg-bg-primary hover:bg-bg-secondary transition-colors flex items-start gap-3 group text-left w-full"
          >
            <Globe className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-primary">
                  Online Cloud Server <span className="text-accent font-normal">· Recommended</span>
                </span>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary shrink-0 transition-colors" />
              </div>
              <p className="text-xs text-text-secondary mt-0.5 leading-snug">
                Works on any mobile network (4G/5G or Wi-Fi).
              </p>
              <p className="text-[11px] font-mono text-text-muted mt-1 truncate">
                {networkInfo.tunnelUrl}
              </p>
            </div>
          </button>

          {/* Option 2: Local Wi-Fi Network */}
          <button
            type="button"
            onClick={() => handleConnect(networkInfo.lanUrl)}
            className="p-4 rounded-sm border border-border bg-white hover:bg-bg-secondary transition-colors flex items-start gap-3 group text-left w-full"
          >
            <Wifi className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-primary">
                  Restaurant Wi-Fi Network
                </span>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary shrink-0 transition-colors" />
              </div>
              <p className="text-xs text-text-secondary mt-0.5 leading-snug">
                Local connection for devices on restaurant Wi-Fi.
              </p>
              <p className="text-[11px] font-mono text-text-muted mt-1 truncate">
                {networkInfo.lanUrl}
              </p>
            </div>
          </button>

          {/* Option 3: Localhost */}
          <button
            type="button"
            onClick={() => handleConnect(networkInfo.localUrl)}
            className="p-4 rounded-sm border border-border bg-white hover:bg-bg-secondary transition-colors flex items-start gap-3 group text-left w-full"
          >
            <Laptop className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-primary">
                  Localhost (Host Device)
                </span>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary shrink-0 transition-colors" />
              </div>
              <p className="text-xs text-text-secondary mt-0.5 leading-snug">
                For managers and staff testing on the host computer.
              </p>
              <p className="text-[11px] font-mono text-text-muted mt-1 truncate">
                {networkInfo.localUrl}
              </p>
            </div>
          </button>
        </div>

        {/* Quick Direct Button */}
        <button
          type="button"
          onClick={() => {
            setAutoRedirect(false);
            navigate(`/?table=${tableParam}`);
          }}
          className="w-full bg-text-primary text-bg-primary py-3 px-6 rounded-sm text-xs font-medium hover:bg-text-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <span>Open Menu Now</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-text-muted mt-4 text-center">
          DineView QR Router · No app download required
        </p>
      </div>
    </div>
  );
}
