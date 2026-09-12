import React, { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, ExternalLink, FileSpreadsheet, Globe2, Link2, Save, Users, X } from 'lucide-react';
import {
  defaultSources,
  getPublishedDataSources,
  isValidPublishedSource,
  PublishedDataSource,
  PublishedDataSources,
  PublishedSourceKind,
  savePublishedDataSources,
} from '../services/dataSourceService';

type SourceKey = keyof PublishedDataSources;

const sourceMeta: Record<SourceKey, { icon: React.ReactNode; title: string; description: string; help: string }> = {
  customers: { icon: <Users className="w-5 h-5" />, title: 'شيت العملاء', description: 'قاعدة العملاء / كافة العملاء', help: 'استخدم رابط Google Sheet منشور أو رابط CSV منشور من Excel Online.' },
  products: { icon: <FileSpreadsheet className="w-5 h-5" />, title: 'شيت رصيد المنتجات', description: 'رصيد المنتجات والمخزون', help: 'هذا المصدر يحدّث بيانات الأصناف والمخزون، ويظل مسار رفع Excel المحلي متاحًا.' },
  targets: { icon: <BarChart3 className="w-5 h-5" />, title: 'شيت الأهداف والتحصيل', description: 'تفاصيل المناديب ومحققات الفروع', help: 'يمكن وضع رابط Power BI هنا لفتح اللوحة، أو رابط شيت منشور لمصدر بيانات الأهداف.' },
};

function sourceKindLabel(kind: PublishedSourceKind) {
  if (kind === 'google_sheets') return 'Google Sheets';
  if (kind === 'excel_online') return 'Excel Online';
  return 'Power BI';
}

export const PublishedDataSourcesPanel: React.FC = () => {
  const [sources, setSources] = useState<PublishedDataSources>(() => getPublishedDataSources());
  const [saved, setSaved] = useState(false);
  const [activeKey, setActiveKey] = useState<SourceKey>('customers');

  const activeSource = sources[activeKey];
  const activeMeta = sourceMeta[activeKey];
  const connectedCount = useMemo(() => Object.values(sources).filter(isValidPublishedSource).length, [sources]);

  const updateActive = (patch: Partial<PublishedDataSource>) => {
    setSources((current) => ({
      ...current,
      [activeKey]: { ...current[activeKey], ...patch },
    }));
    setSaved(false);
  };

  const save = () => {
    const next = { ...sources, [activeKey]: { ...activeSource, updatedAt: new Date().toISOString() } };
    setSources(next);
    savePublishedDataSources(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const reset = () => {
    const next = { ...sources, [activeKey]: { ...defaultSources[activeKey] } };
    setSources(next);
    savePublishedDataSources(next);
    setSaved(false);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" dir="rtl">
      <div className="bg-slate-950 text-white p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-300 text-xs font-black mb-2"><Globe2 className="w-4 h-4" /> مركز مصادر البيانات المنشورة</div>
            <h3 className="text-xl font-black">Google Sheets وExcel Online وPower BI</h3>
            <p className="text-xs text-slate-300 mt-1 leading-6">اربط كل شيت بمصدر مستقل. الروابط المنشورة للقراءة فقط، ولا تحتاج بيانات دخول داخل البرنامج.</p>
          </div>
          <div className="bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-center"><strong className="text-2xl text-emerald-300">{connectedCount}</strong><span className="block text-[11px] text-slate-300">مصادر مفعّلة</span></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-0">
        <nav className="bg-slate-50 p-3 border-l border-slate-200 space-y-2">
          {(Object.keys(sourceMeta) as SourceKey[]).map((key) => {
            const item = sourceMeta[key];
            const connected = isValidPublishedSource(sources[key]);
            return <button key={key} type="button" onClick={() => setActiveKey(key)} className={`w-full text-right rounded-2xl p-3 flex items-center gap-3 transition ${activeKey === key ? 'bg-slate-900 text-white shadow-md' : 'hover:bg-white text-slate-700'}`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeKey === key ? 'bg-emerald-500 text-slate-950' : 'bg-white text-emerald-700 border border-slate-200'}`}>{item.icon}</span>
              <span className="min-w-0"><strong className="block text-xs font-black">{item.title}</strong><span className={`block text-[10px] mt-1 ${activeKey === key ? 'text-slate-300' : 'text-slate-500'}`}>{connected ? 'متصل' : 'غير متصل'}</span></span>
            </button>;
          })}
        </nav>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3"><div><h4 className="font-black text-slate-900">{activeMeta.description}</h4><p className="text-xs text-slate-500 mt-1 leading-5">{activeMeta.help}</p></div><span className="text-[10px] font-black bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">{sourceKindLabel(activeSource.kind)}</span></div>

          <div className="grid sm:grid-cols-3 gap-2">
            {(['google_sheets', 'excel_online', 'power_bi'] as PublishedSourceKind[]).map((kind) => <button key={kind} type="button" onClick={() => updateActive({ kind })} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${activeSource.kind === kind ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}>{sourceKindLabel(kind)}</button>)}
          </div>

          <label className="block"><span className="block text-xs font-black text-slate-700 mb-2">الرابط المنشور</span><div className="relative"><Link2 className="absolute right-3 top-3.5 w-4 h-4 text-slate-400" /><input dir="ltr" value={activeSource.url} onChange={(event) => updateActive({ url: event.target.value })} placeholder={activeSource.kind === 'power_bi' ? 'https://app.powerbi.com/view?r=...' : 'https://docs.google.com/spreadsheets/d/...'} className="w-full rounded-xl border border-slate-300 bg-white py-3 pr-10 pl-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none" /></div></label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer"><span><strong className="block text-xs font-black text-slate-800">تفعيل المصدر</strong><span className="text-[11px] text-slate-500">يتم استخدامه بعد حفظ الرابط</span></span><input type="checkbox" checked={activeSource.enabled} onChange={(event) => updateActive({ enabled: event.target.checked })} className="h-5 w-5 accent-emerald-600" /></label>

          <div className="flex flex-wrap items-center gap-2 pt-2"><button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-black"><Save className="w-4 h-4" /> حفظ المصدر</button>{activeSource.url.trim() && <a href={activeSource.url.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"><ExternalLink className="w-4 h-4" /> فتح الرابط</a>}<button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"><X className="w-4 h-4" /> مسح</button>{saved && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> تم الحفظ</span>}</div>
        </div>
      </div>
    </section>
  );
};
