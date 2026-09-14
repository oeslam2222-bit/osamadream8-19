import { Customer } from '../types';
import { normalizeArabicText } from './arabicMatchingService';

/**
 * Clean and validate a customer code.
 * Discards temporary, generated, or dummy placeholder codes.
 */
export function cleanCustomerCode(code?: string): string {
  if (!code) return '';
  const c = String(code).trim().toLowerCase();
  if (
    !c ||
    c === '---' ||
    c === '-' ||
    c === '0' ||
    c === 'none' ||
    c === 'null' ||
    c.startsWith('cust-row') ||
    c.startsWith('cust-temp') ||
    /^cust-\d+$/i.test(c)
  ) {
    return '';
  }
  return c;
}

/**
 * Clean and extract digits from a phone string.
 * Must be at least 7 digits to qualify as a valid dedup key.
 */
export function cleanCustomerPhone(phone?: string): string {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  // Discard placeholder numbers like 0000000 or 123456
  if (digits.length < 7 || /^0+$/.test(digits) || digits === '12345678') {
    return '';
  }
  return digits;
}

/**
 * Strip common Arabic commercial prefixes to extract the core brand/entity name.
 * e.g. "شركة الفيروز للتجارة" -> "الفيروز للتجاره"
 */
export function extractCoreBusinessName(normalizedName: string): string {
  if (!normalizedName) return '';
  const prefixRegex =
    /^(شركه|شركة|مؤسسه|مؤسسة|محلات|محل|معرض|مكتب|ماركت|سوبرماركت|سوبر ماركت|هايبر|صيدلية|صيدليه|مستودع|مطعم|كافيه|دكان|موزع|الشركة|المؤسسة)\s+/i;
  let core = normalizedName.replace(prefixRegex, '').trim();
  // Strip trailing noise like للتجارة / للتوزيع / والتوريدات if longer than 3 words
  core = core
    .replace(/\s+(للتجارة|للتجاره|للتوزيع|والتوريدات|للمقاولات|العامة|العامه|وشركاه)$/i, '')
    .trim();
  return core;
}

/**
 * Merge two customer records (source into target), picking the best available information
 * so no data is lost and duplicates are cleanly consolidated.
 */
