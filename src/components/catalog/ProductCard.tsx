import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Heart,
  ShoppingCart,
  Store,
  Calendar,
} from 'lucide-react';
import React, { useMemo, useCallback } from 'react';
import { ProductImage } from '../ProductImage';
import {
  getProductImageUrl,
} from '../../services/cloudinaryService';
import { formatCurrency } from '../../services/invoiceService';
import { resolveDisplayPrice, stripPlaceholderText } from '../../services/productPricing';
import { resolveProductPromotion } from '../../services/promotionService';
import { getBranchStockForProduct } from '../../services/arabicMatchingService';
import { Product } from '../../types';
import { COMPANY_WAREHOUSES } from './warehouses';

interface ProductCardProps {
  product: Product;
  cloudinaryConfig: any;
  promotions: any;
  isFav: boolean;
  onToggleFavorite: (productId: string) => void;
  currentQty: number;
  onQtyChange: (productId: string, delta: number) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  currentActiveBranch: string;
  showAllWarehouses: boolean;
  setShowAllWarehouses: (v: boolean) => void;
}

const getProductBranchStock = (p: Product, branch: string) => getBranchStockForProduct(p, branch);

const getWarehouseStock = (p: Product, warehouseKey: string): number => {
  if (warehouseKey === 'مخزون اكتوبر' || warehouseKey.includes('اكتوبر') || warehouseKey.includes('أكتوبر')) {
    return p.mainWarehouseActual || (p.branchStocks?.['مخزون اكتوبر'] ?? p.branchStocks?.['الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)'] ?? 0);
  }
  if (p.branchStocks) {
    if (p.branchStocks[warehouseKey] !== undefined) return p.branchStocks[warehouseKey];
    if (p.branchStocks[`فرع ${warehouseKey}`] !== undefined) return p.branchStocks[`فرع ${warehouseKey}`];
  }
  return getBranchStockForProduct(p, `فرع ${warehouseKey}`);
};

const isProductElectrical = (p: Product): boolean => {
  if (p.sector === 'electrical') return true;
  if (p.sector === 'both' || p.sector === 'all') return true;
  const checkStr = `${p.sector || ''} ${p.department || ''} ${p.category || ''} ${p.itemGroup || ''} ${p.familyName || ''} ${p.name || ''}`.toLowerCase();
  const hasElectricalKeywords =
    checkStr.includes('كهربا') ||
    checkStr.includes('لمبة') ||
    checkStr.includes('مفتاح') ||
    checkStr.includes('كابل') ||
    checkStr.includes('سلك') ||
    checkStr.includes('شاسيه') ||
    checkStr.includes('قاطع') ||
    checkStr.includes('فيشة') ||
    checkStr.includes('لقمة') ||
    checkStr.includes('دواية') ||
    checkStr.includes('وش') ||
    checkStr.includes('سبوت') ||
    checkStr.includes('كشاف') ||
    checkStr.includes('electrical') ||
    checkStr.includes('electric') ||
    checkStr.includes('cable') ||
    checkStr.includes('wire') ||
    checkStr.includes('switch') ||
    checkStr.includes('bulb') ||
    checkStr.includes('lamp') ||
    checkStr.includes('socket') ||
    checkStr.includes('plug') ||
    checkStr.includes('breaker') ||
    checkStr.includes('fuse');

  if (hasElectricalKeywords) return true;
  if (p.sector === 'home') return false;
  return false;
};

