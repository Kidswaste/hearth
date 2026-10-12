// The Lab's live stage (round 22, labstage): a fake MIDI controller (navigator.requestMIDIAccess stubbed), learn with
// the slider under the pointer, soft takeover, a pad and a key bound to actions, MIDI clock in; the set list, the cue
// deck, crossfade / cut on the beat; show mode (chrome hidden, restart / reload blocked, a scene error held, Light
// mode when frames drop); the output window (Stage window) with a crossfade on it; /stage; and what a burst of MIDI
// costs the hub.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/labstage.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(50); } return false; };
const out = {}; const problems = [];
const step = (name, ok, info) => { out[name] = info === undefined ? Boolean(ok) : info; if (!ok) problems.push(name); };

// ---------- a fake controller ----------
const inp = new EventTarget(); inp.name = 'Fake nanoKONTROL'; inp.state = 'connected'; inp.type = 'input'; inp.id = 'fake1';
Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([['fake1', inp]]), outputs: new Map(), addEventListener() {} }) });
const send = (...bytes) => inp.dispatchEvent(new MessageEvent('midimessage', { data: Uint8Array.from(bytes) }));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

activate('tool:three'); await wait(500);
const c = await ThreeLab.cmd();
const S = ThreeStage; const M = ThreeStageMidi; const h = ThreeLab.stageHooks;
step('loaded', S && M && h);
// three scenes with sliders
const code = (color, geo) => `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.6, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, glow: { value: 0.5, min: 0, max: 1, label: 'Glow' }, tint: { value: '${color}', label: 'Tint' } });
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.${geo}, new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; mesh.scale.setScalar(P.size); mesh.material.color.set(P.tint); renderer.render(scene, camera); });`;
const ids = [];
for (const [n, col, geo] of [['Stage A', '#ffb000', 'TorusKnotGeometry(1, 0.3, 96, 12)'], ['Stage B', '#22d3ee', 'IcosahedronGeometry(1.2, 1)'], ['Stage C', '#ff3b8f', 'TorusGeometry(1.2, 0.2, 12, 48)']]) {
  ids.push(ThreeLab.scenes.create({ name: n, code: code(col, geo), open: true }).id); await wait(1800);
}
step('three scenes', new Set(ids).size === 3, ids.length);
c.panel(true); await wait(600);

// ---------- MIDI learn: the slider under the pointer ----------
await M.open();
step('midi device', M.devices().includes('Fake nanoKONTROL'), M.devices());
const ctl = h.ctl();
const num = ctl.controls().filter((x) => x.min != null && x.max > x.min);
const row = [...document.querySelectorAll('.tw-column [data-tw-key]')].find((n) => n.offsetParent && num.some((x) => x.key === n.dataset.twKey));
step('slider rows carry their key', Boolean(row));
M.startLearn({ kind: 'slider' });
const learnTarget = row ? num.find((x) => x.key === row.dataset.twKey) : num[0];
if (row) { const r = row.getBoundingClientRect(); dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); } else S.touched(h.layer().id, learnTarget.key, learnTarget.label);
send(0xB0, 21, 64);
const sid = ThreeLab.scenes.currentId();
const bound = M.data.scenes[sid]?.['1:cc21'];
step('learn binds the knob to the slider under the pointer', bound?.key === learnTarget.key, bound);
M.stopLearn();

// ---------- soft takeover ----------
const val = () => ctl.controls().find((x) => x.key === learnTarget.key).value;
const norm = () => (val() - learnTarget.min) / (learnTarget.max - learnTarget.min);
const v0 = val(); const u0 = norm();
const far = u0 < 0.5 ? 127 : 0;
send(0xB0, 21, far); await frame(); await frame();
step('soft takeover: a far knob does nothing', Math.abs(val() - v0) < 1e-9, { before: v0, after: val() });
send(0xB0, 21, Math.round(u0 * 127)); await frame(); await frame();
send(0xB0, 21, Math.round(0.9 * 127)); await frame(); await frame();
step('soft takeover: picked up, then it follows', Math.abs(norm() - Math.round(0.9 * 127) / 127) < 0.02, { u: Math.round(norm() * 1000) / 1000 });

