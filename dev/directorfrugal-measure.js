#!/usr/bin/env node
// (round 49, directorfrugal) Steps and tokens per typical Three Director task, before → after.
// Each tool step of a reply is one model inference that re-reads the whole context: the fixed part (prompt + tool
// lists, measured the way tokenaudit / promptdiet do: dev/promptdiet-measure.js on each tree) + everything the reply
// already holds (the calls' arguments and results). So steps are the real cost. Six tasks the owner gives the director
// all day run as ONE chat (one message each), scripted the way the director has to make them with each version's
// results: the round 48 base (git ref, default 40a5550: tools/three-director.js + mcp/ from that commit) and this tree.
// The "after" scripts only drop a call when the results they do get already hold what that call was for; the unit
// test (dev/directorfrugal-test.js) checks exactly that on these results. Then the same six asks once more later in
// the chat (round 2), where earlier help topics are one line.
// Fake Lab: dev/directorlean-lab.js (3 layers, a 3:12 song, sliders, errors). Text ≈ chars / 4 as the MCP server
// formats it; pictures ≈ w × h / 750; a call's arguments count too (they stay in the session like its result).
//   node dev/directorfrugal-measure.js            the table
//   node dev/directorfrugal-measure.js --json     the numbers
//   node dev/directorfrugal-measure.js --calls    every call
//   node dev/directorfrugal-measure.js --before <git ref>
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { session, fakeUrl, imageTokens, tok } = require('./directorlean-lab');
const { fmtValue } = require('../mcp/common');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const BEFORE = argv.includes('--before') ? argv[argv.indexOf('--before') + 1] : '40a5550';

