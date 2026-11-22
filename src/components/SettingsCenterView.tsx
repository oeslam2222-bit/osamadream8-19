import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Boxes,
  Building2,
  Check,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Shield,
  Sparkles,
  Sun,
  User
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';
import { changeOwnPassword } from '../services/authService';
import { CANONICAL_BRANCHES } from '../services/branchDirectory';
import '../styles/settings-center.css';

type SettingsTab = 'profile' | 'appearance' | 'notifications' | 'branches' | 'data';

interface SettingsCenterViewProps {
  onNavigate?: (tab: string) => void;
}

const NOTIFY_KEY = 'tantawy_settings_notify';

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  developer: 'مطور',
  branch_manager: 'مدير فرع',
  supervisor: 'مشرف',
  sales_rep: 'مندوب مبيعات',
  warehouse_keeper: 'أمين مخزن',
  legal_advisor: 'مستشار قانوني'
};

const SECTOR_LABELS: Record<string, string> = {
  home: 'منزلي',
  electrical: 'كهربائي',
  both: 'منزلي وكهربائي',
  all: 'الإدارة (منزلي / كهربائي)'
};

interface NotifySettings {
  newOrders: boolean;
  stockAlerts: boolean;
  weeklyReport: boolean;
}

const defaultNotify: NotifySettings = {
  newOrders: true,
  stockAlerts: true,
  weeklyReport: false
};

const readNotify = (): NotifySettings => {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (!raw) return defaultNotify;
    const parsed = JSON.parse(raw);
    return { ...defaultNotify, ...parsed };
  } catch {
    return defaultNotify;
  }
};

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ElementType }> = [
  { id: 'profile', label: 'الملف الشخصي', icon: User },
  { id: 'appearance', label: 'المظهر والواجهة', icon: Palette },
  { id: 'notifications', label: 'الإشعارات', icon: Bell },
  { id: 'branches', label: 'الفروع', icon: Building2 },
  { id: 'data', label: 'البيانات والصلاحيات', icon: Database }
];

