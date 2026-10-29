#!/usr/bin/env node
// Writes the generated part of lazy-data.js (LazyData.META): what each lazy group registers by the time the first
// screen is up (chat commands, palette actions, keys-sheet lines, agent tool prefixes, app windows, rail tools).
// It's recorded the way it was before lazy loading: a throwaway copy of the app gets the groups' files back at their
// old places in index.html (LazyData.GROUPS[].at) with dev/lazy-record.js noting who registers what. Then the lazy
// build runs too and both are compared (commands, aliases, actions, keys, apps, tools must match).
//   node dev/lazy-manifest.js            # rewrite lazy-data.js, then compare
//   node dev/lazy-manifest.js --check    # writes nothing: exit 1 when lazy-data.js / lazy-meta.js are out of date, the lazy build differs or a file threw
//   node dev/lazy-manifest.js --check --emit /tmp/x.json   # + the would-be text of both files (dev/lazymanifest-test.js)
// (round 85, manifest85) byte-stable from run to run: the files go back in lazy.js's order (never before a group they
// need), the registry is read once the first screen is up, and a name registered with `when` always counts as shared.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'lazy-data.js');
const check = process.argv.includes('--check');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-lazy-'));
const LazyData = new Function(`${fs.readFileSync(FILE, 'utf8')}; return LazyData;`)(); // eslint-disable-line no-new-func

