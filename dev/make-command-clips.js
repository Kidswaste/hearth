#!/usr/bin/env node
// Makes the Commands page's real clips: Hearth doing each principal command, recorded by Hearth itself with the
// capture tour machinery (CaptureTour.run: open a tool, record it, run the command, stop) in the smoke harness
// (a throwaway copy, fake engines), then cut and shrunk with ffmpeg into small looping MP4s in assets/cmd-clips/
// (no sound, ≈ 3–4 s, 12 fps, 640 px wide), listed in cmdpage-clips.js. A command whose tour fails keeps its SVG preview.
//   node dev/make-command-clips.js            # every clip below
//   node dev/make-command-clips.js size still # only these
// Needs ffmpeg on PATH and the Electron at /opt/hearth-electron (dev/smoke.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'cmd-clips');
const MANIFEST = path.join(ROOT, 'cmdpage-clips.js');
// name → tour (steps as in /tour run; "record <target>" starts the take, "stop" ends it)
const LAB = 'open three\nwait 2.5s\ncmd /fps 30\nwait 0.5s'; // a lighter preview while recording (the headless GPU is slow)
const CHAT = 'open claude\nwait 0.5s';
const said = (line, after = 2.2) => `${CHAT}\nrecord tool\nwait 1.5s\ntype "${line}"\nsend\nwait ${after}s\nstop`;
const warm = 'type "hello, a short answer please"\nsend\nwait 2.5s';
const CLIPS = {
  // the Lab (the owner's day)
  size: `${LAB}\nrecord tool\nwait 1.5s\ncmd /size 16:9\nwait 1.8s\ncmd /size 9:16\nwait 2s\ncmd /size fit\nstop`,
  shuffle: `${LAB}\nrecord tool\nwait 1.5s\ncmd /shuffle\nwait 0.9s\ncmd /shuffle colors\nwait 0.9s\ncmd /shuffle wild\nwait 1s\nstop`,
  'save-sliders': `${LAB}\nrecord tool\nwait 1.5s\ncmd /shuffle colors\nwait 1.5s\nclick "Save"\nwait 1.4s\nstop`,
  tap: `${LAB}\nrecord tool\nwait 1.5s\ncmd /tap\nwait 0.45s\ncmd /tap\nwait 0.45s\ncmd /tap\nwait 0.45s\ncmd /tap\nwait 0.6s\ncmd /tap 128\nwait 1s\nstop`,
  freeze: `${LAB}\nrecord tool\nwait 1.5s\nwait 0.8s\ncmd /freeze\nwait 1.3s\ncmd /freeze off\nwait 1.5s\nstop`,
  present: `${LAB}\nrecord window\nwait 1.5s\ncmd /present\nwait 1.6s\nkey Escape\nwait 0.6s\nstop`,
  sketches: `${LAB}\nrecord tool\nwait 1.5s\ncmd /sketches browse\nwait 2.2s\nkey Escape\nstop`,
  scene: `${LAB}\nrecord window\nwait 1.5s\ncmd /scene new\nwait 2s\nstop`,
  look: `${LAB}\nrecord tool\nwait 1.5s\ncmd /save-look Calm\nwait 0.4s\ncmd /shuffle wild\nwait 0.9s\ncmd /look Calm\nwait 1.2s\nstop`,
  still: `${LAB}\ncmd /size 9:16\nwait 0.6s\nrecord tool\nwait 1.5s\ncmd /still\nwait 1.8s\ncmd /size fit\nstop`,
  sequence: `${LAB}\nrecord tool\nwait 1.5s\ncmd /sequence\nwait 2.2s\ncmd /sequence\nwait 0.5s\nstop`,
  decide: `${LAB}\nrecord tool\nwait 1.5s\ncmd /decide look\nwait 3s\nstop`,
  jam: `${LAB}\nrecord window\nwait 1.5s\ncmd /jam an ember tunnel\nwait 3s\ncmd /jam stop\nstop`,
  live: `${LAB}\nrecord tool\nwait 1.5s\nclick "Live"\nwait 1.6s\nkey Escape\nstop`,
  // chats
  help: `${CHAT}\nrecord window\nwait 1.5s\ncmd /help\nwait 2s\nkey Escape\nstop`,
  new: `${CHAT}\nrecord tool\nwait 1.5s\ntype "/new"\nsend\nwait 0.6s\ntype "a fresh idea for a scene"\nwait 1.5s\nstop`,
  compact: `${CHAT}\n${warm}\nrecord tool\nwait 1.5s\ntype "/compact"\nsend\nwait 2.6s\nstop`,
  stop: `${CHAT}\nrecord tool\nwait 1.5s\ntype "slow long story about embers"\nsend\nwait 1.6s\ntype "/stop"\nsend\nwait 1s\nstop`,
  retry: `${CHAT}\n${warm}\nrecord tool\nwait 1.5s\ntype "/retry"\nsend\nwait 2.6s\nstop`,
  copy: `${CHAT}\n${warm}\nrecord tool\nwait 1.5s\ntype "/copy"\nsend\nwait 1.2s\nstop`,
  read: `${CHAT}\n${warm}\nrecord tool\nwait 1.5s\ntype "/read"\nsend\nwait 1.6s\ntype "/read stop"\nsend\nstop`,
  undo: `${CHAT}\nrecord tool\nwait 1.5s\ntype "/rename Ember tests"\nsend\nwait 1.5s\ntype "/undo"\nsend\nwait 1.2s\nstop`,
  screenshot: said('/screenshot', 2.2),
  astra: `${CHAT}\nrecord window\nwait 1.5s\ntype "/astra hello from the Claude chat"\nsend\nwait 1.5s\nopen astra\nwait 2.4s\nstop`,
  claude: `open astra\nwait 0.5s\nrecord window\nwait 1.5s\ntype "/claude hello from Astra's chat"\nsend\nwait 1.5s\nopen claude\nwait 2.4s\nstop`,
  handoff: `${CHAT}\n${warm}\nrecord tool\nwait 1.5s\ntype "/handoff"\nsend\nwait 3s\nstop`,
  opinion: `${CHAT}\n${warm}\nrecord tool\nwait 1.5s\ntype "/opinion"\nsend\nwait 3s\nstop`,
  doctor: said('/doctor', 2.6),
  intro: said('/intro a 15 s teaser: two AIs, one window', 3),
  'board-use': `open board\nwait 1.5s\n${CHAT}\nrecord tool\nwait 1.5s\ntype "/board-use"\nsend\nwait 1.6s\nstop`,
  // tools and the app
  board: `${CHAT}\nrecord window\nwait 1.5s\ncmd /board\nwait 2s\nstop`,
  editor: `open ae\nwait 1.5s\nrecord window\nwait 1.5s\ncmd /editor on\nwait 2.2s\nstop`,
  settings: `${CHAT}\nrecord window\nwait 1.5s\ncmd /settings\nwait 1.8s\nkey Escape\nstop`,
  theme: `${CHAT}\nrecord window\nwait 1.5s\ncmd /theme next\nwait 1.1s\ncmd /theme next\nwait 1.1s\ncmd /theme prev\nwait 0.3s\ncmd /theme prev\nstop`,
  usage: `${CHAT}\nrecord window\nwait 1.5s\ncmd /usage\nwait 2.2s\nkey Escape\nstop`,
  flows: `${CHAT}\nrecord window\nwait 1.5s\ncmd /flows\nwait 1s\nclick ".cp-flowrow"\nwait 1.4s\nstop`,
  flow: `${CHAT}\nrecord window\nwait 1.5s\ncmd /flow doctor\nwait 2.4s\nstop`,
  commands: `${CHAT}\nrecord window\nwait 1.5s\ncmd /commands\nwait 1.5s\nhover ".cp-row[data-name=size]"\nwait 1.5s\nclick ".cp-row[data-name=size]"\nwait 1.5s\nclick ".cp-use"\nwait 1.2s\nstop`,
  capture: `${CHAT}\nrecord window\nwait 1.5s\ncmd /capture library\nwait 2s\nkey Escape\nstop`,
  rec: `${CHAT}\nrecord window\nwait 1.5s\ncmd /captures\nwait 1.8s\nkey Escape\nstop`,
  do: `${CHAT}\nrecord window\nwait 1.5s\ncmd /do\nwait 1.6s\nkey Escape\nstop`,
};

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = want.length ? want.filter((n) => CLIPS[n]) : Object.keys(CLIPS);
if (!names.length) { console.error(`No clip for ${want} (known: ${Object.keys(CLIPS).join(' ')})`); process.exit(2); }
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg is needed'); process.exit(2); }

