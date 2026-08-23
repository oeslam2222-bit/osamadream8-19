import {
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  Minus,
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
import { ProductImage } from './ProductImage';
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
  const {
    cart,
    products,
    updateCartItem,
    removeFromCart,
    clearCart,
    getCartSummary,
    createOrder,
    currentUser,
    cloudinaryConfig
  } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerTaxNumber, setCustomerTaxNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('نقدي (كاش)');
  const [orderNotes, setOrderNotes] = useState('');
  const [splitShortagesToBackorder, setSplitShortagesToBackorder] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const summary = getCartSummary();
  const todayDate = new Date().toISOString().slice(0, 10);
  const hasWarehouseItems = cart.some((c) => c.fulfillFromMainWarehouse);

  const handleSubmitOrder = (andExportExcel = false, andShareWhatsApp = false) => {
    const errors: string[] = [];
    if (!customerName.trim()) {
      errors.push('يرجى إدخال اسم العميل أو اسم المحل / السوبر ماركت');
    }
    if (cart.length === 0) {
      errors.push('الطلبية فارغة! يرجى إضافة أصناف أولاً من الكتالوج');
    }

    // Check if any cart item exceeds available stock across branch + main warehouse
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
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerTaxNumber: customerTaxNumber.trim(),
        paymentMethod: paymentMethod,
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

      if (andShareWhatsApp) {
        shareInvoiceViaWhatsApp(createdInvoice, customerPhone);
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">إنشاء فاتورة مبيعات جديدة</h2>
              <p className="text-xs text-amber-300 font-semibold mt-0.5">
                شركة دريم للتجارة والتوزيع • نظام فواتير مبسط وسريع مع تأكيد الحجز الفوري
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-white">
          
          {/* Error Banner */}
          {formErrors.length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 text-red-900 p-4 rounded-2xl text-xs space-y-1.5 shadow-sm">
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

          {/* Customer Details Form */}
          <div className="bg-slate-50/70 border border-slate-200 p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-black text-slate-900 flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="flex items-center gap-1.5">
                <span>1. بيانات العميل والمحل</span>
                <span className="text-rose-600 font-black">*</span>
              </span>
              <span className="text-[10px] text-slate-500 font-bold">الحقول الأساسية لإصدار الفاتورة الإلكترونية</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-800 font-bold mb-1">اسم العميل / السوبر ماركت <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="مثال: سوبر ماركت الأمانة، محل أولاد رجب..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold text-slate-900 shadow-xs placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">رقم هاتف العميل (لإرسال فاتورة الواتساب)</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="مثال: 01023456789"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold text-slate-900 shadow-xs placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">عنوان العميل / المنطقة</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="مثال: شارع مكرم عبيد، المنطقة السادسة، مدينة نصر"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-slate-900 shadow-xs placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">الرقم الضريبي للعميل (اختياري)</label>
                <input
                  type="text"
                  value={customerTaxNumber}
                  onChange={(e) => setCustomerTaxNumber(e.target.value)}
                  placeholder="مثال: 341-987-123"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-slate-900 shadow-xs placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Cart Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                <span>2. الأصناف المحجوزة في الطلبية</span>
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
              <div className="space-y-3">
                {cart.map((item) => {
                  const liveProd = products.find((p) => p.id === item.product.id) || item.product;
                  const p = liveProd;

                  const branchAvail = Math.max(0, p.branchStockReserved);
                  const mainAvail = Math.max(0, p.mainWarehouseReserved);
                  const totalAvail = branchAvail + mainAvail;

                  // Stock Fulfillment Allocation Breakdown
                  const fromBranch = Math.min(item.cartonCount, branchAvail);
                  const fromMain = Math.max(0, item.cartonCount - fromBranch);
                  const isOverTotalStock = item.cartonCount > totalAvail;

                  return (
                    <div
                      key={p.id}
                      className={`bg-white border rounded-2xl p-3.5 shadow-xs space-y-3 transition ${
                        isOverTotalStock ? 'border-red-400 bg-red-50/20' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Product Row Header */}
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
                            <div className="flex items-center gap-2 mb-1">
                              <span className="bg-slate-900 text-amber-300 font-mono font-black text-xs px-2 py-0.5 rounded-md">
                                {p.code}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                {p.category}
                              </span>
                            </div>
                            <h4 className="font-black text-slate-900 text-xs sm:text-sm">{p.name}</h4>
                            <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              <span>شدة الكرتونة: <strong className="text-slate-900 font-bold">{p.cartonQuantity} ق</strong></span>
                              <span>•</span>
                              <span>سعر الكرتونة: <strong className="text-amber-900 font-black">{formatCurrency(p.cartonPrice)}</strong></span>
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

                      {/* Smart Stock Reservation Breakdown Badge */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-slate-600 shrink-0" />
                          <div className="text-[11px] text-slate-700">
                            <span>الرصيد المتاح: </span>
                            <strong className="text-emerald-700 font-black">{branchAvail} ك بالفرع</strong>
                            <span> | </span>
                            <strong className="text-blue-700 font-black">{mainAvail} ك بالمخزن المركزي</strong>
                            <span> (إجمالي متاح: <strong className="text-slate-950 font-black">{totalAvail} ك</strong>)</span>
                          </div>
                        </div>

                        {/* Real-time Allocation Label */}
                        <div className="text-[11px] font-black">
                          {isOverTotalStock ? (
                            <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md border border-red-300">
                              ⚠️ الكمية تتجاوز الإجمالي المتاح ({totalAvail} ك فقط)!
                            </span>
                          ) : fromBranch > 0 && fromMain > 0 ? (
                            <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 flex items-center gap-1">
                              ⚡ حجز مشترك: {fromBranch} ك من الفرع + {fromMain} ك من المخزن المركزي
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

                      {/* Quantity Controls & Row Total */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                        
                        {/* Carton Counter */}
                        <div className="flex items-center gap-2">
                          <span className="text-slate-800 font-black">الكمية بالكرتونة:</span>
                          <div className="flex items-center bg-slate-100 rounded-xl border border-slate-300 p-0.5">
                            <button
                              onClick={() => updateCartItem(p.id, { cartonCount: Math.max(1, item.cartonCount - 1) })}
                              className="w-8 h-8 flex items-center justify-center text-slate-800 hover:bg-white rounded-lg transition font-black cursor-pointer"
                              title="تقليل كرتونة"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={Math.max(1, totalAvail)}
                              value={item.cartonCount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                const clamped = totalAvail > 0 ? Math.min(val, totalAvail) : Math.max(1, val);
                                updateCartItem(p.id, { cartonCount: clamped });
                              }}
                              className="w-14 text-center bg-transparent font-black text-slate-900 focus:outline-none"
                            />
                            <button
                              disabled={item.cartonCount >= totalAvail}
                              onClick={() => updateCartItem(p.id, { cartonCount: Math.min(totalAvail, item.cartonCount + 1) })}
                              className="w-8 h-8 flex items-center justify-center text-slate-800 hover:bg-white rounded-lg transition font-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={item.cartonCount >= totalAvail ? 'تم الوصول للحد الأقصى المتاح' : 'زيادة كرتونة'}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-slate-500 text-[11px] font-bold">
                            ({item.cartonCount * (p.cartonQuantity || 1)} قطعة داخل الكراتين)
                          </span>
                        </div>

                        {/* Item Total Price */}
                        <div className="text-left flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-bold">إجمالي الصنف:</span>
                          <div className="text-sm font-black text-amber-950 bg-amber-100/70 px-3 py-1.5 rounded-xl border border-amber-300">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-slate-800 font-bold mb-1">طريقة سداد الفاتورة</label>
              <select
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

            <div>
              <label className="block text-slate-800 font-bold mb-1">ملاحظات التحميل والتسليم</label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="مثال: تسليم صباحاً، إرفاق إشعار الخصم، اتصال مسبق..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-slate-900 shadow-xs placeholder:text-slate-400"
              />
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
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl border border-slate-700 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h4 className="font-black text-sm text-amber-300">الملخص المالي للفاتورة</h4>
              <span className="text-xs text-slate-300 font-bold">شركة دريم • حساب سعر الكرتونة والخصم المباشر</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">إجمالي الكراتين</span>
                <strong className="text-base font-black text-amber-400">{summary.totalCartons} كرتونة</strong>
              </div>

              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">المجموع قبل الخصم</span>
                <strong className="text-sm font-black text-slate-200">{formatCurrency(summary.subtotal)}</strong>
              </div>

              <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] font-bold">الخصم التجاري الممنوح (3.5%)</span>
                <strong className="text-sm font-black text-emerald-400">-{formatCurrency(summary.discountAmount)}</strong>
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
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-black text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition cursor-pointer shadow-xs"
          >
            إلغاء
          </button>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Direct Export to Excel */}
            <button
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(true, false)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black px-3.5 py-2.5 rounded-xl text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="تصدير شيت إكسل رسمي لشركة دريم"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>حفظ وتصدير إكسل</span>
            </button>

            {/* Direct WhatsApp Share */}
            <button
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleSubmitOrder(false, true)}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black px-3.5 py-2.5 rounded-xl text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
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
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs shadow-md transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد الحجز والفاتورة الإلكترونية</span>
            </button>

          </div>

        </div>

      </div>
    </div>
  );
};
