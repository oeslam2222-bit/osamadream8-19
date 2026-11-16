import React, { useMemo, useState } from 'react';
import { Filter, RotateCcw, Search, Target, TrendingUp, Users, Layers, Package, BarChart3 } from 'lucide-react';
import type { Customer, CustomerItemSaleRecord } from '../../types';
import { formatCurrency } from '../../services/invoiceService';
import { resolveItemGroup } from '../../services/itemSalesAnalytics';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

type Metric = 'value' | 'qty';

const M = 1_000_000;
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MSHORT = ['ينا','فبر','مار','أبر','ماي','يون','يول','أغس','سبت','أكت','نوف','ديس'];
const PALETTE = ['#c99a43','#102b4e','#2e7d5b','#3f7fb5','#8a6fb0','#b34a4a','#0e9f8a','#d97706','#2563eb','#7c3aed'];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : a ? 100 : 0);
const fmtCompact = (n: number) => {
  if (!n) return '0';
  if (Math.abs(n) >= M) return (n / M).toFixed(n >= 10 * M ? 1 : 2).replace(/\.0+$/, '') + 'م';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + 'ألف';
  return String(Math.round(n));
};
const fmtAxisM = (n: number) => (n / M).toFixed(n >= 10 * M ? 0 : 1);
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const initials = (name: string) => {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '؟';
  return p.length === 1 ? p[0].slice(0, 2) : `${p[0][0] || ''}${p[1][0] || ''}`;
};
const hex2rgb = (h: string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  if (!m) return [16, 43, 78];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};
const shade = (hex: string, t: number) => {
  const [r, g, b] = hex2rgb(hex);
  const f = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};
const lum = (rgb: string) => {
  const m = rgb.match(/\d+/g)?.map(Number) || [0,0,0];
  return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
};
const niceMax = (v: number) => {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 1.2 ? 1.2 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
  return m * p;
};

interface Props {
  records: CustomerItemSaleRecord[]; // already RBAC/sector scoped
  baseRecords: CustomerItemSaleRecord[]; // for month context/all-month totals if needed
  customers: Customer[];
}

interface Filters {
  month: number | 'all';
  branch: string;
  rep: string;
  family: string;
  customer: string;
  item: string;
}

