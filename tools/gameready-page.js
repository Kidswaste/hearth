// ▶ Play, got ready (round 52, gameready): the part that runs INSIDE ▶ Play's game window, first in the game's page
// (gamemodemain.js serves it on the game's own address and puts its tag at the top of the page's <head> when GameReady
// armed the window; the game's files are never changed). It shows the calm card over the window before the first frame
// ("Getting Clink ready… textures 40/120 · 80 %", Play now, Optimize for play, Esc) and prepares what the game loads:
//   a Lab scene (k=lab: the window's page is the Lab's player, data/game/<scene>/play.html): once the scene first drew
//     (behind the card), the player's own messages: ready-scan (everything in, textures at the best anisotropy, what it
//     costs), ready-prep (every shader compiled, every texture uploaded), ready-warm until two passes find nothing new
//   an HTML build (k=html): holds the game's frames (requestAnimationFrame) while it gets ready, finds its three.js
//     renderer and scenes through three's own devtools hook (__THREE_DEVTOOLS__), waits until everything it loads is in
//     (fetch / XHR / pictures / image bitmaps / sounds decoded / videos at their first frame), every texture at the best
//     anisotropy and uploaded (initTexture), every shader compiled (compileAsync), warm frames under the card, again
// Then the card goes and the first 5 s of play are counted (shaders compiled / textures uploaded: 0 / 0 when it worked).
// Hearth reads window.__gameReady.pub() through game:eval (tools/gameready.js) and answers the card's buttons with
// __gameReady.answer(…). Query: t = the title, k = lab | html, np = 1 (no getting ready: a check's "before"), opt = how
// many models could be optimized (the card offers Optimize for play), tx = (round 53, gametex) what the compressed
// textures save ("Textures: 640 MB → 160 MB of video memory"), shown on the card.
(() => {
  if (window.__gameReady) return;
  const Q = new URLSearchParams((document.currentScript?.src || '').split('?')[1] || '');
  const LAB = Q.get('k') === 'lab';
  const now = () => performance.now();
  const realRAF = window.requestAnimationFrame.bind(window);
  const realTimeout = window.setTimeout.bind(window);
  const sleep = (ms) => new Promise((r) => realTimeout(r, ms));
  const S = { mode: LAB ? 'lab' : 'html', title: Q.get('t') || document.title || 'the game', noPrep: Q.get('np') === '1', opt: Number(Q.get('opt')) || 0, tx: Q.get('tx') || '', phase: 'ready', pct: 0, text: '', t0: now(), cardAt: null, firstFrameAt: null, result: null, first5: null, want: null, wantN: 0, note: '', errors: [], skip: false, held: !LAB, queue: [], renderers: new Set(), scenes: new Set(), pend: 0, last: now(), gl: { compiles: 0, links: 0, uploads: 0, reuploads: 0 }, decoders: new Set(), shown: [] }; // (round 54) shown: the card's lines so far (a stage can show for less than a reader's poll)
  window.__gameReady = S;
  // (round 56, readyspeed) when each step of getting ready ended (page ms; origin = performance.timeOrigin, so Hearth lines
  // them up with its own clock): card, drawn (the scene's first frame, behind the card), each step, play (the card goes),
  // frame1 (the first frame of play). One-offs, never per frame
  S.origin = performance.timeOrigin; S.marks = {};
  const mark = (k) => { if (S.marks[k] == null) S.marks[k] = Math.round(now()); };
  // (round 56, readyspeed) what the last runs of this game learnt (readyspeedmain.js, in the query): c = ▶ Play's press
  // (epoch ms), was = the first ▶ Play's time + sw (say it once), rn = renderers to wait for, abs = the budget's A/B
  // verdict still holds (same files, helpers, screen, look: not run again), wq = one quiet warm-up pass is enough
  // (and a shorter one), ld = the loads an HTML build made last time (all in: no quiet wait)
  const HN = { loads: Number(Q.get('ld')) || 0, click: Number(Q.get('c')) || 0, was: Number(Q.get('was')) || 0, show: Q.get('sw') === '1', rn: Number(Q.get('rn')) || 0, abReuse: Q.get('abs') === '1', quiet: Q.get('wq') === '1' ? 1 : 2, shadow: null };
  { const v = (Q.get('sq') || '').split(':').map(Number); if (v[0] >= 512 && v[1] > 0) HN.shadow = { size: v[0], ms: v[1], ref: v[2] || 0 }; } // (round 57, readywalk) sq: the shadow size to check, not walk
  S.hints = HN; S.speedLine = '';
  // what Hearth reads (game:eval): plain data only
  S.pub = () => JSON.stringify({ origin: S.origin, marks: S.marks, hints: S.hints, speedLine: S.speedLine, tx: S.tx, mode: S.mode, phase: S.phase, pct: S.pct, text: S.text, cardAt: S.cardAt, firstFrameAt: S.firstFrameAt, result: S.result, first5: S.first5, want: S.want, wantN: S.wantN, errors: S.errors.slice(-5), shown: S.shown, card: Boolean(ui && ui.d.isConnected && !ui.d.dataset.out) });
  S.answer = (a) => answerCard(a || {});
  // (round 55, playbudget) its hooks' main-thread time (ms, a running total: tools/playbudget-page.js reads it); they
  // retire 5 s into play (once the first 5 s are counted: nothing of getting ready is needed while playing), at once
  // when the budget switches getting ready off for this game, and step aside during the budget's A/B. A game the budget
  // kept it off for plays without getting ready (as np=1)
  let SP = 0; let RET = false; let PAUSE = false; const undo = [];
  function retire() { if (RET) return; RET = true; for (const [o, m, w, base] of undo) { try { if (o[m] === w) o[m] = base; } catch { /* another wrapper on top: ours passes straight through */ } } }
  S.budget = { spent: () => SP, pause: (on) => { PAUSE = Boolean(on); }, off: () => { retire(); S.skip = true; return true; } };
  try { if (window.__hearthBudget?.isOff?.('ready')) S.noPrep = true; } catch { /* fine */ }
  // (round 55, playbudget) one quiet A/B under the card before play: Hearth's helpers on vs stepped aside, the one that
  // costs frames off before the first frame (tools/playbudget-page.js)
  async function budgetAB() {
    const B = window.__hearthBudget;
    if (!B?.ab || S.skip || S.noPrep) return;
    // (round 56, readyspeed) the last A/B of this very game (same files, Hearth's helpers, screen, look) found them costing
    // it nothing, and nothing was switched off while it played: its verdict holds, not measured again (1–3.5 s saved)
    // (shadowready: the Best look's shadow size is still chosen, starting from the one remembered, and its maps made here)
    if (HN.abReuse) {
      card('checking it runs smooth', 99);
      try { const r = await B.ab({ costs: false, shadow: HN.shadow }); if (S.result) S.result.ab = { reused: true, turnedOff: [], ms: r?.ms, shadow: r?.shadow || null, skipped: r?.skipped || null }; } catch { if (S.result) S.result.ab = { reused: true, turnedOff: [] }; }
      return;
    }
    card('checking it runs smooth', 99);
    try { const r = await B.ab({ shadow: HN.shadow }); if (S.result && r) S.result.ab = { on: r.on, off: r.off, turnedOff: r.turnedOff || [], skipped: r.skipped || null, ms: r.ms, judge: r.judge ? { slower: Boolean(r.judge.slower) } : null, shadow: r.shadow || null }; } catch { /* plays as it is */ }
  }

  // ---------- the card (over the whole window, before anything draws) ----------
  let ui = null;
  function card(text, pct) {
    if (!ui) {
      const d = document.createElement('gameready-card'); d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#07080b;color:#eae0d5;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;transition:opacity .25s';
      const root = d.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>.c{width:min(440px,86vw);padding:22px 24px 16px;border-radius:14px;background:#15161c;border:1px solid #ffffff14;box-shadow:0 10px 40px #0008}.t{font-size:17px;font-weight:600;margin-bottom:4px}.l{color:#b8ada3;min-height:1.45em;font-variant-numeric:tabular-nums}.b{height:4px;margin:12px 0 6px;border-radius:2px;background:#ffffff14;overflow:hidden}.b i{display:block;height:100%;background:linear-gradient(90deg,#ff8a3d,#ffb45a);transform-origin:left;transform:scaleX(0);transition:transform .3s}.n{margin:8px 0 2px;color:#cfc4ba;font-size:13px}.k{margin:6px 0 0;padding:6px 8px;border-radius:6px;background:#000a;color:#ffd2a8;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;user-select:all;overflow-wrap:anywhere}[hidden]{display:none!important}.r{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #ffffff22;background:#ffffff0d;color:inherit;cursor:pointer}.m{background:#ff8a3d;border-color:#ff8a3d;color:#1a1206;font-weight:600}.e{margin-top:10px;color:#8f857c;font-size:12px}</style><div class="c"><div class="t"></div><div class="l"></div><div class="b"><i></i></div><div class="n" hidden></div><div class="k" hidden></div><div class="r"><button type="button" class="m">Play now</button><button type="button" class="o" hidden>Optimize for play</button></div><div class="e">Esc to leave</div></div>';
      const $ = (q) => root.querySelector(q);
      ui = { d, t: $('.t'), l: $('.l'), i: $('.b i'), n: $('.n'), k: $('.k'), m: $('.m'), o: $('.o'), last: '' };
      ui.t.textContent = `Getting ${S.title} ready…`;
      ui.m.onclick = () => { if (S.want === 'install-offer') { S.want = 'install'; S.wantN += 1; ui.m.textContent = 'Play now'; ui.n.textContent = 'Installing in its own window. When it says done, press ▶ Play again and Optimize.'; ui.k.hidden = true; ui.o.hidden = true; return; } S.skip = true; };
      ui.o.hidden = !S.opt;
      if (S.tx) { ui.n.hidden = false; ui.n.textContent = `${S.tx} (compressed copies)`; } // (round 53, gametex)
      if (S.opt) ui.o.title = `Compresses ${S.opt === 1 ? 'its 3D model' : `its ${S.opt} 3D models`} into Hearth's own cache (your files stay as they are)`;
      ui.o.onclick = () => { if (S.want === 'install-offer') { S.want = null; ui.k.hidden = true; ui.n.hidden = true; ui.m.textContent = 'Play now'; ui.o.textContent = 'Optimize for play'; return; } S.want = 'optimize'; S.wantN += 1; ui.o.hidden = true; ui.n.hidden = false; ui.n.textContent = 'Optimizing into Hearth\'s own cache…'; };
      (document.documentElement || document).appendChild(d);
      S.cardAt = now(); mark('card');
    }
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const line = `${text} · ${p} %`;
    if (line !== ui.last) { ui.last = line; ui.l.textContent = line; ui.i.style.transform = `scaleX(${p / 100})`; S.pct = p; S.text = `Getting ${S.title} ready… ${line}`; const kind = text.replace(/\d+/g, '#'); if (kind !== ui.kind && S.shown.length < 40) { ui.kind = kind; S.shown.push(S.text); } }
  }
  function answerCard(a) {
    if (!ui) return;
    ui.n.hidden = false;
    if (a.kind === 'install') { S.want = 'install-offer'; ui.n.textContent = a.text ? `${a.text} Lighter 3D models need ${a.why || 'gltfpack'}. Hearth runs this in a Terminal window only when you press Install:` : `Optimizing needs ${a.why || 'gltfpack'}. Hearth runs this in a Terminal window only when you press Install:`; ui.k.hidden = false; ui.k.textContent = a.command; ui.m.textContent = 'Install'; ui.o.hidden = false; ui.o.textContent = 'Not now'; return; }
    S.want = null;
    ui.n.textContent = a.text || '';
  }
  // (round 54, gameaudio) the game's sounds decoded before the card goes (tools/gameaudio-page.js; at most 20 s)
  async function sounds() {
    const A = window.__gameAudio; if (!A?.pending || S.skip || S.noPrep) return null;
    const t = now();
    while (A.pending() > 0 && !S.skip && now() - t < 20000) { const p = A.progress(); card(`sounds ${p.done}/${p.n}`, 88); await sleep(60); }
    const p = A.progress(); return p.n ? { ...p, ms: Math.round(now() - t) } : null;
  }
  // (round 56, readyspeed) "Ready in 2.1 s (was 6.8 s)": once per game, the first time it got clearly ready sooner than its
  // first ▶ Play (ReadySpeedCore.faster: ≥ 15 % and ≥ 0.3 s). A quiet line under where the card was, for 3 s, then gone
  // (one element, a compositor fade, nothing per frame; it never takes the mouse)
  const secs = (ms) => `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
  function readyLine() {
    if (!HN.click || !HN.was || !HN.show || S.skip && !S.result) return;
    const ms = S.origin + now() - HN.click;
    if (!(ms > 0) || ms > HN.was * 0.85 || HN.was - ms < 300) return;
    S.speedLine = `Ready in ${secs(ms)} (was ${secs(HN.was)})`;
    try {
      const d = document.createElement('gameready-note'); d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;left:50%;bottom:9vh;z-index:2147483646;transform:translateX(-50%);pointer-events:none;contain:layout paint';
      d.attachShadow({ mode: 'open' }).innerHTML = `<style>p{margin:0;padding:7px 14px;border-radius:999px;background:#15161cdd;border:1px solid #ffffff14;color:#eae0d5;font:13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;animation:f 3s ease forwards}@keyframes f{0%{opacity:0}10%,75%{opacity:1}100%{opacity:0}}</style><p></p>`;
      d.shadowRoot.querySelector('p').textContent = S.speedLine;
      (document.documentElement || document).appendChild(d);
      realTimeout(() => d.remove(), 3100);
    } catch { /* only a note */ }
  }
  // (round 56, readyspeed) Hearth's helpers switched off while it played (not remembered ones): the A/B's verdict won't be reused
  const budgetOff = () => { try { return (JSON.parse(window.__hearthBudget.pub()).off || []).filter((o) => o.by !== 'remembered').length; } catch { return 0; } };
  function cardOut() { if (!ui || ui.d.dataset.out) return; ui.d.dataset.out = '1'; ui.d.style.opacity = '0'; realTimeout(() => ui?.d.remove(), 260); }
  if (!S.noPrep) card('looking at its files', 2);
  // the game's own errors, for Hearth to say why a game didn't start (never shown raw)
  addEventListener('error', (e) => { S.errors.push(e.target && e.target !== window ? `couldn't load ${String(e.target.src || e.target.href || e.target.tagName).split('/').slice(-2).join('/')}` : `${e.message || 'error'}${e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : ''}`); }, true);
  addEventListener('unhandledrejection', (e) => { S.errors.push(String(e.reason?.message || e.reason || 'rejected').slice(0, 300)); });

  // ================= a Lab scene: the Lab player's own preparing messages =================
  if (LAB) {
    const waits = new Set();
    let n = 0;
    addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.source !== 'three-sandbox') return;
      if (d.type === 'stack-drawn' && S.firstFrameAt == null) S.firstFrameAt = now();
      if (d.type === 'ready-progress' && d.id === 'gr' && S.phase === 'ready') {
        if (d.stage === 'assets') card(`loading ${d.done}/${d.total}`, 10 + 35 * (d.total ? d.done / d.total : 1));
        else if (d.stage === 'shaders') card(`effects ${d.done}/${d.total}`, 60 + 30 * (d.total ? d.done / d.total : 1));
      }
      for (const w of [...waits]) if (w.test(d)) { waits.delete(w); w.res(d); }
    });
    const ask = (m, type, ms = 30000) => new Promise((res) => { const w = { test: (d) => d.type === type && (d.id === m.id || type === 'ready-count'), res }; waits.add(w); realTimeout(() => { if (waits.delete(w)) res(null); }, ms); n += 1; window.postMessage({ target: 'three-sandbox', ...m }, '*'); });
    const count = () => ask({ type: 'ready-count', id: 'gr' }, 'ready-count', 4000);
    const until = async (fn, ms) => { const t = now(); while (now() - t < ms && !S.skip) { if (await fn()) return true; await sleep(100); } return false; };
    // (round 56, readyspeed) the pictures fetched (the page's host script), decoded off the page's thread, KTX2 transcoded
    // (the Lab player's times, in its ready-count): page ms
    const loadTimes = (c) => { const L = window.__hearthGame?.load || {}; const T = c?.times || {}; const r = (x) => (x == null ? null : Math.round(x)); return { asked: r(L.asked), fetched: r(L.fetched), run: r(L.run), refsAt: r(T.refsAt), decode: T.decodeN ? { n: T.decodeN, from: r(T.decodeFrom), to: r(T.decodeTo) } : null, ktx: T.ktxN ? { n: T.ktxN, from: r(T.ktxFrom), to: r(T.ktxTo) } : null }; };
    async function prepareLab() {
      const t0 = now(); const ms = {};
      // the scene starts behind the card; its first frame, then every layer drawing (the count steady for 0.6 s)
      await until(() => S.firstFrameAt != null || window.__hearthGame?.drawn, 60000);
      if (S.firstFrameAt == null && window.__hearthGame?.drawn) S.firstFrameAt = now();
      S.marks.drawn = Math.round(S.firstFrameAt ?? now());
      if (S.noPrep) return play();
      card('loading', 10);
      { let last = -1; let since = now(); const t = now();
        while (!S.skip && now() - t < 10000) { const c = await count(); const k = c?.renderers ?? 0; if (HN.rn && k >= HN.rn) break; if (k !== last) { last = k; since = now(); } else if (k > 0 && now() - since > 600) break; await sleep(HN.rn ? 40 : 120); }
      } // (round 56: as many as last time → no steady wait. (round 57, readywalk) and no two more frames of theirs either: a
      // renderer is counted only once it drew a frame (its scene known to the compile, its shadow maps made by that frame),
      // and the warm-up pass draws frames anyway before the card goes; 2–3 frames saved, the first 5 s still counted)
      const g0 = await count(); mark('counted');
      let a = now(); const scan = S.skip ? null : await ask({ type: 'ready-scan', id: 'gr' }, 'ready-scanned', 60000); ms.assets = Math.round(now() - a); mark('scanned');
      const nTex = scan?.textures?.length || 0;
      if (!S.skip) card(`textures 0/${nTex}`, 45);
      a = now(); const prep = S.skip ? null : await ask({ type: 'ready-prep', id: 'gr', frames: 0 }, 'ready-prepped', 90000); ms.effects = Math.round(now() - a); mark('prepped'); // (round 57, readywalk: frames 0, no 2 frames of its own: the warm-up pass right after draws them)
      if (!S.skip) card(`textures ${prep?.textures ?? nTex}/${nTex}`, 60);
      a = now(); const warm = [];
      for (let i = 0, quiet = 0; i < 6 && quiet < HN.quiet && !S.skip; i += 1) { // (round 56: one quiet pass when the last runs needed nothing more)
        const w = await ask({ type: 'ready-warm', id: 'gr', n: HN.quiet === 1 && i === 0 ? 2 : 4 }, 'ready-warmed', 15000);
        warm.push(w?.gl || null);
        const g = w?.gl || {};
        quiet = (g.compiles || 0) + (g.links || 0) + (g.uploads || 0) === 0 ? quiet + 1 : 0;
        card('warming up', 90 + 3 * i);
        if (quiet < HN.quiet) await sleep(250);
      }
      ms.warm = Math.round(now() - a); mark('warmed');
      const inv = S.skip ? scan : (await ask({ type: 'ready-scan', id: 'gr' }, 'ready-scanned', 15000)) || scan;
      const g1 = await count(); mark('inventory');
      S.result = { ms: Math.round(now() - t0), steps: ms, skipped: S.skip, prep: prep ? { compileMs: prep.compileMs, textures: prep.textures, renderers: prep.renderers, gl: prep.gl } : null, warm, gl: g0 && g1 ? { compiles: g1.compiles - g0.compiles, links: g1.links - g0.links, uploads: g1.uploads - g0.uploads, waitMs: Math.round((g1.waitMs || 0) - (g0.waitMs || 0)) } : null, total: g1 ? { compiles: g1.compiles, links: g1.links, uploads: g1.uploads, waitMs: Math.round(g1.waitMs || 0) } : null,
        inventory: inv ? { textures: (inv.textures || []).map((t) => ({ w: t.w, h: t.h, mips: t.mips, compressed: t.compressed, cube: t.cube, video: t.video, aniso: t.aniso })), calls: inv.calls, triangles: inv.triangles, programs: inv.programs, lights: inv.lights, shadows: inv.shadows, aniso: inv.aniso, renderers: inv.renderers } : null, load: loadTimes(g1) };
      const snd = await sounds(); if (snd) S.result.sounds = snd; mark('sounds');
      const gb = await gpuBack(g0);
      await budgetAB(); mark('ab');
      await gpuBack(gb); // (the A/B's back-to-back frames are the longest GPU work of getting ready: a loss there too)
      if (!S.skip) card('ready', 100);
      await answered(); mark('answered');
      play();
    }
    // (round 57, readywalk) the graphics card took a context back while getting ready (a GPU process restart, a busy
    // machine): the player rebuilds the layers (glrecover: they run again, everything compiled and uploaded again). The
    // card waits for that rebuild and gets it ready again, so it doesn't land in the first seconds of play
    async function gpuBack(g0) {
      let c = await count();
      if (!c || !g0 || S.skip) return c || g0;
      const lost = () => c && (c.lostNow || (c.gpuLost || 0) > (g0.gpuLost || 0) || (c.rebuilds || 0) > (g0.rebuilds || 0));
      if (!lost()) return c;
      const t = now(); card('the graphics card is back: getting ready again', 95);
      await until(async () => { c = await count(); return c && !c.lostNow && (c.rebuilds || 0) > (g0.rebuilds || 0); }, 30000);
      await until(async () => { const k = await count(); return (k?.renderers || 0) >= (g0.renderers || 1); }, 10000);
      const prep = S.skip ? null : await ask({ type: 'ready-prep', id: 'gr', frames: 0 }, 'ready-prepped', 90000);
      const w = S.skip ? null : await ask({ type: 'ready-warm', id: 'gr', n: 2 }, 'ready-warmed', 15000);
      if (S.result) (S.result.gpuBack ||= []).push({ ms: Math.round(now() - t), rebuilds: (c?.rebuilds || 0) - (g0.rebuilds || 0), prep: prep?.gl || null, warm: w?.gl || null });
      return (await count()) || c;
    }
    async function play() {
      if (S.phase === 'playing') return;
      S.phase = 'playing'; mark('play'); realRAF(() => { mark('frame1'); readyLine(); }); // (the line once the first frame of play is out)
      cardOut();
      const c0 = await count();
      await sleep(5000);
      const c1 = await count();
      if (c0 && c1) S.first5 = { gpuLost: (c1.gpuLost || 0) - (c0.gpuLost || 0), ctxMade: (c1.ctxMade || 0) - (c0.ctxMade || 0), rebuilds: (c1.rebuilds || 0) - (c0.rebuilds || 0), gmMade: (c1.gmMade || 0) - (c0.gmMade || 0), /* (round 57: a context / merged renderer made in play's first 5 s: a layer run again) */ budgetOff: budgetOff(), compiles: c1.compiles - c0.compiles, links: c1.links - c0.links, uploads: c1.uploads - c0.uploads, reuploads: c1.reuploads - c0.reuploads, lock: c1.lock, level: c1.level, shares: c1.shares, waitMs: Math.round((c1.waitMs || 0) - (c0.waitMs || 0)) };
    }
    realTimeout(() => prepareLab().catch((err) => { S.errors.push(String(err?.message || err)); play(); }), 0);
    return;
  }

  // ================= an HTML build =================
  // ---------- 1. the game's frames wait ----------
  const rafW = window.requestAnimationFrame = (cb) => { if (!S.held) return realRAF(cb); S.queue.push(cb); return -S.queue.length; };
  undo.push([window, 'requestAnimationFrame', rafW, realRAF]);
  function release() { if (!S.held) return; S.held = false; const q = S.queue.splice(0); for (const cb of q) realRAF(cb); }
  // ---------- 2. three.js tells us its renderers and scenes ----------
  const dev = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());
  dev.addEventListener('observe', (e) => {
    const o = e.detail;
    if (o?.isWebGLRenderer && !S.renderers.has(o)) {
      S.renderers.add(o);
      const r0 = o.render;
      const w = o.render = function (scene, camera) { if (RET || PAUSE) return r0.call(this, scene, camera); const a = now(); if (scene?.isObject3D) { S.scenes.add(scene); o.__grCam = camera; } if (S.firstFrameAt == null) S.firstFrameAt = a; SP += now() - a; return r0.call(this, scene, camera); };
      undo.push([o, 'render', w, r0]);
    } else if (o?.isScene) S.scenes.add(o);
  });
  // ---------- GPU counters (what's compiled / uploaded, from the prototypes) ----------
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    const wrap = (m, fn) => { const f = P[m]; if (typeof f === 'function') { const w = P[m] = fn(f); undo.push([P, m, w, f]); } };
    wrap('compileShader', (f) => function (sh) { if (!RET) S.gl.compiles += 1; return f.call(this, sh); });
    wrap('linkProgram', (f) => function (pr) { if (!RET) S.gl.links += 1; return f.call(this, pr); });
    // (round 55, playbudget) the texture an upload goes to: the context's own binding for its target (kept on the page's
    // side, no trip to the graphics process), instead of a wrapper on every activeTexture / bindTexture (hundreds a frame)
    const BIND = { 0x0DE1: 0x8069, 0x8513: 0x8514, 0x806F: 0x806A, 0x8C1A: 0x8C1D }; // 2D, cube, 3D, 2D array → their bindings
    const bound = (gl, tg) => { const b = BIND[tg] || (tg >= 0x8515 && tg <= 0x851A ? 0x8514 : 0); if (!b) return null; try { return gl.getParameter(b); } catch { return null; } };
    const up = (f) => function (...a) { if (RET) return f.apply(this, a); const t0 = now(); const tx = bound(this, a[0]); if (tx && !tx.__grUp) { tx.__grUp = 1; S.gl.uploads += 1; } else S.gl.reuploads += 1; SP += now() - t0; return f.apply(this, a); };
    for (const m of ['texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexImage3D']) wrap(m, up);
  }
  // ---------- 3. what the game loads ----------
  S.loadsN = 0;
  const busy = (p) => { S.pend += 1; S.loadsN += 1; S.last = now(); const done = () => { S.pend = Math.max(0, S.pend - 1); S.last = now(); }; Promise.resolve(p).then(done, done); return p; };
  const f0 = window.fetch; if (f0) window.fetch = function (...a) { const p = f0.apply(this, a); busy(p.then((r) => r.clone().arrayBuffer().catch(() => null))); return p; };
  const send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) { busy(new Promise((res) => this.addEventListener('loadend', res, { once: true }))); return send0.apply(this, a); };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (src?.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(v) { busy(new Promise((res) => { this.addEventListener('load', res, { once: true }); this.addEventListener('error', res, { once: true }); realTimeout(res, 30000); })); return src.set.call(this, v); } });
  const cib = window.createImageBitmap; if (cib) window.createImageBitmap = function (...a) { return busy(cib.apply(this, a)); };
  const AC = window.BaseAudioContext?.prototype; const dad = AC?.decodeAudioData;
  if (dad) AC.decodeAudioData = function (...a) { return busy(dad.apply(this, a)); };
  const videos = () => { const set = new Set(document.querySelectorAll('video')); for (const t of textures()) if (t.isVideoTexture && t.image) set.add(t.image); return [...set]; };
  async function settle(maxMs = 30000) {
    const t0 = now();
    while (now() - t0 < maxMs && !S.skip) {
      const vids = videos().filter((v) => (v.src || v.srcObject) && v.readyState < 2 && !v.error).length;
      const left = S.pend + vids;
      card(`loading${left ? ` · ${left} left` : ''}`, 10 + Math.min(30, (now() - t0) / 100));
      if (!left && S.renderers.size && (now() - S.last > 350 || (HN.loads && S.loadsN >= HN.loads))) break; // (round 56: as many loads in as last time → no quiet wait)
      if (!left && !S.renderers.size && now() - t0 > 6000) break; // no three.js here: nothing more to wait for
      await sleep(50);
    }
    for (const v of videos()) if (v.readyState >= 2 && typeof v.requestVideoFrameCallback === 'function') await Promise.race([new Promise((r) => v.requestVideoFrameCallback(() => r())), sleep(300)]);
  }
  // ---------- 4. textures and shaders ----------
  function textures() {
    const out = new Set();
    const take = (t) => { if (t?.isTexture && !t.isRenderTargetTexture && !t.isDepthTexture) out.add(t); };
    for (const sc of S.scenes) {
      take(sc.background); take(sc.environment);
      sc.traverse?.((o) => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { for (const v of Object.values(m)) take(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) take(u?.value); } });
    }
    return [...out];
  }
  const dims = (t) => { const im = t.image; const m = t.mipmaps?.[0]; const w = im?.videoWidth || im?.naturalWidth || im?.width || m?.width || 0; const h = im?.videoHeight || im?.naturalHeight || im?.height || m?.height || 0; return { w, h }; };
  function inventory() {
    const tex = textures().map((t) => ({ ...dims(t), mips: t.generateMipmaps !== false || (t.mipmaps?.length || 0) > 1, compressed: Boolean(t.isCompressedTexture), cube: Boolean(t.isCubeTexture), video: Boolean(t.isVideoTexture), aniso: t.anisotropy || 1 }));
    let calls = 0; let triangles = 0; let programs = 0; let shadows = 0; let lights = 0;
    for (const r of S.renderers) { calls += r.info?.render?.calls || 0; triangles += r.info?.render?.triangles || 0; programs += r.info?.programs?.length || 0; }
    for (const sc of S.scenes) sc.traverse?.((o) => { if (o.isLight) { lights += 1; if (o.castShadow) shadows += 1; } });
    return { textures: tex, calls, triangles, programs, lights, shadows, videos: videos().length };
  }
  function fakeCamera() {
    // compile() reads only the camera's layers: an Object3D of the game's own three.js with every layer on
    const sc = [...S.scenes][0]; if (!sc) return null;
    const O3 = Object.getPrototypeOf(sc.constructor); const c = new O3(); c.layers.enableAll(); return c;
  }
  // (round 56, readyspeed) every program handed to the driver at once (compileAsync: KHR_parallel_shader_compile compiles
  // them side by side), `during` (the textures' uploads) runs while they compile, then one wait for all of them
  async function compile(again, during) {
    let done = 0; const list = [...S.renderers]; const total = list.length * Math.max(1, S.scenes.size); const waits = [];
    for (const r of list) {
      const cam = r.__grCam || [...S.scenes].map((s) => { let c = null; s.traverse?.((o) => { if (!c && o.isCamera) c = o; }); return c; }).find(Boolean) || fakeCamera();
      for (const sc of S.scenes) {
        if (S.skip) break;
        let p = null;
        try { if (cam) p = Promise.race([r.compileAsync ? r.compileAsync(sc, cam) : r.compile(sc, cam), sleep(15000)]); } catch { /* the next frame compiles it */ }
        waits.push(Promise.resolve(p).catch(() => {}).then(() => { done += 1; if (!S.skip) card(`effects ${done}/${total}`, again ? 92 : 60 + 30 * (done / total)); }));
      }
    }
    const r = during ? during() : undefined;
    await Promise.all(waits);
    // (round 56, readyspeed) then every program reports COMPLETION_STATUS (KHR_parallel_shader_compile) before going on
    for (const t0 = now(); now() - t0 < 20000 && !S.skip;) {
      let left = 0; for (const x of list) for (const p of x.info?.programs || []) { try { if (typeof p.isReady === 'function' && !p.isReady()) left += 1; } catch { /* lost */ } }
      if (!left) break; await sleep(16);
    }
    return r;
  }
  function upload() {
    const list = textures(); let k = 0;
    for (const r of S.renderers) {
      const max = r.capabilities?.getMaxAnisotropy?.() || 1;
      for (const t of list) {
        if (S.skip) return k;
        // the best filtering the graphics card has, before the first upload (mipmapped pictures; not a video's frames)
        if (!t.isVideoTexture && t.generateMipmaps !== false && (t.anisotropy || 1) === 1 && max > 1) { /* (round 54: a game's own anisotropy is its choice) */ const was = r.properties?.get?.(t)?.__webglTexture; t.anisotropy = max; if (was) t.needsUpdate = true; }
        const im = t.image;
        if (!im || (im instanceof HTMLImageElement && !im.complete) || (im instanceof HTMLVideoElement && im.readyState < 2)) continue;
        try { r.initTexture(t); k += 1; } catch { /* not ready */ }
        card(`textures ${k}/${list.length}`, 45 + 15 * (k / Math.max(1, list.length)));
      }
    }
    return k;
  }
  const frames = (k) => new Promise((res) => { let i = 0; const go = () => (++i >= k ? res() : realRAF(go)); realRAF(go); });
  // ---------- 5. play ----------
  function play() {
    if (S.phase === 'playing') return;
    S.phase = 'playing'; S.skip = true; mark('play'); realRAF(() => { mark('frame1'); readyLine(); }); // (the line once the first frame of play is out)
    release();
    cardOut();
    const c0 = { ...S.gl }; const t0 = now(); let k = 0;
    const tick = () => { k += 1; if (now() - t0 < 5000) realRAF(tick); };
    realRAF(tick);
    realTimeout(() => { S.first5 = { budgetOff: budgetOff(), compiles: S.gl.compiles - c0.compiles, links: S.gl.links - c0.links, uploads: S.gl.uploads - c0.uploads, reuploads: S.gl.reuploads - c0.reuploads, frames: k }; retire(); }, 5000);
  }
  async function prepareHtml() {
    if (S.noPrep) { play(); return; }
    const t0 = now(); const g0 = { ...S.gl }; const ms = {}; let warmGl = null;
    card('looking at its files', 2);
    let a = now(); await settle(); const snd = await sounds(); ms.assets = Math.round(now() - a); mark('settled');
    if (!S.renderers.size && !S.skip) {
      // a game that makes its renderer in its first frame: let one through under the card, then go on
      release(); S.held = true; await frames(2); await settle(8000);
    }
    // (round 56, readyspeed) the shaders compile while the textures upload (they were one after the other)
    a = now(); let up = 0; await compile(false, () => { const b = now(); up = upload(); ms.textures = Math.round(now() - b); mark('textures'); }); ms.effects = Math.round(now() - a); mark('effects');
    // warm frames under the card: the game's own first frames draw (shadow maps, lights, post passes), then whatever
    // they showed that compile() didn't reach is compiled now
    if (!S.skip) {
      a = now(); card('warming up', 90);
      S.held = false; const q = S.queue.splice(0); for (const cb of q) realRAF(cb);
      // (round 56, readyspeed) the frames that drew what compile() made are drawn only when it made something; two game
      // frames instead of four when the last runs' warm-ups found nothing more
      const w0 = { ...S.gl };
      await frames(HN.quiet === 1 ? 2 : 4); await compile(true); upload();
      warmGl = { compiles: S.gl.compiles - w0.compiles, links: S.gl.links - w0.links, uploads: S.gl.uploads - w0.uploads };
      if (warmGl.compiles + warmGl.links + warmGl.uploads) await frames(2);
      ms.warm = Math.round(now() - a); mark('warmed');
    }
    S.result = { ms: Math.round(now() - t0), steps: ms, loads: S.loadsN, ...(warmGl ? { warm: [warmGl] } : {}), uploaded: up, gl: Object.fromEntries(Object.entries(S.gl).map(([key, v]) => [key, v - g0[key]])), inventory: inventory(), skipped: Boolean(S.skip), ...(snd ? { sounds: snd } : {}) };
    await budgetAB(); mark('ab');
    card('ready', 100);
    await answered(); mark('answered');
    play();
  }
  // a pending Optimize / Install on the card is answered before the card goes (at most 2 minutes)
  async function answered() { const t = now(); while (S.want && S.want !== 'install-offer' && now() - t < 120000) await sleep(100); if (S.want === 'install-offer') { const t2 = now(); while (S.want === 'install-offer' && !S.skip && now() - t2 < 60000) await sleep(100); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => realTimeout(prepareHtml, 0)); else realTimeout(prepareHtml, 0);
})();
