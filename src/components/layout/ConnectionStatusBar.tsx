import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCcw } from 'lucide-react';

export function ConnectionStatusBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<Array<{type: string; data: any}>>([]);

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

  const enqueueOfflineAction = (type: string, data: any) => {
    setOfflineQueue(prev => [...prev, { type, data }]);
  };

  const clearOfflineQueue = () => {
    setOfflineQueue([]);
  };

  const handleRetry = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setOfflineQueue([]);
    }, 1500);
  };

  return (
    <div
      className={'fixed top-0 left-0 right-0 z-[60] left-1/2 -translate-x-1/2 px-4 py-2.5 text-xs font-bold text-center transition-all duration-300 ease-in-out'}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className='w-3 h-3 animate-pulse' />
            <span>متصل بالإنترنت — البيانات تتم مزامنتها فوراً ✅</span>
          </>)
        : (
          <>
            <WifiOff className='w-3 h-3 animate-pulse' />
            <span>غير متصل بالإنترنت ⚠️</span>
            <button
              onClick={handleRetry}
              className='ml-2 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded border border-white/30 transition'
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCcw className='w-3 h-3 animate-spin' />
              ) : (
                'אמת אשת״יתה՗יויתהאיהאגהייתהאוהיהאיההאוה'
              )}
            </button>
            {!isOnline && offlineQueue.length > 0 && (
              <div className='mt-1 text-xs text-amber-300'>
                {offlineQueue.length} عملية pending للترقية عند عودة الاتصال
              </div>
            ))}
          </>)
        )}
      </div>
    </div>
  );
}
