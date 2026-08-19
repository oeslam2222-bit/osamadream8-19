import {
  AlertCircle,
  ArrowUpDown,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Filter,
  Flame,
  Grid,
  Info,
  Layers,
  List,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Warehouse,
  X,
  Zap
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { generateProductPlaceholderSvg, getProductImageUrl } from '../services/cloudinaryService';
import { formatCurrency } from '../services/invoiceService';
import { ItemStatus, OFFICIAL_DEPARTMENTS, Product, SalesPriority } from '../types';

interface ProductCatalogProps {
  onOpenCart?: () => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ onOpenCart }) => {
  const { products, currentUser, addToCart, cloudinaryConfig, selectedBranchFilter } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [selectedPriority, setSelectedPriority] = useState<string>('الكل');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [stockAvailabilityFilter, setStockAvailabilityFilter] = useState<'all' | 'in_branch' | 'in_warehouse' | 'low_stock'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [addedItemToast, setAddedItemToast] = useState<{ name: string; count: string } | null>(null);

  // Extract unique categories including official departments
  const categories = useMemo(() => {
    const set = new Set<string>();
    OFFICIAL_DEPARTMENTS.forEach((dept) => set.add(dept));
    products.forEach((p) => {
      if (p.category) set.add(p.category);
      if (p.department) set.add(p.department);
    });
    return ['الكل', ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Branch filter if not 'الكل'
      if (selectedBranchFilter !== 'الكل' && p.branchName && p.branchName !== selectedBranchFilter) {
        // Still allow sales rep to see if main warehouse has stock
        if (p.mainWarehouseActual <= 0 && p.branchStockActual <= 0) return false;
      }

      // Search match
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const codeMatch = p.code.toLowerCase().includes(query);
        const nameMatch = p.name.toLowerCase().includes(query);
        const catMatch = p.category.toLowerCase().includes(query);
        const deptMatch = p.department?.toLowerCase().includes(query);
        const colorMatch = p.color?.toLowerCase().includes(query);
        const barcodeMatch = p.barcode?.includes(query);

        if (!codeMatch && !nameMatch && !catMatch && !deptMatch && !colorMatch && !barcodeMatch) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'الكل' && p.category !== selectedCategory) {
        return false;
      }

      // Priority filter
      if (selectedPriority !== 'الكل' && p.salesPriority !== selectedPriority) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'الكل' && p.status !== selectedStatus) {
        return false;
      }

      // Stock filter
      if (stockAvailabilityFilter === 'in_branch' && p.branchStockActual <= 0) {
        return false;
      }
      if (stockAvailabilityFilter === 'in_warehouse' && p.mainWarehouseActual <= 0) {
        return false;
      }
      if (stockAvailabilityFilter === 'low_stock' && p.branchStockActual > 20) {
        return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedPriority, selectedStatus, stockAvailabilityFilter, selectedBranchFilter]);

  const handleQuickAdd = (product: Product, type: 'carton' | 'piece', count: number = 1) => {
    addToCart(product, type, count);
    const label = type === 'carton' ? `${count} كرتونة` : `${count} قطعة`;
    setAddedItemToast({ name: product.name, count: label });
    setTimeout(() => setAddedItemToast(null), 2500);
  };

  const priorityBadges: Record<SalesPriority, { bg: string; text: string; icon?: any }> = {
    'مرتفع': { bg: 'bg-rose-500/10 border-rose-500/30 text-rose-700', text: 'أولوية بيع عالية', icon: Flame },
    'متوسط': { bg: 'bg-amber-500/10 border-amber-500/30 text-amber-700', text: 'أولوية متوسطة', icon: Zap },
    'عادي': { bg: 'bg-slate-500/10 border-slate-500/30 text-slate-700', text: 'أولوية عادية' },
    'منخفض': { bg: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-600', text: 'أولوية منخفضة' },
  };

  const statusBadges: Record<ItemStatus, { bg: string; text: string }> = {
    'متاح': { bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800' },
    'عرض ترويجي': { bg: 'bg-purple-100 border-purple-300 animate-pulse', text: 'text-purple-800' },
    'راكد': { bg: 'bg-orange-100 border-orange-300', text: 'text-orange-800' },
    'نواقص': { bg: 'bg-red-100 border-red-300', text: 'text-red-800' },
    'موقوف مؤقتاً': { bg: 'bg-gray-100 border-gray-300', text: 'text-gray-700' },
  };

  return (
    <div className="space-y-4 pb-16">
      
      {/* Toast Notification when adding item */}
      {addedItemToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-amber-400/40 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-amber-400 font-semibold">تمت الإضافة إلى الفاتورة</div>
            <div className="text-sm font-bold truncate max-w-[240px]">{addedItemToast.name}</div>
            <div className="text-xs text-slate-300 font-medium">{addedItemToast.count}</div>
          </div>
        </div>
      )}

      {/* Header & Controls Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200">
        
        {/* Top bar with stats & search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900">كتالوج منتجات دريم للتوزيع</h2>
              <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-0.5 rounded-full border border-amber-300">
                {filteredProducts.length} صنف متاح
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              مخزون الفرع الحالي والمخزن المركزي • متصل بسحابة صور Cloudinary
            </p>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالكود (مثال DRM-101)، الاسم، التصنيف، الباركود..."
              className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* View mode toggle (Grid vs List) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="عرض بطاقات وشبكة"
            >
              <Grid className="w-4 h-4" />
              <span className="hidden sm:inline">شبكة</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="عرض جدول سريع للطلبيات"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">قائمة</span>
            </button>
          </div>
        </div>

        {/* Filter Pills Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          
          {/* Categories Selector */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition border ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-amber-300 border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          
          {/* Priority filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">أولوية البيع:</span>
            <select
              aria-label="تصفية أولوية البيع"
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="الكل">كل الأولويات</option>
              <option value="مرتفع">مرتفع 🔥</option>
              <option value="متوسط">متوسط ⚡</option>
              <option value="عادي">عادي</option>
              <option value="منخفض">منخفض</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">حالة الصنف:</span>
            <select
              aria-label="تصفية حالة الصنف"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="الكل">كل الحالات</option>
              <option value="متاح">متاح</option>
              <option value="عرض ترويجي">عرض ترويجي 🎁</option>
              <option value="راكد">راكد</option>
              <option value="نواقص">نواقص</option>
            </select>
          </div>

          {/* Stock source filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">توفر المخزون:</span>
            <select
              aria-label="تصفية توفر المخزون"
              value={stockAvailabilityFilter}
              onChange={(e) => setStockAvailabilityFilter(e.target.value as any)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">كل الأصناف</option>
              <option value="in_branch">متوفر بالفرع فقط</option>
              <option value="in_warehouse">متوفر بالمخزن الرئيسي</option>
              <option value="low_stock">مخزون حرج / نواقص</option>
            </select>
          </div>

          {/* Active filters reset */}
          {(searchTerm || selectedCategory !== 'الكل' || selectedPriority !== 'الكل' || selectedStatus !== 'الكل' || stockAvailabilityFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('الكل');
                setSelectedPriority('الكل');
                setSelectedStatus('الكل');
                setStockAvailabilityFilter('all');
              }}
              className="text-amber-700 hover:text-amber-900 font-bold underline pr-2"
            >
              إلغاء كل الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Product Display (Grid View) */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const imageUrl = getProductImageUrl(product, cloudinaryConfig);
            const isPromo = product.promoPrice && product.promoPrice > 0;
            const priorityConfig = priorityBadges[product.salesPriority];
            const hasBranchStock = product.branchStockActual > 0;
            const hasMainWhStock = product.mainWarehouseActual > 0;

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-amber-400/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group relative"
              >
                {/* Image Container with Cloudinary Support */}
                <div className="relative h-44 bg-slate-100 overflow-hidden cursor-pointer" onClick={() => setSelectedProductForModal(product)}>
                  <img
                    src={imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    onError={(e) => {
                      // Fallback clean SVG placeholder
                      (e.target as HTMLElement).setAttribute('src', generateProductPlaceholderSvg(product.code, product.category, product.name));
                    }}
                  />

                  {/* Product Code Badge */}
                  <div className="absolute top-2 right-2 bg-slate-900/90 text-amber-300 text-xs font-black px-2.5 py-1 rounded-lg backdrop-blur-xs shadow">
                    {product.code}
                  </div>

                  {/* Promo or Status Badge */}
                  {isPromo ? (
                    <div className="absolute top-2 left-2 bg-purple-600 text-white text-[11px] font-black px-2 py-0.5 rounded-md shadow flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>عرض خاص</span>
                    </div>
                  ) : product.status === 'نواقص' ? (
                    <div className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow">
                      نواقص بالفرع
                    </div>
                  ) : product.status === 'راكد' ? (
                    <div className="absolute top-2 left-2 bg-orange-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow">
                      تصريف راكد
                    </div>
                  ) : null}

                  {/* Quick view button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProductForModal(product);
                    }}
                    className="absolute bottom-2 left-2 bg-white/90 hover:bg-white text-slate-800 p-1.5 rounded-lg shadow text-xs font-semibold backdrop-blur-xs flex items-center gap-1"
                    title="معاينة تفصيلية"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>تفاصيل</span>
                  </button>

                  {/* Pack Size Pill */}
                  <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-xs">
                    شدة الكرتونة: {product.cartonQuantity} ق
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                  
                  {/* Category & Name */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                      <span>{product.category}</span>
                      {product.size && <span>الحجم: {product.size}</span>}
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2" title={product.name}>
                      {product.name}
                    </h3>
                  </div>

                  {/* Dual Stock Indicators: Branch vs Main Warehouse */}
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                    {/* Branch Stock */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span>مخزون الفرع:</span>
                      </div>
                      <div className="font-bold">
                        {hasBranchStock ? (
                          <span className="text-emerald-700 font-extrabold">{product.branchStockActual} ق</span>
                        ) : (
                          <span className="text-red-600 font-bold">0 (نفذ)</span>
                        )}
                        <span className="text-[10px] text-slate-400 mr-1">(متاح: {product.branchStockReserved})</span>
                      </div>
                    </div>

                    {/* Main Warehouse Stock */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <Warehouse className="w-3.5 h-3.5 text-amber-500" />
                        <span>المخزن الرئيسي:</span>
                      </div>
                      <div className="font-bold">
                        {hasMainWhStock ? (
                          <span className="text-amber-800 font-extrabold">{product.mainWarehouseActual} ق</span>
                        ) : (
                          <span className="text-slate-400">غير متوفر</span>
                        )}
                        <span className="text-[10px] text-slate-400 mr-1">(متاح: {product.mainWarehouseReserved})</span>
                      </div>
                    </div>
                  </div>

                  {/* Prices: Piece Price & Carton Price */}
                  <div className="flex items-center justify-between bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/80">
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">سعر القطعة</div>
                      <div className="font-extrabold text-sm text-slate-900">
                        {isPromo ? (
                          <div className="flex items-center gap-1">
                            <span className="text-purple-700 font-black">{formatCurrency(product.promoPrice)}</span>
                            <span className="text-[10px] text-slate-400 line-through">{formatCurrency(product.piecePrice)}</span>
                          </div>
                        ) : (
                          <span>{formatCurrency(product.piecePrice)}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-left">
                      <div className="text-[10px] text-slate-500 font-medium">سعر الكرتونة ({product.cartonQuantity} ق)</div>
                      <div className="font-black text-sm text-amber-900">
                        {formatCurrency(product.cartonPrice)}
                      </div>
                    </div>
                  </div>

                  {/* Fast Action Buttons for Sales Rep */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* Add Carton button */}
                    <button
                      onClick={() => handleQuickAdd(product, 'carton', 1)}
                      className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black py-2 px-2 rounded-xl text-xs shadow-xs transition transform active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+1 كرتونة</span>
                    </button>

                    {/* Add Piece button */}
                    <button
                      onClick={() => handleQuickAdd(product, 'piece', 1)}
                      className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold py-2 px-2 rounded-xl text-xs border border-slate-200 transition transform active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-500" />
                      <span>+1 قطعة</span>
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Dense List View for Fast Order Taking */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-200 font-bold">
                <tr>
                  <th className="p-3">الكود والصورة</th>
                  <th className="p-3">اسم الصنف والبيان</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">شدة الكرتونة</th>
                  <th className="p-3">مخزون الفرع</th>
                  <th className="p-3">مخزون المخزن المركزي</th>
                  <th className="p-3">سعر القطعة</th>
                  <th className="p-3">سعر الكرتونة</th>
                  <th className="p-3 text-center">إضافة سريعة للطلبية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const imageUrl = getProductImageUrl(product, cloudinaryConfig);
                  const isPromo = product.promoPrice && product.promoPrice > 0;
                  return (
                    <tr key={product.id} className="hover:bg-amber-50/40 transition">
                      <td className="p-2.5">
                        <div className="flex items-center gap-2">
                          <img
                            src={imageUrl}
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer"
                            onClick={() => setSelectedProductForModal(product)}
                          />
                          <span className="font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                            {product.code}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-slate-900">{product.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>اللون: {product.color || '---'}</span>
                          <span>الحجم: {product.size || '---'}</span>
                          <span>الفئة: {product.classification || '---'}</span>
                        </div>
                      </td>
                      <td className="p-2.5 font-medium text-slate-600">{product.category}</td>
                      <td className="p-2.5 font-black text-slate-800">{product.cartonQuantity} ق</td>
                      <td className="p-2.5">
                        <span className={product.branchStockActual > 0 ? 'text-emerald-700 font-extrabold' : 'text-red-600 font-bold'}>
                          {product.branchStockActual} ق
                        </span>
                        <div className="text-[10px] text-slate-400">بعد الحجز: {product.branchStockReserved}</div>
                      </td>
                      <td className="p-2.5">
                        <span className="text-amber-800 font-extrabold">{product.mainWarehouseActual} ق</span>
                        <div className="text-[10px] text-slate-400">بعد الحجز: {product.mainWarehouseReserved}</div>
                      </td>
                      <td className="p-2.5 font-extrabold text-slate-900">
                        {isPromo ? (
                          <div>
                            <span className="text-purple-700 font-black">{formatCurrency(product.promoPrice)}</span>
                            <span className="text-[10px] text-slate-400 line-through block">{formatCurrency(product.piecePrice)}</span>
                          </div>
                        ) : (
                          formatCurrency(product.piecePrice)
                        )}
                      </td>
                      <td className="p-2.5 font-black text-amber-900">{formatCurrency(product.cartonPrice)}</td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleQuickAdd(product, 'carton', 1)}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-2 py-1 rounded-lg text-xs transition"
                          >
                            +1 كرتونة
                          </button>
                          <button
                            onClick={() => handleQuickAdd(product, 'piece', 1)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium px-2 py-1 rounded-lg text-xs transition"
                          >
                            +1 قطعة
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

      {/* Empty State */}
      {filteredProducts.length === 0 && (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-xs space-y-3">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-800">لا توجد منتجات مطابقة للبحث أو الفلتر</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            جرّب تغيير كلمات البحث، أو إزالة فلاتر الأولوية والحالة لعرض باقي أصناف دريم.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('الكل');
              setSelectedPriority('الكل');
              setSelectedStatus('الكل');
              setStockAvailabilityFilter('all');
            }}
            className="bg-slate-900 text-amber-300 px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-slate-800"
          >
            إعادة تعيين البحث
          </button>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProductForModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-slate-900 text-amber-300 font-black text-xs px-2.5 py-1 rounded-lg">
                  {selectedProductForModal.code}
                </span>
                <span className="text-xs font-bold text-slate-500">{selectedProductForModal.category}</span>
              </div>
              <button
                onClick={() => setSelectedProductForModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Product Image Preview */}
              <div className="space-y-2">
                <div className="h-64 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative">
                  <img
                    src={getProductImageUrl(selectedProductForModal, cloudinaryConfig)}
                    alt={selectedProductForModal.name}
                    className="w-full h-full object-cover"
                  />
                  {selectedProductForModal.promoPrice && (
                    <div className="absolute top-3 right-3 bg-purple-600 text-white font-bold text-xs px-2.5 py-1 rounded-lg shadow">
                      عرض ترويجي نشط
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 text-center">
                  معرّف الصورة السحابي: <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-800">{selectedProductForModal.cloudinaryPublicId || selectedProductForModal.code}</code>
                </div>
              </div>

              {/* Product Specs */}
              <div className="space-y-4 text-xs">
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-snug">
                    {selectedProductForModal.name}
                  </h3>
                  <div className="text-slate-500 mt-1">القسم: {selectedProductForModal.department} • الفئة: {selectedProductForModal.classification}</div>
                </div>

                {/* Stock Details Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-900 text-xs">مستويات المخزون الحالية:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400">الفرع ({selectedProductForModal.branchName}):</div>
                      <div className="font-black text-sm text-emerald-700">{selectedProductForModal.branchStockActual} قطعة</div>
                      <div className="text-[10px] text-slate-400">بعد الحجز: {selectedProductForModal.branchStockReserved}</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400">المخزن الرئيسي (أكتوبر):</div>
                      <div className="font-black text-sm text-amber-800">{selectedProductForModal.mainWarehouseActual} قطعة</div>
                      <div className="text-[10px] text-slate-400">بعد الحجز: {selectedProductForModal.mainWarehouseReserved}</div>
                    </div>
                  </div>
                </div>

                {/* Pricing Box */}
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 space-y-2">
                  <div className="font-bold text-amber-950">أسعار البيع المعتمدة:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500">سعر القطعة</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(selectedProductForModal.promoPrice || selectedProductForModal.piecePrice)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">سعر الكرتونة ({selectedProductForModal.cartonQuantity} ق)</div>
                      <div className="text-sm font-black text-amber-900">
                        {formatCurrency(selectedProductForModal.cartonPrice)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Attributes */}
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div className="bg-slate-50 p-2 rounded-lg">شدة الكرتونة: <strong className="text-slate-900">{selectedProductForModal.cartonQuantity} ق</strong></div>
                  <div className="bg-slate-50 p-2 rounded-lg">الحجم / الوزن: <strong className="text-slate-900">{selectedProductForModal.size}</strong></div>
                  <div className="bg-slate-50 p-2 rounded-lg">اللون: <strong className="text-slate-900">{selectedProductForModal.color}</strong></div>
                  <div className="bg-slate-50 p-2 rounded-lg">الأولوية: <strong className="text-slate-900">{selectedProductForModal.salesPriority}</strong></div>
                </div>

                {/* Quick Add Action in Modal */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleQuickAdd(selectedProductForModal, 'carton', 1);
                      setSelectedProductForModal(null);
                    }}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl shadow-md text-xs transition"
                  >
                    + إضافة 1 كرتونة للطلبية
                  </button>
                  <button
                    onClick={() => {
                      handleQuickAdd(selectedProductForModal, 'piece', 1);
                      setSelectedProductForModal(null);
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs transition"
                  >
                    + إضافة 1 قطعة للطلبية
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
