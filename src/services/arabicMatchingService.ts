import { Customer, Product, User } from '../types';

/**
 * Universal Arabic Text Normalizer
 * Cleans diacritics (tashkeel), tatweel/kashida, non-breaking spaces,
 * Unicode replacement characters (\uFFFD /  / ?),
 * normalizes alif variants, taa marbuta, alef maqsura, compound names (عبد الفتاح / عبدالفتاح),
 * honorific prefixes (أ/ , ك/ , م/ , د/ ), and punctuation.
 */
export function normalizeArabicText(str?: string): string {
  if (!str) return '';
  let text = str
    .toString()
    // 0. Remove Unicode Replacement Character \uFFFD, replacement mark , control chars, and weird artifacts
    .replace(/[\uFFFD\uFEFF\u0000-\u001F\u007F-\u009F]/g, ' ')
    // 1. Remove non-breaking spaces, zero-width chars, tabs
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    // 2. Remove Arabic Tashkeel / Harakat (Fatha, Damma, Kasra, Shadda, Sukun, Tanween...)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // 3. Remove Arabic Tatweel / Kashida (ـ)
    .replace(/\u0640/g, '')
    // 4. Normalize all forms of Alif (أ, إ, آ, ٱ, ٵ, ٲ) -> ا
    .replace(/[أإآٱٵٲ]/g, 'ا')
    // 5. Normalize Taa Marbuta (ة) -> ه
    .replace(/ة/g, 'ه')
    // 6. Normalize Alef Maqsura (ى) -> ي, and common duplicated ya spelling (يحيى / يحيي)
    .replace(/ى/g, 'ي')
    .replace(/يي+/g, 'ي')
    // 7. Normalize Hamzas (ؤ, ئ, ء)
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    // 8. Replace punctuation, question marks, brackets, dashes, and separators with spaces
    .replace(/[\-_/\\()\[\]+.,:;*&^%$#@!~"'{}`|?؟]/g, ' ')
    // 9. Collapse spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // 10. Normalize compound Arabic names (e.g. "عبد الفتاح" -> "عبدالفتاح", "ابو بكر" -> "ابوبكر")
  text = normalizeCompoundNames(text);

  return text;
}

/**
 * Normalizes compound Arabic names so that variants like "عبد الفتاح" and "عبدالفتاح"
 * or "ابو بكر" and "ابوبكر" match identically.
 */
export function normalizeCompoundNames(text: string): string {
  if (!text) return '';
  return text
    // Normalize "عبد ال..." -> "عبدال..."
    .replace(/\bعبد\s+ال/g, 'عبدال')
    .replace(/\bعبد\s+/g, 'عبد')
    // Normalize "ابو ال..." -> "ابوال..."
    .replace(/\bابو\s+ال/g, 'ابوال')
    .replace(/\bابو\s+/g, 'ابو')
    .replace(/\bابي\s+/g, 'ابو')
    .replace(/\bابا\s+/g, 'ابو')
    // Normalize "ال " prefix when detached
    .replace(/\bال\s+/g, 'ال')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract meaningful Arabic name tokens, filtering out common noise titles
 */
export function getArabicTokens(str?: string): string[] {
  const norm = normalizeArabicText(str);
  if (!norm) return [];

  const ignoreWords = new Set([
    'المندوب',
    'مندوب',
    'استاذ',
    'استاذه',
    'كابتن',
    'فرع',
    'فروع',
    'المبيعات',
    'مبيعات',
    'مسؤول',
    'مسئول',
    'مسوول',
    'بائع',
    'بايع',
    'موزع',
    'الموزع',
    'السيد',
    'السيده',
    'محل',
    'شركة',
    'شركه',
    'مؤسسة',
    'مؤسسه',
    'م',
    'أ',
    'ا',
    'د',
    'ك',
    'دكتور',
    'مهندس',
    'باشمهندس',
    'حساب',
    'توزيع',
    'خط',
    'منطقة',
    'محافظة',
    // Common branch tokens when embedded in rep column
    'المنيا',
    'منيا',
    'الفيوم',
    'فيوم',
    'القاهرة',
    'قاهرة',
    'ديمشلت',
    'دكرنس',
    'البحيرة',
    'بحيرة',
    'دمنهور',
    'منوف',
    'المنوفية',
    'منوفية',
    'اكتوبر',
    'أكتوبر',
    'المركزي',
    'مركزي',
    'رئيسي',
    'الرئيسي',
    'طنطا',
    'اسكندرية',
    'الاسكندرية',
  ]);

  return norm
    .split(' ')
    .map((t) => t.trim())
    .filter((token) => token.length >= 2 && !ignoreWords.has(token));
}

/**
 * Intelligent Arabic Name Matcher
 * Handles exact matches, full token equality, prefix/suffix titles stripping,
 * and compound names normalization without false positive partial matching.
 */
export function isArabicNameMatch(nameA?: string, nameB?: string): boolean {
  if (!nameA || !nameB) return false;
  const normA = normalizeArabicText(nameA);
  const normB = normalizeArabicText(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Compact space-stripped match (e.g. "احمدعلاء" vs "احمد علاء")
  const compactA = normA.replace(/\s+/g, '');
  const compactB = normB.replace(/\s+/g, '');
  if (compactA === compactB) return true;
  if (compactA.length >= 6 && compactB.length >= 6) {
    if (compactA.includes(compactB) || compactB.includes(compactA)) return true;
  }

  const tokensA = getArabicTokens(nameA);
  const tokensB = getArabicTokens(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const joinedA = tokensA.join(' ');
  const joinedB = tokensB.join(' ');
  if (joinedA === joinedB) return true;

  // Exact word boundary containment (e.g. "علاء عمر" inside "مندوب علاء عمر فرع الفيوم")
  if (
    (` ${normA} `).includes(` ${normB} `) ||
    (` ${normB} `).includes(` ${normA} `) ||
    (` ${joinedA} `).includes(` ${joinedB} `) ||
    (` ${joinedB} `).includes(` ${joinedA} `)
  ) {
    return true;
  }

  // Token matching heuristics:
  // Names MUST share first name token or all tokens of shorter name
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);

  // If all tokens of shorter name exist in longer name in exact sequence or set
  const allShorterMatch = shorter.every((t) => longerSet.has(t));
  if (allShorterMatch) {
    return true;
  }

  // If first names match (e.g. "يحيى بدير" and "يحيى بدير طنطاوي" or "يحيى" and "يحيى بدير")
  const firstMatch = tokensA[0] === tokensB[0];
  if (firstMatch) {
    if (tokensA.length === 1 || tokensB.length === 1) {
      return true;
    }
    // If both have >= 2 tokens and second token matches
    if (tokensA[1] === tokensB[1]) {
      return true;
    }
  }

  return false;
}

/**
 * Canonical Branch Names in Dream Distribution
 */
export const CANONICAL_BRANCHES = [
  'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
  'فرع المنيا',
  'فرع منيا القمح',
  'فرع القاهرة',
  'فرع الفيوم',
  'فرع البحيرة',
  'فرع ديمشلت',
  'فرع منوف',
] as const;

/**
 * Infer exact branch name from text (address, customer name, notes, governorate, or branch string)
 * Distinguishes Upper Egypt Minya (بني مزار، ملوي، سمالوط، مغاغة) from Sharqia Minya El-Qamh (منيا القمح، الزقازيق، بلبيس)
 */
export function inferBranchFromText(text?: string): string {
  if (!text) return '';
  const norm = normalizeArabicText(text);
  if (!norm) return '';

  // 1. Minya (Upper Egypt) specific centers & districts - Check first for unambiguous Minya locations
  if (
    norm.includes('بني مزار') ||
    norm.includes('بنى مزار') ||
    norm.includes('ملوي') ||
    norm.includes('ملوى') ||
    norm.includes('مغاغة') ||
    norm.includes('مغاغه') ||
    norm.includes('سمالوط') ||
    norm.includes('ابوقرقاص') ||
    norm.includes('ابو قرقاص') ||
    norm.includes('دير مواس') ||
    norm.includes('ديرمواس') ||
    norm.includes('مطاي') ||
    norm.includes('مطاى') ||
    norm.includes('العدوة') ||
    norm.includes('العدوه') ||
    norm.includes('عروس الصعيد') ||
    norm.includes('طه حسين')
  ) {
    return 'فرع المنيا';
  }

  // 2. Minya El-Qamh (Sharqia) - Must be checked before generic "منيا"
  if (
    norm.includes('منيا القمح') ||
    norm.includes('القمح') ||
    norm.includes('meq') ||
    norm.includes('شرقيه') ||
    norm.includes('الشرقيه') ||
    norm.includes('زقازيق') ||
    norm.includes('الزقازيق') ||
    norm.includes('بلبيس') ||
    norm.includes('فاقوس') ||
    norm.includes('مشتول') ||
    norm.includes('ابو حماد') ||
    norm.includes('ابوحماد') ||
    norm.includes('ديرب نجم') ||
    norm.includes('العاشر من رمضان')
  ) {
    return 'فرع منيا القمح';
  }

  // 3. Minya (Upper Egypt) general - Strict word matching
  if (
    /(?:^|\s)(?:المنيا|فرع المنيا|مدينة المنيا)(?:\s|$)/.test(norm) ||
    norm === 'المنيا' ||
    norm === 'منيا' ||
    norm.includes('عروس الصعيد')
  ) {
    return 'فرع المنيا';
  }

  // 4. Central October
  if (
    norm.includes('اكتوبر') ||
    norm.includes('مركزي') ||
    norm.includes('رئيسي') ||
    norm.includes('الجيزه') ||
    norm.includes('جيزه') ||
    norm.includes('october') ||
    norm.includes('giza') ||
    norm.includes('main')
  ) {
    return 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
  }

  // 5. Dimeshalt (Dakahlia / Mansoura)
  if (
    norm.includes('ديمشلت') ||
    norm.includes('دكرنس') ||
    norm.includes('منصوره') ||
    norm.includes('المنصوره') ||
    norm.includes('دقهليه') ||
    norm.includes('الدقهليه') ||
    norm.includes('ميت غمر') ||
    norm.includes('شربين') ||
    norm.includes('السنبلاوين') ||
    norm.includes('سنبلاوين') ||
    norm.includes('بلقاس') ||
    norm.includes('اجا') ||
    norm.includes('طلخا') ||
    norm.includes('المنزله') ||
    norm.includes('dimeshalt') ||
    norm.includes('dim')
  ) {
    return 'فرع ديمشلت';
  }

  // 6. Fayoum
  if (
    norm.includes('فيوم') ||
    norm.includes('الفيوم') ||
    norm.includes('اطسا') ||
    norm.includes('سنورس') ||
    norm.includes('طاميه') ||
    norm.includes('ابشواي') ||
    norm.includes('يوسف الصديق') ||
    norm.includes('fayoum') ||
    norm.includes('fay')
  ) {
    return 'فرع الفيوم';
  }

  // 7. Cairo
  if (
    norm.includes('قاهره') ||
    norm.includes('القاهره') ||
    norm.includes('مدينة نصر') ||
    norm.includes('وسط البلد') ||
    norm.includes('المعادي') ||
    norm.includes('شبرا') ||
    norm.includes('عين شمس') ||
    norm.includes('حلوان') ||
    norm.includes('cairo') ||
    norm.includes('cai')
  ) {
    return 'فرع القاهرة';
  }

  // 8. Beheira / Damanhour
  if (
    norm.includes('بحيره') ||
    norm.includes('البحيره') ||
    norm.includes('دمنهور') ||
    norm.includes('كفر الدوار') ||
    norm.includes('ايتاي البارود') ||
    norm.includes('ابو حمص') ||
    norm.includes('حوش عيسى') ||
    norm.includes('شبراخيت') ||
    norm.includes('كوم حماده') ||
    norm.includes('رشيد') ||
    norm.includes('الدلنجات') ||
    norm.includes('beheira') ||
    norm.includes('damanhour') ||
    norm.includes('beh')
  ) {
    return 'فرع البحيرة';
  }

  // 9. Menouf / Menoufia
  if (
    norm.includes('منوف') ||
    norm.includes('المنوفيه') ||
    norm.includes('شبين') ||
    norm.includes('اشمون') ||
    norm.includes('الباجور') ||
    norm.includes('قويسنا') ||
    norm.includes('بركة السبع') ||
    norm.includes('بركه السبع') ||
    norm.includes('تلا') ||
    norm.includes('الشهداء') ||
    norm.includes('السادات') ||
    norm.includes('menouf') ||
    norm.includes('mnf')
  ) {
    return 'فرع منوف';
  }

  return '';
}

/**
 * Branch canonical identifier
 */
export function normalizeBranchKey(branch?: string): string {
  if (!branch) return '';
  const inferred = inferBranchFromText(branch);
  if (inferred) {
    if (inferred.includes('أكتوبر') || inferred.includes('اكتوبر') || inferred.includes('مركزي')) return 'main';
    if (inferred.includes('منيا القمح')) return 'meq';
    if (inferred.includes('المنيا')) return 'minya';
    if (inferred.includes('ديمشلت')) return 'dimeshalt';
    if (inferred.includes('الفيوم') || inferred.includes('فيوم')) return 'fayoum';
    if (inferred.includes('القاهرة') || inferred.includes('قاهرة')) return 'cairo';
    if (inferred.includes('البحيرة') || inferred.includes('بحيرة')) return 'beheira';
    if (inferred.includes('منوف')) return 'menouf';
  }

  const norm = normalizeArabicText(branch);

  if (
    norm.includes('اكتوبر') ||
    norm.includes('مركزي') ||
    norm.includes('رئيسي') ||
    norm.includes('الجيزه') ||
    norm.includes('جيزه') ||
    norm.includes('october') ||
    norm.includes('giza') ||
    norm.includes('main')
  ) {
    return 'main';
  }

  // Minya El-Qamh (Sharqia) - Must be evaluated before general Minya
  if (
    norm.includes('منيا القمح') ||
    norm.includes('القمح') ||
    norm.includes('meq') ||
    norm.includes('شرقيه') ||
    norm.includes('زقازيق') ||
    norm.includes('بلبيس') ||
    norm.includes('فاقوس')
  ) {
    return 'meq';
  }

  // Minya (Upper Egypt) - All centers & districts
  if (
    norm.includes('المنيا') ||
    norm.includes('منيا') ||
    norm.includes('ملوي') ||
    norm.includes('ملوى') ||
    norm.includes('بني مزار') ||
    norm.includes('بنى مزار') ||
    norm.includes('مغاغة') ||
    norm.includes('مغاغه') ||
    norm.includes('سمالوط') ||
    norm.includes('ابوقرقاص') ||
    norm.includes('ابو قرقاص') ||
    norm.includes('دير مواس') ||
    norm.includes('ديرمواس') ||
    norm.includes('مطاي') ||
    norm.includes('مطاى') ||
    norm.includes('العدوة') ||
    norm.includes('العدوه') ||
    norm.includes('عروس الصعيد') ||
    norm.includes('طه حسين') ||
    norm.includes('minya') ||
    norm.includes('min')
  ) {
    return 'minya';
  }

  // Dimeshalt (Dakahlia / Mansoura)
  if (
    norm.includes('ديمشلت') ||
    norm.includes('دكرنس') ||
    norm.includes('منصوره') ||
    norm.includes('المنصوره') ||
    norm.includes('دقهليه') ||
    norm.includes('الدقهليه') ||
    norm.includes('ميت غمر') ||
    norm.includes('شربين') ||
    norm.includes('السنبلاوين') ||
    norm.includes('سنبلاوين') ||
    norm.includes('بلقاس') ||
    norm.includes('اجا') ||
    norm.includes('طلخا') ||
    norm.includes('المنزله') ||
    norm.includes('dimeshalt') ||
    norm.includes('dim')
  ) {
    return 'dimeshalt';
  }

  // Fayoum
  if (
    norm.includes('فيوم') ||
    norm.includes('الفيوم') ||
    norm.includes('اطسا') ||
    norm.includes('سنورس') ||
    norm.includes('طاميه') ||
    norm.includes('ابشواي') ||
    norm.includes('يوسف الصديق') ||
    norm.includes('fayoum') ||
    norm.includes('fay')
  ) {
    return 'fayoum';
  }

  // Cairo
  if (
    norm.includes('قاهره') ||
    norm.includes('القاهره') ||
    norm.includes('مدينة نصر') ||
    norm.includes('وسط البلد') ||
    norm.includes('المعادي') ||
    norm.includes('شبرا') ||
    norm.includes('عين شمس') ||
    norm.includes('حلوان') ||
    norm.includes('cairo') ||
    norm.includes('cai')
  ) {
    return 'cairo';
  }

  // Beheira / Damanhour
  if (
    norm.includes('بحيره') ||
    norm.includes('البحيره') ||
    norm.includes('دمنهور') ||
    norm.includes('كفر الدوار') ||
    norm.includes('ايتاي البارود') ||
    norm.includes('ابو حمص') ||
    norm.includes('حوش عيسى') ||
    norm.includes('شبراخيت') ||
    norm.includes('كوم حماده') ||
    norm.includes('رشيد') ||
    norm.includes('الدلنجات') ||
    norm.includes('beheira') ||
    norm.includes('damanhour') ||
    norm.includes('beh')
  ) {
    return 'beheira';
  }

  // Menouf / Menoufia
  if (
    norm.includes('منوف') ||
    norm.includes('المنوفيه') ||
    norm.includes('شبين') ||
    norm.includes('اشمون') ||
    norm.includes('الباجور') ||
    norm.includes('قويسنا') ||
    norm.includes('بركة السبع') ||
    norm.includes('بركه السبع') ||
    norm.includes('تلا') ||
    norm.includes('الشهداء') ||
    norm.includes('السادات') ||
    norm.includes('menouf') ||
    norm.includes('mnf')
  ) {
    return 'menouf';
  }

  return norm;
}

/**
 * Check if two branch references match
 */
export function isBranchMatch(
  branchA?: string,
  branchB?: string,
  options: { allowUnassigned?: boolean } = { allowUnassigned: true }
): boolean {
  const normA = (branchA || '').trim();
  const normB = (branchB || '').trim();

  if (!normA && !normB) return true;

  if (!normA || !normB) {
    return options.allowUnassigned !== false;
  }

  const keyA = normalizeBranchKey(normA);
  const keyB = normalizeBranchKey(normB);

  if (!keyA || !keyB) {
    return options.allowUnassigned !== false;
  }

  return keyA === keyB;
}

/**
 * Check if a customer strictly belongs to a specific sales rep
 * Direct rep assignment (by repId or salesRepName/repName) takes top priority,
 * with comprehensive Arabic normalization, phone/username matching, and alias support.
 */
export function doesCustomerBelongToRep(customer: Customer, repUser: User): boolean {
  if (!customer || !repUser) return false;

  // 1. Direct ID / Username match (Highest authority)
  if (
    customer.repId &&
    (customer.repId === repUser.id ||
      customer.repId.toLowerCase() === repUser.id.toLowerCase() ||
      (repUser.username && customer.repId.toLowerCase() === repUser.username.toLowerCase()))
  ) {
    return true;
  }

  const normUserName = normalizeArabicText(repUser.name);
  const normUserCompact = normUserName.replace(/\s+/g, '');
  const cleanUserTokens = getArabicTokens(repUser.name).filter(
    (t) => !['مندوب', 'المندوب', 'استاذ', 'الاستاذ', 'كابتن', 'مهندس', 'مسؤول', 'مسئول', 'فرع', 'مبيعات', 'المبيعات'].includes(t)
  );

  // 2. Direct Match by Name / Username / Phone on the customer's rep fields
  const repCandidates = [
    customer.salesRepName,
    customer.repName,
    // Some imported sheets store the representative name in the repId column.
    customer.repId,
    (customer as any).rep,
    (customer as any).delegateName,
    (customer as any).salesRep,
    (customer as any).sales_rep,
    (customer as any).rep_name,
    (customer as any).representative_name,
    // Preserve compatibility with older imports that kept the original column names.
    ...Object.entries(customer as unknown as Record<string, unknown>)
      .filter(([key, value]) => {
        const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
        return (
          typeof value === 'string' &&
          (normalizedKey.includes('rep') ||
            normalizedKey.includes('sales') ||
            normalizedKey.includes('delegate') ||
            normalizedKey.includes('representative') ||
            normalizedKey.includes('مندوب'))
        );
      })
      .map(([, value]) => value),
  ]
    .filter((val): val is string => typeof val === 'string' && val.trim().length > 0)
    .map((s) => s.trim());

  // Also check if notes contains explicit rep declaration (e.g. "المندوب: أحمد علاء" or "أحمد علاء")
  if (customer.notes && typeof customer.notes === 'string') {
    const noteNorm = normalizeArabicText(customer.notes);
    if (
      normUserName &&
      (noteNorm.includes(`مندوب ${normUserName}`) ||
        noteNorm.includes(`المندوب ${normUserName}`) ||
        noteNorm.includes(`المندوب: ${normUserName}`) ||
        noteNorm.includes(normUserName))
    ) {
      return true;
    }
  }

  // Also check if address contains rep note (e.g. "تسليم مندوب أحمد علاء")
  if (customer.address && typeof customer.address === 'string') {
    const addrNorm = normalizeArabicText(customer.address);
    if (normUserName && (addrNorm.includes(`مندوب ${normUserName}`) || addrNorm.includes(`تسليم ${normUserName}`))) {
      return true;
    }
  }

  for (const repField of repCandidates) {
    const isGenericRep =
      !repField ||
      repField === 'مندوب المبيعات' ||
      repField === 'المندوب' ||
      repField === 'مندوب' ||
      repField === 'مبيعات' ||
      repField === 'غير محدد' ||
      repField === '---' ||
      repField === '..' ||
      repField === '.' ||
      repField.toLowerCase() === 'unassigned' ||
      repField.toLowerCase() === 'none' ||
      repField.toLowerCase() === 'null';

    if (isGenericRep) continue;

    // Exact or normalized Arabic match via isArabicNameMatch
    if (isArabicNameMatch(repField, repUser.name)) return true;
    if (repUser.username && isArabicNameMatch(repField, repUser.username)) return true;
    if (repUser.phone && repUser.phone.length >= 8 && (repField.includes(repUser.phone) || repUser.phone.includes(repField))) return true;

    const normRepField = normalizeArabicText(repField);

    if (normRepField && normUserName) {
      if (normRepField === normUserName) return true;

      // Word boundary match (e.g. "مندوب احمد علاء فرع الفيوم" contains "احمد علاء")
      if ((` ${normRepField} `).includes(` ${normUserName} `) || (` ${normUserName} `).includes(` ${normRepField} `)) {
        return true;
      }

      // Compact match without spaces (e.g. "احمدعلاء" vs "احمد علاء")
      const normRepCompact = normRepField.replace(/\s+/g, '');
      if (normUserCompact && normRepCompact.includes(normUserCompact)) return true;
      if (normRepCompact.length >= 6 && normUserCompact.includes(normRepCompact)) return true;
    }

    // Tokenized Arabic matching
    const repTokens = getArabicTokens(repField).filter(
      (t) => !['مندوب', 'المندوب', 'استاذ', 'الاستاذ', 'كابتن', 'مهندس', 'مسؤول', 'مسئول', 'فرع', 'مبيعات', 'المبيعات'].includes(t)
    );

    if (cleanUserTokens.length > 0 && repTokens.length > 0) {
      // If all tokens of user name exist in the rep field (e.g. user "احمد علاء" in "احمد علاء الدين" or "احمد علاء عمر")
      const allUserTokensMatch = cleanUserTokens.every((tok) => repTokens.includes(tok));
      if (allUserTokensMatch) return true;

      // If all rep tokens exist in user name tokens (e.g. rep field is "احمد علاء" and user is "احمد علاء محمد")
      const allRepTokensInUser = repTokens.every((tok) => cleanUserTokens.includes(tok));
      if (allRepTokensInUser) return true;

      // Check shared non-trivial name tokens (e.g. first and second name match)
      const sharedTokens = cleanUserTokens.filter((tok) => repTokens.includes(tok));
      if (sharedTokens.length >= 2) return true;
    }
  }

  return false;
}

/**
 * Check if a customer belongs to a supervisor's supervised team
 */
export function doesCustomerBelongToSupervisor(
  customer: Customer,
  supervisorUser: User,
  allUsers: User[]
): boolean {
  if (!supervisorUser) return false;

  // 1. If customer belongs to the supervisor's branch, supervisor can view it
  if (supervisorUser.branchName && customer.branchName) {
    if (isBranchMatch(customer.branchName, supervisorUser.branchName, { allowUnassigned: false })) {
      return true;
    }
  }

  // 2. Check if assigned directly to the supervisor
  if (doesCustomerBelongToRep(customer, supervisorUser)) {
    return true;
  }

  // 3. Find all sales reps belonging to this supervisor
  const supervisedReps = allUsers.filter(
    (u) =>
      u.supervisorId === supervisorUser.id ||
      (u.role === 'sales_rep' &&
        isBranchMatch(u.branchName, supervisorUser.branchName, { allowUnassigned: false }))
  );

  // 4. Check if customer belongs to any of these reps
  return supervisedReps.some((rep) => doesCustomerBelongToRep(customer, rep));
}

/**
 * Check if a customer belongs to a branch manager's branch
 */
export function doesCustomerBelongToBranch(customer: Customer, branchName?: string): boolean {
  if (!branchName) return true;
  if (!customer.branchName) return true;
  return isBranchMatch(customer.branchName, branchName, { allowUnassigned: false });
}

/**
 * Robustly resolve product branch stock in cartons for a target branch using normalized matching
 */
export function getBranchStockForProduct(product: Product, targetBranch?: string): number {
  if (!product) return 0;
  if (!targetBranch || targetBranch === 'الكل') {
    return product.branchStockActual || 0;
  }

  const targetKey = normalizeBranchKey(targetBranch);

  // 1. If querying October Central Warehouse
  if (targetKey === 'main') {
    if (typeof product.mainWarehouseActual === 'number') {
      return product.mainWarehouseActual;
    }
  }

  // 2. Direct branchStocks map lookup by normalized keys
  if (product.branchStocks && typeof product.branchStocks === 'object' && Object.keys(product.branchStocks).length > 0) {
    let hasBranchKey = false;
    for (const [key, stock] of Object.entries(product.branchStocks)) {
      if (typeof stock === 'number' && !isNaN(stock)) {
        hasBranchKey = true;
        if (normalizeBranchKey(key) === targetKey) {
          return stock;
        }
      }
    }
    // If the product has explicit branch-specific stock map but the requested branch is not present
    if (hasBranchKey) {
      return 0;
    }
  }

  // 3. If product has a single branchName assigned, verify branch match
  if (product.branchName) {
    if (normalizeBranchKey(product.branchName) === targetKey) {
      return product.branchStockActual || 0;
    }
    return 0;
  }

  // 4. Fallback to product.branchStockActual if unassigned
  return product.branchStockActual || 0;
}

