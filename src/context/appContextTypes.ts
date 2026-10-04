import type { SupabaseSyncStatus } from '../services/supabaseService';
import type { GlobalDataVersionMeta, SyncScope } from '../services/dataVersionService';
import type {
  AccountingSyncLog,
  AuditLog,
  Branch,
  CartItem,
  CloudinaryConfig,
  CompanyInfo,
  Customer,
  CustomerVisit,
  InstallPromptEvent,
  InventoryTransaction,
  Invoice,
  OrderStatus,
  Product,
  ReturnedItem,
  ReturnRecord,
  TargetRecord,
  CollectionForecastRecord,
  ForecastMonthPlan,
  CustomerCommentRecord,
  User,
  UserRole,
  VisitReviewStatus,
} from '../types';

export interface AppContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  users: User[];
  branches: Branch[];
  products: Product[];
  customers: Customer[];
  visits: CustomerVisit[];
  invoices: Invoice[];
  cart: CartItem[];
  cloudinaryConfig: CloudinaryConfig;
  accountingLogs: AccountingSyncLog[];
  auditLogs: AuditLog[];
  recordAuditLog: (logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>) => void;
  clearAuditLogs: () => void;
  isOffline: boolean;
  pendingInvoicesCount: number;
  offlineQueueCount: number;
  flushOfflineQueue: () => Promise<{ success: boolean; syncedCount: number }>;
  flushPendingInvoices: () => Promise<{ success: boolean; syncedCount: number }>;
  selectedBranchFilter: string;
  setSelectedBranchFilter: (branch: string) => void;
  refreshInvoicesNow: (force?: boolean) => Promise<{ success: boolean; count: number; message: string }>;
  
  // Supabase Sync
  supabaseStatus: SupabaseSyncStatus;
  isSupabaseSyncing: boolean;
  syncWithSupabase: (direction?: 'fetch' | 'push' | 'both') => Promise<{ success: boolean; message: string }>;

  // Privacy & Confidentiality Mode (سرية البيانات)
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (val: boolean) => void;
  formatConfidentialCurrency: (amount: number | undefined | null) => string;

  // Customer Management Actions
  addCustomer: (customer: Customer) => void;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (customerId: string) => void;
  importCustomersList: (newCustomers: Customer[], mode?: 'merge' | 'replace' | 'upsert') => Promise<{ success: boolean; count: number; removed: number; message: string }>;
  cleanAndDeduplicateCustomers: () => { originalCount: number; deduplicatedCount: number; duplicatesRemoved: number };
  clearCustomersCacheAndReset: () => void;
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
  login: (identifier: string, password: string) => Promise<{ success: boolean; message: string; user?: User }>;
  register: (userData: {
    name: string;
    username: string;
    email: string;
    password?: string;
    phone: string;
    branchName: string;
    role: UserRole;
    supervisorId?: string;
  }) => Promise<{ success: boolean; message: string }>;
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
  resendInvoiceEmail: (invoiceId: string) => Promise<{ success: boolean; message: string }>;
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
  dispatchOrderToMicrosoft: (invoiceId: string) => Promise<{ success: boolean; message: string }>;
  updateBranchEmails: (branchId: string, email: string, notificationEmails: string[]) => void;

  // User Management & Approval Actions
  addUser: (user: User) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
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
  installPromptEvent: InstallPromptEvent | null;
  canInstallPwa: boolean;
  triggerInstallPrompt: () => Promise<boolean>;
  isInstallModalOpen: boolean;
  setIsInstallModalOpen: (open: boolean) => void;
  
  // Helpers for RBAC
  getVisibleInvoices: () => Invoice[];
  getVisibleProducts: () => Product[];
  getVisibleCustomers: () => Customer[];
  getVisibleVisits: () => CustomerVisit[];
  /** Memoized result of getVisibleVisits, for pages that want a stable array to depend on. */
  visibleVisits: CustomerVisit[];
  addVisit: (visit: Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy'>) => { success: boolean; message: string; visit?: CustomerVisit };
  addImportedVisits: (
    visits: Array<Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy' | 'customerName' | 'customerCode' | 'syncStatus'>>,
    onProgress?: (processed: number, total: number) => void
  ) => Promise<{ success: boolean; added: number; duplicates: number; queued: boolean; failed: string[] }>;
  updateVisit: (visit: CustomerVisit) => { success: boolean; message: string };
  toggleArchiveVisit: (visitId: string, isArchived: boolean) => Promise<{ success: boolean; message: string }>;
  reviewVisit: (visitId: string, status: Extract<VisitReviewStatus, 'approved' | 'needs_fix'>, note?: string) => { success: boolean; message: string };
  deleteVisit: (visitId: string) => Promise<{ success: boolean; message: string }>;
  syncVisitsWithDatabase: () => Promise<{ success: boolean; message: string; count: number }>;
  getCustomerVisitSummary: (customerId: string, month?: string) => { total: number; completed: number; scheduled: number; lastVisit?: string; nextVisit?: string };
  getSupervisorsInBranch: (branchName?: string) => User[];
  getSalesRepsForSupervisor: (supervisorId: string) => User[];
  loginAs: (userId: string) => void;

  // Targets & KPIs Dashboard
  targets: TargetRecord[];
  forecasts: CollectionForecastRecord[];
  forecastPlans: ForecastMonthPlan[];
  customerComments: CustomerCommentRecord[];
  saveForecast: (record: CollectionForecastRecord) => Promise<void>;
  submitForecastWeek: (monthKey: string, weekIndex: number, repId: string) => Promise<number>;
  approveForecastWeek: (monthKey: string, weekIndex: number, repId: string) => Promise<number>;
  requestForecastChange: (monthKey: string, weekIndex: number, repId: string, note: string) => Promise<number>;
  saveForecastPlan: (plan: ForecastMonthPlan) => Promise<void>;
  saveCustomerComment: (comment: CustomerCommentRecord) => Promise<void>;
  toggleArchiveCustomerComment: (commentId: string, isArchived: boolean) => Promise<{ success: boolean; message: string }>;
  deleteCustomerComment: (id: string) => Promise<void>;
  getVisibleTargets: () => TargetRecord[];
  importTargetsFromExcel: (file: File) => Promise<{ success: boolean; count: number; message: string }>;
  importTargetsFromGoogleSheet: (url: string) => Promise<{ success: boolean; count: number; message: string }>;
  exportTargetsReport: () => void;
  resetTargetsToDefault: () => void;
  addOrUpdateTargetRecord: (record: TargetRecord) => void;
  deleteTargetRecord: (id: string) => void;

  // Data Version Sync (إصدار التحديثات ومسح الكاش التلقائي لضمان عدم التدبيل)
  globalDataVersion: GlobalDataVersionMeta | null;
  isVersionSyncing: boolean;
  lastVersionSyncNotice: string | null;
  clearVersionSyncNotice: () => void;
  checkAndSyncDataVersion: (force?: boolean) => Promise<{ updated: boolean; version?: number; message: string }>;
  publishDataVersionUpdate: (params: {
    scope?: SyncScope;
    notes?: string;
    forcePurge?: boolean;
  }) => Promise<{ success: boolean; version: number; message: string }>;
  forcePurgeCacheAndReload: (scope?: SyncScope) => Promise<void>;
}
