import React, { useState } from 'react';
import { Scale, X, ShieldAlert, Gavel, Check } from 'lucide-react';
import { formatCurrency } from '../services/invoiceService';
import type { Customer } from '../types';
import '../styles/legal-transfer.css';

export interface LegalTransferOption {
  emoji: string;
  label: string;
  reason: string;
}

export const LEGAL_TRANSFER_OPTIONS: LegalTransferOption[] = [
  { emoji: '🚨', label: 'هارب / اختفاء', reason: 'ارتداء العميل عن السداد واختفاء فجأة — متابعة قضائية' },
  { emoji: '😟', label: 'متعثر جداً / معسر', reason: 'فقدان القدرة الشرائية العميقة وانعكاس مزمن يلغي أركان الدين القانوني' },
  { emoji: '⚖️', label: 'مخالفة احتقاقية / غش', reason: 'مخالفة قانونية متكررة وإجراءات غش أو تزوير مستمرة' },
];

/** لون كل سبب: هارب أحمر · متعثر عنبري · مخالفة بنفسجي */
const OPTION_TONES = ['risk', 'warn', 'viol'] as const;

interface LegalTransferModalProps {
  customer: Customer;
  referredByName?: string;
  referredByRole?: string;
  onClose: () => void;
  onConfirm: (reason: string, transferIcon: string) => void;
}

export const LegalTransferModal: React.FC<LegalTransferModalProps> = ({
  customer,
  referredByName = 'الإدارة العليا',
  referredByRole = 'branch_manager',
  onClose,
  onConfirm,
}) => {
  const [selected, setSelected] = useState<LegalTransferOption>(LEGAL_TRANSFER_OPTIONS[1]);
  const debt = customer.currentBalance ?? customer.balance ?? 0;
  const overdue = customer.totalOverdueAndDue ?? customer.overdueBalance ?? debt;

  return (
    <div className="lg-overlay fixed inset-0 z-50 flex items-center justify-center p-3 animate-in fade-in">
      <div className="lg-modal" role="dialog" aria-modal="true" aria-label="إحالة العميل للشؤون القانونية">
        <div className="lg-hd">
          <div className="lg-hd__main">
            <div className="lg-hd__ico" aria-hidden="true">
              <Scale className="w-5 h-5" />
            </div>
            <div className="lg-hd__txt">
              <h3 className="lg-hd__title">إحالة العميل للشؤون القانونية</h3>
              <p className="lg-hd__sub">العميل: <strong>{customer.name}</strong></p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="lg-x" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="lg-bd">
          <div className="lg-sum">
            <div className="lg-sum__c lg-sum__c--debt">
              <span className="lg-sum__l">إجمالي المديونية</span>
              <span className="lg-sum__v">{formatCurrency(debt)}</span>
            </div>
            <div className="lg-sum__c lg-sum__c--over">
              <span className="lg-sum__l">المديونية المتأخرة</span>
              <span className="lg-sum__v">{formatCurrency(overdue)}</span>
            </div>
          </div>

          <div className="lg-opts">
            <p className="lg-opts__t">اختر سبب التحويل (يحدد أيقونة الملف القانوني):</p>
            <div className="lg-opts__list" role="radiogroup" aria-label="سبب التحويل">
              {LEGAL_TRANSFER_OPTIONS.map((opt, i) => {
                const isActive = selected.emoji === opt.emoji;
                return (
                  <button
                    key={opt.emoji}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setSelected(opt)}
                    className={`lg-opt lg-opt--${OPTION_TONES[i] || 'warn'} ${isActive ? 'is-on' : ''}`}
                  >
                    <span className="lg-opt__emoji" aria-hidden="true">{opt.emoji}</span>
                    <span className="lg-opt__body">
                      <span className="lg-opt__label">{opt.label}</span>
                      <span className="lg-opt__reason">{opt.reason}</span>
                    </span>
                    <span className="lg-opt__tick" aria-hidden="true">{isActive && <Check className="w-3.5 h-3.5" />}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg-note">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>بالإحالة للشؤون القانونية يبدأ مسار قانوني رسمي: إنذار، ضمانات، أوامر أداء، وإجراءات قضائية.</span>
          </div>

          <div className="lg-ft">
            <button type="button" onClick={() => onConfirm(selected.reason, selected.emoji)} className="lg-btn lg-btn--primary">
              <Gavel className="w-4 h-4" />
              <span>تأكيد الإحالة القانونية</span>
            </button>
            <button type="button" onClick={onClose} className="lg-btn lg-btn--ghost">
              <X className="w-4 h-4" />
              <span>إلغاء</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalTransferModal;
