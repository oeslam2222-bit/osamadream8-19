import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Eye,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';

type StatCard = {
  label: string;
  value: string;
  change: string;
  tone: 'teal' | 'blue' | 'orange' | 'navy';
  icon: typeof Users;
};

type BarDatum = {
  month: string;
  value: number;
};

const stats: StatCard[] = [
  { label: 'إجمالي المبيعات', value: '12,450,000', change: '+12.5%', tone: 'teal', icon: CircleDollarSign },
  { label: 'إجمالي التحصيل', value: '9,820,000', change: '+8.2%', tone: 'blue', icon: WalletCards },
  { label: 'إجمالي المديونية', value: '1,248,000', change: '+18.4%', tone: 'orange', icon: Users },
  { label: 'إجمالي المستحقات', value: '1,382,000', change: '+6.8%', tone: 'navy', icon: FileText },
];

const revenueData: BarDatum[] = [
  { month: 'يناير', value: 54 },
  { month: 'فبراير', value: 72 },
  { month: 'مارس', value: 61 },
  { month: 'أبريل', value: 84 },
  { month: 'مايو', value: 68 },
  { month: 'يونيو', value: 92 },
  { month: 'يوليو', value: 78 },
  { month: 'أغسطس', value: 97 },
  { month: 'سبتمبر', value: 86 },
  { month: 'أكتوبر', value: 100 },
];

const invoices = [
  { id: 'INV-00123', client: 'مؤسسة النور', amount: '1,500 ر.س', date: '24 أكتوبر 2026', status: 'مدفوعة', statusClass: 'paid' },
  { id: 'INV-00124', client: 'شركة الأفق', amount: '2,800 ر.س', date: '23 أكتوبر 2026', status: 'معلقة', statusClass: 'pending' },
  { id: 'INV-00125', client: 'مركز الحياة', amount: '950 ر.س', date: '22 أكتوبر 2026', status: 'مدفوعة', statusClass: 'paid' },
  { id: 'INV-00126', client: 'مؤسسة الإبداع', amount: '1,200 ر.س', date: '21 أكتوبر 2026', status: 'متأخرة', statusClass: 'late' },
];

