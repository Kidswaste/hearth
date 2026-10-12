// Interop (round 25): OSC sent to Hearth on 127.0.0.1 moves sliders (by name, by number, a learned address with a
// 0–127 range), cues a scene, GO, tempo + freeze in one bundle; Hearth's OSC beat / bar / tempo / scene messages
// received by a listener; MIDI out to a stubbed Web MIDI output (clock at the tempo with Start / Stop, notes on the
// beat and bar 1, a slider as CC with its wiggle); the OBS Browser Source page served on 127.0.0.1 (Origin / Host
// checked) and drawing the Lab with alpha in a hidden window; a fake obs-websocket (v5, password) where Hearth
// switches scenes with the Lab, records, asks before streaming and adds itself as a browser source; Link tempo; the
// commands and the Live menu.
//   node dev/smoke.js --fake-obs --check-timeout 240000 --script dev/checks/interop.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return false; };
const out = {}; const problems = [];
const step = (name, ok, info) => { out[name] = info === undefined ? Boolean(ok) : info; if (!ok) problems.push(name); };
const T = window.hub.interop.test;

// ---------- a stubbed Web MIDI output (and no inputs) ----------
const sent = [];
const fakeOut = { name: 'Fake MIDI Out', state: 'connected', type: 'output', id: 'o1', send: (d, ts) => sent.push({ d: [...d], ts: ts ?? performance.now() }) };
Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map(), outputs: new Map([['o1', fakeOut]]), addEventListener() {} }) });

// ---------- the Lab: two scenes, one with a transparent background ----------
activate('tool:three'); await wait(500);
await ThreeLab.cmd();
const h = ThreeLab.stageHooks; const S = ThreeStage;
const code = (color) => `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.6, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, glow: { value: 0.5, min: 0, max: 1, label: 'Glow' } });
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ color: '${color}' })); scene.add(mesh);
renderer.setAnimationLoop(() => { mesh.scale.setScalar(0.8 + P.size * 0.1); renderer.render(scene, camera); });`;
const ids = [];
for (const [n, col] of [['Interop A', '#ffb000'], ['Main', '#22d3ee']]) { ids.push(ThreeLab.scenes.create({ name: n, code: code(col), open: true }).id); await wait(1800); }
ThreeLab.scenes.open(ids[0]); await wait(1500);
step('two scenes', ThreeLab.scenes.currentId() === ids[0] && h.ctl()?.controls().length >= 3, h.ctl()?.controls().length);
store.set('three.stage.mode', 'cut'); store.set('three.stage.quant', 'off');
const val = (label) => h.ctl().controls().find((x) => x.label === label)?.value;

// ---------- OSC in ----------
await Lazy.load('interop');
const listen = await T({ oscListen: 0 });
const port = 42000 + Math.floor(Math.random() * 2000);
Interop.setCfg({ targets: [{ host: '127.0.0.1', port: listen }], out: { beat: true, bpm: true, hits: false, features: false, sliders: true, scene: true } });
const st = await Interop.on({ port, scope: 'local' });
step('OSC on 127.0.0.1', st.on && st.port === port && st.scope === 'local', { port: st.port, scope: st.scope });
const osc = (addr, args = []) => T({ oscSend: { port, addr, args } });
await osc('/hearth/slider/glow', [0.25]);
step('slider by name (0–1)', await until(() => Math.abs(val('Glow') - 0.25) < 0.01, 3000), val('Glow'));
await osc('/hearth/fader/2', [0.5]);
step('slider by number', await until(() => Math.abs(val('Size') - 1.6) < 0.02, 3000), val('Size'));
await osc('/hearth/slider/spin/value', [1.5]);
step('slider by its real value', await until(() => Math.abs(val('Spin') - 1.5) < 0.02, 3000), val('Spin'));
await osc('/hearth/cue', ['Main']);
step('cue a scene by name', await until(() => S.state.cued === 'Main', 8000), S.state.cued);
await osc('/hearth/go', [1]);
step('GO switches to it', await until(() => ThreeLab.scenes.currentId() === ids[1], 10000), h.sketchName());
await wait(1200);
await T({ oscSend: { port, bundle: true, msgs: [['/hearth/bpm', [128]], ['/hearth/freeze', [1]]] } });
step('a bundle: tempo + freeze', await until(() => Math.abs(S.bpm() - 128) < 0.01 && h.frozen, 3000), { bpm: S.bpm(), frozen: h.frozen });
await osc('/hearth/freeze', [1]); await until(() => !h.frozen, 2000);
await osc('/hearth/freeze', [0]); // (a button's release does nothing)
await wait(200);
step('release ignored, unfrozen by the second press', !h.frozen);
// learn: touch Spin, then a control from "the app" sending 0–127
const spin = h.ctl().controls().find((x) => x.label === 'Spin');
S.touched(h.layer().id, spin.key, spin.label);
const learnt = Interop.startLearn();
await osc('/mycontroller/knob3', [96]);
const row = await learnt;
step('learn binds an address (0–127 range from its value)', row?.addr === '/mycontroller/knob3' && row.label === 'Spin' && row.range.join() === '0,127', row);
step('…and moves the slider', await until(() => Math.abs(val('Spin') - (-2 + (96 / 127) * 4)) < 0.03, 3000), val('Spin'));
await osc('/mycontroller/knob3', [32]);
step('the learned control keeps working', await until(() => Math.abs(val('Spin') - (-2 + (32 / 127) * 4)) < 0.03, 3000), val('Spin'));
await osc('/hearth/ping');
step('ping answered (pong)', await until(async () => (await T({ oscGot: true })).some((m) => m.a === '/hearth/pong'), 3000));

