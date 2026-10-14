// ♿ Accessibility (round 40, a11y): Hearth with the keyboard and with VoiceOver / Narrator, without changing how it
// looks. One small module, loaded early, that fills in what the rest of the app leaves out, all from the outside:
//   · names: a control whose text is only a symbol (⋯ ◎ ✕ ＋ 🔒, an SVG icon, a number) gets its tooltip's first
//     part as its name ("Home", "Mission for your next message"); the whole tooltip stays its description. Follows
//     the tooltip when it changes; let go when the control gets real words.
//   · overlays (⋯ AI setup, ◎ missions, Find anything, the Lab's ✦ picker, any role=dialog put on the page): they
//     are dialogs to assistive tech, focus goes into them as they open, Esc closes the top-most one when nothing
//     else did, and focus returns to what opened them when they go (dialogs too).
//   · the chats list: one Tab stop (the open chat), ↑ / ↓ / Home / End move between chats, Enter opens.
//   · "Skip to the chat": the first Tab stop, shown only when focused; Enter puts you in the chat box.
//   · announcements: one polite live region (A11y.say) for finished replies ("Claude replied: …", once per reply,
//     never per token), tips (hints.js) and anything else that should be heard; toasts have their own (ui.js).
//   · A11y.kbd(): was the last input the keyboard? (menus open with their first row focused only then)
// The looks' focus rings, Windows High Contrast and "more contrast" are in a11y.css.
// Cheap by design: one observer on <body>'s own children (overlays) + one on the whole page that only looks at
// added controls and changed tooltips, batched into one idle pass; it writes an attribute only when it differs.
const A11y = (() => {
  let kbd = false;
  addEventListener('keydown', (e) => { if (/^(Tab|Enter| |Arrow|Escape|F6|F10|ContextMenu|Home|End|Page)/.test(e.key)) kbd = true; }, true);
  addEventListener('pointerdown', () => { kbd = false; }, true);

  // ---------- names ----------
  const CTRL = 'button, a[href], [role=button], [role=link], [role=switch], [role=tab], [role=menuitem], [role=option], input:not([type=hidden]), select, textarea';
  const worded = (s) => /[\p{L}\p{N}]{2,}/u.test(s || '');
  const textOf = (n) => {
    let t = '';
    for (const c of n.childNodes) {
      if (c.nodeType === 3) t += c.textContent;
      else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !c.hidden) t += c.tagName === 'IMG' ? (c.getAttribute('alt') || '') : (c.getAttribute('aria-label') || textOf(c));
    }
    return t;
  };
  // "Home  ·  Ctrl+6  ·  right-click: …" → "Home"; "Close (Esc)" → "Close"; a long sentence → up to its colon
  function shortName(t) {
    let s = String(t || '').split(/\n|\s+·\s+/)[0].replace(/\s*\((?:Esc|Ctrl|⌘|Alt|Shift|F\d)[^)]*\)\s*$/i, '').trim();
    if (s.length > 48) { const c = s.search(/:\s|\s—\s|\.\s/); if (c > 6) s = s.slice(0, c); }
    return s.slice(0, 80).trim();
  }
  function nameOne(n) {
    if (n.hasAttribute('aria-labelledby')) return;
    const mine = n.hasAttribute('data-a11y-name');
    const own = n.getAttribute('aria-label');
    if (own && !mine) return; // its module named it
    const field = /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName);
    if (field ? (n.labels?.length || n.placeholder) && !mine : worded(textOf(n))) { if (mine) { n.removeAttribute('aria-label'); n.removeAttribute('data-a11y-name'); } return; }
    if (field && (n.type === 'button' || n.type === 'submit') && worded(n.value)) return;
    const name = shortName(n.title || n.dataset?.feature || n.getAttribute('data-tip') || '');
    if (!worded(name)) return;
    if (own !== name) { n.setAttribute('aria-label', name); n.setAttribute('data-a11y-name', ''); }
  }
  const pending = new Set();
  let soon = 0;
  function flush() {
    soon = 0;
    for (const n of pending) {
      if (!n.isConnected) continue;
      if (n.matches?.(CTRL)) nameOne(n);
      if (n.firstElementChild) for (const c of n.querySelectorAll(CTRL)) nameOne(c);
    }
    pending.clear();
  }
  const queue = (n) => { pending.add(n); if (!soon) soon = (window.requestIdleCallback || setTimeout)(flush, { timeout: 300 }); };

  // ---------- overlays: dialogs to assistive tech, focus in, Esc, focus back ----------
  const OVERLAY = 'aside.opt-sheet:not(.opt-page), .ms-pop, .palette, .fx-picker, [role=dialog]:not(dialog), [role=alertdialog]:not(dialog)';
  const open = []; // [{ root, opener }] oldest first
  const focusable = (root) => [...root.querySelectorAll('button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
    .find((x) => x.checkVisibility?.({ visibilityProperty: true }) && x.getBoundingClientRect().width > 0);
  const usable = (n) => n && n.isConnected && n !== document.body && n.checkVisibility?.({ visibilityProperty: true });
  // what last had focus outside every overlay (an overlay that focuses its own box as it opens took it already)
  let lastOut = null;
  addEventListener('focusout', (e) => { const t = e.target; if (t instanceof Element && !t.closest(OVERLAY) && !t.closest('#menu, #menu-fly')) lastOut = t; }, true);
  function opened(root) {
    if (open.some((o) => o.root === root)) return;
    const a = document.activeElement;
    open.push({ root, opener: a && a !== document.body && !root.contains(a) ? a : lastOut && !root.contains(lastOut) ? lastOut : null });
    if (!root.getAttribute('role')) root.setAttribute('role', 'dialog');
    // focus goes in (unless the overlay put it somewhere itself, like Find anything's box)
    requestAnimationFrame(() => {
      if (!root.isConnected || root.contains(document.activeElement)) return;
      const first = kbd ? focusable(root) : null;
      if (first) first.focus({ preventScroll: true });
      else { if (!root.hasAttribute('tabindex')) { root.tabIndex = -1; root.dataset.a11yRoot = ''; } root.focus({ preventScroll: true }); }
    });
  }
  function closed(root) {
    const i = open.findIndex((o) => o.root === root);
    if (i < 0) return;
    const [{ opener }] = open.splice(i, 1);
    giveBack(opener);
  }
  // focus lost with what held it (nothing has focus now, or it sits on something gone): back to the opener
  function giveBack(opener) {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected && a.checkVisibility?.({ visibilityProperty: true })) return;
      const top = open.at(-1);
      const to = usable(opener) ? opener : top && usable(top.root) ? (focusable(top.root) || top.root) : null;
      to?.focus({ preventScroll: true });
    }, 0);
  }
  // <dialog>: the opener is what had focus when it opened (Chromium keeps it for modals; non-modal ones and dialogs
  // that removed their opener get it here)
  const dialogOpeners = new WeakMap();
  function watchDialog(d) {
    if (d.__a11y) return; d.__a11y = true;
    new MutationObserver(() => { if (d.open && !dialogOpeners.has(d)) { const a = document.activeElement; dialogOpeners.set(d, a && !d.contains(a) ? a : null); } }).observe(d, { attributes: true, attributeFilter: ['open'] });
    if (d.open) { const a = document.activeElement; dialogOpeners.set(d, a && !d.contains(a) ? a : null); }
  }
  document.addEventListener('close', (e) => { const d = e.target; if (d?.tagName !== 'DIALOG') return; const o = dialogOpeners.get(d); dialogOpeners.delete(d); giveBack(o); }, true);

  // Esc that nothing else took: the top-most overlay with focus in it closes (its ✕ / Close button, else it goes)
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const top = open.at(-1);
    if (!top || !top.root.isConnected || !top.root.contains(document.activeElement)) return;
    if (document.querySelector('dialog[open]') && !top.root.closest('dialog')) return; // a dialog above it handles its own
    const x = [...top.root.querySelectorAll('button')].find((b) => /^(✕|×|Close)\b/.test(b.getAttribute('aria-label') || b.title || b.textContent.trim()));
    e.preventDefault();
    if (top.root.matches('aside.opt-sheet') && typeof Options !== 'undefined') Options.hide();
    else if (x) x.click();
    else top.root.remove();
  });

  // ---------- the chats list: one Tab stop, arrows move ----------
  function rovePanel() {
    const rows = [...document.querySelectorAll('#chat-groups .item')];
    if (!rows.length) return;
    const cur = rows.find((r) => r.classList.contains('active')) || rows[0];
    for (const r of rows) {
      const want = r === cur ? 0 : -1;
      if (r.tabIndex !== want) r.tabIndex = want;
      if (r.getAttribute('role') !== 'button') r.setAttribute('role', 'button');
      const on = r.classList.contains('active');
      if (on !== (r.getAttribute('aria-current') === 'true')) { if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); }
    }
  }
  document.addEventListener('keydown', (e) => {
    const r = e.target.closest?.('#chat-groups .item');
    if (!r || e.target !== r || e.ctrlKey || e.altKey || e.metaKey) return;
    const rows = [...document.querySelectorAll('#chat-groups .item')].filter((x) => x.checkVisibility?.());
    const i = rows.indexOf(r);
    const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : null;
    if (e.key === ' ') { e.preventDefault(); r.click(); return; }
    if (j == null || !rows[j]) return;
    e.preventDefault();
    r.tabIndex = -1; rows[j].tabIndex = 0; rows[j].focus();
  });

  // ---------- skip link + the live region ----------
  let live = null;
  function chatBox() {
    const s = document.querySelector('#surfaces .surface.active') || document;
    return [...s.querySelectorAll('.composer textarea, form.composer textarea, textarea')].find((t) => t.checkVisibility?.({ visibilityProperty: true }))
      || [...document.querySelectorAll('.tool-dock .composer textarea')].find((t) => t.checkVisibility?.({ visibilityProperty: true }));
  }
  function build() {
    const skip = document.createElement('a');
    skip.className = 'a11y-skip'; skip.href = '#'; skip.textContent = 'Skip to the chat';
    skip.addEventListener('click', (e) => { e.preventDefault(); const t = chatBox(); if (t) t.focus(); else document.querySelector('main')?.focus?.(); });
    document.body.prepend(skip);
    live = document.createElement('div');
    live.id = 'a11y-live'; live.className = 'a11y-only';
    live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    document.body.append(live);
    for (const [id, label] of [['rail', 'Apps and tools'], ['panel', 'Chats'], ['agent-buttons', null]]) { const n = document.getElementById(id); if (n && label && !n.getAttribute('aria-label')) n.setAttribute('aria-label', label); }
    const main = document.querySelector('main'); if (main && !main.hasAttribute('tabindex')) main.tabIndex = -1;
  }
  let sayT = 0;
  // polite: read when the screen reader is free; the same words twice are read twice (cleared first)
  function say(text) {
    if (!live) return;
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) return;
    clearTimeout(sayT);
    if (live.textContent) live.textContent = '';
    sayT = setTimeout(() => { live.textContent = t; }, 60);
  }
  // a finished reply in the chat on screen: one line (the start of the reply), never per token
  const plain = (s) => String(s || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*_`#>|]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<remember>[\s\S]*?<\/remember>/g, '');
  function hookChat() {
    if (typeof Native === 'undefined' || !Native.hooks) return;
    Native.hooks.event.push((event, chat) => {
      if (!chat || H.activeChat?.[chat.agentId] !== chat.id) return;
      const who = H.agent?.(chat.agentId)?.name || 'The AI';
      const last = chat.messages?.at(-1);
      if (event.type === 'done') say(`${who} replied: ${plain(last?.text).slice(0, 220)}`);
      else if (event.type === 'error') say(`${who}: ${plain(event.message || last?.text).slice(0, 160)}`);
      else if (event.type === 'stopped') say(`${who} stopped`);
    });
  }

  function start() {
    build();
    hookChat();
    const groups = document.getElementById('chat-groups');
    if (groups) { new MutationObserver(rovePanel).observe(groups, { childList: true }); rovePanel(); }
    // overlays are put straight on <body>
    new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches(OVERLAY)) opened(n); if (n.tagName === 'DIALOG') watchDialog(n); }
        for (const n of m.removedNodes) if (n.nodeType === 1 && open.some((o) => o.root === n)) closed(n);
      }
    }).observe(document.body, { childList: true });
    for (const d of document.querySelectorAll('dialog')) watchDialog(d);
    // controls added anywhere, tooltips changed: named in one idle pass
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes') { if (m.target.matches?.(CTRL)) queue(m.target); continue; }
        for (const n of m.addedNodes) if (n.nodeType === 1 && (n.firstElementChild || n.matches(CTRL))) queue(n);
        if (m.target.nodeType === 1 && m.target.matches?.(CTRL)) queue(m.target); // its text changed (◎ → "🎯 Debate")
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
    queue(document.body);
  }
  // (deferred scripts run while the page is "interactive": wait for all of them, Native included)
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();

  return { say, kbd: () => kbd, shortName, nameAll: () => { queue(document.body); flush(); }, _open: open };
})();
window.A11y = A11y;