const activities = [
  { title: 'تم تسجيل زيارة جديدة', detail: 'مؤسسة النور · منذ 12 دقيقة', icon: CalendarDays, tone: 'teal' },
  { title: 'تمت إضافة عميل جديد', detail: 'شركة الأفق للتجارة · منذ 48 دقيقة', icon: Users, tone: 'blue' },
  { title: 'تم سداد فاتورة', detail: 'INV-00123 · منذ ساعتين', icon: WalletCards, tone: 'orange' },
  { title: 'تم تحديث ملف العميل', detail: 'مركز الحياة الطبي · منذ 3 ساعات', icon: ShieldCheck, tone: 'green' },
];

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState('آخر 10 أشهر');
  const [currentView, setCurrentView] = useState<'dashboard' | 'employees'>('dashboard');

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={24} strokeWidth={2.4} /></div>
          <div>
            <strong>طنطاوي جروب</strong>
            <span>Tantawy Group</span>
          </div>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">م</div>
          <div>
            <small>مساحة العمل</small>
            <strong>الإدارة الرئيسية</strong>
          </div>
          <ChevronDown size={16} />
        </div>

        <nav className="main-nav" aria-label="القائمة الرئيسية">
          <p className="nav-label">الرئيسية</p>
          <NavItem icon={LayoutDashboard} label="لوحة التحكم" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
          <NavItem icon={BarChart3} label="التقارير والتحليلات" />
          <NavItem icon={Users} label="العملاء" />
          <NavItem icon={CalendarDays} label="الزيارات" />
          <NavItem icon={FileText} label="الفواتير" />
          <p className="nav-label nav-label-spaced">الإدارة</p>
          <NavItem icon={BriefcaseBusiness} label="الموظفون والصلاحيات" active={currentView === 'employees'} onClick={() => setCurrentView('employees')} />
          <NavItem icon={Settings} label="الإعدادات" />
        </nav>

        <div className="sidebar-footer">
          <div className="support-card">
            <div className="support-icon"><ShieldCheck size={18} /></div>
            <div><strong>هل تحتاج مساعدة؟</strong><span>تواصل مع فريق الدعم</span></div>
          </div>
          <button className="logout-button"><LogOut size={18} /> تسجيل الخروج</button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-backdrop" aria-label="إغلاق القائمة" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="فتح القائمة" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button>
          <div className="breadcrumb"><span>الرئيسية</span><span>/</span><strong>لوحة التحكم</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="البحث"><Search size={19} /></button>
            <button className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} /><i /></button>
            <div className="profile">
              <div className="profile-avatar">أح</div>
              <div className="profile-copy"><strong>أحمد حسن</strong><span>مدير النظام</span></div>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <div className="page-content">
          {currentView === 'employees' ? <EmployeesView /> : <>
          <section className="welcome-row">
            <div>
              <p className="eyebrow">السبت، 24 أكتوبر 2026</p>
              <h1>مرحباً بك، أحمد <span>!</span></h1>
              <p className="page-subtitle">إليك نظرة سريعة على أداء العمل اليوم.</p>
            </div>
            <button className="primary-button"><FileText size={18} /> إنشاء تقرير</button>
          </section>

          <section className="stats-grid">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return <article className={`stat-card ${stat.tone}`} key={stat.label}>
                <div className="stat-top"><div className="stat-icon"><Icon size={20} /></div><button className="more-button" aria-label="خيارات"><MoreHorizontal size={19} /></button></div>
                <p>{stat.label}</p>
                <div className="stat-bottom"><strong>{stat.value}</strong><span className={stat.change.startsWith('-') ? 'negative' : ''}>{stat.change}</span></div>
              </article>;
            })}
          </section>

          <section className="dashboard-grid">
            <article className="panel revenue-panel">
              <div className="panel-heading">
                <div><h2>تحليل الإيرادات</h2><p>مقارنة الإيرادات الشهرية خلال العام</p></div>
                <label className="select-wrap"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>آخر 10 أشهر</option><option>آخر 6 أشهر</option><option>هذا العام</option></select><ChevronDown size={15} /></label>
              </div>
              <div className="legend"><span><i className="legend-dot current" /> الإيرادات الفعلية</span><span><i className="legend-dot target" /> المستهدف</span></div>
              <div className="chart-wrap">
                <div className="chart-y-axis"><span>100K</span><span>75K</span><span>50K</span><span>25K</span><span>0</span></div>
                <div className="bar-chart">
                  <div className="chart-gridlines"><i /><i /><i /><i /><i /></div>
                  <div className="bars">{revenueData.map((item, index) => <div className="bar-column" key={item.month}><div className={`bar-value ${index === revenueData.length - 1 ? 'highlighted' : ''}`} style={{ height: `${item.value}%` }}><span>{item.value}K</span></div><small>{item.month}</small></div>)}</div>
                </div>
              </div>
            </article>

            <article className="panel distribution-panel">
              <div className="panel-heading"><div><h2>توزيع العملاء</h2><p>حسب نوع النشاط</p></div><button className="more-button"><MoreHorizontal size={19} /></button></div>
              <div className="donut-wrap"><div className="donut"><div className="donut-center"><strong>248</strong><span>عميل نشط</span></div></div></div>
              <div className="distribution-list"><DistributionRow label="شركات" value="42%" color="teal" /><DistributionRow label="مؤسسات" value="31%" color="blue" /><DistributionRow label="أفراد" value="18%" color="orange" /><DistributionRow label="أخرى" value="9%" color="gray" /></div>
            </article>
          </section>

          <section className="lower-grid">
            <article className="panel table-panel">
              <div className="panel-heading"><div><h2>آخر الفواتير</h2><p>متابعة الفواتير والمدفوعات الأخيرة</p></div><button className="text-button">عرض الكل <span>←</span></button></div>
              <div className="table-scroll"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td className="invoice-id">{invoice.id}</td><td>{invoice.client}</td><td>{invoice.amount}</td><td>{invoice.date}</td><td><span className={`status ${invoice.statusClass}`}>{invoice.status}</span></td></tr>)}</tbody></table></div>
            </article>
            <article className="panel activity-panel"><div className="panel-heading"><div><h2>آخر النشاطات</h2><p>تحديثات مباشرة من النظام</p></div><button className="more-button"><MoreHorizontal size={19} /></button></div><div className="activity-list">{activities.map((item) => { const Icon = item.icon; return <div className="activity-item" key={item.title}><div className={`activity-icon ${item.tone}`}><Icon size={17} /></div><div><strong>{item.title}</strong><span>{item.detail}</span></div><ChevronDown className="activity-arrow" size={16} /></div>; })}</div></article>
          </section>
          </>}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon: Icon, label, active = false, onClick }: { icon: typeof LayoutDashboard; label: string; active?: boolean; onClick?: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><Icon size={19} /><span>{label}</span>{active && <i />}</button>;
}

