import React, { useCallback, useEffect, useState } from 'react';
import { Suspense } from 'react';
import { ShoppingCart, WifiOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Navbar } from '../Navbar';
import { Footer } from './Footer';
import { DashboardHome } from '../DashboardHome';
import { ProductCatalog } from '../ProductCatalog';
import { AllCustomersAnalyticsView } from '../AllCustomersAnalyticsView';
import { SupervisorDashboard } from '../SupervisorDashboard';
import { InvoicesManager } from '../InvoicesManager';
import { InventoryStockView } from '../InventoryStockView';
import { ExcelImportExport } from '../ExcelImportExport';
import { UserManager } from '../UserManager';
import { SystemWorkflowGuide } from '../SystemWorkflowGuide';
import { TargetPerformanceDashboard } from '../TargetPerformanceDashboard';
import { VisitsDashboard } from '../VisitsDashboard';
import { LegalAdvisorDashboard } from '../LegalAdvisorDashboard';
import { OrderBuilderModal } from '../OrderBuilderModal';
import { ElectronicInvoiceModal } from '../ElectronicInvoiceModal';
import { NotificationCenter } from '../NotificationCenter';
import { ToastProvider } from '../ui/Toast';
import { Customer, Invoice, NotificationItem } from '../../types';
import { TabLoadingSkeleton } from './TabLoadingSkeleton';

