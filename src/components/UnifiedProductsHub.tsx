import {
  Boxes,
  Layers,
  Sparkles,
} from 'lucide-react';
import React, { useState } from 'react';
import { Customer, Invoice } from '../types';
import { ProductCatalog } from './ProductCatalog';
import { InventoryStockView } from './InventoryStockView';
import { PromotionsOffersView } from './PromotionsOffersView';

interface UnifiedProductsHubProps {
  initialSubTab?: 'catalog' | 'inventory' | 'offers';
  onOpenCart?: () => void;
  selectedCustomer?: Customer | null;
  onClearSelectedCustomer?: () => void;
  onNavigateToInvoices?: (invoice?: Invoice) => void;
}

export const UnifiedProductsHub: React.FC<UnifiedProductsHubProps> = ({
  initialSubTab = 'catalog',
  onOpenCart,
  selectedCustomer,
  onClearSelectedCustomer,
  onNavigateToInvoices,
}) => {
  const [subTab, setSubTab] = useState<'catalog' | 'inventory' | 'offers'>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Top Header Hub Navigation Pills */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--app-warn)] text-slate-950 flex items-center justify-center font-black">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">مركز الأصناف والمخزون والعروض</h2>
            <p className="text-[10.5px] text-slate-400">
              كتالوج المنتجات، جرد المستودعات والفروع، وقائمة العروض المباشرة
            </p>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('catalog')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'catalog'
                ? 'bg-[var(--app-warn)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>الكتالوج والطلب السريع 🛒</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'inventory'
                ? 'bg-[var(--app-warn)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>جرد وإدارة المخزون 🏢</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('offers')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'offers'
                ? 'bg-[var(--app-warn)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>العروض والخصومات 🎁</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {subTab === 'catalog' && (
        <div className="animate-in fade-in duration-200">
          <ProductCatalog
            onOpenCart={onOpenCart}
            selectedCustomer={selectedCustomer}
            onClearSelectedCustomer={onClearSelectedCustomer}
            onNavigateToInvoices={onNavigateToInvoices}
          />
        </div>
      )}

      {subTab === 'inventory' && (
        <div className="animate-in fade-in duration-200">
          <InventoryStockView />
        </div>
      )}

      {subTab === 'offers' && (
        <div className="animate-in fade-in duration-200">
          <PromotionsOffersView />
        </div>
      )}
    </div>
  );
};
