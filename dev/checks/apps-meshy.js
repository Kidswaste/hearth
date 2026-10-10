// Meshy (round 14): the API driven from chat against dev/fake-meshy.js, like the owner would. No key → a clear ask;
// the key pasted once (kept in the main process: never in a page, kv, localStorage or a log); /meshy cost; a text
// model made from the Lab (the cost and the balance shown, asked first, preview → refine with a progress bar, the GLB
// downloaded into data/apps/meshy, the library, a model layer in the Lab); a declined one spends nothing; a board
// picture → image to 3D (sent as a picture, not a path); an agent's meshy_generate (asks the owner too; the model lands
// on the board); a retexture of the last model; a failing task (a red bar, a plain error); Access.ask used when it
// exists; the library picker; after a reload nothing arrives twice.
//   node dev/smoke.js --fake-meshy --check-timeout 400000 --script dev/checks/apps-meshy.js --shot /tmp/apps-meshy.png
const SHOTS = window.APPS_SHOTS || '/tmp/hearth-checks/apps-meshy';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* optional */ } };
const C = H.claudeAgent();
const say = async (line, agentId = C.id) => { let text = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
// the cost question: read it, then answer it like the owner
const answer = async (yes) => {
  const d = await until(() => [...document.querySelectorAll('dialog.ui-modal[open]')].find((x) => /Spend Meshy credits/.test(x.textContent)), 10000);
  if (!d) return null;
  const text = d.textContent;
  [...d.querySelectorAll('button')].find((b) => (yes ? /Make it/.test(b.textContent) : /Cancel/.test(b.textContent)))?.click();
  return text;
};
const lib = async () => hub.kvGet('meshy-library', []);
const log = async (B) => (await hub.apps.fetchJson(`${B}/__log`)).value || [];
const KEY = 'msy_fake_owner_key_42424242';
try {
  const st = await hub.apps.status();
  const B = st.testBase;
  ok(B, 'the fake server is up (--fake-meshy)');
  ok(!st.meshyKey.has, 'no key at first');

  // ---- 0. no key ----
  ok(/Key: none/.test(await say('/meshy status')), '/meshy status says there is no key');
  const nok = await HubBridge.call('meshy_generate', { prompt: 'a cube' });
  ok(!nok.ok && /meshy key/.test(nok.error), `an agent without a key gets a clear answer (${nok.error})`);
  ok(/about \*\*30 credits\*\*/.test(await say('/meshy cost')), '/meshy cost');
  ok(/about \*\*20 credits\*\*/.test(await say('/meshy cost draft')), '/meshy cost draft');

  // ---- 1. the key, once ----
  const bad = await hub.apps.key('meshy', 'set', 'no');
  ok(!bad.ok, 'a non-key is refused');
  const set = await hub.apps.key('meshy', 'set', KEY);
  ok(set.ok, `the key is kept (${set.stored})`);
  const info = await hub.apps.key('meshy', 'has');
  ok(info.has && !JSON.stringify(info).includes(KEY), 'the page learns only that there is a key');
  ok(/1234/.test(await say('/meshy balance')), '/meshy balance');

  // ---- 2. a model from words, made in the Lab ----
  activate('tool:three'); await ThreeLab.cmd();
  const layers0 = ThreeLab.director.layers().layers.length;
  const dir = H.agents().find((a) => a.dock === 'three') || C;
  const p1 = say('/meshy a chrome dragon skull', dir.id);
  const q1 = await answer(true);
  ok(q1 && /30 credits/.test(q1) && /you have 1234/.test(q1) && /chrome dragon skull/.test(q1), `the cost and the balance are shown first (${String(q1).slice(0, 160)})`);
  await shot('ask');
  const said1 = await p1;
  ok(/Meshy started \*\*a chrome dragon skull\*\*/.test(said1) && /the Lab/.test(said1), `the chat says it started (${said1})`);
  const bar = await until(() => Progress.list?.({ all: true })?.find?.((x) => /^meshy:/.test(x.key || '') || /Meshy · a chrome/.test(x.title || '')), 8000);
  ok(bar, 'a progress bar shows');
  const m1 = await until(async () => (await lib()).find((m) => m.name === 'a chrome dragon skull'), 30000);
  ok(m1 && /apps[\\/]meshy[\\/].+\.glb$/.test(m1.glb), `the model is in the library (${m1?.glb})`);
  ok(m1 && (await hub.fs.stat(m1.glb))?.size > 100 && m1.thumb, 'the GLB and its picture are on disk');
  ok(await until(() => ThreeLab.director.layers().layers.length > layers0 && JSON.stringify(ThreeLab.director.layers()).includes('🧊 a chrome dragon skull'), 15000), 'it is a model layer in the Lab');
  ok(m1?.task?.step === 'refine' && m1?.credits === 30, 'textured (preview → refine)');
  const L1 = await log(B);
  ok(L1.some((l) => l.method === 'POST' && l.mode === 'preview') && L1.some((l) => l.method === 'POST' && l.mode === 'refine'), 'preview, then refine');
  ok(L1.every((l) => l.auth), 'every request carried the key');
  await shot('lab');

  // ---- 3. declined: nothing spent ----
  const posts = (await log(B)).filter((l) => l.method === 'POST').length;
  const p2 = say('/meshy draft low-poly fox');
  const q2 = await answer(false);
  ok(q2 && /20 credits/.test(q2) && /shape only/.test(q2), 'a draft costs 20 and says so');
  ok(/Not started/.test(await p2), 'declined: not started');
  ok((await log(B)).filter((l) => l.method === 'POST').length === posts, 'nothing was sent to Meshy');

  // ---- 4. a board picture → image to 3D ----
  const pic = await hub.apps.fetchTo({ url: `${B}/web/files/board-pic.png`, appId: 'test', appName: 'Test' });
  await Board.ready();
  const [it] = await Board.addFiles([pic.path]);
  Board.select?.([it.id]);
  activate(C.id);
  const p3 = say('/meshy image board');
  const q3 = await answer(true);
  ok(q3 && /from a picture/.test(q3), 'image to 3D asks too');
  ok(/Meshy started/.test(await p3), 'image to 3D started');
  const m3 = await until(async () => (await lib()).find((m) => m.op === 'image'), 30000);
  ok(m3, 'the image model is in the library');
  ok((await log(B)).some((l) => l.path === '/openapi/v1/image-to-3d' && l.method === 'POST' && /^data:image\/jpeg/.test(l.image || '')), 'the board picture went as a picture (data URI), not a path');

  // ---- 5. an agent asks (meshy_generate): the owner answers; it lands on the board ----
  const boardN = Board.items().length;
  const t5 = HubBridge.call('meshy_generate', { prompt: 'a brass desk lamp', to: 'board' }, { chatId: null });
  const q5 = await answer(true);
  ok(q5 && /brass desk lamp/.test(q5), 'the agent\'s request asks the owner');
  const r5 = await t5;
  ok(r5.ok && /owner said yes/.test(r5.value), `the tool answers at once (${r5.value || r5.error})`);
  ok(await until(() => Board.items().length > boardN && Board.items().some((x) => x.model && /brass desk lamp/.test(x.title || '')), 30000), 'the model is on the board');
  const st5 = await HubBridge.call('meshy_status', {});
  ok(st5.ok && /#1 a brass desk lamp/.test(st5.value), `meshy_status lists the library (${String(st5.value).slice(0, 120)})`);
  // an agent's request the owner declines
  const t5b = HubBridge.call('meshy_generate', { prompt: 'a second lamp' });
  await answer(false);
  const r5b = await t5b;
  ok(!r5b.ok && /nothing was spent/.test(r5b.error), 'declined: the agent hears it');

  // ---- 6. a new texture for the last model ----
  const p6 = say('/meshy texture last rusted bronze');
  const q6 = await answer(true);
  ok(q6 && /10 credits/.test(q6) && /rusted bronze/.test(q6), 'a retexture costs 10');
  await p6;
  ok(await until(async () => (await lib()).some((m) => m.op === 'retexture'), 30000), 'the retextured model is in the library');
  ok((await log(B)).some((l) => l.path === '/openapi/v1/retexture' && l.input && l.prompt === 'rusted bronze'), 'it reused the task (no upload)');

  // ---- 7. Access.ask when the access stream has it ----
  const asked = [];
  window.Access = { ask: async (o) => { asked.push(o); return false; } };
  const r7 = await say('/meshy draft cube');
  ok(asked.length === 1 && asked[0].action === 'meshy-generate' && asked[0].risk === 'high' && /credits/.test(asked[0].detail), `Access.ask is used (${JSON.stringify(asked[0] || {}).slice(0, 140)})`);
  ok(/Not started/.test(r7), 'Access said no: nothing started');
  delete window.Access;

  // ---- 8. a failing task ----
  const p8 = say('/meshy please fail now');
  await answer(true);
  await p8;
  ok(await until(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /failed: .*on purpose/.test(t.textContent)), 30000), 'a failure says why');
  const jobs = (await hub.apps.meshy('jobs', { resume: false })).value;
  ok(jobs.some((j) => j.status === 'failed'), 'the job is marked failed');

  // ---- 9. the library ----
  await say('/meshy models');
  ok(await until(() => document.querySelectorAll('dialog.apps-grid .apps-card').length >= 4, 5000), 'the library shows the models');
  await shot('library');
  document.querySelector('dialog.apps-grid')?.close();
  ok(/4 models in your library/.test(await say('/meshy status')), '/meshy status counts them');

  // ---- 10. the key stays out of the page ----
  const ls = JSON.stringify({ ...localStorage });
  ok(!ls.includes(KEY), 'not in localStorage');
  ok(!JSON.stringify(await lib()).includes(KEY) && !JSON.stringify(jobs).includes(KEY) && !JSON.stringify(await hub.apps.status()).includes(KEY), 'not in the library, the jobs or the status');
  out.library = (await lib()).length;
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
out.ok = !fail.length;
out.problems = fail;
return JSON.stringify(out, null, 1);
//@@ reload
// after a reload: the finished jobs were acknowledged, nothing arrives twice
const wait2 = (ms) => new Promise((r) => setTimeout(r, ms));
await wait2(3500);
const L = await hub.kvGet('meshy-library', []);
const names = L.map((m) => m.id);
const res = { ok: names.length === 4 && new Set(names).size === names.length, library: names.length, layers: ThreeLab.peek() ? 'loaded' : 'not loaded' };
const jobs2 = (await hub.apps.meshy('jobs', { resume: false })).value;
res.unacked = jobs2.filter((j) => j.status === 'done' && !j.acked).length;
if (res.unacked) res.ok = false;
return JSON.stringify(res);
