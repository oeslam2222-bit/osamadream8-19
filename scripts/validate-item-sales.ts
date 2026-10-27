import { CustomerItemSaleRecord, Product } from '../src/types';
import {
  buildGroupInsights,
  buildIdleItems,
  buildItemRanking,
  buildMonthlyCustomerAnalysis,
  buildMonthlyPerformance,
  buildPeriodTotals,
  buildRepPerformance
} from '../src/services/itemSalesAnalytics';

const rec = (partial: Partial<CustomerItemSaleRecord>): CustomerItemSaleRecord => ({
  id: Math.random().toString(36),
  customerAccount: 'C1',
  invoicingName: 'عميل أول',
  repName: 'أحمد',
  month: 1,
  warehouse: 'الفرع الرئيسي',
  itemCode: 'I1',
  itemName: 'صنف أول',
  unit: 'كرتونة',
  factor: 12,
  unitPrice: 10,
  discount: 0,
  quantity: 1,
  amount: 100,
  itemGroup: 'مجموعة أ',
  familyDimension: 'عائلة أ',
  ...partial
});

const records: CustomerItemSaleRecord[] = [
  rec({ month: 1, itemCode: 'I1', itemName: 'صنف أول', quantity: 10, amount: 1000, customerAccount: 'C1' }),
  rec({ month: 1, itemCode: 'I2', itemName: 'صنف ثاني', quantity: 5, amount: 500, customerAccount: 'C2', invoicingName: 'عميل ثاني', itemGroup: 'مجموعة ب' }),
  rec({ month: 2, itemCode: 'I1', itemName: 'صنف أول', quantity: 20, amount: 2000, customerAccount: 'C1' }),
  rec({ month: 2, itemCode: 'I3', itemName: 'صنف ثالث', quantity: 2, amount: 200, customerAccount: 'C3', invoicingName: 'عميل ثالث', repName: 'خالد', itemGroup: 'مجموعة أ' }),
  rec({ month: 3, itemCode: 'I1', itemName: 'صنف أول', quantity: 30, amount: 3000, customerAccount: 'C1' })
];

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

const totals = buildPeriodTotals(records);
check('period amount', totals.amount, 6700);
check('period quantity', totals.quantity, 67);
check('period items', totals.itemsCount, 3);
check('period customers', totals.customersCount, 3);

const mix = buildGroupInsights(records);
check('group total', mix.totalAmount, 6700);
check('group A share%', Math.round(mix.groups[0].sharePct), Math.round((6200 / 6700) * 100));

const topAmount = buildItemRanking(records, [], { metric: 'amount', limit: 3 });
check('top amount order', topAmount.map((r) => r.itemCode), ['I1', 'I2', 'I3']);
check('top amount growth null', topAmount[0].growthPct, null);
check('top amount last month', topAmount[0].lastMonthLabel, 'مارس');

const prevRecords = records.filter((r) => r.month === 1);
const topWithPrev = buildItemRanking(records, prevRecords, { metric: 'amount', limit: 3 });
check('growth vs previous', Math.round(topWithPrev[0].growthPct as number), Math.round(((6000 - 1000) / 1000) * 100));

const bottom = buildItemRanking(records, [], { metric: 'amount', limit: 2, order: 'asc' });
check('bottom amount order', bottom.map((r) => r.itemCode), ['I3', 'I2']);

const qty = buildItemRanking(records, [], { metric: 'quantity', limit: 2 });
check('top quantity order', qty.map((r) => r.itemCode), ['I1', 'I2']);

const monthly = buildMonthlyPerformance(records, 6);
check('monthly points', monthly.map((p) => p.month), [1, 2, 3]);
check('monthly feb orders', monthly[1].orders, 0);

const monthlyAnalysis = buildMonthlyCustomerAnalysis(records);
check('monthly growth march', Math.round(monthlyAnalysis[2].growthPct as number), 36);

const reps = buildRepPerformance(records);
check('rep first', reps[0].repName, 'أحمد');
check('rep share%', Math.round(reps[0].sharePct), Math.round((6500 / 6700) * 100));

const products: Product[] = [
  {
    id: 'p1', code: 'I1', name: 'صنف أول', category: 'مجموعة أ', itemGroup: 'مجموعة أ',
    status: 'متاح', cartonQuantity: 12, size: '', color: '', branchStockActual: 5,
    branchStockReserved: 0, mainWarehouseActual: 10, mainWarehouseReserved: 0,
    department: 'أ', classification: 'أ', piecePrice: 10, cartonPrice: 120, branchName: 'الرئيسي',
    salesPriority: 'عالية'
  } as unknown as Product,
  {
    id: 'p2', code: 'I9', name: 'صنف راكد', category: 'مجموعة ب', itemGroup: 'مجموعة ب',
    status: 'راكد', cartonQuantity: 12, size: '', color: '', branchStockActual: 4,
    branchStockReserved: 0, mainWarehouseActual: 6, mainWarehouseReserved: 0,
    department: 'ب', classification: 'ب', piecePrice: 10, cartonPrice: 120, branchName: 'الرئيسي',
    salesPriority: 'منخفضة'
  } as unknown as Product
];

const idle = buildIdleItems(records, records, products, 6);
check('idle source', idle.source, 'catalog');
check('idle total', idle.totalIdle, 1);
check('idle code', idle.items[0].itemCode, 'I9');
check('idle last sold', idle.items[0].lastMonthLabel, 'لم يُبع');

const idleFallback = buildIdleItems(records.filter((r) => r.month === 3), records, [], 6);
check('idle fallback source', idleFallback.source, 'sales-history');
check('idle fallback count', idleFallback.totalIdle, 2);

if (fail.length > 0) {
  console.error(`\n${fail.length} check(s) failed: ${fail.join(', ')}`);
  process.exit(1);
}
console.log('\nAll item-sales analytics checks passed.');
