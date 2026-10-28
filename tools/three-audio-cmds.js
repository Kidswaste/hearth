// Chat commands for the Lab's audio reactivity (round 23, labaudio): what it hears (/audio), the live input and
// loopback devices (/audio-in, /loopback), any slider following any sound with a curve (/react-to, /react-curve,
// /react-off), reaction presets (/react-preset) and the song's whole-song features (/song-features). Area
// "Three.js Lab"; Ctrl/⌘+K actions at the end. Engine: tools/three-audio.js · editor / presets: three-audio-map.js.
(() => {
  const AREA = 'Three.js Lab';
  const reg = (name, desc, args, run, complete, extra = {}) => { if (Commands.get(name)) { console.warn(`three-audio: /${name} is taken`); return; } Commands.register({ name, desc, args, area: AREA, run, complete, ...extra }); };
  const pick = (list, q) => list.filter((x) => x.toLowerCase().includes(String(q || '').toLowerCase().split(/\s+/).pop())).slice(0, 14).map((value) => ({ value }));
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const bar = (x, n = 8) => { const k = Math.round(Math.max(0, Math.min(1, x || 0)) * n); return `${'█'.repeat(k)}${'░'.repeat(n - k)}`; };
  async function lab() {
    await ThreeLab.cmd();
    for (let i = 0; i < 40 && !ThreeAudio.lab; i += 1) await new Promise((r) => setTimeout(r, 50));
    if (!ThreeAudio.lab) throw new Error('Open the Three.js Lab first');
    return ThreeAudio.lab;
  }
  // a slider by name on the selected layer first, then any layer → { ctl, key, label, layer }
  async function slider(q) {
    const l = await lab();
    const sel = l.selCtl?.();
    const hit = sel?.resolve?.(q);
    if (hit?.kind === 'number') return { ctl: sel, key: hit.key, label: hit.label };
    for (const L of l.layers()) { const h = L.ctl?.resolve?.(q); if (h?.kind === 'number') return { ctl: L.ctl, key: h.key, label: h.label, layer: L.name }; }
    throw new Error(`No slider "${q}" (the sliders: ${(sel?.controls?.() || []).filter((c) => c.min != null).map((c) => c.label).slice(0, 12).join(', ') || 'none yet'})`);
  }
  const sliderNames = () => { try { return (ThreeAudio.lab?.selCtl?.()?.controls?.() || []).filter((c) => c.min != null).map((c) => c.label); } catch { return []; } };
  const curveText = (c) => { if (!c) return ''; const p = []; if (c.thr) p.push(`threshold ${pct(c.thr)}`); if (c.gam && c.gam !== 1) p.push(`punch ${c.gam}×`); if (c.att) p.push(`attack ${c.att} ms`); if (c.rel) p.push(`release ${c.rel} ms`); if (c.inv) p.push('inverted'); return p.length ? ` (${p.join(', ')})` : ''; };
  const reactions = (l) => l.layers().flatMap((L) => (L.ctl?.controls?.() || []).filter((c) => c.followsMusic).map((c) => `${c.label}${l.layers().length > 1 ? ` [${L.name}]` : ''} → ${ThreeAudio.label(c.followsMusic.band)} ${Math.round(c.followsMusic.amount * 100)}%${curveText(c.followsMusic.c)}`));

  // (round 74, checkhealth74) since round 64 the Audio doctor's /audio (audiodoctor.js, a boot stand-in) took the name
  // first and this one was never registered (nor /hear): it goes in as /hear (alias /audio-now) and the doctor's /audio
  // hands "names" and a bare /audio with the Lab on screen to it (window.LabHear)
  const hearWhat = 'What the Lab hears now: hits (kick / snare / hats / vocals), the 8 bands, loudness, brightness, beat and bar with how sure, the key; "names" lists every feature a slider or sketch can use; "sync" how the pictures follow the sound (your speakers\' delay, the sound output)';
  // (round 77, labaudio77) /hear sync: the preview's song clock in plain words (tools/three-sandbox.html "the song's
  // clock"): what it follows, how late the speakers play, the sound card's drift, the output and its recoveries
  async function syncText() {
    const r = await ThreeLab.director?.evalInSketch?.('return window.__labAV ? window.__labAV.state() : null').catch(() => null);
    const s = r?.ok ? r.value : null;
    if (!s) return 'The preview didn\'t answer (is the Lab\'s preview running?)';
    if (!s.song) return 'No song on this scene: nothing to keep in sync (load one with 🎵).';
    const how = { 'output clock': 'the sound output\'s own clock (when each moment reaches your speakers)', latency: 'the delay the sound output reports', rendered: s.video ? 'the footage\'s own picture (footage shows its frames as it plays them)' : 'the sound as it is recorded (a recording runs)' }[s.source] || 'the song (press play to measure)';
    const last = (s.log || []).filter((e) => /again|resumed|could not|kept/.test(e.what)).at(-1);
    return [
      `**Pictures and sound**: the pictures follow ${how}.`,
      s.playing && s.source !== 'rendered' ? `Your speakers play **${s.leadMs} ms** after the song's clock; each frame shows what you hear when it reaches the screen.` : (s.playing ? '' : 'Paused: the pictures show the exact spot under the playhead.'),
      s.playing && s.samples > 50 ? `The sound card's clock runs ${s.slopePpm >= 0 ? '+' : ''}${s.slopePpm} ppm against the computer's: followed, so a long song never drifts.` : '',
      s.ctx ? `Sound output: ${s.ctx.rate / 1000} kHz, ${s.ctx.state}${s.recoveries ? ` · the sound was made again ${s.recoveries}× after the output changed` : ''}${last ? ` (last: ${last.what}${last.why ? `, ${last.why}` : ''})` : ''}.` : '',
    ].filter(Boolean).join('\n');
  }
  const audioName = Commands.get('audio') ? 'hear' : 'audio';
  reg(audioName, hearWhat, '[names|sync]', window.LabHear = async (args = '') => {
    const l = await lab();
    if (/^sync$/i.test(args.trim())) return syncText();
    if (/^names?|list$/i.test(args.trim())) return ThreeAudio.GROUPS.map(([g, list]) => `**${g}**: ${list.map(([n, lb]) => `${n} (${lb})`).join(' · ')}`).join('\n') + '\nIn a sketch: audio.feat.kickOn, audio.env(\'kickOn\', 5, 300), audio.chroma, audio.keyName; onHit(\'kickOn\', fn).';
    const names = AudioFeat.NAMES.slice(0, 43);
    const r = await ThreeAudio.probe(names);
    if (!r) return 'The preview didn\'t answer (is the Lab\'s preview running?)';
    const v = r.values;
    const bands = ['sub', 'low', 'lowMid', 'mids', 'highMid', 'presence', 'brilliance', 'air'];
    const key = v.keyConf > 0 ? `${AudioFeat.keyName(Math.round(v.key))} (${pct(v.keyConf)} sure)` : 'not sure yet';
    const live = l.live.kind();
    return [
      `**Hearing**: ${r.from}${live ? ` · input: ${l.live.io().device ? 'a chosen device' : 'default'}${ThreeAudio.monitorOn() ? ' · monitoring on' : ''}` : ''}`,
      `Hits: kick ${bar(v.kickOn, 4)} snare ${bar(v.snareOn, 4)} hats ${bar(v.hatOn, 4)} vocals ${bar(v.vocalOn, 4)}`,
      `Bands: ${bands.map((b) => `${b} ${bar(v[b], 5)}`).join('  ')}`,
      `Loudness ${Math.round(v.lufs)} LUFS-ish (${pct(v.loudness)}) · brightness ${pct(v.centroid)} · change ${pct(v.flux)} · vocals ${pct(v.vocal)}`,
      `Beat ${v.bpm ? `${Math.round(v.bpm * 10) / 10} BPM` : '—'} · beat ${Math.round(v.beatInBar) || '—'} of the bar, phase ${pct(v.barPhase)} (${pct(v.beatConf)} sure of the beat, ${pct(v.barConf)} of bar 1) · key ${key}`,
      `Song: build ${pct(v.build)} · drop ${pct(v.drop)} · intensity ${pct(v.intensity)}`,
    ].join('\n');
  }, (a) => pick(['names', 'sync'], a), { aliases: audioName === 'audio' ? ['hear', 'audio-now'] : ['audio-now'], keywords: 'audio features bands onsets kick snare hats loudness lufs centroid flux key chroma beat phase sync latency speakers bluetooth', examples: ['/audio', '/audio names', '/audio sync'] });

  reg('audio-in', 'Live input: list the inputs, pick one (a mic, an audio interface, a loopback device for the computer\'s sound), the default, monitoring on / off, or off', '[list|default|loopback|<device>|monitor on|off|off]', async (args) => {
    const l = await lab();
    const w = args.trim(); const lw = w.toLowerCase();
    if (!w || lw === 'list') {
      const ds = await ThreeAudio.devices(); const cur = l.live.io().device;
      const lines = ds.map((d) => `${d.id === cur ? '● ' : '  '}${d.loopback ? '🔁' : '🎙'} ${d.label}`);
      return [`Inputs (${l.live.kind() ? `live: ${l.live.kind()}` : 'live sound is off'}; monitoring ${ThreeAudio.monitorOn() ? 'on' : 'off'}):`, `${cur ? '  ' : '● '}Default input`, ...lines, ds.some((d) => d.loopback) ? '' : '(no loopback device: /loopback says how to hear the computer\'s own sound)'].filter(Boolean).join('\n');
    }
    if (/^monitor/.test(lw)) { const on = /on|yes|1/.test(lw.split(/\s+/)[1] || '') || (!/off|no|0/.test(lw.split(/\s+/)[1] || '') && !ThreeAudio.monitorOn()); ThreeAudio.setMonitor(on); return `Monitoring ${on ? 'on: the input plays through your speakers (a mic near speakers feeds back)' : 'off'}`; }
    if (lw === 'off') { await l.live.start(null); return 'Live sound off'; }
    if (lw === 'default') return `● Live: ${await ThreeAudio.useDevice(null)}`;
    const d = await ThreeAudio.findDevice(w);
    if (!d) return /^(loopback|system|blackhole)$/.test(lw) ? `No loopback device found.\n${ThreeAudio.loopbackHowTo({ show: false })}` : `No input named "${w}" (/audio-in list)`;
    return `● Live: ${await ThreeAudio.useDevice(d)}${d.loopback ? ' (the computer\'s sound through the loopback device)' : ''}`;
  }, (a) => pick(['list', 'default', 'loopback', 'monitor on', 'monitor off', 'off'], a), { keywords: 'microphone mic interface line-in input device blackhole loopback system audio monitoring' });

  reg('loopback', 'The computer\'s own sound into the Lab: finds a loopback device (BlackHole, Loopback, VB-Cable, Stereo Mix) and uses it, or says how to set one up', '[howto]', async (args) => {
    await lab();
    const d = /howto|how/i.test(args) ? null : await ThreeAudio.findDevice('loopback');
    if (d) return `● Live: ${await ThreeAudio.useDevice(d)}: the sketch reacts to what the computer plays`;
    ThreeAudio.loopbackHowTo();
    return ThreeAudio.loopbackHowTo({ show: false });
  }, (a) => pick(['howto'], a), { aliases: ['system-audio'], keywords: 'blackhole mac system sound loopback soundflower vb-cable' });

  const FLAG = /^(attack|att|release|rel|threshold|thr|punch|curve|gam)=(.+)$/i;
  reg('react-to', 'Make a slider follow a sound: a feature (kick, snare, hats, vocals, sub…air, drop, build, loudness, brightness, key…), an amount and a curve (attack=ms release=ms threshold=0.3 punch=2 invert); no arguments lists what follows what', '<slider> <feature|off> [amount] [attack=ms] [release=ms] [threshold=x] [punch=x] [invert]', async (args) => {
    const l = await lab();
    const ws = words(String(args).replace(/\bthe\s+(?=(drums|bass|voice|vocals|kick|snare|hats)\b)/gi, 'the-')); // (round 30, stems) "the drums" is one sound
    if (!ws.length) { const r = reactions(l); return r.length ? `Following the sound:\n${r.join('\n')}` : 'No slider follows the sound yet (/react-preset pump on kick, or /react-to size kick 40)'; }
    // the feature is the first word that names one (the slider's name may be several words)
    let fi = -1; for (let i = 1; i < ws.length; i += 1) if (/^off$/i.test(ws[i]) || ThreeAudio.resolve(ws[i])) { fi = i; break; }
    if (fi < 0) return `Which sound? e.g. /react-to ${ws[0]} kick (features: /audio names)`;
    const s = await slider(ws.slice(0, fi).join(' '));
    if (/^off$/i.test(ws[fi])) { s.ctl.bind(s.key, null); return `${s.label} stays still`; }
    const band = ThreeAudio.resolve(ws[fi]);
    const prev = s.ctl.binding?.(s.key) || null;
    let amount = prev?.amount ?? 0.4; const c = { ...(prev?.c || {}) };
    for (const w of ws.slice(fi + 1)) {
      const m = FLAG.exec(w);
      if (m) { const k = m[1].toLowerCase(); const v = Number(m[2]); if (!Number.isFinite(v)) continue; if (/^att/.test(k)) c.att = Math.max(0, v); else if (/^rel/.test(k)) c.rel = Math.max(0, v); else if (/^thr/.test(k)) c.thr = Math.max(0, Math.min(0.95, v > 1 ? v / 100 : v)); else c.gam = Math.max(0.25, Math.min(4, v)); } else if (/^inv/i.test(w)) c.inv = true;
      else if (/^-?\d+(\.\d+)?%?$/.test(w)) { const v = Number(w.replace('%', '')); amount = Math.max(-1, Math.min(1, Math.abs(v) > 1 || w.endsWith('%') ? v / 100 : v)); }
    }
    s.ctl.bind(s.key, band, amount, ThreeAudioMap.compact({ thr: 0, gam: 1, inv: false, att: 0, rel: 0, ...c }));
    const b = s.ctl.binding(s.key);
    return `♪ ${s.label}${s.layer ? ` [${s.layer}]` : ''} → ${ThreeAudio.label(band)} ${Math.round(amount * 100)}%${curveText(b?.c)} · /react-curve ${s.label} to shape it · /react-to ${s.label} off`;
  }, (a) => { const ws = words(a); const end = /\s$/.test(a); if (ws.length <= 1 && !end) return pick(sliderNames(), a); return pick([...ThreeAudio.mappable(), 'off', 'attack=10', 'release=300', 'threshold=0.3', 'punch=2', 'invert', '40%'], a).map((x) => ({ value: `${end ? a.trim() : ws.slice(0, -1).join(' ')} ${x.value}`.trim(), label: x.value })); }, { aliases: ['sound-react', 'follow-sound'], undo: '/react-to <slider> off', keywords: 'audio reactive map bind slider feature curve envelope attack release threshold invert', examples: ['/react-to size kick 40%', '/react-to glow hats release=120', '/react-to zoom drop 50 attack=30 release=1500'] });

  reg('react-preset', 'A reaction preset on a slider (picked by its name, or the one you give): pump on kick, glow on hats, zoom on drops, rise through builds, shake on snare…; no arguments lists them', '<preset> [slider]', async (args) => {
    const l = await lab();
    const w = args.trim();
    if (!w) return ThreeAudioMap.PRESETS.map((p) => `**${p.name}**: ${p.hint}`).join('\n');
    // the longest preset name the words start with; the rest names the slider
    const lw = w.toLowerCase();
    let p = ThreeAudioMap.PRESETS.filter((x) => lw.startsWith(x.name.toLowerCase()) || lw.startsWith(x.id)).sort((a, b) => b.name.length - a.name.length)[0];
    let rest = p ? w.slice((lw.startsWith(p.id) ? p.id : p.name).length).trim() : '';
    if (!p) { p = ThreeAudioMap.findPreset(words(w).slice(0, 3).join(' ')) || ThreeAudioMap.findPreset(words(w)[0]); rest = ''; }
    if (!p) return `No preset "${w}". Presets: ${ThreeAudioMap.PRESETS.map((x) => x.name).join(', ')}`;
    let ctl = l.selCtl?.(); let key = null;
    if (rest) { const s = await slider(rest.replace(/^(on|to)\s+/i, '')); ctl = s.ctl; key = s.key; }
    const r = ThreeAudioMap.applyPreset(ctl, p, key);
    if (r.error) return r.error;
    return `✦ ${r.label} → ${p.name} (${ThreeAudio.label(p.band)}) · /react-curve ${r.label} to adjust · /react-to ${r.label} off`;
  }, (a) => pick(ThreeAudioMap.PRESETS.map((p) => p.name.toLowerCase()), a), { aliases: ['reaction'], keywords: 'pump kick glow hats zoom drop build shake snare presets audio reactive', examples: ['/react-preset pump on kick', '/react-preset zoom on drops camera'] });

  reg('react-curve', 'Open a slider\'s reaction curve: which sound, amount, threshold, punch, attack / release, invert (a live meter shows what the sound does)', '<slider>', async (args) => {
    const l = await lab();
    const q = args.trim();
    let s;
    if (q) s = await slider(q); else { const sel = l.selCtl?.(); const c = (sel?.controls?.() || []).find((x) => x.followsMusic) || (sel?.controls?.() || []).find((x) => x.min != null); if (!c) return 'No slider on this layer'; s = { ctl: sel, key: c.key, label: c.label }; }
    const a = s.ctl.mapping?.(s.key);
    if (!a) return 'That slider can\'t follow the sound (numbers only)';
    ThreeAudioMap.edit(a);
    return null;
  }, (a) => pick(sliderNames(), a), { aliases: ['react-edit'] });

  reg('react-off', 'Stop a slider (or all of the selected layer\'s, or every layer\'s with "everything") from following the sound', '<slider|all|everything>', async (args) => {
    const l = await lab();
    const w = args.trim().toLowerCase();
    if (w === 'all' || w === 'everything') {
      let n = 0;
      for (const L of w === 'all' ? [{ ctl: l.selCtl?.() }] : l.layers()) for (const c of L.ctl?.controls?.() || []) if (c.followsMusic) { L.ctl.bind(c.key, null); n += 1; }
      return n ? `${n} slider${n === 1 ? '' : 's'} stay still now` : 'Nothing was following the sound';
    }
    if (!w) return 'Which slider? (/react-off all for the whole layer)';
    const s = await slider(args.trim()); s.ctl.bind(s.key, null); return `${s.label} stays still`;
  }, (a) => pick(['all', 'everything', ...sliderNames()], a));

  reg('song-features', 'The song\'s whole-song audio features: the key, the drops and the builds before them (computed once in the background, kept for next time); "again" recomputes', '[again]', async (args) => {
    const l = await lab();
    if (!l.player.loaded || l.player.isClock) return 'Load a song first (🎵 in the timeline)';
    const t0 = performance.now();
    const m = await ThreeAudio.songFeatures({ again: /again/i.test(args) });
    if (!m) return 'This song has no audio to analyse';
    const f = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    return [
      `**Key**: ${m.keyName || 'not clear'}${m.keyName ? ` (${pct(m.keyConf)} sure)` : ''}`,
      `**Drops**: ${m.drops.length ? m.drops.map(f).join(', ') : 'none found'}`,
      `**Builds**: ${m.builds.length ? m.builds.map((b) => `${f(b.start)}→${f(b.end)}`).join(', ') : 'none found'}`,
      m.cached ? 'From the cache' : `Analysed in ${((m.total || performance.now() - t0) / 1000).toFixed(1)} s (kept for next time)`,
      'Sliders can follow build / drop / intensity (/react-preset zoom on drops); sketches read audio.feat.build, audio.feat.drop',
    ].join('\n');
  }, (a) => pick(['again'], a), { aliases: ['song-key'], keywords: 'key builds drops intensity analyse song features chroma' });

  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: What it hears now (audio features)', () => Commands.run('audio', ''));
    AppUI.addAction('Lab: React a slider to a sound (curve)…', () => Commands.run('react-curve', ''));
    AppUI.addAction('Lab: Reaction presets (pump on kick, zoom on drops…)', async () => { await lab(); const b = document.querySelector('.three-preview') || document.body; const r = b.getBoundingClientRect(); ThreeTweaks.menu(r.left + 20, r.top + 20, ['Reaction presets', ...ThreeAudioMap.PRESETS.map((p) => [p.name, p.hint, () => Commands.run('react-preset', p.name)])]); });
    AppUI.addAction('Lab: Live input device (mic, interface, loopback)…', async () => { await lab(); const b = document.querySelector('.three-pane [data-feature="Live sound"]') || document.body; ThreeAudio.inputMenu(b); });
    AppUI.addAction('Lab: The computer\'s sound via a loopback device', () => Commands.run('loopback', ''));
  }
})();
