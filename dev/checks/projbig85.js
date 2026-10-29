// opt-in: PROJBIG85
// (round 85, projbig85) A project holding a GIANT chat (6,000 messages, ≈ 63 MB: dev/bigchat84-fixture.js, project
// "Clink") exported, imported and duplicated, and a giant earlier version previewed, in the app. Measured for each step:
// the window's longest task (PerformanceObserver longtask) and the main process's busy stretches (mainlag-probe.js,
// HEARTH_LOOPLAG=prof). And that nothing changed in what you get:
//   export_card   ⇪ Export project… until its card shows (what goes, the chats and their size)
//   export        Export… until the .hearthproject is written (the files left out: the chats are what's measured)
//   import_card   ⇩ Import project… of that file until its card says what it will add (6,000+ messages)
//   import        Import as a new project until it's in the list: a NEW giant chat there, 6,000 messages, the same
//                 last message as the original
//   duplicate     ⧉ Duplicate project: the copy's giant chat, 6,000 messages
//   preview       Earlier versions › Preview of the kept version (10 messages fewer): its count and its last messages
// The Lab is started first (backstage): its own first start is a few long tasks that have nothing to do with the chat.
// window.PB_REPORT = 1: report without failing (the code before this round: the same steps, its numbers) · window.PB_PROF
// = 1: each step's heaviest window functions (a CPU profile through the DevTools protocol)
//   node dev/bigchat84-fixture.js /tmp/hearth-bigchat84
//   HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat84 --wait 1000 --check-timeout 1500000 --script dev/checks/projbig85.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, n = 400) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const r0 = (x) => Math.round(x);
const out = { problems: [] };
const BUDGET = Object.assign({ task: 60, mainBlock: 100, import: 150, duplicate: 100 }, window.PB_BUDGET || {}); // ms (the aim is < 50; a shared 4-CPU box adds a few ms to a task). import / duplicate: the new project opened (its Lab scene shown, its chat drawn: three.js openSketch, native render) and its 5 scenes added are 50–120 ms tasks, there before this round too (PB_PROF); the giant chat adds none
const lag = (label) => window.hub.power?.test?.({ lag: { label } });
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
const longsSince = (t) => longs.filter((x) => x.at >= t).map((x) => x.ms).sort((a, b) => b - a);
const mainOf = (r) => (r?.delay ? { max: r.delay.max, blocks: (r.blocks || []).map((b) => `${b.ms}ms ${(b.app || []).slice(0, 2).join(' | ')}`).slice(0, 4) } : null);
const blocksOver = (r, ms) => (r?.blocks || []).filter((b) => b.ms >= ms);
async function step(name, fn, { taskBudget = BUDGET.task } = {}) {
  await lag(`before-${name}`);
  const prof = window.PB_PROF && (await smoke({ cdp: 'Profiler.enable' }), await smoke({ cdp: 'Profiler.setSamplingInterval', params: { interval: 500 } }), await smoke({ cdp: 'Profiler.start' }), true);
  const t = performance.now();
  const res = await fn();
  const ms = r0(performance.now() - t);
  await wait(1500);
  const l = await lag(name);
  const s = { ms, windowLong: longsSince(t).slice(0, 6), main: mainOf(l) };
  if (prof) { // (window.PB_PROF = 1) the window's heaviest functions during the step (self time)
    const p = (await smoke({ cdp: 'Profiler.stop' }))?.profile;
    if (p) {
      const by = new Map(p.nodes.map((n) => [n.id, n])); const self = new Map();
      for (let i = 0; i < p.samples.length; i++) { const n = by.get(p.samples[i]); const f = n.callFrame; if (/^\((idle|program)\)$/.test(f.functionName)) continue; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0) / 1000); }
      s.windowTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${r0(v)}ms ${k}`);
      // and by app function, with what it called (inclusive)
      const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const incl = new Map();
      for (let i = 0; i < p.samples.length; i++) {
        const seen = new Set();
        for (let id = p.samples[i]; id != null; id = parent.get(id)) { const f = by.get(id).callFrame; if (!/\.js$/.test(f.url)) continue; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + (p.timeDeltas[i] || 0) / 1000); } }
      }
      s.windowIncl = [...incl].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => `${r0(v)}ms ${k}`);
    }
  }
  out[name] = Object.assign(s, res && typeof res === 'object' ? res : {});
  if ((s.windowLong[0] || 0) > taskBudget) out.problems.push(`${name}: the window held ${s.windowLong[0]} ms in one task (budget ${taskBudget})`);
  if (blocksOver(l, BUDGET.mainBlock).length) out.problems.push(`${name} held the main process: ${s.main.blocks.join('; ')}`);
  return s;
}
const card = () => document.querySelector('dialog.pb-card[open]');
const GIANT = 'claude-giant0';

await until(() => document.querySelector('#panel .item'), 600);
await wait(5000);
if (!(await lag('boot'))?.delay) out.problems.push('the main lag probe is off (HEARTH_LOOPLAG)');
const giantTitle = (H.chats || []).find((c) => c.id === GIANT)?.title;
if (!giantTitle) { out.problems.push('the giant chat is not in the list'); return JSON.stringify(out); }
await Lazy.load('projects'); await Projects.ready();
await Lazy.load('projbundle');
const P = Projects;
const p = P.all().find((x) => x.name === 'Clink');
if (!p || !p.items.some((x) => x.type === 'chat' && x.ref === GIANT)) { out.problems.push('project Clink with the giant chat is not there'); return JSON.stringify(out); }
await wait(3000);
const chatsWith = async (title) => (await window.hub.listChats()).filter((c) => c.title === title && c.id !== GIANT).map((c) => c.id);
const before = new Set(await chatsWith(giantTitle));
// a chat's messages: its count and last text, read in the window's parse worker (after the measures)
const facts = async (id) => { const c = await Native.load(id); const r = { n: c?.messages?.length ?? null, last: c?.messages?.at(-1)?.text?.slice(0, 80) ?? null }; return r; };

// ---------- Export ----------
let job = null;
await step('export_card', async () => {
  job = ProjBundle.exportProject(p);
  const c = await until(() => card()?.querySelector('.pb-go') && card(), 3000);
  return { card: Boolean(c), chats: c?.querySelector('.pb-chats')?.parentElement.textContent || null };
});
if (!out.export_card.card) { out.problems.push('export: no card'); return JSON.stringify(out); }
if (!/\d+ chats? · \d/.test(out.export_card.chats || '')) out.problems.push(`export card: ${out.export_card.chats}`);
await step('export', async () => {
  const c = card();
  const files = c.querySelector('.pb-files'); if (files && files.checked) files.click(); // (its files left out: the chats are what's measured)
  if (!c.querySelector('.pb-chats').checked) c.querySelector('.pb-chats').click();
  c.querySelector('.pb-go').click();
  const r = await job;
  return { ok: Boolean(r?.ok), path: r?.path || null, size: r?.size || 0 };
});
if (!out.export.ok) { out.problems.push(`export: ${JSON.stringify(out.export)}`); return JSON.stringify(out); }

// ---------- Import ----------
// (the Lab started first, backstage: the import adds the project's 5 scenes to it, and the Lab's own first start, its
// three.js and media pieces, is a few long tasks of its own that have nothing to do with the giant chat)
await Lazy.load('lab'); await ThreeLab.cmd({ show: false }); await until(() => ThreeLab.scenes?.adoptScene, 200); await wait(4000);
await step('import_card', async () => {
  job = ProjBundle.importProject(out.export.path);
  const c = await until(() => card()?.querySelector('.pb-adds') && card(), 3000);
  return { card: Boolean(c), adds: [...(c?.querySelectorAll('.pb-adds li') || [])].map((x) => x.textContent).slice(0, 3) };
});
if (!out.import_card.card) { out.problems.push('import: no card'); return JSON.stringify(out); }
if (!out.import_card.adds.some((l) => /\d+ chats? \(\d[\d,]* messages\)/.test(l) && Number(/\((\d+) messages/.exec(l)?.[1]) >= 6000)) out.problems.push(`import card: ${JSON.stringify(out.import_card.adds)}`);
await step('import', async () => {
  card().querySelector('.pb-go').click();
  const r = await job;
  return { ok: Boolean(r?.id), project: r?.id || null, skipped: ProjBundle.last.skipped.length };
}, { taskBudget: BUDGET.import });
const imported = (await chatsWith(giantTitle)).filter((id) => !before.has(id));
out.import.copies = imported.length;
if (!out.import.ok || imported.length !== 1) out.problems.push(`import: ${JSON.stringify(out.import)}`);
const orig = await facts(GIANT);
if (imported[0]) { const f = await facts(imported[0]); out.import.chat = f; if (f.n !== orig.n || f.last !== orig.last || orig.n !== 6000) out.problems.push(`import: the giant chat came in as ${JSON.stringify(f)} (original ${JSON.stringify(orig)})`); }
for (const id of imported) Native.forget?.(id);

// ---------- Duplicate ----------
const seen = new Set(await chatsWith(giantTitle));
await step('duplicate', async () => { const r = await ProjBundle.duplicateProject(P.get(p.id)); return { ok: Boolean(r?.id) }; }, { taskBudget: BUDGET.duplicate });
const dup = (await chatsWith(giantTitle)).filter((id) => !seen.has(id));
out.duplicate.copies = dup.length;
if (!out.duplicate.ok || dup.length !== 1) out.problems.push(`duplicate: ${JSON.stringify(out.duplicate)}`);
if (dup[0]) { const f = await facts(dup[0]); out.duplicate.chat = f; if (f.n !== orig.n || f.last !== orig.last) out.problems.push(`duplicate: the giant chat copy is ${JSON.stringify(f)}`); }
for (const id of dup) Native.forget?.(id);

// ---------- Earlier versions › Preview of a giant version ----------
if (typeof Versions === 'undefined' && window.Lazy?.load) await Lazy.load('versions');
const S = { kind: 'chat', id: GIANT, name: giantTitle };
const listed = await window.hub.versions.list(S, { phase: 'local' });
const kept = (listed?.versions || []).find((e) => e.src === 'before');
if (!kept) out.problems.push('preview: the kept version is not listed');
else {
  await wait(1500);
  await step('preview', async () => {
    Versions.preview(S, kept);
    const d = await until(() => document.querySelectorAll('dialog.vs-pv[open] .vs-msg').length >= 300 && document.querySelector('dialog.vs-pv[open]'), 1500); // (drawn in parts)
    await wait(300);
    const msgs = [...(d?.querySelectorAll('.vs-msg') || [])];
    return { shown: msgs.length, hint: d?.querySelector('.vs-preview .hint')?.textContent || null, last: msgs.at(-1)?.lastChild?.textContent?.slice(0, 80) ?? null };
  });
  const want = (await Native.load(GIANT))?.messages?.at(-11)?.text?.slice(0, 4000).slice(0, 80);
  if (!/5,?990 messages/.test(out.preview.hint || '') || out.preview.shown < 300 || out.preview.last !== want) out.problems.push(`preview: ${JSON.stringify({ hint: out.preview.hint, shown: out.preview.shown, last: out.preview.last, want })}`);
  document.querySelector('dialog.vs-pv[open]')?.close();
}

if (window.PB_REPORT) out.problems.length = 0;
return JSON.stringify(out);
