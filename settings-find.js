// Settings, findable (round 18, tidy): the owner asked for fewer visible choices and one place for every switch.
// Loaded the first time Settings opens (appui.js), nothing at startup. It adds to the Settings dialog:
// - a search field on top: plain words filter every row of every section (the folded Advanced opens when a match is
//   inside); /settings <words> opens Settings already filtered
// - the on / off switches that otherwise live in a chat command or a ⋯ menu, each in the section it belongs to, each
//   explained on hover with what it costs (tokens, a little GPU, or nothing).
// A switch runs its own chat command out of sight (so Settings, the command and the menus never disagree) and reads
// its state back from where that command keeps it. (round 27, simplify2) No command name is shown any more, and
// what belongs to an AI (the tools it can use, the directors' habits) lives in ⋯ AI setup, not here.
const SettingsFind = (() => {
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
  const pref = (k) => { try { return ChatUX.pref(k); } catch { return undefined; } };
  // the agent a command runs for: the chat you're in, or the director docked beside the tool you're in
  function agentNow() {
    const id = H.activeId;
    const a = id && H.agent(id);
    if (a?.mode === 'native') return a;
    const sid = String(id ? H.surfaceIdFor(id) : '');
    return (sid.startsWith('tool:') && Tools.dockedAgent?.(sid.slice(5))) || H.claudeAgent();
  }
  // (round 39, settingscalm) the board's switches read their state back once the board is in (unknown before)
  const board = (k, f) => { try { return typeof Board !== 'undefined' && Board.prefs ? f(Board.prefs() || {}) : undefined; } catch { return undefined; } };
  // cost: tokens (added to what the AI reads), speed (a little drawing work), or free
  const GPU = { kind: 'speed', text: 'a little GPU' };
  const FREE = { kind: 'free', text: 'free' };
  // home (where the row sits: look / updates open; chats / hearth / board under Advanced) · label · tip (what it
  // does, on hover) · cmd (on / off args, or choices; never shown) · get() · cost.
  // (round 27, simplify2) Settings is about Hearth itself: what an AI can use (board, capture, apps, Adobe, publishing
  // tools) lives in ⋯ AI setup only, the directors' habits (nodes, progress bars, a picture per edit) in its "In the
  // Lab" rows, and Animation / Textures / Tooltips / Spacing in Look's own Advanced fold (they were listed twice).
  const SWITCHES = [
    { home: 'look', label: 'Sparkles when you click', tip: 'A small burst of light on the buttons you press', cmd: 'sparkles', get: () => !store.get('juice.off', false), cost: GPU },
    { home: 'updates', label: 'Install updates by themselves', tip: 'When something new is out, Hearth gets it and says so. Off: the ⬆ button waits for your click', cmd: 'update', on: 'auto on', off: 'auto off', get: () => store.get('update.auto', true) !== false, cost: FREE },
    { home: 'chats', label: 'Enter sends (Shift+Enter: a new line)', tip: 'Off: Enter makes a new line and Ctrl/⌘+Enter sends', cmd: 'enter-sends', get: () => store.get('chat.enterSends', true), cost: FREE },
    { home: 'chats', label: 'Fold long replies', tip: 'Very long replies show their start, with “Show full reply” under them', cmd: 'autofold', get: () => store.get('chat.autoFold', true), cost: FREE },
    { home: 'chats', label: 'Name new chats from what they say', tip: 'A new chat gets a short title from its first messages', cmd: 'auto-title', get: () => store.get('chat.autoTitle', false), cost: FREE },
    { home: 'chats', label: 'Paste smartly (links, code, tables)', tip: 'Pasted links, code and tables keep their shape in the message box', cmd: 'smart-paste', get: () => store.get('chat.smartPaste', true), cost: FREE },
    { home: 'chats', label: 'A chime when a reply ends', tip: 'A soft sound when an AI finishes answering', cmd: 'chime', get: () => store.get('chat.chime', false), cost: FREE },
    { home: 'chats', label: 'Read replies aloud as they arrive', tip: 'Every reply is spoken as it comes in (Alt+R reads one when you ask)', cmd: 'read', on: 'auto on', off: 'auto off', get: () => store.get('chat.autoRead', false), cost: FREE },
    { home: 'chats', label: '“Use the board”, “render it again”: your words point at what the chat works with', tip: 'When your words point at the board, the Lab or a render, one short line tells the chat which one (you see it under your message)', cmd: 'chat-context', on: 'auto on', off: 'auto off', get: () => store.get('chat.ctxAuto', true) !== false, cost: { kind: 'tokens', text: 'one short line when it applies' } },
    { home: 'chats', label: 'Actions named in replies are clickable', tip: 'When a reply names something Hearth can do, you can click it to do it', cmd: 'cmd-links', get: () => lsGet('cmdbar.links', true), cost: FREE },
    { home: 'chats', label: 'Wrap long code lines', tip: 'Long lines of code wrap instead of scrolling sideways', cmd: 'wrap', get: () => Boolean(pref('wrap')), cost: FREE },
    { home: 'chats', label: 'Message numbers', tip: 'A small number under each message', cmd: 'numbers', get: () => Boolean(pref('numbers')), cost: FREE },
    { home: 'chats', label: 'Spell check in the message box', tip: 'Red underlines under misspelled words while you type', cmd: 'spell', get: () => pref('spell') !== false, cost: FREE },
    { home: 'start', label: 'The pick-up card when Hearth opens', tip: 'A small card that takes you back to your last chat, scene or render', cmd: 'resume', get: () => store.get('speed.resume', true) !== false, cost: FREE },
    // (round 38, hintcalm) one switch for every tip that shows by itself (hints.js); it took the "Did you know?" row's
    // place (that tip no longer comes by itself since round 31; /tip still shows one)
    { home: 'updates', label: 'Don\'t show tips', tip: 'No tips, cards or suggestion lines by themselves (What can I do here?, What\'s new, hints, Continue lighter…). Errors, sign-in, offline and usage-limit notes still show. The ⋯ of each window still has ✦ What can I do here?', cmd: 'hints', on: 'off', off: 'on', get: () => window.Hints?.off?.() === true, cost: FREE },
    { home: 'hearth', label: 'Weekly tidy: never-used buttons go behind Alt', tip: 'Once a week, buttons you never press wait behind Alt (hold it to see them)', cmd: 'habits', on: 'tidy on', off: 'tidy off', get: () => store.get('habits.tidy', true) !== false, cost: FREE },
    { home: 'hearth', label: 'Pause every timer', tip: 'Holds the repeating and scheduled actions you set up, until you turn this off', cmd: 'timers-pause', get: () => lsGet('cmdbar.timersPaused', false), cost: FREE },
    { home: 'board', label: 'Snap to other items (guides)', tip: 'Items line up with their neighbours while you drag them', cmd: 'board-snap', get: () => board('snap', (p) => p.snap !== false), cost: FREE },
    { home: 'board', label: 'Snap to a grid', tip: 'Items land on an invisible grid while you drag them', cmd: 'board-grid', get: () => board('grid', (p) => Boolean(p.grid)), cost: FREE },
    { home: 'board', label: 'Minimap', tip: 'The small map of the whole board in a corner (Auto: only when the board is big)', cmd: 'board-minimap', choices: ['auto', 'on', 'off'], get: () => board('minimap', (p) => p.minimap || 'auto'), cost: FREE },
  ];
  // only what exists in this build (a command another stream removed drops its row)
  const live = () => SWITCHES.filter((s) => typeof Commands === 'undefined' || Commands.get(s.cmd));
  const stateOf = (s) => { try { return s.get ? s.get() : undefined; } catch { return undefined; } };
  const state = (cmd) => { const s = SWITCHES.find((x) => x.cmd === cmd); return s ? stateOf(s) : undefined; }; // (round 39) for the folds' lines
  const COST = { tokens: 'Adds to what the AI reads', speed: 'A little drawing work for your graphics card', free: 'Costs nothing' };
  const tipOf = (s) => `${s.tip}${s.cost ? `\n(${s.cost.kind === 'free' ? COST.free : `${COST[s.cost.kind]}: ${s.cost.text}`})` : ''}`;

  async function run(s, arg, row) {
    const a = agentNow();
    const note = row.querySelector('.sf-said');
    const said = (t) => { if (note && t) note.textContent = String(t).replace(/[*`]/g, '').replace(/\s*\(\/[a-z][^)]*\)/gi, '').slice(0, 160); };
    await Commands.tryRun(`/${s.cmd} ${arg}`.trim(), a?.id, undefined, { source: 'settings', say: said, note: said, error: (m) => { said(m); row.classList.add('sf-err'); } });
    paint(row, s);
    row.dispatchEvent(new CustomEvent('sf-changed', { bubbles: true, detail: { cmd: s.cmd } })); // (round 39) the fold's line follows
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
    // only a token cost shows on the row (it's the one that matters, the app's #1 rule); the rest is on hover
    const chip = s.cost?.kind === 'tokens' ? el('span', { class: 'sf-cost sf-tokens', text: s.cost.text }) : null;
    const row = el('div', { class: 'sf-row', title: tipOf(s), dataset: { find: `${s.home} ${s.label} ${s.tip} ${s.cmd} ${s.cost?.text || ''} ${s.cost?.kind || ''} ${opts.join(' ')}`.toLowerCase() } },
      el('div', { class: 'sf-text' }, el('span', { class: 'sf-label', text: s.label }), chip ? el('span', { class: 'sf-meta' }, chip) : null, el('span', { class: 'sf-said' })),
      el('div', { class: 'sf-seg', role: 'group', attrs: { 'aria-label': s.label } }, ...opts.map((o) => el('button', { type: 'button', class: 'ghost small', dataset: { v: o }, text: o === 'on' ? 'On' : o === 'off' ? 'Off' : o[0].toUpperCase() + o.slice(1),
        on: { click: () => run(s, s.choices ? o : o === 'on' ? (s.on || 'on') : (s.off || 'off'), row).catch((e) => toast(e.message, { type: 'error' })) } }))));
    paint(row, s);
    return row;
  }

  // ---------- search ----------
  function searchBox(form) {
    const input = el('input', { class: 'sf-search', type: 'search', placeholder: 'Search settings…', spellcheck: false, autocomplete: 'off', attrs: { 'aria-label': 'Search settings' } });
    const none = el('p', { class: 'hint sf-none', hidden: true, text: 'Nothing here by that name. Try other words, or just ask a chat.' });
    input.addEventListener('input', () => filter(form, input.value, none));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; filter(form, '', none); } });
    return { input, none };
  }
  // a row: a switch, a field (label), a check, a button row; a section shows when its title or any row matches
  const ROWS = ':scope > :not(h3)';
  function filter(form, q, none) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (node) => { const t = `${node.dataset?.find || ''} ${node.title || ''} ${node.textContent} ${[...node.querySelectorAll('input[placeholder], select option:checked, [title]')].map((x) => `${x.placeholder || ''} ${x.title || ''} ${x.matches('option') ? x.textContent : ''}`).join(' ')}`.toLowerCase(); return words.every((w) => t.includes(w)); };
    let any = false;
    const found = []; // rows that match (a fold itself doesn't count: what's inside it does)
    for (const sec of form.querySelectorAll('.settings-section')) {
      const title = hit(sec.querySelector(':scope > h3') || sec);
      let n = 0;
      for (const r of sec.querySelectorAll(ROWS)) {
        const show = !words.length || title || hit(r);
        r.hidden = !show; if (show) n += 1;
        if (show && words.length && !r.matches('details')) found.push(r);
      }
      sec.hidden = Boolean(words.length) && !n;
      if (!sec.hidden && words.length) any = true;
    }
    // (round 39, settingscalm) every fold (Advanced and the folds in it and in the sections) opens while a match is
    // inside it, and goes back to how it was when the search is emptied
    let toggled = false;
    for (const d of form.querySelectorAll('details.settings-more, details.sc-fold')) {
      const was = d.open;
      if (words.length) { d.dataset.wasOpen ??= d.open ? '1' : ''; d.open = found.some((r) => d.contains(r) && !r.closest('.settings-section[hidden]')); }
      else if (d.dataset.wasOpen != null) { d.open = Boolean(d.dataset.wasOpen); delete d.dataset.wasOpen; }
      if (d.open !== was) toggled = true;
    }
    // a fold opened inside a fold that just opened stays "not rendered" (checkVisibility false, no box) until the
    // next layout, which a busy page can push past a frame: lay the matches out now, in the same task as the typing
    if (toggled) void form.offsetHeight;
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
.sf-cost { border: 1px solid var(--line); border-radius: 99px; padding: 0 7px; white-space: nowrap; }
.sf-tokens { color: var(--fh-gold, #ffd75e); border-color: color-mix(in srgb, var(--fh-gold, #ffd75e) 45%, transparent); }
.sf-said:empty { display: none; }
.sf-said { font-size: 11px; color: var(--muted); }
.sf-err .sf-said { color: var(--fh-stop, #ff6b6b); }
.sf-seg { display: flex; flex: none; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.sf-seg button { border: 0; border-radius: 0; padding: 3px 10px; min-width: 42px; }
.sf-seg button.on { background: color-mix(in srgb, var(--accent) 26%, transparent); color: var(--text); }
.settings-section[hidden], .sf-row[hidden] { display: none; }
.settings-ai { display: flex; align-items: center; gap: 10px; margin: 2px 0 2px; font-size: 12.5px; color: var(--muted); }
.settings-ai .spacer { flex: 1; }
/* (round 39, settingscalm) folds: the title, one line about where it stands (right), ▸ / ▾ (⋯ AI setup's pattern) */
.settings-dialog .sc-fold > summary.sc-sum { list-style: none; display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 4px; margin: 0; min-height: 30px; border-radius: 7px; font-size: 13.5px; color: var(--text); }
.settings-dialog .sc-fold > summary.sc-sum::-webkit-details-marker { display: none; }
.settings-dialog .sc-fold > summary.sc-sum::after { content: '▸'; flex: none; color: var(--muted); font-size: 11px; }
.settings-dialog .sc-fold[open] > summary.sc-sum::after { content: '▾'; }
.settings-dialog .sc-fold > summary.sc-sum:hover { background: var(--hover); }
.sc-title { flex: none; }
.sc-state { flex: 1; min-width: 0; text-align: right; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.settings-dialog .sc-fold[open]:not(.sc-adv) { padding: 0 0 6px 8px; border-left: 1px solid var(--line); }
.settings-dialog .sc-fold[open]:not(.sc-adv) > summary.sc-sum { margin-left: -8px; }
:root .settings-dialog details.sc-fold > .settings-section { border: 0; padding: 4px 0 0; background: none; box-shadow: none; }
:root .settings-dialog details.sc-fold > .settings-section > h3 { display: none; }
.settings-dialog .sc-adv { margin-top: 10px; }
.settings-dialog .sc-adv > summary.sc-sum .sc-title { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.settings-dialog .sc-adv[open] > summary.sc-sum { margin-bottom: 4px; }
.sc-row { display: flex; align-items: center; gap: 10px; }
.sc-row .spacer { flex: 1; }
.sc-line { font-size: 12.5px; color: var(--muted); }
.settings-dialog .look-split .look-featured { margin: 0; }
.ui-modal label.big-size-compact { margin: 0; flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: space-between; color: var(--text); }
.big-size-compact .big-size-label { font-weight: 400; font-size: 13.5px; }
` }));
  }

  // ---------- into the dialog ----------
  // mount(form, section, { query }): the search goes under the title, each switch into the section that has
  // data-home="<its home>" (made under Advanced when the dialog has none)
  function mount(form, section, { query = '' } = {}) {
    style();
    const h2 = form.querySelector('h2');
    const { input, none } = searchBox(form);
    h2?.after(input, none);
    const anchor = form.querySelector('details.settings-more');
    const NAMES = { chats: 'Chats', hearth: 'Housekeeping', board: 'Mood board', look: 'More looks and tweaks', updates: 'Updates and tips', start: 'Starting and closing' };
    for (const s of live()) {
      let home = form.querySelector(`.settings-section[data-home="${s.home}"]`);
      if (!home) { home = section(NAMES[s.home] || s.home); home.dataset.home = s.home; (anchor || form).append(home); }
      const at = home.querySelector(':scope > .sf-slot');
      if (at) at.before(rowOf(s)); else home.append(rowOf(s));
    }
    if (query) { input.value = query; filter(form, query, none); }
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    return input;
  }
  return { SWITCHES, live, mount, filter, agentNow, state };
})();
