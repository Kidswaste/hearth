// ▶ Play-test (round 53, directorgame): the Three Director plays the owner's game (Clink) in the ▶ Play window, cheaply.
// Lazy group "directorgame" (loads on the first `three_do play` or /playtest). The pure part: tools/directorgame-core.js;
// the main side (the input timed there, the picture): directorgamemain.js.
//   three_do play {game, script, secs, perf, shot, op}  ONE call: starts the game if needed (▶ Play, max fidelity, its
//     own window), plays a short input script ("hold W 2 s, jump, look left"; secs repeats it; no script: a walk-about),
//     then answers with the numbers (fps vs the screen, the worst frame, stutters, where the player went, what each
//     step did, the game's state before → after, errors with file:line, the usual fix and the line itself) and what
//     looks off. perf: true adds gameperf's findings (≈ 250 tokens); shot: true ONE small picture (384 px).
//     op: start | run | state | shot | perf | stop. Details: three_do help play (answered by the tool server, no hub).
// Safety: input goes only to the ▶ Play window (directorgamemain.js finds it by its own address), never to Hearth; the
// keys that leave the game are never sent; a game the owner started is read-only for the director (state / perf / a
// picture, no input, never closed by it); a session the director started ends when that chat's reply ends (done,
// error or stopped), or 3 minutes after its last call.
const DirectorGame = (() => {
  const C = () => DirectorGameCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const IDLE_MS = 3 * 60000;
  let sess = null; // { source, title, hz, how, chatId, ours, at, readyMs, ready }
  let idle = null;
  const stats = { runs: 0, calls: 0, chars: 0, pics: 0 };

  const gm = async () => {
    if (typeof GameMode === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('gamemode').catch(() => {});
    return typeof GameMode !== 'undefined' ? GameMode : null;
  };
  const same = (a, b) => (typeof GameCore !== 'undefined' ? GameCore.sameSource(a, b) : Boolean(a && b && a.kind === b.kind && (a.id || a.path) === (b.id || b.path)));
  const ev = async (code) => { const r = await window.hub.game.eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
  const nameOf = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9_$]/g, '');
  const inject = () => ev(`(${C().probe.toString()})(${JSON.stringify({ name: nameOf(sess?.title) })})`);
  const hint = (m) => { try { const h = typeof ThreeDirector !== 'undefined' && ThreeDirector._test?.errHint?.(m); if (h) return h; } catch { /* the Lab's own */ } return C().hint(m); };
  const arm = () => { clearTimeout(idle); idle = sess?.ours ? setTimeout(() => stop('idle'), IDLE_MS) : null; };

  // the page drawing (and GameReady's card gone, when it shows one)
  async function waitReady(ms = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        await inject();
        const o = JSON.parse(await ev('(() => { let ph = "playing"; try { const g = window.__gameReady; if (g) ph = JSON.parse(g.pub()).phase || ph; } catch (_) {} return JSON.stringify({ f: window.__dgPlay.frames(), ph }); })()'));
        if (o.f > 10 && o.ph === 'playing') return true;
      } catch { /* loading */ }
      await sleep(250);
    }
    return false;
  }

  // ---------- a session ----------
  async function start(game, ctx = {}, { perf = false } = {}) {
    const G = await gm();
    if (!G) throw new Error('▶ Play isn\'t available here.');
    const st = G.state();
    if (st.playing) {
      const want = game ? await G.resolve(game) : null;
      if (sess && same(sess.source, st.source) && (!want || same(want, st.source))) { if (sess.ours && ctx.chatId) sess.chatId = ctx.chatId; return { reused: true }; }
      if (want && !same(want, st.source)) throw new Error(`The owner is playing ${st.source?.title || 'a game'}: a play-test waits until they're back.`);
      // the owner's own game: read-only for the director
      sess = { source: st.source, title: st.source?.title, hz: st.info?.hz || null, how: st.info?.how || '', chatId: null, ours: false, at: Date.now() };
      return { reused: true };
    }
    const s = await G.resolve(game || '');
    if (!s) throw new Error(game ? `No game called “${game}”: a Lab scene's name, “last”, or an HTML file's path.` : 'Which game? game: a Lab scene\'s name, "last", or an HTML file\'s path.');
    if (perf && typeof Lazy !== 'undefined') await Lazy.load('gameperf').catch(() => {}); // (▶ Play hands it the window: measured from the first frame)
    const t0 = Date.now();
    const info = await G.play(s, perf ? { perf: true } : undefined); // (round 57: the probe in from the first frame only when perf was asked)
    if (!info) throw new Error('▶ Play is busy starting a game: try again in a moment.');
    if (info.route === 'live') { G.leave(); throw new Error(`${s.title} needs the Lab while it plays (${info.how}): play-test it in the preview with three_do input.`); }
    sess = { source: s, title: s.title || info.title, hz: info.hz || null, how: info.how || '', chatId: ctx.chatId || null, ours: true, at: Date.now() };
    sess.ready = await waitReady();
    sess.readyMs = Date.now() - t0;
    return { started: true };
  }
  function stop(why = 'asked') {
    clearTimeout(idle); idle = null;
    const s = sess; sess = null;
    if (!s?.ours) return false;
    try { window.hub.gameTest?.stop?.(); } catch { /* nothing running */ }
    try { if (typeof GameMode !== 'undefined' && GameMode.playing && same(GameMode.state().source, s.source)) GameMode.leave(); } catch { /* gone */ }
    if (why !== 'asked') console.info(`play-test of ${s.title} ended (${why})`);
    return true;
  }
  const startLine = () => `▶ ${sess.title} started (${sess.how || 'its own window'})${sess.hz ? ` · ${sess.hz} Hz` : ''} · ready in ${(sess.readyMs / 1000).toFixed(1)} s${sess.ready ? '' : ' (still loading)'}`;

  // ---------- what the director reads ----------
  async function page() {
    const had = await ev('Boolean(window.__dgPlay)');
    await inject();
    if (!had) await sleep(600); // (a fresh probe: a few frames to count first)
    return JSON.parse(await ev('window.__dgPlay.result()'));
  }
  async function contextOf(e) {
    if (!e?.url || !e.l || !/^(hearth-game|blob|https?):/.test(e.url)) return '';
    const l = Number(e.l);
    try {
      return String(await ev(`fetch(${JSON.stringify(e.url)}).then((r) => r.text()).then((t) => { const L = t.split('\\n'); return [${l - 1}, ${l}, ${l + 1}].filter((n) => n >= 1 && n <= L.length).map((n) => n + (n === ${l} ? '> ' : '| ') + L[n - 1].trim().slice(0, 100)).join('\\n'); }).catch(() => '')`) || '');
    } catch { return ''; }
  }
  async function perfText() {
    if (typeof Lazy !== 'undefined') await Lazy.load('gameperf').catch(() => {});
    if (typeof GamePerf === 'undefined') return 'perf: not available here';
    let secs = null;
    if (!GamePerf.target) { await GamePerf.attach({ exec: ev }, { label: sess.title, kind: sess.source?.kind, source: sess.source, hz: sess.hz }); secs = 3; }
    const r = await GamePerf.directorTool('three_perf', { op: 'check', fresh: true, ...(secs ? { secs } : {}) });
    const t = r.ok ? String(r.value) : `perf: ${r.error}`;
    return t.length > 1100 ? `${t.slice(0, t.lastIndexOf('\n', 1100))}\n(more: three_do perf)` : t;
  }
  async function shot() {
    const im = await window.hub.gameTest.shot({ width: 384 });
    if (!im?.data) throw new Error(im?.error || 'no picture');
    stats.pics += 1;
    return { text: `picture ${im.w}×${im.h}`, image: { data: im.data, mime: im.mime } };
  }

  // the steps of a run (checked before anything starts or is sent)
  function stepsOf(args) {
    if (!args.script) return { steps: C().explore(Number(args.secs) || 10), plan: 'walk-about' };
    const p = C().parse(args.script);
    if (p.error) throw new Error(p.error);
    return { steps: C().fill(p.steps, Number(args.secs) || 0), plan: null };
  }
  async function runScript(args, { steps, plan }) {
    if (!sess.ours) throw new Error(`The owner is playing ${sess.title}: a play-test sends no input to it (state, perf and shot still work).`);
    await inject();
    await ev(`window.__dgPlay.begin(${steps.length})`);
    const { ops } = C().timeline(steps);
    const r = await window.hub.gameTest.script({ ops });
    if (!r?.ok) throw new Error(r?.why === 'left' ? 'The game window closed during the run.' : `The run stopped: ${r?.why || 'no answer'}.`);
    await sleep(60);
    const pg = await page();
    stats.runs += 1;
    const first = (pg.errors || [])[0];
    return C().summary({ title: sess.title, hz: sess.hz, steps, page: pg, hint, context: await contextOf(first), plan, perf: Boolean(args.perf) });
  }

  // three_do play: one call does what a play-test needs
  async function tool(_tool, args = {}, ctx = {}) {
    stats.calls += 1;
    try {
      const op = String(args.op || (args.script || args.secs ? 'run' : args.shot ? 'shot' : args.perf ? 'perf' : 'state')).toLowerCase();
      if (op === 'stop') { const was = sess?.title; return { ok: true, value: stop() ? `▶ ${was} stopped.` : 'No play-test running (the owner\'s own game is never closed by it).' }; }
      if (!['start', 'run', 'state', 'shot', 'perf'].includes(op)) return { ok: false, error: 'op: start | run | state | shot | perf | stop (help play)' };
      const G = await gm();
      if (!args.game && !sess && !G?.state().playing && op !== 'run' && op !== 'start') return { ok: false, error: 'No game is playing: three_do play {game: "Clink", script: "hold W 2 s, jump"} starts it.' };
      const run = op === 'run' ? stepsOf(args) : null;
      const s0 = await start(args.game, ctx, { perf: Boolean(args.perf) || op === 'perf' });
      arm();
      const parts = [];
      if (s0.started) parts.push(startLine());
      const images = [];
      if (op === 'run') parts.push(await runScript(args, run));
      else if (op === 'state' || (op === 'start' && !args.shot)) parts.push(C().stateLine({ title: sess.title, hz: sess.hz, page: await page() }));
      if (args.perf || op === 'perf') parts.push(await perfText());
      if (args.shot || op === 'shot') { const p = await shot(); parts.push(p.text); images.push(p.image); }
      const value = parts.join('\n');
      stats.chars += value.length;
      return { ok: true, value, ...(images.length ? { images } : {}) };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    } finally { arm(); }
  }

  // ---------- ways in ----------
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_play'], tool);
  // a play-test the director started ends with its reply (done, an error or stopped)
  const hookTurn = () => { if (typeof Native !== 'undefined' && Native.hooks?.event) Native.hooks.event.push((event, chat) => { if (sess?.ours && sess.chatId && chat?.id === sess.chatId) stop('the reply ended'); }); };
  hookTurn();
  (async () => { const G = await gm(); G?.on?.((e) => { if (e.type === 'end' && sess && same(e.source, sess.source)) { clearTimeout(idle); sess = null; } }); })();

  // the owner's own: /playtest [game] [script | 30s] — the same run, its summary in the chat, no tokens
  if (typeof Commands !== 'undefined' && !Commands.get?.('playtest')) {
    Commands.register({
      name: 'playtest', aliases: ['play-test'], area: 'Lab', args: '[game] [script | 30s | stop | notes | clear | note <n> | fix <n> | key <F8> | hitchmap [on | off | jump <n> | fix <n>]]',
      desc: 'Play-test a game in ▶ Play with a short input script ("hold W 2 s, jump, look left"), then read the numbers: fps, stutters, where the player went, each step, state, errors with their line. No tokens. notes: your F8 playtest notes (clear, note <n> jumps there, fix <n> drafts it for the director). hitchmap on: record where it stutters (frame time over the play area), the map after the session.',
      keywords: 'play test playtest clink game input script fps stutter errors director notes log f8 screenshot bug hitch hitches map heatmap where 240',
      examples: ['/playtest Clink hold W 2 s, jump, look left', '/playtest Clink 30s', '/playtest stop', '/playtest notes', '/playtest fix 2', '/playtest clear', '/playtest hitchmap on', '/playtest hitchmap'],
      complete: () => ['notes', 'clear', 'note 1', 'fix 1', 'key F8', 'stop', '30s', 'hitchmap on', 'hitchmap off', 'hitchmap'].map((v) => ({ value: v })),
      async run(argText) {
        const a = String(argText || '').trim();
        // (round 62, playnotes62) the playtest notes (F8 in ▶ Play): the log, a jump, a draft for the director, clear, the key
        if (/^(notes?|log|clear|fix|jump|key)\b/i.test(a) && typeof PlayNotes !== 'undefined') return PlayNotes.command(a);
        // (round 63, hitchmap63) the hitch map: on / off, the map, a spot's jump / director draft, clear
        if (/^hitch/i.test(a) && typeof HitchMap !== 'undefined') return HitchMap.command(a);
        if (/^(stop|leave|off)$/i.test(a)) return stop() ? 'Play-test stopped.' : 'No play-test running.';
        let game = ''; let script = a; let secs = 0;
        if (a && !/^\d+(\.\d+)?\s*(s|secs?|seconds?)$/i.test(a) && C().parse(a).error) { const m = a.match(/^(\S+)\s*(.*)$/); game = m[1]; script = m[2]; }
        const d = script.match(/^(\d+(?:\.\d+)?)\s*(?:s|secs?|seconds?)$/i);
        if (d) { secs = Number(d[1]); script = ''; }
        const r = await tool('three_play', { op: 'run', game: game || undefined, script: script || undefined, secs: secs || (script ? 0 : 10) }, {});
        const ours = sess?.ours; if (ours) stop('done');
        return r.ok ? r.value : `Play-test: ${r.error}`;
      },
    });
  }

  return { tool, start, stop, state: () => (sess ? { ...sess } : null), stats: () => ({ ...stats }) };
})();
