// 🧭 Cost coach (round 43): fake usage of the last days (chats saved in the throwaway copy: a long Lab-like chat that
// keeps re-reading, quick asks thought on Deep, long answers) → ⋯ AI setup › Spending › 🧭 Cost coach… opens the card
// with 3 fixes; clicking "Let Smart decide" changes the setting (in config.json too), its Undo puts it back; "Turn on"
// (Continue lighter) then Ctrl/⌘+Z's undo (UndoAll) puts it back; a fix applied is gone from the next look (✓ instead);
// /cost-coach in words; the weekly note through Hints once a week (kv cost-coach); loaded as its own lazy group.
//   node dev/smoke.js --check-timeout 180000 --script dev/checks/costcoach.js --shot /tmp/costcoach.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const toasts = () => [...document.querySelectorAll('#toasts > *')].map((t) => t.textContent).join(' | ');

ok(Lazy.state().some((g) => g.name === 'costcoach'), 'its own lazy group');
await Lazy.load('options'); await Lazy.load('budget'); await Lazy.load('undoall'); await Lazy.load('costcoach');
await until(() => typeof CostCoach !== 'undefined' && typeof UndoAll !== 'undefined');
await UndoAll.ready();
ok(Commands.get('cost-coach') && !Commands.duplicates().some((d) => d.name === 'cost-coach'), '/cost-coach exists once');

const A = H.claudeAgent();
activate(A.id);
await wait(300);
// Claude as the owner might have it: Deep, Continue lighter off, normal answers (saved like ⋯ AI setup would)
const me = H.agent(A.id);
me.effort = 'high'; me.lighterAt = 0; delete me.verbosity;
await saveConfig(); await wait(300);
UndoAll._test.rebase();

// ---------- fake usage: three chats of the last days ----------
const now = Date.now();
function chat(id, { n, base, grow, out: o, think = 0, text, at0 }) {
  const messages = [];
  for (let k = 0; k < n; k++) {
    const at = at0 + k * 8 * 60e3;
    messages.push({ role: 'user', text, at: at - 2000 });
    const i = base + grow * k;
    messages.push({ role: 'assistant', text: 'Done.', at, usage: { input: i, output: o, cached: k ? Math.round((i - grow) * 0.9) : 0, cacheWrite: k ? grow : i }, ...(think ? { thinking: 'x'.repeat(think * 4) } : {}) });
  }
  return { id, agentId: A.id, title: id, created: at0, updated: at0 + n * 8 * 60e3, messages };
}
const chats = [
  chat('cc-long-scene', { n: 22, base: 3000, grow: 3000, out: 900, text: 'make the orb pinker and slower', at0: now - 2 * 864e5 }),
  chat('cc-quick-asks', { n: 30, base: 1500, grow: 300, out: 4000, think: 2500, text: 'what bpm suits this?', at0: now - 864e5 }),
  chat('cc-long-answers', { n: 20, base: 1500, grow: 500, out: 9000, think: 500, text: 'explain how bloom works in three.js and when to use it', at0: now - 3 * 864e5 }),
];
for (const c of chats) await window.hub.saveChat(c);
const scanned = await until(async () => { const s = await window.hub.costCoachScan({ days: 7 }); return s.records.filter((r) => r.chat.startsWith('cc-')).length >= 72 ? s : null; }, 15000);
ok(scanned, 'the scan reads the saved chats (main side, lazy IPC)');
out.records = scanned?.records.length;

// ---------- ⋯ AI setup › Spending › 🧭 Cost coach… ----------
Options.open({ agentId: A.id, show: 'spending' });
const line = await until(() => document.querySelector('.opt-sheet .cc-open'));
ok(line, 'a Cost coach line in ⋯ AI setup › Spending');
line?.click();
const card = await until(() => { const d = document.querySelector('dialog.cc-dlg[open]'); return d && d.querySelectorAll('.cc-fix').length ? d : null; }, 30000);
const fixes = () => [...(card?.querySelectorAll('.cc-fix') || [])];
out.fixes = fixes().map((f) => f.textContent);
ok(fixes().length === 3, `the card shows 3 fixes (${JSON.stringify(out.fixes)})`);
ok(out.fixes.some((t) => /Continue lighter at 40k would have saved/.test(t) && /Turn on/.test(t)), 'Continue lighter: Turn on');
ok(out.fixes.some((t) => /thinks on Deep for quick questions/.test(t) && /Let Smart decide/.test(t)), 'Deep for quick questions: Let Smart decide');
ok(out.fixes.some((t) => /Short answers would have saved/.test(t) && /Make answers short/.test(t)), 'Short answers');
ok(out.fixes.every((t) => /saved ≈ [\d.]+[kM]?/.test(t) && /% of the week/.test(t)), 'each fix says its saving over the week');
out.where = card?.querySelector('.cc-where')?.textContent.slice(0, 300);
ok(/By kind of chat/.test(out.where || '') && /Re-reading long chats/.test(out.where || ''), `where it went (${out.where})`);

