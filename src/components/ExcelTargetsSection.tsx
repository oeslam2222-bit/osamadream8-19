import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, Target, Upload } from 'lucide-react';
import { parseTargetExcel as parseTargetExcelFromFile, fetchTargetsFromGoogleSheetUrl, generateSampleCustomerTargetTemplate } from '../services/excelService';
import { TargetRecord } from '../types';

interface Props { saveTargets?: (data: TargetRecord[]) => Promise<void>; }

export const ExcelTargetsSection: React.FC<Props> = ({ saveTargets }) => {
  const [src, setSrc] = useState<'file'|'sheets'>('file');
  const [file, setFile] = useState<File|null>(null);
  const [url, setUrl] = useState('');
  const [s, setS] = useState<{data:TargetRecord[];errors:string[];totalRows:number;isLoading:boolean;success:string|null;error:string|null}>({data:[],errors:[],totalRows:0,isLoading:false,success:null,error:null});

  const doImport = async () => {
    setS(p=>({...p,isLoading:true,error:null,success:null}));
    try {
      let r:TargetRecord[];
      if(src==='file'&&file) r=await parseTargetExcelFromFile(file);
      else if(src==='sheets'&&url.trim()) { r=await fetchTargetsFromGoogleSheetUrl(url.trim()); }
      else throw new Error('يرجى اختيار ملف أو إدخال رابط Google Sheet');
      setS(p=>({...p,data:r,totalRows:r.length,isLoading:false,success:r.length>0?`تم قراءة ${r.length} سجل تارجت بنجاح.`:null,error:null}));
    } catch(e:any){setS(p=>({...p,isLoading:false,error:e.message||'فشل في استيراد التارجت'}));}
  };

  const doSave = async () => {
    if(s.data.length===0) return;
    setS(p=>({...p,isLoading:true}));
    try {
      if(saveTargets) await saveTargets(s.data);
      setS(p=>({...p,isLoading:false,success:`تم حفظ سجل تارجت بنجاح!`,data:[]}));
    } catch(e:any){setS(p=>({...p,isLoading:false,error:e.message||'فشل في حفظ التارجت'}));}
  };

  const reset=()=>setS({data:[],errors:[],totalRows:0,isLoading:false,success:null,error:null});

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">🎯</span>
          <h3 className="text-lg font-black text-slate-900">التارجت (أهداف المبيعات والتحصيل)</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <label className="flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition bg-white">
            <input type="radio" name="tSrc" value="file" checked={src==='file'} onChange={()=>setSrc('file')} className="w-4 h-4 text-amber-600"/>
            <div><div className="font-bold text-slate-900">رفع ملف التارجت من الجهاز</div><div className="text-xs text-slate-500">اختر ملف .xlsx من جهازك</div></div>
          </label>
          <label className="flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition bg-white">
            <input type="radio" name="tSrc" value="sheets" checked={src==='sheets'} onChange={()=>setSrc('sheets')} className="w-4 h-4 text-amber-600"/>
            <div><div className="font-bold text-slate-900">جلب من Google Sheets</div><div className="text-xs text-slate-500">لصق رابط الشيت المنشور للعامة</div></div>
          </label>
        </div>

        {src==='file' ? (
          <div className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer">
            <Upload className="w-10 h-10 text-amber-600 mx-auto mb-3"/>
            <p className="text-sm text-slate-600">اسحب ملف إكسل هنا أو انقر لاختيار ملف</p>
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e)=>setFile(e.target.files?.[0]||null)}/>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="text" placeholder="لصق رابط Google Sheet للتارجت..." value={url} onChange={(e)=>setUrl(e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none"/>
            <button type="button" onClick={generateSampleCustomerTargetTemplate} className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:border-amber-300 transition"><Download className="w-4 h-4 inline mr-2"/> تحميل نموذج فارغ للتارجت</button>
          </div>
        )}

        <div className="mt-6">
          <button type="button" onClick={doImport} disabled={s.isLoading||(!file&&!url.trim())} className="w-full py-3.5 rounded-2xl font-black text-xs transition disabled:opacity-50">
            {s.isLoading?(<><Loader2 className="w-4 h-4 animate-spin mr-2"/> جاري القراءة...</>):src==='file'?'قراءة ملف التارجت':'جلب التارجت من Google Sheets'}
          </button>
        </div>
      </div>

      {s.data.length>0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 animate-in fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500"/><h4 className="font-bold text-slate-900">معاينة التارجت ({s.data.length} سجل)</h4></div>
          </div>

          {s.errors.length>0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 text-xs text-rose-800"><AlertCircle className="w-4 h-4 mr-1.5"/> {s.errors.join(' | ')}</div>
          )}

          <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0"><tr>
                <th className="p-3">#</th><th className="p-3">المندوب</th><th className="p-3">الفرع</th><th className="p-3">العميل</th><th className="p-3">هدف المبيعات</th><th className="p-3">هدف التحصيل</th><th className="p-3">الشهر/السنة</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.data.slice(0,50).map((t,i)=>(<tr key={t.id||i} className="hover:bg-slate-50/50">
                  <td className="p-3 text-slate-400">{i+1}</td>                  <td className="p-3 font-mono font-bold">{t.repName}</td><td className="p-3">{t.branch}</td><td className="p-3">{t.notes ?? '-'}</td><td className="p-3 text-slate-700">{Number(t.salesTarget||0).toLocaleString()}</td><td className="p-3 text-slate-700">{Number(t.collectionTarget||0).toLocaleString()}</td><td className="p-3">{t.month}/{t.year}</td>
                </tr>))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            <button type="button" onClick={doSave} disabled={s.isLoading} className="flex-1 py-3 rounded-2xl font-bold text-xs transition disabled:opacity-50">
              {s.isLoading?'جاري الحفظ...':'تأكيد حفظ التارجت'}
            </button>
            <button type="button" onClick={reset} className="px-4 py-3 rounded-2xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition">إلغاء</button>
          </div>
        </div>
      )}

      {s.success&&(
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-xs text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> {s.success}</div>
      )}
    </div>
  );
};
