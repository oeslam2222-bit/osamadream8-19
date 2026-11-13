import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Flame,
  Lock,
  MapPin,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { inferCustomerSector } from '../data/branchDefinitions';
import { normalizeArabicText } from '../services/arabicMatchingService';
import { normalizeCloudinaryConfig, optimizeImageUrl, uploadImageToCloudinary } from '../services/cloudinaryService';
import defaultStoreAvatar from '../assets/images/store_avatar_1794558443874.jpg';
import {
  formatDistance,
  geoStatusBadgeMeta,
  LiveGpsReading,
  requestLiveGps,
  verifyVisitLocation,
  watermarkAndCompressLivePhoto,
} from '../services/geoVerificationService';
import type { Customer, CustomerVisit } from '../types';

const todayKey = (): string => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

/** عدد كروت العملاء المحمّلة في كل دفعة — يمنع بناء آلاف الكروت مرة واحدة. */
const CUSTOMERS_PAGE_SIZE = 20;

/**
 * المتأخرات المستخدمة في شاشة التحصيل.
 *
 * السلسلة القديمة كانت `overdueBalance ?? totalOverdue ?? ...` — و`??` بيتوقف
 * عند أول قيمة موجودة حتى لو كانت **صفر**. بيانات الشيتات فيها عمود
 * `overdueBalance = 0` بجانب `overdue2026` الحقيقي، فكان العميل المتأخر
 * بيتحسب "صفر متأخرات" ويختفي من التحصيلات. دلوقتي بناخد أول عمود **قيمته
 * موجبة**، وبعدها فقط نرجع للمديونية كآخر حل.
 */
const getCustomerDebt = (customer: Customer): number => {
  const candidates = [
    customer.totalOverdue,
    customer.overdue2026,
    customer.overdue2025,
    customer.overdueBalance,
    customer.totalOverdueAndDue,
    customer.dueBalance,
    customer.currentBalance,
    customer.balance,
  ];
  for (const value of candidates) {
    const due = Number(value);
    if (Number.isFinite(due) && due > 0) return due;
  }
  return 0;
};

const buildInitials = (name: string): string => {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'م';
};

const resolveCustomerStoreAvatar = (customer?: Partial<Customer> | null): string => {
  const uploaded =
    customer?.locationPhotoUrl ||
    customer?.storePhotos?.[0] ||
    customer?.profileImageUrl ||
    customer?.avatarUrl ||
    '';
  return uploaded ? optimizeImageUrl(uploaded, 160, true) : defaultStoreAvatar;
};

const handleStoreAvatarError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.dataset.fallback) {
    img.dataset.fallback = '1';
    img.src = defaultStoreAvatar;
  }
};

const formatOutcomeText = (): CustomerVisit['outcome'] => 'تم التحصيل';

interface RepSummary {
  repId: string;
  repName: string;
  avatar: string;
  avatarUrl: string;
  sales: number;
  collections: number;
  customers: number;
  visits: number;
  lastVisit: string;
  rate: number;
}

