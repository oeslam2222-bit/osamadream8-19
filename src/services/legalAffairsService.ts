// Service to manage Legal Affairs referrals, statements, settlements, and customer badges
import { Customer } from '../types';

export interface LegalStatement {
  id: string;
  date: string;
  authorName: string;
  authorRole: string;
  statement: string;
  actionTaken?: string;
  settlementAmount?: number;
  rescheduledInstallments?: Array<{ dueDate: string; amount: number; isPaid: boolean }>;
}

export interface LegalCase {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  storeName?: string;
  phone: string;
  branchName: string;
  repName: string;
  supervisorName: string;
  
  // Financial snapshot
  totalDebt: number;
  overdueAmount: number;
  unpaidInvoicesCount: number;
  lastCollectionDate?: string;
  guaranteeType?: string;
  guaranteeAmount?: number;

  // Referral Lifecycle
  status:
    | 'بانتظار اعتماد مدير الفرع'   // Supervisor referred, pending branch manager
    | 'محال للشؤون القانونية'        // Approved, active in legal affairs
    | 'قيد المتابعة والتحقيق'       // Legal advisor is actively following up
    | 'جدولة المديونية'            // Debt rescheduling agreed
    | 'تسوية ودية'               // Settlement agreed
    | 'إجراء قضائي ومحضر'         // Police report / court case filed
    | 'تم سداد كامل المديونية وإغلاق الملف'; // Fully paid and resolved

  referredByRole: string;
  referredByName: string;
  referredAt: string;
  referralReason: string;

  branchManagerApproved: boolean;
  branchManagerApprovedBy?: string;
  branchManagerApprovedAt?: string;
  branchManagerNotes?: string;

  // Legal Advisor Statement & Notes
  latestLegalStatement?: string;
  latestLegalStatementDate?: string;
  statementsHistory: LegalStatement[];

  // Resolution info
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionType?: 'full_payment' | 'settlement' | 'rescheduled' | 'dismissed';
}

const STORAGE_KEY = 'tantawy_legal_cases_store_v1';
const UPDATE_EVENT = 'tantawy_legal_cases_updated';

