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
    let t = null;
    const say = (text) => { if (t?.firstChild) t.firstChild.textContent = text; else t = toast(text, { timeout: 0 }) || null; };
    try {
      let spec = null; let plan = null; let r = null;
      if (s.kind === 'lab') {
        spec = await sceneSpec(s.id);
        s.title = spec.name;
        r = C.route(spec);
        plan = C.mergePlan(spec.layers);
        spec.plan = { merge: plan.merge, why: plan.why };
      }
      // gameready (another stream): assets prepared / cached first, with progress (its group loaded first: a lazy global
      // reads as undefined until it's in) · it arms the window: the getting ready itself runs inside it, behind its card
      if (typeof Lazy !== 'undefined') await Lazy.load('gameready').catch(() => {});
      if (Ready()?.prepare) {
        say(`Getting ${s.title} ready…`);
        await Ready().prepare(s, (p) => say(`Getting ${s.title} ready… ${Math.round((Number(p?.done ?? p) || 0) * 100)} %`)).catch((err) => console.warn('GameReady:', err?.message || err));
      }
      store.set(KEY, C.remember(recent(), s));
      hold(true);
      let info;
      if (r?.route === 'live') info = await playLive(s, r, opts);
      else info = await window.hub.game.play({ source: s, scene: spec, display: opts.display ?? Loop()?.display?.() ?? store.get('gamemode.display', null), macFullscreen: store.get('gamemode.macFullscreen', 'native'), input: inputPrefs(), audio: { off: store.get('gameaudio.off', false) === true } }); // (round 54, gameaudio: gameaudio.off leaves a game's sound as it is: a check's "before")
      now = { source: s, info, live: r?.route === 'live', at: Date.now(), plan };
      const own = plan ? Object.entries(plan.why).filter(([, w]) => w !== 'hidden') : [];
      if (own.length) {
        const names = Object.fromEntries((spec?.layers || []).map((L) => [L.id, L.name || L.id]));
        toast(`${plan.merge.length} layers on one canvas; ${own.map(([id, w]) => `“${names[id]}” keeps its own (${w})`).join(' · ')}`, { timeout: 7000 });
      }
      Perf()?.attach?.({ exec: async (expr) => { const r = await window.hub.game.eval(expr); if (r?.error) throw new Error(r.error); return r?.value; } }, { label: s.title, kind: s.kind, source: s, hz: info?.hz })?.catch?.((err) => console.warn('GamePerf:', err?.message || err)); // (the game window's own page, measured through game:eval)
      emit('start', { source: s, info });
      return info;
    } catch (err) {
      hold(false);
      throw err;
    } finally { busy = false; t?.remove?.(); }
  }
  // (round 53, gameinput) the game window's input: the low-latency canvas (off unless /game lowlatency on: it can tear)
  const inputPrefs = () => ({ lowLatency: store.get('gamemode.lowLatency', false) === true });
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
    return [...(Loop()?.menuItems?.(ds) || []), ...items]; // (round 53, playloop: Back to the game, Play from here, Side by side)
  }
  async function menu(x, y) { showMenu(x, y, await menuItems()); }

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
    name: 'game', area: 'Lab', args: '[stop | screens | input | lowlatency on|off]', desc: 'Play the last game again (or the Lab scene open now); stop leaves it',
    examples: ['/game', '/game stop', '/game screens', '/game input'], keywords: 'play clink game mode raw mouse input latency',
    complete: () => ['stop', 'screens', 'input', 'lowlatency on', 'lowlatency off'].map((v) => ({ value: v })),
    run: async (args) => {
      const a = String(args || '').trim();
      if (/^(stop|leave|quit|off)$/i.test(a)) { if (!now) return 'No game is playing.'; leave(); return null; }
      // (round 53, gameinput) the game window's input
      const m = a.match(/^low-?latency\s+(on|off)$/i);
      if (m) { const on = /on/i.test(m[1]); store.set('gamemode.lowLatency', on); return on ? 'Low-latency canvas on from the next game (a frame sooner on screen where the system supports it; it can tear: /game lowlatency off).' : 'Low-latency canvas off (the default).'; }
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
