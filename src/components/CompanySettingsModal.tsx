import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  HelpCircle,
  Info,
  Lock,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { COMPANY_INFO } from '../data/mockData';
import { CompanyInfo } from '../types';

interface CompanySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetBranchName?: string;
}

export const CompanySettingsModal: React.FC<CompanySettingsModalProps> = ({
  isOpen,
  onClose,
  targetBranchName,
}) => {
  const {
    companyInfo,
    branchCompanyInfo,
    updateCompanyInfo,
    resetCompanyInfo,
    updateBranchCompanyInfo,
    resetBranchCompanyInfo,
    getCompanyInfoForBranch,
    branches,
    currentUser,
  } = useApp();

  const isMasterAdmin = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Selected Scope: '__GLOBAL__' for Master Company, or branch name
  const [selectedScope, setSelectedScope] = useState<string>(() => {
    if (targetBranchName) return targetBranchName;
    if (isMasterAdmin) return '__GLOBAL__';
    return currentUser?.branchName || '__GLOBAL__';
  });

  const [formData, setFormData] = useState<CompanyInfo>(() => {
    if (selectedScope === '__GLOBAL__') {
      return { ...COMPANY_INFO, ...companyInfo };
    }
    return getCompanyInfoForBranch(selectedScope);
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  // When selected scope changes, reload the appropriate data
  useEffect(() => {
    if (selectedScope === '__GLOBAL__') {
      setFormData({ ...COMPANY_INFO, ...companyInfo });
    } else {
      setFormData(getCompanyInfoForBranch(selectedScope));
    }
  }, [selectedScope, companyInfo, branchCompanyInfo]);

  if (!isOpen) return null;

  const isEditingBranch = selectedScope !== '__GLOBAL__';

  const handleChange = (field: keyof CompanyInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedScope === '__GLOBAL__') {
      updateCompanyInfo(formData);
    } else {
      updateBranchCompanyInfo(selectedScope, formData);
    }
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1300);
  };

  const handleReset = () => {
    const targetLabel = isEditingBranch ? `بيانات الفرع (${selectedScope})` : 'الترويسة العامة الموحدة للشركة';
    if (window.confirm(`هل تريد استعادة ${targetLabel} إلى الحالة الافتراضية الأصلية؟`)) {
      if (selectedScope === '__GLOBAL__') {
        resetCompanyInfo();
        setFormData(COMPANY_INFO);
      } else {
        resetBranchCompanyInfo(selectedScope);
        setFormData(getCompanyInfoForBranch(selectedScope));
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 1500);
    }
  };

  return (
    <div
      id="company-settings-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="company-settings-modal-container"
        className="bg-white border-2 border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col overflow-hidden my-auto max-h-[94vh]"
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl shadow-md border border-amber-400">
              {formData.logoLetter || 'D'}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>تعديل ترويسة وبيانات الشركة الرسمية</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                  للفواتير والطباعة
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                تخصيص اسم الشركة، السجل التجاري، البطاقة الضريبية، العنوان والخط الساخن
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Branch Scope Selector & Isolation Info Banner */}
        <div className="bg-slate-900 text-slate-100 p-3 sm:px-5 sm:py-3.5 border-b border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-slate-200">نطاق تطبيق الترويسة:</span>
          </div>

          {isMasterAdmin ? (
            <div className="flex items-center gap-2 flex-1 sm:max-w-md">
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="w-full bg-slate-800 text-amber-300 border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <option value="__GLOBAL__">🏢 الترويسة الرئيسية العامة (افتراضي لكافة الفروع)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    📍 فرع: {b.name} {branchCompanyInfo[b.name] ? '✨ (مخصص)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 rounded-xl text-amber-300 text-xs font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>مخصص حصرياً لفرعك: <strong>{selectedScope}</strong></span>
            </div>
          )}
        </div>

        {/* Security / Isolation Assurance Notice */}
        <div className={`px-4 py-2 text-[11px] font-medium flex items-center gap-2 ${
          isEditingBranch
            ? 'bg-blue-50 text-blue-900 border-b border-blue-200'
            : 'bg-amber-50 text-amber-900 border-b border-amber-200'
        }`}>
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>
            {isEditingBranch ? (
              <>
                🔒 <strong>عزل الفرع مفعل:</strong> التعديلات المحفوظة هنا ستطبق <strong>حصراً على فواتير ومطبوعات {selectedScope}</strong> ولن تؤثر على أي فرع آخر.
              </>
            ) : (
              <>
                🏢 <strong>الترويسة العامة الموحدة:</strong> يتم توريث هذه البيانات افتراضياً لجميع فروع الشركة ما لم يقم الفرع بتخصيص بياناته.
              </>
            )}
          </span>
        </div>

        {/* Live Visual Header Preview */}
        <div className="p-3.5 sm:p-5 bg-slate-100 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-amber-600" />
              <span>معاينة حية فورية لترويسة الفاتورة ({isEditingBranch ? selectedScope : 'العامة'}):</span>
            </span>
            <span className="text-[10px] text-slate-500">تتحدث تلقائياً مع كل حرف تعدله</span>
          </div>

          <div className="bg-white p-4 rounded-xl border-2 border-slate-900 shadow-sm text-slate-900">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
              
              {/* Right Logo & Names */}
              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-base shadow-xs">
                    {formData.logoLetter || 'D'}
                  </div>
                  <div>
                    <h1 className="text-base sm:text-xl font-black text-slate-950 tracking-tight leading-none">
                      {formData.nameArabic || formData.name || 'شركة دريم للتجارة والتوزيع'}
                    </h1>
                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 font-sans tracking-wide mt-0.5">
                      {formData.nameEnglish || 'Dream Trading & Distribution Co.'}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-600 font-medium pt-0.5">
                  {formData.activity || 'تجارة وتوزيع الأدوات المنزلية والزجاج والمستلزمات'} • {formData.headquarters || formData.address || 'المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة'}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[10px] sm:text-[11px] text-slate-700 pt-0.5">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                    س.ت: <strong>{formData.commercialRegister || '184920 - الجيزة'}</strong>
                  </span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                    ب.ض: <strong>{formData.taxNumber || '200-482-991'}</strong>
                  </span>
                  <span className="bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-amber-900 font-bold">
                    الخط الساخن: <strong>{formData.customerService || '19000 / 01000000001'}</strong>
                  </span>
                </div>
              </div>

              {/* Left Sample Badge */}
              <div className="text-center sm:text-left shrink-0">
                <div className="bg-slate-900 text-amber-300 font-black text-[11px] px-3 py-1 rounded-md shadow-xs">
                  فاتورة مبيعات معتمدة
                </div>
                <div className="text-xs font-mono font-bold text-slate-500 mt-1">
                  INV-SAMPLE-2026
                </div>
                {isEditingBranch && (
                  <div className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-1 border border-blue-200">
                    {selectedScope}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-white">
          
          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-bounce">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>
                {isEditingBranch
                  ? `تم حفظ وتطبيق ترويسة فرع (${selectedScope}) بنجاح وبشكل معزول!`
                  : 'تم حفظ وتطبيق الترويسة العامة للشركة بنجاح على جميع الفروع!'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 text-xs">
            
            {/* Logo Letter / Symbol */}
            <div className="sm:col-span-3">
              <label className="block font-bold text-slate-700 mb-1">حرف أو رمز الشعار (Logo)</label>
              <input
                type="text"
                maxLength={4}
                value={formData.logoLetter || 'D'}
                onChange={(e) => handleChange('logoLetter', e.target.value)}
                placeholder="D"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-black text-center text-base focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Arabic Name */}
            <div className="sm:col-span-9">
              <label className="block font-bold text-slate-700 mb-1">اسم الشركة / الفرع باللغة العربية *</label>
              <input
                type="text"
                required
                value={formData.nameArabic || ''}
                onChange={(e) => {
                  handleChange('nameArabic', e.target.value);
                  handleChange('name', e.target.value);
                }}
                placeholder="شركة دريم للتجارة والتوزيع"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* English Name */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">اسم الشركة بالإنجليزية (English Name)</label>
              <input
                type="text"
                value={formData.nameEnglish || ''}
                onChange={(e) => {
                  handleChange('nameEnglish', e.target.value);
                  handleChange('commercialNameEn', e.target.value);
                }}
                placeholder="Dream Trading & Distribution Co."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold font-sans text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Activity */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">النشاط التجاري والتخصص</label>
              <input
                type="text"
                value={formData.activity || ''}
                onChange={(e) => handleChange('activity', e.target.value)}
                placeholder="تجارة وتوزيع الأدوات المنزلية والزجاج والمستلزمات"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Commercial Register (س.ت) */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">رقم السجل التجاري (س.ت)</label>
              <input
                type="text"
                value={formData.commercialRegister || ''}
                onChange={(e) => handleChange('commercialRegister', e.target.value)}
                placeholder="184920 - الجيزة"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Tax Number (ب.ض) */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">رقم البطاقة الضريبية والتسجيل (ب.ض)</label>
              <input
                type="text"
                value={formData.taxNumber || ''}
                onChange={(e) => {
                  handleChange('taxNumber', e.target.value);
                  handleChange('taxRegistrationNumber', e.target.value);
                }}
                placeholder="200-482-991"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Customer Service & Hotline */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">الخط الساخن وخدمة العملاء</label>
              <input
                type="text"
                value={formData.customerService || ''}
                onChange={(e) => handleChange('customerService', e.target.value)}
                placeholder="19000 / 01000000001"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Landline / Phone */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">الهاتف الأرضي / أرقام الفرع</label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="02-38334455 / 01000000001"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Headquarters / Full Address */}
            <div className="sm:col-span-12">
              <label className="block font-bold text-slate-700 mb-1">
                {isEditingBranch ? `عنوان وموقع الفرع (${selectedScope})` : 'عنوان المقر الرئيسي والمصنع / المخازن المركزية'}
              </label>
              <input
                type="text"
                value={formData.headquarters || formData.address || ''}
                onChange={(e) => {
                  handleChange('headquarters', e.target.value);
                  handleChange('address', e.target.value);
                }}
                placeholder="المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Email */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني الرسمي (Email)</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="oeslam2222@gmail.com"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Website */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-slate-700 mb-1">الموقع الإلكتروني (Website)</label>
              <input
                type="text"
                value={formData.website || ''}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="www.dream-dist.com"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Footer Policy Notes */}
            <div className="sm:col-span-12">
              <label className="block font-bold text-slate-700 mb-1">شروط وسياسة الاسترجاع والضمان (تذييل الفاتورة)</label>
              <textarea
                rows={2}
                value={formData.footerNotes || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً بحالتها الأصلية • يشترط وجود أصل الفاتورة الإلكترونية المعتمدة'}
                onChange={(e) => handleChange('footerNotes', e.target.value)}
                placeholder="ملاحظات وشروط الفاتورة..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="text-slate-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-rose-50 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الإعدادات الأصلية الافتراضية</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>حفظ وتطبيق البيانات الآن</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
