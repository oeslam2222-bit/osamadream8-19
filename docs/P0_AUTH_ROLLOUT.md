# P0 — ترحيل الحسابات إلى Supabase Auth (خطة تنفيذ ونسخ احتياطي)

هذا الملف هو خطوات التنفيذ على قاعدة البيانات. **الكود جاهز**، لكن تنفيذ SQL
وإنشاء حسابات المصادقة يحتاج صلاحية `service_role` / لوحة Supabase — وليس
من حساب التطبيق.

> ترتيب الخطوات مهم. لا تنفّذ `p0_auth_lockdown.sql` قبل الخطوة 3.

---

## 0) نسخة احتياطية مؤكدة (Backup)

من لوحة Supabase:

1. **Database → Backups**: خُد نسخة يدوية واكتب وقتها هنا: `______`.
2. **SQL Editor** — نسخ جداول حرجة (قراءة فقط من الإنتاج):
   ```sql
   create table public.users_backup_pre_rls as select * from public.users;
   create table public.auth_link_backup as
     select id, username, email, auth_user_id, auth_email from public.users;
   ```
3. تحقق أن النسخة اتكتبت فعلًا:
   ```sql
   select (select count(*) from public.users)              as users_now,
          (select count(*) from public.users_backup_pre_rls) as users_backup;
   ```
   الرقمان لازم يكونوا متساويين. سجّل الرقم: `______`.
4. نزّل ملف CSV للجداول المالية إن أمكن (`invoices`, `customers`) للاحتفاظ خارج القاعدة.

**لا تكمل قبل تأكيد الأرقام أعلاه.**

---

## 1) تجهيز كلمات المرور الجديدة

جدول `users` كان بيخزّن بصمة sha256 قديمة. Supabase Auth لا يستوردها.

- لكل موظف: **Authentication → Users → Add user** بالبريد الموجود في `users.email`.
- اختر كلمة مرور مؤقتة قوية وسلّمها للموظف بقناة آمنة، أو استخدم
  **Send invite** ليضع كلمة مروره بنفسه (الأفضل).
- **للكميات الكبيرة (٥٠+ حساب):** استخدم السكربت الجاهز — بيقرأ النشطين
  غير المربوطة، بينشئ حسابات Auth لكل واحد، ويطلع CSV بكلمة مؤقتة:
  ```bash
  # محتاج SUPABASE_SERVICE_ROLE_KEY في .env (Dashboard → Settings → API)
  npm run auth:create-users            # كلمة مرور مؤقتة + auth-temp-passwords.csv
  npm run auth:create-users -- --invite  # رابط دعوة بالإيميل (محتاج SMTP مفعّل)
  ```
  ثم اربطهم بجدول users (SQL Editor):
  ```sql
  update public.users u
  set auth_user_id = au.id, auth_email = lower(au.email)
  from auth.users au
  where u.auth_user_id is null
    and coalesce(trim(u.email), '') <> ''
    and lower(trim(u.email)) = lower(trim(au.email));
  ```
- لو الحساب بلا بريد: أضف بريدًا صحيحًا في `users` أولًا، أو أنشئ حساب Auth
  بنفس البريد ثم اربطه يدويًا:
  ```sql
  update public.users
     set auth_email = lower(email)
   where lower(email) = '<email>';
  ```
  الربط بـ `auth_user_id` يتم تلقائيًا من التطبيق عند أول دخول
  (`linkAuthUserToProfile`)، أو يدويًا:
  ```sql
  update public.users
     set auth_user_id = '<AUTH_UID>', auth_email = lower(email)
   where lower(email) = '<email>';
  ```

---

## 2) تحقق أن كل الحسابات النشطة مربوطة

```sql
select id, username, email
from public.users
where coalesce(is_active, true) = true
  and auth_user_id is null
  and coalesce(trim(email), '') <> '';
```

- النتيجة **صفر صفوف** → كمل.
- أي صف → اربطه أولًا. (ملف `p0_auth_lockdown.sql` سيرفض التنفيذ بأمان لو
  كانت هناك صفوف غير مربوطة، ومش هيقفل النظام على الموظفين بالغلط.)

---

## 2.b) حماية النسخ القديمة المثبتة (PWA) — قبل تفعيل RLS

بدون هذه الخطوة، أي موظف عنده نسخة قديمة متثبتة هيفتح التطبيق بعد تفعيل RLS
ويلاقي **شاشات فاضية بدون رسالة خطأ** (PostgREST بيرجع صفر صفوف). الحماية
على ثلاث طبقات:

1. **انشر نسخة العميل 1.0.0 أولًا** وانتظر تحديث الـService Worker على أجهزة
   الموظفين (`registerType: 'autoUpdate'` بيعمل ده عند فتح التطبيق ووجود نت).
   النسخة الجديدة بتحتوي بوابة تحديث إجبارية.
