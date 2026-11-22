import 'dotenv/config';

const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/`, {
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
  signal: AbortSignal.timeout(30000),
});
const spec = await res.json();
const defs = spec.definitions || spec.components?.schemas || {};

// جداول/أعمدة يعتمد عليها p0_auth_lockdown.sql
const required = {
  users: ['id', 'name', 'username', 'email', 'role', 'branch_name', 'supervisor_id',
          'phone', 'commission_rate', 'is_active', 'approval_status', 'auth_user_id', 'sector'],
  customers: ['rep_name', 'branch_name'],
  invoices: ['rep_id'],
  visits: ['rep_id'],
  targets: ['rep_name', 'branch'],
  orders: [],
  products: [],
};
const optional = ['app_users', 'profiles', 'customer_item_sales', 'collection_forecasts',
                  'forecast_month_plans', 'customer_comments', 'app_release'];

let problems = 0;
for (const [table, cols] of Object.entries(required)) {
  const t = defs[table];
  if (!t) {
    console.log(`✗ جدول مفقود: ${table}`);
    problems++;
    continue;
  }
  const have = new Set(Object.keys(t.properties || {}));
  const missing = cols.filter((c) => !have.has(c));
  if (missing.length) {
    console.log(`✗ ${table}: أعمدة مفقودة → ${missing.join(', ')}`);
    problems++;
  } else {
    console.log(`✓ ${table} (${cols.length} عمود مطلوب موجود)`);
  }
}
console.log('\nجداول اختيارية (p0 بيتجاهلها لو مش موجودة):');
for (const t of optional) console.log(`  ${defs[t] ? '✓ موجود' : '— غير موجود'}: ${t}`);

console.log(`\n${problems === 0 ? '✅ مفيش نقص — p0 هيعدي' : `❌ ${problems} مشكلة لازم تتصلح الأول`}`);
process.exit(0);
