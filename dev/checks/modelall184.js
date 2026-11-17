// (round 184, modelall184) /model-all: every Claude chat on one model (throwaway data).
//   1. the Claude agents get the model as their default; a Claude chat that had its own model follows it again;
//      an Astra chat and the Astra agent are left alone; a chat with no model of its own isn't touched
//   2. what they used before is kept, and /model-all undo puts it back
//   3. the one-time switch to Fable 5.2 doesn't run under the checks, and runs once when asked
//   node dev/smoke.js --fake-engines --script dev/checks/modelall184.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 400)})`); return Boolean(c); };
try {
  await until(() => typeof ChatCmds !== 'undefined' && ChatCmds.modelAll, 20000);
  ok(typeof ChatCmds.modelAll === 'function' && Commands.get('model-all'), '/model-all is there');
  const claude = H.claudeAgent();
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  H.agent(claude.id).model = 'claude-opus-5-5'; if (astra) H.agent(astra.id).model = 'gpt-6-astra';
  await saveConfig();
  const now = Date.now();
  const mk = (id, agentId, model, extra = {}) => window.hub.saveChat({ id, agentId, title: id, updatedAt: now, messages: [{ role: 'user', text: 'hello', at: now }, { role: 'assistant', text: 'hi', at: now }], ...(model ? { model } : {}), ...extra });
  await mk('ma-own', claude.id, 'sonnet');
  await mk('ma-plain', claude.id, '');
  if (astra) await mk('ma-astra', astra.id, 'gpt-6-luna');
  H.chats = await window.hub.listChats();
  const sum = (id) => H.chats.find((c) => c.id === id);
  ok(sum('ma-own')?.model === 'sonnet' && !sum('ma-plain')?.model, 'the chats are there, one with its own model', H.chats.filter((c) => /^ma-/.test(c.id)).map((c) => [c.id, c.model]));
  ok(H.settings().modelSweep === undefined, 'the one-time switch did not run by itself under the checks', H.settings().modelSweep);

  // ---------- 1. every Claude chat on one model ----------
  const r = await ChatCmds.modelAll('claude-fable-5-2', { quiet: true });
  out.info.text = r.text;
  ok(r.ok && r.agents >= 1 && H.agent(claude.id).model === 'claude-fable-5-2', 'the Claude agents\' default is the model', { r, model: H.agent(claude.id).model });
  ok(H.agents().filter((a) => a.mode === 'native' && a.engine === 'claude').every((a) => a.model === 'claude-fable-5-2'), 'every Claude agent');
  await until(async () => { H.chats = await window.hub.listChats(); return !sum('ma-own')?.model; }, 8000, 300);
  ok(!sum('ma-own')?.model, 'a Claude chat that had its own model follows the default again', sum('ma-own'));
  ok(!sum('ma-plain')?.model, 'a chat with no model of its own is not touched');
  if (astra) ok(sum('ma-astra')?.model === 'gpt-6-luna' && H.agent(astra.id).model === 'gpt-6-astra', 'Astra and its chats are left alone', [sum('ma-astra')?.model, H.agent(astra.id).model]);
  const kv = await window.hub.kvGet('model-sweep', null);
  ok(kv?.model === 'claude-fable-5-2' && kv.agents[claude.id] === 'claude-opus-5-5' && kv.chats['ma-own'] === 'sonnet', 'what they used before is kept', kv);
  const again = await ChatCmds.modelAll('claude-fable-5-2', { quiet: true });
  ok(again.agents === 0 && again.chats === 0 && /already uses/.test(again.text), 'a second time changes nothing', again);
  const kv2 = await window.hub.kvGet('model-sweep', null);
  ok(kv2.agents[claude.id] === 'claude-opus-5-5', 'and does not forget what to put back');

  // ---------- 2. undo ----------
  const u = await ChatCmds.modelUndo();
  await until(async () => { H.chats = await window.hub.listChats(); return sum('ma-own')?.model === 'sonnet'; }, 8000, 300);
  ok(u.ok && H.agent(claude.id).model === 'claude-opus-5-5' && sum('ma-own')?.model === 'sonnet', '/model-all undo puts back the agents\' and the chats\' models', { u, agent: H.agent(claude.id).model, chat: sum('ma-own')?.model });
  ok((await ChatCmds.modelUndo()).ok === false, 'nothing more to put back');

  // ---------- 3. the one-time switch ----------
  const once = await ChatCmds.modelOnce();
  ok(once?.ok && H.settings().modelSweep === 'fable-5-2' && H.agent(claude.id).model === 'claude-fable-5-2', 'asked once: the current chats go to Fable 5.2 and the mark is set', { once, mark: H.settings().modelSweep });
  H.agent(claude.id).model = 'claude-opus-5-5'; await saveConfig(); await wait(600);
  ok((await ChatCmds.modelOnce()) === null && H.agent(claude.id).model === 'claude-opus-5-5', 'it never runs a second time (a model the owner picks afterwards stays)');
  const cmd = await Commands.get('model-all').run('', {});
  ok(/Say which model/.test(cmd), 'the command with no model says how to use it', cmd);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
