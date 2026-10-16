// Nothing is lost when Hearth or the computer stops suddenly (round 50, crashsafe), end to end on throwaway data:
//   1. the Lab preview page's own process killed the hard way (SIGKILL) right after a slider move: a new page comes
//      up by itself with the same scene and the slider where it was (no banner, nothing saved)
//   2. the window's page crashed (forcefullyCrashRenderer) while Claude streams a long reply, with unsaved Lab code
//      and a chat draft typed a moment ago: the page reloads, the card lists the Lab work, the draft and the reply;
//      the reply lands whole in its chat when the engine (still running in the main process) ends, and its journal
//      copy is let go
//   3. a reply cut off by a killed main process (its journal entry, as the next start finds it): the words so far +
//      "Reply cut off — Hearth closed while it was being written" + Continue; Continue gets the rest
//   4. a power cut mid-write: a store cut short with its whole temp file left behind → the sweep puts it back
//   5. Windows ending the session (an update restart): every waiting save is written at once
//   node dev/smoke.js --fake-engines --wait 8000 --check-timeout 180000 --script dev/checks/crashsafe.js --shot /tmp/crashsafe.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  await Lazy.load('safetynet');
  step(typeof CrashSafe !== 'undefined' && typeof CrashSafeCore !== 'undefined', 'the crashsafe part loads with safetynet');

  // ---------- 1. the Lab preview's process killed mid-edit ----------
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(1200);
  const code = ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code
    .replace('const cube = ', 'const P = tweak({ size: [1, 0.2, 3], speed: [1, 0, 4] });\nconst cube = ')
    .replace('cube.rotation.set(t * 0.4, t * 0.6, 0);', 'cube.rotation.set(t * 0.4 * P.speed, t * 0.6 * P.speed, 0); cube.scale.setScalar(P.size);');
  ThreeLab.openCode(code);
  await until(() => c.sliders().some((x) => x.key === 'size'), 15000);
  await wait(2500);
  const s = c.sliders().find((x) => x.key === 'size');
  const v = 2.35;
  c.setSlider(s.label, v);
  await wait(400);
  const pageOf = (list) => list.find((f) => !f.main && f.url.includes('three-sandbox') && f.url.includes('mode=sketch'));
  const before = pageOf(await window.hub.crashsafe.test('frames'));
  const killed = await window.hub.crashsafe.test('kill-frame', 'mode=sketch');
  step(killed, 'the Lab preview page has a process of its own, killed the hard way', before?.pid);
  const after = await until(async () => { const f = pageOf(await window.hub.crashsafe.test('frames')); return f && f.url !== before?.url ? f : null; }, 20000);
  step(Boolean(after), 'a new preview page comes up by itself (within a few seconds)', after?.url?.slice(-40));
  await until(() => document.querySelector('.three-frame') && !document.querySelector('.three-stall:not([hidden])'), 8000);
  await wait(2500);
  step(Math.abs((c.sliders().find((x) => x.key === 'size')?.value ?? -1) - v) < 1e-6, 'the slider is where it was', c.sliders().find((x) => x.key === 'size')?.value);
  const stall = document.querySelector('.three-stall');
  step(!stall || stall.hidden || getComputedStyle(stall).display === 'none', 'no banner: it worked itself out');
  await smoke({ shot: `${window.SMOKE_SAVES || '/tmp'}/crashsafe-preview.png` });

  // ---------- 2. the window's page crashes while a reply streams ----------
  const sid = ThreeLab.scenes.currentId();
  const area = ThreeNodes.lab.hook.editor.area;
  const mark = `// crashsafe ${Date.now().toString(36)}`;
  const agent = H.claudeAgent();
  activate(agent.id);
  await until(() => Native.view(agent.id)?.input);
  await Native.send(agent.id, 'Write a long intro for the orb video');
  const chatId = H.activeChat[agent.id];
  const streamed = await until(() => { const b = document.querySelector('.msg.assistant.streaming .body'); return b && b.textContent.length > 40 ? b.textContent.length : 0; }, 20000);
  step(Boolean(streamed) && Native.isBusy(chatId), 'Claude is streaming a long reply', streamed);
  const st = await window.hub.crashsafe.test('state');
  step(st.replies.some((e) => e.chatId === chatId && e.text.length > 0), 'the main process journals the reply as it streams', st.replies.map((e) => e.text.length));
  const input = Native.view(agent.id).input;
  input.value = 'Next: make the rings gold on the drop';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  activate('tool:three');
  await wait(300);
  area.value = `${area.value}\n${mark}`;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await SafetyNet.keepNow();
  localStorage.setItem('cs.test', JSON.stringify({ sid, mark, agent: agent.id, chatId, v }));
  localStorage.setItem('cs.steps', JSON.stringify(out.steps));
  await window.hub.safetynet.testCrash();
  await wait(8000);
  out.problems.push('the page did not crash');
} catch (err) { out.problems.push(`error: ${err.message}`); }
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const T = JSON.parse(localStorage.getItem('cs.test') || '{}');
out.steps.push(...JSON.parse(localStorage.getItem('cs.steps') || '[]'));
try {
  await until(() => typeof SafetyNet !== 'undefined' && typeof CrashSafe !== 'undefined', 20000);
  await SafetyNet.recovering;
  const rep = await until(() => SafetyNet.last(), 20000);
  const kinds = new Set((rep?.items || []).map((i) => i.k));
  step(['lab', 'draft', 'reply'].every((k) => kinds.has(k)), 'after the crash the card lists the Lab work, the draft and the reply', rep?.items?.map((i) => i.label));
  const key = `draft.${T.agent}.${T.chatId || 'new'}`;
  step((store.get(key, '') || '').includes('rings gold'), 'the draft is back in its box');
  // the reply: whole in its chat once the engine (still running in the main process) ended
  const got = await until(async () => { const chat = await Native.load(T.chatId); const m = chat?.messages.at(-1); return m?.role === 'assistant' && !m.stopped && m.text.length > 100 ? m : null; }, 30000);
  const dbg = got ? null : await window.hub.crashsafe.test('state').then((x) => { const e = x.replies.find((r) => r.chatId === T.chatId); return e && { gen: e.gen, now: x.gen, final: e.final?.type, len: e.text.length, waiting: CrashSafe.waiting }; });
  step(Boolean(got), 'the reply that was streaming lands whole in its chat', got ? { len: got.text.length, how: got.crashsafe || 'live' } : { dbg, last: (await Native.load(T.chatId))?.messages.slice(-2).map((m) => [m.role, m.text.slice(0, 40), m.at]) });
  const chat = await Native.load(T.chatId);
  step(chat.messages.filter((m) => m.role === 'assistant').length === 1, 'exactly once (never doubled)');
  const st = await until(async () => { const x = await window.hub.crashsafe.test('state'); return x.replies.some((e) => e.chatId === T.chatId) ? null : x; }, 8000);
  step(Boolean(st), 'its journal copy is let go once it is in the chat');

  // ---------- 3. a reply cut off by a killed main process ----------
  const agentId = T.agent;
  activate(agentId);
  await Native.open(agentId, T.chatId);
  await wait(50);
  const now = Date.now();
  chat.messages.push({ role: 'user', text: 'Now write the outro in three short lines', at: now });
  Native.save(chat);
  const it = await CrashSafe.restore.reply({ k: 'reply', chatId: T.chatId, agentId, gen: -1, started: now + 5, at: now + 400, text: 'The orb dims, the rings', tools: [] });
  step(/was cut off — what it wrote is kept/.test(it?.label || ''), 'the card line for a reply cut off by a crash', it?.label || (await Native.load(T.chatId))?.messages.slice(-3).map((m) => [m.role, m.at - now, m.crashsafe]));
  const node = await until(() => [...document.querySelectorAll('.msg')].find((n) => /Hearth closed while it was being written/.test(n.textContent)), 8000);
  step(Boolean(node), 'the chat says "Reply cut off — Hearth closed while it was being written"', node?.textContent.slice(0, 120));
  const cut = (await Native.load(T.chatId)).messages.findLast((m) => m.role === 'assistant');
  step(cut?.stopped && cut.cut && cut.text === 'The orb dims, the rings', 'what it wrote so far is kept, marked cut off');
  const btn = await until(() => [...document.querySelectorAll('.net-act')].find((b) => b.textContent === 'Continue'), 8000);
  step(Boolean(btn), 'with Continue under it');
  await smoke({ shot: `${window.SMOKE_SAVES || '/tmp'}/crashsafe-cut.png` });
  btn?.click();
  const cont = await until(async () => { const ch = await Native.load(T.chatId); const u = ch.messages.findLast((m) => m.role === 'user'); return u && /Your last reply was cut off/.test(u.text) && /three short lines/.test(u.text) ? u : null; }, 10000);
  step(Boolean(cont), 'Continue sends one short line with the question (the engine may not have it)', cont?.text.length);
  const fin = await until(async () => { const ch = await Native.load(T.chatId); return !Native.isBusy(T.chatId) && ch.messages.at(-1)?.role !== 'error' && ch.messages.findLast((m) => m.role === 'assistant')?.text.length > 30; }, 30000);
  step(Boolean(fin), 'the rest comes in');

  // ---------- 4. a power cut mid-write: a store cut short, its whole temp file left behind ----------
  const data = (await window.hub.attachmentsDir()).replace(/[\\/][^\\/]+$/, '');
  const sep = data.includes('\\') ? '\\' : '/';
  await window.hub.fs.write(`${data}${sep}kv${sep}crash-probe.json`, '[{"id":"a","name":"Kick o');
  await window.hub.fs.write(`${data}${sep}kv${sep}crash-probe.json.9999-1.tmp`, '[{"id":"a","name":"Kick orb"},{"id":"b","name":"Rings"}]');
  const sw = await window.hub.crashsafe.test('sweep');
  const probe = await window.hub.kvGet('crash-probe', null);
  step(Array.isArray(probe) && probe.length === 2, 'a store cut short by a power cut: the whole version from its temp file is back', sw.map((x) => `${x.action}: ${x.file.split(/[\\/]/).pop()}`));

  // ---------- 5. Windows ending the session (an update restart) ----------
  const input = Native.view(agentId).input;
  input.value = 'typed right before the update restart';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await window.hub.crashsafe.test('down');
  await wait(300);
  step((store.get(`draft.${agentId}.${T.chatId}`, '') || '').includes('update restart'), 'Windows ending the session: the waiting draft save is written at once');
} catch (err) { out.problems.push(`error: ${err.message}`); }
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
