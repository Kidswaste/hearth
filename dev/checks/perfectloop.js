// ∞ Make it loop (round 31, perfectloop) on a 9:16 scene with no song (its own timeline): the ways in (✦ More › ⇪ Make,
// the labeasy audit, the ◎ mission for the Lab director only, ⌘K, three_do loop); a scene made with the loop helpers
// (loopSin / loopCos / loopWave) loops over 2 s: the timeline loops there, the preview's clock is folded into the loop
// (a layer's frame time), keyframes come back round; the seamless check says "≈ seamless"; the render is a perfect-loop
// MP4 whose first and last frames match (publishkit's loop check on the file, through ffmpeg). Then a drifting scene:
// "a visible jump", the one-click fix blends the last beat into the first (the preview blends its seam, the render
// cross-fades: its first ≈ last again); the director's three_do loop; the mission (local first, then the director only
// with the cost shown); Ready to post's loop fix on a Lab render (the scene rendered again as a perfect loop); Loop off.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/perfectloop.js --shot /tmp/perfectloop.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
const { wait, until } = SQL;

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof PerfectLoop !== 'undefined', 15000);
const dir = H.agents().find((a) => a.dock === 'three');
const d = ThreeLab.director;
const cmd = await ThreeLab.cmd({ show: true });
const P = () => ThreeLab.stageHooks.player;

// ---------- ways in ----------
step('loaded with the Lab: LoopCore, PerfectLoop, /make-loop', typeof LoopCore !== 'undefined' && Boolean(Commands.get('make-loop')));
step('the ◎ mission "Make it loop" is there for the Lab director (only)', Missions.shown(dir.id).some((m) => m.id === 'lab-loop') && !Missions.shown(H.claudeAgent().id).some((m) => m.id === 'lab-loop'));
const mk = LabEasy.previewItem().items().find((x) => /Make/.test(x.label)).items();
const mi = mk.find((x) => /Make it loop/.test(x.label));
step('✦ More › ⇪ Make › ∞ Make it loop (a length submenu), and the Lab audit finds it', mi && mi.items().length >= 4 && LabEasy.placed().has('make-loop'), mk.map((x) => x.label));
step('⌘/Ctrl+K "Lab: Make it loop"', AppUI.actions().some((a) => /Make it loop/.test(a.label)));

// ---------- a scene made to loop (no song: its own timeline), 9:16, a keyframe that ends elsewhere ----------
const PERIODIC = `const P = tweak({ size: [1, 0.5, 2], speed: [1, 0, 2] });
const c = document.createElement('canvas'); c.width = 180; c.height = 320; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d');
function draw(now) {
  window.__lastNow = now;
  g.fillStyle = '#05060a'; g.fillRect(0, 0, 180, 320);
  g.fillStyle = hsl(360 * loopWave(1), 0.8, 0.55);
  g.beginPath(); g.arc(90 + 55 * loopSin(1), 160 + 90 * loopCos(1), 26, 0, 7); g.fill();
  g.fillStyle = '#ffd75e'; g.fillRect(10 + 150 * loopT(), 300, 12, 12);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);`;
await d.newSketch('loop probe', PERIODIC, 3);
cmd.size('9:16');
const probeLayer = () => d.layers().layers[0];
await until(() => (d.sliders(probeLayer().id).sliders || []).some((s) => s.key === 'size'), 12000);
d.setKeyframes(probeLayer().id, 'size', [{ time: 0, value: 1 }, { time: 1.5, value: 1.6 }]);
await wait(800);
const keysOf = () => ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.stageHooks.sketchId()))[0].keys?.['s:size'] || [];

