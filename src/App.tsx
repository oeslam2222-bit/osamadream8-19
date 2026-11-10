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
import { Onboarding } from "./components/Onboarding";
import { SplashScreen } from "./components/SplashScreen";
import { ToastProvider } from "./components/ui/Toast";
import React, { Component, ErrorInfo, Suspense, useEffect, useMemo, useState } from 'react';
import { DashboardHome } from './components/DashboardHome';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { ProductCatalog } from './components/ProductCatalog';
import { AllCustomersAnalyticsView } from './components/AllCustomersAnalyticsView';
import { TantawyCustomerBaseView } from './components/customers/TantawyCustomerBaseView';
import { TantawyRepTargetsView } from './components/targets/TantawyRepTargetsView';
import { CustomerItemSalesView } from './components/CustomerItemSalesView';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { InvoicesManager } from './components/InvoicesManager';
import { InventoryStockView } from './components/InventoryStockView';
import { ExcelImportExport } from './components/ExcelImportExport';
import { UserManager } from './components/UserManager';
import { SystemWorkflowGuide } from './components/SystemWorkflowGuide';
import { TargetPerformanceDashboard } from './components/TargetPerformanceDashboard';
import { VisitsDashboard } from './components/VisitsDashboard';
import { CollectionRecoveryDashboard } from './components/CollectionRecoveryDashboard';
import { UnifiedReturnsView } from './components/UnifiedReturnsView';
import { PermissionManagerModal } from './components/PermissionManagerModal';
import { OrderBuilderModal } from './components/OrderBuilderModal';
import { PromotionsOffersView } from './components/PromotionsOffersView';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider, useTheme } from './context/themeContext';
import { getUserAllowedTabs, getCustomPermissions, UserPermissionOverride } from './services/permissionService';
import { AuthProvider } from './context/authContext';
import { InvoiceProvider } from './context/invoiceContext';
import { CustomerProvider } from './context/customerContext';
import { InventoryProvider } from './context/inventoryContext';
import { SyncProvider } from './context/syncContext';
import { Customer, Invoice, UserRole } from './types';

export const ROLE_ALLOWED_TABS: Record<UserRole, string[]> = {
  developer: [
    'home', 'catalog', 'offers', 'customer_item_sales',
    'dashboard', 'targets', 'collection', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'excel', 'users', 'guide', 'permissions'
  ],
  admin: [
    'home', 'catalog', 'offers', 'customer_item_sales',
    'dashboard', 'targets', 'collection', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'excel', 'users', 'guide', 'permissions'
  ],
  branch_manager: [
    'home', 'catalog', 'offers', 'customer_item_sales',
    'dashboard', 'targets', 'collection', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'users', 'guide'
  ],
  supervisor: [
    'home', 'catalog', 'offers', 'customer_item_sales',
    'dashboard', 'targets', 'collection', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'users'
  ],
  sales_rep: [
    'home', 'catalog', 'offers', 'customer_item_sales', 'collection'
  ],
  technical_support: [
    'home', 'catalog', 'offers', 'customer_item_sales',
    'dashboard', 'targets', 'collection', 'visits', 'returns', 'returns_customers', 'invoices',
    'inventory', 'excel', 'users', 'guide', 'permissions'
  ],
  legal_advisor: ["home"],
  warehouse_keeper: ["home", "catalog", "offers", "returns", "inventory", "guide"],
};

// Lightweight Skeleton for tab transitions
const TabLoadingSkeleton = () => (
  <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_40%),_linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(15,23,42,0.98))] p-8 shadow-[0_20px_45px_rgba(2,6,23,0.38)] flex flex-col items-center justify-center min-h-[350px] space-y-4 animate-in fade-in">
    <div className="w-12 h-12 rounded-2xl bg-[rgba(245,158,11,0.16)] text-[var(--app-warn)] ring-1 ring-[rgba(245,158,11,0.35)] flex items-center justify-center animate-spin">
      <Loader2 className="w-6 h-6" />
    </div>
    <div className="text-center">
      <h3 className="font-black text-white text-sm">جاري تحميل البيانات...</h3>
      <p className="text-xs text-slate-300 mt-1">يتم جلب محتويات القسم وتجهيزها بأعلى سرعة</p>
    </div>
  </div>
);

