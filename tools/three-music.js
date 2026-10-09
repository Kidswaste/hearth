// The Lab's music side, figuring things out so you only confirm: when a song is analysed (tools/three-music-core.js)
// the trigger preset is picked from its style and tempo (shown on Presets ▾, one click to change), and a sketch with
// sliders is offered one "✦ Make it react" that binds sensible sliders to the kick / bass / loudness (undoable).
// Live sound gets a beat-lock light next to 🎧 Live, and taps (T) while it plays set the latency offset by
// themselves. Every piece is also a chat command (area "Three.js Lab"): /analyze, /mark-kicks, /drops,
// /make-it-react, /auto-preset, /downbeat, /tap-latency, /live-status (and /live calibrate in tools/three-cmds.js).
// The Lab hands its pieces over with ThreeMusic.attach(…) (tools/three.js) once it is built.
const ThreeMusic = (() => {
  let lab = null; // { player, selCtl, layers, selectedLayer, triggers, live }
  const offered = new Set(); // songs + sketches already offered "Make it react" this session
  const noted = new Set(); // songs whose "found" note was shown this session
  let current = null; // the trigger preset in use (picked from the song, or by you)
  let guess = null; // the analysis' style pick { preset, why, conf }
  let reactUndo = null; // [{ layer, key, prev }] the bindings before the last "Make it react"

  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const fmtMs = (t) => ThreeMedia._test.fmtMs(t);

  // ---------- trigger preset from the song ----------
  function paintPresetBtn() {
    const b = lab?.triggers?.button;
    if (!b) return;
    const name = current || null;
    // short on the button (the row must not grow): "Techno / house" → "Techno", the whole name in the tooltip
    const short = name ? name.split(/ \/ | · /)[0].replace(/^◆ /, '') : '';
    const text = name ? `${short.length > 12 ? `${short.slice(0, 11)}…` : short} ▾` : 'Presets ▾';
    if (b.textContent !== text) b.textContent = text;
    b.title = name
      ? `Trigger preset: ${name}${guess && guess.preset === name ? ` (picked from the song: ${guess.why})` : ''} · click to change it, or pick from the song again`
      : 'Trigger presets for a style of music (your bars stay and are re-fitted), your own saved ones, or another song\'s setup';
  }
  // force: even when this song already has its own triggers (you asked)
  function autoPreset({ force = false, quiet = false } = {}) {
    const a = lab?.player?.analysis;
    if (!a?.style) return null;
    guess = a.style;
    if (!force && lab.triggers.songHasOwn()) { paintPresetBtn(); return null; }
    const names = lab.triggers.names();
    const pick = names.find((n) => n === guess.preset) || names.find((n) => n.toLowerCase().includes(guess.preset.toLowerCase().split(' ')[0])) || names[0];
    const before = lab.triggers.cfg();
    lab.triggers.apply(pick, { quiet: true });
    current = pick;
    paintPresetBtn();
    if (!quiet) toast(`Triggers: ${pick}, picked from the song (${guess.why})`, { timeout: 3200, action: { label: 'Undo', fn: () => { lab.triggers.restore(before); current = null; paintPresetBtn(); } } });
    return { preset: pick, why: guess.why };
  }

  // ---------- "Make it react": sensible sliders follow the kick / bass / loudness ----------
  // label words → what it follows and how far (of the slider's range); first match wins
  const RULES = [
    [/\b(kick|punch|pulse|bounce|pump|thump|beat|size|scale|zoom|radius|explo|burst|impact|pop)/i, 'kick', 0.45],
    [/\b(glow|bloom|bright|emiss|intens|exposure|flash|shine|halo|light)/i, 'bass', 0.4],
    [/\b(bass|sub|displace|height|extru|bump|amplitude|amp\b|wave|ripple)/i, 'bass', 0.4],
    [/\b(shake|jitter|glitch|chroma|aberr|rgb|split|strobe|distort)/i, 'snare', 0.4],
    [/\b(sparkle|twinkle|shimmer|flicker|grain|noise|star)/i, 'hats', 0.35],
    [/\b(speed|rotat|spin|flow|turb|swirl|drift|orbit|rate|twist|warp|motion|camera|fov)/i, 'level', 0.3],
  ];
  // values that rebuild the scene or make no sense to move with the music
  const SKIP = /\b(count|number|segments?|seed|resolution|quality|samples|steps|iterations|detail|layers?|octaves|grid|columns|rows|instances|max|min)\b/i;
  function reactPlan() {
    if (!lab) return [];
    const sel = lab.selectedLayer();
    const layers = [...lab.layers()].sort((x, y) => (y.id === sel) - (x.id === sel));
    const plan = []; const used = {};
    const room = (band) => (used[band] || 0) < (band === 'level' ? 2 : 1);
    const pool = [];
    for (const L of layers) {
      for (const c of L.ctl?.controls?.() || []) {
        if (c.min == null || c.max == null || c.step === 1 || c.options || c.followsMusic || c.live === false) continue;
        const words = `${c.label} ${c.key} ${c.group || ''}`;
        if (SKIP.test(words)) continue;
        pool.push({ L, c, words, music: /music|audio|sound|react/i.test(c.group || '') });
      }
    }
    pool.sort((x, y) => y.music - x.music);
    for (const p of pool) {
      if (plan.length >= 5) break;
      const rule = RULES.find(([re, band]) => re.test(p.words) && room(band));
      if (!rule) continue;
      used[rule[1]] = (used[rule[1]] || 0) + 1;
      plan.push({ layer: p.L.id, layerName: p.L.name, key: p.c.key, label: p.c.label, band: rule[1], amount: rule[2] });
    }
    // nothing by name: the first one or two live number sliders follow the kick and the loudness
    if (!plan.length) for (const [p, band, amount] of [[pool[0], 'kick', 0.35], [pool[1], 'level', 0.3]]) if (p) plan.push({ layer: p.L.id, layerName: p.L.name, key: p.c.key, label: p.c.label, band, amount });
    return plan;
  }
  const BAND_WORD = { kick: 'the kick', bass: 'the bass', level: 'the loudness', snare: 'the snare', hats: 'the hats', beat: 'the beat' };
  function makeItReact() {
    const plan = reactPlan();
    if (!plan.length) return { plan, text: 'No sliders to move: ask the director for a few named sliders first (tweak() values the sketch reads every frame).' };
    const ctlOf = (id) => lab.layers().find((L) => L.id === id)?.ctl;
    reactUndo = plan.map((p) => ({ layer: p.layer, key: p.key, prev: ctlOf(p.layer)?.controls().find((c) => c.key === p.key)?.followsMusic || null }));
    for (const p of plan) ctlOf(p.layer)?.bind(p.key, p.band, p.amount);
    const text = plan.map((p) => `${p.label} → ${BAND_WORD[p.band] || p.band}`).join(' · ');
    return { plan, text };
  }
  function undoReact() {
    if (!reactUndo) return false;
    const ctlOf = (id) => lab.layers().find((L) => L.id === id)?.ctl;
    for (const u of reactUndo) ctlOf(u.layer)?.bind(u.key, u.prev?.band || null, u.prev?.amount ?? 0.5);
    reactUndo = null;
    return true;
  }
  const anyFollows = () => lab.layers().some((L) => (L.ctl?.controls?.() || []).some((c) => c.followsMusic));
  function reactToast(r) {
    toast(`✦ ${r.text}`, { timeout: 5000, action: { label: 'Undo', fn: () => undoReact() } });
  }

  // ---------- a song was analysed: pick the triggers, say what was found, offer "Make it react" ----------
  function onAnalysis(a) {
    const picked = autoPreset({ quiet: true });
    const p = lab.player;
    const drop = a.drops?.[0];
    const parts = [`♪ ${a.bpm} BPM${a.grid?.straight ? `, bar 1 at ${fmtMs(p.downbeat ?? a.grid.anchor)}` : ' (played: the beats follow it)'}`];
    if (drop != null) parts.push(`drop at ${fmt(drop)}`);
    if (picked) parts.push(`triggers: ${picked.preset}`);
    // the sketch may still be starting: its sliders show up a moment later
    // once per song and sketch this session (switching sketches or chats reloads songs: no note every time)
    setTimeout(() => {
      const key = `${p.path}|${lab.layers().map((L) => L.id).join(',')}`;
      if (offered.has(key)) return;
      offered.add(key);
      const plan = !anyFollows() ? reactPlan() : [];
      if (!plan.length && noted.has(p.path)) return;
      noted.add(p.path);
      toast(parts.join(' · '), plan.length ? { timeout: 9000, action: { label: '✦ Make it react', fn: () => reactToast(makeItReact()) } } : { timeout: 4000 });
    }, 1200);
  }

  // ---------- live sound: the beat-lock light and the latency from your taps ----------
  let live = null; // the last tempo message { bpm, locked, lock, period, beatAt }
  let dot = null; let dotAnim = null; let dotKey = '';
  function liveTempo(msg) {
    live = msg;
    const btn = lab?.live?.button;
    if (!btn) return;
    if (!dot) { dot = el('span', { class: 'live-lock', title: '' }); btn.after(dot); }
    dot.hidden = !msg;
    if (!msg) { dotAnim?.cancel(); dotAnim = null; dotKey = ''; return; }
    dot.classList.toggle('locked', Boolean(msg.locked));
    dot.title = msg.locked ? `Beat locked: ${msg.bpm} BPM (${Math.round((msg.lock || 0) * 100)}%) · tap T on the beat you hear to line up the latency` : `Listening for the beat${msg.bpm ? ` (about ${msg.bpm} BPM?)` : ''}`;
    // the light pulses on the beat it hears, on the compositor: restarted only when the tempo or phase moves
    if (!msg.locked || !(msg.period > 0.2)) { dotAnim?.cancel(); dotAnim = null; dotKey = ''; return; }
    const P = msg.period * 1000;
    const nowEpoch = performance.timeOrigin + (document.timeline.currentTime ?? performance.now());
    const phase = ((((nowEpoch - msg.beatAt) % P) + P) % P);
    const key = `${Math.round(P * 10)}`;
    if (dotAnim && dotKey === key) {
      const at = ((dotAnim.currentTime ?? 0) % P + P) % P;
      if (Math.min(Math.abs(at - phase), P - Math.abs(at - phase)) < 15) return;
    }
    dotAnim?.cancel();
    dotAnim = dot.animate([{ opacity: 1, transform: 'scale(1.35)' }, { opacity: 0.35, transform: 'scale(1)', offset: 0.45 }, { opacity: 0.35, transform: 'scale(1)' }], { duration: P, iterations: Infinity, easing: 'ease-out' });
    dotAnim.startTime = (document.timeline.currentTime ?? performance.now()) - phase;
    dotKey = key;
  }
  let liveTaps = [];
  // T while live sound runs: tap on the beat you hear; after 8 steady taps the latency offset moves so the sketch's
  // beat lands where you hear it (a speaker or Bluetooth delay), minus your own tap delay learned on songs
  function liveTap() {
    const t = performance.timeOrigin + performance.now();
    if (liveTaps.length && t - liveTaps[liveTaps.length - 1] > 2000) liveTaps = [];
    liveTaps.push(t);
    if (liveTaps.length < 8) { toast(`Tap on the beat you hear: ${'•'.repeat(liveTaps.length)}${'·'.repeat(8 - liveTaps.length)}`, { timeout: 900 }); return { taps: liveTaps.length }; }
    const res = calibrate(liveTaps, live, lab.live.io().latency || 0, lab.player.tapLatency?.ms || 0);
    liveTaps = [];
    if (!res.ok) { toast(res.why, { timeout: 3500 }); return res; }
    if (res.latency !== res.before) {
      lab.live.setIo({ latency: res.latency });
      toast(`Live latency ${res.before} → ${res.latency} ms, from your taps (the sketch now hits when you hear it)`, { timeout: 4500, action: { label: 'Undo', fn: () => lab.live.setIo({ latency: res.before }) } });
    } else toast(`Your taps land on the beat: latency stays at ${res.latency} ms`, { timeout: 2500 });
    return res;
  }
  // taps (ms, wall clock) against the live beat clock → the latency (ms) that lines them up. Pure, for the tests.
  function calibrate(taps, beat, before, tapDelay = 0) {
    if (!beat?.locked || !(beat.period > 0)) return { ok: false, why: 'The beat isn\'t locked yet: let it play a few seconds (the light next to 🎧 Live pulses when it is)' };
    const gaps = taps.slice(1).map((x, i) => x - taps[i]).sort((a, b) => a - b);
    const tapP = gaps[gaps.length >> 1]; const P = beat.period * 1000;
    const ratio = tapP / P;
    if (![1, 2, 0.5].some((k) => Math.abs(ratio / k - 1) < 0.06)) return { ok: false, why: `Your taps (${Math.round(60000 / tapP)} BPM) don't match the beat it hears (${beat.bpm} BPM): tap along with the kick` };
    let cx = 0; let cy = 0;
    for (const x of taps) { const a = ((((x - beat.beatAt) % P) + P) % P) / P * 2 * Math.PI; cx += Math.cos(a); cy += Math.sin(a); }
    const agree = Math.hypot(cx, cy) / taps.length;
    if (agree < 0.7) return { ok: false, why: 'Your taps were uneven: tap 8 times right on the kick you hear' };
    const off = (Math.atan2(cy, cx) / (2 * Math.PI)) * P - tapDelay; // + you hear it later than the sketch's beat
    const latency = Math.max(0, Math.min(300, Math.round((before + off) / 5) * 5));
    return { ok: true, before, latency, offset: Math.round(off), agree: Math.round(agree * 100) / 100 };
  }

  function attach(o) {
    lab = o;
    current = null; guess = null;
    lab.player.on('analysis', (a) => { try { onAnalysis(a); } catch (err) { console.error(err); } });
    paintPresetBtn();
  }
  const need = () => { if (!lab) throw new Error('Open the Three.js Lab first'); return lab; };

  // ---------- chat commands ----------
  (() => {
    const AREA = 'Three.js Lab';
    const reg = (name, desc, args, run, complete, extra = {}) => { if (Commands.get(name)) { console.warn(`three-music: /${name} is taken`); return; } Commands.register({ name, desc, args, area: AREA, run, complete, ...extra }); };
    const pick = (list, q) => list.filter((x) => x.includes(String(q || '').toLowerCase())).map((value) => ({ value }));
    const labNow = async () => { const c = await ThreeLab.cmd(); await c.waitSong?.(); return need(); };
    const song = async () => { const l = await labNow(); if (!l.player.loaded) throw new Error('Load a song first (🎵 in the timeline, or drop one on the preview)'); for (let i = 0; i < 100 && !l.player.analysis; i += 1) await new Promise((r) => setTimeout(r, 100)); if (!l.player.analysis) throw new Error('The song has no audio to analyse'); return l; };
    const pct = (x) => `${Math.round((x || 0) * 100)}%`;
    reg('analyze', 'What the app found in the song: tempo, bar 1, sections (with how sure), drops, hits, the style pick; "again" re-runs it', '[again]', async (args) => {
      const l = await song();
      const a = /^again$/i.test(args.trim()) ? await l.player.reanalyze() : l.player.analysis;
      const g = a.grid || {};
      const on = a.onsets || {};
      return [
        `**${a.bpm} BPM** (${pct(g.tempoConf)} sure)${g.straight ? ` · bar 1 at ${fmtMs(g.anchor)} (${pct(g.downbeatConf)} sure)` : ' · played (the tempo moves): the beats follow it'} · grid: ${l.player.gridSource}`,
        a.sections?.length ? `Sections: ${a.sections.map((x) => `${x.label || x.energy} ${fmt(x.start)}${x.conf != null ? ` (${pct(x.conf)})` : ''}`).join(' · ')}` : '',
        a.drops?.length ? `Drops: ${a.drops.map(fmt).join(', ')}` : 'No drop found',
        on.kick ? `Found ${on.kick.length} kicks, ${on.snare.length} snares, ${on.hats.length} hats (/mark-kicks all writes them)` : '',
        a.style ? `Style: ${a.style.preset} (${a.style.why})${current ? ` · triggers: ${current}` : ''}` : '',
      ].filter(Boolean).join('\n');
    }, (a) => pick(['again'], a), { aliases: ['analyse', 'song-analysis'], keywords: 'tempo bpm downbeat sections drop detect' });
    reg('mark-kicks', 'Mark the hits found in the audio as markers you can edit (kicks, snares, hats or all; the loop, else the whole song)', '[kicks|snares|hats|all]', async (args) => {
      const l = await song();
      const w = String(args || 'kicks').toLowerCase().trim();
      const kind = /^all|hits?$/.test(w) ? 'all' : /^snare/.test(w) ? 'snare' : /^hat/.test(w) ? 'hats' : 'kick';
      const c = l.player.markFound(kind) || {};
      return `Marked ${Object.entries(c).map(([k, n]) => `${n} ${k === 'hats' ? 'hats' : `${k}${n === 1 ? '' : 's'}`}`).join(', ')} · drag, nudge or delete any of them · ↶ (Ctrl+Z) undoes`;
    }, (a) => pick(['kicks', 'snares', 'hats', 'all'], a), { aliases: ['mark-hits'], keywords: 'auto markers detect kick snare' });
    reg('drops', 'The drops the analysis found; jump to the next (or the Nth)', '[next|prev|N]', async (args) => {
      const l = await song();
      const d = l.player.analysis.drops || [];
      if (!d.length) return 'No drop found in this song (/analyze shows its sections)';
      const w = args.trim().toLowerCase(); const t = l.player.time;
      const to = /^\d+$/.test(w) ? d[Number(w) - 1] : w === 'prev' ? [...d].reverse().find((x) => x < t - 0.5) ?? d[0] : d.find((x) => x > t + 0.5) ?? d[0];
      if (to == null) return `Drops: ${d.map((x, i) => `${i + 1}. ${fmt(x)}`).join(' · ')}`;
      l.player.seek(to);
      return `At the drop, ${fmt(to)} (${d.length} drop${d.length === 1 ? '' : 's'}: ${d.map(fmt).join(', ')})`;
    }, (a) => pick(['next', 'prev', '1', '2'], a));
    reg('make-it-react', 'One click: sensible sliders follow the kick, bass and loudness (by their names); "undo" takes it back', '[undo]', async (args) => {
      const l = await labNow();
      if (/^undo$/i.test(args.trim())) return undoReact() ? 'The sliders follow what they followed before' : 'Nothing to undo';
      if (!l.layers().length) return 'Open a sketch first';
      const r = makeItReact();
      return r.plan.length ? `✦ ${r.text} · /make-it-react undo takes it back` : r.text;
    }, (a) => pick(['undo'], a), { aliases: ['react-music', 'auto-react'], undo: '/make-it-react undo', keywords: 'audio reactive bind sliders music follow' });
    reg('auto-preset', 'Pick the trigger preset from the song\'s style and tempo (shows why)', '', async () => {
      await song();
      const r = autoPreset({ force: true, quiet: true });
      return r ? `Triggers: **${r.preset}** (${r.why}) · Presets ▾ to change` : 'No style found';
    }, null, { keywords: 'genre style triggers preset' });
    reg('downbeat', 'Bar 1: auto (as detected), here (at the playhead) or a time', '[auto|here|<time>]', async (args) => {
      const l = await song(); const w = args.trim().toLowerCase();
      if (!w || w === 'auto') { const r = l.player.useDetectedGrid(); return r ? `Bar 1 at ${fmtMs(r.anchor)}, ${r.bpm} BPM (as detected)` : 'Not analysed yet'; }
      const t = w === 'here' ? l.player.time : ThreeMedia._test.parseTime(w);
      if (!Number.isFinite(t)) return `"${args}" isn't a time (m:ss.mmm or seconds)`;
      l.player.setGrid({ downbeat: t });
      return `Bar 1 at ${fmtMs(t)}`;
    }, (a) => pick(['auto', 'here'], a), { aliases: ['bar-one'] });
    reg('tap-latency', 'How late you tap (learned from your taps on a song); "forget" resets it', '[forget]', async (args) => {
      const l = await labNow();
      if (/^forget|reset$/i.test(args.trim())) { l.player.forgetTapLatency(); return 'Forgotten: the next taps on a song teach it again'; }
      const tl = l.player.tapLatency;
      return tl?.n ? `You tap about ${Math.abs(tl.ms)} ms ${tl.ms >= 0 ? 'late' : 'early'} (from ${tl.n} tap run${tl.n === 1 ? '' : 's'}); markers and "this tap is the 1" allow for it` : 'Not learned yet: tap along (T) 8+ times while a song plays';
    }, (a) => pick(['forget'], a));
    reg('live-status', 'Live sound: the tempo it hears, whether the beat is locked, gain and latency', '', async () => {
      const l = await labNow();
      const k = l.live.kind();
      if (!k) return 'Live sound is off (/live system or /live mic)';
      const io = l.live.io(); const ag = l.live.autoGain();
      return `● Live: ${k}${live?.bpm ? ` · ${live.bpm} BPM ${live.locked ? `locked (${pct(live.lock)})` : '(still listening)'}` : ' · listening for the beat'} · gain ${io.gain === 'auto' ? `auto${ag ? ` ×${Math.round(ag * 10) / 10}` : ''}` : `×${io.gain}`} · latency ${io.latency} ms (tap T on the beat 8 times to set it)`;
    }, null, { aliases: ['beat-lock'] });
    if (typeof AppUI !== 'undefined' && AppUI.addAction) {
      AppUI.addAction('Lab: Mark kicks for me (from the song)', () => Commands.run('mark-kicks', 'kicks'));
      AppUI.addAction('Lab: Make it react to the music', () => Commands.run('make-it-react', ''));
      AppUI.addAction('Lab: What the app found in the song', () => Commands.run('analyze', ''));
      AppUI.addAction('Lab: Jump to the next drop', () => Commands.run('drops', 'next'));
    }
  })();

  return {
    attach, autoPreset, makeItReact, undoReact, reactPlan, liveTempo, liveTap, calibrate,
    presetPicked(name) { current = name; paintPresetBtn(); },
    presetInfo: () => ({ current, guess }),
    get live() { return live; },
  };
})();
