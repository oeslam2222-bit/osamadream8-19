import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Customer } from '../types';
import { CustomerDetailCard } from './CustomerDetailCard';
import { CustomerLedgerModal } from './CustomerLedgerModal';

interface CustomerDetailsSheetProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
}

export const CustomerDetailsSheet: React.FC<CustomerDetailsSheetProps> = ({
  isOpen,
  customer,
  onClose,
}) => {
  const [showLedger, setShowLedger] = useState(false);

  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 flex items-center justify-between border-b border-slate-700">
          <h2 className="font-black text-lg">بيانات العميل</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <CustomerDetailCard
            customer={customer}
            onViewLedger={() => setShowLedger(true)}
          />
        </div>
      </div>

      {/* Ledger Modal */}
      {customer && (
        <CustomerLedgerModal
          isOpen={showLedger}
          customer={customer}
          onClose={() => setShowLedger(false)}
        />
      )}
    </div>
  );
};
