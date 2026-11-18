import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Filter,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  ALL_AVAILABLE_TABS,
  DEFAULT_ROLE_TABS,
  getUserAllowedTabs,
  resetUserPermissions,
  setUserAllowedTabs,
} from '../services/permissionService';

interface PermissionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  developer: 'مطور',
  admin: 'مدير نظام (آدمن)',
  branch_manager: 'مدير فرع',
  supervisor: 'مشرف',
  sales_rep: 'مندوب مبيعات',
  warehouse_keeper: 'أمين مخزن',
  legal_advisor: 'مستشار قانوني',
  technical_support: 'دعم فني',
};

const SECTOR_LABELS: Record<string, string> = {
  home: 'منزلي',
  electrical: 'كهربائي',
  both: 'كلاهما',
  all: 'الكل',
};

const TAB_GROUPS: { title: string; ids: string[] }[] = [
  { title: 'الرئيسية والكتالوج', ids: ['home', 'catalog', 'offers', 'guide'] },
  { title: 'العملاء والمبيعات الميدانية', ids: ['all_customers', 'customers', 'reps', 'customer_item_sales', 'visits', 'collection', 'targets'] },
  { title: 'الطلبات والفواتير والمرتجعات', ids: ['invoices', 'returns', 'returns_customers'] },
  { title: 'المخزون والتقارير والبيانات', ids: ['inventory', 'dashboard', 'excel', 'product_sales'] },
  { title: 'الإدارة والصلاحيات', ids: ['users', 'permissions', 'legal_advisor'] },
];

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

