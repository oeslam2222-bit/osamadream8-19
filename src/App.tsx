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
import React, { Component, ErrorInfo, Suspense, useEffect, useMemo, useState } from 'react';
import { DashboardHome } from './components/DashboardHome';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { ProductCatalog } from './components/ProductCatalog';
import { AllCustomersAnalyticsView } from './components/AllCustomersAnalyticsView';
import { CustomerItemSalesView } from './components/CustomerItemSalesView';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { InvoicesManager } from './components/InvoicesManager';
import { InventoryStockView } from './components/InventoryStockView';
import { ExcelImportExport } from './components/ExcelImportExport';
import { UserManager } from './components/UserManager';
import { SystemWorkflowGuide } from './components/SystemWorkflowGuide';
import { TargetPerformanceDashboard } from './components/TargetPerformanceDashboard';
import { VisitsDashboard } from './components/VisitsDashboard';
import { LegalAdvisorDashboard } from './components/LegalAdvisorDashboard';
import { OrderBuilderModal } from './components/OrderBuilderModal';
import { ElectronicInvoiceModal } from './components/ElectronicInvoiceModal';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './context/authContext';
import { InvoiceProvider } from './context/invoiceContext';
import { CustomerProvider } from './context/customerContext';
import { InventoryProvider } from './context/inventoryContext';
import { SyncProvider } from './context/syncContext';
import { Customer, Invoice, UserRole } from './types';

export const ROLE_ALLOWED_TABS: Record<UserRole, string[]> = {
  developer: [
    'home', 'legal_advisor', 'catalog', 'all_customers', 'customers',
    'customer_item_sales', 'dashboard', 'targets', 'visits', 'invoices',
    'inventory', 'excel', 'users', 'guide'
  ],
  admin: [
    'home', 'legal_advisor', 'catalog', 'all_customers', 'customers',
    'customer_item_sales', 'dashboard', 'targets', 'visits', 'invoices',
    'inventory', 'excel', 'users', 'guide'
  ],
  branch_manager: [
    'home', 'catalog', 'all_customers', 'customers',
    'customer_item_sales', 'dashboard', 'targets', 'visits', 'invoices',
    'inventory', 'users', 'guide'
  ],
  supervisor: [
    'home', 'catalog', 'all_customers', 'customers',
    'customer_item_sales', 'dashboard', 'targets', 'visits', 'invoices',
    'inventory', 'users'
  ],
  sales_rep: [
    'home', 'catalog', 'all_customers', 'customers',
    'customer_item_sales', 'targets', 'visits', 'invoices',
    'inventory'
  ],
  legal_advisor: [
    'legal_advisor', 'home'
  ],
};

// Lightweight Skeleton for tab transitions
const TabLoadingSkeleton = () => (
  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[350px] space-y-4 animate-in fade-in">
    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center animate-spin">
      <Loader2 className="w-6 h-6" />
    </div>
    <div className="text-center">
      <h3 className="font-black text-slate-800 text-sm">جاري تحميل البيانات...</h3>
      <p className="text-xs text-slate-500 mt-1">يتم جلب محتويات القسم وتجهيزها بأعلى سرعة</p>
    </div>
  </div>
);

