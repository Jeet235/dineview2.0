import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Box, Loader2, Smartphone, Info } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export interface ModelViewerModalProps {
  modelUrl: string;
  modelUrlAr?: string;
  iosSrc?: string;
  poster?: string;
  itemName: string;
  buttonClassName?: string;
  iconClassName?: string;
  cameraOrbit?: string;
  cameraTarget?: string;
}

interface ToastState {
  type: 'loading' | 'error' | 'info';
  message: string;
}

/**
 * Resolves a model path to an absolute URL accessible by the browser and AR engines.
 */
export function getPublicModelUrl(path?: string): string | undefined {
  if (!path) return undefined;

  // Safeguard: Do not serve dummy/placeholder USDZ files for iOS Quick Look
  if (path.endsWith('.usdz') && path.includes('mock')) {
    return undefined;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const clean = path.replace(/^\//, '');

  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/${clean}`;
  }

  return path;
}

export const ModelViewerModal: React.FC<ModelViewerModalProps> = ({ 
  modelUrl,
  modelUrlAr,
  iosSrc,
  poster,
  itemName, 
  buttonClassName, 
  iconClassName,
  cameraOrbit,
  cameraTarget
}) => {
  const { t } = useLanguage();

  // Detect dish types to set optimal camera orbit and elevation
  const isPizza = Boolean(
    (modelUrl && modelUrl.includes('pizza')) || 
    (itemName && itemName.toLowerCase().includes('pizza'))
  );

  const effectiveCameraOrbit = cameraOrbit || (isPizza ? "0deg 65deg 105%" : "0deg 75deg 105%");
  const effectiveCameraTarget = cameraTarget || (isPizza ? "0m 0.02m 0m" : "auto auto auto");

  const [modelViewerReady, setModelViewerReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isLaunchingAr, setIsLaunchingAr] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  const visibleViewerRef = useRef<any>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dedicated URLs: high-quality hero model for 3D viewer, optimized model for AR
  const public3DModelUrl = getPublicModelUrl(modelUrl) || modelUrl;
  const effectiveArUrl = modelUrlAr || modelUrl;
  const publicArModelUrl = getPublicModelUrl(effectiveArUrl) || effectiveArUrl;
  const publicIosSrc = iosSrc ? getPublicModelUrl(iosSrc) : undefined;

  const [active3DModelUrl, setActive3DModelUrl] = useState(() => public3DModelUrl);
  const [arModelLoaded, setArModelLoaded] = useState(false);
  const [arReadyToActivate, setArReadyToActivate] = useState(false);

  // Check device type
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setIsMobile(mobile);
    }
  }, []);

  useEffect(() => {
    setActive3DModelUrl(public3DModelUrl);
    setIsModelLoaded(false);
    setLoadProgress(0);
    setLoadError(null);
  }, [public3DModelUrl]);

  // Dynamically load @google/model-viewer in background
  useEffect(() => {
    if (customElements.get('model-viewer')) {
      setModelViewerReady(true);
    } else {
      import('@google/model-viewer')
        .then(() => setModelViewerReady(true))
        .catch((err) => console.error('Failed to load @google/model-viewer:', err));
    }
  }, []);

  // Listen for hashchange, visibility changes, and window focus to detect when Scene Viewer / WebXR returns or fails
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.includes('model-viewer-no-ar-fallback')) {
        console.log('[DineView AR] Handled #model-viewer-no-ar-fallback');
        setIsLaunchingAr(false);
        setArReadyToActivate(false);
        setToast(null);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {
          // Ignore
        }
      }
    };

    const handleTabActive = () => {
      if (document.visibilityState === 'visible') {
        setIsLaunchingAr(false);
        setArReadyToActivate(false);
        setToast(null);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    document.addEventListener('visibilitychange', handleTabActive);
    window.addEventListener('focus', handleTabActive);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      document.removeEventListener('visibilitychange', handleTabActive);
      window.removeEventListener('focus', handleTabActive);
    };
  }, []);

  // Prevent scrolling on the body when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowModal(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [showModal]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    };
  }, []);

  const showToast = useCallback((type: 'loading' | 'error' | 'info', message: string, duration = 4000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!showModal) {
      setIsLaunchingAr(false);
      setArReadyToActivate(false);
      setArModelLoaded(false);
      setIsModelLoaded(false);
      setLoadProgress(0);
      setLoadError(null);
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setToast(null);
    }
  }, [showModal]);

  // Attach event listeners to visible 3D model-viewer
  useEffect(() => {
    if (!showModal) return;

    const viewer = visibleViewerRef.current;
    if (!viewer) return;

    const handleProgress = (e: any) => {
      const p = Math.round((e.detail?.totalProgress || 0) * 100);
      setLoadProgress(p);
    };

    const handleLoad = () => {
      setIsModelLoaded(true);
      setLoadProgress(100);
      setLoadError(null);
    };

    const handleError = (e: any) => {
      console.warn('[DineView 3D] Model viewer error event:', e);
      if (active3DModelUrl !== public3DModelUrl) {
        console.log('[DineView 3D] Retrying with public3DModelUrl:', public3DModelUrl);
        setActive3DModelUrl(public3DModelUrl);
      } else {
        setLoadError('Unable to load 3D model asset. Please check network connection.');
      }
    };

    viewer.addEventListener('progress', handleProgress);
    viewer.addEventListener('load', handleLoad);
    viewer.addEventListener('error', handleError);

    if (viewer.loaded) {
      setIsModelLoaded(true);
      setLoadProgress(100);
    }

    return () => {
      viewer.removeEventListener('progress', handleProgress);
      viewer.removeEventListener('load', handleLoad);
      viewer.removeEventListener('error', handleError);
    };
  }, [showModal, active3DModelUrl, public3DModelUrl]);

  const arViewerRef = useRef<any>(null);

  // Attach event listeners to the dedicated AR viewer when mounted
  useEffect(() => {
    if (!showModal) return;

    const arViewer = arViewerRef.current;
    if (!arViewer) return;

    const handleArLoad = async () => {
      console.log('[DineView AR] AR model preloaded successfully');
      setArModelLoaded(true);

      // If user had already clicked "View in AR" before load finished
      if (isLaunchingAr) {
        try {
          await arViewer.activateAR();
        } catch (err: any) {
          console.warn('[DineView AR] activateAR direct call exception:', err);
          const errStr = String(err?.message || err || '').toLowerCase();
          if (errStr.includes('gesture') || errStr.includes('user') || errStr.includes('activation')) {
            setArReadyToActivate(true);
            setIsLaunchingAr(false);
            if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
            showToast('info', '3D model is ready! Tap "Enter AR" to place it on your table.', 6000);
          } else if (!errStr.includes('cancel') && !errStr.includes('abort')) {
            setIsLaunchingAr(false);
            if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
            showToast('error', 'AR is not supported on this browser or device. Explore the dish in 3D right here.');
          } else {
            setIsLaunchingAr(false);
            if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
            setToast(null);
          }
        }
      }
    };

    const handleArStatus = (e: any) => {
      const status = e.detail?.status;
      console.log('[DineView AR] ar-status event:', status);
      if (status === 'session-started' || status === 'object-placed') {
        setIsLaunchingAr(false);
        setArReadyToActivate(false);
        setToast(null);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      } else if (status === 'failed') {
        setIsLaunchingAr(false);
        setArReadyToActivate(false);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
        showToast('error', 'AR session could not be started. You can inspect the dish in 3D right here.');
      } else if (status === 'not-presenting') {
        setIsLaunchingAr(false);
        setArReadyToActivate(false);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      }
    };

    const handleArError = (e: any) => {
      console.error('[DineView AR] AR viewer error:', e);
      setIsLaunchingAr(false);
      setArReadyToActivate(false);
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      showToast('error', 'Failed to load AR model asset. Please retry.');
    };

    arViewer.addEventListener('load', handleArLoad);
    arViewer.addEventListener('ar-status', handleArStatus);
    arViewer.addEventListener('error', handleArError);

    if (arViewer.loaded) {
      setArModelLoaded(true);
    }

    return () => {
      arViewer.removeEventListener('load', handleArLoad);
      arViewer.removeEventListener('ar-status', handleArStatus);
      arViewer.removeEventListener('error', handleArError);
    };
  }, [showModal, isLaunchingAr, showToast]);

  // Synchronous user-gesture AR launch
  const handleLaunchAR = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Prevent multi-clicks while launching
    if (isLaunchingAr && !arReadyToActivate) return;

    // Detect iOS devices
    const isIOS = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

    // If on desktop without AR hardware, guide user to mobile
    const currentViewer = arViewerRef.current || visibleViewerRef.current;
    if (!isMobile && currentViewer && !currentViewer.canActivateAR) {
      showToast('info', 'AR table view is designed for mobile devices with camera tracking. Open DineView on your phone to view this dish on your table! You can also rotate and zoom in 3D right here.', 6000);
      return;
    }

    // If on iOS and dummy/missing USDZ, inform user gracefully
    if (isIOS && !publicIosSrc && currentViewer && !currentViewer.canActivateAR) {
      showToast('info', 'AR Quick Look requires an iOS-compatible asset. Showing interactive 3D view.', 4500);
      return;
    }

    // If already loaded and ready to activate, launch synchronously in this user gesture
    if (arViewerRef.current && (arModelLoaded || arViewerRef.current.loaded)) {
      setIsLaunchingAr(true);
      showToast('loading', t.preparing_ar || 'Preparing AR…', 8000);

      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      launchTimeoutRef.current = setTimeout(() => {
        setIsLaunchingAr(false);
        setArReadyToActivate(false);
        showToast('error', 'AR launch timed out. Please tap to try again or inspect in 3D.');
      }, 10000);

      try {
        await arViewerRef.current.activateAR();
      } catch (err: any) {
        console.warn('[DineView AR] direct activateAR click error:', err);
        setIsLaunchingAr(false);
        if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
        const errStr = String(err?.message || err || '').toLowerCase();
        if (errStr.includes('gesture') || errStr.includes('user') || errStr.includes('activation')) {
          setArReadyToActivate(true);
          showToast('info', 'Tap "Enter AR" to place the dish on your table.', 5000);
        } else if (!errStr.includes('cancel') && !errStr.includes('abort')) {
          showToast('error', 'AR is not supported on this browser or device. Explore the dish in 3D right here.');
        } else {
          setToast(null);
        }
      }
      return;
    }

    // In case user tapped before AR model finished downloading, start launch state and wait for handleArLoad
    setIsLaunchingAr(true);
    showToast('loading', t.preparing_ar || 'Preparing AR…', 10000);

    // Safety timeout: does NOT report false success, reports failure/retry if it times out
    if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    launchTimeoutRef.current = setTimeout(() => {
      setIsLaunchingAr(false);
      setArReadyToActivate(false);
      showToast('error', 'AR model loading timed out. Please tap to try again or inspect in 3D.');
    }, 12000);
  };

  return (
    <>
      {/* Trigger Button on dish cards and details page */}
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setToast(null);
          setShowModal(true);
        }}
        className={buttonClassName || "inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-text-primary transition-colors text-xs font-medium whitespace-nowrap shrink-0"}
        title="View dish in 3D and Augmented Reality"
      >
        <Box className={iconClassName || "w-3.5 h-3.5 shrink-0"} />
        <span>{t.view_3d || '3D View'}</span>
      </button>

      {showModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-3d-title"
        >
          <div className="relative w-full max-w-4xl h-[82vh] md:h-[85vh] bg-bg-primary border border-border shadow-xl rounded-sm flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-primary">
              <h3 id="modal-3d-title" className="font-serif text-xl md:text-2xl text-text-primary flex items-baseline gap-2">
                <span>{itemName}</span>
                <span className="text-text-muted text-sm font-sans font-normal">{t.in_3d || '3D Preview'}</span>
              </h3>
              
              <div className="flex items-center gap-2 md:gap-3">
                {/* Header AR button: Always visible for AR-enabled dishes */}
                <button
                  type="button"
                  onClick={handleLaunchAR}
                  disabled={isLaunchingAr && !arReadyToActivate}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    arReadyToActivate
                      ? 'bg-accent text-white hover:bg-accent/90'
                      : 'bg-text-primary text-bg-primary hover:bg-text-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                  title={arReadyToActivate ? "Tap to place dish on table" : isModelLoaded ? "View on your table with Augmented Reality" : "Loading 3D model…"}
                >
                  {isLaunchingAr ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isLaunchingAr 
                      ? (t.preparing_ar || 'Preparing…') 
                      : arReadyToActivate 
                      ? 'Enter AR' 
                      : (t.view_ar || 'View in AR')}
                  </span>
                </button>

                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-sm transition-colors"
                  aria-label={t.close_3d || 'Close 3D viewer'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* 3D Scene Container */}
            <div className="flex-1 w-full bg-[#f8f6f0] relative flex items-center justify-center overflow-hidden">
              {modelViewerReady ? (
                <>
                  {/* Visible 3D Hero Viewer (loads high-quality model, handles 360 inspection) */}
                  <model-viewer
                    ref={visibleViewerRef}
                    src={active3DModelUrl}
                    alt={itemName}
                    poster={poster || undefined}
                    camera-controls
                    touch-action="pan-y"
                    exposure="1"
                    shadow-intensity="1"
                    shadow-softness="0.5"
                    environment-image="neutral"
                    auto-rotate
                    camera-orbit={effectiveCameraOrbit}
                    camera-target={effectiveCameraTarget}
                    min-camera-orbit="auto 20deg auto"
                    max-camera-orbit="auto 88deg auto"
                    interaction-prompt="auto"
                    reveal="auto"
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    ar-placement="floor"
                    ar-scale="fixed"
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                  >
                    <div slot="ar-button" style={{ display: 'none' }} />
                  </model-viewer>

                  {/* Dedicated preloaded AR Viewer (loads optimized AR asset and anchors immediately to horizontal floor/tabletop) */}
                  <model-viewer
                    ref={arViewerRef}
                    src={publicArModelUrl}
                    ios-src={publicIosSrc || undefined}
                    alt={`${itemName} AR`}
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    ar-placement="floor"
                    ar-scale="fixed"
                    quick-look-browsers="safari chrome"
                    loading="eager"
                    reveal="auto"
                    camera-controls
                    environment-image="neutral"
                    shadow-intensity="1"
                    shadow-softness="0.5"
                    style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', zIndex: -1 }}
                  >
                    <div slot="ar-button" style={{ display: 'none' }} />
                  </model-viewer>

                  {/* Floating in-viewport AR trigger button */}
                  <button
                    type="button"
                    onClick={handleLaunchAR}
                    disabled={isLaunchingAr && !arReadyToActivate}
                    className={`absolute bottom-5 right-5 z-10 flex items-center gap-2 px-4 py-2.5 rounded-sm text-xs font-medium shadow-md transition-colors cursor-pointer border whitespace-nowrap ${
                      arReadyToActivate
                        ? 'bg-accent hover:bg-accent/90 text-white border-accent'
                        : 'bg-text-primary text-bg-primary hover:bg-text-primary/90 border-white/10 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                    title={arReadyToActivate ? "Tap to place dish on table" : isModelLoaded ? "View on your table with Augmented Reality" : "Loading 3D model…"}
                  >
                    {isLaunchingAr ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Smartphone className="w-4 h-4" />
                    )}
                    <span>
                      {isLaunchingAr 
                        ? (t.preparing_ar || 'Preparing AR…') 
                        : arReadyToActivate 
                        ? 'Enter AR' 
                        : (t.view_ar || 'View in AR')}
                    </span>
                  </button>

                  {/* Loading progress overlay */}
                  {!isModelLoaded && !loadError && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/5 pointer-events-none">
                      <div className="bg-text-primary/95 text-bg-primary px-5 py-4 rounded-sm shadow-lg flex flex-col items-center gap-2.5 max-w-[220px] border border-white/10">
                        <Loader2 className="w-5 h-5 text-bg-primary animate-spin" />
                        <span className="text-xs font-mono tabular-nums text-bg-primary/90 text-center">
                          {loadProgress > 0 ? `Loading 3D (${loadProgress}%)` : 'Preparing 3D model…'}
                        </span>
                        {loadProgress > 0 && (
                          <div className="w-full h-1 bg-white/20 overflow-hidden">
                            <div 
                              className="h-full bg-white transition-all duration-200" 
                              style={{ width: `${loadProgress}%` }} 
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Load error & retry state */}
                  {loadError && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-secondary/95 p-6 text-center">
                      <Box className="w-8 h-8 text-text-muted mb-3" />
                      <p className="text-sm text-text-primary font-medium mb-1">{loadError}</p>
                      <p className="text-xs text-text-secondary mb-4">The 3D model could not be displayed.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setLoadError(null);
                          setIsModelLoaded(false);
                          setLoadProgress(0);
                          const viewer = visibleViewerRef.current;
                          if (viewer) {
                            const cur = viewer.src;
                            viewer.src = '';
                            setTimeout(() => {
                              viewer.src = cur || public3DModelUrl;
                            }, 50);
                          }
                        }}
                        className="px-4 py-2 bg-text-primary text-bg-primary text-xs font-medium rounded-sm hover:bg-text-primary/90 transition-colors"
                      >
                        Retry Loading
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                  <span className="text-xs text-text-secondary font-medium">
                    Loading 3D viewer…
                  </span>
                </div>
              )}
            </div>
            
            {/* Footer helper info */}
            <div className="px-5 py-3.5 bg-bg-primary border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-text-muted gap-2">
              <span>{t.instructions_3d || 'Drag to rotate · Pinch or scroll to zoom'}</span>
              <span className="flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-text-secondary" />
                <span>WebXR & 360° Inspection</span>
              </span>
            </div>

            {/* In-Modal Toast Notification */}
            {toast && (
              <div 
                className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[120] max-w-[90%] sm:max-w-md w-full px-4 pointer-events-auto"
                role="status"
                aria-live="polite"
              >
                <div className="bg-text-primary text-bg-primary border border-white/15 rounded-sm px-4 py-2.5 shadow-lg flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {toast.type === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 shrink-0 text-bg-primary/70" />
                    )}
                    <p className="text-bg-primary/90 leading-snug">
                      {toast.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setToast(null)}
                    className="p-1 text-bg-primary/60 hover:text-bg-primary rounded-sm transition-colors shrink-0"
                    aria-label="Dismiss message"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
