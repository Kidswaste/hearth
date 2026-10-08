// Memory editor: shared notes plus one note per native agent, stored in data/memory.json.
// Every line is a fact. The fact view adds categories, pins (pinned facts go first and never expire), expiry dates,
// search, import / export and what memory costs: it's added to every message, so the token count is shown per agent.
// Fact details live in kv 'memory-meta' ({ facts: { 'scope|text': { cat, pinned, expires, added } } }); the memory
// text the engines read stays plain lines, so nothing extra is sent.
const MemoryEditor = (() => {
  const dialog = $('memory-dialog');
  const form = $('memory-form');
  const list = $('memory-agents');
  const CATS = { pref: 'Preference', project: 'Project', style: 'Style', tools: 'Tools & setup', people: 'People', fact: 'Fact' };
  // Rough size of the fixed text the engine adds around memory (engines.js), in characters.
  const HEADER_CHARS = 70;
  const AUTO_CHARS = 300;
  let meta = null;

  function updateSize() {
    const chars = [...form.querySelectorAll('textarea')].reduce((n, t) => n + t.value.trim().length, 0);
    // Roughly 4 characters per token.
    $('memory-size').textContent = chars ? `About ${Math.ceil(chars / 4)} tokens added per message` : '';
  }

  // The plain-text editor (the original one): "Edit as text" in the fact view.
  async function openText() {
    const memory = await window.hub.getMemory();
    form.shared.value = memory.shared || '';
    list.replaceChildren();
    for (const agent of H.agents().filter((a) => a.mode === 'native')) {
      const label = document.createElement('label');
      label.textContent = `${agent.name} only`;
      const area = document.createElement('textarea');
      area.rows = 4;
      area.dataset.agent = agent.id;
      area.value = memory.agents?.[agent.id] || '';
      area.placeholder = `Notes only ${agent.name} sees. It adds to these itself when you tell it something worth remembering.`;
      label.append(area);
      list.append(label);
    }
    updateSize();
    dialog.showModal();
  }

  form.addEventListener('input', updateSize);
  form.addEventListener('submit', async () => {
    const memory = await window.hub.getMemory();
    memory.shared = form.shared.value.trim();
    for (const area of list.querySelectorAll('textarea')) memory.agents[area.dataset.agent] = area.value.trim();
    await window.hub.saveMemory(memory);
  });
  $('cancel-memory').addEventListener('click', () => dialog.close());
  $('memory-btn').addEventListener('click', () => open());

  // ---------- facts ----------
  const strip = (line) => line.trim().replace(/^[-*•]\s+/, '');
  const keyOf = (scope, text) => `${scope}|${text}`;
  const scopeName = (scope) => (scope === 'shared' ? 'All agents' : H.agent(scope)?.name || scope);
  async function loadMeta() { meta ||= { facts: {}, ...(await window.hub.kvGet('memory-meta', {})) }; return meta; }
  const saveMeta = () => window.hub.kvSet('memory-meta', meta);

  // Guesses a category from the words in a fact (you can change it).
  function guessCat(text) {
    const t = text.toLowerCase();
    if (/\b(prefer|like|love|hate|don'?t|always|never|want|rather|favorite)\b/.test(t)) return 'pref';
    if (/\b(tone|style|short|concise|answer|reply|format|language|french|english)\b/.test(t)) return 'style';
    if (/\b(mac|windows|electron|three\.?js|after effects|ae|blender|codex|claude|gpu|setup|folder|app)\b/.test(t)) return 'tools';
    if (/\b(forgeheart|project|game|channel|visuals?|visuali[sz]ers?|shorts|track|album|release|client)\b/.test(t)) return 'project';
    if (/\b(my (wife|husband|partner|friend|brother|sister|mom|dad|boss)|named|called)\b/.test(t)) return 'people';
    return 'fact';
  }

  // All facts as [{ scope, line, text, key, cat, pinned, expires, added }].
  async function facts() {
    const [memory] = await Promise.all([window.hub.getMemory(), loadMeta()]);
    const out = [];
    const add = (scope, body) => {
      for (const line of String(body || '').split('\n')) {
        const text = strip(line);
        if (!text) continue;
        const key = keyOf(scope, text);
        out.push({ scope, line, text, key, cat: 'fact', ...meta.facts[key] });
      }
    };
    add('shared', memory.shared);
    for (const [id, body] of Object.entries(memory.agents || {})) add(id, body);
    return out;
  }

  // Writes facts back into memory.json: pinned first, otherwise in their order. Lines keep their own format.
  async function writeFacts(all) {
    const memory = await window.hub.getMemory();
    const scopes = new Set(['shared', ...Object.keys(memory.agents || {}), ...all.map((f) => f.scope)]);
    for (const scope of scopes) {
      const mine = all.filter((f) => f.scope === scope);
      const text = [...mine.filter((f) => f.pinned), ...mine.filter((f) => !f.pinned)].map((f) => f.line.trim()).join('\n');
      if (scope === 'shared') memory.shared = text; else memory.agents[scope] = text;
    }
    // details of facts that no longer exist are dropped
    const live = new Set(all.map((f) => f.key));
    for (const k of Object.keys(meta.facts)) if (!live.has(k)) delete meta.facts[k];
    await Promise.all([window.hub.saveMemory(memory), saveMeta()]);
  }
  const setMeta = (f, patch) => { meta.facts[f.key] = { ...meta.facts[f.key], ...patch }; Object.assign(f, patch); };

  async function remember(text, { scope = 'shared', cat, pinned = false, days } = {}) {
    const all = await facts();
    const clean = strip(String(text));
    if (!clean) return null;
    if (all.some((f) => f.scope === scope && f.text.toLowerCase() === clean.toLowerCase())) return { duplicate: true, text: clean };
    const f = { scope, line: `- ${clean}`, text: clean, key: keyOf(scope, clean) };
    setMeta(f, { cat: cat || guessCat(clean), added: Date.now(), ...(pinned ? { pinned: true } : {}), ...(days ? { expires: Date.now() + days * 864e5 } : {}) });
    all.push(f);
    await writeFacts(all);
    return f;
  }
  // Removes facts whose text contains `query` (in one scope, or anywhere). Returns the removed facts.
  async function forget(query, { scope, exact = false } = {}) {
    const all = await facts();
    const q = String(query).toLowerCase().trim();
    const hit = (f) => (!scope || f.scope === scope) && (exact ? f.text.toLowerCase() === q : f.text.toLowerCase().includes(q));
    const gone = all.filter(hit);
    if (gone.length) await writeFacts(all.filter((f) => !hit(f)));
    return gone;
  }
  // Changes the first fact containing `words` (pin, expiry…). Returns the fact or null.
  async function update(words, patch) {
    const all = await facts();
    const f = all.find((x) => x.text.toLowerCase().includes(String(words).toLowerCase()));
    if (!f) return null;
    setMeta(f, typeof patch === 'function' ? patch(f) : patch);
    await writeFacts(all); // pinned facts move to the front
    return f;
  }
  const setPinned = (words) => update(words, (f) => ({ pinned: !f.pinned }));
  const setExpiry = (words, days) => update(words, { expires: days ? Date.now() + days * 864e5 : undefined });
  // Drops facts past their expiry date (run at start-up and when the editor opens).
  async function purgeExpired({ quiet = false } = {}) {
    const all = await facts();
    const now = Date.now();
    const gone = all.filter((f) => f.expires && !f.pinned && f.expires < now);
    if (!gone.length) return 0;
    await writeFacts(all.filter((f) => !gone.includes(f)));
    if (!quiet) toast(`Forgot ${gone.length} expired memor${gone.length === 1 ? 'y' : 'ies'}: ${gone.map((f) => f.text).join(' · ').slice(0, 140)}`, { timeout: 7000, action: { label: 'Undo', fn: async () => { const cur = await facts(); for (const f of gone) { delete f.expires; cur.push(f); setMeta(f, { expires: undefined }); } await writeFacts(cur); } } });
    return gone.length;
  }

  // Tokens memory adds to every message for each native agent (≈ 4 characters per token).
  async function cost() {
    const memory = await window.hub.getMemory();
    const shared = (memory.shared || '').trim().length;
    const usage = await window.hub.getUsage().catch(() => ({}));
    const today = usage?.[new Date().toLocaleDateString('en-CA')] || {};
    return H.agents().filter((a) => a.mode === 'native').map((a) => {
      const own = (memory.agents?.[a.id] || '').trim().length;
      const chars = (shared || own ? HEADER_CHARS + shared + own : 0) + (a.autoMemory !== false ? AUTO_CHARS : 0);
      const perMsg = Math.ceil(chars / 4);
      const replies = today[a.id]?.replies || 0;
      return { id: a.id, name: a.name, color: a.color, shared: Math.ceil(shared / 4), own: Math.ceil(own / 4), auto: a.autoMemory !== false ? Math.ceil(AUTO_CHARS / 4) : 0, perMsg, replies, today: perMsg * replies };
    });
  }
  async function costText() {
    const rows = await cost();
    if (!rows.length) return 'No native agents.';
    return `**Memory cost** (added to every message, ≈4 characters per token):\n${rows.map((r) => `- ${r.name}: ≈${r.perMsg} tokens/message (shared ${r.shared} + own ${r.own}${r.auto ? ` + auto-memory instruction ${r.auto}` : ''})${r.replies ? ` · ≈${r.today.toLocaleString()} tokens today over ${r.replies} replies` : ''}`).join('\n')}`;
  }

  async function exportAll() {
    const memory = await window.hub.getMemory();
    await loadMeta();
    const p = await window.hub.saveFile({ defaultPath: `hearth-memory-${new Date().toLocaleDateString('en-CA')}.json`, filters: [{ name: 'JSON', extensions: ['json'] }], content: JSON.stringify({ hearthMemory: 1, memory, meta }, null, 2) });
    if (p) toast('Memory exported', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    return p;
  }
  // Merges an export (or a plain .txt / .md list of facts, into "All agents"); existing facts are kept.
  async function importFile(file) {
    file ||= (await window.hub.openDialog({ filters: [{ name: 'Memory export or text', extensions: ['json', 'txt', 'md'] }] }))?.[0];
    if (!file) return null;
    const raw = await window.hub.fs.read(file);
    let incoming = { shared: '', agents: {} };
    let inMeta = {};
    if (/\.json$/i.test(file)) {
      const data = JSON.parse(raw);
      incoming = data.memory || data;
      inMeta = data.meta?.facts || {};
    } else incoming.shared = raw;
    const all = await facts();
    let added = 0;
    const take = (scope, body) => {
      if (scope !== 'shared' && !H.agent(scope)) scope = 'shared'; // an agent you no longer have
      for (const line of String(body || '').split('\n')) {
        const text = strip(line);
        if (!text || all.some((f) => f.scope === scope && f.text.toLowerCase() === text.toLowerCase())) continue;
        const f = { scope, line: line.trim().startsWith('-') ? line.trim() : `- ${text}`, text, key: keyOf(scope, text) };
        setMeta(f, { cat: guessCat(text), added: Date.now(), ...inMeta[keyOf(scope, text)] });
        all.push(f);
        added += 1;
      }
    };
    take('shared', incoming.shared);
    for (const [id, body] of Object.entries(incoming.agents || {})) take(id, body);
    await writeFacts(all);
    toast(`Memory imported: ${added} new fact${added === 1 ? '' : 's'}`);
    return added;
  }

  // ---------- the fact view ----------
  let view = null;
  async function open({ query = '' } = {}) {
    await purgeExpired({ quiet: true });
    view?.close();
    const dlg = el('dialog', { class: 'ui-modal memory-facts' });
    view = dlg;
    const q = el('input', { type: 'search', placeholder: 'Search memory…', value: query });
    const catSel = el('select', {}, el('option', { value: '', text: 'All categories' }), ...Object.entries(CATS).map(([v, t]) => el('option', { value: v, text: t })));
    const scopeSel = el('select', {}, el('option', { value: '', text: 'Everyone' }), el('option', { value: 'shared', text: 'All agents (shared)' }),
      ...H.agents().filter((a) => a.mode === 'native').map((a) => el('option', { value: a.id, text: `${a.name} only` })));
    const costBox = el('div', { class: 'memory-cost' });
    const box = el('div', { class: 'memory-list' });
    const newText = el('input', { placeholder: 'Add a fact, e.g. "I make 9:16 music visuals for Shorts"' });
    const newScope = el('select', {}, el('option', { value: 'shared', text: 'All agents' }), ...H.agents().filter((a) => a.mode === 'native').map((a) => el('option', { value: a.id, text: a.name })));
    let all = [];
    const paintCost = async () => {
      const rows = await cost();
      costBox.replaceChildren(el('span', { class: 'hint', text: 'Added to every message:' }), ...rows.map((r) => el('span', {
        class: `memory-cost-pill${r.perMsg > 300 ? ' heavy' : ''}`, title: `${r.name}: shared ${r.shared} + own ${r.own}${r.auto ? ` + auto-memory instruction ${r.auto}` : ''} tokens${r.replies ? ` · ≈${r.today} tokens today (${r.replies} replies)` : ''}`,
      }, el('span', { class: 'dot', style: { background: r.color || 'var(--accent)' } }), `${r.name} ≈${r.perMsg} tok`)));
    };
    const paint = async () => {
      all = await facts();
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const rows = all.filter((f) => (!catSel.value || f.cat === catSel.value) && (!scopeSel.value || f.scope === scopeSel.value) && words.every((w) => f.text.toLowerCase().includes(w)));
      const groups = new Map();
      for (const f of rows) { if (!groups.has(f.scope)) groups.set(f.scope, []); groups.get(f.scope).push(f); }
      box.replaceChildren(...(rows.length ? [...groups].flatMap(([scope, fs]) => [
        el('div', { class: 'lib-group', text: `${scopeName(scope)} · ${fs.length} fact${fs.length === 1 ? '' : 's'} · ≈${Math.ceil(fs.reduce((s, f) => s + f.text.length + 3, 0) / 4)} tokens` }),
        ...[...fs.filter((f) => f.pinned), ...fs.filter((f) => !f.pinned)].map((f) => row(f)),
      ]) : [el('p', { class: 'hint', text: all.length ? 'Nothing matches.' : 'No memories yet. Add one below, or tell an agent something worth remembering.' })]));
      paintCost();
    };
    const commit = async () => { await writeFacts(all); await paint(); };
    function row(f) {
      const text = el('input', { class: 'memory-text', value: f.text, title: f.added ? `Added ${timeAgo(f.added)}` : '' });
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') text.blur(); }); // blur commits the edit
      text.addEventListener('change', async () => {
        const t = strip(text.value);
        if (!t) return;
        const old = meta.facts[f.key];
        delete meta.facts[f.key];
        f.line = f.line.replace(f.text, t);
        if (!f.line.includes(t)) f.line = `- ${t}`;
        f.text = t; f.key = keyOf(f.scope, t);
        meta.facts[f.key] = old || { cat: f.cat };
        await commit();
      });
      const cat = el('select', { class: 'memory-cat', title: 'Category' }, Object.entries(CATS).map(([v, t]) => el('option', { value: v, text: t, selected: f.cat === v })));
      cat.addEventListener('change', async () => { setMeta(f, { cat: cat.value }); await saveMeta(); });
      const exp = f.expires ? Math.max(0, Math.ceil((f.expires - Date.now()) / 864e5)) : null;
      return el('div', { class: `memory-row${f.pinned ? ' pinned' : ''}` },
        el('button', { type: 'button', class: `ghost small${f.pinned ? ' on' : ''}`, text: f.pinned ? '📌' : '📍', title: f.pinned ? 'Unpin' : 'Pin: goes first and never expires', on: { click: async () => { setMeta(f, { pinned: !f.pinned }); await commit(); } } }),
        cat, text,
        el('button', { type: 'button', class: 'ghost small', text: exp == null ? '⏳' : `${exp}d`, title: exp == null ? 'Set an expiry date' : `Expires ${new Date(f.expires).toLocaleDateString()}`, on: { click: (e) => expiryMenu(e, f) } }),
        el('select', { class: 'memory-move', title: 'Who remembers it', on: { change: async (e) => { const to = e.target.value; const old = meta.facts[f.key]; delete meta.facts[f.key]; f.scope = to; f.key = keyOf(to, f.text); meta.facts[f.key] = old; await commit(); } } },
          el('option', { value: 'shared', text: 'All', selected: f.scope === 'shared' }), ...H.agents().filter((a) => a.mode === 'native').map((a) => el('option', { value: a.id, text: a.name, selected: f.scope === a.id }))),
        el('button', { type: 'button', class: 'ghost small danger', text: '×', title: 'Forget', on: { click: async () => { all = all.filter((x) => x !== f); await commit(); toast(`Forgot "${f.text.slice(0, 50)}"`, { timeout: 4000, action: { label: 'Undo', fn: async () => { const cur = await facts(); cur.push(f); await writeFacts(cur); paint(); } } }); } } }));
    }
    function expiryMenu(e, f) {
      const set = (days) => async () => { setMeta(f, { expires: days ? Date.now() + days * 864e5 : undefined }); await saveMeta(); paint(); };
      showMenu(e.clientX, e.clientY, [
        { label: 'Never expires', action: set(0) }, { label: 'Forget tomorrow', action: set(1) }, { label: 'In a week', action: set(7) },
        { label: 'In a month', action: set(30) }, { label: 'In 3 months', action: set(90) },
        { label: 'On a date…', action: async () => { const v = await Modal.form('Forget on', [{ name: 'd', label: 'Date', type: 'date', value: new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-CA') }]); if (v?.d) { setMeta(f, { expires: new Date(`${v.d}T23:59`).getTime() }); await saveMeta(); paint(); } } },
      ]);
    }
    const addNew = async () => {
      if (!newText.value.trim()) return;
      const r = await remember(newText.value, { scope: newScope.value });
      if (r?.duplicate) toast('Already remembered', { timeout: 1500 });
      newText.value = '';
      await paint();
    };
    newText.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
    for (const c of [q, catSel, scopeSel]) c.addEventListener('input', paint);
    dlg.append(el('form', { method: 'dialog', on: { keydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } } },
      el('h2', { text: 'Memory' }),
      el('p', { class: 'hint', text: 'What your native agents keep in mind in every chat. It\'s added to each message, so keep it short. Pinned facts go first and never expire.' }),
      costBox,
      el('div', { class: 'row' }, q, catSel, scopeSel),
      box,
      el('div', { class: 'row memory-add' }, newText, newScope, el('button', { type: 'button', class: 'primary small', text: 'Remember', on: { click: addNew } })),
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'ghost small', text: 'Edit as text…', on: { click: () => { dlg.close(); openText(); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Import…', on: { click: async () => { await importFile(); paint(); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Export…', on: { click: exportAll } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => { dlg.remove(); if (view === dlg) view = null; });
    document.body.append(dlg);
    await paint();
    dlg.showModal();
    q.focus();
    return dlg;
  }

  // Expired facts are dropped a few seconds after start-up.
  setTimeout(() => purgeExpired().catch(() => {}), 4000);

  return { open, openText, facts, remember, forget, setPinned, setExpiry, cost, costText, purgeExpired, exportAll, importFile, guessCat, CATS };
})();
