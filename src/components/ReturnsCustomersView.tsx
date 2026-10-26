import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, MapPin, PackageCheck, Phone, RotateCcw, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatGrid } from './ui/StatGrid';
import {
  elapsedMs,
  formatElapsed,
  isStageOverdue,
  parseReturnNote,
  RETURN_LOCATIONS,
  ReturnLocation,
  ReturnStage,
  stageOf,
  STAGE_STYLES,
} from '../services/returnsWorkflowService';
import type { CustomerVisit } from '../types';

interface CustomerReturnGroup {
  customerId: string;
  customerName: string;
  customerCode: string;
  phone: string;
  address: string;
  branchName: string;
  repName: string;
  visits: CustomerVisit[];
  totalValue: number;
  openCount: number;
  atCustomer: number;
  atWarehouse: number;
  latestStage: string;
  longestElapsed: number;
  overdue: boolean;
}

export const ReturnsCustomersView: React.FC = () => {
  const { currentUser, customers, getVisibleVisits } = useApp();
  const visible = getVisibleVisits();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('الكل');
  const [locationFilter, setLocationFilter] = useState('الكل');
  const [expanded, setExpanded] = useState<string | null>(null);

  const returns = useMemo(
    () => visible.filter((v) => Boolean(v.isReturn) && Boolean(v.returnStatus)),
    [visible]
  );

  const branches = useMemo(
    () => Array.from(new Set(returns.map((v) => v.branchName).filter(Boolean))) as string[],
    [returns]
  );

  const groups = useMemo<CustomerReturnGroup[]>(() => {
    const map = new Map<string, CustomerReturnGroup>();
    returns.forEach((v) => {
      const customer = customers.find((c) => c.id === v.customerId);
      const key = v.customerId || v.customerName || 'unknown';
      const { meta } = parseReturnNote(v.returnNote);
      const stage = stageOf(v);
      const location: ReturnLocation = meta.location || 'عند العميل';
      const existing = map.get(key);
      const age = elapsedMs(v.returnHandledAt);
      if (existing) {
        existing.visits.push(v);
        existing.totalValue += Number(v.returnValue) || 0;
        if (stage !== 'مغلق' && stage !== 'مرفوض') existing.openCount += 1;
        if (location === 'عند العميل') existing.atCustomer += 1; else existing.atWarehouse += 1;
        existing.longestElapsed = Math.max(existing.longestElapsed, age);
        if (isStageOverdue(stage, v.returnHandledAt)) existing.overdue = true;
        if (stage !== 'مغلق' && stage !== 'مرفوض') existing.latestStage = stage;
      } else {
        map.set(key, {
          customerId: key,
          customerName: v.customerName || customer?.name || 'عميل غير معروف',
          customerCode: v.customerCode || customer?.code || '',
          phone: customer?.phone || '',
          address: customer?.address || '',
          branchName: v.branchName || customer?.branchName || '',
          repName: v.repName || customer?.repName || '',
          visits: [v],
          totalValue: Number(v.returnValue) || 0,
          openCount: stage !== 'مغلق' && stage !== 'مرفوض' ? 1 : 0,
          atCustomer: location === 'عند العميل' ? 1 : 0,
          atWarehouse: location === 'بالمخزن' ? 1 : 0,
          latestStage: stage,
          longestElapsed: age,
          overdue: isStageOverdue(stage, v.returnHandledAt),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.openCount - a.openCount || b.totalValue - a.totalValue);
  }, [returns, customers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (branchFilter !== 'الكل' && g.branchName !== branchFilter) return false;
      if (locationFilter !== 'الكل') {
        const hasLocation = locationFilter === 'عند العميل' ? g.atCustomer > 0 : g.atWarehouse > 0;
        if (!hasLocation) return false;
      }
      if (term) {
        const haystack = `${g.customerName} ${g.customerCode} ${g.phone} ${g.repName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [groups, search, branchFilter, locationFilter]);

  const stats = useMemo(() => {
    const totalValue = filtered.reduce((sum, g) => sum + g.totalValue, 0);
    const atCustomer = filtered.reduce((sum, g) => sum + g.atCustomer, 0);
    const atWarehouse = filtered.reduce((sum, g) => sum + g.atWarehouse, 0);
    const overdue = filtered.filter((g) => g.overdue).length;
    return { customers: filtered.length, totalValue, atCustomer, atWarehouse, overdue };
  }, [filtered]);

  const statCards: { icon: React.ElementType; label: string; value: number | string; sub?: string }[] = [
    { icon: Users, label: 'عملاء عندهم مرتجعات', value: stats.customers, sub: 'حسب نطاق صلاحياتك' },
    { icon: RotateCcw, label: 'إجمالي قيمة المرتجعات', value: `${stats.totalValue.toLocaleString()} ج.م`, sub: 'كل العملاء' },
    { icon: MapPin, label: 'المرتجع عند العميل', value: stats.atCustomer, sub: 'يحتاج تنسيق سيارة' },
    { icon: PackageCheck, label: 'المرتجع بالمخزن', value: stats.atWarehouse, sub: 'في دوره الاستلام' },
    { icon: AlertTriangle, label: 'عملاء متأخرين', value: stats.overdue, sub: 'تجاوزوا المدة المستهدفة' },
    { icon: Clock3, label: 'أطول مدة انتظار', value: formatElapsed(Math.max(0, ...filtered.map((g) => g.longestElapsed))), sub: 'من آخر تحويل' },
  ];

  return (
    <div className="tantawy-screen space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--app-navy)' }}>العملاء الذين عندهم مرتجعات</h1>
          <p className="text-sm text-slate-500 font-bold mt-1">تنسيق المرتجع بين العميل والمخزن ومتابعة حالة كل عميل</p>
        </div>
        {currentUser?.role === 'sales_rep' ? (
          <span className="text-xs font-black text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2">بتشوف عملاءك أنت فقط</span>
        ) : null}
      </header>

      <StatGrid visible={6} tone="dark" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-500 font-bold">{c.label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--app-navy)' }}>
                <c.icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div className="text-base sm:text-lg font-black" style={{ color: 'var(--app-navy)' }}>{c.value}</div>
            {c.sub ? <div className="text-[10px] text-slate-500 font-semibold">{c.sub}</div> : null}
          </div>
        ))}
      </StatGrid>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">بحث</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم العميل / الكود / التليفون / المندوب" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">الفرع</span>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">مكان المرتجع</span>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {RETURN_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 font-bold shadow-sm">لا يوجد عملاء عندهم مرتجعات حالياً</div>
        ) : (
          filtered.map((g) => {
            const isOpen = expanded === g.customerId;
            const stageStyle = STAGE_STYLES[g.latestStage as ReturnStage] || STAGE_STYLES['بانتظار المشرف'];
            return (
              <div key={g.customerId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button type="button" onClick={() => setExpanded(isOpen ? null : g.customerId)} className="w-full text-start p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-800">{g.customerName}</h3>
                      {g.customerCode ? <span className="text-[11px] font-black text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">{g.customerCode}</span> : null}
                      <span className={`text-[11px] font-black px-2 py-1 rounded-full border ${stageStyle.badge}`}>{stageStyle.label}</span>
                      {g.overdue ? <span className="text-[11px] font-black px-2 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200">متأخر عن المدة</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500 font-bold">
                      {g.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {g.phone}</span> : null}
                      <span>الفرع: {g.branchName || '-'}</span>
                      <span>المندوب: {g.repName || '-'}</span>
                      {g.address ? <span>العنوان: {g.address}</span> : null}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-base font-black" style={{ color: 'var(--app-navy)' }}>{g.totalValue.toLocaleString()} ج.م</div>
                    <div className="text-[11px] font-black text-slate-500 mt-1">{g.openCount} مفتوح • {g.visits.length} إجمالي</div>
                    <div className="text-[11px] font-black text-slate-500">أطول مدة انتظار: {formatElapsed(g.longestElapsed)}</div>
                    <div className="text-[11px] font-black text-slate-600 mt-1">عند العميل: {g.atCustomer} • بالمخزن: {g.atWarehouse}</div>
                  </div>
                </button>
                {isOpen ? (
                  <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
                    {g.visits.map((v) => {
                      const stage = stageOf(v);
                      const style = STAGE_STYLES[stage] || STAGE_STYLES['بانتظار المشرف'];
                      const { meta } = parseReturnNote(v.returnNote);
                      return (
                        <div key={v.id} className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-black text-slate-700">{v.date} — {(Number(v.returnValue) || 0).toLocaleString()} ج.م</div>
                            <div className="text-[11px] text-slate-500 font-bold mt-0.5">{v.returnReason || 'بدون سبب محدد'}</div>
                            <div className="text-[11px] text-slate-400 font-bold mt-0.5">المكان: {meta.location || 'عند العميل'} • مدة المرحلة: {formatElapsed(elapsedMs(v.returnHandledAt))}</div>
                          </div>
                          <span className={`text-[11px] font-black px-2 py-1 rounded-full border ${style.badge}`}>{style.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
