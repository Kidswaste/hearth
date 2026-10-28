// 📈 Test play performance (round 76, gpuplay76), by clicks, on this machine's software GPU (SwiftShader):
//   html    the test HTML game (/tmp/hearth-gamemode/html, three.js' default powerPreference 'default') ▶ Played: its
//           WebGL context now asks for the fast card; the page's contexts are noted when made (__hearthGLs)
//   chip    F in the game, the chip's 📈 Test performance clicked → the pill while it measures → after 20 s the card over
//           the game: says SOFTWARE (SwiftShader), fps vs the screen, frame time p50 / p95 / p99, GPU vs processor, the
//           card / ANGLE path, Hearth's side; no D3D11 / Quality buttons on software
//   clean   after the test: the probe is out (not running, no draw call wrapped, no query left), frames keep coming
//   copy    the card's 📋 Copy report for Claude → the clipboard holds the report (main process; nothing sent)
//   fix     a fix from the card (Quality: auto, with Quality: full set) → the hub keeps it, the game gets it, the card says so
//   menu    ▶ Play's right-click lists 📈 Test play performance and 📈 Last performance report; the report opens in
//           Hearth (Copy, Test again, Close)
//   lab     a Lab scene (three layers on one canvas) tested from /game test 4: GPU timed on the merged context
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/gpuplay76.js --shot /tmp/gpuplay76.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(200); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const DIR = '/tmp/hearth-gamemode';
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const playing = async () => (await G().state())?.playing;
const SR = 'document.querySelector("hearth-game-ui").shadowRoot';
const cardNow = () => ev(`(() => { const r = ${SR}; const pf = r.querySelector('.pf'); const pill = r.querySelector('.pfpill'); return JSON.stringify({ shown: !pf.hidden, pill: pill.hidden ? '' : pill.textContent, head: pf.querySelector('.ph') ? pf.querySelector('.ph').textContent : '', lines: [...pf.querySelectorAll('li')].map((l) => l.textContent), tips: [...pf.querySelectorAll('.tip')].map((l) => l.textContent), buttons: [...pf.querySelectorAll('button')].map((b) => b.dataset.k), note: pf.querySelector('.pn') ? pf.querySelector('.pn').textContent : '', bound: pf.dataset.bound }); })()`).then((v) => JSON.parse(v || 'null'));

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
await Lazy.load('gamemode');
const keepQ = store.get('gamemode.quality', 'auto');

await safe('html', async () => {
  await GameMode.play({ kind: 'html', path: `${DIR}/html/index.html` });
  await until(playing, 60000);
  const ok = await until(async () => (await ev('window.__hearthGLs ? window.__hearthGLs().length : 0')) > 0, 60000);
  const attrs = JSON.parse(await ev('JSON.stringify(window.__hearthGLs().map((g) => g.getContextAttributes()))') || '[]');
  step('the page\'s WebGL contexts are noted when made (nothing per frame)', ok, { n: attrs.length });
  step('an HTML build\'s three.js context asks for the fast card (three\'s "default" no longer overrides it)', attrs.length && attrs.every((a) => a.powerPreference === 'high-performance'), attrs.map((a) => a.powerPreference));
});