interface MainLayoutProps {
  currentUser: Customer | null;
  isAuthenticated: boolean;
  isOffline: boolean;
  cart: any[];
  invoices: Invoice[];
  getCartSummary: () => any;
  editPendingOrder: (invoice: Invoice) => { success: boolean; customer?: Customer; message?: string };
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentUser,
  isAuthenticated,
  isOffline,
  cart,
  invoices,
  getCartSummary,
  editPendingOrder,
}) => {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderInitialCustomer, setOrderInitialCustomer] = useState<Customer | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tantawy_dark_mode') === 'true';
    } catch {
      return false;
    }
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: 'n1', type: 'system', title: 'تم تشغيل النظام بنجاح', message: 'مرحباً بك في منظومة مجموعة الطنطاوي.', time: 'منذ بضع ثوانٍ', read: false },
    { id: 'n2', type: 'task', title: 'مهمة جديدة: زيارة عملاء الفيوم', message: 'لديك 5 عملاء مقرر زيارتهم اليوم.', time: 'منذ 5 دقائق', read: false },
    { id: 'n3', type: 'warning', title: 'مخزون منخفض: صنف كاسات زجاج', message: 'رصيد مخزن أكتوبر قد انخفض عن الحد الأدنى.', time: 'منذ 12 دقيقة', read: false },
    { id: 'n4', type: 'info', title: 'تحديث بيانات الأصناف', message: 'تم تحديث أسعار 15 صنف من قاعدة البيانات.', time: 'منذ ساعة', read: true },
    { id: 'n5', type: 'success', title: 'تم اعتماد الفاتورة #INV-2026-0045', message: 'تم اعتماد الفاتورة من قبل المشرف.', time: 'منذ 3 ساعات', read: true },
  ]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    try { localStorage.setItem('tantawy_dark_mode', String(isDark)); } catch {}
  }, [isDark]);

  if (!isAuthenticated || !currentUser) return null;

  const cartSummary = getCartSummary();

  const handleOpenOrderForCustomer = (cust: Customer) => {
    setOrderInitialCustomer(cust);
    setActiveTab('catalog');
  };

  const handleEditInvoice = (invoice: Invoice) => {
    const res = editPendingOrder(invoice);
    if (res.success) {
      if (res.customer) setOrderInitialCustomer(res.customer);
      setViewingInvoice(null);
      setIsOrderModalOpen(true);
    } else {
      alert(res.message);
    }
  };

  return (
    <ToastProvider>
      <div className={`tantawy-shell min-h-[100dvh] flex flex-col text-slate-900 font-sans antialiased selection:bg-amber-400 selection:text-slate-950 ${isDark ? 'bg-surface text-primary' : 'bg-slate-100'} dir="rtl`}>
        {isOffline && (
          <div className="bg-[#d97706] text-white text-xs sm:text-sm py-2 px-3 sm:px-4 text-center font-bold flex items-center justify-center gap-2 shadow-inner border-b border-white/30">
            <WifiOff className="w-4 h-4 sm:w-4.5 sm:h-4.5 animate-pulse" />
            <span className="leading-none">أنت تعمل حالياً في وضع عدم الاتصال - يتم حفظ البيانات محلياً والربط تلقائياً فور عودة الشبكة</span>
          </div>
        )}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenCart={() => setIsOrderModalOpen(true)}
          isDark={isDark}
          setIsDark={setIsDark}
          notificationCount={unreadNotificationCount}
          onOpenNotificationCenter={() => setNotificationCenterOpen(true)}
        />
        <main className="flex-1 max-w-none w-full mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 pb-32 md:pb-8 min-h-[calc(100vh-56px)]">
          <Suspense fallback={<TabLoadingSkeleton />}>
            {activeTab === 'home' && (
              <DashboardHome onNavigateToTab={(tab) => setActiveTab(tab)} onViewInvoice={(inv: Invoice) => setViewingInvoice(inv)} />
            )}
            {activeTab === 'catalog' && (
              <ProductCatalog onOpenCart={() => setIsOrderModalOpen(true)} selectedCustomer={orderInitialCustomer} onClearSelectedCustomer={() => setOrderInitialCustomer(null)} onNavigateToInvoices={(inv: Invoice) => { setActiveTab('invoices'); }} />
            )}
            {(activeTab === 'all_customers' || activeTab === 'customers') && (
              <AllCustomersAnalyticsView onOpenNewOrderForCustomer={(cust: Customer) => handleOpenOrderForCustomer(cust)} />
            )}
            {activeTab === 'dashboard' && (
              <SupervisorDashboard onOpenNewOrder={() => setIsOrderModalOpen(true)} onViewInvoice={(inv: Invoice) => setViewingInvoice(inv)} />
            )}
            {activeTab === 'legal_advisor' && <LegalAdvisorDashboard />}
            {activeTab === 'targets' && <TargetPerformanceDashboard />}
            {activeTab === 'visits' && <VisitsDashboard />}
            {activeTab === 'invoices' && (
              <InvoicesManager onOpenNewOrder={() => setIsOrderModalOpen(true)} onViewInvoice={(inv: Invoice) => setViewingInvoice(inv)} onEditInvoice={handleEditInvoice} />
            )}
            {activeTab === 'inventory' && <InventoryStockView />}
            {activeTab === 'excel' && <ExcelImportExport />}
            {activeTab === 'users' && <UserManager />}
            {activeTab === 'guide' && (<SystemWorkflowGuide onNavigateToTab={(tab) => setActiveTab(tab)} />)}
          </Suspense>
        </main>
        {cart && cart.length > 0 && activeTab === 'catalog' && (
          <div className="fixed bottom-16 md:bottom-4 left-4 right-4 z-40 max-w-md mx-auto animate-in slide-in-from-bottom-5">
            <div className="bg-slate-900 text-white p-3 sm:p-3.5 rounded-2xl shadow-2xl border border-slate-750 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black"><ShoppingCart className="w-5 h-5" /></div>
                <div>
                  <div className="text-xs text-slate-400">سلة الطلبية الحالية</div>
                  <div className="text-sm font-black text-amber-300">{cart.length} صنف مختار ({cartSummary.totalPieces} قطعة)</div>
                </div>
              </div>
              <button onClick={() => setIsOrderModalOpen(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow-md transition transform active:scale-95 flex items-center gap-1.5 cursor-pointer">
                <span>معاينة الفاتورة</span>
                <span className="font-bold text-[11px] bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded-md">{cart.length}</span>
              </button>
            </div>
          </div>
        )}
        <Suspense fallback={null}>
          {isOrderModalOpen && (
            <OrderBuilderModal isOpen={isOrderModalOpen} initialCustomer={orderInitialCustomer} onClose={() => { setIsOrderModalOpen(false); setOrderInitialCustomer(null); }} onInvoiceCreated={(inv: Invoice) => { setIsOrderModalOpen(false); setOrderInitialCustomer(null); setActiveTab('invoices'); }} />
          )}
          {viewingInvoice && (
            <ElectronicInvoiceModal isOpen={!!viewingInvoice} invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} onEditInvoice={handleEditInvoice} />
          )}
        </Suspense>
        <Footer isDark={isDark} />
        <NotificationCenter isOpen={notificationCenterOpen} onClose={() => setNotificationCenterOpen(false)} notifications={notifications} onMarkRead={markNotificationRead} onMarkAllRead={markAllNotificationsRead} onDelete={deleteNotification} onNotificationClick={(n) => { setNotificationCenterOpen(false); if (n.actionUrl) {} }} />
      </div>
    </ToastProvider>
  );
};

export default MainLayout;
