// Recall (round 30): the "what did we decide about X?" card. One question box (what you asked, editable), then the
// answers as short quotes in three groups: ✓ Decisions, ? Open questions, and Also mentioned; each with its chat, the
// AI it was with, its date and ↗ Jump to it (the chat opens on that message and flashes it). All local and free
// (recall-hooks.js: the ways in; recall-core.js on the store thread: the index and the ranking).
// "Ask the AI to sum these up" is the only thing that costs: it shows the tokens first and sends only the quotes
// shown (never whole chats) to this chat's AI, as your own visible message.
const Recall = (() => {
  let dlg = null;
  let seq = 0;
  let last = null; // { q, res, agentId }
  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const day = (ms) => (ms ? fmtLocal(ms, { dateStyle: 'medium' }) : '');
  const nativeAgent = (id) => { const a = id && H.agent(id); if (a?.mode === 'native') return a; const b = H.agent(H.activeId); return b?.mode === 'native' ? b : H.claudeAgent?.(); };

  // asks the store thread; while it is still reading chats it answers on what it has, and is asked again
  async function ask(q, onPartial) {
    let r = null;
    for (let i = 0; i < 40; i++) {
      r = await window.hub.recall({ q, budgetMs: 250 });
      if (!r?.left) break;
      onPartial?.(r);
    }
    return r || { decisions: [], open: [], mentions: [], terms: [] };
  }

  async function jump(h) {
    close();
    if (!H.agent(h.agentId)) { toast('That chat\'s AI isn\'t here any more', { type: 'error' }); return; }
    Native.open(h.agentId, h.chatId);
    for (let i = 0; i < 30; i++) { if (Native.jumpTo(h.agentId, h.k)) return; await new Promise((r) => setTimeout(r, 100)); }
  }

  function prompt(q, res) {
    const all = [...res.decisions, ...res.open, ...res.mentions];
    const lines = all.map((h, i) => `${i + 1}. “${h.snippet}” (${h.title}, ${day(h.at)}${h.kind === 'decision' ? ', a decision' : h.kind === 'open' ? ', left open' : ''})`);
    return `Sum up what we decided about “${q}”, using only these quotes from my past chats (nothing else was sent). Say what was decided, what is still open, and which quote each point comes from. Keep it short.\n\n${lines.join('\n')}`;
  }
  function summarise() {
    if (!last) return;
    const a = nativeAgent(last.agentId);
    if (!a) { toast('No chat to ask', { type: 'error' }); return; }
    const text = prompt(last.q, last.res);
    close();
    activate(a.id);
    Native.send(a.id, text).catch((err) => toast(err.message, { type: 'error' }));
  }

  // ---------- the card ----------
  function hitRow(h) {
    const who = H.agent(h.agentId)?.name || '';
    return el('div', { class: `rc-hit rc-${h.kind}`, on: { dblclick: () => jump(h) } },
      el('blockquote', { class: 'rc-quote', text: h.snippet }),
      el('div', { class: 'rc-meta' },
        el('span', { class: 'rc-chat', text: `${h.pinned ? '📌 ' : ''}${h.title}` }),
        el('span', { class: 'rc-sub', text: ` · ${h.role === 'user' ? 'you' : who || 'AI'} · `, title: who }),
        el('span', { class: 'rc-sub', text: day(h.at), title: h.at ? `${timeAgo(h.at)}` : '' }),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost rc-jump', text: 'Jump to it ↗', title: 'Open the chat on this message', on: { click: () => jump(h) } })));
  }
  function section(title, cls, hits) {
    if (!hits.length) return null;
    return el('section', { class: `rc-sec ${cls}` }, el('h4', { text: `${title} · ${hits.length}` }), hits.map(hitRow));
  }
  function paint(body, foot, q, res, { partial = false } = {}) {
    const n = res.decisions.length + res.open.length + res.mentions.length;
    const status = partial ? `Still reading your chats… (${res.left} to go)` : res.messages != null ? `Searched ${res.chats} chat${res.chats === 1 ? '' : 's'} (${res.messages} messages) here on this computer · free` : '';
    body.replaceChildren(
      el('div', { class: 'rc-status hint', text: status }),
      ...(n ? [section('✓ Decisions', 'rc-dec', res.decisions), section('? Open questions', 'rc-open', res.open), section('Also mentioned', 'rc-men', res.mentions)].filter(Boolean)
        : [el('div', { class: 'rc-empty', text: !q.trim() ? 'Ask in plain words: “what did we decide about the intro font?”' : partial ? 'Looking…' : `Nothing about “${(res.terms || []).join(' ') || q}” in your chats yet.` })]),
    );
    foot.replaceChildren();
    if (n && !partial) {
      const cost = tok(prompt(q, res));
      foot.append(el('button', { type: 'button', class: 'ghost rc-ai', title: 'Sends only the quotes above (not the chats) to this chat\'s AI, as your message', on: { click: summarise } },
        `✦ Ask the AI to sum these up · ≈ ${cost.toLocaleString()} tokens`));
    }
  }
  function close() { if (dlg?.open) dlg.close(); dlg = null; }
  function open(q = '', { agentId = null } = {}) {
    close();
    const input = el('input', { type: 'search', class: 'rc-q', value: String(q || '').trim(), placeholder: 'What did we decide about…?', spellcheck: false, attrs: { 'aria-label': 'Your question' } });
    const body = el('div', { class: 'rc-body' });
    const foot = el('div', { class: 'rc-foot' });
    const d = el('dialog', { class: 'ui-modal recall-dlg' },
      el('div', { class: 'rc-head' }, el('span', { class: 'rc-ic', text: '🔎' }), input, el('button', { type: 'button', class: 'ghost rc-x', text: '✕', title: 'Close', on: { click: close } })),
      body, foot);
    d.addEventListener('close', () => { setTimeout(() => d.remove(), 0); if (dlg === d) dlg = null; });
    d.addEventListener('mousedown', (e) => { if (e.target === d) close(); });
    document.body.append(d);
    dlg = d;
    d.showModal();
    input.focus();
    const run = async () => {
      const my = ++seq; const text = input.value;
      if (!text.trim()) { paint(body, foot, text, { decisions: [], open: [], mentions: [] }); return; }
      const res = await ask(text, (p) => { if (my === seq && dlg === d) paint(body, foot, text, p, { partial: true }); }).catch((err) => ({ decisions: [], open: [], mentions: [], error: err.message }));
      if (my !== seq || dlg !== d) return;
      last = { q: text.trim(), res, agentId };
      paint(body, foot, text, res);
    };
    input.addEventListener('input', debounce(run, 250));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const first = last?.res && [...last.res.decisions, ...last.res.open, ...last.res.mentions][0]; if (first) jump(first); }
    });
    run();
    return d;
  }
  // for the check and /recall from code: the ranked answers without the card
  const find = (q) => ask(String(q || ''));
  return { open, close, find, prompt, summarise, isOpen: () => Boolean(dlg?.open), last: () => last };
})();
window.Recall = Recall;
