#!/usr/bin/env node
// 🧯 errorcalm lint (round 45): flags NEW code that shows a raw error (err.message / err.stack / String(err) /
// `${err}`) to the owner without the plain-words layer. Error toasts are calmed by themselves (ui.js hands every
// toast(…, { type: 'error' }) to errorcalm.js), so the places that still can leak are:
//   · a toast that isn't an error toast: toast(err.message) / toast(err.message, { timeout })
//   · text put on screen directly: el(…, { text: … }), .textContent / .innerText / .innerHTML =, html:
//   · a chat note or a dialog: ctx.say(…), Native.note(…), Modal.alert(…), Modal.confirm(…)
// Fine: anything through calmError(err) / ErrorCalm.text / ErrorCalm.node, an error kept as data ({ error: err.message }),
// console.*, tooltips (title: — the raw words on hover are the details). The places found when the guard went in were
// fixed or audited (a code console for code work, the Lab's shader lens…) and are listed with why in
// dev/errorcalm-baseline.json. A finding not in that list fails.
//   node dev/errorcalm-scan.js             → { pass, new: [...], audited, stale }
//   node dev/errorcalm-scan.js --baseline  → rewrites dev/errorcalm-baseline.json with every finding now (after an audit)
//   node dev/errorcalm-scan.js --self-test → the rules on made-up lines
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(__dirname, 'errorcalm-baseline.json');
const SKIP_DIRS = new Set(['dev', 'node_modules', 'electron', 'electron-mac', 'data', 'docs', 'mac', 'assets', '.git', '.claude']);
// main-process / Node-only files never draw (their errors reach the window as data, then a toast or a line)
const NODE_ONLY = /(main|-core|-engine|-merge|-worker|-worklet|-preload|preload)\.js$|^(engines|store|storework|fsapi|fswalk|importer|appshell|gamebridge|installs|winpolish|macpolish|winmac|portable|chrome-cdp|chromeguard|devreportmain)\.js$|^mcp\//;

function files(dir = ROOT, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) out.push(...files(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)); continue; }
    if (e.name.endsWith('.js')) out.push(rel ? `${rel}/${e.name}` : e.name);
  }
  return out;
}

const ERR = /\b(?:err|e|error|ex|er|reason|exc)\??\.(?:message|stack)\b|\bString\(\s*(?:err|e|error|ex)\s*\)|\$\{\s*(?:err|e|error|ex)\s*\}/;
const SINK = /\btext:\s|\.textContent\s*=(?!=)|\.innerText\s*=(?!=)|\.innerHTML\s*=(?!=)|\bhtml:\s|\bctx\.say\(|\bNative\.note\(|\bModal\.(?:alert|confirm)\(/;
const CALMED = /calmError\(|ErrorCalm|errorCalm/;
// a balanced (…) after an opening "(" at i (one level of nesting inside strings is enough for these lines)
function callEnd(s, i) {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return k + 1; }
  }
  return s.length;
}
// one line → a finding ('toast' | 'sink') or null
function lineFinding(line) {
  if (!ERR.test(line) || CALMED.test(line) || /^\s*\/\//.test(line)) return null;
  let s = line;
  // error toasts are calmed by ui.js / errorcalm.js: a toast(…) whose arguments say type 'error' is fine; another one
  // that shows the error is a finding
  let bad = null;
  for (let i = s.search(/\btoast\(/); i >= 0; i = s.search(/\btoast\(/)) {
    const open = s.indexOf('(', i);
    const end = callEnd(s, open);
    const call = s.slice(i, end);
    if (ERR.test(call) && !/type:\s*['"]error['"]|type:\s*\w+\s*\?\s*['"]?\w*['"]?\s*:\s*['"]error['"]|\{\s*type\s*\}|type:\s*kind/.test(call)) bad = bad || 'toast';
    s = s.slice(0, i) + s.slice(end);
  }
  // an error kept as data, not shown: { error: err.message }, reason: e.message, console.*
  s = s.replace(/\b(?:error|reason|message|why|detail|err|raw|stack):\s*(?:err|e|error|ex)\??\.(?:message|stack)\b/g, '').replace(/console\.\w+\([^;]*/g, '');
  const at = s.search(SINK);
  if (at >= 0 && ERR.test(s.slice(at))) bad = bad || 'sink';
  return bad;
}

function scan() {
  const found = [];
  for (const f of files()) {
    if (NODE_ONLY.test(f) || /^errorcalm/.test(f)) continue;
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((l, i) => { const k = lineFinding(l); if (k) found.push({ file: f, line: i + 1, kind: k, text: l.trim().slice(0, 160) }); });
  }
  return found;
}
// a finding's key survives lines moving: the file + the line's words (without spaces)
const key = (x) => `${x.file}|${x.text.replace(/\s+/g, '').slice(0, 120)}`;

function selfTest() {
  const T = [
    ["toast(err.message, { type: 'error' });", null],
    ['toast(err.message);', 'toast'],
    ['toast(`Saved ${n}`, { timeout: 2000 }).catch((e) => toast(e.message, { timeout: 3000 }));', 'toast'],
    ["out.replaceChildren(el('p', { class: 'hint', text: err.message }));", 'sink'],
    ["out.replaceChildren(el('p', { class: 'hint', text: calmError(err) }));", null],
    ['caption.textContent = `⚠ ${e.message}`;', 'sink'],
    ['ctx.say(`Failed: ${err.message}`);', 'sink'],
    ["Native.note(id, String(err));", 'sink'],
    ['const r = await x().catch((err) => ({ ok: false, error: err.message }));', null],
    ["el('button', { text: 'Go', on: { click: () => go().catch((err) => toast(err.message, { type: 'error' })) } })", null],
    ['console.warn(err.message);', null],
    ["el('span', { title: err.message })", null],
    ['// text: err.message', null],
    ["Modal.alert('Oops', err.stack);", 'sink'],
  ];
  let bad = 0;
  for (const [l, want] of T) { const got = lineFinding(l); if (got !== want) { bad++; console.log(`✖ ${l} → ${got} (want ${want})`); } }
  console.log(bad ? `FAIL self-test: ${bad}` : `✓ self-test: ${T.length} lines`);
  return !bad;
}

if (require.main === module) {
  const okSelf = selfTest();
  const found = scan();
  if (process.argv.includes('--baseline')) {
    const prev = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : { audited: {} };
    const audited = {};
    for (const x of found) audited[key(x)] = prev.audited?.[key(x)] || 'TODO: why it may show raw';
    fs.writeFileSync(BASE, `${JSON.stringify({ note: 'errorcalm-scan findings audited at round 45: each shows a raw error on purpose (with why). New code goes through calmError(err) / ErrorCalm.node / an error toast.', audited }, null, 1)}\n`);
    console.log(`baseline: ${found.length} findings written`);
  }
  const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')).audited || {} : {};
  const fresh = found.filter((x) => !base[key(x)]);
  const keys = new Set(found.map(key));
  const stale = Object.keys(base).filter((k) => !keys.has(k));
  const pass = okSelf && fresh.length === 0;
  console.log(JSON.stringify({ pass, new: fresh, audited: found.length - fresh.length, stale: stale.length }, null, 1));
  if (!pass) { console.log(`FAIL: ${fresh.length} new place(s) show a raw error: wrap it in calmError(err) (or ErrorCalm.node), or make it an error toast`); process.exit(1); }
}
module.exports = { lineFinding, scan, key };
