import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarCheck,
  FileText,
  MapPin,
  Receipt,
  Target,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { calculateCustomerFinancials } from '../services/customerFinancialService';
import { formatCurrency } from '../services/invoiceService';
import { TargetRecord } from '../types';

interface ManagementDashboardProps {
  onNavigateToTab: (tab: string) => void;
}

const MONTHS = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const getYear = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};

const safeAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getTargetYear = (target: TargetRecord): number => target.year || getYear(target.date) || new Date().getFullYear();

const isCanceledInvoice = (status: string): boolean => status === 'ملغاة' || status === 'مرفوضة / ملغاة';

export const ManagementDashboard: React.FC<ManagementDashboardProps> = ({ onNavigateToTab }) => {
  const {
    customers,
    users,
    branches,
    getVisibleInvoices,
    getVisibleTargets,
    getVisibleVisits,
  } = useApp();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const invoices = getVisibleInvoices();
  const visibleTargets = getVisibleTargets();
  const visits = getVisibleVisits();

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    visibleTargets.forEach((target) => years.add(getTargetYear(target)));
    invoices.forEach((invoice) => {
      const year = getYear(invoice.date);
      if (year) years.add(year);
    });
    visits.forEach((visit) => {
      const year = getYear(visit.date);
      if (year) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [visibleTargets, invoices, visits]);

  const report = useMemo(() => {
    const yearTargets = visibleTargets.filter((target) => getTargetYear(target) === selectedYear);
    const yearInvoices = invoices.filter((invoice) => getYear(invoice.date) === selectedYear);
    const yearVisits = visits.filter((visit) => getYear(visit.date) === selectedYear);
    const eligibleCustomers = customers.filter((customer) => calculateCustomerFinancials(customer, 'ALL').isEligible);
    const dealtCustomers = customers.filter((customer) => calculateCustomerFinancials(customer, 'ALL').isDealtCustomer);

    const monthly = MONTHS.map((month, index) => {
      const monthTargets = yearTargets.filter((target) => target.month === index + 1);
      return {
        month,
        'هدف البيع': monthTargets.reduce((sum, target) => sum + safeAmount(target.salesTarget), 0),
        'المحقق بيع': monthTargets.reduce((sum, target) => sum + safeAmount(target.salesAchieved), 0),
        'هدف التحصيل': monthTargets.reduce((sum, target) => sum + safeAmount(target.collectionTarget), 0),
        'المحقق تحصيل': monthTargets.reduce((sum, target) => sum + safeAmount(target.collectionAchieved), 0),
      };
    });

    const reps = new Map<string, { name: string; branch: string; salesTarget: number; salesAchieved: number; collectionTarget: number; collectionAchieved: number }>();
    yearTargets.forEach((target) => {
      const key = `${target.branch}::${target.repName}`;
      const row = reps.get(key) || {
        name: target.repName,
        branch: target.branch,
        salesTarget: 0,
        salesAchieved: 0,
        collectionTarget: 0,
        collectionAchieved: 0,
      };
      row.salesTarget += safeAmount(target.salesTarget);
      row.salesAchieved += safeAmount(target.salesAchieved);
      row.collectionTarget += safeAmount(target.collectionTarget);
      row.collectionAchieved += safeAmount(target.collectionAchieved);
      reps.set(key, row);
    });

    const completedVisits = yearVisits.filter((visit) => visit.status === 'منفذة').length;
    const reportableInvoices = yearInvoices.filter((invoice) => !isCanceledInvoice(invoice.status));
    const deliveredInvoices = yearInvoices.filter((invoice) => invoice.status === 'تم التسليم' || invoice.status === 'إغلاق الطلبية');
    const pendingInvoices = yearInvoices.filter((invoice) =>
      invoice.status === 'قيد مراجعة المشرف' || invoice.status === 'معلقة بانتظار اعتماد الفرع' || invoice.status === 'قيد المراجعة'
    ).length;
    const deliveredValue = deliveredInvoices.reduce(
      (sum, invoice) => sum + safeAmount(invoice.netAmountAfterReturns ?? invoice.estimatedGrandTotal),
      0
    );
    const totalEligible = eligibleCustomers.length;
    const totalDealt = dealtCustomers.length;

    return {
      yearTargets,
      monthly,
      reps: Array.from(reps.values()).sort((a, b) => b.salesAchieved - a.salesAchieved),
      salesTarget: yearTargets.reduce((sum, target) => sum + safeAmount(target.salesTarget), 0),
      salesAchieved: yearTargets.reduce((sum, target) => sum + safeAmount(target.salesAchieved), 0),
      collectionTarget: yearTargets.reduce((sum, target) => sum + safeAmount(target.collectionTarget), 0),
      collectionAchieved: yearTargets.reduce((sum, target) => sum + safeAmount(target.collectionAchieved), 0),
      totalEligible,
      totalDealt,
      coverage: totalEligible ? Math.round((totalDealt / totalEligible) * 100) : 0,
      routes: new Set(customers.map((customer) => customer.route?.trim()).filter((route) => route && route !== '-')).size,
      branchCount: branches.length,
      activeReps: users.filter((user) => user.isActive && user.role === 'sales_rep').length,
      activeSupervisors: users.filter((user) => user.isActive && user.role === 'supervisor').length,
      completedVisits,
      totalVisits: yearVisits.length,
      invoiceCount: reportableInvoices.length,
      pendingInvoices,
      deliveredInvoiceCount: deliveredInvoices.length,
      deliveredValue,
    };
  }, [visibleTargets, invoices, visits, customers, users, branches.length, selectedYear]);

  const cards = [
    { label: 'تحقيق هدف البيع', value: formatCurrency(report.salesAchieved), detail: `من ${formatCurrency(report.salesTarget)}`, icon: Target, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'تحقيق هدف التحصيل', value: formatCurrency(report.collectionAchieved), detail: `من ${formatCurrency(report.collectionTarget)}`, icon: Receipt, color: 'text-blue-700 bg-blue-50' },
    { label: 'تغطية العملاء القابلين', value: `${report.coverage}%`, detail: `${report.totalDealt.toLocaleString('ar-EG')} متعامل من ${report.totalEligible.toLocaleString('ar-EG')} قابل`, icon: Users, color: 'text-amber-700 bg-amber-50' },
    { label: 'الزيارات المنفذة', value: report.completedVisits.toLocaleString('ar-EG'), detail: `من ${report.totalVisits.toLocaleString('ar-EG')} زيارة مسجلة`, icon: CalendarCheck, color: 'text-cyan-700 bg-cyan-50' },
    { label: 'الفواتير غير الملغاة', value: report.invoiceCount.toLocaleString('ar-EG'), detail: `${report.pendingInvoices.toLocaleString('ar-EG')} بانتظار الاعتماد`, icon: FileText, color: 'text-rose-700 bg-rose-50' },
    { label: 'قيمة الفواتير المسلّمة', value: formatCurrency(report.deliveredValue), detail: `${report.deliveredInvoiceCount.toLocaleString('ar-EG')} فاتورة مسلّمة`, icon: Receipt, color: 'text-indigo-700 bg-indigo-50' },
  ];

  const reportLinks = [
    { label: 'تحليل قاعدة العملاء', tab: 'all_customers', icon: Users },
    { label: 'التارجت وأداء الفريق', tab: 'targets', icon: Target },
    { label: 'خطوط السير والزيارات', tab: 'visits', icon: MapPin },
    { label: 'الفواتير والطلبيات', tab: 'invoices', icon: Receipt },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black text-emerald-700">الإدارة · ملخص تنفيذي</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">لوحة الإدارة</h1>
          <p className="mt-1 text-sm text-slate-500">مؤشرات مجمعة للتارجت والعملاء والزيارات والفواتير.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          السنة
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, detail, icon: Icon, color }) => (
          <article key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </div>
              <span className={`rounded-md p-2 ${color}`}><Icon className="h-5 w-5" /></span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-700" />
            <h2 className="font-black text-slate-900">التارجت والمحقق شهريًا · {selectedYear}</h2>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.monthly} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="هدف البيع" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="المحقق بيع" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar dataKey="هدف التحصيل" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                <Bar dataKey="المحقق تحصيل" fill="#0284c7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">العملاء من قاعدة العملاء الحالية؛ بقية المؤشرات والزيارات والفواتير مفلترة بالسنة المحددة.</p>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-700" />
            <h2 className="font-black text-slate-900">ملخص الهيكل والفريق</h2>
          </div>
          <dl className="divide-y divide-slate-100">
            <div className="flex justify-between py-3 text-sm"><dt className="text-slate-600">الفروع النشطة</dt><dd className="font-black">{report.branchCount.toLocaleString('ar-EG')}</dd></div>
            <div className="flex justify-between py-3 text-sm"><dt className="text-slate-600">مشرفو المناديب النشطون</dt><dd className="font-black">{report.activeSupervisors.toLocaleString('ar-EG')}</dd></div>
            <div className="flex justify-between py-3 text-sm"><dt className="text-slate-600">المناديب النشطون</dt><dd className="font-black">{report.activeReps.toLocaleString('ar-EG')}</dd></div>
            <div className="flex justify-between py-3 text-sm"><dt className="text-slate-600">خطوط السير المسجلة</dt><dd className="font-black">{report.routes.toLocaleString('ar-EG')}</dd></div>
          </dl>
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            قيمة الفواتير المسلّمة مؤشر تشغيلي من الفواتير المسجلة، وليست إقفالًا محاسبيًا أو تقرير أرباح.
          </div>
        </article>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-slate-700" /><h2 className="font-black">أداء المناديب حسب التارجت</h2></div>
          <button onClick={() => onNavigateToTab('targets')} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900">
            التقرير التفصيلي <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">المندوب</th><th className="p-3">الفرع</th><th className="p-3">هدف البيع</th><th className="p-3">المحقق</th><th className="p-3">نسبة التحقيق</th><th className="p-3">تحقيق التحصيل</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {report.reps.slice(0, 8).map((rep) => (
                <tr key={`${rep.branch}::${rep.name}`}>
                  <td className="p-3 font-bold">{rep.name}</td><td className="p-3">{rep.branch}</td>
                  <td className="p-3">{formatCurrency(rep.salesTarget)}</td><td className="p-3">{formatCurrency(rep.salesAchieved)}</td>
                  <td className="p-3">{rep.salesTarget ? `${Math.round((rep.salesAchieved / rep.salesTarget) * 100)}%` : '—'}</td>
                  <td className="p-3">{formatCurrency(rep.collectionAchieved)} / {formatCurrency(rep.collectionTarget)}</td>
                </tr>
              ))}
              {report.reps.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">لا توجد سجلات تارجت لهذه السنة.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-slate-200 pt-4">
        <h2 className="mb-3 text-sm font-black text-slate-800">التقارير التفصيلية</h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {reportLinks.map(({ label, tab, icon: Icon }) => (
            <button key={tab} onClick={() => onNavigateToTab(tab)} className="flex min-h-14 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold text-slate-700 hover:border-emerald-400 hover:bg-emerald-50">
              <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-700" />{label}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};