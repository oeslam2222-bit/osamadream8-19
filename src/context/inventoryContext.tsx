import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Product, Branch } from '../types';

interface InventoryContextType {
  products: Product[];
  branches: Branch[];
  isLoading: boolean;
  getBranchStockForProduct: (productId: string, branchId: string) => number;
  updateStock: (productId: string, branchId: string, quantity: number) => void;
  setProducts: (products: Product[]) => void;
  setBranches: (branches: Branch[]) => void;
}

const InventoryContext = createContext<InventoryContextType | null>(null);

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProductsState] = useState<Product[]>([]);
  const [branches, setBranchesState] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getBranchStockForProduct = useCallback((productId: string, branchId: string) => {
    const p = products.find(p => p.id === productId);
    return p?.branchStockActual || 0;
  }, [products]);

  const updateStock = useCallback((productId: string, branchId: string, quantity: number) => {
    setProductsState(prev => prev.map(p => p.id === productId ? { ...p, branchStockActual: quantity } : p));
  }, []);

  const setProducts = useCallback((products: Product[]) => setProductsState(products), []);
  const setBranches = useCallback((branches: Branch[]) => setBranchesState(branches), []);

  const value = useMemo(() => ({
    products, branches, isLoading,
    getBranchStockForProduct, updateStock,
    setProducts, setBranches
  }), [products, branches, isLoading, getBranchStockForProduct, updateStock, setProducts, setBranches]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}