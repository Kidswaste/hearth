// Comp dispatch (round 10): the main chat's director splits a video into two parts and dispatches them (three_do comp
// dispatch, through the real MCP tools) to two new director chats, one on Claude and one on Astra; both work at the
// same time, each building its own scene backstage through the real MCP tools (fake engines: a dim draft, then the
// final), while the main scene shows both parts as precomp layers (one after the other) that update live. The card in
// the main chat follows each part (working → done, what it said); the main agent reads the parts; feedback reaches a
// part; ⇄ swaps a part to the other engine (it carries on with the task state); ⟳ again from a fresh scene (the
// precomp follows the chat); a hung part shows as stuck; ↗ jumps into a part (the Lab follows). The comp is rendered
// 9:16 and its frames read back: part 1 at 1 s, part 2 at 7 s.
//   node dev/smoke.js --fake-engines --script dev/checks/comp-dispatch.js --wait 6000 --check-timeout 1500000 --shot /tmp/comp-dispatch.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], problems: [], timing: {} };
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
const pcInfo = async () => (await sb('return window.__pcInfo()')) || [];
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
const hue = ([r, g, b]) => (r > 150 && g < 110 && b < 110 ? 'red' : r > 60 && r < 130 && g < 40 && b < 40 ? 'dim red' : b > 150 && r < 110 && g < 150 ? 'blue' : b > 50 && b < 120 && r < 40 && g < 60 ? 'dim blue' : r > 200 && g > 200 && b > 200 ? 'white' : 'other');
// the main scene at t with the precomp named `name` showing there (the page answers slowly on a software GPU): its
// color in the middle of the frame, read twice (a picture still on its way reads as 'unsteady')
async function look(t, name) {
  await at(t);
  await until(async () => (await pcInfo()).some((p) => p.name.includes(name) && p.mounted && p.mix > 0 && Math.abs(p.host - t) < 1e-3), 20000);
  await wait(1500);
  const a = hue((await screen()).at(0.75, 0.8)); await wait(800); const b = hue((await screen()).at(0.75, 0.8));
  return a === b ? a : 'unsteady';
}
async function at(t) { if (P.playing) P.toggle(false); P.seek(t); await until(async () => Math.abs((await sb('return audio.time')) - t) < 1e-3, 8000); await wait(1200); }

// ---------- 1. the main chat dispatches two parts (Claude and Astra) ----------
Native.newChat(agent.id);
await wait(1500);
const t0 = performance.now();
await Native.send(agent.id, 'comp: dispatch embers gathering into a red field | astra: a blue field that holds');
const M = H.activeChat[agent.id];
const parts = () => CompDispatch.cards().at(-1)?.parts || [];
await until(() => parts().length === 2, 60000);
const card = () => CompDispatch.cards().at(-1);
step(parts().length === 2, 'the main agent dispatched two parts (three_do comp dispatch through the real MCP tools)', parts().map((p) => p.name));
const [p1, p2] = parts();
const chats = parts().map((p) => H.chats.find((c) => c.id === p.chatId));
step(chats.every(Boolean) && chats.every((c) => c.agentId === agent.id) && new Set(parts().map((p) => ChatScenes.linkOf(p.chatId))).size === 2, 'each part has its own new director chat and scene', chats.map((c) => c?.title));
step(p1.engine === 'claude' && p2.engine === 'codex', 'part 1 on Claude, part 2 on Astra', parts().map((p) => p.engine));
const both = await until(() => parts().every((p) => Native.isBusy(p.chatId)), 20000);
step(both, 'both parts work at the same time', parts().map((p) => p.state));
out.timing.bothBusyAfterMs = Math.round(performance.now() - t0);
const skM = ChatScenes.linkOf(M);
step(S.currentId() === skM, 'the main scene stays on screen while the parts work backstage');
const pcs = S.layersOf(S.get(skM)).filter((L) => ThreeComp.isComp(L));
step(pcs.length === 2 && pcs[0].in === 0 && pcs[0].out === 5 && Math.abs(pcs[1].in - 4.7) < 1e-6 && pcs[1].fadeIn > 0, 'the main scene shows them one after the other (0–5 s, then 5–10 s with a cross-fade)', pcs.map((L) => [L.name, L.in, L.out, L.fadeIn]));
const node = await until(() => document.querySelector(`.comp-card[data-cid="${card().id}"]`), 10000);
step(node, 'a card in the main chat follows the parts');
await smoke({ shot: `${SHOTS}/d1-dispatched.png` });

