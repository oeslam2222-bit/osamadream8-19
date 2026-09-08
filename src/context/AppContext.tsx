import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { COMPANY_INFO, INITIAL_AUDIT_LOGS, INITIAL_BRANCHES, INITIAL_USERS } from '../data/mockData';
import { DEFAULT_CLOUDINARY_CONFIG } from '../services/cloudinaryService';
import { clearCachedImages } from '../services/imageCacheService';
import { idbClear, idbDelete, idbGet, idbSet, safeLocalStorageSet } from '../services/storageService';
import {
  doesCustomerBelongToBranch,
  doesCustomerBelongToRep,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  isBranchMatch,
  normalizeArabicText,
  getBranchStockForProduct,
  inferBranchFromText,
  sanitizeAndDeduplicateUsers,
  findCustomerMatch,
  resolveCustomerFinancials,
  setActiveCustomersCache,
} from '../services/arabicMatchingService';
import {
  deleteInvoiceFromSupabase,
  deleteAllInvoicesFromSupabase,
  deleteUserFromSupabase,
  fetchCustomersFromSupabase,
  fetchInvoicesFromSupabase,
  fetchProductsFromSupabase,
  fetchUsersFromSupabase,
  findUserInSupabase,
  sanitizeEmail,
  sanitizeIdentifier,
  saveCustomersToSupabase,
  saveInvoiceToSupabase,
  saveProductsToSupabase,
  saveUsersToSupabase,
  saveUserToSupabase,
  supabase,
  SupabaseSyncStatus,
  testSupabaseConnection,
  USER_SYNC_STORE_ID,
} from '../services/supabaseService';
import {
  AccountingSyncLog,
  AuditLog,
  Branch,
  CartItem,
  CloudinaryConfig,
  CompanyInfo,
  Customer,
  InventoryTransaction,
  Invoice,
  OrderStatus,
  Product,
  ReturnedItem,
  ReturnRecord,
  User,
  UserApprovalStatus,
  UserRole,
} from '../types';

interface AppContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  users: User[];
  branches: Branch[];
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  cart: CartItem[];
  cloudinaryConfig: CloudinaryConfig;
  accountingLogs: AccountingSyncLog[];
  auditLogs: AuditLog[];
  recordAuditLog: (logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>) => void;
  clearAuditLogs: () => void;
  isOffline: boolean;
  selectedBranchFilter: string;
  setSelectedBranchFilter: (branch: string) => void;
  refreshInvoicesNow: (force?: boolean) => Promise<{ success: boolean; count: number; message: string }>;
  
  // Supabase Sync
  supabaseStatus: SupabaseSyncStatus;
  isSupabaseSyncing: boolean;
  syncWithSupabase: (direction?: 'fetch' | 'push' | 'both') => Promise<{ success: boolean; message: string }>;

  // Customer Management Actions
  addCustomer: (customer: Customer) => void;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (customerId: string) => void;
  importCustomersList: (newCustomers: Customer[], mode?: 'merge' | 'replace') => void;
  cleanAndDeduplicateCustomers: () => { originalCount: number; deduplicatedCount: number; duplicatesRemoved: number };
  refreshCustomerRepLinks: () => {
    updatedCount: number;
    totalCustomers: number;
    linkedCustomersCount: number;
    unassignedCount: number;
    repBreakdown: { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }[];
    unmatchedReps: string[];
  };
  autoCreateMissingRepsFromCustomers: () => { createdUsers: User[]; count: number; message: string };
  mergeDuplicateUsers: () => Promise<{
    success: boolean;
    message: string;
    mergedCount: number;
    details: string[];
  }>;

  // Auth actions
  login: (identifier: string, password?: string) => Promise<{ success: boolean; message: string; user?: User }>;
  register: (userData: {
    name: string;
    username: string;
    email: string;
    password?: string;
    phone: string;
    branchName: string;
    role: UserRole;
    supervisorId?: string;
  }) => { success: boolean; message: string };
  logout: () => void;

  // Cart Actions (Smart Carton & Piece Logic)
  addToCart: (product: Product, orderType?: 'carton' | 'piece' | 'mixed', count?: number, piecesCount?: number) => { success: boolean; message?: string };
  updateCartItem: (productId: string, updates: Partial<CartItem>) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  getCartSummary: (customDiscountPercent?: number) => {
    totalCartons: number;
    totalPieces: number;
    subtotal: number;
    discountPercentage: number;
    discountAmount: number;
    taxAmount: number;
    grandTotal: number;
    itemCount: number;
  };

  // Product & Inventory Actions
  inventoryLogs: InventoryTransaction[];
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  importProductsList: (newProducts: Product[], mode: 'merge' | 'replace') => void;
  adjustStock: (productId: string, branchChange: number, mainWarehouseChange: number, reason?: string) => void;
  recordInventoryTransaction: (tx: Omit<InventoryTransaction, 'id' | 'timestamp' | 'date'>) => void;
  checkProductAvailability: (productId: string, requestedPieces: number) => { available: boolean; remainingPieces: number; message?: string };

  // Invoice / Order Actions & Approval Workflow
  createOrder: (orderData: Partial<Invoice> & { splitShortagesToBackorder?: boolean }) => {
    success: boolean;
    invoice?: Invoice;
    shortageInvoice?: Invoice;
    message?: string;
  };
  approveOrder: (invoiceId: string, notes?: string) => { success: boolean; message: string };
  forwardOrderToManager: (invoiceId: string, notes?: string) => { success: boolean; message: string };
  rejectOrder: (invoiceId: string, reason: string) => { success: boolean; message: string };
  editPendingOrder: (invoice: Invoice) => { success: boolean; message: string; customer?: Customer | null };
  cancelPendingOrderByRep: (invoiceId: string, reason?: string) => { success: boolean; message: string };
  updateOrderStatus: (invoiceId: string, status: OrderStatus, reason?: string) => { success: boolean; message: string };
  processOrderReturn: (
    invoiceId: string,
    returnedItems: ReturnedItem[],
    reason: string,
    restockToInventory?: boolean
  ) => { success: boolean; message: string; returnRecord?: ReturnRecord };
  deleteInvoice: (invoiceId: string) => Promise<void>;
  syncToAccounting: (invoiceId: string) => Promise<boolean>;

  // User Management & Approval Actions
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  deleteUser: (userId: string) => void;
  approveUser: (userId: string, supervisorId?: string, branchName?: string, role?: UserRole) => void;
  rejectUser: (userId: string) => void;
  assignSupervisor: (repId: string, supervisorId: string) => void;
  authTerminationNotice: string | null;
  clearAuthTerminationNotice: () => void;

  // Settings & App Extras
  companyInfo: CompanyInfo;
  branchCompanyInfo: Record<string, Partial<CompanyInfo>>;
  updateCompanyInfo: (newInfo: Partial<CompanyInfo>) => void;
  resetCompanyInfo: () => void;
  updateBranchCompanyInfo: (branchName: string, newInfo: Partial<CompanyInfo>) => void;
  resetBranchCompanyInfo: (branchName: string) => void;
  getCompanyInfoForBranch: (branchName?: string) => CompanyInfo;
  updateCloudinarySettings: (config: CloudinaryConfig) => void;
  saveMatchedProductImages: (updates: { id: string; imageUrl: string }[]) => void;
  clearAllAppData: (mode?: 'cache_only' | 'full_reset') => void;
  wipeAllProductsAndData: (options?: { wipeInvoices?: boolean }) => Promise<void>;
  dataSaverMode: boolean;
  setDataSaverMode: (enabled: boolean) => void;
  toggleDataSaverMode: () => void;
  installPromptEvent: any;
  canInstallPwa: boolean;
  triggerInstallPrompt: () => Promise<boolean>;
  isInstallModalOpen: boolean;
  setIsInstallModalOpen: (open: boolean) => void;
  
  // Helpers for RBAC
  getVisibleInvoices: () => Invoice[];
  getVisibleProducts: () => Product[];
  getVisibleCustomers: () => Customer[];
  getSupervisorsInBranch: (branchName?: string) => User[];
  getSalesRepsForSupervisor: (supervisorId: string) => User[];
  loginAs: (userId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PRODUCTS: 'dream_dist_products_v9',
  INVOICES: 'dream_dist_invoices_v9',
  USERS: 'dream_dist_users_v10',
  BRANCHES: 'dream_dist_branches_v9',
  CUSTOMERS: 'dream_dist_customers_v9',
  CLOUDINARY: 'dream_dist_cloudinary_v9',
  CURRENT_USER_ID: 'dream_dist_current_user_v9',
  CURRENT_USER_DATA: 'dream_dist_current_user_session_v10',
  IS_AUTH: 'dream_dist_is_auth_v9',
  ACCOUNTING_LOGS: 'dream_dist_acc_logs_v9',
  CART: 'dream_dist_cart_v9',
  DELETED_INVOICE_IDS: 'dream_dist_deleted_invoices_v1',
  PENDING_INVOICES: 'dream_dist_pending_invoices_v1',
};

const getDeletedInvoiceIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_INVOICE_IDS);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
};