export const PermissionManagerModal: React.FC<PermissionManagerModalProps> = ({ isOpen, onClose }) => {
  const { users, currentUser, recordAuditLog } = useApp();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');

  const manageableUsers = useMemo(() => users.filter((u) => u.role !== 'developer'), [users]);

  const availableBranches = useMemo(() => {
    const s = new Set<string>();
    manageableUsers.forEach((u) => { if (u.branchName) s.add(u.branchName); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [manageableUsers]);

  const filteredUsers = useMemo(() => {
    let list = manageableUsers;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q) || (u.phone || '').includes(q));
    }
    if (branchFilter !== 'ALL') list = list.filter((u) => u.branchName === branchFilter);
    if (roleFilter !== 'ALL') list = list.filter((u) => u.role === roleFilter);
    if (sectorFilter !== 'ALL') list = list.filter((u) => (u.sector || 'all') === sectorFilter);
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [manageableUsers, searchTerm, branchFilter, roleFilter, sectorFilter]);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId), [users, selectedUserId]);
  const defaultTabs = useMemo(() => (selectedUser ? (DEFAULT_ROLE_TABS[selectedUser.role] || ['home']) : ['home']), [selectedUser]);
  const knownTabIds = useMemo(() => new Set(ALL_AVAILABLE_TABS.map((t) => t.id)), []);

  useEffect(() => {
    if (!selectedUserId && filteredUsers.length) setSelectedUserId(filteredUsers[0].id);
  }, [filteredUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId || !selectedUser) return;
    let active = true;
    getUserAllowedTabs(selectedUserId, selectedUser.role).then((tabs) => {
      if (active) setAllowedTabs(uniq([...(tabs || []), 'home']));
    });
    return () => { active = false; };
  }, [selectedUserId, selectedUser]);

  useEffect(() => { setSaveMsg(null); }, [selectedUserId]);

  const toggleTab = (tabId: string) => {
    if (tabId === 'home') return; // keep home always available
    setAllowedTabs((prev) => prev.includes(tabId) ? prev.filter((t) => t !== tabId) : [...prev, tabId]);
  };

  const setGroup = (ids: string[], on: boolean) => {
    setAllowedTabs((prev) => {
      const set = new Set(prev);
      ids.forEach((id) => { if (id === 'home') return; if (on) set.add(id); else set.delete(id); });
      set.add('home');
      return Array.from(set);
    });
  };

  const handleSave = async () => {
    if (!selectedUserId || !selectedUser) return;
    setIsSaving(true);
    setSaveMsg(null);
    try {
      const before = await getUserAllowedTabs(selectedUserId, selectedUser.role as any);
      const next = uniq([...allowedTabs, 'home']);
      const ok = await setUserAllowedTabs(selectedUserId, next);
      setSaveMsg(ok ? { tone: 'ok', text: 'تم حفظ الصلاحيات بنجاح' } : { tone: 'err', text: 'فشل الحفظ، حاول مرة أخرى' });
      if (ok) {
        recordAuditLog({
          userId: currentUser?.id || 'admin',
          userName: currentUser?.name || 'مدير النظام',
          userRole: currentUser?.role || 'admin',
          branchName: currentUser?.branchName || selectedUser.branchName || '—',
          action: 'permission_change' as any,
          actionTitle: 'تعديل صلاحيات مستخدم',
          details: `المستخدم: ${selectedUser.name} (${selectedUser.username || selectedUser.id}) | الدور: ${selectedUser.role}\nقبل: ${before.join(', ')}\nبعد: ${next.join(', ')}`,
          badgeType: 'warning',
        });
      }
    } catch {
      setSaveMsg({ tone: 'err', text: 'حدث خطأ أثناء الحفظ' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedUserId || !selectedUser) return;
    setIsSaving(true);
    setSaveMsg(null);
    try {
      const before = await getUserAllowedTabs(selectedUserId, selectedUser.role as any);
      await resetUserPermissions(selectedUserId);
      const next = uniq([...(DEFAULT_ROLE_TABS[selectedUser.role] || ['home']), 'home']);
      setAllowedTabs(next);
      setSaveMsg({ tone: 'ok', text: 'تمت إعادة الصلاحيات للوضع الافتراضي للدور' });
      recordAuditLog({
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'مدير النظام',
        userRole: currentUser?.role || 'admin',
        branchName: currentUser?.branchName || selectedUser.branchName || '—',
        action: 'permission_change' as any,
        actionTitle: 'إعادة تعيين صلاحيات للوضع الافتراضي',
        details: `المستخدم: ${selectedUser.name} (${selectedUser.username || selectedUser.id}) | الدور: ${selectedUser.role}\nقبل: ${before.join(', ')}\nبعد (افتراضي): ${next.join(', ')}`,
        badgeType: 'info',
      });
    } catch {
      setSaveMsg({ tone: 'err', text: 'تعذر إعادة التعيين' });
    } finally {
      setIsSaving(false);
    }
  };

  const applyDefaultsLocally = () => {
    if (!selectedUser) return;
    setAllowedTabs(uniq([...(DEFAULT_ROLE_TABS[selectedUser.role] || ['home']), 'home']));
  };

  if (!isOpen) return null;

  const grouped = TAB_GROUPS.map((g) => ({
    ...g,
    tabs: g.ids.map((id) => ALL_AVAILABLE_TABS.find((t) => t.id === id)).filter(Boolean) as typeof ALL_AVAILABLE_TABS,
  })).filter((g) => g.tabs.length);
  const knownInGroups = new Set(grouped.flatMap((g) => g.tabs.map((t) => t.id)));
  const extras = ALL_AVAILABLE_TABS.filter((t) => !knownInGroups.has(t.id));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--app-card)] rounded-3xl shadow-2xl w-full max-w-6xl h-[92vh] overflow-hidden flex flex-col border border-[var(--app-border)]">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-l from-[#0f233d] via-[#162f52] to-[#1a3861] text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg"><ShieldCheck size={22} /></div>
            <div>
              <div className="flex items-center gap-2 flex-wrap"><h2 className="font-black text-lg sm:text-xl">مركز الصلاحيات والوصول</h2><span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-[#e8c98c]">احترافي</span></div>
              <p className="text-xs text-blue-100/90 mt-0.5">تحكم دقيق في شاشات كل مستخدم مع الحفاظ على افتراضيات الدور — حفظ فوري لكل حساب</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition" aria-label="إغلاق"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Left: users */}
          <aside className="border-b lg:border-b-0 lg:border-l border-[var(--app-border)] bg-[var(--app-card-secondary)] flex flex-col min-h-0">
            <div className="p-3 sm:p-4 space-y-2 border-b border-[var(--app-border)]">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative col-span-2"><Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" /><input value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="بحث بالاسم/المستخدم/الهاتف" className="w-full h-10 pr-9 pl-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] text-xs font-bold focus:outline-none focus:border-[var(--app-primary)]" /></div>
                <select value={branchFilter} onChange={(e)=>setBranchFilter(e.target.value)} className="h-9 px-2.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] text-[11px] font-bold"><option value="ALL">كل الفروع</option>{availableBranches.map(b=><option key={b} value={b}>{b}</option>)}</select>
                <select value={roleFilter} onChange={(e)=>setRoleFilter(e.target.value)} className="h-9 px-2.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] text-[11px] font-bold"><option value="ALL">كل الأدوار</option>{Object.entries(ROLE_LABELS).filter(([k])=>k!=='developer').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
                <select value={sectorFilter} onChange={(e)=>setSectorFilter(e.target.value)} className="h-9 px-2.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] text-[11px] font-bold col-span-2"><option value="ALL">كل القطاعات</option><option value="home">منزلي</option><option value="electrical">كهربائي</option><option value="both">كلاهما</option><option value="all">الكل</option></select>
              </div>
              <div className="flex items-center justify-between text-[11px] font-extrabold text-[var(--app-text-muted)]"><span className="inline-flex items-center gap-1.5"><Users size={13}/> المستخدمون</span><span>{filteredUsers.length}</span></div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              {filteredUsers.length === 0 && <div className="p-6 text-center text-xs font-bold text-[var(--app-text-muted)]">لا يوجد مستخدمون مطابقون</div>}
              {filteredUsers.map((u) => {
                const active = selectedUserId === u.id;
                return (
                  <button key={u.id} onClick={()=>setSelectedUserId(u.id)} className={`w-full text-right rounded-xl border p-2.5 transition ${active ? 'bg-[var(--app-card)] border-[var(--app-primary)] shadow-sm' : 'bg-[var(--app-card)] border-[var(--app-border)] hover:bg-[var(--app-card-hover)]'}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-black text-[var(--app-text)] text-xs truncate">{u.name}</span><span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${active ? 'bg-[var(--app-primary)] text-white border-[var(--app-primary)]' : 'bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] border-[var(--app-border)]'}`}>{ROLE_LABELS[u.role] || u.role}</span></div>
                    <div className="mt-1 text-[10px] font-bold text-[var(--app-text-muted)] truncate">@{u.username} · {u.branchName || 'بدون فرع'} · {SECTOR_LABELS[u.sector || 'all'] || 'الكل'}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: permissions */}
          <main className="flex flex-col min-h-0">
            {!selectedUser ? (
              <div className="flex-1 flex items-center justify-center text-[var(--app-text-muted)] font-bold">اختر مستخدمًا لإدارة صلاحياته</div>
            ) : (
              <>
                <div className="p-4 sm:p-5 border-b border-[var(--app-border)] space-y-3 bg-[var(--app-card)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#102b4e] text-white flex items-center justify-center font-black">{selectedUser.name.charAt(0)}</div>
                      <div>
                        <div className="font-black text-[var(--app-text)]">{selectedUser.name}</div>
                        <div className="text-[11px] font-bold text-[var(--app-text-muted)]">@{selectedUser.username} · {selectedUser.branchName || 'بدون فرع'}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-extrabold">
                      <span className="px-2.5 py-1.5 rounded-lg bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text)]">الدور: {ROLE_LABELS[selectedUser.role] || selectedUser.role}</span>
                      <span className="px-2.5 py-1.5 rounded-lg bg-[var(--app-warn-tint)] border border-[var(--app-warn-line)] text-[var(--app-warn-text)]">القطاع: {SECTOR_LABELS[selectedUser.sector || 'all'] || 'الكل'}</span>
                      <span className="px-2.5 py-1.5 rounded-lg bg-[var(--app-primary-tint)] border border-[var(--app-primary-border)] text-[var(--app-primary-text)]">مفعّل: {allowedTabs.length} / {ALL_AVAILABLE_TABS.length}</span>
                      <span className="px-2.5 py-1.5 rounded-lg bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)]">افتراضي الدور: {defaultTabs.length}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={applyDefaultsLocally} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] hover:bg-[var(--app-card-hover)] text-xs font-black text-[var(--app-text)]"><Sparkles size={14}/> تطبيق افتراضي الدور (محليًا)</button>
                    <button onClick={handleReset} disabled={isSaving} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] hover:bg-[var(--app-card-hover)] text-xs font-black text-[var(--app-text)] disabled:opacity-50"><RotateCcw size={14}/> إعادة تعيين وحفظ الافتراضي</button>
                    <span className="text-[11px] font-bold text-[var(--app-text-muted)]">تلميح: شاشة «الرئيسية» تبقى مفعّلة دائمًا. العلامات توضح الاختلاف عن افتراضي الدور.</span>
                  </div>
                  {saveMsg && <div className={`text-xs font-extrabold px-3 py-2 rounded-xl border inline-flex items-center gap-1.5 ${saveMsg.tone==='ok' ? 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)]' : 'bg-[var(--app-risk-tint)] border-[var(--app-risk-line)] text-[var(--app-risk-text)]'}`}>{saveMsg.tone==='ok' ? <CheckCircle2 size={14}/> : <Shield size={14}/>} {saveMsg.text}</div>}
                </div>

                <div className="flex-1 overflow-auto p-4 sm:p-5 space-y-4 bg-[var(--app-bg)]">
                  {[...grouped, ...(extras.length ? [{ title: 'شاشات إضافية', ids: extras.map(e=>e.id), tabs: extras }] : [])].map((g) => {
                    const allOn = g.tabs.every((t) => allowedTabs.includes(t.id));
                    const someOn = g.tabs.some((t) => allowedTabs.includes(t.id));
                    return (
                      <section key={g.title} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[var(--app-border)] flex items-center justify-between gap-2 bg-[var(--app-card-secondary)]">
                          <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${allOn ? 'bg-emerald-500' : someOn ? 'bg-amber-500' : 'bg-slate-400'}`} /><h3 className="font-black text-[var(--app-text)] text-sm">{g.title}</h3><span className="text-[10px] font-bold text-[var(--app-text-muted)]">{g.tabs.filter(t=>allowedTabs.includes(t.id)).length}/{g.tabs.length}</span></div>
                          <div className="flex items-center gap-1.5"><button onClick={()=>setGroup(g.tabs.map(t=>t.id), true)} className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-[var(--app-ok-line)] text-[var(--app-ok-text)] bg-[var(--app-ok-tint)] hover:brightness-110">تفعيل الكل</button><button onClick={()=>setGroup(g.tabs.map(t=>t.id), false)} className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] bg-[var(--app-card)] hover:bg-[var(--app-card-hover)]">إيقاف الكل</button></div>
                        </div>
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                          {g.tabs.map((tab) => {
                            const isAllowed = allowedTabs.includes(tab.id);
                            const isDefault = defaultTabs.includes(tab.id);
                            const isHome = tab.id === 'home';
                            const customOn = !isDefault && isAllowed;
                            const customOff = isDefault && !isAllowed;
                            return (
                              <button key={tab.id} type="button" onClick={() => toggleTab(tab.id)} className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition text-right ${isAllowed ? 'bg-[var(--app-primary-tint)] border-[var(--app-primary-border)] text-[var(--app-text)]' : 'bg-[var(--app-card)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-card-hover)]'} ${isHome ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}>
                                <div className="min-w-0">
                                  <div className="font-extrabold text-xs truncate">{tab.label}</div>
                                  <div className="text-[10px] font-bold text-[var(--app-text-muted)] mt-0.5">{isHome ? 'أساسية (دائمًا مفعّلة)' : isAllowed ? 'وصول مفعّل' : 'غير متاح'}</div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {customOn && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border border-[var(--app-warn-line)]">+مخصص</span>}
                                  {customOff && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)]">−مقيّد</span>}
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${isAllowed ? 'bg-[var(--app-primary)] text-white' : 'bg-[var(--app-card-hover)] text-[var(--app-text-muted)] border border-[var(--app-border)]'}`}>{isAllowed ? '✓' : '—'}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <div className="px-4 sm:px-5 py-3 border-t border-[var(--app-border)] bg-[var(--app-card)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] font-bold text-[var(--app-text-muted)] flex items-center gap-2"><Building2 size={14}/> يتم تطبيق الصلاحيات على حساب <b className="text-[var(--app-text)]">{selectedUser.name}</b> فور الحفظ (قد يلزم إعادة فتح الجلسة عند المستخدم).</div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleReset} disabled={isSaving} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--app-border)] text-[var(--app-text)] text-sm font-black hover:bg-[var(--app-card-hover)] disabled:opacity-50 bg-[var(--app-card)]"><RotateCcw size={15}/> افتراضي الدور</button>
                    <button onClick={handleSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#102b4e] text-white font-black shadow-lg shadow-blue-900/20 hover:bg-[#16365f] disabled:opacity-50"><Save size={15}/> {isSaving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}</button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default PermissionManagerModal;
