import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Target, TrendingUp, Wallet, Award, Filter, Users, Calendar, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ARABIC_MONTHS, formatEGP, QUARTER_LABELS } from '../services/targetService';
import type { TargetQuarter, TargetRecord } from '../types';

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
  const { getVisibleTargets } = useApp();
  const allTargets = useMemo(() => getVisibleTargets(), [getVisibleTargets]);

  const now = new Date();
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<TargetQuarter | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

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
      return { rep, ...agg, records };
    }).sort((a, b) => b.salesAchieved - a.salesAchieved);
  }, [filtered]);

  return (
    <div className="space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-l from-[#0f2f52] to-[#173f68] p-5 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">لوحة التارجت والمحققات</h1>
              <p className="text-xs text-blue-100 mt-0.5">متابعة أهداف البيع والتحصيل مع الفلاتر والربع السنوي</p>
            </div>
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

      {/* Details Table */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60">
          <h2 className="text-base font-black text-slate-800">تفاصيل المحققات والمتبقي</h2>
          <p className="text-xs text-slate-500 mt-0.5">عرض تفصيلي حسب المندوب للفترة المحددة</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
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
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">لا توجد بيانات للفلاتر المحددة</td>
                </tr>
              ) : (
                groupedByRep.map((row) => {
                  const sRem = Math.max(0, row.salesTarget - row.salesAchieved);
                  const cRem = Math.max(0, row.collectionTarget - row.collectionAchieved);
                  const sPct = pct(row.salesAchieved, row.salesTarget);
                  const cPct = pct(row.collectionAchieved, row.collectionTarget);
                  return (
                    <tr key={row.rep} className="hover:bg-slate-50/70">
                      <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{row.rep}</td>
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
    </div>
  );
};

export default TargetsDashboard;
