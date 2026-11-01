import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RotateCcw, RefreshCw, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  ALL_AVAILABLE_TABS,
  DEFAULT_ROLE_TABS,
  getUserAllowedTabs,
  setUserAllowedTabs,
  resetUserPermissions,
  PermissionDefaults
} from '../services/permissionService';

interface PermissionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermissionManagerModal: React.FC<PermissionManagerModalProps> = ({ isOpen, onClose }) => {
  const { users, currentUser } = useApp();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');

  const availableBranches = useMemo(() => {
    const s = new Set<string>();
    users.forEach((u) => { if (u.branchName) s.add(u.branchName); });
    return Array.from(s);
  }, [users]);

  const nonAdminUsers = useMemo(() => {
    let list = users.filter((u) => u.role !== 'developer');
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    }
    if (branchFilter !== 'ALL') {
      list = list.filter((u) => u.branchName === branchFilter);
    }
    if (roleFilter !== 'ALL') {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (sectorFilter !== 'ALL') {
      list = list.filter((u) => (u.sector || 'all') === sectorFilter);
    }
    return list;
  }, [users, searchTerm, branchFilter, roleFilter]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  useEffect(() => {
    if (!selectedUserId || !selectedUser) return;
    let active = true;
    getUserAllowedTabs(selectedUserId, selectedUser.role).then((tabs) => {
      if (active) setAllowedTabs(tabs);
    });
    return () => { active = false; };
  }, [selectedUserId, selectedUser]);

  const handleToggle = (tabId: string) => {
    setAllowedTabs((prev) =>
      prev.includes(tabId) ? prev.filter((t) => t !== tabId) : [...prev, tabId]
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    setSaveMsg(null);
    try {
      const ok = await setUserAllowedTabs(selectedUserId, allowedTabs);
      setSaveMsg(ok ? 'تم حفظ الصلاحيات بنجاح' : 'فشل الحفظ، حاول مرة أخرى');
    } catch {
      setSaveMsg('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedUserId || !selectedUser) return;
    setIsSaving(true);
    setSaveMsg(null);
    try {
      await resetUserPermissions(selectedUserId);
      const defaults = DEFAULT_ROLE_TABS[selectedUser.role] || ['home'];
      setAllowedTabs(defaults);
      setSaveMsg('تم إعادة الصلاحيات إلى الوضع الافتراضي');
    } catch {
      setSaveMsg('حدث خطأ');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-[var(--app-navy)] to-blue-700 text-white">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-white" />
              <h2 className="font-black text-white text-lg">تخصيص صلاحيات المستخدمين</h2>
            </div>
            <p className="text-xs text-blue-100 mt-0.5 opacity-90">المسؤول (Admin) يمكنه تخصيص الشاشات لكل مستخدم</p>
          </div>
          <button type="button" onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg backdrop-blur-sm transition active:scale-95">
            <span className="text-xl">&times;</span>
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو اسم المستخدم..."
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[var(--app-accent)] focus:outline-none transition"
            />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[var(--app-accent)] focus:outline-none transition"
            >
              <option value="ALL">جميع الفروع</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[var(--app-accent)] focus:outline-none transition"
            >
              <option value="ALL">جميع الأدوار</option>
              <option value="admin">مسؤول (Admin)</option>
              <option value="branch_manager">مدير فرع</option>
              <option value="supervisor">مشرف</option>
              <option value="sales_rep">مندوب</option>
              <option value="warehouse_keeper">أمين مخزن</option>
              <option value="legal_advisor">مستشار قانوني</option>
            </select>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[var(--app-accent)] focus:outline-none transition"
            >
              <option value="ALL">جميع القطاعات</option>
              <option value="home">منزلي</option>
              <option value="electrical">كهربائي</option>
              <option value="both">كلاهما</option>
              <option value="all">الكل (Admin)</option>
            </select>
          </div>
        </div>

        {/* User selector */}
        <div className="px-5 py-3 border-b border-slate-100">
          <label className="text-xs font-bold text-slate-600 block mb-1">اختر المستخدم ({nonAdminUsers.length})</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
          >
            <option value="">-- اختر مستخدم --</option>
            {nonAdminUsers.map((u) => (
              <option value={u.id}>
                {u.name} ({u.role === 'developer' ? 'مسؤول (Admin)' : u.role === 'admin' ? 'مسؤول (Admin)' : u.role === 'branch_manager' ? 'مدير فرع' : u.role === 'supervisor' ? 'مشرف' : u.role === 'sales_rep' ? 'مندوب' : u.role === 'warehouse_keeper' ? 'أمين مخزن' : u.role === 'legal_advisor' ? 'مستشار قانوني' : u.role}) — {u.branchName || 'بدون فرع'} [{u.sector === 'home' ? 'منزلي' : u.sector === 'electrical' ? 'كهربائي' : u.sector === 'both' ? 'كلاهما' : 'الكل'}]
              </option>
            ))}
          </select>
        </div>

        {/* Permission toggles */}
        {selectedUser && (
          <>
            <div className="px-5 py-2 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  الدور الافتراضي: <span className="t-navy">{selectedUser.role === 'developer' ? 'مسؤول (Admin)' : selectedUser.role}</span>
            </span>
            <span className="text-xs font-bold text-slate-600">
              القطاع: <span className="t-navy">{selectedUser.sector === 'home' ? 'منزلي' : selectedUser.sector === 'electrical' ? 'كهربائي' : selectedUser.sector === 'both' ? 'كلاهما' : 'الكل (Admin)'}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {allowedTabs.length} / {ALL_AVAILABLE_TABS.length} شاشة
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_AVAILABLE_TABS.map((tab) => {
                  const isAllowed = allowedTabs.includes(tab.id);
                  const isDefault = (DEFAULT_ROLE_TABS[selectedUser.role] || []).includes(tab.id);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleToggle(tab.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer group ${
                        isAllowed
                          ? 'bg-teal-50 border-teal-200 text-teal-800 font-bold shadow-sm'
                          : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <div className="flex items-center gap-1.5">
                        {!isDefault && isAllowed && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-200">+مخصص</span>
                        )}
                        {isDefault && !isAllowed && (
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold border border-rose-200">-محذوف</span>
                        )}
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          isAllowed ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-200 text-slate-400'
                        }`}>
                          {isAllowed ? '✓' : '✗'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        {selectedUser && (
          <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 bg-white">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold transition hover:bg-slate-50 disabled:opacity-50 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>إعادة تعيين (افتراضي)</span>
            </button>
            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className="text-xs font-bold text-emerald-600">{saveMsg}</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--app-navy)] text-white font-bold shadow-lg shadow-navy/25 hover:bg-blue-deep5 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-white" />
                    <span>حفظ الصلاحيات</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};