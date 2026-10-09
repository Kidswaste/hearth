// Round 8 (polish8): the round 7 surfaces — the mood board, the video editor in Video Review, capture — made to read
// as one calm Forgeheart app with the rest, following the owner's rule: "less info directly in my face, more
// submenus, keep a high amount of customisability, right click used more, hide buttons behind Alt / Ctrl with the
// keys button bottom left". Presentation and registrations only; the streams' own logic stays theirs:
//   - tucked controls: rarer buttons of the board drawer, the editor bar and the captures dialogs wait behind Alt or
//     show on hover (Declutter.addRules, the same table as round 7), each listed under Customise this…
//   - one menu shape: right-click menus (and the ⋯ menus) of the board, the editor and captures get the same order
//     (primary → arrange → look → sound → send / export → More… → Delete), thin separators between the groups, and
//     end with the same Customise this… as the rest of the app
//   - every keyed action of these surfaces is in the keys sheet (Keys.add) under its own area, with an icon
//   - icons: the SVG set (icons.js) on the editor bar, the board chip, the capture entries, empty states, keys sheet
//   - nothing here runs per frame: listeners only on pointer / context-menu events, one stylesheet written once
const Polish8 = (() => {
  const MAC = /Mac/.test(navigator.platform);
  const MOD = MAC ? '⌘' : 'Ctrl';

  // ---------- 1. tucked controls (behind Alt, or shown where you point) ----------
  const RULES = [
    // the editor bar keeps ＋, the format chip, ⇪ Export, ⋯ and ✕; Undo is Ctrl+Z, ⋯ › Undo and right-click
    { id: 'ed-undo', area: 'Editor', label: '↶ Undo in the editor bar (Ctrl+Z, ⋯ › Undo)', sel: '.vr-cut-headrow > button[title^="Undo"]' },
    // while editing, A|B compare works on the source only (the editor says so): it waits behind Alt
    { id: 'ed-ab', area: 'Editor', label: 'A|B compare while editing (works on the source)', sel: '.vr-main.cutting .vr-ab' },
    // the board drawer: the board picker, search and close stay; the rest is a right-click or Alt away
    { id: 'bdd-open', area: 'Board drawer', label: '↗ Open the whole board (also right-click the drawer)', sel: '.bdd-head > button[title="Open the board"]' },
    { id: 'bdd-add', area: 'Board drawer', label: '＋ Add pictures from the drawer (or drop them on it)', sel: '.bdd-foot > button[title^="Add pictures"]' },
    { id: 'bdd-count', area: 'Board drawer', label: 'Reference count in the drawer foot', sel: '.bdd-foot > span:not(.spacer)', mode: 'hover', host: '.bdd' },
    { id: 'bdd-send', area: 'Board drawer', label: '→ on each reference (attach its vibe; dragging does it too)', sel: '.bdd-send', mode: 'hover', host: '.bdd-tile' },
  ];

  // ---------- 2. one menu shape ----------
  // Which part of the app a menu belongs to: the last pointer event before it opened.
  const AREAS = [
    ['.bdd', 'Board drawer'], ['.bd-root', 'Board'], ['.vr-cut, .vi-panel', 'Editor'],
    ['dialog.cap-lib, dialog.cap-view, dialog.cap-read, .cap-ann', 'Capture'],
    ['.surface[data-id="tool:ae"]', 'Video Review'],
  ];
  const areaOf = (node) => { for (const [sel, area] of AREAS) { if (node?.closest?.(sel)) return area; } return null; };
  let last = { t: 0, target: null, kind: '' };
  addEventListener('contextmenu', (e) => { last = { t: performance.now(), target: e.target, kind: 'context' }; }, true);
  addEventListener('click', (e) => { last = { t: performance.now(), target: e.target, kind: 'click' }; }, true);
  let pendingArea = null; // set just before a menu that belongs somewhere opens (the capture menu)

  // the verbs, in the order every menu of these surfaces shows them
  const GROUPS = [
    ['arrange', /^(Arrange|Align|Distribute|Order|Bring|Group|Ungroup|Speed|Fades?|Keyframe|Motion|Transition|Slip|Slide|Range|Markers?|Frame them|Move to|Lock|Unlock|Select)\b/i],
    ['look', /^(Look|Effects?|Opacity|Blend|Stamp|Tags|Lens|Background|Style|Colou?r|Frame color|Shape|Sticker|Arrow|Title style|Title animation|Beautif|Social frame|Annotate|Your note)/i],
    ['sound', /^(Sound|Mute|Unmute|Volume)/i],
    ['send', /^(Send|Ask a chat|Vibe|Export|Copy as|Share|Make|Read frames|Brief|Give the vibe|Chats get|Present)/i],
  ];
  const labelOf = (it) => String(it?.label || '').replace(/^[✓\s]+/, '');
  const isTail = (it) => it && typeof it === 'object' && (it.danger || it.more || /^More…/.test(labelOf(it)) || labelOf(it) === 'Customise this…');
  function ordered(list) {
    // only plain lists (no headings / separators of their own) and long enough to need grouping
    if (list.some((it) => typeof it === 'string') || list.filter((it) => typeof it === 'object').length < 6) return list;
    const buckets = { primary: [], arrange: [], look: [], sound: [], send: [], tail: [] };
    for (const it of list) {
      if (isTail(it)) { buckets.tail.push(it); continue; }
      const g = GROUPS.find(([, re]) => re.test(labelOf(it)));
      buckets[g ? g[0] : 'primary'].push(it);
    }
    buckets.look.sort((a, b) => Number(/^Look/.test(labelOf(b))) - Number(/^Look/.test(labelOf(a)))); // Look leads its group
    const out = [];
    for (const k of ['primary', 'arrange', 'look', 'sound', 'send']) { if (buckets[k].length) { if (out.length) out.push('-'); out.push(...buckets[k]); } }
    // More… and Delete close the menu (the renderer puts More… above a closing Delete)
    if (buckets.tail.length) out.push('-', ...buckets.tail);
    return out;
  }
  // More… (the rare items, as the renderer folds them) and a closing Delete come last, just above Customise this…
  function tailFirst(list) {
    const rest = list.filter((it) => it && typeof it === 'object' && it.more);
    let main = list.filter((it) => !(it && typeof it === 'object' && it.more));
    if (rest.length === 1) main.push({ ...rest[0], more: false });
    else if (rest.length > 1) main.push({ label: 'More…', hint: String(rest.length), items: rest.map((it) => ({ ...it, more: false })) });
    const danger = main.filter((it) => it && typeof it === 'object' && it.danger);
    if (danger.length) main = [...main.filter((it) => !danger.includes(it)), ...danger];
    while (main.length && main[main.length - 1] === '-') main.pop();
    return main.filter((it, i) => !(it === '-' && main[i - 1] === '-'));
  }
  // the verbs every surface shares get the same icon (Look, Arrange, Send … to a chat, Export, Present); the rest
  // stay text, so a menu isn't a wall of pictures
  const VERB_ICON = [[/^Look\b/, 'sparkle'], [/^Arrange\b/, 'grid'], [/^(Send\b|Ask a chat)/, 'tochat'], [/^Export\b/, 'export'], [/^Present\b/, 'present']];
  const verbIcon = (it) => { if (!it || typeof it !== 'object' || it.icon) return it; const v = VERB_ICON.find(([re]) => re.test(labelOf(it))); return v ? { ...it, icon: v[1] } : it; };
  // the rail's ⋯: its entries carried emoji; they get the same SVGs as the buttons they stand for
  const RAIL_GLYPH = { '🗒': 'notes', '🧠': 'memory', '▦': 'grid', '⌨': 'broadcast', '⇪': 'export', '◉': 'capture' };
  function railIcons(list) {
    return list.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const m = /^(✓ )?(\S+)\s+/u.exec(it.label || '');
      return m && RAIL_GLYPH[m[2]] ? { ...it, label: `${m[1] || ''}${it.label.slice(m[0].length)}`, icon: RAIL_GLYPH[m[2]] } : it;
    });
  }
  const MARK = Symbol('polish8');
  const hasCustomise = (list) => list.some((it) => it && typeof it === 'object' && it.label === 'Customise this…');
  function decorate(items) {
    if (Array.isArray(items) && items[MARK]) return items;
    const recent = performance.now() - last.t < 600;
    let area = pendingArea; pendingArea = null;
    const target = last.target;
    if (!area && recent && last.kind === 'click' && target?.closest?.('#rail-more')) {
      const list = railIcons((typeof items === 'function' ? items() : items || []).filter(Boolean));
      const out = typeof Declutter !== 'undefined' ? [...list, ...Declutter.customiseItems('Rail')] : list;
      out[MARK] = true;
      return out;
    }
    if (!area && recent) {
      area = areaOf(target);
      // a click opens a menu here only from a ⋯ / chip button (not pickers like the color swatch)
      if (area && last.kind === 'click') {
        const b = target?.closest?.('button');
        if (!b || !(b.textContent.trim() === '⋯' || b.matches('.bd-boardbtn, .bd-zoom'))) area = null;
      }
    }
    if (!area || typeof Declutter === 'undefined') return items;
    let list = (typeof items === 'function' ? items() : items || []).filter(Boolean);
    if (last.kind === 'context' && area !== 'Video Review') list = ordered(list);
    list = tailFirst(list).map(verbIcon);
    if (!hasCustomise(list)) list = [...list, ...Declutter.customiseItems(area, target, { exact: true })];
    list[MARK] = true;
    return list;
  }
  // showMenu (renderer.js) is a global function: wrapping it reaches every caller, including its own ‹ back rows
  // (they reopen the list given here, which carries the mark and passes through untouched)
  function wrapMenu() {
    if (typeof showMenu !== 'function' || showMenu.__p8) return;
    const orig = showMenu;
    const wrapped = function (x, y, items, parent = null, dir = 0) {
      if (!parent) {
        try { items = decorate(items); } catch (err) { console.warn('polish8 menu', err); }
        // over the board / the program monitor / a playing capture the menu drops its live blur (see polish8.css)
        document.documentElement.classList.toggle('p8-over-media', Boolean(performance.now() - last.t < 600 && last.target?.closest?.('.bd-root, .vr-stage, .vr-cut, dialog.cap-view')));
      }
      return orig.call(this, x, y, items, parent, dir);
    };
    wrapped.__p8 = true;
    window.showMenu = wrapped;
  }
  function wrapCapture() {
    if (typeof Capture === 'undefined' || Capture.menu.__p8) return;
    const orig = Capture.menu; const origMain = Capture.mainItems;
    const MAIN = Symbol('capture main');
    Capture.mainItems = (...a) => { const l = origMain(...a); l[MAIN] = true; return l; };
    Capture.menu = (x, y, items, ...rest) => { if (items?.[MAIN] || last.kind === 'context' && areaOf(last.target) === 'Capture' && performance.now() - last.t < 600) pendingArea = 'Capture'; return orig(x, y, items, ...rest); };
    Capture.menu.__p8 = true;
  }

  // ---------- right-click on the few buttons these surfaces keep on screen ----------
  // the board's chips and the editor bar's buttons open their own menu on a right-click too (with Customise this…);
  // a right-click on the editor bar's empty part opens its ⋯ menu
  function rightClicks() {
    addEventListener('contextmenu', (e) => {
      if (e.defaultPrevented) return;
      const t = e.target;
      const chip = t.closest?.('.bd-hud button.bd-chip');
      const bar = !chip && t.closest?.('.vr-cut-headrow');
      if (!chip && !bar) return;
      const b = chip || t.closest('.vr-cut-headrow > button') || [...bar.querySelectorAll(':scope > button')].find((x) => x.textContent.trim() === '⋯');
      if (!b || /^(✕|↶)$/.test(b.textContent.trim())) return; // close / undo have no menu: the browser's own stays away
      e.preventDefault(); e.stopPropagation();
      pendingArea = areaOf(b);
      b.click();
      pendingArea = null;
    }, true);
  }

  // ---------- 3. keys: what the round 7 surfaces left out of the keys sheet ----------
  function registerKeys() {
    if (typeof Keys === 'undefined') return;
    const ed = () => typeof VideoCut !== 'undefined' && VideoCut.active;
    Keys.add(
      { area: 'Editor', keys: 'Home / End', what: 'First / last frame of the edit (also ⏮ ⏭ behind Alt)', when: ed },
      { area: 'Editor', keys: `${MOD}+D`, what: 'Duplicate the selected clip (right-click › Edit › Duplicate)', when: ed },
      { area: 'Editor', keys: `${MOD}+Y`, what: 'Redo (⋯ › Redo)', when: ed },
      { area: 'Editor', keys: `${MOD}+= / ${MOD}+−`, what: 'Zoom the timeline in / out (right-click the ruler › Zoom)', when: ed },
      { area: 'Editor', keys: '?', what: 'The editor\'s keys in one list (⋯ › More › Keys)', when: ed },
      { area: 'Editor', keys: 'Double-click', what: 'A clip: the inspector · a title: edit it · the ruler: a marker', when: ed },
      { area: 'Editor', keys: 'Esc (inspector)', what: 'Close the inspector', when: ed },
      { area: 'Board', keys: 'Right-click a chip', what: 'The chip\'s own menu: boards, add, zoom (ends with Customise this…)' },
      { area: 'Editor', keys: 'Right-click the editor bar', what: 'Its ⋯ menu; on ＋, the format or Export: that button\'s menu', when: ed },
      { area: 'Board', keys: 'Esc (drawer)', what: 'Close the board drawer (also its ✕, Ctrl+Shift+M)' },
      { area: 'Capture', keys: '0 (picture)', what: 'Fit the picture to the viewer (double-click does too)' },
      { area: 'Capture', keys: 'Right-click (rail ⋯ › Capture)', what: 'The capture menu; Alt while it opens shows every item' },
    );
  }

  // ---------- 4. icons where the round 7 surfaces used letters and emoji ----------
  // CSS masks from the same SVGs, for things drawn by CSS (keys sheet headings, empty states, the drawer)
  const maskUrl = (k) => { const s = typeof Icons !== 'undefined' && Icons.svg?.(k); return s ? `url("data:image/svg+xml,${encodeURIComponent(s.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}")` : 'none'; };
  const AREA_ICON = { Board: 'board', 'Board drawer': 'board', Editor: 'editor', Capture: 'capture', 'Video Review': 'video', Lab: 'three', 'Lab timeline': 'three', 'Lab sliders & layers': 'sliders', 'Effects picker': 'sparkle', Present: 'present', 'Director dock': 'director', Nodes: 'grid', 'Chat box': 'claude', 'Chats panel': 'panel', 'Command bar': 'command', 'Command palette': 'command', Notes: 'notes', 'Hidden buttons': 'keys', 'Right-click': 'command', Everywhere: 'hearth', Menus: 'command', Kit: 'sliders', Find: 'web', Forge: 'forge' };
  function styleSheet() {
    const keys = [...new Set([...Object.values(AREA_ICON), 'capture', 'editor', 'board', 'film', 'frames', 'tour', 'keys'])];
    const vars = keys.map((k) => `--p8-i-${k}: ${maskUrl(k)};`).join(' ');
    document.head.append(el('style', { id: 'polish8-icons', text: `:root { ${vars} }` }));
  }
  // keys sheet: an icon before each area heading (decorated when the sheet paints; nothing runs while it's closed)
  function keysSheetIcons(sheet) {
    for (const h of sheet.querySelectorAll('.ks-group > h4:not([data-p8])')) {
      const area = h.textContent.split(' · ')[0];
      h.dataset.p8 = AREA_ICON[area] || 'keys';
      h.style.setProperty('--p8-mask', `var(--p8-i-${h.dataset.p8})`);
    }
  }
  function watchSheet() {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains('keys-sheet')) {
          keysSheetIcons(n);
          new MutationObserver(() => keysSheetIcons(n)).observe(n.querySelector('.ks-body') || n, { childList: true });
        }
      }
    }).observe(document.body, { childList: true });
  }

  // ---------- chat commands ----------
  function commands() {
    if (typeof Commands === 'undefined') return;
    const reg = (c) => { if (!Commands.get(c.name)) Commands.register({ area: 'Look', ...c }); };
    reg({ name: 'tidy', args: '[board|editor|drawer]', desc: 'What the board, its drawer and the video editor tuck behind Alt or show where you point (pin any back: right-click › Customise this…)',
      complete: () => ['board', 'editor', 'drawer'].map((value) => ({ value })),
      run: (a) => `${RULES.filter((r) => !String(a || '').trim() || r.area.toLowerCase().includes(String(a).trim().toLowerCase())).map((r) => `- **${r.area}** · ${r.label} · ${Declutter.pinned(r.id) ? 'on screen (pinned)' : r.mode === 'hover' ? 'shows where you point' : 'hold Alt'}`).join('\n')}\n\nPin one back: \`/pin-control <name>\`. Everything at once: \`/calm off\`.` });
  }

  // ---------- start ----------
  function start() {
    try { Declutter.addRules(RULES); } catch (err) { console.warn('polish8 rules', err); }
    wrapMenu(); wrapCapture(); registerKeys(); styleSheet(); watchSheet(); commands(); rightClicks();
    // the hidden rail button capture-cmds.js adds (pinned back on screen with Customise this…, it shows): the SVG icon
    const cb = document.getElementById('capture-btn');
    if (cb && typeof Icons !== 'undefined' && !cb.querySelector('svg')) cb.replaceChildren(Icons.node('capture'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  return { RULES, ordered, areaOf, decorate };
})();
