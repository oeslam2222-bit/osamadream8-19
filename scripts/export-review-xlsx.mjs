import fs from 'node:fs';
import XLSX from 'xlsx-js-style';

const csv = fs.readFileSync('C:/osamadream8-19-main/image-mapping-review.csv', 'utf8').replace(/^\uFEFF/, '');
const lines = csv.split(/\r?\n/).filter(Boolean);

function parse(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const rows = lines.map(parse);
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [
  { wch: 45 }, { wch: 60 }, { wch: 35 }, { wch: 12 },
  { wch: 16 }, { wch: 50 }, { wch: 12 }, { wch: 8 },
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Review');
XLSX.writeFile(wb, 'C:/osamadream8-19-main/image-mapping-review.xlsx');
console.log('ok rows', rows.length);