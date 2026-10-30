import React, { useEffect, useMemo, useState } from 'react';
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-black text-slate-900 text-lg">تخصيص صلاحيات المستخدمين</h2>
            <p className="text-xs text-slate-500 mt-0.5">المسؤول (Admin) يمكنه تخصيص الشاشات لكل مستخدم</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
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
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
            />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="ALL">جميع الفروع</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
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
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
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
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-bold transition cursor-pointer ${
                        isAllowed
                          ? 'bg-slate-deep border-teal-soft2 text-deep-blue'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <div className="flex items-center gap-1.5">
                        {!isDefault && isAllowed && (
                          <span className="text-[9px] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] px-1.5 py-0.5 rounded font-bold">+مخصص</span>
                        )}
                        {isDefault && !isAllowed && (
                          <span className="text-[9px] bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] px-1.5 py-0.5 rounded font-bold">-محذوف</span>
                        )}
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          isAllowed ? 'bg-teal-main text-white' : 'bg-slate-200 text-slate-500'
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
          <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              إعادة تعيين (افتراضي)
            </button>
            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className="text-xs font-bold text-teal-light">{saveMsg}</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-navy-deep text-white text-sm font-black hover:bg-navy-deep5 disabled:opacity-50"
              >
                {isSaving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};