// (round 82, bigchat82) part of dev/bigchat82-test.js: sync's giant-chat paths (bigchat-core.js cloudForm,
// localFromCloud, mergeChat) give the SAME bytes and hashes as the whole-file way storework.js used (JSON.parse,
// toCloud / fromCloud, merge3, JSON.stringify): a chat with paths (data folder, home, file: URLs, Windows), "hearth-…"
// strings, accents and escapes; appends on one side / both sides, an old message edited on one side, the same edit on
// both, a conflict, a title changed on both. Then the store thread's ops (syncHash / syncText / syncPull / syncMerge)
// on files.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');

module.exports = async function sync({ ok, chatOf, message, int, rnd, B, ROOT }) {
  const S = require(path.join(ROOT, 'sync-merge.js'));
  const sha = (t) => crypto.createHash('sha1').update(t).digest('hex');
  const home = os.homedir();
  const dataDir = path.join(home, 'Hearth', 'data');
  const ctx = { dataDir, cloudRoot: path.join(home, 'Library', 'Mobile Documents', 'Hearth'), home, win: false };
  const pathy = [path.join(dataDir, 'attachments', 'a.png'), `file://${dataDir}/attachments/b.png`, path.join(home, 'Desktop', 'c.txt'), '/usr/local/bin/x', 'hearth-data:/attachments/z.png', 'hearth-home:/Desktop/y.txt', 'C:\\Users\\other\\x.png'];
  const withPaths = (chat) => { chat.messages.forEach((m, k) => { if (k % 7 === 3) m.attachments = [{ kind: 'image', path: pathy[k % pathy.length], name: 'x' }]; if (k % 11 === 5) m.things = [{ k: 'file', path: pathy[(k + 2) % pathy.length] }]; }); chat.cover = pathy[0]; return chat; };
  const base = withPaths(chatOf(160));
  const localText = (v) => JSON.stringify(v, null, 2);
  const cloudText = (v) => JSON.stringify(S.toCloud(v, ctx));
  // ---------- the cloud form of this computer's file ----------
  {
    const buf = Buffer.from(localText(base));
    const cf = B.cloudForm(buf, ctx, S);
    ok(cf && cf.text.toString('utf8') === cloudText(base) && cf.h === sha(cloudText(base)), 'cloudForm (local) = canon(toCloud(parse(file)))');
    const compactLocal = B.cloudForm(Buffer.from(JSON.stringify(base)), ctx, S);
    ok(compactLocal && compactLocal.h === sha(cloudText(base)), 'cloudForm of a compact file: the same');
    const cloudBuf = Buffer.from(cloudText(base));
    const cc = B.cloudForm(cloudBuf, null, S);
    ok(cc && cc.text.equals(cloudBuf), 'cloudForm (cloud copy): itself');
    const odd = Buffer.from(JSON.stringify(JSON.parse(cloudText(base)), null, 1).replace(/"at": (\d+)/, '"at": $1.0'));
    const co = B.cloudForm(odd, null, S);
    ok(co && co.h === sha(JSON.stringify(JSON.parse(odd.toString()))), 'a copy not as JSON.stringify writes (1.0, spaces): made canonical');
  }
  // ---------- a pull ----------
  {
    const theirs = JSON.parse(cloudText(base)); theirs.messages.push(S.toCloud(message(999), ctx)); theirs.updatedAt = 77;
    const ct = JSON.stringify(theirs);
    const cf = B.cloudForm(Buffer.from(ct), null, S);
    for (const pretty of [true, false]) {
      const r = B.localFromCloud(cf, ctx, S, pretty);
      const local = S.fromCloud(S.toCloud(JSON.parse(ct), ctx), ctx);
      const want = pretty ? JSON.stringify(local, null, 2) : JSON.stringify(local);
      ok(r.out.toString('utf8') === want, `pull (${pretty ? 'pretty' : 'compact'}): this computer's form, byte for byte`);
      ok(r.lh === sha(JSON.stringify(S.toCloud(JSON.parse(want), ctx))), `pull (${pretty ? 'pretty' : 'compact'}): its hash in cloud form`);
    }
  }
  // ---------- merges ----------
  const whole = (b, mine, theirs) => { // storework.js syncMerge, the whole-file way
    const ours = S.toCloud(mine, ctx); const t = S.toCloud(JSON.parse(cloudText(theirs)), ctx);
    const r = S.merge3(JSON.parse(cloudText(b)), ours, t, {});
    const text = JSON.stringify(r.value);
    return { text, hm: sha(text), localOut: JSON.stringify(S.fromCloud(r.value, ctx), null, 2), conflicts: r.conflicts };
  };
  const cases = {
    'one new message each side': (m, t) => { m.messages.push(message(500)); t.messages.push({ ...message(501), at: m.messages.at(-1).at + 5 }); m.updatedAt = 10; t.updatedAt = 11; },
    'only here': (m) => { m.messages.push(message(502)); },
    'an old message edited there, new here': (m, t) => { t.messages[3].text += ' (edited there)'; m.messages.push(message(503)); },
    'the same edit on both': (m, t) => { m.messages[9].reaction = { emoji: '🔥' }; t.messages[9].reaction = { emoji: '🔥' }; },
    'a true conflict': (m, t) => { m.messages[12].text = 'mine'; t.messages[12].text = 'theirs'; },
    'titles on both': (m, t) => { m.title = 'Here'; t.title = 'There'; },
    'deleted there': (m, t) => { t.messages.splice(20, 2); m.messages.push(message(504)); },
    'times out of order': (m, t) => { t.messages.push({ ...message(505), at: 5 }); },
    'a path added there': (m, t) => { t.messages.push({ ...message(506), attachments: [{ path: path.join(dataDir, 'attachments', 'new.png') }] }); },
  };
  for (const [name, fn] of Object.entries(cases)) {
    const mine = JSON.parse(JSON.stringify(base)); const theirs = JSON.parse(JSON.stringify(base));
    fn(mine, theirs);
    const w = whole(base, mine, theirs);
    const lb = Buffer.from(localText(mine)); const cb = Buffer.from(cloudText(theirs)); const bb = Buffer.from(cloudText(base));
    const r = B.mergeChat({ baseBuf: bb, localBuf: lb, cloudBuf: cb, ctx, S, lh: sha(cloudText(mine)), ch: sha(cloudText(theirs)), counters: false, keepAll: false });
    const same = r && !r.stale && r.text.toString('utf8') === w.text && r.hm === w.hm && JSON.stringify(r.conflicts) === JSON.stringify(w.conflicts) && (r.hm === sha(cloudText(mine)) ? r.localOut === null : r.localOut?.toString('utf8') === w.localOut);
    ok(same, `merge, ${name}: the same text, hash, conflicts and file here as the whole-file merge`);
    if (!same && r) console.log('   ', name, r.text?.length, w.text.length, r.hm === w.hm, JSON.stringify(r.conflicts).slice(0, 120), JSON.stringify(w.conflicts).slice(0, 120));
  }
  {
    const mine = JSON.parse(JSON.stringify(base)); mine.messages.push(message(600));
    const r = B.mergeChat({ baseBuf: Buffer.from(cloudText(base)), localBuf: Buffer.from(localText(mine)), cloudBuf: Buffer.from(cloudText(base)), ctx, S, lh: 'not-it', ch: sha(cloudText(base)) });
    ok(r?.stale, 'changed since the pass looked: stale (looked at again next pass)');
    ok(B.mergeChat({ baseBuf: null, localBuf: Buffer.from(localText(mine)), cloudBuf: Buffer.from(cloudText(base)), ctx, S, lh: '', ch: '' }) === null, 'no base: the whole-file merge (two-way)');
  }
  // ---------- the store thread's ops on files (the files thread in the app) ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-sync-'));
  const w = new Worker(path.join(ROOT, 'storework.js'), { env: { ...process.env, HEARTH_SYNCCHAT_MIN: '1000' } });
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  const op = (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
  try {
    const rel = 'chats/claude-giant.json';
    const mine = JSON.parse(JSON.stringify(base)); mine.messages.push(message(700));
    const theirs = JSON.parse(JSON.stringify(base)); theirs.messages.push({ ...message(701), at: mine.messages.at(-1).at + 9 });
    const lf = path.join(dir, 'local.json'); const cf = path.join(dir, 'cloud.json'); const bf = path.join(dir, 'base.json');
    fs.writeFileSync(lf, localText(mine)); fs.writeFileSync(cf, cloudText(theirs)); fs.writeFileSync(bf, cloudText(base));
    const h1 = await op({ op: 'syncHash', file: lf, rel, cloud: false, ctx });
    const h2 = await op({ op: 'syncHash', file: cf, rel, cloud: true, ctx: null });
    ok(h1.h === sha(cloudText(mine)) && h2.h === sha(cloudText(theirs)), 'syncHash: the hashes of the whole-file way');
    const t = await op({ op: 'syncText', file: lf, rel, ctx });
    ok(Buffer.from(t.text).toString('utf8') === cloudText(mine) && t.h === h1.h, 'syncText: the push\'s bytes (kept from the hash)');
    const m = await op({ op: 'syncMerge', rel, localFile: lf, cloudFile: cf, baseFile: bf, ctx, lh: h1.h, ch: h2.h, counters: false, keepAll: false, recovery: path.join(dir, 'recovery.json') });
    const wm = whole(base, mine, theirs);
    ok(m.fast && Buffer.from(m.text).toString('utf8') === wm.text && Buffer.from(m.localOut).toString('utf8') === wm.localOut && fs.readFileSync(path.join(dir, 'recovery.json'), 'utf8') === localText(mine), 'syncMerge (store thread): fast, the whole-file result, this computer\'s copy kept');
    const p = await op({ op: 'syncPull', rel, cloudFile: cf, h: h2.h, ctx, localFile: lf, recovery: null, aside: null });
    const want = JSON.stringify(S.fromCloud(S.toCloud(theirs, ctx), ctx), null, 2);
    ok(Buffer.from(p.out).toString('utf8') === want && Buffer.from(p.cloudText).toString('utf8') === cloudText(theirs) && p.lh === sha(JSON.stringify(S.toCloud(JSON.parse(want), ctx))), 'syncPull (store thread): this computer\'s form, the cloud text and its hash');
    ok((await op({ op: 'syncPull', rel, cloudFile: cf, h: 'old', ctx, localFile: lf })).stale, 'syncPull: a cloud copy that isn\'t the one the pass saw: stale');
    fs.writeFileSync(lf, '{"id": "x", "messages": [');
    let threw = false; try { await op({ op: 'syncPull', rel, cloudFile: cf, h: h2.h, ctx, localFile: lf }); } catch { threw = true; }
    ok(threw, 'syncPull: a file here that can\'t be read stops the replacement');
  } finally { await w.terminate(); fs.rmSync(dir, { recursive: true, force: true }); }
  return null;
};
