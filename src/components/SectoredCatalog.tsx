import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { SectorPermissionService } from '../services/sectorPermissionService';
import { BRANCHES, Branch, getBranchesBySector } from '../data/branchDefinitions';
import { formatCurrency } from '../services/invoiceService';
import { resolveDisplayPrice, stripPlaceholderText } from '../services/productPricing';
import {
  Search, Filter, Package, Home, Zap, ShoppingCart,
  ChevronRight, ChevronLeft, Clock, CloudDownload,
} from 'lucide-react';

interface ProductCardProps {
  product: Product;
  branchStock: number;
  octoberAvail: number;
  onAddToCart: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  branchStock,
  octoberAvail,
  onAddToCart,
}) => {
  const isPromo = product.promoPrice && product.promoPrice > 0;
  const totalCartonsAvailable = branchStock + octoberAvail;
  const isOutOfStock = totalCartonsAvailable <= 0;
  // نفس قاعدة التسعير: شدة 1 ⇒ السعر سعر قطعة، وغير كده سعر كرتونة.
  const pricing = resolveDisplayPrice({
    piecePrice: product.piecePrice ?? product.salesPrice,
    cartonPrice: product.cartonPrice,
    factor: product.factor ?? product.cartonQuantity,
  });
  const displayName = stripPlaceholderText(product.name);

  return (
    <div
      id={`prod-${product.id}`}
      key={product.id}
      className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-[color:var(--app-line)] dark:border-slate-700 shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col justify-between group relative"
    >
      <div className="relative aspect-square product-img-box overflow-hidden cursor-pointer flex items-center justify-center p-2.5 border-b border-slate-200">
        <div className="w-full h-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center rounded-xl">
          <Package className="w-12 h-12 text-slate-400" />
        </div>
        <div className="absolute top-2 right-2 z-10">
          <span className="bg-white/90 text-slate-600 border border-slate-200 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs">
            {product.code}
          </span>
        </div>
        {isPromo && (
          <div className="absolute top-2 left-2 z-10 bg-[var(--app-risk)] text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-xs">
            عرض
          </div>
        )}
      </div>
      <div className="p-3 flex-1">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          {product.category}
        </div>
        <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm leading-tight mb-1.5 line-clamp-2">
          {displayName || `صنف ${product.code}`}
        </h3>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-black text-slate-900 dark:text-slate-100">
            {formatCurrency(pricing.displayPrice)}
            <span className="text-[10px] text-slate-400 font-normal"> / {pricing.unitLabel}</span>
          </span>
          {isPromo && (
            <span className="text-[10px] text-[var(--app-risk-text)] font-black line-through">
              {formatCurrency(product.promoPrice)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500 font-semibold mb-3">
          <div>
            <div className="text-slate-900 dark:text-slate-200">{branchStock}</div>
            <div>الفرع</div>
          </div>
          <div>
            <div className="text-slate-900 dark:text-slate-200">{octoberAvail}</div>
            <div>أكتوبر</div>
          </div>
          <div>
            <div className="text-slate-900 dark:text-slate-200">{pricing.isSinglePiece ? '—' : pricing.factor}</div>
            <div>{pricing.isSinglePiece ? 'قطعة' : 'قطعة/كرتونة'}</div>
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onAddToCart(product)}
          disabled={isOutOfStock}
          className={`w-full font-bold h-10 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${isOutOfStock ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[color:var(--app-navy)] hover:bg-navy-deep2 text-white shadow-xs'}`}
        >
          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
          <span>{isOutOfStock ? 'غير متوفر' : 'أضف للطلبية'}</span>
        </button>
      </div>
    </div>
  );
};

interface SectoredCatalogProps {
  className?: string;
}

export const SectoredCatalog = ({ className }: SectoredCatalogProps) => {
  const {
    products,
    currentUser,
    activeSectorFilter,
  } = useApp();

  const userSector = useMemo(() => {
    if (!currentUser) return undefined;
    const role = currentUser.role as 'sales_rep' | 'sales_supervisor' | 'branch_manager' | 'sales_department_manager' | 'sector_manager_home' | 'sector_manager_electrical' | 'top_management' | 'technical_support';
    if (role === 'top_management' || role === 'technical_support' || role === 'sales_department_manager') {
      return activeSectorFilter === 'all' ? undefined : activeSectorFilter;
    }
    if (role === 'sector_manager_home') return 'home';
    if (role === 'sector_manager_electrical') return 'electrical';
    return currentUser.sector;
  }, [currentUser, activeSectorFilter]);

  const filteredProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    const sectorAllowed = SectorPermissionService.getAllowedSectors({
      ...currentUser!,
      sector: userSector,
    } as any);
    return products.filter((p) => {
      const pSector = (p as any).sector;
      if (!sectorAllowed.includes('home') && !sectorAllowed.includes('electrical')) {
        return false;
      }
      if (pSector && pSector !== 'both' && pSector !== 'all' && !sectorAllowed.includes(pSector as 'home' | 'electrical')) {
        return false;
      }
      return true;
    });
  }, [products, userSector, currentUser]);

  const sections = useMemo(() => {
    const home = filteredProducts.filter((p) => {
      const s = (p as any).sector;
      return !s || s === 'home' || s === 'both' || s === 'all';
    });
    const electrical = filteredProducts.filter((p) => (p as any).sector === 'electrical');
    const result: Array<{ key: string; title: string; icon: React.ReactNode; items: Product[] }> = [];
    if (home.length > 0) {
      result.push({ key: 'home', title: 'القطاع المنزلي (Household)', icon: <Home className="w-4 h-4" />, items: home });
    }
    if (electrical.length > 0) {
      result.push({ key: 'electrical', title: 'القطاع الكهربائي (Electrical)', icon: <Zap className="w-4 h-4 text-[var(--app-warn-text)]" />, items: electrical });
    }
    return result;
  }, [filteredProducts]);

  const totalCount = filteredProducts.length;

  const handleAddToCart = (product: Product) => {
    console.log('Add to cart:', product.code);
  };

  if (filteredProducts.length === 0) {
    return (
      <div className={className}>
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-4 max-w-xl mx-auto">
          <div className="w-20 h-20 bg-slate-100 text-slate-soft5 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Package className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
            لا توجد أصناف متاحة لقطاعك
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            تأكد من اختيار القطاع والفرع المناسبين من صفحة الإدارة.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h2 className="font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-[var(--app-warn-text)]" />
            الكتالوج حسب القطاع والفرع
          </h2>
          <p className="text-sm text-slate-500">
            إجمالي الأصناف الظاهرة: <span className="font-black text-[var(--app-warn-text)]">{totalCount}</span> صنف
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-xs sm:text-sm transition"
          >
            <CloudDownload className="w-4 h-4" />
            تصدير إكسل
          </button>
          <button
            type="button"
            className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-black text-xs sm:text-sm transition"
          >
            <Filter className="w-4 h-4" />
            فلتر سريع
          </button>
        </div>
      </div>
      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.key} className="animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
              {section.icon}
              <span className="font-black text-slate-900 dark:text-slate-100 text-sm">
                {section.title} ({section.items.length})
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3.5">
              {section.items.map((product) => {
                const branchStock = 12;
                const octoberAvail = 8;
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    branchStock={branchStock}
                    octoberAvail={octoberAvail}
                    onAddToCart={handleAddToCart}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-bold">
          المنتجات مرتبة حسب القطاع والفرع التابع للمستخدم
        </span>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span>عرض 1 إلى {Math.min(totalCount, 24)} من {totalCount}</span>
          <ChevronRight className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
};

export default SectoredCatalog;