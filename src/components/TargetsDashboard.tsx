import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Target, TrendingUp, Wallet, Award, Filter, Users, Calendar, ChevronDown,
  ChevronLeft, X, MapPin, UserCheck, BarChart3, Activity, AlertTriangle, CreditCard,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ARABIC_MONTHS, formatEGP, inferTargetSector, QUARTER_LABELS } from '../services/targetService';
import { normalizeArabicText } from '../services/arabicMatchingService';
import type { TargetQuarter, TargetRecord, User } from '../types';

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
  accent: string;
}> = ({ title, target, achieved, remaining, icon, accent }) => {
  const percentage = pct(achieved, target);
  const isGood = percentage >= 80;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-600">{title}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>{icon}</div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">المستهدف</span>
          <span className="font-black text-slate-800 tabular-nums">{fmt(target)} ج.م</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">المحقق</span>
          <span className={`font-black tabular-nums ${isGood ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(achieved)} ج.م</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">المتبقي</span>
          <span className="font-black text-rose-600 tabular-nums">{fmt(remaining)} ج.م</span>
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="font-bold text-slate-500">نسبة التحقيق</span>
            <span className={`font-black ${isGood ? 'text-emerald-700' : 'text-amber-700'}`}>{percentage}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isGood ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const TargetsDashboard: React.FC = () => {
  const { getVisibleTargets, users, getVisibleCustomers, getVisibleVisits, visits: ctxVisits } = useApp();
  const allTargets = useMemo(() => getVisibleTargets(), [getVisibleTargets]);
  const allCustomers = useMemo(() => getVisibleCustomers(), [getVisibleCustomers]);
  const allVisits = useMemo(() => (getVisibleVisits ? getVisibleVisits() : (ctxVisits || [])), [getVisibleVisits, ctxVisits]);

  const now = new Date();
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<TargetQuarter | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [openRepName, setOpenRepName] = useState<string | null>(null);
  const [repModalTab, setRepModalTab] = useState<'overview' | 'monthly' | 'customers' | 'visits'>('overview');

  const repNames = useMemo(() => {
    const set = new Set<string>();
    allTargets.forEach((t) => { if (t.repName) set.add(t.repName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allTargets]);

  const years = useMemo(() => {
    const set = new Set<number>();
    allTargets.forEach((t) => { if (t.year) set.add(t.year); });
    const arr = Array.from(set).sort((a, b) => b - a);
    if (arr.length === 0) arr.push(now.getFullYear());
    return arr;
  }, [allTargets]);

  const filtered = useMemo(() => {
    return allTargets.filter((t) => {
      if (selectedRep !== 'all' && t.repName !== selectedRep) return false;
      if (selectedYear && t.year !== selectedYear) return false;
      if (selectedQuarter !== 'all') {
        if (t.quarter !== selectedQuarter) return false;
      } else {
        if (t.month !== selectedMonth) return false;
      }
      return true;
    });
  }, [allTargets, selectedRep, selectedMonth, selectedQuarter, selectedYear]);

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

  const chartData = useMemo(() => {
    if (selectedQuarter === 'all') {
      return [
        {
          name: ARABIC_MONTHS[selectedMonth - 1] || `شهر ${selectedMonth}`,
          'هدف البيع': summary.salesTarget,
          'محقق البيع': summary.salesAchieved,
          'هدف التحصيل': summary.collectionTarget,
          'محقق التحصيل': summary.collectionAchieved,
        },
      ];
    }
    const months = getQuarterMonths(selectedQuarter);
    return months.map((m) => {
      const monthRecords = allTargets.filter((t) => {
        if (selectedRep !== 'all' && t.repName !== selectedRep) return false;
        if (t.year !== selectedYear) return false;
        return t.month === m;
      });
      const agg = monthRecords.reduce(
        (acc, t) => {
          acc.salesTarget += Number(t.salesTarget || 0);
          acc.salesAchieved += Number(t.salesAchieved || 0);
          acc.collectionTarget += Number(t.collectionTarget || 0);
          acc.collectionAchieved += Number(t.collectionAchieved || 0);
          return acc;
        },
        { salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 }
      );
      return {
        name: ARABIC_MONTHS[m - 1],
        'هدف البيع': agg.salesTarget,
        'محقق البيع': agg.salesAchieved,
        'هدف التحصيل': agg.collectionTarget,
        'محقق التحصيل': agg.collectionAchieved,
      };
    });
  }, [allTargets, selectedQuarter, selectedMonth, selectedYear, selectedRep, summary]);

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
      const user = findRepUser(users, rep);
      const supervisor =
        user?.supervisorName ||
        (user?.supervisorId ? users.find((u) => u.id === user.supervisorId)?.name : '') ||
        'بدون مشرف';
      const branch = records.find((r) => r.branch)?.branch || user?.branchName || 'غير محدد';
      const sector = records.map((r) => inferTargetSector(r, users)).find(Boolean) || user?.sector;
      return {
        rep,
        ...agg,
        records,
        avatar: user?.avatar || '/assets/rep-avatar.jpg',
        branch,
        supervisor,
        sector,
      };
    }).sort((a, b) => b.salesAchieved - a.salesAchieved);
  }, [filtered, users]);

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
      avatar: inPeriod?.avatar || user?.avatar || '/assets/rep-avatar.jpg',
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
    <div className="tg-dash space-y-5 font-arabic" dir="rtl">
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
            <span className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/25 text-white tabular-nums">
              {groupedByRep.length} مندوب بالفترة المحددة
            </span>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-slate-700">
          <Filter className="w-4 h-4" />
          <span className="font-black text-sm">الفلاتر</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> المندوب</span>
            <div className="relative">
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="all">كل المندوبين</option>
                {repNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </label>

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
        {selectedQuarter !== 'all' && (
          <p className="text-[11px] text-slate-500 mt-2">* عند اختيار كوارتر يتم عرض الأشهر الثلاثة الخاصة به في الرسم البياني.</p>
        )}
      </section>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="المبيعات (البيع)"
          target={summary.salesTarget}
          achieved={summary.salesAchieved}
          remaining={salesRemaining}
          icon={<TrendingUp className="w-5 h-5 text-blue-700" />}
          accent="bg-blue-100"
        />
        <StatCard
          title="التحصيل"
          target={summary.collectionTarget}
          achieved={summary.collectionAchieved}
          remaining={collectionRemaining}
          icon={<Wallet className="w-5 h-5 text-emerald-700" />}
          accent="bg-emerald-100"
        />
      </section>

      {/* Chart */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-800">رسم بياني: التارجت مقابل المحقق</h2>
            <p className="text-xs text-slate-500 mt-0.5">مقارنة البيع والتحصيل (مستهدف / محقق)</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>
        <div className="h-[320px] sm:h-[380px] w-full" dir="ltr">
          {chartData.every(d => d['هدف البيع'] === 0 && d['محقق البيع'] === 0 && d['هدف التحصيل'] === 0 && d['محقق التحصيل'] === 0) ? (
            <div className="h-full flex items-center justify-center text-slate-400 font-bold text-sm">
              لا توجد بيانات للفترة المختارة
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmt(Number(v))} width={70} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${fmt(Number(value))} ج.م`, name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontFamily: 'inherit' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="هدف البيع" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="محقق البيع" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="هدف التحصيل" fill="#86efac" radius={[4, 4, 0, 0]} />
                <Bar dataKey="محقق التحصيل" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

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
                            img.src = '/assets/rep-avatar.jpg';
                          }
                        }}
                        className="w-11 h-11 rounded-2xl object-cover object-top border-2 border-blue-200 shrink-0 shadow-xs"
                      />
                      <div className="min-w-0">
                        <div className="font-black text-sm text-[#0b2337] truncate group-hover:text-blue-700">{row.rep}</div>
                        <div className="text-[11px] font-bold text-slate-600 truncate">{row.branch}</div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
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
                groupedByRep.map((row) => {
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
                                img.src = '/assets/rep-avatar.jpg';
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
                        img.src = '/assets/rep-avatar.jpg';
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TargetsDashboard;
