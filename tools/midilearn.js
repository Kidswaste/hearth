// (round 69, midilearn69) 🎹 Map my controller, in the Sound desk (docs/upgrades/midilearn69.md).
// The "🎹 Map my controller" button (next to MIDI in, tools/workbench-vst.js) opens this panel in the desk, above the
// instrument (not over it: the plugin's own window stays visible and usable, which "the last one you touched" needs).
//   Learn → turn a knob / move a fader on the controller → pick the control: from a searchable list of the open
//   instrument's controls, or "The last one you touched in Vital's window" (the host notices which control moved).
//   Rows: "CC 21 → Filter cutoff", From / To (% of the control's range; From above To runs it backwards), Invert, Remove.
//   Knob pickup: Take over (the control waits until the knob reaches it: no jump) or Jump (it follows at once).
// Saved per instrument (Serum 2 / Vital) in Hearth's data folder by the host (creative-vst-midimap.py), which also does
// the moving: from its audio thread, smoothed, the plugin's window repainted. Pitch bend, the mod wheel and sustain always
// go straight to the instrument. Loaded on the button's first click (lazy group 'midilearn'); polls the host only while
// the panel is on screen (fast while learning), and writes the DOM only when something changed.
const MidiLearn = (() => {
  const K = MidiLearnCore;
  let h = null, panel = null, timer = null, ticket = 0, plugin = null, status = null, query = '', learning = false, busy = false;
  const A = () => (typeof WorkbenchVST !== 'undefined' ? WorkbenchVST.api : null);
  const cur = () => A()?.current?.() || null;
  const e = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const errText = err => (typeof calmError === 'function' ? calmError(err) : err?.message || String(err));
  const set = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const q = sel => panel?.querySelector(sel);
  const say = text => { set(q('.ml-said'), text || ''); return text; };
  const short = name => name || 'the instrument';
  function btn(label, fn, cls = '', title = '') {
    const b = e('button', label, cls); b.type = 'button'; if (title) b.title = title;
    b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { say(errText(err)); } finally { b.disabled = false; } };
    return b;
  }
  async function call(action, extra = {}) {
    const c = cur(); if (!c) throw Error('Open Serum 2 or Vital in the Sound desk first.');
    const r = await hub.vst.request({ action, plugin: c.path, name: c.name, ...extra });
    if (!r.ok) throw Error(r.error || 'The instrument host did not answer.');
    return r;
  }

  // ---------- the panel ----------
  async function open(helpers) {
    if (helpers) h = helpers;
    const desk = document.querySelector('.wb-sound-desk'); if (!desk) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (panel?.isConnected) { close(); return 'Map my controller closed.'; } // the button toggles
    const c = cur(); if (!c) throw Error('Open Serum 2 or Vital first (click its card above).');
    panel = e('section', null, 'ml-panel'); panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Map my controller');
    const detail = desk.querySelector('.wb-sound-detail'); detail ? detail.before(panel) : desk.append(panel);
    plugin = null; status = null; query = ''; learning = false; draw();
    await refresh();
    poll();
    panel.scrollIntoView?.({ block: 'nearest' });
    return status?.maps?.length ? `${status.maps.length} knob${status.maps.length === 1 ? '' : 's'} mapped for ${c.name}.` : `Click Learn, then turn a knob on your controller.`;
  }
  function close() {
    ticket++; clearTimeout(timer); timer = null;
    if (learning) call('midimap-learn', { learn: false }).catch(() => {});
    learning = false; panel?.remove(); panel = null; status = null;
  }
  function draw() {
    const c = cur(); panel.replaceChildren();
    const head = e('div', null, 'ml-head');
    head.append(e('strong', `🎹 Map my controller · ${short(c?.name)}`), btn('Close', () => close(), 'ml-close'));
    const pick = e('div', null, 'ml-pickup'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', 'Knob pickup');
    pick.append(e('span', 'Knob pickup:', 'ml-dim'),
      btn('Take over', () => setPickup('takeover'), 'ml-mode', 'The control waits until your knob reaches where it is now, then follows it: no jump'),
      btn('Jump', () => setPickup('jump'), 'ml-mode', 'The control follows your knob at once (it may jump)'));
    const learn = btn('Learn', () => toggleLearn(), 'ml-learn', 'Then turn a knob or move a fader on your controller');
    const top = e('div', null, 'ml-line'); top.append(learn, pick);
    const step = e('div', null, 'ml-step'); step.hidden = true;
    const rows = e('div', null, 'ml-rows'); rows.setAttribute('role', 'list'); rows.setAttribute('aria-label', 'Your mappings');
    panel.append(head, top, step, rows, e('p', '', 'ml-said'), e('p', '', 'ml-dim ml-foot'));
  }
  async function setPickup(mode) { if (!status) return; await save(status.maps, mode); say(mode === 'jump' ? 'Jump: the controls follow your knobs at once.' : 'Take over: a control waits for your knob to reach it, then follows.'); }
  async function toggleLearn() {
    if (learning) { learning = false; await call('midimap-learn', { learn: false }); say('Learn cancelled.'); return refresh(); }
    const c = cur(); if (!c?.live) await A().start(); // the controller is listened to while live audio is on
    learning = true; query = '';
    status = await call('midimap-learn', { learn: true }); paint(); poll();
  }
  async function save(maps, pickup = status?.pickup) {
    status = await call('midimap-set', { maps: (maps || []).map(({ cc, ch, key, label, min, max, invert }) => ({ cc, ch, key, label, min, max, invert })), pickup, ...(learning ? {} : { learn: false }) });
    paint(); return status;
  }
  async function choose(p) {
    const l = status?.learn; if (!l || l.cc == null) throw Error('Turn a knob or move a fader first.');
    const maps = K.add(status.maps, { cc: l.cc, ch: l.ch, key: p.key, label: K.label(p) });
    learning = false; await call('midimap-learn', { learn: false }).catch(() => {});
    await save(maps); say(`${K.ccName(l.cc, null)} now moves ${K.label(p)}.`);
  }
  async function refresh() {
    const c = cur(); if (!c || !panel) return;
    const r = await call('midimap-status');
    if (!panel) return;
    if (plugin !== c.path) { plugin = c.path; learning = !!r.learn; draw(); }
    status = r; if (!r.learn && learning) learning = false;
    paint();
  }
  function poll() {
    clearTimeout(timer); const mine = ticket;
    timer = setTimeout(async () => {
      if (mine !== ticket) return;
      if (!panel?.isConnected) { close(); return; } // the desk went away (another tool, a redraw of the whole desk)
      if (!document.hidden && !busy) { busy = true; try { await refresh(); } catch (err) { say(errText(err)); } finally { busy = false; } }
      if (mine === ticket) poll();
    }, learning ? 200 : 700);
  }

  // ---------- painting (only what changed) ----------
  function paint() {
    if (!panel || !status) return;
    const c = cur(), name = short(c?.name);
    for (const b of panel.querySelectorAll('.ml-mode')) { const on = (b.textContent === 'Jump') === (status.pickup === 'jump'); if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on)); }
    set(q('.ml-learn'), learning ? 'Cancel learn' : 'Learn');
    q('.ml-learn')?.classList.toggle('ml-on', learning);
    paintStep(name); paintRows(name);
    const foot = [`Pitch bend, the mod wheel and sustain always go straight to ${name}.`];
    foot.push(status.file ? `Saved for ${name} on this computer.` : 'Kept for this session.');
    if (!status.listening) foot.push(c?.stats?.midi?.backend === null ? 'Hearth reads controllers on Windows (elsewhere with python-rtmidi).' : 'Your controller is listened to while live audio is on (MIDI in: All controllers).');
    set(q('.ml-foot'), [status.note, ...foot].filter(Boolean).join(' '));
  }
  function paintStep(name) {
    const step = q('.ml-step'); if (!step) return;
    const l = learning ? status.learn : null;
    step.hidden = !l;
    if (!l) { if (step.childElementCount) step.replaceChildren(); return; }
    const sig = `${l.cc}|${l.ch}|${l.ignored}|${status.touched?.key}|${status.touched?.at}`;
    if (step.dataset.sig === sig && step.childElementCount) return;
    const hadFocus = step.contains(document.activeElement) && document.activeElement.matches('input');
    step.dataset.sig = sig; step.replaceChildren(e('p', K.learnText(l, name), 'ml-ask'));
    if (status.touched) step.append(btn(`↺ The last one you touched in ${name}'s window: ${status.touched.label.replace(/ \(0–1\)$/, '')}`, () => choose({ key: status.touched.key, label: status.touched.label }), 'ml-touched', 'Move a control in the plugin\'s window, then click this'));
    else step.append(e('p', `Or move a control in ${name}'s window: it shows up here.`, 'ml-dim'));
    if (l.cc == null) return;
    const find = e('input'); find.type = 'search'; find.placeholder = 'Find a control (e.g. cutoff, reverb mix)'; find.setAttribute('aria-label', 'Find a control'); find.value = query; find.className = 'ml-find';
    const list = e('div', null, 'ml-list'); list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Controls');
    const fill = () => {
      const params = WorkbenchVST.door?.current?.()?.parameters || [];
      const hits = K.search(params, query);
      list.replaceChildren(...hits.map(p => { const b = btn(K.label(p), () => choose(p), 'ml-item'); b.setAttribute('role', 'listitem'); return b; }));
      if (!hits.length) list.append(e('p', params.length ? 'No control with that name.' : `${name} is still reading its controls…`, 'ml-dim'));
    };
    find.oninput = () => { query = find.value; fill(); };
    step.append(find, list); fill();
    if (hadFocus || !query) find.focus({ preventScroll: true });
  }
  function paintRows(name) {
    const rows = q('.ml-rows'); if (!rows) return;
    const maps = status.maps || [];
    const sig = maps.map(m => `${m.cc}|${m.ch}|${m.key}|${m.min}|${m.max}|${m.invert}`).join(';');
    if (rows.dataset.sig !== sig) {
      rows.dataset.sig = sig; rows.replaceChildren();
      if (!maps.length) rows.append(e('p', `No knobs mapped yet. Click Learn, turn a knob on your controller, then pick what it moves in ${name}.`, 'ml-dim ml-empty'));
      maps.forEach((m, i) => {
        const row = e('div', null, 'ml-row'); row.setAttribute('role', 'listitem');
        const pctIn = (labelText, v, which) => {
          const wrap = e('label', null, 'ml-range'); const inp = e('input'); inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '1'; inp.value = String(Math.round(v * 100)); inp.setAttribute('aria-label', `${labelText} (%) for ${K.rowText(m)}`);
          inp.onchange = () => save(K.setRange(status.maps, i, { [which]: inp.value })).catch(err => say(errText(err)));
          wrap.append(e('span', labelText, 'ml-dim'), inp, e('span', '%', 'ml-dim')); return wrap;
        };
        const inv = e('label', null, 'ml-inv'); const box = e('input'); box.type = 'checkbox'; box.checked = !!m.invert; box.setAttribute('aria-label', `Invert ${K.rowText(m)}`);
        box.onchange = () => save(K.setInvert(status.maps, i, box.checked)).catch(err => say(errText(err)));
        inv.append(box, e('span', 'Invert'));
        const main = e('div', null, 'ml-row-main'); main.append(e('span', K.rowText(m), 'ml-name'), pctIn('From', m.min, 'min'), pctIn('To', m.max, 'max'), inv, btn('Remove', () => save(K.remove(status.maps, i)).then(() => say(`${K.rowText(m)} removed.`)), 'ml-remove'));
        row.append(main, e('div', '', 'ml-dim ml-now')); rows.append(row);
      });
    }
    [...rows.querySelectorAll('.ml-now')].forEach((n, i) => set(n, K.rowState(maps[i], status.pickup)));
  }
  return { open, close, isOpen: () => !!panel?.isConnected, status: () => status };
})();
