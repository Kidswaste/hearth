#!/usr/bin/env node
// commandonly lint (round 51): no owner-facing command may be reachable ONLY by typing it. A command passes when
//   · Ctrl/⌘+K (Find anything) runs it straight away: not hidden, there when the first screen was up, no "<…>" words
//     needed (chat-cmds.js addCommandActions: those only put "/name " in the chat box), or
//   · dev/commandonly-ways.js gives its visible way (WAYS), marks it developer-only (DEV) or reported to its owner
//     (REPORTED: Codex's Astra modules).
// The commands come from dev/commandonly-list.json (Commands.list() of the running app, recorded) and the lazy manifest
// (lazy-data.js LazyData.META: every lazy group's commands, with their args / hidden). A command that is in neither is
// found by a static look at the app's files (name: '…' / reg('…' with a desc or args) and must get a line in WAYS / DEV.
//   node dev/commandonly-scan.js            → { pass, commands, kRun, ways, dev, reported, missing, unknown, stale }
//   node dev/commandonly-scan.js --record   → runs the app (dev/smoke.js) and rewrites dev/commandonly-list.json
//   node dev/commandonly-scan.js --table    → the Markdown table for docs/upgrades/commandonly.md
//   node dev/commandonly-scan.js --self-test
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = path.join(__dirname, 'commandonly-list.json');
const { WAYS, DEV, REPORTED, NEW, DIRECTOR } = require('./commandonly-ways.js');
const SKIP_DIRS = new Set(['dev', 'node_modules', 'electron', 'electron-mac', 'data', 'docs', 'mac', 'assets', '.git', '.claude', 'mcp']);
const NOT_COMMANDS = new Set(['mode', 'v0']); // name: '…' with a desc that isn't a command (nodes.js node types, apps-ai.js apps)
const ALWAYS_OUT = new Set(['do', 'help']); // Ctrl/⌘+K leaves these two out (chat-cmds.js)

const words = (args) => /^\s*</.test(String(args || ''));
// Ctrl/⌘+K runs it: not hidden, there at the first screen, no words needed
const kRun = (c) => !c.hidden && !c.late && !words(c.args) && !ALWAYS_OUT.has(c.name);

function lazyMeta() {
  const L = new Function(`${fs.readFileSync(path.join(ROOT, 'lazy-data.js'), 'utf8')}; return LazyData;`)(); // eslint-disable-line no-new-func
  const out = new Map();
  for (const [group, m] of Object.entries(L.META || {})) for (const c of m.commands || []) if (!out.has(c.name)) out.set(c.name, { ...c, group });
  return out;
}
function appFiles(dir = ROOT, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) out.push(...appFiles(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)); continue; }
    if (e.name.endsWith('.js') && e.name !== 'lazy-data.js') out.push(rel ? `${rel}/${e.name}` : e.name);
  }
  return out;
}
// command names as the files register them: { name: 'x', … desc / args … } or reg('x', 'desc'…
function staticNames(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:\bname:\s*|\breg\(\s*)'([a-z0-9][a-z0-9-]*)'([^\n]{0,400})/g)) if (/\b(desc|args)\b|^,\s*'/.test(m[2])) out.add(m[1]);
  return out;
}

function commands() {
  const rec = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const all = new Map(rec.map((c) => [c.name, { ...c, from: 'recorded' }]));
  const known = new Set(rec.flatMap((c) => [c.name, ...(c.aliases || [])]));
  // lazy commands newer than the recording: judged by the manifest's own args / hidden
  for (const [n, c] of lazyMeta()) if (!all.has(n)) { all.set(n, { name: n, aliases: c.aliases || [], args: c.args || '', desc: c.desc || '', area: c.area || '', hidden: Boolean(c.hidden), group: c.group, from: 'manifest' }); (c.aliases || []).forEach((a) => known.add(a)); known.add(n); }
  // names in the files that neither knows: new eager commands (or aliases) nobody judged yet
  const unknown = [];
  for (const f of appFiles()) for (const n of staticNames(fs.readFileSync(path.join(ROOT, f), 'utf8'))) if (!known.has(n) && !NOT_COMMANDS.has(n) && !all.has(n)) unknown.push({ name: n, file: f });
  for (const u of unknown) all.set(u.name, { name: u.name, args: '', desc: '', area: '', from: `static (${u.file})`, unjudged: true });
  return { all, unknown };
}

function scan() {
  const { all, unknown } = commands();
  const missing = []; const stats = { kRun: 0, ways: 0, dev: 0, reported: 0, newWays: 0 };
  for (const c of all.values()) {
    if (WAYS[c.name]) { stats.ways++; if (NEW.includes(c.name)) stats.newWays++; continue; }
    if (DEV[c.name]) { stats.dev++; continue; }
    if (REPORTED[c.name]) { stats.reported++; continue; }
    if (!c.unjudged && kRun(c)) { stats.kRun++; continue; }
    missing.push(`/${c.name}${c.args ? ` ${c.args}` : ''} (${c.area || c.from}): no visible way. Add a button / menu row / Settings row where it belongs, then a line in dev/commandonly-ways.js WAYS (or DEV when it is a developer tool)`);
  }
  const listed = [...Object.keys(WAYS), ...Object.keys(DEV), ...Object.keys(REPORTED)];
  const stale = listed.filter((n) => !all.has(n)).map((n) => `${n}: in dev/commandonly-ways.js but no such command any more`);
  const dupes = listed.filter((n, i) => listed.indexOf(n) !== i);
  const newOff = NEW.filter((n) => !WAYS[n]);
  const pass = !missing.length && !stale.length && !dupes.length && !newOff.length;
  return { pass, commands: all.size, aliases: [...all.values()].reduce((s, c) => s + (c.aliases || []).length, 0), ...stats, director: Object.keys(DIRECTOR).length, missing, unknown: unknown.map((u) => `${u.name} (${u.file})`), stale, dupes, newOff };
}

