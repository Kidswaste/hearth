// Commands page (round 11): the owner, after trying the Flows node view: "I don't really get the nodes instead of
// commands thing… a brand new Command section with a list of every command, and we go input by input: this task needs
// THIS from me, this next one is optional, this one can be skipped, this one needs a yes or a no, how many times…
// with a definition of what they do and a little preview video animation." Then: "show the videos as hover when I pass
// my mouse over the command, and if I click it first open the example in a bigger window before committing".
// - A rail page (☰ Commands; Ctrl/⌘+Shift+F; `/commands [name]`; "/" → Flows / Every command). Left: every command
//   (principal ones first, then by area), searchable in plain words, pinned / recent / going now; each row: name, one
//   clear sentence, area, a preview that plays while you point at it (a still poster otherwise).
// - Click (or Enter) a command: its example, big: the preview (a real clip for the principal ones), what it does, when
//   to use it, what it will ask you. Nothing runs until "▶ Use this command" (Enter again).
// - Then one question at a time (cmdpage-core.js): needed / optional (Skip) / yes or no / how many / which value
//   (suggestions from the command itself as big buttons), "How many times?" (once, n times, every N), "Then…" (chain
//   another command; it can use this one's result), a summary of what will happen, ▶ Run. The run is a Flows run
//   (flows.js): kept on disk, step N of M, resumed after a restart, ↻ Again, ✎ Refine, change an answer, the same live
//   card in the chat it belongs to. The node view stays one click away (⋯ → Node view, advanced).
const CmdPage = (() => {
  const D = () => CmdPageData;
  const C = () => CmdPageCore;
  const short = (s, n = 120) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const P = { mounted: false, root: null, list: null, search: null, right: null, sel: null, runId: null, view: 'none', query: '', io: null, hovered: null, big: null, renderKey: '' };
  const SURFACE = 'tool:commands';
  const visible = () => H.surfaceIdFor?.(H.activeId) === SURFACE;
  const descOf = (def) => D().DESC[def.name] || String(def.desc || '').split(' · ')[0] || '';
  const principalSet = () => { try { return FlowsUI.principal(); } catch { return new Set(FlowsData?.PRINCIPAL || []); } };
  // where you were before the page: commands run there (the Lab's /look in the Lab), its chat gets the card
  function before() {
    for (const id of H.mru || []) if (H.surfaceIdFor(id) !== SURFACE && H.surfaces?.has(H.surfaceIdFor(id))) return id;
    return null;
  }
  function hereAgent() {
    const id = before();
    const a = id && H.agent(id);
    if (a?.mode === 'native') return a.id;
    const sid = String(id ? H.surfaceIdFor(id) : '');
    const docked = sid.startsWith('tool:') && Tools.dockedAgent?.(sid.slice(5));
    return docked?.id || (H.agents().find((x) => x.mode === 'native' && x.engine === 'claude' && !x.dock) || H.claudeAgent())?.id;
  }

  // ---------- questions for a command (derived, or explicit from cmdpage-data.js) ----------
  const qCache = new Map();
  function questionsOf(def) {
    const key = `${def.name}|${def.args}`;
    if (!qCache.has(key)) qCache.set(key, C().questionsFor({ ...def, examples: Commands.examplesOf(def), complete: Boolean(def.complete) }, D().Q[def.name] || null));
    return qCache.get(key);
  }
  const stageOf = (name) => { const def = Commands.get(name); if (!def) throw new Error(`No command /${name}`); return { name: def.name, ...questionsOf(def) }; };
  // Flows hooks: "which command next?" regrows the run's steps; command lines filled with "type it" and {last}
  function grow(run, node, value) {
    if (!run.flow?.guided) return false;
    if (node.q?.kind === 'command' && node.q.pick) {
      const name = String(value || '').trim().replace(/^\//, '').split(/\s+/)[0];
      const def = Commands.get(name);
      if (!def) throw new Error(`“${value}” isn't a command (type its name, e.g. still)`);
      const names = [...(run.flow.commands || []).slice(0, node.q.pick), def.name];
      const flow = C().buildFlow(names.map(stageOf));
      run.flow.nodes = flow.nodes; run.flow.commands = flow.commands; run.flow.name = flow.name; run.flowName = flow.name;
      return true;
    }
    return false;
  }
  const lineOf = (node, run) => (run.flow?.guided && node.refill ? C().fillLine(node.cmd, run.vars) : undefined);

  // ---------- starting a guided run ----------
  async function start(name, { agentId, chatId, show = true } = {}) {
    const st = stageOf(name);
    const flow = C().buildFlow([st]);
    const a = agentId || hereAgent();
    let c = chatId || H.activeChat?.[a] || null;
    if (!c && a && Native.ensureChat) c = Native.ensureChat(a, `/${st.name}`).id;
    const p = Flows.start(flow, { agentId: a, chatId: c, title: `/${st.name}` });
    if (show) { const r = await Promise.race([p, new Promise((res) => setTimeout(() => res(null), 40))]); openRun((r || Flows.runs()[0]).id); }
    return p;
  }
  async function startFlow(flowId) {
    FlowsUI.ensure();
    const r = await Promise.race([FlowsUI.startIn(flowId, { agentId: hereAgent() }), new Promise((res) => setTimeout(() => res(null), 60))]);
    openRun((r || Flows.runs()[0]).id);
  }

  // ---------- the list ----------
  function matches(q) {
    const s = q.trim().toLowerCase().replace(/^\//, '');
    const all = Commands.list();
    const score = new Map();
    const add = (d, n) => { if (d) score.set(d.name, Math.max(score.get(d.name) || 0, n)); };
    const ex = Commands.get(s); if (ex) add(ex, 100);
    for (const d of all) {
      if (d.name.startsWith(s)) add(d, 60 - d.name.length / 10);
      else if (d.name.includes(s)) add(d, 40);
      else if (d.aliases.some((x) => x.toLowerCase().startsWith(s))) add(d, 38);
    }
    try { (Commands.suggest(q, { limit: 24 }) || []).forEach((x, i) => add(x.def, 35 - i)); } catch { /* plain words are a bonus */ }
    const words = s.split(/\s+/).filter((w) => w.length > 2);
    if (words.length) for (const d of all) { const t = `${descOf(d)} ${d.desc} ${d.area} ${Commands.keywordsOf(d)}`.toLowerCase(); const n = words.filter((w) => t.includes(w)).length; if (n) add(d, 10 + n * 4); }
    return [...score].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([n]) => Commands.get(n)).filter(Boolean);
  }
  function sections() {
    const q = P.query.trim();
    const out = [];
    const flowsOf = () => { try { FlowsUI.ensure(); return [...FlowsUI.journeys(), ...FlowsUI.yours()]; } catch { return []; } };
    if (q) {
      out.push({ head: 'Best matches', items: matches(q).map((def) => ({ def })) });
      const fq = q.toLowerCase();
      const fl = flowsOf().filter((f) => `${f.name} ${f.desc}`.toLowerCase().includes(fq));
      if (fl.length) out.push({ head: 'Step lists (flows)', items: fl.map((flow) => ({ flow })) });
      return out;
    }
    const runs = Flows.runs().filter((r) => ['waiting-you', 'hung', 'running', 'waiting-ai', 'stopped'].includes(r.status) && Date.now() - r.updated < 3 * 864e5).slice(0, 4);
    if (runs.length) out.push({ head: 'Going now', items: runs.map((run) => ({ run })) });
    const used = new Set();
    const pick = (names) => names.map((n) => Commands.get(n)).filter((d) => d && !used.has(d.name) && used.add(d.name)).map((def) => ({ def }));
    const pins = pick(Commands.favs());
    if (pins.length) out.push({ head: '★ Pinned', items: pins });
    const rec = pick(Commands.recent().slice(0, 6));
    if (rec.length) out.push({ head: 'Recent', items: rec });
    const pr = [...principalSet()];
    out.push({ head: 'Principal', items: pick(pr) });
    const fl = flowsOf();
    if (fl.length) out.push({ head: 'Step lists (flows)', items: fl.map((flow) => ({ flow })) });
    const byArea = new Map();
    for (const d of Commands.list()) { if (!byArea.has(d.area)) byArea.set(d.area, []); byArea.get(d.area).push(d); }
    for (const [area, defs] of byArea) out.push({ head: `${area} · ${defs.length}`, area, items: defs.map((def) => ({ def })) });
    return out;
  }
  function renderList() {
    if (!P.mounted) return;
    const frag = document.createDocumentFragment();
    P.io?.disconnect();
    let n = 0;
    for (const s of sections()) {
      if (!s.items.length) continue;
      frag.append(el('div', { class: 'cp-head', text: s.head }));
      for (const it of s.items) { frag.append(row(it)); n += 1; }
    }
    if (!n) frag.append(el('div', { class: 'cp-empty', text: `Nothing matches “${P.query}”. Try other words: “vertical”, “record”, “colors”…` }));
    P.list.replaceChildren(frag);
    P.count.textContent = P.query ? `${n}` : `${Commands.list().length} commands`;
    for (const b of P.list.querySelectorAll('.cp-pv')) P.io.observe(b);
    markSel();
  }
  function row(it) {
    if (it.run) {
      const r = it.run;
      return el('button', { class: `cp-row cp-runrow fl-${r.status}`, type: 'button', dataset: { run: r.id }, title: Flows.line(r) },
        el('span', { class: 'cp-rdot' }), el('span', { class: 'cp-rtext' }, el('b', { text: r.flowName }), el('span', { class: 'cp-desc', text: Flows.STATUS_LABEL[r.status] || r.status })));
    }
    if (it.flow) {
      const f = it.flow;
      return el('button', { class: 'cp-row cp-flowrow', type: 'button', dataset: { flow: f.id } },
        el('span', { class: 'cp-pv cp-ficon', text: f.icon || '⇢' }),
        el('span', { class: 'cp-rtext' }, el('b', { text: f.name }), el('span', { class: 'cp-desc', text: short(f.desc, 90) })),
        el('span', { class: 'cp-area', text: 'flow' }));
    }
    const d = it.def;
    return el('button', { class: `cp-row${principalSet().has(d.name) ? ' cp-principal' : ''}`, type: 'button', dataset: { name: d.name } },
      el('span', { class: 'cp-pv', dataset: { name: d.name } }),
      el('span', { class: 'cp-rtext' }, el('b', { text: `/${d.name}` }), el('span', { class: 'cp-desc', text: short(descOf(d), 110) })),
      el('span', { class: 'cp-area', text: d.area }));
  }
  const markSel = () => { for (const b of P.list.querySelectorAll('.cp-row.on')) b.classList.remove('on'); const s = P.sel && P.list.querySelector(P.sel.flow ? `.cp-row[data-flow="${P.sel.flow}"]` : `.cp-row[data-name="${P.sel.name}"]`); s?.classList.add('on'); };
  // a row's preview: the still poster when it scrolls into view; it plays (the clip for principal ones) while pointed at
  function poster(box) { if (!box.dataset.drawn && box.dataset.name) { const d = Commands.get(box.dataset.name); if (d) box.innerHTML = CmdPreviews.svg(d); box.dataset.drawn = '1'; } }
  function hover(btn, on) {
    const box = btn?.querySelector('.cp-pv[data-name]');
    if (!box) return;
    if (on) {
      if (P.hovered && P.hovered.box !== box) hover(P.hovered.btn, false);
      const d = Commands.get(box.dataset.name); if (!d) return;
      P.hovered = { btn, box, pv: CmdPreviews.mount(box, d, { clip: true }) };
      box.dataset.drawn = '1';
      P.hovered.pv.play(true);
    } else if (P.hovered?.box === box) {
      P.hovered.pv.play(false);
      P.hovered.pv.video?.remove();
      box.classList.remove('on', 'has-clip');
      P.hovered = null;
    }
  }

  // ---------- the right side: the example (big), then the guided run ----------
  function stopBig() { if (P.big) { P.big.play(false); P.big.video?.remove(); P.big = null; } }
  function showExample(name) {
    const def = Commands.get(name);
    if (!def) return;
    P.sel = { name: def.name }; P.runId = null; P.view = 'example'; P.renderKey = '';
    stopBig();
    const qs = questionsOf(def);
    const about = D().ABOUT[def.name];
    const variants = String(def.desc || '').split(' · ').slice(1);
    const box = el('div', { class: 'cp-big' });
    const askList = el('ol', { class: 'cp-asks' }, ...qs.qs.map((q) => el('li', {},
      el('span', { class: `cp-chip cp-c-${q.required ? 'need' : q.kind === 'yesno' ? 'yn' : 'opt'}`, text: q.required ? 'needed' : q.kind === 'yesno' ? 'yes / no' : 'optional' }),
      ` ${q.title.replace(/^(This needs|Optional): /, '')}`,
      q.options?.length ? el('span', { class: 'cp-small', text: ` · ${q.options.slice(0, 5).map((o) => o.label).join(', ')}${q.options.length > 5 ? '…' : ''}` }) : null)),
    qs.repeat ? el('li', {}, el('span', { class: 'cp-chip cp-c-opt', text: 'optional' }), ' How many times? (once, 2, 3, 5 times', qs.repeat === 'every' ? ', or every 30 s / 5 min)' : ')') : null,
    el('li', {}, el('span', { class: 'cp-chip cp-c-opt', text: 'optional' }), ' Then… another command, which can use this one\'s result'));
    const use = el('button', { class: 'primary cp-use', type: 'button', text: '▶ Use this command', title: 'Answer its questions one at a time; nothing runs before the last step (Enter)', on: { click: () => start(def.name).catch((e) => toast(e.message, { type: 'error' })) } });
    const more = el('button', { class: 'ghost small', type: 'button', text: '⋯', title: 'More', on: { click: (e) => showMenuAt(e.currentTarget, cmdMenu(def)) } });
    const ex = Commands.examplesOf(def);
    P.right.replaceChildren(el('div', { class: 'cp-example' },
      box,
      el('div', { class: 'cp-ex-head' }, el('h2', { text: `/${def.name}` }), el('span', { class: 'cp-area', text: def.area }), def.keys ? el('kbd', { text: Commands.keyText(def.keys) }) : null, el('span', { class: 'spacer' }), more),
      el('p', { class: 'cp-def', text: descOf(def) }),
      about ? el('div', { class: 'cp-about' }, el('p', {}, el('b', { text: 'What it does: ' }), about[0]), el('p', {}, el('b', { text: 'When to use it: ' }), about[1])) : null,
      variants.length ? el('p', { class: 'cp-small', text: `It changes with where you are: ${variants.map((v) => v.replace(/^in /, 'in ')).join(' · ')}` }) : null,
      el('div', { class: 'cp-sub', text: qs.qs.length ? `It will ask you (${qs.qs.length}${qs.needs ? `, ${qs.needs} needed` : ', all optional'})` : 'It needs nothing from you' }),
      askList,
      ex.length ? el('div', { class: 'cp-small cp-exs' }, 'Typed in a chat: ', ...ex.slice(0, 4).map((x) => el('code', { text: x }))) : null,
      el('div', { class: 'cp-row-btns' }, use, el('span', { class: 'cp-small', text: 'Nothing runs until the last step.' }))));
    P.big = CmdPreviews.mount(box, def, { clip: true });
    P.big.play(visible());
    markSel();
    requestAnimationFrame(() => use.focus({ preventScroll: true }));
  }
  function showFlow(id) {
    FlowsUI.ensure();
    const f = Flows.get(id);
    if (!f) return;
    P.sel = { flow: f.id }; P.runId = null; P.view = 'example'; P.renderKey = '';
    stopBig();
    const steps = f.nodes.filter((n) => n.kind !== 'start');
    const use = el('button', { class: 'primary cp-use', type: 'button', text: '▶ Start', on: { click: () => startFlow(f.id).catch((e) => toast(e.message, { type: 'error' })) } });
    const last = Flows.runs().filter((r) => r.flowId === f.id).slice(0, 3);
    P.right.replaceChildren(el('div', { class: 'cp-example' },
      el('div', { class: 'cp-big cp-bigflow' }, el('span', { text: f.icon || '⇢' })),
      el('div', { class: 'cp-ex-head' }, el('h2', { text: f.name }), el('span', { class: 'cp-area', text: 'step list' }), el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', type: 'button', text: 'Node view', title: 'The same steps as nodes (advanced)', on: { click: () => FlowsUI.open({ flowId: f.id }) } })),
      el('p', { class: 'cp-def', text: f.desc || '' }),
      el('div', { class: 'cp-sub', text: `${steps.length} steps` }),
      el('ol', { class: 'cp-asks' }, ...steps.slice(0, 16).map((n) => el('li', {}, el('span', { class: `cp-chip cp-k-${n.kind}`, text: { choice: 'choice', text: 'your words', action: 'runs', ai: 'AI', check: 'wait', result: 'result' }[n.kind] || n.kind }), ` ${n.title || n.cmd || ''}`))),
      last.length ? el('div', { class: 'cp-small' }, 'Last runs: ', ...last.map((r) => el('button', { class: 'linkish', type: 'button', text: `${Flows.STATUS_LABEL[r.status]} · ${new Date(r.updated).toLocaleTimeString()}`, on: { click: () => openRun(r.id) } }))) : null,
      el('div', { class: 'cp-row-btns' }, use)));
    markSel();
    requestAnimationFrame(() => use.focus({ preventScroll: true }));
  }

  function openRun(id) {
    open();
    const r = Flows.run(id);
    if (!r) return;
    stopBig();
    P.runId = id; P.view = 'run'; P.renderKey = '';
    P.sel = r.flow?.guided ? { name: r.flow.commands?.[0] } : { flow: r.flowId };
    renderRun();
    markSel();
  }
  const keyOf = (r) => `${r.id}|${r.status}|${r.at}|${r.steps.length}|${(r.steps.at(-1) || {}).status}|${String(r.result || '').length}|${r.refines || 0}|${r.flow.nodes.length}`;
  function renderRun(force = false) {
    const r = Flows.run(P.runId);
    if (!r || P.view !== 'run' || !P.mounted) return;
    const k = keyOf(r);
    if (!force && k === P.renderKey) return; // nothing changed: the box you type in stays as it is
    P.renderKey = k;
    const w = Flows.waiting(r);
    const guided = Boolean(r.flow?.guided);
    const prog = guided ? C().progress(r, Flows.nodeOf) : null;
    const done = r.steps.map((e, i) => ({ e, i })).filter(({ e }) => ['done', 'skipped'].includes(e.status) && ['choice', 'text', 'check', 'action', 'ai'].includes(e.kind) && !(e.kind === 'choice' && Flows.nodeOf(r, e.node)?.q?.kind === 'summary'));
    const head = el('div', { class: 'cp-run-head' },
      el('button', { class: 'ghost small', type: 'button', text: '‹', title: 'Back to the example (Esc)', on: { click: back } }),
      el('h2', { text: r.flowName }),
      el('span', { class: `fl-pill fl-${r.status}`, text: Flows.STATUS_LABEL[r.status] || r.status }),
      el('span', { class: 'spacer' }),
      prog && r.status === 'waiting-you' ? el('span', { class: 'cp-step', text: `step ${prog.at} of ${prog.total}` }) : el('span', { class: 'cp-step', text: `${done.length} done` }),
      el('button', { class: 'ghost small', type: 'button', text: '⋯', title: 'Again, refine, change an answer, the node view', on: { click: (e) => showMenuAt(e.currentTarget, runMenu(r)) } }));
    const bar = prog ? el('div', { class: 'cp-bar' }, el('i', { style: { transform: `scaleX(${r.status === 'done' ? 1 : Math.max(0.04, prog.done / Math.max(1, prog.total))})` } })) : null;
    const doneList = el('div', { class: 'cp-done' }, ...done.map(({ e, i }) => {
      const n = Flows.nodeOf(r, e.node);
      const val = e.kind === 'action' ? (e.input || '') : e.status === 'skipped' ? 'skipped' : (e.choice ?? e.input ?? '');
      const b = el('button', { class: `cp-done-row${e.kind === 'action' || e.kind === 'ai' ? ' cp-ran' : ''}`, type: 'button', title: ['choice', 'text'].includes(e.kind) ? 'Change this answer (a new run continues from here; this one stays)' : short(e.output, 300) },
        el('span', { class: 'cp-tick', text: e.kind === 'action' || e.kind === 'ai' ? '▶' : '✓' }), el('span', { class: 'cp-dt', text: n?.title || e.title }), el('span', { class: 'cp-dv', text: short(val === '__type' ? r.vars[`${e.node}t`] : val, 60) }));
      if (['choice', 'text'].includes(e.kind) && !n?.q?.pick) b.addEventListener('click', () => change(r, i));
      return b;
    }));
    let body;
    if (w) body = questionCard(r, w);
    else if (r.status === 'done') body = resultCard(r);
    else if (r.status === 'hung' || r.status === 'stopped') body = el('div', { class: 'cp-q cp-hung' }, el('h3', { text: r.status === 'hung' ? 'This step hung' : 'Stopped' }), el('p', { text: r.why || '' }),
      el('div', { class: 'cp-opts' }, el('button', { class: 'cp-opt primary', type: 'button', text: '↻ Pick up here', on: { click: () => act(() => Flows.resume(r.id)) } })));
    else { const c = Flows.current(r); body = el('div', { class: 'cp-q cp-working' }, el('h3', { text: `${c?.node?.kind === 'ai' ? '✦' : '▶'} ${c?.node?.title || 'Working'}…` }), el('code', { text: c?.entry?.input || '' }), el('div', { class: 'cp-spin' })); }
    P.right.replaceChildren(el('div', { class: 'cp-run' }, head, bar, body, done.length ? el('div', { class: 'cp-sub', text: 'What\'s done' }) : null, doneList));
    requestAnimationFrame(() => P.right.querySelector('.cp-q input, .cp-q textarea, .cp-q .cp-opt')?.focus({ preventScroll: true }));
  }
  function questionCard(r, w) {
    const q = w.node.q || {};
    const ans = (v) => answer(r, w, v);
    const chip = q.kind === 'summary' ? 'Ready' : q.kind === 'chain' ? 'Then…' : w.kind === 'check' ? 'Yes or no' : q.kind === 'yesno' ? 'Yes or no' : q.repeat ? 'How many times' : q.kind === 'count' ? (q.required ? 'Needed: a number' : 'Optional: a number') : q.pick ? 'Needed' : q.required || (w.kind === 'text' && !w.node.optional && !q.kind) ? 'Needed' : 'Optional · you can skip';
    const card = el('div', { class: `cp-q cp-q-${q.kind || w.kind}` }, el('span', { class: `cp-chip ${/^Needed/.test(chip) ? 'cp-c-need' : 'cp-c-opt'}`, text: chip }), el('h3', { text: w.title }));
    if (q.cmd && q.kind !== 'summary') card.append(el('div', { class: 'cp-small', text: `for /${q.cmd}${q.prefix ? ` (written as “${q.prefix} …”)` : ''}` }));
    if (w.text && w.kind === 'check') card.append(el('p', { text: w.text }));
    if (q.kind === 'summary') {
      const lines = C().planLines(r.flow, r.vars);
      card.append(el('ol', { class: 'cp-plan' }, ...lines.map((l) => el('li', {}, el('code', { text: l.line }), l.times ? el('span', { class: 'cp-chip cp-c-opt', text: l.times }) : null, l.feeds ? el('span', { class: 'cp-small', text: ' ↳ uses the result before' }) : null))));
    }
    if (w.last != null) card.append(el('div', { class: 'cp-small', text: `Last time: ${w.last}` }));
    const opts = el('div', { class: 'cp-opts' });
    const optBtn = (o, i, onClick) => el('button', { class: `cp-opt${o.value === w.guess ? ' cp-guess' : ''}${o.skip || o.value === 'no' && q.kind === 'summary' ? ' cp-skip' : ''}${o.value === 'run' ? ' primary' : ''}`, type: 'button', title: o.hint || '', dataset: { value: o.value }, on: { click: onClick } },
      i < 9 ? el('kbd', { text: String(i + 1) }) : null, el('span', { text: o.label }), o.hint ? el('small', { text: short(o.hint, 50) }) : null);
    if (w.kind === 'choice' || w.kind === 'check') {
      w.options.forEach((o, i) => opts.append(optBtn(o, i, () => (o.value === '__type' ? ans('__type') : ans(o.value)))));
      card.append(opts);
      if (w.guess != null) card.append(el('div', { class: 'cp-small', text: `Hearth thinks: ${(w.options.find((o) => o.value === w.guess) || {}).label || w.guess}` }));
      return card;
    }
    // words: a box, suggestions as big buttons (the command's own, its examples, the result before), Skip when optional
    const optional = Boolean(w.node.optional);
    const input = el('input', { class: 'cp-input', type: 'text', placeholder: w.placeholder || (q.kind === 'command' ? 'a command, e.g. still' : q.kind === 'count' ? 'a number' : 'type here'), spellcheck: false });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ans(input.value); } else if (e.key === 'Escape') back(); });
    const ok = el('button', { class: 'primary', type: 'button', text: 'OK ✓', on: { click: () => ans(input.value) } });
    card.append(el('div', { class: 'cp-inrow' }, input, ok, optional ? el('button', { class: 'ghost', type: 'button', text: 'Skip', title: 'Leave it out', on: { click: () => ans('') } }) : null));
    if (w.hint) card.append(el('div', { class: 'cp-small' }, el('code', { text: w.hint })));
    card.append(opts);
    let k = 0;
    const seen = new Set();
    const push = (o) => { const v = String(o.value); if (!v.trim() || seen.has(v)) return; seen.add(v); const i = k++; opts.append(optBtn({ label: o.label || v, value: v, hint: o.hint }, i, () => ans(v))); };
    // the result of the step before, for a chained command
    if (/^s[2-9]/.test(w.node.id) && !q.pick && q.kind !== 'count') push({ label: '↳ the result of the step before', value: '{last}', hint: 'what the command before printed' });
    for (const o of q.options || []) push(o);
    for (const x of q.examples || []) push({ label: x, value: x, hint: 'from its examples' });
    if (q.kind === 'command') {
      const fill = () => { const t = input.value.trim().replace(/^\//, ''); const list = (t ? Commands.matching(t) : [...(Commands.recent() || []).map((n) => Commands.get(n)), ...[...principalSet()].map((n) => Commands.get(n))]).filter(Boolean).slice(0, 8); opts.replaceChildren(); seen.clear(); k = 0; for (const d of list) push({ label: `/${d.name}`, value: q.pick ? d.name : `/${d.name}`, hint: short(descOf(d), 50) }); };
      input.addEventListener('input', fill); fill();
    } else if (q.fromComplete && q.cmd) {
      // the command's own suggestions (async: a few hundred ms at most)
      const def = Commands.get(q.cmd);
      Promise.resolve().then(async () => { const ctx = Commands.context(r.agentId, null, { source: 'flow' }); const list = (await def?.complete?.(q.prefix ? `${q.prefix} ` : '', ctx)) || []; if (P.runId !== r.id || !card.isConnected) return; for (const o of list.slice(0, 16)) push({ label: o.label || String(o.value), value: String(o.value).trim(), hint: o.hint }); }).catch(() => {});
    }
    return card;
  }
  function resultCard(r) {
    const card = el('div', { class: 'cp-q cp-result' }, el('span', { class: 'cp-chip cp-c-yn', text: 'Done' }), el('h3', { text: r.steps.some((e) => e.node === 'cancelled') ? 'Nothing ran' : 'Done' }));
    if (String(r.result || '').trim()) card.append(el('pre', { class: 'cp-out', text: String(r.result).slice(0, 4000) }));
    card.append(el('div', { class: 'cp-opts' },
      el('button', { class: 'cp-opt primary', type: 'button', title: 'The same answers, a new result', text: '↻ Again', on: { click: () => act(async () => openRun((await Flows.rerun(r.id)).id)) } }),
      el('button', { class: 'cp-opt', type: 'button', title: 'Keep it and say what to change (Claude or Astra redoes it)', text: '✎ Refine…', on: { click: () => refine(r) } }),
      el('button', { class: 'cp-opt', type: 'button', text: 'Change an answer ›', on: { click: (e) => showMenuAt(e.currentTarget, changeItems(r)) } })));
    return card;
  }
  async function answer(r, w, value) {
    const q = w.node.q || {};
    // ▶ Run goes back to where you were, so the commands act there (the Lab's /look in the Lab) and you see them
    if (q.kind === 'summary' && value === 'run') { const b = before(); if (b && visible()) activate(b); }
    try { await Flows.answer(r.id, value); } catch (err) { toast(err.message, { type: 'error' }); P.renderKey = ''; renderRun(); }
  }
  async function act(fn) { try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } }
  async function refine(r) {
    const t = await Modal.prompt(`Refine “${r.flowName}”`, { label: 'Keep the result and change only this:', placeholder: 'shorter, warmer colors, a slower start…' });
    if (t != null && t.trim()) act(() => Flows.refine(r.id, t.trim()));
  }
  const changeItems = (r) => r.steps.map((e, i) => ({ e, i })).filter(({ e }) => ['choice', 'text'].includes(e.kind) && e.status !== 'waiting' && !Flows.nodeOf(r, e.node)?.q?.pick && Flows.nodeOf(r, e.node)?.q?.kind !== 'summary')
    .map(({ e, i }) => ({ label: e.title, hint: short(e.choice || e.input || 'skipped', 30), action: () => change(r, i) }));
  // a changed answer: a new run from that step that asks it again (the first run keeps its history)
  function change(r, i) { act(async () => openRun((await Flows.branch(r.id, i)).id)); }
  function back() {
    const r = Flows.run(P.runId);
    if (r?.flow?.guided && r.flow.commands?.[0]) showExample(r.flow.commands[0]); else if (r) showFlow(r.flowId); else P.search?.focus();
  }
  function runMenu(r) {
    return [
      r.status === 'done' ? { label: '↻ Again (same answers)', action: () => act(async () => openRun((await Flows.rerun(r.id)).id)) } : null,
      r.status === 'done' ? { label: '✎ Refine the result…', action: () => refine(r) } : null,
      ['hung', 'stopped'].includes(r.status) ? { label: '↻ Pick up here', action: () => act(() => Flows.resume(r.id)) } : null,
      { label: 'Change an answer', items: () => changeItems(r) },
      { label: 'Node view (advanced)', hint: 'the same run as nodes', action: () => FlowsUI.open({ runId: r.id }) },
      { label: 'Copy where it is', action: () => { navigator.clipboard.writeText(Flows.line(r)); toast('Copied', { timeout: 1200 }); } },
      !['done', 'stopped'].includes(r.status) ? { label: '■ Stop', danger: true, action: () => Flows.stop(r.id) } : null,
    ];
  }
  function cmdMenu(def) {
    const qs = questionsOf(def);
    return [
      { label: '▶ Use this command', action: () => start(def.name).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'See its example', action: () => showExample(def.name) },
      !qs.needs ? { label: 'Run it now, as is', hint: `/${def.name}`, action: () => Commands.exec(`/${def.name}`, hereAgent()) } : null,
      { label: Commands.isFav(def.name) ? '★ Unpin' : '☆ Pin to the top', action: () => { Commands.toggleFav(def.name); renderList(); } },
      { label: 'Copy its name', hint: `/${def.name}`, action: () => { navigator.clipboard.writeText(`/${def.name}`); toast('Copied', { timeout: 1200 }); } },
      { label: 'Put it in the chat box', action: () => { const a = hereAgent(); if (a) { Native.setDraft(a, `/${def.name} `); const b = before(); if (b) activate(b); } } },
      { label: principalSet().has(def.name) ? 'Take it out of the "/" menu' : 'Put it in the "/" menu', more: true, action: () => { FlowsUI.setPrincipal(def.name, !principalSet().has(def.name)); renderList(); } },
      { label: 'Where it lives (flows)', more: true, action: () => { const x = FlowsUI.whereIs(def.name); toast(x?.flow ? `In the flow “${x.flow.name}”${x.principal ? ' and the "/" menu' : ''}` : 'In the "/" menu', { timeout: 2600 }); } },
    ];
  }

  // ---------- the page ----------
  function mount(body) {
    const search = el('input', { class: 'cp-search', type: 'search', placeholder: 'Search in plain words: vertical, record, shuffle colors…', spellcheck: false, attrs: { 'aria-label': 'Search commands' } });
    const count = el('span', { class: 'cp-count' });
    const list = el('div', { class: 'cp-list', tabIndex: -1 });
    const right = el('div', { class: 'cp-right' });
    const root = el('div', { class: 'cp-root', tabIndex: -1 }, el('div', { class: 'cp-left' }, el('div', { class: 'cp-searchrow' }, search, count), list), right);
    body.append(root);
    Object.assign(P, { mounted: true, root, list, search, right, count });
    P.io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { poster(e.target); P.io.unobserve(e.target); } }, { root: list, rootMargin: '200px' });
    let t = 0;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { P.query = search.value; renderList(); list.scrollTop = 0; }, 90); });
    search.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('.cp-row'); if (f) { f.focus(); if (e.key === 'Enter') pickRow(f); } } else if (e.key === 'Escape' && search.value) { search.value = ''; P.query = ''; renderList(); } });
    list.addEventListener('click', (e) => { const b = e.target.closest('.cp-row'); if (b) pickRow(b); });
    list.addEventListener('pointerover', (e) => { const b = e.target.closest('.cp-row'); if (b && b !== P.hovered?.btn) hover(b, true); });
    list.addEventListener('pointerleave', () => { if (P.hovered) hover(P.hovered.btn, false); });
    list.addEventListener('focusin', (e) => { const b = e.target.closest('.cp-row'); if (b) hover(b, true); });
    list.addEventListener('keydown', onListKey);
    list.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('.cp-row'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.name) showMenu(e.clientX, e.clientY, cmdMenu(Commands.get(b.dataset.name)));
      else if (b.dataset.run) showMenu(e.clientX, e.clientY, runMenu(Flows.run(b.dataset.run)));
      else if (b.dataset.flow) showMenu(e.clientX, e.clientY, [{ label: '▶ Start', action: () => startFlow(b.dataset.flow) }, { label: 'See its steps', action: () => showFlow(b.dataset.flow) }, { label: 'Node view (advanced)', action: () => FlowsUI.open({ flowId: b.dataset.flow }) }]);
    });
    right.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'Escape') { e.preventDefault(); if (P.view === 'run') back(); else (list.querySelector('.cp-row.on') || search).focus(); return; }
      if (P.view === 'run' && /^[1-9]$/.test(e.key)) { const b = right.querySelectorAll('.cp-q .cp-opt')[Number(e.key) - 1]; if (b) { e.preventDefault(); b.click(); } }
    });
    renderList();
    right.replaceChildren(el('div', { class: 'cp-hello' }, el('h2', { text: 'Every command, one question at a time' }),
      el('p', { text: 'Point at a command to see it move. Click it to see its example; ▶ Use this command asks what it needs, one thing at a time, and shows what will happen before it runs.' }),
      el('p', { class: 'cp-small', text: 'Chats still run every command typed by name. Ctrl/⌘+Shift+F opens this page from anywhere.' })));
  }
  function pickRow(b) {
    if (b.dataset.name) showExample(b.dataset.name);
    else if (b.dataset.flow) showFlow(b.dataset.flow);
    else if (b.dataset.run) openRun(b.dataset.run);
  }
  function onListKey(e) {
    const b = e.target.closest('.cp-row');
    if (!b) return;
    const rows = [...P.list.querySelectorAll('.cp-row')];
    const i = rows.indexOf(b);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; n?.focus(); n?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pickRow(b); } // the example; Enter again (on ▶ Use) starts it
    else if (e.key === '/' || (e.key.length === 1 && /\w/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey)) { P.search.focus(); }
  }

  function open(name) {
    if (!Tools.enabled().some((t) => t.id === 'commands')) Tools.setHidden?.('commands', false);
    if (!visible()) activate(SURFACE);
    if (name) {
      const n = String(name).trim().replace(/^\//, '');
      if (Commands.get(n)) { requestAnimationFrame(() => { showExample(Commands.get(n).name); revealRow(); }); }
      else if (Flows.get(n)) requestAnimationFrame(() => showFlow(n));
      else requestAnimationFrame(() => { P.search.value = n; P.query = n; renderList(); });
    }
  }
  function revealRow() { const s = P.list?.querySelector('.cp-row.on'); s?.scrollIntoView({ block: 'center' }); }
  function toggle() { if (visible()) { const b = before(); if (b) activate(b); } else open(); }

  // runs moving: the page follows the one on screen, the list's "Going now"
  let listT = 0;
  function onRunChange(run) {
    if (!P.mounted) return;
    if (P.view === 'run' && run.id === P.runId) requestAnimationFrame(() => renderRun());
    clearTimeout(listT); listT = setTimeout(() => { if (visible() && !P.query) { const keep = P.list.scrollTop; renderList(); P.list.scrollTop = keep; } }, 400);
  }

  Tools.define({
    id: 'commands', name: 'Commands', icon: '☰', color: '#ffd75e',
    description: 'Every command, explained and run one question at a time',
    mount: (body) => mount(body),
    onShow() { if (P.mounted) { if (P.view === 'run') renderRun(true); P.big?.play(true); requestAnimationFrame(() => (P.view === 'none' ? P.search : null)?.focus({ preventScroll: true })); } },
    commands: [
      { label: 'Commands: every command, step by step', run: () => open() },
    ],
  });

  window.addEventListener('DOMContentLoaded', () => {
    Flows.configure({ grow, lineOf });
    Flows.onChange(onRunChange);
    addEventListener('hearth:view', () => { if (!visible()) { P.big?.play(false); if (P.hovered) hover(P.hovered.btn, false); } else P.big?.play(true); });
    if (!Commands.get('commands')) {
      Commands.register({
        name: 'commands', area: 'App', args: '[command | flow | words]', desc: 'The Commands page: every command explained, with a preview, run one question at a time (/commands size opens it on /size)',
        keys: 'Ctrl+Shift+F', examples: ['/commands', '/commands size', '/commands record'], keywords: 'page list every all guided wizard explain',
        complete: (a) => Commands.list().filter((d) => d.name.startsWith(String(a || '').replace(/^\//, ''))).slice(0, 12).map((d) => ({ value: d.name, hint: short(descOf(d), 50) })),
        run: (args) => { open(String(args || '').trim() || undefined); return null; },
      });
    }
    Keys.add([
      { area: 'Commands', keys: 'Ctrl+Shift+F', what: 'The Commands page: every command, explained, one question at a time (again: back)' },
      { area: 'Commands', keys: 'Enter', what: 'On a command: its example (big); Enter again starts it' },
      { area: 'Commands', keys: '↑ / ↓', what: 'Move through the list' },
      { area: 'Commands', keys: '1…9', what: 'Pick answer 1…9 of the question on screen' },
      { area: 'Commands', keys: 'Esc', what: 'Back from a question to the example, from the example to the list' },
      { area: 'Commands', keys: 'Right-click a command', what: 'Use it, pin it, run it as is, put it in the chat box, the "/" menu' },
    ]);
    try { AppUI.addAction?.('Commands: every command, step by step', () => open(), 'Ctrl+Shift+F'); } catch { /* the palette lists tools anyway */ }
  });

  return { open, toggle, openRun, start, showExample, showFlow, questionsOf, isOpen: visible, get state() { return P; } };
})();
