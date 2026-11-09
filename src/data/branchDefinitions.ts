export type Sector = 'home' | 'electrical';

export interface Branch {
  id: number;
  name: string;
  sector: Sector;
}

/**
 * فروع النظام من الصورة المرفقة.
 * كل فرع 붙어 عليه قطاع (منزلي / كهربا) ورقم تعريفي.
 */
export const BRANCHES: Branch[] = [
  { id: 15, name: 'فرع المنزلي', sector: 'home' },
  { id: 16, name: 'فرع الكهرباء', sector: 'electrical' },
  { id: 45, name: 'موزعات منزلية', sector: 'home' },
  { id: 46, name: 'توزيعات كهرباء', sector: 'electrical' },
  { id: 55, name: 'منافذ منزلية', sector: 'home' },
  { id: 56, name: 'منافذ كهرباء', sector: 'electrical' },
  { id: 65, name: 'منطقة القاهرة منزلية', sector: 'home' },
  { id: 66, name: 'منطقة القاهرة كهرباء', sector: 'electrical' },
  { id: 75, name: 'المناطق والريف منزلية', sector: 'home' },
  { id: 76, name: 'المناطق والريف كهرباء', sector: 'electrical' },
  { id: 90, name: 'الصناعية منزلية', sector: 'home' },
  { id: 91, name: 'الصناعية كهرباء', sector: 'electrical' },
  { id: 95, name: 'المنيا منزلية', sector: 'home' },
  { id: 96, name: 'المنيا كهرباء', sector: 'electrical' },
];

export const getBranchesBySector = (sector: Sector): Branch[] =>
  BRANCHES.filter((b) => b.sector === sector);

/** كلمات مفتاحية تُستخدم لو اسم الفرع مش مطابق حرفيًا لأي فرع معروف. */
const ELECTRICAL_KEYWORDS = ['كهرب', 'electrical', 'electric', 'لمبه', 'لمبة', 'كابل', 'سلك'];
const HOME_KEYWORDS = ['منزل', 'home'];

/**
 * يستنتج قطاع العميل/المستخدم من اسم الفرع.
 * أسماء الفروع في النظام إما مطابقة لـ BRANCHES أو تحتوي كلمة (منزلية / كهرباء).
 */
export function inferSectorFromBranchName(branchName?: string | null): Sector | undefined {
  if (!branchName) return undefined;
  const name = branchName.trim();
  if (!name) return undefined;

  const exact = BRANCHES.find((b) => b.name === name);
  if (exact) return exact.sector;

  // «فرع 16 / فرع 96» = أسماء الفروع بأرقامها التعريفية في الشيتات المستوردة.
  const numeric = name.match(/\d{1,3}/);
  if (numeric) {
    const byId = getBranchById(Number(numeric[0]));
    if (byId) return byId.sector;
  }

  // مطابقة جزئية (مثال: «فرع الكهرباء - أكتوبر»)
  const partial = BRANCHES.find(
    (b) => name.includes(b.name) || (name.length >= 5 && b.name.includes(name))
  );
  if (partial) return partial.sector;

  if (ELECTRICAL_KEYWORDS.some((k) => name.includes(k))) return 'electrical';
  if (HOME_KEYWORDS.some((k) => name.includes(k))) return 'home';
  return undefined;
}

/** يستنتج القطاع من نص حر (اسم المندوب مثلًا: «مندوب كهرباء الفيوم»). */
export function inferSectorFromText(text?: string | null): Sector | undefined {
  if (!text) return undefined;
  if (ELECTRICAL_KEYWORDS.some((k) => text.includes(k))) return 'electrical';
  if (HOME_KEYWORDS.some((k) => text.includes(k))) return 'home';
  return undefined;
}

/**
 * قطاع العميل النهائي.
 *
 * ملاحظة مهمة عن الواقع: معظم العملاء المستوردين من الشيتات بيبقى حقل
 * `sector` فيهم «home» بشكل افتراضي لكل الصفوف — حتى عملاء فروع الكهرباء.
 * لذلك اسم الفرع/المندوب (فيه «كهرباء» أو رقم فرع كهربائي) أقوى دليل من
 * الحقل الافتراضي، وبنستخدمه الأول.
 */
export function inferCustomerSector(
  customer: {
    sector?: string;
    branchName?: string;
    repName?: string;
    salesRepName?: string;
  },
  users?: Array<{ name?: string; sector?: string; branchName?: string }>
): Sector | undefined {
  const explicit = customer.sector;
  const fromBranch = inferSectorFromBranchName(customer.branchName);
  const fromRep = inferSectorFromText(
    `${customer.repName || ''} ${customer.salesRepName || ''}`
  );

  // دليل صريح على الكهرباء (فرع رقمه كهربائي أو مندوب مكتوب في اسمه «كهرباء»)
  // يتغلّب على وسم «home» الافتراضي الغلط.
  if (fromBranch === 'electrical' || fromRep === 'electrical') return 'electrical';

  if (explicit === 'home' || explicit === 'electrical') return explicit;
  if (fromBranch) return fromBranch;
  if (fromRep) return fromRep;

  const repName = (customer.repName || customer.salesRepName || '').trim();
  if (repName && users && users.length > 0) {
    const rep = users.find(
      (u) =>
        (u.name || '').trim() === repName &&
        (u.sector === 'home' || u.sector === 'electrical')
    );
    if (rep) return rep.sector as Sector;
  }

  return undefined;
}

export const getBranchById = (id: number): Branch | undefined =>
  BRANCHES.find((b) => b.id === id);

export const HOME_BRANCH_IDS = BRANCHES.filter((b) => b.sector === 'home').map((b) => b.id);
export const ELECTRICAL_BRANCH_IDS = BRANCHES.filter((b) => b.sector === 'electrical').map((b) => b.id);