import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY_INFO, INITIAL_AUDIT_LOGS, INITIAL_BRANCHES, INITIAL_USERS } from '../data/mockData';
import { DEFAULT_CLOUDINARY_CONFIG } from '../services/cloudinaryService';
import { clearCachedImages } from '../services/imageCacheService';
import { idbClear, idbDelete, idbGet, idbSet, debouncedIdbSet, safeLocalStorageSet } from '../services/storageService';
import {
  doesCustomerBelongToBranch,
  doesCustomerBelongToRep,
  findOwningSalesRep,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  isBranchMatch,
  normalizeArabicText,
  getBranchStockForProduct,
  inferBranchFromText,
  sanitizeAndDeduplicateUsers,
  resolveBranchName,
  normalizeBranchKey,
  findCustomerMatch,
  setActiveCustomersCache,
} from '../services/arabicMatchingService';
import {
  deleteInvoiceFromSupabase,
  deleteAllInvoicesFromSupabase,
  deleteUserFromSupabase,
  deleteVisitFromSupabase,
  fetchCustomersFromSupabase,
  fetchCustomerContentStamp,
  fetchInvoicesFromSupabase,
  fetchProductsFromSupabase,
  fetchTargetsFromSupabase,
  fetchVisitsFromSupabase,
  saveTargetsToSupabase,
  saveVisitsToSupabase,
  fetchForecastsByMonthFromSupabase,
  fetchForecastsByYearFromSupabase,
  InvoiceFetchScope,
  saveForecastsToSupabase,
  fetchForecastMonthPlansFromSupabase,
  saveForecastMonthPlanToSupabase,
  fetchCustomerCommentsFromSupabase,
  saveCustomerCommentsToSupabase,
  deleteCustomerCommentFromSupabase,
  deleteForecastFromSupabase,
  fetchUsersFromSupabase,
  findUserInSupabase,
  sanitizeEmail,
  sanitizeIdentifier,
  saveCustomersToSupabase,
  replaceCustomersInSupabase,
  saveInvoiceToSupabase,
  saveInvoicesToSupabase,
  saveCustomerToSupabase,
  deleteCustomerFromSupabase,
  saveProductsToSupabase,
  saveUsersToSupabase,
  saveUserToSupabase,
  supabase,
  SupabaseSyncStatus,
  testSupabaseConnection,
  USER_SYNC_STORE_ID,
} from '../services/supabaseService';
import { currentMonthKey } from '../services/forecastService';
import { sendOrderToMicrosoft365 } from '../services/microsoftSyncService';
import { sendInvoiceToPowerAutomate } from '../services/powerAutomateService';
import {
  exportTargetsToExcel,
  filterTargetsForUser,
  generateSampleTargets,
  parseTargetExcel,
  fetchTargetsFromGoogleSheetUrl,
} from '../services/targetService';
import { saveSingleSourceUrl, getPublishedDataSources, getSavedSourceUrl } from '../services/dataSourceService';
import {
  fetchRemoteDataVersion,
  getLocalDataVersion,
  saveLocalDataVersion,
  isClientVersionStale,
  publishNewDataVersion,
  purgeLocalDataCaches,
  GlobalDataVersionMeta,
  SyncScope,
  GLOBAL_VERSION_RECORD_ID,
} from '../services/dataVersionService';
import {
  AccountingSyncLog,
  AuditLog,
  Branch,
  CollectionForecastRecord,
  ForecastMonthPlan,
  CustomerCommentRecord,
  CartItem,
  CloudinaryConfig,
  CompanyInfo,
  Customer,
  CustomerVisit,
  InventoryTransaction,
  Invoice,
  OrderStatus,
  Product,
  ReturnedItem,
  ReturnRecord,
  TargetRecord,
  User,
  UserApprovalStatus,
  UserRole,
  VisitReviewStatus,
} from '../types';
import { AppContextType } from './appContextTypes';
import {
  STORAGE_KEYS,
  getDeletedInvoiceIds,
  markInvoiceAsDeletedInStorage,
  getDeletedVisitIds,
  markVisitAsDeletedInStorage,
  readLegacyVisitsMirror,
  clearLegacyVisitsMirror,
  firstNumber,
  resolveDues,
  buildCustomersFingerprint,
  saveLocalCustomersFingerprint,
  getLocalCustomersFingerprint,
  normalizeBranchName,
  hasDuplicateUserIdentity,
  sanitizeProducts,
  deduplicateCustomersArray,
  deduplicateTargetRecords,
  deduplicateProductArray,
  productIdentityKey,
  sanitizeCustomers,
} from './appContextHelpers';
import { useUiPreferences } from './useUiPreferences';
import { resolveCustomerDuesValue } from '../services/customerDues';
import { hashPassword, verifyPassword, withHashedCredential } from '../services/passwordService';
import {
  getAuthMode,
  getServerSessionAsync,
  isServerAuthEnabled,
  linkAuthUserToProfile,
  signOutServer,
  tryServerSignIn,
} from '../services/authService';
import {
  QueuedMutation,
  enqueueMutation,
  enqueueMutations,
  countQueuedMutations,
  getQueuedMutations,
  markQueuedMutationFailure,
  removeQueuedMutations,
} from '../services/offlineQueueService';

/** سطور السيرفر → سجلات التوقعات (نفس الخريطة للبوت وللتحميل حسب الطلب). */
function mapForecastRows(rows: any[]): CollectionForecastRecord[] {
  return rows.map((r: any) => ({
    id: r.id,
    monthKey: r.month_key ?? r.monthKey,
    weekIndex: Number(r.week_index ?? r.weekIndex ?? 1),
    repId: r.rep_id ?? r.repId ?? '',
    repName: r.rep_name ?? r.repName ?? '',
    branchName: r.branch_name ?? r.branchName ?? '',
    customerId: r.customer_id ?? r.customerId ?? '',
    customerCode: r.customer_code ?? r.customerCode ?? '',
    customerName: r.customer_name ?? r.customerName ?? '',
    collectionForecast: Number(r.collection_forecast ?? r.collectionForecast ?? 0),
    salesForecast: Number(r.sales_forecast ?? r.salesForecast ?? 0),
    status: (r.status ?? 'draft') as CollectionForecastRecord['status'],
    submittedAt: r.submitted_at ?? r.submittedAt ?? undefined,
    approvedBy: r.approved_by ?? r.approvedBy ?? undefined,
    approvedAt: r.approved_at ?? r.approvedAt ?? undefined,
    changeRequestNote: r.change_request_note ?? r.changeRequestNote ?? undefined,
    changeRequestedBy: r.change_requested_by ?? r.changeRequestedBy ?? undefined,
    changeRequestedAt: r.change_requested_at ?? r.changeRequestedAt ?? undefined,
    updatedBy: r.updated_by ?? r.updatedBy ?? undefined,
    updatedAt: r.updated_at ?? r.updatedAt ?? undefined,
  }));
}

