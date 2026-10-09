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
    offline: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
    syncing: 'bg-sky-500/20 text-sky-300 border-sky-400/50',
    pending: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
    synced: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
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
