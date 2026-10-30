import React, { useState, useMemo } from 'react';
import { Plus, Save, User as UserIcon, ShieldAlert, CheckCircle2, X, Edit2, Trash2 } from 'lucide-react';
import { User, UserRole, Sector, SectorPermissionService } from '../services/sectorPermissionService';
import { BRANCHES, getBranchesBySector } from '../data/branchDefinitions';

const USER_ROLES: UserRole[] = [
  'sales_rep',
  'sales_supervisor',
  'branch_manager',
  'sales_department_manager',
  'sector_manager_home',
  'sector_manager_electrical',
  'top_management',
  'technical_support',
];

interface SectorUserManagerProps {
  initialUsers?: User[];
  onSaveUsers?: (users: User[]) => void;
  onAddSheetData?: () => void;
  currentUser?: User;
}

export const SectorUserManager: React.FC<SectorUserManagerProps> = ({
  initialUsers = [],
  onSaveUsers,
  onAddSheetData,
  currentUser,
}) => {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'sales_rep' as UserRole,
    sector: 'home' as Sector,
    branchId: BRANCHES[0]?.id ?? 0,
    isActive: true,
  });

  const canManage = currentUser ? SectorPermissionService.canManageUsers(currentUser.role) : false;
  const canEditSheets = currentUser ? SectorPermissionService.canEditSheets(currentUser.role) : false;

  const branchesForSelectedSector = useMemo(() => getBranchesBySector(form.sector), [form.sector]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ name: '', email: '', phone: '', role: 'sales_rep', sector: 'home', branchId: branchesForSelectedSector[0]?.id ?? 0, isActive: true });
    setOpenModal(true);
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email ?? '', phone: user.phone ?? '', role: user.role, sector: user.sector ?? 'home', branchId: user.branchId ?? branchesForSelectedSector[0]?.id ?? 0, isActive: user.isActive });
    setOpenModal(true);
  };

  const handleSave = () => {
    const newUser: User = { id: editingId ?? crypto.randomUUID(), name: form.name, email: form.email || undefined, phone: form.phone || undefined, role: form.role, sector: form.sector, branchId: form.branchId, isActive: form.isActive, createdAt: editingId ? undefined : new Date().toISOString(), updatedAt: new Date().toISOString() };
    setUsers((prev) => (editingId ? prev.map((u) => (u.id === editingId ? newUser : u)) : [...prev, newUser]));
    setOpenModal(false);
    if (onSaveUsers) onSaveUsers(users);
  };

  const handleToggleActive = (id: string) => { if (!canManage) return; setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: !u.isActive } : u))); if (onSaveUsers) onSaveUsers(users); };
  const handleDelete = (id: string) => { if (!canManage) return; if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return; setUsers((prev) => prev.filter((u) => u.id !== id)); if (onSaveUsers) onSaveUsers(users); };

  if (!canManage) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h3 className="font-black text-slate-800 mb-1">غير مصرح لك بإدارة المستخدمين</h3>
        <p className="text-sm text-slate-500">فقط {SectorPermissionService.getRoleLabel('technical_support')} و{SectorPermissionService.getRoleLabel('sales_department_manager')} يستطيعون إضافة وتفعيل المستخدمين.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-900 flex items-center gap-2"><UserIcon className="w-5 h-5" /> إدارة المستخدمين والقطاعات</h2>
          <p className="text-sm text-slate-500">المندوب يشوف بياناته فقط • المشرف والمدير حسب القطاع • الدعم الفني ومدير قسم المبيعات يديرون الكل</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleOpenAdd} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-sm transition"><Plus className="w-4 h-4" /> إضافة مستخدم</button>
          {canEditSheets && onAddSheetData && (<button onClick={onAddSheetData} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-black text-sm transition"><Save className="w-4 h-4" /> إضافة بيانات للشيتات</button>)}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3 text-left font-bold text-slate-600">الاسم</th>
              <th className="p-3 text-left font-bold text-slate-600">الدور</th>
              <th className="p-3 text-left font-bold text-slate-600">القطاع</th>
              <th className="p-3 text-left font-bold text-slate-600">الفرع</th>
              <th className="p-3 text-center font-bold text-slate-600">الحالة</th>
              <th className="p-3 text-left font-bold text-slate-600">التحكم</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => {
              const branch = BRANCHES.find((b) => b.id === user.branchId);
              return (
                <tr key={user.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-medium text-slate-800">{user.name}</td>
                  <td className="p-3 text-slate-600"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">{SectorPermissionService.getRoleLabel(user.role)}</span></td>
                  <td className="p-3 text-slate-600">{user.sector ? SectorPermissionService.getSectorLabel(user.sector) : '—'}</td>
                  <td className="p-3 text-slate-600">{branch?.name ?? '—'}</td>
                  <td className="p-3 text-center"><button onClick={() => handleToggleActive(user.id)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{user.isActive ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}<span>{user.isActive ? 'فعال' : 'معطل'}</span></button></td>
                  <td className="p-3 text-left"><div className="flex gap-1"><button onClick={() => handleEdit(user)} disabled={!canManage} className="p-1.5 text-slate-400 hover:text-amber-600 disabled:opacity-50" title="تعديل"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(user.id)} disabled={!canManage} className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-50" title="حذف"><Trash2 className="w-4 h-4" /></button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpenModal(false)} />
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-900">{editingId ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}</h3>
              <button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-3">
              <div><label className="block text-xs font-bold text-slate-600 mb-1">الاسم الكامل</label><input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">البريد الإلكتروني</label><input type="email" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">الدور</label><select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>{(USER_ROLES as UserRole[]).map((r) => (<option key={r} value={r}>{SectorPermissionService.getRoleLabel(r)}</option>))}</select></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">القطاع</label><select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value as Sector })}><option value="home">منزلي</option><option value="electrical">كهرباء</option></select></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">الفرع</label><select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: Number(e.target.value) })}>{branchesForSelectedSector.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}</select></div>
              <div className="flex items-center gap-2"><input id="isActive" type="checkbox" className="rounded border-slate-300 text-amber-600 focus:ring-amber-500" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /><label htmlFor="isActive" className="text-sm font-medium text-slate-700">المستخدم فعال</label></div>
              <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setOpenModal(false)} className="px-4 py-2 rounded-xl text-slate-600 font-medium hover:bg-slate-100">إلغاء</button><button type="submit" className="px-5 py-2 rounded-xl bg-slate-900 text-white font-black hover:bg-slate-800 transition">حفظ</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};