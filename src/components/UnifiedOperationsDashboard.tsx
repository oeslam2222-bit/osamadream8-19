import React, { useState } from 'react';
import {
  BarChart3,
  Boxes,
  CalendarCheck,
  Clock,
  Gauge,
  LayoutDashboard,
  Receipt,
  Users,
  Warehouse,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RoleCommandCenter } from './RoleCommandCenter';
import { ManagementDashboard } from './ManagementDashboard';
import { SupervisorDashboard } from './SupervisorDashboard';
import { Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';

interface UnifiedOperationsDashboardProps {
  initialSubTab?: 'command' | 'supervisor' | 'management';
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
  const { invoices, products, visits, customers, branches } = useApp();

  const [subTab, setSubTab] = useState<'command' | 'supervisor' | 'management'>(() => {
    if (initialSubTab === 'management') return 'management';
    if (initialSubTab === 'supervisor') return 'supervisor';
    return 'supervisor';
  });

  // Calculate live operational metrics for the single top overview bar
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
      {/* Top Header & Subtab Switcher */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-3 sm:p-4 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--app-warn)] text-[#d97706] flex items-center justify-center font-black shadow-inner border border-[var(--app-warn)] shrink-0">
              <Gauge className="w-5 h-5 text-[#d97706]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>لوحة العمليات والقيادة الشاملة</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-[var(--app-ok)] text-[#0d9488] border border-[var(--app-ok)] text-[10px] font-black">
                  مدمجة وبسيطة 🎯
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                متابعة اعتمادات الفروع الميدانية، ونواقص المخازن، وتحليلات الأداء المالي بدون تكرار
              </p>
            </div>
          </div>

          {/* Clean Sub-tab buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0">
            {/* 1. متابعة المشرف والطلبيات */}
            <button
              type="button"
              onClick={() => setSubTab('supervisor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'supervisor'
                  ? 'bg-[var(--app-warn)] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>متابعة واعتمادات الطلبيات 📑</span>
              {pendingOrders.length > 0 && (
                <span className="bg-[var(--app-risk)] text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                  {pendingOrders.length}
                </span>
              )}
            </button>

            {/* 2. تحليلات الإدارة ومؤشرات الأداء */}
            <button
              type="button"
              onClick={() => setSubTab('management')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'management'
                  ? 'bg-[var(--app-warn)] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>تحليلات الإدارة وPower BI 📈</span>
            </button>

            {/* 3. مركز العمليات والروابط السريعة */}
            <button
              type="button"
              onClick={() => setSubTab('command')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'command'
                  ? 'bg-[var(--app-warn)] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>الإجراءات السريعة ⚡</span>
            </button>
          </div>
        </div>
      </section>

      {/* شريط المؤشرات الحيوية التنفيذية الموحدة (يظهر مرة واحدة فقط بالأعلى بدون تكرار) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {/* KPI 1: إجمالي المبيعات المعتمدة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
          <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
            <Receipt className="w-3 h-3 text-[#0d9488]" />
            <span>المبيعات المعتمدة:</span>
          </div>
          <div className="text-sm sm:text-base font-black text-[#0d9488] font-mono mt-1">
            {formatCurrency(totalSalesRevenue)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {approvedInvoices.length} فاتورة معتمدة
          </div>
        </div>

        {/* KPI 2: طلبيات بانتظار الاعتماد */}
        <div className={`p-3 rounded-2xl border text-white ${pendingOrders.length > 0 ? 'bg-[var(--app-warn)] border-[var(--app-warn)]' : 'bg-slate-900 border-slate-800'}`}>
          <div className="text-[10px] text-[#d97706] font-bold flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#d97706]" />
            <span>بانتظار الاعتماد:</span>
          </div>
          <div className="text-sm sm:text-base font-black text-[#d97706] font-mono mt-1">
            {pendingOrders.length} طلبية
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            بقيمة {formatCurrency(totalPendingAmount)}
          </div>
        </div>

        {/* KPI 3: زيارات اليوم */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
          <div className="text-[10px] text-[#60a5fa] font-bold flex items-center gap-1">
            <CalendarCheck className="w-3 h-3 text-[#60a5fa]" />
            <span>زيارات اليوم:</span>
          </div>
          <div className="text-sm sm:text-base font-black text-[#60a5fa] font-mono mt-1">
            {todayVisits.length} زيارة
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            من {visits.length} مسجلة
          </div>
        </div>

        {/* KPI 4: العملاء */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
          <div className="text-[10px] text-[#60a5fa] font-bold flex items-center gap-1">
            <Users className="w-3 h-3 text-[#60a5fa]" />
            <span>العملاء المسجلين:</span>
          </div>
          <div className="text-sm sm:text-base font-black text-[#60a5fa] font-mono mt-1">
            {customers.length} عميل
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            جميع الفروع
          </div>
        </div>

        {/* KPI 5: كتالوج الأصناف */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
          <div className="text-[10px] text-[#d97706] font-bold flex items-center gap-1">
            <Boxes className="w-3 h-3 text-[#d97706]" />
            <span>كتالوج الأصناف:</span>
          </div>
          <div className="text-sm sm:text-base font-black text-[#d97706] font-mono mt-1">
            {products.length} صنف
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            متاح للبيع
          </div>
        </div>

        {/* KPI 6: الفروع */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white">
          <div className="text-[10px] text-[#0d9488] font-bold flex items-center gap-1">
            <Warehouse className="w-3 h-3 text-[#0d9488]" />
            <span>شبكة الفروع:</span>
          </div>
          <div className="text-sm sm:text-base font-black text-[#0d9488] font-mono mt-1">
            {branches.length} فروع
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            + مخزن أكتوبر المركزي
          </div>
        </div>
      </section>

      {/* عرض قسم واحد فقط حسب الاختيار وبدون تكرار للشاشات */}
      {subTab === 'supervisor' && (
        <div className="animate-in fade-in duration-200">
          <SupervisorDashboard
            onNavigateToTab={onNavigateToTab}
            onOpenNewOrder={onOpenNewOrder}
            onViewInvoice={onViewInvoice}
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

      {subTab === 'command' && (
        <div className="animate-in fade-in duration-200">
          <RoleCommandCenter
            onNavigateToTab={onNavigateToTab}
            onOpenNewOrder={onOpenNewOrder}
          />
        </div>
      )}
    </div>
  );
};

export default UnifiedOperationsDashboard;
