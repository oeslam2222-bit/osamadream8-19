import React, { useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Clock,
  Plus,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Calendar,
  RotateCcw,
  Wallet,
  Search,
  Filter,
  RotateCw,
  Building2,
  UserCheck,
  DollarSign,
  Tag,
  ArrowUpDown,
  Phone,
  FileText,
  ExternalLink,
  Navigation2,
  Crosshair,
  Compass,
  Camera,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { normalizeCloudinaryConfig, optimizeImageUrl, uploadImageToCloudinary } from '../services/cloudinaryService';
import defaultStoreAvatar from '../assets/images/store_avatar_1794558443874.jpg';
import {
  calculateDistanceMeters,
  formatDistance,
  canManageLocationLock,
  requestLiveGps,
  verifyVisitLocation,
  watermarkAndCompressLivePhoto,
  geoStatusBadgeMeta,
  LiveGpsReading,
} from '../services/geoVerificationService';
import type { Customer, CustomerVisit } from '../types';
import { EmptyState } from './ui/EmptyState';

const resolveStoreAvatar = (customer?: Partial<Customer> | null): string => {
  const uploaded =
    customer?.locationPhotoUrl ||
    customer?.storePhotos?.[0] ||
    customer?.profileImageUrl ||
    customer?.avatarUrl ||
    '';
  return uploaded ? optimizeImageUrl(uploaded, 160, true) : defaultStoreAvatar;
};

const onStoreAvatarError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.dataset.fallback) {
    img.dataset.fallback = '1';
    img.src = defaultStoreAvatar;
  }
};

