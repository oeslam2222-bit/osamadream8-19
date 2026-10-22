import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Layers,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Warehouse,
  X
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ParentProduct, Product } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { extractBaseProductCode } from '../services/productVariantService';
import { getBranchStockForProduct } from '../services/arabicMatchingService';
import { ProductImage } from './ProductImage';

interface ProductCodeInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productCode: string;
  parentProduct?: ParentProduct | null;
  onOpenCart?: () => void;
  isConfidentialMode?: boolean;
}

/**
 * Extracts size from product.size or heuristically from product name if empty
 */
function extractSizeInfo(product: Product): string {
  const explicitSize = (product.size || '').trim();
  if (
    explicitSize &&
    explicitSize !== '-' &&
    explicitSize !== '---' &&
    !explicitSize.toLowerCase().includes('blank') &&
    explicitSize !== '0' &&
    explicitSize !== 'غير محدد'
  ) {
    return explicitSize;
  }

  // Look for size patterns in product name (e.g., مقاس 24، 28سم، 5 لتر، 500 مل، كبير، وسط، صغير)
  const name = product.name || '';
  const sizePatterns = [
    /مقاس\s*([0-9]+(?:\.[0-9]+)?(?:\s*(?:سم|cm|مم|mm))?)/i,
    /([0-9]+(?:\.[0-9]+)?\s*(?:سم|cm|مم|mm|بوصة|إنش))/i,
    /([0-9]+(?:\.[0-9]+)?\s*(?:لتر|مل|كيلو|كجم|جم|جرام|kg|g|ml|l))/i,
    /\b(كبير|صغير|وسط|جامبو|عائلي|ميني|ضخم|طويل|قصير|مزدوج|فردي)\b/i,
    /حجم\s*([أ-ي0-9a-zA-Z]+)/i,
  ];

  for (const pattern of sizePatterns) {
    const match = name.match(pattern);
    if (match && match[0]) {
      return match[0].trim();
    }
  }

  return 'غير محدد بالشيت';
}

/**
 * Extracts color from product.color or heuristically from product name/code if empty
 */
function extractColorInfo(product: Product): string {
  const explicitColor = (product.color || '').trim();
  if (
    explicitColor &&
    explicitColor !== '-' &&
    explicitColor !== '---' &&
    !explicitColor.toLowerCase().includes('blank') &&
    explicitColor !== '0' &&
    explicitColor !== 'عام' &&
    explicitColor !== 'غير محدد'
  ) {
    return explicitColor;
  }

  const combined = `${product.name} ${product.code || ''} ${product.unifiedCode || ''}`;
  const knownColors = [
    'أحمر', 'ازرق', 'أزرق', 'أخضر', 'اخضر', 'أصفر', 'اصفر', 'أسود', 'اسود',
    'أبيض', 'ابيض', 'ذهبي', 'فضي', 'بني', 'وردي', 'رمادي', 'كحلي', 'بيج',
    'عسلي', 'موف', 'برتقالي', 'نبيتي', 'تركواز', 'سماوي', 'بترولي', 'ليموني',
    'red', 'blue', 'green', 'yellow', 'black', 'white', 'gold', 'silver'
  ];

  for (const c of knownColors) {
    if (combined.includes(c)) {
      return c;
    }
  }

  return 'غير محدد بالشيت';
}

