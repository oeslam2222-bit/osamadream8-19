import {
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Minus,
  Phone,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  Trash2,
  User,
  UserCheck,
  Users,
  Warehouse,
  X
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ProductImage } from './ProductImage';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { downloadInvoicePDF } from '../services/pdfService';
import { Customer, PaymentMethod } from '../types';
import { getDepartmentMeta } from '../data/departmentMeta';
import {
  doesCustomerBelongToBranch,
  doesCustomerBelongToRep,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  isBranchMatch,
  getBranchStockForProduct,
} from '../services/arabicMatchingService';

interface OrderBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: (invoice: any) => void;
}

export const OrderBuilderModal: React.FC<OrderBuilderModalProps> = ({
  isOpen,
  onClose,
  onInvoiceCreated,
}) => {
  const {
    cart,
    products,
    customers,
    users,
    getVisibleCustomers,
    updateCartItem,
    removeFromCart,
    clearCart,
    getCartSummary,
    createOrder,
    currentUser,
    cloudinaryConfig
  } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerTierFilter, setSelectedCustomerTierFilter] = useState<'all' | 'VIP' | 'A' | 'B' | 'C'>('all');
  const [selectedSupervisorRepFilter, setSelectedSupervisorRepFilter] = useState<string>('all');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isNewCustomerMode, setIsNewCustomerMode] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerTaxNumber, setCustomerTaxNumber] = useState('');
  const [customerBranch, setCustomerBranch] = useState('');
  const [customerRep, setCustomerRep] = useState('');
  const [customerTier, setCustomerTier] = useState<string>('');

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي (كاش)');
  const [orderNotes, setOrderNotes] = useState('');
  const [splitShortagesToBackorder, setSplitShortagesToBackorder] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Supervised reps for supervisor or branch manager
  const supervisedReps = useMemo(() => {
    if (!currentUser || !users) return [];
    if (currentUser.role === 'supervisor') {
      return users.filter(
        (u) =>
          u.supervisorId === currentUser.id ||
          (u.role === 'sales_rep' && isBranchMatch(u.branchName, currentUser.branchName))
      );
    }
    if (currentUser.role === 'branch_manager') {
      return users.filter(
        (u) => u.role === 'sales_rep' && isBranchMatch(u.branchName, currentUser.branchName)
      );
    }
    return [];
  }, [users, currentUser]);

  const visibleCustomers = useMemo(() => {
    return (typeof getVisibleCustomers === 'function' ? getVisibleCustomers() : customers) || [];
  }, [getVisibleCustomers, customers, currentUser]);

  // Filtered customers for search dropdown by search query, rep filter, and tier
  const filteredCustomers = useMemo(() => {
    return visibleCustomers.filter((c) => {
      // Supervisor rep-level filter
      if (selectedSupervisorRepFilter !== 'all' && (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager')) {
        const targetRep = supervisedReps.find((r) => r.id === selectedSupervisorRepFilter);
        if (targetRep && !doesCustomerBelongToRep(c, targetRep)) {
          return false;
        }
      }

      // Tier filter
      if (selectedCustomerTierFilter !== 'all') {
        const cTier = (c.tier || '').toUpperCase();
        if (selectedCustomerTierFilter === 'VIP' && !cTier.includes('VIP') && !cTier.includes('مميز')) return false;
        if (selectedCustomerTierFilter === 'A' && !cTier.includes('A') && !cTier.includes('راقي')) return false;
        if (selectedCustomerTierFilter === 'B' && !cTier.includes('B') && !cTier.includes('متوسط')) return false;
        if (selectedCustomerTierFilter === 'C' && !cTier.includes('C') && !cTier.includes('عادي')) return false;
      }

      // Search Query
      if (customerSearchQuery.trim()) {
        const q = customerSearchQuery.toLowerCase().trim();
        const matches =
          (c.name && isArabicNameMatch(c.name, q)) ||
          c.name.toLowerCase().includes(q) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.storeName && c.storeName.toLowerCase().includes(q)) ||
          (c.branchName && c.branchName.toLowerCase().includes(q)) ||
          (c.salesRepName && c.salesRepName.toLowerCase().includes(q)) ||
          (c.repName && c.repName.toLowerCase().includes(q)) ||
          (c.governorate && c.governorate.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).slice(0, 200);
  }, [visibleCustomers, customerSearchQuery, selectedCustomerTierFilter, selectedSupervisorRepFilter, supervisedReps, currentUser]);

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setIsNewCustomerMode(false);
    setCustomerName(c.name);
    setCustomerCode(c.code || '');
    setCustomerPhone(c.phone || '');
    setCustomerAddress(c.address || c.governorate || '');
    setCustomerTaxNumber(c.taxNumber || '');
    setCustomerBranch(c.branchName || currentUser?.branchName || '');
    setCustomerRep(c.salesRepName || c.repName || (currentUser?.role === 'sales_rep' ? currentUser.name : ''));
    setCustomerTier(c.tier || 'عادي');
    setIsCustomerDropdownOpen(false);
    setCustomerSearchQuery('');
  };

  const handleStartNewCustomer = (customName?: string) => {
    setSelectedCustomerId('');
    setIsNewCustomerMode(true);
    const typedName = customName !== undefined ? customName : customerSearchQuery;
    setCustomerName(typedName);
    setCustomerCode(`CUST-${Date.now().toString().slice(-4)}`);
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerTaxNumber('');
    setCustomerBranch(currentUser?.branchName || 'الفرع الرئيسي');
    setCustomerRep(currentUser?.role === 'sales_rep' ? currentUser.name : '');
    setCustomerTier('عادي');
    setIsCustomerDropdownOpen(false);
    setCustomerSearchQuery('');
  };

  const handleClearSelectedCustomer = () => {
    setSelectedCustomerId('');
    setIsNewCustomerMode(false);
    setCustomerName('');
    setCustomerCode('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerTaxNumber('');
    setCustomerBranch('');
    setCustomerRep('');
    setCustomerTier('');
  };

  if (!isOpen) return null;

  const summary = getCartSummary(discountPercent);
  const todayDate = new Date().toISOString().slice(0, 10);
  const hasWarehouseItems = cart.some((c) => c.fulfillFromMainWarehouse);

  const handleSubmitOrder = async (andExportExcel = false, andDownloadPDF = false) => {
    const errors: string[] = [];
    if (!customerName.trim()) {
      errors.push('يرجى اختيار عميل من القائمة أو كتابة اسم العميل / المحل');
    }
    if (cart.length === 0) {
      errors.push('الطلبية فارغة! يرجى إضافة أصناف أولاً من الكتالوج');
    }

    // Stock check
    for (const item of cart) {
      const liveProd = products.find((p) => p.id === item.product.id) || item.product;
      const branchAvail = Math.max(0, liveProd.branchStockReserved);
      const mainAvail = Math.max(0, liveProd.mainWarehouseReserved);
      const totalAvail = branchAvail + mainAvail;

      if (totalAvail <= 0) {
        errors.push(`الصنف (${liveProd.name}) نفد تماماً من المخزن ورصيده الحالي 0 كرتونة.`);
      } else if (item.cartonCount > totalAvail) {
        errors.push(`الصنف (${liveProd.name}) المطلوب (${item.cartonCount} ك) يتجاوز الحد الأقصى المتاح (${totalAvail} كرتونة فقط).`);
      }
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = createOrder({
        customerName: customerName.trim(),
        customerCode: customerCode.trim() || undefined,
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerTaxNumber: customerTaxNumber.trim(),
        repName: customerRep.trim() || (currentUser?.role === 'sales_rep' ? currentUser.name : undefined),
        branchName: customerBranch.trim() || currentUser?.branchName,
        paymentMethod: paymentMethod,
        discountPercentage: discountPercent,
        notes: orderNotes.trim(),
        splitShortagesToBackorder: splitShortagesToBackorder,
      });

      if (!result.success || !result.invoice) {
        setFormErrors([result.message || 'تعذر تسجيل الطلبية بسبب نفاذ المخزون.']);
        setIsSubmitting(false);
        return;
      }

      const createdInvoice = result.invoice;

      if (andExportExcel) {
        exportElectronicInvoiceToExcel(createdInvoice);
        if (result.shortageInvoice) {
          exportElectronicInvoiceToExcel(result.shortageInvoice);
        }
      }

      if (andDownloadPDF) {
        await downloadInvoicePDF(createdInvoice);
      }

      onInvoiceCreated(createdInvoice);
      onClose();
    } catch (err) {
      console.error(err);
      setFormErrors(['حدث خطأ أثناء حفظ الطلبية. يرجى المحاولة ثانية.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200" id="order-builder-modal-overlay">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900" id="order-builder-modal-container">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800" id="order-builder-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">إنشاء فاتورة مبيعات ذكية جديدة</h2>
              <p className="text-xs text-amber-300 font-semibold mt-0.5">
                شركة دريم للتجارة والتوزيع • حساب ذكي للكراتين والقطع مع قاعدة بيانات العملاء ومخزون الفروع
              </p>
            </div>
          </div>
          <button
            id="order-builder-close-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-white" id="order-builder-body">
          
          {/* Error Banner */}
          {formErrors.length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 text-red-900 p-4 rounded-2xl text-xs space-y-1.5 shadow-sm" id="order-builder-errors">
              <div className="font-black flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>يرجى مراجعة الملاحظات التالية قبل الحفظ:</span>
              </div>
              <ul className="list-disc list-inside pr-4 space-y-1 font-bold">
                {formErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Top Info Bar: Rep Name, Branch, Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                <User className="w-4 h-4 shrink-0" />
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold">المندوب المسئول:</span>
                <strong className="text-slate-900 font-black">{currentUser?.name || 'مندوب المبيعات'}</strong>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                <Building className="w-4 h-4 shrink-0" />
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold">فرع التحميل:</span>
                <strong className="text-slate-900 font-black">{currentUser?.branchName || 'الفرع الرئيسي'}</strong>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <Calendar className="w-4 h-4 shrink-0" />
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-bold">تاريخ الطلبية:</span>
                <strong className="text-slate-900 font-black">{todayDate}</strong>
              </div>
            </div>
          </div>

          {/* Customer Selection & Details (Smart Searchable Dropdown) */}
          <div className="bg-slate-50/80 border border-slate-200 p-4 rounded-2xl space-y-3.5" id="customer-selection-section">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>1. بيانات العميل المسند / تسجيل عميل جديد</span>
                <span className="text-rose-600 font-black">*</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStartNewCustomer('')}
                  className="text-[11px] font-black text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2.5 py-1 rounded-xl cursor-pointer flex items-center gap-1 transition shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ عميل جديد</span>
                </button>
                <span className="text-[10px] text-amber-800 bg-amber-100 px-2.5 py-1 rounded-xl font-bold">
                  {visibleCustomers.length} عميل متاح
                </span>
              </div>
            </div>

            {/* Role-Specific Customer Filter & Security Banner */}
            <div className="space-y-2">
              {currentUser?.role === 'sales_rep' && (
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-950">
                    <UserCheck className="w-4 h-4 text-emerald-700" />
                    <span>🔒 قائمة عملائك المسندين بالفرع ({visibleCustomers.length} عميل)</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-300">
                    👤 المندوب: {currentUser.name} | {currentUser.branchName || 'فرعك'}
                  </span>
                </div>
              )}

              {currentUser?.role === 'supervisor' && (
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-black text-blue-950">
                    <Users className="w-4 h-4 text-blue-700" />
                    <span>👥 عملاء فريق الإشراف بالفرع ({visibleCustomers.length} عميل)</span>
                  </div>
                  {supervisedReps.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-bold text-slate-700">تصفية بالمندوب:</span>
                      <select
                        value={selectedSupervisorRepFilter}
                        onChange={(e) => setSelectedSupervisorRepFilter(e.target.value)}
                        className="bg-white border border-blue-300 text-slate-900 rounded-lg px-2.5 py-1 font-bold text-xs focus:ring-1 focus:ring-blue-500 shadow-2xs"
                      >
                        <option value="all">كل مناديب الإشراف ({supervisedReps.length})</option>
                        {supervisedReps.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {currentUser?.role === 'branch_manager' && (
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-950">
                    <Building className="w-4 h-4 text-amber-700" />
                    <span>🏢 عملاء فرع {currentUser.branchName || ''} ({visibleCustomers.length} عميل)</span>
                  </div>
                  {supervisedReps.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-bold text-slate-700">مندوب الفرع:</span>
                      <select
                        value={selectedSupervisorRepFilter}
                        onChange={(e) => setSelectedSupervisorRepFilter(e.target.value)}
                        className="bg-white border border-amber-300 text-slate-900 rounded-lg px-2.5 py-1 font-bold text-xs"
                      >
                        <option value="all">كل مناديب الفرع</option>
                        {supervisedReps.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-slate-100 border border-slate-300 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-950">
                    <Users className="w-4 h-4 text-slate-800" />
                    <span>🌐 إدارة العملاء العامة ({customers.length} عميل مسجل)</span>
                  </div>
                </div>
              )}

              {/* Tier Filters for Customers */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCustomerTierFilter('all')}
                  className={`px-2.5 py-1 rounded-xl font-black shrink-0 transition cursor-pointer text-[11px] ${
                    selectedCustomerTierFilter === 'all'
                      ? 'bg-slate-800 text-amber-300 shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  الكل ({filteredCustomers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerTierFilter('VIP')}
                  className={`px-2.5 py-1 rounded-xl font-black shrink-0 transition cursor-pointer text-[11px] ${
                    selectedCustomerTierFilter === 'VIP'
                      ? 'bg-amber-400 text-slate-950 shadow-xs ring-1 ring-amber-500'
                      : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-50'
                  }`}
                >
                  ⭐ مميز (VIP)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerTierFilter('A')}
                  className={`px-2.5 py-1 rounded-xl font-black shrink-0 transition cursor-pointer text-[11px] ${
                    selectedCustomerTierFilter === 'A'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  🏆 راقي (A)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerTierFilter('B')}
                  className={`px-2.5 py-1 rounded-xl font-black shrink-0 transition cursor-pointer text-[11px] ${
                    selectedCustomerTierFilter === 'B'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-blue-800 border border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  🏬 متوسط (B)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerTierFilter('C')}
                  className={`px-2.5 py-1 rounded-xl font-black shrink-0 transition cursor-pointer text-[11px] ${
                    selectedCustomerTierFilter === 'C'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  🏪 عادي (C)
                </button>
              </div>
            </div>

            {/* Searchable Customer Dropdown */}
            <div className="relative">
              <label className="block text-slate-900 font-black text-xs mb-1">
                بحث في سجل العملاء (بالاسم، الكود، الهاتف، اسم المحل، المندوب):
              </label>
              
              <div className="relative">
                <input
                  id="customer-search-input"
                  type="text"
                  value={customerSearchQuery}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setIsCustomerDropdownOpen(true);
                  }}
                  placeholder="🔍 اكتب اسم العميل، الكود، المحافظة أو رقم الهاتف لاختياره مباشرة..."
                  className="w-full h-11 pr-10 pl-10 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold text-slate-950 shadow-xs placeholder:text-slate-400"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="absolute left-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isCustomerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Customer Dropdown Results */}
              {isCustomerDropdownOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {customerSearchQuery.trim() && (
                    <div className="p-2.5 bg-emerald-50 border-b border-emerald-200">
                      <button
                        type="button"
                        onClick={() => handleStartNewCustomer(customerSearchQuery.trim())}
                        className="w-full text-right p-2.5 bg-white hover:bg-emerald-100/60 rounded-xl border border-emerald-300 text-emerald-950 font-black text-xs flex items-center justify-between gap-2 cursor-pointer shadow-xs transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-emerald-600 text-white p-1 rounded-lg">
                            <Plus className="w-3.5 h-3.5" />
                          </span>
                          <span>إضافة "{customerSearchQuery.trim()}" كعميل جديد مسند للمندوب</span>
                        </div>
                        <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-black">
                          عميل جديد ✨
                        </span>
                      </button>
                    </div>
                  )}

                  {filteredCustomers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-600 space-y-2">
                      <p>لا يوجد عميل مطابق لبحثك في القائمة الحالية.</p>
                      {customerSearchQuery.trim() && (
                        <button
                          type="button"
                          onClick={() => handleStartNewCustomer(customerSearchQuery.trim())}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                        >
                          + إضافة "{customerSearchQuery.trim()}" كعميل جديد
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredCustomers.map((c) => {
                      const isMyCustomer = currentUser ? doesCustomerBelongToRep(c, currentUser) : true;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full text-right p-3 hover:bg-amber-50/80 transition flex items-center justify-between gap-3 text-xs cursor-pointer"
                        >
                          <div>
                            <div className="font-black text-slate-900 flex items-center flex-wrap gap-1.5">
                              <span>{c.name}</span>
                              {c.storeName && (
                                <span className="text-slate-500 font-normal">({c.storeName})</span>
                              )}
                              {c.code && (
                                <span className="bg-slate-900 text-amber-300 text-[10px] font-mono px-1.5 py-0.2 rounded">
                                  {c.code}
                                </span>
                              )}
                              {isMyCustomer ? (
                                <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[9px] font-black px-1.5 py-0.2 rounded">
                                  مسند لك ✓
                                </span>
                              ) : (
                                (c.salesRepName || c.repName) && (
                                  <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.2 rounded">
                                    المندوب: {c.salesRepName || c.repName}
                                  </span>
                                )
                              )}
                              {c.tier && (
                                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                                  c.tier.includes('VIP') || c.tier.includes('مميز')
                                    ? 'bg-amber-400 text-slate-950'
                                    : c.tier.includes('A') || c.tier.includes('راقي')
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {c.tier}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                              {c.phone && <span>📞 {c.phone}</span>}
                              {c.branchName && <span>🏢 الفرع: {c.branchName}</span>}
                              {c.governorate && <span>📍 {c.governorate}</span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-amber-800 bg-amber-100 hover:bg-amber-200 font-bold px-2.5 py-1 rounded-xl shrink-0 border border-amber-300">
                            اختيار العميل
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Selected Customer Card or Manual / New Customer Input */}
            {selectedCustomerId ? (
              <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="text-xs">
                    <div className="font-black text-slate-950 text-sm flex items-center flex-wrap gap-2">
                      <span>{customerName}</span>
                      {customerCode && (
                        <span className="bg-slate-900 text-amber-300 text-[10px] font-mono px-1.5 py-0.5 rounded">
                          كود: {customerCode}
                        </span>
                      )}
                      {customerTier && (
                        <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded">
                          {customerTier}
                        </span>
                      )}
                      {customerBranch && (
                        <span className="bg-blue-100 text-blue-900 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-200">
                          🏢 {customerBranch}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {customerPhone && <span>📞 {customerPhone}</span>}
                      {customerAddress && <span>📍 {customerAddress}</span>}
                      {customerRep && (
                        <span className="bg-amber-100/70 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                          👤 المندوب المسند: {customerRep}
                        </span>
                      )}
                      {customerTaxNumber && <span>🏛️ ضريبي: {customerTaxNumber}</span>}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelectedCustomer}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold bg-white px-2.5 py-1.5 rounded-xl border border-rose-200 shadow-xs cursor-pointer shrink-0"
                >
                  تغيير العميل
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* NEW CUSTOMER NOTIFICATION BADGE */}
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shrink-0">
                      عميل جديد ✨
                    </span>
                    <span className="font-bold text-emerald-950">
                      {customerName.trim()
                        ? `سيتم حفظ وتوثيق العميل (${customerName}) وإسناده تلقا��ياً للمندوب (${customerRep || currentUser?.name || 'المندوب الحالي'}).`
                        : `أدخل بيانات العميل الجديد أدناه وسيتم تسجيله وربطه بحساب المندوب تلقائياً فور حفظ الفاتورة.`}
                    </span>
                  </div>
                  {isNewCustomerMode && (
                    <button
                      type="button"
                      onClick={() => setIsCustomerDropdownOpen(true)}
                      className="text-[11px] text-emerald-800 hover:text-emerald-950 font-black underline cursor-pointer shrink-0"
                    >
                      أو اختر من المسجلين
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="block text-slate-900 font-black mb-1">
                      اسم العميل / السوبر ماركت <span className="text-rose-600">*</span>
                    </label>
                    <input
                      id="customer-name-input"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="مثال: هايبر ماركت التوحيد والنور، محل سنتر شاهين..."
                      className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold text-slate-950 shadow-xs placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-900 font-black mb-1">
                      رقم هاتف العميل (لإرسال الفاتورة عبر واتساب)
                    </label>
                    <input
                      id="customer-phone-input"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="مثال: 01011122233"
                      className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold text-slate-950 shadow-xs placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-900 font-black mb-1">عنوان العميل / المنطقة</label>
                    <input
                      id="customer-address-input"
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="مثال: شارع مكرم عبيد، المنطقة السادسة، مدينة نصر"
                      className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-semibold text-slate-950 shadow-xs placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-900 font-black mb-1">المندوب المسئول المسند إليه</label>
                    <input
                      type="text"
                      disabled
                      value={`${currentUser?.name || 'مندوب المبيعات'} (@${currentUser?.username || 'rep'})`}
                      className="w-full h-11 px-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-xs cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cart Items Table with Smart Carton & Piece Conversion */}
          <div className="space-y-3" id="cart-items-section">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                <span>2. الأصناف المحجوزة والكميات الذكية (كراتين + قطع)</span>
                <span className="bg-amber-100 text-amber-950 text-xs px-2.5 py-0.5 rounded-full font-black border border-amber-300">
                  {cart.length} أصناف
                </span>
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-rose-600 hover:text-rose-800 font-black flex items-center gap-1 cursor-pointer bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ الطلبية</span>
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
                <ShoppingCart className="w-12 h-12 text-slate-400 mx-auto" />
                <div className="font-black text-slate-800 text-sm">الطلبية فارغة حالياً!</div>
                <p className="text-slate-500 text-xs">
                  توجه إلى كتالوج المنتجات واضغط على (+1 كرتونة) لإضافة أصناف دريم.
                </p>
                <button
                  onClick={onClose}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-5 py-2 rounded-xl text-xs shadow transition cursor-pointer"
                >
                  العودة للكتالوج
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {cart.map((item) => {
                  const liveProd = products.find((p) => p.id === item.product.id) || item.product;
                  const p = liveProd;
                  const cartonQty = p.cartonQuantity && p.cartonQuantity > 0 ? p.cartonQuantity : 1;

                  const targetBranchForStock = customerBranch || currentUser?.branchName || '';
                  const branchActual = getBranchStockForProduct(p, targetBranchForStock);
                  const branchAvail = Math.max(0, branchActual - 5);
                  const mainAvail = Math.max(0, p.mainWarehouseReserved || (p.mainWarehouseActual - 20));
                  const totalAvail = branchAvail + mainAvail;

                  const currentCarton = item.cartonCount || 0;
                  const currentPieces = item.pieceCount || 0;
                  const totalUnits = (currentCarton * cartonQty) + currentPieces;

                  const appliedCartonPrice = p.promoPrice && p.promoPrice > 0 ? p.promoPrice : p.cartonPrice;
                  const piecePrice = p.piecePrice && p.piecePrice > 0 ? p.piecePrice : Math.round((appliedCartonPrice / cartonQty) * 100) / 100;

                  // Stock Fulfillment Allocation Breakdown
                  const fromBranch = Math.min(currentCarton, branchAvail);
                  const fromMain = Math.max(0, currentCarton - fromBranch);
                  const isOverTotalStock = currentCarton > totalAvail;

                  return (
                    <div
                      key={p.id}
                      className={`bg-white border rounded-2xl p-4 shadow-xs space-y-3.5 transition ${
                        isOverTotalStock ? 'border-red-400 bg-red-50/20' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Product Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            product={p}
                            cloudinaryConfig={cloudinaryConfig}
                            containerClassName="w-14 h-14 rounded-xl bg-slate-100 shrink-0 border border-slate-200"
                            className="w-full h-full object-cover"
                            showBadgeOnFallback={false}
                          />
                          <div>
                            <div className="flex items-center flex-wrap gap-1.5 mb-1">
                              <span className="bg-slate-900 text-amber-300 font-mono font-black text-xs px-2 py-0.5 rounded-md">
                                {p.code}
                              </span>
                              {(() => {
                                const deptMeta = getDepartmentMeta(p.department || p.category);
                                const DeptIcon = deptMeta.icon;
                                return (
                                  <span className="bg-amber-100/90 text-amber-950 border border-amber-300/80 text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                    <DeptIcon className="w-3 h-3 text-amber-800" />
                                    <span>{p.department || p.category || 'دريم'}</span>
                                  </span>
                                );
                              })()}
                              {p.classification && (
                                <span className="bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                                  🏷️ {p.classification}
                                </span>
                              )}
                              {p.color && p.color.trim() && p.color !== 'افتراضي' && (
                                <span className="bg-indigo-50 text-indigo-900 border border-indigo-200 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                                  🎨 {p.color}
                                </span>
                              )}
                              {p.size && p.size.trim() && p.size !== 'حجم قياسي' && (
                                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                                  📐 {p.size}
                                </span>
                              )}
                              <span className="bg-amber-100 text-amber-950 font-black text-[10px] px-2 py-0.5 rounded-md border border-amber-200">
                                شدة الكرتونة: {cartonQty} ق
                              </span>
                            </div>
                            <h4 className="font-black text-slate-900 text-xs sm:text-sm">{p.name}</h4>
                            <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
                              <span>
                                سعر الكرتونة: <strong className="text-amber-900 font-black">{formatCurrency(appliedCartonPrice)}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                سعر القطعة: <strong className="text-blue-900 font-bold">{formatCurrency(piecePrice)}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => removeFromCart(p.id)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer transition"
                          title="حذف الصنف من الطلبية"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Stock Allocation & Availability */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-slate-600 shrink-0" />
                          <div className="text-[11px] text-slate-700">
                            <span>المتاح: </span>
                            <strong className="text-emerald-700 font-black">{branchAvail} ك بالفرع</strong>
                            <span> | </span>
                            <strong className="text-blue-700 font-black">{mainAvail} ك بالمركزي</strong>
                            <span> (إجمالي: <strong className="text-slate-950 font-black">{totalAvail} ك</strong>)</span>
                          </div>
                        </div>

                        <div className="text-[11px] font-black">
                          {isOverTotalStock ? (
                            <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md border border-red-300">
                              ⚠️ الكمية تتجاوز الإجمالي المتاح ({totalAvail} ك فقط)!
                            </span>
                          ) : fromBranch > 0 && fromMain > 0 ? (
                            <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1">
                              ⚡ حجز مشترك: {fromBranch} ك فرع + {fromMain} ك مخزن مركزي
                            </span>
                          ) : fromBranch > 0 ? (
                            <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md border border-emerald-300">
                              ✓ حجز كامل من رصيد الفرع ({fromBranch} ك)
                            </span>
                          ) : (
                            <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-300">
                              🏢 حجز كامل من المخزن المركزي بأكتوبر ({fromMain} ك)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Smart Quantity Controls: Cartons & Pieces with Automatic Conversion */}
                      <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                        
                        {/* Cartons Counter */}
                        <div className="sm:col-span-5 flex items-center gap-2">
                          <span className="text-slate-900 font-black text-xs shrink-0">الكراتين:</span>
                          <div className="flex items-center bg-white rounded-xl border border-slate-300 p-0.5 shadow-xs">
                            <button
                              type="button"
                              onClick={() => updateCartItem(p.id, { cartonCount: Math.max(0, currentCarton - 1) })}
                              className="w-8 h-8 flex items-center justify-center text-slate-800 hover:bg-slate-100 rounded-lg transition font-black cursor-pointer"
                              title="تقليل كرتونة"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={currentCarton}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateCartItem(p.id, { cartonCount: Math.max(0, val) });
                              }}
                              className="w-12 text-center bg-transparent font-black text-slate-900 focus:outline-none text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartItem(p.id, { cartonCount: currentCarton + 1 })}
                              className="w-8 h-8 flex items-center justify-center text-slate-800 hover:bg-slate-100 rounded-lg transition font-black cursor-pointer"
                              title="زيادة كرتونة"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[11px] text-slate-500 font-bold">ك</span>
                        </div>

                        {/* Pieces Counter (Automatic Conversion) */}
                        <div className="sm:col-span-4 flex items-center gap-2">
                          <span className="text-slate-900 font-black text-xs shrink-0">القطع:</span>
                          <div className="flex items-center bg-white rounded-xl border border-slate-300 p-0.5 shadow-xs">
                            <button
                              type="button"
                              onClick={() => updateCartItem(p.id, { pieceCount: Math.max(0, currentPieces - 1) })}
                              className="w-8 h-8 flex items-center justify-center text-slate-800 hover:bg-slate-100 rounded-lg transition font-black cursor-pointer"
                              title="تقليل قطعة"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={currentPieces}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateCartItem(p.id, { pieceCount: Math.max(0, val) });
                              }}
                              className="w-12 text-center bg-transparent font-black text-slate-900 focus:outline-none text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartItem(p.id, { pieceCount: currentPieces + 1 })}
                              className="w-8 h-8 flex items-center justify-center text-slate-800 hover:bg-slate-100 rounded-lg transition font-black cursor-pointer"
                              title="زيادة قطعة (تتحول لكرتونة تلقائياً عند اكتمال الشدة)"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[11px] text-slate-500 font-bold">ق</span>
                        </div>

                        {/* Item Total Price */}
                        <div className="sm:col-span-3 text-left">
                          <span className="text-[10px] text-slate-500 block font-bold">إجمالي الصنف:</span>
                          <div className="text-xs sm:text-sm font-black text-amber-950 bg-amber-200/80 px-2.5 py-1 rounded-xl border border-amber-300 inline-block">
                            {formatCurrency(item.totalPrice)}
                          </div>
                        </div>

                      </div>

                      {/* Smart Quantity Status Banner */}
                      <div className="bg-slate-50 rounded-xl p-2 text-[11px] flex flex-wrap items-center justify-between gap-2 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                          <span>البيان بالفاتورة: <strong className="text-slate-950 font-black">{item.quantityDescription || `${currentCarton} كرتونة`}</strong></span>
                        </div>
                        <div className="text-slate-500 font-bold">
                          إجمالي القطع الكلي: <strong className="text-slate-900">{totalUnits} قطعة</strong>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Method & Commercial Discount & Notes */}
          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs" id="payment-and-discount-section">
            <h3 className="text-xs font-black text-slate-900 flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="flex items-center gap-1.5">
                <span>3. شروط السداد والخصم التجاري</span>
              </span>
              <span className="text-[10px] text-slate-500 font-bold">يمكنك تحديد أو إلغاء الخصم (0%) بحرية</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Payment Method */}
              <div>
                <label className="block text-slate-800 font-bold mb-1">طريقة سداد الفاتورة</label>
                <select
                  id="payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-black text-slate-900 shadow-xs"
                >
                  <option value="نقدي (كاش)">نقدي (كاش عند الاستلام)</option>
                  <option value="آجل (30 يوم)">آجل تجاري (30 يوم)</option>
                  <option value="آجل (60 يوم)">آجل تجاري (60 يوم)</option>
                  <option value="تحويل بنكي">تحويل بنكي / إلكتروني</option>
                  <option value="شيك">شيك بنكي معتمد</option>
                </select>
              </div>

              {/* Commercial Discount % */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-800 font-bold">الخصم التجاري الممنوح (%)</label>
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                    {discountPercent > 0 ? `-${formatCurrency(summary.discountAmount)}` : 'بدون خصم (0 ج.م)'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      id="discount-percent-input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={discountPercent}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDiscountPercent(isNaN(val) ? 0 : Math.max(0, Math.min(100, val)));
                      }}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-black text-slate-900 shadow-xs text-center"
                      placeholder="0"
                    />
                    <span className="absolute left-2.5 top-2.5 text-slate-400 font-black text-xs">%</span>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1">
                    {[0, 2, 3.5, 5].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(pct)}
                        className={`px-2 py-2 rounded-lg text-[11px] font-black transition cursor-pointer ${
                          discountPercent === pct
                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {pct === 0 ? '0%' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-800 font-bold mb-1">ملاحظات التحميل والتسليم</label>
                <input
                  id="order-notes-input"
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="مثال: تسليم صباحاً، إرفاق إشعار الخصم..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-slate-900 shadow-xs placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Shortage Backorder Splitting Option */}
          {hasWarehouseItems && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 space-y-2 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitShortagesToBackorder}
                  onChange={(e) => setSplitShortagesToBackorder(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-amber-500 rounded cursor-pointer"
                />
                <div>
                  <span className="font-black text-slate-900 block">
                    فصل أصناف النواقص تلقائياً في فاتورة توريد مستقلة (-NQ) محولة من المخزن المركزي بأكتوبر
                  </span>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    تضمن هذه الميزة إصدار فاتورة فورية لما هو متاح بالفرع، وفاتورة ملحقة بنواقص الطلبية لطلب تحويلها من المخزن الرئيسي المركزي دون تعطيل تسليم العميل.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Customer Appreciation Note */}
          <div className="bg-gradient-to-r from-amber-50 to-amber-100/70 border border-amber-300/80 rounded-2xl p-3.5 text-center shadow-xs">
            <p className="text-xs sm:text-sm font-black text-amber-950 flex items-center justify-center gap-2">
              <span>✨ شكراً لتعاملكم معنا، يسعدنا دائماً أن تكونوا جزءاً من عائلة شركة دريم للتجارة والتوزيع ❤️</span>
            </p>
          </div>

          {/* Financial Summary Box */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl border border-slate-700 space-y-3" id="financial-summary-box">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h4 className="font-black text-sm text-amber-300">الملخص المالي للفاتورة الإلكترونية</h4>
              <span className="text-xs text-slate-300 font-bold">شركة دريم • حساب سعر الكرتونة والقطع والخصم المباشر</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">إجمالي الكراتين</span>
                <strong className="text-base font-black text-amber-400">{summary.totalCartons} كرتونة</strong>
              </div>

              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">إجمالي القطع الكلي</span>
                <strong className="text-sm font-black text-blue-300">{summary.totalPieces} قطعة</strong>
              </div>

              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">المجموع قبل الخصم</span>
                <strong className="text-sm font-black text-slate-200">{formatCurrency(summary.subtotal)}</strong>
              </div>

              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">
                  الخصم التجاري ({discountPercent}%)
                </span>
                <strong className={`text-sm font-black ${discountPercent > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {discountPercent > 0 ? `-${formatCurrency(summary.discountAmount)}` : '0 ج.م'}
                </strong>
              </div>
            </div>

            {/* Grand Total */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-700">
              <div>
                <span className="text-xs text-slate-300 block font-bold">إجمالي الفاتورة الصافي النهائي:</span>
                <div className="text-2xl font-black text-yellow-400 tracking-tight">
                  {formatCurrency(summary.grandTotal)}
                </div>
              </div>
              <div className="text-xs text-emerald-300 font-bold bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                صافي مطلوب سداده: {formatCurrency(summary.grandTotal)}
              </div>
            </div>

          </div>

        </div>

        {/* Modal Actions Footer */}
        <div className="bg-slate-50 p-3 sm:p-4 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5" id="order-builder-footer">
          
          <button
            onClick={onClose}
            className="w-full sm:w-auto h-11 px-4 text-xs font-black text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition cursor-pointer shadow-xs order-last sm:order-first flex items-center justify-center"
          >
            إلغاء الطلبية
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            
            {/* Direct Export to Excel */}
            <button
              id="export-excel-order-btn"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(true, false)}
              className="flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black h-11 px-3.5 rounded-xl text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="تصدير شيت إكسل رسمي مع كود العميل والكراتين والقطع"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>حفظ وتصدير شيت إكسل</span>
            </button>

            {/* Direct Export to PDF */}
            <button
              id="export-pdf-order-btn"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(false, true)}
              className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black h-11 px-3.5 rounded-xl text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="حفظ الطلبية وتحميل فاتورة PDF فورية"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>حفظ وتحميل PDF 📄</span>
            </button>

            {/* Save Order & Open E-Invoice */}
            <button
              id="confirm-order-btn"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(false, false)}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black h-12 sm:h-11 px-5 rounded-xl text-xs sm:text-sm shadow-md transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0 stroke-[2.5]" />
              <span>تأكيد الحجز والفاتورة الإلكترونية</span>
            </button>

          </div>

        </div>

      </div>
    </div>
  );
};
