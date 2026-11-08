import React from 'react';
import {
  AlertTriangle, Building2, CreditCard, MapPin, MessageCircle, Phone, Receipt, ShoppingCart, UserCheck, X, CalendarCheck, Image as ImageIcon,
} from 'lucide-react';
import { Customer } from '../../types';
import { formatCurrency } from '../../services/invoiceService';
import {
  getCreditUsagePercent, getCustomerBalance, getCustomerOverdue, getCustomerStatusBadge, getCustomerDealtBadge,
} from '../../services/customerFilterPredicates';
import { mergeShopPhotos } from '../../services/customerShopPhotos';

interface CustomerQuickDrawerProps {
  customer: Customer;
  isPrivacyMode?: boolean;
  onClose: () => void;
  onOpenFullProfile: (customer: Customer) => void;
  onOpenNewOrder?: (customer: Customer) => void;
}

export const CustomerQuickDrawer: React.FC<CustomerQuickDrawerProps> = ({
  customer, isPrivacyMode = false, onClose, onOpenFullProfile, onOpenNewOrder,
}) => {
  const money = (v?: number | null) => (isPrivacyMode ? '•••••• ج.م' : formatCurrency(v || 0));
  const balance = getCustomerBalance(customer);
  const overdue = getCustomerOverdue(customer);
  const limit = customer.creditLimit || 0;
  const usage = getCreditUsagePercent(customer);
  const status = getCustomerStatusBadge(customer);
  const dealtBadge = getCustomerDealtBadge(customer);
  const monthlyCollections = customer.monthlyCollections2026 ? Object.values(customer.monthlyCollections2026).reduce((s, v) => s + Math.abs(Number(v) || 0), 0) : 0;
  const paid = Math.max(Math.abs(Number(customer.collections2026) || 0), Math.abs(Number(customer.totalMonthlyCollections) || 0), Math.abs(Number(customer.totalOverallCollections) || 0), monthlyCollections);
  const remaining = overdue > 0 ? overdue : balance;
  const rep = customer.salesRepName || customer.repName || 'غير محدد';
  const lastVisit = customer.lastVisitDate || customer.visitHistory?.[0]?.date || customer.visitHistory?.[customer.visitHistory.length ? customer.visitHistory.length - 1 : 0]?.date || '—';
  const shopPhotos = mergeShopPhotos(customer as any);

  return (
    <div className="cq-backdrop" onClick={onClose}>
      <aside className="cq-drawer" role="dialog" aria-modal="true" aria-label={`تفاصيل العميل ${customer.name}`} onClick={(e) => e.stopPropagation()}>
        <header className="cq-head">
          <span className="cq-avatar overflow-hidden" aria-hidden="true" style={{ background: 'var(--brand-primary)', color: '#fff' }}>
            {customer.profileImageUrl ? <img src={customer.profileImageUrl} alt={customer.name} className="w-full h-full object-cover" loading="lazy" /> : customer.name.slice(0, 1)}
          </span>
          <div className="cq-head-text">
            <h3 className="cq-name">{customer.name}</h3>
            <p className="cq-code">كود العميل: <strong className="font-mono">{customer.code || '---'}</strong></p>
            <div className="cq-badges">
              <span className={`pill pill-${status.tone}`}>{status.label}</span>
              <span className={`pill pill-${dealtBadge.tone}`}>{dealtBadge.label}</span>
            </div>
          </div>
          <button type="button" className="cq-close" onClick={onClose} aria-label="إغلاق"><X className="w-4 h-4" /></button>
        </header>

        <div className="cq-body">
          <div className="cq-info-grid">
            <div className="cq-info"><MapPin className="w-3.5 h-3.5" /><span>المنطقة/الفرع</span><strong>{customer.region || customer.branchName || '—'}</strong></div>
            <div className="cq-info"><UserCheck className="w-3.5 h-3.5" /><span>المندوب</span><strong>{rep}</strong></div>
            <div className="cq-info"><Building2 className="w-3.5 h-3.5" /><span>القطاع</span><strong>{customer.sector === 'home' ? 'منزلي' : customer.sector === 'electrical' ? 'كهرباء' : customer.sector === 'both' ? 'القطاعين' : 'الكل'}</strong></div>
            <div className="cq-info"><CalendarCheck className="w-3.5 h-3.5" /><span>آخر زيارة</span><strong>{lastVisit}</strong></div>
            <div className="cq-info"><Phone className="w-3.5 h-3.5" /><span>الهاتف</span><strong dir="ltr">{customer.phone || '—'}</strong></div>
          </div>

          <div className="cq-finance">
            <div className="cq-finance-row"><span>إجمالي المديونية</span><strong className="t-navy app-num">{money(balance)}</strong></div>
            <div className="cq-finance-row"><span>إجمالي المسدد</span><strong className="t-ok app-num">{money(paid)}</strong></div>
            <div className="cq-finance-row cq-finance-row-risk"><span>المتبقي للتحصيل</span><strong className="t-risk app-num">{money(remaining)}</strong></div>
            <div className="cq-limit">
              <div className="cq-limit-head"><span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /><span>استخدام الحد الائتماني</span></span><strong className="app-num">{limit > 0 ? money(limit) : 'بدون حد'}</strong></div>
              {limit > 0 && <div className="cq-bar" aria-hidden="true"><span className={usage > 100 ? 'is-over' : usage >= 80 ? 'is-high' : 'is-ok'} style={{ width: `${Math.min(100, Math.max(3, usage))}%` }} /></div>}
              <div className="cq-limit-foot"><span>{limit > 0 ? `استهلاك ${usage}%` : 'لم يُحدد حد ائتماني'}</span>{usage > 100 && <span className="pill pill-risk"><AlertTriangle className="w-3 h-3" /> متجاوز</span>}</div>
            </div>
          </div>

          {shopPhotos.length > 0 && (
            <div className="cq-notes">
              <h4 className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />صور المحل</h4>
              <div className="flex gap-2 mt-1 overflow-x-auto pb-1">
                {shopPhotos.map((p) => <img key={p.url} src={p.url} alt="صورة المحل" loading="lazy" className="w-16 h-16 rounded-xl object-cover border border-[var(--app-line)] shrink-0" />)}
              </div>
            </div>
          )}

          <div className="cq-actions">
            {customer.phone && <a className="cq-btn cq-btn-call" href={`tel:${customer.phone}`}><Phone className="w-4 h-4" /><span>اتصال</span></a>}
            {customer.phone && <a className="cq-btn cq-btn-wa" href={`https://wa.me/20${customer.phone.replace(/^0+/, '')}`} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" /><span>واتساب</span></a>}
            <button type="button" className="cq-btn cq-btn-primary" onClick={() => onOpenFullProfile(customer)}><Receipt className="w-4 h-4" /><span>الملف الكامل</span></button>
            {onOpenNewOrder && <button type="button" className="cq-btn cq-btn-ghost" onClick={() => onOpenNewOrder(customer)}><ShoppingCart className="w-4 h-4" /><span>طلبية</span></button>}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default CustomerQuickDrawer;
TS
