// (round 66, bouncelog66) Session log for music, without a sound card or the real plugins:
//   1. the session clock (tools/bouncelog-core.js): time counts in the desk while something happens, a quiet desk stops
//      counting after 3 min, sound from the host counts, a short break continues the session, a long one starts anew,
//      the strip at 10 min, dismissed = never again that session, logged = gone;
//   2. Log it: which active music quests a session fits (park / track / open mic / a music place quest), the proof
//      against Codex's QuestCore.checkProof + submit (no XP), never twice;
//   3. the Sessions store (validate / upsert / cap) and My Paris (logged sessions as "Music session" moments);
//   4. the main side (bouncelogmain.js): sketch paths, the note file, "ours" for the Trash;
//   5. the ring itself (creative-vst-sketch.py with a fake engine): 40 s played → exactly the last 30 s saved, 48 kHz,
//      faded ends; silence refused;
//   6. the REAL host (creative-vst-host.py + fake Pedalboard / sounddevice): sketch-status / sketch-save through
//      creative-vstmain's pool, the path made by main in <data>/creative-sketches/<project>/.
//   node dev/bouncelog66-test.js        (5–6 need python3 + numpy; they say "skipped" plainly otherwise)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const K = require('../tools/bouncelog-core.js'), QC = require('../tools/quest-core.js'), Q = require('../tools/quest-paris.js'), PJ = require('../tools/parisjournal-core.js'), P = require('../tools/parkjam-core.js');
const M = require('../bouncelogmain.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(30); } };
const out = { checks: 0, skipped: [] }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };
const MIN = 60000, T0 = Date.parse('2026-10-26T20:00:00Z');

// ---- 1. the clock
let st = K.enter(null, T0).st;
ok(st.inDesk && st.active === 0 && !K.shouldOffer(st), 'entering the desk starts a session at 0 min');
for (let m = 1; m <= 9; m++) K.activity(st, T0 + m * MIN);
ok(K.minutes(st) === 9 && !K.shouldOffer(st), '9 minutes of playing: no strip yet');
K.activity(st, T0 + 10 * MIN); ok(K.minutes(st) === 10 && K.shouldOffer(st), '10 minutes: the strip shows');
ok(K.stripText(K.minutes(st)) === 'Nice session — 10 min.', 'the strip text: ' + K.stripText(10));
K.tick(st, T0 + 30 * MIN); ok(K.minutes(st) === 13, 'a quiet desk (no click, key or sound for 20 min) counts only 3 more minutes: ' + K.minutes(st));
K.activity(st, T0 + 31 * MIN); K.tick(st, T0 + 32 * MIN); ok(K.minutes(st) === 14, 'playing again counts from that moment on (not the quiet stretch): ' + K.minutes(st));
// sound the host heard (a controller jam makes no clicks): reported with its own time, seen 30 s later
K.tick(st, T0 + 40 * MIN); const before = st.active;
K.activity(st, T0 + 40 * MIN + 20000, T0 + 40 * MIN + 30000); ok(st.active - before === 10000, 'sound from the host counts as activity from when it was heard (10 s here)');
// leave and come back within 20 min: the same session; the time away doesn't count
K.leave(st, T0 + 41 * MIN); const at41 = st.active; K.tick(st, T0 + 50 * MIN);
ok(st.active === at41 && !K.shouldOffer(st), 'away from the desk: the clock stops and the strip hides');
let r = K.enter(st, T0 + 55 * MIN); ok(r.st === st && !r.ended && st.inDesk, 'back within 20 minutes: the same session continues');
K.activity(st, T0 + 56 * MIN); ok(st.active === at41 + MIN, 'only the minute back in the desk is added');
K.dismiss(st); K.activity(st, T0 + 57 * MIN); ok(!K.shouldOffer(st), 'dismissed: the strip never shows again for this session');
K.leave(st, T0 + 58 * MIN); r = K.enter(st, T0 + 90 * MIN);
ok(r.ended === st && r.st !== st && r.st.active === 0 && !r.st.dismissed, 'back after a long break: a new session (the old one handed over to be saved)');
const st2 = r.st; for (let m = 1; m <= 11; m++) K.activity(st2, T0 + 90 * MIN + m * MIN);
ok(K.shouldOffer(st2), 'the new session gets its own strip at 10 min'); st2.logged = true; ok(!K.shouldOffer(st2), 'logged: the strip goes away');
K.use(st2, { instrument: 'Vital', park: true, place: 'Belleville' }); K.use(st2, { instrument: 'Vital', liveset: true }); K.use(st2, { instrument: 'Serum 2', arrange: true });
ok(st2.instruments.join('|') === 'Vital|Serum 2' && st2.used.park && st2.used.liveset && st2.used.arrange && st2.place === 'Belleville', 'what was used: ' + K.what(st2));

