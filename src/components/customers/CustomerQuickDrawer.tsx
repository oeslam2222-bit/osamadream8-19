import React from 'react';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  ShoppingCart,
  UserCheck,
  X,
} from 'lucide-react';
import { Customer } from '../../types';
import { formatCurrency } from '../../services/invoiceService';
import {
  getCreditUsagePercent,
  getCustomerBalance,
  getCustomerOverdue,
  getCustomerStatusBadge,
  getEligibilityBadge,
} from '../../services/customerFilterPredicates';

interface CustomerQuickDrawerProps {
  customer: Customer;
  isPrivacyMode?: boolean;
  onClose: () => void;
  onOpenFullProfile: (customer: Customer) => void;
  onOpenNewOrder?: (customer: Customer) => void;
}

/**
 * لوحة تفاصيل العميل الجانبية — نسخة مختصرة وسريعة من الملف الكامل:
 * الأرقام الأساسية، استخدام الحد الائتماني كمؤشر واحد، وحالة التعامل.
 */
export const CustomerQuickDrawer: React.FC<CustomerQuickDrawerProps> = ({
  customer,
  isPrivacyMode = false,
  onClose,
  onOpenFullProfile,
  onOpenNewOrder,
}) => {
  const money = (value?: number | null) =>
    isPrivacyMode ? '•••••• ج.م' : formatCurrency(value || 0);

  const balance = getCustomerBalance(customer);
  const overdue = getCustomerOverdue(customer);
  const limit = customer.creditLimit || 0;
  const usage = getCreditUsagePercent(customer);
  const status = getCustomerStatusBadge(customer);
  const eligibilityBadge = getEligibilityBadge(customer);

  const monthlyCollections = customer.monthlyCollections2026
    ? Object.values(customer.monthlyCollections2026).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0)
    : 0;
  const paid = Math.max(
    Math.abs(Number(customer.collections2026) || 0),
    Math.abs(Number(customer.totalMonthlyCollections) || 0),
    Math.abs(Number(customer.totalOverallCollections) || 0),
    monthlyCollections
  );

  const remaining = overdue > 0 ? overdue : balance;
  const rep = customer.salesRepName || customer.repName || 'غير محدد';

  return (
    <div className="cq-backdrop" onClick={onClose}>
      <aside
        className="cq-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`تفاصيل العميل ${customer.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cq-head">
          <span className="cq-avatar" aria-hidden="true">
            {customer.name.slice(0, 1)}
          </span>
          <div className="cq-head-text">
            <h3 className="cq-name">{customer.name}</h3>
            <p className="cq-code">
              كود العميل: <strong className="font-mono">{customer.code || '---'}</strong>
            </p>
            <div className="cq-badges">
              <span className={`pill pill-${status.tone}`}>{status.label}</span>
              <span className={`pill pill-${eligibilityBadge.tone}`}>{eligibilityBadge.label}</span>
            </div>
          </div>
          <button type="button" className="cq-close" onClick={onClose} aria-label="إغلاق تفاصيل العميل">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="cq-body">
          <div className="cq-info-grid">
            <div className="cq-info">
              <MapPin className="w-3.5 h-3.5" />
              <span>المنطقة</span>
              <strong>{customer.region || '—'}</strong>
            </div>
            <div className="cq-info">
              <UserCheck className="w-3.5 h-3.5" />
              <span>المندوب</span>
              <strong>{rep}</strong>
            </div>
            <div className="cq-info">
              <Building2 className="w-3.5 h-3.5" />
              <span>الفرع</span>
              <strong>{customer.branchName || '—'}</strong>
            </div>
            <div className="cq-info">
              <Phone className="w-3.5 h-3.5" />
              <span>الهاتف</span>
              <strong dir="ltr">{customer.phone || '—'}</strong>
            </div>
          </div>

          <div className="cq-finance">
            <div className="cq-finance-row">
              <span>إجمالي المديونية</span>
              <strong className="t-navy app-num">{money(balance)}</strong>
            </div>
            <div className="cq-finance-row">
              <span>إجمالي المسدد</span>
              <strong className="t-ok app-num">{money(paid)}</strong>
            </div>
            <div className="cq-finance-row cq-finance-row-risk">
              <span>المتبقي للتحصيل</span>
              <strong className="t-risk app-num">{money(remaining)}</strong>
            </div>

            <div className="cq-limit">
              <div className="cq-limit-head">
                <span className="flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>المديونية من الحد الائتماني</span>
                </span>
                <strong className="app-num">{limit > 0 ? money(limit) : 'بدون حد'}</strong>
              </div>
              {limit > 0 && (
                <div className="cq-bar" aria-hidden="true">
                  <span
                    className={usage > 100 ? 'is-over' : usage >= 80 ? 'is-high' : 'is-ok'}
                    style={{ width: `${Math.min(100, Math.max(3, usage))}%` }}
                  />
                </div>
              )}
              <div className="cq-limit-foot">
                <span>{limit > 0 ? `استهلاك ${usage}% من الحد` : 'لم يُحدد حد ائتماني لهذا العميل'}</span>
                {usage > 100 && (
                  <span className="pill pill-risk">
                    <AlertTriangle className="w-3 h-3" /> متجاوز الحد
                  </span>
                )}
              </div>
            </div>
          </div>

          {(customer.activityType || customer.paymentTerms || customer.debtStatus) && (
            <div className="cq-notes">
              <h4>بيانات التعامل</h4>
              <ul>
                {customer.activityType && <li><span>النشاط</span><strong>{customer.activityType}</strong></li>}
                {customer.paymentTerms && <li><span>طريقة الدفع</span><strong>{customer.paymentTerms}</strong></li>}
                {customer.debtStatus && <li><span>حالة السداد</span><strong>{customer.debtStatus}</strong></li>}
              </ul>
            </div>
          )}

          <div className="cq-actions">
            {customer.phone && (
              <a className="cq-btn cq-btn-call" href={`tel:${customer.phone}`}>
                <Phone className="w-4 h-4" />
                <span>اتصال</span>
              </a>
            )}
            {customer.phone && (
              <a
                className="cq-btn cq-btn-wa"
                href={`https://wa.me/20${customer.phone.replace(/^0+/, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>واتساب</span>
              </a>
            )}
            <button
              type="button"
              className="cq-btn cq-btn-primary"
              onClick={() => onOpenFullProfile(customer)}
            >
              <Receipt className="w-4 h-4" />
              <span>الملف الكامل</span>
            </button>
            {onOpenNewOrder && (
              <button type="button" className="cq-btn cq-btn-ghost" onClick={() => onOpenNewOrder(customer)}>
                <ShoppingCart className="w-4 h-4" />
                <span>طلبية</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default CustomerQuickDrawer;
