import { TargetQuarter, TargetRecord, User } from '../types';
import {
  isArabicNameMatch,
  isBranchMatch,
  normalizeArabicText,
  resolveBranchName,
  resolveSectorFromBranch,
  inferSectorFromText,
  BRANCH_CODE_MAP,
} from './arabicMatchingService';
import { getPublishedCsvUrl } from './dataSourceService';
import { applyCustomerSectorHeuristic, isElectricalLabel } from './sectorResolver';

// The Excel engines (xlsx-js-style + the Arabic encoding helpers) are heavy and
// only needed when a target sheet is imported or exported. They are imported
// inside the functions that use them so the app shell stays small, and so the
// browser caches one copy shared with excelService instead of duplicating it.

/**
 * Maps a month number (1-12) to its respective quarter:
 * Q1: Jan, Feb, Mar (1, 2, 3)
 * Q2: Apr, May, Jun (4, 5, 6)
 * Q3: Jul, Aug, Sep (7, 8, 9)
 * Q4: Oct, Nov, Dec (10, 11, 12)
 */
export function getQuarterFromMonth(month: number): TargetQuarter {
  if (month >= 1 && month <= 3) return 'Q1';
  if (month >= 4 && month <= 6) return 'Q2';
  if (month >= 7 && month <= 9) return 'Q3';
  return 'Q4';
}

export const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'إبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export const QUARTER_LABELS: Record<TargetQuarter, { label: string; months: string; color: string; bg: string }> = {
  Q1: { label: 'الربع الأول (Q1)', months: 'يناير - فبراير - مارس', color: 'text-[var(--app-navy-text)]', bg: 'bg-[var(--app-navy-tint)] border-[var(--app-navy-line)]' },
  Q2: { label: 'الربع الثاني (Q2)', months: 'إبريل - مايو - يونيو', color: 'text-[var(--app-ok-text)]', bg: 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)]' },
  Q3: { label: 'الربع الثالث (Q3)', months: 'يوليو - أغسطس - سبتمبر', color: 'text-[var(--app-warn-text)]', bg: 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)]' },
  Q4: { label: 'الربع الرابع (Q4)', months: 'أكتوبر - نوفمبر - ديسمبر', color: 'text-[var(--app-navy-text)]', bg: 'bg-[var(--app-navy-tint)] border-[var(--app-navy-line)]' },
};

/**
 * Format currency with Egyptian Pounds symbol
 */
export function formatEGP(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 0,
  }).format(amount) + ' ج.م';
}

/**
 * Clean and parse numeric values from Excel cells (including Arabic-Indic digits)
 */
function cleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val);
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicDigits[i]).join(String(i));
  }
  const cleaned = str
    .replace(/[,٬]/g, '')
    .replace(/٫/g, '.')
    .replace(/[^\d.-]/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const TARGET_SECTOR_TAG_RE = /\s*\[\[sector:(home|electrical)\]\]\s*/gi;

export function extractTargetSectorFromNotes(notes?: string | null): {
  cleanNotes?: string;
  sector?: 'home' | 'electrical';
} {
  const raw = String(notes || '');
  const match = raw.match(/\[\[sector:(home|electrical)\]\]/i);
  const sector = match ? (match[1].toLowerCase() as 'home' | 'electrical') : undefined;
  const clean = raw.replace(TARGET_SECTOR_TAG_RE, ' ').trim();
  return {
    cleanNotes: clean || undefined,
    sector,
  };
}

export function encodeTargetNotesWithSector(
  notes?: string | null,
  sector?: 'home' | 'electrical' | 'all'
): string | null {
  const { cleanNotes } = extractTargetSectorFromNotes(notes);
  if (sector !== 'home' && sector !== 'electrical') {
    return cleanNotes || null;
  }
  const tag = `[[sector:${sector}]]`;
  return cleanNotes ? `${cleanNotes} ${tag}` : tag;
}

/**
 * Parse date from Excel cells (supports serial dates, strings, Arabic month names)
 */
function parseExcelDate(val: any): { dateStr: string; month: number; year: number; quarter: TargetQuarter } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12
  let day = 1;

  if (typeof val === 'number') {
    // Excel serial date (days since 1899-12-30)
    try {
      const parsedDate = new Date((val - (25567 + 2)) * 86400 * 1000);
      if (!isNaN(parsedDate.getTime())) {
        year = parsedDate.getFullYear();
        month = parsedDate.getMonth() + 1;
        day = parsedDate.getDate();
      }
    } catch {
      // fallback
    }
  } else if (val) {
    const s = String(val).trim();

    // Check for Arabic month names
    const norm = normalizeArabicText(s);
    for (let i = 0; i < ARABIC_MONTHS.length; i++) {
      if (norm.includes(normalizeArabicText(ARABIC_MONTHS[i]))) {
        month = i + 1;
        const yearMatch = s.match(/20\d{2}/);
        if (yearMatch) year = parseInt(yearMatch[0], 10);
        break;
      }
    }

    // Check for YYYY-MM-DD or YYYY/MM/DD or YYYY-MM
    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      if (isoMatch[3]) day = parseInt(isoMatch[3], 10);
    } else {
      // Check for DD-MM-YYYY or DD/MM/YYYY
      const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmyMatch) {
        day = parseInt(dmyMatch[1], 10);
        month = parseInt(dmyMatch[2], 10);
        year = parseInt(dmyMatch[3], 10);
      }
    }
  }

  // Safety clamp
  if (month < 1 || month > 12) month = now.getMonth() + 1;
  if (year < 2020 || year > 2035) year = now.getFullYear();

  const formattedMonth = String(month).padStart(2, '0');
  const formattedDay = String(day).padStart(2, '0');
  const dateStr = `${year}-${formattedMonth}-${formattedDay}`;
  const quarter = getQuarterFromMonth(month);

  return { dateStr, month, year, quarter };
}

/**
 * Parse Target Excel file uploaded by Admin or Developer
 * Matches columns:
 * الفرع | المندوب | هدف البيع | المحقق بيع | نسبه البيع | هدف التحصيل | المحقق تحصيل | نسبه تحصيل | تاريخ
 */
/**
 * Fetch and parse Target records directly from a Google Sheets URL
 */