// ---- 2. Log it: the music quests a session fits
let s = QC.upgrade(QC.initial());
Q.startPersonal(s, 'park'); Q.startPersonal(s, 'openmic'); Q.startPersonal(s, 'track'); Q.startPersonal(s, 'airpods');
const camp = id => s.campaigns.find(c => c.id === id), finish = (id, n) => { for (const q of camp(id).quests.slice(0, n)) s.records[q.id] = { completedAt: new Date(T0).toISOString() }; };
const sess = (used = {}, sketches = []) => ({ ...K.start(T0, 'ses-test'), active: 23 * MIN, used: { desk: true, park: false, liveset: false, arrange: false, ...used }, instruments: ['Vital'], sketches });
ok(K.credits(QC, s, sess()).length === 0, 'a plain session fits no step: park (pack light), open mic (find one), track (needs Arrange) — nothing offered');
let c = K.credits(QC, s, sess({ arrange: true })); ok(c.length === 1 && c[0].campaign === 'c-pq-track' && c[0].index === 0, 'Arrange used → "Finish a track": ' + c.map(x => x.step).join(', '));
finish('c-pq-park', 1); c = K.credits(QC, s, sess({ park: true })); ok(c.length === 1 && c[0].step === 'Make a two-minute sketch outdoors', 'Park mode → "Make a two-minute sketch outdoors" (park step 2)');
c = K.credits(QC, s, sess({ liveset: true })); ok(!c.some(x => x.campaign === 'c-pq-openmic'), 'the Live set doesn\'t prove "Find one this week"');
finish('c-pq-openmic', 2); c = K.credits(QC, s, sess({ liveset: true })); ok(c.length === 1 && c[0].step === 'Decide your own next step', 'the Live set → open mic "Decide your own next step"');
camp('c-pq-openmic').paused = true; ok(!K.credits(QC, s, sess({ liveset: true })).length, 'a paused quest is left alone');
camp('c-pq-openmic').paused = false;
// a music place quest: only its at-home proof step, and only with a sketch
const pid = Q.guide.find(p => p.id === 'pp-trabendo').id; Q.startPlace(s, pid); const pc = s.campaigns.find(x => x.parisPlace === pid);
ok(pc.path === 'music' && !K.credits(QC, s, sess({}, [{ path: '/x/a.wav', at: new Date(T0).toISOString(), seconds: 30 }])).some(x => x.campaign === pc.id), 'a place quest\'s "Get to Le Trabendo" step is never proven by a desk session');
for (const q of pc.quests.slice(0, 2)) s.records[q.id] = { completedAt: new Date(T0).toISOString() };
ok(!K.credits(QC, s, sess()).some(x => x.campaign === pc.id), 'its at-home step without a sketch: not offered');
const withSketch = sess({}, [{ path: '/x/a.wav', at: new Date(T0).toISOString(), seconds: 30 }]);
ok(!K.credits(QC, s, withSketch).some(x => x.campaign === 'c-studio-loop'), 'Codex\'s untouched starter "A loop with somewhere to go" is a template, not an active quest: not offered');
s.records[camp('c-studio-loop').quests[0].id] = { startedAt: new Date(T0).toISOString() };
ok(K.credits(QC, s, withSketch).some(x => x.campaign === 'c-studio-loop' && x.step === 'Make eight bars move'), 'once started, its "Make eight bars move" (export an eight-bar loop) takes a sketch');
ok(!K.credits(QC, s, withSketch).some(x => x.campaign === 'c-samples'), '"Name the world it comes from" (words, not sound) is never offered a sketch');
delete s.records[camp('c-studio-loop').quests[0].id];
c = K.credits(QC, s, withSketch); ok(c.some(x => x.campaign === pc.id && x.index === 2), 'with a saved sketch: "Bring it home" (show a Vital / Serum 2 bass demo) fits');
// the proof against Codex's contract, submitted (no XP), never twice
const sk = { path: '/tmp/Sketch.wav', at: new Date(T0).toISOString(), seconds: 30 }, se = sess({ liveset: true }, [sk]), credit = K.credits(QC, s, se).find(x => x.campaign === 'c-pq-openmic');
const proof = { type: 'file', title: 'Sketch.wav', path: '/tmp/Sketch.wav', kind: 'audio/wav', bytes: 2880044, fingerprint: 'a'.repeat(64), images: [], ...K.proofText(se, sk) };
ok(QC.checkProof(proof) === proof && /Session ses-test/.test(proof.excerpt) && /cannot hear/.test(proof.coverage), 'the proof passes QuestCore.checkProof (session id, minutes, what was played, honest coverage)');
const xp0 = QC.xp(s); const item = QC.submit(s, credit.quest, proof, K.intentOf(se, credit)); QC.validate(s);
ok(item.review === null && QC.xp(s) === xp0, 'submitted as proof: no review and no XP by itself; the journal still validates');
ok(!K.credits(QC, s, se).some(x => x.campaign === 'c-pq-openmic'), 'the same session is never offered twice to a step');
ok(QC.checkProof({ ...proof, kind: 'text/plain', ...K.proofText(sess(), null) }) && /note is the proof/.test(K.proofText(sess(), null).excerpt), 'without a sketch the session note is the proof');

