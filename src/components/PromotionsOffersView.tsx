import React, { useMemo, useState, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Download,
  Edit2,
  FileSpreadsheet,
  Flame,
  Percent,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PromotionOffer } from '../types';
import {
  parsePromotionsFromExcelBuffer,
  applyPromotionsToProducts,
  filterPromotionsForUser,
  doesOfferApplyToBranch,
  doesOfferApplyToRep,
  inferOfferSector,
  exportPromotionsToExcel,
  OFFER_BRANCH_STOCK_COLUMNS,
} from '../services/promotionService';
import { formatCurrency } from '../services/invoiceService';
import { cleanProductCode } from '../services/excelService';
import { ProductImage } from './ProductImage';

interface PromotionsOffersViewProps {
  onOpenProductInCatalog?: (productCode: string) => void;
}

export const PromotionsOffersView: React.FC<PromotionsOffersViewProps> = ({
  onOpenProductInCatalog,
}) => {
  const {
    products,
    cloudinaryConfig,
    currentUser,
    users,
    branches,
    promotions,
    saveAndSyncPromotions,
    announcements,
    saveAndSyncAnnouncements,
  } = useApp();

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const canManageOffers = ['admin', 'developer', 'branch_manager'].includes(currentUser?.role || '');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('الكل');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<'all' | 'home' | 'electrical'>('all');
  const [selectedRepFilter, setSelectedRepFilter] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');

  // Modal/Page States
  const [showUploadPage, setShowUploadPage] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromotionOffer | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'clear_all' | 'delete_one';
    id?: string;
    title: string;
    description: string;
  } | null>(null);
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
    sector: undefined,
    repName: '',
    salesPriority: '',
    supplyPlan: '',
    itemStatus: '',
    factor: undefined,
    size: '',
    color: '',
    itemGroup: '',
    familyName: '',
    status: 'نشط',
    notes: '',
  });

  const showToast = (msg: string) => {
    setErrorToast(null);
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  const showError = (msg: string) => {
    setSuccessToast(null);
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 5000);
  };

  // نطاق العروض المسموح للمستخدم حسب القطاع والفرع والمندوب
  const scopedPromotions = useMemo(
    () => filterPromotionsForUser(promotions, currentUser, products),
    [promotions, currentUser, products]
  );

  const repFilterOptions = useMemo(() => {
    const set = new Set<string>();
    scopedPromotions.forEach((p) => {
      if (p.repName && p.repName.trim() && p.repName !== 'كل المناديب') set.add(p.repName.trim());
    });
    users
      .filter((u) => u.role === 'sales_rep' && u.name)
      .forEach((u) => set.add(u.name.trim()));
    return ['الكل', ...Array.from(set).sort()];
  }, [scopedPromotions, users]);

  const branchFilterOptions = useMemo(() => {
    const set = new Set<string>(['متاح اكتوبر', ...branches.map((b) => b.name), ...OFFER_BRANCH_STOCK_COLUMNS.filter((b) => b !== 'متاح اكتوبر')]);
    return ['الكل', ...Array.from(set).filter(Boolean)];
  }, [branches]);

  const filteredPromotions = useMemo(() => {
    return scopedPromotions.filter((p) => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const codeMatch = p.productCode.toLowerCase().includes(q);
        const unifiedMatch = p.unifiedCode?.toLowerCase().includes(q);
        const nameMatch = p.productName.toLowerCase().includes(q);
        const titleMatch = p.title.toLowerCase().includes(q);
        const branchMatch = p.branchName?.toLowerCase().includes(q);
        const groupMatch = p.itemGroup?.toLowerCase().includes(q) || p.familyName?.toLowerCase().includes(q);
        const repMatch = p.repName?.toLowerCase().includes(q);
        if (!codeMatch && !unifiedMatch && !nameMatch && !titleMatch && !branchMatch && !groupMatch && !repMatch) return false;
      }

      if (selectedSectorFilter !== 'all') {
        const inferred = inferOfferSector(p, products);
        if (inferred && inferred !== selectedSectorFilter) return false;
      }

      if (selectedBranchFilter !== 'الكل' && !doesOfferApplyToBranch(p, selectedBranchFilter)) {
        return false;
      }

      if (selectedRepFilter !== 'الكل') {
        const targetRep = users.find((u) => u.name === selectedRepFilter) || { name: selectedRepFilter };
        if (!doesOfferApplyToRep(p, targetRep)) return false;
      }

      if (statusFilter === 'active' && p.status !== 'نشط') return false;
      if (statusFilter === 'expired' && p.status !== 'منتهي') return false;

      return true;
    });
  }, [scopedPromotions, searchTerm, selectedSectorFilter, selectedBranchFilter, selectedRepFilter, statusFilter, products, users]);

  // Statistics (بناءً على القائمة المتقيدة بالقطاع والفلترات الحالية)
  const stats = useMemo(() => {
    const active = filteredPromotions.filter((p) => p.status === 'نشط');
    const avgDiscount = active.length > 0
      ? Math.round(active.reduce((acc, p) => acc + (p.discountPercentage || 0), 0) / active.length)
      : 0;
    return {
      total: filteredPromotions.length,
      active: active.length,
      avgDiscount,
    };
  }, [filteredPromotions]);

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

      const { updatedCount } = applyPromotionsToProducts(products, updatedList);
      await saveAndSyncPromotions(updatedList);

      showToast(`تم استيراد ومزامنة ${result.matchedCount} عرض بنجاح، وتطبيق الخصم الخاص على ${updatedCount} صنف في الكتالوج والفواتير!`);
      setShowUploadPage(false);
    } catch (err: any) {
      showError(`خطأ أثناء قراءة شيت العروض: ${err?.message || ''}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Google Sheet URL Fetch
  const handleFetchGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      showError('يرجى إدخال رابط شيت جوجل (Google Sheets URL)');
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

      const { updatedCount } = applyPromotionsToProducts(products, updatedList);
      await saveAndSyncPromotions(updatedList);

      showToast(`تم جلب ومزامنة ${result.matchedCount} عرض وتطبيق الخصم الخاص على ${updatedCount} صنف في الكتالوج والفواتير!`);
      setShowUploadPage(false);
      setGoogleSheetUrl('');
    } catch (err: any) {
      showError(`خطأ أثناء جلب شيت جوجل: ${err?.message || ''}`);
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
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
    await saveAndSyncAnnouncements(next);
    setShowAddAnnouncementModal(false);
    setAnnouncementForm({ title: '', content: '', priority: 'عاجل' });
    showToast('تم نشر ومزامنة التعميم الإداري لجميع المناديب والفروع بنجاح.');
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const next = announcements.filter((a) => a.id !== id);
    await saveAndSyncAnnouncements(next);
    showToast('تم حذف التعميم الإداري.');
  };

  // Handle Save Manual Offer
  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || (!formData.productCode && !formData.productName)) {
      showError('يرجى كتابة عنوان العرض وكود الصنف أو اسمه.');
      return;
    }

    const matchedProduct = products.find(
      (p) => cleanProductCode(p.code) === cleanProductCode(formData.productCode) ||
             (p.unifiedCode && formData.unifiedCode && p.unifiedCode.replace(/^#/, '') === formData.unifiedCode.replace(/^#/, '')) ||
             p.name.trim().toLowerCase() === (formData.productName || '').trim().toLowerCase()
    );

    const originalPrice = formData.originalPrice || matchedProduct?.cartonPrice || 200;
    const promoPriceInput = Number(formData.promoPrice) || 0;
    let discount = Number(formData.discountPercentage) || 0;
    if (promoPriceInput > 0 && originalPrice > 0 && discount <= 0 && promoPriceInput < originalPrice) {
      discount = Number((((originalPrice - promoPriceInput) / originalPrice) * 100).toFixed(1));
    }
    const promoPrice = promoPriceInput > 0 ? promoPriceInput : (discount > 0 ? Number((originalPrice * (1 - discount / 100)).toFixed(2)) : originalPrice);

    const newOffer: PromotionOffer = {
      id: editingPromo ? editingPromo.id : `promo-manual-${Date.now()}`,
      title: formData.title || '',
      productCode: formData.productCode || matchedProduct?.code || '---',
      unifiedCode: formData.unifiedCode || matchedProduct?.unifiedCode?.replace(/^#/, '') || undefined,
      productName: formData.productName || matchedProduct?.name || 'صنف غير محدد',
      salesPriority: formData.salesPriority || undefined,
      supplyPlan: formData.supplyPlan || undefined,
      itemStatus: formData.itemStatus || undefined,
      factor: formData.factor ? Number(formData.factor) : matchedProduct?.factor || matchedProduct?.cartonQuantity,
      size: formData.size || undefined,
      color: formData.color || undefined,
      itemGroup: formData.itemGroup || undefined,
      familyName: formData.familyName || undefined,
      category: formData.itemGroup || matchedProduct?.category || formData.category,
      sector: formData.sector || (matchedProduct?.sector === 'home' || matchedProduct?.sector === 'electrical' ? matchedProduct.sector : undefined),
      discountPercentage: discount,
      originalPrice,
      promoPrice,
      startDate: formData.startDate,
      endDate: formData.endDate,
      branchName: formData.branchName || 'كل الفروع',
      branchStocks: editingPromo?.branchStocks,
      eligibleBranches: formData.branchName && formData.branchName !== 'كل الفروع' ? [formData.branchName] : undefined,
      repName: formData.repName && formData.repName !== 'كل المناديب' ? formData.repName : undefined,
      status: (formData.status as any) || 'نشط',
      notes: formData.notes,
      createdAt: editingPromo ? editingPromo.createdAt : new Date().toISOString(),
    };

    let updatedList: PromotionOffer[];
    if (editingPromo) {
      updatedList = promotions.map((p) => (p.id === editingPromo.id ? newOffer : p));
    } else {
      updatedList = [newOffer, ...promotions];
    }

    await saveAndSyncPromotions(updatedList);
    showToast(editingPromo ? 'تم تعديل العرض الترويجي ومزامنته بنجاح.' : 'تمت إضافة العرض الترويجي وتطبيق الخصم الخاص بنجاح.');

    setIsEditModalOpen(false);
    setEditingPromo(null);
  };

  // Clear all offers (React confirmation modal instead of window.confirm)
  const requestClearAllOffers = () => {
    setConfirmAction({
      kind: 'clear_all',
      title: 'مسح كافة العروض الترويجية',
      description: 'هل أنت متأكد من مسح كافة العروض والخصومات المعتمدة وإرجاع أسعار الأصناف لحالتها الطبيعية على جميع الأجهزة؟',
    });
  };

  // Delete single offer (React confirmation modal instead of window.confirm)
  const requestDeleteOffer = (id: string) => {
    setConfirmAction({
      kind: 'delete_one',
      id,
      title: 'حذف العرض الترويجي',
      description: 'هل أنت متأكد من حذف هذا العرض الترويجي وإلغاء الخصم الخاص عن الصنف؟',
    });
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.kind === 'clear_all') {
      const { revertedCount } = applyPromotionsToProducts(products, []);
      await saveAndSyncPromotions([]);
      showToast(`تم مسح كافة العروض ومزامنتها وإرجاع أسعار ${revertedCount} صنف لوضعها الطبيعي.`);
    } else if (confirmAction.kind === 'delete_one' && confirmAction.id) {
      const updated = promotions.filter((p) => p.id !== confirmAction.id);
      await saveAndSyncPromotions(updated);
      showToast('تم حذف العرض الترويجي ومزامنته بنجاح.');
    }
    setConfirmAction(null);
  };

  if (showUploadPage) {
    return (
      <div className="tg-dash space-y-4 pb-16" dir="rtl">
        <section className="ds-pagehead">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
                العروض والخصومات <span className="mx-1 text-[#7fc0ff]">›</span> رفع الشيت
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white">رفع شيت العروض</h1>
                  <p className="text-xs text-[#c3d9ec] mt-0.5">استيراد العروض من ملف Excel/CSV أو رابط Google Sheets وتطبيقها على الأصناف.</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowUploadPage(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-black px-4 py-2.5 text-xs transition cursor-pointer shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
              رجوع للعروض
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="tg-card p-5 border border-[var(--tg-line)]">
            <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337] mb-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><FileSpreadsheet className="w-4 h-4" /></span>
              رفع ملف Excel / CSV
            </h3>
            <p className="text-[11px] font-bold text-[var(--tg-muted)] mb-4">الأعمدة المدعومة: Item number, Product name, اولوية البيع, خطة التوريد, حالة الصنف, Factor, Size, Color, Item group, Family Name, سعر اللستة, سعر العرض, متاح اكتوبر, الفيوم, ديمشلت, منوف, منيا القمح, القاهرة, البحيرة, المنيا, القطاع (+ المندوب إن وجد).</p>

            <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-2xl p-6 text-center space-y-3">
              <Upload className="w-10 h-10 text-emerald-600 mx-auto" />
              <div className="font-black text-sm text-[#0b2337]">اختر ملف العروض من جهازك</div>
              <div className="text-[11px] text-slate-500">يدعم .xlsx / .xls / .csv</div>
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
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white shadow-sm transition cursor-pointer ${
                  isUploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isUploading ? 'جاري القراءة والمطابقة...' : 'استعراض واختيار الملف'}
              </label>
            </div>
          </div>

          <div className="tg-card p-5 border border-[var(--tg-line)]">
            <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337] mb-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><RefreshCw className="w-4 h-4" /></span>
              جلب من Google Sheets
            </h3>
            <p className="text-[11px] font-bold text-[var(--tg-muted)] mb-4">ألصق رابط الشيت (يجب أن يكون متاحاً لمن لديه الرابط).</p>

            <div className="space-y-3">
              <input
                type="url"
                value={googleSheetUrl}
                onChange={(e) => setGoogleSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              />
              <button
                type="button"
                onClick={handleFetchGoogleSheet}
                disabled={isFetchingSheet || !googleSheetUrl.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black px-4 py-2.5 text-xs shadow-sm transition cursor-pointer"
              >
                {isFetchingSheet ? 'جاري الجلب والقراءة...' : 'جلب العروض من الرابط'}
              </button>
            </div>
          </div>
        </div>

        <div className="tg-card p-4 sm:p-5 border border-[var(--tg-line)]">
          <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337] mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Tag className="w-4 h-4" /></span>
            ملاحظات الربط التلقائي وتوجيه العروض حسب الفرع والمندوب والقطاع
          </h3>
          <ul className="text-sm font-medium text-slate-700 space-y-1.5 list-disc pr-5 leading-6">
            <li>يتم مطابقة الأصناف عبر <strong>Item number / كود الصنف</strong> أو <strong>الكود الموحد (#)</strong> أو <strong>Product name</strong>.</li>
            <li>يُحسب الخصم تلقائياً من <strong>سعر اللستة</strong> و<strong>سعر العرض</strong> (أو نسبة الخصم إن وُجدت).</li>
            <li>يُخصَّص ظهور العرض وتطبيقه تلقائياً حسب <strong>القطاع</strong> وأعمدة الإتاحة للفروع (<strong>متاح اكتوبر، الفيوم، ديمشلت، منوف، منيا القمح، القاهرة، البحيرة، المنيا</strong>) واسم <strong>المندوب</strong>.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-dash space-y-4 pb-16" dir="rtl">
      {/* Toasts */}
      {successToast && (
        <div className="tg-toast">
          <div className="tg-toast-item tg-toast--ok">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successToast}</span>
            <button type="button" onClick={() => setSuccessToast(null)} className="ml-auto text-white/80 hover:text-white" aria-label="إغلاق">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      {errorToast && (
        <div className="tg-toast">
          <div className="tg-toast-item tg-toast--err">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorToast}</span>
            <button type="button" onClick={() => setErrorToast(null)} className="ml-auto text-white/80 hover:text-white" aria-label="إغلاق">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* React Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-slate-900 text-base">{confirmAction.title}</h3>
                <p className="text-xs font-medium text-slate-600 mt-1 leading-relaxed">{confirmAction.description}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executeConfirmAction}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                تأكيد التنفيذ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* الهيدر — هوية التطبيق */}
      <section className="ds-pagehead">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              رئيسية <span className="mx-1 text-[#7fc0ff]">›</span> عروض دريم طنطاوي والخصومات
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-200 flex items-center justify-center shrink-0 shadow-xs border border-amber-300/30">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 flex-wrap">
                  عروض دريم طنطاوي
                  <span className="tg-special-discount-badge">
                    <Tag className="w-3 h-3" />
                    خصم خاص
                  </span>
                  <span className="inline-flex items-center rounded-full bg-white/15 border border-white/25 px-2.5 py-0.5 text-[11px] font-black text-blue-100">
                    {stats.active} عرض نشط
                  </span>
                </h1>
                <p className="text-xs text-[#c3d9ec] mt-0.5">عروض مرتبطة مباشرة بكود المنتج — الخصم الخاص يطبق تلقائياً في الكتالوج وأمر البيع.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {filteredPromotions.length > 0 && (
              <button
                type="button"
                onClick={() => exportPromotionsToExcel(filteredPromotions)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-black px-3.5 py-2.5 text-xs shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                title="تصدير كشف العروض بصيغة Excel بنفس الفلاتر"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}
            {canManageOffers && promotions.length > 0 && (
              <button
                type="button"
                onClick={requestClearAllOffers}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black px-3.5 py-2.5 text-xs shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                title="مسح كافة العروض وإلغاء الخصومات عن كافة الأصناف"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح كافة العروض</span>
              </button>
            )}
            {canManageOffers && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPromo(null);
                    setFormData({
                      title: '',
                      productCode: '',
                      unifiedCode: '',
                      productName: '',
                      discountPercentage: 10,
                      promoPrice: undefined,
                      originalPrice: undefined,
                      startDate: new Date().toISOString().slice(0, 10),
                      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                      branchName: currentUser?.role === 'branch_manager' ? (currentUser.branchName || 'كل الفروع') : 'كل الفروع',
                      sector: undefined,
                      repName: '',
                      salesPriority: '',
                      supplyPlan: '',
                      itemStatus: '',
                      factor: undefined,
                      size: '',
                      color: '',
                      itemGroup: '',
                      familyName: '',
                      status: 'نشط',
                      notes: '',
                    });
                    setIsEditModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1E3A8A] text-white font-black px-3.5 py-2.5 text-xs shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة عرض بالكود</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadPage(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-black px-3.5 py-2.5 text-xs shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
                  title="فتح صفحة رفع شيت العروض"
                >
                  <Upload className="w-4 h-4" />
                  <span>رفع شيت العروض</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* مؤشرات */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <div className="tg-kpi tg-kpi--amber">
          <div className="tg-kpi__top"><span className="tg-kpi__icon"><Flame size={20} /></span></div>
          <span className="tg-kpi__value tabular-nums">{stats.active.toLocaleString('en-US')}</span>
          <span className="tg-kpi__label">العروض النشطة</span>
          <span className="tg-kpi__hint">المخصصة لنطاقك</span>
        </div>
        <div className="tg-kpi tg-kpi--red">
          <div className="tg-kpi__top"><span className="tg-kpi__icon"><Percent size={20} /></span></div>
          <span className="tg-kpi__value tabular-nums">{stats.avgDiscount}%</span>
          <span className="tg-kpi__label">متوسط الخصم</span>
          <span className="tg-kpi__hint">على العروض النشطة</span>
        </div>
        <div className="tg-kpi tg-kpi--blue">
          <div className="tg-kpi__top"><span className="tg-kpi__icon"><Boxes size={20} /></span></div>
          <span className="tg-kpi__value tabular-nums">{stats.total.toLocaleString('en-US')}</span>
          <span className="tg-kpi__label">أصناف مشمولة</span>
          <span className="tg-kpi__hint">إجمالي العروض</span>
        </div>
        <div className="tg-kpi tg-kpi--emerald">
          <div className="tg-kpi__top"><span className="tg-kpi__icon"><Zap size={20} /></span></div>
          <span className="tg-kpi__value" style={{ fontSize: 22 }}>مفعّل</span>
          <span className="tg-kpi__label">تطبيق على الفاتورة</span>
          <span className="tg-kpi__hint">تلقائي حسب الفرع والقطاع</span>
        </div>
      </div>

      {/* البحث والفلاتر */}
      <div className="tg-card !flex-row !flex-wrap !items-center !justify-between !gap-3 !p-3.5">
        <div className="relative w-full lg:max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث بكود الصنف، الاسم، العائلة، أو المندوب..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                statusFilter === 'all' ? 'bg-[#0b2337] text-white shadow-sm' : 'text-slate-700 hover:bg-white'
              }`}
            >
              الكل ({filteredPromotions.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white'
              }`}
            >
              النشطة ({stats.active})
            </button>
          </div>

          {(isAdminOrDev || !currentUser?.sector || currentUser.sector === 'all' || currentUser.sector === 'both') && (
            <select
              value={selectedSectorFilter}
              onChange={(e) => setSelectedSectorFilter(e.target.value as 'all' | 'home' | 'electrical')}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 outline-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              aria-label="فلترة القطاع"
            >
              <option value="all">كل القطاعات</option>
              <option value="home">قطاع المنزلي</option>
              <option value="electrical">قطاع الكهربائي</option>
            </select>
          )}

          {(isAdminOrDev || currentUser?.role === 'supervisor') && (
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 outline-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              aria-label="فلترة الفرع"
            >
              {branchFilterOptions.map((b) => (
                <option key={b} value={b}>{b === 'الكل' ? 'كل الفروع' : b}</option>
              ))}
            </select>
          )}

          {canManageOffers && (
            <select
              value={selectedRepFilter}
              onChange={(e) => setSelectedRepFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 outline-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              aria-label="فلترة المندوب"
            >
              {repFilterOptions.map((r) => (
                <option key={r} value={r}>{r === 'الكل' ? 'كل المناديب' : r}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Promotions Cards Grid */}
      {filteredPromotions.length === 0 ? (
        <div className="tg-card items-center justify-center text-center py-12 border border-dashed border-slate-300 bg-slate-50/50">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Flame className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-[#0b2337]">لا توجد عروض مطابقة</h3>
          <p className="mt-1 text-[11px] font-bold text-[var(--tg-muted)] max-w-md">
            يمكنك رفع شيت عروض جديد من Excel أو Google Sheets من زر "رفع شيت العروض" بالأعلى.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPromotions.map((promo) => {
            const matchedProduct = products.find(
              (p) => cleanProductCode(p.code) === cleanProductCode(promo.productCode) ||
                     (p.unifiedCode && promo.unifiedCode && p.unifiedCode.replace(/^#/, '') === promo.unifiedCode.replace(/^#/, '')) ||
                     p.name.trim().toLowerCase() === promo.productName.trim().toLowerCase()
            );

            const cartonQty = promo.factor || matchedProduct?.cartonQuantity || 1;
            const cartonPrice = promo.originalPrice || matchedProduct?.cartonPrice || 200;
            const promoPrice = promo.promoPrice || (promo.discountPercentage > 0 ? Number((cartonPrice * (1 - promo.discountPercentage / 100)).toFixed(2)) : cartonPrice);
            const promoPiecePrice = cartonQty > 1 ? Math.round((promoPrice / cartonQty) * 100) / 100 : promoPrice;
            const offerSector = inferOfferSector(promo, products);
            const sectorLabel = offerSector === 'electrical' ? 'كهربائي' : offerSector === 'home' ? 'منزلي' : '';
            const jumpCode = (promo.productCode && promo.productCode !== '---')
              ? promo.productCode
              : (promo.unifiedCode || promo.productName || '');

            return (
              <div
                key={promo.id}
                className="tg-card relative overflow-hidden !gap-3 p-4 border border-[var(--tg-line)] hover:border-blue-400/70 hover:shadow-md transition"
              >
                {/* Top Promo Ribbons */}
                <div className="flex items-center justify-between gap-2 pb-1 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="tg-special-discount-badge">
                      <Tag className="w-3 h-3" />
                      خصم خاص
                    </span>
                    {promo.salesPriority && (
                      <span className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[10px] font-black">
                        أولوية: {promo.salesPriority}
                      </span>
                    )}
                    {sectorLabel && (
                      <span className="rounded-lg bg-blue-50 border border-blue-200 text-[#1E3A8A] px-2 py-0.5 text-[10px] font-black">
                        {sectorLabel}
                      </span>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-[#0F2B38] text-white font-black text-[11px] px-2.5 py-1 shadow-xs">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>خصم {promo.discountPercentage}%</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  {matchedProduct ? (
                    <ProductImage
                      product={matchedProduct}
                      cloudinaryConfig={cloudinaryConfig}
                      targetSize={160}
                      sizeVariant="thumbnail"
                      containerClassName="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 shrink-0"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#EEF4FB] text-[#1E3A8A] border border-blue-200 flex items-center justify-center font-black shrink-0">
                      <Tag className="w-6 h-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="font-black text-[#0F2B38] text-sm leading-snug line-clamp-2">
                      {promo.title}
                    </h3>
                    <div className="text-[11px] text-slate-600 font-bold truncate">
                      {promo.productName}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-slate-100 text-slate-800 font-mono text-[10px] font-black px-1.5 py-0.5 rounded-md border border-slate-200">
                        {promo.productCode}
                      </span>
                      {promo.unifiedCode && (
                        <span className="bg-blue-50 text-[#1E3A8A] font-mono text-[10px] font-black px-1.5 py-0.5 rounded-md border border-blue-200">
                          #{promo.unifiedCode}
                        </span>
                      )}
                      {promo.itemStatus && (
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                          {promo.itemStatus}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Spec Grid from Sheet */}
                {(promo.factor || promo.size || promo.color || promo.itemGroup || promo.familyName || promo.supplyPlan) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 rounded-xl bg-slate-50 border border-slate-200/80 p-2 text-[10.5px]">
                    {promo.itemGroup && (
                      <div className="truncate"><span className="text-slate-500 font-bold">المجموعة: </span><strong className="text-slate-800">{promo.itemGroup}</strong></div>
                    )}
                    {promo.familyName && (
                      <div className="truncate"><span className="text-slate-500 font-bold">العائلة: </span><strong className="text-slate-800">{promo.familyName}</strong></div>
                    )}
                    {promo.factor ? (
                      <div><span className="text-slate-500 font-bold">Factor: </span><strong className="font-mono text-slate-800">{promo.factor}</strong></div>
                    ) : null}
                    {promo.size && (
                      <div className="truncate"><span className="text-slate-500 font-bold">المقاس: </span><strong className="text-slate-800">{promo.size}</strong></div>
                    )}
                    {promo.color && (
                      <div className="truncate"><span className="text-slate-500 font-bold">اللون: </span><strong className="text-slate-800">{promo.color}</strong></div>
                    )}
                    {promo.supplyPlan && (
                      <div className="truncate"><span className="text-slate-500 font-bold">التوريد: </span><strong className="text-slate-800">{promo.supplyPlan}</strong></div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 line-through">سعر اللستة: {formatCurrency(cartonPrice)}</div>
                    <div className="text-base font-black text-[#047857] tabular-nums">سعر العرض: {formatCurrency(promoPrice)}</div>
                    {cartonQty > 1 && (
                      <div className="text-[10px] font-bold text-emerald-800">سعر القطعة بالعرض: {formatCurrency(promoPiecePrice)}</div>
                    )}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-[10px] font-bold text-slate-500">الفرع / المندوب</div>
                    <div className="text-[11px] font-black text-[#0F2B38] truncate max-w-[140px]">{promo.branchName}</div>
                    {promo.repName && (
                      <div className="text-[10px] font-bold text-blue-800 truncate max-w-[140px]">مندوب: {promo.repName}</div>
                    )}
                  </div>
                </div>

                {/* 8-Branch Stock Availability Grid */}
                {promo.branchStocks && Object.keys(promo.branchStocks).length > 0 && (
                  <div className="grid grid-cols-4 gap-1 text-[9.5px] bg-slate-50/90 border border-slate-200 rounded-xl p-2">
                    {OFFER_BRANCH_STOCK_COLUMNS.map((bCol) => {
                      const qty = promo.branchStocks?.[bCol] ?? 0;
                      const available = qty > 0;
                      return (
                        <div
                          key={bCol}
                          className={`rounded-lg px-1.5 py-1 text-center border ${
                            available
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-black'
                              : 'bg-white border-slate-200/80 text-slate-400 font-semibold'
                          }`}
                        >
                          <div className="truncate">{bCol.replace('متاح ', '')}</div>
                          <div className="font-mono tabular-nums">{qty}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="text-[11px] font-medium text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>من: <strong className="font-mono text-slate-800">{promo.startDate}</strong></span>
                    <span>إلى: <strong className="font-mono text-slate-800">{promo.endDate}</strong></span>
                  </div>
                  {promo.notes && (
                    <div className="text-slate-600 truncate" title={promo.notes}>{promo.notes}</div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border ${
                    promo.status === 'نشط'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {promo.status === 'نشط' ? 'ساري ونشط' : 'منتهي الصلاحية'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {onOpenProductInCatalog && jumpCode && (
                      <button
                        type="button"
                        onClick={() => onOpenProductInCatalog(jumpCode)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1E3A8A] text-white font-black px-2.5 py-1.5 text-[11px] transition cursor-pointer whitespace-nowrap shrink-0"
                        title="فتح الصنف بالكتالوج وتطبيق الخصم الخاص"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>اطلب بالكود</span>
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                    )}

                    {['admin', 'developer', 'branch_manager'].includes(currentUser?.role || '') && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPromo(promo);
                            setFormData(promo);
                            setIsEditModalOpen(true);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 transition cursor-pointer"
                          title="تعديل العرض"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteOffer(promo.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition cursor-pointer"
                          title="حذف العرض"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر اللستة (ج.م):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.originalPrice || ''}
                    onChange={(e) => setFormData({ ...formData, originalPrice: Number(e.target.value) || undefined })}
                    placeholder="سعر اللستة"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر العرض (ج.م):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.promoPrice || ''}
                    onChange={(e) => setFormData({ ...formData, promoPrice: Number(e.target.value) || undefined })}
                    placeholder="سعر العرض"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  />
                </div>
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
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">القطاع:</label>
                  <select
                    value={formData.sector || ''}
                    onChange={(e) => setFormData({ ...formData, sector: (e.target.value || undefined) as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  >
                    <option value="">كل القطاعات</option>
                    <option value="home">منزلي</option>
                    <option value="electrical">كهربائي</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفرع:</label>
                  <select
                    value={formData.branchName || 'كل الفروع'}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  >
                    <option value="كل الفروع">كل الفروع</option>
                    {branchFilterOptions.filter((b) => b !== 'الكل').map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المندوب:</label>
                  <select
                    value={formData.repName || ''}
                    onChange={(e) => setFormData({ ...formData, repName: e.target.value || undefined })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold"
                  >
                    <option value="">كل المناديب</option>
                    {repFilterOptions.filter((r) => r !== 'الكل').map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Factor:</label>
                  <input
                    type="number"
                    value={formData.factor || ''}
                    onChange={(e) => setFormData({ ...formData, factor: Number(e.target.value) || undefined })}
                    placeholder="الشدة"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Size:</label>
                  <input
                    type="text"
                    value={formData.size || ''}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    placeholder="المقاس"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Color:</label>
                  <input
                    type="text"
                    value={formData.color || ''}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="اللون"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">أولوية البيع:</label>
                  <input
                    type="text"
                    value={formData.salesPriority || ''}
                    onChange={(e) => setFormData({ ...formData, salesPriority: e.target.value })}
                    placeholder="عالية..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-900 font-bold"
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
