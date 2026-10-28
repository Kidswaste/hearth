#!/usr/bin/env node
// (round 77, synclatency77) Sync's own share of "saved on one computer → there on the other" stays small, and idle stays
// idle. Two parts:
//   engine   (fake clocks, dev/sync-sim.js) engine.knows (the watchers' "is this sync's own write?"), a store arriving in
//            the cloud folder is read after jsonSettleMs (not the 2 s every other file waits), a half-written store is
//            still never read, a picture still waits its 2 s
//   live     (real time: dev/synclatency77.js with a fast cloud provider) the app's sync main side on two computers:
//            a chat / project notes / a picture, idle and while a reply streams on both: the receiver's engine share
//            (delivered → window told) under 2 s, the sender's under 2 s for stores even while a reply streams; sync's own
//            writes wake no pass; a store saved every 2 s makes few passes; once calm no pass runs and none is armed; the cloud folder made by the first pass after
//            sync is turned on is watched at once (--first)
//   node dev/synclatency77-test.js [--only engine,live,first]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const want = (n) => !ONLY || ONLY.includes(n);
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); } };

async function engine() {
  const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
  const w = T.world('lat-engine');
  const pc = T.computer(w, 'PC'); const mac = T.computer(w, 'Mac');
  mac.e = mac.make({ jsonSettleMs: 500 });
  pc.write('chats/c1.json', T.chat('c1', [T.msg('user', 1, 'hello')]));
  pc.write('captures/a.png', Buffer.alloc(3000, 5));
  ok(await T.converge(w, 20) > 0, 'engine: the two computers settle');
  // knows: the version sync has, here and in the cloud
  const st = fs.statSync(pc.p('chats/c1.json'));
  ok(pc.e.knows('local', 'chats/c1.json', st.size, st.mtimeMs), 'engine: knows the local file it synced');
  const cs = fs.statSync(path.join(pc.cloudRoot, 'Hearth', 'files', 'chats', 'c1.json'));
  ok(pc.e.knows('cloud', 'chats/c1.json', cs.size, cs.mtimeMs), 'engine: knows the cloud copy it wrote');
  const ms = fs.statSync(mac.p('chats/c1.json'));
  ok(mac.e.knows('local', 'chats/c1.json', ms.size, ms.mtimeMs), 'engine: knows the file it pulled (its own write)');
  ok(!pc.e.knows('local', 'chats/c1.json', st.size + 1, st.mtimeMs) && !pc.e.knows('local', 'chats/none.json', 1, 1), 'engine: a changed / unknown file is news');
  // a store arriving: read after 500 ms (jsonSettleMs) on the Mac; the PC (default) waits its 2 s
  pc.edit('chats/c1.json', (c) => { c.messages.push(T.msg('assistant', 2, 'hi there')); });
  await T.pass(pc); pc.view.tick(); mac.view.tick(); // up and down at once: the file is brand new in the Mac's cloud folder
  w.clock.advance(600);
  await T.pass(mac);
  ok(T.texts(mac.json('chats/c1.json')).includes('hi there'), 'engine: a store 600 ms old in the cloud folder is read (jsonSettleMs 500)', mac.last?.waiting);
  // the default engine still waits for a store that young
  const pc2 = T.computer(w, 'PC2'); pc2.e = pc2.make();
  await T.converge(w, 20);
  mac.edit('chats/c1.json', (c) => { c.messages.push(T.msg('user', 3, 'from the Mac')); });
  await T.pass(mac); mac.view.tick(); pc2.view.tick();
  w.clock.advance(600);
  await T.pass(pc2);
  ok(!T.texts(pc2.json('chats/c1.json')).includes('from the Mac') && (pc2.last?.waiting || []).some((x) => x.rel === 'chats/c1.json' && x.why === 'arriving'), 'engine: without it a store that young still waits (2 s)', pc2.last?.waiting);
  w.clock.advance(2000); await T.pass(pc2);
  ok(T.texts(pc2.json('chats/c1.json')).includes('from the Mac'), 'engine: … and is read after');
  // a half-written store in the cloud folder (a client writing in place) is never read, however old
  await T.converge(w, 20);
  const cf = path.join(mac.cloudRoot, 'Hearth', 'files', 'chats', 'c2.json');
  fs.mkdirSync(path.dirname(cf), { recursive: true });
  fs.writeFileSync(cf, '{"id":"c2","messages":[{"role":"user","text":"hal');
  const old = new Date(mac.now() - 5000); fs.utimesSync(cf, old, old);
  await T.pass(mac);
  ok(!mac.has('chats/c2.json') && (mac.last?.waiting || []).some((x) => x.rel === 'chats/c2.json'), 'engine: a half-written store is still arriving, never read', mac.last?.waiting);
  fs.rmSync(cf, { force: true });
  // a picture just written in the cloud folder still waits its 2 s on the Mac (only stores read sooner)
  const pf = path.join(mac.cloudRoot, 'Hearth', 'files', 'captures', 'b.png');
  fs.writeFileSync(pf, Buffer.alloc(2000, 9)); const young = new Date(mac.now() - 600); fs.utimesSync(pf, young, young);
  await T.pass(mac);
  ok(!mac.has('captures/b.png'), 'engine: a picture 600 ms old still waits (2 s)');
  w.clock.advance(2000); await T.pass(mac);
  ok(mac.has('captures/b.png'), 'engine: … then comes in');
  fs.rmSync(path.dirname(w.dir), { recursive: true, force: true });
}

