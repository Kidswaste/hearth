// Freshen (round 20, soak): the reload that keeps everything. Part 1 sets up a session like the owner's (two chats
// with replies, the first one scrolled up, a half-typed draft, a Lab scene of its own), notes it and saves it the way
// the Freshen button does; the harness reloads the window; part 2 checks it all came back. Also /freshen status, the
// Ctrl+K action, nothing over the limits at the start, no duplicate commands.
//   node dev/smoke.js --fake-engines --check-timeout 200000 --script dev/checks/freshen.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const C = H.claudeAgent();
activate(C.id); await wait(300);
const sendAndWait = async (text) => { await Native.send(C.id, text); await until(() => !Native.isBusy(H.activeChat[C.id]), 20000); await wait(300); };
Native.newChat(C.id); await wait(100);
await sendAndWait('long first'); await sendAndWait('long second'); await sendAndWait('table third');
const first = H.activeChat[C.id];
Native.newChat(C.id); await wait(100);
await sendAndWait('hello other');
Native.open(C.id, first); await wait(600);
const v = Native.view(C.id);
v.list.scrollTop = Math.max(0, Math.round((v.list.scrollHeight - v.list.clientHeight) / 3)); await wait(200);
Native.setDraft(C.id, 'half typed thought');
// a Lab scene of its own (the scene on screen comes back)
activate('tool:three'); await ThreeLab.cmd(); await until(() => ThreeLab.scenes, 15000);
const sc = ThreeLab.scenes.create({ name: 'Freshen check', code: ThreeData.TEMPLATES[0].code });
ThreeLab.scenes.open(sc.id); await wait(1500);
activate(C.id); await wait(400);
const before = { active: H.activeId, chat: H.activeChat[C.id], draft: v.input.value, top: Math.round(v.list.scrollTop), scene: ThreeLab.scenes.currentId() };
localStorage.setItem('freshen-check', JSON.stringify(before));
const saved = Freshen.save('check');
return JSON.stringify({ before, saved: { active: saved.active, chats: Object.keys(saved.chats).length, lab: saved.lab } });
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await Freshen.restored; await wait(800);
const before = JSON.parse(localStorage.getItem('freshen-check') || '{}');
const C = H.claudeAgent(); const v = Native.view(C.id);
const after = { active: H.activeId, chat: H.activeChat[C.id], draft: v?.input.value, top: Math.round(v?.list.scrollTop || 0), scene: (typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId?.()) || store.get('three.current') };
const fail = [];
for (const k of ['active', 'chat', 'draft', 'scene']) if (before[k] !== after[k]) fail.push(`${k}: ${before[k]} → ${after[k]}`);
if (Math.abs(before.top - after.top) > 60) fail.push(`scroll: ${before.top} → ${after.top}`);
if (sessionStorage.getItem('hearth.freshen')) fail.push('the saved state is used once (still in sessionStorage)');
let said = ''; await Commands.tryRun('/freshen status', C.id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); } });
if (!/Freshen/.test(said) || !/memory/.test(said)) fail.push(`/freshen status: ${said.slice(0, 120)}`);
if (!AppUI.actions().some((a) => /Freshen/.test(a.label))) fail.push('Ctrl+K action');
if (Freshen.over().length) fail.push(`nothing is over the limits at the start (${Freshen.over()})`);
if ((Commands.duplicates?.() || []).length) fail.push(`duplicate commands ${JSON.stringify(Commands.duplicates())}`);
if (fail.length) throw new Error(fail.join(' · '));
return JSON.stringify({ ok: true, before, after, said: said.slice(0, 200) });