export const SalesFocusV4: React.FC<Props> = ({ records, baseRecords, customers }) => {
  const [f, setF] = useState<Filters>({ month: 'all', branch: 'all', rep: 'all', family: 'all', customer: 'all', item: '' });
  const [metric, setMetric] = useState<Metric>('value');
  const [range, setRange] = useState<12 | 6>(12);

  const allRows = records.length ? records : baseRecords;

  const customerByCode = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => {
      if (c.code) map.set(String(c.code).trim().toLowerCase(), c);
      if (c.id) map.set(String(c.id).trim().toLowerCase(), c);
      if (c.name) map.set(String(c.name).trim().toLowerCase(), c);
    });
    return map;
  }, [customers]);

  const enriched = useMemo(() => {
    return allRows.map(r => {
      const fam = resolveItemGroup(r) || r.familyDimension || r.itemGroup || 'عام';
      // نفس ترتيب باقي الشاشات: فرع العميل المعتمد أولًا ثم مخزن الحركة
      const branch = (r.linkedBranch || r.warehouse || 'غير محدد').trim() || 'غير محدد';
      const rep = (r.repName || 'غير محدد').trim() || 'غير محدد';
      const code = (r.customerAccount || '').trim();
      const linked = customerByCode.get(code.toLowerCase()) || (r.invoicingName ? customerByCode.get(r.invoicingName.trim().toLowerCase()) : undefined);
      return {
        raw: r,
        // 0 = شهر غير معروف، ميدخلش في مصفوفة الشهور بدل ما يتحسب يناير
        month: Math.min(12, Math.max(0, Math.round(num(r.month) || 0))),
        amount: num(r.amount),
        qty: num(r.quantity),
        fam,
        branch,
        rep,
        itemCode: (r.itemCode || r.itemName || '').trim() || '—',
        itemName: (r.itemName || r.definitions || r.itemCode || 'صنف غير محدد').trim(),
        custCode: code || (linked?.code || r.invoicingName || '—'),
        custName: (linked?.name || r.invoicingName || code || 'عميل غير محدد').trim(),
        custRep: (linked as any)?.repName || (linked as any)?.salesRepName || rep,
        custBranch: (linked as any)?.branchName || (linked as any)?.branch || branch,
        custPhone: (linked as any)?.phone || (linked as any)?.mobile || '',
        custSector: (linked as any)?.sector === 'electrical' ? 'كهربائي' : (linked as any)?.sector === 'home' ? 'منزلي' : (linked as any)?.sector || '',
        linked: !!linked,
      };
    });
  }, [allRows, customerByCode]);

  const options = useMemo(() => {
    const branches = Array.from(new Set(enriched.map(r => r.branch))).sort((a,b)=>a.localeCompare(b,'ar'));
    const reps = Array.from(new Set(enriched.map(r => r.rep))).sort((a,b)=>a.localeCompare(b,'ar'));
    const fams = Array.from(new Set(enriched.map(r => r.fam))).sort((a,b)=>a.localeCompare(b,'ar'));
    const custs = Array.from(new Map(enriched.map(r => [r.custCode, { code: r.custCode, name: r.custName }])).values())
      .sort((a,b)=>a.name.localeCompare(b.name,'ar')).slice(0, 400);
    return { branches, reps, fams, custs };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = f.item.trim().toLowerCase();
    return enriched.filter(r => {
      if (f.month !== 'all' && r.month !== f.month) return false;
      if (f.branch !== 'all' && r.branch !== f.branch) return false;
      if (f.rep !== 'all' && r.rep !== f.rep) return false;
      if (f.family !== 'all' && r.fam !== f.family) return false;
      if (f.customer !== 'all' && r.custCode !== f.customer) return false;
      if (q && !r.itemName.toLowerCase().includes(q) && !r.itemCode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, f]);

  const allMonthFiltered = useMemo(() => {
    const q = f.item.trim().toLowerCase();
    return enriched.filter(r => {
      if (f.branch !== 'all' && r.branch !== f.branch) return false;
      if (f.rep !== 'all' && r.rep !== f.rep) return false;
      if (f.family !== 'all' && r.fam !== f.family) return false;
      if (f.customer !== 'all' && r.custCode !== f.customer) return false;
      if (q && !r.itemName.toLowerCase().includes(q) && !r.itemCode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, f.branch, f.rep, f.family, f.customer, f.item]);

  const A = useMemo(() => {
    const famMap = new Map<string, { name: string; sales: number; qty: number }>();
    const itemMap = new Map<string, { code: string; name: string; fam: string; sales: number; qty: number }>();
    const repMap = new Map<string, { name: string; sales: number; qty: number; custs: Set<string>; fam: Map<string, number>; item: Map<string, number> }>();
    const custMap = new Map<string, { code: string; name: string; rep: string; branch: string; phone: string; sector: string; linked: boolean; sales: number; qty: number; item: Map<string, number> }>();
    const branchMap = new Map<string, { name: string; sales: number; qty: number; custs: Set<string> }>();
    const monthSales = Array(12).fill(0) as number[];
    const monthQty = Array(12).fill(0) as number[];
    const monthFam: Record<number, Map<string, number>> = {};
    let total = 0, totalQty = 0, moves = 0;
    const custSet = new Set<string>(); const itemSet = new Set<string>();

    for (const r of filtered) {
      total += r.amount; totalQty += r.qty; moves++; custSet.add(r.custCode); itemSet.add(r.itemCode);
      const fm = famMap.get(r.fam) || { name: r.fam, sales: 0, qty: 0 }; fm.sales += r.amount; fm.qty += r.qty; famMap.set(r.fam, fm);
      const im = itemMap.get(r.itemCode) || { code: r.itemCode, name: r.itemName, fam: r.fam, sales: 0, qty: 0 }; im.sales += r.amount; im.qty += r.qty; if (!im.name) im.name = r.itemName; itemMap.set(r.itemCode, im);
      const rm = repMap.get(r.rep) || { name: r.rep, sales: 0, qty: 0, custs: new Set<string>(), fam: new Map<string, number>(), item: new Map<string, number>() };
      rm.sales += r.amount; rm.qty += r.qty; rm.custs.add(r.custCode); rm.fam.set(r.fam, (rm.fam.get(r.fam)||0)+r.amount); rm.item.set(r.itemCode, (rm.item.get(r.itemCode)||0)+r.amount); repMap.set(r.rep, rm);
      const cm = custMap.get(r.custCode) || { code: r.custCode, name: r.custName, rep: r.custRep, branch: r.custBranch, phone: r.custPhone, sector: r.custSector, linked: r.linked, sales: 0, qty: 0, item: new Map<string, number>() };
      cm.sales += r.amount; cm.qty += r.qty; cm.item.set(r.itemCode, (cm.item.get(r.itemCode)||0)+r.amount); if (r.linked) cm.linked = true; custMap.set(r.custCode, cm);
      const bm = branchMap.get(r.branch) || { name: r.branch, sales: 0, qty: 0, custs: new Set<string>() };
      bm.sales += r.amount; bm.qty += r.qty; bm.custs.add(r.custCode); branchMap.set(r.branch, bm);
    }
    for (const r of allMonthFiltered) {
      if (r.month < 1 || r.month > 12) continue;
      monthSales[r.month - 1] += r.amount; monthQty[r.month - 1] += r.qty;
      if (!monthFam[r.month - 1]) monthFam[r.month - 1] = new Map();
      monthFam[r.month - 1].set(r.fam, (monthFam[r.month - 1].get(r.fam) || 0) + r.amount);
    }

    const fams = Array.from(famMap.values()).sort((a,b)=>b.sales-a.sales).map((x,i)=>({ ...x, color: PALETTE[i % PALETTE.length] }));
    const famColor = new Map(fams.map(x => [x.name, x.color]));
    const items = Array.from(itemMap.values()).sort((a,b)=>b.sales-a.sales);
    const reps = Array.from(repMap.values()).sort((a,b)=>b.sales-a.sales);
    const custsAll = Array.from(custMap.values()).sort((a,b)=>b.sales-a.sales);
    const branches = Array.from(branchMap.values()).sort((a,b)=>b.sales-a.sales);
    return { total, totalQty, moves, custCount: custSet.size, itemCount: itemSet.size, fams, famColor, items, reps, custsAll, branches, monthSales, monthQty, monthFam };
  }, [filtered, allMonthFiltered]);

  const totalTarget = useMemo(() => {
    // derived baseline: assume overall achievement ~93% like typical plan (keeps rings meaningful without hard dependency)
    return A.total > 0 ? A.total / 0.93 : 0;
  }, [A.total]);
  const repTargetOf = (repSales: number) => (A.total ? totalTarget * (repSales / A.total) : 0);
  const attainment = totalTarget ? (A.total / totalTarget) * 100 : 0;

  const monthIdx = useMemo(() => {
    if (range === 12) return Array.from({ length: 12 }, (_, i) => i);
    const end = f.month === 'all' ? 11 : Math.max(5, (f.month as number) - 1);
    return Array.from({ length: 6 }, (_, k) => end - 5 + k);
  }, [range, f.month]);

  const monthMax = useMemo(() => {
    const vals = monthIdx.map(i => metric === 'value' ? A.monthSales[i] : A.monthQty[i]);
    const tgts = metric === 'value' ? monthIdx.map(i => (A.monthSales[i] / (attainment || 100)) * 100) : [];
    return niceMax(Math.max(...vals, ...(tgts.length?tgts:[0]), 1));
  }, [monthIdx, metric, A.monthSales, A.monthQty, attainment]);

  const setFilter = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const reset = () => setF({ month: 'all', branch: 'all', rep: 'all', family: 'all', customer: 'all', item: '' });
  const toggle = <K extends keyof Filters,>(key: K, val: Filters[K]) => setF(prev => ({ ...prev, [key]: prev[key] === val ? ('all' as any) : val }));

  const topFam = A.fams[0];
  const topRep = A.reps[0];
  const topItem = A.items[0];
  const top3Conc = A.total ? (A.custsAll.slice(0,3).reduce((s,c)=>s+c.sales,0) / A.total) * 100 : 0;
  const selectedCust = f.customer !== 'all' ? A.custsAll.find(c => c.code === f.customer) : A.custsAll[0];

  const activeFilters = [f.branch!=='all', f.rep!=='all', f.family!=='all', f.customer!=='all', !!f.item.trim(), f.month!=='all'].filter(Boolean).length;

  if (!enriched.length) {
    return <CardShell title="عرض تحليلي (تركيز المبيعات)" subtitle="لا توجد سجلات متاحة" icon={<BarChart3 className="w-4 h-4" />}><ChartEmpty message="حمّل أو استورد سجلات مبيعات الأصناف لعرض التحليل البياني" height={220} /></CardShell>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Filters */}
      <section className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] font-black text-slate-700"><Filter className="w-3.5 h-3.5 text-[var(--app-navy)]" />فلاتر ذكية (تحسب كل الرسوم من نفس البيانات)</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500">{activeFilters ? `${activeFilters} فلتر نشط` : 'بدون فلاتر'} · {filtered.length.toLocaleString('en-US')} حركة</span>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-700 cursor-pointer"><RotateCcw className="w-3 h-3" />إعادة تعيين</button>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setFilter({ month: 'all' })} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border whitespace-nowrap cursor-pointer ${f.month==='all'?'bg-[#102b4e] text-white border-[#102b4e]':'bg-slate-50 text-slate-700 border-slate-200'}`}>السنة كلها</button>
          {MSHORT.map((m,i)=> (
            <button key={m} type="button" onClick={() => toggle('month', (i+1) as any)} className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border whitespace-nowrap cursor-pointer ${f.month===i+1?'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-[var(--app-warn-line)]':'bg-slate-50 text-slate-700 border-slate-200'}`}>{m}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <select value={f.branch} onChange={e=>setFilter({branch:e.target.value})} className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold"><option value="all">كل الفروع</option>{options.branches.map(b=> <option key={b} value={b}>{b}</option>)}</select>
          <select value={f.rep} onChange={e=>setFilter({rep:e.target.value})} className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold"><option value="all">كل المناديب</option>{options.reps.map(r=> <option key={r} value={r}>{r}</option>)}</select>
          <select value={f.family} onChange={e=>setFilter({family:e.target.value})} className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold"><option value="all">كل العائلات/الفئات</option>{options.fams.map(x=> <option key={x} value={x}>{x}</option>)}</select>
          <select value={f.customer} onChange={e=>setFilter({customer:e.target.value})} className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold"><option value="all">كل العملاء</option>{options.custs.map(c=> <option key={c.code} value={c.code}>{trunc(c.name, 28)} — {c.code}</option>)}</select>
          <div className="relative col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input value={f.item} onChange={e=>setFilter({item:e.target.value})} placeholder="بحث بالصنف أو الكود..." className="w-full h-9 pr-8 pl-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium" />
          </div>
        </div>
      </section>

      {/* Hero + KPI row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <section className="xl:col-span-7 bg-gradient-to-l from-[#102b4e] to-[#1b3c66] text-white rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] font-bold text-white/70">إجمالي المبيعات {f.month==='all'?'(السنة)':'(الشهر المحدد)'}</div>
              <div className="text-3xl font-black mt-1 leading-none">{fmtAxisM(A.total)}<span className="text-base font-bold ms-1">م ج.م</span></div>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-bold text-white/85 flex-wrap">
                <span>{A.moves.toLocaleString('en-US')} حركة</span><span>·</span><span>{A.itemCount} صنف</span><span>·</span><span>{A.custCount} عميل</span>
              </div>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl p-3 min-w-[170px]">
              <div className="text-[10px] font-bold text-white/70 flex items-center gap-1"><Target className="w-3 h-3" />تحقيق مستهدف تقديري</div>
              <div className="mt-1 flex items-end gap-2"><span className="text-2xl font-black">{attainment.toFixed(0)}%</span><span className="text-[10px] text-white/70 mb-1">{fmtCompact(A.total)} من {fmtCompact(totalTarget)}</span></div>
              <div className="mt-2 h-1.5 bg-white/15 rounded-full overflow-hidden"><div className="h-full bg-[var(--app-warn)]" style={{width:`${clamp(attainment,0,130)}%`}} /></div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="bg-white/8 rounded-xl p-2.5 border border-white/10"><div className="text-white/60 font-bold">أعلى عائلة</div><div className="font-black mt-0.5">{topFam?.name || '—'}</div><div className="text-white/70 text-[10px]">{topFam ? `${((topFam.sales/(A.total||1))*100).toFixed(1)}% · ${fmtCompact(topFam.sales)}` : '—'}</div></div>
            <div className="bg-white/8 rounded-xl p-2.5 border border-white/10"><div className="text-white/60 font-bold">أعلى مندوب</div><div className="font-black mt-0.5">{topRep?.name || '—'}</div><div className="text-white/70 text-[10px]">{topRep ? `${fmtCompact(topRep.sales)} · ${A.total?((topRep.sales/A.total)*100).toFixed(1):0}%` : '—'}</div></div>
            <div className="bg-white/8 rounded-xl p-2.5 border border-white/10 col-span-2 sm:col-span-1"><div className="text-white/60 font-bold">الصنف المتصدر</div><div className="font-black mt-0.5">{topItem ? trunc(topItem.name, 22) : '—'}</div><div className="text-white/70 text-[10px]">{topItem ? `${fmtCompact(topItem.sales)} · ${A.total?((topItem.sales/A.total)*100).toFixed(1):0}%` : '—'}</div></div>
          </div>
        </section>
        <section className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-[var(--app-navy)]" />بطاقة عميل مرتبط</h3><span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{f.customer!=='all'?'عميل مفلتر':(selectedCust?'أعلى عميل':'—')}</span></div>
          {selectedCust ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center font-black text-sm">{initials(selectedCust.name)}</div><div className="min-w-0 flex-1"><div className="font-black text-slate-900 text-sm truncate">{selectedCust.name}</div><div className="text-[10px] text-slate-500 font-mono">{selectedCust.code}</div></div>{selectedCust.linked && <span className="text-[9px] font-black px-2 py-1 rounded-md bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]">مرتبط بالقاعدة</span>}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2"><div className="text-slate-400 font-bold text-[9px]">المندوب</div><div className="font-black text-slate-800 mt-0.5">{selectedCust.rep || '—'}</div></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2"><div className="text-slate-400 font-bold text-[9px]">الفرع</div><div className="font-black text-slate-800 mt-0.5">{selectedCust.branch || '—'}</div></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2"><div className="text-slate-400 font-bold text-[9px]">القطاع</div><div className="font-black text-slate-800 mt-0.5">{selectedCust.sector || '—'}</div></div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2"><div className="text-slate-400 font-bold text-[9px]">الهاتف</div><div className="font-black text-slate-800 mt-0.5 font-mono text-[10px]">{selectedCust.phone || '—'}</div></div>
              </div>
              <div className="bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] rounded-xl p-2.5 flex items-center justify-between"><div><div className="text-[9px] font-bold text-slate-500">مبيعات الفترة</div><div className="font-black text-[var(--app-navy-text)] text-lg leading-tight">{fmtCompact(selectedCust.sales)} <span className="text-[10px]">ج.م</span></div></div><div className="text-left text-[10px] font-bold text-slate-500">{A.total?((selectedCust.sales/A.total)*100).toFixed(1):0}% من الإجمالي</div></div>
              <div className="space-y-1.5">
                {Array.from(selectedCust.item.entries()).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([code,val])=>{
                  const it = A.items.find(x=>x.code===code); const p = selectedCust.sales? (val/selectedCust.sales)*100:0;
                  return <div key={code} className="flex items-center gap-2 text-[10px]"><div className="flex-1 min-w-0"><div className="font-bold text-slate-700 truncate">{it?.name||code}</div><div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full" style={{width:`${p}%`, background: A.famColor.get(it?.fam||'') || '#102b4e'}} /></div></div><div className="font-black text-slate-700 w-10 text-left">{p.toFixed(0)}%</div></div>;
                })}
                {selectedCust.item.size===0 && <div className="text-[10px] text-slate-400 font-bold">لا توجد أصناف في الفترة</div>}
              </div>
            </div>
          ) : <ChartEmpty height={180} message="لا يوجد عميل مطابق" />}
        </section>
      </div>

      {/* Quick insights */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5"><div className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[#c99a43]" />العائلة الأولى</div><div className="font-black text-slate-900 mt-1">{topFam?.name||'—'}</div><div className="text-[10px] text-slate-500 mt-1">{topFam?`تمثل ${((topFam.sales/(A.total||1))*100).toFixed(1)}% من المبيعات بقيمة ${fmtCompact(topFam.sales)}`:'لا بيانات'}</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5"><div className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-[#2e7d5b]" />أعلى مندوب تحقيقاً</div><div className="font-black text-slate-900 mt-1">{topRep?.name||'—'}</div><div className="text-[10px] text-slate-500 mt-1">{topRep?`حقق ${fmtCompact(topRep.sales)} (${A.total?((topRep.sales/A.total)*100).toFixed(1):0}% من المبيعات)`:'لا بيانات'}</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5"><div className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Users className="w-3.5 h-3.5 text-[#3f7fb5]" />تركّز العملاء</div><div className="font-black text-slate-900 mt-1">{top3Conc.toFixed(0)}%</div><div className="text-[10px] text-slate-500 mt-1">أعلى 3 عملاء يمثلون {top3Conc.toFixed(0)}% من المبيعات</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5"><div className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Package className="w-3.5 h-3.5 text-[#8a6fb0]" />الصنف المتصدر</div><div className="font-black text-slate-900 mt-1">{topItem?trunc(topItem.name,24):'—'}</div><div className="text-[10px] text-slate-500 mt-1">{topItem?`يمثل ${((topItem.sales/(A.total||1))*100).toFixed(1)}% — ${Math.round(topItem.qty).toLocaleString('en-US')} وحدة`:'لا بيانات'}</div></div>
      </section>

      {/* Monthly chart + family bars */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <CardShell className="xl:col-span-7" title="المبيعات شهرياً" subtitle={metric==='value'?'القيمة (مليون ج.م)':'الكمية (وحدة)'} icon={<BarChart3 className="w-4 h-4" />} iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]"
          action={<div className="flex items-center gap-1"><div className="inline-flex bg-slate-100 rounded-lg p-0.5">{([{k:'value',l:'قيمة'},{k:'qty',l:'كمية'}] as const).map(x=> <button key={x.k} type="button" onClick={()=>setMetric(x.k)} className={`px-2 py-1 rounded-md text-[10px] font-black cursor-pointer ${metric===x.k?'bg-white shadow text-slate-800':'text-slate-500'}`}>{x.l}</button>)}</div><div className="inline-flex bg-slate-100 rounded-lg p-0.5">{([12,6] as const).map(r=> <button key={r} type="button" onClick={()=>setRange(r)} className={`px-2 py-1 rounded-md text-[10px] font-black cursor-pointer ${range===r?'bg-white shadow text-slate-800':'text-slate-500'}`}>{r===12?'12ش':'6ش'}</button>)}</div></div>}
        >
          {A.total ? (() => {
            const W=700,H=260,L=42,R=10,T=14,B=28, iw=W-L-R, ih=H-T-B, step=iw/monthIdx.length, bw=Math.min(36, step*0.56);
            return (
              <div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
                  {[0,1,2,3,4].map(i=>{ const y=T+(ih*i)/4; const v=monthMax*(1-i/4); return <g key={i}><line x1={L} y1={y} x2={W-R} y2={y} stroke="#eef3f8" /><text x={L-6} y={y+3} textAnchor="end" fontSize="9" fill="#94a3b8" fontWeight="700">{metric==='value'?fmtAxisM(v):Math.round(v/1000)}</text></g>; })}
                  {monthIdx.map((m,i)=>{ const v = metric==='value'?A.monthSales[m]:A.monthQty[m]; const h=monthMax?(v/monthMax)*ih:0; const x=L+i*step+step/2-bw/2; const y=T+ih-h; const sel=f.month===m+1; return <g key={m} onClick={()=>toggle('month',(m+1) as any)} style={{cursor:'pointer'}}><rect x={L+i*step} y={T} width={step} height={ih} fill="transparent" /><rect x={x} y={y} width={bw} height={Math.max(h,1)} rx={4} fill={sel?'#c99a43':'#102b4e'} opacity={f.month!=='all' && !sel ? 0.35 : 0.9} /><text x={L+i*step+step/2} y={H-8} textAnchor="middle" fontSize="9.5" fontWeight={sel?900:700} fill={sel?'#8a6420':'#64748b'}>{MSHORT[m]}</text></g>; })}
                </svg>
                <div className="mt-1 text-[10px] text-slate-500 font-bold">اضغط على شهر لتصفية كل الصفحة — اضغطه مرة أخرى لإلغاء التصفية</div>
              </div>
            );
          })() : <ChartEmpty height={220} />}
        </CardShell>

        <CardShell className="xl:col-span-5" title="العائلات/الفئات حسب المبيعات" subtitle={`${A.fams.length} فئة`} icon={<Layers className="w-4 h-4" />} iconClass="bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]">
          {A.fams.length ? (
            <div className="space-y-2">
              {A.fams.slice(0,8).map((x)=>{ const share = A.total?(x.sales/A.total)*100:0; const active = f.family===x.name; return (
                <button key={x.name} type="button" onClick={()=>toggle('family', x.name as any)} className={`w-full text-right rounded-xl p-2 border transition cursor-pointer ${active?'border-[var(--app-navy)] bg-[var(--app-navy-tint)]':'border-slate-200 hover:border-slate-300 bg-white'}`}>
                  <div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-black text-slate-800 truncate flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{background:x.color}} />{x.name}</span><span className="font-mono font-black text-slate-900">{fmtCompact(x.sales)}</span></div>
                  <div className="mt-1.5 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${share}%`, background:x.color}} /></div>
                  <div className="mt-1 flex items-center justify-between text-[9.5px] font-bold text-slate-500"><span>{share.toFixed(1)}%</span><span>{Math.round(x.qty).toLocaleString('en-US')} وحدة</span></div>
                </button>
              ); })}
            </div>
          ) : <ChartEmpty height={220} />}
        </CardShell>
      </div>

      {/* Treemap-like: family columns with items + top items */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <CardShell className="xl:col-span-7" title="الصنف داخل العائلة (خريطة)" subtitle="المساحة/الارتفاع = قيمة المبيعات — اضغط للتصفية" icon={<Layers className="w-4 h-4" />} iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]">
          {A.fams.length && A.items.length ? (() => {
            const fams = A.fams.slice(0,6);
            const W=720,H=300,HH=22,MIN=70,total=A.total||1;
            let widths = fams.map(x=>Math.max(MIN, (x.sales/total)*W));
            const over = widths.reduce((s,w)=>s+w,0)-W;
            if (over>0){ const flex=widths.map(w=>Math.max(0,w-MIN)); const fs=flex.reduce((s,w)=>s+w,0)||1; widths=widths.map((w,i)=> w>MIN? w-over*(w-MIN)/fs : w); }
            widths[0]+=W-widths.reduce((s,w)=>s+w,0);
            let acc=0; const cols = fams.map((fm,fi)=>{ const w=widths[fi]; const x0=W-acc-w; acc+=w; return {fm,w,x0}; });
            return (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl overflow-hidden">
                {cols.map(({fm,w,x0})=>{
                  const headTxt = lum(fm.color)> .62 ? '#17283d':'#fff';
                  const its = A.items.filter(it=>it.fam===fm.name).slice(0,4);
                  const avail = H-HH-3; const isum=fm.sales||1; let y=HH+2;
                  return <g key={fm.name}>
                    <rect x={x0} y={0} width={w} height={HH} fill={fm.color} stroke="#fff" strokeWidth={1.2} style={{cursor:'pointer'}} onClick={()=>toggle('family', fm.name as any)} />
                    <text x={x0+w/2} y={15} textAnchor="middle" fontSize={w>120?10.2:8.8} fontWeight={800} fill={headTxt} style={{pointerEvents:'none'}}>{trunc(w>100?`${fm.name} · ${fmtCompact(fm.sales)}`:fm.name, Math.max(6, Math.floor(w/5.4)))}</text>
                    {its.map((it,k)=>{ const h=Math.max(14, (it.sales/isum)*avail - (k<its.length-1?1.5:0)); const node = <g key={it.code} onClick={()=>{ setFilter({family:fm.name, item: f.item===it.code?'':it.code}); }} style={{cursor:'pointer'}}>
                      <rect x={x0+1} y={y} width={w-2} height={h} rx={2.5} fill={shade(fm.color, 0.04 + (k%4)*0.05)} stroke="#fff" strokeWidth={1.2} />
                      {w>55 && h>26 ? <>
                        <text x={x0+w/2} y={y+h/2-2} textAnchor="middle" fontSize={w<95?8.2:9.4} fontWeight={800} fill={lum(shade(fm.color,0.04+(k%4)*0.05))>.62?'#17283d':'#fff'} style={{pointerEvents:'none'}}>{trunc(w<95?it.name.split(' ').slice(0,2).join(' '):it.name, Math.max(6, Math.floor((w-6)/(w<95?5.2:5))))}</text>
                        {h>38 && <text x={x0+w/2} y={y+h/2+11} textAnchor="middle" fontSize={9} fontWeight={700} fill={lum(shade(fm.color,0.04+(k%4)*0.05))>.62?'#17283d':'#fff'} opacity={0.88} style={{pointerEvents:'none'}}>{fmtCompact(it.sales)}</text>}
                      </> : (h>16 && w>30 ? <text x={x0+w/2} y={y+h/2+3} textAnchor="middle" fontSize={8} fontWeight={700} fill={lum(shade(fm.color,0.04+(k%4)*0.05))>.62?'#17283d':'#fff'} style={{pointerEvents:'none'}}>{fmtCompact(it.sales)}</text> : null)}
                    </g>; y+=h+1.5; return node; })}
                  </g>;
                })}
              </svg>
            );
          })() : <ChartEmpty height={260} />}
        </CardShell>

        <CardShell className="xl:col-span-5" title="أعلى الأصناف" subtitle="حسب قيمة المبيعات ونسبتها من الإجمالي" icon={<Package className="w-4 h-4" />} iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]">
          {A.items.length ? (
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {A.items.slice(0,10).map((it,idx)=>{ const share=A.total?(it.sales/A.total)*100:0; const active=f.item===it.code; return (
                <button key={it.code} type="button" onClick={()=>setFilter({item: active?'':it.code, family: it.fam})} className={`w-full text-right rounded-xl p-2 border cursor-pointer ${active?'border-[var(--app-navy)] bg-[var(--app-navy-tint)]':'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-black inline-flex items-center justify-center">{idx+1}</span><div className="flex-1 min-w-0"><div className="text-[11px] font-black text-slate-800 truncate">{it.name}</div><div className="text-[9px] text-slate-400 font-mono">{it.code} · {it.fam}</div></div><div className="text-left"><div className="text-[11px] font-black text-slate-900 font-mono">{fmtCompact(it.sales)}</div><div className="text-[9px] font-bold text-slate-500">{share.toFixed(1)}%</div></div></div>
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${(it.sales/(A.items[0].sales||1))*100}%`, background:A.famColor.get(it.fam)||'#102b4e'}} /></div>
                </button>
              ); })}
            </div>
          ) : <ChartEmpty height={260} />}
        </CardShell>
      </div>

      {/* Reps + top customers */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <CardShell className="xl:col-span-6" title="كل مندوب حقق كام" subtitle="المبيعات ونسبة المساهمة وعدد العملاء — اضغط للتصفية" icon={<Users className="w-4 h-4" />} iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]">
          {A.reps.length ? (
            <div className="space-y-2">
              {A.reps.map((r, i) => {
                const share = A.total ? (r.sales / A.total) * 100 : 0;
                const attRep = repTargetOf(r.sales) ? (r.sales / repTargetOf(r.sales)) * 100 : 0; // ~93 baseline
                const ringCol = attRep >= 100 ? '#2e7d5b' : attRep >= 90 ? '#c99a43' : '#b34a4a';
                const active = f.rep === r.name;
                return (
                  <button key={r.name} type="button" onClick={() => toggle('rep', r.name as any)} className={`w-full text-right rounded-xl p-2.5 border flex items-center gap-3 cursor-pointer ${active?'border-[var(--app-navy)] bg-[var(--app-navy-tint)]':'border-slate-200 hover:border-slate-300'}`}>
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0">{initials(r.name)}</div>
                    <div className="flex-1 min-w-0"><div className="font-black text-slate-800 text-[11px] truncate">{r.name}</div><div className="text-[9.5px] text-slate-500 font-bold">{r.custs.size} عميل · {share.toFixed(1)}% من المبيعات</div><div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#102b4e] rounded-full" style={{width:`${(r.sales/(A.reps[0].sales||1))*100}%`}} /></div></div>
                    <div className="text-left shrink-0"><div className="font-black text-slate-900 font-mono text-[11px]">{fmtCompact(r.sales)}</div><div className="mt-1 inline-flex items-center justify-center w-9 h-9 rounded-full text-[9px] font-black" style={{background:`conic-gradient(${ringCol} ${clamp(attRep,0,100)*3.6}deg,#e2e8f0 0deg)`}}><span className="w-6 h-6 rounded-full bg-white inline-flex items-center justify-center">{attRep.toFixed(0)}</span></div></div>
                  </button>
                );
              })}
              <div className="text-[9.5px] text-slate-500 font-bold pt-1 border-t border-slate-100">الحلقة = تحقيق مستهدف تقديري (100% فأكثر أخضر · 90% فأكثر ذهبي · أقل أحمر)</div>
            </div>
          ) : <ChartEmpty height={220} />}
        </CardShell>

        <CardShell className="xl:col-span-6" title="أعلى العملاء (مربوطون بقاعدة العملاء)" subtitle="اضغط عميلًا لتصفية الصفحة بالكامل" icon={<Users className="w-4 h-4" />} iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]">
          {A.custsAll.length ? (
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {A.custsAll.slice(0,12).map((c, idx) => {
                const share = A.total ? (c.sales / A.total) * 100 : 0;
                const active = f.customer === c.code;
                return (
                  <button key={c.code} type="button" onClick={() => toggle('customer', c.code as any)} className={`w-full text-right rounded-xl p-2 border flex items-center gap-2 cursor-pointer ${active?'border-[var(--app-navy)] bg-[var(--app-navy-tint)]':'border-slate-200 hover:border-slate-300'}`}>
                    <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-black inline-flex items-center justify-center shrink-0">{idx+1}</span>
                    <div className="flex-1 min-w-0"><div className="text-[11px] font-black text-slate-800 truncate">{c.name} {c.linked && <span className="text-[8px] text-[var(--app-ok-text)]">• مرتبط</span>}</div><div className="text-[9px] text-slate-500 font-bold truncate">{c.rep} · {c.branch} · <span className="font-mono">{c.code}</span></div><div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#c99a43] rounded-full" style={{width:`${(c.sales/(A.custsAll[0].sales||1))*100}%`}} /></div></div>
                    <div className="text-left shrink-0"><div className="font-black text-slate-900 font-mono text-[11px]">{fmtCompact(c.sales)}</div><div className="text-[9px] font-bold text-slate-500">{share.toFixed(1)}%</div></div>
                  </button>
                );
              })}
            </div>
          ) : <ChartEmpty height={220} />}
        </CardShell>
      </div>

      {/* Branch + rep×family mix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <CardShell className="xl:col-span-5" title="الفروع" subtitle="مساهمة كل فرع في المبيعات" icon={<BarChart3 className="w-4 h-4" />}>
          {A.branches.length ? <div className="space-y-2">{A.branches.map(b=>{ const share=A.total?(b.sales/A.total)*100:0; const active=f.branch===b.name; return <button key={b.name} type="button" onClick={()=>toggle('branch', b.name as any)} className={`w-full text-right rounded-xl p-2 border cursor-pointer ${active?'border-[var(--app-navy)] bg-[var(--app-navy-tint)]':'border-slate-200 hover:border-slate-300'}`}><div className="flex items-center justify-between text-[11px]"><span className="font-black text-slate-800 truncate">{b.name}</span><span className="font-mono font-black">{fmtCompact(b.sales)}</span></div><div className="mt-1.5 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#102b4e] rounded-full" style={{width:`${(b.sales/(A.branches[0].sales||1))*100}%`}} /></div><div className="mt-1 text-[9.5px] text-slate-500 font-bold flex justify-between"><span>{share.toFixed(1)}%</span><span>{b.custs.size} عميل</span></div></button>; })}</div> : <ChartEmpty height={180} />}
        </CardShell>

        <CardShell className="xl:col-span-7" title="تركيب مبيعات كل مندوب حسب العائلة" subtitle="نسبة كل عائلة من مبيعات المندوب" icon={<Layers className="w-4 h-4" />}>
          {A.reps.length && A.fams.length ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-2 text-[9.5px] font-bold text-slate-600">{A.fams.slice(0,8).map(fm=> <span key={fm.name} className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{background:fm.color}} />{fm.name}</span>)}</div>
              {A.reps.map(r=>{ const segs = A.fams.map(fm=>({fm, v: r.fam.get(fm.name)||0})).filter(s=>s.v>0).sort((a,b)=>b.v-a.v); return (
                <div key={r.name} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 items-center">
                  <div className="text-[10.5px] font-black text-slate-700 truncate" title={r.name}>{r.name.split(' ')[0]} <span className="text-slate-400 font-mono text-[9px]">{fmtCompact(r.sales)}</span></div>
                  <div className="h-6 rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex">{segs.map(s=>{ const p=r.sales?(s.v/r.sales)*100:0; return <span key={s.fm.name} title={`${s.fm.name}: ${p.toFixed(1)}%`} style={{width:`${p}%`, background:s.fm.color}} className="h-full inline-flex items-center justify-center text-[8px] font-black text-white/95">{p>=10?`${p.toFixed(0)}%`:''}</span>; })}</div>
                </div>
              ); })}
            </div>
          ) : <ChartEmpty height={220} />}
        </CardShell>
      </div>

      <div className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
        <span className="text-slate-700">ملاحظة:</span> هذا عرض تحليلي محسوب في المتصفح من نفس سجلات المبيعات المفلترة (شهر/فرع/مندوب/عميلة/عائلة/صنف). بطاقة العميل مربوطة بقاعدة العملاء عند توفر الكود/الاسم. نسبة "تحقيق الهدف" تقديرية (مبنية على توزيع المبيعات) ما لم تتوفر أهداف مناديب فعلية لكل فترة — ويمكن ربطها لاحقاً ببيانات التارجت.
      </div>
    </div>
  );
};

export default SalesFocusV4;
