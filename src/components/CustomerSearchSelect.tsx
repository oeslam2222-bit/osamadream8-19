import React, { useMemo, useState } from 'react';
import { CheckCircle2, Search, User, X } from 'lucide-react';
import type { Customer } from '../types';

interface CustomerSearchSelectProps {
  customers: Customer[];
  valueId?: string | null;
  onSelect: (customer: Customer) => void;
  onClear?: () => void;
  placeholder?: string;
  showRepFilter?: boolean;
  maxResults?: number;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}

export const CustomerSearchSelect: React.FC<CustomerSearchSelectProps> = ({
  customers,
  valueId,
  onSelect,
  onClear,
  placeholder = 'ابحث باسم العميل أو الكود أو الهاتف...',
  showRepFilter = false,
  maxResults = 50,
  className = '',
  compact = false,
  disabled = false,
  label,
  required,
}) => {
  const [query, setQuery] = useState('');
  const [rep, setRep] = useState('all');

  const selected = useMemo(() => (valueId ? customers.find((c) => c.id === valueId) || null : null), [customers, valueId]);

  const repOptions = useMemo(() => {
    if (!showRepFilter) return [];
    const set = new Set<string>();
    customers.forEach((c) => {
      const r = c.salesRepName || c.repName;
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [customers, showRepFilter]);

  const filtered = useMemo(() => {
    let list = customers;
    if (showRepFilter && rep !== 'all') {
      list = list.filter((c) => (c.salesRepName || c.repName) === rep);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.code || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q) ||
        String(c.branchName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [customers, query, rep, showRepFilter]);

  return (
    <div className={`space-y-2 ${className}`} dir="rtl">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black text-slate-700">{label}{required ? ' *' : ''}</span>
          {selected && onClear && !disabled && (
            <button type="button" onClick={onClear} className="text-[11px] font-extrabold text-amber-700 hover:underline inline-flex items-center gap-1"><X size={12}/> تغيير</button>
          )}
        </div>
      )}

      {selected ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#102b4e] text-white flex items-center justify-center font-black text-sm shrink-0">{(selected.name || 'ع').charAt(0)}</div>
            <div className="min-w-0">
              <div className="font-black text-slate-900 text-sm truncate">{selected.name}</div>
              <div className="text-[11px] font-bold text-slate-600 truncate">كود: {selected.code || '—'} · {selected.branchName || '—'}{(selected.salesRepName || selected.repName) ? ` · ${selected.salesRepName || selected.repName}` : ''}{selected.phone ? ` · ${selected.phone}` : ''}</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-emerald-600 text-white shrink-0"><CheckCircle2 size={12}/> محدد</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full h-10 pr-9 pl-3 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-[#102b4e] disabled:opacity-60"
            />
          </div>
          {showRepFilter && (
            <select value={rep} onChange={(e) => setRep(e.target.value)} disabled={disabled} className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:outline-none">
              <option value="all">كل المناديب</option>
              {repOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <div className={`overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white ${compact ? 'max-h-40' : 'max-h-56'}`}>
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs font-bold text-slate-500">لا يوجد عملاء مطابقون للبحث</div>
            ) : filtered.slice(0, maxResults).map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(c)}
                className="w-full text-right px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition disabled:opacity-50"
              >
                <span className="min-w-0 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0"><User size={14} /></span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-slate-900 truncate">{c.name || 'عميل بدون اسم'}</span>
                    <span className="block text-[10px] font-bold text-slate-500 truncate">{c.code || 'بدون كود'} · {c.branchName || '—'}{(c.salesRepName || c.repName) ? ` · ${c.salesRepName || c.repName}` : ''}</span>
                  </span>
                </span>
                <span className="text-[10px] font-extrabold text-[#102b4e] shrink-0">اختيار</span>
              </button>
            ))}
          </div>
          {filtered.length > maxResults && (
            <p className="text-[10px] font-bold text-slate-500 text-center">يُعرض أول {maxResults} عميل — ضيّق البحث للوصول السريع</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSearchSelect;
