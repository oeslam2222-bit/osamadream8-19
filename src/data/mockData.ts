import { AuditLog, Branch, Customer, Invoice, Product, User } from '../types';

export const COMPANY_INFO = {
  name: 'شركة دريم للتجارة والتوزيع',
  nameArabic: 'شركة دريم للتجارة والتوزيع',
  nameEnglish: 'Dream Trading & Distribution Co.',
  commercialNameEn: 'Dream Trading & Distribution Co.',
  taxNumber: '200-482-991',
  taxRegistrationNumber: '200-482-991',
  commercialRegister: '184920 - الجيزة',
  activity: 'تجارة وتوزيع الأدوات المنزلية والزجاج والمستلزمات',
  address: 'المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة',
  headquarters: 'المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة',
  phone: '02-38334455 / 01000000001',
  customerService: '19000 / 01000000001',
  email: 'oeslam2222@gmail.com',
  website: 'www.dream-dist.com',
};

export const OFFICIAL_DEPARTMENTS_LIST = [
  'لوتس',
  'ألفا',
  'دريم هوم',
  'لاينز',
  'جيجيلي',
  'كازان',
  'ألزا',
  'توباكو',
  'جيميا',
  'لومينارك',
  'ماركاتو',
  'جالاكسي',
  'بلينك ماكس',
  'ديليزوجا',
  'جرين آبل',
  'كاساسنك',
  'أولالا',
  'كوكوسيكوك',
  'تيسي جيسي',
];

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'b-main-october',
    name: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
    code: 'MAIN-01',
    city: '6 أكتوبر / الجيزة',
    address: 'المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة',
    managerName: 'أشرف عبد العزيز',
    phone: '01012345678',
    isMainWarehouse: true,
    email: 'october@dream-dist.com',
    notificationEmails: ['october@dream-dist.com'],
  },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'u-admin-osama',
    name: 'أسامة',
    username: 'osama',
    email: 'Osama@dream.com',
    password: '',
    role: 'developer',
    branchName: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
    sector: 'all',
    phone: '01000000001',
    isActive: true,
    approvalStatus: 'active',
  },
  {
    id: 'u-legal-counsel',
    name: 'المستشار القانوني (الإدارة القانونية)',
    username: 'legal',
    email: 'legal@tantawy.com',
    password: '',
    role: 'legal_advisor',
    branchName: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
    sector: 'all',
    phone: '01022334455',
    isActive: true,
    approvalStatus: 'active',
  },
];

// Empty products list ready for live upload / Supabase sync
export const INITIAL_PRODUCTS: Product[] = [];

// Empty customers list - real customers are loaded from Supabase
export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_INVOICES: Invoice[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
