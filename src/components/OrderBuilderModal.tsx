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
import { resolveCustomerDuesValue } from '../services/customerDues';

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
  // طريقة الدفع مأخوذة من بيانات العميل المسجل في قاعدة العملاء، أو "نقدي (كاش)" افتراضياً للبيع النقدي المباشر
  const effectivePaymentMethod = useMemo<PaymentMethod>(() => {
    if (!activeCustomer) return 'نقدي (كاش)';
    const pt = (activeCustomer.paymentTerms || '').trim() as PaymentMethod;
    const valid: PaymentMethod[] = ['نقدي (كاش)', 'آجل (30 يوم)', 'آجل (60 يوم)', 'تحويل بنكي', 'شيك'];
    return valid.includes(pt) ? pt : 'نقدي (كاش)';
  }, [activeCustomer]);
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
    return getCartSummary(0);
  }, [getCartSummary]);

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
    const overdue = resolveCustomerDuesValue(effectiveCustomer);

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
        paymentMethod: effectivePaymentMethod,
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
  const overdueBal = resolveCustomerDuesValue(activeCustomer);
  const creditLimitVal = Number(activeCustomer?.creditLimit ?? 0);
  const isCreditExceeded = creditLimitVal > 0 && balAfter > creditLimitVal;
  const remainingCredit = creditLimitVal > 0 ? Math.max(0, creditLimitVal - balAfter) : 0;

  return (
    <div
      id="dream-cashier-stepper-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div className="ord-shell border border-[var(--app-line)] rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* ================= HEADER & STEPPER BAR ================= */}
        <div className="shrink-0">
          <div className="navy-panel text-white p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl grid place-items-center shrink-0 icon-brass shadow-sm">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>شاشة كاشير الفاتورة</span>
                    <span className="badge-brass-dark text-[10px] px-2 py-0.5 rounded-full">
                      خطوة {currentStep} من 3
                    </span>
                  </h2>
                  <p className="text-[11px] text-white/70">
                    {activeBranch} • المندوب: <span className="t-brass font-bold">{activeRepUser?.name}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="btn-ondark p-2 rounded-xl transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stepper Progress Tabs */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 bg-[#eef3f8] border-b border-[var(--app-line)]">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`pill-filter p-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                currentStep === 1 ? 'on' : ''
              }`}
            >
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-black shrink-0 ${
                currentStep === 1
                  ? 'bg-[var(--app-accent)] text-[#231a05]'
                  : cart.length > 0 && currentStep > 1
                  ? 'tint-ok'
                  : 'bg-[#eef3f8] t-muted'
              }`}>
                {cart.length > 0 && currentStep > 1 ? '✓' : '1'}
              </span>
              <span className="truncate">١. اختيار المنتجات</span>
              {cart.length > 0 && (
                <span className="hidden sm:inline-block app-num text-[10px] bg-[#eef3f8] t-navy px-1.5 py-0.5 rounded-full">
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
              className={`pill-filter p-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                currentStep === 2 ? 'on' : ''
              }`}
            >
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-black shrink-0 ${
                currentStep === 2
                  ? 'bg-[var(--app-accent)] text-[#231a05]'
                  : activeCustomer && currentStep > 2
                  ? 'tint-ok'
                  : 'bg-[#eef3f8] t-muted'
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
              className={`pill-filter p-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                currentStep === 3 ? 'on' : ''
              }`}
            >
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-black shrink-0 ${
                currentStep === 3
                  ? 'bg-[var(--app-accent)] text-[#231a05]'
                  : 'bg-[#eef3f8] t-muted'
              }`}>
                3
              </span>
              <span className="truncate">٣. تأكيد وحفظ</span>
            </button>
          </div>
        </div>

        {/* ================= NOTIFICATIONS BANNER ================= */}
        {feedbackError && (
          <div className="ord-note risk shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{feedbackError}</span>
            </div>
            <button onClick={() => setFeedbackError(null)} className="p-1 cursor-pointer opacity-75 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {feedbackSuccess && (
          <div className="ord-note ok shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedbackSuccess}</span>
            </div>
            <button onClick={() => setFeedbackSuccess(null)} className="p-1 cursor-pointer opacity-75 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= STEPPER BODY ================= */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-[#eef3f8] space-y-4">
          
          {/* ================= STEP 1: اختيار ومراجعة المنتجات ================= */}
          {currentStep === 1 && (
            <div className="space-y-4">
              
              {/* Cart Summary Header Banner */}
              <div className="ord-card p-3.5 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div>
                  <div className="font-black text-[var(--app-ink)] text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 t-brass" />
                    <span>أصناف سلة الفاتورة ({cart.length} أصناف)</span>
                  </div>
                  <div className="text-[11px] t-muted mt-0.5">
                    الكراتين: <strong className="t-navy app-num">{summary.totalCartons}</strong> كرتونة • القطع: <strong className="t-navy app-num">{summary.totalPieces}</strong> قطعة
                  </div>
                </div>

                <div className="text-left">
                  <div className="text-[11px] t-muted">إجمالي الأصناف:</div>
                  <div className="dream-amt app-ink-brass text-base sm:text-lg">
                    {formatCurrency(summary.grandTotal)}
                  </div>
                </div>
              </div>

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="bg-white/60 border border-dashed border-[#b8c9db] rounded-[var(--app-radius)] p-8 text-center space-y-3">
                  <div className="w-14 h-14 rounded-xl tint-navy grid place-items-center mx-auto">
                    <ShoppingCart className="w-7 h-7 t-navy" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-[var(--app-ink)]">سلة الفاتورة فارغة حالياً</h4>
                    <p className="text-xs t-muted max-w-sm mx-auto">
                      اضغط على زر (إضافة أصناف من الكتالوج) أدناه للبحث واختيار المنتجات بالكرتونة أو القطعة.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCatalogPickerOpen(true)}
                    className="btn-primary px-4 py-2.5 text-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تصفح وإضافة الأصناف للطلبية 🛒</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs t-muted px-1">
                    <span>قائمة الأصناف المضافة:</span>
                    <button
                      type="button"
                      onClick={() => setIsCatalogPickerOpen((prev) => !prev)}
                      className="app-link flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isCatalogPickerOpen ? 'إخفاء كتالوج الإضافة' : 'إضافة أصناف أخرى ➕'}</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {cart.map((item, idx) => {
                      const branchStock = getBranchStockForProduct(item.product, activeBranch);
                      const octoberStock = item.product.mainWarehouseActual || 0;

                      return (
                        <div key={idx} className="ord-card p-3 sm:p-3.5 space-y-2.5">
                          {/* Item Header: Image, Title, Codes, Delete */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <ProductImage
                                product={item.product}
                                cloudinaryConfig={cloudinaryConfig}
                                containerClassName="w-12 h-12 rounded-xl bg-[#f2f6fa] border border-[var(--app-line)] shrink-0"
                                className="w-full h-full object-cover"
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="font-black text-[var(--app-ink)] text-xs sm:text-sm line-clamp-2 leading-snug">
                                  {item.product.name}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  {/* Product Code */}
                                  <span className="app-badge neutral font-mono">
                                    كود: {item.product.code}
                                  </span>
                                  {/* Unified Code */}
                                  {item.product.unifiedCode && (
                                    <span className="app-badge neutral font-mono">
                                      <span>الموحد:</span>
                                      <span>{item.product.unifiedCode.replace('#', '')}</span>
                                    </span>
                                  )}
                                  {/* Factor */}
                                  <span className="app-badge neutral text-[10px]">
                                    الشدة: {item.cartonQuantity} ق
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Delete Item */}
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="chip-btn danger p-2 shrink-0 cursor-pointer"
                              title="حذف الصنف من الفاتورة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Stocks Info & Quantity Modifiers */}
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[#eef3f8] text-xs">
                            {/* Stock Display & October Supply Badge */}
                            <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
                              {branchStock >= (item.cartonCount || 0) && (item.cartonCount || 0) > 0 ? (
                                <span className="app-badge ok text-[10px]">
                                  <Check className="w-3 h-3" />
                                  <span>متوفر بـ ({activeBranch}): {branchStock} كرتونة</span>
                                </span>
                              ) : (item.cartonCount || 0) > branchStock ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="app-badge risk text-[10px]">
                                    عجز بالفرع ({activeBranch}): متبقي {Math.max(0, branchStock)} ك
                                  </span>
                                  {octoberStock > 0 ? (
                                    <span className="app-badge warn text-[10px]">
                                      <Truck className="w-3 h-3" />
                                      <span>متوفر بمخزن 6 أكتوبر ({octoberStock} ك) — 🏷️ طلب توريد من المخزن</span>
                                    </span>
                                  ) : (
                                    <span className="app-badge neutral text-[10px]">
                                      غير متوفر بأكتوبر
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="t-muted text-[10px] font-bold">
                                  رصيد {activeBranch}: <strong className="t-navy app-num">{branchStock} ك</strong> • أكتوبر: <strong className="t-warn app-num">{octoberStock} ك</strong>
                                </span>
                              )}
                            </div>

                            {/* Carton & Piece Controls */}
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap justify-between w-full sm:w-auto">
                              <div className="flex items-center gap-2">
                                {/* Cartons Counter */}
                                <div className="ord-stepper">
                                  <span className="text-[10px] t-muted font-bold px-1.5 self-center">كرتونة:</span>
                                  <button
                                    type="button"
                                    aria-label="تقليل الكراتين"
                                    onClick={() => updateCartItem(item.product.id, { cartonCount: Math.max(0, item.cartonCount - 1) })}
                                    className="ord-step-btn cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.cartonCount}
                                    onChange={(e) => updateCartItem(item.product.id, { cartonCount: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="ord-step-val"
                                  />
                                  <button
                                    type="button"
                                    aria-label="زيادة الكراتين"
                                    onClick={() => updateCartItem(item.product.id, { cartonCount: item.cartonCount + 1 })}
                                    className="ord-step-btn cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>

                                {/* Pieces Counter */}
                                <div className="ord-stepper">
                                  <span className="text-[10px] t-muted font-bold px-1.5 self-center">قطعة:</span>
                                  <button
                                    type="button"
                                    aria-label="تقليل القطع"
                                    onClick={() => updateCartItem(item.product.id, { pieceCount: Math.max(0, item.pieceCount - 1) })}
                                    className="ord-step-btn cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.pieceCount}
                                    onChange={(e) => updateCartItem(item.product.id, { pieceCount: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="ord-step-val"
                                  />
                                  <button
                                    type="button"
                                    aria-label="زيادة القطع"
                                    onClick={() => updateCartItem(item.product.id, { pieceCount: item.pieceCount + 1 })}
                                    className="ord-step-btn cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Line Total */}
                              <div className="dream-amt app-ink-brass text-xs sm:text-sm text-left min-w-[70px]">
                                {formatCurrency(item.totalPrice)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Sticky Mobile/Desktop Step 1 Next Button */}
                  <div className="sticky bottom-0 z-20 ord-sticky rounded-[var(--app-radius)] p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[11px] t-muted">إجمالي الفاتورة:</div>
                      <div className="dream-amt t-navy text-sm sm:text-base">
                        {formatCurrency(summary.grandTotal)} <span className="text-xs t-muted font-normal">({summary.totalCartons} كرتونة)</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="btn-primary ord-cta px-5 text-xs sm:text-sm cursor-pointer"
                    >
                      <span>متابعة: العميل والماليات (2/3)</span>
                      <ArrowRight className="w-4 h-4 rotate-180" />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Catalog Addition Dropdown / Panel */}
              {(isCatalogPickerOpen || cart.length === 0) && (
                <div className="ord-card p-3.5 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="font-black text-[var(--app-ink)] text-xs flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 t-brass" />
                      <span>إضافة أصناف سريعة من الكتالوج</span>
                    </div>
                    <span className="text-[11px] t-muted">
                      متاح {products.length} صنف
                    </span>
                  </div>

                  {/* 3 Core Filters: 1. Item Group, 2. Family, 3. Code/Name Search */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* 1. Item Group */}
                    <div>
                      <label className="text-[10px] t-muted font-bold block mb-1">
                        1. المجموعة الرئيسية (Item Group):
                      </label>
                      <select
                        value={catalogGroup}
                        onChange={(e) => {
                          setCatalogGroup(e.target.value);
                          setCatalogFamily('all');
                        }}
                        className="w-full rounded-xl px-2.5 py-2 text-xs text-[var(--app-ink)]"
                      >
                        <option value="all">كافة المجموعات</option>
                        {availableItemGroups.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Family / Category */}
                    <div>
                      <label className="text-[10px] t-muted font-bold block mb-1">
                        2. فئة / عائلة الأصناف:
                      </label>
                      <select
                        value={catalogFamily}
                        onChange={(e) => setCatalogFamily(e.target.value)}
                        className="w-full rounded-xl px-2.5 py-2 text-xs text-[var(--app-ink)]"
                      >
                        <option value="all">كافة العائلات</option>
                        {availableFamilies.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Search by Code / Unified Code / Name */}
                    <div>
                      <label className="text-[10px] t-muted font-bold block mb-1">
                        3. البحث بالكود أو الاسم:
                      </label>
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="كود الصنف أو الموحد..."
                        className="w-full rounded-xl px-2.5 py-2 text-xs text-[var(--app-ink)] placeholder-[#93a4b8]"
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
                          className="p-2.5 bg-[#fbfdff] border border-[var(--app-line)] rounded-[var(--app-btn-radius)] flex items-center justify-between gap-2 hover:border-[#b8c9db] transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[var(--app-ink)] text-xs truncate" title={p.name}>
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                              <span className="font-mono t-warn font-bold">
                                {p.code}
                              </span>
                              {p.unifiedCode && (
                                <span className="font-mono t-navy font-bold">
                                  #{p.unifiedCode.replace('#', '')}
                                </span>
                              )}
                              <span className="t-muted">
                                ({formatCurrency(
                                  p.piecePrice && p.piecePrice > 0
                                    ? Math.round(p.piecePrice * (p.cartonQuantity || 1) * 100) / 100
                                    : p.cartonPrice
                                )})
                              </span>
                            </div>
                            <div className="text-[10px] t-muted mt-0.5">
                              الفرع: <strong className={branchStock > 0 ? 't-ok app-num' : 't-muted app-num'}>{branchStock}</strong> • أكتوبر: <strong className="t-warn app-num">{octoberStock}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuickAddProduct(p, 1, 'carton')}
                              className="btn-primary px-2 py-1.5 text-[11px] cursor-pointer"
                              title="إضافة 1 كرتونة"
                            >
                              + كرتونة
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAddProduct(p, 1, 'piece')}
                              className="app-btn-ghost px-2 py-1.5 text-[11px] cursor-pointer"
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
              <div className="ord-card p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[11px] t-muted">إجمالي الفاتورة:</div>
                  <div className="dream-amt t-navy text-base">
                    {formatCurrency(summary.grandTotal)}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setCurrentStep(2)}
                  className="btn-primary ord-cta px-5 text-xs sm:text-sm cursor-pointer"
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
              <div className="ord-card p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="font-black text-[var(--app-ink)] flex items-center gap-1.5">
                    <User className="w-4 h-4 t-brass" />
                    <span>تحديد عميل الفاتورة والموقف المالي</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectDirectCash}
                      className="app-btn-warn-soft px-3 py-1 rounded-[var(--app-btn-radius)] text-xs cursor-pointer"
                    >
                      ⚡ بيع نقدي مباشر (كاش)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsUnregisteredCustomerOpen((prev) => !prev)}
                      className="app-link text-xs cursor-pointer"
                    >
                      عميل جديد غير مسجل
                    </button>
                  </div>
                </div>

                {/* Unregistered Customer Drawer */}
                {isUnregisteredCustomerOpen && (
                  <div className="panel-navy rounded-[var(--app-btn-radius)] p-3 space-y-2 text-xs animate-in fade-in">
                    <div className="font-black t-navy">إدخال بيانات عميل جديد للطلبية فقط:</div>
                    <input
                      value={unregisteredCustomerName}
                      onChange={(e) => setUnregisteredCustomerName(e.target.value)}
                      placeholder="اسم العميل / المحل *"
                      className="w-full rounded-[var(--app-btn-radius)] px-3 py-2 text-xs text-[var(--app-ink)] placeholder-[#93a4b8]"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={unregisteredCustomerPhone}
                        onChange={(e) => setUnregisteredCustomerPhone(e.target.value)}
                        placeholder="رقم الهاتف (اختياري)"
                        className="w-full rounded-[var(--app-btn-radius)] px-3 py-2 text-xs text-[var(--app-ink)] placeholder-[#93a4b8]"
                      />
                      <input
                        value={unregisteredCustomerAddress}
                        onChange={(e) => setUnregisteredCustomerAddress(e.target.value)}
                        placeholder="العنوان (اختياري)"
                        className="w-full rounded-[var(--app-btn-radius)] px-3 py-2 text-xs text-[var(--app-ink)] placeholder-[#93a4b8]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateUnregisteredCustomer}
                      className="btn-primary w-full py-2 text-xs cursor-pointer"
                    >
                      استخدام هذا العميل للطلبية
                    </button>
                  </div>
                )}

                {/* Customer Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 t-muted absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="ابحث بالاسم، كود العميل، أو رقم الهاتف..."
                    className="w-full rounded-xl pr-9 pl-3 py-2.5 text-xs text-[var(--app-ink)] placeholder-[#93a4b8]"
                  />
                </div>

                {/* Customer Search Live Suggestions */}
                {isCustomerDropdownOpen && (
                  <div className="bg-white border border-[var(--app-line)] rounded-[var(--app-radius)] shadow-lg max-h-52 overflow-y-auto divide-y divide-[#eef3f8] z-30">
                    <button
                      type="button"
                      onClick={handleSelectDirectCash}
                      className="w-full p-2.5 text-right hover:bg-[#f7f0e1] transition flex items-center justify-between text-xs font-black t-warn cursor-pointer"
                    >
                      <span>⚡ عميل نقدي كاش (مباشر)</span>
                      <span className="app-badge warn text-[10px]">كاش</span>
                    </button>
                    {filteredCustomers.map((c) => {
                      const bal = c.currentBalance ?? c.balance ?? 0;
                      return (
                        <button
                          key={c.id || c.code}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full p-2.5 text-right hover:bg-[#f1f6fb] transition flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-[var(--app-ink)] truncate">{c.name}</div>
                            <div className="text-[11px] t-muted font-mono">
                              كود: {c.code || '---'} • {c.branchName} • {c.salesRepName || c.repName || 'مندوب غير محدد'}
                            </div>
                          </div>
                          <div className="text-left app-num t-navy text-xs shrink-0 mr-2">
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
                <div className="ord-card p-4 space-y-4">
                  {/* Customer Banner */}
                  <div className="flex items-start justify-between gap-3 border-b border-[#eef3f8] pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="app-badge warn font-mono text-[10px]">
                          كود: {activeCustomer.code || '---'}
                        </span>
                        <span className="app-badge neutral text-[10px]">
                          {activeCustomer.branchName || activeBranch}
                        </span>
                        {activeCustomer.tier && (
                          <span className="app-badge neutral text-[10px]">
                            فئة {activeCustomer.tier}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black text-[var(--app-ink)]">{activeCustomer.name}</h3>
                      <div className="text-xs t-muted flex items-center gap-2 flex-wrap">
                        <span>المندوب: <strong className="t-navy">{activeCustomer.salesRepName || activeCustomer.repName || activeRepUser?.name}</strong></span>
                        {activeCustomer.phone && (
                          <>
                            <span>•</span>
                            <a href={`tel:${activeCustomer.phone}`} className="t-ok hover:underline flex items-center gap-1">
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
                      className="app-btn-ghost text-xs px-3 py-1.5 shrink-0 cursor-pointer"
                    >
                      تغيير العميل 👤
                    </button>
                  </div>

                  {/* Credit/Overdue Warning Banner */}
                  {(isCreditExceeded || overdueBal > 0) && (
                    <div className={`rounded-xl border px-3 py-2.5 text-xs font-bold flex items-start gap-2 ${
                      isCreditExceeded ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        {overdueBal > 0 && (
                          <div>⚠️ العميل لديه مستحقات متأخرة: <strong>{formatCurrency(overdueBal)}</strong> — يُرجى تحصيلها</div>
                        )}
                        {isCreditExceeded && (
                          <div>⚠️ الفاتورة تتجاوز الحد الائتماني! رصيد بعد الفاتورة: <strong>{formatCurrency(balAfter)}</strong> &gt; حد: <strong>{formatCurrency(creditLimitVal)}</strong></div>
                        )}
                        <div className="text-[10px] opacity-80">المديونية الحالية: {formatCurrency(balBefore)} | قيمة الفاتورة: {formatCurrency(summary.grandTotal)} | بعد الفاتورة: {formatCurrency(balAfter)}</div>
                      </div>
                    </div>
                  )}

                  {/* 4 Financial KPIs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* KPI 1: Current Debt */}
                    <div className="ord-card p-3 rounded-[var(--app-btn-radius)]">
                      <div className="text-[10px] t-muted font-bold">المديونية الحالية:</div>
                      <div className="dream-amt t-navy text-sm sm:text-base mt-0.5">
                        {formatCurrency(balBefore)}
                      </div>
                    </div>

                    {/* KPI 2: Overdue / Due */}
                    <div className="ord-card p-3 rounded-[var(--app-btn-radius)]">
                      <div className="text-[10px] t-risk font-bold">المستحقات والمتأخرات:</div>
                      <div className={`dream-amt text-sm sm:text-base mt-0.5 ${overdueBal > 0 ? 't-risk' : 't-muted'}`}>
                        {formatCurrency(overdueBal)}
                      </div>
                    </div>

                    {/* KPI 3: Credit Limit */}
                    <div className="ord-card p-3 rounded-[var(--app-btn-radius)]">
                      <div className="text-[10px] t-muted font-bold">الحد الائتماني:</div>
                      <div className="dream-amt t-navy text-sm sm:text-base mt-0.5">
                        {creditLimitVal > 0 ? formatCurrency(creditLimitVal) : 'بدون سقف'}
                      </div>
                    </div>

                    {/* KPI 4: Balance After Invoice */}
                    <div className="panel-navy p-3 rounded-[var(--app-btn-radius)] border">
                      <div className="text-[10px] t-navy font-bold">الرصيد بعد الفاتورة:</div>
                      <div className="dream-amt t-navy text-sm sm:text-base mt-0.5">
                        {formatCurrency(balAfter)}
                      </div>
                    </div>

                    {/* KPI 5: Remaining Credit */}
                    <div className={`ord-card p-3 rounded-[var(--app-btn-radius)] ${isCreditExceeded ? 'border-rose-200 bg-rose-50' : ''}`}>
                      <div className={`text-[10px] font-bold ${isCreditExceeded ? 't-risk' : 't-ok'}`}>
                        المتبقي من الحد الائتماني:
                      </div>
                      <div className={`dream-amt text-sm sm:text-base mt-0.5 ${isCreditExceeded ? 't-risk' : 't-ok'}`}>
                        {creditLimitVal > 0 ? formatCurrency(remainingCredit) : 'غير محدود'}
                      </div>
                    </div>
                  </div>

                  {/* Payment Method (from customer data - read only) */}
                  <div className="ord-card p-3 rounded-[var(--app-btn-radius)]">
                    <div className="text-[10px] t-muted font-bold mb-2">طريقة السداد (من بيانات العميل):</div>
                    <div className="flex items-center gap-2 border border-[var(--app-line)] rounded-[var(--app-btn-radius)] p-2 bg-white/50">
                      <span className={`text-xs font-bold ${effectivePaymentMethod === 'نقدي (كاش)' ? 't-ok' : 't-warn'}`}>
                        {effectivePaymentMethod === 'نقدي (كاش)' ? '💵' : '⏳'}
                      </span>
                      <span className="text-xs font-black">{effectivePaymentMethod}</span>
                      {activeCustomer && !activeCustomer.paymentTerms && (
                        <span className="text-[10px] text-slate-400 ml-auto">(غير محدد - كافتراضي كاش)</span>
                      )}
                    </div>
                  </div>

                  {/* Guarantee docs and warning */}
                  {isCreditExceeded && (
                    <div className="ord-panel-risk p-3 rounded-[var(--app-btn-radius)] flex items-center gap-2 text-xs">
                      <AlertTriangle className="w-4 h-4 t-risk shrink-0" />
                      <span>
                        تنبيه: هذه الفاتورة تتجاوز الحد الائتماني المعتمد للعميل بمقدار ({formatCurrency(balAfter - creditLimitVal)}). سيتم إرسالها لاعتماد المشرف.
                      </span>
                    </div>
                  )}

                  {activeCustomer.guaranteeDocs && (
                    <div className="text-[11px] t-muted bg-[#f4f7fa] p-2.5 rounded-[var(--app-btn-radius)] border border-[var(--app-line)]">
                      📄 <strong>أوراق الضمان:</strong> {activeCustomer.guaranteeDocs}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/60 border border-dashed border-[#b8c9db] rounded-[var(--app-radius)] p-6 text-center text-xs t-muted">
                  يرجى البحث واختيار عميل لعرض موقفه المالي ومتابعة الفاتورة.
                </div>
              )}

              {/* Step 2 Bottom Action Bar */}
              <div className="ord-card p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="app-btn-ghost px-4 py-2.5 text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>→ رجوع للأصناف</span>
                </button>

                <button
                  type="button"
                  disabled={!activeCustomer}
                  onClick={() => setCurrentStep(3)}
                  className="btn-primary ord-cta px-5 text-xs sm:text-sm cursor-pointer"
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
              <div className="ord-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#eef3f8] pb-2.5">
                  <div className="space-y-0.5">
                    <div className="text-[10px] t-muted">عميل الفاتورة:</div>
                    <div className="font-black text-[var(--app-ink)] text-sm">
                      {activeCustomer?.name} ({activeCustomer?.code || 'CASH'})
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] t-muted">الفرع والمندوب:</div>
                    <div className="font-bold t-warn text-xs">
                      {activeBranch} • {activeRepUser?.name}
                    </div>
                  </div>
                </div>

                {/* Items Compact Recap */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] t-muted">
                    <span>أصناف الطلبية ({cart.length} أصناف):</span>
                    <span className="t-warn font-bold app-num">{summary.totalCartons} كرتونة • {summary.totalPieces} قطعة</span>
                  </div>

                  {/* Single Unified Invoice & Shortage Notice */}
                  {cart.some((it) => (it.cartonCount || 0) > getBranchStockForProduct(it.product, activeBranch)) && (
                    <div className="panel-warn p-2.5 rounded-[var(--app-btn-radius)] border flex items-start gap-2 text-xs">
                      <Truck className="w-4 h-4 t-warn shrink-0 mt-0.5" />
                      <div className="text-[11px] leading-relaxed">
                        <strong className="font-bold block mb-0.5">بيان التوريد والنواقص (فاتورة واحدة موحدة):</strong>
                        الأصناف غير المتوفرة بـ <strong>{activeBranch}</strong> مسجلة في نفس الفاتورة كـ <span className="font-bold underline">«طلب توريد من مخزن 6 أكتوبر»</span> وسيصل إشعار فوري للمشرف ومدير الفرع بها للاعتماد والسحب.
                      </div>
                    </div>
                  )}

                  <div className="max-h-44 overflow-y-auto divide-y divide-[#eef3f8] bg-[#f4f7fa] rounded-[var(--app-btn-radius)] p-2 border border-[var(--app-line)]">
                    {cart.map((item, i) => {
                      const bStock = getBranchStockForProduct(item.product, activeBranch);
                      const oStock = item.product.mainWarehouseActual || 0;
                      const isShortage = (item.cartonCount || 0) > bStock;
                      const shortageQty = isShortage ? (item.cartonCount || 0) - Math.max(0, bStock) : 0;

                      return (
                        <div key={i} className="py-2 flex items-center justify-between gap-2 text-xs">
                          <div className="truncate flex-1 min-w-0">
                            <div className="font-bold text-[var(--app-ink)] truncate">{item.product.name}</div>
                            <div className="flex items-center gap-1.5 text-[10px] t-muted font-mono mt-0.5">
                              <span>كود: {item.product.code}</span>
                              {item.product.unifiedCode && (
                                <span className="t-navy">#{item.product.unifiedCode.replace('#', '')}</span>
                              )}
                              {isShortage ? (
                                <span className="app-badge warn text-[10px] font-sans">
                                  <span>🏷️ طلب توريد أكتوبر</span>
                                  <span>({shortageQty} ك)</span>
                                </span>
                              ) : (
                                <span className="app-badge ok text-[10px] font-sans">
                                  ✓ متوفر بالفرع
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="t-muted text-center app-num px-2 shrink-0">
                            {item.cartonCount > 0 && <span className="t-warn">{item.cartonCount} ك </span>}
                            {item.pieceCount > 0 && <span className="t-navy">{item.pieceCount} ق</span>}
                          </div>
                          <div className="dream-amt t-navy text-left w-20 shrink-0">
                            {formatCurrency(item.totalPrice)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Payment Method & Notes */}
              <div className="ord-card p-4 space-y-4">
                {/* Payment Method */}
                <div>
                  <label className="text-xs font-bold text-[var(--app-ink)] block mb-1.5">
                    طريقة السداد:
                  </label>
                    <div className="p-2.5 rounded-[var(--app-btn-radius)] text-xs font-bold flex items-center gap-2 border border-[var(--app-line)] bg-white/50">
                      <span className={`text-xs font-bold ${effectivePaymentMethod === 'نقدي (كاش)' ? 't-ok' : 't-warn'}`}>
                        {effectivePaymentMethod === 'نقدي (كاش)' ? '💵' : '⏳'}
                      </span>
                      <span className="text-xs font-black">{effectivePaymentMethod}</span>
                    </div>
                </div>

                {/* Credit Limit Warning in Step 3 */}
                {activeCustomer && creditLimitVal > 0 && isCreditExceeded && (
                  <div className="bg-rose-50 border border-rose-200 rounded-[var(--app-btn-radius)] p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="w-4 h-4 t-risk shrink-0" />
                      <span className="font-black text-rose-800">تم تجاوز الحد الائتماني!</span>
                    </div>
                    <div className="text-[10px] text-rose-700 space-y-0.5">
                      <div>رصيد العميل الحالي: <strong>{formatCurrency(balBefore)}</strong></div>
                      <div>قيمة الفاتورة: <strong>{formatCurrency(summary.grandTotal)}</strong></div>
                      <div>الرصيد بعد الفاتورة: <strong className="text-rose-800">{formatCurrency(balAfter)}</strong></div>
                      <div>الحد الائتماني المعتمد: <strong>{formatCurrency(creditLimitVal)}</strong></div>
                      <div>تجاوز الحد بمقدار: <strong className="font-black text-rose-800">{formatCurrency(balAfter - creditLimitVal)}</strong></div>
                      <div className="text-[10px] opacity-80 mt-1">سيتم إرسال الفاتورة لاعتماد المشرف ومدير الفرع قبل التنفيذ.</div>
                    </div>
                  </div>
                )}

                {/* Rep Notes */}
                <div>
                  <label className="text-xs font-bold text-[var(--app-ink)] block mb-1.5">
                    ملاحظات الفاتورة للمشرف:
                  </label>
                  <textarea
                    rows={2}
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    placeholder="أي تعليمات تسليم، مواعيد، أو ملاحظات إضافية..."
                    className="w-full bg-[#fbfdff] rounded-[var(--app-btn-radius)] p-2.5 text-xs text-[var(--app-ink)] placeholder-[#93a4b8]"
                  />
                </div>
              </div>

              {/* Final Financial Totals Box */}
              <div className="bg-[#eef3f8] rounded-[var(--app-radius)] border border-[var(--app-line)] p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between pt-2 border-t border-[var(--app-line)]">
                  <span className="text-sm font-black text-[var(--app-ink)]">الصافي المطلوب سداده:</span>
                  <span className="dream-amt app-ink-brass text-xl sm:text-2xl">{formatCurrency(summary.grandTotal)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-[11px] t-muted">
                  <span>رصيد العميل بعد إضافة هذه الفاتورة:</span>
                  <span className="dream-amt t-navy">{formatCurrency(balAfter)}</span>
                </div>
                {creditLimitVal > 0 && (
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className={`font-bold ${isCreditExceeded ? 't-risk' : 't-ok'}`}>
                      المتبقي من الحد الائتماني بعد الفاتورة:
                    </span>
                    <span className={`dream-amt ${isCreditExceeded ? 't-risk' : 't-ok'}`}>
                      {formatCurrency(remainingCredit)}
                    </span>
                  </div>
                )}
              </div>

              {/* Step 3 Bottom Action Bar */}
              <div className="ord-card p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="app-btn-ghost px-4 py-2.5 text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>→ رجوع لبيانات العميل</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || cart.length === 0}
                  onClick={handleSubmitOrder}
                  className="btn-primary ord-cta px-6 text-xs sm:text-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
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
