import {
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  Layers,
  MapPin,
  Maximize2,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Warehouse,
  X,
  ZoomIn
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { ParentProduct, ProductVariant } from '../types';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { getHighResVariantImageUrl } from '../services/productVariantService';
import { getBranchStockForProduct } from '../services/arabicMatchingService';
import { ProductImage } from './ProductImage';

interface ProductVariantModalProps {
  parentProduct: ParentProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCart?: () => void;
  isConfidentialMode?: boolean;
}

export const ProductVariantModal: React.FC<ProductVariantModalProps> = ({
  parentProduct,
  isOpen,
  onClose,
  onOpenCart,
  isConfidentialMode = false,
}) => {
  const { addToCart, cart, branches, currentUser } = useApp();
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const [activeVariant, setActiveVariant] = useState<ProductVariant | null>(null);
  const [orderType, setOrderType] = useState<'carton' | 'piece'>('carton');
  const [quantity, setQuantity] = useState<number>(1);
  const [piecesCount, setPiecesCount] = useState<number>(0);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [showAllBranchesStock, setShowAllBranchesStock] = useState(true);
  // Tabs keep the three long blocks from stacking into one dense scroll.
  const [activeTab, setActiveTab] = useState<'main' | 'stock' | 'matrix'>('main');
  const tabOrder: Array<'main' | 'stock' | 'matrix'> = ['main', 'stock', 'matrix'];

  const handleTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const idx = tabOrder.indexOf(activeTab);
    setActiveTab(tabOrder[(idx + step + tabOrder.length) % tabOrder.length]);
  };

  // Close the zoom with Escape — the lightbox covers the modal, so the usual
  // close button is not reachable while it is open.
  useEffect(() => {
    if (!isImageZoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsImageZoomed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isImageZoomed]);

  // Sync active variant when modal opens
  useEffect(() => {
    if (parentProduct && parentProduct.variants.length > 0) {
      // Default to defaultVariant or first variant
      setActiveVariant(parentProduct.defaultVariant || parentProduct.variants[0]);
      setQuantity(1);
      setPiecesCount(0);
      setSuccessNotice(null);
      setStockError(null);
      setIsImageZoomed(false);
    }
  }, [parentProduct]);

  // Every hook below must run on every render, including while the modal is
  // closed, so the "nothing to show" exit has to sit at the very end of the
  // component. Returning early above these useMemo calls made the hook count
  // change between renders, which is React error #310.
  const rawProd = activeVariant?.rawProduct;
  const cartonQty = rawProd && rawProd.cartonQuantity && rawProd.cartonQuantity > 0 ? rawProd.cartonQuantity : 1;
  
  // Stock calculations
  const branchStock = rawProd?.branchStockActual || 0;
  const branchReserved = rawProd?.branchStockReserved || 0;
  const octoberStock = rawProd?.mainWarehouseActual || 0;
  const totalStockAvailable = branchStock + octoberStock;

  // Multi-branch inventory for this active variant
  const branchInventoryList = useMemo(() => {
    if (!rawProd) return [];
    const defaultBranchDefs = [
      { name: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', shortName: 'الفرع الرئيسي (أكتوبر)', city: '6 أكتوبر / الجيزة', isMain: true },
      { name: 'فرع القاهرة', shortName: 'القاهرة', city: 'القاهرة', isMain: false },
      { name: 'فرع الفيوم', shortName: 'الفيوم', city: 'الفيوم', isMain: false },
      { name: 'فرع المنيا', shortName: 'المنيا', city: 'المنيا', isMain: false },
      { name: 'فرع ديمشلت', shortName: 'ديمشلت', city: 'الدقهلية', isMain: false },
      { name: 'فرع البحيرة', shortName: 'البحيرة', city: 'البحيرة', isMain: false },
      { name: 'فرع منوف', shortName: 'منوف', city: 'المنوفية', isMain: false },
      { name: 'فرع منيا القمح', shortName: 'منيا القمح', city: 'الشرقية', isMain: false },
    ];

    const branchList = (branches && branches.length > 0)
      ? branches.map(b => ({
          name: b.name,
          shortName: b.name.replace('فرع ', '').replace('الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', 'المخزن الرئيسي (أكتوبر)'),
          city: b.city || '',
          isMain: Boolean(b.isMainWarehouse || b.name.includes('الرئيسي') || b.name.includes('أكتوبر')),
        }))
      : defaultBranchDefs;

    return branchList.map(b => {
      const stock = getBranchStockForProduct(rawProd, b.name);
      return {
        ...b,
        stock,
      };
    });
  }, [branches, rawProd]);

  const totalBranchesStockOnly = useMemo(() => {
    return branchInventoryList.filter(b => !b.isMain).reduce((acc, b) => acc + (b.stock || 0), 0);
  }, [branchInventoryList]);

  const mainWarehouseStock = useMemo(() => {
    if (!rawProd) return 0;
    const mainItem = branchInventoryList.find(b => b.isMain);
    return mainItem ? mainItem.stock : (rawProd.mainWarehouseActual || 0);
  }, [branchInventoryList, rawProd]);

  const grandTotalAllWarehouses = totalBranchesStockOnly + mainWarehouseStock;

  // Check how many units of this variant are already in cart
  const itemInCart = rawProd ? cart.find((item) => item.product.id === rawProd.id) : undefined;
  const cartCartons = itemInCart?.cartonCount || 0;
  const cartPieces = itemInCart?.pieceCount || 0;

  const handleSelectVariant = (variant: ProductVariant) => {
    setActiveVariant(variant);
    setStockError(null);
    setSuccessNotice(null);
  };

  const handleAddToCart = () => {
    if (!rawProd || !activeVariant) return;
    setStockError(null);
    const res = addToCart(
      rawProd,
      orderType,
      orderType === 'carton' ? quantity : 0,
      orderType === 'piece' ? quantity : piecesCount
    );

    if (res.success) {
      const qDesc = orderType === 'carton' ? `${quantity} كرتونة` : `${quantity} قطعة`;
      setSuccessNotice(`تمت إضافة (${activeVariant.name} - ${qDesc}) إلى السلة بنجاح!`);
      setTimeout(() => setSuccessNotice(null), 3500);
    } else {
      setStockError(res.message || 'تعذر إضافة الصنف للسلة');
    }
  };

  const appliedPrice = activeVariant?.promoPrice && activeVariant.promoPrice > 0
    ? activeVariant.promoPrice
    : (activeVariant?.cartonPrice || 0);

  const currentPiecePrice = activeVariant?.piecePrice || (cartonQty > 0 ? Math.round((appliedPrice / cartonQty) * 100) / 100 : appliedPrice);

  // Safe to bail out only now — all hooks above have already run this render.
  if (!isOpen || !parentProduct || !activeVariant) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        dir="rtl"
      >
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-sm shadow-md shrink-0 mt-0.5">
                <Boxes className="w-6 h-6" />
              </div>
              <div className="min-w-0 space-y-1">
                {/* Code Badges Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center bg-slate-800/90 rounded-lg px-2.5 py-0.5 border border-slate-700 text-xs">
                    <span className="text-slate-400 text-[11px] ml-1 font-medium">كود الصنف:</span>
                    <span className="font-mono font-black text-white">{parentProduct.primaryCode}</span>
                  </div>

                  {(activeVariant.unifiedCode || activeVariant.rawProduct?.unifiedCode || parentProduct.unifiedCode) && (
                    <div className="flex items-center bg-blue-950/90 text-blue-200 rounded-lg px-2.5 py-0.5 border border-blue-600/40 text-xs font-bold font-mono shadow-xs">
                      <span className="text-blue-300 text-[11px] ml-1 font-sans">الكود الموحد:</span>
                      <span className="text-amber-300 font-black">
                        {activeVariant.unifiedCode || activeVariant.rawProduct?.unifiedCode || parentProduct.unifiedCode}
                      </span>
                    </div>
                  )}

                  {activeVariant.color && activeVariant.color !== '---' && !activeVariant.color.toLowerCase().includes('blank') && (
                    <div className="flex items-center bg-amber-500/20 text-amber-300 rounded-lg px-2.5 py-0.5 border border-amber-500/30 text-xs font-bold shadow-xs">
                      <span>اللون: {activeVariant.color}</span>
                    </div>
                  )}

                  <span className="text-xs text-slate-400 font-bold hidden sm:inline">
                    {parentProduct.department} {parentProduct.classification ? `• ${parentProduct.classification}` : ''}
                  </span>
                </div>

                {/* Product Name */}
                <h2 className="text-base sm:text-xl font-black text-amber-400 leading-tight">
                  {parentProduct.name}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                aria-label="إغلاق النافذة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Notifications */}
          {successNotice && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-3 sm:p-4 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
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
                  الذهاب للسلة ⬅️
                </button>
              )}
            </div>
          )}

          {stockError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <X className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{stockError}</span>
            </div>
          )}

          {/* Tabs — the three long blocks used to stack into one dense column */}
          <div role="tablist" onKeyDown={handleTabKey} className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0">
            {(
              [
                { key: 'main', label: 'الرئيسية', icon: Sparkles, badge: '' },
                { key: 'stock', label: 'المخزون بالفروع', icon: Building2, badge: `${branchInventoryList.length} مخزن` },
                { key: 'matrix', label: 'جدول الشبابيك', icon: Layers, badge: `${parentProduct.variants.length}` },
              ] as const
            ).map(({ key, label, icon: Icon, badge }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(key)}
                  tabIndex={isActive ? 0 : -1}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-700' : 'text-slate-400'}`} />
                  <span className="truncate">{label}</span>
                  {badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                      isActive ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === 'main' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            
            {/* Column 1: Eye-Friendly High-Res Image Display */}
            <div className="md:col-span-5 space-y-3">
              <div
                role="button"
                tabIndex={0}
                aria-label="تكبير صورة المنتج"
                onClick={() => setIsImageZoomed(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsImageZoomed(true);
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsImageZoomed(true);
                }}
                className="relative bg-slate-50 border-2 border-slate-200 rounded-3xl overflow-hidden shadow-inner flex items-center justify-center min-h-[280px] sm:min-h-[340px] group cursor-zoom-in"
              >
                <ProductImage
                  product={rawProd}
                  alt={`${parentProduct.name} - ${activeVariant.name}`}
                  className="w-full h-full object-contain max-h-[360px] p-3 transition-transform duration-300 group-hover:scale-105"
                />

                {/* Window Badge Overlay */}
                <div className="absolute top-3 right-3 bg-slate-900/90 text-white font-black text-xs px-3 py-1.5 rounded-xl shadow-lg border border-slate-700 backdrop-blur-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span>{activeVariant.name}</span>
                </div>

                {/* Zoom / Lightbox Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsImageZoomed(true);
                  }}
                  className="absolute bottom-3 left-3 bg-white/90 hover:bg-white text-slate-800 p-2 rounded-xl shadow-md border border-slate-200 transition cursor-pointer"
                  title="تكبير الصورة بحجم كامل"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                {activeVariant.promoPrice && activeVariant.promoPrice > 0 && (
                  <div className="absolute top-3 left-3 bg-rose-600 text-white font-black text-xs px-2.5 py-1 rounded-xl shadow-md flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    <span>عرض ترويجي</span>
                  </div>
                )}
              </div>

              {/* Window Thumbnails Strip for Quick Image Browsing */}
              {parentProduct.variants.length > 1 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center justify-between">
                    <span>صور ومعاينات الشبابيك ({parentProduct.variants.length})</span>
                    <span className="text-slate-400 text-[10px]">اضغط للاختيار • دبل كليك للتكبير</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {parentProduct.variants.map((v) => {
                      const isSelected = activeVariant.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleSelectVariant(v)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            setActiveVariant(v);
                            setIsImageZoomed(true);
                          }}
                          className={`w-14 h-14 rounded-xl border-2 p-1 flex-shrink-0 transition bg-white overflow-hidden cursor-pointer relative ${
                            isSelected
                              ? 'border-amber-500 shadow-md ring-2 ring-amber-400/40'
                              : 'border-slate-200 hover:border-slate-300 opacity-75 hover:opacity-100'
                          }`}
                          title={`${v.name} — اضغط للاختيار، دبل كليك للتكبير`}
                        >
                          <ProductImage
                            product={v.rawProduct}
                            alt={v.name}
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] font-black text-white text-center py-0.5 truncate">
                            {v.name.replace('شباك', 'ش')}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Windows / Variants Interactive Controls & Cart Actions */}
            <div className="md:col-span-7 space-y-4">
              
              {/* 1. Interactive Windows / Colors Selector Buttons */}
              <div className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/90 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>اختر الشباك أو اللون المطلوب:</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                    متوفر {parentProduct.variants.length} خيارات
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {parentProduct.variants.map((variant) => {
                    const isSelected = activeVariant.id === variant.id;
                    const vBranchStock = variant.branchStockActual || 0;
                    const vOctStock = variant.mainWarehouseActual || 0;
                    const vTotalStock = vBranchStock + vOctStock;
                    const inCart = cart.find((i) => i.product.id === variant.rawProduct.id);
                    const cleanColorName = (variant.color || '').replace(/\(blank\)/gi, '').replace(/blank/gi, '').trim();
                    const displayName = variant.name.replace(/\(blank\)/gi, '').replace(/blank/gi, '').trim() || `شباك ${variant.windowNumber || 1}`;

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => handleSelectVariant(variant)}
                        className={`p-2.5 rounded-xl border-2 text-right transition cursor-pointer relative flex flex-col justify-between min-h-[72px] ${
                          isSelected
                            ? 'bg-amber-400 border-slate-950 text-slate-950 shadow-md scale-[1.02] ring-2 ring-amber-400/50'
                            : 'bg-white border-slate-200 hover:border-amber-300 text-slate-800 hover:bg-amber-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-black text-xs truncate">
                            {displayName}
                          </span>
                          {inCart && (
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0 shadow-xs" title="موجود بالسلة">
                              ✓
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between w-full mt-2 text-[10px]">
                          <span className="font-mono text-slate-700 font-bold truncate max-w-[95px]">
                            {variant.unifiedCode || variant.rawProduct?.unifiedCode || variant.code}
                          </span>
                          <span
                            className={`font-black font-mono px-1.5 py-0.5 rounded-md text-[10px] shrink-0 ${
                              vTotalStock > 0
                                ? isSelected
                                  ? 'bg-slate-950 text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {vTotalStock > 0 ? `${vTotalStock} ك` : 'منتهي'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Selected Window Details & Stock Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold block">الشباك المحدد حالياً:</span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-sm font-black text-slate-950 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                        <span>{activeVariant.name.replace(/\(blank\)/gi, '').replace(/blank/gi, '').trim() || `شباك ${activeVariant.windowNumber || 1}`}</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        كود: {activeVariant.code}
                      </span>
                      {(activeVariant.unifiedCode || activeVariant.rawProduct?.unifiedCode) && (
                        <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          موحد: {activeVariant.unifiedCode || activeVariant.rawProduct?.unifiedCode}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold block">شدة الكرتونة:</span>
                    <span className="text-xs font-black text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      {cartonQty} قطعة / كرتونة
                    </span>
                  </div>
                </div>

                {/* Pricing Box - Sleek Gold & Slate Theme */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white shadow-inner">
                  <div>
                    <span className="text-[10px] text-amber-300/80 block font-bold">سعر الكرتونة</span>
                    <div className="text-xl font-black text-amber-400 font-mono">
                      {isConfidentialMode ? '••••••' : formatCurrency(appliedPrice)}
                    </div>
                  </div>

                  <div className="text-center px-4 border-x border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-bold">سعر القطعة (في الشيت)</span>
                    <div className="text-base font-black text-slate-100 font-mono">
                      {isConfidentialMode ? '••••' : formatCurrency(currentPiecePrice)}
                    </div>
                    <span className="text-[9px] text-slate-400">× شدة {cartonQty} = الكرتونة</span>
                  </div>

                  {activeVariant.promoPrice && activeVariant.promoPrice > 0 ? (
                    <div className="text-left">
                      <span className="text-[10px] text-rose-300 block font-bold">عرض خاص</span>
                      <div className="text-xs font-black text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
                        خصم ترويجي
                      </div>
                    </div>
                  ) : (
                    <div className="text-left text-xs font-bold text-slate-400">
                      <span className="text-[10px] block">الرصيد المتاح</span>
                      <span className="text-emerald-400 font-black font-mono">{totalStockAvailable} ك</span>
                    </div>
                  )}
                </div>

                {/* In Cart Indicator */}
                {cartCartons > 0 || cartPieces > 0 ? (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>مضاف في السلة حالياً من هذا الشباك:</span>
                    </div>
                    <span className="font-black text-emerald-700 font-mono">
                      {cartCartons > 0 && `${cartCartons} كرتونة `}
                      {cartPieces > 0 && `${cartPieces} قطعة`}
                    </span>
                  </div>
                ) : null}

                {/* 3. Quantity Stepper & Order Controls */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    {/* Unit Switcher */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setOrderType('carton')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          orderType === 'carton'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                            : 'text-slate-600 hover:text-slate-950'
                        }`}
                      >
                        📦 بالكرتونة
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('piece')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          orderType === 'piece'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                            : 'text-slate-600 hover:text-slate-950'
                        }`}
                      >
                        🏷️ بالقطعة
                      </button>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center bg-slate-100 rounded-xl border border-slate-300 p-0.5">
                      <button
                        type="button"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-9 h-9 flex items-center justify-center text-slate-800 active:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
                        title="إنقاص (-1)"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-14 h-9 text-center font-black text-sm text-slate-950 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />

                      <button
                        type="button"
                        onClick={() => setQuantity(quantity + 1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-800 active:bg-slate-200 rounded-lg font-black cursor-pointer"
                        title="زيادة (+1)"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Add Presets */}
                    <div className="hidden sm:flex items-center gap-1">
                      {[5, 10, 20].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setQuantity(num)}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                        >
                          +{num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add to Cart Button */}
                  <button
                    type="button"
                    disabled={totalStockAvailable <= 0}
                    onClick={handleAddToCart}
                    className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 font-black h-12 px-4 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>
                      {totalStockAvailable <= 0
                        ? 'الصنف غير متاح حالياً بالمخازن'
                        : `إضافة (${activeVariant.name}) للسلة • ${quantity} ${orderType === 'carton' ? 'كرتونة' : 'قطعة'}`}
                    </span>
                  </button>
                </div>
              </div>

            </div>

          </div>
          )}

          {/* Stock across branches */}
          {activeTab === 'stock' && (
            <div className="space-y-4">
              {/* Executive Multi-Branch Stock Overview Card (تفاصيل المخزون بكل فرع والمخزن المركزي) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden shadow-2xs">
                {/* Top Header Summary */}
                <div className="bg-slate-900 text-white p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-white flex items-center gap-1.5">
                        <span>تفاصيل المخزون بكافة الفروع</span>
                        <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-400/30">
                          {branchInventoryList.length} مخازن
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        تحديث جردي فوري لجميع نقاط التوزيع
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-left bg-slate-800/90 px-2.5 py-1 rounded-xl border border-slate-700">
                      <span className="text-[9px] text-slate-400 block font-bold">إجمالي رصيد الشركة</span>
                      <span className="text-sm font-black text-amber-300 font-mono">
                        {grandTotalAllWarehouses.toLocaleString()} كرتونة
                      </span>
                    </div>
                  </div>
                </div>

                {/* High-Level Stock Split */}
                <div className="grid grid-cols-2 gap-2 p-2.5 bg-white border-b border-slate-200 text-xs">
                  <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-amber-800 font-bold block flex items-center gap-1">
                        <Package className="w-3 h-3 text-amber-600" />
                        <span>المخزن المركزي (أكتوبر)</span>
                      </span>
                      <span className="text-sm font-black text-slate-900 font-mono">
                        {mainWarehouseStock} كرتونة
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      mainWarehouseStock > 10 ? 'bg-emerald-100 text-emerald-800' : mainWarehouseStock > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {mainWarehouseStock > 0 ? 'متاح للصرف' : 'نافد'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-sky-50/70 border border-sky-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-sky-800 font-bold block flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-sky-600" />
                        <span>إجمالي فروع التوزيع</span>
                      </span>
                      <span className="text-sm font-black text-slate-900 font-mono">
                        {totalBranchesStockOnly} كرتونة
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      totalBranchesStockOnly > 10 ? 'bg-emerald-100 text-emerald-800' : totalBranchesStockOnly > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {totalBranchesStockOnly > 0 ? 'موزعة بالفروع' : 'نافد'}
                    </span>
                  </div>
                </div>

                {/* Full Branch Breakdown Table / Grid */}
                <div className="p-2.5">
                  <div className="text-[11px] font-black text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>رصيد الشباك الحالي ({activeVariant.name}) بكل فرع:</span>
                    <span className="text-[10px] text-slate-400">
                      {branchInventoryList.filter(b => b.stock > 0).length} فروع بها رصيد متاح
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {branchInventoryList.map((branch) => {
                      const isAvailable = branch.stock > 0;
                      const isCritical = branch.stock > 0 && branch.stock <= 5;
                      return (
                        <div
                          key={branch.name}
                          className={`p-2 rounded-xl border transition flex flex-col justify-between ${
                            branch.isMain
                              ? 'bg-slate-100 border-slate-400 ring-1 ring-slate-300'
                              : isAvailable
                                ? 'bg-white border-slate-200 hover:border-slate-300'
                                : 'bg-slate-100/60 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-slate-800 truncate" title={branch.name}>
                              {branch.shortName}
                            </span>
                            {branch.isMain && (
                              <span className="text-[8px] bg-slate-700 text-white font-black px-1 py-0.2 rounded shrink-0">
                                رئيسي
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-1 text-[10px]">
                            <span className={`font-mono font-black text-xs ${
                              isCritical ? 'text-amber-800' : isAvailable ? 'text-emerald-700' : 'text-slate-400'
                            }`}>
                              {branch.stock} ك
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              isCritical
                                ? 'bg-amber-100 text-amber-800'
                                : isAvailable
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-50 text-rose-600'
                            }`}>
                              {isCritical ? 'حرج' : isAvailable ? 'متاح' : 'نافد'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* All windows/variants table */}
          {activeTab === 'matrix' && parentProduct.variants.length > 1 && (
            <div className="space-y-3">
          {/* Quick Matrix for Multi-Window Orders */}
          {parentProduct.variants.length > 1 && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-black text-slate-900">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>جدول شبابيك الصنف بالكامل (طلب سريع لعدة شبابيك معاً):</span>
                </span>
                <span className="text-slate-500 font-normal">
                  يمكنك طلب أي شباك مباشرة من الجدول
                </span>
              </div>

              <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-200/80 text-slate-700 font-bold border-b border-slate-300 sticky top-0 z-10">
                      <th className="p-2.5">الشباك / اللون</th>
                      <th className="p-2.5">كود الصنف</th>
                      <th className="p-2.5 text-center">الكود الموحد (#)</th>
                      <th className="p-2.5 text-center">رصيد الفرع</th>
                      <th className="p-2.5 text-center">رصيد أكتوبر</th>
                      <th className="p-2.5 text-left">سعر الكرتونة</th>
                      <th className="p-2.5 text-center">حالة السلة</th>
                      <th className="p-2.5 text-center">إضافة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {parentProduct.variants.map((v) => {
                      const inCart = cart.find((i) => i.product.id === v.rawProduct.id);
                      const isCurr = activeVariant.id === v.id;
                      const vTotal = (v.branchStockActual || 0) + (v.mainWarehouseActual || 0);

                      return (
                        <tr
                          key={v.id}
                          onClick={() => handleSelectVariant(v)}
                          title="اضغط لعرض هذا الشباك في تبويب الرئيسية"
                          className={`cursor-pointer transition even:bg-slate-50/70 hover:bg-slate-100 ${
                            isCurr ? 'bg-slate-100 font-semibold ring-1 ring-inset ring-slate-300' : ''
                          }`}
                        >
                          <td className="p-2.5 font-black text-slate-900">
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isCurr ? 'bg-slate-700' : 'bg-slate-300'}`}></span>
                              <span>{v.name}</span>
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-600 font-bold">{v.code}</td>
                          <td className="p-2.5 text-center font-mono font-black text-blue-700">
                            {v.unifiedCode || v.rawProduct?.unifiedCode ? (
                              <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                                {v.unifiedCode || v.rawProduct?.unifiedCode}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-emerald-700">
                            {v.branchStockActual || 0} ك
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-700">
                            {v.mainWarehouseActual || 0} ك
                          </td>
                          <td className="p-2.5 text-left font-bold text-slate-900">
                            {isConfidentialMode ? '••••' : formatCurrency(v.cartonPrice)}
                          </td>
                          <td className="p-2.5 text-center">
                            {inCart ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                {inCart.cartonCount} كرتونة
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">---</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                disabled={vTotal <= 0}
                                title={vTotal > 0 ? 'إضافة كرتونة واحدة للسلة' : 'لا يوجد رصيد متاح'}
                                aria-label={`إضافة ${v.name} للسلة`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCart(v.rawProduct, 'carton', 1);
                                  setSuccessNotice(`تمت إضافة 1 كرتونة من (${v.name}) للسلة!`);
                                  setTimeout(() => setSuccessNotice(null), 3000);
                                }}
                                className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
            </div>
          )}

        </div>

        {/* Footer Navigation Bar */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs shrink-0">
          <div className="text-slate-500 font-medium">
            كود الصنف الأساسي: <strong className="font-mono text-slate-900">{parentProduct.primaryCode}</strong> • إجمالي الشبابيك: <strong className="text-slate-900">{parentProduct.variants.length}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition cursor-pointer"
            >
              إغلاق
            </button>

            {onOpenCart && cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCart();
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl font-black shadow transition cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>إتمام الطلبية ({cart.length})</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Full-size image lightbox */}
      {isImageZoomed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`صورة ${parentProduct.name} - ${activeVariant.name}`}
          onClick={() => setIsImageZoomed(false)}
          className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 animate-in fade-in cursor-zoom-out"
        >
          <div className="flex items-center justify-between w-full max-w-4xl text-white text-xs font-black shrink-0">
            <span className="truncate">
              {parentProduct.name} — {activeVariant.name}
            </span>
            <button
              type="button"
              onClick={() => setIsImageZoomed(false)}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer shrink-0"
              title="إغلاق (Esc)"
              aria-label="إغلاق الصورة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-5xl flex items-center justify-center overflow-auto"
          >
            <ProductImage
              product={rawProd}
              alt={`${parentProduct.name} - ${activeVariant.name}`}
              className="max-h-[78vh] w-auto object-contain drop-shadow-2xl"
            />
          </div>

          <span className="text-[11px] text-slate-400 font-bold shrink-0">
            اضغط في أي مكان خارج الصورة للإغلاق
          </span>
        </div>
      )}
    </div>
  );
};
