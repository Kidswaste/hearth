// Round 15 (tour): guided spotlights — short 3–5 step tours of the big new things (render queue, chaining, board eyes
// + Pinterest, Apps + Meshy, chat access, Lab sequence editing, keys / Again). A pulse ring on the real control and
// one small card next to it (Back · Next · Try it · ×). Nothing is blocked: no backdrop, the app keeps working under
// it, the card can be dragged out of the way; Esc or × stops and remembers the step, so /tour <name> picks up there.
// Tour.pulse(target) is the same ring on its own ("Show me" in What's new, tips).
//   /tour <name> (shared with capture's /tour: names of spotlights win) · /spotlight [name | list | stop | restart <name>]
const Tour = (() => {
  const D = DiscoverData;
  const KEY = 'tour.progress'; // { id: { step, done, t } }
  const prog = () => store.get(KEY, {});
  const setProg = (id, v) => { const all = prog(); all[id] = { ...(all[id] || {}), ...v, t: Date.now() }; store.set(KEY, all); };
  let cur = null; // { tour, steps, i }
  let card = null; let ring = null; let target = null; let findT = 0; let ro = null;
  let clickHook = null; // (round 64, newtour64) the ringed control's click listener (one at a time)
  const unhookClick = () => { if (clickHook) clickHook.t.removeEventListener('click', clickHook.fn); clickHook = null; };

  const find = (name) => { const n = String(name || '').trim().toLowerCase().replace(/^the\s+/, ''); return D.TOURS.find((t) => t.id === n || t.name.toLowerCase() === n || t.name.toLowerCase().startsWith(n)) || D.TOURS.find((t) => n.length > 2 && `${t.id} ${t.name} ${t.why}`.toLowerCase().includes(n)) || null; };
  const stepsOf = (t) => t.steps.filter((s) => !s.when || (typeof Commands !== 'undefined' && Commands.get(s.when)));
  const visible = (n) => { if (!n || !n.isConnected) return false; const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(n).visibility !== 'hidden'; };
  function resolve(sel) {
    if (!sel) return null;
    if (sel instanceof Element) return visible(sel) ? sel : null;
    for (const s of [].concat(sel)) { if (typeof s === 'function') { try { const n = s(); if (n && visible(n)) return n; } catch { /* not there */ } continue; } try { for (const n of document.querySelectorAll(s)) if (visible(n)) return n; } catch { /* a bad selector is skipped */ } }
    return null;
  }

  // ---------- the ring ----------
  function placeRing(r, n) {
    if (!r || !n) return;
    const b = n.getBoundingClientRect(); const pad = 4; const o = origin(r);
    const css = `left:${Math.round(b.left - pad - o.x)}px;top:${Math.round(b.top - pad - o.y)}px;width:${Math.round(b.width + pad * 2)}px;height:${Math.round(b.height + pad * 2)}px`;
    if (r.style.cssText !== css) r.style.cssText = css;
  }
  // (round 64, newtour64) inside a dialog with a transform, position: fixed counts from the dialog's corner, not the window's
  function origin(node) {
    const host = node.parentElement;
    if (!host || host === document.body || getComputedStyle(host).transform === 'none') return { x: 0, y: 0 };
    const h = host.getBoundingClientRect();
    return { x: h.left + host.clientLeft - host.scrollLeft, y: h.top + host.clientTop - host.scrollTop };
  }
  // the ring on any control for a few seconds (What's new "Show me", tips); returns the element or null
  function pulse(sel, { ms = 4200, label = '' } = {}) {
    const n = resolve(sel);
    if (!n) return null;
    n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const r = el('div', { class: 'tour-ring tour-ring-solo', 'aria-hidden': 'true' }, label ? el('span', { class: 'tour-ring-label', text: label }) : null);
    document.body.append(r); placeRing(r, n);
    setTimeout(() => { r.classList.add('out'); setTimeout(() => r.remove(), 220); }, ms);
    return n;
  }

  // ---------- running a tour ----------
  function stop({ done = false, how = '' } = {}) {
    if (!cur) return false;
    setProg(cur.tour.id, done ? { step: 0, done: true } : { step: cur.i });
    const ended = cur; // (round 64, newtour64) a tour may want to know how it ended (Try what's new keeps its own progress)
    cur = null; clearTimeout(findT); unhookClick(); ro?.disconnect(); ro = null;
    removeEventListener('resize', reflow); removeEventListener('scroll', reflow, true); removeEventListener('keydown', onKey, true);
    card?.remove(); ring?.remove(); card = ring = target = null;
    try { ended.tour.onEnd?.({ done, step: ended.i, total: ended.steps.length, how }); } catch (err) { console.warn('tour end', err); }
    return true;
  }
  const reflow = debounce(() => { if (cur && target) { if (!target.isConnected) { show(cur.i); return; } placeRing(ring, target); placeCard(); } }, 80);
  function onKey(e) {
    if (!cur || e.target?.closest?.('input, textarea, [contenteditable=true]')) { if (e.key === 'Escape' && cur && !e.target?.closest?.('input, textarea')) stop(); return; }
    if (e.key === 'Escape') { const name = cur.tour.name; stop(); toast(`${name} paused: it picks up there next time`, { timeout: 2200 }); }
  }
  function placeCard() {
    if (!card) return;
    const w = card.offsetWidth || 300; const h = card.offsetHeight || 140;
    if (card.dataset.moved) return;
    let x; let y;
    // (round 64, newtour64) inside a dialog: inside the dialog's box (it clips what goes past it)
    const box = card.parentElement && card.parentElement !== document.body ? card.parentElement.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (target) {
      const b = target.getBoundingClientRect();
      // right of it, else below, else above; always inside the window
      if (b.right + 16 + w < box.right) { x = b.right + 14; y = b.top; } else if (b.bottom + 16 + h < box.bottom) { x = b.left; y = b.bottom + 14; } else { x = b.left; y = b.top - h - 14; }
    } else { x = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10) || 64) + 10; y = innerHeight - h - 12; }
    x = Math.max(box.left + 8, Math.min(box.right - w - 8, x)); y = Math.max(box.top + 8, Math.min(box.bottom - h - 8, y));
    const o = origin(card);
    const css = `left:${Math.round(x - o.x)}px;top:${Math.round(y - o.y)}px`;
    if (card.style.cssText !== css) card.style.cssText = css;
  }
  async function openFor(step) {
    const o = step.open;
    if (!o) return;
    if (typeof o === 'function') { try { await o(); } catch (err) { console.warn('tour open', err); } return; } // (round 64, newtour64) a place opened by code
    try {
      if (o.startsWith('tool:')) { if (H.surfaceIdFor?.(H.activeId) !== o) activate(o); } else if (o.startsWith('/')) await runLine(o, { quiet: true });
    } catch (err) { console.warn('tour open', err); }
  }
  // a command for "Try it": run when it only opens / shows something, else put in the chat box to send yourself
  async function runLine(line, { draft = true, quiet = false } = {}) {
    const has = (n) => Boolean(Commands.get(n));
    const name = (String(line).match(/^\/([\w-]+)/) || [])[1];
    if (!name || !has(name)) { toast(`${line}: not in this copy of Hearth yet`, { timeout: 2200 }); return false; }
    const agent = H.agent?.(H.activeId) ? H.activeId : H.claudeAgent().id;
    if (D.safeLine(line, has)) { await Commands.tryRun(line, agent, null, quiet ? { source: 'code', say: () => {}, note: () => {} } : { source: 'code' }); return true; }
    if (!draft) return false;
    if (!H.agent?.(H.activeId)) activate(agent);
    Native.setDraft(agent, `${line} `);
    setTimeout(() => document.querySelector('.surface.active .composer textarea')?.focus(), 60);
    toast(`${line}: in the chat box — add what you want and press Enter`, { timeout: 2600 });
    return 'draft';
  }
  async function show(i) {
    if (!cur) return;
    const steps = cur.steps;
    cur.i = Math.max(0, Math.min(steps.length - 1, i));
    setProg(cur.tour.id, { step: cur.i });
    const step = steps[cur.i];
    // (round 71, whatsnew71) a "Show me" step: the card says it first; the place opens and the ring goes on at Show me
    if (step.showMe && !cur.opened.has(cur.i)) { clearTimeout(findT); target = null; ring?.remove(); ring = null; ro?.disconnect(); unhookClick(); paint(step); return; }
    await openFor(step);
    // the control may take a moment to appear (a tool opening, a panel drawing): look a few times, never per frame
    target = null;
    for (let k = 0; k < 8 && cur && !target; k += 1) { target = resolve(step.target); if (!target && step.target) await new Promise((r) => { findT = setTimeout(r, 180); }); }
    if (!cur) return;
    paint(step);
  }
  function paint(step) {
    const { tour, steps, i } = cur;
    const last = i === steps.length - 1;
    const waiting = Boolean(step.showMe && !cur.opened.has(i)); // (round 71) Show me not clicked yet
    const btn = (text, cls, fn, title = '') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); fn(); } } });
    const body = el('div', { class: 'tour-body' },
      el('div', { class: 'tour-head' }, el('span', { class: 'tour-ic', text: tour.icon }), el('b', { text: step.title }), el('span', { class: 'spacer' }),
        el('span', { class: 'tour-n', text: `${i + 1}/${steps.length}` }), btn('×', 'tour-x', () => { stop(); toast(`Tour paused: it picks up at step ${i + 1} next time`, { timeout: 2400 }); }, 'Stop (it picks up here next time)')),
      el('p', { class: 'tour-text', text: step.text }),
      !target && step.target && !waiting ? el('p', { class: 'tour-hint', text: 'Not on screen right now.' }) : null,
      el('div', { class: 'tour-btns' },
        i ? btn('‹ Back', 'ghost small', () => show(i - 1)) : null,
        // (round 64, newtour64) Skip / Later for tours that offer them (Try what's new): skip = not for me, later = paused here
        tour.onEnd && tour.skippable ? btn('Skip', 'ghost small tour-skip', () => stop({ how: 'skip' }), 'Not for me: skip this one') : null,
        tour.onEnd && tour.skippable ? btn('Later', 'ghost small tour-later', () => { stop({ how: 'later' }); toast(`${tour.name}: paused at step ${i + 1}`, { timeout: 2200 }); }, 'Pause here: it picks up at this step next time') : null,
        step.cmd ? btn('Try it', 'ghost small tour-try', () => { try { tour.onTry?.(step); } catch { /* progress is a convenience */ } runLine(step.cmd); }, D.safeLine(step.cmd, (n) => Boolean(Commands.get(n))) ? 'Runs it' : 'Puts it in the chat box') : null,
        el('span', { class: 'spacer' }),
        step.showMe ? btn('Show me', `small ${waiting ? 'primary' : 'ghost'} tour-show`, () => { cur.opened.add(i); show(i); }, 'Takes you there and rings the button') : null, // (round 71, whatsnew71)
        btn(last ? 'Done ✓' : 'Next ›', `small ${waiting ? 'ghost' : 'primary'} tour-next`, () => (last ? (stop({ done: true }), toast(tour.doneText || `${tour.name}: done. Discover has the other tours.`, { timeout: 2200 })) : show(i + 1)))));
    if (!card) {
      card = el('div', { class: 'tour-card speed-card', role: 'dialog', 'aria-label': `Tour: ${tour.name}`, 'data-no-usage': '' });
      // drag it out of the way by its head
      card.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.tour-head') || e.target.closest('button')) return;
        const r = card.getBoundingClientRect(); const dx = e.clientX - r.left; const dy = e.clientY - r.top;
        const mv = (ev) => { card.dataset.moved = '1'; const o = origin(card); card.style.cssText = `left:${Math.max(0, ev.clientX - dx) - o.x}px;top:${Math.max(0, ev.clientY - dy) - o.y}px`; };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      document.body.append(card);
    }
    card.replaceChildren(body);
    card.dataset.tour = tour.id; card.dataset.step = String(i);
    // (round 64, newtour64) a control inside an open dialog: the card and the ring go into that dialog (a modal dialog sits
    // in the top layer, above anything in the page)
    const host = target?.closest('dialog[open]') || document.body;
    if (card.parentElement !== host) host.append(card);
    if (target) {
      if (!ring) { ring = el('div', { class: 'tour-ring', 'aria-hidden': 'true' }); }
      if (ring.parentElement !== host) host.append(ring);
      placeRing(ring, target);
      ro?.disconnect(); ro = new ResizeObserver(reflow); ro.observe(target);
      setTimeout(reflow, 320); // (round 64, newtour64) a panel that slides in: the ring and card follow once it has settled
      // (round 64, newtour64) clicking the ringed control is doing it for real (tour.onTargetClick); with step.clickNext the
      // tour follows to the next step by itself
      unhookClick();
      if (step.clickNext || tour.onTargetClick) {
        const t = target; const me = cur;
        const fn = () => { unhookClick(); if (cur !== me || me.i !== i) return; try { tour.onTargetClick?.(step); } catch { /* progress is a convenience */ } if (!step.clickNext) return; setTimeout(() => { if (cur !== me || me.i !== i) return; if (i === me.steps.length - 1) stop({ done: true }); else show(i + 1); }, 450); };
        t.addEventListener('click', fn); clickHook = { t, fn };
      }
    } else { ring?.remove(); ring = null; ro?.disconnect(); unhookClick(); }
    placeCard();
  }
  // start (or pick up) a tour: { restart } starts at step 1
  function start(name, { restart = false } = {}) {
    const t = typeof name === 'object' ? name : find(name);
    if (!t) return null;
    stop();
    const steps = stepsOf(t);
    const p = prog()[t.id];
    cur = { tour: t, steps, i: 0, opened: new Set() }; // opened: the Show me steps shown (round 71)
    addEventListener('resize', reflow); addEventListener('scroll', reflow, { capture: true, passive: true }); addEventListener('keydown', onKey, true); // (round 71) the ring follows a scrolled list (Settings)
    if (typeof Usage !== 'undefined') Usage.track?.(`Tour › ${t.name}`, { area: 'Tours', label: t.name });
    show(!restart && p && !p.done ? p.step || 0 : 0);
    return t;
  }
  function listText() {
    const p = prog();
    return D.TOURS.map((t) => { const s = p[t.id]; const n = stepsOf(t).length; return `- ${t.icon} **${t.name}** · \`/tour ${t.id}\` · ${t.why} · ${s?.done ? 'seen ✓' : s ? `paused at ${(s.step || 0) + 1}/${n}` : `${n} steps`}`; }).join('\n');
  }
  function menuItems() {
    const p = prog();
    return D.TOURS.map((t) => ({ label: `${t.icon} ${t.name}`, hint: p[t.id]?.done ? '✓' : p[t.id] ? `${(p[t.id].step || 0) + 1}/${stepsOf(t).length}` : t.why, action: () => start(t) }));
  }

  // ---------- commands ----------
  function register() {
    if (typeof Commands === 'undefined') return;
    // only exact spotlight ids / names (capture's own tours: hello, intro, yours)
    const isMine = (args) => { const a = String(args || '').trim().toLowerCase(); const w = a.split(/\s+/); const exact = (s) => D.TOURS.some((t) => t.id === s || t.name.toLowerCase() === s); return Boolean(a && (w[0] === 'guided' || w[0] === 'spotlights' || exact(a) || ((w[0] === 'restart' || w[0] === 'again') && exact(w.slice(1).join(' '))))); };
    const run = (args) => {
      const a = String(args || '').trim();
      const w = a.split(/\s+/); const lw = (w[0] || '').toLowerCase();
      if (!a || lw === 'list' || lw === 'guided' || lw === 'spotlights') return `**Guided spotlights** (a ring on the real control, × or Esc pauses, the same command picks up there):\n${listText()}`;
      if (lw === 'stop') return stop() ? 'Tour paused (it picks up at the same step next time).' : 'No guided tour is running.';
      const restart = lw === 'restart' || lw === 'again';
      const t = start(restart ? w.slice(1).join(' ') : a, { restart });
      if (!t) return `No guided tour called "${a}". ${D.TOURS.map((x) => x.id).join(' · ')}`;
      return null;
    };
    const complete = (args) => { const q = String(args || '').toLowerCase(); return [{ value: 'list' }, { value: 'stop' }, ...D.TOURS.map((t) => ({ value: t.id, hint: t.name })), ...D.TOURS.map((t) => ({ value: `restart ${t.id}` }))].filter((o) => o.value.startsWith(q)); };
    if (!Commands.get('spotlight')) {
      Commands.register({
        name: 'spotlight', aliases: ['spotlights', 'guide-me'], area: 'App', args: '[name | list | stop | restart <name>]',
        desc: 'Guided spotlights: a 3–5 step tour of a big new thing, with a ring on the real controls (skippable, picks up where you stopped)',
        keywords: 'tour guided walkthrough show me how learn new features onboarding',
        examples: ['/spotlight', '/spotlight renders', '/spotlight sequence', '/spotlight restart keys'],
        complete, run,
      });
    }
    // /tour <spotlight> shares the name with capture's scripted tours (theirs for everything else)
    Commands.register({
      name: 'tour', area: 'App', args: '<spotlight name>', whenLabel: 'with a spotlight name (renders, studio, eyes, apps, access, sequence, keys, discover)',
      desc: 'A guided spotlight of a new feature (/spotlight lists them)', when: (_ctx, args) => isMine(args), complete, run,
    });
  }
  addEventListener('DOMContentLoaded', () => {
    register();
    try { AppUI.addAction?.('Guided tour of a new feature…', () => { const r = document.getElementById('keys-btn')?.getBoundingClientRect(); showMenu((r?.right || 80) + 6, Math.max(8, (r?.top || innerHeight) - 240), menuItems()); }); } catch { /* no palette */ }
    try { Keys.add({ area: 'Discover', keys: 'Esc', what: 'Pause a guided tour (it picks up there next time)' }); } catch { /* no keys sheet */ }
  });
  return { start, stop, pulse, find, runLine, menuItems, listText, get current() { return cur ? { id: cur.tour.id, step: cur.i, total: cur.steps.length } : null; }, progress: prog };
})();
