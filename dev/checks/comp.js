// Comp (round 10): precomps in the Lab. A main scene shows two other chats' scenes as layers (left / right), checked
// in pixels on screen (the compositor path) and in the Lab's merged picture (the 2D path: stills, recordings, renders)
// at exact frames; time (start, speed, time-remap keys), keyframed transforms, mask and effects; nesting (a precomp of a
// scene that has a precomp) and the cycle guard (refused, and a forced loop shows a card instead of hanging); a source
// edited backstage by its own chat updates the precomp live without reloading the page; one node in the Nodes view;
// the menus and Alt+C; the comp rendered 9:16 frame by frame and its frames read back; performance (fps / render ms /
// WebGL contexts with and without precomps, one page, automatic resolution for a small precomp).
//   node dev/smoke.js --fake-engines --script dev/checks/comp.js --wait 6000 --check-timeout 1500000 --shot /tmp/comp.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], problems: [], perf: {} };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = String(t); }, note: (t) => { msg = String(t); }, error: (t) => { msg = `Error: ${t}`; } }); return msg; };
const SHOTS = '/tmp/hearth-comp';
const errs = []; addEventListener('error', (e) => errs.push(e.message));

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
const lab = await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(800);
const S = ThreeLab.scenes; const D = ThreeLab.director; const P = lab.player;
const sb = async (code) => { const r = await D.evalInSketch(code); return r?.ok ? r.value : null; };
const health = () => sb('return window.__labHealth()');
const pcInfo = async () => (await sb('return window.__pcInfo()')) || [];
const renderers = async (n, ms = 90000) => until(async () => (await health())?.renderers >= n, ms);
// a director chat whose fake director builds a part scene (red = part 1, blue = 2, green = 3) through the real MCP tools
async function chatWith(text) {
  Native.newChat(agent.id);
  await wait(1500);
  await Native.send(agent.id, text);
  await wait(300);
  const id = H.activeChat[agent.id];
  await until(() => !Native.isBusy(id), 90000);
  return id;
}
// pixels of the preview as it shows on screen (the compositor: CSS clip-path, mask, filters) or as the Lab merges it
async function px(src, n = 64) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = n; c.height = n; const g = c.getContext('2d'); g.drawImage(img, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data;
  return { at: (x, y) => { const i = (Math.round(y * (n - 1)) * n + Math.round(x * (n - 1))) * 4; return [d[i], d[i + 1], d[i + 2]]; }, d };
}
async function screen() {
  const r = S.previewHost().getBoundingClientRect();
  const cap = await smoke({ cdp: 'Page.captureScreenshot', params: { format: 'png', clip: { x: r.left + 2, y: r.top + 2, width: r.width - 4, height: r.height - 40, scale: 1 } } });
  return px(`data:image/png;base64,${cap.data}`);
}
const merged = async () => px(await D.shot());
const hue = ([r, g, b]) => (r > 150 && g < 110 && b < 110 ? 'red' : b > 150 && r < 110 && g < 150 ? 'blue' : g > 150 && r < 120 && b < 140 ? 'green' : r > 200 && g > 200 && b > 200 ? 'white' : Math.max(r, g, b) - Math.min(r, g, b) < 24 ? (r < 60 ? 'dark' : 'gray') : 'other');
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.d.length; i += 4) s += Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]); return s / (a.d.length / 4) / 3; };
// the scene's clock paused on a frame, and that frame drawn (a slow software GPU: wait for the page to show it)
async function at(t) {
  if (P.playing) P.toggle(false);
  P.seek(t);
  await until(async () => Math.abs((await sb('return audio.time')) - t) < 1e-3, 8000);
  await wait(1800);
}