2. **اقفل على مستوى القاعدة**: بعد الـRLS، أي نسخة بدون جلسة Supabase Auth
   بتاخد `401 / 42501 permission denied` — رفض صريح مش بيانات فاضية.
   النسخة الجديدة بتحوّل الرفض ده لشاشة "نسخة قديمة — حدّث الآن" مع زر تحديث.
3. **حدّد الحد الأدنى للإصدار في القاعدة قبل تفعيل RLS**:
   ```sql
   update public.app_release set min_client_version = '1.0.0', updated_at = now() where id = 1;
   ```
   أي نسخة أحدث من البداية هتتحجب فورًا لو رقمها أقل من ده.

**حدود صادقة:** مفيش طريقة لإضافة كود لنسخة متثبتة بالفعل؛ الطبقة الوحيدة
المضمونة لها هي رفض القاعدة (401) + التحديث التلقائي للـService Worker.
لذلك رتّب النشر: كلاينت جديد → تأكيد وصوله → SQL.

كقائد فريق، تأكد أيضًا أن `VITE_MIN_CLIENT_VERSION` في بيئة النشر مطابق أو
أقل من `app_release.min_client_version` (الاحتياطي وقت البناء).

---

## 3) تنفيذ الـSQL

1. `supabase/secure_user_credentials.sql` — يحوّل أي كلمة سر نصية لبصمة ويمنع
   قراءة العمود. (نفّذه بعد نشر التطبيق الحالي حتى لا يتعطل دخول قديم.)
2. `supabase/p0_auth_lockdown.sql` — يشيل كل `USING (true)` ويبني سياسات
   `auth.uid()` + sector/branch scoping، ويسحب وصول `anon` بالكامل.

كل ملف داخل `begin/commit`، وأي فشل في الفحوصات يرجّع كل شيء (Rollback).

---

## 4) اختبار قبول (قبل ما تعلن الجاهزية)

على جهازين/متصفحين مختلفين:

- [ ] دخول مندوب بإيميله وكلمة مروره → يفتح، ويشوف عملاءه فقط.
- [ ] نفس المندوب يحاول قراءة عميل فرع آخر عبر DevTools → صفر صفوف (RLS).
- [ ] مشرف فرع → يشوف فرع واحد فقط، ومينفعش يعدّل جداول الإدارة.
- [ ] أدمن → يشوف كل الفروع، ويضيف/يعدّل مستخدم.
- [ ] طلب بيانات مجهول بـ anon key (curl/Postman) على `customers` → `permission denied` / صفر صفوف.
- [ ] طلب بيانات بـ anon key على `users` → مفيش `password` في الأعمدة.
- [ ] تسجيل خروج ثم دخول مرة أخرى → الجلسة تتجدد، والبيانات تتحمّل.
- [ ] فتح التطبيق أوفلاين: **الدخول يحتاج إنترنت الآن** (قرار أمني مقصود)،
      والجلسة المحفوظة تكمل عرض البيانات المخزنة فقط.
- [ ] إعادة تحميل الصفحة بعد الدخول → الجلسة تُستعاد تلقائيًا (بدون دخول جديد).
- [ ] جهاز بنسخة قديمة (قبل 1.0.0) → تظهر شاشة "نسخة التطبيق قديمة"
      أو رفض الوصول، مش شاشات فاضية.
- [ ] `select min_client_version from public.app_release;` يرجّع النسخة المنشورة.

---

## 5) التراجع (Rollback)

- السياسات: قسم Rollback في نهاية `p0_auth_lockdown.sql` (بيرجّع الوصول القديم).
- البيانات: استخدم `users_backup_pre_rls` أو نسخة Supabase اليدوية.
- **تنبيه:** الرجوع لسياسات `USING (true)` يعني إعادة فتح كل البيانات لأي شخص
  عنده الـanon key. استخدمه فقط كإجراء طارئ مؤقت.

---

## ما تغيّر في الكود

| قبل | بعد |
|---|---|
| تحقق كلمة المرور في المتصفح (`passwordService`) | Supabase Auth فقط (`authService.tryServerSignIn`) |
| قراءة `users.password` من العميل | محذوفة من كل الاستعلامات |
| تخزين بصمات الباسورد في localStorage/IDB | لا يوجد أي تخزين |
| إضافة/تعديل مستخدم بكلمة مرور من لوحة الإدارة | إنشاء الحساب من لوحة Supabase؛ الحقل بقى إرشاديًا فقط |
| أوضاع `legacy/hybrid/server` | وضع واحد: `server` (لا رجوع محلي) |
