import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Users, Receipt, Boxes, RotateCcw, X, ArrowLeft, UserCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { normalizeArabicText } from '../services/arabicMatchingService';

export interface GlobalSearchResult {
  id: string;
  group: 'customers' | 'reps' | 'invoices' | 'products' | 'returns';
  title: string;
  subtitle: string;
  tab: string;
  query: string;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  allowedTabs: string[];
  onNavigate: (tab: string, query?: string) => void;
}

const GROUP_META: Record<string, { label: string; icon: any; tab: string }> = {
  customers: { label: 'العملاء', icon: Users, tab: 'all_customers' },
  reps: { label: 'المناديب والمشرفين', icon: UserCheck, tab: 'reps' },
  invoices: { label: 'أوامر البيع', icon: Receipt, tab: 'invoices' },
  products: { label: 'الأصناف', icon: Boxes, tab: 'catalog' },
  returns: { label: 'المرتجعات', icon: RotateCcw, tab: 'returns' },
};

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, allowedTabs, onNavigate }) => {
  const {
    users,
    getVisibleCustomers,
    getVisibleProducts,
    getVisibleInvoices,
    getVisibleVisits,
  } = useApp();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const normQ = normalizeArabicText(query);
  const rawQ = query.trim().toLowerCase();

  const results = useMemo<GlobalSearchResult[]>(() => {
    if (!rawQ || rawQ.length < 2) return [];
    const out: GlobalSearchResult[] = [];

    // Customers
    if (allowedTabs.includes('all_customers')) {
      const custs = getVisibleCustomers().filter((c) => {
        const name = normalizeArabicText(c.name);
        const code = (c.code || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        const store = normalizeArabicText(c.storeName || '');
        const branch = normalizeArabicText(c.branchName || '');
        return (
          (normQ && (name.includes(normQ) || store.includes(normQ) || branch.includes(normQ))) ||
          (rawQ && (code.includes(rawQ) || phone.includes(rawQ.replace(/\D/g, ''))))
        );
      }).slice(0, 6);
      custs.forEach((c) => out.push({
        id: `c-${c.id}`,
        group: 'customers',
        title: c.name,
        subtitle: `${c.code || ''} • ${c.branchName || 'فرع غير محدد'}${c.phone ? ' • ' + c.phone : ''}`,
        tab: 'all_customers',
        query: c.name,
      }));
    }

    // Reps & Supervisors (Only visible to supervisors, branch managers, admins, developers)
    if (allowedTabs.includes('reps')) {
      const reps = (users || []).filter((u) => {
        const isRepOrSup = u.role === 'sales_rep' || u.role === 'supervisor';
        if (!isRepOrSup) return false;
        const name = normalizeArabicText(u.name || '');
        const username = (u.username || '').toLowerCase();
        const branch = normalizeArabicText(u.branchName || '');
        const phone = (u.phone || '').replace(/\D/g, '');
        return (
          (normQ && (name.includes(normQ) || branch.includes(normQ))) ||
          (rawQ && (username.includes(rawQ) || phone.includes(rawQ.replace(/\D/g, ''))))
        );
      }).slice(0, 5);
      reps.forEach((u) => out.push({
        id: `rep-${u.id}`,
        group: 'reps',
        title: u.name,
        subtitle: `${u.role === 'supervisor' ? 'مشرف مبيعات' : 'مندوب مبيعات'} • ${u.branchName || 'فرع غير محدد'}${u.phone ? ' • ' + u.phone : ''}`,
        tab: 'reps',
        query: u.name,
      }));
    }

    // Invoices
    if (allowedTabs.includes('invoices')) {
      const invs = getVisibleInvoices().filter((inv) => {
        const num = (inv.invoiceNumber || '').toLowerCase();
        const name = normalizeArabicText(inv.customerName);
        const code = (inv.customerCode || '').toLowerCase();
        const phone = (inv.customerPhone || '').replace(/\D/g, '');
        const rep = normalizeArabicText(inv.repName || '');
        return (
          (normQ && (name.includes(normQ) || rep.includes(normQ))) ||
          (rawQ && (num.includes(rawQ) || code.includes(rawQ) || phone.includes(rawQ.replace(/\D/g, ''))))
        );
      }).slice(0, 5);
      invs.forEach((inv) => out.push({
        id: `i-${inv.id}`,
        group: 'invoices',
        title: inv.invoiceNumber,
        subtitle: `${inv.customerName} • ${inv.totalAmount ?? inv.estimatedGrandTotal ?? 0} ج.م • ${inv.status}`,
        tab: 'invoices',
        query: inv.invoiceNumber,
      }));
    }

    // Products
    if (allowedTabs.includes('catalog')) {
      const prods = getVisibleProducts().filter((p) => {
        const name = normalizeArabicText(p.name);
        const code = (p.code || '').toLowerCase();
        const unified = (p.unifiedCode || '').toLowerCase();
        return normQ && (name.includes(normQ) || code.includes(rawQ) || unified.includes(rawQ));
      }).slice(0, 5);
      prods.forEach((p) => out.push({
        id: `p-${p.id}`,
        group: 'products',
        title: p.name,
        subtitle: `${p.code || ''}${p.unifiedCode ? ' • #' + p.unifiedCode : ''}${p.cartonPrice ? ' • ' + p.cartonPrice + ' ج.م' : ''}`,
        tab: 'catalog',
        query: p.name,
      }));
    }

    // Returns
    if (allowedTabs.includes('returns')) {
      const rets = getVisibleVisits().filter((v) => (v.isReturn || v.type === 'مرتجع')).filter((v) => {
        const name = normalizeArabicText(v.customerName);
        const code = (v.customerCode || '').toLowerCase();
        const rep = normalizeArabicText(v.repName || '');
        const items = normalizeArabicText(v.returnItems || '');
        return normQ && (name.includes(normQ) || rep.includes(normQ) || items.includes(normQ)) ||
          rawQ && code.includes(rawQ);
      }).slice(0, 4);
      rets.forEach((v) => out.push({
        id: `r-${v.id}`,
        group: 'returns',
        title: v.customerName || 'مرتجع',
        subtitle: `${v.returnStatus || 'عند العميل'} • ${v.returnValue || 0} ج.م • ${v.date || ''}`,
        tab: 'returns',
        query: v.customerName || '',
      }));
    }

    return out;
  }, [query, allowedTabs, users, getVisibleCustomers, getVisibleProducts, getVisibleInvoices, getVisibleVisits]);

  // Group counts for display
  const grouped = useMemo(() => {
    const map: Record<string, GlobalSearchResult[]> = {};
    results.forEach((r) => {
      if (!map[r.group]) map[r.group] = [];
      map[r.group].push(r);
    });
    return map;
  }, [results]);

  const flat = results;

  if (!isOpen) return null;

  const handleSelect = (r: GlobalSearchResult) => {
    onNavigate(r.tab, r.query);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[activeIndex]) handleSelect(flat[activeIndex]);
    }
  };

  return (
    <div className="tg-search-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="tg-search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tg-search-head">
          <Search size={18} className="tg-search-head__icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="ابحث في كل التطبيق: عميل، فاتورة، صنف، مرتجع..."
            className="tg-search-input"
            aria-label="بحث ذكي"
          />
          <button type="button" onClick={onClose} className="tg-search-close" aria-label="إغلاق">
            <X size={16} />
          </button>
        </div>

        <div className="tg-search-body">
          {!rawQ || rawQ.length < 2 ? (
            <div className="tg-search-empty">
              <div className="tg-search-empty__icon"><Search size={26} /></div>
              <div className="tg-search-empty__title">بحث ذكي في كل التطبيق</div>
              <div className="tg-search-empty__sub">اكتب اسم عميل، رقم فاتورة، كود صنف، أو مرتجع (حرفين فأكثر).</div>
              <div className="tg-search-quick">
                {allowedTabs.includes('all_customers') && <button onClick={() => { onNavigate('all_customers'); onClose(); }} className="tg-search-quick__btn">العملاء</button>}
                {allowedTabs.includes('reps') && <button onClick={() => { onNavigate('reps'); onClose(); }} className="tg-search-quick__btn">المناديب</button>}
                {allowedTabs.includes('catalog') && <button onClick={() => { onNavigate('catalog'); onClose(); }} className="tg-search-quick__btn">الكتالوج</button>}
                {allowedTabs.includes('invoices') && <button onClick={() => { onNavigate('invoices'); onClose(); }} className="tg-search-quick__btn">أوامر البيع</button>}
                {allowedTabs.includes('collection') && <button onClick={() => { onNavigate('collection'); onClose(); }} className="tg-search-quick__btn">التحصيل</button>}
                {allowedTabs.includes('returns') && <button onClick={() => { onNavigate('returns'); onClose(); }} className="tg-search-quick__btn">المرتجعات</button>}
                {allowedTabs.includes('offers') && <button onClick={() => { onNavigate('offers'); onClose(); }} className="tg-search-quick__btn">العروض</button>}
                {allowedTabs.includes('targets') && <button onClick={() => { onNavigate('targets'); onClose(); }} className="tg-search-quick__btn">التارجت</button>}
              </div>
            </div>
          ) : flat.length === 0 ? (
            <div className="tg-search-empty">
              <div className="tg-search-empty__title">لا توجد نتائج لـ "{query}"</div>
              <div className="tg-search-empty__sub">جرّب كلمة أخرى أو تحقق من الإملاء.</div>
            </div>
          ) : (
            (Object.keys(grouped) as string[]).map((g) => {
              const meta = GROUP_META[g];
              const Icon = meta.icon;
              return (
                <div key={g} className="tg-search-group">
                  <div className="tg-search-group__head">
                    <Icon size={14} />
                    <span>{meta.label}</span>
                    <span className="tg-search-group__count">{grouped[g].length}</span>
                  </div>
                  {grouped[g].map((r) => {
                    const idx = flat.indexOf(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleSelect(r)}
                        className={`tg-search-item${idx === activeIndex ? ' tg-search-item--active' : ''}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div className="tg-search-item__body">
                          <div className="tg-search-item__title">{r.title}</div>
                          <div className="tg-search-item__sub">{r.subtitle}</div>
                        </div>
                        <ArrowLeft size={14} className="tg-search-item__arrow" />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="tg-search-foot">
          <span>↑↓ للتنقل</span>
          <span>Enter للفتح</span>
          <span>Esc للإغلاق</span>
          {flat.length > 0 && <span className="tg-search-foot__count">{flat.length} نتيجة</span>}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