// ---------- OSC out: Hearth's beat ----------
await T({ oscGot: true, clear: true });
await wait(2600);
const got = await T({ oscGot: true, clear: true });
const beats = got.filter((m) => m.a === '/hearth/beat');
const gaps = beats.slice(1).map((b, i) => b.t - beats[i].t);
const meanGap = gaps.length ? gaps.reduce((a, x) => a + x, 0) / gaps.length : 0;
step('beat messages at 128 BPM', beats.length >= 4 && Math.abs(meanGap - 468.75) < 40, { n: beats.length, meanGap: Math.round(meanGap), seq: beats.map((b) => b.v[0]).join('') });
step('beat counts 1–4 in order', beats.every((b, i) => i === 0 || b.v[0] === (beats[i - 1].v[0] % 4) + 1));
const bars = got.filter((m) => m.a === '/hearth/bar');
step('bar on beat 1', bars.length >= 1 && got.some((m, i) => m.a === '/hearth/bar' && got.slice(Math.max(0, i - 2), i + 1).some((x) => x.a === '/hearth/beat' && x.v[0] === 1)), bars.length);
out.oscOutSample = got.slice(0, 6).map((m) => `${m.a} ${m.v.join(' ')}`);
// scene name + slider values out
ThreeLab.scenes.open(ids[0]);
const sceneMsg = await until(async () => (await T({ oscGot: true })).find((m) => m.a === '/hearth/scene' && m.v[0] === 'Interop A'), 5000);
step('scene name out', Boolean(sceneMsg));
await until(() => ThreeLab.scenes.currentId() === ids[0] && h.ctl()?.controls().length >= 3, 6000); await wait(800);
await osc('/hearth/slider/glow', [0.7]);
const sl = await until(async () => (await T({ oscGot: true })).find((m) => m.a === '/hearth/slider/glow' && Math.abs(m.v[0] - 0.7) < 0.01), 4000);
step('slider values out', Boolean(sl));

