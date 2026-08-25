export type UserRole = 'admin' | 'branch_manager' | 'supervisor' | 'sales_rep' | 'developer';

export type UserApprovalStatus = 'active' | 'pending_approval' | 'rejected';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password?: string;
  role: UserRole;
  branchName: string;
  supervisorId?: string;
  phone: string;
  avatar?: string;
  isActive: boolean;
  approvalStatus: UserApprovalStatus;
  registrationDate?: string;
  commissionRate?: number;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  managerName: string;
  phone: string;
  isMainWarehouse?: boolean;
}

export type SalesPriority = 'مرتفع' | 'متوسط' | 'عادي' | 'منخفض';
export type ItemStatus = 'متاح' | 'راكد' | 'عرض ترويجي' | 'نواقص' | 'موقوف مؤقتاً';

export const OFFICIAL_DEPARTMENTS = [
  'LHLotus',
  'LHALFA',
  'LHDream',
  'FHlines',
  'FHGigilli',
  'LHKAZAN',
  'FHALZA',
  'FHDream',
  'FHTobaco',
  'FHGIMYA',
  'FHLuminarc',
  'FHMarcato',
  'LHGalaxy',
  'FHBlinkmax',
  'FHDelisoga',
  'FHGreenApp',
  'FHCasasunc',
  'FHOlala',
  'FHQcocicok',
  'FHTesiJesi',
  'FHKAZAN'
] as const;

export type OfficialDepartment = typeof OFFICIAL_DEPARTMENTS[number];

export interface Product {
  id: string;
  code: string;                      // الكود
  name: string;                      // اسم الصنف (Product name)
  salesPriority: SalesPriority;      // اولوية البيع
  category: string;                  // التصنيف / المجموعة
  status: ItemStatus;                // حالة الصنف
  cartonQuantity: number;            // شدة الكرتونة (Factor - عدد القطع بالكرتونة)
  factor?: number;                   // شدة الكرتونة (Factor)
  size: string;                      // الحجم
  color: string;                     // اللون
  branchStockActual: number;         // رصيد الفرع الحالي بالكراتين - فعلي
  branchStockReserved: number;       // رصيد الفرع الحالي بالكراتين - متاح للطلب
  mainWarehouseActual: number;       // رصيد مخزن أكتوبر بالكراتين - فعلي
  mainWarehouseReserved: number;     // رصيد مخزن أكتوبر بالكراتين - متاح للطلب
  branchStocks?: Record<string, number>; // أرصدة الفروع الفردية (البحيرة، الفيوم، القاهرة، المنيا، ديمشلت، مخزون اكتوبر، منوف، منيا القمح)
  department: string;                // القسم / Item group
  itemGroup?: string;                // المجموعة الرئيسية (Item group)
  classification: string;            // الفئة / Family Name
  familyName?: string;               // العائلة (Family Name)
  promoPrice?: number;               // سعر العرض للكرتونة (اختياري)
  piecePrice?: number;               // سعر القطعة (Sales Price)
  salesPrice?: number;               // سعر القطعة (Sales Price)
  cartonPrice: number;               // سعر الكرتونة (Factor * Sales Price)
  branchName: string;                // اسم الفرع
  imageUrl?: string;                 // رابط الصورة المباشر
  cloudinaryPublicId?: string;       // معرّف Cloudinary
  barcode?: string;
  minOrderQuantity?: number;
  notes?: string;
}

export type CustomerTier = 'مميز' | 'راقي' | 'متوسط' | 'عادي';

export interface Customer {
  id: string;
  code: string;                      // كود العميل (كود العميل)
  name: string;                      // اسم العميل / المحل (الاسم)
  storeName?: string;                // اسم المحل / السوبر ماركت / المعرض
  tier?: CustomerTier;               // فئة وتصنيف العميل (مميز / راقي / متوسط / عادي)
  phone: string;                     // رقم الهاتف
  address?: string;                  // العنوان التفصيلي
  governorate?: string;              // المحافظة
  branchName: string;                // اسم الفرع (الفرع)
  repName?: string;                  // اسم المندوب المسئول (المندوب الحالي)
  salesRepName?: string;             // المندوب المسئول (alias)
  repId?: string;                    // كود المندوب
  taxNumber?: string;                // الرقم الضريبي
  notes?: string;
  createdAt?: string;
}

export interface CartItem {
  product: Product;
  orderType?: 'carton' | 'piece' | 'mixed';
  cartonCount: number;               // عدد الكراتين
  pieceCount: number;                // عدد القطع الفردية
  cartonQuantity?: number;           // شدة الكرتونة
  totalPieces: number;               // إجمالي القطع (كراتين * شدة + قطع)
  unitPrice: number;                 // سعر الكرتونة
  pricePerPiece?: number;            // سعر القطعة
  totalPrice: number;                // إجمالي الصنف = (كراتين * سعر كرتونة) + (قطع * سعر قطعة)
  quantityDescription?: string;      // وصف الكمية الذكي
  notes?: string;
  fulfillFromMainWarehouse?: boolean; // سحب من المخزن الرئيسي
}

export type OrderStatus =
  | 'مسودة'
  | 'قيد مراجعة المشرف'
  | 'معلقة بانتظار اعتماد الفرع'
  | 'قيد المراجعة'
  | 'معتمدة ومصروفة من المخزن'
  | 'معتمدة'
  | 'جاري التجهيز'
  | 'قيد التوصيل'
  | 'تم التسليم'
  | 'مرتجع'
  | 'مرفوضة / ملغاة'
  | 'ملغاة';
