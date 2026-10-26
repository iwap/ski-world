// Kontrollerar att varje fil i js/ bara använder sådant som finns när den laddas.
// Spelet laddas som vanliga <script>-filer i ordningen i js/load-order.txt. En funktion i en senare fil
// finns inte förrän den filen har laddats – så kod som körs direkt vid start får bara använda
// sådant från tidigare filer (eller tidigare i samma fil).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const order = fs.readFileSync(path.join(ROOT, 'js/load-order.txt'), 'utf8').split('\n').filter(Boolean);

// index.html måste ladda filerna i samma ordning
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inHtml = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
if (inHtml.join() !== order.join()) {
  console.error('FEL: index.html laddar inte filerna i samma ordning som js/load-order.txt');
  process.exit(1);
}

// Alla filer ihop (som webbläsaren ser dem), med koll på vilken fil varje del kommer från
let src = '';
const spans = [];
for (const f of order) {
  const text = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').replace(/^'use strict';\n/, '');
  spans.push({ file: f, start: src.length, end: src.length + text.length });
  src += `${text}\n`;
}
const fileAt = (pos) => spans.find((s) => pos >= s.start && pos < s.end).file;
const lineAt = (pos) => src.slice(0, pos).split('\n').length - src.slice(0, spans.find((s) => pos >= s.start && pos < s.end).start).split('\n').length + 1;

const ast = espree.parse(src, { ecmaVersion: 2022, sourceType: 'script', range: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
const globalScope = sm.globalScope;

const items = ast.body.map((node) => ({ node, file: fileAt(node.range[0]) }));
const declared = new Map();
for (const it of items) {
  const n = it.node;
  if (n.type === 'FunctionDeclaration') {
    if (declared.has(n.id.name)) console.warn(`VARNING: ${n.id.name} är deklarerad två gånger`);
    declared.set(n.id.name, { it, kind: 'function', fn: n });
  }
  if (n.type === 'VariableDeclaration') {
    for (const d of n.declarations) {
      const fn = d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') ? d.init : null;
      for (const v of sm.getDeclaredVariables(d)) declared.set(v.name, { it, kind: n.kind, fn });
    }
  }
}

const parent = new Map();
const callees = new Set();
(function link(n, p) {
  if (!n || typeof n.type !== 'string') return;
  parent.set(n, p);
  if ((n.type === 'CallExpression' || n.type === 'NewExpression') && n.callee.type === 'Identifier') callees.add(n.callee);
  for (const k of Object.keys(n)) {
    if (k === 'range') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => link(c, n));
    else if (v && typeof v.type === 'string') link(v, n);
  }
})(ast, null);

// Funktioner som körs direkt där de skrivs: IIFE och synkrona callbacks (forEach, map …)
const SYNC = new Set(['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'reduce', 'sort', 'flatMap', 'from', 'traverse']);
function runsNow(fn) {
  const p = parent.get(fn);
  if (!p) return false;
  if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.callee === fn) return true;
  return p.type === 'CallExpression' && p.arguments.includes(fn) && p.callee.type === 'MemberExpression' && !p.callee.computed && SYNC.has(p.callee.property.name);
}
// Globala namn som används när koden inuti "isRoot" körs
function refsWhenRun(isRoot, range) {
  const out = [];
  for (const scope of sm.scopes) {
    let s = scope;
    let inside = false;
    let ok = true;
    while (s) {
      if (isRoot(s)) { inside = true; break; }
      if (s.type === 'function' && !runsNow(s.block)) ok = false;
      s = s.upper;
    }
    if (!inside || !ok) continue;
    for (const ref of scope.references) {
      const [a, b] = ref.identifier.range;
      if (range && (a < range[0] || b > range[1])) continue;
      // I script-läge lämnas globala namn olösta: olöst + deklarerat på toppnivå = globalt
      if (ref.resolved ? ref.resolved.scope !== globalScope : !declared.has(ref.identifier.name)) continue;
      out.push({ name: ref.identifier.name, called: callees.has(ref.identifier) });
    }
  }
  return out;
}
const cache = new Map();
function whenCalled(name) {
  if (cache.has(name)) return cache.get(name);
  cache.set(name, []);
  const d = declared.get(name);
  const r = d && d.fn ? refsWhenRun((s) => s.block === d.fn && s.type === 'function') : [];
  cache.set(name, r);
  return r;
}
const pos = (it) => [order.indexOf(it.file), it.node.range[0]];
let problems = 0;
for (const it of items) {
  if (it.node.type === 'FunctionDeclaration') continue;
  const need = new Map();
  const queue = refsWhenRun((s) => s.type === 'global', it.node.range);
  while (queue.length) {
    const r = queue.pop();
    if (need.has(r.name) && (need.get(r.name) || !r.called)) continue;
    need.set(r.name, need.get(r.name) || r.called);
    if (r.called) queue.push(...whenCalled(r.name));
  }
  const [fi, at] = pos(it);
  for (const name of need.keys()) {
    const d = declared.get(name);
    const [fj, atj] = pos(d.it);
    const ok = fj < fi || (fj === fi && (d.kind === 'function' || atj < at || d.it === it));
    if (!ok) {
      problems += 1;
      console.error(`FEL: js/${it.file}:${lineAt(it.node.range[0])} använder "${name}" som först finns i js/${d.it.file}`);
    }
  }
}
if (problems) {
  console.error(`${problems} problem med laddningsordningen`);
  process.exit(1);
}
console.log(`OK: ${order.length} filer, ${items.length} satser – laddningsordningen stämmer`);