// ---------- MIDI out (stubbed Web MIDI) ----------
await InteropMidi.use('Fake');
InteropMidi.usePreset('beat');
const cc = await InteropMidi.mapCC('Glow');
step('slider → CC 20 with a wiggle', cc.cc === 20 && cc.label === 'Glow' && sent.filter((m) => m.d[0] === 0xB0 && m.d[1] === 20).length >= 4, cc);
sent.length = 0;
await InteropMidi.setClock(true);
const t0 = performance.now();
await wait(2000);
const ticks = sent.filter((m) => m.d[0] === 0xF8);
const tgaps = ticks.slice(1).map((m, i) => m.ts - ticks[i].ts);
const tmean = tgaps.reduce((a, x) => a + x, 0) / Math.max(1, tgaps.length);
step('clock Start then ticks at 24 a beat (128 BPM)', sent.some((m) => m.d[0] === 0xFA) && Math.abs(tmean - 60000 / (128 * 24)) < 0.6 && ticks.length >= 80, { start: sent.some((m) => m.d[0] === 0xFA), ticks: ticks.length, mean: Math.round(tmean * 100) / 100 });
step('ticks scheduled ahead (timestamps)', ticks.some((m) => m.ts > t0 + 1500) && ticks.every((m, i) => i === 0 || m.ts > ticks[i - 1].ts));
const on48 = sent.filter((m) => m.d[0] === 0x90 && m.d[1] === 48);
const ngaps = on48.slice(1).map((m, i) => m.ts - on48[i].ts);
step('a note on every beat', on48.length >= 3 && ngaps.every((g) => Math.abs(g - 468.75) < 30), { n: on48.length, gaps: ngaps.map(Math.round) });
step('note offs follow', sent.some((m) => m.d[0] === 0x80 && m.d[1] === 48));
step('bar 1 note', sent.some((m) => m.d[0] === 0x90 && m.d[1] === 60));
// the clock's beat ticks land on the beat notes (phase)
const beatTick = on48.length ? ticks.reduce((best, m) => (Math.abs(m.ts - on48[1]?.ts) < Math.abs(best - on48[1]?.ts) ? m.ts : best), Infinity) : Infinity;
step('clock in phase with the beat (±12 ms)', Math.abs(beatTick - (on48[1]?.ts ?? 0)) < 12, Math.round(beatTick - (on48[1]?.ts ?? 0)));
await osc('/hearth/slider/glow', [0.4]);
step('a slider move goes out as CC', await until(() => sent.some((m) => m.d[0] === 0xB0 && m.d[1] === 20 && m.d[2] === Math.round(0.4 * 127)), 3000));
await InteropMidi.setClock(false);
step('clock Stop', sent.some((m) => m.d[0] === 0xFC));
InteropMidi.clearRules();

// ---------- OBS Browser Source page ----------
const page = await InteropObs.output(true);
step('page on 127.0.0.1', page.on && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(page.url), page.url);
const pg = await T({ get: '/' }); const other = await T({ get: '/../interopmain.js' }); const rebound = await T({ get: '/', host: 'evil.example' });
step('page with a CSP, nothing else, no rebinding', pg.status === 200 && /script-src 'self'/.test(pg.csp) && other.status === 404 && rebound.status === 403, { pg: pg.status, other: other.status, rebound: rebound.status });
const evil = await T({ raw: { origin: 'http://evil.example' } }); const noOrigin = await T({ raw: {} });
step('websites can\'t read the picture (Origin)', evil === 403 && noOrigin === 403, { evil, noOrigin });
await T({ open: page.url, w: 640, h: 360 });
step('OBS (a hidden window) connects', await until(() => InteropObs.viewers === 1, 6000));
const f0 = InteropObs.stats.frames;
await until(() => T({ eval: 'window.__obs.drawn > 3' }), 10000);
await wait(2000);
const fps = (InteropObs.stats.frames - f0) / ((2000 + 0) / 1000);
const smp = await T({ eval: 'window.__obs.sample()' });
step('frames arrive with alpha: clear corners, solid centre', smp && smp.inside.clear >= 4 && smp.inside.solid >= 4 && smp.gl, smp);
out.obsFps = Math.round(fps * 10) / 10;
step('frames keep coming (≥ 5 a second here)', fps >= 5, out.obsFps);
await InteropObs.setKey('none');
await wait(800);
const smp2 = await T({ eval: 'window.__obs.sample()' });
step('opaque key: no transparency inside the picture', smp2 && smp2.inside.min > 200, smp2);
step('transparent around the picture (letterbox)', !smp2?.outside || smp2.outside.max === 0, smp2?.outside);
await InteropObs.setKey('alpha');
await T({ close: true });
await T({ oscListen: listen }); // (the listener closed with the windows: open again)
step('no viewer → no frames', await until(async () => { const a = InteropObs.stats.frames; await wait(700); return InteropObs.viewers === 0 && InteropObs.stats.frames - a <= 1; }, 5000));

