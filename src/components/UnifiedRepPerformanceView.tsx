import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Search, Building2, Wallet, ShoppingCart, TrendingUp,
  ChevronRight, ChevronLeft, X, Clock, MapPin, CreditCard,
  AlertTriangle, CheckCircle2, FileText, BarChart3, RefreshCw,
  ArrowUpRight, Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  filterTargetsForUser, inferTargetSector,
} from '../services/targetService';
import type { Customer, TargetRecord } from '../types';
import { formatCurrency } from '../services/invoiceService';

interface UnifiedRepPerformanceViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmt(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function pctOf(achieved: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((achieved / target) * 100));
}

export const UnifiedRepPerformanceView: React.FC<UnifiedRepPerformanceViewProps> = ({
  onOpenNewOrderForCustomer,
}) => {
  const {
    currentUser,
    users,
    customers,
    targets,
    getVisibleTargets,
    getVisibleCustomers,
    getVisibleInvoices,
    selectedBranchFilter,
    setSelectedBranchFilter,
  } = useApp();

  /* ---------- حالة الصفحة ---------- */
  const [searchRep, setSearchRep] = useState('');
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [visibleRepsCount, setVisibleRepsCount] = useState(8);
  const [openRepId, setOpenRepId] = useState<string | null>(null);
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* إعادة ضبط التحميل التدريجي عند تغيير الفلاتر */
  useEffect(() => {
    setVisibleRepsCount(8);
    setVisibleCustomersCount(10);
    setOpenRepId(null);
  }, [searchRep, selectedSector, selectedBranchFilter]);

  /* ---------- البيانات المرئية للمستخدم ---------- */
  const visibleTargets = useMemo(() => {
    return getVisibleTargets();
  }, [targets, currentUser, users, customers, getVisibleTargets]);

  const visibleCustomersAll = useMemo(() => {
    return getVisibleCustomers();
  }, [customers, currentUser, getVisibleCustomers]);

  const visibleInvoices = useMemo(() => {
    return getVisibleInvoices();
  }, [targets, currentUser, getVisibleInvoices]);

  /* ---------- تجميع بيانات المندوبين ---------- */
  type RepAgg = {
    repName: string;
    repId: string;
    branch: string;
    sector: 'home' | 'electrical' | 'all' | 'both' | undefined;
    salesTarget: number;
    salesAchieved: number;
    collectionTarget: number;
    collectionAchieved: number;
    customerCount: number;
    lastMonth?: string;
  };

  const repsMap = useMemo(() => {
    const map = new Map<string, RepAgg>();
    const now = new Date();
    const latestYear = now.getFullYear();
    const latestMonth = now.getMonth() + 1;

    for (const t of visibleTargets) {
      const repName = t.repName || 'غير محدد';
      const repId = t.id || repName;
      const branch = t.branch || '—';
      const sector = inferTargetSector(t, users);

      let existing = map.get(repId);
      if (!existing) {
        existing = {
          repName,
          repId,
          branch,
          sector,
          salesTarget: 0,
          salesAchieved: 0,
          collectionTarget: 0,
          collectionAchieved: 0,
          customerCount: 0,
        };
        map.set(repId, existing);
      }

      const y = Number(t.year);
      const m = Number(t.month);
      const isLatest = (y === latestYear && m === latestMonth);
      if (isLatest) {
        existing.lastMonth = `${MONTHS_AR[m - 1]} ${y}`;
      }

      existing.salesTarget += Number(t.salesTarget || 0);
      existing.salesAchieved += Number(t.salesAchieved || 0);
      existing.collectionTarget += Number(t.collectionTarget || 0);
      existing.collectionAchieved += Number(t.collectionAchieved || 0);
    }

    // عدد العملاء لكل مندوب
    for (const c of visibleCustomersAll) {
      const repId = c.repId || c.salesRepId || c.repName || c.salesRepName || 'غير محدد';
      const existing = map.get(repId);
      if (existing) {
        existing.customerCount += 1;
      } else {
        // مندوب له عملاء لكنه مسجل في الأهداف (أو العكس)
        map.set(repId, {
          repName: c.salesRepName || c.repName || repId,
          repId,
          branch: c.branchName || '—',
          sector: c.sector,
          salesTarget: 0,
          salesAchieved: 0,
          collectionTarget: 0,
          collectionAchieved: 0,
          customerCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.salesAchieved - a.salesAchieved);
  }, [visibleTargets, visibleCustomersAll, users]);

  /* ---------- تطبيق الفلاتر ---------- */
  const filteredReps = useMemo(() => {
    const q = searchRep.trim().toLowerCase();
    return repsMap.filter((rep) => {
      const matchesSearch =
        !q ||
        rep.repName.toLowerCase().includes(q) ||
        rep.repId.toLowerCase().includes(q) ||
        rep.branch.toLowerCase().includes(q);
      const matchesBranch =
        selectedBranchFilter === 'الكل' || rep.branch === selectedBranchFilter;
      const matchesSector =
        selectedSector === 'all' ||
        !rep.sector ||
        rep.sector === 'all' ||
        rep.sector === 'both' ||
        rep.sector === selectedSector;
      return matchesSearch && matchesBranch && matchesSector;
    });
  }, [repsMap, searchRep, selectedBranchFilter, selectedSector]);

  const displayedReps = useMemo(() => {
    return filteredReps.slice(0, visibleRepsCount);
  }, [filteredReps, visibleRepsCount]);

  /* ---------- workاء المندوب المختار ---------- */
  const selectedRep = useMemo(() => {
    return displayedReps.find((r) => r.repId === openRepId) || null;
  }, [displayedReps, openRepId]);

  const repCustomers = useMemo(() => {
    if (!selectedRep) return [];
    const repName = selectedRep.repName;
    const repId = selectedRep.repId;

    return visibleCustomersAll.filter((c) => {
      const cRepId = c.repId || c.salesRepId || c.repName || c.salesRepName || '';
      const cRepName = c.salesRepName || c.repName || '';
      return cRepId === repId || cRepName === repName || c.repId === repId;
    });
  }, [selectedRep, visibleCustomersAll]);

  const displayedRepCustomers = useMemo(() => {
    return repCustomers.slice(0, visibleCustomersCount);
  }, [repCustomers, visibleCustomersCount]);

  /* ---------- مؤشرات عامة ---------- */
  const totalSalesTarget = filteredReps.reduce((sum, r) => sum + r.salesTarget, 0);
  const totalSalesAchieved = filteredReps.reduce((sum, r) => sum + r.salesAchieved, 0);
  const totalCollectionTarget = filteredReps.reduce((sum, r) => sum + r.collectionTarget, 0);
  const totalCollectionAchieved = filteredReps.reduce((sum, r) => sum + r.collectionAchieved, 0);
  const overallSalesPct = pctOf(totalSalesAchieved, totalSalesTarget);
  const overallCollPct = pctOf(totalCollectionAchieved, totalCollectionTarget);

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    filteredReps.forEach((r) => { if (r.branch && r.branch !== '—') set.add(r.branch); });
    return ['الكل', ...Array.from(set).sort()];
  }, [filteredReps]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleOpenRep = (repId: string) => {
    setOpenRepId((prev) => (prev === repId ? null : repId));
    setVisibleCustomersCount(10);
  };

  const handleOpenOrderForCustomer = (cust: Customer) => {
    if (onOpenNewOrderForCustomer) {
      onOpenNewOrderForCustomer(cust);
    }
    setOpenRepId(null);
  };

  const handleSelectSector = (val: 'all' | 'home' | 'electrical') => {
    setSelectedSector(val);
    setOpenRepId(null);
  };

  /* ---------- render ---------- */
  return (
    <div className="tg-dash space-y-4" dir="rtl">

      {/* ---------- ترويسة الصفحة ---------- */}
      <section className="ds-pagehead">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              الرئيسية <span className="mx-1 text-[#7fc0ff]">›</span> الأداء المتقدم
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  أداء المندوبين والعملاء
                </h1>
                <p className="text-xs text-[#c3d9ec] mt-0.5">
                  تجميع أهداف المبيعات والتحصيل لكل mandob مع تفاصيل عملاءه المالية في صفحة واحدة.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isRefreshing}
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-black border border-white/20 bg-white/10 text-white hover:bg-white/20 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      {/* ---------- مؤشرات عامة ---------- */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="tg-kpi tg-kpi--blue">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><Users size={20} /></span>
            <ArrowUpRight size={16} className="tg-kpi__arrow opacity-50" />
          </div>
          <span className="tg-kpi__value">{filteredReps.length.toLocaleString('en-US')}</span>
          <span className="tg-kpi__label">مندوب ظاهر</span>
          <span className="tg-kpi__hint">من أصل {repsMap.length}</span>
        </div>

        <div className="tg-kpi tg-kpi--amber">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><ShoppingCart size={20} /></span>
            <ArrowUpRight size={16} className="tg-kpi__arrow opacity-50" />
          </div>
          <span className="tg-kpi__value">{fmt(totalSalesTarget)} ج.م</span>
          <span className="tg-kpi__label">هدف المبيعات</span>
          <span className="tg-kpi__hint">الفترة المختارة</span>
        </div>

        <div className="tg-kpi tg-kpi--emerald">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><Wallet size={20} /></span>
            <ArrowUpRight size={16} className="tg-kpi__arrow opacity-50" />
          </div>
          <span className="tg-kpi__value">{fmt(totalSalesAchieved)} ج.م</span>
          <span className="tg-kpi__label">المحقق مبيعات</span>
          <span className="tg-kpi__hint">{overallSalesPct}% من الهدف</span>
        </div>

        <div className="tg-kpi tg-kpi--violet">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><CreditCard size={20} /></span>
            <ArrowUpRight size={16} className="tg-kpi__arrow opacity-50" />
          </div>
          <span className="tg-kpi__value">{fmt(totalCollectionAchieved)} ج.م</span>
          <span className="tg-kpi__label">المحقق تحصيل</span>
          <span className="tg-kpi__hint">{overallCollPct}% من الهدف</span>
        </div>
      </section>

      {/* ---------- فلاتر ---------- */}
      <section className="tg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchRep}
              onChange={(e) => setSearchRep(e.target.value)}
              placeholder="ابحث باسم المندوب أو الكود أو الفرع..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-[var(--tg-line)] rounded-xl text-sm font-bold text-[#0b2337] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition"
            />
          </div>

          <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[150px]">
            <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">الفرع</span>
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
            >
              {branchOptions.map((b) => (
                <option key={b} value={b}>{b === 'الكل' ? 'كل الفروع' : b}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[150px]">
            <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">القطاع</span>
            <select
              value={selectedSector}
              onChange={(e) => handleSelectSector(e.target.value as 'all' | 'home' | 'electrical')}
              className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
            >
              <option value="all">كل القطاعات</option>
              <option value="home">المنزلي</option>
              <option value="electrical">الكهربائي</option>
            </select>
          </div>
        </div>
      </section>

      {/* ---------- جدول المندوبين ---------- */}
      <div className="rounded-[28px] border border-[var(--tg-line)] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-[var(--tg-navy-700)] text-white font-black sticky top-0 z-10">
              <tr>
                <th className="p-3.5 text-[11px] font-black whitespace-nowrap">المندوب</th>
                <th className="p-3.5 text-[11px] whitespace-nowrap">الفرع</th>
                <th className="p-3.5 text-[11px] whitespace-nowrap">القطاع</th>
                <th className="p-3.5 text-center whitespace-nowrap">هدف المبيعات</th>
                <th className="p-3.5 text-center whitespace-nowrap">المحقق بيع</th>
                <th className="p-3.5 text-center whitespace-nowrap">نسبة البيع</th>
                <th className="p-3.5 text-center whitespace-nowrap">هدف التحصيل</th>
                <th className="p-3.5 text-center whitespace-nowrap">المحقق تحصيل</th>
                <th className="p-3.5 text-center whitespace-nowrap">نسبة التحصيل</th>
                <th className="p-3.5 text-center whitespace-nowrap">العملاء</th>
                <th className="p-3.5 text-center whitespace-nowrap">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tg-line)] bg-white">
              {displayedReps.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-xs font-bold text-slate-400">
                    لا يوجد مناديب مطابقة للفلاتر الحالية
                  </td>
                </tr>
              ) : (
                displayedReps.map((rep) => {
                  const salesPct = pctOf(rep.salesAchieved, rep.salesTarget);
                  const collPct = pctOf(rep.collectionAchieved, rep.collectionTarget);
                  const isOpen = openRepId === rep.repId;

                  return (
                    <tr key={rep.repId} className="hover:bg-[#f6f9fe] transition-colors border-b border-[var(--tg-line)] last:border-0 group cursor-pointer">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-[#0b2337]">{rep.repName}</span>
                          {rep.lastMonth && (
                            <span className="text-[10px] text-slate-400 font-medium">{rep.lastMonth}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="text-sm text-slate-600 font-medium">{rep.branch}</span>
                      </td>
                      <td className="p-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rep.sector === 'home' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                          rep.sector === 'electrical' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                          'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}>
                          {rep.sector === 'home' ? 'منزلي' : rep.sector === 'electrical' ? 'كهربائي' : 'غير محدد'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="text-sm font-black text-slate-600 tabular-nums">{fmt(rep.salesTarget)}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="text-sm font-black text-blue-700 tabular-nums">{fmt(rep.salesAchieved)}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          salesPct >= 100 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          salesPct >= 70 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          {salesPct}%
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="text-sm font-black text-slate-600 tabular-nums">{fmt(rep.collectionTarget)}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="text-sm font-black text-emerald-700 tabular-nums">{fmt(rep.collectionAchieved)}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          collPct >= 100 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          collPct >= 70 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          {collPct}%
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="text-sm font-black text-slate-900 tabular-nums">{rep.customerCount}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenRep(rep.repId)}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
                            isOpen
                              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/25'
                              : 'bg-slate-50 text-slate-600 border border-[var(--tg-line)] hover:bg-slate-100'
                          }`}
                          title={isOpen ? 'إغلاق التفاصيل' : 'عرض تفاصيل العملاء'}
                        >
                          {isOpen ? (
                            <ChevronLeft className="w-4 h-4 text-white" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {visibleRepsCount < filteredReps.length && (
          <div className="flex justify-center p-4 border-t border-[var(--tg-line)] bg-slate-50/60">
            <button
              type="button"
              onClick={() => setVisibleRepsCount((c) => c + 8)}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shadow-sm"
            >
              عرض المزيد من المندوبين ({filteredReps.length - visibleRepsCount} متبقي)
            </button>
          </div>
        )}
      </div>

      {/* ---------- درج عملاء المندوب المختار (يمين الشاشة) ---------- */}
      {selectedRep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          onClick={() => setOpenRepId(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={(e) => e.stopPropagation()} />
          <div
            className="w-full sm:max-w-[480px] max-h-[90vh] bg-white rounded-[28px] shadow-2xl border border-[var(--tg-line)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 bg-[var(--tg-navy-700)] text-white p-4 sm:p-5 sticky top-0 z-10 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-black text-sm">{selectedRep.repName}</div>
                  <div className="text-[10px] text-[#a9c8e4] font-medium">
                    {selectedRep.branch} • {getSectorLabel(selectedRep.sector)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenRepId(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {/* مؤشرات المندوب */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="tg-stat tg-stat--blue p-3">
                  <span className="text-[10px] font-bold text-blue-800 block">هدف المبيعات</span>
                  <span className="font-black text-sm text-blue-700 tabular-nums">{fmt(selectedRep.salesTarget)}</span>
                </div>
                <div className="tg-stat tg-stat--emerald p-3">
                  <span className="text-[10px] font-bold text-emerald-800 block">المحقق بيع</span>
                  <span className="font-black text-sm text-emerald-700 tabular-nums">{fmt(selectedRep.salesAchieved)}</span>
                </div>
                <div className="tg-stat tg-stat--amber p-3">
                  <span className="text-[10px] font-bold text-amber-800 block">هدف التحصيل</span>
                  <span className="font-black text-sm text-amber-700 tabular-nums">{fmt(selectedRep.collectionTarget)}</span>
                </div>
                <div className="tg-stat tg-stat--violet p-3">
                  <span className="text-[10px] font-bold text-violet-800 block">المحقق تحصيل</span>
                  <span className="font-black text-sm text-violet-700 tabular-nums">{fmt(selectedRep.collectionAchieved)}</span>
                </div>
              </div>

              {/* عملاء المندوب */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-black text-[#0b2337]">عملاء {selectedRep.repName}</h3>
                  <span className="text-[11px] font-bold text-slate-500">{displayedRepCustomers.length} من {repCustomers.length}</span>
                </div>

                {displayedRepCustomers.length === 0 ? (
                  <div className="tg-card p-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[20px] bg-slate-100 text-slate-400">
                      <Users className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">لا يوجد عملاء لهذا المندوب</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayedRepCustomers.map((cust) => {
                      const balance = Number(cust.currentBalance ?? cust.balance ?? 0);
                      const overdue = Number(cust.overdueBalance ?? cust.totalOverdueAndDue ?? 0);
                      const limit = Number(cust.creditLimit ?? 0);
                      const exceeded = limit > 0 && (balance + overdue) > limit;

                      return (
                        <div
                          key={cust.id}
                          onClick={() => {
                            handleOpenOrderForCustomer(cust);
                          }}
                          className="tg-card p-3.5 cursor-pointer hover:bg-blue-50/40 transition border-[var(--tg-line)] group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-black text-sm text-[#0b2337] truncate">{cust.name}</div>
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center gap-1 flex-wrap">
                                <span className="font-mono">{cust.code}</span>
                                {cust.phone && <span>• {cust.phone}</span>}
                              </div>
                              {cust.branchName && (
                                <div className="text-[10px] text-slate-400 mt-0.5">{cust.branchName}</div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className={`text-xs font-black tabular-nums ${exceeded ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {fmt(balance + overdue)}
                              </div>
                              <div className="text-[10px] font-bold text-slate-500">مديونية</div>
                            </div>
                          </div>

                          {limit > 0 && (
                            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, ((balance + overdue) / limit) * 100)}%`,
                                  backgroundColor: exceeded ? '#fca5a5' : '#34d399',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {visibleCustomersCount < repCustomers.length && (
                  <div className="flex justify-center mt-3">
                    <button
                      type="button"
                      onClick={() => setVisibleCustomersCount((c) => c + 10)}
                      className="px-4 py-2 rounded-xl border border-[var(--tg-line)] bg-white text-[#0b2337] font-black text-xs hover:bg-[#eef5fd] transition cursor-pointer"
                    >
                      عرض المزيد من العملاء ({repCustomers.length - visibleCustomersCount} متبقي)
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--tg-line)]">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenOrderForCustomer(selectedRep as unknown as Customer);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white font-black text-sm shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-600 transition shadow-sm cursor-pointer"
                >
                  <Plus size={16} />
                  فاتورة جديدة لهذا المندوب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- تحميل المزيد من المندوبين ---------- */}
      {visibleRepsCount < filteredReps.length && (
        <div className="flex justify-center p-4">
          <button
            type="button"
            onClick={() => setVisibleRepsCount((c) => c + 8)}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer shadow-sm"
          >
            عرض المزيد من المندوبين ({filteredReps.length - visibleRepsCount} متبقي)
          </button>
        </div>
      )}
    </div>
  );
};

function getSectorLabel(s?: string): string {
  if (!s || s === 'all' || s === 'both') return 'غير محدد';
  if (s === 'home') return 'منزلي';
  if (s === 'electrical') return 'كهربائي';
  return s;
}

export default UnifiedRepPerformanceView;
