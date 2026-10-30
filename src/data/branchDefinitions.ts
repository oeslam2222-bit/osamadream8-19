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

export const getBranchById = (id: number): Branch | undefined =>
  BRANCHES.find((b) => b.id === id);

export const HOME_BRANCH_IDS = BRANCHES.filter((b) => b.sector === 'home').map((b) => b.id);
export const ELECTRICAL_BRANCH_IDS = BRANCHES.filter((b) => b.sector === 'electrical').map((b) => b.id);