import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ClipboardPaste,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
import {
  parseVisitsFromText,
  suggestedYearFor,
  type ParsedLineStatus,
} from '../services/whatsappVisitParser';
import type { Customer } from '../types';

/**
 * Import visit records pasted from WhatsApp groups and Excel exports.
 *
 * Admin/developer only. The flow is deliberately two-step - paste, then review, then
 * save - because the pasted sheets carry no customer code in the Excel shape, so a name
 * has to be matched to a customer by guesswork. Nothing is written until the user has
 * seen every row, every resolved date and every resolved customer, and confirmed.
 *
 * Names the user has to correct are remembered, so the second paste of the same month
 * resolves them without help.
 */

const MANUAL_MAP_KEY = 'visit_import_manual_customer_map_v1';

/** Customer codes are inconsistent in the database (CUST016826 / CUST-1001 / 016826),
 *  so matching compares the digits only. */
const codeKey = (value?: string | null): string => {
  if (!value) return '';
  const digits = (value.match(/\d+/g) || []).join('');
  return digits ? digits.padStart(6, '0') : '';
};

type MatchKind = 'code' | 'name_exact' | 'name_fuzzy' | 'remembered' | 'manual' | 'none';

interface ImportRow {
  lineNumber: number;
  raw: string;
  include: boolean;
  date: string;
  time?: string;
  pastedCode?: string;
  pastedName?: string;
  customerId?: string;
  status: ParsedLineStatus;
  note?: string;
  matchKind: MatchKind;
}