const SIMPLE_VISIT_TYPES: { id: string; label: string; color: string }[] = [
  { id: 'دورية', label: 'زيارة دورية', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  { id: 'تحصيل', label: 'زيارة تحصيل', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  { id: 'طلب بيع', label: 'طلب بيع وتوريد', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
  { id: 'متابعة', label: 'متابعة حساب', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
];

interface VisitForm {
  customerId: string;
  customerName: string;
  customerCode: string;
  repId: string;
  date: string;
  time: string;
  type: string;
  collectedAmount: number;
  notes: string;
}

export const VisitsDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    cloudinaryConfig,
    getVisibleVisits,
    getVisibleCustomers,
    addVisit,
    updateVisit,
    updateCustomer,
  } = useApp();

  // استبعاد المرتجعات تماماً من شاشة الزيارات لأن طلب المرتجع له دورته المستقلة
  const getVisibleVisitsSafe = (): CustomerVisit[] => {
    const v = getVisibleVisits();
    const arr = Array.isArray(v) ? v : [];
    return arr.filter(
      (visit) =>
        !visit.isReturn &&
        visit.type !== 'مرتجع' &&
        visit.type !== 'فاتورة مرتجع لدي العميل' &&
        visit.outcome !== 'مرتجع لدي العميل' &&
        !visit.returnStatus
    );
  };
  const visits: CustomerVisit[] = getVisibleVisitsSafe();

  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'منفذة' | 'معلقة' | 'ملغاة'>('all');
  const [geoFilter, setGeoFilter] = useState<'all' | 'verified' | 'flagged'>('all');
  const [repFilter, setRepFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<'all' | 'home' | 'electrical'>('all');
  const VISITS_CHUNK = 10;
  const [visibleVisitsCount, setVisibleVisitsCount] = useState(VISITS_CHUNK);

  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));

  // Geolocation & Geofencing states
  const [repGps, setRepGps] = useState<LiveGpsReading | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string>('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const canApproveLocations = canManageLocationLock(currentUser?.role);

  const initialForm: VisitForm = {
    customerId: '',
    customerName: '',
    customerCode: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: todayStr,
    time: '09:00',
    type: 'تحصيل',
    collectedAmount: 0,
    notes: '',
  };

  const [form, setForm] = useState<VisitForm>(initialForm);

  // بحث وفلترة العملاء داخل مودال تسجيل الزيارة
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerRepFilter, setCustomerRepFilter] = useState('all');

  const myCustomers = useMemo(() => {
    return getVisibleCustomers();
  }, [customers, users, currentUser, getVisibleCustomers]);

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => {
      if (c.id) map.set(c.id, c);
      if (c.code) map.set(`code:${c.code}`, c);
    });
    return map;
  }, [customers]);

  const findCustomerForVisit = (v: Pick<CustomerVisit, 'customerId' | 'customerCode'>): Customer | null => {
    if (v.customerId && customerMap.has(v.customerId)) return customerMap.get(v.customerId)!;
    if (v.customerCode && customerMap.has(`code:${v.customerCode}`)) return customerMap.get(`code:${v.customerCode}`)!;
    return null;
  };

  const selectedCustomerObj = useMemo(() => {
    if (!form.customerId) return null;
    return myCustomers.find((c) => c.id === form.customerId) || null;
  }, [form.customerId, myCustomers]);

  // المناديب المتاحين للفلترة من قائمة العملاء
  const customerRepOptions = useMemo(() => {
    const reps = new Set<string>();
    myCustomers.forEach((c) => {
      const rep = c.salesRepName || c.repName;
      if (rep) reps.add(rep);
    });
    return Array.from(reps);
  }, [myCustomers]);

  // العملاء المطابقون للبحث (اسم/كود) وفلتر المندوب
  const filteredModalCustomers = useMemo(() => {
    let list = myCustomers;
    if (customerRepFilter !== 'all') {
      list = list.filter((c) => (c.salesRepName || c.repName) === customerRepFilter);
    }
    const q = customerSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [myCustomers, customerSearch, customerRepFilter]);

  // Request Rep live GPS position (maximumAge: 0 prohibits stale cache)
  const requestCurrentRepGps = async (): Promise<LiveGpsReading | null> => {
    setIsCapturingGps(true);
    const res = await requestLiveGps(12000);
    setIsCapturingGps(false);
    if (!res.ok) {
      setGpsNotice('error' in res ? res.error : 'تعذر التقاط الموقع');
      return null;
    }
    setRepGps(res.coords);
    setGpsNotice(null);
    return res.coords;
  };

  useEffect(() => {
    if (showForm) {
      setProofPhotoUrl('');
      setFormErrors([]);
      setGpsNotice(null);
      requestCurrentRepGps().catch(() => {});
    }
  }, [showForm]);

  const liveGeoCheck = useMemo(() => {
    return verifyVisitLocation({
      repGps,
      customer: selectedCustomerObj,
      repVisits: visits,
      repId: form.repId || currentUser?.id,
    });
  }, [repGps, selectedCustomerObj, visits, form.repId, currentUser?.id]);

  const handleCaptureProofPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedCustomerObj) return;
    setIsUploadingProof(true);
    setGpsNotice(null);
    try {
      const stamped = await watermarkAndCompressLivePhoto(file, {
        customerName: selectedCustomerObj.name,
        repName: currentUser?.name || 'المندوب',
        latitude: repGps?.latitude,
        longitude: repGps?.longitude,
        distanceMeters: liveGeoCheck.distanceMeters,
        reason: liveGeoCheck.status === 'outside_range' ? 'خارج النطاق' : 'إثبات ميداني',
      });
      const cfg = normalizeCloudinaryConfig(cloudinaryConfig);
      const uploaded = await uploadImageToCloudinary(stamped, cfg, 'tantawy_visit_proofs');
      setProofPhotoUrl(uploaded.url);
    } catch (err: any) {
      setGpsNotice(err?.message || 'تعذر رفع صورة الإثبات الميداني');
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Pin customer GPS into customer record (respecting supervisor lock)
  const handlePinCustomerLocation = async () => {
    if (!selectedCustomerObj) return;
    if (selectedCustomerObj.locationLocked && !canApproveLocations) {
      setGpsNotice('موقع العميل معتمد ومقفل 🔒 من المشرف ولا يمكن تغييره من حساب المندوب.');
      return;
    }
    setGpsNotice('جاري قراءة الأقمار الصناعية وتحديد موقع المتجر بدقة...');
    const coords = await requestCurrentRepGps();
    if (!coords) return;

    const updatedCustomer: Customer = {
      ...selectedCustomerObj,
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationAccuracy: coords.accuracy,
      locationAddress: selectedCustomerObj.address || selectedCustomerObj.region || selectedCustomerObj.branchName || '',
      locationCapturedAt: coords.timestamp,
      locationCapturedBy: currentUser?.name || 'المندوب',
      locationPhotoUrl: proofPhotoUrl || selectedCustomerObj.locationPhotoUrl,
      locationLocked: canApproveLocations ? true : Boolean(selectedCustomerObj.locationLocked),
      locationApprovedBy: canApproveLocations ? (currentUser?.name || 'المشرف') : selectedCustomerObj.locationApprovedBy,
      locationApprovedAt: canApproveLocations ? coords.timestamp : selectedCustomerObj.locationApprovedAt,
    };

    updateCustomer(updatedCustomer);
    setGpsNotice(
      canApproveLocations
        ? `تم تثبيت واعتماد وقفل موقع ${selectedCustomerObj.name} بنجاح 🔒`
        : `تم تثبيت موقع ${selectedCustomerObj.name} (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}) — بانتظار اعتماد المشرف للقفل`
    );
  };

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (!form.customerId) errors.push('يرجى اختيار العميل');
    if (form.type === 'تحصيل' && form.collectedAmount <= 0) errors.push('يرجى إدخال مبلغ التحصيل');
    if (selectedCustomerObj && !repGps && !proofPhotoUrl && currentUser?.role === 'sales_rep') {
      errors.push('يرجى تفعيل GPS لالتقاط موقعك الحي أو التقاط صورة حية لواجهة المحل بالكاميرا');
    }
    if (liveGeoCheck.requiresLivePhoto && !proofPhotoUrl) {
      errors.push(
        liveGeoCheck.status === 'suspected_spoof'
          ? 'تم رصد اشتباه في إشارة الـ GPS — يرجى التقاط صورة حية لواجهة المحل بالكاميرا للمتابعة'
          : `أنت خارج نطاق المتجر (${formatDistance(liveGeoCheck.distanceMeters ?? 0)}) — يرجى التقاط صورة حية للمحل بالكاميرا للتوثيق`
      );
    }
    setFormErrors(errors);
    return errors.length === 0;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateForm()) return;

    const r = users.find((u) => u.id === form.repId);
    const c = myCustomers.find((x) => x.id === form.customerId);

    // STRICT ANTI-SPOOF: Never silently copy customer coordinates when rep GPS is missing
    const visitLocation = repGps
      ? {
          latitude: repGps.latitude,
          longitude: repGps.longitude,
          accuracy: repGps.accuracy,
          timestamp: repGps.timestamp,
          address: c?.address || c?.region || '',
          mapUrl: `https://www.google.com/maps/search/?api=1&query=${repGps.latitude},${repGps.longitude}`,
        }
      : undefined;

    const finalGeoVerification = {
      status: liveGeoCheck.status,
      distanceMeters: liveGeoCheck.distanceMeters,
      accuracyMeters: liveGeoCheck.accuracyMeters,
      speedKmh: liveGeoCheck.speedKmh,
      flags: liveGeoCheck.flags,
      proofPhotoUrl: proofPhotoUrl || undefined,
      verifiedAt: liveGeoCheck.verifiedAt,
    };

    const result = addVisit({
      customerId: form.customerId,
      customerName: c?.name || form.customerName || '',
      customerCode: c?.code || form.customerCode || '',
      date: form.date,
      time: form.time,
      repId: r?.id || currentUser?.id || '',
      repName: r?.name || currentUser?.name || '',
      branchName: r?.branchName || c?.branchName || '',
      sector: r?.sector || c?.sector || currentUser?.sector || undefined,
      supervisorId: r?.supervisorId,
      supervisorName: r?.supervisorName || '',
      status: 'منفذة',
      type: form.type as any,
      outcome:
        form.type === 'تحصيل'
          ? 'تم التحصيل'
          : form.type === 'طلب بيع'
          ? 'تم عمل طلبية'
          : 'متابعة فقط',
      collectedAmount: form.collectedAmount,
      notes: form.notes,
      location: visitLocation,
      geoVerification: finalGeoVerification,
      reviewStatus: liveGeoCheck.requiresSupervisorReview ? 'pending' : 'approved',
    });

    if (!result.success) {
      setFlash({ tone: 'error', text: result.message });
      return;
    }

    setFlash({
      tone: 'success',
      text: liveGeoCheck.requiresSupervisorReview
        ? 'تم تسجيل الزيارة وإرسالها لمراجعة المشرف بسبب التحقق الجغرافي ⚠️'
        : 'تم تسجيل الزيارة وتوثيق الموقع بنجاح ✅',
    });
    setTimeout(() => setFlash(null), 4000);

    setShowForm(false);
    setForm(initialForm);
    setFormErrors([]);
    setProofPhotoUrl('');
  };

  // Filter pipeline
  const filtered = useMemo(() => {
    let result = visits;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (v) =>
          v.customerName?.toLowerCase().includes(q) ||
          v.customerCode?.toLowerCase().includes(q) ||
          v.repName?.toLowerCase().includes(q) ||
          v.branchName?.toLowerCase().includes(q) ||
          v.notes?.toLowerCase().includes(q)
      );
    }

    const now = new Date();
    if (timeFilter === 'today') {
      const today = now.toISOString().slice(0, 10);
      result = result.filter((v) => v.date === today);
    } else if (timeFilter === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      result = result.filter((v) => new Date(v.date) >= weekAgo);
    } else if (timeFilter === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      result = result.filter((v) => new Date(v.date) >= monthAgo);
    }

    if (typeFilter !== 'all') {
      result = result.filter((v) => {
        const t = v.type || '';
        if (typeFilter === 'تحصيل') return t.includes('تحصيل');
        if (typeFilter === 'طلب بيع') return t.includes('طلب بيع') || t.includes('بيغ') || v.outcome?.includes('طلبية');
        if (typeFilter === 'دورية') return t.includes('دورية');
        if (typeFilter === 'متابعة') return t.includes('متابعة');
        return t === typeFilter;
      });
    }

    if (statusFilter !== 'all') {
      result = result.filter((v) => {
        if (statusFilter === 'معلقة') {
          return (v.status as string) === 'معلقة' || v.status === 'مجدولة' || v.status === 'لم تتم';
        }
        return (v.status as string) === statusFilter;
      });
    }

    if (repFilter !== 'all') {
      result = result.filter((v) => v.repName === repFilter || v.repId === repFilter);
    }

    // Sector filter
    const userSector = currentUser?.sector;
    const effectiveSector =
      sectorFilter !== 'all'
        ? sectorFilter
        : userSector === 'home' || userSector === 'electrical'
        ? userSector
        : undefined;

    if (effectiveSector) {
      const sectorRepIds = new Set(
        users
          .filter((u) => u.sector === effectiveSector)
          .map((u) => u.id)
      );
      result = result.filter(
        (v) => v.sector === effectiveSector || (v.repId && sectorRepIds.has(v.repId))
      );
    }

    if (geoFilter === 'verified') {
      result = result.filter((v) => v.geoVerification?.status === 'verified' || (v.location?.latitude && v.geoVerification?.status !== 'outside_range' && v.geoVerification?.status !== 'suspected_spoof'));
    } else if (geoFilter === 'flagged') {
      result = result.filter(
        (v) =>
          v.geoVerification?.status === 'outside_range' ||
          v.geoVerification?.status === 'suspected_spoof' ||
          v.geoVerification?.status === 'low_accuracy' ||
          v.reviewStatus === 'pending'
      );
    }

    return result;
  }, [
    visits,
    search,
    timeFilter,
    typeFilter,
    statusFilter,
    geoFilter,
    repFilter,
    sectorFilter,
    currentUser?.sector,
    users,
  ]);

  // Statistics
  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((v) => v.status === 'منفذة').length;
    const gpsVerified = filtered.filter(
      (v) => v.geoVerification?.status === 'verified' || Boolean(v.location?.latitude && v.location?.longitude)
    ).length;
    const flaggedCount = visits.filter(
      (v) =>
        v.geoVerification?.status === 'outside_range' ||
        v.geoVerification?.status === 'suspected_spoof' ||
        v.reviewStatus === 'pending'
    ).length;
    const collectionVisits = filtered.filter(
      (v) => v.type?.includes('تحصيل') || Number(v.collectedAmount || 0) > 0
    );
    const totalCollected = collectionVisits.reduce(
      (s, v) => s + Number(v.collectedAmount || 0),
      0
    );

    return {
      total,
      completed,
      gpsVerified,
      flaggedCount,
      collectionCount: collectionVisits.length,
      totalCollected,
    };
  }, [filtered, visits]);

  const paginated = filtered.slice(0, visibleVisitsCount);

  useEffect(() => {
    setVisibleVisitsCount(VISITS_CHUNK);
  }, [search, timeFilter, typeFilter, statusFilter, geoFilter, repFilter, sectorFilter, visits.length]);

  const repOptions = useMemo(() => {
    const reps = [...new Set(visits.map((v) => v.repName).filter(Boolean))];
    return reps;
  }, [visits]);

  const hasActiveFilters =
    search.trim() !== '' ||
    timeFilter !== 'month' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    geoFilter !== 'all' ||
    repFilter !== 'all' ||
    sectorFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setTimeFilter('month');
    setTypeFilter('all');
    setStatusFilter('all');
    setGeoFilter('all');
    setRepFilter('all');
    setSectorFilter('all');
  };

  return (
    <div className="tg-dash space-y-4" dir="rtl">
      {/* Flash message (توحيد مع tg-toast) */}
      {flash && (
        <div className="tg-toast">
          <div className={`tg-toast-item tg-toast--${flash.tone === 'success' ? 'ok' : 'err'}`}>
            {flash.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{flash.text}</span>
            <button onClick={() => setFlash(null)} className="ml-auto text-white/80 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* الهيدر — هوية التطبيق */}
      <section className="ds-pagehead">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              رئيسية <span className="mx-1 text-[#7fc0ff]">›</span> الزيارات الميدانية
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 flex-wrap">
                  لوحة الزيارات
                  <span className="inline-flex items-center rounded-full bg-white/15 border border-white/20 px-2.5 py-0.5 text-[11px] font-black text-white">
                    {filtered.length} زيارة
                  </span>
                </h1>
                <p className="text-xs text-[#c3d9ec] mt-0.5">متابعة الزيارات الميدانية والتحصيلات وتوثيق المواقع لفرق المبيعات.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-black px-3.5 py-2.5 text-xs transition cursor-pointer"
              title="إعادة تعيين الفلاتر"
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden sm:inline">تحديث</span>
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 text-xs shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل زيارة جديدة</span>
            </button>
          </div>
        </div>
      </section>

      {/* بطاقات المؤشرات — التصميم الجديد (كروت ملونة، أرقام كبيرة) */}
      <section className="tg-grid-4">
        <button type="button" className="tg-kpi-big tg-kpi-big--visits group cursor-pointer">
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--visits"><Calendar size={20} /></span>
          </div>
          <span className="tg-kpi-big__value">{stats.total.toLocaleString()}</span>
          <span className="tg-kpi-big__label">إجمالي الزيارات</span>
          <span className="tg-kpi-big__hint">زيارة مسجلة بالمنظومة</span>
        </button>

        <button type="button" className="tg-kpi-big tg-kpi-big--sales group cursor-pointer">
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--sales"><CheckCircle2 size={20} /></span>
          </div>
          <span className="tg-kpi-big__value">{stats.completed.toLocaleString()}</span>
          <span className="tg-kpi-big__label">الزيارات المنفذة</span>
          <span className="tg-kpi-big__hint">زيارات ناجحة ومكتملة</span>
        </button>

        <button type="button" className="tg-kpi-big tg-kpi-big--customers group cursor-pointer">
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--customers"><MapPin size={20} /></span>
          </div>
          <span className="tg-kpi-big__value">{stats.gpsVerified.toLocaleString()}</span>
          <span className="tg-kpi-big__label">زيارات موثقة (GPS)</span>
          <span className="tg-kpi-big__hint">نسبة التوثيق: {stats.total > 0 ? Math.round((stats.gpsVerified / stats.total) * 100) : 0}%</span>
        </button>

        <button type="button" className="tg-kpi-big tg-kpi-big--invoices group cursor-pointer">
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--invoices"><Wallet size={20} /></span>
          </div>
          <span className="tg-kpi-big__value">{formatCurrency(stats.totalCollected)}</span>
          <span className="tg-kpi-big__label">التحصيلات</span>
          <span className="tg-kpi-big__hint">{stats.collectionCount} عملية تحصيل مسجلة</span>
        </button>
      </section>

      {/* Filter and Search Bar */}
      <section className="tg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Main search input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder="ابحث بالاسم، كود العميل، المندوب، الفرع، أو الملاحظات..."
              className="tg-input pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setTimeFilter('today');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'today'
                  ? 'bg-white text-[#0b2337] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter('week');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'week'
                  ? 'bg-white text-[#0b2337] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              هذا الأسبوع
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter('month');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'month'
                  ? 'bg-white text-[#0b2337] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              آخر شهر
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'all'
                  ? 'bg-white text-[#0b2337] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              كل الفترات
            </button>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 pt-3 border-t border-[var(--tg-line)] text-xs">
          {/* Visit Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع الزيارة</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
              }}
              className="tg-select"
            >
              <option value="all">كل الأنواع</option>
              <option value="تحصيل">تحصيل 💰</option>
              <option value="دورية">زيارة دورية 📋</option>
              <option value="طلب بيع">طلب بيع وتوريد 📦</option>
              <option value="متابعة">متابعة حساب 👥</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">الحالة</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
              }}
              className="tg-select"
            >
              <option value="all">كل الحالات</option>
              <option value="منفذة">منفذة ✅</option>
              <option value="معلقة">معلقة / مجدولة ⏳</option>
              <option value="ملغاة">ملغاة ❌</option>
            </select>
          </div>

          {/* Sector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">القطاع</label>
            <select
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value as any);
              }}
              className="tg-select"
            >
              <option value="all">كل القطاعات</option>
              <option value="home">منزلي 🏠</option>
              <option value="electrical">كهرباء ⚡</option>
            </select>
          </div>

          {/* Sales Rep */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">المندوب</label>
            <select
              value={repFilter}
              onChange={(e) => {
                setRepFilter(e.target.value);
              }}
              className="tg-select"
            >
              <option value="all">كل المناديب</option>
              {repOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Geo Verification Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">توثيق الموقع (GPS)</label>
            <select
              value={geoFilter}
              onChange={(e) => setGeoFilter(e.target.value as any)}
              className="tg-select"
            >
              <option value="all">كل الزيارات</option>
              <option value="verified">موثقة بالنطاق ✅</option>
              <option value="flagged">تحتاج مراجعة ({stats.flaggedCount}) ⚠️</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end col-span-2 sm:col-span-1">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="w-full h-[38px] rounded-xl border border-[var(--tg-line)] bg-white text-[#0b2337] font-bold hover:bg-[#f1f5f9] transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>مسح الفلاتر</span>
              </button>
            ) : (
              <div className="w-full h-[38px] flex items-center justify-center text-[var(--tg-muted)] font-medium text-[11px]">
                جميع الفلاتر افتراضية
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Results Container */}
      <div className="space-y-4">
        {/* Count Bar */}
        <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
          <span>
            عرض {paginated.length} من أصل {filtered.length} زيارة مطابقة
          </span>
        </div>

        {/* 1. Desktop & Laptop View: Table موحد (مخفي على الموبايل/التابلت) */}
        <div className="hidden lg:block w-full overflow-hidden rounded-[28px] border border-[var(--tg-line)] bg-white shadow-sm">
          <table className="tg-table w-full text-right text-xs">
            <thead className="bg-[var(--tg-card-2)] text-[#0f172a] font-black sticky top-0 z-10">
              <tr>
                <th className="w-12">#</th>
                <th>العميل والمنطقة</th>
                <th className="w-28">كود العميل</th>
                <th className="w-36">تاريخ وتوقيت الزيارة</th>
                <th className="text-center w-28">نوع الزيارة</th>
                <th className="w-28">المبلغ المحصل</th>
                <th className="text-center w-24">القطاع</th>
                <th className="w-32">المندوب</th>
                <th className="text-center w-24">الحالة</th>
                <th className="text-center w-24">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((v, idx) => {
                const globalIdx = idx + 1;
                const isCollection = v.type?.includes('تحصيل') || Number(v.collectedAmount || 0) > 0;
                const isReturn = v.type?.includes('مرتجع') || v.outcome?.includes('مرتجع');

                return (
                  <tr
                    key={v.id || idx}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition group cursor-pointer"
                    onClick={() => setSelectedVisit(v)}
                  >
                    <td className="p-3 text-center font-black text-slate-600">
                      {globalIdx}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={resolveStoreAvatar(findCustomerForVisit(v))}
                          alt={v.customerName || 'متجر العميل'}
                          referrerPolicy="no-referrer"
                          onError={onStoreAvatarError}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 bg-slate-50 shadow-xs shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 dark:text-white text-sm group-hover:text-[#2563eb] transition truncate">
                            {v.customerName || 'عميل بدون اسم'}
                          </div>
                          <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{v.branchName || 'فرع الشركة'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-[#f1f5f9] text-[#0b2337] font-mono text-[11px] font-black border border-[var(--tg-line)]">
                        {v.customerCode || '—'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{v.date}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{v.time || '09:00 ص'}</span>
                      </div>
                    </td>

                    <td>
                      <span className={`tg-badge tg-badge--${isCollection ? 'ok' : isReturn ? 'risk' : 'blue'}`}>
                        {v.type || 'دورية'}
                      </span>
                    </td>

                    <td className="p-3 text-right font-black">
                      {isCollection && Number(v.collectedAmount || 0) > 0 ? (
                        <div className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm">
                          {formatCurrency(Number(v.collectedAmount))} <span className="text-[10px] font-normal">ج.م</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="text-center">
                      <span className={`tg-badge tg-badge--${v.sector === 'electrical' ? 'warn' : 'blue'}`}>
                        {v.sector === 'electrical' ? '⚡ كهرباء' : '🏠 منزلي'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                        {v.repName || 'مندوب الفرع'}
                      </div>
                    </td>

                    <td className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`tg-badge tg-badge--${v.status === 'منفذة' ? 'ok' : (v.status as string) === 'معلقة' || v.status === 'مجدولة' || v.status === 'لم تتم' ? 'warn' : 'gray'}`}>
                          {v.status || 'منفذة'}
                        </span>
                        {v.geoVerification?.status && (() => {
                          const meta = geoStatusBadgeMeta(v.geoVerification.status);
                          return (
                            <span className={`tg-badge tg-badge--${meta.tone}`}>
                              {meta.label}
                              {v.geoVerification.distanceMeters !== undefined ? ` (${formatDistance(v.geoVerification.distanceMeters)})` : ''}
                            </span>
                          );
                        })()}
                      </div>
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelectedVisit(v)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-[#1d4ed8] bg-[#eff6ff] border border-[#bfdbfe] hover:bg-[#dbeafe] transition active:scale-95 cursor-pointer shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {paginated.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center">
                    <EmptyState
                      type="visits"
                      title="لا توجد زيارات مسجلة"
                      description="لم يتم العثور على أي زيارات مطابقة للبحث أو الفلاتر المحددة."
                      action={
                        <button
                          type="button"
                          onClick={() => setShowForm(true)}
                          className="px-5 py-2.5 rounded-2xl bg-[#0b2337] hover:bg-[#123a52] text-white font-black text-xs transition active:scale-95 inline-flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>تسجيل زيارة جديدة الآن</span>
                        </button>
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 2. Mobile & Tablet Card Layout (Optimized for touches, readable Arabic typography) */}
        <div className="lg:hidden space-y-3">
          {paginated.map((v, idx) => {
            const isCollection = v.type?.includes('تحصيل') || Number(v.collectedAmount || 0) > 0;
            const isReturn = v.type?.includes('مرتجع') || v.outcome?.includes('مرتجع');

            return (
              <div
                key={v.id || idx}
                className="tg-card p-4 sm:p-5 space-y-3 active:scale-[0.99] transition"
                onClick={() => setSelectedVisit(v)}
              >
                {/* Header: Customer Store Avatar + Name + Status Badge */}
                <div className="flex items-start justify-between gap-2.5">
                  <img
                    src={resolveStoreAvatar(findCustomerForVisit(v))}
                    alt={v.customerName || 'متجر العميل'}
                    referrerPolicy="no-referrer"
                    onError={onStoreAvatarError}
                    className="w-11 h-11 rounded-2xl object-cover border border-slate-200 bg-slate-50 shadow-xs shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight truncate">
                      {v.customerName || 'عميل بدون اسم'}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-block px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-black border border-slate-300">
                        {v.customerCode || '—'}
                      </span>
                      <span className="text-xs text-slate-600 font-bold flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {v.branchName || 'فرع الشركة'}
                      </span>
                      <span className={`tg-badge tg-badge--${v.sector === 'electrical' ? 'warn' : 'blue'}`}>
                        {v.sector === 'electrical' ? '⚡ كهرباء' : '🏠 منزلي'}
                      </span>
                      {v.geoVerification?.status ? (() => {
                        const meta = geoStatusBadgeMeta(v.geoVerification.status);
                        return (
                          <span className={`tg-badge tg-badge--${meta.tone} flex items-center gap-1`}>
                            <MapPin className="w-2.5 h-2.5" />
                            <span>
                              {meta.label}
                              {v.geoVerification.distanceMeters !== undefined ? ` (${formatDistance(v.geoVerification.distanceMeters)})` : ''}
                            </span>
                          </span>
                        );
                      })() : v.location?.latitude && v.location?.longitude && (
                        <a
                          href={v.location.mapUrl || `https://www.google.com/maps/search/?api=1&query=${v.location.latitude},${v.location.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="tg-badge tg-badge--blue flex items-center gap-1 hover:opacity-90 transition"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                          <span>GPS موثق</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <span className={`shrink-0 tg-badge tg-badge--${v.status === 'منفذة' ? 'ok' : (v.status as string) === 'معلقة' || v.status === 'مجدولة' || v.status === 'لم تتم' ? 'warn' : 'gray'}`}>
                    {v.status || 'منفذة'}
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#f1f5f9] border border-[var(--tg-line)] text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--tg-muted)] block mb-0.5">نوع الزيارة</span>
                    <span className={`tg-badge tg-badge--${isCollection ? 'ok' : isReturn ? 'risk' : 'blue'}`}>
                      {v.type || 'دورية'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block mb-0.5">المبلغ المحصل</span>
                    {isCollection && Number(v.collectedAmount || 0) > 0 ? (
                      <div className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm">
                        {formatCurrency(Number(v.collectedAmount))} <span className="text-[10px] font-normal">ج.م</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-bold">—</span>
                    )}
                  </div>
                </div>

                {/* Date & Rep Row */}
                <div className="flex items-center justify-between text-xs text-[var(--tg-muted)] font-bold pt-3 border-t border-[var(--tg-line)]">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[var(--tg-muted)]" />
                    <span className="text-[#0b2337]">{v.date}</span>
                    <span className="text-[var(--tg-muted)]">•</span>
                    <Clock className="w-3 h-3 text-[var(--tg-muted)]" />
                    <span className="text-[#0b2337]">{v.time || '09:00 ص'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#0b2337]">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{v.repName || 'المندوب'}</span>
                  </div>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVisit(v);
                  }}
                  className="w-full min-h-[44px] rounded-2xl bg-[#0b2337] hover:bg-[#123a52] text-white font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
                >
                  <Eye className="w-4 h-4 text-white" />
                  <span>عرض التفاصيل الكاملة</span>
                </button>
              </div>
            );
          })}

          {paginated.length === 0 && (
            <div className="tg-empty-state">
              <div className="tg-empty-state__icon">
                <MapPin className="w-8 h-8" />
              </div>
              <h3 className="tg-empty-state__title">لا توجد زيارات</h3>
              <p className="tg-empty-state__sub">
                لم يتم العثور على أي زيارات مطابقة للبحث أو الفلاتر المحددة.
              </p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white font-black px-4 py-2.5 shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-600 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل زيارة جديدة الآن</span>
              </button>
            </div>
          )}
        </div>

        {/* Pagination Strip */}
        <div className="tg-card p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
          <div className="flex items-center gap-2.5 text-xs font-bold text-[var(--tg-muted)]">
            <span>عرض {paginated.length} من {filtered.length} زيارة</span>
          </div>
          {visibleVisitsCount < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleVisitsCount((c) => c + VISITS_CHUNK)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-black bg-[#0b2337] hover:bg-[#123a52] text-white shadow-sm transition cursor-pointer"
            >
              عرض المزيد ({filtered.length - paginated.length} متبقي)
            </button>
          )}
        </div>
      </div>

      {/* Modal: New Visit Registration */}
      {showForm && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <form
            onSubmit={submit}
            className="relative z-[60] bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-7 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800"
            dir="rtl"
          >
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#eff6ff] text-[#2563eb] flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">تسجيل زيارة جديدة</h2>
                  <p className="text-[11px] font-bold text-slate-600">توثيق الزيارة وحركات التحصيل والمرتجعات</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center transition active:scale-95"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer selection — بحث بالاسم/الكود + فلتر بالمندوب */}
              <label className="block">
                <span className="text-xs font-bold text-[#0b2337] block mb-1">
                  العميل المستهدف *
                </span>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="ابحث باسم العميل أو كود العميل..."
                  className="tg-input mb-2"
                />
                <select
                  value={customerRepFilter}
                  onChange={(e) => setCustomerRepFilter(e.target.value)}
                  className="tg-select mb-2"
                  aria-label="فلترة العملاء حسب المندوب"
                >
                  <option value="all">كل المناديب</option>
                  {customerRepOptions.map((rep) => (
                    <option key={rep} value={rep}>{rep}</option>
                  ))}
                </select>
                <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-300 divide-y divide-slate-100 bg-white">
                  {filteredModalCustomers.length === 0 ? (
                    <div className="p-4 text-center text-xs font-bold text-slate-500">
                      لا يوجد عملاء مطابقون للبحث أو فلتر المندوب
                    </div>
                  ) : (
                    filteredModalCustomers.slice(0, 40).map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setForm({
                            ...form,
                            customerId: c.id,
                            customerName: c.name || '',
                            customerCode: c.code || '',
                          });
                        }}
                        className={`w-full text-right px-3 py-2.5 flex items-center justify-between gap-2 transition ${
                          form.customerId === c.id ? 'bg-[#eff6ff]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img
                            src={resolveStoreAvatar(c)}
                            alt={c.name || 'متجر العميل'}
                            referrerPolicy="no-referrer"
                            onError={onStoreAvatarError}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className={`block text-xs font-black truncate ${form.customerId === c.id ? 'text-[#1d4ed8]' : 'text-[#0b2337]'}`}>
                              {c.name || 'عميل بدون اسم'}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-bold mt-0.5 truncate">
                              {c.code || 'بدون كود'} • {c.salesRepName || c.repName || '—'} • {c.branchName || '—'}
                            </span>
                          </span>
                        </span>
                        {form.customerId === c.id && <CheckCircle2 className="w-4 h-4 text-[#2563eb] shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
                {filteredModalCustomers.length > 40 && (
                  <p className="text-[10px] font-bold text-slate-500 mt-1 text-center">
                    يظهر أول 40 عميل — استخدم البحث أو فلتر المندوب لتضييق النتائج
                  </p>
                )}
              </label>

              {/* Customer financial standing if selected */}
              {form.customerId && (
                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/80 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                      موقف العميل المالي الحالي
                    </span>
                    <span className="text-[10px] font-bold text-[#2563eb]">بيانات لحظية</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300">
                      <div className="text-[10px] text-slate-600 font-black">الرصيد الحالي</div>
                      <div className="font-black text-slate-900 dark:text-white mt-0.5">
                        {formatCurrency(
                          myCustomers.find((x) => x.id === form.customerId)?.currentBalance ??
                            myCustomers.find((x) => x.id === form.customerId)?.balance ??
                            0
                        )}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300">
                      <div className="text-[10px] text-slate-600 font-black">الحد الائتماني</div>
                      <div className="font-black text-slate-900 dark:text-white mt-0.5">
                        {formatCurrency(
                          myCustomers.find((x) => x.id === form.customerId)?.creditLimit ?? 0
                        )}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300">
                      <div className="text-[10px] text-slate-600 font-black">المديونية</div>
                      <div className="font-black text-rose-600 mt-0.5">
                        {formatCurrency(
                          myCustomers.find((x) => x.id === form.customerId)?.overdueBalance ?? 0
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* GPS Geofencing, Anti-Spoof & Live Camera Proof */}
              {selectedCustomerObj && (
                <div className="p-4 rounded-2xl border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#2563eb] text-white flex items-center justify-center shadow-xs">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-slate-900">
                        تحدي وتوثيق موقع الزيارة (GPS)
                      </span>
                    </div>
                    {selectedCustomerObj.latitude && selectedCustomerObj.longitude ? (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        selectedCustomerObj.locationLocked
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                      }`}>
                        {selectedCustomerObj.locationLocked ? <Lock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {selectedCustomerObj.locationLocked ? 'موقع معتمد ومقفل' : 'موقع مسجل'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                        العميل غير مثبت 📍
                      </span>
                    )}
                  </div>

                  {/* Live Anti-Spoof Status Banner */}
                  {repGps ? (
                    <div className={`p-3 rounded-xl border text-xs font-bold space-y-1.5 ${
                      liveGeoCheck.status === 'verified'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : liveGeoCheck.status === 'suspected_spoof'
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : liveGeoCheck.status === 'outside_range'
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-black">
                          {liveGeoCheck.status === 'verified' ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>{liveGeoCheck.label}</span>
                        </div>
                        {repGps.accuracy !== undefined && (
                          <span className="text-[11px] font-mono bg-white/80 px-2 py-0.5 rounded-md border border-slate-200">
                            دقة ±{repGps.accuracy}م
                          </span>
                        )}
                      </div>
                      {liveGeoCheck.speedKmh && liveGeoCheck.speedKmh > 130 && (
                        <div className="text-[11px] text-rose-800 font-bold">
                          تنبيه: سرعة انتقال غير منطقية عن آخر زيارة ({liveGeoCheck.speedKmh} كم/ساعة).
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => requestCurrentRepGps()}
                      disabled={isCapturingGps}
                      className="w-full py-2.5 px-3 rounded-xl bg-white border border-[#bfdbfe] text-[#1d4ed8] text-xs font-black hover:bg-[#eff6ff] transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Navigation2 className={`w-3.5 h-3.5 ${isCapturingGps ? 'animate-spin' : ''}`} />
                      <span>{isCapturingGps ? 'جاري قراءة GPS الحي...' : 'تحديث قراءة GPS الحية للتحقق'}</span>
                    </button>
                  )}

                  {/* Live Camera Proof (required when outside range, spoof suspected, or no GPS) */}
                  {(liveGeoCheck.requiresLivePhoto || !repGps || !selectedCustomerObj.latitude) && (
                    <div className="rounded-xl bg-white/90 border border-slate-200 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-blue-600" />
                          {liveGeoCheck.requiresLivePhoto
                            ? 'إلزامي: صورة حية لواجهة المحل بالكاميرا (مختومة بالوقت والموقع)'
                            : 'صورة حية للمحل بالكاميرا (تُرفع على Cloudinary)'}
                        </span>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black cursor-pointer transition">
                          {isUploadingProof ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                          <span>{isUploadingProof ? 'جاري الختم والرفع...' : proofPhotoUrl ? 'إعادة التصوير' : 'فتح الكاميرا'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={isUploadingProof}
                            onChange={handleCaptureProofPhoto}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {proofPhotoUrl && (
                        <div className="relative h-28 rounded-xl overflow-hidden border border-emerald-300">
                          <img src={proofPhotoUrl} alt="إثبات الزيارة" className="w-full h-full object-cover" />
                          <span className="absolute bottom-1 right-1 px-2 py-0.5 rounded bg-emerald-700/90 text-white text-[10px] font-black">
                            تم التوثيق والختم ✅
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Primary Customer Pinning (only if not yet pinned OR supervisor/manager override) */}
                  {!selectedCustomerObj.latitude || !selectedCustomerObj.longitude ? (
                    <button
                      type="button"
                      onClick={handlePinCustomerLocation}
                      disabled={isCapturingGps}
                      className="w-full py-2.5 px-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-black text-xs shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MapPin className={`w-4 h-4 ${isCapturingGps ? 'animate-bounce' : ''}`} />
                      <span>{isCapturingGps ? 'جاري التثبيت...' : '📍 تثبيت هذا الموقع كـ "الموقع الأساسي للعميل"'}</span>
                    </button>
                  ) : !selectedCustomerObj.locationLocked || canApproveLocations ? (
                    <button
                      type="button"
                      onClick={handlePinCustomerLocation}
                      disabled={isCapturingGps}
                      className="text-[11px] font-bold text-slate-600 hover:text-[#1d4ed8] underline block text-center w-full cursor-pointer"
                    >
                      {canApproveLocations
                        ? '🔒 تحديث واعتماد الموقع الأساسي للعميل بموقعي الحالي'
                        : '🔄 تحديث الموقع الأساسي للعميل (غير مقفل بعد)'}
                    </button>
                  ) : (
                    <div className="text-[11px] font-bold text-slate-600 flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-700" />
                      <span>الموقع الأساسي مقفل ومعتمد — لا يمكن تغييره من حساب المندوب</span>
                    </div>
                  )}

                  {gpsNotice && (
                    <div className="text-[11px] font-bold text-[#1d4ed8] bg-[#dbeafe]/80 p-2 rounded-xl border border-[#93c5fd]">
                      {gpsNotice}
                    </div>
                  )}
                </div>
              )}

              {/* Type and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-[#0b2337] block mb-1">
                    نوع الزيارة *
                  </span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  >
                    {SIMPLE_VISIT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold text-[#0b2337] block mb-1">
                    تاريخ الزيارة
                  </span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 px-3 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                </label>
              </div>

              {/* Time & Collected Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-[#0b2337] block mb-1">
                    توقيت الزيارة
                  </span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 px-3 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                </label>

                {form.type === 'تحصيل' && (
                  <label className="block">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-black block mb-1">
                      مبلغ التحصيل (ج.م) *
                    </span>
                    <input
                      type="number"
                      value={form.collectedAmount || ''}
                      onChange={(e) => setForm({ ...form, collectedAmount: Number(e.target.value) })}
                      placeholder="0.00"
                      className="w-full rounded-2xl border border-emerald-300 dark:border-emerald-700 px-3 py-2.5 text-sm font-black bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </label>
                )}
              </div>

              {/* Notes */}
              <label className="block">
                <span className="text-xs font-bold text-[#0b2337] block mb-1">
                  ملاحظات وإفادة الزيارة
                </span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  placeholder="سجل تفاصيل المقابلة، البضاعة المطلوبة، أو سبب التأجيل..."
                />
              </label>

              {formErrors.length > 0 && (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-bold space-y-1">
                  {formErrors.map((err, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[46px] bg-[#0b2337] hover:bg-[#123a52] text-white font-black text-sm rounded-2xl shadow-lg shadow-[#0b2337]/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Clock className="w-4 h-4 text-[#7fc0ff]" />
                <span>حفظ وتوثيق الزيارة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Visit Full Details */}
      {selectedVisit && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedVisit(null);
          }}
        >
          <div
            className="relative z-[60] bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-7 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800"
            dir="rtl"
          >
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#eff6ff] text-[#2563eb] flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">تفاصيل الزيارة الميدانية</h2>
                  <p className="text-[11px] font-bold text-slate-600">سجل الزيارة الموثق بالمنظومة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center transition active:scale-95"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Customer and rep */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50 flex items-center gap-2.5">
                  <img
                    src={resolveStoreAvatar(findCustomerForVisit(selectedVisit))}
                    alt={selectedVisit.customerName || 'متجر العميل'}
                    referrerPolicy="no-referrer"
                    onError={onStoreAvatarError}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-600 font-black block mb-0.5">العميل</span>
                    <div className="font-black text-slate-900 dark:text-white text-sm truncate">{selectedVisit.customerName}</div>
                    <div className="text-[11px] font-mono font-bold text-[#2563eb] mt-0.5">
                      {selectedVisit.customerCode || 'بدون كود'}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-black block mb-1">المندوب القائم بالزيارة</span>
                  <div className="font-black text-slate-900 dark:text-white text-sm">{selectedVisit.repName || 'المندوب'}</div>
                  <div className="text-[11px] text-slate-500 font-bold mt-0.5">{selectedVisit.branchName || 'فرع الشركة'}</div>
                </div>
              </div>

              {/* Timestamp & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-black block mb-1">التاريخ والتوقيت</span>
                  <div className="font-black text-slate-900 dark:text-white text-sm">{selectedVisit.date}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{selectedVisit.time || '09:00 ص'}</div>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-black block mb-1">نوع وحالة الزيارة</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {selectedVisit.type}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {selectedVisit.status || 'منفذة'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sector & Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-black block mb-1">القطاع</span>
                  <span
                    className={`inline-block px-2.5 py-1 rounded-xl text-xs font-black border ${
                      selectedVisit.sector === 'electrical'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                    }`}
                  >
                    {selectedVisit.sector === 'electrical' ? '⚡ قطاع الكهرباء' : '🏠 قطاع المنزلي'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-black block mb-1">المبلغ المحصل</span>
                  {selectedVisit.collectedAmount && selectedVisit.collectedAmount > 0 ? (
                    <div className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                      {formatCurrency(selectedVisit.collectedAmount)} <span className="text-xs font-normal">ج.م</span>
                    </div>
                  ) : (
                    <span className="text-slate-500 font-bold text-sm">—</span>
                  )}
                </div>
              </div>

              {/* GPS Geolocation & Anti-Spoof Verification */}
              {(selectedVisit.location?.latitude || selectedVisit.geoVerification) && (
                <div className="p-3.5 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-[#1d4ed8] font-black flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      التحقق الجغرافي للزيارة (GPS)
                    </span>
                    {selectedVisit.geoVerification?.status && (() => {
                      const meta = geoStatusBadgeMeta(selectedVisit.geoVerification.status);
                      return (
                        <span className={`tg-badge tg-badge--${meta.tone}`}>
                          {meta.label}
                          {selectedVisit.geoVerification.distanceMeters !== undefined
                            ? ` • ${formatDistance(selectedVisit.geoVerification.distanceMeters)}`
                            : ''}
                        </span>
                      );
                    })()}
                  </div>

                  {selectedVisit.location?.latitude && selectedVisit.location?.longitude && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-mono font-bold text-slate-800">
                        {selectedVisit.location.latitude.toFixed(5)}, {selectedVisit.location.longitude.toFixed(5)}
                        {selectedVisit.location.accuracy ? ` (±${Math.round(selectedVisit.location.accuracy)}م)` : ''}
                      </div>
                      <a
                        href={selectedVisit.location.mapUrl || `https://www.google.com/maps/search/?api=1&query=${selectedVisit.location.latitude},${selectedVisit.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-black text-[#1d4ed8] hover:underline flex items-center gap-1"
                      >
                        <span>عرض على الخريطة</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {selectedVisit.geoVerification?.proofPhotoUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                      <img
                        src={selectedVisit.geoVerification.proofPhotoUrl}
                        alt="صورة إثبات الزيارة"
                        className="w-full max-h-48 object-cover"
                      />
                    </div>
                  )}

                  {canApproveLocations && selectedVisit.reviewStatus === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...selectedVisit,
                            reviewStatus: 'approved' as const,
                            reviewedByName: currentUser?.name || 'المشرف',
                            reviewedAt: new Date().toISOString(),
                            reviewNote: 'تمت مراجعة الموقع وإثبات الكاميرا واعتماد الزيارة',
                          };
                          updateVisit(updated);
                          setSelectedVisit(updated);
                          setFlash({ tone: 'success', text: 'تم اعتماد الزيارة بعد مراجعة الموقع ✅' });
                          setTimeout(() => setFlash(null), 3500);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer transition"
                      >
                        اعتماد الزيارة ✅
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...selectedVisit,
                            reviewStatus: 'needs_fix' as const,
                            reviewedByName: currentUser?.name || 'المشرف',
                            reviewedAt: new Date().toISOString(),
                            reviewNote: 'مخالفة موقع أو عدم تطابق الإحداثيات',
                          };
                          updateVisit(updated);
                          setSelectedVisit(updated);
                          setFlash({ tone: 'error', text: 'تم تسجيل ملاحظة مخالفة موقع على الزيارة ⚠️' });
                          setTimeout(() => setFlash(null), 3500);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer transition"
                      >
                        مخالفة موقع ⚠️
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {selectedVisit.notes && (
                <div className="p-3.5 rounded-2xl border border-slate-300 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-600 font-black block mb-1">ملاحظات وإفادة الزيارة</span>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {selectedVisit.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="w-full sm:w-auto px-7 py-2.5 rounded-2xl bg-[#0b2337] hover:bg-[#123a52] text-white font-black text-xs transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
