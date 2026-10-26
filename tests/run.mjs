// Kör alla testfall i tests/cases i en webbläsare utan fönster (Chrome/Chromium).
// Användning: node run.mjs [namn …]   (t.ex. node run.mjs bigair online-duel)
// Chrome hittas automatiskt, annars sätt CHROME_PATH.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.join(HERE, '.tmp');
fs.mkdirSync(TMP, { recursive: true });

const chrome = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('Hittar ingen Chrome. Sätt CHROME_PATH till webbläsaren.');
  process.exit(1);
}

const only = process.argv.slice(2);
const cases = fs.readdirSync(path.join(HERE, 'cases')).filter((f) => f.endsWith('.js'))
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)));

// Bygg en testsida av index.html: samma spel, men test-konfiguration och testskript efteråt
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function page(file) {
  const online = file.startsWith('online-');
  let h = index
    .replace(/<script src="https:\/\/cdn[^"]*supabase[^"]*"><\/script>/, '')
    .replace('<script src="config.js"></script>', online
      ? '<script src="../lib/mock-supabase.js"></script>'
      : '<script>window.SKI_ONLINE = { url: "", key: "" };</script>')
    .replace(/(src|href)="(?!https?:|\.\.\/lib)([^"]+\.(js|css))"/g, '$1="../../$2"');
  h = h.replace('</body>', `<script src="../lib/harness.js"></script><script src="../cases/${file}"></script>\n</body>`);
  const out = path.join(TMP, file.replace(/\.js$/, '.html'));
  fs.writeFileSync(out, h);
  return out;
}

let failed = 0;
for (const file of cases) {
  const src = fs.readFileSync(path.join(HERE, 'cases', file), 'utf8');
  const budget = Number((src.match(/\/\/ budget: (\d+)/) || [])[1] || 30000);
  const url = `file://${page(file)}`;
  const t0 = Date.now();
  let title = '';
  try {
    const dom = execFileSync(chrome, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--allow-file-access-from-files', `--virtual-time-budget=${budget}`, '--dump-dom', url],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    title = (dom.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  } catch (e) {
    title = '';
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  let res;
  try { res = JSON.parse(title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')); } catch { res = { ok: false, fails: [`inget resultat (titel: "${title.slice(0, 80)}")`] }; }
  if (res.ok) console.log(`✔ ${file} (${secs} s)${res.notes && res.notes.length ? ` – ${res.notes.join('; ')}` : ''}`);
  else {
    failed += 1;
    console.log(`✘ ${file} (${secs} s)`);
    for (const f of res.fails) console.log(`    ${f}`);
  }
}
console.log(failed ? `\n${failed} av ${cases.length} testfall misslyckades` : `\nAlla ${cases.length} testfall godkända`);
process.exit(failed ? 1 : 0);
