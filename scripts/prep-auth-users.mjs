#!/usr/bin/env node
// =============================================================================
//  تجهيز حسابات الناقصة قبل create-auth-users.mjs:
//   1) approval_status='approved' → 'active' (حالة مش معتمدة في التطبيق)
//   2) استبدال الإيميلات العربية (GoTrue بيرفضها) بعنوان ASCII فريد repNN@dream.com
//  الملف بيكسب في idempotent — يعيد تشغله بأمان. بيطلع تقرير بالتغييرات.
// =============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('STOP: ناقص SUPABASE_SERVICE_ROLE_KEY في .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (i, s) => fetch(i, { ...s, signal: AbortSignal.timeout(30000) }) },
});

const isAscii = (s) => /^[\x20-\x7E]+$/.test(s || '');
const clean = (s) => (s || '').trim().toLowerCase();

// 1) قراءة الكل
const { data: users, error } = await admin
  .from('users')
  .select('id, username, email, approval_status, is_active, auth_user_id');
if (error) throw error;

// 2) approved → active
const toActivate = users.filter((u) => u.approval_status === 'approved');
for (const u of toActivate) {
  const { error: e } = await admin
    .from('users')
    .update({ approval_status: 'active' })
    .eq('id', u.id)
    .eq('approval_status', 'approved');
  if (e) console.error(`✗ approved→active فشل لـ ${u.id}: ${e.message}`);
  else console.log(`✓ approved→active: ${u.username || u.id}`);
}

// 3) إيميل عربي → ASCII فريد
const taken = new Set(users.map((u) => clean(u.email)).filter(Boolean));
const changes = [];
let seq = 0;
const arabicLocal = users.filter(
  (u) => clean(u.email) && !isAscii(clean(u.email).split('@')[0])
);

for (const u of arabicLocal) {
  let email;
  do {
    seq += 1;
    email = `rep${String(seq).padStart(2, '0')}@dream.com`;
  } while (taken.has(email));
  taken.add(email);

  const { error: e } = await admin.from('users').update({ email }).eq('id', u.id);
  if (e) {
    console.error(`✗ تغيير إيميل ${u.id} فشل: ${e.message}`);
    continue;
  }
  changes.push({ id: u.id, username: u.username || '', old: u.email, new: email });
  console.log(`✓ ${u.username || u.id}: ${u.email} ←→ ${email}`);
}

if (changes.length) {
  const csv =
    '\uFEFFusername,user_id,old_email,new_email\n' +
    changes
      .map((c) => [c.username, c.id, c.old, c.new].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  writeFileSync('auth-email-changes.csv', csv, 'utf8');
  console.log(`\nتقرير تغيير الإيميلات: auth-email-changes.csv (${changes.length} صف)`);
}

console.log(`\nالنتيجة: approved→active = ${toActivate.length}، إيميلات تغيّرت = ${changes.length}`);
console.log('الخطوة الجاية: npm run auth:create-users');
process.exit(0);
