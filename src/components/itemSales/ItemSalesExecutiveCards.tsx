import { Building2, Layers, Users, Zap } from 'lucide-react';
import React, { useMemo } from 'react';
import { formatCurrency } from '../../services/invoiceService';
import { CANONICAL_BRANCHES, UNKNOWN_BRANCH } from '../../services/branchDirectory';
import type { CustomerItemSaleRecord } from '../../types';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

type SectorKey = 'home' | 'electrical';

interface ItemSalesExecutiveCardsProps {
  records: CustomerItemSaleRecord[];
  resolveSector: (record: CustomerItemSaleRecord) => SectorKey;
  resolveBranch: (record: CustomerItemSaleRecord) => string;
}

interface Bucket {
  key: string;
  label: string;
  amount: number;
  quantity: number;
  customers: Set<string>;
}

const SECTOR_META: Record<SectorKey, { label: string; color: string; tint: string }> = {
  home: { label: 'منزلي', color: '#2563EB', tint: 'var(--app-primary-tint)' },
  electrical: { label: 'كهربائي', color: '#7C3AED', tint: 'var(--app-violet-tint)' }
};

const PALETTE = ['#0D9488', '#2563EB', '#7C3AED', '#D97706', '#DC2626', '#0F766E', '#0284C7'];

const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

const ShareRow: React.FC<{
  label: string;
  amount: number;
  quantity: number;
  share: number;
  color: string;
  meta?: string;
}> = ({ label, amount, quantity, share, color, meta }) => (
  <div className="py-1.5 border-b border-[var(--app-border)] last:border-0">
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="font-black text-[var(--app-text)] truncate flex items-center gap-1.5 min-w-0">
        <i className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: color }} />
        <span className="truncate" title={label}>{label}</span>
      </span>
      <span className="font-mono font-black text-[var(--app-text)] shrink-0">{formatCurrency(amount)}</span>
    </div>
    <div className="mt-1 h-1.5 rounded-full bg-[var(--app-card-secondary)] overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: color }} />
    </div>
    <div className="mt-1 flex items-center justify-between text-[9.5px] font-bold text-[var(--app-text-muted)]">
      <span>{share.toFixed(1)}% من المبيعات</span>
      <span>
        {Math.round(quantity).toLocaleString('ar-EG')} قطعة{meta ? ` · ${meta}` : ''}
      </span>
    </div>
  </div>
);

/**
 * كروت التحليل التنفيذي لمبيعات الأصناف:
 * القطاعات · الفروع السبع · عائلات الأصناف · المناديب.
 * كل الكروت بتتحسب من نفس الصفوف المفلترة (قطاع/فرع/مندوب/عائلة/صنف/عميل).
 */