// Initial realistic legal cases seeded for existing delinquent clients
const INITIAL_CASES: LegalCase[] = [
  {
    id: 'LEG-2026-001',
    customerId: 'CUST-001',
    customerCode: 'C-1092',
    customerName: 'مكتبة ومستلزمات النجاح',
    storeName: 'معرض النجاح الحديث',
    phone: '01012345678',
    branchName: 'فرع طنطا',
    repName: 'أحمد محمود',
    supervisorName: 'محمد عبد الله',
    totalDebt: 34500,
    overdueAmount: 34500,
    unpaidInvoicesCount: 3,
    lastCollectionDate: '2025-11-20',
    guaranteeType: 'شيك بنكي + إيصال أمانة',
    guaranteeAmount: 40000,
    status: 'محال للشؤون القانونية',
    referredByRole: 'supervisor',
    referredByName: 'محمد عبد الله (مشرف المناديب)',
    referredAt: '2026-02-05 10:30',
    referralReason: 'تجاوز فترة الائتمان بأكثر من 90 يوماً ورفض سداد الفواتير المستحقة مع التهرب من مقابلات المندوب.',
    branchManagerApproved: true,
    branchManagerApprovedBy: 'مدير فرع طنطا',
    branchManagerApprovedAt: '2026-02-06 14:00',
    branchManagerNotes: 'تمت مراجعة الفواتير وأوراق الضمان والاعتماد للتحويل الفوري للشؤون القانونية لاتخاذ اللازم.',
    latestLegalStatement: 'تم توجيه إنذار رسمي على يد محضر برقم 884 لسنة 2026 محكمة طنطا الابتدائية ومنح مهلة أخيرة 7 أيام قبل رفع جنحة الشيك.',
    latestLegalStatementDate: '2026-02-12 11:15',
    statementsHistory: [
      {
        id: 'STMT-001',
        date: '2026-02-08 09:30',
        authorName: 'المستشار القانوني',
        authorRole: 'legal_advisor',
        statement: 'تم استلام الملف ومطابقة أصل الشيك البنكي رقم 00984210 والتأكد من تاريخ الارتداد بدون رصيد.',
        actionTaken: 'إعداد إنذار رسمي بالسداد'
      },
      {
        id: 'STMT-002',
        date: '2026-02-12 11:15',
        authorName: 'المستشار القانوني',
        authorRole: 'legal_advisor',
        statement: 'تم توجيه إنذار رسمي على يد محضر برقم 884 لسنة 2026 محكمة طنطا الابتدائية ومنح مهلة أخيرة 7 أيام قبل رفع جنحة الشيك.',
        actionTaken: 'إعلان قلم المحضرين'
      }
    ]
  },
  {
    id: 'LEG-2026-002',
    customerId: 'CUST-002',
    customerCode: 'C-2401',
    customerName: 'شركة الإيمان للتوريدات',
    storeName: 'الإيمان هوم',
    phone: '01198765432',
    branchName: 'فرع المنصورة',
    repName: 'إسلام فاروق',
    supervisorName: 'سامح حسن',
    totalDebt: 78000,
    overdueAmount: 50000,
    unpaidInvoicesCount: 5,
    lastCollectionDate: '2025-12-10',
    guaranteeType: 'إيصال أمانة ضامن',
    guaranteeAmount: 85000,
    status: 'جدولة المديونية',
    referredByRole: 'supervisor',
    referredByName: 'سامح حسن (مشرف)',
    referredAt: '2026-01-28 12:00',
    referralReason: 'تعثر في سداد الأقساط الشهرية وطلب إعادة جدولة تحت إشراف الشؤون القانونية.',
    branchManagerApproved: true,
    branchManagerApprovedBy: 'مدير فرع المنصورة',
    branchManagerApprovedAt: '2026-01-29 11:30',
    latestLegalStatement: 'حضر التاجر لمقر الإدارة وتم توقيع محضر اتفاق وجدولة على 4 أقساط شهرية متساوية (20,000 ج.م شهرياً) مع الالتزام بعدم استلام بضاعة جديدة إلا نقداً.',
    latestLegalStatementDate: '2026-02-15 15:00',
    statementsHistory: [
      {
        id: 'STMT-003',
        date: '2026-02-02 10:00',
        authorName: 'المستشار القانوني',
        authorRole: 'legal_advisor',
        statement: 'تم عقد جلسة تفاوض ودية بحضور مدير الفرع والتاجر وتحديد جدول زمني للأقساط.',
        actionTaken: 'إبرام ملحق اتفاق جدولة'
      },
      {
        id: 'STMT-004',
        date: '2026-02-15 15:00',
        authorName: 'المستشار القانوني',
        authorRole: 'legal_advisor',
        statement: 'حضر التاجر لمقر الإدارة وتم توقيع محضر اتفاق وجدولة على 4 أقساط شهرية متساوية مع الالتزام بالسداد في المواعيد.',
        actionTaken: 'توثيق الجدولة وتجميد البيع الآجل'
      }
    ]
  }
];

export function getLegalCases(): LegalCase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Error reading legal cases from storage', e);
  }
  // Initialize with initial cases
  saveLegalCases(INITIAL_CASES);
  return INITIAL_CASES;
}

export function saveLegalCases(cases: LegalCase[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: cases }));
  } catch (e) {
    console.warn('Error saving legal cases to storage', e);
  }
}