// ---------- a tree of another commit (its mcp/ and the files the prompt is built from), for its help and fixed part ----------
const PROMPT_FILES = ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js', 'toolwake.js'];
const trees = new Map();
process.on('exit', () => { for (const d of trees.values()) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* temp */ } } });
function treeOf(ref) {
  if (trees.has(ref)) return trees.get(ref);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfrugal-'));
  trees.set(ref, dir);
  const have = PROMPT_FILES.filter((f) => { try { execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${ref}:${f}`], { stdio: 'ignore' }); return true; } catch { return false; } });
  const tar = execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', ref, 'mcp', ...have], { maxBuffer: 64 << 20 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  return dir;
}
function fixedOf(root) {
  const { measure } = require('./promptdiet-measure');
  return measure(root).find((r) => r.key === 'director').total;
}

// ---------- the scene's extra layer (task 1) and the Lab's own answers the base harness doesn't have ----------
const RINGS = `import * as THREE from 'three';

const P = tweak({
  count: { value: 6, min: 2, max: 16, step: 1, label: 'Rings', group: 'Shape' },
  radius: { value: 1.4, min: 0.5, max: 4, label: 'Size', group: 'Shape' },
  color: { value: '#7cf6ff', label: 'Ring color', group: 'Color' },
  pulse: { value: 0.8, min: 0, max: 2, label: 'Kick pulse', group: 'Music' },
  decay: { value: 0.88, min: 0.5, max: 0.98, label: 'Pulse decay', group: 'Music' },
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 8;
const rings = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: P.color, transparent: true }));
  scene.add(m); rings.push(m);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let punch = 0;
onHit('kick', (s) => { punch = Math.max(punch, s); });
renderer.setAnimationLoop(() => {
  punch *= P.decay ** f60;
  rings.forEach((m, i) => {
    m.visible = i < P.count;
    m.scale.setScalar(P.radius * (1 + i * 0.35) * (1 + punch * P.pulse * 0.3));
    m.material.color.set(P.color);
    m.material.opacity = 1 - i / P.count;
  });
  renderer.render(scene, camera);
});`;
// what the Lab's chat commands print (three_run → director-task.js runTool)
function runCommand(lab, command) {
  if (/^\/camera-moves/.test(command)) { lab.S.pixel += 5; return `🎥 Push in on "Tunnel" over the build (46.4–64.1 s), cine, 100 %. /camera-moves undo takes it back.`; }
  if (/^\/lab-export still/.test(command)) return 'Rendering a still: 1080×1920 PNG, ss2 … saved: C:\\Users\\owner\\Hearth\\Exports\\Neon tunnel 64.1s.png (render queue row 3).';
  return `Ran ${command}.`;
}

// ---------- one director version + its help, in one chat ----------
function harness(ref) {
  const s = session(ref);
  s.lab.S.frame = { id: 'fit', width: 1600, height: 900 }; // the Lab at fit (task 5 makes the 9:16)
  const work = ref === 'work';
  const mcpDir = work ? path.join(ROOT, 'mcp') : path.join(treeOf(ref), 'mcp');
  const three = require(path.join(mcpDir, 'three-mcp.js'));
  const ask = async (tool, a) => (s.D.seen && tool === 'three_seen' ? s.D.seen(a, { chatId: s.chat.id }) : { ok: false, error: 'no hub' });
  async function help(args) {
    if (three.helpOnce) return { ok: true, value: await three.helpOnce({ ...args, hubChatId: s.chat.id }, ask) };
    return three.local.three_do({ cmd: 'help', ...args });
  }
  async function one(tool, args, ctx = {}) {
    if (tool === 'three_help') return help(args);
    if (tool === 'three_batch') return batch(args);
    let r = await s.D.handle(tool, { ...args }, s.lab.d, { chatId: s.chat.id, ...ctx });
    if (!r) {
      if (tool === 'three_run') r = { ok: true, value: runCommand(s.lab, String(args.command || '')) };
      else r = await require('./directorlean-lab').labCall(tool, args, s.lab.d);
      if (s.D.trim) r = await s.D.trim(tool, args, r);
    }
    return r;
  }
  // bridge.js batch: ops in order, text one block per op, pictures together (ctx.batch for this tree's director)
  async function batch(args) {
    const ops = args.ops || []; const lines = []; const images = [];
    const shot = ops.some((o) => /^(three_)?(screenshot|input|contact_sheet)$/.test(String(o.cmd || '')));
    for (const [i, op] of ops.entries()) {
      const { cmd, ...a } = op;
      const r = await one(`three_${cmd}`, a, { batch: { shot } });
      images.push(...(r.images || []));
      const text = r.ok === false ? `Error: ${r.error}` : fmtValue(r.value);
      lines.push(text.includes('\n') ? `${i + 1}. ${cmd}:\n${text.replace(/^/gm, '  ')}` : `${i + 1}. ${cmd}: ${text}`);
      if (r.ok === false) break;
    }
    return { ok: true, value: lines.join('\n'), ...(images.length ? { images } : {}) };
  }
  async function call(tool, args) {
    let r;
    try { r = await one(tool, args); } catch (err) { r = { ok: false, error: err.message }; }
    const text = r.ok === false ? `Error: ${r.error}` : fmtValue(r.value);
    const pics = (r.images || []).reduce((n, im) => n + imageTokens(im.data), 0);
    // the call itself as the model wrote it (name + arguments) stays in the session too
    const argTok = tok(`${tool}${JSON.stringify(args)}`);
    return { r, text, textTok: tok(text), picTok: pics, argTok, images: (r.images || []).length };
  }
  return { s, call };
}

// ---------- the tasks ----------
const BAD = 'const pos = points.geometry.attributes.position;';
const FIX = 'const pos = points?.geometry.attributes.position;\n  if (!pos) return;';
const sparkLine = (lab) => lab.layers.find((L) => L.name === 'Sparkles').code.split('\n').findIndex((l) => l.includes(BAD)) + 1;
// the layer breaks (again): the guard is gone (an owner's undo), the preview reports the error every frame
function breakSparkles(lab) {
  const L = lab.layers.find((x) => x.name === 'Sparkles');
  if (!L.code.includes(BAD)) L.code = L.code.replace(FIX, BAD);
  lab.breakLayer('Sparkles', sparkLine(lab), "Uncaught TypeError: Cannot read properties of undefined (reading 'getY')");
}
const PALETTE = ['#0b132b', '#3a506b', '#5bc0be', '#ff9f1c', '#f7fff7'];
// a palette edit over every layer: the first colours each layer's code sets → the palette's next colour, found by the
// colour itself (asked again: the palette shifts)
function paletteEdits(lab) {
  const edits = []; let k = 0;
  for (const L of lab.layers) {
    const cols = [...new Set((L.code.match(/'#[0-9a-fA-F]{6}'/g) || []))].slice(0, 2);
    for (const c of cols) {
      let to = PALETTE[k % PALETTE.length];
      if (`'${to}'` === c) to = PALETTE[(k + 2) % PALETTE.length];
      edits.push({ layer: L.name, find: c, replace: `'${to}'` }); k += 1;
    }
  }
  return edits;
}
// Each task: label, the ask, `before` (owner actions first), and the calls each version needs ([tool, args | (lab) => args]).
// `needs` (after): what the after results must hold for the dropped calls to be truly unneeded (checked by the unit test).
const TASKS = [
  { key: 'beat', label: 'add a layer that moves with the beat', ask: 'add rings that pulse on the kick',
    before: [['three_help', { topic: 'audio' }], ['three_add_layer', { name: 'Kick rings', code: RINGS }], ['three_screenshot', {}]],
    after: [['three_help', { topic: 'audio' }], ['three_add_layer', { name: 'Kick rings', code: RINGS }]],
    needs: [[1, /errors: none/, 'the new layer runs clean'], [1, /layers: .*Kick rings/, 'the layer list'], [1, 'image', 'its picture']] },
  { key: 'fix', label: 'fix a scene with a console error', ask: 'fix it (the Lab\'s draft)',
    setup: breakSparkles,
    before: [['three_console', {}], ['three_read_code', (lab) => ({ layer: 'Sparkles', around: sparkLine(lab) })], ['three_edit_code', { layer: 'Sparkles', edits: [{ find: BAD, replace: FIX }] }], ['three_console', {}], ['three_screenshot', {}]],
    after: [['three_console', {}], ['three_edit_code', { layer: 'Sparkles', edits: [{ find: BAD, replace: FIX }] }]],
    needs: [[0, /near:\n[\s\S]*>\s*const pos = points\.geometry/, 'the lines around the error'], [0, /fix: /, 'the fix hint'], [1, /errors: none/, 'fixed'], [1, 'image', 'its picture']] },
  { key: 'palette', label: 'change colours to a palette', ask: `use this palette: ${PALETTE.join(' ')}`,
    before: [['three_get_code', {}], ['three_read_code', { layer: 'Sparkles' }], ['three_read_code', { layer: 'Glow' }], ['three_read_code', { layer: 'Tunnel' }], ['three_edit_code', (lab) => ({ edits: paletteEdits(lab) })], ['three_screenshot', {}]],
    after: [['three_get_code', {}], ['three_edit_code', (lab) => ({ edits: paletteEdits(lab) })]],
    needs: [[0, /Sparkles .*colors #ffd75e l\d+/, 'every layer\'s colours with their lines'], [0, /Glow .*colors #ff4fd8/, 'the filter\'s tint'], [1, /errors: none/, 'runs clean'], [1, 'image', 'its picture']] },
  { key: 'camera', label: 'add a camera move', ask: 'a slow push-in over the build',
    before: [['three_help', { topic: 'camera' }], ['three_help', { topic: 'lab' }], ['three_run', { command: '/camera-moves push in here 4s cine' }], ['three_screenshot', { frames: 3, gap: 0.5 }]],
    after: [['three_help', { topic: 'camera' }], ['three_batch', { ops: [{ cmd: 'run', command: '/camera-moves push in here 4s cine' }, { cmd: 'screenshot', frames: 3, gap: 0.5 }] }]],
    needs: [[0, /\/camera-moves push in/, 'help camera names the camera moves'], [1, /Push in/, 'the move'], [1, 'image', 'the strip']] },
  { key: 'vertical', label: 'make a 9:16 variant', ask: 'make a 9:16 version for Reels',
    setup: (lab) => { lab.S.frame = { id: 'fit', width: 1600, height: 900 }; lab.ownerEdit('Tunnel', 'fov: { value: 92,', 'fov: { value: 70,'); }, // asked again: back from the last variant
    before: [['three_set_frame', { size: '9:16' }], ['three_screenshot', {}], ['three_edit_code', { layer: 'Tunnel', edits: [{ find: "fov: { value: 70,", replace: "fov: { value: 92," }] }], ['three_screenshot', {}]],
    after: [['three_set_frame', { size: '9:16' }], ['three_edit_code', { layer: 'Tunnel', edits: [{ find: "fov: { value: 70,", replace: "fov: { value: 92," }] }]],
    needs: [[0, 'image', 'the new frame\'s picture'], [1, 'image', 'the fix\'s picture'], [1, /errors: none/, 'runs clean']] },
  { key: 'still', label: 'tweak a slider and render a still', ask: 'a touch more bloom, then render me a still',
    before: [['three_sliders', { layer: 'Tunnel', set: { bloom: 1.6 } }], ['three_screenshot', {}], ['three_help', { topic: 'still' }], ['three_run', { command: '/lab-export still png' }]],
    after: [['three_help', { topic: 'still' }], ['three_batch', { ops: [{ cmd: 'sliders', layer: 'Tunnel', set: { bloom: 1.6 } }, { cmd: 'run', command: '/lab-export still png' }] }]],
    needs: [[1, /bloom = 1\.6/, 'the move'], [1, /saved: /, 'the still'], [1, 'image', 'the tweak\'s picture']] },
];

async function run(ref, fixed, { rounds = 2 } = {}) {
  const { s, call } = harness(ref);
  const out = [];
  let hist = 0; let input = 0; let steps = 0;
  for (let round = 1; round <= rounds; round += 1) {
    for (const t of TASKS) {
      s.turn();
      t.setup?.(s.lab);
      if (round === 2 && t.key === 'beat') s.lab.layers.splice(s.lab.layers.findIndex((L) => L.name === 'Kick rings'), 1); // asked again: the layer is new again
      const script = ref === 'work' ? t.after : t.before;
      const calls = [];
      for (const [tool, a0] of script) {
        const a = typeof a0 === 'function' ? a0(s.lab) : a0;
        const c = await call(tool, a);
        calls.push({ tool: tool.replace(/^three_/, ''), args: a, ...c, r: undefined, ok: c.r.ok !== false });
      }
      s.done();
      // each step re-reads the fixed part + what this reply holds so far (taskIn), and the chat's whole history (chatIn)
      let taskIn = 0; let mine = 0;
      for (let i = 0; i <= calls.length; i += 1) {
        taskIn += fixed + mine; input += fixed + hist; steps += 1;
        if (i < calls.length) { const add = calls[i].argTok + calls[i].textTok + calls[i].picTok; mine += add; hist += add; }
      }
      out.push({ key: t.key, label: t.label, round, steps: calls.length + 1, calls, added: mine, tokens: taskIn });
    }
  }
  return { tasks: out, chat: { steps, input, history: hist }, fixed };
}

async function measureAll(before = BEFORE) {
  const fixedAfter = fixedOf(ROOT);
  const fixedBefore = fixedOf(treeOf(before));
  const b = await run(before, fixedBefore);
  const a = await run('work', fixedAfter);
  return { before: b, after: a, ref: before };
}

module.exports = { measureAll, run, TASKS, harness };

if (require.main === module) {
  (async () => {
    const m = await measureAll();
    const rows = m.before.tasks.map((b, i) => ({ b, a: m.after.tasks[i] }));
    const pct = (x, y) => (x ? `${Math.round(((x - y) / x) * 100)} %` : '–');
    if (argv.includes('--json')) {
      console.log(JSON.stringify({ ref: m.ref, fixed: [m.before.fixed, m.after.fixed], tasks: rows.map(({ b, a }) => ({ key: b.key, label: b.label, round: b.round, steps: [b.steps, a.steps], tokens: [b.tokens, a.tokens], added: [b.added, a.added] })), chat: { before: m.before.chat, after: m.after.chat } }, null, 1));
      return;
    }
    console.log(`Three Director: steps and input tokens per task, ${m.ref} → this tree (fixed part ${m.before.fixed} → ${m.after.fixed} tokens a step)\n`);
    for (const round of [1, 2]) {
      console.log(round === 1 ? '| task | steps | tokens (input over its steps) | saved |' : '\nThe same six asks again later in the chat:\n\n| task | steps | tokens | saved |');
      console.log('|---|---:|---:|---:|');
      const rs = rows.filter((r) => r.b.round === round);
      for (const { b, a } of rs) console.log(`| ${b.label} | ${b.steps} → ${a.steps} | ${b.tokens.toLocaleString()} → ${a.tokens.toLocaleString()} | ${pct(b.tokens, a.tokens)} |`);
      const S = (k, w) => rs.reduce((n, r) => n + r[w][k], 0);
      console.log(`| **all six** | ${S('steps', 'b')} → ${S('steps', 'a')} | ${S('tokens', 'b').toLocaleString()} → ${S('tokens', 'a').toLocaleString()} | **${pct(S('tokens', 'b'), S('tokens', 'a'))}** |`);
    }
    const cb = m.before.chat; const ca = m.after.chat;
    console.log(`\nThe whole 12-message chat: ${cb.steps} → ${ca.steps} steps; input over all its steps (fixed part + the chat's history, before the cache discount) ${cb.input.toLocaleString()} → ${ca.input.toLocaleString()} (${pct(cb.input, ca.input)}); its history ends at ${cb.history.toLocaleString()} → ${ca.history.toLocaleString()} tokens.`);
    if (argv.includes('--calls')) {
      for (const { b, a } of rows) {
        console.log(`\n${b.label} (round ${b.round})`);
        for (const [w, x] of [['before', b], ['after', a]]) for (const c of x.calls) console.log(`  ${w.padEnd(6)} ${c.tool.padEnd(12)} args ${String(c.argTok).padStart(4)} · text ${String(c.textTok).padStart(5)} · pics ${String(c.picTok).padStart(4)}${c.ok ? '' : ' ERROR'} · ${c.text.replace(/\n/g, ' ⏎ ').slice(0, 130)}`);
      }
    }
  })();
}