// ---- 3. the Sessions store and My Paris
const rowA = K.entry({ ...st2, sketches: [sk] }, T0 + 102 * MIN);
ok(rowA.minutes === 11 && rowA.used.park && rowA.place === 'Belleville' && rowA.logged && rowA.sketches.length === 1, 'a session row: minutes, what was used, the park, its sketch, logged');
let list = K.upsert(null, rowA); ok(list.v === 1 && list.sessions.length === 1, 'upsert into a missing list');
list = K.upsert(list, { ...rowA, minutes: 12 }); ok(list.sessions.length === 1 && list.sessions[0].minutes === 12, 'upsert replaces the same session');
const bad = { v: 1, sessions: [rowA, { id: 'x' }, null, { ...rowA, id: 'y', start: 'nope' }] }; ok(K.validate(bad).sessions.length === 1, 'damaged rows are dropped, never the whole list');
for (let i = 0; i < 210; i++) list = K.upsert(list, { ...rowA, id: 'r' + i, start: new Date(T0 - i * MIN).toISOString(), logged: null });
ok(list.sessions.length === K.KEEP && list.sessions[0].start >= list.sessions[1].start, `kept to ${K.KEEP}, newest first`);
const plain = { ...K.entry({ ...sess(), id: 'ses-home' }, T0 + 30 * MIN), logged: { at: new Date(T0).toISOString(), quests: [] } }, unlogged = { ...plain, id: 'ses-no', logged: null };
s.atlas ||= { places: [] };
const moments = PJ.collect({ C: QC, s, P: Q, takes: [], sessions: [rowA, plain, unlogged] }), music = moments.filter(m => m.kind === 'music');
ok(music.length === 2 && !music.some(m => m.id.includes('ses-no')), 'My Paris: logged sessions become "Music session" moments (not the unlogged one)');
const atPark = music.find(m => m.place?.name !== 'Sound desk'), home = music.find(m => m.place?.name === 'Sound desk');
ok(atPark && !atPark.pinless && atPark.loop === sk.path, 'a Park mode session is pinned at the park, with its sketch to play');
ok(home.pinless && home.month === '2026-10', 'a home session is a timeline dot (no pin)');
const rec = PJ.recap(moments, '2026-10', { guide: Q.guide }); ok(rec.counts.music === 2 && !rec.newSpots.includes('Sound desk') && /2 music sessions/.test(PJ.recapText(rec)), 'the month recap counts music sessions; "Sound desk" is not a new place');

