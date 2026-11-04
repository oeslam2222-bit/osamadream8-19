import React from 'react';
import { Loader2, Mail, CreditCard, RefreshCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { calculateOutstandingBalance, getPaymentStatusText, formatCurrency } from '../services/invoiceService';
import { supabase } from '../services/supabaseService';

export interface PaymentCollectionCardProps {
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
}

export function PaymentCollectionCard({ invoiceNumber, customerName, customerPhone, totalAmount }: PaymentCollectionCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [outstanding, setOutstanding] = useState(0)
  const [payments, setPayments] = useState<any[]>([])
  const [isSending, setIsSending] = useState(false)

  // Load payments for this invoice
  useEffect(() => {
    const loadPayments = async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .eq('invoiceNumber', invoiceNumber)
          .order('date', { ascending: false })
        if (error) throw error
        setPayments(data || [])
        setOutstanding(calculateOutstandingBalance({
          invoiceNumber,
          estimatedGrandTotal: totalAmount,
          items: [],
        } as any, data || []))
      } catch (err) {
        console.error('Failed to load payments', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadPayments()
  }, [invoiceNumber, totalAmount])

  const generateWhatsAppMessage = () => {
    const outstandingText = getPaymentStatusText(outstanding, totalAmount)
    const message = `مرحبا ${customerName},

أنا ${customerName === 'العميل' ? 'مندوب المبيعات' : customerName}، regarding invoice #${invoiceNumber}.

📋 تفاصيل الفاتورة:
• الإجمالي: ${formatCurrency(totalAmount)}
•已付: ${formatCurrency(totalAmount - outstanding)}
• المتبقي: ${outstanding > 0 ? formatCurrency(outstanding) : '0'}
• طريقة الدفع: ${payments.length > 0 ? 'كاش/أونلاين' : 'كاش'}

${outstanding > 0 ? 'رجاءً إتمام الدفع لإكمال اعتماد الفاتورة.' : 'شكرك على الدفع السريع!'}

🔗 للدفع: ${window.location.origin}/payment/${invoiceNumber}

مع أطيب التحيات,
طاقم شركة ${customerName === 'العميل' ? 'ددمة' : customerName} للتجارة`;

    const whatsappUrl = `https://wa.me/20123456789?text=${encodeURIComponent(message)}`
    return whatsappUrl;
  }

  const handleShare = () => {
    setIsSending(true)
    const whatsappUrl = generateWhatsAppMessage()
    window.open(whatsappUrl, '_blank')
    setIsSending(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center"
      >
        <div className="inline-block h-10 w-10 border-4 border-amber-300 rounded-full border-t-transparent animate-spin mb-3"></div>
        <p className="text-slate-600 font-medium text-sm">جاري تحميل بيانات الدفع...</p>
      </div>
    )
  }

  return (
    <div className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl p-6 shadow-lg max-w-md mx-auto"
    >
      <div className="flex items-center justify-between mb-4"
      >
        <div>
          <h3 className="font-black text-slate-900 text-sm">💳 بطاقة تحصيل الفاتورة</h3>
          <p className="text-sm text-slate-500">فاتورة رقم: {invoiceNumber}</p>
        </div>
        <span className="text-amber-500 font-bold text-sm">${formatCurrency(totalAmount)}</span>
      </div>
      {outstanding > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 mb-4"
        >
          <p className="text-red-600 font-medium text-sm">المبلغ المتبقي للسداد: {formatCurrency(outstanding)}</p>
          <p className="text-red-500 text-sm">${getPaymentStatusText(outstanding, totalAmount)}</p>
        </div>
      )}
      {outstanding === 0 && (
        <div className="bg-green-50 border-l-4 border-green-500 rounded-xl p-4 mb-4"
        >
          <p className="text-green-600 font-medium text-sm">✅ الفاتورة مدفوعة بالكامل</p>
          <p className="text-green-500 text-sm">تم اعتماد الفاتورة</p>
        </div>
      )}
      <div className="mt-4"
      >
        <button
          onClick={handleShare}
          disabled={isSending}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3 rounded-lg text-lg transition shadow-lg active:scale-95"
        >
          {isSending ? ('جاري الإرسال...') : ('إرسال عبر الواتساب')}
        </button>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-200"
      >
        <p className="text-xs text-slate-500">إجمالي المدفوعات: {payments.length}</p>
        {payments.length > 0 && (
          <div className="mt-2 space-y-1"
          >
            {payments.slice(0, 3).map((payment, index) => (
              <div key={index} className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-500">{payment.date || 'غير محدد'}</span>
                <span className="text-amber-600">{formatCurrency(payment.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
