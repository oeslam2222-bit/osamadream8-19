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
import { getArabicTokens, isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
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

/** Preview rows mounted at a time, and rows resolved per animation frame. */
const PREVIEW_CHUNK = 100;

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
  duplicate_existing: { label: 'زيارة مسجلة بنفس التاريخ', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  travel_marker: { label: 'سطر تنقل', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  new_customer: { label: 'عميل جديد', className: 'bg-violet-100 text-violet-800 border-violet-200' },
  unreadable: { label: 'غير مفهوم', className: 'bg-rose-100 text-rose-800 border-rose-200' },
};

interface VisitImportModalProps {
  onClose: () => void;
}

export const VisitImportModal: React.FC<VisitImportModalProps> = ({ onClose }) => {
  const { currentUser, customers, users, visits, addImportedVisits } = useApp();

  const [pastedText, setPastedText] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const analysisRunRef = useRef<(() => void) | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveResult, setSaveResult] = useState<{
    added: number;
    duplicates: number;
    queued: boolean;
    failed: string[];
  } | null>(null);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [previewCount, setPreviewCount] = useState(100);
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

  const existingVisitDays = useMemo(() => {
    const keys = new Set<string>();
    const add = (customerId: string | undefined, date: string | undefined) => {
      if (customerId && date) keys.add(`${customerId}|${date.slice(0, 10)}`);
    };
    visits.forEach((visit) => add(visit.customerId, visit.date));
    customers.forEach((customer) => {
      (customer.visitHistory || []).forEach((visit) => add(visit.customerId || customer.id, visit.date));
    });
    return keys;
  }, [visits, customers]);

  /**
   * Token -> customer ids, built once per customer base.
   *
   * This is what makes pasting a whole year feasible. Scanning every customer for every
   * pasted name costs ~65 ms per line (measured), so 5,800 lines that do not match
   * would take about six minutes and lock the tab. Indexing by Arabic name token means
   * a pasted name is only ever compared against customers that actually share a word
   * with it - usually a handful.
   */
  const tokenIndex = useMemo(() => {
    const index = new Map<string, string[]>();
    customers.forEach((customer) => {
      if (!customer.name) return;
      const tokens = getArabicTokens(customer.name);
      const seen = new Set(tokens);
      seen.forEach((token) => {
        const bucket = index.get(token);
        if (bucket) bucket.push(customer.id);
        else index.set(token, [customer.id]);
      });
    });
    return index;
  }, [customers]);

  /**
   * Resolves one pasted line to a customer, cheapest strategy first: remembered
   * correction, exact customer code, exact normalised name, then a token-narrowed fuzzy
   * match. The fuzzy step narrows twice - first to customers holding every token of the
   * pasted name, and only if that finds nothing to the customers holding its rarest
   * token - so a miss costs a bounded amount of work instead of a full scan.
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

    if (!nameKey) return { matchKind: 'none' };

    const tokens = Array.from(new Set(getArabicTokens(pastedName)));
    if (tokens.length === 0) return { matchKind: 'none' };

    const buckets = tokens
      .map((token) => tokenIndex.get(token))
      .filter((bucket): bucket is string[] => Boolean(bucket));

    if (buckets.length === 0) return { matchKind: 'none' };

    // Stage 1: customers carrying every token of the pasted name. The buckets are walked
    // smallest-first and intersected through a Set - filtering one bucket with another's
    // includes() would be O(n^2) and slower than the full scan this index replaces.
    const ordered = [...buckets].sort((a, b) => a.length - b.length);
    let intersection: string[] = ordered[0];
    for (let i = 1; i < ordered.length && intersection.length > 0; i++) {
      const bucketSet = new Set(ordered[i]);
      intersection = intersection.filter((id) => bucketSet.has(id));
    }

    if (intersection.length > 0) {
      for (const id of intersection) {
        const candidate = customerById.get(id);
        if (candidate && isArabicNameMatch(candidate.name, pastedName)) {
          return { customerId: candidate.id, matchKind: 'name_fuzzy' };
        }
      }
    }

    // Stage 2: a partial or misspelt name still lands on its rarest shared token,
    // bounded to 120 comparisons. Past that the row is handed to the user to pick,
    // which is cheaper and more honest than guessing from 500 near-identical names.
    let rarest = buckets[0];
    for (const bucket of buckets) if (bucket.length < rarest.length) rarest = bucket;
    for (const id of rarest.slice(0, 120)) {
      const candidate = customerById.get(id);
      if (candidate && isArabicNameMatch(candidate.name, pastedName)) {
        return { customerId: candidate.id, matchKind: 'name_fuzzy' };
      }
    }

    return { matchKind: 'none' };
  };

  /**
   * Resolving a pasted line is cheap now that the token index exists, but a full year of
   * sheets is still thousands of lines. Running them in one blocking pass froze the tab,
   * so the work is sliced into chunks that yield between batches: the page stays
   * responsive, the progress bar moves, and cancelling mid-paste actually works.
   */
  const ANALYZE_CHUNK = 250;

  const handleAnalyze = () => {
    if (!pastedText.trim()) return;
    setIsAnalyzing(true);
    setSaveResult(null);
    setSaveProgress(0);
    setProgress(0);
    setRows([]);

    const parsed = parseVisitsFromText(pastedText, { defaultYear: suggestedYearFor(pastedText) });
    const total = parsed.length;
    if (total === 0) {
      setIsAnalyzing(false);
      return;
    }

    let cursor = 0;
    let collected: ImportRow[] = [];
    let cancelled = false;
    const seenCustomerDays = new Set<string>();

    const step = () => {
      if (cancelled) return;
      const end = Math.min(cursor + ANALYZE_CHUNK, total);
      for (let i = cursor; i < end; i++) {
        const line = parsed[i];
        const resolved = resolveCustomer(line.customerCode, line.customerName);
        const structuralOnly =
          line.status === 'travel_marker' || line.status === 'unreadable' || line.status === 'new_customer';
        let status = line.status;
        let note = line.note;
        if (line.date && resolved.customerId && !structuralOnly && status !== 'duplicate_in_paste') {
          const dayKey = `${resolved.customerId}|${line.date}`;
          if (existingVisitDays.has(dayKey)) {
            status = 'duplicate_existing';
            note = 'العميل له زيارة مسجلة بالفعل في نفس التاريخ';
          } else if (seenCustomerDays.has(dayKey)) {
            status = 'duplicate_in_paste';
            note = 'مكرر في نفس اللصق - اتسجل قبله';
          } else {
            seenCustomerDays.add(dayKey);
          }
        }
        const usable =
          Boolean(line.date) && Boolean(resolved.customerId) &&
          status !== 'duplicate_in_paste' && status !== 'duplicate_existing' && !structuralOnly;

        const row: ImportRow = {
          lineNumber: line.lineNumber,
          raw: line.raw,
          include: usable,
          date: line.date ?? '',
          time: line.time,
          pastedCode: line.customerCode,
          pastedName: line.customerName,
          customerId: resolved.customerId,
          status,
          note,
          matchKind: resolved.matchKind,
        };

        if (resolved.matchKind === 'none' && !structuralOnly) {
          row.note = 'العميل مش متطابق - اختاره يدوي';
        }
        collected.push(row);
      }
      cursor = end;
      setProgress(Math.round((cursor / total) * 100));
      setRows([...collected]);

      if (cursor < total) {
        window.setTimeout(step, 0);
      } else {
        setIsAnalyzing(false);
        setProgress(100);
      }
    };

    analysisRunRef.current = () => { cancelled = true; };
    window.setTimeout(step, 0);
  };

  const updateRow = (lineNumber: number, patch: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r) => (r.lineNumber === lineNumber ? { ...r, ...patch } : r)));
  };

  const assignCustomer = (lineNumber: number, customer: Customer) => {
    const row = rows.find((r) => r.lineNumber === lineNumber);
    const key = row?.date ? `${customer.id}|${row.date}` : '';
    const alreadyRegistered = Boolean(key && existingVisitDays.has(key));
    const repeatedEarlier = Boolean(key && rows.some(
      (candidate) => candidate.lineNumber < lineNumber &&
        candidate.customerId === customer.id && candidate.date === row?.date &&
        candidate.status !== 'travel_marker' && candidate.status !== 'unreadable' &&
        candidate.status !== 'new_customer'
    ));
    const isDuplicate = alreadyRegistered || repeatedEarlier;
    updateRow(lineNumber, {
      customerId: customer.id,
      matchKind: 'manual',
      status: alreadyRegistered ? 'duplicate_existing' : repeatedEarlier ? 'duplicate_in_paste' : row?.status,
      note: alreadyRegistered
        ? 'العميل له زيارة مسجلة بالفعل في نفس التاريخ'
        : repeatedEarlier
          ? 'مكرر في نفس اللصق - اتسجل قبله'
          : undefined,
      include: Boolean(row?.date) && !isDuplicate,
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
    analysisRunRef.current?.();
    setRows([]);
    setSaveResult(null);
    setPickerFor(null);
    setPreviewCount(PREVIEW_CHUNK);
    setProgress(0);
    setPastedText('');
    textareaRef.current?.focus();
  };

  const handleSave = async () => {
    const batch = rows.filter((r) => r.include && r.date && r.customerId);
    if (batch.length === 0) return;
    setIsSaving(true);
    setSaveProgress(0);
    setSaveResult(null);

    const failed: string[] = [];
    const imported = [];
    batch.forEach((row) => {
      const customer = customerById.get(row.customerId!);
      if (!customer) {
        failed.push(`سطر ${row.lineNumber}: العميل مش موجود`);
      } else {
        const assignedRep = users.find((u) => u.id === customer.repId);
        imported.push({
          customerId: customer.id,
          date: row.date,
          time: row.time,
          repId: customer.repId || '',
          repName: assignedRep?.name || customer.salesRepName || customer.repName || 'غير محدد',
          branchName: customer.branchName || assignedRep?.branchName || '',
          status: 'منفذة' as const,
          type: 'زيارة دورية' as const,
          notes: `استيراد من الواتساب — سطر ${row.lineNumber}`,
        });
      }
    });

    try {
      const result = await addImportedVisits(imported, (processed, total) => {
        setSaveProgress(total === 0 ? 100 : Math.round((processed / total) * 100));
      });
      setSaveResult({
        added: result.added,
        duplicates: result.duplicates,
        queued: result.queued,
        failed: [...failed, ...result.failed],
      });
    } catch (error) {
      console.error('WhatsApp visit import failed:', error);
      setSaveResult({
        added: 0,
        duplicates: 0,
        queued: false,
        failed: [...failed, 'حصل خطأ أثناء حفظ الزيارات؛ راجع الاتصال وحاول مرة أخرى'],
      });
    } finally {
      setIsSaving(false);
    }
  };

  // A pasted year can be thousands of rows. Mounting them all would rebuild exactly the
  // DOM problem the visit list was fixed for, so the preview is windowed too - the
  // counters below still describe the whole batch, not just what is on screen.
  const previewRows = rows.slice(0, previewCount);
  const previewRemaining = Math.max(0, rows.length - previewRows.length);

  const included = rows.filter((r) => r.include).length;
  const readyCount = rows.filter((r) => r.include && r.date && r.customerId).length;
  const needsCustomer = rows.filter((r) => !r.customerId && r.status !== 'travel_marker' && r.status !== 'unreadable' && r.status !== 'new_customer').length;
  const skipped = rows.filter((r) =>
    r.status === 'travel_marker' || r.status === 'unreadable' || r.status === 'new_customer' ||
    r.status === 'duplicate_in_paste' || r.status === 'duplicate_existing'
  ).length;

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

          {isAnalyzing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  جاري مطابقة السطور مع قائمة العملاء...
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-amber-200 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                onClick={() => {
                  analysisRunRef.current?.();
                  setIsAnalyzing(false);
                }}
                className="text-[11px] font-bold text-amber-800 underline"
              >
                إيقاف
              </button>
            </div>
          )}

          {isSaving && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  جاري حفظ الزيارات على دفعات...
                </span>
                <span>{saveProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-emerald-200 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-[width] duration-150" style={{ width: `${saveProgress}%` }} />
              </div>
            </div>
          )}

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
              {saveResult.duplicates > 0 && ` وتم تخطي ${saveResult.duplicates} زيارة مكررة.`}
              {saveResult.queued && ' الزيارات المحفوظة محليًا ستتم مزامنتها عند عودة الإنترنت.'}
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
              {previewRows.map((row) => {
                const customer = row.customerId ? customerById.get(row.customerId) : undefined;
                const assignedRep = customer ? users.find((u) => u.id === customer.repId) : undefined;
                const style = STATUS_STYLE[row.status];
                const isSkipped =
                  row.status === 'travel_marker' || row.status === 'unreadable' ||
                  row.status === 'new_customer' || row.status === 'duplicate_in_paste' ||
                  row.status === 'duplicate_existing';

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

              {previewRemaining > 0 && (
                <button
                  onClick={() => setPreviewCount((c) => c + PREVIEW_CHUNK)}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition active:scale-[0.99]"
                >
                  عرض {Math.min(PREVIEW_CHUNK, previewRemaining)} سطر كمان ({previewRows.length} من {rows.length})
                </button>
              )}
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
