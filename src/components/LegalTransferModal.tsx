import React, { useState } from 'react';
import { Scale, X, ShieldAlert, Gavel } from 'lucide-react';
import { formatCurrency } from '../services/invoiceService';
import type { Customer } from '../types';

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
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-[var(--app-line)] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--app-line)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-navy-panel text-amber-400 flex items-center justify-center font-black">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base">إحالة العميل للشؤون القانونية</h3>
              <p className="text-[11px] text-slate-500">العميل: {customer.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-50 p-3 rounded-xl border border-[var(--app-line)] flex items-center justify-between">
          <div>
            <span className="text-slate-500 block text-[11px]">إجمالي المديونية:</span>
            <span className="font-black text-base text-rose-600 tabular-nums">{formatCurrency(debt)}</span>
          </div>
          <div className="text-left">
            <span className="text-slate-500 block text-[11px]">المديونية المتأخرة:</span>
            <span className="font-black text-base text-amber-700 tabular-nums">{formatCurrency(overdue)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-bold text-slate-700 text-xs">اختر سبب التحويل (يحدد أيقونة الملف القانوني):</p>
          <div className="grid grid-cols-1 gap-2">
            {LEGAL_TRANSFER_OPTIONS.map((opt) => {
              const isActive = selected.emoji === opt.emoji;
              return (
                <button
                  key={opt.emoji}
                  type="button"
                  onClick={() => setSelected(opt)}
                  className={`w-full text-start rounded-xl border p-3 transition cursor-pointer ${
                    isActive
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="font-black text-slate-900 text-xs sm:text-sm">{opt.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">{opt.reason}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 font-bold leading-relaxed">
          <ShieldAlert className="w-3.5 h-3.5 inline-block ml-1" />
          بالإحالة للشؤون القانونية يبدأ مسار قانوني رسمي: إنذار، ضمانات، أوامر أداء، وإجراءات قضائية.
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onConfirm(selected.reason, selected.emoji)}
            className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2B38] hover:bg-[#123554] px-4 py-2.5 text-xs font-black text-white transition cursor-pointer"
          >
            <Gavel className="w-4 h-4" />
            <span>تأكيد الإحالة القانونية</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-black text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            <span>إلغاء</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalTransferModal;
