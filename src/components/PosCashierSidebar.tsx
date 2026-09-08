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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Invoice, PaymentMethod } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { ProductImage } from './ProductImage';

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

  // Filtered customers for quick search in cashier
  const filteredCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    if (!customerSearch.trim()) return list.slice(0, 8);
    const q = customerSearch.toLowerCase().trim();
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
      )
      .slice(0, 8);
  }, [getVisibleCustomers, customers, customerSearch]);

  // Handle saving the order (حفظ الطلبية للمشرف وتصدير Excel / PDF)
  const handleSaveOrder = async (andExportExcel?: boolean, andDownloadPDF?: boolean) => {
    if (cart.length === 0) {
      setErrorMessage('سلة الفاتورة فارغة! يرجى إضافة أصناف أولاً.');
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }

    const effectiveCustomer = activeCustomer || {
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
        notes: `طلبية مبيعات كاشير دريم - تسجيل سريع بواسطة ${currentUser?.name || 'المندوب'}`,
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

      // Export to Excel if requested
      if (andExportExcel) {
        exportElectronicInvoiceToExcel(result.invoice);
      }

      // Download PDF if requested
      if (andDownloadPDF) {
        await downloadInvoicePDF(result.invoice);
      }

      const msg = andExportExcel
        ? `تم حفظ الطلبية #${result.invoice.invoiceNumber} وتنزيل شيت إكسل بنجاح! 📊`
        : andDownloadPDF
        ? `تم حفظ الطلبية #${result.invoice.invoiceNumber} وتنزيل ملف PDF بنجاح! 📄`
        : `تم حفظ الطلبية #${result.invoice.invoiceNumber} وإرسالها للمشرف للاعتماد بنجاح! ✅`;

      setSuccessToast(msg);
      clearCart();

      // If mobile drawer, close it
      if (onCloseMobileDrawer) {
        onCloseMobileDrawer();
      }

      // Navigate directly to Invoices tab as requested!
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
      className="bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden w-full"
    >
      {/* Drawer Dismiss Button for Mobile */}
      {isMobileDrawer && onCloseMobileDrawer && (
        <div className="bg-amber-400 text-slate-950 p-2.5 px-4 flex items-center justify-between shadow-md">
          <button
            id="pos-cashier-hide-drawer-btn"
            onClick={onCloseMobileDrawer}
            className="flex items-center gap-2 font-black text-xs sm:text-sm cursor-pointer hover:opacity-90 active:scale-95 transition"
          >
            <ChevronDown className="w-4 h-4 animate-bounce" />
            <span>🔽 إخفاء / متابعة إضافة منتجات أخرى</span>
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
      <div className="p-3.5 sm:p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-black text-white">فاتورة مبيعات كاشير دريم</h3>
              <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                POS ⚡
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
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
            className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            title="تفريغ السلة"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">مسح</span>
          </button>
        )}
      </div>

      {/* Toast Feedback */}
      {errorMessage && (
        <div className="bg-rose-900/90 text-white p-2.5 px-3 text-xs font-black flex items-center gap-2 border-b border-rose-700 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successToast && (
        <div className="bg-emerald-600 text-white p-2.5 px-3 text-xs font-black flex items-center gap-2 border-b border-emerald-500 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Customer Selector / Info Card */}
      <div className="p-3 bg-slate-850 border-b border-slate-800 text-xs">
        {activeCustomer ? (
          <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">العميل:</div>
                <div className="font-black text-amber-300 truncate">{activeCustomer.name}</div>
                <div className="text-[10px] text-slate-400">
                  كود: {activeCustomer.code || 'كاش'} 
                  {activeCustomer.currentBalance ? ` • مديونية: ${formatCurrency(activeCustomer.currentBalance)}` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setLocalCustomer(null);
                if (onClearSelectedCustomer) onClearSelectedCustomer();
              }}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-700 transition cursor-pointer"
              title="تغيير العميل"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold">
              <span>تحديد العميل:</span>
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
                className="text-amber-400 hover:text-amber-300 underline font-black cursor-pointer text-[10px]"
              >
                ⚡ بيع نقدي مباشر
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
                placeholder="ابحث عن اسم أو كود العميل..."
                className="w-full h-8 pl-3 pr-8 bg-slate-800 text-white placeholder-slate-400 text-xs rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />

              {/* Customer Dropdown */}
              {isCustomerDropdownOpen && (
                <div className="absolute top-full right-0 left-0 mt-1 z-30 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-44 overflow-y-auto divide-y divide-slate-700 text-xs">
                  {filteredCustomers.map((cust) => (
                    <div
                      key={cust.id}
                      onClick={() => {
                        setLocalCustomer(cust);
                        if (onSelectCustomer) onSelectCustomer(cust);
                        setIsCustomerDropdownOpen(false);
                        setCustomerSearch('');
                      }}
                      className="p-2 hover:bg-slate-700 cursor-pointer flex items-center justify-between transition"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{cust.name}</div>
                        <div className="text-[10px] text-slate-400">{cust.code || 'بدون كود'} • {cust.phone || ''}</div>
                      </div>
                      <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-black shrink-0">
                        اختيار
                      </span>
                    </div>
                  ))}
                  <div
                    onClick={() => setIsCustomerDropdownOpen(false)}
                    className="p-1.5 text-center text-[10px] text-slate-400 hover:text-white cursor-pointer bg-slate-850"
                  >
                    إغلاق القائمة
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cart Items List (Cashier Slip Items) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[160px] max-h-[320px] sm:max-h-[360px] bg-slate-900/60 divide-y divide-slate-800/80">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-8 text-center text-slate-500">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-2 text-slate-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div className="text-xs font-bold text-slate-400">فاتورة الكاشير فارغة حالياً</div>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
              اختر مجموعة من الأعلى أو ابحث بالكود لإضافة الأصناف هنا مباشرة 🛍️
            </p>
          </div>
        ) : (
          cart.map((item, index) => {
            const prod = item.product;
            const cartonPrice = item.unitPrice || prod.cartonPrice;
            const piecePrice = item.pricePerPiece || prod.piecePrice || (prod.cartonPrice / (prod.cartonQuantity || 1));
            const lineTotal = item.totalPrice;

            return (
              <div key={`${item.product.id}-${index}`} className="pt-2.5 first:pt-0 space-y-1.5">
                {/* Item Row Top: Title & Line Total */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-white truncate">{prod.name}</div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      {prod.code} {prod.cartonQuantity ? `(${prod.cartonQuantity} ق/كرتونة)` : ''}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <strong className="text-xs font-black text-amber-300 block">
                      {formatCurrency(lineTotal)}
                    </strong>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer text-[10px]"
                      title="حذف من الفاتورة"
                    >
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  </div>
                </div>

                {/* Carton & Piece Controls */}
                <div className="flex items-center justify-between gap-2 bg-slate-800/80 p-1.5 rounded-xl text-xs">
                  {/* Cartons */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">كرتونة:</span>
                    <button
                      onClick={() => updateCartItem(item.product.id, { cartonCount: Math.max(0, item.cartonCount - 1) })}
                      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center cursor-pointer transition active:scale-95"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-black text-amber-400 text-xs w-5 text-center">
                      {item.cartonCount}
                    </span>
                    <button
                      onClick={() => updateCartItem(item.product.id, { cartonCount: item.cartonCount + 1 })}
                      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center cursor-pointer transition active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Pieces */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">قطعة:</span>
                    <button
                      onClick={() => updateCartItem(item.product.id, { pieceCount: Math.max(0, item.pieceCount - 1) })}
                      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center cursor-pointer transition active:scale-95"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-black text-blue-300 text-xs w-5 text-center">
                      {item.pieceCount}
                    </span>
                    <button
                      onClick={() => updateCartItem(item.product.id, { pieceCount: item.pieceCount + 1 })}
                      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center cursor-pointer transition active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Discount & Payment Controls */}
      {cart.length > 0 && (
        <div className="p-3 bg-slate-850 border-t border-slate-800 space-y-2 text-xs">
          {/* Quick Discount Buttons */}
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] text-slate-400 font-bold">الخصم التجاري:</span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 5].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setDiscountPercent(pct)}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black transition cursor-pointer ${
                    discountPercent === pct
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
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
                className={`flex-1 py-1 rounded-lg text-[10px] font-bold text-center transition cursor-pointer truncate ${
                  paymentMethod === method
                    ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {method === 'نقدي (كاش)' ? '💵 نقدي' : method === 'آجل (30 يوم)' ? '⏳ آجل 30 يوم' : '🏦 تحويل'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Financials & Grand Total Footer */}
      <div className="p-3.5 bg-slate-950 border-t border-slate-800 space-y-2.5">
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>الكميات المطلوبة:</span>
            <strong className="text-white">
              {cartSummary.totalCartons} كرتونة • {cartSummary.totalPieces} قطعة
            </strong>
          </div>

          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>المجموع قبل الخصم:</span>
            <span>{formatCurrency(cartSummary.subtotal)}</span>
          </div>

          {discountPercent > 0 && (
            <div className="flex items-center justify-between text-emerald-400 text-[11px]">
              <span>قيمة الخصم ({discountPercent}%):</span>
              <span>-{formatCurrency(cartSummary.discountAmount)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-300">صافي الفاتورة النهائي:</span>
            <strong className="text-lg font-black text-amber-400">
              {formatCurrency(cartSummary.grandTotal)}
            </strong>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Quick Export Row: Excel & PDF */}
          <div className="grid grid-cols-2 gap-2">
            <button
              id="pos-export-excel-btn"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSaveOrder(true, false)}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="حفظ الطلبية وتنزيل شيت إكسل جاهز بالأكواد لرفعه على السيستم"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>حفظ وإكسل 📊</span>
            </button>

            <button
              id="pos-export-pdf-btn"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSaveOrder(false, true)}
              className="h-10 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="حفظ الطلبية وتنزيل فاتورة PDF فورية"
            >
              <Download className="w-3.5 h-3.5" />
              <span>حفظ و PDF 📄</span>
            </button>
          </div>

          {/* Main Button: Save for Supervisor & Branch Manager */}
          <button
            id="pos-post-invoice-btn"
            disabled={isSubmitting || cart.length === 0}
            onClick={() => handleSaveOrder(false, false)}
            className="w-full h-11 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg transition transform active:scale-98 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
            title="حفظ الطلبية وإرسالها مباشرة للمشرف ومدير الفرع للمراجعة والاعتماد"
          >
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            <span>{isSubmitting ? 'جاري حفظ الطلبية...' : 'حفظ الطلبية (إرسال للمشرف) ✅'}</span>
          </button>

          {/* Secondary Button: Full Preview & Editing */}
          {onOpenDetailedModal && (
            <button
              id="pos-preview-invoice-btn"
              disabled={cart.length === 0}
              onClick={onOpenDetailedModal}
              className="w-full h-9 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="معاينة تفاصيل الطلبية كاملة وتعديل البنود"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>معاينة الطلبية كاملة وتعديل البنود 👁️</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
