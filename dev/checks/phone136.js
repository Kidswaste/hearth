// (round 136, phone136) 📱 See it on my phone (docs/upgrades/phone136.md), in one check. A hidden window is the phone
// (on 127.0.0.1: this box has no private LAN to bind to):
//   1. the entry points: the render queue's done note has 📱 Phone; ▣ Present's right-click has 📱 Live on my phone
//      (here, with no local network, it says so instead of binding anywhere else)
//   2. a render served with its token: the page plays it (looping, 540×960 vertical), byte ranges, refused without
//      the token / with a wrong one / naming another host; the card: QR, address, "connected: 1 phone", Stop
//   3. live: the preview arrives as JPEG frames, the phone shows "live from Hearth · W×H"; the old share's link is dead
//   4. Stop ends the server: the phone is told, a new connection is refused
//   5. the idle timeout (1.5 s here, 30 min for the owner)
//   6. bound to one local address only: not 0.0.0.0, not reachable through this box's other (non-LAN) address, a
//      public or any-address host refused
// Only the check's own temp data (smoke.js) and the fixture video /tmp/hearth-test-videos/neon_tunnel_v1.mp4.
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/phone136.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; };
const VIDEO = '/tmp/hearth-test-videos/neon_tunnel_v1.mp4';
const T = window.hub.phone.test;
const ph = (js, win = 'a') => T({ win, eval: js });
const LOOP = { host: '127.0.0.1', port: 0 };
const pathOf = (u) => new URL(u).pathname;

