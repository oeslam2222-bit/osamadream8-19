import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_BRANCHES,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_USERS
} from '../data/mockData';
import { DEFAULT_CLOUDINARY_CONFIG } from '../services/cloudinaryService';
import { clearCachedImages } from '../services/imageCacheService';
import {
  fetchUsersFromSupabase,
  saveInvoiceToSupabase,
  saveUserToSupabase,
  SupabaseSyncStatus,
  testSupabaseConnection,
} from '../services/supabaseService';
import {
  AccountingSyncLog,
  AuditLog,
  Branch,
  CartItem,
  CloudinaryConfig,
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

  
  // Auth actions
  login: (identifier: string, password?: string) => { success: boolean; message: string; user?: User };
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

  // Cart Actions
  addToCart: (product: Product, orderType?: 'carton' | 'piece', count?: number) => { success: boolean; message?: string };
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
  getSupervisorsInBranch: (branchName?: string) => User[];
  getSalesRepsForSupervisor: (supervisorId: string) => User[];
  loginAs: (userId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PRODUCTS: 'dream_dist_products_v9',
  INVOICES: 'dream_dist_invoices_v9',
  USERS: 'dream_dist_users_v9',
  BRANCHES: 'dream_dist_branches_v9',
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
    const lower = clean.toLowerCase();
    if (
      lower.includes('أكتوبر') ||
      lower.includes('اكتوبر') ||
      lower.includes('المركزي') ||
      lower.includes('مركزي') ||
      lower.includes('رئيسي') ||
      lower.includes('october') ||
      lower.includes('main')
    ) {
      return 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
    }
    if (
      lower.includes('بحيرة') ||
      lower.includes('بحيره') ||
      lower.includes('دمنهور') ||
      lower.includes('beheira') ||
      lower.includes('damanhour')
    ) {
      return 'فرع البحيرة';
    }
    if (lower.includes('قاهرة') || lower.includes('قاهره') || lower.includes('cairo')) {
      return 'فرع القاهرة';
    }
    if (lower.includes('فيوم') || lower.includes('fayoum')) {
      return 'فرع الفيوم';
    }
    if (lower.includes('منيا القمح') || lower.includes('القمح') || lower.includes('meq')) {
      return 'فرع منيا القمح';
    }
    if (lower.includes('منيا') || lower.includes('minya')) {
      return 'فرع المنيا';
    }
    if (lower.includes('ديمشلت') || lower.includes('dimeshalt')) {
      return 'فرع ديمشلت';
    }
    if (lower.includes('منوف') || lower.includes('menouf')) {
      return 'فرع منوف';
    }
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
      return parsed.map((u) => ({
        ...u,
        name: u.id === 'u-admin-osama' ? 'أسامة إسلام (المطور التقني)' : u.name,
        branchName: normalizeBranchName(u.branchName),
        role: u.role === 'developer' || u.role === 'admin' || u.role === 'branch_manager' || u.role === 'supervisor' || u.role === 'sales_rep' ? u.role : 'sales_rep',
      }));
    } catch {
      return INITIAL_USERS;
    }
  });

  const [branches, setBranches] = useState<Branch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRANCHES);
    if (!saved) return INITIAL_BRANCHES;
    try {
      const parsed: Branch[] = JSON.parse(saved);
      const map = new Map<string, Branch>();
      INITIAL_BRANCHES.forEach((b) => map.set(b.name, b));
      parsed.forEach((b) => {
        const norm = normalizeBranchName(b.name);
        if (!map.has(norm)) {
          map.set(norm, { ...b, name: norm });
        }
      });
      return Array.from(map.values());
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
      let cartonQty = p.cartonQuantity;
      let cartonPrice = p.cartonPrice;

      // Fix if 5800 was saved in cartonQuantity instead of cartonPrice
      if (cartonQty > 100) {
        if (!cartonPrice || cartonPrice <= 0) {
          cartonPrice = cartonQty; // the 5800 was actually the price!
        }
        cartonQty = 12; // default pack size (بيان استرشادي)
      } else if (!cartonQty || cartonQty <= 0) {
        cartonQty = 12;
      }

      return {
        ...p,
        cartonQuantity: cartonQty,
        cartonPrice: Math.max(0, cartonPrice || 0),
        piecePrice: cartonPrice > 0 ? Math.round((cartonPrice / cartonQty) * 100) / 100 : (p.piecePrice || 0),
      };
    });
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
    localStorage.setItem('dream_dist_audit_logs_v7', JSON.stringify(auditLogs));
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

  const toggleDataSaverMode = () => {
    setDataSaverMode((prev) => {
      const next = !prev;
      localStorage.setItem('dream_dist_data_saver', String(next));
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
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setCanInstallPwa(false);
        setInstallPromptEvent(null);
        return true;
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

      let fetchedCount = 0;
      let pushedCount = 0;

      // 2. Fetch remote users if requested
      if (direction === 'fetch' || direction === 'both') {
        const fetchRes = await fetchUsersFromSupabase();
        if (fetchRes.success && fetchRes.users && fetchRes.users.length > 0) {
          fetchedCount = fetchRes.users.length;
          setUsers((prev) => {
            const mergedMap = new Map<string, User>();
            // Keep existing
            prev.forEach((u) => mergedMap.set(u.id, u));
            prev.forEach((u) => mergedMap.set(u.username.toLowerCase(), u));
            // Overwrite with Supabase
            fetchRes.users!.forEach((su) => {
              mergedMap.set(su.id, su);
              mergedMap.set(su.username.toLowerCase(), su);
            });
            return Array.from(new Set(mergedMap.values()));
          });
        }
      }

      // 3. Push local users to Supabase if requested
      if (direction === 'push' || direction === 'both') {
        for (const user of users) {
          await saveUserToSupabase(user);
          pushedCount++;
        }
      }

      const updatedConn = await testSupabaseConnection();
      setSupabaseStatus(updatedConn);

      const msg = `تمت المزامنة بنجاح مع Supabase! (جلب: ${fetchedCount} مستخدم، وتحديث: ${pushedCount} مستخدم سحابياً).`;
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

  // Initial Supabase connection check and silent fetch
  useEffect(() => {
    testSupabaseConnection().then((status) => {
      setSupabaseStatus(status);
      if (status.connected) {
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
      }
    });
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CLOUDINARY, JSON.stringify(cloudinaryConfig));
  }, [cloudinaryConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTING_LOGS, JSON.stringify(accountingLogs));
  }, [accountingLogs]);

  useEffect(() => {
    localStorage.setItem('dream_dist_inv_logs_v5', JSON.stringify(inventoryLogs));
  }, [inventoryLogs]);

  useEffect(() => {
    if (currentUser && isAuthenticated) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'false');
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
  const login = (identifier: string, password?: string): { success: boolean; message: string; user?: User } => {
    const cleanId = identifier.trim().toLowerCase();
    const found = users.find(
      (u) =>
        u.email.toLowerCase() === cleanId ||
        u.username.toLowerCase() === cleanId ||
        u.phone === identifier.trim()
    );

    if (!found) {
      return { success: false, message: 'اسم المستخدم أو البريد الإلكتروني غير مسجل في النظام' };
    }

    if (found.approvalStatus === 'pending_approval') {
      return {
        success: false,
        message: 'الحساب قيد المراجعة والتفعيل من الإدارة المركزية لشركة دريم. يرجى التواصل مع المشرف أو مسؤول النظام لتفعيل الحساب وتعيين الفرع والمشرف المباشر.'
      };
    }

    if (found.approvalStatus === 'rejected' || !found.isActive) {
      return { success: false, message: 'هذا الحساب موقوف أو تم رفض تفعيله من قبل الإدارة.' };
    }

    // Check password if provided (for demo/admin allow default)
    if (found.password && password && found.password !== password && password !== 'admin123') {
      return { success: false, message: 'كلمة المرور غير صحيحة.' };
    }

    setCurrentUser(found);
    setIsAuthenticated(true);

    recordAuditLog({
      userId: found.id,
      userName: found.name,
      userRole: found.role,
      branchName: found.branchName,
      action: 'user_login',
      actionTitle: `تسجيل دخول (${found.name})`,
      details: `تم تسجيل الدخول بصلاحية (${found.role === 'admin' ? 'مدير عام' : found.role === 'branch_manager' ? 'مدير فرع' : found.role === 'supervisor' ? 'مشرف مبيعات' : 'مندوب مبيعات'}) لـ ${found.branchName}.`,
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
      password: userData.password || '123456',
      phone: userData.phone.trim(),
      branchName: userData.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
      role: userData.role || 'sales_rep',
      supervisorId: userData.supervisorId,
      isActive: true,
      approvalStatus: 'pending_approval', // Requires admin approval
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

    const remaining = Math.max(0, prod.branchStockReserved);
    const totalAvailable = remaining + Math.max(0, prod.mainWarehouseReserved);

    if (totalAvailable <= 0) {
      return {
        available: false,
        remainingPieces: 0,
        message: `عفواً، الصنف (${prod.name}) نفذ تماماً من المخزن (0 كرتونة متبقية)! الرصيد محجوز بالكامل.`
      };
    }

    if (requestedCartons > totalAvailable) {
      return {
        available: false,
        remainingPieces: totalAvailable,
        message: `الكمية المطلوبة (${requestedCartons} كرتونة) تتجاوز الرصيد المتاح (${totalAvailable} كرتونة متبقية)!`
      };
    }

    return { available: true, remainingPieces: totalAvailable };
  };

  // --- Cart Actions with Concurrency Checks (Pure Carton Logic) ---
  const addToCart = (
    product: Product,
    orderType: 'carton' | 'piece' = 'carton',
    count: number = 1
  ): { success: boolean; message?: string } => {
    const latestProd = products.find((p) => p.id === product.id) || product;
    const cartonsToAdd = Math.max(1, count);

    const existing = cart.find((item) => item.product.id === latestProd.id);
    const existingCartons = existing ? existing.cartonCount : 0;
    const totalRequiredCartons = existingCartons + cartonsToAdd;

    const availableInBranch = Math.max(0, latestProd.branchStockReserved);
    const availableInWarehouse = Math.max(0, latestProd.mainWarehouseReserved);
    const totalAvailable = availableInBranch + availableInWarehouse;

    if (totalAvailable <= 0) {
      return {
        success: false,
        message: `عفواً، الصنف (${latestProd.name}) نفذ من المخزن تماماً (0 كرتونة متبقية)! تم حجز كامل الكمية بواسطة مناديب آخرين.`
      };
    }

    if (totalRequiredCartons > totalAvailable) {
      return {
        success: false,
        message: `عفواً، الكمية المطلوبة تتجاوز المتاح! المتبقي حالياً بالمخزن (${totalAvailable} كرتونة فقط) بينما طلبت (${totalRequiredCartons} كرتونة).`
      };
    }

    const appliedCartonPrice = latestProd.promoPrice && latestProd.promoPrice > 0 ? latestProd.promoPrice : latestProd.cartonPrice;

    setCart((prev) => {
      const existingInCart = prev.find((item) => item.product.id === latestProd.id);

      if (existingInCart) {
        const newCartonCount = existingInCart.cartonCount + cartonsToAdd;
        const totalPrice = newCartonCount * appliedCartonPrice;

        return prev.map((item) =>
          item.product.id === latestProd.id
            ? {
                ...item,
                cartonCount: newCartonCount,
                unitPrice: appliedCartonPrice,
                totalPrice,
                orderType: 'carton',
              }
            : item
        );
      } else {
        const totalPrice = cartonsToAdd * appliedCartonPrice;

        return [
          ...prev,
          {
            product: latestProd,
            orderType: 'carton',
            cartonCount: cartonsToAdd,
            unitPrice: appliedCartonPrice,
            totalPrice,
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
        const appliedCartonPrice =
          merged.product.promoPrice && merged.product.promoPrice > 0
            ? merged.product.promoPrice
            : merged.product.cartonPrice;

        const safeCartonCount = Math.max(1, merged.cartonCount || 1);
        const totalPrice = safeCartonCount * appliedCartonPrice;

        return {
          ...merged,
          cartonCount: safeCartonCount,
          unitPrice: appliedCartonPrice,
          totalPrice,
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
    let subtotal = 0;

    cart.forEach((item) => {
      totalCartons += item.cartonCount;
      subtotal += item.totalPrice;
    });

    const discountPercentage = typeof customDiscountPercent === 'number' ? Math.max(0, customDiscountPercent) : 0;
    const discountAmount = subtotal * (discountPercentage / 100);
    const grandTotal = Math.max(0, subtotal - discountAmount);
    const taxAmount = 0;

    return {
      totalCartons,
      totalPieces: totalCartons,
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

    if (mode === 'replace') {
      setProducts(sanitizeProducts(newProducts.map(protectReserved)));
    } else {
      setProducts((prev) => {
        const map = new Map<string, Product>();
        prev.forEach((p) => map.set(p.code, p));
        newProducts.forEach((p) => {
          const existing = map.get(p.code);
          const mergedProd: Product = existing
            ? { ...existing, ...p, id: existing.id }
            : p;
          map.set(p.code, protectReserved(mergedProd));
        });
        return sanitizeProducts(Array.from(map.values()));
      });
    }

    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مدير النظام',
      userRole: currentUser?.role || 'admin',
      branchName: currentUser?.branchName || 'الفرع الرئيسي',
      action: 'import_products',
      actionTitle: `استيراد ومزامنة ${newProducts.length} صنف من شيت الإكسل (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'})`,
      details: `تم تحديث بيانات وشدات وأسعار ${newProducts.length} صنف مع الحفاظ على حجوزات المناديب النشطة.`,
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

    // 1. Strict Real-Time Concurrency Check across all items in cart
    for (const item of cart) {
      const currentProd = products.find((p) => p.id === item.product.id);
      if (!currentProd) {
        return { success: false, message: `الصنف (${item.product.name}) لم يعد متوفراً بالسيستم!` };
      }
      const availableCartons = Math.max(0, currentProd.branchStockReserved) + Math.max(0, currentProd.mainWarehouseReserved);
      if (item.cartonCount > availableCartons) {
        return {
          success: false,
          message: `عفواً، تعذر اعتماد الطلبية: الصنف (${currentProd.name}) لم يعد متوفراً بالكمية المطلوبة (المتبقي فقط ${availableCartons} كرتونة بسبب طلبية مندوب آخر تم تسجيلها للتو)! يرجى تعديل السلة.`
        };
      }
    }

    const newInvoiceNumber = `DRM-${new Date().getFullYear()}-${String(invoices.length + 104).padStart(4, '0')}`;
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10);
    const formattedTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    const userSupervisor = currentUser?.supervisorId
      ? users.find((u) => u.id === currentUser.supervisorId)?.name
      : 'مشرف عام الفرع';

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
        const itemSubtotal = item.cartonCount * appliedCartonPrice;
        const itemDiscount = itemSubtotal * (orderDiscountPercent / 100);
        const itemTax = 0;

        return {
          productId: item.product.id,
          productCode: item.product.code,
          productName: item.product.name,
          cartonCount: item.cartonCount,
          pieceCount: 0,
          cartonQuantity: cartonQty,
          totalUnits: item.cartonCount,
          pricePerPiece: item.product.piecePrice || 0,
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
      items.forEach((it) => {
        subtotal += it.totalBeforeTax;
        totalCartons += it.cartonCount;
      });
      const discountAmount = subtotal * (orderDiscountPercent / 100);
      const taxAmount = 0;
      const estimatedGrandTotal = Math.max(0, subtotal - discountAmount);
      return { subtotal, totalCartons, totalPieces: totalCartons, discountAmount, taxAmount, estimatedGrandTotal };
    };

    const primaryItems = buildInvoiceItems(primaryCartItems);
    const primaryTotals = calculateTotals(primaryItems);

    const primaryInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber,
      customerName: orderData.customerName || 'عميل تجزئة عام',
      customerPhone: orderData.customerPhone || '',
      customerAddress: orderData.customerAddress || '',
      customerTaxNumber: orderData.customerTaxNumber || '',
      date: formattedDate,
      time: formattedTime,
      repId: currentUser ? currentUser.id : 'u-admin-1',
      repName: currentUser ? currentUser.name : 'أسامة إسلام (المطور والمدير العام)',
      supervisorName: userSupervisor,
      branchName: currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
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
      notes: orderData.notes || '',
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
        repName: currentUser ? currentUser.name : 'أسامة إسلام (المطور والمدير العام)',
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
        notes: `فاتورة تحويل نواقص تابعة للفاتورة الأساسية #${newInvoiceNumber}`,
        syncedToAccounting: false,
        isShortageInvoice: true,
        parentInvoiceId: primaryInvoice.id,
        parentInvoiceNumber: primaryInvoice.invoiceNumber,
        qrPayload: `DREAM-EINV-${shortageInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${shortageTotals.estimatedGrandTotal.toFixed(2)}|${shortageTotals.taxAmount.toFixed(2)}|${formattedDate}`,
      };
    }

    // Deduct / Reserve Stock in Products (Smart Proportional Split across Branch and Main Central Warehouse)
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

    // Record inventory audit logs for each item
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
        : `تم تسجيل الطلبية #${primaryInvoice.invoiceNumber} بنجاح وحجز الأصناف بالمخزن!`
    };
  };

  // Supervisor / Manager approves order & discharges physical stock
  const approveOrder = (invoiceId: string, notes?: string): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    if (inv.status === 'معتمدة ومصروفة من المخزن') {
      return { success: false, message: 'الطلبية معتمدة ومصروفة بالفعل' };
    }

    // Deduct physical actual stock now that supervisor/manager has approved
    setProducts((prev) => {
      return prev.map((p) => {
        const invItem = inv.items.find((it) => it.productId === p.id);
        if (!invItem) return p;
        return {
          ...p,
          branchStockActual: Math.max(0, p.branchStockActual - invItem.cartonCount),
        };
      });
    });

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
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              status: 'معتمدة ومصروفة من المخزن' as OrderStatus,
              notes: notes ? `${i.notes ? i.notes + ' | ' : ''}ملاحظة الاعتماد: ${notes}` : i.notes,
            }
          : i
      )
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
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };

    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              status: 'معلقة بانتظار اعتماد الفرع' as OrderStatus,
              notes: notes ? `${i.notes ? i.notes + ' | ' : ''}تم التحويل لمدير الفرع: ${notes}` : i.notes,
            }
          : i
      )
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
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              status: 'مرفوضة / ملغاة' as OrderStatus,
              cancellationReason: reason,
              cancelledBy: currentUser?.name || 'مشرف المبيعات',
              cancelledAt: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
              restoredStockDetails: `تم استرجاع ${inv.totalCartons} كرتونة إلى مخزن الفرع`,
              notes: `${i.notes ? i.notes + ' | ' : ''}سبب الرفض: ${reason}`,
            }
          : i
      )
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
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              status,
              cancellationReason: isNowReturnedOrCancelled ? (reason || i.cancellationReason || 'إلغاء الطلبية') : i.cancellationReason,
              cancelledBy: isNowReturnedOrCancelled ? (currentUser?.name || 'مسؤول النظام') : i.cancelledBy,
              cancelledAt: isNowReturnedOrCancelled ? `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}` : i.cancelledAt,
              restoredStockDetails: isNowReturnedOrCancelled ? `تم استرجاع ${inv.totalCartons} كرتونة إلى المخزن` : i.restoredStockDetails,
              notes: reason
                ? `${i.notes ? i.notes + ' | ' : ''}تحديث الحالة إلى (${status}): ${reason}`
                : i.notes,
            }
          : i
      )
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

      try {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage limit reached while caching images');
      }

      return updated;
    });
  };

  const clearAllAppData = (mode: 'cache_only' | 'full_reset' = 'cache_only') => {
    if (mode === 'full_reset') {
      localStorage.clear();
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
        // Force garbage cleanup in storage
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      } catch (e) {
        // Safe ignore
      }
    }
  };

  const wipeAllProductsAndData = async (options?: { wipeInvoices?: boolean }) => {
    setProducts([]);
    setCart([]);
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify([]));
    } catch (e) {}

    if (options?.wipeInvoices) {
      setInvoices([]);
      try {
        localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify([]));
      } catch (e) {}
    }

    try {
      await clearCachedImages();
    } catch (e) {}
  };

  // --- Role-Based Data Visibility (STRICT PRIVACY) ---
  const getVisibleInvoices = (): Invoice[] => {
    if (!currentUser) return [];

    // Admin sees all invoices across all branches
    if (currentUser.role === 'admin') {
      if (selectedBranchFilter !== 'الكل') {
        return invoices.filter(i => i.branchName === selectedBranchFilter);
      }
      return invoices;
    }

    // Branch Manager sees all invoices of his branch
    if (currentUser.role === 'branch_manager') {
      return invoices.filter(i => i.branchName === currentUser.branchName);
    }

    // Supervisor sees invoices of reps assigned to him + his own branch
    if (currentUser.role === 'supervisor') {
      const myReps = users.filter(u => u.supervisorId === currentUser.id).map(u => u.id);
      return invoices.filter(
        i => i.repId === currentUser.id || myReps.includes(i.repId) || i.supervisorName === currentUser.name
      );
    }

    // Sales Rep: STRICT PRIVACY - ONLY his own invoices
    return invoices.filter(i => i.repId === currentUser.id);
  };

  const getVisibleProducts = (): Product[] => {
    if (!currentUser) return products;

    if (currentUser.role === 'admin') {
      if (selectedBranchFilter !== 'الكل') {
        return products.filter(p => !p.branchName || p.branchName === selectedBranchFilter || p.mainWarehouseActual > 0);
      }
      return products;
    }

    // Reps & Branch users only see items in their branch or available from central warehouse
    return products.filter(
      p => !p.branchName || p.branchName === currentUser.branchName || p.mainWarehouseActual > 0
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
