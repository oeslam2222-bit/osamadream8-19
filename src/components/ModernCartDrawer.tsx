import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  X,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  User,
  Search,
  Building,
  AlertCircle,
  FileText,
  Send,
  ArrowRight,
  ChevronDown,
  Sparkles,
  DollarSign,
  Receipt
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { ProductImage } from './ProductImage';

interface ModernCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer?: Customer | null;
  onClearSelectedCustomer?: () => void;
  onSelectCustomer?: (customer: Customer) => void;
  onOrderCompleted?: (invoice: Invoice) => void;
}

export const ModernCartDrawer: React.FC<ModernCartDrawerProps> = ({
  isOpen,
  onClose,
  selectedCustomer,
  onClearSelectedCustomer,
  onSelectCustomer,
  onOrderCompleted
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
    customers
  } = useApp();

  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [localCustomer, setLocalCustomer] = useState<Customer | null>(selectedCustomer || null);
  const [repNotes, setRepNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync with prop
  React.useEffect(() => {
    if (selectedCustomer) {
      setLocalCustomer(selectedCustomer);
    }
  }, [selectedCustomer]);

  const activeCustomer = localCustomer || selectedCustomer;

  const cartSummary = useMemo(() => {
    return getCartSummary(0);
  }, [getCartSummary, cart]);

  // Customer options list for searching
  const filteredCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    if (!customerSearch.trim()) return list.slice(0, 50);
    const q = customerSearch.toLowerCase().trim();
    return list
      .filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.code && String(c.code).toLowerCase().includes(q)) ||
          (c.phone && String(c.phone).includes(q)) ||
          (c.salesRepName && c.salesRepName.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [customers, getVisibleCustomers, customerSearch]);

  const handleSelectCustomer = (c: Customer) => {
    setLocalCustomer(c);
    if (onSelectCustomer) onSelectCustomer(c);
    setIsCustomerDropdownOpen(false);
    setCustomerSearch('');
    setErrorMessage(null);
  };

  const handleClearCustomer = () => {
    setLocalCustomer(null);
    if (onClearSelectedCustomer) onClearSelectedCustomer();
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setErrorMessage('سلة الطلبية فارغة حالياً!');
      return;
    }

    if (!activeCustomer) {
      setErrorMessage('يرجى اختيار العميل أولاً لإتمام الطلبية وتوجيهها للمشرف.');
      setIsCustomerDropdownOpen(true);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const balBefore = activeCustomer.currentBalance ?? activeCustomer.balance ?? 0;
      const credLimit = activeCustomer.creditLimit || 0;
      const balAfter = balBefore + cartSummary.grandTotal;
      const overdue = activeCustomer.totalOverdueAndDue ?? activeCustomer.overdueBalance ?? 0;
      const isExceeded = credLimit > 0 && balAfter > credLimit;
      const reqDown = isExceeded ? Math.max(0, balAfter - credLimit) : 0;

      const result = createOrder({
        customerId: activeCustomer.id,
        customerName: activeCustomer.name,
        customerCode: activeCustomer.code,
        customerPhone: activeCustomer.phone,
        customerAddress: activeCustomer.address,
        customerTaxNumber: activeCustomer.taxNumber,
        repName: currentUser?.name || 'مندوب المبيعات',
        branchName: activeCustomer.branchName || currentUser?.branchName,
        paymentMethod: 'نقدي (كاش)',
        notes: repNotes.trim()
          ? `${repNotes} (طلب ميداني سريع)`
          : `طلبية مبيعات بواسطة ${currentUser?.name || 'المندوب'}`,
        customerBalanceBefore: balBefore,
        customerCreditLimit: credLimit,
        customerBalanceAfter: balAfter,
        customerOverdueBalance: overdue,
        creditLimitExceeded: isExceeded,
        requiredDownPayment: reqDown
      });

      if (!result.success || !result.invoice) {
        setErrorMessage(result.message || 'تعذر حفظ الطلبية.');
        setIsSubmitting(false);
        return;
      }

      clearCart();
      setRepNotes('');
      onClose();

      if (onOrderCompleted) {
        onOrderCompleted(result.invoice);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('حدث خطأ غير متوقع أثناء إرسال الطلبية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer Container:
          - Desktop: Slide-in Drawer from Left / Right
          - Mobile: Bottom Sheet from Bottom
      */}
      <div className="fixed inset-y-0 left-0 lg:inset-y-0 lg:left-0 flex max-w-full pointer-events-none w-full lg:w-[480px]">
        <div className="w-full pointer-events-auto flex flex-col bg-white shadow-2xl border-r border-[var(--app-line)] overflow-hidden rounded-t-3xl lg:rounded-none">
          {/* Mobile Drag Pill */}
          <div className="lg:hidden flex justify-center pt-2 pb-1 bg-slate-50 border-b border-[var(--app-line)]">
            <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="bg-[#0f233d] text-white p-4 sm:p-5 flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-sm shrink-0">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  <span>سلة المشتريات والطلبية</span>
                  <span className="bg-amber-400 text-slate-950 text-xs px-2 py-0.5 rounded-full font-black tabular-nums">
                    {cart.length}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300 font-medium">
                  نظام الطلب المباشر للمندوب • اعتماد المشرف
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-50 border-b border-rose-200 text-rose-700 p-3 text-xs font-bold flex items-center gap-2 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Selection Banner (Taager / Amazon style) */}
          <div className="p-3 sm:p-4 bg-slate-50 border-b border-[var(--app-line)] shrink-0">
            {activeCustomer ? (
              <div className="bg-white rounded-2xl p-3 border border-[var(--app-line)] shadow-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-black shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400 font-bold">العميل المحدد للطلبية:</div>
                    <div className="font-black text-slate-900 text-xs sm:text-sm truncate">
                      {activeCustomer.name}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                      <span>كود: {activeCustomer.code || 'N/A'}</span>
                      <span>•</span>
                      <span>المديونية: <strong className="text-rose-600 font-black">{formatCurrency(activeCustomer.currentBalance ?? activeCustomer.balance ?? 0)} ج</strong></span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-200 transition shrink-0 cursor-pointer"
                >
                  تغيير
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-600" />
                    <span>حدد العميل الموجه له الطلبية:</span>
                  </label>
                  <span className="text-[10px] text-rose-600 font-bold">* إلزامي للحفظ</span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="ابحث باسم العميل أو الكود أو رقم الهاتف..."
                    className="w-full h-10 pr-9 pl-3 text-xs rounded-xl border border-[var(--app-line)] bg-white focus:outline-none focus:border-[#0f233d]"
                  />

                  {/* Customer Dropdown Results */}
                  {isCustomerDropdownOpen && (
                    <div className="absolute top-11 right-0 left-0 bg-white border border-[var(--app-line)] rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 divide-y divide-slate-100">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-center text-slate-400 text-xs">
                          لا يوجد عميل يطابق البحث
                        </div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectCustomer(c)}
                            className="w-full text-right p-2.5 hover:bg-amber-50/60 transition flex items-center justify-between text-xs cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">{c.name}</div>
                              <div className="text-[10px] text-slate-400">
                                كود: {c.code || 'N/A'} • {c.branchName || 'فرع عام'}
                              </div>
                            </div>
                            <div className="text-left shrink-0">
                              <span className="text-[11px] font-black text-rose-600">
                                {formatCurrency(c.currentBalance ?? c.balance ?? 0)} ج
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                  <ShoppingCart className="w-8 h-8 stroke-1" />
                </div>
                <div>
                  <h4 className="font-black text-slate-800 text-sm">سلة الطلبية فارغة</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    تصفح الكتالوج واضغط على "أضف للسلة" لأي صنف لإضافته مباشرة للطلبية.
                  </p>
                </div>
              </div>
            ) : (
              cart.map((item) => {
                const p = item.product;
                const isPiece = item.orderType === 'piece';
                const count = isPiece ? item.pieceCount : item.cartonCount;
                const unitLabel = isPiece ? 'قطعة' : 'كرتونة';

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-[var(--app-line)] p-3 shadow-xs flex items-center gap-3 hover:border-slate-300 transition"
                  >
                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      <ProductImage
                        product={p}
                        sizeVariant="thumbnail"
                        className="w-full h-full object-contain p-1"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-slate-900 text-xs sm:text-sm truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        كود: {p.code} • {p.cartonQuantity ? `كرتونة ${p.cartonQuantity} قطعة` : 'قطعة'}
                      </div>
                      <div className="text-xs font-black text-amber-700 mt-1 tabular-nums">
                        {formatCurrency(item.unitPrice)} ج <span className="text-[10px] text-slate-400 font-normal">/ {unitLabel}</span>
                      </div>
                    </div>

                    {/* Stepper (+ / -) & Trash */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeFromCart(p.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                        title="حذف من السلة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5 bg-slate-50 border border-[var(--app-line)] rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (count <= 1) {
                              removeFromCart(p.id);
                            } else {
                              updateCartItem(p.id, isPiece ? { pieceCount: count - 1 } : { cartonCount: count - 1 });
                            }
                          }}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center font-black active:scale-90 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-black text-xs tabular-nums text-slate-900">
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            updateCartItem(p.id, isPiece ? { pieceCount: count + 1 } : { cartonCount: count + 1 });
                          }}
                          className="w-7 h-7 rounded-lg bg-[#0f233d] text-amber-300 hover:bg-[#1a3861] flex items-center justify-center font-black active:scale-90 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-[11px] font-black text-slate-900 tabular-nums">
                        {formatCurrency(item.totalPrice)} ج
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Rep Notes */}
            {cart.length > 0 && (
              <div className="pt-2">
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">
                  ملاحظات الطلبية للمشرف (اختياري):
                </label>
                <input
                  type="text"
                  value={repNotes}
                  onChange={(e) => setRepNotes(e.target.value)}
                  placeholder="مثال: تسليم غداً صباحاً، أو بضاعة عاجلة..."
                  className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--app-line)] focus:outline-none focus:border-[#0f233d]"
                />
              </div>
            )}
          </div>

          {/* Footer & Checkout Action (Amazon / Raneen Style) */}
          {cart.length > 0 && (
            <div className="bg-slate-50 border-t border-[var(--app-line)] p-4 space-y-3 shrink-0">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>عدد الأصناف:</span>
                  <span className="font-bold text-slate-900">{cart.length} أصناف</span>
                </div>
                <div className="flex justify-between">
                  <span>إجمالي القطع:</span>
                  <span className="font-bold text-slate-900">{cartSummary.totalPieces} قطعة</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
                  <span>الإجمالي الصافي:</span>
                  <span className="text-base text-amber-700 tabular-nums">
                    {formatCurrency(cartSummary.grandTotal)} جنيه
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isSubmitting || cart.length === 0}
                className="w-full h-12 bg-gradient-to-l from-[#0f233d] to-[#1a3a63] hover:brightness-110 active:scale-98 text-amber-300 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                    <span>جاري تسجيل وإرسال الطلبية...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>تأكيد الطلبية وإرسالها للمشرف للاعتماد</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
