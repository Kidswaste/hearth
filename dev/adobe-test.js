#!/usr/bin/env node
// The Adobe bridges (adobemain.js + adobe-data.js) on any OS, with no Adobe app: fake Mac apps in a temporary
// ~/Applications, a fake osascript that captures the generated AppleScript + ExtendScript and answers with canned
// results, the Windows path (fake Program Files\Adobe + a fake cscript capturing the VBScript), the Hearth bridge
// install (fake `defaults` / `reg`) and a Premiere round trip through the bridge's queue folder (a stand-in panel).
//   node dev/adobe-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-adobe-'));
const home = path.join(tmp, 'home');
const bin = path.join(tmp, 'bin');
const log = path.join(tmp, 'log');
fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(log, { recursive: true });
const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const mkApp = (folder, app, version) => {
  const p = path.join(home, 'Applications', folder, app, 'Contents');
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'Info.plist'), `<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key>\n<string>${version}</string></dict></plist>`);
};
mkApp('Adobe Photoshop 2026', 'Adobe Photoshop 2026.app', '27.1.0');
mkApp('Adobe Photoshop 2025', 'Adobe Photoshop 2025.app', '26.4.0');
mkApp('Adobe Photoshop (Beta)', 'Adobe Photoshop (Beta).app', '28.0.0');
mkApp('Adobe Illustrator 2026', 'Adobe Illustrator.app', '30.0');
mkApp('Adobe Premiere Pro 2026', 'Adobe Premiere Pro 2026.app', '26.0');
mkApp('Adobe InDesign 2026', 'Adobe InDesign 2026.app', '21.0');
// osascript stand-in: keeps the AppleScript and a copy of the script file, answers with canned.json (or a default)
fs.writeFileSync(path.join(bin, 'osascript'), `#!/bin/sh
n=$(ls "${log}" | wc -l)
printf '%s' "$2" > "${log}/as-$n.applescript"
f=$(printf '%s' "$2" | sed -n 's/^set f to POSIX file "\\(.*\\)"$/\\1/p')
[ -n "$f" ] && cp "$f" "${log}/as-$n.jsx"
if [ -f "${tmp}/deny" ]; then echo "execution error: Not authorized to send Apple events to Adobe Photoshop 2026. (-1743)" >&2; exit 1; fi
if [ -f "${tmp}/canned.json" ]; then cat "${tmp}/canned.json"; else echo '{"ok":true,"value":{"fake":true}}'; fi
`, { mode: 0o755 });
for (const t of ['defaults', 'reg', 'open', 'pgrep']) fs.writeFileSync(path.join(bin, t), `#!/bin/sh\necho "${t} $@" >> "${tmp}/system.log"\nexit 0\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
os.homedir = () => home;
const realPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

const D = require('../adobe-data.js');
const A = require('../adobemain.js');
A._test.setDataDir(path.join(tmp, 'data'));
const newestLog = (ext) => { const f = fs.readdirSync(log).filter((x) => x.endsWith(ext)).sort((a, b) => Number(a.split('-')[1].split('.')[0]) - Number(b.split('-')[1].split('.')[0])).pop(); return f ? fs.readFileSync(path.join(log, f), 'utf8') : ''; };

step('finds the apps and their versions (release over Beta, newest year)', () => {
  const s = A.status();
  const ps = s.apps.find((a) => a.id === 'photoshop');
  assert.strictEqual(ps.found, true);
  assert.ok(ps.path.endsWith('Adobe Photoshop 2026/Adobe Photoshop 2026.app'), ps.path);
  assert.strictEqual(ps.version, '27.1.0');
  assert.strictEqual(ps.appName, 'Adobe Photoshop 2026');
  assert.strictEqual(s.apps.find((a) => a.id === 'illustrator').appName, 'Adobe Illustrator');
  const me = s.apps.find((a) => a.id === 'mediaencoder');
  assert.strictEqual(me.found, false);
  assert.match(me.reason, /Media Encoder isn't installed.*\/adobe where mediaencoder/);
  assert.strictEqual(s.apps.find((a) => a.id === 'premiere').bridge.installed, false);
  const o = A.status({ photoshop: path.join(home, 'Applications', 'Adobe Photoshop 2025') });
  assert.ok(o.apps[0].path.endsWith('Adobe Photoshop 2025.app'), 'an override folder wins');
});

step('Photoshop: the AppleScript and the ExtendScript it runs (open)', async () => {
  fs.writeFileSync(path.join(tmp, 'canned.json'), '{"ok":true,"value":{"name":"still.png","w":1080,"h":1920,"layers":1}}');
  const r = await A.run('ps', D.ps.open('/Users/me/Lab still "1".png'), { label: 'open still' });
  assert.deepStrictEqual(r.value, { name: 'still.png', w: 1080, h: 1920, layers: 1 });
  const as = newestLog('.applescript');
  assert.match(as, /^set f to POSIX file ".*photoshop-open_still-.*\.jsx"$/m);
  assert.match(as, /tell application "Adobe Photoshop 2026"\n {2}activate\n {2}do javascript f\nend tell/);
  const jsx = newestLog('.jsx');
  assert.match(jsx, /app\.open\(new File\("\/Users\/me\/Lab still \\"1\\"\.png"\)\)/, 'the path is a safe string literal');
  assert.match(jsx, /app\.displayDialogs = DialogModes\.NO/);
  assert.match(jsx, /new File\(".*photoshop-open_still-.*\.json"\)/, 'the answer also goes to a UTF-8 file');
  new Function(jsx); // valid script
});

step('the answer file wins over stdout (any text encoding)', async () => {
  fs.writeFileSync(path.join(bin, 'osascript'), `#!/bin/sh\nf=$(printf '%s' "$2" | sed -n 's/^set f to POSIX file "\\(.*\\)"$/\\1/p')\nprintf '%s' '{"ok":true,"value":"éè from the file"}' > "\${f%.jsx}.json"\necho 'garbled ??'\n`, { mode: 0o755 });
  const r = await A.run('ai', D.ai.svg({ out: '/tmp/x.svg' }), { label: 'svg' });
  assert.strictEqual(r.value, 'éè from the file');
});