export async function fetchTargetsFromGoogleSheetUrl(urlOrId: string): Promise<TargetRecord[]> {
  const clean = (urlOrId || '').trim();
  if (!clean) return [];

  // Generate resilient list of CSV export candidate URLs to try
  const candidates: string[] = [];
  const primary = getPublishedCsvUrl(clean);
  if (primary) candidates.push(primary);

  const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = clean.match(/[?#&]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  if (match) {
    const sheetId = match[1];
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const pubUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv&gid=${gid}`;

    if (!candidates.includes(gvizUrl)) candidates.push(gvizUrl);
    if (!candidates.includes(exportUrl)) candidates.push(exportUrl);
    if (!candidates.includes(pubUrl)) candidates.push(pubUrl);
  }

  let lastError: any = null;

  const XLSX = await import('xlsx-js-style');
  const { decodeBufferSmart } = await import('./encodingService');

  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl);
      if (!response.ok) {
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const csvText = decodeBufferSmart(arrayBuffer).replace(/^\uFEFF/, '');
      if (!csvText || csvText.trim().length === 0) continue;

      const workbook = XLSX.read(csvText, { type: 'string', codepage: 65001 });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) continue;

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rawRows && rawRows.length >= 2) {
        return parseTargetRawRows(rawRows);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw (
    lastError ||
    new Error(
      'فشل جلب أهداف المبيعات من شيت جوجل. يرجى التأكد من أن رابط الشيت منشور للعامة (Anyone with the link can view).'
    )
  );
}

export async function parseTargetExcel(fileOrBuffer: File | ArrayBuffer): Promise<TargetRecord[]> {
  const XLSX = await import('xlsx-js-style');
  let data: ArrayBuffer;
  if (fileOrBuffer instanceof File) {
    data = await fileOrBuffer.arrayBuffer();
  } else {
    data = fileOrBuffer;
  }

  const workbook = XLSX.read(data, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('ملف الإكسل لا يحتوي على أي صفحات.');
  }

  // Look for preferred sheet name
  let targetSheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    const norm = normalizeArabicText(name);
    if (norm.includes('تارجت') || norm.includes('هدف') || norm.includes('اهداف') || norm.includes('target')) {
      targetSheetName = name;
      break;
    }
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  return parseTargetRawRows(rawRows);
}

/**
 * Common row parser for Target data (from Excel or Google Sheets)
 */
export function parseTargetRawRows(rawRows: any[][]): TargetRecord[] {
  if (!rawRows || rawRows.length < 2) {
    throw new Error('ملف الإكسل فارغ أو لا يحتوي على صفوف بيانات.');
  }

  // Find header row (first row with recognisable column keywords)
  let headerRowIndex = -1;
  let colMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r].map((c) => normalizeArabicText(String(c)));
    let hasBranch = false;
    let hasRep = false;
    let hasSales = false;

    const tempMap: Record<string, number> = {};

    row.forEach((cell, idx) => {
      // Accept a named branch column OR a bare branch number (15 / 45 / ...),
      // so an uploaded target sheet can carry the branch as a code.
      if (cell.includes('فرع') || cell.includes('branch') || BRANCH_CODE_MAP[cell] !== undefined) {
        hasBranch = true;
        tempMap['branch'] = idx;
      }
      if (cell.includes('مندوب') || cell.includes('rep') || cell.includes('بائع') || cell.includes('موظف')) {
        hasRep = true;
        tempMap['rep'] = idx;
      }
      if (
        (cell.includes('هدف') && cell.includes('بيع')) ||
        (cell.includes('تارجت') && cell.includes('بيع')) ||
        (cell.includes('مستهدف') && cell.includes('بيع')) ||
        cell === 'هدف البيع' ||
        cell === 'تارجت البيع'
      ) {
        hasSales = true;
        tempMap['salesTarget'] = idx;
      } else if (
        cell.includes('محقق') && cell.includes('بيع') ||
        cell.includes('فعلي') && cell.includes('بيع') ||
        cell === 'المحقق بيع'
      ) {
        tempMap['salesAchieved'] = idx;
      } else if (
        (cell.includes('نسب') && cell.includes('بيع')) ||
        cell === 'نسبه البيع' ||
        cell === 'نسبة البيع'
      ) {
        tempMap['salesPercentage'] = idx;
      } else if (
        (cell.includes('هدف') && cell.includes('تحصيل')) ||
        (cell.includes('تارجت') && cell.includes('تحصيل')) ||
        (cell.includes('مستهدف') && cell.includes('تحصيل')) ||
        cell === 'هدف التحصيل' ||
        cell === 'تارجت التحصيل'
      ) {
        tempMap['collectionTarget'] = idx;
      } else if (
        cell.includes('محقق') && cell.includes('تحصيل') ||
        cell.includes('فعلي') && cell.includes('تحصيل') ||
        cell === 'المحقق تحصيل'
      ) {
        tempMap['collectionAchieved'] = idx;
      } else if (
        (cell.includes('نسب') && cell.includes('تحصيل')) ||
        cell === 'نسبه تحصيل' ||
        cell === 'نسبة تحصيل' ||
        cell === 'نسبة التحصيل'
      ) {
        tempMap['collectionPercentage'] = idx;
      } else if (
        cell.includes('تاريخ') ||
        cell.includes('شهر') ||
        cell.includes('date') ||
        cell.includes('period')
      ) {
        tempMap['date'] = idx;
      } else if (cell === 'قطاع' || cell === 'القطاع' || cell.includes('قطاع') || cell.includes('sector')) {
        tempMap['sector'] = idx;
      }
    });

    if (hasBranch && (hasRep || hasSales)) {
      headerRowIndex = r;
      colMap = tempMap;
      break;
    }
  }

  // Fallback to sequential standard columns if header not matched by keyword
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    colMap = {
      branch: 0,
      rep: 1,
      salesTarget: 2,
      salesAchieved: 3,
      salesPercentage: 4,
      collectionTarget: 5,
      collectionAchieved: 6,
      collectionPercentage: 7,
      date: 8,
    };
  }

  const results: TargetRecord[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const branch = String(row[colMap['branch']] || '').trim();
    const repName = String(row[colMap['rep']] || '').trim();

    // Skip empty or summary rows
    if (!branch && !repName) continue;
    if (branch.includes('إجمالي') || branch.includes('اجمالي') || repName.includes('إجمالي') || repName.includes('اجمالي')) {
      continue;
    }

    // Financial values in the source sheet may be formatted as negative accounting values.
    // Targets and achieved amounts are performance measures, so always display them as positive values.
    const salesTarget = Math.abs(cleanNumber(row[colMap['salesTarget']]));
    const salesAchieved = Math.abs(cleanNumber(row[colMap['salesAchieved']]));
    let salesPercentage = cleanNumber(row[colMap['salesPercentage']]);
    if (!salesPercentage && salesTarget > 0) {
      salesPercentage = Math.round((salesAchieved / salesTarget) * 1000) / 10;
    } else if (salesPercentage > 0 && salesPercentage <= 1.0) {
      // Excel decimal percentage representation (e.g. 0.85 -> 85%)
      salesPercentage = Math.round(salesPercentage * 1000) / 10;
    }

    const collectionTarget = Math.abs(cleanNumber(row[colMap['collectionTarget']]));
    const collectionAchieved = Math.abs(cleanNumber(row[colMap['collectionAchieved']]));
    let collectionPercentage = cleanNumber(row[colMap['collectionPercentage']]);
    if (!collectionPercentage && collectionTarget > 0) {
      collectionPercentage = Math.round((collectionAchieved / collectionTarget) * 1000) / 10;
    } else if (collectionPercentage > 0 && collectionPercentage <= 1.0) {
      collectionPercentage = Math.round(collectionPercentage * 1000) / 10;
    }

    const dateVal = colMap['date'] !== undefined ? row[colMap['date']] : undefined;
    const { dateStr, month, year, quarter } = parseExcelDate(dateVal);

    const remainingSales = Math.max(0, salesTarget - salesAchieved);
    const remainingCollection = Math.max(0, collectionTarget - collectionAchieved);

    // Resolve the branch ONCE and use it for both the id and the value. Building
    // the id from the raw cell meant the same branch uploaded as "15" and as
    // "فرع الفيوم" produced two different records.
    const rawSectorCell = colMap['sector'] !== undefined ? normalizeArabicText(String(row[colMap['sector']] || '')) : '';
    const detectedSector: 'home' | 'electrical' | undefined =
      rawSectorCell.includes('كهرب') || rawSectorCell.includes('electrical')
        ? 'electrical'
        : rawSectorCell.includes('منزل') || rawSectorCell.includes('home')
        ? 'home'
        : resolveSectorFromBranch(branch) ||
          inferSectorFromText(branch) ||
          (isElectricalLabel(branch, repName) ? 'electrical' : undefined) ||
          (normalizeArabicText(branch).includes('منزل') ? 'home' : undefined);

    const resolvedBranch = resolveBranchName(branch) || branch || 'الفرع الرئيسي';
    const sectorSuffix = detectedSector ? `__${detectedSector}` : '';

    const record: TargetRecord = {
      id: `trg-${normalizeArabicText(resolvedBranch).replace(/\s+/g, '_')}__${normalizeArabicText(repName).replace(/\s+/g, '_')}__${dateStr || 'nodate'}_${month || 'm0'}_${year || 'y0'}${sectorSuffix}`,
      branch: resolvedBranch,
      repName: repName || 'مندوب غير محدد',
      sector: detectedSector,
      salesTarget,
      salesAchieved,
      salesPercentage: Number(salesPercentage.toFixed(1)),
      collectionTarget,
      collectionAchieved,
      collectionPercentage: Number(collectionPercentage.toFixed(1)),
      date: dateStr,
      month,
      year,
      quarter,
      remainingSales,
      remainingCollection,
      updatedAt: new Date().toISOString(),
    };

    results.push(record);
  }

  return results;
}

/**
 * Filter target records according to user role to guarantee strict data privacy:
 * - sales_rep: ONLY see their own records.
 * - supervisor: see his own records AND the records of reps supervised by him or in his branch.
 * - branch_manager: strictly see only records of his branch.
 * - admin / developer: full visibility across all branches and reps.
 */
/**
 * استنتاج قطاع هدف المندوب (منزلي / كهربائي):
 * 1) إذا كان السجل يحمل sector صريحاً أو وسم قطاع في الملاحظات.
 * 2) فحص اسم/كود الفرع واسم المندوب (أكواد الفروع الكهربائية أو كلمة "كهرب" / "منزل").
 * 3) قطاع المندوب نفسه أو كود فرعه من قائمة المستخدمين.
 * 4) استنتاج القطاع من عملاء المندوب (إن وُجدت قائمة العملاء).
 *
 * ملاحظة الأداء: الاستنتاج ده بيتم نداءه من عشرات الأماكن لكل سجل هدف، وكان
 * بيمر على كل المستخدمين وكل العملاء في كل مرة (O(targets × customers) مع
 * تطبيع عربي لكل مقارنة). بندوّب النتيجة في WeakMap مفتاحها مصفوفة
 * users ثم مصفوفة customers ثم خصائص السجل، فالنتيجة بتتحسب مرة واحدة لكل
 * (نسخة بيانات + سجل) وترجع فورًا بعد كده. الـWeakMap بيمسح نفسه تلقائيًا
 * لما مصفوفة البيانات تتغيّر.
 */
type InferredSector = 'home' | 'electrical' | undefined;

const sectorInferenceCache = new WeakMap<
  User[],
  WeakMap<object, Map<string, InferredSector>>
>();

function getSectorCacheFor(allUsers: User[], customers: object[]) {
  let byCustomers = sectorInferenceCache.get(allUsers);
  if (!byCustomers) {
    byCustomers = new WeakMap();
    sectorInferenceCache.set(allUsers, byCustomers);
  }
  let cache = byCustomers.get(customers);
  if (!cache) {
    cache = new Map();
    byCustomers.set(customers, cache);
  }
  return cache;
}

// مصفوفات فاضية ثابتة للقيم الافتراضية: `= []` كانت بتعمل مصفوفة جديدة مع كل نداء،
// والكاش متربط بهوية المصفوفة، فالنداء من غير customers (صفحة التارجت/المناديب)
// ما كانش بيلاقي الكاش أبدًا وكان بيعيد مطابقة الأسماء العربية لكل سجل كل مرة.
const EMPTY_SECTOR_USERS: User[] = [];
const EMPTY_SECTOR_CUSTOMERS: object[] = [];

export function inferTargetSector(
  record: TargetRecord,
  allUsers: User[] = EMPTY_SECTOR_USERS,
  customers: Array<{
    sector?: 'home' | 'electrical' | 'both' | 'all';
    name?: string;
    storeName?: string;
    repName?: string;
    salesRepName?: string;
    branchName?: string;
  }> = EMPTY_SECTOR_CUSTOMERS as never[]
): 'home' | 'electrical' | undefined {
  // المسار السريع: لو السجل نفسه بيحدد القطاع مفيش داعي لأي بحث.
  if (record.sector === 'home' || record.sector === 'electrical') return record.sector;

  const cache = getSectorCacheFor(allUsers, customers);
  const cacheKey = `${record.branch || ''}\u0000${record.repName || ''}\u0000${record.sector || ''}\u0000${record.notes || ''}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const result = computeTargetSector(record, allUsers, customers);
  cache.set(cacheKey, result);
  return result;
}

function computeTargetSector(
  record: TargetRecord,
  allUsers: User[] = [],
  customers: Array<{
    sector?: 'home' | 'electrical' | 'both' | 'all';
    name?: string;
    storeName?: string;
    repName?: string;
    salesRepName?: string;
    branchName?: string;
  }> = []
): 'home' | 'electrical' | undefined {
  const { sector: noteSector } = extractTargetSectorFromNotes(record.notes);
  if (noteSector) return noteSector;

  const branchSector = resolveSectorFromBranch(record.branch) || inferSectorFromText(record.branch);
  if (branchSector) return branchSector;

  if (isElectricalLabel(record.branch, record.repName)) return 'electrical';

  const branch = normalizeArabicText(record.branch || '');
  if (branch.includes('منزل') || branch.includes('منزلي')) return 'home';

  if (record.repName && allUsers.length) {
    const owner = allUsers.find(
      (u) =>
        (u?.name && isArabicNameMatch(u.name, record.repName as string)) ||
        (u?.username && normalizeArabicText(u.username) === normalizeArabicText(record.repName as string))
    );
    if (owner) {
      if (owner.sector === 'home' || owner.sector === 'electrical') return owner.sector;
      const ownerBranchSector =
        resolveSectorFromBranch(owner.branchName) || inferSectorFromText(owner.branchName);
      if (ownerBranchSector) return ownerBranchSector;
      if (isElectricalLabel(owner.name, owner.branchName)) return 'electrical';
    }
  }

  if (record.repName && customers.length) {
    let electricalHits = 0;
    let homeHits = 0;
    for (const c of customers) {
      const custRep = c.salesRepName || c.repName;
      if (!custRep || !isArabicNameMatch(custRep, record.repName)) continue;
      const cs = applyCustomerSectorHeuristic(c) || inferSectorFromText(c.branchName);
      if (cs === 'electrical') electricalHits++;
      else if (cs === 'home') homeHits++;
    }
    if (electricalHits > 0 && electricalHits >= homeHits) return 'electrical';
    if (homeHits > 0 && electricalHits === 0) return 'home';
  }

  return undefined;
}

export function filterTargetsForUser(
  records: TargetRecord[],
  currentUser: User | null,
  allUsers: User[] = [],
  customers: Array<{ supervisorName?: string; repName?: string; branchName?: string }> = []
): TargetRecord[] {
  if (!currentUser || !records || records.length === 0) return [];

  // 1. Admin & Developer have full unrestricted access across all branches and reps
  if (currentUser.role === 'admin' || currentUser.role === 'developer') {
    return records;
  }

  // 2. Sales Rep has strict single-user privacy: only his own numbers
  if (currentUser.role === 'sales_rep') {
    const currentName = currentUser.name || '';
    const currentUsername = currentUser.username || '';

    // Collect all possible aliases for the sales rep (name, username, email prefix, customer rep names/codes)
    const repAliases = new Set<string>();
    if (currentName) repAliases.add(currentName);
    if (currentUsername) repAliases.add(currentUsername);
    if (currentUser.email) {
      const emailPrefix = currentUser.email.split('@')[0];
      if (emailPrefix) repAliases.add(emailPrefix);
    }
    if ((currentUser as any).code) {
      repAliases.add(String((currentUser as any).code));
    }

    // Inspect customer records where this rep is assigned to gather known ERP/Sheet aliases
    if (Array.isArray(customers)) {
      customers.forEach((c: any) => {
        const isThisRep =
          (c.repId && c.repId === currentUser.id) ||
          (c.salesRepName && (isArabicNameMatch(c.salesRepName, currentName) || normalizeArabicText(c.salesRepName) === normalizeArabicText(currentName))) ||
          (c.repName && (isArabicNameMatch(c.repName, currentName) || normalizeArabicText(c.repName) === normalizeArabicText(currentName)));

        if (isThisRep) {
          if (c.salesRepName) repAliases.add(c.salesRepName);
          if (c.repName) repAliases.add(c.repName);
          if (c.repCode) repAliases.add(String(c.repCode));
        }
      });
    }

    // كل السجلات لنفس المندوب بترجع نفس القرار، فبنحسبه مرة واحدة لكل اسم+فرع.
    // وتطبيع اسم المستخدم والتوكنز كان بيتكرر لكل سجل — بقى مرة واحدة هنا.
    const normU = normalizeArabicText(currentName).replace(/^(مندوب|كود|أستاذ|أ|م)\s*/g, '').trim();
    const tokensU = normU.split(/\s+/).filter((t) => t.length >= 2);
    const userDigits = ((currentUser.username || '') + ' ' + (currentUser.id || '') + ' ' + ((currentUser as any).code || '')).match(/\d+/g)?.join('');
    const aliasList = Array.from(repAliases)
      .filter(Boolean)
      .map((alias) => {
        const norm = normalizeArabicText(alias);
        return {
          alias,
          lower: alias.toLowerCase(),
          norm,
          compact: norm.replace(/\s+/g, ''),
          digits: alias.match(/\d+/g)?.join(''),
        };
      });

    const decideSalesRepRecord = (cleanRepName: string, recordBranch?: string): boolean => {
      // التطبيع بيتحسب مرة واحدة للسجل بدل مرة لكل alias.
      const normRepName = normalizeArabicText(cleanRepName);
      const compactRepName = normRepName.replace(/\s+/g, '');
      const lowerRepName = cleanRepName.toLowerCase();

      // 1. Direct Arabic & alias match
      for (const a of aliasList) {
        if (isArabicNameMatch(cleanRepName, a.alias)) return true;
        if (normRepName === a.norm) return true;
        if (lowerRepName === a.lower) return true;

        // احتواء بالاسم الكامل فقط لما الجانب الأقصر اسم متعدد الكلمات
        // (زي "أحمد سيد" ⊂ "أحمد سيد محمد"). الـ substring الأعمى كان بيسمح
        // لـ "أحمد" (اسم مفرد) ياخد صف "أحمد سيد" بتاع زميله.
        const shorter = a.norm.length <= normRepName.length ? a.norm : normRepName;
        const longer = a.norm.length <= normRepName.length ? normRepName : a.norm;
        if (shorter.includes(' ') && longer.includes(shorter)) return true;

        // Compact spaces
        if (compactRepName === a.compact) return true;
      }

      // 2. Numeric rep code match (e.g. "15 - أحمد" or "(15)" or "كود 15")
      const repDigits = cleanRepName.match(/\d+/g)?.join('');
      if (repDigits) {
        if (userDigits && userDigits.includes(repDigits)) return true;
        for (const a of aliasList) {
          if (a.digits && a.digits === repDigits) return true;
        }
      }

      // 3. Branch-scoped token matching: if within rep's branch, match name tokens
      if (currentUser.branchName && isBranchMatch(recordBranch, currentUser.branchName, { allowUnassigned: false })) {
        const normR = normRepName.replace(/^(مندوب|كود|أستاذ|أ|م)\s*/g, '').trim();
        const tokensR = normR.split(/\s+/).filter((t) => t.length >= 2);

        if (tokensR.length >= 2 && tokensU.length >= 2) {
          const matchCount = tokensR.filter((tr) => tokensU.some((tu) => tr === tu || isArabicNameMatch(tr, tu))).length;
          if (matchCount >= 2) return true;
        } else if (tokensR.length === 1 && tokensU.length === 1) {
          // اسما من كلمة واحدة للطرفين: تطابق تام فقط.
          if (tokensR[0] === tokensU[0]) return true;
        } else {
          // كلمة واحدة مقابل اسم متعدد: نسمح فقط لو الكلمة المفردة مميزة
          // (طويلة — 6 حروف فأكثر) ومطابقة تماماً لأحد كلمات الطرف الآخر.
          // "أحمد" مش هتضبط مع "أحمد سيد" بتاع الزميل، لكن "عبدالرحمن"
          // هتضبط مع "عبدالرحمن حسن" لأنها كلمة نادرة ومميزة.
          const single = tokensR.length === 1 ? tokensR[0] : tokensU[0];
          const multiTokens = tokensR.length === 1 ? tokensU : tokensR;
          if (single && single.length >= 6 && multiTokens.some((t) => t === single)) return true;
        }
      }

      return false;
    };

    const decisionCache = new Map<string, boolean>();
    return records.filter((r) => {
      const cleanRepName = (r.repName || '').trim();
      if (!cleanRepName) return false;
      const cacheKey = `${cleanRepName}\u0000${r.branch || ''}`;
      const cached = decisionCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const decision = decideSalesRepRecord(cleanRepName, r.branch);
      decisionCache.set(cacheKey, decision);
      return decision;
    });
  }

  // 3. Supervisor: strictly sees his own numbers AND the reps belonging to him
  if (currentUser.role === 'supervisor') {
    const currentName = currentUser.name || '';
    const currentUsername = currentUser.username || '';
    const normCurrentName = normalizeArabicText(currentName);
    const normUsername = currentUsername ? normalizeArabicText(currentUsername) : '';

    // Collect supervised rep names from users list
    const directSupervised = allUsers.filter((u) => u.supervisorId === currentUser.id);
    const supervisedNames = new Set(directSupervised.map((u) => normalizeArabicText(u.name)));

    // Also collect supervised rep names from customer directory mapping
    customers.forEach((c) => {
      if (c.supervisorName && c.repName) {
        if (
          isArabicNameMatch(c.supervisorName, currentName) ||
          normalizeArabicText(c.supervisorName) === normCurrentName
        ) {
          supervisedNames.add(normalizeArabicText(c.repName));
        }
      }
    });
    const supervisedNameList = Array.from(supervisedNames);

    const decideSupervisorRecord = (repName: string | undefined, recordBranch?: string): boolean => {
      // Must belong to supervisor's branch or general branch
      if (!isBranchMatch(recordBranch, currentUser.branchName, { allowUnassigned: false })) return false;

      // التطبيع مرة واحدة للسجل بدل 4 مرات.
      const normRep = normalizeArabicText(repName);

      // Check if record is for the supervisor himself
      if (isArabicNameMatch(repName, currentName)) return true;
      if (normRep === normCurrentName) return true;
      if (normUsername && normRep.includes(normUsername)) return true;

      // Check if it matches any of his supervised reps
      if (supervisedNameList.length > 0) {
        return supervisedNameList.some((sn) => isArabicNameMatch(repName, sn) || normRep.includes(sn));
      }

      // No explicit assignment means the record is not visible to this supervisor.
      // Branch membership alone must never grant access to the whole branch team.
      return false;
    };

    const decisionCache = new Map<string, boolean>();
    return records.filter((r) => {
      const cacheKey = `${r.repName || ''}\u0000${r.branch || ''}`;
      const cached = decisionCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const decision = decideSupervisorRecord(r.repName, r.branch);
      decisionCache.set(cacheKey, decision);
      return decision;
    });
  }

  // 4. Branch Manager: strictly sees records of his branch only
  if (currentUser.role === 'branch_manager') {
    const branchDecision = new Map<string, boolean>();
    return records.filter((r) => {
      const key = r.branch || '';
      const cached = branchDecision.get(key);
      if (cached !== undefined) return cached;
      const decision = isBranchMatch(r.branch, currentUser.branchName, { allowUnassigned: false });
      branchDecision.set(key, decision);
      return decision;
    });
  }

  return [];
}

/**
 * Empty by default - no fake or dummy data is seeded
 * Real records are uploaded directly via Excel by Admin or Developer.
 */
export function generateSampleTargets(): TargetRecord[] {
  return [];
}

/**
 * Export targets to Excel — معطل (متاح للفواتير فقط)
 */
export async function exportTargetsToExcel(records: TargetRecord[], filename = 'تارجت_المبيعات_والتحصيل_الطنطاوي.xlsx') {
  alert('تصدير Excel معطل — متاح للفواتير فقط');
}

/**
 * Download standard empty / sample Excel template for upload — معطل (متاح للفواتير فقط)
 */
export async function downloadTargetTemplateExcel() {
  alert('تحميل قالب Excel معطل — متاح للفواتير فقط');
}