// ---------- 1. two other chats' scenes, and the main chat ----------
const A = await chatWith('Comp part 1/2 · for the comp check\nred field');
const B = await chatWith('Comp part 2/2 · for the comp check\nblue field');
const M = await chatWith('the main scene');
const title = (id) => H.chats.find((c) => c.id === id)?.title;
step(ChatScenes.linkOf(A) && ChatScenes.linkOf(B) && ChatScenes.linkOf(M) && new Set([A, B, M].map((c) => ChatScenes.linkOf(c))).size === 3, 'three director chats, each with its own scene', [title(A), title(B), title(M)]);
const skM = ChatScenes.linkOf(M);
await renderers(2);
const base = await health();
await at(1);
const before = await D.report().stats;
const m1 = await say(`/comp add ${title(A)} left`, agent.id);
const m2 = await say(`/comp add ${title(B)} right`, agent.id);
const Ls = () => S.layersOf(S.get(skM));
step(Ls().filter((L) => ThreeComp.isComp(L)).length === 2 && Ls().length === 4, '/comp add puts the two chats\' scenes in the main scene as two layers', { said: [m1, m2], layers: Ls().map((L) => L.name) });
await renderers(base.renderers + 4);
await at(1);
let info = await pcInfo();
step(info.length === 2 && info.every((p) => p.mounted && p.kids.length === 2), 'the page runs both precomps, each with its scene\'s two layers', info.map((p) => ({ name: p.name, kids: p.kids.length })));
step(document.querySelectorAll('.three-preview iframe, .lab-preview iframe').length <= 1 && S.previewHost().querySelectorAll('iframe').length === 1, 'one preview page (no frame per scene)', S.previewHost().querySelectorAll('iframe').length);
let sc = await screen();
let mg = await merged();
step(hue(sc.at(0.25, 0.5)) === 'red' && hue(sc.at(0.75, 0.5)) === 'blue', 'on screen: the left half is chat A\'s scene (red), the right half chat B\'s (blue)', { left: sc.at(0.25, 0.5), right: sc.at(0.75, 0.5) });
step(hue(mg.at(0.25, 0.5)) === 'red' && hue(mg.at(0.75, 0.5)) === 'blue', 'the Lab\'s merged picture (stills, recordings) shows the same', { left: mg.at(0.25, 0.5), right: mg.at(0.75, 0.5) });
await smoke({ shot: `${SHOTS}/1-two-precomps-split.png` });
const rep = D.report().layers.filter((L) => /precomp of/.test(L.kind || ''));
step(rep.length === 2 && /the chat/.test(rep[0].kind), 'the director\'s layer list says what each precomp shows', rep.map((L) => L.kind));
const listed = await say('/comp', agent.id);
step(/2 precomps/.test(listed) && listed.includes(title(A)), '/comp lists them', listed.slice(0, 200));

// ---------- 2. frame-exact on the scene's clock ----------
await say('/comp set 2 visible=off', agent.id);
await say('/comp set 1 layout=full', agent.id);
await at(1);
const f1a = await screen();
step(hue(f1a.at(0.25, 0.5)) === 'white' && hue(f1a.at(0.75, 0.5)) === 'red', 'frame 30 (1 s): chat A\'s white bar is at a quarter of the width (its own clock = the main scene\'s)', { q: f1a.at(0.25, 0.5), r: f1a.at(0.75, 0.5) });
await at(3);
const f3 = await screen();
step(hue(f3.at(0.75, 0.5)) === 'white' && hue(f3.at(0.25, 0.5)) === 'red', 'frame 90 (3 s): the bar is at three quarters', { q: f3.at(0.25, 0.5), r: f3.at(0.75, 0.5) });
await at(1);
const f1b = await screen();
step(diff(f1a, f1b) < 2 && diff(f1a, f3) > 6, 'the same frame twice is the same picture; another frame another', { same: Math.round(diff(f1a, f1b) * 100) / 100, other: Math.round(diff(f1a, f3) * 100) / 100 });
const mg1 = await merged();
step(hue(mg1.at(0.25, 0.5)) === 'white', 'the merged picture is on the same frame', mg1.at(0.25, 0.5));

// ---------- 3. its time: start, speed, time remap ----------
await say('/comp set 1 start=1', agent.id);
await at(2);
let s2 = await screen();
step(hue(s2.at(0.25, 0.5)) === 'white', 'start=1: at 2 s it shows its own 1 s', s2.at(0.25, 0.5));
await say('/comp set 1 start=0 speed=2', agent.id);
await at(1);
s2 = await screen();
step(hue(s2.at(0.5, 0.5)) === 'white' && hue(s2.at(0.25, 0.5)) === 'red', 'speed=2: at 1 s it shows its own 2 s', { mid: s2.at(0.5, 0.5), q: s2.at(0.25, 0.5) });
await say('/comp set 1 speed=1', agent.id);
const k1 = await say('/comp key 1 remap 0:3:hold 10:3', agent.id);
await at(1);
s2 = await screen();
step(hue(s2.at(0.75, 0.5)) === 'white' && hue(s2.at(0.25, 0.5)) === 'red', 'time-remap keys: frozen on its own 3 s whatever the main time', { said: k1, r: s2.at(0.75, 0.5) });
info = await pcInfo();
step(Math.abs(info.find((p) => p.mix > 0)?.time - 3) < 1e-6, 'the page reports the precomp\'s own time (3 s) at main 1 s', info.map((p) => p.time));
await say('/comp key 1 remap', agent.id);

