import fs from 'node:fs';
import XLSX from 'xlsx-js-style';

const wb = XLSX.readFile('C:/osamadream8-19-main/image-mapping-review.xlsx');
const ws = wb.Sheets['Review'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const header = rows[0];
const data = rows.slice(1).map(r => ({
  image_name: r[0], image_url: r[1], file_id: r[2], extracted_sk: r[3],
  matched_item_number: r[4], matched_unified_code: r[5], matched_name: r[6],
  size: r[7], color: r[8], item_group: r[9], family: r[10],
  status: r[11], candidate_count: r[12],
})).filter(r => r.image_url || r.image_name);

// Only reviewable items by default? include all, but UI can filter.
const json = JSON.stringify(data).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>مراجعة ربط صور المنتجات</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;background:#f5f7fb;margin:0;color:#111}
  .bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 16px;z-index:10;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .bar select,.bar button,.bar input{padding:8px 10px;font-size:14px}
  .bar button{cursor:pointer}
  .stats{margin-right:auto;font-weight:bold}
  .wrap{max-width:1200px;margin:16px auto;padding:0 12px}
  .card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px;margin-bottom:12px;display:grid;grid-template-columns:320px 1fr;gap:14px}
  .imgbox{background:#fafafa;border:1px solid #eee;border-radius:8px;min-height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .imgbox img{max-width:100%;max-height:360px;display:block}
  .meta{font-size:14px;line-height:1.7}
  .meta .k{color:#666}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#eee}
  .pill.matched{background:#d9f5df}.pill.ambiguous{background:#fff0c2}.pill.not_found{background:#ffd9d9}.pill.no_code{background:#e9ecef}
  .actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
  .actions button{padding:8px 14px;border:1px solid #bbb;background:#fff;border-radius:8px;cursor:pointer;font-weight:bold}
  .actions button.ok.active{background:#1b8f3a;color:#fff;border-color:#1b8f3a}
  .actions button.no.active{background:#c62828;color:#fff;border-color:#c62828}
  .actions button.skip.active{background:#555;color:#fff;border-color:#555}
  .row{display:flex;gap:8px;align-items:center;margin-top:8px}
  textarea{width:100%;min-height:54px;padding:8px;font:inherit}
  .small{font-size:12px;color:#666;word-break:break-all}
  @media (max-width:800px){.card{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="bar">
  <label>الحالة
    <select id="statusFilter">
      <option value="review">للمراجعة (matched+ambiguous+not_found)</option>
      <option value="all">الكل</option>
      <option value="matched">matched</option>
      <option value="ambiguous">ambiguous</option>
      <option value="not_found">not_found</option>
      <option value="no_code">no_code</option>
    </select>
  </label>
  <label>قرار
    <select id="decisionFilter">
      <option value="all">كل القرارات</option>
      <option value="">لم يُراجع</option>
      <option value="approved">مطابق</option>
      <option value="rejected">غير مطابق</option>
      <option value="skipped">تخطي</option>
    </select>
  </label>
  <label>بحث <input id="q" placeholder="SK / اسم / رقم صنف" /></label>
  <button id="prev">السابق</button>
  <button id="next">التالي</button>
  <button id="exportCsv">تصدير القرارات CSV</button>
  <button id="saveLocal">حفظ محلي</button>
  <button id="loadLocal">تحميل المحفوظ</button>
  <div class="stats" id="stats"></div>
</div>
<div class="wrap">
  <div id="list"></div>
</div>
<script>
const DATA = ${json};
const decisions = {}; // key: file_id or image_url -> {decision,note}
const keyOf = (r) => r.file_id || r.image_url || r.image_name;
let filtered = [];
let index = 0;

function loadSaved(){
  try{ const raw=localStorage.getItem('imageReviewDecisions'); if(raw) Object.assign(decisions, JSON.parse(raw)); }catch{}
}
function saveSaved(){
  localStorage.setItem('imageReviewDecisions', JSON.stringify(decisions));
  alert('تم الحفظ في المتصفح');
}
function getDecision(r){ return decisions[keyOf(r)]?.decision || ''; }
function getNote(r){ return decisions[keyOf(r)]?.note || ''; }
function setDecision(r, decision){
  const k=keyOf(r); decisions[k]=decisions[k]||{}; decisions[k].decision=decision; render();
}
function setNote(r, note){
  const k=keyOf(r); decisions[k]=decisions[k]||{}; decisions[k].note=note;
}

function applyFilters(){
  const sf=document.getElementById('statusFilter').value;
  const df=document.getElementById('decisionFilter').value;
  const q=document.getElementById('q').value.trim().toLowerCase();
  filtered = DATA.filter(r => {
    if(sf==='review'){ if(!['matched','ambiguous','not_found'].includes(r.status)) return false; }
    else if(sf!=='all' && r.status!==sf) return false;
    const d=getDecision(r);
    if(df==='all'){} else if(df==='' && d) return false; else if(df!=='' && d!==df) return false;
    if(q){
      const hay=[r.extracted_sk,r.matched_item_number,r.matched_name,r.image_name,r.matched_unified_code].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  if(index>=filtered.length) index=Math.max(0,filtered.length-1);
  updateStats();
}
function updateStats(){
  const total=DATA.length;
  const approved=Object.values(decisions).filter(d=>d.decision==='approved').length;
  const rejected=Object.values(decisions).filter(d=>d.decision==='rejected').length;
  document.getElementById('stats').textContent =
    \`المعروض: \${filtered.length} / \${total} | مطابق: \${approved} | غير مطابق: \${rejected}\`;
}

function card(r, i){
  const d=getDecision(r), note=getNote(r);
  return \`<div class="card">
    <div class="imgbox">\${r.image_url ? \`<img loading="lazy" src="\${r.image_url}" onerror="this.replaceWith(document.createTextNode('تعذر تحميل الصورة'))">\` : '<span>لا يوجد رابط</span>'}</div>
    <div class="meta">
      <div><span class="pill \${r.status}">\${r.status}</span> <span class="k">#\${i+1}</span></div>
      <div><span class="k">الكود المستخرج:</span> <b>\${r.extracted_sk || '-'}</b></div>
      <div><span class="k">الصنف المطابق:</span> <b>\${r.matched_item_number || '-'}</b> — \${r.matched_name || '-'}</div>
      <div><span class="k">الكود الموحد:</span> \${r.matched_unified_code || '-'} | <span class="k">المجموعة:</span> \${r.item_group || '-'} | <span class="k">العائلة:</span> \${r.family || '-'}</div>
      <div class="small"><span class="k">الصورة:</span> \${r.image_name || ''}</div>
      <div class="small"><span class="k">URL:</span> <a href="\${r.image_url}" target="_blank">فتح</a> — \${r.image_url || ''}</div>
      <div class="actions">
        <button class="ok \${d==='approved'?'active':''}" onclick="window.__set('\${keyOf(r).replace(/'/g,"\\'")}', 'approved')">مطابق ✅</button>
        <button class="no \${d==='rejected'?'active':''}" onclick="window.__set('\${keyOf(r).replace(/'/g,"\\'")}', 'rejected')">غير مطابق ❌</button>
        <button class="skip \${d==='skipped'?'active':''}" onclick="window.__set('\${keyOf(r).replace(/'/g,"\\'")}', 'skipped')">تخطي</button>
      </div>
      <div class="row"><textarea placeholder="ملاحظة (اختياري)" onchange="window.__note('\${keyOf(r).replace(/'/g,"\\'")}', this.value)">\${(note||'').replace(/</g,'&lt;')}</textarea></div>
    </div>
  </div>\`;
}

window.__set = (k, decision) => { decisions[k]=decisions[k]||{}; decisions[k].decision=decision; render(); };
window.__note = (k, note) => { decisions[k]=decisions[k]||{}; decisions[k].note=note; };

function render(){
  applyFilters();
  const list=document.getElementById('list');
  const pageSize=20;
  const start=index;
  const slice=filtered.slice(start,start+pageSize);
  list.innerHTML = slice.length ? slice.map((r,i)=>card(r,start+i)).join('') : '<div class="card"><div>لا توجد عناصر.</div></div>';
  updateStats();
}

document.getElementById('statusFilter').onchange=()=>{index=0;render();};
document.getElementById('decisionFilter').onchange=()=>{index=0;render();};
document.getElementById('q').oninput=()=>{index=0;render();};
document.getElementById('next').onclick=()=>{index=Math.min(filtered.length-1,index+20);render();};
document.getElementById('prev').onclick=()=>{index=Math.max(0,index-20);render();};
document.getElementById('saveLocal').onclick=saveSaved;
document.getElementById('loadLocal').onclick=()=>{loadSaved();render();};
document.getElementById('exportCsv').onclick=()=>{
  const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const header=['file_id','image_name','image_url','extracted_sk','matched_item_number','matched_name','status','decision','note'];
  const lines=[header.join(',')];
  for(const r of DATA){ const k=keyOf(r); const d=decisions[k]||{}; lines.push([r.file_id,r.image_name,r.image_url,r.extracted_sk,r.matched_item_number,r.matched_name,r.status,d.decision||'',d.note||''].map(esc).join(',')); }
  const blob=new Blob(['\\uFEFF'+lines.join('\\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='image-review-decisions.csv'; a.click();
};

loadSaved(); render();
</script>
</body>
</html>`;

fs.writeFileSync('C:/osamadream8-19-main/image-mapping-review.html', html, 'utf8');
console.log('ok', data.length);