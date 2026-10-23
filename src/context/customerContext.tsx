import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Customer, CustomerVisit } from '../types';

interface CustomerContextType {
  customers: Customer[];
  visits: CustomerVisit[];
  isLoading: boolean;
  importCustomersList: (customers: Customer[]) => void;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  cleanAndDeduplicateCustomers: () => { duplicatesRemoved: number; deduplicatedCount: number };
  addVisit: (visit: CustomerVisit) => { success: boolean; message?: string };
  setCustomers: (customers: Customer[]) => void;
  setVisits: (visits: CustomerVisit[]) => void;
}

const CustomerContext = createContext<CustomerContextType | null>(null);

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomersState] = useState<Customer[]>([]);
  const [visits, setVisitsState] = useState<CustomerVisit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cleanAndDeduplicateCustomers = useCallback(() => {
    const seen = new Set<string>();
    const deduped: Customer[] = [];
    let removed = 0;
    customers.forEach(c => {
      const key = c.code || c.id;
      if (seen.has(key)) {
        removed++;
        return;
      }
      seen.add(key);
      deduped.push(c);
    });
    setCustomersState(deduped);
    return { duplicatesRemoved: removed, deduplicatedCount: deduped.length };
  }, [customers]);

  const updateCustomer = useCallback((id: string, data: Partial<Customer>) => {
    setCustomersState(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);

  const importCustomersList = useCallback((newCustomers: Customer[]) => {
    setCustomersState(prev => [...prev, ...newCustomers]);
  }, []);

  const addVisit = useCallback((visit: CustomerVisit) => {
    setVisitsState(prev => [...prev, visit]);
    return { success: true };
  }, []);

  const setCustomers = useCallback((customers: Customer[]) => setCustomersState(customers), []);
  const setVisits = useCallback((visits: CustomerVisit[]) => setVisitsState(visits), []);

  const value = useMemo(() => ({
    customers, visits, isLoading,
    importCustomersList, updateCustomer, cleanAndDeduplicateCustomers, addVisit,
    setCustomers, setVisits
  }), [customers, visits, isLoading, importCustomersList, updateCustomer, cleanAndDeduplicateCustomers, addVisit, setCustomers, setVisits]);

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer must be used within CustomerProvider');
  return ctx;
}