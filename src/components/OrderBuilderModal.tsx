import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Flame,
  Grid,
  Layers,
  List,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Truck,
  User,
  Users,
  Warehouse,
  X,
  Zap,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Customer, Invoice, PaymentMethod, Product } from '../types';
import { ProductImage } from './ProductImage';
import { CustomerFinancialSummaryCard } from './CustomerFinancialSummaryCard';
import { formatCurrency } from '../services/invoiceService';
import { findCustomerMatch, getBranchStockForProduct } from '../services/arabicMatchingService';
import { getDepartmentMeta } from '../data/departmentMeta';

interface OrderBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: (invoice: Invoice) => void;
  initialCustomer?: Customer | null;
}

export const OrderBuilderModal: React.FC<OrderBuilderModalProps> = ({
  isOpen,
  onClose,
  onInvoiceCreated,
  initialCustomer,
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
    addToCart,
    currentUser,
    cloudinaryConfig,
  } = useApp();

  // 1-step-at-a-time Stepper: Step 1 (Products & Cart) -> Step 2 (Customer & Financials) -> Step 3 (Review & Save)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(() => {
    if (initialCustomer && cart.length > 0) return 2;
    return 1;
  });

  // Representative Selection
  const [selectedRepId, setSelectedRepId] = useState<string>(() => currentUser?.id || '');
  const activeRepUser = useMemo(() => {
    return users.find((u) => u.id === selectedRepId) || currentUser;
  }, [users, selectedRepId, currentUser]);

  const activeBranch = useMemo(() => {
    return activeRepUser?.branchName || currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
  }, [activeRepUser, currentUser]);

  // Customer Management - Bound to "All Customers"
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(initialCustomer || null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isUnregisteredCustomerOpen, setIsUnregisteredCustomerOpen] = useState(false);
  const [unregisteredCustomerName, setUnregisteredCustomerName] = useState('');
  const [unregisteredCustomerPhone, setUnregisteredCustomerPhone] = useState('');
  const [unregisteredCustomerAddress, setUnregisteredCustomerAddress] = useState('');

  // Financial & Order Options
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي (كاش)');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Quick Catalog Search & Add in Step 1
  const [isCatalogPickerOpen, setIsCatalogPickerOpen] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogGroup, setCatalogGroup] = useState<string>('all');
  const [catalogFamily, setCatalogFamily] = useState<string>('all');

  // Sync initialCustomer if prop changes
  useEffect(() => {
    if (initialCustomer) {
      setActiveCustomer(initialCustomer);
    }
  }, [initialCustomer]);

  // Filtered master customers for quick customer lookup
  const filteredCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    if (!customerSearchQuery.trim()) return list.slice(0, 15);
    const q = customerSearchQuery.toLowerCase().trim();
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.region && c.region.toLowerCase().includes(q)) ||
          (c.storeName && c.storeName.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [getVisibleCustomers, customers, customerSearchQuery]);

  // Available Item Groups from products
  const availableItemGroups = useMemo(() => {
    const groups = new Set<string>();
    products.forEach((p) => {
      const g = p.itemGroup || p.department || p.category;
      if (g && g.trim()) groups.add(g.trim());
    });
    return Array.from(groups);
  }, [products]);

  // Available Families based on selected Group
  const availableFamilies = useMemo(() => {
    const families = new Set<string>();
    products.forEach((p) => {
      const g = p.itemGroup || p.department || p.category;
      if (catalogGroup === 'all' || g === catalogGroup) {
        const f = p.familyName || p.classification;
        if (f && f.trim()) families.add(f.trim());
      }
    });
    return Array.from(families);
  }, [products, catalogGroup]);

  // Filtered Products for quick addition in Step 1
  const filteredCatalogProducts = useMemo(() => {
    let result = products;

    if (catalogGroup !== 'all') {
      result = result.filter((p) => (p.itemGroup || p.department || p.category) === catalogGroup);
    }
    if (catalogFamily !== 'all') {
      result = result.filter((p) => (p.familyName || p.classification) === catalogFamily);
    }
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.unifiedCode && p.unifiedCode.toLowerCase().includes(q)) ||
          (p.color && p.color.toLowerCase().includes(q))
      );
    }
    return result.slice(0, 24);
  }, [products, catalogGroup, catalogFamily, catalogSearch]);

  // Cart summary calculation
  const summary = useMemo(() => {
    return getCartSummary(discountPercent);
  }, [getCartSummary, discountPercent]);

  if (!isOpen) return null;

  // Quick select a customer or default to Cash
  const handleSelectCustomer = (cust: Customer) => {
    const matched = findCustomerMatch(customers, {
      customerId: cust.id,
      customerCode: cust.code,
      customerName: cust.name,
      customerPhone: cust.phone,
    });
    setActiveCustomer(matched || cust);
    setIsCustomerDropdownOpen(false);
    setCustomerSearchQuery('');
  };

  const handleSelectDirectCash = () => {
    setActiveCustomer({
      id: `c-cash-${Date.now()}`,
      code: 'CASH-DIRECT',
      name: 'عميل نقدي كاش (مباشر)',
      phone: '',
      address: 'بيع نقدي مباشر بالفرع',
      governorate: 'الفرع',
      branchName: activeBranch,
      currentBalance: 0,
      creditLimit: 0,
      overdueBalance: 0,
    });
    setIsCustomerDropdownOpen(false);
    setIsUnregisteredCustomerOpen(false);
    setCustomerSearchQuery('');
  };

  const handleCreateUnregisteredCustomer = () => {
    const name = unregisteredCustomerName.trim();
    if (!name) {
      setFeedbackError('اكتب اسم العميل الجديد أولاً.');
      return;
    }

    setActiveCustomer({
      id: `c-new-order-${Date.now()}`,
      code: `NEW-${Date.now().toString().slice(-6)}`,
      name,
      phone: unregisteredCustomerPhone.trim(),
      address: unregisteredCustomerAddress.trim(),
      branchName: activeBranch,
      currentBalance: 0,
      creditLimit: 0,
      overdueBalance: 0,
    });
    setIsUnregisteredCustomerOpen(false);
    setIsCustomerDropdownOpen(false);
    setCustomerSearchQuery('');
    setUnregisteredCustomerName('');
    setUnregisteredCustomerPhone('');
    setUnregisteredCustomerAddress('');
    setFeedbackSuccess('تم تجهيز بيانات العميل الجديد للطلبية بنجاح.');
    setTimeout(() => setFeedbackSuccess(null), 3000);
  };

  // Quick Add Item from Cashier Catalog
  const handleQuickAddProduct = (product: Product, count: number, orderType: 'carton' | 'piece' = 'carton') => {
    const res = addToCart(product, orderType, count, 0);
    if (!res.success) {
      setFeedbackError(res.message || 'تعذر إضافة الصنف.');
      setTimeout(() => setFeedbackError(null), 4000);
    } else {
      setFeedbackSuccess(`تمت إضافة ${count} ${orderType === 'carton' ? 'كرتونة' : 'قطعة'} من (${product.name})`);
      setTimeout(() => setFeedbackSuccess(null), 2000);
    }
  };

  // Order Submission & Stock Reservation Handling
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      setFeedbackError('سلة الفاتورة فارغة! يرجى إضافة أصناف للطلبية أولاً.');
      setTimeout(() => setFeedbackError(null), 4000);
      return;
    }

    const effectiveCustomer = activeCustomer
      ? findCustomerMatch(customers, {
          customerId: activeCustomer.id,
          customerCode: activeCustomer.code,
          customerName: activeCustomer.name,
          customerPhone: activeCustomer.phone,
        }) || activeCustomer
      : {
          id: `c-cash-${Date.now()}`,
          code: 'CASH-DIRECT',
          name: 'عميل نقدي كاش (مباشر)',
          phone: '',
          address: 'بيع نقدي مباشر',
          governorate: 'الفرع',
          branchName: activeBranch,
          currentBalance: 0,
        };

    setIsSubmitting(true);
    setFeedbackError(null);

    const balBefore = Number(effectiveCustomer.currentBalance ?? effectiveCustomer.balance ?? 0);
    const credLimit = Number(effectiveCustomer.creditLimit ?? 0);
    const balAfter = balBefore + summary.grandTotal;
    const isExceeded = credLimit > 0 && balAfter > credLimit;
    const reqDown = isExceeded ? Math.max(0, balAfter - credLimit) : 0;
    const overdue = Number(effectiveCustomer.totalOverdueAndDue ?? effectiveCustomer.overdueBalance ?? 0);

    try {
      const result = createOrder({
        customerId: effectiveCustomer.id,
        customerName: effectiveCustomer.name,
        customerCode: effectiveCustomer.code,
        customerPhone: effectiveCustomer.phone,
        customerAddress: effectiveCustomer.address,
        customerTaxNumber: effectiveCustomer.taxNumber,
        repName: activeRepUser?.name || currentUser?.name || 'مندوب المبيعات',
        repId: activeRepUser?.id || currentUser?.id,
        branchName: effectiveCustomer.branchName || activeBranch,
        paymentMethod: paymentMethod,
        discountPercentage: discountPercent,
        notes: invoiceNotes || `فاتورة مبيعات كاشير دريم - تسجيل بواسطة ${currentUser?.name || 'المندوب'}`,
        customerBalanceBefore: balBefore,
        customerCreditLimit: credLimit,
        customerBalanceAfter: balAfter,
        customerOverdueBalance: overdue,
        creditLimitExceeded: isExceeded,
        requiredDownPayment: reqDown,
      });

      if (!result.success || !result.invoice) {
        setFeedbackError(result.message || 'تعذر حفظ الطلبية.');
        setIsSubmitting(false);
        return;
      }

      clearCart();
      onInvoiceCreated(result.invoice);
      onClose();
    } catch (err: any) {
      console.error('Invoice creation error:', err);
      setFeedbackError('حدث خطأ غير متوقع أثناء معالجة الفاتورة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const balBefore = Number(activeCustomer?.currentBalance ?? activeCustomer?.balance ?? 0);
  const balAfter = balBefore + summary.grandTotal;
  const overdueBal = Number(activeCustomer?.totalOverdueAndDue ?? activeCustomer?.overdueBalance ?? 0);
  const creditLimitVal = Number(activeCustomer?.creditLimit ?? 0);
  const isCreditExceeded = creditLimitVal > 0 && balAfter > creditLimitVal;

  return (
    <div
      id="dream-cashier-stepper-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* ================= HEADER & STEPPER BAR ================= */}
        <div className="p-3 sm:p-4 bg-slate-950 border-b border-slate-800 shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <span>شاشة كاشير الفاتورة</span>
                  <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                    خطوة {currentStep} من 3
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  {activeBranch} • المندوب: <span className="text-amber-300 font-bold">{activeRepUser?.name}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Progress Tabs */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1 border-t border-slate-800/80">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                currentStep === 1
                  ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                  : cart.length > 0
                  ? 'bg-slate-800 text-emerald-300 hover:bg-slate-750'
                  : 'bg-slate-850 text-slate-400'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
                currentStep === 1 ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-200'
              }`}>
                {cart.length > 0 && currentStep > 1 ? '✓' : '1'}
              </span>
              <span className="truncate">١. اختيار المنتجات</span>
              {cart.length > 0 && (
                <span className="hidden sm:inline-block text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full font-mono">
                  {cart.length}
                </span>
              )}
            </button>

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => {
                if (cart.length > 0) setCurrentStep(2);
                else setFeedbackError('يرجى إضافة أصناف إلى الفاتورة أولاً.');
              }}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                currentStep === 2
                  ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                  : activeCustomer
                  ? 'bg-slate-800 text-emerald-300 hover:bg-slate-750'
                  : 'bg-slate-850 text-slate-400'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
                currentStep === 2 ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-200'
              }`}>
                {activeCustomer && currentStep > 2 ? '✓' : '2'}
              </span>
              <span className="truncate">٢. العميل والماليات</span>
            </button>

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0) {
                  setFeedbackError('يرجى إضافة أصناف إلى الفاتورة أولاً.');
                  return;
                }
                if (!activeCustomer) {
                  setFeedbackError('يرجى اختيار عميل الفاتورة أولاً.');
                  return;
                }
                setCurrentStep(3);
              }}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                currentStep === 3
                  ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                  : 'bg-slate-850 text-slate-400'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
                currentStep === 3 ? 'bg-slate-950 text-amber-300' : 'bg-slate-700 text-slate-200'
              }`}>
                3
              </span>
              <span className="truncate">٣. تأكيد وحفظ</span>
            </button>
          </div>
        </div>

        {/* ================= NOTIFICATIONS BANNER ================= */}
        {feedbackError && (
          <div className="bg-rose-900/90 text-white p-2.5 px-4 text-xs font-black flex items-center justify-between border-b border-rose-700 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
              <span>{feedbackError}</span>
            </div>
            <button onClick={() => setFeedbackError(null)} className="text-rose-200 hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {feedbackSuccess && (
          <div className="bg-emerald-600 text-white p-2.5 px-4 text-xs font-black flex items-center justify-between border-b border-emerald-500 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
              <span>{feedbackSuccess}</span>
            </div>
            <button onClick={() => setFeedbackSuccess(null)} className="text-emerald-100 hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= STEPPER BODY ================= */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-900 space-y-4">
          
          {/* ================= STEP 1: اختيار ومراجعة المنتجات ================= */}
          {currentStep === 1 && (
            <div className="space-y-4">
              
              {/* Cart Summary Header Banner */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div>
                  <div className="font-black text-white text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-amber-400" />
                    <span>أصناف سلة الفاتورة ({cart.length} أصناف)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    الكراتين: <strong className="text-amber-300">{summary.totalCartons}</strong> كرتونة • القطع: <strong className="text-sky-300">{summary.totalPieces}</strong> قطعة
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-[11px] text-slate-400">إجمالي الأصناف:</div>
                  <div className="text-base sm:text-lg font-black text-amber-400 font-mono">
                    {formatCurrency(summary.grandTotal)}
                  </div>
                </div>
              </div>

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="bg-slate-950/60 border border-dashed border-slate-850 rounded-3xl p-8 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <ShoppingCart className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-200">سلة الفاتورة فارغة حالياً</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      اضغط على زر (إضافة أصناف من الكتالوج) أدناه للبحث واختيار المنتجات بالكرتونة أو القطعة.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCatalogPickerOpen(true)}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تصفح وإضافة الأصناف للطلبية 🛒</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>قائمة الأصناف المضافة:</span>
                    <button
                      type="button"
                      onClick={() => setIsCatalogPickerOpen((prev) => !prev)}
                      className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isCatalogPickerOpen ? 'إخفاء كتالوج الإضافة' : 'إضافة أصناف أخرى ➕'}</span>
                    </button>
                  </div>

                  <div className="divide-y divide-slate-800 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                    {cart.map((item, idx) => {
                      const branchStock = getBranchStockForProduct(item.product, activeBranch);
                      const octoberStock = item.product.mainWarehouseActual || 0;

                      return (
                        <div key={idx} className="p-3 sm:p-3.5 space-y-2.5">
                          {/* Item Header: Image, Title, Codes, Delete */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <ProductImage
                                product={item.product}
                                cloudinaryConfig={cloudinaryConfig}
                                containerClassName="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 shrink-0"
                                className="w-full h-full object-cover"
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="font-black text-white text-xs sm:text-sm line-clamp-2 leading-snug">
                                  {item.product.name}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  {/* Product Code */}
                                  <span className="bg-slate-900 text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded border border-slate-800">
                                    كود: {item.product.code}
                                  </span>
                                  {/* Unified Code */}
                                  {item.product.unifiedCode && (
                                    <span className="bg-indigo-950 text-indigo-300 font-mono font-bold px-1.5 py-0.5 rounded border border-indigo-800 flex items-center gap-0.5">
                                      <span>الموحد:</span>
                                      <span>{item.product.unifiedCode.replace('#', '')}</span>
                                    </span>
                                  )}
                                  {/* Factor */}
                                  <span className="bg-slate-850 text-slate-300 px-1.5 py-0.5 rounded font-bold">
                                    الشدة: {item.cartonQuantity} ق
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Delete Item */}
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 transition cursor-pointer"
                              title="حذف الصنف من الفاتورة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Stocks Info & Quantity Modifiers */}
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-855/80 text-xs">
                            {/* Stock Display */}
                            <div className="flex items-center gap-2 text-[10.5px]">
                              <span className="text-slate-400">
                                الفرع: <strong className={branchStock > 0 ? 'text-emerald-400' : 'text-rose-400'}>{branchStock} ك</strong>
                              </span>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-400">
                                أكتوبر: <strong className="text-amber-300">{octoberStock} ك</strong>
                              </span>
                            </div>

                            {/* Carton & Piece Controls */}
                            <div className="flex items-center gap-3">
                              {/* Cartons Counter */}
                              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                                <span className="text-[10px] text-amber-400 font-bold px-1">كرتونة:</span>
                                <button
                                  type="button"
                                  onClick={() => updateCartItem(item.product.id, { cartonCount: Math.max(0, item.cartonCount - 1) })}
                                  className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-black cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-7 text-center font-black text-amber-300 font-mono text-xs">
                                  {item.cartonCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateCartItem(item.product.id, { cartonCount: item.cartonCount + 1 })}
                                  className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-black cursor-pointer"
                                >
                                  +
                                </button>
                              </div>

                              {/* Pieces Counter */}
                              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                                <span className="text-[10px] text-sky-400 font-bold px-1">قطعة:</span>
                                <button
                                  type="button"
                                  onClick={() => updateCartItem(item.product.id, { pieceCount: Math.max(0, item.pieceCount - 1) })}
                                  className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-black cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-7 text-center font-black text-sky-300 font-mono text-xs">
                                  {item.pieceCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateCartItem(item.product.id, { pieceCount: item.pieceCount + 1 })}
                                  className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-black cursor-pointer"
                                >
                                  +
                                </button>
                              </div>

                              {/* Line Total */}
                              <div className="font-black text-amber-400 font-mono text-xs sm:text-sm text-left min-w-[70px]">
                                {formatCurrency(item.totalPrice)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Catalog Addition Dropdown / Panel */}
              {(isCatalogPickerOpen || cart.length === 0) && (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="font-black text-white text-xs flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-amber-400" />
                      <span>إضافة أصناف سريعة من الكتالوج</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      متاح {products.length} صنف
                    </span>
                  </div>

                  {/* 3 Core Filters: 1. Item Group, 2. Family, 3. Code/Name Search */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* 1. Item Group */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">
                        1. المجموعة الرئيسية (Item Group):
                      </label>
                      <select
                        value={catalogGroup}
                        onChange={(e) => {
                          setCatalogGroup(e.target.value);
                          setCatalogFamily('all');
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="all">كافة المجموعات</option>
                        {availableItemGroups.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Family / Category */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">
                        2. فئة / عائلة الأصناف:
                      </label>
                      <select
                        value={catalogFamily}
                        onChange={(e) => setCatalogFamily(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="all">كافة العائلات</option>
                        {availableFamilies.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Search by Code / Unified Code / Name */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">
                        3. البحث بالكود أو الاسم:
                      </label>
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="كود الصنف أو الموحد..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>

                  {/* Matching Products Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pt-1">
                    {filteredCatalogProducts.map((p) => {
                      const branchStock = getBranchStockForProduct(p, activeBranch);
                      const octoberStock = p.mainWarehouseActual || 0;

                      return (
                        <div
                          key={p.id}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-2 hover:border-amber-400/60 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-white text-xs truncate" title={p.name}>
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                              <span className="font-mono text-amber-300 font-bold">
                                {p.code}
                              </span>
                              {p.unifiedCode && (
                                <span className="font-mono text-indigo-300 font-bold">
                                  #{p.unifiedCode.replace('#', '')}
                                </span>
                              )}
                              <span className="text-slate-400">
                                ({formatCurrency(p.cartonPrice)})
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              الفرع: <strong className={branchStock > 0 ? 'text-emerald-400' : 'text-slate-400'}>{branchStock}</strong> • أكتوبر: <strong className="text-amber-300">{octoberStock}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuickAddProduct(p, 1, 'carton')}
                              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-2 py-1.5 rounded-lg text-[11px] shadow-sm cursor-pointer transition active:scale-95"
                              title="إضافة 1 كرتونة"
                            >
                              + كرتونة
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAddProduct(p, 1, 'piece')}
                              className="bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold px-2 py-1.5 rounded-lg text-[11px] border border-slate-700 cursor-pointer transition active:scale-95"
                              title="إضافة 1 قطعة"
                            >
                              + قطعة
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 1 Bottom Action Bar */}
              <div className="bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-slate-400">إجمالي الفاتورة:</div>
                  <div className="text-base font-black text-amber-400 font-mono">
                    {formatCurrency(summary.grandTotal)}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setCurrentStep(2)}
                  className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none active:scale-95"
                >
                  <span>التالي: اختيار العميل والموقف المالي (2/3)</span>
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>

            </div>
          )}

          {/* ================= STEP 2: اختيار العميل والموقف المالي ================= */}
          {currentStep === 2 && (
            <div className="space-y-4">
              
              {/* Customer Selector Section */}
              <div className="bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="font-black text-white flex items-center gap-1.5">
                    <User className="w-4 h-4 text-amber-400" />
                    <span>تحديد عميل الفاتورة والموقف المالي</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectDirectCash}
                      className="bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 font-bold px-3 py-1 rounded-xl text-xs transition cursor-pointer"
                    >
                      ⚡ بيع نقدي مباشر (كاش)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsUnregisteredCustomerOpen((prev) => !prev)}
                      className="text-sky-300 hover:text-sky-200 font-bold text-xs underline cursor-pointer"
                    >
                      عميل جديد غير مسجل
                    </button>
                  </div>
                </div>

                {/* Unregistered Customer Drawer */}
                {isUnregisteredCustomerOpen && (
                  <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-3 space-y-2 text-xs animate-in fade-in">
                    <div className="font-black text-sky-200">إدخال بيانات عميل جديد للطلبية فقط:</div>
                    <input
                      value={unregisteredCustomerName}
                      onChange={(e) => setUnregisteredCustomerName(e.target.value)}
                      placeholder="اسم العميل / المحل *"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={unregisteredCustomerPhone}
                        onChange={(e) => setUnregisteredCustomerPhone(e.target.value)}
                        placeholder="رقم الهاتف (اختياري)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <input
                        value={unregisteredCustomerAddress}
                        onChange={(e) => setUnregisteredCustomerAddress(e.target.value)}
                        placeholder="العنوان (اختياري)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateUnregisteredCustomer}
                      className="w-full rounded-lg bg-sky-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-sky-300 cursor-pointer"
                    >
                      استخدام هذا العميل للطلبية
                    </button>
                  </div>
                )}

                {/* Customer Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="ابحث بالاسم، كود العميل، أو رقم الهاتف..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Customer Search Live Suggestions */}
                {isCustomerDropdownOpen && (
                  <div className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-slate-850 z-30">
                    <button
                      type="button"
                      onClick={handleSelectDirectCash}
                      className="w-full p-2.5 text-right hover:bg-slate-800 transition flex items-center justify-between text-xs font-black text-amber-300 cursor-pointer"
                    >
                      <span>⚡ عميل نقدي كاش (مباشر)</span>
                      <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded">كاش</span>
                    </button>
                    {filteredCustomers.map((c) => {
                      const bal = c.currentBalance ?? c.balance ?? 0;
                      return (
                        <button
                          key={c.id || c.code}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full p-2.5 text-right hover:bg-slate-850 transition flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-white truncate">{c.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              كود: {c.code || '---'} • {c.branchName} • {c.salesRepName || c.repName || 'مندوب غير محدد'}
                            </div>
                          </div>
                          <div className="text-left font-mono font-bold text-amber-400 text-xs shrink-0 mr-2">
                            {formatCurrency(bal)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Selected Customer & Full Financial Position Card */}
              {activeCustomer ? (
                <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-4">
                  {/* Customer Banner */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-850 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-md font-mono">
                          كود: {activeCustomer.code || '---'}
                        </span>
                        <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          {activeCustomer.branchName || activeBranch}
                        </span>
                        {activeCustomer.tier && (
                          <span className="bg-indigo-950 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            فئة {activeCustomer.tier}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black text-white">{activeCustomer.name}</h3>
                      <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>المندوب: <strong className="text-amber-300">{activeCustomer.salesRepName || activeCustomer.repName || activeRepUser?.name}</strong></span>
                        {activeCustomer.phone && (
                          <>
                            <span>•</span>
                            <a href={`tel:${activeCustomer.phone}`} className="text-emerald-400 hover:underline flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{activeCustomer.phone}</span>
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveCustomer(null)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer transition shrink-0"
                    >
                      تغيير العميل 👤
                    </button>
                  </div>

                  {/* 4 Financial KPIs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* KPI 1: Current Debt */}
                    <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-bold">المديونية الحالية:</div>
                      <div className="text-sm sm:text-base font-black text-purple-300 font-mono mt-0.5">
                        {formatCurrency(balBefore)}
                      </div>
                    </div>

                    {/* KPI 2: Overdue / Due */}
                    <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
                      <div className="text-[10px] text-rose-400 font-bold">المستحقات والمتأخرات:</div>
                      <div className={`text-sm sm:text-base font-black font-mono mt-0.5 ${overdueBal > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {formatCurrency(overdueBal)}
                      </div>
                    </div>

                    {/* KPI 3: Credit Limit */}
                    <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800">
                      <div className="text-[10px] text-sky-400 font-bold">الحد الائتماني:</div>
                      <div className="text-sm sm:text-base font-black text-sky-300 font-mono mt-0.5">
                        {creditLimitVal > 0 ? formatCurrency(creditLimitVal) : 'بدون سقف'}
                      </div>
                    </div>

                    {/* KPI 4: Balance After Invoice */}
                    <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/30">
                      <div className="text-[10px] text-amber-300 font-bold">الرصيد بعد الفاتورة:</div>
                      <div className="text-sm sm:text-base font-black text-amber-400 font-mono mt-0.5">
                        {formatCurrency(balAfter)}
                      </div>
                    </div>
                  </div>

                  {/* Guarantee docs and warning */}
                  {isCreditExceeded && (
                    <div className="bg-rose-950/50 border border-rose-700/60 p-3 rounded-2xl flex items-center gap-2 text-xs text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        تنبيه: هذه الفاتورة تتجاوز الحد الائتماني المعتمد للعميل بمقدار ({formatCurrency(balAfter - creditLimitVal)}). سيتم إرسالها لاعتماد المشرف.
                      </span>
                    </div>
                  )}

                  {activeCustomer.guaranteeDocs && (
                    <div className="text-[11px] text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      📄 <strong>أوراق الضمان:</strong> {activeCustomer.guaranteeDocs}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950/50 border border-dashed border-slate-800 rounded-3xl p-6 text-center text-xs text-slate-400">
                  يرجى البحث واختيار عميل لعرض موقفه المالي ومتابعة الفاتورة.
                </div>
              )}

              {/* Step 2 Bottom Action Bar */}
              <div className="bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>→ رجوع للأصناف</span>
                </button>

                <button
                  type="button"
                  disabled={!activeCustomer}
                  onClick={() => setCurrentStep(3)}
                  className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none active:scale-95"
                >
                  <span>التالي: تأكيد وحفظ الفاتورة (3/3)</span>
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              </div>

            </div>
          )}

          {/* ================= STEP 3: مراجعة وتأكيد حفظ الفاتورة ================= */}
          {currentStep === 3 && (
            <div className="space-y-4">
              
              {/* Order & Customer Summary Box */}
              <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-850 pb-2.5">
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-400">عميل الفاتورة:</div>
                    <div className="font-black text-white text-sm">
                      {activeCustomer?.name} ({activeCustomer?.code || 'CASH'})
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] text-slate-400">الفرع والمندوب:</div>
                    <div className="font-bold text-amber-300 text-xs">
                      {activeBranch} • {activeRepUser?.name}
                    </div>
                  </div>
                </div>

                {/* Items Compact Recap */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>أصناف الطلبية ({cart.length} أصناف):</span>
                    <span className="text-amber-400 font-bold">{summary.totalCartons} كرتونة • {summary.totalPieces} قطعة</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-850 bg-slate-900 rounded-xl p-2 border border-slate-800/80">
                    {cart.map((item, i) => (
                      <div key={i} className="py-1.5 flex items-center justify-between text-xs">
                        <div className="truncate flex-1">
                          <span className="font-bold text-white">{item.product.name}</span>
                          <span className="text-[10px] text-slate-400 mr-2 font-mono">({item.product.code})</span>
                        </div>
                        <div className="text-slate-300 text-center font-bold px-2 shrink-0">
                          {item.cartonCount > 0 && <span className="text-amber-300">{item.cartonCount} ك </span>}
                          {item.pieceCount > 0 && <span className="text-sky-300">{item.pieceCount} ق</span>}
                        </div>
                        <div className="font-black text-amber-400 font-mono text-left w-20 shrink-0">
                          {formatCurrency(item.totalPrice)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Payment Method, Discount & Notes */}
              <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-4">
                {/* Payment Method */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    طريقة السداد:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['نقدي (كاش)', 'آجل', 'على دفعات', 'شيكات'] as PaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`p-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                          paymentMethod === method
                            ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                            : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-850'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Discount */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-300">نسبة الخصم التجاري الإضافي (%):</span>
                    {discountPercent > 0 && (
                      <span className="text-emerald-400 font-mono font-bold">
                        خصم: {formatCurrency(summary.discountAmount)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {[0, 2, 5, 10].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(pct)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                          discountPercent === pct
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                      className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="خصم %"
                    />
                  </div>
                </div>

                {/* Rep Notes */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    ملاحظات الفاتورة للمشرف:
                  </label>
                  <textarea
                    rows={2}
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    placeholder="أي تعليمات تسليم، مواعيد، أو ملاحظات إضافية..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Final Financial Totals Box */}
              <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>المجموع قبل الخصم:</span>
                  <span className="font-mono text-sm font-bold text-white">{formatCurrency(summary.subtotal)}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex items-center justify-between text-emerald-400">
                    <span>الخصم ({discountPercent}%):</span>
                    <span className="font-mono font-bold">-{formatCurrency(summary.discountAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-sm font-black text-white">الصافي المطلوب سداده:</span>
                  <span className="text-xl font-black text-amber-400 font-mono">{formatCurrency(summary.grandTotal)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <span>رصيد العميل بعد إضافة هذه الفاتورة:</span>
                  <span className="font-mono font-bold text-purple-300">{formatCurrency(balAfter)}</span>
                </div>
              </div>

              {/* Step 3 Bottom Action Bar */}
              <div className="bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>→ رجوع لبيانات العميل</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || cart.length === 0}
                  onClick={handleSubmitOrder}
                  className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs sm:text-sm shadow-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none active:scale-95"
                >
                  <CheckCircle2 className="w-5 h-5 text-slate-950" />
                  <span>{isSubmitting ? 'جاري حفظ الفاتورة...' : 'تأكيد وحفظ الفاتورة الآن 🛒'}</span>
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
