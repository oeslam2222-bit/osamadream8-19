/**
 * ItemSalesInsights — صفحة مبيعات الأصناف (النسخة الخفيفة الاحترافية)
 * ---------------------------------------------------------------------------
 * بتشتغل على الملخصات الشهرية الصغيرة بس (ItemSalesAggDoc) — مش على حركات
 * البيع الخام — فبتفتح فوراً ومن غير تهنيج، وأوفلاين من الكاش.
 *
 * التركيز:
 *   • مبيعات الأصناف: إجمالي + حركتها على الشهور
 *   • مبيعات العائلات: إجمالي + حركتها + أصناف كل عائلة
 *   • مبيعات الفروع: إجمالي + أصناف كل فرع
 *   • فلترة بالقطاع / الفترة / الفرع / المندوب / البحث
 *
 * تفصيل الفرع/المندوب بالصنف بيتنزّل بس لما حد يختار فرع أو مندوب
 * (fetchItemSalesCrossDocs) — أو بيتحسب محلياً من بيانات المندوب نفسه.
 */
import { BarChart3, Building2, ChevronDown, Layers, Package, PieChart as PieIcon, Search, UserRound, X } from 'lucide-react';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { formatCurrency } from '../../services/invoiceService';
import {
  fetchItemSalesCrossDocs,
  ItemSalesAggDoc,
  ItemSalesCrossDoc,
  ItemSalesSector,
} from '../../services/itemSalesAggregateService';
import '../../styles/sales-summary.css';

/* ---------------------------------------------------------------- helpers */
const nf = (n: number) => Math.round(n || 0).toLocaleString('en-US');
const compact = (v: number) => {
  const a = Math.abs(v || 0);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} مليون`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(1)} ألف`;
  return nf(v);
};
const axisShort = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : Math.abs(v) >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v);
const monthName = (m: number) => MONTH_NAMES_MAP[m] || String(m);

