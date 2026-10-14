// Tidy memory (round 38, memorytidy): ⋯ AI setup → Memory → "Tidy memory…". Saved memory rides with every message,
// and the AIs keep adding to it; this shows one proposed cleanup as a before / after list (merge the same fact said
// twice, let a newer fact replace the one it contradicts, shorter wording, Lab facts kept for the Lab only, clearly
// stale ones dropped). Each change has a box (the sure ones ticked); nothing changes until Apply; one Undo puts it all
// back (facts saved since are kept). The rules are local and free (memorytidy-core.js). "✦ Smarter tidy" asks the
// lightest model once for more (shorter wording, merges), shows its token cost before, and only when clicked.
// The Memory fold's summary gets one gentle line when an AI's memory passes ≈ 800 tokens. /tidy-memory [undo].
const MemoryTidy = (() => {
  const C = MemoryTidyCore;
  const CHEAP = { claude: { model: 'haiku', effort: 'low' }, codex: { model: 'gpt-6-luna', effort: 'minimal' } }; // autocompact.js CHEAP
  let last = null; // { before, after, n } the last tidy, for Undo
  let dlg = null;
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const getMem = () => window.hub.getMemory();
  const metaOf = async () => { try { return (await MemoryEditor.metaFacts()) || {}; } catch { return {}; } };
  const KIND = { merge: 'Merge', update: 'Update', shorter: 'Shorter', move: 'Move', drop: 'Drop' };
  const scopeName = (scope) => C.scopeLabel(scope, natives());

  // ---------- the Memory fold's one line ----------
  async function size(agent) { try { return C.tokensFor(await getMem(), agent); } catch { return 0; } }
  async function nudge(agent) {
    const n = agent ? await size(agent) : 0;
    return n >= C.NUDGE_TOKENS ? `≈ ${C.fmt(n)} tokens of memory: Tidy memory could shrink it` : '';
  }

  // ---------- the list ----------
  function row(c, onToggle) {
    if (c.on === undefined) c.on = c.sure;
    const box = el('input', { type: 'checkbox', checked: c.on, attrs: { 'aria-label': `${KIND[c.kind]}: ${c.facts.map((f) => f.text).join(' / ')}` } });
    box.addEventListener('change', () => { c.on = box.checked; onToggle(); });
    const moved = c.after && c.scope && !c.facts.every((f) => f.scope === c.scope);
    return el('label', { class: `mt-row mt-${c.kind}${c.by === 'ai' ? ' mt-ai' : ''}`, attrs: { 'data-kind': c.kind } },
      box,
      el('span', { class: 'mt-kind', text: c.kind === 'move' ? `Move to ${scopeName(c.scope).replace(/ only$/, '')}` : KIND[c.kind], title: c.by === 'ai' ? 'Suggested by the AI (Smarter tidy)' : 'Found by Hearth\'s own rules (free)' }),
      el('span', { class: 'mt-body' },
        ...c.facts.map((f) => el('span', { class: 'mt-before' }, el('s', { text: f.text }), el('small', { text: scopeName(f.scope) }))),
        c.after ? el('span', { class: 'mt-after' }, el('b', { text: '→ ' }), el('span', { text: c.after }), moved ? el('small', { text: scopeName(c.scope) }) : null) : el('span', { class: 'mt-after mt-gone', text: '→ forgotten' }),
        el('small', { class: 'mt-why', text: `${c.by === 'ai' ? '✦ ' : ''}${c.why}${c.saves > 0 ? ` · −${c.saves} tokens` : ''}` })));
  }
  // the numbers on top: all of memory, and what each AI carries with its messages, before → after the ticked changes
  function numbers(mem, changes) {
    const after = C.apply(mem, changes.filter((c) => c.on)).memory;
    const per = natives().map((a) => [a.name, C.tokensFor(mem, a), C.tokensFor(after, a)]).filter(([, b]) => b);
    return { all: [C.allTokens(mem), C.allTokens(after)], per, ticked: changes.filter((c) => c.on).length };
  }

  async function open({ agentId } = {}) {
    dlg?.close();
    const agent = H.agent(agentId) || H.claudeAgent?.() || natives()[0];
    const [mem, meta] = await Promise.all([getMem(), metaOf()]);
    const p = C.propose(mem, { meta, agents: natives() });
    const changes = p.changes;
    const d = el('dialog', { class: 'ui-modal memtidy' });
    dlg = d;
    const head = el('p', { class: 'hint mt-head' });
    const per = el('p', { class: 'mt-per' });
    const list = el('div', { class: 'mt-list' });
    const applyBtn = el('button', { type: 'button', class: 'primary', text: 'Apply' });
    const smart = el('button', { type: 'button', class: 'ghost small mt-smart' });
    const smartNote = el('small', { class: 'mt-smart-note' });
    const repaintNums = () => {
      const n = numbers(mem, changes);
      head.textContent = changes.length
        ? `${p.facts} facts · ≈ ${C.fmt(n.all[0])} → ${C.fmt(n.all[1])} tokens with the ticked changes. Nothing changes until you apply.`
        : `${p.facts} facts, ≈ ${C.fmt(n.all[0])} tokens: nothing to tidy by the rules.${p.facts ? ' Smarter tidy can still look for shorter wording.' : ''}`;
      per.textContent = n.per.map(([name, b, a]) => `${name} ≈ ${C.fmt(b)}${a !== b ? ` → ${C.fmt(a)}` : ''}`).join(' · ') + (n.per.length ? ' tokens with each message' : '');
      applyBtn.textContent = n.ticked ? `Apply ${n.ticked} change${n.ticked === 1 ? '' : 's'}` : 'Apply';
      applyBtn.disabled = !n.ticked;
    };
    const paintList = () => {
      list.replaceChildren(...(changes.length ? changes.map((c) => row(c, repaintNums)) : [el('p', { class: 'hint', text: p.facts ? 'No duplicates, contradictions, stale or wordy facts found.' : 'Nothing saved yet.' })]));
      repaintNums();
    };
    // ✦ Smarter tidy: the facts no ticked change touches, once, on the lightest model; the cost is on the button
    const smartList = () => {
      const touched = new Set(changes.filter((c) => c.on).flatMap((c) => c.facts.map((f) => `${f.scope}|${f.text}`)));
      return C.facts(mem, meta).filter((f) => !touched.has(`${f.scope}|${f.text}`));
    };
    const paintSmart = () => {
      const fs = smartList();
      const cost = C.smarterCost(fs, agent?.engine);
      smart.textContent = `✦ Smarter tidy · ≈ ${C.fmt(cost.total)} tokens once`;
      smart.title = `The lightest model (${(CHEAP[agent?.engine] || CHEAP.claude).model}, low effort) reads ${fs.length} fact${fs.length === 1 ? '' : 's'} once and suggests shorter wording and merges: ≈ ${C.fmt(cost.input)} tokens in, ≈ ${C.fmt(cost.output)} out. Only when you click; you still tick what to apply.`;
      smart.disabled = !fs.length || !agent;
    };
    smart.addEventListener('click', async () => {
      const fs = smartList();
      if (!fs.length || !agent) return;
      smart.disabled = true;
      smart.textContent = '✦ Asking the lightest model…';
      const cheap = CHEAP[agent.engine] || CHEAP.claude;
      let r = null;
      try { r = await window.hub.askOnce({ agentId: agent.id, text: C.smarterPrompt(fs), options: { lean: true, helper: true, persona: C.PERSONA, model: cheap.model, effort: cheap.effort, ...(agent.engine === 'codex' ? { verbosity: 'low' } : {}) } }); } catch (err) { r = { ok: false, error: err.message }; }
      if (dlg !== d) return;
      const used = r?.usage ? (r.usage.input || 0) + (r.usage.output || 0) : 0;
      if (!r?.ok) { smartNote.textContent = `The AI couldn't do it: ${String(r?.error || 'no answer').slice(0, 120)}`; paintSmart(); return; }
      const more = C.parseSmarter(r.text, fs).filter((c) => !changes.some((x) => x.facts.some((f) => c.facts.some((g) => g.scope === f.scope && g.text === f.text))));
      more.forEach((c, i) => { c.id = `ai${i + 1}`; changes.push(c); });
      smartNote.textContent = `${more.length ? `✦ ${more.length} more suggestion${more.length === 1 ? '' : 's'} from the AI` : '✦ The AI found nothing more to tidy'}${used ? ` · it used ${C.fmt(used)} tokens` : ''}`;
      paintList();
      paintSmart();
    });
    applyBtn.addEventListener('click', async () => {
      const ticked = changes.filter((c) => c.on);
      if (!ticked.length) return;
      applyBtn.disabled = true;
      const r = await tidy(ticked);
      d.close();
      toast(`Memory tidied: ${r.done} change${r.done === 1 ? '' : 's'}, ≈ ${C.fmt(r.from)} → ${C.fmt(r.to)} tokens`, { timeout: 9000, action: { label: 'Undo', fn: () => undo() } });
    });
    d.append(el('form', { method: 'dialog' },
      el('h2', { text: 'Tidy memory' }), head, per, list,
      el('div', { class: 'dialog-actions' }, smart, smartNote, el('span', { class: 'spacer' }), el('button', { type: 'submit', class: 'ghost', text: 'Cancel' }), applyBtn)));
    d.addEventListener('close', () => { d.remove(); if (dlg === d) dlg = null; });
    for (const c of changes) c.on = c.sure;
    paintList();
    paintSmart();
    document.body.append(d);
    d.showModal();
    return d;
  }

  // apply the ticked changes to the memory as it is now (a fact saved meanwhile stays)
  async function tidy(ticked) {
    const before = await getMem();
    const r = C.apply(before, ticked);
    await window.hub.saveMemory(r.memory);
    last = { before, after: r.memory, n: r.done };
    try { MemoryEditor.paintButton?.(); } catch { /* no editor */ }
    if (typeof Options !== 'undefined' && Options.sheet) Options.paint();
    return { done: r.done, from: C.allTokens(before), to: C.allTokens(r.memory) };
  }
  async function undo() {
    if (!last) return false;
    const now = await getMem();
    await window.hub.saveMemory(C.undo(now, last.before, last.after));
    last = null;
    toast('Memory back as it was', { timeout: 2500 });
    if (typeof Options !== 'undefined' && Options.sheet) Options.paint();
    return true;
  }

  // ---------- in words ----------
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('tidy-memory')) return;
    Commands.register({ name: 'tidy-memory', aliases: ['memory-tidy'], area: 'Memory', args: '[undo]',
      desc: 'Tidy memory: merge facts said twice, update old ones, shorten, keep Lab facts for the Lab (you tick, then apply)',
      examples: ['/tidy-memory', '/tidy-memory undo'],
      complete: (a) => (['undo'].filter((x) => x.startsWith(a)).map((value) => ({ value }))),
      run: async (args, ctx) => {
        if (/^undo\b/i.test(String(args || '').trim())) return (await undo()) ? 'Memory is back as it was before the tidy.' : 'Nothing to undo.';
        await open({ agentId: ctx?.agentId });
        return undefined;
      } });
  }
  register();

  return { open, nudge, size, tidy, undo, get last() { return last; }, _test: { numbers } };
})();
window.MemoryTidy = MemoryTidy;