export function subscribeToLegalCases(callback: (cases: LegalCase[]) => void): () => void {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<LegalCase[]>;
    callback(customEvent.detail || getLegalCases());
  };
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function isCustomerReferredToLegal(customerOrId: Customer | string | undefined | null): boolean {
  if (!customerOrId) return false;
  const cases = getLegalCases();
  const searchId = typeof customerOrId === 'string' ? customerOrId : customerOrId.id;
  const searchCode = typeof customerOrId === 'object' ? customerOrId.code : '';
  const searchName = typeof customerOrId === 'object' ? customerOrId.name?.trim().toLowerCase() : '';

  return cases.some((c) => {
    // Check if case is still open / active (not fully settled and closed)
    const isOngoing = c.status !== 'تم سداد كامل المديونية وإغلاق الملف';
    if (!isOngoing) return false;

    if (searchId && (c.customerId === searchId || c.id === searchId)) return true;
    if (searchCode && c.customerCode && String(c.customerCode) === String(searchCode)) return true;
    if (searchName && c.customerName && c.customerName.trim().toLowerCase() === searchName) return true;
    return false;
  });
}

export function getLegalCaseForCustomer(customerOrId: Customer | string | undefined | null): LegalCase | undefined {
  if (!customerOrId) return undefined;
  const cases = getLegalCases();
  const searchId = typeof customerOrId === 'string' ? customerOrId : customerOrId.id;
  const searchCode = typeof customerOrId === 'object' ? customerOrId.code : '';
  const searchName = typeof customerOrId === 'object' ? customerOrId.name?.trim().toLowerCase() : '';

  return cases.find((c) => {
    if (searchId && (c.customerId === searchId || c.id === searchId)) return true;
    if (searchCode && c.customerCode && String(c.customerCode) === String(searchCode)) return true;
    if (searchName && c.customerName && c.customerName.trim().toLowerCase() === searchName) return true;
    return false;
  });
}

export function referCustomerToLegal(params: {
  customer: Customer;
  referredByName: string;
  referredByRole: string;
  reason: string;
  totalDebt?: number;
  overdueAmount?: number;
}): { success: boolean; message: string; legalCase?: LegalCase } {
  const cases = getLegalCases();
  
  // Check if already open
  const existing = cases.find(
    (c) =>
      c.customerId === params.customer.id &&
      c.status !== 'تم سداد كامل المديونية وإغلاق الملف'
  );
  if (existing) {
    return {
      success: false,
      message: `العميل محال بالفعل للشؤون القانونية بالملف رقم (${existing.id}) بحالة: ${existing.status}`
    };
  }

  const now = new Date();
  const formattedDate = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

  const debt = params.totalDebt ?? params.customer.currentBalance ?? params.customer.balance ?? 0;
  const overdue = params.overdueAmount ?? params.customer.totalOverdueAndDue ?? params.customer.overdueBalance ?? debt;

  // If referred by branch_manager or admin, it's directly approved; if supervisor, it requires branch manager approval
  const isDirectApproved = params.referredByRole === 'branch_manager' || params.referredByRole === 'admin' || params.referredByRole === 'developer';

  const newCase: LegalCase = {
    id: `LEG-2026-${String(cases.length + 1).padStart(3, '0')}`,
    customerId: params.customer.id,
    customerCode: params.customer.code || 'N/A',
    customerName: params.customer.name,
    storeName: params.customer.storeName || params.customer.name,
    phone: params.customer.phone || 'N/A',
    branchName: params.customer.branchName || 'الفرع الرئيسي',
    repName: params.customer.salesRepName || params.customer.repName || 'المندوب المسئول',
    supervisorName: params.customer.supervisorName || params.referredByName,
    totalDebt: debt,
    overdueAmount: overdue,
    unpaidInvoicesCount: params.customer.totalOrdersCount || 1,
    lastCollectionDate: params.customer.lastCollectionDate || 'غير مسجل',
    guaranteeType: params.customer.guaranteeDocs || 'إيصال أمانة / فواتير موقعة',
    guaranteeAmount: params.customer.guaranteeAmount || debt,
    status: isDirectApproved ? 'محال للشؤون القانونية' : 'بانتظار اعتماد مدير الفرع',
    referredByRole: params.referredByRole,
    referredByName: params.referredByName,
    referredAt: formattedDate,
    referralReason: params.reason || 'تأخر في السداد وتجاوز المدة الائتمانية القانونية المسموح بها.',
    branchManagerApproved: isDirectApproved,
    branchManagerApprovedBy: isDirectApproved ? params.referredByName : undefined,
    branchManagerApprovedAt: isDirectApproved ? formattedDate : undefined,
    statementsHistory: [
      {
        id: `STMT-${Date.now()}`,
        date: formattedDate,
        authorName: params.referredByName,
        authorRole: params.referredByRole,
        statement: `تم إنشاء طلب إحالة العميل للشؤون القانونية بسبب: ${params.reason}`,
        actionTaken: isDirectApproved ? 'إحالة معتمدة مباشرة' : 'بانتظار اعتماد مدير الفرع'
      }
    ]
  };

  const updatedCases = [newCase, ...cases];
  saveLegalCases(updatedCases);

  return {
    success: true,
    message: isDirectApproved
      ? `تمت إحالة العميل ${params.customer.name} للشؤون القانونية بنجاح واعتمادها للمستشار القانوني!`
      : `تم رفع طلب إحالة العميل ${params.customer.name} للشؤون القانونية بنجاح وبانتظار اعتماد مدير الفرع.`,
    legalCase: newCase
  };
}

