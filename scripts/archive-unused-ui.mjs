import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const STAMP = process.argv[2] || '2026-11-15';
const ARCHIVE = `_archive/ui-cleanup-${STAMP}`;
const ENTRIES = ['src/main.tsx', 'src/designPreview.tsx'];

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
})(ROOT);

const fileSet = new Set(files);

function resolve(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

const importRe = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const edges = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const deps = new Set();
  for (const re of [importRe, dynamicRe]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src))) {
      const resolved = resolve(match[1], file);
      if (resolved) deps.add(resolved);
    }
  }
  edges.set(file, deps);
}

const reachable = new Set(ENTRIES.filter((entry) => fileSet.has(entry)));
const queue = [...reachable];
while (queue.length) {
  const current = queue.pop();
  for (const dep of edges.get(current) || []) {
    if (!reachable.has(dep)) {
      reachable.add(dep);
      queue.push(dep);
    }
  }
}

function nameReferences(file) {
  const name = path.basename(file).replace(/\.(ts|tsx)$/, '');
  if (['index', 'types', 'vite-env'].includes(name)) return 1;
  const needle = new RegExp(`(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`);
  let refs = 0;
  for (const other of files) {
    if (other === file) continue;
    if (needle.test(fs.readFileSync(other, 'utf8'))) refs += 1;
  }
  return refs;
}

/** نطاق التنظيف: واجهات ومسارات قديمة فقط — لا نلمس الخدمات ولا الاختبارات ولا الأنواع. */
function inScope(file) {
  if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return false;
  if (file.startsWith('src/services/')) return false;
  if (file.startsWith('src/test/')) return false;
  if (file.startsWith('src/context/')) return false;
  if (file.startsWith('src/design-system/tokens/')) return false;
  if (file.startsWith('src/design-system/theme/')) return false;
  if (file === 'src/vite-env.d.ts') return false;
  return (
    file.startsWith('src/components/') ||
    file.startsWith('src/screens/') ||
    file.startsWith('src/design-system/demo/') ||
    file.startsWith('src/design-system/components/') ||
    file === 'src/design-system/sectionIcons.tsx'
  );
}

const victims = [];
for (const file of [...fileSet].sort()) {
  if (reachable.has(file)) continue;
  if (!inScope(file)) continue;
  if (nameReferences(file) > 0) continue;
  victims.push(file);
}

const manifest = [];
for (const file of victims) {
  const target = path.join(ARCHIVE, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(file, target);
  manifest.push({ archived: target.replace(/\\/g, '/'), original: file });
}

fs.mkdirSync(ARCHIVE, { recursive: true });
fs.writeFileSync(
  path.join(ARCHIVE, 'manifest.json'),
  `${JSON.stringify({ archivedAt: new Date().toISOString(), files: manifest }, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(ARCHIVE, 'RESTORE.md'),
  [
    '# أرشيف شاشات ومكوّنات غير مستخدمة',
    '',
    'كل ملف هنا **مش مستورد من أي مكان** في التطبيق (تم التحقق من رسم الاعتماديات',
    'ومن عدم ذكر اسمه في أي ملف آخر)، فتم نقله خارج `src` عشان يخرج من الـbuild',
    'ومن حجم الحزمة، بدون حذف نهائي.',
    '',
    '## إرجاع ملف أو مجموعة',
    '',
    '```bash',
    `node -e "const m=require('./${ARCHIVE}/manifest.json');for(const f of m.files){/* انسخ */}"`,
    '```',
    '',
    'أو ببساطة انسخ الملف من نفس المسار النسبي داخل هذا المجلد إلى جذر المشروع.',
    '',
    '## ملاحظة',
    '',
    'المشروع مش متتبَّع في git (branch بدون أي commit)، فالحذف النهائي كان',
    'هيضيّع الكود. الأرشيف ده هو نقطة الرجوع.',
  ].join('\n'),
);

console.log(`archived: ${manifest.length} files -> ${ARCHIVE}`);
console.log(manifest.map((entry) => entry.original).join('\n'));
