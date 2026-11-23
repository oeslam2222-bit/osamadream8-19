import {
  BarChart3,
  Building2,
  CloudDownload,
  Layers,
  Package,
  Search,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { formatCompactAmount, growthToneClass, formatGrowth } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';
import { ItemSalesAggDoc, ItemSalesSector } from '../../services/itemSalesAggregateService';

interface ItemSalesFinalSummaryDashboardProps {
  docs: ItemSalesAggDoc[];
  sector: 'home' | 'electrical';
  canSwitchSector?: boolean;
  onSelectSector?: (sector: ItemSalesSector) => void;
  onLoadCustomerSummary?: () => void;
  isFetchingDetailed?: boolean;
  fromCache?: boolean;
}

export const ItemSalesFinalSummaryDashboard: React.FC<ItemSalesFinalSummaryDashboardProps> = ({
  docs,
  sector,
  canSwitchSector,
  onSelectSector,
  onLoadCustomerSummary,
  isFetchingDetailed,
  fromCache,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const sectorDocs = useMemo(
    () =>
      docs
        .filter((d) => d.sector === sector)
        .sort((a, b) => a.month - b.month),
    [docs, sector]
  );

  const availableMonths = useMemo(
    () => sectorDocs.map((d) => d.month).sort((a, b) => a - b),
    [sectorDocs]
  );

  const filteredDocs = useMemo(
    () =>
      selectedMonth === 'all'
        ? sectorDocs
        : sectorDocs.filter((d) => d.month === selectedMonth),
    [sectorDocs, selectedMonth]
  );

  const summary = useMemo(() => {
    let totalAmount = 0;
    let totalPieces = 0;
    let totalRows = 0;
    let maxMonthCustomers = 0;

    const itemMap = new Map<
      string,
      { code: string; name: string; family: string; group: string; amount: number; pieces: number; customers: number }
    >();
    const familyMap = new Map<string, { name: string; amount: number; pieces: number; itemsCount: number }>();
    const repMap = new Map<string, { name: string; amount: number; pieces: number; customers: number }>();
    const branchMap = new Map<string, { name: string; amount: number; pieces: number; customers: number }>();
    const customerMap = new Map<string, { code: string; name: string; amount: number; pieces: number; items: number }>();

    for (const doc of filteredDocs) {
      totalAmount += doc.totals.a || 0;
      totalPieces += doc.totals.p || 0;
      totalRows += doc.rows || 0;
      if ((doc.totals.cu || 0) > maxMonthCustomers) maxMonthCustomers = doc.totals.cu || 0;

      for (const it of doc.items || []) {
        const key = (it.c || it.n || '').trim().toLowerCase();
        if (!key) continue;
        const cur = itemMap.get(key) || {
          code: it.c || '—',
          name: it.n || it.c || 'صنف غير محدد',
          family: (it.f || it.g || 'عام').trim() || 'عام',
          group: (it.g || it.f || 'عام').trim() || 'عام',
          amount: 0,
          pieces: 0,
          customers: 0,
        };
        cur.amount += it.a || 0;
        cur.pieces += it.p || 0;
        if ((it.cu || 0) > cur.customers) cur.customers = it.cu || 0;
        itemMap.set(key, cur);

        const famName = cur.family;
        const famCur = familyMap.get(famName) || { name: famName, amount: 0, pieces: 0, itemsCount: 0 };
        famCur.amount += it.a || 0;
        famCur.pieces += it.p || 0;
        familyMap.set(famName, famCur);
      }

      for (const rep of doc.reps || []) {
        const name = (rep.n || 'غير محدد').trim() || 'غير محدد';
        const cur = repMap.get(name) || { name, amount: 0, pieces: 0, customers: 0 };
        cur.amount += rep.a || 0;
        cur.pieces += rep.p || 0;
        if ((rep.cu || 0) > cur.customers) cur.customers = rep.cu || 0;
        repMap.set(name, cur);
      }

      for (const wh of doc.warehouses || []) {
        const name = (wh.n || 'غير محدد').trim() || 'غير محدد';
        const cur = branchMap.get(name) || { name, amount: 0, pieces: 0, customers: 0 };
        cur.amount += wh.a || 0;
        cur.pieces += wh.p || 0;
        if ((wh.cu || 0) > cur.customers) cur.customers = wh.cu || 0;
        branchMap.set(name, cur);
      }

      for (const cust of doc.customers || []) {
        const key = (cust.c || cust.n || '').trim().toLowerCase();
        if (!key) continue;
        const cur = customerMap.get(key) || {
          code: cust.c || '—',
          name: cust.n || cust.c || 'عميل',
          amount: 0,
          pieces: 0,
          items: 0,
        };
        cur.amount += cust.a || 0;
        cur.pieces += cust.p || 0;
        if ((cust.items || 0) > cur.items) cur.items = cust.items || 0;
        customerMap.set(key, cur);
      }
    }

    // Count distinct items per family
    const famItems = new Map<string, Set<string>>();
    itemMap.forEach((it, key) => {
      const set = famItems.get(it.family) || new Set<string>();
      set.add(key);
      famItems.set(it.family, set);
    });
    familyMap.forEach((fam, key) => {
      fam.itemsCount = famItems.get(key)?.size || 0;
    });

    const q = searchQuery.trim().toLowerCase();
    const filterBySearch = <T extends { name: string; code?: string; family?: string }>(list: T[]) =>
      !q
        ? list
        : list.filter(
            (x) =>
              x.name.toLowerCase().includes(q) ||
              (x.code && x.code.toLowerCase().includes(q)) ||
              (x.family && x.family.toLowerCase().includes(q))
          );

    const allItems = filterBySearch(Array.from(itemMap.values()));
    const topItemsByValue = [...allItems].sort((a, b) => b.amount - a.amount).slice(0, 15);
    const topItemsByQty = [...allItems].sort((a, b) => b.pieces - a.pieces).slice(0, 15);
    const slowItems = [...allItems].filter((i) => i.amount > 0).sort((a, b) => a.amount - b.amount).slice(0, 8);
    const families = Array.from(familyMap.values())
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    const branches = Array.from(branchMap.values())
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    const reps = Array.from(repMap.values())
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    const topCustomers = Array.from(customerMap.values())
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    // Month-to-month growth
    let growthPctValue: number | null = null;
    if (selectedMonth !== 'all') {
      const prevDoc = sectorDocs.find((d) => d.month === selectedMonth - 1);
      if (prevDoc && prevDoc.totals.a > 0) {
        growthPctValue = ((totalAmount - prevDoc.totals.a) / prevDoc.totals.a) * 100;
      }
    } else if (sectorDocs.length >= 2) {
      const last = sectorDocs[sectorDocs.length - 1];
      const prev = sectorDocs[sectorDocs.length - 2];
      if (prev && prev.totals.a > 0) {
        growthPctValue = ((last.totals.a - prev.totals.a) / prev.totals.a) * 100;
      }
    }

    return {
      totalAmount,
      totalPieces,
      totalRows,
      itemsCount: itemMap.size,
      maxMonthCustomers,
      growthPctValue,
      topItemsByValue,
      topItemsByQty,
      slowItems,
      families,
      branches,
      reps,
      topCustomers,
    };
  }, [filteredDocs, sectorDocs, selectedMonth, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Final-Numbers Notice Bar */}
      <section className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3 shadow-[0_2px_10px_rgba(15,43,56,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-black text-slate-900">
                  وضع الأرقام النهائية فقط (ملخص فوري بدون تحميل 100 ألف صف)
                </h2>
                {fromCache && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                    من الذاكرة المحلية
                  </span>
                )}
              </div>
              <p className="text-[11px] font-bold text-slate-500">
                تم تجميع {summary.totalRows.toLocaleString('ar-EG')} حركة في ملخصات خفيفة (~20-80KB) لتفتح الشاشة فوراً حتى على النت الضعيف.
              </p>
            </div>
          </div>

          {onLoadCustomerSummary && (
            <button
              type="button"
              onClick={onLoadCustomerSummary}
              disabled={isFetchingDetailed}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-black transition cursor-pointer disabled:opacity-50"
            >
              <CloudDownload className={`w-3.5 h-3.5 ${isFetchingDetailed ? 'animate-bounce' : ''}`} />
              <span>{isFetchingDetailed ? 'جاري التحميل...' : 'تحميل ملخص العملاء (اختياري)'}</span>
            </button>
          )}
        </div>

        {/* Sector + Month + Quick Search */}
        <div className="flex flex-wrap items-center gap-2">
          {canSwitchSector && onSelectSector && (
            <div className="flex items-center gap-1.5">
              {([
                { key: 'home' as const, label: '🏠 منزلي' },
                { key: 'electrical' as const, label: '⚡ كهربائي' },
              ]).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSelectSector(s.key)}
                  className={`h-8 px-3 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                    sector === s.key
                      ? s.key === 'electrical'
                        ? 'bg-[var(--app-violet)] text-white border-[var(--app-violet)]'
                        : 'bg-[var(--app-navy)] text-white border-[var(--app-navy)]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-black text-slate-800 cursor-pointer"
          >
            <option value="all">كل الشهور ({availableMonths.length})</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {MONTH_NAMES_MAP[m] || `شهر ${m}`}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الأصناف أو العائلات أو الفروع..."
              className="w-full h-9 pr-8 pl-8 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold text-slate-500">إجمالي المبيعات</div>
          <div className="text-lg sm:text-xl font-black text-slate-900 font-mono mt-1">
            {formatCurrency(summary.totalAmount)}
          </div>
          {summary.growthPctValue !== null && (
            <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md border text-[10px] font-black ${growthToneClass(summary.growthPctValue)}`}>
              {summary.growthPctValue >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {formatGrowth(summary.growthPctValue)}
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold text-slate-500">إجمالي الكمية</div>
          <div className="text-lg sm:text-xl font-black text-slate-900 font-mono mt-1">
            {Math.round(summary.totalPieces).toLocaleString('ar-EG')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-1">قطعة / كرتونة</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold text-slate-500">الأصناف المباعة</div>
          <div className="text-lg sm:text-xl font-black text-slate-900 font-mono mt-1">
            {summary.itemsCount.toLocaleString('ar-EG')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-1">
            ضمن {summary.families.length.toLocaleString('ar-EG')} عائلة
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-[11px] font-bold text-slate-500">العملاء النشطين</div>
          <div className="text-lg sm:text-xl font-black text-slate-900 font-mono mt-1">
            {summary.maxMonthCustomers.toLocaleString('ar-EG')}
          </div>
          <div className="text-[10px] font-bold text-slate-400 mt-1">أعلى عدد عملاء بشهر</div>
        </div>
      </div>

      {/* Months Table */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">ملخص الشهور النهائي</h3>
          <span className="text-[10px] font-bold text-slate-400">اضغط على شهر للتصفية</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10.5px] font-black text-slate-500">
                <th className="px-3 py-2.5">الشهر</th>
                <th className="px-3 py-2.5">عدد العملاء</th>
                <th className="px-3 py-2.5">عدد الأصناف</th>
                <th className="px-3 py-2.5">إجمالي القطع</th>
                <th className="px-3 py-2.5">إجمالي المبيعات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectorDocs.map((doc) => {
                const isSelected = selectedMonth === doc.month;
                return (
                  <tr
                    key={`${doc.sector}-${doc.month}`}
                    onClick={() => setSelectedMonth(isSelected ? 'all' : doc.month)}
                    className={`cursor-pointer transition ${isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-3 py-2.5 font-black text-slate-800">{MONTH_NAMES_MAP[doc.month] || doc.month}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-700">{(doc.totals.cu || 0).toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-700">{(doc.items?.length || 0).toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-700">{Math.round(doc.totals.p || 0).toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2.5 font-mono font-black text-slate-900">{formatCurrency(doc.totals.a || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Branches & Reps & Families */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5 mb-3">
            <Building2 className="w-4 h-4 text-[var(--app-navy-text)]" />
            ملخص الفروع ({summary.branches.length})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {summary.branches.map((b) => {
              const pct = summary.totalAmount > 0 ? (b.amount / summary.totalAmount) * 100 : 0;
              return (
                <div key={b.name} className="pb-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between text-[11px] font-black text-slate-800">
                    <span className="truncate">{b.name}</span>
                    <span className="font-mono">{formatCompactAmount(b.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-[#102b4e] rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9.5px] font-bold text-slate-400">
                    <span>{pct.toFixed(1)}%</span>
                    <span>{Math.round(b.pieces).toLocaleString('ar-EG')} قطعة</span>
                  </div>
                </div>
              );
            })}
            {summary.branches.length === 0 && <div className="text-xs text-slate-400 text-center py-6">لا توجد بيانات فروع</div>}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5 mb-3">
            <Layers className="w-4 h-4 text-emerald-700" />
            ملخص العائلات ({summary.families.length})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {summary.families.slice(0, 15).map((f) => {
              const pct = summary.totalAmount > 0 ? (f.amount / summary.totalAmount) * 100 : 0;
              return (
                <div key={f.name} className="pb-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between text-[11px] font-black text-slate-800">
                    <span className="truncate">{f.name}</span>
                    <span className="font-mono">{formatCompactAmount(f.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9.5px] font-bold text-slate-400">
                    <span>{pct.toFixed(1)}% · {f.itemsCount} صنف</span>
                    <span>{Math.round(f.pieces).toLocaleString('ar-EG')} قطعة</span>
                  </div>
                </div>
              );
            })}
            {summary.families.length === 0 && <div className="text-xs text-slate-400 text-center py-6">لا توجد بيانات عائلات</div>}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5 mb-3">
            <UserRound className="w-4 h-4 text-amber-600" />
            أداء المناديب ({summary.reps.length})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {summary.reps.slice(0, 15).map((r) => {
              const pct = summary.totalAmount > 0 ? (r.amount / summary.totalAmount) * 100 : 0;
              return (
                <div key={r.name} className="pb-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between text-[11px] font-black text-slate-800">
                    <span className="truncate">{r.name}</span>
                    <span className="font-mono">{formatCompactAmount(r.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9.5px] font-bold text-slate-400">
                    <span>{pct.toFixed(1)}%</span>
                    <span>{Math.round(r.pieces).toLocaleString('ar-EG')} قطعة</span>
                  </div>
                </div>
              );
            })}
            {summary.reps.length === 0 && <div className="text-xs text-slate-400 text-center py-6">لا توجد بيانات مناديب</div>}
          </div>
        </section>
      </div>

      {/* Top Items by Value & Quantity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-[var(--app-navy-text)]" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">أعلى 15 صنف بالقيمة</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="bg-slate-50 font-black text-slate-500">
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">العائلة</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.topItemsByValue.map((it) => (
                  <tr key={it.code + it.name}>
                    <td className="px-3 py-2 font-black text-slate-800 max-w-[200px] truncate" title={it.name}>
                      {it.name}
                      <span className="block text-[9px] text-slate-400 font-mono">{it.code}</span>
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-500">{it.family}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-700">{Math.round(it.pieces).toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2 font-mono font-black text-slate-900">{formatCurrency(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">أعلى 15 صنف بالكمية</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="bg-slate-50 font-black text-slate-500">
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">العائلة</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.topItemsByQty.map((it) => (
                  <tr key={it.code + it.name}>
                    <td className="px-3 py-2 font-black text-slate-800 max-w-[200px] truncate" title={it.name}>
                      {it.name}
                      <span className="block text-[9px] text-slate-400 font-mono">{it.code}</span>
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-500">{it.family}</td>
                    <td className="px-3 py-2 font-mono font-black text-emerald-700">{Math.round(it.pieces).toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-700">{formatCurrency(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {summary.topCustomers.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--app-navy-text)]" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">أعلى العملاء (من الملخص)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="bg-slate-50 font-black text-slate-500">
                  <th className="px-3 py-2">العميل</th>
                  <th className="px-3 py-2">الأصناف</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.topCustomers.map((c) => (
                  <tr key={c.code}>
                    <td className="px-3 py-2 font-black text-slate-800">
                      {c.name}
                      <span className="block text-[9px] text-slate-400 font-mono">{c.code}</span>
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-600">{c.items.toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-700">{Math.round(c.pieces).toLocaleString('ar-EG')}</td>
                    <td className="px-3 py-2 font-mono font-black text-slate-900">{formatCurrency(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
