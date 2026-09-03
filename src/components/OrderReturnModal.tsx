import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  X,
  AlertTriangle,
  Package,
  Boxes,
  Coins,
  FileText,
  ShieldCheck,
  User,
  Store,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Invoice, ReturnedItem, ReturnRecord } from '../types';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';

interface OrderReturnModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string, record?: ReturnRecord) => void;
}

export const OrderReturnModal: React.FC<OrderReturnModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { processOrderReturn } = useApp();

  const [returnMode, setReturnMode] = useState<'partial' | 'full'>('partial');
  const [returnReason, setReturnReason] = useState<string>('مرتجع بطلب العميل واسترجاع البضاعة للمخزن');
  const [restockToInventory, setRestockToInventory] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Map of productId -> { returnCartons, returnPieces, condition, returnReason }
  const [itemReturns, setItemReturns] = useState<
    Record<
      string,
      {
        returnCartons: number;
        returnPieces: number;
        condition: 'good_condition' | 'damaged' | 'expired';
        reason: string;
      }
    >
  >({});

  // Calculate previously returned quantities per product
  const previouslyReturnedMap = useMemo(() => {
    const map: Record<string, { cartons: number; pieces: number; amount: number }> = {};
    if (!invoice || !invoice.returnRecords) return map;

    invoice.returnRecords.forEach((rec) => {
      rec.returnedItems.forEach((it) => {
        if (!map[it.productId]) {
          map[it.productId] = { cartons: 0, pieces: 0, amount: 0 };
        }
        map[it.productId].cartons += it.cartonCount || 0;
        map[it.productId].pieces += it.pieceCount || 0;
        map[it.productId].amount += it.refundAmount || 0;
      });
    });
    return map;
  }, [invoice]);

  // Initialize or toggle full/partial return mode
  React.useEffect(() => {
    if (!invoice) return;

    const initial: Record<
      string,
      {
        returnCartons: number;
        returnPieces: number;
        condition: 'good_condition' | 'damaged' | 'expired';
        reason: string;
      }
    > = {};

    invoice.items.forEach((item) => {
      const prev = previouslyReturnedMap[item.productId] || { cartons: 0, pieces: 0 };
      const remainingCartons = Math.max(0, item.cartonCount - prev.cartons);
      const remainingPieces = Math.max(0, (item.pieceCount || 0) - prev.pieces);

      initial[item.productId] = {
        returnCartons: returnMode === 'full' ? remainingCartons : 0,
        returnPieces: returnMode === 'full' ? remainingPieces : 0,
        condition: 'good_condition',
        reason: '',
      };
    });

    setItemReturns(initial);
  }, [invoice, returnMode, previouslyReturnedMap]);

  if (!isOpen || !invoice) return null;

  // Compute calculated returned items payload
  const calculatedItems: ReturnedItem[] = invoice.items
    .map((item) => {
      const state = itemReturns[item.productId] || {
        returnCartons: 0,
        returnPieces: 0,
        condition: 'good_condition' as const,
        reason: '',
      };
      const cartonQty = item.cartonQuantity || 1;
      const pricePerCarton = item.pricePerCarton || item.appliedPrice || 0;
      const pricePerPiece = item.pricePerPiece || (cartonQty > 0 ? pricePerCarton / cartonQty : 0);

      const retCartons = Math.max(0, Number(state.returnCartons) || 0);
      const retPieces = Math.max(0, Number(state.returnPieces) || 0);
      const totalPieces = retCartons * cartonQty + retPieces;

      // Calculate refund amount accurately based on item price & proportion
      const refundAmount = retCartons * pricePerCarton + retPieces * pricePerPiece;

      return {
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        cartonCount: retCartons,
        pieceCount: retPieces,
        cartonQuantity: cartonQty,
        totalPieces,
        pricePerCarton,
        pricePerPiece,
        refundAmount,
        returnReason: state.reason || returnReason,
        condition: state.condition,
      };
    })
    .filter((it) => it.cartonCount > 0 || it.pieceCount > 0);

  const totalRefundAmount = calculatedItems.reduce((sum, it) => sum + it.refundAmount, 0);
  const totalReturnedCartons = calculatedItems.reduce((sum, it) => sum + it.cartonCount, 0);
  const totalReturnedPieces = calculatedItems.reduce((sum, it) => sum + it.totalPieces, 0);

  const prevTotalRefunded = invoice.totalRefundedAmount || 0;
  const netEstimatedTotalAfterThisReturn = Math.max(0, invoice.estimatedGrandTotal - (prevTotalRefunded + totalRefundAmount));

  const handleCartonCountChange = (productId: string, val: number, maxCartons: number) => {
    const clamped = Math.max(0, Math.min(maxCartons, Math.floor(val || 0)));
    setItemReturns((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {
          returnCartons: 0,
          returnPieces: 0,
          condition: 'good_condition',
          reason: '',
        }),
        returnCartons: clamped,
      },
    }));
  };

  const handlePieceCountChange = (productId: string, val: number, maxPieces: number) => {
    const clamped = Math.max(0, Math.min(maxPieces, Math.floor(val || 0)));
    setItemReturns((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {
          returnCartons: 0,
          returnPieces: 0,
          condition: 'good_condition',
          reason: '',
        }),
        returnPieces: clamped,
      },
    }));
  };

  const handleConditionChange = (
    productId: string,
    condition: 'good_condition' | 'damaged' | 'expired'
  ) => {
    setItemReturns((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {
          returnCartons: 0,
          returnPieces: 0,
          condition: 'good_condition',
          reason: '',
        }),
        condition,
      },
    }));
  };

  const handleSelectAllRemaining = () => {
    const next: typeof itemReturns = {};
    invoice.items.forEach((item) => {
      const prev = previouslyReturnedMap[item.productId] || { cartons: 0, pieces: 0 };
      const remainingCartons = Math.max(0, item.cartonCount - prev.cartons);
      const remainingPieces = Math.max(0, (item.pieceCount || 0) - prev.pieces);

      next[item.productId] = {
        returnCartons: remainingCartons,
        returnPieces: remainingPieces,
        condition: itemReturns[item.productId]?.condition || 'good_condition',
        reason: itemReturns[item.productId]?.reason || '',
      };
    });
    setItemReturns(next);
  };

  const handleResetToZero = () => {
    const next: typeof itemReturns = {};
    invoice.items.forEach((item) => {
      next[item.productId] = {
        returnCartons: 0,
        returnPieces: 0,
        condition: 'good_condition',
        reason: '',
      };
    });
    setItemReturns(next);
  };

  const handleSubmitReturn = () => {
    if (calculatedItems.length === 0) {
      alert('يرجى تحديد كمية مرتجعة (كراتين أو قطع) لصنف واحد على الأقل قبل التأكيد.');
      return;
    }

    if (!returnReason.trim()) {
      alert('يرجى كتابة أو اختيار سبب المرتجع.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = processOrderReturn(
        invoice.id,
        calculatedItems,
        returnReason,
        restockToInventory
      );

      if (result.success) {
        if (onSuccess) {
          onSuccess(result.message, result.returnRecord);
        }
        onClose();
      } else {
        alert(result.message || 'حدث خطأ أثناء تسجيل المرتجع');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  تسجيل إذن مرتجع مبيعات (كلي / جزئي)
                </h2>
                <span className="text-[11px] bg-amber-500/20 text-amber-300 font-mono font-black px-2 py-0.5 rounded-lg border border-amber-500/30">
                  {invoice.invoiceNumber}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  invoice.status === 'إغلاق الطلبية'
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : invoice.status === 'تم التسليم'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}>
                  الحالة: {invoice.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1 font-bold text-amber-300">
                  <User className="w-3.5 h-3.5" />
                  {invoice.customerName}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Store className="w-3.5 h-3.5" />
                  {invoice.branchName}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  {invoice.date}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          
          {/* Mode Selector & Quick Actions */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">نوع المرتجع المطلوب:</span>
              <div className="flex bg-slate-200 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setReturnMode('partial');
                    handleResetToZero();
                  }}
                  className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer ${
                    returnMode === 'partial'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📦 مرتجع جزئي (أصناف وكميات محددة)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReturnMode('full');
                    handleSelectAllRemaining();
                  }}
                  className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer ${
                    returnMode === 'full'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔄 مرتجع كلي (كامل الفاتورة)
                </button>
              </div>
            </div>

            {returnMode === 'partial' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllRemaining}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                >
                  تحديد الكل كمرتجع
                </button>
                <button
                  type="button"
                  onClick={handleResetToZero}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer"
                >
                  تصفير الكميات
                </button>
              </div>
            )}
          </div>

          {/* Previous Returns Alert if exists */}
          {invoice.returnRecords && invoice.returnRecords.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 text-purple-950">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  <RotateCcw className="w-4 h-4 text-purple-700" />
                  <span>
                    هذه الطلبية مسجل عليها مسبقاً {invoice.returnRecords.length} إذن مرتجع بقيمة{' '}
                    <strong>{formatCurrency(prevTotalRefunded)}</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-purple-700 hover:text-purple-900 font-black text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <span>{showHistory ? 'إخفاء الأذونات السابقة' : 'عرض تفاصيل الأذونات السابقة'}</span>
                  {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showHistory && (
                <div className="mt-3 pt-3 border-t border-purple-200 space-y-2">
                  {invoice.returnRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-white/80 p-2.5 rounded-xl border border-purple-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="font-mono font-bold text-purple-900">
                          إذن #{rec.returnVoucherNumber} • {rec.date} {rec.time}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          بواسطة: {rec.handledBy} • السبب: {rec.reason}
                        </div>
                      </div>
                      <div className="font-black text-purple-900 bg-purple-100 px-2.5 py-1 rounded-lg">
                        {formatCurrency(rec.totalRefundAmount)} ({rec.totalReturnedCartons} كرتونة)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Interactive Itemized Return Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="bg-slate-100 px-4 py-2.5 font-black text-slate-800 flex items-center justify-between border-b border-slate-200">
              <span className="flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-amber-600" />
                <span>أصناف الفاتورة وتحديد الكمية المرتجعة:</span>
              </span>
              <span className="text-[11px] text-slate-500 font-normal">
                حدد عدد الكراتين والقطع التي يريد العميل إرجاعها
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                    <th className="p-2.5">الصنف</th>
                    <th className="p-2.5 text-center">الكمية الأصلية</th>
                    <th className="p-2.5 text-center">مرتجع سابق</th>
                    <th className="p-2.5 text-center">المتبقي الصافي</th>
                    <th className="p-2.5 text-center bg-amber-50/50 text-amber-950">الكراتين المرتجعة</th>
                    <th className="p-2.5 text-center bg-amber-50/50 text-amber-950">القطع المرتجعة</th>
                    <th className="p-2.5 text-center">حالة البضاعة</th>
                    <th className="p-2.5 text-left">قيمة المرتجع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoice.items.map((item) => {
                    const prev = previouslyReturnedMap[item.productId] || { cartons: 0, pieces: 0 };
                    const remainingCartons = Math.max(0, item.cartonCount - prev.cartons);
                    const remainingPieces = Math.max(0, (item.pieceCount || 0) - prev.pieces);
                    const currentReturn = itemReturns[item.productId] || {
                      returnCartons: 0,
                      returnPieces: 0,
                      condition: 'good_condition',
                      reason: '',
                    };

                    const isFullyReturnedPreviously = remainingCartons === 0 && remainingPieces === 0;
                    const pricePerCarton = item.pricePerCarton || item.appliedPrice || 0;
                    const pricePerPiece = item.pricePerPiece || (item.cartonQuantity > 0 ? pricePerCarton / item.cartonQuantity : 0);
                    const itemRefundAmount =
                      currentReturn.returnCartons * pricePerCarton + currentReturn.returnPieces * pricePerPiece;

                    const isBeingReturned = currentReturn.returnCartons > 0 || currentReturn.returnPieces > 0;

                    return (
                      <tr
                        key={item.productId}
                        className={`transition ${
                          isBeingReturned
                            ? 'bg-amber-50/40 font-bold text-slate-900'
                            : isFullyReturnedPreviously
                            ? 'bg-slate-50 opacity-60'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        {/* Product Info */}
                        <td className="p-2.5 min-w-[170px]">
                          <div className="font-black text-slate-900">{item.productName}</div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                            <span>كود: {item.productCode}</span>
                            <span>•</span>
                            <span>شدة: {item.cartonQuantity} ق/ك</span>
                            <span>•</span>
                            <span>سعر: {formatCurrency(pricePerCarton)}</span>
                          </div>
                        </td>

                        {/* Original Quantity */}
                        <td className="p-2.5 text-center">
                          <span className="font-bold">
                            {item.cartonCount} ك
                            {item.pieceCount ? ` + ${item.pieceCount} ق` : ''}
                          </span>
                        </td>

                        {/* Previously Returned */}
                        <td className="p-2.5 text-center">
                          {prev.cartons > 0 || prev.pieces > 0 ? (
                            <span className="bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {prev.cartons} ك {prev.pieces ? `+ ${prev.pieces} ق` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Remaining Net */}
                        <td className="p-2.5 text-center font-bold text-slate-700">
                          {remainingCartons} ك
                          {remainingPieces ? ` + ${remainingPieces} ق` : ''}
                        </td>

                        {/* Cartons Input */}
                        <td className="p-2 text-center bg-amber-50/30">
                          <input
                            type="number"
                            min={0}
                            max={remainingCartons}
                            disabled={isFullyReturnedPreviously}
                            value={currentReturn.returnCartons || 0}
                            onChange={(e) =>
                              handleCartonCountChange(
                                item.productId,
                                parseInt(e.target.value) || 0,
                                remainingCartons
                              )
                            }
                            className={`w-16 p-1.5 border rounded-lg text-center font-black text-xs focus:ring-2 focus:ring-amber-500 ${
                              currentReturn.returnCartons > 0
                                ? 'bg-amber-100 border-amber-400 text-slate-950 font-black'
                                : 'bg-white border-slate-300 text-slate-700'
                            }`}
                          />
                        </td>

                        {/* Pieces Input */}
                        <td className="p-2 text-center bg-amber-50/30">
                          <input
                            type="number"
                            min={0}
                            max={remainingPieces || item.cartonQuantity}
                            disabled={isFullyReturnedPreviously}
                            value={currentReturn.returnPieces || 0}
                            onChange={(e) =>
                              handlePieceCountChange(
                                item.productId,
                                parseInt(e.target.value) || 0,
                                remainingPieces || item.cartonQuantity
                              )
                            }
                            className={`w-16 p-1.5 border rounded-lg text-center font-black text-xs focus:ring-2 focus:ring-amber-500 ${
                              currentReturn.returnPieces > 0
                                ? 'bg-amber-100 border-amber-400 text-slate-950 font-black'
                                : 'bg-white border-slate-300 text-slate-700'
                            }`}
                          />
                        </td>

                        {/* Condition Selector */}
                        <td className="p-2 text-center">
                          <select
                            disabled={!isBeingReturned}
                            value={currentReturn.condition}
                            onChange={(e) =>
                              handleConditionChange(
                                item.productId,
                                e.target.value as 'good_condition' | 'damaged' | 'expired'
                              )
                            }
                            className={`p-1.5 rounded-lg border text-[11px] font-bold focus:outline-hidden ${
                              currentReturn.condition === 'good_condition'
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                : currentReturn.condition === 'damaged'
                                ? 'bg-rose-50 text-rose-900 border-rose-300'
                                : 'bg-amber-50 text-amber-900 border-amber-300'
                            }`}
                          >
                            <option value="good_condition">🔄 سليم (يعود للمخزن)</option>
                            <option value="damaged">⚠️ تالف (لا يعاد للمخزن)</option>
                            <option value="expired">⛔ منتهي الصلاحية</option>
                          </select>
                        </td>

                        {/* Item Refund Subtotal */}
                        <td className="p-2.5 text-left font-black text-slate-900 font-mono">
                          {itemRefundAmount > 0 ? (
                            <span className="text-amber-900 bg-amber-100 px-2 py-1 rounded-md">
                              {formatCurrency(itemRefundAmount)}
                            </span>
                          ) : (
                            <span className="text-slate-400">0.00</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial & Inventory Impact Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-slate-100 border border-slate-200 p-3 rounded-2xl">
              <div className="text-[11px] text-slate-500 font-bold">إجمالي الفاتورة الأصلية</div>
              <div className="text-base font-black text-slate-900 mt-0.5">
                {formatCurrency(invoice.estimatedGrandTotal)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-300 p-3 rounded-2xl">
              <div className="text-[11px] text-amber-900 font-bold flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>المبلغ المرتجع للعميل الآن</span>
              </div>
              <div className="text-base font-black text-amber-950 mt-0.5">
                {formatCurrency(totalRefundAmount)}
              </div>
              <div className="text-[10px] text-amber-800 mt-0.5 font-bold">
                يخصم فوراً من مديونية وحساب العميل
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-2xl">
              <div className="text-[11px] text-emerald-900 font-bold flex items-center gap-1">
                <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                <span>الكمية المسترجعة للمخزن</span>
              </div>
              <div className="text-base font-black text-emerald-950 mt-0.5">
                +{totalReturnedCartons} كرتونة
              </div>
              <div className="text-[10px] text-emerald-800 mt-0.5 font-bold">
                +{totalReturnedPieces} قطعة تعود لرصيد البيع
              </div>
            </div>

            <div className="bg-slate-900 text-white p-3 rounded-2xl">
              <div className="text-[11px] text-slate-400 font-bold">صافي قيمة الفاتورة المتبقية</div>
              <div className="text-base font-black text-amber-300 mt-0.5">
                {formatCurrency(netEstimatedTotalAfterThisReturn)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {netEstimatedTotalAfterThisReturn === 0 ? 'مرتجع كلي بالكامل' : 'مرتجع جزئي مستمر'}
              </div>
            </div>
          </div>

          {/* Reason & Automatic Warehouse Restock Setting */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div>
              <label className="block font-bold text-slate-800 mb-1.5">
                سبب المرتجع:
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  'مرتجع بطلب العميل واسترجاع البضاعة للمخزن',
                  'رفض الاستلام عند التوصيل',
                  'تلف أو عيب في بعض الكراتين',
                  'خطأ في تسجيل الطلبية أو الكميات',
                  'استبدال أصناف بطلب الإدارة أو العميل',
                  'تأخر في موعد التسليم المطلوب',
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => setReturnReason(reasonText)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                      returnReason === reasonText
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="اكتب سبب المرتجع بالتفصيل..."
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Restock Checkbox */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
              <input
                type="checkbox"
                id="restockCheckbox"
                checked={restockToInventory}
                onChange={(e) => setRestockToInventory(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="restockCheckbox" className="font-bold text-slate-800 cursor-pointer">
                إعادة البضاعة السليمة فوراً إلى رصيد المخزن الفعلي للفرع وتحديث بطاقة الصنف 🔄
              </label>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-1.5 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              سيتم إنشاء إذن مرتجع رسمي وخصم {formatCurrency(totalRefundAmount)} من حساب العميل فوراً.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isSubmitting || calculatedItems.length === 0}
              onClick={handleSubmitReturn}
              className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'جاري الحفظ والخصم...'
                  : `تأكيد إذن المرتجع (${formatCurrency(totalRefundAmount)})`}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
