import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  Grid,
  Layers,
  LayoutGrid,
  Package,
  PieChart,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Warehouse,
  X,
} from 'lucide-react';
import { getDepartmentMeta } from '../data/departmentMeta';
import { Product } from '../types';

export interface ClassificationStat {
  name: string;
  count: number;
  branchCartons: number;
  warehouseCartons: number;
  totalCartons: number;
  minPrice: number;
  maxPrice: number;
  percentage: number;
}

interface DepartmentCategorySlicerProps {
  products: Product[];
  selectedDepartment: string;
  onSelectDepartment: (dept: string) => void;
  selectedClassification: string;
  onSelectClassification: (classification: string) => void;
  className?: string;
  compactMode?: boolean;
}

export const DepartmentCategorySlicer: React.FC<DepartmentCategorySlicerProps> = ({
  products,
  selectedDepartment,
  onSelectDepartment,
  selectedClassification,
  onSelectClassification,
  className = '',
  compactMode = false,
}) => {
  const [slicerDisplayMode, setSlicerDisplayMode] = useState<'tiles' | 'chips'>('tiles');
  const [deptViewStyle, setDeptViewStyle] = useState<'scroll' | 'grid'>('scroll');
  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isSlicerCollapsed, setIsSlicerCollapsed] = useState(false);

  // 1. Calculate Dynamic Arabic Item Groups (المجموعات الرئيسية) purely from loaded products
  const dynamicItemGroups = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const g = (p.itemGroup || p.department || p.category || '').trim();
      if (g) set.add(g);
    });

    const list = Array.from(set).filter(Boolean);
    // Sort alphabetically in Arabic
    return list.sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  // 2. Count items per Arabic item group
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { 'الكل': products.length };
    dynamicItemGroups.forEach((dept) => {
      counts[dept] = 0;
    });

    products.forEach((p) => {
      const pGrp = (p.itemGroup || p.department || p.category || '').trim();
      if (pGrp && counts[pGrp] !== undefined) {
        counts[pGrp] = (counts[pGrp] || 0) + 1;
      }
    });

    return counts;
  }, [products, dynamicItemGroups]);

  // 3. Filter products by selected Arabic group to extract accurate sub-families (الفئات/العائلات)
  const productsInCurrentDept = useMemo(() => {
    if (selectedDepartment === 'الكل') return products;

    const target = selectedDepartment.toLowerCase().trim();
    return products.filter((p) => {
      const pGrp = (p.itemGroup || p.department || p.category || '').toLowerCase().trim();
      return pGrp === target;
    });
  }, [products, selectedDepartment]);

  // 4. Calculate Sub-categories / Family Names (عائلات وفئات الأصناف المرتبطة بالمجموعة)
  const classificationStats = useMemo<ClassificationStat[]>(() => {
    const map = new Map<
      string,
      {
        count: number;
        branchCartons: number;
        warehouseCartons: number;
        prices: number[];
      }
    >();

    productsInCurrentDept.forEach((p) => {
      const classNameRaw =
        (p.familyName && p.familyName.trim()) ||
        (p.classification && p.classification.trim()) ||
        (p.category && !dynamicItemGroups.includes(p.category) ? p.category.trim() : '') ||
        'أصناف عامة';

      const existing = map.get(classNameRaw) || {
        count: 0,
        branchCartons: 0,
        warehouseCartons: 0,
        prices: [],
      };

      existing.count += 1;
      existing.branchCartons += Math.max(0, p.branchStockReserved || p.branchStockActual || 0);
      existing.warehouseCartons += Math.max(0, p.mainWarehouseReserved || p.mainWarehouseActual || 0);
      if (p.cartonPrice > 0) {
        existing.prices.push(p.cartonPrice);
      }

      map.set(classNameRaw, existing);
    });

    const totalInDept = productsInCurrentDept.length || 1;
    const list: ClassificationStat[] = [];

    map.forEach((val, name) => {
      const minPrice = val.prices.length > 0 ? Math.min(...val.prices) : 0;
      const maxPrice = val.prices.length > 0 ? Math.max(...val.prices) : 0;
      const totalCartons = val.branchCartons + val.warehouseCartons;
      const percentage = Math.round((val.count / totalInDept) * 100);

      list.push({
        name,
        count: val.count,
        branchCartons: val.branchCartons,
        warehouseCartons: val.warehouseCartons,
        totalCartons,
        minPrice,
        maxPrice,
        percentage,
      });
    });

    // Sort by product count descending
    return list.sort((a, b) => b.count - a.count);
  }, [productsInCurrentDept, dynamicItemGroups]);

  // 5. Filter classifications by search query
  const filteredClassificationStats = useMemo(() => {
    if (!classSearchTerm.trim()) return classificationStats;
    const q = classSearchTerm.toLowerCase().trim();
    return classificationStats.filter((c) => c.name.toLowerCase().includes(q));
  }, [classificationStats, classSearchTerm]);

  const currentDeptMeta = getDepartmentMeta(selectedDepartment);
  const CurrentDeptIcon = currentDeptMeta.icon;

  const totalFilteredCount =
    selectedClassification === 'الكل'
      ? productsInCurrentDept.length
      : classificationStats.find((c) => c.name === selectedClassification)?.count || 0;

  return (
    <div className={`space-y-2 bg-slate-900/95 text-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-800 shadow-lg ${className}`}>
      {/* 1. Header Bar: Arabic Item Groups & Power BI Slicer Title */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-black text-xs sm:text-sm text-white">
                تصفية المجموعات الرئيسية (Item Group) والفئات (Categories)
              </h3>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-black px-1.5 py-0.2 rounded-md">
                مباشر من الشيت 📊
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              اختر المجموعة الرئيسية بالعربي لتظهر لك الفئات والعائلات التابعة لها تلقائياً
            </p>
          </div>
        </div>

        {/* View toggles & Clear Slicers */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setDeptViewStyle(deptViewStyle === 'scroll' ? 'grid' : 'scroll')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg border border-slate-700 flex items-center gap-1 transition cursor-pointer"
            title="تبديل طريقة عرض المجموعات"
          >
            {deptViewStyle === 'scroll' ? (
              <>
                <Grid className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">عرض شبكة</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">عرض شريط</span>
              </>
            )}
          </button>

          {(selectedDepartment !== 'الكل' || selectedClassification !== 'الكل') && (
            <button
              type="button"
              onClick={() => {
                onSelectDepartment('الكل');
                onSelectClassification('الكل');
                setClassSearchTerm('');
              }}
              className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-black rounded-lg flex items-center gap-1 transition cursor-pointer"
              title="إلغاء تصفية المجموعة والفئة"
            >
              <X className="w-3 h-3" />
              <span>مسح التصفية</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSlicerCollapsed(!isSlicerCollapsed)}
            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 cursor-pointer"
            title={isSlicerCollapsed ? 'توسيع لوحة الفئات' : 'طي لوحة الفئات'}
          >
            {isSlicerCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Cascading Quick Select Dropdowns (Item Group -> Family Name) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span>1. المجموعة الرئيسية (Item Group):</span>
          </label>
          <select
            value={selectedDepartment}
            onChange={(e) => {
              onSelectDepartment(e.target.value);
              onSelectClassification('الكل');
            }}
            className="w-full h-10 px-3 bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
          >
            <option value="الكل">📦 كل المجموعات ({dynamicItemGroups.length} مجموعة - {products.length} صنف)</option>
            {dynamicItemGroups.map((grp) => {
              const count = deptCounts[grp] || 0;
              return (
                <option key={grp} value={grp}>
                  {grp} {count > 0 ? `(${count} صنف)` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>2. فئة / عائلة الأصناف (Family / Category):</span>
          </label>
          <select
            value={selectedClassification}
            onChange={(e) => onSelectClassification(e.target.value)}
            className="w-full h-10 px-3 bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
          >
            <option value="الكل">🏷️ كل الفئات التابعة لـ ({selectedDepartment === 'الكل' ? 'جميع المجموعات' : selectedDepartment}) - {classificationStats.length} فئة</option>
            {classificationStats.map((stat) => (
              <option key={stat.name} value={stat.name}>
                {stat.name} ({stat.count} صنف • {stat.totalCartons} كرتونة)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. The Dynamic Arabic Item Groups Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
          <span className="flex items-center gap-1">
            <span>المجموعة المختارة:</span>
            <strong className="text-amber-300">
              {selectedDepartment === 'الكل' ? 'جميع المجموعات' : currentDeptMeta.nameArabic}
            </strong>
          </span>
          <span className="text-[10px] text-slate-400">
            {products.length} صنف مسجل • {dynamicItemGroups.length} مجموعة رئيسية
          </span>
        </div>

        {/* Scrollable Carousel vs Grid of Arabic Groups */}
        {deptViewStyle === 'scroll' ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
            {/* 'الكل' Option */}
            <button
              type="button"
              onClick={() => {
                onSelectDepartment('الكل');
                onSelectClassification('الكل');
              }}
              className={`whitespace-nowrap px-3 h-9 rounded-xl text-xs font-black shrink-0 transition cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                selectedDepartment === 'الكل'
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-sm font-black'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-750 hover:text-white border border-slate-700/80'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-lg flex items-center justify-center font-bold text-xs ${
                  selectedDepartment === 'الكل' ? 'bg-slate-950 text-amber-400' : 'bg-slate-700 text-slate-300'
                }`}
              >
                <Package className="w-3 h-3" />
              </div>
              <span>كل المجموعات</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedDepartment === 'الكل' ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {products.length}
              </span>
            </button>

            {/* Dynamic Arabic Group Buttons */}
            {dynamicItemGroups.map((grp) => {
              const meta = getDepartmentMeta(grp);
              const IconComp = meta.icon;
              const count = deptCounts[grp] || 0;
              const isSelected = selectedDepartment === grp;

              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => {
                    onSelectDepartment(grp);
                    onSelectClassification('الكل');
                  }}
                  className={`whitespace-nowrap px-2.5 h-9 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 ring-2 ring-amber-300 shadow-sm font-black'
                      : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700/70'
                  }`}
                  title={`${meta.nameArabic} (${count} صنف)`}
                >
                  <div
                    className={`w-5 h-5 rounded-lg flex items-center justify-center font-bold ${
                      isSelected ? 'bg-slate-950 text-amber-400' : `${meta.colorClasses.bgLight} ${meta.colorClasses.text}`
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="leading-tight text-[11px]">{meta.shortLabel}</span>
                  </div>
                  {count > 0 && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                        isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-200'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* Grid View of Arabic Groups */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 pt-0.5 max-h-48 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                onSelectDepartment('الكل');
                onSelectClassification('الكل');
              }}
              className={`p-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                selectedDepartment === 'الكل'
                  ? 'bg-amber-400 text-slate-950 shadow-sm ring-1 ring-amber-300'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <div className="text-right flex-1">
                <div className="font-black text-xs">كل المجموعات</div>
                <div className="text-[9px] opacity-80">{products.length} صنف</div>
              </div>
            </button>

            {dynamicItemGroups.map((grp) => {
              const meta = getDepartmentMeta(grp);
              const IconComp = meta.icon;
              const count = deptCounts[grp] || 0;
              const isSelected = selectedDepartment === grp;

              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => {
                    onSelectDepartment(grp);
                    onSelectClassification('الكل');
                  }}
                  className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-sm ring-1 ring-amber-300'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-slate-950 text-amber-300' : `${meta.colorClasses.bgLight} ${meta.colorClasses.text}`
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                  </div>
                  <div className="text-right flex-1 truncate">
                    <div className="font-black text-[11px] truncate">{meta.shortLabel}</div>
                    <div className={`text-[9px] ${isSelected ? 'text-slate-800' : 'text-slate-400'}`}>
                      {count} صنف
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Power BI Classifications (الفئات والعائلات التابعة) Interactive Drilldown Panel */}
      {!isSlicerCollapsed && (
        <div className="space-y-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/90 animate-in fade-in">
          {/* Slicer Subheader & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-black text-amber-300 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                <span>فئات وعائلات:</span>
              </span>
              <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-md font-bold text-[11px]">
                {selectedDepartment === 'الكل' ? 'جميع المجموعات' : currentDeptMeta.nameArabic}
              </span>
              <span className="text-[10px] text-slate-400">
                ({classificationStats.length} فئة • {totalFilteredCount} صنف)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search inside classifications */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute right-2 top-2" />
                <input
                  type="text"
                  value={classSearchTerm}
                  onChange={(e) => setClassSearchTerm(e.target.value)}
                  placeholder="بحث في الفئات..."
                  className="w-28 sm:w-36 h-7 pr-6 pl-2 text-[11px] bg-slate-900 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-amber-400 placeholder-slate-500"
                />
              </div>

              {/* Mode switch (Tiles vs Chips) */}
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSlicerDisplayMode('tiles')}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                    slicerDisplayMode === 'tiles' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  كروت تحليلية
                </button>
                <button
                  type="button"
                  onClick={() => setSlicerDisplayMode('chips')}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                    slicerDisplayMode === 'chips' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  مختصر
                </button>
              </div>
            </div>
          </div>

          {/* Slicer Cards / Badges Grid */}
          {filteredClassificationStats.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">
              لا توجد فئات مطابقة للبحث داخل هذه المجموعة
            </div>
          ) : slicerDisplayMode === 'tiles' ? (
            /* Power BI Metric Tiles Mode */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
              {/* All Classifications Tile */}
              <button
                type="button"
                onClick={() => onSelectClassification('الكل')}
                className={`p-2 rounded-xl text-right transition cursor-pointer border flex flex-col justify-between ${
                  selectedClassification === 'الكل'
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-1 ring-amber-300'
                    : 'bg-slate-900 hover:bg-slate-850 text-slate-200 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <span className="font-black text-xs">كل الفئات</span>
                  {selectedClassification === 'الكل' && <Check className="w-3.5 h-3.5 text-slate-950" />}
                </div>
                <div className="pt-1 flex items-center justify-between text-[10px]">
                  <span className="font-bold">{productsInCurrentDept.length} صنف</span>
                  <span className="opacity-80">100%</span>
                </div>
              </button>

              {/* Individual Category Tiles */}
              {filteredClassificationStats.map((stat) => {
                const isSelected = selectedClassification === stat.name;
                return (
                  <button
                    key={stat.name}
                    type="button"
                    onClick={() => onSelectClassification(stat.name)}
                    className={`p-2 rounded-xl text-right transition cursor-pointer border flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-1 ring-amber-300 font-bold'
                        : 'bg-slate-900 hover:bg-slate-850 text-slate-200 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 pb-1 border-b border-white/10">
                      <span className="font-black text-[11px] truncate flex-1" title={stat.name}>
                        {stat.name}
                      </span>
                      {isSelected && <Check className="w-3 h-3 text-slate-950 shrink-0" />}
                    </div>

                    <div className="pt-1.5 space-y-0.5 text-[9px]">
                      <div className="flex items-center justify-between">
                        <span className="opacity-80">الأصناف:</span>
                        <strong className="font-black text-[10px]">{stat.count} صنف</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>المخزون:</span>
                        <span className={isSelected ? 'text-slate-950 font-black' : 'text-amber-300 font-bold'}>
                          {stat.totalCartons} كرتونة
                        </span>
                      </div>
                      {/* Visual progress bar */}
                      <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden mt-1">
                        <div
                          className={`h-full ${isSelected ? 'bg-slate-950' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, stat.percentage)}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Compact Chips Mode */
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              <button
                type="button"
                onClick={() => onSelectClassification('الكل')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  selectedClassification === 'الكل'
                    ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <span>كل الفئات</span>
                <span className="text-[10px] opacity-75">({productsInCurrentDept.length})</span>
              </button>

              {filteredClassificationStats.map((stat) => {
                const isSelected = selectedClassification === stat.name;
                return (
                  <button
                    key={stat.name}
                    type="button"
                    onClick={() => onSelectClassification(stat.name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    <span>{stat.name}</span>
                    <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                      {stat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
