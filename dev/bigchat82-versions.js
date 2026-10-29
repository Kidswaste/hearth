// (round 82, bigchat82) part of dev/bigchat82-test.js: Earlier versions of a giant chat listed from digests (made on a
// files thread, never parsed on the main process) give the same list as from the chats themselves: the same versions,
// labels, times and words ("10 messages fewer · 2 messages worded differently", "same as now"), a cloud copy's paths
// made this computer's; a version read for the window comes as bytes in this computer's form.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

module.exports = async function versions({ ok, chatOf, message, ROOT }) {
  process.env.HEARTH_BIGCHAT_MIN = '20000';
  delete require.cache[require.resolve(path.join(ROOT, 'versionsmain.js'))];
  const V = require(path.join(ROOT, 'versionsmain.js'));
  const S = require(path.join(ROOT, 'sync-merge.js'));
  const B = require(path.join(ROOT, 'bigchat-core.js'));
  const VC = require(path.join(ROOT, 'versions-core.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-versions-'));
  const dataDir = path.join(dir, 'data'); const stateDir = path.join(dataDir, 'sync');
  const ctx = { dataDir, cloudRoot: path.join(dir, 'cloud'), home: dir, win: false };
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  const op = (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
  try {
    const now = chatOf(240, { id: 'giant' }); now.id = 'giant';
    now.messages.forEach((m, k) => { if (k % 9 === 2) m.attachments = [{ path: path.join(dataDir, 'attachments', `a${k}.png`) }]; if (k % 13 === 1) m.id = `m${k}`; });
    const w2 = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
    w2(path.join(dataDir, 'chats', 'giant.json'), JSON.stringify(now, null, 2));
    const older = { ...now, messages: now.messages.slice(0, -10) };
    const edited = JSON.parse(JSON.stringify(now)); edited.messages[4].text += ' (worded differently)'; edited.messages[14].text = 'other words'; edited.title = 'Old title';
    w2(path.join(stateDir, 'base', 'chats', 'giant.json'), JSON.stringify(S.toCloud(older, ctx)));
    w2(path.join(stateDir, 'base', 'chats', 'giant.json.prev'), JSON.stringify(S.toCloud(edited, ctx)));
    w2(path.join(dataDir, 'trash', 'giant.json'), JSON.stringify(now, null, 2)); // the same as now
    w2(path.join(dataDir, '.versions', 'chat-giant', '2026-10-01T12-00-00-n0-before.json'), JSON.stringify({ v: 1, kind: 'chat', id: 'giant', at: 1, machine: 'here', thing: { ...now, messages: now.messages.slice(0, 200) } }));
    const base = { dataDir, stateDir, ctx: () => ctx, here: 'this computer', now: () => 1e13 };
    const whole = V.create(base);
    const digest = V.create({ ...base, digest: (a) => op({ op: 'chatDigest', ...a }), chatBytes: (a) => op({ op: 'chatBytes', ...a }) });
    const a = await whole.list({ kind: 'chat', id: 'giant' });
    const b = await digest.list({ kind: 'chat', id: 'giant' });
    const strip = (r) => r.versions.map((x) => [x.src, x.label, x.at, x.summary, x.name, x.also.join('|')].join(' / '));
    ok(a.versions.length >= 3 && JSON.stringify(strip(a)) === JSON.stringify(strip(b)) && a.same === b.same && a.name === b.name, `versions from digests = from the chats (${b.versions.length} versions: ${b.versions.map((x) => x.summary).join('; ')})`);
    if (process.env.BIGCHAT82_DEBUG) console.log(strip(a), strip(b), a.same, b.same);
    ok(b.versions.some((x) => /10 messages fewer/.test(x.summary)) && b.versions.some((x) => /worded differently/.test(x.summary) && /title/.test(x.summary)), 'its words: fewer messages, worded differently, the title');
    const tokA = a.versions.find((x) => x.src === 'base').token; const tokB = b.versions.find((x) => x.src === 'base').token;
    const va = await whole.read(tokA); const vb = await digest.read(tokB);
    ok(vb?.__chatBytes && JSON.stringify(JSON.parse(Buffer.from(vb.__chatBytes).toString('utf8'))) === JSON.stringify(va), 'a version read for the window: bytes, in this computer\'s form (paths back)');
    // a digest from bytes = a digest from the chat itself (any form)
    const plain = JSON.parse(JSON.stringify(now).replace(/hearth-/g, 'hearth_')); // (a chat holding "hearth-…" words itself comes back other from a cloud copy, in both ways)
    const d1 = B.digestBytes(Buffer.from(JSON.stringify(plain, null, 2)), null, S, VC); const d2 = B.digestValue(plain, VC);
    const d3 = B.digestBytes(Buffer.from(JSON.stringify(S.toCloud(plain, ctx))), ctx, S, VC);
    ok(d1.key === d2.key && d1.key === d3.key && JSON.stringify(d1.texts) === JSON.stringify(d2.texts) && JSON.stringify(d1.ids) === JSON.stringify(d3.ids), 'digest: from pretty bytes = from the chat = from its cloud copy');
    const moved = { ...plain, updatedAt: 999, session: { id: 'other' } };
    ok(B.digestValue(moved, VC).key === d2.key, 'digest: times and the engine session left out (as versions-core hashOf)');
  } finally { await w.terminate(); fs.rmSync(dir, { recursive: true, force: true }); delete process.env.HEARTH_BIGCHAT_MIN; }
  return null;
};
