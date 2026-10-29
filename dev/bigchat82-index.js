// (round 82, bigchat82) part of dev/bigchat82-test.js: the indexes built from a long chat a slice at a time give what
// the whole-file builds give. Find in this project (projfind-core.js with env.big: the chat and the Lab's scenes file
// read in slices, every source's words doc by doc), recall (recall-core.js begin / msg / end, storework.js reading in
// slices, one message read back for a quote), and the chats' text search in a giant chat's bytes (storework.js search:
// escapes, quotes, accents, case, K Kelvin / İ, words across a \n) — same hits, counts and snippets.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

module.exports = async function index({ ok, chatOf, message, int, rnd, B, ROOT }) {
  const PF = require(path.join(ROOT, 'projfind-core.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-index-'));
  const chats = path.join(dir, 'chats'); const kv = path.join(dir, 'kv');
  fs.mkdirSync(chats); fs.mkdirSync(kv);
  const giant = chatOf(700, { id: 'giant' }); giant.id = 'giant';
  giant.messages.forEach((m, k) => { if (k % 50 === 7) m.text += ' Kelvin K and İstanbul and "quoted portal" with a\nbreak'; if (k % 33 === 1) m.text = `PORTAL Shader ${m.text}`; });
  fs.writeFileSync(path.join(chats, 'giant.json'), JSON.stringify(giant, null, 2));
  fs.writeFileSync(path.join(chats, 'small.json'), JSON.stringify(chatOf(12, { id: 'small' }), null, 2));
  const scenes = Array.from({ length: 30 }, (_, i) => ({ id: `sk${i}`, name: `Scene ${i}`, layers: [{ id: 'main', name: 'Main', code: Array.from({ length: 2000 }, (_, l) => `const portal${l} = ${l}; // shader ${i}`).join('\n') }] }));
  fs.writeFileSync(path.join(kv, 'three-sketches.json'), JSON.stringify(scenes, null, 2));
  try {
    // ---------- Find in this project ----------
    const spec = { pid: 'p1', chats: ['giant', 'small'], scenes: ['sk3', 'sk17'], boards: [], notes: 'notes about the portal', items: [] };
    const dirs = { chats, kv };
    const env = (big) => ({ stat: (f) => { try { return fs.statSync(f); } catch { return null; } }, join: path.join, now: () => performance.now(), read: (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }, ...(big ? { big: { min: 1000, open: (file, onMessage, o) => B.reader(fs, file, { ...o, onMessage, chunk: 8192 }) } } : {}) });
    const ixA = PF.createIndex(); const ixB = PF.createIndex();
    PF.run(ixA, { spec, dirs, budgetMs: 1e9 }, env(false));
    let calls = 0; let left = 1; while (left && calls < 5000) { left = PF.run(ixB, { spec, dirs, budgetMs: 2 }, env(true)).left; calls += 1; }
    ok(!left && calls > 20, `projfind: built in ${calls} slices`);
    let same = 0; const qs = ['portal', 'portal shader', 'quoted portal', 'kelvin', 'istanbul', 'scene 17', 'shader 3', 'notes', 'xylophone'];
    for (const q of qs) { const a = PF.run(ixA, { spec, dirs, q, budgetMs: 1e9 }, env(false)); const b = PF.run(ixB, { spec, dirs, q, budgetMs: 1e9 }, env(true)); const strip = (r) => JSON.stringify((r.groups || []).map((g) => [g.id, g.total, g.hits.map((h) => [h.ref, h.k, h.layer, h.line, h.snip, h.score])])); if (strip(a) === strip(b)) same += 1; else console.log('   projfind differs', q, strip(a).slice(0, 200), strip(b).slice(0, 200)); }
    ok(same === qs.length, `projfind: the same results as the whole build (${same} / ${qs.length})`);
    // a chat saved while it's being read: read again, the new words found
    const ixC = PF.createIndex();
    PF.run(ixC, { spec, dirs, budgetMs: 0 }, env(true)); PF.run(ixC, { spec, dirs, budgetMs: 0 }, env(true));
    const g2 = JSON.parse(JSON.stringify(giant)); g2.messages.push({ role: 'user', text: 'zebracorn arrives', at: 1 });
    fs.writeFileSync(path.join(chats, 'giant.json'), JSON.stringify(g2, null, 2)); const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(chats, 'giant.json'), t, t);
    left = 1; calls = 0; while (left && calls < 5000) { left = PF.run(ixC, { spec, dirs, budgetMs: 3 }, env(true)).left; calls += 1; }
    const z = PF.run(ixC, { spec, dirs, q: 'zebracorn', budgetMs: 3 }, env(true));
    ok(z.total === 1 && z.groups[0].hits[0].k === g2.messages.length - 1, 'projfind: a chat changed mid-read is read again (its new message found)');
    // ---------- the store thread: recall and the text search, giant vs whole ----------
    const run = async (min) => {
      const w = new Worker(path.join(ROOT, 'storework.js'), { env: { ...process.env, HEARTH_BIGCHAT_MIN: String(min) } });
      let seq = 0; const jobs = new Map();
      w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
      const op = (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
      const out = { search: [], recall: [] };
      await op({ op: 'list', dir: chats });
      let l = 1; let n = 0; while (l && n < 5000) { l = (await op({ op: 'recall', dir: chats, budgetMs: 2 })).left; n += 1; }
      out.recallCalls = n;
      for (const q of ['what did we decide about the portal shader?', 'kelvin istanbul', 'quoted portal break']) out.recall.push(await op({ op: 'recall', dir: chats, q, budgetMs: 1e9 }));
      for (const q of ['portal', 'PORTAL shader', 'quoted portal', '"quoted portal"', 'a\nbreak', 'kelvin k', 'k and', 'istanbul', 'i̇stanbul', 'été', 'n\nbre', 'nbreak', 'zebracorn', 'with a']) out.search.push(await op({ op: 'search', dir: chats, query: q }));
      await w.terminate();
      return out;
    };
    const whole = await run(1e12); const big = await run(1000);
    const rs = (r) => JSON.stringify([r.terms, r.decisions, r.open, r.mentions].map((x) => (Array.isArray(x) ? x.map((h) => (h.chatId ? [h.chatId, h.k, h.kind, h.snippet] : h)) : x)));
    ok(big.recallCalls > 10 && whole.recall.every((r, i) => rs(r) === rs(big.recall[i])), `recall: read in ${big.recallCalls} slices, the same answers (and quotes) as whole`);
    const ss = (r) => JSON.stringify(r);
    let sameS = 0; whole.search.forEach((r, i) => { if (ss(r) === ss(big.search[i])) sameS += 1; else console.log('   search differs', i, ss(r).slice(0, 220), '|', ss(big.search[i]).slice(0, 220)); });
    ok(sameS === whole.search.length, `text search in the bytes: the same hits, counts and snippets (${sameS} / ${whole.search.length})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return null;
};