function harness(args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'synclatency77.js'), '--json', '--profile', 'fast', ...args], { encoding: 'utf8', timeout: 240000, maxBuffer: 16e6 }));
  } catch (err) { try { return JSON.parse(String(err.stdout || '')); } catch { return { error: String(err.stderr || err.message).slice(0, 800), results: [] }; } }
}

function live() {
  const r = harness(['--mode', 'all', '--dir', 'pc', '--items', 'chat,note,small', '--calm', '2500', '--idlecheck', '4000', '--churn', '16000', '--timeout', '30000']);
  ok(!r.error && r.results.length === 6, 'live: every item measured', r.error || r.results.length);
  for (const x of r.results) {
    const what = `live: ${x.mode} ${x.from}→${x.to} ${x.item}`;
    ok(!x.timedOut, `${what} arrives`, x);
    if (x.timedOut) continue;
    ok(x.engineDown < 2000, `${what}: delivered → window under 2 s`, x);
    // the sender: a store goes up in well under 2 s, even while a reply streams; a picture within its calmer debounce
    ok(x.up < (x.item === 'small' ? 3000 : 2000), `${what}: saved → in the cloud folder`, x);
  }
  ok(r.idle && r.idle.passes === 0, 'live: once calm, no pass runs (the calm check aside)', r.idle);
  // a store saved every 2 s (the usage counts): one quick pass, then the calm debounce (not a pass per save)
  ok(r.churn && r.churn.saves >= 7 && r.churn.passes <= 4, 'live: a store saved every 2 s makes few passes', r.churn);
  ok(r.idle && r.idle.armed.every((a) => a && a.due === null && a.follow === 0), 'live: once calm, no pass is armed (only the calm check)', r.idle);
  ok(r.idle && r.idle.armed.every((a) => a && a.cloudWatched), 'live: the cloud folder is watched', r.idle);
  // sync's own writes wake nothing: a store saved while idle costs one pass on each computer (the copy it makes on
  // either side, its "echo", is no news)
  for (const x of r.results.filter((y) => y.mode === 'idle' && y.item !== 'small' && y.passes)) ok(x.passes.from === 1 && x.passes.to === 1, `live: idle ${x.item}: one pass each side, no echo pass`, x.passes);
}

function first() {
  const r = harness(['--first', '--mode', 'idle', '--dir', 'mac', '--items', 'chat', '--calm', '2500']);
  const x = r.results[0];
  ok(x && !x.timedOut && x.engineDown < 2000, 'first: sync just turned on (no Hearth folder in the drive yet): an arrival is seen at once', x || r.error);
}

(async () => {
  const t0 = Date.now();
  if (want('engine')) await engine().catch((err) => ok(false, 'engine threw', err.stack));
  if (want('live')) live();
  if (want('first')) first();
  console.log(`\nsynclatency77: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
})();
