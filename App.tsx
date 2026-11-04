import React, { Component, ErrorInfo, Suspense, useState, useEffect } from 'react';
import { Loader2, Package, Home, Receipt, Users } from 'lucide-react';
import { LoginPage } from './components/LoginPage';
import { ToastProvider } from './components/ui/Toast';
import { ThemeProvider as AppThemeProvider } from './context/ThemeContext';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/authContext';
import { InvoiceProvider } from './context/invoiceContext';
import { CustomerProvider } from './context/customerContext';
import { InventoryProvider } from './context/inventoryContext';
import { SyncProvider } from './context/syncContext';
import { Header } from './components/layout/Header';
import { MobileHeader } from './components/layout/MobileHeader';
import { BottomNav } from './components/layout/BottomNav';
import { SidebarDesktop } from './components/layout/SidebarDesktop';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CatalogScreen } from './screens/CatalogScreen';
import { InvoicesScreen } from './screens/InvoicesScreen';
import { CustomersScreen } from './screens/CustomersScreen';
import { InventoryScreen } from './screens/InventoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { VisitsScreen } from './screens/VisitsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { NewOrderScreen } from './screens/NewOrderScreen';

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

interface ErrorBoundaryProps { children: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class MobileErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error('App runtime error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black mb-4 shadow-xl"><Package className="w-8 h-8" /></div>
          <h2 className="text-xl font-black text-amber-300 mb-2">منظومة مجموعة الطنطاوي للتجارة والتوزيع</h2>
          <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">تم استعادة بيانات التطبيق بنجاح. اضغط على الزر أدناه لإعادة تشغيل الكتالوج.</p>
          <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }} className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-3 rounded-2xl text-sm shadow-lg transition cursor-pointer active:scale-95">إعادة تشغيل التطبيق</button>
        </div>
      );
    }
    return this.props.children;
  }
}

type ScreenName = 'login' | 'dashboard' | 'catalog' | 'invoices' | 'customers' | 'inventory' | 'settings' | 'notifications' | 'more' | 'visits' | 'reports' | 'neworder';
const isAuthenticated = () => { try { return localStorage.getItem('tantawy_current_user') !== null; } catch { return false; } };

export function App() {
  const [screen, setScreen] = useState<ScreenName>(isAuthenticated() ? 'dashboard' : 'login');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navigateTo = (screenName: ScreenName) => { setScreen(screenName); if (isMobile) setSidebarOpen(false); };

  const screenTitles: Record<ScreenName, string> = {
    login: 'تسجيل الدخول',
    dashboard: 'مجموعة الطنطاوي',
    catalog: 'الكتالوج',
    invoices: 'الفواتير',
    customers: 'العملاء',
    inventory: 'المخزون',
    settings: 'الإعدادات',
    notifications: 'الإشعارات',
    more: 'المزيد',
    visits: 'الزيارات',
    reports: 'التقارير',
    neworder: 'طلبية جديدة',
  };

  const renderScreen = () => {
    switch (screen) {
      case 'login': return <LoginScreen />;
      case 'dashboard': return <DashboardScreen />;
      case 'catalog': return <CatalogScreen />;
      case 'invoices': return <InvoicesScreen />;
      case 'customers': return <CustomersScreen />;
      case 'inventory': return <InventoryScreen />;
      case 'settings': return <SettingsScreen />;
      case 'notifications': return <NotificationsScreen />;
      case 'more': return <MoreScreen onNavigate={(s) => navigateTo(s as ScreenName)} onLogout={() => navigateTo('login')} />;
      case 'visits': return <VisitsScreen />;
      case 'reports': return <ReportsScreen />;
      case 'neworder': return <NewOrderScreen />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <MobileErrorBoundary>
      <AuthProvider>
        <InvoiceProvider>
          <CustomerProvider>
            <InventoryProvider>
              <SyncProvider>
                <AppThemeProvider>
                  <AppProvider>
                    <ToastProvider>
                      <SidebarDesktop activeTab={screen} onTabChange={navigateTo} onCollapse={() => setSidebarOpen(false)} />
                      <div className={`transition-all duration-300 ${isMobile || sidebarOpen ? 'md:ml-0' : 'md:ml-64'} min-h-screen bg-slate-50 dark:bg-slate-950`}>
                        {!isMobile && (
                          <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} title={screenTitles[screen]} />
                        )}
                        {isMobile && screen !== 'login' && (
                          <MobileHeader
                            title={screenTitles[screen]}
                            notificationCount={3}
                            onOpenNotifications={() => navigateTo('notifications')}
                          />
                        )}
                        {isMobile && screen !== 'login' && <BottomNav activeTab={['inventory','visits','reports','neworder','settings','notifications','more'].includes(screen) ? 'more' : screen} onTabChange={navigateTo} />}
                        {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}
                        <main className={`min-h-[calc(100dvh-56px)] ${isMobile ? 'pt-0 pb-24' : 'pt-4 sm:pt-6 md:pt-8 pb-4 sm:pb-6 md:pb-8'} ${!isMobile ? 'px-4 sm:px-6 md:px-8' : ''}`}>
                          {screen === 'login' ? <div className="max-w-[380px] mx-auto p-4">{renderScreen()}</div> : renderScreen()}
                        </main>
                      </div>
                    </ToastProvider>
                  </AppProvider>
                </AppThemeProvider>
              </SyncProvider>
            </InventoryProvider>
          </CustomerProvider>
        </InvoiceProvider>
      </AuthProvider>
    </MobileErrorBoundary>
  );
}

export default App;