// ---------- one click changes the setting; Undo puts it back ----------
const smartRow = fixes().find((f) => /Let Smart decide/.test(f.textContent));
smartRow?.querySelector('.cc-go')?.click();
ok(await until(() => H.agent(A.id).effort === undefined), 'Let Smart decide: Claude is on Smart');
const cfg = await until(async () => { const c = (await window.hub.getConfig()).config; return c.agents.find((a) => a.id === A.id).effort === undefined ? c : null; });
ok(cfg, 'saved in config.json');
ok(await until(() => /Done: let smart decide/i.test(toasts())), `a toast with Undo (${toasts()})`);
out.undoTop = UndoAll.list().at(-1)?.label;
ok(/Claude thinks: Smart/.test(out.undoTop || ''), `in the app's undo log (${out.undoTop})`);
const undoBtn = await until(() => smartRow.querySelector('.cc-undo'));
undoBtn?.click();
ok(await until(() => H.agent(A.id).effort === 'high'), 'Undo: back on Deep');
await until(() => !smartRow.querySelector('.cc-undo')); // the undo has finished (its save answered), like a person's next click

// Continue lighter: Turn on, then the app's own undo (what Ctrl/⌘+Z runs)
const lighterRow = fixes().find((f) => /Continue lighter/.test(f.textContent));
lighterRow?.querySelector('.cc-go')?.click();
ok(await until(() => H.agent(A.id).lighterAt === undefined), 'Turn on: Continue lighter at the default 40k');
const u = await UndoAll.undo(null, { quietToast: true });
ok(u.ok && H.agent(A.id).lighterAt === 0, `Ctrl/⌘+Z (UndoAll) puts it back (${JSON.stringify(u)})`);
card?.close();
await wait(300);

// ---------- applied → gone from the next look, a ✓ instead ----------
lighterRow?.querySelector('.cc-go') && (lighterRow.querySelector('.cc-go').disabled = false);
const f = (await CostCoach.compute({ fresh: true })).fixes.find((x) => x.kind === 'short');
await CostCoach.apply(f);
const after = await CostCoach.compute({ fresh: true });
ok(H.agent(A.id).verbosity === 'low' && !after.fixes.some((x) => x.kind === 'short') && after.lean.some((l) => /short answers ✓/.test(l.text)), 'Short applied: no fix next time, a ✓');

// ---------- in words ----------
out.cmd = await Commands.get('cost-coach').run('', { agentId: A.id });
ok(/Cost coach, last 7 days/.test(out.cmd) && /1\. /.test(out.cmd), `/cost-coach (${String(out.cmd).slice(0, 200)})`);

// ---------- the weekly note: once a week, through Hints ----------
Options.hide();
for (const d of document.querySelectorAll('dialog[open]')) d.close();
await wait(400);
for (const t of document.querySelectorAll('#toasts > *')) t.remove();
out.busy = window.Hints?.busy?.() || '';
const w1 = await Promise.race([CostCoach.weekly(), wait(30000).then(() => ({ hung: true, busy: window.Hints?.busy?.() }))]);
out.weekly = w1;
ok(w1.shown === true && /Cost coach: .* would have saved/.test(w1.text || ''), `the weekly note shows (${JSON.stringify(w1)})`);
ok(/See the fixes/.test(toasts()), 'the note offers "See the fixes"');
const w2 = await Promise.race([CostCoach.weekly(), wait(20000).then(() => ({ hung: true }))]);
ok(w2.skipped === 'noted', `only once a week (${JSON.stringify(w2)})`);
const kv = await until(async () => { const v = await window.hub.kvGet('cost-coach', null); return v && Object.keys(v.noted || {}).length ? v : null; });
ok(kv && kv.applied?.length >= 1, `its own store on disk (${JSON.stringify(kv)})`);

me.effort = 'high'; delete me.verbosity; await saveConfig();
await CostCoach.open(); // left open for the --shot picture
return JSON.stringify({ pass: problems.length === 0, problems, out }, null, 1);
