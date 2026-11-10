import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon, Plus, X, Camera, RefreshCw, MapPin,
  AlertTriangle, CheckCircle2, Building2, ShoppingCart, Phone,
  TrendingUp, Wallet, CalendarCheck, Users, Maximize2, Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const MAX_PHOTOS = 3;
const MAX_IMAGE_WIDTH = 1000;
const IMAGE_QUALITY = 0.6;
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

interface CustomerProfileDrawerProps {
  customer: any;
  isOpen: boolean;
  onClose: () => void;
  onNewOrder?: (cust: any) => void;
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

type TabKey = 'overview' | 'months' | 'photos' | 'visits';

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
  customer,
  isOpen,
  onClose,
  onNewOrder,
}) => {
  const { currentUser, updateCustomer, cloudinaryConfig, addVisit, getVisibleVisits } = useApp();

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

  /* ---------- المبيعات والتحصيلات الشهرية ---------- */
  const monthly = useMemo(() => {
    const sales = customer?.monthlySales2026 || {};
    const coll = customer?.monthlyCollections2026 || {};
    const rows: { m: number; label: string; sales: number; coll: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const s = Number(sales[m] ?? sales[String(m)] ?? 0) || 0;
      const c = Number(coll[m] ?? coll[String(m)] ?? 0) || 0;
      if (s === 0 && c === 0) continue;
      rows.push({ m, label: MONTHS_AR[m - 1], sales: s, coll: c });
    }
    return rows;
  }, [customer]);

  const monthlyMax = useMemo(
    () => Math.max(1, ...monthly.map((r) => Math.max(r.sales, r.coll))),
    [monthly]
  );

  /* ---------- سجل الزيارات ---------- */
  const visits = useMemo(() => {
    if (!customer) return [];
    const history = Array.isArray(customer.visitHistory) ? customer.visitHistory : [];
    if (history.length > 0) return history.slice(0, 12);
    try {
      const all = getVisibleVisits ? getVisibleVisits() : [];
      return all
        .filter((v: any) => v.customerId === customer.id || v.customerCode === customer.code)
        .slice(0, 12);
    } catch {
      return [];
    }
  }, [customer, getVisibleVisits]);

  /* ---------- GPS ---------- */
  const requestGps = useCallback((): Promise<{ lat: number; lng: number; acc?: number } | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setToast({ ok: false, text: 'المتصفح لا يدعم تحديد الموقع' });
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
          setGps(coords);
          resolve(coords);
        },
        () => {
          setToast({ ok: false, text: 'تعذر تحديد الموقع — تأكد من السماح بالوصول لـ GPS' });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }, []);

  const handleVisitWithGps = async () => {
    if (!currentUser || !customer) return;
    setGpsLoading(true);
    const coords = await requestGps();
    if (!coords) {
      setGpsLoading(false);
      return;
    }

    const res = addVisit({
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      repId: currentUser.id,
      repName: currentUser.name,
      branchName: customer.branchName || currentUser.branchName,
      sector: customer.sector || 'all',
      supervisorId: currentUser.supervisorId,
      supervisorName: currentUser.supervisorName || 'المشرف',
      type: 'تحصيل',
      outcome: 'تم التحصيل',
      status: 'منفذة',
      collectedAmount: 0,
      notes: `زيارة ميدانية للعميل ${customer.name} — تثبيت الإحداثيات تلقائياً`,
      syncStatus: 'local_only',
    } as any);

    await updateCustomer({
      ...customer,
      latitude: coords.lat,
      longitude: coords.lng,
      locationAddress: customer.address || customer.region || customer.branchName || '',
      locationCapturedAt: new Date().toISOString(),
      locationCapturedBy: currentUser.name,
    });

    setGpsLoading(false);
    setToast({
      ok: Boolean(res?.success),
      text: res?.success
        ? `تم تسجيل زيارة ${customer.name} وتثبيت إحداثياته بنجاح`
        : res?.message || 'تم تثبيت الإحداثيات',
    });
    setTimeout(() => setToast(null), 4500);
  };

  /* ---------- الصور ---------- */
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) return;
    if (photos.length + newFiles.length + files.length > MAX_PHOTOS) {
      setToast({ ok: false, text: `الحد الأقصى ${MAX_PHOTOS} صور فقط للعميل الواحد` });
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
    setToast({ ok: true, text: 'تم حذف الصورة' });
    setTimeout(() => setToast(null), 2500);
  };

  const handleUpload = async () => {
    if (newFiles.length === 0) return;
    setUploading(true);
    try {
      const cloudName = cloudinaryConfig?.cloudName;
      const preset = cloudinaryConfig?.uploadPreset;
      if (!cloudName || !preset) {
        setUploading(false);
        setToast({ ok: false, text: 'إعدادات الرفع (Cloudinary) غير مفعّلة' });
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

  const balance = Number(customer.balance ?? customer.currentBalance ?? 0);
  const overdue = Number(customer.overdue ?? customer.overdueBalance ?? customer.totalOverdueAndDue ?? 0);
  const limit = Number(customer.creditLimit ?? 0);
  const exceeded = limit > 0 && (balance + overdue) > limit;
  const sector = customer.sector;
  const avatarTone = sector === 'home' ? 'home' : sector === 'electrical' ? 'electrical' : 'default';
  const totalSales = Number(customer.totalSales ?? customer.sales2026 ?? 0);
  const totalColl = Number(customer.totalCollections ?? customer.collections2026 ?? 0);
  const usagePct = limit > 0 ? Math.min(100, Math.round(((balance + overdue) / limit) * 100)) : 0;
  const photosCount = photos.length + newFiles.length;

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: 'نظرة عامة', icon: Building2 },
    { key: 'months', label: 'المبيعات الشهرية', icon: TrendingUp },
    { key: 'photos', label: 'صور المحل', icon: ImageIcon },
    { key: 'visits', label: 'الزيارات', icon: CalendarCheck },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-[#071726]/70 backdrop-blur-sm" onClick={(e) => e.stopPropagation()} />

      <div className="tg-cp" onClick={(e) => e.stopPropagation()}>
        {/* ====== هيدر مضغوط ====== */}
        <div className="tg-cp__head">
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
                  <img src={photos[0]} alt={customer.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{String(customer.name || '؟').charAt(0)}</span>
                )}
              </div>
              {photosCount > 1 && <span className="tg-cp__photos">+{photosCount - 1}</span>}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className={`tg-cp__badge ${
                  sector === 'home' ? 'tg-cp__badge--blue' : sector === 'electrical' ? 'tg-cp__badge--violet' : ''
                }`}>
                  {sector === 'home' ? 'منزلي' : sector === 'electrical' ? 'كهربائي' : 'عام'}
                </span>
                <span className={`tg-cp__badge ${exceeded ? 'tg-cp__badge--risk' : balance > 0 ? 'tg-cp__badge--warn' : 'tg-cp__badge--ok'}`}>
                  {exceeded ? 'تجاوز الحد' : balance > 0 ? 'عليه مستحق' : 'خالص'}
                </span>
              </div>
              <h2 className="tg-cp__name truncate">{customer.name}</h2>
              <div className="tg-cp__meta">
                <span className="font-mono">{customer.code || '—'}</span>
                <span>•</span>
                <span>{customer.branchName || customer.branch || '—'}</span>
                {customer.phone && customer.phone !== '—' && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Phone size={10} />
                      {customer.phone}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* شريط الإحصائيات */}
          <div className="tg-cp__stats">
            <div className="tg-cp__stat">
              <div className="tg-cp__stat-label">المديونية</div>
              <div className="tg-cp__stat-value">{fmt(balance)}</div>
            </div>
            <div className="tg-cp__stat">
              <div className="tg-cp__stat-label">المتأخرات</div>
              <div className="tg-cp__stat-value" style={{ color: overdue > 0 ? '#fecdd3' : '#a7f3d0' }}>
                {fmt(overdue)}
              </div>
            </div>
            <div className="tg-cp__stat">
              <div className="tg-cp__stat-label">المبيعات</div>
              <div className="tg-cp__stat-value" style={{ color: '#bfdbfe' }}>{fmt(totalSales)}</div>
            </div>
            <div className="tg-cp__stat">
              <div className="tg-cp__stat-label">التحصيل</div>
              <div className="tg-cp__stat-value" style={{ color: '#a7f3d0' }}>{fmt(totalColl)}</div>
            </div>
          </div>
        </div>

        {/* ====== التبويبات ====== */}
        <div className="tg-cp__tabs">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`tg-cp__tab ${tab === t.key ? 'tg-cp__tab--active' : ''}`}
              >
                <Icon size={13} />
                {t.label}
                {t.key === 'photos' && photosCount > 0 && (
                  <span className="text-[10px] opacity-75">({photosCount})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ====== المحتوى ====== */}
        <div className="tg-cp__body">
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* حد الائتمان */}
              {limit > 0 && (
                <div className="tg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-[#0b2337] flex items-center gap-1.5">
                      <Wallet size={14} className="text-blue-600" />
                      حد الائتمان
                    </span>
                    <span className={`text-[11px] font-black ${exceeded ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {usagePct}% مستخدم
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
                  <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-500">
                    <span>المستخدم: {fmt(balance + overdue)}</span>
                    <span>الحد: {fmt(limit)}</span>
                  </div>
                </div>
              )}

              {/* بيانات العميل */}
              <div className="tg-card p-4">
                <div className="tg-cp__section-title">
                  <Building2 size={15} className="text-blue-600" />
                  بيانات العميل
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <div className="tg-cp__row"><span className="tg-cp__row-label">المركز (المندوب)</span><span className="tg-cp__row-value truncate">{customer.salesRepName || customer.repName || 'غير محدد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">المشرف</span><span className="tg-cp__row-value truncate">{customer.supervisorName || customer.supervisor || 'غير محدد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">الفئة</span><span className="tg-cp__row-value">{customer.tier || 'عادي'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">آخر زيارة</span><span className="tg-cp__row-value">{customer.lastVisitDate || customer.lastVisit || 'لا يوجد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">آخر تحصيل</span><span className="tg-cp__row-value">{customer.lastCollectionDate || 'لا يوجد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">عدد الزيارات</span><span className="tg-cp__row-value">{customer.visitCount2026 ?? visits.length}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">العنوان</span><span className="tg-cp__row-value truncate">{customer.address || customer.region || 'غير محدد'}</span></div>
                  <div className="tg-cp__row"><span className="tg-cp__row-label">المحافظة</span><span className="tg-cp__row-value truncate">{customer.governorate || 'غير محدد'}</span></div>
                </div>
              </div>

              {/* الموقع */}
              <div className="tg-card p-4">
                <div className="tg-cp__section-title">
                  <MapPin size={15} className="text-emerald-600" />
                  الموقع الجغرافي
                </div>
                {gps ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                    <span className="text-[11px] font-black text-emerald-800 font-mono" dir="ltr">
                      {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                    </span>
                    {gps.acc != null && (
                      <span className="text-[10px] font-bold text-emerald-600">±{Math.round(gps.acc)}م</span>
                    )}
                  </div>
                ) : customer.latitude ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                    <span className="text-[11px] font-black text-slate-700 font-mono" dir="ltr">
                      {Number(customer.latitude).toFixed(5)}, {Number(customer.longitude).toFixed(5)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">مثبّت سابقاً</span>
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-slate-500">
                    اضغط زر الموقع لتثبيت إحداثيات العميل تلقائياً.
                  </p>
                )}
              </div>

              {/* الرسالة */}
              {toast && (
                <div className={`tg-cp__toast ${toast.ok ? 'tg-cp__toast--ok' : 'tg-cp__toast--err'}`}>
                  {toast.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                  <span>{toast.text}</span>
                </div>
              )}
            </div>
          )}

          {tab === 'months' && (
            <div className="space-y-4">
              <div className="tg-cp__section-title">
                <TrendingUp size={15} className="text-blue-600" />
                المبيعات والتحصيلات شهرياً
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
                        <div className="tg-cp__month-sales">{fmt(r.sales)}</div>
                        <div className="tg-cp__month-coll">{fmt(r.coll)}</div>
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
                        <div className="text-base font-black text-blue-800 tabular-nums">{fmt(totalSales)}</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                        <div className="text-[10px] font-black text-emerald-700">إجمالي تحصيلات السنة</div>
                        <div className="text-base font-black text-emerald-800 tabular-nums">{fmt(totalColl)}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'photos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="tg-cp__section-title mb-0">
                  <ImageIcon size={15} className="text-blue-600" />
                  صور المحل ({photosCount}/{MAX_PHOTOS})
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
                <p className="text-[11px] font-bold text-slate-500 text-center bg-white border border-dashed border-slate-200 rounded-2xl py-5">
                  لا توجد صور لهذا العميل — اضغط "إضافة صورة" لرفع صور المحل (حد {MAX_PHOTOS} صور)
                </p>
              )}

              <p className="text-[10px] font-bold text-slate-400 text-center leading-5">
                الصور تُضغط تلقائياً قبل الرفع (عرض {MAX_IMAGE_WIDTH}px، جودة {IMAGE_QUALITY * 100}%) لتقليل استهلاك البيانات والمساحة على Cloudinary.
                <br />
                اضغط على أي صورة لعرضها بالحجم الكامل.
              </p>
            </div>
          )}

          {tab === 'visits' && (
            <div className="space-y-3">
              <div className="tg-cp__section-title">
                <CalendarCheck size={15} className="text-emerald-600" />
                سجل الزيارات ({visits.length})
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
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] font-black text-[#0b2337]">{v.date || '—'}</span>
                          <span className="text-[10px] font-bold text-slate-400">{v.time || ''}</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 truncate">
                          {v.repName || '—'} • {v.outcome || v.status || '—'}
                        </div>
                      </div>
                      {Number(v.collectedAmount || 0) > 0 && (
                        <div className="text-left shrink-0">
                          <div className="text-[11px] font-black text-emerald-700 tabular-nums">{fmt(v.collectedAmount)}</div>
                          <div className="text-[9px] font-bold text-slate-400">تحصيل</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ====== الأزرار السفلية ====== */}
        <div className="tg-cp__foot">
          <button
            type="button"
            onClick={handleVisitWithGps}
            disabled={gpsLoading}
            className="tg-gps-btn"
            title={gpsLoading ? 'جاري تحديد الموقع...' : 'تسجيل زيارة + تثبيت الموقع'}
            aria-label="تسجيل زيارة وتثبيت الموقع"
          >
            {gpsLoading ? <RefreshCw size={17} className="animate-spin" /> : <MapPin size={17} />}
          </button>

          <button
            type="button"
            onClick={() => { onClose(); onNewOrder?.(customer); }}
            className="tg-cp__action tg-cp__action--primary"
          >
            <ShoppingCart size={15} />
            فاتورة جديدة
          </button>
        </div>
      </div>

      {/* ====== Lightbox ====== */}
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
