/**
 * Parser for visit records pasted in from WhatsApp groups and Excel exports.
 *
 * Two very different shapes reach this file, both in daily field use:
 *
 *   WhatsApp:  "CUST016826\tعمرو عبدالله Breed"      (code + name, no date)
 *              "محمد سيد Cust 016615"                 (name + code, no date)
 *              "ربيع امين فؤاد"                        (name only)
 *
 *   Excel:     "محمود فتحي قرشي\t\t٧:٠٧ م\t\t١‏/٧‏/٢٠٢٦"
 *              (name + time + date, Arabic-Indic digits, no code)
 *
 * Both are full of things a plain regex will not survive:
 *   • every Excel date carries U+200F RIGHT-TO-LEFT MARK between its digits
 *     ("١‏/٧‏/٢٠٢٦"), so it must be stripped before anything can read it;
 *   • digits are Arabic-Indic ٠-٩ or Persian ۰-۹, not ASCII;
 *   • times are "٧:٠٧ م" / "١١:١٦ ص";
 *   • the customer code appears as CUST016826 / Cust 016615 / cust017213;
 *   • "التحرك للسوق" is a rep movement marker, not a customer;
 *   • "عميل جديد" is a lead that does not exist in the database yet.
 *
 * Nothing here writes anything. It only turns lines into a reviewable list, so a
 * wrong guess is visible before it becomes data.
 */

export type ParsedLineStatus =
  | 'ok'
  | 'travel_marker'
  | 'new_customer'
  | 'no_date'
  | 'unreadable'
  | 'ambiguous_date'
  | 'duplicate_in_paste';

export interface ParsedVisitLine {
  /** 1-based position in the pasted text, for pointing the user at a row. */
  lineNumber: number;
  raw: string;
  /** YYYY-MM-DD, when a date could be read. */
  date?: string;
  /** HH:MM, 24-hour, when a time could be read. */
  time?: string;
  /** Normalised to CUST######, when a code could be read. */
  customerCode?: string;
  customerName?: string;
  status: ParsedLineStatus;
  /** Short Arabic explanation shown in the preview. */
  note?: string;
}

/** Lines that mark the rep moving between areas rather than calling on a customer. */
const TRAVEL_MARKERS = [
  'التحرك للسوق',
  'التحركMarket',
  'تحرك للسوق',
  'انتقال',
  'مشوار',
];

/** Phrases that mark a prospect the database has not got yet. */
const NEW_CUSTOMER_MARKERS = ['عميل جديد', 'عميل جديد '];

// Bidi and zero-width marks: U+200E LRM, U+200F RLM, U+061C ALM, U+202A..U+202E,
// U+2066..U+2069, U+200B..U+200D, U+FEFF, plus U+0640 TATWEEL.
//
// These are removed, not replaced with a space. Excel writes "١\u200f/٧\u200f/٢٠٢٦",
// so turning the mark into a space would push the digits away from their slashes and
// the date would stop being readable at all.
const ZERO_WIDTH = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF\u0640]/g;
// Spaces that are real but look invisible.
const WEIRD_SPACES = /[\u00A0\u2007\u202F\u2009]/g;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic and Persian digits to ASCII. */
export function toAsciiDigits(value: string): string {
  let out = '';
  for (const ch of value) {
    const arabicIndex = ARABIC_INDIC.indexOf(ch);
    if (arabicIndex >= 0) {
      out += String(arabicIndex);
      continue;
    }
    const persianIndex = PERSIAN_INDIC.indexOf(ch);
    if (persianIndex >= 0) {
      out += String(persianIndex);
      continue;
    }
    out += ch;
  }
  return out;
}