// ---------- 2. live: the precomps change while the parts build ----------
const seen1 = new Set(); const seen2 = new Set();
const t1 = performance.now();
await until(async () => {
  const a = await look(1, p1.name); seen1.add(a);
  const b = await look(7, p2.name); seen2.add(b);
  return a === 'red' && b === 'blue' && parts().every((p) => p.state === 'done');
}, 180000);
out.timing.partsDoneMs = Math.round(performance.now() - t0);
step(seen1.has('red') && seen2.has('blue'), 'the main scene shows part 1 (red) at 1 s and part 2 (blue) at 7 s', { at1: [...seen1], at7: [...seen2] });
step(seen1.has('dim red') || seen2.has('dim blue'), 'live: a part\'s draft showed in the main scene before its final', { at1: [...seen1], at7: [...seen2] });
step(parts().every((p) => p.state === 'done' && /Built part/.test(p.last || '')), 'the card says both are done, with what each said', parts().map((p) => [p.state, p.last]));
const cardText = document.querySelector(`.comp-card[data-cid="${card().id}"]`)?.textContent || '';
step(/done/.test(cardText) && cardText.includes(p1.name), 'the card shows it', cardText.slice(0, 160));
const usedCodex = await window.hub.kvGet('director-tasks', {}).then((d) => d?.[p2.chatId]?.by || {});
step(Object.keys(usedCodex).includes('codex'), 'part 2\'s tool calls came from Astra (Codex)', usedCodex);
await smoke({ shot: `${SHOTS}/d2-parts-done.png` });

// ---------- 3. the main agent reads the parts and gives feedback ----------
const read = await HubBridge.call('three_do', { cmd: 'comp', op: 'parts' }, { chatId: M });
step(read.ok !== false && read.value?.parts?.length === 2 && read.value.parts.every((p) => p.status === 'done'), 'three_do comp parts: each part\'s chat, agent, status and last words', read.value?.parts?.map((p) => `${p.part} ${p.agent} ${p.status}`));
const fb = await HubBridge.call('three_do', { cmd: 'comp', op: 'feedback', part: 1, text: 'make the bar wider' }, { chatId: M });
step(fb.ok !== false, 'three_do comp feedback reaches part 1', fb.value || fb.error);
await until(() => !Native.isBusy(p1.chatId) && p1.state === 'done', 60000);
const code1 = S.layersOf(S.get(ChatScenes.linkOf(p1.chatId))).map((L) => L.code).join('\n');
step(/value: 0\.4/.test(code1), 'part 1 applied it (its scene changed)');
const sp = await say('/comp parts', agent.id);
step(/2 parts/.test(sp) && /done/.test(sp), '/comp parts says the same', sp.slice(0, 160));

// ---------- 4. swap a part to the other engine; again from a fresh scene ----------
const sw = await CompDispatch.swap(1, { chatId: M });
const c1 = await Native.load(p1.chatId);
step(c1.engine === 'codex' && p1.engine === 'codex', '⇄ part 1 now runs on Astra (same chat and scene)', sw);
await CompDispatch.feedback(1, 'one more pass', { chatId: M });
await until(() => !Native.isBusy(p1.chatId), 60000);
await wait(1500);
const by = await window.hub.kvGet('director-tasks', {}).then((d) => d?.[p1.chatId]?.by || {});
step(Object.keys(by).includes('codex') && Object.keys(by).includes('claude'), 'its next turn ran on Astra (both engines worked on part 1)', { by, said: (await Native.load(p1.chatId)).messages.at(-1)?.text?.slice(0, 160) });
const skOld = ChatScenes.linkOf(p2.chatId);
const ag = await CompDispatch.again(2, { fresh: true }, { chatId: M });
step(ChatScenes.linkOf(p2.chatId) !== skOld, '⟳ part 2 again from a fresh scene (its chat gets a new scene)', ag);
await until(() => !Native.isBusy(p2.chatId) && p2.state === 'done', 90000);
const after = await until(async () => (await look(7, p2.name)) === 'blue', 60000);
step(after, 'the precomp follows the chat to its new scene (blue again at 7 s)', await look(7, p2.name));

