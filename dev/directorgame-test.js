#!/usr/bin/env node
// (round 53, directorgame) The Three Director play-tests the owner's game (Clink) cheaply: node tests, no Electron.
//   - the script: what it understands, the owner's keys refused, a walk-about / repeats that fill secs, the timed ops
//   - a fake game page (a vm "window": Coin Run's rules, a scene with a camera, window.game, rAF on a virtual clock,
//     a stutter every 200 frames; variants: D does nothing, a jump throws at game.js:42) and the REAL hub side
//     (tools/directorgame.js) and page probe (DirectorGameCore.probe) on it, input applied the way directorgamemain.js
//     plays it (its ops on the page's clock)
//   - five typical play-tests the owner asks for, as one chat message each: steps and tokens (input over the steps:
//     the fixed part, measured with dev/promptdiet-measure.js, + what the reply holds so far), locked in BUDGET
//   - safety: the owner's own game gets no input and isn't closed; the session ends with the chat's reply; Esc refused
//   node dev/directorgame-test.js           checks + the table
//   node dev/directorgame-test.js --json    the numbers
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../tools/directorgame-core.js');
const PerfCore = require('../tools/gameperf-core.js');

const ROOT = path.join(__dirname, '..');
const fails = [];
const check = (ok, label, detail) => { console.log(`${ok ? '✓' : '✖'} ${label}${!ok && detail ? `\n${String(detail).replace(/^/gm, '    ')}` : ''}`); if (!ok) fails.push(label); };
const tok = (s) => Math.ceil(String(s ?? '').length / 4);
const JSON_OUT = process.argv.includes('--json');
if (JSON_OUT) console.log = () => {};

// per typical play-test: at most these steps and input tokens over its steps (fixed part ≈ 2.1k a step)
const BUDGET = { feel: [2, 4700], jump: [2, 4420], crash: [2, 4500], look: [2, 4550], stutter: [2, 4650] };
// what one result may weigh (tokens), and the fixed part per step (no growth from this stream)
const RESULT_MAX = { run: 130, perf: 260, shot: 130 };
const FIXED_MAX = 2127;

