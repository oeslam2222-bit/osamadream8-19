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
import React, { Component, ErrorInfo, Suspense, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { ProductCatalog } from './components/ProductCatalog';
import { CustomerDirectoryView } from './components/CustomerDirectoryView';
import { AllCustomersAnalyticsView } from './components/AllCustomersAnalyticsView';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { InvoicesManager } from './components/InvoicesManager';
import { InventoryStockView } from './components/InventoryStockView';
import { ExcelImportExport } from './components/ExcelImportExport';
import { UserManager } from './components/UserManager';
import { SystemWorkflowGuide } from './components/SystemWorkflowGuide';
import { TargetPerformanceDashboard } from './components/TargetPerformanceDashboard';
import { OrderBuilderModal } from './components/OrderBuilderModal';
import { ElectronicInvoiceModal } from './components/ElectronicInvoiceModal';
import { AppProvider, useApp } from './context/AppContext';
import { Customer, Invoice } from './types';

// Lightweight Skeleton for tab transitions
const TabLoadingSkeleton = () => (
  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[350px] space-y-4 animate-in fade-in">
    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center animate-spin">
      <Loader2 className="w-6 h-6" />
    </div>
    <div className="text-center">
      <h3 className="font-black text-slate-800 text-sm">جاري تحميل البيانات...</h3>
      <p className="text-xs text-slate-400 mt-1">يتم جلب محتويات القسم وتجهيزها بأعلى سرعة</p>
    </div>
  </div>
);

const MainLayout: React.FC = () => {
  const { cart, invoices, isOffline, currentUser, isAuthenticated, getCartSummary, editPendingOrder } = useApp();

  const [activeTab, setActiveTab] = useState<string>('catalog');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderInitialCustomer, setOrderInitialCustomer] = useState<Customer | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // If user is not logged in, show dedicated Login / Registration Page
  if (!isAuthenticated || !currentUser) {
    return <LoginPage />;
  }

  const cartSummary = getCartSummary();

  const handleOpenOrderForCustomer = (cust: Customer) => {
    setOrderInitialCustomer(cust);
    setIsOrderModalOpen(true);
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

  const sectionDetails: Record<string, { eyebrow: string; title: string; description: string }> = {
    catalog: { eyebrow: 'المبيعات اليومية', title: 'كتالوج الأصناف والبيع', description: 'أنشئ طلباتك بسرعة مع متابعة المخزون والعملاء في مكان واحد.' },
    customers: { eyebrow: 'إدارة العملاء', title: 'قاعدة بيانات العملاء', description: 'تابع بيانات العملاء والأرصدة والطلبات السابقة بسهولة.' },
    all_customers: { eyebrow: 'التحليلات', title: 'كافة العملاء والتحليل', description: 'رؤية أوضح لحركة العملاء والتحصيل والمبيعات.' },
    dashboard: { eyebrow: 'مركز المتابعة', title: 'لوحة المتابعة', description: 'ملخص سريع لأداء المبيعات والطلبات والفواتير.' },
    targets: { eyebrow: 'الأداء والتحصيل', title: 'التارجت والأهداف', description: 'راقب مؤشرات الأداء والتقدم نحو أهداف الفرع.' },
    invoices: { eyebrow: 'المستندات المالية', title: 'الفواتير والطلبيات', description: 'راجع الفواتير وعدّلها واطبع نسخة منظمة في أي وقت.' },
    inventory: { eyebrow: 'المخزون', title: 'إدارة المخزون والاعتمادات', description: 'تابع الكميات وحركة الأصناف والاعتمادات.' },
    excel: { eyebrow: 'الأدوات', title: 'الشيتات والاستيراد', description: 'استورد وصدّر بياناتك بأمان من مكان واحد.' },
    users: { eyebrow: 'إدارة الفريق', title: 'فريق الفرع والموظفين', description: 'إدارة المستخدمين والصلاحيات وحالات الاعتماد.' },
    guide: { eyebrow: 'المساعدة', title: 'دليل دورة العمل', description: 'خطوات واضحة لاستخدام المنظومة بكفاءة.' },
  };
  const activeSection = sectionDetails[activeTab] || { eyebrow: 'منظومة الطنطاوي', title: 'إدارة المبيعات والتوزيع', description: 'كل أدوات العمل اليومية في شاشة واحدة.' };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans antialiased selection:bg-amber-400 selection:text-slate-950">
      
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
      />

      {/* Responsive workspace shell shared by every page */}
      <main className="flex-1 w-full bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.08),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
        <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-5 lg:px-8 py-4 sm:py-6 lg:py-8 pb-24 md:pb-10">
          <section className="mb-5 sm:mb-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/85 p-4 sm:p-6 shadow-sm backdrop-blur-sm">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-black tracking-wide text-amber-700 sm:text-xs">
                <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.14)]" />
                <span>{activeSection.eyebrow}</span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">{activeSection.title}</h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-6 text-slate-500 sm:text-sm">{activeSection.description}</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 md:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              بياناتك محفوظة وآمنة
            </div>
          </section>
          <Suspense fallback={<TabLoadingSkeleton />}>
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

          {activeTab === 'customers' && (
            <CustomerDirectoryView
              onOpenNewOrderForCustomer={(cust) => handleOpenOrderForCustomer(cust)}
            />
          )}

          {activeTab === 'all_customers' && (
            <AllCustomersAnalyticsView
              onOpenNewOrderForCustomer={(cust) => handleOpenOrderForCustomer(cust)}
            />
          )}

          {activeTab === 'dashboard' && (
            <SupervisorDashboard
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
            />
          )}

          {activeTab === 'targets' && <TargetPerformanceDashboard />}

          {activeTab === 'invoices' && (
            <InvoicesManager
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
              onEditInvoice={handleEditInvoice}
            />
          )}

          {activeTab === 'inventory' && <InventoryStockView />}

          {activeTab === 'excel' && <ExcelImportExport />}

          {activeTab === 'users' && <UserManager />}

          {activeTab === 'guide' && (
            <SystemWorkflowGuide onNavigateToTab={(tab) => setActiveTab(tab)} />
          )}

          </Suspense>
        </div>
      </main>

      {/* Floating Action / Cart Bar for Mobile Sales Reps - Carefully positioned above bottom bar */}
      {cart && cart.length > 0 && activeTab === 'catalog' && (
        <div className="fixed bottom-[74px] sm:bottom-[80px] md:bottom-5 left-3 right-3 sm:left-4 sm:right-4 z-30 max-w-md mx-auto animate-in slide-in-from-bottom-3 pointer-events-auto">
          <div className="bg-slate-950/95 backdrop-blur-md text-white p-2.5 sm:p-3.5 rounded-2xl shadow-2xl border border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-md">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs text-slate-400 truncate">سلة الطلبية الحالية</div>
                <div className="text-xs sm:text-sm font-black text-amber-300 truncate">
                  {cart.length} صنف ({cartSummary.totalPieces} قطعة)
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs shadow-md transition transform active:scale-95 flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>معاينة الفاتورة 🛒</span>
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
          <h2 className="text-xl font-black text-amber-300 mb-2">منظومة دريم طنطاوي للتوزيع</h2>
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
