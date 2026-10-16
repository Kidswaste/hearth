// ▶ Play-test (round 53, directorgame), the pure part: the Three Director plays the owner's game (Clink) in the ▶ Play
// window cheaply. Loaded by the lazy group "directorgame" (tools/directorgame.js is the hub side, directorgamemain.js
// the main side) and by node tests (module.exports).
//   parse(script)           "hold W 2 s, jump, look left" → steps (or { error })
//   explore(secs)           a walk-about that fills secs (no script given: "play it for 30 s")
//   fill(steps, secs)       the script again and again until secs
//   timeline(steps)         steps → timed input ops for the main side ({ at, do: down|up|move|click|mark, … })
//   probe(opts)             the page side (stringified, run in the game window once): fps, errors, state, position
//   summary(run)            the result the director reads: numbers, what looks off, errors with line + hint (≈ 100–200 tokens)
//   hint(message)           the usual fix of an error kind (ThreeDirector's own when the Lab is loaded)
const DirectorGameCore = (() => {
  // ---------- keys: what a script says → Electron's sendInputEvent keyCode ----------
  const NAMED = { space: 'Space', spacebar: 'Space', enter: 'Enter', return: 'Enter', shift: 'Shift', ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', tab: 'Tab', backspace: 'Backspace',
    up: 'Up', down: 'Down', left: 'Left', right: 'Right', arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right' };
  const MODS = new Set(['Shift', 'Control', 'Alt']);
  // the owner's keys: they leave the game or reach the system, never sent by a play-test
  const OWNER = /^(esc|escape|cmd|command|meta|super|win|windows|f4|f11)$/i;
  function keyOf(w) {
    const k = String(w || '').trim().toLowerCase();
    if (!k) return null;
    if (OWNER.test(k)) return { refused: w };
    if (NAMED[k]) return NAMED[k];
    if (/^[a-z0-9]$/.test(k)) return k.toUpperCase();
    if (/^f([1-9]|1[0-2])$/.test(k)) return k.toUpperCase();
    return null;
  }
  const MOVE = { forward: 'W', forwards: 'W', ahead: 'W', back: 'S', backward: 'S', backwards: 'S', left: 'A', right: 'D' };
  const DEG_PX = 7; // a look's mouse travel: 90° ≈ 630 px (three.js games turn ≈ 0.002–0.003 rad a pixel)

  // ---------- the script ----------
  const SPLIT = /\s*(?:,|;|\n|\bthen\b|\band then\b|→|->)\s*/i;
  const durOf = (t) => { const m = t.match(/(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)\b/); return m ? Math.round(Number(m[1]) * (/^m/.test(m[2]) ? 1 : 1000)) : null; };
  const short = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 28);
  function parseStep(raw) {
    let t = String(raw || '').toLowerCase().replace(/\bfor\b|\bthe\b|\bkey\b|\bbutton\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    let times = 1;
    const rep = t.match(/(?:\s+x\s*(\d+)|\s+(\d+)\s*times)$/);
    if (rep) { times = Math.min(20, Number(rep[1] || rep[2])); t = t.slice(0, rep.index).trim(); }
    const ms = durOf(t);
    const bare = t.replace(/(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)\b/, '').trim();
    const label = short(String(raw));
    let st = null;
    let m;
    if ((m = bare.match(/^(?:wait|pause|idle|stand still|do nothing)$/))) st = { kind: 'wait', ms: ms ?? 1000 };
    else if ((m = bare.match(/^(?:look|turn|glance|aim)\s+(left|right|up|down|around)(?:\s+(\d+))?\s*(?:°|deg|degrees)?$/))) {
      const deg = Number(m[2] || (m[1] === 'around' ? 180 : 90));
      const px = Math.round(deg * DEG_PX) * (m[1] === 'left' || m[1] === 'up' ? -1 : 1);
      st = { kind: 'look', dx: /left|right|around/.test(m[1]) ? px : 0, dy: /up|down/.test(m[1]) ? Math.round(px / 2) : 0, ms: ms ?? 300 };
    } else if ((m = bare.match(/^(?:click|tap|fire|shoot|attack)(?:\s+(?:at\s+)?(0?\.\d+|[01])\s+(0?\.\d+|[01]))?$/))) st = { kind: 'click', x: m[1] ? Number(m[1]) : 0.5, y: m[2] ? Number(m[2]) : 0.5 };
    else if ((m = bare.match(/^jump$/))) st = { kind: 'jump', keys: ['Space'], ms: 100 };
    else if ((m = bare.match(/^(?:crouch|duck)$/))) st = { kind: 'key', keys: ['C'], ms: ms ?? 500 };
    else if ((m = bare.match(/^(walk|move|go|run|sprint|strafe|step)?\s*(forwards?|ahead|backwards?|back|left|right)$/)) && (m[1] || ms != null)) {
      st = { kind: 'move', keys: [...(/run|sprint/.test(m[1] || '') ? ['Shift'] : []), MOVE[m[2]]], ms: ms ?? 1000 };
    } else if ((m = bare.match(/^(walk|run|sprint|move)$/))) st = { kind: 'move', keys: [...(/run|sprint/.test(m[1]) ? ['Shift'] : []), 'W'], ms: ms ?? 1000 };
    else if ((m = bare.match(/^(?:(hold|press|tap|push|hit|type)\s+)?([a-z0-9]+(?:\s*\+\s*[a-z0-9]+)*)$/))) {
      const names = m[2].split(/\s*\+\s*/);
      const keys = names.map(keyOf);
      const bad = keys.find((k) => k && k.refused);
      if (bad) return { error: `"${short(String(raw))}": ${bad.refused} is the owner's key (it leaves the game), not sent` };
      if (keys.some((k) => !k)) return null;
      const hold = m[1] === 'hold' || ms != null;
      const moving = keys.some((k) => /^(W|A|S|D|Up|Down|Left|Right)$/.test(k));
      st = { kind: moving && hold ? 'move' : keys.length === 1 && keys[0] === 'Space' && !hold ? 'jump' : 'key', keys, ms: hold ? (ms ?? 1000) : 90 };
    }
    if (!st) return null;
    st.label = label;
    return Array.from({ length: times }, () => ({ ...st }));
  }
  const UNDERSTOOD = 'hold W 2 s, jump, look left 45, click, wait 1 s, press E, run forward 1 s, W+D 1 s, jump x3';
  function parse(script) {
    const parts = String(script || '').split(SPLIT).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return { error: `an empty script (e.g. ${UNDERSTOOD})` };
    const steps = [];
    for (const p of parts) {
      const s = parseStep(p);
      if (!s) return { error: `don't know "${short(p)}" (understood: ${UNDERSTOOD})` };
      if (s.error) return s;
      steps.push(...s);
      if (steps.length > 120) return { error: 'over 120 steps: shorter, or secs to repeat it' };
    }
    return { steps };
  }
  // no script: a walk-about that tries what most games have (move every way, turn, jump), clicking first (a Lab scene
  // captures the mouse on a click)
  const WALK = 'hold W 1.5s, look left 60, hold W 1s, jump, hold D 0.8s, look right 90, hold S 0.8s, jump, hold A 0.8s, wait 0.5s';
  function explore(secs = 10) { return fill([{ kind: 'click', x: 0.5, y: 0.5, label: 'click' }, ...parse(WALK).steps], secs, 1); }
  // the script again and again until secs (the first `keep` steps only once)
  function fill(steps, secs, keep = 0) {
    if (!secs || !steps.length) return steps;
    const want = Math.min(90, secs) * 1000;
    const head = steps.slice(0, keep); const loop = steps.slice(keep);
    if (!loop.length) return steps;
    const out = [...head];
    while (lengthOf(out) < want && out.length < 400) for (const s of loop) { if (lengthOf(out) >= want) break; out.push({ ...s }); }
    return out;
  }

  // ---------- steps → timed ops (the main side plays them: the hub window may be behind the game, its timers slowed) ----------
  const GAP = 60; const TAP = 90; const LAND = 650; const LOOK_N = 10;
  function stepLength(s) {
    if (s.kind === 'wait') return s.ms;
    if (s.kind === 'look') return s.ms + GAP;
    if (s.kind === 'click') return 150;
    if (s.kind === 'jump') return TAP + LAND;
    return (s.ms || TAP) + GAP;
  }
  const lengthOf = (steps) => steps.reduce((n, s) => n + stepLength(s), 0);
  function timeline(steps) {
    const ops = []; let t = 0;
    steps.forEach((s, i) => {
      ops.push({ at: t, do: 'mark', i });
      if (s.kind === 'look') {
        for (let k = 0; k < LOOK_N; k += 1) ops.push({ at: t + Math.round((s.ms * k) / LOOK_N), do: 'move', dx: Math.round(s.dx / LOOK_N), dy: Math.round(s.dy / LOOK_N) });
      } else if (s.kind === 'click') ops.push({ at: t, do: 'click', x: s.x, y: s.y });
      else if (s.keys) {
        const hold = s.kind === 'jump' ? TAP : s.ms;
        for (const k of s.keys) ops.push({ at: t, do: 'down', key: k });
        for (const k of [...s.keys].reverse()) ops.push({ at: t + hold, do: 'up', key: k });
      }
      t += stepLength(s);
    });
    ops.push({ at: t, do: 'mark', i: steps.length });
    return { ops, ms: t };
  }

  // ---------- the page side (one expression in the game window; again after a reload) ----------
  // window.__dgPlay: counts frames (frame times only during a run), keeps the page's errors (with file and line), finds
  // the game's state (window.hearthState(), window.game, window.__game, window.__<title>…) and the player's position
  // (the state's x/y/z, an object named player / hero…, else the camera), and keeps per step where the player went.
  function probe(o) {
    const W = window;
    if (W.__dgPlay) return W.__dgPlay.v;
    const now = () => performance.now();
    const S = { frames: 0, last: 0, roll: [], run: null, errors: [], keys: 0, src: null };
    const loc = (stack) => { const m = String(stack || '').split('\n').map((l) => l.match(/((?:hearth-game|blob|https?|file):\/\/[^\s)]+):(\d+):(\d+)/)).find((x) => x && !/__dgPlay/.test(x[0])); return m ? [m[1], Number(m[2]), Number(m[3])] : []; };
    const add = (msg, url, line, col) => {
      const m = String(msg || 'error').replace(/^Uncaught\s+/, '').slice(0, 200);
      const e = S.errors.find((x) => x.m === m && x.l === (line || 0));
      if (e) { e.n += 1; return; }
      if (S.errors.length < 8) S.errors.push({ m, url: String(url || ''), f: String(url || '').split('/').pop().split('?')[0].slice(0, 40), l: line || 0, c: col || 0, n: 1, at: now() });
    };
    addEventListener('error', (e) => {
      if (e.message) add(e.message, e.filename, e.lineno, e.colno);
      else if (e.target && e.target !== W && (e.target.src || e.target.href)) add(`failed to load ${String(e.target.src || e.target.href).split('/').pop()}`, '', 0, 0);
    }, true);
    addEventListener('unhandledrejection', (e) => { const r = e.reason; add(`Unhandled: ${r && r.message ? r.message : r}`, ...loc(r && r.stack)); });
    const ce = console.error;
    console.error = function (...a) { try { add(a.map((x) => (x && x.message) || String(x)).join(' '), ...loc(new Error().stack)); } catch (_) { /* never in the way */ } return ce.apply(this, a); };
    addEventListener('keydown', () => { S.keys += 1; }, true);
    const lows = [o.name, `__${o.name}`].filter((x) => x && /^[\w$]+$/.test(x));
    const NAMES = ['hearthState', 'game', '__game', 'gameState', 'GAME', ...lows];
    const isNode = (v) => typeof Node !== 'undefined' && v instanceof Node;
    function stateObj() {
      for (const n of NAMES) {
        let v; try { v = W[n]; } catch (_) { continue; }
        if (typeof v === 'function' && n === 'hearthState') { try { v = v(); } catch (_) { continue; } }
        if (v && typeof v === 'object' && !isNode(v)) return v;
      }
      return null;
    }
    const NOISY = /^(frames?|time|t|now|dt|delta|last\w*|ready|gl|assets|started|tick|elapsed|fps)$/i;
    const INPUT = /^(keys?|keyboard|input|pressed|down|held|mouse|buttons)$/i; // (the input the test itself sends: not the game's state)
    const r2 = (x) => Math.round(x * 100) / 100;
    function flat(v) {
      const out = {};
      if (!v) return out;
      let n = 0;
      const put = (k, x) => { if (n >= 24 || NOISY.test(k.split('.').pop())) return; if (typeof x === 'number' && Number.isFinite(x)) out[k] = r2(x); else if (typeof x === 'boolean') out[k] = x; else if (typeof x === 'string') out[k] = x.slice(0, 24); else if (Array.isArray(x)) out[`${k}[]`] = x.length; else return; n += 1; };
      for (const [k, x] of Object.entries(v)) {
        if (INPUT.test(k) || NOISY.test(k)) continue;
        if (x && typeof x === 'object' && !Array.isArray(x) && !isNode(x) && !x.isObject3D) { for (const [k2, y] of Object.entries(x).slice(0, 8)) if (typeof y !== 'object') put(`${k}.${k2}`, y); } else put(k, x);
      }
      return out;
    }
    function scenes() {
      const out = [];
      try { if (W.__scenes) for (const v of Object.values(W.__scenes)) if (v && v.scene) out.push(v); } catch (_) { /* fine */ }
      const s = stateObj();
      for (const c of [W, s].filter(Boolean)) { try { if (c.scene && c.scene.isScene) out.push({ scene: c.scene, camera: c.camera && c.camera.isCamera ? c.camera : null }); } catch (_) { /* fine */ } }
      return out;
    }
    const xyz = (p) => (p && typeof p.x === 'number' && (typeof p.z === 'number' || typeof p.y === 'number') ? p : null);
    // where the player is: found once per run (an object reference), read each frame
    function findPos() {
      const s = stateObj();
      if (s) {
        for (const [get, how] of [[() => xyz(s.player && s.player.position), 'state'], [() => xyz(s.player), 'state'], [() => xyz(s.position), 'state'], [() => xyz(s.pos), 'state'], [() => xyz(s), 'state']]) {
          if (get()) return { get, from: how, hasY: typeof get().y === 'number' };
        }
      }
      for (const e of scenes()) {
        let hit = null;
        try { e.scene.traverse((x) => { if (!hit && /^(player|hero|character|avatar|me|ship|car|ball)\b/i.test(x.name || '')) hit = x; }); } catch (_) { /* fine */ }
        if (hit) return { get: () => hit.position, from: hit.name, hasY: true };
      }
      const cam = scenes().map((e) => e.camera).find(Boolean);
      if (cam) return { get: () => cam.position, from: 'camera', hasY: true };
      return null;
    }
    const camOf = () => scenes().map((e) => e.camera).find(Boolean) || null;
    const yawOf = (c) => { if (!c) return null; try { c.updateMatrixWorld(); const m = c.matrixWorld.elements; return (Math.atan2(-m[8], -m[10]) * 180) / Math.PI; } catch (_) { return null; } };
    const posNow = () => { const p = S.src && S.src.get(); return p ? { x: p.x, y: typeof p.y === 'number' ? p.y : 0, z: typeof p.z === 'number' ? p.z : 0 } : null; };
    const dist = (a, b) => (a && b ? Math.hypot(b.x - a.x, b.z - a.z) : 0);
    function frame(t) {
      S.frames += 1;
      if (S.last) {
        const dt = t - S.last;
        S.roll.push(dt); if (S.roll.length > 120) S.roll.shift();
        const R = S.run;
        if (R && !R.done) {
          if (R.dts.length < 20000) R.dts.push(dt);
          const st = R.cur; const p = st && posNow();
          if (p) { st.maxY = Math.max(st.maxY, p.y); if (p.x !== st.lx || p.z !== st.lz) { st.path += dist({ x: st.lx, y: 0, z: st.lz }, p); st.lx = p.x; st.lz = p.z; } }
        }
      }
      S.last = t;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const api = {
      v: 1,
      // a run starts: the frame times, the state and where the player is now
      begin(n) {
        S.src = findPos(); S.cam = camOf();
        S.run = { n, t0: now(), dts: [], steps: [], cur: null, s0: flat(stateObj()), p0: posNow(), e0: S.errors.length, k0: S.keys, done: false };
        return Boolean(S.src);
      },
      mark(i) {
        const R = S.run; if (!R || R.done) return;
        const p = posNow(); const yaw = yawOf(S.cam);
        if (R.cur) { R.cur.d = R.cur.p0 && p ? Math.hypot(p.x - R.cur.p0.x, p.z - R.cur.p0.z) : null; R.cur.rise = R.cur.p0 && p ? R.cur.maxY - R.cur.p0.y : null; R.cur.yaw = R.cur.yaw0 != null && yaw != null ? ((yaw - R.cur.yaw0 + 540) % 360) - 180 : null; R.steps.push(R.cur); }
        if (i >= R.n) { R.done = true; R.t1 = now(); R.cur = null; return; }
        R.cur = { i, p0: p, maxY: p ? p.y : 0, lx: p ? p.x : 0, lz: p ? p.z : 0, path: 0, yaw0: yaw };
      },
      result() {
        if (!S.src) { S.src = findPos(); S.cam = camOf(); }
        const R = S.run || { dts: S.roll.slice(), steps: [], s0: {}, t0: now() - 1000, e0: 0, k0: S.keys };
        const dts = R.dts.length ? R.dts : S.roll.slice();
        const secs = ((R.t1 || now()) - R.t0) / 1000;
        let objects = 0;
        for (const e of scenes()) { try { e.scene.traverse(() => { objects += 1; }); } catch (_) { /* fine */ } if (objects > 50000) break; }
        const hg = W.__hearthGame;
        const labErrors = hg && Array.isArray(hg.errors) ? hg.errors.slice(0, 6).map((x) => { const s = String(x); const m = s.match(/\(line (\d+)\)$/); return { m: s.replace(/\s*\(line \d+\)$/, '').slice(0, 200), f: 'layer', l: m ? Number(m[1]) : 0, n: 1 }; }) : [];
        return JSON.stringify({ secs, dts: dts.map((x) => Math.round(x * 10) / 10), steps: R.steps.map((s) => ({ d: s.d, rise: s.rise, yaw: s.yaw, path: s.path })), s0: R.s0, s1: flat(stateObj()), p0: R.p0, p1: posNow(),
          from: S.src ? S.src.from : null, hasY: S.src ? S.src.hasY : false, cam: Boolean(S.cam), errors: [...S.errors, ...labErrors], keys: S.keys - R.k0, objects, locked: Boolean(document.pointerLockElement),
          w: innerWidth, h: innerHeight, title: document.title || '' });
      },
      fps() { const d = S.roll; return d.length ? Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length)) : 0; },
      frames: () => S.frames,
      errors: () => S.errors,
    };
    W.__dgPlay = api;
    return api.v;
  }

  // ---------- the usual fix next to an error (ThreeDirector's 13 kinds are used when the Lab is in) ----------
  const HINTS = [
    [/(\w+) is not defined/, (m) => `declare ${m[1]} (or import it) before it's used`],
    [/of (undefined|null)(?: \(reading '([^']+)'\))?/, (m) => `what's before .${m[2] || 'x'} is ${m[1]} there: check it exists at that moment (loaded yet?)`],
    [/is not a function/, () => 'a renamed / missing function or a typo: check the name and what holds it'],
    [/is not a constructor/, () => 'an addon class isn\'t in core three: import it from three/addons/…'],
    [/failed to load|404|Failed to fetch|NetworkError/i, () => 'a file path the game can\'t reach: relative to the game\'s folder'],
    [/Maximum call stack/, () => 'endless recursion: a function calling itself without a stop'],
    [/context lost|CONTEXT_LOST|out of memory/i, () => 'the GPU gave up: too many / too big textures or render targets'],
    [/shader|GLSL|compile/i, () => 'a shader compile error: the line it names in the shader text'],
  ];
  function hint(msg) { for (const [re, f] of HINTS) { const m = String(msg || '').match(re); if (m) return f(m); } return ''; }

  // ---------- the result the director reads ----------
  const n1 = (x) => (Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
  const P3 = (p) => (p ? `${n1(p.x)},${n1(p.y)},${n1(p.z)}` : '?');
  function frames(dts, hz) {
    const d = (dts || []).filter((x) => x > 0 && x < 5000);
    if (!d.length) return { fps: 0, worst: 0, stutters: 0, p50: 0 };
    const sorted = [...d].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    const budget = hz ? 1000 / hz : p50;
    const lim = Math.max(budget * 2, p50 * 2, 25);
    return { fps: Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length)), worst: Math.round(sorted.at(-1)), stutters: d.filter((x) => x > lim).length, p50: Math.round(p50 * 10) / 10 };
  }
  // a step's verdict: ✓ / ✗ / null (not judged)
  function judge(st, r) {
    if (!st || !r.from) return null;
    if (st.kind === 'move') return r.d == null ? null : r.d > 0.05 || r.path > 0.05;
    if (st.kind === 'jump') return r.rise == null || !r.hasY ? null : r.rise > 0.05;
    if (st.kind === 'look') return r.yaw == null ? null : Math.abs(r.yaw) > 2 || r.d > 0.05;
    return null;
  }
  function stateDiff(a = {}, b = {}) {
    const ch = []; let same = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === b[k]) { same += 1; continue; }
      ch.push(`${k} ${a[k] === undefined ? '–' : JSON.stringify(a[k])}→${b[k] === undefined ? '–' : JSON.stringify(b[k])}`);
    }
    return { ch, same };
  }
  // run = { title, how, hz, secs asked, steps (parsed), page (probe.result() parsed), context ({ line text } of the first
  // error), hint (fn), plan (the walk-about's words) }
  // a build folder's name says little: the page's own title then
  const titleOf = (run, pg) => (run.title && !/^(html|index|dist|build|public|www|web|game|out)$/i.test(run.title) ? run.title : String(pg.title || run.title || 'the game').slice(0, 40));
  function summary(run) {
    const pg = run.page || {};
    const st = run.steps || [];
    const f = frames(pg.dts, run.hz);
    const lines = [];
    const head = [`▶ ${titleOf(run, pg)}`, `${n1(pg.secs || 0)} s, ${st.length} step${st.length === 1 ? '' : 's'}${run.plan ? ` (${run.plan})` : ''}`, `fps ${f.fps}${run.hz ? ` (${run.hz} Hz)` : ''}`, `worst ${f.worst} ms`, `${f.stutters} stutter${f.stutters === 1 ? '' : 's'}`];
    lines.push(head.join(' · '));
    const moved = pg.p0 && pg.p1 ? Math.hypot(pg.p1.x - pg.p0.x, pg.p1.z - pg.p0.z) : null;
    lines.push([pg.from ? `${pg.from === 'state' ? 'player' : pg.from} ${P3(pg.p0)} → ${P3(pg.p1)} (moved ${moved == null ? '?' : n1(moved)})` : 'player: not found', pg.objects ? `objects ${pg.objects}` : '', pg.locked ? 'mouse captured' : '', `keys seen ${pg.keys ?? '?'}`].filter(Boolean).join(' · '));
    const verdicts = st.map((s, i) => judge(s, { ...(pg.steps?.[i] || {}), from: pg.from, hasY: pg.hasY }));
    const bad = st.map((s, i) => ({ s, i, v: verdicts[i], r: pg.steps?.[i] || {} })).filter((x) => x.v === false);
    const judged = verdicts.filter((v) => v != null).length;
    const seen = new Set();
    const badTxt = bad.filter((x) => { const k = x.s.label; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4)
      .map((x) => `✗ ${x.i + 1} ${x.s.label}: ${x.s.kind === 'jump' ? 'no rise' : x.s.kind === 'look' ? 'view didn\'t turn' : 'didn\'t move'}${bad.filter((y) => y.s.label === x.s.label).length > 1 ? ` (×${bad.filter((y) => y.s.label === x.s.label).length})` : ''}`);
    lines.push(judged ? `steps ✓ ${judged - bad.length}/${judged}${badTxt.length ? ` · ${badTxt.join(' · ')}` : ''}` : `steps: ${st.length} sent (none judged: no player position)`);
    // (the player's position is said above: not again in the state)
    const noPos = (o = {}) => Object.fromEntries(Object.entries(o).filter(([k]) => pg.from !== 'state' || !/(^|\.)(x|y|z)$/.test(k)));
    const d = stateDiff(noPos(pg.s0), noPos(pg.s1));
    if (Object.keys(noPos(pg.s1)).length) lines.push(`state: ${d.ch.length ? d.ch.slice(0, 6).join(', ') : 'no change'}${d.ch.length > 6 ? `, +${d.ch.length - 6}` : ''}${d.same ? ` (${d.same} same)` : ''}`);
    const errs = pg.errors || [];
    if (!errs.length) lines.push('errors: none');
    else {
      lines.push(`errors: ${errs.length}`);
      errs.slice(0, 3).forEach((e, i) => {
        const h = (run.hint || hint)(e.m);
        lines.push(`  ${e.f || '?'}${e.l ? `:${e.l}` : ''} ${e.m}${e.n > 1 ? ` (×${e.n})` : ''}${h ? ` · fix: ${h}` : ''}`);
        if (i === 0 && run.context) lines.push(run.context.replace(/^/gm, '    '));
      });
    }
    const off = [];
    if (run.hz && f.fps && f.fps < run.hz * 0.9) off.push(`fps ${f.fps} of ${run.hz}`);
    if (f.stutters >= 3) off.push(`${f.stutters} stutters (worst ${f.worst} ms${run.perf ? '' : '; perf: true for causes'})`);
    for (const x of badTxt) off.push(x.replace(/^✗ \d+ /, ''));
    if (errs.length) off.push(`${errs.length} error${errs.length === 1 ? '' : 's'}`);
    if (pg.keys === 0 && st.some((s) => s.keys)) off.push('no key reached the page (does it need a click first?)');
    else if (pg.from && moved != null && moved < 0.05 && st.some((s) => s.kind === 'move') && !d.ch.length) off.push('nothing moved');
    if (!pg.from) off.push('no player position: expose window.game = { x, y, z, … } to judge moves');
    lines.push(`off: ${off.length ? off.join('; ') : 'nothing obvious'}`);
    return lines.join('\n');
  }
  // a game page's state, alone (op: state)
  function stateLine(run) {
    const pg = run.page || {};
    const f = frames(pg.dts, run.hz);
    const s = Object.entries(pg.s1 || {}).slice(0, 10).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ');
    const errs = pg.errors || [];
    return [`▶ ${titleOf(run, pg)} · fps ${f.fps}${run.hz ? ` (${run.hz} Hz)` : ''} · ${pg.w}×${pg.h}${pg.objects ? ` · objects ${pg.objects}` : ''}${pg.locked ? ' · mouse captured' : ''}`,
      pg.from ? `${pg.from === 'state' ? 'player' : pg.from} ${P3(pg.p1)}` : 'player: not found',
      s ? `state: ${s}` : 'state: none exposed (window.game = { … } lets a play-test read it)',
      errs.length ? `errors: ${errs.slice(0, 3).map((e) => `${e.f || '?'}${e.l ? `:${e.l}` : ''} ${e.m}${e.n > 1 ? ` (×${e.n})` : ''}`).join(' | ')}` : 'errors: none'].join('\n');
  }

  return { parse, explore, fill, timeline, lengthOf, probe, hint, summary, stateLine, frames, keyOf, WALK, UNDERSTOOD };
})();
if (typeof module !== 'undefined') module.exports = DirectorGameCore;
