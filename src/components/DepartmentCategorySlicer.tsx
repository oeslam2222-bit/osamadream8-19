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
import { DEPARTMENT_METADATA_MAP, getDepartmentMeta } from '../data/departmentMeta';
import { OFFICIAL_DEPARTMENTS, OfficialDepartment, Product } from '../types';

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

  // 1. Calculate Dynamic Department / Item Group Item Counts from data + official list
  const dynamicItemGroups = useMemo(() => {
    const set = new Set<string>();
    // First include official list
    OFFICIAL_DEPARTMENTS.forEach((d) => set.add(d));
    // Add any custom item group from uploaded products
    products.forEach((p) => {
      if (p.itemGroup && p.itemGroup.trim()) set.add(p.itemGroup.trim());
      else if (p.department && p.department.trim()) set.add(p.department.trim());
    });
    return Array.from(set).filter(Boolean);
  }, [products]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { 'الكل': products.length };
    dynamicItemGroups.forEach((dept) => {
      counts[dept] = 0;
    });

    products.forEach((p) => {
      const pDept = (p.itemGroup || p.department || '').trim().toLowerCase();
      const pCat = (p.category || '').trim().toLowerCase();
      const pName = (p.name || '').trim().toLowerCase();
      const pCode = (p.code || '').trim().toLowerCase();

      dynamicItemGroups.forEach((dept) => {
        const dLower = dept.toLowerCase();
        if (
          pDept === dLower ||
          pCat === dLower ||
          pName.includes(dLower) ||
          pCode.startsWith(dept.slice(0, 3).toLowerCase())
        ) {
          counts[dept] = (counts[dept] || 0) + 1;
        }
      });
    });

    return counts;
  }, [products, dynamicItemGroups]);

  // 2. Filter products by selected department to extract accurate classifications/families for this department
  const productsInCurrentDept = useMemo(() => {
    if (selectedDepartment === 'الكل') return products;

    const target = selectedDepartment.toLowerCase().trim();
    return products.filter((p) => {
      const pDept = (p.itemGroup || p.department || '').toLowerCase().trim();
      const pCat = (p.category || '').toLowerCase().trim();
      const pName = (p.name || '').toLowerCase().trim();
      const pCode = (p.code || '').toLowerCase().trim();

      return (
        pDept === target ||
        pCat === target ||
        pDept.includes(target) ||
        pCat.includes(target) ||
        pName.includes(target) ||
        pCode.startsWith(selectedDepartment.slice(0, 3).toLowerCase())
      );
    });
  }, [products, selectedDepartment]);

  // 3. Calculate Classifications / Family Names and their Power BI Style Metrics
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

  // 4. Filter classifications by search query
  const filteredClassificationStats = useMemo(() => {
    if (!classSearchTerm.trim()) return classificationStats;
    const q = classSearchTerm.toLowerCase().trim();
    return classificationStats.filter((c) => c.name.toLowerCase().includes(q));
  }, [classificationStats, classSearchTerm]);

  const currentDeptMeta = getDepartmentMeta(selectedDepartment === 'الكل' ? undefined : selectedDepartment);
  const CurrentDeptIcon = currentDeptMeta.icon;

  const totalFilteredCount =
    selectedClassification === 'الكل'
      ? productsInCurrentDept.length
      : classificationStats.find((c) => c.name === selectedClassification)?.count || 0;

  return (
    <div className={`space-y-2 bg-slate-900/95 text-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-800 shadow-lg ${className}`}>
      {/* 1. Header Bar: Departments & Power BI Slicer Title */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-black text-xs sm:text-sm text-white">
                تصفية المجموعات (Item Group) والعائلات (Family)
              </h3>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-black px-1.5 py-0.2 rounded-md">
                Slicer 📊
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              اختر المجموعة الرئيسية لتظهر لك العائلات التابعة لها تلقائياً
            </p>
          </div>
        </div>

        {/* View toggles & Clear Slicers */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setDeptViewStyle(deptViewStyle === 'scroll' ? 'grid' : 'scroll')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg border border-slate-700 flex items-center gap-1 transition cursor-pointer"
            title="تبديل طريقة عرض الأقسام"
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
              title="إلغاء تصفية القسم والفئة"
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
            <option value="الكل">📦 كل المجموعات (Item Groups) - {products.length} صنف</option>
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
            <span>2. عائلة الأصناف (Family Name):</span>
          </label>
          <select
            value={selectedClassification}
            onChange={(e) => onSelectClassification(e.target.value)}
            className="w-full h-10 px-3 bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
          >
            <option value="الكل">🏷️ كل العائلات التابعة لـ ({selectedDepartment === 'الكل' ? 'الكل' : selectedDepartment})</option>
            {classificationStats.map((stat) => (
              <option key={stat.name} value={stat.name}>
                {stat.name} ({stat.count} صنف • {stat.totalCartons} كرتونة)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. The 21 Departments Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
          <span className="flex items-center gap-1">
            <span>القسم المختار:</span>
            <strong className="text-amber-300">
              {selectedDepartment === 'الكل' ? 'جميع الأقسام' : currentDeptMeta.nameArabic}
            </strong>
          </span>
          <span className="text-[10px] text-slate-400">
            {products.length} صنف مسجل
          </span>
        </div>

        {/* Scrollable Carousel vs Grid of Departments */}
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
              <span>كل الأقسام</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedDepartment === 'الكل' ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {products.length}
              </span>
            </button>

            {/* 21 Department Buttons */}
            {OFFICIAL_DEPARTMENTS.map((dept) => {
              const meta = DEPARTMENT_METADATA_MAP[dept];
              const IconComp = meta.icon;
              const count = deptCounts[dept] || 0;
              const isSelected = selectedDepartment === dept;

              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => {
                    onSelectDepartment(dept);
                    onSelectClassification('الكل');
                  }}
                  className={`whitespace-nowrap px-2.5 h-9 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 ring-2 ring-amber-300 shadow-sm font-black'
                      : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700/70'
                  }`}
                  title={`${meta.nameArabic} - ${meta.description}`}
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
                      className={`text-[9px] px-1 py-0.2 rounded-full font-black ${
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
          /* Grid View of Departments */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 pt-0.5 max-h-44 overflow-y-auto p-1 bg-slate-950/40 rounded-xl border border-slate-800">
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
                <div className="font-black text-xs">كل الأقسام</div>
                <div className="text-[9px] opacity-80">{products.length} صنف</div>
              </div>
            </button>

            {OFFICIAL_DEPARTMENTS.map((dept) => {
              const meta = DEPARTMENT_METADATA_MAP[dept];
              const IconComp = meta.icon;
              const count = deptCounts[dept] || 0;
              const isSelected = selectedDepartment === dept;

              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => {
                    onSelectDepartment(dept);
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

      {/* 3. Power BI Classifications (الفئات) Interactive Drilldown Panel */}
      {!isSlicerCollapsed && (
        <div className="pt-1.5 border-t border-slate-800/80 space-y-2">
          {/* Sub-header: Current Department Context & Subcategories Count */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center font-black ${
                  selectedDepartment === 'الكل'
                    ? 'bg-amber-400 text-slate-950'
                    : `${currentDeptMeta.colorClasses.bgLight} ${currentDeptMeta.colorClasses.text}`
                }`}
              >
                <CurrentDeptIcon className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-black text-slate-200">
                فئات {selectedDepartment === 'الكل' ? 'كافة الأقسام' : currentDeptMeta.shortLabel}:
              </span>
              <span className="text-[10px] text-amber-300 font-bold bg-slate-800 px-1.5 py-0.2 rounded-md border border-slate-700">
                {classificationStats.length} فئة
              </span>
            </div>

            {/* Slicer Controls: Search & View Mode */}
            <div className="flex items-center gap-1.5">
              {/* Slicer Search */}
              <div className="relative flex-1 sm:w-36">
                <Search className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={classSearchTerm}
                  onChange={(e) => setClassSearchTerm(e.target.value)}
                  placeholder="بحث بالفئات..."
                  className="w-full h-7 pr-6 pl-6 bg-slate-800 text-white placeholder-slate-400 text-[11px] rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                {classSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setClassSearchTerm('')}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Tiles vs Chips Toggle */}
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setSlicerDisplayMode('tiles')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    slicerDisplayMode === 'tiles' ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                  title="عرض بطاقات مدمجة"
                >
                  بطاقات 🗂️
                </button>
                <button
                  type="button"
                  onClick={() => setSlicerDisplayMode('chips')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    slicerDisplayMode === 'chips' ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                  title="عرض أزرار سريعة"
                >
                  أزرار 🏷️
                </button>
              </div>
            </div>
          </div>

          {/* 4. Power BI Slicers Content (Cards or Chips) */}
          {classificationStats.length === 0 ? (
            <div className="text-center py-3 text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
              لا توجد فئات مسجلة تحت هذا القسم.
            </div>
          ) : slicerDisplayMode === 'tiles' ? (
            /* Compact Power BI Style Interactive Slicer Tiles */
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1 bg-slate-950/30 rounded-xl border border-slate-800/80">
              {/* 'All Classifications' Slicer Card */}
              <button
                type="button"
                onClick={() => onSelectClassification('الكل')}
                className={`min-w-[120px] max-w-[180px] flex-1 p-2 rounded-xl text-right transition cursor-pointer relative overflow-hidden border flex flex-col justify-between active:scale-95 ${
                  selectedClassification === 'الكل'
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 border-amber-300 shadow-md ring-1 ring-amber-300'
                    : 'bg-slate-800/90 text-slate-200 hover:bg-slate-750 border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[11px] font-black truncate">جميع الفئات</span>
                  {selectedClassification === 'الكل' ? (
                    <span className="w-3.5 h-3.5 rounded-full bg-slate-950 text-amber-300 flex items-center justify-center text-[9px] shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="text-[9px] px-1 py-0.2 rounded-full font-bold bg-slate-700 text-slate-300">
                      100%
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-black">{productsInCurrentDept.length}</span>
                    <span className={`text-[9px] ${selectedClassification === 'الكل' ? 'text-slate-800' : 'text-slate-400'}`}>
                      صنف بالقسم
                    </span>
                  </div>
                </div>
              </button>

              {/* Filtered Slicer Cards for each classification */}
              {filteredClassificationStats.map((stat) => {
                const isSelected = selectedClassification === stat.name;

                return (
                  <button
                    key={stat.name}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onSelectClassification('الكل');
                      } else {
                        onSelectClassification(stat.name);
                      }
                    }}
                    className={`min-w-[120px] max-w-[190px] flex-1 p-2 rounded-xl text-right transition cursor-pointer relative overflow-hidden border flex flex-col justify-between group active:scale-95 ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 border-amber-300 shadow-md ring-1 ring-amber-300'
                        : 'bg-slate-800/90 text-slate-200 hover:bg-slate-750 hover:border-slate-600 border-slate-700/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="font-black text-[11px] truncate leading-tight" title={stat.name}>
                          {stat.name}
                        </div>
                        {isSelected && (
                          <span className="w-3.5 h-3.5 rounded-full bg-slate-950 text-amber-300 flex items-center justify-center text-[9px] shrink-0">
                            <Check className="w-2 h-2" />
                          </span>
                        )}
                      </div>

                      {/* Compact metrics */}
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-baseline gap-1">
                          <strong className="text-xs font-black">{stat.count}</strong>
                          <span className={`text-[9px] ${isSelected ? 'text-slate-800' : 'text-slate-400'}`}>
                            أصناف
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-black px-1 rounded ${
                            isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-amber-300'
                          }`}
                        >
                          {stat.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Stock indicator */}
                    <div className="mt-1 pt-1 border-t border-slate-700/40 flex items-center justify-between text-[9px]">
                      <span className={isSelected ? 'text-slate-800' : 'text-slate-400'}>المخزون:</span>
                      <strong className={isSelected ? 'text-slate-950 font-black' : 'text-emerald-400 font-bold'}>
                        {stat.totalCartons} ك
                      </strong>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Compact Chips View */
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <button
                type="button"
                onClick={() => onSelectClassification('الكل')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1 ${
                  selectedClassification === 'الكل'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <span>جميع الفئات</span>
                <span className="text-[9px] px-1 py-0.2 bg-slate-900/40 rounded-full">
                  {productsInCurrentDept.length}
                </span>
              </button>

              {filteredClassificationStats.map((stat) => {
                const isSelected = selectedClassification === stat.name;
                return (
                  <button
                    key={stat.name}
                    type="button"
                    onClick={() => {
                      if (isSelected) onSelectClassification('الكل');
                      else onSelectClassification(stat.name);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 shadow-xs font-black ring-1 ring-amber-300'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                    }`}
                  >
                    <span>{stat.name}</span>
                    <span
                      className={`text-[9px] px-1 rounded-full font-bold ${
                        isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-200'
                      }`}
                    >
                      {stat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 5. Drilldown Breadcrumb & Active Filter Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800 text-[10px]">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Filter className="w-3 h-3 text-amber-400 shrink-0" />
              <span>المسار:</span>
              <strong className="text-amber-300 font-bold">
                {selectedDepartment === 'الكل' ? 'كل الأقسام (21)' : currentDeptMeta.shortLabel}
              </strong>
              {selectedClassification !== 'الكل' && (
                <>
                  <span className="text-slate-500">/</span>
                  <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black text-[10px]">
                    {selectedClassification}
                  </span>
                </>
              )}
            </div>

            <div className="text-slate-400">
              الأصناف المطابقة: <strong className="text-white font-bold">{totalFilteredCount}</strong> صنف
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
