import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Users,
  Building2,
  Briefcase,
  Terminal,
  LogOut,
  X,
  Check,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';

interface RoleSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleSwitchModal: React.FC<RoleSwitchModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, users, loginAs, logout } = useApp();
  const [selectedBranch, setSelectedBranch] = useState<string>('الكل');

  if (!isOpen || !currentUser) return null;
  if (currentUser.role !== 'admin' && currentUser.role !== 'developer') return null;

  // Group sample users by role for quick 1-click switching
  const adminUser = users.find((u) => u.role === 'admin') || users[0];
  const devUser = users.find((u) => u.role === 'developer') || users.find((u) => u.email?.includes('dev')) || users[0];
  const managers = users.filter((u) => u.role === 'branch_manager');
  const supervisors = users.filter((u) => u.role === 'supervisor');
  const salesReps = users.filter((u) => u.role === 'sales_rep');

  const branches = Array.from(new Set(users.map((u) => u.branchName).filter(Boolean)));

  const handleSelectUser = (userId: string) => {
    loginAs(userId);
    onClose();
  };

  const handleLogout = () => {
    onClose();
    logout();
  };

  const roleMeta: Record<UserRole, { label: string; badge: string; desc: string; icon: any; color: string }> = {
    developer: {
      label: 'المطور (الدعم التقني الشامل)',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      desc: 'صلاحيات كاملة غير مقيدة، فحص قواعد البيانات، تصدير واستيراد الشيتات، ومراقبة المزامنة السحابية.',
      icon: Terminal,
      color: 'text-amber-400'
    },
    admin: {
      label: 'مدير النظام (الإدارة العامة)',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      desc: 'رؤية شاملة لجميع الفروع الـ 7 ومخزن أكتوبر، اعتماد الموازنات، وإدارة حسابات الموظفين.',
      icon: ShieldCheck,
      color: 'text-rose-400'
    },
    branch_manager: {
      label: 'مدير الفرع',
      badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      desc: 'إدارة مخزون الفرع، اعتماد الطلبيات الواردة، ومتابعة تحصيلات وزيارات فريق عمل الفرع.',
      icon: Building2,
      color: 'text-purple-400'
    },
    supervisor: {
      label: 'مشرف المناديب',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      desc: 'مراجعة واعتماد طلبيات وفواتير المناديب التابعين، ومتابعة خطوط السير والزيارات والتحصيلات.',
      icon: UserCheck,
      color: 'text-blue-400'
    },
    sales_rep: {
      label: 'مندوب المبيعات الميداني',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      desc: 'عمل فواتير وطلبيات للعملاء، تسجيل الزيارات وتوقع التحصيلات، واستلام المرتجعات.',
      icon: Briefcase,
      color: 'text-emerald-400'
    }
  };

  const currentMeta = roleMeta[currentUser.role] || roleMeta.sales_rep;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-750 text-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>التبديل السريع بين الحسابات والأدوار</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30">
                  لوحة المطور والإدارة
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                انتقل فورياً بين صلاحيات المطور، الإدارة، الفروع، المشرفين، والمناديب لفحص النظام
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Current Active Account Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={currentUser.avatar || '/pwa-192x192.png'}
                alt={currentUser.name}
                className="w-11 h-11 rounded-full object-cover border-2 border-amber-400 shadow-md"
              />
              <div>
                <div className="text-sm font-black text-white flex items-center gap-2">
                  <span>{currentUser.name}</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.2 rounded-full">
                    الحساب النشط حالياً ✅
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{currentUser.email}</span>
                  <span>•</span>
                  <span className="text-amber-300 font-bold">{currentUser.branchName || 'كل الفروع'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-xl border text-[11px] font-black ${currentMeta.badge}`}>
                {currentMeta.label}
              </span>
            </div>
          </div>

          {/* Quick Role Selectors */}
          <div>
            <h3 className="text-xs font-black text-slate-300 mb-2.5 flex items-center gap-1.5">
              <span>اختر الحساب المطلوب للتبديل الفوري (0 ثانية):</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 1. Developer */}
              {devUser && (
                <button
                  type="button"
                  onClick={() => handleSelectUser(devUser.id)}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer flex items-start gap-3 ${
                    currentUser.id === devUser.id
                      ? 'bg-amber-950/40 border-amber-500 shadow-md ring-1 ring-amber-500/50'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-amber-500/50'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-white text-xs flex items-center justify-between">
                      <span className="truncate">{devUser.name}</span>
                      <span className="text-[10px] text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded">المطور 💻</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{roleMeta.developer.desc}</p>
                  </div>
                </button>
              )}

              {/* 2. Admin */}
              {adminUser && (
                <button
                  type="button"
                  onClick={() => handleSelectUser(adminUser.id)}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer flex items-start gap-3 ${
                    currentUser.id === adminUser.id
                      ? 'bg-rose-950/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-rose-500/50'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-white text-xs flex items-center justify-between">
                      <span className="truncate">{adminUser.name}</span>
                      <span className="text-[10px] text-rose-300 bg-rose-500/20 px-1.5 py-0.2 rounded">مدير النظام 👑</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{roleMeta.admin.desc}</p>
                  </div>
                </button>
              )}

              {/* 3. Branch Managers */}
              {managers.slice(0, 2).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectUser(m.id)}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer flex items-start gap-3 ${
                    currentUser.id === m.id
                      ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-purple-500/50'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-white text-xs flex items-center justify-between">
                      <span className="truncate">{m.name}</span>
                      <span className="text-[10px] text-purple-300 bg-purple-500/20 px-1.5 py-0.2 rounded">مدير فرع 🏢</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">فرع: {m.branchName || 'عام'}</p>
                  </div>
                </button>
              ))}

              {/* 4. Supervisors */}
              {supervisors.slice(0, 2).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectUser(s.id)}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer flex items-start gap-3 ${
                    currentUser.id === s.id
                      ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-blue-500/50'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-white text-xs flex items-center justify-between">
                      <span className="truncate">{s.name}</span>
                      <span className="text-[10px] text-blue-300 bg-blue-500/20 px-1.5 py-0.2 rounded">مشرف مناديب 📋</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.branchName} • اعتماد الطلبيات</p>
                  </div>
                </button>
              ))}

              {/* 5. Sales Reps */}
              {salesReps.slice(0, 2).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectUser(r.id)}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer flex items-start gap-3 ${
                    currentUser.id === r.id
                      ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-emerald-500/50'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-white text-xs flex items-center justify-between">
                      <span className="truncate">{r.name}</span>
                      <span className="text-[10px] text-emerald-300 bg-emerald-500/20 px-1.5 py-0.2 rounded">مندوب مبيعات 💼</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.branchName} • عمل فواتير وزيارات</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Full List of All System Users Selector */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-300">أو اختر مستخدماً محدداً من قاعدة البيانات ({users.length}):</span>
              {branches.length > 1 && (
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-slate-800 text-slate-200 text-[11px] rounded-lg px-2 py-1 border border-slate-700"
                >
                  <option value="الكل">كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {users
                .filter((u) => selectedBranch === 'الكل' || u.branchName === selectedBranch)
                .map((u) => {
                  const isCurrent = currentUser.id === u.id;
                  return (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs transition ${
                        isCurrent
                          ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                          : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={u.avatar || '/pwa-192x192.png'}
                          alt={u.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                        <div className="truncate">
                          <span className="font-bold">{u.name}</span>
                          <span className="text-[10px] text-slate-400 mr-1.5">({u.branchName || 'عام'} - {roleMeta[u.role]?.label || u.role})</span>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="text-[10px] text-emerald-400 font-bold shrink-0">نشط الآن ✅</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectUser(u.id)}
                          className="bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer shrink-0"
                        >
                          دخول بحسابه
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Modal Footer with Clear Logout Button */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>التبديل لا يمسح أي بيانات مسجلة في الفرع أو على السيرفر.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج وشاشة الدخول</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
