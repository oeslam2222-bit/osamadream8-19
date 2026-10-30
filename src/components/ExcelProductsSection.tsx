import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react';
import { parseExcelProducts, fetchAndParseGoogleSheet, generateSampleExcelTemplate, exportProductsToExcel } from '../services/excelService';
import { Product } from '../types';

interface Props { importProductsList: (data: Product[], mode: string) => Promise<void>; }

export const ExcelProductsSection: React.FC<Props> = ({ importProductsList }) => {
  const [src, setSrc] = useState<'file'|'sheets'>('file');
  const [file, setFile] = useState<File|null>(null);
  const [url, setUrl] = useState('');
  const [s, setS] = useState<{data:Product[];errors:string[];totalRows:number;isLoading:boolean;success:string|null;error:string|null}>({data:[],errors:[],totalRows:0,isLoading:false,success:null,error:null});

  const doImport = async () => {
    setS(p=>({...p,isLoading:true,error:null,success:null}));
    try {
      let r:{products:Product[];errors:string[];totalRows:number};
      if(src==='file'&&file) r=await parseExcelProducts(file);
      else if(src==='sheets'&&url.trim()) r=await fetchAndParseGoogleSheet(url.trim());
      else throw new Error('يرجى اختيار ملف أو إدخال رابط Google Sheet');
      setS(p=>({...p,data:r.products,errors:r.errors,totalRows:r.totalRows,isLoading:false,success:r.products.length>0?`تم قراءة ${r.products.length} صنف بنجاح.`:null,error:r.errors.length>0?r.errors.join(' | '):null}));
    } catch(e:any){setS(p=>({...p,isLoading:false,error:e.message||'فشل في استيراد الأصناف'}));}
  };

  const doSave = async () => {
    if(s.data.length===0) return;
    setS(p=>({...p,isLoading:true}));
    try {
      await importProductsList(s.data,'merge');
      setS(p=>({...p,isLoading:false,success:`تم حفظ صنف بنجاح!`,data:[]}));
    } catch(e:any){setS(p=>({...p,isLoading:false,error:e.message||'فشل في الحفظ'}));}
  };

  const reset=()=>setS({data:[],errors:[],totalRows:0,isLoading:false,success:null,error:null});

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-6 h-6 rounded-full bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center text-xs font-bold">📦</span>
          <h3 className="text-lg font-black text-slate-900">الأصناف والمخزون</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <label className="flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition bg-white">
            <input type="radio" name="pSrc" value="file" checked={src==='file'} onChange={()=>setSrc('file')} className="w-4 h-4 text-[var(--app-ok-text)]"/>
            <div><div className="font-bold text-slate-900">رفع ملف إكسل من الجهاز</div><div className="text-xs text-slate-500">اختر ملف .xlsx أو .csv</div></div>
          </label>
          <label className="flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition bg-white">
            <input type="radio" name="pSrc" value="sheets" checked={src==='sheets'} onChange={()=>setSrc('sheets')} className="w-4 h-4 text-[var(--app-ok-text)]"/>
            <div><div className="font-bold text-slate-900">جلب من Google Sheets</div><div className="text-xs text-slate-500">لصق رابط الشيت المنشور للعامة</div></div>
          </label>
        </div>

        {src==='file' ? (
          <div className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center hover:border-[var(--app-ok)] hover:bg-[var(--app-ok-tint)] transition cursor-pointer">
            <Upload className="w-10 h-10 text-[var(--app-ok-text)] mx-auto mb-3"/>
            <p className="text-sm text-slate-600">اسحب ملف إكسل هنا أو انقر لاختيار ملف</p>
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e)=>setFile(e.target.files?.[0]||null)}/>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="text" placeholder="لصق رابط Google Sheet للأصناف..." value={url} onChange={(e)=>setUrl(e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-medium focus:ring-2 focus:ring-[var(--app-ok)] outline-none"/>
            <button type="button" onClick={generateSampleExcelTemplate} className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-[var(--app-ok-tint)] hover:border-[var(--app-ok-line)] transition"><Download className="w-4 h-4 inline mr-2"/> تحميل نموذج فارغ للأصناف</button>
          </div>
        )}

        <div className="mt-6">
          <button type="button" onClick={doImport} disabled={s.isLoading||(!file&&!url.trim())} className="w-full py-3.5 rounded-2xl font-black text-xs transition disabled:opacity-50">
            {s.isLoading?(<><Loader2 className="w-4 h-4 animate-spin mr-2"/> جاري القراءة...</>):src==='file'?'قراءة الملف وإحضار البيانات':'جلب البيانات من Google Sheets'}
          </button>
        </div>
      </div>

      {s.data.length>0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 animate-in fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[var(--app-ok)]"/><h4 className="font-bold text-slate-900">معاينة البيانات ({s.data.length} صنف)</h4></div>
            <button type="button" onClick={()=>exportProductsToExcel(s.data,'معاينة_الأصناف_المستوردة')} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-xl transition"><Download className="w-3 h-3 mr-1"/> تصدير المعاينة</button>
          </div>

          {s.errors.length>0 && (
            <div className="bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] rounded-xl p-3 mb-4 text-xs text-[var(--app-risk-text)]"><AlertCircle className="w-4 h-4 mr-1.5"/> {s.errors.join(' | ')}</div>
          )}

          <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0"><tr>
                <th className="p-3">#</th><th className="p-3">الكود</th><th className="p-3">اسم الصنف</th><th className="p-3">التصنيف</th><th className="p-3">حالة المخزون</th><th className="p-3">سعر الكرتونة</th><th className="p-3">رصيد الفرع</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.data.slice(0,50).map((p,i)=>(<tr key={p.id||i} className="hover:bg-slate-50/50">
                  <td className="p-3 text-slate-400">{i+1}</td><td className="p-3 font-mono font-bold">{p.code}</td><td className="p-3 font-semibold text-slate-900">{p.name}</td><td className="p-3">{p.category}</td><td className="p-3"><span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">{p.status}</span></td><td className="p-3 text-slate-700">{p.promoPrice||p.salesPrice||0} ج.م</td><td className="p-3 text-slate-700">{p.branchStockActual||0} كرتونة</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {(s.data.length>50 && <p className="mt-3 text-xs text-slate-500 text-center">عرض أول 50 صنف من أصل {s.data.length} صنف</p>)}

          <div className="mt-6 flex gap-3">
            <button type="button" onClick={doSave} disabled={s.isLoading} className="flex-1 py-3 rounded-2xl font-bold text-xs transition disabled:opacity-50">
              {s.isLoading?'جاري الحفظ...':'تأكيد حفظ الأصناف في المنظومة'}
            </button>
            <button type="button" onClick={reset} className="px-4 py-3 rounded-2xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition">إلغاء</button>
          </div>
        </div>
      )}

      {s.success&&(
        <div className="bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] rounded-xl p-4 mb-4 text-xs text-[var(--app-ok-text)] flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> {s.success}</div>
      )}
    </div>
  );
};
