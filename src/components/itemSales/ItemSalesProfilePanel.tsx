import { Layers, Loader2, Package, TrendingUp, Users } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { normalizeArabicText } from '../../services/arabicMatchingService';
import {
  getSavedCustomerItemSales,
  MONTH_NAMES_MAP,
  normalizeCustomerLookupCode
} from '../../services/customerItemSalesService';
import { formatCurrency } from '../../services/invoiceService';
import type { CustomerItemSaleRecord } from '../../types';

const PALETTE = ['#0D9488', '#2563EB', '#7C3AED', '#D97706', '#DC2626', '#0F766E', '#0284C7'];

interface ItemSalesProfilePanelProps {
  title: string;
  subtitle?: string;
  /** كود العميل (يفضّل) أو اسمه — لبروفايل العميل. */
  customerAccount?: string;
  customerName?: string;
  /** اسم المندوب — لبروفايل المندوب. */
  repName?: string;
}

/**
 * ربط مبيعات الأصناف ببروفايل العميل أو المندوب.
 * بتقرأ نفس سجلات صفحة «مبيعات الأصناف» من الكاش المحلي (بدون أي تنزيل إضافي)
 * وبتعرض ملخص ملوّن: المبيعات، القطع، الأصناف، العائلات، أعلى الأصناف، والشهور.
 */
