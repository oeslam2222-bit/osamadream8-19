/**
 * Utilities for normalizing product codes, extracting codes from titles,
 * and converting Google Sheets URLs into public CSV export URLs.
 */

const PLACEHOLDER_CODES = new Set([
  '',
  '-',
  '--',
  '---',
  '—',
  '#',
  '#-',
  '#--',
  '#---',
  '#0',
  '0',
  'null',
  'undefined',
  'nan',
  'n/a',
  'na',
  'none',
  'غير محدد',
  'بدون',
  'بدون كود',
  'لا يوجد',
]);

/** Normalize Arabic-Indic & Extended Arabic-Indic numerals to ASCII 0-9 */
function toAsciiDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Cleans and normalizes raw product codes imported from Excel/CSV or typed manually.
 */
export function cleanProductCode(raw?: string | number | null): string {
  if (raw === null || raw === undefined) return '';
  let s = toAsciiDigits(String(raw))
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!s) return '';

  // Strip Excel numeric `.0` / `.00` artifact on purely numeric codes
  if (/^\d+\.0+$/.test(s)) {
    s = s.replace(/\.0+$/, '');
  }

  const lower = s.toLowerCase();
  if (PLACEHOLDER_CODES.has(lower)) return '';

  return s;
}

/**
 * Extracts a likely product/model code from a product name when the code column is empty.
 * Examples:
 * - "طقم سفرة 8009 60 ق KAZAN" -> "8009"
 * - "غلاية DRM-101 ستانلس" -> "DRM-101"
 * - "كود 1005741 طقم حلة" -> "1005741"
 */
export function extractCodeFromProductName(name?: string | null): string {
  if (!name) return '';
  const text = toAsciiDigits(String(name))
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    .trim();
  if (!text) return '';

  // 1. Explicit alphanumeric/hyphenated model code like DRM-101, KT_204, A-1204
  const alphaNumMatch = text.match(/\b([A-Za-z]{1,6}[-_/]?\d{2,8}(?:[-_/][A-Za-z0-9]{1,4})?)\b/);
  if (alphaNumMatch?.[1]) {
    return cleanProductCode(alphaNumMatch[1]);
  }

  // 2. Explicit #code marker
  const hashMatch = text.match(/#\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,20})/);
  if (hashMatch?.[1]) {
    return cleanProductCode(hashMatch[1]);
  }

  // 3. Standalone numeric model code (3 to 10 digits) not immediately followed by unit words (ق / قطعة / سم / لتر / مل / وات)
  const numericMatches = [...text.matchAll(/(?:^|[\s(\-[])(\d{3,10})(?=$|[\s)\]-]|[^\dA-Za-z])/g)];
  for (const m of numericMatches) {
    const candidate = m[1];
    const endIdx = (m.index ?? 0) + m[0].length;
    const after = text.slice(endIdx).trim();
    if (/^(ق|قطعة|قطعه|قطع|سم|مم|ملم|مل|لتر|وات|فولت|جم|كجم|ك|كيلو|pcs|pc|cm|ml|l|w)\b/i.test(after)) {
      continue;
    }
    const cleaned = cleanProductCode(candidate);
    if (cleaned) return cleaned;
  }

  return '';
}

/**
 * Extracts Google Spreadsheet ID and optional gid from any Google Sheets URL or bare ID.
 */
export function extractGoogleSpreadsheetId(urlOrId?: string | null): {
  sheetId: string;
  gid?: string;
  isPublishedUrl?: boolean;
} {
  if (!urlOrId) return { sheetId: '' };
  const raw = String(urlOrId).trim();
  if (!raw) return { sheetId: '' };

  const gidMatch = raw.match(/(?:[#&?])gid=(\d+)/i);
  const gid = gidMatch?.[1];

  // Published web URL (/spreadsheets/d/e/2PACX-.../pubhtml)
  const pubMatch = raw.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/i);
  if (pubMatch?.[1]) {
    return { sheetId: pubMatch[1], gid, isPublishedUrl: true };
  }

  // Standard Google Sheets URL (/spreadsheets/d/<ID>/...)
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (idMatch?.[1]) {
    return { sheetId: idMatch[1], gid };
  }

  // Raw spreadsheet ID pasted directly
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw) && !raw.includes('http')) {
    return { sheetId: raw, gid };
  }

  return { sheetId: '', gid };
}

/**
 * Converts a Google Sheets URL or Spreadsheet ID into a public CSV download URL.
 */
export function buildGoogleSheetsPublicCsvUrl(urlOrId?: string | null): string {
  if (!urlOrId) return '';
  const raw = String(urlOrId).trim();
  if (!raw) return '';

  // Already a direct CSV export / output=csv URL
  if (
    /\/export\?.*format=csv/i.test(raw) ||
    /\/pub\?.*output=csv/i.test(raw)
  ) {
    return raw;
  }

  const { sheetId, gid, isPublishedUrl } = extractGoogleSpreadsheetId(raw);
  if (!sheetId) return '';

  if (isPublishedUrl) {
    return `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?output=csv${gid ? `&gid=${gid}&single=true` : ''}`;
  }

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}