step('macOS Automation denied: plain words', async () => {
  fs.writeFileSync(path.join(bin, 'osascript'), '#!/bin/sh\necho "execution error: Not authorized to send Apple events to Adobe Photoshop 2026. (-1743)" >&2\nexit 1\n', { mode: 0o755 });
  const r = await A.run('photoshop', D.ps.docs());
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Privacy & Security → Automation → Hearth → Photoshop/);
});

step('InDesign uses do script … language javascript', async () => {
  fs.writeFileSync(path.join(bin, 'osascript'), `#!/bin/sh\nprintf '%s' "$2" > "${tmp}/id.applescript"\necho '{"ok":true,"value":{"path":"/o.pdf"}}'\n`, { mode: 0o755 });
  const r = await A.run('indesign', D.id.pdf({ out: '/o.pdf' }));
  assert.strictEqual(r.value.path, '/o.pdf');
  assert.match(fs.readFileSync(path.join(tmp, 'id.applescript'), 'utf8'), /tell application "Adobe InDesign 2026"[\s\S]*do script f language javascript/);
});

step('a missing app degrades with a reason (no script runs)', async () => {
  const r = await A.run('mediaencoder', D.me.queue({ file: '/a.mp4' }));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.missing, true);
  assert.match(r.error, /Media Encoder isn't installed/);
  assert.match((await A.run('nope', '')).error, /Unknown app/);
});

step('Premiere without the bridge: says how to get it', async () => {
  const r = await A.run('premiere', D.pr.info());
  assert.strictEqual(r.ok, false); assert.strictEqual(r.needsBridge, true);
  assert.match(r.error, /\/adobe bridge install/);
});

