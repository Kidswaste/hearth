// The Lab with the owner's other tools (round 25, interop): OSC in / out, the beat clock and the audio features
// other apps follow, an Ableton Link tempo follower. MIDI out is interop-midi.js, OBS is interop-obs.js, commands
// interop-cmds.js; the sockets live in interopmain.js (main process). Everything is off until turned on.
//   OSC in      TouchDesigner, Ableton (Max for Live / AbletonOSC), Resolume, TouchOSC or any phone OSC app move
//               sliders, press pads (GO, cut, shuffle, freeze, tap…), open / cue scenes and run the set list, through
//               Hearth's own addresses (/hearth/…, list: /osc addresses), an app preset's addresses, or ones you
//               learn (touch a slider, move the control in your app: bound). Moves are the hub's own slider moves
//               (setNormalized, like a MIDI knob), one per slider per frame.
//   OSC out     beat / bar / tempo, kick · snare · hat hits, audio features (≈ 30 a second), slider values (as they
//               change), the scene's name; to apps on this computer or your network only
//   clock       one beat clock for OSC and MIDI out: the stage's tempo (the song's grid, MIDI clock in, taps, Link),
//               scheduled a beat at a time (no loop per frame); bar 1 from the stage's bar grid
//   Link        Ableton Link's session tempo (listen only) sets the stage's BPM when no song plays
// Light: no work while nothing is on; the slider watcher (20 a second) and the features (30 a second) run only while
// something sends them.
const Interop = (() => {
  const I = window.hub.interop;
  const AREA = 'Three.js Lab';
  const conf = (k, d) => store.get(`interop.${k}`, d);
  const setConf = (k, v) => store.set(`interop.${k}`, v);
  const auto = (k, on) => setConf('auto', { ...conf('auto', {}), [k]: Boolean(on) }); // turned on → back on at the next start
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40);

  // ---------- the Lab, as other apps see it ----------
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.peek?.() : null);
  const stage = () => (typeof ThreeStage !== 'undefined' ? ThreeStage : null);
  async function ready() {
    if (lab() && hk()) return true;
    try { await ThreeLab.cmd({ show: false }); } catch { return false; }
    return Boolean(hk());
  }
  const uOf = (x) => (x.options ? Math.max(0, x.options.indexOf(x.value)) / Math.max(1, x.options.length - 1) : typeof x.value === 'boolean' ? (x.value ? 1 : 0) : x.min != null ? (x.value - x.min) / ((x.max - x.min) || 1) : null);
  // the scene's sliders (the selected layer) that a fader can play, in panel order
  const controls = () => (hk()?.ctl()?.controls() || []).filter((x) => { const u = uOf(x); return u != null && Number.isFinite(u); });
  function findSlider(q) {
    const list = controls(); const s = slug(q);
    if (/^\d+$/.test(String(q))) return list[Number(q) - 1] || null;
    return list.find((x) => x.key === q) || list.find((x) => slug(x.label) === s || slug(x.key) === s) || list.find((x) => slug(x.label).startsWith(s)) || null;
  }
  const sceneList = () => lab()?.sketches?.() || [];
  function findScene(q) {
    const list = sceneList(); const s = String(q ?? '').trim().toLowerCase();
    if (!s) return null;
    return list.find((x) => x.id === q) || list.find((x) => x.name.toLowerCase() === s) || list.find((x) => x.name.toLowerCase().includes(s)) || null;
  }

  // ---------- slider moves from outside: one per slider per frame (like the MIDI knobs and the phone remote) ----------
  const pending = new Map(); const releases = new Map(); let raf = 0;
  const stats = { in: 0, applied: 0, acts: 0, out: 0, beats: 0, unknown: 0 };
  function moveSlider(key, u) {
    pending.set(key, Math.max(0, Math.min(1, u)));
    if (!raf) raf = requestAnimationFrame(flushMoves);
  }
  function flushMoves() {
    raf = 0;
    const c = hk()?.ctl(); if (!c) { pending.clear(); return; }
    for (const [key, u] of pending) {
      c.setNormalized(key, u); stats.applied += 1;
      clearTimeout(releases.get(key));
      releases.set(key, setTimeout(() => { releases.delete(key); c.setNormalized(key, u, { release: true }); }, 300)); // (one undo step and a save after the hand stops)
    }
    pending.clear();
  }

  // ================= the beat clock (OSC out, MIDI out) =================
  // fires once a beat, ~25 ms early, with the beat's exact time (performance.now()), so MIDI can be scheduled on it
  const clock = (() => {
    const subs = new Set(); const tempoSubs = new Set();
    let t = 0; let beat = 0; let bar = 0; let lastAt = 0; let lastBpm = 0;
    const own = { anchor: performance.now() };
    function next() {
      const S = stage(); let ub = null; let ubar = null; let bpm = conf('bpm', 120);
      try { if (S && hk()) { bpm = S.bpm(); ub = S.untilNext('beat'); ubar = S.untilNext('bar'); } } catch { ub = null; }
      if (!(bpm > 0)) bpm = 120;
      if (ub == null || !Number.isFinite(ub)) { // no stage: our own steady clock
        const per = 60 / bpm; const pos = (performance.now() - own.anchor) / 1000 / per;
        const nb = Math.ceil(pos + 0.02); ub = (nb - pos) * per; ubar = ((Math.ceil((pos + 0.02) / 4) * 4) - pos) * per;
      }
      return { ub, ubar, bpm };
    }
    function arm() {
      clearTimeout(t); t = 0;
      if (!subs.size) return;
      const { ub, ubar, bpm } = next();
      if (Math.abs(bpm - lastBpm) > 0.05) { lastBpm = bpm; for (const fn of tempoSubs) { try { fn(bpm); } catch (err) { console.warn('interop tempo', err); } } }
      const at = performance.now() + ub * 1000;
      // where this beat sits in the bar: the beats from it to the next bar line (0 → it is beat 1)
      const k = ubar != null ? ((Math.round((ubar - ub) / (60 / bpm)) % 4) + 4) % 4 : null;
      const pos = k == null ? (beat % 4) + 1 : k === 0 ? 1 : 5 - k;
      t = setTimeout(() => fire(at, pos, bpm), Math.max(0, ub * 1000 - 25));
    }
    function fire(at, pos, bpm) {
      // (the same beat twice, e.g. a song's grid answering just after it: skip)
      if (at - lastAt < (60000 / bpm) * 0.5) { t = setTimeout(arm, 30); return; }
      lastAt = at;
      beat = pos;
      if (beat === 1) bar += 1;
      stats.beats += 1;
      const e = { at, beat, bar, down: beat === 1, bpm };
      for (const fn of subs) { try { fn(e); } catch (err) { console.warn('interop beat', err); } }
      t = setTimeout(arm, Math.max(5, at - performance.now() + 30));
    }
    return {
      on(fn) { subs.add(fn); if (!t) arm(); return () => { subs.delete(fn); if (!subs.size) { clearTimeout(t); t = 0; } }; },
      onTempo(fn) { tempoSubs.add(fn); return () => tempoSubs.delete(fn); },
      resync() { if (subs.size) arm(); },
      get bpm() { return next().bpm; }, get beat() { return beat; }, get bar() { return bar; }, get running() { return Boolean(t); },
    };
  })();
  // a new tempo or a tap: start the wait over (a beat already armed would land on the old grid)
  addEventListener('hearth:sketch', () => clock.resync());

  // ================= audio features (OSC out, MIDI notes on hits) =================
  // the live input's features when it runs (the hub has them), else the preview's (a probe, one at a time)
  const FEAT = ['level', 'sub', 'low', 'mids', 'highMid', 'brilliance', 'air', 'loudness', 'centroid', 'flux', 'onset', 'vocal', 'beatPhase', 'barPhase', 'intensity', 'build', 'drop', 'kickOn', 'snareOn', 'hatOn'];
  const features = (() => {
    const subs = new Set(); let timer = 0; let probing = false; let last = null; const edge = { kickOn: 0, snareOn: 0, hatOn: 0 };
    async function tick() {
      const A = typeof ThreeAudio !== 'undefined' ? ThreeAudio : null;
      let v = A?.liveValues?.() || null;
      if (!v && A && !probing && hk()) { probing = true; try { const r = await A.probe(FEAT); v = r?.values || null; } catch { v = null; } finally { probing = false; } }
      if (!v) return;
      last = v;
      const hits = [];
      for (const k of Object.keys(edge)) { const x = Number(v[k]) || 0; if (x > 0.5 && edge[k] <= 0.5) hits.push([k.replace('On', ''), r3(x)]); edge[k] = x; }
      for (const fn of subs) { try { fn(v, hits); } catch (err) { console.warn('interop features', err); } }
    }
    return {
      on(fn) { subs.add(fn); if (!timer) timer = setInterval(tick, 33); return () => { subs.delete(fn); if (!subs.size) { clearInterval(timer); timer = 0; } }; },
      get last() { return last; }, FEAT,
    };
  })();

  // ================= slider values going out (OSC, MIDI CC) =================
  // a light poll (20 a second, only while something sends): the values that changed since the last look
  const sliders = (() => {
    const subs = new Set(); let timer = 0; let sent = new Map(); let sig = '';
    function tick() {
      const h = hk(); if (!h) return;
      const s = `${h.sketchId()}|${h.layer()?.id || ''}`;
      if (s !== sig) { sig = s; sent = new Map(); } // another scene / layer: everything goes out once
      const list = controls(); const changed = [];
      list.forEach((x, i) => { const u = r3(uOf(x)); if (sent.get(x.key) !== u) { sent.set(x.key, u); changed.push({ key: x.key, label: x.label || x.key, u, n: i + 1, value: x.value }); } });
      if (changed.length) for (const fn of subs) { try { fn(changed); } catch (err) { console.warn('interop sliders', err); } }
    }
    return {
      on(fn) { subs.add(fn); sent = new Map(); if (!timer) timer = setInterval(tick, 50); return () => { subs.delete(fn); if (!subs.size) { clearInterval(timer); timer = 0; } }; },
      resend() { sent = new Map(); },
    };
  })();

  // ================= OSC =================
  // app presets: the ports they use, the addresses they send (map) and what Hearth sends back (feedback)
  const PRESETS = {
    generic: { name: 'Any OSC app', port: 9000, target: 9001, scope: 'local', note: 'Hearth\'s own addresses (/osc addresses)' },
    touchosc: { name: 'TouchOSC (phone / tablet)', port: 8000, target: 9000, scope: 'lan', note: 'Layout "Simple": page 1 faders → the first 5 sliders, push buttons → GO / shuffle / freeze / tap, toggle → black-out, XY → sliders 1 and 2, values sent back to the faders',
      map: [[/^\/1\/fader(\d)$/, (m, v) => ({ slider: Number(m[1]), u: v[0] })], [/^\/1\/push([1-4])$/, (m, v) => (num(v[0]) >= 0.5 ? { act: ['go', 'shuffle', 'freeze', 'tap'][Number(m[1]) - 1] } : null)], [/^\/1\/toggle\d$/, (m, v) => ({ blackout: num(v[0]) >= 0.5 })], [/^\/1\/xy\d?$/, (m, v) => ({ xy: [v[0], v[1]] })], [/^\/accxyz$/, (m, v) => ({ sensors: v.slice(0, 3), range: [-1, 1] })]],
      feedback: (x) => (x.n <= 5 ? [[`/1/fader${x.n}`, [x.u]]] : []) },
    touchdesigner: { name: 'TouchDesigner', port: 7000, target: 7001, scope: 'local', out: { features: true, sliders: true }, note: 'OSC In CHOP on port 7001: hearth/beat, hearth/kick, hearth/audio/level… as channels. OSC Out CHOP to port 7000 with channels named hearth/slider/glow (0–1), hearth/go…' },
    ableton: { name: 'Ableton Live (Max for Live)', port: 9001, target: 9002, scope: 'local', note: 'Max for Live: [udpsend 127.0.0.1 9001] with /hearth/slider/glow 0.5, /hearth/go…; [udpreceive 9002] gets /hearth/beat, /hearth/bar, /hearth/bpm, /hearth/kick' },
    abletonosc: { name: 'Ableton Live (AbletonOSC: tempo + beat)', port: 11001, target: 11000, scope: 'local', note: 'With the AbletonOSC remote script: Hearth asks Live for its tempo and every beat, and follows them (bar 1 lines up)',
      hello: [['/live/song/start_listen/beat', []], ['/live/song/start_listen/tempo', []], ['/live/song/get/tempo', []]],
      map: [[/^\/live\/song\/get\/tempo$/, (m, v) => ({ bpm: v[v.length - 1] })], [/^\/live\/song\/get\/beat$/, (m, v) => ({ liveBeat: v[v.length - 1] })]] },
    resolume: { name: 'Resolume Arena / Avenue', port: 7001, target: 7000, scope: 'local', note: 'Preferences → OSC: input 7000, output 7001 ("Output all OSC messages"). A column launched → that set-list scene goes (GO); a clip → cued. Hearth sends the tempo and resyncs on bar 1',
      map: [[/^\/composition\/columns\/(\d+)\/connect$/, (m, v) => (v[0] ? { setGo: Number(m[1]) } : null)], [/^\/composition\/layers\/\d+\/clips\/(\d+)\/connect$/, (m, v) => (v[0] ? { cueN: Number(m[1]) } : null)], [/^\/composition\/tempocontroller\/tempo$/, () => null]],
      onBar: () => [['/composition/tempocontroller/resync', [{ i: 1 }]]], onTempo: (bpm) => [['/composition/tempocontroller/tempo', [Math.max(0, Math.min(1, (bpm - 20) / 480))]]] },
    phone: { name: 'Phone sensors (GyrOSC, ZIG SIM, TouchOSC tilt)', port: 8000, target: 9000, scope: 'lan', note: 'Tilt and rotation move the first three sliders: GyrOSC /gyrosc/gyro, ZIG SIM /ZIGSIM/<id>/gravity, TouchOSC /accxyz',
      map: [[/^\/accxyz$/, (m, v) => ({ sensors: v.slice(0, 3), range: [-1, 1] })], [/^\/gyrosc\/(gyro|rrate)$/, (m, v) => ({ sensors: v.slice(0, 3), range: [-Math.PI, Math.PI] })], [/^\/ZIGSIM\/[^/]+\/(gravity|accel)$/, (m, v) => ({ sensors: v.slice(0, 3), range: [-1, 1] })]] },
  };
  const OUT_DEF = { beat: true, bpm: true, hits: true, features: false, sliders: false, scene: true };
  const cfg = () => ({ port: 9000, scope: 'local', preset: 'generic', prefix: '/hearth', targets: [{ host: '127.0.0.1', port: 9001 }], ...conf('osc', {}), out: { ...OUT_DEF, ...conf('osc', {}).out } });
  const setCfg = (patch) => setConf('osc', { ...cfg(), ...patch });
  let oscOn = false; let oscSt = null;
  const maps = () => conf('osc.maps', []); // learned: [{ addr, t: 'slider', label, range } | { addr, t: 'act', a }]
  const preset = () => PRESETS[cfg().preset] || PRESETS.generic;

  // ---------- in ----------
  let learn = null; // { kind: 'slider', label } | { kind: 'act', a }
  const recent = []; // the last addresses heard (the address list, learning)
  const num = (v) => (typeof v === 'number' ? v : v === true ? 1 : v === false ? 0 : Number(v));
  const press = (v) => !v.length || num(v[0]) >= 0.5;
  async function route(m) {
    stats.in += 1;
    const a = m.a; const v = m.v || [];
    if (!recent.includes(a)) { recent.unshift(a); if (recent.length > 24) recent.pop(); }
    const P = cfg().prefix;
    const own = a === P || a.startsWith(`${P}/`);
    // learning: the first address that isn't Hearth's own binds
    if (learn && !own) return bind(a, v);
    const lm = maps().find((x) => x.addr === a);
    if (lm) return applyMap(lm, v);
    for (const [re, fn] of preset().map || []) { const hit = re.exec(a); if (hit) { const o = fn(hit, v); if (o) await applyPreset(o); return; } }
    if (own) return ownAddress(a.slice(P.length) || '/', v, m.from);
    stats.unknown += 1;
  }
  const ACTS = ['go', 'cut', 'next', 'prev', 'shuffle', 'shuffleBack', 'freeze', 'tap', 'blackout', 'play', 'look', 'show'];
  async function act(a) { if (!(await ready())) return; stats.acts += 1; await stage()?.act(a); }
  async function ownAddress(p, v, from) {
    const w = p.split('/').filter(Boolean); const x = w[0] || ''; const S = stage();
    if (x === 'ping') { reply(from, [[`${cfg().prefix}/pong`, [{ i: 1 }]]]); return; }
    if (x === 'sync') { sliders.resend(); return; }
    if (!(await ready())) return;
    if (x === 'slider' && w[1]) { const s = findSlider(decodeURIComponent(w[1])); if (!s || !v.length) return; if (w[2] === 'value' && s.min != null) moveSlider(s.key, (num(v[0]) - s.min) / ((s.max - s.min) || 1)); else moveSlider(s.key, num(v[0])); return; }
    if (x === 'fader' && w[1]) { const s = controls()[Number(w[1]) - 1]; if (s && v.length) moveSlider(s.key, num(v[0])); return; }
    if (x === 'xy' && v.length >= 2) { const [s1, s2] = controls(); if (s1) moveSlider(s1.key, num(v[0])); if (s2) moveSlider(s2.key, num(v[1])); return; }
    if (x === 'act' && w[1]) { const k = ACTS.find((y) => y.toLowerCase() === w[1].toLowerCase()) || (/^scene[1-8]$/.test(w[1]) ? w[1] : null); if (k && press(v)) await act(k); return; }
    if (ACTS.includes(x) && !w[1]) { if (press(v)) await act(x); return; }
    if (x === 'scene') {
      if (w[1] === 'next' || w[1] === 'prev') { if (press(v)) await act(w[1]); return; }
      const q = w[1] ? decodeURIComponent(w.slice(1).join('/')) : v[0];
      const sc = typeof q === 'number' ? S?.setlist.list()[q - 1] : findScene(q);
      if (sc) ThreeLab.scenes?.open(sc.id); return;
    }
    if (x === 'cue') { const q = w[1] ? decodeURIComponent(w[1]) : v[0]; if (q == null) return; if (typeof q === 'number' || /^\d+$/.test(q)) await S?.setlist.cueN(Number(q)).catch(() => {}); else { const sc = findScene(q); if (sc) await S?.cue(sc.id).catch(() => {}); } return; }
    if (x === 'set' && w[1]) { const n = Number(w[1]); if (n && press(v)) { await S?.setlist.cueN(n).catch(() => {}); await S?.go().catch(() => {}); } else if (w[1] === 'go' && press(v)) await S?.go(); return; }
    if (x === 'bpm' && v.length) { try { S?.setBpm(num(v[0])); clock.resync(); } catch { /* out of range */ } return; }
    if (x === 'xfade' && v.length) { S?.xfade(num(v[0])); return; }
    if (x === 'layer' && v.length) { lab()?.selectLayer(String(v[0])); return; }
    if (x === 'look') { const c = lab(); if (w[1] === 'next' || !v.length) { if (press(v)) c?.lookStep(1); } else c?.look(String(v[0])); return; }
    stats.unknown += 1;
  }
  async function applyPreset(o) {
    if (!(await ready())) return;
    const S = stage();
    if (o.slider != null) { const s = controls()[o.slider - 1]; if (s) moveSlider(s.key, num(o.u)); }
    if (o.xy) { const [s1, s2] = controls(); if (s1) moveSlider(s1.key, num(o.xy[0])); if (s2) moveSlider(s2.key, num(o.xy[1])); }
    if (o.sensors) { const [lo, hi] = o.range || [0, 1]; controls().slice(0, 3).forEach((s, i) => { if (o.sensors[i] != null) moveSlider(s.key, (num(o.sensors[i]) - lo) / (hi - lo)); }); }
    if (o.act) await act(o.act);
    if (o.blackout != null && Boolean(S?.state.black) !== o.blackout) S?.blackout(o.blackout);
    if (o.bpm > 0) { liveBpm = o.bpm; try { S?.setBpm(o.bpm); clock.resync(); } catch { /* out of range */ } }
    if (o.liveBeat != null) liveBeat(Number(o.liveBeat));
    if (o.setGo) { await S?.setlist.cueN(o.setGo).catch(() => {}); await S?.go().catch(() => {}); }
    if (o.cueN) await S?.setlist.cueN(o.cueN).catch(() => {});
  }
  // AbletonOSC: a beat number every beat; on each bar's first beat the stage's bar 1 lines up with Live's
  let liveBpm = 0;
  function liveBeat(n) {
    const S = stage(); if (!S) return;
    if (n % 4 === 0) { try { S.setBpm(liveBpm || S.bpm()); clock.resync(); } catch { /* no tempo yet */ } }
  }
  function applyMap(m, v) {
    if (m.t === 'act') { if (press(v)) return act(m.a); return null; }
    if (m.t === 'scene') { if (press(v)) ThreeLab.scenes?.open(m.id); return null; }
    if (m.t === 'slider' && v.length) {
      return ready().then((ok) => {
        if (!ok) return;
        const s = findSlider(m.label); if (!s) return;
        const [lo, hi] = m.range || [0, 1];
        moveSlider(s.key, (num(v[0]) - lo) / ((hi - lo) || 1));
      });
    }
    return null;
  }
  function bind(addr, v) {
    const l = learn; learn = null;
    const list = maps().filter((x) => x.addr !== addr);
    let row;
    if (l.kind === 'act') row = { addr, t: 'act', a: l.a };
    else {
      const x = num(v[0]);
      const range = x > 1.0001 ? [0, x > 127 ? 1023 : 127] : x < 0 ? [-1, 1] : [0, 1]; // (a 0–127 or a −1–1 control, from its first value)
      row = { addr, t: 'slider', label: l.label, range };
    }
    list.push(row); setConf('osc.maps', list.slice(-128));
    toast(`📡 ${addr} → ${row.t === 'act' ? stage()?.ACTION_NAME?.[row.a] || row.a : row.label}${row.range && row.range.join() !== '0,1' ? ` (${row.range.join('–')})` : ''}`, { timeout: 2600 });
    learnDone?.(row); learnDone = null;
    if (row.t === 'slider') applyMap(row, v);
    return row;
  }
  let learnDone = null;
  // learn: the next address from an app binds to this slider (default: the one you touched last) or action
  function startLearn(o = {}) {
    if (!oscOn) throw new Error('OSC is off: /osc on');
    if (o.a) learn = { kind: 'act', a: o.a };
    else {
      const t = o.slider ? findSlider(o.slider) : null; const lt = stage()?.lastTouched;
      const label = t?.label || (lt && Date.now() - lt.at < 120000 ? lt.label : null);
      if (!label) throw new Error('Touch a slider first (or name one: /osc learn glow)');
      learn = { kind: 'slider', label };
    }
    toast(`📡 Move a control in your OSC app for ${learn.kind === 'act' ? (stage()?.ACTION_NAME?.[learn.a] || learn.a) : `"${learn.label}"`} (Esc stops)`, { timeout: 5000 });
    return new Promise((res) => { learnDone = res; setTimeout(() => { if (learnDone === res) { learn = null; learnDone = null; res(null); } }, 30000); });
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && learn) { learn = null; learnDone?.(null); learnDone = null; toast('OSC learn stopped', { timeout: 1200 }); } });
  function forget(q) {
    const list = maps(); const i = /^\d+$/.test(String(q)) ? Number(q) - 1 : list.findIndex((x) => x.addr === q || x.label === q);
    if (i < 0 || !list[i]) throw new Error('No such mapping (/osc maps)');
    const [x] = list.splice(i, 1); setConf('osc.maps', list); return x;
  }
  I.onOsc((list) => { for (const m of list) route(m).catch((err) => console.warn('OSC', m.a, err.message)); });

  // ---------- out ----------
  const targets = () => cfg().targets || [];
  const send = (msgs, to = targets()) => { if (!msgs.length || !to.length) return; stats.out += msgs.length; I.oscSend({ to, msgs }); };
  function reply(from, msgs) { const [host, port] = String(from || '').split(':'); if (host && port) I.oscSend({ to: [{ host, port: Number(port) }], msgs }); send(msgs); }
  let offs = [];
  function wireOut() {
    for (const f of offs) f();
    offs = [];
    if (!oscOn || !targets().length) return;
    const c = cfg(); const P = c.prefix; const pr = preset();
    if (c.out.beat || pr.onBar) offs.push(clock.on((e) => {
      const msgs = [];
      if (c.out.beat) { msgs.push([`${P}/beat`, [{ i: e.beat }]]); if (e.down) msgs.push([`${P}/bar`, [{ i: e.bar }]]); }
      if (e.down && pr.onBar) msgs.push(...pr.onBar(e));
      // (on time: the clock wakes a little early)
      const ms = e.at - performance.now();
      if (ms > 2) setTimeout(() => send(msgs), ms); else send(msgs);
    }));
    if (c.out.bpm || pr.onTempo) offs.push(clock.onTempo((bpm) => send([...(c.out.bpm ? [[`${P}/bpm`, [r3(bpm)]]] : []), ...(pr.onTempo ? pr.onTempo(bpm) : [])])));
    if (c.out.hits || c.out.features) offs.push(features.on((v, hits) => {
      const msgs = [];
      if (c.out.hits) for (const [k, x] of hits) msgs.push([`${P}/${k}`, [x]]);
      if (c.out.features) for (const k of FEAT) if (v[k] != null && !k.endsWith('On')) msgs.push([`${P}/audio/${k}`, [r3(Number(v[k]) || 0)]]);
      if (msgs.length) { stats.out += msgs.length; I.oscSend({ to: targets(), msgs, bundle: msgs.length > 1 }); }
    }));
    if (c.out.sliders || pr.feedback) offs.push(sliders.on((changed) => {
      const msgs = [];
      for (const x of changed) { if (c.out.sliders) msgs.push([`${P}/slider/${slug(x.label)}`, [x.u]]); if (pr.feedback) msgs.push(...pr.feedback(x)); }
      send(msgs);
    }));
    if (c.out.scene) { const f = () => { const h = hk(); if (!h) return; const n = (stage()?.setlist.list() || []).find((x) => x.current)?.n || 0; send([[`${P}/scene`, [h.sketchName()]], [`${P}/scene/index`, [{ i: n }]]]); }; addEventListener('hearth:sketch', f); offs.push(() => removeEventListener('hearth:sketch', f)); }
    if (c.out.beat || c.out.bpm) send([[`${P}/bpm`, [r3(clock.bpm)]]]);
    if (pr.hello) send(pr.hello);
  }

  // ---------- on / off ----------
  async function on(o = {}) {
    const c = { ...cfg(), ...o };
    oscSt = await I.oscStart({ port: c.port, scope: c.scope });
    setCfg({ port: c.port, scope: c.scope });
    oscOn = true; auto('osc', true);
    wireOut();
    return status();
  }
  async function off() { oscSt = await I.oscStop(); oscOn = false; learn = null; auto('osc', false); wireOut(); return status(); }
  async function usePreset(id) {
    const p = PRESETS[id]; if (!p) throw new Error(`Presets: ${Object.keys(PRESETS).join(', ')}`);
    const c = cfg();
    setCfg({ preset: id, port: p.port, scope: p.scope || c.scope, targets: [{ host: c.targets[0]?.host || '127.0.0.1', port: p.target }], out: { ...c.out, ...(p.out || {}) } });
    if (oscOn) await on(); else wireOut();
    return p;
  }
  function addTarget(spec) {
    const m = /^\s*([\w.-]+)?:?(\d{2,5})\s*$/.exec(String(spec || ''));
    if (!m) throw new Error('Send to: host:port (127.0.0.1:9001, 192.168.1.20:8000) or just a port');
    const host = m[1] || '127.0.0.1'; const port = Number(m[2]);
    if (!(host === 'localhost' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host))) throw new Error('OSC goes to this computer or your local network only');
    const list = targets().filter((t) => !(t.host === host && t.port === port)); list.push({ host, port });
    setCfg({ targets: list.slice(-8) }); wireOut(); return { host, port };
  }
  function removeTarget(spec) { const s = String(spec); const list = targets().filter((t) => `${t.host}:${t.port}` !== s && String(t.port) !== s); setCfg({ targets: list }); wireOut(); return list; }
  function setOut(k, v) { if (!(k in OUT_DEF)) throw new Error(`Out: ${Object.keys(OUT_DEF).join(', ')}`); setCfg({ out: { ...cfg().out, [k]: v } }); wireOut(); return cfg().out; }
  async function status() { oscSt = await I.oscStatus(); return { ...oscSt, on: oscSt.on, cfg: cfg(), preset: preset().name, maps: maps(), learning: learn, stats: { ...stats }, recent: recent.slice(0, 12) }; }
  function addresses() {
    const P = cfg().prefix;
    return [
      `${P}/slider/<name> 0–1 · ${P}/slider/<name>/value <real value> · ${P}/fader/<n> 0–1 (nth slider) · ${P}/xy x y (sliders 1 and 2)`,
      `${P}/go · /cut · /next · /prev · /shuffle · /shuffleBack · /freeze · /tap · /blackout · /play · /look · /show (1 = press; or ${P}/act/<name>)`,
      `${P}/scene <name | set-list number> · ${P}/scene/next · ${P}/cue <name | n> · ${P}/set/<n> (cue n + GO) · ${P}/bpm 128 · ${P}/xfade 0–1 · ${P}/layer <name> · ${P}/look <name> · ${P}/ping → ${P}/pong · ${P}/sync (send every slider)`,
      `Out: ${P}/beat 1–4 · ${P}/bar n · ${P}/bpm · ${P}/kick · /snare · /hat (hits) · ${P}/audio/<level|low|mids|brilliance|loudness|centroid|flux|beatPhase|barPhase|intensity|build|drop…> · ${P}/slider/<name> · ${P}/scene <name> · ${P}/scene/index n`,
    ];
  }

  // ================= Ableton Link (tempo, listen only) =================
  let linkSt = null; let linkOn = false;
  I.onLink((st) => {
    linkSt = st;
    if (!linkOn || !(st.bpm > 0)) return;
    const S = stage(); if (!S) return;
    const src = S.source?.();
    if (src === 'song' || src === 'midi') return; // (a playing song or MIDI clock in leads)
    if (Math.abs(S.bpm() - st.bpm) > 0.05) { try { S.setBpm(st.bpm); clock.resync(); } catch { /* out of range */ } }
  });
  async function link(onOff) {
    if (onOff === false) { linkSt = await I.linkStop(); linkOn = false; auto('link', false); return linkSt; }
    linkSt = await I.linkStart(); linkOn = true; auto('link', true); return linkSt;
  }
  async function linkStatus() { linkSt = await I.linkStatus(); return { ...linkSt, following: linkOn }; }

  // ================= menus (🎚 Live (VJ) → 🔌 Connect) =================
  const check = (on) => ({ checked: Boolean(on) });
  function oscItems() {
    const c = cfg(); const ms = maps();
    return [
      `OSC · ${oscOn ? `listening on ${c.scope === 'lan' ? 'your network' : 'this computer'} :${c.port}` : 'off'}`,
      { label: oscOn ? 'Turn OSC off' : 'Turn OSC on', hint: oscOn ? '' : `port ${c.port}`, action: () => (oscOn ? off() : on()).then(() => toast(`📡 OSC ${oscOn ? `on :${cfg().port}` : 'off'}`, { timeout: 1500 })).catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'App preset', hint: preset().name, items: () => Object.entries(PRESETS).map(([k, p]) => ({ label: p.name, hint: `in ${p.port} · out ${p.target}`, checked: c.preset === k, action: () => usePreset(k).then(() => toast(`📡 ${p.name}: ${p.note}`, { timeout: 6000 })).catch((err) => toast(err.message, { type: 'error' })) })) },
      { label: 'Listen on', hint: c.scope === 'lan' ? 'your network' : 'this computer', items: () => [{ label: 'This computer only', hint: '127.0.0.1', ...check(c.scope === 'local'), action: () => (setCfg({ scope: 'local' }), oscOn && on()) }, { label: 'My network (phones, another computer)', hint: 'private addresses only', ...check(c.scope === 'lan'), action: () => (setCfg({ scope: 'lan' }), oscOn && on()) }, { label: 'Port…', hint: String(c.port), action: async () => { const v = await Modal.prompt('OSC port Hearth listens on', { value: String(c.port) }); if (v) { setCfg({ port: Number(v) }); if (oscOn) on().catch((err) => toast(err.message, { type: 'error' })); } } }] },
      { label: 'Send to', hint: c.targets.map((t) => `${t.host === '127.0.0.1' ? '' : t.host}:${t.port}`).join(', ') || 'nowhere', items: () => [...c.targets.map((t) => ({ label: `${t.host}:${t.port}`, hint: 'click to remove', action: () => removeTarget(`${t.host}:${t.port}`) })), { label: '＋ Add an app…', action: async () => { const v = await Modal.prompt('Send OSC to (host:port, on this computer or your network)', { value: '127.0.0.1:9001' }); if (v) { try { addTarget(v); } catch (err) { toast(err.message, { type: 'error' }); } } } }] },
      { label: 'Send out', items: () => [['beat', 'Beat and bar'], ['bpm', 'Tempo'], ['hits', 'Kick · snare · hat hits'], ['features', 'Audio features (30/s)'], ['sliders', 'Slider values'], ['scene', 'Scene name']].map(([k, l]) => ({ label: l, ...check(c.out[k]), action: () => setOut(k, !c.out[k]) })) },
      { label: '🎯 Learn: the slider I touched', hint: stage()?.lastTouched?.label || 'touch one first', action: () => startLearn().catch?.((err) => toast(err.message, { type: 'error' })) },
      { label: '🎯 Learn a pad', items: () => (stage()?.ACTIONS || []).slice(0, 12).map(([k, l]) => ({ label: l, action: () => { try { startLearn({ a: k }); } catch (err) { toast(err.message, { type: 'error' }); } } })) },
      { label: 'Mappings', hint: String(ms.length), items: () => (ms.length ? ms.map((x, i) => ({ label: `${x.addr} → ${x.t === 'act' ? x.a : x.label}`, hint: 'click to forget', action: () => forget(i + 1) })) : ['Nothing learned yet']) },
      { label: 'Addresses…', hint: cfg().prefix, action: () => Modal.alert('Hearth\'s OSC addresses', addresses().join('\n\n')) },
    ];
  }
  function menuItems() {
    const M = window.InteropMidi; const O = window.InteropObs;
    return [
      'Connect',
      { label: '📡 OSC', hint: oscOn ? `:${cfg().port} · ${preset().name}` : 'off', items: oscItems },
      M ? { label: '🎹 MIDI out', hint: M.summary(), items: () => M.menuItems() } : null,
      O ? { label: '🎥 OBS', hint: O.summary(), items: () => O.menuItems() } : null,
      { label: '🔗 Ableton Link', hint: linkOn ? `${linkSt?.peers || 0} peer${linkSt?.peers === 1 ? '' : 's'}${linkSt?.bpm ? ` · ${linkSt.bpm.toFixed(1)}` : ''}` : 'off', items: () => [
        { label: linkOn ? 'Stop following Link' : 'Follow Link\'s tempo', hint: 'listen only', action: () => link(!linkOn).catch((err) => toast(err.message, { type: 'error' })) },
        'Tempo only: line up the phase with a tap, or use MIDI clock / AbletonOSC for beat-exact sync',
      ] },
    ];
  }

  // the menu's hints read the main side's state once when it opens
  async function prepare() { await Promise.all([status().catch(() => null), linkStatus().catch(() => null), window.InteropObs?.status().catch(() => null)]); }

  // back on at start when it was on (the owner's setup stays as left)
  async function resume() {
    const a = conf('auto', {});
    if (a.osc) await on().catch((err) => console.warn('OSC resume:', err.message));
    if (a.link) await link(true).catch(() => {});
  }

  return {
    AREA, PRESETS, ACTS, clock, features, sliders, ready, findSlider, findScene, slug,
    on, off, status, usePreset, addTarget, removeTarget, setOut, startLearn, forget, maps, addresses, cfg, setCfg, link, linkStatus, menuItems, prepare, resume, send,
    route, // (the checks drive it with fake messages too)
    get isOn() { return oscOn; }, get stats() { return { ...stats }; }, get learning() { return learn; },
  };
})();
window.Interop = Interop;
