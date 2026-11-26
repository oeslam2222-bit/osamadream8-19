import React, { useMemo, useState } from 'react';
import '../styles/ui-polish.css';
import '../styles/targets-polish.css';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area, Line,
} from 'recharts';
import { useThemeSafe } from '../context/themeContext';
import {
  Target, TrendingUp, Wallet, Award, Filter, Users, Calendar, ChevronDown,
  ChevronLeft, X, MapPin, UserCheck, BarChart3, Activity, AlertTriangle, CreditCard,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ARABIC_MONTHS, formatEGP, inferTargetSector, QUARTER_LABELS } from '../services/targetService';
import { normalizeArabicText } from '../services/arabicMatchingService';
import type { TargetQuarter, TargetRecord, User } from '../types';
import { MiniGauge, PerformanceGauge, gaugeTone } from './ui/PerformanceGauge';
import { ItemSalesProfilePanel } from './itemSales/ItemSalesProfilePanel';
import repAvatarUrl from '../assets/images/rep_avatar_1794555996338.jpg';

function repMatchKey(raw?: string | null): string {
  return normalizeArabicText(String(raw || '').trim())
    .replace(/^(المندوب|مندوب|كود|الاستاذ|استاذ)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findRepUser(users: User[], repName: string): User | undefined {
  const key = repMatchKey(repName);
  if (!key) return undefined;
  return (
    users.find((u) => u?.name && repMatchKey(u.name) === key) ||
    users.find((u) => u?.username && repMatchKey(u.username) === key)
  );
}

function getSectorLabel(s?: string): string {
  if (!s || s === 'all' || s === 'both') return 'كلاهما';
  if (s === 'home') return 'منزلي';
  if (s === 'electrical') return 'كهربائي';
  return s;
}

const QUARTERS: TargetQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function getQuarterMonths(q: TargetQuarter): number[] {
  switch (q) {
    case 'Q1': return [1, 2, 3];
    case 'Q2': return [4, 5, 6];
    case 'Q3': return [7, 8, 9];
    case 'Q4': return [10, 11, 12];
  }
}

function pct(achieved: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.round((achieved / target) * 1000) / 10;
}

function fmt(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const StatCard: React.FC<{
  title: string;
  target: number;
  achieved: number;
  remaining: number;
  icon: React.ReactNode;
  tone: 'sales' | 'collection';
}> = ({ title, target, achieved, remaining, icon, tone }) => {
  const percentage = pct(achieved, target);
  return (
    <article className={`kpi-card kpi-card--${tone} tg-stat`}>
      <div className="kpi-card__head">
        <span className="kpi-card__label">{title}</span>
        <span className="kpi-card__icon" aria-hidden="true">{icon}</span>
      </div>
      <div className="tg-stat__rows">
        <div className="tg-stat__row"><span>المستهدف</span><b>{fmt(target)} ج.م</b></div>
        <div className="tg-stat__row"><span>المحقق</span><b>{fmt(achieved)} ج.م</b></div>
        <div className="tg-stat__row"><span>المتبقي</span><b>{fmt(remaining)} ج.م</b></div>
      </div>
      <div className="tg-stat__pct"><span>نسبة التحقيق</span><b>{percentage}%</b></div>
      <div className="kpi-card__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percentage)} aria-label="نسبة التحقيق">
        <span className="kpi-card__progress-fill" style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </article>
  );
};

export const TargetsDashboard: React.FC = () => {
  const {
    getVisibleTargets,
    users,
    getVisibleCustomers,
    getVisibleVisits,
    visits: ctxVisits,
    activeSectorFilter,
    setActiveSectorFilter,
    canManageSectorGate,
    currentUser,
  } = useApp();
  // المندوب يشوف أرقامه هو بس: مفيش فلاتر مناديب/فروع/مشرفين
  const isRepView = currentUser?.role === 'sales_rep';
  const { isDark } = useThemeSafe();
  const [showTargetLines, setShowTargetLines] = useState(false);
  const allTargets = useMemo(() => {
    const visible = getVisibleTargets();
    if (!isRepView || !currentUser) return visible;
    // حماية إضافية: حساب المندوب يشوف أرقامه هو بس (لو مفيش تطابق بالاسم بنسيب الفلترة الأصلية زي ما هي)
    const keys = [repMatchKey(currentUser.name), repMatchKey(currentUser.username)].filter(Boolean);
    const own = visible.filter((t) => keys.includes(repMatchKey(t.repName)));
    return own.length ? own : visible;
  }, [getVisibleTargets, isRepView, currentUser]);
  const allCustomers = useMemo(() => getVisibleCustomers(), [getVisibleCustomers]);
  const allVisits = useMemo(() => (getVisibleVisits ? getVisibleVisits() : (ctxVisits || [])), [getVisibleVisits, ctxVisits]);

  const now = new Date();
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [repSearch, setRepSearch] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<TargetQuarter | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [openRepName, setOpenRepName] = useState<string | null>(null);
  const [repModalTab, setRepModalTab] = useState<'overview' | 'monthly' | 'customers' | 'visits' | 'item-sales'>('overview');
  const [visibleRepsLimit, setVisibleRepsLimit] = useState(24);

  const userIndex = useMemo(() => {
    const byId = new Map<string, User>();
    const byKey = new Map<string, User>();
    for (const u of users) {
      if (!u) continue;
      if (u.id) byId.set(u.id, u);
      if (u.name) {
        const k = repMatchKey(u.name);
        if (k && !byKey.has(k)) byKey.set(k, u);
      }
      if (u.username) {
        const uk = repMatchKey(u.username);
        if (uk && !byKey.has(uk)) byKey.set(uk, u);
      }
    }
    return { byId, byKey };
  }, [users]);

  const repNames = useMemo(() => {
    const set = new Set<string>();
    allTargets.forEach((t) => { if (t.repName) set.add(t.repName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allTargets]);

  // البحث الذكي: يفلتر أسماء المناديب بالاسم أو اليوزرネーム (مطابقة عربية مرنة)
  const filteredRepNames = useMemo(() => {
    const q = normalizeArabicText(repSearch.trim());
    if (!q) return repNames;
    return repNames.filter((n) => {
      const user = findRepUser(users, n);
      const hay = normalizeArabicText(`${n} ${user?.username || ''} ${user?.name || ''}`);
      return hay.includes(q);
    });
  }, [repSearch, repNames, users]);

  // الفروع من التارجتات + المستخدمين للقطاع المختار فقط (بدون دمج بين القطاعين).
  const branchOptions = useMemo(() => {
    const map = new Map<string, { branch: string; sector?: string }>();
    const add = (branch?: string, sector?: string) => {
      if (!branch) return;
      const sec = sector === 'home' || sector === 'electrical' ? sector : '';
      if (canManageSectorGate && sec !== activeSectorFilter) return;
      const key = `${branch}|${sec}`;
      if (!map.has(key)) map.set(key, { branch, sector: sec });
    };
    allTargets.forEach((t) => add(t.branch, inferTargetSector(t, users)));
    users.forEach((u) => {
      if (!u.sector || u.sector === 'both' || u.sector === 'all') return;
      if (canManageSectorGate && u.sector !== activeSectorFilter) return;
      add(u.branchName, u.sector);
    });
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        label: v.sector ? `${v.branch} — ${getSectorLabel(v.sector)}` : v.branch,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [allTargets, users, canManageSectorGate, activeSectorFilter]);

  // المشرفون: من المستخدمين + من عمود supervisorName في العملاء
  const supervisorOptions = useMemo(() => {
    const set = new Set<string>();
    // مشرفو القطاع المختار بس (كهرباء ما يظهرلهاش مشرفين المنزلي والعكس)
    const sectorOk = (s?: string) =>
      !canManageSectorGate || !s || s === 'both' || s === 'all' || s === activeSectorFilter;
    users.forEach((u) => { if (u.role === 'supervisor' && u.name && sectorOk(u.sector)) set.add(u.name); });
    allCustomers.forEach((c) => { if (c.supervisorName && sectorOk((c as any).sector)) set.add(c.supervisorName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [users, allCustomers, canManageSectorGate, activeSectorFilter]);

  const years = useMemo(() => {
    const set = new Set<number>();
    allTargets.forEach((t) => { if (t.year) set.add(t.year); });
    const arr = Array.from(set).sort((a, b) => b - a);
    if (arr.length === 0) arr.push(now.getFullYear());
    return arr;
  }, [allTargets]);

  // helper: هل التارجت ينتمي لفرع/قطاع المطلوب؟
  const matchesBranch = (t: TargetRecord): boolean => {
    if (selectedBranch === 'all') return true;
    const [branch, sector] = selectedBranch.split('|');
    if (t.branch !== branch) return false;
    if (sector && inferTargetSector(t, users) !== sector) return false;
    return true;
  };
  // helper: هل مندوب التارجت تابع للمشرف المختار؟
  const matchesSupervisor = (t: TargetRecord): boolean => {
    if (selectedSupervisor === 'all') return true;
    const u = findRepUser(users, t.repName || '');
    const supName =
      u?.supervisorName ||
      (u?.supervisorId ? userIndex.byId.get(u.supervisorId)?.name : '') ||
      '';
    if (supName && normalizeArabicText(supName) === normalizeArabicText(selectedSupervisor)) return true;
    // كمان لو المشرف مكتوب صراحة في بيانات العميل بنفس اسم المندوب
    return allCustomers.some(
      (c) =>
        normalizeArabicText(c.supervisorName || '') === normalizeArabicText(selectedSupervisor) &&
        normalizeArabicText(c.salesRepName || c.repName || '') === repMatchKey(t.repName)
    );
  };

  const filtered = useMemo(() => {
    return allTargets.filter((t) => {
      if (selectedRep !== 'all' && t.repName !== selectedRep) return false;
      if (!matchesBranch(t)) return false;
      if (!matchesSupervisor(t)) return false;
      if (selectedYear && t.year !== selectedYear) return false;
      if (selectedQuarter !== 'all') {
        if (t.quarter !== selectedQuarter) return false;
      } else {
        if (t.month !== selectedMonth) return false;
      }
      return true;
    });
  }, [allTargets, selectedRep, selectedMonth, selectedQuarter, selectedYear, selectedBranch, selectedSupervisor, users, userIndex, allCustomers]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, t) => {
        acc.salesTarget += Number(t.salesTarget || 0);
        acc.salesAchieved += Number(t.salesAchieved || 0);
        acc.collectionTarget += Number(t.collectionTarget || 0);
        acc.collectionAchieved += Number(t.collectionAchieved || 0);
        return acc;
      },
      { salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 }
    );
  }, [filtered]);

  const salesRemaining = Math.max(0, summary.salesTarget - summary.salesAchieved);
  const collectionRemaining = Math.max(0, summary.collectionTarget - summary.collectionAchieved);

  const withRate = (row: { salesTarget: number; salesAchieved: number }) => ({
    'نسبة التحقيق': row.salesTarget > 0 ? Math.round((row.salesAchieved / row.salesTarget) * 100) : 0,
  });

  // منحنى الأداء بالشهور: المحقق (بيع/تحصيل) لكل شهر — السنة كلها أو الكوارتر المختار
  const chartData = useMemo(() => {
    const months = selectedQuarter === 'all'
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : getQuarterMonths(selectedQuarter);
    const today = new Date();
    const lastMonthWithData = selectedYear < today.getFullYear() ? 12 : selectedYear > today.getFullYear() ? 0 : today.getMonth() + 1;
    return months.map((m) => {
      const agg = allTargets.reduce(
        (acc, t) => {
          if (t.year !== selectedYear || t.month !== m) return acc;
          if (selectedRep !== 'all' && t.repName !== selectedRep) return acc;
          if (!matchesBranch(t)) return acc;
          if (!matchesSupervisor(t)) return acc;
          acc.salesTarget += Number(t.salesTarget || 0);
          acc.salesAchieved += Number(t.salesAchieved || 0);
          acc.collectionTarget += Number(t.collectionTarget || 0);
          acc.collectionAchieved += Number(t.collectionAchieved || 0);
          return acc;
        },
        { salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 }
      );
      const future = m > lastMonthWithData;
      return {
        name: ARABIC_MONTHS[m - 1],
        'البيع المحقق': future ? null : agg.salesAchieved,
        'التحصيل المحقق': future ? null : agg.collectionAchieved,
        'هدف البيع': agg.salesTarget,
        'هدف التحصيل': agg.collectionTarget,
      };
    });
  }, [allTargets, selectedQuarter, selectedYear, selectedRep, selectedBranch, selectedSupervisor, users, userIndex, allCustomers]);

  const groupedByRep = useMemo(() => {
    const map = new Map<string, TargetRecord[]>();
    filtered.forEach((t) => {
      const key = t.repName || 'غير محدد';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([rep, records]) => {
      const agg = records.reduce(
        (acc, t) => {
          acc.salesTarget += Number(t.salesTarget || 0);
          acc.salesAchieved += Number(t.salesAchieved || 0);
          acc.collectionTarget += Number(t.collectionTarget || 0);
          acc.collectionAchieved += Number(t.collectionAchieved || 0);
          return acc;
        },
        { salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 }
      );
      const user = userIndex.byKey.get(repMatchKey(rep));
      const supervisor =
        user?.supervisorName ||
        (user?.supervisorId ? userIndex.byId.get(user.supervisorId)?.name : '') ||
        'بدون مشرف';
      const branch = records.find((r) => r.branch)?.branch || user?.branchName || 'غير محدد';
      const sector = records.map((r) => inferTargetSector(r, users)).find(Boolean) || user?.sector;
      return {
        rep,
        ...agg,
        records,
        avatar: repAvatarUrl,
        branch,
        supervisor,
        sector,
      };
    }).sort((a, b) => b.salesAchieved - a.salesAchieved);
  }, [filtered, users, userIndex]);

  const activeRepProfile = useMemo(() => {
    if (!openRepName) return null;
    const key = repMatchKey(openRepName);
    const inPeriod = groupedByRep.find((r) => repMatchKey(r.rep) === key);
    const user = findRepUser(users, openRepName);
    const repYearTargets = allTargets.filter(
      (t) => repMatchKey(t.repName) === key && (!selectedYear || t.year === selectedYear)
    );
    const repCustomers = allCustomers.filter(
      (c) => repMatchKey(c.salesRepName || c.repName) === key
    );
    const repVisits = allVisits
      .filter((v) => repMatchKey(v.repName) === key || (user?.id && v.repId === user.id))
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const monthlyRows = ARABIC_MONTHS.map((label, idx) => {
      const m = idx + 1;
      const rows = repYearTargets.filter((t) => Number(t.month) === m);
      const salesTarget = rows.reduce((s, t) => s + Number(t.salesTarget || 0), 0);
      const salesAchieved = rows.reduce((s, t) => s + Number(t.salesAchieved || 0), 0);
      const collectionTarget = rows.reduce((s, t) => s + Number(t.collectionTarget || 0), 0);
      const collectionAchieved = rows.reduce((s, t) => s + Number(t.collectionAchieved || 0), 0);
      return { month: m, label, salesTarget, salesAchieved, collectionTarget, collectionAchieved };
    }).filter((r) => r.salesTarget > 0 || r.salesAchieved > 0 || r.collectionTarget > 0 || r.collectionAchieved > 0);

    const salesTarget = inPeriod?.salesTarget ?? repYearTargets.reduce((s, t) => s + Number(t.salesTarget || 0), 0);
    const salesAchieved = inPeriod?.salesAchieved ?? repYearTargets.reduce((s, t) => s + Number(t.salesAchieved || 0), 0);
    const collectionTarget = inPeriod?.collectionTarget ?? repYearTargets.reduce((s, t) => s + Number(t.collectionTarget || 0), 0);
    const collectionAchieved = inPeriod?.collectionAchieved ?? repYearTargets.reduce((s, t) => s + Number(t.collectionAchieved || 0), 0);

    const totalDebt = repCustomers.reduce((s, c) => s + Number(c.currentBalance ?? c.balance ?? 0), 0);
    const customersWithDebt = repCustomers.filter((c) => Number(c.currentBalance ?? c.balance ?? 0) > 0);

    return {
      repName: inPeriod?.rep || openRepName,
      avatar: repAvatarUrl,
      branch: inPeriod?.branch || user?.branchName || 'غير محدد',
      supervisor: inPeriod?.supervisor || user?.supervisorName || 'بدون مشرف',
      sector: inPeriod?.sector || user?.sector,
      username: user?.username,
      salesTarget,
      salesAchieved,
      collectionTarget,
      collectionAchieved,
      totalDebt,
      repCustomers,
      customersWithDebt,
      repVisits,
      monthlyRows,
    };
  }, [openRepName, groupedByRep, users, allTargets, selectedYear, allCustomers, allVisits]);

  return (
    <div className="tg-dash cr-page space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <section className="ds-pagehead">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              رئيسية <span className="mx-1 text-[#7fc0ff]">›</span> التارجت والمحققات
            </div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-white shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">لوحة التارجت وبروفايل المناديب</h1>
                <p className="text-xs text-[#c3d9ec] mt-0.5">متابعة أهداف البيع والتحصيل وفتح بروفايل كل مندوب بالفترة والربع السنوي</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-black">
            {!isRepView && (
            <span className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/25 text-white tabular-nums">
              {groupedByRep.length} مندوب بالفترة المحددة
            </span>
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-slate-700">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span className="font-black text-sm">الفلاتر</span>
          </div>
          {canManageSectorGate && (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveSectorFilter('home');
                  setSelectedSupervisor('all');
                  setSelectedBranch('all');
                  setSelectedRep('all');
                  setRepSearch('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  activeSectorFilter === 'home'
                    ? 'bg-[var(--cc-sector-home)] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                🏠 منزلي
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSectorFilter('electrical');
                  setSelectedSupervisor('all');
                  setSelectedBranch('all');
                  setSelectedRep('all');
                  setRepSearch('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  activeSectorFilter === 'electrical'
                    ? 'bg-[var(--cc-sector-electrical)] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                ⚡ كهرباء
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {!isRepView && (
          <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> المندوب (بحث ذكي)</span>
            <input
              type="text"
              value={repSearch}
              onChange={(e) => { setRepSearch(e.target.value); setSelectedRep('all'); }}
              placeholder="اكتب اسم المندوب أو اليوزرネーム..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {repSearch.trim() && (
              <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => { setSelectedRep('all'); setRepSearch(''); }}
                  className={`w-full text-right px-3 py-2 text-xs font-bold ${selectedRep === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  كل المندوبين
                </button>
                {filteredRepNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setSelectedRep(name); setRepSearch(name); }}
                    className={`w-full text-right px-3 py-2 text-xs font-bold ${selectedRep === name ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {name} <span className="text-[10px] text-slate-400">— {findRepUser(users, name)?.username || ''}</span>
                  </button>
                ))}
                {filteredRepNames.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">لا يوجد مندوب مطابق</p>}
              </div>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> الفرع (مميّز بالقطاع)</span>
            <div className="relative">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="all">كل الفروع</option>
                {branchOptions.map((b) => (
                  <option key={b.key} value={b.key}>{b.label}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> مشرف الفرع</span>
            <div className="relative">
              <select
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="all">كل المشرفين</option>
                {supervisorOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>

          </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> السنة</span>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600">الكوارتر (ربع سنوي)</span>
            <div className="relative">
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value as TargetQuarter | 'all')}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="all">عرض شهري</option>
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>{QUARTER_LABELS[q].label} ({QUARTER_LABELS[q].months})</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600">الشهر</span>
            <div className="relative">
              <select
                value={selectedMonth}
                disabled={selectedQuarter !== 'all'}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ARABIC_MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
          {selectedQuarter !== 'all' ? (
            <p className="text-[11px] text-slate-500">* عند اختيار كوارتر يتم عرض الأشهر الثلاثة الخاصة به في الرسم البياني.</p>
          ) : isRepView ? <span /> : (
            <span className="text-[11px] text-slate-500">* الفرع مميّز بالقطاع: «فرع القاهرة — منزلي» يختلف عن «فرع القاهرة — كهربائي».</span>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedRep('all'); setRepSearch(''); setSelectedBranch('all'); setSelectedSupervisor('all'); /* للمندوب: السنة والشهر بس */
              setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth() + 1); setSelectedQuarter('all');
            }}
            className="text-xs font-black text-blue-600 hover:underline"
          >
            إعادة تعيين الفلاتر
          </button>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="المبيعات (البيع)"
          target={summary.salesTarget}
          achieved={summary.salesAchieved}
          remaining={salesRemaining}
          icon={<TrendingUp />}
          tone="sales"
        />
        <StatCard
          title="التحصيل"
          target={summary.collectionTarget}
          achieved={summary.collectionAchieved}
          remaining={collectionRemaining}
          icon={<Wallet />}
          tone="collection"
        />
      </section>

      {/* منحنى الأداء */}
      <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 sm:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-base sm:text-lg font-black text-[var(--app-text)]">منحنى الأداء بالشهور</h2>
            <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
              البيع المحقق والتحصيل المحقق لكل شهر — {selectedQuarter === 'all' ? `سنة ${selectedYear}` : `${QUARTER_LABELS[selectedQuarter]?.label || 'الكوارتر'} ${selectedYear}`}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--app-text-muted)] cursor-pointer select-none">
            <input type="checkbox" checked={showTargetLines} onChange={(e) => setShowTargetLines(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            إظهار المستهدف
          </label>
        </div>
        <div className="h-[300px] sm:h-[360px] w-full" dir="ltr">
          {chartData.every(d => !d['البيع المحقق'] && !d['التحصيل المحقق'] && !d['هدف البيع'] && !d['هدف التحصيل']) ? (
            <div className="h-full flex items-center justify-center text-[var(--app-text-muted)] font-bold text-sm">
              لا توجد بيانات للفترة المختارة
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="perfSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="perfColl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.30} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke={(isDark ? '#27465a' : '#e2e8f0')} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: (isDark ? '#e2e8f0' : '#1e293b'), fontWeight: 700 }} axisLine={{ stroke: (isDark ? '#27465a' : '#e2e8f0') }} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: (isDark ? '#94a3b8' : '#64748b') }} tickFormatter={(v) => fmt(Number(v))} width={72} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${fmt(Number(value))} ج.م`, name]}
                  contentStyle={{ borderRadius: 12, border: `1px solid ${(isDark ? '#27465a' : '#e2e8f0')}`, background: isDark ? '#0f2b38' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', fontFamily: 'inherit', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}
                  labelStyle={{ fontWeight: 800 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8, color: (isDark ? '#e2e8f0' : '#1e293b') }} />
                {showTargetLines && (
                  <Line type="monotone" dataKey="هدف البيع" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} strokeOpacity={0.7} />
                )}
                {showTargetLines && (
                  <Line type="monotone" dataKey="هدف التحصيل" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 5" dot={false} strokeOpacity={0.7} />
                )}
                <Area type="monotone" dataKey="البيع المحقق" stroke="#10b981" strokeWidth={3} fill="url(#perfSales)" dot={{ r: 4, fill: '#10b981', stroke: isDark ? '#0f2b38' : '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                <Area type="monotone" dataKey="التحصيل المحقق" stroke="#3b82f6" strokeWidth={3} fill="url(#perfColl)" dot={{ r: 4, fill: '#3b82f6', stroke: isDark ? '#0f2b38' : '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* مؤشر أداء المناديب */}
      {groupedByRep.length > 0 && (() => {
        const totals = groupedByRep.reduce(
          (acc, r) => ({
            st: acc.st + r.salesTarget,
            sa: acc.sa + r.salesAchieved,
            ct: acc.ct + r.collectionTarget,
            ca: acc.ca + r.collectionAchieved,
          }),
          { st: 0, sa: 0, ct: 0, ca: 0 },
        );
        const salesPct = pct(totals.sa, totals.st);
        const collPct = pct(totals.ca, totals.ct);
        const overall = Math.round((salesPct + collPct) / 2);
        const tone = gaugeTone(overall);
        const scored = groupedByRep.map((r) => ({
          rep: r.rep,
          score: Math.round((pct(r.salesAchieved, r.salesTarget) + pct(r.collectionAchieved, r.collectionTarget)) / 2),
        }));
        const best = scored.reduce((a, b) => (b.score > a.score ? b : a), { rep: '—', score: 0 });
        const lagging = scored.filter((r) => r.score < 70).length;
        const laggingPct = groupedByRep.length ? (lagging / groupedByRep.length) * 100 : 0;

        return (
          <section className="tp-sec">
            <div className="tp-sec__hd">
              <div className="tp-sec__t">
                <span className="tp-sec__ico" aria-hidden="true"><Activity className="w-4 h-4" /></span>
                <div>
                  <h2>{isRepView ? 'مؤشر أدائي' : 'مؤشر أداء المناديب'}</h2>
                  <p>{isRepView ? 'مبيعاتك وتحصيلك مقابل المستهدف' : 'مبيعات + تحصيل مقابل المستهدف — لنفس الفلاتر المختارة'}</p>
                </div>
              </div>
              <span className="tp-sec__tone" style={{ background: tone.soft, color: tone.solid }}>
                {tone.label}
              </span>
            </div>

            <div className="tp-grid">
              <div className="tp-gauge">
                <PerformanceGauge
                  value={overall}
                  label="الأداء العام"
                  caption={`متوسط مبيعات ${salesPct}% · تحصيل ${collPct}%`}
                />
              </div>

              <div className={`tp-cards ${isRepView ? 'tp-cards--2' : ''}`}>
                <div className="tp-card tp-card--sales">
                  <div className="tp-card__t"><span className="tp-card__ico"><TrendingUp className="w-3.5 h-3.5" /></span> نسبة البيع</div>
                  <div className="tp-card__b">
                    <MiniGauge value={salesPct} size={44} />
                    <div className="min-w-0">
                      <div className="tp-card__v tabular-nums">{salesPct}%</div>
                      <div className="tp-card__s tabular-nums">{fmt(totals.sa)} / {fmt(totals.st)}</div>
                    </div>
                  </div>
                </div>

                <div className="tp-card tp-card--coll">
                  <div className="tp-card__t"><span className="tp-card__ico"><Wallet className="w-3.5 h-3.5" /></span> نسبة التحصيل</div>
                  <div className="tp-card__b">
                    <MiniGauge value={collPct} size={44} />
                    <div className="min-w-0">
                      <div className="tp-card__v tabular-nums">{collPct}%</div>
                      <div className="tp-card__s tabular-nums">{fmt(totals.ca)} / {fmt(totals.ct)}</div>
                    </div>
                  </div>
                </div>

                {!isRepView && (
                  <>
                    <div className="tp-card tp-card--best">
                      <div className="tp-card__t"><span className="tp-card__ico"><Award className="w-3.5 h-3.5" /></span> أفضل مندوب</div>
                      <div className="tp-card__b">
                        <MiniGauge value={best.score} size={44} />
                        <div className="min-w-0">
                          <div className="tp-card__v tp-card__v--name truncate">{best.rep}</div>
                          <div className="tp-card__s tabular-nums">{best.score}% أداء</div>
                        </div>
                      </div>
                    </div>

                    <div className="tp-card tp-card--warn">
                      <div className="tp-card__t"><span className="tp-card__ico"><AlertTriangle className="w-3.5 h-3.5" /></span> يحتاجون متابعة</div>
                      <div className="tp-card__b">
                        <MiniGauge value={laggingPct} size={44} invert />
                        <div className="min-w-0">
                          <div className="tp-card__v tabular-nums">{lagging} / {groupedByRep.length}</div>
                          <div className="tp-card__s">أقل من 70%</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Rep Profile Cards Strip */}
      {groupedByRep.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base font-black text-slate-900">بروفايل المناديب</h2>
                <p className="text-xs font-bold text-slate-600">اضغط على أي مندوب لفتح ملفه الكامل وتحليل الشهور</p>
              </div>
            </div>
            <span className="text-xs font-black text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full tabular-nums">
              {groupedByRep.length} مندوب
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {groupedByRep.slice(0, 8).map((row) => {
              const sPct = pct(row.salesAchieved, row.salesTarget);
              const cPct = pct(row.collectionAchieved, row.collectionTarget);
              return (
                <button
                  key={row.rep}
                  type="button"
                  onClick={() => {
                    setRepModalTab('overview');
                    setOpenRepName(row.rep);
                  }}
                  className="text-right rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-3.5 hover:border-blue-400 hover:shadow-md transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={row.avatar}
                        alt={row.rep}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (!img.dataset.fallback) {
                            img.dataset.fallback = '1';
                            img.src = repAvatarUrl;
                          }
                        }}
                        className="w-11 h-11 rounded-2xl object-cover object-top border-2 border-blue-200 shrink-0 shadow-xs"
                      />
                      <div className="min-w-0">
                        <div className="font-black text-sm text-[var(--app-text)] truncate group-hover:text-blue-700">{row.rep}</div>
                        <div className="text-[11px] font-bold text-slate-600 truncate">{row.branch}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <MiniGauge value={Math.round((sPct + cPct) / 2)} size={40} />
                      <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-blue-50/80 border border-blue-200/70 px-2.5 py-2">
                      <div className="text-[11px] font-extrabold text-blue-900 flex items-center justify-between">
                        <span>البيع</span>
                        <span className="tabular-nums">{sPct}%</span>
                      </div>
                      <div className="font-black text-blue-800 tabular-nums mt-0.5">{fmt(row.salesAchieved)}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50/80 border border-emerald-200/70 px-2.5 py-2">
                      <div className="text-[11px] font-extrabold text-emerald-900 flex items-center justify-between">
                        <span>التحصيل</span>
                        <span className="tabular-nums">{cPct}%</span>
                      </div>
                      <div className="font-black text-emerald-800 tabular-nums mt-0.5">{fmt(row.collectionAchieved)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Details Table */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-slate-800">تفاصيل المحققات والمتبقي</h2>
            <p className="text-xs font-bold text-slate-600 mt-0.5">اضغط على أي صف لفتح بروفايل المندوب بالتفصيل</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-800">
              <tr>
                <th className="p-3 text-right font-black whitespace-nowrap">المندوب</th>
                <th className="p-3 text-center font-black whitespace-nowrap">هدف البيع</th>
                <th className="p-3 text-center font-black whitespace-nowrap">محقق البيع</th>
                <th className="p-3 text-center font-black whitespace-nowrap">متبقي البيع</th>
                <th className="p-3 text-center font-black whitespace-nowrap">نسبة البيع</th>
                <th className="p-3 text-center font-black whitespace-nowrap">هدف التحصيل</th>
                <th className="p-3 text-center font-black whitespace-nowrap">محقق التحصيل</th>
                <th className="p-3 text-center font-black whitespace-nowrap">متبقي التحصيل</th>
                <th className="p-3 text-center font-black whitespace-nowrap">نسبة التحصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedByRep.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد بيانات للفلاتر المحددة</td>
                </tr>
              ) : (
                groupedByRep.slice(0, visibleRepsLimit).map((row) => {
                  const sRem = Math.max(0, row.salesTarget - row.salesAchieved);
                  const cRem = Math.max(0, row.collectionTarget - row.collectionAchieved);
                  const sPct = pct(row.salesAchieved, row.salesTarget);
                  const cPct = pct(row.collectionAchieved, row.collectionTarget);
                  return (
                    <tr
                      key={row.rep}
                      onClick={() => {
                        setRepModalTab('overview');
                        setOpenRepName(row.rep);
                      }}
                      className="hover:bg-blue-50/50 cursor-pointer transition"
                    >
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={row.avatar}
                            alt={row.rep}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.fallback) {
                                img.dataset.fallback = '1';
                                img.src = repAvatarUrl;
                              }
                            }}
                            className="w-8 h-8 rounded-xl object-cover object-top border border-slate-200 shrink-0"
                          />
                          <span>{row.rep}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center tabular-nums text-slate-700">{fmt(row.salesTarget)}</td>
                      <td className="p-3 text-center tabular-nums font-bold text-blue-700">{fmt(row.salesAchieved)}</td>
                      <td className="p-3 text-center tabular-nums font-bold text-rose-600">{fmt(sRem)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-black ${sPct >= 80 ? 'bg-emerald-100 text-emerald-800' : sPct >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                          {sPct}%
                        </span>
                      </td>
                      <td className="p-3 text-center tabular-nums text-slate-700">{fmt(row.collectionTarget)}</td>
                      <td className="p-3 text-center tabular-nums font-bold text-emerald-700">{fmt(row.collectionAchieved)}</td>
                      <td className="p-3 text-center tabular-nums font-bold text-rose-600">{fmt(cRem)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-black ${cPct >= 80 ? 'bg-emerald-100 text-emerald-800' : cPct >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                          {cPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {groupedByRep.length > visibleRepsLimit && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-center bg-slate-50/50">
            <button
              type="button"
              onClick={() => setVisibleRepsLimit((prev) => prev + 24)}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              عرض المزيد ({groupedByRep.length - visibleRepsLimit} مندوب متبقي)
            </button>
          </div>
        )}
      </section>

      {/* Rep Profile Modal (tg-cp style) */}
      {activeRepProfile && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenRepName(null)}
        >
          <div className="fixed inset-0 bg-[#071726]/80 backdrop-blur-sm" />
          <div
            className="tg-cp relative z-10 w-full sm:max-w-3xl max-h-[92vh] bg-[#f4f7fb] rounded-[28px] shadow-[0_25px_70px_rgba(0,0,0,0.55)] border border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 bg-gradient-to-l from-[#0b2337] via-[#12385d] to-[#155a80] text-white px-4 sm:px-6 pt-4 pb-4 sm:pt-5 sm:pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={activeRepProfile.avatar}
                    alt={activeRepProfile.repName}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.fallback) {
                        img.dataset.fallback = '1';
                        img.src = repAvatarUrl;
                      }
                    }}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover object-top border-2 border-white/40 bg-slate-800 shadow-md shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-black text-lg sm:text-xl text-white truncate">{activeRepProfile.repName}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/15 border border-white/25 text-white">{activeRepProfile.branch}</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/30 border border-blue-300/45 text-white">{getSectorLabel(activeRepProfile.sector)}</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-amber-400/25 border border-amber-200/45 text-amber-100">مشرف: {activeRepProfile.supervisor}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenRepName(null)}
                  className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">محقق البيع</div>
                  <div className="font-black text-base text-white tabular-nums mt-0.5">{fmt(activeRepProfile.salesAchieved)}</div>
                </div>
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">محقق التحصيل</div>
                  <div className="font-black text-base text-white tabular-nums mt-0.5">{fmt(activeRepProfile.collectionAchieved)}</div>
                </div>
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">نسبة البيع / التحصيل</div>
                  <div className="font-black text-base text-white tabular-nums mt-0.5">
                    {pct(activeRepProfile.salesAchieved, activeRepProfile.salesTarget)}% / {pct(activeRepProfile.collectionAchieved, activeRepProfile.collectionTarget)}%
                  </div>
                </div>
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">العملاء / الزيارات</div>
                  <div className="font-black text-base text-white tabular-nums mt-0.5">
                    {activeRepProfile.repCustomers.length} / {activeRepProfile.repVisits.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 bg-white border-b border-slate-200 px-4 pt-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-2.5">
                {[
                  { key: 'overview' as const, label: 'نظرة عامة', icon: <Activity className="w-4 h-4" /> },
                  { key: 'monthly' as const, label: `شهور ${selectedYear}`, icon: <BarChart3 className="w-4 h-4" /> },
                  { key: 'customers' as const, label: `العملاء (${activeRepProfile.repCustomers.length})`, icon: <Users className="w-4 h-4" /> },
                  { key: 'visits' as const, label: `الزيارات (${activeRepProfile.repVisits.length})`, icon: <MapPin className="w-4 h-4" /> },
                  { key: 'item-sales' as const, label: 'مبيعات الأصناف', icon: <BarChart3 className="w-4 h-4" /> },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setRepModalTab(t.key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition border cursor-pointer ${
                      repModalTab === t.key
                        ? 'bg-[#12385d] text-white border-[#12385d]'
                        : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
              {repModalTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-900">تارجت المبيعات</span>
                        <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 tabular-nums">
                          {pct(activeRepProfile.salesAchieved, activeRepProfile.salesTarget)}%
                        </span>
                      </div>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between"><span className="font-bold text-slate-600">المستهدف</span><span className="font-black tabular-nums text-slate-900">{formatEGP(activeRepProfile.salesTarget)}</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-600">المحقق</span><span className="font-black tabular-nums text-blue-700">{formatEGP(activeRepProfile.salesAchieved)}</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-600">المتبقي</span><span className="font-black tabular-nums text-rose-700">{formatEGP(Math.max(0, activeRepProfile.salesTarget - activeRepProfile.salesAchieved))}</span></div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-900">تارجت التحصيل</span>
                        <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 tabular-nums">
                          {pct(activeRepProfile.collectionAchieved, activeRepProfile.collectionTarget)}%
                        </span>
                      </div>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between"><span className="font-bold text-slate-600">المستهدف</span><span className="font-black tabular-nums text-slate-900">{formatEGP(activeRepProfile.collectionTarget)}</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-600">المحقق</span><span className="font-black tabular-nums text-emerald-700">{formatEGP(activeRepProfile.collectionAchieved)}</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-600">المتبقي</span><span className="font-black tabular-nums text-rose-700">{formatEGP(Math.max(0, activeRepProfile.collectionTarget - activeRepProfile.collectionAchieved))}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CreditCard className="w-5 h-5 text-amber-600" />
                      <span className="font-black text-sm text-slate-900">إجمالي مديونية عملاء المندوب</span>
                    </div>
                    <span className="font-black text-base text-rose-700 tabular-nums">{formatEGP(activeRepProfile.totalDebt)}</span>
                  </div>
                </div>
              )}

              {repModalTab === 'monthly' && (
                <div className="space-y-3">
                  {activeRepProfile.monthlyRows.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm font-bold text-slate-600">
                      لا توجد بيانات شهرية لعام {selectedYear}
                    </div>
                  ) : (
                    activeRepProfile.monthlyRows.map((m) => (
                      <div key={m.month} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900">{m.label}</span>
                          <div className="flex items-center gap-2 text-xs font-black">
                            <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 tabular-nums">بيع {pct(m.salesAchieved, m.salesTarget)}%</span>
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 tabular-nums">تحصيل {pct(m.collectionAchieved, m.collectionTarget)}%</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-bold text-slate-700 tabular-nums">
                          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 flex justify-between">
                            <span>المبيعات: <b className="text-blue-700">{fmt(m.salesAchieved)}</b></span>
                            <span>التارجت: {fmt(m.salesTarget)}</span>
                          </div>
                          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 flex justify-between">
                            <span>التحصيل: <b className="text-emerald-700">{fmt(m.collectionAchieved)}</b></span>
                            <span>التارجت: {fmt(m.collectionTarget)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {repModalTab === 'customers' && (
                <div className="space-y-2">
                  {activeRepProfile.repCustomers.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm font-bold text-slate-600">لا يوجد عملاء مسجلين</div>
                  ) : (
                    activeRepProfile.repCustomers.slice(0, 40).map((c) => {
                      const bal = Number(c.currentBalance ?? c.balance ?? 0);
                      return (
                        <div key={c.id} className="rounded-2xl bg-white border border-slate-200 p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-black text-sm text-slate-900 truncate">{c.name}</div>
                            <div className="text-xs font-bold text-slate-600 font-mono">{c.code}</div>
                          </div>
                          <div className={`font-black text-sm tabular-nums ${bal > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {fmt(bal)} ج.م
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {repModalTab === 'visits' && (
                <div className="space-y-2">
                  {activeRepProfile.repVisits.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm font-bold text-slate-600">لا توجد زيارات مسجلة</div>
                  ) : (
                    activeRepProfile.repVisits.slice(0, 40).map((v, idx) => (
                      <div key={v.id || idx} className="rounded-2xl bg-white border border-slate-200 p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-black text-sm text-slate-900 truncate">{v.customerName || 'عميل'}</div>
                          <div className="text-xs font-bold text-slate-600 mt-0.5">{v.date} • {v.outcome || v.type || 'زيارة'}</div>
                        </div>
                        {Number(v.collectedAmount || 0) > 0 && (
                          <div className="font-black text-sm text-emerald-700 tabular-nums shrink-0">{fmt(v.collectedAmount || 0)} ج.م</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {repModalTab === 'item-sales' && (
                <ItemSalesProfilePanel
                  title="مبيعات الأصناف لهذا المندوب"
                  repName={activeRepProfile.repName}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TargetsDashboard;
