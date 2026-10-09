// CaptureTour: scripted, repeatable recordings of Hearth, for an intro video made hands-free. A tour is plain text,
// one step per line ("open three", "wait 1.5s", "cmd /size 9:16", "zoom .three-preview 1.4", "caption "…" 2s"),
// run with the real UI: commands run, the cursor glides and clicks, captions and titles appear in the frame.
// Esc (a real key press) or Ctrl/⌘+Alt+T stops it; everything it changed (zoom, window size, overlays) comes back.
//   CaptureTour.run(idOrText, { name }) → { steps, shots, recording, skipped, ms }
//   CaptureTour.parse(text) → [{ op, args, line }] · lint(text) → problems · list() · save(tour) · remove(id)
//   CaptureTour.edit(id?) the editor · picker() · menuItems() · stop() · running()
const CaptureTour = (() => {
  const D = CaptureData;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const OPS = ['record', 'stop', 'open', 'wait', 'cmd', 'type', 'send', 'click', 'hover', 'move', 'key', 'zoom', 'pan', 'caption', 'title', 'highlight', 'scroll', 'shot', 'mark', 'pause', 'resume', 'cursor', 'clean', 'theme', 'size', 'fade', 'say', 'esc',
    'tilt', 'spin', 'push', 'shake', 'whip', 'flash', 'blur', 'letterbox', 'vignette', 'grain', 'watermark', 'timecode', 'progress', 'confetti', 'emoji', 'ease', 'bpm', 'beat', 'drag', 'hide', 'show'];
  const ALIAS = { rotate: 'spin', kenburns: 'push', 'ken-burns': 'push', bars: 'letterbox', cinema: 'letterbox', noise: 'grain', logo: 'watermark', clock: 'timecode', party: 'confetti', beats: 'beat', tempo: 'bpm', easing: 'ease', run: 'cmd', command: 'cmd', sleep: 'wait', delay: 'wait', go: 'open', show: 'open', press: 'key', keys: 'key', text: 'caption', sub: 'caption', subtitle: 'caption', card: 'title', spot: 'highlight', spotlight: 'highlight', screenshot: 'shot', snap: 'shot', marker: 'mark', unpause: 'resume', escape: 'esc', look: 'theme', window: 'size', end: 'stop', rec: 'record' };

  // ---------- parsing ----------
  // words, "quoted strings" (with \" inside), and a /command takes the rest of the line
  function tokens(line) {
    const out = []; let i = 0;
    while (i < line.length) {
      if (/\s/.test(line[i])) { i += 1; continue; }
      if (line[i] === '"' || line[i] === '“') {
        let j = i + 1; let s = '';
        while (j < line.length && line[j] !== '"' && line[j] !== '”') { if (line[j] === '\\' && line[j + 1] === '"') { s += '"'; j += 2; continue; } s += line[j]; j += 1; }
        out.push({ q: s }); i = j + 1; continue;
      }
      let j = i; while (j < line.length && !/\s/.test(line[j])) j += 1;
      out.push(line.slice(i, j)); i = j;
    }
    return out;
  }
  function parse(text) {
    const steps = [];
    String(text || '').split('\n').forEach((raw, n) => {
      const line = raw.replace(/\s+#\s.*$/, '').trim(); // "# comment" (a #selector has no space after the #)
      if (!line || line.startsWith('#')) return;
      const t = tokens(line);
      let op = String(t[0]).toLowerCase();
      op = ALIAS[op] || op;
      if (op.startsWith('/')) { steps.push({ op: 'cmd', args: [line], line: n + 1, raw: line }); return; }
      const args = op === 'cmd' ? [line.slice(line.indexOf(t[1]?.q ?? t[1] ?? '')).trim()] : t.slice(1).map((x) => (typeof x === 'object' ? x.q : x));
      steps.push({ op, args, line: n + 1, raw: line, quoted: t.slice(1).map((x) => typeof x === 'object') });
    });
    return steps;
  }
  const dur = (s, def = 1) => { const m = String(s ?? '').match(/^(\d+(?:\.\d+)?)(ms|s)?$/i); return m ? (m[2]?.toLowerCase() === 'ms' ? Number(m[1]) / 1000 : Number(m[1])) : def; };
  const isDur = (s) => /^\d+(?:\.\d+)?(ms|s)$/i.test(String(s || ''));
  function lint(text) {
    const problems = [];
    for (const s of parse(text)) {
      if (!OPS.includes(s.op)) problems.push(`line ${s.line}: unknown step "${s.op}"`);
      else if (s.op === 'cmd' && !/^\//.test(s.args[0] || '')) problems.push(`line ${s.line}: cmd needs a /command`);
      else if (s.op === 'cmd' && typeof Commands !== 'undefined' && !Commands.get(String(s.args[0]).slice(1).split(/\s/)[0])) problems.push(`line ${s.line}: no command ${String(s.args[0]).split(/\s/)[0]}`);
      else if (['click', 'hover', 'highlight', 'scroll'].includes(s.op) && !s.args[0]) problems.push(`line ${s.line}: ${s.op} needs a target`);
    }
    return problems;
  }

  // ---------- storage ----------
  let mine = null;
  async function load() { if (!mine) mine = (await window.hub.kvGet('capture-tours', { tours: [] })).tours || []; return mine; }
  async function list() { const own = await load(); return [...own.map((t) => ({ ...t, own: true })), ...D.TOURS.filter((t) => !own.some((o) => o.id === t.id))]; }
  async function get(id) { return (await list()).find((t) => t.id === id || t.label?.toLowerCase() === String(id).toLowerCase()) || null; }
  async function save(tour) {
    const own = await load();
    const id = tour.id || String(tour.label || 'tour').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `tour-${Date.now()}`;
    const t = { id, label: tour.label || id, steps: String(tour.steps || ''), updated: Date.now() };
    const i = own.findIndex((x) => x.id === id);
    if (i >= 0) own[i] = t; else own.push(t);
    await window.hub.kvSet('capture-tours', { tours: own });
    return t;
  }
  async function remove(id) { const own = await load(); mine = own.filter((t) => t.id !== id); await window.hub.kvSet('capture-tours', { tours: mine }); return true; }

  // ---------- finding things on screen ----------
  const visible = (n) => Boolean(n && n.isConnected && n.getClientRects().length && n.checkVisibility?.({ visibilityProperty: true }) !== false);
  function find(target) {
    const t = String(target || '').trim();
    if (!t) return null;
    const tid = Capture.targetId(t);
    if (tid && Capture.TARGETS[tid]?.el) { const n = Capture.elementFor(tid); if (n) return n; }
    try { const all = [...document.querySelectorAll(t)]; const n = all.find(visible); if (n) return n; } catch { /* not a selector: text below */ }
    // by its words: buttons, menu rows, tabs, links, labels
    const want = t.toLowerCase();
    const cands = [...document.querySelectorAll('button, [role="button"], a, label, summary, .tab, .menu button, h2, h3, .tool-title')].filter(visible);
    return cands.find((n) => n.textContent.trim().toLowerCase() === want) || cands.find((n) => n.textContent.trim().toLowerCase().includes(want)) || cands.find((n) => (n.title || '').toLowerCase().includes(want)) || null;
  }
  const center = (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function composer() { const s = Capture.surfaceEl(); const dock = s?.querySelector('.tool-dock:not([hidden])'); return ((dock && visible(dock)) ? dock : s)?.querySelector('.composer textarea') || [...document.querySelectorAll('.composer textarea')].find(visible) || null; }
  function chatAgentId() {
    const active = H.activeId || '';
    const toolId = active.startsWith('tool:') ? active.slice(5) : null;
    return ((toolId && H.agents().find((a) => a.dock === toolId && a.mode === 'native')) || (H.agent(active)?.mode === 'native' ? H.agent(active) : null) || H.claudeAgent())?.id;
  }

  // ---------- the view: zoom / pan on the compositor (one transform on #app) ----------
  const view = { k: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 };
  let easeNow = D.EASES[0].css; // "ease snappy" changes it for the next moves
  const tf = (v) => {
    const rot = v.rx || v.ry || v.rz;
    return `translate(${v.x}px, ${v.y}px) scale(${v.k})${rot ? ` translate(${innerWidth / 2}px, ${innerHeight / 2}px) perspective(1600px) rotateX(${v.rx}deg) rotateY(${v.ry}deg) rotateZ(${v.rz}deg) translate(${-innerWidth / 2}px, ${-innerHeight / 2}px)` : ''}`;
  };
  function setView(k, x, y, ms, ease, rot = {}) {
    const app = document.getElementById('app');
    if (!app) return Promise.resolve();
    const W = innerWidth; const Hh = innerHeight;
    // keep the zoomed picture covering the window (no empty edges)
    const cx = Math.min(0, Math.max(W - W * k, x)); const cy = Math.min(0, Math.max(Hh - Hh * k, y));
    const before = { ...view };
    Object.assign(view, { k, x: cx, y: cy, ...rot });
    // both ends in the same form, so the move interpolates smoothly
    const both = before.rx || before.ry || before.rz || view.rx || view.ry || view.rz;
    const form = (v) => (both ? tf({ ...v, rx: v.rx || 0.0001 }) : tf(v));
    const from = form(before); const to = form(view);
    app.style.transformOrigin = '0 0';
    const a = Capture.anim(app, [{ transform: from }, { transform: to }], { duration: Math.max(1, ms), easing: ease || easeNow, fill: 'forwards' });
    const still = view.k === 1 && view.x === 0 && view.y === 0 && !view.rx && !view.ry && !view.rz;
    return a.finished.catch(() => {}).then(() => { app.style.transform = still ? '' : tf(view); a.cancel(); });
  }
  function zoomTo(n, k = 1.5, ms = 1000, ease) {
    // where the thing is without the current zoom
    const r = n.getBoundingClientRect();
    const ux = (r.left + r.width / 2 - view.x) / view.k; const uy = (r.top + r.height / 2 - view.y) / view.k;
    return setView(k, innerWidth / 2 - ux * k, innerHeight / 2 - uy * k, ms, ease);
  }
  // fixed overlays that stay until switched off (letterbox, vignette, grain, watermark, clock, progress)
  const keep = {};
  function overlay(id, make) {
    keep[id]?.remove?.(); delete keep[id];
    if (!make) return null;
    const n = make();
    Capture.fx().append(n);
    keep[id] = n;
    Capture.anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'backwards' });
    return n;
  }
  function clearOverlays() { for (const id of Object.keys(keep)) { clearInterval(keep[id]?.timer); keep[id]?.remove?.(); delete keep[id]; } }
  const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;
  const CONFETTI = ['#ff6a1a', '#ffc233', '#9b6bff', '#3aa7ff', '#34c759', '#ff4fa3', '#ffffff'];
  // a point from a step's words: a selector / "text" (its center) or "x,y" / "x y" (pixels or 0..1 of the window)
  function pointOf(t) {
    const m = String(t || '').match(/^(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)$/);
    if (m) { let x = Number(m[1]); let y = Number(m[2]); if (x <= 1 && y <= 1) { x *= innerWidth; y *= innerHeight; } return { x, y }; }
    const n = find(t);
    return n ? center(n) : null;
  }
  function pointer(type, x, y) {
    const target = document.elementFromPoint(x, y) || document.body;
    const init = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: type === 'up' ? 0 : 1 };
    target.dispatchEvent(new PointerEvent(`pointer${type}`, init));
    target.dispatchEvent(new MouseEvent(`mouse${type}`, init));
  }

  // ---------- overlays in the frame: captions, titles, highlight, fade ----------
  async function caption(text, secs = 2.5, style = 'lower') {
    const kinetic = style === 'kinetic';
    const box = el('div', { class: `cap-caption cap-caption-${style}` }, el('span', { text: style === 'typewriter' || kinetic ? '' : text }));
    if (kinetic) {
      const words = String(text).split(/\s+/).filter(Boolean);
      words.forEach((w, i) => { const sp = el('b', { text: `${w} ` }); box.firstChild.append(sp); Capture.anim(sp, [{ opacity: 0, transform: 'translateY(30px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: i * Math.min(220, (secs * 500) / words.length), easing: 'cubic-bezier(.2,1.4,.3,1)', fill: 'backwards' }); });
    }
    Capture.fx().append(box);
    Capture.anim(box, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    if (style === 'typewriter') { for (let i = 1; i <= text.length; i += 1) { box.firstChild.textContent = text.slice(0, i); await sleep(Math.min(60, (secs * 400) / text.length)); } }
    await sleep(Math.max(0, secs * 1000 - 320));
    await Capture.anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished.catch(() => {});
    box.remove();
  }
  async function title(t, sub = '', secs = 2, style = 'forge') {
    const box = el('div', { class: `cap-title cap-title-${style}` }, el('h1', { text: t }), sub ? el('p', { text: sub }) : null);
    Capture.fx().append(box);
    await Capture.anim(box, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: 'forwards' }).finished.catch(() => {});
    Capture.anim(box.querySelector('h1'), [{ letterSpacing: '0.02em', opacity: 0.6 }, { letterSpacing: '0.08em', opacity: 1 }], { duration: secs * 1000, easing: 'ease-out', fill: 'forwards' });
    await sleep(Math.max(0, secs * 1000 - 420));
    await Capture.anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' }).finished.catch(() => {});
    box.remove();
  }
  async function highlight(n, secs = 2) {
    const r = n.getBoundingClientRect();
    const spot = el('div', { class: 'cap-spot', style: { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` } });
    Capture.fx().append(spot);
    await Capture.anim(spot, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' }).finished.catch(() => {});
    await sleep(Math.max(0, secs * 1000 - 600));
    await Capture.anim(spot, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.catch(() => {});
    spot.remove();
  }
  let fadeBox = null;
  async function fade(dir = 'in', secs = 0.6) {
    if (!fadeBox?.isConnected) { fadeBox = el('div', { class: 'cap-fade' }); Capture.fx().append(fadeBox); }
    const a = dir === 'out' ? [0, 1] : [1, 0];
    await Capture.anim(fadeBox, [{ opacity: a[0] }, { opacity: a[1] }], { duration: secs * 1000, fill: 'forwards' }).finished.catch(() => {});
    if (dir !== 'out') { fadeBox.remove(); fadeBox = null; }
  }
  function pressKey(combo) {
    const parts = String(combo).split('+').map((p) => p.trim()).filter(Boolean);
    let key = parts.pop() || '';
    const mods = parts.map((p) => p.toLowerCase());
    const ctrl = mods.some((m) => ['ctrl', 'cmd', '⌘', 'control', 'mod'].includes(m)); const alt = mods.some((m) => ['alt', 'option', '⌥'].includes(m)); const shift = mods.some((m) => ['shift', '⇧'].includes(m));
    const named = { esc: 'Escape', escape: 'Escape', enter: 'Enter', return: 'Enter', space: ' ', tab: 'Tab', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', del: 'Delete', delete: 'Delete', backspace: 'Backspace' };
    key = named[key.toLowerCase()] || (key.length === 1 ? (shift ? key.toUpperCase() : key.toLowerCase()) : key);
    Capture.cursorFx.keyShow(`${ctrl ? (/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+') : ''}${alt ? 'Alt+' : ''}${shift ? 'Shift+' : ''}${key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key}`);
    // shortcuts main.js handles before the page sees them: call what they do
    if (ctrl && key === ';' && typeof CmdBar !== 'undefined') { CmdBar.open(); return; }
    if (ctrl && key.toLowerCase() === 'k' && typeof AppUI !== 'undefined') { AppUI.palette(); return; }
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
    const init = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, ctrlKey: ctrl, altKey: alt, shiftKey: shift, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    if (key === 'Escape') { hideMenu?.(); }
  }
  async function typeInto(input, text, speed = 'normal') {
    if (!input) throw new Error('No chat box on screen');
    input.focus();
    const per = speed === 'fast' ? 18 : speed === 'slow' ? 75 : 38;
    for (const ch of String(text)) {
      input.value += ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(per + (/[ ,.]/.test(ch) ? per : 0));
    }
  }

  // ---------- running ----------
  let state = null; // { name, i, total, abort, restore: [] }
  const running = () => Boolean(state);
  function stop() { if (state) state.abort = true; return true; }
  // a real Esc stops the tour (synthetic keys from "key Escape" steps don't)
  addEventListener('keydown', (e) => { if (state && e.key === 'Escape' && e.isTrusted) { state.abort = true; } }, true);

  async function run(idOrText, { name = null } = {}) {
    if (state) throw new Error('A tour is already running (Esc stops it)');
    let text = idOrText; let label = name;
    const known = typeof idOrText === 'string' && !/\n/.test(idOrText) ? await get(idOrText) : null;
    if (known) { text = known.steps; label = label || known.label; }
    const steps = parse(text);
    if (!steps.length) throw new Error('This tour has no steps');
    state = { name: label || 'tour', i: 0, total: steps.length, abort: false, restore: [], bpm: 120, t0: performance.now() };
    const out = { name: state.name, steps: 0, shots: [], recording: null, skipped: [], ms: 0 };
    const t0 = performance.now();
    const cur = Capture.cursorFx;
    const hadCursor = cur.style;
    if (cur.style === 'off') cur.set('arrow', { clicks: 'ring' }); // a tour always shows where it clicks
    Capture.clean(true); // no toasts / menus / scrollbars in a tour's pictures
    state.restore.push(() => Capture.clean(false));
    let startedRec = false;
    try {
      for (const [i, s] of steps.entries()) {
        if (state.abort) break;
        state.i = i + 1;
        Capture.tourLabel?.(`${i + 1}/${steps.length}`);
        if (keep.progress) keep.progress.firstChild.style.transform = `scaleX(${(i + 1) / steps.length})`;
        try { await step(s, out, () => { startedRec = true; }); out.steps += 1; } catch (err) { out.skipped.push(`line ${s.line} (${s.raw}): ${err.message}`); }
      }
    } finally {
      // put everything back: zoom, overlays, window size, cursor, clean mode, a recording the tour started
      await setView(1, 0, 0, 300, null, { rx: 0, ry: 0, rz: 0 }).catch(() => {});
      clearOverlays();
      const app = document.getElementById('app'); if (app) { app.style.filter = ''; app.getAnimations().forEach((x) => x.cancel()); }
      easeNow = D.EASES[0].css;
      for (const fn of state.restore.reverse()) { try { await fn(); } catch { /* best effort */ } }
      if (fadeBox) { fadeBox.remove(); fadeBox = null; }
      for (const n of Capture.fx().querySelectorAll('.cap-caption, .cap-title, .cap-spot, .cap-flash, .cap-confetti, .cap-emoji')) n.remove();
      if (Capture.recording && startedRec) { try { out.recording = await Capture.stop({ quiet: true }); } catch (err) { out.skipped.push(`stop: ${err.message}`); } }
      cur.set(hadCursor === 'off' ? 'off' : hadCursor);
      out.ms = Math.round(performance.now() - t0);
      out.aborted = state.abort;
      state = null;
    }
    const rec = out.recording;
    toast(`▶ Tour "${out.name}" ${out.aborted ? 'stopped' : 'done'}: ${out.steps} steps${out.shots.length ? ` · ${out.shots.length} shots` : ''}${rec ? ` · 🎬 ${Capture.base(rec.path)}` : ''}${out.skipped.length ? ` · ${out.skipped.length} skipped` : ''}`, { timeout: 8000, action: rec ? { label: 'Open', fn: () => CaptureView.open(rec.path) } : out.shots[0] ? { label: 'Open', fn: () => CaptureView.library() } : out.skipped.length ? { label: 'Why', fn: () => Modal.alert('Skipped steps', out.skipped.join('\n')) } : null });
    return out;
  }
  async function step(s, out, onRecord) {
    const a = s.args;
    const cur = Capture.cursorFx;
    switch (s.op) {
      case 'record': {
        const o = { countdown: 0, tour: `${state.i}/${state.total}` };
        for (const w of a) {
          const lw = String(w).toLowerCase();
          if (D.RECORD.some((p) => p.id === lw)) o.preset = lw;
          else if (/^\d+\s*fps$/.test(lw) || /^(24|25|30|50|60)$/.test(lw)) o.fps = Number.parseInt(lw, 10);
          else if (D.parseFrame(lw)) o.size = D.parseFrame(lw).id;
          else if (lw === 'sound' || lw === 'app') o.audio = 'app';
          else if (lw === 'mic' || lw === 'voice') o.audio = 'mic';
          else if (lw === 'both') o.audio = 'app+mic';
          else if (lw === 'mute' || lw === 'silent') o.audio = 'none';
          else if (lw === 'mp4') o.mp4 = true;
          else if (Capture.targetId(lw)) o.target = Capture.targetId(lw);
        }
        if (o.preset && D.RECORD.find((p) => p.id === o.preset)?.cursor && !o.cursor) o.cursor = D.RECORD.find((p) => p.id === o.preset).cursor;
        await Capture.record(o);
        onRecord();
        if (cur.style === 'off') cur.set('arrow', { clicks: 'ring' });
        return;
      }
      case 'stop': if (Capture.recording) out.recording = await Capture.stop({ quiet: true }); return;
      case 'open': {
        const w = String(a[0] || '').toLowerCase();
        const tool = typeof Tools !== 'undefined' && (Tools.get(w) || Tools.all().find((t) => t.name.toLowerCase().includes(w)));
        if (tool) { activate(`tool:${tool.id}`); await sleep(400); return; }
        let agent = null;
        if (w === 'chat' || w === 'claude') agent = H.claudeAgent();
        else if (w === 'astra' || w === 'codex') agent = H.agents().find((x) => x.mode === 'native' && x.engine === 'codex');
        else agent = H.agents().find((x) => x.name.toLowerCase() === w || x.id === w) || H.agents().find((x) => x.name.toLowerCase().includes(w));
        if (!agent) throw new Error(`nothing called "${a[0]}"`);
        activate(agent.id); await sleep(300); return;
      }
      case 'wait': await sleep(dur(a[0], 1) * 1000); return;
      case 'cmd': {
        const line = String(a[0] || '').trim();
        if (!line.startsWith('/')) throw new Error('not a /command');
        const r = await Commands.tryRun(line, chatAgentId(), null, { source: 'code', say: () => {}, note: () => {} });
        if (r === false) throw new Error(`${line.split(/\s/)[0]} didn't run`);
        await frames2();
        return;
      }
      case 'type': {
        const input = composer();
        if (input) { const p = center(input); await cur.glide(p.x, p.y, 500); }
        await typeInto(input, a[0] ?? '', a[1]);
        return;
      }
      case 'send': { const input = composer(); const form = input?.closest('form'); if (!form) throw new Error('no chat box'); form.requestSubmit(); return; }
      case 'click': case 'hover': {
        const n = find(a[0]);
        if (!n) throw new Error(`can't find ${a[0]}`);
        n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        const p = center(n);
        await cur.glide(p.x, p.y, Math.round(dur(a[1], 0.7) * 1000));
        if (s.op === 'click') { cur.ripple(p.x, p.y); await sleep(90); n.focus?.(); n.click(); await frames2(); }
        return;
      }
      case 'move': {
        let x = Number(a[0]); let y = Number(a[1]);
        if (x <= 1 && y <= 1) { x *= innerWidth; y *= innerHeight; }
        await cur.glide(x, y, Math.round(dur(a[2], 0.8) * 1000));
        return;
      }
      case 'key': pressKey(a[0]); await sleep(120); return;
      case 'zoom': {
        if (String(a[0]).toLowerCase() === 'out' || String(a[0]).toLowerCase() === 'reset') { await setView(1, 0, 0, dur(a[1], 0.8) * 1000); return; }
        const nums = a.filter((x) => /^\d+(\.\d+)?$/.test(x)).map(Number);
        const d = a.find(isDur);
        if (/^\d/.test(a[0] || '') && nums.length >= 2 && !isDur(a[0])) { // zoom x y [k]
          const [x, y, k = 1.6] = nums; const px = x <= 1 ? x * innerWidth : x; const py = y <= 1 ? y * innerHeight : y;
          await setView(k, innerWidth / 2 - px * k, innerHeight / 2 - py * k, dur(d, 1) * 1000); return;
        }
        const n = find(a[0]);
        if (!n) throw new Error(`can't find ${a[0]}`);
        await zoomTo(n, nums[0] || 1.5, dur(d, 1) * 1000);
        return;
      }
      case 'pan': { const dx = Number(a[0]) || 0; const dy = Number(a[1]) || 0; await setView(view.k, view.x - dx, view.y - dy, dur(a[2], 1) * 1000); return; }
      case 'caption': { const style = a.slice(1).find((x) => D.CAPTIONS.some((c) => c.id === x)) || 'lower'; await caption(a[0] || '', dur(a.slice(1).find(isDur) ?? a[1], 2.5), style); return; }
      case 'title': {
        const quoted = a.filter((_, i) => s.quoted?.[i]);
        const style = a.find((x) => D.TITLES.some((t) => t.id === x)) || 'forge';
        await title(quoted[0] ?? a[0] ?? '', quoted[1] || '', dur(a.find(isDur), 2), style);
        return;
      }
      case 'highlight': { const n = find(a[0]); if (!n) throw new Error(`can't find ${a[0]}`); await highlight(n, dur(a[1], 2)); return; }
      case 'scroll': { const n = find(a[0]); if (!n) throw new Error(`can't find ${a[0]}`); n.scrollBy({ top: Number(a[1]) || 300, behavior: 'smooth' }); await sleep(700); return; }
      case 'shot': {
        const target = a.find((x) => Capture.targetId(x)) || 'window';
        const crop = a.find((x) => D.parseFrame(x) && !Capture.targetId(x)) || '';
        out.shots.push((await Capture.shot({ target, crop, quiet: true }))?.path);
        return;
      }
      case 'mark': if (!Capture.recording) throw new Error('not recording'); Capture.mark(a[0] || ''); return;
      case 'pause': Capture.pause(); return;
      case 'resume': Capture.resume(); return;
      case 'cursor': cur.set(String(a[0] || 'arrow').toLowerCase(), { clicks: a[1] || cur.clicks || 'ring' }); return;
      case 'clean': { const on = !/^off|no|false$/i.test(a[0] || 'on'); Capture.clean(on); if (on) state.restore.push(() => Capture.clean(false)); return; }
      case 'theme': { const r = await Commands.tryRun(`/theme ${a.join(' ')}`, chatAgentId(), null, { source: 'code', say: () => {}, note: () => {} }); if (r === false) throw new Error('no such look'); await sleep(250); return; }
      case 'size': {
        const m = String(a[0] || '').match(/^(\d+)\s*[x×]\s*(\d+)$/);
        if (!m) throw new Error('size WIDTHxHEIGHT');
        const r = await window.hub.capture.windowSize({ width: Number(m[1]), height: Number(m[2]) });
        if (r) state.restore.push(() => window.hub.capture.windowSize(r.before));
        await sleep(400);
        return;
      }
      case 'fade': await fade(String(a[0] || 'in').toLowerCase() === 'out' ? 'out' : 'in', dur(a[1], 0.6)); return;
      case 'say': toast(String(a[0] || ''), { timeout: 2500 }); return;
      case 'esc': pressKey('Escape'); hideMenu?.(); for (const d of [...document.querySelectorAll('dialog[open]')]) { if (!d.classList.contains('cap-tour-edit')) d.close(); } await sleep(120); return;
      case 'tilt': { const nums = a.filter((x) => /^-?[\d.]+$/.test(x)).map(Number); await setView(view.k, view.x, view.y, dur(a.find(isDur), 1) * 1000, null, { rx: nums[0] || 0, ry: nums[1] || 0 }); return; }
      case 'spin': await setView(view.k, view.x, view.y, dur(a.find(isDur), 1) * 1000, null, { rz: Number(a[0]) || 0 }); return;
      case 'push': {
        const n = find(a[0]) || document.getElementById('app');
        const k = Number(a.find((x) => /^[\d.]+$/.test(x))) || 1.3;
        await zoomTo(n, k, dur(a.find(isDur), 3) * 1000, D.EASES.find((e) => e.id === 'slow').css);
        return;
      }
      case 'shake': {
        const app = document.getElementById('app');
        const k = (Number(a.find((x) => /^[\d.]+$/.test(x))) || 0.5) * 14;
        const base = tf(view);
        const frames = Array.from({ length: 9 }, (_, i) => ({ transform: i === 0 || i === 8 ? base : `${base} translate(${(Math.random() - 0.5) * 2 * k}px, ${(Math.random() - 0.5) * 2 * k}px)` }));
        await Capture.anim(app, frames, { duration: dur(a.find(isDur), 0.4) * 1000 }).finished.catch(() => {});
        return;
      }
      case 'whip': {
        const app = document.getElementById('app');
        const dir = a.includes('right') ? 1 : -1; const ms = dur(a.find(isDur), 0.35) * 1000; const base = tf(view);
        if ((a[0] || 'out') === 'out') {
          const an = Capture.anim(app, [{ transform: base, filter: 'blur(0px)' }, { transform: `${base} translateX(${dir * innerWidth * 0.6}px)`, filter: 'blur(18px)', opacity: 0.4 }], { duration: ms, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' });
          await an.finished.catch(() => {});
          state.whip = { an, dir };
        } else {
          const d = state.whip?.dir ?? dir; state.whip?.an?.cancel(); state.whip = null;
          await Capture.anim(app, [{ transform: `${base} translateX(${-d * innerWidth * 0.6}px)`, filter: 'blur(18px)', opacity: 0.4 }, { transform: base, filter: 'blur(0px)', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.1,.6,.5,1)' }).finished.catch(() => {});
        }
        return;
      }
      case 'flash': {
        const col = { white: '#fff', gold: '#ffc233', black: '#000', red: '#ff3b30', violet: '#9b6bff' }[String(a[0] || 'white').toLowerCase()] || (/^#[\da-f]{3,8}$/i.test(a[0] || '') ? a[0] : '#fff');
        const f = el('div', { class: 'cap-flash', style: { background: col } });
        Capture.fx().append(f);
        await Capture.anim(f, [{ opacity: 0 }, { opacity: 0.92, offset: 0.25 }, { opacity: 0 }], { duration: dur(a.find(isDur), 0.25) * 1000 }).finished.catch(() => {});
        f.remove();
        return;
      }
      case 'blur': {
        const app = document.getElementById('app');
        const out = String(a[0] || 'in').toLowerCase() === 'out';
        await Capture.anim(app, [{ filter: `blur(${out ? 0 : 14}px)` }, { filter: `blur(${out ? 14 : 0}px)` }], { duration: dur(a.find(isDur), 0.6) * 1000, fill: 'forwards' }).finished.catch(() => {});
        app.getAnimations().filter((x) => x.effect?.getKeyframes?.().some((k) => k.filter)).forEach((x) => x.cancel());
        app.style.filter = out ? 'blur(14px)' : '';
        return;
      }
      case 'letterbox': {
        if (/^off|no$/i.test(a[0] || '')) { overlay('letterbox', null); return; }
        const ratio = Number(a.find((x) => /^[\d.]+$/.test(x))) || 2.39;
        const bar = Math.max(0, (innerHeight - innerWidth / ratio) / 2);
        overlay('letterbox', () => el('div', { class: 'cap-letterbox', style: { '--bar': `${Math.round(bar)}px` } }, el('i'), el('i')));
        return;
      }
      case 'vignette': overlay('vignette', /^off|no$/i.test(a[0] || '') ? null : () => el('div', { class: 'cap-vignette' })); return;
      case 'grain': overlay('grain', /^off|no$/i.test(a[0] || '') ? null : () => el('div', { class: 'cap-grain' })); return;
      case 'watermark': {
        if (/^off$/i.test(a[0] || '')) { overlay('watermark', null); return; }
        const corner = a.find((x) => /^(tl|tr|bl|br)$/i.test(x)) || 'br';
        overlay('watermark', () => el('div', { class: `cap-watermark cap-wm-${corner.toLowerCase()}`, text: a[0] || 'Hearth' }));
        return;
      }
      case 'timecode': {
        if (/^off|no$/i.test(a[0] || '')) { overlay('timecode', null); return; }
        const t0 = performance.now();
        const n = overlay('timecode', () => el('div', { class: 'cap-clock', text: '00:00.0' }));
        n.timer = setInterval(() => { const s2 = Capture.recording ? Capture.status().seconds : (performance.now() - t0) / 1000; n.textContent = fmtClock(s2); }, 100);
        return;
      }
      case 'progress': overlay('progress', /^off|no$/i.test(a[0] || '') ? null : () => el('div', { class: 'cap-progress' }, el('i'))); return;
      case 'confetti': {
        const n = Math.max(5, Math.min(200, Number(a[0]) || 60));
        const all = [];
        for (let i = 0; i < n; i += 1) {
          const c = el('i', { class: 'cap-confetti', style: { left: `${Math.random() * 100}vw`, background: CONFETTI[i % CONFETTI.length] } });
          Capture.fx().append(c);
          const fall = innerHeight * (0.8 + Math.random() * 0.4); const drift = (Math.random() - 0.5) * 240;
          all.push(Capture.anim(c, [{ transform: 'translate(0, -20px) rotate(0deg)', opacity: 1 }, { transform: `translate(${drift}px, ${fall}px) rotate(${Math.random() * 720}deg)`, opacity: 0.2 }], { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)', delay: Math.random() * 250 }).finished.catch(() => {}).then(() => c.remove()));
        }
        await Promise.race([Promise.all(all), sleep(2600)]);
        return;
      }
      case 'emoji': {
        const p = a.length >= 3 ? pointOf(`${a[1]},${a[2]}`) : { x: innerWidth / 2, y: innerHeight / 2 };
        const e = el('div', { class: 'cap-emoji', text: a[0] || '🔥', style: { left: `${p.x}px`, top: `${p.y}px` } });
        Capture.fx().append(e);
        await Capture.anim(e, [{ transform: 'translate(-50%, -50%) scale(0)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -80%) scale(.9)', opacity: 0 }], { duration: 1200 }).finished.catch(() => {});
        e.remove();
        return;
      }
      case 'ease': { const e = D.EASES.find((x) => x.id === String(a[0] || '').toLowerCase()); if (!e) throw new Error(`eases: ${D.EASES.map((x) => x.id).join(', ')}`); easeNow = e.css; return; }
      case 'bpm': { const b = Number(a[0]); if (!(b > 20 && b < 400)) throw new Error('bpm 20–400'); state.bpm = b; return; }
      case 'beat': await sleep((Number(a[0]) || 1) * (60 / state.bpm) * 1000); return;
      case 'drag': {
        const from = pointOf(a[0]); const to = pointOf(a[1]);
        if (!from || !to) throw new Error(`can't find ${!from ? a[0] : a[1]}`);
        const ms = dur(a[2], 0.8) * 1000;
        await cur.glide(from.x, from.y, 400);
        pointer('down', from.x, from.y);
        const steps = Math.max(6, Math.round(ms / 40));
        const glide = cur.glide(to.x, to.y, ms);
        for (let i = 1; i <= steps; i += 1) { await sleep(ms / steps); pointer('move', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps); }
        await glide;
        pointer('up', to.x, to.y);
        return;
      }
      case 'hide': case 'show': {
        const n = find(a[0]);
        if (!n) throw new Error(`can't find ${a[0]}`);
        if (s.op === 'hide') { const was = n.style.visibility; n.style.visibility = 'hidden'; state.restore.push(() => { n.style.visibility = was; }); } else n.style.visibility = '';
        return;
      }
      default: throw new Error(`unknown step "${s.op}"`);
    }
  }

  // ---------- the editor and menus ----------
  async function edit(id = null) {
    const t = id ? await get(id) : null;
    const name = el('input', { value: t?.label || '', placeholder: 'Tour name' });
    const area = el('textarea', { rows: 16, class: 'cap-tour-text', spellcheck: false, value: t?.steps || '# one step per line; Esc stops a running tour\nrecord promo\nopen claude\ncaption "Hello" 2s\nwait 1s\nstop' });
    const problems = el('p', { class: 'hint cap-tour-lint' });
    const lintNow = () => { const p = lint(area.value); problems.textContent = p.length ? `⚠ ${p.join(' · ')}` : `${parse(area.value).length} steps, all known.`; };
    area.addEventListener('input', debounce(lintNow, 250));
    const help = el('details', { class: 'cap-tour-help' }, el('summary', { text: 'Steps' }), el('table', {}, D.TOUR_STEPS.map(([k, d]) => el('tr', {}, el('td', {}, el('code', { text: k })), el('td', { text: d })))));
    const dlg = el('dialog', { class: 'ui-modal cap-tour-edit wide' }, el('h2', { text: t ? `Tour: ${t.label}` : 'New tour' }), name, area, problems, help,
      el('div', { class: 'dialog-actions' },
        t?.own ? el('button', { type: 'button', class: 'danger', text: 'Delete', on: { click: async () => { if (await Modal.confirm('Delete this tour?', t.label, { ok: 'Delete', danger: true })) { await remove(t.id); dlg.close(); } } } }) : null,
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', text: 'Cancel', on: { click: () => dlg.close() } }),
        el('button', { type: 'button', text: 'Save', on: { click: async () => { await save({ id: t?.own ? t.id : null, label: name.value.trim() || 'My tour', steps: area.value }); toast('Tour saved', { timeout: 1500 }); dlg.close(); } } }),
        el('button', { type: 'button', class: 'primary', text: '▶ Run', title: 'Save and run it (Esc stops)', on: { click: async () => { const saved = await save({ id: t?.own ? t.id : null, label: name.value.trim() || 'My tour', steps: area.value }); dlg.close(); setTimeout(() => run(saved.id).catch((e) => toast(e.message, { type: 'error' })), 250); } } })));
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    document.body.append(dlg);
    dlg.showModal();
    lintNow();
    return dlg;
  }
  async function picker() {
    const all = await list();
    Capture.picker('Tours', all.map((t) => ({ id: t.id, label: t.label })), (t) => run(t.id).catch((e) => toast(e.message, { type: 'error' })));
  }
  // Capture's menu wants items synchronously: give the cached list (refreshed in the background)
  let cache = D.TOURS.map((t) => ({ ...t }));
  list().then((l) => { cache = l; }).catch(() => {});
  function menuItemsSync() {
    list().then((l) => { cache = l; }).catch(() => {});
    const fail = (e) => toast(e.message, { type: 'error' });
    return [
      state ? { label: `■ Stop the tour (${state.i}/${state.total})  Esc`, action: stop } : null,
      ...cache.map((t) => ({ label: `▶ ${t.label}`, action: () => run(t.id).catch(fail) })),
      { label: '✎ Edit a tour…', items: () => cache.map((t) => ({ label: t.label, action: () => edit(t.id) })) },
      { label: '+ New tour…', action: () => edit() },
    ];
  }
  return { run, stop, running, parse, lint, list, get, save, remove, edit, picker, menuItems: menuItemsSync, state: () => (state ? { name: state.name, i: state.i, total: state.total } : null), find, setView, OPS };
})();
