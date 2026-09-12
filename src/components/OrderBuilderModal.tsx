import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  FileSpreadsheet,
  Flame,
  Grid,
  Layers,
  List,
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
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { findCustomerMatch, getBranchStockForProduct, isBranchMatch } from '../services/arabicMatchingService';
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

  // Sync initialCustomer if prop changes
  useEffect(() => {
    if (initialCustomer) {
      setActiveCustomer(initialCustomer);
    }
  }, [initialCustomer]);

  // Financial & Order Options
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي (كاش)');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Mobile View Switcher: 'cart' (الفاتورة والسداد) vs 'catalog' (إضافة أصناف)
  const [mobileActiveTab, setMobileActiveTab] = useState<'cart' | 'catalog'>(() =>
    cart.length === 0 ? 'catalog' : 'cart'
  );

  // Product Catalog Search & Filter within Cashier
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const itemsPerPage = 24;

  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Filtered master customers for quick customer lookup
  const filteredCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    if (!customerSearchQuery.trim()) return list.slice(0, 8);
    const q = customerSearchQuery.toLowerCase().trim();
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
      )
      .slice(0, 8);
  }, [getVisibleCustomers, customers, customerSearchQuery]);

  // Available Categories from active products
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      const c = p.department || p.category;
      if (c && c.trim()) cats.add(c.trim());
    });
    return Array.from(cats);
  }, [products]);

  // Filtered Products for quick add in Cashier
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory === 'promo') {
      result = result.filter((p) => p.promoPrice && p.promoPrice > 0);
    } else if (selectedCategory === 'available') {
      result = result.filter((p) => (p.branchStockReserved > 0) || (p.branchStockActual > 0));
    } else if (selectedCategory !== 'all') {
      result = result.filter((p) => (p.department || p.category) === selectedCategory);
    }

    if (productSearch.trim()) {
      const q = productSearch.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.unifiedCode && p.unifiedCode.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.color && p.color.toLowerCase().includes(q))
      );
    }

    return result;
  }, [products, selectedCategory, productSearch]);

  const totalCatalogPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const pagedProducts = useMemo(() => {
    const start = (catalogPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, catalogPage]);

  // Cart summary calculation
  const summary = useMemo(() => {
    return getCartSummary(discountPercent);
  }, [getCartSummary, discountPercent]);

  if (!isOpen) return null;

  // Quick select a customer or default to Cash
  const handleSelectCustomer = (cust: Customer) => {
    // Re-resolve from master customers to guarantee single source of truth
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
    setCustomerSearchQuery('');
  };

  // Quick Add Item from Cashier Catalog
  const handleQuickAddProduct = (product: Product, count: number, orderType: 'carton' | 'piece' = 'carton') => {
    const res = addToCart(product, orderType, count, 0);
    if (!res.success) {
      setFeedbackError(res.message || 'تعذر إضافة الصنف.');
      setTimeout(() => setFeedbackError(null), 4500);
    } else {
      setFeedbackSuccess(`تم إضافة ${count} ${orderType === 'carton' ? 'كرتونة' : 'قطعة'} من (${product.name})`);
      setTimeout(() => setFeedbackSuccess(null), 2500);
    }
  };

  // Order Submission & Stock Reservation Handling
  const handleSubmitOrder = async (andExportExcel: boolean = false, andDownloadPDF: boolean = false) => {
    if (cart.length === 0) {
      setFeedbackError('سلة الفاتورة فارغة! يرجى إضافة أصناف للطلبية أولاً.');
      setTimeout(() => setFeedbackError(null), 4000);
      return;
    }

    // Single source of truth customer resolution
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

      // Download Excel if requested
      if (andExportExcel) {
        exportElectronicInvoiceToExcel(result.invoice);
      }

      // Download PDF if requested
      if (andDownloadPDF) {
        await downloadInvoicePDF(result.invoice);
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

  return (
    <div
      id="dream-cashier-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-7xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* ================= HEADER ================= */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  فاتورة مبيعات كاشير دريم
                </h2>
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Zap className="w-3 h-3" />
                  <span>DREAM POS</span>
                </span>
                <span className="hidden sm:inline-flex bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full items-center gap-1">
                  <span>🔒 حجز فوري للمخزون لمنع التضارب</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeBranch} • المندوب: <strong className="text-amber-300">{activeRepUser?.name}</strong> • التاريخ: {todayDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-slate-800/90 p-1 rounded-xl flex items-center gap-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setIsPreviewMode(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                  !isPreviewMode ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>⚡ شاشة الكاشير والسلة</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewMode(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                  isPreviewMode ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>👁️ معاينة الفاتورة</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= NOTIFICATIONS BANNER ================= */}
        {feedbackError && (
          <div className="bg-rose-900/90 text-white p-3 px-4 text-xs font-black flex items-center gap-2 border-b border-rose-700 shrink-0 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{feedbackError}</span>
          </div>
        )}
        {feedbackSuccess && (
          <div className="bg-emerald-600 text-white p-2.5 px-4 text-xs font-black flex items-center gap-2 border-b border-emerald-500 shrink-0 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {/* ================= BODY CONTENT ================= */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isPreviewMode ? (
            /* ================= FULL INVOICE PREVIEW ================= */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-900">
              <div className="bg-amber-500/15 border border-amber-400/40 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <h3 className="font-black text-amber-300 text-sm flex items-center gap-1.5">
                    <span>👁️ معاينة الفاتورة قبل الحفظ وتأكيد حجز المخزون</span>
                  </h3>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    يمكنك مراجعة كافة الأسعار والكميات وتأكيد الحفظ للمشرف أو تحميلها مباشرة كملف إكسل أو PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewMode(false)}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition cursor-pointer shrink-0"
                >
                  ✏️ العودة للتعديل وإضافة أصناف
                </button>
              </div>

              {/* Customer Accordion in Preview */}
              <CustomerFinancialSummaryCard
                customer={activeCustomer}
                currentInvoiceAmount={summary.grandTotal}
                theme="dark"
                initiallyOpen={true}
                showCustomerDetails={true}
                title="موقف العميل المالي المعتمد بالفاتورة"
              />

              {/* Invoice Items Summary Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="bg-slate-800 p-3 px-4 text-xs font-black flex items-center justify-between text-slate-200">
                  <span>أصناف الفاتورة ({cart.length} أصناف)</span>
                  <span className="text-amber-400 font-bold">{summary.totalCartons} كرتونة • {summary.totalPieces} قطعة</span>
                </div>
                <div className="divide-y divide-slate-850 max-h-[320px] overflow-y-auto">
                  {cart.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-850/50">
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-white truncate">{item.product.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          كود: {item.product.code} • الشدة: {item.cartonQuantity} ق/كرتونة
                          {item.fulfillFromMainWarehouse && (
                            <span className="text-blue-400 font-bold mr-2 bg-blue-900/40 px-1.5 py-0.2 rounded">
                              نواقص من مخزن أكتوبر 🚚
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-center font-bold text-slate-300 bg-slate-800 px-3 py-1 rounded-xl shrink-0">
                        {item.cartonCount > 0 && <span className="text-amber-300 font-black">{item.cartonCount} كرتونة </span>}
                        {item.pieceCount > 0 && <span className="text-blue-300 font-black">{item.pieceCount} قطعة</span>}
                      </div>
                      <div className="text-left font-black text-amber-400 shrink-0 w-28">
                        {formatCurrency(item.totalPrice)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>المجموع قبل الخصم:</span>
                  <strong className="text-white font-mono text-sm">{formatCurrency(summary.subtotal)}</strong>
                </div>
                {discountPercent > 0 && (
                  <div className="flex items-center justify-between text-emerald-400">
                    <span>قيمة الخصم التجاري ({discountPercent}%):</span>
                    <strong className="font-mono">-{formatCurrency(summary.discountAmount)}</strong>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="font-bold text-sm text-slate-200">الصافي المطلوب سداده:</span>
                  <strong className="text-xl font-black text-amber-400 font-mono">{formatCurrency(summary.grandTotal)}</strong>
                </div>
              </div>

              {/* Preview Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || cart.length === 0}
                  onClick={() => handleSubmitOrder(true, false)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  title="حفظ الطلبية وتنزيل شيت إكسل"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>حفظ وتحميل إكسل 📊</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || cart.length === 0}
                  onClick={() => handleSubmitOrder(false, true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  title="حفظ الطلبية وتنزيل PDF"
                >
                  <Download className="w-4 h-4" />
                  <span>حفظ وتحميل PDF 📄</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || cart.length === 0}
                  onClick={() => handleSubmitOrder(false, false)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ الطلبية للمشرف (حجز الرصيد فوراً) ✅</span>
                </button>
              </div>
            </div>
          ) : (
            /* ================= LIVE CASHIER TERMINAL ================= */
            <div className="flex-1 overflow-hidden flex flex-col">
              
              {/* Mobile Tab Switcher */}
              <div className="lg:hidden bg-slate-950 border-b border-slate-800 p-2 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileActiveTab('cart')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    mobileActiveTab === 'cart'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>فاتورة الكاشير ({cart.length})</span>
                  {cart.length > 0 && (
                    <span className="bg-slate-950 text-amber-400 text-[10px] px-1.5 py-0.2 rounded-md font-mono">
                      {formatCurrency(summary.grandTotal)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setMobileActiveTab('catalog')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    mobileActiveTab === 'catalog'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة أصناف ({products.length})</span>
                </button>
              </div>

              {/* Main Responsive Layout: 2 Columns on Desktop/Tablet */}
              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                
                {/* COLUMN 1: Cart Items & Financials (Left on Desktop, 5 cols) */}
                <div
                  className={`lg:col-span-5 xl:col-span-5 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-l border-slate-800 bg-slate-900/90 ${
                    mobileActiveTab === 'catalog' ? 'hidden lg:flex' : 'flex'
                  }`}
                >
                  {/* Customer Accordion Card */}
                  <div className="p-3 bg-slate-950 border-b border-slate-800 shrink-0">
                    {activeCustomer ? (
                      <CustomerFinancialSummaryCard
                        customer={activeCustomer}
                        currentInvoiceAmount={summary.grandTotal}
                        theme="dark"
                        initiallyOpen={false}
                        showCustomerDetails={true}
                        title="بيانات وموقف العميل المالي (كافة العملاء)"
                        onChangeCustomer={() => setActiveCustomer(null)}
                      />
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300">تحديد عميل الفاتورة:</span>
                          <button
                            type="button"
                            onClick={handleSelectDirectCash}
                            className="text-amber-400 hover:text-amber-300 font-black text-xs cursor-pointer underline flex items-center gap-1"
                          >
                            <span>⚡ بيع نقدي مباشر (كاش)</span>
                          </button>
                        </div>

                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={customerSearchQuery}
                            onChange={(e) => {
                              setCustomerSearchQuery(e.target.value);
                              setIsCustomerDropdownOpen(true);
                            }}
                            onFocus={() => setIsCustomerDropdownOpen(true)}
                            placeholder="ابحث بالاسم، الكود، أو رقم الهاتف من كافة العملاء..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>

                        {/* Customer Search Dropdown */}
                        {isCustomerDropdownOpen && (
                          <div className="bg-slate-950 border border-slate-700 rounded-2xl mt-1 shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-850 z-30">
                            <button
                              type="button"
                              onClick={handleSelectDirectCash}
                              className="w-full p-2.5 text-right hover:bg-slate-800 transition flex items-center justify-between text-xs font-black text-amber-300 cursor-pointer"
                            >
                              <span>⚡ عميل نقدي كاش (مباشر)</span>
                              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded">كاش</span>
                            </button>
                            {filteredCustomers.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelectCustomer(c)}
                                className="w-full p-2.5 text-right hover:bg-slate-800 transition flex items-center justify-between text-xs cursor-pointer"
                              >
                                <div>
                                  <div className="font-black text-white">{c.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    كود: {c.code || '---'} • هاتف: {c.phone || '---'}
                                  </div>
                                </div>
                                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                  {formatCurrency(c.currentBalance || c.balance || 0)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cart Items List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-black text-slate-400 px-1">
                      <span>الأصناف المختارة بالفاتورة ({cart.length})</span>
                      {cart.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('هل تريد تفريغ سلة الكاشير بالكامل؟')) clearCart();
                          }}
                          className="text-rose-400 hover:text-rose-300 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>مسح السلة</span>
                        </button>
                      )}
                    </div>

                    {cart.length === 0 ? (
                      <div className="bg-slate-950/60 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-2">
                        <ShoppingCart className="w-8 h-8 text-slate-600 mx-auto" />
                        <p className="text-xs font-bold text-slate-400">سلة الفاتورة فارغة حالياً</p>
                        <p className="text-[11px] text-slate-500">
                          اختر من قائمة الأصناف الجانبية لإضافتها فوراً للفاتورة.
                        </p>
                        <button
                          type="button"
                          onClick={() => setMobileActiveTab('catalog')}
                          className="lg:hidden bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs cursor-pointer"
                        >
                          استعراض الكتالوج 🛒
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cart.map((item) => (
                          <div
                            key={item.product.id}
                            className="bg-slate-950 border border-slate-800 rounded-2xl p-2.5 space-y-2 hover:border-slate-700 transition shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <ProductImage
                                  product={item.product}
                                  cloudinaryConfig={cloudinaryConfig}
                                  sizeVariant="thumbnail"
                                  containerClassName="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0"
                                  className="w-full h-full object-cover"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-black text-white truncate">{item.product.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    كود: {item.product.code} • شدة الكرتونة: {item.cartonQuantity} ق
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeFromCart(item.product.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition cursor-pointer shrink-0"
                                title="حذف الصنف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Steppers: Carton & Piece */}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-850">
                              <div className="flex items-center gap-3">
                                {/* Cartons Stepper */}
                                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCartItem(item.product.id, {
                                        cartonCount: Math.max(0, item.cartonCount - 1),
                                      })
                                    }
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-8 text-center text-xs font-black text-amber-300 font-mono">
                                    {item.cartonCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCartItem(item.product.id, {
                                        cartonCount: item.cartonCount + 1,
                                      })
                                    }
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <span className="text-[10px] text-slate-400 px-1 font-bold">ك</span>
                                </div>

                                {/* Pieces Stepper */}
                                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCartItem(item.product.id, {
                                        pieceCount: Math.max(0, (item.pieceCount || 0) - 1),
                                      })
                                    }
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-8 text-center text-xs font-black text-blue-300 font-mono">
                                    {item.pieceCount || 0}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCartItem(item.product.id, {
                                        pieceCount: (item.pieceCount || 0) + 1,
                                      })
                                    }
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white rounded-lg cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <span className="text-[10px] text-slate-400 px-1 font-bold">ق</span>
                                </div>
                              </div>

                              {/* Row Total */}
                              <div className="text-left font-black text-amber-400 text-xs font-mono">
                                {formatCurrency(item.totalPrice)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Financial Summary & Action Bar */}
                  <div className="p-3.5 bg-slate-950 border-t border-slate-800 space-y-3 shrink-0">
                    {/* Discount & Payment Method */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block mb-1">الخصم التجاري (%):</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discountPercent || ''}
                          onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value)))}
                          placeholder="0%"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block mb-1">طريقة السداد:</span>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white font-bold focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="نقدي (كاش)">نقدي (كاش)</option>
                          <option value="آجل (على الحساب)">آجل (على الحساب)</option>
                          <option value="تحويل بنكي / فودافون كاش">تحويل بنكي / كاش</option>
                          <option value="شيك بنكي">شيك بنكي</option>
                        </select>
                      </div>
                    </div>

                    {/* Grand Total Bar */}
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-2xl flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block">المجموع: {formatCurrency(summary.subtotal)}</span>
                        <span className="text-amber-400 font-black text-sm">الصافي المطلوب:</span>
                      </div>
                      <div className="text-left font-black text-amber-400 text-lg font-mono">
                        {formatCurrency(summary.grandTotal)}
                      </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmitting || cart.length === 0}
                        onClick={() => handleSubmitOrder(false, false)}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black py-2.5 px-3 rounded-2xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ الطلبية للمشرف (حجز الرصيد) ✅'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting || cart.length === 0}
                        onClick={() => handleSubmitOrder(true, false)}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black p-2.5 rounded-2xl transition cursor-pointer shrink-0"
                        title="حفظ وتحميل إكسل"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting || cart.length === 0}
                        onClick={() => handleSubmitOrder(false, true)}
                        className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black p-2.5 rounded-2xl transition cursor-pointer shrink-0"
                        title="حفظ وتحميل PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: Fast Product Catalog & Quick-Add (Right on Desktop, 7 cols) */}
                <div
                  className={`lg:col-span-7 xl:col-span-7 flex flex-col overflow-hidden bg-slate-950 ${
                    mobileActiveTab === 'cart' ? 'hidden lg:flex' : 'flex'
                  }`}
                >
                  {/* Search Bar & Filters */}
                  <div className="p-3 bg-slate-900 border-b border-slate-800 space-y-2 shrink-0">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setCatalogPage(1);
                        }}
                        placeholder="بحث سريع بمئات الأصناف بالاسم، الكود، الكود الموحد (#) أو الباركود..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* Category Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('all');
                          setCatalogPage(1);
                        }}
                        className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                          selectedCategory === 'all'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        الكل ({products.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('promo');
                          setCatalogPage(1);
                        }}
                        className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                          selectedCategory === 'promo'
                            ? 'bg-rose-600 text-white font-black shadow-xs'
                            : 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/50'
                        }`}
                      >
                        <Flame className="w-3 h-3" />
                        <span>عروض ترويجية 🔥</span>
                      </button>

                      {availableCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat);
                            setCatalogPage(1);
                          }}
                          className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                            selectedCategory === cat
                              ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Products Grid */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {filteredProducts.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-xs font-bold">
                        لا توجد أصناف مطابقة للبحث
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {pagedProducts.map((prod) => {
                          const branchCartonsAvailable = typeof prod.branchStockReserved === 'number'
                            ? Math.max(0, prod.branchStockReserved)
                            : Math.max(0, prod.branchStockActual);

                          const mainWhCartonsAvailable = typeof prod.mainWarehouseReserved === 'number'
                            ? Math.max(0, prod.mainWarehouseReserved)
                            : Math.max(0, prod.mainWarehouseActual);

                          const totalAvailable = branchCartonsAvailable + mainWhCartonsAvailable;
                          const activePendingReserved = Math.max(0, prod.branchStockActual - branchCartonsAvailable);

                          const appliedPrice = prod.promoPrice && prod.promoPrice > 0 ? prod.promoPrice : prod.cartonPrice;

                          return (
                            <div
                              key={prod.id}
                              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-2.5 flex flex-col justify-between space-y-2 shadow-xs transition"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <ProductImage
                                  product={prod}
                                  cloudinaryConfig={cloudinaryConfig}
                                  sizeVariant="thumbnail"
                                  containerClassName="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0"
                                  className="w-full h-full object-cover"
                                />

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="bg-slate-950 text-amber-300 text-[10px] font-mono font-black px-1.5 py-0.2 rounded">
                                      {prod.code}
                                    </span>
                                    {prod.promoPrice ? (
                                      <span className="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded">
                                        عرض
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="text-xs font-black text-white truncate mt-0.5" title={prod.name}>
                                    {prod.name}
                                  </div>

                                  <div className="text-[10px] text-slate-400">
                                    شدة: <strong className="text-slate-200">{prod.cartonQuantity} ق</strong>
                                    {' • '}
                                    <span className="font-mono text-amber-300 font-bold">
                                      {formatCurrency(appliedPrice)}/ك
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Live Stock Indicators (Prevent Double-Booking) */}
                              <div className="bg-slate-950 p-1.5 rounded-xl text-[10px] space-y-0.5 font-bold">
                                <div className="flex items-center justify-between text-slate-300">
                                  <span>متاح بالفرع:</span>
                                  <span className={branchCartonsAvailable > 0 ? 'text-emerald-400 font-black' : 'text-rose-400'}>
                                    {branchCartonsAvailable} كرتونة
                                  </span>
                                </div>

                                {activePendingReserved > 0 && (
                                  <div className="flex items-center justify-between text-amber-400 text-[9px]">
                                    <span>محجوز لطلبيات معلقة:</span>
                                    <span className="font-black">{activePendingReserved} ك</span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between text-slate-400 text-[9px]">
                                  <span>مخزن أكتوبر الرئيسي:</span>
                                  <span className="text-blue-300 font-bold">{mainWhCartonsAvailable} ك</span>
                                </div>
                              </div>

                              {/* Quick Action Add Buttons */}
                              <div className="flex items-center gap-1 pt-1">
                                {totalAvailable > 0 ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAddProduct(prod, 1, 'carton')}
                                      className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-1.5 rounded-xl text-[11px] transition cursor-pointer shadow-xs"
                                    >
                                      + 1 كرتونة
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleQuickAddProduct(prod, 5, 'carton')}
                                      className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-black px-2 py-1.5 rounded-xl text-[11px] transition cursor-pointer"
                                      title="إضافة 5 كراتين"
                                    >
                                      +5 ك
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleQuickAddProduct(prod, 1, 'piece')}
                                      className="bg-slate-800 hover:bg-slate-700 text-blue-300 font-black px-2 py-1.5 rounded-xl text-[11px] transition cursor-pointer"
                                      title="إضافة قطعة مفردة"
                                    >
                                      +1 ق
                                    </button>
                                  </>
                                ) : (
                                  <div className="w-full bg-slate-950 text-rose-400 text-center py-1.5 rounded-xl text-[10px] font-black border border-rose-900/40">
                                    ⚠️ محجوز بالكامل لطلبيات معلقة
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Catalog Pagination */}
                  {totalCatalogPages > 1 && (
                    <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
                      <span className="text-slate-400 text-[11px]">
                        صفحة {catalogPage} من {totalCatalogPages} ({filteredProducts.length} صنف)
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={catalogPage <= 1}
                          onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold transition cursor-pointer"
                        >
                          السابق
                        </button>
                        <button
                          type="button"
                          disabled={catalogPage >= totalCatalogPages}
                          onClick={() => setCatalogPage((p) => Math.min(totalCatalogPages, p + 1))}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold transition cursor-pointer"
                        >
                          التالي
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
