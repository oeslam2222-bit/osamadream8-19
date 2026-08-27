import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_BRANCHES,
  INITIAL_CUSTOMERS,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_USERS
} from '../data/mockData';
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
} from '../services/arabicMatchingService';
import {
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
  Customer,
  InventoryTransaction,
  Invoice,
  OrderStatus,
  Product,
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
  refreshCustomerRepLinks: () => { updatedCount: number };

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
  updateOrderStatus: (invoiceId: string, status: OrderStatus, reason?: string) => { success: boolean; message: string };
  deleteInvoice: (invoiceId: string) => void;
  syncToAccounting: (invoiceId: string) => Promise<boolean>;

  // User Management & Approval Actions
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  deleteUser: (userId: string) => void;
  approveUser: (userId: string, supervisorId?: string, branchName?: string, role?: UserRole) => void;
  rejectUser: (userId: string) => void;
  assignSupervisor: (repId: string, supervisorId: string) => void;

  // Settings & App Extras
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
  IS_AUTH: 'dream_dist_is_auth_v9',
  ACCOUNTING_LOGS: 'dream_dist_acc_logs_v9',
  CART: 'dream_dist_cart_v9'
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

  // Initialize state with localStorage fallbacks
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!saved) return INITIAL_USERS;
    try {
      const parsed: User[] = JSON.parse(saved);
      const filtered = parsed
        .filter((u) => u.id !== 'u-branch-ashraf' && u.id !== 'u-sup-mahmoud' && u.id !== 'u-rep-ahmed')
        .map((u) => ({
          ...u,
          name: u.id === 'u-admin-osama' ? 'أسامة إسلام (المطور التقني)' : u.name,
          branchName: normalizeBranchName(u.branchName),
          role: u.role === 'developer' || u.role === 'admin' || u.role === 'branch_manager' || u.role === 'supervisor' || u.role === 'sales_rep' ? u.role : 'sales_rep',
        }));
      return filtered.length > 0 ? filtered : INITIAL_USERS;
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
    const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    const isAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTH);
    if (savedUserId && isAuth === 'true') {
      const found = users.find(u => u.id === savedUserId);
      if (found) return found;
    }
    // Default to admin or sales rep if already saved
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.IS_AUTH) === 'true';
  });

  const sanitizeProducts = (list: Product[]): Product[] => {
    return list.map((p) => {
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

    for (const c of list) {
      if (!c) continue;
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

      // Check if location or name contains clear district keywords (e.g. بني مزار -> فرع المنيا)
      const locInferred = inferBranchFromText(
        `${c.address || ''} ${c.governorate || ''} ${c.name || ''} ${c.notes || ''} ${c.branchName || ''}`
      );
      const resolvedBranch = locInferred || normalizeBranchName(c.branchName || 'الفرع الرئيسي');

      const existing = map.get(key);
      if (existing) {
        // Merge attributes to keep the best data
        if (!existing.phone && c.phone) existing.phone = c.phone;
        if (!existing.address && c.address) existing.address = c.address;
        if (!existing.taxNumber && c.taxNumber) existing.taxNumber = c.taxNumber;
        if (!existing.notes && c.notes) existing.notes = c.notes;
        if (locInferred) existing.branchName = locInferred;
        if (c.repName && (!existing.repName || existing.repName === 'مندوب المبيعات')) existing.repName = c.repName;
        if (c.tier === 'مميز' || (c.tier === 'راقي' && existing.tier === 'متوسط')) {
          existing.tier = c.tier;
        }
      } else {
        map.set(key, {
          ...c,
          name: c.name || `عميل ${c.code || ''}`,
          branchName: resolvedBranch,
        });
      }
    }

    return Array.from(map.values());
  };

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    try {
      const raw = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
      return sanitizeProducts(raw);
    } catch {
      return sanitizeProducts(INITIAL_PRODUCTS);
    }
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    try {
      const raw = saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
      return sanitizeCustomers(raw);
    } catch {
      return INITIAL_CUSTOMERS;
    }
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.INVOICES);
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });

  const [cart, setCart] = useState<CartItem[]>([]);

  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CLOUDINARY);
    return saved ? JSON.parse(saved) : DEFAULT_CLOUDINARY_CONFIG;
  });

  const [accountingLogs, setAccountingLogs] = useState<AccountingSyncLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACCOUNTING_LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [inventoryLogs, setInventoryLogs] = useState<InventoryTransaction[]>(() => {
    const saved = localStorage.getItem('dream_dist_inv_logs_v5');
    return saved ? JSON.parse(saved) : [];
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('dream_dist_audit_logs_v7');
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  useEffect(() => {
    idbSet('dream_dist_audit_logs_v7', auditLogs);
    safeLocalStorageSet('dream_dist_audit_logs_v7', JSON.stringify(auditLogs));
  }, [auditLogs]);

  const recordAuditLog = (logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>) => {
    const now = new Date();
    const formattedTime = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`;
    const newLog: AuditLog = {
      ...logData,
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now.toISOString(),
      formattedTime,
    };
    setAuditLogs((prev) => [newLog, ...prev].slice(0, 800));
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    localStorage.removeItem('dream_dist_audit_logs_v7');
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
        // Clean up legacy large keys from localStorage to prevent quota overflow
        try {
          localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
          localStorage.removeItem(STORAGE_KEYS.INVOICES);
          localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
        } catch {
          // ignore
        }

        const [idbProducts, idbInvoices, idbCustomers, idbUsers] = await Promise.all([
          idbGet<Product[]>(STORAGE_KEYS.PRODUCTS),
          idbGet<Invoice[]>(STORAGE_KEYS.INVOICES),
          idbGet<Customer[]>(STORAGE_KEYS.CUSTOMERS),
          idbGet<User[]>(STORAGE_KEYS.USERS),
        ]);

        if (!isMounted) return;

        if (idbProducts && Array.isArray(idbProducts) && idbProducts.length > 0) {
          setProducts(sanitizeProducts(idbProducts));
        }
        if (idbInvoices && Array.isArray(idbInvoices) && idbInvoices.length > 0) {
          setInvoices(idbInvoices);
        }
        if (idbCustomers && Array.isArray(idbCustomers) && idbCustomers.length > 0) {
          setCustomers(sanitizeCustomers(idbCustomers));
        }
        if (idbUsers && Array.isArray(idbUsers) && idbUsers.length > 0) {
          setUsers((prev) => {
            const map = new Map<string, User>();
            prev.forEach((u) => map.set(u.id, u));
            idbUsers.forEach((u) => map.set(u.id, u));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('IndexedDB initial hydration notice:', err);
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
          setUsers((prev) => {
            const mergedMap = new Map<string, User>();
            prev.forEach((u) => mergedMap.set(u.id, u));
            prev.forEach((u) => mergedMap.set(u.username.toLowerCase(), u));
            fetchRes.users!.forEach((su) => {
              mergedMap.set(su.id, su);
              mergedMap.set(su.username.toLowerCase(), su);
            });
            return Array.from(new Set(mergedMap.values()));
          });
        }

        const invRes = await fetchInvoicesFromSupabase();
        if (invRes.success && invRes.invoices && invRes.invoices.length > 0) {
          fetchedInvoicesCount = invRes.invoices.length;
          setInvoices((prev) => {
            const invMap = new Map<string, Invoice>();
            prev.forEach((i) => invMap.set(i.id, i));
            prev.forEach((i) => invMap.set(i.invoiceNumber, i));
            invRes.invoices!.forEach((si) => {
              invMap.set(si.id, si);
              invMap.set(si.invoiceNumber, si);
            });
            return Array.from(new Set(invMap.values()));
          });
        }
      }

      // 3. Push local users, invoices, and products to Supabase if requested
      if (direction === 'push' || direction === 'both') {
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
    // 0. Load offline items from IndexedDB if present
    idbGet<Product[]>(STORAGE_KEYS.PRODUCTS).then((idbProducts) => {
      if (idbProducts && idbProducts.length > 0) {
        setProducts((prev) => {
          if (prev.length <= INITIAL_PRODUCTS.length) {
            return sanitizeProducts(idbProducts);
          }
          return prev;
        });
      }
    });

    idbGet<Customer[]>(STORAGE_KEYS.CUSTOMERS).then((idbCustomers) => {
      if (idbCustomers && idbCustomers.length > 0) {
        setCustomers(idbCustomers);
      }
    });

    idbGet<Invoice[]>(STORAGE_KEYS.INVOICES).then((idbInvoices) => {
      if (idbInvoices && idbInvoices.length > 0) {
        setInvoices(idbInvoices);
      }
    });

    testSupabaseConnection().then((status) => {
      setSupabaseStatus(status);
      if (status.connected) {
        // 1. Fetch Users
        fetchUsersFromSupabase().then((res) => {
          if (res.success && res.users && res.users.length > 0) {
            setUsers((prev) => {
              const map = new Map<string, User>();
              prev.forEach((u) => map.set(u.id, u));
              res.users!.forEach((su) => map.set(su.id, su));
              return Array.from(map.values());
            });
          }
        });

        // 2. Fetch Central Catalog from Supabase (Propagates Admin/Developer uploads to all reps and supervisors)
        fetchProductsFromSupabase().then((res) => {
          if (res.success && res.products && res.products.length > 0) {
            setProducts((prev) => {
              // Merge remote products while preserving local reserved counts
              const localMap = new Map<string, Product>();
              prev.forEach((p) => localMap.set(p.id, p));
              const merged = res.products!.map((remoteP) => {
                const localP = localMap.get(remoteP.id);
                if (!localP) return remoteP;
                return {
                  ...remoteP,
                  branchStockReserved: localP.branchStockReserved < remoteP.branchStockActual ? localP.branchStockReserved : remoteP.branchStockActual,
                  mainWarehouseReserved: localP.mainWarehouseReserved < remoteP.mainWarehouseActual ? localP.mainWarehouseReserved : remoteP.mainWarehouseActual,
                };
              });
              return sanitizeProducts(merged);
            });
          }
        });

        // 3. Fetch Invoices
        fetchInvoicesFromSupabase().then((res) => {
          if (res.success && res.invoices && res.invoices.length > 0) {
            setInvoices((prev) => {
              const map = new Map<string, Invoice>();
              prev.forEach((i) => map.set(i.id, i));
              res.invoices!.forEach((si) => map.set(si.id, si));
              return Array.from(map.values());
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
                return Array.from(map.values());
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
            } else if (raw && raw.id === '00000000-0000-0000-0000-000000000002' && raw.items) {
              const remoteUsers: User[] = Array.isArray(raw.items)
                ? raw.items
                : typeof raw.items === 'string'
                ? JSON.parse(raw.items)
                : [];
              if (remoteUsers.length > 0) {
                setUsers((prev) => {
                  const map = new Map<string, User>();
                  prev.forEach((u) => map.set(u.id, u));
                  remoteUsers.forEach((u) => map.set(u.id, u));
                  return Array.from(map.values());
                });
              }
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
    if (!userList || userList.length === 0) return list;

    const reps = userList.filter((u) => u.role === 'sales_rep' || u.role === 'supervisor' || u.role === 'branch_manager');

    return list.map((c) => {
      let updated = { ...c };

      // Ensure branch is properly determined from location / address / name if available
      const locInferred = inferBranchFromText(
        `${updated.address || ''} ${updated.governorate || ''} ${updated.name || ''} ${updated.notes || ''}`
      );
      if (locInferred) {
        updated.branchName = locInferred;
      } else if (updated.branchName) {
        updated.branchName = normalizeBranchName(updated.branchName);
      }

      const rawRep = (updated.salesRepName || updated.repName || '').trim();
      if ((!rawRep || rawRep === 'مندوب المبيعات' || rawRep === 'المندوب') && !updated.repId) {
        return updated;
      }

      // Check if candidate matches rep in same branch, or overall
      const matchFn = (u: User) =>
        (updated.repId && u.id === updated.repId) ||
        isArabicNameMatch(rawRep, u.name) ||
        (u.username && isArabicNameMatch(rawRep, u.username)) ||
        (u.phone && (rawRep.includes(u.phone) || u.phone.includes(rawRep))) ||
        normalizeArabicText(rawRep).includes(normalizeArabicText(u.name)) ||
        normalizeArabicText(u.name).includes(normalizeArabicText(rawRep));

      const branchCompatibleReps = updated.branchName
        ? reps.filter((u) => u.branchName && isBranchMatch(updated.branchName, u.branchName, { allowUnassigned: false }))
        : [];

      let matched = branchCompatibleReps.find(matchFn);
      if (!matched) {
        matched = reps.find(matchFn);
      }

      if (matched) {
        return {
          ...updated,
          repName: matched.name,
          repId: matched.id,
          salesRepName: matched.name,
          branchName: matched.branchName || updated.branchName || 'الفرع الرئيسي',
        };
      }
      return updated;
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

  const refreshCustomerRepLinks = (): { updatedCount: number } => {
    let updatedCount = 0;
    setCustomers((prev) => {
      const linked = linkCustomersToUsers(prev, users);
      updatedCount = linked.filter(
        (c, i) => c.repId !== prev[i]?.repId || c.branchName !== prev[i]?.branchName || c.salesRepName !== prev[i]?.salesRepName
      ).length;
      saveCustomersToSupabase(linked).catch(() => {});
      return linked;
    });
    return { updatedCount };
  };

  // Auto-link customers to users when user list changes (e.g. after Supabase fetch)
  useEffect(() => {
    if (users.length === 0 || customers.length === 0) return;
    setCustomers((prev) => {
      const linked = linkCustomersToUsers(prev, users);
      const changed = linked.some(
        (c, i) => c.repId !== prev[i]?.repId || c.branchName !== prev[i]?.branchName || c.salesRepName !== prev[i]?.salesRepName
      );
      if (!changed) return prev;
      saveCustomersToSupabase(linked).catch(() => {});
      return linked;
    });
  }, [users]);

  // Sync high-capacity data directly to IndexedDB (preventing LocalStorage quota overflow)
  useEffect(() => {
    idbSet(STORAGE_KEYS.PRODUCTS, products);
  }, [products]);

  useEffect(() => {
    idbSet(STORAGE_KEYS.CUSTOMERS, customers);
  }, [customers]);

  useEffect(() => {
    idbSet(STORAGE_KEYS.INVOICES, invoices);
  }, [invoices]);

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
    safeLocalStorageSet('dream_dist_inv_logs_v5', JSON.stringify(inventoryLogs));
  }, [inventoryLogs]);

  useEffect(() => {
    if (currentUser && isAuthenticated) {
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      safeLocalStorageSet(STORAGE_KEYS.IS_AUTH, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      safeLocalStorageSet(STORAGE_KEYS.IS_AUTH, 'false');
    }
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
        return { success: false, message: 'كلمة المرور غير صحي��ة. يرجى التأكد من كتابة كل��ة المرور بدقة.' };
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

    if (existing) {
      return { success: false, message: 'البريد الإلكتروني أو اسم المستخدم مسجل بالفعل.' };
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
  };

  const deleteUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    deleteUserFromSupabase(userId).catch((e) => console.warn('Supabase delete user failed:', e));
  };

  const assignSupervisor = (repId: string, supervisorId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === repId ? { ...u, supervisorId } : u))
    );
  };

  // --- Inventory & Stock Real-time Audit Helper ---
  const recordInventoryTransaction = (tx: Omit<InventoryTransaction, 'id' | 'timestamp' | 'date'>) => {
    const now = new Date();
    const newTx: InventoryTransaction = {
      ...tx,
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      date: now.toISOString().slice(0, 10),
    };
    setInventoryLogs((prev) => [newTx, ...prev]);
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
          reservedPiecesByProduct.set(item.productId, current + item.totalUnits);
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

    const getProductVariantKey = (p: Product): string => {
      const cCode = (p.code || '').trim().toLowerCase();
      const cColor = (p.color || '').trim().toLowerCase();
      const cSize = (p.size || '').trim().toLowerCase();
      const cBranch = (p.branchName || '').trim().toLowerCase();
      const cImg = (p.imageUrl || '').trim();
      const cName = (p.name || '').trim().toLowerCase();
      return `${cCode}:::${cColor}:::${cSize}:::${cBranch}:::${cImg || cName}`;
    };

    let finalUpdated: Product[] = [];
    if (mode === 'replace') {
      finalUpdated = sanitizeProducts(newProducts.map(protectReserved));
      setProducts(finalUpdated);
    } else {
      // Merge mode: Preserve all imported rows without collapsing identical codes
      const idMap = new Map<string, Product>();
      products.forEach((p) => idMap.set(p.id, p));
      newProducts.forEach((p) => {
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
      return { success: false, message: 'سلة الطلبية ف��رغة! يرجى إضافة أصناف أولاً.' };
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
    const orderBranch = orderData.branchName || currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';

    const primaryInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber,
      customerName: orderData.customerName || 'عميل تجزئة عام',
      customerCode: orderData.customerCode || undefined,
      customerPhone: orderData.customerPhone || '',
      customerAddress: orderData.customerAddress || '',
      customerTaxNumber: orderData.customerTaxNumber || '',
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
      qrPayload: `DREAM-EINV-${newInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${primaryTotals.estimatedGrandTotal.toFixed(2)}|${primaryTotals.taxAmount.toFixed(2)}|${formattedDate}`,
    };

    let createdShortageInvoice: Invoice | undefined = undefined;

    if (shouldSplit && shortageCartItems.length > 0) {
      const shortageItems = buildInvoiceItems(shortageCartItems);
      const shortageTotals = calculateTotals(shortageItems);
      const shortageInvoiceNumber = `${newInvoiceNumber}-NQ`;

      createdShortageInvoice = {
        id: `inv-${Date.now() + 1}`,
        invoiceNumber: shortageInvoiceNumber,
        customerName: orderData.customerName || 'عميل تجزئة عام',
        customerPhone: orderData.customerPhone || '',
        customerAddress: orderData.customerAddress || '',
        customerTaxNumber: orderData.customerTaxNumber || '',
        date: formattedDate,
        time: formattedTime,
        repId: currentUser ? currentUser.id : 'u-admin-1',
        repName: currentUser ? currentUser.name : 'أسامة إسلام (المطور التقني)',
        supervisorName: userSupervisor,
        branchName: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
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
        notes: `��اتورة تحويل نواقص تابعة للفاتورة الأساسية #${newInvoiceNumber}`,
        syncedToAccounting: false,
        isShortageInvoice: true,
        parentInvoiceId: primaryInvoice.id,
        parentInvoiceNumber: primaryInvoice.invoiceNumber,
        qrPayload: `DREAM-EINV-${shortageInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${shortageTotals.estimatedGrandTotal.toFixed(2)}|${shortageTotals.taxAmount.toFixed(2)}|${formattedDate}`,
      };
    }

    // A sales rep submission must not reserve, transfer, or deduct stock.
    // Stock is changed only when an authorized supervisor/manager approves the order.
    if (isDirectManager) {
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
    }

    // Only authorized approval actions create inventory audit movements.
    if (isDirectManager) cart.forEach((item) => {
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
          : `حجز رصيد للطلبية #${newInvoiceNumber} قيد مراجعة واعتماد المشرف`,
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
    saveInvoiceToSupabase(primaryInvoice).catch((e) => console.warn('Supabase invoice save failed:', e));
    if (createdShortageInvoice) {
      saveInvoiceToSupabase(createdShortageInvoice).catch((e) => console.warn('Supabase shortage invoice save failed:', e));
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
    if (inv.status === 'معتمدة ومصروفة من المخزن') {
      return { success: false, message: 'الطلبية معتمدة ومصروفة بالفعل' };
    }

  // Deduct physical stock only after the supervisor explicitly clicks approve & dispatch:
  // branch first, then central warehouse. Drafts and pending orders never deduct stock.
  // If one item cannot be fulfilled, this manual approval is rejected before any state changes.
    const allocations = new Map<string, { branch: number; main: number }>();
    for (const invItem of inv.items) {
      const product = products.find((p) => p.id === invItem.productId);
      if (!product) return { success: false, message: `الصنف (${invItem.productName}) غير موجود في المخزون` };
      const requested = Math.max(0, invItem.cartonCount || 0);
      const branchAvailable = Math.max(0, product.branchStockActual);
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
      return {
        ...p,
        branchStockActual: Math.max(0, p.branchStockActual - allocation.branch),
        branchStockReserved: Math.max(0, p.branchStockReserved - allocation.branch),
        mainWarehouseActual: Math.max(0, p.mainWarehouseActual - allocation.main),
        mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - allocation.main),
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
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    if (inv.status === 'مرفوضة / ملغاة') {
      return { success: false, message: 'الطلبية ملغاة بالفعل' };
    }

    // Restore reserved stock back to available stock (in Cartons)
    setProducts((prev) => {
      return prev.map((p) => {
        const invItem = inv.items.find((it) => it.productId === p.id);
        if (!invItem) return p;
        return {
          ...p,
          branchStockReserved: p.branchStockReserved + invItem.cartonCount,
        };
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

  const updateOrderStatus = (
    invoiceId: string,
    status: OrderStatus,
    reason?: string
  ): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };

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
              return {
                ...p,
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

  const deleteInvoice = (invoiceId: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
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
    setUsers((prev) => [...prev, user]);
    saveUserToSupabase(user).catch((e) => console.warn('Supabase save user failed:', e));
  };

  const updateUser = (updatedUser: User) => {
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
    saveUserToSupabase(updatedUser).catch((e) => console.warn('Supabase update user failed:', e));
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

      return updated;
    });
  };

  const clearAllAppData = (mode: 'cache_only' | 'full_reset' = 'cache_only') => {
    if (mode === 'full_reset') {
      try {
        localStorage.clear();
      } catch {}
      idbClear();
      setProducts(INITIAL_PRODUCTS);
      setInvoices(INITIAL_INVOICES);
      setUsers(INITIAL_USERS);
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
      setInvoices([]);
      idbSet(STORAGE_KEYS.INVOICES, []);
      safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify([]));
    }

    try {
      await clearCachedImages();
    } catch (e) {}
  };

  // --- Role-Based Data Visibility (STRICT PRIVACY) ---
  const getVisibleInvoices = (): Invoice[] => {
    if (!currentUser) return [];

    // Admin & Developer see all invoices across all branches (or filtered by selected branch)
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      if (selectedBranchFilter !== 'الكل') {
        return invoices.filter(i => i.branchName === selectedBranchFilter);
      }
      return invoices;
    }

    // Branch Manager sees all invoices of their specific branch
    if (currentUser.role === 'branch_manager') {
      return invoices.filter(i => i.branchName === currentUser.branchName);
    }

    // Supervisor sees invoices of reps in their branch or assigned directly to them
    if (currentUser.role === 'supervisor') {
      const supervisedReps = users.filter(
        (u) =>
          u.supervisorId === currentUser.id ||
          (u.role === 'sales_rep' && isBranchMatch(u.branchName, currentUser.branchName))
      );
      const repIds = new Set(supervisedReps.map((u) => u.id));
      repIds.add(currentUser.id);

      return invoices.filter((i) => {
        if (!isBranchMatch(i.branchName, currentUser.branchName)) return false;
        if (i.repId && repIds.has(i.repId)) return true;
        if (i.supervisorName && isArabicNameMatch(i.supervisorName, currentUser.name)) return true;
        if (i.repName && isArabicNameMatch(i.repName, currentUser.name)) return true;
        return supervisedReps.some((r) => isArabicNameMatch(i.repName, r.name));
      });
    }

    // Sales Rep: STRICT PRIVACY - ONLY his own invoices
    return invoices.filter(
      (i) =>
        i.repId === currentUser.id ||
        isArabicNameMatch(i.repName, currentUser.name) ||
        (currentUser.username && isArabicNameMatch(i.repName, currentUser.username))
    );
  };

  const getVisibleCustomers = (): Customer[] => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin' || currentUser.role === 'developer') return customers;

    if (currentUser.role === 'branch_manager') {
      return customers.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName));
    }

    if (currentUser.role === 'supervisor') {
      return customers.filter((c) => doesCustomerBelongToSupervisor(c, currentUser, users));
    }

    // Sales Rep: STRICT PRIVACY - ONLY his own customers in his branch
    return customers.filter((c) => doesCustomerBelongToRep(c, currentUser));
  };

  const getVisibleProducts = (): Product[] => {
    if (!currentUser) return products;

    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      if (selectedBranchFilter !== 'الكل') {
        return products.filter(
          (p) =>
            getBranchStockForProduct(p, selectedBranchFilter) > 0 ||
            p.mainWarehouseActual > 0 ||
            (!p.branchName && (p.branchStockActual || 0) > 0)
        );
      }
      return products;
    }

    // Reps, Supervisors & Branch managers: products available in their branch or available from central warehouse
    const targetBranch = currentUser.branchName;
    return products.filter(
      (p) =>
        getBranchStockForProduct(p, targetBranch) > 0 ||
        p.mainWarehouseActual > 0 ||
        (!p.branchName && (p.branchStockActual || 0) > 0)
    );
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
        supabaseStatus,
        isSupabaseSyncing,
        syncWithSupabase,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        importCustomersList,
        cleanAndDeduplicateCustomers,
        refreshCustomerRepLinks,
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
        updateOrderStatus,
        deleteInvoice,
        syncToAccounting,
        addUser,
        updateUser,
        deleteUser,
        approveUser,
        rejectUser,
        assignSupervisor,
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