// ---------- the table for the doc ----------
function table() {
  const { all } = commands();
  const esc = (s) => String(s || '').replace(/\|/g, '\\|');
  const way = (c) => (WAYS[c.name] ? `${NEW.includes(c.name) ? '**new:** ' : ''}${WAYS[c.name]}` : DEV[c.name] ? `developer / typed only: ${DEV[c.name]}` : REPORTED[c.name] ? `**NONE** (reported to Codex): ${REPORTED[c.name]}` : kRun(c) ? `Ctrl/⌘+K: “${esc(c.desc).slice(0, 90)}”` : '**NONE**');
  const byArea = new Map();
  for (const c of all.values()) { const a = c.area || 'Other'; if (!byArea.has(a)) byArea.set(a, []); byArea.get(a).push(c); }
  const lines = [];
  for (const [area, list] of [...byArea].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`\n### ${area} (${list.length})\n`, '| Command | Visible way |', '|---|---|');
    for (const c of list.sort((a, b) => a.name.localeCompare(b.name))) lines.push(`| \`/${c.name}\`${c.aliases?.length ? ` (${c.aliases.map((a) => `/${a}`).join(' ')})` : ''} | ${esc(way(c))} |`);
  }
  lines.push('\n### Only the Three Director could do it (its tools) → your own way\n', '| Director tool | Your way |', '|---|---|');
  for (const [k, v] of Object.entries(DIRECTOR)) lines.push(`| \`${k}\` | ${esc(v)} |`);
  return lines.join('\n');
}

// ---------- recording Commands.list() from the running app ----------
function record() {
  const { execFileSync } = require('child_process');
  const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cmdonly-')), 'dump.js');
  fs.writeFileSync(script, `await new Promise((r) => setTimeout(r, 1500));
const at = new Set(Lazy.namesAtReady() || []);
return '[CMDONLY]' + JSON.stringify(Commands.list().map((d) => ({ n: d.name, al: d.aliases || [], a: d.args || '', d: d.desc || '', ar: d.area, h: Boolean(d.hidden), r: at.has(d.name) })));`);
  let text = '';
  try { text = execFileSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--script', script, '--wait', '4000'], { encoding: 'utf8', maxBuffer: 64 << 20 }); } catch (err) { text = String(err.stdout || ''); }
  const at = text.lastIndexOf('[CMDONLY][');
  const line = at < 0 ? '' : text.slice(at + 9).split('\n')[0];
  if (!line) throw new Error('no command list in the smoke output');
  const meta = lazyMeta();
  const rows = JSON.parse(line).map((c) => ({ name: c.n, ...(c.al.length ? { aliases: c.al } : {}), args: c.a, desc: c.d.slice(0, 120), area: c.ar, ...(meta.has(c.n) ? { group: meta.get(c.n).group } : {}), ...(c.h ? { hidden: true } : {}), ...(c.r ? {} : { late: true }) }));
  fs.writeFileSync(LIST, `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
  return rows.length;
}

function selfTest() {
  const ok = [];
  const t = (name, cond) => ok.push([name, Boolean(cond)]);
  t('a "<words>" command is not run by Ctrl/⌘+K', !kRun({ name: 'x', args: '<text>' }));
  t('an optional-args command is', kRun({ name: 'x', args: '[on|off]' }));
  t('hidden is not', !kRun({ name: 'x', args: '', hidden: true }));
  t('late (after the first screen) is not', !kRun({ name: 'x', args: '', late: true }));
  t('do / help are not', !kRun({ name: 'do', args: '' }) && !kRun({ name: 'help', args: '' }));
  t('static: register object', staticNames("R({ name: 'foo-bar', args: '<x>', desc: 'y' })").has('foo-bar'));
  t('static: reg(name, desc)', staticNames("reg('stills', 'A folder', '<cues>', run)").has('stills'));
  t('static: a plain object name is not', !staticNames("{ name: 'chrome', color: '#fff' }").has('chrome'));
  const bad = ok.filter(([, v]) => !v);
  return { pass: !bad.length, tests: ok.length, failed: bad.map(([n]) => n) };
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.includes('--self-test')) { const r = selfTest(); console.log(JSON.stringify(r, null, 1)); process.exit(r.pass ? 0 : 1); }
  if (a.includes('--record')) { console.log(`${record()} commands recorded in dev/commandonly-list.json`); process.exit(0); }
  if (a.includes('--table')) { console.log(table()); process.exit(0); }
  const r = scan(); const s = selfTest();
  r.selfTest = `${s.tests - s.failed.length}/${s.tests}`;
  if (!s.pass) { r.pass = false; r.selfTestFailed = s.failed; }
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.pass ? 0 : 1);
}
module.exports = { scan, table, kRun, staticNames };