const MainLayout: React.FC = () => {
  const { cart, invoices, isOffline, currentUser, isAuthenticated, getCartSummary, editPendingOrder } = useApp();

  const [activeTab, setActiveTab] = useState<string>('home');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderInitialCustomer, setOrderInitialCustomer] = useState<Customer | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  const allowedTabs = useMemo(() => {
    if (!currentUser) return ['home'];
    return ROLE_ALLOWED_TABS[currentUser.role] || ['home'];
  }, [currentUser]);

  // Land on authorized tab and strictly guard unauthorized tabs
  useEffect(() => {
    if (currentUser) {
      const allowed = ROLE_ALLOWED_TABS[currentUser.role] || ['home'];
      if (!allowed.includes(activeTab)) {
        setActiveTab(currentUser.role === 'legal_advisor' ? 'legal_advisor' : 'home');
      }
    }
  }, [currentUser?.id, currentUser?.role, activeTab]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tantawy_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('tantawy_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // If user is not logged in, show dedicated Login / Registration Page
  if (!isAuthenticated || !currentUser) {
    return <LoginPage />;
  }

  const cartSummary = getCartSummary();

  const handleOpenOrderForCustomer = (cust: Customer) => {
    setOrderInitialCustomer(cust);
    setActiveTab('catalog');
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
    <div className="tantawy-shell min-h-[100dvh] bg-slate-100 flex flex-col text-slate-900 font-sans antialiased selection:bg-amber-400 selection:text-slate-950" dir="rtl">
      
      {/* Offline Status Top Bar if offline */}
      {isOffline && (
        <div className="bg-amber-600 text-white text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-inner">
          <WifiOff className="w-3.5 h-3.5" />
          <span>أنت تعمل حالياً في وضع عدم الاتصال (Offline) - يتم حفظ الفواتير محلياً والربط تلقائياً فور عودة الشبكة</span>
        </div>
      )}

      {/* Main Responsive Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCart={() => setIsOrderModalOpen(true)}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* Content Container with optimal tight padding for mobile and standard padding for desktop */}
      <main className="flex-1 max-w-none w-full mx-auto px-2 sm:px-4 md:px-6 py-3 sm:py-6 pb-24 md:pb-8">
        <Suspense fallback={<TabLoadingSkeleton />}>
          {activeTab === 'home' && allowedTabs.includes('home') && (
            <DashboardHome
              onNavigateToTab={(tab) => setActiveTab(tab)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
            />
          )}

          {activeTab === 'catalog' && allowedTabs.includes('catalog') && (
            <ProductCatalog
              onOpenCart={() => setIsOrderModalOpen(true)}
              selectedCustomer={orderInitialCustomer}
              onClearSelectedCustomer={() => setOrderInitialCustomer(null)}
              onNavigateToInvoices={(inv) => {
                setActiveTab('invoices');
              }}
            />
          )}

          {(activeTab === 'all_customers' || activeTab === 'customers') && allowedTabs.includes('all_customers') && (
            <AllCustomersAnalyticsView
              onOpenNewOrderForCustomer={(cust) => handleOpenOrderForCustomer(cust)}
            />
          )}

          {activeTab === 'customer_item_sales' && allowedTabs.includes('customer_item_sales') && (
            <CustomerItemSalesView
              onOpenNewOrderForCustomer={(cust) => handleOpenOrderForCustomer(cust)}
              onNavigateToExcel={() => setActiveTab('excel')}
            />
          )}

          {activeTab === 'dashboard' && allowedTabs.includes('dashboard') && (
            <SupervisorDashboard
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
            />
          )}

          {activeTab === 'legal_advisor' && allowedTabs.includes('legal_advisor') && <LegalAdvisorDashboard />}

          {activeTab === 'targets' && allowedTabs.includes('targets') && <TargetPerformanceDashboard />}

          {activeTab === 'visits' && allowedTabs.includes('visits') && <VisitsDashboard />}

          {activeTab === 'invoices' && allowedTabs.includes('invoices') && (
            <InvoicesManager
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
              onEditInvoice={handleEditInvoice}
            />
          )}

          {activeTab === 'inventory' && allowedTabs.includes('inventory') && <InventoryStockView />}

          {activeTab === 'excel' && allowedTabs.includes('excel') && (
            <ExcelImportExport onNavigateToItemSales={() => setActiveTab('customer_item_sales')} />
          )}

          {activeTab === 'users' && allowedTabs.includes('users') && <UserManager />}

          {activeTab === 'guide' && allowedTabs.includes('guide') && (
            <SystemWorkflowGuide onNavigateToTab={(tab) => setActiveTab(tab)} />
          )}

        </Suspense>
      </main>

      {/* Floating Action / Cart Bar for Mobile Sales Reps */}
      {cart && cart.length > 0 && activeTab === 'catalog' && (
        <div className="fixed bottom-16 md:bottom-4 left-4 right-4 z-40 max-w-md mx-auto animate-in slide-in-from-bottom-5">
          <div className="bg-slate-900 text-white p-3 sm:p-3.5 rounded-2xl shadow-2xl border border-slate-750 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">سلة الطلبية الحالية</div>
                <div className="text-sm font-black text-amber-300">
                  {cart.length} صنف مختار ({cartSummary.totalPieces} قطعة)
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow-md transition transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>معاينة الفاتورة</span>
              <span className="font-bold text-[11px] bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded-md">
                {cart.length}
              </span>
            </button>
          </div>
        </div>
      )}

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
            تم استعادة بيانات التطبيق بنجاح لمنع توقف الشاشة. اضغط على الزر أدناه لإعادة تشغيل الكتالوج.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-3 rounded-2xl text-sm shadow-lg transition cursor-pointer active:scale-95"
          >
             إعادة تشغيل التطبيق
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
      <AuthProvider>
        <InvoiceProvider>
          <CustomerProvider>
            <InventoryProvider>
              <SyncProvider>
                <AppProvider>
                  <MainLayout />
                </AppProvider>
              </SyncProvider>
            </InventoryProvider>
          </CustomerProvider>
        </InvoiceProvider>
      </AuthProvider>
    </MobileErrorBoundary>
  );
}

export default App;
