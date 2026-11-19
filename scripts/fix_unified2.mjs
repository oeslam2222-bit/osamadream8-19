import fs from 'fs';
const filePath = 'C:/osamadream8-19-main/src/services/excelService.ts';
let src = fs.readFileSync(filePath, 'utf8');

// Replace the block
const old = `    const rawName = getVal(colMap.name);
    const rawCode = getVal(colMap.code);
    const rawUnifiedCode = getVal(colMap.unifiedCode);

    const productCode = cleanProductCode(rawCode);
    const fallbackCode = cleanProductCode(rawUnifiedCode.replace(/^#/, '').trim());
    const extractedFromTitle = (!productCode && !fallbackCode) ? extractCodeFromProductName(rawName) : '';
    const code = productCode || fallbackCode || extractedFromTitle;

    if (!code) {
      const label = (rawName || ('Row ' + r + 1)).slice(0, 40);
      codeLessRowCount += 1;
      if (codeLessSample.length < 5) codeLessSample.push(label);
      errors.push('���"���? ' + (r + 1) + ' (' + label + ') �"�� �S���^�S ���"�% ��^�� �.�ŝ���/��^�� �.�^��� �^������> ���. �������S��.');
    }

    // ���ŝ��� ���"��^�� ���"�.�^���: code + size + color (�.�� ���^���S�� ���"�?���������)
    const _uSize = (sizeVal || '').toString().trim();
    const _uColor = (colorVal || '').toString().trim();
    let unifiedCode = code ? code : '';
    if (code) {
      const parts = [code];
      if (_uSize) parts.push(_uSize);
      if (_uColor) parts.push(_uColor);
      unifiedCode = parts.join('_').replace(/\\s+/g, '_');
    } else {
      unifiedCode = '';
    }

    const fallbackName = getVal(colMap.familyName) || getVal(colMap.itemGroup) || \`�����? ����S�. \${code}\`;
    const name = rawName || fallbackName;`;
if (!src.includes(old)) {
  console.log('NOT FOUND');
  process.exit(1);
}
const rep = `    const rawName = getVal(colMap.name);
    const rawCode = getVal(colMap.code);
    const rawUnifiedCode = getVal(colMap.unifiedCode);
    const sizeVal = getVal(colMap.size) || '';
    const colorVal = getVal(colMap.color) || '';

    const productCode = cleanProductCode(rawCode);
    const fallbackCode = cleanProductCode(rawUnifiedCode.replace(/^#/, '').trim());
    const extractedFromTitle = (!productCode && !fallbackCode) ? extractCodeFromProductName(rawName) : '';
    const code = productCode || fallbackCode || extractedFromTitle;

    if (!code) {
      const label = (rawName || ('Row ' + (r + 1))).slice(0, 40);
      codeLessRowCount += 1;
      if (codeLessSample.length < 5) codeLessSample.push(label);
      errors.push('الصف ' + (r + 1) + ' بدون كود منتج واضح وتم تخطيه.');
    }

    // بناء الكود الموحد: code + size + color
    const _uSize = (sizeVal || '').toString().trim();
    const _uColor = (colorVal || '').toString().trim();
    let unifiedCode = code ? code : '';
    if (code) {
      const parts = [code];
      if (_uSize) parts.push(_uSize);
      if (_uColor) parts.push(_uColor);
      unifiedCode = parts.join('_').replace(/\\s+/g, '_');
    } else {
      unifiedCode = '';
    }

    const fallbackName = getVal(colMap.familyName) || getVal(colMap.itemGroup) || ('صنف ' + (code || ''));
    const name = rawName || fallbackName;`;
src = src.replace(old, rep);
fs.writeFileSync(filePath, src, 'utf8');
console.log('done');
