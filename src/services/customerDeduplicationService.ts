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
    c.startsWith('cust-placeholder') ||
    c.startsWith('temp-')
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

  // Monthly breakdown dictionaries - merge per month safely taking non-zero / max values
  const mergedMonthlySales: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    const tVal = Number(target.monthlySales2026?.[m] || 0);
    const sVal = Number(source.monthlySales2026?.[m] || 0);
    const mVal = Math.max(tVal, sVal);
    if (mVal > 0) mergedMonthlySales[m] = mVal;
  }

  const mergedMonthlyCollections: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    const tVal = Number(target.monthlyCollections2026?.[m] || 0);
    const sVal = Number(source.monthlyCollections2026?.[m] || 0);
    const mVal = Math.max(tVal, sVal);
    if (mVal > 0) mergedMonthlyCollections[m] = mVal;
  }

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

  // Financial calculations: safely compute maximum effective values
  const monthlySalesSum = Object.values(mergedMonthlySales).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const targetSales = Number(target.sales2026 || target.totalMonthlySales || target.totalOverallSales || 0);
  const sourceSales = Number(source.sales2026 || source.totalMonthlySales || source.totalOverallSales || 0);
  const finalSales2026 = Math.max(targetSales, sourceSales, monthlySalesSum);

  const monthlyColsSum = Object.values(mergedMonthlyCollections).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const targetCols = Number(target.collections2026 || target.totalMonthlyCollections || target.totalOverallCollections || 0);
  const sourceCols = Number(source.collections2026 || source.totalMonthlyCollections || source.totalOverallCollections || 0);
  const finalCollections2026 = Math.max(targetCols, sourceCols, monthlyColsSum);

  const finalSales2025 = Math.max(Number(target.sales2025 || 0), Number(source.sales2025 || 0));
  const finalCollections2025 = Math.max(Number(target.collections2025 || 0), Number(source.collections2025 || 0));
  const finalSales2024 = Math.max(Number(target.sales2024 || 0), Number(source.sales2024 || 0));
  const finalCollections2024 = Math.max(Number(target.collections2024 || 0), Number(source.collections2024 || 0));
  const finalAnnualTarget = Math.max(Number(target.annualTarget || 0), Number(source.annualTarget || 0));

  const finalHasDealtIn2026 = Boolean(
    target.hasDealtIn2026 ||
    source.hasDealtIn2026 ||
    finalSales2026 > 0 ||
    finalCollections2026 > 0 ||
    target.dealt2026 === 'متعامل' ||
    source.dealt2026 === 'متعامل'
  );

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
    overdueBalance: source.overdueBalance !== undefined && Number(source.overdueBalance) !== 0 ? Number(source.overdueBalance) : target.overdueBalance,
    dueBalance: source.dueBalance !== undefined && Number(source.dueBalance) !== 0 ? Number(source.dueBalance) : target.dueBalance,
    notes: finalNotes,
    tier: finalTier,
    monthlySales2026: Object.keys(mergedMonthlySales).length > 0 ? mergedMonthlySales : (target.monthlySales2026 || source.monthlySales2026),
    monthlyCollections2026: Object.keys(mergedMonthlyCollections).length > 0 ? mergedMonthlyCollections : (target.monthlyCollections2026 || source.monthlyCollections2026),
    visitHistory: mergedVisits,
    annualTarget: finalAnnualTarget > 0 ? finalAnnualTarget : undefined,
    sales2026: finalSales2026,
    totalMonthlySales: finalSales2026,
    totalOverallSales: finalSales2026 > 0 ? finalSales2026 : (source.totalOverallSales || target.totalOverallSales),
    collections2026: finalCollections2026,
    totalMonthlyCollections: finalCollections2026,
    totalOverallCollections: finalCollections2026 > 0 ? finalCollections2026 : (source.totalOverallCollections || target.totalOverallCollections),
    sales2025: finalSales2025 > 0 ? finalSales2025 : undefined,
    collections2025: finalCollections2025 > 0 ? finalCollections2025 : undefined,
    sales2024: finalSales2024 > 0 ? finalSales2024 : undefined,
    collections2024: finalCollections2024 > 0 ? finalCollections2024 : undefined,
    hasDealtIn2026: finalHasDealtIn2026,
    dealt2026: finalHasDealtIn2026 ? 'متعامل' : (source.dealt2026 || target.dealt2026 || 'غير متعامل'),
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
      const candidateIdx = phoneIndex.get(phone)!;
      const candidate = resultList[candidateIdx];
      const candidateCode = cleanCustomerCode(candidate?.code);
      // NEVER merge if both have different explicit codes!
      if (!code || !candidateCode || code === candidateCode) {
        matchedIdx = candidateIdx;
      }
    }
    // 3. High confidence: Match by explicit ID (non-random)
    else if (rawId && idIndex.has(rawId) && !rawId.startsWith('cust-row-') && !rawId.startsWith('cust-temp-')) {
      const candidateIdx = idIndex.get(rawId)!;
      const candidate = resultList[candidateIdx];
      const candidateCode = cleanCustomerCode(candidate?.code);
      if (!code || !candidateCode || code === candidateCode) {
        matchedIdx = candidateIdx;
      }
    }
    // 4. Exact Normalized Arabic Name match (only if neither has conflicting codes and branch matches or is generic)
    else if (normName && normName.length >= 3 && nameIndex.has(normName)) {
      const candidateIdx = nameIndex.get(normName)!;
      const candidate = resultList[candidateIdx];
      const candidateCode = cleanCustomerCode(candidate?.code);
      // If both have different explicit codes, they are distinct customer accounts!
      if (!code || !candidateCode || code === candidateCode) {
        const candidateBranch = candidate?.branchName;
        const rawBranch = rawC.branchName;
        if (
          !candidateBranch ||
          !rawBranch ||
          candidateBranch === rawBranch ||
          candidateBranch === 'الفرع الرئيسي' ||
          rawBranch === 'الفرع الرئيسي'
        ) {
          matchedIdx = candidateIdx;
        }
      }
    }
    // 5. Core Business Name match (STRICT: only if branch matches AND no conflicting codes)
    else if (coreName && coreName.length >= 4) {
      const branchKey = rawC.branchName ? `${rawC.branchName.trim().toLowerCase()}:::${coreName}` : '';
      if (branchKey && coreNameIndex.has(branchKey)) {
        const candidateIdx = coreNameIndex.get(branchKey)!;
        const candidate = resultList[candidateIdx];
        const candidateCode = cleanCustomerCode(candidate?.code);
        if (!code || !candidateCode || code === candidateCode) {
          matchedIdx = candidateIdx;
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
