// (round 33, swarmlean) Runs each ◎ mission once on a typical request in a chat that already has a few exchanges, and
// returns the time window of each one, so dev/mission-tokens.js can add up what the fake engines were sent in it
// (FAKE_TOKEN_LOG). Run it through that script: node dev/mission-tokens.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const C = H.claudeAgent();
const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const askAllWas = new Map(H.agents().map((a) => [a, a.askAll]));
for (const a of H.agents()) if (a !== C && a !== A) a.askAll = false;
const windows = {}; const notes = {}; const estimates = {};
const HISTORY = [
  'I am making a 30 second intro video for my app Hearth, 9:16 for Shorts. Help me plan the shots in a table.',
  'Nice. The music is a 124 bpm house track; which shots should land on the drop at 0:16?',
  'Make the palette pink, cyan and dusk. What should the title card say?',
];
const REQUEST = 'Suggest three ways to make the hook in the first two seconds stronger, and say which one you would pick.';
const ONLY = (window.__missionTokensOnly || '').split(',').filter(Boolean);
const MISSIONS = ['normal', 'split', 'plan', 'teach', 'review', 'swarm', 'debate', 'duo', 'other', 'research', 'everyone'].filter((m) => !ONLY.length || ONLY.includes(m));
try {
  activate(C.id); await until(() => Native.hasView(C.id));
  activate(A.id); await until(() => Native.hasView(A.id));
  const vC = Native.view(C.id); const vA = Native.view(A.id);
  const type = async (v, t) => { const i = v.root.querySelector('textarea'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); v.root.querySelector('form.composer').requestSubmit(); await wait(250); };
  const busy = () => Native.isAgentBusy(C.id) || Native.isAgentBusy(A.id) || Astra._test.live.size || Missions._live.size;
  const idle = async () => { await wait(400); await until(() => !busy(), 90000); await wait(500); };
  const history = async (agentId, v) => {
    Native.newChat(agentId); await wait(150);
    for (const h of HISTORY) { await type(v, h); await idle(); }
  };
  for (const id of MISSIONS) {
    activate(A.id); await history(A.id, vA); // Astra has a chat of its own open (Ask everyone sends into it)
    activate(C.id); await history(C.id, vC);
    estimates[id] = typeof SwarmLean !== 'undefined' ? SwarmLean.estimate(C.id, id) : null;
    const t0 = Date.now();
    Missions.set(C.id, id);
    await type(vC, REQUEST);
    await idle();
    if (id === 'everyone') await until(() => Native.current(C.id)?.messages.find((m) => m.kind === 'everyone')?.rows.every((r) => r.status !== 'thinking'), 30000);
    if (id === 'review') await until(() => Native.current(C.id)?.messages.some((m) => m.role === 'opinion'), 30000);
    await idle();
    windows[id] = [t0, Date.now()];
    const chat = Native.current(C.id);
    const last = chat.messages.at(-1);
    notes[id] = { last: last?.role, ctx: last?.ctx ? last.ctx.length : null, text: String(last?.text || '').length, carry: String(chat.carry || '').length };
    // the next normal message: what the mission's result costs the chat afterwards (the carried outcome)
    const t1 = Date.now();
    Missions.set(C.id, 'normal');
    await type(vC, 'Go with your pick and write the hook line.');
    await idle();
    windows[`${id}:next`] = [t1, Date.now()];
  }
} finally {
  for (const [a, v] of askAllWas) a.askAll = v;
}
return JSON.stringify({ windows, notes, estimates });
