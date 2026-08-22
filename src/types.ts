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
  name: string;                      // اسم الصنف
  salesPriority: SalesPriority;      // اولوية البيع
  category: string;                  // التصنيف
  status: ItemStatus;                // حالة الصنف
  cartonQuantity: number;            // شدة الكرتونة (عدد القطع بالكرتونة - بيان استرشادي)
  size: string;                      // الحجم
  color: string;                     // اللون
  branchStockActual: number;         // رصيد الفرع بالكراتين - فعلي
  branchStockReserved: number;       // رصيد الفرع بالكراتين - متاح للطلب
  mainWarehouseActual: number;       // رصيد مخزن أكتوبر بالكراتين - فعلي
  mainWarehouseReserved: number;     // رصيد مخزن أكتوبر بالكراتين - متاح للطلب
  department: string;                // القسم
  classification: string;            // الفئة
  promoPrice?: number;               // سعر العرض للكرتونة (اختياري)
  piecePrice?: number;               // سعر مرجعي
  cartonPrice: number;               // سعر الكرتونة بالجملة (السعر الفعلي المعتمد للطلب)
  branchName: string;                // اسم الفرع
  imageUrl?: string;                 // رابط الصورة المباشر
  cloudinaryPublicId?: string;       // معرّف Cloudinary
  barcode?: string;
  minOrderQuantity?: number;
  notes?: string;
}

export interface CartItem {
  product: Product;
  orderType?: 'carton';
  cartonCount: number;
  pieceCount?: number;
  totalPieces?: number;
  unitPrice: number;                 // سعر الكرتونة
  totalPrice: number;                // إجمالي الصنف = عدد الكراتين * سعر الكرتونة
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
  cartonCount: number;               // عدد الكراتين المطلوبة
  pieceCount?: number;
  cartonQuantity: number;            // شدة الكرتونة (ق/ك)
  totalUnits?: number;
  pricePerPiece?: number;
  pricePerCarton: number;            // سعر الكرتونة
  appliedPrice: number;              // سعر الكرتونة الفعلي
  totalBeforeTax: number;            // عدد الكراتين * سعر الكرتونة
  discountAmount: number;            // قيمة الخصم
  taxAmount: number;                 // قيمة الضريبة
  netTotal: number;                  // الإجمالي النهائي
  fulfilledFrom: 'branch' | 'main_warehouse' | 'mixed';
}

export interface Invoice {
  id: string;
  invoiceNumber: string;         // رقم الفاتورة مثل: DRM-2026-0042
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
