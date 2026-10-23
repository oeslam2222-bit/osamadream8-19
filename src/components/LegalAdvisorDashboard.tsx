import React, { useState, useMemo } from 'react';
import {
  Scale,
  ShieldAlert,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Download,
  Printer,
  ChevronDown,
  Building,
  User,
  DollarSign,
  Plus,
  X,
  FileCheck,
  Send,
  HelpCircle,
  FolderOpen
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';

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

export const LegalAdvisorDashboard: React.FC = () => {
  const { customers, invoices, branches, currentUser, users } = useApp();

  const [activeTab, setActiveTab] = useState<'delinquents' | 'checks' | 'notices' | 'templates'>('delinquents');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('الكل');
  const [minDebtFilter, setMinDebtFilter] = useState<number>(5000);

  // Legal Notices State (persisted locally)
  const [notices, setNotices] = useState<LegalNotice[]>(() => {
    const saved = localStorage.getItem('tantawy_legal_notices');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'NOT-2026-001',
        customerName: 'مكتبة ومستلزمات النجاح',
        customerCode: 'C-1092',
        branch: 'فرع طنطا',
        repName: 'أحمد محمود',
        totalDebt: 34500,
        issueDate: '2026-02-10',
        deadlineDate: '2026-02-24',
        status: 'تم الإرسال على يد محضر',
        legalType: 'إنذار رسمي على يد محضر',
        notes: 'تجاوز فترة الائتمان بأكثر من 90 يوماً مع عدم الرد على اتصالات مندوب ومحاسب الفرع.'
      },
      {
        id: 'NOT-2026-002',
        customerName: 'شركة الإيمان للتوريدات',
        customerCode: 'C-2401',
        branch: 'فرع المنصورة',
        repName: 'إسلام فاروق',
        totalDebt: 78000,
        issueDate: '2026-03-01',
        deadlineDate: '2026-03-15',
        status: 'مرفوع دعوى قضائية',
        legalType: 'أمر أداء تجاري',
        notes: 'تم استصدار أمر أداء بناءً على فواتير إلكترونية موقعة وإيصال أمانة ضامن.'
      }
    ];
  });

  // Guarantee Checks state
  const [checks, setChecks] = useState<GuaranteeCheck[]>(() => {
    const saved = localStorage.getItem('tantawy_legal_checks');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      {
        id: 'CHK-8921',
        customerName: 'مكتبة ومستلزمات النجاح',
        bankName: 'البنك الأهلي المصري',
        checkNumber: '00984210',
        amount: 34500,
        dueDate: '2026-01-30',
        type: 'شيك بنكي',
        status: 'مرتد بدون رصيد'
      },
      {
        id: 'CHK-5512',
        customerName: 'شركة الإيمان للتوريدات',
        bankName: 'بنك مصر',
        checkNumber: '44109281',
        amount: 50000,
        dueDate: '2026-02-15',
        type: 'إيصال أمانة',
        status: 'قيد التحصيل القضائي'
      },
      {
        id: 'CHK-3319',
        customerName: 'مؤسسة الشروق للأدوات',
        bankName: 'بنك القاهرة',
        checkNumber: '77210984',
        amount: 22000,
        dueDate: '2026-05-01',
        type: 'شيك بنكي',
        status: 'ساري ومودع بالخزينة'
      }
    ];
  });

  // Modals
  const [selectedCustomerForNotice, setSelectedCustomerForNotice] = useState<Customer | null>(null);
  const [noticeType, setNoticeType] = useState<LegalNotice['legalType']>('إنذار رسمي على يد محضر');
  const [noticeNotes, setNoticeNotes] = useState('');
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [viewingNotice, setViewingNotice] = useState<LegalNotice | null>(null);

  // New Check Modal
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [newCheckCustomer, setNewCheckCustomer] = useState('');
  const [newCheckBank, setNewCheckBank] = useState('');
  const [newCheckNum, setNewCheckNum] = useState('');
  const [newCheckAmount, setNewCheckAmount] = useState<number>(0);
  const [newCheckDate, setNewCheckDate] = useState('');
  const [newCheckType, setNewCheckType] = useState<GuaranteeCheck['type']>('شيك بنكي');

  const saveNotices = (updated: LegalNotice[]) => {
    setNotices(updated);
    try { localStorage.setItem('tantawy_legal_notices', JSON.stringify(updated)); } catch {}
  };

  const saveChecks = (updated: GuaranteeCheck[]) => {
    setChecks(updated);
    try { localStorage.setItem('tantawy_legal_checks', JSON.stringify(updated)); } catch {}
  };

  // Filter delinquent customers (debt > minDebtFilter)
  const delinquentCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const debt = c.currentBalance ?? c.balance ?? 0;
        const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
        if (debt < minDebtFilter && overdue < minDebtFilter) return false;
        if (selectedBranch !== 'الكل' && c.branchName !== selectedBranch) return false;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const matches =
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.code && String(c.code).toLowerCase().includes(q)) ||
            (c.phone && String(c.phone).includes(q)) ||
            (c.salesRepName && c.salesRepName.toLowerCase().includes(q));
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const debtA = a.currentBalance ?? a.balance ?? 0;
        const debtB = b.currentBalance ?? b.balance ?? 0;
        return debtB - debtA;
      });
  }, [customers, minDebtFilter, selectedBranch, searchTerm]);

  // Overall Legal Stats
  const stats = useMemo(() => {
    let totalDelinquentDebt = 0;
    let highRiskCount = 0;
    customers.forEach((c) => {
      const debt = c.currentBalance ?? c.balance ?? 0;
      const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
      if (debt > 10000 || overdue > 5000) {
        totalDelinquentDebt += debt;
        highRiskCount++;
      }
    });

    const activeCourtCases = notices.filter((n) => n.status === 'مرفوع دعوى قضائية').length;
    const bouncedChecks = checks.filter((c) => c.status === 'مرتد بدون رصيد').length;

    return {
      totalDelinquentDebt,
      highRiskCount,
      activeCourtCases,
      bouncedChecks,
      totalNotices: notices.length,
      totalChecks: checks.length
    };
  }, [customers, notices, checks]);

  const handleCreateNotice = () => {
    if (!selectedCustomerForNotice) return;
    const debt = selectedCustomerForNotice.currentBalance ?? selectedCustomerForNotice.balance ?? 0;
    const today = new Date().toISOString().split('T')[0];
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
      notes: noticeNotes || 'تم إصدار الإنذار القانوني الرسمي بعد استنفاد مهل السداد الودية.'
    };

    saveNotices([newN, ...notices]);
    setIsNoticeModalOpen(false);
    setSelectedCustomerForNotice(null);
    setNoticeNotes('');
    setViewingNotice(newN);
  };

  const handleAddCheck = () => {
    if (!newCheckCustomer || !newCheckNum || newCheckAmount <= 0) return;
    const newC: GuaranteeCheck = {
      id: `CHK-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: newCheckCustomer,
      bankName: newCheckBank || 'البنك الأهلي المصري',
      checkNumber: newCheckNum,
      amount: newCheckAmount,
      dueDate: newCheckDate || new Date().toISOString().split('T')[0],
      type: newCheckType,
      status: 'ساري ومودع بالخزينة'
    };
    saveChecks([newC, ...checks]);
    setIsCheckModalOpen(false);
    setNewCheckCustomer('');
    setNewCheckBank('');
    setNewCheckNum('');
    setNewCheckAmount(0);
  };

  return (
    <div dir="rtl" className="space-y-5 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#0f233d] via-[#162f52] to-[#1a3861] text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-[rgba(201,154,67,.3)] relative overflow-hidden">
        <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0">
              <Scale className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  الإدارة القانونية والتحصيل القضائي
                </h1>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                  المستشار القانوني
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium max-w-2xl leading-relaxed">
                متابعة مديونيات العملاء المتعثرة، إصدار الإنذارات الرسمية على يد محضر، إدارة محفظة الشيكات وإيصالات الأمانة، وإجراءات أوامر الأداء والمطالبات القضائية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCheckModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل شيك / إيصال أمانة</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-[var(--app-line)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي ديون المتابعة القانونية</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 mt-2 tabular-nums">
            {formatCurrency(stats.totalDelinquentDebt)} <span className="text-xs font-bold text-slate-400">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-bold">
            مديونيات تتجاوز 10,000 ج.م
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[var(--app-line)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">عملاء مرحلة الخطر (أكثر من 90 يوم)</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 tabular-nums">
            {stats.highRiskCount} <span className="text-xs font-bold text-slate-400">عميل</span>
          </div>
          <div className="text-[11px] text-amber-600 mt-1 font-bold">
            يتطلب إنذار رسمي أو تسوية
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[var(--app-line)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">شيكات وإيصالات بالخزينة</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-700 mt-2 tabular-nums">
            {stats.totalChecks} <span className="text-xs font-bold text-slate-400">ضمانة</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-bold">
            {stats.bouncedChecks} شيك مرتد بدون رصيد
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[var(--app-line)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إنذارات وقضايا مرفوعة</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 tabular-nums">
            {stats.totalNotices} <span className="text-xs font-bold text-slate-400">إجراء</span>
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 font-bold">
            {stats.activeCourtCases} أوامر أداء منظورة
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--app-line)] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('delinquents')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer whitespace-nowrap ${
            activeTab === 'delinquents'
              ? 'bg-[#0f233d] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>كشف العملاء المتعثرين والمطالبات</span>
          <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {delinquentCustomers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('notices')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer whitespace-nowrap ${
            activeTab === 'notices'
              ? 'bg-[#0f233d] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4 text-amber-400" />
          <span>سجل الإنذارات الرسمية والقضايا ({notices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('checks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer whitespace-nowrap ${
            activeTab === 'checks'
              ? 'bg-[#0f233d] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileCheck className="w-4 h-4 text-amber-400" />
          <span>محفظة الشيكات والضمانات ({checks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer whitespace-nowrap ${
            activeTab === 'templates'
              ? 'bg-[#0f233d] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderOpen className="w-4 h-4 text-amber-400" />
          <span>صيغ العقود والنماذج القانونية</span>
        </button>
      </div>

      {/* TAB 1: DELINQUENT CUSTOMERS */}
      {activeTab === 'delinquents' && (
        <div className="bg-white rounded-2xl border border-[var(--app-line)] shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث باسم العميل أو الكود أو المندوب..."
                className="w-full h-10 pr-9 pl-3 text-xs rounded-xl border border-[var(--app-line)] focus:outline-none focus:border-[#0f233d]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="الفرع"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-10 px-3 text-xs font-bold rounded-xl border border-[var(--app-line)] bg-slate-50 text-slate-700"
              >
                <option value="الكل">كل الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>

              <select
                aria-label="حد المديونية"
                value={minDebtFilter}
                onChange={(e) => setMinDebtFilter(Number(e.target.value))}
                className="h-10 px-3 text-xs font-bold rounded-xl border border-[var(--app-line)] bg-slate-50 text-slate-700"
              >
                <option value={0}>كل المديونيات</option>
                <option value={5000}>أكبر من 5,000 ج</option>
                <option value={15000}>أكبر من 15,000 ج</option>
                <option value={30000}>أكبر من 30,000 ج (حرج)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--app-line)]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-[var(--app-line)] font-black">
                <tr>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الفرع والمندوب</th>
                  <th className="p-3">إجمالي المديونية</th>
                  <th className="p-3">المستحق والمتأخر</th>
                  <th className="p-3">السقف الائتماني</th>
                  <th className="p-3">الإجراء القانوني</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line)]">
                {delinquentCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-slate-400 font-bold">
                      لا يوجد عملاء متعثرين يطابقون معايير التصفية المحددة.
                    </td>
                  </tr>
                ) : (
                  delinquentCustomers.slice(0, 50).map((c) => {
                    const debt = c.currentBalance ?? c.balance ?? 0;
                    const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
                    const limit = c.creditLimit || 0;
                    const isExceeded = limit > 0 && debt > limit;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3">
                          <div className="font-black text-slate-900">{c.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">كود: {c.code || c.id} • {c.phone || 'بدون هاتف'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-700">{c.branchName || 'الفرع الرئيسي'}</div>
                          <div className="text-[11px] text-slate-500">المندوب: {c.salesRepName || c.repName || 'غير مسند'}</div>
                        </td>
                        <td className="p-3 font-black text-slate-900 tabular-nums">
                          {formatCurrency(debt)} ج
                        </td>
                        <td className="p-3 font-black text-rose-600 tabular-nums">
                          {formatCurrency(overdue)} ج
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            isExceeded ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {limit > 0 ? `${formatCurrency(limit)} ج` : 'بدون سقف'}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              setSelectedCustomerForNotice(c);
                              setIsNoticeModalOpen(true);
                            }}
                            className="bg-[#0f233d] hover:bg-[#1a3861] text-amber-300 font-black px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            <span>إصدار إنذار قانوني</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: NOTICES */}
      {activeTab === 'notices' && (
        <div className="bg-white rounded-2xl border border-[var(--app-line)] shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm">
              سجل الإنذارات الرسمية والدعاوى القضائية ({notices.length})
            </h3>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--app-line)]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-[var(--app-line)] font-black">
                <tr>
                  <th className="p-3">رقم الإنذار</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">نوع الإجراء</th>
                  <th className="p-3">المبلغ المطالب به</th>
                  <th className="p-3">تاريخ الإرسال والمهلة</th>
                  <th className="p-3">الحالة القانونية</th>
                  <th className="p-3">معاينة وطباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line)]">
                {notices.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">{n.id}</td>
                    <td className="p-3 font-black text-slate-900">{n.customerName}</td>
                    <td className="p-3">
                      <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-bold">
                        {n.legalType}
                      </span>
                    </td>
                    <td className="p-3 font-black text-rose-600 tabular-nums">
                      {formatCurrency(n.totalDebt)} ج
                    </td>
                    <td className="p-3 text-[11px] text-slate-600">
                      <div>إصدار: {n.issueDate}</div>
                      <div className="font-bold text-rose-600">انتهاء المهلة: {n.deadlineDate}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                        n.status === 'مرفوع دعوى قضائية'
                          ? 'bg-rose-100 text-rose-800'
                          : n.status === 'تم الإرسال على يد محضر'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setViewingNotice(n)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2.5 py-1 rounded text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CHECKS */}
      {activeTab === 'checks' && (
        <div className="bg-white rounded-2xl border border-[var(--app-line)] shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm">
              محفظة الشيكات البنكية وإيصالات الأمانة المسجلة ({checks.length})
            </h3>
            <button
              onClick={() => setIsCheckModalOpen(true)}
              className="bg-[#0f233d] text-amber-300 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة شيك / إيصال جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--app-line)]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 border-b border-[var(--app-line)] font-black">
                <tr>
                  <th className="p-3">النوع</th>
                  <th className="p-3">العميل / الساحب</th>
                  <th className="p-3">البنك ورقم الشيك</th>
                  <th className="p-3">قيمة الشيك</th>
                  <th className="p-3">تاريخ الاستحقاق</th>
                  <th className="p-3">الحالة بالخزينة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line)]">
                {checks.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-bold text-[11px]">
                        {c.type}
                      </span>
                    </td>
                    <td className="p-3 font-black text-slate-900">{c.customerName}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-700">{c.bankName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">#{c.checkNumber}</div>
                    </td>
                    <td className="p-3 font-black text-slate-900 tabular-nums">
                      {formatCurrency(c.amount)} ج
                    </td>
                    <td className="p-3 font-bold text-slate-700 tabular-nums">{c.dueDate}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                        c.status === 'مرتد بدون رصيد'
                          ? 'bg-rose-100 text-rose-800'
                          : c.status === 'قيد التحصيل القضائي'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-[var(--app-line)] p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-black">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">إنذار سداد رسمي على يد محضر</h4>
                <p className="text-[11px] text-slate-500">صيغة قانونية معتمدة وفقاً لقانون التجارة المصري</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              إنذار تكليف بالوفاء موجه للعميل لسداد المديونية المستحقة خلال مهلة 7 أيام قبل استصدار أمر أداء أو الحجز التحفظي.
            </p>
            <button
              onClick={() => {
                if (customers.length > 0) {
                  setSelectedCustomerForNotice(customers[0]);
                  setIsNoticeModalOpen(true);
                }
              }}
              className="bg-[#0f233d] hover:bg-[#1a3861] text-amber-300 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>توليد نموذج الإنذار</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-[var(--app-line)] p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">عقد اتفاق تسوية وجدولة مديونية</h4>
                <p className="text-[11px] text-slate-500">جدولة الأقساط الشهرية مع ضمانات تجارية</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              عقد صلح وتعهد سداد يتضمن إقرار العميل بصحة الرصيد وتقسيمه على دفعات دورية مع تقديم شيكات بنكية ضامنة.
            </p>
            <button
              onClick={() => alert('تم تجهيز صيغة عقد التسوية المعتمدة، اضغط لطباعة النموذج الجاهز.')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تحميل صيغة التسوية</span>
            </button>
          </div>
        </div>
      )}

      {/* CREATE NOTICE MODAL */}
      {isNoticeModalOpen && selectedCustomerForNotice && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-[var(--app-line)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--app-line)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0f233d] text-amber-400 flex items-center justify-center font-black">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">إصدار إنذار قانوني رسمي</h3>
                  <p className="text-[11px] text-slate-500">للعميل: {selectedCustomerForNotice.name}</p>
                </div>
              </div>
              <button onClick={() => setIsNoticeModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-[var(--app-line)] flex items-center justify-between">
                <div>
                  <span className="text-slate-500 block">إجمالي المديونية الحالية:</span>
                  <span className="font-black text-base text-rose-600">
                    {formatCurrency(selectedCustomerForNotice.currentBalance ?? selectedCustomerForNotice.balance ?? 0)} ج.م
                  </span>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block">الفرع والمندوب:</span>
                  <span className="font-bold text-slate-800">
                    {selectedCustomerForNotice.branchName || 'الفرع الرئيسي'}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">نوع الإجراء القانوني:</label>
                <select
                  value={noticeType}
                  onChange={(e) => setNoticeType(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-bold text-slate-800 bg-white"
                >
                  <option value="إنذار رسمي على يد محضر">إنذار رسمي على يد محضر (تكليف بالوفاء خلال 7 أيام)</option>
                  <option value="أمر أداء تجاري">استصدار أمر أداء تجاري من المحكمة المختصة</option>
                  <option value="جنحة شيك بدون رصيد">شكوى جنحة شيك بنكي بدون رصيد كافٍ</option>
                  <option value="إقرار دين وجدولة">إقرار دين وجدولة سداد ودية</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">ملاحظات المستشار القانوني وسند المطالبة:</label>
                <textarea
                  value={noticeNotes}
                  onChange={(e) => setNoticeNotes(e.target.value)}
                  placeholder="أدخل تفاصيل الفواتير، أسباب التعثر، أو شروط الجدولة المقترحة..."
                  className="w-full h-24 p-3 rounded-xl border border-[var(--app-line)] font-medium text-slate-800 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--app-line)]">
              <button
                onClick={() => setIsNoticeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateNotice}
                className="bg-[#0f233d] hover:bg-[#1a3861] text-amber-300 font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>إصدار ومعاينة للطباعة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW / PRINT NOTICE MODAL */}
      {viewingNotice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-[var(--app-line)] space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <img src="/tantawy-brand-logo.svg" alt="Tantawy" className="w-12 h-12 object-contain" />
                <div>
                  <h2 className="font-black text-slate-900 text-lg">مجموعة الطنطاوي للتجارة والتوزيع</h2>
                  <p className="text-xs text-amber-700 font-black">الإدارة القانونية والشؤون القضائية</p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="bg-[#0f233d] text-amber-300 font-black px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة رسمية</span>
                </button>
                <button
                  onClick={() => setViewingNotice(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Legal Document Body */}
            <div className="space-y-4 text-xs text-slate-800 leading-relaxed border-2 border-slate-200 p-5 rounded-2xl bg-[#fafcff]">
              <div className="text-center font-black text-base text-[#0f233d] pb-2 border-b border-slate-200">
                {viewingNotice.legalType}
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div><strong>رقم الإجراء:</strong> {viewingNotice.id}</div>
                <div><strong>تاريخ التحرير:</strong> {viewingNotice.issueDate}</div>
                <div><strong>الموجه إليه السيد:</strong> {viewingNotice.customerName}</div>
                <div><strong>الفرع المختص:</strong> {viewingNotice.branch}</div>
              </div>

              <p className="pt-2">
                بناءً على فواتير المبيعات الإلكترونية وأذون استلام البضائع الصادرة من مجموعة الطنطاوي للتجارة والتوزيع،
                وحيث أنه ترصد في ذمتكم المالية لصالح شركتنا مبلغ وقدره:
              </p>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-center">
                <span className="text-base font-black text-rose-700 tabular-nums">
                  {formatCurrency(viewingNotice.totalDebt)} جنيه مصري لا غير
                </span>
              </div>

              <p>
                نحيط سيادتكم علماً بضرورة التوجه لخزينة الفرع وسداد المبلغ المذكور أعلاه كاملاً في موعد غايته:
                <strong className="text-rose-700"> {viewingNotice.deadlineDate}</strong>.
                وفي حال انقضاء هذه المهلة دون سداد أو تسوية معتمدة، ستتخذ الشركة كافة الإجراءات الجنائية والمدنية المقررة قانوناً بما فيها استصدار أمر أداء بالحجز التحفظي.
              </p>

              {viewingNotice.notes && (
                <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-2">
                  <strong>ملاحظات:</strong> {viewingNotice.notes}
                </div>
              )}

              <div className="pt-6 flex justify-between items-end text-center">
                <div>
                  <div className="font-bold text-slate-500 text-[11px]">مندوب ومحاسب الفرع</div>
                  <div className="font-black text-slate-800 mt-4">{viewingNotice.repName}</div>
                </div>
                <div>
                  <div className="font-bold text-slate-500 text-[11px]">المستشار القانوني للشركة</div>
                  <div className="font-black text-[#0f233d] mt-4">أ. سامح عبد الرازق (المحامي بالنقض)</div>
                  <div className="text-[10px] text-amber-700 font-bold">خاتم الإدارة القانونية المعتمد</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD CHECK MODAL */}
      {isCheckModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-[var(--app-line)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--app-line)]">
              <h3 className="font-black text-slate-900 text-sm">تسجيل شيك بنكي أو إيصال أمانة ضامن</h3>
              <button onClick={() => setIsCheckModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 mb-1 block">اسم العميل / الساحب:</label>
                <input
                  type="text"
                  value={newCheckCustomer}
                  onChange={(e) => setNewCheckCustomer(e.target.value)}
                  placeholder="مثال: مكتبة النور الحديثة"
                  className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">نوع الضمانة:</label>
                  <select
                    value={newCheckType}
                    onChange={(e) => setNewCheckType(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-bold text-slate-800"
                  >
                    <option value="شيك بنكي">شيك بنكي</option>
                    <option value="إيصال أمانة">إيصال أمانة</option>
                    <option value="سند إذني">سند إذني</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">البنك المسحوب عليه:</label>
                  <input
                    type="text"
                    value={newCheckBank}
                    onChange={(e) => setNewCheckBank(e.target.value)}
                    placeholder="البنك الأهلي، بنك مصر..."
                    className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">رقم الشيك / الإيصال:</label>
                  <input
                    type="text"
                    value={newCheckNum}
                    onChange={(e) => setNewCheckNum(e.target.value)}
                    placeholder="00192831"
                    className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 mb-1 block">المبلغ (ج.م):</label>
                  <input
                    type="number"
                    value={newCheckAmount || ''}
                    onChange={(e) => setNewCheckAmount(Number(e.target.value))}
                    placeholder="50000"
                    className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 mb-1 block">تاريخ الاستحقاق:</label>
                <input
                  type="date"
                  value={newCheckDate}
                  onChange={(e) => setNewCheckDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[var(--app-line)] font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--app-line)]">
              <button
                onClick={() => setIsCheckModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddCheck}
                className="bg-[#0f233d] hover:bg-[#1a3861] text-amber-300 font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ الضمانة بالخزينة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
