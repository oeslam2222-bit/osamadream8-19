import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { Customer, CustomerVisit } from '../types';
import { EmptyState } from './ui/EmptyState';

// Helper to calculate distance between two coordinates in meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} متر`;
  }
  return `${(meters / 1000).toFixed(1)} كم`;
}

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
    getVisibleVisits,
    getVisibleCustomers,
    addVisit,
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
  const [repFilter, setRepFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<'all' | 'home' | 'electrical'>('all');
  const [pageSize, setPageSize] = useState<number>(10);
  const [visitsPage, setVisitsPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));

  // Geolocation & Geofencing states
  const [repGps, setRepGps] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);

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

  const myCustomers = useMemo(() => {
    return getVisibleCustomers();
  }, [customers, users, currentUser, getVisibleCustomers]);

  const selectedCustomerObj = useMemo(() => {
    if (!form.customerId) return null;
    return myCustomers.find((c) => c.id === form.customerId) || null;
  }, [form.customerId, myCustomers]);

  // Request Rep current GPS position
  const requestCurrentRepGps = (): Promise<{ latitude: number; longitude: number; accuracy?: number } | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setGpsNotice('متصفحك لا يدعم نظام تحديد المواقع GPS');
        resolve(null);
        return;
      }
      setIsCapturingGps(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsCapturingGps(false);
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setRepGps(coords);
          resolve(coords);
        },
        (err) => {
          setIsCapturingGps(false);
          console.warn('Geolocation capture notice:', err.message);
          setGpsNotice('يرجى السماح بالوصول للموقع لالتقاط إحداثيات المتجر بدقة.');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  };

  // Pin customer GPS permanently into customer record
  const handlePinCustomerLocation = async () => {
    if (!selectedCustomerObj) return;
    setGpsNotice('جاري تحديد إحداثيات موقع المتجر عبر الأقمار الصناعية...');
    const coords = await requestCurrentRepGps();
    if (!coords) return;

    const updatedCustomer: Customer = {
      ...selectedCustomerObj,
      latitude: coords.latitude,
      longitude: coords.longitude,
      locationAddress: selectedCustomerObj.address || selectedCustomerObj.region || selectedCustomerObj.branchName || '',
      locationCapturedAt: new Date().toISOString(),
      locationCapturedBy: currentUser?.name || 'المندوب',
    };

    updateCustomer(updatedCustomer);
    setGpsNotice(`تم بنجاح حفظ وتثبيت إحداثيات المتجر (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}) في ملف العميل! ستظهر تلقائياً في كل زياراته القادمة.`);
  };

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (!form.customerId) errors.push('يرجى اختيار العميل');
    if (form.type === 'تحصيل' && form.collectedAmount <= 0) errors.push('يرجى إدخال مبلغ التحصيل');
    setFormErrors(errors);
    return errors.length === 0;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateForm()) return;

    const r = users.find((u) => u.id === form.repId);
    const c = myCustomers.find((x) => x.id === form.customerId);

    // If rep GPS isn't captured yet, try a quick capture or submit with existing
    const visitLocation = repGps
      ? {
          latitude: repGps.latitude,
          longitude: repGps.longitude,
          accuracy: repGps.accuracy,
          timestamp: new Date().toISOString(),
          address: c?.address || c?.region || '',
          mapUrl: `https://www.google.com/maps/search/?api=1&query=${repGps.latitude},${repGps.longitude}`,
        }
      : c?.latitude && c?.longitude
      ? {
          latitude: c.latitude,
          longitude: c.longitude,
          address: c.address || c.region || '',
          mapUrl: `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`,
          timestamp: new Date().toISOString(),
        }
      : undefined;

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
    });

    if (!result.success) {
      setFlash({ tone: 'error', text: result.message });
      return;
    }

    setFlash({ tone: 'success', text: 'تم تسجيل الزيارة بنجاح بالمنظومة وتوثيق الموقع ✅' });
    setTimeout(() => setFlash(null), 4000);
    setTimeout(() => setFlash(null), 4000);

    setShowForm(false);
    setForm(initialForm);
    setFormErrors([]);
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

    return result;
  }, [
    visits,
    search,
    timeFilter,
    typeFilter,
    statusFilter,
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
      (v) => Boolean(v.location?.latitude && v.location?.longitude)
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
      collectionCount: collectionVisits.length,
      totalCollected,
    };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((visitsPage - 1) * pageSize, visitsPage * pageSize);

  const repOptions = useMemo(() => {
    const reps = [...new Set(visits.map((v) => v.repName).filter(Boolean))];
    return reps;
  }, [visits]);

  const hasActiveFilters =
    search.trim() !== '' ||
    timeFilter !== 'month' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    repFilter !== 'all' ||
    sectorFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setTimeFilter('month');
    setTypeFilter('all');
    setStatusFilter('all');
    setRepFilter('all');
    setSectorFilter('all');
    setVisitsPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b1329] p-3 sm:p-5 lg:p-7 space-y-6" dir="rtl">
      {/* Flash message */}
      {flash && (
        <div
          className={`p-4 rounded-2xl border text-sm font-bold flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 ${
            flash.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          <span>{flash.text}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-[#0f172a] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0f2b38] to-[#1a4a5e] text-white flex items-center justify-center shadow-md shadow-[#0f2b38]/20 shrink-0">
            <MapPin className="w-6 h-6 text-teal-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                لوحة الزيارات
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                {filtered.length} زيارة
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              متابعة الزيارات الميدانية والتحصيلات والمرتجعات لفرق المبيعات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={resetFilters}
            className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition active:scale-95 text-xs font-bold flex items-center gap-1.5"
            title="تحديث البيانات"
          >
            <RotateCw className="w-4 h-4" />
            <span className="hidden md:inline">تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-[#0f2b38] hover:bg-[#163f53] text-white font-black rounded-2xl text-xs sm:text-sm shadow-md shadow-[#0f2b38]/25 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-teal-300" />
            <span>تسجيل زيارة جديدة</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards (Matching Tantawy Luxury Design) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Visits Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300">
              إجمالي الزيارات
            </span>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {stats.total.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-1.5 flex items-center gap-1">
            <span>زيارة مسجلة بالمنظومة</span>
          </div>
          <div className="absolute bottom-0 right-0 left-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400 opacity-80" />
        </div>

        {/* Completed Visits Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs relative overflow-hidden group hover:border-emerald-300 dark:hover:border-emerald-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300">
              الزيارات المنفذة
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
            {stats.completed.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold mt-1.5 flex items-center gap-1">
            <span>زيارات ناجحة ومكتملة</span>
          </div>
          <div className="absolute bottom-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 opacity-80" />
        </div>

        {/* GPS Geofenced / Verified Visits Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs relative overflow-hidden group hover:border-teal-300 dark:hover:border-teal-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300">
              زيارات موثقة (GPS)
            </span>
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-teal-600 dark:text-teal-400 tracking-tight">
            {stats.gpsVerified.toLocaleString()}
          </div>
          <div className="text-[11px] text-teal-700 dark:text-teal-300 font-bold mt-1.5 flex items-center gap-1">
            <span>نسبة التوثيق: {stats.total > 0 ? Math.round((stats.gpsVerified / stats.total) * 100) : 0}%</span>
          </div>
          <div className="absolute bottom-0 right-0 left-0 h-1 bg-gradient-to-r from-teal-500 to-cyan-400 opacity-80" />
        </div>

        {/* Collections Amount Card */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs relative overflow-hidden group hover:border-teal-300 dark:hover:border-teal-700 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs sm:text-sm font-black text-slate-600 dark:text-slate-300">
              التحصيلات
            </span>
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-[#0f2b38] dark:text-teal-300 tracking-tight truncate">
            {formatCurrency(stats.totalCollected)} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <div className="text-[11px] text-teal-700 dark:text-teal-300 font-bold mt-1.5 flex items-center gap-1">
            <span>{stats.collectionCount} عملية تحصيل مسجلة</span>
          </div>
          <div className="absolute bottom-0 right-0 left-0 h-1 bg-gradient-to-r from-teal-500 to-blue-500 opacity-80" />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Main search input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisitsPage(1);
              }}
              placeholder="ابحث بالاسم، كود العميل، المندوب، الفرع، أو الملاحظات..."
              className="w-full pr-10 pl-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009488]"
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
                setVisitsPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'today'
                  ? 'bg-white dark:bg-slate-900 text-[#0f2b38] dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter('week');
                setVisitsPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'week'
                  ? 'bg-white dark:bg-slate-900 text-[#0f2b38] dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              هذا الأسبوع
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter('month');
                setVisitsPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'month'
                  ? 'bg-white dark:bg-slate-900 text-[#0f2b38] dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              آخر شهر
            </button>
            <button
              type="button"
              onClick={() => {
                setTimeFilter('all');
                setVisitsPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-[#0f2b38] dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              كل الفترات
            </button>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Visit Type */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">نوع الزيارة</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setVisitsPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">الحالة</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setVisitsPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">كل الحالات</option>
              <option value="منفذة">منفذة ✅</option>
              <option value="معلقة">معلقة / مجدولة ⏳</option>
              <option value="ملغاة">ملغاة ❌</option>
            </select>
          </div>

          {/* Sector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">القطاع</label>
            <select
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value as any);
                setVisitsPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">كل القطاعات</option>
              <option value="home">منزلي 🏠</option>
              <option value="electrical">كهرباء ⚡</option>
            </select>
          </div>

          {/* Sales Rep */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">المندوب</label>
            <select
              value={repFilter}
              onChange={(e) => {
                setRepFilter(e.target.value);
                setVisitsPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">كل المناديب</option>
              {repOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="w-full h-[38px] rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-100 transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>مسح الفلاتر</span>
              </button>
            ) : (
              <div className="w-full h-[38px] flex items-center justify-center text-slate-400 font-medium text-[11px]">
                جميع الفلاتر افتراضية
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Results Container */}
      <div className="space-y-4">
        {/* Count Bar */}
        <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
          <span>
            عرض {paginated.length} من أصل {filtered.length} زيارة مطابقة
          </span>
          <span>صفحة {visitsPage} من {totalPages}</span>
        </div>

        {/* 1. Desktop & Laptop View: High Elegance ERP Table (hidden on mobile/tablet) */}
        <div className="hidden lg:block w-full overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-[#0f172a]">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#0f2b38] text-white border-b border-[#1b4676] select-none sticky top-0 z-10 font-black">
              <tr>
                <th className="p-3.5 text-center text-white font-black w-12">#</th>
                <th className="p-3.5 text-right text-white font-black">العميل والمنطقة</th>
                <th className="p-3.5 text-right text-white font-black w-28">كود العميل</th>
                <th className="p-3.5 text-right text-white font-black w-36">تاريخ وتوقيت الزيارة</th>
                <th className="p-3.5 text-center text-white font-black w-28">نوع الزيارة</th>
                <th className="p-3.5 text-right text-white font-black w-28">المبلغ المحصل</th>
                <th className="p-3.5 text-center text-white font-black w-24">القطاع</th>
                <th className="p-3.5 text-right text-white font-black w-32">المندوب</th>
                <th className="p-3.5 text-center text-white font-black w-24">الحالة</th>
                <th className="p-3.5 text-center text-white font-black w-24">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold">
              {paginated.map((v, idx) => {
                const globalIdx = (visitsPage - 1) * pageSize + idx + 1;
                const isCollection = v.type?.includes('تحصيل') || Number(v.collectedAmount || 0) > 0;
                const isReturn = v.type?.includes('مرتجع') || v.outcome?.includes('مرتجع');

                return (
                  <tr
                    key={v.id || idx}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition group cursor-pointer"
                    onClick={() => setSelectedVisit(v)}
                  >
                    <td className="p-3 text-center font-black text-slate-500 dark:text-slate-400">
                      {globalIdx}
                    </td>

                    <td className="p-3 text-right">
                      <div className="font-black text-slate-900 dark:text-white text-sm group-hover:text-teal-600 transition">
                        {v.customerName || 'عميل بدون اسم'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{v.branchName || 'فرع الشركة'}</span>
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-black border border-slate-200 dark:border-slate-700">
                        {v.customerCode || '—'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{v.date}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{v.time || '09:00 ص'}</span>
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                          isCollection
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                            : isReturn
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                        }`}
                      >
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

                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                          v.sector === 'electrical'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}
                      >
                        {v.sector === 'electrical' ? '⚡ كهرباء' : '🏠 منزلي'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                        {v.repName || 'مندوب الفرع'}
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${
                          v.status === 'منفذة'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : (v.status as string) === 'معلقة' || v.status === 'مجدولة' || v.status === 'لم تتم'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {v.status || 'منفذة'}
                      </span>
                    </td>

                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelectedVisit(v)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition active:scale-95 cursor-pointer shadow-xs"
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
                          className="px-5 py-2.5 rounded-2xl bg-[#0f2b38] hover:bg-[#163f53] text-white font-black text-xs transition active:scale-95 inline-flex items-center gap-2"
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
                className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3 active:scale-[0.99] transition"
                onClick={() => setSelectedVisit(v)}
              >
                {/* Header: Customer Name + Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight truncate">
                      {v.customerName || 'عميل بدون اسم'}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-block px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-black border border-slate-200 dark:border-slate-700">
                        {v.customerCode || '—'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {v.branchName || 'فرع الشركة'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                          v.sector === 'electrical'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}
                      >
                        {v.sector === 'electrical' ? '⚡ كهرباء' : '🏠 منزلي'}
                      </span>
                      {v.location?.latitude && v.location?.longitude && (
                        <a
                          href={v.location.mapUrl || `https://www.google.com/maps/search/?api=1&query=${v.location.latitude},${v.location.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center gap-1 hover:bg-teal-100"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                          <span>GPS موثق</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-black ${
                      v.status === 'منفذة'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : (v.status as string) === 'معلقة' || v.status === 'مجدولة' || v.status === 'لم تتم'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {v.status || 'منفذة'}
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block mb-0.5">نوع الزيارة</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black border ${
                        isCollection
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : isReturn
                          ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                      }`}
                    >
                      {v.type || 'دورية'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block mb-0.5">المبلغ المحصل</span>
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
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-bold pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{v.date}</span>
                    <span className="text-slate-300">•</span>
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{v.time || '09:00 ص'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                    <UserCheck className="w-3.5 h-3.5 text-teal-600" />
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
                  className="w-full min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-black text-xs flex items-center justify-center gap-2 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition active:scale-95"
                >
                  <Eye className="w-4 h-4" />
                  <span>عرض التفاصيل الكاملة</span>
                </button>
              </div>
            );
          })}

          {paginated.length === 0 && (
            <div className="p-8 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 text-center">
              <EmptyState
                type="visits"
                title="لا توجد زيارات"
                description="لم يتم العثور على أي زيارات مطابقة للبحث أو الفلاتر المحددة."
                action={
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="px-5 py-3 rounded-2xl bg-[#0f2b38] text-white font-black text-xs transition active:scale-95"
                  >
                    تسجيل زيارة جديدة الآن
                  </button>
                }
              />
            </div>
          )}
        </div>

        {/* Pagination Strip */}
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
          <div className="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-400">
            <span>عدد الزيارات بالصفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setVisitsPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
            >
              <option value={5}>5 زيارات</option>
              <option value={10}>10 زيارات</option>
              <option value={25}>25 زيارة</option>
              <option value={50}>50 زيارة</option>
            </select>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={visitsPage === 1}
                onClick={() => setVisitsPage((p) => Math.max(1, p - 1))}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                  visitsPage === 1
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer active:scale-95'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
                <span className="hidden sm:inline">السابق</span>
              </button>

              <span className="px-3 text-xs font-black text-slate-700 dark:text-slate-300">
                صفحة {visitsPage} من {totalPages}
              </span>

              <button
                type="button"
                disabled={visitsPage === totalPages}
                onClick={() => setVisitsPage((p) => Math.min(totalPages, p + 1))}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                  visitsPage === totalPages
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer active:scale-95'
                }`}
              >
                <span className="hidden sm:inline">التالي</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
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
                <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">تسجيل زيارة جديدة</h2>
                  <p className="text-[11px] font-bold text-slate-400">توثيق الزيارة وحركات التحصيل والمرتجعات</p>
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
              {/* Customer selection */}
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-bold block mb-1">
                  العميل المستهدف *
                </span>
                <select
                  value={form.customerId}
                  onChange={(e) => {
                    const c = myCustomers.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      customerId: e.target.value,
                      customerName: c?.name || '',
                      customerCode: c?.code || '',
                    });
                  }}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#009488]"
                >
                  <option value="">اختر العميل من القائمة...</option>
                  {myCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code || 'بدون كود'}) — {c.region || c.governorate || c.branchName || 'الفرع'}
                    </option>
                  ))}
                </select>
              </label>

              {/* Customer financial standing if selected */}
              {form.customerId && (
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                      موقف العميل المالي الحالي
                    </span>
                    <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">بيانات لحظية</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-400 font-bold">الرصيد الحالي</div>
                      <div className="font-black text-slate-900 dark:text-white mt-0.5">
                        {formatCurrency(
                          myCustomers.find((x) => x.id === form.customerId)?.currentBalance ??
                            myCustomers.find((x) => x.id === form.customerId)?.balance ??
                            0
                        )}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-400 font-bold">الحد الائتماني</div>
                      <div className="font-black text-slate-900 dark:text-white mt-0.5">
                        {formatCurrency(
                          myCustomers.find((x) => x.id === form.customerId)?.creditLimit ?? 0
                        )}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-400 font-bold">المديونية</div>
                      <div className="font-black text-rose-600 mt-0.5">
                        {formatCurrency(
                          myCustomers.find((x) => x.id === form.customerId)?.overdueBalance ?? 0
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* GPS Geofencing & Customer Location Capture */}
              {selectedCustomerObj && (
                <div className="p-4 rounded-2xl border border-teal-200 dark:border-teal-800/80 bg-gradient-to-br from-teal-50/70 to-cyan-50/40 dark:from-teal-950/30 dark:to-cyan-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                        تحديد وتوثيق موقع العميل (GPS)
                      </span>
                    </div>
                    {selectedCustomerObj.latitude && selectedCustomerObj.longitude ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        إحداثيات مسجلة ✅
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                        موقع غير مثبت 📍
                      </span>
                    )}
                  </div>

                  {/* If customer has saved GPS */}
                  {selectedCustomerObj.latitude && selectedCustomerObj.longitude ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs bg-white/80 dark:bg-slate-800/70 p-2.5 rounded-xl border border-teal-100 dark:border-teal-900">
                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          الإحداثيات: <span className="font-mono text-teal-700 dark:text-teal-400 font-black">{selectedCustomerObj.latitude.toFixed(5)}, {selectedCustomerObj.longitude.toFixed(5)}</span>
                        </div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${selectedCustomerObj.latitude},${selectedCustomerObj.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-black text-teal-700 dark:text-teal-300 hover:underline"
                        >
                          <span>خرائط Google</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* Rep proximity check if rep GPS is available */}
                      {repGps ? (
                        (() => {
                          const dist = calculateDistanceMeters(
                            repGps.latitude,
                            repGps.longitude,
                            selectedCustomerObj.latitude!,
                            selectedCustomerObj.longitude!
                          );
                          const isWithinRange = dist <= 200; // 200 meters geofence
                          return (
                            <div className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                              isWithinRange
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-200'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-amber-800 dark:text-amber-200'
                            }`}>
                              <div className="flex items-center gap-1.5">
                                <Crosshair className="w-3.5 h-3.5 shrink-0" />
                                <span>{isWithinRange ? 'أنت داخل نطاق المتجر (موثق)' : 'أنت خارج نطاق المتجر المسجل'}</span>
                              </div>
                              <span className="font-black font-mono">المسافة: {formatDistance(dist)}</span>
                            </div>
                          );
                        })()
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestCurrentRepGps()}
                          disabled={isCapturingGps}
                          className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-700 text-teal-800 dark:text-teal-200 text-xs font-black hover:bg-teal-50 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Navigation2 className={`w-3.5 h-3.5 ${isCapturingGps ? 'animate-spin' : ''}`} />
                          <span>{isCapturingGps ? 'جاري تحديد موقعك الحالي...' : 'تحقق من قربك لمتجر العميل (تأكيد النطاق)'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handlePinCustomerLocation}
                        disabled={isCapturingGps}
                        className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 underline block text-center w-full"
                      >
                        🔄 نقل أو تحديث إحداثيات المتجر بموقعي الحالي
                      </button>
                    </div>
                  ) : (
                    /* Customer has no saved GPS yet */
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold leading-relaxed">
                        هذا العميل لم يتم تثبيت موقعه بعد. يمكنك الآن بنقرة واحدة التقاط وتثبيت موقع متجره عبر GPS ليتم حفظه بملف العميل ويظهر تلقائياً في كل الزيارات القادمة.
                      </p>
                      <button
                        type="button"
                        onClick={handlePinCustomerLocation}
                        disabled={isCapturingGps}
                        className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MapPin className={`w-4 h-4 ${isCapturingGps ? 'animate-bounce' : ''}`} />
                        <span>{isCapturingGps ? 'جاري التقاط الإحداثيات...' : '📍 التقاط وتثبيت إحداثيات العميل الآن (GPS)'}</span>
                      </button>
                    </div>
                  )}

                  {gpsNotice && (
                    <div className="text-[11px] font-bold text-teal-800 dark:text-teal-200 bg-teal-100/70 dark:bg-teal-950/50 p-2 rounded-xl">
                      {gpsNotice}
                    </div>
                  )}
                </div>
              )}

              {/* Type and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-bold block mb-1">
                    نوع الزيارة *
                  </span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#009488]"
                  >
                    {SIMPLE_VISIT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-bold block mb-1">
                    تاريخ الزيارة
                  </span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#009488]"
                  />
                </label>
              </div>

              {/* Time & Collected Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-bold block mb-1">
                    توقيت الزيارة
                  </span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#009488]"
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
                <span className="text-xs text-slate-600 dark:text-slate-300 font-bold block mb-1">
                  ملاحظات وإفادة الزيارة
                </span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#009488]"
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
                className="w-full min-h-[46px] bg-[#0f2b38] hover:bg-[#163f53] text-white font-black text-sm rounded-2xl shadow-lg shadow-[#0f2b38]/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Clock className="w-4 h-4 text-teal-300" />
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
                <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">تفاصيل الزيارة الميدانية</h2>
                  <p className="text-[11px] font-bold text-slate-400">سجل الزيارة الموثق بالمنظومة</p>
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
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">العميل</span>
                  <div className="font-black text-slate-900 dark:text-white text-sm">{selectedVisit.customerName}</div>
                  <div className="text-[11px] font-mono font-bold text-teal-600 dark:text-teal-400 mt-0.5">
                    {selectedVisit.customerCode || 'بدون كود'}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">المندوب القائم بالزيارة</span>
                  <div className="font-black text-slate-900 dark:text-white text-sm">{selectedVisit.repName || 'المندوب'}</div>
                  <div className="text-[11px] text-slate-500 font-bold mt-0.5">{selectedVisit.branchName || 'فرع الشركة'}</div>
                </div>
              </div>

              {/* Timestamp & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">التاريخ والتوقيت</span>
                  <div className="font-black text-slate-900 dark:text-white text-sm">{selectedVisit.date}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{selectedVisit.time || '09:00 ص'}</div>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">نوع وحالة الزيارة</span>
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
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">القطاع</span>
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

                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">المبلغ المحصل</span>
                  {selectedVisit.collectedAmount && selectedVisit.collectedAmount > 0 ? (
                    <div className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                      {formatCurrency(selectedVisit.collectedAmount)} <span className="text-xs font-normal">ج.م</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 font-bold text-sm">—</span>
                  )}
                </div>
              </div>

              {/* GPS Geolocation Verification */}
              {selectedVisit.location?.latitude && selectedVisit.location?.longitude && (
                <div className="p-3.5 rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-teal-800 dark:text-teal-300 font-black flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      موقع الزيارة الموثق (GPS)
                    </span>
                    <a
                      href={selectedVisit.location.mapUrl || `https://www.google.com/maps/search/?api=1&query=${selectedVisit.location.latitude},${selectedVisit.location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-black text-teal-700 dark:text-teal-300 hover:underline flex items-center gap-1"
                    >
                      <span>عرض على الخريطة</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {selectedVisit.location.latitude.toFixed(5)}, {selectedVisit.location.longitude.toFixed(5)}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedVisit.notes && (
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">ملاحظات وإفادة الزيارة</span>
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
                className="w-full sm:w-auto px-7 py-2.5 rounded-2xl bg-[#0f2b38] hover:bg-[#163f53] text-white font-black text-xs transition cursor-pointer"
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
