/* (round 61, vstlive61) Live mode helpers for Codex's Sound desk (tools/workbench-vst.js): the audio device picker
   (ASIO first, the Universal Audio interface preselected), buffer sizes, the live readout, phrases for the host's
   sequencer and a tiny event hub behind WorkbenchVST.api. No DOM, no runtime: Node tests require it directly. */
(function(root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.WorkbenchVSTLive = api; })(globalThis, () => {
  const BUFFERS = [[64, '64 · tightest'], [128, '128 · tight'], [256, '256 · responsive'], [512, '512 · balanced'], [1024, '1024 · stable']];
  // Universal Audio's drivers: "Universal Audio Thunderbolt" / "… Apollo …" (ASIO), "Monitor 1-2 (Universal Audio …)"
  // (WDM / WASAPI), Volt: "Volt 2 (Universal Audio Volt 2)" / "UA Volt". \bUAD?\b keeps "Dual" or "Guard" out.
  const UA = /universal audio|apollo|\bvolt\b|\buad?\b/i;
  const RANK = { ASIO: 0, 'Windows WASAPI': 1, 'Windows WDM-KS': 3, 'Windows DirectSound': 4, MME: 5 };
  // value: '' = the system's default output · '<id>' = that device (shared for WASAPI) · '<id>x' = WASAPI exclusive
  function parse(value) { const m = /^(\d+)(x?)$/.exec(String(value ?? '')); return m ? { device: Number(m[1]), exclusive: m[2] === 'x' } : { device: null, exclusive: false }; }
  function apiLabel(api, exclusive) { return api === 'ASIO' ? 'ASIO' : api === 'Windows WASAPI' ? (exclusive ? 'WASAPI exclusive · low latency, other apps paused' : 'WASAPI shared') : api.replace(/^Windows /, ''); }
  /** The picker: [[value, label]…] ASIO (UA first), then WASAPI exclusive + shared (UA first), then the rest; and the
   *  preselected value: UA on ASIO › UA on WASAPI exclusive › the host's preferred (Windows default, shared) › system. */
  function options(r = {}) {
    const list = (r.devices || []).filter(d => d && Number.isInteger(d.id) && typeof d.name === 'string' && typeof d.api === 'string');
    const rows = [];
    for (const d of list) {
      if (d.api === 'Windows WASAPI') rows.push({ d, value: `${d.id}x`, exclusive: true, rank: 1 }, { d, value: String(d.id), exclusive: false, rank: 2 });
      else rows.push({ d, value: String(d.id), exclusive: false, rank: RANK[d.api] ?? 6 });
    }
    rows.sort((a, b) => a.rank - b.rank || (UA.test(b.d.name) - UA.test(a.d.name)) || a.d.id - b.d.id);
    const out = rows.map(x => [x.value, `${UA.test(x.d.name) ? '★ ' : ''}${x.d.name} · ${apiLabel(x.d.api, x.exclusive)}`]);
    out.push(['', 'System output (default)']);
    const ua = rows.filter(x => UA.test(x.d.name));
    const preferred = (ua.find(x => x.d.api === 'ASIO') || ua.find(x => x.exclusive))?.value ?? (Number.isInteger(r.preferred) ? String(r.preferred) : '');
    return { options: out, preferred, asio: !!r.asio, hasUA: ua.length > 0, asioDevices: list.filter(d => d.api === 'ASIO').length };
  }
  /** What to remember for a choice (device ids change between sessions; names don't). */
  function remember(value, r = {}) { const { device, exclusive } = parse(value); const d = (r.devices || []).find(x => x.id === device); return d ? { name: d.name, api: d.api, exclusive } : null; }
  /** A remembered choice back to today's value, or null when that device isn't there now. */
  function resolve(saved, r = {}) {
    if (!saved || typeof saved.name !== 'string') return null;
    const d = (r.devices || []).find(x => x.name === saved.name && x.api === saved.api);
    return d ? `${d.id}${saved.exclusive && d.api === 'Windows WASAPI' ? 'x' : ''}` : null;
  }
  /** The live readout under the transport: one line, plain words. */
  function statsText(s = {}) {
    if (s.error) return `Audio stopped: ${s.error}`;
    if (!s.playing) return `PAUSED${s.deviceName ? ` · ${s.deviceName}` : ''}${s.editorOpen ? ' · native editor open' : ''}`;
    const midi = s.midi?.open?.length ? ` · MIDI in: ${s.midi.open.join(', ')}${s.midi.events ? ` (${s.midi.events})` : ''}` : '';
    const api = s.api ? ` · ${s.api === 'Windows WASAPI' ? (s.exclusive ? 'WASAPI exclusive' : 'WASAPI shared') : s.api.replace(/^Windows /, '')}` : '';
    return `LIVE${s.deviceName ? ` · ${s.deviceName}` : ''}${api} · ${s.sampleRate / 1000} kHz · ${s.buffer} samples · ≈${Math.round(s.latencyMs ?? (s.deviceLatencyMs + s.queuedMs))} ms out · DSP ${Math.round(s.load ?? 0)} % · ${s.underruns} underruns${midi}${s.editorOpen ? ' · native editor open' : ''}`;
  }
  /** Plain warnings worth one line under the readout (never more than one). */
  function advice(s = {}) {
    if (!s.playing) return '';
    if ((s.load ?? 0) > 85) return 'The instrument is close to its time budget: a bigger buffer (or a lighter patch) stops crackles.';
    if (s.underruns > 20 && s.buffer <= 128) return 'Underruns: try the next buffer size up.';
    if (s.api === 'MME' || s.api === 'Windows DirectSound') return 'This output adds latency; the ASIO or WASAPI entry of your interface plays tighter.';
    return '';
  }
  // Phrases for the host's sequencer (seconds, from the moment they start). 120 BPM; loop = their length.
  const PHRASES = {
    stab: { label: 'Chord stab', make: (root) => ({ loop: 2, notes: [0, 4, 7, 11].map(i => ({ note: root + i, time: 0, length: .35, velocity: 104 })).concat([0, 4, 7].map(i => ({ note: root + i, time: 1, length: .35, velocity: 96 }))) }) },
    arp: { label: 'Arpeggio', make: (root) => ({ loop: 2, notes: [0, 7, 12, 16, 19, 16, 12, 7].map((i, k) => ({ note: root + i, time: k * .25, length: .2, velocity: k % 4 ? 88 : 110 })) }) },
    bass: { label: 'Bass pulse', make: (root) => ({ loop: 2, notes: [0, 0, 12, 0, 0, 10, 0, 7].map((i, k) => ({ note: root - 12 + i, time: k * .25, length: .18, velocity: k % 2 ? 90 : 118 })) }) },
    pad: { label: 'Held pad', make: (root) => ({ loop: 4, notes: [0, 7, 12, 16].map(i => ({ note: root + i, time: 0, length: 3.8, velocity: 80 })) }) }
  };
  function phrase(name, octave = 4) { const p = PHRASES[name]; if (!p) return null; const r = p.make((octave + 1) * 12); return { ...r, notes: r.notes.filter(n => n.note >= 0 && n.note <= 127) }; }
  /** A tiny event hub: on(type, fn) → off(). Listener errors never reach the desk. */
  function hub() {
    const map = new Map();
    return {
      on(type, fn) { if (typeof fn !== 'function') throw Error('on(type, fn) needs a function.'); const set = map.get(type) || new Set(); set.add(fn); map.set(type, set); return () => set.delete(fn); },
      emit(type, detail) { for (const fn of map.get(type) || []) { try { fn(detail); } catch (err) { console.warn('[sound desk] listener', type, err); } } },
      count: type => map.get(type)?.size || 0
    };
  }
  return { BUFFERS, UA, parse, options, remember, resolve, statsText, advice, PHRASES, phrase, hub };
});