// ---------- the fake game page ----------
const GAME_JS = Array.from({ length: 60 }, (_, i) => `// game.js line ${i + 1}`);
GAME_JS[41] = '  const tip = coins[nearest].position.x; // line 42';
function makePage({ dIgnored = false, jumpThrows = false, hz = 60, title = 'Clink' } = {}) {
  const P = { t: 0, raf: [], listeners: {}, keys: {}, yaw: 0, vy: 0, frame: 0, locked: false };
  const L = (type) => (P.listeners[type] ||= []);
  const fire = (type, e) => { for (const f of [...L(type)]) f(e); };
  const elems = new Array(16).fill(0); elems[10] = 1;
  const camera = { isCamera: true, position: { x: 0, y: 4, z: 6 }, matrixWorld: { elements: elems }, updateMatrixWorld() { elems[8] = Math.sin(P.yaw); elems[10] = Math.cos(P.yaw); } };
  const objs = 214;
  const scene = { isScene: true, traverse(fn) { for (let i = 0; i < objs; i += 1) fn({ name: i === 3 ? 'coin' : '' }); } };
  const game = { score: 0, lives: 3, x: 0, y: 0.4, z: 0, state: 'playing', frames: 0 };
  const win = {
    __scenes: { World: { scene, camera, renderer: {} } }, game, innerWidth: 1600, innerHeight: 1000,
    document: { title, get pointerLockElement() { return P.locked ? {} : null; } },
    performance: { now: () => P.t }, console: { error: () => {}, log: () => {}, warn: () => {} },
    addEventListener: (type, fn) => L(type).push(fn), requestAnimationFrame: (fn) => P.raf.push(fn),
    fetch: async (url) => ({ text: async () => (/game\.js/.test(url) ? GAME_JS.join('\n') : '') }),
    Node: function Node() {}, JSON, Math, Object, Array, String, Number, Error, Promise, Set, Map,
  };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  // the game's own frame: Coin Run's rules (W/S/A/D, Space jumps, the mouse turns), drawn by rAF at the screen's rate
  const step = (dt) => {
    const k = P.keys; const sp = 5 * dt;
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0); const s = (dIgnored ? 0 : (k.KeyD ? 1 : 0)) - (k.KeyA ? 1 : 0);
    game.x += (Math.sin(P.yaw) * -f + Math.cos(P.yaw) * s) * sp; game.z += (Math.cos(P.yaw) * -f - Math.sin(P.yaw) * s) * sp;
    if (k.Space && game.y <= 0.41) { P.vy = 5; if (jumpThrows) fire('error', { message: "Uncaught TypeError: Cannot read properties of undefined (reading 'position')", filename: 'hearth-game://abc/game.js', lineno: 42, colno: 22 }); }
    P.vy -= 12 * dt; game.y = Math.max(0.4, game.y + P.vy * dt);
    if (Math.hypot(game.x - 0, game.z + 6) < 1 && game.score === 0) game.score = 1;
    game.frames += 1;
  };
  function tick(ms) {
    const end = P.t + ms;
    while (P.t < end) {
      P.frame += 1;
      const dt = P.frame % 200 === 0 ? 60 : 1000 / hz; // a stutter every 200 frames
      P.t += dt;
      step(dt / 1000);
      const cbs = P.raf; P.raf = [];
      for (const cb of cbs) cb(P.t);
    }
  }
  const keyCode = (k) => (k.length === 1 ? `Key${k}` : k);
  const page = {
    P, game, win,
    eval: (code) => vm.runInContext(code, ctx),
    // what directorgamemain.js does with each op, on the page's clock
    async play(ops) {
      let t = 0;
      for (const op of [...ops].sort((a, b) => a.at - b.at)) {
        if (op.at > t) { tick(op.at - t); t = op.at; }
        if (op.do === 'down') { P.keys[keyCode(op.key)] = true; fire('keydown', { code: keyCode(op.key) }); }
        else if (op.do === 'up') { P.keys[keyCode(op.key)] = false; fire('keyup', { code: keyCode(op.key) }); }
        else if (op.do === 'move') { if (P.locked) P.yaw -= op.dx * 0.003; fire('mousemove', { movementX: op.dx }); }
        else if (op.do === 'click') P.locked = true;
        else if (op.do === 'mark') page.eval(`window.__dgPlay && window.__dgPlay.mark(${op.i})`);
      }
      tick(40);
      return { ok: true, why: 'done', ms: t };
    },
    tick,
  };
  tick(500); // it has been drawing a while
  return page;
}

// ---------- gameperf's few lines for a Clink-like session (the real GamePerfCore) ----------
function perfText() {
  const scene = { calls: 420, tris: 380000, pr: 2, prNow: 2, dpr: 2, buffer: [3200, 2000], screen: [1600, 1000], aa: true, toneMapping: 4, colorSpace: 'srgb', programs: 14, instancing: [{ n: 300, name: 'crate', mat: 'MeshStandardMaterial' }], merge: [], transparent: 12,
    textures: [{ w: 4096, h: 4096, name: 'ground', aniso: 1 }], aniso: { max: 16, low: 1 }, shadows: { enabled: true, type: 2, everyFrame: true, casters: 300, lights: [{ type: 'DirectionalLight', size: 2048 }], lightsMove: false, castersMove: false } };
  const raw = { hz: 60, frames: 1800, dts: Array(1800).fill(16.7).map((x, i) => (i % 200 === 0 ? 60 : x)), works: Array(1800).fill(9), dur: 30000,
    slow: [{ t: 4000, dt: 140, work: 130, render: 128, shaderMs: 120 }, { t: 12000, dt: 60, work: 20, render: 16, gc: true }],
    alloc: { bytes: 12 * 1048576, gcs: 9 }, shaders: { n: 14, ms: 300, late: [{ t: 4000, ms: 120 }] }, textures: { n: 6, ms: 40, mb: 90, late: [] }, long: [], layout: { ms: 2, mutations: 3 }, scene };
  const code = 'import * as THREE from "three";\nfunction update(dt) {\n  for (const c of coins) {\n    const v = new THREE.Vector3(0, 1, 0);\n    c.position.add(v.multiplyScalar(dt));\n  }\n}\nrenderer.setAnimationLoop(() => { update(0.016); renderer.render(scene, camera); });';
  const R = PerfCore.summarize(raw);
  return PerfCore.compact(R, PerfCore.doctor(R, PerfCore.scanSource(code, { layer: 'World' })), { name: 'Clink' });
}

