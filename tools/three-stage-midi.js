// MIDI controllers and keys for the Lab's live stage (round 22, labstage; tools/three-stage.js).
//   learn      "🎛 Learn": touch a slider (or point at one), turn a knob: bound. Stays on for the next one until Esc
//              or Learn again. A pad, a button or a key learns an action (GO, shuffle, freeze, tap, a scene…).
//   mappings   a knob on a slider is kept with the scene (each scene its own knobs); "for every scene" keeps it by the
//              slider's name instead; pads, keys and the crossfader are kept for all scenes (store three.stage.midi)
//   takeover   soft takeover: a knob that doesn't match the slider's value does nothing until it passes through it,
//              so values never jump when you switch scenes or moved the slider by hand
//   clock      MIDI clock in (24 ticks a beat, start / stop) gives the stage its tempo (ThreeStage.clockIn)
// Off the hot path: messages only note the latest value per control; one requestAnimationFrame applies them.
// This runs next to the Lab's older 🎛 MIDI button (tools/three.js), which keeps its own mappings.
const ThreeStageMidi = (() => {
  const hk = () => ThreeLab.stageHooks;
  const KEY = 'three.stage.midi';
  const data = () => ({ global: {}, scenes: {}, keys: {}, soft: true, ...store.get(KEY, {}) });
  const save = (d) => store.set(KEY, d);
  let access = null; let opening = null; let lastSeen = '';
  const hooked = new WeakSet();
  let learn = null; // { kind: 'slider', global } | { kind: 'action', action } | { kind: 'xfader' }
  let pointer = null; // the pointer while learning (the slider under it wins)
  const pending = new Map(); // control id → { b, u }
  let raf = 0;
  const pick = new Map(); // soft takeover: binding key → { picked, last }
  const release = new Map();
  const stats = { messages: 0, applied: 0, skipped: 0, clock: 0 };

  // ---------- access ----------
  async function open() {
    if (access) return true;
    if (opening) return opening;
    if (!navigator.requestMIDIAccess) { toast('MIDI is not available here', { type: 'error' }); return false; }
    opening = navigator.requestMIDIAccess({ sysex: false }).then((a) => {
      access = a;
      const hook = () => { for (const inp of access.inputs.values()) if (!hooked.has(inp)) { hooked.add(inp); inp.addEventListener('midimessage', onMessage); } };
      access.addEventListener?.('statechange', (e) => { hook(); if (e.port?.type === 'input') toast(`MIDI ${e.port.state === 'connected' ? 'connected' : 'gone'}: ${e.port.name}`, { timeout: 1600 }); });
      hook();
      store.set('three.stage.midiOn', true);
      return true;
    }).catch((err) => { toast(`Couldn't open MIDI: ${err.message}`, { type: 'error' }); return false; }).finally(() => { opening = null; });
    return opening;
  }
  const devices = () => (access ? [...access.inputs.values()].filter((i) => i.state !== 'disconnected').map((i) => i.name || 'MIDI input') : []);

  // ---------- messages (no DOM, no Lab calls: the latest value per control, applied once a frame) ----------
  function onMessage(e) {
    const d = e.data; if (!d || !d.length) return;
    const st = d[0];
    if (st >= 0xF8) { // realtime: clock, start, continue, stop
      if (st === 0xF8) { stats.clock += 1; ThreeStage.clockIn.tick(e.timeStamp || performance.now()); } else if (st === 0xFA) ThreeStage.clockIn.start(); else if (st === 0xFC) ThreeStage.clockIn.stop();
      return;
    }
    stats.messages += 1;
    const type = st & 0xf0; const ch = (st & 0x0f) + 1; const d1 = d[1]; const d2 = d[2] ?? 0;
    let id = null; let u = 0; let press = false;
    if (type === 0xB0) { id = `${ch}:cc${d1}`; u = d2 / 127; press = d2 >= 64; } else if (type === 0x90 && d2 > 0) { id = `${ch}:n${d1}`; u = 1; press = true; } else if (type === 0xE0) { id = `${ch}:pb`; u = ((d2 << 7) | d1) / 16383; } else return;
    lastSeen = id;
    if (learn) { bind(id, type); return; }
    const b = lookup(id);
    if (!b) return;
    if (b.t === 'act') { // a pad / button: on the press only (a button sending CC 127 / 0 too)
      const was = pending.get(`${id}|edge`)?.u ?? 0; pending.set(`${id}|edge`, { u: press ? 1 : 0 });
      if (press && !(type === 0xB0 && was)) ThreeStage.act(b.a).catch?.((err) => toast(err.message, { type: 'error' }));
      return;
    }
    pending.set(id, { b, u });
    if (!raf) raf = requestAnimationFrame(flush);
  }
  function lookup(id) {
    const d = data(); const sid = hk()?.sketchId();
    return (sid && d.scenes[sid]?.[id]) || d.global[id] || null;
  }
  function flush() {
    raf = 0;
    const list = [...pending.entries()].filter(([k]) => !k.endsWith('|edge'));
    for (const [k] of list) pending.delete(k);
    for (const [id, { b, u }] of list) apply(id, b, u);
  }
  // a knob's position on its slider, with soft takeover
  function apply(id, b, u) {
    if (b.t === 'xfader') { ThreeStage.xfade(u); return; }
    const h = hk(); if (!h) return;
    let layer = b.layer; let key = b.key;
    if (b.t === 'name') { const c0 = h.ctl(); const hit = c0?.resolve(b.label); if (!hit) return; layer = h.layer().id; key = hit.key; }
    const c = h.ctlOf(layer); if (!c) return;
    const info = c.controls().find((x) => x.key === key); if (!info) return;
    const cur = info.options ? Math.max(0, info.options.indexOf(info.value)) / Math.max(1, info.options.length - 1) : typeof info.value === 'boolean' ? (info.value ? 1 : 0) : info.min != null ? (info.value - info.min) / ((info.max - info.min) || 1) : null;
    if (cur == null) return;
    const pk = `${h.sketchId()}|${layer}|${key}|${id}`;
    const p = pick.get(pk) || { picked: false, last: null };
    // moved by something else since (your hand, a shuffle, a look): pick it up again
    if (p.picked && p.sent != null && Math.abs(cur - p.sent) > 0.03) p.picked = false;
    if (!p.picked && data().soft && !info.options && typeof info.value !== 'boolean') {
      const crossed = p.last != null && (p.last - cur) * (u - cur) <= 0;
      if (Math.abs(u - cur) <= 0.035 || crossed) p.picked = true;
      else { p.last = u; pick.set(pk, p); stats.skipped += 1; return; }
    }
    p.picked = true; p.last = u; p.sent = u; pick.set(pk, p);
    c.setNormalized(key, u);
    stats.applied += 1;
    clearTimeout(release.get(pk));
    release.set(pk, setTimeout(() => { release.delete(pk); c.setNormalized(key, u, { release: true }); }, 300));
  }

  // ---------- learning ----------
  const onPointer = (e) => { pointer = { x: e.clientX, y: e.clientY }; };
  function startLearn(o = { kind: 'slider' }) {
    learn = { ...o };
    if (o.kind === 'slider') { addEventListener('pointermove', onPointer, { passive: true }); open(); }
    else if (o.kind !== 'key') open();
    paintPill();
    return learn;
  }
  function stopLearn() { learn = null; pointer = null; removeEventListener('pointermove', onPointer); paintPill(); }
  // what a knob binds to: the slider under the pointer, else the last one you touched (≤ 60 s)
  function targetSlider() {
    const h = hk(); if (!h) return null;
    const row = pointer && document.elementFromPoint(pointer.x, pointer.y)?.closest?.('[data-tw-key]');
    if (row && h.layer()) { const k = row.dataset.twKey; const info = h.ctl()?.controls().find((x) => x.key === k); if (info) return { layer: h.layer().id, key: k, label: info.label }; }
    const t = ThreeStage.lastTouched;
    return t && Date.now() - t.at < 60000 ? t : null;
  }
  function bind(id, type) {
    const d = data(); const h = hk();
    const isPad = type === 0x90;
    if (learn.kind === 'action' || (isPad && learn.kind === 'slider')) {
      if (learn.kind !== 'action') { toast('A pad: pick what it does first (Learn a pad ›)', { timeout: 2200 }); return; }
      d.global[id] = { t: 'act', a: learn.action };
      save(d); toast(`${label(id)} → ${ThreeStage.ACTION_NAME[learn.action]}`, { timeout: 1800 }); stopLearn(); return;
    }
    if (learn.kind === 'xfader') { d.global[id] = { t: 'xfader' }; save(d); toast(`${label(id)} → crossfader`, { timeout: 1800 }); stopLearn(); return; }
    const t = targetSlider();
    if (!t) { toast('Touch a slider first (or point at it), then turn the knob', { timeout: 2200 }); return; }
    // (a knob moves one slider per scene: binding it again here replaces what it had in this scene)
    if (learn.global) d.global[id] = { t: 'name', label: t.label };
    else { const sid = h.sketchId(); (d.scenes[sid] ||= {})[id] = { t: 'slider', layer: t.layer, key: t.key, label: t.label }; if (d.global[id]?.t !== 'act') delete d.global[id]; }
    save(d);
    toast(`${label(id)} → ${t.label}${learn.global ? ' (every scene)' : ''} · next: touch another slider, or Esc`, { timeout: 2000 });
    ThreeStage.lastTouched && (ThreeStage.lastTouched.at = 0); // the next knob needs a new touch
    pointer = null;
  }
  const label = (id) => { const [ch, c] = id.split(':'); return c.startsWith('cc') ? `CC ${c.slice(2)}${ch !== '1' ? ` (ch ${ch})` : ''}` : c.startsWith('n') ? `Pad ${c.slice(1)}${ch !== '1' ? ` (ch ${ch})` : ''}` : `Pitch bend (ch ${ch})`; };
  function touched() { /* (the stage keeps the last touched slider; learning reads it on the next knob) */ }

  // ---------- keys: plain keyboard mappings (global) ----------
  const editable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  function keyName(e) { return `${e.shiftKey ? 'Shift+' : ''}${e.code}`; }
  // the stage's keydown (capture): learning a key, or a learned key while the Lab is on screen
  function key(e) {
    if (editable(e.target) || e.ctrlKey || e.metaKey || e.altKey || /^(Shift|Control|Alt|Meta)/.test(e.key)) return false;
    if (learn && e.key === 'Escape') { stopLearn(); toast('MIDI learn off', { timeout: 1000 }); return true; }
    if (learn?.kind === 'action' || learn?.kind === 'key') {
      if (!learn.action) return false;
      const d = data(); d.keys[keyName(e)] = learn.action; save(d);
      toast(`Key ${keyName(e).replace('Key', '').replace('Digit', '')} → ${ThreeStage.ACTION_NAME[learn.action]}`, { timeout: 1800 });
      stopLearn(); return true;
    }
    const a = data().keys[keyName(e)];
    if (!a) return false;
    const h = hk(); if (!h?.host.checkVisibility?.()) return false;
    ThreeStage.act(a).catch?.((err) => toast(err.message, { type: 'error' }));
    return true;
  }

  // ---------- the learn pill (shown only while learning) ----------
  let pill = null;
  function paintPill() {
    const h = hk(); if (!h) return;
    if (!pill) { pill = el('div', { class: 'stage-learn', hidden: true }); h.host.append(pill); pill.addEventListener('click', () => stopLearn()); }
    pill.hidden = !learn;
    if (learn) pill.textContent = learn.kind === 'slider' ? `🎛 Learn: touch a slider, turn a knob${learn.global ? ' (every scene)' : ''} · Esc to finish` : learn.kind === 'xfader' ? '🎛 Move the fader for the crossfader · Esc' : `🎛 Hit a pad or press a key for “${ThreeStage.ACTION_NAME[learn.action]}” · Esc`;
  }

  // ---------- menu ----------
  function mappings() {
    const d = data(); const sid = hk()?.sketchId();
    return [
      ...Object.entries(d.scenes[sid] || {}).map(([id, b]) => ({ id, where: 'scene', text: b.label })),
      ...Object.entries(d.global).map(([id, b]) => ({ id, where: 'global', text: b.t === 'act' ? ThreeStage.ACTION_NAME[b.a] : b.t === 'xfader' ? 'Crossfader' : `${b.label} (every scene)` })),
      ...Object.entries(d.keys).map(([k, a]) => ({ id: k, where: 'key', text: ThreeStage.ACTION_NAME[a] })),
    ];
  }
  function forget(id, where) {
    const d = data(); const sid = hk()?.sketchId();
    if (where === 'scene') delete d.scenes[sid]?.[id]; else if (where === 'key') delete d.keys[id]; else delete d.global[id];
    save(d);
  }
  const summary = () => (devices().length ? `${devices().length} device${devices().length > 1 ? 's' : ''}` : access ? 'no device' : 'off');
  function menuItems() {
    const devs = devices(); const maps = mappings();
    return [
      access ? (devs.length ? `Connected: ${devs.join(', ')}` : 'No MIDI device: plug one in') : 'MIDI starts on the first Learn',
      { label: learn ? '■ Stop learning' : '🎛 Learn knobs', hint: 'Touch a slider, turn a knob · again and again', checked: Boolean(learn), action: () => (learn ? stopLearn() : startLearn({ kind: 'slider' })) },
      { label: '🎛 Learn knobs for every scene', hint: 'By the slider\'s name', action: () => startLearn({ kind: 'slider', global: true }) },
      { label: 'Learn a pad or key', items: () => ThreeStage.ACTIONS.map(([a, l]) => ({ label: l, action: () => startLearn({ kind: 'action', action: a }) })) },
      { label: 'Learn the crossfader', hint: 'A fader mixes the cued scene in', action: () => startLearn({ kind: 'xfader' }) },
      { label: 'Soft takeover', hint: 'Knobs pick up the value before they move it', checked: data().soft, action: () => { const d = data(); d.soft = !d.soft; save(d); } },
      maps.length ? { label: `Mappings (${maps.length})`, hint: 'click one to forget it', items: () => maps.map((m) => ({ label: m.text, hint: m.where === 'key' ? `key ${m.id.replace('Key', '').replace('Digit', '')}` : `${label(m.id)}${m.where === 'scene' ? ' · this scene' : ''}`, action: () => forget(m.id, m.where) })) } : null,
      lastSeen ? `Last control: ${label(lastSeen)}` : null,
    ];
  }

  // switching scenes: knobs pick up again (soft takeover starts over)
  addEventListener('hearth:sketch', () => pick.clear());
  if (store.get('three.stage.midiOn', false)) setTimeout(() => open(), 1500);
  Keys.add([{ area: 'Lab live (show mode)', keys: 'Esc (learning)', what: 'Stop MIDI learn' }]);

  const api = {
    open, devices, startLearn, stopLearn, mappings, forget, menuItems, summary, key, touched, label,
    get learning() { return learn; }, get stats() { return { ...stats }; }, get data() { return data(); },
    // tests and chat: what a controller would send
    message: (bytes) => onMessage({ data: Uint8Array.from(bytes), timeStamp: performance.now() }),
    flush: () => { cancelAnimationFrame(raf); flush(); },
  };
  return api;
})();
window.ThreeStageMidi = ThreeStageMidi;
