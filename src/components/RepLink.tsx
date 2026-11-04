import React from 'react';
import { Loader2, Link, Mail, RefreshCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { generateRepLink, RepLink } from '../services/invoiceService';
import { supabase } from '../services/supabaseService';

export interface RepLinkProps {
  repId: string;
  repName: string;
}

export function RepLinkComponent({ repId, repName }: RepLinkProps) {
  const [link, setLink] = useState<string>('')
  const [repLinkData, setRepLinkData] = useState<RepLink | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [usageCount, setUsageCount] = useState(0)
  const [lastUsed, setLastUsed] = useState<Date | null>(null)

  useEffect(() => {
    const loadLink = async () => {
      setIsGenerating(true)
      try {
        const newLink = generateRepLink(repId)
        setLink(newLink.uniqueLink)
        setRepLinkData(newLink)
        // In real app, save to database
        setUsageCount(0)
        setLastUsed(null)
      } catch (err) {
        console.error('Failed to generate link', err)
      } finally {
        setIsGenerating(false)
      }
    }
    loadLink()
  }, [repId])

  const handleShareToWhatsApp = () => {
    if (!link) return
    const message = `مرحبا عميلنا الكريم، هذا رابط للفاتورة الخاصة بك:
${link}
يمكنك الدخول واختيار المنتجات المطلوبة.`
    const whatsappUrl = `https://wa.me/20123456789?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  return (
    <div className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl p-6 shadow-lg max-w-md mx-auto"
    >
      <div className="flex items-center justify-between mb-4"
      >
        <div className="w-12 h-12 rounded-lg bg-amber-600 flex items-center justify-center text-white font-black text-sm">
          {repName.charAt(0)}
        </div>
        <h3 className="font-black text-slate-900 text-sm">{repName}</h3>
      </div>
      {repLinkData ? (
        <div className="bg-slate-50 rounded-xl p-4 mb-4"
        >
          <div className="flex items-center gap-2 mb-2"
          >
            <Link className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-slate-600">رابط مميز:</span>
          </div>
          <input
            type="text"
            value={link}
            readOnly
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            readonly
          />
          <button
            onClick={handleShareToWhatsApp}
            className="mt-2 w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-2 rounded-lg text-sm transition shadow-lg active:scale-95"
          >
شاركة عبر الواتساب
          </button>
        </div>
      ) : (
        <div className="py-8 text-center"
        >
          {isGenerating && (
            <div className="inline-block h-6 w-6 border-4 border-amber-300 rounded-full border-t-transparent animate-spin mb-3"></div>
          )}
          <p className="text-slate-500 text-sm">اضغط generar link لإنشاء رابط مميز</p>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-slate-200"
      >
        <p className="text-xs text-slate-500">إحصائيات الرابط:</p>
        <div className="flex gap-4 pt-2"
        >
          <div>
            <p className="text-amber-500 font-small">عدد الاستخدامات</p>
            <p className="text-slate-600 font-medium">{usageCount}</p>
          </div>
          <div>
            <p className="text-amber-500 font-small">آخر استخدام</p>
            <p className="text-slate-600 font-medium">{lastUsed ? lastUsed.toLocaleDateString() : 'لا يوجد'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
