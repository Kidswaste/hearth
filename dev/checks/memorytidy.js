// (round 38, memorytidy) ⋯ AI setup → Memory: the one-line nudge once memory is big; Tidy memory… shows the proposed
// cleanup as a before / after list (merge, update, move to the Lab, drop), sure changes ticked; ✦ Smarter tidy shows its
// token cost before it runs, then asks the fake engine (it answers "N = shorter wording"); Apply changes memory.json,
// the toast's Undo puts it back; the Lab fact moved to the Lab scope reaches only the Three Director's prompt (the
// prompt parts the engine gets, and a real fake-Claude run with "promptinfo"); a <remember> the AI says twice is kept
// once; /tidy-memory opens the dialog.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/memorytidy.js --shot /tmp/memorytidy.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const S = () => document.querySelector('aside.opt-sheet');
const D = () => document.querySelector('dialog.memtidy[open]');
const sysOf = (m) => (/system<<<([\s\S]*?)>>>/.exec(m?.text || '') || [])[1] ?? null;
const DAY = 864e5;
try {
  if (window.Lazy?.load) await Lazy.load('options').catch(() => {});
  ok(await until(() => typeof MemoryTidy !== 'undefined' && typeof MemoryTidyCore !== 'undefined'), 'memorytidy.js loads with AI setup (options group), the core at start');
  ok(Commands.get('tidy-memory') && !Commands.duplicates().some((d) => d.name === 'tidy-memory'), '/tidy-memory exists, no duplicate');
  const C = H.claudeAgent();
  if (!H.agent('threedirector')) { H.config.agents.push({ id: 'threedirector', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true }); await saveConfig(); await wait(400); }
  const DIR = H.agent('threedirector');
  const keepAuto = C.autoMemory;

  // 1. a big memory: the Memory fold's summary says it once, in one line
  const filler = Array.from({ length: 45 }, (_, i) => `- Fact number ${i + 1}: the owner tunes scene ${i + 1} with care and keeps notes about it for later`).join('\n');
  await window.hub.saveMemory({ shared: filler, agents: {} });
  Options.open({ agentId: C.id });
  const mf = await until(() => S()?.querySelector('details[data-fold="memory"]'));
  const sum = await until(() => { const t = mf?.querySelector(':scope > summary .opt-sum')?.textContent || ''; return /tokens of memory: Tidy memory could shrink it/.test(t) ? t : null; });
  out.summary = sum || mf?.querySelector(':scope > summary .opt-sum')?.textContent;
  ok(sum && sum.split('\n').length === 1, `a big memory: one nudge line in the Memory fold (“${out.summary}”)`);
  S()?.querySelector('.opt-head button[title^="Close"]')?.click();
  await wait(200);

  // 2. a small, untidy memory (dates as Hearth keeps them: memory-meta)
  const MEM = {
    shared: ['- Prefers short answers', '- Uses a Mac', '- Keep bloom subtle in Lab scenes', '- The user really prefers it when the responses are short.', '- Call me Sam'].join('\n'),
    agents: { [C.id]: ['- Prefers short answers', '- Now uses Windows', '- Working on the Ember Tide video this week'].join('\n') },
  };
  await window.hub.saveMemory(MEM);
  // (the memory editor holds the details: memory.js stamps a fact's date when the AI saves it)
  Object.assign(await MemoryEditor.metaFacts(), { 'shared|Uses a Mac': { added: Date.now() - 60 * DAY }, [`${C.id}|Now uses Windows`]: { added: Date.now() - 2 * DAY }, [`${C.id}|Working on the Ember Tide video this week`]: { added: Date.now() - 30 * DAY } });
  Options.open({ agentId: C.id, show: 'memory' });
  const fold = await until(() => S()?.querySelector('details[data-fold="memory"][open]'));
  ok(!/Tidy memory could/.test(fold?.querySelector(':scope > summary .opt-sum')?.textContent || 'x'), 'a small memory: no nudge');
  const tidyBtn = await until(() => [...(fold?.querySelectorAll('button') || [])].find((b) => b.textContent === 'Tidy memory…'));
  ok(tidyBtn, 'Memory fold: a “Tidy memory…” button next to What it remembers…');
  tidyBtn?.click();
  const d = await until(() => D()?.querySelector('.mt-row') && D());
  ok(d, 'Tidy memory opens: a list of proposed changes');
  const rows = [...(d?.querySelectorAll('.mt-row') || [])].map((r) => ({ kind: r.dataset.kind, on: r.querySelector('input').checked, text: r.querySelector('.mt-body').textContent }));
  out.rows = rows.map((r) => `${r.on ? '☑' : '☐'} ${r.kind}: ${r.text.slice(0, 120)}`);
  ok(rows.some((r) => r.kind === 'merge' && r.on && /Prefers short answers/.test(r.text)), 'the same fact twice: a ticked merge');
  ok(rows.some((r) => r.kind === 'update' && r.on && /Uses a Mac/.test(r.text) && /→ Now uses Windows/.test(r.text)), 'Mac → Windows: a ticked update, the newest wins');
  ok(rows.some((r) => r.kind === 'move' && r.on && /bloom/.test(r.text) && /Lab only/.test(r.text)), 'the Lab fact: a ticked move to the Lab scope');
  ok(rows.some((r) => r.kind === 'drop' && r.on && /Ember Tide/.test(r.text)), 'a month-old “this week” fact: a ticked drop');
  ok(!rows.some((r) => /Call me Sam/.test(r.text)), 'a good fact is left alone');
  out.head = d?.querySelector('.mt-head')?.textContent; out.per = d?.querySelector('.mt-per')?.textContent;
  ok(/→/.test(out.head || '') && /Claude ≈ \d+ → \d+/.test(out.per || ''), `before → after shown (“${out.head}” · “${out.per}”)`);
  const memBefore = await window.hub.getMemory();
  ok(memBefore.shared === MEM.shared, 'nothing changed before Apply');

  // 3. ✦ Smarter tidy: the cost first, then one fake cheap run
  const smart = d?.querySelector('.mt-smart');
  out.smart = smart?.textContent; out.smartTip = smart?.title;
  ok(/≈ [\d.,k]+ tokens once/.test(smart?.textContent || '') && /lightest model \(haiku/.test(smart?.title || ''), `Smarter tidy shows its cost before it runs (“${out.smart}”)`);
  // a long fact the rules leave as it is, for the fake engine to shorten
  // (the fake answers "N = first five words" for every fact over 8 words)
  await window.hub.saveMemory({ ...MEM, agents: { [C.id]: `${MEM.agents[C.id]}\n- Likes scenes that open slowly with soft light and a calm drift before the drop` } });
  d.close(); await wait(200);
  await MemoryTidy.open({ agentId: C.id });
  const d2 = await until(() => D()?.querySelector('.mt-smart') && D());
  const n0 = d2.querySelectorAll('.mt-row').length;
  d2.querySelector('.mt-smart').click();
  const note = await until(() => /AI/.test(d2.querySelector('.mt-smart-note')?.textContent || '') && d2.querySelector('.mt-smart-note').textContent, 30000);
  out.smartNote = note;
  ok(note && d2.querySelectorAll('.mt-row').length > n0 && d2.querySelector('.mt-row.mt-ai'), `Smarter tidy adds the AI's suggestions to the list (“${note}”)`);
  const aiRow = d2.querySelector('.mt-row.mt-ai');
  ok(/Likes scenes that open slowly with soft light/.test(aiRow?.querySelector('.mt-before')?.textContent || '') && (aiRow?.querySelector('.mt-after')?.textContent || '').trim() === '→ Likes scenes that open slowly' && aiRow.querySelector('input').checked, 'the AI row: the long fact, shorter, ticked');
  await smoke({ shot: '/tmp/memorytidy-dialog.png' }).catch(() => {});

  // 4. Apply → memory changed; the toast's Undo → back
  [...d2.querySelectorAll('.dialog-actions button')].find((b) => /^Apply \d+ change/.test(b.textContent))?.click();
  await until(() => !D());
  const after = await until(async () => { const m = await window.hub.getMemory(); return m.places?.lab ? m : null; });
  out.after = after;
  ok(after && /Keep bloom subtle/.test(after.places.lab) && !/bloom/.test(after.shared), 'applied: the Lab fact is in the Lab scope only');
  ok(after && /Now uses Windows/.test(after.shared) && !/Uses a Mac/.test(after.shared) && (JSON.stringify(after).match(/Prefers short answers/g) || []).length === 1, 'applied: one “short answers”, the newest OS, for everyone');
  ok(after && !/Ember Tide/.test(JSON.stringify(after)) && /^- Likes scenes that open slowly$/m.test(after.agents[C.id]), 'applied: the stale fact gone, the AI\'s shorter wording in');
  const toastEl = await until(() => [...document.querySelectorAll('#toasts > *')].find((t) => /Memory tidied/.test(t.textContent)));
  out.toast = toastEl?.textContent;
  ok(toastEl && /→/.test(toastEl.textContent), `a toast says what it saved, with Undo (“${out.toast}”)`);

  // 5. the scoped fact only in the director's prompt (the parts the engine gets, and a real run)
  const partsOf = async (a) => (await window.hub.tokenAudit(JSON.parse(JSON.stringify(a)))).parts;
  const memPart = (parts) => (parts.find(([k]) => k === 'memory') || [])[1] || '';
  const dp = memPart(await partsOf(DIR)); const cp = memPart(await partsOf(H.agent(C.id)));
  out.prompts = { director: dp, claude: cp };
  ok(/Keep bloom subtle/.test(dp) && !/bloom/.test(cp) && /Call me Sam/.test(dp) && /Call me Sam/.test(cp), 'the Lab fact is in the Three Director\'s prompt only; shared facts in both');
  C.autoMemory = false; await saveConfig(); await wait(300); // the fake's <remember> must not change this prompt
  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(250); return Native.current(C.id).messages.at(-1); };
  const s0 = sysOf(await reply('hello promptinfo'));
  ok(s0 && /Call me Sam/.test(s0) && !/bloom/i.test(s0), 'a real plain-Claude run: shared memory in, the Lab fact out');

  // 6. Undo (the toast's, through MemoryTidy.undo)
  ok(await MemoryTidy.undo(), 'Undo runs');
  const back = await window.hub.getMemory();
  ok(back.shared === MEM.shared && !back.places?.lab, 'Undo: memory is back as it was');

  // 7. prevention: the fake says <remember> twice → kept once
  C.autoMemory = keepAuto; if (keepAuto === undefined) delete C.autoMemory; await saveConfig(); await wait(300);
  await window.hub.saveMemory({ shared: '', agents: {} });
  await reply('hello remember');
  await wait(500);
  await reply('again remember');
  const mem2 = await until(async () => { const m = await window.hub.getMemory(); return /fake engines/.test(m.agents?.[C.id] || '') ? m : null; });
  await wait(600);
  const mem3 = await window.hub.getMemory();
  out.remembered = mem3.agents?.[C.id];
  ok(mem2 && (String(mem3.agents?.[C.id] || '').match(/fake engines/g) || []).length === 1, 'a fact the AI saves twice is kept once');
  // a contradicting save replaces, the chip's Undo puts the old one back
  await window.hub.saveMemory({ shared: '- Uses a Mac', agents: {} });
  const r = await Native.rememberFacts(C.id, ['Now uses Windows']);
  const m4 = await window.hub.getMemory();
  ok(r?.replaced?.length === 1 && m4.shared === '- Now uses Windows' && !m4.agents?.[C.id], 'a contradicting <remember> replaces the old fact where it was');
  await Native.forgetFacts(C.id, ['Now uses Windows']);
  ok((await window.hub.getMemory()).shared === '- Uses a Mac', 'its Undo puts the old fact back');

  // 8. /tidy-memory opens it (left on screen for the picture)
  await window.hub.saveMemory(MEM);
  S()?.querySelector('.opt-head button[title^="Close"]')?.click();
  await Commands.tryRun('/tidy-memory', C.id);
  ok(await until(() => D()?.querySelector('.mt-row')), '/tidy-memory opens Tidy memory');
  await wait(400);
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
