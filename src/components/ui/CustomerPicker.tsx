import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, MapPin, Search, User, X } from 'lucide-react';
import { Customer } from '../../types';
import { normalizeArabicText } from '../../services/arabicMatchingService';

export interface CustomerSearchSelectProps {
  customers: Customer[];
  valueId?: string;
  onSelect: (customer: Customer) => void;
  onClear?: () => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  compact?: boolean;
  maxResults?: number;
  showRepFilter?: boolean;
}

export const CustomerSearchSelect: React.FC<CustomerSearchSelectProps> = ({
  customers,
  valueId,
  onSelect,
  onClear,
  label,
  required = false,
  placeholder = 'ابحث باسم العميل أو الكود أو الموبايل أو الفرع...',
  compact = false,
  maxResults = 50,
  showRepFilter = false,
}) => {
  const [query, setQuery] = useState('');
  const [selectedRep, setSelectedRep] = useState<string>('الكل');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = useMemo(
    () => (valueId ? customers.find((c) => c.id === valueId) || null : null),
    [customers, valueId]
  );

  const repOptions = useMemo(() => {
    if (!showRepFilter) return [];
    const set = new Set<string>();
    customers.forEach((c) => {
      const r = (c.repName || c.salesRepName || '').trim();
      if (r) set.add(r);
    });
    return ['الكل', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'))];
  }, [customers, showRepFilter]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filtered = useMemo(() => {
    let base = customers;
    if (showRepFilter && selectedRep !== 'الكل') {
      base = base.filter((c) => (c.repName || c.salesRepName || '').trim() === selectedRep);
    }

    const q = query.trim();
    if (!q) {
      return base.slice(0, maxResults);
    }

    const normQ = normalizeArabicText(q);
    const qLower = q.toLowerCase();

    return base
      .filter((c) => {
        const code = String(c.code || '').toLowerCase();
        const phone = String(c.phone || '').toLowerCase();
        const nameNorm = normalizeArabicText(c.name || '');
        const branchNorm = normalizeArabicText(c.branchName || '');
        const repNorm = normalizeArabicText(c.repName || c.salesRepName || '');
        const addrNorm = normalizeArabicText(c.address || c.region || '');
        return (
          code.includes(qLower) ||
          phone.includes(qLower) ||
          (normQ &&
            (nameNorm.includes(normQ) ||
              branchNorm.includes(normQ) ||
              repNorm.includes(normQ) ||
              addrNorm.includes(normQ)))
        );
      })
      .slice(0, maxResults);
  }, [customers, query, selectedRep, showRepFilter, maxResults]);

  const handlePick = (cust: Customer) => {
    onSelect(cust);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery('');
    setIsOpen(false);
    if (onClear) onClear();
  };

  return (
    <div ref={containerRef} className="relative w-full" dir="rtl">
      {label && (
        <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1.5">
          {label}
          {required && <span className="text-rose-600 dark:text-rose-400 mr-1">*</span>}
        </label>
      )}

      {showRepFilter && repOptions.length > 2 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
            تصفية بالمندوب:
          </span>
          <select
            value={selectedRep}
            onChange={(e) => {
              setSelectedRep(e.target.value);
              setIsOpen(true);
            }}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {repOptions.map((r) => (
              <option key={r} value={r}>
                {r === 'الكل' ? 'كل المناديب' : r}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedCustomer && !isOpen ? (
        <div
          onClick={() => setIsOpen(true)}
          className={`flex items-center justify-between gap-2 rounded-2xl border border-blue-300 dark:border-blue-700/70 bg-blue-50/70 dark:bg-blue-950/35 cursor-pointer transition hover:border-blue-400 ${
            compact ? 'px-3 py-2' : 'px-3.5 py-2.5'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black text-slate-950 dark:text-white truncate">
                {selectedCustomer.name}
              </span>
              {selectedCustomer.code && (
                <span className="font-mono text-[11px] font-black text-blue-700 dark:text-blue-300 bg-white/80 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                  {selectedCustomer.code}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>{selectedCustomer.branchName || 'فرع غير محدد'}</span>
              {(selectedCustomer.repName || selectedCustomer.salesRepName) && (
                <>
                  <span>·</span>
                  <span>{selectedCustomer.repName || selectedCustomer.salesRepName}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onClear && (
              <button
                type="button"
                onClick={handleClear}
                title="مسح اختيار العميل"
                className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            placeholder={placeholder}
            className={`w-full pr-9 pl-9 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 focus:border-blue-500 transition ${
              compact ? 'py-2' : 'py-2.5'
            }`}
          />
          {(query || isOpen) && (
            <button
              type="button"
              onClick={() => {
                if (query) {
                  setQuery('');
                } else {
                  setIsOpen(false);
                }
              }}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              aria-label="إغلاق القائمة"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
              لا توجد عملاء مطابقة للبحث ({customers.length} عميل متاح)
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = valueId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePick(c)}
                  className={`w-full text-right px-3.5 py-2.5 transition flex items-start justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/50'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                        {c.name}
                      </span>
                      {c.code && (
                        <span className="font-mono text-[10px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200/70 dark:border-blue-800/70">
                          {c.code}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {c.branchName && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 shrink-0" />
                          {c.branchName}
                        </span>
                      )}
                      {(c.repName || c.salesRepName) && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3 shrink-0" />
                          {c.repName || c.salesRepName}
                        </span>
                      )}
                      {c.address && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {c.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-200">
                      {Number(c.currentBalance ?? c.balance ?? 0).toLocaleString('en-US')} ج.م
                    </div>
                    {c.phone && c.phone !== '—' && (
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">
                        {c.phone}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSearchSelect;
