var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// <define:import.meta.env>
var define_import_meta_env_default = {};

// src/services/customerItemSalesService.ts
var XLSX2 = __toESM(require("xlsx-js-style"), 1);

// src/services/arabicMatchingService.ts
var CANONICAL_BRANCHES = [
  "\u0627\u0644\u0641\u0631\u0639 \u0627\u0644\u0631\u0626\u064A\u0633\u064A (\u0627\u0644\u0645\u062E\u0632\u0646 \u0627\u0644\u0645\u0631\u0643\u0632\u064A - 6 \u0623\u0643\u062A\u0648\u0628\u0631)",
  "\u0641\u0631\u0639 \u0627\u0644\u0645\u0646\u064A\u0627",
  "\u0641\u0631\u0639 \u0645\u0646\u064A\u0627 \u0627\u0644\u0642\u0645\u062D",
  "\u0641\u0631\u0639 \u0627\u0644\u0642\u0627\u0647\u0631\u0629",
  "\u0641\u0631\u0639 \u0627\u0644\u0641\u064A\u0648\u0645",
  "\u0641\u0631\u0639 \u0627\u0644\u0628\u062D\u064A\u0631\u0629",
  "\u0641\u0631\u0639 \u062F\u064A\u0645\u0634\u0644\u062A",
  "\u0641\u0631\u0639 \u0645\u0646\u0648\u0641"
];
var MAIN_BRANCH_NAME = CANONICAL_BRANCHES[0];

