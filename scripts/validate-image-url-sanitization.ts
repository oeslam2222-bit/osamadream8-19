/**
 * فحص تنظيف روابط الصور.
 *
 * المصدر الحقيقي للمشكلة: خانة الصورة الفاضية في شيت الإكسل بتتحول `0`،
 * والسيل ده كان بيتخزن كـ`imageUrl`، فيتولد <img src="0"> ويطلب البراوزر
 * `/0` ويرجع 404 في الكونسول على كل صفحة فيها كتالوج.
 *
 * التشغيل: bun scripts/validate-image-url-sanitization.ts
 */
import { cleanGoogleSheetImageUrl } from '../src/services/excelService';
import { sanitizeStoredImageUrl } from '../src/context/appContextHelpers';

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

// 1) قيم مش روابط: لازم ترجع فاضية (مش "0" ولا "-")
check('sheet: zero', cleanGoogleSheetImageUrl('0'), '');
check('sheet: dash', cleanGoogleSheetImageUrl('-'), '');
check('sheet: no image text', cleanGoogleSheetImageUrl('لا يوجد'), '');
check('sheet: plain word', cleanGoogleSheetImageUrl('blank'), '');

// 2) روابط حقيقية: لازم تعدي زي ما هي / تتحول لرابط مباشر
check(
  'sheet: direct https',
  cleanGoogleSheetImageUrl('https://res.cloudinary.com/demo/image/upload/v1/p.jpg'),
  'https://res.cloudinary.com/demo/image/upload/v1/p.jpg'
);
check(
  'sheet: =IMAGE()',
  cleanGoogleSheetImageUrl('=IMAGE("https://cdn.example.com/a.jpg")'),
  'https://cdn.example.com/a.jpg'
);
check(
  'sheet: drive file link',
  cleanGoogleSheetImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view'),
  'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345=w800'
);
check('sheet: empty', cleanGoogleSheetImageUrl(''), '');

// 3) نفس القاعدة على المخزون المحفوظ (Supabase / IndexedDB)
check('stored: zero', sanitizeStoredImageUrl('0'), undefined);
check('stored: undefined', sanitizeStoredImageUrl(undefined), undefined);
check('stored: spaces', sanitizeStoredImageUrl('   '), undefined);
check('stored: https ok', sanitizeStoredImageUrl('https://x.test/a.png'), 'https://x.test/a.png');
check('stored: svg data ok', sanitizeStoredImageUrl('data:image/svg+xml;utf8,<svg/>'), 'data:image/svg+xml;utf8,<svg/>');

console.log(fail.length === 0 ? '\nكل الفحوصات نجحت ✅' : `\nفشل ${fail.length}: ${fail.join(' | ')}`);
if (fail.length > 0) process.exit(1);
