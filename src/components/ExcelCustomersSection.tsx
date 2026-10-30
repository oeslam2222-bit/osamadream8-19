import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react';
import { parseExcelCustomers, fetchCustomersFromGoogleSheetUrl, generateSampleCustomersTemplate, exportCustomersToExcel } from '../services/excelService';
import { Customer } from '../types';

interface Props { importCustomersList: (data: Customer[], mode: string) => Promise<void>; }

export const ExcelCustomersSection: React.FC<Props> = ({ importCustomersList }) => {
  const [src, setSrc] = useState<'file'|'sheets'>('file');
  const [file, setFile] = useState<File|null>(null);
  const [url, setUrl] = useState('');
  const [s, setS] = useState<{data:Customer[];errors:string[];totalRows:number;isLoading:boolean;success:string|null;error:string|null}>({data:[],errors:[],totalRows:0,isLoading:false,success:null,error:null});

  const doImport = async () => {
    setS(p=>({...p,isLoading:true,error:null,success:null}));
    try {
      let r:{customers:Customer[];errors:string[];totalRows:number};
      if(src==='file'&&file) r=await parseExcelCustomers(file);
      else if(src==='sheets'&&url.trim()) r=await fetchCustomersFromGoogleSheetUrl(url.trim());
      else throw new Error('يرجى اختيار ملف أو إدخال رابط Google Sheet');
      setS(p=>({...p,data:r.customers,errors:r.errors,totalRows:r.totalRows,isLoading:false,success:r.customers.length>0?`تم قراءة ${r.customers.length} عميل بنجاح.`:null,error:r.errors.length>0?r.errors.join(' | '):null}));
    } catch(e:any){setS(p=>({...p,isLoading:false,error:e.message||'فشل في استيراد العملاء'}));}
  };

  const doSave = async () => {
    if(s.data.length===0) return;
    setS(p=>({...p,isLoading:true}));
    try {
      await importCustomersList(s.data,'merge');
      setS(p=>({...p,isLoading:false,success:`تم حفظ عميل بنجاح!`,data:[]}));
    } catch(e:any){setS(p=>({...p,isLoading:false,error:e.message||'فشل في الحفظ'}));}
  };

  const reset=()=>setS({data:[],errors:[],totalRows:0,isLoading:false,success:null,error:null});

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-6 h-6 rounded-full bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center text-xs font-bold">👥</span>
          <h3 className="text-lg font-black text-slate-900">قاعدة العملاء</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <label className="flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition bg-white">
            <input type="radio" name="cSrc" value="file" checked={src==='file'} onChange={()=>setSrc('file')} className="w-4 h-4 text-[var(--app-navy-text)]"/>
            <div><div className="font-bold text-slate-900">رفع ملف إكسل من الجهاز</div><div className="text-xs text-slate-500">اختر ملف .xlsx أو .csv</div></div>
          </label>
          <label className="flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition bg-white">
            <input type="radio" name="cSrc" value="sheets" checked={src==='sheets'} onChange={()=>setSrc('sheets')} className="w-4 h-4 text-[var(--app-navy-text)]"/>
            <div><div className="font-bold text-slate-900">جلب من Google Sheets</div><div className="text-xs text-slate-500">لصق رابط الشيت المنشور للعامة</div></div>
          </label>
        </div>

        {src==='file' ? (
          <div className="border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center hover:border-[var(--app-navy)] hover:bg-[var(--app-navy-tint)] transition cursor-pointer">
            <Upload className="w-10 h-10 text-[var(--app-navy-text)] mx-auto mb-3"/>
            <p className="text-sm text-slate-600">اسحب ملف إكسل هنا أو انقر لاختيار ملف</p>
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e)=>setFile(e.target.files?.[0]||null)}/>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="text" placeholder="لصق رابط Google Sheet للعملاء..." value={url} onChange={(e)=>setUrl(e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-xs font-medium focus:ring-2 focus:ring-[var(--app-navy)] outline-none"/>
            <button type="button" onClick={generateSampleCustomersTemplate} className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-[var(--app-navy-tint)] hover:border-[var(--app-navy-line)] transition"><Download className="w-4 h-4 inline mr-2"/> تحميل نموذج فارغ للعملاء</button>
          </div>
        )}

        <div className="mt-6">
          <button type="button" onClick={doImport} disabled={s.isLoading||(!file&&!url.trim())} className="w-full py-3.5 rounded-2xl font-black text-xs transition disabled:opacity-50">
            {s.isLoading?(<><Loader2 className="w-4 h-4 animate-spin mr-2"/> جاري القراءة...</>):src==='file'?'قراءة الملف وإحضار بيانات العملاء':'جلب بيانات العملاء من Google Sheets'}
          </button>
        </div>
      </div>

      {s.data.length>0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 animate-in fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[var(--app-navy)]"/><h4 className="font-bold text-slate-900">معاينة العملاء ({s.data.length} عميل)</h4></div>
            <button type="button" onClick={()=>exportCustomersToExcel(s.data,'معاينة_العملاء_المستوردين')} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-xl transition"><Download className="w-3 h-3 mr-1"/> تصدير المعاينة</button>
          </div>

          {s.errors.length>0 && (
            <div className="bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] rounded-xl p-3 mb-4 text-xs text-[var(--app-risk-text)]"><AlertCircle className="w-4 h-4 mr-1.5"/> {s.errors.join(' | ')}</div>
          )}

          <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0"><tr>
                <th className="p-3">#</th><th className="p-3">كود العميل</th><th className="p-3">اسم العميل</th><th className="p-3">الفرع</th><th className="p-3">المندوب</th><th className="p-3">الرصيد الحالي</th><th className="p-3">الحد الائتماني</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.data.slice(0,50).map((c,i)=>(<tr key={c.id||i} className="hover:bg-slate-50/50">
                  <td className="p-3 text-slate-400">{i+1}</td><td className="p-3 font-mono font-bold">{c.code}</td><td className="p-3 font-semibold text-slate-900">{c.name}</td><td className="p-3">{c.branchName||'الفرع الرئيسي'}</td><td className="p-3">{c.repName||'غير محدد'}</td><td className="p-3 text-slate-700">{Number(c.currentBalance||c.balance||0).toLocaleString()} ج.م</td><td className="p-3 text-slate-700">{Number(c.creditLimit||0).toLocaleString()} ج.م</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {(s.data.length>50 && <p className="mt-3 text-xs text-slate-500 text-center">عرض أول 50 عميل من أصل {s.data.length} عميل</p>)}

          <div className="mt-6 flex gap-3">
            <button type="button" onClick={doSave} disabled={s.isLoading} className="flex-1 py-3 rounded-2xl font-bold text-xs transition disabled:opacity-50">
              {s.isLoading?'جاري الحفظ...':'تأكيد حفظ العملاء في المنظومة'}
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
