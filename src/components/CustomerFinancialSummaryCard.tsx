import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  User,
  Phone,
  MapPin,
  Building2,
  Receipt,
  RotateCcw,
  Store,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { Customer, Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { findCustomerMatch } from '../services/arabicMatchingService';
import { useApp } from '../context/AppContext';

export interface CustomerFinancialSummaryCardProps {
  /** The customer object or partial customer info */
  customer?: Customer | Partial<Customer> | null;
  /** Value of the current invoice/cart to compute impact */
  currentInvoiceAmount: number;
  /** Whether the accordion starts expanded */
  initiallyOpen?: boolean;
  /** Callback when accordion is toggled */
  onToggle?: (isOpen: boolean) => void;
  /** Optional custom CSS classes */
  className?: string;
  /** Color theme: dark (POS Cashier) or light (Invoice Preview) */
  theme?: 'dark' | 'light';
  /** Card title override */
  title?: string;
  /** When true, renders customer details like phone, address, branch, rep */
  showCustomerDetails?: boolean;
  /** Action handler when user clicks change/remove customer */
  onChangeCustomer?: () => void;
  /** Optional customer list override if outside context */
  customCustomersList?: Customer[];
}

export const CustomerFinancialSummaryCard: React.FC<CustomerFinancialSummaryCardProps> = ({
  customer,
  currentInvoiceAmount = 0,
  initiallyOpen = false,
  onToggle,
  className = '',
  theme = 'dark',
  title,
  showCustomerDetails = false,
  onChangeCustomer,
  customCustomersList
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  // Single Source of Truth: Always bind to "كافة العملاء" from AppContext
  const { customers: contextCustomers } = useApp();
  const allCustomers = customCustomersList && customCustomersList.length > 0
    ? customCustomersList
    : (contextCustomers || []);

  // Match the customer in the master customer database
  const masterCustomer = useMemo(() => {
    if (!customer) return null;
    return findCustomerMatch(allCustomers, {
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone,
    }) || null;
  }, [customer, allCustomers]);

  // Effective unified customer data (prefer master record from "كافة العملاء")
  const effectiveData = useMemo(() => {
    const src = masterCustomer || customer;
    if (!src) return null;

    const name = src.name || 'عميل نقدي كاش (مباشر)';
    const code = src.code || 'CASH';
    const phone = src.phone || '';
    const address = src.address || '';
    const branchName = src.branchName || '';
    const salesRepName = src.salesRepName || (src as any).repName || '';
    const taxNumber = src.taxNumber || '';

    // Authoritative financial figures strictly derived from master customer data
    const currentDebt = Number(masterCustomer?.currentBalance ?? masterCustomer?.balance ?? customer?.currentBalance ?? customer?.balance ?? 0);
    const overdueAmount = Number(masterCustomer?.totalOverdueAndDue ?? masterCustomer?.overdueBalance ?? customer?.totalOverdueAndDue ?? customer?.overdueBalance ?? currentDebt);
    const creditLimit = Number(masterCustomer?.creditLimit ?? customer?.creditLimit ?? 0);
    const invoiceTotal = Math.max(0, Number(currentInvoiceAmount || 0));
    const debtAfterInvoice = currentDebt + invoiceTotal;
    const hasCreditLimit = creditLimit > 0;
    const isExceeded = hasCreditLimit && debtAfterInvoice > creditLimit;
    const excessAmount = isExceeded ? debtAfterInvoice - creditLimit : 0;

    return {
      name,
      code,
      phone,
      address,
      branchName,
      salesRepName,
      taxNumber,
      currentDebt,
      overdueAmount,
      creditLimit,
      invoiceTotal,
      debtAfterInvoice,
      hasCreditLimit,
      isExceeded,
      excessAmount,
      isMasterMatched: Boolean(masterCustomer),
    };
  }, [masterCustomer, customer, currentInvoiceAmount]);

  const toggleAccordion = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (onToggle) onToggle(next);
  };

  if (!effectiveData) return null;

  const isDark = theme === 'dark';
  const {
    name,
    code,
    phone,
    address,
    branchName,
    salesRepName,
    taxNumber,
    currentDebt,
    overdueAmount,
    creditLimit,
    invoiceTotal,
    debtAfterInvoice,
    hasCreditLimit,
    isExceeded,
    excessAmount,
    isMasterMatched
  } = effectiveData;

  const cardTitle = title || (showCustomerDetails ? 'بيانات وموقف العميل المالي' : 'الموقف المالي والائتماني المعتمد');

  return (
    <div
      id="customer-financial-accordion-container"
      className={`rounded-2xl transition-all duration-200 border overflow-hidden shadow-xs ${
        isDark
          ? 'bg-slate-900 border-slate-700/80 text-white'
          : 'bg-amber-50/70 border-amber-200 text-slate-900'
      } ${className}`}
    >
      {/* 
        ========================================================================
        ACCORDION HEADER: Ultra-compact, mobile-friendly, non-overflowing
        ========================================================================
      */}
      <div
        onClick={toggleAccordion}
        className={`p-2.5 sm:p-3 flex items-center justify-between gap-2 cursor-pointer select-none transition ${
          isDark
            ? 'hover:bg-slate-850 bg-slate-900'
            : 'hover:bg-amber-100/70 bg-amber-50/90'
        }`}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        title="انقر لتوسيع أو طي التفاصيل المالية للعميل"
      >
        {/* Right side: Customer avatar & primary identity */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
              isDark
                ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                : 'bg-amber-500/20 text-amber-800 border border-amber-300'
            }`}
          >
            {showCustomerDetails ? <User className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs sm:text-sm font-black truncate max-w-[200px] sm:max-w-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {name}
              </span>
              
              {/* Customer Code Badge */}
              <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded shrink-0 ${
                isDark ? 'bg-slate-800 text-amber-300 border border-slate-700' : 'bg-white text-slate-800 border border-slate-200'
              }`}>
                {code}
              </span>

              {/* Credit Status Badge */}
              <span
                className={`text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
                  isExceeded
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : hasCreditLimit
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {isExceeded ? (
                  <>
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <span>تجاوز الحد</span>
                  </>
                ) : hasCreditLimit ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>ضمن الحد</span>
                  </>
                ) : (
                  <span>كاش فقط</span>
                )}
              </span>
            </div>

            {/* Micro Summary when Accordion is Folded (Mobile-Friendly) */}
            {!isOpen && (
              <div className={`text-[10px] sm:text-[11px] pt-0.5 flex items-center gap-2 flex-wrap font-medium ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>
                <span>
                  المديونية الحالية:{' '}
                  <strong className={`font-mono font-bold ${currentDebt > 0 ? (isDark ? 'text-amber-300' : 'text-amber-900') : ''}`}>
                    {formatCurrency(currentDebt)}
                  </strong>
                </span>
                <span className="opacity-40">•</span>
                <span>
                  بعد الفاتورة:{' '}
                  <strong className={`font-mono font-black ${isExceeded ? 'text-rose-400' : isDark ? 'text-amber-400' : 'text-slate-900'}`}>
                    {formatCurrency(debtAfterInvoice)}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Left side: Change customer button + Accordion Chevron indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onChangeCustomer && (
            <button
              type="button"
              id="pos-change-customer-btn"
              onClick={(e) => {
                e.stopPropagation();
                onChangeCustomer();
              }}
              className={`px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                  : 'bg-white hover:bg-amber-100 text-slate-700 border-amber-200'
              }`}
              title="تغيير أو مسح العميل الحالي"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">تغيير</span>
            </button>
          )}

          {/* Accordion Arrow Button with smooth rotation */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] sm:text-xs font-black transition ${
              isDark
                ? 'bg-slate-800/90 text-amber-400 border border-slate-700'
                : 'bg-amber-200/70 text-amber-900 border border-amber-300/80'
            }`}
          >
            <span className="hidden xs:inline">
              {isOpen ? 'طي' : 'عرض الموقف'}
            </span>
            <div className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        ACCORDION BODY: Expanded Details (Customer Info + 5 Financial Metrics)
        ========================================================================
      */}
      {isOpen && (
        <div
          id="customer-financial-accordion-body"
          className={`px-2.5 sm:px-3 pb-3 pt-2 border-t space-y-2.5 animate-in slide-in-from-top-2 duration-150 ${
            isDark ? 'border-slate-800 bg-slate-900/95' : 'border-amber-200/80 bg-amber-50/50'
          }`}
        >
          {/* Section 1: Customer Contact & Delivery Info (When showCustomerDetails is enabled) */}
          {showCustomerDetails && (
            <div className={`p-2 rounded-xl text-[11px] border flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
              isDark ? 'bg-slate-850 border-slate-750 text-slate-300' : 'bg-white border-amber-200 text-slate-700'
            }`}>
              {phone && (
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-amber-400" />
                  <a href={`tel:${phone}`} className="hover:underline font-mono font-bold text-amber-300" dir="ltr">
                    {phone}
                  </a>
                </div>
              )}
              {branchName && (
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  <span>{branchName}</span>
                </div>
              )}
              {salesRepName && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>المندوب: <strong>{salesRepName}</strong></span>
                </div>
              )}
              {address && (
                <div className="flex items-center gap-1 min-w-0 max-w-full">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate" title={address}>العنوان: {address}</span>
                </div>
              )}
              {taxNumber && (
                <div className="flex items-center gap-1 text-[10px] opacity-75 font-mono">
                  <span>س.ت / ضريبي: {taxNumber}</span>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Header title and "All Customers" Data Authority indicator */}
          <div className="flex items-center justify-between text-[11px] font-bold px-0.5">
            <span className={isDark ? 'text-amber-300' : 'text-slate-800'}>
              📊 {cardTitle}
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
              isDark ? 'bg-slate-800 text-emerald-300 border border-slate-700' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>مطابق لقاعدة كافة العملاء</span>
            </span>
          </div>

          {/* 
            Section 3: The 5 Requested Financial Details
            Layout: 2-col on mobile phones, 3-col on small tablets, 5-col on desktop
            Ensures NO text overlap and pleasant reading line-height.
          */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 sm:gap-2 text-center text-xs">
            
            {/* 1. إجمالي المتأخرات والمستحق */}
            <div className={`p-2 rounded-xl border flex flex-col justify-between transition ${
              isDark
                ? 'bg-slate-800/90 border-slate-700/80 hover:border-slate-600'
                : 'bg-white border-amber-200 hover:border-amber-300'
            }`}>
              <span className={`text-[10px] font-bold block leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                إجمالي المتأخرات والمستحق
              </span>
              <div className={`text-xs sm:text-sm font-black font-mono mt-1.5 leading-tight ${
                overdueAmount > 0 ? (isDark ? 'text-rose-400' : 'text-rose-700') : (isDark ? 'text-slate-300' : 'text-slate-700')
              }`}>
                {formatCurrency(overdueAmount)}
              </div>
            </div>

            {/* 2. المديونية الحالية */}
            <div className={`p-2 rounded-xl border flex flex-col justify-between transition ${
              isDark
                ? 'bg-slate-800/90 border-slate-700/80 hover:border-slate-600'
                : 'bg-white border-amber-200 hover:border-amber-300'
            }`}>
              <span className={`text-[10px] font-bold block leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                المديونية الحالية
              </span>
              <div className={`text-xs sm:text-sm font-black font-mono mt-1.5 leading-tight ${
                currentDebt > 0 ? (isDark ? 'text-amber-300' : 'text-amber-800') : (isDark ? 'text-slate-300' : 'text-slate-700')
              }`}>
                {formatCurrency(currentDebt)}
              </div>
            </div>

            {/* 3. قيمة الفاتورة الحالية */}
            <div className={`p-2 rounded-xl border flex flex-col justify-between transition ${
              isDark
                ? 'bg-slate-800/90 border-slate-700/80 hover:border-slate-600'
                : 'bg-white border-amber-200 hover:border-amber-300'
            }`}>
              <span className={`text-[10px] font-bold block leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                قيمة الفاتورة الحالية
              </span>
              <div className={`text-xs sm:text-sm font-black font-mono mt-1.5 leading-tight ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                {formatCurrency(invoiceTotal)}
              </div>
            </div>

            {/* 4. المديونية بعد الفاتورة */}
            <div className={`p-2 rounded-xl border flex flex-col justify-between transition ${
              isDark
                ? 'bg-slate-800/90 border-slate-700/80 hover:border-slate-600'
                : 'bg-white border-amber-200 hover:border-amber-300'
            }`}>
              <span className={`text-[10px] font-bold block leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                المديونية بعد الفاتورة
              </span>
              <div className={`text-xs sm:text-sm font-black font-mono mt-1.5 leading-tight ${
                isExceeded
                  ? 'text-rose-400'
                  : debtAfterInvoice > 0
                  ? (isDark ? 'text-amber-400' : 'text-amber-900')
                  : (isDark ? 'text-slate-300' : 'text-slate-700')
              }`}>
                {formatCurrency(debtAfterInvoice)}
              </div>
            </div>

            {/* 5. الحد الائتماني المعتمد (Spans 2 columns on mobile so it never gets crammed) */}
            <div className={`p-2 rounded-xl border flex flex-col justify-between col-span-2 sm:col-span-1 transition ${
              isDark
                ? 'bg-slate-800/90 border-slate-700/80 hover:border-slate-600'
                : 'bg-white border-amber-200 hover:border-amber-300'
            }`}>
              <span className={`text-[10px] font-bold block leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                الحد الائتماني المعتمد
              </span>
              <div className={`text-xs sm:text-sm font-black font-mono mt-1.5 leading-tight ${
                hasCreditLimit
                  ? (isDark ? 'text-emerald-400' : 'text-emerald-700')
                  : (isDark ? 'text-slate-400' : 'text-slate-600')
              }`}>
                {hasCreditLimit ? formatCurrency(creditLimit) : 'كاش فقط (لا يوجد حد)'}
              </div>
            </div>
          </div>

          {/* Section 4: Exceeded Limit Warning Notice */}
          {isExceeded && (
            <div className={`p-2.5 rounded-xl text-xs font-bold flex items-start gap-2 animate-in fade-in ${
              isDark
                ? 'bg-rose-950/70 text-rose-200 border border-rose-800'
                : 'bg-rose-50 text-rose-900 border border-rose-200'
            }`}>
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span>تنبيه ائتماني: إجمالي المديونية بعد الفاتورة يتجاوز الحد الائتماني المعتمد بمقدار </span>
                <strong className="text-rose-300 underline font-mono">{formatCurrency(excessAmount)}</strong>
                <span>. يلزم تحصيل دفعة نقدية فورية أو موافقة المشرف لاعتماد الصرف.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
