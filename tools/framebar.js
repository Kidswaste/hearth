// ▮ The frame budget bar (round 64, framebar64), the Lab side (lazy group "framebar", loaded the first time the Lab's
// stats line shows). The owner builds Clink in the Lab and wants to see at a glance whether the scene fits a 240 Hz frame
// (4.17 ms) on this computer:
//   the bar      on screen by default in the stats line (no new row), right after the fps: a thin bar + "3.1 / 4.2 ms";
//                the frame's measured time (the CPU work of its renders, or the gap between frames when they come late:
//                the GPU) against the target refresh; the target sits at 2/3 of the bar; amber over it, red at 1.5×
//   point/click  the card: each layer's share (its own code, its drawing, draw calls, triangles, texture memory, shader
//                programs) and "The most expensive layer is X (1.9 ms)." with a visible Why? button
//   Why?         a 3-second look at that layer (on demand only) → its top costs (draw calls by material, shadow
//                casters and maps, transparent overdraw, post-processing, lights, triangles, textures) and plain
//                suggestions (instancing, merge geometries, share materials, smaller shadows, fewer casters / lights…);
//                each with a visible "Ask the Three Director" (put in the director's box, never sent)
//   target       the card's "240 Hz (this screen) ▾": Auto (the screen's rate) or 240 / 144 / 60 (also the bar's
//                right-click)
// The bar only reads the stats; the page measures each layer only while the whole stats line shows (the pointer over
// the preview) or the card is open (tools/three-sandbox.html "frame budget bar"); otherwise nothing.
// Chat (secondary): /framebar [why [layer] | target auto|240|144|60 | status]. 0 tokens until you send a draft.
//   FrameBar.el() · paint(msg) · visible(on) · open() · close() · why(layerId?) · draft(i) · setTarget(v) · state()
const FrameBar = (() => {
  const C = () => FrameBarCore;
  const KEY = 'three.framebarHz';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.framebar : null);
  const S = { el: null, fill: null, card: null, msg: null, f: null, rows: [], res: null, resFor: null, busy: false, pinned: false, closeT: 0, sig: '', cardSig: '', drafts: 0, lastDraft: null, whys: 0 };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- the target ----------
  function pref() { const v = store.get(KEY, 'auto'); return C().PREFS.includes(v) ? v : 'auto'; }
  function tgt() { return C().target(pref(), S.msg?.hz); }
  function setTarget(v) {
    const p = v === 'auto' || v == null ? 'auto' : Number(v);
    if (!C().PREFS.includes(p)) throw new Error('The target is Auto (the screen\'s rate), 240, 144 or 60.');
    store.set(KEY, p); S.sig = ''; S.cardSig = '';
    if (S.msg) paint(S.msg);
    return tgt();
  }
  function targetMenu(x, y) {
    const t = tgt(); const p = pref();
    showMenu(x, y, [
      { label: `${p === 'auto' ? '✓ ' : ''}Auto: this screen (${C().target('auto', S.msg?.hz).hz} Hz)`, action: () => setTarget('auto') },
      ...[240, 144, 60].map((hz) => ({ label: `${p === hz ? '✓ ' : ''}${hz} Hz (${C().ms1(1000 / hz)} ms)`, action: () => setTarget(hz) })),
    ].map((x2) => ({ ...x2, hint: '' })));
    return t;
  }

  // ---------- the bar ----------
  function make() {
    const b = el('span', 'fb');
    const track = el('span', 'fb-bar');
    track.setAttribute('role', 'meter'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-label', 'Frame budget');
    S.fill = el('i', 'fb-fill'); track.append(S.fill, el('b', 'fb-mark'));
    S.track = track; S.txt = el('span', 'fb-txt', '');
    b.append(track, S.txt);
    b.addEventListener('mouseenter', () => { clearTimeout(S.closeT); open(); });
    b.addEventListener('mouseleave', closeSoon);
    b.addEventListener('click', (e) => { e.stopPropagation(); S.pinned = !S.pinned; if (S.pinned) open(); else close(); }); // (not the stats line's compact toggle)
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); targetMenu(e.clientX, e.clientY); });
    S.el = b;
    return b;
  }
  // the stats line puts it right after the fps on every rebuild (tools/three.js paintStats)
  const barEl = () => S.el || make();
  // one stats message while the stats line shows (twice a second at most): written only when it changed
  function paint(msg) {
    if (!msg) return;
    S.msg = msg;
    const f = C().frame(msg, tgt()); S.f = f;
    if (msg.fb) S.rows = C().blend(S.rows, C().rows(msg.fb, (id) => lab()?.name(id)), 0.5);
    const b = barEl();
    const sig = `${Math.round(C().barScale(f.fill) * 200)}|${f.level}|${f.ms}|${f.budget}`;
    if (sig !== S.sig) {
      S.sig = sig;
      S.fill.style.transform = `scaleX(${C().barScale(f.fill).toFixed(3)})`;
      b.dataset.level = f.level;
      S.track.setAttribute('aria-valuenow', String(Math.round(f.fill * 100)));
      S.track.setAttribute('aria-valuetext', `${C().ms1(f.ms)} of ${C().ms1(f.budget)} ms at ${f.hz} Hz`);
      // (round 73, startfast73) words changed in place, the title only when it differs: a new text node / the same title
      // written again woke every page-wide observer with each stats message (≈ every 3 s on a still picture)
      const txt = `${C().ms1(f.ms)} / ${C().ms1(f.budget)} ms`;
      if (S.txt.firstChild?.nodeType === 3) { if (S.txt.firstChild.data !== txt) S.txt.firstChild.data = txt; } else S.txt.textContent = txt;
      const title = `Frame budget: the time each frame takes (the words next to it) of the ${C().ms1(f.budget)} ms a frame has at ${f.hz} Hz${pref() === 'auto' ? ', this screen' : ''}${f.gpu ? ' · frames come late: the GPU' : ''}. Point or click: each layer and Why?`;
      if (b.title !== title) b.title = title;
    }
    if (S.card?.isConnected) paintCard();
  }
  // the stats line hid (or showed): the card goes with it
  function visible(on) { if (!on) close(true); }

  // ---------- the card ----------
  function open() {
    const h = lab(); if (!h) return null;
    if (!S.card) {
      S.card = el('div', 'fb-card');
      S.card.setAttribute('role', 'dialog'); S.card.setAttribute('aria-label', 'Frame budget');
      S.card.addEventListener('mouseenter', () => clearTimeout(S.closeT));
      S.card.addEventListener('mouseleave', closeSoon);
      S.card.addEventListener('click', (e) => e.stopPropagation());
    }
    if (!S.card.isConnected) h.host.append(S.card);
    S.cardSig = '';
    paintCard();
    h.recheck?.(); // (each layer measured while the card is open)
    return S.card;
  }
  function closeSoon() { if (S.pinned || S.busy) return; clearTimeout(S.closeT); S.closeT = setTimeout(() => close(), 350); }
  function close(force) { if (!force && (S.pinned || S.busy)) return; S.pinned = false; clearTimeout(S.closeT); const was = S.card?.isConnected; S.card?.remove(); if (was) lab()?.recheck?.(); }
  const row = (cells, cls) => { const r = el('div', `fb-row${cls ? ` ${cls}` : ''}`); for (const c of cells) r.append(typeof c === 'string' ? el('span', '', c) : c); return r; };
  function paintCard() {
    const c = S.card; if (!c) return;
    const f = S.f || C().frame(S.msg, tgt()); const ms1 = C().ms1;
    const top = C().top(S.rows);
    const sig = JSON.stringify([f, S.rows.map((r) => [r.id, r.name, r.total, r.code, r.draw, r.calls, r.tris, r.texMB, r.progs]), S.res ? S.whys : 0, S.busy, pref()]);
    if (sig === S.cardSig) return;
    S.cardSig = sig;
    const head = el('div', 'fb-head');
    head.append(el('b', `fb-${f.level}`, `${ms1(f.ms)} ms`), el('span', '', ` of ${ms1(f.budget)} ms`));
    const tb = el('button', 'fb-target', `${f.hz} Hz${pref() === 'auto' ? ' (this screen)' : ''} ▾`); tb.type = 'button'; tb.title = 'The refresh the bar measures against';
    tb.addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); targetMenu(r.left, r.bottom + 4); });
    const x = el('button', 'fb-x', '✕'); x.type = 'button'; x.title = 'Close'; x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => close(true));
    head.append(tb, x);
    const lines = [head];
    lines.push(el('div', 'fb-sub', f.still ? 'The picture is still: its last frame\'s work.' : `CPU ${ms1(f.cpu)} ms${f.gap ? ` · frames every ${ms1(f.gap)} ms${f.gpu ? ' (late: the GPU)' : ''}` : ''}`));
    if (S.rows.length) {
      lines.push(row(['Layer', 'code', 'draw', 'calls', 'tris', 'tex', 'shaders'], 'fb-th'));
      for (const r of S.rows.slice(0, 8)) lines.push(row([r.name, `${ms1(r.code)}`, `${ms1(r.draw)}`, C().big(r.calls), C().big(r.tris), `${r.texMB ? `${Math.round(r.texMB)} MB` : r.tex}`, String(r.progs)], r === top ? 'fb-top' : ''));
      const s = el('div', 'fb-say', C().sentence(top));
      if (top) {
        const w = el('button', 'fb-why', S.busy ? 'Looking… 3 s' : 'Why?'); w.type = 'button'; w.disabled = S.busy;
        w.title = `Look at ${top.name} for 3 seconds: what costs the most, and what would help`;
        w.addEventListener('click', () => { why(top.id).catch((err) => toast(window.calmError ? calmError(err) : err.message, { type: 'error', raw: err })); });
        s.append(' ', w);
      }
      lines.push(s);
    } else lines.push(el('div', 'fb-sub', 'Measuring each layer…'));
    if (S.res) lines.push(...resultLines());
    c.replaceChildren(...lines);
  }
  function resultLines() {
    const R = S.res; const out = [];
    if (!R.res.ok) { out.push(el('div', 'fb-sub', R.res.error || 'The look didn\'t finish.')); return out; }
    out.push(el('div', 'fb-h', `${R.name}: what costs the most (${R.res.sec} s, ${R.res.frames} frames)`));
    const ul = el('ul', 'fb-costs'); for (const x of R.costs) ul.append(el('li', `fb-c-${x.id}`, x.text)); out.push(ul);
    if (R.sugg.length) {
      out.push(el('div', 'fb-h', 'What would help'));
      const ol = el('ol', 'fb-sugg');
      R.sugg.forEach((s, i) => {
        const li = el('li', `fb-s-${s.id}`); li.append(el('b', '', s.title), el('span', '', ` ${s.fix} `));
        const d = el('button', 'fb-draft', 'Ask the Three Director'); d.type = 'button'; d.title = 'Put this in the Three Director\'s box (not sent: you press Enter)';
        d.addEventListener('click', () => { draft(i).catch((err) => toast(err.message, { type: 'error', raw: err })); });
        li.append(d); ol.append(li);
      });
      out.push(ol);
    } else out.push(el('div', 'fb-sub', 'Nothing stands out in this layer: its cost is spread evenly.'));
    return out;
  }

  // ---------- why? ----------
  async function why(layerId) {
    const h = lab(); if (!h) throw new Error('Open the Lab first.');
    const id = layerId || C().top(S.rows)?.id || h.selected?.();
    if (!id) throw new Error('No layer is drawing right now.');
    if (S.busy) throw new Error('A look is already running.');
    S.busy = true; S.res = null; S.cardSig = '';
    if (S.card?.isConnected) paintCard();
    try {
      const res = await h.call({ type: 'framebar-why', layer: id, ms: 3000 }, 15000);
      const t = tgt(); const name = h.name(id) || id;
      const ctx = { budgetMs: t.ms, hz: t.hz, layer: name };
      S.res = { id, name, res, costs: C().costs(res, ctx), sugg: C().suggest(res, ctx) };
      S.whys += 1;
      return S.res;
    } finally { S.busy = false; S.cardSig = ''; if (S.card?.isConnected) paintCard(); }
  }
  // ---------- ✎ the director's box, never sent (as playtest notes / the hitch map do) ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function director() {
    if (directorOf()) return directorOf();
    await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'framebar', say: () => {}, note: () => {} });
    for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
    return directorOf();
  }
  async function draft(i) {
    const s = S.res?.sugg?.[i]; if (!s) throw new Error('Press "why?" first.');
    const text = s.draft;
    S.drafts += 1; S.lastDraft = text;
    const dir = await director().catch(() => null);
    if (dir) {
      Tools.openDock?.('three');
      const there = () => [...document.querySelectorAll('.composer textarea')].some((t) => t.value === text);
      for (let k = 0; k < 14 && !there(); k += 1) { Native.setDraft?.(dir.id, text); if (!there()) await sleep(150); }
      if (there()) { toast(`In ${dir.name}'s box, not sent: press Enter when it reads right`, { timeout: 4500 }); return { drafted: true, text }; }
    }
    navigator.clipboard?.writeText(text).catch(() => {});
    toast('Copied for the director (its chat isn\'t open): paste it there', { timeout: 4000 });
    return { drafted: false, text };
  }
  const counting = () => Boolean(S.card?.isConnected);
  const state = () => ({ target: tgt(), pref: pref(), frame: S.f, rows: S.rows, top: C().top(S.rows), busy: S.busy, result: S.res, open: Boolean(S.card?.isConnected), drafts: S.drafts, lastDraft: S.lastDraft });

  // ---------- chat ----------
  if (typeof Commands !== 'undefined' && !Commands.get?.('framebar')) {
    Commands.register({
      name: 'framebar', area: 'Three.js Lab', args: '[why [layer] | target auto|240|144|60 | status]',
      desc: 'The Lab\'s frame budget bar: does the scene fit a frame of the screen\'s rate (240 Hz = 4.17 ms)? status: the frame and each layer; why: a 3-second look at the most expensive layer (or the one named) with suggestions; target: the refresh to measure against',
      keywords: 'frame budget fps 240 hz 144 60 ms slow heavy expensive layer draw calls shadows instancing profile performance gpu cpu',
      examples: ['/framebar', '/framebar why', '/framebar target 144'],
      complete: (a) => ['status', 'why', 'target auto', 'target 240', 'target 144', 'target 60'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const [w, ...rest] = String(args || '').trim().split(/\s+/);
        const v = (w || 'status').toLowerCase();
        const ms1 = C().ms1;
        if (v === 'target') { const t = setTarget(rest[0] ? (rest[0].toLowerCase() === 'auto' ? 'auto' : Number(rest[0])) : 'auto'); return `The bar measures against ${t.hz} Hz (${ms1(t.ms)} ms)${t.auto ? ', this screen' : ''}.`; }
        await ThreeLab.cmd?.({ show: true });
        if (v === 'why') {
          const h = lab(); let id = null;
          if (rest.length) { const q = rest.join(' ').toLowerCase(); id = h?.ids?.().find((x) => String(h.name(x) || '').toLowerCase() === q || x === q) || null; if (!id) throw new Error(`No layer named “${rest.join(' ')}”.`); }
          if (!id && !S.rows.length) { h?.measure?.(true); for (let i = 0; i < 20 && !S.rows.length; i += 1) await sleep(250); }
          const r = await why(id);
          if (!r.res.ok) return r.res.error;
          return [`${r.name}: ${r.costs.map((x) => x.text).join(' · ')}`, ...r.sugg.map((s, i) => `${i + 1}. ${s.title}: ${s.fix}`)].join('\n');
        }
        const f = S.f; const top = C().top(S.rows);
        if (!f) return 'Hover the Lab preview: the stats line (and the bar) shows there.';
        return `${ms1(f.ms)} ms of ${ms1(f.budget)} ms (${f.hz} Hz): ${f.level === 'ok' ? 'fits' : 'over'}. ${C().sentence(top)}`;
      },
    });
  }
  return { el: barEl, paint, visible, open, close, why, draft, setTarget, state, counting };
})();
