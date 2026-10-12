// Phone remote (round 24, remote): the LAN server on 127.0.0.1, sockets from elsewhere refused, the page in a hidden
// window as the phone (pair with the code, a wrong code first), a fader moved with soft takeover → the Lab slider,
// a second phone at once that sees the move, GO on the set list, preview frames arriving, kick, revoke (forget),
// auto-off after inactivity, the card on the computer (QR + code + who's connected), /remote.
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/remote.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = {}; const problems = [];
const step = (name, ok, info) => { out[name] = info === undefined ? Boolean(ok) : info; if (!ok) problems.push(name); };
const T = window.hub.remote.test;
const ph = (win, js) => T({ win, eval: js });

activate('tool:three'); await wait(500);
const c = await ThreeLab.cmd();
const h = ThreeLab.stageHooks; const S = ThreeStage;
const code = (color) => `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.6, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, glow: { value: 0.5, min: 0, max: 1, label: 'Glow' }, mode: { value: 'a', options: ['a', 'b', 'c'], label: 'Mode' } });
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 64, 8), new THREE.MeshBasicMaterial({ color: '${color}', wireframe: true })); scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
const ids = [];
for (const [n, col] of [['Remote A', '#ffb000'], ['Remote B', '#22d3ee']]) { ids.push(ThreeLab.scenes.create({ name: n, code: code(col), open: true }).id); await wait(1800); }
ThreeLab.scenes.open(ids[0]); await wait(1500);
step('two scenes', ThreeLab.scenes.currentId() === ids[0] && h.ctl()?.controls().length >= 3, h.ctl()?.controls().length);

// ---------- the server ----------
await Lazy.load('remote');
const st = await Remote.on({ host: '127.0.0.1', port: 0 });
step('server on 127.0.0.1, no secret in the URL', st.on && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(st.url), st.url);
step('a 6-digit code', /^\d{6}$/.test(st.code?.code || ''));
step('bound to the one address asked', (await Remote.refresh()).host === '127.0.0.1');
step('card: QR + code', Boolean(document.querySelector('.remote-card .remote-qr svg path')) && document.querySelector('.remote-code')?.textContent.replace(/\s/g, '') === st.code.code);
// sockets from another page / host are refused (Origin, DNS rebinding)
const evil = await T({ raw: { origin: 'http://evil.example' } }); const noOrigin = await T({ raw: {} }); const rebind = await T({ raw: { host: `attacker.example:${st.port}`, origin: `http://attacker.example:${st.port}` } });
step('foreign sockets refused', evil === 403 && noOrigin === 403 && rebind === 403, { evil, noOrigin, rebind });
const page = await T({ get: '/' }); const other = await T({ get: '/../main.js' }); const rebound = await T({ get: '/', host: 'attacker.example' });
step('page with a CSP, nothing else served', page.status === 200 && /script-src 'self'/.test(page.csp) && other.status === 404 && rebound.status === 403, { page: page.status, other: other.status, rebound: rebound.status });

// ---------- phone A: pair (a wrong code first) ----------
await T({ open: st.url, win: 'a' });
step('pair form', await until(() => ph('a', "!document.getElementById('pair').hidden"), 8000));
const wrong = st.code.code === '000000' ? '111111' : '000000';
await ph('a', `document.getElementById('code').value='${wrong}'; document.getElementById('name').value='Phone A'; document.getElementById('pair').requestSubmit(); true`);
step('wrong code refused', await until(() => ph('a', "/Wrong code/.test(document.querySelector('#pair p').textContent)"), 6000));
const code1 = (await Remote.refresh()).code.code;
await ph('a', `document.getElementById('code').value='${code1}'; document.getElementById('pair').requestSubmit(); true`);
step('paired', await until(() => ph('a', 'window.__remote.ok'), 8000));
step('one-use code', !(await Remote.refresh()).code);
const devA = (await Remote.refresh()).devices.find((d) => d.name === 'Phone A');
step('device remembered', Boolean(devA?.online), devA);
const raw = await T({ file: true });
step('keys at rest', !raw.includes(code1), raw.includes('"kx"') ? 'encrypted (safeStorage)' : 'plain (no keychain in this test copy)');
step('state on the phone', await until(() => ph('a', 'window.__remote.state.controls.length >= 3'), 8000));
step('react meters only for music sliders', (await ph('a', "document.querySelectorAll('.mt').length")) === 0);

// ---------- a fader: soft takeover, then the Lab slider moves ----------
const key = 'glow'; const lab = () => h.ctl().controls().find((x) => x.key === key).value;
const v0 = lab();
const drag = (win, ys) => ph(win, `(async () => {
  const tr = [...document.querySelectorAll('.fd')].find((f) => f.querySelector('.lb').textContent === 'Glow').querySelector('.tr');
  const r = tr.getBoundingClientRect(); const at = (u) => r.top + (1 - u) * r.height; const x = r.left + r.width / 2;
  const ev = (type, u) => tr.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: at(u), bubbles: true, isPrimary: true }));
  const us = ${JSON.stringify(ys)};
  ev('pointerdown', us[0]); for (const u of us.slice(1)) { await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20))); ev('pointermove', u); }
  await new Promise((r) => setTimeout(r, 120)); const waiting = tr.parentElement.classList.contains('wait'); ev('pointerup', us[us.length - 1]); return waiting;
})()`);
// far from the value (0.5): nothing moves until the finger passes it
const waited = await drag('a', [0.95, 0.9, 0.85]);
await wait(400);
step('soft takeover: far touch waits', waited === true && Math.abs(lab() - v0) < 1e-6, { waited, v0, now: lab() });
await drag('a', [0.9, 0.7, 0.5, 0.35, 0.2]);
step('fader → the Lab slider', await until(() => Math.abs(lab() - 0.2) < 0.03, 3000), { v0, now: lab() });

