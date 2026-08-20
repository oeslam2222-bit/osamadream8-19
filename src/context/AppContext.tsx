import React, { createContext, useContext, useEffect, useState } from 'react';
import {
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
  getCartSummary: () => {
    totalCartons: number;
    totalPieces: number;
    subtotal: number;
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
  createOrder: (orderData: Partial<Invoice>) => { success: boolean; invoice?: Invoice; message?: string };
  approveOrder: (invoiceId: string, notes?: string) => { success: boolean; message: string };
  forwardOrderToManager: (invoiceId: string, notes?: string) => { success: boolean; message: string };
  rejectOrder: (invoiceId: string, reason: string) => { success: boolean; message: string };
  updateOrderStatus: (invoiceId: string, status: OrderStatus) => void;
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
  PRODUCTS: 'dream_dist_products_v5',
  INVOICES: 'dream_dist_invoices_v5',
  USERS: 'dream_dist_users_v5',
  BRANCHES: 'dream_dist_branches_v5',
  CLOUDINARY: 'dream_dist_cloudinary_v5',
  CURRENT_USER_ID: 'dream_dist_current_user_v5',
  IS_AUTH: 'dream_dist_is_auth_v5',
  ACCOUNTING_LOGS: 'dream_dist_acc_logs_v5',
  CART: 'dream_dist_cart_v5'
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize state with localStorage fallbacks
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!saved) return INITIAL_USERS;
    try {
      const parsed: User[] = JSON.parse(saved);
      return parsed.map((u) => ({
        ...u,
        role: u.role === 'admin' || u.role === 'branch_manager' || u.role === 'supervisor' || u.role === 'sales_rep' ? u.role : 'sales_rep',
      }));
    } catch {
      return INITIAL_USERS;
    }
  });

  const [branches, setBranches] = useState<Branch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRANCHES);
    return saved ? JSON.parse(saved) : INITIAL_BRANCHES;
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

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
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
      branchName: userData.branchName || 'فرع القاهرة - مدينة نصر',
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

  const checkProductAvailability = (productId: string, requestedPieces: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return { available: false, remainingPieces: 0, message: 'الصنف غير موجود بالسيستم' };

    const remaining = Math.max(0, prod.branchStockReserved);
    const totalAvailable = remaining + Math.max(0, prod.mainWarehouseReserved);

    if (totalAvailable <= 0) {
      return {
        available: false,
        remainingPieces: 0,
        message: `عفواً، الصنف (${prod.name}) نفذ تماماً من المخزن (0 قطع)! الرصيد محجوز بالكامل.`
      };
    }

    if (requestedPieces > totalAvailable) {
      return {
        available: false,
        remainingPieces: totalAvailable,
        message: `الكمية المطلوبة (${requestedPieces} قطعة) تتجاوز الرصيد المتاح (${totalAvailable} قطعة متبقية)!`
      };
    }

    return { available: true, remainingPieces: totalAvailable };
  };

  // --- Cart Actions with Concurrency Checks ---
  const addToCart = (
    product: Product,
    orderType: 'carton' | 'piece' = 'carton',
    count: number = 1
  ): { success: boolean; message?: string } => {
    const latestProd = products.find((p) => p.id === product.id) || product;
    const pieceMultiplier = latestProd.cartonQuantity || 1;
    const piecesRequested = orderType === 'carton' ? count * pieceMultiplier : count;

    const existing = cart.find((item) => item.product.id === latestProd.id);
    const existingPieces = existing ? existing.totalPieces : 0;
    const totalRequiredPieces = existingPieces + piecesRequested;

    const availableInBranch = Math.max(0, latestProd.branchStockReserved);
    const availableInWarehouse = Math.max(0, latestProd.mainWarehouseReserved);
    const totalAvailable = availableInBranch + availableInWarehouse;

    if (totalAvailable <= 0) {
      return {
        success: false,
        message: `عفواً، الصنف (${latestProd.name}) نفذ من المخزن تماماً (0 قطع)! تم حجز كامل الكمية بواسطة مناديب آخرين.`
      };
    }

    if (totalRequiredPieces > totalAvailable) {
      return {
        success: false,
        message: `عفواً، الكمية المطلوبة تتجاوز المتاح! المتبقي حالياً بالمخزن (${totalAvailable} قطعة فقط) بينما طلبت (${totalRequiredPieces} قطعة).`
      };
    }

    setCart((prev) => {
      const existingInCart = prev.find((item) => item.product.id === latestProd.id);
      const effectivePiecePrice =
        latestProd.promoPrice && latestProd.promoPrice > 0 ? latestProd.promoPrice : latestProd.piecePrice;

      if (existingInCart) {
        const newCartonCount = orderType === 'carton' ? existingInCart.cartonCount + count : existingInCart.cartonCount;
        const newPieceCount = orderType === 'piece' ? existingInCart.pieceCount + count : existingInCart.pieceCount;
        const totalPieces = newCartonCount * pieceMultiplier + newPieceCount;
        const totalPrice = newCartonCount * latestProd.cartonPrice + newPieceCount * effectivePiecePrice;

        return prev.map((item) =>
          item.product.id === latestProd.id
            ? {
                ...item,
                cartonCount: newCartonCount,
                pieceCount: newPieceCount,
                totalPieces,
                totalPrice,
                orderType: newCartonCount > 0 && newPieceCount > 0 ? 'mixed' : newCartonCount > 0 ? 'carton' : 'piece',
              }
            : item
        );
      } else {
        const cartonCount = orderType === 'carton' ? count : 0;
        const pieceCount = orderType === 'piece' ? count : 0;
        const totalPieces = cartonCount * pieceMultiplier + pieceCount;
        const totalPrice = cartonCount * latestProd.cartonPrice + pieceCount * effectivePiecePrice;

        return [
          ...prev,
          {
            product: latestProd,
            orderType,
            cartonCount,
            pieceCount,
            totalPieces,
            unitPrice: orderType === 'carton' ? latestProd.cartonPrice : effectivePiecePrice,
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
        const pieceMultiplier = merged.product.cartonQuantity || 1;
        const effectivePiecePrice =
          merged.product.promoPrice && merged.product.promoPrice > 0
            ? merged.product.promoPrice
            : merged.product.piecePrice;

        const totalPieces = merged.cartonCount * pieceMultiplier + merged.pieceCount;
        const totalPrice = merged.cartonCount * merged.product.cartonPrice + merged.pieceCount * effectivePiecePrice;

        return {
          ...merged,
          totalPieces,
          totalPrice,
          orderType: merged.cartonCount > 0 && merged.pieceCount > 0 ? 'mixed' : merged.cartonCount > 0 ? 'carton' : 'piece',
        };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  const getCartSummary = () => {
    let totalCartons = 0;
    let totalPieces = 0;
    let subtotal = 0;

    cart.forEach((item) => {
      totalCartons += item.cartonCount;
      totalPieces += item.pieceCount;
      subtotal += item.totalPrice;
    });

    const discountPercentage = 3.5;
    const discountAmount = subtotal * (discountPercentage / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxPercentage = 14; // Egypt VAT
    const taxAmount = afterDiscount * (taxPercentage / 100);
    const grandTotal = afterDiscount + taxAmount;

    return {
      totalCartons,
      totalPieces,
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      itemCount: cart.length,
    };
  };

  // --- Product & Stock Management ---
  const addProduct = (product: Product) => {
    setProducts((prev) => [product, ...prev]);
    recordInventoryTransaction({
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      type: 'تعديل جردي',
      quantityPieces: product.branchStockActual,
      branchStockBefore: 0,
      branchStockAfter: product.branchStockActual,
      branchName: product.branchName || currentUser?.branchName || 'الفرع الرئيسي',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      notes: 'إضافة صنف جديد للكتالوج مع رصيد افتتاحي'
    });
  };

  const updateProduct = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const deleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const importProductsList = (newProducts: Product[], mode: 'merge' | 'replace') => {
    if (mode === 'replace') {
      setProducts(newProducts);
    } else {
      setProducts((prev) => {
        const map = new Map<string, Product>();
        prev.forEach((p) => map.set(p.code, p));
        newProducts.forEach((p) => map.set(p.code, p));
        return Array.from(map.values());
      });
    }
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

    if (prod && branchChange !== 0) {
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
    }
  };

  // --- Orders, Concurrency, and Approval Workflow ---
  const createOrder = (orderData: Partial<Invoice>): { success: boolean; invoice?: Invoice; message?: string } => {
    if (cart.length === 0) {
      return { success: false, message: 'سلة الطلبية فارغة! يرجى إضافة أصناف أولاً.' };
    }

    // 1. Strict Real-Time Concurrency Check across all items in cart
    for (const item of cart) {
      const currentProd = products.find((p) => p.id === item.product.id);
      if (!currentProd) {
        return { success: false, message: `الصنف (${item.product.name}) لم يعد متوفراً بالسيستم!` };
      }
      const availablePieces = Math.max(0, currentProd.branchStockReserved) + Math.max(0, currentProd.mainWarehouseReserved);
      if (item.totalPieces > availablePieces) {
        return {
          success: false,
          message: `عفواً، تعذر اعتماد الطلبية: الصنف (${currentProd.name}) لم يعد متوفراً بالكمية المطلوبة (المتبقي فقط ${availablePieces} قطعة بسبب طلبية مندوب آخر تم تسجيلها للتو)! يرجى تعديل السلة.`
        };
      }
    }

    const summary = getCartSummary();
    const newInvoiceNumber = `DRM-${new Date().getFullYear()}-${String(invoices.length + 104).padStart(4, '0')}`;
    const now = new Date();

    const formattedDate = now.toISOString().slice(0, 10);
    const formattedTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    const invoiceItems = cart.map((item) => {
      const cartonQty = item.product.cartonQuantity || 1;
      const effectivePiecePrice = item.product.promoPrice || item.product.piecePrice;
      const itemSubtotal = item.cartonCount * item.product.cartonPrice + item.pieceCount * effectivePiecePrice;
      const itemDiscount = itemSubtotal * 0.035;
      const itemTax = (itemSubtotal - itemDiscount) * 0.14;

      return {
        productId: item.product.id,
        productCode: item.product.code,
        productName: item.product.name,
        cartonCount: item.cartonCount,
        pieceCount: item.pieceCount,
        cartonQuantity: cartonQty,
        totalUnits: item.totalPieces,
        pricePerPiece: effectivePiecePrice,
        pricePerCarton: item.product.cartonPrice,
        appliedPrice: item.cartonCount > 0 ? item.product.cartonPrice : effectivePiecePrice,
        totalBeforeTax: itemSubtotal,
        discountAmount: itemDiscount,
        taxAmount: itemTax,
        netTotal: itemSubtotal - itemDiscount + itemTax,
        fulfilledFrom: (item.fulfillFromMainWarehouse ? 'main_warehouse' : 'branch') as 'branch' | 'main_warehouse',
      };
    });

    const userSupervisor = currentUser?.supervisorId
      ? users.find((u) => u.id === currentUser.supervisorId)?.name
      : 'مشرف عام الفرع';

    const isDirectManager = currentUser?.role === 'admin' || currentUser?.role === 'branch_manager';
    const initialStatus: OrderStatus = isDirectManager ? 'معتمدة ومصروفة من المخزن' : 'قيد مراجعة المشرف';

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber,
      customerName: orderData.customerName || 'عميل تجزئة عام',
      customerPhone: orderData.customerPhone || '',
      customerAddress: orderData.customerAddress || '',
      customerTaxNumber: orderData.customerTaxNumber || '',
      date: formattedDate,
      time: formattedTime,
      repId: currentUser ? currentUser.id : 'u-admin-1',
      repName: currentUser ? currentUser.name : 'مسؤول النظام',
      supervisorName: userSupervisor,
      branchName: currentUser?.branchName || 'فرع القاهرة - مدينة نصر',
      items: invoiceItems,
      totalCartons: summary.totalCartons,
      totalPieces: summary.totalPieces,
      subtotal: summary.subtotal,
      discountPercentage: 3.5,
      discountAmount: summary.discountAmount,
      taxPercentage: 14,
      taxAmount: summary.taxAmount,
      estimatedGrandTotal: summary.grandTotal,
      paymentMethod: orderData.paymentMethod || 'نقدي (كاش)',
      status: initialStatus,
      notes: orderData.notes || '',
      syncedToAccounting: false,
      qrPayload: `DREAM-EINV-${newInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${summary.grandTotal.toFixed(2)}|${summary.taxAmount.toFixed(2)}|${formattedDate}`,
    };

    // Stock deduction & reservation:
    // If sales_rep: reserve stock immediately (branchStockReserved decreases) so other reps CANNOT book it!
    // If manager/admin: approve & deduct both actual and reserved immediately
    setProducts((prev) => {
      return prev.map((p) => {
        const cartItem = cart.find((c) => c.product.id === p.id);
        if (!cartItem) return p;
        const pieceUnits = cartItem.totalPieces;

        if (isDirectManager) {
          return {
            ...p,
            branchStockActual: Math.max(0, p.branchStockActual - pieceUnits),
            branchStockReserved: Math.max(0, p.branchStockReserved - pieceUnits),
          };
        } else {
          return {
            ...p,
            branchStockReserved: Math.max(0, p.branchStockReserved - pieceUnits),
          };
        }
      });
    });

    // Record inventory audit logs
    cart.forEach((item) => {
      const prod = products.find((p) => p.id === item.product.id);
      const beforeReserved = prod ? prod.branchStockReserved : 0;
      recordInventoryTransaction({
        productId: item.product.id,
        productCode: item.product.code,
        productName: item.product.name,
        type: isDirectManager ? 'صرف واعتماد مشرف' : 'حجز طلبية مندوب',
        quantityPieces: item.totalPieces,
        branchStockBefore: beforeReserved,
        branchStockAfter: Math.max(0, beforeReserved - item.totalPieces),
        branchName: currentUser?.branchName || 'الفرع الرئيسي',
        userName: currentUser?.name || 'المندوب',
        userRole: currentUser?.role || 'sales_rep',
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoiceNumber,
        notes: isDirectManager
          ? `اعتماد وصرف فوري للطلبية #${newInvoiceNumber}`
          : `حجز رصيد للطلبية #${newInvoiceNumber} قيد مراجعة واعتماد المشرف`,
      });
    });

    setInvoices((prev) => [newInvoice, ...prev]);
    clearCart();
    return { success: true, invoice: newInvoice };
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
          branchStockActual: Math.max(0, p.branchStockActual - invItem.totalUnits),
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
        quantityPieces: item.totalUnits,
        branchStockBefore: currentActual,
        branchStockAfter: Math.max(0, currentActual - item.totalUnits),
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

    return {
      success: true,
      message: `تم اعتماد وصرف الطلبية #${inv.invoiceNumber} وخصم المخزون الفعلي من الفرع بنجاح!`,
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

    // Restore reserved stock back to available stock
    setProducts((prev) => {
      return prev.map((p) => {
        const invItem = inv.items.find((it) => it.productId === p.id);
        if (!invItem) return p;
        return {
          ...p,
          branchStockReserved: p.branchStockReserved + invItem.totalUnits,
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
        quantityPieces: item.totalUnits,
        branchStockBefore: reservedBefore,
        branchStockAfter: reservedBefore + item.totalUnits,
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
              notes: `${i.notes ? i.notes + ' | ' : ''}سبب الرفض: ${reason}`,
            }
          : i
      )
    );

    return {
      success: true,
      message: `تم رفض الطلبية #${inv.invoiceNumber} وإرجاع الأصناف المحجوزة للمخزن فوراً لتصبح متاحة للمناديب الآخرين.`,
    };
  };

  const updateOrderStatus = (invoiceId: string, status: OrderStatus) => {
    setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, status } : inv)));
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
