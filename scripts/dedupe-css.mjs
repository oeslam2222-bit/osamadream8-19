import fs from 'node:fs';

const file = process.argv[2] || 'src/styles/identity.css';
const css = fs.readFileSync(file, 'utf8');

const blocks = [];
let i = 0;
let ctxStack = [];
let selStart = 0;

while (i < css.length) {
  const ch = css[i];

  // comments
  if (ch === '/' && css[i + 1] === '*') {
    const end = css.indexOf('*/', i + 2);
    i = end < 0 ? css.length : end + 2;
    continue;
  }

  // strings
  if (ch === '"' || ch === "'") {
    const quote = ch;
    i += 1;
    while (i < css.length && css[i] !== quote) {
      if (css[i] === '\\') i += 1;
      i += 1;
    }
    i += 1;
    continue;
  }

  if (ch === '{') {
    const prelude = css.slice(selStart, i);
    const isAtRule = prelude.trim().startsWith('@');
    ctxStack.push({ prelude, type: isAtRule ? 'at' : 'rule', start: selStart });
    selStart = i + 1;
    i += 1;
    continue;
  }

  if (ch === '}') {
    const node = ctxStack.pop();
    if (node && node.type === 'rule') {
      blocks.push({
        ctx: ctxStack.map((c) => c.prelude.trim().replace(/\s+/g, ' ')).join('||'),
        selector: node.prelude.trim().replace(/\s+/g, ' '),
        body: css.slice(node.start + 1, i),
        start: node.start,
        end: i + 1,
      });
    }
    selStart = i + 1;
    i += 1;
    continue;
  }

  i += 1;
}

const declarations = (body) =>
  body
    .split(/;(?![^(]*\))/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

const groups = new Map();
for (const block of blocks) {
  const key = `${block.ctx} ## ${block.selector}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(block);
}

const redundant = [];
for (const list of groups.values()) {
  if (list.length < 2) continue;
  for (let n = 0; n < list.length - 1; n += 1) {
    const laterDeclarations = new Set();
    for (let m = n + 1; m < list.length; m += 1) {
      for (const declaration of declarations(list[m].body)) laterDeclarations.add(declaration);
    }
    const own = declarations(list[n].body);
    // Only drop a block when every one of its declarations is re-declared later:
    // anything unique could still be winning, so it must stay.
    if (own.length > 0 && own.every((declaration) => laterDeclarations.has(declaration))) {
      redundant.push(list[n]);
    }
  }
}

redundant.sort((a, b) => b.start - a.start);
let output = css;
for (const block of redundant) {
  let start = block.start;
  while (start > 0 && /\s/.test(output[start - 1])) start -= 1;
  output = output.slice(0, start) + output.slice(block.end);
}

fs.writeFileSync(file, output);
console.log(`blocks: ${blocks.length} | removed: ${redundant.length}`);
console.log(`size: ${css.length} -> ${output.length} (-${css.length - output.length} bytes)`);
