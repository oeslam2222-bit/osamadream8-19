import fs from 'node:fs';
import XLSX from 'xlsx-js-style';

const imagesWb = XLSX.readFile('C:/Users/Administrator/Downloads/المخزون للفروع.xlsx');
const defsWb = XLSX.readFile('C:/Users/Administrator/Downloads/Book 92.xlsx');

const imgSheet = imagesWb.Sheets[imagesWb.SheetNames[0]]; // صور المنتجات
const defSheet = defsWb.Sheets[defsWb.SheetNames[0]]; // Sheet2

const imgRows = XLSX.utils.sheet_to_json(imgSheet, { header: 1, defval: '' });
const defRows = XLSX.utils.sheet_to_json(defSheet, { header: 1, defval: '' });

const defs = [];
for (let i = 1; i < defRows.length; i++) {
  const r = defRows[i];
  const itemNumber = String(r[0] ?? '').trim();
  const unifiedCode = String(r[1] ?? '').trim();
  const name = String(r[2] ?? '').trim();
  const size = String(r[3] ?? '').trim();
  const color = String(r[4] ?? '').trim();
  const group = String(r[5] ?? '').trim();
  const family = String(r[6] ?? '').trim();
  const sk = (unifiedCode.match(/SK-\d+/i) || name.match(/SK-\d+/i) || itemNumber.match(/SK-\d+/i) || [null])[0];
  const skNorm = sk ? sk.toUpperCase() : null;
  if (skNorm) defs.push({ sk: skNorm, itemNumber, unifiedCode, name, size, color, group, family });
}

const defBySk = new Map();
for (const d of defs) {
  if (!defBySk.has(d.sk)) defBySk.set(d.sk, []);
  defBySk.get(d.sk).push(d);
}

const outRows = [[
  'image_name','image_url','file_id','extracted_sk','matched_item_number','matched_unified_code','matched_name','size','color','item_group','family','status','candidate_count'
]];

let matched = 0, ambiguous = 0, notFound = 0, noCode = 0;
for (let i = 1; i < imgRows.length; i++) {
  const r = imgRows[i];
  const imageName = String(r[0] ?? '').trim();
  const drivePath = String(r[1] ?? '').trim();
  const url = String(r[2] ?? '').trim();
  const fileId = String(r[3] ?? '').trim();
  if (!imageName && !url) continue;
  const m = imageName.match(/SK-\d+/i);
  const sk = m ? m[0].toUpperCase() : '';
  if (!sk) {
    noCode++;
    outRows.push([imageName, url, fileId, '', '', '', '', '', '', '', '', 'no_code', 0]);
    continue;
  }
  const candidates = defBySk.get(sk) || [];
  if (candidates.length === 1) {
    const c = candidates[0];
    matched++;
    outRows.push([imageName, url, fileId, sk, c.itemNumber, c.unifiedCode, c.name, c.size, c.color, c.group, c.family, 'matched', 1]);
  } else if (candidates.length > 1) {
    ambiguous++;
    outRows.push([imageName, url, fileId, sk, candidates.map(c=>c.itemNumber).join(' | '), candidates.map(c=>c.unifiedCode).join(' | '), candidates.map(c=>c.name).join(' | '), '', '', '', '', 'ambiguous', candidates.length]);
  } else {
    notFound++;
    outRows.push([imageName, url, fileId, sk, '', '', '', '', '', '', '', 'not_found', 0]);
  }
}

const ws = XLSX.utils.aoa_to_sheet(outRows);
ws['!cols'] = [
  {wch:45},{wch:60},{wch:35},{wch:12},{wch:16},{wch:28},{wch:45},{wch:10},{wch:10},{wch:14},{wch:18},{wch:12},{wch:8}
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Review');
XLSX.writeFile(wb, 'C:/osamadream8-19-main/image-mapping-review.xlsx');

// also CSV utf8-bom
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = '\uFEFF' + outRows.map(r => r.map(esc).join(',')).join('\n');
fs.writeFileSync('C:/osamadream8-19-main/image-mapping-review.csv', csv, 'utf8');

console.log(JSON.stringify({ images: imgRows.length-1, defs: defRows.length-1, defsWithSk: defs.length, uniqueDefSk: defBySk.size, matched, ambiguous, notFound, noCode }));
