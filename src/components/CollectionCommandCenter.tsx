import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  CreditCard,
  Filter,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  UploadCloud,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { inferCustomerSector } from '../data/branchDefinitions';
import {
  normalizeCloudinaryConfig,
  uploadImageToCloudinary,
} from '../services/cloudinaryService';
import {
  LiveGpsReading,
  requestLiveGps,
  verifyVisitLocation,
  watermarkAndCompressLivePhoto,
} from '../services/geoVerificationService';
import type { Customer, CustomerVisit } from '../types';
import { CustomerSearchSelect } from './CustomerSearchSelect';

const CollectionForecastView = lazy(() => import('./CollectionForecastView'));

const todayKey = () => new Date().toISOString().slice(0, 10);

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

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');
const fmtShort = (n: number) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}م`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}ألف`;
  return fmt(Math.round(v));
};
const monthKeyNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type TabKey = 'today' | 'plan' | 'insights';

export function CollectionCommandCenter() {
  const appAny = useApp() as any;
  const {
    currentUser,
    customers,
    users,
    visits,
    targets,
    getVisibleCustomers,
    addVisit,
    updateCustomer,
    cloudinaryConfig,
    isOffline,
    offlineQueueCount,
  } = appAny;

  const [tab, setTab] = useState<TabKey>('today');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('الكل');
  const [repFilter, setRepFilter] = useState('الكل');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // record modal state
  const [modalCustomer, setModalCustomer] = useState<Customer | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<LiveGpsReading | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [pinInitial, setPinInitial] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const baseCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    return (list || []).filter((c) => !!c);
  }, [getVisibleCustomers, customers]);

  const debtCustomers = useMemo(() => {
    return baseCustomers
      .map((c) => ({ c, debt: getCustomerDebt(c) }))
      .filter((x) => x.debt > 0)
      .map((x) => x.c);
  }, [baseCustomers]);

  const branchOptions = useMemo(
    () => ['الكل', ...Array.from(new Set(debtCustomers.map((c) => c.branchName).filter(Boolean) as string[]))],
    [debtCustomers]
  );
  const repOptions = useMemo(
    () => ['الكل', ...Array.from(new Set(debtCustomers.map((c) => c.repName || c.salesRepName).filter(Boolean) as string[]))],
    [debtCustomers]
  );

  const queue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debtCustomers
      .filter((c) => {
        if (branchFilter !== 'الكل' && (c.branchName || '') !== branchFilter) return false;
        const rep = c.repName || c.salesRepName || '';
        if (repFilter !== 'الكل' && rep !== repFilter) return false;
        if (q) {
          const hay = `${c.name || ''} ${c.code || ''} ${rep} ${c.branchName || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => getCustomerDebt(b) - getCustomerDebt(a))
      .slice(0, 40);
  }, [debtCustomers, branchFilter, repFilter, search]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return debtCustomers
      .filter((c) => {
        const rep = c.repName || c.salesRepName || '';
        const hay = `${c.name || ''} ${c.code || ''} ${rep} ${c.branchName || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [debtCustomers, search]);

  const today = todayKey();
  const todayVisits = useMemo(() => visits.filter((v) => v.date === today), [visits, today]);
  const todayCollected = useMemo(
    () => todayVisits.reduce((s, v) => s + Number(v.collectedAmount || 0), 0),
    [todayVisits]
  );
  const todayCount = todayVisits.filter((v) => Number(v.collectedAmount || 0) > 0).length;

  const monthKey = monthKeyNow();
  const monthPrefix = monthKey + '-';
  const monthVisits = useMemo(() => visits.filter((v) => (v.date || '').startsWith(monthPrefix)), [visits, monthPrefix]);
  const monthActual = useMemo(
    () => monthVisits.reduce((s, v) => s + Number(v.collectedAmount || 0), 0),
    [monthVisits]
  );
  const monthTarget = useMemo(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    const list = (targets || []).filter((t: any) => Number(t.year) === y && Number(t.month) === m);
    return list.reduce((s: number, t: any) => s + Number(t.collectionTarget || 0), 0);
  }, [targets]);
  const expectedMonth = useMemo(() => {
    const list: any[] = (appAny.collectionForecasts || []) as any[];
    if (!Array.isArray(list)) return 0;
    return list
      .filter((r) => r && r.monthKey === monthKey)
      .reduce((s, r) => s + Number(r.collectionForecast || 0), 0);
  }, [appAny.collectionForecasts, monthKey]);

  const att = monthTarget > 0 ? (monthActual / monthTarget) * 100 : 0;
  const remaining = Math.max(0, (monthTarget || 0) - monthActual);
  const totalDebt = useMemo(() => debtCustomers.reduce((s, c) => s + getCustomerDebt(c), 0), [debtCustomers]);

  const openModal = (c: Customer) => {
    setModalCustomer(c);
    setAmount(0);
    setNote('');
    setGps(null);
    setGpsError(null);
    setProofPhoto(null);
    setPinInitial(!c.latitude || !c.longitude);
  };

  const fetchGps = async () => {
    setGpsLoading(true);
    setGpsError(null);
    const res = await requestLiveGps(10000);
    setGpsLoading(false);
    if (res.ok) setGps(res.coords);
    else {
      setGps(null);
      setGpsError('error' in res ? res.error : 'تعذر التقاط الموقع');
    }
  };

  const geoCheck = useMemo(() => {
    if (!modalCustomer) return null;
    return verifyVisitLocation({
      repGps: gps,
      customer: modalCustomer,
      repVisits: visits,
      repId: currentUser?.id,
    });
  }, [modalCustomer, gps, visits, currentUser?.id]);

  const uploadProof = async (file?: File | null) => {
    if (!file || !modalCustomer) return;
    setUploadingProof(true);
    try {
      const stamped = await watermarkAndCompressLivePhoto(file, {
        customerName: modalCustomer.name,
        repName: currentUser?.name || 'المندوب',
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        distanceMeters: geoCheck?.distanceMeters,
        reason: 'إثبات تحصيل',
      });
      const uploaded = await uploadImageToCloudinary(
        stamped,
        normalizeCloudinaryConfig(cloudinaryConfig),
        'tantawy_collection_proofs'
      );
      setProofPhoto(uploaded.url);
    } catch {
      setToast('تعذر رفع صورة الإثبات — تأكد من الاتصال أو احفظ بدون صورة إذا لم تُشترط');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setUploadingProof(false);
    }
  };

  const saveCollection = () => {
    if (!currentUser || !modalCustomer) return;
    const amt = Number(amount || 0);
    if (amt <= 0) {
      setToast('يرجى إدخال مبلغ التحصيل');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const check = geoCheck || verifyVisitLocation({ repGps: gps, customer: modalCustomer, repVisits: visits, repId: currentUser.id });
    if (check.requiresLivePhoto && !proofPhoto) {
      setToast('يلزم صورة إثبات حية لأن الموقع خارج النطاق أو غير متحقق');
      setTimeout(() => setToast(null), 3500);
      return;
    }
    const visit: Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy'> = {
      customerId: modalCustomer.id,
      customerName: modalCustomer.name,
      customerCode: modalCustomer.code,
      date: today,
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      repId: currentUser.id,
      repName: currentUser.name,
      branchName: modalCustomer.branchName || currentUser.branchName,
      sector: (modalCustomer.sector as any) || (currentUser as any).sector || 'all',
      supervisorId: currentUser.supervisorId,
      supervisorName: currentUser.supervisorName || 'المشرف',
      type: 'تحصيل',
      outcome: 'تم التحصيل',
      status: 'منفذة',
      collectedAmount: amt,
      notes: note.trim() || `تحصيل مبلغ ${formatCurrency(amt)} من العميل ${modalCustomer.name}`,
      location: gps ? { latitude: gps.latitude, longitude: gps.longitude, accuracy: gps.accuracy, timestamp: gps.timestamp } : undefined,
      geoVerification: {
        status: check.status,
        distanceMeters: check.distanceMeters,
        accuracyMeters: check.accuracyMeters,
        speedKmh: check.speedKmh,
        flags: check.flags,
        proofPhotoUrl: proofPhoto || undefined,
        verifiedAt: check.verifiedAt,
      },
      reviewStatus: check.requiresSupervisorReview ? 'pending' : 'approved',
      reviewedByName: check.requiresSupervisorReview ? undefined : currentUser.name,
      reviewNote: check.requiresSupervisorReview ? `تنبيه موقع التحصيل: ${check.label}` : 'تم تسجيل التحصيل',
      syncStatus: isOffline ? 'local_only' : 'synced',
    } as any;

    const result = addVisit(visit);
    const debt = getCustomerDebt(modalCustomer);
    const remainingDebt = Math.max(0, debt - amt);
    const shouldPin = Boolean(gps) && pinInitial && !modalCustomer.locationLocked && (!modalCustomer.latitude || !modalCustomer.longitude);
    updateCustomer({
      ...modalCustomer,
      balance: remainingDebt,
      currentBalance: remainingDebt,
      overdueBalance: remainingDebt,
      totalOverdue: remainingDebt,
      dueBalance: remainingDebt,
      lastCollectionDate: visit.date,
      lastCollectionAmount: amt,
      ...(shouldPin && gps ? {
        latitude: gps.latitude,
        longitude: gps.longitude,
        locationCapturedAt: new Date().toISOString(),
        locationCapturedBy: currentUser.name,
        locationAccuracy: gps.accuracy,
        ...(proofPhoto ? { locationPhotoUrl: proofPhoto } : {}),
      } : {}),
    } as Customer);

    setToast(result?.success
      ? `تم حفظ التحصيل (${formatCurrency(amt)}) ${isOffline ? 'محليًا — سيُرفع تلقائيًا عند الاتصال' : 'وبدء المزامنة'}`
      : (result?.message || 'تم حفظ التحصيل'));
    setModalCustomer(null);
    setTimeout(() => setToast(null), 4500);
  };

  // insights helpers
  const aging = useMemo(() => {
    const buckets = [
      { label: 'حالي (0-7)', v: 0 },
      { label: '8–15 يوم', v: 0 },
      { label: '16–30 يوم', v: 0 },
      { label: '> 30 يوم', v: 0 },
    ];
    debtCustomers.forEach((c) => {
      const debt = getCustomerDebt(c);
      const last = c.lastVisitDate || c.lastCollectionDate || c.lastOrderDate || '';
      const days = last ? Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 86400000)) : 31;
      const idx = days <= 7 ? 0 : days <= 15 ? 1 : days <= 30 ? 2 : 3;
      buckets[idx].v += debt;
    });
    const sum = buckets.reduce((s, b) => s + b.v, 0) || 1;
    return buckets.map((b) => ({ ...b, p: (b.v / sum) * 100 }));
  }, [debtCustomers]);

  const branchAgg = useMemo(() => {
    const map = new Map<string, number>();
    monthVisits.forEach((v) => {
      const b = v.branchName || 'غير محدد';
      map.set(b, (map.get(b) || 0) + Number(v.collectedAmount || 0));
    });
    const rows = Array.from(map.entries()).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v).slice(0, 6);
    const max = rows[0]?.v || 1;
    return rows.map((r) => ({ ...r, p: (r.v / max) * 100 }));
  }, [monthVisits]);

  const weekly = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const buckets = [0, 0, 0, 0, 0];
    monthVisits.forEach((v) => {
      const d = Number((v.date || '').slice(8, 10));
      if (!d) return;
      const idx = Math.min(4, Math.floor((d - 1) / 7));
      buckets[idx] += Number(v.collectedAmount || 0);
    });
    const labels = ['أسبوع 1', 'أسبوع 2', 'أسبوع 3', 'أسبوع 4', 'أسبوع 5'].slice(0, daysInMonth > 28 ? 5 : 4);
    const vals = buckets.slice(0, labels.length);
    const max = Math.max(1, monthTarget / labels.length, ...vals);
    return labels.map((l, i) => ({ label: l, actual: vals[i], expected: monthTarget ? monthTarget / labels.length : 0, p: (vals[i] / max) * 100, pe: ((monthTarget ? monthTarget / labels.length : 0) / max) * 100 }));
  }, [monthVisits, monthTarget]);

  const syncBadge = isOffline
    ? { cls: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-400/30', text: 'أوفلاين — محفوظ محليًا' }
    : (offlineQueueCount || 0) > 0
      ? { cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-400/30', text: `${offlineQueueCount} عملية بانتظار الرفع` }
      : { cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-400/30', text: 'متصل — متزامن' };

  return (
    <div className="w-full max-w-[1480px] mx-auto p-3 md:p-5 space-y-4" dir="rtl">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-bold">{toast}</div>
      )}

      {/* Hero */}
      <section className="ds-pagehead">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="ds-crumb text-[11px] font-bold mb-1">الرئيسية <span className="mx-1">›</span> <strong>التحصيل</strong></div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/20"><Wallet className="w-4 h-4 sm:w-5 sm:h-5"/></div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-white leading-tight">مركز قيادة التحصيل</h1>
                <p className="ds-pagehead__hint text-xs mt-0.5 max-w-2xl leading-relaxed">مهام اليوم، الخطة مقابل الفعلي، وتحليلات التقدّم — بحفظ أوفلاين ورفع تلقائي.</p>
              </div>
            </div>
          </div>
          <div className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-extrabold border rounded-full px-2.5 py-1 ${isOffline ? 'bg-red-500/20 border-red-300/40 text-red-100' : (offlineQueueCount||0)>0 ? 'bg-amber-500/20 border-amber-300/40 text-amber-100' : 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current"/><span className="whitespace-nowrap">{isOffline ? 'أوفلاين' : (offlineQueueCount||0)>0 ? `${offlineQueueCount} معلّق` : 'متزامن'}</span>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] gap-1.5 sm:gap-2 mt-3 sm:max-w-[620px]">
          <div className="rounded-xl sm:rounded-2xl bg-white/10 border border-white/15 px-2.5 py-2">
            <div className="text-[10px] font-bold text-blue-100 leading-tight">عملاء بمديونية</div>
            <div className="text-[13px] sm:text-xl font-black text-white leading-tight tabular-nums">{queue.length}</div>
          </div>
          <div className="rounded-xl sm:rounded-2xl bg-white/10 border border-white/15 px-2.5 py-2">
            <div className="text-[10px] font-bold text-blue-100 leading-tight">إجمالي الذمم</div>
            <div className="text-[13px] sm:text-xl font-black text-white leading-tight tabular-nums">{fmtShort(totalDebt)}</div>
          </div>
          <div className="rounded-xl sm:rounded-2xl bg-white/10 border border-white/15 px-2.5 py-2">
            <div className="text-[10px] font-bold text-blue-100 leading-tight">تحقيق الهدف ({Math.round(att || 0)}%)</div>
            <div className="text-[13px] sm:text-xl font-black text-white leading-tight tabular-nums">{fmtShort(monthActual)}<span className="text-[10px] font-bold text-blue-100"> / {fmtShort(monthTarget || 0)}</span></div>
          </div>
        </div>
      </section>

      {/* Tabs + sync */}
      <div className="tg-card p-2 flex flex-col md:flex-row md:items-center gap-2">
        <div className="grid grid-cols-3 gap-1 flex-1">
          {([
            {k:'today', label:'اليوم (تنفيذ)', icon:<Calendar size={15}/>},
            {k:'plan', label:'الخطة (متوقع/فعلي)', icon:<Target size={15}/>},
            {k:'insights', label:'نظرة عامة', icon:<BarChart3 size={15}/>},
          ] as const).map(t => (
            <button key={t.k} onClick={()=>setTab(t.k)} className={`inline-flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-[11px] sm:text-sm font-extrabold transition truncate ${tab===t.k?'bg-[var(--role)] text-white shadow-md':'bg-[var(--app-card-secondary)] text-[var(--tg-muted)] border border-[var(--tg-line)] hover:text-[var(--tg-ink)]'}`}>
              {t.icon}<span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
        <div className={`text-xs font-extrabold border rounded-xl px-3 py-2 whitespace-nowrap ${syncBadge.cls}`}>{syncBadge.text}</div>
      </div>

      {tab === 'today' && (
        <div className="space-y-4">
          {/* filters */}
          <div className="tg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
              <div className="relative min-w-0 col-start-1 row-start-1 sm:shrink-0 sm:w-[320px]">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tg-muted)]"/>
                <input
                  value={search}
                  onChange={e=>{ setSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={()=>setShowSuggestions(true)}
                  onBlur={()=>setTimeout(()=>setShowSuggestions(false), 150)}
                  placeholder="بحث عميل بالاسم أو الكود"
                  aria-label="بحث عميل بالاسم أو الكود"
                  className="tg-input tg-input--search"
                />
                {search && <button type="button" aria-label="مسح البحث" onMouseDown={(e)=>e.preventDefault()} onClick={()=>{setSearch(''); setShowSuggestions(false);}} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-[var(--tg-muted)] hover:text-[var(--tg-ink)]"><X size={14}/></button>}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-30 top-full mt-1 w-full min-w-[260px] bg-[var(--tg-card)] border border-[var(--tg-line)] rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e)=>e.preventDefault()}
                        onClick={()=>{ setSearch(c.name || c.code || ''); setShowSuggestions(false); }}
                        className="w-full text-right px-3 py-2.5 hover:bg-[var(--app-card-hover)] border-b border-[var(--tg-line)] last:border-b-0"
                      >
                        <div className="font-extrabold text-sm text-[var(--tg-ink)] truncate">{c.name || c.storeName || 'عميل'}</div>
                        <div className="text-[11px] text-[var(--tg-muted)] font-bold flex items-center justify-between gap-2">
                          <span className="font-mono" dir="ltr">{c.code || c.id}</span>
                          <span className="truncate">{c.repName || c.salesRepName || ''} · {c.branchName || ''}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="min-w-0 col-start-2 row-start-1 sm:order-2 shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--tg-muted)] px-2"><Filter size={14}/> <b className="text-[var(--tg-ink)] tabular-nums">{queue.length}</b> عميل</div>
              <div className="min-w-0 col-start-1 row-start-2 sm:shrink-0 sm:w-[190px] sm:order-3"><select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} aria-label="فلتر الفرع" className="tg-select"><option value="الكل">كل الفروع</option>{branchOptions.filter(b=>b!=='الكل').map(b=> <option key={b} value={b}>{b}</option>)}</select></div>
              <div className="min-w-0 col-start-2 row-start-2 sm:shrink-0 sm:w-[190px] sm:order-4"><select value={repFilter} onChange={e=>setRepFilter(e.target.value)} aria-label="فلتر المندوب" className="tg-select"><option value="الكل">كل المناديب</option>{repOptions.filter(r=>r!=='الكل').map(r=> <option key={r} value={r}>{r}</option>)}</select></div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">إجمالي الذمم المعروضة</div><div className="text-lg sm:text-xl font-black text-[var(--tg-ink)] mt-1 tabular-nums">{fmtShort(totalDebt)}</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">محقّق اليوم (فعلي)</div><div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">{fmtShort(todayCollected)}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold">{todayCount} عملية</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">محقّق الشهر</div><div className="text-lg sm:text-xl font-black text-[var(--tg-ink)] mt-1 tabular-nums">{fmtShort(monthActual)}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold">من سجلات التحصيل الفعلية</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">متبقٍ على الهدف</div><div className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-300 mt-1 tabular-nums">{fmtShort(remaining)}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold">هدف {fmtShort(monthTarget || 0)}</div></div>
          </div>

          {/* Queue */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
            {queue.map((c) => {
              const debt = getCustomerDebt(c);
              const rep = c.repName || c.salesRepName || '—';
              return (
                <article key={c.id} className="tg-card flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-[var(--tg-ink)] text-[15px] leading-snug truncate">{c.name || c.storeName || 'عميل'}</div>
                      <div className="text-[11px] text-[var(--tg-muted)] font-bold mt-0.5 truncate">{rep} · {c.branchName || '—'}</div>
                      <div className="text-[10px] text-[var(--tg-muted)] font-mono" dir="ltr">{c.code || c.id}</div>
                    </div>
                    <span className="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-400/30 whitespace-nowrap">مستحق</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[var(--app-card-secondary)] border border-[var(--tg-line)] rounded-xl p-2"><div className="text-[var(--tg-muted)] font-bold">المستحق/الرصيد</div><div className="font-black text-[var(--tg-ink)] mt-0.5 tabular-nums">{fmt(debt)} ج.م</div></div>
                    <div className="bg-[var(--app-card-secondary)] border border-[var(--tg-line)] rounded-xl p-2"><div className="text-[var(--tg-muted)] font-bold">آخر تحصيل</div><div className="font-black text-[var(--tg-ink)] mt-0.5">{c.lastCollectionDate || '—'}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={()=>openModal(c)} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#102b4e] hover:bg-[#16365f] text-white text-xs font-extrabold px-3 py-2.5 rounded-xl"><CreditCard size={14}/>تسجيل تحصيل</button>
                    {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center justify-center gap-1.5 border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] text-xs font-extrabold px-3 py-2.5 rounded-xl hover:bg-[var(--app-card-hover)]"><Phone size={14}/>اتصال</a>}
                  </div>
                </article>
              );
            })}
            {queue.length === 0 && <div className="col-span-full border border-dashed border-[var(--tg-line)] bg-[var(--app-card)] rounded-2xl p-10 text-center text-[var(--tg-muted)] font-bold">لا يوجد عملاء مستحقون ضمن الفلاتر الحالية</div>}
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">مستهدف الشهر (تارجت)</div><div className="text-lg sm:text-xl font-black text-[var(--tg-ink)] mt-1 tabular-nums">{fmtShort(monthTarget || 0)}</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">المتوقع (خطة)</div><div className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-300 mt-1 tabular-nums">{fmtShort(expectedMonth || 0)}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold">من توقعات العملاء/الأسابيع</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">المحصّل الفعلي</div><div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">{fmtShort(monthActual)}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold">من التحصيلات المسجّلة</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">فجوة (متوقع − فعلي)</div><div className="text-lg sm:text-xl font-black text-red-700 dark:text-red-300 mt-1 tabular-nums">{fmtShort(Math.max(0,(expectedMonth||monthTarget||0)-monthActual))}</div></div>
          </div>
          <div className="tg-card p-2 md:p-4">
            <div className="text-sm font-black text-[var(--tg-ink)] px-2 pb-2">خطة وتوقع التحصيل (تفصيلي — إدخال/اعتماد/متابعة)</div>
            <Suspense fallback={<div className="p-8 text-center text-[var(--tg-muted)] font-bold">جاري تحميل الخطة…</div>}>
              <CollectionForecastView />
            </Suspense>
          </div>
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">نسبة تحقيق الهدف</div><div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">{Math.round(att||0)}%</div><div className="text-[11px] text-[var(--tg-muted)] font-bold tabular-nums">{fmtShort(monthActual)} / {fmtShort(monthTarget||0)}</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">إجمالي الذمم</div><div className="text-lg sm:text-xl font-black text-[var(--tg-ink)] mt-1 tabular-nums">{fmtShort(totalDebt)}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold tabular-nums">{debtCustomers.length} عميل</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">تحصيلات الشهر (عدد)</div><div className="text-lg sm:text-xl font-black text-[var(--tg-ink)] mt-1 tabular-nums">{monthVisits.filter(v=>Number(v.collectedAmount||0)>0).length}</div><div className="text-[11px] text-[var(--tg-muted)] font-bold">سجلات فعلية</div></div>
            <div className="tg-card p-3"><div className="text-[11px] font-extrabold text-[var(--tg-muted)]">حالة المزامنة</div><div className={`text-sm font-black mt-2 inline-flex px-2 py-1 rounded-lg border ${syncBadge.cls}`}>{syncBadge.text}</div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-4">
            <section className="tg-card">
              <div className="font-black text-[var(--tg-ink)] mb-1 flex items-center gap-2"><TrendingUp size={16}/> الفعلي المحصّل خلال الشهر (تقريب أسبوعي)</div>
              <div className="text-xs text-[var(--tg-muted)] font-bold mb-3">المصدر: سجلات التحصيل/الزيارات الفعلية</div>
              <div className="space-y-3">
                {weekly.map(w => (
                  <div key={w.label}>
                    <div className="flex justify-between text-xs font-extrabold text-[var(--tg-muted)] mb-1"><span>{w.label}</span><span className="text-[var(--tg-ink)] tabular-nums">{fmtShort(w.actual)} / {fmtShort(w.expected)}</span></div>
                    <div className="h-3 rounded-full bg-[var(--app-card-secondary)] overflow-hidden relative">
                      <div className="absolute inset-y-0 right-0 bg-amber-300/60 dark:bg-amber-400/50" style={{width:`${Math.min(100,w.pe)}%`}} />
                      <div className="absolute inset-y-0 right-0 bg-[#3f7fb5] dark:bg-[#7fc0ff]" style={{width:`${Math.min(100,w.p)}%`}} />
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 text-[11px] font-bold text-[var(--tg-muted)] pt-1"><span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#3f7fb5] dark:bg-[#7fc0ff] inline-block"/>فعلي</span><span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-amber-300 dark:bg-amber-400 inline-block"/>متوقع/مستهدف موزّع</span></div>
              </div>
            </section>

            <section className="tg-card">
              <div className="font-black text-[var(--tg-ink)] mb-1 flex items-center gap-2"><Wallet size={16}/> أعمار المديونية (تركيز المتابعة)</div>
              <div className="text-xs text-[var(--tg-muted)] font-bold mb-3">توزيع الذمم حسب آخر نشاط/تحصيل مسجّل</div>
              <div className="space-y-3">
                {aging.map((b, i) => (
                  <div key={b.label}>
                    <div className="flex justify-between text-xs font-extrabold text-[var(--tg-muted)] mb-1"><span>{b.label}</span><span className="text-[var(--tg-ink)] tabular-nums">{fmtShort(b.v)} ({Math.round(b.p)}%)</span></div>
                    <div className="h-3 rounded-full bg-[var(--app-card-secondary)] overflow-hidden"><div className={`h-full ${i===3?'bg-red-500 dark:bg-red-400':i===2?'bg-amber-500 dark:bg-amber-400':i===1?'bg-[#3f7fb5] dark:bg-[#7fc0ff]':'bg-emerald-600 dark:bg-emerald-400'}`} style={{width:`${b.p}%`}}/></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="tg-card lg:col-span-2">
              <div className="font-black text-[var(--tg-ink)] mb-1 flex items-center gap-2"><BarChart3 size={16}/> الفروع الأعلى تحصيلًا (فعلي الشهر)</div>
              <div className="text-xs text-[var(--tg-muted)] font-bold mb-3">من سجلات التحصيل الفعلية خلال الشهر</div>
              {branchAgg.length === 0 ? (
                <div className="text-sm text-[var(--tg-muted)] font-bold py-6 text-center">لا توجد تحصيلات مسجّلة هذا الشهر بعد</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {branchAgg.map((b) => (
                    <div key={b.name}>
                      <div className="flex justify-between text-xs font-extrabold text-[var(--tg-muted)] mb-1"><span>{b.name}</span><span className="text-[var(--tg-ink)] tabular-nums">{fmtShort(b.v)}</span></div>
                      <div className="h-3 rounded-full bg-[var(--app-card-secondary)] overflow-hidden"><div className="h-full bg-gradient-to-l from-[#1b3c66] to-[#3f7fb5]" style={{width:`${b.p}%`}}/></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-400/30 text-amber-900 dark:text-amber-200 rounded-2xl p-4 text-sm font-bold flex gap-2 items-start">
            <AlertTriangle size={18} className="mt-0.5 flex-none"/>
            <div><b>كيف تُحسب الأرقام:</b> "المحقّق الفعلي" = مجموع مبالغ التحصيل المسجّلة (من الزيارات/التحصيلات) في الفترة. "المتوقع" = خطة توقع التحصيل المدخلة والمعتمدة. "المستهدف" = هدف التحصيل (Targets). الفعلي ينعكس فور التسجيل (محليًا) ويُثبت بعد المزامنة.</div>
          </div>
        </div>
      )}

      {/* Record Collection Modal */}
      {modalCustomer && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={()=>setModalCustomer(null)}>
          <div className="bg-[var(--tg-card)] text-[var(--tg-ink)] w-full md:max-w-xl rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] overflow-auto" onClick={e=>e.stopPropagation()}>
            <div className="sticky top-0 bg-[var(--tg-card)] border-b border-[var(--tg-line)] px-4 py-3 flex items-center justify-between z-10">
              <div>
                <div className="font-black text-[var(--tg-ink)]">تسجيل تحصيل فعلي</div>
                <div className="text-xs text-[var(--tg-muted)] font-bold">{modalCustomer.name} · <span className="font-mono" dir="ltr">{modalCustomer.code}</span></div>
              </div>
              <button onClick={()=>setModalCustomer(null)} aria-label="إغلاق" className="p-2 rounded-lg hover:bg-[var(--app-card-hover)] text-[var(--tg-ink)]"><X size={18}/></button>
            </div>
            <div className="p-4 space-y-4">
              <CustomerSearchSelect
                label="العميل"
                customers={debtCustomers}
                valueId={modalCustomer.id}
                onSelect={(c) => { setModalCustomer(c); setPinInitial(!c.latitude || !c.longitude); }}
                onClear={() => setModalCustomer(null)}
                placeholder="ابحث باسم العميل أو الكود أو الهاتف لتغيير العميل..."
                compact
                maxResults={30}
              />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-[var(--app-card-secondary)] border border-[var(--tg-line)] rounded-xl p-3"><div className="text-[var(--tg-muted)] font-bold text-xs">المستحق/الرصيد</div><div className="font-black text-[var(--tg-ink)] mt-1 tabular-nums">{fmt(getCustomerDebt(modalCustomer))} ج.م</div></div>
                <div className="bg-[var(--app-card-secondary)] border border-[var(--tg-line)] rounded-xl p-3"><div className="text-[var(--tg-muted)] font-bold text-xs">حالة الحفظ</div><div className={`font-extrabold mt-1 text-xs ${isOffline?'text-amber-700 dark:text-amber-300':'text-emerald-700 dark:text-emerald-300'}`}>{isOffline?'سيُحفظ محليًا ويرفع تلقائيًا':'سيُحفظ ويُزامن'}</div></div>
              </div>

              <label className="block">
                <div className="text-xs font-extrabold text-[var(--tg-ink)] mb-1">مبلغ التحصيل (ج.م) <span className="text-red-500">*</span></div>
                <input type="number" min={0} value={amount || ''} onChange={e=>setAmount(Number(e.target.value||0))} className="tg-input text-lg font-black" placeholder="0" />
              </label>
              <label className="block">
                <div className="text-xs font-extrabold text-[var(--tg-ink)] mb-1">ملاحظة (اختياري)</div>
                <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} className="tg-input !min-h-[72px]" placeholder="سبب/ملاحظة التحصيل…" />
              </label>

              <div className="border border-[var(--tg-line)] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-[var(--tg-ink)] flex items-center gap-1.5"><MapPin size={14}/> الموقع (GPS) والتحقق</div>
                  <button onClick={fetchGps} disabled={gpsLoading} className="text-xs font-extrabold px-3 py-1.5 rounded-lg border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] hover:bg-[var(--app-card-hover)] inline-flex items-center gap-1"><RefreshCw size={13} className={gpsLoading?'animate-spin':''}/>{gpsLoading?'جارٍ التحديد…':'تحديد موقعي'}</button>
                </div>
                {gpsError && <div className="text-xs font-bold text-red-600 dark:text-red-400">{gpsError}</div>}
                {gps && <div className="text-xs font-bold text-[var(--tg-muted)]">تم التقاط الموقع بدقة {Math.round(gps.accuracy||0)}م {geoCheck?.distanceMeters!=null ? `· المسافة ${Math.round(geoCheck.distanceMeters)}م` : ''}</div>}
                {geoCheck && <div className={`text-xs font-extrabold inline-flex px-2 py-1 rounded-lg ${geoCheck.status==='verified'?'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{geoCheck.label || (geoCheck.status==='verified'?'الموقع متحقق':'تحقق موقع مطلوب/تنبيه')}</div>}
                {(!modalCustomer.latitude || !modalCustomer.longitude) && (
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--tg-ink)]"><input type="checkbox" checked={pinInitial} onChange={e=>setPinInitial(e.target.checked)} /> تثبيت هذا الموقع كموقع مبدئي للعميل (إن لم يكن مثبتًا)</label>
                )}
              </div>

              <div className="border border-[var(--tg-line)] rounded-xl p-3 space-y-2">
                <div className="text-xs font-extrabold text-[var(--tg-ink)] flex items-center gap-1.5"><Camera size={14}/> صورة إثبات {geoCheck?.requiresLivePhoto ? <span className="text-red-600 dark:text-red-400">(مطلوبة)</span> : <span className="text-[var(--tg-muted)]">(اختياري)</span>}</div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-extrabold px-3 py-2 rounded-lg border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] hover:bg-[var(--app-card-hover)] cursor-pointer"><UploadCloud size={14}/>{uploadingProof?'جارٍ الرفع…':'التقاط/رفع صورة'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>uploadProof(e.target.files?.[0])} /></label>
                  {proofPhoto && <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 size={14}/>تم إرفاق الصورة</span>}
                </div>
                <div className="text-[11px] text-[var(--tg-muted)] font-bold">تُضاف علامة مائية وتُضغط — وقد تتطلب اتصالًا للرفع؛ الحفظ الأساسي لا يُفقد أوفلاين.</div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-400/30 text-blue-900 dark:text-blue-200 rounded-xl p-3 text-xs font-bold">سيتم تسجيل التحصيل كزيارة فعلية بالمبلغ المدخل وتحديث رصيد العميل. <b>محقّق الشهر</b> يُحتسب من هذه السجلات الفعلية، بينما <b>المتوقع</b> يأتي من خطة التحصيل.</div>
            </div>
            <div className="sticky bottom-0 bg-[var(--tg-card)] border-t border-[var(--tg-line)] p-3 flex gap-2">
              <button onClick={saveCollection} className="flex-1 bg-[#102b4e] hover:bg-[#16365f] text-white font-extrabold py-3 rounded-xl inline-flex items-center justify-center gap-2"><CheckCircle2 size={18}/>حفظ التحصيل</button>
              <button onClick={()=>setModalCustomer(null)} className="px-4 border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] rounded-xl font-extrabold hover:bg-[var(--app-card-hover)]">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default CollectionCommandCenter;