// the in-app script: each tour in turn (a calm start between them), the recordings' paths back as JSON
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-clips-'));
const script = path.join(tmp, 'clips-check.js');
fs.writeFileSync(script, `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TOURS = ${JSON.stringify(Object.fromEntries(names.map((n) => [n, CLIPS[n]])))};
const out = {};
activate(H.claudeAgent().id); await wait(800); Native.newChat(H.claudeAgent().id); await wait(400);
try { const a = H.agents().find((x) => x.mode === 'native' && x.engine === 'codex'); if (a) { activate(a.id); await wait(500); Native.newChat(a.id); } } catch {}
for (const [name, tour] of Object.entries(TOURS)) {
  try {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const r = await CaptureTour.run(tour, { name: 'clip ' + name });
    out[name] = { path: r.recording?.path || null, duration: r.recording?.duration || 0, skipped: r.skipped };
  } catch (err) { out[name] = { error: String(err.message || err) }; }
  if (Capture.recording) { try { await Capture.stop({ quiet: true }); } catch {} }
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(500);
}
return JSON.stringify({ clips: out });
`);
console.log(`recording ${names.length} clips in a throwaway Hearth…`);
const r = spawnSync('node', [path.join(__dirname, 'smoke.js'), '--fake-engines', '--keep', '--check-timeout', '1500000', '--script', script, '--shot', path.join(tmp, 'end.png')], { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20 });
const text = `${r.stdout || ''}${r.stderr || ''}`;
fs.writeFileSync(path.join(tmp, 'smoke.log'), text);
const m = text.match(/\{"clips":[\s\S]*?\}\}\s*$/m) || text.match(/\{"clips":.*\}/);
if (!m) { console.error(`no result (log: ${path.join(tmp, 'smoke.log')})`); process.exit(1); }
const res = JSON.parse(m[0]).clips;
const kept = (text.match(/kept: (\S+)/) || [])[1];
fs.mkdirSync(OUT, { recursive: true });
const made = {};
for (const n of names) {
  const c = res[n];
  const dst = path.join(OUT, `${n}.mp4`);
  // a take shorter than 1.2 s shows nothing worth looping: that command keeps its animation
  if (c?.path && (c.duration || 0) < 1.2) { console.log(`– ${n.padEnd(14)} too short (${(c.duration || 0).toFixed(2)} s): its animation stays`); try { fs.rmSync(dst, { force: true }); } catch {} continue; }
  if (!c?.path || !fs.existsSync(c.path)) { console.log(`✖ ${n.padEnd(14)} ${c?.error || (c?.skipped || []).join(' · ') || 'no recording'}`); continue; }
  // the last ≈ 4 s (the start can hold a still frame while the encoder warms up), 12 fps, 640 px wide, small H.264
  const len = Math.max(1, Math.min(4, (c.duration || 4)));
  const ss = Math.max(0, (c.duration || len) - len);
  const f = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', ss.toFixed(2), '-i', c.path, '-t', len.toFixed(2), '-an', '-vf', 'fps=12,scale=640:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '32', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-movflags', '+faststart', dst], { encoding: 'utf8' });
  if (f.status !== 0 || !fs.existsSync(dst)) { console.log(`✖ ${n.padEnd(14)} ffmpeg: ${(f.stderr || '').split('\n')[0]}`); continue; }
  made[n] = `assets/cmd-clips/${n}.mp4`;
  console.log(`✓ ${n.padEnd(14)} ${(fs.statSync(dst).size / 1024).toFixed(0).padStart(4)} KB${c.skipped?.length ? `  (skipped: ${c.skipped.join(' · ').slice(0, 120)})` : ''}`);
}
// the manifest keeps clips made earlier (a partial run adds to it)
let all = {};
try { const s = fs.readFileSync(MANIFEST, 'utf8'); all = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1) || '{}'); } catch { all = {}; }
for (const n of names) if (made[n]) all[n] = made[n];
for (const n of Object.keys(all)) if (!fs.existsSync(path.join(ROOT, all[n]))) delete all[n];
const total = Object.values(all).reduce((s, p) => s + fs.statSync(path.join(ROOT, p)).size, 0);
fs.writeFileSync(MANIFEST, `// Commands page clips (round 11): real recorded mini clips of Hearth doing the principal commands, made by
// dev/make-command-clips.js (which rewrites this file). A command without a clip uses its SVG preview.
const CmdClips = ${JSON.stringify(Object.fromEntries(Object.entries(all).sort()), null, 2)};
`);
console.log(`\n${Object.keys(made).length}/${names.length} clips made · ${Object.keys(all).length} in the manifest · ${(total / 1048576).toFixed(2)} MB in assets/cmd-clips`);
if (kept && kept.includes('hearth-smoke-')) fs.rmSync(kept, { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
