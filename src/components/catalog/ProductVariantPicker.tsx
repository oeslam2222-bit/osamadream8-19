import { Palette } from 'lucide-react';
import React, { useMemo } from 'react';
import { CANONICAL_BRANCHES } from '../../services/branchDirectory';
import { formatCurrency } from '../../services/invoiceService';
import type { Product } from '../../types';

const OCTOBER_KEY = 'مخزون اكتوبر';

interface ProductVariantPickerProps {
  product: Product;
  allProducts: Product[];
  onSelect: (variant: Product) => void;
}

const cleanCode = (value?: string | null) => String(value || '').trim().replace(/^#/, '').toLowerCase();

const normalize = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');

/** رصيد صنف في فرع معيّن (بما فيهم مخزن أكتوبر). */
export function variantBranchStock(variant: Product, branch: string): number {
  if (branch === OCTOBER_KEY) return Number(variant.mainWarehouseActual) || 0;
  const stocks = variant.branchStocks || {};
  const direct = stocks[branch];
  if (direct !== undefined) return Number(direct) || 0;
  const target = normalize(branch);
  const key = Object.keys(stocks).find((candidate) => {
    const normalizedCandidate = normalize(candidate);
    return (
      normalizedCandidate === target ||
      (normalizedCandidate.length > 2 && target.includes(normalizedCandidate)) ||
      (target.length > 2 && normalizedCandidate.includes(target))
    );
  });
  if (key) return Number(stocks[key]) || 0;
  if (variant.branchName && normalize(variant.branchName).includes(target)) {
    return Number(variant.branchStockActual) || 0;
  }
  return 0;
}

/**
 * الألوان / الأكواد الموحدة لنفس كود المنتج.
 *
 * المنتج في الشيت ليه كود واحد وأكتر من «كود موحد» (لون)، وكل لون ليه
 * رصيد مختلف في الفروع. الشريط ده بيخلي المندوب يختار اللون يشوف فوراً
 * الكود الموحد والأسعار ورصيد كل فرع — اختيار بسيط بضغطة واحدة.
 */
export const ProductVariantPicker: React.FC<ProductVariantPickerProps> = ({
  product,
  allProducts,
  onSelect
}) => {
  const variants = useMemo(() => {
    const baseCode = cleanCode(product.code);
    const list: Product[] = [];
    const seen = new Set<string>();

    const add = (candidate: Product) => {
      const key = cleanCode(candidate.unifiedCode) || `${normalize(candidate.color)}|${candidate.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push(candidate);
    };

    if (baseCode) {
      allProducts.forEach((candidate) => {
        if (cleanCode(candidate.code) === baseCode) add(candidate);
      });
    }
    if (list.length === 0 || !list.some((variant) => variant.id === product.id)) {
      list.unshift(product);
    }
    return list;
  }, [product, allProducts]);

  if (variants.length <= 1) return null;

  const totalStockOf = (variant: Product) =>
    CANONICAL_BRANCHES.reduce((sum, branch) => sum + variantBranchStock(variant, branch), 0) +
    variantBranchStock(variant, OCTOBER_KEY);

  return (
    <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-black text-[var(--app-text)] flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-[var(--app-primary-text)]" />
          الألوان / الأكواد الموحدة ({variants.length})
        </span>
        <span className="text-[9.5px] font-bold text-[var(--app-text-muted)]">
          كود المنتج واحد — وكل لون له كود موحد ورصيد مختلف
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {variants.map((variant) => {
          const active = variant.id === product.id;
          const unified = cleanCode(variant.unifiedCode);
          const stock = totalStockOf(variant);
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelect(variant)}
              title={`${variant.color || 'بدون لون'} — موحد ${unified || '—'}`}
              className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black transition cursor-pointer text-right ${
                active
                  ? 'bg-[var(--app-primary)] text-white border-[var(--app-primary)]'
                  : 'bg-[var(--app-card)] text-[var(--app-text)] border-[var(--app-border)] hover:border-[var(--app-primary-border)]'
              }`}
            >
              <span className="block leading-tight">{variant.color || 'بدون لون'}</span>
              <span
                className={`block font-mono text-[9px] ${
                  active ? 'text-white/80' : 'text-[var(--app-text-muted)]'
                }`}
              >
                {unified ? `#${unified}` : '—'} · {Math.round(stock).toLocaleString('ar-EG')} ك
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[9.5px] font-bold">
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card)] px-2 py-1.5">
          <span className="text-[var(--app-text-muted)]">سعر اللستة</span>
          <span className="block font-mono font-black text-[var(--app-text)]">
            {formatCurrency(product.cartonPrice || 0)}
          </span>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card)] px-2 py-1.5">
          <span className="text-[var(--app-text-muted)]">سعر القطعة</span>
          <span className="block font-mono font-black text-[var(--app-text)]">
            {formatCurrency(product.piecePrice || product.salesPrice || 0)}
          </span>
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-4 gap-1">
        {CANONICAL_BRANCHES.map((branch) => {
          const stock = variantBranchStock(product, branch);
          return (
            <div
              key={branch}
              className={`rounded-lg border px-1.5 py-1 text-center ${
                stock > 0
                  ? 'border-[var(--app-ok-line)] bg-[var(--app-ok-tint)]'
                  : 'border-[var(--app-border)] bg-[var(--app-card)]'
              }`}
            >
              <div className="text-[8.5px] text-[var(--app-text-muted)]">{branch}</div>
              <div
                className={`font-mono font-black text-[9.5px] ${
                  stock > 0 ? 'text-[var(--app-ok-text)]' : 'text-[var(--app-text-muted)]'
                }`}
              >
                {Math.round(stock).toLocaleString('ar-EG')}
              </div>
            </div>
          );
        })}
        <div
          className={`rounded-lg border px-1.5 py-1 text-center ${
            variantBranchStock(product, OCTOBER_KEY) > 0
              ? 'border-[var(--app-navy-line)] bg-[var(--app-navy-tint)]'
              : 'border-[var(--app-border)] bg-[var(--app-card)]'
          }`}
        >
          <div className="text-[8.5px] text-[var(--app-text-muted)]">أكتوبر</div>
          <div className="font-mono font-black text-[9.5px] text-[var(--app-navy-text)]">
            {Math.round(variantBranchStock(product, OCTOBER_KEY)).toLocaleString('ar-EG')}
          </div>
        </div>
      </div>
    </section>
  );
};
