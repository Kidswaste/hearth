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
  const OPS = ['record', 'stop', 'open', 'wait', 'cmd', 'type', 'send', 'click', 'hover', 'move', 'key', 'zoom', 'pan', 'caption', 'title', 'highlight', 'scroll', 'shot', 'mark', 'pause', 'resume', 'cursor', 'clean', 'theme', 'size', 'fade', 'say', 'esc'];
  const ALIAS = { run: 'cmd', command: 'cmd', sleep: 'wait', delay: 'wait', go: 'open', show: 'open', press: 'key', keys: 'key', text: 'caption', sub: 'caption', subtitle: 'caption', card: 'title', spot: 'highlight', spotlight: 'highlight', screenshot: 'shot', snap: 'shot', marker: 'mark', unpause: 'resume', escape: 'esc', look: 'theme', window: 'size', end: 'stop', rec: 'record' };

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
      const line = raw.replace(/\s+#.*$/, '').trim();
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
  const view = { k: 1, x: 0, y: 0 };
  function setView(k, x, y, ms, ease) {
    const app = document.getElementById('app');
    if (!app) return Promise.resolve();
    const W = innerWidth; const Hh = innerHeight;
    // keep the zoomed picture covering the window (no empty edges)
    const cx = Math.min(0, Math.max(W - W * k, x)); const cy = Math.min(0, Math.max(Hh - Hh * k, y));
    const from = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; const to = `translate(${cx}px, ${cy}px) scale(${k})`;
    app.style.transformOrigin = '0 0';
    Object.assign(view, { k, x: cx, y: cy });
    const a = app.animate([{ transform: from }, { transform: to }], { duration: Math.max(1, ms), easing: ease || D.EASES[0].css, fill: 'forwards' });
    return a.finished.catch(() => {}).then(() => { app.style.transform = k === 1 && cx === 0 && cy === 0 ? '' : to; a.cancel(); });
  }
  function zoomTo(n, k = 1.5, ms = 1000) {
    // where the thing is without the current zoom
    const r = n.getBoundingClientRect();
    const ux = (r.left + r.width / 2 - view.x) / view.k; const uy = (r.top + r.height / 2 - view.y) / view.k;
    return setView(k, innerWidth / 2 - ux * k, innerHeight / 2 - uy * k, ms);
  }

  // ---------- overlays in the frame: captions, titles, highlight, fade ----------
  async function caption(text, secs = 2.5, style = 'lower') {
    const box = el('div', { class: `cap-caption cap-caption-${style}` }, el('span', { text: style === 'typewriter' ? '' : text }));
    Capture.fx().append(box);
    box.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    if (style === 'typewriter') { for (let i = 1; i <= text.length; i += 1) { box.firstChild.textContent = text.slice(0, i); await sleep(Math.min(60, (secs * 400) / text.length)); } }
    await sleep(Math.max(0, secs * 1000 - 320));
    await box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished.catch(() => {});
    box.remove();
  }
  async function title(t, sub = '', secs = 2, style = 'forge') {
    const box = el('div', { class: `cap-title cap-title-${style}` }, el('h1', { text: t }), sub ? el('p', { text: sub }) : null);
    Capture.fx().append(box);
    await box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: 'forwards' }).finished.catch(() => {});
    box.querySelector('h1').animate([{ letterSpacing: '0.02em', opacity: 0.6 }, { letterSpacing: '0.08em', opacity: 1 }], { duration: secs * 1000, easing: 'ease-out', fill: 'forwards' });
    await sleep(Math.max(0, secs * 1000 - 420));
    await box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' }).finished.catch(() => {});
    box.remove();
  }
  async function highlight(n, secs = 2) {
    const r = n.getBoundingClientRect();
    const spot = el('div', { class: 'cap-spot', style: { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` } });
    Capture.fx().append(spot);
    await spot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' }).finished.catch(() => {});
    await sleep(Math.max(0, secs * 1000 - 600));
    await spot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.catch(() => {});
    spot.remove();
  }
  let fadeBox = null;
  async function fade(dir = 'in', secs = 0.6) {
    if (!fadeBox?.isConnected) { fadeBox = el('div', { class: 'cap-fade' }); Capture.fx().append(fadeBox); }
    const a = dir === 'out' ? [0, 1] : [1, 0];
    await fadeBox.animate([{ opacity: a[0] }, { opacity: a[1] }], { duration: secs * 1000, fill: 'forwards' }).finished.catch(() => {});
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
    state = { name: label || 'tour', i: 0, total: steps.length, abort: false, restore: [] };
    const out = { name: state.name, steps: 0, shots: [], recording: null, skipped: [], ms: 0 };
    const t0 = performance.now();
    const cur = Capture.cursorFx;
    const hadCursor = cur.style;
    if (cur.style === 'off') cur.set('arrow', { clicks: 'ring' }); // a tour always shows where it clicks
    let startedRec = false;
    try {
      for (const [i, s] of steps.entries()) {
        if (state.abort) break;
        state.i = i + 1;
        Capture.tourLabel?.(`${i + 1}/${steps.length}`);
        try { await step(s, out, () => { startedRec = true; }); out.steps += 1; } catch (err) { out.skipped.push(`line ${s.line} (${s.raw}): ${err.message}`); }
      }
    } finally {
      // put everything back: zoom, overlays, window size, cursor, clean mode, a recording the tour started
      await setView(1, 0, 0, 300).catch(() => {});
      for (const fn of state.restore.reverse()) { try { await fn(); } catch { /* best effort */ } }
      if (fadeBox) { fadeBox.remove(); fadeBox = null; }
      for (const n of Capture.fx().querySelectorAll('.cap-caption, .cap-title, .cap-spot')) n.remove();
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