// a burst of 500 knob messages: per-message cost, applies coalesced to frames
const applied0 = M.stats.applied; const t0 = performance.now();
for (let i = 0; i < 500; i++) send(0xB0, 21, 100 + (i % 20));
const burstMs = performance.now() - t0;
await frame(); await frame();
step('MIDI burst: cheap per message, applied once a frame', burstMs < 150 && M.stats.applied - applied0 <= 3, { burstMs: Math.round(burstMs * 10) / 10, perMsgUs: Math.round((burstMs / 500) * 1000), applies: M.stats.applied - applied0 });

// ---------- a pad and a key ----------
M.startLearn({ kind: 'action', action: 'freeze' });
send(0x90, 36, 100);
step('pad learned', M.data.global['1:n36']?.a === 'freeze', M.data.global['1:n36']);
const fz0 = h.frozen; send(0x90, 36, 100); await wait(100);
step('pad runs its action (freeze)', h.frozen !== fz0);
send(0x90, 36, 100); await wait(100);
M.startLearn({ kind: 'action', action: 'shuffle' });
document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true }));
step('key learned', M.data.keys.KeyJ === 'shuffle', M.data.keys);
const before = JSON.stringify(ctl.controls().map((x) => x.value));
document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true })); await wait(200);
step('key runs its action (shuffle)', JSON.stringify(ctl.controls().map((x) => x.value)) !== before);

// ---------- MIDI clock in (120 BPM: a tick every 20.8 ms) ----------
send(0xFA);
for (let i = 0; i < 40; i++) { send(0xF8); await wait(20.8); }
step('MIDI clock gives the tempo', S.source() === 'midi' && Math.abs(S.bpm() - 120) < 15, { source: S.source(), bpm: S.bpm() });
await wait(1700);
step('tempo falls back when the clock stops', S.source() !== 'midi', S.source());
// taps
const t1 = performance.now(); [0, 500, 1000, 1500].forEach((ms) => S.tap(t1 + ms));
step('taps set the tempo', Math.abs(S.bpm() - 120) < 1, S.bpm());

// ---------- beat LFO ----------
S.touched(h.layer().id, learnTarget.key, learnTarget.label);
let lfoOk = true; try { S.lfo(null, { shape: 'tri', rate: 4, depth: 0.3 }); } catch (e) { lfoOk = e.message; }
step('beat LFO on the last touched slider', lfoOk === true, lfoOk);
S.lfo(null, { shape: 'off' });

// ---------- set list, cue deck, crossfade / cut ----------
S.setlist.clear();
for (const id of ids) S.setlist.add(id);
step('set list', S.setlist.list().length === 3, S.setlist.list().map((x) => x.name));
ThreeLab.scenes.open(ids[0]); await wait(1500);
await S.cue(ids[1]);
step('cue deck: a live monitor', S.state.deck && !S.state.deck.hidden && !S.state.deck.full && S.state.cued, S.state.deck);
await until(() => document.querySelector('.stage-deck .three-frame')?.src.includes('three-sandbox'), 4000);
// a 1-beat crossfade landing now: mid-way both scenes are on screen (the deck partly over the preview)
const goP = S.go(null, { mode: 'fade', beats: 2, quant: 'off' });
let mid = null;
for (let i = 0; i < 80 && mid == null; i++) { await wait(25); const d = document.querySelector('.stage-deck'); const op = d ? Number(getComputedStyle(d).opacity) : 0; if (d?.classList.contains('full') && op > 0.1 && op < 0.9) mid = op; }
await goP;
step('crossfade: both scenes live mid-way', mid != null, { midOpacity: mid });
step('crossfade: the cued scene is on screen after', ThreeLab.scenes.currentId() === ids[1], ThreeLab.scenes.currentId());
step('auto-cue: the next one waits in the deck', S.state.cued === ThreeLab.scenes.get(ids[2]).name, S.state.cued);
const tCut = performance.now();
await S.go(null, { mode: 'cut', quant: 'beat' });
step('cut on the beat', ThreeLab.scenes.currentId() === ids[2] && performance.now() - tCut < 3500, { ms: Math.round(performance.now() - tCut) });
await S.act('next'); // wraps to the first
step('next wraps around the set list', ThreeLab.scenes.currentId() === ids[0], ThreeLab.scenes.currentId());