const normalizeAr = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
const makeMatcher = (query: string) => {
  const words = normalizeAr(query).split(' ').filter(Boolean);
  if (!words.length) return null;
  return (...fields: Array<string | undefined>) => {
    const hay = normalizeAr(fields.filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  };
};

/** ألوان الدونات: كحلي الهوية + درجات متباعدة في الإضاءة (مش اللون بس) */
const DONUT_COLORS = ['#1E3A8A', '#0F766E', '#D97706', '#7C3AED', '#0284C7', '#BE185D', '#94A3B8'];

type Row = { key: string; name: string; code?: string; family?: string; p: number; a: number; m: number[]; mp: number[] };
const emptyMonths = () => new Array(13).fill(0) as number[]; // index 1..12

/* ------------------------------------------------------------- sparkline */
const Spark: React.FC<{ values: number[]; months: number[]; highlight?: number | null }> = ({ values, months, highlight }) => {
  const max = Math.max(1, ...months.map((m) => values[m] || 0));
  const w = 7;
  const gap = 2;
  const h = 24;
  return (
    <svg
      className="si-spark"
      width={months.length * (w + gap)}
      height={h}
      viewBox={`0 0 ${months.length * (w + gap)} ${h}`}
      role="img"
      aria-label={months.map((m) => `${monthName(m)}: ${nf(values[m] || 0)}`).join('، ')}
    >
      {months.map((m, i) => {
        const v = values[m] || 0;
        const bh = v > 0 ? Math.max(2, (v / max) * h) : 1;
        // RTL: أول شهر على اليمين
        const x = (months.length - 1 - i) * (w + gap);
        return <rect key={m} x={x} y={h - bh} width={w} height={bh} rx={1.5} className={v === 0 ? 'is-zero' : highlight === m ? 'is-peak' : ''} />;
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ props */
export interface ItemSalesInsightsProps {
  docs: ItemSalesAggDoc[];
  sector: ItemSalesSector;
  canSwitchSector?: boolean;
  onSelectSector?: (sector: ItemSalesSector) => void;
  fromCache?: boolean;
  /** تفصيل الفرع/المندوب: من السيرفر (الإدارة) — ولو اتبعت crossDocs محلياً بيتستخدم بدل السيرفر */
  crossDocs?: ItemSalesCrossDoc[];
  /** حساب مندوب: الفلتر مقفول على اسمه ومش بيظهر اختيار مندوب */
  lockedRepName?: string;
  /** زرار لفتح العرض التفصيلي القديم (حركات البيع) */
  onOpenDetailed?: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const ItemSalesInsights: React.FC<ItemSalesInsightsProps> = ({
  docs,
  sector,
  canSwitchSector,
  onSelectSector,
  fromCache,
  crossDocs,
  lockedRepName,
  onOpenDetailed,
  isRefreshing,
  onRefresh,
}) => {
  /* ---------------- state */
  const sectorDocs = useMemo(
    () => docs.filter((d) => d.sector === sector).sort((a, b) => a.month - b.month),
    [docs, sector]
  );
  const availableMonths = useMemo(() => sectorDocs.map((d) => d.month), [sectorDocs]);
  const [monthFrom, setMonthFrom] = useState<number>(0); // 0 = أول شهر متاح
  const [monthTo, setMonthTo] = useState<number>(0); // 0 = آخر شهر متاح
  const [branch, setBranch] = useState('');
  const [rep, setRep] = useState('');
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);
  const [tab, setTab] = useState<'items' | 'families' | 'branches'>('items');
  const [sortBy, setSortBy] = useState<'a' | 'p'>('a');
  const [donutBy, setDonutBy] = useState<'family' | 'branch'>('family');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [remoteCross, setRemoteCross] = useState<ItemSalesCrossDoc[]>([]);
  const [crossLoading, setCrossLoading] = useState(false);
  const [crossMissing, setCrossMissing] = useState(false);

  useEffect(() => { setExpanded(null); setLimit(50); }, [tab, sector, branch, rep, monthFrom, monthTo, query, sortBy]);
  useEffect(() => { setBranch(''); setRep(''); }, [sector]);

  const from = monthFrom || availableMonths[0] || 1;
  const to = monthTo || availableMonths[availableMonths.length - 1] || 12;
  const months = useMemo(() => availableMonths.filter((m) => m >= Math.min(from, to) && m <= Math.max(from, to)), [availableMonths, from, to]);
  const rangeDocs = useMemo(() => sectorDocs.filter((d) => months.includes(d.month)), [sectorDocs, months]);

  const effectiveRep = lockedRepName ? '' : rep; // المندوب: بياناته أصلاً مقصورة عليه

  /* ---------------- قوائم الفلاتر */
  const branchOptions = useMemo(() => {
    const set = new Map<string, number>();
    sectorDocs.forEach((d) => d.warehouses.forEach((w) => set.set(w.n, (set.get(w.n) || 0) + w.a)));
    return Array.from(set.entries()).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [sectorDocs]);
  const repOptions = useMemo(() => {
    const map = new Map<string, { a: number; w?: string }>();
    sectorDocs.forEach((d) =>
      d.reps.forEach((r) => {
        const cur = map.get(r.n) || { a: 0, w: r.w };
        cur.a += r.a;
        if (!cur.w && r.w) cur.w = r.w;
        map.set(r.n, cur);
      })
    );
    return Array.from(map.entries())
      .filter(([, v]) => !branch || !v.w || v.w === branch)
      .sort((a, b) => b[1].a - a[1].a)
      .map(([n]) => n);
  }, [sectorDocs, branch]);

  /* ---------------- تفصيل الفرع/المندوب */
  const crossKind: 'r' | 'w' | null = effectiveRep ? 'r' : branch ? 'w' : null;
  const crossName = effectiveRep || branch;
  useEffect(() => {
    if (!crossKind || crossDocs) { setRemoteCross([]); setCrossMissing(false); return; }
    let alive = true;
    setCrossLoading(true);
    fetchItemSalesCrossDocs(crossKind, crossName, sector, months)
      .then((res) => {
        if (!alive) return;
        setRemoteCross(res.docs);
        setCrossMissing(res.docs.length === 0);
      })
      .finally(() => alive && setCrossLoading(false));
    return () => { alive = false; };
    // months.join عشان المقارنة تبقى بالقيمة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossKind, crossName, sector, months.join(','), crossDocs]);

  const activeCross = useMemo(() => {
    if (!crossKind) return null;
    const src = crossDocs ?? remoteCross;
    return src.filter((d) => d.kind === crossKind && d.name === crossName && d.sector === sector && months.includes(d.month));
  }, [crossKind, crossName, crossDocs, remoteCross, sector, months]);

  /* ---------------- الحساب الأساسي */
  const data = useMemo(() => {
    const meta = new Map<string, { n: string; c: string; f: string }>();
    sectorDocs.forEach((d) =>
      d.items.forEach((it) => {
        const key = it.c || it.n;
        if (key && !meta.has(key)) meta.set(key, { n: it.n || it.c, c: it.c, f: (it.f || it.g || 'عام').trim() || 'عام' });
      })
    );

    const items = new Map<string, Row>();
    const touch = (key: string, month: number, p: number, a: number) => {
      const m = meta.get(key) || { n: key, c: key, f: 'عام' };
      const row = items.get(key) || { key, name: m.n, code: m.c, family: m.f, p: 0, a: 0, m: emptyMonths(), mp: emptyMonths() };
      row.p += p;
      row.a += a;
      row.m[month] += a;
      row.mp[month] += p;
      items.set(key, row);
    };

    if (activeCross) {
      activeCross.forEach((d) => d.i.forEach(([key, p, a]) => touch(key, d.month, p, a)));
    } else {
      rangeDocs.forEach((d) => d.items.forEach((it) => touch(it.c || it.n, d.month, it.p, it.a)));
    }

    const families = new Map<string, Row & { items: number }>();
    items.forEach((it) => {
      const f = it.family || 'عام';
      const row = families.get(f) || { key: f, name: f, p: 0, a: 0, m: emptyMonths(), mp: emptyMonths(), items: 0 };
      row.p += it.p;
      row.a += it.a;
      row.items += 1;
      months.forEach((mm) => { row.m[mm] += it.m[mm]; row.mp[mm] += it.mp[mm]; });
      families.set(f, row);
    });

    const branches = new Map<string, Row>();
    rangeDocs.forEach((d) =>
      d.warehouses.forEach((w) => {
        if (branch && w.n !== branch) return;
        const row = branches.get(w.n) || { key: w.n, name: w.n, p: 0, a: 0, m: emptyMonths(), mp: emptyMonths() };
        row.p += w.p;
        row.a += w.a;
        row.m[d.month] += w.a;
        row.mp[d.month] += w.p;
        branches.set(w.n, row);
      })
    );

    const totalA = Array.from(items.values()).reduce((s, r) => s + r.a, 0);
    const totalP = Array.from(items.values()).reduce((s, r) => s + r.p, 0);
    const monthTotals = months.map((m) => ({
      month: m,
      name: monthName(m),
      a: Array.from(items.values()).reduce((s, r) => s + r.m[m], 0),
      p: Array.from(items.values()).reduce((s, r) => s + r.mp[m], 0),
    }));
    return { items, families, branches, totalA, totalP, monthTotals };
  }, [sectorDocs, rangeDocs, activeCross, months, branch]);

  /* ---------------- البحث والترتيب */
  const match = useMemo(() => makeMatcher(query), [query]);
  const sortRows = <T extends Row>(rows: T[]) => rows.sort((l, r) => (sortBy === 'a' ? r.a - l.a : r.p - l.p));
  const itemRows = useMemo(
    () => sortRows(Array.from(data.items.values()).filter((r) => !match || match(r.name, r.code, r.family))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, match, sortBy]
  );
  const familyRows = useMemo(
    () => sortRows(Array.from(data.families.values()).filter((r) => !match || match(r.name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, match, sortBy]
  );
  const branchRows = useMemo(
    () => sortRows(Array.from(data.branches.values()).filter((r) => !match || match(r.name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, match, sortBy]
  );

  /* ---------------- الدونات */
  const donut = useMemo(() => {
    const src = donutBy === 'family' ? Array.from(data.families.values()) : Array.from(data.branches.values());
    const sorted = src.filter((r) => r.a > 0).sort((l, r) => r.a - l.a);
    const top = sorted.slice(0, 6).map((r) => ({ name: r.name, value: r.a }));
    const rest = sorted.slice(6).reduce((s, r) => s + r.a, 0);
    if (rest > 0) top.push({ name: 'أخرى', value: rest });
    const total = top.reduce((s, r) => s + r.value, 0);
    return { slices: top, total };
  }, [data, donutBy]);

  const peakMonth = (r: Row) => {
    let best = 0;
    let bm: number | null = null;
    months.forEach((m) => { const v = sortBy === 'a' ? r.m[m] : r.mp[m]; if (v > best) { best = v; bm = m; } });
    return bm as number | null;
  };

  const contextLabel = [
    sector === 'electrical' ? 'كهربائي' : 'منزلي',
    months.length === availableMonths.length ? 'كل الشهور' : months.length === 1 ? monthName(months[0]) : `${monthName(months[0])} – ${monthName(months[months.length - 1])}`,
    branch || null,
    effectiveRep || lockedRepName || null,
  ].filter(Boolean).join(' · ');

  /* ---------------- صف قابل للفتح */
  const renderRow = (r: Row, i: number, opts: { showFamily?: boolean; sub?: string; onOpen?: () => void; expandable?: boolean }) => {
    const total = data.totalA || 1;
    const share = (r.a / total) * 100;
    const isOpen = expanded === r.key;
    const peak = peakMonth(r);
    return (
      <React.Fragment key={r.key}>
        <tr className={isOpen ? 'is-open' : ''}>
          <td className="ss-num ss-muted">{i + 1}</td>
          <td>
            <button
              type="button"
              className="si-rowbtn"
              aria-expanded={opts.expandable ? isOpen : undefined}
              onClick={() => (opts.onOpen ? opts.onOpen() : opts.expandable ? setExpanded(isOpen ? null : r.key) : undefined)}
            >
              {opts.expandable && <ChevronDown className={`si-chev ${isOpen ? 'is-open' : ''}`} aria-hidden="true" />}
              <span className="si-rowbtn__text">
                <span className="ss-strong ss-ellipsis" title={r.name}>{r.name}</span>
                {(r.code || opts.sub) && <span className="ss-code">{opts.sub || r.code}</span>}
              </span>
            </button>
          </td>
          {opts.showFamily && <td className="ss-muted si-col-family">{r.family}</td>}
          <td className={`ss-num ${sortBy === 'p' ? 'ss-strong' : ''}`}>{nf(r.p)}</td>
          <td className={`ss-num ${sortBy === 'a' ? 'ss-strong' : ''}`}>{formatCurrency(r.a)}</td>
          <td className="si-col-spark">
            <Spark values={sortBy === 'a' ? r.m : r.mp} months={months} highlight={peak} />
            {peak && months.length > 1 && <span className="si-peak">الأعلى: {monthName(peak)}</span>}
          </td>
          <td className="si-col-share">
            <div className="si-share"><div className="ss-track"><div className="ss-fill" style={{ width: `${Math.min(100, share)}%` }} /></div><span className="ss-num">{share.toFixed(1)}%</span></div>
          </td>
        </tr>
        {isOpen && opts.expandable && <tr className="si-detail"><td colSpan={opts.showFamily ? 7 : 6}>{renderDetail(r)}</td></tr>}
      </React.Fragment>
    );
  };

  /** تفصيل: صنف → شهوره، عائلة → أصنافها */
  const renderDetail = (r: Row) => {
    if (tab === 'families') {
      const children = Array.from(data.items.values())
        .filter((it) => (it.family || 'عام') === r.key)
        .sort((l, rr) => (sortBy === 'a' ? rr.a - l.a : rr.p - l.p))
        .slice(0, 30);
      return (
        <div className="si-detail__box">
          <div className="si-detail__title">أصناف عائلة «{r.name}» ({nf((r as any).items || children.length)} صنف{children.length >= 30 ? ' — أعلى 30' : ''})</div>
          <div className="si-minilist">
            {children.map((it) => (
              <div key={it.key} className="si-mini">
                <span className="si-mini__name" title={it.name}>{it.name}<span className="ss-code"> {it.code}</span></span>
                <Spark values={sortBy === 'a' ? it.m : it.mp} months={months} />
                <span className="ss-num">{nf(it.p)}</span>
                <span className="ss-num ss-strong">{compact(it.a)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="si-detail__box">
        <div className="si-detail__title">«{r.name}» على الشهور</div>
        <div className="si-months">
          {months.map((m) => (
            <div key={m} className={`si-month ${r.m[m] === 0 ? 'is-zero' : ''}`}>
              <span className="si-month__name">{monthName(m)}</span>
              <span className="ss-num ss-strong">{compact(r.m[m])}</span>
              <span className="ss-num ss-muted">{nf(r.mp[m])} قطعة</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const rows = tab === 'items' ? itemRows : tab === 'families' ? familyRows : branchRows;
  const shown = rows.slice(0, limit);

  /* ================================================================ render */
  return (
    <div className="ss-page">
      {/* -------- العنوان + الفلاتر -------- */}
      <section className="ss-card ss-pad ss-head">
        <div className="ss-head__top">
          <div>
            <h2 className="ss-title">
              مبيعات الأصناف
              {fromCache && <span className="ss-chip ss-chip--info">من الذاكرة المحلية</span>}
            </h2>
            <p className="ss-sub">{contextLabel}</p>
          </div>
          <div className="si-actions">
            {onRefresh && (
              <button type="button" className="ss-btn" onClick={onRefresh} disabled={isRefreshing}>
                {isRefreshing ? 'جاري التحديث…' : 'تحديث'}
              </button>
            )}
            {onOpenDetailed && (
              <button type="button" className="ss-btn" onClick={onOpenDetailed}>حركات البيع التفصيلية</button>
            )}
          </div>
        </div>

        <div className="ss-filters">
          {canSwitchSector && onSelectSector && (
            <div className="ss-seg" role="group" aria-label="القطاع">
              {(['home', 'electrical'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={sector === s} className={`ss-seg__btn ${sector === s ? 'is-active' : ''}`} onClick={() => onSelectSector(s)}>
                  {s === 'home' ? 'منزلي' : 'كهربائي'}
                </button>
              ))}
            </div>
          )}

          <label className="si-field">
            <span>من</span>
            <select className="ss-input ss-select si-month-select" value={from} onChange={(e) => setMonthFrom(Number(e.target.value))}>
              {availableMonths.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
          </label>
          <label className="si-field">
            <span>إلى</span>
            <select className="ss-input ss-select si-month-select" value={to} onChange={(e) => setMonthTo(Number(e.target.value))}>
              {availableMonths.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
          </label>

          {branchOptions.length > 1 && (
            <select aria-label="الفرع" className="ss-input ss-select" value={branch} onChange={(e) => { setBranch(e.target.value); setRep(''); }}>
              <option value="">كل الفروع</option>
              {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {!lockedRepName && repOptions.length > 1 && (
            <select aria-label="المندوب" className="ss-input ss-select" value={rep} onChange={(e) => setRep(e.target.value)}>
              <option value="">{branch ? `كل مناديب ${branch}` : 'كل المناديب'}</option>
              {repOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          <div className="ss-search">
            <Search className="ss-search__icon" aria-hidden="true" />
            <input type="search" className="ss-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالصنف أو الكود أو العائلة" aria-label="بحث" />
            {search && (
              <button type="button" aria-label="مسح البحث" className="ss-search__clear" onClick={() => setSearch('')}><X className="w-4 h-4" /></button>
            )}
          </div>

          {(branch || rep || search || monthFrom || monthTo) && (
            <button type="button" className="si-reset" onClick={() => { setBranch(''); setRep(''); setSearch(''); setMonthFrom(0); setMonthTo(0); }}>
              مسح الفلاتر
            </button>
          )}
        </div>

        {crossKind && (crossLoading || crossMissing) && (
          <div className={`si-note ${crossMissing ? 'is-warn' : ''}`} role="status">
            {crossLoading
              ? `جاري تحميل أصناف ${crossKind === 'r' ? 'المندوب' : 'الفرع'}…`
              : `تفصيل أصناف ${crossKind === 'r' ? 'المندوب' : 'الفرع'} لسه ماتجهزش — الأدمن يعمل استيراد/مزامنة مبيعات الأصناف مرة واحدة من صفحة الإكسل.`}
          </div>
        )}
      </section>

      {/* -------- المؤشرات -------- */}
      <div className="ss-kpis">
        <div className="ss-card ss-kpi"><div className="ss-kpi__label">إجمالي المبيعات</div><div className="ss-kpi__value">{formatCurrency(data.totalA)}</div><div className="ss-kpi__meta">{months.length} شهر</div></div>
        <div className="ss-card ss-kpi"><div className="ss-kpi__label">إجمالي الكمية</div><div className="ss-kpi__value">{nf(data.totalP)}</div><div className="ss-kpi__meta">قطعة / كرتونة</div></div>
        <div className="ss-card ss-kpi"><div className="ss-kpi__label">الأصناف المباعة</div><div className="ss-kpi__value">{nf(data.items.size)}</div><div className="ss-kpi__meta">صنف له حركة</div></div>
        <div className="ss-card ss-kpi"><div className="ss-kpi__label">العائلات</div><div className="ss-kpi__value">{nf(data.families.size)}</div><div className="ss-kpi__meta">عائلة لها مبيعات</div></div>
      </div>

      {/* -------- الدونات + الشهور -------- */}
      <div className="si-charts">
        <section className="ss-card">
          <div className="ss-cardhead">
            <h3 className="ss-h3"><PieIcon className="w-4 h-4" />توزيع المبيعات</h3>
            <div className="ss-seg ss-seg--sm" role="group" aria-label="التوزيع حسب">
              <button type="button" aria-pressed={donutBy === 'family'} className={`ss-seg__btn ${donutBy === 'family' ? 'is-active' : ''}`} onClick={() => setDonutBy('family')}>العائلات</button>
              <button type="button" aria-pressed={donutBy === 'branch'} className={`ss-seg__btn ${donutBy === 'branch' ? 'is-active' : ''}`} onClick={() => setDonutBy('branch')}>الفروع</button>
            </div>
          </div>
          {donut.slices.length === 0 ? (
            <div className="ss-empty">لا توجد بيانات</div>
          ) : (
            <div className="si-donut">
              <div className="si-donut__chart">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={donut.slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                      {donut.slices.map((s, i) => <Cell key={s.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0];
                        return <div className="ss-tip"><strong>{String(p.name)}</strong><div className="ss-num">{formatCurrency(Number(p.value))}</div><div className="ss-num">{((Number(p.value) / (donut.total || 1)) * 100).toFixed(1)}%</div></div>;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="si-donut__center" aria-hidden="true"><span>الإجمالي</span><strong className="ss-num">{compact(donut.total)}</strong></div>
              </div>
              <ul className="si-legend">
                {donut.slices.map((s, i) => (
                  <li key={s.name}>
                    <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="si-legend__name" title={s.name}>{s.name}</span>
                    <span className="ss-num ss-muted">{((s.value / (donut.total || 1)) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="ss-card">
          <div className="ss-cardhead"><h3 className="ss-h3"><BarChart3 className="w-4 h-4" />الإجمالي بالشهور</h3></div>
          <div className="ss-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.monthTotals} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} className="ss-grid" />
                <XAxis dataKey="name" reversed tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
                <YAxis orientation="right" tickFormatter={axisShort} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={44} />
                <Tooltip
                  cursor={{ className: 'ss-cursor' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as { name: string; a: number; p: number };
                    return <div className="ss-tip"><strong>{d.name}</strong><div>المبيعات: <b className="ss-num">{formatCurrency(d.a)}</b></div><div>الكمية: <b className="ss-num">{nf(d.p)}</b></div></div>;
                  }}
                />
                <Bar dataKey="a" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                  {data.monthTotals.map((d) => <Cell key={d.month} className="ss-bar" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* -------- الجدول الرئيسي بتبويبات -------- */}
      <section className="ss-card">
        <div className="ss-cardhead">
          <div className="si-tabs" role="tablist" aria-label="نوع التحليل">
            {([
              { k: 'items' as const, label: 'الأصناف', icon: <Package className="w-4 h-4" />, n: itemRows.length },
              { k: 'families' as const, label: 'العائلات', icon: <Layers className="w-4 h-4" />, n: familyRows.length },
              { k: 'branches' as const, label: 'الفروع', icon: <Building2 className="w-4 h-4" />, n: branchRows.length },
            ]).map((t) => (
              <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`si-tab ${tab === t.k ? 'is-active' : ''}`} onClick={() => setTab(t.k)}>
                {t.icon}{t.label}<span className="si-tab__n">{nf(t.n)}</span>
              </button>
            ))}
          </div>
          <div className="ss-seg ss-seg--sm" role="group" aria-label="الترتيب">
            <button type="button" aria-pressed={sortBy === 'a'} className={`ss-seg__btn ${sortBy === 'a' ? 'is-active' : ''}`} onClick={() => setSortBy('a')}>بالقيمة</button>
            <button type="button" aria-pressed={sortBy === 'p'} className={`ss-seg__btn ${sortBy === 'p' ? 'is-active' : ''}`} onClick={() => setSortBy('p')}>بالكمية</button>
          </div>
        </div>

        {tab === 'branches' && effectiveRep && (
          <div className="si-note">الفروع بتعرض إجمالي الفرع كله — المندوب المختار بيأثر على الأصناف والعائلات.</div>
        )}

        <div className="ss-tablewrap">
          <table className="ss-table si-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tab === 'items' ? 'الصنف' : tab === 'families' ? 'العائلة' : 'الفرع'}</th>
                {tab === 'items' && <th className="si-col-family">العائلة</th>}
                <th>الكمية</th>
                <th>المبلغ</th>
                <th className="si-col-spark">الحركة بالشهور</th>
                <th className="si-col-share">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) =>
                tab === 'items'
                  ? renderRow(r, i, { showFamily: true, expandable: true })
                  : tab === 'families'
                    ? renderRow(r, i, { expandable: true, sub: `${nf((r as any).items || 0)} صنف` })
                    : renderRow(r, i, {
                        sub: 'اضغط لعرض أصناف الفرع',
                        onOpen: () => { setBranch(r.name); setRep(''); setTab('items'); },
                      })
              )}
              {rows.length === 0 && (
                <tr><td colSpan={7}><div className="ss-empty">{crossLoading ? 'جاري التحميل…' : 'مفيش نتائج مطابقة'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > limit && (
          <div className="si-more">
            <button type="button" className="ss-btn" onClick={() => setLimit((l) => l + 50)}>
              عرض المزيد ({nf(rows.length - limit)} متبقي)
            </button>
          </div>
        )}
      </section>

      {lockedRepName && (
        <p className="ss-hint"><UserRound className="w-3.5 h-3.5 inline" /> الأرقام دي خاصة بمبيعاتك أنت بس.</p>
      )}
    </div>
  );
};

export default ItemSalesInsights;
