# مخطط العلاقات (ERD) — مستخرج من الكود فقط

> **مصدر البيانات:** كل ما في الملف ده مأخوذ من **الكود المحلي** (`src/types.ts`، استعلامات
> `supabaseService`، ملفات `supabase/*.sql`) — **بدون أي استعلام على Supabase**، فمفيش أي
> استهلاك egress. أي حقل مكتوب تحته ⚠️ معناه «مش مؤكد إنه موجود فعلًا في القاعدة»،
> ولازم يتأكد من SQL Editor وقت التنفيذ (استعلام واحد مجاني تقريبًا).

---

## 1) الجداول اللي التطبيق بيكلمها فعلًا

| الجدول | دوره | المفتاح المنطقي في الكود | ملاحظة |
|---|---|---|---|
| `customers` | قاعدة العملاء | `code` (كود العميل) + `id` | الكود بيربط بالاسم `branch_name`/`rep_name` كتير |
| `products` | الأصناف | `code` + `unified_code` | عليه فهرس فريد `products_code_unique_idx` |
| `invoices` | الفواتير/الطلبيات | `invoice_number` (`DRM-2026-0042`) | **الأصناف جوّه عمود `items` (JSON)** |
| `orders` | الطلبات وسير اعتمادها | `id` | 29 استخدام — أكتر جدول مستخدم |
| `visits` | الزيارات الميدانية | `id` | عليها فهارس `customer_id`, `rep_id`, `date` |
| `targets` | التارجت | `rep_id` + الشهر | — |
| `customer_item_sales` | مبيعات العميل × الصنف | `customer_code` + `product_code` | أساس تحليل الأصناف |
| `collection_forecasts` | تنبؤ التحصيل الأسبوعي/الشهري | `month_key` + `week_index` + `rep_id` + `customer_id` | `week_index = 0` = التوقع الشهري |
| `forecast_month_plans` | تقسيم الشهر لفترات | `id` = `'YYYY-MM'` | فيه `weeks` (jsonb) |
| `customer_comments` | ملاحظات/تعثر/مرتجعات | `customer_id` | فيه `kind`, `body`, `author_name` |
| `users` | حسابات الدخول | `username` + `email` | عليه فهارس unique على `auth_user_id`, `username`, `email` |
| `profiles` | ملفات المستخدمين | `id` | ⚠️ مصدر ثالث للمستخدم بجانب `app_users` |
| `app_users` | مستخدمون بديلون | — | ⚠️ ازدواج مع `users`/`profiles` |
| `data_change_history` | تتبع التعديلات | `table_name` + `row_id` | من `tamper_evidence.sql` |

> ملاحظة مؤكدة من الكود: الاستعلامات بتستخدم `select('*')` في معظم الحالات،
> وده اللي خلّى النظام كله يتعطّل لما عمود واحد ناقص (`visits 400`).

---

## 2) العلاقات كما هي في الكود (المؤكدة ✅ والمكسورة ⚠️)

```
customers (code, id)
   │
   ├──< visits.customer_id            ✅ عليه فهرس
   ├──< customer_comments.customer_id ✅
   ├──< customer_item_sales.customer_code  ⚠️ ربط بالكود النصّي مش بالـ id
   ├──< collection_forecasts.customer_id   ✅
   └──< invoices.customer_id          ⚠️ أحيانًا بيتحط فيه code بدل id
                                        + اسم العميل/الكود مكررين كنصوص

products (code, unified_code)
   ├──< invoices.items[].productCode  ⚠️ داخل JSON — مفيش جدول وسيط
   └──< customer_item_sales.product_code ✅

users (username, id)
   ├──< visits.rep_id                 ⚠️ مش واضح: id ولا username؟
   ├──< invoices.rep_id               ⚠️ نفس التباس
   ├──< targets.rep_id                ⚠️ نفس التباس
   └──< collection_forecasts.rep_id   ⚠️ نفس التباس

invoices (invoice_number, id)
   ├──< orders.invoice_id?            ⚠️ الربط عبر الرقم النصّي في أغلب الشاشات
   └──< visits.linkedOrderNumber      ⚠️ نص، مش مفتاح

targets ─────── مفيش ربط مباشر بـ invoices/collection_forecasts
                 ⚠️ المقارنة «تارجت vs فعلي» بتتعمل في الواجهة بالاسم والشهر
```

