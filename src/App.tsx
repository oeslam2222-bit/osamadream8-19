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
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { InvoicesManager } from './components/InvoicesManager';
import { InventoryStockView } from './components/InventoryStockView';
import { ExcelImportExport } from './components/ExcelImportExport';
import { AuditLogView } from './components/AuditLogView';
import { UserManager } from './components/UserManager';
import { SystemWorkflowGuide } from './components/SystemWorkflowGuide';
import { OrderBuilderModal } from './components/OrderBuilderModal';
import { ElectronicInvoiceModal } from './components/ElectronicInvoiceModal';
import { AppProvider, useApp } from './context/AppContext';
import { Invoice } from './types';

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
  const { cart, invoices, isOffline, currentUser, isAuthenticated, getCartSummary } = useApp();

  const [activeTab, setActiveTab] = useState<string>('catalog');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // If user is not logged in, show dedicated Login / Registration Page
  if (!isAuthenticated || !currentUser) {
    return <LoginPage />;
  }

  const cartSummary = getCartSummary();

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

      {/* Content Container with optimal tight padding for mobile and standard padding for desktop */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 md:px-6 py-2.5 sm:py-5 pb-24 md:pb-8">
        <Suspense fallback={<TabLoadingSkeleton />}>
          {activeTab === 'catalog' && (
            <ProductCatalog onOpenCart={() => setIsOrderModalOpen(true)} />
          )}

          {activeTab === 'dashboard' && (
            <SupervisorDashboard
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesManager
              onOpenNewOrder={() => setIsOrderModalOpen(true)}
              onViewInvoice={(inv) => setViewingInvoice(inv)}
            />
          )}

          {activeTab === 'inventory' && <InventoryStockView />}

          {activeTab === 'excel' && <ExcelImportExport />}

          {activeTab === 'audit' && (
            <AuditLogView
              onViewInvoice={(invoiceId) => {
                const found = invoices.find((i) => i.id === invoiceId || i.invoiceNumber === invoiceId);
                if (found) setViewingInvoice(found);
              }}
            />
          )}

          {activeTab === 'users' && <UserManager />}

          {activeTab === 'guide' && (
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
            onClose={() => setIsOrderModalOpen(false)}
            onInvoiceCreated={(inv) => {
              setIsOrderModalOpen(false);
              setViewingInvoice(inv);
            }}
          />
        )}

        {/* Electronic Invoice Modal */}
        {viewingInvoice && (
          <ElectronicInvoiceModal
            isOpen={!!viewingInvoice}
            invoice={viewingInvoice}
            onClose={() => setViewingInvoice(null)}
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