// src/services/itemSalesAnalytics.ts
var GENERIC_FAMILY_VALUES = /* @__PURE__ */ new Set(["\u0639\u0627\u0645", "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F", "\u0627\u0644\u0643\u0644", "---", "0", ""]);
var isGenericFamilyValue = (value) => {
  const text = String(value ?? "").trim();
  return !text || GENERIC_FAMILY_VALUES.has(text);
};
var looksLikeItemCode = (value) => {
  const text = String(value ?? "").trim();
  if (!text || text.length > 30) return false;
  if (/[\u0600-\u06FF]/.test(text)) return false;
  if (/\s/.test(text)) return false;
  return /^[A-Za-z0-9\u0660-\u0669._#\-\/\\]+$/.test(text);
};
var resolveProductFamily = (product) => {
  if (!product) return "";
  const candidates = [
    product.familyName,
    product.classification,
    product.department,
    product.itemGroup,
    product.category
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text && !isGenericFamilyValue(text)) return text;
  }
  return "";
};
var buildProductFamilyLookup = (products2) => {
  const byCode = /* @__PURE__ */ new Map();
  const byUnified = /* @__PURE__ */ new Map();
  const normalize = (raw) => {
    const text = String(raw ?? "").trim().toLowerCase();
    if (!text) return "";
    return text.replace(/[\s_\-./\\#]+/g, "").replace(/\.0+$/, "");
  };
  (products2 || []).forEach((product) => {
    if (!product) return;
    const code = normalize(product.code);
    const unified = normalize(product.unifiedCode);
    if (code && !byCode.has(code)) byCode.set(code, product);
    if (unified && !byUnified.has(unified)) byUnified.set(unified, product);
  });
  const find = (record) => {
    const unified = normalize(record.unifiedCode);
    if (unified && byUnified.has(unified)) return byUnified.get(unified);
    const code = normalize(record.itemCode);
    if (code && byCode.has(code)) return byCode.get(code);
    return void 0;
  };
  return { byCode, byUnified, find };
};

// src/services/encodingService.ts
var XLSX = __toESM(require("xlsx"), 1);

// src/services/supabaseService.ts
var import_supabase_js = require("@supabase/supabase-js");

// src/services/passwordService.ts
var ALGO = "sha256";
var ITERATIONS = 1e4;
var PREFIX = `${ALGO}$${ITERATIONS}$`;
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);

// src/services/supabaseService.ts
var SUPABASE_URL = (define_import_meta_env_default.VITE_SUPABASE_URL || "").trim();
var SUPABASE_ANON_KEY = (define_import_meta_env_default.VITE_SUPABASE_ANON_KEY || "").trim();
var isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && /^https?:\/\//i.test(SUPABASE_URL) && !SUPABASE_URL.includes("YOUR-PROJECT")
);
var offlineSafeFetch = async () => new Response(
  JSON.stringify({ message: "Supabase is not configured in this environment", code: "OFFLINE_NO_CONFIG" }),
  { status: 503, headers: { "Content-Type": "application/json" } }
);
var supabase = (0, import_supabase_js.createClient)(
  isSupabaseConfigured ? SUPABASE_URL : "https://offline-local.supabase.co",
  isSupabaseConfigured ? SUPABASE_ANON_KEY : "offline-local-anon-key",
  {
    ...isSupabaseConfigured ? {} : { global: { fetch: offlineSafeFetch } },
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured
    }
  }
);
var MISSING_COLUMN_CACHE_KEY = "tantawy:missing_columns_v1";
var MISSING_COLUMN_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function readMissingColumnCache() {
  try {
    const raw = localStorage.getItem(MISSING_COLUMN_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
var missingColumnCache = readMissingColumnCache();
var CUSTOMERS_FULL_SELECT_COLUMNS = [
  "id",
  "code",
  "name",
  "store_name",
  "phone",
  "address",
  "region",
  "city",
  "governorate",
  "branch_name",
  "sector",
  "rep_name",
  "rep_id",
  "tax_number",
  "tier",
  "credit_limit",
  "balance",
  "current_balance",
  "notes",
  "last_visit_date",
  "visit_count_2026",
  "visit_history",
  "created_at",
  "updated_at",
  "sales_2026",
  "total_monthly_sales",
  "total_overall_sales",
  "collections_2026",
  "total_monthly_collections",
  "total_overall_collections",
  "monthly_sales_2026",
  "monthly_collections_2026",
  "sales_2025",
  "collections_2025",
  "overdue_2025",
  "overdue_2026",
  "due_until_period",
  "opening_balance_2026",
  "total_overdue",
  "total_overdue_and_due",
  "overdue_balance",
  "due_balance",
  "deal_eligibility",
  "dealt_2026",
  "dealt_in_2026",
  "has_dealt_in_2026",
  "activity_type",
  "client_type",
  "payment_terms",
  "guarantee_docs",
  "guarantee_amount",
  "last_collection_date",
  "last_collection_amount"
].join(",");
var CUSTOMERS_FIELD_SELECT_COLUMNS = [
  "id",
  "code",
  "name",
  "store_name",
  "phone",
  "address",
  "region",
  "city",
  "governorate",
  "branch_name",
  "sector",
  "rep_name",
  "rep_id",
  "tax_number",
  "tier",
  "credit_limit",
  "balance",
  "current_balance",
  "notes",
  "last_visit_date",
  "visit_count_2026",
  "created_at",
  "updated_at",
  "sales_2026",
  "total_monthly_sales",
  "total_overall_sales",
  "collections_2026",
  "total_monthly_collections",
  "total_overall_collections",
  "monthly_sales_2026",
  "monthly_collections_2026",
  "sales_2025",
  "collections_2025",
  "overdue_2025",
  "overdue_2026",
  "due_until_period",
  "opening_balance_2026",
  "total_overdue",
  "total_overdue_and_due",
  "overdue_balance",
  "due_balance",
  "deal_eligibility",
  "dealt_2026",
  "dealt_in_2026",
  "has_dealt_in_2026",
  "activity_type",
  "client_type",
  "payment_terms",
  "guarantee_amount",
  "last_collection_date",
  "last_collection_amount"
].join(",");
var cachedVisitsSupportsUpdatedAt = (() => {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("tantawy_visits_has_updated_at") : null;
    return v === "true" ? true : v === "false" ? false : null;
  } catch {
    return null;
  }
})();
var TARGETS_FETCH_COLUMNS = [
  "id",
  "branch",
  "rep_name",
  "sales_target",
  "sales_achieved",
  "sales_percentage",
  "collection_target",
  "collection_achieved",
  "collection_percentage",
  "target_date",
  "month",
  "year",
  "quarter",
  "remaining_sales",
  "remaining_collection",
  "notes",
  "updated_at"
].join(",");
var USERS_CACHE_TTL_MS = 5 * 60 * 1e3;
var cachedOrdersSupportsUpdatedAt = (() => {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("tantawy_orders_has_updated_at") : null;
    return v === "true" ? true : v === "false" ? false : null;
  } catch {
    return null;
  }
})();
var FORECAST_SELECT_COLUMNS = [
  "id",
  "month_key",
  "week_index",
  "rep_id",
  "rep_name",
  "branch_name",
  "customer_id",
  "customer_code",
  "customer_name",
  "collection_forecast",
  "sales_forecast",
  "status",
  "submitted_at",
  "approved_by",
  "approved_at",
  "change_request_note",
  "change_requested_by",
  "change_requested_at",
  "updated_by",
  "updated_at"
].join(",");
var FORECAST_PLAN_SELECT_COLUMNS = [
  "id",
  "year",
  "month",
  "month_start",
  "month_end",
  "weeks",
  "is_closed",
  "created_by",
  "created_at",
  "updated_by",
  "updated_at"
].join(",");
var CUSTOMER_COMMENTS_SELECT_COLUMNS = [
  "id",
  "customer_id",
  "customer_code",
  "customer_name",
  "branch_name",
  "rep_name",
  "kind",
  "body",
  "author_name",
  "created_at",
  "updated_at",
  "is_archived",
  "archived_at",
  "archived_by"
].join(",");
var CUSTOMER_SELECT_COLUMNS = [
  "id",
  "code",
  "name",
  "store_name",
  "phone",
  "address",
  "governorate",
  "branch_name",
  "sector",
  "rep_name",
  "rep_id",
  "tax_number",
  "tier",
  "credit_limit",
  "balance",
  "current_balance",
  "notes",
  "last_visit_date",
  "visit_count_2026",
  "visit_history",
  "sales_2026",
  "total_monthly_sales",
  "total_overall_sales",
  "collections_2026",
  "total_monthly_collections",
  "total_overall_collections",
  "monthly_sales_2026",
  "monthly_collections_2026",
  "sales_2025",
  "collections_2025",
  "overdue_2025",
  "overdue_2026",
  "due_until_period",
  "opening_balance_2026",
  "has_dealt_in_2026",
  "activity_type",
  "client_type",
  "payment_terms",
  "guarantee_docs",
  "guarantee_amount",
  "region",
  "last_collection_date",
  "last_collection_amount",
  "updated_at",
  "created_at"
].join(",");
var TARGETS_SELECT_COLUMNS = [
  "id",
  "branch",
  "rep_name",
  "sales_target",
  "sales_achieved",
  "sales_percentage",
  "collection_target",
  "collection_achieved",
  "collection_percentage",
  "target_date",
  "month",
  "year",
  "quarter",
  "remaining_sales",
  "remaining_collection",
  "notes",
  "updated_at"
].join(",");
var PRODUCTS_SELECT_COLUMNS = [
  "id",
  "code",
  "name",
  "sales_priority",
  "status",
  "carton_quantity",
  "size",
  "color",
  "stock",
  "branch_stock_actual",
  "branch_stock_reserved",
  "main_warehouse_actual",
  "main_warehouse_reserved",
  "item_group",
  "category",
  "department",
  "family_name",
  "classification",
  "piece_price",
  "carton_price",
  "image_url",
  "cloudinary_public_id",
  "barcode",
  "unified_code",
  "branch_stocks",
  "sector",
  "branch_name",
  "updated_at",
  "created_at"
].join(",");
var CUSTOMER_ITEM_SALES_SELECT_COLUMNS = [
  "id",
  "customer_account",
  "invoicing_name",
  "sales_order",
  "sale_date",
  "rep_name",
  "month",
  "item_code",
  "item_name",
  "quantity",
  "amount",
  "warehouse",
  "updated_at",
  // أعمدة التحليل — لازم تفضل موجودة في المزامنة التدريجية وإلا السجلات
  // المحدّثة تفقد الوحدة/المعامل/السعر/الخصم/الكود الموحد.
  "unit",
  "factor",
  "unit_price",
  "discount",
  "unified_code"
].join(",");

// src/services/customerItemSalesService.ts
var COUNT_CHECK_TTL_MS = 30 * 60 * 1e3;
function enrichCustomerItemSalesWithCatalog(sales, products2) {
  if (!sales || sales.length === 0 || !products2 || products2.length === 0) return sales;
  const lookup = buildProductFamilyLookup(products2);
  return sales.map((record) => {
    const product = lookup.find(record);
    if (!product) return record;
    const family = isGenericFamilyValue(record.familyDimension) ? resolveProductFamily(product) || String(record.familyDimension || "").trim() : String(record.familyDimension).trim();
    const rawName = String(record.itemName || "").trim();
    const catalogName = String(product.name || "").trim();
    const itemName = (!rawName || rawName === String(record.itemCode || "").trim() || looksLikeItemCode(rawName)) && catalogName ? catalogName : rawName;
    const recordUnified = String(record.unifiedCode || "").trim();
    const productUnified = String(product.unifiedCode || "").trim();
    const unifiedCode = looksLikeItemCode(recordUnified) ? recordUnified : looksLikeItemCode(productUnified) ? productUnified : recordUnified || void 0;
    return { ...record, familyDimension: family, itemName, unifiedCode };
  });
}
var CUSTOMER_ITEM_SALES_SELECT_COLUMNS2 = [
  "id",
  "customer_account",
  "invoicing_name",
  "sales_order",
  "sale_date",
  "rep_name",
  "month",
  "warehouse",
  "item_code",
  "item_name",
  "unified_code",
  "unit",
  "factor",
  "unit_price",
  "discount",
  "quantity",
  "amount",
  "item_group",
  "definitions",
  "family_dimension",
  "created_at"
].join(",");

// ../Users/Administrator/AppData/Local/Temp/opencode/test-enrich.ts
var base = {
  id: "1",
  customerAccount: "C1",
  invoicingName: "\u0639\u0645\u064A\u0644",
  repName: "\u0623\u062D\u0645\u062F",
  month: 1,
  warehouse: "\u0627\u0644\u0641\u0631\u0639 \u0627\u0644\u0631\u0626\u064A\u0633\u064A",
  itemCode: "1002437",
  itemName: "1002437",
  unifiedCode: "\u0642\u0631\u0648\u0627\u0646 \u0627\u0633\u062A\u064A\u0644 \u0647\u0646\u062F\u0649 50 \u0633\u0645",
  unit: "\u0643\u0631\u062A\u0648\u0646\u0629",
  factor: 12,
  unitPrice: 10,
  discount: 0,
  quantity: 1,
  amount: 120,
  itemGroup: "\u0639\u0627\u0645",
  familyDimension: "\u0639\u0627\u0645"
};
var products = [
  {
    id: "p1",
    code: "1002437",
    unifiedCode: "245118",
    name: "\u0642\u0631\u0648\u0627\u0646 \u0627\u0633\u062A\u064A\u0644 \u0647\u0646\u062F\u0649 50 \u0633\u0645",
    familyName: "\u0642\u0631\u0648\u0627\u0646",
    classification: "\u0642\u0631\u0648\u0627\u0646",
    department: "\u0628\u0644\u0627\u0633\u062A\u064A\u0643\u0627\u062A"
  }
];
var enriched = enrichCustomerItemSalesWithCatalog([base], products);
console.log(JSON.stringify(enriched[0], null, 2));
