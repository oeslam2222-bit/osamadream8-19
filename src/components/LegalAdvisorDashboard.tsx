import React, { useEffect, useMemo, useState } from 'react';
import '../styles/legal-polish.css';
import { CustomerSearchSelect } from './CustomerSearchSelect';
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Download,
  Eye,
  FileCheck,
  FileText,
  Filter,
  FolderOpen,
  Gavel,
  History,
  Plus,
  Printer,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Customer } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { filterCustomersByRBAC } from '../services/customerAnalyticsService';
import { inferCustomerSector } from '../data/branchDefinitions';
import {
  addLegalStatement,
  getLegalCaseForCustomer,
  getLegalCases,
  isCustomerReferredToLegal,
  subscribeToLegalCases,
  type LegalCase,
} from '../services/legalAffairsService';

interface LegalNotice {
  id: string;
  customerName: string;
  customerCode: string;
  branch: string;
  repName: string;
  totalDebt: number;
  issueDate: string;
  deadlineDate: string;
  status: 'مسودة' | 'تم الإرسال على يد محضر' | 'قيد التفاوض' | 'مرفوع دعوى قضائية' | 'تمت التسوية';
  legalType: 'إنذار رسمي على يد محضر' | 'أمر أداء تجاري' | 'جنحة شيك بدون رصيد' | 'إقرار دين وجدولة';
  notes: string;
}

interface GuaranteeCheck {
  id: string;
  customerName: string;
  bankName: string;
  checkNumber: string;
  amount: number;
  dueDate: string;
  type: 'شيك بنكي' | 'إيصال أمانة' | 'سند إذني';
  status: 'ساري ومودع بالخزينة' | 'مرتد بدون رصيد' | 'قيد التحصيل القضائي' | 'مسدد بالكامل';
}

type TabKey = 'cases' | 'delinquents' | 'notices' | 'checks' | 'templates';

