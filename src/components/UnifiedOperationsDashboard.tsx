import React, { useState } from 'react';
import {
  BarChart3,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  FileSpreadsheet,
  Gauge,
  Layers,
  LayoutDashboard,
  Receipt,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Warehouse,
  ShieldCheck,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RoleCommandCenter } from './RoleCommandCenter';
import { ManagementDashboard } from './ManagementDashboard';
import { SupervisorDashboard } from './SupervisorDashboard';
import { HomeExecutiveDashboard } from './HomeExecutiveDashboard';
import { Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';

interface UnifiedOperationsDashboardProps {
  initialSubTab?: 'unified' | 'command' | 'management' | 'supervisor' | 'executive';
  onNavigateToTab: (tab: string) => void;
  onOpenNewOrder?: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

export const UnifiedOperationsDashboard: React.FC<UnifiedOperationsDashboardProps> = ({
  initialSubTab,
  onNavigateToTab,
  onOpenNewOrder,
  onViewInvoice,
}) => {
  const { currentUser, invoices, products, visits, customers, branches } = useApp();

  const isSupervisorRole = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // التبويب الافتراضي هو العرض الشامل المتكامل (الدمج الفعلي لجميع الأقسام الثلاثة في صفحة واحدة)
  const [subTab, setSubTab] = useState<'unified' | 'command' | 'management' | 'supervisor' | 'executive'>(() => {
    if (initialSubTab) return initialSubTab;
    return 'unified';
  });

  // Calculate live operational metrics for the unified summary
  const pendingOrders = invoices.filter(
    (i) => i.status === 'قيد مراجعة المشرف' || i.status === 'معلقة بانتظار اعتماد الفرع' || i.status === 'قيد المراجعة'
  );

  const approvedInvoices = invoices.filter(
    (i) => i.status === 'معتمدة ومصروفة من المخزن' || i.status === 'معتمدة' || i.status === 'تم التسليم' || i.status === 'إغلاق الطلبية'
  );

  const totalSalesRevenue = approvedInvoices.reduce((sum, inv) => sum + (inv.estimatedGrandTotal || 0), 0);
  const totalPendingAmount = pendingOrders.reduce((sum, inv) => sum + (inv.estimatedGrandTotal || 0), 0);
  const todayVisits = visits.filter((v) => (v.date || '').slice(0, 10) === new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-4">
      {/* الشريط العلوي المدمج للتبديل السريع بين العرض المتكامل والأقسام المتخصصة */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-3 sm:p-4 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black shadow-inner border border-amber-500/30 shrink-0">
              <Gauge className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>لوحة العمليات والقيادة الشاملة</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black">
                  مدمجة موحدة 🎯
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                منظومة مدمجة تجمع مؤشرات القيادة الفورية، تحليلات الإدارة وPower BI، ومتابعة واعتمادات المشرف ونواقص أكتوبر في شاشة واحدة.
              </p>
            </div>
          </div>

          {/* أزرار التبديل الداخلي السلس في 0 ثانية وبدون إعادة تحميل */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0">
            {/* 1. العرض الشامل المتكامل (الدمج الفعلي) */}
            <button
              type="button"
              onClick={() => setSubTab('unified')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'unified'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>العرض المتكامل الشامل 🎯</span>
            </button>

            {/* 2. لوحة القيادة المباشرة */}
            <button
              type="button"
              onClick={() => setSubTab('command')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'command'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>لوحة القيادة ⚡</span>
            </button>

            {/* 3. لوحة الإدارة وPower BI */}
            <button
              type="button"
              onClick={() => setSubTab('management')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'management'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>لوحة الإدارة وPower BI 📈</span>
            </button>

            {/* 4. لوحة المشرف ومتابعة الطلبات */}
            <button
              type="button"
              onClick={() => setSubTab('supervisor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'supervisor'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>متابعة واعتمادات المشرف 📑</span>
              {pendingOrders.length > 0 && (
                <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                  {pendingOrders.length}
                </span>
              )}
            </button>

            {/* 5. الملخص ومخزون الفروع ونواقص أكتوبر */}
            <button
              type="button"
              onClick={() => setSubTab('executive')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'executive'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>مخزون ونواقص أكتوبر 🏢</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================= التبويب المتكامل الشامل (دمج الصفحات الثلاث فعلياً في صفحة واحدة) ================= */}
      {subTab === 'unified' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          
          {/* شريط المؤشرات الحيوية التنفيذية المشتركة */}
          <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {/* KPI 1: إجمالي المبيعات المعتمدة */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
              <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                <Receipt className="w-3 h-3 text-emerald-400" />
                <span>المبيعات المعتمدة:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-emerald-400 font-mono mt-1">
                {formatCurrency(totalSalesRevenue)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {approvedInvoices.length} فاتورة معتمدة
              </div>
            </div>

            {/* KPI 2: طلبيات بانتظار الاعتماد */}
            <div className={`p-3 rounded-2xl border text-white ${pendingOrders.length > 0 ? 'bg-amber-950/40 border-amber-600/50' : 'bg-slate-900 border-slate-800'}`}>
              <div className="text-[10px] text-amber-300 font-bold flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>بانتظار الاعتماد:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-amber-400 font-mono mt-1">
                {pendingOrders.length} طلبية
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                بقيمة {formatCurrency(totalPendingAmount)}
              </div>
            </div>

            {/* KPI 3: زيارات اليوم المنفذة */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
              <div className="text-[10px] text-sky-400 font-bold flex items-center gap-1">
                <CalendarCheck className="w-3 h-3 text-sky-400" />
                <span>زيارات اليوم:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-sky-300 font-mono mt-1">
                {todayVisits.length} زيارة
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                من إجمالي {visits.length} زيارة
              </div>
            </div>

            {/* KPI 4: العملاء النشطين */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
              <div className="text-[10px] text-purple-400 font-bold flex items-center gap-1">
                <Users className="w-3 h-3 text-purple-400" />
                <span>العملاء المسجلين:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-purple-300 font-mono mt-1">
                {customers.length} عميل
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                كافة الفروع المسجلة
              </div>
            </div>

            {/* KPI 5: الأصناف والكتالوج */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
              <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                <Boxes className="w-3 h-3 text-amber-400" />
                <span>كتالوج الأصناف:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-amber-300 font-mono mt-1">
                {products.length} صنف
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                متاح بالفرع وأكتوبر
              </div>
            </div>

            {/* KPI 6: الفروع الميدانية */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
              <div className="text-[10px] text-teal-400 font-bold flex items-center gap-1">
                <Warehouse className="w-3 h-3 text-teal-400" />
                <span>شبكة الفروع:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-teal-300 font-mono mt-1">
                {branches.length} فروع
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                + مخزن 6 أكتوبر المركزي
              </div>
            </div>
          </section>

          {/* الجزء الأول المدمج: لوحة القيادة السريعة للعمليات (Role Command Center) */}
          <div className="bg-slate-900/40 p-1 sm:p-2 rounded-3xl border border-slate-800/80">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white">القسم الأول: مركز القيادة والعمليات المباشرة ⚡</h3>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('command')}
                className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>تكبير القسم</span>
                <ArrowRight className="w-3 h-3 rotate-180" />
              </button>
            </div>
            <RoleCommandCenter
              onNavigateToTab={onNavigateToTab}
              onOpenNewOrder={onOpenNewOrder}
            />
          </div>

          {/* الجزء الثاني المدمج: متابعة المشرف والطلبيات والاعتمادات (Supervisor Dashboard) */}
          <div className="bg-slate-900/40 p-1 sm:p-2 rounded-3xl border border-slate-800/80">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white">القسم الثاني: متابعة المشرف واعتماد الطلبيات والنواقص 📑</h3>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('supervisor')}
                className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>تكبير القسم</span>
                <ArrowRight className="w-3 h-3 rotate-180" />
              </button>
            </div>
            <SupervisorDashboard
              onNavigateToTab={onNavigateToTab}
              onOpenNewOrder={onOpenNewOrder}
              onViewInvoice={onViewInvoice}
            />
          </div>

          {/* الجزء الثالث المدمج: لوحة الإدارة وPower BI (Management Dashboard) */}
          <div className="bg-slate-900/40 p-1 sm:p-2 rounded-3xl border border-slate-800/80">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white">القسم الثالث: تحليلات الإدارة ومؤشرات الـ Power BI 📈</h3>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('management')}
                className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>تكبير القسم</span>
                <ArrowRight className="w-3 h-3 rotate-180" />
              </button>
            </div>
            <ManagementDashboard
              onNavigateToTab={onNavigateToTab}
            />
          </div>

          {/* الجزء الرابع المدمج: الملخص التنفيذي ونواقص ومخزون أكتوبر (Home Executive Dashboard) */}
          <div className="bg-slate-900/40 p-1 sm:p-2 rounded-3xl border border-slate-800/80">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white">القسم الرابع: الملخص التنفيذي ونواقص مخزن 6 أكتوبر 🏢</h3>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('executive')}
                className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>تكبير القسم</span>
                <ArrowRight className="w-3 h-3 rotate-180" />
              </button>
            </div>
            <HomeExecutiveDashboard
              onNavigateToTab={onNavigateToTab}
              onOpenNewOrder={onOpenNewOrder}
              onViewInvoice={onViewInvoice}
            />
          </div>

        </div>
      )}

      {/* التبويبات الفردية عند رغبة المستخدم في التركيز الكامل على قسم بعينه */}
      {subTab === 'command' && (
        <div className="animate-in fade-in duration-200">
          <RoleCommandCenter
            onNavigateToTab={onNavigateToTab}
            onOpenNewOrder={onOpenNewOrder}
          />
        </div>
      )}

      {subTab === 'management' && (
        <div className="animate-in fade-in duration-200">
          <ManagementDashboard
            onNavigateToTab={onNavigateToTab}
          />
        </div>
      )}

      {subTab === 'supervisor' && (
        <div className="animate-in fade-in duration-200">
          <SupervisorDashboard
            onNavigateToTab={onNavigateToTab}
            onOpenNewOrder={onOpenNewOrder}
            onViewInvoice={onViewInvoice}
          />
        </div>
      )}

      {subTab === 'executive' && (
        <div className="animate-in fade-in duration-200">
          <HomeExecutiveDashboard
            onNavigateToTab={onNavigateToTab}
            onOpenNewOrder={onOpenNewOrder}
            onViewInvoice={onViewInvoice}
          />
        </div>
      )}

    </div>
  );
};

export default UnifiedOperationsDashboard;
