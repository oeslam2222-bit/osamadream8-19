import React, { useState } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Link2,
  ExternalLink,
  Sparkles,
  Database,
  Zap,
  Clock,
  HelpCircle,
  Check,
  Boxes,
  Users,
  Target,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const PinnedSheetsSyncHub: React.FC = () => {
  const {
    pinnedSheets,
    updatePinnedSheetUrl,
    syncPinnedSheet,
    syncAllPinnedSheets,
    isSyncingPinnedSheets,
    autoSyncOnLaunch,
    setAutoSyncOnLaunch,
    currentUser,
  } = useApp();

  const [inputUrls, setInputUrls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    pinnedSheets.forEach((s) => {
      init[s.id] = s.url || '';
    });
    return init;
  });

  const [syncingSheetId, setSyncingSheetId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [savedBadge, setSavedBadge] = useState<string | null>(null);

  // Allow only admin and developer
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const handleUrlChange = (id: 'products' | 'customers' | 'targets', value: string) => {
    setInputUrls((prev) => ({ ...prev, [id]: value }));
  };

  const handleSaveUrl = (id: 'products' | 'customers' | 'targets') => {
    const url = inputUrls[id] || '';
    updatePinnedSheetUrl(id, url);
    setSavedBadge(id);
    setFeedbackMessage({
      type: 'success',
      text: `تم حفظ رابط ${id === 'products' ? 'شيت الأصناف' : id === 'customers' ? 'شيت العملاء' : 'شيت التارجت'} بنجاح!`,
    });
    setTimeout(() => setSavedBadge(null), 2500);
  };

  const handlePasteFromClipboard = async (id: 'products' | 'customers' | 'targets') => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleUrlChange(id, text);
        updatePinnedSheetUrl(id, text);
        setSavedBadge(id);
        setFeedbackMessage({ type: 'success', text: 'تم لصق الرابط وحفظه بنجاح!' });
        setTimeout(() => setSavedBadge(null), 2500);
      }
    } catch {
      setFeedbackMessage({ type: 'info', text: 'يرجى لصق الرابط يدوياً في الخانة.' });
    }
  };

  const handleSyncSingle = async (id: 'products' | 'customers' | 'targets') => {
    const currentUrl = inputUrls[id]?.trim();
    if (!currentUrl) {
      setFeedbackMessage({ type: 'error', text: 'يرجى إدخال رابط الشيت أولاً وحفظه.' });
      return;
    }

    // Ensure it's saved in context before sync
    updatePinnedSheetUrl(id, currentUrl);

    setSyncingSheetId(id);
    setFeedbackMessage({ type: 'info', text: 'جاري الاتصال بـ Google Sheets وسحب أحدث البيانات...' });

    try {
      const res = await syncPinnedSheet(id);
      if (res.success) {
        setFeedbackMessage({ type: 'success', text: res.message });
      } else {
        setFeedbackMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.message || 'حدث خطأ أثناء التحديث' });
    } finally {
      setSyncingSheetId(null);
    }
  };

  const handleSyncAll = async () => {
    // Save all inputs first
    (Object.keys(inputUrls) as ('products' | 'customers' | 'targets')[]).forEach((id) => {
      if (inputUrls[id]) updatePinnedSheetUrl(id, inputUrls[id]);
    });

    setFeedbackMessage({ type: 'info', text: 'جاري التحديث الشامل لجميع الشيتات السحابية المثبتة...' });
    try {
      const res = await syncAllPinnedSheets();
      if (res.success) {
        const total = res.results.reduce((acc, r) => acc + (r.count || 0), 0);
        setFeedbackMessage({
          type: 'success',
          text: `تم التحديث الشامل بنجاح! تم استيراد وتحديث ${total.toLocaleString('ar-EG')} سجل من Google Sheets.`,
        });
      } else {
        const errors = res.results.filter((r) => r.count === 0).map((r) => r.message).join(' | ');
        setFeedbackMessage({ type: 'error', text: errors || 'حدث خطأ في تحديث بعض الشيتات' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.message || 'فشل التحديث الشامل' });
    }
  };

  const getSheetIcon = (id: string) => {
    switch (id) {
      case 'products':
        return <Boxes className="w-5 h-5 text-amber-400" />;
      case 'customers':
        return <Users className="w-5 h-5 text-emerald-400" />;
      case 'targets':
        return <Target className="w-5 h-5 text-blue-400" />;
      default:
        return <FileSpreadsheet className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Overview & Direct Answer Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/30 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>مركز مزامنة وتثبيت روابط Google Sheets السحابية ⚡</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              تثبيت روابط شيتات جوجل درايف والتحديث التلقائي الفوري
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
              يمكنك هنا تثبيت روابط ملفات <span className="text-amber-300 font-bold">Google Sheets</span> الخاصة بشركتك لمرة واحدة فقط. 
              عند إضافة أي بيانات أو تعديلها يومياً في الشيت السحابي، يكفيك الضغط على زر 
              <span className="text-amber-300 font-bold"> «تحديث الآن» </span> 
              لتنعكس كافة التغييرات على الفور داخل الكتالوج، وقاعدة بيانات العملاء، والتارجت!
            </p>
          </div>

          {/* Master One-Click Sync Button */}
          {canManage && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                onClick={handleSyncAll}
                disabled={isSyncingPinnedSheets || syncingSheetId !== null}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-105 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="تحديث جميع الشيتات المثبتة بضغطة واحدة"
              >
                <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isSyncingPinnedSheets ? 'animate-spin' : ''}`} />
                <span>{isSyncingPinnedSheets ? 'جاري التحديث الشامل...' : 'تحديث شامل لجميع الشيتات ⚡'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Global Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between text-sm animate-in fade-in slide-in-from-top-2 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : feedbackMessage.type === 'error'
                ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                : 'bg-blue-950/60 border-blue-500/40 text-blue-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : feedbackMessage.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              ) : (
                <RefreshCw className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
              )}
              <span className="font-semibold">{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-xs opacity-70 hover:opacity-100 px-2 py-0.5 rounded cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Auto Sync Toggle & Daily Sheets Summary */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>
              الشيتات اليومية الثلاثة: <strong className="text-slate-200">1) الأصناف والمخزون</strong> • <strong className="text-slate-200">2) كافة العملاء والتحصيل</strong> • <strong className="text-slate-200">3) التارجت والمحققات</strong>
            </span>
          </div>

          <label className="inline-flex items-center gap-2.5 cursor-pointer bg-slate-800/60 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/60 transition">
            <input
              type="checkbox"
              checked={autoSyncOnLaunch}
              onChange={(e) => setAutoSyncOnLaunch(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-900 accent-amber-500 cursor-pointer"
            />
            <span className="text-slate-300 font-bold select-none">
              تحديث تلقائي فور فتح التطبيق عند الاتصال بالإنترنت
            </span>
          </label>
        </div>
      </div>

      {/* The 3 Pinned Sheet Cards */}
      <div className="space-y-4">
        {pinnedSheets.map((sheet) => {
          const currentInput = inputUrls[sheet.id] ?? sheet.url;
          const isSyncingThis = syncingSheetId === sheet.id || isSyncingPinnedSheets;
          const hasSavedUrl = Boolean(sheet.url && sheet.url.trim());

          return (
            <div
              key={sheet.id}
              className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all shadow-md"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Info Column */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/70">
                      {getSheetIcon(sheet.id)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-black text-white">{sheet.title}</h3>
                        {sheet.status === 'success' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            مُحدّث بنجاح
                          </span>
                        )}
                        {sheet.status === 'error' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <AlertCircle className="w-3 h-3" />
                            خطأ بالرابط
                          </span>
                        )}
                        {sheet.status === 'syncing' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            جاري السحب...
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{sheet.subtitle}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300/80 leading-relaxed pr-10">
                    {sheet.description}
                  </p>

                  {/* Last Sync Stamp */}
                  <div className="flex items-center gap-4 text-xs text-slate-400 pr-10 pt-1 flex-wrap">
                    {sheet.lastSyncTime ? (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        آخر تحديث: <strong className="text-white">{sheet.lastSyncTime}</strong>
                      </span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        لم يتم التحديث بعد
                      </span>
                    )}

                    {sheet.lastSyncCount !== undefined && sheet.lastSyncCount > 0 && (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Database className="w-3.5 h-3.5 text-emerald-400" />
                        عدد السجلات: <strong className="text-emerald-300">{sheet.lastSyncCount.toLocaleString('ar-EG')}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions & URL Input Column */}
                <div className="lg:w-[480px] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                        <Link2 className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        value={currentInput}
                        onChange={(e) => handleUrlChange(sheet.id, e.target.value)}
                        placeholder="الصق رابط Google Sheet أو Google Drive هنا..."
                        className="w-full pl-3 pr-9 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
                        dir="ltr"
                      />
                    </div>

                    <button
                      onClick={() => handlePasteFromClipboard(sheet.id)}
                      className="px-2.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition cursor-pointer whitespace-nowrap"
                      title="لصق من الحافظة وحفظ"
                    >
                      لصق
                    </button>

                    <button
                      onClick={() => handleSaveUrl(sheet.id)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        savedBadge === sheet.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                      }`}
                    >
                      {savedBadge === sheet.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>تم الحفظ</span>
                        </>
                      ) : (
                        <span>حفظ</span>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {/* Test / Open Link */}
                    {hasSavedUrl ? (
                      <a
                        href={sheet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>فتح الشيت في نافذة جديدة</span>
                      </a>
                    ) : (
                      <span className="text-[11px] text-amber-400/80 font-medium">
                        * يرجى إدخال الرابط والضغط على حفظ
                      </span>
                    )}

                    {/* Sync Trigger for this sheet */}
                    <button
                      onClick={() => handleSyncSingle(sheet.id)}
                      disabled={isSyncingThis || !currentInput.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 active:scale-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin' : ''}`} />
                      <span>{isSyncingThis ? 'جاري التحديث...' : 'تحديث الآن ⚡'}</span>
                    </button>
                  </div>

                  {sheet.errorMessage && (
                    <p className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-900/50 p-2 rounded-lg leading-tight">
                      {sheet.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sharing Instructions Card */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sm:p-5 text-xs text-slate-400 space-y-3">
        <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
          <HelpCircle className="w-4 h-4 text-amber-400" />
          <span>كيف تجعل رابط Google Sheet متاحاً للتحديث التلقائي؟ (خطوة واحدة سهلة)</span>
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pr-2 leading-relaxed">
          <li>
            افتح الشيت على <strong>Google Sheets</strong>، ثم اضغط على زر <span className="text-amber-300 font-bold">«مشاركة / Share»</span> في أعلى اليسار.
          </li>
          <li>
            في خانة الوصول العام (General access)، غيّر الخيار من "حصري / Restricted" إلى:
            <span className="text-emerald-300 font-bold"> «أي شخص لديه الرابط / Anyone with the link» </span>
            واختر <span className="text-slate-200">«عارض / Viewer»</span>.
          </li>
          <li>
            اضغط <span className="text-amber-300 font-bold">«نسخ الرابط / Copy Link»</span>، ثم الصقه في الخانة المخصصة أعلاه واضغط <span className="text-amber-300 font-bold">«حفظ»</span> ثم <span className="text-amber-300 font-bold">«تحديث الآن»</span>.
          </li>
        </ol>
      </div>
    </div>
  );
};
