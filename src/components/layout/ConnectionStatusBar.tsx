import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCcw } from 'lucide-react';

export function ConnectionStatusBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1500);
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[60] px-4 py-2.5 text-xs font-bold text-center transition-all duration-300 ease-in-out ${
        isOnline
          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)] border-b border-emerald-200/30'
          : 'bg-gradient-to-r from-rose-500 to-orange-600 text-white shadow-[0_4px_12px_rgba(244,63,94,0.4)] border-b border-rose-200/30 animate-pulse'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="w-3 h-3 animate-pulse" />
            <span>متصل بالإنترنت — البيانات تتم مزامنتها فوراً ✅</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3 animate-pulse" />
            <span>غير متصل بالإنترنت ⚠️</span>
            <button
              onClick={handleRetry}
              className="ml-2 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded border border-white/30 transition"
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCcw className="w-3 h-3 animate-spin" />
              ) : (
                'إعادة ניסיון'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}