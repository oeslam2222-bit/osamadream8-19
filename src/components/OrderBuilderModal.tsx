import {
  AlertCircle,
  Building,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  FileText,
  Minus,
  Package,
  Plus,
  Receipt,
  Share2,
  ShoppingCart,
  Trash2,
  User,
  Warehouse,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { formatCurrency, shareInvoiceViaWhatsApp } from '../services/invoiceService';
import { PaymentMethod } from '../types';

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
  const { cart, updateCartItem, removeFromCart, clearCart, getCartSummary, createOrder, currentUser, branches } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerTaxNumber, setCustomerTaxNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي (كاش)');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const summary = getCartSummary();
  const todayDate = new Date().toISOString().slice(0, 10);

  const handleSubmitOrder = (andExportExcel = false, andShareWhatsApp = false) => {
    const errors: string[] = [];
    if (!customerName.trim()) {
      errors.push('يرجى إدخال اسم العميل أو اسم المحل / السوبر ماركت');
    }
    if (cart.length === 0) {
      errors.push('الطلبية فارغة! يرجى إضافة أصناف أولاً من الكتالوج');
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const createdInvoice = createOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerTaxNumber: customerTaxNumber.trim(),
        paymentMethod: paymentMethod,
        notes: orderNotes.trim(),
        status: 'قيد المراجعة',
      });

      if (andExportExcel) {
        exportElectronicInvoiceToExcel(createdInvoice);
      }

      if (andShareWhatsApp) {
        shareInvoiceViaWhatsApp(createdInvoice, customerPhone);
      }

      onInvoiceCreated(createdInvoice);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black">إنشاء طلبية / فاتورة مبيعات جديدة</h2>
              <p className="text-xs text-amber-300/90">
                شركة دريم للتجارة والتوزيع • حساب الفاتورة التقديرية والتصدير
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Error Banner */}
          {formErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-2xl text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>تنبيه عند تسجيل الفاتورة:</span>
              </div>
              <ul className="list-disc list-inside pr-4 space-y-0.5 font-medium">
                {formErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Top Info Bar: Rep Name, Branch, Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px]">المندوب المسئول:</span>
                <strong className="text-slate-900">{currentUser.name}</strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px]">فرع التحميل:</span>
                <strong className="text-slate-900">{currentUser.branchName}</strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px]">تاريخ الفاتورة:</span>
                <strong className="text-slate-900">{todayDate}</strong>
              </div>
            </div>
          </div>

          {/* Customer Details Form */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span>1. بيانات العميل والمحل</span>
              <span className="text-rose-500 text-xs">*</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">اسم العميل / السوبر ماركت *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="مثال: سوبر ماركت الأمانة، محل أولاد رجب..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">رقم هاتف العميل (لإرسال الواتساب)</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="مثال: 01023456789"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">عنوان العميل / المنطقة</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="مثال: شارع مكرم عبيد، المنطقة السادسة، مدينة نصر"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">الرقم الضريبي للعميل (اختياري)</label>
                <input
                  type="text"
                  value={customerTaxNumber}
                  onChange={(e) => setCustomerTaxNumber(e.target.value)}
                  placeholder="مثال: 341-987-123"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* Cart Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>2. الأصناف المحددة في الطلبية</span>
                <span className="bg-amber-100 text-amber-900 text-xs px-2 py-0.5 rounded-full font-bold">
                  {cart.length} أصناف
                </span>
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ الطلبية</span>
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-2">
                <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto" />
                <div className="font-bold text-slate-700 text-xs sm:text-sm">لم تقم بإضافة أي أصناف بعد!</div>
                <p className="text-slate-400 text-xs">
                  توجه إلى كتالوج المنتجات واضغط على (+1 كرتونة) أو (+1 قطعة) لإضافة أصناف دريم.
                </p>
                <button
                  onClick={onClose}
                  className="bg-amber-500 text-slate-950 font-black px-4 py-1.5 rounded-xl text-xs shadow hover:bg-amber-400"
                >
                  العودة للكتالوج
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const p = item.product;
                  const pieceMultiplier = p.cartonQuantity || 1;
                  const totalUnits = (item.cartonCount * pieceMultiplier) + item.pieceCount;
                  const branchShortage = totalUnits > p.branchStockActual;

                  return (
                    <div
                      key={p.id}
                      className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-3"
                    >
                      {/* Product Row Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="bg-slate-900 text-amber-300 font-black text-xs px-2 py-0.5 rounded-md">
                            {p.code}
                          </span>
                          <div>
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{p.name}</h4>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                              <span>شدة الكرتونة: {p.cartonQuantity} ق</span>
                              <span>سعر القطعة: {formatCurrency(p.promoPrice || p.piecePrice)}</span>
                              <span>سعر الكرتونة: {formatCurrency(p.cartonPrice)}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => removeFromCart(p.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg"
                          title="حذف الصنف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Stock Warning & Warehouse Fulfill Switch */}
                      {branchShortage && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              الكمية المطلوبة ({totalUnits} ق) تفوق مخزون الفرع الحالي ({p.branchStockActual} ق).
                            </span>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded-lg border border-amber-300 text-amber-950 font-bold text-[11px]">
                            <input
                              type="checkbox"
                              checked={item.fulfillFromMainWarehouse || false}
                              onChange={(e) =>
                                updateCartItem(p.id, { fulfillFromMainWarehouse: e.target.checked })
                              }
                              className="accent-amber-500 rounded"
                            />
                            <span>سحب العجز من المخزن الرئيسي المركزي (أكتوبر)</span>
                          </label>
                        </div>
                      )}

                      {/* Quantity Controls & Row Total */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                        
                        {/* Carton Counter */}
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-bold">الكراتين:</span>
                          <div className="flex items-center bg-slate-100 rounded-xl border border-slate-200 p-0.5">
                            <button
                              onClick={() => updateCartItem(p.id, { cartonCount: Math.max(0, item.cartonCount - 1) })}
                              className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-white rounded-lg transition"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={item.cartonCount}
                              onChange={(e) => updateCartItem(p.id, { cartonCount: Math.max(0, parseInt(e.target.value) || 0) })}
                              className="w-12 text-center bg-transparent font-black text-slate-900 focus:outline-none"
                            />
                            <button
                              onClick={() => updateCartItem(p.id, { cartonCount: item.cartonCount + 1 })}
                              className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-white rounded-lg transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Piece Counter */}
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-bold">القطع المنفردة:</span>
                          <div className="flex items-center bg-slate-100 rounded-xl border border-slate-200 p-0.5">
                            <button
                              onClick={() => updateCartItem(p.id, { pieceCount: Math.max(0, item.pieceCount - 1) })}
                              className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-white rounded-lg transition"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={item.pieceCount}
                              onChange={(e) => updateCartItem(p.id, { pieceCount: Math.max(0, parseInt(e.target.value) || 0) })}
                              className="w-12 text-center bg-transparent font-black text-slate-900 focus:outline-none"
                            />
                            <button
                              onClick={() => updateCartItem(p.id, { pieceCount: item.pieceCount + 1 })}
                              className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-white rounded-lg transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Item Total Units & Price */}
                        <div className="text-left flex items-center gap-3">
                          <div className="text-[11px] text-slate-500">
                            المجموع: <strong className="text-slate-900">{totalUnits} قطعة</strong>
                          </div>
                          <div className="text-sm font-black text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                            {formatCurrency(item.totalPrice)}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Method & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">طريقة سداد الفاتورة</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs font-semibold text-slate-800"
              >
                <option value="نقدي (كاش)">نقدي (كاش عند الاستلام)</option>
                <option value="آجل (30 يوم)">آجل تجاري (30 يوم)</option>
                <option value="آجل (60 يوم)">آجل تجاري (60 يوم)</option>
                <option value="تحويل بنكي">تحويل بنكي / إلكتروني</option>
                <option value="شيك">شيك بنكي معتمد</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">ملاحظات التحميل والتسليم</label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="مثال: تسليم صباحاً، إرفاق إشعار الخصم، اتصال مسبق..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs"
              />
            </div>
          </div>

          {/* Estimated Financial Summary Box */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl border border-slate-700 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h4 className="font-extrabold text-sm text-amber-300">الملخص المالي والتقديري للفاتورة</h4>
              <span className="text-xs text-slate-400">حساب آلي لشركة دريم</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px]">إجمالي الكراتين</span>
                <strong className="text-base font-black text-amber-400">{summary.totalCartons} كرتونة</strong>
              </div>

              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px]">إجمالي القطع</span>
                <strong className="text-base font-black text-white">{summary.totalPieces} قطعة</strong>
              </div>

              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px]">الخصم التجاري (3.5%)</span>
                <strong className="text-sm font-black text-emerald-400">-{formatCurrency(summary.discountAmount)}</strong>
              </div>

              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px]">ضريبة القيمة المضافة (14%)</span>
                <strong className="text-sm font-black text-amber-300">+{formatCurrency(summary.taxAmount)}</strong>
              </div>
            </div>

            {/* Estimated Grand Total */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-700">
              <div>
                <span className="text-xs text-slate-300 block">إجمالي الفاتورة التقديرية النهائي:</span>
                <div className="text-2xl font-black text-yellow-400 tracking-tight">
                  {formatCurrency(summary.grandTotal)}
                </div>
              </div>
              <div className="text-[11px] text-slate-400 text-left">
                المجموع قبل الضريبة: {formatCurrency(summary.subtotal)}
              </div>
            </div>

          </div>

        </div>

        {/* Modal Actions Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl"
          >
            إلغاء
          </button>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Direct Export to Excel */}
            <button
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(true, false)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs shadow-sm transition disabled:opacity-50"
              title="تصدير شيت إكسل رسمي لشركة دريم"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>حفظ وتصدير إكسل</span>
            </button>

            {/* Direct WhatsApp Share */}
            <button
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(false, true)}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs shadow-sm transition disabled:opacity-50"
              title="مشاركة تفاصيل الفاتورة عبر واتساب"
            >
              <Share2 className="w-4 h-4" />
              <span>مشاركة واتساب</span>
            </button>

            {/* Save Order & Open E-Invoice */}
            <button
              id="confirm-order-btn"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(false, false)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs shadow-md transition transform active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد الفاتورة الإلكترونية</span>
            </button>

          </div>

        </div>

      </div>
    </div>
  );
};