function EmployeesView() {
  const [activeTab, setActiveTab] = useState<'employees' | 'permissions'>('employees');
  const [selectedRole, setSelectedRole] = useState('مشرف');
  const [showAddForm, setShowAddForm] = useState(false);
  const [employees, setEmployees] = useState([
    { name: 'أحمد حسن', email: 'ahmed@tantawy-group.com', role: 'مدير النظام', branch: 'الإدارة الرئيسية', status: 'نشط', initials: 'أح', color: 'teal' },
    { name: 'محمد علي', email: 'mohamed@tantawy-group.com', role: 'مدير فرع', branch: 'فرع مدينة نصر', status: 'نشط', initials: 'مع', color: 'blue' },
    { name: 'سارة محمود', email: 'sara@tantawy-group.com', role: 'مشرف', branch: 'فرع المعادي', status: 'نشط', initials: 'سم', color: 'orange' },
    { name: 'خالد سمير', email: 'khaled@tantawy-group.com', role: 'مندوب', branch: 'فرع أكتوبر', status: 'موقوف', initials: 'خس', color: 'navy' },
  ]);

  const roles = [
    { name: 'مدير النظام', description: 'صلاحية كاملة على جميع أجزاء النظام', count: '1 مستخدم', tone: 'teal', icon: LockKeyhole },
    { name: 'مدير الإدارة', description: 'إدارة الفروع والتقارير والموظفين', count: '2 مستخدمين', tone: 'blue', icon: BriefcaseBusiness },
    { name: 'مدير فرع', description: 'إدارة بيانات ومبيعات الفرع التابع له', count: '4 مستخدمين', tone: 'orange', icon: ShieldCheck },
    { name: 'مشرف', description: 'متابعة الفريق والزيارات اليومية', count: '8 مستخدمين', tone: 'green', icon: Eye },
    { name: 'مندوب', description: 'العملاء والزيارات المسندة إليه فقط', count: '16 مستخدم', tone: 'gray', icon: UsersRound },
    { name: 'مجلس الإدارة', description: 'عرض المؤشرات والتقارير المختارة', count: '3 مستخدمين', tone: 'navy', icon: BarChart3 },
  ];

  const screenGroups = [
    { title: 'الشاشات الرئيسية', screens: [{ name: 'لوحة التحكم', hint: 'المؤشرات والملخص العام', enabled: true }, { name: 'التقارير والتحليلات', hint: 'مخططات ونتائج الأداء', enabled: true }, { name: 'الإشعارات', hint: 'التنبيهات والتحديثات', enabled: true }] },
    { title: 'إدارة العمليات', screens: [{ name: 'العملاء', hint: 'إضافة ومتابعة ملفات العملاء', enabled: true }, { name: 'الزيارات', hint: 'تسجيل ومراجعة الزيارات', enabled: true }, { name: 'الفواتير', hint: 'المبيعات والتحصيلات', enabled: false }] },
    { title: 'الإدارة والصلاحيات', screens: [{ name: 'الموظفون والصلاحيات', hint: 'إدارة المستخدمين والأدوار', enabled: false }, { name: 'إعدادات النظام', hint: 'البيانات العامة للنظام', enabled: false }] },
  ];

  const toggleEmployee = (name: string) => setEmployees((items) => items.map((employee) => employee.name === name ? { ...employee, status: employee.status === 'نشط' ? 'موقوف' : 'نشط' } : employee));

  return <div className="employees-view">
    <section className="employees-hero">
      <div><p className="eyebrow">الإدارة والتحكم في الوصول</p><h1>الموظفون والصلاحيات</h1><p className="page-subtitle">تحكم في المستخدمين، الأدوار، والشاشات التي يمكن لكل فريق الوصول إليها.</p></div>
      <button className="primary-button" onClick={() => setShowAddForm(!showAddForm)}><UserPlus size={18} /> إضافة مستخدم</button>
    </section>
    <div className="permission-summary"><div className="summary-icon"><ShieldCheck size={22} /></div><div><strong>نظام الصلاحيات جاهز للتخصيص</strong><span>أنشئ دورًا مناسبًا لكل مستوى إداري، وحدد له الشاشات التي يحتاجها فقط.</span></div><div className="summary-stats"><div><strong>6</strong><span>أدوار</span></div><div><strong>{employees.length}</strong><span>مستخدمين</span></div><div><strong>8</strong><span>شاشات</span></div></div></div>
    {showAddForm && <div className="add-user-bar"><div><strong>إضافة مستخدم جديد</strong><span>سيتمكن المستخدم من الدخول حسب الدور المحدد له.</span></div><div className="add-user-fields"><input placeholder="اسم الموظف" aria-label="اسم الموظف" /><input placeholder="البريد الإلكتروني" aria-label="البريد الإلكتروني" /><button className="primary-button" onClick={() => setShowAddForm(false)}>حفظ المستخدم</button></div></div>}
    <div className="view-tabs"><button className={activeTab === 'employees' ? 'active' : ''} onClick={() => setActiveTab('employees')}><UsersRound size={17} /> قائمة الموظفين <span>{employees.length}</span></button><button className={activeTab === 'permissions' ? 'active' : ''} onClick={() => setActiveTab('permissions')}><LockKeyhole size={17} /> تحديد الشاشات والصلاحيات</button></div>
    {activeTab === 'employees' ? <div className="employees-layout"><section className="panel employees-table-panel"><div className="panel-heading"><div><h2>قائمة الموظفين</h2><p>إدارة حالة المستخدمين والأدوار المسندة إليهم</p></div><button className="filter-button">كل الفروع <ChevronDown size={14} /></button></div><div className="employee-table"><div className="employee-table-head"><span>الموظف</span><span>الدور</span><span>الفرع</span><span>الحالة</span><span>إجراء</span></div>{employees.map((employee) => <div className="employee-row" key={employee.email}><div className="employee-person"><div className={`employee-avatar ${employee.color}`}>{employee.initials}</div><div><strong>{employee.name}</strong><span>{employee.email}</span></div></div><span className="role-pill">{employee.role}</span><span className="branch-name">{employee.branch}</span><span className={`employee-status ${employee.status === 'نشط' ? 'active' : 'paused'}`}><i />{employee.status}</span><button className="toggle-status" onClick={() => toggleEmployee(employee.name)}>{employee.status === 'نشط' ? 'إيقاف' : 'تفعيل'}</button></div>)}</div></section><aside className="panel roles-panel"><div className="panel-heading"><div><h2>الأدوار المتاحة</h2><p>مستويات الوصول في النظام</p></div><button className="more-button"><MoreHorizontal size={19} /></button></div><div className="roles-list">{roles.map((role) => { const Icon = role.icon; return <button className={`role-card ${selectedRole === role.name ? 'selected' : ''}`} key={role.name} onClick={() => { setSelectedRole(role.name); setActiveTab('permissions'); }}><div className={`role-icon ${role.tone}`}><Icon size={17} /></div><div><strong>{role.name}</strong><span>{role.description}</span><small>{role.count}</small></div><ChevronDown size={15} /></button>; })}</div></aside></div> : <div className="permissions-layout"><section className="panel screen-permissions-panel"><div className="permission-header"><div><p className="eyebrow">الدور المحدد</p><h2>{selectedRole}</h2><p>اختر الشاشات التي يستطيع هذا الدور الوصول إليها.</p></div><button className="save-permissions"><Check size={16} /> حفظ التعديلات</button></div><div className="screen-groups">{screenGroups.map((group) => <div className="screen-group" key={group.title}><h3>{group.title}</h3>{group.screens.map((screen) => <div className="screen-row" key={screen.name}><div className={`screen-check ${screen.enabled ? 'checked' : ''}`}>{screen.enabled && <Check size={14} />}</div><div><strong>{screen.name}</strong><span>{screen.hint}</span></div><span className={`access-label ${screen.enabled ? 'allowed' : 'restricted'}`}>{screen.enabled ? 'مسموح' : 'غير مسموح'}</span></div>)}</div>)}</div></section><aside className="panel role-preview-panel"><div className="panel-heading"><div><h2>معاينة الصلاحيات</h2><p>ما يراه {selectedRole}</p></div><Eye size={18} className="preview-icon" /></div><div className="preview-card"><div className="preview-avatar">{selectedRole.slice(0, 1)}</div><strong>{selectedRole}</strong><span>صلاحيات مخصصة حسب طبيعة العمل</span></div><div className="preview-note"><ShieldCheck size={17} /><span>يمكن تعديل الصلاحيات في أي وقت دون التأثير على بيانات المستخدمين.</span></div></aside></div>}
  </div>;
}

function DistributionRow({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="distribution-row"><span><i className={`legend-dot ${color}`} />{label}</span><strong>{value}</strong></div>;
}

export default App;
