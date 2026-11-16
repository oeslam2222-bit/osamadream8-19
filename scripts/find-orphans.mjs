import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const ENTRIES = ['src/main.tsx', 'src/designPreview.tsx'];

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full.replace(/\\/g, '/'));
  }
})(ROOT);

const fileSet = new Set(files);

function resolve(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  // Vite allows omitting an extension that differs in case on Windows.
  const lower = base.toLowerCase();
  for (const candidate of candidates) {
    if (candidate.toLowerCase() === lower || fileSet.has(candidate)) return candidate;
  }
  return null;
}

const importRe = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const edges = new Map();
const unresolved = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const deps = new Set();
  for (const re of [importRe, dynamicRe]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src))) {
      const resolved = resolve(match[1], file);
      if (resolved) deps.add(resolved);
      else if (match[1].startsWith('.') && /\.(ts|tsx)$/.test(match[1])) unresolved.push(`${file} -> ${match[1]}`);
    }
  }
  edges.set(file, deps);
}

const reachable = new Set();
const queue = [...ENTRIES.filter((entry) => fileSet.has(entry))];
for (const entry of queue) reachable.add(entry);
while (queue.length) {
  const current = queue.pop();
  for (const dep of edges.get(current) || []) {
    if (!reachable.has(dep)) {
      reachable.add(dep);
      queue.push(dep);
    }
  }
}

const orphanCandidates = [...fileSet].filter((file) => !reachable.has(file));

/** هل الملف أو اسم المكوّن مذكور نصًّا خارج نفسه؟ (حماية من الاستيراد بالاسم) */
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

console.log(`files: ${files.length} | reachable: ${reachable.size} | unreachable: ${orphanCandidates.length}`);
if (unresolved.length) console.log(`unresolved relative imports: ${unresolved.length}\n${unresolved.join('\n')}`);

const safe = [];
const kept = [];
for (const file of orphanCandidates.sort()) {
  const refs = nameReferences(file);
  if (refs === 0) safe.push(file);
  else kept.push(`${file}  (mentioned ${refs}x)`);
}

console.log('\n--- deletable (unreachable + name never referenced) ---');
console.log(safe.join('\n') || '(none)');
console.log('\n--- unreachable but name mentioned somewhere (kept) ---');
console.log(kept.join('\n') || '(none)');
