import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// قراءة كلمة مرور osama من ملف الـCSV
const csv = readFileSync('auth-temp-passwords.csv', 'utf8').replace(/^\uFEFF/, '');
const line = csv.split(/\r?\n/).find((l) => l.includes('osama@dream.com'));
if (!line) {
  console.log('osama مش موجود في CSV — الأسطر المتاحة:');
  console.log(csv.split(/\r?\n/).slice(1, 6).join('\n'));
  process.exit(1);
}
const cols = line.match(/"([^"]*)"/g).map((c) => c.slice(1, -1));
const password = cols[2];
console.log('حساب:', cols[1]);

const anonClient = createClient(URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (i, s) => fetch(i, { ...s, signal: AbortSignal.timeout(30000) }) },
});

// 1) دخول
const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
  email: cols[1],
  password,
});
if (signInErr) {
  console.log('✗ signInWithPassword:', signInErr.status, signInErr.message);
  process.exit(1);
}
console.log('✓ signInWithPassword ناجح — role في التوكن:', signIn.session.user?.aud ?? '?');
const token = signIn.session.access_token;

// 2) طلبات مماثلة لطلبات التطبيق — بنفس الجلسة
const probes = [
  ['customers (جلسة)', '/rest/v1/customers?select=id&limit=1', token],
  ['customers (anon فقط)', '/rest/v1/customers?select=id&limit=1', null],
  ['orders stamp (جلسة)', '/rest/v1/orders?select=items,total,updated_at,created_at&id=eq.dream_app_global_sync_version_v1&limit=1', token],
  ['users stamp (جلسة)', '/rest/v1/users?select=updated_at&order=updated_at.desc.nullslast&limit=1', token],
  ['get_my_profile (جلسة)', '/rest/v1/rpc/get_my_profile', token],
  ['data_change_history (جلسة)', '/rest/v1/data_change_history?select=id&limit=1', token],
];

for (const [label, path, tok] of probes) {
  const headers = { apikey: ANON, Accept: 'application/json' };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const method = path.includes('/rpc/get_my_profile') ? 'POST' : 'GET';
  const res = await fetch(URL + path, { method, headers, signal: AbortSignal.timeout(30000) });
  const body = (await res.text()).slice(0, 300);
  console.log(`\n[${label}] → ${res.status}`);
  console.log(`  ${body}`);
}
process.exit(0);