const MainLayout: React.FC = () => {
  const [splashOpen, setSplashOpen] = useState(() => {
    try {
      return localStorage.getItem("tantawy_splash_seen") !== "true";
    } catch {
      return true;
    }
  });
  const { cart, invoices, isOffline, currentUser, isAuthenticated, getCartSummary, editPendingOrder } = useApp();

  const [activeTab, setActiveTab] = useState<string>('home');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderInitialCustomer, setOrderInitialCustomer] = useState<Customer | null>(null);
  const [appToastMsg, setAppToastMsg] = useState<string | null>(null);
  const [customerViewMode, setCustomerViewMode] = useState<'cards' | 'analytics'>('cards');
  const [targetViewMode, setTargetViewMode] = useState<'cards' | 'dashboard'>('cards');
  // الثيم موحد عبر ThemeContext (المصدر الوحيد للحقيقة): يقرأ التفضيل المحفوظ
  // من localStorage ويضيف/يزيل الكلاس .dark على جذر المستند تلقائياً.
  const { isDark } = useTheme();

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
      const allowed = allowedTabs.includes(activeTab) || ['all_customers', 'customers'].includes(activeTab);
      if (!allowed) {
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
      setIsOrderModalOpen(true);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className={`tantawy-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} min-h-[100dvh] bg-[var(--app-bg)] flex flex-col text-[var(--app-text)] font-sans antialiased selection:bg-[var(--app-warn)] selection:text-slate-950`} dir="rtl">
      {/* Splash Screen - shown on first app load */}
      <SplashScreen
        isOpen={splashOpen}
        onComplete={() => {
          setSplashOpen(false);
          try {
            localStorage.setItem("tantawy_splash_seen", "true");
          } catch {}
        }}
      />
      
      {/* Offline Status Top Bar if offline */}
      {isOffline && (
        <div className="bg-[var(--app-warn)] text-white text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-inner">
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

      {/* Content Container - Fluid responsive container with min-w-0 to prevent overflow */}
      <main className="app-main flex-1 min-w-0 pb-24 md:pb-10">
        <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
          <Suspense fallback={<TabLoadingSkeleton />}>
          {activeTab === 'home' && allowedTabs.includes('home') && (
            <DashboardHome
              onNavigateToTab={(tab) => setActiveTab(tab)}
              onNewOrder={() => setIsOrderModalOpen(true)}
            />
          )}

          {activeTab === 'catalog' && allowedTabs.includes('catalog') && (
            <ProductCatalog
              onOpenCart={() => setIsOrderModalOpen(true)}
              selectedCustomer={orderInitialCustomer}
              onClearSelectedCustomer={() => setOrderInitialCustomer(null)}
              onNavigateToTab={(tab) => setActiveTab(tab)}
              onNavigateToInvoices={(inv) => {
                setActiveTab('invoices');
              }}
            />
          )}

          {(activeTab === 'offers' || activeTab === 'promotions') && (
            <PromotionsOffersView />
          )}

          {activeTab === 'customer_item_sales' && (allowedTabs.includes('customer_item_sales') || allowedTabs.includes('catalog')) && (
            <CustomerItemSalesView />
          )}

          {activeTab === 'dashboard' && allowedTabs.includes('dashboard') && (
            <SupervisorDashboard
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'targets' && allowedTabs.includes('targets') && (
            targetViewMode === 'cards' ? (
              <TantawyRepTargetsView
                onOpenAdvancedDashboard={() => setTargetViewMode('dashboard')}
              />
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                  <button
                    onClick={() => setTargetViewMode('cards')}
                    className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <span>← العودة لعرض تارجت المندوبين التنفيذي</span>
                  </button>
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">لوحة المؤشرات والتحليلات المتقدمة</span>
                </div>
                <TargetPerformanceDashboard />
              </div>
            )
          )}

          {activeTab === 'collection' && allowedTabs.includes('collection') && <CollectionRecoveryDashboard />}

          {activeTab === 'visits' && allowedTabs.includes('visits') && <VisitsDashboard />}
          {(activeTab === 'all_customers' || activeTab === 'customers') && (
            customerViewMode === 'cards' ? (
              <TantawyCustomerBaseView
                onOpenNewOrderForCustomer={(cust) => {
                  setOrderInitialCustomer(cust);
                  setActiveTab('catalog');
                }}
                onOpenAdvancedAnalytics={() => setCustomerViewMode('analytics')}
              />
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                  <button
                    onClick={() => setCustomerViewMode('cards')}
                    className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <span>← العودة لعرض كروت العملاء التنفيذي</span>
                  </button>
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">الشيت المالي والتحليلات المتقدمة للعملاء</span>
                </div>
                <AllCustomersAnalyticsView onOpenNewOrderForCustomer={(cust) => { setOrderInitialCustomer(cust); setActiveTab('catalog'); }} />
              </div>
            )
          )}
          {(activeTab === 'returns' || activeTab === 'returns_customers') && (allowedTabs.includes('returns') || allowedTabs.includes('returns_customers')) && (
            <UnifiedReturnsView />
          )}

          {activeTab === 'invoices' && allowedTabs.includes('invoices') && (
            <InvoicesManager
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={() => {}}
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
      </div>
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
              // البقاء في نفس الصفحة (كتالوج / عملاء / رئيسية) مع تأكيد الحفظ المحلي والأوفلاين
              setAppToastMsg(`تم حفظ أمر البيع #${inv.invoiceNumber} محلياً بنجاح في وضع الأوفلاين! المزامنة مستمرة بالخلفية.`);
              setTimeout(() => setAppToastMsg(null), 4500);
            }}
          />
        )}
      </Suspense>

      {/* Bottom Footer */}
      <footer className="border-t border-white/10 bg-[linear-gradient(180deg,_rgba(9,15,24,0.94),_rgba(15,23,42,0.98))] py-4 px-4 text-center text-xs text-[var(--app-muted)] print:hidden mb-16 md:mb-0 shadow-[0_-10px_30px_rgba(2,6,23,0.2)]">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-black text-white">مجموعة الطنطاوي للتجارة والتوزيع (TANTAWY GROUP)</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">نظام إدارة المبيعات والمخازن والربط السحابي وتوفير الباقة</span>
          </div>
          <div className="text-[11px] text-slate-400">
            مستند للفاتورة الإلكترونية المصرية • يدعم العمل بدون إنترنت وتثبيت التطبيق PWA
          </div>
        </div>
      </footer>

      {/* Floating Offline Success Toast Banner */}
      {appToastMsg && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] bg-slate-900 dark:bg-[var(--app-ok)] text-white border-2 border-[var(--app-ok)] rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 font-black shadow-xs">
              ✓
            </span>
            <p className="text-xs font-bold leading-snug">{appToastMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => setAppToastMsg(null)}
            className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

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
          <div className="w-16 h-16 rounded-2xl bg-[var(--app-warn)] text-slate-950 flex items-center justify-center font-black mb-4 shadow-xl">
            <Package className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-[#d97706] mb-2">منظومة مجموعة الطنطاوي للتجارة والتوزيع</h2>
          <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
            تم استعادة بيانات التطبيق بنجاح لمنع توقف الشاشة. اضغط على الزر أدناه لإعادة تشغيل الكتالوج.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-slate-950 font-black px-6 py-3 rounded-2xl text-sm shadow-lg transition cursor-pointer active:scale-95"
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
