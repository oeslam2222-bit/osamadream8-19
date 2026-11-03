import { CheckCircle2, Clock, RefreshCw, WifiOff } from 'lucide-react';
import React from 'react';
import { useApp } from '../context/AppContext';

/**
 * مؤشر حالة الاتصال والمزامنة — صغير وغير حاجب.
 * يطمئن المندوب إن بياناته محفوظة محلياً أوفلاين ومتزامنة تدريجياً
 * بدل ما يحس إن التطبيق بيرجع يحمل من أول كل مرة.
 */
export const SyncStatusIndicator: React.FC = () => {
  const { isOffline, isVersionSyncing, offlineQueueCount } = useApp();

  let state: 'offline' | 'syncing' | 'pending' | 'synced' = 'synced';
  let label = 'متزامن';
  let title = 'كل البيانات محدّثة ومتزامنة مع السيرفر';

  if (isOffline) {
    state = 'offline';
    label = offlineQueueCount > 0 ? `أوفلاين • ${offlineQueueCount} محفوظ` : 'أوفلاين';
    title = 'لا يوجد إنترنت — بياناتك محفوظة على الجهاز وستُرسل تلقائياً عند الاتصال';
  } else if (isVersionSyncing) {
    state = 'syncing';
    label = 'جارٍ المزامنة...';
    title = 'يتم التحقق من أحدث إصدار للبيانات ومزامنته تدريجياً';
  } else if (offlineQueueCount > 0) {
    state = 'pending';
    label = `${offlineQueueCount} تغييرات بانتظار`;
    title = 'تغييرات محفوظة محلياً بانتظار الإرسال إلى السيرفر';
  }

  const styles: Record<typeof state, string> = {
    offline: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    syncing: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    pending: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    synced: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={`flex items-center gap-1.5 h-9 px-2.5 rounded-xl border text-[10px] font-black whitespace-nowrap cursor-default select-none ${styles[state]}`}
    >
      {state === 'offline' && <WifiOff className="w-3.5 h-3.5 shrink-0" />}
      {state === 'syncing' && <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />}
      {state === 'pending' && <Clock className="w-3.5 h-3.5 shrink-0" />}
      {state === 'synced' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
      {/* النص يختفي على الموبايل عشان الشريط العلوي مش يزدحم — الأيقونة كافية */}
      <span className="truncate max-w-[130px] hidden sm:inline">{label}</span>
    </div>
  );
};

export default SyncStatusIndicator;