export const ProductCard = React.memo((props: ProductCardProps) => {
  const {
    product,
    cloudinaryConfig,
    promotions,
    isFav,
    onToggleFavorite,
    currentQty,
    onQtyChange,
    onAddToCart,
    onSelectProduct,
    currentActiveBranch,
    showAllWarehouses,
    setShowAllWarehouses,
  } = props;

  const p = product;

  // حسابات موميزة لكل منتج على حدة — تُعاد فقط عند تغيير بيانات المنتج أو العروض
  const branchStock = useMemo(() => getProductBranchStock(p, currentActiveBranch), [p, currentActiveBranch]);
  const octoberStock = useMemo(() => p.mainWarehouseActual || 0, [p]);
  const isElectrical = useMemo(() => isProductElectrical(p), [p]);
  const priceInfo = useMemo(() => resolveDisplayPrice({
    piecePrice: p.piecePrice ?? p.salesPrice,
    cartonPrice: p.cartonPrice,
    factor: p.cartonQuantity ?? p.factor,
  }), [p.piecePrice, p.salesPrice, p.cartonPrice, p.cartonQuantity, p.factor]);
  const promoInfo = useMemo(() => resolveProductPromotion(p, promotions), [p, promotions]);
  const displayName = useMemo(() => stripPlaceholderText(p.name), [p.name]);

  let statusBadge = (
    <span className="px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-xs">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      <span>متوفر</span>
    </span>
  );

  if (branchStock <= 0 && octoberStock > 0) {
    statusBadge = (
      <span className="px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shadow-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span>محدود</span>
      </span>
    );
  } else if (branchStock <= 0 && octoberStock <= 0) {
    statusBadge = (
      <span className="px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-xs">
        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
        <span>نفد جزئياً</span>
      </span>
    );
  }

  const isOutOfStock = branchStock <= 0 && octoberStock <= 0;
  // حالة الصنف بنفس منطق الكروت: متوفر في الفرع / محدود (في أكتوبر فقط) / نافد
  const stockTone = isOutOfStock ? 'risk' : branchStock > 0 ? 'ok' : 'warn';

  const handleImageClick = useCallback(() => {
    const img = getProductImageUrl(p, cloudinaryConfig);
    if (img && !img.startsWith('data:image/svg+xml')) {
      onSelectProduct(p);
    }
  }, [p, cloudinaryConfig, onSelectProduct]);

  return (
    <div
      data-tone={stockTone}
      className={`cat-card sc-card group tg-card tg-card--hover flex flex-col justify-between gap-3 p-3.5 select-none ${
        promoInfo.hasPromo ? 'ring-1 ring-amber-400/70' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="shrink-0">{statusBadge}</span>
          {isElectrical ? (
            <span className="hidden sm:inline-flex shrink-0 whitespace-nowrap rounded-lg border border-[#BFDBFE] bg-[var(--app-primary-tint)] px-2 py-0.5 text-[10px] font-black text-[var(--app-primary-text)] dark:border-[#3B82F6]/40 dark:bg-[#1E3A8A]/25 dark:text-[#93C5FD]">
              ⚡ كهرباء
            </span>
          ) : (
            <span className="hidden sm:inline-flex shrink-0 whitespace-nowrap rounded-lg border border-[#99F6E4] bg-[#F0FDFA] px-2 py-0.5 text-[10px] font-black text-[#0F766E] dark:border-[#2DD4BF]/40 dark:bg-[#0D9488]/15 dark:text-[#5EEAD4]">
              🏠 منزلي
            </span>
          )}
          {promoInfo.hasPromo && (
            <span className="tg-special-discount-badge shrink-0">
              <Flame className="w-3 h-3" />
              خصم خاص -{promoInfo.discountPercentage}%
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggleFavorite(p.id)}
          aria-label="إضافة للمفضلة"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition ${
            isFav
              ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40'
              : 'border-slate-200 bg-white text-slate-400 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-600' : ''}`} />
        </button>
      </div>

      <div
        className="flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-[14px] bg-white transition-transform duration-200 group-hover:scale-[1.01]"
        onClick={handleImageClick}
      >
        <ProductImage
          product={p}
          cloudinaryConfig={cloudinaryConfig}
          targetSize={280}
          sizeVariant="card"
          containerClassName="w-full h-full flex items-center justify-center"
          className="max-h-full max-w-full object-contain"
        />
      </div>

      <div className="space-y-1 text-center">
        <div className="text-[10px] font-bold leading-tight text-slate-500 dark:text-slate-400">
          {stripPlaceholderText(p.department) || stripPlaceholderText(p.itemGroup) || 'عام'}
          {stripPlaceholderText(p.familyName) ? ` • ${stripPlaceholderText(p.familyName)}` : ''}
        </div>
        <h3
          onClick={() => onSelectProduct(p)}
          className="min-h-[38px] cursor-pointer text-sm font-black leading-snug text-slate-900 transition hover:text-[#2563eb] dark:text-white"
          title={displayName}
        >
          {displayName || `صنف ${p.code}`}
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
          {promoInfo.hasPromo && promoInfo.promoCartonPrice > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {promoInfo.originalCartonPrice > promoInfo.promoCartonPrice && (
                <span className="text-[11px] font-bold line-through text-slate-400">
                  {formatCurrency(promoInfo.originalCartonPrice)}
                </span>
              )}
              <span className="text-sm font-black text-[#047857] dark:text-emerald-400">
                {formatCurrency(promoInfo.promoCartonPrice)}
                <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">/ {priceInfo.unitLabel}</span>
              </span>
            </div>
          ) : priceInfo.displayPrice > 0 ? (
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {formatCurrency(priceInfo.displayPrice)}
              <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">/ {priceInfo.unitLabel}</span>
            </span>
          ) : (
            '—'
          )}
          {priceInfo.factor > 1 ? (
            <span className="rounded-md border border-[#bfdbfe] bg-[var(--app-primary-tint)] px-2 py-0.5 text-[10px] font-black text-[var(--app-primary-text)]">
              {priceInfo.factor} ق/ك
            </span>
          ) : null}
          {stripPlaceholderText(p.size) && (
            <span className="text-[10px] text-slate-400">({stripPlaceholderText(p.size)})</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <span className="mb-0.5 block text-[10px] font-bold text-slate-400">الكود الموحد</span>
          <span className="tg-num block truncate font-mono text-xs font-black text-[var(--app-primary-text)]" title={p.unifiedCode}>
            {p.unifiedCode ? (p.unifiedCode.startsWith('#') ? p.unifiedCode : `#${p.unifiedCode}`) : '—'}
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <span className="mb-0.5 block text-[10px] font-bold text-slate-400">كود العميل</span>
          <span className="tg-num block truncate font-mono text-xs font-black text-slate-900" title={p.code}>
            {p.code || '—'}
          </span>
        </div>
      </div>

      {showAllWarehouses ? (
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="mb-1 flex items-center justify-between text-[10px] font-black text-slate-500 dark:text-slate-400">
            <span>🏢 أرصدة المخازن</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {COMPANY_WAREHOUSES.map((wh) => {
              const stock = getWarehouseStock(p, wh.key);
              return (
                <div
                  key={wh.key}
                  className={`rounded-xl border p-1 text-[10px] ${
                    stock > 0
                      ? 'border-[#0B1220] bg-[#0B1220] text-white font-bold dark:border-slate-600 dark:bg-[#0B1220] dark:text-white'
                      : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <div className="truncate text-[9px]">{wh.shortLabel}</div>
                  <div className="font-mono text-xs font-black">{stock}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="sc-rows sc-rows--2">
          <div className={`sc-cell ${octoberStock > 0 ? 'sc-row--collect' : 'sc-row--clear'}`}>
            <div className="sc-cell__label">
              <span className={`sc-icon ${octoberStock > 0 ? 'sc-icon--collect' : 'sc-icon--clear'}`}>
                <Calendar className="h-3.5 w-3.5" />
              </span>
              <span>مخزون أكتوبر</span>
            </div>
            <div className={`sc-cell__value ${octoberStock > 0 ? 'sc-cell__value--money' : 'sc-cell__value--muted'}`}>
              {octoberStock}
            </div>
          </div>
          <div className={`sc-cell ${branchStock > 0 ? 'sc-row--collect' : 'sc-row--debt'}`}>
            <div className="sc-cell__label">
              <span className={`sc-icon ${branchStock > 0 ? 'sc-icon--collect' : 'sc-icon--debt'}`}>
                <Store className="h-3.5 w-3.5" />
              </span>
              <span>مخزون الفرع</span>
            </div>
            <div className={`sc-cell__value ${branchStock > 0 ? 'sc-cell__value--money' : 'sc-cell__value--muted'}`}>
              {branchStock}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => onAddToCart(p)}
            className="sc-btn sc-btn--primary min-h-[46px] flex-1 px-3 py-2.5 text-xs font-black active:scale-[0.98]"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>إضافة للفاتورة</span>
          </button>

          <div className="tg-num flex min-h-[46px] w-[110px] shrink-0 items-center justify-between overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => onQtyChange(p.id, 1)}
              className="flex h-full w-10 items-center justify-center text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="زيادة الكمية"
            >
              +
            </button>
            <span className="flex-1 text-center text-xs font-black text-slate-900 dark:text-white font-mono">
              {currentQty}
            </span>
            <button
              type="button"
              onClick={() => onQtyChange(p.id, -1)}
              className="flex h-full w-10 items-center justify-center text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="تقليل الكمية"
            >
              -
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

ProductCard.displayName = 'ProductCard';