export type PaymentMethod = 'نقدي (كاش)' | 'آجل (30 يوم)' | 'آجل (60 يوم)' | 'تحويل بنكي' | 'شيك';

export interface InventoryTransaction {
  id: string;
  timestamp: string;
  date: string;
  productId: string;
  productCode: string;
  productName: string;
  type: 'حجز طلبية مندوب' | 'صرف واعتماد مشرف' | 'إلغاء حجز وإرجاع' | 'مرتجع مبيعات وإرجاع للمخزن' | 'توريد مخزني' | 'تحويل بين الفروع' | 'تعديل جردي';
  quantityPieces: number;            // عدد الكراتين المنقولة / المحجوزة
  branchStockBefore: number;
  branchStockAfter: number;
  branchName: string;
  userName: string;
  userRole: UserRole;
  invoiceId?: string;
  invoiceNumber?: string;
  notes?: string;
}

export interface InvoiceItem {
  productId: string;
  productCode: string;
  productName: string;
  product?: Product;                 // Reference to full product if available
  itemGroup?: string;
  familyName?: string;
  cartonCount: number;               // عدد الكراتين المطلوبة
  pieceCount: number;                // عدد القطع الفردية
  cartonQuantity: number;            // شدة الكرتونة (ق/ك)
  totalUnits?: number;               // إجمالي القطع
  totalPieces?: number;              // إجمالي القطع (alias)
  quantityDescription?: string;      // وصف الكمية الذكي (مثال: 1 كرتونة و 1 قطعة)
  pricePerPiece: number;             // سعر القطعة
  pricePerCarton: number;            // سعر الكرتونة
  appliedPrice: number;              // سعر الكرتونة الفعلي
  unitPrice?: number;                // سعر الوحدة الفعلي (alias)
  totalBeforeTax: number;            // (كراتين * سعر كرتونة) + (قطع * سعر قطعة)
  discountAmount: number;            // قيمة الخصم
  taxAmount: number;                 // قيمة الضريبة
  netTotal: number;                  // الإجمالي النهائي
  totalPrice?: number;               // الإجمالي (alias)
  fulfilledFrom: 'branch' | 'main_warehouse' | 'mixed';
  fulfillFromMainWarehouse?: boolean; // حجز من المخزن الرئيسي بأكتوبر
  notes?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;         // رقم الفاتورة مثل: DRM-2026-0042
  customerCode?: string;         // كود العميل
  customerName: string;          // اسم العميل
  customerPhone?: string;
  customerAddress?: string;
  customerTaxNumber?: string;
  date: string;                  // التاريخ
  time: string;
  repId: string;
  repName: string;               // اسم المندوب
  supervisorName?: string;
  branchName: string;            // اسم الفرع
  items: InvoiceItem[];
  totalCartons: number;
  totalPieces: number;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;         // مثلاً 14% ضريبة القيمة المضافة
  taxAmount: number;
  estimatedGrandTotal: number;   // إجمالي الفاتورة التقديرية
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  notes?: string;
  syncedToAccounting?: boolean;
  accountingSyncDate?: string;
  qrPayload?: string;

  // Shortage Backorders & Splitting
  isShortageInvoice?: boolean;
  parentInvoiceId?: string;
  parentInvoiceNumber?: string;
  hasShortageSplit?: boolean;
  shortageInvoiceNumber?: string;

  // Cancellation & Restitution Details
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  restoredStockDetails?: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  folderPrefix: string;
  defaultTransformation: string;
  matchingPattern: 'auto' | 'code' | 'name' | 'slug' | 'custom_url';
  fileExtension: 'jpg' | 'png' | 'webp' | 'auto';
  baseUrlPattern: string;
}

export interface ExcelColumnMapping {
  code: string;
  name: string;
  salesPriority: string;
  category: string;
  status: string;
  cartonQuantity: string;
  size: string;
  color: string;
  branchStockActual: string;
  branchStockReserved: string;
  mainWarehouseActual: string;
  mainWarehouseReserved: string;
  department: string;
  classification: string;
  promoPrice: string;
  piecePrice: string;
  cartonPrice: string;
  branchName: string;
  imageUrl?: string;
}

export interface AccountingSyncLog {
  id: string;
  timestamp: string;
  invoiceNumber: string;
  status: 'نجاح' | 'فشل' | 'قيد الانتظار';
  systemName: string;
  responseMessage: string;
}

export type AuditActionType =
  | 'create_invoice'
  | 'update_invoice_status'
  | 'approve_invoice'
  | 'cancel_invoice'
  | 'return_invoice'
  | 'import_products'
  | 'stock_adjustment'
  | 'user_login'
  | 'create_user'
  | 'update_user';

export interface AuditLog {
  id: string;
  timestamp: string; // ISO string
  formattedTime: string; // e.g. 2026-08-21 04:30 م
  userId: string;
  userName: string;
  userRole: UserRole;
  branchName: string;
  action: AuditActionType;
  actionTitle: string;
  details: string;
  invoiceId?: string;
  invoiceNumber?: string;
  ipAddress?: string;
  badgeType?: 'success' | 'warning' | 'info' | 'danger' | 'neutral';
}