// ---------- 4. keyframed transform, mask, effects ----------
const k2 = await say('/comp key 1 scale 0:1 2:0.5', agent.id);
await at(2);
s2 = await screen();
step(hue(s2.at(0.4, 0.42)) === 'red' && hue(s2.at(0.04, 0.06)) !== 'red', 'scale keys: at 2 s it is half size (the main scene shows around it)', { said: k2, mid: s2.at(0.4, 0.42), corner: s2.at(0.04, 0.06) });
await at(0);
s2 = await screen();
step(hue(s2.at(0.04, 0.06)) === 'red', '…and full size at 0 s', s2.at(0.04, 0.06));
await say('/comp key 1 scale', agent.id);
await say('/comp set 1 mask=circle', agent.id);
await at(0.5);
s2 = await screen();
mg = await merged();
step(hue(s2.at(0.5, 0.35)) !== 'other' && hue(s2.at(0.04, 0.06)) !== 'red' && hue(mg.at(0.04, 0.06)) !== 'red' && hue(mg.at(0.52, 0.5)) === 'red', 'a circle mask: the corners show the main scene (on screen and merged)', { corner: s2.at(0.04, 0.06), merged: mg.at(0.04, 0.06) });
info = await pcInfo();
step(/ellipse/.test(info.find((p) => p.mix > 0)?.clip || ''), 'the mask is a clip-path on the compositor', info.map((p) => p.clip));
await say('/comp set 1 mask=none sat=0', agent.id);
await at(0.5);
s2 = await screen();
const g0 = s2.at(0.75, 0.5);
step(Math.max(...g0) - Math.min(...g0) < 30, 'effects: saturation 0 makes it gray', g0);
await say('/comp set 1 sat=1', agent.id);
await smoke({ shot: `${SHOTS}/2-full-frame.png` });

// ---------- 5. live: the source chat's director edits its scene backstage ----------
await say('/comp set 2 visible=on layout=right', agent.id);
await say('/comp set 1 layout=left', agent.id);
await at(1);
const pagesBefore = ThreeLab.live.counts().reloads.preview || 0;
const ed = await HubBridge.call('three_edit_code', { edits: [{ find: "'#2f6bff'", replace: "'#30d060'" }] }, { chatId: B });
const turned = await until(async () => hue((await screen()).at(0.75, 0.5)) === 'green', 60000);
step(ed.ok !== false && turned, 'chat B\'s director edits its scene (backstage): the precomp here turns green, live', ed.error || { now: (await screen()).at(0.75, 0.5), pcs: (await pcInfo()).map((p) => [p.name, p.mounted, p.mix]) });
step(S.currentId() === skM, 'the main scene stayed on screen');
step((ThreeLab.live.counts().reloads.preview || 0) === pagesBefore, 'no page reload for it (only the changed layer ran again)', ThreeLab.live.counts().reloads);
await HubBridge.call('three_edit_code', { edits: [{ find: "'#30d060'", replace: "'#2f6bff'" }] }, { chatId: B });