export function approveReferralByBranchManager(
  caseId: string,
  managerName: string,
  notes?: string
): { success: boolean; message: string } {
  const cases = getLegalCases();
  const cIndex = cases.findIndex((c) => c.id === caseId);
  if (cIndex === -1) return { success: false, message: 'الملف القانوني غير موجود' };

  const now = new Date();
  const formattedDate = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

  const currentCase = cases[cIndex];
  const updatedCase: LegalCase = {
    ...currentCase,
    status: 'محال للشؤون القانونية',
    branchManagerApproved: true,
    branchManagerApprovedBy: managerName,
    branchManagerApprovedAt: formattedDate,
    branchManagerNotes: notes,
    statementsHistory: [
      ...currentCase.statementsHistory,
      {
        id: `STMT-${Date.now()}`,
        date: formattedDate,
        authorName: managerName,
        authorRole: 'branch_manager',
        statement: `قام مدير الفرع باعتماد تحويل العميل للشؤون القانونية. ${notes ? `ملاحظات: ${notes}` : ''}`,
        actionTaken: 'اعتماد رسمي للإحالة'
      }
    ]
  };

  cases[cIndex] = updatedCase;
  saveLegalCases(cases);

  return {
    success: true,
    message: `تم اعتماد إحالة العميل (${updatedCase.customerName}) رسمياً للشؤون القانونية!`
  };
}

export function addLegalStatement(
  caseId: string,
  statementText: string,
  authorName: string,
  authorRole: string,
  newStatus?: LegalCase['status'],
  actionTaken?: string
): { success: boolean; message: string } {
  const cases = getLegalCases();
  const cIndex = cases.findIndex((c) => c.id === caseId);
  if (cIndex === -1) return { success: false, message: 'الملف غير موجود' };

  const now = new Date();
  const formattedDate = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

  const currentCase = cases[cIndex];
  const newStatement: LegalStatement = {
    id: `STMT-${Date.now()}`,
    date: formattedDate,
    authorName,
    authorRole,
    statement: statementText,
    actionTaken: actionTaken || 'إفادة قانونية'
  };

  const updatedCase: LegalCase = {
    ...currentCase,
    status: newStatus || currentCase.status,
    latestLegalStatement: statementText,
    latestLegalStatementDate: formattedDate,
    statementsHistory: [...currentCase.statementsHistory, newStatement],
    resolvedAt: (newStatus === 'تم سداد كامل المديونية وإغلاق الملف') ? formattedDate : currentCase.resolvedAt,
    resolvedBy: (newStatus === 'تم سداد كامل المديونية وإغلاق الملف') ? authorName : currentCase.resolvedBy,
    resolutionType: (newStatus === 'تم سداد كامل المديونية وإغلاق الملف') ? 'full_payment' : currentCase.resolutionType
  };

  cases[cIndex] = updatedCase;
  saveLegalCases(cases);

  return {
    success: true,
    message: 'تم حفظ الإفادة القانونية وتحديث حالة الملف بنجاح ✅'
  };
}