export const CollectionRecoveryDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    invoices,
    getVisibleCustomers,
    addVisit,
    updateCustomer,
    visits,
    cloudinaryConfig,
  } = useApp();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('الكل');
  const [repFilter, setRepFilter] = useState('الكل');
  const [sectorFilter, setSectorFilter] = useState<'all' | 'home' | 'electrical' | 'both'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [amountByCustomer, setAmountByCustomer] = useState<Record<string, number>>({});
  const [notesByCustomer, setNotesByCustomer] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [confirmCustomer, setConfirmCustomer] = useState<Customer | null>(null);
  const [confirmRepGps, setConfirmRepGps] = useState<LiveGpsReading | null>(null);
  const [confirmGpsLoading, setConfirmGpsLoading] = useState(false);
  const [confirmGpsError, setConfirmGpsError] = useState<string | null>(null);
  const [confirmProofPhoto, setConfirmProofPhoto] = useState<string | null>(null);
  const [confirmUploadingProof, setConfirmUploadingProof] = useState(false);
  const [confirmPinInitialLocation, setConfirmPinInitialLocation] = useState(false);
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(CUSTOMERS_PAGE_SIZE);

  // أي تغيير في البحث/الفلاتر يرجّع التحميل لأول دفعة
  useEffect(() => {
    setVisibleCustomersCount(CUSTOMERS_PAGE_SIZE);
  }, [search, branchFilter, repFilter, sectorFilter]);

  const repoCustomers = useMemo(() => {
    // `getVisibleCustomers` بيتكفّل أصلًا بصلاحيات الفرع/المندوب/المشرف،
    // فكان فيه فلتر فرع إضافي هنا بيقارن اسم الفرع بالنص الحرفي وبيخفّي
    // كل عملاء الفروع التانية حتى عن الأدمن — وده سبب إن التحصيلات كانت فاضية.
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    return list.filter((customer) => {
      const assignedToRep = !currentUser || currentUser.role === 'admin' || currentUser.role === 'developer' || currentUser.role === 'branch_manager' || currentUser.role === 'supervisor'
        ? true
        : customer.repId === currentUser.id || customer.salesRepName === currentUser.name || customer.repName === currentUser.name;
      const resolvedSector = inferCustomerSector(customer, users);
      const matchesSector =
        sectorFilter === 'all' ||
        customer.sector === 'both' ||
        customer.sector === 'all' ||
        (sectorFilter === 'both'
          ? resolvedSector === 'home' || resolvedSector === 'electrical'
          : resolvedSector === sectorFilter);
      return assignedToRep && matchesSector && getCustomerDebt(customer) > 0;
    });
  }, [getVisibleCustomers, customers, users, currentUser, sectorFilter]);

  const branchOptions = useMemo(
    () => ['الكل', ...Array.from(new Set(repoCustomers.map((customer) => customer.branchName).filter(Boolean)))],
    [repoCustomers]
  );

  const repOptions = useMemo(
    () => ['الكل', ...Array.from(new Set(repoCustomers.map((customer) => customer.salesRepName || customer.repName || 'غير محدد')))],
    [repoCustomers]
  );

  const overdueCustomers = useMemo(() => {
    const q = search.trim();
    const qNorm = normalizeArabicText(q);
    const qLower = q.toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    const filtered = repoCustomers.filter((customer) => {
      const branchMatch = branchFilter === 'الكل' || customer.branchName === branchFilter;
      const repMatch = repFilter === 'الكل' || (customer.salesRepName || customer.repName || 'غير محدد') === repFilter;
      if (!branchMatch || !repMatch) return false;
      if (!q) return true;

      const name = customer.name || '';
      const code = customer.code || '';
      const phone = customer.phone || '';
      const store = customer.storeName || '';
      const nameNorm = normalizeArabicText(name);
      const codeNorm = code.toLowerCase();
      const storeNorm = normalizeArabicText(store);

      // Smart search: normalized Arabic match, partial tokens, code/phone digits
      const byName = qNorm ? (nameNorm.includes(qNorm) || storeNorm.includes(qNorm)) : false;
      const byTokens = qNorm
        ? qNorm.split(/\s+/).filter(Boolean).every((t) => nameNorm.includes(t) || storeNorm.includes(t) || codeNorm.includes(t.toLowerCase()))
        : false;
      const byCode = codeNorm.includes(qLower) || (qDigits && code.replace(/\D/g, '').includes(qDigits));
      const byPhone = qDigits ? phone.replace(/\D/g, '').includes(qDigits) : phone.toLowerCase().includes(qLower);
      const byPlain = `${name} ${code} ${phone} ${store}`.toLowerCase().includes(qLower);

      return byName || byTokens || byCode || byPhone || byPlain;
    });

    return filtered.sort((a, b) => getCustomerDebt(b) - getCustomerDebt(a));
  }, [repoCustomers, search, branchFilter, repFilter]);

  const topOverdueCustomers = useMemo(() => overdueCustomers.slice(0, 5), [overdueCustomers]);

  const pagedOverdueCustomers = useMemo(
    () => overdueCustomers.slice(0, visibleCustomersCount),
    [overdueCustomers, visibleCustomersCount]
  );

  const totalDebt = useMemo(
    () => overdueCustomers.reduce((sum, customer) => sum + getCustomerDebt(customer), 0),
    [overdueCustomers]
  );

  const todayVisits = useMemo(
    () => visits.filter((visit) => visit.date === todayKey()).length,
    [visits]
  );

  const todayCollectionValue = useMemo(
    () => visits
      .filter((visit) => visit.type === 'تحصيل' && visit.date === todayKey())
      .reduce((sum, visit) => sum + Number(visit.collectedAmount || 0), 0),
    [visits]
  );

  const returnsByCustomerKey = useMemo(() => {
    const map = new Map<string, { count: number; value: number; pending: number }>();
    const add = (key: string | undefined, v: CustomerVisit) => {
      if (!key) return;
      const cur = map.get(key) || { count: 0, value: 0, pending: 0 };
      cur.count += 1;
      cur.value += Number(v.returnValue || 0);
      if (v.returnStatus !== 'مغلق' && v.returnStatus !== 'مرفوض') cur.pending += 1;
      map.set(key, cur);
    };
    visits.forEach((v) => {
      if (!v.isReturn) return;
      add(v.customerId, v);
      if (v.customerCode && v.customerCode !== v.customerId) add(v.customerCode, v);
    });
    return map;
  }, [visits]);

  const repSummaries = useMemo<RepSummary[]>(() => {
    const map = new Map<string, RepSummary>();
    const resolveRepAvatarUrl = (repId?: string, repName?: string): string => {
      const targetName = normalizeArabicText(repName || '');
      const matched = users.find(
        (u) =>
          (repId && (u.id === repId || u.username === repId)) ||
          (targetName && normalizeArabicText(u.name || '') === targetName)
      );
      return matched?.avatar || '/assets/rep-avatar.jpg';
    };

    repoCustomers.forEach((customer) => {
      const repName = customer.salesRepName || customer.repName || 'غير محدد';
      const key = `${customer.repId || repName}`;
      const current = map.get(key) ?? {
        repId: customer.repId || key,
        repName,
        avatar: buildInitials(repName),
        avatarUrl: resolveRepAvatarUrl(customer.repId, repName),
        sales: 0,
        collections: 0,
        customers: 0,
        visits: 0,
        lastVisit: '',
        rate: 0,
      };
      current.customers += 1;
      map.set(key, current);
    });

    invoices.forEach((invoice) => {
      const repName = (invoice as any).repName || (invoice as any).salesRepName || (invoice as any).rep || 'غير محدد';
      const repId = (invoice as any).repId || `${repName}-${(invoice as any).invoiceNumber || 'invoice'}`;
      const key = repId || repName;
      const current = map.get(key) ?? {
        repId,
        repName,
        avatar: buildInitials(repName),
        avatarUrl: resolveRepAvatarUrl(repId, repName),
        sales: 0,
        collections: 0,
        customers: 0,
        visits: 0,
        lastVisit: '',
        rate: 0,
      };
      const total = Number((invoice as any).totalAmount ?? (invoice as any).netTotal ?? (invoice as any).grandTotal ?? 0);
      current.sales += Number.isFinite(total) ? total : 0;
      map.set(key, current);
    });

    visits.forEach((visit) => {
      if (visit.type !== 'تحصيل') return;
      const repName = visit.repName || 'غير محدد';
      const key = `${visit.repId || repName}`;
      const current = map.get(key) ?? {
        repId: visit.repId || key,
        repName,
        avatar: buildInitials(repName),
        avatarUrl: resolveRepAvatarUrl(visit.repId, repName),
        sales: 0,
        collections: 0,
        customers: 0,
        visits: 0,
        lastVisit: '',
        rate: 0,
      };
      current.collections += Number(visit.collectedAmount || 0);
      current.visits += 1;
      current.lastVisit = visit.date || current.lastVisit;
      map.set(key, current);
    });

    return Array.from(map.values())
      .map((rep) => ({
        ...rep,
        rate: rep.sales > 0 ? Math.min(100, Math.round((rep.collections / rep.sales) * 100)) : 0,
      }))
      .sort((a, b) => b.collections - a.collections || b.sales - a.sales);
  }, [repoCustomers, invoices, visits, users]);

  const topRep = repSummaries[0];
  const managerKpis = useMemo(() => {
    const activeReps = repSummaries.filter((rep) => rep.collections > 0 || rep.sales > 0).length;
    const avgRate = repSummaries.length > 0
      ? Math.round(repSummaries.reduce((sum, rep) => sum + rep.rate, 0) / repSummaries.length)
      : 0;

    return [
      {
        key: 'today-collections',
        label: 'تحصيل اليوم',
        value: formatCurrency(todayCollectionValue),
        hint: 'المحصل من كل المناديب اليوم',
      },
      {
        key: 'overdue-balance',
        label: 'إجمالي المتأخرات',
        value: formatCurrency(totalDebt),
        hint: 'العملاء المتأخرين فقط',
      },
      {
        key: 'rep-rate',
        label: 'متوسط نسبة التحصيل',
        value: `${avgRate}%`,
        hint: 'بناءً على نسب المناديب',
      },
      {
        key: 'active-reps',
        label: 'المناديب النشطين',
        value: `${activeReps}`,
        hint: 'لديهم مبيعات أو تحصيلات',
      },
    ];
  }, [repSummaries, totalDebt, todayCollectionValue]);

  const dailyCollectionRows = useMemo(() => {
    const rows = repSummaries.map((rep) => {
      const repVisits = visits.filter(
        (visit) => (visit.repId === rep.repId || visit.repName === rep.repName) && visit.type === 'تحصيل' && visit.date === todayKey()
      );
      const collected = repVisits.reduce((sum, visit) => sum + Number(visit.collectedAmount || 0), 0);
      const count = repVisits.length;
      return {
        id: rep.repId,
        repName: rep.repName,
        avatar: rep.avatar,
        avatarUrl: rep.avatarUrl,
        collected,
        count,
        proportion: rep.rate,
      };
    });

    return rows.filter((row) => row.collected > 0).sort((a, b) => b.collected - a.collected);
  }, [repSummaries, visits]);

  const selectedCustomer = overdueCustomers.find((customer) => customer.id === selectedCustomerId) ?? overdueCustomers[0] ?? null;

  const confirmGeoCheck = useMemo(() => {
    if (!confirmCustomer) return null;
    return verifyVisitLocation({
      repGps: confirmRepGps,
      customer: confirmCustomer,
      repVisits: visits,
      repId: currentUser?.id,
    });
  }, [confirmCustomer, confirmRepGps, visits, currentUser?.id]);

  const fetchCollectionGps = async () => {
    setConfirmGpsLoading(true);
    setConfirmGpsError(null);
    const res = await requestLiveGps(10000);
    setConfirmGpsLoading(false);
    if (res.ok) {
      setConfirmRepGps(res.coords);
    } else {
      setConfirmRepGps(null);
      setConfirmGpsError('error' in res ? res.error : 'تعذر التقاط GPS');
    }
  };

  const handleConfirmProofUpload = async (file?: File | null) => {
    if (!file || !confirmCustomer) return;
    setConfirmUploadingProof(true);
    try {
      const stamped = await watermarkAndCompressLivePhoto(file, {
        customerName: confirmCustomer.name,
        repName: currentUser?.name || 'المندوب',
        latitude: confirmRepGps?.latitude,
        longitude: confirmRepGps?.longitude,
        distanceMeters: confirmGeoCheck?.distanceMeters,
        reason: 'إثبات تحصيل',
      });
      const uploaded = await uploadImageToCloudinary(
        stamped,
        normalizeCloudinaryConfig(cloudinaryConfig),
        'tantawy_collection_proofs'
      );
      setConfirmProofPhoto(uploaded.url);
    } catch {
      setToast('تعذر رفع صورة الإثبات — تأكد من الاتصال بالإنترنت');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setConfirmUploadingProof(false);
    }
  };

  const handleSave = (customer: Customer) => {
    if (!currentUser) return;

    const debt = getCustomerDebt(customer);
    const amount = Number(amountByCustomer[customer.id] ?? 0);

    if (amount <= 0) {
      setToast('يرجى إدخال مبلغ التحصيل قبل الحفظ');
      setTimeout(() => setToast(null), 3500);
      return;
    }

    const geoCheck = confirmGeoCheck || verifyVisitLocation({
      repGps: confirmRepGps,
      customer,
      repVisits: visits,
      repId: currentUser.id,
    });

    if (geoCheck.requiresLivePhoto && !confirmProofPhoto) {
      setToast('يلزم التقاط صورة حية لمحل العميل قبل حفظ التحصيل لأن الموقع خارج النطاق أو مشتبه به');
      setTimeout(() => setToast(null), 4000);
      return;
    }

    const customNote = (notesByCustomer[customer.id] || '').trim();
    const visit: Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy'> = {
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      date: todayKey(),
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      repId: currentUser.id,
      repName: currentUser.name,
      branchName: customer.branchName || currentUser.branchName,
      sector: customer.sector || 'all',
      supervisorId: currentUser.supervisorId,
      supervisorName: currentUser.supervisorName || 'المشرف',
      type: 'تحصيل',
      outcome: formatOutcomeText(),
      status: 'منفذة',
      collectedAmount: amount,
      notes: customNote || `تحصيل مبلغ ${formatCurrency(amount)} من العميل ${customer.name}`,
      location: confirmRepGps
        ? {
            latitude: confirmRepGps.latitude,
            longitude: confirmRepGps.longitude,
            accuracy: confirmRepGps.accuracy,
            timestamp: confirmRepGps.timestamp,
          }
        : undefined,
      geoVerification: {
        status: geoCheck.status,
        distanceMeters: geoCheck.distanceMeters,
        accuracyMeters: geoCheck.accuracyMeters,
        speedKmh: geoCheck.speedKmh,
        flags: geoCheck.flags,
        proofPhotoUrl: confirmProofPhoto || undefined,
        verifiedAt: geoCheck.verifiedAt,
      },
      reviewStatus: geoCheck.requiresSupervisorReview ? 'pending' : 'approved',
      reviewedByName: geoCheck.requiresSupervisorReview ? undefined : currentUser.name,
      reviewNote: geoCheck.requiresSupervisorReview
        ? `تنبيه موقع التحصيل: ${geoCheck.label}`
        : 'تم تسجيل زيارة تحصيل من شاشة التحصيل',
      syncStatus: 'local_only',
    };

    const result = addVisit(visit);
    const remaining = Math.max(0, debt - amount);
    const shouldPinInitialLocation =
      Boolean(confirmRepGps) &&
      confirmPinInitialLocation &&
      !customer.locationLocked &&
      (!customer.latitude || !customer.longitude);

    updateCustomer({
      ...customer,
      balance: remaining,
      currentBalance: remaining,
      overdueBalance: remaining,
      totalOverdue: remaining,
      dueBalance: remaining,
      lastCollectionDate: visit.date,
      lastCollectionAmount: amount,
      ...(shouldPinInitialLocation && confirmRepGps
        ? {
            latitude: confirmRepGps.latitude,
            longitude: confirmRepGps.longitude,
            locationCapturedAt: new Date().toISOString(),
            locationCapturedBy: currentUser.name,
            locationAccuracy: confirmRepGps.accuracy,
            ...(confirmProofPhoto ? { locationPhotoUrl: confirmProofPhoto } : {}),
          }
        : {}),
    });

    const alertText = result.success
      ? `تم تسجيل تحصيل العميل ${customer.name} بمبلغ ${formatCurrency(amount)} بنجاح${shouldPinInitialLocation ? ' وتثبيت موقع العميل المبدئي' : ''}`
      : result.message;

    setToast(alertText);
    setAmountByCustomer((prev) => ({ ...prev, [customer.id]: 0 }));
    setNotesByCustomer((prev) => ({ ...prev, [customer.id]: '' }));
    setConfirmCustomer(null);
    setConfirmRepGps(null);
    setConfirmProofPhoto(null);
    setSelectedCustomerId(customer.id);
    setTimeout(() => setToast(null), 4400);
  };

  const openConfirmModal = (customer: Customer) => {
    setConfirmCustomer(customer);
    setConfirmRepGps(null);
    setConfirmGpsError(null);
    setConfirmProofPhoto(null);
    setConfirmPinInitialLocation(!customer.latitude || !customer.longitude);
    void fetchCollectionGps();
  };

  return (
    <div className="tg-dash space-y-4" dir="rtl">
      {/* الهيدر — مطابق لهوية التطبيق */}
      <section className="ds-pagehead">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              رئيسية <span className="mx-1 text-[#7fc0ff]">›</span> التحصيل والمتابعة
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">تحصيل العملاء المتأخرين</h1>
                <p className="text-xs text-[#c3d9ec] mt-0.5">متابعة المتأخرات وتسجيل التحصيل كزيارة واحدة — مع رؤية أداء المناديب اليوم.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-200">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#c3d9ec]">الأعلى تحصيلاً اليوم</div>
              <div className="text-sm font-black text-white">{topRep ? topRep.repName : 'لا يوجد تحصيل بعد'}</div>
              {topRep && <div className="text-[10px] text-emerald-100/90">محصّل {formatCurrency(topRep.collections)} — أحسنت</div>}
            </div>
          </div>
        </div>
      </section>

      {/* مؤشرات رئيسية — هوية tg-kpi */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <div className="tg-kpi tg-kpi--red">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><Wallet size={20} /></span>
          </div>
          <span className="tg-kpi__value tabular-nums">{overdueCustomers.length.toLocaleString('en-US')}</span>
          <span className="tg-kpi__label">عملاء متأخرون</span>
          <span className="tg-kpi__hint">يحتاجون متابعة فورية</span>
        </div>

        <div className="tg-kpi tg-kpi--amber">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><Coins size={20} /></span>
          </div>
          <span className="tg-kpi__value tabular-nums" style={{ fontSize: 20 }}>{formatCurrency(totalDebt)}</span>
          <span className="tg-kpi__label">إجمالي المتأخرات</span>
          <span className="tg-kpi__hint">مستحق للتحصيل</span>
        </div>

        <div className="tg-kpi tg-kpi--blue">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><Clock3 size={20} /></span>
          </div>
          <span className="tg-kpi__value tabular-nums">{todayVisits.toLocaleString('en-US')}</span>
          <span className="tg-kpi__label">زيارات اليوم</span>
          <span className="tg-kpi__hint">مسجّلة في النظام</span>
        </div>

        <div className="tg-kpi tg-kpi--emerald">
          <div className="tg-kpi__top">
            <span className="tg-kpi__icon"><TrendingUp size={20} /></span>
          </div>
          <span className="tg-kpi__value tabular-nums" style={{ fontSize: 20 }}>{formatCurrency(todayCollectionValue)}</span>
          <span className="tg-kpi__label">تحصيل اليوم</span>
          <span className="tg-kpi__hint">إجمالي المحصّل</span>
        </div>
      </div>

      {/* مؤشرات إدارية */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {managerKpis.map((item) => (
          <div key={item.key} className="tg-card !flex-row !items-center !justify-between !gap-3 !p-3.5">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[var(--tg-muted)]">{item.label}</div>
              <div className="mt-0.5 text-lg font-black text-[var(--tg-ink)] tabular-nums">{item.value}</div>
              <div className="text-[10.5px] font-medium text-slate-500">{item.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {topRep && (
        <div className="tg-card !flex-row !items-center !justify-between gap-3 border border-emerald-200 bg-gradient-to-l from-emerald-50 to-white">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={topRep.avatarUrl || '/assets/rep-avatar.jpg'}
              alt={topRep.repName}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = '1';
                  img.src = '/assets/rep-avatar.jpg';
                }
              }}
              className="h-12 w-12 shrink-0 rounded-2xl object-cover object-top border-2 border-emerald-300 shadow-sm"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-black text-emerald-700">الأداء المميز</div>
              <div className="text-base font-black text-[#0b2337] truncate">{topRep.repName} يتصدر اليوم</div>
              <div className="text-xs font-bold text-emerald-800">محصّل {formatCurrency(topRep.collections)} • نسبة {topRep.rate}%</div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 shrink-0 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black text-emerald-800 shadow-sm">
            <Flame className="h-4 w-4 text-amber-500" />
            استمر في التقدم
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr] items-start">
        {/* قائمة العملاء */}
        <div className="tg-card p-0 overflow-hidden border border-[var(--tg-line)]">
          <div className="border-b border-[var(--tg-line)] bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="h-4 w-4" /></span>
                  قائمة العملاء المتأخرين
                </h3>
                <p className="mt-1 text-[11px] font-bold text-[var(--tg-muted)]">اختر عميل، أدخل المبلغ، وسجّل التحصيل مباشرة</p>
              </div>
              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="بحث ذكي بالاسم أو الكود أو الهاتف..."
                  className="w-full rounded-xl border border-slate-200 bg-white pr-10 pl-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15">
                {branchOptions.map((option) => (
                  <option key={option} value={option}>{option === 'الكل' ? 'كل الفروع' : option}</option>
                ))}
              </select>
              <select value={repFilter} onChange={(event) => setRepFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15">
                {repOptions.map((option) => (
                  <option key={option} value={option}>{option === 'الكل' ? 'كل المناديب' : option}</option>
                ))}
              </select>
              <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value as 'all' | 'home' | 'electrical' | 'both')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15">
                <option value="all">كل القطاعات</option>
                <option value="home">منزلي</option>
                <option value="electrical">كهربائي</option>
                <option value="both">كلاهما</option>
              </select>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* أعلى 5 عملاء عليهم مستحقات - بروفايل سريع */}
            {!search && overdueCustomers.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50/70 to-white p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Star className="h-4 w-4" /></span>
                    <div>
                      <h4 className="text-sm font-black text-[#0b2337]">أعلى 5 عملاء عليهم مستحقات</h4>
                      <p className="text-[10px] font-bold text-slate-500">اضغط على أي عميل لعرض تفاصيله وتسجيل التحصيل</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2 py-1 rounded-full">أولوية التحصيل</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
                  {topOverdueCustomers.map((customer, idx) => {
                    const debt = getCustomerDebt(customer);
                    const isSelected = selectedCustomer?.id === customer.id;
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(customer.id)}
                        className={`text-right rounded-xl border p-3 transition group ${isSelected ? 'border-emerald-400 bg-emerald-50 shadow-sm ring-1 ring-emerald-200' : 'border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm'}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <img
                            src={resolveCustomerStoreAvatar(customer)}
                            alt={customer.name}
                            referrerPolicy="no-referrer"
                            onError={handleStoreAvatarError}
                            className={`w-10 h-10 rounded-xl object-cover shrink-0 border shadow-xs ${idx === 0 ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200 bg-slate-50'}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-xs text-[#0b2337] truncate group-hover:text-amber-800">{customer.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">{customer.code || '—'}</div>
                          </div>
                          {idx === 0 && <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">#1</span>}
                        </div>
                        <div className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-1.5">
                          <div className="text-[9px] font-bold text-rose-600">المستحق</div>
                          <div className="text-sm font-black text-rose-700 tabular-nums">{formatCurrency(debt)}</div>
                        </div>
                        <div className="mt-1.5 text-[10px] text-slate-500 truncate">{customer.salesRepName || customer.repName || 'بدون مندوب'}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {overdueCustomers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-10 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-inner">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h4 className="text-base font-black text-slate-900">لا يوجد عملاء متأخرين</h4>
                <p className="mt-1 text-sm text-slate-600">جميع العملاء في حالة جيدة — استمر في المتابعة اليومية.</p>
              </div>
            ) : (
              pagedOverdueCustomers.map((customer) => {
                const debt = getCustomerDebt(customer);
                const amountValue = amountByCustomer[customer.id] ?? 0;
                const noteValue = notesByCustomer[customer.id] ?? '';
                const isSelected = selectedCustomer?.id === customer.id;
                const returnStats =
                  returnsByCustomerKey.get(customer.id) ||
                  (customer.code ? returnsByCustomerKey.get(customer.code) : undefined) ||
                  { count: 0, value: 0, pending: 0 };
                const totalCollectedCustomer = Math.max(
                  Number(customer.collections2026 || 0),
                  Number(customer.totalMonthlyCollections || 0),
                  Number(customer.totalOverallCollections || 0),
                  Number(customer.lastCollectionAmount || 0)
                );

                return (
                  <div
                    key={customer.id}
                    className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 shadow-md ring-1 ring-emerald-300'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
                      <div className="min-w-0 flex-1 flex flex-col justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={resolveCustomerStoreAvatar(customer)}
                            alt={customer.name}
                            referrerPolicy="no-referrer"
                            onError={handleStoreAvatarError}
                            className="h-14 w-14 rounded-2xl object-cover border-2 border-slate-200 bg-slate-100 shadow-xs shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-base sm:text-lg font-black text-slate-950 truncate">{customer.name}</h4>
                              <span className="shrink-0 text-xs font-black text-rose-700">مستحق للتحصيل</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-bold text-slate-700">
                              <span className="font-mono font-black text-slate-900">{customer.code || '—'}</span>
                              <span aria-hidden="true" className="text-slate-400">·</span>
                              <span>{customer.branchName || 'فرع رئيسي'}</span>
                              <span aria-hidden="true" className="text-slate-400">·</span>
                              <span>{customer.salesRepName || customer.repName || 'مندوب غير محدد'}</span>
                            </div>
                            {customer.phone && (
                              <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-800">
                                <a
                                  href={`tel:${customer.phone}`}
                                  className="inline-flex items-center gap-1 hover:text-blue-700 transition"
                                >
                                  <Phone className="h-3.5 w-3.5 text-slate-700" />
                                  <span className="font-mono tabular-nums" dir="ltr">{customer.phone}</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* قسم منسّق للتحصيل والمديونيات والمرتجعات واضح أثناء الحركة */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-slate-200 bg-slate-50/90 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-200">
                          <div className="px-3.5 py-2.5">
                            <div className="text-xs font-extrabold text-rose-800">المديونية المستحقة</div>
                            <div className="mt-0.5 text-base sm:text-lg font-black text-rose-700 tabular-nums">
                              {formatCurrency(debt)}
                            </div>
                            <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                              الحد: {customer.creditLimit ? formatCurrency(customer.creditLimit) : 'غير محدد'}
                            </div>
                          </div>

                          <div className="px-3.5 py-2.5">
                            <div className="text-xs font-extrabold text-emerald-800">التحصيل المسجل</div>
                            <div className="mt-0.5 text-base sm:text-lg font-black text-emerald-800 tabular-nums">
                              {totalCollectedCustomer > 0 ? formatCurrency(totalCollectedCustomer) : '0 ج.م'}
                            </div>
                            <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                              {customer.lastCollectionDate ? `آخر تحصيل: ${customer.lastCollectionDate}` : 'لم يُسجّل تحصيل'}
                            </div>
                          </div>

                          <div className="px-3.5 py-2.5">
                            <div className="text-xs font-extrabold text-amber-900">المرتجعات</div>
                            <div className={`mt-0.5 text-base sm:text-lg font-black tabular-nums ${returnStats.count > 0 ? 'text-amber-800' : 'text-slate-800'}`}>
                              {returnStats.value > 0 ? formatCurrency(returnStats.value) : `${returnStats.count} إذن`}
                            </div>
                            <div className="text-[11px] font-bold text-slate-700 mt-0.5">
                              {returnStats.count > 0
                                ? `${returnStats.count} إذن${returnStats.pending > 0 ? ` (${returnStats.pending} معلق)` : ''}`
                                : 'لا توجد مرتجعات'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="w-full xl:w-[340px] shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 flex flex-col justify-between">
                        <div className="grid gap-2.5">
                          <label className="text-xs font-black text-slate-900">
                            مبلغ التحصيل
                            <div className="mt-1.5 flex gap-2">
                              <input
                                type="number"
                                min={0}
                                value={amountValue}
                                onChange={(event) => setAmountByCustomer((prev) => ({
                                  ...prev,
                                  [customer.id]: Math.max(0, Number(event.target.value || 0)),
                                }))}
                                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-black text-slate-950 tabular-nums outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-500/20"
                              />
                              <button
                                type="button"
                                onClick={() => setAmountByCustomer((prev) => ({ ...prev, [customer.id]: Math.max(debt, 0) }))}
                                className="min-h-[44px] shrink-0 rounded-xl border border-emerald-400 bg-emerald-50 px-3.5 text-xs font-black text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                                title="تعبئة كامل المبلغ المستحق"
                              >
                                كامل
                              </button>
                            </div>
                          </label>

                          <label className="text-xs font-black text-slate-900">
                            ملاحظة التحصيل
                            <input
                              value={noteValue}
                              onChange={(event) => setNotesByCustomer((prev) => ({
                                ...prev,
                                [customer.id]: event.target.value,
                              }))}
                              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-950 placeholder:text-slate-500 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-500/20"
                              placeholder="أدخل ملاحظة التحصيل (اختياري)..."
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => openConfirmModal(customer)}
                            disabled={amountValue <= 0}
                            className="min-h-[44px] inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3 py-2.5 text-xs sm:text-sm font-black text-white shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            تسجيل تحصيل
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(customer.id)}
                            className={`min-h-[44px] rounded-xl border px-3.5 py-2.5 text-xs font-black transition cursor-pointer ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-100 text-emerald-950'
                                : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                            }`}
                          >
                            تفاصيل
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {visibleCustomersCount < overdueCustomers.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCustomersCount((c) => c + CUSTOMERS_PAGE_SIZE)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0b2337] hover:bg-[#123f5c] px-5 py-2.5 text-xs font-black text-white shadow-sm transition"
                >
                  عرض المزيد ({overdueCustomers.length - visibleCustomersCount} متبقي)
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* تفاصيل العميل المختار */}
        <div className="space-y-4 xl:sticky xl:top-4">
          <div className="tg-card p-4 sm:p-5 border border-[var(--tg-line)]">
            <div className="mb-4">
              <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337]">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ShieldCheck className="h-4 w-4" /></span>
                تفاصيل العميل المختار
              </h3>
            </div>

            {selectedCustomer ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-gradient-to-l from-slate-50 to-white border border-slate-200 p-3.5 flex items-center gap-3">
                  <img
                    src={resolveCustomerStoreAvatar(selectedCustomer)}
                    alt={selectedCustomer.name}
                    referrerPolicy="no-referrer"
                    onError={handleStoreAvatarError}
                    className="h-12 w-12 rounded-2xl object-cover border border-slate-200 bg-white shadow-xs shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">العميل</div>
                    <div className="mt-0.5 text-base font-black text-[#0b2337] truncate">{selectedCustomer.name}</div>
                    <div className="mt-0.5 text-xs font-medium text-slate-600 truncate">{selectedCustomer.code} • {selectedCustomer.phone || 'لا يوجد هاتف'}</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-700/80">المتبقي</div>
                    <div className="mt-1 text-lg font-black text-rose-700 tabular-nums">{formatCurrency(getCustomerDebt(selectedCustomer))}</div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800/80">الحالة</div>
                    <div className="mt-1 text-lg font-black text-amber-800">متأخر</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-sm">
                  <div className="mb-2 font-black text-slate-800">معلومات العميل</div>
                  <div className="space-y-1.5 text-xs font-medium text-slate-600">
                    <div className="flex justify-between gap-2"><span className="text-slate-500">الفرع</span><span className="font-bold text-slate-800">{selectedCustomer.branchName || 'غير محدد'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-500">المندوب</span><span className="font-bold text-slate-800">{selectedCustomer.salesRepName || selectedCustomer.repName || 'غير محدد'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-500">العنوان</span><span className="font-bold text-slate-800 text-left">{selectedCustomer.address || selectedCustomer.region || 'غير محدد'}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-500">آخر تحصيل</span><span className="font-bold text-slate-800">{selectedCustomer.lastCollectionDate || 'لا يوجد'}</span></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                  <div className="flex items-center gap-2 text-sm font-black text-emerald-900"><Sparkles className="h-4 w-4" /> تذكير</div>
                  <p className="mt-1 text-xs leading-6 text-emerald-900/80 font-medium">سجّل التحصيل فور استلامه لتحديث رصيد العميل وإظهار إنجازك في تقارير اليوم.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-medium text-slate-500">
                لا يوجد عميل محدد حاليًا
              </div>
            )}
          </div>
        </div>
      </div>

      {/* جدول التحصيل اليومي */}
      <div className="tg-card p-4 sm:p-5 border border-[var(--tg-line)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337]">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><TrendingUp className="h-4 w-4" /></span>
              تحصيلات اليوم حسب المندوب
            </h3>
            <p className="mt-1 text-[11px] font-bold text-[var(--tg-muted)]">تتبع مباشر لما تم تحصيله اليوم</p>
          </div>
          <div className="inline-flex items-center self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-800">
            {dailyCollectionRows.length} مندوب سجّل تحصيل
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-right text-sm">
            <thead>
              <tr className="bg-slate-50 text-[var(--tg-muted)] border-b border-slate-200">
                <th className="py-3 pr-4 pl-2 text-[11px] font-black">المندوب</th>
                <th className="py-3 px-3 text-[11px] font-black">عدد التحصيلات</th>
                <th className="py-3 px-3 text-[11px] font-black">إجمالي التحصيل</th>
                <th className="py-3 px-3 text-[11px] font-black">نسبة التحصيل</th>
              </tr>
            </thead>
            <tbody>
              {dailyCollectionRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500 font-medium">لا توجد تحصيلات مسجلة اليوم بعد</td>
                </tr>
              ) : (
                dailyCollectionRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition">
                    <td className="py-3 pr-4 pl-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={row.avatarUrl || '/assets/rep-avatar.jpg'}
                          alt={row.repName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.fallback) {
                              img.dataset.fallback = '1';
                              img.src = '/assets/rep-avatar.jpg';
                            }
                          }}
                          className="h-9 w-9 rounded-xl object-cover object-top border border-slate-200 shrink-0"
                        />
                        <span className="font-black text-slate-900">{row.repName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-700">{row.count}</td>
                    <td className="px-3 py-3 font-black text-emerald-700 tabular-nums">{formatCurrency(row.collected)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, row.proportion)}%` }} />
                        </div>
                        <span className="text-xs font-black text-emerald-800 w-10 text-left">{row.proportion}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* بروفايلات المناديب */}
      <div className="tg-card p-4 sm:p-5 border border-[var(--tg-line)]">
        <div className="mb-4">
          <h3 className="tg-card__title flex items-center gap-2 text-[#0b2337]">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Star className="h-4 w-4" /></span>
            بروفايل المناديب
          </h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {repSummaries.map((rep) => (
            <div key={rep.repId} className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-3">
                <img
                  src={rep.avatarUrl || '/assets/rep-avatar.jpg'}
                  alt={rep.repName}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallback) {
                      img.dataset.fallback = '1';
                      img.src = '/assets/rep-avatar.jpg';
                    }
                  }}
                  className="h-12 w-12 rounded-2xl object-cover object-top border-2 border-emerald-200 shadow-sm shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-base font-black text-[#0b2337] truncate">{rep.repName}</div>
                  <div className="text-xs font-bold text-slate-600">{rep.customers} عميل متأخر / متعامل</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">إجمالي البيع</div>
                  <div className="mt-1 text-sm font-black text-slate-900 tabular-nums">{formatCurrency(rep.sales)}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">المحصّل</div>
                  <div className="mt-1 text-sm font-black text-emerald-800 tabular-nums">{formatCurrency(rep.collections)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-white border border-slate-200 p-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>نسبة التحصيل</span>
                  <span className="text-emerald-700">{rep.rate}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-500" style={{ width: `${Math.min(100, rep.rate)}%` }} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600">
                <div className="rounded-lg bg-slate-100 px-2.5 py-2">الزيارات: <span className="text-slate-900">{rep.visits}</span></div>
                <div className="rounded-lg bg-slate-100 px-2.5 py-2 truncate">آخر: <span className="text-slate-900">{rep.lastVisit || '—'}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* تأكيد التحصيل */}
      {confirmCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4" onClick={() => setConfirmCustomer(null)}>
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-black text-[#0b2337]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" /></span>
                تأكيد التحصيل وتوثيق الموقع
              </div>
              <button type="button" onClick={() => setConfirmCustomer(null)} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center gap-3">
                <img
                  src={resolveCustomerStoreAvatar(confirmCustomer)}
                  alt={confirmCustomer.name}
                  referrerPolicy="no-referrer"
                  onError={handleStoreAvatarError}
                  className="h-11 w-11 rounded-xl object-cover border border-slate-200 bg-white shadow-xs shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-black text-[#0b2337] text-base truncate">{confirmCustomer.name}</div>
                  <div className="text-[11px] font-mono text-slate-500">{confirmCustomer.code || '—'}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-slate-700 font-bold"><span>المبلغ المستحق</span><span className="font-black text-rose-700 tabular-nums">{formatCurrency(getCustomerDebt(confirmCustomer))}</span></div>
              <div className="mt-1.5 flex items-center justify-between text-slate-700 font-bold"><span>سيتم تسجيل</span><span className="font-black text-emerald-700 text-base tabular-nums">{formatCurrency(Number(amountByCustomer[confirmCustomer.id] ?? 0))}</span></div>
            </div>

            {/* التحقق الحي من موقع التحصيل */}
            {(() => {
              const badge = geoStatusBadgeMeta(confirmGeoCheck?.status);
              const toneClass =
                badge.tone === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : badge.tone === 'warn'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : badge.tone === 'risk'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-slate-200 bg-slate-50 text-slate-800';
              return (
                <div className={`rounded-2xl border p-3.5 text-xs space-y-2 ${toneClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>
                        {confirmGpsLoading ? 'جاري التقاط موقعك الحي...' : confirmGeoCheck?.label || 'حالة الـ GPS'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchCollectionGps()}
                      disabled={confirmGpsLoading}
                      className="inline-flex items-center gap-1 rounded-lg border border-current/25 bg-white/80 px-2 py-1 text-[11px] font-black hover:bg-white cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${confirmGpsLoading ? 'animate-spin' : ''}`} />
                      تحديث GPS
                    </button>
                  </div>

                  {confirmRepGps && (
                    <div className="text-[11px] font-bold opacity-85 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="font-mono">{confirmRepGps.latitude.toFixed(5)}, {confirmRepGps.longitude.toFixed(5)}</span>
                      {confirmRepGps.accuracy !== undefined && <span>دقة: ±{confirmRepGps.accuracy}م</span>}
                      {confirmGeoCheck?.distanceMeters !== undefined && (
                        <span>المسافة للعميل: {formatDistance(confirmGeoCheck.distanceMeters)}</span>
                      )}
                    </div>
                  )}

                  {confirmGpsError && (
                    <div className="text-[11px] font-bold text-rose-700">{confirmGpsError}</div>
                  )}

                  {confirmCustomer.locationLocked && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                      <Lock className="w-3.5 h-3.5" />
                      <span>موقع العميل الأساسي مقفول ومعتمد ولا يتغير من التحصيل</span>
                    </div>
                  )}

                  {!confirmCustomer.latitude && !confirmCustomer.longitude && !confirmCustomer.locationLocked && confirmRepGps && (
                    <label className="flex items-center gap-2 pt-1 text-[11px] font-black cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmPinInitialLocation}
                        onChange={(e) => setConfirmPinInitialLocation(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>تثبيت هذا الموقع كإحداثي مبدئي للعميل (لأنه غير مثبت بعد)</span>
                    </label>
                  )}

                  {confirmGeoCheck?.requiresLivePhoto && (
                    <div className="pt-1.5 border-t border-current/15 space-y-2">
                      <div className="font-black text-[11px]">
                        مطلوب التقاط صورة حية لواجهة العميل (مختومة بالوقت والموقع) بسبب التحذير:
                      </div>
                      <label className="inline-flex items-center gap-2 rounded-xl bg-white border border-current/30 px-3 py-2 text-xs font-black cursor-pointer hover:bg-slate-50">
                        <Camera className="w-4 h-4" />
                        <span>{confirmUploadingProof ? 'جاري الختم والرفع...' : confirmProofPhoto ? 'تغيير صورة الإثبات' : 'التقاط صورة إثبات حية'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={confirmUploadingProof}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleConfirmProofUpload(f);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      {confirmProofPhoto && (
                        <img
                          src={confirmProofPhoto}
                          alt="صورة إثبات التحصيل"
                          className="h-24 w-full rounded-xl object-cover border border-white shadow-xs"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmCustomer(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={confirmUploadingProof}
                onClick={() => handleSave(confirmCustomer)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:brightness-110 transition disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                تأكيد الحفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-2xl border border-emerald-400/30 bg-[#0b2337] px-4 py-3 text-sm font-bold text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300"><CheckCircle2 className="h-4 w-4" /></span>
              <span>{toast}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition" aria-label="إغلاق">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
