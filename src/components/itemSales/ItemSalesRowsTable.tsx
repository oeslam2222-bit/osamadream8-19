import { ChevronDown, Download, Package, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../services/invoiceService';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { looksLikeItemCode, resolveItemGroup } from '../../services/itemSalesAnalytics';
import type { CustomerItemSaleRecord } from '../../types';

type SectorKey = 'home' | 'electrical';

interface ItemSalesRowsTableProps {
  records: CustomerItemSaleRecord[];
  resolveSector: (record: CustomerItemSaleRecord) => SectorKey;
  /** أسماء العملاء من قاعدة العملاء (كود → اسم) — عشان مايظهرش الكود مكان الاسم. */
  customerNameByCode?: Map<string, string>;
}

const PAGE_SIZE = 40;

export interface AggregatedItemSalesRow {
  key: string;
  customerCode: string;
  customerName: string;
  repName: string;
  branch: string;
  sector: SectorKey;
  month: number;
  itemCode: string;
  itemName: string;
  family: string;
  quantity: number;
  amount: number;
}

const SECTOR_BADGE: Record<SectorKey, { label: string; className: string }> = {
  home: {
    label: 'منزلي',
    className:
      'tg-rows-badge tg-rows-badge--home'
  },
  electrical: {
    label: 'كهربائي',
    className:
      'tg-rows-badge tg-rows-badge--elec'
  }
};

/** اسم عميل مقروء: من قاعدة العملاء أولًا، وإلا الاسم من الشيت، وإلا الكود. */
const resolveCustomerName = (
  record: CustomerItemSaleRecord,
  directory?: Map<string, string>
): string => {
  const code = String(record.customerAccount || '').trim();
  const fromDirectory = code ? directory?.get(code.toLowerCase()) : undefined;
  if (fromDirectory) return fromDirectory;
  const invoicing = String(record.invoicingName || '').trim();
  if (invoicing && invoicing.toLowerCase() !== code.toLowerCase()) return invoicing;
  return code || 'عميل غير محدد';
};

/**
 * جدول «مبيعات الأصناف بالتفصيل» — **مُجمَّع** مش صفوف خام:
 * كود العميل · اسم العميل · الشهر · الصنف · الصنف بالعائلة · القطاع · عدد القطع · المبلغ.
 * كل صف = مجموع (عميل + شهر + صنف + عائلة + قطاع) من السجلات المطابقة للفلاتر،
 * مع بحث بالاسم أو الكود وتحميل المجموع فقط (بدل تحميل عشرات آلاف الصفوف).
 */
/**
 * تجميع السجلات الخام إلى صفوف: عميل + شهر + صنف + عائلة + قطاع.
 * نفس الدالة تُستخدم في الجدول وفي زر التصدير عشان الملف يكون مجمّعًا برضه.
 */
export const aggregateItemSalesRows = (
  records: CustomerItemSaleRecord[],
  resolveSector: (record: CustomerItemSaleRecord) => SectorKey,
  customerNameByCode?: Map<string, string>
): AggregatedItemSalesRow[] => {
  const grouped = new Map<string, AggregatedItemSalesRow>();

  records.forEach((record) => {
      const customerCode = String(record.customerAccount || '').trim() || '—';
      const month = Math.min(12, Math.max(0, Number(record.month) || 0));
      // الكود الموحد فريد لكل لون؛ كود المنتج ممكن يتكرر.
      // ولو الكود الموحد قيمته نص مش كود (بيحصل في بعض الشيتات) بنرجّع لكود الصنف.
      const unifiedCode = String(record.unifiedCode || '').trim();
      const baseCode = String(record.itemCode || '').trim();
      const itemCode = (unifiedCode && looksLikeItemCode(unifiedCode) ? unifiedCode : baseCode || unifiedCode) || '—';
      const itemName = String(record.itemName || record.itemCode || '').trim() || 'صنف غير محدد';
      const family =
        String(resolveItemGroup(record) || record.familyDimension || record.itemGroup || '').trim() ||
        'عام';
      const sector = resolveSector(record);
      // الفرع والمندوب من قاعدة العملاء (linked*) مع fallback لبيانات الشيت
      const branch = String((record as any).linkedBranch || record.warehouse || '').trim() || '—';
      const repName = String((record as any).linkedRepName || record.repName || '').trim() || '—';
      const key = `${customerCode}|${month}|${itemCode}|${family}|${sector}|${branch}|${repName}`;

      const current =
        grouped.get(key) || {
          key,
          customerCode,
          customerName: resolveCustomerName(record, customerNameByCode),
          repName,
          branch,
          sector,
          month,
          itemCode,
          itemName,
          family,
          quantity: 0,
          amount: 0
        };

    current.quantity += Number(record.quantity) || 0;
    current.amount += Number(record.amount) || 0;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
};

/** تحميل الصفوف المجمّعة كملف CSV يفتح في إكسل. */
export const downloadItemSalesRowsCsv = (
  rows: AggregatedItemSalesRow[],
  fileName: string
): void => {
  const header = [
    'كود العميل',
    'اسم العميل',
    'الفرع',
    'المندوب',
    'القطاع',
    'الشهر',
    'الصنف',
    'الصنف بالعائلة',
    'عدد القطع',
    'المبلغ'
  ];
  const lines = rows.map((row) =>
    [
      row.customerCode,
      row.customerName,
      row.branch,
      row.repName,
      SECTOR_BADGE[row.sector].label,
      MONTH_NAMES_MAP[row.month] || 'غير محدد',
      row.itemName,
      row.family,
      Math.round(row.quantity),
      Number(row.amount.toFixed(2))
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = `\uFEFF${[header.join(','), ...lines].join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const ItemSalesRowsTable: React.FC<ItemSalesRowsTableProps> = ({
  records,
  resolveSector,
  customerNameByCode
}) => {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => aggregateItemSalesRows(records, resolveSector, customerNameByCode),
    [records, resolveSector, customerNameByCode]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.customerName, row.customerCode, row.itemName, row.itemCode, row.family, row.branch, row.repName]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    let quantity = 0;
    let amount = 0;
    filtered.forEach((row) => {
      quantity += row.quantity;
      amount += row.amount;
    });
    return { quantity, amount };
  }, [filtered]);

  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  /** تحميل المجموع فقط — مش الصفوف الخام. */
  const handleDownload = () =>
    downloadItemSalesRowsCsv(
      filtered,
      `مبيعات_الأصناف_مجمعة_${new Date().toISOString().slice(0, 10)}.csv`
    );

  if (rows.length === 0) return null;

  return (
    <section className="tg-rows-card rounded-2xl border tg-rows-line shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b tg-rows-line flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl tg-rows-icon inline-flex items-center justify-center">
            <Package className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-black tg-rows-ink">مبيعات الأصناف — مُجمَّعة</h3>
            <p className="text-[11px] font-bold tg-rows-muted">
              كود العميل · اسم العميل · الفرع · المندوب · الشهر · الصنف · الصنف بالعائلة · القطاع · عدد القطع · المبلغ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-1 rounded-lg tg-rows-soft tg-rows-muted text-[10px] font-black tabular-nums">
            {filtered.length.toLocaleString('ar-EG')} صف مجمّع
          </span>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl tg-rows-cta text-white text-[11px] font-black transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            تحميل المجمّع
          </button>
        </div>
      </div>

      <div className="px-4 py-2.5 border-b tg-rows-line">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 tg-rows-muted" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="بحث باسم أو كود العميل أو الصنف…"
            aria-label="بحث في صفوف مبيعات الأصناف"
            className="w-full h-9 pr-9 pl-3 rounded-xl border tg-rows-input text-[11.5px] font-bold"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="tg-rows-table w-full text-right min-w-[860px]">
          <thead>
            <tr className="tg-rows-soft text-[10px] sm:text-[11px] font-black tg-rows-muted">
              <th className="px-3 py-2">كود العميل</th>
              <th className="px-3 py-2">اسم العميل</th>
              <th className="px-3 py-2">الفرع</th>
              <th className="px-3 py-2">المندوب</th>
              <th className="px-3 py-2">الشهر</th>
              <th className="px-3 py-2">الصنف</th>
              <th className="px-3 py-2">الصنف بالعائلة</th>
              <th className="px-3 py-2">القطاع</th>
              <th className="px-3 py-2">عدد القطع</th>
              <th className="px-3 py-2">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y tg-rows-divide">
            {shown.map((row) => {
              const badge = SECTOR_BADGE[row.sector];
              return (
                <tr key={row.key} className="text-[11px] sm:text-xs">
                  <td className="px-3 py-2 font-mono font-bold tg-rows-muted">
                    {row.customerCode}
                  </td>
                  <td
                    className="px-3 py-2 font-bold tg-rows-ink max-w-[190px] truncate"
                    title={row.customerName}
                  >
                    {row.customerName}
                  </td>
                  <td className="px-3 py-2 font-bold tg-rows-ink whitespace-nowrap" title={row.branch}>
                    {row.branch}
                  </td>
                  <td className="px-3 py-2 font-bold tg-rows-muted whitespace-nowrap" title={row.repName}>
                    {row.repName}
                  </td>
                  <td className="px-3 py-2 font-black tg-rows-ink whitespace-nowrap">
                    {MONTH_NAMES_MAP[row.month] || 'غير محدد'}
                  </td>
                  <td
                    className="px-3 py-2 font-bold tg-rows-ink max-w-[220px] truncate"
                    title={`${row.itemName} — ${row.itemCode}`}
                  >
                    {row.itemName}
                    <span className="block text-[9px] tg-rows-muted font-mono">
                      {row.itemCode}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 font-bold tg-rows-muted max-w-[140px] truncate"
                    title={row.family}
                  >
                    {row.family}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-black ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-bold tg-rows-ink whitespace-nowrap">
                    {Math.round(row.quantity).toLocaleString('ar-EG')}
                  </td>
                  <td className="px-3 py-2 font-mono font-black tg-rows-ink whitespace-nowrap">
                    {formatCurrency(row.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="tg-rows-soft text-[11px] font-black tg-rows-ink">
              <td className="px-3 py-2" colSpan={8}>
                الإجمالي (كل الصفوف المطابقة للفلاتر والبحث)
              </td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">
                {Math.round(totals.quantity).toLocaleString('ar-EG')}
              </td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">{formatCurrency(totals.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {remaining > 0 && (
        <div className="px-4 py-3 border-t tg-rows-line text-center">
          <button
            type="button"
            onClick={() => setVisible((value) => value + PAGE_SIZE)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border tg-rows-line tg-rows-soft hover:tg-rows-soft text-[11px] font-black tg-rows-ink transition cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            عرض المزيد ({remaining.toLocaleString('ar-EG')} صف متبقي)
          </button>
        </div>
      )}
    </section>
  );
};