// ---------- show mode ----------
const fpsBefore = h.fps; const lightBefore = h.light;
S.setShow(true); await frame();
step('show mode hides the editing', h.pane.classList.contains('lab-show') && !h.pane.querySelector('.three-toolbar').offsetParent && !document.querySelector('.stage-hud').hidden);
step('show mode locks the frame rate', h.fps === 60, h.fps);
await wait(1500); await smoke({ shot: '/tmp/hearth-labstage-show.png' }); // the HUD and the cue monitor
step('show mode blocks restart (Ctrl+R)', ThreeLab.restartVisible() === true);
const bu = new Event('beforeunload', { cancelable: true }); dispatchEvent(bu);
step('show mode blocks reloads', bu.defaultPrevented);
// a scene error: the last good frame is held, then the show moves to the next scene on the bar
S.preview({ type: 'error', message: 'boom (test)' });
step('error: last good frame held', h.frozen && S.state.held, S.state.held);
await until(() => !S.state.held && !S.state.busy, 6000);
step('error: on to the next scene, unfrozen', ThreeLab.scenes.currentId() === ids[1] && !h.frozen, { current: ThreeLab.scenes.currentId(), frozen: h.frozen });
// frames dropping for 3 s: Light mode
for (let i = 0; i < 7; i++) S.preview({ type: 'stats', fps: 20, cap: 60 });
step('dropped frames: Light mode', h.light && S.state.autoLight);
// keys: Enter = GO
document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await until(() => S.state.busy, 1000); await until(() => !S.state.busy, 6000);
step('Enter = GO in show mode', ThreeLab.scenes.currentId() === ids[2], ThreeLab.scenes.currentId());
S.setShow(false); await frame();
step('show mode off: all back', !h.pane.classList.contains('lab-show') && h.fps === fpsBefore && h.light === lightBefore, { fps: h.fps, light: h.light });

// ---------- output window ----------
const displays = (await window.hub.stageDisplays?.()) || [];
step('screens listed', displays.length >= 1, displays.map((d) => `${d.label} ${d.width}x${d.height}${d.hub ? ' hub' : ''}`));
const placed = await S.output(true);
// (the Stage window is its own page target: smoke.js answers three.js from the CDN cache only for the main page and its
// frames, so with no network the output may never draw here; that it opens, places and switches is what's checked)
const tOut = performance.now(); await until(() => h.onStage && h.box.ready, 8000); out.outputReady = h.box.ready ? Math.round(performance.now() - tOut) : 'not drawing here (no CDN for its own target)';
step('output on (the Stage window)', h.onStage && placed && placed.fullscreen, { placed, onStage: h.onStage, ready: h.box.ready, loading: h.box.loading });
S.blackout(true); step('black-out', S.state.black); S.blackout(false);
await S.go(ids[0], { mode: 'fade', beats: 1, quant: 'off' });
step('crossfade on the output', ThreeLab.scenes.currentId() === ids[0] && h.onStage, ThreeLab.scenes.currentId());
S.setRes('720p');
step('output resolution', JSON.stringify(S.outputSize()) === JSON.stringify({ width: 1280, height: 720 }));
S.setRes('frame');
await S.output(false); await wait(500);
step('output off', !h.onStage);

// ---------- /stage ----------
const said = []; const errs = [];
const run = (t) => Commands.exec(t, H.claudeAgent()?.id, { say: (x) => said.push(String(x)), note: (x) => said.push(String(x)), error: (x) => errs.push(x) });
for (const t of ['/stage', '/stage set', '/stage mode cut', '/stage length 2bars', '/stage quantize beat', '/stage bpm 128', `/stage lfo ${learnTarget.label} saw 1bar 0.2`, `/stage lfo ${learnTarget.label} off`, '/stage midi', '/stage keys', '/vj show on', '/stage show off', '/stage mode fade', '/stage length 4', '/stage quantize bar']) await run(t);
step('/stage commands', errs.length === 0 && said.length >= 10, { said: said.length, errs });
step('no duplicate commands', !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
S.uncue();
return JSON.stringify({ ok: !problems.length, problems, ...out }, null, 1);
