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
import React, { useDeferredValue, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import '../../styles/sales-summary.css';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { growthToneClass, formatGrowth } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';
import { ItemSalesAggDoc, ItemSalesSector } from '../../services/itemSalesAggregateService';

/** أرقام إنجليزي موحّدة في الصفحة كلها */
const nf = (n: number) => Math.round(n || 0).toLocaleString('en-US');
const compact = (v: number) => {
  const a = Math.abs(v || 0);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} مليون`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(1)} ألف`;
  return nf(v);
};
const axisShort = (v: number) => (Math.abs(v) >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : Math.abs(v) >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v));

/**
 * تطبيع البحث العربي: «أحمد» = «احمد»، «طاولة» = «طاوله»، «مكوى» = «مكوي»،
 * والأرقام العربية = الإنجليزي، ومن غير تشكيل أو تطويل.
 */
const normalizeAr = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();

/** كل كلمة في البحث لازم تكون موجودة — بأي ترتيب — في الاسم أو الكود أو العائلة */
const makeMatcher = (query: string) => {
  const words = normalizeAr(query).split(' ').filter(Boolean);
  if (!words.length) return null;
  return (...fields: Array<string | undefined>) => {
    const hay = normalizeAr(fields.filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  };
};

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
  /** البحث بيتحسب بعد الكتابة مش مع كل حرف — مفيش تهنيج على الموبايل */
  const deferredQuery = useDeferredValue(searchQuery);
  const [monthView, setMonthView] = useState<'chart' | 'table'>('chart');
  const [itemsTab, setItemsTab] = useState<'value' | 'qty'>('value');

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

    const match = makeMatcher(deferredQuery);
    const filterBySearch = <T extends { name: string; code?: string; family?: string }>(list: T[]) =>
      !match ? list : list.filter((x) => match(x.name, x.code, x.family));
    const allItems = filterBySearch(Array.from(itemMap.values()));
    const topItemsByValue = [...allItems].sort((a, b) => b.amount - a.amount).slice(0, 15);
    const topItemsByQty = [...allItems].sort((a, b) => b.pieces - a.pieces).slice(0, 15);
    const slowItems = [...allItems].filter((i) => i.amount > 0).sort((a, b) => a.amount - b.amount).slice(0, 8);
    const families = Array.from(familyMap.values())
      .filter((f) => !match || match(f.name))
      .sort((a, b) => b.amount - a.amount);
    const branches = Array.from(branchMap.values())
      .filter((b) => !match || match(b.name))
      .sort((a, b) => b.amount - a.amount);
    const reps = Array.from(repMap.values())
      .filter((r) => !match || match(r.name))
      .sort((a, b) => b.amount - a.amount);
    const topCustomers = Array.from(customerMap.values())
      .filter((c) => !match || match(c.name, c.code))
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
  }, [filteredDocs, sectorDocs, selectedMonth, deferredQuery]);

  const chartData = sectorDocs.map((d) => ({
    month: d.month,
    name: MONTH_NAMES_MAP[d.month] || String(d.month),
    amount: d.totals.a || 0,
    pieces: d.totals.p || 0,
    customers: d.totals.cu || 0,
  }));
  const toggleMonth = (m?: number) => {
    if (typeof m !== 'number') return;
    setSelectedMonth((prev) => (prev === m ? 'all' : m));
  };
  const topItems = itemsTab === 'value' ? summary.topItemsByValue : summary.topItemsByQty;
  const topItemsMax = Math.max(1, ...topItems.map((it) => (itemsTab === 'value' ? it.amount : it.pieces)));

  // دالة مش كومبوننت: عشان القوائم ما تتبنيش من الأول مع كل رسم للصفحة
  const rankList = (
    title: string,
    icon: React.ReactNode,
    rows: Array<{ name: string; amount: number; pieces: number; itemsCount?: number }>,
    empty: string,
  ) => (
    <section className="ss-card ss-pad">
      <h3 className="ss-h3">{icon}{title} <span className="ss-muted">({nf(rows.length)})</span></h3>
      <div className="ss-ranklist">
        {rows.slice(0, 15).map((r, i) => {
          const pct = summary.totalAmount > 0 ? (r.amount / summary.totalAmount) * 100 : 0;
          return (
            <div key={r.name} className="ss-rank">
              <span className="ss-rank__i">{i + 1}</span>
              <div className="ss-rank__body">
                <div className="ss-rank__row">
                  <span className="ss-rank__name" title={r.name}>{r.name}</span>
                  <span className="ss-num">{compact(r.amount)}</span>
                </div>
                <div className="ss-track"><div className="ss-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                <div className="ss-rank__meta">
                  <span>{pct.toFixed(1)}%{r.itemsCount !== undefined ? ` · ${nf(r.itemsCount)} صنف` : ''}</span>
                  <span>{nf(r.pieces)} قطعة</span>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="ss-empty">{empty}</div>}
      </div>
    </section>
  );

  return (
    <div className="ss-page">
      {/* ---------- العنوان + الفلاتر ---------- */}
      <section className="ss-card ss-pad ss-head">
        <div className="ss-head__top">
          <div>
            <h2 className="ss-title">
              تحليل مبيعات الأصناف
              {fromCache && <span className="ss-chip ss-chip--info">من الذاكرة المحلية</span>}
            </h2>
            <p className="ss-sub">ملخص {nf(summary.totalRows)} حركة بيع — بيفتح فوراً حتى على النت الضعيف</p>
          </div>
        </div>

        <div className="ss-filters">
          {canSwitchSector && onSelectSector && (
            <div className="ss-seg" role="group" aria-label="القطاع">
              {([
                { key: 'home' as const, label: 'منزلي' },
                { key: 'electrical' as const, label: 'كهربائي' },
              ]).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sector === s.key}
                  onClick={() => onSelectSector(s.key)}
                  className={`ss-seg__btn ${sector === s.key ? 'is-active' : ''}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <select
            aria-label="الشهر"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="ss-input ss-select"
          >
            <option value="all">كل الشهور ({availableMonths.length})</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES_MAP[m] || `شهر ${m}`}</option>
            ))}
          </select>

          <div className="ss-search">
            <Search className="ss-search__icon" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الكود أو العائلة أو الفرع أو المندوب"
              aria-label="بحث"
              className="ss-input"
            />
            {searchQuery && (
              <button type="button" aria-label="مسح البحث" onClick={() => setSearchQuery('')} className="ss-search__clear">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ---------- المؤشرات ---------- */}
      <div className="ss-kpis">
        <div className="ss-card ss-kpi">
          <div className="ss-kpi__label">إجمالي المبيعات</div>
          <div className="ss-kpi__value">{formatCurrency(summary.totalAmount)}</div>
          {summary.growthPctValue !== null ? (
            <span className={`ss-growth ${growthToneClass(summary.growthPctValue)}`}>
              {summary.growthPctValue >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {formatGrowth(summary.growthPctValue)} عن الشهر السابق
            </span>
          ) : (
            <div className="ss-kpi__meta">{selectedMonth === 'all' ? 'كل الشهور' : MONTH_NAMES_MAP[selectedMonth]}</div>
          )}
        </div>
        <div className="ss-card ss-kpi">
          <div className="ss-kpi__label">إجمالي الكمية</div>
          <div className="ss-kpi__value">{nf(summary.totalPieces)}</div>
          <div className="ss-kpi__meta">قطعة / كرتونة</div>
        </div>
        <div className="ss-card ss-kpi">
          <div className="ss-kpi__label">الأصناف المباعة</div>
          <div className="ss-kpi__value">{nf(summary.itemsCount)}</div>
          <div className="ss-kpi__meta">ضمن {nf(summary.families.length)} عائلة</div>
        </div>
        <div className="ss-card ss-kpi">
          <div className="ss-kpi__label">العملاء النشطين</div>
          <div className="ss-kpi__value">{nf(summary.maxMonthCustomers)}</div>
          <div className="ss-kpi__meta">أعلى عدد عملاء في شهر</div>
        </div>
      </div>

      {/* ---------- الشهور: شارت أو جدول ---------- */}
      <section className="ss-card">
        <div className="ss-cardhead">
          <h3 className="ss-h3"><BarChart3 className="w-4 h-4" />المبيعات الشهرية</h3>
          <div className="ss-seg ss-seg--sm" role="group" aria-label="طريقة العرض">
            <button type="button" aria-pressed={monthView === 'chart'} className={`ss-seg__btn ${monthView === 'chart' ? 'is-active' : ''}`} onClick={() => setMonthView('chart')}>رسم بياني</button>
            <button type="button" aria-pressed={monthView === 'table'} className={`ss-seg__btn ${monthView === 'table' ? 'is-active' : ''}`} onClick={() => setMonthView('table')}>جدول</button>
          </div>
        </div>

        {monthView === 'chart' ? (
          <div className="ss-chart">
            {chartData.length === 0 ? (
              <div className="ss-empty">لا توجد بيانات شهور</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} className="ss-grid" />
                    <XAxis dataKey="name" reversed tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval={0} />
                    <YAxis orientation="right" tickFormatter={axisShort} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={44} />
                    <Tooltip
                      cursor={{ className: 'ss-cursor' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as (typeof chartData)[number];
                        return (
                          <div className="ss-tip">
                            <strong>{d.name}</strong>
                            <div>المبيعات: <b className="ss-num">{formatCurrency(d.amount)}</b></div>
                            <div>الكمية: <b className="ss-num">{nf(d.pieces)}</b></div>
                            <div>العملاء: <b className="ss-num">{nf(d.customers)}</b></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={48} onClick={(d: any) => toggleMonth(d?.payload?.month ?? d?.month)}>
                      {chartData.map((d) => (
                        <Cell
                          key={d.month}
                          className={`ss-bar ${selectedMonth === 'all' ? '' : selectedMonth === d.month ? 'is-active' : 'is-dim'}`}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="ss-hint">اضغط على أي شهر عشان تفلتر الصفحة كلها عليه، واضغط تاني للرجوع لكل الشهور.</p>
              </>
            )}
          </div>
        ) : (
          <div className="ss-tablewrap">
            <table className="ss-table">
              <thead>
                <tr><th>الشهر</th><th>العملاء</th><th>الأصناف</th><th>القطع</th><th>المبيعات</th></tr>
              </thead>
              <tbody>
                {sectorDocs.map((doc) => (
                  <tr
                    key={`${doc.sector}-${doc.month}`}
                    onClick={() => toggleMonth(doc.month)}
                    className={selectedMonth === doc.month ? 'is-active' : ''}
                  >
                    <td className="ss-strong">{MONTH_NAMES_MAP[doc.month] || doc.month}</td>
                    <td className="ss-num">{nf(doc.totals.cu || 0)}</td>
                    <td className="ss-num">{nf(doc.items?.length || 0)}</td>
                    <td className="ss-num">{nf(doc.totals.p || 0)}</td>
                    <td className="ss-num ss-strong">{formatCurrency(doc.totals.a || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- الفروع / العائلات / المناديب ---------- */}
      <div className="ss-grid3">
        {rankList('الفروع', <Building2 className="w-4 h-4" />, summary.branches, 'لا توجد بيانات فروع')}
        {rankList('العائلات', <Layers className="w-4 h-4" />, summary.families, 'لا توجد بيانات عائلات')}
        {rankList('المناديب', <UserRound className="w-4 h-4" />, summary.reps, 'لا توجد بيانات مناديب')}
      </div>

      {/* ---------- أعلى 15 صنف (جدول واحد بتبويبين) ---------- */}
      <section className="ss-card">
        <div className="ss-cardhead">
          <h3 className="ss-h3"><Package className="w-4 h-4" />أعلى 15 صنف</h3>
          <div className="ss-seg ss-seg--sm" role="group" aria-label="الترتيب">
            <button type="button" aria-pressed={itemsTab === 'value'} className={`ss-seg__btn ${itemsTab === 'value' ? 'is-active' : ''}`} onClick={() => setItemsTab('value')}>بالقيمة</button>
            <button type="button" aria-pressed={itemsTab === 'qty'} className={`ss-seg__btn ${itemsTab === 'qty' ? 'is-active' : ''}`} onClick={() => setItemsTab('qty')}>بالكمية</button>
          </div>
        </div>
        <div className="ss-tablewrap">
          <table className="ss-table ss-table--items">
            <thead>
              <tr><th>#</th><th>الصنف</th><th>العائلة</th><th>الكمية</th><th>المبلغ</th><th className="ss-col-share">النسبة</th></tr>
            </thead>
            <tbody>
              {topItems.map((it, i) => {
                const v = itemsTab === 'value' ? it.amount : it.pieces;
                return (
                  <tr key={it.code + it.name}>
                    <td className="ss-num ss-muted">{i + 1}</td>
                    <td>
                      <div className="ss-strong ss-ellipsis" title={it.name}>{it.name}</div>
                      <div className="ss-code">{it.code}</div>
                    </td>
                    <td className="ss-muted">{it.family}</td>
                    <td className={`ss-num ${itemsTab === 'qty' ? 'ss-strong' : ''}`}>{nf(it.pieces)}</td>
                    <td className={`ss-num ${itemsTab === 'value' ? 'ss-strong' : ''}`}>{formatCurrency(it.amount)}</td>
                    <td className="ss-col-share"><div className="ss-track"><div className="ss-fill" style={{ width: `${(v / topItemsMax) * 100}%` }} /></div></td>
                  </tr>
                );
              })}
              {topItems.length === 0 && (
                <tr><td colSpan={6}><div className="ss-empty">مفيش أصناف مطابقة للبحث</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- أعلى العملاء ---------- */}
      {summary.topCustomers.length > 0 && (
        <section className="ss-card">
          <div className="ss-cardhead">
            <h3 className="ss-h3"><Users className="w-4 h-4" />أعلى العملاء</h3>
          </div>
          <div className="ss-tablewrap">
            <table className="ss-table">
              <thead>
                <tr><th>#</th><th>العميل</th><th>الأصناف</th><th>الكمية</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {summary.topCustomers.map((c, i) => (
                  <tr key={c.code}>
                    <td className="ss-num ss-muted">{i + 1}</td>
                    <td><div className="ss-strong">{c.name}</div><div className="ss-code">{c.code}</div></td>
                    <td className="ss-num">{nf(c.items)}</td>
                    <td className="ss-num">{nf(c.pieces)}</td>
                    <td className="ss-num ss-strong">{formatCurrency(c.amount)}</td>
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
