import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ChevronDown,
  Layers,
  LayoutGrid,
  Package,
  Search,
  Store,
  Users,
  UserSquare2
} from 'lucide-react';
import type { Customer, CustomerItemSaleRecord } from '../../types';
import { formatCurrency } from '../../services/invoiceService';
import { formatCompactAmount } from '../../services/customerItemSalesInsights';
import { resolveItemGroup } from '../../services/itemSalesAnalytics';
import { useChartTheme } from '../../services/chartTheme';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

type Metric = 'value' | 'qty';
type TabKey = 'customer' | 'branch' | 'rep' | 'custRep' | 'item' | 'family';
type SectorKey = 'home' | 'electrical';

interface TotalsAnalysisViewProps {
  /** سجلات مفلترة بالفعل (RBAC + فلاتر الصفحة + الشهر) — العرض إجماليات فقط. */
  records: CustomerItemSaleRecord[];
  customers: Customer[];
  sector: SectorKey;
  onSelectSector?: (sector: SectorKey) => void;
  resolveSector?: (record: CustomerItemSaleRecord) => 'home' | 'electrical';
  subtitle?: string;
}

interface EnrichedRow {
  amount: number;
  qty: number;
  sector: 'home' | 'electrical';
  branch: string;
  rep: string;
  fam: string;
  itemCode: string;
  itemName: string;
  custCode: string;
  custName: string;
  custRep: string;
  custBranch: string;
}

interface TotalsBucket {
  key: string;
  label: string;
  sub?: string;
  amount: number;
  qty: number;
  custs: Set<string>;
  items: Set<string>;
  fams: Map<string, number>;
}

interface Totals {
  amount: number;
  qty: number;
  moves: number;
  custCount: number;
  itemCount: number;
  sectorRows: TotalsBucket[];
  customerRows: TotalsBucket[];
  branchRows: TotalsBucket[];
  repRows: TotalsBucket[];
  custRepRows: TotalsBucket[];
  itemRows: TotalsBucket[];
  familyRows: TotalsBucket[];
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const trunc = (value: string, length: number): string =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

const pctOf = (part: number, whole: number): number => (whole ? (part / whole) * 100 : 0);

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'customer', label: 'بالعميل', icon: Users },
  { key: 'branch', label: 'بالفرع', icon: Store },
  { key: 'rep', label: 'بالمندوب', icon: UserSquare2 },
  { key: 'custRep', label: 'العميل × المندوب', icon: Users },
  { key: 'item', label: 'بالصنف', icon: Package },
  { key: 'family', label: 'بالعائلة', icon: Layers }
];

const SECTOR_LABEL: Record<'home' | 'electrical', string> = {
  home: 'منزلي',
  electrical: 'كهربائي'
};

const makeBucket = (key: string, label: string, sub?: string): TotalsBucket => ({
  key,
  label,
  sub,
  amount: 0,
  qty: 0,
  custs: new Set<string>(),
  items: new Set<string>(),
  fams: new Map<string, number>()
});

const accumulate = (bucket: TotalsBucket, row: EnrichedRow): void => {
  bucket.amount += row.amount;
  bucket.qty += row.qty;
  bucket.custs.add(row.custCode);
  bucket.items.add(row.itemCode);
  bucket.fams.set(row.fam, (bucket.fams.get(row.fam) || 0) + row.amount);
};

const sortByAmount = (map: Map<string, TotalsBucket>): TotalsBucket[] =>
  Array.from(map.values()).sort((a, b) => b.amount - a.amount);

const pickRows = (totals: Totals, key: TabKey): TotalsBucket[] => {
  switch (key) {
    case 'customer':
      return totals.customerRows;
    case 'branch':
      return totals.branchRows;
    case 'rep':
      return totals.repRows;
    case 'custRep':
      return totals.custRepRows;
    case 'item':
      return totals.itemRows;
    case 'family':
      return totals.familyRows;
  }
};

/** عدد أعمدة جدول التبويب الحالي (البُعد + الأعمدة الوصفية + القطع + المبلغ + النسبة). */
const columnCountOf = (key: TabKey): number => (key === 'customer' ? 7 : 5);

