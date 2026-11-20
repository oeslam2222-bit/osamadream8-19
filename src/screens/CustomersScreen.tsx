import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Building2,
  Phone,
  MapPin,
  User,
  ShieldCheck,
  Plus,
  Eye,
  ChevronDown,
  X,
  AlertTriangle,
  CheckCircle2,
  Home,
  Zap,
  ShoppingCart,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { normalizeArabicText } from '../services/arabicMatchingService';

interface CustomerFilterState {
  sector: 'all' | 'home' | 'electrical' | 'both';
  branch: string;
  rep: string;
  supervisor: string;
  search: string;
}

export const CustomersScreen: React.FC = () => {
  const {
    customers,
    currentUser,
    users,
    branches,
    activeSectorFilter,
    getVisibleCustomers,
    setActiveSectorFilter,
  } = useApp();

  // Roles & permissions
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';

  // ---------- Filter State ----------
  const [filter, setFilter] = useState<CustomerFilterState>({
    sector: 'all',
    branch: 'ALL',
    rep: 'ALL',
    supervisor: 'ALL',
    search: '',
  });

  // Sync sector filter from global context (top bar / navbar)
  useEffect(() => {
    if (activeSectorFilter && activeSectorFilter !== 'all') {
      setFilter((prev) => ({ ...prev, sector: activeSectorFilter as CustomerFilterState['sector'] }));
    }
  }, [activeSectorFilter]);

  const handleFilterChange = useCallback(
    (key: keyof CustomerFilterState, value: string) => {
      setFilter((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleResetFilters = useCallback(() => {
    setFilter({ sector: 'all', branch: 'ALL', rep: 'ALL', supervisor: 'ALL', search: '' });
  }, []);

  // ---------- RBAC: Which customers can this user see? ----------
  //  بوابة السياق نفسها: دور + فرع + قطاع ('none' = محجوب عن القطاعين).
  const userVisibleCustomers = useMemo(() => {
    return getVisibleCustomers();
  }, [getVisibleCustomers]);

  // ---------- Available filter options ----------
  const availableBranches = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (c.branchName) s.add(c.branchName);
    });
    return Array.from(s).sort();
  }, [userVisibleCustomers]);

  const availableReps = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      const r = c.salesRepName || c.repName;
      if (r) s.add(r);
    });
    return Array.from(s).sort();
  }, [userVisibleCustomers]);

  const availableSupervisors = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (c.supervisorName) s.add(c.supervisorName);
    });
    users.forEach((u) => {
      if (u.role === 'supervisor') s.add(u.name);
    });
    return Array.from(s).sort();
  }, [userVisibleCustomers, users]);

  // ---------- Apply Filters ----------
  const filteredCustomers = useMemo(() => {
    let list = userVisibleCustomers;

    // Sector filter (منزلي / كهربائي / كلاهما)
    if (filter.sector !== 'all') {
      list = list.filter((c) => c.sector === filter.sector || c.sector === 'both');
    }

    // Branch filter
    if (filter.branch !== 'ALL') {
      list = list.filter((c) => c.branchName === filter.branch);
    }

    // Rep filter
    if (filter.rep !== 'ALL') {
      list = list.filter((c) => (c.salesRepName || c.repName) === filter.rep);
    }

    // Supervisor filter
    if (filter.supervisor !== 'ALL') {
      list = list.filter((c) => c.supervisorName === filter.supervisor);
    }

    // Search by name / code / phone
    if (filter.search.trim()) {
      const q = normalizeArabicText(filter.search);
      list = list.filter((c) => {
        const name = normalizeArabicText(c.name || '');
        const code = normalizeArabicText(c.code || '');
        const phone = (c.phone || '').replace(/[^0-9]/g, '');
        return (
          name.includes(q) ||
          code.includes(q) ||
          phone.includes(filter.search.replace(/[^0-9]/g, ''))
        );
      });
    }

    return list;
  }, [userVisibleCustomers, filter, currentUser?.name]);

  // ---------- إحصائيات إجمالية (تتغير حسب فلتر القطاع) ----------
  const totalSales = useMemo(() => {
    return filteredCustomers.reduce((acc, c) => {
      const sales = Number(c.sales2026 || c.totalMonthlySales || c.totalOverallSales || 0);
      return acc + sales;
    }, 0);
  }, [filteredCustomers]);

  const totalCollections = useMemo(() => {
    return filteredCustomers.reduce((acc, c) => {
      const coll = Number(c.collections2026 || c.totalMonthlyCollections || c.totalOverallCollections || 0);
      return acc + coll;
    }, 0);
  }, [filteredCustomers]);

  const totalDebt = useMemo(() => {
    return filteredCustomers.reduce((acc, c) => {
      const debt = Number(c.currentBalance ?? c.balance ?? c.overdueBalance ?? 0);
      return acc + debt;
    }, 0);
  }, [filteredCustomers]);

  const totalOverdue = useMemo(() => {
    return filteredCustomers.reduce((acc, c) => {
      const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
      return acc + overdue;
    }, 0);
  }, [filteredCustomers]);

  const customersWithDebt = useMemo(() => {
    return filteredCustomers.filter((c) => Number(c.currentBalance ?? c.balance ?? c.overdueBalance ?? 0) > 0).length;
  }, [filteredCustomers]);

  const collectionRate = useMemo(() => {
    return totalSales > 0 ? Math.round((totalCollections / totalSales) * 100) : 0;
  }, [totalSales, totalCollections]);

  // ---------- Group customers by Rep ----------
  const customersByRep = useMemo(() => {
    const map = new Map<string, Customer[]>();
    filteredCustomers.forEach((c) => {
      const rep = c.salesRepName || c.repName || 'غير محدد';
      if (!map.has(rep)) map.set(rep, []);
      map.get(rep)!.push(c);
    });
    // Sort by customer count descending
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredCustomers]);

  // ---------- Helpers ----------
  const formatMoney = (amount: number | undefined | null): string => {
    return formatCurrency(amount || 0);
  };

  const getCreditStatus = (c: Customer) => {
    const balance = Number(c.currentBalance ?? c.balance ?? 0);
    const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
    const limit = Number(c.creditLimit ?? 0);
    const total = balance + overdue;
    if (limit > 0 && total > limit) {
      return { label: 'تجاوز الحد', color: 'text-[var(--app-risk)] bg-[var(--app-risk-tint)] border-[var(--app-risk-line)]' };
    }
    if (limit > 0 && total > limit * 0.7) {
      return { label: 'قريب من الحد', color: 'text-[var(--app-warn)] bg-[var(--app-warn-tint)] border-[var(--app-warn-line)]' };
    }
    return { label: 'داخل الحد', color: 'text-[var(--app-ok)] bg-[var(--app-ok-tint)] border-[var(--app-ok-line)]' };
  };

  const sectorLabel = (s?: string) => {
    if (!s || s === 'all') return '—';
    if (s === 'home') return 'منزلي';
    if (s === 'electrical') return 'كهربائي';
    if (s === 'both') return 'كلاهما';
    return s;
  };

  return (
    <div className="min-h-full bg-[#f4f6f9] dark:bg-slate-950 pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">العملاء</h1>
          </div>
          <button className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center active:scale-95 transition hover:bg-blue-500">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* كرتين منفصلتين للقطاعات — منزلي وكهرباء — لفصل العملاء بين بعضهم */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => handleFilterChange('sector', 'home')}
            className={`px-3 py-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
              filter.sector === 'home'
                ? 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)] shadow-sm'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[var(--app-ok-line)]/50'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="font-black text-xs">قطاع المنزلي</span>
            <span className="text-[9px] font-bold">
              {userVisibleCustomers.filter((c) => c.sector === 'home' || c.sector === 'both').length} عميل
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('sector', 'electrical')}
            className={`px-3 py-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
              filter.sector === 'electrical'
                ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)] shadow-sm'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[var(--app-warn-line)]/50'
            }`}
          >
            <Zap className="w-5 h-5" />
            <span className="font-black text-xs">قطاع الكهرباء</span>
            <span className="text-[9px] font-bold">
              {userVisibleCustomers.filter((c) => c.sector === 'electrical' || c.sector === 'both').length} عميل
            </span>
          </button>
        </div>
      </div>

      {/* كروت الإحصائيات الإجمالية — مضغوطة لتناسب الشاشة */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
          {/* إجمالي المبيعات — أزرق/Neavy */}
          <article className="p-2.5 rounded-xl border border-[var(--app-navy-line)] bg-[var(--app-navy-tint)] shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-[var(--app-navy-text)]">إجمالي المبيعات</span>
              <ShoppingCart className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
            </div>
            <div className="font-black text-slate-900 dark:text-white text-base tabular-nums">
              {formatCurrency(totalSales)}
            </div>
            <div className="text-[9px] text-[var(--app-navy-text)] mt-0.5 font-bold">
              {filteredCustomers.length} عميل
            </div>
          </article>

          {/* إجمالي التحصيل — أخضر/Emerald */}
          <article className="p-2.5 rounded-xl border border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-[var(--app-ok-text)]">إجمالي التحصيل</span>
              <CreditCard className="w-3.5 h-3.5 text-[var(--app-ok-text)]" />
            </div>
            <div className="font-black text-slate-900 dark:text-white text-base tabular-nums">
              {formatCurrency(totalCollections)}
            </div>
            <div className="text-[9px] text-[var(--app-ok-text)] mt-0.5 font-bold">
              نسبة السداد {collectionRate}%
            </div>
          </article>

          {/* إجمالي المديونية — برتقالي/Warning */}
          <article className="p-2.5 rounded-xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-[var(--app-warn-text)]">إجمالي المديونية</span>
              <Wallet className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
            </div>
            <div className={`font-black text-base ${totalDebt > 0 ? 'text-[var(--app-warn-text)]' : 'text-slate-400'} tabular-nums`}>
              {formatCurrency(totalDebt)}
            </div>
            <div className="text-[9px] text-[var(--app-warn-text)] mt-0.5 font-bold">
              {customersWithDebt} عميل لديه مديونية
            </div>
          </article>

          {/* إجمالي المستحقات / المتأخرات — أحمر/Risk */}
          <article className="p-2.5 rounded-xl border border-[var(--app-risk-line)] bg-[var(--app-risk-tint)] shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-[var(--app-risk-text)]">المستحقات / المتأخرات</span>
              <AlertCircle className="w-3.5 h-3.5 text-[var(--app-risk-text)]" />
            </div>
            <div className={`font-black text-base ${totalOverdue > 0 ? 'text-[var(--app-risk-text)]' : 'text-slate-400'} tabular-nums`}>
              {formatCurrency(totalOverdue)}
            </div>
            <div className="text-[9px] text-[var(--app-risk-text)] mt-0.5 font-bold">
              مستحقات متأخرة
            </div>
          </article>

          {/* عدد العملاء الإجمالي — نيلي/Slate */}
          <article className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">عدد العملاء</span>
              <Users className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="font-black text-slate-900 dark:text-white text-base tabular-nums">
              {filteredCustomers.length}
            </div>
            <div className="text-[9px] text-slate-600 dark:text-slate-300 mt-0.5 font-bold">
              معروضون في القائمة
            </div>
          </article>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 pb-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
            {/* Sector */}
            <div className="flex flex-col sm:flex-row items-end gap-2">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">القطاع</label>
              <select
                value={filter.sector}
                onChange={(e) => handleFilterChange('sector', e.target.value as CustomerFilterState['sector'])}
                className="w-full sm:w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">جميع القطاعات</option>
                <option value="home">منزلي</option>
                <option value="electrical">كهربائي</option>
                <option value="both">القطاعين</option>
              </select>
            </div>

            {/* Branch - Admin / Dev / Branch Manager */}
            {(isAdminOrDev || isBranchManager) && (
              <div className="flex flex-col sm:flex-row items-end gap-2">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">الفرع</label>
                <select
                  value={filter.branch}
                  onChange={(e) => handleFilterChange('branch', e.target.value)}
                  className="w-full sm:w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">جميع الفروع</option>
                  {availableBranches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Rep - Admin / Dev / Supervisor / Branch Manager */}
            {(isAdminOrDev || isSupervisor || isBranchManager) && (
              <div className="flex flex-col sm:flex-row items-end gap-2">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">المندوب</label>
                <select
                  value={filter.rep}
                  onChange={(e) => handleFilterChange('rep', e.target.value)}
                  className="w-full sm:w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">جميع المندوبين</option>
                  {availableReps.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Supervisor - Admin / Dev only */}
            {isAdminOrDev && (
              <div className="flex flex-col sm:flex-row items-end gap-2">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">المشرف</label>
                <select
                  value={filter.supervisor}
                  onChange={(e) => handleFilterChange('supervisor', e.target.value)}
                  className="w-full sm:w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ALL">جميع المشرفين</option>
                  {availableSupervisors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث باسم العميل أو الكود أو الهاتف..."
                value={filter.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-black text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Reset */}
            <button
              onClick={handleResetFilters}
              className="text-xs font-black text-[var(--app-navy)] hover:text-[var(--app-navy)] underline underline-offset-2 transition px-2 py-1"
            >
              إعادة تعيين الفلاتر
            </button>
          </div>

          {/* Result count */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              عرض {filteredCustomers.length} عميل
            </span>
            {isRep && (
              <span className="text-xs font-bold text-[var(--app-navy)]">
                العملاء المخصصين لك فقط
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Customers grouped by Rep */}
      <div className="px-4 space-y-4">
        {customersByRep.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
              لا يوجد عملاء مطابقة للفلاتر المحددة
            </p>
          </div>
        ) : (
          customersByRep.map(([repName, repCustomers]) => (
            <div key={repName} className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Rep header */}
              <div className="bg-[#f8fafc] dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <div className="font-black text-slate-900 dark:text-white text-sm">{repName}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {repCustomers.length} عميل
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                  {repCustomers.length}
                </span>
              </div>

              {/* Customers grid under this rep */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
                {repCustomers.map((c) => {
                  const bal = Number(c.currentBalance ?? c.balance ?? 0);
                  const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
                  const creditStatus = getCreditStatus(c);

                  return (
                    <div key={c.id} className="bg-white dark:bg-slate-900/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-700 hover:border-[var(--app-navy)] transition shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <h3 className="font-black text-slate-900 dark:text-white text-sm truncate">{c.name}</h3>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${creditStatus.color}`}>
                              {creditStatus.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                            {c.code && (
                              <span className="flex items-center gap-1 font-mono">
                                {c.code}
                              </span>
                            )}
                            {c.branchName && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {c.branchName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.phone || '—'}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {sectorLabel(c.sector)}
                            </span>
                          </div>
                        </div>
                        <Eye className="w-4 h-4 text-slate-400 hover:text-[var(--app-navy)] transition cursor-pointer" />
                      </div>

                      {/* Financial metrics */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-2 border border-slate-100 dark:border-slate-600">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">الرصيد</div>
                          <div className={`text-xs font-black ${bal > 0 ? 'text-[var(--app-navy)]' : 'text-slate-600 dark:text-slate-400'}`}>
                            {formatMoney(bal)}
                          </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-2 border border-slate-100 dark:border-slate-600">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">المتأخرات</div>
                          <div className={`text-xs font-black ${overdue > 0 ? 'text-[var(--app-risk)]' : 'text-slate-600 dark:text-slate-400'}`}>
                            {formatMoney(overdue)}
                          </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-2 border border-slate-100 dark:border-slate-600">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">الحد الائتماني</div>
                          <div className="text-xs font-black text-slate-600 dark:text-slate-400">
                            {Number(c.creditLimit ?? 0) > 0 ? formatMoney(c.creditLimit) : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Guarantee docs */}
                      {(c.guaranteeDocs &&
                        c.guaranteeDocs !== 'لا يوجد ضمان' &&
                        c.guaranteeDocs !== 'بدون' &&
                        c.guaranteeDocs !== '0') && (
                        <div className="mt-2 p-2 rounded-xl bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[10px] font-bold text-[var(--app-ok-text)]">
                          🛡️ مضمون: {c.guaranteeDocs}
                        </div>
                      )}

                      {/* View profile button */}
                      <button
                        onClick={() => {}}
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" /> عرض البروفايل
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CustomersScreen;