// ---- 4. the main side
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-bouncelog-'));
const now = new Date(2026, 9, 26, 14, 5, 33), p1 = M.sketchPath(dir, 'Park sketch · Belleville / 18 Oct', now);
ok(path.dirname(p1) === path.join(dir, 'creative-sketches', 'Park sketch · Belleville 18 Oct') && path.basename(p1) === 'Sketch 2026-10-26 14.05.33.wav', 'a sketch goes in <data>/creative-sketches/<project>/ with a dated name: ' + path.basename(p1));
fs.writeFileSync(p1, 'x'); ok(path.basename(M.sketchPath(dir, 'Park sketch · Belleville / 18 Oct', now)) === 'Sketch 2026-10-26 14.05.33 2.wav', 'a second save in the same second never overwrites');
ok(path.dirname(M.sketchPath(dir, '', now)).endsWith('Sound desk'), 'no project name: the "Sound desk" folder');
const note = M.writeNote(dir, 'Sound desk', K.noteText(sess()), now); ok(fs.readFileSync(note, 'utf8').startsWith('Hearth · Sound desk session') && !fs.existsSync(note + '.part'), 'the session note is written whole');
assert.throws(() => M.writeNote(dir, 'x', ''), /Invalid/); out.checks++;
ok(M.isOurs(dir, p1) && !M.isOurs(dir, path.join(dir, 'creative-park', 'a.wav')) && !M.isOurs(dir, path.join(dir, 'creative-sketches', '..', 'x.wav')) && !M.isOurs(dir, 'relative.wav'), 'only files in the sketches folder can be sent to the Trash');
out.core = 'clock / strip / credits / proof / store / My Paris / main paths passed';

