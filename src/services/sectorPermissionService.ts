import { Branch, Sector, getBranchesBySector, getBranchById } from '../data/branchDefinitions';

export type { Sector };

/**
 * أدوار المستخدمين في النظام
 */
export type UserRole =
  | 'sales_rep'                 // مندوب
  | 'sales_supervisor'          // مشرف مناديب
  | 'branch_manager'            // مدير فرع
  | 'sales_department_manager'  // مدير قسم المبيعات (يشوف الاتنين)
  | 'sector_manager_home'       // مدير القطاع المنزلي لوحده
  | 'sector_manager_electrical' // مدير القطاع الكهربائي لوحده
  | 'top_management'            // الإدارة العليا (يشوف كل حاجة)
  | 'technical_support';        // الدعم الفني (يشوف كل حاجة + يفعل يوزرات ويضيف بيانات)

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  sector?: Sector;          // secteur للمدير القطاع / المندوب所属
  branchId?: number;        // الفرع التابع له
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * نتيجة فحص الصلاحية
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * خدمة الصلاحيات حسب القطاع والدور
 */
export class SectorPermissionService {

  /**
   * هل الدور يسمح له برؤية كل البيانات عبر القطاعات؟
   */
  static canViewAllSectors(role: UserRole): boolean {
    return [
      'top_management',
      'technical_support',
      'sales_department_manager',
    ].includes(role);
  }

  /**
   * هل الدور يسمح له برؤية قطاع معين فقط؟
   */
  static isSectorRestricted(role: UserRole): boolean {
    return role === 'sector_manager_home' || role === 'sector_manager_electrical';
  }

  /**
   * القطاعات المسموح بها لهذا الدور والمستخدم
   */
  static getAllowedSectors(user: User): Sector[] {
    if (user.role === 'top_management' || user.role === 'technical_support' || user.role === 'sales_department_manager') {
      return ['home', 'electrical'];
    }
    if (user.role === 'sector_manager_home') return ['home'];
    if (user.role === 'sector_manager_electrical') return ['electrical'];
    // مندوب / مشرف / مدير فرع → القطاع الخاص به
    if (user.sector) return [user.sector];
    return ['home']; // default
  }

  /**
   * الفروع المتاحة لهذا المستخدم بناءً على صلاحياته
   */
  static getAccessibleBranches(user: User, allBranches: Branch[]): Branch[] {
    // الإدارة العليا / الدعم الفني / مدير قسم المبيعات → كل الفروع
    if (SectorPermissionService.canViewAllSectors(user.role)) {
      return allBranches;
    }

    // مدير قطاع معين → فروع ذلك القطاع فقط
    if (SectorPermissionService.isSectorRestricted(user.role)) {
      const sector = user.role === 'sector_manager_home' ? 'home' : 'electrical';
      return getBranchesBySector(sector);
    }

    // إذا عنده فرع محدد → ذلك الفرع فقط
    if (user.branchId) {
      const branch = getBranchById(user.branchId);
      return branch ? [branch] : [];
    }

    // fallback: قطاع المستخدم
    if (user.sector) return getBranchesBySector(user.sector);
    return [];
  }

  /**
   * هل المستخدم يستطيع تفعيل/تعطيل مستخدمين آخرين؟
   */
  static canManageUsers(role: UserRole): boolean {
    return role === 'technical_support' || role === 'sales_department_manager';
  }

  /**
   * هل المستخدم يستطيع إضافة/تعديل بيانات في الشيتات؟
   */
  static canEditSheets(role: UserRole): boolean {
    return role === 'technical_support' || role === 'sales_department_manager';
  }

  /**
   * فحص صلاحية عرض سجل معين (فواتير / عملاء / زيارات)
   * regla: sector + branch + ownership
   */
  static canViewRecord(
    user: User,
    recordSector?: Sector,
    recordBranchId?: number,
    recordOwnerId?: string
  ): PermissionResult {
    const allowedSectors = SectorPermissionService.getAllowedSectors(user);

    // فحص القطاع
    if (recordSector && !allowedSectors.includes(recordSector)) {
      return { allowed: false, reason: 'السجل غير ضمن القطاع المسموح لك' };
    }

    // إذا كان عنده فرع محدد، والتسجيل يخص فرع آخر وملكيته ليست له → ممنوع
    if (user.branchId && recordBranchId && recordBranchId !== user.branchId) {
      // المندوب يشوف بيانات نفسه فقط حتى لو في نفس الفرع
      if (user.role === 'sales_rep' && recordOwnerId && recordOwnerId !== user.id) {
        return { allowed: false, reason: 'لا يمكنك رؤية بيانات مندوب آخر' };
      }
      // مدير الفرع يشوف فرع نفسه فقط
      if (user.role === 'branch_manager') {
        return { allowed: false, reason: 'السجل خارج نطاق فرعك' };
      }
    }

    // المندوبstrictly يشوف بياناته هو
    if (user.role === 'sales_rep') {
      if (recordOwnerId && recordOwnerId !== user.id) {
        return { allowed: false, reason: 'لا يمكنك رؤية بيانات غيرك' };
      }
    }

    return { allowed: true };
  }

  /**
   * عنوان الدور بالعربي للعرض في الواجهة
   */
  static getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      sales_rep: 'مندوب',
      sales_supervisor: 'مشرف مناديب',
      branch_manager: 'مدير فرع',
      sales_department_manager: 'مدير قسم المبيعات',
      sector_manager_home: 'مدير القطاع المنزلي',
      sector_manager_electrical: 'مدير القطاع الكهربائي',
      top_management: 'الإدارة العليا',
      technical_support: 'الدعم الفني',
    };
    return labels[role] ?? role;
  }

  /**
   * عنوان القطاع بالعربي
   */
  static getSectorLabel(sector: Sector): string {
    return sector === 'home' ? 'منزلي' : 'كهرباء';
  }
}

export default SectorPermissionService;