// two fingers on two faders at once (from their own values up to 0.9)
const val = (k) => { const x = h.ctl().controls().find((y) => y.key === k); return (x.value - x.min) / (x.max - x.min); };
const from = { spin: val('spin'), size: val('size') };
await ph('a', `(async () => {
  const tr = (l) => [...document.querySelectorAll('.fd')].find((f) => f.querySelector('.lb').textContent === l).querySelector('.tr');
  const fs = [[tr('Spin'), 11, ${from.spin}], [tr('Size'), 12, ${from.size}]];
  const ev = (t, [el, id], u) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: r.left + r.width / 2, clientY: r.top + (1 - u) * r.height, bubbles: true })); };
  for (const f of fs) ev('pointerdown', f, f[2]);
  for (let i = 1; i <= 6; i += 1) { await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20))); for (const f of fs) ev('pointermove', f, f[2] + (0.9 - f[2]) * i / 6); }
  await new Promise((r) => setTimeout(r, 100)); for (const f of fs) ev('pointerup', f, 0.9); return true;
})()`);
step('multi-touch: two faders at once', await until(() => Math.abs(val('spin') - 0.9) < 0.03 && Math.abs(val('size') - 0.9) < 0.03, 3000), { from, spin: val('spin'), size: val('size') });

// ---------- phone B at once: sees the move ----------
await Remote.pair();
const code2 = (await Remote.refresh()).code.code;
await T({ open: st.url, win: 'b' });
await until(() => ph('b', "!document.getElementById('pair').hidden"), 8000);
await ph('b', `document.getElementById('code').value='${code2}'; document.getElementById('name').value='Phone B'; document.getElementById('pair').requestSubmit(); true`);
step('second phone paired', await until(() => ph('b', 'window.__remote.ok'), 8000));
await until(() => ph('b', 'window.__remote.state.controls.length >= 3'), 6000);
await drag('a', [0.2, 0.4, 0.6, 0.8]);
step('phone B follows phone A', await until(() => ph('b', `Math.abs(window.__remote.controls().find((c) => c.key === '${key}').u - 0.8) < 0.04`), 4000), await ph('b', `window.__remote.controls().find((c) => c.key === '${key}')?.u`));
step('the computer lists both', (await Remote.refresh()).online.length === 2 && document.querySelectorAll('.remote-card .remote-dev.on').length === 2);

out.shots = [await T({ win: 'a', shot: 'faders' })];
// ---------- GO on the set list ----------
S.setlist.clear(); S.setlist.add(ids[0]); S.setlist.add(ids[1]);
store.set('three.stage.mode', 'cut'); store.set('three.stage.quant', 'off');
await wait(400);
step('set list on the phone', await until(() => ph('a', "document.querySelectorAll('#sl li').length === 2"), 4000));
await ph('a', "document.querySelector('[data-tab=set]').click(); document.getElementById('go').click(); true");
step('GO → the next scene', await until(() => ThreeLab.scenes.currentId() === ids[1], 12000), ThreeLab.scenes.currentId());
store.set('three.stage.mode', 'fade'); store.set('three.stage.quant', 'bar');
// a pad: freeze
await ph('a', "document.querySelector('[data-tab=pads]').click(); [...document.querySelectorAll('#btns button')].find((b) => /Freeze/.test(b.textContent)).click(); true");
step('pad: freeze', await until(() => h.frozen, 3000));
out.shots.push(await T({ win: 'a', shot: 'pads' }));
await ph('a', "document.querySelector('[data-tab=set]').click(); true"); await wait(150); out.shots.push(await T({ win: 'a', shot: 'set' }));
await ph('a', "[...document.querySelectorAll('#btns button')].find((b) => /Freeze/.test(b.textContent)).click(); true");
await until(() => !h.frozen, 3000);

// ---------- preview frames ----------
const f0 = await ph('a', 'window.__frames || 0');
step('preview frames arrive', await until(async () => (await ph('a', 'window.__frames || 0')) >= f0 + 3, 12000), { before: f0, after: await ph('a', 'window.__frames || 0'), sent: Remote.stats.frames });

// ---------- kick B, forget A ----------
const pB = Remote.peers.find((p) => p.name === 'Phone B');
await Remote.kick(pB.peer);
step('kick', await until(() => ph('b', "!document.getElementById('gone').hidden && /computer/.test(document.getElementById('goneText').textContent)"), 4000));
await Remote.forget(devA.id);
step('revoke (forget)', await until(() => ph('a', "!document.getElementById('pair').hidden"), 4000) && !(await Remote.refresh()).devices.some((d) => d.id === devA.id));
step('a forgotten phone can\'t come back', await ph('a', "localStorage.getItem('hearth.remote') === null"));

// ---------- /remote ----------
const said = []; const errs = [];
const run = (t) => Commands.exec(t, H.claudeAgent()?.id, { say: (x) => said.push(String(x)), note: (x) => said.push(String(x)), error: (x) => errs.push(x) });
for (const t of ['/remote', '/remote devices', '/remote idle 10', '/phone card']) await run(t);
step('/remote commands', errs.length === 0 && said.length >= 3, { said: said.length, errs });
step('no duplicate commands', !(Commands.duplicates?.() || []).length, Commands.duplicates?.());

// ---------- auto-off ----------
await T({ close: true });
await Remote.off();
await Remote.on({ host: '127.0.0.1', port: 0, idleMs: 1200 });
step('auto-off after inactivity', await until(async () => !(await window.hub.remote.status()).on, 8000) && await until(() => !document.querySelector('.remote-pill'), 2000));
out.stats = Remote.stats;
return JSON.stringify({ ok: !problems.length, problems, ...out }, null, 1);
