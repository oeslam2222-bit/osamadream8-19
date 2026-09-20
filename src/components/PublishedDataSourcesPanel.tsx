import React, { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, ExternalLink, FileSpreadsheet, Globe2, Info, Link2, Save, Users, X, Lock, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  defaultSources,
  getPublishedDataSources,
  isValidPublishedSource,
  PublishedDataSource,
  PublishedDataSources,
  savePublishedDataSources,
} from '../services/dataSourceService';

type SourceKey = keyof PublishedDataSources;

const sourceMeta: Record<SourceKey, { icon: React.ReactNode; title: string; description: string; help: string }> = {
  customers: {
    icon: <Users className="w-5 h-5" />,
    title: 'شيت العملاء (Google Sheets)',
    description: 'قاعدة العملاء، المديونيات، الحد الائتماني، وتارجت العملاء',
    help: 'ضع رابط Google Sheet الخاص بالعملاء. تأكد من تفعيل خاصية "أي شخص لديه الرابط يمكنه العرض" (Anyone with link can view).',
  },
  products: {
    icon: <FileSpreadsheet className="w-5 h-5" />,
    title: 'شيت الأصناف والمخزون (Google Sheets)',
    description: 'رصيد المنتجات والأسعار والمخزون وتصنيفات الأقسام',
    help: 'ضع رابط Google Sheet الخاص بالأصناف والمخزون ليتم تحديث المنتجات والأسعار سحابياً بشكل فوري.',
  },
  targets: {
    icon: <BarChart3 className="w-5 h-5" />,
    title: 'شيت الأهداف والتحصيل (Google Sheets)',
    description: 'تارجت المناديب، ومحققات المبيعات، والتحصيلات الشهرية',
    help: 'ضع رابط Google Sheet الخاص بالأهداف والمبيعات لعرضه ومزامنته مباشرة داخل لوحة الأهداف والمتابعة.',
  },
};