export const ProductCodeInspectorModal: React.FC<ProductCodeInspectorModalProps> = ({
  isOpen,
  onClose,
  productCode,
  parentProduct,
  onOpenCart,
  isConfidentialMode = false,
}) => {
  const {
    products,
    branches,
    currentUser,
    selectedBranchFilter,
    addToCart,
    cart,
    cloudinaryConfig,
  } = useApp();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Active branch context
  const activeBranchName = useMemo(() => {
    if (selectedBranchFilter && selectedBranchFilter !== 'الكل') {
      return selectedBranchFilter;
    }
    return currentUser?.branchName || 'فرع القاهرة';
  }, [selectedBranchFilter, currentUser]);

  // Find all occurrences / rows matching this base code or specific code in the sheet
  const matchingItems = useMemo(() => {
    const targetCode = productCode && productCode !== '---' && productCode !== '--'
      ? productCode
      : (parentProduct?.primaryCode && parentProduct.primaryCode !== '---' ? parentProduct.primaryCode : '');

    const cleanTarget = extractBaseProductCode(targetCode).trim().toLowerCase();
    const rawTarget = targetCode.trim().toLowerCase();

    // Map by unique product ID to prevent duplicates in our display
    const resultMap = new Map<string, Product>();

    // 1. Direct variants from parent if provided
    if (parentProduct && parentProduct.variants) {
      parentProduct.variants.forEach((v) => {
        if (v.rawProduct) {
          resultMap.set(v.rawProduct.id, v.rawProduct);
        }
      });
    }

    // 2. Search entire products array for matching code or base code
    products.forEach((p) => {
      const pCode = (p.code || '').trim().toLowerCase();
      const pBase = extractBaseProductCode(p.code).trim().toLowerCase();
      const pUnified = (p.unifiedCode || '').trim().toLowerCase();

      if (
        (cleanTarget && pBase === cleanTarget) ||
        (rawTarget && pCode === rawTarget) ||
        (cleanTarget && pCode === cleanTarget) ||
        (rawTarget && pUnified === rawTarget) ||
        (cleanTarget && pCode.startsWith(cleanTarget))
      ) {
        resultMap.set(p.id, p);
      }
    });

    const items = Array.from(resultMap.values());

    // Sort: Available items first, ordered by active branch stock, then October stock
    items.sort((a, b) => {
      const bStockA = getBranchStockForProduct(a, activeBranchName);
      const oStockA = a.mainWarehouseActual || 0;
      const bStockB = getBranchStockForProduct(b, activeBranchName);
      const oStockB = b.mainWarehouseActual || 0;

      const availA = (bStockA > 0 || oStockA > 0) ? 1 : 0;
      const availB = (bStockB > 0 || oStockB > 0) ? 1 : 0;

      if (availB !== availA) return availB - availA; // Available first
      if (bStockB !== bStockA) return bStockB - bStockA; // Higher branch stock first
      return oStockB - oStockA; // Higher October stock next
    });

    return items;
  }, [productCode, parentProduct, products, activeBranchName]);

  const count = matchingItems.length;
  const isRepeated = count > 1;

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDirectAdd = (prod: Product, type: 'carton' | 'piece') => {
    const res = addToCart(prod, type, type === 'carton' ? 1 : 0, type === 'piece' ? 1 : 0);
    if (res.success) {
      setSuccessNotice(`تمت إضافة 1 ${type === 'carton' ? 'كرتونة' : 'قطعة'} من (${prod.name}) إلى السلة بنجاح!`);
      setTimeout(() => setSuccessNotice(null), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-amber-300 font-bold">فحص دقيق لكود الصنف في الشيت:</span>
                  <span className="font-mono bg-slate-800 text-white px-2.5 py-0.5 rounded-lg text-sm font-black border border-slate-700">
                    {productCode}
                  </span>
                  {extractBaseProductCode(productCode) !== productCode && (
                    <span className="text-slate-400 text-xs font-mono">
                      (الأساسي: {extractBaseProductCode(productCode)})
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                  بيانات التكرار والكود الموحد والألوان والأحجام في الشيت
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenCart && cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCart();
                  }}
                  className="hidden sm:flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black shadow transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>السلة ({cart.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Success Notice */}
          {successNotice && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-3 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successNotice}</span>
              </div>
              {onOpenCart && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCart();
                  }}
                  className="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-black hover:bg-emerald-700 cursor-pointer"
                >
                  عرض السلة ⬅️
                </button>
              )}
            </div>
          )}

          {/* Duplication Status Banner */}
          <div
            className={`p-4 rounded-2xl border-2 flex items-start gap-3 shadow-xs ${
              isRepeated
                ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                : 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 font-black ${
                isRepeated ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600 text-white'
              }`}
            >
              {isRepeated ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm sm:text-base">
                  {isRepeated
                    ? `⚠️ نعم، الكود (${productCode}) مكرر في الشيت (${count} مرات)`
                    : `✅ كود فريد: الكود (${productCode}) غير مكرر في الشيت (صنف وحيد)`}
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                    isRepeated ? 'bg-amber-200 text-amber-950' : 'bg-emerald-200 text-emerald-900'
                  }`}
                >
                  {isRepeated ? `${count} صفوف مسجلة` : 'صف واحد فقط'}
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed text-slate-700">
                {isRepeated
                  ? `هذا الصنف مسجل في شيت الإكسل بأكثر من سطر (${count} تفريعات)، ولكل سطر كود موحد أو لون أو حجم مختلف أو مخزون مستقل. جميع التفاصيل معروضة بالجدول أدناه:`
                  : `هذا الكود مسجل لصف واحد فقط في الشيت، ولا توجد أي ألوان أو أحجام أو أكواد موحدة أخرى مسجلة تحت نفس الكود.`}
              </p>
            </div>
          </div>

          {/* Active Branch Indicator */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-700">
            <div className="flex items-center gap-1.5 font-bold">
              <Building2 className="w-4 h-4 text-amber-600" />
              <span>الفرع النشط لعرض الكميات:</span>
              <span className="text-amber-900 font-black">{activeBranchName}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              يتم احتساب الكمية المتاحة بالكرتونة لكل تفريعة
            </span>
          </div>

          {/* List of Occurrences / Variants in Sheet */}
          <div className="space-y-3">
            <h4 className="font-black text-xs sm:text-sm text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>بيانات كافة الصفوف المسجلة في الشيت لهذا الكود ({count}):</span>
            </h4>

            <div className="grid grid-cols-1 gap-3">
              {matchingItems.map((prod, index) => {
                const colorVal = extractColorInfo(prod);
                const sizeVal = extractSizeInfo(prod);
                const unifiedVal = prod.unifiedCode || prod.barcode || '---';
                const branchStock = getBranchStockForProduct(prod, activeBranchName);
                const octoberStock = prod.mainWarehouseActual || 0;
                const totalStock = branchStock + octoberStock;
                const cartonPrice = prod.cartonPrice || 0;
                const piecePrice = prod.piecePrice || prod.salesPrice || 0;
                const factor = prod.cartonQuantity || 1;

                const isVInCart = cart.some((c) => c.product.id === prod.id);

                return (
                  <div
                    key={prod.id}
                    className="bg-white rounded-2xl border-2 border-slate-200 hover:border-amber-400 p-4 shadow-2xs transition-all space-y-3"
                  >
                    {/* Top Row: Title, Codes & Actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                          <ProductImage
                            product={prod}
                            cloudinaryConfig={cloudinaryConfig}
                            targetSize={100}
                            sizeVariant="thumbnail"
                            containerClassName="w-full h-full"
                            className="w-full h-full object-contain"
                            showBadgeOnFallback={false}
                          />
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-slate-900 text-white font-mono text-xs font-black px-2 py-0.5 rounded-md">
                              تكرار #{index + 1}
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              كود الصنف: {prod.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(prod.code, `code-${prod.id}`)}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="نسخ كود الصنف"
                            >
                              {copiedKey === `code-${prod.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <h5 className="font-black text-sm text-slate-900 mt-1 leading-snug">
                            {prod.name}
                          </h5>
                        </div>
                      </div>

                      {/* Add to Cart Actions */}
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => handleDirectAdd(prod, 'carton')}
                          disabled={totalStock <= 0}
                          className="bg-amber-400 hover:bg-amber-500 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة كرتونة</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDirectAdd(prod, 'piece')}
                          disabled={totalStock <= 0}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة قطعة</span>
                        </button>
                      </div>
                    </div>

                    {/* Detailed Attributes Grid: Requested by User */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      {/* 1. الكود الموحد */}
                      <div className="bg-blue-50/80 border border-blue-200 p-2.5 rounded-xl">
                        <span className="text-[10px] text-blue-700 font-bold block mb-0.5">
                          الكود الموحد:
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-blue-950 text-xs truncate">
                            {unifiedVal}
                          </span>
                          {unifiedVal !== '---' && (
                            <button
                              type="button"
                              onClick={() => handleCopy(unifiedVal, `uni-${prod.id}`)}
                              className="text-blue-500 hover:text-blue-800 cursor-pointer ml-1"
                              title="نسخ الكود الموحد"
                            >
                              {copiedKey === `uni-${prod.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 2. اللون */}
                      <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl">
                        <span className="text-[10px] text-amber-700 font-bold block mb-0.5">
                          اللون (لو مكتوب):
                        </span>
                        <span
                          className={`font-black text-xs ${
                            colorVal !== 'غير محدد بالشيت' ? 'text-amber-950' : 'text-slate-400'
                          }`}
                        >
                          {colorVal}
                        </span>
                      </div>

                      {/* 3. الحجم */}
                      <div className="bg-purple-50/80 border border-purple-200 p-2.5 rounded-xl">
                        <span className="text-[10px] text-purple-700 font-bold block mb-0.5">
                          الحجم (لو مكتوب):
                        </span>
                        <span
                          className={`font-black text-xs ${
                            sizeVal !== 'غير محدد بالشيت' ? 'text-purple-950' : 'text-slate-400'
                          }`}
                        >
                          {sizeVal}
                        </span>
                      </div>

                      {/* 4. الكمية بالفرع والرئيسي */}
                      <div className="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-xl">
                        <span className="text-[10px] text-emerald-700 font-bold block mb-0.5">
                          الكمية المتاحة:
                        </span>
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-black text-emerald-900 text-xs">
                            الفرع: {branchStock} ك
                          </span>
                          <span className="text-[10.5px] text-slate-500">
                            (أكتوبر: {octoberStock} ك)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Secondary details: Factor, Pricing */}
                    <div className="flex items-center justify-between text-[11px] bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600">
                      <div>
                        الشدة (Factor): <strong className="text-slate-900">{factor} قطعة بالكرتونة</strong>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>
                          سعر الكرتونة:{' '}
                          <strong className="text-amber-900 font-mono">
                            {isConfidentialMode ? '••••••' : formatCurrency(cartonPrice)}
                          </strong>
                        </span>
                        <span>
                          سعر القطعة:{' '}
                          <strong className="text-slate-900 font-mono">
                            {isConfidentialMode ? '••••' : formatCurrency(piecePrice)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs shrink-0">
          <div className="text-slate-500 font-medium">
            إجمالي التكرارات في الشيت: <strong className="text-slate-900">{count}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
