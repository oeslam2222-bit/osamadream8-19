import {
  ArrowRight,
  Check,
  CheckCircle2,
  CloudLightning,
  ExternalLink,
  Eye,
  FileCode,
  Image,
  Info,
  Layers,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  batchMatchCloudinaryImages,
  DEFAULT_CLOUDINARY_CONFIG,
  getProductImageUrl,
  sanitizeToCloudinarySlug
} from '../services/cloudinaryService';
import { CloudinaryConfig } from '../types';

export const CloudinaryManager: React.FC = () => {
  const { cloudinaryConfig, updateCloudinarySettings, products } = useApp();

  const [formConfig, setFormConfig] = useState<CloudinaryConfig>(cloudinaryConfig);
  const [testCode, setTestCode] = useState('DRM-101');
  const [testName, setTestName] = useState('ويفر دريم سوبر شوكولاتة');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [batchResults, setBatchResults] = useState<{
    updatedCount: number;
    sampleMatches: { code: string; name: string; url: string }[];
  } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCloudinarySettings(formConfig);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleRunBatchMatch = () => {
    const res = batchMatchCloudinaryImages(products, formConfig);
    setBatchResults(res);
  };

  const sampleGeneratedUrl = getProductImageUrl(
    { code: testCode, name: testName },
    formConfig
  );

  return (
    <div className="space-y-5 pb-16">
      
      {/* Toast Alert */}
      {savedSuccess && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>تم حفظ إعدادات ربط Cloudinary بنجاح! سيتم تطبيقها فوراً على كل المنتجات.</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
            <CloudLightning className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black">منظومة ربط صور المنتجات عبر Cloudinary (10,000+ صورة)</h2>
            <p className="text-xs sm:text-sm text-slate-300">
              ربط تلقائي ذكي للصور بالاعتماد على كود الصنف أو اسمه مع ضغط ذكي فائق السرعة للشبكات والموبايل
            </p>
          </div>
        </div>
      </div>

      {/* Strategy Explanation & Smart Rules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            1
          </div>
          <h3 className="font-extrabold text-sm text-slate-900">الربط التلقائي بكود الصنف (الأفضل)</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            إذا كانت الصور على Cloudinary مسمّاة بنفس كود الصنف مثل <code>DRM-101.jpg</code>، يقوم النظام بربطها فورياً بجميع شيتات الإكسل والكتالوج دون الحاجة لتعديل الروابط يدوياً.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            2
          </div>
          <h3 className="font-extrabold text-sm text-slate-900">الربط باسم الصنف (Sanitized Slug)</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            للصور المسمّاة باسم المنتج (عربي أو إنجليزي)، يحول النظام الاسم إلى معرّف نظيف (مثال: <code>ويفر_دريم_سوبر.jpg</code>) ويطابقه مع ملفات Cloudinary المرفوعة.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            3
          </div>
          <h3 className="font-extrabold text-sm text-slate-900">التحسين السحابي الفائق (f_auto,q_auto)</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            يتم تحويل صيغ الصور تلقائياً إلى WebP/AVIF وتصغير حجمها بنسبة 80% مع الاحتفاظ بالجودة الفائقة، مما يجعل تصفح 10,000 صورة سريعاً جداً على موبايلات المناديب.
          </p>
        </div>

      </div>

      {/* Cloudinary Configuration Form */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>إعدادات حساب وسحابة Cloudinary</span>
          </h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-bold">
            الإعدادات الحالية نشطة
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Cloud Name */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                اسم السحابة على Cloudinary (Cloud Name) *
              </label>
              <input
                type="text"
                required
                value={formConfig.cloudName}
                onChange={(e) => setFormConfig({ ...formConfig, cloudName: e.target.value })}
                placeholder="مثال: dream-distribution"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">اسم حسابك في Cloudinary Dashboard</span>
            </div>

            {/* Folder Prefix */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                المجلد الافتراضي للصور (Folder Prefix)
              </label>
              <input
                type="text"
                value={formConfig.folderPrefix}
                onChange={(e) => setFormConfig({ ...formConfig, folderPrefix: e.target.value })}
                placeholder="مثال: products أو catalog"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">اتركه فارغاً إذا كانت الصور في الـ Root</span>
            </div>

            {/* Matching Pattern */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نمط المطابقة الافتراضي (Auto Match Strategy)
              </label>
              <select
                value={formConfig.matchingPattern}
                onChange={(e) => setFormConfig({ ...formConfig, matchingPattern: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400"
              >
                <option value="code">المطابقة بكود الصنف (مثل DRM-101.jpg)</option>
                <option value="name">المطابقة باسم الصنف (مثل wafer_dream.jpg)</option>
                <option value="slug">المطابقة بالمركب (الكود + الاسم)</option>
              </select>
            </div>

            {/* File Extension */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                امتداد الصور المرفوعة (File Extension)
              </label>
              <select
                value={formConfig.fileExtension}
                onChange={(e) => setFormConfig({ ...formConfig, fileExtension: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400"
              >
                <option value="jpg">.jpg (الافتراضي)</option>
                <option value="png">.png</option>
                <option value="webp">.webp</option>
                <option value="auto">تلقائي بدون امتداد (Auto)</option>
              </select>
            </div>

            {/* Dynamic Transformations */}
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                معاملات التحسين والضغط التلقائي (Cloudinary Transformations)
              </label>
              <input
                type="text"
                value={formConfig.defaultTransformation}
                onChange={(e) => setFormConfig({ ...formConfig, defaultTransformation: e.target.value })}
                placeholder="f_auto,q_auto,w_500,c_fill"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">
                <code>f_auto</code> = صيغة ذكية سريعة، <code>q_auto</code> = ضغط حجم ذكي، <code>w_500</code> = عرض مناسب للموبايل
              </span>
            </div>

          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setFormConfig(DEFAULT_CLOUDINARY_CONFIG)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
            >
              استعادة الافتراضي
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black shadow transition"
            >
              <Save className="w-4 h-4" />
              <span>حفظ إعدادات Cloudinary</span>
            </button>
          </div>
        </form>
      </div>

      {/* Live URL Simulator & Image Preview */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-500" />
          <span>مختبر ومحاكي الروابط السحابية المباشر</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">جرّب كود الصنف للاختبار:</label>
              <input
                type="text"
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">جرّب اسم الصنف للاختبار:</label>
              <input
                type="text"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-700 block">الرابط السحابي المتولد تلقائياً:</span>
              <div className="p-2 bg-slate-900 text-amber-300 font-mono text-[10px] rounded-lg break-all select-all">
                {sampleGeneratedUrl}
              </div>
            </div>

            <button
              onClick={handleRunBatchMatch}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>فحص ومطابقة الـ 10,000+ صنف المسجلين في النظام</span>
            </button>
          </div>

          {/* Image preview box */}
          <div className="flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-200 text-center space-y-2">
            <div className="w-48 h-48 bg-white rounded-2xl overflow-hidden shadow border border-slate-200 flex items-center justify-center">
              <img
                src={sampleGeneratedUrl}
                alt="Cloudinary test"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).setAttribute('src', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80');
                }}
              />
            </div>
            <span className="text-[11px] text-slate-500 font-medium">معاينة استجابة Cloudinary للرابط المولد</span>
          </div>

        </div>

        {/* Batch Match Results */}
        {batchResults && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-in fade-in">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-2xl flex items-center justify-between text-xs">
              <div className="font-bold">
                تمت مطابقة وتوليد روابط سحابية لـ {batchResults.updatedCount} صنف بنجاح!
              </div>
              <span className="text-emerald-700 font-bold">100% جاهز للعرض والمبيعات</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-slate-700">عينة من الأصناف المربوطة بالسحابة:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {batchResults.sampleMatches.map((s, i) => (
                  <div key={i} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] ml-1.5">
                        {s.code}
                      </span>
                      <span className="font-bold text-slate-800">{s.name}</span>
                    </div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 hover:text-amber-800 p-1 shrink-0"
                      title="فتح الرابط السحابي"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