const STATUS_STYLE: Record<ParsedLineStatus, { label: string; className: string }> = {
  ok: { label: 'جاهز', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ambiguous_date: { label: 'راجع التاريخ', className: 'bg-amber-100 text-amber-900 border-amber-200' },
  no_date: { label: 'ينقصه تاريخ', className: 'bg-amber-100 text-amber-900 border-amber-200' },
  duplicate_in_paste: { label: 'مكرر في اللصق', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  travel_marker: { label: 'سطر تنقل', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  new_customer: { label: 'عميل جديد', className: 'bg-violet-100 text-violet-800 border-violet-200' },
  unreadable: { label: 'غير مفهوم', className: 'bg-rose-100 text-rose-800 border-rose-200' },
};

interface VisitImportModalProps {
  onClose: () => void;
}

export const VisitImportModal: React.FC<VisitImportModalProps> = ({ onClose }) => {
  const { currentUser, customers, users, addVisit } = useApp();

  const [pastedText, setPastedText] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ added: number; failed: string[] } | null>(null);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Manual corrections are the point of the review step, so they must outlive the modal
  // AND stay live for the rest of the session: a ref, not a memo, so re-analysing the
  // same paste resolves the corrected names without needing a reload.
  const manualMapRef = useRef<Map<string, string> | null>(null);
  if (manualMapRef.current === null) {
    let initial = new Map<string, string>();
    try {
      const raw = localStorage.getItem(MANUAL_MAP_KEY);
      if (raw) initial = new Map<string, string>(JSON.parse(raw) as [string, string][]);
    } catch {
      initial = new Map<string, string>();
    }
    manualMapRef.current = initial;
  }

  const saveManualMap = (map: Map<string, string>) => {
    try {
      localStorage.setItem(MANUAL_MAP_KEY, JSON.stringify(Array.from(map.entries())));
    } catch {
      /* storage full or blocked: the import still works, it just will not be remembered */
    }
  };

  const byCode = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => {
      const key = codeKey(c.code);
      if (key && !map.has(key)) map.set(key, c);
    });
    return map;
  }, [customers]);

  const byName = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => {
      const key = normalizeArabicText(c.name || '');
      if (key && !map.has(key)) map.set(key, c);
    });
    return map;
  }, [customers]);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  /**
   * Resolves one pasted line to a customer, cheapest strategy first:
   * remembered correction, then exact customer code, then exact normalised name, and
   * only then a fuzzy scan over the whole base. The fuzzy scan is the slow path, so it
   * only runs for lines the fast paths could not place.
   */
  const resolveCustomer = (
    pastedCode: string | undefined,
    pastedName: string | undefined
  ): { customerId?: string; matchKind: MatchKind } => {
    const nameKey = pastedName ? normalizeArabicText(pastedName) : '';
    const manualMap = manualMapRef.current ?? new Map<string, string>();

    if (nameKey && manualMap.has(nameKey)) {
      const id = manualMap.get(nameKey)!;
      if (customerById.has(id)) return { customerId: id, matchKind: 'remembered' };
    }

    if (pastedCode) {
      const found = byCode.get(codeKey(pastedCode));
      if (found) return { customerId: found.id, matchKind: 'code' };
    }

    if (nameKey) {
      const exact = byName.get(nameKey);
      if (exact) return { customerId: exact.id, matchKind: 'name_exact' };
    }

    if (nameKey) {
      for (const customer of customers) {
        if (!customer.name) continue;
        if (isArabicNameMatch(customer.name, pastedName!)) {
          return { customerId: customer.id, matchKind: 'name_fuzzy' };
        }
      }
    }

    return { matchKind: 'none' };
  };

  const handleAnalyze = () => {
    if (!pastedText.trim()) return;
    setIsAnalyzing(true);
    setSaveResult(null);

    // Yield once so the button can paint its working state before the fuzzy scan.
    window.setTimeout(() => {
      const parsed = parseVisitsFromText(pastedText, { defaultYear: suggestedYearFor(pastedText) });
      const next: ImportRow[] = parsed.map((line) => {
        const resolved = resolveCustomer(line.customerCode, line.customerName);
        const structuralOnly =
          line.status === 'travel_marker' || line.status === 'unreadable' || line.status === 'new_customer';
        const usable =
          Boolean(line.date) && Boolean(resolved.customerId) &&
          line.status !== 'duplicate_in_paste' && !structuralOnly;

        const row: ImportRow = {
          lineNumber: line.lineNumber,
          raw: line.raw,
          include: usable,
          date: line.date ?? '',
          time: line.time,
          pastedCode: line.customerCode,
          pastedName: line.customerName,
          customerId: resolved.customerId,
          status: line.status,
          note: line.note,
          matchKind: resolved.matchKind,
        };

        if (usable && !line.date) row.note = 'بدون تاريخ';
        else if (resolved.matchKind === 'none' && !structuralOnly) {
          row.note = 'العميل مش متطابق - اختاره يدوي';
        }
        return row;
      });
      setRows(next);
      setIsAnalyzing(false);
    }, 20);
  };

  const updateRow = (lineNumber: number, patch: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r) => (r.lineNumber === lineNumber ? { ...r, ...patch } : r)));
  };

  const assignCustomer = (lineNumber: number, customer: Customer) => {
    const row = rows.find((r) => r.lineNumber === lineNumber);
    updateRow(lineNumber, {
      customerId: customer.id,
      matchKind: 'manual',
      note: undefined,
      include: Boolean(row?.date),
    });
    // Remember the correction so the same name resolves itself next time.
    if (row?.pastedName) {
      const key = normalizeArabicText(row.pastedName);
      if (key) {
        const current = manualMapRef.current ?? new Map<string, string>();
        const next = new Map(current);
        next.set(key, customer.id);
        manualMapRef.current = next;
        saveManualMap(next);
      }
    }
  };

  const reset = () => {
    setRows([]);
    setSaveResult(null);
    setPickerFor(null);
    setPastedText('');
    textareaRef.current?.focus();
  };

  const handleSave = () => {
    const batch = rows.filter((r) => r.include && r.date && r.customerId);
    if (batch.length === 0) return;
    setIsSaving(true);

    const failed: string[] = [];
    let added = 0;

    batch.forEach((row, index) => {
      const customer = customerById.get(row.customerId!);
      if (!customer) {
        failed.push(`سطر ${row.lineNumber}: العميل مش موجود`);
        return;
      }
      const assignedRep = users.find((u) => u.id === customer.repId);
      const result = addVisit({
        customerId: customer.id,
        date: row.date,
        time: row.time,
        repId: customer.repId || '',
        repName: assignedRep?.name || customer.salesRepName || customer.repName || 'غير محدد',
        branchName: customer.branchName || assignedRep?.branchName || '',
        status: 'منفذة',
        type: 'زيارة دورية',
        notes: `استيراد من الواتساب — سطر ${row.lineNumber}`,
      });
      if (result?.success) added++;
      else failed.push(`سطر ${row.lineNumber}: ${result?.message || 'فشل الحفظ'}`);
      if (index === batch.length - 1) {
        setIsSaving(false);
        setSaveResult({ added, failed });
      }
    });
  };

  const included = rows.filter((r) => r.include).length;
  const readyCount = rows.filter((r) => r.include && r.date && r.customerId).length;
  const needsCustomer = rows.filter((r) => !r.customerId && r.status !== 'travel_marker' && r.status !== 'unreadable' && r.status !== 'new_customer').length;
  const skipped = rows.filter((r) => r.status === 'travel_marker' || r.status === 'unreadable' || r.status === 'new_customer' || r.status === 'duplicate_in_paste').length;

  const pickerCandidates = useMemo(() => {
    if (pickerFor === null) return [];
    const row = rows.find((r) => r.lineNumber === pickerFor);
    if (!row?.pastedName) return [];
    const wanted = normalizeArabicText(row.pastedName);
    const q = normalizeArabicText(pickerSearch.trim());
    return customers
      .filter((c) => !q || normalizeArabicText(c.name || '').includes(q) || normalizeArabicText(c.code || '').includes(q))
      .sort((a, b) => {
        const aScore = normalizeArabicText(a.name || '').includes(wanted) ? 0 : 1;
        const bScore = normalizeArabicText(b.name || '').includes(wanted) ? 0 : 1;
        return aScore - bScore || (a.name || '').localeCompare(b.name || '', 'ar');
      })
      .slice(0, 60);
  }, [pickerFor, pickerSearch, rows, customers]);

  const canUse = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  if (!canUse) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="p-5 sm:p-6 bg-slate-900 text-white rounded-t-2xl sm:rounded-t-3xl flex items-start justify-between gap-3 sticky top-0 z-10">
          <div>
            <h3 className="text-lg font-black flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5 text-amber-400" />
              استيراد الزيارات من الواتساب / الإكسل
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              الصق النص الخام كما هو — النظام يقرأ التاريخ والوقت وكود العميل، ويعرض كل سطر قبل الحفظ
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition" title="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              مفيش أي حفظ بيحصل غير بعد ما تراجع وتأكد. التاريخ بيترجم <strong>يوم/شهر</strong> — لو طلع غلط عدّله من نفس الصف.
              سطور زي «التحرك للسوق» بتتقفل تلقائي، والعميل اللي مش موجود بيتساب لك.
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={'الصق هنا نص الواتساب أو الإكسل كما هو...\nمثال:\nCUST016826\tعمرو عبدالله\nمحمود فتحي\t٧:٠٧ م\t١‏/٧‏/٢٠٢٦'}
            className="w-full h-40 p-3 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-400"
            dir="rtl"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !pastedText.trim()}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs transition active:scale-95"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              تحليل النص
            </button>
            {rows.length > 0 && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs border border-slate-200 transition active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                لصق جديد
              </button>
            )}
            <span className="text-[11px] text-slate-500 font-bold mr-auto">
              {rows.length > 0
                ? `${rows.length} سطر · ${readyCount} جاهز للحفظ · ${needsCustomer} محتاج عميل · ${skipped} متخطى`
                : 'الصق النص ثم اضغط تحليل'}
            </span>
          </div>

          {saveResult && (
            <div
              className={`rounded-xl border p-3 text-xs font-bold ${
                saveResult.failed.length === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              تم تسجيل {saveResult.added} زيارة.
              {saveResult.failed.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 font-normal">
                  {saveResult.failed.slice(0, 6).map((f, i) => (
                    <li key={i}>· {f}</li>
                  ))}
                  {saveResult.failed.length > 6 && <li>· و {saveResult.failed.length - 6} فشل تاني</li>}
                </ul>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-2 max-h-[46vh] overflow-y-auto">
              {rows.map((row) => {
                const customer = row.customerId ? customerById.get(row.customerId) : undefined;
                const assignedRep = customer ? users.find((u) => u.id === customer.repId) : undefined;
                const style = STATUS_STYLE[row.status];
                const isSkipped =
                  row.status === 'travel_marker' || row.status === 'unreadable' ||
                  row.status === 'new_customer' || row.status === 'duplicate_in_paste';

                return (
                  <div
                    key={row.lineNumber}
                    className={`rounded-xl border p-3 text-xs ${
                      isSkipped ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!isSkipped && (
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => updateRow(row.lineNumber, { include: e.target.checked })}
                          disabled={!row.date || !row.customerId}
                          className="mt-1 w-4 h-4 accent-amber-500"
                        />
                      )}

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-400 font-mono">سطر {row.lineNumber}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.className}`}>
                            {style.label}
                          </span>
                          {row.matchKind === 'name_fuzzy' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200">
                              مطابقة بالاسم
                            </span>
                          )}
                          {row.matchKind === 'remembered' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-violet-50 text-violet-800 border-violet-200">
                              من تصحيح سابق
                            </span>
                          )}
                          {row.note && <span className="text-amber-700 font-bold">{row.note}</span>}
                        </div>

                        <div className="text-slate-500 font-mono text-[11px] truncate" title={row.raw}>
                          {row.raw}
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                          {!isSkipped && (
                            <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-slate-500">تاريخ الزيارة</span>
                              <input
                                type="date"
                                value={row.date}
                                onChange={(e) => updateRow(row.lineNumber, { date: e.target.value })}
                                className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </label>
                          )}
                          {row.time && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 pb-2">
                              <CalendarDays className="w-3.5 h-3.5" />
                              {row.time}
                            </span>
                          )}

                          {customer ? (
                            <div className="flex items-center gap-2 pb-1">
                              <div>
                                <div className="text-[10px] font-bold text-slate-500">العميل</div>
                                <div className="font-black text-slate-900">{customer.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {customer.code} · {customer.branchName || '—'} · {assignedRep?.name || 'بلا مندوب'}
                                </div>
                              </div>
                              {!isSkipped && (
                                <button
                                  onClick={() => {
                                    setPickerFor(row.lineNumber);
                                    setPickerSearch('');
                                  }}
                                  className="text-slate-400 hover:text-amber-600 transition"
                                  title="تغيير العميل"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ) : !isSkipped ? (
                            <button
                              onClick={() => {
                                setPickerFor(row.lineNumber);
                                setPickerSearch(row.pastedName || '');
                              }}
                              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-3 py-2 rounded-lg text-xs border border-amber-200 transition"
                            >
                              <Search className="w-3.5 h-3.5" />
                              اختر العميل: {row.pastedName || row.pastedCode || 'غير معروف'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {pickerFor === row.lineNumber && (
                      <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            placeholder="ابحث بالاسم أو الكود"
                            className="flex-1 px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <button
                            onClick={() => setPickerFor(null)}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y divide-slate-200">
                          {pickerCandidates.length === 0 && (
                            <p className="text-[11px] text-slate-500 p-2">مفيش عميل بالاسم ده</p>
                          )}
                          {pickerCandidates.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                assignCustomer(row.lineNumber, c);
                                setPickerFor(null);
                              }}
                              className="w-full text-right p-2 hover:bg-white transition"
                            >
                              <div className="font-bold text-slate-800">{c.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {c.code} · {c.branchName || '—'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="p-4 sm:px-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl sm:rounded-b-3xl flex items-center justify-between gap-3 sticky bottom-0">
            <span className="text-[11px] text-slate-600 font-bold">
              {included} صف محدد · {readyCount} جاهز فعليًا للحفظ
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
              >
                إغلاق
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || readyCount === 0}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black px-5 py-2.5 rounded-xl text-xs shadow-sm transition active:scale-95"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                حفظ {readyCount} زيارة
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
