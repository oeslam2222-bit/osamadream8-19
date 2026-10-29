import { idbGet, idbSet } from './storageService';
import { UserRole } from '../types';

export const PERMISSIONS_STORAGE_KEY = 'tantawy_custom_permissions_v1';

export interface UserPermissionOverride {
  userId: string;
  allowedTabs: string[];
  updatedAt: string;
}

export interface PermissionDefaults {
  [role: string]: string[];
}

// Default tab sets per role (mirrors ROLE_ALLOWED_TABS in App.tsx)
export const DEFAULT_ROLE_TABS: PermissionDefaults = {
  developer: ['home', 'catalog', 'all_customers', 'customers', 'customer_item_sales', 'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices', 'inventory', 'excel', 'users', 'guide', 'permissions'],
  admin: ['home', 'catalog', 'all_customers', 'customers', 'customer_item_sales', 'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices', 'inventory', 'excel', 'users', 'guide', 'permissions'],
  branch_manager: ['home', 'catalog', 'all_customers', 'customers', 'customer_item_sales', 'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices', 'inventory', 'users', 'guide'],
  supervisor: ['home', 'catalog', 'all_customers', 'customers', 'customer_item_sales', 'dashboard', 'targets', 'visits', 'returns', 'returns_customers', 'invoices', 'inventory', 'users'],
  sales_rep: ['home', 'catalog', 'all_customers', 'customers', 'customer_item_sales', 'targets', 'visits', 'returns', 'returns_customers', 'invoices', 'inventory'],
  legal_advisor: ['home'],
  warehouse_keeper: ['home', 'returns', 'inventory', 'catalog', 'guide'],
};

// All available tabs with labels
export const ALL_AVAILABLE_TABS: { id: string; label: string; icon?: string }[] = [
  { id: 'home', label: 'الرئيسية' },
  { id: 'catalog', label: 'كتالوج المنتجات' },
  { id: 'all_customers', label: 'العملاء' },
  { id: 'customer_item_sales', label: 'مبيعات الأصناف' },
  { id: 'dashboard', label: 'المتابعة والاعتماد' },
  { id: 'targets', label: 'الأهداف والأداء' },
  { id: 'visits', label: 'الزيارات الميدانية' },
  { id: 'returns', label: 'مرتجعات المخزن' },
  { id: 'returns_customers', label: 'عملاء المرتجعات' },
  { id: 'invoices', label: 'الفواتير' },
  { id: 'inventory', label: 'المخزون' },
  { id: 'excel', label: 'الإكسل والمزامنة' },
  { id: 'users', label: 'إدارة المستخدمين' },
  { id: 'guide', label: 'دليل النظام' },
  { id: 'permissions', label: 'الصلاحيات' },
];

export async function getCustomPermissions(): Promise<UserPermissionOverride[]> {
  try {
    const data = await idbGet<UserPermissionOverride[]>(PERMISSIONS_STORAGE_KEY);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveCustomPermissions(overrides: UserPermissionOverride[]): Promise<boolean> {
  try {
    return await idbSet(PERMISSIONS_STORAGE_KEY, overrides);
  } catch {
    return false;
  }
}

export async function getUserAllowedTabs(userId: string, role: UserRole): Promise<string[]> {
  const overrides = await getCustomPermissions();
  const override = overrides.find((o) => o.userId === userId);
  if (override) return override.allowedTabs;
  return DEFAULT_ROLE_TABS[role] || ['home'];
}

export async function setUserAllowedTabs(userId: string, tabs: string[]): Promise<boolean> {
  const overrides = await getCustomPermissions();
  const idx = overrides.findIndex((o) => o.userId === userId);
  const entry: UserPermissionOverride = {
    userId,
    allowedTabs: tabs,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) overrides[idx] = entry;
  else overrides.push(entry);
  return saveCustomPermissions(overrides);
}

export async function resetUserPermissions(userId: string): Promise<boolean> {
  const overrides = await getCustomPermissions();
  const filtered = overrides.filter((o) => o.userId !== userId);
  return saveCustomPermissions(filtered);
}

export function getDefaultTabsForRole(role: UserRole): string[] {
  return DEFAULT_ROLE_TABS[role] || ['home'];
}