function smoke(root, body) {
  const script = path.join(tmp, `check-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(script, body);
  let text = '';
  try {
    text = execFileSync(process.execPath, [path.join(root, 'dev', 'smoke.js'), '--script', script, '--wait', process.env.LAZY_WAIT || '4000'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (err) { text = String(err.stdout || ''); }
  const m = text.match(/\[LAZY\](\{[\s\S]*\})/);
  if (!m) { console.error(text.slice(-3000)); throw new Error('no result in the smoke output'); }
  if (/problem\(s\):/.test(text)) console.log(text.slice(text.lastIndexOf('problem(s):') - 4).slice(0, 2000));
  const out = JSON.parse(m[1]);
  // (round 85, manifest85) a file that throws while the copy loads registers nothing after the throw: name it
  out.exceptions = /problem\(s\):/.test(text) ? text.slice(text.lastIndexOf('problem(s):')).split('\n').filter((l) => /^exception: /.test(l)) : [];
  return out;
}
// (round 85, manifest85) read once the first screen is up (start.js: Meter.init, then 'hearth:ready'), never mid-start
const READY = `if (!performance.getEntriesByName('hearth:ready').length) await new Promise((r) => { addEventListener('hearth:ready', r, { once: true }); setTimeout(r, 30000); });
await new Promise((r) => setTimeout(r, 300));`;
const SNAP = `
const names = Commands.list().map((d) => d.name).sort();
const snap = { names, aliases: Commands.list().flatMap((d) => d.aliases.map((a) => a.toLowerCase() + '>' + d.name)).sort(), actions: AppUI.actions().map((a) => a.label).sort(),
  keys: Keys.all().map((k) => k.area + '|' + k.keys).sort(), apps: Apps.list().map((a) => a.id).sort(), tools: Tools.all().map((t) => t.id).sort(),
  bridge: [], dups: Commands.duplicates().map((d) => d.name) };`;

// ---------- 1. the old order, recorded ----------
const copy = path.join(tmp, 'app');
fs.mkdirSync(copy);
const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules']);
for (const n of fs.readdirSync(ROOT)) if (!skip.has(n)) fs.cpSync(path.join(ROOT, n), path.join(copy, n), { recursive: true });
let html = fs.readFileSync(path.join(copy, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const tag = (f) => `  <script defer src="${f}"></script>\n`;
html = html.replace(tag('lazy.js'), '').replace(tag('lazy-data.js'), '');
// (round 85, manifest85) the files go back in the order lazy.js registers the stand-ins at run time, and never before a
// group they need. Each group used to be put right after its `at` file, so groups sharing one came out reversed
// (projbundle before projects: "Projects is not defined") and a group placed earlier than one it needs (`after`)
// ran first (questjournal's follow-hook.js before follow's follow-core.js: "FollowCore is not defined"): their files
// threw while the copy loaded and what they register was missing from the recording.
//  1. same `at`: one after the other, in the order of the lazy-at.js tags (lazy.js Lazy.at), then LazyData.GROUPS
//  2. a group whose `after` group(s) still land later moves right after the last of them (as lazy.js loads it: after)
const tagOrder = new Map();
for (const m of html.matchAll(/<script defer src="lazy-at\.js#([^"]*)"><\/script>/g)) for (const n of decodeURIComponent(m[1]).split(',').map((x) => x.trim())) if (n && !tagOrder.has(n)) tagOrder.set(n, tagOrder.size);
const groupIx = new Map(LazyData.GROUPS.map((g, i) => [g.name, i]));
const rank = (g) => (tagOrder.has(g.name) ? tagOrder.get(g.name) : tagOrder.size + groupIx.get(g.name));
const ordered = [...LazyData.GROUPS].sort((p, q) => rank(p) - rank(q));
const tail = new Map(); // anchor file → the last file put after it (the next one goes after that)
const put = (anchor, files) => {
  if (!files.length) return;
  let at = anchor;
  while (tail.has(at)) at = tail.get(at); // (a file put after a file that itself got followers: after the last of them)
  if (!html.includes(tag(at))) throw new Error(`index.html has no ${anchor} (LazyData.GROUPS at)`);
  html = html.replace(tag(at), tag(at) + files.map(tag).join(''));
  tail.set(at, files.at(-1));
};
const ownFiles = (g) => g.files.filter((f) => !(g.places || {})[f]);
for (const g of ordered) {
  put(g.at, ownFiles(g));
  for (const [f, at] of Object.entries(g.places || {})) put(at, [f]);
}
const byName = new Map(LazyData.GROUPS.map((g) => [g.name, g]));
const posOf = () => { const p = new Map(); [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].forEach((m, i) => p.set(m[1], i)); return p; };
const moved = [];
for (let pass = 0, again = true; again; pass++) {
  if (pass > LazyData.GROUPS.length) throw new Error(`LazyData.GROUPS after: a loop (${moved.slice(-5).join(', ')})`);
  again = false;
  for (const g of ordered) {
    const pos = posOf(), mine = ownFiles(g);
    if (!mine.length) continue;
    const first = Math.min(...mine.map((f) => pos.get(f)));
    let need = null;
    for (const d of g.after || []) for (const f of byName.get(d)?.files || []) if (pos.get(f) > first && (!need || pos.get(f) > pos.get(need))) need = f;
    if (!need) continue;
    for (const f of mine) html = html.replace(tag(f), '');
    for (const f of mine) { // (the chain of files put after one another closes over the ones that leave)
      for (const [k, v] of [...tail]) if (v === f) { if (tail.has(f)) tail.set(k, tail.get(f)); else tail.delete(k); }
      tail.delete(f);
    }
    put(need, mine);
    moved.push(`${g.name} → after ${need}`);
    again = true;
  }
}
if (moved.length) console.log(`(placed after the groups they need: ${moved.join(' · ')})`);
const after = (f, add) => { if (!html.includes(tag(f))) throw new Error(`index.html has no ${f}`); html = html.replace(tag(f), tag(f) + add); };
after('commands.js', tag('lazy-data.js') + tag('dev/lazy-record.js'));
after('apps.js', tag('dev/lazy-record.js'));
after('appui.js', tag('dev/lazy-record.js'));
for (const g of LazyData.GROUPS) for (const c of g.css || []) html = html.replace('  <style id="user-theme">', `  <link rel="stylesheet" href="${c}">\n  <style id="user-theme">`);
fs.writeFileSync(path.join(copy, 'index.html'), html);
// smoke.js leaves dev/ out of its copy: the recorder goes next to the app
fs.mkdirSync(path.join(copy, 'devrec'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'lazy-record.js'), path.join(copy, 'devrec', 'lazy-record.js'));
fs.writeFileSync(path.join(copy, 'index.html'), html.replaceAll('src="dev/lazy-record.js"', 'src="devrec/lazy-record.js"'));
console.log('recording the old order…');
const old = smoke(copy, `${READY} ${SNAP} return '[LAZY]' + JSON.stringify({ rec: window.__lazyRec?.out || {}, snap, shared: Commands.list().filter((d) => d.variants).flatMap((d) => [d.name, ...d.variants.map((v) => v.name)]) });`);

const meta = {};
const uniq = (xs, key) => { const seen = new Set(); return xs.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
for (const g of LazyData.GROUPS) {
  const r = old.rec[g.name] || {};
  const o = {};
  if (r.commands?.length) o.commands = uniq(r.commands, (c) => c.name.toLowerCase());
  if (r.actions?.length) o.actions = uniq(r.actions, (a) => a.label || a);
  if (r.keys?.length) o.keys = uniq(r.keys, (k) => `${k.area}|${k.keys}`);
  if (r.bridge?.length) o.bridge = [...new Set(r.bridge)];
  if (r.apps?.length) o.apps = uniq(r.apps, (a) => a.id);
  if (r.tools?.length) o.tools = uniq(r.tools, (t) => t.id);
  // (round 25, diet) a group's most common area is written once (lazy.js groupMeta puts it back): ≈ 10 KB less to parse
  const common = (xs) => { const n = {}; for (const x of xs || []) if (x.area) n[x.area] = (n[x.area] || 0) + 1; const [k, c] = Object.entries(n).sort((p, q) => q[1] - p[1])[0] || []; return c > 1 ? k : null; };
  const ca = common(o.commands); if (ca) { o.area = ca; o.commands = o.commands.map(({ area, ...c }) => (area === ca ? c : { ...c, area: area ?? null })); }
  const ka = common(o.keys); if (ka) { o.karea = ka; o.keys = o.keys.map(({ area, ...k }) => (area === ka ? k : { ...k, area: area ?? null })); }
  meta[g.name] = o;
}
// (round 52, lazymeta) lazy-data.js is read before the first frame: its commands keep what a stand-in is registered with
// (name, aliases, args, area, keys, hidden, when…); their descriptions, examples, keywords and undo lines go to
// lazy-meta.js (LazyText), which lazy.js reads right after the first frame and puts into the stand-ins still waiting.
// A shared name (a `when` variant, or a command combined with another registration under its name or one of its
// aliases: /retry with /again) keeps its words here: Commands.register combines the variants' descriptions as they register.
// (round 73, startfast73) + args (the commands' argument hints) and the keys-sheet lines' words (text[g]['#keys'])
const TEXT_KEYS = ['desc', 'examples', 'keywords', 'undo', 'args'];
// (round 85, manifest85) + every name a group registers with `when`: whether the registry shows such a name combined
// at the moment it is read depended on timers (chat-cost.js's /context joins the meter's again after an override), so
// /context's words went back and forth between lazy-data.js and lazy-meta.js from one run to the next
const shared = new Set([...(old.shared || []), ...Object.values(old.rec).flatMap((r) => (r.commands || []).filter((c) => c.when).map((c) => c.name))].map((n) => n.toLowerCase()));
const text = {};
for (const [g, o] of Object.entries(meta)) {
  if (!o.commands) continue;
  o.commands = o.commands.map((c) => {
    const name = c.name.toLowerCase();
    if (c.when || shared.has(name) || !TEXT_KEYS.some((k) => k in c)) return c;
    const keep = {}, words = {};
    for (const [k, v] of Object.entries(c)) (TEXT_KEYS.includes(k) ? words : keep)[k] = v;
    (text[g] ||= {})[name] = words;
    return keep;
  });
}
for (const [g, o] of Object.entries(meta)) {
  if (!o.keys) continue;
  o.keys = o.keys.map((k) => {
    // (the id lazy.js gives the stand-in line: its area as groupMeta puts it back; a line with no area keeps its words)
    const area = k.area === undefined ? o.karea : k.area;
    if (!k.what || typeof area !== 'string') return k;
    const { what, ...keep } = k;
    ((text[g] ||= {})['#keys'] ||= {})[`${area}|${k.keys}`] = what;
    return keep;
  });
}
const TEXT_FILE = path.join(ROOT, 'lazy-meta.js');
const textSrc = `// Written by \`node dev/lazy-manifest.js\` (don't edit): the words of the lazy groups' commands (descriptions, examples,
// keywords, undo lines, argument hints; '#keys': the keys-sheet lines' words), kept out of the first screen. lazy.js reads this file right after the first frame (Lazy.text())
// and puts them into the stand-in commands still waiting for their group: /help, Ctrl/⌘+K and the Commands page show
// them as before. { group: { command: { desc, examples, keywords, undo } } }
const LazyText = ${JSON.stringify(text)};
`;
const src = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const A = '  // ---- generated by dev/lazy-manifest.js below this line ----\n';
const B = '  // ---- end of generated part ----';
const a = src.indexOf(A), b = src.indexOf(B);
if (a < 0 || b < 0) { console.error('markers missing in lazy-data.js'); process.exit(1); }
const next = `${src.slice(0, a)}${A}  const META = ${JSON.stringify(meta)};\n${src.slice(b)}`;
console.log(Object.entries(meta).map(([n, o]) => `${n}: ${o.commands?.length || 0} cmds, ${o.actions?.length || 0} actions, ${o.keys?.length || 0} keys, ${o.bridge?.length || 0} tool prefixes, ${o.apps?.length || 0} apps, ${o.tools?.length || 0} tools`).join('\n'));
let bad = 0;
// (round 36) a recording cut short (a busy machine: the old-order copy not finished when it was read) wrote a manifest
// with most groups empty, so their stand-ins (commands, agent tool prefixes like adobe_) vanished and dev/checks/lazy.js
// failed. A group that registered something before and nothing now is a broken recording, not a change: don't write
// it (run again; --force writes anyway, for a group that really lost everything on purpose).
const prev = LazyData.META || {};
const lost = Object.keys(prev).filter((n) => Object.keys(prev[n] || {}).some((k) => ['commands', 'actions', 'keys', 'bridge', 'apps', 'tools'].includes(k)) && !Object.keys(meta[n] || {}).length && LazyData.GROUPS.some((g) => g.name === n));
if (lost.length && !process.argv.includes('--force')) {
  console.error(`✖ the recording looks cut short: ${lost.length} group(s) registered nothing (${lost.join(', ')}); lazy-data.js left as it was. Run again (the machine may be busy), or --force.`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  process.exit(1);
}
// (round 85, manifest85) a file that threw while the old order loaded left out what it registers after the throw:
// that recording is not written (--force writes it anyway)
if (old.exceptions.length) {
  console.error(`✖ ${old.exceptions.length} exception(s) while the old order loaded (a file before one it needs? LazyData.GROUPS at / after):\n  ${old.exceptions.join('\n  ')}`);
  if (!process.argv.includes('--force')) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ } process.exit(1); }
}
// --emit <file>: the two generated files' would-be text as JSON (dev/lazymanifest-test.js compares two runs)
const emit = process.argv.includes('--emit') ? process.argv[process.argv.indexOf('--emit') + 1] : null;
if (emit) fs.writeFileSync(emit, JSON.stringify({ 'lazy-data.js': next, 'lazy-meta.js': textSrc }));
if (next !== src) {
  if (check) { console.log('✖ lazy-data.js is out of date: run node dev/lazy-manifest.js'); bad++; } else { fs.writeFileSync(FILE, next); console.log('wrote lazy-data.js'); }
}
const textWas = fs.existsSync(TEXT_FILE) ? fs.readFileSync(TEXT_FILE, 'utf8').replace(/\r\n/g, '\n') : '';
if (textSrc !== textWas) {
  if (check) { console.log('✖ lazy-meta.js is out of date: run node dev/lazy-manifest.js'); bad++; } else { fs.writeFileSync(TEXT_FILE, textSrc); console.log('wrote lazy-meta.js'); }
}
console.log(`first screen: lazy-data.js ${(Buffer.byteLength(next) / 1024).toFixed(1)} KB · after it: lazy-meta.js ${(Buffer.byteLength(textSrc) / 1024).toFixed(1)} KB`);

// ---------- 2. the lazy build: at the first screen and once everything loaded, the same as the old order ----------
if (!check || !bad) {
  console.log('checking the lazy build…');
  const now = smoke(ROOT, `await Lazy.loadAll(); await new Promise((r) => setTimeout(r, 300)); ${SNAP} return '[LAZY]' + JSON.stringify({ snap, atReady: Lazy.namesAtReady(), misses: Lazy.misses(), state: Lazy.state() });`);
  const diff = (k) => { const X = new Set(old.snap[k]), Y = new Set(now.snap[k]); return { lost: [...X].filter((x) => !Y.has(x)), added: [...Y].filter((x) => !X.has(x)) }; };
  for (const k of ['names', 'aliases', 'actions', 'keys', 'apps', 'tools', 'dups']) {
    const d = diff(k);
    if (d.lost.length || d.added.length) { console.log(`✖ ${k}: lost ${JSON.stringify(d.lost)} added ${JSON.stringify(d.added)}`); bad++; } else console.log(`✓ ${k} (${now.snap[k].length})`);
  }
  const R = new Set(now.atReady || []);
  const late = now.snap.names.filter((n) => !R.has(n));
  if (late.length) console.log(`(registered after the first screen, as before? ${late.join(' ')})`);
  for (const s of now.state) if (s.state !== 'loaded') { console.log(`✖ group ${s.name} is ${s.state}`); bad++; }
  if (now.misses.length) console.log(`globals touched before their group loaded:\n${now.misses.map((x) => `  ${x.name} (${x.group}) @${x.at} ms: ${x.where}`).join('\n')}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