export const SettingsCenterView: React.FC<SettingsCenterViewProps> = ({ onNavigate }) => {
  const { currentUser } = useApp();
  const { isDark, setTheme } = useTheme();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [notify, setNotify] = useState<NotifySettings>(readNotify);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFY_KEY, JSON.stringify(notify));
    } catch {}
  }, [notify]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwFeedback(null);

    if (!currentPassword.trim()) {
      setPwFeedback({ tone: 'err', text: 'يرجى إدخال كلمة المرور الحالية.' });
      return;
    }
    if (newPassword.trim().length < 6) {
      setPwFeedback({ tone: 'err', text: 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف.' });
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setPwFeedback({ tone: 'err', text: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' });
      return;
    }

    setPwSaving(true);
    const res = await changeOwnPassword({
      currentPassword,
      newPassword,
    });
    setPwSaving(false);

    if (!res.success) {
      setPwFeedback({ tone: 'err', text: res.message });
      return;
    }

    setPwFeedback({ tone: 'ok', text: res.message });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const initials = useMemo(() => {
    const name = (currentUser?.name || '').trim();
    if (!name) return '؟';
    return name.slice(0, 1);
  }, [currentUser?.name]);

  const toggleNotify = (key: keyof NotifySettings) =>
    setNotify((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="sc-page">
      {/* ---------- الرأس ---------- */}
      <header className="sc-head ds-pagehead">
        <div>
          <span className="sc-head__eyebrow">الرئيسية / الإعدادات</span>
          <h1>مركز الإعدادات</h1>
          <p>
            كل ما يخص حسابك والفروع والمظهر والإشعارات في مكان واحد — بنفس هوية
            التطبيق في الوضع النهاري والليلي.
          </p>
        </div>
        <div className="sc-head__actions">
          <button
            type="button"
            className="sc-headbtn"
            onClick={() => setTheme(!isDark)}
            aria-pressed={isDark}
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
            {isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
          </button>
          {onNavigate && (
            <button
              type="button"
              className="sc-headbtn sc-headbtn--solid"
              onClick={() => onNavigate('guide')}
            >
              <Sparkles size={13} />
              دليل الاستخدام
            </button>
          )}
        </div>
      </header>

      {/* ---------- التبويبات ---------- */}
      <nav className="sc-tabs" role="tablist" aria-label="أقسام الإعدادات">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              data-active={tab === item.id}
              className="sc-tab"
              onClick={() => setTab(item.id)}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* ---------- الملف الشخصي ---------- */}
      {tab === 'profile' && (
        <div className="sc-grid">
          <section className="sc-card">
            <div className="sc-card__head">
              <span className="sc-card__title">
                <User size={14} />
                بيانات الحساب
              </span>
              <span className="sc-card__hint">تتعدّل من شاشة الفريق</span>
            </div>

            <div className="sc-profile">
              <div className="sc-avatar">{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="sc-profile__name">{currentUser?.name || 'مستخدم'}</div>
                <div className="sc-profile__meta">
                  {ROLE_LABELS[currentUser?.role || ''] || 'مستخدم'} ·{' '}
                  {currentUser?.branchName || 'غير محدد'}
                </div>
                <div className="sc-chips">
                  {currentUser?.code && <span className="sc-chip">كود: {currentUser.code}</span>}
                  {currentUser?.sector && (
                    <span className="sc-chip sc-chip--info">
                      {SECTOR_LABELS[currentUser.sector] || currentUser.sector}
                    </span>
                  )}
                  <span className="sc-chip sc-chip--ok">حساب نشط</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="sc-row">
                <div className="sc-row__icon sc-row__icon--navy">
                  <User size={15} />
                </div>
                <div className="sc-row__body">
                  <div className="sc-row__title">اسم المستخدم</div>
                  <div className="sc-row__sub">{currentUser?.username || '—'}</div>
                </div>
              </div>
              <div className="sc-row">
                <div className="sc-row__icon sc-row__icon--teal">
                  <Bell size={15} />
                </div>
                <div className="sc-row__body">
                  <div className="sc-row__title">رقم الهاتف</div>
                  <div className="sc-row__sub">{currentUser?.phone || 'غير مسجل'}</div>
                </div>
              </div>
              <div className="sc-row">
                <div className="sc-row__icon sc-row__icon--violet">
                  <Shield size={15} />
                </div>
                <div className="sc-row__body">
                  <div className="sc-row__title">المشرف المباشر</div>
                  <div className="sc-row__sub">{currentUser?.supervisorName || '—'}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="sc-card">
            <div className="sc-card__head">
              <span className="sc-card__title">
                <Boxes size={14} />
                ملخص سريع
              </span>
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--amber">
                <Building2 size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">عدد الفروع المعتمدة</div>
                <div className="sc-row__sub">{CANONICAL_BRANCHES.length} فروع في الدليل الموحّد</div>
              </div>
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--teal">
                <Palette size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">الوضع الحالي للواجهة</div>
                <div className="sc-row__sub">{isDark ? 'ليلي — كحلي داكن وكروت فاتحة' : 'نهاري — خلفية فاتحة وكروت بيضاء'}</div>
              </div>
              <button type="button" className="sc-btn sc-btn--ghost" onClick={() => setTheme(!isDark)}>
                تغيير
              </button>
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--navy">
                <Bell size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">إشعارات مفعّلة</div>
                <div className="sc-row__sub">
                  {Object.values(notify).filter(Boolean).length} من {Object.keys(notify).length}
                </div>
              </div>
              <button type="button" className="sc-btn sc-btn--ghost" onClick={() => setTab('notifications')}>
                إدارة
              </button>
            </div>
          </section>

          <section className="sc-card" style={{ gridColumn: '1 / -1' }}>
            <div className="sc-card__head">
              <span className="sc-card__title">
                <KeyRound size={14} />
                تغيير كلمة المرور مباشرة (بدون إيميل)
              </span>
              <span className="sc-card__hint">
                البريد المسجل: {currentUser?.email || '—'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mb-3 leading-relaxed">
              تقدر تغيّر كلمة المرور الصعبة أو العشوائية لحسابك إلى كلمة مرور سهلة الحفظ من هنا مباشرة، بدون إرسال أي رسالة لبريد إلكتروني.
            </p>

            {pwFeedback && (
              <div
                className={`mb-3 p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  pwFeedback.tone === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                }`}
              >
                {pwFeedback.tone === 'ok' ? (
                  <Check size={15} className="shrink-0" />
                ) : (
                  <AlertCircle size={15} className="shrink-0" />
                )}
                <span>{pwFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-200 mb-1">
                  كلمة المرور الحالية
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="اكتب كلمة المرور الحالية"
                    autoComplete="current-password"
                    className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showCurrentPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-200 mb-1">
                  كلمة المرور الجديدة (6 أحرف على الأقل)
                </label>
                <div className="relative">
                  <KeyRound size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="مثال: Osama@2026"
                    autoComplete="new-password"
                    className="w-full pr-9 pl-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showNewPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-200 mb-1">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور الجديدة"
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs font-bold"
                />
              </div>

              <div className="sm:col-span-3 flex items-center justify-between gap-3 flex-wrap pt-1">
                {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('users')}
                    className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    تغيير كلمة مرور موظف آخر من شاشة الفريق والصلاحيات ←
                  </button>
                ) : (
                  <span className="text-[11px] font-bold text-slate-500">
                    يتم الحفظ مباشرة على حسابك دون الحاجة لفتح البريد الإلكتروني.
                  </span>
                )}

                <button
                  type="submit"
                  disabled={pwSaving}
                  className="sc-btn sc-btn--primary disabled:opacity-60"
                >
                  <KeyRound size={13} />
                  <span>{pwSaving ? 'جاري التحديث...' : 'حفظ كلمة المرور الجديدة'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ---------- المظهر ---------- */}
      {tab === 'appearance' && (
        <section className="sc-card">
          <div className="sc-card__head">
            <span className="sc-card__title">
              <Palette size={14} />
              المظهر والواجهة
            </span>
            <span className="sc-card__hint">التغيير فوري على كل الصفحات</span>
          </div>

          <div className="sc-row">
            <div className="sc-row__icon sc-row__icon--navy">
              {isDark ? <Moon size={15} /> : <Sun size={15} />}
            </div>
            <div className="sc-row__body">
              <div className="sc-row__title">الوضع الليلي</div>
              <div className="sc-row__sub">
                خلفية كحلي داكن `#0B1220` وكروت أفتح `#111C2E` بحدود واضحة — مفيش أسود على أسود
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              aria-label="الوضع الليلي"
              className="sc-switch"
              data-on={isDark}
              onClick={() => setTheme(!isDark)}
            >
              <span className="sc-switch__knob" />
            </button>
          </div>

          <div className="sc-row">
            <div className="sc-row__icon sc-row__icon--teal">
              <Check size={15} />
            </div>
            <div className="sc-row__body">
              <div className="sc-row__title">ألوان المؤشرات</div>
              <div className="sc-row__sub">أزرق للمبيعات · فيروزي للقطع · عنبري للتنبيهات · بنفسجي للعروض</div>
            </div>
          </div>

          <div className="sc-chips" style={{ marginTop: 12 }}>
            <span className="sc-chip sc-chip--info">أزرق #2563EB</span>
            <span className="sc-chip sc-chip--ok">فيروزي #0D9488</span>
            <span className="sc-chip" style={{ borderColor: '#f4dfb7', background: '#fdf4e4', color: '#b45309' }}>
              عنبري #D97706
            </span>
            <span className="sc-chip" style={{ borderColor: '#ded3fb', background: '#f3efff', color: '#6d28d9' }}>
              بنفسجي #7C3AED
            </span>
          </div>
        </section>
      )}

      {/* ---------- الإشعارات ---------- */}
      {tab === 'notifications' && (
        <section className="sc-card">
          <div className="sc-card__head">
            <span className="sc-card__title">
              <Bell size={14} />
              الإشعارات
            </span>
            <span className="sc-card__hint">محفوظة على هذا الجهاز</span>
          </div>

          {[
            {
              key: 'newOrders' as const,
              title: 'طلبات بيع جديدة',
              sub: 'تنبيه فوري لما ييجي طلب جديد محتاج اعتماد',
              tone: 'navy' as const
            },
            {
              key: 'stockAlerts' as const,
              title: 'تنبيهات المخزون',
              sub: 'لما رصيد صنف يوصل للحد الأدنى في فرع',
              tone: 'amber' as const
            },
            {
              key: 'weeklyReport' as const,
              title: 'تقرير أسبوعي',
              sub: 'ملخص مبيعات وتحصيلات كل أسبوع',
              tone: 'teal' as const
            }
          ].map((item) => (
            <div className="sc-row" key={item.key}>
              <div className={`sc-row__icon sc-row__icon--${item.tone}`}>
                <Bell size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">{item.title}</div>
                <div className="sc-row__sub">{item.sub}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notify[item.key]}
                aria-label={item.title}
                className="sc-switch"
                data-on={notify[item.key]}
                onClick={() => toggleNotify(item.key)}
              >
                <span className="sc-switch__knob" />
              </button>
            </div>
          ))}
        </section>
      )}

      {/* ---------- الفروع ---------- */}
      {tab === 'branches' && (
        <section className="sc-card">
          <div className="sc-card__head">
            <span className="sc-card__title">
              <Building2 size={14} />
              الفروع المعتمدة
            </span>
            <span className="sc-card__hint">الفروع السبعة الموحّدة في كل التقارير</span>
          </div>
          <div className="sc-branches">
            {CANONICAL_BRANCHES.map((branch) => (
              <div className="sc-branch" key={branch}>
                <span className="sc-branch__name">{branch}</span>
                <span className="sc-branch__dot" />
              </div>
            ))}
          </div>
          <div className="sc-actions" style={{ marginTop: 14 }}>
            {onNavigate && (
              <button type="button" className="sc-btn sc-btn--blue" onClick={() => onNavigate('product_sales')}>
                تحليل مبيعات الفروع
              </button>
            )}
            {onNavigate && (
              <button type="button" className="sc-btn sc-btn--ghost" onClick={() => onNavigate('catalog')}>
                الكتالوج والأرصدة
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---------- البيانات والصلاحيات ---------- */}
      {tab === 'data' && (
        <div className="sc-grid">
          <section className="sc-card">
            <div className="sc-card__head">
              <span className="sc-card__title">
                <FileSpreadsheet size={14} />
                البيانات والملفات
              </span>
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--teal">
                <FileSpreadsheet size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">استيراد الإكسل</div>
                <div className="sc-row__sub">أرصدة، عروض، عملاء، مبيعات أصناف</div>
              </div>
              {onNavigate && (
                <button type="button" className="sc-btn sc-btn--teal" onClick={() => onNavigate('excel')}>
                  فتح
                </button>
              )}
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--navy">
                <Database size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">قاعدة العملاء</div>
                <div className="sc-row__sub">كود العميل وربطه بالمندوب والفرع</div>
              </div>
              {onNavigate && (
                <button type="button" className="sc-btn sc-btn--ghost" onClick={() => onNavigate('all_customers')}>
                  فتح
                </button>
              )}
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--amber">
                <Database size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">مزامنة معلقة (إدارة الطابور)</div>
                <div className="sc-row__sub">مراجعة وحذف العمليات العالقة وتقليل الـ Egress</div>
              </div>
              {onNavigate && (
                <button type="button" className="sc-btn sc-btn--ghost" onClick={() => onNavigate('pending_sync')}>
                  فتح
                </button>
              )}
            </div>
          </section>

          <section className="sc-card">
            <div className="sc-card__head">
              <span className="sc-card__title">
                <Shield size={14} />
                الصلاحيات والأمان
              </span>
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--violet">
                <Shield size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">صلاحياتك الحالية</div>
                <div className="sc-row__sub">{ROLE_LABELS[currentUser?.role || ''] || 'مستخدم'}</div>
              </div>
            </div>
            <div className="sc-row">
              <div className="sc-row__icon sc-row__icon--amber">
                <User size={15} />
              </div>
              <div className="sc-row__body">
                <div className="sc-row__title">إدارة المستخدمين</div>
                <div className="sc-row__sub">إضافة موظفين واعتماد التسجيلات</div>
              </div>
              {onNavigate && (
                <button type="button" className="sc-btn sc-btn--ghost" onClick={() => onNavigate('users')}>
                  فتح
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SettingsCenterView;
