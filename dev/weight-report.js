#!/usr/bin/env node
// Weight of the app (round 18, trim): KB of the JS / CSS index.html loads before the first screen, each lazy group
// (lazy-data.js), the main-process files main.js requires, and the app on disk without dev/ and docs/.
//   node dev/weight-report.js            # this checkout
//   node dev/weight-report.js <appRoot>  # another copy of the app (an older build, to compare)
const fs = require('fs'), path = require('path');
const R = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const kb = (n) => Math.round(n / 102.4) / 10;
const size = (f) => { try { return fs.statSync(path.join(R, f)).size; } catch { return 0; } };
const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const js = [...new Set([...html.matchAll(/<script[^>]*src="([^"#]+)/g)].map((m) => m[1]).filter((f) => !/^https?:/.test(f)))];
const css = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map((m) => m[1]);
const LD = new Function(fs.readFileSync(path.join(R, 'lazy-data.js'), 'utf8') + '; return LazyData;')();
const out = {};
out.alwaysJS = { files: js.length, kb: kb(js.reduce((a, f) => a + size(f), 0)) };
out.alwaysCSS = { files: css.length, kb: kb(css.reduce((a, f) => a + size(f), 0)) };
out.indexHtmlKB = kb(size('index.html'));
out.lazy = {}; let lz = 0;
for (const g of LD.GROUPS) { const n = [...g.files, ...(g.css || [])].reduce((a, f) => a + size(f), 0); lz += n; out.lazy[g.name] = kb(n); }
out.lazyTotalKB = kb(lz);
const seen = new Set();
const walk = (f) => {
  if (seen.has(f)) return; seen.add(f); let t; try { t = fs.readFileSync(path.join(R, f), 'utf8'); } catch { return; }
  for (const m of t.matchAll(/require\((?:path\.join\(__dirname,\s*)?['"`](\.{1,2}\/[^'"`]+|[\w./-]+\.js)['"`]/g)) {
    let p = path.normalize(path.join(path.dirname(f), m[1])); if (!p.endsWith('.js')) p += '.js';
    if (fs.existsSync(path.join(R, p))) walk(p);
  }
};
walk('main.js');
const mainT = fs.readFileSync(path.join(R, 'main.js'), 'utf8');
for (const m of mainT.matchAll(/'([\w-]+main\.js|[\w-]+\.js)'/g)) if (fs.existsSync(path.join(R, m[1])) && /main|mcp/.test(m[1])) walk(m[1]);
out.mainRequires = { files: seen.size, kb: kb([...seen].reduce((a, f) => a + size(f), 0)), list: [...seen].join(' ') };
let tot = 0, code = 0, n = 0; const skip = new Set(['.git', 'dev', 'docs', 'data', 'node_modules', 'electron', '.claude']);
const all = (d) => {
  for (const e of fs.readdirSync(path.join(R, d), { withFileTypes: true })) {
    if (!d && skip.has(e.name)) continue; const p = path.join(d, e.name);
    if (e.isDirectory()) all(p); else { const s = size(p); tot += s; n++; if (/\.(js|css|html)$/.test(e.name)) code += s; }
  }
};
all('');
out.app = { files: n, totalKB: kb(tot), codeKB: kb(code) };
console.log(JSON.stringify(out, null, 1));
