import React, { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Clock3, MapPin, PackageCheck, Settings2, Truck, Warehouse } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatGrid } from './ui/StatGrid';
import {
  buildReturnNote,
  elapsedMs,
  formatElapsed,
  getStageTargets,
  isStageOverdue,
  nextActionsFor,
  parseReturnNote,
  RETURN_LOCATIONS,
  ReturnLocation,
  ReturnStage,
  saveStageTargets,
  stageOf,
  STAGE_STYLES,
  WAREHOUSE_STAGES,
} from '../services/returnsWorkflowService';
import type { CustomerVisit } from '../types';

interface ReceiptDraft {
  visit: CustomerVisit;
  stage: ReturnStage;
  cartons: string;
  pieces: string;
  note: string;
  location: ReturnLocation;
}

export const ReturnsWarehouseView: React.FC = () => {
  const { currentUser, customers, users, getVisibleVisits, updateVisit } = useApp();
  const visible = getVisibleVisits();

  const [stageFilter, setStageFilter] = useState('الكل');
  const [branchFilter, setBranchFilter] = useState('الكل');
  const [repFilter, setRepFilter] = useState('الكل');
  const [locationFilter, setLocationFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [settlementDraft, setSettlementDraft] = useState<ReceiptDraft | null>(null);
  const [showTargets, setShowTargets] = useState(false);
  const [targets, setTargets] = useState(getStageTargets());

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const branches = useMemo(
    () => Array.from(new Set(visible.map((v) => v.branchName).filter(Boolean))) as string[],
    [visible]
  );
  const reps = useMemo(
    () => Array.from(new Set(visible.map((v) => v.repName).filter(Boolean))) as string[],
    [visible]
  );

  const allReturns = useMemo(
    () => visible.filter((v) => Boolean(v.isReturn) && Boolean(v.returnStatus)),
    [visible]
  );

  const warehouseReturns = useMemo(
    () => allReturns.filter((v) => WAREHOUSE_STAGES.includes(stageOf(v))),
    [allReturns]
  );

  const filtered = useMemo(() => {
    const term = search.trim();
    return warehouseReturns.filter((v) => {
      const stage = stageOf(v);
      if (!showClosed && stage === 'مغلق') return false;
      if (stageFilter !== 'الكل' && stage !== stageFilter) return false;
      if (branchFilter !== 'الكل' && v.branchName !== branchFilter) return false;
      if (repFilter !== 'الكل' && v.repName !== repFilter) return false;
      const { meta } = parseReturnNote(v.returnNote);
      if (locationFilter !== 'الكل' && (meta.location || 'عند العميل') !== locationFilter) return false;
      if (term) {
        const customer = customers.find((c) => c.id === v.customerId);
        const haystack = `${v.customerName || ''} ${v.customerCode || ''} ${customer?.name || ''} ${customer?.phone || ''}`.toLowerCase();
        if (!haystack.includes(term.toLowerCase())) return false;
      }
      return true;
    });
  }, [warehouseReturns, stageFilter, branchFilter, repFilter, locationFilter, search, showClosed, customers]);

  const stats = useMemo(() => {
    const open = warehouseReturns.filter((v) => stageOf(v) !== 'مغلق');
    const overdue = open.filter((v) => isStageOverdue(stageOf(v), v.returnHandledAt, targets));
    const totalValue = open.reduce((sum, v) => sum + (Number(v.returnValue) || 0), 0);
    return {
      open: open.length,
      waiting: open.filter((v) => stageOf(v) === 'بانتظار التنسيق' || stageOf(v) === 'تم التحويل لأمين المخزن').length,
      onTheWay: open.filter((v) => stageOf(v) === 'تم إرسال السيارة' || stageOf(v) === 'جاري الاستلام').length,
      received: open.filter((v) => stageOf(v) === 'تم الاستلام بالمخزن' || stageOf(v) === 'جاري تصفية المرتجع').length,
      overdue: overdue.length,
      totalValue,
    };
  }, [warehouseReturns, targets]);

  const advance = (visit: CustomerVisit, stage: ReturnStage, extra?: { note?: string; cartons?: number; pieces?: number; location?: ReturnLocation }) => {
    const { text, meta } = parseReturnNote(visit.returnNote);
    const nowIso = new Date().toISOString();
    const updated: CustomerVisit = {
      ...visit,
      returnStatus: stage,
      returnHandledBy: currentUser?.name || 'أمين المخزن',
      returnHandledAt: nowIso,
      returnHandledRole: currentUser?.role,
      returnNote: buildReturnNote(
        extra?.note ? `${text ? `${text} • ` : ''}${extra.note}` : text,
        {
          ...meta,
          ...(extra?.location ? { location: extra.location } : {}),
          ...(typeof extra?.cartons === 'number' ? { receivedCartons: extra.cartons } : {}),
          ...(typeof extra?.pieces === 'number' ? { receivedPieces: extra.pieces } : {}),
          ...(stage === 'تم إرسال السيارة' ? { carDispatchedAt: nowIso } : {}),
          ...(stage === 'تم الاستلام بالمخزن' || stage === 'استلام جزئي' ? { receivedAt: nowIso } : {}),
        }
      ),
    };
    const res = updateVisit(updated);
    if (res.success) {
      setFlash({ tone: 'success', text: `تم تحديث حالة المرتجع إلى: ${STAGE_STYLES[stage]?.label || stage}` });
    } else {
      setFlash({ tone: 'error', text: res.message });
    }
  };

  const handleAction = (visit: CustomerVisit, action: ReturnStage, label: string, needsReceipt?: boolean, needsSettlement?: boolean) => {
    if (needsReceipt) {
      const { meta } = parseReturnNote(visit.returnNote);
      setReceiptDraft({ visit, stage: action, cartons: '', pieces: '', note: '', location: meta.location || 'عند العميل' });
      return;
    }
    if (needsSettlement) {
      setSettlementDraft({ visit, stage: action, cartons: '', pieces: '', note: '', location: 'عند العميل' });
      return;
    }
    advance(visit, action, { note: label });
  };

  const statCards: { icon: React.ElementType; label: string; value: number | string; sub?: string }[] = [
    { icon: Boxes, label: 'مرتجعات مفتوحة', value: stats.open, sub: 'في دورة المخزن' },
    { icon: Clock3, label: 'بانتظار التنسيق', value: stats.waiting, sub: 'في انتظار جدولة السيارة' },
    { icon: Truck, label: 'في الطريق / استلام', value: stats.onTheWay, sub: 'سيارة متحركة أو جاري الاستلام' },
    { icon: PackageCheck, label: 'تم الاستلام بالمخزن', value: stats.received, sub: 'بانتظار التصفية' },
    { icon: AlertTriangle, label: 'متأخرة عن المدة', value: stats.overdue, sub: 'تجاوزت المدة المستهدفة' },
    { icon: Warehouse, label: 'قيمة المرتجعات', value: `${stats.totalValue.toLocaleString()} ج.م`, sub: 'إجمالي المفتوح' },
  ];

  return (
    <div className="tantawy-screen space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--app-navy)' }}>متابعة المرتجعات — المخزن</h1>
          <p className="text-sm text-slate-500 font-bold mt-1">من تحويل المرتجع لأمين المخزن حتى الاستلام والتصفية والإغلاق</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => { setTargets(getStageTargets()); setShowTargets(true); }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Settings2 className="w-4 h-4" /> المدد المستهدفة
          </button>
        ) : null}
      </header>

      {flash ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${flash.tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {flash.text}
        </div>
      ) : null}

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
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">الحالة</span>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {WAREHOUSE_STAGES.map((s) => <option key={s} value={s}>{STAGE_STYLES[s]?.label || s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">الفرع</span>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">المندوب</span>
            <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {reps.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">مكان المرتجع</span>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {RETURN_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">بحث</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم العميل / الكود / التليفون" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs font-black text-slate-600 pb-2">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="w-4 h-4" />
            عرض المرتجعات المغلقة
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 font-bold shadow-sm">
            لا توجد مرتجعات في دورة المخزن حالياً
          </div>
        ) : (
          filtered.map((v) => {
            const stage = stageOf(v);
            const style = STAGE_STYLES[stage] || STAGE_STYLES['بانتظار المشرف'];
            const { meta, text } = parseReturnNote(v.returnNote);
            const overdue = isStageOverdue(stage, v.returnHandledAt, targets);
            const actions = nextActionsFor(stage);
            const customer = customers.find((c) => c.id === v.customerId);
            const age = elapsedMs(v.returnHandledAt);
            return (
              <div key={v.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-800 text-base truncate">{v.customerName || customer?.name || 'عميل غير معروف'}</h3>
                      {v.customerCode ? <span className="text-[11px] font-black text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">{v.customerCode}</span> : null}
                      <span className={`text-[11px] font-black px-2 py-1 rounded-full border ${style.badge}`}>{style.label}</span>
                      <span className={`text-[11px] font-black px-2 py-1 rounded-full border ${meta.location === 'بالمخزن' ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {meta.location || 'عند العميل'}
                      </span>
                      {overdue ? (
                        <span className="text-[11px] font-black px-2 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200">متأخر عن المدة</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500 font-bold">
                      <span>المندوب: {v.repName}</span>
                      <span>الفرع: {v.branchName || '-'}</span>
                      <span>تاريخ الزيارة: {v.date}</span>
                      {customer?.phone ? <span>التليفون: {customer.phone}</span> : null}
                      {customer?.address ? <span>العنوان: {customer.address}</span> : null}
                    </div>
                    {v.returnReason ? <p className="mt-2 text-xs font-bold text-slate-700">السبب: {v.returnReason}</p> : null}
                    {v.returnItems ? <p className="mt-1 text-xs text-slate-600">الأصناف: {v.returnItems}</p> : null}
                    {text ? <p className="mt-1 text-xs text-slate-500">ملاحظات: {text}</p> : null}
                    {typeof meta.receivedCartons === 'number' ? (
                      <p className="mt-1 text-xs font-black text-teal-700">المستلم فعلياً: {meta.receivedCartons} كرتونة{typeof meta.receivedPieces === 'number' ? ` — ${meta.receivedPieces} قطعة` : ''}</p>
                    ) : null}
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-lg font-black" style={{ color: 'var(--app-navy)' }}>{(Number(v.returnValue) || 0).toLocaleString()} ج.م</div>
                    <div className={`text-[11px] font-black mt-1 ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>مدة المرحلة: {formatElapsed(age)}</div>
                    {v.returnHandledBy ? <div className="text-[11px] font-bold text-slate-400 mt-0.5">المسؤول: {v.returnHandledBy}</div> : null}
                  </div>
                </div>
                {actions.length ? (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <button
                        key={a.stage + a.label}
                        type="button"
                        onClick={() => handleAction(v, a.stage, a.label, a.needsReceipt, a.needsSettlement)}
                        className={`px-3 py-2 rounded-xl text-xs font-black transition ${a.tone === 'success' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : a.tone === 'danger' ? 'bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200' : a.tone === 'warn' ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-white hover:opacity-90'}`}
                        style={a.tone === 'primary' ? { background: 'var(--app-navy)' } : undefined}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {receiptDraft ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setReceiptDraft(null); }}>
          <div className="relative z-[60] bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <h3 className="text-lg font-black mb-4">تسجيل الاستلام — {receiptDraft.visit.customerName}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">الكراتين المستلمة</span>
                <input type="number" value={receiptDraft.cartons} onChange={(e) => setReceiptDraft({ ...receiptDraft, cartons: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">القطع المستلمة</span>
                <input type="number" value={receiptDraft.pieces} onChange={(e) => setReceiptDraft({ ...receiptDraft, pieces: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">مكان الاستلام</span>
                <select
                  value={receiptDraft.location}
                  onChange={(e) => setReceiptDraft({ ...receiptDraft, location: e.target.value as ReturnLocation })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {RETURN_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="block col-span-2">
                <span className="text-[11px] text-slate-500 font-bold">ملاحظة الاستلام / الفحص</span>
                <input value={receiptDraft.note} onChange={(e) => setReceiptDraft({ ...receiptDraft, note: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setReceiptDraft(null)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-sm">إلغاء</button>
              <button
                type="button"
                onClick={() => {
                  const draft = receiptDraft;
                  advance(draft.visit, draft.stage, {
                    cartons: Number(draft.cartons) || 0,
                    pieces: Number(draft.pieces) || 0,
                    note: draft.note,
                    location: draft.location,
                  });
                  setReceiptDraft(null);
                }}
                className="px-4 py-2 rounded-lg text-white font-black text-sm"
                style={{ background: 'var(--app-navy)' }}
              >
                تأكيد الاستلام
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settlementDraft ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettlementDraft(null); }}>
          <div className="relative z-[60] bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <h3 className="text-lg font-black mb-1">إغلاق المرتجع — التصفية</h3>
            <p className="text-xs text-slate-500 font-bold mb-4">اكتب نتيجة التسوية ومبلغها النهائي (لو فيه فرق بين المطلوب والمستلم)</p>
            <label className="block">
              <span className="text-[11px] text-slate-500 font-bold">نتيجة التصفية</span>
              <textarea value={settlementDraft.note} onChange={(e) => setSettlementDraft({ ...settlementDraft, note: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </label>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setSettlementDraft(null)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-sm">إلغاء</button>
              <button
                type="button"
                onClick={() => {
                  const draft = settlementDraft;
                  advance(draft.visit, draft.stage, { note: draft.note });
                  setSettlementDraft(null);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-black text-sm"
              >
                إغلاق المرتجع
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTargets ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowTargets(false); }}>
          <div className="relative z-[60] bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <h3 className="text-lg font-black mb-1">المدد المستهدفة لكل مرحلة</h3>
            <p className="text-xs text-slate-500 font-bold mb-4">الإدارة فقط هي اللي بتحدد الأرقام — والمشرف والمندوب ومدير الفرع مش بيشوفوا الإعدادات دي</p>
            <div className="space-y-2">
              {WAREHOUSE_STAGES.filter((s) => s !== 'مغلق').map((s) => (
                <div key={s} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <span className="text-xs font-black text-slate-700">{STAGE_STYLES[s]?.label || s}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={targets[s] ?? ''}
                      onChange={(e) => setTargets({ ...targets, [s]: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—"
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                    <span className="text-[11px] font-bold text-slate-500">ساعة</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setShowTargets(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-sm">إلغاء</button>
              <button
                type="button"
                onClick={() => { saveStageTargets(targets); setFlash({ tone: 'success', text: 'تم حفظ المدد المستهدفة' }); setShowTargets(false); }}
                className="px-4 py-2 rounded-lg text-white font-black text-sm"
                style={{ background: 'var(--app-navy)' }}
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
