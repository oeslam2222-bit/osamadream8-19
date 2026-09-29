import React, { useState, useMemo } from 'react';
import {
  Receipt,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  Eye,
  User,
  Search,
  Percent,
  CreditCard,
  Building,
  AlertCircle,
  X,
  ChevronDown,
  ArrowRight,
  FileSpreadsheet,
  Download,
  Flame,
  Zap,
  Sparkles,
  FileText,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Invoice, PaymentMethod } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { exportElectronicInvoiceToExcel, downloadInvoiceBoth } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { ProductImage } from './ProductImage';
import { CustomerFinancialSummaryCard } from './CustomerFinancialSummaryCard';
import { findCustomerMatch } from '../services/arabicMatchingService';

interface PosCashierSidebarProps {
  selectedCustomer?: Customer | null;
  onClearSelectedCustomer?: () => void;
  onSelectCustomer?: (customer: Customer) => void;
  onInvoiceTransferred?: (invoice: Invoice) => void;
  onOpenDetailedModal?: () => void;
  onCloseMobileDrawer?: () => void;
  isMobileDrawer?: boolean;
}

export const PosCashierSidebar: React.FC<PosCashierSidebarProps> = ({
  selectedCustomer,
  onClearSelectedCustomer,
  onSelectCustomer,
  onInvoiceTransferred,
  onOpenDetailedModal,
  onCloseMobileDrawer,
  isMobileDrawer = false,
}) => {
  const {
    cart,
    updateCartItem,
    removeFromCart,
    clearCart,
    getCartSummary,
    createOrder,
    currentUser,
    getVisibleCustomers,
    customers,
  } = useApp();

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي (كاش)');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [localCustomer, setLocalCustomer] = useState<Customer | null>(selectedCustomer || null);
  const [repNotes, setRepNotes] = useState<string>('');
  const [isSidebarPreviewMode, setIsSidebarPreviewMode] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Sync if selectedCustomer prop changes
  React.useEffect(() => {
    if (selectedCustomer) {
      setLocalCustomer(selectedCustomer);
    }
  }, [selectedCustomer]);

  const cartSummary = useMemo(() => {
    return getCartSummary(discountPercent);
  }, [getCartSummary, discountPercent]);

  const activeCustomer = localCustomer || selectedCustomer;

  // Filtered customers for quick search in cashier - displays ALL assigned customers for rep with search
  const filteredCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    if (!customerSearch.trim()) return list.slice(0, 100);
    const q = customerSearch.toLowerCase().trim();
    return list
      .filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.code && String(c.code).toLowerCase().includes(q)) ||
          (c.phone && String(c.phone).includes(q)) ||
          (c.storeName && c.storeName.toLowerCase().includes(q)) ||
          (c.region && c.region.toLowerCase().includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q))
      )
      .slice(0, 100);
  }, [getVisibleCustomers, customers, customerSearch]);

  // Handle saving the order (حفظ الطلبية للمشرف واعتمادها)
  const handleSaveOrder = async () => {
    if (cart.length === 0) {
      setErrorMessage('سلة الفاتورة فارغة! يرجى إضافة أصناف أولاً.');
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }

    // Single source of truth: Bind active customer directly to "All Customers" database
    const matchedMaster = activeCustomer
      ? findCustomerMatch(customers, {
          customerId: activeCustomer.id,
          customerCode: activeCustomer.code,
          customerName: activeCustomer.name,
          customerPhone: activeCustomer.phone,
        }) || activeCustomer
      : null;

    const effectiveCustomer = matchedMaster || {
      id: `c-cash-${Date.now()}`,
      code: 'CASH-DIRECT',
      name: 'عميل نقدي كاش (مباشر)',
      phone: '',
      address: 'بيع مباشر من المندوب',
      governorate: 'الفرع',
      branchName: currentUser?.branchName || 'الفرع الرئيسي',
      currentBalance: 0,
    };

    setIsSubmitting(true);
    setErrorMessage(null);

    const balBefore = Number(effectiveCustomer.currentBalance ?? effectiveCustomer.balance ?? 0);
    const credLimit = Number(effectiveCustomer.creditLimit ?? 0);
    const balAfter = balBefore + cartSummary.grandTotal;
    const isExceeded = credLimit > 0 && balAfter > credLimit;
    const reqDown = isExceeded ? Math.max(0, balAfter - credLimit) : 0;
    const overdue = Number(effectiveCustomer.totalOverdueAndDue ?? effectiveCustomer.overdueBalance ?? 0);

    try {
      const finalNotes = repNotes.trim()
        ? repNotes.trim()
        : `طلبية مبيعات كاشير دريم - تسجيل بواسطة ${currentUser?.name || 'المندوب'}`;

      const result = createOrder({
        customerId: effectiveCustomer.id,
        customerName: effectiveCustomer.name,
        customerCode: effectiveCustomer.code,
        customerPhone: effectiveCustomer.phone,
        customerAddress: effectiveCustomer.address,
        customerTaxNumber: effectiveCustomer.taxNumber,
        repName: currentUser?.name || 'مندوب المبيعات',
        branchName: effectiveCustomer.branchName || currentUser?.branchName,
        paymentMethod: paymentMethod,
        discountPercentage: discountPercent,
        notes: finalNotes,
        customerBalanceBefore: balBefore,
        customerCreditLimit: credLimit,
        customerBalanceAfter: balAfter,
        customerOverdueBalance: overdue,
        creditLimitExceeded: isExceeded,
        requiredDownPayment: reqDown,
      });

      if (!result.success || !result.invoice) {
        setErrorMessage(result.message || 'تعذر حفظ الطلبية.');
        setIsSubmitting(false);
        return;
      }

      const msg = `تم حفظ الطلبية #${result.invoice.invoiceNumber} وإرسالها للمشرف للاعتماد بنجاح! ✅`;

      setSuccessToast(msg);
      clearCart();
      setRepNotes('');

      // If mobile drawer, close it
      if (onCloseMobileDrawer) {
        onCloseMobileDrawer();
      }

      // Navigate directly to Invoices tab
      if (onInvoiceTransferred) {
        onInvoiceTransferred(result.invoice);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('حدث خطأ أثناء حفظ الطلبية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="pos-cashier-terminal"
      className="bg-white text-slate-900 rounded-3xl shadow-lg border border-slate-200 flex flex-col overflow-hidden w-full"
    >
      {/* Drawer Dismiss Button for Mobile */}
      {isMobileDrawer && onCloseMobileDrawer && (
        <div className="bg-amber-400 text-slate-950 p-2.5 px-4 flex items-center justify-between shadow-sm">
          <button
            id="pos-cashier-hide-drawer-btn"
            onClick={onCloseMobileDrawer}
            className="flex items-center gap-2 font-black text-xs sm:text-sm cursor-pointer hover:opacity-90 active:scale-95 transition"
          >
            <ChevronDown className="w-4 h-4" />
            <span>إخفاء / متابعة إضافة منتجات</span>
          </button>
          <button
            onClick={onCloseMobileDrawer}
            className="p-1 rounded-lg hover:bg-black/10 transition cursor-pointer"
            title="إخفاء الكاشير"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Cashier Terminal Header */}
      <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-sm">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-black text-slate-900">فاتورة مبيعات كاشير دريم</h3>
              <span className="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                POS
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              {currentUser?.branchName || 'الفرع الرئيسي'} • {currentUser?.name || 'المندوب'}
            </div>
          </div>
        </div>

        {cart.length > 0 && (
          <button
            id="pos-cashier-clear-cart-btn"
            onClick={() => {
              if (window.confirm('هل أنت متأكد من رغبتك في تفريغ سلة الكاشير؟')) {
                clearCart();
              }
            }}
            className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-100 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
            title="تفريغ السلة"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">مسح</span>
          </button>
        )}
      </div>

      {/* Toast Feedback */}
      {errorMessage && (
        <div className="bg-rose-50 text-rose-700 p-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b border-rose-200 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successToast && (
        <div className="bg-emerald-50 text-emerald-700 p-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b border-emerald-200 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Customer Selector / Accordion Info Card */}
      <div className="p-2.5 sm:p-3 bg-slate-50 border-b border-slate-200 text-xs">
        {activeCustomer ? (
          <CustomerFinancialSummaryCard
            customer={activeCustomer}
            currentInvoiceAmount={cartSummary.grandTotal}
            theme="light"
            initiallyOpen={true}
            showCustomerDetails={true}
            title="بيانات وموقف العميل المالي"
            onChangeCustomer={() => {
              setLocalCustomer(null);
              if (onClearSelectedCustomer) onClearSelectedCustomer();
            }}
          />
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-amber-600" />
                <span>اختيار العميل التابع للمندوب:</span>
              </span>
              <button
                onClick={() => {
                  setLocalCustomer({
                    id: `c-cash-${Date.now()}`,
                    code: 'CASH-DIRECT',
                    name: 'عميل نقدي كاش (مباشر)',
                    phone: '',
                    address: 'بيع مباشر',
                    governorate: 'الفرع',
                    branchName: currentUser?.branchName || 'الفرع الرئيسي',
                    currentBalance: 0,
                  });
                }}
                className="text-amber-600 hover:text-amber-700 underline font-black cursor-pointer text-xs"
              >
                بيع نقدي كاش مباشر
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearch}
                onFocus={() => setIsCustomerDropdownOpen(true)}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setIsCustomerDropdownOpen(true);
                }}
                placeholder="ابحث باسم العميل أو الكود أو رقم التليفون أو اسم المحل..."
                className="w-full h-9 pl-3 pr-8 bg-white text-slate-900 placeholder-slate-400 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />

              {/* Customer Dropdown */}
              {isCustomerDropdownOpen && (
                <div className="absolute top-full right-0 left-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 font-medium">
                      لا يوجد عملاء مطابقين للبحث التابعين للمندوب
                    </div>
                  ) : (
                    filteredCustomers.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => {
                          setLocalCustomer(cust);
                          if (onSelectCustomer) onSelectCustomer(cust);
                          setIsCustomerDropdownOpen(false);
                          setCustomerSearch('');
                        }}
                        className="p-2.5 hover:bg-amber-50/80 cursor-pointer flex items-center justify-between transition gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">{cust.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {cust.code ? <span className="font-mono font-bold text-amber-700">{cust.code}</span> : 'بدون كود'}
                            {cust.phone ? ` • ${cust.phone}` : ''}
                            {cust.storeName ? ` • ${cust.storeName}` : ''}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <span className="text-[11px] font-mono font-bold text-slate-700 block">
                            {formatCurrency(cust.currentBalance ?? cust.balance ?? 0)}
                          </span>
                          <span className="text-[10px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md font-black">
                            اختيار
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <div
                    onClick={() => setIsCustomerDropdownOpen(false)}
                    className="p-2 text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer bg-slate-100 border-t border-slate-200"
                  >
                    إغلاق قائمة البحث ✕
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Switcher Tab: Cart Items vs Instant Mobile Preview */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setIsSidebarPreviewMode(false)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              !isSidebarPreviewMode
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>السلة ({cart.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarPreviewMode(true)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              isSidebarPreviewMode
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>معاينة الفاتورة</span>
          </button>
        </div>

        {cart.length > 0 && (
          <span className="text-[11px] text-amber-600 font-mono font-bold">
            {cartSummary.totalCartons} ك • {cartSummary.totalPieces} ق
          </span>
        )}
      </div>

      {/* Cart Content: Either Interactive Items or Instant Preview */}
      {isSidebarPreviewMode ? (
        /* Instant Mobile-Optimized Invoice Preview */
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[160px] max-h-[42vh] lg:max-h-[380px] bg-slate-50 divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              السلة فارغة. أضف أصناف لمعاينتها هنا فوراً
            </div>
          ) : (
            <>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">العميل:</span>
                  <strong className="text-amber-700">{activeCustomer?.name || 'عميل نقدي كاش'}</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">طريقة السداد:</span>
                  <strong className="text-slate-900">{paymentMethod}</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">الفرع:</span>
                  <strong className="text-slate-700">{currentUser?.branchName || 'الفرع الرئيسي'}</strong>
                </div>
              </div>

              {/* Items List in Preview Mode */}
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                  <span>بيان الأصناف والكميات:</span>
                  <span>{cart.length} أصناف</span>
                </div>
                {cart.map((item, idx) => {
                  const prod = item.product;
                  const cartonQty = prod.cartonQuantity || 1;
                  const totalUnits = (item.cartonCount * cartonQty) + item.pieceCount;
                  return (
                    <div key={`prev-${item.product.id}-${idx}`} className="bg-white p-2 rounded-lg border border-slate-200 text-xs flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 truncate">{prod.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {prod.code} • {item.cartonCount} ك {item.pieceCount > 0 ? `+ ${item.pieceCount} ق` : ''} ({totalUnits} قطعة)
                        </div>
                      </div>
                      <div className="text-left shrink-0 font-black text-amber-700 text-xs">
                        {formatCurrency(item.totalPrice)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Standard Interactive Items List */
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 min-h-[160px] max-h-[42vh] lg:max-h-[380px] bg-slate-50 divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-8 text-center text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-2 text-slate-300">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-slate-500">فاتورة الكاشير فارغة حالياً</div>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                اختر مجموعة من الأعلى أو ابحث بالكود لإضافة الأصناف هنا مباشرة
              </p>
            </div>
          ) : (
            cart.map((item, index) => {
              const prod = item.product;
              const lineTotal = item.totalPrice;

              return (
                <div key={`${item.product.id}-${index}`} className="pt-2 first:pt-0 space-y-1.5">
                  {/* Item Row Top: Title & Line Total */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-slate-900 truncate">{prod.name}</div>
                      <div className="text-[11px] text-amber-600 font-mono">
                        {prod.code} {prod.cartonQuantity ? `(${prod.cartonQuantity} ق/كرتونة)` : ''}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <strong className="text-xs font-black text-amber-700 block">
                        {formatCurrency(lineTotal)}
                      </strong>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition cursor-pointer text-[11px]"
                        title="حذف من الفاتورة"
                      >
                        <Trash2 className="w-3 h-3 inline" />
                      </button>
                    </div>
                  </div>

                  {/* Carton & Piece Controls */}
                  <div className="flex items-center justify-between gap-2 bg-white p-1.5 rounded-xl border border-slate-200 text-xs">
                    {/* Cartons */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-bold">كرتونة:</span>
                      <button
                        onClick={() => updateCartItem(item.product.id, { cartonCount: Math.max(0, item.cartonCount - 1) })}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition active:scale-95"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-black text-amber-600 text-xs w-6 text-center">
                        {item.cartonCount}
                      </span>
                      <button
                        onClick={() => updateCartItem(item.product.id, { cartonCount: item.cartonCount + 1 })}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Pieces */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-bold">قطعة:</span>
                      <button
                        onClick={() => updateCartItem(item.product.id, { pieceCount: Math.max(0, item.pieceCount - 1) })}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition active:scale-95"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-black text-blue-600 text-xs w-6 text-center">
                        {item.pieceCount}
                      </span>
                      <button
                        onClick={() => updateCartItem(item.product.id, { pieceCount: item.pieceCount + 1 })}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Discount & Payment Controls */}
      {cart.length > 0 && (
        <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2 text-xs">
          {/* Quick Discount Buttons */}
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs text-slate-500 font-bold">الخصم التجاري:</span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 5].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setDiscountPercent(pct)}
                  className={`px-2 py-0.5 rounded-md text-xs font-black transition cursor-pointer ${
                    discountPercent === pct
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method Toggle */}
          <div className="flex items-center justify-between gap-1">
            {(['نقدي (كاش)', 'آجل (30 يوم)', 'تحويل بنكي'] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold text-center transition cursor-pointer truncate ${
                  paymentMethod === method
                    ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                    : 'bg-white text-slate-500 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {method === 'نقدي (كاش)' ? 'نقدي' : method === 'آجل (30 يوم)' ? 'آجل 30 يوم' : 'تحويل بنكي'}
              </button>
            ))}
          </div>

          {/* Sales Rep Order Notes */}
          <div className="pt-2 border-t border-slate-200 space-y-1">
            <label className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              <span>ملاحظات المندوب والطلبية (ميعاد التسليم / شروط خاصة):</span>
            </label>
            <textarea
              value={repNotes}
              onChange={(e) => setRepNotes(e.target.value)}
              placeholder="اكتب ملاحظاتك هنا للمشرف ومدير الفرع..."
              rows={2}
              className="w-full p-2 bg-white text-slate-900 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none placeholder-slate-400"
            />
          </div>
        </div>
      )}

      {/* Financials & Grand Total Footer */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-2.5">
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>الكميات المطلوبة:</span>
            <strong className="text-slate-900">
              {cartSummary.totalCartons} ك • {cartSummary.totalPieces} قطعة
            </strong>
          </div>

          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>المجموع قبل الخصم:</span>
            <span className="text-slate-900 font-bold">{formatCurrency(cartSummary.subtotal)}</span>
          </div>

          {discountPercent > 0 && (
            <div className="flex items-center justify-between text-emerald-600 text-xs">
              <span>قيمة الخصم ({discountPercent}%):</span>
              <span className="font-bold">-{formatCurrency(cartSummary.discountAmount)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-sm font-bold text-slate-700">صافي الفاتورة:</span>
            <strong className="text-lg font-black text-amber-600">
              {formatCurrency(cartSummary.grandTotal)}
            </strong>
          </div>
        </div>

        {/* Action Buttons: Unified Flow */}
        <div className="space-y-2 pt-1">
          {/* Main Primary Button: Save for Supervisor & Branch Manager */}
          <button
            id="pos-post-invoice-btn"
            disabled={isSubmitting || cart.length === 0}
            onClick={() => handleSaveOrder()}
            className="w-full h-12 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-md transition transform active:scale-98 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
            title="حفظ الطلبية وإرسالها مباشرة للمشرف ومدير الفرع للمراجعة والاعتماد"
          >
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            <span>{isSubmitting ? 'جاري حفظ واعتماد الطلبية...' : '✅ حفظ واعتماد الطلبية (إرسال للمشرف)'}</span>
          </button>

          {/* Return / Modify Products Button */}
          {onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="w-full h-10 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <ArrowRight className="w-4 h-4" />
              <span>← تعديل الأصناف / رجوع لشاشة المنتجات</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
