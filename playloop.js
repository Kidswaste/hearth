// ▶ Play's edit → play → edit loop (round 53, playloop), the hub side (lazy group "gamemode", after gamemode.js). The
// owner works on Clink in the Lab with the Three Director, then plays it in ▶ Play: going back and forth is fast now.
//   Live edits   while a game window is open (playing or resting), a change to its scene (yours or the director's)
//                goes into the running game: a layer whose code changed is swapped in place (hot reload of that layer;
//                the others and the game go on; a layer that exports saveState() / restoreState(s) keeps its state:
//                tools/three-sandbox.html "live edits keep the game's state"); a layer added / removed / moved, or a
//                change of what shares the one canvas, runs the layers again in the same page (three.js, its shaders and
//                pictures stay; the states are handed over); only new pictures / a new song build the page again (the
//                game window comes back with "Getting ready", the states handed over). A small "↻ Updated" shows over
//                the game, nothing more.
//   Ctrl/⌘+P     in the Lab: ▶ Play the scene (or back to the game, as it was); in the game: back to editing, the game
//                kept (hidden, its frames stopped, muted). Ctrl/⌘+Shift+P: Play from here (where you last left it to edit,
//                else the scene's checkpoint(), else from the start).
//   Side by side the game full screen on another screen while you edit in the Lab on this one, with the live edits
//                (▶ Play's right-click, when there are two screens; /play-side).
//   Errors       a runtime error in the game shows one calm line over it ("Clink stopped: ReferenceError … (line 12) —
//                Fix with the director"); Fix puts the error, the layer, its line and the code around it in the docked
//                director chat as a draft (never sent).
// Nothing goes into any prompt unless you send the draft. Main side: playloopmain.js. Shapes: tools/game-api.md.
const PlayLoop = (() => {
  const KEY_SIDE = 'playloop.side';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const GM = () => GameMode;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const fail = (err) => toast(window.calmError ? calmError(err) : String(err?.message || err), { type: 'error', raw: err });
  const S = { base: null, pending: false, dirty: false, busy: false, again: false, timer: 0, saved: new Map(), stats: { hot: 0, restart: 0, rebuild: 0, kept: 0, fixes: 0 }, last: null };

  // ---------- the game window's page (game:eval) ----------
  const ev = async (code) => { const r = await window.hub.game.eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
  const post = (msg) => ev(`void window.postMessage(${JSON.stringify({ target: 'three-sandbox', ...msg })}, '*')`);
  const save = () => ev('window.__labHot ? window.__labHot.save() : null').catch(() => null);
  const restore = (states) => ev(`window.__labHot ? window.__labHot.restore(${JSON.stringify(states || {})}) : 0`).catch(() => 0);
  const blip = (text = 'Updated') => window.hub.game.loop({ op: 'blip', text }).catch(() => {});
  const labGame = () => { const st = GM().state(); return st.playing && !st.live && st.source?.kind === 'lab' ? st : null; };

  // ---------- what changed: the scene as ▶ Play runs it (GameMode.sceneSpec) ----------
  const runnable = (spec) => ({ ...spec, layers: spec.layers.filter((L) => typeof L.code === 'string' && L.code.trim()) });
  const propsOf = (L) => JSON.stringify({ ...L, code: undefined, z: undefined });
  function diff(a, b) {
    if (JSON.stringify([a.refs, a.song, a.version, a.palette]) !== JSON.stringify([b.refs, b.song, b.version, b.palette])) return { kind: 'rebuild' };
    const pa = GameCore.mergePlan(a.layers); const pb = GameCore.mergePlan(b.layers);
    const ids = (s) => s.layers.map((L) => L.id).join('|');
    if (ids(a) !== ids(b) || pa.merge.join('|') !== pb.merge.join('|')) return { kind: 'restart', plan: pb };
    const code = b.layers.filter((L, i) => L.code !== a.layers[i].code);
    const props = b.layers.filter((L, i) => L.code === a.layers[i].code && propsOf(L) !== propsOf(a.layers[i]));
    return { kind: code.length || props.length ? 'hot' : 'none', code, props };
  }
  async function baseline() {
    const st = labGame();
    S.base = st ? { id: st.source.id, spec: runnable(await GM().sceneSpec(st.source.id)) } : null;
  }

  // ---------- live edits ----------
  function changed() {
    if (!S.base) return;
    clearTimeout(S.timer);
    S.timer = setTimeout(() => sync().catch((err) => console.warn('playloop:', err?.message || err)), 120);
  }
  async function sync() {
    if (S.busy) { S.again = true; return null; }
    const st = labGame();
    if (!st || !S.base || S.base.id !== st.source.id) return null;
    S.busy = true;
    try {
      const spec = runnable(await GM().sceneSpec(st.source.id));
      const d = diff(S.base.spec, spec);
      S.last = { kind: d.kind, at: Date.now() };
      if (d.kind === 'none') return d;
      if (d.kind === 'rebuild') {
        // new pictures / a new song: the page is built again (gamemode's cache, gameready's prepared copies); resting, it
        // waits for the wake
        if (st.resting) { S.pending = true; return d; }
        await rebuild(st.source);
        return d;
      }
      const t0 = performance.now();
      if (d.kind === 'hot') {
        for (const L of d.props) await post({ type: 'layer-props', id: L.id, props: L });
        for (const L of d.code) await post({ type: 'hot-layer', layer: { ...L, fx: '' } }); // (no cross-fade picture in a game: the new code draws at once)
        S.stats.hot += 1;
      } else {
        const states = await save();
        await post({ type: 'game-plan', merge: d.plan.merge, why: d.plan.why });
        await post({ type: 'run-layers', layers: spec.layers });
        S.stats.restart += 1;
        if (states && Object.keys(states).length) await handBack(states);
      }
      S.base = { id: st.source.id, spec };
      S.last.ms = Math.round(performance.now() - t0);
      if (st.resting) S.dirty = true; else blip(d.kind === 'hot' ? 'Updated' : 'Updated · layers ran again');
      return d;
    } finally {
      S.busy = false;
      if (S.again) { S.again = false; changed(); }
    }
  }
  // states saved before the layers ran again go to the new runs once each has loaded
  async function handBack(states, ms = 8000) {
    const ids = Object.keys(states || {});
    if (!ids.length) return 0;
    const t = Date.now();
    while (Date.now() - t < ms) {
      const info = await ev('window.__labHot ? window.__labHot.info() : null').catch(() => null);
      if (info && ids.every((id) => info.hooks.includes(id))) break;
      await sleep(120);
    }
    const n = await restore(states);
    S.stats.kept += n;
    return n;
  }
  async function rebuild(source) {
    const states = await save();
    S.stats.rebuild += 1;
    S.pending = false; S.dirty = false;
    await GM().leave({ quiet: true });
    for (let i = 0; i < 80 && GM().playing; i += 1) await sleep(50);
    await GM().play(source);
    if (states && Object.keys(states).length) { await drawn(); await handBack(states); }
  }
  const drawn = async (ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev('Boolean(window.__hearthGame && window.__hearthGame.drawn)').catch(() => false)) return true; await sleep(150); } return false; };

  // ---------- back and forth ----------
  async function rest(why = 'asked') { if (!GM().playing) return null; return window.hub.game.loop({ op: 'rest', why }); }
  async function wake() {
    const st = GM().state();
    if (!st.playing) return null;
    if (S.pending && st.source?.kind === 'lab') { GM().rest(false); await rebuild(st.source); return GM().state(); }
    GM().rest(false);
    const r = await window.hub.game.loop({ op: 'wake' });
    if (S.dirty) { S.dirty = false; setTimeout(() => blip('Updated'), 250); }
    return r;
  }
  const currentScene = () => { const id = Lab()?.scenes?.currentId?.(); return id ? { kind: 'lab', id, title: Lab().scenes.get(id)?.name } : null; };
  // Ctrl/⌘+P: back to the game as it was, or ▶ Play the Lab's scene; true when it did something
  function toggle() {
    const st = GM().state();
    if (st.playing && !st.live) { wake().catch(fail); return true; }
    if (st.playing) return false;
    const s = H.activeId === 'tool:three' ? currentScene() : null;
    if (!s) return false;
    GM().play(s).catch(fail);
    return true;
  }
  // Play from here: where you last left it to edit (its saved states), else the scene's checkpoint(), else the start
  async function here() {
    let st = GM().state();
    const want = (H.activeId === 'tool:three' && currentScene()) || (st.playing && st.source) || null;
    if (!want || want.kind !== 'lab') { if (!st.playing) toast('Play from here plays a Lab scene: open it in the Lab first', { timeout: 3000 }); return null; }
    if (!st.playing || st.live || !GameCore.sameSource(st.source, want)) { await GM().play(want); await drawn(); st = GM().state(); } else if (st.resting) await wake();
    const states = S.saved.get(want.id);
    let from = 'start';
    if (states && Object.keys(states).length && (await restore(states)) > 0) from = 'saved';
    else if ((await ev('window.__labHot ? window.__labHot.checkpoint("here") : 0').catch(() => 0)) > 0) from = 'checkpoint';
    else if (st.playing) { const spec = runnable(await GM().sceneSpec(want.id)); await post({ type: 'run-layers', layers: spec.layers }); S.base = { id: want.id, spec }; }
    blip(from === 'saved' ? 'From where you left it' : from === 'checkpoint' ? 'From the checkpoint' : 'From the start');
    return from;
  }

  // ---------- side by side ----------
  const sideOn = () => Boolean(store.get(KEY_SIDE, null));
  function display() { const v = store.get(KEY_SIDE, null); return v && v.display != null ? v.display : null; }
  async function setSide(on) {
    const ds = await window.hub.game.displays().catch(() => []);
    const other = ds.find((d) => !d.hub);
    if (on && !other) { store.set(KEY_SIDE, null); toast('Side by side needs a second screen', { timeout: 3000 }); return false; }
    store.set(KEY_SIDE, on ? { display: other.id } : null);
    if (GM().playing) await window.hub.game.loop({ op: 'side', on: Boolean(on), display: on ? other.id : null }).catch(() => {});
    toast(on ? `Side by side: the game plays on ${other.label}, the Lab stays here; your edits go into it live` : 'Side by side off: the game plays on your big screen', { timeout: 3500 });
    return Boolean(on);
  }

  // ---------- Fix with the director ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function director() {
    if (directorOf()) return directorOf();
    await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'playloop', say: () => {}, note: () => {} });
    for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
    return directorOf();
  }
  async function fixText(e = {}, source = null) {
    const title = source?.title || 'The game';
    let where = ''; let code = '';
    if (source?.kind === 'lab') {
      const spec = await GM().sceneSpec(source.id).catch(() => null);
      const L = spec?.layers.find((x) => x.id === e.layer);
      if (L) {
        where = ` — layer “${L.name || L.id}”${e.line ? `, line ${e.line}` : ''}`;
        if (e.line) {
          const lines = L.code.split('\n'); const a = Math.max(1, e.line - 2); const b = Math.min(lines.length, e.line + 2);
          code = `\n\`\`\`js\n${lines.slice(a - 1, b).map((s, i) => `${a + i === e.line ? '>' : ' '}${String(a + i).padStart(3)} | ${s}`).join('\n')}\n\`\`\``;
        }
      } else if (e.line) where = ` (line ${e.line})`;
    } else where = `${e.file ? ` in ${e.file}` : ''}${e.line ? `, line ${e.line}` : ''}`;
    return `${title} stopped in ▶ Play: ${e.message || 'an error'}${where}.${code}\nPlease fix it (the game window picks up the change live).`;
  }
  async function fix(d = {}) {
    S.stats.fixes += 1;
    const text = await fixText(d.error, d.source);
    if (d.source?.kind === 'lab' && H.activeId !== 'tool:three') activate('tool:three');
    const dir = await director().catch(() => null);
    if (dir) {
      Tools.openDock?.('three');
      const there = () => [...document.querySelectorAll('.composer textarea')].some((t) => t.value === text);
      for (let i = 0; i < 14 && !there(); i += 1) { Native.setDraft?.(dir.id, text); if (!there()) await sleep(150); }
      if (there()) { toast(`In ${dir.name}'s box, not sent: press Enter when it reads right`, { timeout: 4000 }); S.lastDraft = text; return text; }
    }
    navigator.clipboard?.writeText(text).catch(() => {});
    toast('Copied the error for the director (its chat isn\'t open): paste it there', { timeout: 4000 });
    S.lastDraft = text;
    return text;
  }

  // ---------- wiring ----------
  window.hub.game?.onLoop?.((d = {}) => {
    if (d.type === 'rested' && !d.side) {
      GM().rest(true);
      const st = labGame();
      if (st) save().then((x) => { if (x && Object.keys(x).length) S.saved.set(st.source.id, x); });
    } else if (d.type === 'woke') GM().rest(false);
    else if (d.type === 'fix') fix(d).catch(fail);
    else if (d.type === 'key' && d.what === 'here') here().catch(fail);
  });
  GM().on((e) => {
    if (e.type === 'start') {
      baseline().catch(() => {});
      if (sideOn()) window.hub.game.loop({ op: 'side', on: true, display: display() }).catch(() => {});
    } else if (e.type === 'end') { S.base = null; S.pending = false; S.dirty = false; }
  });
  addEventListener('hearth:lab-ran', (e) => { if (S.base && e.detail?.id === S.base.id) changed(); });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey) || (e.key || '').toLowerCase() !== 'p') return;
    if (key(e.shiftKey)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // the key (also the lazy stand-in's, before this group is in): true when it did something
  function key(shift) {
    if (shift) { if (!GM().playing && H.activeId !== 'tool:three') return false; here().catch(fail); return true; }
    return toggle();
  }

  // ---------- menus, palette, commands, keys ----------
  function menuItems(ds = []) {
    const st = GM().state(); const items = [];
    if (st.playing && st.resting) items.push({ label: `▶ Back to ${st.source?.title || 'the game'}`, key: 'Ctrl+P', action: () => wake().catch(fail) });
    items.push({ label: '▶ Play from here', key: 'Ctrl+Shift+P', tip: 'Where you last left it to edit, the scene\'s checkpoint, or the start', action: () => here().catch(fail) });
    if (ds.length > 1) items.push({ label: `${sideOn() ? '✓ ' : ''}Side by side`, hint: 'game on the other screen, live edits', action: () => setSide(!sideOn()).catch(fail) });
    items.push('-');
    return items;
  }
  try {
    Keys.add({ area: 'Lab', keys: 'Ctrl+P', what: '▶ Play the scene; in the game: back to editing (the game kept, your edits go into it live)' });
    Keys.add({ area: 'Lab', keys: 'Ctrl+Shift+P', what: '▶ Play from here: where you left it, its checkpoint, or the start' });
  } catch { /* no keys sheet */ }
  try { AppUI.addAction?.('▶ Play from here', () => here().catch(fail), 'Ctrl+Shift+P'); } catch { /* no palette */ }
  Commands.register({
    name: 'play-here', area: 'Lab', desc: 'Play the Lab scene from where you left it to edit (or its checkpoint, or the start)',
    examples: ['/play-here'], keywords: 'game play from here checkpoint resume continue clink',
    run: async () => { const from = await here(); return from ? `▶ Playing from ${from === 'saved' ? 'where you left it' : from === 'checkpoint' ? 'the scene\'s checkpoint' : 'the start'}.` : null; },
  });
  Commands.register({
    name: 'play-side', area: 'Lab', args: '[on | off]', desc: 'Side by side: the game full screen on your other screen, the Lab here, edits live',
    examples: ['/play-side', '/play-side off'], keywords: 'game second screen monitor live edit two displays',
    complete: () => ['on', 'off'].map((v) => ({ value: v })),
    run: async (args) => { const a = String(args || '').trim().toLowerCase(); const on = a ? !/^(off|no|0)$/.test(a) : !sideOn(); const r = await setSide(on); return r === on ? null : 'Side by side needs a second screen.'; },
  });

  return { key, toggle, here, rest, wake, sync, diff, setSide, display, menuItems, fix, fixText, state: () => ({ base: S.base?.id || null, pending: S.pending, dirty: S.dirty, side: sideOn(), saved: [...S.saved.keys()], last: S.last, stats: { ...S.stats }, lastDraft: S.lastDraft || null }) };
})();
