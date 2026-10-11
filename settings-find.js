// Settings, findable (round 18, tidy): the owner asked for fewer visible choices and one place for every switch.
// Loaded the first time Settings opens (appui.js), nothing at startup. It adds to the Settings dialog:
// - a search field on top: plain words filter every row of every section (the folded "More settings" opens when a
//   match is inside it); /settings <words> opens Settings already filtered
// - "Switches": every on / off that otherwise lives in a chat command or a ⋯ menu, grouped by area, each with what it
//   costs (tokens on every message, GPU / speed, or free) and its command; the rare ones fold under More settings.
// A switch runs its own chat command (so Settings, the command and the menus never disagree) and reads its state back
// from where that command keeps it. Agent tool switches act on the agent you came from (a docked director in a tool).
const SettingsFind = (() => {
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
  const fx = () => { try { return Look.fx() || {}; } catch { return {}; } };
  const pref = (k) => { try { return ChatUX.pref(k); } catch { return undefined; } };
  // the agent a per-agent switch acts on: the chat you're in, or the director docked beside the tool you're in
  function agentNow() {
    const id = H.activeId;
    const a = id && H.agent(id);
    if (a?.mode === 'native') return a;
    const sid = String(id ? H.surfaceIdFor(id) : '');
    return (sid.startsWith('tool:') && Tools.dockedAgent?.(sid.slice(5))) || H.claudeAgent();
  }
  const ag = (k) => () => Boolean(agentNow()?.[k]);
  // cost: tokens (added to every message of that agent), gpu (a little drawing work), or free
  const tok = (n) => ({ kind: 'tokens', text: `≈ ${n.toLocaleString('en-US')} tokens a message` });
  const GPU = { kind: 'speed', text: 'a little GPU' };
  const FREE = { kind: 'free', text: 'free' };
  // area · label · cmd (on / off args, or choices) · get() · cost · more (folded under More settings)
  const SWITCHES = [
    { area: 'Chat', label: 'Enter sends (Shift+Enter: a new line)', cmd: 'enter-sends', get: () => store.get('chat.enterSends', true), cost: FREE },
    { area: 'Chat', label: 'Fold long replies', cmd: 'autofold', get: () => store.get('chat.autoFold', true), cost: FREE },
    { area: 'Chat', label: 'Name new chats from what they say', cmd: 'auto-title', get: () => store.get('chat.autoTitle', false), cost: FREE },
    { area: 'Chat', label: 'Paste smartly (links, code, tables)', cmd: 'smart-paste', get: () => store.get('chat.smartPaste', true), cost: FREE, more: true },
    { area: 'Chat', label: 'A chime when a reply ends', cmd: 'chime', get: () => store.get('chat.chime', false), cost: FREE, more: true },
    { area: 'Chat', label: 'Read replies aloud as they arrive', cmd: 'read', on: 'auto on', off: 'auto off', get: () => store.get('chat.autoRead', false), cost: FREE, more: true },
    { area: 'Chat', label: '“Use the board”, “render it again”: your words point at what the chat works with', cmd: 'chat-context', on: 'auto on', off: 'auto off', get: () => store.get('chat.ctxAuto', true) !== false, cost: { kind: 'tokens', text: 'one short line when it applies' }, more: true },
    { area: 'Chat', label: 'Commands written in replies are clickable', cmd: 'cmd-links', get: () => lsGet('cmdbar.links', true), cost: FREE, more: true },
    { area: 'Chat', label: 'Wrap long code lines', cmd: 'wrap', get: () => Boolean(pref('wrap')), cost: FREE, more: true },
    { area: 'Chat', label: 'Message numbers', cmd: 'numbers', get: () => Boolean(pref('numbers')), cost: FREE, more: true },
    { area: 'Chat', label: 'Spell check in the message box', cmd: 'spell', get: () => pref('spell') !== false, cost: FREE, more: true },
    { area: 'Agent tools', label: 'Board tools: it sees and arranges your mood board', cmd: 'board-tools', get: ag('boardTools'), cost: tok(1000) },
    { area: 'Agent tools', label: 'Capture tools: screenshots, recordings, video frames', cmd: 'capture-tools', get: ag('captureTools'), cost: tok(550) },
    { area: 'Agent tools', label: 'Directors build in node graphs', cmd: 'nodes-director', get: () => { const d = H.config.agents.filter((x) => x.threeTools); return d.length ? d[0].nodesTool !== false : undefined; }, cost: tok(75) },
    { area: 'Agent tools', label: 'Directors report their progress (the bars)', cmd: 'progress', on: 'tags on', off: 'tags off', get: () => H.agents().some((a) => a.progressTag), cost: tok(30), more: true },
    { area: 'Agent tools', label: 'A screenshot after each director edit', cmd: 'director-autoshot', get: () => store.get('director.autoShot', false), cost: { kind: 'tokens', text: 'a picture per edit' }, more: true },
    { area: 'Agent tools', label: 'App windows tools (Meshy, Suno…)', cmd: 'apps-tools', get: ag('appsTools'), cost: tok(460), more: true },
    { area: 'Agent tools', label: 'Adobe tools', cmd: 'adobe-tools', get: ag('adobeTools'), cost: tok(300), more: true },
    { area: 'Agent tools', label: 'Publishing tools (it asks before anything goes public)', cmd: 'deploy-tools', get: ag('deployTools'), cost: tok(230), more: true },
    { area: 'Look and speed', label: 'Animation', cmd: 'motion', choices: ['full', 'calm', 'off'], get: () => fx().motion || 'full', cost: { kind: 'speed', text: 'calm / off: lighter' } },
    { area: 'Look and speed', label: 'Sparkles when you click', cmd: 'sparkles', get: () => !store.get('juice.off', false), cost: GPU },
    { area: 'Look and speed', label: 'Textures (brushed metal, grain, glass)', cmd: 'texture', get: () => fx().texture !== false, cost: GPU, more: true },
    { area: 'Look and speed', label: 'Forged tooltips', cmd: 'tips', get: () => fx().tips !== false, cost: FREE, more: true },
    { area: 'Look and speed', label: 'Spacing', cmd: 'density', choices: ['compact', 'normal', 'comfortable'], get: () => fx().density || 'normal', cost: FREE, more: true },
    { area: 'App', label: 'The pick-up card when Hearth opens', cmd: 'resume', get: () => store.get('speed.resume', true) !== false, cost: FREE },
    { area: 'App', label: 'A “Did you know?” now and then', cmd: 'tip', get: () => !store.get('discover.tips', {}).off, cost: FREE },
    { area: 'App', label: 'Weekly tidy: never-used buttons go behind Alt', cmd: 'habits', on: 'tidy on', off: 'tidy off', get: () => store.get('habits.tidy', true) !== false, cost: FREE, more: true },
    { area: 'App', label: 'Install updates by themselves', cmd: 'update', on: 'auto on', off: 'auto off', get: () => store.get('update.auto', true) !== false, cost: FREE, more: true },
    { area: 'App', label: 'Pause every command timer', cmd: 'timers-pause', get: () => lsGet('cmdbar.timersPaused', false), cost: FREE, more: true },
    { area: 'Board', label: 'Snap to other items (guides)', cmd: 'board-snap', cost: FREE, more: true },
    { area: 'Board', label: 'Snap to a grid', cmd: 'board-grid', cost: FREE, more: true },
    { area: 'Board', label: 'Minimap', cmd: 'board-minimap', choices: ['auto', 'on', 'off'], cost: FREE, more: true },
  ];
  // only what exists in this build (a command another stream removed drops its row)
  const live = () => SWITCHES.filter((s) => typeof Commands === 'undefined' || Commands.get(s.cmd));
  const stateOf = (s) => { try { return s.get ? s.get() : undefined; } catch { return undefined; } };

  function costChip(c) { return c ? el('span', { class: `sf-cost sf-${c.kind}`, text: c.text, title: c.kind === 'tokens' ? 'Added to what the agent reads (on every message while it\'s on)' : c.kind === 'speed' ? 'Drawing work for your graphics card' : 'Costs nothing' }) : null; }
  async function run(s, arg, row) {
    const a = agentNow();
    const note = row.querySelector('.sf-said');
    const said = (t) => { if (note && t) note.textContent = String(t).replace(/[*`]/g, '').slice(0, 160); };
    await Commands.tryRun(`/${s.cmd} ${arg}`.trim(), a?.id, undefined, { source: 'settings', say: said, note: said, error: (m) => { said(m); row.classList.add('sf-err'); } });
    paint(row, s);
  }
  function paint(row, s) {
    const v = stateOf(s);
    for (const b of row.querySelectorAll('.sf-seg button')) {
      const on = v === undefined ? false : s.choices ? b.dataset.v === v : (b.dataset.v === 'on') === Boolean(v);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    }
  }
  function rowOf(s) {
    const opts = s.choices || ['on', 'off'];
    const row = el('div', { class: 'sf-row', dataset: { find: `${s.area} ${s.label} ${s.cmd} ${s.cost?.text || ''} ${s.cost?.kind || ''} ${opts.join(' ')}`.toLowerCase() } },
      el('div', { class: 'sf-text' }, el('span', { class: 'sf-label', text: s.label }), el('span', { class: 'sf-meta' }, costChip(s.cost), el('code', { text: `/${s.cmd}` })), el('span', { class: 'sf-said' })),
      el('div', { class: 'sf-seg', role: 'group', attrs: { 'aria-label': s.label } }, ...opts.map((o) => el('button', { type: 'button', class: 'ghost small', dataset: { v: o }, text: o === 'on' ? 'On' : o === 'off' ? 'Off' : o[0].toUpperCase() + o.slice(1),
        on: { click: () => run(s, s.choices ? o : o === 'on' ? (s.on || 'on') : (s.off || 'off'), row).catch((e) => toast(e.message, { type: 'error' })) } }))));
    paint(row, s);
    return row;
  }
  // the switches as settings sections: common ones open, rare ones for the More fold
  function sections(section) {
    const by = (more) => { const m = new Map(); for (const s of live().filter((x) => Boolean(x.more) === more)) { if (!m.has(s.area)) m.set(s.area, []); m.get(s.area).push(s); } return m; };
    const a = agentNow();
    const head = (area) => (area === 'Agent tools' && a ? `Agent tools · ${a.name}` : area);
    const make = (more) => [...by(more)].map(([area, list]) => section(more ? `${head(area)} · more` : head(area), ...list.map(rowOf)));
    return { open: make(false), more: make(true) };
  }

  // ---------- search ----------
  function searchBox(form) {
    const input = el('input', { class: 'sf-search', type: 'search', placeholder: 'Search settings…', spellcheck: false, autocomplete: 'off', attrs: { 'aria-label': 'Search settings' } });
    const none = el('p', { class: 'hint sf-none', hidden: true, text: 'Nothing here by that name. /commands finds every command.' });
    input.addEventListener('input', () => filter(form, input.value, none));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; filter(form, '', none); } });
    return { input, none };
  }
  // a row: a switch, a field (label), a check, a button row; a section shows when its title or any row matches
  const ROWS = ':scope > :not(h3)';
  function filter(form, q, none) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (node) => { const t = `${node.dataset?.find || ''} ${node.textContent} ${[...node.querySelectorAll('input[placeholder], select option:checked')].map((x) => x.placeholder || x.textContent).join(' ')}`.toLowerCase(); return words.every((w) => t.includes(w)); };
    let any = false;
    for (const sec of form.querySelectorAll('.settings-section')) {
      const title = hit(sec.querySelector('h3') || sec);
      let n = 0;
      for (const r of sec.querySelectorAll(ROWS)) { const show = !words.length || title || hit(r); r.hidden = !show; if (show) n += 1; }
      sec.hidden = Boolean(words.length) && !n;
      if (!sec.hidden && words.length) any = true;
    }
    const more = form.querySelector('details.settings-more');
    if (more) { if (words.length) { more.dataset.wasOpen ??= more.open ? '1' : ''; more.open = [...more.querySelectorAll('.settings-section')].some((s) => !s.hidden); } else if (more.dataset.wasOpen != null) { more.open = Boolean(more.dataset.wasOpen); delete more.dataset.wasOpen; } }
    if (none) none.hidden = !words.length || any;
  }

  let styled = false;
  function style() {
    if (styled) return; styled = true;
    document.head.append(el('style', { text: `
.sf-search { width: 100%; font-size: 13.5px; padding: 7px 10px; border-radius: 9px; margin: 2px 0 4px; }
.sf-row { display: flex; align-items: center; gap: 12px; padding: 3px 0; }
.sf-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sf-label { font-size: 13.5px; color: var(--text); }
.sf-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
.sf-meta code { font-size: 10.5px; opacity: .75; }
.sf-cost { border: 1px solid var(--line); border-radius: 99px; padding: 0 7px; white-space: nowrap; }
.sf-tokens { color: var(--fh-gold, #ffd75e); border-color: color-mix(in srgb, var(--fh-gold, #ffd75e) 45%, transparent); }
.sf-speed { color: var(--fh-info, #6cc4ff); border-color: color-mix(in srgb, var(--fh-info, #6cc4ff) 45%, transparent); }
.sf-said:empty { display: none; }
.sf-said { font-size: 11px; color: var(--muted); }
.sf-err .sf-said { color: var(--fh-stop, #ff6b6b); }
.sf-seg { display: flex; flex: none; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.sf-seg button { border: 0; border-radius: 0; padding: 3px 10px; min-width: 42px; }
.sf-seg button.on { background: color-mix(in srgb, var(--accent) 26%, transparent); color: var(--text); }
.settings-section[hidden], .sf-row[hidden] { display: none; }
` }));
  }

  // ---------- into the dialog ----------
  // mount(form, section, { query }): the search goes under the title, the open switches after General / Appearance,
  // the rare ones at the top of More settings
  function mount(form, section, { query = '' } = {}) {
    style();
    const { open, more } = sections(section);
    const h2 = form.querySelector('h2');
    const { input, none } = searchBox(form);
    h2?.after(input, none);
    const anchor = form.querySelector('details.settings-more');
    if (anchor) { anchor.before(...open); anchor.querySelector('summary')?.after(...more); } else form.append(...open, ...more);
    const sum = anchor?.querySelector('summary');
    if (sum) sum.textContent = 'More settings: rarer switches, startup, tray, hotkey, spell check, rail tools, engines, folders, backups';
    if (query) { input.value = query; filter(form, query, none); }
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    return input;
  }
  return { SWITCHES, live, mount, filter, agentNow };
})();
