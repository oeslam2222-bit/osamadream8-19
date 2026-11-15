/**
 * Pure code/URL helpers shared by the app shell and the Excel layer.
 *
 * They used to live in excelService, which statically imports xlsx-js-style and
 * the Arabic encoding helpers. Anything that imported a one-line string helper
 * from there pulled ~1 MB of Excel libraries into the first paint, so the
 * helpers now live here and excelService re-exports them.
 */

/**
 * Preserves the product code exactly as supplied by the sheet, including prefixes
 * such as DRM- and any meaningful separators, while strictly discarding placeholder dashes or nulls.
 */
export function cleanProductCode(code?: string | number): string {
  if (code === undefined || code === null) return '';
  const s = String(code).trim();
  if (
    !s ||
    s === '---' ||
    s === '--' ||
    s === '-' ||
    s === '#---' ||
    s === '#--' ||
    s === '#-' ||
    s === '#0' ||
    s === '0' ||
    s === 'بدون' ||
    s === 'لا يوجد' ||
    s === 'غير محدد' ||
    s === 'none' ||
    s === 'null' ||
    s === 'undefined' ||
    s === 'NaN'
  ) {
    return '';
  }
  return s;
}

/**
 * Extracts a candidate product model or numeric code from a product name
 * when the code column in the sheet is empty or placeholder (e.g. "سفرة 8009 60 ق KAZAN-YB" -> "8009")
 */
export function extractCodeFromProductName(name?: string | null): string {
  if (!name) return '';
  const s = String(name).trim();
  if (!s) return '';

  // 1. Look for explicit code/model prefixes: DRM-8009, KAZAN-8009, ART-101, etc.
  const prefixMatch = s.match(/\b([A-Za-z]{2,8}[-_][0-9]{2,6}(?:[-_][A-Za-z0-9]+)?)\b/);
  if (prefixMatch && prefixMatch[1]) {
    return prefixMatch[1].trim();
  }

  // 2. Look for product type followed by numeric code (e.g. "سفرة 8009", "طقم 6008", "كازان 8009-YB")
  const typeCodeMatch = s.match(/(?:طقم|سفرة|سفره|طاجن|صينية|صينيه|كوب|كاس|كأس|مج|حلة|حله|طبق|براد|شنطة|شنطه|دريم|كازان|سرفيس|اركوبال|بورسلين)\s*([A-Za-z0-9-_]{3,8})/i);
  if (typeCodeMatch && typeCodeMatch[1]) {
    const candidate = typeCodeMatch[1].trim();
    if (!/^(19|20)\d\d$/.test(candidate) && !/^[0-9]+ق$/.test(candidate)) {
      return candidate;
    }
  }

  // 3. Look for 3 to 6 digits sequence (excluding year numbers like 2024, 2025, 2026 and piece counts like 60ق)
  const numMatches = s.match(/\b([0-9]{3,6})\b/g);
  if (numMatches) {
    for (const m of numMatches) {
      if (!/^(19|20)\d\d$/.test(m)) {
        return m;
      }
    }
  }

  return '';
}

/**
 * Extract Google Sheet ID and GID from any Google Sheets URL
 */
export function extractGoogleSpreadsheetId(input: string): { sheetId: string; gid: string } {
  if (!input) return { sheetId: '', gid: '0' };
  const clean = input.trim();

  // If user pasted just the sheet ID directly
  if (!clean.includes('/') && clean.length > 20) {
    return { sheetId: clean, gid: '0' };
  }

  // Regex to match /d/{SPREADSHEET_ID}
  const idMatch = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = idMatch ? idMatch[1] : '';

  // Match gid parameter
  const gidMatch = clean.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return { sheetId, gid };
}

/**
 * Build direct CSV export URL for any Google Sheet link
 */
export function buildGoogleSheetsPublicCsvUrl(input: string): string {
  const { sheetId, gid } = extractGoogleSpreadsheetId(input);
  if (!sheetId) {
    if (input.startsWith('http')) return input;
    return '';
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}
