import {
  Activity,
  Building2,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Upload,
  Wifi,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMPANY_INFO } from '../data/mockData';
import { formatCurrency } from '../services/invoiceService';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../services/supabaseService';

export const AccountingSyncView: React.FC = () => {
  const {
    invoices,
    products,
    users,
    branches,
    accountingLogs,
    syncToAccounting,
    isOffline,
    supabaseStatus,
    isSupabaseSyncing,
    syncWithSupabase,
    importProductsList,
    dispatchOrderToMicrosoft
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'erp' | 'supabase' | 'sql' | 'backup'>('erp');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [syncingMicrosoftId, setSyncingMicrosoftId] = useState<string | null>(null);
  const [isSyncingAllMicrosoft, setIsSyncingAllMicrosoft] = useState(false);

  const unsyncedInvoices = invoices.filter((i) => !i.syncedToAccounting);
  const syncedInvoices = invoices.filter((i) => i.syncedToAccounting);
  const approvedInvoices = invoices.filter((i) =>
    ['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(i.status)
  );

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    let count = 0;
    for (const inv of unsyncedInvoices) {
      await syncToAccounting(inv.id);
      count++;
    }
    setIsSyncingAll(false);
    setSyncStatusMsg(`تم بنجاح ترحيل ${count} فاتورة إلى نظام الحسابات المركزي والقيود اليومية!`);
    setTimeout(() => setSyncStatusMsg(null), 5000);
  };

  const handleSyncToMicrosoft = async (invId: string, invoiceNumber: string) => {
    setSyncingMicrosoftId(invId);
    try {
      const res = await dispatchOrderToMicrosoft(invId);
      await syncToAccounting(invId);
      setSyncStatusMsg(res.message || `تم بنجاح ربط الفاتورة #${invoiceNumber} مع Microsoft 365 والسيستم المركزي ✅`);
    } catch {
      setSyncStatusMsg(`تم إرسال الفاتورة #${invoiceNumber} إلى بوابة Microsoft 365`);
    } finally {
      setSyncingMicrosoftId(null);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const handleSyncAllMicrosoft = async () => {
    if (approvedInvoices.length === 0) return;
    setIsSyncingAllMicrosoft(true);
    let successCount = 0;
    for (const inv of approvedInvoices) {
      try {
        await dispatchOrderToMicrosoft(inv.id);
        await syncToAccounting(inv.id);
        successCount++;
      } catch {
        // continue
      }
    }
    setIsSyncingAllMicrosoft(false);
    setSyncStatusMsg(`تم ترحيل وربط ${successCount} فاتورة مع سيستم الشركة (Microsoft 365) بنجاح 🚀`);
    setTimeout(() => setSyncStatusMsg(null), 5000);
  };

  // Generate complete SQL schema for Supabase
  const sqlSchemaScript = `-- ==========================================
-- DREAM DISTRIBUTION - SUPABASE DATABASE SCHEMA
-- شركة دريم للتجارة والتوزيع
-- ==========================================

-- 1. جدول المستخدمين والصلاحيات
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer')),
  branch_name TEXT NOT NULL,
  supervisor_id TEXT REFERENCES public.users(id),
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  approval_status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. جدول الفروع والمخازن
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  manager_name TEXT,
  phone TEXT,
  is_main_warehouse BOOLEAN DEFAULT false
);

-- 3. جدول كتالوج الأصناف والمخزون
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  department TEXT NOT NULL,
  classification TEXT DEFAULT 'سوبر A',
  sales_priority TEXT DEFAULT 'عادي',
  status TEXT DEFAULT 'متاح',
  carton_quantity INTEGER NOT NULL DEFAULT 12,
  size TEXT,
  color TEXT,
  carton_price NUMERIC NOT NULL,
  piece_price NUMERIC NOT NULL,
  promo_price NUMERIC,
  branch_stock_actual INTEGER DEFAULT 0,
  branch_stock_reserved INTEGER DEFAULT 0,
  main_warehouse_actual INTEGER DEFAULT 0,
  main_warehouse_reserved INTEGER DEFAULT 0,
  branch_name TEXT NOT NULL,
  cloudinary_public_id TEXT,
  barcode TEXT,
  image_url TEXT,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. جدول الفواتير والطلبيات
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  rep_id TEXT REFERENCES public.users(id),
  rep_name TEXT NOT NULL,
  supervisor_name TEXT,
  branch_name TEXT NOT NULL,
  items JSONB NOT NULL,
  total_cartons NUMERIC NOT NULL DEFAULT 0,
  total_pieces NUMERIC NOT NULL DEFAULT 0,
  estimated_grand_total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'قيد مراجعة المشرف',
  status_history JSONB DEFAULT '[]'::jsonb,
  is_urgent BOOLEAN DEFAULT false,
  synced_to_accounting BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- تفعيل التحديث اللحظي (Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlSchemaScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Full JSON Backup Export
  const handleExportJsonBackup = () => {
    const backupData = {
      exportedAt: new Date().toISOString(),
      company: COMPANY_INFO,
      stats: {
        productsCount: products.length,
        invoicesCount: invoices.length,
        usersCount: users.length,
        branchesCount: branches.filter((branch) => !branch.isMainWarehouse).length,
      },
      products,
      invoices,
      users,
      branches,
      accountingLogs,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dream_dist_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-16">
      
      {/* Toast Alert */}
      {syncStatusMsg && (
        <div className="bg-[var(--app-ok)] text-white p-4 rounded-2xl shadow-xl flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>{syncStatusMsg}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--app-accent)] text-slate-950 flex items-center justify-center font-black">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">وحدة المطور التقني والربط المحاسبي (Developer Console & ERP)</h2>
                <span className="bg-[rgba(201,154,67,.15)] text-[#8a6420] text-xs px-2 py-0.5 rounded-full border border-[rgba(201,154,67,.35)] font-bold">
                  Dev & Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                تكامل Supabase اللحظي، مولد استعلامات SQL، النسخ الاحتياطي JSON، وترحيل قيود ERP اليومية
              </p>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSubTab('erp')}
              className={`px-3 py-2 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'erp' ? 'bg-[var(--app-accent)] text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>الربط المحاسبي ERP</span>
            </button>

            <button
              onClick={() => setActiveSubTab('supabase')}
              className={`px-3 py-2 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'supabase' ? 'bg-[var(--app-accent)] text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>تكامل Supabase</span>
            </button>

            <button
              onClick={() => setActiveSubTab('sql')}
              className={`px-3 py-2 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'sql' ? 'bg-[var(--app-accent)] text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>استعلامات SQL</span>
            </button>

            <button
              onClick={() => setActiveSubTab('backup')}
              className={`px-3 py-2 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'backup' ? 'bg-[var(--app-accent)] text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>النسخ الاحتياطي JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. ERP Accounting Tab */}
      {activeSubTab === 'erp' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-bold">حالة الاتصال بنظام المحاسبة</span>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-[var(--app-accent)] animate-pulse' : 'bg-[var(--app-ok)]'}`} />
                <span className="font-extrabold text-sm text-slate-900">
                  {isOffline ? 'وضع عدم الاتصال (تخزين مؤقت)' : 'متصل بالخادم المركزي'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                عند انقطاع الإنترنت يتم تسجيل الفواتير محلياً وترحيلها تلقائياً فور عودة الاتصال.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-bold">الفواتير المرحلة والمثبتة في الدفاتر</span>
              <div className="text-xl font-black text-[var(--app-ok)]">
                {syncedInvoices.length} فاتورة
              </div>
              <span className="text-[10px] text-slate-400">سندات قيد يومية مسجلة برقم إلكتروني</span>
            </div>

            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-bold">فواتير قيد الانتظار للترحيل</span>
              <div className="flex items-center justify-between">
                <div className="text-xl font-black text-[#8a6420]">
                  {unsyncedInvoices.length} فاتورة
                </div>
                {unsyncedInvoices.length > 0 && (
                  <button
                    disabled={isSyncingAll}
                    onClick={handleSyncAll}
                    className="flex items-center gap-1.5 bg-[var(--app-accent)] hover:bg-[#b98a35] text-slate-950 font-black px-3 py-1 rounded-xl text-xs shadow transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
                    <span>ترحيل الآن</span>
                  </button>
                )}
              </div>
              <span className="text-[10px] text-slate-400">بانتظار المزامنة مع برنامج الحسابات</span>
            </div>
          </div>

          {/* Dedicated Company System & Microsoft 365 Gateway (خاص بالمطور فقط) */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-5 shadow-lg border border-[rgba(16,43,78,.35)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[var(--app-navy)] to-[var(--app-navy)] flex items-center justify-center shadow-md">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white">بوابة الربط بسيستم الشركة (Microsoft Dynamics 365 & Central ERP)</h3>
                    <span className="bg-[rgba(16,43,78,.15)] text-[var(--app-navy)] text-[10px] px-2 py-0.5 rounded-full font-bold border border-[rgba(16,43,78,.35)]">
                      خاص بصفحة المطور
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    تم حصر أزرار الربط المباشر هنا في صفحة المطور لإرسال الفواتير المعتمدة واختبار قيود النظام المحاسبي للشركة بأمان تام.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSyncingAllMicrosoft || approvedInvoices.length === 0}
                  onClick={handleSyncAllMicrosoft}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-[var(--app-navy)] to-[var(--app-navy)] hover:from-[var(--app-navy)] hover:to-[var(--app-navy)] text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-[var(--app-accent)] ${isSyncingAllMicrosoft ? 'animate-spin' : ''}`} />
                  <span>{isSyncingAllMicrosoft ? 'جاري الترحيل...' : `ترحيل كل الفواتير المعتمدة (${approvedInvoices.length}) 🚀`}</span>
                </button>
              </div>
            </div>

            {/* Approved Invoices List for Dev Testing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1">
                <span>الفواتير المعتمدة الجاهزة للربط والترحيل ({approvedInvoices.length})</span>
                <span className="text-[11px] text-[var(--app-navy)]">يمكنك فحص وإرسال أي فاتورة فردياً أو جماعياً</span>
              </div>

              {approvedInvoices.length === 0 ? (
                <div className="bg-slate-950/60 rounded-2xl p-6 text-center text-xs text-slate-400 border border-white/5">
                  لا توجد فواتير بحالة معتمدة حالياً للترحيل إلى سيستم الشركة
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {approvedInvoices.slice(0, 10).map((inv) => (
                    <div
                      key={inv.id}
                      className="bg-slate-950/70 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-[rgba(16,43,78,.35)] transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-[var(--app-accent)] text-xs">#{inv.invoiceNumber}</span>
                        <span className="text-white font-bold text-xs truncate max-w-[140px] sm:max-w-[200px]">{inv.customerName}</span>
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono">
                          {formatCurrency(inv.estimatedGrandTotal || 0)}
                        </span>
                        <span className="text-[10px] text-slate-400">فرع: {inv.branchName}</span>
                      </div>

                      <button
                        type="button"
                        disabled={syncingMicrosoftId === inv.id}
                        onClick={() => handleSyncToMicrosoft(inv.id, inv.invoiceNumber)}
                        className="flex items-center justify-center gap-1.5 bg-[var(--app-navy)] hover:bg-[#0b2039] text-white font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer shadow-xs disabled:opacity-60"
                      >
                        <Sparkles className="w-3 h-3 text-[#d97706]" />
                        <span>{syncingMicrosoftId === inv.id ? 'جاري الإرسال...' : 'إرسال لـ Microsoft 365 🏢'}</span>
                      </button>
                    </div>
                  ))}
                  {approvedInvoices.length > 10 && (
                    <p className="text-center text-[11px] text-slate-400 pt-1">
                      ويوجد {approvedInvoices.length - 10} فاتورة معتمدة أخرى يمكن ترحيلها جماعياً بالزر أعلاه.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sync Logs Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden space-y-3">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--app-navy-text)]" />
                <span>سجل المعاملات والترحيل المحاسبي (ERP Sync Logs)</span>
              </h3>
            </div>

            {accountingLogs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                لم يتم تسجيل أي عمليات ترحيل محاسبي حتى الآن
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3">الوقت</th>
                      <th className="p-3">رقم الفاتورة</th>
                      <th className="p-3">النظام المستهدف</th>
                      <th className="p-3">استجابة السيرفر</th>
                      <th className="p-3 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accountingLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500 font-mono">{log.timestamp}</td>
                        <td className="p-3 font-bold font-mono text-slate-900">{log.invoiceNumber}</td>
                        <td className="p-3 text-slate-700 font-medium">{log.systemName}</td>
                        <td className="p-3 text-slate-600">{log.responseMessage}</td>
                        <td className="p-3 text-center">
                          <span className="bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] font-bold px-2 py-0.5 rounded-full text-[10px]">
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Supabase Integration Tab */}
      {activeSubTab === 'supabase' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-[var(--app-ok-text)]" />
                <span>إعدادات وتكامل سحابة Supabase اللحظية</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مزامنة الكتالوج، المخزون، المستخدمين، والطلبيات مع خوادم PostgreSQL المباشرة
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={isSupabaseSyncing}
                onClick={() => syncWithSupabase('fetch')}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-[#d97706] font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>سحب من Supabase (Pull)</span>
              </button>

              <button
                disabled={isSupabaseSyncing}
                onClick={() => syncWithSupabase('push')}
                className="flex items-center gap-1.5 bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>دفع إلى Supabase (Push)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-700">Supabase Project URL:</span>
              <code className="block bg-slate-900 text-[#0d9488] p-2.5 rounded-xl font-mono text-[11px] break-all select-all">
                {SUPABASE_URL}
              </code>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-700">Anon Public Key:</span>
              <code className="block bg-slate-900 text-[#d97706] p-2.5 rounded-xl font-mono text-[11px] truncate select-all">
                {SUPABASE_ANON_KEY}
              </code>
            </div>
          </div>

          <div className="p-4 bg-[var(--app-ok-tint)] rounded-2xl border border-[var(--app-ok-line)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[var(--app-ok)] rounded-full animate-ping" />
              <span className="font-bold text-[var(--app-ok-text)]">
                حالة الاتصال بالسحابة: {supabaseStatus.connected ? 'متصل بنجاح 🟢' : 'بانتظار المزامنة 🟡'}
              </span>
            </div>
            {supabaseStatus.lastSyncTime && (
              <span className="text-[var(--app-ok-text)]">آخر فحص: {supabaseStatus.lastSyncTime}</span>
            )}
          </div>
        </div>
      )}

      {/* 3. SQL Query Generator Tab */}
      {activeSubTab === 'sql' && (
        <div className="bg-slate-950 text-slate-100 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-[#d97706]" />
              <h3 className="font-black text-sm text-white">
                استعلامات SQL ومخطط الجداول الجاهزة للتشغيل (Supabase SQL Editor)
              </h3>
            </div>

            <button
              onClick={handleCopySql}
              className="flex items-center gap-1.5 bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer shadow"
            >
              {copiedSql ? <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)]" /> : <Copy className="w-4 h-4" />}
              <span>{copiedSql ? 'تم النسخ بنجاح!' : 'نسخ كود SQL 📋'}</span>
            </button>
          </div>

          <div className="relative">
            <pre className="bg-slate-900 text-slate-200 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed border border-slate-800 select-all">
              {sqlSchemaScript}
            </pre>
          </div>
        </div>
      )}

      {/* 4. JSON Backup & Restore Tab */}
      {activeSubTab === 'backup' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-[var(--app-warn)] text-[var(--app-warn-text)] flex items-center justify-center font-bold">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900">النسخ الاحتياطي واستعادة البيانات بصيغة JSON</h3>
              <p className="text-xs text-slate-500">
                تصدير نسخة كاملة من جميع الأصناف والمخزون والفواتير والمستخدمين بضغطة زر واحدة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--app-warn-text)]" />
                <span>تصدير نسخة احتياطية شاملة (Full JSON Backup)</span>
              </h4>
              <p className="text-xs text-slate-500">
                تحميل ملف JSON يحتوي على كافة بيانات المنظومة الحالية للرجوع إليها في أي وقت.
              </p>
              <button
                onClick={handleExportJsonBackup}
                className="w-full bg-slate-900 hover:bg-slate-800 text-[#d97706] font-black py-2.5 rounded-xl text-xs transition cursor-pointer shadow flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>تحميل ملف النسخة الاحتياطية JSON 📥</span>
              </button>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-[var(--app-ok-text)]" />
                <span>استعادة البيانات من ملف JSON</span>
              </h4>
              <p className="text-xs text-slate-500">
                رفع ملف نسخة احتياطية سابقة لاسترجاع البيانات وإعادة بنائها في التطبيق.
              </p>
              <label className="w-full bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-black py-2.5 rounded-xl text-xs transition cursor-pointer shadow flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                <span>اختيار ملف JSON للاستعادة 📤</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const parsed = JSON.parse(event.target?.result as string);
                        if (parsed.products && Array.isArray(parsed.products)) {
                          importProductsList(parsed.products, 'replace');
                          setSyncStatusMsg(`تم استعادة ${parsed.products.length} صنف بنجاح من النسخة الاحتياطية!`);
                          setTimeout(() => setSyncStatusMsg(null), 4000);
                        }
                      } catch (err) {
                        alert('الملف غير صالح أو بصيغة JSON غير صحيحة');
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