await safe('make it loop', async () => {
  const r = await PerfectLoop.make({ secs: 2, check: false, quiet: true });
  const st = PerfectLoop.state();
  step('Make it loop (2 s): the timeline loops over 0–2 s, the state is the scene\'s', st?.on && Math.abs(st.len - 2) < 1e-3 && P().loop && Math.abs(P().loop.b - 2) < 1e-3, { plan: r.plan, loop: P().loop });
  const k = keysOf();
  step('… the size keyframe comes back round (a key at 2 s with its start value)', k.some((x) => Math.abs(x.t - 2) < 1e-3 && x.v === 1), k);
  await wait(1500);
  const v = await d.evalInSketch('({ on: loop.on, len: loop.len, now: window.__lastNow, t: loopT() })');
  const val = v?.value ?? v;
  step('… the preview\'s clock follows the loop: loop.on, a layer\'s frame time folded into 0–2 s', /on: true|"on":true/.test(JSON.stringify(val)) && /len: 2|"len":2/.test(JSON.stringify(val)) && (() => { const m = JSON.stringify(val).match(/now"?:\s*([\d.]+)/); return m && Number(m[1]) <= 2001; })(), val);
});

await safe('seamless check', async () => {
  const r = await PerfectLoop.check({ quiet: true });
  PerfectLoop.showCard();
  const card = PerfectLoop.card;
  step('the seamless check on a scene made with the loop helpers: ≈ seamless (publishkit\'s loop check, last frame vs first)', r.seamless && r.verdict.text === '≈ seamless', r);
  step('… the card: ≈ seamless, last → first pictures, one click: ⇪ Render the loop', card?.isConnected && /≈ seamless/.test(card.querySelector('.pl-verdict')?.textContent) && card.querySelectorAll('.pl-pics img').length === 2 && card.querySelector('.pl-fix')?.dataset.fix === 'render', card?.textContent.slice(0, 200));
});

const analyze = async (file) => { const r = await window.hub.publish.analyze(file); return r; };
await safe('render the loop', async () => {
  const r = await PerfectLoop.render({ size: { w: 180, h: 320 }, quiet: true });
  const a = await analyze(r.path);
  step('⇪ Render the loop: an MP4 of exactly the loop (60 frames), its first ≈ last frame (publishkit, ffmpeg)', r.frames === 60 && a.ok && a.seam?.seamless && Math.abs((a.info?.duration || 0) - 2) < 0.1, { path: r.path, frames: r.frames, seam: a.seam, duration: a.info?.duration });
});

// ---------- a scene that drifts (it can't come round by itself) ----------
const DRIFT = `const c = document.createElement('canvas'); c.width = 180; c.height = 320; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d');
function draw() { const t = performance.now() / 1000; g.fillStyle = '#05060a'; g.fillRect(0, 0, 180, 320); g.fillStyle = '#ff6040'; g.fillRect(-60 + 140 * t, 60, 90, 200); requestAnimationFrame(draw); }
requestAnimationFrame(draw);`;
await safe('drift', async () => {
  await d.updateLayer(probeLayer().id, { code: DRIFT }, 2);
  await wait(800);
  const r = await PerfectLoop.check({ quiet: true });
  PerfectLoop.showCard();
  const fix = PerfectLoop.card?.querySelector('.pl-fix');
  step('a drifting scene: a visible jump, and the card\'s one click is "Blend the last beat into the first"', !r.seamless && r.verdict.text === 'a visible jump' && fix?.dataset.fix === 'blend', { r, fix: fix?.textContent });
  fix.click();
  await until(() => PerfectLoop.state()?.fade, 5000);
  await wait(300);
  const v = PerfectLoop.card.querySelector('.pl-verdict')?.textContent;
  step('… one click: blended, the card says ≈ seamless (blended) (the end runs into what follows it)', PerfectLoop.state().fade && /seamless \(blended\)/.test(v), v);
  await until(async () => { const e = await d.evalInSketch('loop.seams'); return Number(e?.value ?? e) > 0; }, 6000);
  const e = await d.evalInSketch('[loop.blend, loop.seams]');
  step('… the preview blends its seam (a picture of the last frame fades over the start)', /0\.5/.test(JSON.stringify(e)) && !/\[0\.5, ?0\]/.test(JSON.stringify(e)), e);
  const rr = await PerfectLoop.render({ size: { w: 180, h: 320 }, quiet: true });
  const a = await analyze(rr.path);
  step('… rendered: the last beat cross-fades into the first (frames past the end blended), first ≈ last again', rr.loop?.fade > 0 && a.ok && a.seam?.seamless, { loop: rr.loop, seam: a.seam });
});

// ---------- the director ----------
await safe('director', async () => {
  const r = await HubBridge.call('three_do', { cmd: 'loop', check: true });
  step('three_do loop {check}: the verdict in words for the director', r.ok && /seamless|jump/.test(String(r.value)), r);
  const s = await HubBridge.call('three_do', { cmd: 'loop', status: true });
  step('three_do loop {status}: the loop, its blend and the last check', s.ok && /2 s/.test(JSON.stringify(s.value)), s.value);
});

// ---------- the mission: local first, then the director only with the cost shown ----------
await safe('mission', async () => {
  await PerfectLoop.setFade(false);
  const lastUser = () => (Native.chatOf(dir.id)?.messages || []).filter((m) => m.role === 'user').at(-1) || null;
  const before = lastUser()?.text || '';
  Missions.start(dir.id, 'lab-loop', '2 s keep the red');
  const dlg = await until(() => document.querySelector('dialog.ui-modal[open]'), 90000) && document.querySelector('dialog.ui-modal[open]');
  const txt = dlg?.textContent || '';
  step('mission "Make it loop": the loop and the check ran first (no tokens); it still jumps, so it asks before the director gets anything, cost first', PerfectLoop.state()?.on && /tokens/.test(txt) && (lastUser()?.text || '') === before, txt.slice(0, 200));
  dlg?.querySelector('button.primary')?.click();
  await until(() => /make it loop perfectly/.test(lastUser()?.text || ''), 15000);
  const um = lastUser();
  step('… the director gets a short brief with the loop helpers and your words', um && /loopT\(\)/.test(um.text) && /keep the red/.test(um.text) && um.text.length < 900, um?.text);
  await until(() => !Native.isBusy?.(H.activeChat[dir.id]), 30000);
});

// ---------- Ready to post: a Lab render's loop fix ----------
await safe('ready to post', async () => {
  await PerfectLoop.off({ quiet: true });
  const plain = await LabExport.render({ format: 'mp4', source: 'scene', at: 0, secs: 2.5, size: { w: 180, h: 320 }, quiet: true, sound: false });
  if (typeof PublishKit === 'undefined') await window.Lazy.load('publishkit');
  const st = await PublishKit.open(plain.path, { platform: 'shorts' });
  await st.ready;
  const c = st.checks.find((x) => x.id === 'loop');
  step('Ready to post on a Lab render that jumps: the loop fix renders the scene as a perfect loop', c && c.fix?.kind === 'loop' && /perfect loop/.test(c.fix.label) && PerfectLoop.isLabRender(st), c);
  const r = await PublishKit.fix(st, c);
  await until(() => PublishKit.current && PublishKit.current.file === r?.path && PublishKit.current.res, 30000);
  const n = PublishKit.current;
  const lc = n?.checks?.find((x) => x.id === 'loop');
  step('… the new copy is a perfect loop: Ready to post checks it again, "Loops seamlessly"', r?.path && lc?.level === 'ok', { path: r?.path, loop: lc, made: PerfectLoop.state() });
  PublishKit.close();
});

// ---------- Loop off ----------
await safe('off', async () => {
  await d.updateLayer(probeLayer().id, { code: PERIODIC }, 2);
  await PerfectLoop.make({ secs: 2, check: false, quiet: true });
  await PerfectLoop.off({ quiet: true });
  await wait(1200);
  const e = await d.evalInSketch('loop.on');
  step('Loop off: the scene runs on its own clock again, the size keys as they were', !PerfectLoop.state()?.on && /false/.test(JSON.stringify(e)) && !keysOf().some((x) => Math.abs(x.t - 2) < 1e-3), { keys: keysOf(), e });
  await PerfectLoop.make({ secs: 2, check: false, quiet: true });
  await PerfectLoop.check({ quiet: true });
  PerfectLoop.showCard(); // (for the screenshot)
});

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