const CASE_STATUS_META: Record<LegalCase['status'], { cls: string; tone: string }> = {
  'بانتظار اعتماد مدير الفرع': { cls: 'bg-amber-50 text-amber-800 border-amber-200', tone: 'warn' },
  'محال للشؤون القانونية': { cls: 'bg-blue-50 text-blue-800 border-blue-200', tone: 'info' },
  'قيد المتابعة والتحقيق': { cls: 'bg-indigo-50 text-indigo-800 border-indigo-200', tone: 'prog' },
  'جدولة المديونية': { cls: 'bg-violet-50 text-violet-800 border-violet-200', tone: 'sched' },
  'تسوية ودية': { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', tone: 'ok' },
  'إجراء قضائي ومحضر': { cls: 'bg-rose-50 text-rose-800 border-rose-200', tone: 'risk' },
  'تم سداد كامل المديونية وإغلاق الملف': { cls: 'bg-slate-100 text-slate-700 border-slate-200', tone: 'muted' },
};

const fmt = (n: number) => formatCurrency(n || 0);
const todayIso = () => new Date().toISOString().slice(0, 10);

export const LegalAdvisorDashboard: React.FC = () => {
  const {
    customers,
    branches,
    currentUser,
    users,
    recordAuditLog,
    activeSectorFilter,
    setActiveSectorFilter,
    canManageSectorGate,
    effectiveSectorFilter,
  } = useApp();

  const activeSector: 'home' | 'electrical' | 'none' = canManageSectorGate
    ? activeSectorFilter
    : effectiveSectorFilter;

  const [activeTab, setActiveTab] = useState<TabKey>('cases');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('الكل');
  const [minDebtFilter, setMinDebtFilter] = useState<number>(5000);
  const [caseStatusFilter, setCaseStatusFilter] = useState<'all' | 'open' | LegalCase['status']>('open');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Notices (local)
  const [notices, setNotices] = useState<LegalNotice[]>(() => {
    const saved = localStorage.getItem('tantawy_legal_notices');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (n) =>
              !String(n.id || '').startsWith('NOT-2026-001') &&
              !String(n.id || '').startsWith('NOT-2026-002') &&
              !String(n.customerName || '').includes('مكتبة ومستلزمات النجاح') &&
              !String(n.customerName || '').includes('شركة الإيمان للتوريدات')
          );
        }
      } catch {}
    }
    return [];
  });

  // Checks (local)
  const [checks, setChecks] = useState<GuaranteeCheck[]>(() => {
    const saved = localStorage.getItem('tantawy_legal_checks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (c) =>
              !['CHK-8921', 'CHK-5512', 'CHK-3319'].includes(String(c.id || '')) &&
              !String(c.customerName || '').includes('مكتبة ومستلزمات النجاح') &&
              !String(c.customerName || '').includes('شركة الإيمان للتوريدات') &&
              !String(c.customerName || '').includes('مؤسسة الشروق للأدوات')
          );
        }
      } catch {}
    }
    return [];
  });

  const saveNotices = (updated: LegalNotice[]) => {
    setNotices(updated);
    try { localStorage.setItem('tantawy_legal_notices', JSON.stringify(updated)); } catch {}
  };
  const saveChecks = (updated: GuaranteeCheck[]) => {
    setChecks(updated);
    try { localStorage.setItem('tantawy_legal_checks', JSON.stringify(updated)); } catch {}
  };

  const handleClearAllLegalMockData = () => {
    if (window.confirm('هل تريد مسح وتصفير الإنذارات والشيكات المحفوظة محليًا؟ (لا يحذف ملفات القضايا)')) {
      localStorage.removeItem('tantawy_legal_notices');
      localStorage.removeItem('tantawy_legal_checks');
      setNotices([]);
      setChecks([]);
    }
  };

  // Legal cases (source of truth)
  const [legalCases, setLegalCases] = useState<LegalCase[]>(() => getLegalCases());
  useEffect(() => {
    const unsub = subscribeToLegalCases((c) => setLegalCases(c || []));
    setLegalCases(getLegalCases());
    return unsub;
  }, []);

  // Privacy: legal advisor sees only referred customers in active sector
  const accessibleCustomers = useMemo(() => {
    if (activeSector === 'none') return [];
    const base = currentUser?.role === 'legal_advisor' ? customers : filterCustomersByRBAC(customers, currentUser, users);
    const sectorScoped = base.filter(
      (c) => c.sector === 'both' || c.sector === 'all' || (c.sector || inferCustomerSector(c, users)) === activeSector
    );
    const ids = new Set(legalCases.map((c) => c.customerId).filter(Boolean));
    const codes = new Set(legalCases.map((c) => c.customerCode).filter(Boolean));
    return sectorScoped.filter((c) => ids.has(c.id) || (!!c.code && codes.has(c.code as string)) || isCustomerReferredToLegal(c));
  }, [customers, currentUser, users, legalCases, activeSector]);

  // Modals / forms
  const [selectedCustomerForNotice, setSelectedCustomerForNotice] = useState<Customer | null>(null);
  const [noticeType, setNoticeType] = useState<LegalNotice['legalType']>('إنذار رسمي على يد محضر');
  const [noticeNotes, setNoticeNotes] = useState('');
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [viewingNotice, setViewingNotice] = useState<LegalNotice | null>(null);

  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [newCheckCustomer, setNewCheckCustomer] = useState('');
  const [newCheckCustomerId, setNewCheckCustomerId] = useState<string | null>(null);
  const [newCheckBank, setNewCheckBank] = useState('');
  const [newCheckNum, setNewCheckNum] = useState('');
  const [newCheckAmount, setNewCheckAmount] = useState<number>(0);
  const [newCheckDate, setNewCheckDate] = useState('');
  const [newCheckType, setNewCheckType] = useState<GuaranteeCheck['type']>('شيك بنكي');

  const [isFindingsModalOpen, setIsFindingsModalOpen] = useState(false);
  const [findingsCustomer, setFindingsCustomer] = useState<Customer | null>(null);
  const [findingsText, setFindingsText] = useState('');
  const [findingsStatus, setFindingsStatus] = useState<LegalCase['status']>('قيد المتابعة والتحقيق');
  const [findingsAction, setFindingsAction] = useState('إفادة استفسارية قانونية');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const flashMsg = (tone: 'ok' | 'err', text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 3500);
  };

  // Derived: cases visible (privacy-aligned)
  const visibleCases = useMemo(() => {
    const allowedIds = new Set(accessibleCustomers.map((c) => c.id));
    const allowedCodes = new Set(accessibleCustomers.map((c) => c.code).filter(Boolean) as string[]);
    return (legalCases || []).filter((c) => allowedIds.has(c.customerId) || (c.customerCode && allowedCodes.has(c.customerCode)));
  }, [legalCases, accessibleCustomers]);

  const filteredCases = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return visibleCases
      .filter((c) => {
        const open = c.status !== 'تم سداد كامل المديونية وإغلاق الملف';
        if (caseStatusFilter === 'open' && !open) return false;
        if (caseStatusFilter !== 'all' && caseStatusFilter !== 'open' && c.status !== caseStatusFilter) return false;
        if (selectedBranch !== 'الكل' && c.branchName !== selectedBranch) return false;
        if (q) {
          const hit = [c.customerName, c.customerCode, c.id, c.repName, c.branchName, c.phone, c.referralReason]
            .some((v) => String(v || '').toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0));
  }, [visibleCases, searchTerm, caseStatusFilter, selectedBranch]);

  useEffect(() => {
    if (selectedCaseId && !filteredCases.some((c) => c.id === selectedCaseId)) {
      setSelectedCaseId(filteredCases[0]?.id || null);
    }
    if (!selectedCaseId && filteredCases.length) setSelectedCaseId(filteredCases[0].id);
  }, [filteredCases, selectedCaseId]);

  const selectedCase = useMemo(() => filteredCases.find((c) => c.id === selectedCaseId) || visibleCases.find((c) => c.id === selectedCaseId) || null, [filteredCases, visibleCases, selectedCaseId]);

  // Delinquent customers (scoped)
  const delinquentCustomers = useMemo(() => {
    return accessibleCustomers
      .filter((c) => {
        const debt = c.currentBalance ?? c.balance ?? 0;
        const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
        if (debt < minDebtFilter && overdue < minDebtFilter) return false;
        if (selectedBranch !== 'الكل' && c.branchName !== selectedBranch) return false;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const matches = [c.name, c.code, c.phone, c.salesRepName, c.repName]
            .some((v) => String(v || '').toLowerCase().includes(q));
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => (b.currentBalance ?? b.balance ?? 0) - (a.currentBalance ?? a.balance ?? 0));
  }, [accessibleCustomers, minDebtFilter, selectedBranch, searchTerm]);

  const stats = useMemo(() => {
    let totalDelinquentDebt = 0;
    let highRiskCount = 0;
    accessibleCustomers.forEach((c) => {
      const debt = c.currentBalance ?? c.balance ?? 0;
      const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
      if (debt > 10000 || overdue > 5000) {
        totalDelinquentDebt += debt;
        highRiskCount++;
      }
    });
    const openCases = visibleCases.filter((c) => c.status !== 'تم سداد كامل المديونية وإغلاق الملف');
    const court = openCases.filter((c) => c.status === 'إجراء قضائي ومحضر').length;
    const totalCaseDebt = openCases.reduce((s, c) => s + (c.totalDebt || 0), 0);
    const bouncedChecks = checks.filter((c) => c.status === 'مرتد بدون رصيد').length;
    const pendingApproval = visibleCases.filter((c) => c.status === 'بانتظار اعتماد مدير الفرع').length;
    return {
      totalDelinquentDebt,
      highRiskCount,
      activeCourtCases: court,
      bouncedChecks,
      totalNotices: notices.length,
      totalChecks: checks.length,
      openCases: openCases.length,
      totalCaseDebt,
      pendingApproval,
    };
  }, [accessibleCustomers, notices, checks, visibleCases]);

  const handleCreateNotice = () => {
    if (!selectedCustomerForNotice) return;
    const debt = selectedCustomerForNotice.currentBalance ?? selectedCustomerForNotice.balance ?? 0;
    const today = todayIso();
    const deadline = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    const newN: LegalNotice = {
      id: `NOT-2026-${String(notices.length + 1).padStart(3, '0')}`,
      customerName: selectedCustomerForNotice.name,
      customerCode: selectedCustomerForNotice.code || 'N/A',
      branch: selectedCustomerForNotice.branchName || 'الفرع الرئيسي',
      repName: selectedCustomerForNotice.salesRepName || selectedCustomerForNotice.repName || 'المندوب',
      totalDebt: debt,
      issueDate: today,
      deadlineDate: deadline,
      status: 'تم الإرسال على يد محضر',
      legalType: noticeType,
      notes: noticeNotes || 'تم إصدار الإنذار القانوني الرسمي بعد استنفاد مهل السداد الودية.',
    };
    saveNotices([newN, ...notices]);
    setIsNoticeModalOpen(false);
    setSelectedCustomerForNotice(null);
    setNoticeNotes('');
    setViewingNotice(newN);
    flashMsg('ok', 'تم إصدار الإنذار وحفظه محليًا');
    recordAuditLog({
      userId: currentUser?.id || 'legal',
      userName: currentUser?.name || 'الشؤون القانونية',
      userRole: (currentUser?.role || 'legal_advisor') as any,
      branchName: currentUser?.branchName || newN.branch || '—',
      action: 'update_invoice_status' as any,
      actionTitle: 'إصدار إنذار/إجراء قانوني',
      details: `عميل: ${newN.customerName} (${newN.customerCode}) | نوع: ${newN.legalType} | مديونية: ${newN.totalDebt} | مهلة: ${newN.deadlineDate}`,
      badgeType: 'warning',
    } as any);
  };

  const handleAddCheck = () => {
    if (!newCheckCustomer || !newCheckNum || newCheckAmount <= 0) return;
    const newC: GuaranteeCheck = {
      id: `CHK-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: newCheckCustomer,
      bankName: newCheckBank || 'البنك الأهلي المصري',
      checkNumber: newCheckNum,
      amount: newCheckAmount,
      dueDate: newCheckDate || todayIso(),
      type: newCheckType,
      status: 'ساري ومودع بالخزينة',
    };
    saveChecks([newC, ...checks]);
    setIsCheckModalOpen(false);
    setNewCheckCustomer('');
    setNewCheckCustomerId(null);
    setNewCheckBank('');
    setNewCheckNum('');
    setNewCheckAmount(0);
    flashMsg('ok', 'تم تسجيل الضمانة بالخزينة');
    recordAuditLog({
      userId: currentUser?.id || 'legal',
      userName: currentUser?.name || 'الشؤون القانونية',
      userRole: (currentUser?.role || 'legal_advisor') as any,
      branchName: currentUser?.branchName || '—',
      action: 'update_user' as any,
      actionTitle: 'تسجيل ضمانة/شيك قانوني',
      details: `عميل: ${newC.customerName} | نوع: ${newC.type} | رقم: ${newC.checkNumber} | مبلغ: ${newC.amount} | استحقاق: ${newC.dueDate}`,
      badgeType: 'warning',
    } as any);
  };

  const handleSaveLegalFindings = () => {
    if (!findingsCustomer) return;
    const legalCase = getLegalCaseForCustomer(findingsCustomer);
    if (!legalCase) {
      alert('لا يوجد ملف قانوني مسجل لهذا العميل — يجب إحالة العميل للشؤون القانونية أولاً.');
      return;
    }
    const res = addLegalStatement(
      legalCase.id,
      findingsText,
      currentUser?.name || currentUser?.username || 'المستشار القانوني',
      currentUser?.role || 'legal_advisor',
      findingsStatus,
      findingsAction
    );
    if (res.success) {
      setLegalCases(getLegalCases());
      setIsFindingsModalOpen(false);
      setFindingsCustomer(null);
      setFindingsText('');
      setFindingsStatus('قيد المتابعة والتحقيق');
      setFindingsAction('إفادة استفسارية قانونية');
      flashMsg('ok', res.message || 'تم حفظ الإفادة وتحديث الملف');
      recordAuditLog({
        userId: currentUser?.id || 'legal',
        userName: currentUser?.name || 'الشؤون القانونية',
        userRole: (currentUser?.role || 'legal_advisor') as any,
        branchName: currentUser?.branchName || findingsCustomer.branchName || '—',
        action: 'update_visit_status' as any,
        actionTitle: 'تسجيل إفادة/إجراء على ملف قانوني',
        details: `عميل: ${findingsCustomer.name} | إجراء: ${findingsAction} | حالة: ${findingsStatus} | نص: ${findingsText.trim().slice(0, 120)}`,
        badgeType: 'info',
      } as any);
    } else {
      flashMsg('err', res.message || 'تعذر الحفظ');
    }
  };

  const openFindings = (customer: Customer) => {
    setFindingsCustomer(customer);
    setFindingsText('');
    setFindingsStatus('قيد المتابعة والتحقيق');
    setFindingsAction('إفادة استفسارية قانونية');
    setIsFindingsModalOpen(true);
  };

  const StatusPill: React.FC<{ status: LegalCase['status'] }> = ({ status }) => {
    const m = CASE_STATUS_META[status] || { cls: '', tone: 'muted' };
    return <span className={`lg-st lg-st--${m.tone}`}>{status}</span>;
  };

  return (
    <div dir="rtl" className="lg-page space-y-4 animate-in fade-in duration-200 pb-10">
      {flash && (
        <div className={`lg-flash fixed top-4 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-xl text-sm font-extrabold ${flash.tone === 'ok' ? 'lg-flash--ok' : 'lg-flash--err'}`}>
          {flash.text}
        </div>
      )}

      {/* Hero */}
      <section className="lg-hd relative overflow-hidden rounded-3xl text-white">
        <div className="relative p-5 sm:p-7 flex flex-col xl:flex-row xl:items-end justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[11px] font-extrabold text-[#e8c98c] bg-white/10 border border-white/15 rounded-lg px-2.5 py-1">
              <Scale size={14} /> الشؤون القانونية والتحصيل القضائي · غرفة عمليات احترافية
            </div>
            <h1 className="text-2xl sm:text-[30px] font-black tracking-tight">مركز القيادة القانونية</h1>
            <p className="text-sm text-blue-100/90 leading-relaxed">
              متابعة ملفات العملاء المحالة، الإفادات والإجراءات، الإنذارات والضمانات، ومسار التحصيل/التسوية/التقاضي — بخصوصية تامة لملفات الشؤون القانونية.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5"><Briefcase size={13}/> ملفات مفتوحة: <b className="text-white">{stats.openCases}</b></span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-rose-500/20 border border-rose-300/30 rounded-lg px-2.5 py-1.5"><Gavel size={13}/> إجراء قضائي: <b className="text-white">{stats.activeCourtCases}</b></span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-amber-500/20 border border-amber-300/30 rounded-lg px-2.5 py-1.5"><Clock3 size={13}/> بانتظار اعتماد الفرع: <b className="text-white">{stats.pendingApproval}</b></span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-white/10 border border-white/15 rounded-2xl p-3 sm:p-4">
            <div className="text-center px-2"><div className="text-[11px] text-blue-200 font-bold">ديون الملفات المفتوحة</div><div className="text-xl font-black text-[#f3d59a]">{fmt(stats.totalCaseDebt)}</div></div>
            <div className="w-px h-10 bg-white/20 hidden sm:block" />
            <div className="text-center px-2"><div className="text-[11px] text-blue-200 font-bold">شيكات مرتدة</div><div className="text-xl font-black">{stats.bouncedChecks}</div></div>
            <div className="w-px h-10 bg-white/20 hidden sm:block" />
            <div className="flex gap-2">
              <button onClick={() => setIsCheckModalOpen(true)} className="lg-btn lg-btn--gold inline-flex items-center gap-1.5 h-10 px-3 rounded-xl font-black text-xs">
                <Plus size={15}/> ضمانة/شيك
              </button>
              <button onClick={handleClearAllLegalMockData} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-rose-200 font-bold text-xs transition" title="مسح الإنذارات والشيكات المحلية">
                <Trash2 size={14}/> تصفير محلي
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="lg-kpi lg-kpi--indigo">
          <div className="flex items-center justify-between text-xs font-bold lg-kpi__l"><span>ملفات قانونية مفتوحة</span><span className="lg-kpi__ic"><Briefcase size={16}/></span></div>
          <div className="lg-kpi__v mt-2 text-2xl font-black">{stats.openCases} <span className="text-xs font-bold text-slate-400">ملف</span></div>
          <div className="text-[11px] font-bold text-indigo-700 mt-1">قيمة: {fmt(stats.totalCaseDebt)}</div>
        </div>
        <div className="lg-kpi lg-kpi--rose">
          <div className="flex items-center justify-between text-xs font-bold lg-kpi__l"><span>عملاء/مخاطر ضمن النطاق</span><span className="lg-kpi__ic"><AlertTriangle size={16}/></span></div>
          <div className="lg-kpi__v mt-2 text-2xl font-black">{stats.highRiskCount} <span className="text-xs font-bold text-slate-400">عميل</span></div>
          <div className="text-[11px] font-bold text-rose-700 mt-1">ديون مرصودة: {fmt(stats.totalDelinquentDebt)}</div>
        </div>
        <div className="lg-kpi lg-kpi--green">
          <div className="flex items-center justify-between text-xs font-bold lg-kpi__l"><span>محفظة الضمانات</span><span className="lg-kpi__ic"><FileCheck size={16}/></span></div>
          <div className="lg-kpi__v mt-2 text-2xl font-black">{stats.totalChecks} <span className="text-xs font-bold text-slate-400">ضمانة</span></div>
          <div className="text-[11px] font-bold text-amber-700 mt-1">{stats.bouncedChecks} مرتد/قيد تحصيل</div>
        </div>
        <div className="lg-kpi lg-kpi--amber">
          <div className="flex items-center justify-between text-xs font-bold lg-kpi__l"><span>الإنذارات والإجراءات</span><span className="lg-kpi__ic"><FileText size={16}/></span></div>
          <div className="lg-kpi__v mt-2 text-2xl font-black">{stats.totalNotices} <span className="text-xs font-bold text-slate-400">إنذار</span></div>
          <div className="text-[11px] font-bold text-slate-600 mt-1">سجل محلي قابل للطباعة</div>
        </div>
      </section>

      {/* Controls + Tabs */}
      <section className="lg-panel p-3 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ['cases', 'ملفات القضايا', Briefcase],
              ['delinquents', 'المتعثرون ضمن النطاق', ShieldAlert],
              ['notices', 'الإنذارات', FileText],
              ['checks', 'الشيكات والضمانات', FileCheck],
              ['templates', 'النماذج والصيغ', FolderOpen],
            ] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`lg-tab lg-tab--${k} ${activeTab === k ? 'is-on' : ''} inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black`}>
                <Icon size={15} className="lg-tab__ic" /> {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="lg-search-ic absolute right-3 top-1/2 -translate-y-1/2" />
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="بحث (عميل/كود/ملف/مندوب)..."
                className="lg-input h-10 pr-9 pl-3 rounded-xl text-xs font-bold w-60" />
            </div>
            <select aria-label="الفرع" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="lg-input h-10 px-3 rounded-xl text-xs font-bold">
              <option value="الكل">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            {canManageSectorGate && (
              <div className="lg-seg inline-flex items-center rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSectorFilter('home')}
                  className={`lg-seg__b lg-seg__b--home ${activeSectorFilter === 'home' ? 'is-on' : ''} px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer`}
                >
                  🏠 منزلي
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectorFilter('electrical')}
                  className={`lg-seg__b lg-seg__b--elec ${activeSectorFilter === 'electrical' ? 'is-on' : ''} px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer`}
                >
                  ⚡ كهرباء
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CASES TAB */}
        {activeTab === 'cases' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-600 inline-flex items-center gap-1.5"><Filter size={14}/> حالة الملف:</span>
              {([
                ['open', 'مفتوحة'],
                ['all', 'الكل'],
                ['بانتظار اعتماد مدير الفرع', 'بانتظار اعتماد الفرع'],
                ['إجراء قضائي ومحضر', 'قضائي/محضر'],
                ['جدولة المديونية', 'جدولة'],
                ['تم سداد كامل المديونية وإغلاق الملف', 'مغلقة'],
              ] as const).map(([v, l]) => (
                <button key={v} onClick={() => setCaseStatusFilter(v as any)} className={`lg-pill ${caseStatusFilter === v ? 'is-on' : ''} px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold`}>{l}</button>
              ))}
              <span className="mr-auto text-[11px] font-bold text-slate-500">{filteredCases.length} ملف</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-3">
              <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                {filteredCases.length === 0 && (
                  <div className="lg-empty p-8 text-center rounded-2xl font-bold">لا توجد ملفات قانونية مطابقة ضمن نطاق الصلاحية.</div>
                )}
                {filteredCases.map((c) => {
                  const active = selectedCaseId === c.id;
                  return (
                    <button key={c.id} onClick={() => setSelectedCaseId(c.id)} data-tone={CASE_STATUS_META[c.status]?.tone || 'muted'} className={`lg-case ${active ? 'is-on' : ''} w-full text-right p-3.5`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg leading-none">{c.transferIcon || '⚖️'}</span>
                            <span className="font-black text-slate-900 text-sm truncate">{c.customerName}</span>
                            <span className="font-mono text-[10px] text-slate-400">{c.id}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-bold mt-0.5">كود: {c.customerCode} · {c.branchName} · المندوب: {c.repName}</div>
                        </div>
                        <StatusPill status={c.status} />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div className="lg-mini lg-mini--debt px-2 py-1.5"><div className="lg-mini__l font-bold">إجمالي الدين</div><div className="lg-mini__v font-black tabular-nums">{fmt(c.totalDebt)}</div></div>
                        <div className="lg-mini lg-mini--late px-2 py-1.5"><div className="lg-mini__l font-bold">متأخر</div><div className="lg-mini__v font-black tabular-nums">{fmt(c.overdueAmount)}</div></div>
                        <div className="lg-mini lg-mini--guar px-2 py-1.5"><div className="lg-mini__l font-bold">ضمان</div><div className="lg-mini__v font-black truncate">{c.guaranteeType || '—'}</div></div>
                      </div>
                      {c.latestLegalStatement && <div className="mt-2 text-[11px] font-bold text-slate-600 line-clamp-2 lg-note rounded-lg px-2.5 py-2">آخر إفادة: {c.latestLegalStatement}</div>}
                    </button>
                  );
                })}
              </div>

              {/* Case detail */}
              <div className="lg-detail p-4 min-h-[420px]">
                {!selectedCase ? (
                  <div className="h-full flex items-center justify-center text-slate-400 font-bold">اختر ملفًا لعرض التفاصيل</div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2"><span className="text-xl">{selectedCase.transferIcon || '⚖️'}</span><h3 className="font-black text-slate-900 text-base">{selectedCase.customerName}</h3></div>
                        <div className="text-[11px] text-slate-500 font-bold mt-0.5">{selectedCase.id} · كود {selectedCase.customerCode} · {selectedCase.phone}</div>
                      </div>
                      <StatusPill status={selectedCase.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="lg-box rounded-xl p-2.5"><div className="text-slate-500 font-bold text-[11px]">إجمالي/متأخر</div><div className="font-black text-rose-700 tabular-nums">{fmt(selectedCase.totalDebt)} / {fmt(selectedCase.overdueAmount)}</div></div>
                      <div className="lg-box rounded-xl p-2.5"><div className="text-slate-500 font-bold text-[11px]">الفرع/المندوب</div><div className="font-black text-slate-800">{selectedCase.branchName} · {selectedCase.repName}</div></div>
                      <div className="lg-box rounded-xl p-2.5 col-span-2"><div className="text-slate-500 font-bold text-[11px]">سبب الإحالة</div><div className="font-bold text-slate-800 leading-relaxed">{selectedCase.referralReason}</div><div className="text-[10px] text-slate-500 mt-1">بواسطة: {selectedCase.referredByName} · {selectedCase.referredAt}</div></div>
                      <div className="lg-box rounded-xl p-2.5 col-span-2"><div className="text-slate-500 font-bold text-[11px]">الضمان</div><div className="font-bold text-slate-800">{selectedCase.guaranteeType || '—'} {selectedCase.guaranteeAmount ? `· ${fmt(selectedCase.guaranteeAmount)}` : ''}</div></div>
                      <div className="lg-box rounded-xl p-2.5 col-span-2 flex items-center gap-2">
                        {selectedCase.branchManagerApproved ? <><ShieldCheck size={15} className="text-emerald-600"/><span className="text-[11px] font-bold text-emerald-800">معتمد من مدير الفرع: {selectedCase.branchManagerApprovedBy || '—'} ({selectedCase.branchManagerApprovedAt || ''})</span></> : <><Clock3 size={15} className="text-amber-600"/><span className="text-[11px] font-bold text-amber-800">بانتظار اعتماد مدير الفرع</span></>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => {
                        const cust = accessibleCustomers.find((x) => x.id === selectedCase.customerId) || customers.find((x) => x.id === selectedCase.customerId);
                        if (cust) { setSelectedCustomerForNotice(cust); setIsNoticeModalOpen(true); }
                        else flashMsg('err', 'تعذر العثور على بيانات العميل لإصدار الإنذار');
                      }} className="lg-btn lg-btn--pri inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black"><Printer size={14}/> إصدار إنذار</button>
                      <button onClick={() => {
                        const cust = accessibleCustomers.find((x) => x.id === selectedCase.customerId) || customers.find((x) => x.id === selectedCase.customerId);
                        if (cust) openFindings(cust); else flashMsg('err', 'تعذر العثور على العميل');
                      }} className="lg-btn lg-btn--gold inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black"><FileCheck size={14}/> تسجيل إفادة/إجراء</button>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-xs font-black text-slate-800 mb-2"><History size={14}/> سجل الإفادات والإجراءات ({selectedCase.statementsHistory?.length || 0})</div>
                      <div className="space-y-2 max-h-56 overflow-auto pr-1">
                        {(selectedCase.statementsHistory || []).slice().reverse().map((s) => (
                          <div key={s.id} className="lg-box rounded-xl p-2.5">
                            <div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-black text-slate-800">{s.authorName} <span className="text-slate-400 font-bold">({s.authorRole})</span></span><span className="font-mono text-slate-400">{s.date}</span></div>
                            <div className="text-xs font-bold text-slate-700 mt-1 leading-relaxed">{s.statement}</div>
                            {s.actionTaken && <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-extrabold text-[var(--app-text)] bg-blue-50 border border-blue-100 rounded-md px-2 py-0.5"><BadgeCheck size={11}/> {s.actionTaken}</div>}
                          </div>
                        ))}
                        {(!selectedCase.statementsHistory || selectedCase.statementsHistory.length === 0) && <div className="text-xs text-slate-400 font-bold">لا توجد إفادات مسجلة بعد.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DELINQUENTS TAB */}
        {activeTab === 'delinquents' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-600">حد المديونية:</span>
              <select aria-label="حد المديونية" value={minDebtFilter} onChange={(e) => setMinDebtFilter(Number(e.target.value))} className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold">
                <option value={0}>الكل</option>
                <option value={5000}>≥ 5,000 ج</option>
                <option value={15000}>≥ 15,000 ج</option>
                <option value={30000}>≥ 30,000 ج (حرج)</option>
              </select>
              <span className="text-[11px] font-bold text-slate-500 mr-auto">يُعرض فقط العملاء ضمن نطاق الشؤون القانونية/الصلاحية</span>
            </div>
            <div className="lg-tablewrap overflow-x-auto rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="lg-thead font-black">
                  <tr><th className="p-3">العميل</th><th className="p-3">الفرع/المندوب</th><th className="p-3">إجمالي</th><th className="p-3">متأخر/مستحق</th><th className="p-3">السقف</th><th className="p-3">ملف قانوني</th><th className="p-3">إجراء</th></tr>
                </thead>
                <tbody className="lg-tbody">
                  {delinquentCustomers.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">لا يوجد عملاء مطابقون.</td></tr>
                  ) : delinquentCustomers.slice(0, 60).map((c) => {
                    const debt = c.currentBalance ?? c.balance ?? 0;
                    const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
                    const limit = c.creditLimit || 0;
                    const exceeded = limit > 0 && debt > limit;
                    const lc = getLegalCaseForCustomer(c);
                    return (
                      <tr key={c.id} className="lg-tr">
                        <td className="p-3"><div className="font-black text-slate-900">{c.name}</div><div className="text-[11px] text-slate-400 font-mono">كود: {c.code || c.id} · {c.phone || '—'}</div></td>
                        <td className="p-3"><div className="font-bold text-slate-700">{c.branchName || '—'}</div><div className="text-[11px] text-slate-500">{c.salesRepName || c.repName || 'غير مسند'}</div></td>
                        <td className="p-3 font-black tabular-nums text-slate-900">{fmt(debt)}</td>
                        <td className="p-3 font-black tabular-nums text-rose-700">{fmt(overdue)}</td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${exceeded ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{limit > 0 ? fmt(limit) : 'بدون سقف'}</span></td>
                        <td className="p-3">{lc ? <StatusPill status={lc.status} /> : <span className="text-[11px] font-bold text-slate-400">لا يوجد</span>}</td>
                        <td className="p-3"><div className="flex flex-wrap gap-1.5">
                          <button onClick={() => { setSelectedCustomerForNotice(c); setIsNoticeModalOpen(true); }} className="lg-btn lg-btn--pri inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black"><Scale size={13}/> إنذار</button>
                          <button onClick={() => openFindings(c)} className="lg-btn lg-btn--soft inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black"><FileCheck size={13}/> إفادة</button>
                          {lc && <button onClick={() => { setActiveTab('cases'); setSelectedCaseId(lc.id); }} className="lg-btn lg-btn--ghost inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black"><Eye size={13}/> الملف</button>}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* NOTICES TAB */}
        {activeTab === 'notices' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-black text-slate-900 text-sm">سجل الإنذارات الرسمية ({notices.length})</h3><span className="text-[11px] font-bold text-slate-500">محفوظ محليًا وقابل للطباعة</span></div>
            {notices.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60"><FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" /><div className="font-bold text-slate-700 text-sm">لا توجد إنذارات مسجلة</div><div className="text-xs text-slate-500 mt-1">أصدر إنذارًا من تبويب الملفات أو المتعثرين.</div></div>
            ) : (
              <div className="lg-tablewrap overflow-x-auto rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="lg-thead font-black"><tr><th className="p-3">الرقم</th><th className="p-3">العميل</th><th className="p-3">النوع</th><th className="p-3">المبلغ</th><th className="p-3">الإصدار/المهلة</th><th className="p-3">الحالة</th><th className="p-3">عرض</th></tr></thead>
                  <tbody className="lg-tbody">
                    {notices.map((n) => (
                      <tr key={n.id} className="lg-tr">
                        <td className="p-3 font-mono font-bold text-slate-900">{n.id}</td>
                        <td className="p-3 font-black text-slate-900">{n.customerName}<div className="text-[10px] text-slate-400 font-bold">{n.branch} · {n.repName}</div></td>
                        <td className="p-3"><span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-extrabold">{n.legalType}</span></td>
                        <td className="p-3 font-black text-rose-700 tabular-nums">{fmt(n.totalDebt)}</td>
                        <td className="p-3 text-[11px] font-bold text-slate-600"><div>إصدار: {n.issueDate}</div><div className="text-rose-700">مهلة: {n.deadlineDate}</div></td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${n.status === 'مرفوع دعوى قضائية' ? 'bg-rose-100 text-rose-800' : n.status === 'تم الإرسال على يد محضر' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{n.status}</span></td>
                        <td className="p-3"><button onClick={() => setViewingNotice(n)} className="lg-btn lg-btn--ghost inline-flex items-center gap-1 font-extrabold px-2.5 py-1.5 rounded-lg"><Printer size={13}/> طباعة</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CHECKS TAB */}
        {activeTab === 'checks' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-black text-slate-900 text-sm">محفظة الشيكات والضمانات ({checks.length})</h3><button onClick={() => setIsCheckModalOpen(true)} className="lg-btn lg-btn--pri inline-flex items-center gap-1.5 font-black px-3.5 py-2 rounded-xl text-xs"><Plus size={14}/> إضافة ضمانة</button></div>
            {checks.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60"><FileCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" /><div className="font-bold text-slate-700 text-sm">لا توجد ضمانات مسجلة</div></div>
            ) : (
              <div className="lg-tablewrap overflow-x-auto rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="lg-thead font-black"><tr><th className="p-3">النوع</th><th className="p-3">العميل</th><th className="p-3">البنك/الرقم</th><th className="p-3">القيمة</th><th className="p-3">الاستحقاق</th><th className="p-3">الحالة</th></tr></thead>
                  <tbody className="lg-tbody">
                    {checks.map((c) => (
                      <tr key={c.id} className="lg-tr">
                        <td className="p-3"><span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-extrabold text-[11px]">{c.type}</span></td>
                        <td className="p-3 font-black text-slate-900">{c.customerName}</td>
                        <td className="p-3"><div className="font-bold text-slate-700">{c.bankName}</div><div className="text-[11px] text-slate-400 font-mono">#{c.checkNumber}</div></td>
                        <td className="p-3 font-black text-slate-900 tabular-nums">{fmt(c.amount)}</td>
                        <td className="p-3 font-bold text-slate-700 tabular-nums">{c.dueDate}</td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${c.status === 'مرتد بدون رصيد' ? 'bg-rose-100 text-rose-800' : c.status === 'قيد التحصيل القضائي' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TEMPLATES TAB */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="lg-tpl lg-tpl--amber p-5 space-y-3">
              <div className="flex items-center gap-3"><div className="lg-tpl__ic"><FileText size={20}/></div><div><h4 className="font-black text-slate-900 text-sm">إنذار رسمي (تكليف بالوفاء)</h4><p className="text-[11px] text-slate-500">صيغة جاهزة للطباعة مع مهلة محددة</p></div></div>
              <p className="text-xs text-slate-600 leading-relaxed">إنذار موجه للعميل لسداد المديونية خلال مهلة محددة تمهيدًا للإجراءات النظامية (أمر أداء/مطالبة) عند عدم السداد أو التسوية.</p>
              <button onClick={() => { const c = accessibleCustomers[0] || customers[0]; if (c) { setSelectedCustomerForNotice(c); setIsNoticeModalOpen(true); } }} className="lg-btn lg-btn--pri inline-flex items-center gap-1.5 font-black px-4 py-2.5 rounded-xl text-xs"><Printer size={14}/> توليد ومعاينة إنذار</button>
            </div>
            <div className="lg-tpl lg-tpl--blue p-5 space-y-3">
              <div className="flex items-center gap-3"><div className="lg-tpl__ic"><FileCheck size={20}/></div><div><h4 className="font-black text-slate-900 text-sm">إقرار تسوية/جدولة مديونية</h4><p className="text-[11px] text-slate-500">توثيق اتفاق السداد والضمانات</p></div></div>
              <p className="text-xs text-slate-600 leading-relaxed">نموذج إقرار دين وجدولة أقساط مع توثيق الضمانات (شيكات/إيصالات أمانة) وشروط الالتزام — يُسجَّل أثره كإفادة/حالة ملف.</p>
              <button onClick={() => { if (selectedCase) { const cust = accessibleCustomers.find(x=>x.id===selectedCase.customerId) || customers.find(x=>x.id===selectedCase.customerId); if (cust) openFindings(cust); else flashMsg('err','اختر ملفًا مرتبطًا بعميل'); } else { flashMsg('err','اختر ملف قضية أولًا لتسجيل التسوية/الجدولة'); } }} className="lg-btn lg-btn--pri inline-flex items-center gap-1.5 font-black px-4 py-2.5 rounded-xl text-xs"><FileCheck size={14}/> تسجيل تسوية/جدولة على ملف</button>
            </div>
            <div className="md:col-span-2 lg-tpl lg-tpl--navy p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3"><div className="lg-tpl__ic"><ShieldAlert size={18}/></div><div><div className="font-black text-slate-900 text-sm">مبدأ التشغيل الاحترافي</div><div className="text-xs font-bold text-slate-600 mt-0.5">كل إجراء (إنذار، إفادة، جدولة، تصعيد قضائي) يُوثَّق على الملف مع الوقت والمسؤول والحالة — لضمان مسار قانوني واضح وقابل للمراجعة.</div></div></div>
              <div className="text-[11px] font-extrabold lg-chipnote rounded-xl px-3 py-2">سرية البيانات: المستشار القانوني يطّلع على الملفات المحالة فقط</div>
            </div>
          </div>
        )}
      </section>

      {/* Findings Modal */}
      {isFindingsModalOpen && findingsCustomer && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) setIsFindingsModalOpen(false); }}>
          <div className="lg-modal rounded-3xl max-w-full sm:max-w-lg w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl lg-btn--pri flex items-center justify-center"><FileCheck size={18}/></div><div><h3 className="font-black text-slate-900 text-sm sm:text-base">تسجيل إفادة/إجراء قانوني</h3><p className="text-[11px] text-slate-500">{findingsCustomer.name}</p></div></div>
              <button onClick={() => setIsFindingsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={18}/></button>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs"><div><span className="text-slate-500 block">إجمالي المديونية</span><span className="font-black text-base text-rose-700 tabular-nums">{fmt(findingsCustomer.currentBalance ?? findingsCustomer.balance ?? 0)}</span></div><div className="text-left"><span className="text-slate-500 block">الفرع/المندوب</span><span className="font-bold text-slate-800">{findingsCustomer.branchName || '—'} · {findingsCustomer.salesRepName || findingsCustomer.repName || '—'}</span></div></div>
            <div className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 mb-1 block">نص الإفادة/التوصية</label><textarea value={findingsText} onChange={(e) => setFindingsText(e.target.value)} placeholder="سجّل ما تم (تواصل، إنذار، محضر، اتفاق، تحصيل، تعذر...) والتوصية التالية..." className="w-full min-h-[110px] p-3 rounded-xl border border-slate-200 font-bold text-slate-800 bg-white resize-none focus:outline-none focus:border-[#102b4e]" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="font-bold text-slate-700 mb-1 block">حالة الملف بعد الإجراء</label><select value={findingsStatus} onChange={(e) => setFindingsStatus(e.target.value as LegalCase['status'])} className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800 bg-white">{(Object.keys(CASE_STATUS_META) as LegalCase['status'][]).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="font-bold text-slate-700 mb-1 block">نوع الإجراء</label><select value={findingsAction} onChange={(e) => setFindingsAction(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800 bg-white"><option>إفادة استفسارية قانونية</option><option>إنذار رسمي على يد محضر</option><option>أمر أداء تجاري</option><option>جنحة شيك بدون رصيد</option><option>إقرار دين وجدولة</option><option>تسوية ودية</option><option>تحصيل جزئي/كلي</option><option>إجراء قضائي قيد المتابعة</option></select></div>
              </div>
              <div className="flex items-center gap-2 pt-1"><button type="button" onClick={handleSaveLegalFindings} className="lg-btn lg-btn--pri flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl font-black"><CheckCircle2 size={16}/> حفظ وتحديث الملف</button><button type="button" onClick={() => setIsFindingsModalOpen(false)} className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 font-black">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Create Notice Modal */}
      {isNoticeModalOpen && selectedCustomerForNotice && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) setIsNoticeModalOpen(false); }}>
          <div className="lg-modal rounded-3xl max-w-full sm:max-w-lg w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200"><div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl lg-btn--pri flex items-center justify-center"><Scale size={18}/></div><div><h3 className="font-black text-slate-900 text-sm sm:text-base">إصدار إنذار/إجراء رسمي</h3><p className="text-[11px] text-slate-500">{selectedCustomerForNotice.name}</p></div></div><button onClick={() => setIsNoticeModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={18}/></button></div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs"><div><span className="text-slate-500 block">إجمالي المديونية</span><span className="font-black text-base text-rose-700 tabular-nums">{fmt(selectedCustomerForNotice.currentBalance ?? selectedCustomerForNotice.balance ?? 0)}</span></div><div className="text-left"><span className="text-slate-500 block">الفرع</span><span className="font-bold text-slate-800">{selectedCustomerForNotice.branchName || 'الفرع الرئيسي'}</span></div></div>
            <div className="space-y-3 text-xs">
              <div><label className="font-bold text-slate-700 mb-1 block">نوع الإجراء</label><select value={noticeType} onChange={(e) => setNoticeType(e.target.value as any)} className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800 bg-white"><option value="إنذار رسمي على يد محضر">إنذار رسمي على يد محضر (تكليف بالوفاء)</option><option value="أمر أداء تجاري">أمر أداء تجاري</option><option value="جنحة شيك بدون رصيد">جنحة شيك بدون رصيد</option><option value="إقرار دين وجدولة">إقرار دين وجدولة</option></select></div>
              <div><label className="font-bold text-slate-700 mb-1 block">ملاحظات وسند المطالبة</label><textarea value={noticeNotes} onChange={(e) => setNoticeNotes(e.target.value)} placeholder="تفاصيل الفواتير/الضمانات/شروط التسوية..." className="w-full h-24 p-3 rounded-xl border border-slate-200 font-medium text-slate-800 resize-none focus:outline-none focus:border-[#102b4e]" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200"><button onClick={() => setIsNoticeModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">إلغاء</button><button onClick={handleCreateNotice} className="lg-btn lg-btn--pri font-black px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5"><Printer size={14}/> إصدار ومعاينة</button></div>
          </div>
        </div>
      )}

      {/* View/Print Notice */}
      {viewingNotice && (
        <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setViewingNotice(null); }}>
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3"><img src="/tantawy-brand-logo.svg" alt="Tantawy" className="w-12 h-12 object-contain" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display='none';}}/><div><h2 className="font-black text-slate-900 text-lg">مجموعة الطنطاوي للتجارة والتوزيع</h2><p className="text-xs text-amber-700 font-black">الإدارة القانونية والشؤون القضائية</p></div></div>
              <div className="flex items-center gap-2 print:hidden"><button onClick={() => window.print()} className="bg-[#102b4e] text-[#e8c98c] font-black px-3.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1"><Printer size={13}/> طباعة</button><button onClick={() => setViewingNotice(null)} className="text-slate-400 hover:text-slate-700 p-1"><X size={18}/></button></div>
            </div>
            <div className="space-y-4 text-xs text-slate-800 leading-relaxed border-2 border-slate-200 p-5 rounded-2xl bg-[#fbfcfe]">
              <div className="text-center font-black text-base text-[var(--app-text)] pb-2 border-b border-slate-200">{viewingNotice.legalType}</div>
              <div className="grid grid-cols-2 gap-2 text-slate-700 font-bold"><div><span className="text-slate-500">رقم الإجراء:</span> {viewingNotice.id}</div><div><span className="text-slate-500">تاريخ التحرير:</span> {viewingNotice.issueDate}</div><div><span className="text-slate-500">الموجه إليه:</span> {viewingNotice.customerName}</div><div><span className="text-slate-500">الفرع:</span> {viewingNotice.branch}</div></div>
              <p>بناءً على المستحقات والفواتير/Aذون الاستلام المعتمدة، وحيث إنه ترصد بذمتكم المالية لصالح الشركة مبلغًا قدره:</p>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-center"><span className="text-base font-black text-rose-700 tabular-nums">{fmt(viewingNotice.totalDebt)} جنيه مصري</span></div>
              <p>نحيطكم علمًا بضرورة السداد أو التقدم بتسوية معتمدة في موعد أقصاه: <b className="text-rose-700">{viewingNotice.deadlineDate}</b>. وفي حال عدم السداد دون عذر مقبول، تحتفظ الشركة بحقها في اتخاذ الإجراءات النظامية والقانونية اللازمة وفقًا للمستندات والضمانات.</p>
              {viewingNotice.notes && <div className="text-[11px] text-slate-600 border-t border-slate-200 pt-2"><b>ملاحظات/سند المطالبة:</b> {viewingNotice.notes}</div>}
              <div className="pt-6 flex justify-between items-end text-center"><div><div className="font-bold text-slate-500 text-[11px]">مندوب/محاسب الفرع</div><div className="font-black text-slate-800 mt-4">{viewingNotice.repName}</div></div><div><div className="font-bold text-slate-500 text-[11px]">الإدارة القانونية</div><div className="font-black text-[var(--app-text)] mt-4">{currentUser?.name || 'المستشار القانوني'}</div><div className="text-[10px] text-amber-700 font-bold">ختم واعتماد الشؤون القانونية</div></div></div>
            </div>
          </div>
        </div>
      )}

      {/* Add Check Modal */}
      {isCheckModalOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) setIsCheckModalOpen(false); }}>
          <div className="lg-modal rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200"><h3 className="font-black text-slate-900 text-sm">تسجيل شيك/إيصال أمانة/سند</h3><button onClick={() => setIsCheckModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1"><X size={18}/></button></div>
            <div className="space-y-3 text-xs">
              <CustomerSearchSelect
                label="العميل / الساحب"
                customers={accessibleCustomers}
                valueId={newCheckCustomerId}
                onSelect={(c) => { setNewCheckCustomerId(c.id); setNewCheckCustomer(c.name); }}
                onClear={() => { setNewCheckCustomerId(null); setNewCheckCustomer(''); }}
                placeholder="ابحث واختر العميل المرتبط بالضمانة..."
                compact
                maxResults={30}
              />
              {!newCheckCustomerId && <input type="text" value={newCheckCustomer} onChange={(e) => setNewCheckCustomer(e.target.value)} placeholder="أو اكتب اسم العميل يدويًا" className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800" />}
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 mb-1 block">نوع الضمانة</label><select value={newCheckType} onChange={(e) => setNewCheckType(e.target.value as any)} className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800"><option value="شيك بنكي">شيك بنكي</option><option value="إيصال أمانة">إيصال أمانة</option><option value="سند إذني">سند إذني</option></select></div>
                <div><label className="font-bold text-slate-700 mb-1 block">البنك/الجهة</label><input type="text" value={newCheckBank} onChange={(e) => setNewCheckBank(e.target.value)} placeholder="البنك..." className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-slate-700 mb-1 block">رقم الشيك/الإيصال</label><input type="text" value={newCheckNum} onChange={(e) => setNewCheckNum(e.target.value)} placeholder="رقم" className="w-full h-10 px-3 rounded-xl border border-slate-200 font-mono font-bold text-slate-800" /></div>
                <div><label className="font-bold text-slate-700 mb-1 block">المبلغ (ج.م)</label><input type="number" value={newCheckAmount || ''} onChange={(e) => setNewCheckAmount(Number(e.target.value))} placeholder="0" className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800" /></div>
              </div>
              <div><label className="font-bold text-slate-700 mb-1 block">تاريخ الاستحقاق</label><input type="date" value={newCheckDate} onChange={(e) => setNewCheckDate(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-slate-200 font-bold text-slate-800" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200"><button onClick={() => setIsCheckModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">إلغاء</button><button onClick={handleAddCheck} className="lg-btn lg-btn--pri font-black px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5"><CheckCircle2 size={14}/> حفظ الضمانة</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalAdvisorDashboard;
