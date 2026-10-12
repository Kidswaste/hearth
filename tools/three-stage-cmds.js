// /stage: the Lab's live stage from a chat (round 22, labstage; tools/three-stage.js, tools/three-stage-midi.js).
//   /stage · show [on|off] · go [cut|fade|dip] [beats] · cut · cue <scene> · next · prev · set [add|remove|clear|fill|<n>]
//   /stage mode cut|fade|dip · length <beats|1bar|2bars> · quantize off|beat|bar · tap · bpm <n>
//   /stage lfo [slider] <shape> <rate> [depth] | lfo [slider] off · xfade <0–1>
//   /stage midi [learn [global]|stop|pad <action>|xfader|list|forget <n>|soft on|off] · keys
//   /stage output [on|off|res <…>|fps <n>|screen <n>] · blackout [on|off] · freeze
(() => {
  const AREA = 'Three.js Lab';
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const onOff = (s) => (/^(on|yes|1|true)$/i.test(s) ? true : /^(off|no|0|false)$/i.test(s) ? false : undefined);
  const ready = async () => { await ThreeLab.cmd({ show: true }); return ThreeStage; };
  const beatsOf = (s) => { const m = /^(\d+(?:\.\d+)?)\s*(bars?|beats?|b)?$/i.exec(String(s || '')); if (!m) return null; return Number(m[1]) * (/^bar/i.test(m[2] || '') ? 4 : 1); };
  const SUBS = ['show', 'go', 'cut', 'cue', 'next', 'prev', 'set', 'mode', 'length', 'quantize', 'tap', 'bpm', 'lfo', 'xfade', 'midi', 'keys', 'output', 'blackout', 'freeze'];
  function status(st) {
    return [
      `🎚 ${st.show ? 'Show mode' : 'Live stage'} · on screen: ${st.current || '—'}${st.cued ? ` · cued: ${st.cued}` : ''}`,
      `${st.mode} · ${st.beats} beat${st.beats === 1 ? '' : 's'} · lands ${st.quant === 'off' ? 'now' : `on the ${st.quant}`} · ${st.bpm.toFixed(1)} BPM (${st.tempo})`,
      st.setlist.length ? `Set list: ${st.setlist.map((x) => `${x.n}. ${x.name}${x.current ? ' ●' : x.cued ? ' ◌' : ''}`).join(' · ')}` : 'No set list: /stage set add',
      `Output: ${st.output ? `on (${st.out.res}, ${st.out.fps || 'auto'} fps)` : 'off'}${st.black ? ' · black-out' : ''}${st.held ? ` · ⚠ held: ${st.held}` : ''}`,
      `MIDI: ${ThreeStageMidi.summary()} · ${ThreeStageMidi.mappings().length} mapping${ThreeStageMidi.mappings().length === 1 ? '' : 's'}`,
    ].join('\n');
  }
  const findScene = (q) => { const n = String(q || '').toLowerCase(); const all = ThreeLab.peek?.()?.sketches?.() || []; return all.find((x) => x.name.toLowerCase() === n) || all.find((x) => x.name.toLowerCase().includes(n)) || null; };

  async function run(args) {
    const S = await ready();
    const w = words(args); const sub = (w[0] || '').toLowerCase(); const rest = w.slice(1); const tail = rest.join(' ');
    if (!sub || sub === 'status') return status(S.state);
    if (sub === 'show') { const on = S.setShow(onOff(rest[0]) ?? !S.state.show); return on ? 'Show mode on: Enter = GO · ← → scenes · 1–8 cue · B black-out · Shift+Esc to leave' : 'Show mode off'; }
    if (sub === 'go' || sub === 'cut') {
      const o = {}; for (const x of rest) { if (/^(cut|fade|dip)$/i.test(x)) o.mode = x.toLowerCase(); else if (/^(now|beat|bar)$/i.test(x)) o.quant = x.toLowerCase() === 'now' ? 'off' : x.toLowerCase(); else if (beatsOf(x)) o.beats = beatsOf(x); }
      if (sub === 'cut') { o.mode = 'cut'; o.quant ||= 'off'; }
      const name = await S.go(null, o); return name ? `▸ ${name}` : 'Not now (a transition is running)';
    }
    if (sub === 'cue') { const x = /^\d+$/.test(tail) ? null : findScene(tail); if (/^\d+$/.test(tail)) return `Cued ${await S.setlist.cueN(Number(tail))}`; if (!x) throw new Error(`No scene "${tail}"`); return `Cued ${await S.cue(x.id)}`; }
    if (sub === 'next' || sub === 'prev') { await S.act(sub); return `▸ ${S.state.current}`; }
    if (sub === 'set') {
      const a = (rest[0] || 'list').toLowerCase();
      if (a === 'add') { const x = rest.length > 1 ? findScene(rest.slice(1).join(' ')) : null; if (rest.length > 1 && !x) throw new Error(`No scene "${rest.slice(1).join(' ')}"`); return `Set list: ${S.setlist.add(x?.id)} scenes`; }
      if (a === 'remove') return `Took out ${S.setlist.remove(rest[1])}`;
      if (a === 'clear') { S.setlist.clear(); return 'Set list cleared'; }
      if (a === 'fill') return `Set list: your ${S.setlist.fill(Number(rest[1]) || 8)} most recent scenes`;
      if (/^\d+$/.test(a)) return `Cued ${await S.setlist.cueN(Number(a))}`;
      const l = S.setlist.list(); return l.length ? l.map((x) => `${x.n}. ${x.name}${x.current ? ' ●' : x.cued ? ' ◌ cued' : ''}`).join('\n') : 'The set list is empty: /stage set add (this scene) or /stage set fill';
    }
    if (sub === 'mode') { const m = (rest[0] || '').toLowerCase(); if (!S.MODES.some(([k]) => k === m)) throw new Error('cut, fade or dip'); store.set('three.stage.mode', m); return `Transition: ${m}`; }
    if (sub === 'length') { const b = beatsOf(tail.replace(/\s+/g, '')); if (!b) throw new Error('Beats (4) or bars (2bars)'); store.set('three.stage.beats', b); return `Length: ${b} beats`; }
    if (sub === 'quantize') { const q = (rest[0] || '').toLowerCase().replace('now', 'off'); if (!S.QUANT.some(([k]) => k === q)) throw new Error('off, beat or bar'); store.set('three.stage.quant', q); return `Lands ${q === 'off' ? 'at once' : `on the next ${q}`}`; }
    if (sub === 'tap') return `${S.tap()} BPM (tap again to refine)`;
    if (sub === 'bpm') { if (!rest[0]) return `${S.bpm().toFixed(1)} BPM (${S.source()})`; return `${S.setBpm(rest[0])} BPM (when no song plays)`; }
    if (sub === 'lfo') {
      const shapes = S.SHAPES.map(([k]) => k);
      const at = rest.findIndex((x) => shapes.includes(x.toLowerCase()) || x.toLowerCase() === 'off');
      if (at < 0) throw new Error(`/stage lfo [slider] <${shapes.join('|')}|off> [1beat|1bar|2bars…] [depth 0–1]`);
      const name = rest.slice(0, at).join(' ') || null; const shape = rest[at].toLowerCase();
      const rate = beatsOf(rest[at + 1]) || 4; const depth = Number(rest[at + 2]) || 0.25;
      const label = S.lfo(name, { shape, rate, depth });
      return shape === 'off' ? `${label}: LFO off` : `∿ ${label}: ${shape} every ${rate} beat${rate === 1 ? '' : 's'}, depth ${Math.round(depth * 100)} %`;
    }
    if (sub === 'xfade') { const u = Number(rest[0]); if (!(u >= 0 && u <= 1)) throw new Error('A position 0–1'); await S.xfade(u); return `Crossfader ${u}`; }
    if (sub === 'midi' || sub === 'keys') {
      const M = ThreeStageMidi; const a = (sub === 'keys' ? 'list' : rest[0] || 'list').toLowerCase();
      if (a === 'learn') { M.startLearn({ kind: 'slider', global: /^(global|all|every)/i.test(rest[1] || '') }); return 'MIDI learn: touch a slider, turn a knob (again for the next one) · Esc to finish'; }
      if (a === 'stop') { M.stopLearn(); return 'MIDI learn off'; }
      if (a === 'pad') { const act = (rest[1] || '').toLowerCase(); const hit = S.ACTIONS.find(([k]) => k.toLowerCase() === act); if (!hit) throw new Error(`Actions: ${S.ACTIONS.map(([k]) => k).join(', ')}`); M.startLearn({ kind: 'action', action: hit[0] }); return `Hit a pad or press a key for “${hit[1]}”`; }
      if (a === 'xfader') { M.startLearn({ kind: 'xfader' }); return 'Move the fader you want as the crossfader'; }
      if (a === 'soft') { const d = M.data; d.soft = onOff(rest[1]) ?? !d.soft; store.set('three.stage.midi', d); return `Soft takeover ${d.soft ? 'on' : 'off'}`; }
      if (a === 'forget') { const m = M.mappings()[Number(rest[1]) - 1]; if (!m) throw new Error('/stage midi list shows the numbers'); M.forget(m.id, m.where); return `Forgot ${m.text}`; }
      if (a === 'devices') { await M.open(); return M.devices().join(', ') || 'No MIDI device'; }
      const maps = M.mappings().filter((m) => sub !== 'keys' || m.where === 'key');
      return maps.length ? maps.map((m, i) => `${i + 1}. ${m.where === 'key' ? `key ${m.id}` : M.label(m.id)} → ${m.text}${m.where === 'scene' ? ' (this scene)' : ''}`).join('\n') : sub === 'keys' ? 'No keys learned: /stage midi pad <action>, then press a key' : 'No mappings: /stage midi learn';
    }
    if (sub === 'output') {
      const a = (rest[0] || 'on').toLowerCase();
      if (a === 'res') return `Output resolution: ${S.setRes(rest[1])}`;
      if (a === 'fps') return `Output: ${S.setFps(rest[1])} fps`;
      if (a === 'screen') { const ds = (await window.hub.stageDisplays?.()) || []; const d = ds[Number(rest[1]) - 1]; if (!d) throw new Error(ds.map((x, i) => `${i + 1}. ${x.label} ${x.width}×${x.height}${x.hub ? ' (Hearth)' : ''}`).join('\n') || 'No screens found'); await S.output(true, { display: d.id }); return `Output on ${d.label}`; }
      if (onOff(a) === false) { await S.output(false); return 'Output closed'; }
      const r = await S.output(true); return r?.other ? 'Output fullscreen on the other screen' : 'Output fullscreen (one screen only: F11 or Esc there)';
    }
    if (sub === 'blackout') return `Black-out ${S.blackout(onOff(rest[0])) ? 'on' : 'off'}`;
    if (sub === 'freeze') { await S.act('freeze'); return 'Freeze toggled'; }
    throw new Error(`/stage ${SUBS.join(' | ')}`);
  }
  const complete = (a) => {
    const w = String(a || '').split(/\s+/);
    if (w.length <= 1) return SUBS.filter((x) => x.startsWith(w[0] || '')).map((x) => `${x} `);
    const sub = w[0]; const last = w[w.length - 1];
    const opts = { mode: ['cut', 'fade', 'dip'], quantize: ['off', 'beat', 'bar'], show: ['on', 'off'], go: ['cut', 'fade', 'dip', '1bar', '2bars', 'now'], length: ['1', '2', '1bar', '2bars', '4bars'],
      set: ['add', 'remove', 'clear', 'fill', 'list'], midi: ['learn', 'learn global', 'stop', 'pad', 'xfader', 'list', 'forget', 'soft on', 'soft off', 'devices'], output: ['on', 'off', 'res', 'fps', 'screen'],
      lfo: typeof ThreeStage !== 'undefined' ? ThreeStage.SHAPES.map(([k]) => k).concat('off') : [], blackout: ['on', 'off'] }[sub] || [];
    const head = w.slice(0, -1).join(' ');
    if (sub === 'cue') return (ThreeLab.peek?.()?.sketches?.() || []).map((x) => x.name).filter((n) => n.toLowerCase().includes(w.slice(1).join(' ').toLowerCase())).slice(0, 12).map((n) => `cue ${n}`);
    if (sub === 'output' && w[1] === 'res') return ThreeStage.RES.map(([k]) => `output res ${k}`);
    if (sub === 'midi' && w[1] === 'pad') return ThreeStage.ACTIONS.map(([k]) => `midi pad ${k}`).filter((x) => x.includes(last));
    return opts.filter((x) => x.startsWith(last)).map((x) => `${head} ${x}`);
  };
  if (!Commands.get('stage')) Commands.register({ name: 'stage', desc: 'Live / VJ: show mode, GO (cut / fade / dip on the bar), set list, cue, tempo (tap, MIDI clock), beat LFOs, MIDI learn, output on the other screen, black-out', args: '[show|go|cue|next|prev|set|mode|length|quantize|tap|bpm|lfo|xfade|midi|keys|output|blackout|freeze] …', area: AREA, run, complete, aliases: ['vj'] });
})();