step('the Hearth bridge installs (manifest, panel, PlayerDebugMode for CSXS 9–13)', async () => {
  const r = await A.installBridge();
  const dir = A._test.cepDir();
  assert.ok(dir.startsWith(path.join(home, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions')));
  const man = fs.readFileSync(path.join(dir, 'CSXS', 'manifest.xml'), 'utf8');
  assert.match(man, /<Host Name="PPRO"/); assert.match(man, /<Host Name="AME"/); assert.match(man, /--enable-nodejs/); assert.match(man, /<AutoVisible>false<\/AutoVisible>/);
  const panel = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(panel.includes(JSON.stringify(path.join(tmp, 'data', 'adobe', 'queue'))), 'the panel watches Hearth\'s queue folder');
  const sys = fs.readFileSync(path.join(tmp, 'system.log'), 'utf8');
  for (const v of [9, 10, 11, 12, 13]) assert.ok(sys.includes(`defaults write com.adobe.CSXS.${v} PlayerDebugMode 1`), `CSXS.${v}`);
  assert.strictEqual(r.installed, true);
  assert.strictEqual(A.bridgeStatus().installed, true);
});

step('Premiere through the bridge: the script lands in the queue, the panel answers', async () => {
  const q = path.join(tmp, 'data', 'adobe', 'queue', 'PPRO');
  fs.mkdirSync(q, { recursive: true });
  // a stand-in for the panel: alive.txt, then answers each .jsx through the result file named inside it
  let seen = null;
  const timer = setInterval(() => {
    fs.writeFileSync(path.join(q, 'alive.txt'), String(Date.now()));
    for (const f of fs.readdirSync(q).filter((x) => x.endsWith('.jsx'))) {
      const code = fs.readFileSync(path.join(q, f), 'utf8');
      seen = code;
      const out = code.match(/new File\("([^"]+\.json)"\)/)[1];
      fs.writeFileSync(out, '{"ok":true,"value":{"project":"Hearth.prproj","imported":1,"ok":true,"sequences":2,"newSequences":1}}');
      fs.renameSync(path.join(q, f), path.join(q, `${f}.done`));
    }
  }, 100);
  try {
    const r = await A.run('premiere', D.pr.importFiles({ files: ['/edits/cut.xml'], project: '/p/Hearth.prproj' }), { timeout: 8000 });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.value.sequences, 2);
    assert.match(seen, /app\.project\.importFiles\(files, true, app\.project\.getInsertionBin\(\), false\)/);
    assert.match(seen, /var files = \["\/edits\/cut\.xml"\]/);
    assert.ok(fs.readdirSync(q).some((f) => f.endsWith('.jsx.done')));
  } finally { clearInterval(timer); }
});

step('Media Encoder queue script: preset or default', () => {
  const withPreset = D.me.queue({ file: '/r/a.mp4', preset: '/p/Reels.epr', out: '/o/a.mp4' });
  assert.match(withPreset, /fe\.addFileToBatch\("\/r\/a\.mp4", "H\.264", "\/p\/Reels\.epr", "\/o\/a\.mp4"\)/);
  assert.match(withPreset, /runBatch\(\)/);
  assert.match(D.me.queue({ file: '/r/a.mp4', start: false }), /fe\.addItemToBatch\("\/r\/a\.mp4"\)/);
  assert.doesNotMatch(D.me.queue({ file: '/r/a.mp4', start: false }), /runBatch/);
});

step('every generated script parses, and the wrapper returns JSON (ES3 serializer)', () => {
  const all = [D.ps.open('/a'), D.ps.docs(), D.ps.actions(), D.ps.board({ items: [{ path: '/a.png', name: 'A', x: 0, y: 0, w: 10, h: 10 }], w: 100, h: 100, out: '/o.psd' }), D.ps.action({ set: 'S', action: 'A', file: '/f' }), D.ps.sizes({ sizes: D.SIZES, dir: '/d', format: 'jpg' }), D.ps.back({ out: '/b.png' }), D.ps.place({ file: '/p.png' }),
    D.ai.open('/a.ai'), D.ai.svg({ file: '/a.ai', out: '/o.svg' }), D.ai.png({ out: '/o.png' }), D.ai.place({ file: '/p' }), D.ai.docs(), D.id.open('/a'), D.id.pdf({ out: '/o.pdf' }), D.id.place({ file: '/p' }),
    D.pr.importFiles({ files: ['/a'], sequence: 'S' }), D.pr.queue({ out: '/o.mp4', preset: '/p.epr' }), D.pr.info(), D.me.queue({ file: '/a' }), D.me.info(), D.ae.importFile({ file: '/a', comp: true }), D.ae.open('/a.aep')];
  for (const s of all) new Function(D.wrap(s, '/r.json'));
  const r = JSON.parse(eval(D.wrap('return { a: [1, "x\\"\\n", null], b: { c: true } };')));
  assert.deepStrictEqual(r, { ok: true, value: { a: [1, 'x"\n', null], b: { c: true } } });
  assert.deepStrictEqual(JSON.parse(eval(D.wrap('throw new Error("no doc")'))), { ok: false, error: 'no doc' });
  assert.match(D.ps.board({ items: [], w: 10, h: 10 }), /ElementPlacement\.PLACEATBEGINNING/);
});

step('board → layered PSD layout (positions, z order, scale)', () => {
  const L = D.boardLayout([{ type: 'image', src: '/b.png', x: 100, y: 100, w: 200, h: 100, z: 2 }, { type: 'image', src: '/a.png', x: 0, y: 0, w: 100, h: 100, z: 1 }, { type: 'video', src: '/v.mp4', x: 0, y: 0, w: 10, h: 10 }, { type: 'note', text: 'hi', x: 0, y: 0, w: 1, h: 1 }], { pad: 0 });
  assert.strictEqual(L.items.length, 2, 'pictures only');
  assert.strictEqual(L.items[0].path, '/a.png', 'bottom first');
  assert.deepStrictEqual([L.w, L.h], [450, 300]);
  assert.strictEqual(D.boardLayout([]), null);
  assert.deepStrictEqual(D.pickSizes('9:16 and 1:1').map((s) => s.name), ['1080x1920', '1080x1080']);
  assert.deepStrictEqual(D.pickSizes('2000x500').map((s) => [s.w, s.h]), [[2000, 500]]);
  assert.strictEqual(D.pickSizes('socials').length, 4);
});

step('FCP XML for Premiere (cuts, shared files, audio, rate, notes)', () => {
  const edit = { clips: [{ kind: 'video', src: '/v/a b.mp4', in: 1, out: 3 }, { kind: 'video', src: '/v/a b.mp4', in: 5, out: 6, speed: 2, mute: true }, { kind: 'freeze', at: 1, dur: 1 }], tracks: [{ type: 'audio', name: 'Music', items: [{ kind: 'audio', src: 'C:\\m\\song.wav', start: 0, in: 0, out: 4 }] }, { type: 'text', name: 'Titles', items: [{ kind: 'title', text: 'Hi', start: 0, dur: 1 }] }] };
  const x = D.toFcpXml(edit, { fps: 29.97, w: 1080, h: 1920, name: 'Intro <v2>' });
  assert.match(x.xml, /<xmeml version="4">/);
  assert.match(x.xml, /<name>Intro &lt;v2&gt;<\/name>/);
  assert.match(x.xml, /<timebase>30<\/timebase><ntsc>TRUE<\/ntsc>/);
  assert.match(x.xml, /<width>1080<\/width><height>1920<\/height>/);
  assert.match(x.xml, /<pathurl>file:\/\/localhost\/v\/a%20b\.mp4<\/pathurl>/);
  assert.match(x.xml, /<pathurl>file:\/\/localhost\/C:\/m\/song\.wav<\/pathurl>/);
  assert.strictEqual((x.xml.match(/<file id="file-1">/g) || []).length, 1, 'a file is described once, then referenced');
  assert.match(x.xml, /<file id="file-1"\/>/);
  assert.match(x.xml, /<clipitem id="video-clip-1">[\s\S]*?<start>0<\/start><end>60<\/end><in>30<\/in><out>90<\/out>/);
  assert.ok(!/audio-clip-2/.test(x.xml), 'a muted clip has no audio');
  assert.ok(x.notes.some((n) => /speed 2×/.test(n)) && x.notes.some((n) => /freeze/.test(n)) && x.notes.some((n) => /title/.test(n)));
  // the real editor's layout (CutData) gives the same cut points
  const CutData = require('../tools/cut-data.js');
  const y = D.toFcpXml(CutData.normalize ? CutData.normalize({ clips: [{ kind: 'video', src: '/v/a.mp4', in: 0, out: 2 }, { kind: 'video', src: '/v/b.mp4', in: 1, out: 2 }] }) : { clips: [] }, { fps: 30, layout: CutData.layout });
  assert.match(y.xml, /<start>60<\/start><end>90<\/end><in>30<\/in><out>60<\/out>/);
});

step('Windows: Program Files\\Adobe, the VBScript for COM, InDesign reads its code', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  const pf = path.join(tmp, 'pf');
  process.env.ProgramFiles = pf;
  fs.mkdirSync(path.join(pf, 'Adobe', 'Adobe Photoshop 2026'), { recursive: true });
  fs.writeFileSync(path.join(pf, 'Adobe', 'Adobe Photoshop 2026', 'Photoshop.exe'), '');
  fs.mkdirSync(path.join(pf, 'Adobe', 'Adobe Illustrator 2026', 'Support Files', 'Contents', 'Windows'), { recursive: true });
  fs.writeFileSync(path.join(pf, 'Adobe', 'Adobe Illustrator 2026', 'Support Files', 'Contents', 'Windows', 'Illustrator.exe'), '');
  const s = A.status();
  const ps = s.apps.find((a) => a.id === 'photoshop');
  assert.strictEqual(ps.found, true); assert.ok(ps.path.endsWith('Photoshop.exe'));
  assert.strictEqual(ps.version, '2026');
  assert.strictEqual(s.apps.find((a) => a.id === 'illustrator').found, true);
  assert.match(s.apps.find((a) => a.id === 'premiere').reason, /Program Files\\Adobe/);
  fs.writeFileSync(path.join(bin, 'cscript'), `#!/bin/sh\ncp "$2" "${tmp}/last.vbs"\necho '{"ok":true,"value":{"docs":0}}'\n`, { mode: 0o755 });
  const r = await A.run('photoshop', D.ps.docs());
  assert.deepStrictEqual(r.value, { docs: 0 });
  const vbs = fs.readFileSync(path.join(tmp, 'last.vbs'), 'utf8');
  assert.match(vbs, /CreateObject\("Photoshop\.Application"\)/);
  assert.match(vbs, /r = app\.DoJavaScriptFile\(".*photoshop-.*\.jsx"\)/);
  assert.match(D.vbscript(D.app('id'), 'C:\\a.jsx'), /LoadFromFile "C:\\a\.jsx"[\s\S]*app\.DoScript\(code, 1246973031\)/);
  await A.installBridge();
  const sys = fs.readFileSync(path.join(tmp, 'system.log'), 'utf8');
  assert.ok(sys.includes('reg add HKCU\\Software\\Adobe\\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f'));
});

step('other systems: a clear sentence', () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  const s = A.status();
  assert.ok(s.apps.filter((a) => a.how !== 'ae').every((a) => !a.found && /only runs on macOS and Windows/.test(a.reason)));
});

(async () => {
  let failed = 0;
  for (const [name, fn] of steps) {
    try { await fn(); console.log(`✓ ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.stack.split('\n').slice(0, 8).join('\n  ')}`); }
  }
  Object.defineProperty(process, 'platform', { value: realPlatform });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `${failed} of ${steps.length} failed` : `adobe: all ${steps.length} passed`);
  process.exit(failed ? 1 : 0);
})();
