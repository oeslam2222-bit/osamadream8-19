import * as XLSX from 'xlsx-js-style';
import { TargetQuarter, TargetRecord, User } from '../types';
import { isArabicNameMatch, isBranchMatch, normalizeArabicText } from './arabicMatchingService';
import { buildGoogleSheetsPublicCsvUrl } from './excelService';

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
  Q1: { label: 'الربع الأول (Q1)', months: 'يناير - فبراير - مارس', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  Q2: { label: 'الربع الثاني (Q2)', months: 'إبريل - مايو - يونيو', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  Q3: { label: 'الربع الثالث (Q3)', months: 'يوليو - أغسطس - سبتمبر', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  Q4: { label: 'الربع الرابع (Q4)', months: 'أكتوبر - نوفمبر - ديسمبر', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
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
 * Clean and parse numeric values from Excel cells
 */
function cleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val)
    .replace(/[^\d.-]/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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
export async function parseTargetExcel(fileOrBuffer: File | ArrayBuffer): Promise<TargetRecord[]> {
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
      if (cell.includes('فرع') || cell.includes('branch')) {
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

    const salesTarget = cleanNumber(row[colMap['salesTarget']]);
    const salesAchieved = cleanNumber(row[colMap['salesAchieved']]);
    let salesPercentage = cleanNumber(row[colMap['salesPercentage']]);
    if (!salesPercentage && salesTarget > 0) {
      salesPercentage = Math.round((salesAchieved / salesTarget) * 1000) / 10;
    } else if (salesPercentage > 0 && salesPercentage <= 1.0) {
      // Excel decimal percentage representation (e.g. 0.85 -> 85%)
      salesPercentage = Math.round(salesPercentage * 1000) / 10;
    }

    const collectionTarget = cleanNumber(row[colMap['collectionTarget']]);
    const collectionAchieved = cleanNumber(row[colMap['collectionAchieved']]);
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

    const record: TargetRecord = {
      id: `trg-${Date.now()}-${r}-${Math.random().toString(36).substring(2, 6)}`,
      branch: branch || 'الفرع الرئيسي',
      repName: repName || 'مندوب غير محدد',
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
export function filterTargetsForUser(
  records: TargetRecord[],
  currentUser: User | null,
  allUsers: User[] = []
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

    return records.filter((r) => {
      if (isArabicNameMatch(r.repName, currentName)) return true;
      if (normalizeArabicText(r.repName) === normalizeArabicText(currentName)) return true;
      if (currentUsername && normalizeArabicText(r.repName).includes(normalizeArabicText(currentUsername))) return true;
      return false;
    });
  }

  // 3. Supervisor: sees his own numbers AND the reps supervised by him in his branch
  if (currentUser.role === 'supervisor') {
    const currentName = currentUser.name || '';
    const currentUsername = currentUser.username || '';
    const supervisedReps = allUsers.filter((u) => u.supervisorId === currentUser.id);
    const supervisedNames = new Set(supervisedReps.map((u) => normalizeArabicText(u.name)));

    return records.filter((r) => {
      // 1. If record is for the supervisor himself
      if (isArabicNameMatch(r.repName, currentName)) return true;
      if (normalizeArabicText(r.repName) === normalizeArabicText(currentName)) return true;
      if (currentUsername && normalizeArabicText(r.repName).includes(normalizeArabicText(currentUsername))) return true;

      // 2. Or if it is for one of his assigned reps
      if (supervisedNames.size > 0) {
        const normRep = normalizeArabicText(r.repName);
        const matchesSupervised = Array.from(supervisedNames).some((sn) => isArabicNameMatch(r.repName, sn) || normRep.includes(sn));
        if (matchesSupervised) return true;
      }

      // 3. Or if it belongs to his branch team
      return isBranchMatch(r.branch, currentUser.branchName);
    });
  }

  // 4. Branch Manager: strictly sees records of his branch only
  if (currentUser.role === 'branch_manager') {
    return records.filter((r) => isBranchMatch(r.branch, currentUser.branchName));
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
 * Export targets to Excel with Tantawy Group branding & professional styling
 */
export function exportTargetsToExcel(records: TargetRecord[], filename = 'تارجت_المبيعات_والتحصيل_الطنطاوي.xlsx') {
  const wb = XLSX.utils.book_new();

  const headers = [
    'الفرع',
    'المندوب',
    'هدف البيع (ج.م)',
    'المحقق بيع (ج.م)',
    'نسبة البيع (%)',
    'المتبقي بيع (ج.م)',
    'هدف التحصيل (ج.م)',
    'المحقق تحصيل (ج.م)',
    'نسبة التحصيل (%)',
    'المتبقي تحصيل (ج.م)',
    'الكوارتر',
    'الشهر',
    'السنة',
    'التاريخ',
  ];

  const rows = records.map((r) => [
    r.branch,
    r.repName,
    r.salesTarget,
    r.salesAchieved,
    `${r.salesPercentage}%`,
    r.remainingSales,
    r.collectionTarget,
    r.collectionAchieved,
    `${r.collectionPercentage}%`,
    r.remainingCollection,
    r.quarter,
    ARABIC_MONTHS[r.month - 1] || r.month,
    r.year,
    r.date,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set RTL direction
  ws['!views'] = [{ rightToLeft: true }];

  // Column widths
  ws['!cols'] = [
    { wch: 22 }, // الفرع
    { wch: 24 }, // المندوب
    { wch: 16 }, // هدف البيع
    { wch: 16 }, // المحقق بيع
    { wch: 14 }, // نسبة البيع
    { wch: 16 }, // المتبقي بيع
    { wch: 16 }, // هدف التحصيل
    { wch: 16 }, // المحقق تحصيل
    { wch: 14 }, // نسبة التحصيل
    { wch: 16 }, // المتبقي تحصيل
    { wch: 12 }, // الكوارتر
    { wch: 14 }, // الشهر
    { wch: 10 }, // السنة
    { wch: 14 }, // التاريخ
  ];

  // Header styling
  const headerStyle = {
    font: { name: 'Cairo', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } }, // Dark Slate/Navy
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: '334155' } },
      bottom: { style: 'medium', color: { rgb: 'F59E0B' } },
    },
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:N1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cellAddr]) ws[cellAddr].s = headerStyle;
  }

  XLSX.utils.book_append_sheet(wb, ws, 'أهداف المبيعات والتحصيل');
  XLSX.writeFile(wb, filename);
}

/**
 * Download standard empty / sample Excel template for upload
 */
export function downloadTargetTemplateExcel() {
  const wb = XLSX.utils.book_new();

  const headers = [
    'الفرع',
    'المندوب',
    'هدف البيع',
    'المحقق بيع',
    'نسبه البيع',
    'هدف التحصيل',
    'المحقق تحصيل',
    'نسبه تحصيل',
    'تاريخ',
  ];

  const sampleRows = [
    ['فرع منوف', 'أحمد السيد بدير', 250000, 220000, '88.0%', 200000, 185000, '92.5%', '2026-09-01'],
    ['فرع منوف', 'محمود علي عبد العزيز', 200000, 210000, '105.0%', 170000, 175000, '102.9%', '2026-09-01'],
    ['فرع البحيرة', 'محمد فوزي النجار', 280000, 255000, '91.1%', 240000, 210000, '87.5%', '2026-09-01'],
    ['فرع الفيوم', 'ياسر عبد الرحمن عمر', 220000, 190000, '86.4%', 190000, 160000, '84.2%', '2026-09-01'],
    ['فرع القاهرة', 'كريم عادل الشافعي', 300000, 315000, '105.0%', 260000, 250000, '96.2%', '2026-09-01'],
    ['فرع المنيا', 'مينا رفعت توفيق', 210000, 175000, '83.3%', 180000, 155000, '86.1%', '2026-09-01'],
    ['فرع ديمشلت', 'وليد سامي المغازي', 240000, 230000, '95.8%', 210000, 195000, '92.9%', '2026-09-01'],
    ['فرع منيا القمح', 'إسلام ربيع الفقي', 260000, 240000, '92.3%', 220000, 205000, '93.2%', '2026-09-01'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!views'] = [{ rightToLeft: true }];
  ws['!cols'] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
  ];

  const headerStyle = {
    font: { name: 'Cairo', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:I1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cellAddr]) ws[cellAddr].s = headerStyle;
  }

  XLSX.utils.book_append_sheet(wb, ws, 'قالب أهداف المبيعات');
  XLSX.writeFile(wb, 'قالب_شيت_تارجت_المبيعات_والتحصيل.xlsx');
}

/**
 * Fetch and parse Target records directly from a Google Sheet URL
 */
export async function fetchTargetsFromGoogleSheetUrl(urlOrId: string): Promise<TargetRecord[]> {
  const csvUrl = buildGoogleSheetsPublicCsvUrl(urlOrId);
  if (!csvUrl) {
    throw new Error('رابط Google Sheet غير صالح');
  }
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`فشل فتح رابط جوجل شيت للأهداف (${response.statusText}). تأكد من أن الرابط متاح للعامة (Anyone with the link can view).`);
  }

  const arrayBuf = await response.arrayBuffer();
  return parseTargetExcel(arrayBuf);
}