**الخلاصة:** الجداول موجودة، لكن **العلاقات نصّية (name/code) في أهم المسارات**،
وليس فيها `FOREIGN KEY` واحد معلن. ده سبب:
- تكرار الأسماء (نفس العميل بحروف مختلفة يبقى عميلين).
- استحالة ربط مبيعات الصنف بفاتورته.
- صعوبة حساب «التارجت مقابل الفعلي» بدقة.

---

## 3) الحقول الناقصة/المشكوك فيها — مرتبة بالأثر

| # | المشكلة | الأثر الظاهر | العلاج |
|---|---|---|---|
| 1 | `visits` ناقصة أعمدة الجلسة (`location`, `check_in_time`, `check_out_time`, `duration_minutes`, `store_stock_status`, `competitor_notes`, `customer_rating`, `next_visit_date`, `order_created_id`, `order_amount`) | خطأ `visits 400` | ملف جاهز: `supabase/add_visit_session_columns.sql` (idempotent) |
| 2 | مفيش جدول `invoice_items` — الأصناف `jsonb` جوه `invoices.items` | مفيش ربط صنف×فاتورة، وتقارير الأصناف بتعتمد على `customer_item_sales` بس | جدول وسيط `invoice_items(invoice_number, product_code, qty, price, …)` + تعبئته من الـjsonb |
| 3 | `products.code` عليه unique index والكود بيحاول يدخل نفس الكود | خطأ `409 duplicate key "products_code_key"` | upsert على `code` بدل insert، أو كود موحّد + variants |
| 4 | `invoices.customer_id` مختلط (id / code) | فواتير معلّقة مش ظاهرة تحت العميل | توحيد: `customer_id` = `customers.id`، والكود في عمود `customer_code` |
| 5 | `rep_id` غير محدد المرجع (id/username) | زيارات/تارجت مش بتتجمع صح | قرار: `rep_id` = `users.id`، والكود نص في `rep_code` |
| 6 | 3 جداول مستخدمين (`users`, `profiles`, `app_users`) | صلاحيات متضاربة وحسابات مكررة | اختيار `users` كمصدر واحد + view للتوافق |
| 7 | مفيش `FOREIGN KEY` | بيانات يتيمة مش هتتكشف | إضافة FKs بعد تنظيف، أو على الأقل `NOT VALID` |
| 8 | `verify_user_credentials` RPC غير موجودة في القاعدة | خطأ `404` في كل تسجيل دخول | نشر `supabase/harden_login_rpc.sql` |

---

## 4) خطة الربط بأقل تكلفة (بدون egress زيادة)

**المرحلة 1 — تنضيف بدون أي كتابة (قراءة فقط):**
1. استعلام واحد لكل جدول: `select column_name, data_type from information_schema.columns where table_name = 'visits'` وأمثاله — عشان نثبّت الحقول الحقيقية.
2. `select count(*)` للجداول، وعدد الصفوف اليتيمة (`visits` بلا `customer_id` موجود في `customers`).

**المرحلة 2 — سدّ الفجوات:**
3. نشر `add_visit_session_columns.sql` ثم `harden_login_rpc.sql` (كلاهما idempotent).
4. إضافة `invoice_items` وتعبئتها من `invoices.items` بـ`jsonb_to_recordset` — عملية واحدة على السيرفر.
5. فهارس على أعمدة الربط (`invoices.customer_id`, `invoices.invoice_number`, `targets.rep_id`, `customer_item_sales.customer_code`).

**المرحلة 3 — تقليل الـegress في الكود (توفير مباشر):**
6. استبدال `select('*')` بقائمة أعمدة محددة (نفس أسلوب `buildSelectList` الموجود في `supabaseService`) — بيقلّل حجم الرد بشكل كبير.
7. تجميع الحسابات في **views** على السيرفر (`v_customer_360`, `v_rep_actuals`) بدل ما الواجهة تجيب كل الصفوف وتحسبها.
8. تفعيل `supabase/egress_cleanup_and_indexes.sql` (الفهارس موجودة، محتاجة تنفيذ).

> كل ما سبق **مكتوب ومُجهّز في ملفات SQL محلية** — التنفيذ نفسه هو اللي محتاج منك
> تشغيله من SQL Editor (أو أديك الصلاحية وأنا أجهّز الأوامر واحد واحد).

---

## 5) حدود هذا المستند

- مفيش استعلام واحد اتنفّذ على القاعدة (احترامًا لحد الـegress).
- أسماء الأعمدة المكتوبة هنا مستخرجة من: استعلامات الكود، ملفات `sql/` المحلية، والفهارس.
- أي بند عليه ⚠️ لازم يتأكد من `information_schema` قبل البناء عليه.