/** سطور السيرفر → سجلات كومنتات العملاء. */
function mapCommentRows(rows: any[]): CustomerCommentRecord[] {
  return rows.map((r: any) => ({
    id: r.id,
    customerId: r.customer_id ?? r.customerId ?? '',
    customerCode: r.customer_code ?? r.customerCode ?? '',
    customerName: r.customer_name ?? r.customerName ?? '',
    branchName: r.branch_name ?? r.branchName ?? '',
    repName: r.rep_name ?? r.repName ?? '',
    kind: (r.kind ?? 'note') as CustomerCommentRecord['kind'],
    body: r.body ?? '',
    authorName: r.author_name ?? r.authorName ?? '',
    createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? r.updatedAt ?? undefined,
    // حالة الأرشفة بتقرأ من السيرفر. قبل كده كانت مش متقراش، فأي
    // تعليق مش مهم كان بيتنهض من الأرشيف أول ما السيرفر يردّ على أي
    // عميل جديد (لأن القراءة كانت بتبني سجل جديد من الصفحة).
    // الأعمدة دي محتاجة supabase/fix_forecast_rls.sql — من غيرها
    // undefined بيرجّع false وده سلوك الـfallback الطبيعي.
    isArchived: !!(r.is_archived ?? r.isArchived),
    archivedAt: r.archived_at ?? r.archivedAt ?? undefined,
    archivedBy: r.archived_by ?? r.archivedBy ?? undefined,
  }));
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * نطاق جلب الفواتير حسب الدور. كل جهاز بيحمل
 * فواتيره هو بس بدل فواتير كل الفروع — ده
 * أكبر بند في نقل البيانات (500 سطر × جدولين
 * في كل إقلاع على كل جهاز).
 */
function buildInvoiceFetchScope(currentUser: User | null, users: User[]): InvoiceFetchScope {
  if (!currentUser) return { limit: 150 };
  if (currentUser.role === 'sales_rep') {
    return { repIds: [currentUser.id], limit: 150 };
  }
  if (currentUser.role === 'supervisor') {
    const repIds = users
      .filter((u) => u.id === currentUser.id || u.supervisorId === currentUser.id)
      .map((u) => u.id);
    return { repIds: repIds.length > 0 ? repIds : undefined, limit: 300 };
  }
  if (currentUser.role === 'branch_manager') {
    const repIds = users
      .filter((u) => u.branchName === currentUser.branchName)
      .map((u) => u.id);
    return { repIds: repIds.length > 0 ? repIds : undefined, limit: 300 };
  }
  return { limit: 500 };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth and Session Notice
  const [authTerminationNotice, setAuthTerminationNotice] = useState<string | null>(null);
  // فحص اتصال Supabase Auth: بيقول للإدارة هل الـ migration اتنفّذ ولا لأ.
  // بيتحدّث مرة واحدة عند الإقلاع وخلاص — مفيش أي طلبات متكررة.
  const [serverAuthProbe, setServerAuthProbe] = useState<{
    checked: boolean;
    reachable: boolean;
    lastCheckedAt?: string;
  }>({ checked: false, reachable: false });

  useEffect(() => {
    if (!isServerAuthEnabled()) {
      setServerAuthProbe({ checked: true, reachable: false, lastCheckedAt: new Date().toISOString() });
      return;
    }
    let cancelled = false;
    // getSession بيرجع بهدوء لو مفيش جلسة — الفرق بين "Supabase Auth مش
    // مفعّل أصلاً" و "مفيش حد داخل دلوقتي" مش مهم للإدارة هنا، اللي
    // مهم إن الاتصال بالمشروع شغال.
    getServerSessionAsync()
      .catch(() => null)
      .then(() => {
        if (cancelled) return;
        setServerAuthProbe({ checked: true, reachable: true, lastCheckedAt: new Date().toISOString() });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const clearAuthTerminationNotice = () => setAuthTerminationNotice(null);

  // Initialize state with localStorage fallbacks, ensuring all core initial users are merged
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!saved) return INITIAL_USERS;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0
        ? sanitizeAndDeduplicateUsers(parsed).deduplicated
        : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  // Ref mirror so long-lived effects always see the current user list when
  // linking customers to their sales rep, without re-subscribing the listener.
  const usersRef = useRef<User[]>(users);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // Timestamp of the last authoritative customer write made by THIS client.
  // While it is recent, the heartbeat must not replace local data with a
  // server copy that has not caught up yet (that caused correct data to revert).
  const authoritativeWriteAtRef = useRef<number>(0);

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
    const savedSession = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_DATA);
    if (!savedSession) return null;
    try {
      return JSON.parse(savedSession) as User;
    } catch {
      return null;
    }
  });

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    const saved = localStorage.getItem('dream_dist_company_info_v1');
    if (saved) {
      try {
        return { ...COMPANY_INFO, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Error parsing saved company info', e);
      }
    }
    return COMPANY_INFO;
  });

  const updateCompanyInfo = (newInfo: Partial<CompanyInfo>) => {
    setCompanyInfo((prev) => {
      const updated: CompanyInfo = { ...prev, ...newInfo };
      safeLocalStorageSet('dream_dist_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const resetCompanyInfo = () => {
    setCompanyInfo(COMPANY_INFO);
    safeLocalStorageSet('dream_dist_company_info_v1', JSON.stringify(COMPANY_INFO));
  };

  // Branch-specific company headers and identities (Isolation per branch)
  const [branchCompanyInfo, setBranchCompanyInfo] = useState<Record<string, Partial<CompanyInfo>>>(() => {
    const saved = localStorage.getItem('dream_dist_branch_company_info_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved branch company info', e);
      }
    }
    return {};
  });

  // Target Records state (KPIs and Goals) - Strictly real data only
  const [targets, setTargets] = useState<TargetRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TARGETS);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Discard any dummy sample records to ensure 100% real data
        return parsed.filter((r) => r && !String(r.id).startsWith('sample-trg'));
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(targets));
    } catch (e) {
      console.error('Error saving targets to localStorage', e);
    }
  }, [targets]);

  /* ============================================================
     توقع التحصيلات — state
     localStorage أولاً (أوفلاين يشتغل)، بعدين Supabase للمشاركة.
     ============================================================ */

  const [forecasts, setForecasts] = useState<CollectionForecastRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FORECASTS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  /**
   * الشهور اللي اتحملت فعلاً. التوقعات مش بتتحمل كلها من البوت
   * (كان بيصل لـ 50 ألف سطر) — الشهر الحالي بس، وباقي الشهور
   * بتتحمل لما المستخدم يفتحها. الكاش المحلي بيكون بذرة للشهور
   * اللي اتحملت قبل كده عشان الأوفلاين.
   */
  const loadedForecastMonthsRef = useRef<Set<string> | null>(null);
  if (loadedForecastMonthsRef.current === null) {
    loadedForecastMonthsRef.current = new Set<string>();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FORECASTS);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.forEach((f: any) => {
          const key = f?.monthKey ?? f?.month_key;
          if (typeof key === 'string' && key) loadedForecastMonthsRef.current!.add(key);
        });
      }
    } catch { /* ignore */ }
  }

  const [forecastPlans, setForecastPlans] = useState<ForecastMonthPlan[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FORECAST_PLANS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [customerComments, setCustomerComments] = useState<CustomerCommentRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMER_COMMENTS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FORECASTS, JSON.stringify(forecasts));
    } catch (e) {
      console.error('Error saving forecasts to localStorage', e);
    }
  }, [forecasts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FORECAST_PLANS, JSON.stringify(forecastPlans));
    } catch (e) {
      console.error('Error saving forecast plans to localStorage', e);
    }
  }, [forecastPlans]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOMER_COMMENTS, JSON.stringify(customerComments));
    } catch (e) {
      console.error('Error saving customer comments to localStorage', e);
    }
  }, [customerComments]);

  // Load the shared copy so every device and every role sees the same numbers.
  // التوقعات: الشهر الحالي بس من السيرفر — الجلب الكامل كان
  // بيصل لـ 50 ألف سطر في 50 طلب متتالي. باقي الشهور بتتحمل
  // لما المستخدم يفتحها (loadForecastsForMonth).
  // كومنتات العملاء (حتى 20 ألف سطر) مش بتتحمل هنا —
  // بتتحمل لما الفيوهات اللي بتستخدمها تفتح (loadCustomerComments).
  useEffect(() => {
    let cancelled = false;
    const bootMonth = currentMonthKey();
    loadedForecastMonthsRef.current?.add(bootMonth);
    (async () => {
      const [fRes, pRes] = await Promise.all([
        fetchForecastsByMonthFromSupabase(bootMonth),
        fetchForecastMonthPlansFromSupabase(),
      ]);
      if (cancelled) return;
      if (fRes.success) {
        const mapped = mapForecastRows(fRes.forecasts || []);
        // استبدال صفوف الشهر الحالي بس — الشهور المحفوظة محلياً
        // بتفضل مكانها (أوفلاين) لحد ما تُفتح من السيرفر.
        setForecasts((prev) => [
          ...prev.filter((f) => f.monthKey !== bootMonth),
          ...mapped,
        ]);
      }
      if (pRes.success && pRes.plans) {
        const mappedPlans: ForecastMonthPlan[] = pRes.plans.map((r: any) => ({
          id: r.id,
          year: Number(r.year),
          month: Number(r.month),
          monthStart: r.month_start ?? r.monthStart,
          monthEnd: r.month_end ?? r.monthEnd,
          weeks: Array.isArray(r.weeks) ? r.weeks : [],
          isClosed: !!(r.is_closed ?? r.isClosed),
          createdBy: r.created_by ?? r.createdBy ?? undefined,
          createdAt: r.created_at ?? r.createdAt ?? undefined,
          updatedBy: r.updated_by ?? r.updatedBy ?? undefined,
          updatedAt: r.updated_at ?? r.updatedAt ?? undefined,
        }));
        setForecastPlans(mappedPlans);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * تحميل توقعات شهر من السيرفر ودمجها في الحالة. الشهر
   * اللي اتحمل قبل كده ميتعاودش — ده اللي بيخلي الفتح
   * خفيف بدل تحميل كل الشهور من أول ما التطبيق يشتغل.
   */
  const loadForecastsForMonth = useCallback(async (monthKey: string) => {
    if (!monthKey || loadedForecastMonthsRef.current?.has(monthKey)) return;
    const res = await fetchForecastsByMonthFromSupabase(monthKey);
    if (!res.success) return;
    loadedForecastMonthsRef.current?.add(monthKey);
    const mapped = mapForecastRows(res.forecasts || []);
    setForecasts((prev) => [
      ...prev.filter((f) => f.monthKey !== monthKey),
      ...mapped,
    ]);
  }, []);

  /**
   * توقعات سنة كاملة (لوحة الإدارة). السيرفر بيرجع السنة
   * كلها في نطاق واحد، فكل شهورها بتتحدّث محلياً وتتعمل
   * loaded — حتى الشهور الفاضية عشان ما تُعاد جلبتها.
   */
  const loadForecastsForYear = useCallback(async (year: number) => {
    if (!year) return;
    const res = await fetchForecastsByYearFromSupabase(year);
    if (!res.success) return;
    const mapped = mapForecastRows(res.forecasts || []);
    const prefix = `${year}-`;
    const loaded = loadedForecastMonthsRef.current;
    if (loaded) {
      for (let m = 1; m <= 12; m++) loaded.add(`${year}-${String(m).padStart(2, '0')}`);
    }
    setForecasts((prev) => [
      ...prev.filter((f) => !f.monthKey?.startsWith(prefix)),
      ...mapped,
    ]);
  }, []);

  /**
   * كومنتات العملاء (حتى 20 ألف سطر) مش بتتحمل
   * في الإقلاع — بتتحمل مرة واحدة لما الفيوهات
   * اللي بتستخدمها تفتح. الكاش المحلي بيكون
   * بذرة عشان الأوفلاين.
   */
  const customerCommentsLoadedRef = useRef<boolean | null>(null);
  if (customerCommentsLoadedRef.current === null) {
    customerCommentsLoadedRef.current = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMER_COMMENTS);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        customerCommentsLoadedRef.current = true;
      }
    } catch { /* ignore */ }
  }

  const loadCustomerComments = useCallback(async () => {
    if (customerCommentsLoadedRef.current) return;
    customerCommentsLoadedRef.current = true;
    const res = await fetchCustomerCommentsFromSupabase();
    if (!res.success) {
      // فشل الشبكة — نسمح بإعادة المحاولة عند الفتح التالي
      customerCommentsLoadedRef.current = false;
      return;
    }
    setCustomerComments(mapCommentRows(res.comments || []));
  }, []);


  // Load targets from the shared database so every device and role sees the same sheet update.
  useEffect(() => {
    let cancelled = false;
    fetchTargetsFromSupabase().then(async (result) => {
      if (!cancelled && result.success && result.targets && result.targets.length > 0) {
        const mapped: TargetRecord[] = result.targets.map((row: any) => ({
          id: String(row.id), branch: resolveBranchName(row.branch) || row.branch || '', repName: row.rep_name || '',
          salesTarget: Number(row.sales_target || 0), salesAchieved: Number(row.sales_achieved || 0),
          salesPercentage: Number(row.sales_percentage || 0), collectionTarget: Number(row.collection_target || 0),
          collectionAchieved: Number(row.collection_achieved || 0), collectionPercentage: Number(row.collection_percentage || 0),
          date: row.target_date || '', month: Number(row.month), year: Number(row.year), quarter: row.quarter,
          remainingSales: Number(row.remaining_sales || 0), remainingCollection: Number(row.remaining_collection || 0),
          updatedAt: row.updated_at, notes: row.notes || undefined,
        }));
        setTargets(mapped);
      } else {
        // If Supabase has no target records yet, check if there's a saved published Google Sheet URL
        const savedSources = getPublishedDataSources();
        if (savedSources.targets?.enabled && savedSources.targets?.url && /^https?:\/\//i.test(savedSources.targets.url.trim())) {
          try {
            const sheetTargets = await fetchTargetsFromGoogleSheetUrl(savedSources.targets.url);
            if (!cancelled && sheetTargets && sheetTargets.length > 0) {
              const deduped = deduplicateTargetRecords(sheetTargets);
              setTargets(deduped);
              saveTargetsToSupabase(deduped).catch(() => {});
            }
          } catch (e: any) {
            console.warn('Target Google Sheet background auto-sync standby note:', e?.message || e);
          }
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  const getVisibleTargets = () => {
    return filterTargetsForUser(targets, currentUser, users, customers);
  };

  const importTargetsFromExcel = async (file: File): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const parsed = await parseTargetExcel(file);
      if (!parsed || parsed.length === 0) {
        return { success: false, count: 0, message: 'لم يتم العثور على أي صفوف أهداف صالحة في الملف.' };
      }
      // Clean mirror without accumulating past duplicates: only display current sheet rows
      const deduplicated = deduplicateTargetRecords(parsed);
      setTargets(deduplicated);
      await saveTargetsToSupabase(deduplicated);
      publishNewDataVersion({
        scope: 'targets',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث شيت الأهداف والمحققات البيعية (${deduplicated.length} هدف)`,
        targetsCount: deduplicated.length,
        forcePurge: true,
      }).catch(() => {});
      return { success: true, count: deduplicated.length, message: `تم تحديث ومزامنة ${deduplicated.length} هدف بنجاح بدون تكرار السجلات!` };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'حدث خطأ أثناء قراءة ملف الإكسل' };
    }
  };

  const importTargetsFromGoogleSheet = async (url: string): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const cleanUrl = url.trim();
      if (!cleanUrl) {
        return { success: false, count: 0, message: 'يرجى إدخال رابط شيت جوجل صالح.' };
      }
      const parsed = await fetchTargetsFromGoogleSheetUrl(cleanUrl);
      if (!parsed || parsed.length === 0) {
        return { success: false, count: 0, message: 'لم يتم العثور على أي صفوف أهداف صالحة داخل شيت جوجل.' };
      }
      // Clean mirror without accumulating past duplicates: only display current sheet rows
      const deduplicated = deduplicateTargetRecords(parsed);
      setTargets(deduplicated);
      await saveTargetsToSupabase(deduplicated);
      publishNewDataVersion({
        scope: 'targets',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث شيت الأهداف من Google Sheets (${deduplicated.length} هدف)`,
        targetsCount: deduplicated.length,
        forcePurge: true,
      }).catch(() => {});
      saveSingleSourceUrl('targets', cleanUrl);
      return { success: true, count: deduplicated.length, message: `تمت مزامنة وتحديث ${deduplicated.length} هدف بنجاح بدون تكرار وحفظ الرابط!` };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'فشل الاتصال برابط شيت Google Sheets' };
    }
  };

  const exportTargetsReport = async () => {
    const visible = getVisibleTargets();
    const branchPart = currentUser?.branchName ? `${currentUser.branchName.replace(/\s+/g, '_')}_` : '';
    const userPart = currentUser?.name ? `${currentUser.name.replace(/\s+/g, '_')}_` : '';
    const dateStr = new Date().toISOString().slice(0, 10);
    await exportTargetsToExcel(visible, `أهداف_${branchPart}${userPart}${dateStr}.xlsx`);
  };

  const resetTargetsToDefault = () => {
    setTargets([]);
  };

  const addOrUpdateTargetRecord = (record: TargetRecord) => {
    setTargets((prev) => {
      const identity = `${normalizeArabicText(record.branch)}__${normalizeArabicText(record.repName)}__${String(record.date || '').trim()}`;
      const idx = prev.findIndex((r) =>
        r.id === record.id ||
        `${normalizeArabicText(r.branch)}__${normalizeArabicText(r.repName)}__${String(r.date || '').trim()}` === identity
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [record, ...prev];
    });
    scheduleTargetSync();
  };

  const deleteTargetRecord = (id: string) => {
    setTargets((prev) => prev.filter((r) => r.id !== id));
    scheduleTargetSync();
  };

  const updateBranchCompanyInfo = (branchName: string, newInfo: Partial<CompanyInfo>) => {
    if (!branchName) return;
    const norm = normalizeBranchName(branchName);
    setBranchCompanyInfo((prev) => {
      const updated = {
        ...prev,
        [norm]: {
          ...(prev[norm] || {}),
          ...newInfo,
        },
      };
      safeLocalStorageSet('dream_dist_branch_company_info_v1', JSON.stringify(updated));
      return updated;
    });

    const notifEmails = (newInfo.notificationEmails || [])
      .filter((e) => Boolean(e && typeof e === 'string' && e.includes('@')))
      .map((e) => e.trim());
    const primaryEmail = newInfo.email?.trim() || notifEmails[0] || '';

    setBranches((prev) => {
      const next = prev.map((b) => {
        if (b.name === branchName || isBranchMatch(b.name, branchName, { allowUnassigned: false })) {
          const combined = Array.from(new Set([
            ...(primaryEmail ? [primaryEmail] : []),
            ...notifEmails,
          ]));
          return {
            ...b,
            email: primaryEmail || b.email,
            notificationEmails: combined.length > 0 ? combined : b.notificationEmails,
          };
        }
        return b;
      });
      safeLocalStorageSet(STORAGE_KEYS.BRANCHES, JSON.stringify(next));
      return next;
    });
  };

  const resetBranchCompanyInfo = (branchName: string) => {
    if (!branchName) return;
    const norm = normalizeBranchName(branchName);
    setBranchCompanyInfo((prev) => {
      const updated = { ...prev };
      delete updated[norm];
      safeLocalStorageSet('dream_dist_branch_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const getCompanyInfoForBranch = (branchName?: string): CompanyInfo => {
    if (!branchName) return companyInfo;
    const norm = normalizeBranchName(branchName);
    const branchOverride = branchCompanyInfo[norm] || branchCompanyInfo[branchName];
    const matchedBranch = branches.find(
      (b) => b.name === norm || isBranchMatch(b.name, branchName, { allowUnassigned: false })
    );

    if (branchOverride && Object.keys(branchOverride).length > 0) {
      return {
        ...companyInfo,
        notificationEmails: branchOverride.notificationEmails || matchedBranch?.notificationEmails || [],
        ...branchOverride,
      };
    }
    // Fallback: match branch data
    if (matchedBranch) {
      return {
        ...companyInfo,
        email: matchedBranch.email || companyInfo.email,
        notificationEmails: matchedBranch.notificationEmails || [],
        address: matchedBranch.address || companyInfo.address,
        phone: matchedBranch.phone ? `${matchedBranch.phone} / ${companyInfo.customerService}` : companyInfo.phone,
      };
    }
    return companyInfo;
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.IS_AUTH) === 'true';
  });

  // Never accept a user/session transferred through a URL or an old browser cache.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    supabase.auth.getSession().catch(() => null);
  }, []);


  const [products, setProducts] = useState<Product[]>(() => {
    return [];
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    return [];
  });

  // Data Version Sync State (آلية إصدار التحديثات ومسح الكاش التلقائي لضمان عدم التدبيل)
  const [globalDataVersion, setGlobalDataVersion] = useState<GlobalDataVersionMeta | null>(() => getLocalDataVersion());
  const [isVersionSyncing, setIsVersionSyncing] = useState<boolean>(false);
  const [lastVersionSyncNotice, setLastVersionSyncNotice] = useState<string | null>(null);
  const clearVersionSyncNotice = () => setLastVersionSyncNotice(null);

  /**
   * الزيارات بتبدأ فاضية وبتتملّى من IndexedDB.
   *
   * كانت بتتقرأ من localStorage كـseed أول فتح، لكن المفتاح ده كان نسخة
   * كاملة من السجل (نحو 1MB عند 4,000 زيارة). الـseed كان مش ضروري خالص لأن
   * IndexedDB بيتكتب **فورًا** مع كل تعديل، فأي زيارة اتسجّلت على الجهاز
   * موجودة هناك قبل إعادة التحميل. والقراءة دي كانت برضه block على الـmain
   * thread قبل أول رسم.
   */
  const [visits, setVisits] = useState<CustomerVisit[]>(() => []);

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    return [];
  });

  const [isLocalDataHydrated, setIsLocalDataHydrated] = useState(false);

  /**
   * عدّاد جيل الاشتراكات اللحظية.
   *
   * بتزيده مرة واحدة بس لما الصفحة ترجع من الـBack-Forward Cache. المتصفح
   * بيكسر أي WebSocket مفتوح لما يدخل الـBFCache، والصفحة بتترجم حالتها
   * وجواها الكانال لسه فاكر نفسه «متوصّل» — فبيفضل ميت من غير ما يعمل
   * rejoin تلقائي. زيادة العدّاد بتخلّي الـeffects بتاعت الـrealtime تتشال
   * وتتبني من جديد بقنوات سليمة.
   *
   * ليه state في React مش استدعاء مباشر: عشان إعادة الاشتراك متبقاش شغل
   * جوار الـimperative، ونفس الـcleanup بتاع الـchannels بيشتغل عادي.
   */
  const [dataEpoch, setDataEpoch] = useState(0);

  const [cart, setCart] = useState<CartItem[]>([]);

  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CLOUDINARY);
    return saved ? JSON.parse(saved) : DEFAULT_CLOUDINARY_CONFIG;
  });

  const [accountingLogs, setAccountingLogs] = useState<AccountingSyncLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACCOUNTING_LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [inventoryLogs] = useState<InventoryTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Cleanup lingering audit & inventory logs from storage to save space and keep app ultra-lightweight
  useEffect(() => {
    try {
      localStorage.removeItem('dream_dist_inv_logs_v5');
      localStorage.removeItem('dream_dist_audit_logs_v7');
      idbDelete('dream_dist_audit_logs_v7').catch(() => {});
    } catch {}
  }, []);

  // Keep active customers cache in sync for instant financial auditing across Excel & PDF exports
  useEffect(() => {
    if (customers && customers.length > 0) {
      setActiveCustomersCache(customers);
      idbSet(STORAGE_KEYS.CUSTOMERS, customers).catch(() => {});
      try {
        safeLocalStorageSet(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers.slice(0, 300)));
      } catch {}
    }
  }, [customers]);

  /**
   * حفظ الزيارات — IndexedDB بس.
   *
   * كان فيه مرآة تانية في localStorage بنفس السجل كامل. المرآة دي كانت بتعمل
   * `JSON.stringify` للمصفوفة كلها (نحو 1MB عند 4,000 زيارة) + كتابة متزامنة
   * بتوقف الـmain thread، وده بيتكرر مع **كل** ضغطة حالة على الزيارة. مع 400
   * جهاز الشغل ده بيتضاعف 400 مرة على نفس البنية التحتية.
   *
   * المرآة مش بتضيف حاجة: IndexedDB بيتكتب فورًا مع كل تعديل (async، بره الـmain
   * thread)، والـboot path بيقرأ منه ويدمجه. والـquota بتاع localStorage ~5MB
   * للأصل كله، فنسخة الـ1MB دي كانت بتزاحم عملاء وأصناف.
   *
   * النسخة القديمة بتتقري مرة واحدة وقت الإقلاع وبتتمسح فورًا بعد ما تتدمج
   * (تحت في hydrateFromIndexedDB) — مش وقت كل تعديل.
   */
  const persistVisits = useCallback((next: CustomerVisit[]) => {
    idbSet(STORAGE_KEYS.VISITS, next).catch(() => {});
  }, []);

  useEffect(() => {
    persistVisits(visits);
  }, [visits, persistVisits]);

  // Persist users to IndexedDB and localStorage so offline sessions and registered reps are immediately available
  useEffect(() => {
    if (users && users.length > 0) {
      idbSet(STORAGE_KEYS.USERS, users);
      safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
  }, [users]);

  // Persist active session across browser refreshes and tab reloads
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(currentUser));
    } else if (!isAuthenticated || !currentUser) {
      localStorage.removeItem(STORAGE_KEYS.IS_AUTH);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_DATA);
    }
  }, [currentUser, isAuthenticated]);

  // Keep active currentUser in sync with updated users list (e.g. role update, branch change, account status, or deletion)
  useEffect(() => {
    if (currentUser) {
      if (users.length > 0) {
        const fresh = users.find((u) => u.id === currentUser.id);
        if (!fresh && currentUser.id !== 'u-admin-osama') {
          // User was permanently deleted from the database
          logout();
          setAuthTerminationNotice('تم حذف هذا الحساب من قاعدة البيانات بواسطة إدارة الشركة. تم إنهاء الجلسة ولا يمكن تسجيل الدخول بهذا الحساب.');
        } else if (fresh) {
          if (fresh.approvalStatus === 'rejected' || fresh.isActive === false) {
            logout();
            setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل الإدارة.');
          } else if (
            fresh.role !== currentUser.role ||
            fresh.branchName !== currentUser.branchName ||
            fresh.supervisorId !== currentUser.supervisorId ||
            fresh.name !== currentUser.name ||
            fresh.approvalStatus !== currentUser.approvalStatus
          ) {
            setCurrentUser(fresh);
          }
        }
      }
    }
  }, [users]);

  const recordAuditLog = (_logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>) => {
    // Audit logs disabled as requested by user to keep the app ultra-clean and lightweight
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    try {
      localStorage.removeItem('dream_dist_audit_logs_v7');
    } catch {}
  };

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');

  const {
    installPromptEvent,
    canInstallPwa,
    isInstallModalOpen,
    setIsInstallModalOpen,
    dataSaverMode,
    setDataSaverMode,
    toggleDataSaverMode,
    isPrivacyMode,
    togglePrivacyMode,
    setPrivacyMode,
    formatConfidentialCurrency,
    triggerInstallPrompt,
  } = useUiPreferences();

  // Hydrate high-capacity collections from IndexedDB seamlessly on startup
  useEffect(() => {
    let isMounted = true;
    async function hydrateFromIndexedDB() {
      try {
        const [savedProducts, savedCustomers, savedInvoices, savedCart, savedVisits] = await Promise.all([
          idbGet<Product[]>(STORAGE_KEYS.PRODUCTS),
          idbGet<Customer[]>(STORAGE_KEYS.CUSTOMERS),
          idbGet<Invoice[]>(STORAGE_KEYS.INVOICES),
          idbGet<CartItem[]>(STORAGE_KEYS.CART),
          idbGet<CustomerVisit[]>(STORAGE_KEYS.VISITS),
        ]);

        if (!isMounted) return;
        if (Array.isArray(savedProducts)) setProducts(sanitizeProducts(savedProducts));
        if (Array.isArray(savedCustomers)) {
          const sanitized = sanitizeCustomers(savedCustomers);
          const deduped = deduplicateCustomersArray(sanitized);
          setCustomers(deduped);
          saveLocalCustomersFingerprint(deduped);
          if (deduped.length !== savedCustomers.length) {
            idbSet(STORAGE_KEYS.CUSTOMERS, deduped).catch(() => {});
          }
        }
        if (Array.isArray(savedInvoices)) {
          const deletedSet = getDeletedInvoiceIds();
          const filtered = savedInvoices.filter(
            (inv: Invoice) => !deletedSet.has(inv.id) && !deletedSet.has(inv.invoiceNumber)
          );
          setInvoices(filtered);
        }
        if (Array.isArray(savedCart)) setCart(savedCart);

        // Hydrate & merge visits from IndexedDB, the legacy localStorage mirror (read once,
        // see migrateLegacyVisitsMirror), and customer visit histories
        const allVisitsMap = new Map<string, CustomerVisit>();
        const deletedVisitIds = getDeletedVisitIds();
        if (Array.isArray(savedVisits)) {
          savedVisits.forEach((v) => {
            if (v && v.id && !deletedVisitIds.has(v.id) && !deletedVisitIds.has(v.date)) {
              allVisitsMap.set(v.id, v);
            }
          });
        }
        // الزيارات اللي كانت متخزّنة في مرآة localStorage القديمة.
        // الأجهزة اللي كانت شغالة قبل الإصدار ده ممكن يكون عندها زيارات في
        // localStorage بس، فبنقراها مرة واحدة هنا وبندمجها قبل ما المفتاح
        // يتمسح (التنضيف بيحصل في آخر hydrateFromIndexedDB تحت).
        const legacyVisits = readLegacyVisitsMirror();
        if (legacyVisits.length > 0) {
          legacyVisits.forEach((v) => {
            if (v && v.id && !deletedVisitIds.has(v.id) && !deletedVisitIds.has(v.date)) {
              if (!allVisitsMap.has(v.id)) allVisitsMap.set(v.id, v);
            }
          });
        }
        if (Array.isArray(savedCustomers)) {
          savedCustomers.forEach((c) => {
            if (Array.isArray(c.visitHistory)) {
              c.visitHistory.forEach((v) => {
                if (v) {
                  const vid = v.id || `visit-${c.id}-${v.date}`;
                  if (!allVisitsMap.has(vid)) {
                    allVisitsMap.set(vid, {
                      ...v,
                      id: vid,
                      customerId: v.customerId || c.id,
                      customerName: v.customerName || c.name,
                      customerCode: v.customerCode || c.code,
                      branchName: v.branchName || c.branchName,
                      repName: v.repName || c.salesRepName || c.repName || 'المندوب',
                      repId: v.repId || c.repId,
                      status: v.status || 'منفذة',
                    });
                  }
                }
              });
            }
          });
        }
        setVisits((currentVisits) => {
          (currentVisits || []).forEach((v) => {
            if (v && v.id && !allVisitsMap.has(v.id)) allVisitsMap.set(v.id, v);
          });
          const merged = Array.from(allVisitsMap.values());
          // دلوقتي المرآة القديمة اتدمجت في IndexedDB — امسحها عشان ما تفضل
          // متخزّنة. المسح بعد الدمج مش قبله، عشان ما نضيّعش زيارات قديمة.
          if (merged.length > 0) {
            idbSet(STORAGE_KEYS.VISITS, merged).catch(() => {});
            clearLegacyVisitsMirror();
          }
          return merged;
        });
        setIsLocalDataHydrated(true);
        refreshPendingInvoicesCount();
        // حتى لو الدمج مالوش نتيجة (لا IDB ولا مرآة قديمة)، المفتاح القديم
        // لازم يتمسح — تاني مرة هنا مش harmful، والنسخة لو ماقرأتهاش أصلاً.
        clearLegacyVisitsMirror();
      } catch (err) {
        console.warn('IndexedDB initial hydration notice:', err);
        clearLegacyVisitsMirror();
        if (isMounted) setIsLocalDataHydrated(true);
      }
    }

    hydrateFromIndexedDB();
    return () => {
      isMounted = false;
    };
  }, []);

  // Supabase State & Sync
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus>({
    connected: false,
    tableFound: 'جاري الفحص والاتصال...',
  });
  const [isSupabaseSyncing, setIsSupabaseSyncing] = useState<boolean>(false);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState<number>(0);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);

  const refreshPendingInvoicesCount = async () => {
    try {
      const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
      setPendingInvoicesCount(queued.length);
    } catch (e) {
      // Ignore
    }
  };

  const queueInvoiceForSync = async (invoice: Invoice) => {
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    const next = [...queued.filter((item) => item.id !== invoice.id), invoice];
    await idbSet(STORAGE_KEYS.PENDING_INVOICES, next);
    setPendingInvoicesCount(next.length);
  };

  const flushPendingInvoices = async (): Promise<{ success: boolean; syncedCount: number }> => {
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    if (queued.length === 0) {
      setPendingInvoicesCount(0);
      return { success: true, syncedCount: 0 };
    }
    if (!navigator.onLine) {
      return { success: false, syncedCount: 0 };
    }

    try {
      // Batch save with zero freezing and minimal Supabase egress
      const batchResult = await saveInvoicesToSupabase(queued);
      if (batchResult.success) {
        await idbSet(STORAGE_KEYS.PENDING_INVOICES, []);
        setPendingInvoicesCount(0);
        return { success: true, syncedCount: queued.length };
      } else {
        setPendingInvoicesCount(queued.length);
        return { success: false, syncedCount: 0 };
      }
    } catch (e) {
      console.warn('flushPendingInvoices error:', e);
      setPendingInvoicesCount(queued.length);
      return { success: false, syncedCount: 0 };
    }
  };

  const saveInvoiceWithQueue = async (invoice: Invoice) => {
    if (!navigator.onLine) {
      // Instant offline queuing without hanging or waiting for network failure
      await queueInvoiceForSync(invoice);
      return { success: true, queued: true };
    }
    const result = await saveInvoiceToSupabase(invoice);
    if (!result.success) await queueInvoiceForSync(invoice);
    return result;
  };

  // Latest-value refs so the debounced sync helpers below never push a stale
  // snapshot taken when the timer was scheduled.
  const productsRef = useRef<Product[]>(products);
  const targetsRef = useRef<TargetRecord[]>(targets);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { targetsRef.current = targets; }, [targets]);

  const refreshOfflineQueueCount = async () => {
    const queued = await countQueuedMutations();
    setOfflineQueueCount(queued);
    return queued;
  };

  /**
   * Send a mutation now, or park it in the offline outbox when that is not
   * possible. Every write path that can run without a network goes through here,
   * so nothing a rep or an admin does offline is silently dropped.
   */
  const syncOrQueue = async (
    entity: QueuedMutation['entity'],
    op: QueuedMutation['op'],
    entityId: string,
    payload: QueuedMutation['payload'],
    send: () => Promise<{ success: boolean; error?: string }>
  ): Promise<boolean> => {
    if (!navigator.onLine) {
      await enqueueMutation({ entity, op, entityId, payload });
      await refreshOfflineQueueCount();
      return false;
    }
    try {
      const result = await send();
      if (result.success) return true;
    } catch {
      // fall through to the queue below
    }
    await enqueueMutation({ entity, op, entityId, payload });
    await refreshOfflineQueueCount();
    return false;
  };

  // Local save always happens first, so nothing is lost when the device is offline.
  // Changed rows are pushed together, and any failed batch is parked in the outbox.
  const persistForecasts = useCallback(
    async (next: CollectionForecastRecord[], changed: CollectionForecastRecord[]) => {
      setForecasts(next);
      if (!changed.length) return;

      if (navigator.onLine) {
        const result = await saveForecastsToSupabase(changed);
        if (result.success) return;
      }

      await enqueueMutations(changed.map((row) => ({
        entity: 'forecasts' as const,
        op: 'upsert' as const,
        entityId: row.id,
        payload: row,
      })));
      await refreshOfflineQueueCount();
    },
    []
  );

  const saveForecast = useCallback(
    async (record: CollectionForecastRecord) => {
      const stamped = { ...record, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name };
      const next = [...forecasts];
      const idx = next.findIndex((f) => f.id === record.id);
      if (idx >= 0) next[idx] = stamped;
      else next.push(stamped);
      await persistForecasts(next, [stamped]);
    },
    [forecasts, persistForecasts, currentUser]
  );

  const saveForecastBatch = useCallback(
    async (records: CollectionForecastRecord[]) => {
      if (!records.length) return;
      const now = new Date().toISOString();
      const stamped = records.map((record) => ({
        ...record,
        updatedAt: now,
        updatedBy: currentUser?.name,
      }));
      const changedById = new Map(stamped.map((record) => [record.id, record]));
      const next = forecasts.map((record) => changedById.get(record.id) || record);
      const existingIds = new Set(forecasts.map((record) => record.id));
      stamped.forEach((record) => {
        if (!existingIds.has(record.id)) next.push(record);
      });
      await persistForecasts(next, stamped);
    },
    [forecasts, persistForecasts, currentUser]
  );

  const deleteForecast = useCallback(
    async (id: string) => {
      const next = forecasts.filter((f) => f.id !== id);
      setForecasts(next);
      await idbSet(STORAGE_KEYS.FORECASTS, next);
      try {
        window.localStorage.setItem(STORAGE_KEYS.FORECASTS, JSON.stringify(next));
      } catch {}
      await syncOrQueue('forecasts', 'delete', id, undefined, () => deleteForecastFromSupabase(id));
      publishDataVersionUpdate({ scope: 'all' }).catch(() => {});
    },
    [forecasts, syncOrQueue]
  );

  const deleteCustomerForecasts = useCallback(
    async (customerId: string, monthKey: string) => {
      const targetsToDelete = forecasts.filter(
        (f) => f.customerId === customerId && f.monthKey === monthKey
      );
      if (targetsToDelete.length === 0) return;
      const next = forecasts.filter(
        (f) => !(f.customerId === customerId && f.monthKey === monthKey)
      );
      setForecasts(next);
      await idbSet(STORAGE_KEYS.FORECASTS, next);
      try {
        window.localStorage.setItem(STORAGE_KEYS.FORECASTS, JSON.stringify(next));
      } catch {}
      for (const item of targetsToDelete) {
        await syncOrQueue('forecasts', 'delete', item.id, undefined, () => deleteForecastFromSupabase(item.id));
      }
      publishDataVersionUpdate({ scope: 'all' }).catch(() => {});
    },
    [forecasts, syncOrQueue]
  );

  const submitForecastWeek = useCallback(
    async (monthKey: string, weekIndex: number, repId: string) => {
      const now = new Date().toISOString();
      const changedRows: CollectionForecastRecord[] = [];
      const next = forecasts.map((f) => {
        if (f.monthKey !== monthKey || f.weekIndex !== weekIndex || f.repId !== repId) return f;
        if (f.status !== 'draft' && f.status !== 'change_requested') return f;
        const updated = { ...f, status: 'submitted' as const, submittedAt: now, changeRequestNote: undefined, updatedAt: now, updatedBy: currentUser?.name };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

  const approveForecastWeek = useCallback(
    async (monthKey: string, weekIndex: number, repId: string, customerIds?: string[]) => {
      const now = new Date().toISOString();
      const changedRows: CollectionForecastRecord[] = [];
      const customerIdScope = customerIds ? new Set(customerIds) : null;
      const next = forecasts.map((f) => {
        if (f.monthKey !== monthKey || f.weekIndex !== weekIndex || f.repId !== repId) return f;
        if (customerIdScope && !customerIdScope.has(f.customerId)) return f;
        if (f.status !== 'submitted') return f;
        const updated = {
          ...f,
          status: 'approved' as const,
          approvedBy: currentUser?.name || '',
          approvedAt: now,
          changeRequestNote: undefined,
          updatedAt: now,
          updatedBy: currentUser?.name,
        };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

  const approveForecastBatch = useCallback(
    async (monthKey: string, approvals: Array<{ weekIndex: number; repId: string; customerIds: string[] }>) => {
      const now = new Date().toISOString();
      const approvalScopes = new Map(
        approvals.map((approval) => [
          `${approval.repId}::${approval.weekIndex}`,
          new Set(approval.customerIds),
        ])
      );
      const changedRows: CollectionForecastRecord[] = [];
      const next = forecasts.map((forecast) => {
        if (forecast.monthKey !== monthKey) return forecast;
        const customerScope = approvalScopes.get(`${forecast.repId}::${forecast.weekIndex}`);
        if (!customerScope?.has(forecast.customerId) || forecast.status !== 'submitted') return forecast;
        const updated: CollectionForecastRecord = {
          ...forecast,
          status: 'approved',
          approvedBy: currentUser?.name || '',
          approvedAt: now,
          changeRequestNote: undefined,
          updatedAt: now,
          updatedBy: currentUser?.name,
        };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

  const requestForecastChange = useCallback(
    async (monthKey: string, weekIndex: number, repId: string, note: string) => {
      const now = new Date().toISOString();
      const changedRows: CollectionForecastRecord[] = [];
      const next = forecasts.map((f) => {
        if (f.monthKey !== monthKey || f.weekIndex !== weekIndex || f.repId !== repId) return f;
        const updated = {
          ...f,
          status: 'change_requested' as const,
          changeRequestNote: note,
          changeRequestedBy: currentUser?.name || '',
          changeRequestedAt: now,
          updatedAt: now,
          updatedBy: currentUser?.name,
        };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

const saveForecastPlan = useCallback(async (plan: ForecastMonthPlan) => {
    const stamped: ForecastMonthPlan = { ...plan, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name };
    const next = [...forecastPlans.filter((p) => p.id !== plan.id), stamped];
    setForecastPlans(next);
    await syncOrQueue('forecast_plans', 'upsert', stamped.id, stamped, () =>
      saveForecastMonthPlanToSupabase(stamped)
    );
  }, [forecastPlans, currentUser, syncOrQueue]);

  const saveCustomerComment = useCallback(
    async (comment: CustomerCommentRecord) => {
      const stamped = { ...comment, updatedAt: new Date().toISOString() };
      const next = [...customerComments.filter((c) => c.id !== comment.id), stamped];
      setCustomerComments(next);
      await syncOrQueue('customer_comments', 'upsert', stamped.id, stamped, () =>
        saveCustomerCommentsToSupabase([stamped])
      );
    },
    [customerComments, syncOrQueue]
  );

  const toggleArchiveCustomerComment = useCallback(
    async (commentId: string, isArchived: boolean): Promise<{ success: boolean; message: string }> => {
      const now = new Date().toISOString();
      const existing = customerComments.find((c) => c.id === commentId);
      if (!existing) return { success: false, message: 'الملاحظة غير موجودة' };
      const updated: CustomerCommentRecord = {
        ...existing,
        isArchived,
        archivedAt: isArchived ? now : undefined,
        archivedBy: isArchived ? (currentUser?.name || 'المستخدم') : undefined,
        updatedAt: now,
      };
      const next = customerComments.map((c) => (c.id === commentId ? updated : c));
      setCustomerComments(next);
      await syncOrQueue('customer_comments', 'upsert', updated.id, updated, () =>
        saveCustomerCommentsToSupabase([updated])
      );
      return {
        success: true,
        message: isArchived ? 'تم أرشفة الملاحظة بنجاح 🗄️' : 'تم استعادة الملاحظة من الأرشيف بنجاح 🔄',
      };
    },
    [customerComments, currentUser, syncOrQueue]
  );

  const deleteCustomerComment = useCallback(async (id: string) => {
    const next = customerComments.filter((c) => c.id !== id);
    setCustomerComments(next);
    // The delete has to reach the server too, otherwise the comment comes back
    // on the next fetch for every other user.
    await syncOrQueue('customer_comments', 'delete', id, undefined, () =>
      deleteCustomerCommentFromSupabase(id)
    );
  }, [customerComments, syncOrQueue]);

  /**
   * Drain the offline outbox, grouped per table so a device that spent a whole
   * shift offline costs a handful of requests instead of one per tap.
   */
  const flushOfflineQueue = async (): Promise<{ success: boolean; syncedCount: number }> => {
    const queued = await getQueuedMutations();
    if (queued.length === 0) {
      setOfflineQueueCount(0);
      return { success: true, syncedCount: 0 };
    }
    if (!navigator.onLine) {
      setOfflineQueueCount(queued.length);
      return { success: false, syncedCount: 0 };
    }

    const done: string[] = [];
    const failed: string[] = [];
    const group = (entity: QueuedMutation['entity'], op: QueuedMutation['op']) =>
      queued.filter((item) => item.entity === entity && item.op === op);

    /**
     * أنى نطاق يناسب اللي اتبع فعلاً.
     *
     * كان الـ flush بينشر scope: 'all' مع forcePurge — يعني مندوب واحد
     * يسجّل زيارة offline ويرجع نت، كل الـ 299 جهاز بيمسح كاشه بالكامل
     * ويعيد تحميل الكتالوج والعملاء والأهداف والفواتير. زيارة واحدة كانت
     * بتكلّف datacenter كامل.
     *
     * الطبقات اللي checkAndSyncDataVersion بيعرف يحدّثها هي بس:
     * products / customers / targets / invoices / visits. الجداول التانية
     * في الـ queue (users, forecasts, forecast_plans, customer_comments) مفيش
     * ليها فرع في إعادة الجلب ولا اشتراك realtime — يعني نشر 'all' عشانها
     * ما كانش بيعمل حاجة، كان بيبعت تعريفة وخلاص.
     *
     * فبنحسب النطاق الحقيقي: نطاق واحد → نطاقه، أكتر من واحد → 'all'
     * (سلوك النهارده، وبيحصل نادر — الـ Excel imports ما بتمشيش من الـ queue).
     */
    const resolveFlushScope = (): SyncScope => {
      const touched = new Set<SyncScope>();
      if (invoiceDeletes.length > 0 || invoiceUpserts.length > 0) touched.add('invoices');
      if (visitDeletes.length > 0 || visitUpserts.length > 0) touched.add('visits');
      if (customerDeletes.length > 0 || customerUpserts.length > 0) touched.add('customers');
      if (productReplaces.length > 0) touched.add('products');
      if (targetReplaces.length > 0) touched.add('targets');

      if (touched.size === 0) return 'all';
      if (touched.size === 1) return touched.values().next().value as SyncScope;
      return 'all';
    };

    // Deletes first, so a row that was recreated later is not wiped by an older delete.
    const invoiceDeletes = group('invoices', 'delete');
    if (invoiceDeletes.length > 0) {
      const results = await Promise.all(
        invoiceDeletes.map((item) => deleteInvoiceFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...invoiceDeletes.map((i) => i.id));
    }

    const invoiceUpserts = group('invoices', 'upsert');
    if (invoiceUpserts.length > 0) {
      const res = await saveInvoicesToSupabase(invoiceUpserts.map((i) => i.payload as Invoice));
      (res.success ? done : failed).push(...invoiceUpserts.map((i) => i.id));
    }

    const visitDeletes = group('visits', 'delete');
    if (visitDeletes.length > 0) {
      const results = await Promise.all(
        visitDeletes.map((item) => deleteVisitFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...visitDeletes.map((i) => i.id));
    }

    const visitUpserts = group('visits', 'upsert');
    if (visitUpserts.length > 0) {
      const res = await saveVisitsToSupabase(visitUpserts.map((i) => i.payload as CustomerVisit));
      (res.success ? done : failed).push(...visitUpserts.map((i) => i.id));
      if (res.success) {
        const syncedIds = new Set(visitUpserts.map((i) => i.entityId));
        setVisits((prev) => {
          const next = prev.map((v) => syncedIds.has(v.id) ? { ...v, syncStatus: 'synced' as const } : v);
          persistVisits(next);
          return next;
        });
      }
    }

    const customerDeletes = group('customers', 'delete');
    if (customerDeletes.length > 0) {
      const results = await Promise.all(
        customerDeletes.map((item) => deleteCustomerFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...customerDeletes.map((i) => i.id));
    }

    const customerUpserts = group('customers', 'upsert');
    for (const item of customerUpserts) {
      const res = await saveCustomerToSupabase(item.payload as Customer);
      (res.success ? done : failed).push(item.id);
    }

    const userDeletes = group('users', 'delete');
    if (userDeletes.length > 0) {
      const results = await Promise.all(
        userDeletes.map((item) => deleteUserFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...userDeletes.map((i) => i.id));
    }

    const userUpserts = group('users', 'upsert');
    for (const item of userUpserts) {
      const res = await saveUserToSupabase(item.payload as User);
      (res.success ? done : failed).push(item.id);
    }

    // Products and targets are authoritative full-table writes, so they are sent
    // from the live local state rather than from a snapshot taken while offline.
    // Read through the refs: this flush also runs from timers that captured an
    // early render, where the state variables would still be empty.
    const productReplaces = group('products', 'replace');
    if (productReplaces.length > 0 && productsRef.current.length > 0) {
      const res = await saveProductsToSupabase(productsRef.current);
      (res.success ? done : failed).push(...productReplaces.map((i) => i.id));
    }

    const targetReplaces = group('targets', 'replace');
    if (targetReplaces.length > 0 && targetsRef.current.length > 0) {
      const res = await saveTargetsToSupabase(targetsRef.current);
      (res.success ? done : failed).push(...targetReplaces.map((i) => i.id));
    }

    // Forecast rows are keyed per (month, week, customer), so each one is an
    // independent upsert and the queued payload can be sent as-is.
    const forecastUpserts = group('forecasts', 'upsert');
    if (forecastUpserts.length > 0) {
      const res = await saveForecastsToSupabase(
        forecastUpserts.map((i) => i.payload as CollectionForecastRecord)
      );
      (res.success ? done : failed).push(...forecastUpserts.map((i) => i.id));
    }

    const forecastDeletes = group('forecasts', 'delete');
    if (forecastDeletes.length > 0) {
      const results = await Promise.all(
        forecastDeletes.map((item) => deleteForecastFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...forecastDeletes.map((i) => i.id));
    }

    // The month plan is one row per month, so only the newest queued copy matters.
    const planUpserts = group('forecast_plans', 'upsert');
    if (planUpserts.length > 0) {
      const last = planUpserts[planUpserts.length - 1];
      const res = await saveForecastMonthPlanToSupabase(last.payload);
      (res.success ? done : failed).push(...planUpserts.map((i) => i.id));
    }

    const commentUpserts = group('customer_comments', 'upsert');
    if (commentUpserts.length > 0) {
      const res = await saveCustomerCommentsToSupabase(
        commentUpserts.map((i) => i.payload as CustomerCommentRecord)
      );
      (res.success ? done : failed).push(...commentUpserts.map((i) => i.id));
    }

    // Comment deletes run after the upserts so an edit-then-delete queued in the
    // same offline stretch does not leave the row behind.
    const commentDeletes = group('customer_comments', 'delete');
    if (commentDeletes.length > 0) {
      const results = await Promise.all(
        commentDeletes.map((item) => deleteCustomerCommentFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...commentDeletes.map((i) => i.id));
    }

    if (done.length > 0) await removeQueuedMutations(done);
    if (failed.length > 0) {
      await markQueuedMutationFailure(failed, 'تعذر الإرسال إلى قاعدة البيانات');
    }
    await refreshOfflineQueueCount();

    if (done.length > 0) {
      // Tell every other device that the shared data moved, so admins and reps
      // repaint instead of showing a stale local cache.
      publishDataVersionUpdate({
        scope: resolveFlushScope(),
        notes: `مزامنة تلقائية بعد العمل بدون إنترنت (${done.length} تغيير)`,
      }).catch(() => {});
    }

    return { success: failed.length === 0, syncedCount: done.length };
  };

  const productSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Products and targets are written to Supabase as authoritative full tables,
   * so a burst of catalog or stock edits is coalesced into a single push instead
   * of one request per tap.
   */
  const scheduleProductSync = () => {
    if (productSyncTimer.current) clearTimeout(productSyncTimer.current);
    productSyncTimer.current = setTimeout(() => {
      syncOrQueue('products', 'replace', 'catalog', undefined, () =>
        saveProductsToSupabase(productsRef.current)
      ).then((delivered) => {
        if (delivered) {
          publishDataVersionUpdate({
            scope: 'products',
            notes: `تحديث كتالوج الأصناف (${productsRef.current.length} صنف)`,
          }).catch(() => {});
        }
      }).catch(() => {});
    }, 1200);
  };

  const scheduleTargetSync = () => {
    if (targetSyncTimer.current) clearTimeout(targetSyncTimer.current);
    targetSyncTimer.current = setTimeout(() => {
      syncOrQueue('targets', 'replace', 'targets', undefined, () =>
        saveTargetsToSupabase(targetsRef.current)
      ).then((delivered) => {
        if (delivered) {
          publishDataVersionUpdate({
            scope: 'targets',
            notes: `تحديث شيت الأهداف (${targetsRef.current.length} هدف)`,
          }).catch(() => {});
        }
      }).catch(() => {});
    }, 1200);
  };

  /**
   * Which customers this device is allowed to download.
   *
   * The customer table is the heaviest payload in the app (3,400+ rows, every
   * column used by the financial reports), and a rep only ever works one branch.
   * Pulling the full base onto 70 phones costs megabytes of everyone's data for
   * rows the UI would hide anyway, so the read is narrowed server-side for
   * everyone except admins and developers.
   *
   * Both spellings are sent because branch names are free-text Arabic in the
   * database, and fetchCustomersFromSupabase falls back to the full base if a
   * narrow read matches nothing.
   */
  const customerFetchScope = useMemo(() => {
    const role = currentUser?.role;
    if (!currentUser || role === 'admin' || role === 'developer') return undefined;
    const raw = (currentUser.branchName || '').trim();
    if (!raw) return undefined;
    const canonical = resolveBranchName(raw);
    const names = new Set<string>();
    if (raw) names.add(raw);
    if (canonical && canonical !== raw) names.add(canonical);
    if (canonical && !canonical.startsWith('فرع')) names.add(`فرع ${canonical}`);
    return { branchNames: Array.from(names) };
  }, [currentUser?.id, currentUser?.branchName, currentUser?.role]);

  /**
   * scope القراءة من جدول الزيارات، على نفس نمط العملاء.
   *
   * الزيارات كانت بتتنزل كاملة على كل جهاز، وده كان أكبر بند في فاتورة
   * الاستضافة على الخطة المجانية: كل مندوب بينزّل سجل الشركة كله عشان
   * يشوف زيارات فرعه، والواجهة كانت بتخفي الباقي بعد ما يتحمّل.
   *
   * مين بيتضيّق؟ المندوب ومدير الفرع بس — وهما أصعب الأدوار صرامة في
   * `visibleVisits` أصلاً (مندوب: زياراته هو بس). المشرف سيب من غير
   * scope عمداً: صلاحيته مش مرتبطة بفرع واحد (بيشوف زيارات مندوبين
   * `supervisorId`)، فأي تضييق هيعمله ممكن يخفي عنه زيارة
   * سجّلها بنفسه. يعني ~7 مشرفين بيفضلوا السجل كامل بدل 300 مندوب.
   *
   * `sinceDate` بيقفل القراءة على 18 شهر: التقارير الشهرية بتغطي السنة
   * اللي فاتت، وأقدم من كده مش بيتنزل على موبايل. الأدمن والمطور من غير
   * حد، عشان تقرير المرتجعات على مستوى الشركة محتاج السجل كامل.
   */
  const visitFetchScope = useMemo(() => {
    const role = currentUser?.role;
    if (!currentUser || role !== 'sales_rep' && role !== 'branch_manager') return undefined;
    const scope = customerFetchScope;
    if (!scope?.branchNames?.length) return undefined;
    const since = new Date();
    since.setMonth(since.getMonth() - 18);
    return { branchNames: scope.branchNames, sinceDate: since.toISOString().slice(0, 10) };
  }, [currentUser?.id, currentUser?.branchName, currentUser?.role, customerFetchScope]);

  const checkDatabaseConnection = useCallback(async (): Promise<SupabaseSyncStatus> => {
    const conn = await testSupabaseConnection();
    setSupabaseStatus(conn);
    return conn;
  }, []);

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
      let pushedCustomersCount = 0;
      let removedCustomersCount = 0;

      // 2. Fetch remote users and invoices if requested
      if (direction === 'fetch' || direction === 'both') {
        const fetchRes = await fetchUsersFromSupabase();
        if (fetchRes.success && fetchRes.users && fetchRes.users.length > 0) {
          fetchedUsersCount = fetchRes.users.length;
          setUsers(sanitizeAndDeduplicateUsers(fetchRes.users).deduplicated);
        }

        const invRes = await fetchInvoicesFromSupabase(
          buildInvoiceFetchScope(currentUser, users)
        );
        if (invRes.success && invRes.invoices) {
          const remoteInvoices = invRes.invoices;
          fetchedInvoicesCount = remoteInvoices.length;
          setInvoices((previous) => {
            const merged = new Map<string, Invoice>();
            previous.forEach((invoice) => merged.set(invoice.id, invoice));
            remoteInvoices.forEach((invoice) => merged.set(invoice.id, invoice));
            const next = Array.from(merged.values());
            idbSet(STORAGE_KEYS.INVOICES, next);
            return next;
          });
        }

        const productRes = await fetchProductsFromSupabase();
        if (productRes.success) {
          const validProducts = sanitizeProducts(productRes.products || []);
          setProducts(validProducts);
          idbSet(STORAGE_KEYS.PRODUCTS, validProducts);
        }
      }

      // 2b. Fetch customers from Supabase
      if (direction === 'fetch' || direction === 'both') {
        const custRes = await fetchCustomersFromSupabase(customerFetchScope);
        if (custRes.success) {
          const linked = linkCustomersToUsers(sanitizeCustomers(custRes.customers || []), users);
          const validCustomers = deduplicateCustomersArray(linked);
          setCustomers(validCustomers);
          idbSet(STORAGE_KEYS.CUSTOMERS, validCustomers);
        }
      }
      if (direction === 'push' || direction === 'both') {
        await flushPendingInvoices();
        if (users.length > 0) {
          await saveUsersToSupabase(users);
          pushedUsersCount = users.length;
        }
        if (invoices.length > 0) {
          // Push ALL invoices to Supabase, not just the first 100
          const invBatchRes = await saveInvoicesToSupabase(invoices);
          pushedInvoicesCount = invBatchRes.savedCount;
        }
        if (products.length > 0) {
          const productsResult = await saveProductsToSupabase(products);
          if (productsResult.success) {
            await publishNewDataVersion({
              scope: 'products',
              updatedBy: currentUser?.name || 'مدير النظام',
              notes: `مزامنة كتالوج الأصناف (${products.length} صنف)`,
              productsCount: products.length,
            });
          }
        }
        // Sync visits to Supabase
        if (visits.length > 0) {
          await saveVisitsToSupabase(visits);
        }
        // Push customers as an authoritative replacement so every role reads
        // the same numbers and no duplicate rows accumulate on the server
        if (customers.length > 0) {
          const cleanCustomers = deduplicateCustomersArray(customers);
          const custPushRes = await replaceCustomersInSupabase(cleanCustomers);
          if (custPushRes.success) {
            pushedCustomersCount = cleanCustomers.length;
            removedCustomersCount = custPushRes.removed;
          }
        }
      }

      const updatedConn = await testSupabaseConnection();
      setSupabaseStatus(updatedConn);

      const dupNote = removedCustomersCount > 0 ? `، حذف ${removedCustomersCount} سجل مكرر` : '';
      const msg = `تمت المزامنة السحابية بنجاح مع Supabase! (مستخدمين: ${fetchedUsersCount || pushedUsersCount}, فواتير وطلبيات: ${fetchedInvoicesCount || pushedInvoicesCount}, عملاء: ${pushedCustomersCount}${dupNote}).`;
      return { success: true, message: msg };
    } catch (err: any) {
      return {
        success: false,
        message: `تعذر إتمام المزامنة: ${err?.message || 'خطأ في الشبكة'}`,
      };
    }
  };

  /**
   * Check remote published data version and automatically purge stale client caches
   * This guarantees that when an admin uploads a new Excel catalog or customer list,
   * no sales rep or user experiences duplicate records or outdated prices/stocks.
   *
   * `noStampPulledAtRef`: بيتحدّث إمتى آخر مرة سحبنا فيها جدول العملاء **من
   * غير** ختم إصدار منشور على السيرفر.
   */
  const noStampPulledAtRef = useRef(0);
  /**
   * من غير ختم إصدار منشور، المسار ده كان بيسحب جدول العملاء كامل **كل مرة**
   * check() بينادي — يعني كل 30 ثانية على كل جهاز، وكمان عند كل focus.
   * ده كان أكبر بند في فاتورة الاستضافة: 400 جهاز × 3,400 صف كل دقيقة.
   *
   * دلوقتي السحب بيحصل مرة واحدة لكل 15 دقيقة، وعند الإقلاع (`neverPulled`).
   * انحراف المحتوى لسه متكفّل بيه `checkCustomersContent` عبر بصمة صف واحد
   * (عدد الصفوف + أحدث updated_at)، فمفيش فقد في حداثة البيانات.
   */
  const NO_STAMP_PULL_INTERVAL_MS = 15 * 60 * 1000;

  const checkAndSyncDataVersion = async (force: boolean = false): Promise<{ updated: boolean; version?: number; message: string }> => {
    try {
      // Never purge and re-pull while our own authoritative write is still
      // landing on the server: the old copy would overwrite the fresh one.
      if (!force && Date.now() - authoritativeWriteAtRef.current < 120000) {
        return { updated: false, message: 'جارٍ حفظ التحديث الحالي' };
      }
      const remoteMeta = await fetchRemoteDataVersion();
      if (!remoteMeta) {
        // No version stamp has been published yet. Pull the authoritative customer
        // list directly - but only once per window, not on every heartbeat.
        const dueForPull =
          force || noStampPulledAtRef.current === 0 || Date.now() - noStampPulledAtRef.current >= NO_STAMP_PULL_INTERVAL_MS;
        if (!dueForPull) {
          return { updated: false, message: 'مفيش ختم إصدار منشور — الاعتماد على بصمة المحتوى' };
        }
        noStampPulledAtRef.current = Date.now();
        const custRes = await fetchCustomersFromSupabase(customerFetchScope);
        if (custRes.success && custRes.customers && custRes.customers.length > 0) {
          const linked = linkCustomersToUsers(sanitizeCustomers(custRes.customers), users);
          const valid = deduplicateCustomersArray(linked);
          setCustomers((current) => {
            if (current.length === valid.length) return current;
            idbSet(STORAGE_KEYS.CUSTOMERS, valid).catch(() => {});
            return valid;
          });
        }
        return { updated: false, message: 'تم جلب أحدث بيانات العملاء مباشرة من السيرفر' };
      }
      // الختم موجود: تبقّى نراقبه. لو اتشال من السيرفر نرجع للجهة اللي فوق
      // من غير ما نفضل متعلقين بغيابه للأبد.
      noStampPulledAtRef.current = 0;

      const localMeta = getLocalDataVersion();
      const isStale = isClientVersionStale(localMeta, remoteMeta);

      if (!force && !isStale) {
        setGlobalDataVersion(remoteMeta);
        return { updated: false, version: remoteMeta.version, message: 'البيانات الحالية محدثة لأحدث إصدار' };
      }

      setIsVersionSyncing(true);
      const scope = remoteMeta.scope || 'all';

      // كل الجلبات بتتعمل الأول وتخزّن متغيرات، وبعدين بيتمسح الكاش القديم
      // بس للأجزاء اللي نزلت فعلاً.
      //
      // الترتيب القديم كان: امسح الكاش ← فضّي الشاشة ← جلب. فلو أي جلب
      // فشل على شبكة ضعيفة، المندوب كان بيفقد بياناته المحلية من غير ما
      // ييجيله بديل — IndexedDB كان اتمسح والشاشة فاضية. دلوقتي البيانات
      // المحلية بتفضل مكانها لحد ما الجديد يوصل فعلاً.
      const inScope = (s: SyncScope) => scope === 'all' || scope === s;

      // Fresh payloads, held until we know which ones actually arrived.
      let freshProducts: Product[] | null = null;
      let freshCustomers: Customer[] | null = null;
      let freshTargets: TargetRecord[] | null = null;
      let freshInvoices: Invoice[] | null = null;
      let freshVisits: CustomerVisit[] | null = null;

      // الجلبات الخمسة دي مستقلة عن بعض — بتنزل
      // متوازية عشان الإقلاع يستنى أطول جلب بس
      // بدل مجموع الأوقات (الكتالوج والعملاء والفواتير
      // والزيارات كانت بتنزل ورا بعض متسلسلة).
      const [prodRes, custRes, trgRes, invRes, visRes] = await Promise.all([
        inScope('products') ? fetchProductsFromSupabase() : Promise.resolve(null),
        inScope('customers') ? fetchCustomersFromSupabase(customerFetchScope) : Promise.resolve(null),
        inScope('targets') ? fetchTargetsFromSupabase() : Promise.resolve(null),
        inScope('invoices') ? fetchInvoicesFromSupabase(buildInvoiceFetchScope(currentUser, users)) : Promise.resolve(null),
        inScope('visits') ? fetchVisitsFromSupabase(visitFetchScope) : Promise.resolve(null),
      ]);

      if (prodRes?.success) {
        freshProducts = sanitizeProducts(prodRes.products || []);
      }

      if (custRes?.success) {
        const linked = linkCustomersToUsers(sanitizeCustomers(custRes.customers || []), users);
        freshCustomers = deduplicateCustomersArray(linked);
      }

      if (trgRes?.success) {
        freshTargets = (trgRes.targets || []).map((row: any) => ({
          id: String(row.id),
          branch: resolveBranchName(row.branch) || row.branch || '',
          repName: row.rep_name || '',
          salesTarget: Number(row.sales_target || 0),
          salesAchieved: Number(row.sales_achieved || 0),
          salesPercentage: Number(row.sales_percentage || 0),
          collectionTarget: Number(row.collection_target || 0),
          collectionAchieved: Number(row.collection_achieved || 0),
          collectionPercentage: Number(row.collection_percentage || 0),
          date: row.target_date || '',
          month: Number(row.month),
          year: Number(row.year),
          quarter: row.quarter,
          remainingSales: Number(row.remaining_sales || 0),
          remainingCollection: Number(row.remaining_collection || 0),
          updatedAt: row.updated_at,
          notes: row.notes || undefined,
        }));
      }

      if (invRes?.success && invRes.invoices) {
        freshInvoices = invRes.invoices;
      }

      if (visRes?.success && visRes.visits) {
        freshVisits = visRes.visits;
      }

      /**
       * Point of no return: we now hold real replacements for at least part of
       * the scope, so the stale local caches for exactly those parts can go.
       *
       * Only the scopes that actually landed are purged. If the network dropped
       * mid-sync, the customer's own copy stays on the device and the screen
       * keeps rendering the last good data instead of going blank.
       */
      const purgedScopes: SyncScope[] = [];
      if (freshProducts) purgedScopes.push('products');
      if (freshCustomers) purgedScopes.push('customers');
      if (freshTargets) purgedScopes.push('targets');
      if (freshInvoices) purgedScopes.push('invoices');
      if (freshVisits) purgedScopes.push('visits');

      if (purgedScopes.length === 0) {
        // Nothing arrived. Keep every local cache and every pending offline
        // record exactly as it is — losing them would be far worse than
        // staying one version behind for a minute.
        saveLocalDataVersion(remoteMeta);
        setGlobalDataVersion(remoteMeta);
        const staleMsg = 'تعذر تحديث البيانات من السيرفر — تم الاحتفاظ بالبيانات المحلية. لما يتحسن الاتصال هيتم التحديث تلقائياً.';
        setLastVersionSyncNotice(staleMsg);
        setTimeout(() => setLastVersionSyncNotice(null), 8000);
        return { updated: false, version: remoteMeta.version, message: staleMsg };
      }

      for (const one of purgedScopes) {
        await purgeLocalDataCaches(one);
      }

      // Commit: everything below writes the fresh lists into React state and
      // back into IndexedDB, so it runs strictly after the purge.
      const queuedMutations = await getQueuedMutations();

      if (freshProducts) {
        setProducts(freshProducts);
        idbSet(STORAGE_KEYS.PRODUCTS, freshProducts).catch(() => {});
      }

      if (freshCustomers) {
        const remoteCustomers = freshCustomers;
        const pendingCustIds = new Set(
          queuedMutations.filter((m) => m.entity === 'customers' && m.op === 'upsert').map((m) => m.entityId)
        );
        setCustomers((prev) => {
          const nextMap = new Map<string, Customer>();
          remoteCustomers.forEach((c) => nextMap.set(c.id, c));
          prev.forEach((c) => {
            if (pendingCustIds.has(c.id) && !nextMap.has(c.id)) {
              nextMap.set(c.id, c);
            }
          });
          const next = Array.from(nextMap.values());
          idbSet(STORAGE_KEYS.CUSTOMERS, next).catch(() => {});
          return next;
        });
      }

      if (freshTargets) {
        setTargets(freshTargets);
        safeLocalStorageSet(STORAGE_KEYS.TARGETS, JSON.stringify(freshTargets));
      }

      if (freshInvoices) {
        const remoteInvoices = freshInvoices;
        const pendingList = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
        const pendingIds = new Set([
          ...pendingList.map((i) => i.id),
          ...queuedMutations.filter((m) => m.entity === 'invoices' && m.op === 'upsert').map((m) => m.entityId),
        ]);
        setInvoices((prev) => {
          const nextMap = new Map<string, Invoice>();
          remoteInvoices.forEach((inv) => nextMap.set(inv.id, inv));
          // Only keep local invoices that are genuinely pending offline upload
          prev.forEach((inv) => {
            if (pendingIds.has(inv.id) && !nextMap.has(inv.id)) {
              nextMap.set(inv.id, inv);
            }
          });
          const next = Array.from(nextMap.values());
          idbSet(STORAGE_KEYS.INVOICES, next).catch(() => {});
          safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify(next));
          return next;
        });
      }

      if (freshVisits) {
        const remoteVisits = freshVisits;
        const pendingVisitIds = new Set(
          queuedMutations.filter((m) => m.entity === 'visits' && m.op === 'upsert').map((m) => m.entityId)
        );
        setVisits((prev) => {
          const nextMap = new Map<string, CustomerVisit>();
          remoteVisits.forEach((v) => nextMap.set(v.id, { ...v, syncStatus: 'synced' }));
          prev.forEach((v) => {
            if (pendingVisitIds.has(v.id) && !nextMap.has(v.id)) {
              nextMap.set(v.id, v);
            }
          });
          const next = Array.from(nextMap.values());
          persistVisits(next);
          return next;
        });
      }

      saveLocalDataVersion(remoteMeta);
      setGlobalDataVersion(remoteMeta);
      // Record a fingerprint of the data we just accepted. The heartbeat compares
      // against it so an admin edit lands on every client even if the version
      // stamp did not change.
      saveLocalCustomersFingerprint(customers);

      const noticeMsg = `تم تحديث البيانات تلقائياً ومسح الذاكرة المؤقتة القديمة بنجاح! (${remoteMeta.notes || 'تحديث تلقائي'})`;
      setLastVersionSyncNotice(noticeMsg);
      setTimeout(() => setLastVersionSyncNotice(null), 8000);

      return { updated: true, version: remoteMeta.version, message: noticeMsg };
    } catch (err: any) {
      console.warn('Check & sync data version error:', err);
      return { updated: false, message: err?.message || 'فشل فحص إصدار البيانات' };
    } finally {
      setIsVersionSyncing(false);
    }
  };

  /**
   * Publish a new global data version to Supabase
   * This broadcasts a signal to all connected client devices to purge their local caches
   */
  const publishDataVersionUpdate = async (params: {
    scope?: SyncScope;
    notes?: string;
    forcePurge?: boolean;
  }): Promise<{ success: boolean; version: number; message: string }> => {
    try {
      setIsVersionSyncing(true);
      const newMeta = await publishNewDataVersion({
        scope: params.scope || 'all',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: params.notes || 'تحديث عام لقاعدة البيانات ومسح الكاش لجميع المستخدمين',
        forcePurge: params.forcePurge ?? true,
        productsCount: products.length,
        customersCount: customers.length,
        targetsCount: targets.length,
      });

      setGlobalDataVersion(newMeta);
      const msg = `تم نشر التحديث بنجاح وتوجيه جميع أجهزة المستخدمين لتحديث البيانات تلقائياً!`;
      setLastVersionSyncNotice(msg);
      setTimeout(() => setLastVersionSyncNotice(null), 8000);
      return { success: true, version: newMeta.version, message: msg };
    } catch (err: any) {
      return { success: false, version: 0, message: err?.message || 'فشل نشر الإصدار' };
    } finally {
      setIsVersionSyncing(false);
    }
  };

  /**
   * Force client to purge local caches and re-fetch clean dataset from scratch
   */
  const forcePurgeCacheAndReload = async (scope: SyncScope = 'all'): Promise<void> => {
    setIsVersionSyncing(true);
    try {
      await purgeLocalDataCaches(scope);
      await checkAndSyncDataVersion(true);
    } finally {
      setIsVersionSyncing(false);
    }
  };

  /**
   * إصلاح اشتراك الـrealtime بعد الرجوع بالـBack-Forward Cache.
   *
   * المشكلة: لما كروم يدخّل الصفحة في الـBFCache بيقفل الـWebSocket عشان
   * provides resources، بس الصفحة بترجع وجواها الكانال لسه فاكر نفسه «متوصّل».
   * قناة phoenix بتعمل rejoin تلقائياً بس لما الكانال يكون في حالة error،
   * فكان بيفضل ميت صامت والبيانات بتتحدّث بس لما الـfocus يضرب (وبنقرّب بده).
   *
   * الحل: بنعيد فتح السوكيت (connect() آمن لو هو متوصّل أصلاً — بيعمل return
   * فوري) وبنزوّد العدّاد عشان الـeffects بتعمل unsubscribe/subscribe من جديد
   * بقنوات سليمة.
   *
   * `event.persisted` هو اللي بيفرق: true يعني الصفحة مرجّعة من الكاش، false
   * يعني تحميل عادي أو إغلاق — وفي الحالة التانية مش بنعمل حاجة.
   */
  useEffect(() => {
    let lastRestoreAt = 0;
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // سبام زِرار الرجوع ممكن يطلّع pageshow كذا مرة ورا بعض، وكل مرة بتعمل
      // إعادة مزامنة كاملة. المتغير ده بيخلي أول واحدة بس هي اللي تشتغل.
      const now = Date.now();
      if (now - lastRestoreAt < 3000) return;
      lastRestoreAt = now;
      try {
        supabase.realtime.connect();
      } catch (error) {
        console.warn('Realtime reconnect notice:', error);
      }
      setDataEpoch((n) => n + 1);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Re-check on focus, tab visibility, realtime version broadcasts, and as a short heartbeat.
  // The heartbeat is intentionally defensive: realtime can be disconnected on mobile networks.
  useEffect(() => {
    if (!isLocalDataHydrated) return;
    let checkInFlight = false;
    let lastHeartbeatCheck = 0;
    const HEARTBEAT_INTERVAL_MS = 120 * 1000;
    // شبكة أمان: لو البصمة مرجعتش نتيجة (عمود updated_at مش موجود، أو
    // حد عدّل بـ SQL مباشر من غير ما يمسّه) بنعمل تحميل كامل كل ربع ساعة
    // عشان الجهاز يفضل صحيح. ده 4 مرات في الساعة بدل 60 مرة.
    const FULL_REFRESH_FALLBACK_MS = 15 * 60 * 1000;
    let lastFullCustomerFetchAt = 0;
    let lastCustomerStamp: { count: number | null; maxUpdatedAt: string | null } | null = null;
    let lastStampWasKnown = false;

    const check = () => {
      if (checkInFlight || document.visibilityState === 'hidden') return;
      checkInFlight = true;
      checkAndSyncDataVersion(false).catch(() => {}).finally(() => {
        checkInFlight = false;
      });
    };

    /**
     * Content heartbeat. Compares the customer data currently on screen against
     * the server. If the numbers moved, the client swaps in the fresh list so
     * every rep/supervisor sees the admin's numbers without doing anything.
     *
     * Previously this pulled all 3,400 customer rows (≈3-8MB, every column) on
     * every device every 60 seconds — roughly 27GB/hour at 300 employees,
     * against Supabase Free's 5GB/month egress. Now it first asks the server
     * for a two-value stamp (row count + newest updated_at, one row of
     * payload) and only pulls the full table when that stamp actually moved.
     * The outcome is identical; only the bytes are gone.
     */
    const checkCustomersContent = async (force: boolean = false) => {
      if (checkInFlight || document.visibilityState === 'hidden') return;
      // Skip while our own write is still propagating, otherwise a lagging
      // server response overwrites the fresh data we just published.
      if (Date.now() - authoritativeWriteAtRef.current < 120000) return;

      const neverFetchedYet = lastFullCustomerFetchAt === 0;
      let shouldFetchFull = force || neverFetchedYet;
      let stamp: { count: number | null; maxUpdatedAt: string | null } | null = null;

      if (!shouldFetchFull) {
        stamp = await fetchCustomerContentStamp(customerFetchScope);
        const stampComparable =
          stamp !== null && (stamp.count !== null || stamp.maxUpdatedAt !== null);

        if (stampComparable) {
          const unchanged =
            lastStampWasKnown &&
            stamp.count === lastCustomerStamp?.count &&
            stamp.maxUpdatedAt === lastCustomerStamp?.maxUpdatedAt;
          // Server says nothing moved since our last full pull, so there is
          // nothing to download.
          if (unchanged) return;
          shouldFetchFull = true;
        } else {
          // The probe told us nothing (no updated_at column, or the read
          // failed). Fall back to a full refresh on a slow timer instead of
          // never.
          shouldFetchFull = Date.now() - lastFullCustomerFetchAt >= FULL_REFRESH_FALLBACK_MS;
        }
      }

      if (!shouldFetchFull) return;

      checkInFlight = true;
      try {
        const res = await fetchCustomersFromSupabase(customerFetchScope);
        if (!res.success || !res.customers || res.customers.length === 0) return;
        const linked = linkCustomersToUsers(sanitizeCustomers(res.customers), usersRef.current);
        const fresh = deduplicateCustomersArray(linked);
        const fingerprint = buildCustomersFingerprint(fresh);
        lastFullCustomerFetchAt = Date.now();
        // The stamp we probed describes the exact table we just downloaded, so
        // it becomes the new baseline for the next probe. Only on a successful
        // read — a failed fetch must never claim we are in sync.
        if (stamp && (stamp.count !== null || stamp.maxUpdatedAt !== null)) {
          lastCustomerStamp = stamp;
          lastStampWasKnown = true;
        }
        if (fingerprint === getLocalCustomersFingerprint()) return;
        setCustomers(fresh);
        idbSet(STORAGE_KEYS.CUSTOMERS, fresh).catch(() => {});
        saveLocalCustomersFingerprint(fresh);
      } catch {
        // Network hiccup: the next heartbeat retries.
      } finally {
        checkInFlight = false;
      }
    };

    const handleFocus = () => {
      check();
      checkCustomersContent();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        check();
        checkCustomersContent();
      }
    };

    const heartbeat = () => {
      const now = Date.now();
      if (now - lastHeartbeatCheck < HEARTBEAT_INTERVAL_MS) return;
      lastHeartbeatCheck = now;
      check();
      checkCustomersContent();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    // Heartbeat every 2 minutes (was 30s). At 5000 customers × 300 employees,
    // the old 30s interval generated ~27GB/hour of egress on Supabase Free
    // (5GB/month). The stamp probe means we only pull the full table when
    // something actually moved, so the interval is now safe to relax.
    const interval = window.setInterval(heartbeat, 120 * 1000);
    const versionChannel = supabase
      .channel('global-data-version-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${GLOBAL_VERSION_RECORD_ID}` },
        () => {
          check();
          checkCustomersContent();
        }
      )
      .subscribe();

    check();
    checkCustomersContent();
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
      supabase.removeChannel(versionChannel);
    };
  }, [users, isLocalDataHydrated, dataEpoch]);

  // Initial Supabase connection check, fetch users, products, invoices & real-time sync
  useEffect(() => {
    // Wait for IndexedDB hydration before checking the remote version. Otherwise a
    // late hydration can restore the stale snapshot immediately after it is purged.
    if (!isLocalDataHydrated) return;

    testSupabaseConnection().then((status) => {
      setSupabaseStatus(status);
      if (status.connected) {
        // 1. Fetch Users
        fetchUsersFromSupabase(true).then((res) => {
          if (res.success && res.users && res.users.length > 0) {
            setUsers((prev) => {
              const dedup = sanitizeAndDeduplicateUsers(res.users!);
              // If duplicate IDs were detected and cleaned, delete them permanently from Supabase
              if (dedup.removedUserIds.length > 0) {
                dedup.removedUserIds.forEach((remId) => {
                  deleteUserFromSupabase(remId).catch(() => {});
                });
                // Remap customer references
                setCustomers((prevCusts) => {
                  let changed = false;
                  const updated = prevCusts.map((c) => {
                    if (c.repId && dedup.idRedirectMap[c.repId]) {
                      changed = true;
                      return { ...c, repId: dedup.idRedirectMap[c.repId] };
                    }
                    return c;
                  });
                  return changed ? updated : prevCusts;
                });
                // Remap invoice references
                setInvoices((prevInvs) => {
                  let changed = false;
                  const updated = prevInvs.map((inv) => {
                    if (inv.repId && dedup.idRedirectMap[inv.repId]) {
                      changed = true;
                      return { ...inv, repId: dedup.idRedirectMap[inv.repId] };
                    }
                    return inv;
                  });
                  return changed ? updated : prevInvs;
                });
              }
              return dedup.deduplicated;
            });
          }
        });

        // 2 & 4. Automatic Data Version Sync & Clean Fetch:
        // Checks if server has a newer version or if client data is unversioned.
        // If newer, cleanly purges old cache and loads fresh data without duplicates!
        checkAndSyncDataVersion(false).then((syncRes) => {
          if (!syncRes.updated) {
            // Fallback: If version wasn't newer, ensure products and customers are loaded from Supabase if empty
            if (products.length === 0) {
              fetchProductsFromSupabase().then((pRes) => {
                if (pRes.success && pRes.products && pRes.products.length > 0) {
                  setProducts((curr) => {
                    if (curr.length === 0) {
                      const valid = sanitizeProducts(pRes.products!);
                      idbSet(STORAGE_KEYS.PRODUCTS, valid).catch(() => {});
                      return valid;
                    }
                    return curr;
                  });
                }
              });
            }
            if (customers.length === 0) {
              fetchCustomersFromSupabase(customerFetchScope).then(async (cRes) => {
                if (cRes.success && cRes.customers && cRes.customers.length > 0) {
                  const linked = linkCustomersToUsers(sanitizeCustomers(cRes.customers!), users);
                  const valid = deduplicateCustomersArray(linked);
                  const queued = await getQueuedMutations();
                  const pendingCustIds = new Set(
                    queued.filter((m) => m.entity === 'customers' && m.op === 'upsert').map((m) => m.entityId)
                  );
                  setCustomers((curr) => {
                    const map = new Map<string, Customer>();
                    valid.forEach((c) => map.set(c.id, c));
                    // Keep only genuinely pending offline creations
                    curr.forEach((c) => {
                      if (pendingCustIds.has(c.id) && !map.has(c.id)) {
                        map.set(c.id, c);
                      }
                    });
                    const next = Array.from(map.values());
                    idbSet(STORAGE_KEYS.CUSTOMERS, next).catch(() => {});
                    saveLocalCustomersFingerprint(next);
                    return next;
                  });
                }
              });
            }
          }
        });

        // 3. Fetch Invoices from Supabase (source of truth; keeps only genuinely pending offline invoices)
        const deletedInvoiceIds = getDeletedInvoiceIds();
        fetchInvoicesFromSupabase(buildInvoiceFetchScope(currentUser, users)).then(async (res) => {
          if (res.success && res.invoices) {
            const remoteInvoices = res.invoices.filter(
              (inv) => !deletedInvoiceIds.has(inv.id) && !deletedInvoiceIds.has(inv.invoiceNumber)
            );
            const queued = await getQueuedMutations();
            const pendingMutations = new Set(
              queued.filter((m) => m.entity === 'invoices' && m.op === 'upsert').map((m) => m.entityId)
            );
            const pendingList = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
            const pendingIds = new Set([...pendingList.map((i) => i.id), ...pendingMutations]);

            setInvoices((previous) => {
              const merged = new Map<string, Invoice>();
              // Start with remote invoices as source of truth
              remoteInvoices.forEach((inv) => merged.set(inv.id, inv));
              // Add ONLY local invoices that are genuinely pending offline upload
              previous.forEach((inv) => {
                if (pendingIds.has(inv.id) && !merged.has(inv.id) && !deletedInvoiceIds.has(inv.id) && !deletedInvoiceIds.has(inv.invoiceNumber)) {
                  merged.set(inv.id, inv);
                }
              });
              const next = Array.from(merged.values());
              idbSet(STORAGE_KEYS.INVOICES, next);
              safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify(next));
              return next;
            });
          }
        });

        // 5. Fetch Visits from Supabase (المفروض يكون narrowed بالـscope بتاع الدور)
        const deletedVisitIds = getDeletedVisitIds();
        fetchVisitsFromSupabase(visitFetchScope).then(async (res) => {
          if (res.success && res.visits) {
            const remoteVisits = res.visits.filter(
              (v) => !deletedVisitIds.has(v.id)
            );
            const queued = await getQueuedMutations();
            const pendingVisitIds = new Set(
              queued.filter((m) => m.entity === 'visits' && m.op === 'upsert').map((m) => m.entityId)
            );
            setVisits((previous) => {
              const merged = new Map<string, CustomerVisit>();
              // Start with remote visits as source of truth
              remoteVisits.forEach((visit) => merged.set(visit.id, { ...visit, syncStatus: 'synced' }));
              // Add only local visits that are genuinely pending offline in outbox
              previous.forEach((visit) => {
                if (pendingVisitIds.has(visit.id) && !merged.has(visit.id) && !deletedVisitIds.has(visit.id)) {
                  merged.set(visit.id, visit);
                }
              });
              const next = Array.from(merged.values());
              persistVisits(next);
              return next;
            });
          }
        });
      }
    });

    // Setup Supabase Realtime subscriptions for data tables.
    try {
      const channel = supabase
        .channel('schema-db-changes')
        // Realtime بيبث كل فاتورة جديدة/معدّلة لكل جهاز
        // موصول — ده من أكبر أسباب نقل البيانات. المندوب
        // (الأغلبية) بيستقبل فواتيره بس عبر فلتر على
        // السيرفر، وباقي الأدوار محتاجة كل الفواتير
        // للموافقات والمتابعة فبيستقبلوا الكل.
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'invoices',
            ...(currentUser?.role === 'sales_rep' && currentUser.id
              ? { filter: `rep_id=eq.${currentUser.id}` }
              : {}),
          },
          (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const raw = payload.new as any;
            if (raw && raw.id) {
              const mappedInv: Invoice = {
                id: raw.id,
                invoiceNumber: raw.invoice_number || raw.invoiceNumber || 'DRM-INV',
  customerName: raw.customer_name || raw.customerName || 'عميل',
  customerCode: raw.customer_code || raw.customerCode || undefined,
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
                const next = Array.from(map.values());
                idbSet(STORAGE_KEYS.INVOICES, next);
                return next;
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              markInvoiceAsDeletedInStorage(deleted.id);
              setInvoices((prev) => {
                const next = prev.filter((invoice) => invoice.id !== deleted.id);
                idbSet(STORAGE_KEYS.INVOICES, next).catch(() => {});
                safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify(next));
                return next;
              });
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              setCustomers((prev) => {
                const next = prev.filter((c) => c.id !== deleted.id);
                idbSet(STORAGE_KEYS.CUSTOMERS, next).catch(() => {});
                saveLocalCustomersFingerprint(next);
                return next;
              });
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_comments' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              setCustomerComments((prev) => {
                const next = prev.filter((c) => c.id !== deleted.id);
                idbSet(STORAGE_KEYS.CUSTOMER_COMMENTS, next).catch(() => {});
                return next;
              });
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'collection_forecasts' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              setForecasts((prev) => {
                const next = prev.filter((f) => f.id !== deleted.id);
                idbSet(STORAGE_KEYS.FORECASTS, next).catch(() => {});
                safeLocalStorageSet(STORAGE_KEYS.FORECASTS, JSON.stringify(next));
                return next;
              });
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'targets' }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const raw = payload.new as any;
            if (raw && raw.id) {
              const mappedTarget: TargetRecord = {
                id: String(raw.id),
                branch: resolveBranchName(raw.branch) || raw.branch || '',
                repName: raw.rep_name || '',
                salesTarget: Number(raw.sales_target || 0),
                salesAchieved: Number(raw.sales_achieved || 0),
                salesPercentage: Number(raw.sales_percentage || 0),
                collectionTarget: Number(raw.collection_target || 0),
                collectionAchieved: Number(raw.collection_achieved || 0),
                collectionPercentage: Number(raw.collection_percentage || 0),
                date: raw.target_date || '',
                month: Number(raw.month),
                year: Number(raw.year),
                quarter: raw.quarter,
                remainingSales: Number(raw.remaining_sales || 0),
                remainingCollection: Number(raw.remaining_collection || 0),
                updatedAt: raw.updated_at,
                notes: raw.notes || undefined,
              };
              setTargets((prev) => {
                const idx = prev.findIndex((t) => t.id === mappedTarget.id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = mappedTarget;
                  return next;
                }
                return [...prev, mappedTarget];
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              setTargets((prev) => prev.filter((t) => t.id !== String(deleted.id)));
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const raw = payload.new as any;
            if (raw && raw.id) {
              const mappedVisit: CustomerVisit = {
                id: raw.id,
                customerId: raw.customer_id || raw.customerId || '',
                customerName: raw.customer_name || raw.customerName || '',
                customerCode: raw.customer_code || raw.customerCode || '',
                date: raw.date || '',
                time: raw.time || '',
                repId: raw.rep_id || raw.repId || '',
                repName: raw.rep_name || raw.repName || 'المندوب',
                branchName: raw.branch_name || raw.branchName || '',
                supervisorId: raw.supervisor_id || raw.supervisorId || '',
                supervisorName: raw.supervisor_name || raw.supervisorName || '',
                status: raw.status || 'مجدولة',
                type: raw.type || 'زيارة دورية',
                outcome: raw.outcome || '',
                collectedAmount: Number(raw.collected_amount ?? raw.collectedAmount ?? 0),
                notes: raw.notes || '',
                createdBy: raw.created_by || raw.createdBy || '',
                createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
                updatedAt: raw.updated_at || raw.updatedAt,
              };
              setVisits((prev) => {
                const map = new Map<string, CustomerVisit>();
                prev.forEach((v) => map.set(v.id, v));
                map.set(mappedVisit.id, mappedVisit);
                return Array.from(map.values());
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as any;
            if (deleted?.id) {
              markVisitAsDeletedInStorage(deleted.id);
              setVisits((prev) => {
                const next = prev.filter((v) => v.id !== deleted.id);
                persistVisits(next);
                return next;
              });
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
  }, [isLocalDataHydrated, dataEpoch]);

  useEffect(() => {
    const handleOnlineSync = () => {
      flushPendingInvoices().catch((error) => console.warn('Pending invoice sync notice:', error));
      // Everything else done offline (visits, customers, products, users, targets)
      // leaves through the outbox the moment the connection is usable again.
      flushOfflineQueue()
        .then((res) => {
          if (res.syncedCount > 0) {
            setLastVersionSyncNotice(
              `تمت مزامنة ${res.syncedCount} تغيير تم عمله بدون إنترنت إلى قاعدة البيانات`
            );
            setTimeout(() => setLastVersionSyncNotice(null), 8000);
          }
        })
        .catch((error) => console.warn('Offline queue flush notice:', error));
      refreshOfflineQueueCount().catch(() => {});
    };
    window.addEventListener('online', handleOnlineSync);
    if (navigator.onLine) handleOnlineSync();
    return () => window.removeEventListener('online', handleOnlineSync);
  }, []);

  // Safety net: a device that reconnects without firing the online event (or that
  // was closed while work sat in the queue) still drains the outbox shortly after boot.
  useEffect(() => {
    let cancelled = false;
    const kick = async () => {
      if (cancelled || !navigator.onLine) return;
      const pending = await refreshOfflineQueueCount().catch(() => 0);
      if (pending === 0) return;
      await flushOfflineQueue().catch(() => {});
    };
    const timer = setTimeout(kick, 4000);
    const interval = setInterval(kick, 60000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Supabase Egress Protection:
  // Instead of polling 24/7 (which consumes gigabytes of egress bandwidth),
  // we rely on Supabase Realtime WebSockets for instant sub-second updates, and use an intelligent,
  // throttled fallback (only on tab focus with a 5-minute cooldown) for the latest 30 records.
  useEffect(() => {
    let cancelled = false;
    let lastSyncTimestamp = Date.now();

    const refreshInvoicesSafely = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      // Cooldown: at least 5 minutes between background focus syncs
      if (now - lastSyncTimestamp < 5 * 60 * 1000) return;
      lastSyncTimestamp = now;

      try {
        const result = await fetchInvoicesFromSupabase(
          buildInvoiceFetchScope(currentUser, users)
        );
        if (cancelled || !result.success || !result.invoices) return;        setInvoices((prev) => {
          const remoteById = new Map<string, Invoice>();
          result.invoices!.forEach((inv) => {
            remoteById.set(inv.id, inv);
          });
          const localOnly = prev.filter((inv) => !remoteById.has(inv.id));
          const next = [...Array.from(remoteById.values()), ...localOnly];
          idbSet(STORAGE_KEYS.INVOICES, next);
          return next;
        });
      } catch (err) {
        console.warn('Silent invoice background sync notice:', err);
      }
    };

    // Refresh only when the user switches back to this tab and 5+ minutes have passed
    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshInvoicesSafely();
      }
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, []);

  // Explicit, on-demand invoice refresh callable from any component (e.g. InvoicesManager)
  // Protected with a 2-minute cooldown when called in the background (force=false)
  const lastManualRefreshRef = React.useRef<number>(0);

  const refreshInvoicesNow = async (force = false): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const now = Date.now();
      if (!force && now - lastManualRefreshRef.current < 120_000 && invoices.length > 0) {
        return {
          success: true,
          count: invoices.length,
          message: `الفواتير محدثة بالفعل ومحفوظة محلياً (${invoices.length} فاتورة).`,
        };
      }
      lastManualRefreshRef.current = now;

      const result = await fetchInvoicesFromSupabase(
        buildInvoiceFetchScope(currentUser, users)
      );
      if (!result.success || !result.invoices) {
        return { success: false, count: 0, message: result.error || 'تعذر الاتصال بقاعدة البيانات لجلب الفواتير' };
      }
      const remoteInvoices = result.invoices;
      setInvoices((prev) => {
        const remoteById = new Map<string, Invoice>();
        remoteInvoices.forEach((inv) => remoteById.set(inv.id, inv));
        const localOnly = prev.filter((inv) => !remoteById.has(inv.id));
        const next = [...Array.from(remoteById.values()), ...localOnly];
        idbSet(STORAGE_KEYS.INVOICES, next);
        return next;
      });
      return {
        success: true,
        count: remoteInvoices.length,
        message: `تم تحديث أحدث ${remoteInvoices.length} فاتورة من السيرفر بنجاح.`,
      };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'خطأ غير متوقع أثناء تحديث الفواتير' };
    }
  };

  // Customer CRUD Actions
  const addCustomer = (newCust: Customer) => {
    // User Directive: Customers are strictly added via the master sheet only (3,427 customers).
    console.info(`Manual customer addition (${newCust?.name}) skipped: customers are loaded from the master sheet only.`);
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مستخدم',
      userRole: currentUser?.role || 'sales_rep',
      branchName: newCust.branchName || currentUser?.branchName || 'الفرع الرئيسي',
      action: 'add_customer' as any,
      actionTitle: `محاولة إضافة عميل يدوي (${newCust.name})`,
      details: `قاعدة العملاء مقفولة وتعتمد حصرياً على الشيت الأساسي. لم يتم إدراج العميل في قاعدة البيانات.`,
      badgeType: 'warning',
    });
  };

  const updateCustomer = (updatedCust: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updatedCust.id ? updatedCust : c)));
    idbSet(STORAGE_KEYS.CUSTOMERS, customers.map((c) => (c.id === updatedCust.id ? updatedCust : c)))
      .catch(() => {});
    syncOrQueue('customers', 'upsert', updatedCust.id, updatedCust, () =>
      saveCustomersToSupabase([updatedCust])
    ).catch((e) => console.warn('Supabase customer update error:', e));
    publishDataVersionUpdate({
      scope: 'customers',
      notes: `تعديل بيانات العميل ${updatedCust.name || updatedCust.code}`,
    }).catch(() => {});
  };

  const deleteCustomer = (customerId: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    idbSet(STORAGE_KEYS.CUSTOMERS, customers.filter((c) => c.id !== customerId)).catch(() => {});
    // Delete from Supabase, or park it in the offline outbox until the network returns.
    syncOrQueue('customers', 'delete', customerId, undefined, () =>
      deleteCustomerFromSupabase(customerId)
    ).catch((e) => console.warn('Supabase customer delete error:', e));
    publishDataVersionUpdate({ scope: 'customers', notes: 'حذف عميل من قاعدة العملاء' }).catch(() => {});
  };

  const cleanAndDeduplicateCustomers = () => {
    const originalCount = customers.length;
    const sanitized = sanitizeCustomers(customers);
    const cleaned = deduplicateCustomersArray(sanitized);
    const duplicatesRemoved = Math.max(0, originalCount - cleaned.length);
    if (duplicatesRemoved > 0 || cleaned.length !== originalCount) {
      setCustomers(cleaned);
      idbSet(STORAGE_KEYS.CUSTOMERS, cleaned).catch(() => {});
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
    if (!userList || userList.length === 0 || !list || list.length === 0) return list;

    const reps = userList.filter((u) => u.role === 'sales_rep' || u.role === 'supervisor' || u.role === 'branch_manager');
    if (reps.length === 0) return list;

    // Pre-index reps for ultra-fast matching
    const preparedReps = reps.map((u) => ({
      user: u,
      normName: normalizeArabicText(u.name).replace(/\s+/g, ''),
      identityAliases: [u.name, u.username, u.email?.split('@')[0] || '']
        .map((value) => normalizeArabicText(value))
        .filter(Boolean),
      normBranch: u.branchName ? normalizeBranchName(u.branchName) : '',
    }));

    // Cache lookup results to avoid re-running match algorithms for duplicate rep names
    const repMatchCache = new Map<string, User | null>();

    return list.map((c) => {
      let updated = { ...c };

      if (!updated.branchName) {
        const locInferred = inferBranchFromText(
          `${updated.address || ''} ${updated.governorate || ''} ${updated.name || ''} ${updated.notes || ''}`
        );
        if (locInferred) {
          updated.branchName = locInferred;
        }
      } else {
        updated.branchName = normalizeBranchName(updated.branchName);
      }

      const rawRep = (updated.salesRepName || updated.repName || '').trim();
      if ((!rawRep || rawRep === 'مندوب المبيعات' || rawRep === 'المندوب' || rawRep === 'غير محدد') && !updated.repId) {
        return updated;
      }

      let matched: User | null = null;
      if (rawRep && rawRep !== 'مندوب المبيعات' && rawRep !== 'المندوب') {
        const cacheKey = `${rawRep}:::${updated.branchName || ''}`;
        if (repMatchCache.has(cacheKey)) {
          matched = repMatchCache.get(cacheKey)!;
        } else {
          const normRep = normalizeArabicText(rawRep);
          // 1. Direct normalized name match in branch
          const direct = preparedReps.find((pr) => {
            if (
              updated.branchName &&
              pr.normBranch &&
              !isBranchMatch(updated.branchName, pr.user.branchName, { allowUnassigned: false })
            ) {
              return false;
            }
            return pr.identityAliases.some((alias) => alias === normRep || alias.replace(/\s+/g, '') === normRep.replace(/\s+/g, ''));
          });

          if (direct) {
            matched = direct.user;
          } else {
            // 2. Fuzzy Arabic match
            const fuzzy = preparedReps.find((pr) => {
              if (
                updated.branchName &&
                pr.normBranch &&
                !isBranchMatch(updated.branchName, pr.user.branchName, { allowUnassigned: false })
              ) {
                return false;
              }
              return pr.identityAliases.some((alias) => isArabicNameMatch(rawRep, alias));
            });
            matched = fuzzy ? fuzzy.user : null;
          }
          repMatchCache.set(cacheKey, matched);
        }
      }

      if (matched) {
        return {
          ...updated,
          repName: rawRep || matched.name,
          repId: matched.id,
          salesRepName: rawRep || matched.name,
          branchName: updated.branchName || matched.branchName || '',
          creditLimit: updated.creditLimit !== undefined ? Number(updated.creditLimit) : 0,
          currentBalance: Number(updated.currentBalance ?? updated.balance ?? 0),
          balance: Number(updated.currentBalance ?? updated.balance ?? 0),
        };
      }
      return {
        ...updated,
        creditLimit: updated.creditLimit !== undefined ? Number(updated.creditLimit) : 0,
        currentBalance: Number(updated.currentBalance ?? updated.balance ?? 0),
        balance: Number(updated.currentBalance ?? updated.balance ?? 0),
      };
    });
  };

  const importCustomersList = async (
    newCustomers: Customer[],
    mode: 'merge' | 'replace' | 'upsert' = 'replace'
  ): Promise<{ success: boolean; count: number; removed: number; message: string }> => {
    const sanitizedIncoming = sanitizeCustomers(newCustomers);
    const linked = linkCustomersToUsers(sanitizedIncoming, users);
    const incomingDeduped = deduplicateCustomersArray(linked);
    // 'replace' is the admin's authoritative sheet: drop the local list entirely
    // so a previously duplicated cache can never re-seed the server.
    const finalCustomers = mode === 'replace' ? incomingDeduped : deduplicateCustomersArray([...customers, ...incomingDeduped]);
    idbSet(STORAGE_KEYS.CUSTOMERS, finalCustomers).catch(() => {});
    setCustomers(finalCustomers);
    authoritativeWriteAtRef.current = Date.now();
    saveLocalCustomersFingerprint(finalCustomers);

    try {
      const res = await replaceCustomersInSupabase(finalCustomers);
      if (!res.success) {
        // Do NOT publish a version stamp on a failed write. Doing so made the
        // next heartbeat pull the previous server copy, which looked like the
        // correct data spontaneously reverting.
        const msg = `لم يتم حفظ التحديث على السيرفر: ${res.error || 'خطأ غير معروف'}`;
        setLastVersionSyncNotice(msg);
        setTimeout(() => setLastVersionSyncNotice(null), 12000);
        return { success: false, count: finalCustomers.length, removed: 0, message: msg };
      }
      const dupNote = res.removed > 0 ? ` وحذف ${res.removed} سجل مكرر` : '';
      setLastVersionSyncNotice(
        `تم تحديث قاعدة العملاء (${finalCustomers.length} عميل)${dupNote} — البيانات الآن موحدة لكل المناديب والمشرفين`
      );
      setTimeout(() => setLastVersionSyncNotice(null), 8000);
      await publishNewDataVersion({
        scope: 'customers',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث قاعدة بيانات العملاء (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'}) - ${finalCustomers.length} عميل`,
        customersCount: finalCustomers.length,
        forcePurge: true,
      }).catch(() => {});
      return {
        success: true,
        count: finalCustomers.length,
        removed: res.removed,
        message: `تم تحديث ${finalCustomers.length} عميل وتحديث جميع المناديب والمشرفين تلقائياً${dupNote}`,
      };
    } catch (e: any) {
      const msg = `تعذر حفظ التحديث على السيرفر: ${e?.message || 'خطأ غير معروف'}`;
      setLastVersionSyncNotice(msg);
      setTimeout(() => setLastVersionSyncNotice(null), 12000);
      return { success: false, count: finalCustomers.length, removed: 0, message: msg };
    }
  };

  const clearCustomersCacheAndReset = () => {
    setCustomers([]);
    setActiveCustomersCache([]);
    idbDelete(STORAGE_KEYS.CUSTOMERS).catch(() => {});
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
  };



  const refreshCustomerRepLinks = (): {
    updatedCount: number;
    totalCustomers: number;
    linkedCustomersCount: number;
    unassignedCount: number;
    repBreakdown: { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }[];
    unmatchedReps: string[];
  } => {
    let updatedCount = 0;
    const currentUsers = users;
    let nextCustomers: Customer[] = [];

    setCustomers((prev) => {
      const linked = linkCustomersToUsers(prev, currentUsers);
      updatedCount = linked.filter(
        (c, i) => c.repId !== prev[i]?.repId || c.branchName !== prev[i]?.branchName || c.salesRepName !== prev[i]?.salesRepName
      ).length;
      saveCustomersToSupabase(linked).catch(() => {});
      nextCustomers = linked;
      return linked;
    });

    const listToAnalyze = nextCustomers.length > 0 ? nextCustomers : customers;
    const totalCustomers = listToAnalyze.length;
    const repMap = new Map<string, { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }>();
    let linkedCustomersCount = 0;
    let unassignedCount = 0;
    const unmatchedSet = new Set<string>();

    listToAnalyze.forEach((c) => {
      const rep = (c.salesRepName || c.repName || '').trim();
      if (!rep || rep === 'مندوب المبيعات' || rep === 'المندوب' || rep === 'غير محدد') {
        unassignedCount++;
        return;
      }
      linkedCustomersCount++;
      const user = currentUsers.find(
        (u) => (u.role === 'sales_rep' || u.role === 'supervisor') && (u.id === c.repId || isArabicNameMatch(rep, u.name))
      );
      const key = user ? user.name : rep;
      if (!repMap.has(key)) {
        repMap.set(key, {
          repName: key,
          branchName: c.branchName || user?.branchName || '',
          customerCount: 0,
          hasUserAccount: !!user,
          user,
        });
      }
      repMap.get(key)!.customerCount++;
      if (!user) {
        unmatchedSet.add(rep);
      }
    });

    return {
      updatedCount,
      totalCustomers,
      linkedCustomersCount,
      unassignedCount,
      repBreakdown: Array.from(repMap.values()),
      unmatchedReps: Array.from(unmatchedSet),
    };
  };

  const autoCreateMissingRepsFromCustomers = (): { createdUsers: User[]; count: number; message: string } => {
    const created: User[] = [];
    const repNamesMap = new Map<string, { name: string; branchName: string }>();

    customers.forEach((c) => {
      const rep = (c.salesRepName || c.repName || '').trim();
      if (!rep || rep === 'مندوب المبيعات' || rep === 'المندوب' || rep === 'غير محدد') return;
      if (!repNamesMap.has(rep)) {
        repNamesMap.set(rep, {
          name: rep,
          branchName: c.branchName || 'فرع المنيا',
        });
      }
    });

    const newUsersList = [...users];
    let addedAny = false;

    repNamesMap.forEach(({ name, branchName }) => {
      const normIncoming = normalizeArabicText(name);
      const exists = newUsersList.some(
        (u) =>
          (u.role === 'sales_rep' || u.role === 'supervisor') &&
          (normalizeArabicText(u.name) === normIncoming || isArabicNameMatch(name, u.name))
      );
      if (!exists) {
        const cleanId = `rep_${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now().toString().slice(-4)}`;
        const cleanUser = name.replace(/\s+/g, '').toLowerCase().slice(0, 15);
        const newUser: User = {
          id: cleanId,
          name,
          username: cleanUser || `rep_${Date.now().toString().slice(-4)}`,
          email: `${cleanUser || 'rep'}@dream.com`,
          role: 'sales_rep',
          branchName: branchName || 'فرع المنيا',
          phone: '',
          isActive: true,
          approvalStatus: 'active',
          registrationDate: new Date().toISOString(),
        };
        newUsersList.push(newUser);
        created.push(newUser);
        addedAny = true;
      }
    });

    if (addedAny) {
      setUsers(newUsersList);
      safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(newUsersList));
      idbSet(STORAGE_KEYS.USERS, newUsersList);
      saveUsersToSupabase(newUsersList).catch(() => {});
      // Link customers to new users
      setCustomers((prev) => {
        const linked = linkCustomersToUsers(prev, newUsersList);
        saveCustomersToSupabase(linked).catch(() => {});
        return linked;
      });
    }

    return {
      createdUsers: created,
      count: created.length,
      message: created.length > 0
        ? `تم إنشاء وتفعيل حسابات ${created.length} مندوب بنجاح وربط عملائهم تلقائياً!`
        : 'جميع المناديب المذكورين بالشيت لديهم حسابات مفعلة بالفعل ومطابقة للعملاء.',
    };
  };

  const mergeDuplicateUsers = async (): Promise<{
    success: boolean;
    message: string;
    mergedCount: number;
    details: string[];
  }> => {
    const dedup = sanitizeAndDeduplicateUsers(users);
    if (dedup.mergedCount === 0) {
      return {
        success: true,
        message: 'جميع حسابات الموظفين سليمة ومطابقة 100% ولا توجد أي حسابات مكررة.',
        mergedCount: 0,
        details: [],
      };
    }

    setUsers(dedup.deduplicated);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(dedup.deduplicated));
    idbSet(STORAGE_KEYS.USERS, dedup.deduplicated);

    // Remap customers
    setCustomers((prev) => {
      let changed = false;
      const updated = prev.map((c) => {
        if (c.repId && dedup.idRedirectMap[c.repId]) {
          changed = true;
          return { ...c, repId: dedup.idRedirectMap[c.repId] };
        }
        return c;
      });
      if (changed) {
        idbSet(STORAGE_KEYS.CUSTOMERS, updated);
      }
      return changed ? updated : prev;
    });

    // Remap invoices
    setInvoices((prev) => {
      let changed = false;
      const updated = prev.map((inv) => {
        if (inv.repId && dedup.idRedirectMap[inv.repId]) {
          changed = true;
          return { ...inv, repId: dedup.idRedirectMap[inv.repId] };
        }
        return inv;
      });
      if (changed) {
        idbSet(STORAGE_KEYS.INVOICES, updated);
      }
      return changed ? updated : prev;
    });

    // Delete duplicate IDs from Supabase permanently
    for (const remId of dedup.removedUserIds) {
      await deleteUserFromSupabase(remId).catch(() => {});
    }
    await saveUsersToSupabase(dedup.deduplicated).catch(() => {});

    const details = dedup.mergedPairs.map(
      (p) => `تم دمج حساب المندوب [${p.keptUser.name}] بفرع (${p.keptUser.branchName || 'العام'}) وحذف الحساب المكرر (${p.removedUsername || p.removedId})`
    );

    return {
      success: true,
      message: `تم دمج وتنظيف ${dedup.mergedCount} حساب مكرر بنجاح وتحديث كافة الارتباطات.`,
      mergedCount: dedup.mergedCount,
      details,
    };
  };

  // Auto-link customers to users in memory safely when users arrive or change, without network loops
  const lastUsersFingerprintRef = React.useRef<string>('');
  useEffect(() => {
    if (users.length === 0 || customers.length === 0) return;
    const currentFingerprint = users.map((u) => `${u.id}:${u.name}:${u.branchName}`).join('|');
    if (lastUsersFingerprintRef.current === currentFingerprint) return;
    lastUsersFingerprintRef.current = currentFingerprint;

    setCustomers((prev) => {
      const needsLinking = prev.some((c) => (c.salesRepName || c.repName) && !c.repId);
      if (!needsLinking && prev.length > 0) return prev;
      const linked = linkCustomersToUsers(prev, users);
      idbSet(STORAGE_KEYS.CUSTOMERS, linked).catch(() => {});
      return linked;
    });
  }, [users]);

  // Sync high-capacity data directly to IndexedDB (preventing LocalStorage quota overflow).
  // Debounced: a 5000-row customer table (~5MB) was being written on every
  // keystroke/filter change, blocking the main thread. Now batches into a
  // single write after the data settles.
  const cancelCustomersIdb = useRef(debouncedIdbSet(STORAGE_KEYS.CUSTOMERS, customers));
  const cancelInvoicesIdb = useRef(debouncedIdbSet(STORAGE_KEYS.INVOICES, invoices));
  const cancelProductsIdb = useRef(debouncedIdbSet(STORAGE_KEYS.PRODUCTS, products));
  const cancelCartIdb = useRef(debouncedIdbSet(STORAGE_KEYS.CART, cart));

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    cancelProductsIdb.current = debouncedIdbSet(STORAGE_KEYS.PRODUCTS, products);
    cancelProductsIdb.current();
  }, [products, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    cancelCustomersIdb.current = debouncedIdbSet(STORAGE_KEYS.CUSTOMERS, customers);
    cancelCustomersIdb.current();
  }, [customers, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    cancelInvoicesIdb.current = debouncedIdbSet(STORAGE_KEYS.INVOICES, invoices);
    cancelInvoicesIdb.current();
  }, [invoices, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    cancelCartIdb.current = debouncedIdbSet(STORAGE_KEYS.CART, cart);
    cancelCartIdb.current();
  }, [cart, isLocalDataHydrated]);

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
    if (currentUser && isAuthenticated) {
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      safeLocalStorageSet(STORAGE_KEYS.IS_AUTH, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      safeLocalStorageSet(STORAGE_KEYS.IS_AUTH, 'false');
    }
  }, [currentUser, isAuthenticated]);

  // Real-time Session Watcher: If current user is deleted or deactivated by admin, immediately terminate session
  useEffect(() => {
    if (currentUser && isAuthenticated && users.length > 0) {
      const activeAccount = users.find((u) => u.id === currentUser.id);
      if (!activeAccount) {
        logout();
        setAuthTerminationNotice('تم حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
      } else if (!activeAccount.isActive || activeAccount.approvalStatus === 'rejected') {
        logout();
        setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
      }
    }
  }, [users, currentUser, isAuthenticated]);

  // Multi-tab sync for immediate logout on user deletion across tabs
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.USERS && e.newValue && currentUser && isAuthenticated) {
        try {
          const parsedUsers: User[] = JSON.parse(e.newValue);
          const me = parsedUsers.find((u) => u.id === currentUser.id);
          if (!me || !me.isActive || me.approvalStatus === 'rejected') {
            logout();
            setAuthTerminationNotice('تم إيقاف أو حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
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

    /**
     * Supabase Auth (اختياري، بيشتغل لو اتنفّذ migration الـ SQL).
     *
     * بنحاوله الأول عشان التحقق يبقى على السيرفر مش في المتصفح. لو رجّع
     * anything غير 'success' بنكمل عادي في التحقق القديم بالظبط — يعني
     * قبل ما حد يفعّل الحسابات على السيرفر، الـ login بيشتغل زي ما هو
     * من غير أي تغيير. لو نجح، بنكمل باقي فحص الحساب (الموافقة، الإيقاف)
     * بنفس القواعد القديمة بالظبط، فالأدوار مش بتتغير خالص.
     */
    let serverAuthUserId: string | null = null;
    if (isServerAuthEnabled()) {
      const outcome = await tryServerSignIn(identifier, cleanPass);
      if (outcome.kind === 'success') {
        serverAuthUserId = outcome.authUserId;
        if (outcome.email) {
          linkAuthUserToProfile(outcome.authUserId, outcome.email).catch(() => {});
        }
      }
      // 'unavailable' و 'no-server-account' و 'wrong-credentials' كلهم
      // بيروحوا لل(old) تحقق — فالحساب اللي لسه على الوضع القديم
      // بيفضل يدخل عادي.
    }

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

    // Verify the credential.
    //
    // لو Supabase Auth نجح فوق، التحقق اتعمل على السيرفر خلاص، فبنعدّي على
    // مقارنة البصمة المحلية دي. في كل الحالات التانية (الحساب لسه على
    // الوضع القديم، أو السيرفر مش متاح) بنستخدم نفس تحقق بصمة sha256
    // القديم بالظبط — فسلوك الدخول الحالي مش بيتغيّر خالص.
    const storedCredential = (found.password || '').trim();
    if (serverAuthUserId) {
      // اتحقق على السيرفر خلاص — مفيش مقارنة محلية لازم تعملها.
    } else if (storedCredential.length > 0) {
      const check = await verifyPassword(cleanPass, storedCredential);
      if (!check.valid) {
        return { success: false, message: 'كلمة المرور غير صحيحة. يرجى التأكد من كتابة كلمة المرور بدقة.' };
      }
      if (check.legacy) {
        const upgraded = await withHashedCredential(found);
        found = { ...found, password: upgraded.password };
        setUsers((prev) => prev.map((u) => (u.id === found!.id ? { ...u, password: upgraded.password } : u)));
        if (users.find((u) => u.id === found!.id)) {
          safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(
            users.map((u) => (u.id === found!.id ? { ...u, password: upgraded.password } : u))
          ));
        }
        saveUserToSupabase(found).catch((e) => console.warn('Password upgrade sync notice:', e));
      }
    } else {
      return {
        success: false,
        message: 'لا توجد كلمة مرور مسجلة لهذا الحساب. يرجى مراجعة إدارة النظام لتعيين كلمة المرور قبل تسجيل الدخول.',
      };
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
      details: `تم تسجيل الدخول بصلاحية (${found.role === 'admin' ? 'مدير النظام (الإدارة)' : found.role === 'branch_manager' ? 'مدير فرع' : found.role === 'supervisor' ? 'مشرف مبيعات' : found.role === 'developer' ? 'مطور تقني' : 'مندوب مبيعات'}) لـ ${found.branchName}.`,
      badgeType: 'info',
    });

    return { success: true, message: `مرحباً بك ${found.name}`, user: found };
  };

  const register = async (userData: {
    name: string;
    username: string;
    email: string;
    password?: string;
    phone: string;
    branchName: string;
    role: UserRole;
    supervisorId?: string;
  }): Promise<{ success: boolean; message: string }> => {
    const existing = users.find(
      (u) =>
        u.email.toLowerCase() === userData.email.trim().toLowerCase() ||
        u.username.toLowerCase() === userData.username.trim().toLowerCase()
    );

  if (existing || hasDuplicateUserIdentity(userData, users)) {
  return { success: false, message: 'اسم المستخدم أو البريد أو الهاتف أو اسم المندوب مسجل بالفعل.' };
  }
  
  const newUser: User = {
      id: `u-${Date.now()}`,
      name: userData.name.trim(),
      username: userData.username.trim().toLowerCase(),
      email: userData.email.trim().toLowerCase(),
      password: await hashPassword(userData.password || ''),
      phone: userData.phone.trim(),
      branchName: userData.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      role: userData.role || 'sales_rep',
      supervisorId: userData.supervisorId,
      isActive: true,
      approvalStatus: userData.role === 'developer' || userData.role === 'admin' ? 'active' : 'pending_approval', // Requires admin approval for reps
      registrationDate: new Date().toISOString().slice(0, 10),
      avatar: '/pwa-192x192.png'
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
      message: 'تم تسجيل طلب الحساب بنجاح وهو الآن بانتظار تفعيل الأدمن وتخصيص المشرف والتفعيل.'
    };
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEYS.IS_AUTH);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_DATA);
    clearCart();
    // لو الجلسة كانت على Supabase Auth، اقفلها هناك كمان. لو مفيش جلسة
    // (وضع legacy) أو فيه مشكلة شبكة، سيبتها بهدوء — حالة العميل المحلية
    // اتقفلت فوق في كل الأحوال.
    signOutServer().catch(() => {});
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
    if (currentUser?.id === userId) {
      logout();
      setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
    }
  };

  const deleteUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    syncOrQueue('users', 'delete', userId, undefined, () => deleteUserFromSupabase(userId))
      .then(() => publishDataVersionUpdate({ scope: 'all', notes: 'حذف مستخدم من النظام' }))
      .catch((e) => console.warn('Supabase delete user failed:', e));
    if (currentUser?.id === userId) {
      logout();
      setAuthTerminationNotice('تم حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
    }
    // Clean rep associations from customers
    setCustomers((prev) =>
      prev.map((c) => (c.repId === userId ? { ...c, repId: undefined, repName: 'غير محدد', salesRepName: 'غير محدد' } : c))
    );
  };

  const assignSupervisor = (repId: string, supervisorId: string) => {
    const nextUsers = users.map((u) => (u.id === repId ? { ...u, supervisorId } : u));
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers).catch(() => {});
    saveUsersToSupabase(nextUsers).catch((e) => console.warn('Supabase supervisor assignment failed:', e));
  };

  // --- Inventory & Stock Real-time Audit Helper ---
  const recordInventoryTransaction = (_tx: Omit<InventoryTransaction, 'id' | 'timestamp' | 'date'>) => {
    // Inventory logs disabled as requested by user to keep the app ultra-clean and lightweight
  };

  const checkProductAvailability = (productId: string, requestedCartons: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return { available: false, remainingPieces: 0, message: 'الصنف غير موجود بالسيستم' };

    const branchActual = prod.branchStockActual || 0;
    const branchAvailable = typeof prod.branchStockReserved === 'number'
      ? Math.min(branchActual, Math.max(0, prod.branchStockReserved))
      : branchActual;
    const branchReservedCount = Math.max(0, branchActual - branchAvailable);

    const mainActual = prod.mainWarehouseActual || 0;
    const mainAvailable = typeof prod.mainWarehouseReserved === 'number'
      ? Math.min(mainActual, Math.max(0, prod.mainWarehouseReserved))
      : mainActual;
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
    const availableInBranch = typeof latestProd.branchStockReserved === 'number'
      ? Math.min(branchActual, Math.max(0, latestProd.branchStockReserved))
      : branchActual;
    const branchReservedCount = Math.max(0, branchActual - availableInBranch);

    const mainActual = latestProd.mainWarehouseActual || 0;
    const availableInWarehouse = typeof latestProd.mainWarehouseReserved === 'number'
      ? Math.min(mainActual, Math.max(0, latestProd.mainWarehouseReserved))
      : mainActual;
    const mainReservedCount = Math.max(0, mainActual - availableInWarehouse);

    const totalActual = branchActual + mainActual;
    const totalReserved = branchReservedCount + mainReservedCount;
    const totalAvailable = availableInBranch + availableInWarehouse;

    if (totalAvailable <= 0) {
      return {
        success: false,
        message: `⚠️ تنبيه رصيد محجوز: الصنف (${latestProd.name}) غير متاح للبيع حالياً!\n(الرصيد الفعلي بالمخزن: ${totalActual} كرتونة، ولكن تم حجز ${totalReserved} كرتونة لطلبيات أخرى قيد مراجعة المشرف ⬅️ المتاح الصافي: 0 كرتونة).`
      };
    }

    if (cartonsToAdd > totalAvailable) {
      return {
        success: false,
        message: `⚠️ الكمية المطلوبة (${cartonsToAdd} كرتونة) أكبر من الرصيد المتاح للطلب (${totalAvailable} كرتونة) للصنف (${latestProd.name}).\n(المتاح بالفرع: ${availableInBranch} كرتونة • متاح بأكتوبر: ${availableInWarehouse} كرتونة • محجوز لطلبيات أخرى: ${totalReserved} كرتونة).`
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
                // Re-evaluate the source: the same line can cross from branch
                // stock into a deficit once more cartons are added.
                fulfillFromMainWarehouse:
                  availableInBranch < newCartonCount + newPieceCount / cartonQty &&
                  availableInWarehouse > 0,
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
            // Split by the actual shortfall. The old test only asked whether the
            // branch was completely empty, so a rep asking for 5 cartons when
            // the branch holds 3 was tagged as fully available at the branch and
            // the shortage vanished from the deficit report.
            fulfillFromMainWarehouse:
              availableInBranch < totalRequiredCartonFraction && availableInWarehouse > 0,
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
    scheduleProductSync();
  };

  const updateProduct = (updated: Product) => {
    const sanitized = sanitizeProducts([updated])[0];
    setProducts((prev) => prev.map((p) => (p.id === sanitized.id ? sanitized : p)));
    scheduleProductSync();
  };

  const deleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    scheduleProductSync();
  };

  const importProductsList = (newProducts: Product[], mode: 'merge' | 'replace' = 'replace') => {
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
          reservedPiecesByProduct.set(item.productId, current + (item.cartonCount || 0));
        });
      }
    });

    const protectReserved = (prod: Product): Product => {
      const activePending = reservedPiecesByProduct.get(prod.id) || 0;
      const branchActual = Math.max(0, prod.branchStockActual || 0);
      const warehouseActual = Math.max(0, prod.mainWarehouseActual || 0);
      const branchReserved = Math.max(0, branchActual - activePending);
      const warehouseReserved =
        typeof prod.mainWarehouseReserved === 'number' && prod.mainWarehouseReserved > 0
          ? Math.min(warehouseActual, prod.mainWarehouseReserved)
          : warehouseActual;
      return {
        ...prod,
        branchStockReserved: branchReserved,
        mainWarehouseReserved: warehouseReserved,
      };
    };

    /**
     * مفتاح مطابقة الصنف = نفس `productIdentityKey` المستخدم في الفلترة بعد
     * الاستيراد (appContextHelpers).
     *
     * كانوا اتنين implementations مختلفين:
     *   - هنا:  `${code}__${color}__${size}` — والمشكل إن الأصناف من غير كود
     *     كلهم بيطلعوا نفس المفتاح `___`، فالاستيراد كان بيعمل **دمج**
     *    amongهم accidentally.
     *   - هناك: `code:${code}|${color}|${size}` وبفلتر fallback للمركّب.
     *
     * لما يكون المفتاحين مختلفين، الدمج بيعرف إن الصنف موجود والفلترة
     * بتعتبره صنف جديد، فالصف بيفضل في الكتالوج من غير ما حد ياخد باله.
     * دلوقتي التنين نفس الدالة، فمفيش طريق للبتر.
     */
    const getProductMatchKey = (p: Product): string => productIdentityKey(p);

    const existingById = new Map<string, Product>();
    const existingByKey = new Map<string, Product>();
    products.forEach((p) => {
      if (p.id) existingById.set(p.id, p);
      const key = getProductMatchKey(p);
      if (key) existingByKey.set(key, p);
    });

    // Update existing products from incoming sheet data or insert new items
    const processedIncoming = newProducts.map((incoming) => {
      const existing = (incoming.id && existingById.get(incoming.id)) || existingByKey.get(getProductMatchKey(incoming));
      if (existing) {
        // UPDATE existing record with fresh sheet stock, prices, factor, and unified model code
        const merged: Product = {
          ...existing,
          ...incoming,
          id: existing.id,
          imageUrl: incoming.imageUrl || existing.imageUrl,
          cloudinaryPublicId: incoming.cloudinaryPublicId || existing.cloudinaryPublicId || incoming.code,
        };
        return protectReserved(merged);
      }
      return protectReserved(incoming);
    });

    let finalUpdated: Product[] = [];
    if (mode === 'replace') {
      finalUpdated = sanitizeProducts(processedIncoming);
      setProducts(finalUpdated);
    } else {
      // Upsert: update matched existing items and append genuinely new codes
      const incomingKeys = new Set(processedIncoming.map(getProductMatchKey));
      const untouchedExisting = products.filter((p) => !incomingKeys.has(getProductMatchKey(p)));
      finalUpdated = sanitizeProducts([...untouchedExisting, ...processedIncoming]);
      setProducts(finalUpdated);
    }

    // Persist full catalog to Supabase so reps & branch supervisors instantly receive it on all devices
    saveProductsToSupabase(finalUpdated).then((result) => {
      if (!result.success) {
        console.warn('Supabase catalog auto-sync warning:', result.error || 'Product save failed.');
        return;
      }
      publishNewDataVersion({
        scope: 'products',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث كتالوج الأصناف والأسعار (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'})`,
        productsCount: finalUpdated.length,
        forcePurge: true,
      }).catch(() => {});
    }).catch((err) => {
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
      scheduleProductSync();
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
          unifiedCode: item.unifiedCode || item.product.unifiedCode,
          color: item.product.color,
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
    const defaultBranch = currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
    const orderBranch = currentUser?.role === 'admin' || currentUser?.role === 'developer'
      ? (orderData.branchName || defaultBranch)
      : defaultBranch;

    // Match customer for credit limit & debt validation using intelligent matcher
    const matchedCustomer = findCustomerMatch(customers, {
      customerId: orderData.customerId,
      customerCode: orderData.customerCode,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
    });

    const custBalanceBefore = orderData.customerBalanceBefore !== undefined && orderData.customerBalanceBefore !== null
      ? Number(orderData.customerBalanceBefore)
      : Number(matchedCustomer?.currentBalance ?? matchedCustomer?.balance ?? 0);

    const custCreditLimit = orderData.customerCreditLimit !== undefined && orderData.customerCreditLimit !== null
      ? Number(orderData.customerCreditLimit)
      : Number(matchedCustomer?.creditLimit !== undefined && matchedCustomer?.creditLimit !== null ? matchedCustomer.creditLimit : 0);

    const custOverdue = orderData.customerOverdueBalance !== undefined && orderData.customerOverdueBalance !== null
      ? Number(orderData.customerOverdueBalance)
      : resolveCustomerDuesValue(matchedCustomer);

    const custBalanceAfter = orderData.customerBalanceAfter !== undefined && orderData.customerBalanceAfter !== null
      ? Number(orderData.customerBalanceAfter)
      : (custBalanceBefore + primaryTotals.estimatedGrandTotal);

    const isCreditExceeded = orderData.creditLimitExceeded !== undefined
      ? Boolean(orderData.creditLimitExceeded)
      : (custCreditLimit > 0 && custBalanceAfter > custCreditLimit);

    const reqPayment = orderData.requiredDownPayment !== undefined && orderData.requiredDownPayment !== null
      ? Number(orderData.requiredDownPayment)
      : (isCreditExceeded ? Math.max(0, custBalanceAfter - custCreditLimit) : 0);

    const primaryInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber,
      customerId: orderData.customerId || (matchedCustomer ? matchedCustomer.id : undefined),
      customerName: orderData.customerName || (matchedCustomer ? matchedCustomer.name : 'عميل تجزئة عام'),
      customerCode: orderData.customerCode || (matchedCustomer ? matchedCustomer.code : undefined),
      customerPhone: orderData.customerPhone || (matchedCustomer ? matchedCustomer.phone : ''),
      customerAddress: orderData.customerAddress || (matchedCustomer ? matchedCustomer.address : ''),
      customerTaxNumber: orderData.customerTaxNumber || (matchedCustomer ? matchedCustomer.taxNumber : ''),
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
      customerBalanceBefore: custBalanceBefore,
      customerCreditLimit: custCreditLimit,
      customerBalanceAfter: custBalanceAfter,
      customerOverdueBalance: custOverdue,
      creditLimitExceeded: isCreditExceeded,
      requiredDownPayment: reqPayment,
      qrPayload: `DREAM-EINV-${newInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${primaryTotals.estimatedGrandTotal.toFixed(2)}|${primaryTotals.taxAmount.toFixed(2)}|${formattedDate}`,
    };

    let createdShortageInvoice: Invoice | undefined = undefined;

    if (shouldSplit && shortageCartItems.length > 0) {
      const shortageItems = buildInvoiceItems(shortageCartItems);
      const shortageTotals = calculateTotals(shortageItems);
      const shortageInvoiceNumber = `${newInvoiceNumber}-NQ`;
      const shortageBalanceAfter = custBalanceBefore + shortageTotals.estimatedGrandTotal;
      const shortageCreditExceeded = custCreditLimit > 0 && shortageBalanceAfter > custCreditLimit;
      const shortageReqPayment = shortageCreditExceeded ? Math.max(0, shortageBalanceAfter - custCreditLimit) : 0;

      createdShortageInvoice = {
        id: `inv-${Date.now() + 1}`,
        invoiceNumber: shortageInvoiceNumber,
        customerId: orderData.customerId || (matchedCustomer ? matchedCustomer.id : undefined),
        customerName: orderData.customerName || (matchedCustomer ? matchedCustomer.name : 'عميل تجزئة عام'),
        customerCode: orderData.customerCode || (matchedCustomer ? matchedCustomer.code : undefined),
        customerPhone: orderData.customerPhone || (matchedCustomer ? matchedCustomer.phone : ''),
        customerAddress: orderData.customerAddress || (matchedCustomer ? matchedCustomer.address : ''),
        customerTaxNumber: orderData.customerTaxNumber || (matchedCustomer ? matchedCustomer.taxNumber : ''),
        date: formattedDate,
        time: formattedTime,
        repId: assignedRepId,
        repName: assignedRepName,
        supervisorName: assignedSupervisorName,
        branchName: orderBranch,
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
        notes: `فاتورة تحويل نواقص من المخزن المركزي (6 أكتوبر) تابعة للفاتورة الأساسية #${newInvoiceNumber}`,
        syncedToAccounting: false,
        customerBalanceBefore: custBalanceBefore,
        customerCreditLimit: custCreditLimit,
        customerBalanceAfter: shortageBalanceAfter,
        customerOverdueBalance: custOverdue,
        creditLimitExceeded: shortageCreditExceeded,
        requiredDownPayment: shortageReqPayment,
        isShortageInvoice: true,
        parentInvoiceId: primaryInvoice.id,
        parentInvoiceNumber: primaryInvoice.invoiceNumber,
        qrPayload: `DREAM-EINV-${shortageInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${shortageTotals.estimatedGrandTotal.toFixed(2)}|${shortageTotals.taxAmount.toFixed(2)}|${formattedDate}`,
      };
    }

    // Reserve stock immediately to prevent double-booking by multiple sales reps.
    // Physical actual stock is deducted only upon supervisor/manager approval.
    setProducts((prev) => {
      return prev.map((p) => {
        const cartItem = cart.find((c) => c.product.id === p.id);
        if (!cartItem) return p;
        const cartonUnits = cartItem.cartonCount;

        if (cartItem.fulfillFromMainWarehouse) {
          // Explicit full central warehouse reservation
          const mainUnits = Math.min(cartonUnits, Math.max(0, p.mainWarehouseReserved));
          const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
          if (updatedBranchStocks) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = Math.max(0, (updatedBranchStocks[bKey] || 0) - mainUnits);
              }
            }
          }
          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            mainWarehouseActual: isDirectManager ? Math.max(0, p.mainWarehouseActual - mainUnits) : p.mainWarehouseActual,
            mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - mainUnits),
          };
        } else {
          // Smart priority: take available from branch first, and remaining shortage from central warehouse
          const availableInBranch = Math.max(0, p.branchStockReserved);
          const takeFromBranch = Math.min(cartonUnits, availableInBranch);
          const takeFromMain = Math.max(0, cartonUnits - takeFromBranch);

          const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
          if (updatedBranchStocks && orderBranch) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, orderBranch, { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = Math.max(0, (updatedBranchStocks[bKey] || 0) - takeFromBranch);
              }
            }
          }
          if (updatedBranchStocks && takeFromMain > 0) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = Math.max(0, (updatedBranchStocks[bKey] || 0) - takeFromMain);
              }
            }
          }

          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            branchStockActual: isDirectManager ? Math.max(0, p.branchStockActual - takeFromBranch) : p.branchStockActual,
            branchStockReserved: Math.max(0, p.branchStockReserved - takeFromBranch),
            mainWarehouseActual: isDirectManager ? Math.max(0, p.mainWarehouseActual - takeFromMain) : p.mainWarehouseActual,
            mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - takeFromMain),
          };
        }
      });
    });

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
          : `حجز رصيد للطلبية #${newInvoiceNumber} لمنع تكرار الحجز (قيد مراجعة واعتماد المشرف)`,
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
        // User directive: Master customer base is restricted to the official sheet only (3,427 customers).
        // Ad-hoc invoice customers are kept on the invoice itself and NOT added to the official customer database.
        console.info('Customer database is maintained exclusively from the master sheet; order customer kept on invoice only.');
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
    saveInvoiceWithQueue(primaryInvoice).catch((e) => console.warn('Supabase invoice save failed:', e));
    if (createdShortageInvoice) {
      saveInvoiceWithQueue(createdShortageInvoice).catch((e) => console.warn('Supabase shortage invoice save failed:', e));
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
  if (
    currentUser.role !== 'admin' &&
    currentUser.role !== 'developer' &&
    (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
  ) {
    return { success: false, message: 'لا يمكنك اعتماد طلبية تابعة لفرع آخر.' };
  }
  const isPending = inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة' || inv.status === 'مسودة';
  if (!isPending) return { success: false, message: 'لا يمكن اعتماد طلبية غير معلّقة للمراجعة.' };
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
      const branchAvailable = Math.max(0, getBranchStockForProduct(product, inv.branchName));
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
      const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
      if (updatedBranchStocks && allocation.branch > 0) {
        const branchKey = Object.keys(updatedBranchStocks).find((key) =>
          isBranchMatch(key, inv.branchName, { allowUnassigned: false })
        );
        if (branchKey) {
          updatedBranchStocks[branchKey] = Math.max(0, Number(updatedBranchStocks[branchKey] || 0) - allocation.branch);
        }
      }
      return {
        ...p,
        ...(updatedBranchStocks ? { branchStocks: updatedBranchStocks } : {}),
        branchStockActual: updatedBranchStocks ? p.branchStockActual : Math.max(0, p.branchStockActual - allocation.branch),
        mainWarehouseActual: Math.max(0, p.mainWarehouseActual - allocation.main),
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

    const updatedInv: Invoice = {
      ...inv,
      status: 'معتمدة ومصروفة من المخزن' as OrderStatus,
      notes: notes ? `${inv.notes ? inv.notes + ' | ' : ''}ملاحظة الاعتماد: ${notes}` : inv.notes,
    };

    setInvoices((prev) =>
      prev.map((i) => (i.id === invoiceId ? updatedInv : i))
    );

    saveInvoiceWithQueue(updatedInv).catch((e) => console.warn('Supabase invoice update failed:', e));
    // Direct non-blocking dispatch to Microsoft 365 Power Automate (Outside React state updater to prevent duplicate dispatches)
    sendInvoiceToPowerAutomate(updatedInv, currentUser?.name, branches, companyInfo.email).catch((e) =>
      console.warn('[Power Automate] Approved invoice email notification failed:', e)
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

  const resendInvoiceEmail = async (invoiceId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser || !['supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
      return { success: false, message: 'إعادة إرسال الفاتورة متاحة للإدارة والمشرفين فقط.' };
    }

    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return { success: false, message: 'الفاتورة غير موجودة.' };
    if (!['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(invoice.status)) {
      return { success: false, message: 'لا يمكن إرسال الفاتورة قبل اعتمادها.' };
    }
    if (
      !['admin', 'developer'].includes(currentUser.role) &&
      (!currentUser.branchName || !invoice.branchName || !isBranchMatch(invoice.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك إعادة إرسال فاتورة تابعة لفرع آخر.' };
    }

    try {
      await sendInvoiceToPowerAutomate(invoice, currentUser?.name, branches, companyInfo.email, { force: true });
      recordAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        branchName: invoice.branchName,
        action: 'update_invoice_status',
        actionTitle: `إعادة إرسال الفاتورة #${invoice.invoiceNumber} بالبريد`,
        details: 'تم إرسال PDF وExcel إلى Power Automate بطلب يدوي.',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        badgeType: 'info',
      });
      return { success: true, message: `تم إعادة إرسال الفاتورة #${invoice.invoiceNumber} بالبريد مع PDF وExcel.` };
    } catch (error: any) {
      return { success: false, message: `تعذر إرسال الفاتورة: ${error?.message || 'تحقق من إعداد Power Automate.'}` };
    }
  };

  // Supervisor escalates / forwards to Branch Manager
  const forwardOrderToManager = (invoiceId: string, notes?: string): { success: boolean; message: string } => {
  if (!currentUser || currentUser.role !== 'supervisor') {
  return { success: false, message: 'تحويل الطلبية لمدير الفرع متاح للمشرف فقط.' };
  }
  const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    if (!inv.branchName || !currentUser.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false })) {
      return { success: false, message: 'لا يمكنك تحويل طلبية تابعة لفرع آخر.' };
    }
    if (!['قيد مراجعة المشرف', 'قيد المراجعة'].includes(inv.status)) {
      return { success: false, message: 'لا يمكن تحويل طلبية في هذه الحالة.' };
    }

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: 'معلقة بانتظار اعتماد الفرع' as OrderStatus,
          notes: notes ? `${i.notes ? i.notes + ' | ' : ''}تم التحويل لمدير الفرع: ${notes}` : i.notes,
        };
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase forward update failed:', e));
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
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً.' };
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    const isPending = inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة' || inv.status === 'مسودة';
    const isOwnerRep = currentUser.role === 'sales_rep' &&
      (inv.repId === currentUser.id || (!inv.repId && normalizeArabicText(inv.repName) === normalizeArabicText(currentUser.name)));
    if (currentUser.role === 'sales_rep' && (!isOwnerRep || !isPending)) {
      return { success: false, message: 'يمكن للمندوب إلغاء طلبه المعلّق فقط.' };
    }
    if (!['sales_rep', 'supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
      return { success: false, message: 'لا تملك صلاحية رفض الطلبية.' };
    }
    if (
      currentUser.role !== 'sales_rep' &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك رفض طلبية تابعة لفرع آخر.' };
    }
    if (!isPending) {
      return { success: false, message: 'لا يمكن رفض طلبية بعد اعتمادها؛ استخدم مسار المرتجع أو الإلغاء المناسب.' };
    }

    // Restore reserved stock back to available stock (in Cartons)
    setProducts((prev) => {
      return prev.map((p) => {
        const invItem = inv.items.find((it) => it.productId === p.id);
        if (!invItem) return p;
        const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
        if (invItem.fulfilledFrom === 'main_warehouse') {
          if (updatedBranchStocks) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = (updatedBranchStocks[bKey] || 0) + invItem.cartonCount;
              }
            }
          }
          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            mainWarehouseReserved: p.mainWarehouseReserved + invItem.cartonCount,
          };
        } else {
          if (updatedBranchStocks && inv.branchName) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, inv.branchName, { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = (updatedBranchStocks[bKey] || 0) + invItem.cartonCount;
              }
            }
          }
          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            branchStockReserved: p.branchStockReserved + invItem.cartonCount,
          };
        }
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
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase reject update failed:', e));
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

  // Re-open / Edit pending order for sales rep or supervisor before approval
  const editPendingOrder = (invoice: Invoice): { success: boolean; message: string; customer?: Customer | null } => {
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !invoice.branchName || !isBranchMatch(invoice.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك تعديل طلبية تابعة لفرع آخر.' };
    }
    const isRecent = invoice.createdAt ? (Date.now() - new Date(invoice.createdAt).getTime() < 48 * 3600 * 1000) : true;
    const canOverride = currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor';
    const isPending =
      invoice.status === 'قيد مراجعة المشرف' ||
      invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
      invoice.status === 'قيد المراجعة' ||
      invoice.status === 'مسودة' ||
      isRecent ||
      canOverride;

    if (!isPending) {
      return { success: false, message: 'لا يمكن تعديل هذه الفاتورة نظراً لمرور فترة طويلة على اعتمادها.' };
    }

    // Load items into cart. Pending orders reserve the generic available balance
    // at creation time, so reopening must not add stock a second time.
    const loadedCartItems: CartItem[] = invoice.items.map((item) => {
      const prod: Product = products.find((p) => p.id === item.productId) || {
        id: item.productId,
        code: item.productCode,
        name: item.productName,
        salesPriority: 'عادي',
        category: 'عام',
        status: 'متاح',
        cartonQuantity: item.cartonQuantity || 1,
        size: 'قياسي',
        color: 'افتراضي',
        branchStockActual: 100,
        branchStockReserved: 100,
        mainWarehouseActual: 100,
        mainWarehouseReserved: 100,
        department: 'عام',
        classification: 'عام',
        cartonPrice: item.pricePerCarton || item.appliedPrice,
        piecePrice: item.pricePerPiece,
        branchName: invoice.branchName || 'الفرع الرئيسي',
        minOrderQuantity: 1,
      };

      return {
        product: prod,
        cartonCount: item.cartonCount,
        pieceCount: item.pieceCount || 0,
        cartonQuantity: item.cartonQuantity || 1,
        totalPieces: item.totalUnits || 0,
        unitPrice: item.appliedPrice,
        pricePerPiece: item.pricePerPiece,
        totalPrice: item.totalBeforeTax,
        quantityDescription: item.quantityDescription,
        orderType: 'carton',
        fulfillFromMainWarehouse: item.fulfilledFrom === 'main_warehouse',
      };
    });

    setCart(loadedCartItems);

    // 3. Match customer using intelligent matcher
    const matchedCustomer = findCustomerMatch(customers, {
      customerId: invoice.customerId,
      customerCode: invoice.customerCode,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
    }) || (invoice.customerName ? {
      id: invoice.customerId || `c-temp-${Date.now()}`,
      code: invoice.customerCode || 'CUST-NEW',
      name: invoice.customerName,
      phone: invoice.customerPhone || '',
      address: invoice.customerAddress || '',
      taxNumber: invoice.customerTaxNumber || '',
      governorate: 'عام',
      branchName: invoice.branchName,
      salesRepName: invoice.repName,
      repName: invoice.repName,
      repId: invoice.repId,
      tier: 'عادي',
      balance: Number(invoice.customerBalanceBefore || 0),
      currentBalance: Number(invoice.customerBalanceBefore || 0),
      creditLimit: Number(invoice.customerCreditLimit !== undefined && invoice.customerCreditLimit !== null ? invoice.customerCreditLimit : 0),
      notes: '',
    } : null);

    // 4. Remove previous pending invoice
    setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));

    recordAuditLog({
      userId: currentUser?.id || 'rep',
      userName: currentUser?.name || 'المندوب',
      userRole: currentUser?.role || 'sales_rep',
      branchName: invoice.branchName,
      action: 'update_invoice_status',
      actionTitle: `إعادة فتح وتعديل الطلبية #${invoice.invoiceNumber}`,
      details: `تم إعادة فتح أصناف الطلبية #${invoice.invoiceNumber} للعميل (${invoice.customerName}) في السلة لإتاحة إضافة أو حذف أصناف أو تعديل الكميات والأسعار قبل الاعتماد.`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      badgeType: 'info',
    });

    return {
      success: true,
      message: `تم فتح الطلبية #${invoice.invoiceNumber} في السلة بنجاح! يمكنك الآن تعديل الكميات أو إضافة أصناف جديدة من الكتالوج وإعادة إصدار الفاتورة.`,
      customer: matchedCustomer,
    };
  };

  // Rep or supervisor can cancel order while pending
  const cancelPendingOrderByRep = (invoiceId: string, reason?: string): { success: boolean; message: string } => {
    return rejectOrder(invoiceId, reason || 'إلغاء الطلبية بطلب من المندوب قبل الاعتماد');
  };

  const updateOrderStatus = (
    invoiceId: string,
    status: OrderStatus,
    reason?: string
  ): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك تحديث طلبية تابعة لفرع آخر.' };
    }

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
              const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
              if (updatedBranchStocks) {
                const branchKey = Object.keys(updatedBranchStocks).find((key) =>
                  isBranchMatch(key, inv.branchName, { allowUnassigned: false })
                );
                if (branchKey) {
                  updatedBranchStocks[branchKey] = Number(updatedBranchStocks[branchKey] || 0) + qty;
                }
              }
              return {
                ...p,
                ...(updatedBranchStocks ? { branchStocks: updatedBranchStocks } : {}),
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

      // Restore / Refund customer balance and debt if order amount was added
      if (inv.customerName && inv.estimatedGrandTotal > 0) {
        setCustomers((prev) =>
          prev.map((c) => {
            const match = (inv.customerCode && c.code === inv.customerCode) || c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase();
            if (!match) return c;
            const currentBal = Number(c.currentBalance ?? c.balance ?? 0);
            const newBal = Math.max(0, currentBal - inv.estimatedGrandTotal);
            const updatedCust: Customer = {
              ...c,
              currentBalance: newBal,
              balance: newBal,
              totalSpent: Math.max(0, Number(c.totalSpent || 0) - inv.estimatedGrandTotal),
            };
            saveCustomersToSupabase([updatedCust]).catch((e) => console.warn('Supabase customer return balance sync failed:', e));
            return updatedCust;
          })
        );
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
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase status update failed:', e));
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

  const processOrderReturn = (
    invoiceId: string,
    returnedItems: ReturnedItem[],
    reason: string,
    restockToInventory: boolean = true
  ): { success: boolean; message: string; returnRecord?: ReturnRecord } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة ��ير موجودة' };

    if (!returnedItems || returnedItems.length === 0) {
      return { success: false, message: 'يرجى تحديد صنف واحد على الأقل مع تحديد الكمية المرتجعة' };
    }

    const totalRefundAmount = returnedItems.reduce((sum, item) => sum + (item.refundAmount || 0), 0);
    const totalReturnedCartons = returnedItems.reduce((sum, item) => sum + (item.cartonCount || 0), 0);
    const totalReturnedPieces = returnedItems.reduce((sum, item) => sum + (item.totalPieces || (item.pieceCount || 0)), 0);

    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    const returnVoucherNumber = `RET-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const newReturnRecord: ReturnRecord = {
      id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      returnVoucherNumber,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerCode: inv.customerCode,
      branchName: inv.branchName,
      repName: inv.repName,
      date: dateStr,
      time: timeStr,
      returnedItems,
      totalRefundAmount,
      totalReturnedCartons,
      totalReturnedPieces,
      reason: reason || 'مرتجع مبيعات',
      handledBy: currentUser?.name || 'مسؤول النظام',
      restockedToInventory: restockToInventory,
      notes: `إذن مرتجع مبيعات #${returnVoucherNumber} للفاتورة #${inv.invoiceNumber}`,
    };

    // 1. Restock to inventory if requested and condition is good
    if (restockToInventory) {
      setProducts((prev) =>
        prev.map((p) => {
          const retItem = returnedItems.find((it) => it.productId === p.id);
          if (!retItem || retItem.condition === 'damaged' || retItem.condition === 'expired') {
            return p;
          }
          const addCartons = retItem.cartonCount || 0;
          return {
            ...p,
            branchStockActual: p.branchStockActual + addCartons,
            branchStockReserved: p.branchStockReserved + addCartons,
          };
        })
      );

      // Record inventory transactions for each returned item
      returnedItems.forEach((retItem) => {
        if (retItem.condition !== 'damaged' && retItem.condition !== 'expired' && retItem.cartonCount > 0) {
          const prod = products.find((p) => p.id === retItem.productId);
          const currentStock = prod ? prod.branchStockActual : 0;
          recordInventoryTransaction({
            productId: retItem.productId,
            productCode: retItem.productCode,
            productName: retItem.productName,
            type: 'مرتجع مبيعات وإرجاع للمخزن',
            quantityPieces: retItem.cartonCount,
            branchStockBefore: currentStock,
            branchStockAfter: currentStock + retItem.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'مسؤول المرتجعات',
            userRole: currentUser?.role || 'branch_manager',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes: `مرتجع مبيعات (${retItem.cartonCount} كرتونة) - إذن #${returnVoucherNumber} - السبب: ${retItem.returnReason || reason}`,
          });
        }
      });
    }

    // 2. Adjust Customer Debt / Balance if applicable
    if (totalRefundAmount > 0 && inv.customerName) {
      setCustomers((prev) =>
        prev.map((c) => {
          const match = (inv.customerCode && c.code === inv.customerCode) || c.name === inv.customerName;
          if (!match) return c;
          const currentBal = c.currentBalance ?? c.balance ?? 0;
          const updatedBal = Math.max(0, currentBal - totalRefundAmount);
          return {
            ...c,
            currentBalance: updatedBal,
            balance: updatedBal,
          };
        })
      );
    }

    // 3. Determine if Full or Partial Return
    const existingRecords = inv.returnRecords || [];
    const updatedRecords = [...existingRecords, newReturnRecord];
    const prevRefunded = inv.totalRefundedAmount || 0;
    const allRefunded = prevRefunded + totalRefundAmount;

    // Check if entire order is returned
    const allReturnedCartonsCount = updatedRecords.reduce((s, r) => s + r.totalReturnedCartons, 0);
    const isFullReturn = allReturnedCartonsCount >= inv.totalCartons || allRefunded >= inv.estimatedGrandTotal;

    const newStatus: OrderStatus = isFullReturn ? 'مرتجع' : 'مرتجع جزئي';
    const netGrandTotal = Math.max(0, inv.estimatedGrandTotal - allRefunded);

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: newStatus,
          hasReturns: true,
          isPartialReturn: !isFullReturn,
          returnRecords: updatedRecords,
          totalRefundedAmount: allRefunded,
          netAmountAfterReturns: netGrandTotal,
          lastReturnDate: dateStr,
          restoredStockDetails: `تم استرجاع ${totalReturnedCartons} كرتونة بقيمة ${totalRefundAmount.toLocaleString()} ج.م (إذن #${returnVoucherNumber})`,
          notes: `${i.notes ? i.notes + ' | ' : ''}مرتجع ${isFullReturn ? 'كلي' : 'جز��ي'} إذن #${returnVoucherNumber} بقيمة ${totalRefundAmount.toLocaleString()} ج.م (${reason})`,
        };
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase return sync failed:', e));
        return updated;
      })
    );

    // 4. Record Audit Log
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: inv.branchName,
      action: 'return_invoice',
      actionTitle: `تسجيل مرتجع مبيعات ${isFullReturn ? 'كلي' : 'جزئي'} للفاتورة #${inv.invoiceNumber}`,
      details: `إذن #${returnVoucherNumber} • العميل: ${inv.customerName} • القيمة المسترجعة: ${totalRefundAmount.toLocaleString()} ج.م • الكراتين: ${totalReturnedCartons} • السبب: ${reason}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'warning',
    });

    return {
      success: true,
      message: `تم تسجيل إذن المرتجع #${returnVoucherNumber} بنجاح (${isFullReturn ? 'مرتجع كلي' : 'مرتجع جزئي'}) بقيمة ${totalRefundAmount.toLocaleString()} ج.م وتحديث المخزون وحساب العميل!`,
      returnRecord: newReturnRecord,
    };
  };

  const deleteInvoice = async (invoiceId: string): Promise<void> => {
    const target = invoices.find((inv) => inv.id === invoiceId || inv.invoiceNumber === invoiceId);
    const targetId = target?.id || invoiceId;
    const targetNumber = target?.invoiceNumber;

    // 1. Mark as permanently deleted in local persistent storage so it is never re-added
    markInvoiceAsDeletedInStorage(targetId, targetNumber);

    // 2. Remove immediately from local state
    setInvoices((prev) => prev.filter((inv) => inv.id !== targetId));

    // 3. Immediately persist updated invoices to IndexedDB and LocalStorage
    const remaining = invoices.filter((inv) => inv.id !== targetId);
    idbSet(STORAGE_KEYS.INVOICES, remaining).catch(() => {});
    safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify(remaining));

    // 4. Record Audit Log
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: target?.branchName || 'الفرع الرئيسي',
      action: 'delete_invoice',
      actionTitle: `حذف الفاتورة #${targetNumber || targetId} نهائياً`,
      details: `تم حذف الفاتورة نهائياً من قاعدة البيانات والسيرفر • العميل: ${target?.customerName || 'عام'} • القيمة: ${target?.estimatedGrandTotal?.toLocaleString() || 0} ج.م`,
      invoiceId: targetId,
      invoiceNumber: targetNumber,
      badgeType: 'danger',
    });

    // 5. Delete permanently from Supabase, or park it in the offline outbox
    try {
      await syncOrQueue('invoices', 'delete', targetId, undefined, async () => {
        const remoteDelete = await deleteInvoiceFromSupabase(targetId, targetNumber);
        if (!remoteDelete.success) {
          throw new Error(remoteDelete.error || 'تعذر حذف الفاتورة من قاعدة البيانات');
        }
        return { success: true };
      });
    } catch (e) {
      console.warn('Supabase invoice deletion failed:', e);
      throw e;
    }
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

  const dispatchOrderToMicrosoft = async (invoiceId: string): Promise<{ success: boolean; message: string }> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    const res = await sendOrderToMicrosoft365(inv, currentUser?.name, branches, companyInfo.email, { force: true });
    return { success: res.success, message: res.message };
  };

  const updateBranchEmails = (branchId: string, email: string, notificationEmails: string[]) => {
    setBranches((prev) => {
      const next = prev.map((b) => {
        if (b.id === branchId) {
          return {
            ...b,
            email: email.trim(),
            notificationEmails: notificationEmails.filter(Boolean).map((e) => e.trim()),
          };
        }
        return b;
      });
      safeLocalStorageSet(STORAGE_KEYS.BRANCHES, JSON.stringify(next));
      return next;
    });
  };

  const addUser = async (user: User) => {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  if (hasDuplicateUserIdentity(user, users, user.id)) return;
    // Never let a readable password reach local storage or Supabase.
    const secured = await withHashedCredential(user);
    const nextUsers = [...users.filter((u) => u.id !== secured.id), secured];
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers);
    syncOrQueue('users', 'upsert', secured.id, secured, () => saveUserToSupabase(secured))
      .then(() => publishDataVersionUpdate({ scope: 'all', notes: `إضافة مستخدم ${secured.name || secured.username}` }))
      .catch((e) => console.warn('Supabase save user failed:', e));
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 50);
  };

  const updateUser = async (updatedUser: User) => {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  if (hasDuplicateUserIdentity(updatedUser, users, updatedUser.id)) return;
    // An empty password field in the admin form means "leave the credential
    // alone", never "clear it" - otherwise editing a role would lock the user out.
    const existingCredential = users.find((u) => u.id === updatedUser.id)?.password || '';
    const submitted = updatedUser.password || '';
    const secured = submitted.trim()
      ? await withHashedCredential(updatedUser)
      : { ...updatedUser, password: existingCredential };
    const nextUsers = users.map((u) => (u.id === secured.id ? secured : u));
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers);
    if (currentUser?.id === updatedUser.id) {
      if (!updatedUser.isActive || updatedUser.approvalStatus === 'rejected') {
        logout();
        setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
        return;
      }
      setCurrentUser(secured);
    }
    syncOrQueue('users', 'upsert', secured.id, secured, () => saveUserToSupabase(secured))
      .then(() => publishDataVersionUpdate({ scope: 'all', notes: `تعديل مستخدم ${secured.name || secured.username}` }))
      .catch((e) => console.warn('Supabase update user failed:', e));
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 50);
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
      saveProductsToSupabase(updated).then((result) => {
        if (!result.success) {
          console.warn('Supabase image links sync warning:', result.error || 'Product save failed.');
          return;
        }
        publishNewDataVersion({
          scope: 'products',
          updatedBy: currentUser?.name || 'مدير النظام',
          notes: 'تحديث صور كتالوج الأصناف',
          productsCount: updated.length,
        }).catch((error) => console.warn('Product image version publish notice:', error));
      }).catch((err) => {
        console.warn('Supabase image links sync warning:', err);
      });

      return updated;
    });
  };

  const clearAllAppData = (mode: 'cache_only' | 'full_reset' = 'cache_only') => {
    if (mode === 'full_reset') {
      try {
        localStorage.clear();
      } catch {}
      idbClear();
      setProducts([]);
      setInvoices([]);
      setUsers([]);
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
      const remoteDelete = await deleteAllInvoicesFromSupabase();
      if (!remoteDelete.success) {
        console.warn('Supabase invoice wipe warning:', remoteDelete.error);
      }
      setInvoices([]);
      idbSet(STORAGE_KEYS.INVOICES, []);
      safeLocalStorageSet(STORAGE_KEYS.INVOICES, JSON.stringify([]));
      safeLocalStorageSet(STORAGE_KEYS.DELETED_INVOICE_IDS, JSON.stringify([]));
    }

    try {
      await clearCachedImages();
    } catch (e) {}
  };

  // --- Role-Based Data Visibility (STRICT PRIVACY & BRANCH ISOLATION) ---
  const getVisibleInvoices = (): Invoice[] => {
    if (!currentUser) return [];

    // Admin & Developer: Full oversight, filtered by branch selector if selected
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return selectedBranchFilter === 'الكل'
        ? invoices
        : invoices.filter((i) => Boolean(i.branchName) && isBranchMatch(i.branchName, selectedBranchFilter, { allowUnassigned: false }));
    }

    // Branch Manager: STRICTLY sees ONLY invoices of his own branch
    if (currentUser.role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return invoices.filter((i) => {
        if (i.branchName && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false })) return true;
        const c = customers.find((cust) => cust.id === i.customerId);
        return Boolean(c && doesCustomerBelongToBranch(c, currentUser.branchName, users));
      });
    }

    // Supervisor: STRICTLY sees ONLY invoices belonging to his branch and his supervised reps
    if (currentUser.role === 'supervisor') {
      if (!currentUser.branchName) return [];
  const repIds = new Set(
  users
  .filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser.id)
  .map((u) => u.id)
  );
  return invoices.filter((i) => {
    const isSameBranch = Boolean(i.branchName) && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false });
    const isSupervisedRep = Boolean(i.repId) && repIds.has(i.repId);
    const isSameRepName = Boolean(i.repName) && users.some(
      (u) => repIds.has(u.id) && normalizeArabicText(u.name) === normalizeArabicText(i.repName || '')
    );
    const isSelf = i.repId === currentUser.id || normalizeArabicText(i.repName) === normalizeArabicText(currentUser.name);
  // A supervisor must never receive every invoice from the branch. The invoice
  // must identify the supervisor's own account or one of the reps assigned to it.
  // Legacy invoices without a branch are still allowed when the rep relation is explicit.
  const belongsToSupervisor = isSupervisedRep || isSameRepName || isSelf;
  return belongsToSupervisor && (!i.branchName || isSameBranch);
  });
    }

    // Sales Rep: STRICT PRIVACY - ONLY his own orders, NEVER another rep's orders!
    if (currentUser.role === 'sales_rep') {
      return invoices.filter((i) => {
        // 1. Direct Rep ID match (highest authority)
        const isDirectIdMatch = Boolean(i.repId) && (
          i.repId === currentUser.id ||
          Boolean(currentUser.username && i.repId.toLowerCase() === currentUser.username.toLowerCase())
        );

        // 2. Arabic Name match with branch isolation
        const isDirectNameMatch = Boolean(i.repName) && (
          normalizeArabicText(i.repName) === normalizeArabicText(currentUser.name) ||
          isArabicNameMatch(i.repName, currentUser.name)
        );

        if (!isDirectIdMatch && !isDirectNameMatch) return false;

        // Strict Branch Isolation: Rep cannot see invoices of another branch
        if (currentUser.branchName && i.branchName) {
          if (!isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false })) {
            return false;
          }
        }

        return true;
      });
    }

    return [];
  };

  /**
   * The visit set this role is allowed to see, resolved once per real change.
   *
   * Every heavy page used to call getVisibleVisits() during its own render. The
   * function is recreated on each provider render, so that produced a brand-new array
   * every time and defeated the dependency check of the ~14 useMemos built on top of
   * it, making each keystroke re-run the whole filter/sort/aggregate chain. Memoising
   * it here gives consumers a stable array to depend on - and a stable identity, so a
   * page no longer has to guess which provider values the scoping rules read.
   */
  const visibleVisits = useMemo((): CustomerVisit[] => {
    if (!currentUser) return [];

      // Admin & Developer: Full oversight across branches, filtered by selected branch if set
      if (currentUser.role === 'admin' || currentUser.role === 'developer') {
        return selectedBranchFilter === 'الكل'
          ? visits
          : visits.filter((v) => isBranchMatch(v.branchName || '', selectedBranchFilter, { allowUnassigned: false }));
      }

      // Branch Manager: STRICTLY sees visits belonging to his own branch only
      if (currentUser.role === 'branch_manager') {
        if (!currentUser.branchName) return [];
        return visits.filter((v) => {
          if (v.branchName && isBranchMatch(v.branchName, currentUser.branchName, { allowUnassigned: false })) return true;
          const c = customers.find((cust) => cust.id === v.customerId);
          return Boolean(c && doesCustomerBelongToBranch(c, currentUser.branchName, users));
        });
      }

      // Supervisor: STRICTLY sees visits belonging to his branch and his supervised reps
      if (currentUser.role === 'supervisor') {
        return visits.filter((v) => {
          if (v.supervisorId === currentUser.id) return true;
          if (v.createdBy === currentUser.id) return true;
          if (v.repId && users.some((u) => u.id === v.repId && u.supervisorId === currentUser.id)) return true;
          const rep = users.find((u) => u.id === v.repId || isArabicNameMatch(u.name, v.repName || ''));
          if (rep && (rep.supervisorId === currentUser.id || rep.id === currentUser.id)) return true;
          const c = customers.find((cust) => cust.id === v.customerId);
          return Boolean(c && doesCustomerBelongToSupervisor(c, currentUser, users));
        });
      }

      // Sales Rep: STRICT PRIVACY - ONLY his own visits!
      return visits.filter((v) => {
        // 1. Direct rep ID match
        if (v.repId === currentUser.id) return true;
        if (currentUser.username && v.repId && v.repId.toLowerCase() === currentUser.username.toLowerCase()) return true;

        // 2. Arabic Name match
        if (v.repName && (isArabicNameMatch(v.repName, currentUser.name) || normalizeArabicText(v.repName) === normalizeArabicText(currentUser.name))) {
          return true;
        }

        // 3. Created by this rep for himself
        if (v.createdBy === currentUser.id && (!v.repId || v.repId === currentUser.id)) return true;

      return false;
    });
  // The scoping rules below read only currentUser, selectedBranchFilter, visits,
  // customers and users (everything else is a module-level helper), so those are the
  // real dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, customers, users, currentUser, selectedBranchFilter]);

  const getVisibleVisits = useCallback(() => visibleVisits, [visibleVisits]);

  const canManageVisit = (visit: CustomerVisit) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'developer') return true;
    if (currentUser.role === 'branch_manager') {
      if (visit.branchName && isBranchMatch(visit.branchName, currentUser.branchName, { allowUnassigned: false })) return true;
      const c = customers.find((cust) => cust.id === visit.customerId);
      return Boolean(c && doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser.role === 'supervisor') {
      if (visit.supervisorId === currentUser.id || visit.createdBy === currentUser.id) return true;
      const rep = users.find((u) => u.id === visit.repId || isArabicNameMatch(u.name, visit.repName || ''));
      return Boolean(rep && (rep.supervisorId === currentUser.id || rep.id === currentUser.id));
    }
    return (
      visit.createdBy === currentUser.id ||
      visit.repId === currentUser.id ||
      isArabicNameMatch(visit.repName || '', currentUser.name) ||
      normalizeArabicText(visit.repName || '') === normalizeArabicText(currentUser.name)
    );
  };

  const addVisit = (visit: Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    if (!visit.customerId || !visit.date) return { success: false, message: 'اختر العميل وتاريخ الزيارة' };
    const customer = customers.find((c) => c.id === visit.customerId);
    if (!customer) return { success: false, message: 'العميل غير موجود' };

    const effectiveRepId = visit.repId || (currentUser.role === 'sales_rep' ? currentUser.id : '');
    const assignedRep = users.find((u) => u.id === effectiveRepId) || (currentUser.role === 'sales_rep' ? currentUser : undefined);
    const effectiveRepName = visit.repName || assignedRep?.name || currentUser.name || 'المندوب';
    const effectiveBranch = visit.branchName || customer.branchName || assignedRep?.branchName || currentUser.branchName || '';

    const allowed =
      currentUser.role === 'admin' ||
      currentUser.role === 'developer' ||
      (currentUser.role === 'sales_rep' && (effectiveRepId === currentUser.id || doesCustomerBelongToRep(customer, currentUser))) ||
      (currentUser.role === 'supervisor' && (assignedRep?.supervisorId === currentUser.id || doesCustomerBelongToSupervisor(customer, currentUser, users))) ||
      (currentUser.role === 'branch_manager' && (assignedRep?.branchName === currentUser.branchName || doesCustomerBelongToBranch(customer, currentUser.branchName, users)));

    if (!allowed) return { success: false, message: 'لا تملك صلاحية تسجيل زيارة لهذا العميل' };

    /**
     * نفس العميل في نفس اليوم — بدل ما نسجّل سطر تاني.
     *
     * كل زيارة بتعمل حاجتين مؤثرتين على العميل:
     *   - بتزود `visitCount2026` بواحد
     *   - بتنقص `currentBalance` بمبلغ التحصيل
     * فلو اتسجلت نفس الزيارة مرتين، الرصيد بينقص مرتين والعدّاد بيزيد مرتين.
     * ده مش احتمال نظري: فيه 117 صف مكرر على السيرفر دلوقتي (80 عميل/يوم).
     *
* بنفس منطق addImportedVisits بالظبط — نفس دالة dayKey، فالمساران
     * متسقان واللي بيتسجل بالاستيراد بيتقيّد بنفس القاعدة.
     *
     * ملاحظة: بنرجّع `visit` الموجود مع `success: false`. الشاشة بتقدر
     * تعرضه وتسأل المستخدم: يعدّل الزيارة دي ولا يسجّل رغم ذلك.
     * القرار للمستخدم مش للكود.
     */
    const visitDay = String(visit.date || '').slice(0, 10);
    const sameDayVisit =
      visitDay
        ? visits.find((v) => v.customerId === customer.id && String(v.date || '').slice(0, 10) === visitDay)
        : undefined;
    if (sameDayVisit && !(visit as CustomerVisit).allowSameDaySecondVisit) {
      return {
        success: false,
        message: `تم تسجيل زيارة للعميل ${customer.name} بتاريخ ${visitDay} بالفعل. عدّل الزيارة الموجودة أو سجّل رغم ذلك.`,
        visit: sameDayVisit,
      };
    }

    const newVisitId = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isOnlineNow = typeof navigator !== 'undefined' && navigator.onLine;
    const newVisitObj: CustomerVisit = {
      ...visit,
      id: newVisitId,
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      repId: effectiveRepId,
      repName: effectiveRepName,
      branchName: effectiveBranch,
      supervisorId: visit.supervisorId || assignedRep?.supervisorId,
      status: visit.status || 'مجدولة',
      reviewStatus: visit.status === 'منفذة' || visit.status === 'لم تتم' ? 'pending' : undefined,
      reviewedByName: undefined,
      reviewNote: undefined,
      reviewedAt: undefined,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      syncStatus: isOnlineNow ? 'synced' : 'pending_sync',
    };

    // 1. Double Immediate Local Persistence (State + IndexedDB + localStorage)
    setVisits((prev) => {
      const next = [newVisitObj, ...prev.filter((v) => v.id !== newVisitId)];
      persistVisits(next);
      return next;
    });

    // 2. Direct Cloud Database Sync (Supabase PostgreSQL / Cloud DB),
    // with the offline outbox as the fallback so a visit logged in the field
    // without a signal is delivered as soon as the device reconnects.
    syncOrQueue('visits', 'upsert', newVisitId, newVisitObj, () =>
      saveVisitsToSupabase([newVisitObj])
    ).then((delivered) => {
      if (delivered) {
        setVisits((prev) => {
          const next = prev.map((v) => (v.id === newVisitId ? { ...v, syncStatus: 'synced' as const } : v));
          persistVisits(next);
          return next;
        });
      } else {
        setVisits((prev) => {
          const next = prev.map((v) => (v.id === newVisitId ? { ...v, syncStatus: 'pending_sync' as const } : v));
          persistVisits(next);
          return next;
        });
      }
    }).catch((e) => {
      console.warn('Supabase visit background save note:', e);
    });

    // 3. Customer dossier synchronization (lastVisitDate, nextVisitDate, visitHistory, balance update)
    const existingVisits = customer.visitHistory || [];
    const updatedCustomer: Customer = {
      ...customer,
      lastVisitDate: visit.date,
      nextVisitDate: visit.nextVisitDate || customer.nextVisitDate,
      visitCount2026: (customer.visitCount2026 || 0) + 1,
      visitHistory: [newVisitObj, ...existingVisits.filter((v) => v.id !== newVisitId)],
      currentBalance: visit.collectedAmount
        ? Math.max(0, (customer.currentBalance ?? customer.balance ?? 0) - visit.collectedAmount)
        : customer.currentBalance,
    };

    setCustomers((prev) => {
      const next = prev.map((c) => (c.id === customer.id ? updatedCustomer : c));
      idbSet(STORAGE_KEYS.CUSTOMERS, next).catch(() => {});
      return next;
    });

    return {
      success: true,
      message: 'تم حفظ الزيارة بنجاح وتأكيد تثبيتها في قاعدة البيانات ✅',
      visit: newVisitObj,
    };
  };

  const addImportedVisits = async (
    imported: Array<Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy' | 'customerName' | 'customerCode' | 'syncStatus'>>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ success: boolean; added: number; duplicates: number; queued: boolean; failed: string[] }> => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') {
      return { success: false, added: 0, duplicates: 0, queued: false, failed: ['لا تملك صلاحية استيراد الزيارات'] };
    }

    const dayKey = (customerId: string, date: string) => `${customerId}|${date.slice(0, 10)}`;
    const seen = new Set<string>();
    visits.forEach((visit) => {
      if (visit.customerId && visit.date) seen.add(dayKey(visit.customerId, visit.date));
    });
    customers.forEach((customer) => {
      (customer.visitHistory || []).forEach((visit) => {
        if (visit.customerId && visit.date) seen.add(dayKey(visit.customerId, visit.date));
        else if (visit.date) seen.add(dayKey(customer.id, visit.date));
      });
    });

    const accepted: CustomerVisit[] = [];
    const failed: string[] = [];
    let duplicates = 0;

    imported.forEach((visit, index) => {
      const customer = customers.find((item) => item.id === visit.customerId);
      if (!customer) {
        failed.push(`زيارة ${index + 1}: العميل غير موجود`);
        return;
      }
      if (!visit.date) {
        failed.push(`زيارة ${index + 1}: تاريخ الزيارة غير صالح`);
        return;
      }

      const key = dayKey(customer.id, visit.date);
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);

      accepted.push({
        ...visit,
        id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        customerId: customer.id,
        customerName: customer.name,
        customerCode: customer.code,
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending_sync',
      });
    });

    if (accepted.length === 0) {
      return { success: failed.length === 0, added: 0, duplicates, queued: false, failed };
    }

    const nextVisits = [...accepted, ...visits];
    setVisits(nextVisits);
    persistVisits(nextVisits);

    const byCustomer = new Map<string, CustomerVisit[]>();
    accepted.forEach((visit) => {
      const list = byCustomer.get(visit.customerId || '') || [];
      list.push(visit);
      byCustomer.set(visit.customerId || '', list);
    });
    const nextCustomers = customers.map((customer) => {
      const additions = byCustomer.get(customer.id);
      if (!additions) return customer;
      const latestImportedDate = additions.reduce(
        (latest, visit) => visit.date > latest ? visit.date : latest,
        customer.lastVisitDate || ''
      );
      const countFor2026 = additions.filter((visit) => visit.date.startsWith('2026-')).length;
      return {
        ...customer,
        lastVisitDate: latestImportedDate || customer.lastVisitDate,
        visitCount2026: (customer.visitCount2026 || 0) + countFor2026,
        visitHistory: [...additions, ...(customer.visitHistory || [])],
      };
    });
    setCustomers(nextCustomers);
    idbSet(STORAGE_KEYS.CUSTOMERS, nextCustomers).catch((error) =>
      console.warn('Imported visit customer history persistence notice:', error)
    );

    const syncedIds = new Set<string>();
    const toQueue: CustomerVisit[] = [];
    let queued = false;
    if (navigator.onLine) {
      for (let start = 0; start < accepted.length; start += 100) {
        const chunk = accepted.slice(start, start + 100);
        const result = await saveVisitsToSupabase(chunk);
        if (result.success) {
          chunk.forEach((visit) => syncedIds.add(visit.id));
        } else {
          console.warn('Imported visit cloud save deferred to offline queue:', result.error);
          toQueue.push(...chunk);
        }
        onProgress?.(Math.min(start + chunk.length, accepted.length), accepted.length);
        if (start + chunk.length < accepted.length) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    } else {
      toQueue.push(...accepted);
    }

    if (syncedIds.size > 0) {
      const syncedById = new Map(
        accepted
          .filter((visit) => syncedIds.has(visit.id))
          .map((visit) => [visit.id, { ...visit, syncStatus: 'synced' as const }])
      );
      const updatedVisits = nextVisits.map((visit) => syncedById.get(visit.id) || visit);
      setVisits(updatedVisits);
      persistVisits(updatedVisits);
      const updatedCustomers = nextCustomers.map((customer) => {
        if (!byCustomer.has(customer.id)) return customer;
        return {
          ...customer,
          visitHistory: (customer.visitHistory || []).map((visit) => syncedById.get(visit.id) || visit),
        };
      });
      setCustomers(updatedCustomers);
      idbSet(STORAGE_KEYS.CUSTOMERS, updatedCustomers).catch((error) =>
        console.warn('Imported visit sync-state persistence notice:', error)
      );
    }

    if (toQueue.length > 0) {
      try {
        await enqueueMutations(toQueue.map((visit) => ({
          entity: 'visits',
          op: 'upsert',
          entityId: visit.id,
          payload: visit,
        })));
        await refreshOfflineQueueCount();
        queued = true;
      } catch (error) {
        console.error('Imported visits could not be added to the offline queue:', error);
        failed.push('تم حفظ الزيارات محليًا لكن تعذر تجهيز مزامنتها؛ أعد المزامنة عند توفر الإنترنت');
      }
    }

    return { success: failed.length === 0, added: accepted.length, duplicates, queued, failed };
  };
  
  const updateVisit = (visit: CustomerVisit) => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    if (!canManageVisit(visit)) return { success: false, message: 'لا تملك صلاحية تعديل هذه الزيارة' };
    const existingVisit = visits.find((item) => item.id === visit.id);
    if (currentUser.role === 'sales_rep' && existingVisit?.reviewStatus === 'approved') {
      return { success: false, message: 'لا يمكن تعديل زيارة تم اعتمادها من المشرف' };
    }
    const isExecutionComplete = visit.status === 'منفذة' || visit.status === 'لم تتم';
    const shouldResubmit = isExecutionComplete && (
      existingVisit?.status === 'مجدولة' ||
      (currentUser.role === 'sales_rep' && existingVisit?.reviewStatus === 'needs_fix')
    );
    const updatedVisit: CustomerVisit = {
      ...visit,
      reviewStatus: shouldResubmit ? 'pending' : existingVisit?.reviewStatus,
      reviewedByName: shouldResubmit ? undefined : existingVisit?.reviewedByName,
      reviewNote: shouldResubmit ? undefined : existingVisit?.reviewNote,
      reviewedAt: shouldResubmit ? undefined : existingVisit?.reviewedAt,
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    };
    
    // Immediate Local Persistence (State + IndexedDB + localStorage)
    setVisits((prev) => {
      const next = prev.map((item) => (item.id === visit.id ? updatedVisit : item));
      persistVisits(next);
      return next;
    });

    // Direct Cloud Database Sync (queued when offline)
    syncOrQueue('visits', 'upsert', updatedVisit.id, updatedVisit, () =>
      saveVisitsToSupabase([updatedVisit])
    ).catch((e) => console.warn('Supabase visit update error:', e));

    if (visit.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === visit.customerId) {
            const history = (c.visitHistory || []).map((vh) => (vh.id === visit.id ? updatedVisit : vh));
            return {
              ...c,
              nextVisitDate: visit.nextVisitDate || c.nextVisitDate,
              visitHistory: history,
            };
          }
          return c;
        })
      );
    }
    return { success: true, message: shouldResubmit ? 'تم تحديث التقرير وإرساله للمشرف للمراجعة' : 'تم تحديث الزيارة وحفظها بقاعدة البيانات بنجاح ✅' };
  };

  const toggleArchiveVisit = async (visitId: string, isArchived: boolean): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return { success: false, message: 'الزيارة غير موجودة' };
    if (!canManageVisit(visit)) return { success: false, message: 'لا تملك صلاحية أرشفة هذه الزيارة' };

    const now = new Date().toISOString();
    const updatedVisit: CustomerVisit = {
      ...visit,
      isArchived,
      archivedAt: isArchived ? now : undefined,
      archivedBy: isArchived ? (currentUser.name || currentUser.username) : undefined,
      updatedAt: now,
      syncStatus: 'synced',
    };

    setVisits((prev) => {
      const next = prev.map((v) => (v.id === visitId ? updatedVisit : v));
      persistVisits(next);
      return next;
    });

    syncOrQueue('visits', 'upsert', updatedVisit.id, updatedVisit, () =>
      saveVisitsToSupabase([updatedVisit])
    ).catch((e) => console.warn('Supabase visit archive error:', e));

    if (visit.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === visit.customerId) {
            const history = (c.visitHistory || []).map((vh) => (vh.id === visitId ? updatedVisit : vh));
            return {
              ...c,
              visitHistory: history,
            };
          }
          return c;
        })
      );
    }

    return {
      success: true,
      message: isArchived
        ? 'تم أرشفة الزيارة بنجاح وحفظها في سجل الأرشيف 🗄️'
        : 'تم استعادة الزيارة من الأرشيف بنجاح إلى السجل النشط 🔄',
    };
  };

  const reviewVisit = (
    visitId: string,
    status: Extract<VisitReviewStatus, 'approved' | 'needs_fix'>,
    note = ''
  ) => {
    if (!currentUser || currentUser.role !== 'supervisor') {
      return { success: false, message: 'اعتماد الزيارات متاح لمشرف الفريق فقط' };
    }
    const visit = visits.find((item) => item.id === visitId);
    if (!visit) return { success: false, message: 'الزيارة غير موجودة' };
    const rep = (visit.repId ? users.find((user) => user.id === visit.repId) : undefined) ||
      users.find((user) => user.role === 'sales_rep' && isArabicNameMatch(user.name, visit.repName || ''));
    if (rep?.role !== 'sales_rep') {
      return { success: false, message: 'لا يمكن تحديد المندوب المسؤول عن الزيارة' };
    }
    if (!rep || rep.supervisorId !== currentUser.id) {
      return { success: false, message: 'لا تملك صلاحية مراجعة زيارة هذا المندوب' };
    }
    if (visit.reviewStatus !== 'pending' || (visit.status !== 'منفذة' && visit.status !== 'لم تتم')) {
      return { success: false, message: 'هذه الزيارة ليست بانتظار المراجعة' };
    }
    if (status === 'needs_fix' && !note.trim()) {
      return { success: false, message: 'اكتب ملاحظة توضح المطلوب تعديله' };
    }

    const now = new Date().toISOString();
    const updatedVisit: CustomerVisit = {
      ...visit,
      reviewStatus: status,
      reviewedByName: currentUser.name,
      reviewNote: status === 'needs_fix' ? note.trim() : undefined,
      reviewedAt: now,
      updatedAt: now,
      syncStatus: 'synced',
    };
    setVisits((prev) => {
      const next = prev.map((item) => item.id === visitId ? updatedVisit : item);
      persistVisits(next);
      return next;
    });
    syncOrQueue('visits', 'upsert', updatedVisit.id, updatedVisit, () =>
      saveVisitsToSupabase([updatedVisit])
    ).then((delivered) => {
      if (!delivered) console.warn('Supabase visit review parked in the offline queue');
    }).catch((error) => console.warn('Supabase visit review save error:', error));
    if (visit.customerId) {
      setCustomers((prev) => prev.map((customer) => customer.id === visit.customerId
        ? { ...customer, visitHistory: (customer.visitHistory || []).map((item) => item.id === visitId ? updatedVisit : item) }
        : customer));
    }
    return { success: true, message: status === 'approved' ? 'تم اعتماد الزيارة' : 'تم إرجاع التقرير للمندوب للتعديل' };
  };

  const deleteVisit = async (visitId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    const visitToDelete = visits.find((v) => v.id === visitId);
    if (!visitToDelete) return { success: false, message: 'الزيارة غير موجودة' };
    if (!canManageVisit(visitToDelete)) return { success: false, message: 'لا تملك صلاحية حذف هذه الزيارة' };

    markVisitAsDeletedInStorage(visitId);
    setVisits((prev) => {
      const next = prev.filter((v) => v.id !== visitId);
      persistVisits(next);
      return next;
    });

    if (visitToDelete.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === visitToDelete.customerId && c.visitHistory) {
            return {
              ...c,
              visitHistory: c.visitHistory.filter((vh) => vh.id !== visitId),
            };
          }
          return c;
        })
      );
    }

    try {
      await syncOrQueue('visits', 'delete', visitId, undefined, () =>
        deleteVisitFromSupabase(visitId)
      );
    } catch (e) {
      console.warn('Supabase visit deletion note:', e);
    }

    return { success: true, message: 'تم حذف الزيارة بنجاح من قاعدة البيانات' };
  };

  const syncVisitsWithDatabase = async (): Promise<{ success: boolean; message: string; count: number }> => {
    try {
      const res = await fetchVisitsFromSupabase(visitFetchScope);
      const deletedVisitIds = getDeletedVisitIds();
      let mergedVisits: CustomerVisit[] = [];

      if (res.success && res.visits) {
        const remoteVisits = res.visits.filter((v) => !deletedVisitIds.has(v.id));
        const mergedMap = new Map<string, CustomerVisit>();
        // Remote visits as base
        remoteVisits.forEach((v) => mergedMap.set(v.id, { ...v, syncStatus: 'synced' }));
        // Local visits
        visits.forEach((v) => {
          if (!mergedMap.has(v.id) && !deletedVisitIds.has(v.id)) {
            mergedMap.set(v.id, v);
          }
        });
        mergedVisits = Array.from(mergedMap.values());
        
        // Also upload any locally pending visits to remote
        const unsynced = visits.filter((v) => !remoteVisits.some((r) => r.id === v.id));
        if (unsynced.length > 0) {
          saveVisitsToSupabase(unsynced).catch(() => {});
        }
      } else {
        // Fallback to local visits if remote connection fails
        mergedVisits = visits.filter((v) => !deletedVisitIds.has(v.id));
      }

      setVisits(mergedVisits);
      persistVisits(mergedVisits);

      return {
        success: true,
        message: `تم تأكيد مزامنة وحفظ كافة الزيارات (${mergedVisits.length}) في قاعدة البيانات بنجاح ✅`,
        count: mergedVisits.length,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'فشلت المزامنة: ' + (err?.message || 'خطأ غير معروف'),
        count: visits.length,
      };
    }
  };

  const getCustomerVisitSummary = (customerId: string, month?: string) => {
    const list = getVisibleVisits().filter((v) => v.customerId === customerId && (!month || v.date.startsWith(month)));
    const completed = list.filter((v) => v.status === 'منفذة').length;
    return { total: list.length, completed, scheduled: list.filter((v) => v.status === 'مجدولة').length, lastVisit: list.filter((v) => v.status === 'منفذة').sort((a, b) => b.date.localeCompare(a.date))[0]?.date, nextVisit: list.filter((v) => v.status === 'مجدولة' && v.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date };
  };

  const getVisibleCustomers = (): Customer[] => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return selectedBranchFilter === 'الكل'
        ? customers
        : customers.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranchFilter, { allowUnassigned: false }));
    }
    if (currentUser.role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return customers.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser.role === 'supervisor') {
      const supervisedRepIds = new Set(
        users.filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser.id).map((u) => u.id)
      );
      return customers.filter((c) => {
        const isSameBranch = Boolean(c.branchName) && isBranchMatch(c.branchName, currentUser.branchName, { allowUnassigned: false });
        if (!isSameBranch) return false;
        if (c.repId && supervisedRepIds.has(c.repId)) return true;

        // A supervisor sees ONLY the customers of his own reps. If another rep
        // owns this customer, the supervisorName column must not hand it over —
        // that is what made the supervisor see the whole branch.
        const owner = findOwningSalesRep(c, users);
        if (owner) return supervisedRepIds.has(owner.id);

        // Unassigned customer: honour the explicit supervisorName column.
        return Boolean(
          c.supervisorName && normalizeArabicText(c.supervisorName) === normalizeArabicText(currentUser.name)
        );
      });
    }
    // Sales Rep: ONLY customers belonging directly to this rep
    return customers.filter((c) => doesCustomerBelongToRep(c, currentUser));
  };

  const getVisibleProducts = (): Product[] => {
    // Admin/developer can audit every warehouse. Other roles receive only their branch stock;
    // never expose another branch's balances to the client view.
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'developer') {
      return products;
    }

    const branchName = currentUser.branchName;
    if (!branchName) return [];

    const isRep = currentUser.role === 'sales_rep';

    return products.map((product) => {
      const branchStock = getBranchStockForProduct(product, branchName);
      return {
        ...product,
        branchStockActual: branchStock,
        branchStockReserved: typeof product.branchStockReserved === 'number' ? product.branchStockReserved : branchStock,
        mainWarehouseActual: isRep ? 0 : (product.mainWarehouseActual || 0),
        mainWarehouseReserved: isRep ? 0 : (product.mainWarehouseReserved || 0),
        branchStocks: branchName ? { [branchName]: branchStock } : {},
      };
    });
  };

  const getSupervisorsInBranch = (branchName?: string): User[] => {
    const targetBranch = branchName || currentUser?.branchName;
  return users.filter(
  u => u.role === 'supervisor' &&
  u.approvalStatus === 'active' &&
  (!targetBranch || isBranchMatch(u.branchName, targetBranch, { allowUnassigned: false }))
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
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, found.id);
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(found));
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
        visits,
        invoices,
        cart,
        cloudinaryConfig,
        accountingLogs,
        inventoryLogs,
        auditLogs,
        recordAuditLog,
        clearAuditLogs,
        isOffline,
        pendingInvoicesCount,
        offlineQueueCount,
        flushOfflineQueue,
        flushPendingInvoices,
        selectedBranchFilter,
        setSelectedBranchFilter,
        refreshInvoicesNow,
        supabaseStatus,
        isSupabaseSyncing,
        syncWithSupabase,
        checkDatabaseConnection,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        importCustomersList,
        cleanAndDeduplicateCustomers,
        clearCustomersCacheAndReset,
        refreshCustomerRepLinks,
        autoCreateMissingRepsFromCustomers,
        mergeDuplicateUsers,
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
  resendInvoiceEmail,
  forwardOrderToManager,
        rejectOrder,
        editPendingOrder,
        cancelPendingOrderByRep,
        updateOrderStatus,
        processOrderReturn,
        deleteInvoice,
        syncToAccounting,
        dispatchOrderToMicrosoft,
        updateBranchEmails,
        addUser,
        updateUser,
        deleteUser,
        approveUser,
        rejectUser,
        assignSupervisor,
        authTerminationNotice,
        clearAuthTerminationNotice,
        authMode: getAuthMode(),
        serverAuthEnabled: isServerAuthEnabled(),
        serverAuthProbe,
        updateCloudinarySettings,
        saveMatchedProductImages,
        clearAllAppData,
        wipeAllProductsAndData,
        dataSaverMode,
        setDataSaverMode,
        toggleDataSaverMode,
        isPrivacyMode,
        togglePrivacyMode,
        setPrivacyMode,
        formatConfidentialCurrency,
        installPromptEvent,
        canInstallPwa,
        triggerInstallPrompt,
        isInstallModalOpen,
        setIsInstallModalOpen,
        companyInfo,
        branchCompanyInfo,
        updateCompanyInfo,
        resetCompanyInfo,
        updateBranchCompanyInfo,
        resetBranchCompanyInfo,
        getCompanyInfoForBranch,
        getVisibleInvoices,
        getVisibleCustomers,
        getVisibleVisits,
        visibleVisits,
        addVisit,
        addImportedVisits,
        updateVisit,
        toggleArchiveVisit,
        reviewVisit,
        deleteVisit,
        syncVisitsWithDatabase,
        getCustomerVisitSummary,
        getVisibleProducts,
        getSupervisorsInBranch,
        getSalesRepsForSupervisor,
        loginAs,
        targets,
        forecasts,
        loadForecastsForMonth,
        loadForecastsForYear,
        forecastPlans,
        customerComments,
        loadCustomerComments,
        saveForecast,
        saveForecastBatch,
        deleteForecast,
        deleteCustomerForecasts,
        submitForecastWeek,
        approveForecastWeek,
        approveForecastBatch,
        requestForecastChange,
        saveForecastPlan,
        saveCustomerComment,
        toggleArchiveCustomerComment,
        deleteCustomerComment,
        getVisibleTargets,
        importTargetsFromExcel,
        importTargetsFromGoogleSheet,
        exportTargetsReport,
        resetTargetsToDefault,
        addOrUpdateTargetRecord,
        deleteTargetRecord,
        globalDataVersion,
        isVersionSyncing,
        lastVersionSyncNotice,
        clearVersionSyncNotice,
        checkAndSyncDataVersion,
        publishDataVersionUpdate,
        forcePurgeCacheAndReload,
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