export function mergeTwoCustomers(target: Customer, source: Customer): Customer {
  // Pick real code over generated code
  const targetCodeClean = cleanCustomerCode(target.code);
  const sourceCodeClean = cleanCustomerCode(source.code);
  let finalCode = target.code;
  if (!targetCodeClean && sourceCodeClean) {
    finalCode = source.code;
  } else if (!finalCode && source.code) {
    finalCode = source.code;
  }

  // Pick longer / more descriptive name
  let finalName = target.name || '';
  if ((!finalName || (source.name && source.name.length > finalName.length)) && !target.name?.includes('(رسمي)')) {
    finalName = source.name || finalName;
  }

  // Phone
  const targetPhoneClean = cleanCustomerPhone(target.phone);
  const sourcePhoneClean = cleanCustomerPhone(source.phone);
  let finalPhone = target.phone || '';
  if (!targetPhoneClean && sourcePhoneClean) {
    finalPhone = source.phone || '';
  }

  // Address
  let finalAddress = target.address || '';
  if ((!finalAddress || (source.address && source.address.length > finalAddress.length)) && source.address) {
    finalAddress = source.address;
  }

  // Branch
  let finalBranch = target.branchName || source.branchName || '';
  if ((!finalBranch || finalBranch === 'الفرع الرئيسي') && source.branchName && source.branchName !== 'الفرع الرئيسي') {
    finalBranch = source.branchName;
  }

  // Rep assignment
  const finalRepId = target.repId || source.repId;
  const finalRepName = target.salesRepName || target.repName || source.salesRepName || source.repName || '';

  // Balances: pick the latest non-zero value or higher specificity
  const targetBal = Number(target.currentBalance ?? target.balance ?? 0);
  const sourceBal = Number(source.currentBalance ?? source.balance ?? 0);
  const finalBal = sourceBal !== 0 ? sourceBal : targetBal;

  const targetLimit = Number(target.creditLimit ?? 0);
  const sourceLimit = Number(source.creditLimit ?? 0);
  const finalLimit = sourceLimit !== 0 ? sourceLimit : targetLimit;

  // Overdue
  const targetOverdue = target.totalOverdueAndDue !== undefined ? Number(target.totalOverdueAndDue) : undefined;
  const sourceOverdue = source.totalOverdueAndDue !== undefined ? Number(source.totalOverdueAndDue) : undefined;
  const finalOverdue = sourceOverdue !== undefined ? sourceOverdue : targetOverdue;

  // Monthly breakdown dictionaries
  const mergedMonthlySales = {
    ...(target.monthlySales2026 || {}),
    ...(source.monthlySales2026 || {}),
  };
  const mergedMonthlyCollections = {
    ...(target.monthlyCollections2026 || {}),
    ...(source.monthlyCollections2026 || {}),
  };

  // Visit history
  const mergedVisits = [
    ...(source.visitHistory || []),
    ...(target.visitHistory || []),
  ].filter((v, idx, arr) => arr.findIndex((x) => x.id === v.id || x.date === v.date) === idx);

  // Combine notes if different
  let finalNotes = target.notes || '';
  if (source.notes && source.notes !== target.notes) {
    if (!finalNotes) finalNotes = source.notes;
    else if (!finalNotes.includes(source.notes)) finalNotes = `${finalNotes} | ${source.notes}`;
  }

  // Tier
  let finalTier = target.tier || 'متوسط';
  if (source.tier === 'مميز' || (source.tier === 'راقي' && finalTier === 'متوسط')) {
    finalTier = source.tier;
  }

  return {
    ...target,
    ...source,
    id: target.id || source.id,
    code: finalCode,
    name: finalName,
    phone: finalPhone,
    address: finalAddress,
    branchName: finalBranch,
    repId: finalRepId,
    repName: finalRepName,
    salesRepName: finalRepName,
    creditLimit: finalLimit,
    balance: finalBal,
    currentBalance: finalBal,
    totalOverdueAndDue: finalOverdue,
    overdueBalance: source.overdueBalance !== undefined ? Number(source.overdueBalance) : target.overdueBalance,
    dueBalance: source.dueBalance !== undefined ? Number(source.dueBalance) : target.dueBalance,
    notes: finalNotes,
    tier: finalTier,
    monthlySales2026: mergedMonthlySales,
    monthlyCollections2026: mergedMonthlyCollections,
    visitHistory: mergedVisits,
    annualTarget: source.annualTarget !== undefined ? Number(source.annualTarget) : target.annualTarget,
    sales2026: source.sales2026 !== undefined ? Number(source.sales2026) : target.sales2026,
    collections2026: source.collections2026 !== undefined ? Number(source.collections2026) : target.collections2026,
    sales2025: source.sales2025 !== undefined ? Number(source.sales2025) : target.sales2025,
    collections2025: source.collections2025 !== undefined ? Number(source.collections2025) : target.collections2025,
    totalMonthlySales: source.totalMonthlySales !== undefined ? Number(source.totalMonthlySales) : target.totalMonthlySales,
    totalMonthlyCollections: source.totalMonthlyCollections !== undefined ? Number(source.totalMonthlyCollections) : target.totalMonthlyCollections,
    guaranteeDocs: source.guaranteeDocs || target.guaranteeDocs,
    paymentTerms: source.paymentTerms || target.paymentTerms,
    activityType: source.activityType || target.activityType,
    clientType: source.clientType || target.clientType,
    taxNumber: source.taxNumber || target.taxNumber,
  };
}

/**
 * Universal Customer Deduplication & Merge Engine.
 * Ensures strict, zero-duplicate storage across ID, Code, Phone, Normalized Name, and Core Entity Name.
 */
