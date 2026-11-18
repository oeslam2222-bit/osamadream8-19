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
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { COMPANY_INFO } from '../data/mockData';
import { CompanyInfo } from '../types';
import { getMicrosoftWebhookUrl, setMicrosoftWebhookUrl } from '../services/microsoftSyncService';

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

  const [powerAutomateUrl, setPowerAutomateUrl] = useState<string>(() => getMicrosoftWebhookUrl());
  const [powerAutomateSaved, setPowerAutomateSaved] = useState(false);

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
    let initial: CompanyInfo;
    if (selectedScope === '__GLOBAL__') {
      initial = { ...COMPANY_INFO, ...companyInfo };
    } else {
      initial = getCompanyInfoForBranch(selectedScope);
    }

    const allEmails = Array.from(
      new Set([
        ...(initial.email ? [initial.email.trim()] : []),
        ...(initial.notificationEmails || []).map((e) => e.trim()).filter(Boolean),
      ])
    );
    const primary = allEmails[0] || initial.email || '';
    const others = allEmails.slice(1);

    setFormData({
      ...initial,
      email: primary,
      notificationEmails: others,
    });
  }, [selectedScope, companyInfo, branchCompanyInfo]);

  if (!isOpen) return null;

  const isEditingBranch = selectedScope !== '__GLOBAL__';

  const MAX_BRANCH_EMAILS = 7;
  const additionalEmails: string[] = formData.notificationEmails || [];
  const currentTotalEmailsCount = (formData.email?.trim() ? 1 : 0) + additionalEmails.filter((e) => e.trim().length > 0).length;
  const canAddMoreEmails = (1 + additionalEmails.length) < MAX_BRANCH_EMAILS;

  const handleAddEmail = () => {
    if (!canAddMoreEmails) return;
    setFormData((prev) => ({
      ...prev,
      notificationEmails: [...(prev.notificationEmails || []), ''],
    }));
  };

  const handleUpdateAdditionalEmail = (index: number, val: string) => {
    setFormData((prev) => {
      const nextList = [...(prev.notificationEmails || [])];
      nextList[index] = val;
      return {
        ...prev,
        notificationEmails: nextList,
      };
    });
  };

  const handleRemoveAdditionalEmail = (index: number) => {
    setFormData((prev) => {
      const nextList = [...(prev.notificationEmails || [])];
      nextList.splice(index, 1);
      return {
        ...prev,
        notificationEmails: nextList,
      };
    });
  };

  const handleChange = (field: keyof CompanyInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedAdditional = (formData.notificationEmails || [])
      .map((e) => e.trim())
      .filter((e) => Boolean(e && e.includes('@')));

    let primary = formData.email?.trim() || '';
    if (!primary && cleanedAdditional.length > 0) {
      primary = cleanedAdditional[0];
    }

    const cleanedData: CompanyInfo = {
      ...formData,
      email: primary,
      notificationEmails: cleanedAdditional,
    };

    if (selectedScope === '__GLOBAL__') {
      updateCompanyInfo(cleanedData);
    } else {
      updateBranchCompanyInfo(selectedScope, cleanedData);
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
        className="bg-[var(--app-card)] border-2 border-[var(--app-border)] rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col overflow-hidden my-auto max-h-[94vh]"
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl shadow-md border border-amber-400">
              {formData.logoLetter || 'D'}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>إعدادات بيانات الفاتورة</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                  للفواتير والمطبوعات
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                تخصيص بيانات الفرع (العنوان، الهواتف، السجل والضريبة) مع ثبات الأيقونة الموحدة للشركة
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
            <span className="text-xs font-bold text-slate-200">الفرع المطلوب ضبط بيانات فواتيره:</span>
          </div>

          {isMasterAdmin ? (
            <div className="flex items-center gap-2 flex-1 sm:max-w-md">
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="w-full bg-slate-800 text-amber-300 border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <option value="__GLOBAL__">🏢 بيانات الفاتورة الرئيسية العامة (افتراضي لكافة الفروع)</option>
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
              <span>مخصص لفرعك: <strong>{selectedScope}</strong></span>
            </div>
          )}
        </div>

        {/* Security / Isolation Assurance Notice */}
        <div className={`px-4 py-2 text-[11px] font-medium flex items-center gap-2 ${
          isEditingBranch
            ? 'bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border-b border-[var(--app-primary-border)]'
            : 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-b border-[var(--app-warn-line)]'
        }`}>
          <Info className="w-3.5 h-3.5 text-[var(--app-primary-text)] shrink-0" />
          <span>
            {isEditingBranch ? (
              <>
                🔒 <strong>عزل بيانات الفرع مفعل:</strong> التعديلات هنا ستطبق <strong>حصراً على فواتير ومطبوعات {selectedScope}</strong> مع ثبات الأيقونة الموحدة.
              </>
            ) : (
              <>
                🏢 <strong>بيانات الفاتورة العامة الموحدة:</strong> تورث تلقائياً لكافة الفروع ما لم يقم الفرع بضبط بياناته الخاصة.
              </>
            )}
          </span>
        </div>

        {/* Live Visual Header Preview */}
        <div className="p-3.5 sm:p-5 bg-[var(--app-card-secondary)] border-b border-[var(--app-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-amber-600" />
              <span>معاينة حية لشكل الفاتورة ({isEditingBranch ? selectedScope : 'العامة'}):</span>
            </span>
            <span className="text-[10px] text-[var(--app-text-muted)]">تتحدث تلقائياً مع كل حرف تعدله</span>
          </div>

          <div className="bg-[var(--einv-paper)] p-4 rounded-xl border-2 border-[var(--einv-ink-strong)] shadow-sm text-[var(--einv-ink)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
              
              {/* Right Logo & Names */}
              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-base shadow-xs">
                    {formData.logoLetter || 'D'}
                  </div>
                  <div>
                    <h1 className="text-base sm:text-xl font-black text-[var(--app-ink)] tracking-tight leading-none">
                      {formData.nameArabic || formData.name || 'شركة دريم للتجارة والتوزيع'}
                    </h1>
                    <div className="text-[10px] sm:text-xs font-bold text-[var(--einv-soft)] font-sans tracking-wide mt-0.5">
                      {formData.nameEnglish || 'Dream Trading & Distribution Co.'}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] sm:text-xs text-[var(--einv-muted)] font-medium pt-0.5">
                  {formData.activity || 'تجارة وتوزيع الأدوات المنزلية والزجاج والمستلزمات'} • {formData.headquarters || formData.address || 'المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة'}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[10px] sm:text-[11px] text-[var(--einv-muted)] pt-0.5">
                  <span className="bg-[var(--einv-chip)] px-2 py-0.5 rounded text-[var(--einv-ink)] border border-[var(--einv-line)]">
                    س.ت: <strong>{formData.commercialRegister || '184920 - الجيزة'}</strong>
                  </span>
                  <span className="bg-[var(--einv-chip)] px-2 py-0.5 rounded text-[var(--einv-ink)] border border-[var(--einv-line)]">
                    ب.ض: <strong>{formData.taxNumber || '200-482-991'}</strong>
                  </span>
                  <span className="bg-[var(--einv-warn-tint)] border border-[var(--einv-warn-line)] px-2 py-0.5 rounded text-[var(--einv-warn-text)] font-bold">
                    الخط الساخن: <strong>{formData.customerService || '19000 / 01000000001'}</strong>
                  </span>
                </div>
              </div>

              {/* Left Sample Badge */}
              <div className="text-center sm:text-left shrink-0">
                <div className="bg-slate-900 text-amber-300 font-black text-[11px] px-3 py-1 rounded-md shadow-xs">
                  فاتورة مبيعات معتمدة
                </div>
                <div className="text-xs font-mono font-bold text-[var(--einv-soft)] mt-1">
                  INV-SAMPLE-2026
                </div>
                {isEditingBranch && (
                  <div className="text-[10px] font-bold text-[var(--app-primary-text)] bg-[var(--app-primary-tint)] px-2 py-0.5 rounded mt-1 border border-[var(--app-primary-border)]">
                    {selectedScope}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-[var(--app-card)]">
          
          {savedSuccess && (
            <div className="p-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] rounded-xl text-xs font-bold flex items-center gap-2 animate-bounce">
              <CheckCircle2 className="w-5 h-5 text-[var(--app-ok-text)]" />
              <span>
                {isEditingBranch
                  ? `تم حفظ وتطبيق بيانات فاتورة فرع (${selectedScope}) بنجاح وبشكل مستقل!`
                  : 'تم حفظ وتطبيق بيانات الفاتورة العامة بنجاح!'}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 text-xs">
            
            {/* Standard Fixed Company Logo / Icon */}
            <div className="sm:col-span-3">
              <label className="block font-bold text-[var(--app-text)] mb-1">أيقونة وشعار التطبيق</label>
              <div className="flex items-center gap-2 p-2 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-xs shrink-0">
                  {formData.logoLetter || 'D'}
                </div>
                <div className="text-[10px] text-[var(--app-text-muted)] font-bold leading-tight">
                  ثابتة وموحدة 🔒
                </div>
              </div>
            </div>

            {/* Arabic Name */}
            <div className="sm:col-span-9">
              <label className="block font-bold text-[var(--app-text)] mb-1">اسم الشركة / الفرع بالفاتورة *</label>
              <input
                type="text"
                required
                value={formData.nameArabic || ''}
                onChange={(e) => {
                  handleChange('nameArabic', e.target.value);
                  handleChange('name', e.target.value);
                }}
                placeholder="شركة دريم للتجارة والتوزيع - فرع أكتوبر"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-black text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* English Name */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">اسم الشركة بالإنجليزية (English Name)</label>
              <input
                type="text"
                value={formData.nameEnglish || ''}
                onChange={(e) => {
                  handleChange('nameEnglish', e.target.value);
                  handleChange('commercialNameEn', e.target.value);
                }}
                placeholder="Dream Trading & Distribution Co."
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-bold font-sans text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Activity */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">النشاط التجاري والتخصص</label>
              <input
                type="text"
                value={formData.activity || ''}
                onChange={(e) => handleChange('activity', e.target.value)}
                placeholder="تجارة وتوزيع الأدوات المنزلية والزجاج والمستلزمات"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Commercial Register (س.ت) */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">رقم السجل التجاري (س.ت)</label>
              <input
                type="text"
                value={formData.commercialRegister || ''}
                onChange={(e) => handleChange('commercialRegister', e.target.value)}
                placeholder="184920 - الجيزة"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-mono font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Tax Number (ب.ض) */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">رقم البطاقة الضريبية والتسجيل (ب.ض)</label>
              <input
                type="text"
                value={formData.taxNumber || ''}
                onChange={(e) => {
                  handleChange('taxNumber', e.target.value);
                  handleChange('taxRegistrationNumber', e.target.value);
                }}
                placeholder="200-482-991"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-mono font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Customer Service & Hotline */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">الخط الساخن وخدمة العملاء</label>
              <input
                type="text"
                value={formData.customerService || ''}
                onChange={(e) => handleChange('customerService', e.target.value)}
                placeholder="19000 / 01000000001"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-mono font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Landline / Phone */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">الهاتف الأرضي / أرقام الفرع</label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="02-38334455 / 01000000001"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-mono font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Headquarters / Full Address */}
            <div className="sm:col-span-12">
              <label className="block font-bold text-[var(--app-text)] mb-1">
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
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Multi-Email Manager (Up to 7 emails for Microsoft 365 Notifications) */}
            <div className="sm:col-span-12 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-2xl p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border border-[var(--app-primary-border)] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <label className="block font-bold text-[var(--app-text)] text-sm">
                      {isEditingBranch ? `عناوين البريد الإلكتروني للفرع (${selectedScope})` : 'عناوين البريد الإلكتروني الرسمي العام'}
                    </label>
                    <span className="text-[11px] text-[var(--app-text-muted)] block">
                      إشعارات Microsoft 365 Power Automate (إرسال تلقائي للطلبيات وملفات الإكسل والـ PDF)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border border-[var(--app-primary-border)]">
                    {Math.min(MAX_BRANCH_EMAILS, currentTotalEmailsCount)} من {MAX_BRANCH_EMAILS} إيميلات
                  </span>
                </div>
              </div>

              {/* Emails List */}
              <div className="space-y-3">
                {/* Primary Email */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                      <span>البريد الأساسي (الرئيسي):</span>
                      <span className="text-[10px] text-[var(--app-ok-text)] bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] px-1.5 py-0.2 rounded-md font-semibold">أساسي</span>
                    </span>
                  </div>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="oeslam2222@gmail.com أو branch@dream-dist.com"
                    className="w-full p-2.5 bg-[var(--app-card)] border border-[var(--app-border)] rounded-xl font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-primary)] focus:border-[var(--app-primary)] text-sm"
                  />
                </div>

                {/* Additional Notification Emails */}
                {additionalEmails.map((emailVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[var(--app-text-muted)]">
                          بريد إضافي #{idx + 2} (مستلم إشعار):
                        </span>
                      </div>
                      <input
                        type="email"
                        value={emailVal}
                        onChange={(e) => handleUpdateAdditionalEmail(idx, e.target.value)}
                        placeholder={`additional${idx + 1}@dream-dist.com`}
                        className="w-full p-2.5 bg-[var(--app-card)] border border-[var(--app-border)] rounded-xl font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-primary)] focus:border-[var(--app-primary)] text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAdditionalEmail(idx)}
                      className="mt-5 p-2.5 text-[var(--app-risk-text)] bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] rounded-xl transition cursor-pointer flex items-center justify-center shrink-0 hover:brightness-110"
                      title="حذف هذا البريد الإضافي"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Action Row */}
                <div className="pt-1">
                  {canAddMoreEmails ? (
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[var(--app-primary-text)] bg-[var(--app-primary-tint)] border border-[var(--app-primary-border)] rounded-xl transition cursor-pointer hover:brightness-110"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة بريد إلكتروني آخر (+ حتى {MAX_BRANCH_EMAILS} إيميلات)</span>
                    </button>
                  ) : (
                    <div className="text-[11px] text-[var(--app-warn-text)] bg-[var(--app-warn-tint)] border border-[var(--app-warn-line)] rounded-xl p-2 font-medium">
                      وصلت للحد الأقصى ({MAX_BRANCH_EMAILS} إيميلات). جميع هذه العناوين ستستلم إشعارات الطلبيات المعتمدة سوياً.
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-[var(--app-text-muted)] pt-1">
                  💡 <strong>ملاحظة:</strong> يمكنك إضافة حتى {MAX_BRANCH_EMAILS} إيميلات للفرع (مثل: مدير الفرع، مسؤول المخزن، المحاسب، المشرف...). ستصلهم جميعاً إشعارات الطلبيات المعتمدة وملفات الإكسل والـ PDF في نفس اللحظة عبر Microsoft 365 Power Automate.
                </p>
              </div>
            </div>

            {/* Website */}
            <div className="sm:col-span-6">
              <label className="block font-bold text-[var(--app-text)] mb-1">الموقع الإلكتروني (Website)</label>
              <input
                type="text"
                value={formData.website || ''}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="www.dream-dist.com"
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-bold text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

            {/* Footer Policy Notes */}
            <div className="sm:col-span-12">
              <label className="block font-bold text-[var(--app-text)] mb-1">شروط وسياسة الاسترجاع والضمان (تذييل الفاتورة)</label>
              <textarea
                rows={2}
                value={formData.footerNotes || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً بحالتها الأصلية • يشترط وجود أصل الفاتورة الإلكترونية المعتمدة'}
                onChange={(e) => handleChange('footerNotes', e.target.value)}
                placeholder="ملاحظات وشروط الفاتورة..."
                className="w-full p-2.5 bg-[var(--app-card-secondary)] border border-[var(--app-border)] rounded-xl font-medium text-[var(--app-text)] focus:ring-2 focus:ring-[var(--app-warn)]"
              />
            </div>

          </div>

{/*
            Integrations. The Power Automate trigger URL carries a live signature
            token, so a master admin configures it per device instead of it being
            compiled into the public bundle.
          */}
          {isMasterAdmin && (
            <div className="mt-4 border border-[var(--app-border)] rounded-2xl p-4 bg-[var(--app-card-secondary)]">
              <div className="flex items-start gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-[var(--app-text-muted)] mt-0.5" />
                <div>
                  <h3 className="text-sm font-black text-[var(--app-text)]">إعدادات الربط والتكاملات</h3>
                  <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed">
                    رابط إشعارات مايكروسوفت يُحفظ على هذا الجهاز فقط ولا يتم تضمينه مع التطبيق.
                  </p>
                </div>
              </div>

              <label className="block text-xs font-bold text-[var(--app-text)] mb-1.5">
                رابط Power Automate لإرسال الفواتير
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={powerAutomateUrl}
                  onChange={(e) => setPowerAutomateUrl(e.target.value)}
                  placeholder="https://...powerplatform.com/...&sig=..."
                  dir="ltr"
                  className="flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] px-3 py-2 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-warn)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMicrosoftWebhookUrl(powerAutomateUrl);
                    setPowerAutomateSaved(true);
                    setTimeout(() => setPowerAutomateSaved(false), 3000);
                  }}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {powerAutomateSaved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{powerAutomateSaved ? 'تم الحفظ على هذا الجهاز' : 'حفظ الرابط'}</span>
                </button>
              </div>
              <p className="text-[10px] text-[var(--app-text-muted)] mt-2">
                بدون هذا الرابط لا تُرسل إشعارات الطلبيات لمايكروسوفت، لكن حفظ الطلبيات والفواتير يعمل بشكل طبيعي.
              </p>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-4 border-t border-[var(--app-border)] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="text-[var(--app-text-muted)] hover:text-[var(--app-risk-text)] text-xs font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-[var(--app-risk-tint)] transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الإعدادات الأصلية الافتراضية</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-[var(--app-card-secondary)] hover:bg-[var(--app-card-hover)] text-[var(--app-text)] border border-[var(--app-border)] font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
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
