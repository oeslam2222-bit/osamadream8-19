import React, { useMemo, useState, useRef } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Download,
  Edit2,
  FileSpreadsheet,
  Filter,
  Flame,
  Layers,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product, PromotionOffer } from '../types';
import {
  getSavedPromotions,
  savePromotions,
  parsePromotionsFromExcelBuffer,
  applyPromotionsToProducts,
  exportPromotionsToExcel,
} from '../services/promotionService';
import { formatCurrency } from '../services/invoiceService';
import { cleanProductCode } from '../services/excelService';
import { ProductImage } from './ProductImage';

export const PromotionsOffersView: React.FC = () => {
  const { products, updateProduct, cloudinaryConfig, currentUser, branches } = useApp();

  const [promotions, setPromotions] = useState<PromotionOffer[]>(() => getSavedPromotions());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');

  // Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromotionOffer | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeOffersTab, setActiveOffersTab] = useState<'promotions' | 'announcements'>('promotions');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  // New Announcement Modal State
  const [showAddAnnouncementModal, setShowAddAnnouncementModal] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    priority: 'عاجل' as 'عاجل' | 'هام' | 'عادي'
  });

  const [announcements, setAnnouncements] = useState<Array<{
    id: string;
    title: string;
    content: string;
    author: string;
    role: string;
    date: string;
    priority: 'عاجل' | 'هام' | 'عادي';
  }>>(() => {
    try {
      const saved = localStorage.getItem('tantawy_announcements_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'ann-1',
        title: '📢 تعميم هام: عروض الأسبوع وتطبيق الخصومات الفورية',
        content: 'تم تفعيل خصومات وعروض ترويجية تصل إلى 20% على أصناف البسكويت والويفر، يرجى من جميع المناديب تطبيق العروض لعملائهم لتحقيق التارجت.',
        author: 'الإدارة العامة',
        role: 'admin',
        date: new Date().toISOString().slice(0, 10),
        priority: 'عاجل'
      },
      {
        id: 'ann-2',
        title: '📦 تنبيه: مسحوبات ونواقص مخزن 6 أكتوبر المركزي',
        content: 'أصناف العجز المطلوبة في الفواتير أصبحت متاحة للسحب المباشر من صفحة المخزون وتوريدها للفرع بضغطة زر واحدة.',
        author: 'إدارة المخازن واللوجستيات',
        role: 'branch_manager',
        date: new Date().toISOString().slice(0, 10),
        priority: 'هام'
      }
    ];
  });

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State for Manual Add / Edit
  const [formData, setFormData] = useState<Partial<PromotionOffer>>({
    title: '',
    productCode: '',
    unifiedCode: '',
    productName: '',
    discountPercentage: 10,
    promoPrice: undefined,
    originalPrice: undefined,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    branchName: 'كل الفروع',
    status: 'نشط',
    notes: '',
  });

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Filtered promotions list
  const filteredPromotions = useMemo(() => {
    return promotions.filter((p) => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const codeMatch = p.productCode.toLowerCase().includes(q);
        const unifiedMatch = p.unifiedCode?.toLowerCase().includes(q);
        const nameMatch = p.productName.toLowerCase().includes(q);
        const titleMatch = p.title.toLowerCase().includes(q);
        const branchMatch = p.branchName?.toLowerCase().includes(q);
        if (!codeMatch && !unifiedMatch && !nameMatch && !titleMatch && !branchMatch) return false;
      }

      if (selectedBranchFilter !== 'الكل' && p.branchName !== 'كل الفروع' && p.branchName !== selectedBranchFilter) {
        return false;
      }

      if (statusFilter === 'active' && p.status !== 'نشط') return false;
      if (statusFilter === 'expired' && p.status !== 'منتهي') return false;

      return true;
    });
  }, [promotions, searchTerm, selectedBranchFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const active = promotions.filter((p) => p.status === 'نشط');
    const avgDiscount = active.length > 0
      ? Math.round(active.reduce((acc, p) => acc + (p.discountPercentage || 0), 0) / active.length)
      : 0;
    return {
      total: promotions.length,
      active: active.length,
      avgDiscount,
    };
  }, [promotions]);

  // Handle Excel Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parsePromotionsFromExcelBuffer(buffer);

      // Merge with existing promotions avoiding duplicates
      const updatedList = [...promotions];
      result.promotions.forEach((newP) => {
        const existingIdx = updatedList.findIndex(
          (p) => (p.productCode && p.productCode === newP.productCode) ||
                 (p.unifiedCode && newP.unifiedCode && p.unifiedCode === newP.unifiedCode)
        );
        if (existingIdx >= 0) {
          updatedList[existingIdx] = { ...updatedList[existingIdx], ...newP };
        } else {
          updatedList.unshift(newP);
        }
      });

      setPromotions(updatedList);
      savePromotions(updatedList);

      // Automatically apply discounts to products in memory and AppContext
      const { updatedProducts, updatedCount } = applyPromotionsToProducts(products, updatedList);
      updatedProducts.forEach((p) => {
        if (p.promoPrice || p.offerPrice) {
          updateProduct(p);
        }
      });

      showToast(`تم استيراد ${result.matchedCount} عرض بنجاح، وتطبيق الخصومات الترويجية على ${updatedCount} صنف في الكتالوج ونظام الفواتير! 🎉`);
      setIsUploadModalOpen(false);
    } catch (err: any) {
      alert(`خطأ أثناء قراءة شيت العروض: ${err?.message || ''}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Google Sheet URL Fetch
  const handleFetchGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      alert('يرجى إدخال رابط شيت جوجل (Google Sheets URL)');
      return;
    }
    setIsFetchingSheet(true);
    try {
      let fetchUrl = googleSheetUrl.trim();
      const match = fetchUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error('تعذر تحميل البيانات من الرابط المحدد. تأكد من ضبط إذن الوصول للشيت إلى (أي شخص لديه الرابط).');
      const buffer = await response.arrayBuffer();
      const result = await parsePromotionsFromExcelBuffer(buffer);

      const updatedList = [...promotions];
      result.promotions.forEach((newP) => {
        const existingIdx = updatedList.findIndex(
          (p) => (p.productCode && p.productCode === newP.productCode) ||
                 (p.unifiedCode && newP.unifiedCode && p.unifiedCode === newP.unifiedCode)
        );
        if (existingIdx >= 0) {
          updatedList[existingIdx] = { ...updatedList[existingIdx], ...newP };
        } else {
          updatedList.unshift(newP);
        }
      });

      setPromotions(updatedList);
      savePromotions(updatedList);
      const { updatedProducts, updatedCount } = applyPromotionsToProducts(products, updatedList);
      updatedProducts.forEach((p) => {
        if (p.promoPrice || p.offerPrice) {
          updateProduct(p);
        }
      });
      showToast(`تم بنجاح جلب ${result.matchedCount} عرض من شيت جوجل وتطبيق الخصم على ${updatedCount} صنف في الكتالوج والفواتير! ⚡`);
      setIsUploadModalOpen(false);
      setGoogleSheetUrl('');
    } catch (err: any) {
      alert(`خطأ أثناء جلب شيت جوجل: ${err?.message || ''}`);
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleSaveAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) return;
    const newAnn = {
      id: `ann-${Date.now()}`,
      title: announcementForm.title.trim(),
      content: announcementForm.content.trim(),
      priority: announcementForm.priority,
      author: currentUser?.name || 'الإدارة',
      role: currentUser?.role || 'admin',
      date: new Date().toISOString().slice(0, 10),
    };
    const next = [newAnn, ...announcements];
    setAnnouncements(next);
    try { localStorage.setItem('tantawy_announcements_v1', JSON.stringify(next)); } catch {}
    setShowAddAnnouncementModal(false);
    setAnnouncementForm({ title: '', content: '', priority: 'عاجل' });
    showToast('تم نشر التعميم والإشعار الإداري لجميع مناديب وفروع الشركة بنجاح 📢');
  };

  const handleDeleteAnnouncement = (id: string) => {
    const next = announcements.filter((a) => a.id !== id);
    setAnnouncements(next);
    try { localStorage.setItem('tantawy_announcements_v1', JSON.stringify(next)); } catch {}
    showToast('تم حذف التعميم الإداري.');
  };

  // Re-apply discounts to catalog
  const handleApplyDiscountsToCatalog = () => {
    const { updatedProducts, updatedCount } = applyPromotionsToProducts(products, promotions);
    // Trigger update for each matched product
    updatedProducts.forEach((p) => {
      if (p.status === 'عرض ترويجي') {
        updateProduct({
          ...p,
          promoPrice: p.promoPrice,
          promoPiecePrice: p.promoPiecePrice,
          offerPrice: p.promoPrice,
          discountPercent: p.discountPercent,
          discountPercentage: p.discountPercent,
          status: 'عرض ترويجي',
          salesPriority: 'مرتفع',
        });
      }
    });

    showToast(`تم بنجاح تحديث وتفعيل الخصومات الترويجية على ${updatedCount} صنف بالكتالوج ونظام الفواتير! ⚡`);
  };

  // Handle Save Manual Offer
  const handleSaveOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || (!formData.productCode && !formData.productName)) {
      alert('يرجى كتابة عنوان العرض وكود الصنف أو اسمه.');
      return;
    }

    const matchedProduct = products.find(
      (p) => cleanProductCode(p.code) === cleanProductCode(formData.productCode) ||
             (p.unifiedCode && formData.unifiedCode && p.unifiedCode.replace(/^#/, '') === formData.unifiedCode.replace(/^#/, '')) ||
             p.name.trim().toLowerCase() === (formData.productName || '').trim().toLowerCase()
    );

    const originalPrice = matchedProduct?.cartonPrice || formData.originalPrice || 200;
    const discount = Number(formData.discountPercentage) || 0;
    const promoPrice = formData.promoPrice || (discount > 0 ? Number((originalPrice * (1 - discount / 100)).toFixed(2)) : originalPrice);

    const newOffer: PromotionOffer = {
      id: editingPromo ? editingPromo.id : `promo-manual-${Date.now()}`,
      title: formData.title || '',
      productCode: formData.productCode || matchedProduct?.code || '---',
      unifiedCode: formData.unifiedCode || matchedProduct?.unifiedCode?.replace(/^#/, '') || undefined,
      productName: formData.productName || matchedProduct?.name || 'صنف غير محدد',
      category: matchedProduct?.category || formData.category,
      discountPercentage: discount,
      originalPrice,
      promoPrice,
      startDate: formData.startDate,
      endDate: formData.endDate,
      branchName: formData.branchName || 'كل الفروع',
      status: (formData.status as any) || 'نشط',
      notes: formData.notes,
      createdAt: editingPromo ? editingPromo.createdAt : new Date().toISOString(),
    };

    let updatedList: PromotionOffer[];
    if (editingPromo) {
      updatedList = promotions.map((p) => (p.id === editingPromo.id ? newOffer : p));
      showToast('تم تعديل العرض الترويجي بنجاح ✅');
    } else {
      updatedList = [newOffer, ...promotions];
      showToast('تمت إضافة العرض الترويجي الجديد بنجاح 🎉');
    }

    setPromotions(updatedList);
    savePromotions(updatedList);

    // Apply to product if matched
    if (matchedProduct) {
      updateProduct({
        ...matchedProduct,
        promoPrice,
        discountPercent: discount,
        discountPercentage: discount,
        status: 'عرض ترويجي',
      });
    }

    setIsEditModalOpen(false);
    setEditingPromo(null);
  };

  // Clear all offers
  const handleClearAllOffers = () => {
    if (!window.confirm('هل أنت متأكد من مسح كافة العروض والخصومات المعتمدة وإرجاع أسعار الأصناف لحالتها الطبيعية؟')) return;
    setPromotions([]);
    savePromotions([]);
    const { updatedProducts, revertedCount } = applyPromotionsToProducts(products, []);
    const changed = updatedProducts.filter((p, i) => {
      const orig = products[i];
      return orig && (orig.promoPrice !== p.promoPrice || orig.status !== p.status || orig.offerPrice !== p.offerPrice);
    });
    changed.forEach((p) => updateProduct(p));
    showToast(`تم مسح كافة العروض بنجاح وإرجاع أسعار ${revertedCount} صنف لوضعها الطبيعي ✅`);
  };

  // Delete offer
  const handleDeleteOffer = (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العرض الترويجي وإلغاء الخصم عن الصنف؟')) return;
    const updated = promotions.filter((p) => p.id !== id);
    setPromotions(updated);
    savePromotions(updated);
    const { updatedProducts } = applyPromotionsToProducts(products, updated);
    const changed = updatedProducts.filter((p, i) => {
      const orig = products[i];
      return orig && (orig.promoPrice !== p.promoPrice || orig.status !== p.status || orig.offerPrice !== p.offerPrice);
    });
    changed.forEach((p) => updateProduct(p));
    showToast('تم حذف العرض الترويجي بنجاح وإرجاع سعر الصنف لوضعه الطبيعي.');
  };

  return (
    <div className="space-y-4 pb-16 animate-in fade-in duration-300">
      
      {/* Success Toast */}
      {successToast && (
        <div className="bg-[var(--app-ok)] text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs font-black animate-in fade-in sticky top-20 z-30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#0d9488]" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:text-[#0d9488]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Quick Action Bar */}
      <section className="bg-gradient-to-r from-slate-900 via-[var(--app-navy)] to-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--app-warn)] text-[#d97706] border border-[var(--app-warn)] flex items-center justify-center font-black shadow-inner shrink-0">
              <Flame className="w-6 h-6 text-[#d97706]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-white">
                  مركز العروض والخصومات الترويجية 🎁
                </h1>
                <span className="bg-[var(--app-warn)] text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {stats.active} عرض نشط 🔥
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                ربط العروض بشيتات Google Sheets والإكسل • تطبيق الخصومات تلقائياً بكود الصنف والكود الموحد (#) • إشعارات للعملاء والمناديب
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Clear All Offers Button */}
            {['admin', 'developer', 'branch_manager'].includes(currentUser?.role || '') && promotions.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllOffers}
                className="bg-[var(--app-risk)] hover:bg-[var(--app-risk)] text-white font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                title="مسح كافة العروض وإلغاء الخصومات عن كافة الأصناف"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح كافة العروض</span>
              </button>
            )}

            {/* Upload Excel */}
            {['admin', 'developer', 'branch_manager'].includes(currentUser?.role || '') && (
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer"
                title="رفع شيت عروض إكسل أو جوجل شيتس"
              >
                <Upload className="w-4 h-4" />
                <span>رفع شيت العروض 📊</span>
              </button>
            )}

            {/* Apply to Catalog */}
            <button
              type="button"
              onClick={handleApplyDiscountsToCatalog}
              className="bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-slate-950 font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer"
              title="تطبيق وتثبيت الخصومات على كافة المنتجات بالكتالوج ونظام الفواتير"
            >
              <Zap className="w-4 h-4" />
              <span>تطبيق الخصم للعملاء ⚡</span>
            </button>

            {/* Add Manual Offer */}
            {['admin', 'developer', 'branch_manager'].includes(currentUser?.role || '') && (
              <button
                type="button"
                onClick={() => {
                  setEditingPromo(null);
                  setFormData({
                    title: '',
                    productCode: '',
                    unifiedCode: '',
                    productName: '',
                    discountPercentage: 15,
                    startDate: new Date().toISOString().slice(0, 10),
                    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                    branchName: 'كل الفروع',
                    status: 'نشط',
                    notes: '',
                  });
                  setIsEditModalOpen(true);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-[#d97706] border border-[var(--app-warn)] font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#d97706]" />
                <span>إضافة عرض يدوي</span>
              </button>
            )}

            {/* Export Excel */}
            <button
              type="button"
              onClick={() => exportPromotionsToExcel(promotions)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="تصدير كشف العروض إكسل"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#0d9488]" />
              <span>تصدير إكسل</span>
            </button>
          </div>
        </div>
      </section>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
            <span>العروض النشطة:</span>
          </div>
          <div className="text-base sm:text-lg font-black text-[var(--app-warn-text)] font-mono">
            {stats.active} عرض ساري
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-[var(--app-risk-text)]" />
            <span>متوسط نسبة الخصم:</span>
          </div>
          <div className="text-base sm:text-lg font-black text-[var(--app-risk-text)] font-mono">
            %{stats.avgDiscount} تخفيض
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
            <Boxes className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
            <span>إجمالي الأصناف المشمولة:</span>
          </div>
          <div className="text-base sm:text-lg font-black text-[var(--app-navy-text)] font-mono">
            {promotions.length} صنف
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-[var(--app-ok-text)]" />
            <span>حالة التطبيق على الفاتورة:</span>
          </div>
          <div className="text-base sm:text-lg font-black text-[var(--app-ok-text)] flex items-center gap-1">
            <span>مفعل تلقائياً 🟢</span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث بكود الصنف، الكود الموحد (#)، أو اسم المنتج..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)]"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === 'all' ? 'bg-[var(--app-warn)] text-slate-950 font-black' : 'text-slate-600'
              }`}
            >
              الكل ({promotions.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                statusFilter === 'active' ? 'bg-[var(--app-ok)] text-white font-black' : 'text-slate-600'
              }`}
            >
              النشطة ({stats.active})
            </button>
          </div>

          {/* Branch filter */}
          <select
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value="الكل">🏢 كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Promotions Cards Grid */}
      {filteredPromotions.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-3">
          <Flame className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">لا توجد عروض مطابقة للبحث</h3>
          <p className="text-xs text-slate-400">
            يمكنك رفع شيت عروض جديد من Excel أو إضافة عرض يدوي بضغطة زر.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredPromotions.map((promo) => {
            const matchedProduct = products.find(
              (p) => cleanProductCode(p.code) === cleanProductCode(promo.productCode) ||
                     (p.unifiedCode && promo.unifiedCode && p.unifiedCode.replace(/^#/, '') === promo.unifiedCode.replace(/^#/, '')) ||
                     p.name.trim().toLowerCase() === promo.productName.trim().toLowerCase()
            );

            const cartonPrice = promo.originalPrice || matchedProduct?.cartonPrice || 200;
            const promoPrice = promo.promoPrice || (promo.discountPercentage > 0 ? Number((cartonPrice * (1 - promo.discountPercentage / 100)).toFixed(2)) : cartonPrice);

            return (
              <div
                key={promo.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-[var(--app-warn)] shadow-xs hover:shadow-md transition p-3.5 flex flex-col justify-between space-y-3 relative overflow-hidden"
              >
                {/* Promo Badge Corner */}
                <div className="absolute top-0 left-0 bg-gradient-to-r from-[var(--app-risk)] to-[var(--app-warn)] text-white font-black text-[11px] px-3 py-1 rounded-br-2xl shadow-sm flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  <span>خصم {promo.discountPercentage}%</span>
                </div>

                {/* Card Header: Product Info & Image */}
                <div className="flex items-start gap-3 pt-2">
                  {matchedProduct ? (
                    <ProductImage
                      product={matchedProduct}
                      cloudinaryConfig={cloudinaryConfig}
                      containerClassName="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 shrink-0"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border border-[var(--app-warn-line)] flex items-center justify-center font-black shrink-0 text-xl">
                      🎁
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="font-black text-slate-900 text-xs sm:text-sm line-clamp-2 leading-snug">
                      {promo.title}
                    </h3>
                    <div className="text-[11px] text-slate-600 font-bold truncate">
                      {promo.productName}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                      <span className="bg-slate-100 text-[var(--app-warn-text)] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-200">
                        كود: {promo.productCode}
                      </span>
                      {promo.unifiedCode && (
                        <span className="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] font-mono font-bold px-1.5 py-0.5 rounded border border-[var(--app-navy-line)]">
                          #{promo.unifiedCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pricing Box */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block line-through">
                      السعر الأصلي: {formatCurrency(cartonPrice)}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-[var(--app-risk-text)] font-mono">
                      سعر العرض: {formatCurrency(promoPrice)}
                    </span>
                  </div>
                  <div className="text-left text-[10px] text-slate-500 font-bold">
                    <span>الفرع: </span>
                    <strong className="text-slate-800">{promo.branchName}</strong>
                  </div>
                </div>

                {/* Validity Dates & Notes */}
                <div className="text-[10.5px] text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between">
                    <span>صالح من: <strong className="font-mono text-slate-700">{promo.startDate}</strong></span>
                    <span>إلى: <strong className="font-mono text-slate-700">{promo.endDate}</strong></span>
                  </div>
                  {promo.notes && (
                    <div className="text-slate-600 truncate text-[10px]">
                      💡 {promo.notes}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    promo.status === 'نشط' ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {promo.status === 'نشط' ? 'ساري ونشط 🟢' : 'منتهي الصلاحية'}
                  </span>

                  {['admin', 'developer', 'branch_manager'].includes(currentUser?.role || '') && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPromo(promo);
                          setFormData(promo);
                          setIsEditModalOpen(true);
                        }}
                        className="p-1 rounded-lg text-slate-500 hover:text-[var(--app-warn-text)] hover:bg-slate-100 transition cursor-pointer"
                        title="تعديل العرض"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOffer(promo.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-[var(--app-risk-text)] hover:bg-[var(--app-risk-tint)] transition cursor-pointer"
                        title="حذف العرض"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODAL: رفع شيت العروض ================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-lg p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[var(--app-ok-text)]" />
                <h3 className="font-black text-slate-900 text-sm sm:text-base">
                  رفع شيت عروض ترويجية من Excel أو Google Sheets
                </h3>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              يقوم النظام تلقائياً بالتعرف على أعمدة الشيت ومطابقة الأصناف عبر <strong>كود الصنف</strong> أو <strong>الكود الموحد (#)</strong> أو <strong>اسم المنتج</strong>، وتطبيق نسبة الخصم وسعر العرض على الكتالوج والفواتير فوراً.
            </p>

            <div className="border-2 border-dashed border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] rounded-2xl p-6 text-center space-y-3">
              <Upload className="w-8 h-8 text-[var(--app-ok-text)] mx-auto" />
              <div className="space-y-1">
                <div className="font-bold text-xs text-slate-800">اختر ملف إكسل (.xlsx أو .csv)</div>
                <div className="text-[11px] text-slate-500">الأعمدة الموصى بها: كود الصنف، الكود الموحد، نسبة الخصم، سعر العرض</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
                id="promo-file-input"
              />
              <label
                htmlFor="promo-file-input"
                className="inline-block bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-black px-4 py-2 rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                {isUploading ? 'جاري القراءة والمطابقة...' : 'استعراض واختيار الملف 📂'}
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: إضافة / تعديل عرض يدوي ================= */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-lg p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[var(--app-warn-text)]" />
                <h3 className="font-black text-slate-900 text-sm sm:text-base">
                  {editingPromo ? 'تعديل العرض الترويجي' : 'إضافة عرض ترويجي جديد'}
                </h3>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOffer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">عنوان العرض:</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="مثال: خصم 15% على كرتونة بسكويت شاي 🍪"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-[var(--app-warn)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود الصنف:</label>
                  <input
                    type="text"
                    value={formData.productCode}
                    onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                    placeholder="كود الصنف..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكود الموحد (#):</label>
                  <input
                    type="text"
                    value={formData.unifiedCode}
                    onChange={(e) => setFormData({ ...formData, unifiedCode: e.target.value })}
                    placeholder="#1001..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المنتج:</label>
                <input
                  type="text"
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  placeholder="اسم المنتج..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نسبة الخصم (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.discountPercentage}
                    onChange={(e) => setFormData({ ...formData, discountPercentage: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر العرض للكرتونة (ج.م):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.promoPrice || ''}
                    onChange={(e) => setFormData({ ...formData, promoPrice: Number(e.target.value) || undefined })}
                    placeholder="اتركه فارغاً للحساب من النسبة"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ البداية:</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ النهاية:</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وشروط العرض:</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="اكتب أي شروط أو تفاصيل إضافية..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-slate-950 font-black px-5 py-2 rounded-xl text-xs shadow-md"
                >
                  حفظ العرض وتطبيقه 💾
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PromotionsOffersView;
