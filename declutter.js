// Round 7 (declutter): less on screen, more under the pointer. The owner asked for "less info directly in my face
// and more submenus, while keeping a high amount of customisability; right click can be used more".
//   - REVEAL: secondary controls leave the surface. 'alt' ones show in place while Alt (⌥) is held (keys-ui.js puts
//     .reveal-alt on <html>; a double-tap of Alt keeps them out), 'hover' ones show when you point at their area.
//     All of it is one generated stylesheet: no element is touched, nothing runs per frame.
//   - Customise this…: every right-click menu ends with it. Pin a tucked control back onto its surface (or tuck it
//     away again), hide a button you never use, or show everything (/calm off).
//   - Right-click menus on what you point at: chat messages, code, links, the chat header and composer, the rail,
//     the chats panel, the Lab toolbar / sliders / layers / console / timeline, the director dock, toasts, notes,
//     memory rows, tool headers. Each ends with the same Customise this… entry.
// Everything here is also a chat command: /calm, /reveal, /customise, /pin-control, /unpin-control, /rightclick.
const Declutter = (() => {
  // ---------- what leaves the surface ----------
  // { id, area, label, sel, mode: 'alt' | 'hover', host (hover: the area you point at; sel is then written from inside
  // the host), keep (states that stay) }
  const LAB = 'Lab';
  const REVEAL = [
    // rail (both stay in the rail's ⋯ and Ctrl+K / right-click on the rail)
    { id: 'rail-add', area: 'Rail', label: '＋ Add an agent or website', sel: '#rail #add-btn' },
    { id: 'rail-palette', area: 'Rail', label: '⌕ Find anything (Ctrl+K)', sel: '#rail #palette-btn' },
    // (round 49, appcalm) full screen and the board drawer wait in the rail's ⋯ (Ctrl/⌘+K and their keys too); each stays
    // in the rail while it is on, so leaving it is where you'd look
    { id: 'rail-full', area: 'Rail', label: '⛶ Full screen', sel: '#rail #full-btn', keep: '.on' },
    { id: 'rail-drawer', area: 'Rail', label: 'Board drawer (Ctrl+Shift+M)', sel: '#rail .bd-rail-peek', keep: '.on' },
    // chats panel
    { id: 'panel-filter', area: 'Chats panel', label: '⏷ Filter chats', sel: '.panel-filter-btn', mode: 'hover', host: '#panel .panel-head', keep: '.on' },
    { id: 'panel-add', area: 'Chats panel', label: '＋ New chat in each group', sel: '.group-add', mode: 'hover', host: '#panel .group-head' },
    { id: 'panel-kind', area: 'Chats panel', label: 'NATIVE / DOCKED labels', sel: '.group-kind', mode: 'hover', host: '#panel .group-head' },
    { id: 'panel-tags', area: 'Chats panel', label: '#tags on chat rows', sel: '.item-tags', mode: 'hover', host: '#panel .item' },
    { id: 'panel-tokens', area: 'Chats panel', label: 'Token counts on chat rows', sel: '.item-tok', mode: 'hover', host: '#panel .item' },
    // a chat
    { id: 'chat-meta', area: 'Chat', label: 'Tokens-this-chat note in the header', sel: '.chat-meta', mode: 'hover', host: '.native-head' },
    { id: 'chat-ctx', area: 'Chat', label: 'Context size in the header', sel: '.ctx-meter', mode: 'hover', host: '.native-head', keep: '.warn, .high' },
    { id: 'chat-attach', area: 'Chat', label: '＋ Attach', sel: '.attach-btn', mode: 'hover', host: 'form.composer' },
    // (round 27, simplify2) ⚇ waits behind Alt: ◎ Missions does the same (jam, second opinion, side by side, debate),
    // right-click the chat box has ⚇ Work with Astra…, and it shows by itself while a mode is on
    { id: 'chat-collab', area: 'Chat', label: '⚇ Work with Astra', sel: '.collab-chip', keep: '.on' },
    { id: 'msg-actions', area: 'Chat', label: 'Copy / ⋯ under older messages', sel: '> .msg-foot :is(.copy-msg, .msg-more)', mode: 'hover', host: '.messages .msg:not(:last-child)' },
    { id: 'msg-meta', area: 'Chat', label: 'Time and number under messages', sel: '> .msg-foot :is(.msg-time, .msg-num)', mode: 'hover', host: '.messages .msg:not(:last-child)' },
    { id: 'msg-tokens', area: 'Chat', label: 'Token badges under older replies', sel: '> .msg-foot :is(.tok-badge, .mt-badge)', mode: 'hover', host: '.messages .msg:not(:last-child)' },
    // the docked director chat
    { id: 'dock-new', area: 'Director dock', label: '＋ New chat (Ctrl+N)', sel: '.tool-dock.dock-chat .native-head > button:last-of-type' },
    { id: 'dock-fold', area: 'Director dock', label: '⇥ Collapse the chat', sel: '.dd-strip .dd-fold' },
    { id: 'dock-chips', area: 'Director dock', label: 'Quick chips above the chat box', sel: '.tool-dock .dd-chips' },
    { id: 'dock-sum', area: 'Director dock', label: 'Tool-call summary text', sel: '.dd-sum', mode: 'hover', host: '.dd-strip' },
    // Lab toolbar
    { id: 'lab-palette', area: LAB, label: '🎨 Palettes', sel: '.three-toolbar .lab-palette, .tb-group .lab-palette' },
    { id: 'lab-refs', area: LAB, label: '🖼 References', sel: '[data-feature="References"]' },
    { id: 'lab-stage', area: LAB, label: '🖥 Stage window', sel: '.tb-group [data-feature="Stage window"]' },
    { id: 'lab-livecode', area: LAB, label: 'Live code checkbox', sel: '.three-toolbar > label.check' },
    { id: 'lab-stats', area: 'Lab preview', label: 'fps / draw-call line', sel: '> .three-stats', mode: 'hover', host: '.three-preview', focus: false, keep: '.fb-keep' }, // (round 64, framebar64: the fps + frame budget bar stay; the rest of the line waits for hover in tools/framebar.css)
    { id: 'lab-size', area: 'Lab preview', label: 'Pixel size readout', sel: '.stage-size', mode: 'hover', host: '.stage-pill', focus: false },
    // Lab timeline
    { id: 'tl-sizes', area: 'Lab timeline', label: '▤ ▭ ▁ timeline sizes', sel: '.media-bar .mb-size:not(.on)' },
    { id: 'tl-note', area: 'Lab timeline', label: '📌 Note (N)', sel: '.media-bar .mb-g-capture' },
    { id: 'tl-rare', area: 'Lab timeline', label: '× remove the song · volume · Q quantize taps', sel: '.media-bar :is(.mb-x, .mb-vol, .mb-quant)' },
    { id: 'tl-empty', area: 'Lab timeline', label: '"No music loaded" line', sel: '.mb-name', mode: 'hover', host: '.media-bar.mb-empty' },
    // Lab layers and sliders
    { id: 'ly-key', area: 'Lab layers', label: '◇ Keyframe buttons (until a layer is animated)', sel: '.kf-btn.kf-none', mode: 'hover', host: '.layers .ly-field' },
    { id: 'ly-timebtns', area: 'Lab layers', label: 'Whole song / Loop only (layer timing)', sel: '.layers .ly-timebtns' },
    { id: 'tw-steps', area: 'Lab sliders', label: '‹ › Shuffle steps (Shift+R)', sel: '[data-feature="Shuffle back"], [data-feature="Shuffle forward"]' },
    { id: 'tw-shuffle-opts', area: 'Lab sliders', label: '▾ Shuffle options (right-click Shuffle)', sel: '[data-feature="Shuffle options"]' },
    { id: 'tw-save-opts', area: 'Lab sliders', label: '▾ Save options (right-click Save)', sel: '[data-feature="Save options"]' },
    { id: 'tw-tip', area: 'Lab sliders', label: 'Ask for named sliders', sel: '.tweaks .tw-tip' },
    { id: 'tw-asks', area: 'Lab sliders', label: 'Ask the director', sel: '.tweaks .tw-asks' },
    { id: 'tw-badge', area: 'Lab sliders', label: '⚡ / ↻ / ○ badges on slider rows (how the sketch reads them)', sel: '.tw-badge', mode: 'hover', host: '.tw-row' },
    { id: 'tw-sec-reset', area: 'Lab sliders', label: '↺ on group titles', sel: '.tw-sec-btn', mode: 'hover', host: '.tw-sec-head' },
    // Lab console
    { id: 'tc-mode', area: 'Lab console', label: 'When the console shows', sel: '.three-console-head .tc-mode' },
    { id: 'tc-errors', area: 'Lab console', label: 'Errors only', sel: '.three-console-head > label.check' },
    { id: 'tc-copy', area: 'Lab console', label: 'Copy / Clear', sel: '.three-console-head > button[title^="Copy everything"], .three-console-head > button[title="Empty the console"]' },
    // notes: the head keeps New, Preview, ⋯ and ×; the foot keeps Send to Claude (right-click the panel for the rest)
    { id: 'notes-pin', area: 'Notes', label: '📌 Pin the note', sel: '.notes-head .notes-pin' },
    { id: 'notes-foot', area: 'Notes', label: 'Copy / Save as file / Delete under a note', sel: '.notes-foot > button:is(:nth-of-type(1), :nth-of-type(3), :nth-of-type(4))' },
    // long tab bars (Forgeheart's eleven): the first five and the open one stay, the rest wait behind Alt and in the
    // bar's right-click menu
    { id: 'tool-desc', area: 'Tabs', label: 'A tool’s one-line description in its header', sel: '.tool-desc', mode: 'hover', host: '.tool-head' },
    { id: 'tabs-more', area: 'Tabs', label: 'Forgeheart’s tabs after the fifth', sel: '.tool-surface[data-id="tool:forgeheart"] .tabbar > button:nth-child(n+6):not(.on)' },
    // memory: the dialog's rarer buttons
    { id: 'mem-foot', area: 'Memory', label: 'Edit as text… / Import… / Export…', sel: 'dialog.memory-facts .dialog-actions > button.ghost' },
    // memory rows: the per-fact controls show on the row you point at
    { id: 'mem-row', area: 'Memory', label: 'Category, expiry and who-remembers per fact', sel: '.memory-cat, .memory-move, button[title^="Set an expiry"]', mode: 'hover', host: '.memory-row' },
  ].map((r) => ({ mode: 'alt', ...r }));
  const byId = new Map(REVEAL.map((r) => [r.id, r]));
  const areas = () => [...new Set(REVEAL.map((r) => r.area))];
  // later surfaces add their own rows (polish8.js: the board, the editor, capture); same shape as REVEAL
  function addRules(list) {
    for (const r of list) { const x = { mode: 'alt', ...r }; if (byId.has(x.id)) continue; REVEAL.push(x); byId.set(x.id, x); }
    if (typeof paint === 'function') paint();
  }

  let pins = new Set(store.get('declutter.pins', []));
  // buttons you tucked yourself (Customise this… → Tuck “…” behind Alt): [{ sel, label, area }]
  let mine = store.get('declutter.mine', []);
  let off = store.get('declutter.off', false);
  const styleEl = el('style', { id: 'declutter-style' });
  document.head.append(styleEl);

  // One stylesheet from the table: tucked 'alt' controls are display:none until Alt; 'hover' ones fade until their
  // area is pointed at (or has the keyboard focus). Pinned ones and everything with /calm off stay as they were.
  // Every selector becomes its own plain rule (":is(a, b)" lists are expanded): a rule the style engine can file
  // under its last class / id is only tried on matching elements, while one big ":is(…)" list was tried on every
  // element at every style update (it tripled the style time of slider drags and streaming chats).
  const topSplit = (str) => { const out = []; let depth = 0; let cur = ''; for (const ch of str) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  function expand(sel) {
    return topSplit(sel).flatMap((one) => {
      const i = one.indexOf(':is(');
      if (i < 0) return [one];
      let depth = 0; let j = i + 3;
      for (; j < one.length; j += 1) { if (one[j] === '(') depth += 1; if (one[j] === ')') { depth -= 1; if (!depth) break; } }
      return topSplit(one.slice(i + 4, j)).flatMap((opt) => expand(`${one.slice(0, i)}${opt}${one.slice(j + 1)}`));
    });
  }
  // (round 173, alt173) what Alt shows is marked on the elements themselves: while Alt (a latch, /reveal) shows the
  // tucked controls, exactly those carry .alt-reveal (found with their own selectors), and the 'hover' ones whose last
  // part names no class or id (polish8's `.bdd-foot > span`, the memory rows' `button[title^=…]`) carry .alt-hover. The
  // rules keyed on .reveal-alt name only those classes: `.reveal-alt <x>` made each Alt restyle every element <x>'s last
  // part could match (every button, span, titled or data-feature element of the page: ≈ 850, 17–26 ms per hold).
  // Hidden is still plain CSS (`:root <x>:not(.alt-reveal)`): nothing is marked, and nothing watched, while Alt is up.
  const MARK = 'alt-reveal'; const HMARK = 'alt-hover';
  const sels = { [MARK]: '', [HMARK]: '' };
  const marks = { [MARK]: new Set(), [HMARK]: new Set() };
  let shown = false;
  // the last compound of a selector names a class or an id (outside [...] and (...)): narrow already
  const named = (x) => {
    let depth = 0; let br = 0; let last = '';
    for (const ch of x) {
      if (ch === '[') br += 1; else if (ch === ']') br -= 1;
      else if (ch === '(') depth += 1; else if (ch === ')') depth -= 1;
      if (!depth && !br && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) { last = ''; continue; }
      if (!depth && !br && ch !== ')' && ch !== ']') last += ch;
    }
    return last.includes('.') || last.includes('#');
  };
  const usable = (x) => { try { document.querySelector(x); return true; } catch { return false; } };
  function markWith(cls) {
    const was = marks[cls];
    const now = new Set(shown && sels[cls] ? document.querySelectorAll(sels[cls]) : []);
    for (const n of was) if (!now.has(n)) n.classList.remove(cls);
    for (const n of now) if (!was.has(n)) n.classList.add(cls);
    marks[cls] = now;
  }
  let domMO = null; let remarkReq = 0;
  function remark() {
    cancelAnimationFrame(remarkReq); remarkReq = 0;
    markWith(MARK); markWith(HMARK);
    domMO?.takeRecords(); // (our own class changes)
  }
  // while shown, what arrives or changes is marked before the frame it shows in
  const remarkSoon = () => { if (!remarkReq) remarkReq = requestAnimationFrame(remark); };
  function syncReveal() {
    const on = document.documentElement.classList.contains('reveal-alt');
    if (on === shown) { if (on) remarkSoon(); return; }
    shown = on;
    if (on && document.body) {
      domMO ||= new MutationObserver(remarkSoon);
      domMO.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'title', 'data-feature', 'id'] });
    } else domMO?.disconnect();
    remark();
  }
  new MutationObserver(syncReveal).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  function paint() {
    const live = off ? [] : REVEAL.filter((r) => !pins.has(r.id));
    const alt = live.filter((r) => r.mode === 'alt');
    const hover = live.filter((r) => r.mode === 'hover');
    const notKeep = (r) => (r.keep ? `:not(${r.keep})` : '');
    const css = [];
    if (!off) for (const m of mine) alt.push({ sel: m.sel });
    const altSels = alt.flatMap((r) => expand(r.sel).map((x) => `${x}${notKeep(r)}`)).filter(usable);
    for (const x of altSels) css.push(`:root ${x}:not(.${MARK}) { display: none !important; }`);
    if (altSels.length) css.push(`.reveal-alt .${MARK} { animation: dc-reveal .2s cubic-bezier(.2, .9, .3, 1.25) both; outline: 1px dashed color-mix(in srgb, var(--fh-gold, #f5b642) 75%, transparent) !important; outline-offset: 1px; }`);
    const fade = '{ opacity: 0; visibility: hidden; transition: opacity var(--dur-fast, .12s) var(--ease-out, ease), visibility var(--dur-fast, .12s); }';
    const hoverSels = [];
    for (const r of hover) {
      // (focus: false when the area holds something that keeps the focus, like the Lab picture's iframe)
      const state = `:not(:hover)${r.focus === false ? '' : ':not(:focus-within)'}`;
      for (const host of expand(r.host)) for (const x of expand(r.sel)) {
        if (named(x)) { css.push(`:root:not(.reveal-alt) ${host}${state} ${x}${notKeep(r)} ${fade}`); continue; }
        const whole = `${host} ${x}${notKeep(r)}`;
        if (!usable(whole)) continue;
        hoverSels.push(whole);
        css.push(`:root ${host}${state} ${x}${notKeep(r)}:not(.${HMARK}) ${fade}`);
      }
    }
    sels[MARK] = altSels.join(', '); sels[HMARK] = hoverSels.join(', ');
    styleEl.textContent = css.join('\n');
    document.documentElement.classList.toggle('calm-off', off);
    document.documentElement.dataset.pins = [...pins].join(' ');
    if (shown) remark();
  }
  const savePins = () => { store.set('declutter.pins', [...pins]); paint(); };
  // a selector that finds this button again after a re-render: its id, its feature name or its title
  const q = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  function selectorFor(b) {
    if (!b?.tagName) return null;
    const tag = b.tagName.toLowerCase();
    if (b.id) return `${tag}[id="${q(b.id)}"]`;
    if (b.dataset.feature) return `${tag}[data-feature="${q(b.dataset.feature)}"]`;
    if (b.title && b.title.length < 160) return `${tag}[title="${q(b.title)}"]`;
    return null;
  }
  const nameOf = (b) => (b.dataset.feature || b.textContent.trim() || b.title.split(/[(·:\n]/)[0] || b.tagName).trim().slice(0, 40);
  function tuck(b, area, on = true) {
    const sel = typeof b === 'string' ? b : selectorFor(b);
    if (!sel) return false;
    mine = mine.filter((m) => m.sel !== sel);
    if (on) mine.push({ sel, label: typeof b === 'string' ? sel : nameOf(b), area: area || 'Elsewhere' });
    store.set('declutter.mine', mine);
    paint();
    return true;
  }
  const isMine = (b) => mine.some((m) => { try { return b.matches(m.sel); } catch { return false; } });
  // the buttons in this part of the screen you have never used (Usage counts clicks; after a few days of tracking)
  function neverUsedIn(root) {
    if (!root || typeof Usage === 'undefined' || !Usage.data?.items || (Usage.trackedDays?.() || 0) < 3) return [];
    // (round 72, projects72) a long chat repeats its message buttons thousands of times (≈ 0.5 s of visibility checks
    // when a project's chat had 700 messages): the first 20 messages stand for the rest (a tuck is by selector anyway)
    let msgs = 0; let lastMsg = null;
    return [...root.querySelectorAll('button, select')].filter((b) => {
      const m = b.closest('.msg'); if (m && m !== lastMsg) { lastMsg = m; msgs += 1; } if (m && msgs > 20) return false;
      if (!b.checkVisibility?.({ visibilityProperty: true }) || isMine(b)) return false;
      const it = Usage.data.items[Usage.keyOf?.(b)];
      // never used (seen 3+ days), or (round 13) used once or twice long ago, nothing in the last 30 days
      const unused = it && it.n === 0 && Date.now() - it.first > 3 * 864e5;
      const stale = it && it.n > 0 && it.n <= 2 && it.last && Date.now() - it.last > 30 * 864e5;
      return (unused || stale) && selectorFor(b);
    });
  }
  function pin(id, on = !pins.has(id)) {
    const r = byId.get(id) || find(id);
    if (!r) return null;
    if (on) pins.add(r.id); else pins.delete(r.id);
    savePins();
    return { rule: r, pinned: on };
  }
  function find(q) {
    const s = String(q || '').toLowerCase().trim();
    if (!s) return null;
    return byId.get(s) || REVEAL.find((r) => r.label.toLowerCase().includes(s)) || REVEAL.find((r) => r.area.toLowerCase() === s);
  }
  function setOff(v) { off = Boolean(v); store.set('declutter.off', off); paint(); return !off; }

  // ---------- Customise this… ----------
  // The last entry of every right-click menu: pin / tuck the controls of this area, hide the button under the
  // pointer, bring hidden buttons back, or show everything for now.
  function customiseItems(area, target = null, { exact = false } = {}) {
    const rules = REVEAL.filter((r) => r.area === area || (!exact && area === LAB && r.area.startsWith('Lab')));
    const btn = target?.closest?.('button, select');
    // (Usage hides a button by its name in the bars it watches: toolbars, the timeline, chat headers, message feet)
    const key = btn?.closest('.three-toolbar, .media-bar .mb-main, .native-head, .msg-foot, .tw-head, .tool-head') && Usage.keyOf?.(btn);
    const hidden = Usage.data?.hidden || [];
    const items = [
      ...rules.map((r) => ({ label: r.label, checked: pins.has(r.id), hint: pins.has(r.id) ? 'on screen' : r.mode === 'alt' ? 'Alt' : 'on hover', action: () => { const p = pin(r.id); toast(p.pinned ? `“${r.label}” stays on screen` : `“${r.label}” is tucked away (${r.mode === 'alt' ? 'hold Alt' : 'point at it'})`, { timeout: 1800, action: { label: 'Undo', fn: () => pin(r.id) } }); } })),
      rules.length ? '-' : null,
      btn && !btn.closest('#menu') && selectorFor(btn) ? (isMine(btn)
        ? { label: `Keep “${nameOf(btn).slice(0, 24)}” on screen`, action: () => { mine = mine.filter((m) => { try { return !btn.matches(m.sel); } catch { return true; } }); store.set('declutter.mine', mine); paint(); } }
        : { label: `Tuck “${nameOf(btn).slice(0, 24)}” behind Alt`, action: () => { tuck(btn, area); toast(`“${nameOf(btn)}” waits behind Alt now`, { timeout: 2400, action: { label: 'Undo', fn: () => tuck(btn, area, false) } }); } }) : null,
      (() => { const never = neverUsedIn(target?.closest?.('.surface, #rail, #panel, .notes-panel, dialog') || null); return never.length ? { label: 'Tuck what I never use here', hint: String(never.length), action: () => { never.forEach((b) => tuck(b, area)); toast(`${never.length} button${never.length === 1 ? '' : 's'} you never used wait behind Alt now`, { timeout: 3000, action: { label: 'Undo', fn: () => never.forEach((b) => tuck(b, area, false)) } }); } } : null; })(),
      mine.length ? { label: 'Your tucked buttons', hint: String(mine.length), items: () => mine.map((m) => ({ label: m.label, hint: m.area, action: () => { mine = mine.filter((x) => x !== m); store.set('declutter.mine', mine); paint(); toast(`“${m.label}” is back on screen`, { timeout: 1600 }); } })) } : null,
      key && !btn.closest('#menu') ? { label: `Hide “${(btn.dataset.feature || btn.textContent || btn.title).trim().slice(0, 24)}” everywhere`, action: () => { Usage.setHidden(key, true); toast('Hidden. Customise this… → Bring back hidden buttons shows it again.', { timeout: 3000, action: { label: 'Undo', fn: () => Usage.setHidden(key, false) } }); } } : null,
      ...(typeof Habits !== 'undefined' && Habits.customiseItems ? Habits.customiseItems() : []), // (round 13) what the weekly tidy tucked
      hidden.length ? { label: 'Bring back hidden buttons', hint: String(hidden.length), items: () => hidden.map((k) => ({ label: k.split(' › ').pop(), hint: k.split(' › ')[0], action: () => Usage.setHidden(k, false) })) } : null,
      { label: 'Show the tucked buttons for now', key: 'Alt Alt', action: () => KeysUI.latch(true) },
      { label: off ? 'Tidy again (tuck them away)' : 'Show everything, always', tip: off ? 'Tuck the rarely used buttons away again' : 'Every tucked button stays on screen, everywhere', action: () => { setOff(!off); toast(off ? 'Everything shows (Customise this… › Tidy again tucks it away)' : 'Tidy again', { timeout: 1800 }); } }, // (round 43, menucalm) no command name on screen
      { label: 'Keys and hidden buttons…', key: 'Ctrl+/', action: () => KeysUI.open() },
    ].filter(Boolean);
    return ['-', { label: 'Customise this…', icon: 'sliders', items }];
  }

  // the same entry for the Lab's two-column menus (popMenu): ['Customise this…', '', [...]]
  function popItems(area, target = null) {
    const conv = (it) => (it === '-' || typeof it === 'string' ? null : it.items ? [it.label, it.hint || '', (typeof it.items === 'function' ? it.items() : it.items).map(conv).filter(Boolean)] : [it.label, it.hint || it.key || '', it.action, Boolean(it.checked)]);
    const entry = customiseItems(area, target)[1];
    return [['Customise this…', '', entry.items.map(conv).filter(Boolean)]];
  }

  // ---------- right-click menus ----------
  // ctx(selector, area, build): build(node, event) returns menu items (or true when it showed its own menu). The
  // deepest match under the pointer wins; elements with their own right-click menu (they call preventDefault) and
  // text fields keep theirs.
  const CTX = [];
  function ctx(sel, area, build) { CTX.push({ sel, area, build }); }
  const editable = (t) => t.closest?.('input, textarea, [contenteditable=""], [contenteditable="true"], .code-editor, webview, iframe');
  function onContext(e) {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (!t?.closest || editable(t) && !t.closest('[data-ctx-ok]')) return;
    const selText = String(getSelection?.() || '').trim();
    if (selText && getSelection().containsNode?.(t, true)) return; // a text selection: the copy / ask menu
    // (round 160, boot160) a right-click before the menus are in (right after the first frame): asked again once they are
    if (!menusIn()) {
      e.preventDefault();
      const { clientX, clientY, screenX, screenY } = e;
      Lazy.load('ctxmenus').then(() => { if (t.isConnected) t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY, screenX, screenY, button: 2 })); }).catch(() => {});
      return;
    }
    for (let node = t; node && node !== document.documentElement; node = node.parentElement) {
      const hit = CTX.find((c) => node.matches(c.sel));
      if (!hit) continue;
      let items;
      try { items = hit.build(node, e); } catch (err) { console.warn(err); continue; }
      if (!items) continue;
      e.preventDefault();
      if (items === true) return;
      showMenu(e.clientX, e.clientY, [...items, ...customiseItems(hit.area, t)]);
      return;
    }
  }
  document.addEventListener('contextmenu', onContext);

  // (round 160, boot160) the menus themselves (messages, code, links, the composer, the rail, the panels, dialogs…) are
  // declutter-menus.js (lazy group 'ctxmenus', right after the first frame): they go in here, before what other files add
  const ctxMark = { i: CTX.length };
  const _ctxHere = (sel, area, build) => { CTX.splice(ctxMark.i, 0, { sel, area, build }); ctxMark.i += 1; };
  const menusIn = () => !window.Lazy || Lazy.isIn('ctxmenus');

  // ---------- chat commands ----------
  function registerCommands() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register({ area: 'App', ...def }); };
    reg({ name: 'calm', args: '[on|off]', desc: 'Tuck secondary buttons away (on, the default) or show everything (off)', keywords: 'declutter tidy clutter simple show all buttons', examples: ['/calm off', '/calm on'],
      complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (a) => { const v = String(a || '').trim().toLowerCase(); if (v === 'off' || v === 'on') setOff(v === 'off'); else if (v) return 'Use /calm on or /calm off'; else setOff(!off); return off ? 'Everything shows. /calm on tucks the secondary buttons away again (Alt shows them).' : `Tidy: ${REVEAL.length - pins.size} controls wait behind Alt or show when you point at them. /customise lists them.`; } });
    reg({ name: 'reveal', args: '[on|off]', desc: 'Show the buttons that wait behind Alt (like holding Alt) until Esc or /reveal off', keywords: 'alt hidden buttons show',
      complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (a) => { const on = String(a || '').trim().toLowerCase() !== 'off'; KeysUI.latch(on); return on ? 'The tucked buttons show (dashed outline). Esc or /reveal off tucks them away.' : 'Tucked away again.'; } });
    reg({ name: 'customise', aliases: ['customize'], args: '[area]', desc: 'What waits behind Alt or hover, and what you pinned back on screen',
      complete: () => areas().map((x) => ({ value: x })),
      run: (a) => { const q = String(a || '').trim().toLowerCase(); const list = REVEAL.filter((r) => !q || r.area.toLowerCase().includes(q)); return `${list.map((r) => `- **${r.area}** · ${r.label} · ${pins.has(r.id) ? 'pinned on screen' : r.mode === 'alt' ? 'hold Alt' : 'on hover'} (\`${r.id}\`)`).join('\n')}\n\n/pin-control <name> keeps one on screen, /unpin-control <name> tucks it away. Right-click any area → Customise this… does the same.${off ? '\n(/calm is off: everything shows now.)' : ''}`; } });
    reg({ name: 'pin-control', args: '<name>', desc: 'Keep a tucked control on screen (see /customise)',
      complete: () => REVEAL.map((r) => ({ value: r.id, label: r.label, hint: r.area })),
      run: (a) => { const r = pin(a, true); return r ? `“${r.rule.label}” stays on screen.` : 'No such control: /customise lists them.'; } });
    reg({ name: 'tucked', args: '[clear]', desc: 'The buttons you tucked behind Alt yourself (right-click → Customise this… → Tuck); /tucked clear brings them all back',
      run: (a) => { if (/^clear$/i.test(String(a || '').trim())) { const n = mine.length; mine = []; store.set('declutter.mine', mine); paint(); return `${n} button${n === 1 ? '' : 's'} back on screen.`; } return mine.length ? mine.map((m) => `- ${m.label} (${m.area})`).join('\n') + '\n\n/tucked clear brings them back; Customise this… → Your tucked buttons, one by one.' : 'Nothing tucked by you yet: right-click a button → Customise this… → Tuck it behind Alt.'; } });
    reg({ name: 'unpin-control', args: '<name>', desc: 'Tuck a control away again (Alt or hover shows it)',
      complete: () => [...pins].map((id) => ({ value: id, label: byId.get(id)?.label })),
      run: (a) => { const r = pin(a, false); return r ? `“${r.rule.label}” is tucked away again.` : 'No such control: /customise lists them.'; } });
    reg({ name: 'rightclick', aliases: ['context-menu'], args: '[lab|chat|rail|dock|timeline|sliders|console]', desc: 'Open the right-click menu of a part of the screen (the same as right-clicking it)',
      complete: () => ['chat', 'rail', 'lab', 'preview', 'sliders', 'layers', 'console', 'timeline', 'dock', 'panel'].map((v) => ({ value: v })),
      run: (a) => {
        const where = { chat: '.surface.active .native-head', rail: '#rail .spacer', lab: '.surface.active .three-toolbar', sliders: '.surface.active .tweaks', layers: '.surface.active .layers', console: '.surface.active .three-console-wrap', timeline: '.surface.active .media-bar', dock: '.surface.active .dd-strip', panel: '#panel .panel-head', preview: '.surface.active .stage-pill' }[String(a || 'chat').trim().toLowerCase()] || null;
        const node = where && [...document.querySelectorAll(where)].find((n) => n.checkVisibility?.({ visibilityProperty: true }));
        if (!node) return 'That part is not on screen.';
        const r = node.getBoundingClientRect();
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(40, r.width / 2), clientY: r.top + Math.min(12, r.height / 2) }));
        return null;
      } });
  }

  // the rail's ⋯ also lists the two buttons that left the rail (simplify.js builds that menu from its TUCKED list)
  if (typeof Simplify !== 'undefined' && Array.isArray(Simplify.TUCKED)) {
    Simplify.TUCKED.unshift(['palette-btn', '⌕ Find anything…  Ctrl+K'], ['add-btn', '＋ Add an agent or website']);
    Simplify.TUCKED.push(['full-btn', '⛶ Full screen'], ['board-drawer-btn', '▦ Board drawer  Ctrl+Shift+M']); // (round 49, appcalm)
    const pb = document.getElementById('palette-btn'); if (pb) pb.title = WinMac.keyLabel('Find anything: a setting, a chat, an action (Ctrl/⌘+K)'); // one name (it said Command palette)
  }

  // the keys sheet lists what each area tucks away (hold Alt / point at it)
  const WHERE = { Rail: 'the rail', 'Chats panel': 'the chats list', Chat: 'a chat', 'Director dock': 'the dock', Lab: 'the Lab', 'Lab preview': 'the picture', 'Lab timeline': 'the timeline', 'Lab layers': 'a layer', 'Lab sliders': 'the sliders', 'Lab console': 'the console', Notes: 'Notes', Memory: 'Memory', Tabs: 'a tool’s header' };
  for (const area of areas()) {
    const alt = REVEAL.filter((r) => r.area === area && r.mode === 'alt');
    const hov = REVEAL.filter((r) => r.area === area && r.mode === 'hover');
    if (alt.length) Keys.add({ area: 'Hidden buttons', keys: `Hold Alt in ${WHERE[area] || area}`, what: alt.map((r) => r.label).join(' · '), run: () => KeysUI.latch(true), sel: alt.map((r) => r.sel).join(', ') });
    if (hov.length) Keys.add({ area: 'Hidden buttons', keys: `Point at ${WHERE[area] || area}`, what: `${hov.map((r) => r.label).join(' · ')} show`, sel: hov.map((r) => r.host).join(', ') });
  }

  // the same from the palette (Ctrl+K)
  queueMicrotask(() => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Show the tucked buttons (like holding Alt)', () => KeysUI.latch(true));
    AppUI.addAction('Show every button, always (/calm off) / tidy again', () => { setOff(!off); toast(off ? 'Everything shows' : 'Tidy again', { timeout: 1400 }); });
    AppUI.addAction('Customise: what is tucked away, what is pinned', () => Commands.exec('/customise', H.claudeAgent()?.id));
    AppUI.addAction('Right-click menu of this view', () => Commands.exec(`/rightclick ${H.isTool(H.activeId) && H.activeId === 'tool:three' ? 'lab' : 'chat'}`, H.claudeAgent()?.id));
  });

  paint();
  addEventListener('DOMContentLoaded', registerCommands);
  if (document.readyState !== 'loading') queueMicrotask(registerCommands);

  return {
    REVEAL, ctx, customiseItems, popItems, pin, tuck, mine: () => mine.slice(), selectorFor, pinned: (id) => pins.has(id), find, paint, setOff, isOff: () => off, areas,
    tucked: (area) => REVEAL.filter((r) => (!area || r.area === area) && !pins.has(r.id)),
    railItems: () => (menusIn() ? DeclutterMenus.railItems() : []), addRules, neverUsedIn, // (+ labToolbar: declutter-lab.js, with the Lab)
    _ctxHere, // (declutter-menus.js)
  };
})();
