// Options (round 26): every chat command as a control, in a few tabs, so nothing has to be typed. The owner: "I hate
// commands, let's just make them options, let me click a '...' button next to chats or show it automatically in their
// respective window, with a bunch of tabs of all the options I have and a hover description of what they do."
// - Opens from ⋯ in a chat's header (right-click ⋯: the old chat menu), ⋯ in a window's header (Lab, board…: opens on
//   that window's tab), and ⚙ Options in the rail. 📌 keeps it open beside that window every time you come back.
// - Tabs (options-data.js): This chat · Modes & presets · Lab · Agents · Board · Capture · Forge · App. In a tab:
//   Switches, Pick one, Amounts (sliders with min / max), Pick or tell it, Tell it, Do it. Hover a row: what it does.
//   The search on top looks in every tab.
// - A control runs its command (so the chat, Settings and menus never disagree); a switch shows its state when the app
//   knows it (Settings' list, settings-find.js), else the last value you set here.
// - Modes: Quick / Smart / Detailed / Director for the chat (each a few settings at once). Presets: "Save as preset"
//   keeps what you set in a tab; one click sets it all again.
const Options = (() => {
  const D = OptionsData;
  const LIMIT = 14; // rows a section shows before "N more"
  const vals = () => store.get('options.vals', {});
  const setVal = (name, v) => { const all = vals(); all[name] = v; store.set('options.vals', all); };
  const presets = () => store.get('options.presets', []);
  const short = (s, n = 160) => { const t = String(s ?? '').replace(/[*`_]/g, '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  let sheet = null; // the open drawer: { root, body, ctx }

  // ---------- what each command is, and where it stands ----------
  const switches = () => { try { return SettingsFind.live(); } catch { return []; } };
  const switchOf = (name) => switches().find((s) => s.cmd === name);
  function controlOf(def) {
    const s = switchOf(def.name);
    if (s) return s.choices ? { kind: 'choice', values: s.choices } : { kind: 'toggle' };
    return D.control(def.args);
  }
  function stateOf(def, c) {
    const s = switchOf(def.name);
    if (s?.get) { try { const v = s.get(); if (v !== undefined) return s.choices ? v : v ? 'on' : 'off'; } catch { /* unknown */ } }
    const v = vals()[def.name];
    return c.kind === 'toggle' && v !== undefined ? (v === 'on' || v === true ? 'on' : 'off') : v;
  }
  const argFor = (def, v) => { const s = switchOf(def.name); if (s && !s.choices && (v === 'on' || v === 'off')) return v === 'on' ? (s.on || 'on') : (s.off || 'off'); return v; };
  const labelOf = (def) => switchOf(def.name)?.label || D.humanize(def.name);
  const tipOf = (def) => {
    const ex = (Commands.examplesOf?.(def) || def.examples || []).slice(0, 2);
    return `${def.desc || labelOf(def)}${ex.length ? `\n\ne.g. ${ex.join('  ·  ')}` : ''}\n\n(/${def.name}${def.args ? ` ${def.args}` : ''})`;
  };
  function defs() {
    const seen = new Set();
    return (Commands.list() || []).filter((d) => { if (!d || d.hidden || seen.has(d.name)) return false; seen.add(d.name); return true; });
  }

  // ---------- running ----------
  async function run(def, value, row) {
    const said = row?.querySelector('.opt-said');
    const say = (t) => { if (said && t) { said.textContent = short(t); said.hidden = false; } };
    row?.classList.remove('opt-err');
    const line = D.lineOf(def.name, value === undefined ? '' : argFor(def, value));
    try {
      await Commands.tryRun(line, sheet?.ctx.agentId || ctxNow().agentId, undefined, { source: 'options', say, note: say, error: (m) => { say(m); row?.classList.add('opt-err'); } });
      if (value !== undefined && value !== '') setVal(def.name, value);
    } catch (err) { say(err.message); row?.classList.add('opt-err'); }
    if (row?.isConnected) paintRow(row, def);
  }
  async function runLines(lines, agentId) {
    for (const line of lines) {
      try { await Commands.tryRun(line, agentId, undefined, { source: 'options', say: () => {}, note: () => {}, error: (m) => toast(m, { type: 'error' }) }); } catch (err) { toast(err.message, { type: 'error' }); }
    }
  }

  // ---------- a row ----------
  function paintRow(row, def) {
    const c = row._c; const v = stateOf(def, c);
    if (c.kind === 'toggle') { const sw = row.querySelector('.opt-switch'); sw.setAttribute('aria-checked', v === undefined ? 'mixed' : String(v === 'on')); }
    for (const b of row.querySelectorAll('.opt-seg button')) { const on = v !== undefined && b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    const sel = row.querySelector('select.opt-pick'); if (sel && v !== undefined) sel.value = String(v);
    const rng = row.querySelector('input[type=range]'); if (rng && v !== undefined && Number.isFinite(Number(v))) { rng.value = v; row.querySelector('.opt-num').textContent = `${v}${c.unit || ''}`; }
  }
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: fn } });
  function suggest(def, input) {
    if (!def.complete || input._filled) return;
    input._filled = true;
    let list = [];
    try { list = (def.complete('', Commands.context?.(sheet?.ctx.agentId)) || []).slice(0, 40); } catch { /* none */ }
    if (!list.length) return;
    const id = `opt-dl-${def.name}`;
    const dl = el('datalist', { id }, list.map((x) => el('option', { value: x.value, label: x.hint || x.label || '' })));
    input.after(dl); input.setAttribute('list', id);
  }
  function textBox(def, hint, row) {
    const input = el('input', { type: 'text', class: 'opt-text', placeholder: hint || 'your words', spellcheck: false, attrs: { 'aria-label': labelOf(def) } });
    input.addEventListener('focus', () => suggest(def, input), { once: true });
    const go = () => { const t = input.value.trim(); if (!t && !def.args?.startsWith('[')) { input.focus(); return; } run(def, t, row); input.select(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return [input, btn('↵', 'Do it', go)];
  }
  function rowOf(def) {
    const c = controlOf(def);
    const row = el('div', { class: `opt-row k-${c.kind}`, title: tipOf(def), dataset: { name: def.name, find: `${def.name} ${labelOf(def)} ${def.desc || ''} ${def.area} ${(def.aliases || []).join(' ')} ${Commands.keywordsOf?.(def) || ''}`.toLowerCase() } });
    row._c = c;
    const label = el('span', { class: 'opt-label', text: labelOf(def) });
    const ctl = el('span', { class: 'opt-ctl' });
    if (c.kind === 'action') {
      row.replaceChildren(el('button', { type: 'button', class: 'opt-act', text: labelOf(def), title: tipOf(def), on: { click: () => run(def, undefined, row) } }), el('span', { class: 'opt-said', hidden: true }));
      return row;
    }
    if (c.kind === 'toggle') {
      ctl.append(el('button', { type: 'button', class: 'opt-switch', role: 'switch', attrs: { 'aria-label': labelOf(def), 'aria-checked': 'mixed' },
        on: { click: () => run(def, stateOf(def, c) === 'on' ? 'off' : 'on', row) } }, el('i')));
    } else if (c.kind === 'choice' || c.kind === 'mixed') {
      const vs = c.values || [];
      const name = (v) => (v === '' ? 'Go' : v);
      if (vs.length <= 6) ctl.append(el('span', { class: 'opt-seg', role: 'group' }, vs.map((v) => el('button', { type: 'button', class: 'ghost small', dataset: { v }, text: name(v), on: { click: () => run(def, v, row) } }))));
      else {
        const sel = el('select', { class: 'opt-pick', attrs: { 'aria-label': labelOf(def) } }, el('option', { value: '', text: 'Pick…', disabled: true, selected: true }), vs.map((v) => el('option', { value: v, text: v })));
        sel.addEventListener('change', () => run(def, sel.value, row));
        ctl.append(sel);
      }
      if (c.kind === 'mixed') ctl.append(...textBox(def, c.hint, row));
    } else if (c.kind === 'number') {
      if (c.min != null && c.max != null) {
        const v0 = stateOf(def, c);
        const out = el('span', { class: 'opt-num', text: v0 != null ? `${v0}${c.unit || ''}` : '–' });
        const rng = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: v0 ?? (c.min + c.max) / 2, attrs: { 'aria-label': labelOf(def) } });
        rng.addEventListener('input', () => { out.textContent = `${rng.value}${c.unit || ''}`; });
        rng.addEventListener('change', () => run(def, rng.value, row));
        ctl.append(btn('min', `Set to ${c.min}`, () => { rng.value = c.min; run(def, String(c.min), row); }), rng, btn('max', `Set to ${c.max}`, () => { rng.value = c.max; run(def, String(c.max), row); }), out);
      } else {
        const num = el('input', { type: 'number', class: 'opt-text opt-n', step: 'any', placeholder: c.hint || 'n', attrs: { 'aria-label': labelOf(def) } });
        const v0 = stateOf(def, c); if (v0 != null) num.value = v0;
        const go = () => run(def, num.value.trim(), row);
        num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        ctl.append(num, btn('Set', 'Set it', go));
      }
    } else ctl.append(...textBox(def, c.hint, row));
    row.append(label, ctl, el('span', { class: 'opt-said', hidden: true }));
    paintRow(row, def);
    return row;
  }

  // ---------- a tab ----------
  function sectionOf(sec, list) {
    const counts = Commands.counts?.() || {};
    list.sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0) || a.name.localeCompare(b.name));
    const box = el('div', { class: `opt-list k-${sec.kind}` });
    const head = el('h4', { class: 'opt-h', title: sec.hint }, sec.label, el('small', { text: ` ${list.length}` }));
    const fill = (n) => box.replaceChildren(...list.slice(0, n).map(rowOf));
    fill(LIMIT);
    const more = list.length > LIMIT ? btn(`${list.length - LIMIT} more`, 'Show them all', () => { fill(list.length); more.remove(); }, 'ghost small opt-more') : null;
    return el('section', { class: 'opt-sec' }, head, box, more);
  }
  function rowsFor(list) {
    const by = new Map(D.SECTIONS.map((s) => [s.kind, []]));
    for (const d of list) by.get(controlOf(d).kind)?.push(d);
    return D.SECTIONS.filter((s) => by.get(s.kind).length).map((s) => sectionOf(s, by.get(s.kind)));
  }
  // the chat's own menu (native.js chatMenuItems): plain actions as buttons, a submenu as one "pick" row (Model ›,
  // Access ›, View ›…: its checked entry shown), the menu's own Customise / Chat commands entries left to the menu
  function chatQuick(agentId) {
    if (!agentId || H.agent(agentId)?.mode !== 'native' || !Native.chatMenuItems) return null;
    let items = [];
    try { items = Native.chatMenuItems(agentId) || []; } catch { return null; }
    const done = () => { if (sheet) setTimeout(paint, 50); };
    const acts = []; const picks = [];
    for (const it of items) {
      if (!it || typeof it !== 'object' || it.sep || /^(Customi[sz]e|Chat commands)/.test(it.label || '')) continue;
      if (it.action) { acts.push(it); continue; }
      if (!it.items) continue;
      let kids = [];
      try { kids = (typeof it.items === 'function' ? it.items() : it.items).filter((k) => k && typeof k === 'object' && k.action && !k.sep); } catch { continue; }
      if (!kids.length) continue;
      const sel = el('select', { class: 'opt-pick', attrs: { 'aria-label': it.label } },
        el('option', { value: '', text: kids.some((k) => k.checked) ? '' : 'Pick…', disabled: true, selected: !kids.some((k) => k.checked) }),
        kids.map((k, n) => el('option', { value: String(n), text: k.label, selected: Boolean(k.checked) })));
      sel.addEventListener('change', () => { const k = kids[Number(sel.value)]; if (k) Promise.resolve(k.action()).finally(done); });
      picks.push(el('div', { class: 'opt-row k-choice', title: it.hint ? `${it.label}: ${it.hint}` : it.label }, el('span', { class: 'opt-label', text: it.label }), el('span', { class: 'opt-ctl' }, sel)));
    }
    return el('section', { class: 'opt-sec' }, el('h4', { class: 'opt-h', text: 'This chat' }),
      el('div', { class: 'opt-list k-action' }, acts.map((it) => el('div', { class: 'opt-row k-action' }, el('button', { type: 'button', class: `opt-act${it.danger ? ' danger' : ''}`, text: it.label, title: it.key ? `${it.label} (${it.key})` : it.label,
        on: { click: () => Promise.resolve(it.action()).finally(done) } })))),
      el('div', { class: 'opt-list' }, picks));
  }
  function presetBar(tab) {
    const mine = presets().filter((p) => p.tab === tab);
    const apply = (p) => runLines(p.lines, sheet?.ctx.agentId).then(() => { toast(`Preset "${p.name}" set`, { timeout: 1800 }); paint(); });
    const del = (p, e) => { e.preventDefault(); store.set('options.presets', presets().filter((x) => x !== p && !(x.name === p.name && x.tab === p.tab))); paint(); };
    return el('div', { class: 'opt-presets' }, el('span', { class: 'opt-h2', text: 'Presets' }),
      mine.map((p) => el('button', { type: 'button', class: 'chip', text: p.name, title: `${p.lines.join('\n')}\n\nClick: set all of these · right-click: delete`, on: { click: () => apply(p), contextmenu: (e) => del(p, e) } })),
      btn('＋ Save as preset', 'Keep what you set in this tab under a name', () => savePreset(tab)));
  }
  async function savePreset(tab) {
    const v = vals();
    const lines = defs().filter((d) => D.tabOf(d.area) === tab && v[d.name] !== undefined).map((d) => D.lineOf(d.name, argFor(d, v[d.name])));
    if (!lines.length) { toast('Set a few options in this tab first: the preset keeps them.', { timeout: 3000 }); return; }
    const name = D.validName(await Modal.prompt('Save as preset', { placeholder: 'Name', label: `${lines.length} option${lines.length === 1 ? '' : 's'}: ${lines.slice(0, 4).join(' · ')}${lines.length > 4 ? ' …' : ''}` }));
    if (!name) return;
    store.set('options.presets', [...presets().filter((p) => !(p.name === name && p.tab === tab)), { name, tab, lines, at: Date.now() }]);
    paint();
  }
  function modesTab(agentId) {
    const cur = store.get(`options.mode.${agentId}`, null);
    const agent = H.agent(agentId);
    const cards = el('div', { class: 'opt-modes' }, D.MODES.map((m) => el('button', { type: 'button', class: `opt-mode${cur === m.id ? ' on' : ''}`, title: `${m.desc}\n\n${m.lines.join('\n')}`,
      on: { click: async () => { await runLines(m.lines, agentId); store.set(`options.mode.${agentId}`, m.id); toast(`${agent?.name || 'This chat'}: ${m.label} mode`, { timeout: 1800 }); paint(); } } },
    el('b', { text: `${m.icon} ${m.label}` }), el('span', { text: m.desc }))));
    const all = presets();
    const list = all.length ? el('div', { class: 'opt-presets' }, all.map((p) => el('button', { type: 'button', class: 'chip', text: `${p.name} · ${D.TABS.find((t) => t.id === p.tab)?.label || p.tab}`, title: `${p.lines.join('\n')}\n\nClick: set all of these · right-click: delete`,
      on: { click: () => runLines(p.lines, agentId).then(() => toast(`Preset "${p.name}" set`, { timeout: 1800 })), contextmenu: (e) => { e.preventDefault(); store.set('options.presets', presets().filter((x) => x !== p && !(x.name === p.name && x.tab === p.tab))); paint(); } } })))
      : el('p', { class: 'hint', text: 'No presets yet: set a few options in any tab, then “＋ Save as preset” at its bottom.' });
    return [el('h4', { class: 'opt-h', text: `Mode${agent ? ` · ${agent.name}` : ''}` }), cards, el('h4', { class: 'opt-h', text: 'Your presets' }), list];
  }

  // ---------- the drawer / page ----------
  function ctxNow() {
    const place = Commands.place?.() || 'chat';
    let agentId = H.activeId;
    if (!H.agent(agentId)) { try { agentId = SettingsFind.agentNow()?.id; } catch { agentId = H.claudeAgent()?.id; } }
    return { place, agentId };
  }
  function paint() {
    if (!sheet) return;
    const { body, tabs, ctx } = sheet;
    const q = sheet.search.value.trim().toLowerCase();
    for (const b of tabs.children) b.classList.toggle('on', !q && b.dataset.tab === ctx.tab);
    const scroll = body.scrollTop;
    if (q) {
      const words = q.split(/\s+/);
      const hit = defs().filter((d) => { const t = `${d.name} ${labelOf(d)} ${d.desc || ''} ${d.area} ${(d.aliases || []).join(' ')}`.toLowerCase(); return words.every((w) => t.includes(w)); });
      body.replaceChildren(...(hit.length ? rowsFor(hit.slice(0, 120)) : [el('p', { class: 'hint', text: 'Nothing by that name.' })]));
      return;
    }
    if (ctx.tab === 'modes') { body.replaceChildren(...modesTab(ctx.agentId)); return; }
    const list = defs().filter((d) => D.tabOf(d.area) === ctx.tab);
    body.replaceChildren(...[ctx.tab === 'chat' ? chatQuick(ctx.agentId) : null, ...rowsFor(list), presetBar(ctx.tab)].filter(Boolean));
    body.scrollTop = scroll;
  }
  function build(host, ctx, { page = false } = {}) {
    const tabs = el('nav', { class: 'opt-tabs', role: 'tablist' }, D.TABS.map((t) => el('button', { type: 'button', role: 'tab', dataset: { tab: t.id }, title: t.areas.join(', ') || 'Ways of working, and your presets', text: `${t.icon} ${t.label}`,
      on: { click: () => { sheet.ctx.tab = t.id; sheet.search.value = ''; store.set(`options.tab.${ctx.place}`, t.id); paint(); sheet.body.scrollTop = 0; } } })));
    const search = el('input', { type: 'search', class: 'opt-search', placeholder: 'Find an option…', spellcheck: false, attrs: { 'aria-label': 'Find an option' } });
    search.addEventListener('input', () => paint());
    const pinned = () => store.get(`options.pin.${ctx.place}`, false);
    const pin = btn('📌', '', () => { store.set(`options.pin.${ctx.place}`, !pinned()); pin.classList.toggle('on', pinned()); pin.title = pinTitle(); });
    const pinTitle = () => (pinned() ? 'Pinned: opens by itself in this window (click to unpin)' : 'Keep these options open in this window');
    pin.title = pinTitle(); pin.classList.toggle('on', pinned());
    const close = btn('✕', 'Close (Esc)', () => hide());
    const where = ctx.place === 'chat' ? (H.agent(ctx.agentId)?.name || 'Chat') : (typeof Tools !== 'undefined' && Tools.get?.(ctx.place)?.name) || ctx.place;
    const head = el('header', { class: 'opt-head' }, el('b', { text: '⋯ Options' }), el('span', { class: 'opt-where', text: where }), search, page ? null : pin, page ? null : close);
    const body = el('div', { class: 'opt-body' });
    const root = el(page ? 'div' : 'aside', { class: `opt-sheet${page ? ' opt-page' : ''}`, attrs: { 'aria-label': 'Options' } }, head, tabs, body);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !page) { e.stopPropagation(); if (search.value) { search.value = ''; paint(); } else hide(); } });
    host.append(root);
    sheet = { root, body, tabs, search, ctx, page, sid: sidNow() };
    paint();
    return root;
  }
  async function ready() {
    if (typeof SettingsFind === 'undefined') { try { await window.loadSettingsFind?.(); } catch { /* switches show the last value set here */ } }
  }
  async function open({ agentId, place, tab } = {}) {
    await ready();
    const now = ctxNow();
    place ||= now.place;
    const ctx = { place, agentId: agentId || now.agentId, tab: tab || store.get(`options.tab.${place}`, null) || D.PLACE_TAB[place] || 'chat' };
    if (sheet && !sheet.page) { if (sheet.ctx.place === ctx.place && sheet.ctx.agentId === ctx.agentId && !tab) { hide(); return null; } hide(); }
    const root = build(document.body, ctx);
    root.querySelector('.opt-search').focus({ preventScroll: true });
    return root;
  }
  function hide() { if (sheet && !sheet.page) { sheet.root.remove(); sheet = null; } }
  // 📌: a pinned window opens its options by itself when you come back to it
  const sidNow = () => (H.activeId ? H.surfaceIdFor?.(H.activeId) : '') || '';
  addEventListener('hearth:view', () => setTimeout(() => {
    if (sheet && !sheet.page && sheet.sid === sidNow()) return; // the same window (a re-render, a setting)
    if (sheet && !sheet.page) hide();
    const place = Commands.place?.() || 'chat';
    if (!sheet && store.get(`options.pin.${place}`, false)) open({ place });
  }, 0));
  // Settings' switches changed elsewhere (a command, the chat): the drawer follows
  let rerun = 0;
  if (typeof Commands !== 'undefined') Commands.onRun?.(() => {
    if (!sheet || sheet.root.contains(document.activeElement)) return;
    clearTimeout(rerun); rerun = setTimeout(() => { if (sheet) paint(); }, 300);
  });

  // the rail page (⚙ Options): every tab, for the main chat
  if (typeof Tools !== 'undefined') {
    Tools.define({
      id: 'options', name: 'Options', icon: '⚙', color: '#9fd3ff',
      description: 'Every option in tabs: switches, sliders, choices, modes and presets (hover for what each does)',
      mount: async (body) => { await ready(); build(body, { place: 'options', agentId: H.claudeAgent()?.id, tab: store.get('options.tab.options', 'chat') }, { page: true }); },
      onShow() { if (sheet?.page) paint(); },
      commands: [{ label: 'Options: every option in tabs', run: () => activate('tool:options') }],
    });
  }
  if (typeof Commands !== 'undefined' && !Commands.get('options')) {
    Commands.register({
      name: 'options', area: 'App', args: '[tab]', aliases: ['opts'],
      desc: 'Every option in tabs (switches, sliders, choices, modes, presets): the ⋯ panel',
      complete: () => D.TABS.map((t) => ({ value: t.id, label: t.label })),
      run: (args, ctx) => { const t = D.TABS.find((x) => x.id === String(args || '').trim().toLowerCase()); open({ agentId: ctx.agentId, tab: t?.id }); return ''; },
    });
  }
  return { open, hide, paint, controlOf, get sheet() { return sheet; } };
})();