// ---------- 5. stuck, and jumping in ----------
window.COMP_STUCK_MS = 4000;
await CompDispatch.feedback(2, 'comp-hang', { chatId: M }); // (the fake engine's brief keyword for a run that never ends)
const stuck = await until(() => p2.state === 'stuck', 30000);
step(stuck, 'a part that stops answering shows as stuck', p2.last);
window.hub.stop(p2.chatId);
window.COMP_STUCK_MS = 0;
await until(() => !Native.isBusy(p2.chatId), 20000);
CompDispatch.jumpIn(p1);
await until(() => H.activeChat[agent.id] === p1.chatId && S.currentId() === ChatScenes.linkOf(p1.chatId), 20000);
step(H.activeChat[agent.id] === p1.chatId && S.currentId() === ChatScenes.linkOf(p1.chatId), '↗ jump in: part 1\'s chat opens and the Lab shows its scene');
await smoke({ shot: `${SHOTS}/d3-jumped-in.png` });
Native.open(agent.id, M);
await until(() => S.currentId() === skM, 20000);

// ---------- 6. the comp rendered 9:16 ----------
const rr = await say('/comp render 9:16 6s', agent.id);
const name = (rr.match(/Rendered (.+?) \(/) || [])[1];
const full = name ? `${await ThreeSeq.outDir()}/${name}` : null;
const pr = full ? await window.hub.video.probe(full).catch(() => null) : null;
step(pr && pr.w === 1080 && pr.h === 1920 && Math.abs(pr.duration - 6) < 0.2, 'the comp renders 9:16 (1080×1920, its first 6 s)', { said: rr, pr: pr && { w: pr.w, h: pr.h, d: pr.duration } });
if (full) {
  const job = (args, output, input) => new Promise((resolve, reject) => {
    const id = `chk${Math.random().toString(36).slice(2)}`;
    let done = false;
    window.hub.video.onJob((ev) => { if (ev.id !== id || ev.type !== 'done' || done) return; done = true; if (ev.code === 0) resolve(ev); else reject(new Error(ev.error || 'ffmpeg failed')); });
    window.hub.video.transcode({ id, input, output, args, duration: 10 }).catch(reject);
  });
  const FR = [30, 145, 175];
  const tmp = `${SHOTS}/dframes-${Date.now().toString(36)}`;
  await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}'`, '-vsync', '0', 'OUTPUT'], `${tmp}/f_%02d.png`, full);
  await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=3x1`, '-frames:v', '1', 'OUTPUT'], `${SHOTS}/comp-dispatch-sheet.png`, full);
  const rd = async (p) => px(`data:image/png;base64,${await window.hub.fs.read(p, { encoding: 'base64' })}`);
  const a1 = await rd(`${tmp}/f_01.png`); const a2 = await rd(`${tmp}/f_02.png`); const a3 = await rd(`${tmp}/f_03.png`);
  step(hue(a1.at(0.75, 0.8)) === 'red' && hue(a3.at(0.75, 0.8)) === 'blue', 'rendered frame 30 is part 1 (red), frame 175 part 2 (blue)', { f30: a1.at(0.75, 0.8), f175: a3.at(0.75, 0.8) });
  const mix = a2.at(0.75, 0.8);
  step(mix[0] > 70 && mix[2] > 70, 'frame 145 is the cross-fade between them (red and blue mixed)', mix);
  window.hub.video.rmtemp?.(tmp).catch(() => {});
}
step(errs.length === 0, 'no page errors', errs.slice(0, 3));
await smoke({ shot: `${SHOTS}/d4-end.png` });
return JSON.stringify({ ok: out.problems.length === 0, ...out }, null, 1);
