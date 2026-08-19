import {
  ArrowDownUp,
  Download,
  Edit2,
  FileSpreadsheet,
  Filter,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Warehouse,
  X
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportProductsToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { ItemStatus, Product, SalesPriority } from '../types';

export const InventoryStockView: React.FC = () => {
  const { products, branches, currentUser, addProduct, updateProduct, deleteProduct, adjustStock, selectedBranchFilter } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockTransferModal, setStockTransferModal] = useState<Product | null>(null);
  const [transferAmount, setTransferAmount] = useState<number>(10);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // Form State for Adding / Editing Product
  const [formData, setFormData] = useState<Partial<Product>>({
    code: '',
    name: '',
    salesPriority: 'عادي',
    category: 'بسكويت وويفر',
    status: 'متاح',
    cartonQuantity: 24,
    size: '',
    color: '',
    branchStockActual: 100,
    branchStockReserved: 90,
    mainWarehouseActual: 1000,
    mainWarehouseReserved: 950,
    department: 'الأغذية والحلويات',
    classification: 'سوبر A',
    piecePrice: 10,
    cartonPrice: 220,
    branchName: 'فرع القاهرة - مدينة نصر',
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return ['الكل', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedBranchFilter !== 'الكل' && p.branchName && p.branchName !== selectedBranchFilter) {
        // If specific branch filter is selected, check branch
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const match =
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.department?.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (selectedCategory !== 'الكل' && p.category !== selectedCategory) {
        return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedBranchFilter]);

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    if (editingProduct) {
      updateProduct({ ...editingProduct, ...formData } as Product);
      setEditingProduct(null);
    } else {
      const newProd: Product = {
        id: `p-${Date.now()}`,
        code: formData.code || `DRM-${Date.now()}`,
        name: formData.name || '',
        salesPriority: formData.salesPriority || 'عادي',
        category: formData.category || 'عام',
        status: formData.status || 'متاح',
        cartonQuantity: Number(formData.cartonQuantity) || 12,
        size: formData.size || 'قياسي',
        color: formData.color || 'افتراضي',
        branchStockActual: Number(formData.branchStockActual) || 0,
        branchStockReserved: Number(formData.branchStockReserved) || 0,
        mainWarehouseActual: Number(formData.mainWarehouseActual) || 0,
        mainWarehouseReserved: Number(formData.mainWarehouseReserved) || 0,
        department: formData.department || 'عام',
        classification: formData.classification || 'فئة A',
        promoPrice: formData.promoPrice ? Number(formData.promoPrice) : undefined,
        piecePrice: Number(formData.piecePrice) || 10,
        cartonPrice: Number(formData.cartonPrice) || 200,
        branchName: formData.branchName || 'فرع القاهرة - مدينة نصر',
        cloudinaryPublicId: formData.code,
      };
      addProduct(newProd);
    }

    setShowAddModal(false);
  };

  const handleExecuteTransfer = () => {
    if (!stockTransferModal || transferAmount <= 0) return;
    const piecesToMove = transferAmount * (stockTransferModal.cartonQuantity || 1);

    if (stockTransferModal.mainWarehouseActual < piecesToMove) {
      alert('الكمية المطلوبة تتجاوز المخزون الفعلي المتاح بالمخزن المركزي!');
      return;
    }

    // Move from main warehouse to branch
    adjustStock(stockTransferModal.id, piecesToMove, -piecesToMove);
    setTransferSuccess(`تم بنجاح تحويل ${transferAmount} كرتونة (${piecesToMove} قطعة) لصالح ${stockTransferModal.branchName}`);
    setStockTransferModal(null);
    setTimeout(() => setTransferSuccess(null), 4000);
  };

  return (
    <div className="space-y-4 pb-16">
      
      {/* Transfer Alert Toast */}
      {transferSuccess && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <Truck className="w-5 h-5" />
            <span>{transferSuccess}</span>
          </div>
          <button onClick={() => setTransferSuccess(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Controls */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>مخزون الفروع والمخزن المركزي</span>
              <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {filteredProducts.length} صنف مسجل
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              متابعة الكميات الفعلية وبعد الحجز • طلب تحويل مخزون بين الفروع والمخزن الرئيسي
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Inventory to Excel */}
            <button
              onClick={() => exportProductsToExcel(filteredProducts, selectedBranchFilter)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs shadow-xs transition"
              title="تصدير شيت إكسل كامل بالمخزون"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير كشف المخزون (Excel)</span>
            </button>

            {/* Add New Product (Admin / Branch Manager) */}
            {(currentUser.role === 'admin' || currentUser.role === 'branch_manager') && (
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setFormData({
                    code: `DRM-${100 + products.length + 1}`,
                    name: '',
                    salesPriority: 'عادي',
                    category: 'بسكويت وويفر',
                    status: 'متاح',
                    cartonQuantity: 24,
                    size: '',
                    color: '',
                    branchStockActual: 100,
                    branchStockReserved: 90,
                    mainWarehouseActual: 1000,
                    mainWarehouseReserved: 950,
                    department: 'الأغذية والحلويات',
                    classification: 'سوبر A',
                    piecePrice: 10,
                    cartonPrice: 220,
                    branchName: currentUser.branchName,
                  });
                  setShowAddModal(true);
                }}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-3.5 py-2.5 rounded-xl text-xs shadow transition"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالكود، اسم الصنف، القسم، التصنيف..."
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-bold">التصنيف:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

      </div>

      {/* Inventory Matrix Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-white font-bold">
              <tr>
                <th className="p-3">الكود</th>
                <th className="p-3">اسم الصنف والبيان</th>
                <th className="p-3">التصنيف / القسم</th>
                <th className="p-3 text-center">شدة الكرتونة</th>
                <th className="p-3 text-center">الفرع (فعلي)</th>
                <th className="p-3 text-center">الفرع (بعد الحجز)</th>
                <th className="p-3 text-center">المخزن الرئيسي (فعلي)</th>
                <th className="p-3 text-center">المخزن الرئيسي (بعد الحجز)</th>
                <th className="p-3 text-left">سعر القطعة</th>
                <th className="p-3 text-left">سعر الكرتونة</th>
                <th className="p-3 text-center">التحويل والإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => {
                const lowBranch = p.branchStockActual < 30;

                return (
                  <tr key={p.id} className="hover:bg-amber-50/40 transition">
                    
                    {/* Code */}
                    <td className="p-3 font-mono font-black text-amber-900">
                      <span className="bg-amber-100 px-2 py-0.5 rounded text-[11px] border border-amber-300">
                        {p.code}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="p-3">
                      <div className="font-extrabold text-slate-900 text-xs sm:text-sm">{p.name}</div>
                      <div className="text-[10px] text-slate-400">الحجم: {p.size || '---'} • اللون: {p.color || '---'}</div>
                    </td>

                    {/* Category */}
                    <td className="p-3 text-slate-600">
                      <div>{p.category}</div>
                      <div className="text-[10px] text-slate-400">{p.department}</div>
                    </td>

                    {/* Pack Quantity */}
                    <td className="p-3 text-center font-black text-slate-900">
                      {p.cartonQuantity} ق
                    </td>

                    {/* Branch Actual */}
                    <td className="p-3 text-center font-black">
                      <span className={lowBranch ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                        {p.branchStockActual} ق
                      </span>
                    </td>

                    {/* Branch Reserved */}
                    <td className="p-3 text-center text-slate-600 font-semibold">
                      {p.branchStockReserved} ق
                    </td>

                    {/* Main Warehouse Actual */}
                    <td className="p-3 text-center font-black text-amber-900 bg-amber-50/30">
                      {p.mainWarehouseActual} ق
                    </td>

                    {/* Main Warehouse Reserved */}
                    <td className="p-3 text-center text-slate-600 font-semibold">
                      {p.mainWarehouseReserved} ق
                    </td>

                    {/* Piece Price */}
                    <td className="p-3 text-left font-bold text-slate-900">
                      {formatCurrency(p.promoPrice || p.piecePrice)}
                    </td>

                    {/* Carton Price */}
                    <td className="p-3 text-left font-black text-amber-900">
                      {formatCurrency(p.cartonPrice)}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        
                        {/* Transfer Request button */}
                        <button
                          onClick={() => setStockTransferModal(p)}
                          className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition"
                          title="طلب تغذية مخزون من المخزن المركزي"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>تحويل</span>
                        </button>

                        {/* Edit button */}
                        {(currentUser.role === 'admin' || currentUser.role === 'branch_manager') && (
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setFormData(p);
                              setShowAddModal(true);
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg transition"
                            title="تعديل بيانات الصنف"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete (Admin only) */}
                        {currentUser.role === 'admin' && (
                          <button
                            onClick={() => {
                              if (window.confirm(`هل أنت متأكد من حذف الصنف ${p.name}؟`)) {
                                deleteProduct(p.id);
                              }
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Transfer Modal */}
      {stockTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-500" />
                <span>طلب تحويل مخزون للفرع</span>
              </h3>
              <button onClick={() => setStockTransferModal(null)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="font-black text-slate-900">{stockTransferModal.name}</div>
                <div className="text-slate-500">كود: {stockTransferModal.code} • شدة الكرتونة: {stockTransferModal.cartonQuantity} قطعة</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500">المخزن المركزي (أكتوبر):</div>
                  <strong className="text-amber-900 font-bold text-sm">{stockTransferModal.mainWarehouseActual} قطعة</strong>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <div className="text-slate-500">مخزون الفرع الحالي:</div>
                  <strong className="text-emerald-900 font-bold text-sm">{stockTransferModal.branchStockActual} قطعة</strong>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  عدد الكراتين المطلوب تحويلها للفرع:
                </label>
                <input
                  type="number"
                  min="1"
                  max={Math.floor(stockTransferModal.mainWarehouseActual / (stockTransferModal.cartonQuantity || 1))}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-base text-slate-900 focus:ring-2 focus:ring-amber-400"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  إجمالي القطع المنقولة: <strong>{transferAmount * (stockTransferModal.cartonQuantity || 1)} قطعة</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleExecuteTransfer}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl text-xs shadow-md transition"
              >
                تأكيد التحويل المخزني
              </button>
              <button
                onClick={() => setStockTransferModal(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900">
                {editingProduct ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد لشركة دريم'}
              </h3>
              <button onClick={() => setShowAddModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود الصنف *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="مثال DRM-205"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم الصنف الكامل *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="اسم المنتج وبيانه"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">التصنيف</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">القسم</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">شدة الكرتونة (عدد القطع)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.cartonQuantity}
                    onChange={(e) => setFormData({ ...formData, cartonQuantity: parseInt(e.target.value) || 1 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">أولوية البيع</label>
                  <select
                    value={formData.salesPriority}
                    onChange={(e) => setFormData({ ...formData, salesPriority: e.target.value as SalesPriority })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="مرتفع">مرتفع 🔥</option>
                    <option value="متوسط">متوسط ⚡</option>
                    <option value="عادي">عادي</option>
                    <option value="منخفض">منخفض</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر القطعة (ج.م)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.piecePrice}
                    onChange={(e) => setFormData({ ...formData, piecePrice: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر الكرتونة (ج.م)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.cartonPrice}
                    onChange={(e) => setFormData({ ...formData, cartonPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر العرض الترويجي (إن وجد)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.promoPrice || ''}
                    onChange={(e) => setFormData({ ...formData, promoPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="اختياري"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفرع المخصص</label>
                  <select
                    value={formData.branchName}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black shadow"
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
