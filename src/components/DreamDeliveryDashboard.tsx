import React, { useMemo, useState } from 'react';
import {
  ShoppingCart, Wallet, PackageSearch, MapPin, TrendingUp,
  Users, Target, CalendarCheck, ReceiptText,
  Activity, Boxes, Flame,
  Sparkles, CreditCard, Coins, ArrowLeft, Tag, Home, Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { filterPromotionsForUser, inferOfferSector } from '../services/promotionService';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from '../services/customerDues';
import { inferCustomerSector } from '../data/branchDefinitions';
import { inferTargetSector } from '../services/targetService';
import { applyCustomerSectorHeuristic, isElectricalLabel } from '../services/sectorResolver';
import { isBranchMatch, normalizeArabicText } from '../services/arabicMatchingService';
import type { Customer, CustomerVisit, Invoice } from '../types';

interface DreamDeliveryDashboardProps {
  onNavigate?: (tab: string) => void;
  onNewOrder?: () => void;
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmt(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function invoiceMonth(invoice: Invoice): string {
  const raw = invoice.date || invoice.createdAt || '';
  const match = String(raw).match(/(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function invoiceValue(invoice: Invoice): number {
  return Number(invoice.totalAmount ?? invoice.estimatedGrandTotal ?? 0) || 0;
}

interface SectorDashboardStats {
  sector: 'home' | 'electrical';
  title: string;
  badgeText: string;
  customersCount: number;
  monthSales: number;
  monthSalesTarget: number;
  salesPercent: number;
  salesRemaining: number;
  monthCollection: number;
  monthCollectionTarget: number;
  collectionPercent: number;
  collectionRemaining: number;
  totalDebt: number;
  totalDues: number;
  ordersTodayCount: number;
  totalSalesToday: number;
  visitsTodayCount: number;
  totalCollectedToday: number;
  periodInvoicesCount: number;
  returnsCount: number;
  monthlySeries: { key: string; label: string; sales: number; collection: number }[];
  maxSeries: number;
}

export const DreamDeliveryDashboard: React.FC<DreamDeliveryDashboardProps> = ({ onNavigate }) => {
  const {
    currentUser,
    users,
    selectedBranchFilter,
    invoices,
    customers,
    visits,
    visibleVisits,
    targets,
    promotions,
    products,
    getVisibleInvoices,
    getVisibleCustomers,
    getVisibleTargets,
    activeSectorFilter,
    setActiveSectorFilter,
    canManageSectorGate,
  } = useApp();

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Admin / Developer always see both sectors separately on Home (filtered only by selected branch),
  // whereas role-restricted users stay strictly isolated to their RBAC scope.
  const scopedCustomers = useMemo(() => {
    if (!isAdminOrDev) return getVisibleCustomers();
    return selectedBranchFilter === 'الكل'
      ? customers
      : customers.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranchFilter, { allowUnassigned: false }));
  }, [isAdminOrDev, getVisibleCustomers, customers, selectedBranchFilter]);

  const scopedTargets = useMemo(() => {
    if (!isAdminOrDev) return getVisibleTargets();
    return selectedBranchFilter === 'الكل'
      ? targets
      : targets.filter((t) => Boolean(t.branch) && isBranchMatch(t.branch, selectedBranchFilter, { allowUnassigned: false }));
  }, [isAdminOrDev, getVisibleTargets, targets, selectedBranchFilter]);

  const scopedInvoices = useMemo(() => {
    if (!isAdminOrDev) return getVisibleInvoices();
    const active = invoices.filter((i) => !i.isArchived);
    return selectedBranchFilter === 'الكل'
      ? active
      : active.filter((i) => Boolean(i.branchName) && isBranchMatch(i.branchName, selectedBranchFilter, { allowUnassigned: false }));
  }, [isAdminOrDev, getVisibleInvoices, invoices, selectedBranchFilter]);

  const scopedVisits = useMemo(() => {
    if (!isAdminOrDev) return visibleVisits;
    return selectedBranchFilter === 'الكل'
      ? visits
      : visits.filter((v) => isBranchMatch(v.branchName || '', selectedBranchFilter, { allowUnassigned: false }));
  }, [isAdminOrDev, visibleVisits, visits, selectedBranchFilter]);

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const { latestPeriod, latestPeriodBySector } = useMemo(() => {
    const fallback = { year: today.getFullYear(), month: today.getMonth() + 1, key: todayKey.slice(0, 7) };
    let globalLatest: { year: number; month: number; key: string } | null = null;
    let homeLatest: { year: number; month: number; key: string } | null = null;
    let elecLatest: { year: number; month: number; key: string } | null = null;

    const pickLater = (
      curr: { year: number; month: number; key: string } | null,
      year: number,
      month: number
    ) => {
      if (!curr || year > curr.year || (year === curr.year && month > curr.month)) {
        return { year, month, key: monthKey(year, month) };
      }
      return curr;
    };

    for (const row of scopedTargets) {
      const year = Number(row.year);
      const month = Number(row.month);
      if (!year || !month) continue;
      globalLatest = pickLater(globalLatest, year, month);
      const sec = inferTargetSector(row, users, scopedCustomers);
      if (sec === 'electrical') {
        elecLatest = pickLater(elecLatest, year, month);
      } else {
        homeLatest = pickLater(homeLatest, year, month);
      }
    }
    const base = globalLatest || fallback;
    return {
      latestPeriod: base,
      latestPeriodBySector: {
        home: homeLatest || base,
        electrical: elecLatest || base,
      },
    };
  }, [scopedTargets, users, scopedCustomers, todayKey]);

  const { homeStats, electricalStats } = useMemo(() => {
    const customerSectorCache = new Map<string, 'home' | 'electrical'>();
    const customerNormNameCache = new Map<string, 'home' | 'electrical' | 'mixed'>();
    const customerSectorById = new Map<string, 'home' | 'electrical'>();
    const customerSectorByCode = new Map<string, 'home' | 'electrical'>();

    const resolveCustSector = (c: Customer): 'home' | 'electrical' => {
      const resolved = applyCustomerSectorHeuristic(c) || inferCustomerSector(c, users);
      return resolved === 'electrical' ? 'electrical' : 'home';
    };

    for (const c of scopedCustomers) {
      const sec = resolveCustSector(c);
      if (c.id) customerSectorById.set(c.id, sec);
      if (c.code) customerSectorByCode.set(c.code, sec);
      const normName = normalizeArabicText(c.name || '');
      if (normName) {
        const prev = customerNormNameCache.get(normName);
        if (!prev) customerNormNameCache.set(normName, sec);
        else if (prev !== sec) customerNormNameCache.set(normName, 'mixed');
      }
      customerSectorCache.set(`${c.id}|${c.code || ''}`, sec);
    }

    const resolveInvSector = (inv: Invoice): 'home' | 'electrical' => {
      if (inv.sector === 'electrical') return 'electrical';
      if (inv.sector === 'home') return 'home';
      const refSector =
        (inv.customerId ? customerSectorById.get(inv.customerId) : undefined) ||
        (inv.customerCode ? customerSectorByCode.get(inv.customerCode) : undefined);
      if (refSector) return refSector;
      const byName = customerNormNameCache.get(normalizeArabicText(inv.customerName || ''));
      if (byName === 'home' || byName === 'electrical') return byName;
      if (isElectricalLabel(inv.customerName, inv.repName)) return 'electrical';
      return 'home';
    };

    const resolveVisitSector = (v: CustomerVisit): 'home' | 'electrical' => {
      if (v.sector === 'electrical') return 'electrical';
      if (v.sector === 'home') return 'home';
      const refSector =
        (v.customerId ? customerSectorById.get(v.customerId) : undefined) ||
        (v.customerCode ? customerSectorByCode.get(v.customerCode) : undefined);
      if (refSector) return refSector;
      const byName = customerNormNameCache.get(normalizeArabicText(v.customerName || ''));
      if (byName === 'home' || byName === 'electrical') return byName;
      if (isElectricalLabel(v.customerName, v.repName)) return 'electrical';
      return 'home';
    };

    const initAccumulator = (sector: 'home' | 'electrical') => ({
      sector,
      customersCount: 0,
      totalDebt: 0,
      totalDues: 0,
      monthSales: 0,
      monthSalesTarget: 0,
      monthCollection: 0,
      monthCollectionTarget: 0,
      ordersTodayCount: 0,
      totalSalesToday: 0,
      visitsTodayCount: 0,
      totalCollectedToday: 0,
      periodInvoicesCount: 0,
      returnsSet: new Set<string>(),
      seriesMap: new Map<string, { sales: number; collection: number }>(),
    });

    const acc = {
      home: initAccumulator('home'),
      electrical: initAccumulator('electrical'),
    };

    const monthKeys: { key: string; label: string }[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(latestPeriod.year, latestPeriod.month - 1 - offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = monthKey(year, month);
      monthKeys.push({ key, label: MONTHS_AR[month - 1] });
      acc.home.seriesMap.set(key, { sales: 0, collection: 0 });
      acc.electrical.seriesMap.set(key, { sales: 0, collection: 0 });
    }

    for (const c of scopedCustomers) {
      const sec = applyCustomerSectorHeuristic(c) || inferCustomerSector(c, users);
      const finalSec = sec === 'electrical' ? 'electrical' : 'home';
      const bucket = acc[finalSec];
      bucket.customersCount += 1;
      bucket.totalDebt += resolveCustomerBalanceValue(c);
      bucket.totalDues += resolveCustomerDuesValue(c);
    }

    for (const row of scopedTargets) {
      const sec: 'home' | 'electrical' =
        inferTargetSector(row, users, scopedCustomers) === 'electrical' ? 'electrical' : 'home';
      const bucket = acc[sec];
      const sectorPeriod = latestPeriodBySector[sec];
      const y = Number(row.year);
      const m = Number(row.month);
      if (y === sectorPeriod.year && m === sectorPeriod.month) {
        bucket.monthSales += Number(row.salesAchieved) || 0;
        bucket.monthSalesTarget += Number(row.salesTarget) || 0;
        bucket.monthCollection += Number(row.collectionAchieved) || 0;
        bucket.monthCollectionTarget += Number(row.collectionTarget) || 0;
      }
      const mk = monthKey(y, m);
      const seriesPoint = bucket.seriesMap.get(mk);
      if (seriesPoint) {
        seriesPoint.sales += Number(row.salesAchieved) || 0;
        seriesPoint.collection += Number(row.collectionAchieved) || 0;
      }
    }

    for (const inv of scopedInvoices) {
      const sec = resolveInvSector(inv);
      const bucket = acc[sec];
      const invMonth = invoiceMonth(inv);
      const invDay = String(inv.date || '').slice(0, 10);
      if (invMonth === latestPeriod.key) bucket.periodInvoicesCount += 1;
      if (invDay === todayKey) {
        bucket.ordersTodayCount += 1;
        bucket.totalSalesToday += invoiceValue(inv);
      }
      if (inv.hasReturns || inv.status === 'مرتجع' || inv.status === 'مرتجع جزئي') {
        bucket.returnsSet.add(inv.id);
      }
    }

    for (const v of scopedVisits) {
      const sec = resolveVisitSector(v);
      const bucket = acc[sec];
      if (String(v.date || '').slice(0, 10) === todayKey) {
        bucket.visitsTodayCount += 1;
        if (v.collectedAmount) bucket.totalCollectedToday += Number(v.collectedAmount) || 0;
      }
    }

    const finalize = (sector: 'home' | 'electrical'): SectorDashboardStats => {
      const b = acc[sector];
      const salesPercent = b.monthSalesTarget > 0 ? Math.round((b.monthSales / b.monthSalesTarget) * 100) : 0;
      const collectionPercent = b.monthCollectionTarget > 0 ? Math.round((b.monthCollection / b.monthCollectionTarget) * 100) : 0;
      const monthlySeries = monthKeys.map((mk) => {
        const pt = b.seriesMap.get(mk.key) || { sales: 0, collection: 0 };
        return { key: mk.key, label: mk.label, sales: pt.sales, collection: pt.collection };
      });
      const maxSeries = Math.max(1, ...monthlySeries.map((m) => Math.max(m.sales, m.collection)));
      return {
        sector,
        title: sector === 'home' ? 'قطاع منزلي' : 'قطاع كهرباء',
        badgeText: sector === 'home' ? 'أدوات منزلية' : 'كهرباء وإضاءة',
        customersCount: b.customersCount,
        monthSales: b.monthSales,
        monthSalesTarget: b.monthSalesTarget,
        salesPercent,
        salesRemaining: Math.max(0, b.monthSalesTarget - b.monthSales),
        monthCollection: b.monthCollection,
        monthCollectionTarget: b.monthCollectionTarget,
        collectionPercent,
        collectionRemaining: Math.max(0, b.monthCollectionTarget - b.monthCollection),
        totalDebt: b.totalDebt,
        totalDues: b.totalDues,
        ordersTodayCount: b.ordersTodayCount,
        totalSalesToday: b.totalSalesToday,
        visitsTodayCount: b.visitsTodayCount,
        totalCollectedToday: b.totalCollectedToday,
        periodInvoicesCount: b.periodInvoicesCount,
        returnsCount: b.returnsSet.size,
        monthlySeries,
        maxSeries,
      };
    };

    return {
      homeStats: finalize('home'),
      electricalStats: finalize('electrical'),
    };
  }, [scopedCustomers, scopedTargets, scopedInvoices, scopedVisits, users, latestPeriod.year, latestPeriod.month, latestPeriod.key, latestPeriodBySector, todayKey]);

  const visibleSectorCards = useMemo<SectorDashboardStats[]>(() => {
    if (!isAdminOrDev) {
      if (currentUser?.sector === 'electrical') return [electricalStats];
      if (currentUser?.sector === 'home') return [homeStats];
    }
    return [homeStats, electricalStats];
  }, [isAdminOrDev, currentUser?.sector, homeStats, electricalStats]);

  const promoSummary = useMemo(() => {
    const scoped = filterPromotionsForUser(promotions, currentUser, products);
    const active = scoped.filter((p) => p.status !== 'منتهي');
    let homeCount = 0;
    let homeMaxDiscount = 0;
    let elecCount = 0;
    let elecMaxDiscount = 0;
    for (const p of active) {
      const sec = inferOfferSector(p, products);
      const disc = Number(p.discountPercentage || 0);
      if (sec === 'electrical') {
        elecCount += 1;
        if (disc > elecMaxDiscount) elecMaxDiscount = disc;
      } else {
        homeCount += 1;
        if (disc > homeMaxDiscount) homeMaxDiscount = disc;
      }
    }
    return {
      home: { count: homeCount, maxDiscount: Math.round(homeMaxDiscount) },
      electrical: { count: elecCount, maxDiscount: Math.round(elecMaxDiscount) },
      hasAny: homeCount > 0 || elecCount > 0,
    };
  }, [promotions, currentUser, products]);

  const activitySector: 'home' | 'electrical' = canManageSectorGate
    ? activeSectorFilter
    : currentUser?.sector === 'electrical'
    ? 'electrical'
    : 'home';

  const activities = useMemo(() => {
    const customerSectorLookup = new Map<string, 'home' | 'electrical'>();
    for (const c of scopedCustomers) {
      const resolved = applyCustomerSectorHeuristic(c) || inferCustomerSector(c, users);
      const sec: 'home' | 'electrical' = resolved === 'electrical' ? 'electrical' : 'home';
      if (c.id) customerSectorLookup.set(`id:${c.id}`, sec);
      if (c.code) customerSectorLookup.set(`code:${c.code}`, sec);
      const norm = normalizeArabicText(c.name || '');
      if (norm && !customerSectorLookup.has(`name:${norm}`)) {
        customerSectorLookup.set(`name:${norm}`, sec);
      }
    }

    const resolveInvSec = (inv: Invoice): 'home' | 'electrical' => {
      if (inv.sector === 'electrical' || inv.sector === 'home') return inv.sector;
      const byRef =
        (inv.customerId ? customerSectorLookup.get(`id:${inv.customerId}`) : undefined) ||
        (inv.customerCode ? customerSectorLookup.get(`code:${inv.customerCode}`) : undefined) ||
        customerSectorLookup.get(`name:${normalizeArabicText(inv.customerName || '')}`);
      if (byRef) return byRef;
      return isElectricalLabel(inv.customerName, inv.repName) ? 'electrical' : 'home';
    };

    const resolveVisitSec = (v: CustomerVisit): 'home' | 'electrical' => {
      if (v.sector === 'electrical' || v.sector === 'home') return v.sector;
      const byRef =
        (v.customerId ? customerSectorLookup.get(`id:${v.customerId}`) : undefined) ||
        (v.customerCode ? customerSectorLookup.get(`code:${v.customerCode}`) : undefined) ||
        customerSectorLookup.get(`name:${normalizeArabicText(v.customerName || '')}`);
      if (byRef) return byRef;
      return isElectricalLabel(v.customerName, v.repName) ? 'electrical' : 'home';
    };

    const invoiceEvents = scopedInvoices
      .filter((inv) => resolveInvSec(inv) === activitySector)
      .sort((a, b) => String(b.createdAt || `${b.date} ${b.time}`).localeCompare(String(a.createdAt || `${a.date} ${a.time}`)))
      .slice(0, 4)
      .map((inv) => ({
        id: `inv-${inv.id}`,
        title: `طلبية ${inv.invoiceNumber}`,
        detail: `${inv.customerName} — ${fmt(invoiceValue(inv))} ج.م`,
        date: String(inv.date || ''),
        icon: ReceiptText,
        tone: 'blue' as const,
      }));

    const visitEvents = scopedVisits
      .filter((visit) => resolveVisitSec(visit) === activitySector)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 2)
      .map((visit) => ({
        id: `visit-${visit.id}`,
        title: 'زيارة عميل',
        detail: `${visit.customerName} — ${visit.status || 'مسجلة'}`,
        date: String(visit.date || ''),
        icon: MapPin,
        tone: 'emerald' as const,
      }));

    return [...invoiceEvents, ...visitEvents]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [scopedInvoices, scopedVisits, scopedCustomers, users, activitySector]);

  const displayName = (currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'بك';
  const initials = displayName.charAt(0).toUpperCase();

  const quickActions = [
    { label: 'الكتالوج', icon: Boxes, onClick: () => onNavigate?.('catalog'), primary: true },
    { label: 'قاعدة العملاء', icon: Users, onClick: () => onNavigate?.('customers') },
    { label: 'التارجت', icon: Target, onClick: () => onNavigate?.('targets') },
    { label: 'التحصيلات', icon: Wallet, onClick: () => onNavigate?.('collection') },
  ];

  const AVATAR_COLORS = ['#3b82f6', '#059669', '#d97706', '#7c3aed', '#e11d48'];
  const avatarBg = AVATAR_COLORS[displayName.length % AVATAR_COLORS.length];

  const [activeSection, setActiveSection] = useState<'today' | 'performance' | 'activity'>('today');
  const dashboardSections = [
    { id: 'today' as const, label: 'ملخص اليوم', icon: CalendarCheck },
    { id: 'performance' as const, label: 'الأداء والرسومات', icon: TrendingUp },
    { id: 'activity' as const, label: 'الأنشطة والاختصارات', icon: Activity },
  ];

  const pctBadgeTone = (pct: number) =>
    pct >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct >= 50
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';

  const pctBadgeLabel = (pct: number) => (pct >= 80 ? 'ممتاز' : pct >= 50 ? 'جيد' : 'يحتاج تحسين');

  return (
    <div className="tg-dash" dir="rtl">
      {/* ---------- كارت مبيعات اليوم (موبايل) — منفصل حسب القطاع ---------- */}
      <section className="tg-daycard lg:hidden">
        <span className="tg-daycard__glow" aria-hidden="true" />
        <div className="flex flex-col gap-2.5 relative z-10">
          {visibleSectorCards.map((sec) => (
            <div
              key={`mob-day-${sec.sector}`}
              className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur-xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-90">
                  {sec.sector === 'home' ? <Home size={12} /> : <Zap size={12} />}
                  <span>{sec.title} • مبيعات اليوم</span>
                </div>
                <div className="text-base font-black tg-num">
                  {fmt(sec.totalSalesToday)} <span className="text-[11px] font-bold opacity-80">ج.م</span>
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-[11px] font-black tg-num">تحقيق {sec.salesPercent}%</div>
                <div className="text-[10px] opacity-85 tg-num">تحصيل اليوم: {fmt(sec.totalCollectedToday)} ج.م</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Hero ---------- */}
      <section className="tg-hero">
        <span className="tg-hero__blob tg-hero__blob--blue" aria-hidden="true" />
        <span className="tg-hero__blob tg-hero__blob--green" aria-hidden="true" />
        <div className="tg-hero__inner">
          <div className="tg-hero__main">
            <div className="tg-chip">
              <Activity size={14} />
              <span>{today.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <div className="tg-hero__head">
              <div className="tg-avatar" style={{ background: avatarBg }}>
                {initials}
              </div>
              <div className="tg-welcome">
                <div className="tg-hero__title">أهلاً بك، {displayName}</div>
                <p className="tg-hero__sub">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-2 py-0.5 font-black text-white ml-1.5">
                    📅 بيانات شهر {MONTHS_AR[latestPeriod.month - 1]} {latestPeriod.year} (الشهر الحالي)
                  </span>
                  جميع الأرقام أدناه خاصة بهذا الشهر — عرض مستقل لكل قطاع (منزلي وكهرباء) بدون دمج.
                </p>
              </div>
            </div>
            <div className="tg-hero__actions">
              <button type="button" onClick={() => onNavigate?.('catalog')} className="tg-btn">
                <Boxes size={16} />
                تصفح الكتالوج
              </button>
              <button type="button" onClick={() => onNavigate?.('customers')} className="tg-btn tg-btn--ghost">
                <Users size={16} />
                قاعدة العملاء
              </button>
              <button type="button" onClick={() => onNavigate?.('product_sales')} className="tg-btn tg-btn--ghost">
                <PackageSearch size={16} />
                مبيعات الأصناف
              </button>
            </div>
          </div>

          <div className="tg-hero__stats">
            {visibleSectorCards.map((sec) => (
              <div key={`hero-${sec.sector}`} className="tg-mini min-w-0 overflow-hidden">
                <div className="tg-mini__label flex items-center gap-1.5">
                  {sec.sector === 'home' ? (
                    <Home size={13} className="text-sky-300 shrink-0" />
                  ) : (
                    <Zap size={13} className="text-amber-300 shrink-0" />
                  )}
                  <span>{sec.title}</span>
                </div>
                <div className="tg-mini__value flex items-baseline justify-between gap-2">
                  <span className="tg-num">{sec.salesPercent}%</span>
                  <span className="tg-mini__unit">مبيعات</span>
                </div>
                <div className="tg-mini__bar">
                  <div
                    className={`tg-mini__fill ${sec.sector === 'electrical' ? 'tg-mini__fill--amber' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(0, sec.salesPercent))}%` }}
                  />
                </div>
                <div className="tg-mini__meta flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    تحصيل: <strong className="tg-num font-black text-white">{sec.collectionPercent}%</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                    <span className="shrink-0">متبقي:</span>
                    <strong className="tg-num font-black text-white tabular-nums break-words [overflow-wrap:anywhere]">{fmt(sec.salesRemaining)}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- بطاقات القطاعات المنفصلة (منزلي ≠ كهرباء) ---------- */}
      <section className={`grid gap-4 ${visibleSectorCards.length > 1 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
        {visibleSectorCards.map((sec) => {
          const isHome = sec.sector === 'home';
          const accentBorder = isHome
            ? 'border-blue-200/80 dark:border-blue-800/60'
            : 'border-amber-200/80 dark:border-amber-800/60';
          const badgeCls = isHome
            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
          return (
            <div
              key={`panel-${sec.sector}`}
              className={`rounded-2xl border ${accentBorder} bg-white dark:bg-[#0F1E36] p-4 shadow-xs flex flex-col gap-3.5`}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-[#1E314E]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isHome
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/80 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-300'
                    }`}
                  >
                    {isHome ? <Home size={18} /> : <Zap size={18} />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">
                      {sec.title}
                    </h3>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tg-num">
                      {fmt(sec.customersCount)} عميل • {fmt(sec.periodInvoicesCount)} أمر بيع في {MONTHS_AR[latestPeriod.month - 1]}
                    </span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-black shrink-0 ${badgeCls}`}>
                  {sec.badgeText}
                </span>
              </div>

              {/* 4 KPI cards per sector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sales */}
                <div className="rounded-xl border border-slate-200/80 dark:border-[#243756] bg-slate-50/70 dark:bg-[#132542] p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>مبيعات {MONTHS_AR[latestPeriod.month - 1]} — المحقق</span>
                    <ShoppingCart size={15} className="text-blue-500" />
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-900 dark:text-white tg-num">
                    {fmt(sec.monthSales)} <span className="text-xs font-bold text-slate-500">ج.م</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, Math.max(0, sec.salesPercent))}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span className="text-slate-500 dark:text-slate-400">
                      المستهدف: <span className="tg-num">{fmt(sec.monthSalesTarget)}</span>
                    </span>
                    <span className={`${pctBadgeTone(sec.salesPercent)} whitespace-nowrap`}>
                      <span className="tg-num">{sec.salesPercent}%</span> ({pctBadgeLabel(sec.salesPercent)})
                    </span>
                  </div>
                </div>

                {/* Collection */}
                <div className="rounded-xl border border-slate-200/80 dark:border-[#243756] bg-slate-50/70 dark:bg-[#132542] p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>تحصيل {MONTHS_AR[latestPeriod.month - 1]} — المحقق</span>
                    <Wallet size={15} className="text-purple-500" />
                  </div>
                  <div className="mt-1 text-lg font-black text-slate-900 dark:text-white tg-num">
                    {fmt(sec.monthCollection)} <span className="text-xs font-bold text-slate-500">ج.م</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-500"
                      style={{ width: `${Math.min(100, Math.max(0, sec.collectionPercent))}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span className="text-slate-500 dark:text-slate-400">
                      المستهدف: <span className="tg-num">{fmt(sec.monthCollectionTarget)}</span>
                    </span>
                    <span className={`${pctBadgeTone(sec.collectionPercent)} whitespace-nowrap`}>
                      <span className="tg-num">{sec.collectionPercent}%</span> ({pctBadgeLabel(sec.collectionPercent)})
                    </span>
                  </div>
                </div>

                {/* Debts */}
                <div className="rounded-xl border border-slate-200/80 dark:border-[#243756] bg-slate-50/70 dark:bg-[#132542] p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>مديونيات العملاء ({sec.title})</span>
                    <CreditCard size={15} className="text-red-500" />
                  </div>
                  <div className="mt-1 text-lg font-black text-red-600 dark:text-red-400 tg-num">
                    {fmt(sec.totalDebt)} <span className="text-xs font-bold opacity-80">ج.م</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    إجمالي الرصيد القائم على عملاء القطاع
                  </div>
                </div>

                {/* Dues */}
                <div className="rounded-xl border border-slate-200/80 dark:border-[#243756] bg-slate-50/70 dark:bg-[#132542] p-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>مستحقات العملاء ({sec.title})</span>
                    <Coins size={15} className="text-emerald-500" />
                  </div>
                  <div className="mt-1 text-lg font-black text-emerald-600 dark:text-emerald-400 tg-num">
                    {fmt(sec.totalDues)} <span className="text-xs font-bold opacity-80">ج.م</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    إجمالي المستحقات الفعلية لعملاء القطاع
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ---------- بانر عروض دريم طنطاوي ---------- */}
      <button
        type="button"
        onClick={() => onNavigate?.('offers')}
        className="tg-offers-banner"
      >
        <div className="tg-offers-banner__inner">
          <div className="tg-offers-banner__icon" aria-hidden="true">
            <Flame size={22} />
          </div>
          <div className="tg-offers-banner__body">
            <div className="tg-offers-banner__top">
              <span className="tg-offers-banner__title">عروض دريم طنطاوي</span>
              <span className="tg-special-discount-badge">
                <Tag size={11} />
                خصم خاص
              </span>
              {(isAdminOrDev || currentUser?.sector !== 'electrical') && promoSummary.home.count > 0 && (
                <span className="tg-offers-banner__count">
                  🏠 منزلي: {promoSummary.home.count} عرض
                  {promoSummary.home.maxDiscount > 0 ? ` • حتى ${promoSummary.home.maxDiscount}%` : ''}
                </span>
              )}
              {(isAdminOrDev || currentUser?.sector === 'electrical') && promoSummary.electrical.count > 0 && (
                <span className="tg-offers-banner__count">
                  ⚡ كهرباء: {promoSummary.electrical.count} عرض
                  {promoSummary.electrical.maxDiscount > 0 ? ` • حتى ${promoSummary.electrical.maxDiscount}%` : ''}
                </span>
              )}
            </div>
            <p className="tg-offers-banner__sub">
              {promoSummary.hasAny
                ? 'اضغط هنا لفتح صفحة العروض واستعراض الأصناف المشمولة بالخصم الخاص المرتبط بأكواد المنتجات'
                : 'اضغط لفتح مركز العروض والخصومات لمتابعة أحدث عروض دريم طنطاوي المربوطة بكود الصنف'}
            </p>
          </div>
          <span className="tg-offers-banner__cta whitespace-nowrap shrink-0">
            <Sparkles size={14} />
            تصفح العروض
            <ArrowLeft size={14} />
          </span>
        </div>
      </button>

      {/* ---------- تلقيم التبويبات ---------- */}
      <div
        role="tablist"
        aria-label="أقسام لوحة التحكم"
        className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] overflow-x-auto"
      >
        {dashboardSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-[#0F1E36] text-[#2563EB] dark:text-[#93C5FD] shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------- ملخص اليوم لكل قطاع بشكل مستقل ---------- */}
      {activeSection === 'today' && (
        <section className={`grid gap-4 ${visibleSectorCards.length > 1 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
          {visibleSectorCards.map((sec) => (
            <div key={`today-${sec.sector}`} className="tg-card">
              <div className="tg-card__head">
                <span className="tg-card__title flex items-center gap-1.5">
                  {sec.sector === 'home' ? <Home size={16} className="text-blue-500" /> : <Zap size={16} className="text-amber-500" />}
                  ملخص اليوم — {sec.title}
                </span>
                <span className="text-[11px] font-bold text-slate-400 tg-num">{todayKey}</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-1 -mb-1">
                حركة اليوم ضمن شهر {MONTHS_AR[latestPeriod.month - 1]} {latestPeriod.year}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl bg-slate-50 dark:bg-[#132542] p-2.5 border border-slate-200/70 dark:border-[#243756]">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">مبيعات اليوم</div>
                  <div className="mt-1 text-sm font-black text-blue-600 dark:text-blue-400 tg-num">{fmt(sec.totalSalesToday)} ج.م</div>
                  <div className="text-[10px] text-slate-400 tg-num">{fmt(sec.ordersTodayCount)} طلبية</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#132542] p-2.5 border border-slate-200/70 dark:border-[#243756]">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">تحصيل اليوم</div>
                  <div className="mt-1 text-sm font-black text-emerald-600 dark:text-emerald-400 tg-num">{fmt(sec.totalCollectedToday)} ج.م</div>
                  <div className="text-[10px] text-slate-400">تحصيل ميداني</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#132542] p-2.5 border border-slate-200/70 dark:border-[#243756]">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">زيارات اليوم</div>
                  <div className="mt-1 text-sm font-black text-violet-600 dark:text-violet-400 tg-num">{fmt(sec.visitsTodayCount)}</div>
                  <div className="text-[10px] text-slate-400">زيارات مسجلة</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-[#132542] p-2.5 border border-slate-200/70 dark:border-[#243756]">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">المرتجعات</div>
                  <div className="mt-1 text-sm font-black text-amber-600 dark:text-amber-400 tg-num">{fmt(sec.returnsCount)}</div>
                  <div className="text-[10px] text-slate-400">أمر بيع عليه مرتجع</div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---------- رسومات الأداء آخر 6 شهور — منفصلة لكل قطاع ---------- */}
      {activeSection === 'performance' && (
        <section className={`grid gap-4 ${visibleSectorCards.length > 1 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
          {visibleSectorCards.map((sec) => (
            <div key={`perf-${sec.sector}`} className="tg-card">
              <div className="tg-card__head">
                <span className="tg-card__title flex items-center gap-1.5">
                  {sec.sector === 'home' ? <Home size={16} className="text-blue-500" /> : <Zap size={16} className="text-amber-500" />}
                  {sec.title} — المبيعات والتحصيل (آخر 6 شهور)
                </span>
                <span className="tg-legend-inline">
                  <span className="tg-legend-inline__dot tg-legend-inline__dot--sales" /> مبيعات
                  <span className="tg-legend-inline__dot tg-legend-inline__dot--collection" /> تحصيلات
                </span>
              </div>
              <div className="tg-chart">
                <div className="tg-chart__bars">
                  {sec.monthlySeries.map((m) => {
                    const salesH = Math.max(4, Math.round((m.sales / sec.maxSeries) * 100));
                    const collectionH = Math.max(4, Math.round((m.collection / sec.maxSeries) * 100));
                    return (
                      <div key={`${sec.sector}-${m.key}`} className="tg-chart__col">
                        <div className="tg-chart__pair">
                          <div
                            className="tg-chart__bar tg-chart__bar--sales"
                            style={{ height: `${salesH}%` }}
                            title={`${sec.title} • مبيعات ${fmt(m.sales)} ج.م`}
                          />
                          <div
                            className="tg-chart__bar tg-chart__bar--collection"
                            style={{ height: `${collectionH}%` }}
                            title={`${sec.title} • تحصيلات ${fmt(m.collection)} ج.م`}
                          />
                        </div>
                        <span className="tg-chart__label">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#1E314E] grid grid-cols-2 gap-2 text-[11px] font-bold tg-num">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span>متبقي مبيعات {MONTHS_AR[latestPeriod.month - 1]}:</span>
                  <span className="text-blue-600 dark:text-blue-400">{fmt(sec.salesRemaining)} ج.م</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span>متبقي تحصيل {MONTHS_AR[latestPeriod.month - 1]}:</span>
                  <span className="text-purple-600 dark:text-purple-400">{fmt(sec.collectionRemaining)} ج.م</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---------- الأنشطة + اختصارات ---------- */}
      {activeSection === 'activity' && (
        <section className="tg-dash-bottom">
          <div className="tg-card">
            <div className="tg-card__head">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="tg-card__title">أحدث الأنشطة</span>
                {canManageSectorGate && (
                  <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-[#132542] p-0.5 gap-0.5 text-[11px] font-black">
                    <button
                      type="button"
                      onClick={() => setActiveSectorFilter('home')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                        activeSectorFilter === 'home'
                          ? 'bg-[#102b4e] text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      🏠 منزلي
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSectorFilter('electrical')}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                        activeSectorFilter === 'electrical'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      ⚡ كهرباء
                    </button>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => onNavigate?.('invoices')} className="tg-linkbtn">عرض الكل</button>
            </div>
            <div className="tg-act-list">
              {activities.length === 0 ? (
                <div className="tg-empty">لا توجد أنشطة مسجلة بعد</div>
              ) : (
                activities.map((event) => {
                  const Icon = event.icon;
                  return (
                    <div key={event.id} className="tg-act">
                      <span className={`tg-act__icon${event.tone === 'emerald' ? ' tg-act__icon--emerald' : ''}`}>
                        <Icon size={16} />
                      </span>
                      <div className="tg-act__body">
                        <div className="tg-act__title">{event.title}</div>
                        <div className="tg-act__detail">{event.detail}</div>
                      </div>
                      <span className="tg-act__date">{event.date}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="tg-card">
            <div className="tg-card__head">
              <span className="tg-card__title">اختصارات سريعة</span>
            </div>
            <div className="tg-quick">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={`tg-quick__btn${action.primary ? ' tg-quick__btn--primary' : ''}`}
                  >
                    <Icon size={20} />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default DreamDeliveryDashboard;
