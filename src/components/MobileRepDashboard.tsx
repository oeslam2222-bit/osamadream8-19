import {
  BookOpen,
  Boxes,
  CalendarCheck,
  ChevronDown,
  Coins,
  FileText,
  LayoutDashboard,
  Layers,
  MapPin,
  RotateCcw,
  ShoppingCart,
  Store,
  Target,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { LucideIcon } from 'lucide-react';

interface MobileRepDashboardProps {
  onNavigate: (tab: string) => void;
  onNewInvoice: () => void;
}

interface RepTile {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  ring: string;
  action: () => void;
}

const todayKey = (): string => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
};

const isMyRecord = (repId?: string, repName?: string, currentUserId?: string, currentUserName?: string): boolean => {
  if (!currentUserId && !currentUserName) return true;
  if (repId && currentUserId && repId === currentUserId) return true;
  if (repName && currentUserName && repName === currentUserName) return true;
  return false;
};

export const MobileRepDashboard: React.FC<MobileRepDashboardProps> = ({
  onNavigate,
  onNewInvoice,
}) => {
  const { currentUser, isOffline, visits, invoices } = useApp();
  const [showMore, setShowMore] = useState(false);

  const today = useMemo(() => todayKey(), []);

  const stats = useMemo(() => {
    const myVisitsToday = visits.filter(
      (v) =>
        v.date === today &&
        isMyRecord(v.repId, v.repName, currentUser?.id, currentUser?.name)
    ).length;
    const myInvoices = invoices.filter((i) =>
      isMyRecord(i.repId, i.repName, currentUser?.id, currentUser?.name)
    );
    const pendingReview = myInvoices.filter(
      (i) =>
        i.status === 'قيد مراجعة المشرف' ||
        i.status === 'معلقة بانتظار اعتماد الفرع' ||
        i.status === 'قيد المراجعة'
    ).length;
    return { myVisitsToday, myInvoices: myInvoices.length, pendingReview };
  }, [visits, invoices, today, currentUser?.id, currentUser?.name]);

  const fieldTiles: RepTile[] = [
    {
      id: 'customers',
      label: 'العملاء',
      hint: 'قائمة عملاء المندوب',
      icon: Users,
      accent: 'bg-blue-500',
      ring: 'group-active:border-blue-300',
      action: () => onNavigate('all_customers'),
    },
    {
      id: 'catalog',
      label: 'الكتالوج',
      hint: 'الأصناف والأسعار',
      icon: Boxes,
      accent: 'bg-cyan-500',
      ring: 'group-active:border-cyan-300',
      action: () => onNavigate('catalog'),
    },
    {
      id: 'new-invoice',
      label: 'فاتورة مبيعات',
      hint: 'طلبية جديدة',
      icon: ShoppingCart,
      accent: 'bg-emerald-500',
      ring: 'group-active:border-emerald-300',
      action: onNewInvoice,
    },
    {
      id: 'visits',
      label: 'الزيارات',
      hint: 'خط السير و GPS',
      icon: MapPin,
      accent: 'bg-rose-500',
      ring: 'group-active:border-rose-300',
      action: () => onNavigate('visits'),
    },
    {
      id: 'returns',
      label: 'المرتجعات',
      hint: 'مرتجع فاتورة',
      icon: RotateCcw,
      accent: 'bg-amber-500',
      ring: 'group-active:border-amber-300',
      action: () => onNavigate('invoices'),
    },
  ];

  const moneyTiles: RepTile[] = [
    {
      id: 'collections',
      label: 'التحصيلات',
      hint: 'سند قبض / تحصيل',
      icon: Coins,
      accent: 'bg-purple-500',
      ring: 'group-active:border-purple-300',
      action: () => onNavigate('visits'),
    },
    {
      id: 'statement',
      label: 'كشف حساب العميل',
      hint: 'المديونيات وسقف الائتمان',
      icon: Wallet,
      accent: 'bg-indigo-500',
      ring: 'group-active:border-indigo-300',
      action: () => onNavigate('all_customers'),
    },
    {
      id: 'debts',
      label: 'المديونيات',
      hint: 'أعلى العملاء ديناً',
      icon: FileText,
      accent: 'bg-pink-500',
      ring: 'group-active:border-pink-300',
      action: () => onNavigate('all_customers'),
    },
  ];

  const reportTiles: RepTile[] = [
    {
      id: 'sales-report',
      label: 'تقرير المبيعات',
      hint: 'متابعة طلبياتي',
      icon: LayoutDashboard,
      accent: 'bg-teal-500',
      ring: 'group-active:border-teal-300',
      action: () => onNavigate('dashboard'),
    },
    {
      id: 'forecast',
      label: 'توقعات التحصيل',
      hint: 'المتوقع تحصيله',
      icon: TrendingUp,
      accent: 'bg-orange-500',
      ring: 'group-active:border-orange-300',
      action: () => onNavigate('forecast'),
    },
    {
      id: 'targets',
      label: 'هدفي والتارجت',
      hint: 'المبيعات والتحصيل',
      icon: Target,
      accent: 'bg-lime-500',
      ring: 'group-active:border-lime-300',
      action: () => onNavigate('targets'),
    },
  ];

  const moreTiles: RepTile[] = [
    {
      id: 'inventory',
      label: 'المخزون',
      hint: 'الأرصدة المتاحة',
      icon: Layers,
      accent: 'bg-sky-500',
      ring: 'group-active:border-sky-300',
      action: () => onNavigate('inventory'),
    },
    {
      id: 'guide',
      label: 'دليل دورة العمل',
      hint: 'طريقة التشغيل',
      icon: BookOpen,
      accent: 'bg-slate-500',
      ring: 'group-active:border-slate-300',
      action: () => onNavigate('guide'),
    },
  ];

  const renderTile = (tile: RepTile) => {
    const Icon = tile.icon;
    return (
      <button
        key={tile.id}
        type="button"
        onClick={tile.action}
        className={`group flex flex-col items-center justify-center gap-1.5 p-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[104px] transition-all duration-150 active:scale-95 cursor-pointer ${tile.ring}`}
      >
        <span
          className={`w-11 h-11 ${tile.accent} text-white rounded-full flex items-center justify-center shadow-md`}
        >
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <span className="text-[12px] font-bold text-slate-800 text-center leading-tight">
          {tile.label}
        </span>
        <span className="text-[10px] font-medium text-slate-400 text-center leading-tight -mt-0.5">
          {tile.hint}
        </span>
      </button>
    );
  };

  const sectionTitle = (text: string) => (
    <h2 className="text-[13px] font-black text-slate-700 px-1 mb-2 flex items-center gap-1.5">
      <span className="w-1 h-3.5 rounded-full bg-amber-400 inline-block" />
      {text}
    </h2>
  );

  return (
    <div className="space-y-4">
      {/* ترويسة المندوب */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={currentUser?.avatar || '/pwa-192x192.png'}
              alt={currentUser?.name || 'المندوب'}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-400 shadow-sm"
            />
            <div>
              <h1 className="font-black text-slate-900 text-base">
                {currentUser?.name || 'المندوب'}
              </h1>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                {currentUser?.branchName || 'كل الفروع'} • المندوب الميداني
              </p>
            </div>
          </div>
          {isOffline && (
            <span className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap">
              <WifiOff className="w-3 h-3" />
              أوفلاين
            </span>
          )}
        </div>

        {/* ملخص اليوم */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-lg font-black text-rose-500">{stats.myVisitsToday}</div>
            <div className="text-[10px] font-bold text-slate-500">زيارات اليوم</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-lg font-black text-blue-500">{stats.myInvoices}</div>
            <div className="text-[10px] font-bold text-slate-500">طلبياتي</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-lg font-black text-amber-500">{stats.pendingReview}</div>
            <div className="text-[10px] font-bold text-slate-500">قيد المراجعة</div>
          </div>
        </div>
      </div>

      {/* العمليات الميدانية اليومية */}
      <section>
        {sectionTitle('العمليات الميدانية اليومية')}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {fieldTiles.map(renderTile)}
        </div>
      </section>

      {/* التحصيلات والماليات */}
      <section>
        {sectionTitle('التحصيلات والماليات')}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {moneyTiles.map(renderTile)}
        </div>
      </section>

      {/* التقارير السريعة */}
      <section>
        {sectionTitle('التقارير السريعة للمندوب')}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {reportTiles.map(renderTile)}
        </div>
      </section>

      {/* المزيد */}
      <section>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 mb-2 cursor-pointer active:scale-[0.99] transition-transform"
        >
          <span className="text-[13px] font-black text-slate-700 flex items-center gap-1.5">
            <span className="w-1 h-3.5 rounded-full bg-slate-400 inline-block" />
            المزيد
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${showMore ? 'rotate-180' : ''}`}
          />
        </button>
        {showMore && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {moreTiles.map(renderTile)}
          </div>
        )}
      </section>

      {/* تلميح التثبيت */}
      <p className="text-center text-[10px] text-slate-400 font-semibold px-4">
        <Store className="w-3 h-3 inline-block ml-1" />
        نفس بيانات السيرفر — الصفحات والأرقام واحدة على الموبايل والكمبيوتر
      </p>
    </div>
  );
};

export default MobileRepDashboard;