const markInvoiceAsDeletedInStorage = (id: string, invoiceNumber?: string) => {
  try {
    const current = getDeletedInvoiceIds();
    if (id) current.add(id);
    if (invoiceNumber) current.add(invoiceNumber);
    localStorage.setItem(STORAGE_KEYS.DELETED_INVOICE_IDS, JSON.stringify(Array.from(current)));
  } catch {}
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Helper to normalize branch names across legacy stored data
  const normalizeBranchName = (name?: string): string => {
    if (!name || !name.trim()) return 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
    const clean = name.trim();
    const inferred = inferBranchFromText(clean);
    if (inferred) return inferred;
    if (!clean.startsWith('فرع') && !clean.includes('المخزن')) {
      return `فرع ${clean}`;
    }
    return clean;
  };

  const normalizeIdentity = (value?: string) => normalizeArabicText(String(value || '')).replace(/\s+/g, '');
  const hasDuplicateUserIdentity = (candidate: Partial<User>, list: User[], excludeId?: string) => {
    const username = normalizeIdentity(candidate.username);
    const email = normalizeIdentity(candidate.email);
    const phone = normalizeIdentity(candidate.phone);
    const name = normalizeIdentity(candidate.name);
    return list.some((u) => {
      if (u.id === excludeId) return false;
      return (username && normalizeIdentity(u.username) === username) ||
        (email && normalizeIdentity(u.email) === email) ||
        (phone && normalizeIdentity(u.phone) === phone) ||
        (name && normalizeIdentity(u.name) === name);
    });
  };

  // Auth and Session Notice
  const [authTerminationNotice, setAuthTerminationNotice] = useState<string | null>(null);
  const clearAuthTerminationNotice = () => setAuthTerminationNotice(null);

  // Initialize state with localStorage fallbacks, ensuring all core initial users are merged
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!saved) return INITIAL_USERS;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0
        ? sanitizeAndDeduplicateUsers(parsed).deduplicated
        : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  const [branches, setBranches] = useState<Branch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRANCHES);
    if (!saved) return INITIAL_BRANCHES;
    try {
      const parsed: Branch[] = JSON.parse(saved);
      // Keep the canonical seven operating branches plus October's central warehouse.
      // Legacy/custom branch labels are normalized onto this fixed list instead of
      // becoming extra branches in totals and selectors.
      const canonicalNames = new Set(INITIAL_BRANCHES.map((branch) => branch.name));
      const savedByName = new Map(parsed.map((branch) => [normalizeBranchName(branch.name), branch]));
      return INITIAL_BRANCHES.map((branch) => ({
        ...branch,
        ...(savedByName.get(branch.name) || {}),
        name: branch.name,
        isMainWarehouse: branch.isMainWarehouse === true,
      })).filter((branch) => canonicalNames.has(branch.name));
    } catch {
      return INITIAL_BRANCHES;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedSession = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_DATA);
    if (!savedSession) return null;
    try {
      return JSON.parse(savedSession) as User;
    } catch {
      return null;
    }
  });

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    const saved = localStorage.getItem('dream_dist_company_info_v1');
    if (saved) {
      try {
        return { ...COMPANY_INFO, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Error parsing saved company info', e);
      }
    }
    return COMPANY_INFO;
  });

  const updateCompanyInfo = (newInfo: Partial<CompanyInfo>) => {
    setCompanyInfo((prev) => {
      const updated: CompanyInfo = { ...prev, ...newInfo };
      safeLocalStorageSet('dream_dist_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const resetCompanyInfo = () => {
    setCompanyInfo(COMPANY_INFO);
    safeLocalStorageSet('dream_dist_company_info_v1', JSON.stringify(COMPANY_INFO));
  };

  // Branch-specific company headers and identities (Isolation per branch)
  const [branchCompanyInfo, setBranchCompanyInfo] = useState<Record<string, Partial<CompanyInfo>>>(() => {
    const saved = localStorage.getItem('dream_dist_branch_company_info_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved branch company info', e);
      }
    }
    return {};
  });

  const updateBranchCompanyInfo = (branchName: string, newInfo: Partial<CompanyInfo>) => {
    if (!branchName) return;
    const norm = normalizeBranchName(branchName);
    setBranchCompanyInfo((prev) => {
      const updated = {
        ...prev,
        [norm]: {
          ...(prev[norm] || {}),
          ...newInfo,
        },
      };
      safeLocalStorageSet('dream_dist_branch_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const resetBranchCompanyInfo = (branchName: string) => {
    if (!branchName) return;
    const norm = normalizeBranchName(branchName);
    setBranchCompanyInfo((prev) => {
      const updated = { ...prev };
      delete updated[norm];
      safeLocalStorageSet('dream_dist_branch_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const getCompanyInfoForBranch = (branchName?: string): CompanyInfo => {
    if (!branchName) return companyInfo;
    const norm = normalizeBranchName(branchName);
    const branchOverride = branchCompanyInfo[norm] || branchCompanyInfo[branchName];
    if (branchOverride && Object.keys(branchOverride).length > 0) {
      return {
        ...companyInfo,
        ...branchOverride,
      };
    }
    // Fallback: match branch data
    const matchedBranch = branches.find(
      (b) => b.name === norm || isBranchMatch(b.name, branchName)
    );
    if (matchedBranch && matchedBranch.address) {
      return {
        ...companyInfo,
        address: matchedBranch.address || companyInfo.address,
        phone: matchedBranch.phone ? `${matchedBranch.phone} / ${companyInfo.customerService}` : companyInfo.phone,
      };
    }
    return companyInfo;
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.IS_AUTH) === 'true';
  });

  // Never accept a user/session transferred through a URL or an old browser cache.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    supabase.auth.getSession().catch(() => null);
  }, []);

  const sanitizeProducts = (list: Product[]): Product[] => {
    if (!Array.isArray(list)) return [];
    const byId = new Map<string, Product>();
    const byIdentity = new Map<string, string>();
    const normalizeProductCode = (value?: string) => String(value || '').trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
    list.forEach((rawProduct) => {
      if (!rawProduct) return;
      const p = { ...rawProduct };
      const codeKey = normalizeProductCode(p.code);
      const unifiedKey = normalizeProductCode(p.unifiedCode);
      const fallbackKey = [unifiedKey, p.name, p.color, p.size]
        .map((value) => String(value || '').trim().toLowerCase())
        .join(':::');
      const identityKey = codeKey ? `code:${codeKey}` : unifiedKey ? `unified:${fallbackKey}` : `id:${p.id || Math.random()}`;
      const idKey = p.id || identityKey;
      const existingKey = byIdentity.get(identityKey) || idKey;
      const existing = byId.get(existingKey);
      byId.set(existingKey, existing ? { ...existing, ...p } : p);
      byIdentity.set(identityKey, existingKey);
    });

    return Array.from(byId.values()).map((p) => {
      const cartonQty = p.cartonQuantity && p.cartonQuantity > 0 ? p.cartonQuantity : 1;
      const cartonPrice = typeof p.cartonPrice === 'number' ? p.cartonPrice : 0;

      return {
        ...p,
        cartonQuantity: cartonQty,
        cartonPrice: cartonPrice,
        piecePrice: cartonPrice > 0 && cartonQty > 0 ? Math.round((cartonPrice / cartonQty) * 100) / 100 : (p.piecePrice || cartonPrice),
      };
    });
  };

  const sanitizeCustomers = (list: Customer[]): Customer[] => {
    if (!Array.isArray(list)) return [];
    const map = new Map<string, Customer>();

    const cleanStr = (s?: string) => {
      if (!s) return '';
      return String(s)
        .replace(/[\uFFFD\uFEFF\u0000-\u001F\u007F-\u009F]/g, '')
        .trim();
    };

    for (const rawC of list) {
      if (!rawC) continue;
      const c: Customer = {
        ...rawC,
        name: cleanStr(rawC.name),
        code: cleanStr(rawC.code),
        phone: cleanStr(rawC.phone),
        address: cleanStr(rawC.address),
        branchName: cleanStr(rawC.branchName),
        repName: cleanStr(rawC.repName),
        salesRepName: cleanStr(rawC.salesRepName),
        notes: cleanStr(rawC.notes),
        taxNumber: cleanStr(rawC.taxNumber),
        storeName: cleanStr(rawC.storeName),
      };

      const cleanCode = (c.code || '').trim().toLowerCase();
      const cleanName = (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');

      let key = '';
      if (cleanCode && cleanCode !== '---' && !cleanCode.startsWith('cust-row') && !/^cust-\d+$/i.test(cleanCode)) {
        key = `code:::${cleanCode}`;
      } else if (cleanName && cleanPhone.length >= 7) {
        key = `name_phone:::${cleanName}:::${cleanPhone}`;
      } else if (cleanName) {
        key = `name:::${cleanName}`;
      } else if (cleanPhone.length >= 8) {
        key = `phone:::${cleanPhone}`;
      } else {
        key = `id:::${c.id || Math.random()}`;
      }

      // Respect explicit branch first; only infer if completely missing
      let resolvedBranch = '';
      if (c.branchName && c.branchName.trim()) {
        resolvedBranch = normalizeBranchName(c.branchName);
      } else {
        const locInferred = inferBranchFromText(
          `${c.address || ''} ${c.governorate || ''} ${c.notes || ''}`
        );
        resolvedBranch = locInferred || normalizeBranchName(c.branchName || 'الفرع الرئيسي');
      }

      const existing = map.get(key);
      if (existing) {
        // Merge attributes to keep the best data
        if (!existing.phone && c.phone) existing.phone = c.phone;
        if (!existing.address && c.address) existing.address = c.address;
        if (!existing.taxNumber && c.taxNumber) existing.taxNumber = c.taxNumber;
        if (!existing.notes && c.notes) existing.notes = c.notes;
        if (c.branchName && c.branchName.trim()) {
          existing.branchName = normalizeBranchName(c.branchName);
        }
        if (c.repId) existing.repId = c.repId;
        if (c.repName) existing.repName = c.repName;
        if (c.salesRepName) existing.salesRepName = c.salesRepName;
        if (c.creditLimit !== undefined) existing.creditLimit = Number(c.creditLimit);
        if (c.currentBalance !== undefined || c.balance !== undefined) {
          const bal = Number(c.currentBalance ?? c.balance ?? 0);
          existing.currentBalance = bal;
          existing.balance = bal;
        }
        if (c.totalOverdueAndDue !== undefined) {
          existing.totalOverdueAndDue = Number(c.totalOverdueAndDue);
        } else if (existing.totalOverdueAndDue === undefined && (existing.currentBalance || existing.balance)) {
          existing.totalOverdueAndDue = existing.currentBalance || existing.balance || 0;
        }
        if (c.overdueBalance !== undefined) {
          existing.overdueBalance = Number(c.overdueBalance);
        }
        if (c.dueBalance !== undefined) {
          existing.dueBalance = Number(c.dueBalance);
        }
        if (c.tier === 'مميز' || (c.tier === 'راقي' && existing.tier === 'متوسط')) {
          existing.tier = c.tier;
        }
      } else {
        const bal = Number(c.currentBalance ?? c.balance ?? 0);
        const overdueDue = c.totalOverdueAndDue !== undefined ? Number(c.totalOverdueAndDue) : bal;
        map.set(key, {
          ...c,
          name: c.name || `عميل ${c.code || ''}`,
          branchName: resolvedBranch,
          creditLimit: c.creditLimit !== undefined ? Number(c.creditLimit) : 0,
          currentBalance: bal,
          balance: bal,
          totalOverdueAndDue: overdueDue,
          overdueBalance: c.overdueBalance !== undefined ? Number(c.overdueBalance) : undefined,
          dueBalance: c.dueBalance !== undefined ? Number(c.dueBalance) : undefined,
        });
      }
    }

    return Array.from(map.values());
  };

  const [products, setProducts] = useState<Product[]>(() => {
    return [];
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    return [];
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    return [];
  });

  const [isLocalDataHydrated, setIsLocalDataHydrated] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);

  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CLOUDINARY);
    return saved ? JSON.parse(saved) : DEFAULT_CLOUDINARY_CONFIG;
  });

  const [accountingLogs, setAccountingLogs] = useState<AccountingSyncLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACCOUNTING_LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [inventoryLogs] = useState<InventoryTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Cleanup lingering audit & inventory logs from storage to save space and keep app ultra-lightweight
  useEffect(() => {
    try {
      localStorage.removeItem('dream_dist_inv_logs_v5');
      localStorage.removeItem('dream_dist_audit_logs_v7');
      idbDelete('dream_dist_audit_logs_v7').catch(() => {});
    } catch {}
  }, []);

  // Keep active customers cache in sync for instant financial auditing across Excel & PDF exports
  useEffect(() => {
    if (customers && customers.length > 0) {
      setActiveCustomersCache(customers);
      try {
        safeLocalStorageSet(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers.slice(0, 300)));
      } catch {}
    }
  }, [customers]);

  // Persist users to IndexedDB and localStorage so offline sessions and registered reps are immediately available
  useEffect(() => {
    if (users && users.length > 0) {
      idbSet(STORAGE_KEYS.USERS, users);
      safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
  }, [users]);

  // Persist active session across browser refreshes and tab reloads
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(currentUser));
    } else if (!isAuthenticated || !currentUser) {
      localStorage.removeItem(STORAGE_KEYS.IS_AUTH);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_DATA);
    }
  }, [currentUser, isAuthenticated]);

  // Keep active currentUser in sync with updated users list (e.g. role update, branch change, account status, or deletion)
  useEffect(() => {
    if (currentUser) {
      if (users.length > 0) {
        const fresh = users.find((u) => u.id === currentUser.id);
        if (!fresh && currentUser.id !== 'u-admin-osama') {
          // User was permanently deleted from the database
          logout();
          setAuthTerminationNotice('تم حذف هذا الحساب من قاعدة البيانات بواسطة إدارة الشركة. تم إنهاء الجلسة ولا يمكن تسجيل الدخول بهذا الحساب.');
        } else if (fresh) {
          if (fresh.approvalStatus === 'rejected' || fresh.isActive === false) {
            logout();
            setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل الإدارة.');
          } else if (
            fresh.role !== currentUser.role ||
            fresh.branchName !== currentUser.branchName ||
            fresh.supervisorId !== currentUser.supervisorId ||
            fresh.name !== currentUser.name ||
            fresh.approvalStatus !== currentUser.approvalStatus
          ) {
            setCurrentUser(fresh);
          }
        }
      }
    }
  }, [users]);

  const recordAuditLog = (_logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>) => {
    // Audit logs disabled as requested by user to keep the app ultra-clean and lightweight
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    try {
      localStorage.removeItem('dream_dist_audit_logs_v7');
    } catch {}
  };

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');

  // PWA Install Prompt State & Data Saver Mode
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [canInstallPwa, setCanInstallPwa] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [dataSaverMode, setDataSaverMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dream_dist_data_saver');
    return saved === 'true';
  });

  // Hydrate high-capacity collections from IndexedDB seamlessly on startup
  useEffect(() => {
    let isMounted = true;
    async function hydrateFromIndexedDB() {
      try {
        const [savedProducts, savedCustomers, savedInvoices, savedCart] = await Promise.all([
          idbGet<Product[]>(STORAGE_KEYS.PRODUCTS),
          idbGet<Customer[]>(STORAGE_KEYS.CUSTOMERS),
          idbGet<Invoice[]>(STORAGE_KEYS.INVOICES),
          idbGet<CartItem[]>(STORAGE_KEYS.CART),
        ]);

        if (!isMounted) return;
        if (Array.isArray(savedProducts)) setProducts(sanitizeProducts(savedProducts));
        if (Array.isArray(savedCustomers)) setCustomers(sanitizeCustomers(savedCustomers));
        if (Array.isArray(savedInvoices)) {
          const deletedSet = getDeletedInvoiceIds();
          const filtered = savedInvoices.filter(
            (inv: Invoice) => !deletedSet.has(inv.id) && !deletedSet.has(inv.invoiceNumber)
          );
          setInvoices(filtered);
        }
        if (Array.isArray(savedCart)) setCart(savedCart);
        setIsLocalDataHydrated(true);
      } catch (err) {
        console.warn('IndexedDB initial hydration notice:', err);
        if (isMounted) setIsLocalDataHydrated(true);
      }
    }

    hydrateFromIndexedDB();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleDataSaverMode = () => {
    setDataSaverMode((prev) => {
      const next = !prev;
      safeLocalStorageSet('dream_dist_data_saver', String(next));
      return next;
    });
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setCanInstallPwa(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerInstallPrompt = async (): Promise<boolean> => {
    if (installPromptEvent && typeof installPromptEvent.prompt === 'function') {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setCanInstallPwa(false);
          setInstallPromptEvent(null);
          return true;
        }
      } catch (err) {
        console.warn('PWA install prompt notice:', err);
        setIsInstallModalOpen(true);
      }
      return false;
    } else {
      setIsInstallModalOpen(true);
      return false;
    }
  };

  // Supabase State & Sync
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus>({
    connected: false,
    tableFound: 'جاري الفحص والاتصال...',
  });
  const [isSupabaseSyncing, setIsSupabaseSyncing] = useState<boolean>(false);

  const queueInvoiceForSync = async (invoice: Invoice) => {
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    const next = [...queued.filter((item) => item.id !== invoice.id), invoice];
    await idbSet(STORAGE_KEYS.PENDING_INVOICES, next);
  };

  const flushPendingInvoices = async () => {
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    if (queued.length === 0 || !navigator.onLine) return;

    const remaining: Invoice[] = [];
    for (const invoice of queued) {
      const result = await saveInvoiceToSupabase(invoice);
      if (!result.success) remaining.push(invoice);
    }
    await idbSet(STORAGE_KEYS.PENDING_INVOICES, remaining);
  };

  const saveInvoiceWithQueue = async (invoice: Invoice) => {
    const result = await saveInvoiceToSupabase(invoice);
    if (!result.success) await queueInvoiceForSync(invoice);
    return result;
  };

  // Sync with Supabase (Direction: fetch, push, or both)
  const syncWithSupabase = async (
    direction: 'fetch' | 'push' | 'both' = 'both'
  ): Promise<{ success: boolean; message: string }> => {
    setIsSupabaseSyncing(true);
    try {
      // 1. Test Connection
      const conn = await testSupabaseConnection();
      setSupabaseStatus(conn);

      let fetchedUsersCount = 0;
      let fetchedInvoicesCount = 0;
      let pushedUsersCount = 0;
      let pushedInvoicesCount = 0;

      // 2. Fetch remote users and invoices if requested
      if (direction === 'fetch' || direction === 'both') {
        const fetchRes = await fetchUsersFromSupabase();
        if (fetchRes.success && fetchRes.users && fetchRes.users.length > 0) {
          fetchedUsersCount = fetchRes.users.length;
          setUsers(sanitizeAndDeduplicateUsers(fetchRes.users).deduplicated);
        }

        const invRes = await fetchInvoicesFromSupabase();
        if (invRes.success && invRes.invoices) {
          const remoteInvoices = invRes.invoices;
          fetchedInvoicesCount = remoteInvoices.length;
          setInvoices((previous) => {
            const merged = new Map<string, Invoice>();
            previous.forEach((invoice) => merged.set(invoice.id, invoice));
            remoteInvoices.forEach((invoice) => merged.set(invoice.id, invoice));
            const next = Array.from(merged.values());
            idbSet(STORAGE_KEYS.INVOICES, next);
            return next;
          });
        }

        const productRes = await fetchProductsFromSupabase();
        if (productRes.success) {
          const validProducts = sanitizeProducts(productRes.products || []);
          setProducts(validProducts);
          idbSet(STORAGE_KEYS.PRODUCTS, validProducts);
        }
      }

      // 2b. Fetch customers from Supabase
      if (direction === 'fetch' || direction === 'both') {
        const custRes = await fetchCustomersFromSupabase();
        if (custRes.success) {
          const validCustomers = sanitizeCustomers(linkCustomersToUsers(custRes.customers || [], users));
          setCustomers(validCustomers);
          idbSet(STORAGE_KEYS.CUSTOMERS, validCustomers);
        }
      }
      if (direction === 'push' || direction === 'both') {
        await flushPendingInvoices();
        if (users.length > 0) {
          await saveUsersToSupabase(users);
          pushedUsersCount = users.length;
        }
        for (const inv of invoices) {
          await saveInvoiceToSupabase(inv);
          pushedInvoicesCount++;
        }
        if (products.length > 0) {
          await saveProductsToSupabase(products);
        }
      }

      const updatedConn = await testSupabaseConnection();
      setSupabaseStatus(updatedConn);

      const msg = `تمت المزامنة السحابية بنجاح مع Supabase! (مستخدمين: ${fetchedUsersCount || pushedUsersCount}، فواتير وطلبيات: ${fetchedInvoicesCount || pushedInvoicesCount}).`;
      return { success: true, message: msg };
    } catch (err: any) {
      return {
        success: false,
        message: `تعذر إتمام المزامنة: ${err?.message || 'خطأ في الشبكة'}`,
      };
    } finally {
      setIsSupabaseSyncing(false);
    }
  };

  // Initial Supabase connection check, fetch users, products, invoices & real-time sync
  useEffect(() => {
    testSupabaseConnection().then((status) => {
      setSupabaseStatus(status);
      if (status.connected) {
        // 1. Fetch Users
        fetchUsersFromSupabase(true).then((res) => {
          if (res.success && res.users && res.users.length > 0) {
            setUsers((prev) => {
              const dedup = sanitizeAndDeduplicateUsers(res.users!);
              // If duplicate IDs were detected and cleaned, delete them permanently from Supabase
              if (dedup.removedUserIds.length > 0) {
                dedup.removedUserIds.forEach((remId) => {
                  deleteUserFromSupabase(remId).catch(() => {});
                });
                // Remap customer references
                setCustomers((prevCusts) => {
                  let changed = false;
                  const updated = prevCusts.map((c) => {
                    if (c.repId && dedup.idRedirectMap[c.repId]) {
                      changed = true;
                      return { ...c, repId: dedup.idRedirectMap[c.repId] };
                    }
                    return c;
                  });
                  return changed ? updated : prevCusts;
                });
                // Remap invoice references
                setInvoices((prevInvs) => {
                  let changed = false;
                  const updated = prevInvs.map((inv) => {
                    if (inv.repId && dedup.idRedirectMap[inv.repId]) {
                      changed = true;
                      return { ...inv, repId: dedup.idRedirectMap[inv.repId] };
                    }
                    return inv;
                  });
                  return changed ? updated : prevInvs;
                });
              }
              return dedup.deduplicated;
            });
          }
        });

        // 2. Fetch Central Catalog from Supabase (Only if local IndexedDB cache is empty; Realtime pushes changes automatically)
        idbGet<Product[]>(STORAGE_KEYS.PRODUCTS).then((cached) => {
          if (!cached || cached.length === 0) {
            fetchProductsFromSupabase().then((res) => {
              if (res.success && res.products) {
                const validProducts = sanitizeProducts(res.products);
                setProducts(validProducts);
                idbSet(STORAGE_KEYS.PRODUCTS, validProducts);
              }
            });
          }
        });

        // 3. Fetch Invoices (Fetch recent 30 on startup to save egress; Realtime stream catches newly created ones)
        fetchInvoicesFromSupabase(30).then((res) => {
          if (res.success && res.invoices) {
            const remoteInvoices = res.invoices;
            setInvoices((previous) => {
              const merged = new Map<string, Invoice>();
              previous.forEach((invoice) => merged.set(invoice.id, invoice));
              remoteInvoices.forEach((invoice) => merged.set(invoice.id, invoice));
              const next = Array.from(merged.values());
              idbSet(STORAGE_KEYS.INVOICES, next);
              return next;
            });
          }
        });

        // 4. Fetch Customers from Supabase (Only if local cache is empty to avoid downloading customer table on every reload)
        idbGet<Customer[]>(STORAGE_KEYS.CUSTOMERS).then((cached) => {
          if (!cached || cached.length === 0) {
            fetchCustomersFromSupabase().then((res) => {
              if (res.success && res.customers) {
                const validCustomers = sanitizeCustomers(linkCustomersToUsers(res.customers, users));
                setCustomers(validCustomers);
                idbSet(STORAGE_KEYS.CUSTOMERS, validCustomers);
              }
            });
          }
        });
      }
    });

    // Setup Supabase Realtime Subscription for Invoices, Orders (Catalog Sync) & Users
    try {
      const channel = supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const raw = payload.new as any;
            if (raw && raw.id) {
              const mappedInv: Invoice = {
                id: raw.id,
                invoiceNumber: raw.invoice_number || raw.invoiceNumber || 'DRM-INV',
                customerName: raw.customer_name || raw.customerName || 'عميل',
                customerPhone: raw.customer_phone || raw.customerPhone || '',
                customerAddress: raw.customer_address || raw.customerAddress || '',
                customerTaxNumber: raw.customer_tax_number || raw.customerTaxNumber || '',
                date: raw.date || (raw.created_at ? raw.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
                time: raw.time || (raw.created_at ? raw.created_at.slice(11, 19) : ''),
                repId: raw.rep_id || raw.repId || 'u-rep',
                repName: raw.rep_name || raw.repName || 'مندوب المبيعات',
                supervisorName: raw.supervisor_name || raw.supervisorName || 'مشرف الفرع',
                branchName: raw.branch_name || raw.branchName || 'الفرع الرئيسي',
                items: Array.isArray(raw.items) ? raw.items : typeof raw.items === 'string' ? JSON.parse(raw.items) : [],
                totalCartons: raw.total_cartons || raw.totalCartons || 0,
                totalPieces: raw.total_pieces || raw.totalPieces || 0,
                subtotal: raw.subtotal || raw.estimated_grand_total || 0,
                discountPercentage: raw.discount_percentage || 0,
                discountAmount: raw.discount_amount || raw.discountAmount || 0,
                taxPercentage: 0,
                taxAmount: 0,
                estimatedGrandTotal: raw.estimated_grand_total || raw.estimatedGrandTotal || 0,
                paymentMethod: raw.payment_method || raw.paymentMethod || 'نقدي (كاش)',
                status: raw.status || 'قيد مراجعة المشرف',
                notes: raw.notes || '',
                syncedToAccounting: raw.synced_to_accounting || false,
                hasShortageSplit: raw.has_shortage_split || false,
                shortageInvoiceNumber: raw.shortage_invoice_number,
                isShortageInvoice: raw.is_shortage_invoice || false,
                parentInvoiceId: raw.parent_invoice_id,
                parentInvoiceNumber: raw.parent_invoice_number,
                qrPayload: raw.qr_payload,
              };
              setInvoices((prev) => {
                const map = new Map<string, Invoice>();
                prev.forEach((i) => map.set(i.id, i));
                map.set(mappedInv.id, mappedInv);
                const next = Array.from(map.values());
                idbSet(STORAGE_KEYS.INVOICES, next);
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              setInvoices((prev) => {
                const next = prev.filter((invoice) => invoice.id !== deleted.id);
                idbSet(STORAGE_KEYS.INVOICES, next);
                return next;
              });
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const raw = payload.new as any;
            if (raw && raw.id === '00000000-0000-0000-0000-000000000001' && raw.items) {
              const remoteProducts: Product[] = Array.isArray(raw.items)
                ? raw.items
                : typeof raw.items === 'string'
                ? JSON.parse(raw.items)
                : [];
              if (remoteProducts.length > 0) {
                setProducts(sanitizeProducts(remoteProducts));
              }
            } else if (raw && (raw.id === 'dream_catalog_manifest' || String(raw.id).startsWith('dream_catalog_chunk_'))) {
                fetchProductsFromSupabase().then((catalogRes) => {
                  if (catalogRes.success && catalogRes.products) {
                    setProducts(sanitizeProducts(catalogRes.products));
                  }
                });
            }
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('Realtime channel error:', e);
    }
  }, []);

  useEffect(() => {
    const handleOnlineSync = () => {
      flushPendingInvoices().catch((error) => console.warn('Pending invoice sync notice:', error));
    };
    window.addEventListener('online', handleOnlineSync);
    if (navigator.onLine) handleOnlineSync();
    return () => window.removeEventListener('online', handleOnlineSync);
  }, []);

  // Supabase Egress Protection:
  // Instead of polling 24/7 (which consumes gigabytes of egress bandwidth),
  // we rely on Supabase Realtime WebSockets for instant sub-second updates, and use an intelligent,
  // throttled fallback (only on tab focus with a 5-minute cooldown) for the latest 30 records.
  useEffect(() => {
    let cancelled = false;
    let lastSyncTimestamp = Date.now();

    const refreshInvoicesSafely = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      // Cooldown: at least 5 minutes between background focus syncs
      if (now - lastSyncTimestamp < 5 * 60 * 1000) return;
      lastSyncTimestamp = now;

      try {
        const result = await fetchInvoicesFromSupabase(30);
        if (cancelled || !result.success || !result.invoices) return;
        setInvoices((prev) => {
          const remoteById = new Map<string, Invoice>();
          result.invoices!.forEach((inv) => {
            remoteById.set(inv.id, inv);
          });
          const localOnly = prev.filter((inv) => !remoteById.has(inv.id));
          const next = [...Array.from(remoteById.values()), ...localOnly];
          idbSet(STORAGE_KEYS.INVOICES, next);
          return next;
        });
      } catch (err) {
        console.warn('Silent invoice background sync notice:', err);
      }
    };

    // Refresh only when the user switches back to this tab and 5+ minutes have passed
    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshInvoicesSafely();
      }
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, []);

  // Explicit, on-demand invoice refresh callable from any component (e.g. InvoicesManager)
  // Protected with a 2-minute cooldown when called in the background (force=false)
  const lastManualRefreshRef = React.useRef<number>(0);

  const refreshInvoicesNow = async (force = false): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const now = Date.now();
      if (!force && now - lastManualRefreshRef.current < 120_000 && invoices.length > 0) {
        return {
          success: true,
          count: invoices.length,
          message: `الفواتير محدثة بالفعل ومحفوظة محلياً (${invoices.length} فاتورة).`,
        };
      }
      lastManualRefreshRef.current = now;

      const result = await fetchInvoicesFromSupabase(50);
      if (!result.success || !result.invoices) {
        return { success: false, count: 0, message: result.error || 'تعذر الاتصال بقاعدة البيانات لجلب الفواتير' };
      }
      const remoteInvoices = result.invoices;
      setInvoices((prev) => {
        const remoteById = new Map<string, Invoice>();
        remoteInvoices.forEach((inv) => remoteById.set(inv.id, inv));
        const localOnly = prev.filter((inv) => !remoteById.has(inv.id));
        const next = [...Array.from(remoteById.values()), ...localOnly];
        idbSet(STORAGE_KEYS.INVOICES, next);
        return next;
      });
      return {
        success: true,
        count: remoteInvoices.length,
        message: `تم تحديث أحدث ${remoteInvoices.length} فاتورة من السيرفر بنجاح.`,
      };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'خطأ غير متوقع أثناء تحديث الفواتير' };
    }
  };

  // Customer CRUD Actions
  const addCustomer = (newCust: Customer) => {
    setCustomers((prev) => [newCust, ...prev]);
    saveCustomersToSupabase([newCust]).catch((e) => console.warn('Supabase customer save error:', e));
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مستخدم',
      userRole: currentUser?.role || 'sales_rep',
      branchName: newCust.branchName || currentUser?.branchName || 'الفرع الرئيسي',
      action: 'add_customer' as any,
      actionTitle: `إضافة عميل جديد (${newCust.name})`,
      details: `تمت إضافة العميل بكود (${newCust.code}) وهاتف (${newCust.phone || '---'}).`,
      badgeType: 'success',
    });
  };

  const updateCustomer = (updatedCust: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updatedCust.id ? updatedCust : c)));
    saveCustomersToSupabase([updatedCust]).catch((e) => console.warn('Supabase customer update error:', e));
  };

  const deleteCustomer = (customerId: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
  };

  const cleanAndDeduplicateCustomers = () => {
    const originalCount = customers.length;
    const cleaned = sanitizeCustomers(customers);
    const duplicatesRemoved = Math.max(0, originalCount - cleaned.length);
    if (duplicatesRemoved > 0 || cleaned.length !== originalCount) {
      setCustomers(cleaned);
      saveCustomersToSupabase(cleaned).catch((e) => console.warn('Supabase customer clean save error:', e));
    }
    return {
      originalCount,
      deduplicatedCount: cleaned.length,
      duplicatesRemoved,
    };
  };

  // Auto-link customer rep names to actual user accounts with robust branch matching & Arabic heuristics
  const linkCustomersToUsers = (list: Customer[], userList: User[]): Customer[] => {
    if (!userList || userList.length === 0 || !list || list.length === 0) return list;

    const reps = userList.filter((u) => u.role === 'sales_rep' || u.role === 'supervisor' || u.role === 'branch_manager');
    if (reps.length === 0) return list;

    // Pre-index reps for ultra-fast matching
    const preparedReps = reps.map((u) => ({
      user: u,
      normName: normalizeArabicText(u.name).replace(/\s+/g, ''),
      identityAliases: [u.name, u.username, u.email?.split('@')[0] || '']
        .map((value) => normalizeArabicText(value))
        .filter(Boolean),
      normBranch: u.branchName ? normalizeBranchName(u.branchName) : '',
    }));

    // Cache lookup results to avoid re-running match algorithms for duplicate rep names
    const repMatchCache = new Map<string, User | null>();

    return list.map((c) => {
      let updated = { ...c };

      if (!updated.branchName) {
        const locInferred = inferBranchFromText(
          `${updated.address || ''} ${updated.governorate || ''} ${updated.name || ''} ${updated.notes || ''}`
        );
        if (locInferred) {
          updated.branchName = locInferred;
        }
      } else {
        updated.branchName = normalizeBranchName(updated.branchName);
      }

      const rawRep = (updated.salesRepName || updated.repName || '').trim();
      if ((!rawRep || rawRep === 'مندوب المبيعات' || rawRep === 'المندوب' || rawRep === 'غير محدد') && !updated.repId) {
        return updated;
      }

      let matched: User | null = null;
      if (rawRep && rawRep !== 'مندوب المبيعات' && rawRep !== 'المندوب') {
        const cacheKey = `${rawRep}:::${updated.branchName || ''}`;
        if (repMatchCache.has(cacheKey)) {
          matched = repMatchCache.get(cacheKey)!;
        } else {
          const normRep = normalizeArabicText(rawRep);
          // 1. Direct normalized name match in branch
          const direct = preparedReps.find((pr) => {
            if (
              updated.branchName &&
              pr.normBranch &&
              !isBranchMatch(updated.branchName, pr.user.branchName, { allowUnassigned: false })
            ) {
              return false;
            }
            return pr.identityAliases.some((alias) => alias === normRep || alias.replace(/\s+/g, '') === normRep.replace(/\s+/g, ''));
          });

          if (direct) {
            matched = direct.user;
          } else {
            // 2. Fuzzy Arabic match
            const fuzzy = preparedReps.find((pr) => {
              if (
                updated.branchName &&
                pr.normBranch &&
                !isBranchMatch(updated.branchName, pr.user.branchName, { allowUnassigned: false })
              ) {
                return false;
              }
              return pr.identityAliases.some((alias) => isArabicNameMatch(rawRep, alias));
            });
            matched = fuzzy ? fuzzy.user : null;
          }
          repMatchCache.set(cacheKey, matched);
        }
      }

      if (matched) {
        return {
          ...updated,
          repName: rawRep || matched.name,
          repId: matched.id,
          salesRepName: rawRep || matched.name,
          branchName: updated.branchName || matched.branchName || '',
          creditLimit: updated.creditLimit !== undefined ? Number(updated.creditLimit) : 0,
          currentBalance: Number(updated.currentBalance ?? updated.balance ?? 0),
          balance: Number(updated.currentBalance ?? updated.balance ?? 0),
        };
      }
      return {
        ...updated,
        creditLimit: updated.creditLimit !== undefined ? Number(updated.creditLimit) : 0,
        currentBalance: Number(updated.currentBalance ?? updated.balance ?? 0),
        balance: Number(updated.currentBalance ?? updated.balance ?? 0),
      };
    });
  };

  const importCustomersList = (newCustomers: Customer[], mode: 'merge' | 'replace' = 'merge') => {
    const sanitizedIncoming = sanitizeCustomers(newCustomers);
    const linked = linkCustomersToUsers(sanitizedIncoming, users);
    let finalCustomers: Customer[] = [];
    if (mode === 'replace') {
      finalCustomers = linked;
      setCustomers(finalCustomers);
    } else {
      finalCustomers = sanitizeCustomers([...customers, ...linked]);
      setCustomers(finalCustomers);
    }
    saveCustomersToSupabase(finalCustomers).catch((e) => console.warn('Supabase customer bulk save error:', e));
  };

  const refreshCustomerRepLinks = (): {
    updatedCount: number;
    totalCustomers: number;
    linkedCustomersCount: number;
    unassignedCount: number;
    repBreakdown: { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }[];
    unmatchedReps: string[];
  } => {
    let updatedCount = 0;
    const currentUsers = users;
    let nextCustomers: Customer[] = [];

    setCustomers((prev) => {
      const linked = linkCustomersToUsers(prev, currentUsers);
      updatedCount = linked.filter(
        (c, i) => c.repId !== prev[i]?.repId || c.branchName !== prev[i]?.branchName || c.salesRepName !== prev[i]?.salesRepName
      ).length;
      saveCustomersToSupabase(linked).catch(() => {});
      nextCustomers = linked;
      return linked;
    });

    const listToAnalyze = nextCustomers.length > 0 ? nextCustomers : customers;
    const totalCustomers = listToAnalyze.length;
    const repMap = new Map<string, { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }>();
    let linkedCustomersCount = 0;
    let unassignedCount = 0;
    const unmatchedSet = new Set<string>();

    listToAnalyze.forEach((c) => {
      const rep = (c.salesRepName || c.repName || '').trim();
      if (!rep || rep === 'مندوب المبيعات' || rep === 'المندوب' || rep === 'غير محدد') {
        unassignedCount++;
        return;
      }
      linkedCustomersCount++;
      const user = currentUsers.find(
        (u) => (u.role === 'sales_rep' || u.role === 'supervisor') && (u.id === c.repId || isArabicNameMatch(rep, u.name))
      );
      const key = user ? user.name : rep;
      if (!repMap.has(key)) {
        repMap.set(key, {
          repName: key,
          branchName: c.branchName || user?.branchName || '',
          customerCount: 0,
          hasUserAccount: !!user,
          user,
        });
      }
      repMap.get(key)!.customerCount++;
      if (!user) {
        unmatchedSet.add(rep);
      }
    });

    return {
      updatedCount,
      totalCustomers,
      linkedCustomersCount,
      unassignedCount,
      repBreakdown: Array.from(repMap.values()),
      unmatchedReps: Array.from(unmatchedSet),
    };
  };

  const autoCreateMissingRepsFromCustomers = (): { createdUsers: User[]; count: number; message: string } => {
    const created: User[] = [];
    const repNamesMap = new Map<string, { name: string; branchName: string }>();

    customers.forEach((c) => {
      const rep = (c.salesRepName || c.repName || '').trim();
      if (!rep || rep === 'مندوب المبيعات' || rep === 'المندوب' || rep === 'غير محدد') return;
      if (!repNamesMap.has(rep)) {
        repNamesMap.set(rep, {
          name: rep,
          branchName: c.branchName || 'فرع المنيا',
        });
      }
    });

    const newUsersList = [...users];
    let addedAny = false;

    repNamesMap.forEach(({ name, branchName }) => {
      const normIncoming = normalizeArabicText(name);
      const exists = newUsersList.some(
        (u) =>
          (u.role === 'sales_rep' || u.role === 'supervisor') &&
          (normalizeArabicText(u.name) === normIncoming || isArabicNameMatch(name, u.name))
      );
      if (!exists) {
        const cleanId = `rep_${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now().toString().slice(-4)}`;
        const cleanUser = name.replace(/\s+/g, '').toLowerCase().slice(0, 15);
        const newUser: User = {
          id: cleanId,
          name,
          username: cleanUser || `rep_${Date.now().toString().slice(-4)}`,
          email: `${cleanUser || 'rep'}@dream.com`,
          role: 'sales_rep',
          branchName: branchName || 'فرع المنيا',
          phone: '',
          isActive: true,
          approvalStatus: 'active',
          registrationDate: new Date().toISOString(),
        };
        newUsersList.push(newUser);
        created.push(newUser);
        addedAny = true;
      }
    });

    if (addedAny) {
      setUsers(newUsersList);
      safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(newUsersList));
      idbSet(STORAGE_KEYS.USERS, newUsersList);
      saveUsersToSupabase(newUsersList).catch(() => {});
      // Link customers to new users
      setCustomers((prev) => {
        const linked = linkCustomersToUsers(prev, newUsersList);
        saveCustomersToSupabase(linked).catch(() => {});
        return linked;
      });
    }

    return {
      createdUsers: created,
      count: created.length,
      message: created.length > 0
        ? `تم إنشاء وتفعيل حسابات ${created.length} مندوب بنجاح وربط عملائهم تلقائياً!`
        : 'جميع المناديب المذكورين بالشيت لديهم حسابات مفعلة بالفعل ومطابقة للعملاء.',
    };
  };

  const mergeDuplicateUsers = async (): Promise<{
    success: boolean;
    message: string;
    mergedCount: number;
    details: string[];
  }> => {
    const dedup = sanitizeAndDeduplicateUsers(users);
    if (dedup.mergedCount === 0) {
      return {
        success: true,
        message: 'جميع حسابات الموظفين سليمة ومطابقة 100% ولا توجد أي حسابات مكررة.',
        mergedCount: 0,
        details: [],
      };
    }

    setUsers(dedup.deduplicated);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(dedup.deduplicated));
    idbSet(STORAGE_KEYS.USERS, dedup.deduplicated);

    // Remap customers
    setCustomers((prev) => {
      let changed = false;
      const updated = prev.map((c) => {
        if (c.repId && dedup.idRedirectMap[c.repId]) {
          changed = true;
          return { ...c, repId: dedup.idRedirectMap[c.repId] };
        }
        return c;
      });
      if (changed) {
        idbSet(STORAGE_KEYS.CUSTOMERS, updated);
      }
      return changed ? updated : prev;
    });

    // Remap invoices
    setInvoices((prev) => {
      let changed = false;
      const updated = prev.map((inv) => {
        if (inv.repId && dedup.idRedirectMap[inv.repId]) {
          changed = true;
          return { ...inv, repId: dedup.idRedirectMap[inv.repId] };
        }
        return inv;
      });
      if (changed) {
        idbSet(STORAGE_KEYS.INVOICES, updated);
      }
      return changed ? updated : prev;
    });

    // Delete duplicate IDs from Supabase permanently
    for (const remId of dedup.removedUserIds) {
      await deleteUserFromSupabase(remId).catch(() => {});
    }
    await saveUsersToSupabase(dedup.deduplicated).catch(() => {});

    const details = dedup.mergedPairs.map(
      (p) => `تم دمج حساب المندوب [${p.keptUser.name}] بفرع (${p.keptUser.branchName || 'العام'}) وحذف الحساب المكرر (${p.removedUsername || p.removedId})`
    );

    return {
      success: true,
      message: `تم دمج وتنظيف ${dedup.mergedCount} حساب مكرر بنجاح وتحديث كافة الارتباطات.`,
      mergedCount: dedup.mergedCount,
      details,
    };
  };

  // Auto-link customers to users in memory safely when users arrive or change, without network loops
  const lastUsersFingerprintRef = React.useRef<string>('');
  useEffect(() => {
    if (users.length === 0 || customers.length === 0) return;
    const currentFingerprint = users.map((u) => `${u.id}:${u.name}:${u.branchName}`).join('|');
    if (lastUsersFingerprintRef.current === currentFingerprint) return;
    lastUsersFingerprintRef.current = currentFingerprint;

    setCustomers((prev) => {
      const needsLinking = prev.some((c) => (c.salesRepName || c.repName) && !c.repId);
      if (!needsLinking && prev.length > 0) return prev;
      const linked = linkCustomersToUsers(prev, users);
      idbSet(STORAGE_KEYS.CUSTOMERS, linked).catch(() => {});
      return linked;
    });
  }, [users]);

  // Sync high-capacity data directly to IndexedDB (preventing LocalStorage quota overflow)
  useEffect(() => {
    if (!isLocalDataHydrated) return;
    idbSet(STORAGE_KEYS.PRODUCTS, products);
  }, [products, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    idbSet(STORAGE_KEYS.CUSTOMERS, customers);
  }, [customers, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    idbSet(STORAGE_KEYS.INVOICES, invoices);
  }, [invoices, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    idbSet(STORAGE_KEYS.CART, cart);
  }, [cart, isLocalDataHydrated]);

  useEffect(() => {
    idbSet(STORAGE_KEYS.USERS, users);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.CLOUDINARY, JSON.stringify(cloudinaryConfig));
  }, [cloudinaryConfig]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.ACCOUNTING_LOGS, JSON.stringify(accountingLogs));
  }, [accountingLogs]);

  useEffect(() => {
    if (currentUser && isAuthenticated) {
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      safeLocalStorageSet(STORAGE_KEYS.IS_AUTH, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      safeLocalStorageSet(STORAGE_KEYS.IS_AUTH, 'false');
    }
  }, [currentUser, isAuthenticated]);

  // Real-time Session Watcher: If current user is deleted or deactivated by admin, immediately terminate session
  useEffect(() => {
    if (currentUser && isAuthenticated && users.length > 0) {
      const activeAccount = users.find((u) => u.id === currentUser.id);
      if (!activeAccount) {
        logout();
        setAuthTerminationNotice('تم حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
      } else if (!activeAccount.isActive || activeAccount.approvalStatus === 'rejected') {
        logout();
        setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
      }
    }
  }, [users, currentUser, isAuthenticated]);

  // Multi-tab sync for immediate logout on user deletion across tabs
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.USERS && e.newValue && currentUser && isAuthenticated) {
        try {
          const parsedUsers: User[] = JSON.parse(e.newValue);
          const me = parsedUsers.find((u) => u.id === currentUser.id);
          if (!me || !me.isActive || me.approvalStatus === 'rejected') {
            logout();
            setAuthTerminationNotice('تم إيقاف أو حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, [currentUser, isAuthenticated]);

  // Online / Offline tracking
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Authentication System ---
  const login = async (identifier: string, password?: string): Promise<{ success: boolean; message: string; user?: User }> => {
    const cleanId = sanitizeIdentifier(identifier).toLowerCase();
    const cleanEmail = sanitizeEmail(identifier);
    const rawTrim = sanitizeIdentifier(identifier);
    const cleanPass = (password || '').trim();

    // 1. Search in local memory first with rich identifier matching
    let found = users.find(
      (u) =>
        (u.email && sanitizeEmail(u.email) === cleanEmail) ||
        (u.email && u.email.toLowerCase().startsWith(cleanId)) ||
        (u.username && sanitizeIdentifier(u.username).toLowerCase() === cleanId) ||
        (u.name && sanitizeIdentifier(u.name).toLowerCase() === cleanId) ||
        (u.phone && sanitizeIdentifier(u.phone) === rawTrim) ||
        (u.id && String(u.id).toLowerCase() === cleanId)
    );

    // 2. If not found locally, query Supabase directly (essential for fresh sessions and cloud users)
    if (!found) {
      try {
        const lookupQuery = cleanEmail.includes('@') ? cleanEmail : cleanId;
        const supRes = await findUserInSupabase(lookupQuery);
        if (supRes.success && supRes.user) {
          found = supRes.user;
          setUsers((prev) => {
            const map = new Map<string, User>();
            prev.forEach((u) => map.set(u.id, u));
            map.set(found!.id, found!);
            return Array.from(map.values());
          });
        }
      } catch (e) {
        console.warn('Direct Supabase login lookup failed:', e);
      }
    }

    if (!found) {
      return {
        success: false,
        message: 'اسم المستخدم أو البريد الإلكتروني غير مسجل في النظام. يرجى التأكد من البيانات أو مراجعة إدارة شركة دريم.'
      };
    }

    if (found.approvalStatus === 'pending_approval') {
      return {
        success: false,
        message: 'الحساب قيد المراجعة والتفعيل من الإدارة المركزية لشركة دريم. يرجى التواصل مع المشرف أو مسؤول النظام لتفعيل الحساب وتعيين الفرع والمشرف المباشر.'
      };
    }

    if (found.approvalStatus === 'rejected' || found.isActive === false) {
      return { success: false, message: 'هذا الحساب موقوف أو تم رفض تفعيله من قبل الإدارة.' };
    }

    // Check password strictly against database
    if (found.password && found.password.trim().length > 0) {
      const dbPass = found.password.trim();
      if (dbPass !== cleanPass) {
        return { success: false, message: 'كلمة المرور غير صحيحة. يرجى التأكد من كتابة كلمة المرور بدقة.' };
      }
    } else if (cleanPass) {
      // First-time setup: user sets their password
      found = { ...found, password: cleanPass };
      saveUserToSupabase(found).catch((e) => console.warn('Supabase password update failed:', e));
    }

    setCurrentUser(found);
    setIsAuthenticated(true);
    localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, found.id);

    recordAuditLog({
      userId: found.id,
      userName: found.name,
      userRole: found.role,
      branchName: found.branchName,
      action: 'user_login',
      actionTitle: `تسجيل دخول (${found.name})`,
      details: `تم تسجيل الدخول بصلاحية (${found.role === 'admin' ? 'مدير عام' : found.role === 'branch_manager' ? 'مدير فرع' : found.role === 'supervisor' ? 'مشرف مبيعات' : found.role === 'developer' ? 'مطور تقني' : 'مندوب مبيعات'}) لـ ${found.branchName}.`,
      badgeType: 'info',
    });

    return { success: true, message: `مرحباً بك ${found.name}`, user: found };
  };

  const register = (userData: {
    name: string;
    username: string;
    email: string;
    password?: string;
    phone: string;
    branchName: string;
    role: UserRole;
    supervisorId?: string;
  }): { success: boolean; message: string } => {
    const existing = users.find(
      (u) =>
        u.email.toLowerCase() === userData.email.trim().toLowerCase() ||
        u.username.toLowerCase() === userData.username.trim().toLowerCase()
    );

  if (existing || hasDuplicateUserIdentity(userData, users)) {
  return { success: false, message: 'اسم المستخدم أو البريد أو الهاتف أو اسم المندوب مسجل بالفعل.' };
  }
  
  const newUser: User = {
      id: `u-${Date.now()}`,
      name: userData.name.trim(),
      username: userData.username.trim().toLowerCase(),
      email: userData.email.trim().toLowerCase(),
      password: (userData.password || '').trim(),
      phone: userData.phone.trim(),
      branchName: userData.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      role: userData.role || 'sales_rep',
      supervisorId: userData.supervisorId,
      isActive: true,
      approvalStatus: userData.role === 'developer' || userData.role === 'admin' ? 'active' : 'pending_approval', // Requires admin approval for reps
      registrationDate: new Date().toISOString().slice(0, 10),
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80`
    };

    setUsers((prev) => [...prev, newUser]);
    // Save to Supabase asynchronously
    saveUserToSupabase(newUser).catch((e) => console.warn('Supabase auto-save user failed:', e));

    recordAuditLog({
      userId: newUser.id,
      userName: newUser.name,
      userRole: newUser.role,
      branchName: newUser.branchName,
      action: 'create_user',
      actionTitle: `طلب تسجيل مستخدم جديد (${newUser.name})`,
      details: `تم تقديم طلب حساب جديد برقم هاتف ${newUser.phone} بانتظار اعتماد الإدارة.`,
      badgeType: 'warning',
    });

    return {
      success: true,
      message: 'تم تسجيل طلب الحساب بنجاح وهو الآن بانتظار تفعيل الأدمن وتخصيص المشرف والفرع.'
    };
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEYS.IS_AUTH);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_DATA);
    clearCart();
  };

  const approveUser = (userId: string, supervisorId?: string, branchName?: string, role?: UserRole) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated: User = {
          ...u,
          approvalStatus: 'active',
          isActive: true,
          supervisorId: supervisorId !== undefined ? supervisorId : u.supervisorId,
          branchName: branchName || u.branchName,
          role: role || u.role,
        };
        // Auto sync to Supabase
        saveUserToSupabase(updated).catch((e) => console.warn('Supabase update failed:', e));

        recordAuditLog({
          userId: currentUser?.id || 'admin',
          userName: currentUser?.name || 'مدير النظام',
          userRole: currentUser?.role || 'admin',
          branchName: branchName || u.branchName,
          action: 'update_user',
          actionTitle: `اعتماد وتفعيل حساب (${u.name})`,
          details: `تم اعتماد المستخدم وتعيين الصلاحية (${role || u.role}) لفرع (${branchName || u.branchName}).`,
          badgeType: 'success',
        });

        return updated;
      })
    );
  };

  const rejectUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'rejected', isActive: false } : u))
    );
    if (currentUser?.id === userId) {
      logout();
      setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
    }
  };

  const deleteUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    deleteUserFromSupabase(userId).catch((e) => console.warn('Supabase delete user failed:', e));
    if (currentUser?.id === userId) {
      logout();
      setAuthTerminationNotice('تم حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
    }
    // Clean rep associations from customers
    setCustomers((prev) =>
      prev.map((c) => (c.repId === userId ? { ...c, repId: undefined, repName: 'غير محدد', salesRepName: 'غير محدد' } : c))
    );
  };

  const assignSupervisor = (repId: string, supervisorId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === repId ? { ...u, supervisorId } : u))
    );
  };

  // --- Inventory & Stock Real-time Audit Helper ---
  const recordInventoryTransaction = (_tx: Omit<InventoryTransaction, 'id' | 'timestamp' | 'date'>) => {
    // Inventory logs disabled as requested by user to keep the app ultra-clean and lightweight
  };

  const checkProductAvailability = (productId: string, requestedCartons: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return { available: false, remainingPieces: 0, message: 'الصنف غير موجود بالسيستم' };

    const branchActual = prod.branchStockActual || 0;
    const branchAvailable = Math.max(0, prod.branchStockReserved);
    const branchReservedCount = Math.max(0, branchActual - branchAvailable);

    const mainActual = prod.mainWarehouseActual || 0;
    const mainAvailable = Math.max(0, prod.mainWarehouseReserved);
    const mainReservedCount = Math.max(0, mainActual - mainAvailable);

    const totalAvailable = branchAvailable + mainAvailable;
    const totalActual = branchActual + mainActual;
    const totalReserved = branchReservedCount + mainReservedCount;

    if (totalAvailable <= 0) {
      return {
        available: false,
        remainingPieces: 0,
        message: `عفواً، الصنف (${prod.name}) غير متاح للطلب الآن!\n📊 تفاصيل الرصيد: الرصيد الفعلي (${totalActual} كرتونة) - محجوز بفواتير معلقة (${totalReserved} كرتونة) = الرصيد المتاح للبيع (0 كرتونة متبقية).`
      };
    }

    if (requestedCartons > totalAvailable) {
      return {
        available: false,
        remainingPieces: totalAvailable,
        message: `عفواً، الكمية المطلوبة (${requestedCartons} كرتونة) تتجاوز الرصيد المتاح!\n📊 تفاصيل الرصيد: الفعلي بالمخزن (${totalActual} كرتونة) | محجوز لمناديب آخرين (${totalReserved} كرتونة) ⬅️ المتبقي الصافي المتاح (${totalAvailable} كرتونة فقط).`
      };
    }

    return { available: true, remainingPieces: totalAvailable };
  };

  // --- Smart Cart Actions with Automatic Carton & Piece Conversion ---
  const addToCart = (
    product: Product,
    orderType: 'carton' | 'piece' | 'mixed' = 'carton',
    count: number = 1,
    piecesCount: number = 0
  ): { success: boolean; message?: string } => {
    const latestProd = products.find((p) => p.id === product.id) || product;
    const cartonQty = latestProd.cartonQuantity && latestProd.cartonQuantity > 0 ? latestProd.cartonQuantity : 1;

    let cartonsToAdd = 0;
    let piecesToAdd = 0;

    if (orderType === 'piece') {
      // User entered total pieces -> automatically convert to cartons + pieces!
      const totalPiecesInput = Math.max(1, count);
      cartonsToAdd = Math.floor(totalPiecesInput / cartonQty);
      piecesToAdd = totalPiecesInput % cartonQty;
    } else if (orderType === 'carton') {
      cartonsToAdd = Math.max(0, count);
      piecesToAdd = Math.max(0, piecesCount);
      // Auto-wrap overflow pieces to cartons if >= cartonQty
      if (piecesToAdd >= cartonQty) {
        cartonsToAdd += Math.floor(piecesToAdd / cartonQty);
        piecesToAdd = piecesToAdd % cartonQty;
      }
    } else {
      cartonsToAdd = Math.max(0, count);
      piecesToAdd = Math.max(0, piecesCount);
      if (piecesToAdd >= cartonQty) {
        cartonsToAdd += Math.floor(piecesToAdd / cartonQty);
        piecesToAdd = piecesToAdd % cartonQty;
      }
    }

    if (cartonsToAdd === 0 && piecesToAdd === 0) {
      cartonsToAdd = 1;
    }

    const totalRequiredCartonFraction = cartonsToAdd + (piecesToAdd / cartonQty);

    const branchActual = latestProd.branchStockActual || 0;
    const availableInBranch = Math.max(0, latestProd.branchStockReserved);
    const branchReservedCount = Math.max(0, branchActual - availableInBranch);

    const mainActual = latestProd.mainWarehouseActual || 0;
    const availableInWarehouse = Math.max(0, latestProd.mainWarehouseReserved);
    const mainReservedCount = Math.max(0, mainActual - availableInWarehouse);

    const totalActual = branchActual + mainActual;
    const totalReserved = branchReservedCount + mainReservedCount;
    const totalAvailable = availableInBranch + availableInWarehouse;

    if (totalAvailable <= 0) {
      return {
        success: false,
        message: `⚠️ تنبيه رصيد محجوز: الصنف (${latestProd.name}) غير متاح للبيع!\n(الرصيد الفعلي بالمخزن: ${totalActual} كرتونة، ولكن تم حجز ${totalReserved} كرتونة بفواتير قيد المراجعة ⬅️ المتاح الصافي: 0 كرتونة).`
      };
    }

    const appliedCartonPrice = latestProd.promoPrice && latestProd.promoPrice > 0 ? latestProd.promoPrice : latestProd.cartonPrice;
    const piecePrice = latestProd.piecePrice && latestProd.piecePrice > 0 ? latestProd.piecePrice : (cartonQty > 0 ? Math.round((appliedCartonPrice / cartonQty) * 100) / 100 : appliedCartonPrice);

    setCart((prev) => {
      const existingInCart = prev.find((item) => item.product.id === latestProd.id);

      if (existingInCart) {
        let newCartonCount = existingInCart.cartonCount + cartonsToAdd;
        let newPieceCount = (existingInCart.pieceCount || 0) + piecesToAdd;
        if (newPieceCount >= cartonQty) {
          newCartonCount += Math.floor(newPieceCount / cartonQty);
          newPieceCount = newPieceCount % cartonQty;
        }

        const totalPrice = (newCartonCount * appliedCartonPrice) + (newPieceCount * piecePrice);
        const totalUnits = (newCartonCount * cartonQty) + newPieceCount;

        return prev.map((item) =>
          item.product.id === latestProd.id
            ? {
                ...item,
                cartonCount: newCartonCount,
                pieceCount: newPieceCount,
                totalPieces: totalUnits,
                cartonQuantity: cartonQty,
                unitPrice: appliedCartonPrice,
                pricePerPiece: piecePrice,
                totalPrice,
                orderType: 'carton',
                quantityDescription: newCartonCount > 0 && newPieceCount > 0 ? `${newCartonCount} كرتونة و ${newPieceCount} قطعة` : newCartonCount > 0 ? `${newCartonCount} كرتونة` : `${newPieceCount} قطعة`,
              }
            : item
        );
      } else {
        const totalPrice = (cartonsToAdd * appliedCartonPrice) + (piecesToAdd * piecePrice);
        const totalUnits = (cartonsToAdd * cartonQty) + piecesToAdd;

        return [
          ...prev,
          {
            product: latestProd,
            orderType: 'carton',
            cartonCount: cartonsToAdd,
            pieceCount: piecesToAdd,
            totalPieces: totalUnits,
            cartonQuantity: cartonQty,
            unitPrice: appliedCartonPrice,
            pricePerPiece: piecePrice,
            totalPrice,
            quantityDescription: cartonsToAdd > 0 && piecesToAdd > 0 ? `${cartonsToAdd} كرتونة و ${piecesToAdd} قطعة` : cartonsToAdd > 0 ? `${cartonsToAdd} كرتونة` : `${piecesToAdd} قطعة`,
            fulfillFromMainWarehouse: latestProd.branchStockActual <= 0 && latestProd.mainWarehouseActual > 0,
          },
        ];
      }
    });

    return { success: true };
  };

  const updateCartItem = (productId: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const merged = { ...item, ...updates };
        const cartonQty = merged.product.cartonQuantity && merged.product.cartonQuantity > 0 ? merged.product.cartonQuantity : 1;
        const appliedCartonPrice =
          merged.product.promoPrice && merged.product.promoPrice > 0
            ? merged.product.promoPrice
            : merged.product.cartonPrice;
        const piecePrice = merged.product.piecePrice && merged.product.piecePrice > 0 ? merged.product.piecePrice : (cartonQty > 0 ? Math.round((appliedCartonPrice / cartonQty) * 100) / 100 : appliedCartonPrice);

        let safeCartonCount = Math.max(0, merged.cartonCount ?? 0);
        let safePieceCount = Math.max(0, merged.pieceCount ?? 0);

        // Auto-wrap overflow pieces into cartons
        if (safePieceCount >= cartonQty) {
          safeCartonCount += Math.floor(safePieceCount / cartonQty);
          safePieceCount = safePieceCount % cartonQty;
        }

        if (safeCartonCount === 0 && safePieceCount === 0) {
          safeCartonCount = 1;
        }

        const totalPrice = (safeCartonCount * appliedCartonPrice) + (safePieceCount * piecePrice);
        const totalUnits = (safeCartonCount * cartonQty) + safePieceCount;

        const desc = safeCartonCount > 0 && safePieceCount > 0 
          ? `${safeCartonCount} كرتونة و ${safePieceCount} قطعة` 
          : safeCartonCount > 0 
          ? `${safeCartonCount} كرتونة` 
          : `${safePieceCount} قطعة`;

        return {
          ...merged,
          cartonCount: safeCartonCount,
          pieceCount: safePieceCount,
          totalPieces: totalUnits,
          cartonQuantity: cartonQty,
          unitPrice: appliedCartonPrice,
          pricePerPiece: piecePrice,
          totalPrice,
          quantityDescription: desc,
          orderType: 'carton',
        };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  const getCartSummary = (customDiscountPercent?: number) => {
    let totalCartons = 0;
    let totalPieces = 0;
    let subtotal = 0;

    cart.forEach((item) => {
      const cQty = item.product.cartonQuantity || 1;
      totalCartons += item.cartonCount;
      totalPieces += (item.cartonCount * cQty) + (item.pieceCount || 0);
      subtotal += item.totalPrice;
    });

    const discountPercentage = typeof customDiscountPercent === 'number' ? Math.max(0, customDiscountPercent) : 0;
    const discountAmount = subtotal * (discountPercentage / 100);
    const grandTotal = Math.max(0, subtotal - discountAmount);
    const taxAmount = 0;

    return {
      totalCartons,
      totalPieces,
      subtotal,
      discountPercentage,
      discountAmount,
      taxAmount,
      grandTotal,
      itemCount: cart.length,
    };
  };

  // --- Product & Stock Management ---
  const addProduct = (product: Product) => {
    const sanitized = sanitizeProducts([product])[0];
    setProducts((prev) => [sanitized, ...prev]);
    recordInventoryTransaction({
      productId: sanitized.id,
      productCode: sanitized.code,
      productName: sanitized.name,
      type: 'تعديل جردي',
      quantityPieces: sanitized.branchStockActual,
      branchStockBefore: 0,
      branchStockAfter: sanitized.branchStockActual,
      branchName: sanitized.branchName || currentUser?.branchName || 'الفرع الرئيسي',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      notes: 'إضافة صنف جديد للكتالوج مع رصيد افتتاحي'
    });
  };

  const updateProduct = (updated: Product) => {
    const sanitized = sanitizeProducts([updated])[0];
    setProducts((prev) => prev.map((p) => (p.id === sanitized.id ? sanitized : p)));
  };

  const deleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const importProductsList = (newProducts: Product[], mode: 'merge' | 'replace') => {
    // Automatically register any newly encountered branch names dynamically
    setBranches((prevBranches) => {
      const existingNames = new Set(prevBranches.map((b) => b.name));
      const newBranchesToAdd: Branch[] = [];

      newProducts.forEach((p) => {
        const bName = p.branchName ? normalizeBranchName(p.branchName) : '';
        if (bName && !existingNames.has(bName)) {
          existingNames.add(bName);
          newBranchesToAdd.push({
            id: `b-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: bName,
            code: `BR-0${prevBranches.length + newBranchesToAdd.length + 1}`,
            city: bName.replace('فرع ', ''),
            address: `محافظة ${bName.replace('فرع ', '')}`,
            managerName: 'مدير الفرع',
            phone: '01000000000',
            isMainWarehouse: bName.includes('المركزي') || bName.includes('أكتوبر'),
          });
        }
      });

      if (newBranchesToAdd.length > 0) {
        return [...prevBranches, ...newBranchesToAdd];
      }
      return prevBranches;
    });

    // Intelligently calculate currently active reservations from pending invoices to prevent overwriting sales rep reserves
    const reservedPiecesByProduct = new Map<string, number>();
    invoices.forEach((inv) => {
      if (
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة' ||
        inv.status === 'جاري التجهيز'
      ) {
        inv.items.forEach((item) => {
          const current = reservedPiecesByProduct.get(item.productId) || 0;
          reservedPiecesByProduct.set(item.productId, current + (item.totalUnits || 0));
        });
      }
    });

    const protectReserved = (prod: Product): Product => {
      const activePending = reservedPiecesByProduct.get(prod.id) || 0;
      const safeReserved = Math.max(0, prod.branchStockActual - activePending);
      return {
        ...prod,
        branchStockReserved: safeReserved,
      };
    };

    const normalizeProductCode = (value?: string) => String(value || '').trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
    const getProductIdentityKey = (p: Product): string => {
      const code = normalizeProductCode(p.code);
      if (code) return `code:${code}`;
      const unified = normalizeProductCode(p.unifiedCode);
      const fallback = [unified, p.name, p.color, p.size]
        .map((value) => String(value || '').trim().toLowerCase())
        .join(':::');
      return unified ? `unified:${fallback}` : `id:${p.id}`;
    };

    const existingByIdentity = new Map<string, Product>();
    products.forEach((product) => existingByIdentity.set(getProductIdentityKey(product), product));
    const incomingProducts = newProducts.map((product) => {
      const existing = existingByIdentity.get(getProductIdentityKey(product));
      return existing ? { ...product, id: existing.id } : product;
    });

    let finalUpdated: Product[] = [];
    if (mode === 'replace') {
      finalUpdated = sanitizeProducts(incomingProducts.map(protectReserved));
      setProducts(finalUpdated);
    } else {
      const idMap = new Map<string, Product>();
      products.forEach((p) => idMap.set(p.id, p));
      incomingProducts.forEach((p) => {
        idMap.set(p.id, protectReserved(p));
      });
      finalUpdated = sanitizeProducts(Array.from(idMap.values()));
      setProducts(finalUpdated);
    }

    // Persist full catalog to Supabase so reps & branch supervisors instantly receive it on all devices
    saveProductsToSupabase(finalUpdated).catch((err) => {
      console.warn('Supabase catalog auto-sync warning:', err);
    });

    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مدير النظام',
      userRole: currentUser?.role || 'admin',
      branchName: currentUser?.branchName || 'الفرع الرئيسي',
      action: 'import_products',
      actionTitle: `استيراد ومزامنة ${newProducts.length} صنف من شيت الإكسل (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'})`,
      details: `تم تحديث بيانات وشدات وأسعار ${newProducts.length} صنف مع الحفاظ على حجوزات المناديب النشطة ومزامنتها مع قاعدة البيانات المركزية.`,
      badgeType: 'info',
    });
  };

  const adjustStock = (productId: string, branchChange: number, mainWarehouseChange: number, reason?: string) => {
    const prod = products.find((p) => p.id === productId);
    const beforeActual = prod ? prod.branchStockActual : 0;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          branchStockActual: Math.max(0, p.branchStockActual + branchChange),
          branchStockReserved: Math.max(0, p.branchStockReserved + branchChange),
          mainWarehouseActual: Math.max(0, p.mainWarehouseActual + mainWarehouseChange),
          mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved + mainWarehouseChange),
        };
      })
    );

    if (prod && (branchChange !== 0 || mainWarehouseChange !== 0)) {
      recordInventoryTransaction({
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        type: branchChange > 0 ? 'توريد مخزني' : 'تعديل جردي',
        quantityPieces: Math.abs(branchChange),
        branchStockBefore: beforeActual,
        branchStockAfter: Math.max(0, beforeActual + branchChange),
        branchName: prod.branchName || currentUser?.branchName || 'الفرع الرئيسي',
        userName: currentUser?.name || 'مدير المخزن',
        userRole: currentUser?.role || 'branch_manager',
        notes: reason || `تعديل يدوي في رصيد الفرع: ${branchChange > 0 ? '+' : ''}${branchChange} قطعة`
      });

      recordAuditLog({
        userId: currentUser?.id || 'mgr',
        userName: currentUser?.name || 'مدير المخزن',
        userRole: currentUser?.role || 'branch_manager',
        branchName: prod.branchName || currentUser?.branchName || 'الفرع الرئيسي',
        action: 'stock_adjustment',
        actionTitle: `تعديل رصيد الصنف (${prod.code} - ${prod.name})`,
        details: `تعديل الفرع: ${branchChange > 0 ? `+${branchChange}` : branchChange} قطعة • تعديل أكتوبر: ${mainWarehouseChange > 0 ? `+${mainWarehouseChange}` : mainWarehouseChange} قطعة • السبب: ${reason || 'تسوية جردية'}`,
        badgeType: 'warning',
      });
    }
  };

  // --- Orders, Concurrency, and Approval Workflow ---
  const createOrder = (
    orderData: Partial<Invoice> & { splitShortagesToBackorder?: boolean }
  ): {
    success: boolean;
    invoice?: Invoice;
    shortageInvoice?: Invoice;
    message?: string;
  } => {
    if (cart.length === 0) {
      return { success: false, message: 'سلة الطلبية فارغة! يرجى إضافة أصناف أولاً.' };
    }

    // Submitting a request does not check, reserve, transfer, or deduct stock.
    // Stock availability is validated only after an authorized supervisor/manager clicks approval.
    for (const item of cart) {
      const currentProd = products.find((p) => p.id === item.product.id);
      if (!currentProd) {
        return { success: false, message: 'أحد الأصناف لم يعد موجوداً في النظام.' };
      }
    }


    const newInvoiceNumber = `DRM-${new Date().getFullYear()}-${String(invoices.length + 104).padStart(4, '0')}`;
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10);
    const formattedTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    const userSupervisor = currentUser?.supervisorId
      ? users.find((u) => u.id === currentUser.supervisorId)?.name
      : 'مشرف عام الفرع';

    // Sales reps only submit a request. Approval, transfer, and stock deduction belong to supervisors/managers.
    const isDirectManager = currentUser?.role === 'admin' || currentUser?.role === 'branch_manager';
    const initialStatus: OrderStatus = isDirectManager ? 'معتمدة ومصروفة من المخزن' : 'قيد مراجعة المشرف';

    // Check if user requested shortage backorder split or has main warehouse fulfilled items
    const hasWarehouseItems = cart.some((c) => c.fulfillFromMainWarehouse);
    const shouldSplit = (orderData.splitShortagesToBackorder || hasWarehouseItems) && cart.some(c => !c.fulfillFromMainWarehouse) && hasWarehouseItems;

    let primaryCartItems = cart;
    let shortageCartItems: typeof cart = [];

    if (shouldSplit) {
      primaryCartItems = cart.filter((c) => !c.fulfillFromMainWarehouse);
      shortageCartItems = cart.filter((c) => c.fulfillFromMainWarehouse);
    }

    const orderDiscountPercent = typeof orderData.discountPercentage === 'number' ? Math.max(0, orderData.discountPercentage) : 0;

    const buildInvoiceItems = (items: typeof cart) => {
      return items.map((item) => {
        const cartonQty = item.product.cartonQuantity || 1;
        const appliedCartonPrice = item.product.promoPrice && item.product.promoPrice > 0 ? item.product.promoPrice : item.product.cartonPrice;
        const piecePrice = item.product.piecePrice && item.product.piecePrice > 0 ? item.product.piecePrice : (cartonQty > 0 ? Math.round((appliedCartonPrice / cartonQty) * 100) / 100 : appliedCartonPrice);
        
        const cCount = item.cartonCount || 0;
        const pCount = item.pieceCount || 0;
        const itemSubtotal = (cCount * appliedCartonPrice) + (pCount * piecePrice);
        const itemDiscount = itemSubtotal * (orderDiscountPercent / 100);
        const itemTax = 0;
        const totalUnits = (cCount * cartonQty) + pCount;

        const smartDesc = cCount > 0 && pCount > 0 
          ? `${cCount} كرتونة و ${pCount} قطعة` 
          : cCount > 0 
          ? `${cCount} كرتونة` 
          : `${pCount} قطعة`;

        return {
          productId: item.product.id,
          productCode: item.product.code,
          productName: item.product.name,
          cartonCount: cCount,
          pieceCount: pCount,
          cartonQuantity: cartonQty,
          totalUnits,
          quantityDescription: smartDesc,
          pricePerPiece: piecePrice,
          pricePerCarton: item.product.cartonPrice,
          appliedPrice: appliedCartonPrice,
          totalBeforeTax: itemSubtotal,
          discountAmount: itemDiscount,
          taxAmount: itemTax,
          netTotal: itemSubtotal - itemDiscount,
          fulfilledFrom: (item.fulfillFromMainWarehouse ? 'main_warehouse' : 'branch') as 'branch' | 'main_warehouse',
        };
      });
    };

    const calculateTotals = (items: ReturnType<typeof buildInvoiceItems>) => {
      let subtotal = 0;
      let totalCartons = 0;
      let totalPieces = 0;
      items.forEach((it) => {
        subtotal += it.totalBeforeTax;
        totalCartons += it.cartonCount;
        totalPieces += it.totalUnits;
      });
      const discountAmount = subtotal * (orderDiscountPercent / 100);
      const taxAmount = 0;
      const estimatedGrandTotal = Math.max(0, subtotal - discountAmount);
      return { subtotal, totalCartons, totalPieces, discountAmount, taxAmount, estimatedGrandTotal };
    };

    const primaryItems = buildInvoiceItems(primaryCartItems);
    const primaryTotals = calculateTotals(primaryItems);

    // Determine assigned rep, supervisor, and audit trail note
    let assignedRepId = currentUser ? currentUser.id : 'u-admin-1';
    let assignedRepName = currentUser ? currentUser.name : 'أسامة إسلام (المطور التقني)';
    let assignedSupervisorName = userSupervisor;
    let creatorAuditNote = '';

    if (currentUser?.role === 'supervisor') {
      assignedSupervisorName = currentUser.name;
      if (orderData.repName && orderData.repName.trim()) {
        assignedRepName = orderData.repName.trim();
        const matchedRep = users.find(
          (u) =>
            isArabicNameMatch(u.name, assignedRepName) ||
            (u.username && isArabicNameMatch(u.username, assignedRepName))
        );
        if (matchedRep) {
          assignedRepId = matchedRep.id;
          assignedRepName = matchedRep.name;
        }
      }
      creatorAuditNote = `[تم إنشاء الطلبية بواسطة المشرف: ${currentUser.name} للمندوب التابع للعميل: ${assignedRepName}]`;
    } else if (currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') {
      if (orderData.repName && orderData.repName.trim()) {
        assignedRepName = orderData.repName.trim();
        const matchedRep = users.find(
          (u) =>
            isArabicNameMatch(u.name, assignedRepName) ||
            (u.username && isArabicNameMatch(u.username, assignedRepName))
        );
        if (matchedRep) {
          assignedRepId = matchedRep.id;
          assignedRepName = matchedRep.name;
          if (matchedRep.supervisorId) {
            const sUser = users.find((u) => u.id === matchedRep.supervisorId);
            if (sUser) assignedSupervisorName = sUser.name;
          }
        }
      }
      if (currentUser?.role === 'branch_manager') {
        creatorAuditNote = `[تم إنشاء الطلبية بواسطة مدير الفرع: ${currentUser.name} للمندوب: ${assignedRepName}]`;
      }
    } else if (currentUser?.role === 'sales_rep') {
      assignedRepId = currentUser.id;
      assignedRepName = currentUser.name;
      assignedSupervisorName = userSupervisor;
    }

    const orderFinalNotes = [orderData.notes, creatorAuditNote].filter(Boolean).join('\n');
    const defaultBranch = currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
    const orderBranch = currentUser?.role === 'admin' || currentUser?.role === 'developer'
      ? (orderData.branchName || defaultBranch)
      : defaultBranch;

    // Match customer for credit limit & debt validation using intelligent matcher
    const matchedCustomer = findCustomerMatch(customers, {
      customerId: orderData.customerId,
      customerCode: orderData.customerCode,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
    });

    const custBalanceBefore = orderData.customerBalanceBefore !== undefined && orderData.customerBalanceBefore !== null
      ? Number(orderData.customerBalanceBefore)
      : Number(matchedCustomer?.currentBalance ?? matchedCustomer?.balance ?? 0);

    const custCreditLimit = orderData.customerCreditLimit !== undefined && orderData.customerCreditLimit !== null
      ? Number(orderData.customerCreditLimit)
      : Number(matchedCustomer?.creditLimit !== undefined && matchedCustomer?.creditLimit !== null ? matchedCustomer.creditLimit : 0);

    const custOverdue = orderData.customerOverdueBalance !== undefined && orderData.customerOverdueBalance !== null
      ? Number(orderData.customerOverdueBalance)
      : Number(matchedCustomer?.totalOverdueAndDue ?? matchedCustomer?.overdueBalance ?? 0);

    const custBalanceAfter = orderData.customerBalanceAfter !== undefined && orderData.customerBalanceAfter !== null
      ? Number(orderData.customerBalanceAfter)
      : (custBalanceBefore + primaryTotals.estimatedGrandTotal);

    const isCreditExceeded = orderData.creditLimitExceeded !== undefined
      ? Boolean(orderData.creditLimitExceeded)
      : (custCreditLimit > 0 && custBalanceAfter > custCreditLimit);

    const reqPayment = orderData.requiredDownPayment !== undefined && orderData.requiredDownPayment !== null
      ? Number(orderData.requiredDownPayment)
      : (isCreditExceeded ? Math.max(0, custBalanceAfter - custCreditLimit) : 0);

    const primaryInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber,
      customerId: orderData.customerId || (matchedCustomer ? matchedCustomer.id : undefined),
      customerName: orderData.customerName || (matchedCustomer ? matchedCustomer.name : 'عميل تجزئة عام'),
      customerCode: orderData.customerCode || (matchedCustomer ? matchedCustomer.code : undefined),
      customerPhone: orderData.customerPhone || (matchedCustomer ? matchedCustomer.phone : ''),
      customerAddress: orderData.customerAddress || (matchedCustomer ? matchedCustomer.address : ''),
      customerTaxNumber: orderData.customerTaxNumber || (matchedCustomer ? matchedCustomer.taxNumber : ''),
      date: formattedDate,
      time: formattedTime,
      repId: assignedRepId,
      repName: assignedRepName,
      supervisorName: assignedSupervisorName,
      branchName: orderBranch,
      items: primaryItems,
      totalCartons: primaryTotals.totalCartons,
      totalPieces: primaryTotals.totalPieces,
      subtotal: primaryTotals.subtotal,
      discountPercentage: orderDiscountPercent,
      discountAmount: primaryTotals.discountAmount,
      taxPercentage: 0,
      taxAmount: 0,
      estimatedGrandTotal: primaryTotals.estimatedGrandTotal,
      paymentMethod: orderData.paymentMethod || 'نقدي (كاش)',
      status: initialStatus,
      notes: orderFinalNotes,
      syncedToAccounting: false,
      hasShortageSplit: shouldSplit,
      shortageInvoiceNumber: shouldSplit ? `${newInvoiceNumber}-NQ` : undefined,
      customerBalanceBefore: custBalanceBefore,
      customerCreditLimit: custCreditLimit,
      customerBalanceAfter: custBalanceAfter,
      customerOverdueBalance: custOverdue,
      creditLimitExceeded: isCreditExceeded,
      requiredDownPayment: reqPayment,
      qrPayload: `DREAM-EINV-${newInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${primaryTotals.estimatedGrandTotal.toFixed(2)}|${primaryTotals.taxAmount.toFixed(2)}|${formattedDate}`,
    };

    let createdShortageInvoice: Invoice | undefined = undefined;

    if (shouldSplit && shortageCartItems.length > 0) {
      const shortageItems = buildInvoiceItems(shortageCartItems);
      const shortageTotals = calculateTotals(shortageItems);
      const shortageInvoiceNumber = `${newInvoiceNumber}-NQ`;
      const shortageBalanceAfter = custBalanceBefore + shortageTotals.estimatedGrandTotal;
      const shortageCreditExceeded = custCreditLimit > 0 && shortageBalanceAfter > custCreditLimit;
      const shortageReqPayment = shortageCreditExceeded ? Math.max(0, shortageBalanceAfter - custCreditLimit) : 0;

      createdShortageInvoice = {
        id: `inv-${Date.now() + 1}`,
        invoiceNumber: shortageInvoiceNumber,
        customerId: orderData.customerId || (matchedCustomer ? matchedCustomer.id : undefined),
        customerName: orderData.customerName || (matchedCustomer ? matchedCustomer.name : 'عميل تجزئة عام'),
        customerCode: orderData.customerCode || (matchedCustomer ? matchedCustomer.code : undefined),
        customerPhone: orderData.customerPhone || (matchedCustomer ? matchedCustomer.phone : ''),
        customerAddress: orderData.customerAddress || (matchedCustomer ? matchedCustomer.address : ''),
        customerTaxNumber: orderData.customerTaxNumber || (matchedCustomer ? matchedCustomer.taxNumber : ''),
        date: formattedDate,
        time: formattedTime,
        repId: assignedRepId,
        repName: assignedRepName,
        supervisorName: assignedSupervisorName,
        branchName: orderBranch,
        items: shortageItems,
        totalCartons: shortageTotals.totalCartons,
        totalPieces: shortageTotals.totalPieces,
        subtotal: shortageTotals.subtotal,
        discountPercentage: orderDiscountPercent,
        discountAmount: shortageTotals.discountAmount,
        taxPercentage: 0,
        taxAmount: 0,
        estimatedGrandTotal: shortageTotals.estimatedGrandTotal,
        paymentMethod: orderData.paymentMethod || 'نقدي (كاش)',
        status: 'قيد مراجعة المشرف',
        notes: `فاتورة تحويل نواقص من المخزن المركزي (6 أكتوبر) تابعة للفاتورة الأساسية #${newInvoiceNumber}`,
        syncedToAccounting: false,
        customerBalanceBefore: custBalanceBefore,
        customerCreditLimit: custCreditLimit,
        customerBalanceAfter: shortageBalanceAfter,
        customerOverdueBalance: custOverdue,
        creditLimitExceeded: shortageCreditExceeded,
        requiredDownPayment: shortageReqPayment,
        isShortageInvoice: true,
        parentInvoiceId: primaryInvoice.id,
        parentInvoiceNumber: primaryInvoice.invoiceNumber,
        qrPayload: `DREAM-EINV-${shortageInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${shortageTotals.estimatedGrandTotal.toFixed(2)}|${shortageTotals.taxAmount.toFixed(2)}|${formattedDate}`,
      };
    }

    // Reserve stock immediately to prevent double-booking by multiple sales reps.
    // Physical actual stock is deducted only upon supervisor/manager approval.
    setProducts((prev) => {
      return prev.map((p) => {
        const cartItem = cart.find((c) => c.product.id === p.id);
        if (!cartItem) return p;
        const cartonUnits = cartItem.cartonCount;

        if (cartItem.fulfillFromMainWarehouse) {
          // Explicit full central warehouse reservation
          const mainUnits = Math.min(cartonUnits, Math.max(0, p.mainWarehouseReserved));
          return {
            ...p,
            mainWarehouseActual: isDirectManager ? Math.max(0, p.mainWarehouseActual - mainUnits) : p.mainWarehouseActual,
            mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - mainUnits),
          };
        } else {
          // Smart priority: take available from branch first, and remaining shortage from central warehouse
          const availableInBranch = Math.max(0, p.branchStockReserved);
          const takeFromBranch = Math.min(cartonUnits, availableInBranch);
          const takeFromMain = Math.max(0, cartonUnits - takeFromBranch);

          return {
            ...p,
            branchStockActual: isDirectManager ? Math.max(0, p.branchStockActual - takeFromBranch) : p.branchStockActual,
            branchStockReserved: Math.max(0, p.branchStockReserved - takeFromBranch),
            mainWarehouseActual: isDirectManager ? Math.max(0, p.mainWarehouseActual - takeFromMain) : p.mainWarehouseActual,
            mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - takeFromMain),
          };
        }
      });
    });

    cart.forEach((item) => {
      const prod = products.find((p) => p.id === item.product.id);
      const isFromMain = item.fulfillFromMainWarehouse;
      const beforeReserved = prod ? (isFromMain ? prod.mainWarehouseReserved : prod.branchStockReserved) : 0;

      recordInventoryTransaction({
        productId: item.product.id,
        productCode: item.product.code,
        productName: item.product.name,
        type: isDirectManager ? 'صرف واعتماد مشرف' : 'حجز طلبية مندوب',
        quantityPieces: item.cartonCount,
        branchStockBefore: beforeReserved,
        branchStockAfter: Math.max(0, beforeReserved - item.cartonCount),
        branchName: isFromMain ? 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)' : (currentUser?.branchName || 'الفرع الرئيسي'),
        userName: currentUser?.name || 'المندوب',
        userRole: currentUser?.role || 'sales_rep',
        invoiceId: primaryInvoice.id,
        invoiceNumber: newInvoiceNumber,
        notes: isFromMain
          ? `حجز صنف نواقص من المخزن المركزي بأكتوبر للطلبية #${newInvoiceNumber}`
          : isDirectManager
          ? `اعتماد وصرف فوري للطلبية #${newInvoiceNumber}`
          : `حجز رصيد للطلبية #${newInvoiceNumber} لمنع تكرار الحجز (قيد مراجعة واعتماد المشرف)`,
      });
    });

    setInvoices((prev) => {
      const updated = [primaryInvoice, ...prev];
      if (createdShortageInvoice) {
        updated.unshift(createdShortageInvoice);
      }
      return updated;
    });

    // Auto-detect and register new customer or link to representative
    if (orderData.customerName && orderData.customerName.trim() !== 'عميل تجزئة عام') {
      const trimmedCustName = orderData.customerName.trim();
      const existingCustIndex = customers.findIndex(
        (c) =>
          c.name.trim().toLowerCase() === trimmedCustName.toLowerCase() ||
          (orderData.customerPhone && c.phone && c.phone.trim() === orderData.customerPhone.trim())
      );

      if (existingCustIndex === -1) {
        // Create new registered customer bound to current rep
        const newCustomerObj: Customer = {
          id: `c-${Date.now()}`,
          code: `CUST-${String(customers.length + 101).padStart(4, '0')}`,
          name: trimmedCustName,
          phone: orderData.customerPhone || '',
          address: orderData.customerAddress || '',
          taxNumber: orderData.customerTaxNumber || '',
          governorate: 'القاهرة والجيزة',
          branchName: currentUser?.branchName || 'الفرع الرئيسي',
          salesRepName: currentUser?.name || 'مندوب المبيعات',
          repName: currentUser?.name || 'مندوب المبيعات',
          repId: currentUser?.id || 'rep-1',
          tier: 'عادي',
          balance: 0,
          creditLimit: 50000,
          notes: `تم تسجيل العميل تلقائياً مع الفاتورة #${primaryInvoice.invoiceNumber}`,
          lastOrderDate: formattedDate,
          totalOrdersCount: 1,
          totalSpent: primaryTotals.estimatedGrandTotal,
        };
        setCustomers((prev) => [newCustomerObj, ...prev]);
        saveCustomersToSupabase([newCustomerObj]).catch((e) => console.warn('Supabase customer auto-save failed:', e));
      } else {
        // Update stats on existing customer
        const matched = customers[existingCustIndex];
        const updatedCust: Customer = {
          ...matched,
          phone: orderData.customerPhone || matched.phone,
          address: orderData.customerAddress || matched.address,
          salesRepName: matched.salesRepName || currentUser?.name || 'مندوب المبيعات',
          repName: matched.repName || currentUser?.name || 'مندوب المبيعات',
          repId: matched.repId || currentUser?.id || 'rep-1',
          lastOrderDate: formattedDate,
          totalOrdersCount: (matched.totalOrdersCount || 0) + 1,
          totalSpent: (matched.totalSpent || 0) + primaryTotals.estimatedGrandTotal,
        };
        setCustomers((prev) => prev.map((c) => (c.id === matched.id ? updatedCust : c)));
        saveCustomersToSupabase([updatedCust]).catch((e) => console.warn('Supabase customer update failed:', e));
      }
    }

    // Auto push to Supabase Cloud Database
    saveInvoiceWithQueue(primaryInvoice).catch((e) => console.warn('Supabase invoice save failed:', e));
    if (createdShortageInvoice) {
      saveInvoiceWithQueue(createdShortageInvoice).catch((e) => console.warn('Supabase shortage invoice save failed:', e));
    }

    clearCart();

    recordAuditLog({
      userId: currentUser?.id || 'rep',
      userName: currentUser?.name || 'المندوب',
      userRole: currentUser?.role || 'sales_rep',
      branchName: primaryInvoice.branchName,
      action: 'create_invoice',
      actionTitle: `تسجيل فاتورة مبيعات جديدة #${primaryInvoice.invoiceNumber}`,
      details: `العميل: ${primaryInvoice.customerName} • ${primaryInvoice.totalCartons} كرتونة • القيمة: ${primaryInvoice.estimatedGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م • الحالة: ${primaryInvoice.status}${shouldSplit ? ` • تم تجزئة نواقص لفاتورة #${createdShortageInvoice?.invoiceNumber}` : ''}`,
      invoiceId: primaryInvoice.id,
      invoiceNumber: primaryInvoice.invoiceNumber,
      badgeType: 'warning',
    });

    return {
      success: true,
      invoice: primaryInvoice,
      shortageInvoice: createdShortageInvoice,
      message: createdShortageInvoice
        ? `تم إصدار الفاتورة الأساسية #${primaryInvoice.invoiceNumber} وفاتورة النواقص المحولة #${createdShortageInvoice.invoiceNumber} بنجاح!`
        : `تم تسجيل الطلبية #${primaryInvoice.invoiceNumber} وإرسالها للمراجعة والاعتماد!`
    };
  };

  // Supervisor / Manager approves order & discharges physical stock
  const approveOrder = (invoiceId: string, notes?: string): { success: boolean; message: string } => {
  if (!currentUser || !['supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
  return { success: false, message: 'المندوب لا يملك صلاحية اعتماد الطلبية أو صرف المخزون.' };
  }
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
  if (
    currentUser.role !== 'admin' &&
    currentUser.role !== 'developer' &&
    (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
  ) {
    return { success: false, message: 'لا يمكنك اعتماد طلبية تابعة لفرع آخر.' };
  }
  const isPending = inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة' || inv.status === 'مسودة';
  if (!isPending) return { success: false, message: 'لا يمكن اعتماد طلبية غير معلّقة للمراجعة.' };
    if (inv.status === 'معتمدة ومصروفة من المخزن') {
      return { success: false, message: 'الطلبية معتمدة ومصروفة بالفعل' };
    }

  // Deduct physical stock only after the supervisor explicitly clicks approve & dispatch:
  // branch first, then central warehouse. Drafts and pending orders never deduct stock.
  // If one item cannot be fulfilled, this manual approval is rejected before any state changes.
    const allocations = new Map<string, { branch: number; main: number }>();
    for (const invItem of inv.items) {
      const product = products.find((p) => p.id === invItem.productId);
      if (!product) return { success: false, message: `الصنف (${invItem.productName}) غير موجود في المخزو����` };
      const requested = Math.max(0, invItem.cartonCount || 0);
      const branchAvailable = Math.max(0, getBranchStockForProduct(product, inv.branchName));
      const mainAvailable = Math.max(0, product.mainWarehouseActual);
      const branch = Math.min(requested, branchAvailable);
      const main = requested - branch;
      if (main > mainAvailable) {
        return {
          success: false,
          message: `لا يمكن اعتماد الطلبية: الصنف (${product.name}) يحتاج ${requested} كرتونة، المتاح ${branchAvailable} بالفرع و${mainAvailable} بالمخزن الرئيسي.`,
        };
      }
      allocations.set(invItem.productId, { branch, main });
    }

    setProducts((prev) => prev.map((p) => {
      const allocation = allocations.get(p.id);
      if (!allocation) return p;
      const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
      if (updatedBranchStocks && allocation.branch > 0) {
        const branchKey = Object.keys(updatedBranchStocks).find((key) =>
          isBranchMatch(key, inv.branchName, { allowUnassigned: false })
        );
        if (branchKey) {
          updatedBranchStocks[branchKey] = Math.max(0, Number(updatedBranchStocks[branchKey] || 0) - allocation.branch);
        }
      }
      return {
        ...p,
        ...(updatedBranchStocks ? { branchStocks: updatedBranchStocks } : {}),
        branchStockActual: updatedBranchStocks ? p.branchStockActual : Math.max(0, p.branchStockActual - allocation.branch),
        mainWarehouseActual: Math.max(0, p.mainWarehouseActual - allocation.main),
      };
    }));

    // Log transaction
    inv.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId);
      const currentActual = prod ? prod.branchStockActual : 0;
      recordInventoryTransaction({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        type: 'صرف واعتماد مشرف',
        quantityPieces: item.cartonCount,
        branchStockBefore: currentActual,
        branchStockAfter: Math.max(0, currentActual - item.cartonCount),
        branchName: inv.branchName,
        userName: currentUser?.name || 'المشرف',
        userRole: currentUser?.role || 'supervisor',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        notes: notes ? `اعتماد وصرف: ${notes}` : `تم اعتماد وصرف الطلبية من المخزن بواسطة ${currentUser?.name}`,
      });
    });

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: 'معتمدة ومصروفة من المخزن' as OrderStatus,
          notes: notes ? `${i.notes ? i.notes + ' | ' : ''}ملاحظة الاعتماد: ${notes}` : i.notes,
        };
        saveInvoiceToSupabase(updated).catch((e) => console.warn('Supabase invoice update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'approve_invoice',
      actionTitle: `اعتماد وصرف الفاتورة #${inv.invoiceNumber}`,
      details: `العميل: ${inv.customerName} • المندوب: ${inv.repName} • تم خصم المخزون الفعلي من ${inv.branchName} (${inv.totalCartons} كرتونة) • القيمة: ${inv.estimatedGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م ${notes ? `• ملاحظة: ${notes}` : ''}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'success',
    });

    return {
      success: true,
      message: `تم اعتماد وصرف الطلبية #${inv.invoiceNumber} وخصم المخزون الفعلي (${inv.totalCartons} كرتونة) من الفرع بنجاح!`,
    };
  };

  // Supervisor escalates / forwards to Branch Manager
  const forwardOrderToManager = (invoiceId: string, notes?: string): { success: boolean; message: string } => {
  if (!currentUser || currentUser.role !== 'supervisor') {
  return { success: false, message: 'تحويل الطلبية لمدير الفرع متاح للمشرف فقط.' };
  }
  const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    if (!inv.branchName || !currentUser.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false })) {
      return { success: false, message: 'لا يمكنك تحويل طلبية تابعة لفرع آخر.' };
    }
    if (!['قيد مراجعة المشرف', 'قيد المراجعة'].includes(inv.status)) {
      return { success: false, message: 'لا يمكن تحويل طلبية في هذه الحالة.' };
    }

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: 'معلقة بانتظار اعتماد الفرع' as OrderStatus,
          notes: notes ? `${i.notes ? i.notes + ' | ' : ''}تم التحويل لمدير الفرع: ${notes}` : i.notes,
        };
        saveInvoiceToSupabase(updated).catch((e) => console.warn('Supabase forward update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'update_invoice_status',
      actionTitle: `تحويل الفاتورة #${inv.invoiceNumber} لمدير الفرع`,
      details: `تم إحالة الطلبية للاعتماد النهائي لمدير الفرع ${notes ? `• ملاحظات: ${notes}` : ''}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'info',
    });

    return {
      success: true,
      message: `تم إرسال الطلبية #${inv.invoiceNumber} لمدير الفرع للاعتماد النهائي بنجاح.`,
    };
  };

  // Supervisor / Manager rejects order -> Immediately releases reserved stock back to market!
  const rejectOrder = (invoiceId: string, reason: string): { success: boolean; message: string } => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً.' };
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    const isPending = inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة' || inv.status === 'مسودة';
    const isOwnerRep = currentUser.role === 'sales_rep' &&
      (inv.repId === currentUser.id || (!inv.repId && normalizeArabicText(inv.repName) === normalizeArabicText(currentUser.name)));
    if (currentUser.role === 'sales_rep' && (!isOwnerRep || !isPending)) {
      return { success: false, message: 'يمكن للمندوب إلغاء طلبه المعلّق فقط.' };
    }
    if (!['sales_rep', 'supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
      return { success: false, message: 'لا تملك صلاحية رفض الطلبية.' };
    }
    if (
      currentUser.role !== 'sales_rep' &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك رفض طلبية تابعة لفرع آخر.' };
    }
    if (!isPending) {
      return { success: false, message: 'لا يمكن رفض طلبية بعد اعتمادها؛ استخدم مسار المرتجع أو الإلغاء المناسب.' };
    }

    // Restore reserved stock back to available stock (in Cartons)
    setProducts((prev) => {
      return prev.map((p) => {
        const invItem = inv.items.find((it) => it.productId === p.id);
        if (!invItem) return p;
        if (invItem.fulfilledFrom === 'main_warehouse') {
          return {
            ...p,
            mainWarehouseReserved: p.mainWarehouseReserved + invItem.cartonCount,
          };
        } else {
          return {
            ...p,
            branchStockReserved: p.branchStockReserved + invItem.cartonCount,
          };
        }
      });
    });

    // Log transaction
    inv.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId);
      const reservedBefore = prod ? prod.branchStockReserved : 0;
      recordInventoryTransaction({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        type: 'إلغاء حجز وإرجاع',
        quantityPieces: item.cartonCount,
        branchStockBefore: reservedBefore,
        branchStockAfter: reservedBefore + item.cartonCount,
        branchName: inv.branchName,
        userName: currentUser?.name || 'المشرف',
        userRole: currentUser?.role || 'supervisor',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        notes: `تم رفض الطلبية وإرجاع الرصيد المحجوز للمخزن. السبب: ${reason}`,
      });
    });

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: 'مرفوضة / ملغاة' as OrderStatus,
          cancellationReason: reason,
          cancelledBy: currentUser?.name || 'مشرف المبيعات',
          cancelledAt: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
          restoredStockDetails: `تم استرجاع ${inv.totalCartons} كرتونة إلى مخزن الفرع`,
          notes: `${i.notes ? i.notes + ' | ' : ''}سبب الرفض: ${reason}`,
        };
        saveInvoiceToSupabase(updated).catch((e) => console.warn('Supabase reject update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'cancel_invoice',
      actionTitle: `رفض/إلغاء الطلبية #${inv.invoiceNumber} وفك الحجز`,
      details: `السبب: ${reason} • تم إعادة ${inv.totalCartons} كرتونة فوراً إلى رصيد مخزن الفرع المتاح.`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'danger',
    });

    return {
      success: true,
      message: `تم إلغاء الطلبية #${inv.invoiceNumber} وفك حجز ${inv.totalCartons} كرتونة وإعادتها للرصيد المتاح!`,
    };
  };

  // Re-open / Edit pending order for sales rep or supervisor before approval
  const editPendingOrder = (invoice: Invoice): { success: boolean; message: string; customer?: Customer | null } => {
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !invoice.branchName || !isBranchMatch(invoice.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك تعديل طلبية تابعة لفرع آخر.' };
    }
    const isRecent = invoice.createdAt ? (Date.now() - new Date(invoice.createdAt).getTime() < 48 * 3600 * 1000) : true;
    const canOverride = currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor';
    const isPending =
      invoice.status === 'قيد مراجعة المشرف' ||
      invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
      invoice.status === 'قيد المراجعة' ||
      invoice.status === 'مسودة' ||
      isRecent ||
      canOverride;

    if (!isPending) {
      return { success: false, message: 'لا يمكن تعديل هذه الفاتورة نظراً لمرور فترة طويلة على اعتمادها.' };
    }

    // Load items into cart. Pending orders reserve the generic available balance
    // at creation time, so reopening must not add stock a second time.
    const loadedCartItems: CartItem[] = invoice.items.map((item) => {
      const prod: Product = products.find((p) => p.id === item.productId) || {
        id: item.productId,
        code: item.productCode,
        name: item.productName,
        salesPriority: 'عادي',
        category: 'عام',
        status: 'متاح',
        cartonQuantity: item.cartonQuantity || 1,
        size: 'قياسي',
        color: 'افتراضي',
        branchStockActual: 100,
        branchStockReserved: 100,
        mainWarehouseActual: 100,
        mainWarehouseReserved: 100,
        department: 'عام',
        classification: 'عام',
        cartonPrice: item.pricePerCarton || item.appliedPrice,
        piecePrice: item.pricePerPiece,
        branchName: invoice.branchName || 'الفرع الرئيسي',
        minOrderQuantity: 1,
      };

      return {
        product: prod,
        cartonCount: item.cartonCount,
        pieceCount: item.pieceCount || 0,
        cartonQuantity: item.cartonQuantity || 1,
        totalPieces: item.totalUnits || 0,
        unitPrice: item.appliedPrice,
        pricePerPiece: item.pricePerPiece,
        totalPrice: item.totalBeforeTax,
        quantityDescription: item.quantityDescription,
        orderType: 'carton',
        fulfillFromMainWarehouse: item.fulfilledFrom === 'main_warehouse',
      };
    });

    setCart(loadedCartItems);

    // 3. Match customer using intelligent matcher
    const matchedCustomer = findCustomerMatch(customers, {
      customerId: invoice.customerId,
      customerCode: invoice.customerCode,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
    }) || (invoice.customerName ? {
      id: invoice.customerId || `c-temp-${Date.now()}`,
      code: invoice.customerCode || 'CUST-NEW',
      name: invoice.customerName,
      phone: invoice.customerPhone || '',
      address: invoice.customerAddress || '',
      taxNumber: invoice.customerTaxNumber || '',
      governorate: 'عام',
      branchName: invoice.branchName,
      salesRepName: invoice.repName,
      repName: invoice.repName,
      repId: invoice.repId,
      tier: 'عادي',
      balance: Number(invoice.customerBalanceBefore || 0),
      currentBalance: Number(invoice.customerBalanceBefore || 0),
      creditLimit: Number(invoice.customerCreditLimit !== undefined && invoice.customerCreditLimit !== null ? invoice.customerCreditLimit : 0),
      notes: '',
    } : null);

    // 4. Remove previous pending invoice
    setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));

    recordAuditLog({
      userId: currentUser?.id || 'rep',
      userName: currentUser?.name || 'المندوب',
      userRole: currentUser?.role || 'sales_rep',
      branchName: invoice.branchName,
      action: 'update_invoice_status',
      actionTitle: `إعادة فتح وتعديل الطلبية #${invoice.invoiceNumber}`,
      details: `تم إعادة فتح أصناف الطلبية #${invoice.invoiceNumber} للعميل (${invoice.customerName}) في السلة لإتاحة إضافة أو حذف أصناف أو تعديل الكميات والأسعار قبل الاعتماد.`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      badgeType: 'info',
    });

    return {
      success: true,
      message: `تم فتح الطلبية #${invoice.invoiceNumber} في السلة بنجاح! يمكنك الآن تعديل الكميات أو إضافة أصناف جديدة من الكتالوج وإعادة إصدار الفاتورة.`,
      customer: matchedCustomer,
    };
  };

  // Rep or supervisor can cancel order while pending
  const cancelPendingOrderByRep = (invoiceId: string, reason?: string): { success: boolean; message: string } => {
    return rejectOrder(invoiceId, reason || 'إلغاء الطلبية بطلب من المندوب قبل الاعتماد');
  };

  const updateOrderStatus = (
    invoiceId: string,
    status: OrderStatus,
    reason?: string
  ): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك تحديث طلبية تابعة لفرع آخر.' };
    }

    const oldStatus = inv.status;
    if (oldStatus === status) return { success: true, message: 'حالة الطلبية مطابقة بالفعل' };

    const isNowReturnedOrCancelled = status === 'مرتجع' || status === 'ملغاة' || status === 'مرفوضة / ملغاة';
    const wasDeductedOrApproved =
      oldStatus === 'معتمدة ومصروفة من المخزن' ||
      oldStatus === 'معتمدة' ||
      oldStatus === 'جاري التجهيز' ||
      oldStatus === 'قيد التوصيل' ||
      oldStatus === 'تم التسليم';
    const wasPending =
      oldStatus === 'قيد مراجعة المشرف' ||
      oldStatus === 'معلقة بانتظار اعتماد الفرع' ||
      oldStatus === 'قيد المراجعة';

    // If order is marked as Returned or Cancelled after stock was deducted/approved:
    if (isNowReturnedOrCancelled) {
      if (wasDeductedOrApproved) {
        // Restore physical actual AND reserved stock in Cartons
        setProducts((prev) =>
          prev.map((p) => {
            const item = inv.items.find((it) => it.productId === p.id);
            if (!item) return p;
            const qty = item.cartonCount;
            if (item.fulfilledFrom === 'main_warehouse') {
              return {
                ...p,
                mainWarehouseActual: p.mainWarehouseActual + qty,
                mainWarehouseReserved: p.mainWarehouseReserved + qty,
              };
            } else {
              const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
              if (updatedBranchStocks) {
                const branchKey = Object.keys(updatedBranchStocks).find((key) =>
                  isBranchMatch(key, inv.branchName, { allowUnassigned: false })
                );
                if (branchKey) {
                  updatedBranchStocks[branchKey] = Number(updatedBranchStocks[branchKey] || 0) + qty;
                }
              }
              return {
                ...p,
                ...(updatedBranchStocks ? { branchStocks: updatedBranchStocks } : {}),
                branchStockActual: p.branchStockActual + qty,
                branchStockReserved: p.branchStockReserved + qty,
              };
            }
          })
        );

        // Record inventory audit logs for each returned item
        inv.items.forEach((item) => {
          const prod = products.find((p) => p.id === item.productId);
          const currentActual = prod ? prod.branchStockActual : 0;
          recordInventoryTransaction({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            type: 'مرتجع مبيعات وإرجاع للمخزن',
            quantityPieces: item.cartonCount,
            branchStockBefore: currentActual,
            branchStockAfter: currentActual + item.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'مسئول المخازن',
            userRole: currentUser?.role || 'branch_manager',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes:
              status === 'مرتجع'
                ? `تسجيل مرتجع للطلبية #${inv.invoiceNumber} وإعادة ${item.cartonCount} كرتونة إلى رصيد مخزن الفرع. ${reason ? `السبب: ${reason}` : ''}`
                : `إلغاء الطلبية #${inv.invoiceNumber} واسترداد الرصيد بالكامل إلى المخزن`,
          });
        });
      } else if (wasPending) {
        // Only reserved stock was held -> release reserved stock
        setProducts((prev) =>
          prev.map((p) => {
            const item = inv.items.find((it) => it.productId === p.id);
            if (!item) return p;
            const qty = item.cartonCount;
            return {
              ...p,
              branchStockReserved: p.branchStockReserved + qty,
            };
          })
        );

        inv.items.forEach((item) => {
          const prod = products.find((p) => p.id === item.productId);
          const resBefore = prod ? prod.branchStockReserved : 0;
          recordInventoryTransaction({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            type: 'إلغاء حجز وإرجاع',
            quantityPieces: item.cartonCount,
            branchStockBefore: resBefore,
            branchStockAfter: resBefore + item.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'المشرف',
            userRole: currentUser?.role || 'supervisor',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes: `فك حجز الأصناف وإلغاء الطلبية #${inv.invoiceNumber}`,
          });
        });
      }

      // Restore / Refund customer balance and debt if order amount was added
      if (inv.customerName && inv.estimatedGrandTotal > 0) {
        setCustomers((prev) =>
          prev.map((c) => {
            const match = (inv.customerCode && c.code === inv.customerCode) || c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase();
            if (!match) return c;
            const currentBal = Number(c.currentBalance ?? c.balance ?? 0);
            const newBal = Math.max(0, currentBal - inv.estimatedGrandTotal);
            const updatedCust: Customer = {
              ...c,
              currentBalance: newBal,
              balance: newBal,
              totalSpent: Math.max(0, Number(c.totalSpent || 0) - inv.estimatedGrandTotal),
            };
            saveCustomersToSupabase([updatedCust]).catch((e) => console.warn('Supabase customer return balance sync failed:', e));
            return updatedCust;
          })
        );
      }
    }

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status,
          cancellationReason: isNowReturnedOrCancelled ? (reason || i.cancellationReason || 'إلغاء الطلبية') : i.cancellationReason,
          cancelledBy: isNowReturnedOrCancelled ? (currentUser?.name || 'مسؤول النظام') : i.cancelledBy,
          cancelledAt: isNowReturnedOrCancelled ? `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}` : i.cancelledAt,
          restoredStockDetails: isNowReturnedOrCancelled ? `تم استرجاع ${inv.totalCartons} كرتونة إلى المخزن` : i.restoredStockDetails,
          notes: reason
            ? `${i.notes ? i.notes + ' | ' : ''}تحديث الحالة إلى (${status}): ${reason}`
            : i.notes,
        };
        saveInvoiceToSupabase(updated).catch((e) => console.warn('Supabase status update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: inv.branchName,
      action: status === 'مرتجع' ? 'return_invoice' : isNowReturnedOrCancelled ? 'cancel_invoice' : 'update_invoice_status',
      actionTitle: `تحديث حالة الفاتورة #${inv.invoiceNumber} إلى (${status})`,
      details: `العميل: ${inv.customerName} • الحالة السابقة: (${oldStatus}) ⬅️ الحالة الجديدة: (${status}) ${reason ? `• السبب / الملاحظات: ${reason}` : ''}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: status === 'تم التسليم' || status === 'معتمدة ومصروفة من المخزن' ? 'success' : isNowReturnedOrCancelled ? 'danger' : 'info',
    });

    let message = `تم تحديث حالة الطلبية #${inv.invoiceNumber} بنجاح إلى: ${status}`;
    if (status === 'مرتجع') {
      message = `تم تسجيل الطلبية #${inv.invoiceNumber} كـ (مرتجع) وإرجاع كافة الكراتين والأرصدة إلى المخزن بنجاح!`;
    } else if (status === 'تم التسليم') {
      message = `تم تأكيد تسليم الطلبية #${inv.invoiceNumber} للعميل بنجاح!`;
    } else if (status === 'قيد التوصيل') {
      message = `تم تحويل الطلبية #${inv.invoiceNumber} إلى (قيد التوصيل) مع المندوب / سيارة التوزيع.`;
    }

    return { success: true, message };
  };

  const processOrderReturn = (
    invoiceId: string,
    returnedItems: ReturnedItem[],
    reason: string,
    restockToInventory: boolean = true
  ): { success: boolean; message: string; returnRecord?: ReturnRecord } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };

    if (!returnedItems || returnedItems.length === 0) {
      return { success: false, message: 'يرجى تحديد صنف واحد على الأقل مع تحديد الكمية المرتجعة' };
    }

    const totalRefundAmount = returnedItems.reduce((sum, item) => sum + (item.refundAmount || 0), 0);
    const totalReturnedCartons = returnedItems.reduce((sum, item) => sum + (item.cartonCount || 0), 0);
    const totalReturnedPieces = returnedItems.reduce((sum, item) => sum + (item.totalPieces || (item.pieceCount || 0)), 0);

    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    const returnVoucherNumber = `RET-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const newReturnRecord: ReturnRecord = {
      id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      returnVoucherNumber,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerCode: inv.customerCode,
      branchName: inv.branchName,
      repName: inv.repName,
      date: dateStr,
      time: timeStr,
      returnedItems,
      totalRefundAmount,
      totalReturnedCartons,
      totalReturnedPieces,
      reason: reason || 'مرتجع مبيعات',
      handledBy: currentUser?.name || 'مسؤول النظام',
      restockedToInventory: restockToInventory,
      notes: `إذن مرتجع مبيعات #${returnVoucherNumber} للفاتورة #${inv.invoiceNumber}`,
    };

    // 1. Restock to inventory if requested and condition is good
    if (restockToInventory) {
      setProducts((prev) =>
        prev.map((p) => {
          const retItem = returnedItems.find((it) => it.productId === p.id);
          if (!retItem || retItem.condition === 'damaged' || retItem.condition === 'expired') {
            return p;
          }
          const addCartons = retItem.cartonCount || 0;
          return {
            ...p,
            branchStockActual: p.branchStockActual + addCartons,
            branchStockReserved: p.branchStockReserved + addCartons,
          };
        })
      );

      // Record inventory transactions for each returned item
      returnedItems.forEach((retItem) => {
        if (retItem.condition !== 'damaged' && retItem.condition !== 'expired' && retItem.cartonCount > 0) {
          const prod = products.find((p) => p.id === retItem.productId);
          const currentStock = prod ? prod.branchStockActual : 0;
          recordInventoryTransaction({
            productId: retItem.productId,
            productCode: retItem.productCode,
            productName: retItem.productName,
            type: 'مرتجع مبيعات وإرجاع للمخزن',
            quantityPieces: retItem.cartonCount,
            branchStockBefore: currentStock,
            branchStockAfter: currentStock + retItem.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'مسؤول المرتجعات',
            userRole: currentUser?.role || 'branch_manager',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes: `مرتجع مبيعات (${retItem.cartonCount} كرتونة) - إذن #${returnVoucherNumber} - السبب: ${retItem.returnReason || reason}`,
          });
        }
      });
    }

    // 2. Adjust Customer Debt / Balance if applicable
    if (totalRefundAmount > 0 && inv.customerName) {
      setCustomers((prev) =>
        prev.map((c) => {
          const match = (inv.customerCode && c.code === inv.customerCode) || c.name === inv.customerName;
          if (!match) return c;
          const currentBal = c.currentBalance ?? c.balance ?? 0;
          const updatedBal = Math.max(0, currentBal - totalRefundAmount);
          return {
            ...c,
            currentBalance: updatedBal,
            balance: updatedBal,
          };
        })
      );
    }

    // 3. Determine if Full or Partial Return
    const existingRecords = inv.returnRecords || [];
    const updatedRecords = [...existingRecords, newReturnRecord];
    const prevRefunded = inv.totalRefundedAmount || 0;
    const allRefunded = prevRefunded + totalRefundAmount;

    // Check if entire order is returned
    const allReturnedCartonsCount = updatedRecords.reduce((s, r) => s + r.totalReturnedCartons, 0);
    const isFullReturn = allReturnedCartonsCount >= inv.totalCartons || allRefunded >= inv.estimatedGrandTotal;

    const newStatus: OrderStatus = isFullReturn ? 'مرتجع' : 'مرتجع جزئي';
    const netGrandTotal = Math.max(0, inv.estimatedGrandTotal - allRefunded);

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: newStatus,
          hasReturns: true,
          isPartialReturn: !isFullReturn,
          returnRecords: updatedRecords,
          totalRefundedAmount: allRefunded,
          netAmountAfterReturns: netGrandTotal,
          lastReturnDate: dateStr,
          restoredStockDetails: `تم استرجاع ${totalReturnedCartons} كرتونة بقيمة ${totalRefundAmount.toLocaleString()} ج.م (إذن #${returnVoucherNumber})`,
          notes: `${i.notes ? i.notes + ' | ' : ''}مرتجع ${isFullReturn ? 'كلي' : 'جزئي'} إذن #${returnVoucherNumber} بقيمة ${totalRefundAmount.toLocaleString()} ج.م (${reason})`,
        };
        saveInvoiceToSupabase(updated).catch((e) => console.warn('Supabase return sync failed:', e));
        return updated;
      })
    );

    // 4. Record Audit Log
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: inv.branchName,
      action: 'return_invoice',
      actionTitle: `تسجيل مرتجع مبيعات ${isFullReturn ? 'كلي' : 'جزئي'} للفاتورة #${inv.invoiceNumber}`,
      details: `إذن #${returnVoucherNumber} • الع��ي��: ${inv.customerName} • القيمة المسترجعة: ${totalRefundAmount.toLocaleString()} ج.م • الكراتين: ${totalReturnedCartons} • السبب: ${reason}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'warning',
    });

    return {
      success: true,
      message: `تم تسجيل إذن المرتجع #${returnVoucherNumber} بنجاح (${isFullReturn ? 'مرتجع كلي' : 'مرتجع جزئي'}) بقيمة ${totalRefundAmount.toLocaleString()} ج.م وتحديث المخزون وحساب العميل!`,
      returnRecord: newReturnRecord,
    };
  };

  const deleteInvoice = async (invoiceId: string): Promise<void> => {
    const target = invoices.find((inv) => inv.id === invoiceId || inv.invoiceNumber === invoiceId);
    const targetId = target?.id || invoiceId;
    const targetNumber = target?.invoiceNumber;

    // 1. Mark as permanently deleted in local persistent storage so it is never re-added
    markInvoiceAsDeletedInStorage(targetId, targetNumber);

    // 2. Remove immediately from local state
    setInvoices((prev) => prev.filter((inv) => inv.id !== targetId));

    // 3. Immediately persist updated invoices to IndexedDB and LocalStorage
    const remaining = invoices.filter((inv) => inv.id !== targetId);
    idbSet(STORAGE_KEYS.INVOICES, remaining).catch(() => {});
    safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify(remaining));

    // 4. Record Audit Log
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: target?.branchName || 'الفرع الرئيسي',
      action: 'delete_invoice',
      actionTitle: `حذف الفاتورة #${targetNumber || targetId} نهائياً`,
      details: `تم حذف الفاتورة نهائياً من قاعدة البيانات والسيرفر • العميل: ${target?.customerName || 'عام'} • القيمة: ${target?.estimatedGrandTotal?.toLocaleString() || 0} ج.م`,
      invoiceId: targetId,
      invoiceNumber: targetNumber,
      badgeType: 'danger',
    });

    // 5. Delete permanently from Supabase
    try {
      const remoteDelete = await deleteInvoiceFromSupabase(targetId, targetNumber);
      if (!remoteDelete.success) {
        throw new Error(remoteDelete.error || 'تعذر حذف الفاتورة من قاعدة البيانات');
      }
    } catch (e) {
      console.warn('Supabase invoice deletion failed:', e);
      throw e;
    }
  };

  const syncToAccounting = async (invoiceId: string): Promise<boolean> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return false;

    const newLog: AccountingSyncLog = {
      id: `sync-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      invoiceNumber: inv.invoiceNumber,
      status: 'نجاح',
      systemName: 'نظام الحسابات المركزي لشركة دريم (ERP System)',
      responseMessage: `تم تصدير القيد المحاسبي وحساب العميل والمخزون بنجاح رقم السند #${Math.floor(100000 + Math.random() * 900000)}`,
    };

    setAccountingLogs((prev) => [newLog, ...prev]);
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              syncedToAccounting: true,
              accountingSyncDate: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
            }
          : i
      )
    );
    return true;
  };

  const addUser = (user: User) => {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  if (hasDuplicateUserIdentity(user, users, user.id)) return;
    const nextUsers = [...users.filter((u) => u.id !== user.id), user];
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers);
    saveUsersToSupabase(nextUsers).catch((e) => console.warn('Supabase save user failed:', e));
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 50);
  };

  const updateUser = (updatedUser: User) => {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  if (hasDuplicateUserIdentity(updatedUser, users, updatedUser.id)) return;
    const nextUsers = users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers);
    if (currentUser?.id === updatedUser.id) {
      if (!updatedUser.isActive || updatedUser.approvalStatus === 'rejected') {
        logout();
        setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
        return;
      }
      setCurrentUser(updatedUser);
    }
    saveUsersToSupabase(nextUsers).catch((e) => console.warn('Supabase update user failed:', e));
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 50);
  };

  const updateCloudinarySettings = (config: CloudinaryConfig) => {
    setCloudinaryConfig(config);
  };

  const saveMatchedProductImages = (updates: { id: string; imageUrl: string }[]) => {
    setProducts((prev) => {
      const updateMap = new Map<string, string>();
      updates.forEach((u) => updateMap.set(u.id, u.imageUrl));

      const updated = prev.map((p) => {
        if (updateMap.has(p.id)) {
          return { ...p, imageUrl: updateMap.get(p.id) };
        }
        return p;
      });

      idbSet(STORAGE_KEYS.PRODUCTS, updated);
      safeLocalStorageSet(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
      saveProductsToSupabase(updated).catch((err) => {
        console.warn('Supabase image links sync warning:', err);
      });

      return updated;
    });
  };

  const clearAllAppData = (mode: 'cache_only' | 'full_reset' = 'cache_only') => {
    if (mode === 'full_reset') {
      try {
        localStorage.clear();
      } catch {}
      idbClear();
      setProducts([]);
      setInvoices([]);
      setUsers([]);
      setBranches(INITIAL_BRANCHES);
      setCloudinaryConfig(DEFAULT_CLOUDINARY_CONFIG);
      setCart([]);
      setAccountingLogs([]);
    } else {
      // Clear temporary items & memory caches
      setCart([]);
      try {
        localStorage.removeItem(STORAGE_KEYS.ACCOUNTING_LOGS);
        safeLocalStorageSet(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      } catch (e) {
        // Safe ignore
      }
    }
  };

  const wipeAllProductsAndData = async (options?: { wipeInvoices?: boolean }) => {
    setProducts([]);
    setCart([]);
    idbSet(STORAGE_KEYS.PRODUCTS, []);
    idbSet(STORAGE_KEYS.CART, []);
    safeLocalStorageSet(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    safeLocalStorageSet(STORAGE_KEYS.CART, JSON.stringify([]));

    if (options?.wipeInvoices) {
      const remoteDelete = await deleteAllInvoicesFromSupabase();
      if (!remoteDelete.success) {
        console.warn('Supabase invoice wipe warning:', remoteDelete.error);
      }
      setInvoices([]);
      idbSet(STORAGE_KEYS.INVOICES, []);
      safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify([]));
      safeLocalStorageSet(STORAGE_KEYS.DELETED_INVOICE_IDS, JSON.stringify([]));
    }

    try {
      await clearCachedImages();
    } catch (e) {}
  };

  // --- Role-Based Data Visibility (STRICT PRIVACY & BRANCH ISOLATION) ---
  const getVisibleInvoices = (): Invoice[] => {
    if (!currentUser) return [];

    // Admin & Developer: Full oversight, filtered by branch selector if selected
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return selectedBranchFilter === 'الكل'
        ? invoices
        : invoices.filter((i) => Boolean(i.branchName) && isBranchMatch(i.branchName, selectedBranchFilter, { allowUnassigned: false }));
    }

    // Branch Manager: STRICTLY sees ONLY invoices of his own branch
    if (currentUser.role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return invoices.filter((i) => Boolean(i.branchName) && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false }));
    }

    // Supervisor: STRICTLY sees ONLY invoices belonging to his branch and his supervised reps
    if (currentUser.role === 'supervisor') {
      if (!currentUser.branchName) return [];
      const repIds = new Set(
        users
          .filter((u) => u.role === 'sales_rep' && (u.supervisorId === currentUser.id || isBranchMatch(u.branchName, currentUser.branchName, { allowUnassigned: false })))
          .map((u) => u.id)
      );
  return invoices.filter((i) => {
    const isSameBranch = Boolean(i.branchName) && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false });
    const isSupervisedRep = Boolean(i.repId) && repIds.has(i.repId);
    const isSameRepName = Boolean(i.repName) && users.some(
      (u) => repIds.has(u.id) && normalizeArabicText(u.name) === normalizeArabicText(i.repName || '')
    );
    const isSelf = i.repId === currentUser.id || normalizeArabicText(i.repName) === normalizeArabicText(currentUser.name);
    // Legacy invoices may carry a stale/missing branch name. A supervised rep match
    // is authoritative so the invoice still reaches the supervisor.
    return isSameBranch || isSupervisedRep || isSameRepName || isSelf;
  });
    }

    // Sales Rep: STRICT PRIVACY - ONLY his own orders, NEVER another rep's orders!
    if (currentUser.role === 'sales_rep') {
      return invoices.filter((i) => {
        // 1. Direct Rep ID match (highest authority)
        const isDirectIdMatch = Boolean(i.repId) && (
          i.repId === currentUser.id ||
          Boolean(currentUser.username && i.repId.toLowerCase() === currentUser.username.toLowerCase())
        );

        // 2. Fallback: if repId is absent on legacy records, exact normalized name AND exact branch match
        const isDirectNameMatch = !i.repId && Boolean(i.repName) &&
          normalizeArabicText(i.repName) === normalizeArabicText(currentUser.name) &&
          Boolean(currentUser.branchName && i.branchName && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false }));

        if (!isDirectIdMatch && !isDirectNameMatch) return false;

        // Strict Branch Isolation: Rep cannot see invoices of another branch
        if (currentUser.branchName && i.branchName) {
          if (!isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false })) {
            return false;
          }
        }

        return true;
      });
    }

    return [];
  };

  const getVisibleCustomers = (): Customer[] => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return selectedBranchFilter === 'الكل'
        ? customers
        : customers.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranchFilter, { allowUnassigned: false }));
    }
    if (currentUser.role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return customers.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser.role === 'supervisor') {
      return customers.filter((c) => doesCustomerBelongToSupervisor(c, currentUser, users));
    }
    // Sales Rep: ONLY customers belonging directly to this rep
    return customers.filter((c) => doesCustomerBelongToRep(c, currentUser));
  };

  const getVisibleProducts = (): Product[] => {
    // The catalog is shared across roles; stock availability remains an optional UI filter.
    return products;
  };

  const getSupervisorsInBranch = (branchName?: string): User[] => {
    const targetBranch = branchName || currentUser?.branchName;
    return users.filter(
      u => u.role === 'supervisor' && u.approvalStatus === 'active' && (!targetBranch || u.branchName === targetBranch)
    );
  };

  const getSalesRepsForSupervisor = (supervisorId: string): User[] => {
    return users.filter(u => u.role === 'sales_rep' && u.supervisorId === supervisorId);
  };

  const loginAs = (userId: string) => {
    const found = users.find((u) => u.id === userId);
    if (found) {
      setCurrentUser(found);
      setIsAuthenticated(true);
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, found.id);
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(found));
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        users,
        branches,
        products,
        customers,
        invoices,
        cart,
        cloudinaryConfig,
        accountingLogs,
        inventoryLogs,
        auditLogs,
        recordAuditLog,
        clearAuditLogs,
        isOffline,
        selectedBranchFilter,
        setSelectedBranchFilter,
        refreshInvoicesNow,
        supabaseStatus,
        isSupabaseSyncing,
        syncWithSupabase,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        importCustomersList,
        cleanAndDeduplicateCustomers,
        refreshCustomerRepLinks,
        autoCreateMissingRepsFromCustomers,
        mergeDuplicateUsers,
        login,
        register,
        logout,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        getCartSummary,
        addProduct,
        updateProduct,
        deleteProduct,
        importProductsList,
        adjustStock,
        recordInventoryTransaction,
        checkProductAvailability,
        createOrder,
        approveOrder,
        forwardOrderToManager,
        rejectOrder,
        editPendingOrder,
        cancelPendingOrderByRep,
        updateOrderStatus,
        processOrderReturn,
        deleteInvoice,
        syncToAccounting,
        addUser,
        updateUser,
        deleteUser,
        approveUser,
        rejectUser,
        assignSupervisor,
        authTerminationNotice,
        clearAuthTerminationNotice,
        updateCloudinarySettings,
        saveMatchedProductImages,
        clearAllAppData,
        wipeAllProductsAndData,
        dataSaverMode,
        setDataSaverMode,
        toggleDataSaverMode,
        installPromptEvent,
        canInstallPwa,
        triggerInstallPrompt,
        isInstallModalOpen,
        setIsInstallModalOpen,
        companyInfo,
        branchCompanyInfo,
        updateCompanyInfo,
        resetCompanyInfo,
        updateBranchCompanyInfo,
        resetBranchCompanyInfo,
        getCompanyInfoForBranch,
        getVisibleInvoices,
        getVisibleCustomers,
        getVisibleProducts,
        getSupervisorsInBranch,
        getSalesRepsForSupervisor,
        loginAs,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
