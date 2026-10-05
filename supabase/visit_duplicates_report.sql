-- =============================================================================
-- تقرير المكرر في الزيارات — قراءة فقط، ما بيحذفش ولا يعدّلش حاجة
-- =============================================================================
-- الاستخدام: انسخه في Supabase SQL Editor واضغط Run. اقرا النتيجة.
--
-- ليش ده مهم: منع الازدواج شغال دلوقتي في التطبيق، بس فيه سجلات اتسجلت
-- قبله. كل سطر مكرر = عدّاد `visit_count_2026` زائد علىcustomers table،
-- ومبلغ تحصيل اتخصم مرتين من رصيد العميل في التقارير.
--
-- ملاحظة مهمة: التقرير بيقولك **مين** المكرر وتاريخه ونتيجة كل واحد فيهم،
-- عشان انت اللي تقرر. الملف ده **ما فيهش DELETE ولا UPDATE من أي نوع**.
-- =============================================================================
-- 1) ملخص: كام صف مكرر في كل
--    متكرّر = نفس customer_id + نفس date في أكثر من سطر.
WITH dupes AS (
  SELECT customer_id, date::date AS visit_day
  FROM public.visits
  WHERE customer_id IS NOT NULL
    AND date IS NOT NULL
  GROUP BY customer_id, date::date
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM public.visits)        AS total_visits,
  COUNT(*)                                    AS rows_in_duplicate_groups,
  COUNT(*) - COUNT(DISTINCT (d.customer_id, d.visit_day))
                                             AS extra_duplicate_rows,
  (SELECT COUNT(*) FROM dupes)                AS affected_customers,
  ROUND(
    100.0 * (COUNT(*) - COUNT(DISTINCT (d.customer_id, d.visit_day)))
      / NULLIF((SELECT COUNT(*) FROM public.visits), 0),
    2
  )                                           AS duplicate_percent
FROM dupes d
JOIN public.visits v
  ON v.customer_id = d.customer_id
 AND v.date::date   = d.visit_day;


-- 2) القائمة الكاملة: كل مجموعة مكررة، وكل سطر فيها
--    رتّبهم بالأقدم فوق عشان تشوف أي واحد النسخة الأصلية
WITH dupes AS (
  SELECT customer_id, date::date AS visit_day
  FROM public.visits
  WHERE customer_id IS NOT NULL
    AND date IS NOT NULL
  GROUP BY customer_id, date::date
  HAVING COUNT(*) > 1
)
SELECT
  v.customer_id,
  v.customer_name,
  v.date::date              AS visit_day,
  COUNT(*) OVER (PARTITION BY v.customer_id, v.date::date) AS rows_same_day,
  v.id,
  v.created_at,
  v.rep_name,
  v.status,
  v.outcome,
  v.collected_amount,
  v.is_return,
  v.return_value,
  v.review_status
FROM public.visits v
JOIN dupes d
  ON d.customer_id = v.customer_id
 AND d.visit_day   = v.date::date
ORDER BY v.customer_id, v.date::date, v.created_at;


-- 3) الأثر المالي: المبلغ اللي اتخصم زيادة بسبب التكرار
--    (لكل مجموعة، المبلغ الإجمالي ناقص قيمة سطر واحد = الفرق المزدوج)
WITH dupes AS (
  SELECT customer_id, date::date AS visit_day
  FROM public.visits
  WHERE customer_id IS NOT NULL AND date IS NOT NULL
  GROUP BY customer_id, date::date
  HAVING COUNT(*) > 1
)
SELECT
  d.customer_id,
  ANY_VALUE(v.customer_name) AS customer_name,
  d.visit_day,
  COUNT(*)                        AS rows_same_day,
  SUM(COALESCE(v.collected_amount, 0)) AS collected_total,
  SUM(COALESCE(v.collected_amount, 0)) - MAX(COALESCE(v.collected_amount, 0))
                                     AS over_deducted_min,
  SUM(COALESCE(v.return_value, 0)) AS return_total,
  SUM(COALESCE(v.return_value, 0)) - MAX(COALESCE(v.return_value, 0))
                                AS return_over_counted_min
FROM dupes d
JOIN public.visits v
  ON v.customer_id = d.customer_id
 AND v.date::date   = d.visit_day
GROUP BY d.customer_id, d.visit_day
ORDER BY return_over_counted_min DESC, over_deducted_min DESC;


-- 4) أثر الازدواج على العدّاد المحفوظ في جدول customers
--    (visit_count_2026 بيأخذ أكبر قيمة، فالزيارات المكررة هي اللي عدّلت الرقم)
WITH dupes AS (
  SELECT customer_id, date::date AS visit_day
  FROM public.visits
  WHERE customer_id IS NOT NULL AND date IS NOT NULL
  GROUP BY customer_id, date::date
  HAVING COUNT(*) > 1
)
SELECT
  c.id,
  c.name,
  c.visit_count_2026              AS stored_count,
  COUNT(v.id)                     AS actual_visits_2026,
  c.visit_count_2026 - COUNT(v.id) AS inflated_by
FROM public.customers c
JOIN dupes d ON d.customer_id = c.id
JOIN public.visits v
  ON v.customer_id = c.id
 AND v.date::date BETWEEN '2026-01-01' AND '2026-12-31'
GROUP BY c.id, c.name, c.visit_count_2026
HAVING c.visit_count_2026 <> COUNT(v.id)
ORDER BY ABS(c.visit_count_2026 - COUNT(v.id)) DESC;


-- =============================================================================
-- الخطوة اللي بعدين (مش نفّذها من الملف ده)
-- =============================================================================
-- بعد ما تقرا الأرقام، عندك 3 اختيارات لكل مجموعة:
--
--   أ) تدمج كل المكرر في سطر واحد (تعدّل سبب/نتيجة الزيارات المكررة
--      وتحذف الزيادة). ده الأصح بس محتاج مراجعة يدوية للسجلات.
--
--   ب) تحذف الصفوف المكررة وتبقي الأقدم. خطر — ممكن نحذف زيارات حقيقية
--      لو اتسجلت مرتين بسبب خطأ في الشبكة مش بسبب تكرار فعلي.
--
--   ج) تسيبهم زي ما هم. التطبيق هيعرضهم، بس الأرقام هتفضل أعلى من
--      الحقيقة في تقرير الزيارات والتحصيل.
--
-- ملاحظة: لو الأرقام دي بتأثر على قرار مالي، راجع (3) الأول — هو اللي بيقولك
-- الرقم اتخصم زيادة قد ايه. متعملش أي حاجة قبل ما تشوفه.
--
-- بعد ما تقرر، ابعتلي ايه اللي اخترته وانفذهولك كـ migration SQL منفصل
-- فيه dry-run أول بيشوف الأرقام قبل أي حذف.
-- =============================================================================