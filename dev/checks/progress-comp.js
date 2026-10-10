// Progress bars on a /dispatch (round 11): the main director chat dispatches two parts (Claude and Astra, fake engines
// building through the real MCP tools); the comp gets one bar (the mean of its parts) on the card's head and in the
// rail list, each part's reply gets its own bar on its row of the card (and on its own chat row), all move forward
// only, the comp finishes when both parts are done, and nothing is left on screen afterwards.
//   node dev/smoke.js --fake-engines --script dev/checks/progress-comp.js --wait 6000 --check-timeout 900000 --shot /tmp/progress-comp.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const seen = {};
Progress.on((it, what) => { (seen[it.key] ||= []).push({ v: Math.round(it.shown * 10) / 10, st: it.state, what, n: Progress.children(it.key).length }); });
const forward = (key) => { const s = (seen[key] || []).map((x) => x.v); return s.length > 1 && s.every((v, i) => !i || v >= s[i - 1]); };
try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director);
  await wait(800);
  Native.newChat(agent.id);
  await wait(1200);
  await Native.send(agent.id, 'comp: dispatch embers gathering into a red field | astra: a blue field that holds');
  await until(() => CompDispatch.cards().at(-1)?.parts?.length === 2, 90000);
  const m = CompDispatch.cards().at(-1);
  const ck = `comp:${m.id}`;
  out.parts = m.parts.map((p) => `${p.n} ${p.engine} ${p.state}`);
  ok(await until(() => Progress.get(ck), 10000), 'the comp has a progress item');
  await until(() => Progress.children(ck).length === 2, 10000);
  out.children = Progress.children(ck).map((c) => c.key);
  ok(out.children.length === 2, `each part's reply is a child of the comp (${out.children})`);
  ok(await until(() => document.querySelector(`.comp-card[data-cid="${m.id}"] > .comp-head > .pg-bar`), 10000), 'a bar on the comp card\'s head');
  out.rowBars = document.querySelectorAll(`.comp-card[data-cid="${m.id}"] .comp-row > .pg-bar`).length;
  ok(out.rowBars >= 1, `bars on the parts' rows (${out.rowBars})`);
  ok(m.parts.every((p) => document.querySelector(`#chat-groups .item[data-key="${p.chatId}"] > .pg-bar`) || Progress.get(`chat:${p.chatId}`)?.state === 'done'), 'each part\'s chat row has a bar while it works');
  ProgressUI.open(); await wait(400);
  out.list = [...document.querySelectorAll('.pg-pop .pg-row')].map((r) => `${r.classList.contains('pg-child') ? '  ' : ''}${r.querySelector('.pg-t')?.textContent}`);
  ok(out.list.some((t) => /Comp/.test(t)) && out.list.filter((t) => t.startsWith('  ')).length === 2, `the rail list shows the comp with its two parts under it (${out.list})`);
  try { await smoke({ shot: '/tmp/hearth-checks/progress-comp-list.png' }); } catch { /* optional */ }
  ProgressUI.close();
  await until(() => m.parts.every((p) => p.state === 'done' || p.state === 'stuck' || p.state === 'waiting'), 600000);
  out.partsEnd = m.parts.map((p) => `${p.n} ${p.state}`);
  await wait(500);
  const cs = seen[ck] || [];
  out.comp = cs.map((x) => `${Math.round(x.v)}${x.st === 'done' ? '✓' : ''}`).join(' ');
  ok(forward(ck), `the comp's bar only moved forward (${out.comp})`);
  ok(cs.some((x) => x.st === 'done'), 'the comp finished when its parts did');
  ok(out.children.every((k) => (seen[k] || []).some((x) => x.st === 'done')) && out.children.every(forward), 'each part finished, forward only');
  await until(() => !Progress.list().length, 8000);
  ok(!document.querySelector(`.comp-card .pg-bar`), 'no bar left on the card');
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
