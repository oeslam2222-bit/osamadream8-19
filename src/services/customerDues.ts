import type { Customer } from '../types';

/**
 * إجمالي المستحقات / المديونية — the canonical readers for a customer's debt figures.
 *
 * This module is deliberately a leaf: it imports nothing but the Customer type, so
 * any service (including arabicMatchingService, which customerFinancialService
 * itself depends on) can read these numbers without creating an import cycle.
 */

/**
 * Strict sheet-value coercion.
 *
 * Sheets hand back numbers, numeric strings, Arabic-Indic digits and empty cells
 * interchangeably. An empty cell used to coerce to 0 through `Number('')`, so a
 * blank dues cell looked like a real "zero dues" and shadowed the column that
 * actually carried the number. Anything that is not a number is now treated as
 * "this column said nothing" and the next column in the chain is read instead.
 */
function toSheetNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || typeof value === 'boolean') return undefined;
  if (typeof value === 'number') return isFinite(value) ? value : undefined;
  const raw = String(value).trim();
  if (!raw || raw === '-' || raw === '—' || raw.toLowerCase() === 'null') return undefined;

  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let str = raw;
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicNumerals[i]).join(String(i));
  }
  const isNegative = /^\s*\(.*\)\s*$/.test(str) || /-\s*$/.test(str) || /^\s*-/.test(str);
  str = str.replace(/,/g, '').replace(/٬/g, '').replace(/\.(?=\d{3})/g, '').replace(/٫/g, '.');
  const clean = str.replace(/[^\d.]/g, '');
  if (!clean) return undefined;
  const num = parseFloat(clean);
  if (isNaN(num) || !isFinite(num)) return undefined;
  return isNegative ? -num : num;
}

function firstSheetNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    const n = toSheetNumber(v);
    if (n !== undefined) return n;
  }
  return undefined;
}

/**
 * CANONICAL إجمالي المستحقات (dues) for one customer — the single source of truth.
 *
 * Dues are a different figure from المديونية (balance): a customer can owe 50,000 in
 * total while only 20,000 of it is due yet, so the balance must never stand in for
 * dues while a dues column has something to say.
 *
 * Priority, widest meaning first:
 *   1. explicit dues columns → totalOverdueAndDue, overdueBalance, totalOverdue, dueBalance
 *   2. derived dues columns  → overdue2026, dueUntilPeriod, overdue2025
 *   3. debt balance          → currentBalance, balance  (last resort only)
 *
 * Every screen, export and database write must read dues through this function. When
 * screens carried their own shorter chains, the same customer showed a non-zero
 * المستحقات in the main table and zero in the portfolio, dealing and Excel tabs.
 */
export function resolveCustomerDuesValue(c: Partial<Customer> | null | undefined): number {
  if (!c) return 0;
  const explicit = firstSheetNumber(c.totalOverdueAndDue, c.overdueBalance, c.totalOverdue, c.dueBalance);
  if (explicit !== undefined) return explicit;
  const derived = firstSheetNumber(c.overdue2026, c.dueUntilPeriod, c.overdue2025);
  if (derived !== undefined) return derived;
  return toSheetNumber(c.currentBalance ?? c.balance) ?? 0;
}

/**
 * CANONICAL المديونية (debt balance) — kept separate from dues on purpose.
 */
export function resolveCustomerBalanceValue(c: Partial<Customer> | null | undefined): number {
  if (!c) return 0;
  return toSheetNumber(c.currentBalance ?? c.balance) ?? 0;
}