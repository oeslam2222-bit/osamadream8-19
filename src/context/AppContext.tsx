import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  INITIAL_BRANCHES,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_USERS
} from '../data/mockData';
import { DEFAULT_CLOUDINARY_CONFIG } from '../services/cloudinaryService';
import {
  AccountingSyncLog,
  Branch,
  CartItem,
  CloudinaryConfig,
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
  addToCart: (product: Product, orderType?: 'carton' | 'piece', count?: number) => void;
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
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  importProductsList: (newProducts: Product[], mode: 'merge' | 'replace') => void;
  adjustStock: (productId: string, branchChange: number, mainWarehouseChange: number) => void;

  // Invoice / Order Actions
  createOrder: (orderData: Partial<Invoice>) => Invoice;
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

  // Settings
  updateCloudinarySettings: (config: CloudinaryConfig) => void;
  saveMatchedProductImages: (updates: { id: string; imageUrl: string }[]) => void;
  clearAllAppData: (mode?: 'cache_only' | 'full_reset') => void;
  
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
  ACCOUNTING_LOGS: 'dream_dist_acc_logs_v5'
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize state with localStorage fallbacks
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    return saved ? JSON.parse(saved) : INITIAL_USERS;
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

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');

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
        return {
          ...u,
          approvalStatus: 'active',
          isActive: true,
          supervisorId: supervisorId !== undefined ? supervisorId : u.supervisorId,
          branchName: branchName || u.branchName,
          role: role || u.role,
        };
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

  // --- Cart Actions ---
  const addToCart = (product: Product, orderType: 'carton' | 'piece' = 'carton', count: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      const pieceMultiplier = product.cartonQuantity || 1;
      const effectivePiecePrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.piecePrice;

      if (existing) {
        const newCartonCount = orderType === 'carton' ? existing.cartonCount + count : existing.cartonCount;
        const newPieceCount = orderType === 'piece' ? existing.pieceCount + count : existing.pieceCount;
        const totalPieces = (newCartonCount * pieceMultiplier) + newPieceCount;
        const totalPrice = (newCartonCount * product.cartonPrice) + (newPieceCount * effectivePiecePrice);

        return prev.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                cartonCount: newCartonCount,
                pieceCount: newPieceCount,
                totalPieces,
                totalPrice,
                orderType: newCartonCount > 0 && newPieceCount > 0 ? 'mixed' : (newCartonCount > 0 ? 'carton' : 'piece'),
              }
            : item
        );
      } else {
        const cartonCount = orderType === 'carton' ? count : 0;
        const pieceCount = orderType === 'piece' ? count : 0;
        const totalPieces = (cartonCount * pieceMultiplier) + pieceCount;
        const totalPrice = (cartonCount * product.cartonPrice) + (pieceCount * effectivePiecePrice);

        return [
          ...prev,
          {
            product,
            orderType,
            cartonCount,
            pieceCount,
            totalPieces,
            unitPrice: orderType === 'carton' ? product.cartonPrice : effectivePiecePrice,
            totalPrice,
            fulfillFromMainWarehouse: product.branchStockActual <= 0 && product.mainWarehouseActual > 0
          },
        ];
      }
    });
  };

  const updateCartItem = (productId: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const merged = { ...item, ...updates };
        const pieceMultiplier = merged.product.cartonQuantity || 1;
        const effectivePiecePrice = merged.product.promoPrice && merged.product.promoPrice > 0 
          ? merged.product.promoPrice 
          : merged.product.piecePrice;

        const totalPieces = (merged.cartonCount * pieceMultiplier) + merged.pieceCount;
        const totalPrice = (merged.cartonCount * merged.product.cartonPrice) + (merged.pieceCount * effectivePiecePrice);

        return {
          ...merged,
          totalPieces,
          totalPrice,
          orderType: merged.cartonCount > 0 && merged.pieceCount > 0 ? 'mixed' : (merged.cartonCount > 0 ? 'carton' : 'piece')
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

  const adjustStock = (productId: string, branchChange: number, mainWarehouseChange: number) => {
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
  };

  // --- Orders & Invoices ---
  const createOrder = (orderData: Partial<Invoice>): Invoice => {
    const summary = getCartSummary();
    const newInvoiceNumber = `DRM-${new Date().getFullYear()}-${String(invoices.length + 104).padStart(4, '0')}`;
    const now = new Date();
    
    const formattedDate = now.toISOString().slice(0, 10);
    const formattedTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    const invoiceItems = cart.map((item) => {
      const cartonQty = item.product.cartonQuantity || 1;
      const effectivePiecePrice = item.product.promoPrice || item.product.piecePrice;
      const itemSubtotal = (item.cartonCount * item.product.cartonPrice) + (item.pieceCount * effectivePiecePrice);
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

    const userSupervisor = currentUser?.supervisorId ? users.find(u => u.id === currentUser.supervisorId)?.name : 'مشرف عام الفرع';

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
      status: (orderData.status || 'قيد المراجعة') as OrderStatus,
      notes: orderData.notes || '',
      syncedToAccounting: false,
      qrPayload: `DREAM-EINV-${newInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${summary.grandTotal.toFixed(2)}|${summary.taxAmount.toFixed(2)}|${formattedDate}`,
    };

    // Deduct stock
    cart.forEach((item) => {
      const pieceUnits = item.totalPieces;
      adjustStock(item.product.id, item.fulfillFromMainWarehouse ? 0 : -pieceUnits, item.fulfillFromMainWarehouse ? -pieceUnits : 0);
    });

    setInvoices((prev) => [newInvoice, ...prev]);
    clearCart();
    return newInvoice;
  };

  const updateOrderStatus = (invoiceId: string, status: OrderStatus) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, status } : inv))
    );
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
      responseMessage: `تم تصدير القيد المحاسبي وحساب العميل والمخزون بنجاح رقم السند #${Math.floor(100000 + Math.random() * 900000)}`
    };

    setAccountingLogs((prev) => [newLog, ...prev]);
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              syncedToAccounting: true,
              accountingSyncDate: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`
            }
          : i
      )
    );
    return true;
  };

  const addUser = (user: User) => {
    setUsers((prev) => [...prev, user]);
  };

  const updateUser = (updatedUser: User) => {
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
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
        isOffline,
        selectedBranchFilter,
        setSelectedBranchFilter,
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
        createOrder,
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
