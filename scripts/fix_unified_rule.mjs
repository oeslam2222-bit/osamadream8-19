import fs from 'fs';
import path from 'path';

const filePath = process.argv[2] || 'src/services/excelService.ts';
const src = fs.readFileSync(filePath, 'utf8');

// We need to replace from "// Track code occurrences" (or from "const codeOccurrences") through
// the unifiedCode assignment block. Let us find anchors.
const anchorStart = src.indexOf('// Track code occurrences');
if (anchorStart < 0) {
  console.error('Could not find start anchor');
  process.exit(1);
}

// Find "const unifiedCode =" 
const unifiedCodeIdx = src.indexOf('const unifiedCode =', anchorStart);
if (unifiedCodeIdx < 0) {
  console.error('Could not find unifiedCode assignment');
  process.exit(1);
}
// Find end of that statement (ends with ';' followed by newline and then 'const fallbackName')
const afterUnified = src.indexOf("const fallbackName", unifiedCodeIdx);
if (afterUnified < 0) {
  console.error('Could not find fallbackName after unifiedCode');
  process.exit(1);
}
// Go back to the semicolon of unifiedCode assignment
let endIdx = src.lastIndexOf(';', afterUnified);
if (endIdx < 0 || endIdx < unifiedCodeIdx) {
  console.error('Could not find semicolon for unifiedCode');
  process.exit(1);
}
endIdx += 1; // include semicolon

const replacement = `  // Pre-scan: count code occurrences (for unifiedCode rule)
  const codeCounts: Record<string, number> = {};
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) continue;
    const getValPre = (colIdx: number) => {
      if (colIdx < 0 || row[colIdx] === undefined || row[colIdx] === null) return '';
      return stripPlaceholderText(String(row[colIdx]));
    };
    const rawNamePre = getValPre(colMap.name);
    const rawCodePre = getValPre(colMap.code);
    const rawUnifiedCodePre = getValPre(colMap.unifiedCode);
    const productCodePre = cleanProductCode(rawCodePre);
    const fallbackCodePre = cleanProductCode(rawUnifiedCodePre.replace(/^#/, '').trim());
    const extractedFromTitlePre = (!productCodePre && !fallbackCodePre) ? extractCodeFromProductName(rawNamePre) : '';
    const codePre = productCodePre || fallbackCodePre || extractedFromTitlePre;
    if (codePre) codeCounts[codePre] = (codeCounts[codePre] || 0) + 1;
  }

  const codeOccurrences: Record<string, number> = {};
  let codeLessRowCount = 0;
  const codeLessSample: string[] = [];

  // Loop rows
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) continue;

    const getVal = (colIdx: number) => {
      if (colIdx < 0 || row[colIdx] === undefined || row[colIdx] === null) return '';
      return stripPlaceholderText(String(row[colIdx]));
    };
    const getNum = (colIdx: number, fallback = 0) => {
      if (colIdx < 0 || row[colIdx] === undefined || row[colIdx] === null) return fallback;
      const parsed = parseNumericValue(row[colIdx]);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const rawName = getVal(colMap.name);
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
      errors.push('الصف ' + (r + 1) + ' (' + label + ') لا يحتوي على كود منتج/كود موحد واضح؛ تم تخطيه.');
    }

    let cleanUnified = cleanProductCode(rawUnifiedCode.trim());
    if (cleanUnified && /^drm[-_]?([0-9a-zA-Z]+)$/i.test(cleanUnified)) {
      cleanUnified = cleanUnified.replace(/^drm[-_]?/i, '');
    }
    let unifiedCode;
    const isCodeRepeated = code ? ((codeCounts[code] || 0) > 1) : false;
    if (isCodeRepeated) {
      // كود مكرر: لا نضيف #
      if (cleanUnified) {
        unifiedCode = cleanUnified.startsWith('#') ? cleanUnified.slice(1) : cleanUnified;
      } else if (code) {
        unifiedCode = code;
      }
    } else {
      // كود غير مكرر: نضيف # دائماً
      if (code) {
        unifiedCode = '#' + code;
      } else if (cleanUnified) {
        unifiedCode = cleanUnified.startsWith('#') ? cleanUnified : ('#' + cleanUnified);
      }
    }`;

const newSrc = src.slice(0, anchorStart) + replacement + src.slice(endIdx);
fs.writeFileSync(filePath, newSrc, 'utf8');
console.log('Done. Replaced section from', anchorStart, 'to', endIdx);