export const PublishedDataSourcesPanel: React.FC = () => {
  const { currentUser } = useApp();
  const [sources, setSources] = useState<PublishedDataSources>(() => getPublishedDataSources());
  const [saved, setSaved] = useState(false);
  const [activeKey, setActiveKey] = useState<SourceKey>('customers');

  const isAuthorized = currentUser.role === 'admin' || currentUser.role === 'branch_manager' || currentUser.role === 'developer';

  const activeSource = sources[activeKey];
  const activeMeta = sourceMeta[activeKey];
  const connectedCount = useMemo(() => Object.values(sources).filter(isValidPublishedSource).length, [sources]);

  if (!isAuthorized) {
    return (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center" dir="rtl">
        <div className="max-w-md mx-auto py-8">
          <div className="w-16 h-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">صلاحية محجوبة</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            صفحة ربط وإدارة مصادر البيانات والشيتات السحابية تقتصر حصراً على <strong>مدير النظام (Admin)</strong> و<strong>مدير الفرع (Manager)</strong> لضمان أمان وسلامة البيانات ومنع التلاعب.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>رتبتك الحالية: {currentUser.role === 'sales_rep' ? 'مندوب مبيعات' : currentUser.role === 'supervisor' ? 'مشرف مبيعات' : currentUser.role}</span>
          </div>
        </div>
      </section>
    );
  }

  const updateActive = (patch: Partial<PublishedDataSource>) => {
    setSources((current) => ({
      ...current,
      [activeKey]: { ...current[activeKey], ...patch, kind: 'google_sheets' },
    }));
    setSaved(false);
  };

  const save = () => {
    const next: PublishedDataSources = {
      ...sources,
      [activeKey]: { ...activeSource, kind: 'google_sheets', updatedAt: new Date().toISOString() },
    };
    setSources(next);
    savePublishedDataSources(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const reset = () => {
    const next: PublishedDataSources = {
      ...sources,
      [activeKey]: { ...defaultSources[activeKey] },
    };
    setSources(next);
    savePublishedDataSources(next);
    setSaved(false);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" dir="rtl">
      {/* Top Banner: 100% Google Sheets */}
      <div className="bg-slate-950 text-white p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black mb-2">
              <Globe2 className="w-4 h-4" />
              <span>ربط ومزامنة شيتات Google Sheets السحابية 🟢</span>
            </div>
            <h3 className="text-xl font-black text-white">
              جميع مصادر وبيانات المنظومة تعمل عبر Google Sheets
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-6 max-w-2xl">
              النظام يعتمد بنسبة 100% على Google Sheets؛ ضع روابط الشيتات الخاصة بالعملاء والأصناف وتارجت الأهداف لقراءتها ومزامنتها مباشرة بدون أي وسيط أو برامج خارجية.
            </p>
          </div>
          <div className="bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-center shrink-0">
            <strong className="text-2xl font-mono text-emerald-300">{connectedCount} / 3</strong>
            <span className="block text-[11px] text-slate-300">شيتات متصلة</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-0">
        {/* Navigation for the 3 Google Sheets */}
        <nav className="bg-slate-50 p-3 border-l border-slate-200 space-y-2">
          {(Object.keys(sourceMeta) as SourceKey[]).map((key) => {
            const item = sourceMeta[key];
            const connected = isValidPublishedSource(sources[key]);
            const isSelected = activeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveKey(key)}
                className={`w-full text-right rounded-2xl p-3 flex items-center gap-3 transition cursor-pointer ${
                  isSelected ? 'bg-slate-900 text-white shadow-md' : 'hover:bg-white text-slate-700'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-white text-emerald-700 border border-slate-200'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs font-black truncate">{item.title}</strong>
                  <span className={`block text-[10px] mt-0.5 ${isSelected ? 'text-emerald-300' : connected ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                    {connected ? '● متصل ومفعّل' : '○ غير متصل'}
                  </span>
                </span>
              </button>
            );
          })}

          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950 space-y-1.5">
            <div className="font-black flex items-center gap-1.5 text-emerald-900">
              <Info className="w-3.5 h-3.5 text-emerald-700" />
              <span>طريقة مشاركة Google Sheet:</span>
            </div>
            <p className="text-[10px] text-emerald-800 leading-relaxed">
              1. افتح الشيت في جوجل.<br />
              2. اضغط زر <strong>مشاركة (Share)</strong> بالأعلى.<br />
              3. غيّر الإذن إلى <strong>أي شخص لديه الرابط (Anyone with the link)</strong>.<br />
              4. انسخ الرابط والصقه هنا.
            </p>
          </div>
        </nav>

        {/* Configuration Body */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-black text-slate-900 text-base">{activeMeta.title}</h4>
                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-0.5">
                  Google Sheet 🟢
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-5">{activeMeta.description}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-black text-slate-800">تعليمات هذا الشيت:</div>
            <p className="text-[11px] text-slate-600">{activeMeta.help}</p>
          </div>

          {/* URL Input */}
          <label className="block">
            <span className="block text-xs font-black text-slate-700 mb-2">
              رابط ملف Google Sheet
            </span>
            <div className="relative">
              <Link2 className="absolute right-3 top-3.5 w-4 h-4 text-slate-400" />
              <input
                dir="ltr"
                type="url"
                value={activeSource.url}
                onChange={(event) => updateActive({ url: event.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pr-10 pl-3 text-xs sm:text-sm font-mono focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
              />
            </div>
          </label>

          {/* Enable Toggle */}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer hover:bg-slate-100/70 transition">
            <span>
              <strong className="block text-xs font-black text-slate-800">تفعيل مزامنة هذا الشيت</strong>
              <span className="text-[11px] text-slate-500">يتم قراءة واستدعاء البيانات تلقائياً من جوجل شيت فور الحفظ</span>
            </span>
            <input
              type="checkbox"
              checked={activeSource.enabled}
              onChange={(event) => updateActive({ enabled: event.target.checked })}
              className="h-5 w-5 accent-emerald-600 cursor-pointer"
            />
          </label>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-black cursor-pointer shadow-sm transition"
            >
              <Save className="w-4 h-4" />
              <span>حفظ رابط Google Sheet</span>
            </button>

            {activeSource.url.trim() && (
              <a
                href={activeSource.url.trim()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition"
              >
                <ExternalLink className="w-4 h-4 text-emerald-700" />
                <span>فتح في Google Sheets</span>
              </a>
            )}

            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer transition"
            >
              <X className="w-4 h-4" />
              <span>مسح الرابط</span>
            </button>

            {saved && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم حفظ إعدادات Google Sheet بنجاح!</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