export const TotalsAnalysisView: React.FC<TotalsAnalysisViewProps> = ({
  records,
  customers,
  resolveSector,
  subtitle
}) => {
  const chart = useChartTheme();
  const [tab, setTab] = useState<TabKey>('customer');
  const [metric, setMetric] = useState<Metric>('value');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const customerByReference = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => {
      if (customer.code) map.set(String(customer.code).trim().toLowerCase(), customer);
      if (customer.id) map.set(String(customer.id).trim().toLowerCase(), customer);
      if (customer.name) map.set(String(customer.name).trim().toLowerCase(), customer);
    });
    return map;
  }, [customers]);

  const enriched = useMemo<EnrichedRow[]>(() => {
    return records.map((record) => {
      const fam = resolveItemGroup(record) || record.familyDimension || record.itemGroup || 'عام';
      const branch = (record.linkedBranch || record.warehouse || 'غير محدد').trim() || 'غير محدد';
      const rep = (record.repName || 'غير محدد').trim() || 'غير محدد';
      const code = (record.customerAccount || '').trim();
      const linked =
        customerByReference.get(code.toLowerCase()) ||
        (record.invoicingName
          ? customerByReference.get(record.invoicingName.trim().toLowerCase())
          : undefined);
      const ownSector = (record as any).sector;
      const resolvedSector =
        ownSector === 'home' || ownSector === 'electrical'
          ? ownSector
          : resolveSector?.(record) || (linked?.sector === 'electrical' ? 'electrical' : 'home');
      return {
        amount: num(record.amount),
        qty: num(record.quantity),
        sector: resolvedSector,
        branch,
        rep,
        fam,
        itemCode: (record.itemCode || record.unifiedCode || record.itemName || '').trim() || '—',
        itemName: (record.itemName || record.definitions || record.itemCode || 'صنف غير محدد').trim(),
        custCode: code || linked?.code || record.invoicingName || '—',
        custName: (linked?.name || record.invoicingName || code || 'عميل غير محدد').trim(),
        custRep: ((linked as any)?.repName || (linked as any)?.salesRepName || rep).trim() || rep,
        custBranch: ((linked as any)?.branchName || (linked as any)?.branch || branch).trim() || branch
      };
    });
  }, [records, customerByReference, resolveSector]);

  const totals = useMemo<Totals>(() => {
    const bySector = new Map<string, TotalsBucket>();
    const byCustomer = new Map<string, TotalsBucket>();
    const byBranch = new Map<string, TotalsBucket>();
    const byRep = new Map<string, TotalsBucket>();
    const byCustRep = new Map<string, TotalsBucket>();
    const byItem = new Map<string, TotalsBucket>();
    const byFamily = new Map<string, TotalsBucket>();

    let amount = 0;
    let qty = 0;
    let moves = 0;
    const custSet = new Set<string>();
    const itemSet = new Set<string>();

    const push = (
      map: Map<string, TotalsBucket>,
      key: string,
      label: string,
      sub: string | undefined,
      row: EnrichedRow
    ) => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = makeBucket(key, label, sub);
        map.set(key, bucket);
      }
      accumulate(bucket, row);
    };

    enriched.forEach((row) => {
      amount += row.amount;
      qty += row.qty;
      moves += 1;
      custSet.add(row.custCode);
      itemSet.add(row.itemCode);

      push(bySector, row.sector, SECTOR_LABEL[row.sector], undefined, row);
      push(
        byCustomer,
        row.custCode,
        row.custName,
        `${row.custRep} · ${row.custBranch} · كود: ${row.custCode}`,
        row
      );
      push(byBranch, row.branch, row.branch, undefined, row);
      push(byRep, row.rep, row.rep, undefined, row);
      push(byCustRep, `${row.custCode}||${row.rep}`, row.custName, `${row.rep} · كود: ${row.custCode}`, row);
      push(byItem, row.itemCode, row.itemName, row.fam, row);
      push(byFamily, row.fam, row.fam, undefined, row);
    });

    return {
      amount,
      qty,
      moves,
      custCount: custSet.size,
      itemCount: itemSet.size,
      sectorRows: sortByAmount(bySector),
      customerRows: sortByAmount(byCustomer),
      branchRows: sortByAmount(byBranch),
      repRows: sortByAmount(byRep),
      custRepRows: sortByAmount(byCustRep),
      itemRows: sortByAmount(byItem),
      familyRows: sortByAmount(byFamily)
    };
  }, [enriched]);

  const rowsByTab: Record<TabKey, TotalsBucket[]> = {
    customer: totals.customerRows,
    branch: totals.branchRows,
    rep: totals.repRows,
    custRep: totals.custRepRows,
    item: totals.itemRows,
    family: totals.familyRows
  };

  const visibleRows = useMemo(() => {
    const source = pickRows(totals, tab);
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? source.filter(
          (row) =>
            row.label.toLowerCase().includes(needle) ||
            row.key.toLowerCase().includes(needle) ||
            (row.sub || '').toLowerCase().includes(needle)
        )
      : source;
    const sorted = [...filtered].sort((a, b) =>
      metric === 'value' ? b.amount - a.amount : b.qty - a.qty
    );
    return showAll ? sorted : sorted.slice(0, 25);
  }, [totals, tab, query, metric, showAll]);

  const totalRowCount = pickRows(totals, tab).length;

  const chartData = useMemo(() => {
    const sorted = [...pickRows(totals, tab)].sort((a, b) =>
      metric === 'value' ? b.amount - a.amount : b.qty - a.qty
    );
    return sorted.slice(0, 10).map((row) => ({
      key: row.key,
      short: trunc(row.label, 18),
      full: row.label,
      sub: row.sub,
      v: metric === 'value' ? row.amount : row.qty
    }));
  }, [totals, tab, metric]);

  const activeTab = TABS.find((entry) => entry.key === tab) || TABS[0];
  const canExpand = tab === 'customer' || tab === 'custRep';

  const renderShare = (value: number, whole: number) => {
    const share = pctOf(value, whole);
    return (
      <div className="min-w-[92px]">
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-mono font-black text-[11px] text-[var(--app-text)]">
            {share.toFixed(1)}%
          </span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-[var(--app-card-hover)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, share)}%`, background: chart.bar }}
          />
        </div>
      </div>
    );
  };

  const renderFamilyBreakdown = (bucket: TotalsBucket) => {
    const families = Array.from(bucket.fams.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (families.length === 0) {
      return (
        <div className="px-4 py-3 text-[11px] font-bold text-[var(--app-text-muted)]">
          لا توجد عائلات مسجّلة لهذا العميل في الفترة الحالية
        </div>
      );
    }

    return (
      <div className="px-4 py-3 space-y-2 bg-[var(--app-card-secondary)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-black text-[var(--app-text)]">
            ما اشتراه من الأصناف بالعائلة
          </span>
          <span className="text-[10px] font-bold text-[var(--app-text-muted)]">
            إجمالي العميل {formatCurrency(bucket.amount)} ·{' '}
            {pctOf(bucket.amount, totals.amount).toFixed(1)}% من إجمالي المبيعات
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {families.map((family) => {
            const ofCustomer = pctOf(family.value, bucket.amount);
            const ofTotal = pctOf(family.value, totals.amount);
            return (
              <div
                key={family.name}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-[var(--app-text)] truncate">
                    {family.name}
                  </span>
                  <span className="font-mono font-black text-[11px] text-[var(--app-text)] shrink-0">
                    {formatCurrency(family.value)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[var(--app-card-hover)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, ofCustomer)}%`, background: chart.barAlt }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[9.5px] font-bold text-[var(--app-text-muted)]">
                  <span className="font-mono">{ofCustomer.toFixed(1)}% من العميل</span>
                  <span className="font-mono">{ofTotal.toFixed(1)}% من الإجمالي</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (records.length === 0) {
    return (
      <CardShell
        title="تحليل إجماليات مبيعات الأصناف"
        subtitle="إجمالي فقط حسب القطاع والعميل والفرع والمندوب والعائلة"
        icon={<LayoutGrid className="w-4 h-4" />}
      >
        <ChartEmpty height={220} message="لا توجد بيانات مطابقة للفلاتر الحالية" />
      </CardShell>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">

      {/* إجماليات عامة */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-3.5">
          <div className="text-[10px] font-bold text-[var(--app-text-muted)]">إجمالي المبلغ</div>
          <div className="mt-1 font-black font-mono text-lg text-[var(--app-text)] leading-tight">
            {formatCurrency(totals.amount)}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-3.5">
          <div className="text-[10px] font-bold text-[var(--app-text-muted)]">عدد القطع</div>
          <div className="mt-1 font-black font-mono text-lg text-[var(--app-text)] leading-tight">
            {totals.qty.toLocaleString('en-US')}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-3.5">
          <div className="text-[10px] font-bold text-[var(--app-text-muted)]">عدد العملاء</div>
          <div className="mt-1 font-black font-mono text-lg text-[var(--app-text)] leading-tight">
            {totals.custCount.toLocaleString('en-US')}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-3.5">
          <div className="text-[10px] font-bold text-[var(--app-text-muted)]">عدد الأصناف</div>
          <div className="mt-1 font-black font-mono text-lg text-[var(--app-text)] leading-tight">
            {totals.itemCount.toLocaleString('en-US')}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-3.5 col-span-2 md:col-span-3 xl:col-span-1">
          <div className="text-[10px] font-bold text-[var(--app-text-muted)]">
            متوسط قيمة العميل
          </div>
          <div className="mt-1 font-black font-mono text-lg text-[var(--app-text)] leading-tight">
            {formatCurrency(totals.custCount ? totals.amount / totals.custCount : 0)}
          </div>
        </div>
      </section>

      {/* التبويبات */}
      <section className="bg-[var(--app-card)] rounded-2xl border border-[var(--app-border)] p-1.5 flex items-center gap-1 flex-wrap">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => {
                setTab(entry.key);
                setExpanded(null);
                setShowAll(false);
              }}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-black transition cursor-pointer ${
                active
                  ? 'bg-[var(--app-navy)] text-white shadow-sm'
                  : 'text-[var(--app-text-muted)] hover:bg-[var(--app-card-hover)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {entry.label}
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                  active ? 'bg-white/15 text-white' : 'bg-[var(--app-card-hover)]'
                }`}
              >
                {rowsByTab[entry.key].length}
              </span>
            </button>
          );
        })}

        <div className="ms-auto flex items-center gap-1.5">
          <div className="inline-flex bg-[var(--app-card-hover)] rounded-lg p-0.5">
            {([
              { key: 'value' as const, label: 'قيمة' },
              { key: 'qty' as const, label: 'كمية' }
            ]).map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setMetric(entry.key)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-black cursor-pointer transition ${
                  metric === entry.key
                    ? 'bg-[var(--app-card)] text-[var(--app-text)] shadow-sm'
                    : 'text-[var(--app-text-muted)]'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* الرسم البياني */}
        <div className="xl:col-span-4">
          <CardShell
            title={`أعلى 10 — ${activeTab.label}`}
            subtitle={metric === 'value' ? 'حسب قيمة المبيعات' : 'حسب عدد القطع'}
            icon={<activeTab.icon className="w-4 h-4" />}
            iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]"
          >
            {chartData.length === 0 ? (
              <ChartEmpty height={280} />
            ) : (
              <div dir="ltr" style={{ height: Math.max(240, chartData.length * 30 + 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 6, right: 58, left: 6, bottom: 6 }}
                    barCategoryGap="26%"
                  >
                    <CartesianGrid
                      stroke={chart.grid}
                      strokeDasharray="4 4"
                      horizontal={false}
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="short"
                      width={116}
                      tick={{
                        fill: chart.tick,
                        fontSize: 10,
                        fontFamily: 'Cairo, sans-serif',
                        fontWeight: 700
                      }}
                      axisLine={{ stroke: chart.axis }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: chart.cursor }}
                      content={({ active, payload }: any) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const row = payload[0].payload as (typeof chartData)[number];
                        return (
                          <div
                            dir="rtl"
                            className="rounded-xl px-3 py-2.5 shadow-xl border text-right"
                            style={{
                              background: chart.tooltipBg,
                              borderColor: chart.tooltipBorder,
                              color: chart.tooltipText
                            }}
                          >
                            <div className="text-[11px] font-black">{row.full}</div>
                            {row.sub && (
                              <div
                                className="text-[9.5px] mt-0.5"
                                style={{ color: chart.tooltipMuted }}
                              >
                                {row.sub}
                              </div>
                            )}
                            <div
                              className="text-[11px] font-bold font-mono mt-1"
                              style={{ color: chart.tooltipAccent }}
                            >
                              {metric === 'value'
                                ? formatCurrency(row.v)
                                : `${row.v.toLocaleString('en-US')} قطعة`}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="v" radius={[0, 5, 5, 0]} barSize={15}>
                      {chartData.map((row, index) => (
                        <Cell key={row.key} fill={index === 0 ? chart.barAlt : chart.bar} />
                      ))}
                      <LabelList
                        dataKey="v"
                        position="right"
                        formatter={(value: number) =>
                          metric === 'value'
                            ? formatCompactAmount(value)
                            : value.toLocaleString('en-US')
                        }
                        style={{
                          fill: chart.label,
                          fontSize: 9.5,
                          fontWeight: 800,
                          fontFamily: 'Cairo, sans-serif'
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardShell>
        </div>

        {/* جدول الإجماليات */}
        <div className="xl:col-span-8">
          <CardShell
            title={`${activeTab.label} — إجماليات`}
            subtitle={`${subtitle || 'إجمالي فقط'} • ${totalRowCount} سطر`}
            icon={<activeTab.icon className="w-4 h-4" />}
            iconClass="bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]"
            action={
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث..."
                  className="h-8 w-36 pl-3 pr-8 rounded-lg bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[10.5px] font-bold text-[var(--app-text)]"
                />
              </div>
            }
          >
            {visibleRows.length === 0 ? (
              <ChartEmpty height={260} />
            ) : (
              <div className="overflow-auto max-h-[520px] rounded-xl border border-[var(--app-border)]">
                <table className="w-full min-w-[720px] text-right text-[12px]">
                  <thead className="sticky top-0 z-10 bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] font-black text-[10.5px]">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap sticky right-0 bg-[var(--app-card-secondary)] z-20">
                        {activeTab.label}
                      </th>
                      {tab === 'customer' && (
                        <>
                          <th className="px-3 py-2.5 whitespace-nowrap">المندوب</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">الفرع</th>
                        </>
                      )}
                      {tab === 'custRep' && (
                        <th className="px-3 py-2.5 whitespace-nowrap">المندوب</th>
                      )}
                      {(tab === 'item' || tab === 'family') && (
                        <th className="px-3 py-2.5 whitespace-nowrap">
                          {tab === 'item' ? 'العائلة' : 'عدد الأصناف'}
                        </th>
                      )}
                      {(tab === 'branch' || tab === 'rep') && (
                        <th className="px-3 py-2.5 whitespace-nowrap">عدد العملاء</th>
                      )}
                      {tab === 'customer' && (
                        <th className="px-3 py-2.5 whitespace-nowrap">عدد الأصناف</th>
                      )}
                      <th className="px-3 py-2.5 whitespace-nowrap">عدد القطع</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">إجمالي المبلغ</th>
                      <th className="px-3 py-2.5 whitespace-nowrap min-w-[110px]">النسبة</th>
                    </tr>
                  </thead>
                  <tbody className="text-[var(--app-text)]">
                    {visibleRows.map((row, index) => {
                      const isExpanded = expanded === row.key;
                      return (
                        <React.Fragment key={row.key}>
                          <tr
                            className={`border-b border-[var(--app-border)] ${
                              canExpand ? 'cursor-pointer' : ''
                            } hover:bg-[var(--app-card-hover)] transition`}
                            onClick={() => {
                              if (!canExpand) return;
                              setExpanded(isExpanded ? null : row.key);
                            }}
                          >
                            <td className="px-3 py-2.5 sticky right-0 bg-[var(--app-card)] z-10">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-md bg-[var(--app-card-hover)] text-[var(--app-text-muted)] text-[9.5px] font-black inline-flex items-center justify-center shrink-0">
                                  {index + 1}
                                </span>
                                <span className="min-w-0">
                                  <span
                                    className="block text-[11.5px] font-black truncate max-w-[220px]"
                                    title={row.label}
                                  >
                                    {row.label}
                                  </span>
                                  {tab === 'item' ? (
                                    <span className="block text-[9.5px] font-bold text-[var(--app-text-muted)] font-mono truncate max-w-[220px]">
                                      كود: {row.key} · {row.sub || '—'}
                                    </span>
                                  ) : row.sub ? (
                                    <span className="block text-[9.5px] font-bold text-[var(--app-text-muted)] truncate max-w-[220px]">
                                      {row.sub}
                                    </span>
                                  ) : null}
                                </span>
                                {canExpand && (
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 shrink-0 text-[var(--app-text-muted)] transition-transform ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                  />
                                )}
                              </div>
                            </td>
                            {tab === 'customer' && (
                              <>
                                <td className="px-3 py-2.5 text-[10.5px] font-bold text-[var(--app-text-muted)] max-w-[150px] truncate">
                                  {row.sub?.split(' · ')[0] || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-[10.5px] font-bold text-[var(--app-text-muted)] max-w-[130px] truncate">
                                  {row.sub?.split(' · ')[1] || '—'}
                                </td>
                              </>
                            )}
                            {tab === 'custRep' && (
                              <td className="px-3 py-2.5 text-[10.5px] font-bold text-[var(--app-text-muted)] max-w-[160px] truncate">
                                {row.sub || '—'}
                              </td>
                            )}
                            {(tab === 'item' || tab === 'family') && (
                              <td className="px-3 py-2.5 text-[10.5px] font-bold text-[var(--app-text-muted)]">
                                {tab === 'item'
                                  ? row.sub || '—'
                                  : `${row.items.size} صنف`}
                              </td>
                            )}
                            {(tab === 'branch' || tab === 'rep') && (
                              <td className="px-3 py-2.5 font-mono font-bold text-[11px]">
                                {row.custs.size.toLocaleString('en-US')}
                              </td>
                            )}
                            {tab === 'customer' && (
                              <td className="px-3 py-2.5 font-mono font-bold text-[11px]">
                                {row.items.size.toLocaleString('en-US')}
                              </td>
                            )}
                            <td className="px-3 py-2.5 font-mono font-bold text-[11px]">
                              {row.qty.toLocaleString('en-US')}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-black text-[11.5px] whitespace-nowrap">
                              {formatCurrency(row.amount)}
                            </td>
                            <td className="px-3 py-2.5">{renderShare(row.amount, totals.amount)}</td>
                          </tr>
                          {isExpanded && canExpand && (
                            <tr>
                              <td
                                colSpan={columnCountOf(tab)}
                                className="p-0 border-b border-[var(--app-border)]"
                              >
                                {renderFamilyBreakdown(row)}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--app-card-secondary)] font-black text-[var(--app-text)]">
                      <td className="px-3 py-3 sticky right-0 bg-[var(--app-card-secondary)] z-10 text-[11.5px]">
                        الإجمالي العام
                      </td>
                      <td className="px-3 py-3" colSpan={Math.max(1, columnCountOf(tab) - 4)} />
                      <td className="px-3 py-3 font-mono text-[11.5px]">
                        {totals.qty.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] whitespace-nowrap">
                        {formatCurrency(totals.amount)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11.5px]">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {totalRowCount > 25 && (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className="h-8 px-3 rounded-lg bg-[var(--app-card-hover)] text-[10.5px] font-black text-[var(--app-text)] hover:opacity-80 transition cursor-pointer"
                >
                  {showAll ? 'عرض أول 25 سطر فقط' : `عرض كل السطور (${totalRowCount})`}
                </button>
                <span className="text-[10px] font-bold text-[var(--app-text-muted)]">
                  {canExpand ? 'اضغط على أي سطر لعرض ما اشتراه من العائلات' : 'إجماليات فقط — بدون صفوف تفصيلية'}
                </span>
              </div>
            )}
          </CardShell>
        </div>
      </div>
    </div>
  );
};

export default TotalsAnalysisView;
