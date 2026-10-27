import { parseNumericValue } from '../src/services/numericParsing';
import {
  buildGroupInsights,
  buildItemRanking,
  resolveItemGroup
} from '../src/services/itemSalesAnalytics';
import { CustomerItemSaleRecord } from '../src/types';

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

// 1) تحويل الأرقام القادمة من Excel
check('plain number', parseNumericValue(1234.5), 1234.5);
check('string number', parseNumericValue('1234.5'), 1234.5);
check('thousands comma', parseNumericValue('1,234'), 1234);
check('thousands + decimals', parseNumericValue('1,234.50'), 1234.5);
check('currency suffix', parseNumericValue('1,234.50 ج.م'), 1234.5);
check('arabic digits', parseNumericValue('١٢٣٤'), 1234);
check('arabic decimal comma', parseNumericValue('١٢٣٤٫٥'), 1234.5);
check('european format', parseNumericValue('1.234,56'), 1234.56);
check('decimal comma', parseNumericValue('1,5'), 1.5);
check('empty', parseNumericValue(''), 0);
check('null', parseNumericValue(null), 0);
check('garbage', parseNumericValue('غير متاح'), 0);

// 2) التصنيف من «التعريفات»
const baseRecord = {
  id: '1', customerAccount: 'C1', invoicingName: 'عميل', repName: 'أحمد', month: 1,
  warehouse: 'الفرع', itemCode: 'I1', itemName: 'صنف', unit: 'طقم', factor: 1,
  unitPrice: 10, discount: 0, quantity: 1, amount: 100, itemGroup: 'عام',
  familyDimension: 'عائلة أ'
} as CustomerItemSaleRecord;

check('group prefers definitions', resolveItemGroup({ ...baseRecord, definitions: 'دريم' }), 'دريم');
check('group falls back to itemGroup', resolveItemGroup({ ...baseRecord, itemGroup: 'مجموعة أ' }), 'مجموعة أ');
check('group falls back to family', resolveItemGroup({ ...baseRecord }), 'عائلة أ');

const records = [
  { ...baseRecord, id: '1', itemCode: 'I1', amount: 500, quantity: 5, definitions: 'دريم' },
  { ...baseRecord, id: '2', itemCode: 'I2', amount: 300, quantity: 3, definitions: 'لوتس' },
  { ...baseRecord, id: '3', itemCode: 'I3', amount: 200, quantity: 2, definitions: 'دريم' }
];
const mix = buildGroupInsights(records);
check('donut groups by definitions', mix.groups.map((g) => g.name), ['دريم', 'لوتس']);
check('donut group amount', mix.groups[0].amount, 700);
check('donut total', mix.totalAmount, 1000);

const ranked = buildItemRanking(records, [], { metric: 'amount', limit: 3 });
check('ranking uses amount', ranked.map((row) => row.amount), [500, 300, 200]);

if (fail.length > 0) {
  console.error(`\n${fail.length} check(s) failed: ${fail.join(', ')}`);
  process.exit(1);
}
console.log('\nAll numeric/grouping checks passed.');