export function deduplicateAndMergeCustomers(list: Customer[]): {
  customers: Customer[];
  duplicatesCount: number;
} {
  if (!Array.isArray(list) || list.length === 0) {
    return { customers: [], duplicatesCount: 0 };
  }

  const resultList: Customer[] = [];
  let duplicatesCount = 0;

  // Index maps pointing to the index of the Customer in resultList
  const idIndex = new Map<string, number>();
  const codeIndex = new Map<string, number>();
  const phoneIndex = new Map<string, number>();
  const nameIndex = new Map<string, number>();
  const coreNameIndex = new Map<string, number>();

  const registerCustomer = (idx: number, c: Customer) => {
    if (c.id) idIndex.set(String(c.id).toLowerCase(), idx);

    const code = cleanCustomerCode(c.code);
    if (code) codeIndex.set(code, idx);

    const phone = cleanCustomerPhone(c.phone);
    if (phone) phoneIndex.set(phone, idx);

    const normName = normalizeArabicText(c.name);
    if (normName && normName.length >= 2) {
      nameIndex.set(normName, idx);
      const core = extractCoreBusinessName(normName);
      if (core && core.length >= 4) {
        // Tag with branch if known to avoid false positives across distant branches
        const branchKey = c.branchName ? `${c.branchName.trim().toLowerCase()}:::${core}` : core;
        coreNameIndex.set(branchKey, idx);
        coreNameIndex.set(core, idx);
      }
    }
  };

  for (const rawC of list) {
    if (!rawC) continue;

    const code = cleanCustomerCode(rawC.code);
    const phone = cleanCustomerPhone(rawC.phone);
    const rawId = rawC.id ? String(rawC.id).toLowerCase() : '';
    const normName = normalizeArabicText(rawC.name);
    const coreName = normName ? extractCoreBusinessName(normName) : '';

    // Search for existing match in order of confidence
    let matchedIdx = -1;

    // 1. High confidence: Match by Code
    if (code && codeIndex.has(code)) {
      matchedIdx = codeIndex.get(code)!;
    }
    // 2. High confidence: Match by Phone (>= 7 digits)
    else if (phone && phoneIndex.has(phone)) {
      matchedIdx = phoneIndex.get(phone)!;
    }
    // 3. High confidence: Match by explicit ID (non-random)
    else if (rawId && idIndex.has(rawId) && !rawId.startsWith('cust-row-') && !rawId.startsWith('cust-temp-')) {
      matchedIdx = idIndex.get(rawId)!;
    }
    // 4. Exact Normalized Arabic Name match
    else if (normName && normName.length >= 3 && nameIndex.has(normName)) {
      matchedIdx = nameIndex.get(normName)!;
    }
    // 5. Core Business Name match (when branch matches or phone matches partially)
    else if (coreName && coreName.length >= 4) {
      const branchKey = rawC.branchName ? `${rawC.branchName.trim().toLowerCase()}:::${coreName}` : '';
      if (branchKey && coreNameIndex.has(branchKey)) {
        matchedIdx = coreNameIndex.get(branchKey)!;
      } else if (coreNameIndex.has(coreName)) {
        const potential = resultList[coreNameIndex.get(coreName)!];
        // Only merge by core name if branch matches, or if either branch is missing
        if (
          !potential.branchName ||
          !rawC.branchName ||
          potential.branchName === rawC.branchName ||
          potential.branchName === 'الفرع الرئيسي'
        ) {
          matchedIdx = coreNameIndex.get(coreName)!;
        }
      }
    }

    if (matchedIdx >= 0) {
      // DUPLICATE FOUND: Merge and update existing customer
      duplicatesCount++;
      const merged = mergeTwoCustomers(resultList[matchedIdx], rawC);
      resultList[matchedIdx] = merged;
      // Re-register to ensure new code/phone/name aliases also point here
      registerCustomer(matchedIdx, merged);
    } else {
      // NEW UNIQUE CUSTOMER
      const newIdx = resultList.length;
      resultList.push({
        ...rawC,
        id: rawC.id || `cust-${Date.now()}-${newIdx}`,
      });
      registerCustomer(newIdx, resultList[newIdx]);
    }
  }

  return { customers: resultList, duplicatesCount };
}
