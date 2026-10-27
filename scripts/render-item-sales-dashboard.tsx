import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildGroupInsights,
  buildItemRanking,
  buildMonthlyCustomerAnalysis,
  buildMonthlyPerformance,
  buildPeriodTotals,
  buildRepPerformance
} from '../src/services/itemSalesAnalytics';
import { buildCustomerInsights } from '../src/services/customerItemSalesInsights';
import { ItemSalesKpiCards } from '../src/components/itemSales/ItemSalesKpiCards';
import { CategoryMixCard } from '../src/components/itemSales/CategoryMixCard';
import { ItemRankingCard } from '../src/components/itemSales/ItemRankingCard';
import { MonthlyPerformanceCard } from '../src/components/itemSales/MonthlyPerformanceCard';
import {
  MonthlyCustomerAnalysisTable,
  TopCustomersTable
} from '../src/components/itemSales/CustomerBreakdownCards';
import { SlowMoversCard } from '../src/components/itemSales/SlowMoversCard';
import { RepPerformanceCard } from '../src/components/itemSales/RepPerformanceCard';
import { CustomerSnapshotCard } from '../src/components/itemSales/CustomerSnapshotCard';
import { CustomerItemSaleRecord } from '../src/types';

const base = {
  repName: 'أحمد',
  warehouse: 'الفرع الرئيسي',
  unit: 'كرتونة',
  factor: 12,
  unitPrice: 10,
  discount: 0,
  itemGroup: 'مجموعة أ',
  familyDimension: 'عائلة أ'
};

const records: CustomerItemSaleRecord[] = [
  { ...base, id: '1', customerAccount: 'C1', invoicingName: 'شركة النور', salesOrder: 'SO-1', month: 1, itemCode: 'I1', itemName: 'صنف أول', quantity: 10, amount: 1000 },
  { ...base, id: '2', customerAccount: 'C1', invoicingName: 'شركة النور', salesOrder: 'SO-2', month: 2, itemCode: 'I1', itemName: 'صنف أول', quantity: 20, amount: 2000 },
  { ...base, id: '3', customerAccount: 'C2', invoicingName: 'مؤسسة الأمل', salesOrder: 'SO-3', month: 2, itemCode: 'I2', itemName: 'صنف ثانٍ', itemGroup: 'مجموعة ب', quantity: 5, amount: 500, repName: 'خالد' },
  { ...base, id: '4', customerAccount: 'C3', invoicingName: 'متجر السلام', salesOrder: 'SO-4', month: 3, itemCode: 'I3', itemName: 'صنف ثالث', quantity: 2, amount: 200 }
];

const totals = buildPeriodTotals(records);
const prevTotals = buildPeriodTotals(records.filter((r) => r.month === 2));
const comparison = {
  month: null,
  previousMonth: null,
  currentAmount: totals.amount,
  previousAmount: prevTotals.amount,
  growthPct: 12.5,
  latestMonthGrowthPct: 12.5,
  latestMonthLabel: 'مارس',
  scopeLabel: 'كل الشهور',
  comparisonLabel: 'مقارنة بالفترة السابقة'
};

const summaries = [
  {
    customerAccount: 'C1',
    customerName: 'شركة النور',
    repName: 'أحمد',
    warehouse: 'الفرع الرئيسي',
    totalQuantity: 30,
    totalAmount: 3000,
    distinctItemsCount: 2,
    distinctOrdersCount: 2,
    monthlySales: { 1: 1000, 2: 2000 },
    monthlyQuantities: { 1: 10, 2: 20 },
    groupBreakdown: {},
    familyBreakdown: {},
    items: []
  },
  {
    customerAccount: 'C2',
    customerName: 'مؤسسة الأمل',
    repName: 'خالد',
    warehouse: 'الفرع الرئيسي',
    totalQuantity: 5,
    totalAmount: 500,
    distinctItemsCount: 1,
    distinctOrdersCount: 1,
    monthlySales: { 2: 500 },
    monthlyQuantities: { 2: 5 },
    groupBreakdown: {},
    familyBreakdown: {},
    items: []
  }
];

const customers = buildCustomerInsights(summaries, records, new Map(), totals.amount).sort(
  (a, b) => b.amount - a.amount
);

const groupMix = buildGroupInsights(records);
const topValue = buildItemRanking(records, [], { metric: 'amount', limit: 10 });
const topQty = buildItemRanking(records, [], { metric: 'quantity', limit: 10 });
const slow = buildItemRanking(records, [], { metric: 'amount', limit: 6, order: 'asc' });
const monthly = buildMonthlyPerformance(records, 6);
const monthlyCustomers = buildMonthlyCustomerAnalysis(records);
const reps = buildRepPerformance(records);

const blocks: Array<[string, React.ReactElement]> = [
  [
    'KPI',
    <ItemSalesKpiCards
      comparison={comparison}
      totalQuantity={totals.quantity}
      previousQuantity={prevTotals.quantity}
      itemsCount={totals.itemsCount}
      previousItemsCount={prevTotals.itemsCount}
      idleCount={4}
      idleCaption="من 20 صنف برصيد في الكتالوج"
      comparisonCaption="مقارنة بالفترة السابقة"
    />
  ],
  [
    'CategoryMix',
    <CategoryMixCard
      groups={groupMix.groups}
      totalAmount={groupMix.totalAmount}
      totalItems={groupMix.totalItems}
      totalQuantity={groupMix.totalQuantity}
    />
  ],
  ['TopValue', <ItemRankingCard variant="amount" items={topValue} />],
  ['TopQty', <ItemRankingCard variant="quantity" items={topQty} />],
  [
    'MonthlyPerf',
    <MonthlyPerformanceCard points={monthly} growth={12.5} selectedMonth="all" onSelectMonth={() => {}} />
  ],
  [
    'TopCustomers',
    <TopCustomersTable
      customers={customers}
      selectedAccount={customers[0]?.customerAccount || null}
      onSelectCustomer={() => {}}
      onOpenAll={() => {}}
    />
  ],
  ['MonthlyCustomers', <MonthlyCustomerAnalysisTable rows={monthlyCustomers} />],
  ['SlowMovers', <SlowMoversCard items={slow} totalItems={totals.itemsCount} />],
  ['Reps', <RepPerformanceCard reps={reps} selectedRep="all" onSelectRep={() => {}} />],
  [
    'Snapshot',
    <CustomerSnapshotCard customer={customers[0] || null} onStartOrder={() => {}} onOpenDetails={() => {}} />
  ]
];

let failed = false;
for (const [name, element] of blocks) {
  try {
    const html = renderToStaticMarkup(element);
    const ok = html.includes('bg-white') && html.length > 500;
    console.log(`${ok ? 'PASS' : 'WARN'} — ${name} rendered (${html.length} chars)`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FAIL — ${name}`, error);
  }
}

if (failed) process.exit(1);
console.log('\nAll dashboard components render successfully.');
