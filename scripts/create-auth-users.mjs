#!/usr/bin/env node
// =============================================================================
//  إنشاء حسابات Supabase Auth للنشطين غير المربوطين
// =============================================================================
//  المشكلة: p0_auth_lockdown.sql بيرفض التنفيذ طالما في حساب نشط من غير
//  auth_user_id. السكربت ده بينشئ الحسابات الناقصة في Supabase Auth
//  (اللي بيعتمد عليه الدخول بعد الترحيل) ويطلع CSV بكلمة مرور مؤقتة
//  لكل موظف.
//
//  المتطلبات:
//   1) ضيف في .env سطر واحد (مفتاح service_role من Supabase Dashboard →
//      Settings → API). مفتاح anon مش كفاي — إنشاء حسابات يحتاج service_role:
//        SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
//      .env متجاهل من git (شوف .gitignore) فالمفتاح مش هينشر.
//   2) node scripts/create-auth-users.mjs            ← كلمة مرور مؤقتة + CSV
//      node scripts/create-auth-users.mjs --invite   ← رابط دعوة بالإيميل
//         (التاني يحتاج SMTP/Email مفعّل في Supabase، والأول أسرع وأضمن)
//
//  بعد نجاحه نفّذ في SQL Editor (ربط الحسابات بجدول users):
//    update public.users u
//    set auth_user_id = au.id, auth_email = lower(au.email)
//    from auth.users au
//    where u.auth_user_id is null
//      and coalesce(trim(u.email), '') <> ''
//      and lower(trim(u.email)) = lower(trim(au.email));
//  ثم أعد تشغيل supabase/p0_auth_lockdown.sql.
// =============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const INVITE_MODE = process.argv.includes('--invite');
const CSV_PATH = 'auth-temp-passwords.csv';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'STOP: ناقص VITE_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY في ملف .env.\n' +
      '  المفتاح service_role تاخده من: Supabase Dashboard → Settings → API → service_role'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  // مهلة 30 ثانية لكل طلب — يمنع التعليق اللانهائي على شبكة ضعيفة
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
  },
});

/** كلمة مرور مؤقتة قوية — بلا أحرف مضللة (0/O, 1/l/I) */
function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*?';
  let out = '';
  for (let i = 0; i < 18; i++) out += abc[randomInt(abc.length)];
  return out;
}

/** جلب كل مستخدمي التطبيق (service_role بيتخطى RLS) */
async function fetchAppUsers() {
  const all = [];
  const pageSize = 1000;
  for (let page = 1; page <= 50; page++) {
    console.log(`  قراءة users — صفحة ${page}...`);
    const { data, error } = await admin
      .from('users')
      .select('id, username, name, email, is_active, approval_status, auth_user_id')
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(`قراءة users فشلت: ${error.message}`);
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

/** جلب كل حسابات Supabase Auth الموجودة (للتخطي — إنشاء مكرر بيفشل) */
async function fetchAuthUsers() {
  const map = new Map();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    console.log(`  قراءة auth.users — صفحة ${page}...`);
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`قراءة auth.users فشلت: ${error.message}`);
    for (const u of data.users) {
      if (u.email) map.set(u.email.trim().toLowerCase(), u.id);
    }
    // totalPages أحياناً undefined في بعض الإصدارات — نعتمد على قصر الصفحة كمان
    if (data.users.length < perPage) break;
    if (data.totalPages && page >= data.totalPages) break;
  }
  return map;
}

const clean = (s) => (s || '').trim().toLowerCase();

console.log(`[${new Date().toLocaleTimeString()}] جاري قراءة المستخدمين...`);
const rows = await fetchAppUsers();
const authByEmail = await fetchAuthUsers();

// نفس فلتر lookup_login_email: نشط + موافق عليه + له بريد + لسه غير مربوط
const eligible = [];
const noEmail = [];
for (const u of rows) {
  const active = u.is_active !== false;
  const approved = (u.approval_status || 'active') === 'active';
  if (!active || !approved) continue;
  if (!clean(u.email)) {
    noEmail.push(u);
    continue;
  }
  if (u.auth_user_id) continue;
  eligible.push(u);
}

console.log(`المستخدمون في الجدول: ${rows.length}`);
console.log(`مرشحون لإنشاء حساب Auth: ${eligible.length}`);
if (noEmail.length) {
  console.warn(
    `⚠ ${noEmail.length} حساب نشط بلا بريد إلكتروني — مينفعش يدخل خالص لحد ما تضيف له إيميل في users:`
  );
  for (const u of noEmail.slice(0, 20)) console.warn(`   - ${u.username || u.id} (${u.name || ''})`);
}

if (!eligible.length) {
  console.log('✅ مفيش حسابات ناقصة — انتقل للخطوة اللي بعدها (ربط ثم p0_auth_lockdown.sql).');
  process.exit(0);
}

// تكرار الإيميل في جدول users = حساب Auth واحد يربطهم اتنين
const seenEmail = new Set();
const csvRows = [];
let created = 0;
let existed = 0;
let failed = 0;

for (const u of eligible) {
  const email = clean(u.email);
  if (seenEmail.has(email)) continue;
  seenEmail.add(email);
  const n = seenEmail.size;
  console.log(`[${n}/${eligible.length}] ${email} ...`);

  try {
    if (INVITE_MODE) {
      const { error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error && !/already been registered|already exists/i.test(error.message)) throw error;
      if (error) existed += 1;
      else created += 1;
      csvRows.push({ ...u, email, temp: '(دعوة بالإيميل)' });
      console.log(`   ✓ ${error ? 'موجود مسبقاً' : 'دعوة اتبعتت'}`);
    } else {
      let authId = authByEmail.get(email);
      if (authId) {
        existed += 1;
        console.log('   ✓ موجود مسبقاً — تم التخطي');
      } else {
        const password = tempPassword();
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error) throw error;
        authId = data.user.id;
        created += 1;
        csvRows.push({ ...u, email, temp: password });
        console.log(`   ✓ تم الإنشاء (${created} جديد)`);
      }
    }
  } catch (e) {
    failed += 1;
    console.error(`✗ ${email}: ${e.message || e}`);
  }
}

if (!INVITE_MODE && csvRows.length) {
  const header = 'username,email,temp_password,user_id\n';
  const body = csvRows
    .map((r) =>
      [r.username || '', r.email, r.temp, r.id]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  // BOM عشان Excel يعرض العربي صح
  writeFileSync(CSV_PATH, '\uFEFF' + header + body, 'utf8');
  console.log(`\nملف كلمات المرور المؤقتة: ${CSV_PATH}`);
}

console.log(`\nالنتيجة: تم إنشاء ${created}، موجود مسبقاً ${existed}، فشل ${failed}`);
if (failed) process.exitCode = 1;

console.log(`
الخطوة الجاية (SQL Editor):
  1) ربط الحسابات بجدول users:
     update public.users u
     set auth_user_id = au.id, auth_email = lower(au.email)
     from auth.users au
     where u.auth_user_id is null
       and coalesce(trim(u.email), '') <> ''
       and lower(trim(u.email)) = lower(trim(au.email));
  2) تأكيد صفر صفوف متبقية:
     select count(*) from public.users
     where coalesce(is_active, true) = true
       and auth_user_id is null
       and coalesce(trim(email), '') <> '';
  3) أعد تشغيل supabase/p0_auth_lockdown.sql — المفروض يعدّي الآن.
`);