// ---------- obs-websocket (fake OBS, with a password) ----------
const fake = await T({ fakeObs: true });
step('fake OBS running', Boolean(fake?.url), fake?.url);
let o = await InteropObs.connect(fake.url);
step('asks for the password', o.state === 'auth', o.why);
const pw = InteropObs.password();
await until(() => document.querySelector('dialog[open] input[type=password]'), 3000);
const inp = document.querySelector('dialog[open] input[type=password]');
inp.value = fake.password;
[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Save').click();
const pst = await pw;
step('password typed in a masked field', pst?.hasPassword === true);
const file = await T({ obsFile: true });
step('never stored in the clear', !file.includes(fake.password), { saved: pst?.saved, keychain: pst?.keychain });
o = await InteropObs.connect();
step('connected (v5 auth)', o.state === 'on' && o.scenes.join() === 'Intro,Main,Outro', o);
step('password not in the status', !JSON.stringify(o).includes(fake.password));
const fstate = () => T({ fakeObsState: true });
// OBS follows the Lab: "Main" by name, "Interop A" linked by hand
InteropObs.link('Interop A', 'Outro');
step('a linked scene switches OBS', await until(async () => (await fstate()).current === 'Outro', 4000));
await S.cue(ids[1]); await S.go();
step('GO to "Main" → OBS "Main" (same name)', await until(async () => (await fstate()).current === 'Main', 8000), (await fstate()).current);
const say = (cmd, args) => Commands.get(cmd).run(args, { say() {}, agentId: H.claudeAgent?.()?.id });
await say('obs', 'record on');
step('record from Hearth', await until(async () => (await fstate()).record === true, 3000));
step('status shows recording', await until(() => InteropObs.obs?.rec?.active === true, 3000));
await say('obs', 'record off');
step('stop recording', await until(async () => (await fstate()).record === false, 3000));
// streaming asks first: cancel, then allow
const s1 = say('obs', 'stream on');
await until(() => document.querySelector('dialog[open]'), 3000);
const askText = document.querySelector('dialog[open]')?.textContent || '';
[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Cancel').click();
const r1 = await s1;
step('streaming asks first (cancel → nothing)', /Go live/.test(askText) && /cancelled/.test(r1) && (await fstate()).stream === false, r1);
const s2 = say('obs', 'stream on');
await until(() => document.querySelector('dialog[open]'), 3000);
[...document.querySelectorAll('dialog[open] button')].find((b) => /Start streaming/.test(b.textContent)).click();
await s2;
step('…and streams when allowed', await until(async () => (await fstate()).stream === true, 3000));
await say('obs', 'stream off');
const add = await InteropObs.addSource();
const fs2 = await fstate();
const src = fs2.inputs.find((x) => x.inputName === 'Hearth Lab');
step('adds the Lab to OBS as a browser source', src?.inputKind === 'browser_source' && src.inputSettings.url === page.url && add.scene === 'Main', { src, add });
out.obsLog = fs2.log.slice(-12).join(' ');
await InteropObs.disconnect();

// ---------- Link (tempo, listen only) ----------
let linkOk = false;
try {
  await Interop.link(true);
  await T({ link: { port: 20808, bpm: 126, playing: true } });
  linkOk = await until(() => Math.abs(S.bpm() - 126) < 0.01, 3000);
  step('Link tempo followed', linkOk, S.bpm());
  await Interop.link(false);
} catch (err) { step('Link tempo followed', false, err.message); }

// ---------- commands, menu ----------
const texts = {};
for (const [c, a] of [['osc', ''], ['osc', 'addresses'], ['osc', 'maps'], ['osc', 'preset'], ['midi-out', ''], ['obs', ''], ['link', '']]) { try { texts[`${c} ${a}`] = String(await say(c, a)).slice(0, 160); } catch (err) { texts[`${c} ${a}`] = `ERR ${err.message}`; } }
step('commands answer', Object.values(texts).every((t) => !t.startsWith('ERR')), texts);
const p = await Interop.usePreset('touchosc');
step('a preset sets its ports', p.port === 8000 && Interop.cfg().targets[0].port === 9000 && Interop.cfg().scope === 'lan');
await Interop.usePreset('generic');
const live = S.menuItems().find((x) => x && typeof x === 'object' && /Connect/.test(x.label));
const sub = live ? await live.items() : [];
step('Live (VJ) menu → 🔌 Connect', sub.some((x) => x?.label === '📡 OSC') && sub.some((x) => x?.label === '🎥 OBS') && sub.some((x) => x?.label === '🎹 MIDI out'), sub.map((x) => x?.label || x));
step('no duplicate commands', Commands.duplicates().length === 0, Commands.duplicates().map((d) => d.name));
await InteropObs.output(false); await Interop.off(); await T({ close: true });
out.stats = { interop: Interop.stats, midi: InteropMidi.stats, obs: InteropObs.stats };
out.problems = problems;
return JSON.stringify(out);