// ---------- 6. nesting and the cycle guard ----------
const C = await chatWith('Comp part 3/3 · for the comp check\ngreen field');
await until(() => S.currentId() === ChatScenes.linkOf(C), 20000);
const skC = ChatScenes.linkOf(C);
const addB = await HubBridge.call('three_do', { cmd: 'comp', op: 'add', source: title(B), layout: 'full' }, { chatId: C });
step(addB.ok !== false && S.layersOf(S.get(skC)).some((L) => ThreeComp.isComp(L)), 'chat C\'s director puts chat B\'s scene in its own scene (three_do comp add)', addB.error || addB.value?.added);
Native.open(agent.id, M);
await until(() => S.currentId() === skM, 20000);
await renderers(4);
const nest = await say(`/comp set 1 source=${title(C)}`, agent.id);
await until(async () => (await pcInfo()).some((p) => p.kids.some((k) => k.split('>').length > 2)), 30000);
await at(1);
info = await pcInfo();
s2 = await screen();
step(info.some((p) => p.kids.some((k) => k.split('>').length >= 3)) && hue(s2.at(0.25, 0.5)) === 'blue', 'nested: the left precomp shows C, which shows B (blue)', { said: nest, kids: info.map((p) => p.kids.length), left: s2.at(0.25, 0.5) });
const loop1 = await HubBridge.call('three_do', { cmd: 'comp', op: 'add', source: title(M) }, { chatId: C });
step(loop1.ok === false && /itself/.test(loop1.error), 'C can\'t take the main scene (it already shows C): refused', loop1.error);
const loop2 = await say(`/comp add ${title(M)}`, agent.id);
step(/itself|No chat/.test(loop2), 'the main scene can\'t take itself either', loop2);
// a loop forced in the data (an old file, two edits at once): a card, not a hang
const pcC = S.layersOf(S.get(skC)).find((L) => ThreeComp.isComp(L));
const was = pcC.precomp.src;
pcC.precomp.src = { chat: M };
S.changed(skC);
await until(async () => (await pcInfo()).some((p) => p.kids.some((k) => /card$/.test(k))), 20000);
info = await pcInfo();
step(info.some((p) => p.kids.some((k) => /card$/.test(k))) && (await health())?.layers < 30, 'a forced loop shows a card ("can\'t hold itself") instead of hanging', info.map((p) => p.kids));
pcC.precomp.src = was;
S.changed(skC);
await say(`/comp set 1 source=${title(A)}`, agent.id);
await smoke({ shot: `${SHOTS}/3-nested.png` });

// ---------- 7. the Nodes view: one node ----------
const pcA = Ls().find((L) => ThreeComp.isComp(L));
await HubBridge.call('three_do', { cmd: 'select_layer', layer: pcA.id }, { chatId: M });
ThreeNodes.lab.setMode('nodes');
await wait(800);
const g = ThreeNodes.lab.view.getGraph();
step(g.nodes.length === 1 && g.nodes[0].type === 'precomp', 'the Nodes view shows a precomp as one node', g.nodes.map((n) => n.type));
const g2 = JSON.parse(JSON.stringify(g)); g2.nodes[0].values.speed = 0.5;
ThreeComp.fromNode(g2, pcA.id);
await until(() => pcA.precomp.speed === 0.5, 5000);
step(pcA.precomp.speed === 0.5, 'turning its Speed knob sets the precomp\'s speed', pcA.precomp.speed);
await smoke({ shot: `${SHOTS}/4-nodes.png` });
ThreeNodes.lab.setMode('code');
await say('/comp set 1 speed=1', agent.id);

// ---------- 8. menus and keys ----------
const row = [...document.querySelectorAll('.ly-list .ly-row')].find((r) => r.textContent.includes(pcA.name.replace(/^◫\s*/, '')));
row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
await wait(300);
const pop = document.querySelector('.mb-menu.lab-pop');
step(Boolean(pop && /Precomp/.test(pop.textContent)), 'right-click the precomp layer: ◫ Precomp ›', pop?.textContent.slice(0, 120));
document.querySelector('.mb-menu.lab-pop')?.remove();
document.body.click();
step(Keys.all().some((k) => k.keys === 'Alt+C'), 'Alt+C is in the keys list');
dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', altKey: true, bubbles: true }));
await wait(300);
const pop2 = document.querySelector('.mb-menu.lab-pop');
step(Boolean(pop2 && /Another scene as a layer/.test(pop2.textContent) && /Dispatch/.test(pop2.textContent)), 'Alt+C opens the Comp menu (add a scene, dispatch parts)', pop2?.textContent.slice(0, 160));
document.querySelector('.mb-menu.lab-pop')?.remove();
step(Boolean(Commands.get('comp') && Commands.get('dispatch')), '/comp and /dispatch are commands');

