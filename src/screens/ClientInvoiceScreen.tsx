import React from 'react';
import { useState, useEffect } from 'react';
import { supabase } from './services/supabaseService';

const ClientInvoiceScreen = ({ customerCode, customerName }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [products, setProducts] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('customerCode', customerCode)
          .eq('isActive', true)
        if (error) throw error
        setProducts(data || [])
      } catch (err) {
        setError('Failed to load products')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }
    loadProducts()
  }, [customerCode])

  const handleAdd = (product) => {
    const existing = selectedItems.find(item => item.productCode === product.productCode)
    if (existing) {
      setSelectedItems(selectedItems.map(item =>
        item.productCode === product.productCode
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setSelectedItems([...selectedItems, { ...product, quantity: 1 }])
    }
    calculateTotal()
  }

  const handleRemove = (productCode) => {
    setSelectedItems(selectedItems.filter(item => item.productCode !== productCode))
    calculateTotal()
  }

  const calculateTotal = () => {
    const sum = selectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0)
    setTotal(sum)
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const newInvoice = {
        invoiceNumber: 'CLT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        date: new Date().toLocaleDateString('en-EG'),
        time: new Date().toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' }),
        branchName: 'القاهرة',
        repName: 'مندوب المبيعات',
        items: selectedItems,
        customerName: customerName,
        customerCode: customerCode,
        customerPhone: '',
        customerAddress: '',
        subtotal: total,
        discountAmount: 0,
        discountPercentage: 0,
        estimatedGrandTotal: total,
        paymentMethod: 'كاش',
        status: 'pending',
      }
      const { error } = await supabase.from('invoices').insert([newInvoice])
      if (error) throw error
      alert('تم إنشائية الفاتورة بنجاح!')
      setIsLoading(false)
    } catch (err) {
      console.error(err)
      setError('حدث خطأ')
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center"
      >
        <div className="inline-block h-10 w-10 border-4 border-amber-300 rounded-full border-t-transparent animate-spin mb-3"></div>
        <p className="text-slate-600 font-medium text-sm">جاري تحميل منتجات العميل...</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-6 text-center"
      >
        <p className="text-red-600 font-medium text-sm">{error}</p>
        <button onClick={() => window.history.back()} className="mt-4 bg-amber-500 hover:bg-amber-600 text-white font-black px-6 py-3 rounded-xl transition">عودة</button>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-slate-50"
      >
      <header className="bg-white border-b border-slate-200 px-4 py-3"
        >
        <div className="flex items-center justify-between"
          >
          <div className="flex items-center gap-2"
            >
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white font-black text-sm">C</div>
            <span className="font-arabic-display font-bold text-sm text-slate-900">فاتورة العميل</span>
          </div>
          <button onClick={() => window.history.back()} className="text-slate-400 hover:text-slate-600 p-2 rounded"
          >← العودة</button>
        </div>
        </header>
      <main className="p-4 sm:p-6 max-w-2xl mx-auto"
        >
        {products.length === 0 && !isLoading && !error && (<div className="text-center py-12 text-slate-500"><p>لا توجد منتجات متاحة لهذا العميل</p></div>)
        )
        {isLoading && products.length === 0 && (<div className="text-center py-12"><div className="inline-block h-10 w-10 border-4 border-amber-300 rounded-full border-t-transparent animate-spin mb-3"></div><p className="text-slate-600 font-medium text-sm">جاري تحميل المنتجات المتاحة...</p></div>)
        }
        <div className="space-y-4"
          >
          {products.map((product) => {
            const isSelected = selectedItems.some(item => item.productCode === product.productCode)
            return (
              <div key={product.productCode} className="border rounded-xl p-3 hover:border-amber-500 transition" style={{ borderColor: isSelected ? 'amber-500' : 'transparent' }}>
                <div className="flex items-center justify-between"
                  >
                  <div className="flex items-center gap-3"
                    >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-black" style={{ backgroundColor: isSelected ? 'amber-100' : 'slate-100' }}>
                      {product.productCode?.charAt(0) || '-'}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 truncate" style={{ maxWidth: '150px' }}>{product.productName}</h4>
                      <p className="text-xs text-slate-500">كود: {product.productCode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2"
                    >
                    <span className="text-sm font-black {isSelected ? 'text-amber-600' : 'text-slate-500'}">{isSelected ? '已选' : 'اضغط لإضافة'}</span>
                    {isSelected && (<button onClick={() => handleRemove(product.productCode)} className="text-xs text-amber-400 hover:text-amber-500">الغاء</button>)}
                  </div>
                </div>
                <div className="mt-2"
                  >
                  <label className="block text-xs text-slate-500 mb-1">الكمية:</label>
                  <div className="flex items-center gap-2"
                    >
                    <button onClick={() => handleAdd(product)} className="w-8 h-8 rounded-lg bg-amber-600 text-white font-black text-sm flex items-center justify-center">+</button>
                    <span className="w-10 text-center font-black {isSelected ? 'text-amber-600' : 'text-slate-500'}">{isSelected ? selectedItems.find(i => i.productCode === product.productCode)?.quantity || 0 : 0}</span>
                    <button onClick={() => handleRemove(product.productCode)} className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 text-sm flex items-center justify-center">-</button>
                  </div>
                </div>
              </div>
            )
          })}
        }
        {selectedItems.length > 0 && !isLoading && (<div className="pt-4 border-t border-slate-200" style={{ borderColor: 'amber-200' }}>
          <div className="flex justify-between items-center mb-2"><span className="text-amber-600 font-black text-lg">إجمالي الفرعية: {formatCurrency(total)}</span><span className="text-sm text-slate-500">عدد الأصناف: {selectedItems.length}</span></div>
          <div className="mt-3 p-3 bg-amber-50 rounded-xl" style={{ borderColor: 'amber-200' }}>
            <p className="text-amber-600 font-medium">المجموع النهائي: {formatCurrency(total)}</p>
            <button onClick={handleSubmit} disabled={isLoading} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3 rounded-xl mt-2 transition shadow-lg active:scale-95">إنشائية الفاتورة وإرسال للعميل</button>
          </div>
        </div>)
        {selectedItems.length === 0 && !isLoading && (<div className="pt-8 text-center text-slate-500"><p>حددProducts لرفع طلب الفاتورة</p><p className="mt-2 text-amber-500">يمكنك اختيارProducts من الكتالوج المتاح</p></div>)
        )
      </main>
    </div>
  )
  }
}

export default ClientInvoiceScreen