// ---- 5–6. the ring and the real host
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
const wavOf = file => { const b = fs.readFileSync(file); return P.decodeWav(new Uint8Array(b.buffer, b.byteOffset, b.length)); };
if (py.status !== 0) { out.skipped.push('ring + host: python3 with numpy not found here'); fs.rmSync(dir, { recursive: true, force: true }); console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const ring = path.join(dir, 'ring.wav'), script = `
import importlib.util, json, threading, numpy as np
s = importlib.util.spec_from_file_location('sk', ${JSON.stringify(path.join(__dirname, '..', 'creative-vst-sketch.py'))}); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
class E:
    np = np; rate = 48000; peak = 0.0; running = threading.Event()
    def to_target(self, a, r, f): return a, False
e = E(); k = m.Sketch(e); res = {}
try: k.save({'output': ${JSON.stringify(ring)}})
except ValueError as x: res['empty'] = str(x)
for i in range(int(40 * 48000 / 512)):  # 40 s of a ramp: sample value = its own time in seconds / 100
    t = (np.arange(512) + i * 512) / 48000.0; b = np.stack([t / 100, -t / 100]).astype(np.float32); e.peak = float(np.max(np.abs(b))); k.keep(b)
res['status'] = k.status(); res['saved'] = k.save({'output': ${JSON.stringify(ring)}})
k2 = m.Sketch(e)
for i in range(200): e.peak = 0.0; k2.keep(np.zeros((2, 512), np.float32))
try: k2.save({'output': ${JSON.stringify(ring + '2')}})
except ValueError as x: res['silent'] = str(x)
print(json.dumps(res))`;
const rr = spawnSync(PY, ['-B', '-c', script], { encoding: 'utf8' }); assert.equal(rr.status, 0, rr.stderr);
const res = JSON.parse(rr.stdout.trim().split('\n').pop()), w = wavOf(ring), L = w.channels[0];
ok(/play something first/.test(res.empty) && /silent/.test(res.silent) && !fs.existsSync(ring + '2'), 'nothing played / only silence: refused with a plain reason, no file');
ok(res.status.kept === 30 && res.saved.seconds === 30 && w.rate === 48000 && L.length === 30 * 48000, `40 s played → exactly 30 s saved at 48 kHz (${L.length} samples)`);
const mid = L[15 * 48000], expect = (40 - 15) / 100; ok(Math.abs(mid - expect) < 2e-3, `it is the LAST 30 s: the sample at 15 s holds t=${(mid * 100).toFixed(2)} s (expected ${expect * 100})`);
ok(Math.abs(L[0]) < 1e-4 && Math.abs(L.at(-1)) < 1e-4 && Math.abs(L[480]) > .09, 'both ends fade over 5 ms (no click)');
ok(!fs.existsSync(ring + '.part'), 'written whole (.part then renamed)');

const { pool } = require('../creative-vstmain');
(async () => {
  const root = path.join(dir, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3'), { recursive: true });
  Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), PYTHONDONTWRITEBYTECODE: '1', FAKE_MIDI_NOTE: '0' });
  delete process.env.HEARTH_VST_ASIO;
  let host;
  try {
    host = pool({ dataDir: dir, python: PY, roots: [root] }); assert.ok((await host.status()).ok);
    const vital = host.scan().plugins.find(p => p.name === 'Vital');
    const V = async (action, extra = {}) => { const x = await host.request({ action, plugin: vital.path, name: 'Vital', ...extra }); if (!x.ok) throw Error(action + ': ' + x.error); return x; };
    await V('open', { live: true, device: 4, buffer: 512, gain: .2 });
    await sleep(500); let x = await V('sketch-status'); ok(x.running && x.kept > 0 && x.soundAgo === null, `the host keeps the desk's output from the first block (${x.kept} s kept, nothing heard yet)`);
    const silent = await host.request({ action: 'sketch-save', plugin: vital.path, name: 'Vital', project: 'Sunday' }); ok(!silent.ok && /silent/.test(silent.error), 'saving silence: refused ("' + silent.error + '")');
    await V('midi', { note: 69, on: true, velocity: 100 }); await sleep(1200); await V('midi', { note: 69, on: false }); await sleep(200);
    x = await V('sketch-status'); ok(x.soundAgo !== null && x.soundAgo < 1, `the note was heard ${x.soundAgo} s ago (the session clock counts a controller jam this way)`);
    const sv = await V('sketch-save', { project: 'Sunday', output: '/etc/evil.wav' });
    ok(path.dirname(sv.path) === path.join(dir, 'creative-sketches', 'Sunday') && /^Sketch \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d\.wav$/.test(path.basename(sv.path)), 'sketch-save writes where main decides (a path from the window is ignored): ' + path.basename(sv.path));
    const sw = wavOf(sv.path); ok(sw.rate === 48000 && Math.abs(sw.channels[0].length / 48000 - sv.seconds) < 1e-3 && sv.seconds > 1.5 && sv.seconds <= 30, `a ${sv.seconds.toFixed(2)} s 48 kHz WAV (everything since live audio started, up to 30 s)`);
    let peak = 0; for (const v of sw.channels[0]) peak = Math.max(peak, Math.abs(v)); ok(peak > .05, 'the note is in the sketch (peak ' + peak.toFixed(3) + ')');
    out.host = 'ring 30 s / silence refused / real host status + save in the main-made path passed';
  } catch (err) { console.error(err); process.exitCode = 1; out.error = err.message; }
  finally { try { host?.stop(); } catch { /* gone */ } await sleep(100); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(JSON.stringify(out, null, 1));
})();
