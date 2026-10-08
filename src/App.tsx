import {
  Building2,
  CloudLightning,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Package,
  Plus,
  Receipt,
  Server,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';
import React, { Component, ErrorInfo, lazy, Suspense, useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { AppProvider, useApp } from './context/AppContext';
import { Customer, Invoice } from './types';

// Only the shell (login, navbar, app context) ships in the first chunk. Every
// section below is loaded on demand so reps on mobile don't download the
// analytics and Excel engines before they open them.
const ProductCatalog = lazy(() => import('./components/ProductCatalog').then((m) => ({ default: m.ProductCatalog })));
const AllCustomersAnalyticsView = lazy(() => import('./components/AllCustomersAnalyticsView').then((m) => ({ default: m.AllCustomersAnalyticsView })));
const SupervisorDashboard = lazy(() => import('./components/SupervisorDashboard').then((m) => ({ default: m.SupervisorDashboard })));
const TargetPerformanceDashboard = lazy(() => import('./components/TargetPerformanceDashboard').then((m) => ({ default: m.TargetPerformanceDashboard })));
const CollectionForecastView = lazy(() => import('./components/CollectionForecastView'));
const VisitsDashboard = lazy(() => import('./components/VisitsDashboard').then((m) => ({ default: m.VisitsDashboard })));
const InvoicesManager = lazy(() => import('./components/InvoicesManager').then((m) => ({ default: m.InvoicesManager })));
const InventoryStockView = lazy(() => import('./components/InventoryStockView').then((m) => ({ default: m.InventoryStockView })));
const ExcelImportExport = lazy(() => import('./components/ExcelImportExport').then((m) => ({ default: m.ExcelImportExport })));
const UserManager = lazy(() => import('./components/UserManager').then((m) => ({ default: m.UserManager })));
const ManagementDashboard = lazy(() => import('./components/ManagementDashboard').then((m) => ({ default: m.ManagementDashboard })));
const HomeExecutiveDashboard = lazy(() => import('./components/HomeExecutiveDashboard').then((m) => ({ default: m.HomeExecutiveDashboard })));
const SystemWorkflowGuide = lazy(() => import('./components/SystemWorkflowGuide').then((m) => ({ default: m.SystemWorkflowGuide })));
const MobileRepDashboard = lazy(() => import('./components/MobileRepDashboard').then((m) => ({ default: m.MobileRepDashboard })));
const OrderBuilderModal = lazy(() => import('./components/OrderBuilderModal').then((m) => ({ default: m.OrderBuilderModal })));
const ElectronicInvoiceModal = lazy(() => import('./components/ElectronicInvoiceModal').then((m) => ({ default: m.ElectronicInvoiceModal })));

// Suspense here waits for the screen's lazy-loaded JavaScript, not its server data.
const TabLoadingSkeleton = () => {
  const { isOffline } = useApp();
  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[350px] space-y-4 animate-in fade-in">
      <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center animate-spin">
        <Loader2 className="w-6 h-6" />
      </div>
      <div className="text-center">
        <h3 className="font-black text-slate-800 text-sm">
          {isOffline ? 'جاري فتح ملفات القسم المحفوظة على الجهاز...' : 'جاري تجهيز ملفات القسم...'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {isOffline
            ? 'الأقسام التي سبق فتحها أثناء الاتصال يمكن فتحها دون إنترنت.'
            : 'يتم تحميل واجهة القسم؛ لا يعني ذلك إعادة تحميل كل بياناتك من السيرفر.'}
        </p>
      </div>
    </div>
  );
};

const MainLayout: React.FC = () => {
  const { cart, invoices, isOffline, currentUser, isAuthenticated, getCartSummary, editPendingOrder } = useApp();

  // First screen on launch: reps land on their visits, everyone else on the
  // customer database so they start from their core data.
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('dream8_landing_tab');
      if (saved === 'visits' || saved === 'all_customers' || saved === 'catalog' || saved === 'rep_home') return saved;
    } catch { /* ignore */ }
    return currentUser?.role === 'admin' ? 'management' : currentUser?.role === 'sales_rep' ? 'rep_home' : 'all_customers';
  });
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderInitialCustomer, setOrderInitialCustomer] = useState<Customer | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Reps open on Visits; supervisors, branch managers, admin and dev open on
  // the customer database. Re-evaluated once the user is known.
  // `isRep` must be derived safely here: the early return for the login page
  // below happens after this effect, so currentUser can still be null.
  const isRep = currentUser?.role === 'sales_rep';
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dream8_landing_tab');
      const desired = saved === 'catalog' ? 'catalog' : (isRep ? 'rep_home' : currentUser?.role === 'admin' ? 'management' : 'all_customers');
      setActiveTab((cur) => (cur === 'catalog' ? desired : cur));
    } catch { /* ignore */ }
  }, [isRep, currentUser?.role]);

  useEffect(() => {
    if (
      activeTab === 'users' &&
      currentUser?.role !== 'admin' &&
      currentUser?.role !== 'developer'
    ) {
      setActiveTab('all_customers');
    }
  }, [activeTab, currentUser?.role]);

  // If user is not logged in, show dedicated Login / Registration Page.
  // This must stay after the useEffect above: returning early before a hook
  // makes React render a different number of hooks once the session restores,
  // which is the "Rendered more hooks than during the previous render" crash.
  if (!isAuthenticated || !currentUser) {
    return <LoginPage />;
  }

  const cartSummary = getCartSummary();

  const handleOpenOrderForCustomer = (cust: Customer) => {
    setOrderInitialCustomer(cust);
    setActiveTab('catalog');
  };

  // Remember the section the user works in, so the app reopens on it next time.
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'visits' || tab === 'all_customers' || tab === 'catalog' || tab === 'rep_home') {
      try { localStorage.setItem('dream8_landing_tab', tab); } catch { /* ignore */ }
    }
  };

  const handleEditInvoice = (invoice: Invoice) => {
    const res = editPendingOrder(invoice);
    if (res.success) {
      if (res.customer) {
        setOrderInitialCustomer(res.customer);
      }
      setViewingInvoice(null);
      setIsOrderModalOpen(true);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans antialiased selection:bg-amber-400 selection:text-slate-950">
      
      {/* Offline Status Top Bar if offline */}
      {isOffline && (
        <div className="bg-amber-600 text-white text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-inner">
          <WifiOff className="w-3.5 h-3.5" />
          <span>أنت دون اتصال: البيانات المحفوظة والأقسام التي سبق فتحها متاحة. التغييرات المدعومة تُحفظ محلياً وتُزامن عند عودة الإنترنت.</span>
        </div>
      )}

      {/* Main Responsive Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onOpenCart={() => setIsOrderModalOpen(true)}
      />

      {/* Content Container with optimal tight padding for mobile and standard padding for desktop */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 md:px-6 py-2.5 sm:py-5 pb-24 md:pb-8">
        <Suspense fallback={<TabLoadingSkeleton />}>
          {/* Rep home: icon-grid launcher. Role decides the screen, not
              the device — a rep on desktop gets the same launcher. */}
          {activeTab === 'rep_home' && currentUser.role === 'sales_rep' && (
            <MobileRepDashboard
              onNavigate={handleTabChange}
              onNewInvoice={() => setIsOrderModalOpen(true)}
            />
          )}

          {activeTab === 'catalog' && (
            <ProductCatalog
              onOpenCart={() => setIsOrderModalOpen(true)}
              selectedCustomer={orderInitialCustomer}
              onClearSelectedCustomer={() => setOrderInitialCustomer(null)}
              onNavigateToInvoices={(inv) => {
                setActiveTab('invoices');
              }}
            />
          )}

          {(activeTab === 'all_customers' || activeTab === 'customers') && (
            <AllCustomersAnalyticsView
              onOpenNewOrderForCustomer={(cust) => handleOpenOrderForCustomer(cust)}
            />
          )}

          {(activeTab === 'home' || activeTab === 'dashboard') && (
            <HomeExecutiveDashboard
              onNavigateToTab={(tab) => handleTabChange(tab)}
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
            />
          )}

          {activeTab === 'management' &&
            (currentUser.role === 'admin' ||
              currentUser.role === 'branch_manager' ||
              currentUser.role === 'supervisor' ||
              currentUser.role === 'developer') && (
            <ManagementDashboard onNavigateToTab={setActiveTab} />
          )}

          {activeTab === 'targets' && <TargetPerformanceDashboard />}

          {activeTab === 'forecast' && <CollectionForecastView />}

          {activeTab === 'visits' && <VisitsDashboard />}

          {activeTab === 'invoices' && (
            <InvoicesManager
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
              onEditInvoice={handleEditInvoice}
            />
          )}

          {activeTab === 'inventory' && <InventoryStockView />}

          {activeTab === 'excel' && <ExcelImportExport />}

          {activeTab === 'users' &&
            (currentUser.role === 'admin' || currentUser.role === 'developer') && <UserManager />}

          {activeTab === 'guide' && (
            <SystemWorkflowGuide onNavigateToTab={(tab) => setActiveTab(tab)} />
          )}

        </Suspense>
      </main>

      {/* Lazy Modals with Suspense */}
      <Suspense fallback={null}>
        {/* Order & Cart Builder Modal */}
        {isOrderModalOpen && (
          <OrderBuilderModal
            isOpen={isOrderModalOpen}
            initialCustomer={orderInitialCustomer}
            onClose={() => {
              setIsOrderModalOpen(false);
              setOrderInitialCustomer(null);
            }}
            onInvoiceCreated={(inv) => {
              setIsOrderModalOpen(false);
              setOrderInitialCustomer(null);
              setActiveTab('invoices');
            }}
          />
        )}

        {/* Electronic Invoice Modal */}
        {viewingInvoice && (
          <ElectronicInvoiceModal
            isOpen={!!viewingInvoice}
            invoice={viewingInvoice}
            onClose={() => setViewingInvoice(null)}
            onEditInvoice={handleEditInvoice}
          />
        )}
      </Suspense>

      {/* Bottom Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 print:hidden mb-16 md:mb-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-900">مجموعة الطنطاوي للتجارة والتوزيع (TANTAWY GROUP)</span>
            <span className="text-slate-300">|</span>
            <span>نظام إدارة المبيعات والمخازن والربط السحابي وتوفير الباقة</span>
          </div>
          <div className="text-[11px] text-slate-400">
            مستند للفاتورة الإلكترونية المصرية • يدعم العمل بدون إنترنت وتثبيت التطبيق PWA
          </div>
        </div>
      </footer>

    </div>
  );
};

// Class-based ErrorBoundary to catch any runtime exceptions on mobile browsers and prevent white screens
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MobileErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App runtime error caught by MobileErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black mb-4 shadow-xl">
            <Package className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-amber-300 mb-2">منظومة مجموعة الطنطاوي للتجارة والتوزيع</h2>
          <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
            حدث خطأ أثناء تحميل أحد أقسام التطبيق. بياناتك المحلية لم تُحذف؛ أعد تشغيل التطبيق لمحاولة تحميل النسخة الحالية.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-3 rounded-2xl text-sm shadow-lg transition cursor-pointer active:scale-95"
          >
            إعادة تشغيل التطبيق 🔄
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <MobileErrorBoundary>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MobileErrorBoundary>
  );
}

export default App;