// ---------- 9. performance ----------
await at(1);
P.toggle(true);
await wait(5000);
const withPc = { stats: D.report().stats, health: await health(), info: await pcInfo() };
P.toggle(false);
out.perf = {
  before: { fps: before?.fps, renderMs: before?.renderMs, contexts: base?.contexts, layers: base?.layers },
  withTwoPrecomps: { fps: withPc.stats?.fps, renderMs: withPc.stats?.renderMs, contexts: withPc.health?.contexts, layers: withPc.health?.layers, perPrecompMs: withPc.info.map((p) => p.ms), res: withPc.info.map((p) => p.res) },
};
await say('/comp set 2 layout=pip', agent.id);
await at(1); P.toggle(true);
const small = await until(async () => (await pcInfo()).some((p) => p.res <= 0.45), 20000);
P.toggle(false);
info = await pcInfo();
out.perf.pip = info.map((p) => ({ name: p.name, res: p.res, auto: p.auto, ms: p.ms }));
step(small, 'a small picture-in-picture precomp draws at a lower resolution by itself', out.perf.pip);
step(withPc.health?.contexts <= withPc.health?.renderers + 1 && S.previewHost().querySelectorAll('iframe').length === 1, 'WebGL contexts: one per running layer (no leftovers), still one page', { before: base, after: withPc.health });

// ---------- 10. render 9:16, frame by frame ----------
await say('/comp set 2 layout=right', agent.id);
await at(0);
const t0 = performance.now();
const rr = await say('/comp render 9:16 2s', agent.id); // (2 s: a software GPU draws ~1 frame a second)
const pathM = (rr.match(/Rendered (.+?) \(/) || [])[1];
const dir = await ThreeSeq.outDir();
const full = pathM ? `${dir}/${pathM}` : null;
const pr = full ? await window.hub.video.probe(full).catch(() => null) : null;
out.perf.renderSeconds = Math.round((performance.now() - t0) / 100) / 10;
step(pr && pr.w === 1080 && pr.h === 1920 && Math.abs(pr.fps - 30) < 0.01 && Math.abs(pr.duration - 2) < 0.1, '/comp render 9:16 2s: a 1080×1920 30 fps video of the comp, 2 s', { said: rr, probe: pr && { w: pr.w, h: pr.h, fps: pr.fps, duration: pr.duration } });
if (full) {
  const job = (args, output, input) => new Promise((resolve, reject) => {
    const id = `chk${Math.random().toString(36).slice(2)}`;
    let done = false;
    window.hub.video.onJob((ev) => { if (ev.id !== id || ev.type !== 'done' || done) return; done = true; if (ev.code === 0) resolve(ev); else reject(new Error(ev.error || 'ffmpeg failed')); });
    window.hub.video.transcode({ id, input, output, args, duration: 10 }).catch(reject);
  });
  const FR = [15, 45, 59];
  const tmp = `${SHOTS}/frames-${Date.now().toString(36)}`;
  await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}'`, '-vsync', '0', 'OUTPUT'], `${tmp}/f_%02d.png`, full);
  await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=3x1`, '-frames:v', '1', 'OUTPUT'], `${SHOTS}/comp-render-sheet.png`, full);
  const read = async (p) => px(`data:image/png;base64,${await window.hub.fs.read(p, { encoding: 'base64' })}`);
  const fA = await read(`${tmp}/f_01.png`); const fB = await read(`${tmp}/f_02.png`);
  step(hue(fA.at(0.25, 0.6)) === 'red' && hue(fA.at(0.75, 0.6)) === 'blue', 'rendered frame 15: red on the left, blue on the right (both precomps)', { l: fA.at(0.25, 0.6), r: fA.at(0.75, 0.6) });
  // 9:16 is tall: each half shows the middle of its scene (the bar at its own 1 s / 3 s is at its quarter marks)
  step(diff(fA, fB) > 2, 'frame 45 differs from frame 15 (the scenes move on the comp\'s clock)', Math.round(diff(fA, fB) * 100) / 100);
  window.hub.video.rmtemp?.(tmp).catch(() => {});
  step(Boolean(await window.hub.fs.stat(`${SHOTS}/comp-render-sheet.png`)), 'a contact sheet of the render is saved to look at', `${SHOTS}/comp-render-sheet.png`);
}
step(errs.length === 0, 'no page errors', errs.slice(0, 3));
await smoke({ shot: `${SHOTS}/5-end.png` });
return JSON.stringify({ ok: out.problems.length === 0, ...out }, null, 1);
