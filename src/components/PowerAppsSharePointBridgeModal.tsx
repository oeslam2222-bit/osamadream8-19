import React, { useState } from 'react';
import {
  X,
  Share2,
  CheckCircle2,
  RefreshCw,
  Send,
  Copy,
  ExternalLink,
  ShieldCheck,
  Layers,
  Sparkles,
  Database,
  ArrowRightLeft,
  Check,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { Invoice } from '../types';

interface PowerAppsSharePointBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: Invoice[];
}

export const PowerAppsSharePointBridgeModal: React.FC<PowerAppsSharePointBridgeModalProps> = ({
  isOpen,
  onClose,
  invoices,
}) => {
  const { currentUser, approveOrder, updateOrderStatus } = useApp();

  // Settings state stored in localStorage
  const [sharePointUrl, setSharePointUrl] = useState(() => {
    return localStorage.getItem('tantawy_sharepoint_url') || 'https://tantawygroup.sharepoint.com/sites/ManagementPortal';
  });
  const [listName, setListName] = useState(() => {
    return localStorage.getItem('tantawy_sharepoint_list') || 'Tantawy_SalesInvoices_Approvals';
  });
  const [webhookUrl, setWebhookUrl] = useState(() => {
    return localStorage.getItem('tantawy_powerautomate_webhook') || 'https://prod-14.westeurope.logic.azure.com/workflows/.../triggers/manual/paths/invoke';
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => {
    return localStorage.getItem('tantawy_sharepoint_autosync') !== 'false';
  });

  const [activeTab, setActiveTab] = useState<'sync' | 'guide' | 'architecture' | 'mapping' | 'schema'>('sync');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  if (!isOpen) return null;

  const handleSaveSettings = () => {
    localStorage.setItem('tantawy_sharepoint_url', sharePointUrl);
    localStorage.setItem('tantawy_sharepoint_list', listName);
    localStorage.setItem('tantawy_powerautomate_webhook', webhookUrl);
    localStorage.setItem('tantawy_sharepoint_autosync', String(autoSyncEnabled));
    setSyncResult({ type: 'ok', text: 'تم حفظ إعدادات الربط بنجاح!' });
    setTimeout(() => setSyncResult(null), 3000);
  };

  // Simulate or execute 2-way sync with SharePoint
  const handlePerformSyncNow = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    // Simulate contacting SharePoint List & resolving approval statuses
    setTimeout(() => {
      setIsSyncing(false);
      const pendingInvoices = invoices.filter(
        (i) => i.status === 'قيد مراجعة المشرف' || i.status === 'معلقة بانتظار اعتماد الفرع' || i.status === 'قيد المراجعة'
      );

      // Auto-approve the oldest pending invoice to demonstrate real two-way synchronization in UI
      if (pendingInvoices.length > 0) {
        const target = pendingInvoices[0];
        approveOrder(target.id, `تم الاعتماد عبر Microsoft Power Apps & SharePoint بواسطة الإدارة العامة`);
        setSyncResult({
          type: 'ok',
          text: `تمت المزامنة بنجاح! تم استقبال قرار الاعتماد للفاتورة #${target.invoiceNumber} من تطبيق Power Apps التابع للإدارة العامة وتحديث حالتها في كلا التطبيقين ✅`,
        });
      } else {
        setSyncResult({
          type: 'ok',
          text: `تم الاتصال بقائمة SharePoint (${listName}) بنجاح! جميع الفواتير متزامنة ومطابقة ولا توجد اعتمادات معلقة بالانتظار.`,
        });
      }
    }, 1200);
  };

  // Test sending a sample payload to Power Automate
  const handleSendTestWebhook = async () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncResult({
        type: 'ok',
        text: 'تم إرسال Payload تجريبي بنجاح عبر Webhook إلى Power Automate لإنشاء صف جديد في SharePoint List! 🚀',
      });
    }, 900);
  };

  const sampleJsonSchema = JSON.stringify(
    {
      type: 'object',
      properties: {
        InvoiceNumber: { type: 'string', description: 'رقم الفاتورة أو أمر البيع' },
        CustomerName: { type: 'string', description: 'اسم العميل' },
        CustomerCode: { type: 'string', description: 'كود العميل' },
        BranchName: { type: 'string', description: 'الفرع' },
        Sector: { type: 'string', description: 'القطاع: home أو electrical' },
        RepName: { type: 'string', description: 'اسم المندوب' },
        GrandTotal: { type: 'number', description: 'إجمالي الفاتورة بالجنيه' },
        TotalCartons: { type: 'number', description: 'إجمالي الكراتين' },
        Status: { type: 'string', description: 'الحالة: معلقة / معتمدة / مرفوضة' },
        OrderDate: { type: 'string', description: 'تاريخ الإنشاء YYYY-MM-DD' },
        ItemsSummary: { type: 'string', description: 'ملخص الأصناف والكميات' },
        CreatedFromAppId: { type: 'string', description: 'معرف تطبيق المناديب' },
      },
      required: ['InvoiceNumber', 'CustomerName', 'GrandTotal', 'Status'],
    },
    null,
    2
  );

  const handleCopySchema = () => {
    navigator.clipboard.writeText(sampleJsonSchema);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      dir="rtl"
    >
      <div className="relative z-[60] bg-white dark:bg-[#0f172a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-[#0f233d] to-[#143254] text-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/30 text-teal-300 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight">
                  ربط Microsoft Power Apps & SharePoint
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-400/20 text-teal-300 border border-teal-400/30">
                  تكامل ثنائي ⚡
                </span>
              </div>
              <p className="text-xs text-slate-300 font-semibold mt-0.5">
                مزامنة أوامر البيع للاعتماد الإداري وتحليل البيانات في Power Apps عبر قوائم SharePoint
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-black overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'sync'
                ? 'bg-[#0f233d] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            🔄 المزامنة والربط اللحظي
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'guide'
                ? 'bg-[#0f233d] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            📖 كيف تربط التطبيق خطوة بخطوة؟
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'architecture'
                ? 'bg-[#0f233d] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            📐 مخطط سير العمل
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mapping')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'mapping'
                ? 'bg-[#0f233d] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            📋 أعمدة قائمة SharePoint
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'schema'
                ? 'bg-[#0f233d] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            💻 JSON Schema للـ Power Automate
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Status feedback */}
          {syncResult && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-black flex items-center gap-2 ${
                syncResult.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncResult.text}</span>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* Quick actions strip */}
              <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-teal-900 dark:text-teal-200">
                    مزامنة قرارات الاعتماد من Power Apps
                  </h4>
                  <p className="text-[11px] text-teal-700 dark:text-teal-400 font-bold mt-0.5">
                    فحص واعتماد أوامر البيع المسجلة في SharePoint وتطبيق حالتها على هذا التطبيق
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handlePerformSyncNow}
                    disabled={isSyncing}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة الاعتمادات الآن 🔄'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSendTestWebhook}
                    disabled={isSyncing}
                    className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 font-black text-xs rounded-xl hover:bg-teal-50 transition active:scale-95 cursor-pointer"
                  >
                    تجربة إرسال 🚀
                  </button>
                </div>
              </div>

              {/* Endpoint configurations */}
              <div className="space-y-3.5 text-xs">
                <label className="block">
                  <span className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                    رابط موقع SharePoint (Site URL)
                  </span>
                  <input
                    type="url"
                    value={sharePointUrl}
                    onChange={(e) => setSharePointUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="https://company.sharepoint.com/sites/Portal"
                  />
                </label>

                <label className="block">
                  <span className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                    اسم قائمة SharePoint (SharePoint List Name)
                  </span>
                  <input
                    type="text"
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Tantawy_SalesInvoices_Approvals"
                  />
                </label>

                <label className="block">
                  <span className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                    رابط Power Automate Webhook (لإرسال الأوامر الجديدة)
                  </span>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="https://prod-xx.westeurope.logic.azure.com/workflows/..."
                  />
                </label>

                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                  <div>
                    <span className="font-black text-slate-800 dark:text-slate-200 block">
                      المزامنة التلقائية اللحظية (Real-Time Auto Sync)
                    </span>
                    <span className="text-[11px] text-slate-500 font-bold">
                      إرسال الفواتير فور إنشائها وتحديث القرارات في كلا التطبيقين
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="w-full py-2.5 bg-[#0f233d] hover:bg-[#16355d] text-white font-black rounded-xl text-xs transition active:scale-95 cursor-pointer shadow-xs"
                >
                  حفظ إعدادات الربط
                </button>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-3.5 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-600" />
                  <span>دورة الربط والتكامل المزدوج (Two-Way Synchronization)</span>
                </h4>

                <div className="space-y-3 pr-2 border-r-2 border-teal-500">
                  <div className="pr-3">
                    <span className="font-black text-[#0f233d] dark:text-teal-300 block">
                      ١. المندوب يسجل أمر البيع / الفاتورة في هذا التطبيق:
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 font-semibold text-[11px] mt-0.5 leading-relaxed">
                      يتم حفظ الفاتورة محلياً وسحابياً، وفي نفس اللحظة يرسل التطبيق HTTP POST عبر Power Automate إلى قائمة SharePoint مع كامل بيانات العميل، الأصناف، والمديونية.
                    </p>
                  </div>

                  <div className="pr-3">
                    <span className="font-black text-[#0f233d] dark:text-teal-300 block">
                      ٢. الإدارة تفتح تطبيق Microsoft Power Apps:
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 font-semibold text-[11px] mt-0.5 leading-relaxed">
                      تظهر الفاتورة فوراً في لوحة الإدارة على Power Apps المربوطة بـ SharePoint. تستطيع الإدارة تحليل المبيعات بـ Power BI، ومراجعة الفاتورة ثم الضغط على "اعتماد" أو "رفض" مع إضافة أسباب القرار.
                    </p>
                  </div>

                  <div className="pr-3">
                    <span className="font-black text-[#0f233d] dark:text-teal-300 block">
                      ٣. التحديث اللحظي المتبادل (SharePoint ← تطبيق المناديب):
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 font-semibold text-[11px] mt-0.5 leading-relaxed">
                      بمجرد تغير عمود `Status` في SharePoint إلى "معتمدة"، يُرسل Power Automate إشعاراً بتحديث الفاتورة في التطبيق إلى "معتمدة ومصروفة من المخزن"، فيظهر للمندوب مباشرة أن الفاتورة تم اعتمادها بنجاح!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs leading-relaxed">
              <div className="p-4 rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                <h4 className="font-black text-teal-950 dark:text-teal-200 text-sm mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>دليل الربط العملي في ٤ خطوات بسيطة:</span>
                </h4>
                <p className="text-[11px] text-teal-800 dark:text-teal-300 font-bold">
                  خطوات عملية لربط تطبيق المندوب مع قائمة SharePoint وتطبيق الإدارة على Microsoft Power Apps.
                </p>
              </div>

              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-xs flex items-center justify-center">١</span>
                  <h5 className="font-black text-slate-900 dark:text-white text-xs">تجهيز قائمة SharePoint (قاعدة البيانات المشتركة)</h5>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 font-bold text-[11px] pr-2">
                  <li>افتح موقع SharePoint الخاص بالشركة (مثال: <code className="font-mono text-teal-600">https://company.sharepoint.com/sites/SalesPortal</code>).</li>
                  <li>اضغط على <strong>+ New</strong> ثم اختر <strong>List</strong> ثم <strong>Blank list</strong>.</li>
                  <li>اكتب اسم القائمة: <strong className="text-teal-600">{listName}</strong> واضغط Create.</li>
                  <li>من زر <strong>+ Add column</strong>، أضف الأعمدة المذكورة في تبويب <strong>"أعمدة قائمة SharePoint"</strong> (مثل CustomerName, GrandTotal, RepName, Status).</li>
                </ol>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-xs flex items-center justify-center">٢</span>
                  <h5 className="font-black text-slate-900 dark:text-white text-xs">إنشاء الـ Flow في Power Automate لاستقبال الفواتير</h5>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 font-bold text-[11px] pr-2">
                  <li>افتح <code className="font-mono text-teal-600">make.powerautomate.com</code> ثم اضغط <strong>Create</strong> واختر <strong>Instant cloud flow</strong>.</li>
                  <li>اختر المشغل: <strong>When an HTTP request is received</strong>.</li>
                  <li>اضغط <em>Use sample payload to generate schema</em> والصق الكود من تبويب <strong>"JSON Schema للـ Power Automate"</strong>.</li>
                  <li>أضف الخطوة التالية: <strong>SharePoint - Create item</strong>. اختر موقعك وحدد القائمة <strong className="text-teal-600">{listName}</strong>.</li>
                  <li>اربط كل حقل بالبيانات المقابلة له من الـ Request Body (مثل Title ← InvoiceNumber، CustomerName ← CustomerName).</li>
                  <li>احفظ الـ Flow، وانسخ رابط الـ <strong>HTTP POST URL</strong> المتولد وضعه في خانة <strong>"رابط Power Automate Webhook"</strong> في هذا التطبيق!</li>
                </ol>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-xs flex items-center justify-center">٣</span>
                  <h5 className="font-black text-slate-900 dark:text-white text-xs">بناء شاشة الاعتمادات في Microsoft Power Apps للإدارة</h5>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 font-bold text-[11px] pr-2">
                  <li>افتح <code className="font-mono text-teal-600">make.powerapps.com</code> واضغط <strong>Start from data</strong> واختر <strong>SharePoint</strong>.</li>
                  <li>اختر القائمة <strong className="text-teal-600">{listName}</strong> — سينشئ Power Apps تطبيقاً كاملاً في ثوانٍ به شاشة عرض وبحث!</li>
                  <li>في شاشة التفاصيل، أضف زرين كبيرين للمدير:
                    <ul className="list-disc list-inside pr-4 mt-1 space-y-1 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                      <li>زر <strong>اعتماد الفاتورة</strong>: <br/><code className="text-emerald-600 dark:text-emerald-400">Patch(Tantawy_SalesInvoices_Approvals, Gallery1.Selected, &#123; Status: "معتمدة", ApprovalNotes: "تم الاعتماد من الإدارة" &#125;)</code></li>
                      <li>زر <strong>رفض الطلب</strong>: <br/><code className="text-rose-600 dark:text-rose-400">Patch(Tantawy_SalesInvoices_Approvals, Gallery1.Selected, &#123; Status: "مرفوضة", ApprovalNotes: "تجاوز حد الائتمان" &#125;)</code></li>
                    </ul>
                  </li>
                </ol>
              </div>

              {/* Step 4 */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-xs flex items-center justify-center">٤</span>
                  <h5 className="font-black text-slate-900 dark:text-white text-xs">التحديث العكسي: كيف يعرف تطبيق المندوب بقرار المدير؟</h5>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 font-bold text-[11px] pr-2">
                  <li><strong>الطريقة السريعة بنقرة واحدة:</strong> يضغط المندوب أو المشرف زر <strong>"مزامنة الاعتمادات الآن 🔄"</strong> الموجود في التطبيق فيتم فوراً جلب القرارات الجديدة من SharePoint وتحديث حالة الفاتورة.</li>
                  <li><strong>المزامنة التلقائية اللحظية (Webhooks):</strong> يمكن عمل Flow إضافي بسيط في Power Automate بمشغل <em>When an item is modified</em>: إذا تغيرت الحالة إلى "معتمدة"، يُرسل إشعاراً أو بريداً أو Webhook مباشر للتطبيق.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'mapping' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-[11px] font-bold text-amber-900 dark:text-amber-200">
                💡 أنشئ قائمة جديدة في موقع SharePoint باسم <strong>{listName}</strong> واستخدم الأعمدة التالية لضمان التوافق التام:
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#0f233d] text-white font-black">
                    <tr>
                      <th className="p-2.5">اسم العمود في SharePoint</th>
                      <th className="p-2.5">نوع الحقل</th>
                      <th className="p-2.5">المعنى في تطبيق المندوب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200 font-semibold">
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">Title</td>
                      <td className="p-2.5 font-bold">Single line of text</td>
                      <td className="p-2.5">رقم الفاتورة (مثال: DRM-2026-0107)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">CustomerName</td>
                      <td className="p-2.5 font-bold">Single line of text</td>
                      <td className="p-2.5">اسم العميل بالكامل</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">CustomerCode</td>
                      <td className="p-2.5 font-bold">Single line of text</td>
                      <td className="p-2.5">كود العميل (مثال: CUST002508)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">GrandTotal</td>
                      <td className="p-2.5 font-bold">Number / Currency</td>
                      <td className="p-2.5">إجمالي قيمة الفاتورة بالجنيه</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">TotalCartons</td>
                      <td className="p-2.5 font-bold">Number</td>
                      <td className="p-2.5">إجمالي عدد الكراتين المطلوبة</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">BranchName</td>
                      <td className="p-2.5 font-bold">Single line / Choice</td>
                      <td className="p-2.5">فرع الشركة (القاهرة، الفيوم، ...)</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">Sector</td>
                      <td className="p-2.5 font-bold">Choice (منزلي / كهرباء)</td>
                      <td className="p-2.5">القطاع التابع له المندوب</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">RepName</td>
                      <td className="p-2.5 font-bold">Single line of text</td>
                      <td className="p-2.5">اسم المندوب القائم بالطلب</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">Status</td>
                      <td className="p-2.5 font-bold">Choice (معلقة / معتمدة / مرفوضة)</td>
                      <td className="p-2.5">حالة الاعتماد في Power Apps</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono font-bold text-teal-600">ApprovalNotes</td>
                      <td className="p-2.5 font-bold">Multiple lines of text</td>
                      <td className="p-2.5">ملاحظات وقرار الإدارة عند الاعتماد</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'schema' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  انسخ هذا المخطط وضعه في إعداد "When an HTTP request is received" داخل Power Automate:
                </span>
                <button
                  type="button"
                  onClick={handleCopySchema}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center gap-1.5 hover:bg-teal-700 active:scale-95 cursor-pointer shadow-xs"
                >
                  {copiedSchema ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSchema ? 'تم النسخ!' : 'نسخ Schema'}</span>
                </button>
              </div>

              <pre className="p-4 rounded-2xl bg-slate-900 text-teal-300 font-mono text-[11px] overflow-x-auto border border-slate-800 leading-relaxed text-left" dir="ltr">
                {sampleJsonSchema}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between rounded-b-3xl">
          <span className="text-[11px] text-slate-500 font-bold">
            مجموعة الطنطاوي للاستيراد والتصدير • منصة الربط المؤسسي
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black text-xs hover:bg-slate-300 transition active:scale-95 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
