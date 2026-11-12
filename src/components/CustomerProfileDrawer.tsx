import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon, Plus, X, Camera, RefreshCw, MapPin,
  AlertTriangle, CheckCircle2, Building2, ShoppingCart, Phone,
  TrendingUp, Wallet, CalendarCheck, Users, Maximize2, Trash2,
  FileText, ExternalLink, Navigation, Check, Clock, AlertCircle,
  CreditCard, ChevronRight, Eye, ShieldCheck, Printer,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { normalizeArabicText } from '../services/arabicMatchingService';
import { classifyEligibilityColumn } from '../services/customerFinancialService';
import { normalizeCloudinaryConfig } from '../services/cloudinaryService';
import type { Invoice } from '../types';

const MAX_PHOTOS = 3;
const MAX_IMAGE_WIDTH = 1000;
const IMAGE_QUALITY = 0.6;
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

interface CustomerProfileDrawerProps {
  customer: any;
  isOpen: boolean;
  onClose: () => void;
  onNewOrder?: (cust: any) => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

function fmt(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
      };
      img.onerror = () => reject(new Error('image load failed'));
    };
    reader.onerror = () => reject(new Error('file read failed'));
  });
}

type TabKey = 'overview' | 'invoices' | 'months' | 'visits' | 'gps' | 'photos';

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
  customer,
  isOpen,
  onClose,
  onNewOrder,
  onViewInvoice,
}) => {
  const {
    currentUser,
    updateCustomer,
    cloudinaryConfig,
    addVisit,
    getVisibleVisits,
    getVisibleInvoices,
    invoices: allCtxInvoices,
  } = useApp();

  const [photos, setPhotos] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !customer) return;
    setPhotos(Array.isArray(customer.storePhotos) ? customer.storePhotos : []);
    setNewFiles([]);
    setPreviews([]);
    setGps(null);
    setToast(null);
    setTab('overview');
    setLightbox(null);
  }, [isOpen, customer]);

  /* ---------- استخراج فواتير العميل الفعلية من الـ Context ---------- */
  const customerInvoices = useMemo<Invoice[]>(() => {
    if (!customer) return [];
    const source: Invoice[] = (getVisibleInvoices ? getVisibleInvoices() : allCtxInvoices) || [];
    const cId = customer.id;
    const cCode = (customer.code || '').trim().toLowerCase();
    const cName = normalizeArabicText(customer.name || '');

    return source.filter((inv) => {
      if (cId && inv.customerId === cId) return true;
      if (cCode && (inv.customerCode || '').trim().toLowerCase() === cCode) return true;
      if (cName && normalizeArabicText(inv.customerName || '') === cName) return true;
      return false;
    }).sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
  }, [customer, getVisibleInvoices, allCtxInvoices]);

  /* ---------- سجل الزيارات الميدانية ---------- */
  const visits = useMemo(() => {
    if (!customer) return [];
    const history = Array.isArray(customer.visitHistory) ? customer.visitHistory : [];
    const cId = customer.id;
    const cCode = (customer.code || '').trim().toLowerCase();
    const cName = normalizeArabicText(customer.name || '');

    try {
      const all = getVisibleVisits ? getVisibleVisits() : [];
      const matched = all.filter((v: any) => {
        if (cId && v.customerId === cId) return true;
        if (cCode && (v.customerCode || '').trim().toLowerCase() === cCode) return true;
        if (cName && normalizeArabicText(v.customerName || '') === cName) return true;
        return false;
      });

      // دمج سجل الزيارات وتجنب التكرار
      const combined = [...matched];
      for (const h of history) {
        if (!combined.some((m) => m.id === h.id || (m.date === h.date && m.time === h.time))) {
          combined.push(h);
        }
      }
      return combined.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 20);
    } catch {
      return history.slice(0, 20);
    }
  }, [customer, getVisibleVisits]);

  /* ---------- آخر بيع وآخر تحصيل (من الفواتير والزيارات المحلية) ---------- */
  const lastSale = useMemo(() => customerInvoices[0] || null, [customerInvoices]);
  const lastCollection = useMemo(
    () => visits.find((v) => Number(v.collectedAmount) > 0) || null,
    [visits]
  );

  /* ---------- المبيعات والتحصيلات الشهرية الديناميكية ---------- */
  const monthly = useMemo(() => {
    const rawSales = customer?.monthlySales2026 || {};
    const rawColl = customer?.monthlyCollections2026 || {};
    
    // تجميع المبيعات الفعلية من الفواتير حسب الشهر
    const dynamicSales: Record<number, number> = {};
    const dynamicColl: Record<number, number> = {};

    for (const inv of customerInvoices) {
      const d = new Date(inv.date || inv.createdAt || '');
      const m = isNaN(d.getTime()) ? 0 : d.getMonth() + 1;
      if (m >= 1 && m <= 12) {
        dynamicSales[m] = (dynamicSales[m] || 0) + Number(inv.estimatedGrandTotal || inv.totalAmount || 0);
        if (inv.paymentMethod === 'نقدي (كاش)' || (inv as any).paymentStatus === 'مدفوع') {
          dynamicColl[m] = (dynamicColl[m] || 0) + Number(inv.estimatedGrandTotal || inv.totalAmount || 0);
        }
      }
    }

    // تجميع مبالغ التحصيل من الزيارات الميدانية
    for (const v of visits) {
      const d = new Date(v.date || '');
      const m = isNaN(d.getTime()) ? 0 : d.getMonth() + 1;
      const amt = Number(v.collectedAmount || 0);
      if (m >= 1 && m <= 12 && amt > 0) {
        dynamicColl[m] = (dynamicColl[m] || 0) + amt;
      }
    }

    const rows: { m: number; label: string; sales: number; coll: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const s = Math.max(
        Number(rawSales[m] ?? rawSales[String(m)] ?? 0) || 0,
        dynamicSales[m] || 0
      );
      const c = Math.max(
        Number(rawColl[m] ?? rawColl[String(m)] ?? 0) || 0,
        dynamicColl[m] || 0
      );
      if (s === 0 && c === 0) continue;
      rows.push({ m, label: MONTHS_AR[m - 1], sales: s, coll: c });
    }
    return rows;
  }, [customer, customerInvoices, visits]);

  const monthlyMax = useMemo(
    () => Math.max(1, ...monthly.map((r) => Math.max(r.sales, r.coll))),
    [monthly]
  );

  /* ---------- الحسابات المالية الإجمالية ---------- */
  const invoiceSalesSum = useMemo(
    () => customerInvoices.reduce((sum, inv) => sum + Number(inv.estimatedGrandTotal || inv.totalAmount || 0), 0),
    [customerInvoices]
  );

  const visitsCollSum = useMemo(
    () => visits.reduce((sum, v) => sum + Number(v.collectedAmount || 0), 0),
    [visits]
  );

  const balance = Number(customer?.balance ?? customer?.currentBalance ?? 0);
  const overdue = Number(customer?.overdue ?? customer?.overdueBalance ?? customer?.totalOverdueAndDue ?? 0);
  const limit = Number(customer?.creditLimit ?? 0);
  const exceeded = limit > 0 && (balance + overdue) > limit;
  const sector = customer?.sector;
  const avatarTone = sector === 'home' ? 'home' : sector === 'electrical' ? 'electrical' : 'default';
  
  // تصنيف العميل — من عامود «قابل / غير» حصريًا (نفس الدالة اللي في الشيت imports والتحليلات)
  const eligibilityInfo = classifyEligibilityColumn(customer?.dealEligibility);
  const isEligible = eligibilityInfo ? eligibilityInfo.eligible : true;
  const eligibilityLabel = eligibilityInfo?.raw || (isEligible ? 'قابل للتعامل' : 'غير قابل للتعامل');

  const totalSales = Math.max(
    Number(customer?.totalSales ?? customer?.sales2026 ?? 0),
    invoiceSalesSum
  );
  const totalColl = Math.max(
    Number(customer?.totalCollections ?? customer?.collections2026 ?? 0),
    visitsCollSum
  );
  const usagePct = limit > 0 ? Math.min(100, Math.round(((balance + overdue) / limit) * 100)) : 0;
  const photosCount = photos.length + newFiles.length;

  /* ---------- GPS وتثبيت الموقع الجغرافي ---------- */
  const requestGps = useCallback((): Promise<{ lat: number; lng: number; acc?: number } | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setToast({ ok: false, text: 'المتصفح أو الجهاز لا يدعم خدمة تحديد الموقع GPS' });
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
          setGps(coords);
          resolve(coords);
        },
        (err) => {
          let msg = 'تعذر الوصول لـ GPS — يرجى تفعيل الموقع في المتصفح أو الهاتف';
          if (err.code === 1) msg = 'تم رفض الإذن لتحديد الموقع الجغرافي';
          else if (err.code === 2) msg = 'إشارة الـ GPS غير متوفرة حالياً';
          else if (err.code === 3) msg = 'انتهت مهلة تحديد الموقع';
          setToast({ ok: false, text: msg });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, []);

  const handleVisitWithGps = async () => {
    if (!customer) return;
    setGpsLoading(true);
    setToast(null);

    const coords = await requestGps();
    if (!coords) {
      setGpsLoading(false);
      return;
    }

    try {
      const updatedCustomerData = {
        ...customer,
        latitude: coords.lat,
        longitude: coords.lng,
        locationAddress: customer.address || customer.region || customer.branchName || '',
        locationCapturedAt: new Date().toISOString(),
        locationCapturedBy: currentUser?.name || 'المندوب',
      };

      await updateCustomer(updatedCustomerData);

      // تسجيل زيارة توثيقية تلقائية
      if (addVisit && currentUser) {
        addVisit({
          customerId: customer.id,
          customerName: customer.name,
          customerCode: customer.code,
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          repId: currentUser.id,
          repName: currentUser.name,
          branchName: customer.branchName || currentUser.branchName || 'الرئيسي',
          sector: customer.sector || 'all',
          supervisorId: currentUser.supervisorId,
          supervisorName: currentUser.supervisorName || 'المشرف',
          type: 'تثبيت موقع',
          outcome: 'تم تثبيت GPS',
          status: 'منفذة',
          collectedAmount: 0,
          notes: `تثبيت إحداثيات موقع العميل GPS بدقة ±${Math.round(coords.acc || 0)}م`,
          syncStatus: 'local_only',
        } as any);
      }

      setToast({
        ok: true,
        text: `تم تثبيت إحداثيات ${customer.name} بنجاح (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,
      });
      setTimeout(() => setToast(null), 5000);
    } catch (err: any) {
      setToast({ ok: false, text: err?.message || 'حدث خطأ أثناء حفظ الإحداثيات' });
    } finally {
      setGpsLoading(false);
    }
  };

  /* ---------- إدارة ورفع الصور (Cloudinary) ---------- */
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) return;
    if (photos.length + newFiles.length + files.length > MAX_PHOTOS) {
      setToast({ ok: false, text: `الحد الأقصى ${MAX_PHOTOS} صور فقط لكل عميل` });
      return;
    }
    setNewFiles((prev) => [...prev, ...files]);
    setPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  };

  const removeNewFile = (idx: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeSavedPhoto = async (url: string) => {
    const next = photos.filter((p) => p !== url);
    setPhotos(next);
    await updateCustomer({ ...customer, storePhotos: next });
    setToast({ ok: true, text: 'تم حذف الصورة بنجاح' });
    setTimeout(() => setToast(null), 2500);
  };

  const handleUpload = async () => {
    if (newFiles.length === 0) return;
    setUploading(true);
    try {
      const effectiveCloudinary = normalizeCloudinaryConfig(cloudinaryConfig);
      const cloudName = effectiveCloudinary.cloudName;
      const preset = effectiveCloudinary.uploadPreset;
      if (!cloudName || !preset) {
        setUploading(false);
        setToast({ ok: false, text: 'إعدادات Cloudinary غير مفعّلة في النظام' });
        return;
      }
      const uploaded: string[] = [];
      for (const file of newFiles) {
        const compressed = await compressImage(file);
        const body = new FormData();
        body.append('file', compressed);
        body.append('upload_preset', preset);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body });
        const data = await res.json();
        if (data?.secure_url) uploaded.push(data.secure_url);
      }
      const all = [...photos, ...uploaded];
      await updateCustomer({ ...customer, storePhotos: all });
      setPhotos(all);
      setNewFiles([]);
      setPreviews([]);
      setUploading(false);
      setToast({ ok: true, text: `تم رفع ${uploaded.length} صورة بنجاح` });
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      setUploading(false);
      setToast({ ok: false, text: err?.message || 'فشل رفع الصور' });
    }
  };

  if (!isOpen || !customer) return null;

  const currentLat = gps?.lat ?? customer.latitude;
  const currentLng = gps?.lng ?? customer.longitude;
  const googleMapsUrl = currentLat && currentLng ? `https://www.google.com/maps?q=${currentLat},${currentLng}` : null;

  const tabs: { key: TabKey; label: string; icon: any; count?: number; hint?: string }[] = [
    { key: 'overview', label: 'التفاصيل المالية', icon: Wallet, hint: 'المديونية والتحصيل' },
    { key: 'invoices', label: 'الفواتير', icon: FileText, count: customerInvoices.length },
    { key: 'months', label: 'المبيعات الشهرية', icon: TrendingUp, count: monthly.length || undefined },
    { key: 'visits', label: 'الزيارات', icon: CalendarCheck, count: visits.length, hint: 'سجل الزيارات الميدانية' },
    { key: 'gps', label: 'الموقع GPS', icon: MapPin },
    { key: 'photos', label: 'صور المحل', icon: ImageIcon, count: photosCount, hint: 'توثيق صور المحل' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-hidden" dir="rtl">
      {/* خلفية معتمة منفصلة قابلة للنقر للإغلاق - غير محجوبة وغير متداخلة */}
      <div
        className="fixed inset-0 bg-[#071726]/80 backdrop-blur-sm transition-opacity cursor-pointer"
        onClick={onClose}
        aria-label="إغلاق الخلفية"
      />

      <div className="tg-cp relative z-10 w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#0f172a] rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-[0_25px_70px_rgba(0,0,0,0.55)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* ====== هيدر بطاقة العميل ====== */}
        <div className="tg-cp__head relative z-10">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label="إغلاق"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <div className={`tg-cp__avatar tg-cp__avatar--${avatarTone}`}>
                {photos[0] ? (
                  <img src={photos[0]} alt={customer.name} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  <span>{String(customer.name || '؟').charAt(0)}</span>
                )}
              </div>
              {photosCount > 1 && <span className="tg-cp__photos">+{photosCount - 1}</span>}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                {/* شارة تصنيف الشيت المعتمدة (قابل / غير قابل) */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border shadow-xs ${
                  isEligible
                    ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                    : 'bg-rose-500/25 text-rose-200 border-rose-400/50'
                }`}>
                  {isEligible ? <CheckCircle2 size={12} className="text-emerald-300" /> : <AlertTriangle size={12} className="text-rose-300" />}
                  <span>{eligibilityLabel}</span>
                </span>

                <span className={`tg-cp__badge ${
                  sector === 'home' ? 'tg-cp__badge--blue' : sector === 'electrical' ? 'tg-cp__badge--violet' : ''
                }`}>
                  {sector === 'home' ? 'منزلي' : sector === 'electrical' ? 'كهربائي' : 'عام'}
                </span>

                <span className={`tg-cp__badge ${exceeded ? 'tg-cp__badge--risk' : balance > 0 ? 'tg-cp__badge--warn' : 'tg-cp__badge--ok'}`}>
                  {exceeded ? 'تجاوز حد الائتمان' : balance > 0 ? 'عليه مستحق' : 'خالص'}
                </span>

                {customer.latitude && (
                  <span className="tg-cp__badge tg-cp__badge--ok inline-flex items-center gap-1">
                    <Check size={10} />
                    GPS مثبت
                  </span>
                )}
              </div>
              <h2 className="tg-cp__name truncate text-lg sm:text-xl text-white font-black">{customer.name}</h2>
              <div className="tg-cp__meta text-blue-100/90 text-xs font-bold">
                <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{customer.code || '—'}</span>
                <span>•</span>
                <span>{customer.branchName || customer.branch || '—'}</span>
                {(customer.repName || customer.salesRepName) && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-blue-100">
                      <Users size={10} />
                      {customer.repName || customer.salesRepName}
                    </span>
                  </>
                )}
                {customer.phone && customer.phone !== '—' && (
                  <>
                    <span>•</span>
                    <a
                      href={`tel:${customer.phone}`}
                      className="inline-flex items-center gap-1 text-blue-200 hover:text-white underline-offset-2 hover:underline"
                    >
                      <Phone size={11} />
                      {customer.phone}
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* شريط الإحصائيات المالية المباشرة */}
          <div className="tg-cp__stats grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3.5">
            <div className="tg-cp__stat bg-white/10 border border-white/15 rounded-xl p-2.5">
              <div className="tg-cp__stat-label text-blue-200 text-[10px]">المديونية الحالية</div>
              <div className="tg-cp__stat-value text-white font-black text-sm">{fmt(balance)} ج.م</div>
            </div>
            <div className="tg-cp__stat bg-white/10 border border-white/15 rounded-xl p-2.5">
              <div className="tg-cp__stat-label text-blue-200 text-[10px]">المتأخرات</div>
              <div className="tg-cp__stat-value font-black text-sm" style={{ color: overdue > 0 ? '#fecdd3' : '#a7f3d0' }}>
                {fmt(overdue)} ج.م
              </div>
            </div>
            <div className="tg-cp__stat bg-white/10 border border-white/15 rounded-xl p-2.5">
              <div className="tg-cp__stat-label text-blue-200 text-[10px]">إجمالي المبيعات</div>
              <div className="tg-cp__stat-value font-black text-sm" style={{ color: '#bfdbfe' }}>{fmt(totalSales)} ج.م</div>
            </div>
            <div className="tg-cp__stat bg-white/10 border border-white/15 rounded-xl p-2.5">
              <div className="tg-cp__stat-label text-blue-200 text-[10px]">إجمالي التحصيل</div>
              <div className="tg-cp__stat-value font-black text-sm" style={{ color: '#a7f3d0' }}>{fmt(totalColl)} ج.م</div>
            </div>
          </div>
        </div>

        {/* ====== التبويبات ====== */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] sticky top-0 z-10">
          <div className="px-3 sm:px-4 pt-3 pb-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-black text-slate-600 dark:text-slate-300">أقسام ملف العميل</span>
              <span className="text-[10px] font-bold text-slate-400">التفاصيل المالية • الزيارات • صور المحل</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {tabs.map((t) => {
                const Icon = t.icon;
                const isActive = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center transition min-h-[58px] ${
                      isActive
                        ? 'bg-[#0b2337] text-white border-[#0b2337] shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700'
                    }`}
                    title={t.hint || t.label}
                  >
                    <Icon size={15} />
                    <span className="text-[10px] sm:text-[11px] font-black leading-tight">{t.label}</span>
                    {t.count !== undefined && (
                      <span
                        className={`absolute top-1 left-1 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black inline-flex items-center justify-center ${
                          isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ====== المحتوى الداخلي ====== */}
        <div className="tg-cp__body flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0b1329] p-4 sm:p-5 space-y-4">
          {/* التبويب 1: التفاصيل المالية والنظرة العامة */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* وصول سريع للأقسام المطلوبة */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTab('months')}
                  className="tg-card p-3 text-right hover:border-blue-300 hover:bg-blue-50/40 transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                      <TrendingUp size={15} />
                    </span>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-blue-600 rotate-180" />
                  </div>
                  <div className="text-xs font-black text-[#0b2337]">التفاصيل المالية الشهرية</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">مبيعات وتحصيلات حسب الشهر</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTab('visits')}
                  className="tg-card p-3 text-right hover:border-emerald-300 hover:bg-emerald-50/40 transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <CalendarCheck size={15} />
                    </span>
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">{visits.length}</span>
                  </div>
                  <div className="text-xs font-black text-[#0b2337]">سجل الزيارات</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">كل الزيارات الميدانية للعميل</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTab('photos')}
                  className="tg-card p-3 text-right hover:border-violet-300 hover:bg-violet-50/40 transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                      <ImageIcon size={15} />
                    </span>
                    <span className="text-[10px] font-black bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">{photosCount}/{MAX_PHOTOS}</span>
                  </div>
                  <div className="text-xs font-black text-[#0b2337]">صور المحل</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">توثيق وعرض صور المحل</div>
                </button>
              </div>

              {/* آخر بيع وآخر تحصيل */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="tg-card p-3 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[var(--app-accent,#2563EB)]/10 text-[var(--app-accent,#2563EB)] flex items-center justify-center shrink-0">
                    <ShoppingCart size={17} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-500">آخر بيع</div>
                    {lastSale ? (
                      <>
                        <div className="text-xs font-black text-[#0b2337] dark:text-white truncate">{lastSale.invoiceNumber}</div>
                        <div className="text-[10px] tabular-nums text-slate-500">
                          {(lastSale.date || lastSale.createdAt || '').slice(0, 10)} · {fmt(Number(lastSale.estimatedGrandTotal || lastSale.totalAmount || 0))} ج.م
                        </div>
                      </>
                    ) : (
                      <div className="text-xs font-black text-slate-400">لا يوجد بيع مسجل</div>
                    )}
                  </div>
                </div>
                <div className="tg-card p-3 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[var(--app-ok,#0D9488)]/10 text-[var(--app-ok,#0D9488)] flex items-center justify-center shrink-0">
                    <CreditCard size={17} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-500">آخر تحصيل</div>
                    {lastCollection ? (
                      <>
                        <div className="text-xs font-black text-[#0b2337] dark:text-white tabular-nums">
                          {fmt(Number(lastCollection.collectedAmount || 0))} ج.م
                        </div>
                        <div className="text-[10px] tabular-nums text-slate-500">
                          {(lastCollection.date || '').slice(0, 10)} · {lastCollection.repName || '—'}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs font-black text-slate-400">لا يوجد تحصيل مسجل</div>
                    )}
                  </div>
                </div>
              </div>

              {/* التفاصيل المالية */}
              <div className="tg-card p-4 bg-white dark:bg-[#131e36] border border-slate-200 dark:border-slate-800">
                <div className="tg-cp__section-title text-[#0b2337] dark:text-white font-black mb-3">
                  <Wallet size={15} className="text-blue-600" />
                  التفاصيل المالية
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-bold text-slate-500 mb-0.5">المديونية الحالية</div>
                    <div className="text-sm font-black text-[#0b2337] tabular-nums">{fmt(balance)} ج.م</div>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3">
                    <div className="text-[10px] font-bold text-rose-700 mb-0.5">المتأخرات</div>
                    <div className="text-sm font-black text-rose-700 tabular-nums">{fmt(overdue)} ج.م</div>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                    <div className="text-[10px] font-bold text-blue-700 mb-0.5">إجمالي المبيعات</div>
                    <div className="text-sm font-black text-blue-700 tabular-nums">{fmt(totalSales)} ج.م</div>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                    <div className="text-[10px] font-bold text-emerald-700 mb-0.5">إجمالي التحصيل</div>
                    <div className="text-sm font-black text-emerald-700 tabular-nums">{fmt(totalColl)} ج.م</div>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3">
                    <div className="text-[10px] font-bold text-violet-700 mb-0.5">نسبة التحصيل</div>
                    <div className="text-sm font-black text-violet-700 tabular-nums">
                      {totalSales > 0 ? `${Math.min(100, Math.round((totalColl / totalSales) * 100))}%` : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                    <div className="text-[10px] font-bold text-amber-700 mb-0.5">الحد الائتماني</div>
                    <div className="text-sm font-black text-amber-700 tabular-nums">{limit > 0 ? `${fmt(limit)} ج.م` : 'غير محدد'}</div>
                  </div>
                </div>
              </div>

              {/* تصنيف العميل المعتمد من عمود قابل /غير في الشيت */}
              <div className={`p-4 rounded-2xl border transition-all ${
                isEligible
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-rose-50/90 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/60'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                      isEligible ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}>
                      {isEligible ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">تصنيف العميل (قابل / غير)</div>
                      <div className={`text-base font-black ${isEligible ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                        {eligibilityLabel}
                      </div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-black px-3 py-1 rounded-xl shrink-0 ${
                    isEligible
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/60'
                      : 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border border-rose-200/60'
                  }`}>
                    {isEligible ? '✓ مؤهل للتعامل' : '✕ غير مؤهل'}
                  </span>
                </div>
              </div>

              {/* حد الائتمان ومؤشر الاستخدام */}
              {limit > 0 && (
                <div className="tg-card p-4 bg-white dark:bg-[#131e36] border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-[#0b2337] dark:text-white flex items-center gap-1.5">
                      <CreditCard size={14} className="text-blue-600" />
                      استخدام الحد الائتماني
                    </span>
                    <span className={`text-[11px] font-black ${exceeded ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {usagePct}% {exceeded && '(تجاوز الحد)'}
                    </span>
                  </div>
                  <div className="tg-cp__meter">
                    <div
                      className="tg-cp__meter-fill"
                      style={{
                        width: `${usagePct}%`,
                        background: exceeded
                          ? 'linear-gradient(90deg,#fb7185,#e11d48)'
                          : 'linear-gradient(90deg,#34d399,#059669)',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <span>المستخدم: {fmt(balance + overdue)} ج.م</span>
                    <span>المتاح: {fmt(Math.max(0, limit - (balance + overdue)))} ج.م</span>
                  </div>
                </div>
              )}

              {/* بطاقة الموقع الجغرافي وتثبيت GPS */}
              <div className="tg-card p-4 bg-gradient-to-br from-emerald-50/60 to-blue-50/60 dark:from-slate-800 dark:to-slate-800/90 border border-emerald-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="tg-cp__section-title mb-0 text-[#0b2337] dark:text-white font-black">
                    <MapPin size={15} className="text-emerald-600 dark:text-emerald-400" />
                    تثبيت موقع العميل بالـ GPS (Google Maps)
                  </div>
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 bg-white dark:bg-slate-700 border border-blue-200 dark:border-slate-600 px-2.5 py-1 rounded-lg shadow-2xs"
                    >
                      <Navigation size={12} />
                      فتح في خرائط Google
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
                    {currentLat && currentLng ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[11px] font-mono font-bold" dir="ltr">
                            {Number(currentLat).toFixed(5)}, {Number(currentLng).toFixed(5)}
                          </span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-black">موقع مثبت</span>
                        </div>
                        {customer.locationCapturedBy && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            تم التثبيت بواسطة: {customer.locationCapturedBy}
                            {customer.locationCapturedAt && ` • ${new Date(customer.locationCapturedAt).toLocaleDateString('ar-EG')}`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-amber-800 dark:text-amber-300 font-bold">
                        لم يتم تثبيت إحداثيات موقع هذا العميل حتى الآن.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleVisitWithGps}
                    disabled={gpsLoading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer active:scale-95 disabled:opacity-60 shrink-0"
                  >
                    {gpsLoading ? <RefreshCw size={14} className="animate-spin" /> : <MapPin size={14} />}
                    <span>{gpsLoading ? 'جاري تحديد GPS...' : '📍 أخذ لوكيشن وتثبيت GPS الآن'}</span>
                  </button>
                </div>
              </div>

              {/* بيانات المركز والمسؤولين */}
              <div className="tg-card p-4 bg-white dark:bg-[#131e36] border border-slate-200 dark:border-slate-800">
                <div className="tg-cp__section-title text-[#0b2337] dark:text-white font-black">
                  <Building2 size={15} className="text-blue-600" />
                  بيانات العميل والمسؤولين
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <div className="tg-cp__row">
                    <span className="tg-cp__row-label">تصنيف الشيت (قابل / غير)</span>
                    <span className={`tg-cp__row-value font-black ${isEligible ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {eligibilityLabel}
                    </span>
                  </div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">المندوب المسؤول</span><span className="tg-cp__row-value truncate">{customer.salesRepName || customer.repName || 'غير محدد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">المشرف</span><span className="tg-cp__row-value truncate">{customer.supervisorName || customer.supervisor || 'غير محدد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">الفرع</span><span className="tg-cp__row-value">{customer.branchName || customer.branch || '—'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">الفئة</span><span className="tg-cp__row-value">{customer.tier || 'عادي'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">عدد الفواتير</span><span className="tg-cp__row-value">{customerInvoices.length} أمر بيع</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">عدد الزيارات</span><span className="tg-cp__row-value">{visits.length} زيارة</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">العنوان</span><span className="tg-cp__row-value truncate">{customer.address || customer.region || 'غير محدد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">المحافظة</span><span className="tg-cp__row-value truncate">{customer.governorate || 'غير محدد'}</span></div>
                </div>
              </div>

              {/* التنبيهات والرسائل */}
              {toast && (
                <div className={`tg-cp__toast ${toast.ok ? 'tg-cp__toast--ok' : 'tg-cp__toast--err'}`}>
                  {toast.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                  <span>{toast.text}</span>
                </div>
              )}
            </div>
          )}

          {/* التبويب 2: أوامر البيع والفواتير */}
          {tab === 'invoices' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="tg-cp__section-title mb-0">
                  <FileText size={15} className="text-blue-600" />
                  أوامر البيع والفواتير السابقة ({customerInvoices.length})
                </div>
                {onNewOrder && (
                  <button
                    type="button"
                    onClick={() => { onClose(); onNewOrder(customer); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black transition cursor-pointer shadow-sm"
                  >
                    <Plus size={13} />
                    فاتورة جديدة
                  </button>
                )}
              </div>

              {customerInvoices.length === 0 ? (
                <div className="tg-card p-8 text-center">
                  <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                    <FileText size={22} />
                  </div>
                  <p className="text-xs font-black text-slate-500 mb-2">لا توجد فواتير أو أوامر بيع مسجلة لهذا العميل</p>
                  {onNewOrder && (
                    <button
                      type="button"
                      onClick={() => { onClose(); onNewOrder(customer); }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                    >
                      <Plus size={14} />
                      إنشاء أول فاتورة للعميل
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {customerInvoices.map((inv) => {
                    const isApproved = inv.status === 'معتمدة ومصروفة من المخزن' || (inv.status as string) === 'معتمد';
                    const isPending = inv.status.includes('قيد') || inv.status.includes('معلقة') || inv.status.includes('انتظار');
                    const isPaid = inv.paymentMethod === 'نقدي (كاش)' || (inv as any).paymentStatus === 'مدفوع';

                    return (
                      <div
                        key={inv.id}
                        className="tg-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-300 transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              {inv.invoiceNumber}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {inv.date || new Date(inv.createdAt || '').toLocaleDateString('ar-EG')}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                              isApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              isPending ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {isApproved ? <CheckCircle2 size={10} /> : isPending ? <Clock size={10} /> : <AlertTriangle size={10} />}
                              {inv.status}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                              isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              <CreditCard size={10} />
                              {isPaid ? 'مدفوع' : 'غير مدفوع / آجل'}
                            </span>
                          </div>
                          <div className="text-[11px] font-bold text-slate-500">
                            {inv.items?.length || 0} صنف • {inv.totalCartons || 0} كرتونة • مندوب: {inv.repName || '—'}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="text-right sm:text-left">
                            <div className="text-sm font-black text-[#0b2337] tabular-nums">
                              {fmt(inv.estimatedGrandTotal || inv.totalAmount || 0)} ج.م
                            </div>
                            <div className="text-[9px] font-bold text-slate-400">القيمة الإجمالية</div>
                          </div>

                          {onViewInvoice && (
                            <button
                              type="button"
                              onClick={() => { onClose(); onViewInvoice(inv); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-bold transition cursor-pointer"
                            >
                              <Eye size={13} />
                              عرض
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* التبويب 3: التفاصيل المالية الشهرية */}
          {tab === 'months' && (
            <div className="space-y-4">
              <div className="tg-cp__section-title">
                <TrendingUp size={15} className="text-blue-600" />
                التفاصيل المالية الشهرية (مبيعات وتحصيل)
              </div>

              {monthly.length === 0 ? (
                <div className="tg-card p-8 text-center">
                  <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                    <TrendingUp size={22} />
                  </div>
                  <p className="text-xs font-black text-slate-500">لا توجد مبيعات مسجلة شهرياً لهذا العميل</p>
                </div>
              ) : (
                <>
                  <div className="tg-cp__months">
                    {monthly.map((r) => (
                      <div key={r.m} className="tg-cp__month">
                        <div className="tg-cp__month-label">{r.label}</div>
                        <div className="tg-cp__month-sales">{fmt(r.sales)} ج.م</div>
                        <div className="tg-cp__month-coll">{fmt(r.coll)} ج.م</div>
                        <div className="tg-cp__bar">
                          <div
                            className="tg-cp__bar-fill"
                            style={{ width: `${Math.max(6, Math.round((r.sales / monthlyMax) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="tg-card p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                        <div className="text-[10px] font-black text-blue-700">إجمالي مبيعات السنة</div>
                        <div className="text-base font-black text-blue-800 tabular-nums">{fmt(totalSales)} ج.م</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                        <div className="text-[10px] font-black text-emerald-700">إجمالي تحصيلات السنة</div>
                        <div className="text-base font-black text-emerald-800 tabular-nums">{fmt(totalColl)} ج.م</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* التبويب 4: الزيارات الميدانية */}
          {tab === 'visits' && (
            <div className="space-y-3">
              <div className="tg-cp__section-title">
                <CalendarCheck size={15} className="text-emerald-600" />
                سجل الزيارات الميدانية ({visits.length})
              </div>

              {visits.length === 0 ? (
                <div className="tg-card p-8 text-center">
                  <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                    <CalendarCheck size={22} />
                  </div>
                  <p className="text-xs font-black text-slate-500">لا توجد زيارات مسجلة لهذا العميل</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {visits.map((v: any, idx: number) => (
                    <div key={v.id || idx} className="tg-card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-[11px] font-black text-[#0b2337]">{v.date || '—'}</span>
                          <span className="text-[10px] font-bold text-slate-400">{v.time || ''}</span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                            {v.type || 'زيارة'}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 truncate">
                          {v.repName || '—'} • {v.outcome || v.status || 'منفذة'}
                        </div>
                        {v.notes && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {v.notes}
                          </div>
                        )}
                      </div>
                      {Number(v.collectedAmount || 0) > 0 && (
                        <div className="text-left shrink-0">
                          <div className="text-[11px] font-black text-emerald-700 tabular-nums">{fmt(v.collectedAmount)} ج.م</div>
                          <div className="text-[9px] font-bold text-slate-400">تحصيل</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* التبويب 5: تثبيت الموقع GPS */}
          {tab === 'gps' && (
            <div className="space-y-4">
              <div className="tg-cp__section-title">
                <MapPin size={15} className="text-emerald-600" />
                تثبيت الموقع الجغرافي وخرائط Google
              </div>

              <div className="tg-card p-5 space-y-4 text-center">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-inner">
                  <MapPin size={32} />
                </div>

                <div>
                  <h3 className="text-sm font-black text-[#0b2337]">
                    {currentLat && currentLng ? 'الموقع الجغرافي مثبت للعميل' : 'لم يتم تثبيت الموقع الجغرافي'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    اضغط على الزر أدناه أثناء تواجدك في مقر العميل لتسجيل الإحداثيات بدقة عبر نظام الملاحة وتسهيل وصول المناديب لاحقاً.
                  </p>
                </div>

                {currentLat && currentLng && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-start">
                    <div>
                      <div className="text-[10px] font-black text-slate-500">الإحداثيات الحالية</div>
                      <div className="font-mono text-xs font-black text-slate-800" dir="ltr">
                        {Number(currentLat).toFixed(6)}, {Number(currentLng).toFixed(6)}
                      </div>
                      {customer.locationCapturedBy && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          سجلها: {customer.locationCapturedBy}
                        </div>
                      )}
                    </div>
                    {googleMapsUrl && (
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition cursor-pointer shadow-sm"
                      >
                        <Navigation size={14} />
                        فتح في خرائط Google
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleVisitWithGps}
                  disabled={gpsLoading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white text-sm font-black shadow-lg shadow-emerald-600/25 transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {gpsLoading ? <RefreshCw size={18} className="animate-spin" /> : <MapPin size={18} />}
                  <span>{gpsLoading ? 'جاري الاتصال بالأقمار الصناعية وتحديد الإحداثيات...' : '📍 تثبيت موقع العميل بالـ GPS الآن'}</span>
                </button>
              </div>
            </div>
          )}

          {/* التبويب 6: صور المحل والتوثيق */}
          {tab === 'photos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="tg-cp__section-title mb-0">
                  <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <ImageIcon size={15} />
                  </span>
                  <span className="text-sm font-black text-[#0b2337]">صور المحل</span>
                  <span className="text-[10px] font-black bg-blue-600 text-white rounded-full px-2 py-0.5 tabular-nums">
                    {photosCount}/{MAX_PHOTOS}
                  </span>
                </div>
                {newFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black transition cursor-pointer disabled:opacity-60 shadow-sm"
                  >
                    {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                    {uploading ? 'جاري الرفع...' : `رفع ${newFiles.length}`}
                  </button>
                )}
              </div>

              <div className="tg-cp__gallery">
                {photos.map((url, idx) => (
                  <div key={`saved-${idx}`} className="tg-cp__photo group" onClick={() => setLightbox(url)}>
                    <img src={url} alt={`صورة ${idx + 1}`} loading="lazy" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeSavedPhoto(url); }}
                      className="tg-cp__photo-del"
                      title="حذف"
                    >
                      <Trash2 size={12} />
                    </button>
                    <span className="tg-cp__photo-tag">{idx === 0 ? 'الغلاف' : `صورة ${idx + 1}`}</span>
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Maximize2 size={11} />
                    </span>
                  </div>
                ))}

                {previews.map((src, idx) => (
                  <div key={`new-${idx}`} className="tg-cp__photo" style={{ borderColor: '#60a5fa', borderWidth: 2 }}>
                    <img src={src} alt={`معاينة ${idx + 1}`} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeNewFile(idx); }}
                      className="tg-cp__photo-del"
                      style={{ opacity: 1 }}
                      title="إزالة"
                    >
                      <X size={12} />
                    </button>
                    <span className="tg-cp__photo-tag" style={{ background: '#0891b2' }}>جديد</span>
                  </div>
                ))}

                {photosCount < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => document.getElementById('cust-photo-input-2')?.click()}
                    className="tg-cp__photo-add"
                  >
                    <Camera size={22} />
                    <span>إضافة صورة</span>
                  </button>
                )}
              </div>

              <input id="cust-photo-input-2" type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />

              {photosCount === 0 && (
                <p className="text-xs font-bold text-slate-700 text-center bg-white border border-dashed border-slate-300 rounded-2xl py-5">
                  لا توجد صور لهذا العميل — اضغط "إضافة صورة" لرفع صور المحل (حد {MAX_PHOTOS} صور)
                </p>
              )}

              <p className="text-[11px] font-bold text-slate-500 text-center leading-5">
                الصور تُضغط تلقائياً قبل الرفع لتقليل استهلاك البيانات على Cloudinary.
              </p>
            </div>
          )}
        </div>

        {/* ====== الأزرار السفلية الثابتة ====== */}
        <div className="tg-cp__foot">
          <button
            type="button"
            onClick={handleVisitWithGps}
            disabled={gpsLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition cursor-pointer shadow-sm active:scale-95 disabled:opacity-60"
            title="تسجيل زيارة وتثبيت GPS"
          >
            {gpsLoading ? <RefreshCw size={15} className="animate-spin" /> : <MapPin size={15} />}
            <span className="hidden sm:inline">تثبيت GPS</span>
          </button>

          {onNewOrder && (
            <button
              type="button"
              onClick={() => { onClose(); onNewOrder(customer); }}
              className="tg-cp__action tg-cp__action--primary flex-1"
            >
              <ShoppingCart size={15} />
              فاتورة جديدة للعميل
            </button>
          )}
        </div>
      </div>

      {/* ====== عارض الصور Lightbox ====== */}
      {lightbox && (
        <div className="tg-cp__lightbox" onClick={() => setLightbox(null)}>
          <button type="button" className="tg-cp__lightbox-close" onClick={() => setLightbox(null)} aria-label="إغلاق">
            <X size={20} />
          </button>
          <img src={lightbox} alt="صورة العميل" />
        </div>
      )}
    </div>
  );
};

export default CustomerProfileDrawer;