export const ItemSalesExecutiveCards: React.FC<ItemSalesExecutiveCardsProps> = ({
  records,
  resolveSector,
  resolveBranch
}) => {
  const analysis = useMemo(() => {
    const sectors = new Map<string, Bucket>();
    const branches = new Map<string, Bucket>();
    const families = new Map<string, Bucket>();
    const reps = new Map<string, Bucket>();
    let total = 0;

    const push = (map: Map<string, Bucket>, key: string, record: CustomerItemSaleRecord) => {
      const current =
        map.get(key) || { key, label: key, amount: 0, quantity: 0, customers: new Set<string>() };
      current.amount += Number(record.amount) || 0;
      current.quantity += Number(record.quantity) || 0;
      if (record.customerAccount) current.customers.add(record.customerAccount);
      map.set(key, current);
    };

    records.forEach((record) => {
      total += Number(record.amount) || 0;
      push(sectors, resolveSector(record), record);
      push(branches, resolveBranch(record), record);
      const family = (record.familyDimension || '').trim() || 'عام';
      push(families, family, record);
      push(reps, (record.repName || '').trim() || 'غير محدد', record);
    });

    const sortedFamilies = Array.from(families.values()).sort((a, b) => b.amount - a.amount);
    const sortedReps = Array.from(reps.values()).sort((a, b) => b.amount - a.amount);
    const branchOrder = CANONICAL_BRANCHES as readonly string[];

    return {
      total,
      sectorBuckets: (['home', 'electrical'] as SectorKey[]).map((key) => {
        const bucket = sectors.get(key);
        return {
          key,
          label: SECTOR_META[key].label,
          color: SECTOR_META[key].color,
          tint: SECTOR_META[key].tint,
          amount: bucket?.amount || 0,
          quantity: bucket?.quantity || 0,
          customers: bucket?.customers.size || 0
        };
      }),
      branches: Array.from(branches.values()).sort((a, b) => {
        const aIndex = branchOrder.indexOf(a.key);
        const bIndex = branchOrder.indexOf(b.key);
        if (aIndex === -1 && bIndex === -1) return b.amount - a.amount;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }),
      families: sortedFamilies,
      reps: sortedReps
    };
  }, [records, resolveSector, resolveBranch]);

  if (records.length === 0) {
    return (
      <CardShell title="تحليل الإدارة العليا" subtitle="لا توجد صفوف مطابقة للفلاتر الحالية">
        <ChartEmpty height={140} />
      </CardShell>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <CardShell
        title="توزيع المبيعات على القطاعات"
        subtitle={`${records.length.toLocaleString('ar-EG')} حركة · ${formatCurrency(analysis.total)}`}
        icon={<Zap className="w-4 h-4" />}
        iconClass="bg-[var(--app-violet-tint)] text-[var(--app-violet-text)]"
      >
        <div className="grid grid-cols-2 gap-3">
          {analysis.sectorBuckets.map((sector) => {
            const share = percent(sector.amount, analysis.total);
            return (
              <div
                key={sector.key}
                className="rounded-xl border border-[var(--app-border)] p-3"
                style={{ background: sector.tint }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-[var(--app-text)]">{sector.label}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: sector.color }}
                  />
                </div>
                <div className="mt-1.5 text-[15px] font-black font-mono text-[var(--app-text)]">
                  {formatCurrency(sector.amount)}
                </div>
                <div className="mt-1 text-[9.5px] font-bold text-[var(--app-text-muted)]">
                  {share.toFixed(1)}% · {Math.round(sector.quantity).toLocaleString('ar-EG')} قطعة ·{' '}
                  {sector.customers.toLocaleString('ar-EG')} عميل
                </div>
              </div>
            );
          })}
        </div>
      </CardShell>

      <CardShell
        title="الفروع"
        subtitle={`${analysis.branches.length} فرع · مرتبة حسب قائمة الإدارة`}
        icon={<Building2 className="w-4 h-4" />}
        iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]"
      >
        <div className="space-y-0">
          {analysis.branches.map((branch, index) => (
            <ShareRow
              key={branch.key}
              label={branch.key === UNKNOWN_BRANCH ? 'بدون فرع' : branch.key}
              amount={branch.amount}
              quantity={branch.quantity}
              share={percent(branch.amount, analysis.total)}
              color={PALETTE[index % PALETTE.length]}
              meta={`${branch.customers.size.toLocaleString('ar-EG')} عميل`}
            />
          ))}
        </div>
      </CardShell>

      <CardShell
        title="عائلات الأصناف"
        subtitle={`${analysis.families.length} عائلة · أعلى 6`}
        icon={<Layers className="w-4 h-4" />}
        iconClass="bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]"
      >
        <div>
          {analysis.families.slice(0, 6).map((family, index) => (
            <ShareRow
              key={family.key}
              label={family.label}
              amount={family.amount}
              quantity={family.quantity}
              share={percent(family.amount, analysis.total)}
              color={PALETTE[index % PALETTE.length]}
            />
          ))}
        </div>
      </CardShell>

      <CardShell
        title="المناديب"
        subtitle={`${analysis.reps.length} مندوب · أعلى 6`}
        icon={<Users className="w-4 h-4" />}
        iconClass="bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]"
      >
        <div>
          {analysis.reps.slice(0, 6).map((rep, index) => (
            <ShareRow
              key={rep.key}
              label={rep.label}
              amount={rep.amount}
              quantity={rep.quantity}
              share={percent(rep.amount, analysis.total)}
              color={PALETTE[index % PALETTE.length]}
              meta={`${rep.customers.size.toLocaleString('ar-EG')} عميل`}
            />
          ))}
        </div>
      </CardShell>
    </div>
  );
};
