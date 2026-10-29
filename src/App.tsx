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
import { ReturnsWarehouseView } from './components/ReturnsWarehouseView';
import { ReturnsCustomersView } from './components/ReturnsCustomersView';
import { LegalAdvisorDashboard } from './components/LegalAdvisorDashboard';
import { PermissionManagerModal } from './components/PermissionManagerModal';
import { OrderBuilderModal } from './components/OrderBuilderModal';
import { ElectronicInvoiceModal } from './components/ElectronicInvoiceModal';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/themeContext';
import { getUserAllowedTabs, getCustomPermissions, UserPermissionOverride } from './services/permissionService';
import { AuthProvider } from './context/authContext';
import { InvoiceProvider } from './context/invoiceContext';
import { CustomerProvider } from './context/customerContext';
import { InventoryProvider } from './context/inventoryContext';
import { SyncProvider } from './context/syncContext';
import { Customer, Invoice, UserRole } from './types';

export const ROLE_ALLOWED_TABS: Record<UserRole, string[]> = {
  developer: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'excel', 'users', 'guide', 'permissions'
  ],
  admin: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'excel', 'users', 'guide', 'permissions'
  ],
  branch_manager: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'users', 'guide'
  ],
  supervisor: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'users'
  ],
  sales_rep: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory'
  ],
  warehouse_keeper: [
    'home', 'returns', 'inventory', 'catalog', 'guide'
  ],
  legal_advisor: ['home'],
  sector_supervisor: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'users'
  ],
  sector_manager: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'users'
  ],
  top_admin: ['dashboard'],
  technical_support: [
    'home', 'catalog', 'all_customers', 'customers', 'customer_item_sales',
    'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'excel', 'users', 'guide'
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

  const [customPermissionOverrides, setCustomPermissionOverrides] = useState<UserPermissionOverride[]>([]);

  // Load custom permission overrides (admin-customized per user)
  useEffect(() => {
    let active = true;
    getCustomPermissions().then((overrides) => {
      if (active) setCustomPermissionOverrides(overrides);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const allowedTabs = useMemo(() => {
    if (!currentUser) return ['home'];
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return ROLE_ALLOWED_TABS.developer;
    }
    const baseTabs = ROLE_ALLOWED_TABS[currentUser.role] || ROLE_ALLOWED_TABS.sales_rep || ['home'];
    const override = customPermissionOverrides.find((o) => o.userId === currentUser.id);
    if (override && Array.isArray(override.allowedTabs) && override.allowedTabs.length > 0) {
      // Merge role base tabs with custom override tabs so system screens are never inadvertently blocked
      return Array.from(new Set([...baseTabs, ...override.allowedTabs]));
    }
    return baseTabs;
  }, [currentUser, customPermissionOverrides]);

  // Land on authorized tab and strictly guard unauthorized tabs
  useEffect(() => {
    if (currentUser) {
      if (!allowedTabs.includes(activeTab)) {
        setActiveTab('home');
      }
    }
  }, [currentUser?.id, currentUser?.role, activeTab, allowedTabs]);

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

          {activeTab === 'customer_item_sales' && (allowedTabs.includes('customer_item_sales') || allowedTabs.includes('catalog')) && (
            <CustomerItemSalesView />
          )}

          {activeTab === 'dashboard' && allowedTabs.includes('dashboard') && (
            <SupervisorDashboard
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'targets' && allowedTabs.includes('targets') && <TargetPerformanceDashboard />}

          {activeTab === 'visits' && allowedTabs.includes('visits') && <VisitsDashboard />}
          {activeTab === 'returns' && allowedTabs.includes('returns') && <ReturnsWarehouseView />}
          {activeTab === 'returns_customers' && allowedTabs.includes('returns_customers') && <ReturnsCustomersView />}

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

          {activeTab === 'permissions' && allowedTabs.includes('permissions') && (
            <PermissionManagerModal isOpen={true} onClose={() => setActiveTab('home')} />
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
                  <ThemeProvider>
                    <MainLayout />
                  </ThemeProvider>
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
