// ▶ Play (round 52, gamemode), the hub side (lazy group "gamemode", loaded by its first use). The owner: "I have a
// three.js game (Clink) and I want it to run buttery smooth at max graphical fidelity when I take the time to load it
// up properly, instead of a window full of layers."
// One button: ▶ Play (the Lab's toolbar, a scene's right-click, Forge Debug's ⋯, Home / Projects' right-click,
// Ctrl/⌘+K "Play …", /play <game>, /game for the last one). The game opens in a window of its own (gamemodemain.js):
// full screen on the big screen, nothing of Hearth around it, its own process, max fidelity, Esc to come back.
//   A Lab scene runs as a standalone page (the Lab's player with the scene, its pictures and song: fewest moving parts),
//   its plain layers merged into ONE canvas / WebGL context (GameCore.mergePlan; the others keep their own, and the
//   stats chip and the toast say which and why). A scene that needs the Lab while it plays (camera, MIDI, live sound,
//   scenes inside it) plays live through the Stage window, full screen on the same screen.
//   An HTML / folder game build loads as it is, from its folder (hearth-game: protocol, read-only).
// While a game plays, Hearth's background work waits (powerwise's hush, like ▣ Present) and the Lab preview here rests
// (parked: no frames, no doze / adapt steps, its song paused); everything comes back when you leave.
// Coordination (tools/game-api.md): GameReady.prepare(source, onProgress) runs first when the gameready stream is in;
// GamePerf.attach(handle) gets the game when the gameperf stream is in; GameMode.on(fn) tells both start / end.
const GameMode = (() => {
  const C = GameCore;
  const KEY = 'gamemode.recent';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let now = null; // { source, info, live, at }
  let busy = false;
  const fns = new Set();
  const emit = (type, data) => { for (const fn of [...fns]) { try { fn({ type, ...data }); } catch { /* a listener */ } } };
  const recent = () => { try { return (store.get(KEY, []) || []).filter((x) => C.source(x)); } catch { return []; } };
  const last = () => recent()[0] || null;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  // the other game streams (tools/game-api.md), when they're in (a top-level const isn't on window)
  const Ready = () => (typeof GameReady !== 'undefined' ? GameReady : window.GameReady) || null;
  const Perf = () => (typeof GamePerf !== 'undefined' ? GamePerf : window.GamePerf) || null;
  const Loop = () => (typeof PlayLoop !== 'undefined' ? PlayLoop : null); // (round 53, playloop: same group, after this file)

  // ---------- a Lab scene's data (the Lab's own list when it's loaded: the newest edits) ----------
  async function sketches() { return Lab()?.scenes?.all?.() || (await window.hub.kvGet('three-sketches', [])) || []; }
  async function sceneSpec(id) {
    const all = await sketches();
    const s = all.find((x) => x.id === id);
    if (!s) throw new Error('That Lab scene is gone.');
    const layers = (s.layers?.length ? s.layers : [{ id: 'main', name: 'Layer 1', code: s.code || '' }]).map((L, i) => ({
      id: L.id || `l${i}`, code: L.code || '', name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', in: L.in ?? null, out: L.out ?? null, fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0,
      x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, slot: L.slot ?? i, z: i, keys: L.keys || null, overrides: L.overrides || null,
      ...(L.precomp ? { precomp: L.precomp } : {}), ...(L.card ? { card: L.card } : {}),
      ...Object.fromEntries(['cropT', 'cropR', 'cropB', 'cropL', 'feather', 'blur', 'mask'].filter((k) => L[k]).map((k) => [k, L[k]])),
    })).filter((L) => L.code.trim() || L.precomp || L.card);
    const refs = (((await window.hub.kvGet('three-refs', {})) || {})[s.id] || []).map((x) => ({ key: x.key, kind: x.kind, path: x.path }));
    const ex = ((await window.hub.kvGet('three-lab-extras', {})) || {})[s.id] || {};
    const cur = Lab()?.scenes?.currentId?.() === s.id;
    const player = cur ? Lab()?.present?.player : null;
    const version = store.get('three.version', typeof ThreeData !== 'undefined' ? ThreeData.VERSIONS[0] : '0.186.1');
    return { id: s.id, name: s.name || 'Lab scene', version, layers, refs, palette: s.palette || [], song: ex.media?.path ? { path: ex.media.path } : null, analysis: player?.analysis || null, values: {} };
  }

  // ---------- quiet while playing ----------
  function hold(on) {
    const P = window.Power;
    if (P?.hush && Boolean(P.quietNow?.()) !== Boolean(on)) P.hush(on, ['routines', 'hooks', 'lab-media', 'lab-stall', ...(P.timers?.() || []).map((x) => x.id).filter((id) => /^chromeview/.test(id))]);
    document.documentElement.classList.toggle('gm-playing', Boolean(on));
    dispatchEvent(new Event('hearth:view')); // (the Lab preview parks / comes back: tools/three.js syncPark)
    if (on) { try { const pl = Lab()?.present?.player; if (pl?.playing) pl.toggle?.(false); } catch { /* no Lab */ } }
  }

  // ---------- play ----------
  async function play(src, opts = {}) {
    const s = C.source(src);
    if (!s) throw new Error('Nothing to play: pick a Lab scene or an HTML game.');
    if (busy) return null;
    busy = true;
    const clickAt = performance.timeOrigin + performance.now(); // (round 56, readyspeed: ▶ Play pressed, epoch ms)
    let t = null;
    const say = (text) => { if (t?.firstChild) t.firstChild.textContent = text; else t = toast(text, { timeout: 0 }) || null; };
    try {
      let spec = null; let plan = null; let r = null;
      if (s.kind === 'lab') {
        spec = await sceneSpec(s.id);
        s.title = spec.name;
        r = C.route(spec);
        plan = C.mergePlan(spec.layers);
        spec.plan = { merge: plan.merge, why: plan.why, fast: plan.fast && !latTest().copy }; // (round 56, playlatency) fast: the one canvas swapped, not copied, each frame
      }
      // gameready (another stream): assets prepared / cached first, with progress (its group loaded first: a lazy global
      // reads as undefined until it's in) · it arms the window: the getting ready itself runs inside it, behind its card
      if (typeof Lazy !== 'undefined') await Lazy.load('gameready').catch(() => {});
      if (Ready()?.prepare) {
        say(`Getting ${s.title} ready…`);
        await Ready().prepare(s, (p) => say(`Getting ${s.title} ready… ${Math.round((Number(p?.done ?? p) || 0) * 100)} %`), { clickAt }).catch((err) => console.warn('GameReady:', err?.message || err));
      }
      store.set(KEY, C.remember(recent(), s));
      hold(true);
      let info;
      if (r?.route === 'live') info = await playLive(s, r, opts);
      else info = await window.hub.game.play({ source: s, scene: spec, display: opts.display ?? Loop()?.display?.() ?? store.get('gamemode.display', null), macFullscreen: store.get('gamemode.macFullscreen', 'native'), input: inputPrefs(), stream: streamTest(), look: lookPref(), audio: { off: store.get('gameaudio.off', false) === true } }); // (round 54, gameaudio: gameaudio.off leaves a game's sound as it is: a check's "before")
      now = { source: s, info, live: r?.route === 'live', at: Date.now(), plan };
      const own = plan ? Object.entries(plan.why).filter(([, w]) => w !== 'hidden') : [];
      if (own.length) {
        const names = Object.fromEntries((spec?.layers || []).map((L) => [L.id, L.name || L.id]));
        toast(`${plan.merge.length} layers on one canvas; ${own.map(([id, w]) => `“${names[id]}” keeps its own (${w})`).join(' · ')}`, { timeout: 7000 });
      }
      Perf()?.attach?.({ exec: async (expr) => { const r = await window.hub.game.eval(expr); if (r?.error) throw new Error(r.error); return r?.value; } }, { label: s.title, kind: s.kind, source: s, hz: info?.hz, key: false })?.catch?.((err) => console.warn('GamePerf:', err?.message || err)); // (the game window's own page, measured through game:eval; (round 56, playlatency) key: false — F is read main-side since round 53, so the probe adds no keydown listener to an HTML game)
      emit('start', { source: s, info });
      return info;
    } catch (err) {
      hold(false);
      throw err;
    } finally { busy = false; t?.remove?.(); }
  }
  // (round 53, gameinput) the game window's input: the low-latency canvas (off unless /game lowlatency on: it can tear)
  // (round 54, gamestream) loads during play are smoothed in the window; a check's "before" turns it off (localStorage
  // gamestream.test = { off: true }: not a setting)
  const streamTest = () => { try { return { off: Boolean(JSON.parse(localStorage.getItem('gamestream.test') || 'null')?.off) }; } catch { return { off: false }; } };
  const inputPrefs = () => ({ lowLatency: store.get('gamemode.lowLatency', false) === true });
  // (round 56, playlatency) a check's "before": localStorage playlatency.test = { copy: true } keeps the one canvas's per-frame copy (not a setting)
  const latTest = () => { try { return JSON.parse(localStorage.getItem('playlatency.test') || 'null') || {}; } catch { return {}; } };
  // the Lab drives it: the Stage window, full screen on the game's screen (the Lab's own controls keep working)
  async function playLive(s, r, opts) {
    const L = Lab();
    if (!L) throw new Error('The Lab isn\'t loaded.');
    activate('tool:three');
    for (let i = 0; i < 60 && !L.scenes; i += 1) await sleep(100);
    L.scenes?.open?.(s.id);
    await sleep(300);
    L.stageHooks?.setStage(true);
    await sleep(600);
    const shown = await window.hub.stagePlace({ display: opts.display ?? store.get('gamemode.display', null) ?? 'other', fullscreen: true }).catch(() => null);
    toast(`${s.title} plays live through the Lab (${r.why}): its Stage window is full screen. Close it to come back.`, { timeout: 6000 });
    return { playing: true, route: 'live', how: `live from the Lab (${r.why})`, title: s.title, display: shown };
  }
  function leave({ quiet = false } = {}) {
    if (now && quiet) now.quiet = true; // (round 53, playloop: a rebuild for new pictures plays it again at once: no "Back from")
    if (now?.live) { Lab()?.stageHooks?.setStage(false); ended({ why: 'asked' }); return true; }
    window.hub.game.leave().catch(() => {});
    return true;
  }
  function ended(d = {}) {
    if (!now) return;
    const s = now.source; const quiet = Boolean(now.quiet); now = null;
    hold(false);
    emit('end', { source: s, why: d.why, secs: d.secs });
    if (!quiet) toast(`Back from ${s.title}`, { timeout: 5000, action: { label: '▶ Play again', fn: () => play(s).catch(fail) } });
  }
  const fail = (err) => toast(window.calmError ? calmError(err) : String(err?.message || err), { type: 'error', raw: err });
  window.hub.game?.onLeft?.((d) => ended(d || {}));
  // the live route ends when its Stage window closes
  addEventListener('hearth:stage-closed', () => { if (now?.live) ended({ why: 'closed' }); });
  // (round 53, playloop) the game window rests (hidden, kept) while you edit: Hearth's background work and the Lab preview
  // come back; waking it holds them again
  function rest(on) { if (!now || now.live || Boolean(now.resting) === Boolean(on)) return; now.resting = Boolean(on); hold(!on); }
  function state() { return { playing: Boolean(now), resting: Boolean(now?.resting), source: now?.source || null, info: now?.info || null, live: Boolean(now?.live), plan: now?.plan || null, last: last(), recent: recent() }; }

  // ---------- "Play …": what a name means ----------
  async function resolve(arg = '') {
    const a = String(arg || '').trim();
    if (!a) {
      const cur = Lab()?.scenes?.currentId?.();
      if (cur && H.activeId === 'tool:three') { const sk = Lab().scenes.get(cur); return { kind: 'lab', id: cur, title: sk?.name }; }
      return last();
    }
    if (/^(last|again|latest)$/i.test(a)) return last();
    if (/[\\/]/.test(a) || /\.html?$/i.test(a)) return C.source({ kind: 'html', path: a.replace(/^["']|["']$/g, '') });
    const low = a.toLowerCase();
    const all = await sketches();
    const sk = all.find((x) => x.id === a) || all.find((x) => (x.name || '').toLowerCase() === low) || all.find((x) => (x.name || '').toLowerCase().includes(low));
    if (sk) return { kind: 'lab', id: sk.id, title: sk.name };
    return recent().find((x) => (x.title || '').toLowerCase().includes(low)) || null;
  }
  async function pickHtml() {
    const files = await window.hub.openDialog({ title: 'Play an HTML game', filters: [{ name: 'Web game', extensions: ['html', 'htm'] }] }).catch(() => []);
    return files?.[0] ? C.source({ kind: 'html', path: files[0] }) : null;
  }
  // a short menu: the last games, the scene open in the Lab, an HTML game, the screen to play on
  async function menuItems() {
    const items = recent().map((x) => ({ label: `▶ Play ${x.title}`, hint: x.kind === 'lab' ? 'Lab scene' : 'HTML game', action: () => play(x).catch(fail) }));
    const cur = Lab()?.scenes?.currentId?.();
    if (cur && !recent().some((x) => x.kind === 'lab' && x.id === cur)) { const sk = Lab().scenes.get(cur); items.push({ label: `▶ Play ${sk?.name || 'this scene'}`, hint: 'the Lab scene open now', action: () => play({ kind: 'lab', id: cur, title: sk?.name }).catch(fail) }); }
    items.push({ label: 'Play an HTML game…', action: async () => { const s = await pickHtml(); if (s) play(s).catch(fail); } });
    const ds = await window.hub.game.displays().catch(() => []);
    if (ds.length > 1) {
      const want = store.get('gamemode.display', null);
      const pick = C.pickDisplay(ds, want);
      items.push('-', { label: 'Play on', items: () => ds.map((d) => ({ label: `${d.label} · ${d.w}×${d.h} · ${C.hzLabel(d.hz)}`, checked: d.id === pick?.id, action: () => store.set('gamemode.display', d.id) })) });
    }
    items.push({ label: `Graphics: ${LOOK[lookPref()] || 'Best'}`, items: () => [
      { label: 'Best', hint: 'sharp textures, true colours, shadows matched to the screen', checked: lookPref() === 'best', action: () => toast(setLook('best'), { timeout: 2500 }) },
      { label: 'Balanced', hint: 'sharp textures; the rest as the game sets it', checked: lookPref() === 'balanced', action: () => toast(setLook('balanced'), { timeout: 2500 }) },
    ] });
    return [...(Loop()?.menuItems?.(ds) || []), ...items]; // (round 53, playloop: Back to the game, Play from here, Side by side)
  }
  async function menu(x, y) { showMenu(x, y, await menuItems()); }
  // (round 54, gamelook) one choice: Best (the default: sharp textures, true colours, shadows matched to the screen,
  // their size chosen while getting ready so they fit the refresh: round 56) or Balanced (sharp textures; the rest as the game sets it)
  const LOOK = { best: 'Best', balanced: 'Balanced' };
  const lookPref = () => C.look(store.get('gamemode.look', 'best'));
  function setLook(v) {
    store.set('gamemode.look', C.look(v));
    return `Graphics: ${LOOK[lookPref()] || lookPref()} from the next game${now ? ' (▶ Play again to see it now)' : ''}.`;
  }
  // (round 56, shadowready) the Best look's shadow size: chosen under Getting ready's card, remembered per game
  // (playbudgetmain.js); /game look shadows says it, /game look shadows reset chooses again at the next ▶ Play
  async function shadows(reset) {
    const s = now?.source || last();
    if (!s) return 'No game yet: ▶ Play one first.';
    if (reset) { const r = await window.hub.game.budget({ op: 'shadow-reset', source: s }).catch(() => null); return r?.reset ? `${s.title}: the shadow size is chosen again while getting ready at the next ▶ Play.` : `${s.title}: no shadow size remembered (it's chosen while getting ready).`; }
    const kept = await window.hub.game.budget({ source: s }).catch(() => null);
    let line = '';
    if (now && !now.live) { try { const v = (await window.hub.game.eval('window.__gameLook ? JSON.stringify(window.__gameLook.report().shadows) : ""'))?.value; const r = v ? JSON.parse(v) : null; const t = (await window.hub.game.eval('window.__gameLook ? window.__gameLook.text() : ""'))?.value || ''; const m = /(Shadows: [^·]+|shadows as the game sets them)/.exec(t); line = m ? `Now: ${m[1].trim()}` : (r ? 'Now: the game sets its own shadow sizes' : ''); } catch { line = ''; } }
    const k = kept?.shadow;
    return [line, k ? `Remembered for ${s.title}: ${k.size} at ${k.hz} Hz (chosen while getting ready) · /game look shadows reset chooses again` : `${s.title}: no shadow size remembered yet (Best chooses it while getting ready)`].filter(Boolean).join('\n');
  }

  // (round 55, playbudget) the helpers Hearth runs in the game window, as plain words (tools/playbudget-page.js measures
  // them there; playbudgetmain.js keeps, per game, the ones that were slowing it)
  async function helpers(on) {
    const s = now?.source || last();
    if (!s) return 'No game yet: ▶ Play one first.';
    if (on) { await window.hub.game.budget({ op: 'reset', source: s }).catch(() => null); return `${s.title}: Hearth's helpers are back on from the next ▶ Play (they're still watched: one that slows it goes again).`; }
    const kept = await window.hub.game.budget({ source: s }).catch(() => null);
    let p = null;
    if (now && !now.live) { try { const v = (await window.hub.game.eval('window.__hearthBudget ? window.__hearthBudget.pub() : ""'))?.value; p = v ? JSON.parse(v) : null; } catch { p = null; } }
    const lines = [];
    if (p) lines.push(`${p.line} a frame now (Hearth's budget: ${p.budgetMs} ms, 2 % of a frame at ${p.hz} Hz) · ${Object.values(p.helpers).map((h) => `${h.name} ${h.on ? `${(h.avg ?? h.ms).toFixed(3)} ms` : 'off'}`).join(' · ')}`);
    if (p?.note) lines.push(p.note);
    if (kept?.off?.length) lines.push(`${s.title} plays without: ${kept.off.map((id) => ({ look: 'the look', stream: 'loads during play', audio: 'the sound warm-up', ready: 'getting ready', perf: 'the performance probe' }[id] || id)).join(', ')} (they were slowing it) · /game helpers on tries them again`);
    return lines.length ? lines.join('\n') : `${s.title}: Hearth's helpers are all on (each watched while it plays: 2 % of a frame at most).`;
  }

  // ---------- commands ----------
  // /play shares its name: plain /play still plays the Lab's song (and the board's clips); /play <a game> plays it
  Commands.register({
    name: 'play', area: 'Lab', args: '<game | last>', desc: 'Play a game full screen in its own window (a Lab scene or an HTML build)', whenLabel: 'with a game\'s name',
    when: (_ctx, args) => Boolean(String(args || '').trim()),
    examples: ['/play Clink', '/play last', '/play ~/Games/clink/index.html'], keywords: 'game mode fullscreen smooth max quality clink',
    complete: () => recent().map((x) => ({ value: x.title, hint: x.kind === 'lab' ? 'Lab scene' : 'HTML game' })),
    run: async (args) => {
      const s = await resolve(args);
      if (!s) return `No game called “${String(args).trim()}”: a Lab scene's name, “last”, or an HTML file's path.`;
      const info = await play(s);
      return info ? `▶ ${s.title} is playing (${info.how || 'its own window'}). Esc there: “Back to Hearth”.` : null;
    },
  });
  Commands.register({
    name: 'game', area: 'Lab', args: '[stop | screens | input | latency | lowlatency on|off | look best|balanced | look shadows [reset] | helpers [on] | ready]', desc: 'Play the last game again (or the Lab scene open now); stop leaves it; ready: how long getting ready took, step by step',
    examples: ['/game', '/game stop', '/game screens', '/game input', '/game latency', '/game look balanced', '/game helpers', '/game ready'], keywords: 'play clink game mode raw mouse input latency lag delay responsive helpers overhead budget ready loading time',
    complete: () => ['stop', 'screens', 'input', 'latency', 'lowlatency on', 'lowlatency off', 'look best', 'look balanced', 'look shadows', 'look shadows reset', 'helpers', 'helpers on', 'ready'].map((v) => ({ value: v })),
    run: async (args) => {
      const a = String(args || '').trim();
      if (/^(stop|leave|quit|off)$/i.test(a)) { if (!now) return 'No game is playing.'; leave(); return null; }
      // (round 53, gameinput) the game window's input
      const m = a.match(/^low-?latency\s+(on|off)$/i);
      if (m) { const on = /on/i.test(m[1]); store.set('gamemode.lowLatency', on); return on ? 'Low-latency canvas on from the next game (a frame sooner on screen where the system supports it; it can tear: /game lowlatency off).' : 'Low-latency canvas off (the default).'; }
      // (round 54, gamelook) the look: /game look → what it is and what the game playing got; /game look best|balanced
      const ls = a.match(/^(?:look|graphics)\s+shadows?(?:\s+(reset|forget|again))?$/i); // (round 56, shadowready)
      if (ls) return shadows(Boolean(ls[1]));
      const lk = a.match(/^(?:look|graphics)(?:\s+(best|balanced))?$/i);
      if (lk) {
        if (lk[1]) return setLook(lk[1].toLowerCase());
        const t = now && !now.live ? (await window.hub.game.eval('window.__gameLook ? window.__gameLook.text() : ""').catch(() => null))?.value : '';
        return `Graphics: ${LOOK[lookPref()]} (/game look best | balanced)${t ? `\nNow: ${t}` : ''}`;
      }
      // (round 55, playbudget) Hearth's own work in the game window: what it costs a frame now, which helpers this game
      // plays without (they were slowing it), and /game helpers on to try them again from the next ▶ Play
      const hp = a.match(/^helpers(?:\s+(on|reset))?$/i);
      if (hp) return helpers(Boolean(hp[1]));
      // (round 56, readyspeed) how long the last game took from ▶ Play to its first frame of play, step by step
      if (/^ready$/i.test(a)) { if (typeof Lazy !== 'undefined') await Lazy.load('gameready').catch(() => {}); return Ready()?.speedText?.() || 'Getting ready isn\'t loaded in this Hearth.'; }
      // (round 56, playlatency) 2 s of tiny input (F24, the mouse 1 px and back) timed to the game's next frame, and
      // Hearth's part of it (its main process, the window's key handler): playlatencymain.js
      if (/^(latency|lag|delay)$/i.test(a)) {
        if (!now || now.live) return 'No game is playing in ▶ Play: start one, then /game latency.';
        const r = await window.hub.game.latency({ ms: 2000 }).catch((err) => ({ error: err?.message || String(err) }));
        return r?.error ? `Couldn't measure: ${r.error}` : `${now.source.title} — ${r.text}`;
      }
      if (/^input$/i.test(a)) {
        const p = inputPrefs(); const i = now && !now.live ? (await window.hub.game.state().catch(() => null))?.input : null;
        return [`Raw mouse: asked when the game captures it · low-latency canvas: ${p.lowLatency ? 'on' : 'off'} · keys held for the game: ${i?.keys?.held || (/Mac/i.test(navigator.platform) ? 'every ⌘ shortcut' : 'Alt+Space')}`, i?.focus ? `Focus on open: ${i.focus.ok ? 'yes' : 'not confirmed'} (${i.focus.ms} ms)` : ''].filter(Boolean).join('\n');
      }
      if (/^screens?$/i.test(a)) {
        const ds = await window.hub.game.displays();
        const p = C.pickDisplay(ds, store.get('gamemode.display', null));
        return ds.map((d) => `${d.id === p?.id ? '▶ ' : ''}${d.label}: ${d.w}×${d.h}, ${C.hzLabel(d.hz)}${d.hub ? ' (Hearth is here)' : ''}`).join('\n');
      }
      const s = await resolve(a);
      if (!s) return 'No game yet: ▶ Play a Lab scene (the Lab\'s toolbar) or /play <an HTML file>.';
      await play(s);
      return null;
    },
  });
  try {
    AppUI.addAction?.('▶ Play the last game', () => resolve('').then((s) => (s ? play(s) : toast('No game yet: ▶ Play a Lab scene first'))).catch(fail));
    AppUI.addAction?.('▶ Play an HTML game…', () => pickHtml().then((s) => s && play(s)).catch(fail));
    // the recent games by name ("Play Clink"), once this group is in
    for (const x of recent()) AppUI.addAction?.(`▶ Play ${x.title}`, () => play(x).catch(fail));
  } catch { /* no palette */ }

  return { play, leave, rest, state, resolve, menu, menuItems, recent, last, sceneSpec, on: (fn) => { fns.add(fn); return () => fns.delete(fn); }, get playing() { return Boolean(now); } };
})();