let first = null;
await safe('chip', async () => {
  await G().key({ key: 'F' });
  const btn = await until(() => ev(`(() => { const b = ${SR}.querySelector('.ap'); return b && !b.closest('[hidden]') ? b.textContent : ''; })()`), 8000);
  step('the F chip shows 📈 Test performance', /Test performance/.test(btn || ''), btn);
  const t0 = Date.now();
  await ev(`${SR}.querySelector('.ap').click()`);
  const pill = await until(async () => { const c = await cardNow(); return c?.pill ? c.pill : null; }, 30000);
  step('while it measures: a small pill over the game, nothing to click', /📈/.test(pill || ''), pill);
  const done = await until(async () => { const c = await cardNow(); return c?.shown ? c : null; }, 150000);
  out.secs = Math.round((Date.now() - t0) / 1000);
  first = GpuPlay.last();
  try { out.shot = (await window.hub.gameTest.shot({ width: 768 }))?.data || null; } catch { out.shot = null; } // (the card over the game, for a look)
  out.card = done; out.report = first?.text;
  step('after the test: the card over the game', done && /play performance/.test(JSON.stringify(done)) || done?.shown, { secs: out.secs, head: done?.head });
  const all = `${done?.head}\n${(done?.lines || []).join('\n')}`;
  step('it says the truth here: software drawing (SwiftShader), no graphics card in use', done?.bound === 'software' && /software drawing/.test(done.head) && /SwiftShader/.test(all), { head: done?.head, card: done?.lines?.[1] });
  step('fps vs the screen, frame time p50 / p95 / p99', /^Frames: \d+ fps \(.+\) · frame time p50 [\d.]+ ms · p95 [\d.]+ ms · p99 [\d.]+ ms/.test(done?.lines?.[0] || ''), done?.lines?.[0]);
  step('GPU work vs the processor\'s frame (timer query where the path has one)', /^GPU work a frame: .+ · processor \(the game's frame\): [\d.]+ ms/.test(done?.lines?.[2] || ''), done?.lines?.[2]);
  step('the canvas, Hearth\'s own work and each process\'s processor use', /Drawing \d+×\d+/.test(all) && /Quality|Hearth's own work/.test(all) && /Processor use \(of one core\)/.test(all), done?.lines);
  step('no D3D11 / Quality / fast-card buttons on software; Copy report for Claude, Test again, Close always', !done?.buttons?.some((k) => ['backend-d3d11', 'quality-auto', 'power-high'].includes(k)) && ['copy', 'again', 'close'].every((k) => done?.buttons?.includes(k)), done?.buttons);
  step('the report for Claude has the numbers (gaps, main thread, GPU, renderer string, switches, display, processes)', /Verdict: software/.test(first?.text || '') && /Frames: [\d.]+ fps vs/.test(first.text) && /Main-thread frame/.test(first.text) && /GPU in use: ANGLE .*SwiftShader/.test(first.text) && /Switches in effect/.test(first.text) && /Processes/.test(first.text), (first?.text || '').slice(0, 1500));
});

await safe('clean', async () => {
  const v = JSON.parse(await ev('JSON.stringify({ t: window.__hearthPerfTest ? { running: window.__hearthPerfTest.running, done: window.__hearthPerfTest.done } : null, wrapped: window.__hearthGLs().some((g) => ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"].some((m) => Object.prototype.hasOwnProperty.call(g, m))) })') || 'null');
  step('after the test the probe is out: not running, no draw call wrapped', v?.t && v.t.running === false && v.t.done === true && v.wrapped === false, v);
  const f0 = await ev('new Promise((r) => { let n = 0; const f = () => { n += 1; if (n < 3) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); setTimeout(() => r(n), 5000); })');
  step('the game keeps drawing', f0 >= 3, f0);
});

await safe('copy', async () => {
  try { await navigator.clipboard.writeText('-'); } catch { /* the main side's check below decides */ }
  await ev(`${SR}.querySelector('.pf button[data-k="copy"]').click()`);
  const note = await until(async () => (await cardNow())?.note, 8000);
  let clip = ''; try { window.focus(); clip = await navigator.clipboard.readText(); } catch (err) { clip = `(unreadable: ${err.message})`; }
  step('📋 Copy report for Claude: the report on the clipboard, the card says it (nothing sent)', /copied/i.test(note || '') && (clip.startsWith('Hearth "📈 Test play performance" report') || /unreadable/.test(clip)), { note, clip: clip.slice(0, 120) });
});

await safe('fix', async () => {
  store.set('gamemode.quality', 'full');
  await window.hub.game.eval('window.__gameQuality ? window.__gameQuality.set("full") : ""');
  await GpuPlay.act('quality-auto', 'game');
  const c = await until(async () => { const x = await cardNow(); return /Quality: auto is on/.test(x?.note || '') ? x : null; }, 8000);
  const line = await ev('window.__gameQuality ? window.__gameQuality.line() : ""');
  step('a fix from the card: Quality: auto kept by the hub, given to the game now, the card says so', c && store.get('gamemode.quality') === 'auto' && /auto/i.test(line || ''), { note: c?.note, line });
  await ev(`${SR}.querySelector('.pf button[data-k="close"]').click()`);
  const gone = await until(async () => (await cardNow())?.shown === false, 6000);
  step('Close hides the card', gone);
});

await safe('menu', async () => {
  const items = await GameMode.menuItems();
  const labels = items.filter((x) => x && x.label).map((x) => x.label);
  step('▶ Play\'s right-click: 📈 Test play performance and 📈 Last performance report', labels.includes('📈 Test play performance') && labels.includes('📈 Last performance report'), labels);
  await GameMode.leave(); await until(async () => !(await playing()), 10000); await wait(600);
  items.find((x) => x.label === '📈 Last performance report').action();
  const d = await until(() => document.querySelector('dialog.gpuplay[open]'), 4000);
  step('the last report in Hearth: headline, lines, Copy report for Claude, Test again, Close', d && /software drawing/.test(d.querySelector('.gp-head')?.textContent || '') && d.querySelectorAll('.gp-lines li').length >= 5 && ['copy', 'again', 'close'].every((k) => d.querySelector(`[data-k="${k}"]`)), { head: d?.querySelector('.gp-head')?.textContent });
  await wait(300);
  d?.querySelector('[data-k="close"]')?.click();
});

await safe('lab', async () => {
  const scene = JSON.parse(await window.hub.fs.read(`${DIR}/lab-scene.json`));
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes, 30000);
  const layers = scene.layers.map((L, i) => ({ id: ['sky', 'world', 'hud'][i], name: L.name, code: L.code }));
  const x = ThreeLab.scenes.create({ name: `${scene.name} perf`, code: layers[0].code, layers, open: true });
  const id = x?.id || ThreeLab.scenes.all().find((s) => s.name === `${scene.name} perf`)?.id;
  ThreeLab.scenes.open(id); await wait(2000);
  const before = GpuPlay.last()?.at || 0;
  const r = await Commands.get('game').run('test 4');
  const L = GpuPlay.last();
  out.lab = L?.text;
  step('/game test 4 plays the Lab scene and measures it (one canvas for three layers)', L && L.at > before && /software drawing/.test(L.sum.headline) && /one canvas/.test(L.text), { said: r, head: L?.sum?.headline });
  const gpuLine = (L?.text || '').split('\n').find((l) => /^GPU \(EXT_disjoint/.test(l)) || '';
  step('the Lab page\'s merged context is found (timed where the path has a GPU timer)', /summed over [1-9]/.test(gpuLine), gpuLine);
  await GameMode.leave(); await until(async () => !(await playing()), 10000);
});
store.set('gamemode.quality', keepQ);
return JSON.stringify(out);
