// (round 61, presethover61) ✦ Preset hover: a small floating chat over the Sound desk that writes a preset for the open
// Serum 2 / Vital. You type "dark reese bass with slow movement"; a toolless helper (Claude or Astra, your pick) gets
// only the parameters that request needs (grouped by section, capped at PresetHoverCore.CAP, never the state blob) and
// answers with a compact JSON patch, checked against the plugin's real list and applied live. Follow-ups ("brighter",
// "less reverb") refine it; ↶ / ↷ step through every change; Save keeps it (the plugin's own state) in the Sound
// desk's preset bank. Drag it by its title, fold it to a pill, it remembers where; it moves off the keys, the transport
// and the instrument picker by itself. Chat: /preset <description> (astra.js (end); also /vst-preset),
// /preset tweak|undo|redo|save.
// The host is reached through a thin adapter (host()): WorkbenchVST.live (a live parameter API, when there is one),
// else WorkbenchVST's door (its validated live `patch` action), or a test host (PresetHover._test.useHost).
var PresetHover = (() => {
  const C = PresetHoverCore, POS = 'presethover.pos', ENG = 'presethover.engine', MINI = 'presethover.mini';
  // the instrument's own controls the window never sits on
  const KEEP_CLEAR = '.wb-live-keys, .wb-live-transport, .wb-sound-picker';
  let win = null, desk = null, door = null, testHost = null, hist = C.history(), session = null, running = null, ro = null;
  const engine = () => store.get(ENG, 'claude') === 'codex' ? 'codex' : 'claude';
  const engineLabel = e => e === 'codex' ? 'Astra' : 'Claude';

  // ---- the host adapter: { current() → { name, parameters } | null, apply(values), snapshot() → state, keep(name, state) }
  function host() {
    if (testHost) return testHost;
    const vst = typeof WorkbenchVST !== 'undefined' ? WorkbenchVST : null;
    const live = vst?.live; // a live parameter API (round 61, vstlive61), when it has landed: used first
    const d = door || vst?.door;
    if (live && typeof live.current === 'function' && typeof live.apply === 'function') return { ...d, ...live, keep: live.keep || d?.keep, snapshot: live.snapshot || d?.snapshot };
    return d || null;
  }
  const current = () => { try { return host()?.current() || null; } catch { return null; } };

  // ---- the helper chat: one lean, toolless turn (the quest-review pattern: no files, no hub tools, no memory)
  const runs = new Map(); let listening = false;
  function helper(engineId, text) {
    const agent = H.agents().find(a => a.mode === 'native' && a.engine === engineId && !a.dock);
    if (!agent) throw Error(`Add ${engineLabel(engineId)} to Hearth first (or switch the preset writer).`);
    if (!listening) { window.hub.onEngineEvent(ev => runs.get(ev.chatId)?.(ev)); listening = true; }
    const id = `preset-hover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; let finish;
    const promise = new Promise((resolve, reject) => {
      let out = ''; const timer = setTimeout(() => { window.hub.stop(id).catch(() => {}); finish(Error(`${engineLabel(engineId)} took too long. Try again.`)); }, 180000);
      finish = (err, v) => { if (!runs.has(id)) return; runs.delete(id); clearTimeout(timer); err ? reject(err) : resolve(v); };
      runs.set(id, ev => {
        if (ev.type === 'delta') out += ev.text || '';
        else if (ev.type === 'done') { if (ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: ev.usage, source: 'preset-hover' } })); finish(null, { text: ev.text || out, usage: ev.usage || null }); }
        else if (ev.type === 'error' || ev.type === 'stopped') finish(Error(ev.message || 'Stopped.'));
      });
      // questReview is engines.js' toolless critique run (no hub tools, no file access, no web, no memory): exactly
      // what a patch writer needs; lean + helper drop the rest. The persona is one fixed line (a cached prefix).
      window.hub.send({ agentId: agent.id, chatId: id, session: {}, text, options: { questReview: true, lean: true, helper: true, persona: C.PERSONA, webSearch: 'disabled' } }).catch(finish);
    });
    return { promise, cancel: () => { window.hub.stop(id).catch(() => {}); finish(Error('Stopped.')); } };
  }

  // ---- asking for a preset / a tweak
  async function ask(request, { fresh = false, engine: eng } = {}) {
    request = String(request || '').trim(); if (!request) throw Error('Describe the sound, e.g. “dark reese bass with slow movement”.');
    if (running) throw Error('Still writing the last one… (Esc stops it)');
    const h = host(), cur = current();
    if (!h || !cur) throw Error('Open Serum 2 or Vital in the Sound desk first.');
    if (fresh || !session || session.instrument !== cur.name) { session = { instrument: cur.name, request, steps: [], name: '' }; hist.clear(); }
    const follow = session.steps.length > 0;
    const touched = [...new Set(hist.applied().flatMap(s => Object.keys(s.after)))];
    const picked = C.pick(cur.parameters, follow ? `${request} ${session.request}` : request, { touched });
    if (!picked.count) throw Error(`${cur.name} shows no controls this can set. Refresh it from the native editor.`);
    const text = C.prompt({ instrument: cur.name, request, groups: picked.groups, steps: follow ? session.steps : [] });
    const who = eng || engine();
    log('you', request); status(`${engineLabel(who)} is writing… (${picked.count} of ${picked.of} controls, ≈${C.tokens(text) + 60} tokens)`);
    running = helper(who, text); paint();
    let reply; try { reply = await running.promise; } finally { running = null; paint(); }
    const r = C.parse(reply.text), v = C.validate(cur.parameters, r.set), keys = Object.keys(v.values);
    const notes = [v.rejected.length ? `skipped ${v.rejected.length} (${v.rejected.slice(0, 3).map(x => `${x.key}: ${x.why}`).join('; ')})` : '', v.clamped.length ? `${v.clamped.length} kept in range` : ''].filter(Boolean).join(' · ');
    if (!keys.length) { log('ai', `${r.say || 'Nothing to change.'}${notes ? ` · ${notes}` : ''}`); status(''); return { changed: [], ...v }; }
    const before = C.before(cur.parameters, v.values);
    await h.apply(v.values);
    const used = reply.usage ? (reply.usage.input || 0) + (reply.usage.output || 0) : C.tokens(text) + C.tokens(reply.text);
    hist.push({ request, before, after: v.values, name: r.name, say: r.say, tokens: used });
    session.steps.push({ request }); if (r.name) session.name = r.name;
    log('ai', `${r.say || 'Applied.'} · ${keys.length} control${keys.length === 1 ? '' : 's'}${notes ? ` · ${notes}` : ''}`, `${used} tokens`);
    status(''); paint();
    return { changed: keys, name: r.name, ...v, tokens: used };
  }
  async function step(dir) {
    const h = host(); if (!h || !current()) throw Error('Open Serum 2 or Vital first.');
    const s = dir < 0 ? hist.undo() : hist.redo(); if (!s) throw Error(dir < 0 ? 'Nothing to undo.' : 'Nothing to redo.');
    try { await h.apply(dir < 0 ? s.before : s.after); } catch (err) { dir < 0 ? hist.redo() : hist.undo(); throw err; }
    log('sys', `${dir < 0 ? '↶ Undid' : '↷ Redid'} “${s.request}”`); paint(); return s;
  }
  async function save(name) {
    const h = host(); if (!h || !current()) throw Error('Open Serum 2 or Vital first.');
    if (typeof h.snapshot !== 'function' || typeof h.keep !== 'function') throw Error('This instrument can’t keep presets yet.');
    const label = String(name || session?.name || session?.request || 'AI preset').trim().slice(0, 60);
    const state = await h.snapshot(); await h.keep(label, state);
    log('sys', `💾 Saved “${label}” in your preset bank`); return label;
  }

  // ---- the window
  function build() {
    const input = el('textarea', { class: 'ph-input', rows: 1, placeholder: 'Describe a sound… (“dark reese bass, slow movement”)', attrs: { 'aria-label': 'Describe the preset', maxlength: '300' } });
    const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; ask(v).catch(err => { log('err', err.message); status(''); }); };
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
      if (ev.key === 'Escape' && running) running.cancel();
    });
    const pickEngine = el('button', { class: 'ph-engine', type: 'button', title: 'Who writes the preset (click to switch)', on: { click: () => { store.set(ENG, engine() === 'claude' ? 'codex' : 'claude'); paint(); } } });
    const btn = (text, title, fn, cls = '') => el('button', { class: `ph-btn ${cls}`, type: 'button', text, title, attrs: { 'aria-label': title }, on: { click: () => Promise.resolve().then(fn).catch(err => log('err', err.message)) } });
    const head = el('div', { class: 'ph-head' }, el('span', { class: 'ph-title', text: '✦ Preset' }), el('span', { class: 'ph-inst' }), pickEngine,
      btn('＋', 'New preset (forget the follow-ups)', () => { session = null; hist.clear(); win.querySelector('.ph-log').replaceChildren(); paint(); input.focus(); }),
      btn('–', 'Fold to a pill', () => mini(true), 'ph-fold'));
    const pill = el('button', { class: 'ph-pill', type: 'button', text: '✦ Preset', title: 'Write a preset with AI', on: { click: () => { if (!pill.dataset.dragged) mini(false); delete pill.dataset.dragged; } } });
    const foot = el('div', { class: 'ph-foot' },
      btn('↶', 'Undo the last AI change', () => step(-1), 'ph-undo'), btn('↷', 'Redo', () => step(1), 'ph-redo'),
      btn('Save', 'Save as a named preset in your bank', () => saveAsk(), 'ph-save'), el('span', { class: 'ph-status', attrs: { 'aria-live': 'polite' } }));
    win = el('div', { class: 'ph-win', attrs: { role: 'dialog', 'aria-label': 'Preset writer' } }, pill, el('div', { class: 'ph-body' }, head, el('div', { class: 'ph-log' }), el('div', { class: 'ph-row' }, input, btn('➤', 'Write it', send, 'ph-send')), foot));
    drag(head, false); drag(pill, true);
    return win;
  }
  function saveAsk() {
    const foot = win.querySelector('.ph-foot'); if (foot.querySelector('.ph-name')) return;
    const name = el('input', { class: 'ph-name', value: session?.name || '', placeholder: 'Preset name', attrs: { 'aria-label': 'Preset name', maxlength: '60' } });
    const done = ok => { const v = name.value.trim(); name.remove(); if (ok) save(v).catch(err => log('err', err.message)); };
    name.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
    name.addEventListener('blur', () => setTimeout(() => name.isConnected && done(false), 150));
    foot.insertBefore(name, foot.querySelector('.ph-status')); name.focus(); name.select();
  }
  function log(kind, text, meta) {
    const box = win?.querySelector('.ph-log'); if (!box) return;
    box.append(el('div', { class: `ph-msg ph-${kind}` }, el('span', { text }), meta ? el('small', { text: meta }) : null));
    while (box.children.length > 12) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }
  function status(text) { const s = win?.querySelector('.ph-status'); if (s) s.textContent = text; }
  function paint() {
    if (!win) return;
    const cur = current();
    win.querySelector('.ph-inst').textContent = cur ? cur.name : 'no instrument';
    win.querySelector('.ph-engine').textContent = engineLabel(engine());
    win.querySelector('.ph-undo').disabled = !hist.canUndo || !!running; win.querySelector('.ph-redo').disabled = !hist.canRedo || !!running;
    win.querySelector('.ph-send').disabled = !!running; win.querySelector('.ph-save').disabled = !cur || !!running;
    win.querySelector('.ph-input').placeholder = !cur ? 'Open Serum 2 or Vital first' : session?.steps.length ? 'Tweak it… (“brighter”, “less reverb”)' : 'Describe a sound… (“dark reese bass, slow movement”)';
    win.classList.toggle('busy', !!running);
  }
  function mini(on) { store.set(MINI, on); win?.classList.toggle('mini', on); place(); if (!on) win?.querySelector('.ph-input')?.focus(); }

  // ---- position: remembered (fraction of the window so it survives resizes), clamped, and off the instrument's controls
  const rectOf = n => n.getBoundingClientRect();
  const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function clear(x, y, w, h) {
    const r = { left: x, top: y, right: x + w, bottom: y + h };
    return ![...(desk?.querySelectorAll(KEEP_CLEAR) || [])].some(n => { const k = rectOf(n); return k.width && hits(r, k); });
  }
  function place(prefer) {
    if (!win || !desk) return;
    const vw = innerWidth, vh = innerHeight, w = win.offsetWidth || 300, h = win.offsetHeight || 40, d = rectOf(desk), m = 8;
    const saved = prefer || store.get(POS, null);
    const fit = (x, y) => [Math.min(Math.max(m, x), vw - w - m), Math.min(Math.max(m, y), vh - h - m)];
    const top = Math.max(d.top, 0) + m, bottom = Math.min(d.bottom, vh) - h - m, right = Math.min(d.right, vw) - w - m, left = Math.max(d.left, 0) + m;
    const candidates = [saved ? [saved.x * vw, saved.y * vh] : null, [right, top], [right, bottom], [left, bottom], [right, (top + bottom) / 2], [left, top]].filter(Boolean).map(([x, y]) => fit(x, y));
    // the first free spot, else the first one that covers least: fold to the pill there, which is small
    let at = candidates.find(([x, y]) => clear(x, y, w, h));
    if (!at && !win.classList.contains('mini')) { win.classList.add('mini', 'auto-mini'); return place(prefer); }
    at ||= candidates[0];
    win.style.left = `${Math.round(at[0])}px`; win.style.top = `${Math.round(at[1])}px`;
  }
  function drag(handle, isPill) {
    handle.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || (!isPill && ev.target.closest('button'))) return;
      const r = rectOf(win), dx = ev.clientX - r.left, dy = ev.clientY - r.top, x0 = ev.clientX, y0 = ev.clientY; let moved = false;
      try { handle.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
      const move = e => { if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return; moved = true; win.classList.add('dragging'); win.style.left = `${e.clientX - dx}px`; win.style.top = `${e.clientY - dy}px`; };
      const up = e => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); win.classList.remove('dragging');
        if (!moved) return; if (isPill) handle.dataset.dragged = '1';
        const x = (e.clientX - dx) / innerWidth, y = (e.clientY - dy) / innerHeight; store.set(POS, { x, y }); place({ x, y });
        // where it landed if it had to step aside off the keys / transport
        const r2 = rectOf(win); store.set(POS, { x: r2.left / innerWidth, y: r2.top / innerHeight });
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }

  // ---- the Sound desk mounts / leaves (WorkbenchVST calls these)
  function attach(out, hostDoor) {
    detach(); desk = out; door = hostDoor || door;
    if (!win) build();
    win.classList.toggle('mini', store.get(MINI, false) === true); win.classList.remove('auto-mini');
    out.append(win); paint();
    // the desk redraws (an instrument opens, sections fold): keep clear of its controls again. Event-driven only.
    ro = new ResizeObserver(() => { paint(); if (!win.classList.contains('dragging')) place(); }); ro.observe(out);
    addEventListener('resize', onResize);
    requestAnimationFrame(() => place());
  }
  const onResize = () => place();
  function detach() { running?.cancel(); ro?.disconnect(); ro = null; removeEventListener('resize', onResize); win?.remove(); desk = null; }

  // ---- chat: /preset <description> (shared with the Lab's trigger presets: this one runs outside the Lab unless the
  // words are one of the Lab's preset names), /vst-preset always
  async function openDesk() {
    if (typeof CreativePlayground === 'undefined') await Lazy.load('creative');
    activate('tool:creative');
    // the Playground mounts a moment after its tool shows (its openFeature does nothing until then)
    const tick = () => new Promise(r => setTimeout(r, 60));
    for (let i = 0; i < 80 && !document.querySelector('.cp-stage'); i++) await tick();
    if (!win?.isConnected) CreativePlayground.openFeature('vst');
    for (let i = 0; i < 80 && !win?.isConnected; i++) await tick();
  }
  async function command(args, ctx) {
    const a = String(args || '').trim(), [w, ...rest] = a.split(/\s+/), more = rest.join(' ');
    const sub = w?.toLowerCase();
    if (!a || sub === 'show' || sub === 'open') { await openDesk(); mini(false); return current() ? `✦ Preset writer open over ${current().name}.` : 'Open Serum 2 or Vital in the Sound desk; the preset writer floats over it.'; }
    if (sub === 'hide') { mini(true); return null; }
    if (!win?.isConnected) await openDesk();
    if (sub === 'undo') return `↶ Undid “${(await step(-1)).request}”.`;
    if (sub === 'redo') return `↷ Redid “${(await step(1)).request}”.`;
    if (sub === 'save') return `💾 Saved “${await save(more)}” in your preset bank.`;
    if (sub === 'engine' || sub === 'with') { if (/astra|codex/i.test(more)) store.set(ENG, 'codex'); else if (/claude/i.test(more)) store.set(ENG, 'claude'); paint(); return `Presets are written by ${engineLabel(engine())}.`; }
    let text = a, fresh = true, eng;
    if (sub === 'tweak' || sub === 'then' || sub === '+') { text = more; fresh = false; }
    const lead = text.match(/^(claude|astra)\s*[:,]?\s+/i); if (lead) { eng = /astra/i.test(lead[1]) ? 'codex' : 'claude'; text = text.slice(lead[0].length); }
    mini(false);
    const r = await ask(text, { fresh, engine: eng });
    return r.changed.length ? `✦ ${current()?.name}: ${r.changed.length} control${r.changed.length === 1 ? '' : 's'} set${r.name ? ` (“${r.name}”)` : ''} · ${r.tokens} tokens. /preset tweak <words> · /preset undo · /preset save [name]` : 'The AI changed nothing this time; try other words.';
  }
  // /preset itself is registered at start by astra.js (end) (it shares the name with the Lab's trigger presets)
  const complete = a => ['tweak', 'undo', 'redo', 'save', 'show', 'hide', 'engine'].filter(s => s.startsWith(String(a || '').trim().toLowerCase())).map(value => ({ value }));
  if (typeof Commands !== 'undefined') Commands.register({ name: 'vst-preset', aliases: ['sound-preset'], args: '<description> | tweak | undo | redo | save [name]', desc: 'Write a Serum 2 / Vital preset from words', area: 'Create', run: command, complete, examples: ['/vst-preset astra: glassy pluck, short echo'] });
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Sound desk: write a preset with AI', () => command('show'));
  return { attach, detach, ask, step, save, command, host, get open() { return !!win?.isConnected; },
    _test: { useHost: h => { testHost = h; paint(); }, history: () => hist, session: () => session, place } };
})();
