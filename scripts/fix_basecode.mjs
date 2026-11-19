import fs from 'fs';
const filePath = 'C:/osamadream8-19-main/src/services/excelService.ts';
let src = fs.readFileSync(filePath, 'utf8');
src = src.replace(/name:\s*name\s*\|\|\s*`[^`]*\$\{baseCode\}[^`]*`,/, "name: name || `صنف ${code || unifiedCode || ''}`,");
fs.writeFileSync(filePath, src, 'utf8');
console.log('done');
