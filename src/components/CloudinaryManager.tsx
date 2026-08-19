import {
  ArrowRight,
  Check,
  CheckCircle2,
  CloudLightning,
  ExternalLink,
  Eye,
  FileCode,
  FolderOpen,
  HelpCircle,
  Image,
  Info,
  Layers,
  Link,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Wand2,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ProductImage } from './ProductImage';
import {
  batchMatchCloudinaryImages,
  DEFAULT_CLOUDINARY_CONFIG,
  getProductImageUrl,
  parseCloudinaryUrl,
  sanitizeToCloudinarySlug
} from '../services/cloudinaryService';
import { CloudinaryConfig } from '../types';

export const CloudinaryManager: React.FC = () => {
  const { cloudinaryConfig, updateCloudinarySettings, products } = useApp();

  const [formConfig, setFormConfig] = useState<CloudinaryConfig>({
    ...cloudinaryConfig,
    cloudName: cloudinaryConfig.cloudName || 'dzdkhpr2y'
  });
  const [testCode, setTestCode] = useState('1004973');
  const [testName, setTestName] = useState('طقم زجاج دريم فاخر');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');
  const [extractedNotice, setExtractedNotice] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<{
    updatedCount: number;
    sampleMatches: { code: string; name: string; url: string }[];
  } | null>(null);

  const sampleCodes = ['LHD-103', '1004973', '1004544', '1005049', '1005118', '1004534', '1004550'];
  const [activeScriptTab, setActiveScriptTab] = useState<'gas' | 'node'>('gas');
  const [copiedCode, setCopiedCode] = useState(false);

  const googleAppsScript = `// ========================================================
// سكريبت الرفع النظيف من Google Drive / Sheets إلى Cloudinary
// المعيار: public_id = كود المنتج فقط (بدون أي مسارات أو فولدرات عربي)
// ========================================================

function uploadImagesToCloudinaryClean() {
  const cloudName = "${formConfig.cloudName || 'dzdkhpr2y'}";
  const uploadPreset = "YOUR_UNSIGNED_UPLOAD_PRESET"; // أنشئه من Cloudinary Settings -> Upload -> Add Upload Preset (Unsigned)
  
  // مجلد صور المنتجات على Google Drive
  const driveFolderId = "ضع_هنا_ID_مجلد_جوجل_درايف";
  const folder = DriveApp.getFolderById(driveFolderId);
  const files = folder.getFiles();
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName(); // مثال: LHD-103.png أو 1004973.jpg
    
    // استخراج كود المنتج فقط (حذف الامتداد)
    const dotIndex = fileName.lastIndexOf('.');
    const itemCode = (dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName).trim();
    
    if (!itemCode) continue;
    
    // إعداد الحمولة للرفع السريع والمباشر
    const payload = {
      file: "data:" + file.getMimeType() + ";base64," + Utilities.base64Encode(file.getBlob().getBytes()),
      upload_preset: uploadPreset,
      public_id: itemCode,   // كود المنتج فقط كـ ID نظيف وفريد
      folder: ""              // جذر السحابة مباشرة (Root) بدون مسارات عربي
    };
    
    const options = {
      method: "post",
      payload: payload,
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch("https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload", options);
      Logger.log("تم رفع الصنف بنجاح: " + itemCode);
    } catch (e) {
      Logger.log("خطأ في رفع الصنف " + itemCode + ": " + e.toString());
    }
  }
}`;

  const nodeScript = `// ========================================================
// سكريبت Node.js لرفع مجلد كامل بالكمبيوتر إلى Cloudinary
// المعيار: public_id = كود المنتج فقط بدون مجلدات عربي
// ========================================================
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: '${formConfig.cloudName || 'dzdkhpr2y'}',
  api_key: 'ضع_الـ_API_KEY_هنا',
  api_secret: 'ضع_الـ_API_SECRET_هنا'
});

const localImagesDir = './images'; // مجلد الصور على جهازك

async function uploadAllImages() {
  const files = fs.readdirSync(localImagesDir);
  for (const file of files) {
    const ext = path.extname(file);
    const itemCode = path.basename(file, ext).trim(); // كود المنتج فقط (مثل LHD-103)
    const filePath = path.join(localImagesDir, file);

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        public_id: itemCode, // كود المنتج فقط
        folder: '',          // في الـ Root بدون مسارات عربي
        overwrite: true,
        resource_type: 'image'
      });
      console.log(\`✅ تم رفع الصنف: \${itemCode} -> \${result.secure_url}\`);
    } catch (err) {
      console.error(\`❌ فشل رفع \${itemCode}:\`, err.message);
    }
  }
}

uploadAllImages();`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };
  const commonFolders = [
    { label: 'بدون مجلد (الرئيسي)', value: '' },
    { label: 'منزلي', value: 'منزلي' },
    { label: 'products', value: 'products' },
    { label: 'dream', value: 'dream' },
    { label: 'images', value: 'images' },
    { label: 'items', value: 'items' },
    { label: 'catalog', value: 'catalog' }
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCloudinarySettings(formConfig);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExtractFromUrl = () => {
    if (!pastedUrl) return;
    const parsed = parseCloudinaryUrl(pastedUrl);
    if (!parsed) {
      setExtractedNotice('تعذر قراءة رابط Cloudinary. يرجى التأكد من نسخ رابط صورة يبدأ بـ https://res.cloudinary.com/');
      return;
    }

    const updated: CloudinaryConfig = {
      ...formConfig,
      cloudName: parsed.cloudName,
      folderPrefix: parsed.folderPrefix,
      fileExtension: parsed.fileExtension,
      matchingPattern: 'code'
    };

    setFormConfig(updated);
    updateCloudinarySettings(updated);
    if (parsed.sampleCodeOrFilename) {
      setTestCode(parsed.sampleCodeOrFilename);
    }
    setExtractedNotice(`تم بنجاح! تم استخراج: اسم السحابة (${parsed.cloudName}) والمجلد (${parsed.folderPrefix || 'الجذر'}) والامتداد (${parsed.fileExtension}).`);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setExtractedNotice(null);
    }, 5000);
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
            <span>تم حفظ إعدادات ربط Cloudinary بنجاح! سيتم تطبيقها فوراً على كل المنتجات والكتالوج.</span>
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
              سحابة الحساب الحالية: <code className="bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">{formConfig.cloudName || 'dzdkhpr2y'}</code>
            </p>
          </div>
        </div>
      </div>

      {/* 1-Click Smart URL Auto-Detector */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-3xl shadow-md border border-indigo-700/50 space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-amber-400" />
          <h3 className="font-black text-sm text-white">الاستخراج السحري الفوري بمجرد لصق رابط صورة واحدة</h3>
        </div>
        <p className="text-xs text-indigo-200">
          افتح أي صورة من مجلدك على موقع Cloudinary، انسخ رابطها المباشر والصقه هنا، وسيقوم النظام فوراً بضبط المجلد واسم السحابة وامتداد كل الـ 10,000 منتج بضغطة زر واحدة!
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Link className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="مثال: https://res.cloudinary.com/dzdkhpr2y/image/upload/منزلي/1004973.jpg"
              className="w-full pr-9 pl-3 py-2.5 bg-slate-950/80 border border-indigo-500/50 rounded-xl text-xs font-mono text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleExtractFromUrl}
            className="px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Wand2 className="w-4 h-4" />
            <span>استخراج وضبط الكل فوراً</span>
          </button>
        </div>

        {extractedNotice && (
          <div className="p-2.5 bg-indigo-950/90 border border-amber-400/50 text-amber-200 text-xs rounded-xl font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{extractedNotice}</span>
          </div>
        )}
      </div>

      {/* Quick Diagnostic Tip for 404 Errors */}
      <div className="bg-amber-50 border border-amber-300 p-4 rounded-3xl text-xs space-y-2 text-amber-950">
        <div className="flex items-center gap-2 font-black text-amber-900 text-sm">
          <HelpCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>تحديد المجلد الافتراضي لصور Cloudinary:</span>
        </div>
        <p className="leading-relaxed">
          إذا كانت صورك مرفوعة في مجلد باسم <strong>منزلي</strong> أو <strong>products</strong> أو غيره، اختره من الأزرار السريعة أدناه واضغط حفظ.
        </p>
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
                placeholder="dzdkhpr2y"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-amber-400 font-bold"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">اسم حسابك في Cloudinary Dashboard (حالياً dzdkhpr2y)</span>
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
                placeholder="مثال: منزلي أو products"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-amber-400 font-bold"
              />
              {/* Quick Folder Switchers */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {commonFolders.map((f) => (
                  <button
                    type="button"
                    key={f.value}
                    onClick={() => setFormConfig({ ...formConfig, folderPrefix: f.value })}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      formConfig.folderPrefix === f.value
                        ? 'bg-slate-900 text-amber-300 border-slate-900 font-black'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Matching Pattern */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نمط المطابقة الافتراضي (Auto Match Strategy)
              </label>
              <select
                value={formConfig.matchingPattern}
                onChange={(e) => setFormConfig({ ...formConfig, matchingPattern: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 cursor-pointer"
              >
                <option value="code">المطابقة بكود الصنف (مثل 1004973.jpg)</option>
                <option value="name">المطابقة باسم الصنف (مثل طقم_زجاج.jpg)</option>
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
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 cursor-pointer"
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
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 cursor-pointer"
            >
              استعادة الافتراضي
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black shadow transition cursor-pointer"
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
              <label className="block font-bold text-slate-700 mb-1">اختر أو اكتب كود الصنف للاختبار:</label>
              <input
                type="text"
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="text-[10px] text-slate-400 font-medium">أكواد سريعة من شيتك:</span>
                {sampleCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setTestCode(code)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono cursor-pointer ${
                      testCode === code ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-700 block">الرابط السحابي المتولد تلقائياً:</span>
              <div className="p-2 bg-slate-900 text-amber-300 font-mono text-[10px] rounded-lg break-all select-all">
                {sampleGeneratedUrl}
              </div>
              <div className="flex items-center justify-between pt-1 text-[10px]">
                <span className="text-slate-500">سحابة: {formConfig.cloudName} | مجلد: {formConfig.folderPrefix || '(Root)'}</span>
                <a
                  href={sampleGeneratedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-600 hover:underline flex items-center gap-1 font-bold"
                >
                  <span>فتح الرابط مباشرة</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <button
              onClick={handleRunBatchMatch}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>فحص ومطابقة الـ 10,000+ صنف المسجلين في النظام</span>
            </button>
          </div>

          {/* Image preview box */}
          <div className="flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-200 text-center space-y-2">
            <div className="w-48 h-48 bg-slate-900 rounded-2xl overflow-hidden shadow border border-slate-200 flex items-center justify-center">
              <ProductImage
                product={{ code: testCode, name: testName }}
                cloudinaryConfig={formConfig}
                containerClassName="w-full h-full bg-slate-900"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-[11px] text-slate-500 font-medium">معاينة استجابة Cloudinary مع التبديل التلقائي الذكي للبديل</span>
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

      {/* Script Generator & Clean Upload Architecture Guide */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <FileCode className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-black text-sm text-white">سكريبت الرفع الأوتوماتيكي النظيف لـ Cloudinary</h3>
              <p className="text-[11px] text-slate-400">بالمعيار القياسي: <code className="text-amber-300">public_id = itemCode</code> بدون أي مسارات عربية لتفادي أخطاء الـ URL</p>
            </div>
          </div>
          
          {/* Tab buttons */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveScriptTab('gas')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeScriptTab === 'gas' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Google Apps Script
            </button>
            <button
              type="button"
              onClick={() => setActiveScriptTab('node')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeScriptTab === 'node' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Node.js / Local Script
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between pb-1.5 text-xs text-slate-400">
            <span>انسخ الكود وشغله لرفع كل الصور دفعة واحدة بالكود فقط:</span>
            <button
              type="button"
              onClick={() => copyToClipboard(activeScriptTab === 'gas' ? googleAppsScript : nodeScript)}
              className="px-3 py-1 bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'تم النسخ للحافظة!' : 'نسخ الكود'}</span>
            </button>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-200 text-[11px] font-mono rounded-2xl overflow-x-auto border border-slate-800 leading-relaxed max-h-72">
            {activeScriptTab === 'gas' ? googleAppsScript : nodeScript}
          </pre>
        </div>

        {/* 2-Step Cleanup Guide */}
        <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 text-xs space-y-2">
          <span className="font-bold text-amber-300 block">خطوات التنظيف وإعادة الرفع الصحيح:</span>
          <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
            <li>قم بتشغيل السكريبت أعلاه لرفع الصور بـ <code>public_id = كود المنتج</code> (مثل <code>LHD-103</code> أو <code>1004973</code>) في الـ Root.</li>
            <li>من لوحة تحكم Cloudinary (Media Library)، يمكنك حذف المجلدات القديمة ذات الأسماء العربية لتوفير المساحة وتجنب التداخل.</li>
          </ol>
        </div>
      </div>

    </div>
  );
};
