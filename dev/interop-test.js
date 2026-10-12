// Interop, main side (round 25): the OSC codec (types, bundles, broken packets), OSC in over UDP (scope, batching,
// the rate cap) and out (only to this computer / private addresses), the Ableton Link discovery parser and the
// follower, the OBS Browser Source server (Host / Origin checks), and the obs-websocket client against dev/fake-obs.js
// (v5 handshake with auth, a wrong password, requests, events, a password never written in the clear).
//   node dev/interop-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const I = require('../interopmain.js');
const FakeObs = require('./fake-obs.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await wait(20); } return null; };

(async () => {
  // ---------- codec ----------
  const pk = I.encodeMessage('/hearth/slider/glow', [0.25, { i: 7 }, 'hi', true, false, null, Buffer.from([1, 2, 3]), { d: 1.5 }, { h: 2 ** 40 }]);
  const [m] = I.decode(pk);
  ok('message round trip', m.addr === '/hearth/slider/glow' && m.args[0] === 0.25 && m.args[1] === 7 && m.args[2] === 'hi' && m.args[3] === true && m.args[4] === false && m.args[5] === null && Buffer.isBuffer(m.args[6]) && m.args[6].length === 3 && m.args[7] === 1.5 && m.args[8] === 2 ** 40, m);
  ok('4-byte aligned', pk.length % 4 === 0);
  const b = I.decode(I.encodeBundle([['/a', [1]], ['/b', ['x']]]));
  ok('bundle flattened', b.length === 2 && b[0].addr === '/a' && b[1].args[0] === 'x', b);
  const nested = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), (() => { const inner = I.encodeBundle([['/deep', [{ i: 1 }]]]); const s = Buffer.alloc(4); s.writeInt32BE(inner.length); return Buffer.concat([s, inner]); })()]);
  ok('nested bundle', I.decode(nested)[0]?.addr === '/deep');
  ok('no type tags (old senders)', I.decode(Buffer.from('/go\0'))[0]?.addr === '/go');
  let threw = 0; for (const bad of [Buffer.from('nope'), Buffer.from('/x\0\0,ii\0\0\0'), Buffer.from('/x\0\0,b\0\0\0\0\0\x10')]) { try { I.decode(bad); } catch { threw += 1; } }
  ok('broken packets throw', threw === 3, threw);
  ok('private / public hosts', I.okHost('127.0.0.1') && I.okHost('192.168.1.40') && I.okHost('localhost') && !I.okHost('8.8.8.8') && !I.okHost('example.com'));

  // ---------- Link ----------
  const lp = I.parseLink(I.linkPacket({ bpm: 128, playing: true }));
  ok('Link alive parsed', lp && lp.type === 1 && Math.abs(lp.bpm - 128) < 0.01 && lp.playing === true, lp);
  ok('not Link → null', I.parseLink(Buffer.from('hello world, not link')) === null);

  // ---------- the module, with a fake window ----------
  const handlers = new Map(); const listeners = new Map(); const sent = [];
  const ipc = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interop-test-'));
  I.register(ipc, () => ({ isDestroyed: () => false, webContents: { send: (ch, d) => sent.push([ch, d]) } }), { dataDir });
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  const src = fs.readFileSync(path.join(__dirname, '..', 'interopmain.js'), 'utf8');
  const chans = [...src.matchAll(/ipcMain\.(handle|on)\(\s*'([^']+)'/g)].map((x) => x[2]);
  ok('every channel registered (lazyIpc reads them from the source)', chans.every((c) => handlers.has(c) || listeners.has(c)), chans.filter((c) => !handlers.has(c) && !listeners.has(c)));

  // OSC in
  const st = await call('interop:osc-start', { port: 0 + 39000 + Math.floor(Math.random() * 1000), scope: 'local' });
  ok('OSC on, local', st.on && st.scope === 'local' && st.port > 0, st);
  const s = dgram.createSocket('udp4');
  const tx = (buf) => new Promise((r) => s.send(buf, st.port, '127.0.0.1', r));
  await tx(I.encodeMessage('/hearth/slider/glow', [0.5])); await tx(I.encodeBundle([['/hearth/go', []], ['/hearth/bpm', [128]]]));
  const got = await until(() => sent.filter(([ch]) => ch === 'interop:osc').flatMap(([, d]) => d).length >= 3 && sent.filter(([ch]) => ch === 'interop:osc'));
  const flat = (got || []).flatMap(([, d]) => d);
  ok('OSC in → the window, batched', flat.length === 3 && flat[0].a === '/hearth/slider/glow' && Math.abs(flat[0].v[0] - 0.5) < 1e-6 && flat[2].v[0] === 128 && (got || []).length <= 2, { batches: (got || []).length, flat });
  sent.length = 0;
  for (let i = 0; i < 300; i += 1) { s.send(I.encodeMessage('/hearth/slider/glow', [i / 300]), st.port, '127.0.0.1'); if (i % 100 === 99) await wait(5); }
  await wait(300);
  const batches = sent.filter(([ch]) => ch === 'interop:osc');
  ok('a burst arrives in a few batches', batches.flatMap(([, d]) => d).length === 300 && batches.length < 60, { msgs: batches.flatMap(([, d]) => d).length, batches: batches.length });
  await tx(Buffer.from('garbage!'));
  await wait(50);
  ok('a bad packet is counted, not passed on', (await call('interop:osc-status')).bad === 1);

  // OSC out: to this computer yes, to the internet no
  const r = dgram.createSocket('udp4'); const rx = [];
  r.on('message', (buf) => rx.push(...I.decode(buf)));
  await new Promise((res) => r.bind(0, '127.0.0.1', res));
  listeners.get('interop:osc-send')({}, { to: [{ host: '127.0.0.1', port: r.address().port }, { host: '8.8.8.8', port: 9 }], msgs: [['/hearth/beat', [{ i: 1 }]], ['/hearth/bpm', [{ f: 120 }]]] });
  await until(() => rx.length >= 2, 1500);
  ok('OSC out to this computer', rx.length === 2 && rx[0].addr === '/hearth/beat' && rx[0].args[0] === 1, rx);
  ok('never to a public address', (await call('interop:osc-status')).tx === 2);
  await call('interop:osc-stop');

  // Link follower (unicast on a test port: multicast isn't reliable in a container)
  const lport = 41000 + Math.floor(Math.random() * 1000);
  await call('interop:link-start', { port: lport });
  await new Promise((res) => s.send(I.linkPacket({ bpm: 124.5, playing: true }), lport, '127.0.0.1', res));
  const ls = await until(() => sent.find(([ch, d]) => ch === 'interop:link' && d.bpm));
  ok('Link tempo followed', ls && Math.abs(ls[1].bpm - 124.5) < 0.01 && ls[1].peers === 1 && ls[1].playing === true, ls?.[1]);
  await call('interop:link-stop');

  // ---------- the Browser Source page server ----------
  const ps = await call('interop:page-start', { port: 0 });
  ok('page on 127.0.0.1', ps.on && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(ps.url), ps);
  const get = (p, host) => new Promise((res) => http.get({ host: '127.0.0.1', port: ps.port, path: p, headers: { Host: host || `127.0.0.1:${ps.port}` } }, (rs) => { rs.resume(); res(rs.statusCode); }).on('error', () => res(0)));
  ok('page served, nothing else, no rebinding', (await get('/')) === 200 && (await get('/obs-page.js')) === 200 && (await get('/../main.js')) === 404 && (await get('/', 'evil.example')) === 403);
  const up = (origin, host) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: ps.port, path: '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), Host: host || `127.0.0.1:${ps.port}`, ...(origin ? { Origin: origin } : {}) } }); q.on('upgrade', (rs, so) => { res([rs.statusCode, so]); }); q.on('response', (rs) => res([rs.statusCode])); q.on('error', () => res([0])); q.end(); });
  const [evil] = await up('http://evil.example'); const [none] = await up(null);
  ok('sockets from websites refused', evil === 403 && none === 403, { evil, none });
  const [good, so] = await up(`http://127.0.0.1:${ps.port}`);
  ok('the page itself connects', good === 101);
  const bin = []; so?.on('data', (d) => bin.push(d));
  await until(() => sent.some(([ch, d]) => ch === 'interop:viewers' && d === 1), 1000);
  listeners.get('interop:page-frame')({}, new Uint8Array([82, 73, 70, 70, 1, 2, 3]));
  await until(() => Buffer.concat(bin).includes(Buffer.from([82, 73, 70, 70, 1, 2, 3])), 1000);
  ok('a frame reaches the viewer (binary)', Buffer.concat(bin).includes(Buffer.from([0x82, 7, 82, 73, 70, 70])));
  so?.destroy(); await call('interop:page-stop');

  // ---------- obs-websocket against the fake OBS ----------
  const fake = await FakeObs.start({ password: 'correct horse' });
  let o = await call('interop:obs-connect', { url: fake.url });
  ok('no password → asks for it', o.state === 'auth' && /password/.test(o.why), o);
  await call('interop:obs-password', 'wrong one');
  o = await call('interop:obs-connect', {});
  await until(async () => (await call('interop:obs-status')).state === 'auth', 2000);
  o = await call('interop:obs-status');
  ok('a wrong password is refused (4009)', o.state === 'auth' && /refused/.test(o.why) && fake.S.authFails === 1, o);
  const pw = await call('interop:obs-password', 'correct horse');
  o = await call('interop:obs-connect', {});
  ok('connected with the right password', o.state === 'on', o);
  await until(async () => (await call('interop:obs-status')).scenes.length === 3);
  o = await call('interop:obs-status');
  ok('scenes, version, record / stream state', o.scenes.join() === 'Intro,Main,Outro' && o.scene === 'Intro' && /OBS 31/.test(o.version) && o.rec?.active === false && o.stream?.active === false, o);
  await call('interop:obs-req', 'SetCurrentProgramScene', { sceneName: 'Main' });
  await until(async () => (await call('interop:obs-status')).scene === 'Main');
  ok('switch scene (event comes back)', fake.S.current === 'Main' && (await call('interop:obs-status')).scene === 'Main');
  await call('interop:obs-req', 'StartRecord');
  await until(async () => (await call('interop:obs-status')).rec?.active);
  ok('start recording', fake.S.record === true && (await call('interop:obs-status')).rec.active === true);
  await call('interop:obs-req', 'StopRecord');
  await until(async () => (await call('interop:obs-status')).rec?.active === false);
  ok('stop recording', fake.S.record === false);
  let refused = ''; try { await call('interop:obs-req', 'CallVendorRequest', {}); } catch (err) { refused = err.message; }
  ok('requests outside the list refused', /doesn't send/.test(refused), refused);
  let unknown = ''; try { await call('interop:obs-req', 'SetCurrentProgramScene', { sceneName: 'Nope' }); } catch (err) { unknown = err.message; }
  ok('OBS errors come back readable', /OBS: No source/.test(unknown), unknown);
  const file = fs.readFileSync(path.join(dataDir, 'interop', 'obs.json'), 'utf8');
  ok('the password is never written in the clear', !file.includes('correct horse') && !file.includes('wrong one') && pw.saved === false && pw.keychain === false, { file, pw });
  ok('status never carries the password', !JSON.stringify(await call('interop:obs-status')).includes('correct horse') && !JSON.stringify(sent).includes('correct horse'));
  fake.close();
  await until(async () => (await call('interop:obs-status')).state === 'off', 3000);
  ok('OBS gone → off, retrying', (await call('interop:obs-status')).state === 'off');
  await call('interop:obs-disconnect');
  s.close(); r.close();
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
