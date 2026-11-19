import fs from 'fs';

const filePath = 'C:/osamadream8-19-main/src/services/excelService.ts';
const src = fs.readFileSync(filePath, 'utf8');

// Replace the tail section
const needle = `  if (codeLessRowCount > 0) {
    errors.push(
      \`�.�"����: \${codeLessRowCount} ���? �.�?�S���^�� ��^�� �����? (\${codeLessSample.join('�O ')}` +
        `\${codeLessRowCount > codeLessSample.length ? ' �?�' : ''}). ` +
        '��럝��� ���.�^�� ����^�� ���"�.�ŝ����� �?�S ���"���S�� ���"����� ���"���.�� �S���'�% �.���.�^��.'
    );
  }

  return {
    products,
    errors,
    totalRows: products.length,
  };`;

const replacement = `  // إزالة التكرار حسب الكود الموحد (unifiedCode)
  const seenUnified = new Map();
  const dupCount = { n: 0 };
  for (const p of products) {
    const key = (p.unifiedCode || p.code || '').toString().toLowerCase().trim();
    if (!key) {
      seenUnified.set('__no_key_' + dupCount.n++, p);
      continue;
    }
    if (!seenUnified.has(key)) {
      seenUnified.set(key, p);
    } else {
      dupCount.n++;
    }
  }
  const dedupedProducts = Array.from(seenUnified.values());
  if (dupCount.n > 0) {
    errors.push('تم تجاهل ' + dupCount.n + ' صف مكرر حسب الكود الموحد لتجنب تعارض الحفظ في قاعدة البيانات.');
  }
  if (codeLessRowCount > 0) {
    errors.push('تنبيه: ' + codeLessRowCount + ' صف تم تخطيه لعدم وجود كود منتج واضح.');
  }
  return {
    products: dedupedProducts,
    errors,
    totalRows: dedupedProducts.length,
  };`;

if (!src.includes(needle)) {
  console.error('NOT FOUND');
  process.exit(1);
}
const newSrc = src.replace(needle, replacement);
fs.writeFileSync(filePath, newSrc, 'utf8');
console.log('OK');
