import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

const csv = readFileSync('auth-temp-passwords.csv', 'utf8').replace(/^\uFEFF/, '');
const line = csv.split(/\r?\n/).find((l) => l.includes('osama@dream.com'));
const cols = line.match(/"([^"]*)"/g).map((c) => c.slice(1, -1));

const client = createClient(URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (i, s) => fetch(i, { ...s, signal: AbortSignal.timeout(30000) }) },
});

const { data: signIn, error } = await client.auth.signInWithPassword({ email: cols[1], password: cols[2] });
if (error) { console.log('✗ login:', error.message); process.exit(1); }

// عدّ الصفوف الظاهرة لكل جدول بنفس طلبات التطبيق (count=exact)
const tables = [
  ['customers', 'id,code,name,rep_name,branch_name,sector'],
  ['products', 'id,code,name'],
  ['targets', 'id,branch,rep_name'],
  ['visits', 'id'],
  ['orders', 'id'],
  ['collection_forecasts', 'id'],
  ['users', 'id,name,role'],
];

for (const [t, sel] of tables) {
  const { count, error: e } = await client.from(t).select(sel, { count: 'exact', head: true });
  console.log(`${e ? '✗' : '✓'} ${t}: ${e ? 'ERROR ' + e.message : count + ' صف'}`);
}

// بدون scope — ونفس scope اللي الداشبورد بيستخدمه (sector=null عند أسامة)
const { count: c2, error: e2 } = await client
  .from('customers')
  .select('id', { count: 'exact', head: true })
  .or('sector.in.(home,both,all),sector.is.null');
console.log(e2 ? '✗ customers sector filter: ' + e2.message : `✓ customers مع فلتر sector: ${c2} صف`);
process.exit(0);
