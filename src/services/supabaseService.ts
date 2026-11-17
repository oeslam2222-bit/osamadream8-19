  count?: number;
  entity?: string;
}> {
  try {
    const scopeKey = scope
      ? `customer_item_sales::${[...(scope.repNames || []), ...(scope.warehouses || [])].sort().join('|') || 'scoped'}`
      : 'customer_item_sales';
    const cursor = getSyncCursor(scopeKey);
    const isFullFetch = !cursor;
    const applyScope = (q: any) => {
      if (!scope) return q;
      const clauses: string[] = [];
      (scope.repNames || []).map((n) => String(n).trim()).filter((n) => n.length >= 2).forEach((name) => {
        clauses.push(`rep_name.ilike.${quoteOrValue(`*${name}*`)}`);
      });
      (scope.warehouses || []).map((w) => String(w).trim()).filter((w) => w.length >= 2).forEach((wh) => {
        clauses.push(`warehouse.ilike.${quoteOrValue(`*${wh}*`)}`);
      });
      // لا يوجد عمود sector في customer_item_sales — العزل client-side فقط.
      return clauses.length > 0 ? q.or(clauses.join(',')) : q;
    };
    const read = await readRowsPaged(
      'customer_item_sales',
      CUSTOMER_ITEM_SALES_SELECT_COLUMNS,
      cursor?.ts,
      scope ? applyScope : undefined
    );
    if (read.error) {
      return { success: false, error: read.error.message, entity: 'customer_item_sales', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    const rows = read.rows || [];
    const changedRows = cursor ? rows.filter((r: any) => isRowAfterCursor(r, cursor)) : rows;
    if (changedRows.length === 0) {
      return { success: true, sales: [], entity: 'customer_item_sales', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    let nextCursor: SyncCursor | null = cursor;
    for (const r of rows) nextCursor = advanceSyncCursor(nextCursor, r);
    if (nextCursor) setSyncCursor(scopeKey, nextCursor.ts, nextCursor.id);
    return {
      success: true,
      sales: changedRows,
      entity: 'customer_item_sales',
      count: changedRows.length,
      isFullFetch,
      maxUpdatedAt: nextCursor?.ts ?? null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في المزامنة التراكمية لمبيعات الأصناف', entity: 'customer_item_sales', count: 0, isFullFetch: false, maxUpdatedAt: null };
  }
}

export function mergeCustomerItemSalesIncremental(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  existing.forEach((s) => { if (s && s.id) byId.set(String(s.id), s); });
  incoming.forEach((s) => { if (s && s.id) byId.set(String(s.id), s); });
  return Array.from(byId.values());
}

/* ---------- Promotions & Announcements Sync Store (عروض دريم طنطاوي والتعميمات) ---------- */
export interface PromotionsStampMeta {
  updatedAt: string | null;
  total: number | null;
}

export async function fetchPromotionsStamp(): Promise<PromotionsStampMeta | null> {
  try {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('orders')
      .select('updated_at, total')
      .eq('id', PROMOTIONS_SYNC_STORE_ID)
      .limit(1);
    if (error) return null;
    const row = data?.[0] as any;
    if (!row) return { updatedAt: null, total: 0 };
    return {
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      total: typeof row.total === 'number' ? row.total : null,
    };
  } catch {
    return null;
  }
}

export async function savePromotionsToSupabase(payload: {
  promotions: PromotionOffer[];
  announcements?: PromoAnnouncement[];
  updatedAt?: string;
}): Promise<{ success: boolean; updatedAt?: string; error?: string }> {
  try {
    const nowIso = payload.updatedAt || new Date().toISOString();
    if (!isSupabaseConfigured) return { success: true, updatedAt: nowIso };
    const record = {
      id: PROMOTIONS_SYNC_STORE_ID,
      status: 'promotions_sync_store',
      total: payload.promotions.length,
      updated_at: nowIso,
      items: {
        promotions: payload.promotions,
        announcements: payload.announcements || [],
        updatedAt: nowIso,
      } as any,
    };

    const { error } = await supabase.from('orders').upsert(record, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true, updatedAt: nowIso };
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر حفظ العروض في السحابة' };
  }
}

export async function fetchPromotionsFromSupabase(): Promise<{
  success: boolean;
  promotions?: PromotionOffer[];
  announcements?: PromoAnnouncement[];
  updatedAt?: string;
  error?: string;
}> {
  return dedupeInFlightRequest('promotions_store_v1', async () => {
    try {
      if (!isSupabaseConfigured) return { success: false, error: 'offline' };
      const { data, error } = await supabase
        .from('orders')
        .select('items, updated_at')
        .eq('id', PROMOTIONS_SYNC_STORE_ID)
        .limit(1);
      if (error) return { success: false, error: error.message };
      const rawItems = data?.[0]?.items as any;
      const rowUpdatedAt = (data?.[0] as any)?.updated_at ? String((data?.[0] as any).updated_at) : undefined;
      if (!rawItems) return { success: true, promotions: [], announcements: [], updatedAt: rowUpdatedAt };
      const parsed = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
      if (Array.isArray(parsed)) {
        return { success: true, promotions: parsed, updatedAt: rowUpdatedAt };
      }
      return {
        success: true,
        promotions: Array.isArray(parsed?.promotions) ? parsed.promotions : [],
        announcements: Array.isArray(parsed?.announcements) ? parsed.announcements : undefined,
        updatedAt: rowUpdatedAt || (typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : undefined),
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'تعذر جلب العروض من السحابة' };
    }
  });
}


/**
 * روابط شيتات جوجل — صف واحد داخل orders بنفس نمط كتالوج الماني فست،
 * عشان الروابط تفضل محفوظة على كل الأجهزة ومن غير إعادة إدخال كل مرة.
 */
const DATA_SOURCES_ROW_ID = 'published_data_sources_v1';

export async function saveDataSourcesToSupabase(
  sources: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('orders').upsert({
      id: DATA_SOURCES_ROW_ID,
      status: 'published_data_sources',
      items: sources as any,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'failed' };
  }
}

export async function fetchDataSourcesFromSupabase(): Promise<{
  success: boolean;
  sources?: Record<string, any> | null;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('items')
      .eq('id', DATA_SOURCES_ROW_ID)
      .limit(1);
    if (error) return { success: false, error: error.message };
    const raw = data?.[0]?.items;
    const sources = typeof raw === 'string' ? JSON.parse(raw) : raw ?? null;
    return { success: true, sources };
  } catch (e: any) {
    return { success: false, error: e?.message || 'failed' };
  }
}
