export type UserRole = 'admin' | 'branch_manager' | 'supervisor' | 'sales_rep';

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
  cartonQuantity: number;            // شدة الكرتونة (عدد القطع بالكرتونة)
  size: string;                      // الحجم
  color: string;                     // اللون
  branchStockActual: number;         // الكمية بالفرع - فعلي
  branchStockReserved: number;       // الكمية بالفرع - بعد الحجز
  mainWarehouseActual: number;       // الكمية بالمخزن الرئيسي - فعلي
  mainWarehouseReserved: number;     // الكمية بالمخزن الرئيسي - بعد الحجز
  department: string;                // القسم
  classification: string;            // الفئة
  promoPrice?: number;               // سعر العرض
  piecePrice: number;                // سعر القطعة
  cartonPrice: number;               // سعر الكرتونة
  branchName: string;                // اسم الفرع
  imageUrl?: string;                 // رابط الصورة المباشر
  cloudinaryPublicId?: string;       // معرّف Cloudinary
  barcode?: string;
  minOrderQuantity?: number;
  notes?: string;
}

export interface CartItem {
  product: Product;
  orderType: 'carton' | 'piece' | 'mixed';
  cartonCount: number;
  pieceCount: number;
  totalPieces: number;
  unitPrice: number;        // Price applied (promo, regular piece, or carton equivalent)
  totalPrice: number;
  notes?: string;
  fulfillFromMainWarehouse?: boolean; // If branch stock is insufficient
}

export type OrderStatus = 'مسودة' | 'قيد المراجعة' | 'معتمدة' | 'جاري التجهيز' | 'تم التسليم' | 'ملغاة';
export type PaymentMethod = 'نقدي (كاش)' | 'آجل (30 يوم)' | 'آجل (60 يوم)' | 'تحويل بنكي' | 'شيك';

export interface InvoiceItem {
  productId: string;
  productCode: string;
  productName: string;
  cartonCount: number;
  pieceCount: number;
  cartonQuantity: number;
  totalUnits: number;
  pricePerPiece: number;
  pricePerCarton: number;
  appliedPrice: number;
  totalBeforeTax: number;
  discountAmount: number;
  taxAmount: number;
  netTotal: number;
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