// ---------- the hub side, loaded as the app loads it, on the fake page ----------
function harness(pageOpts = {}, { ownerPlaying = false } = {}) {
  const page = makePage(pageOpts);
  const calls = { play: 0, leave: 0, script: 0, shots: 0 };
  const listeners = [];
  const src = { kind: 'lab', id: 's1', title: 'Clink' };
  const GM = {
    now: ownerPlaying ? { source: src, info: { hz: 60, how: 'one canvas (3 of 3 layers) · page (ready)' } } : null,
    state() { return { playing: Boolean(this.now), source: this.now?.source || null, info: this.now?.info || null }; },
    async resolve(x) { return !x || /clink|last/i.test(x) ? { ...src } : null; },
    async play(s) { calls.play += 1; this.now = { source: s, info: { hz: 60, how: 'one canvas (3 of 3 layers) · page (ready)' } }; return { playing: true, route: 'page', hz: 60, how: this.now.info.how, title: s.title }; },
    leave() { calls.leave += 1; const s = this.now?.source; this.now = null; for (const f of listeners) f({ type: 'end', source: s }); return true; },
    on(f) { listeners.push(f); return () => {}; },
    get playing() { return Boolean(this.now); },
  };
  const handlers = {}; const cmds = {}; const hooks = { event: [] };
  const timers = new Set();
  const g = {
    console: { info: () => {}, warn: () => {}, log: () => {} },
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); if (ms >= 60000) t.unref?.(); timers.add(t); return t; }, clearTimeout: (t) => clearTimeout(t),
    DirectorGameCore: C, GameMode: GM, Lazy: { load: async () => {} },
    HubBridge: { register(prefixes, fn) { for (const p of prefixes) handlers[p] = fn; } },
    Native: { hooks }, Commands: { get: () => null, register: (d) => { cmds[d.name] = d; } },
    GamePerf: { target: { label: 'Clink' }, attach: async () => ({}), directorTool: async () => ({ ok: true, value: perfText() }) },
    window: { hub: {
      game: { eval: async (code) => { page.tick(50); try { return { value: await page.eval(code) }; } catch (e) { return { error: e.message }; } } },
      gameTest: { script: async ({ ops }) => { calls.script += 1; if (!GM.now) return { ok: false, why: 'not playing' }; return page.play(ops); }, stop: async () => true,
        shot: async () => { calls.shots += 1; return { data: Buffer.alloc(9000).toString('base64'), mime: 'image/jpeg', w: 384, h: 240 }; } },
    } },
  };
  vm.createContext(g);
  vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'tools/directorgame.js'), 'utf8')}\nthis.DirectorGame = DirectorGame;`, g);
  const play = (args, chatId = 'c1') => handlers.three_play('three_play', args, { chatId });
  return { page, play, calls, GM, hooks, cmds, D: g.DirectorGame };
}
const imgTok = (w, h) => Math.round((w * h) / 750);

// ---------- five typical play-tests (one chat message each) ----------
const TASKS = [
  { key: 'feel', label: 'play Clink for 30 s, tell me what feels off', opts: { dIgnored: true }, calls: [{ game: 'Clink', secs: 30, script: 'click, hold W 2 s, jump, look left 60, hold D 1 s, hold S 1 s, look right 90', perf: true }] },
  { key: 'jump', label: 'does jumping work?', calls: [{ game: 'Clink', script: 'jump, wait 0.5 s, jump x2' }] },
  { key: 'crash', label: 'something breaks when I jump', opts: { jumpThrows: true }, calls: [{ game: 'Clink', script: 'hold W 1 s, jump' }] },
  { key: 'look', label: 'walk forward and show me', calls: [{ game: 'Clink', script: 'hold W 2 s', shot: true }] },
  { key: 'stutter', label: 'why does it stutter while I play?', calls: [{ game: 'Clink', secs: 10, perf: true }] },
];
function fixedPart() {
  const { measure } = require('./promptdiet-measure');
  return measure(ROOT).find((r) => r.key === 'director').total;
}

(async () => {
  // ---------- the script ----------
  const p = C.parse('hold W 2 s, jump, look left');
  check(!p.error && p.steps.map((s) => s.kind).join() === 'move,jump,look' && p.steps[0].ms === 2000 && p.steps[2].dx < 0, 'parse: hold W 2 s, jump, look left');
  const q = C.parse('run forward 1s; W+D 1 s then jump x3; click 0.2 0.8; wait 500ms; press e; look right 45; strafe left 0.5 s');
  check(!q.error && q.steps.length === 10 && q.steps[0].keys.join() === 'Shift,W' && q.steps[1].keys.join() === 'W,D' && q.steps[5].x === 0.2 && q.steps[6].ms === 500 && q.steps[7].keys[0] === 'E' && q.steps[9].keys[0] === 'A', 'parse: run, combos, repeats, click at, wait ms, a key, strafe');
  check(/owner's key/.test(C.parse('press esc').error || '') && /owner's key/.test(C.parse('hold cmd+q').error || ''), 'the owner\'s keys (Esc, ⌘) are refused');
  check(/don't know "dance"/.test(C.parse('jump, dance').error || ''), 'an unknown step: says which and what it understands');
  const ex = C.explore(30); const exMs = C.lengthOf(ex);
  check(ex[0].kind === 'click' && exMs >= 30000 && exMs < 33000, `a walk-about fills 30 s (${exMs} ms, ${ex.length} steps, a click first)`);
  const fl = C.fill(C.parse('jump').steps, 5);
  check(fl.length >= 6 && C.lengthOf(fl) >= 5000, 'secs repeats a short script');
  const tl = C.timeline(p.steps);
  check(tl.ops[0].do === 'mark' && tl.ops.filter((o) => o.do === 'move').length === 10 && tl.ops.find((o) => o.do === 'up' && o.key === 'W').at === 2000 && tl.ops.at(-1).i === 3, 'timeline: marks, the held key let go on time, the look spread over 10 moves');
  check(new Function(`return (${C.probe.toString()})`)().length === 1, 'the page probe stands alone (it goes to the game as text)');

  // ---------- a run on the fake game ----------
  {
    const h = harness();
    const r = await h.play({ game: 'Clink', script: 'click, hold W 2 s, jump, look left, hold D 1 s' });
    const t = r.value || r.error;
    check(r.ok && /^▶ Clink started \(one canvas/.test(t), 'one call starts the game (▶ Play) and plays it');
    check(/fps (59|6\d) \(60 Hz\)/.test(t) && /worst 60 ms/.test(t) && /\d+ stutters?/.test(t), 'fps vs the screen, the worst frame, stutters', t);
    check(/player 0,0\.4,0 → [-\d.]+,0\.4,[-\d.]+ \(moved [1-9]/.test(t), 'where the player went (from window.game)');
    check(/steps ✓ 4\/4/.test(t), 'every step judged ✓ (moves moved, the jump rose, the look turned)');
    check(/state: .*score 0→1/.test(t) && /lives/.test(t) === false, 'the state that changed (score), the rest counted');
    check(/errors: none/.test(t) && /off: nothing obvious/.test(t), 'no errors, nothing off');
    check(/objects 214/.test(t) && /mouse captured/.test(t) && /keys seen [1-9]/.test(t), 'objects, the mouse captured, keys reached the page');
    const again = await h.play({ script: 'jump' });
    check(again.ok && h.calls.play === 1 && !/started/.test(again.value), 'the next call reuses the session (no second ▶ Play)');
    const st = await h.play({ op: 'state' });
    check(st.ok && /^▶ Clink · fps \d+/.test(st.value) && /state: score 1/.test(st.value) && tok(st.value) < 90, `op state: one short block (${tok(st.value)} tokens)`);
    // the reply ends → the session ends, the window closes
    h.hooks.event.forEach((f) => f({ type: 'done' }, { id: 'c1' }));
    check(h.calls.leave === 1 && !h.D.state(), 'the director\'s reply ends → the play-test ends (the game leaves)');
    h.hooks.event.forEach((f) => f({ type: 'done' }, { id: 'c1' }));
    check(h.calls.leave === 1, 'another reply end: nothing more to close');
  }
  {
    const h = harness({ dIgnored: true });
    const r = await h.play({ game: 'Clink', script: 'click, hold D 1 s, hold W 1 s' });
    check(/✗ 2 hold D 1 s: didn't move/.test(r.value) && /off: .*hold D 1 s: didn't move/.test(r.value), 'a key that does nothing: ✗ with the step, and in "off"');
  }
  {
    const h = harness({ jumpThrows: true });
    const r = await h.play({ game: 'Clink', script: 'jump' });
    check(/errors: 1/.test(r.value) && /game\.js:42 TypeError: Cannot read properties of undefined \(reading 'position'\)/.test(r.value), 'an error: file:line and the message');
    check(/fix: what's before \.position is undefined/.test(r.value) && /42> const tip = coins\[nearest\]/.test(r.value), 'its usual fix and the line itself (±1)', r.value);
  }
  {
    const h = harness();
    const r = await h.play({ game: 'Clink', script: 'hold W 1 s', shot: true });
    check(r.images?.length === 1 && /picture 384×240/.test(r.value) && h.calls.shots === 1, 'shot: true → ONE small picture');
    const r2 = await h.play({ script: 'hold W 1 s' });
    check(!r2.images && h.calls.shots === 1, 'no picture unless asked');
    const s = await h.play({ op: 'stop' });
    check(/stopped/.test(s.value) && h.calls.leave === 1, 'op stop leaves the game');
    const none = await h.play({ op: 'state' });
    check(!none.ok && /No game is playing/.test(none.error), 'nothing playing: says how to start one');
  }
  {
    const h = harness({}, { ownerPlaying: true });
    const r = await h.play({ script: 'hold W 1 s' });
    check(!r.ok && /owner is playing/.test(r.error) && h.calls.script === 0, 'the owner\'s own game: no input from a play-test');
    const st = await h.play({ op: 'state' });
    check(st.ok && /▶ Clink/.test(st.value), '… but its state can be read');
    await h.play({ op: 'stop' });
    h.hooks.event.forEach((f) => f({ type: 'done' }, { id: 'c1' }));
    check(h.calls.leave === 0 && h.GM.playing, '… and it is never closed by the director');
  }
  {
    const h = harness();
    const r = await h.play({ game: 'Clink', script: 'hold W 1 s, press escape' });
    check(!r.ok && /owner's key/.test(r.error) && h.calls.script === 0, 'Esc in a script: refused before anything is sent');
    const cmd = await h.cmds.playtest.run('Clink hold W 1 s, jump');
    check(/^▶ Clink started/.test(cmd) && /steps ✓/.test(cmd) && h.calls.leave === 1, '/playtest Clink <script>: the same run in the chat, then it leaves', cmd);
  }

  // ---------- budgets: five typical play-tests ----------
  const fixed = fixedPart();
  check(fixed <= FIXED_MAX, `the director's fixed part per step didn't grow (${fixed} ≤ ${FIXED_MAX} tokens)`);
  const helpPlay = await require('../mcp/three-mcp.js').helpOnce({ topic: 'play' }, async () => ({ ok: false }));
  check(/ONE call \{game, secs: 30, script, perf: true\}/.test(helpPlay) && tok(helpPlay) < 300, `help play: the how-to in one topic (${tok(helpPlay)} tokens, on demand only)`);
  const rows = [];
  for (const t of TASKS) {
    const h = harness(t.opts || {});
    let taskIn = 0; let mine = 0; const parts = [];
    for (let i = 0; i <= t.calls.length; i += 1) {
      taskIn += fixed + mine;
      if (i < t.calls.length) {
        const args = { cmd: 'play', ...t.calls[i] };
        const r = await h.play(t.calls[i]);
        const text = r.ok ? r.value : `Error: ${r.error}`;
        const pics = (r.images || []).length ? imgTok(384, 240) : 0;
        parts.push({ args: tok(JSON.stringify(args)), text: tok(text), pics, sample: text });
        mine += tok(JSON.stringify(args)) + tok(text) + pics;
      }
    }
    h.hooks.event.forEach((f) => f({ type: 'done' }, { id: 'c1' }));
    rows.push({ key: t.key, label: t.label, steps: t.calls.length + 1, tokens: taskIn, result: parts.reduce((n, x) => n + x.text + x.pics, 0), parts });
    const [maxSteps, maxTok] = BUDGET[t.key];
    check(t.calls.length + 1 <= maxSteps && taskIn <= maxTok, `${t.label}: ${t.calls.length + 1} steps, ${taskIn.toLocaleString()} tokens (budget ${maxSteps} · ${maxTok.toLocaleString()})`);
  }
  const feel = rows.find((r) => r.key === 'feel');
  const [runPart, perfPart] = feel.parts[0].sample.split(/\n(?=Clink: \d+ fps on)/);
  check(tok(runPart) <= RESULT_MAX.run, `a 30 s run's summary ≤ ${RESULT_MAX.run} tokens (${tok(runPart)})`);
  check(perfPart && tok(perfPart) <= RESULT_MAX.perf, `gameperf's findings ≤ ${RESULT_MAX.perf} tokens (${tok(perfPart || '')})`);
  const look = rows.find((r) => r.key === 'look').parts[0];
  check(look.pics <= RESULT_MAX.shot, `one picture ≤ ${RESULT_MAX.shot} tokens (${look.pics})`);
  check(/✗ \d+ hold D 1 s: didn't move/.test(feel.parts[0].sample) && /fix/.test(perfPart || ''), 'the 30 s run finds what is off (D does nothing) and the stutter causes with fixes');

  if (JSON_OUT) { process.stdout.write(`${JSON.stringify({ fixed, rows: rows.map(({ parts, ...r }) => ({ ...r, calls: parts.map(({ sample, ...x }) => x) })) }, null, 1)}\n`); }
  else {
    console.log(`\nfixed part ${fixed} tokens a step · steps · tokens (input over the steps) · result tokens`);
    for (const r of rows) console.log(`  ${r.label.padEnd(46)} ${r.steps} · ${r.tokens.toLocaleString().padStart(6)} · ${r.result}`);
    console.log(`\n--- sample: ${feel.label} ---\n${feel.parts[0].sample}\n`);
  }
  if (fails.length) { process.stderr.write(`\n${fails.length} failed\n`); process.exit(1); }
  if (!JSON_OUT) console.log('all passed');
})().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exit(1); });
