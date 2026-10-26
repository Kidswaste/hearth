// (round 69, midilearn69) 🎹 Map my controller — the pure part (docs/upgrades/midilearn69.md), shared by the window
// (tools/midilearn.js) and the main process (creative-vstmain.js jobOf: the fields that may reach the instrument host).
// The mapping math itself (range, invert, pickup, smoothing) runs in the host: creative-vst-midimap.py.
// A mapping: { cc: 0–127, ch: 0–15 (the channel it was learned on), key: the control's key, label, min / max: 0–1 of the
// control's own range (min > max = reversed), invert }. Per instrument: { pickup: 'takeover' | 'jump', maps: [...] }.
(function (root, make) { const M = make(); if (typeof module === 'object' && module.exports) module.exports = M; else root.MidiLearnCore = M; })(typeof self !== 'undefined' ? self : this, () => {
  const MAX = 64;
  const NEVER = new Set([1, 64, 120, 121, 122, 123, 124, 125, 126, 127]); // mod wheel, sustain, channel mode: always straight to the instrument
  const WHY = { 1: 'the mod wheel', 64: 'the sustain pedal' };
  const num01 = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  // The main process's whitelist: only these shapes travel to the host (which checks them again).
  function fields(r) {
    const out = {};
    if (r.maps !== undefined) {
      if (!Array.isArray(r.maps) || r.maps.length > MAX) throw Error(`Up to ${MAX} mappings per instrument.`);
      out.maps = r.maps.map(m => {
        if (!m || typeof m !== 'object' || !int(m.cc, 0, 127) || NEVER.has(m.cc) || (m.ch != null && !int(m.ch, 0, 15)) || typeof m.key !== 'string' || !m.key || m.key.length > 200 || !num01(m.min ?? 0) || !num01(m.max ?? 1)) throw Error('Invalid controller mapping.');
        return { cc: m.cc, ch: m.ch ?? null, key: m.key, label: typeof m.label === 'string' ? m.label.slice(0, 120) : m.key, min: m.min ?? 0, max: m.max ?? 1, invert: m.invert === true };
      });
    }
    if (r.pickup !== undefined) out.pickup = r.pickup === 'jump' ? 'jump' : 'takeover';
    if (r.learn !== undefined) out.learn = r.learn === true;
    return out;
  }
  // A new mapping from what was learned + the control picked (the same knob → the same control: replaced, not doubled)
  function add(maps, { cc, ch = null, key, label }) {
    if (!int(cc, 0, 127) || NEVER.has(cc)) throw Error(NEVER.has(cc) ? `That is ${WHY[cc] || 'a channel message'}: it always goes straight to the instrument. Turn another knob.` : 'Turn a knob or move a fader first.');
    if (typeof key !== 'string' || !key) throw Error('Pick a control.');
    const list = (maps || []).filter(m => !(m.cc === cc && (m.ch ?? null) === (ch ?? null) && m.key === key));
    if (list.length >= MAX) throw Error(`That's ${MAX} mappings already: remove one first.`);
    return [...list, { cc, ch: ch ?? null, key, label: String(label || key).slice(0, 120), min: 0, max: 1, invert: false }];
  }
  const remove = (maps, i) => (maps || []).filter((_, j) => j !== i);
  // the range fields are percentages on screen; stored 0–1
  function setRange(maps, i, { min, max } = {}) {
    const pct = v => Math.max(0, Math.min(100, Math.round(Number(v)))) / 100;
    return (maps || []).map((m, j) => j !== i ? m : { ...m, ...(min !== undefined && Number.isFinite(Number(min)) ? { min: pct(min) } : {}), ...(max !== undefined && Number.isFinite(Number(max)) ? { max: pct(max) } : {}) });
  }
  const setInvert = (maps, i, on) => (maps || []).map((m, j) => j !== i ? m : { ...m, invert: !!on });
  const pct = v => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');
  const ccName = (cc, ch) => `CC ${cc}${ch != null ? ` · ch ${ch + 1}` : ''}`;
  const rowText = m => `${ccName(m.cc, null)} → ${m.label || m.key}`;
  // the line under a row: where the control is, and (takeover) that it waits for the knob
  function rowState(row, pickup) {
    if (!row) return '';
    const now = `now ${pct(row.value)}`;
    if (pickup === 'takeover' && !row.picked && row.cc_value != null) return `${now} · turn the knob towards ${pct(row.value)} to pick it up`;
    if (pickup === 'takeover' && !row.picked) return `${now} · picks up when the knob reaches it`;
    return now;
  }
  // what the Learn step says, in plain words
  function learnText(learn, name) {
    if (!learn) return '';
    if (learn.cc != null) return `Got ${ccName(learn.cc, learn.ch)}. Now pick what it controls in ${name || 'the instrument'}:`;
    if (learn.ignored) return `That was ${learn.ignored}: it always goes straight to the instrument. Turn another knob or move a fader.`;
    return 'Turn a knob or move a fader on your controller…';
  }
  const label = p => String(p?.label || p?.key || '').replace(/ \(0–1\)$/, '');
  // the searchable list: controls whose name has every word typed (first 60)
  function search(params, query, limit = 60) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const p of params || []) { const t = `${p.label || ''} ${p.key || ''}`.toLowerCase(); if (words.every(w => t.includes(w))) { out.push(p); if (out.length >= limit) break; } }
    return out;
  }
  return { MAX, NEVER, WHY, fields, add, remove, setRange, setInvert, pct, ccName, rowText, rowState, learnText, label, search };
});