try {
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const CODE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 64, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a, wireframe: true })); scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 900; renderer.render(scene, cam); });`;
  const sk = SC.create({ name: 'Phone check', code: CODE, frame: '9:16', open: true });
  await until(() => SC.currentId() === sk.id, 20000);
  await wait(2500);

  // ---------- 1. the entry points ----------
  await Lazy.load('renders');
  const tr = Renders.track({ kind: 'export', title: 'Phone check render', pk: 'phone136-pk' });
  tr.done(VIDEO);
  const note = await until(() => [...document.querySelectorAll('.toast')].find((t) => /neon_tunnel_v1/.test(t.textContent)), 8000);
  const noteBtns = note ? [...note.querySelectorAll('button')].map((b) => b.textContent) : [];
  step('the render\'s done note: 📱 Phone next to Open / Folder / Copy path', noteBtns.includes('📱 Phone') && ['Open', 'Copy path'].every((b) => noteBtns.includes(b)), noteBtns);
  note?.remove();
  const presentBtn = [...document.querySelectorAll('[data-feature="Present"]')].find((b) => hk.pane.contains(b));
  presentBtn?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 120 }));
  const row = await until(() => [...document.querySelectorAll('.mb-menu.lab-pop .menu-item')].find((b) => /Live on my phone/.test(b.textContent)), 5000);
  const lan = (await T({ addresses: true })).filter((a) => !a.internal);
  const hasLan = lan.some((a) => a.private && !/^169\.254\./.test(a.address));
  row?.click();
  await until(() => window.PhoneView, 10000);
  if (!hasLan) {
    const said = await until(() => [...document.querySelectorAll('.toast')].find((t) => /No local network/.test(t.textContent) && !/unexpected/i.test(t.textContent)), 8000);
    step('▣ Present › 📱 Live on my phone: with no Wi-Fi / Ethernet here, it says so (nothing is opened on another address)', Boolean(row) && Boolean(said) && !(await window.hub.phone.status()).on, { row: Boolean(row), said: said?.textContent?.slice(0, 120), addresses: lan });
    said?.remove();
  } else {
    const st = await until(async () => { const s = await window.hub.phone.status(); return s.on && s; }, 8000);
    const b = await T({ bound: true });
    step('▣ Present › 📱 Live on my phone: on this computer\'s local network address only', Boolean(row) && st && b?.address === st.host && lan.some((a) => a.address === st.host && a.private), { bound: b, lan });
    await PhoneView.stop();
  }

  // ---------- 2. a render, with its token ----------
  const r1 = await PhoneView.render(VIDEO, { title: 'neon_tunnel_v1.mp4', ...LOOP });
  const m = /^http:\/\/127\.0\.0\.1:(\d+)\/v\/([0-9a-f]{32})\/$/.exec(r1?.url || '');
  step('a render shared: the address carries a one-time token (128 bits)', r1?.on && r1.mode === 'render' && Boolean(m), r1?.url);
  const tok = m?.[2] || ''; const port1 = Number(m?.[1] || 0);
  const card = PhoneView.card;
  step('the card: a QR code, the local address, waiting for the phone, ■ Stop', Boolean(card?.querySelector('.remote-qr svg path')) && card.querySelector('.remote-url')?.textContent === `http://127.0.0.1:${port1}` && /waiting/.test(card.querySelector('.pv-conn')?.textContent || '') && [...card.querySelectorAll('button')].some((b) => /Stop/.test(b.textContent)),
    { address: card?.querySelector('.remote-url')?.textContent, conn: card?.querySelector('.pv-conn')?.textContent });
  const pg = await T({ get: `/v/${tok}/` }); const vid = await T({ get: `/v/${tok}/video`, range: 'bytes=0-99' });
  const noTok = await T({ get: '/' }); const noTok2 = await T({ get: '/v/' }); const wrong = await T({ get: `/v/${'0'.repeat(32)}/video` }); const wrongPage = await T({ get: `/v/${'f'.repeat(32)}/` });
  const rebind = await T({ get: `/v/${tok}/video`, host: `attacker.example:${port1}` });
  const notLive = await T({ get: `/v/${tok}/live` });
  step('served with the token (page with a strict CSP, the video in byte ranges), refused without it, with a wrong one, or naming another host',
    pg.status === 200 && /script-src 'self'/.test(pg.csp) && vid.status === 206 && /^bytes 0-99\//.test(vid.range) && /video\/mp4/.test(vid.type) && noTok.status === 403 && noTok2.status === 403 && wrong.status === 403 && wrongPage.status === 403 && rebind.status === 403 && notLive.status === 404,
    { page: pg.status, video: [vid.status, vid.range], none: [noTok.status, noTok2.status], wrong: [wrong.status, wrongPage.status], rebind: rebind.status, live: notLive.status });

  await T({ open: r1.url });
  const played = await until(() => ph('window.__phone?.playing && document.querySelector("video").currentTime > 0.4 && document.querySelector("video")'), 15000)
    && await ph('(() => { const v = document.querySelector("video"); return { w: v.videoWidth, h: v.videoHeight, loop: v.loop, t: v.currentTime, title: document.getElementById("what").textContent }; })()');
  step('the phone plays it: full screen, vertical (540×960), looping', played && played.w === 540 && played.h === 960 && played.loop && /neon_tunnel_v1/.test(played.title), played);
  const conn = await until(() => /connected: 1 phone$/.test(PhoneView.card?.querySelector('.pv-conn')?.textContent || '') && PhoneView.card.querySelector('.pv-conn').textContent, 8000);
  step('the card says "connected: 1 phone"', Boolean(conn), conn || PhoneView.card?.querySelector('.pv-conn')?.textContent);
  await T({ open: `http://127.0.0.1:${port1}/v/${'0'.repeat(32)}/`, win: 'b' });
  const refusedPage = await ph('document.body.innerText', 'b');
  step('a phone without the token gets nothing', /link has ended/i.test(refusedPage || '') && !(await ph('Boolean(document.querySelector("video"))', 'b')), String(refusedPage).slice(0, 80));
  await T({ close: true });

  // ---------- 3. live ----------
  const l1 = await PhoneView.live(LOOP);
  const lm = /^http:\/\/127\.0\.0\.1:(\d+)\/v\/([0-9a-f]{32})\/$/.exec(l1?.url || '');
  const oldDead = await T({ get: `/v/${tok}/video`, port: port1 });
  step('live: a new share with a new token; the render\'s link is dead', l1?.on && l1.mode === 'live' && lm && lm[2] !== tok && (oldDead.err || oldDead.status === 403), { url: l1?.url, old: oldDead });
  const tokL = lm?.[2]; const portL = Number(lm?.[1] || 0);
  await T({ open: l1.url });
  const f0 = PhoneView.stats.frames;
  const got = await until(() => ph('(() => { const i = document.querySelector("img"); return i && i.naturalWidth > 0 && { w: i.naturalWidth, h: i.naturalHeight, what: document.getElementById("what").textContent }; })()'), 15000);
  await wait(2000);
  const sent = PhoneView.stats.frames - f0; const st2 = await window.hub.phone.status();
  const size = hk.size;
  const label = size?.width ? `${size.width}×${size.height}` : PhoneView.sizeLabel();
  step('live: the preview reaches the phone as frames, "live from Hearth · W×H" (the song plays here)', got && got.h > got.w && sent >= 6 && st2.streams === 1 && got.what.includes(`live from Hearth · ${label}`),
    { phone: got, framesSent: sent, perSecond: Math.round((sent / 2) * 10) / 10, streams: st2.streams, label });
  const raw = await T({ get: `/v/${tokL}/live`, bytes: 20000 });
  step('live: the stream is JPEG parts (multipart/x-mixed-replace)', /multipart\/x-mixed-replace/.test(raw.type) && raw.jpeg, { type: raw.type, got: raw.got });
  const conn2 = await until(() => /connected: 1 phone$/.test(PhoneView.card?.querySelector('.pv-conn')?.textContent || ''), 8000);
  step('live: the card shows the size and "connected: 1 phone"', Boolean(conn2) && PhoneView.card.textContent.includes(label), PhoneView.card?.querySelector('.pv-line')?.textContent);

  // ---------- 4. Stop ----------
  [...PhoneView.card.querySelectorAll('button')].find((b) => /Stop/.test(b.textContent)).click();
  const off = await until(async () => !(await window.hub.phone.status()).on && !PhoneView.card, 5000);
  const after = await T({ get: `/v/${tokL}/`, address: '127.0.0.1', port: portL });
  const told = await until(() => ph('window.__phone.stopped && document.getElementById("note").textContent'), 20000);
  await wait(800);
  const pumping = PhoneView.stats.want;
  step('■ Stop: the server ends, the card closes, the phone is told, a new connection is refused, no more frames are taken', Boolean(off) && Boolean(after.err) && Boolean(told) && !pumping, { after, told });
  await T({ close: true });

  // ---------- 5. idle ----------
  const t5 = Date.now();
  await PhoneView.render(VIDEO, { ...LOOP, idleMs: 1500 });
  const idled = await until(async () => !(await window.hub.phone.status()).on, 10000);
  const idleNote = await until(() => [...document.querySelectorAll('.toast')].find((t) => /nobody watched/.test(t.textContent)), 3000);
  step('the idle timeout stops it (1.5 s here, 30 min for the owner) and says so', Boolean(idled) && Boolean(idleNote) && !PhoneView.card, { ms: Date.now() - t5, note: idleNote?.textContent });

  // ---------- 6. local addresses only ----------
  const r6 = await PhoneView.render(VIDEO, LOOP);
  const b6 = await T({ bound: true });
  const others = lan.filter((a) => a.address !== b6?.address);
  const reach = [];
  for (const a of others) reach.push({ address: a.address, private: a.private, r: await T({ get: pathOf(r6.url), address: a.address, port: b6.port }) });
  const refusals = [];
  for (const host of ['0.0.0.0', '192.0.2.2', '8.8.8.8']) { const r = await window.hub.phone.start({ mode: 'render', file: VIDEO, host }); refusals.push({ host, refused: /local network/.test(r?.error || '') }); }
  const stillOne = (await window.hub.phone.status()).url === r6.url;
  step('bound to one address (not 0.0.0.0), not reachable through this box\'s other addresses, a public or any-address host refused',
    b6?.address === '127.0.0.1' && reach.every((x) => x.r.err) && refusals.every((x) => x.refused) && stillOne,
    { bound: b6, reach: reach.map((x) => `${x.address}${x.private ? '' : ' (not LAN)'}: ${x.r.err || x.r.status}`), refusals });
  await PhoneView.stop();
  step('stopped at the end', !(await window.hub.phone.status()).on);
  out.stats = PhoneView.stats;
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
try { await T({ close: true }); await window.PhoneView?.stop(); } catch { /* done */ }
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
