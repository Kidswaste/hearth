// MIDI out for the Lab (round 25, interop): Hearth plays the clock and the cues for lights, synths and drum machines.
//   clock       24 ticks a beat on the stage's tempo (the song's grid, MIDI clock in, taps, Link), start / stop,
//               scheduled ahead with Web MIDI timestamps (100 ms ahead, a 25 ms timer), pulled gently onto the
//               stage's beat so a light desk or a drum machine stays in phase
//   notes       on the beat, bar 1, kick / snare / hat hits, a scene change: a note (channel, velocity, length) per
//               cue, timed on the beat itself (presets: lights, drum machine)
//   CC          slider moves go out as control changes (learned per slider: "/midi-out cc glow" takes the next free
//               CC from 20 and sends a wiggle so the other side can learn it too); program change on a scene change
//   device      one output (or every output), picked by name and remembered; panic sends all notes off
// Uses the Web MIDI the stage's knobs already use (tools/three-stage-midi.js); nothing runs until something is on.
const InteropMidi = (() => {
  const KEY = 'interop.midi';
  const data = () => ({ out: '', clock: false, rules: [], cc: {}, pc: false, ch: 1, ...store.get(KEY, {}) });
  const save = (patch) => { store.set(KEY, { ...data(), ...patch }); wire(); };
  const EVENTS = [['beat', 'Every beat'], ['bar', 'Bar 1 (every bar)'], ['kick', 'Kick hits'], ['snare', 'Snare hits'], ['hat', 'Hat hits'], ['scene', 'A scene change']];
  const PRESETS = {
    lights: { name: 'Lights (one note per cue, channel 1)', rules: [['bar', 36], ['beat', 37], ['kick', 38], ['snare', 39], ['hat', 40], ['scene', 41]].map(([on, note]) => ({ on, note, ch: 1, vel: 127, len: 80 })) },
    drums: { name: 'Drum machine (GM drums on channel 10)', rules: [['kick', 36], ['snare', 38], ['hat', 42], ['bar', 49]].map(([on, note]) => ({ on, note, ch: 10, vel: 110, len: 60 })) },
    beat: { name: 'A click on the beat (channel 1, C3 / C4 on bar 1)', rules: [{ on: 'beat', note: 48, ch: 1, vel: 90, len: 50 }, { on: 'bar', note: 60, ch: 1, vel: 120, len: 50 }] },
  };
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (n) => `${NOTE[n % 12]}${Math.floor(n / 12) - 2}`; // (C1 = 36, the drum-pad convention)
  function parseNote(s) {
    if (/^\d+$/.test(String(s))) return Math.max(0, Math.min(127, Number(s)));
    const m = /^([a-g])(#|b)?(-?\d)$/i.exec(String(s || '')); if (!m) return null;
    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return Math.max(0, Math.min(127, (Number(m[3]) + 2) * 12 + base));
  }
  const stats = { sent: 0, clock: 0, notes: 0, cc: 0, pc: 0 };

  // ---------- access and the output ----------
  let access = null; let opening = null;
  async function open() {
    if (access) return true;
    if (opening) return opening;
    if (!navigator.requestMIDIAccess) throw new Error('MIDI is not available here');
    opening = navigator.requestMIDIAccess({ sysex: false }).then((a) => {
      access = a;
      access.addEventListener?.('statechange', (e) => { if (e.port?.type === 'output' && e.port.state === 'disconnected' && e.port.name === data().out) toast(`MIDI out gone: ${e.port.name}`, { type: 'error', timeout: 2500 }); });
      return true;
    }).finally(() => { opening = null; });
    return opening;
  }
  const outputs = () => (access ? [...access.outputs.values()].filter((o) => o.state !== 'disconnected') : []);
  const names = () => outputs().map((o) => o.name || 'MIDI output');
  function targets() { const d = data(); const all = outputs(); if (d.out === '*') return all; const o = all.find((x) => x.name === d.out); return o ? [o] : []; }
  function send(bytes, at) { const ts = at && at > performance.now() ? at : undefined; for (const o of targets()) { try { o.send(bytes, ts); stats.sent += 1; } catch (err) { console.warn('MIDI out', err.message); } } }
  async function use(name) {
    await open();
    const list = names();
    if (name === '*' || /^(all|every)/i.test(name)) { save({ out: '*' }); return 'every output'; }
    const hit = list.find((n) => n === name) || list.find((n) => n.toLowerCase().includes(String(name || '').toLowerCase()));
    if (!hit) throw new Error(list.length ? `MIDI outputs: ${list.join(', ')}` : 'No MIDI output found (on a Mac: Audio MIDI Setup → IAC Driver → Device is online, for apps on this computer)');
    save({ out: hit });
    return hit;
  }

  // ---------- clock out ----------
  const CK = { on: false, timer: 0, next: 0, n: 0, iv: 20.833 };
  function clockStart() {
    if (CK.on || !targets().length) return false;
    const S = window.ThreeStage; let ub = 0;
    try { ub = S ? S.untilNext('beat') : 0; } catch { ub = 0; }
    CK.on = true; CK.n = 0; CK.next = performance.now() + Math.max(5, (ub || 0) * 1000);
    send([0xFA], CK.next - 1); // Start: the first tick is the downbeat
    pump();
    CK.timer = setInterval(pump, 25);
    return true;
  }
  function clockStop() { if (!CK.on) return; CK.on = false; clearInterval(CK.timer); CK.timer = 0; send([0xFC]); }
  function pump() {
    if (!CK.on) return;
    const now = performance.now();
    const bpm = Math.max(20, Math.min(400, Interop.clock.bpm || 120));
    CK.iv = 60000 / (bpm * 24);
    if (CK.next < now - 50) CK.next = now; // (a stalled timer: no burst of late ticks)
    // phase: the stage's next beat vs the tick that should land on it; a tenth of the gap per look, at most 2 ms
    let ub = null; try { ub = window.ThreeStage?.untilNext('beat'); } catch { ub = null; }
    if (ub != null && Number.isFinite(ub)) {
      const beatMs = CK.iv * 24; const k = (24 - (CK.n % 24)) % 24;
      let err = (now + ub * 1000) - (CK.next + k * CK.iv);
      err = ((err % beatMs) + beatMs * 1.5) % beatMs - beatMs / 2;
      CK.next += Math.max(-2, Math.min(2, err * 0.1));
    }
    while (CK.next < now + 100) { send([0xF8], CK.next); stats.clock += 1; CK.next += CK.iv; CK.n += 1; }
  }

  // ---------- notes on cues, CC from sliders, program change on scenes ----------
  function note(r, at) {
    const ch = Math.max(1, Math.min(16, r.ch || 1)) - 1;
    send([0x90 | ch, r.note & 127, Math.max(1, Math.min(127, r.vel ?? 127))], at);
    send([0x80 | ch, r.note & 127, 0], (at && at > performance.now() ? at : performance.now()) + (r.len || 80));
    stats.notes += 1;
  }
  const onScene = () => {
    const d = data();
    for (const r of d.rules) if (r.on === 'scene') note(r);
    if (d.pc) { const n = (window.ThreeStage?.setlist.list() || []).find((x) => x.current)?.n; if (n) { send([0xC0 | (Math.max(1, d.ch) - 1), (n - 1) & 127]); stats.pc += 1; } }
  };
  let offs = [];
  function wire() {
    for (const f of offs) f();
    offs = [];
    const d = data();
    if (!access || !targets().length) { clockStop(); return; }
    if (d.clock) clockStart(); else clockStop();
    const beatRules = d.rules.filter((r) => r.on === 'beat' || r.on === 'bar');
    if (beatRules.length) offs.push(Interop.clock.on((e) => { for (const r of beatRules) if (r.on === 'beat' || e.down) note(r, e.at); }));
    const hitRules = d.rules.filter((r) => ['kick', 'snare', 'hat'].includes(r.on));
    if (hitRules.length) offs.push(Interop.features.on((_v, hits) => { for (const [k] of hits) for (const r of hitRules) if (r.on === k) note(r); }));
    if (Object.keys(d.cc).length) offs.push(Interop.sliders.on((changed) => { for (const x of changed) { const m = d.cc[x.label]; if (m) { send([0xB0 | (Math.max(1, m.ch || d.ch) - 1), m.cc & 127, Math.round(x.u * 127)]); stats.cc += 1; } } }));
    if (d.pc || d.rules.some((r) => r.on === 'scene')) { addEventListener('hearth:sketch', onScene); offs.push(() => removeEventListener('hearth:sketch', onScene)); }
  }
  Interop.clock.onTempo(() => { /* the clock follows the next pump on its own */ });

  // ---------- the owner's moves ----------
  async function setClock(on) { await open(); if (on && !targets().length) throw new Error('Pick a MIDI output first (/midi-out device <name>)'); save({ clock: Boolean(on) }); return Boolean(on); }
  function addRule(on, n, { ch = 1, vel = 127, len = 80 } = {}) {
    if (!EVENTS.some(([k]) => k === on)) throw new Error(`On: ${EVENTS.map(([k]) => k).join(', ')}`);
    const nn = parseNote(n); if (nn == null) throw new Error('A note: 36, C1, F#2…');
    const rules = data().rules.filter((r) => !(r.on === on && r.note === nn)); rules.push({ on, note: nn, ch: Number(ch) || 1, vel: Number(vel) || 127, len: Number(len) || 80 });
    save({ rules: rules.slice(-32) }); return rules.at(-1);
  }
  function clearRules(on) { save({ rules: on ? data().rules.filter((r) => r.on !== on) : [] }); }
  function usePreset(id) { const p = PRESETS[id]; if (!p) throw new Error(`Presets: ${Object.keys(PRESETS).join(', ')}`); save({ rules: p.rules.map((r) => ({ ...r })) }); return p; }
  // a slider → a CC (the next free one from 20 when none is given); a short wiggle so the other side can learn it
  async function mapCC(q, cc, ch) {
    await Interop.ready();
    const s = q ? Interop.findSlider(q) : (() => { const lt = window.ThreeStage?.lastTouched; return lt ? Interop.findSlider(lt.key) : null; })();
    if (!s) throw new Error(q ? `No slider "${q}"` : 'Touch a slider first (or name one: /midi-out cc glow)');
    const d = data(); const used = new Set(Object.values(d.cc).map((m) => m.cc));
    let n = cc != null && cc !== '' ? Number(cc) : 20; if (cc == null || cc === '') while (used.has(n) && n < 119) n += 1;
    if (!(n >= 0 && n <= 119)) throw new Error('A CC number between 0 and 119');
    const label = s.label || s.key;
    save({ cc: { ...Object.fromEntries(Object.entries(d.cc).filter(([, m]) => m.cc !== n || (m.ch || d.ch) !== (Number(ch) || d.ch))), [label]: { cc: n, ...(ch ? { ch: Number(ch) } : {}) } } });
    if (access && targets().length) { const c = (Number(ch) || d.ch) - 1; const t = performance.now(); [0, 64, 127, 64].forEach((v, i) => send([0xB0 | c, n, v], t + i * 60)); }
    return { label, cc: n };
  }
  function unmapCC(label) { const d = data(); const k = Object.keys(d.cc).find((x) => x.toLowerCase() === String(label).toLowerCase()); if (!k) throw new Error('Not mapped'); delete d.cc[k]; save({ cc: d.cc }); return k; }
  function panic() { for (let c = 0; c < 16; c += 1) { send([0xB0 | c, 123, 0]); send([0xB0 | c, 120, 0]); } return true; }
  function summary() { const d = data(); if (!d.out) return 'off'; return [d.out === '*' ? 'all outputs' : d.out, d.clock ? 'clock' : '', d.rules.length ? `${d.rules.length} cue${d.rules.length === 1 ? '' : 's'}` : '', Object.keys(d.cc).length ? `${Object.keys(d.cc).length} CC` : ''].filter(Boolean).join(' · '); }
  function status() { const d = data(); return { ...d, outputs: names(), active: targets().map((o) => o.name), clockOn: CK.on, bpm: Interop.clock.bpm, stats: { ...stats } }; }
  const describe = (r) => `${EVENTS.find(([k]) => k === r.on)?.[1] || r.on} → ${noteName(r.note)} (${r.note}) ch ${r.ch} vel ${r.vel} ${r.len} ms`;

  function menuItems() {
    const d = data();
    return [
      `MIDI out · ${summary()}`,
      { label: 'Device', hint: d.out === '*' ? 'every output' : d.out || 'none', items: async () => { try { await open(); } catch (err) { return [err.message]; } const list = names(); return list.length ? [...list.map((n) => ({ label: n, checked: d.out === n, action: () => use(n).then(wire) })), { label: 'Every output', checked: d.out === '*', action: () => use('*') }, ...(d.out ? [{ label: 'None (off)', action: () => { clockStop(); save({ out: '' }); } }] : [])] : ['No MIDI output found', 'On a Mac: Audio MIDI Setup → IAC Driver → online']; } },
      { label: 'Clock out', hint: d.clock ? `${Interop.clock.bpm.toFixed(1)} BPM` : 'off', checked: d.clock, action: () => setClock(!d.clock).catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Notes on cues', hint: String(d.rules.length), items: () => [
        ...d.rules.map((r) => ({ label: describe(r), hint: 'click to remove', action: () => save({ rules: data().rules.filter((x) => x !== r && !(x.on === r.on && x.note === r.note)) }) })),
        '-',
        ...Object.entries(PRESETS).map(([k, p]) => ({ label: `Preset: ${p.name}`, action: () => usePreset(k) })),
        { label: '＋ A note on…', items: () => EVENTS.map(([k, l]) => ({ label: l, action: async () => { const v = await Modal.prompt(`${l}: which note? (36, C1, F#2…)`, { value: '36' }); if (v) { try { addRule(k, v); } catch (err) { toast(err.message, { type: 'error' }); } } } })) },
        d.rules.length ? { label: 'Clear them', danger: true, action: () => clearRules() } : null,
      ] },
      { label: 'Slider → CC', hint: `${Object.keys(d.cc).length}`, items: () => [
        { label: 'The slider I touched → the next free CC', hint: window.ThreeStage?.lastTouched?.label || 'touch one first', action: () => mapCC().then((r) => toast(`🎹 ${r.label} → CC ${r.cc}`, { timeout: 2000 })).catch((err) => toast(err.message, { type: 'error' })) },
        ...Object.entries(d.cc).map(([l, m]) => ({ label: `${l} → CC ${m.cc}${m.ch ? ` ch ${m.ch}` : ''}`, hint: 'click to remove', action: () => unmapCC(l) })),
      ] },
      { label: 'Program change on a scene change', hint: 'its set-list number', checked: d.pc, action: () => save({ pc: !d.pc }) },
      { label: 'Channel', hint: String(d.ch), items: () => Array.from({ length: 16 }, (_, i) => ({ label: `Channel ${i + 1}`, checked: d.ch === i + 1, action: () => save({ ch: i + 1 }) })) },
      { label: '■ Panic (all notes off)', action: () => panic() },
    ];
  }

  // back on at start when it was on
  async function resume() { const d = data(); if (d.out && (d.clock || d.rules.length || Object.keys(d.cc).length || d.pc)) { try { await open(); wire(); } catch { /* no MIDI here */ } } }

  return { EVENTS, PRESETS, open, use, names, setClock, addRule, clearRules, usePreset, mapCC, unmapCC, panic, summary, status, menuItems, resume, wire, parseNote, noteName, describe, clockStop, get stats() { return { ...stats }; }, get clockOn() { return CK.on; } };
})();
window.InteropMidi = InteropMidi;