/** Strips bidi marks and normalises digits and whitespace. */
export function normalizePastedLine(line: string): string {
  return toAsciiDigits(line.replace(ZERO_WIDTH, '').replace(WEIRD_SPACES, ' '))
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Strips the WhatsApp envelope: "[1:38 م، 2026/10/3] حسن محمد مندوب مكالمات: CUST1 ..."
 *
 * The bracket is the moment the message was sent and the text before the last colon
 * is the sender. Both must go before anything else is read, because the envelope
 * carries its own clock time and its own date - left in place, every field row would
 * be filed under the day the admin pasted it instead of the day the visit happened.
 */
export function stripWhatsAppEnvelope(line: string): string {
  const bracketed = line.match(/^\s*\[[^\]]*\]\s*([^:]*):\s*([\s\S]*)$/);
  if (bracketed) return bracketed[2].trim();
  return line;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const isRealDate = (y: number, m: number, d: number): boolean =>
  y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/**
 * Reads one date off a line.
 *
 * "1/7/2026" is genuinely ambiguous, so each reading is scored instead of guessed:
 * a value above 12 can only be a day, a value above 12 in the second slot can only be
 * a month, and anything else is day-first - which is what the field sheets actually
 * use (1/7 followed by 2/7 on the next day). Only a line that stays ambiguous after
 * that is reported back to the user instead of being silently filed.
 */
function readDate(text: string): { date?: string; ambiguous?: boolean } {
  const iso = text.match(/\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso.map(Number) as unknown as [string, number, number, number];
    if (isRealDate(y, m, d)) return { date: `${y}-${pad2(m)}-${pad2(d)}` };
  }

  const dmy = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (!dmy) return {};

  const first = Number(dmy[1]);
  const second = Number(dmy[2]);
  let year = Number(dmy[3]);
  if (year < 100) year += 2000;

  // Unambiguous: the first slot cannot be a month.
  if (first > 12 && second <= 12) {
    if (isRealDate(year, second, first)) return { date: `${year}-${pad2(second)}-${pad2(first)}` };
    return {};
  }
  // Unambiguous: the second slot cannot be a day.
  if (second > 12 && first <= 12) {
    if (isRealDate(year, first, second)) return { date: `${year}-${pad2(first)}-${pad2(second)}` };
    return {};
  }
  // Both readings are legal: the sheets are day-first, so take that and flag it.
  if (isRealDate(year, second, first)) {
    return { date: `${year}-${pad2(second)}-${pad2(first)}`, ambiguous: true };
  }
  if (isRealDate(year, first, second)) return { date: `${year}-${pad2(first)}-${pad2(second)}`, ambiguous: true };
  return {};
}

/** Reads "٧:٠٧ م" / "11:16 ص" / "13:45" into 24-hour HH:MM. */
function readTime(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2}):(\d{2})\s*(ص|م|AM|PM|am|pm)?/);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return undefined;
  const marker = match[3];
  if (marker === 'م' || marker === 'PM' || marker === 'pm') {
    if (hour < 12) hour += 12;
  } else if (marker === 'ص' || marker === 'AM' || marker === 'am') {
    if (hour === 12) hour = 0;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Reads CUST016826 / Cust 016615 / cust017213 and returns CUST + zero-padded digits. */
function readCustomerCode(text: string): string | undefined {
  const match = text.match(/cust[\s_-]*(\d{4,10})/i);
  if (!match) return undefined;
  return `CUST${match[1].padStart(6, '0')}`;
}

const looksLikeName = (value: string): boolean =>
  value.length > 2 && /[\u0600-\u06FF]/.test(value) && !/^\d+$/.test(value);

/**
 * Parses a pasted block into one reviewable row per line.
 *
 * Blank lines and lines that carry no date and no customer reference are reported as
 * unreadable rather than dropped, so the preview can account for every single line the
 * user pasted.
 */
export function parseVisitsFromText(text: string, opts?: { defaultYear?: number }): ParsedVisitLine[] {
  const defaultYear = opts?.defaultYear ?? new Date().getFullYear();
  const rawLines = text.split(/\r?\n/);
  const out: ParsedVisitLine[] = [];
  const seen = new Set<string>();

  rawLines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmedRaw = raw.trim();
    if (!trimmedRaw) return;

    const normalized = normalizePastedLine(stripWhatsAppEnvelope(raw));

    const base: ParsedVisitLine = { lineNumber, raw: trimmedRaw, status: 'ok' };

    // A line that was only a sender label ("[2:20 م] اسم المندوب:") carries no visit.
    if (!normalized) {
      out.push({ ...base, status: 'unreadable', note: 'سطر رسالة بدون بيانات زيارة' });
      return;
    }

    // Rep movement marker - real data, but not a customer call.
    if (TRAVEL_MARKERS.some((marker) => normalized.includes(marker))) {
      out.push({ ...base, status: 'travel_marker', note: 'سطر تنقل للسوق — مش زيارة عميل' });
      return;
    }

    const { date, ambiguous } = readDate(normalized);
    const time = readTime(normalized);
    const customerCode = readCustomerCode(normalized);

    let customerName = normalized
      .replace(/cust[\s_-]*\d{4,10}/gi, ' ')
      .replace(/\b\d{1,2}\s*:\s*\d{2}\s*(ص|م|AM|PM|am|pm)?/g, ' ')
      .replace(/\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b/g, ' ')
      .replace(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, ' ')
      .replace(/[|\t]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!looksLikeName(customerName)) customerName = undefined;

    const isNewCustomer = NEW_CUSTOMER_MARKERS.some((marker) => normalized.includes(marker.trim()));

    const row: ParsedVisitLine = { ...base, date, time, customerCode, customerName };

    if (!date && !customerCode && !customerName) {
      row.status = 'unreadable';
      row.note = 'السطر مفيهوش تاريخ ولا كود ولا اسم';
      out.push(row);
      return;
    }
    if (isNewCustomer) {
      row.status = 'new_customer';
      row.note = 'عميل جديد - مش موجود في القاعدة, محتاج انشاء';
      out.push(row);
      return;
    }
    if (!date) {
      row.status = 'no_date';
      row.note = 'مالوش تاريخ - حدده يدوي قبل الحفظ';
      out.push(row);
      return;
    }
    if (ambiguous) {
      row.status = 'ambiguous_date';
      row.note = 'التاريخ ممكن يوم/شهر او شهر/يوم - راجعه';
    }

    // Same customer on the same day twice in one paste: keep the first, flag the rest.
    const key = `${customerCode || customerName || '?'}|${date}`;
    if (row.status === 'ok' && seen.has(key)) {
      row.status = 'duplicate_in_paste';
      row.note = 'مكرر في نفس اللصق - اتسجل قبله';
    } else if (row.status === 'ok') {
      seen.add(key);
    }

    out.push(row);
  });

  return out;
}

/** Year to assume for rows whose date is missing, so the user only picks the odd ones. */
export function suggestedYearFor(text: string): number {
  const years = (text.match(/\b(20\d{2})\b/g) || []).map((y) => Number(y));
  if (years.length === 0) return new Date().getFullYear();
  return Math.max(...years);
}
