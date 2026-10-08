// Astra smoke checks (run through dev/astra-smoke.js, which fills in the fake engine paths).
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
H.config.settings = { ...(H.config.settings || {}), enginePaths: { codex: '__FAKE_CODEX__', claude: '__FAKE_CLAUDE__' } };
await saveConfig();
await sleep(800);
const A = H.agents().find((a) => a.engine === 'codex');
const C = H.agents().find((a) => a.engine === 'claude');
out.agents = [A?.id, C?.id];

// doctor
activate(A.id);
await sleep(300);
await Commands.tryRun('/astra-doctor', A.id);
out.doctor = [...document.querySelectorAll(`.surface[data-id="${A.id}"] .msg.note`)].pop()?.textContent.slice(0, 220);
out.hints = document.querySelector(`.surface[data-id="${A.id}"] .astra-hints`)?.textContent.slice(0, 200);

// a plain Astra chat with per-chat effort, memory and suggestions
await Commands.tryRun('/astra-effort low', A.id);
await Native.send(A.id, 'hello REMEMBER SUGGEST TOOL');
const reply = await until(() => Native.chatOf(A.id)?.messages.find((m) => m.role === 'assistant'));
out.reply = reply && { text: reply.text.slice(0, 80), usage: reply.usage, remembered: reply.remembered, suggest: reply.suggest, tools: reply.tools };
const args1 = JSON.parse(await window.hub.fs.read('__TMP__/fake-codex-astra/last-args.json'));
out.effortArg = args1.configs.model_reasoning_effort;
await Native.send(A.id, 'second turn');
const r2 = await until(() => Native.chatOf(A.id)?.messages.filter((m) => m.role === 'assistant')[1]);
out.secondUsage = r2?.usage;
out.resumed = JSON.parse(await window.hub.fs.read('__TMP__/fake-codex-astra/last-args.json')).resume;

// duo from Claude's chat
activate(C.id);
await sleep(200);
await Commands.tryRun('/duo compare cats and dogs', C.id);
const duo = await until(() => { const m = Native.chatOf(C.id)?.messages.find((x) => x.role === 'collab' && x.mode === 'duo'); return m?.status === 'done' && m; });
out.duo = duo && { parts: duo.parts.map((p) => `${p.seat}:${p.status}:${p.usage?.input}`), cards: document.querySelectorAll('.collab-card').length, cols: document.querySelectorAll('.collab-card .collab-grid .collab-part').length };
// merge both
document.querySelector('.collab-card .collab-actions .msg-act')?.click();
const merged = await until(() => { const m = Native.chatOf(C.id)?.messages.find((x) => x.role === 'collab' && x.mode === 'duo'); return m?.status === 'done' && m.final != null && m; });
out.merge = merged && merged.parts[merged.final].text.slice(0, 60);

// relay, critique, debate, council
for (const [cmd, mode] of [['/relay claude→astra 2 write a haiku', 'relay'], ['/critique astra→claude 1 plan a trip', 'critique'], ['/debate 2 tabs or spaces', 'debate'], ['/council claude,astra,astra@skeptic is AI art art', 'council']]) {
  await Commands.tryRun(cmd, C.id);
  const m = await until(() => { const x = [...Native.chatOf(C.id).messages].reverse().find((y) => y.role === 'collab' && y.mode === mode); return x?.status && x.status !== 'running' && x; }, 30000);
  out[mode] = m && { status: m.status, parts: m.parts.map((p) => `${p.seat}/${p.round}/${p.kind}`).join(' '), final: m.final != null ? m.parts[m.final].text.slice(0, 50) : null, seats: m.seats.map((s) => s.label).join(' × ') };
}
// stop
await Commands.tryRun('/duo SLOW please', C.id);
await sleep(1200);
await Commands.tryRun('/collab-stop', C.id);
const st = await until(() => { const x = [...Native.chatOf(C.id).messages].reverse().find((y) => y.role === 'collab'); return x?.status === 'stopped' && x; }, 10000);
out.stopped = Boolean(st);
// the next message to Claude carries the collab outcome once
out.carry = Boolean(Native.chatOf(C.id).carry);
await Commands.tryRun('/collab-stats', C.id);
out.stats = [...document.querySelectorAll(`.surface[data-id="${C.id}"] .msg.note`)].pop()?.textContent.slice(0, 200);

// composer chip: duo mode, then a typed message
await Commands.tryRun('/collab duo', C.id);
const surf = document.querySelector(`.surface[data-id="${C.id}"]`);
out.chip = surf.querySelector('.collab-chip')?.textContent;
const ta = surf.querySelector('.composer textarea');
ta.value = 'typed in duo mode';
surf.querySelector('form.composer').requestSubmit();
const typed = await until(() => { const x = [...Native.chatOf(C.id).messages].reverse().find((y) => y.role === 'collab'); return x?.task === 'typed in duo mode' && x.status === 'done' && x; });
out.chipDuo = Boolean(typed);
await Commands.tryRun('/collab off', C.id);
// pick
await Commands.tryRun('/pick 2', C.id);
out.picked = [...Native.chatOf(C.id).messages].reverse().find((y) => y.role === 'collab').picked;

// second opinion both ways: from Astra's chat, Claude judges
activate(A.id);
await sleep(200);
Native.secondOpinion(A.id);
const op = await until(() => Native.chatOf(A.id).messages.find((m) => m.role === 'opinion'));
out.opinionFrom = op?.from;
// quick ask
await Commands.tryRun('/ask-claude what is 2+2', A.id);
out.quick = Native.chatOf(A.id).messages.filter((m) => m.role === 'opinion').length;
// handoff Astra -> Claude (raw, no extra turn)
await Commands.tryRun('/handoff claude --raw', A.id);
await sleep(400);
const ho = Native.chatOf(C.id);
out.handoff = ho?.messages[0]?.text.slice(0, 60);
await Commands.tryRun('/astra-status', A.id);
out.status = [...document.querySelectorAll(`.surface[data-id="${A.id}"] .msg.note`)].pop()?.textContent.slice(0, 300);
activate(C.id);
await Commands.tryRun('/duo show me the card', C.id);
await until(() => { const x = [...Native.chatOf(C.id).messages].reverse().find((y) => y.role === 'collab'); return x?.status === 'done'; });
await sleep(400);
return JSON.stringify(out, null, 1);
