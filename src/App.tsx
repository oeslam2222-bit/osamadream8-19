import {
  Building2,
  CloudLightning,
  FileSpreadsheet,
  FileText,
  Layers,
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
import React, { useState } from 'react';
import { AccountingSyncView } from './components/AccountingSyncView';
import { CloudinaryManager } from './components/CloudinaryManager';
import { ElectronicInvoiceModal } from './components/ElectronicInvoiceModal';
import { ExcelImportExport } from './components/ExcelImportExport';
import { InventoryStockView } from './components/InventoryStockView';
import { InvoicesManager } from './components/InvoicesManager';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { OrderBuilderModal } from './components/OrderBuilderModal';
import { ProductCatalog } from './components/ProductCatalog';
import { UserManager } from './components/UserManager';
import { AppProvider, useApp } from './context/AppContext';
import { Invoice } from './types';

const MainLayout: React.FC = () => {
  const { cart, isOffline, currentUser, isAuthenticated, getCartSummary } = useApp();

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

      {/* Content Container with bottom padding for mobile navigation bar */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 pb-24 md:pb-8">
        {activeTab === 'catalog' && (
          <ProductCatalog onOpenCart={() => setIsOrderModalOpen(true)} />
        )}

        {activeTab === 'invoices' && (
          <InvoicesManager
            onOpenNewOrder={() => setIsOrderModalOpen(true)}
            onViewInvoice={(inv) => setViewingInvoice(inv)}
          />
        )}

        {activeTab === 'inventory' && <InventoryStockView />}

        {activeTab === 'excel' && <ExcelImportExport />}

        {activeTab === 'cloudinary' && <CloudinaryManager />}

        {activeTab === 'users' && <UserManager />}

        {activeTab === 'accounting' && <AccountingSyncView />}
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

      {/* Order & Cart Builder Modal */}
      <OrderBuilderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onInvoiceCreated={(inv) => {
          setIsOrderModalOpen(false);
          setViewingInvoice(inv);
        }}
      />

      {/* Electronic Invoice Modal */}
      <ElectronicInvoiceModal
        isOpen={!!viewingInvoice}
        invoice={viewingInvoice}
        onClose={() => setViewingInvoice(null)}
      />

      {/* Bottom Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 print:hidden mb-16 md:mb-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-900">شركة دريم طنطاوي للتجارة والتوزيع</span>
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

export function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
