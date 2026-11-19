import fs from 'fs';
const filePath = 'C:/osamadream8-19-main/src/services/excelService.ts';
let src = fs.readFileSync(filePath, 'utf8');

// Replace from "  if (codeLessRowCount > 0) {" to the end of that return block
const start = src.indexOf('  if (codeLessRowCount > 0) {');
if (start < 0) { console.log('no start'); process.exit(1); }
const endMarker = '  return {\n    products,\n    errors,\n    totalRows: products.length,\n  };\n}';
const end = src.indexOf(endMarker, start);
if (end < 0) { console.log('no end'); process.exit(1); }
const end2 = end + endMarker.length;

const replacement = `  // إزالة التكرار حسب الكود الموحد
  const seenUnified = new Map();
  let dupN = 0;
  for (const p of products) {
    const key = (p.unifiedCode || p.code || '').toString().toLowerCase().trim();
    if (!key) {
      seenUnified.set('__no_key_' + (dupN++), p);
      continue;
    }
    if (!seenUnified.has(key)) {
      seenUnified.set(key, p);
    } else {
      dupN++;
    }
  }
  const dedupedProducts = Array.from(seenUnified.values());
  if (dupN > 0) {
    errors.push('تم تجاهل ' + dupN + ' صف مكرر حسب الكود الموحد لتجنب تعارض الحفظ.');
  }
  if (codeLessRowCount > 0) {
    errors.push('تنبيه: ' + codeLessRowCount + ' صف بدون كود منتج تم تخطيه.');
  }
  return {
    products: dedupedProducts,
    errors,
    totalRows: dedupedProducts.length,
  };
}`;
const newSrc = src.slice(0, start) + replacement + src.slice(end2);
fs.writeFileSync(filePath, newSrc, 'utf8');
console.log('done');
