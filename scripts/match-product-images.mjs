import fs from 'node:fs';
import path from 'node:path';

const imagesPath = 'C:/Users/Administrator/Downloads/المخزون للفروع(صور المنتجات).csv';
const defsPath = 'C:/Users/Administrator/Downloads/Book 92(Sheet2).csv';
const outPath = 'C:/osamadream8-19-main/image-mapping-review.csv';

function parseCsvLine(line) {
  // simple CSV split (no quoted commas expected in these files)
  return line.split(',');
}

function readLines(p) {
  const buf = fs.readFileSync(p);
  // try utf8, fallback cp1256 via latin1 then map? easier: decode as utf8 and also keep raw for SK extraction
  let text = buf.toString('utf8');
  // if lots of replacement chars, still ok for ASCII SK codes
  return text.split(/\r?\n/).filter(Boolean);
}

const imgLines = readLines(imagesPath);
const defLines = readLines(defsPath);

const defs = [];
for (let i = 1; i < defLines.length; i++) {
  const cols = parseCsvLine(defLines[i]);
  const itemNumber = (cols[0] || '').trim();
  const col2 = (cols[1] || '').trim();
  const nameRaw = (cols[2] || '').trim();
  // extract SK code from col1/2/3
  const sk = (col2.match(/SK-\d+/i) || nameRaw.match(/SK-\d+/i) || itemNumber.match(/SK-\d+/i) || [null])[0];
  const skNorm = sk ? sk.toUpperCase() : null;
  if (skNorm) defs.push({ sk: skNorm, itemNumber, col2, nameRaw });
}

const defBySk = new Map();
for (const d of defs) {
  if (!defBySk.has(d.sk)) defBySk.set(d.sk, []);
  defBySk.get(d.sk).push(d);
}

const rows = [];
let matched = 0, notFound = 0, ambiguous = 0, noCode = 0;
for (let i = 1; i < imgLines.length; i++) {
  const cols = parseCsvLine(imgLines[i]);
  const imageName = (cols[0] || '').trim();
  const drivePath = (cols[1] || '').trim();
  const url = (cols[2] || '').trim();
  const fileId = (cols[3] || '').trim();
  const m = imageName.match(/SK-\d+/i);
  const sk = m ? m[0].toUpperCase() : '';
  if (!sk) {
    noCode++;
    rows.push({ imageName, url, fileId, extracted_sk: '', matched_item: '', matched_name: '', status: 'no_code', candidates: 0 });
    continue;
  }
  const candidates = defBySk.get(sk) || [];
  if (candidates.length === 1) {
    matched++;
    rows.push({ imageName, url, fileId, extracted_sk: sk, matched_item: candidates[0].itemNumber, matched_name: candidates[0].nameRaw, status: 'matched', candidates: 1 });
  } else if (candidates.length > 1) {
    ambiguous++;
    rows.push({ imageName, url, fileId, extracted_sk: sk, matched_item: candidates.map(c=>c.itemNumber).join('|'), matched_name: candidates.map(c=>c.nameRaw).join('|'), status: 'ambiguous', candidates: candidates.length });
  } else {
    notFound++;
    rows.push({ imageName, url, fileId, extracted_sk: sk, matched_item: '', matched_name: '', status: 'not_found', candidates: 0 });
  }
}

const header = ['image_name','image_url','file_id','extracted_sk','matched_item_number','matched_name_raw','status','candidate_count'];
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const out = [header.join(','), ...rows.map(r => [r.imageName,r.url,r.fileId,r.extracted_sk,r.matched_item,r.matched_name,r.status,r.candidates].map(esc).join(','))].join('\n');
fs.writeFileSync(outPath, '\uFEFF' + out, 'utf8');

console.log(JSON.stringify({ images: imgLines.length-1, defs: defLines.length-1, defsWithSk: defs.length, uniqueDefSk: defBySk.size, matched, ambiguous, notFound, noCode, outPath }));