export const ItemSalesProfilePanel: React.FC<ItemSalesProfilePanelProps> = ({
  title,
  subtitle,
  customerAccount,
  customerName,
  repName
}) => {
  const [records, setRecords] = useState<CustomerItemSaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = await getSavedCustomerItemSales();
      if (!cancelled) {
        setRecords(rows);
        setIsLoading(false);
      }
    };
    void load();
    const handleUpdate = () => {
      void load();
    };
    window.addEventListener('tantawy-customer-item-sales-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('tantawy-customer-item-sales-updated', handleUpdate);
    };
  }, []);

  const scoped = useMemo(() => {
    if (customerAccount || customerName) {
      const accountKey = normalizeCustomerLookupCode(customerAccount);
      const nameKey = normalizeArabicText(customerName || '').replace(/\s+/g, '');
      return records.filter((record) => {
        const recordAccount = normalizeCustomerLookupCode(record.customerAccount);
        if (accountKey && recordAccount && recordAccount === accountKey) return true;
        const recordName = normalizeArabicText(record.invoicingName || '').replace(/\s+/g, '');
        if (nameKey && recordName && recordName === nameKey) return true;
        return false;
      });
    }

    if (repName) {
      const target = normalizeArabicText(repName).replace(/\s+/g, ' ').trim();
      if (!target) return [];
      return records.filter((record) => {
        const candidates = [record.repName, record.linkedRepName].filter(Boolean) as string[];
        return candidates.some((candidate) => {
          const value = normalizeArabicText(candidate).replace(/\s+/g, ' ').trim();
          if (!value) return false;
          return value === target || value.includes(target) || target.includes(value);
        });
      });
    }

    return [];
  }, [records, customerAccount, customerName, repName]);

  const summary = useMemo(() => {
    const families = new Map<string, number>();
    const items = new Map<string, { name: string; amount: number; quantity: number }>();
    const months = new Map<number, { amount: number; quantity: number }>();
    const customers = new Set<string>();
    let amount = 0;
    let quantity = 0;

    scoped.forEach((record) => {
      const recordAmount = Number(record.amount) || 0;
      const recordQuantity = Number(record.quantity) || 0;
      amount += recordAmount;
      quantity += recordQuantity;
      if (record.customerAccount) customers.add(record.customerAccount);

      const family = (record.familyDimension || '').trim() || 'عام';
      families.set(family, (families.get(family) || 0) + recordAmount);

      // الكود الموحد فريد لكل لون — كود المنتج ممكن يتكرر بين الألوان.
      const code =
        (record.unifiedCode || record.itemCode || record.itemName || '').trim() || '—';
      const item = items.get(code) || { name: record.itemName || code, amount: 0, quantity: 0 };
      item.amount += recordAmount;
      item.quantity += recordQuantity;
      items.set(code, item);

      const month = Math.min(12, Math.max(1, Number(record.month) || 1));
      const monthBucket = months.get(month) || { amount: 0, quantity: 0 };
      monthBucket.amount += recordAmount;
      monthBucket.quantity += recordQuantity;
      months.set(month, monthBucket);
    });

    return {
      amount,
      quantity,
      customers: customers.size,
      itemCount: items.size,
      families: Array.from(families.entries())
        .map(([name, value]) => ({ name, amount: value }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
      items: Array.from(items.entries())
        .map(([code, value]) => ({ code, ...value }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
      months
    };
  }, [scoped]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 flex items-center gap-2 text-[11px] font-bold text-[var(--app-text-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        جاري تحميل مبيعات الأصناف…
      </div>
    );
  }

  if (scoped.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4">
        <div className="flex items-center gap-2 text-[12px] font-black text-[var(--app-text)]">
          <Package className="w-4 h-4 text-[var(--app-text-muted)]" />
          {title}
        </div>
        <p className="mt-1 text-[10.5px] font-bold text-[var(--app-text-muted)]">
          لا توجد مبيعات أصناف مرتبطة بعد — استورد شيت مبيعات الأصناف أو اربط كود العميل بقاعدة العملاء.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 sm:p-5">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[13px] font-black text-[var(--app-text)] flex items-center gap-1.5">
            <Package className="w-4 h-4 text-[var(--app-primary-text)]" />
            {title}
          </h3>
          <p className="text-[10.5px] font-bold text-[var(--app-text-muted)] mt-0.5">
            {subtitle || `${scoped.length.toLocaleString('ar-EG')} حركة من شيت مبيعات الأصناف`}
          </p>
        </div>
        <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border border-[var(--app-primary-border)]">
          {formatCurrency(summary.amount)}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-2.5">
          <div className="text-[9.5px] font-bold text-[var(--app-text-muted)] flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> إجمالي المبيعات
          </div>
          <div className="text-[13px] font-black font-mono text-[var(--app-text)] mt-0.5">
            {formatCurrency(summary.amount)}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-2.5">
          <div className="text-[9.5px] font-bold text-[var(--app-text-muted)]">عدد القطع</div>
          <div className="text-[13px] font-black font-mono text-[var(--app-text)] mt-0.5">
            {Math.round(summary.quantity).toLocaleString('ar-EG')}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-2.5">
          <div className="text-[9.5px] font-bold text-[var(--app-text-muted)]">الأصناف المتحركة</div>
          <div className="text-[13px] font-black font-mono text-[var(--app-text)] mt-0.5">
            {summary.itemCount.toLocaleString('ar-EG')}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-2.5">
          <div className="text-[9.5px] font-bold text-[var(--app-text-muted)] flex items-center gap-1">
            <Users className="w-3 h-3" /> العملاء
          </div>
          <div className="text-[13px] font-black font-mono text-[var(--app-text)] mt-0.5">
            {summary.customers.toLocaleString('ar-EG')}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--app-border)] p-3">
          <div className="text-[10.5px] font-black text-[var(--app-text)] flex items-center gap-1.5 mb-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--app-ok-text)]" />
            عائلات الأصناف
          </div>
          <div className="space-y-1.5">
            {summary.families.map((family, index) => {
              const share = summary.amount > 0 ? (family.amount / summary.amount) * 100 : 0;
              const color = PALETTE[index % PALETTE.length];
              return (
                <div key={family.name}>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span className="truncate text-[var(--app-text)]" title={family.name}>
                      {family.name}
                    </span>
                    <span className="font-mono font-black text-[var(--app-text)] shrink-0">
                      {formatCurrency(family.amount)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-[var(--app-card-secondary)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, share)}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
            {summary.families.length === 0 && (
              <div className="text-[10px] font-bold text-[var(--app-text-muted)]">لا توجد عائلات</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] p-3">
          <div className="text-[10.5px] font-black text-[var(--app-text)] flex items-center gap-1.5 mb-1.5">
            <Package className="w-3.5 h-3.5 text-[var(--app-primary-text)]" />
            أعلى الأصناف
          </div>
          <div className="space-y-1.5">
            {summary.items.map((item, index) => (
              <div key={item.code} className="flex items-center justify-between gap-2 text-[10px] font-bold">
                <span className="truncate text-[var(--app-text)]" title={`${item.name} — ${item.code}`}>
                  <span className="inline-block w-4 text-[var(--app-text-muted)]">{index + 1}.</span>
                  {item.name}
                </span>
                <span className="font-mono font-black text-[var(--app-text)] shrink-0">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
            {summary.items.length === 0 && (
              <div className="text-[10px] font-bold text-[var(--app-text-muted)]">لا توجد أصناف</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[10.5px] font-black text-[var(--app-text)] mb-1.5">التوزيع الشهري</div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
            const bucket = summary.months.get(month);
            const amount = bucket?.amount || 0;
            const active = amount > 0;
            return (
              <div
                key={month}
                className={`text-center rounded-lg border px-1 py-1.5 ${
                  active
                    ? 'border-[var(--app-primary-border)] bg-[var(--app-primary-tint)]'
                    : 'border-[var(--app-border)] bg-[var(--app-card-secondary)]'
                }`}
                title={`${MONTH_NAMES_MAP[month]} — ${formatCurrency(amount)}`}
              >
                <div className="text-[8px] font-black text-[var(--app-text-muted)]">
                  {(MONTH_NAMES_MAP[month] || '').slice(0, 3)}
                </div>
                <div
                  className={`text-[8.5px] font-mono font-black ${
                    active ? 'text-[var(--app-primary-text)]' : 'text-[var(--app-text-muted)]'
                  }`}
                >
                  {active ? Math.round(amount / 1000).toLocaleString('ar-EG') + 'ألف' : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
