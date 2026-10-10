// Progress bars on screen (round 11, progress.js is the model). A slim bar sits on the thing itself: the reply being
// written, its chat's row in the list, the rail icon of the agent / tool doing the work, the cards (a dispatch, a video
// project, a flow, a make), the Commands page run. One quiet indicator at the bottom of the rail lists everything in
// progress (click: the list, a click on a row jumps there; right-click: its menu). Nothing on screen when nothing runs.
// Smooth (round 5 rules): the fill moves with `transform: scaleX()` and a CSS transition (compositor only), one
// timer for every bar (4× a second, and only while something runs), values compared before anything is written, no
// layout read in the loop. An estimate looks softer (lighter, hatched) and its words say "about"; "almost there"
// breathes with opacity; a hung bar turns ember.
// Where a bar goes is the item's `where` (progress.js): 'reply:<chatId>' (the live reply, plus a short line of words),
// 'row:<chatId>' (the chats list), 'rail:<surface id>' ('rail:tool:three', 'rail:<agent id>'), a CSS selector, or a
// function returning element(s). Keys 'make:<id>' / 'make:<id>:<part>' also find [data-make="<id>"] /
// [data-make-part="<part>"] (the makes stream marks its cards with those).
const ProgressUI = (() => {
  const TICK = 250;
  let timer = 0;
  const bars = new Map(); // host element → { key, bar, fill, note, f, cls, words }
  let dot = null; let pop = null;

  // ---------- where an item's bars go ----------
  const esc = (s) => (window.CSS?.escape ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'));
  function replyEl(chatId) {
    for (const a of H.agents()) {
      if (a.mode !== 'native' || H.activeChat[a.id] !== chatId) continue;
      const n = Native.view?.(a.id)?.list?.querySelector('.msg.streaming');
      if (n) return n;
    }
    return null;
  }
  function resolve(loc) {
    try {
      if (typeof loc === 'function') return [].concat(loc() || []).filter(Boolean);
      const s = String(loc);
      if (s.startsWith('reply:')) { const n = replyEl(s.slice(6)); return n ? [n] : []; }
      if (s.startsWith('row:')) { const n = document.querySelector(`#chat-groups .item[data-key="${esc(s.slice(4))}"]`); return n ? [n] : []; }
      if (s.startsWith('rail:')) { const n = document.querySelector(`#agent-buttons .agent-btn[data-id="${esc(s.slice(5))}"]`); return n ? [n] : []; }
      return [...document.querySelectorAll(s)].slice(0, 6);
    } catch { return []; }
  }
  function locators(it) {
    const out = [...(it.where || [])];
    const m = /^make:([^:]+)(?::(.+))?$/.exec(it.key);
    if (m) out.push(m[2] ? `[data-make="${esc(m[1])}"] [data-make-part="${esc(m[2])}"]` : `[data-make="${esc(m[1])}"]`);
    return out;
  }
  // the rail button of an agent (a docked director lives on its tool's button)
  const railOf = (agentId) => `rail:${H.surfaceIdFor ? H.surfaceIdFor(agentId) : agentId}`;

  // ---------- one bar ----------
  function paintBar(host, it, loc) {
    let b = bars.get(host);
    if (b && b.key !== it.key) { b.bar.remove(); b.note?.remove(); bars.delete(host); b = null; }
    if (!b) {
      const fill = el('i');
      const bar = el('div', { class: 'pg-bar', dataset: { pg: it.key }, attrs: { 'aria-hidden': 'true' } }, fill);
      host.classList.add('pg-host');
      host.append(bar);
      b = { key: it.key, bar, fill, note: null, f: -1, cls: '', words: '' };
      bars.set(host, b);
      // the first value is set without a transition (a host drawn again doesn't refill from 0), then it eases
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('pg-anim')));
    }
    if (b.bar.parentElement !== host) host.append(b.bar);
    const indet = it.meta?.indeterminate && it.state !== 'done';
    // half-percent steps: the CSS transition makes it glide, so finer writes would only cost style work
    const f = indet ? 1 : Math.round(Math.max(0.02, it.shown / 100) * 200) / 200;
    const cls = `pg-bar${b.bar.classList.contains('pg-anim') ? ' pg-anim' : ''}${it.estimated && it.state !== 'done' ? ' pg-est' : ''}${indet ? ' pg-indet' : ''} pg-${it.state}`;
    if (cls !== b.cls) { b.bar.className = cls; b.cls = cls; }
    if (f !== b.f) { b.fill.style.transform = `scaleX(${f})`; b.f = f; }
    // the live reply also gets a few words (about 40 % · about 20 s left)
    if (String(loc).startsWith('reply:')) {
      if (!b.note) { b.note = el('div', { class: 'pg-note' }); host.append(b.note); }
      if (b.note.parentElement !== host) host.append(b.note);
      // its words change at most once a second (and only when they differ)
      const now = performance.now();
      if (now - (b.wordsAt || 0) >= 1000 || it.state === 'done') { const w = Progress.words(it); if (w !== b.words) { b.note.textContent = w; b.words = w; b.wordsAt = now; } }
    }
  }
  function sync() {
    Progress.tick();
    const all = Progress.list({ all: true });
    const want = new Map();
    for (const it of all) for (const loc of locators(it)) for (const h of resolve(loc)) if (!want.has(h)) want.set(h, [it, loc]);
    for (const [host, b] of bars) {
      if (host.isConnected && want.get(host)?.[0].key === b.key) continue;
      b.bar.remove(); b.note?.remove(); bars.delete(host);
      if (!host.querySelector(':scope > .pg-bar')) host.classList.remove('pg-host');
    }
    for (const [host, [it, loc]] of want) paintBar(host, it, loc);
    paintDot();
    if (pop) paintPop();
    if (!all.length) stop();
  }
  let enabled = true; // off: no bars on screen at all (the smoothness check compares a streaming reply with and without)
  function setEnabled(on) {
    enabled = Boolean(on);
    if (!enabled) { stop(); closePop(); for (const [host, b] of bars) { b.bar.remove(); b.note?.remove(); host.classList.remove('pg-host'); } bars.clear(); if (dot) dot.hidden = true; } else start();
  }
  function start() { if (!timer && enabled) { timer = setInterval(sync, TICK); } }
  function stop() { clearInterval(timer); timer = 0; }
  Progress.on((it, what) => { if (what !== 'tick') start(); });

  // ---------- the indicator, bottom of the rail ----------
  function mountDot() {
    const rail = document.getElementById('rail');
    if (!rail) return null;
    if (!dot) {
      dot = el('button', { class: 'tool-btn pg-dot', id: 'pg-dot', type: 'button', hidden: true, dataset: { feature: 'Progress indicator' }, 'aria-label': 'In progress' },
        el('span', { class: 'pg-dot-bar' }, el('i')), el('b', { class: 'pg-dot-n' }));
      dot.addEventListener('click', () => (pop ? closePop() : openPop()));
      dot.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX + 6, e.clientY - 120, dotMenu()); });
    }
    const anchor = document.getElementById('sync-dot') || document.getElementById('keys-btn');
    if (anchor ? dot.nextElementSibling !== anchor : dot.parentElement !== rail) (anchor ? anchor.before(dot) : rail.append(dot));
    return dot;
  }
  function paintDot() {
    const top = Progress.list();
    if (!top.length && !dot) return;
    mountDot();
    if (!dot) return;
    const live = top.filter((it) => it.state !== 'done' && it.state !== 'failed');
    const hide = !top.length;
    if (dot.hidden !== hide) dot.hidden = hide;
    if (hide) return;
    const mean = live.length ? live.reduce((s, it) => s + it.shown, 0) / live.length : 100;
    const f = Math.round(Math.max(0.04, mean / 100) * 100) / 100;
    if (dot._f !== f) { dot.firstChild.firstChild.style.transform = `scaleX(${f})`; dot._f = f; }
    const n = live.length ? String(live.length) : '✓';
    const nb = dot.querySelector('.pg-dot-n');
    if (nb.textContent !== n) nb.textContent = n;
    const st = live.some((it) => it.state === 'hung') ? 'hung' : live.length && live.every((it) => it.estimated) ? 'est' : live.length ? 'run' : 'done';
    if (dot.dataset.state !== st) dot.dataset.state = st;
    const t = live.length ? `In progress (${live.length}):\n${live.slice(0, 6).map((it) => `• ${titleOf(it)}: ${Progress.words(it)}`).join('\n')}\nClick: the list · right-click: more` : 'Done';
    if (dot.title !== t) dot.title = t;
  }
  const titleOf = (it) => it.title || it.label || it.key;
  function dotMenu() {
    const dirs = H.config.agents.filter((a) => a.dock && a.mode === 'native');
    const on = dirs.some((a) => a.progressTag);
    return [
      { label: 'What\'s in progress…', action: () => openPop() },
      { label: 'Directors report their progress', hint: '≈ 25 tokens a message', checked: on, disabled: !dirs.length, action: () => Commands.exec?.(`/progress tags ${on ? 'off' : 'on'}`, H.claudeAgent?.()?.id) },
      { label: 'What Hearth learned (typical times)', action: () => Commands.exec?.('/progress learned', H.claudeAgent?.()?.id) },
      { label: 'Forget the typical times', more: true, action: () => { Progress.forget(); toast('Hearth starts learning how long things take again', { timeout: 2500 }); } },
      { label: 'Hide finished bars now', more: true, action: () => { for (const it of Progress.list({ all: true })) if (it.state === 'done' || it.state === 'failed') Progress.drop(it.key); sync(); } },
    ];
  }

  // ---------- the list (a small panel next to the indicator) ----------
  function openPop() {
    mountDot();
    if (!dot || pop) return;
    pop = el('div', { class: 'pg-pop', role: 'dialog', 'aria-label': 'In progress' });
    document.body.append(pop);
    const r = dot.getBoundingClientRect();
    pop.style.left = `${Math.round(r.right + 8)}px`;
    pop.style.bottom = `${Math.max(8, Math.round(innerHeight - r.bottom))}px`;
    pop._keys = '';
    paintPop();
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escKey, true); }, 0);
    start();
  }
  function closePop() { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escKey, true); }
  const outside = (e) => { if (pop && !pop.contains(e.target) && !dot?.contains(e.target)) closePop(); };
  const escKey = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); closePop(); } };
  function rowEl(it, child = false) {
    const fill = el('i');
    const fin = it.state === 'done' || it.state === 'failed';
    const acts = (fin ? [] : it.actions || []).map((a) => el('button', { type: 'button', class: 'ghost small', text: a.label, title: a.title || '', on: { click: (e) => { e.stopPropagation(); try { a.run(); } catch (err) { toast(err.message, { type: 'error' }); } setTimeout(sync, 50); } } }));
    const row = el('div', { class: `pg-row${child ? ' pg-child' : ''}`, dataset: { pg: it.key }, title: it.jump ? 'Click: go there' : '' },
      el('div', { class: 'pg-row-head' }, it.icon && !titleOf(it).startsWith(it.icon) ? el('span', { class: 'pg-ic', text: it.icon }) : null, el('b', { class: 'pg-t', text: titleOf(it) }), el('span', { class: 'pg-w' }), ...acts),
      el('div', { class: 'pg-bar pg-anim' }, fill));
    row._fill = fill;
    if (it.jump) row.addEventListener('click', () => { closePop(); try { it.jump(); } catch (err) { toast(err.message, { type: 'error' }); } });
    return row;
  }
  function paintPop() {
    if (!pop) return;
    const top = Progress.list();
    const rows = top.flatMap((it) => [[it, false], ...Progress.children(it.key).map((c) => [c, true])]);
    const keys = rows.map(([it]) => `${it.key}|${it.state === 'done' || it.state === 'failed' ? 'end' : (it.actions || []).map((a) => a.label).join()}`).join(',');
    if (keys !== pop._keys) {
      pop._keys = keys;
      pop.replaceChildren(el('div', { class: 'pg-pop-head', text: rows.length ? 'In progress' : 'Nothing in progress' }), ...rows.map(([it, c]) => rowEl(it, c)));
    }
    for (const row of pop.querySelectorAll('.pg-row')) {
      const it = Progress.get(row.dataset.pg);
      if (!it) continue;
      const w = Progress.words(it);
      const wn = row.querySelector('.pg-w');
      if (wn.textContent !== w) wn.textContent = w;
      const cls = `pg-bar pg-anim${it.estimated && it.state !== 'done' ? ' pg-est' : ''} pg-${it.state}`;
      const bar = row.lastChild;
      if (bar.className !== cls) bar.className = cls;
      const f = Math.round(Math.max(0.02, it.shown / 100) * 1000) / 1000;
      if (row._f !== f) { row._fill.style.transform = `scaleX(${f})`; row._f = f; }
    }
  }

  // ---------- commands ----------
  function fmtMs(ms) { return ms >= 90000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`; }
  const KIND_NAME = { reply: 'a reply', render: 'a render (ffmpeg)', 'seq-render': 'a Lab sequence render', snap: 'a website snapshot', sync: 'a sync pass', engine: 'an engine update', ffmpeg: 'installing ffmpeg', jam: 'a jam', 'jam-round': 'a jam round', intro: 'a video project', record: 'a recording', flow: 'a flow', 'flow-step': 'a flow step', comp: 'a dispatch part' };
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('progress')) return;
    Commands.register({
      name: 'progress', aliases: ['loading'], area: 'App', args: '[list | tags on|off | learned | forget]',
      desc: 'What is being made right now, with how far along it seems (the list at the bottom of the rail); tags on: directors report their own progress (≈ 25 tokens a message)',
      keywords: 'loading bar how far eta status running working',
      complete: () => [{ value: 'list', hint: 'everything in progress' }, { value: 'tags on', hint: 'directors say how far they are (≈ 25 tokens a message)' }, { value: 'tags off' }, { value: 'learned', hint: 'how long things usually take here' }, { value: 'forget', hint: 'learn the typical times again' }],
      run: async (args) => {
        const [sub, val] = args.trim().split(/\s+/);
        if (sub === 'tags') {
          const dirs = H.config.agents.filter((a) => a.dock && a.mode === 'native');
          if (!dirs.length) return 'No director agent yet (directors are the chats docked in a tool, like the Three Director).';
          const want = val ? val === 'on' : !dirs.some((a) => a.progressTag);
          for (const d of dirs) d.progressTag = want ? true : undefined;
          await saveConfig();
          return want ? `Directors (${dirs.map((d) => d.name).join(', ')}) now say how far along they are with a hidden <progress> tag (one line in their prompt, ≈ 25 tokens a message; from their next new chat).` : 'Directors no longer get the progress line; Hearth estimates their progress on its own.';
        }
        if (sub === 'forget') { Progress.forget(); return 'Hearth forgot how long things usually take and starts learning again.'; }
        if (sub === 'learned') {
          const h = Progress._test.hist();
          const rows = Object.entries(h).filter(([k, v]) => v.n >= 1 && k.split(':').length <= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 14);
          if (!rows.length) return 'Nothing learned yet: Hearth learns how long things take as they finish.';
          return `How long things usually take here (learned from finished runs):\n${rows.map(([k, v]) => `- ${KIND_NAME[k] || k.replace(/:/g, ' · ')}: about ${fmtMs(Math.exp(v.lm))} (${v.n} run${v.n > 1 ? 's' : ''}${v.tools >= 0.5 ? `, ${Math.round(v.tools)} tool call${Math.round(v.tools) === 1 ? '' : 's'}` : ''})`).join('\n')}`;
        }
        const top = Progress.list();
        openPop();
        if (!top.length) return 'Nothing is in progress right now.';
        return `In progress:\n${top.map((it) => `- ${titleOf(it)}: ${Progress.words(it)}${Progress.children(it.key).length ? `\n${Progress.children(it.key).map((c) => `  - ${titleOf(c)}: ${Progress.words(c)}`).join('\n')}` : ''}`).join('\n')}`;
      },
    });
  }
  function boot() {
    Progress.configure({ load: () => store.get('progress.hist', null), save: (h) => store.set('progress.hist', h) });
    register();
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('What\'s in progress (loading bars)', () => openPop());
    if (Progress.list({ all: true }).length) start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  return { sync, start, open: openPop, close: closePop, railOf, resolve, setEnabled, get enabled() { return enabled; }, bars: () => [...bars.entries()].map(([h, b]) => ({ host: h, key: b.key, f: b.f })) };
})();
window.ProgressUI = ProgressUI;
