// Three.js Lab: live sketch sandbox, model viewer/auditor, shader playground, texture inspector,
// docs browser and the shared color/easing kits.
const ThreeLab = (() => {
  // (round 158, split158) what the Lab's cold parts (tools/three-lab-*.js, loaded on first use: labPart) reach in here
  const K0 = {
    get TOOL_TABS() { return TOOL_TABS; }, get api() { return api; }, parseColors, sandboxFrame, saveDataUrl,
    get tabs() { return tabs; },
  };
  const SANDBOX = 'tools/three-sandbox.html';
  let tabs = null;
  let dropped = false; // (round 161, fix161) ThreeLab.drop(): Hearth's Lab let go entirely while the Lab window holds its scene
  let mountAC = null; // (round 161) the mount's listener on the surface's body
  let startHint = null; // (round 73, coldopen73) the scene the Lab's first mount opens with (a project opening: cmd({ sketch }))
  const api = {}; // filled by each tab as it mounts
  let npStarted = false; let nowPlayingTo = null; // (round 161, fix161) the now-playing subscription, once per window
  const nowPlayingRelay = (info) => nowPlayingTo?.(info); // (made here: a closure made inside the tab would keep the tab alive)
  // (round 158, split158) The Lab's cold parts: what opening the Lab, playing a scene, selecting a layer, moving its
  // knobs and the director's everyday calls never run (dialogs, menus, references, notes, MIDI, the other tools…) lives
  // in tools/three-lab-*.js, lazy groups loaded on first use (docs/upgrades/split158.md). A stand-in left here
  // (`function x(...a) { return labPart(K, part, 'x', a); }`) loads its part, then calls it: in the same task once the
  // part's file is in, after the load the first time. K is what a part reaches in here (state, helpers, stand-ins).
  const PARTS = { tools: 'labparttools', refs: 'labpartrefs', notes: 'labpartnotes', midi: 'labpartmidi', live: 'labpartlive', capture: 'labpartcapture', dialogs: 'labpartdialogs', menus: 'labpartmenus', edit: 'labpartedit', lanes: 'labpartlanes', ai: 'labpartai' };
  const partMods = new WeakMap();
  function labPart(K, part, fn, args) {
    let mods = partMods.get(K);
    if (!mods) partMods.set(K, (mods = {}));
    const call = () => { mods[part] ||= window.LabParts[part](K); return mods[part][fn](...args); };
    if (window.LabParts?.[part]) return call();
    return Lazy.load(PARTS[part]).then(call);
  }
  // "  12| code" for lines a..b (1-based) of a list of lines.
  const numbered = (lines, a, b) => lines.slice(a - 1, b).map((ln, k) => `${String(a + k).padStart(4)}| ${ln}`).join('\n');
  // Small layers: their whole code. Big ones: an outline (functions, classes, top-level names, section comments,
  // tweak() groups) with line numbers, to read in parts with three_read_code.
  const BIG_CODE_LINES = 350;
  function codeOrOutline(code) {
    code = code.replace(/\/\/ @nodes:v1 \{.*\}[ \t]*$/m, '// @nodes:v1 {…} (the node graph this layer is made from: change it with three_nodes)'); // tools/three-nodes.js
    const lines = code.split('\n');
    if (lines.length <= BIG_CODE_LINES) return { code };
    const marks = [];
    lines.forEach((ln, k) => {
      if (/^\s{0,2}(export\s+)?(async\s+)?function\s+\w+|^\s{0,2}class\s+\w+|^\s{0,2}(const|let|var)\s+\w+\s*=\s*(tweak\(|new |\(|async|function|\[|\{)|^\s*\/\/\s*[-=#*]{2,}|^\s*\/\/\s*[A-Z][A-Z ]{3,}|^import |^\s*(renderer|scene|camera)\.\w+\s*\(/.test(ln)) marks.push(`${String(k + 1).padStart(4)}| ${ln.trim().slice(0, 110)}`);
    });
    return {
      outline: marks.slice(0, 220).join('\n'),
      note: `This layer is ${lines.length} lines, so here is its outline with line numbers. Read parts with three_read_code (from / to), find things with three_search_code, and change them with three_edit_code (exact find → replace, or a line range) instead of rewriting the whole layer.`,
    };
  }
  // Colors from a Coolors link (coolors.co/palette/264653-2a9d8f-… or coolors.co/264653-…), a Coolors export
  // (CSS / SCSS / array / JSON, '#rrggbbaa' too) or any list of hex codes → ['#rrggbb', …].
  function parseColors(input) {
    const s = Array.isArray(input) ? input.join(' ') : String(input || '');
    const link = s.match(/coolors\.co\/(?:palette\/)?([0-9a-f]{6}(?:-[0-9a-f]{6})+)/i);
    let raw = link ? link[1].split('-') : [...s.matchAll(/#([0-9a-f]{6})(?:[0-9a-f]{2})?(?![0-9a-f])/gi)].map((m) => m[1]);
    if (!raw.length) raw = [...s.matchAll(/(?<![0-9a-z])([0-9a-f]{6})(?![0-9a-z])/gi)].map((m) => m[1]);
    return [...new Set(raw.map((h) => `#${h.toLowerCase()}`))].slice(0, 12);
  }

  // One iframe per mode; messages from it are routed by `source`.
  // lazy: the first load waits for the first run (the sketch tab runs its sketch right away; loading the page at mount
  // too meant a reload ~0.3 s later, while the first page was still starting, which could leave the preview black)
  // pretty: a reload of a page that shows something (the Lab preview) keeps a picture of it on screen and cross-fades
  // into the new page once its layers have drawn their first frame (never a black flash; see "live" below).
  // (round 25, diet) the preview page's motion-design kit / 3D-model runtime (tools/sandbox-*.js): loaded here when a page
  // asks (a sandboxed page can't read files) and sent as source; nothing of them runs in the hub
  const LIB_FILES = { motion: 'tools/sandbox-motion.js', lab3d: 'tools/sandbox-lab3d.js', beatlink: 'tools/three-beatlink-core.js', camcore: 'tools/three-camera-core.js', kinetic: 'tools/three-kinetic-core.js', matcore: 'tools/three-materials-core.js', viscore: 'tools/three-vis-core.js', shapecore: 'tools/three-shape-core.js' }; // (round 38, beatlink: ♪ Move with the music's math; round 45, kinetictype: text that moves on the hits)
  const libFiles = {};
  function sandboxLib(name, deliver) {
    if (!LIB_FILES[name]) return;
    const have = () => window.__sbxLibFn?.[name];
    libFiles[name] ||= have() ? Promise.resolve() : new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LIB_FILES[name];
      s.onload = () => { s.onload = s.onerror = null; res(); }; s.onerror = () => { s.onload = s.onerror = null; delete libFiles[name]; s.remove(); rej(new Error(`${LIB_FILES[name]} didn't load`)); }; // (round 161: the handlers let go once done, they kept the page that asked)
      document.head.append(s);
    });
    libFiles[name].then(() => deliver({ target: 'three-sandbox', type: 'lib', name, code: String(have()) }), (err) => deliver({ target: 'three-sandbox', type: 'lib', name, error: err.message }));
  }
  function sandboxFrame(parent, mode, onMessage, extraParams = () => '', { lazy = false, pretty = false, name = mode, gpuStuck = 'reload' } = {}) {
    // No allow-same-origin: sketch code (which may come from a chat) can't reach the hub's APIs.
    // (round 37, labboot) the Lab preview takes the page warmed after the start (tools/three-boot.js), moved in running
    let warmed = name === 'preview' ? window.LabBoot?.take?.(parent) || null : null;
    const frame = warmed?.frame || el('iframe', { class: 'three-frame', attrs: { sandbox: 'allow-scripts allow-pointer-lock allow-downloads', allow: 'display-capture; microphone; autoplay' } });
    if (!warmed) parent.append(frame);
    let warmRun = false; // the warm page ran this scene: the first run swaps in over its picture (run())
    // A full reload (a new three.js version, a new pixel ratio, a restart) hides the half-built picture under a cover
    // that fades away once the new scene is up, instead of flashing black (polish.css .scene-cover; with a picture of
    // the scene you had: chat-scenes.css .scene-cover.snap).
    const cover = el('div', { class: 'scene-cover out' });
    parent.append(cover);
    cover.addEventListener('animationend', () => { if (cover.classList.contains('out') && cover.dataset.own) { delete cover.dataset.own; cover.classList.remove('snap'); cover.style.backgroundImage = ''; } });
    let coverT = 0;
    const uncover = () => { clearTimeout(coverT); cover.classList.add('out'); };
    let ready = null;
    let queue = [];
    let nonce = null; // which load of the frame we're waiting for
    let loadedWith = null; // the query the page was loaded with (a new pixel ratio or three.js version needs a new page)
    // 'frame' = the iframe here; 'stage' = the separate Stage window (main.js relays its messages).
    let target = 'frame';
    let stageSize = () => null; // → { width, height } for exact frame sizes (read at every load)
    // (capturefix2) a frame taken off the page (the Lab closed, the preview remade) has no window: what arrives for it
    // late (a library file loaded for /still) goes nowhere instead of throwing
    const deliver = (m) => (target === 'stage' ? window.hub.stageSend(m) : frame.contentWindow?.postMessage(m, '*'));
    let coverShot = null; // resolves with the picture the page answered for the cover
    // (round 43, glrecover) the GPU took the page's WebGL contexts ('gpu-lost'): the page rebuilds its layers in place
    // when they come back ('gpu-restored'). None back within GL_WAIT: the owner is told ('gpu-stuck') and, unless it
    // handles that itself (gpuStuck: 'owner', the export page), the page is made again for the same content: its
    // 'ready' says `again` (+ `gl`), so the owner runs what it ran (the Lab: the scene, its song at its place, nothing
    // saved). Same path as a page the browser restarted by itself.
    const gl = { lost: false, epoch: 0, timer: 0, stuck: 0, restored: 0, again: false, at: 0 };
    const glWaitMs = () => Number(store.get('glrecover.wait', 4000)) || 4000;
    const glStuck = () => {
      gl.timer = 0;
      if (!gl.lost) return;
      gl.stuck += 1; live.gl('stuck', name);
      onMessage({ source: 'three-sandbox', type: 'gpu-stuck', epoch: gl.epoch, count: gl.stuck, ...(gl.crashNow ? { crashed: true } : {}) }); gl.crashNow = false;
      // (round 51) pages that couldn't get a WebGL context at all ('gpu-lost' with none), three in a row: no more new
      // pages on their own (each would fail the same way); the Lab's calm banner stays, with ⟲ Restart
      if (gl.noneRow >= 3) return;
      if (gpuStuck !== 'owner' && (target === 'stage' || frame.isConnected)) { gl.again = true; load(true); }
    };
    // (round 50, crashsafe) the page's own process died (a crash, killed by the system): the main process says which
    // pages are still up (crashsafemain.js); this one isn't → the same as a GPU that didn't come back: a new page for
    // the same content, the scene run again quietly with its sliders and song (the export page handles it itself)
    const crashCheck = ({ alive = [], gone = [] } = {}) => {
      if (target !== 'frame') return;
      if (!frame.isConnected) { window.__labFrames?.delete(crashCheck); return; }
      const mine = (u) => new RegExp(`[?&]n=${nonce}(&|$)`).test(String(u));
      if (!ready || !nonce || !gone.some(mine) || alive.some(mine)) return;
      if (gl.lost && gl.timer) return; // already on its way back
      console.warn(`Lab ${mode} preview page crashed: making it again`);
      gl.lost = true; gl.crashed = (gl.crashed || 0) + 1; gl.crashNow = true; clearTimeout(gl.timer); glStuck();
    };
    (window.__labFrames ||= new Set()).add(crashCheck);
    // (round 51) how a crash is noticed without polling: each ready page holds the other end of a MessagePort; its
    // 'close' comes the moment that page's document goes (its process killed or crashed, or a normal reload / removal).
    // Then, once, the main process looks whether that page's process is really gone (crashsafe:check) and crashCheck
    // decides as before; a reload, a moved frame or a removed one are told apart by its load id and isConnected.
    // (crashsafemain used to look at every preview page's process every 2 s for as long as one existed: 30 wakeups
    // a minute in the main process at idle, the warm page included.) A zombie process can still look alive for a
    // moment after the kill: looked at again twice.
    let life = null;
    const lifeLine = () => {
      try { life?.close(); } catch { /* gone */ }
      life = null;
      if (target !== 'frame' || !frame.contentWindow || typeof MessageChannel !== 'function' || !window.hub?.crashsafe?.check) return;
      const ch = new MessageChannel(); const n = nonce; life = ch.port1;
      ch.port1.addEventListener('close', () => {
        if (life !== ch.port1) return;
        life = null;
        if (n !== nonce || !frame.isConnected) return; // (a new load or the frame removed: not a crash)
        const ask = (left) => window.hub.crashsafe.check().then((r) => {
          if (r) crashCheck(r);
          if (left && n === nonce && ready && !gl.lost) setTimeout(() => ask(left - 1), 700);
        }, () => {});
        ask(2);
      });
      ch.port1.start();
      try { frame.contentWindow.postMessage({ target: 'three-sandbox', type: 'life' }, '*', [ch.port2]); } catch { life = null; }
    };
    // (round 50) the GPU came back and the page is building its layers again ('gpu-restoring'): no longer waiting for
    // the GPU but for the rebuild, which on a busy computer can take longer than the GPU wait (a new page was made for
    // a GPU that was back). A rebuild that never ends still gets a new page.
    const GL_REBUILD_MS = 20000;
    const glTrack = (data) => {
      if (data.type === 'gpu-lost') { gl.noneRow = data.none ? (gl.noneRow || 0) + 1 : 0; gl.epoch = data.epoch || gl.epoch + 1; if (!gl.lost) { gl.lost = true; gl.at = Date.now(); live.gl('lost', name); } clearTimeout(gl.timer); gl.timer = setTimeout(glStuck, glWaitMs()); }
      if (data.type === 'gpu-restoring' && gl.lost) { clearTimeout(gl.timer); gl.timer = setTimeout(glStuck, Math.max(GL_REBUILD_MS, glWaitMs())); }
      if (data.type === 'gpu-restored') { gl.noneRow = 0; clearTimeout(gl.timer); gl.timer = 0; if (gl.lost) { gl.lost = false; gl.restored += 1; live.gl('restored', name); } }
    };
    const handle = (data) => {
      if (data?.source !== 'three-sandbox') return;
      if (!nonce) return; // a deliberately unloaded workspace cannot wake from an old page's messages
      if (data.type === 'gpu-lost' || data.type === 'gpu-restored' || data.type === 'gpu-restoring') glTrack(data);
      if (data.type === 'lib-need') { sandboxLib(data.name, deliver); return; } // (round 25, diet) motion / lab3d for the page
      if (data.type === 'shot' && data.tag === 'cover') { const fn = coverShot; coverShot = null; fn?.(data.dataUrl); return; }
      if (data.type === 'ready') {
        // A page being replaced by a newer load can still say "ready"; only the current load counts.
        if (data.n && data.n !== nonce) return;
        if (holding) { held = data; return; } // (round 74) kept until hold(false)
        // the same load saying "ready" twice: the browser restarted the page by itself (its frame was moved in the
        // page), so it is up but empty; the owner runs its content again (data.again)
        if (ready && data.n && ready.n === data.n) data.again = true;
        // (round 43, glrecover) the page made again after the GPU didn't come back: the same as above, and quiet
        if (gl.again) { gl.again = false; data.again = true; data.gl = true; if (gl.lost) { gl.lost = false; clearTimeout(gl.timer); gl.timer = 0; } }
        ready = data; retries = 0;
        lifeLine(); // (round 51) this page's crash heard as an event, not polled
        // a sketch page uncovers once its layers have drawn (stack-drawn); the others right away
        if (mode !== 'sketch') setTimeout(uncover, 160);
        else { clearTimeout(coverT); coverT = setTimeout(uncover, 2600); }
        try { window.LabGrade?.onPage?.(deliver); } catch { /* (round 24) imported .cube LUTs for this page: tools/three-grade.js */ }
        for (const m of queue) deliver(m);
        queue = [];
      }
      if (data.type === 'stack-drawn' && !data.noGl) gl.noneRow = 0; // (round 51) a page that drew with a context: the GPU is there
      if (data.type === 'stack-drawn' && ready && !cover.classList.contains('out')) requestAnimationFrame(uncover);
      onMessage(data);
    };
    const listener = (e) => { if (target === 'frame' && e.source === frame.contentWindow) handle(e.data); };
    addEventListener('message', listener);
    const RUNS = /^(run-layers|swap-layers)$/;
    const post = (m) => {
      live.sent(name, m.type, m.layer?.id);
      if (ready) { deliver(m); return; }
      // a newer whole run replaces the runs still waiting for the page (each would run every layer again)
      if (RUNS.test(m.type)) queue = queue.filter((x) => !RUNS.test(x.type) && x.type !== 'hot-layer' && x.type !== 'remove-layer');
      queue.push(m);
    };
    // Slider moves arrive faster than the picture redraws (several pointer events per frame, more with a fast mouse):
    // only the latest value per slider is sent, once per frame, so the sandbox doesn't run a slider's onChange for
    // values nobody sees. Any other message sends the waiting moves first, so the order stays the same. (The timer is
    // for a hidden window, where frames don't run: the Stage window still shows the picture.)
    // (round 21, labhub) …except the first move after a frame: it goes out at the end of its own task (with whatever
    // else moved in that task: a shuffle, a look, a morph step), so the preview can show it in the frame that's coming
    // instead of the one after (a rAF-time send lands after that frame's rendering: one frame late, 4–16 ms).
    const tweaks = new Map(); let tweakRaf = 0; let tweakTimer = 0; let tweakMicro = false; let tweakFrame = -1;
    const flushTweaks = () => {
      cancelAnimationFrame(tweakRaf); clearTimeout(tweakTimer); tweakRaf = 0; tweakTimer = 0;
      const list = [...tweaks.values()]; tweaks.clear();
      for (const m of list) post(m);
    };
    const send = (msg) => {
      const m = { target: 'three-sandbox', ...msg };
      if (m.type === 'tweak') {
        const k = `${m.layer ?? ''}|${m.index}`;
        tweaks.delete(k); tweaks.set(k, m); // re-inserted: a slider moved again goes after the others
        if (tweakMicro || tweakRaf) return;
        const frameNow = document.timeline?.currentTime ?? -2;
        if (frameNow !== tweakFrame) { tweakMicro = true; queueMicrotask(() => { tweakMicro = false; tweakFrame = document.timeline?.currentTime ?? -2; if (tweaks.size) flushTweaks(); }); return; }
        tweakRaf = requestAnimationFrame(flushTweaks); tweakTimer = setTimeout(flushTweaks, 50);
        return;
      }
      if (tweaks.size) flushTweaks();
      post(m);
    };
    // fresh: a brand-new page (the iframe is taken out and put back, the Stage window is recreated), for when a
    // sketch bugs out: hung code, a lost GPU context, stuck audio.
    // A load that never says "ready" (seen when a reload lands while the page before it is still starting: black
    // preview, nothing plays, "not rendering") is retried with a fresh page, twice at most.
    let watchdog = 0; let retries = 0;
    // (round 74, projdesk74) a page loaded ahead of its scene (a project opened from Projects: ThreeLab.workspace.preload)
    // keeps its 'ready' to itself until the scene is there to run (hold(false)): to the Lab it is still loading, so the
    // run waits for it instead of loading another, and everything the Lab sends a fresh page (its triggers, loop clock…)
    // is for the scene that runs in it
    let holding = false; let held = null;
    const unhide = (on) => { for (const [k, v] of [['visibility', 'visible'], ['opacity', '0'], ['pointerEvents', 'none']]) frame.style[k] = on ? v : ''; };
    const queryNow = () => `?mode=${mode}&v=${store.get('three.version', ThreeData.VERSIONS[0])}${extraParams()}${typeof H !== 'undefined' && H.config?.settings?.gpuPower === 'saver' ? '&gpu=low' : ''}`; // (round 52, gpu52: /graphics power saver)
    const load = (fresh = false) => {
      if (!gl.again && gl.lost) { gl.lost = false; clearTimeout(gl.timer); gl.timer = 0; } // (round 147, safeopen147) a new page on purpose: the lost one isn't waited for (nor made again)
      if (holding) unhide(false); holding = false; held = null; // (round 74) a new load is never held
      if (tweaks.size) flushTweaks(); // to the page they were meant for, as before
      // (round 37, labboot) the first load of a warmed preview: the page is (or is getting) up for this same query, so it
      // is taken as it is: no new page, its 'ready' handled as if it came now (a different query: a normal load below)
      const w = warmed; warmed = null;
      const got = w && !fresh && target === 'frame' ? w.adopt(queryNow()) : null;
      if (got) {
        nonce = got.n; loadedWith = queryNow(); ready = null; retries = 0;
        live.reload(name);
        clearTimeout(watchdog);
        if (got.ready) { deliver({ target: 'three-sandbox', type: 'park', on: false }); warmRun = got.ran === 'drawn' ? got.sketch || true : false; handle(got.ready); } else {
          const mine = nonce;
          watchdog = setTimeout(() => { if (!ready && nonce === mine && target === 'frame' && frame.isConnected && retries < 2) { retries += 1; load(true); } }, 10000);
        }
        return;
      }
      const showing = pretty && ready && target === 'frame' && frame.isConnected && frame.checkVisibility?.({ visibilityProperty: true });
      ready = null;
      nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      clearTimeout(watchdog);
      const mine = nonce;
      live.reload(name);
      watchdog = setTimeout(() => { if (!ready && nonce === mine && target === 'frame' && frame.isConnected && retries < 2) { retries += 1; console.warn(`Lab ${mode} preview didn't start; reloading it (${retries})`); load(true); } }, 10000);
      loadedWith = queryNow();
      const query = `${loadedWith}&n=${nonce}`;
      const sz = target === 'stage' ? stageSize() : null;
      const go = () => {
        if (nonce !== mine) return; // a newer load took over while the picture came
        if (target === 'stage') window.hub.stageOpen({ query: `${query}${sz ? `&fw=${sz.width}&fh=${sz.height}` : ''}`, width: sz?.width, height: sz?.height, fresh });
        else {
          if (fresh && frame.parentNode) { const p = frame.parentNode; const next = frame.nextSibling; frame.remove(); p.insertBefore(frame, next); }
          frame.src = `${SANDBOX}${query}`;
        }
      };
      const coverUp = (url) => {
        if (target !== 'frame') return;
        if (url) { cover.style.backgroundImage = `url("${url}")`; cover.classList.add('snap'); cover.dataset.own = '1'; }
        cover.classList.remove('out'); clearTimeout(coverT); coverT = setTimeout(uncover, 4000); // never left covered
      };
      // The picture on screen now, as the cover (a quick JPEG from the page itself), then the reload. The old page
      // keeps playing while it answers; a picture that comes too late still goes on the cover if that's still up.
      // (a picture already laid on the cover by the caller, chat-scenes.js switching chats, is used as it is)
      if (showing && cover.classList.contains('snap') && cover.style.backgroundImage) { coverUp(null); go(); } else if (showing) {
        let done = false;
        const finish = (url) => {
          if (done) { if (url && nonce === mine && !cover.classList.contains('out') && !cover.style.backgroundImage) { cover.style.backgroundImage = `url("${url}")`; cover.classList.add('snap'); cover.dataset.own = '1'; } return; }
          done = true; if (nonce === mine) coverUp(url); go();
        };
        coverShot = finish;
        try { deliver({ target: 'three-sandbox', type: 'screenshot', tag: 'cover' }); } catch { finish(null); }
        setTimeout(() => finish(null), 700);
      } else { coverUp(null); go(); }
    };
    let stageWired = false;
    let onStageClosed = null;
    // Run in the Stage window (on) or back here (off). The iframe sleeps while the Stage runs.
    function useStage(on, sizeFn = () => null) {
      if (!stageWired) {
        stageWired = true;
        window.hub.onStageMessage((data) => { if (target === 'stage') handle(data); });
        window.hub.onStageClosed(() => { if (target !== 'stage') return; target = 'frame'; load(); onStageClosed?.(); });
      }
      stageSize = sizeFn;
      if (on) { target = 'stage'; frame.src = 'about:blank'; } else { target = 'frame'; window.hub.stageClose(); }
      load();
    }
    if (!lazy) load();
    return {
      frame, send, reload: (fresh) => load(Boolean(fresh)), useStage,
      // (round 74, projdesk74) hold(true) right after a load: its 'ready' waits; hold(false) lets it through (now, if it came)
      // While held, the frame is drawn though its Lab is hidden (visible, transparent, click-through, like LabBoot's warm
      // page): Chromium throttles a frame inside a hidden surface, and a page loaded that way came up slower than a new one
      hold(on) { holding = Boolean(on); unhide(holding); if (!holding && held) { const d = held; held = null; handle(d); } },
      release() {
        if (holding) unhide(false); holding = false; held = null; // (round 74)
        nonce = null; ready = null; loadedWith = null; queue = []; warmRun = false;
        clearTimeout(watchdog); clearTimeout(coverT); clearTimeout(gl.timer); gl.lost = false; gl.again = false;
        cancelAnimationFrame(tweakRaf); clearTimeout(tweakTimer); tweaks.clear(); tweakRaf = 0;
        const port = life; life = null; port?.close();
        if (target === 'stage') { target = 'frame'; window.hub.stageClose(); }
        frame.src = 'about:blank'; uncover();
      },
      // (round 161, fix161) for good (ThreeLab.drop): released, and its window listener gone (a new Lab makes a new one)
      dispose() { this.release(); window.__labFrames?.delete(crashCheck); window.LabGrade?.offPage?.(deliver); removeEventListener('message', listener); target = 'gone'; onMessage = () => {}; onStageClosed = null; },
      // (round 37, labboot) once: the page just taken over drew a warm run (of this sketch id): run() swaps over it
      takeWarmRun: () => { const r = warmRun; warmRun = false; return r; },
      // (round 37, labboot) the page was loaded for another ?dpr= only (fit ⇄ an exact frame size): it switches in place
      // instead of a new page (run() then runs the scene again in it); false when something else differs
      retune() {
        const want = queryNow(); const noDpr = (q) => String(q).replace('&dpr=1', '');
        if (!ready?.dprLive || target !== 'frame' || !loadedWith || loadedWith === want || noDpr(loadedWith) !== noDpr(want)) return false;
        if (tweaks.size) flushTweaks();
        deliver({ target: 'three-sandbox', type: 'dpr', value: /&dpr=1/.test(want) ? 1 : null });
        loadedWith = want; live.retune(name);
        return true;
      },
      // (round 29, bugbash) the picture on screen now as a small JPEG the page makes at once (the cover's own shot: no
      // waiting for a frame, no full-size PNG), for chat switching's cross-fade (chat-scenes.js); null if not up in time
      cover: (ms = 700) => new Promise((resolve) => {
        if (target !== 'frame' || !ready) { resolve(null); return; }
        let done = false;
        const fin = (url) => { if (!done) { done = true; resolve(url || null); } };
        const prev = coverShot;
        coverShot = (url) => { prev?.(url); fin(url); };
        try { deliver({ target: 'three-sandbox', type: 'screenshot', tag: 'cover' }); } catch { fin(null); }
        setTimeout(() => fin(null), ms);
      }),
      set onStageClosed(fn) { onStageClosed = fn; },
      // (round 43, glrecover) is the page without its GPU contexts right now; { lost, stuck, restored, since }
      get gl() { return { lost: gl.lost, stuck: gl.stuck, restored: gl.restored, since: gl.lost ? gl.at : 0, remaking: gl.again }; },
      get onStage() { return target === 'stage'; },
      get revision() { return ready?.revision; }, get ready() { return Boolean(ready); },
      get query() { return loadedWith; }, // (round 37, labboot)
      get warm() { return Boolean(warmed); }, // (round 112, labopen112) a page from tools/three-boot.js waits to be taken at the first load
      // a load is on its way (its runs wait in the queue): no need to load again
      get loading() { return Boolean(nonce) && !ready; },
      get n() { return nonce; }, // (round 147, safeopen147) this load's id: a hung page's process is ended by it (crashsafe:unstick)
      // the page was loaded for another three.js version or pixel ratio than the one wanted now
      get stale() { return loadedWith !== queryNow(); },
    };
  }

  // ---------- live: what each change does to the preview ----------
  // Page reloads vs in-place updates of the Lab preview (and the backstage), with why, for dev/checks/live.js and
  // docs/upgrades/live.md (ThreeLab.live.counts()). `why` is the director tool being handled, else 'ui'.
  const live = (() => {
    const c = { reloads: {}, sent: {}, log: [] };
    let why = null;
    const onReload = new Set(); // (round 72, labbridge72) (name) => …: a page that reloads drops what it was answering
    const COUNTED = /^(hot-layer|swap-layers|run-layers|remove-layer|layer-props|media-unload)$/;
    const note = (what, layer) => { c.log.push({ at: Date.now(), what, why: why || 'ui', ...(layer ? { layer } : {}) }); if (c.log.length > 200) c.log.splice(0, c.log.length - 200); };
    return {
      reload(name) { c.reloads[name] = (c.reloads[name] || 0) + 1; note(`reload ${name}`); for (const fn of onReload) { try { fn(name); } catch (err) { console.warn(err); } } },
      onReload(fn) { onReload.add(fn); return () => onReload.delete(fn); },
      retune(name) { c.retunes = (c.retunes || 0) + 1; note(`retune ${name}`); }, // (round 37, labboot) fit ⇄ exact size in place
      gl(what, name) { const g = (c.gl ||= {}); g[what] = (g[what] || 0) + 1; note(`gpu ${what} ${name}`); }, // (round 43, glrecover) lost / restored / stuck
      sent(name, type, layer) { if (!COUNTED.test(type)) return; const k = `${name} ${type}`; c.sent[k] = (c.sent[k] || 0) + 1; if (type !== 'layer-props') note(k, layer); }, // (round 93, tidy93) + which layer a hot run was
      set why(v) { why = v; }, get why() { return why; },
      counts: () => JSON.parse(JSON.stringify(c)),
    };
  })();

  // ---------- the code editor ----------
  // (round 21, labhub) ui.js's CodeEditor writes the whole code again as highlighted HTML on each key, and every line
  // number as an element of its own: each of those elements is matched against all of the app's stylesheets, so a key
  // cost ~0.3 s in a 2,000-line sketch. This one keeps ui.js's editing (its keys, Tab, comment, auto-close, undo) and
  // draws differently:
  //   · the highlighted copy lives in a shadow root, where only its six color rules apply (not the app's CSS),
  //   · only the lines on screen and a margin around them are highlighted; scrolling past the margin draws the next
  //     window (a multi-line comment or template string, GLSL in backticks, is never cut in half),
  //   · the line numbers are one block of text (error lines are the only elements),
  //   · a key reads no layout: the scroll position comes from the scroll events.
  const EDIT_MARGIN = 60;
  // the comments and strings, as md.js's highlighter sees them (words and numbers can't hold a quote or a slash, so
  // scanning only these finds the same ones)
  const SPAN_RE = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;
  const HL_KINDS = ['c', 's', 'n', 'k', 'f', 't'];
  const hlEditors = new Set();
  let hlVars = null; let hlSheet = null; let hlWatch = null;
  // the colors the app's theme gives .hl-* (features.css, forge-skin.css, look.css), read from probes, again when the
  // theme changes (an attribute on <html>: data-scheme, data-skin, data-look…)
  function hlTheme() {
    const box = el('div', { attrs: { 'aria-hidden': 'true' }, style: { position: 'fixed', left: '-9999px', top: '0', visibility: 'hidden' } }, HL_KINDS.map((k) => el('span', { class: `hl-${k}`, text: 'x' })));
    document.body.append(box);
    const vars = {};
    [...box.children].forEach((sp, i) => { const cs = getComputedStyle(sp); vars[`--lab-hl-${HL_KINDS[i]}`] = cs.color; vars[`--lab-hl-${HL_KINDS[i]}-i`] = cs.fontStyle; });
    box.remove();
    const same = hlVars && Object.keys(vars).every((k) => hlVars[k] === vars[k]);
    hlVars = vars;
    if (!same) for (const ed of hlEditors) ed.paintTheme();
  }
  function hlSetup() {
    if (hlSheet) return;
    hlSheet = new CSSStyleSheet();
    hlSheet.replaceSync(HL_KINDS.map((k) => `.hl-${k} { color: var(--lab-hl-${k}); font-style: var(--lab-hl-${k}-i); }`).join('\n'));
    let q = 0;
    hlWatch = new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; hlTheme(); }); });
    hlWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-scheme', 'data-skin', 'data-look', 'data-theme'] });
    // (round 52) read in the next frame, not while the Lab is being built: the colours' read styled the whole page
    // before the Lab's scenes were even asked for (≈ 10 ms of the opening); the editors get them then (paintTheme)
    requestAnimationFrame(() => hlTheme());
  }
  class LabEditor extends CodeEditor {
    constructor(parent, opts) {
      super(parent, opts); // (ui.js's constructor sets the first value; it's drawn below, once this is set up)
      hlSetup();
      this.host = el('div', { class: 'lab-hl' });
      this.pre.replaceChildren(this.host);
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.adoptedStyleSheets = [hlSheet];
      this.vw = { a: -1, b: -1, v: null, starts: [0], spans: [], lh: 0, pad: 0, top: null, left: 0, h: 0 };
      this.gutterTop = null;
      hlEditors.add(this);
      this.paintTheme();
      // (round 54, labsmooth54) hidden (the code is folded away, as it mostly is): nothing to draw, and no layout to read.
      // A director edit or a layer switch sets the code while it's hidden: drawing it then read the textarea's place
      // and size, which laid out the whole Lab inside that edit (≈ 12 ms here). It's drawn when it shows again.
      this.folded = false;
      new ResizeObserver((es) => { const r = es.at(-1)?.contentRect; this.folded = Boolean(r) && !(r.width > 0 && r.height > 0); if (!this.folded) this.draw(false); }).observe(this.area);
      this.refresh(false);
    }
    paintTheme() { for (const [k, v] of Object.entries(hlVars || {})) this.host.style.setProperty(k, v); }
    refresh(changed) {
      if (!this.shadow) return;
      if (this.folded) { this.vw.top = null; this.vw.a = -1; this.vw.b = -1; if (changed) this.onChange?.(this.area.value); return; } // (drawn in full on showing: see the ResizeObserver)
      // (round 57, lab240edit) a key: drawn at the start of the coming frame, once, before it paints (the same frame as
      // before). Drawn inside each key, the new highlight left the page to lay out again, and the next key's own editing
      // (Backspace, the next letter) laid it out inside that key, ≈ 3 a key here; keys faster than frames drew each time.
      if (changed) this.drawSoon(true, true); else this.draw(true, false); // (a key: the scroll position from the last scroll event, no layout read in the key)
      if (changed) this.onChange?.(this.area.value);
    }
    // one draw in the coming frame for everything asked since the last one (keys, scroll events: a scroll event comes in
    // the frame's own steps, before its animation frames, so it is still drawn in that frame)
    drawSoon(force, cached) {
      this.dForce = this.dForce || force; this.dFresh = this.dFresh || !cached;
      if (this.drawRaf) return;
      this.drawRaf = requestAnimationFrame(() => {
        this.drawRaf = 0;
        if (this.folded) { this.dForce = false; this.dFresh = false; this.vw.top = null; this.vw.a = -1; this.vw.b = -1; return; }
        this.draw(false, true);
      });
    }
    // the same error lines as before (every run sets them): nothing to redraw
    setErrorLines(lines) {
      const next = new Set(lines);
      if (next.size === this.errors.size && [...next].every((x) => this.errors.has(x))) return;
      this.errors = next;
      if (this.shadow) this.paintGutter();
    }
    renderGutter() { if (this.shadow) this.paintGutter(); }
    syncScroll() { if (this.shadow) this.drawSoon(false, false); } // (round 57: read in the frame, after the key's own layout)
    // the window's line numbers: one block of text, an element only for each line with an error
    paintGutter() {
      const w = this.vw; if (w.a < 0) return;
      let g = `<div style="height:${w.a * w.lh}px"></div>`; let run = [];
      const flush = () => { if (run.length) g += `<div style="white-space:pre">${run.join('\n')}</div>`; run = []; };
      for (let i = w.a + 1; i <= w.b; i += 1) { if (this.errors.has(i)) { flush(); g += `<div class="err">${i}</div>`; } else run.push(i); }
      flush();
      this.gutter.innerHTML = g;
      this.gutterTop = null; // (new content can move its scroll)
    }
    // where each line starts, and the comments / strings that run over several lines (once per text)
    index(v) {
      const w = this.vw;
      if (w.v === v) return;
      const starts = [0]; let i = -1;
      while ((i = v.indexOf('\n', i + 1)) >= 0) starts.push(i + 1);
      const spans = [];
      SPAN_RE.lastIndex = 0;
      for (let m = SPAN_RE.exec(v); m; m = SPAN_RE.exec(v)) if (m[0].indexOf('\n') >= 0) spans.push(m.index, m.index + m[0].length);
      Object.assign(w, { v, starts, spans });
    }
    lineAt(off) { const s = this.vw.starts; let lo = 0; let hi = s.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= off) lo = mid; else hi = mid - 1; } return lo; }
    // the multi-line span that holds offset `off` inside it → [start, end], else null
    spanOver(off) {
      const sp = this.vw.spans; let lo = 0; let hi = sp.length / 2 - 1; let k = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (sp[mid * 2] < off) { k = mid; lo = mid + 1; } else hi = mid - 1; }
      return k >= 0 && sp[k * 2 + 1] > off ? [sp[k * 2], sp[k * 2 + 1]] : null;
    }
    draw(force, cached = false) {
      if (this.drawRaf) { cancelAnimationFrame(this.drawRaf); this.drawRaf = 0; } // (a draw waiting for the frame: this one does it)
      if (this.dForce || this.dFresh) { force = force || this.dForce; cached = cached && !this.dFresh; this.dForce = false; this.dFresh = false; }
      const w = this.vw; const ar = this.area;
      if (!w.lh) { w.lh = parseFloat(getComputedStyle(ar).lineHeight) || 19; w.pad = parseFloat(getComputedStyle(this.pre).paddingTop) || 10; cached = false; }
      if (!cached || w.top == null) { w.top = ar.scrollTop; w.left = ar.scrollLeft; w.h = ar.clientHeight || 600; }
      const top = w.top; const h = w.h;
      const first = Math.max(0, Math.floor((top - w.pad) / w.lh)); const last = first + Math.ceil(h / w.lh) + 1;
      const v = ar.value;
      if (force || w.v !== v || first < w.a || last > w.b) {
        this.index(v);
        const n = w.starts.length;
        let a = Math.max(0, first - EDIT_MARGIN); let b = Math.min(n, last + EDIT_MARGIN);
        const over = this.spanOver(w.starts[a]); if (over) a = this.lineAt(over[0]);
        if (b < n) { const o2 = this.spanOver(w.starts[b] - 1); if (o2) b = Math.min(n, this.lineAt(o2[1]) + 1); }
        const text = v.slice(w.starts[a], b < n ? w.starts[b] - 1 : v.length);
        this.shadow.innerHTML = `${highlight(text, this.lang)}\n`;
        const moved = a !== w.a || b !== w.b; w.a = a; w.b = b;
        if (moved) this.paintGutter(); // (the line numbers only change with the window)
      }
      const tf = `translate(${-w.left}px, ${w.a * w.lh - top}px)`;
      if (this.pre.style.transform !== tf) this.pre.style.transform = tf;
      if (this.gutterTop !== top) { this.gutter.scrollTop = top; this.gutterTop = top; }
    }
  }

  // (round 21, labhub) the Lab's own dialogs (your sketches, templates, references, history, keys, contact sheet) open
  // without showModal(): a modal dialog makes the rest of the app inert, which restyles every element of it (~30 ms in
  // an empty app, hundreds with long chats open) before the dialog shows. They look and close the same: centered over
  // a dim backdrop, Esc, their buttons, or a click on the backdrop.
  function openLight(dlg) {
    dlg.classList.add('lab-light-dlg');
    const shade = el('div', { class: 'lab-light-shade', on: { pointerdown: (e) => { e.preventDefault(); dlg.close(); } } });
    const esc = (e) => { if (e.key === 'Escape' && dlg.open) { e.preventDefault(); e.stopPropagation(); dlg.close(); } };
    dlg.addEventListener('keydown', esc);
    dlg.addEventListener('close', () => shade.remove(), { once: true });
    dlg.before(shade);
    dlg.show();
    const first = dlg.querySelector('[autofocus], input, button.primary, button');
    if (!dlg.contains(document.activeElement)) first?.focus({ preventScroll: true });
  }

  // ---------- Sketch tab ----------
  // A sketch is a stack of layers (tools/three-layers.js); a sketch without `layers` is one layer whose
  // code is sketch.code. The editor, sliders and history always show the selected layer.
  const SLOT = 10000; // each layer's slider values live from slot × SLOT in the sandbox
  function sketchTab(pane) {
    // (round 161, fix161) ThreeLab.drop(): while the Lab window holds the scene, Hearth's window lets its Lab go entirely
    // (its DOM, state, preview page): what this tab hooks outside its own DOM is let go with it. The bare names below are
    // this tab's own: window listeners with one AbortSignal, the observers and intervals it starts, its chat hooks.
    const life = { ac: new AbortController(), obs: [], iv: new Set(), to: new Set(), undo: [] };
    life.hook = (list, fn) => { list.push(fn); life.undo.push(() => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }); };
    const scoped = (o) => (o === true ? { capture: true, signal: life.ac.signal } : { ...(o && typeof o === 'object' ? o : {}), signal: life.ac.signal });
    const addEventListener = (t, fn, o) => window.addEventListener(t, fn, scoped(o));
    const docOn = (t, fn, o) => document.addEventListener(t, fn, scoped(o));
    const tracked = (C) => (C ? class extends C { constructor(cb) { super(cb); life.obs.push(this); } } : C);
    const MutationObserver = tracked(window.MutationObserver); const IntersectionObserver = tracked(window.IntersectionObserver); const ResizeObserver = tracked(window.ResizeObserver);
    const setInterval = (fn, ms, ...a) => { const t = window.setInterval(fn, ms, ...a); life.iv.add(t); return t; };
    // (its timeouts too: one still waiting when the tab is let go would keep it until it fires; the saves are flushed first)
    const setTimeout = (fn, ms, ...a) => { const t = window.setTimeout(() => { life.to.delete(t); fn(...a); }, ms); life.to.add(t); return t; };
    // (round 158, split158) what the Lab's cold parts (tools/three-lab-*.js, loaded on first use: labPart) reach in here
    const K = {
      get CONSOLE_MODES() { return CONSOLE_MODES; }, get FILES_MAX() { return FILES_MAX; },
      get FPS_OPTS() { return FPS_OPTS; }, get GUIDES() { return GUIDES; }, get MIMES() { return MIMES; },
      get PAD_ACTIONS() { return PAD_ACTIONS; }, get Q_NAMES() { return Q_NAMES; },
      get REF_ICONS() { return REF_ICONS; }, get adaptHeld() { return adaptHeld; }, get adaptOn() { return adaptOn; },
      addLayer, addRef, get animatedProps() { return animatedProps; }, get api() { return api; }, applyPreset,
      applyTrigPreset, askAbout, askDirector, get assetCacheOn() { return assetCacheOn; },
      get autoBox() { return autoBox; }, get autoRun() { return autoRun; }, get box() { return box; }, browseSketches,
      get btn() { return btn; }, get clockPath() { return clockPath; }, get consoleBox() { return consoleBox; },
      get consoleLines() { return consoleLines; }, set consoleLines(x) { consoleLines = x; },
      get consoleMode() { return consoleMode; }, get consoleWrap() { return consoleWrap; },
      get controllers() { return controllers; },
      get copyNextShot() { return copyNextShot; }, set copyNextShot(x) { copyNextShot = x; }, create,
      get current() { return current; }, cycleGuides, get director() { return director; }, duplicate,
      get editBtn() { return editBtn; }, editLayer, get editOn() { return editOn; }, set editOn(x) { editOn = x; },
      get editPanel() { return editPanel; }, get editSel() { return editSel; }, set editSel(x) { editSel = x; },
      get editUndo() { return editUndo; }, get editor() { return editor; }, ensureTimeline,
      get errors() { return errors; }, exportHtml, get extras() { return extras; },
      get fileBytes() { return fileBytes; }, get fileUrl() { return fileUrl; }, get fmtClock() { return fmtClock; },
      get fmtMs() { return fmtMs; }, get fmtSize() { return fmtSize; }, get focusOn() { return focusOn; },
      get footBox() { return footBox; }, get fpsPref() { return fpsPref; }, get fpsSel() { return fpsSel; },
      framesToDirector, freezeOn, get frozenNow() { return frozenNow; },
      get guides() { return guides; }, set guides(x) { guides = x; }, get guidesBtn() { return guidesBtn; },
      get histKey() { return histKey; }, get histRead() { return histRead; }, get history() { return history; },
      historyDialog, get hubLive() { return hubLive; }, hubLiveStop,
      get hudTimer() { return hudTimer; }, set hudTimer(x) { hudTimer = x; }, get keysOf() { return keysOf; },
      get kvOk() { return kvOk; }, labKeys, get labMoreBtn() { return labMoreBtn; }, laneProps,
      get lanesOf() { return lanesOf; }, get lastStats() { return lastStats; }, get layerById() { return layerById; },
      get layerProps() { return layerProps; }, get layerStudio() { return layerStudio; },
      get layersOf() { return layersOf; }, get layersPanel() { return layersPanel; },
      get lightOn() { return lightOn; }, listRefFiles, get liteRow() { return liteRow; },
      get liveBpm() { return liveBpm; }, get liveIo() { return liveIo; }, get liveKind() { return liveKind; },
      get liveOpts() { return liveOpts; }, loadHist, loadRefBytes,
      get lookBar() { return lookBar; }, set lookBar(x) { lookBar = x; },
      get lookCycle() { return lookCycle; }, set lookCycle(x) { lookCycle = x; }, lookCycleMenu,
      get lookTimer() { return lookTimer; }, set lookTimer(x) { lookTimer = x; },
      get midi() { return midi; }, set midi(x) { midi = x; }, get midiBtn() { return midiBtn; },
      get midiDevices() { return midiDevices; },
      get midiLearn() { return midiLearn; }, set midiLearn(x) { midiLearn = x; }, get midiMap() { return midiMap; },
      get midiPads() { return midiPads; }, get midiRelease() { return midiRelease; },
      get midiSeen() { return midiSeen; }, set midiSeen(x) { midiSeen = x; }, get notesAll() { return notesAll; },
      get notesOf() { return notesOf; }, get np() { return np; }, set np(x) { np = x; },
      get npBox() { return npBox; }, openLight, openSketch, get outlinerBtn() { return outlinerBtn; },
      get paceLast() { return paceLast; }, get paceOn() { return paceOn; }, get paceText() { return paceText; },
      get paintMode() { return paintMode; }, paintOnion, paletteFrom, parseColors,
      get perfHudOn() { return perfHudOn; }, persist, pinFrame, get pinned() { return pinned; },
      get placements() { return placements; }, get playGame() { return playGame; }, get player() { return player; },
      pngBlob, get pngBytes() { return pngBytes; }, popup, get presentHud() { return presentHud; },
      get previewHost() { return previewHost; }, pushEditUndo, get qGlobal() { return qGlobal; },
      get qMode() { return qMode; }, recolor, get refAdded() { return refAdded; }, set refAdded(x) { refAdded = x; },
      get refBytes() { return refBytes; }, get refFiles() { return refFiles; }, refKey,
      get refKindOf() { return refKindOf; }, get refReady() { return refReady; }, get refSigs() { return refSigs; },
      get refUse() { return refUse; }, get refsAll() { return refsAll; },
      get refsDlg() { return refsDlg; }, set refsDlg(x) { refsDlg = x; },
      get refsGrid() { return refsGrid; }, set refsGrid(x) { refsGrid = x; }, get refsOf() { return refsOf; },
      get refsSig() { return refsSig; }, set refsSig(x) { refsSig = x; }, get refsSigOf() { return refsSigOf; },
      removeLayers, removeRef, removeSketch, get removedIds() { return removedIds; }, renameRef, renameSketch,
      renderLayers, renderNotes, renderPicker, renderRefsBtn, renderTracksOnly, reorderLayers, restartSim, run,
      get safeName() { return safeName; }, get save() { return save; }, saveDataUrl,
      get saveExtras() { return saveExtras; }, saveHistory, get saveNotes() { return saveNotes; }, savePalette,
      get saveRefs() { return saveRefs; }, get saveTriggers() { return saveTriggers; },
      get savedPalettes() { return savedPalettes; }, get sel() { return sel; }, get selBox() { return selBox; },
      get selCtl() { return selCtl; }, get selId() { return selId; }, selectLayer, sendKeys, sendRefs,
      get sendTriggers() { return sendTriggers; }, setCodeVisible, setCompare, setConsoleMode, setFocus, setFreeze,
      setLanes, setLight, setLive, setLiveIo, get setLiveOpt() { return setLiveOpt; }, setPaceOn, setPalette,
      setPerfHud, setQuality, setSlidersVisible, setSolo, setStage, setWrite,
      get sheetBusy() { return sheetBusy; }, set sheetBusy(x) { sheetBusy = x; }, showSheet,
      get sketchMenuBtn() { return sketchMenuBtn; },
      get sketches() { return sketches; }, set sketches(x) { sketches = x; }, get sleep() { return sleep; }, snapshot,
      snippetMenu, get soloNow() { return soloNow; }, get spaceBtn() { return spaceBtn; },
      get stage() { return stage; }, startNowPlaying, still, stillsAt, stillsFolder, stopNowPlaying,
      get studioImpl() { return studioImpl; }, set studioImpl(x) { studioImpl = x; }, syncKeyUI, takeNote,
      templateGallery, get thumbs() { return thumbs; }, togglePresent, toggleTriggers, touch,
      get trash() { return trash; }, set trash(x) { trash = x; },
      get trigCfg() { return trigCfg; }, set trigCfg(x) { trigCfg = x; }, get trigPanel() { return trigPanel; },
      get trigPresets() { return trigPresets; },
      get trigTuned() { return trigTuned; }, set trigTuned(x) { trigTuned = x; }, get version() { return version; },
      versionMenu, get withFiles() { return withFiles; }, get writeArmed() { return writeArmed; },
    };
    let sketches = [];
    // (round 43, scenesafe) a store is written only once it was read for sure: a read that failed (Windows: a file held
    // by an antivirus / OneDrive / iCloud for a moment) used to look like "no scenes", and the starter scene was saved
    // over yours. kvOk: the stores read fine (or truly not there yet); removedIds: scenes deleted on purpose since the
    // last save (the store keeps any other scene a save would drop: scenesafe-core.js)
    const kvOk = new Set();
    const removedIds = new Set();
    let current = null;
    let selId = null; // selected layer
    // (round 44, layergroups) solo is saved with the scene now, as layer data (tools/three-groups-core.js): what shows
    // alone is what every render / export / variation draws too
    const soloNow = () => (typeof LayerGroups !== 'undefined' ? LayerGroups.soloId(current?.layers || []) : null);
    if (!store.get('three.autorunLive')) { store.set('three.autorun', true); store.set('three.autorunLive', true); }
    let autoRun = store.get('three.autorun', true);
    let errors = [];
    const consoleBox = el('div', { class: 'three-console' });
    const stats = el('div', { class: 'three-stats fb-keep' }); // (round 64, framebar64: the fps and the frame budget bar stay on screen; the rest shows on hover)
    const picker = el('select', { class: 'three-sketch-select', title: 'Your sketches' });
    const version = el('select', { title: 'three.js version' }, ThreeData.VERSIONS.map((v) => el('option', { value: v, text: `r${v.split('.')[1]} (${v})`, selected: v === store.get('three.version', ThreeData.VERSIONS[0]) })));
    const autoBox = el('input', { type: 'checkbox', checked: autoRun });
    const snippetSel = el('select', { title: 'Insert a snippet at the cursor' }, el('option', { value: '', text: 'Insert snippet…' }), ThreeData.SNIPPETS.map((s, i) => el('option', { value: i, text: s.name })));
    const editorHost = el('div', { class: 'three-editor' });
    const previewHost = el('div', { class: 'three-preview' }, stats);
    stats.title = 'Click: just fps (or everything again)';
    stats.classList.toggle('compact', store.get('three.statsCompact', false));
    stats.addEventListener('click', () => { const c = !stats.classList.contains('compact'); stats.classList.toggle('compact', c); store.set('three.statsCompact', c); });
    function labKeys(...a) { return labPart(K, 'dialogs', 'labKeys', a); } // tools/three-lab-dialogs.js
    let split = null;
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    // (round 48, labcalm) the View buttons: an icon and a label (one name each: ⚡ Sliders, </> Code, ›_ Console, ✥ Edit,
    // ▣ Present); a narrow Lab (the director docked) shows the icons only, so the toolbar keeps one row. Their text reads
    // the same as before ("⚡ Sliders"), their name for screen readers is the label, the tooltip says the rest.
    const LabCalmBar = (rows) => rows.map(([b, icon, label]) => {
      const live = b.querySelector('.tb-tx')?.textContent.trim() || (label === 'Console' ? b.textContent.trim() : label);
      b.replaceChildren(el('span', { class: 'tb-ic', text: icon, attrs: { 'aria-hidden': 'true' } }), el('span', { class: 'tb-tx', text: ` ${live}` }));
      b.setAttribute('aria-label', live); b.classList.add('tb-iconic');
      return b;
    });
    const runBtn = btn('▶ Run', 'Runs the scene again from the start (Shift+click: from scratch; Ctrl+Enter in the code: only what you changed)', (e) => (e.shiftKey ? restartSim() : run()), 'primary small');
    runBtn.dataset.key = 'Ctrl+Enter';
    const restartBtn = btn('⟲', 'Restart from scratch: a fresh page, GPU and sound, for when something bugs out (Ctrl+Shift+Enter)', () => restartSim(), 'ghost small');
    restartBtn.dataset.feature = 'Restart simulation';
    restartBtn.dataset.key = 'Ctrl+R';
    const liveLabel = el('label', { class: 'check small', title: 'Apply code changes live, a moment after you stop typing' }, autoBox, 'Live code');
    const newBtn = btn('New', 'New sketch from a template · right-click: the templates as a list', () => templateGallery(), 'ghost small imp-main');
    newBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); newMenu(e); });
    function newMenu(...a) { return labPart(K, 'dialogs', 'newMenu', a); } // tools/three-lab-dialogs.js
    // Less frequent sketch actions live in a menu (they used to take a whole toolbar row).
    const sketchMenuBtn = btn('Sketch ▾', 'Start a new one, or rename, copy, share, export or delete this one, or see its history', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      Promise.resolve(sketchMenuRows()).then((rows) => popup(r.left, r.bottom + 4, rows));
    });
    function sketchMenuRows(...a) { return labPart(K, 'menus', 'sketchMenuRows', a); } // tools/three-lab-menus.js
    // ⋯ in the Lab toolbar: the controls you rarely or never use, still one click away (with their old names for usage)
    const labMoreBtn = btn('⋯', 'More: variations, dials, make & export, the director, fix my scene, capture, code, view', (e) => { const r = e.currentTarget.getBoundingClientRect(); Promise.resolve(labMoreItems()).then((rows) => ThreeTweaks.menu(r.right - 290, r.bottom + 4, rows)); });
    labMoreBtn.dataset.feature = 'Lab more';
    // (round 153a, lite153) the quiet LITE tag beside ⋯ while Lite mode is on: a click turns it off
    const liteTag = el('button', { type: 'button', class: 'lite-tag', text: 'LITE', title: '⚡ Lite mode is on: 30 fps preview at half resolution, no glow or animations (renders stay full quality) · click to turn it off', dataset: { feature: 'Lite mode tag' }, hidden: !liteOn(), on: { click: () => { window.HearthLite?.set(false); toast('Lite mode off: everything is back as it was', { timeout: 2200 }); } } });
    function paintLiteTag() { if (liteTag.hidden === liteOn()) liteTag.hidden = !liteOn(); }
    const liteRow = () => ['⚡ Lite mode', liteOn() ? 'On: 30 fps preview at half resolution, no glow or animations · click to turn off' : 'Busy PC: 30 fps preview at half resolution, no glow, no animations (renders stay full quality)', () => { const on = window.HearthLite?.toggle(); toast(on ? '⚡ Lite mode on: 30 fps preview at half resolution, no glow, no animations. Renders stay full quality.' : 'Lite mode off: everything is back as it was', { timeout: 2600 }); }, liteOn(), 'Lite mode'];
    function labMoreItems(...a) { return labPart(K, 'menus', 'labMoreItems', a); } // tools/three-lab-menus.js
    function snippetMenu(...a) { return labPart(K, 'dialogs', 'snippetMenu', a); } // tools/three-lab-dialogs.js
    function versionMenu(...a) { return labPart(K, 'dialogs', 'versionMenu', a); } // tools/three-lab-dialogs.js
    document.body.classList.toggle('lab-nohints', store.get('three.keyHints', true) === false);
    // Key hints: hover a main button for a moment and its key shows in a small badge under it.
    const keyHint = el('div', { class: 'lab-keyhint', hidden: true });
    document.body.append(keyHint);
    let hintT = 0;
    docOn('pointerover', (e) => {
      const b = e.target.closest?.('[data-key]');
      clearTimeout(hintT);
      if (!b || document.body.classList.contains('lab-nohints') || !pane.contains(b)) { if (!keyHint.hidden) keyHint.hidden = true; return; } // (round 32) written only when shown: this runs on every pointerover in the app
      hintT = setTimeout(() => {
        if (!b.isConnected) return;
        const r = b.getBoundingClientRect();
        keyHint.textContent = b.dataset.key; keyHint.hidden = false;
        const w = keyHint.offsetWidth;
        Object.assign(keyHint.style, { left: `${Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`, top: `${r.bottom + 26 > innerHeight ? r.top - 22 : r.bottom + 4}px` });
      }, 380);
    });
    addEventListener('pointerdown', () => { clearTimeout(hintT); if (!keyHint.hidden) keyHint.hidden = true; }, true);
    let copyNextShot = false;
    const shotBtn = btn('📷', 'Save a screenshot (all layers) · Shift+click: copy it to the clipboard', (e) => { copyNextShot = e.shiftKey; box.send({ type: 'screenshot' }); }, 'ghost small imp-capture');
    shotBtn.dataset.feature = 'Screenshot';
    const toolbar = el('div', { class: 'three-toolbar' }, runBtn, liveLabel, picker, newBtn, sketchMenuBtn, snippetSel, version, el('span', { class: 'spacer' }), shotBtn);
    // Prompt-first: the code editor stays hidden until asked for.
    const codeBtn = btn('</> Code', 'Shows or hides the selected layer\'s code (the director writes it for you)', () => setCodeVisible(split.classList.contains('no-code')));
    codeBtn.classList.add('tb-code'); // (round 144, calm144) it sits in ⚙ Inspect ▾'s tray (tools/three-regroup.js)
    const slidersBtn = btn('⚡ Sliders', 'Shows or hides the Layers & knobs panel: every layer, the selected one open with its sliders', () => setSlidersVisible(column.hidden)); // (round 142, panel142) one panel
    slidersBtn.dataset.feature = 'Layers & sliders';
    const focusBtn = btn('⛶ Focus', 'Almost fullscreen: hides the chat, side panels, toolbar, sliders and console, and shrinks the timeline to the strip (F · Esc to leave)', () => setFocus(!focusOn));
    focusBtn.dataset.feature = 'Focus';
    focusBtn.dataset.key = 'Shift+F';
    // The console: always, only with the code (default), or only when you open it. Hidden, it counts new
    // errors and warnings on its button.
    const CONSOLE_MODES = [['always', 'Always show'], ['code', 'Only with the code'], ['never', 'Only when I open it']];
    let consoleMode = store.get('three.consoleMode', 'code');
    let consolePeek = null; // null: follow the mode · true / false: opened / closed by hand
    let unseen = { errors: 0, other: 0 };
    const consoleBtn = btn('Console', 'Shows or hides the scene\'s errors and messages', () => { consolePeek = !consoleShown(); syncConsole(); });
    consoleBtn.dataset.feature = 'Console';
    consoleBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); consoleMenu(e); });
    function consoleMenu(...a) { return labPart(K, 'dialogs', 'consoleMenu', a); } // tools/three-lab-dialogs.js
    consoleBtn.dataset.key = '`';
    const consoleModeSel = el('select', { class: 'tc-mode', title: 'When the console shows' }, CONSOLE_MODES.map(([v, l]) => el('option', { value: v, text: l, selected: v === consoleMode })));
    consoleModeSel.addEventListener('change', () => setConsoleMode(consoleModeSel.value));
    const consoleWrap = el('div', { class: 'three-console-wrap' },
      el('div', { class: 'three-console-head' }, el('b', { text: 'Console' }), consoleModeSel,
        el('label', { class: 'check small', title: 'Hide console.log lines, keep errors and warnings' }, el('input', { type: 'checkbox', checked: store.get('three.consoleErrors', false), on: { change: (e) => { store.set('three.consoleErrors', e.target.checked); consoleWrap.classList.toggle('errors-only', e.target.checked); } } }), 'Errors only'),
        el('span', { class: 'spacer' }),
        btn('Ask director to fix', 'Send the errors to the Three Director and ask it to fix them', () => fixErrors(), 'ghost small imp-ai tc-fix'),
        btn('Copy', 'Copy everything in the console', () => { navigator.clipboard.writeText(consoleLines.map((l) => `${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n')); toast('Console copied', { timeout: 1200 }); }),
        btn('Clear', 'Empty the console', () => { consoleBox.replaceChildren(); consoleLines = []; }),
        btn('✕', 'Hide the console (its button in the toolbar opens it again)', () => { consolePeek = false; syncConsole(); })),
      consoleBox);
    queueMicrotask(() => consoleWrap.classList.toggle('errors-only', store.get('three.consoleErrors', false)));
    function fixErrors(...a) { return labPart(K, 'dialogs', 'fixErrors', a); } // tools/three-lab-dialogs.js
    function consoleShown() { return consolePeek ?? (consoleMode === 'always' || (consoleMode === 'code' && !split?.classList.contains('no-code'))); }
    function setConsoleMode(m) {
      consoleMode = CONSOLE_MODES.some(([v]) => v === m) ? m : 'code';
      store.set('three.consoleMode', consoleMode);
      consoleModeSel.value = consoleMode;
      consolePeek = null;
      syncConsole();
    }
    let consoleScroll = 0;
    function syncConsole() {
      const shown = consoleShown();
      // (round 21) every run calls this: only what changed is written, and the scroll to the newest line waits for the
      // frame (reading its height here forced a layout of the whole Lab in the middle of each run)
      if (consoleWrap.hidden !== !shown) consoleWrap.hidden = !shown;
      if (shown) unseen = { errors: 0, other: 0 };
      if (consoleBtn.classList.contains('on') !== shown) consoleBtn.classList.toggle('on', shown);
      const errs = !shown && unseen.errors > 0;
      if (consoleBtn.classList.contains('has-errors') !== errs) consoleBtn.classList.toggle('has-errors', errs);
      const n = unseen.errors + unseen.other;
      const t = !shown && n ? `Console ${unseen.errors ? '●' : '·'} ${n}` : 'Console';
      // (round 48, labcalm) the label sits in its own span beside the icon (icon only when the Lab is narrow)
      const tx = consoleBtn.querySelector('.tb-tx');
      if (tx) { if (tx.textContent !== ` ${t}`) { tx.textContent = ` ${t}`; consoleBtn.setAttribute('aria-label', t); } } else if (consoleBtn.textContent !== t) consoleBtn.textContent = t;
      if (shown && !consoleScroll) consoleScroll = requestAnimationFrame(() => { consoleScroll = 0; consoleBox.scrollTop = consoleBox.scrollHeight; });
    }
    // Present: just the picture, fullscreen (P · Esc). Space, arrows and cue keys still work.
    const presentBtn = btn('▣ Present', 'Shows the preview full screen with nothing else, for showing it off (P · Esc leaves)', () => togglePresent());
    presentBtn.dataset.feature = 'Present';
    presentBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); presentMenu(e); }); // (round 131, perform131) ◉ Perform: tools/three-perform.js · (round 136, phone136) 📱 Live on my phone: phoneview.js
    function presentMenu(...a) { return labPart(K, 'dialogs', 'presentMenu', a); } // tools/three-lab-dialogs.js
    previewHost.addEventListener('dblclick', (e) => { if (e.target === previewHost) togglePresent(); }); // double-click beside the picture
    presentBtn.dataset.key = 'P';
    // (round 52, gamemode) ▶ Play: the scene as a game, in its own full-screen window at max fidelity, its layers on one
    // canvas (gamemode.js, lazy group "gamemode"); right-click: the last games, an HTML game, the screen to play on
    const gameDo = (fn) => (window.Lazy ? window.Lazy.load('gamemode') : Promise.resolve()).then(() => fn(GameMode)).catch((err) => toast(calmError(err), { type: 'error', raw: err }));
    const playGame = (sk = current) => sk && gameDo((G) => G.play({ kind: 'lab', id: sk.id, title: sk.name }));
    const playBtn = btn('▶ Play', `Play it as a game: its own full-screen window, max quality, smooth (${typeof WinMac !== 'undefined' ? WinMac.keyLabel('Ctrl+P') : 'Ctrl+P'} · Esc there: Back to Hearth) · right-click: the playtest log, the hitch map, other games`, () => playGame()); // (round 53, playloop: Ctrl/⌘+P plays / goes back to editing)
    playBtn.dataset.feature = 'Play';
    playBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); gameDo((G) => G.menu(e.clientX, e.clientY)); });
    const presentHint = el('div', { class: 'present-hint', text: 'Esc to leave · Space play / pause · F freeze · B blackout · I info · PgUp / PgDn other sketches · 1–9 cues' });
    // Present info (I): the sketch, song time, BPM and frame size in a corner, for live shows and checks
    const presentHud = el('div', { class: 'present-hud', hidden: true });
    // B in Present: fade to black (and back), for live shows
    const blackout = el('div', { class: 'lab-blackout' });
    const setBlackout = (on) => { blackout.classList.toggle('on', on ?? !blackout.classList.contains('on')); return blackout.classList.contains('on'); };
    let hudTimer = 0;
    function setHud(...a) { return labPart(K, 'dialogs', 'setHud', a); } // tools/three-lab-dialogs.js
    // PgUp / PgDn in Present: the previous / next sketch (most recent first, like the picker)
    function stepSketch(d) {
      const list = [...sketches].sort((a, b) => b.updatedAt - a.updatedAt);
      const i = list.findIndex((x) => x.id === current?.id);
      const next = list[(i + d + list.length) % list.length];
      if (next && next.id !== current?.id) { openSketch(next.id); toast(next.name, { timeout: 1000 }); }
    }
    // ---------- live sound + what's playing (Spotify, YouTube, Suno… anything with media controls) ----------
    // Live: the sketch hears the computer's sound (or a mic) instead of a loaded song; recordings include it.
    // Now playing: title / artist / cover / position of Spotify (or the current media app), with ⏮ ⏯ ⏭.
    let liveKind = null;
    let np = null;
    let liveBpm = null;
    const liveOpts = () => ({ auto: true, sense: 1, followCover: false, ...store.get('three.live', {}) });
    const setLiveOpt = (patch) => { store.set('three.live', { ...liveOpts(), ...patch }); sendLiveGain(); };
    const sendLiveGain = () => { const o = liveOpts(); box.send({ type: 'live-gain', auto: o.auto, sense: o.sense }); };
    // ⚡ Triggers: which sounds fire audio.kick / bass / snare / hats / hit, set on an EQ-style view of the sound.
    let trigCfg = ThreeTriggers.merge(store.get('three.triggers', null));
    let trigTuned = store.get('three.triggers', null) != null;
    let trigPanel = null;
    const sendTriggers = () => box.send({ type: 'triggers-set', cfg: trigCfg });
    // Each song keeps its own bars (songs differ a lot); the last ones you set are the default for new songs.
    const saveTriggers = debounce(() => {
      store.set('three.triggers', trigCfg);
      if (player.path) { store.set('three.triggersBySong', { ...store.get('three.triggersBySong', {}), [player.path]: trigCfg }); window.LabPresets?.changed(); } // (round 88, labsync88) to the other computer too
    }, 400);
    function songTriggers() {
      const saved = player.path && store.get('three.triggersBySong', {})[player.path];
      if (!saved) return;
      trigCfg = ThreeTriggers.merge(saved); trigTuned = true;
      sendTriggers(); trigPanel?.set(trigCfg);
    }
    const trigBtn = btn('⚡ Triggers', 'What fires the sketch\'s kick / bass / snare / hats / hit: a band of the sound and the bar it must reach', () => toggleTriggers());
    trigBtn.dataset.feature = 'Triggers';
    // The trigger presets and Auto bars, one click from the timeline (you used them more than the panel itself)
    const trigPresetBtn = btn('Presets ▾', 'Trigger presets for a style of music (your bars stay and are re-fitted), your own saved ones, or another song\'s setup', (e) => trigPresetMenu(e.currentTarget), 'ghost small mb-quick');
    trigPresetBtn.dataset.feature = 'Presets';
    const autoBarsBtn = btn('Auto bars', 'Fit every trigger bar to the last few seconds of sound (opens ⚡ Triggers for a moment if it\'s closed)', () => autoBars(), 'ghost small mb-quick');
    autoBarsBtn.dataset.feature = 'Auto bars';
    const trigPresets = () => ({ ...(ThreeTriggers.PRESETS || {}) });
    function applyTrigPreset(name, { quiet = false } = {}) {
      const saved = store.get('three.trigPresets', []).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
      if (saved) { trigCfg = ThreeTriggers.merge(saved.cfg); trigTuned = true; sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg); toast(`Triggers: ${saved.name}`, { timeout: 1400 }); return saved.name; }
      const all = trigPresets();
      const key = Object.keys(all).find((k) => k.toLowerCase() === String(name).toLowerCase()) || Object.keys(all).find((k) => k.toLowerCase().includes(String(name).toLowerCase()));
      if (!key) return null;
      setTriggers(Object.fromEntries(Object.entries(all[key]).map(([id, p]) => [id, { ...p }])));
      if (typeof ThreeMusic !== 'undefined') ThreeMusic.presetPicked(key);
      if (!quiet) toast(`Triggers: ${key} (bars kept · Auto bars fits them to the sound)`, { timeout: 2000 });
      return key;
    }
    function trigPresetMenu(...a) { return labPart(K, 'dialogs', 'trigPresetMenu', a); } // tools/three-lab-dialogs.js
    function autoBars(...a) { return labPart(K, 'dialogs', 'autoBars', a); } // tools/three-lab-dialogs.js
    function toggleTriggers(on = !trigPanel) {
      trigPanel?.destroy(); trigPanel = null;
      trigBtn.classList.toggle('on', on);
      box.send({ type: 'trig-watch', on });
      if (!on) return;
      trigPanel = ThreeTriggers.panel({
        cfg: trigCfg,
        untuned: !trigTuned,
        onChange: (c) => { trigCfg = c; trigTuned = true; sendTriggers(); saveTriggers(); },
        onClose: () => toggleTriggers(false),
        onWrite: async (cfg, b) => {
          if (!player.loaded) { toast('Load a song first: the triggers are written as markers on its timeline', { type: 'error' }); return; }
          b.disabled = true; const label = b.textContent; b.textContent = 'Scanning…';
          try {
            const r = await player.writeTriggers(cfg, { onProgress: (p) => { b.textContent = `Scanning ${Math.round(p * 100)}%`; } });
            const parts = Object.entries(r.counts).map(([id, n]) => `${n} ${id === 'bass' ? 'bass hit' : id === 'hats' ? 'hat' : id}${n === 1 ? '' : 's'}`);
            toast(`Wrote ${parts.join(', ')} on the ${r.range === 'loop' ? 'loop' : 'whole song'} (↶ to undo). These markers now drive the sketch.`, { timeout: 4500 });
          } catch (err) { toast(err.message, { type: 'error' }); } finally { b.disabled = false; b.textContent = label; }
        },
        sense: () => (liveKind ? liveOpts() : null),
        onSense: (p) => setLiveOpt(p),
      });
      player.el.querySelector('.mb-main').after(trigPanel.el);
    }
    function setTriggers(patch) {
      const next = { ...trigCfg };
      for (const [k, v] of Object.entries(patch || {})) if (next[k]) next[k] = { ...next[k], ...v };
      trigCfg = ThreeTriggers.merge(next);
      sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg);
      return trigCfg;
    }
    // The preview iframe is isolated (no access to the hub) and browsers don't let isolated pages capture
    // sound, so for it this page captures and sends the analysis ~60 times a second. The Stage window
    // captures by itself (and its recordings include the sound).
    // Input gain (×0.5…×4) and a latency offset (the sketch reacts N ms later, to line up with a speaker or a
    // Bluetooth delay) apply here; the input picker chooses which microphone / line-in.
    const hubLive = { stream: null, ctx: null, analyser: null, timer: 0, gain: null, queue: [] };
    const liveIo = () => ({ gain: 'auto', latency: 0, device: '', ...store.get('three.liveIo', {}) });
    function setLiveIo(patch) {
      store.set('three.liveIo', { ...liveIo(), ...patch });
      if (hubLive.gain && patch.gain != null && patch.gain !== 'auto') hubLive.gain.gain.value = Number(patch.gain) || 1;
      if (patch.device != null && liveKind === 'mic') setLive('mic');
      return liveIo();
    }
    window.__labLiveStart = (...a) => labPart(K, 'live', '__labLiveStart', a); // tools/three-lab-live.js
    function hubLiveStop() {
      if (typeof ThreeAudio !== 'undefined') ThreeAudio.detachLive();
      clearInterval(hubLive.timer);
      for (const tr of hubLive.stream?.getTracks() || []) tr.stop();
      hubLive.ctx?.close();
      Object.assign(hubLive, { stream: null, ctx: null, analyser: null, timer: 0, gain: null, queue: [] });
    }
    const liveBtn = btn('🎧 Live ▾', 'Make the sketch react to what your computer plays (Spotify, YouTube…) or a microphone, and see what\'s playing', (e) => liveMenu(e.currentTarget));
    liveBtn.dataset.feature = 'Live sound';
    liveBtn.dataset.key = 'Shift+L';
    liveBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); setLive(liveKind ? null : store.get('three.lastLive', /Mac/.test(navigator.platform) ? 'mic' : 'system')); }); // right-click: straight on / off
    const npBox = el('span', { class: 'np-box', hidden: true });
    function liveMenu(...a) { return labPart(K, 'live', 'liveMenu', a); } // tools/three-lab-live.js
    async function setLive(kind) {
      if (!kind) { liveKind = null; hubLiveStop(); box.send({ type: 'live-stop' }); paintLive(); trigPanel?.refreshSense(); if (typeof ThreeMusic !== 'undefined') ThreeMusic.liveTempo(null); return; }
      liveKind = kind; liveBpm = null;
      store.set('three.lastLive', kind);
      if (player.playing) player.toggle(false); // the song would play over it
      sendLiveGain();
      const ok = await window.hub.liveStart(kind);
      if (!ok) { liveKind = null; paintLive(); return; } // the sketch reports why (live-state)
      paintLive(); trigPanel?.refreshSense();
      if (kind === 'system' && !np) startNowPlaying();
    }
    function paintLive() {
      liveBtn.textContent = liveKind ? `● Live: ${liveKind === 'system' ? 'system sound' : 'mic'}${liveBpm ? ` · ${Math.round(liveBpm.bpm)} BPM${liveBpm.locked ? '' : '?'}` : ''} ▾` : '🎧 Live ▾';
      liveBtn.title = liveKind ? `Live sound${liveBpm ? `: about ${liveBpm.bpm} BPM, found from the kicks${liveBpm.locked ? ' (audio.beat / beatPhase follow it)' : ' (still listening)'}` : ''}. Click for sensitivity or to stop.` : 'Make the sketch react to what your computer plays (Spotify, YouTube…) or a microphone, and see what\'s playing';
      liveBtn.classList.toggle('live-on', Boolean(liveKind));
    }
    function startNowPlaying() {
      np = {};
      window.hub.npStart();
      npBox.hidden = false;
      npBox.replaceChildren(el('span', { class: 'np-wait', text: 'Waiting for Spotify / a player…' }));
    }
    function stopNowPlaying() { np = null; window.hub.npStop(); npBox.hidden = true; }
    const fmtClock = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    function onNowPlaying(...a) { return labPart(K, 'live', 'onNowPlaying', a); } // tools/three-lab-live.js
    // (round 161, fix161) one subscription for the window's life (hub.onNowPlaying can't be undone): it reaches the Lab
    // mounted now (a dropped Lab's comes back as a new mount)
    nowPlayingTo = onNowPlaying;
    if (!npStarted) { npStarted = true; window.hub.onNowPlaying(nowPlayingRelay); }

    // ---------- Stage window: the sketch in its own window (own process, own GPU context) for smooth frames ----------
    // Preview frame rate: Max follows the screen (240 Hz screens render 240 frames a second); 60 or 30 is lighter.
    // Auto (round 16 "labperf", the default): the screen's rate while it keeps up (a fast screen steps down to a steady
    // 60 when even the lowest resolution can't), 30 while Hearth's window is in the background, nothing while the
    // Lab isn't on screen (the preview parks: see syncPark).
    const FPS_OPTS = [['-1', 'Auto fps'], ['0', 'Max fps'], ['60', '60 fps'], ['30', '30 fps']];
    const fpsPref = () => Number(store.get('three.fpsCap', -1));
    const fpsSel = el('select', { class: 'fps-sel', title: 'Preview frame rate: Auto holds 60 at most (30 behind other windows), light on the graphics card so other apps\' sound doesn\'t crackle; Max = the screen\'s own rate', dataset: { feature: 'Preview fps' } },
      FPS_OPTS.map(([v, l]) => el('option', { value: v, text: l, selected: v === String(fpsPref()) })));
    let winFocused = document.hasFocus();
    // (round 41, renderfast) while a Lab export renders, Auto eases the preview to its background rate (30): the export
    // page gets the GPU / CPU it would share with it. Never the Stage window, never during a recording.
    let xpOn = false;
    // (round 151, perf151) nobody has used Hearth for a minute (idlecpu.js's hush, <html data-hush>) and nothing is
    // playing: Auto eases the preview to its background rate (30), as when another window is in front. A moving scene
    // left on screen paused drew 60 frames a second for nobody, the graphics card shared with every other app. Never
    // while the song plays, with live sound, recording, rendering or on the Stage window; the first input: full rate.
    // A still picture is left alone (it already dozes at 4 frames a second, and a cap keeps it from dozing): the rest
    // starts only after the preview reported a moving picture 3 times in a row, and once it ended because the picture
    // went still it stays off until the next input (no flip-flop: each change is a message that wakes the page).
    const RST = { on: false, moving: 0, out: false };
    const idleRest = () => document.documentElement.hasAttribute('data-hush') && !player.playing && !player.recording && !liveKind && !xpOn && RST.moving >= 3 && !RST.out;
    // (round 153c, labwin153) the Lab window draws at full rate behind other apps (that is what it is for), as the Stage
    // window does; with Lite mode on (window.HearthLite / the 'lite' setting, when there is one) its 30 fps cap applies
    const lwFull = () => Boolean(window.hub?.labwin?.scene) && !(window.LabWinHost?.lite?.());
    const capMsg = () => { const v = fpsPref(); return { type: 'fps-cap', value: Math.max(0, v), auto: v < 0, focused: box.onStage || lwFull() || (winFocused && !(xpOn && !player.recording) && !RST.on), modal: modalUp && !box.onStage && !player.recording, lite: liteOn() }; }; // (round 153a, lite153: Lite rides on every cap message too, a warmed page included)
    // (round 72, labfps72) a modal over the Lab (a <dialog> opened with showModal(), the ⌘K Find anything palette): the
    // preview behind it draws 30 frames a second at most, whatever the fps setting (it still moves under the dim; at
    // 240 Hz the graphics card does an eighth of the work while you read or type in the dialog). Never on the Stage
    // window or while recording. Watched by two quiet observers: the 'open' attribute anywhere, and the body's own children.
    let modalUp = false; let modalT = 0;
    const modalNow = () => Boolean(document.querySelector('dialog:modal') || document.querySelector('body > .palette'));
    const modalCheck = () => { if (modalT) return; modalT = setTimeout(() => { modalT = 0; const m = modalNow(); if (m === modalUp) return; modalUp = m; if (box.ready) box.send(capMsg()); }, 0); };
    try { const mo = new MutationObserver(modalCheck); mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] }); new MutationObserver(modalCheck).observe(document.body, { childList: true }); } catch { /* an old engine: no cap under dialogs */ }
    // (round 67, render fix) and the preview rests (parks, as when the Lab is off screen) behind a short note: a many-layer
    // scene drawn in the preview took half the GPU from the render (a 12-layer scene: 112 s → 48 s for 2 s of video).
    // "Show the preview anyway" keeps it drawing until that render ends.
    let xpWatch = false; let xpNote = null;
    const xpResting = () => xpOn && !xpWatch && !box.onStage && !player.recording;
    function paintXpRest() {
      const on = xpResting();
      previewHost.classList.toggle('xp-resting', on);
      if (on && !xpNote) {
        xpNote = el('div', { class: 'xp-rest-note', attrs: { role: 'status' } },
          el('b', { text: 'Rendering…' }), el('span', { text: 'The preview rests so the render gets the whole graphics card (about twice as fast).' }),
          el('button', { type: 'button', class: 'stage-btn', text: 'Show the preview anyway', on: { click: () => { xpWatch = true; paintXpRest(); syncPark(true); } } }));
        previewHost.append(xpNote);
      } else if (!on && xpNote) { xpNote.remove(); xpNote = null; }
    }
    addEventListener('hearth:lab-export', (e) => { const on = Boolean(e.detail?.on); if (on === xpOn) return; xpOn = on; if (!on) xpWatch = false; if (fpsPref() < 0 && box.ready) box.send(capMsg()); paintXpRest(); syncPark(); });
    fpsSel.addEventListener('change', () => { store.set('three.fpsCap', Number(fpsSel.value)); box.send(capMsg()); });
    // the window in front or not (an iframe taking the focus is still this window: document.hasFocus() says so)
    let focusT = 0;
    const onFocusChange = () => { clearTimeout(focusT); focusT = setTimeout(() => { const f = document.hasFocus(); if (f === winFocused) return; winFocused = f; if (fpsPref() < 0 && box.ready) box.send(capMsg()); }, 250); };
    addEventListener('blur', onFocusChange); addEventListener('focus', onFocusChange);
    let restCheck = () => {}; // (round 151, perf151) see idleRest
    { restCheck = (pace) => { // (round 151, perf151) see idleRest
        if (!document.documentElement.hasAttribute('data-hush')) { RST.moving = 0; RST.out = false; }
        if (pace === true) { if (paceLast?.still) { RST.moving = 0; if (RST.on) RST.out = true; } else RST.moving += 1; }
        const r = idleRest(); if (r === RST.on) return; RST.on = r; if (fpsPref() < 0 && box.ready) box.send(capMsg()); };
      try { new MutationObserver(() => restCheck()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-hush'] }); } catch { /* no rest */ }
      addEventListener('hearth:lab-playing', () => setTimeout(restCheck, 0)); window.__labRest = () => ({ ...RST, cap: capMsg() }); }
    // Parked: the preview draws nothing while the Lab isn't on screen (another tool or chat in front, the window
    // hidden or minimised, another Lab tab). Recordings, the Stage window and offline renders go on.
    let parkedNow = false;
    let workspacePreparing = false, workspaceMessage = null, workspaceReleased = false, workspaceDrawn = null, workspaceAbandoned = 0; // (round 109, projopen109: warm-ups let go off screen)
    // (round 154, mem154) the Lab rests when nobody can see it (restArm / restTry below): since = unseen and quiet since,
    // by = the page was let go by the rest (an AI call or showing the Lab brings it back)
    const REST = { t: 0, since: 0, by: false, closing: false, rested: 0, woke: 0, last: null };
    // (round 72, projects72) a project → project switch keeps the preview page (three.js loaded, contexts warm): the next
    // project's scene runs in it like any Lab sketch switch, instead of a new page per switch. Leaving to Projects releases it.
    let pageKept = false;
    // (round 74, projdesk74) a page started at a project's click (preload) and not yet claimed by prepare(); let go if unclaimed
    let pagePrimed = false, primeTimer = 0;
    const unprime = () => { clearTimeout(primeTimer); if (!pagePrimed) return; pagePrimed = false; if (workspaceReleased) { box.release(); ranOnce = false; } };
    let plainSwap = false; // (round 73, coldopen73) the next scene swap without the old picture's cross-fade (a project opening under its loading card)
    let stallArm = null; // (round 39, powerwise) the stall / park safety timer's pace follows the park (set below)
    function syncPark(force = false) {
      const on = !workspacePreparing && ((!box.onStage && !player.recording && (document.visibilityState !== 'visible' || !previewHost.checkVisibility?.({ visibilityProperty: true }))) || xpResting() || previewHost.classList.contains('pr-baked') || document.documentElement.classList.contains('gm-playing'));
      if (on === parkedNow && !force) return;
      parkedNow = on;
      api.parkTweaks?.(on);
      restArm(); // (round 154, mem154)
      // (round 160, playfix) the Lab rested while Hearth's window was hidden, minimised or covered (Windows reports a
      // covered window as hidden) and is on screen again: its page comes back here, as when the Lab tool is shown
      // (onShow). Nothing else brought it back: the preview stayed black / frozen and ▶ did nothing on every scene.
      if (!on && REST.by && workspaceReleased && !REST.closing && window.ProjectWorkspace?.state?.().phase !== 'opening') { REST.by = false; REST.woke += 1; api.workspace?.resume?.(); }
      stallArm?.(on);
      if (box.ready || !on) box.send({ type: 'park', on });
      if (paceOn) paintPace(); // (round 33 "labpace")
    }
    // (round 52) after a page's 'ready', the look waits for the next frame: read at once (the Lab still being built on
    // its first open), it laid the whole Lab out an extra time before its scenes were read (≈ 20–35 ms of the opening)
    let parkRaf = 0;
    const parkSoon = () => { if (document.visibilityState !== 'visible') { syncPark(); return; } if (!parkRaf) parkRaf = requestAnimationFrame(() => { parkRaf = 0; syncPark(); }); };
    // (round 113, warmopen113) looked at after the next painted frame, not in a task right after the event: there the
    // window's style and layout were dirty (a project switch, a tool shown) and checkVisibility laid the whole window out
    // then and there, 15–20 ms of every name ▾ switch here, done again by the frame after the switch's next changes.
    // After the frame it reads what was drawn, for nearly nothing. Several events → one look; 200 ms at most (no frame
    // comes: the window hidden or covered). The IntersectionObserver below still sees the preview come and go.
    let parkLook = 0;
    const parkAfterPaint = () => {
      if (parkLook) return;
      const go = () => { if (!parkLook) return; clearTimeout(parkLook); parkLook = 0; syncPark(); };
      parkLook = setTimeout(go, 200);
      if (document.visibilityState === 'visible') requestAnimationFrame(() => setTimeout(go, 0)); else setTimeout(go, 0);
    };
    for (const ev of ['hearth:view', 'hearth:activate']) addEventListener(ev, parkAfterPaint);
    docOn('visibilitychange', () => syncPark());
    // (the preview showing or going away without one of those events, e.g. another Lab tab, a panel, the first layout:
    // the observer sees it; the stall timer below checks too, so a park can never stick)
    try { new IntersectionObserver(() => syncPark()).observe(previewHost); } catch { /* old engine: events + timer */ }
    // Light mode (for slower machines): 30 fps, at most 1× pixels in the preview, filters at half resolution
    let lightOn = Boolean(store.get('three.light', false));
    // (round 153a, lite153) ⚡ Lite mode, the owner's one switch (powerwise.js HearthLite): the preview at 30 fps, half
    // resolution, no glow / effects, no shadows, no antialias (three-sandbox.html "lite153"); renders never see it
    function liteOn() { return Boolean(window.HearthLite?.on); } // (a declaration: the Lab bar's tag reads it before this line runs)
    // (round 31 "labadapt") the preview lightens itself while frames drop (resolution, filters, shadows, particles: see
    // "Adaptive quality" in three-sandbox.html) and says so in its corner; right-click › View turns it off. Renders,
    // stills and recordings are always full quality.
    let adaptOn = store.get('three.adapt', true) !== false;
    const adaptNote = el('div', { class: 'lab-adapt-note', hidden: true, text: 'lighter to stay smooth · full quality in renders', title: 'Frames were dropping, so the preview draws lighter while you watch (resolution, then filters, shadows, particles) and goes back up when there\'s room. Renders, stills and recordings are full quality. Right-click the preview › View to turn it off.' });
    previewHost.append(adaptNote);
    let adaptLast = null;
    function paintAdapt(a) {
      if (a) adaptLast = a;
      if (a?.aaWish && a.mode === 'smooth' && current && !aaAuto.has(current.id)) aaAuto.add(current.id); // (round 142, smooth142) no antialias in the preview from this scene's next run
      const show = adaptOn && (adaptLast?.level || 0) > 0;
      // (round 33 "labpace") lighter only because the computer is on battery: the note says so
      const txt = adaptLast?.battery && (adaptLast.level || 0) <= (adaptLast.floor || 0) ? 'lighter on battery · full quality in renders' : 'lighter to stay smooth · full quality in renders';
      if (show && adaptNote.textContent !== txt) adaptNote.textContent = txt;
      // (round 48, labcalm) the words show for a few seconds each time it lightens, then fold to a small ◐ in the
      // corner (its tooltip says the rest); it no longer sits on the picture in words for as long as it stays lighter
      // (once in ten minutes: a preview that goes lighter and back often only shows the ◐)
      if (show && adaptNote.hidden) {
        clearTimeout(adaptQuietT);
        if (Date.now() - adaptWordsAt > 10 * 60e3) { adaptWordsAt = Date.now(); adaptNote.classList.remove('quiet'); adaptQuietT = setTimeout(() => adaptNote.classList.add('quiet'), 6000); } else adaptNote.classList.add('quiet');
      }
      if (adaptNote.hidden === show) adaptNote.hidden = !show;
    }
    let adaptQuietT = 0; let adaptWordsAt = 0;
    // (round 33 "labpace") Frame pace: how steady the preview's frames are ("120 fps · steady", "still · not
    // drawing"), read in the toolbar's ⋯ › Frame pace; ticking it keeps a tiny readout in the preview's corner (off by
    // default). The sandbox measures it (see "Frame pacing" in three-sandbox.html).
    let paceOn = Boolean(store.get('three.paceReadout', false)); let paceLast = null;
    const paceNote = el('div', { class: 'lab-pace-note', hidden: true, title: 'Frame pace: frames a second and how even they are (⋯ › Frame pace to hide it)' });
    previewHost.append(paceNote);
    const paceText = (p) => {
      if (!p) return parkedNow ? 'parked · not drawing' : 'measuring…';
      if (parkedNow) return 'parked · not drawing';
      if (p.still) return 'still · not drawing';
      if (!p.fps) return 'measuring…';
      return `${p.fps} fps · ${p.label}${p.battery ? ' · battery' : ''}`;
    };
    function paintPace(p) {
      if (p) paceLast = p;
      const show = paceOn && !box.onStage;
      if (show) { const t = paceText(paceLast); if (paceNote.textContent !== t) paceNote.textContent = t; }
      if (paceNote.hidden === show) paceNote.hidden = !show;
    }
    function setPaceOn(on) { paceOn = Boolean(on); store.set('three.paceReadout', paceOn); paintPace(); return paceOn; }
    // on battery (the computer says so): the preview holds 60 fps at most in Auto and starts a step lighter
    let onBattery = false;
    // (round 39, powerwise) also when the main process says so: Windows battery saver / Mac Low Power Mode count too
    let batApi = false; let sysLite = false;
    const updPower = () => { const v = batApi || sysLite; if (v === onBattery) return; onBattery = v; if (box.ready) box.send({ type: 'power', battery: v }); };
    addEventListener('hearth:power', (e) => { sysLite = Boolean(e.detail && e.detail.mode !== 'plugged'); updPower(); });
    try {
      navigator.getBattery?.().then((b) => {
        const upd = () => { batApi = !b.charging; updPower(); };
        upd(); b.addEventListener('chargingchange', upd, { signal: life.ac.signal }); // (round 161, fix161)
      }).catch(() => { /* no battery API: plugged in */ });
    } catch { /* none */ }
    // (round 142, smooth142) the preview's quality, three ways: Smooth (auto, the default: lighter before frames drop,
    // a steady lower frame rate where the screen's is out of reach), Balanced (round 31's adaptive rules) and Force high
    // quality (full resolution, antialias, shadows and filters whatever the cost; the scene's ⚡ preview settings are
    // set aside meanwhile). Kept per scene (sketch.speed.q) and as the default for scenes without one (three.quality;
    // the old three.adapt = false reads as Force high). Renders never see it: export pages and ▶ Play draw full quality.
    const Q_MODES = ['smooth', 'balanced', 'high'];
    const Q_NAMES = { smooth: 'Smooth (auto)', balanced: 'Balanced', high: 'Force high quality' };
    const qGlobal = () => { const v = store.get('three.quality', null); return Q_MODES.includes(v) ? v : store.get('three.adapt', true) === false ? 'high' : 'smooth'; };
    const qMode = (sk = current) => (Q_MODES.includes(sk?.speed?.q) ? sk.speed.q : qGlobal());
    // (round 147, safeopen147) Safe open (tools/three-safeopen.js): the preview of a scene that crashed at its lowest step, 1× pixels,
    // no antialias / shadows, filters at half, some layers held back; in memory only, never saved with the scene
    const safeOn = () => Boolean(current && window.LabSafe?.on?.(current.id));
    const aaAuto = new Set(); // scenes Smooth asked to draw without antialias in the preview from their next run (this session only)
    adaptOn = qMode(null) !== 'high';
    // (checks and /lab: ThreeLab.cmd().adapt(false) holds the adaptive steps off for this session, the scene's ⚡ fixes
    // kept: round 72's "Quality: full", which the speed check measures with)
    let adaptHeld = false;
    const sendQuality = () => { if (safeOn()) { box.send({ type: 'quality', mode: 'smooth' }); box.send({ type: 'safe-open', on: true }); adaptOn = true; return 'smooth'; } const m = qMode(); box.send({ type: 'quality', mode: m }); if (adaptHeld && m !== 'high') box.send({ type: 'adapt', on: false }); adaptOn = m !== 'high' && !adaptHeld; return m; };
    function setQuality(mode, { scene = true, quiet = false } = {}) {
      if (!Q_MODES.includes(mode)) return qMode();
      const aaWas = speedMsg().noAA;
      if (scene && current) { current.speed = { ...(current.speed || {}), q: mode }; current.updatedAt = Date.now(); saveSoon(); }
      store.set('three.quality', mode); store.set('three.adapt', mode !== 'high');
      adaptHeld = false;
      const m = sendQuality(); box.send(speedMsg());
      if (speedMsg().noAA !== aaWas && current) run({ reload: true, quiet: true }); // (a context's antialias is fixed when it's made)
      adaptLast = null; paintAdapt(); statsSig = ''; if (lastStatsMsg) paintStats(lastStatsMsg);
      if (!quiet) toast(m === 'high' ? 'Force high quality: full resolution, antialias and shadows in the preview, whatever the cost' : m === 'balanced' ? 'Balanced: the preview lightens only while frames keep dropping' : 'Smooth: the preview lightens itself before frames drop (renders stay full quality)', { timeout: 2400 });
      return m;
    }
    function setAdaptOn(on) { adaptHeld = !on; sendQuality(); if (!on) box.send({ type: 'adapt', on: false }); adaptLast = null; paintAdapt(); return adaptOn; }
    function setLight(on) { lightOn = Boolean(on); store.set('three.light', lightOn); box.send({ type: 'light', on: lightOn }); toast(lightOn ? '🪶 Light mode: 30 fps, 1× pixels, filters at half size (recordings and stills stay full size)' : 'Light mode off', { timeout: 2200 }); return lightOn; }
    const stageBtn = btn('🖥', 'Stage window: run the sketch in its own window, steady, smooth frames for recording or a second monitor (F11 there for fullscreen). The preview here sleeps meanwhile.', () => setStage(!box.onStage));
    stageBtn.dataset.feature = 'Stage window';
    const stageNote = el('div', { class: 'stage-note', hidden: true },
      el('b', { text: '🖥 Playing in the Stage window' }),
      el('span', { text: 'Music, sliders, timeline, recording and the director all keep working from here.' }),
      el('div', { class: 'button-row' }, btn('Show it', 'Bring the Stage window to the front', () => window.hub.stageFocus()), btn('↩ Bring it back here', 'Close the Stage window and run the preview here again', () => setStage(false))));
    function setStage(on) {
      box.useStage(on, () => { const o = window.ThreeStage?.outputSize?.(); if (o !== undefined) return o; const z = stage.size; return z.id !== 'fit' ? { width: z.width, height: z.height } : null; });
      stageBtn.classList.toggle('on', on);
      stageNote.hidden = !on;
      previewHost.classList.toggle('on-stage', on);
      run();
      if (on) toast('The sketch now runs in its own Stage window (F11 there for fullscreen)', { timeout: 3500 });
    }
    // ---------- scene editor: orbit around the selected layer's scene, click objects, move / rotate / scale them ----------
    // Placements live in L.overrides ({ path: { p, q, s, rd, v, name } }, '@camera' for the framed view) and the sandbox
    // re-applies them every frame. "Bake into code" asks the director to write them into the code.
    let editOn = false;
    let editSel = null;
    // (round 92, labchat92) the picked object in words, for the chat (three_layers, a chat opened from the Lab)
    const pickedWords = () => (editSel ? `${editSel.name ? `"${editSel.name}" ` : ''}(${editSel.type || 'object'}) in layer "${sel()?.name || ''}"` : null);
    const editUndo = [];
    const editBtn = btn('✥ Edit', 'Move around the selected layer\'s scene and drag things to move, turn or resize them (E)', () => setEdit(!editOn));
    editBtn.dataset.feature = 'Edit scene';
    editBtn.dataset.key = 'E';
    const modeBtns = [['translate', 'Move', 'W'], ['rotate', 'Rotate', 'E'], ['scale', 'Scale', 'R']].map(([m, label, k]) => btn(label, `${label} (${k} in the preview)`, () => { box.send({ type: 'edit', cmd: 'mode', value: m }); paintMode(m); }, 'ghost small ed-mode'));
    const spaceBtn = btn('World', 'Gizmo axes: world or the object\'s own (Q in the preview)', () => { const v = spaceBtn.textContent === 'World' ? 'local' : 'world'; box.send({ type: 'edit', cmd: 'space', value: v }); spaceBtn.textContent = v === 'world' ? 'World' : 'Local'; });
    const snapBtn = btn('Snap', 'Snap: 0.25 units, 15°, 0.1 scale', () => { snapBtn.classList.toggle('on'); box.send({ type: 'edit', cmd: 'snap', value: snapBtn.classList.contains('on') }); });
    const outlinerBtn = btn('Objects ▾', 'Every object in the scene: click to select', () => box.send({ type: 'edit', cmd: 'tree' }));
    const camBtn = btn('📷 Use this view', 'Make the view you framed the sketch\'s camera', () => { pushEditUndo(); box.send({ type: 'edit', cmd: 'camera' }); toast('The sketch\'s camera now uses this view (Reset camera in the list to undo)', { timeout: 3000 }); });
    const selBox = el('div', { class: 'ed-sel' });
    const footBox = el('div', { class: 'ed-foot' });
    const editPanel = el('div', { class: 'ed-panel', hidden: true },
      el('div', { class: 'ed-row' }, ...modeBtns, spaceBtn, snapBtn, outlinerBtn, camBtn, el('span', { class: 'spacer' }), btn('Done', 'Leave the scene editor (E)', () => setEdit(false), 'primary small')),
      selBox, footBox);
    const paintMode = (m) => modeBtns.forEach((b, k) => b.classList.toggle('on', ['translate', 'rotate', 'scale'][k] === m));
    function setEdit(...a) { return labPart(K, 'edit', 'setEdit', a); } // tools/three-lab-edit.js
    const placements = () => Object.keys(sel()?.overrides || {}).filter((k) => k !== '@camera' && k !== '@look'); // (round 50: '@look' = ◉ looks, not a placement)
    function paintEditSel(...a) { return labPart(K, 'edit', 'paintEditSel', a); } // tools/three-lab-edit.js
    function pushEditUndo() { const L = sel(); if (L) { editUndo.push({ id: L.id, ov: JSON.stringify(L.overrides || null) }); if (editUndo.length > 50) editUndo.shift(); } }
    function onEditMessage(...a) { return labPart(K, 'edit', 'onEditMessage', a); } // tools/three-lab-edit.js
    // (round 52, presentready) ▣ Present gets the scene ready on the big screen first (tools/three-ready.js, lazy group
    // "presentready"): everything loaded and compiled, frames warmed across the timeline, then 100 % quality held, or a
    // baked video when this computer can't hold it live. mode: null (it decides) · 'bake' · 'live'
    function togglePresent(mode = null) {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      pane.focus();
      previewHost.requestFullscreen().then(() => getReady(mode)).catch((err) => toast(`Couldn't go fullscreen: ${err.message}`, { type: 'error' }));
    }
    async function getReady(mode) {
      try {
        if (typeof PresentReady === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('presentready');
        if (document.fullscreenElement === previewHost && typeof PresentReady !== 'undefined') PresentReady.start(api.present, { mode });
      } catch (err) { console.warn('Present: getting ready', err); }
    }
    // keys that only mean something while presenting: I info, PgUp / PgDn sketches, F / \\ freeze
    function presentKeys(e) {
      if (document.fullscreenElement !== previewHost || e.ctrlKey || e.altKey || e.metaKey) return false;
      if (e.key.toLowerCase() === 'i') { setHud(presentHud.hidden); return true; }
      if (e.key.toLowerCase() === 'b') { setBlackout(); return true; }
      if (e.key === 'PageDown' || e.key === 'PageUp') { stepSketch(e.key === 'PageDown' ? 1 : -1); return true; }
      if (e.key.toLowerCase() === 'f' || e.key === '\\') { setFreeze(!frozenNow); return true; }
      return false;
    }
    docOn('fullscreenchange', () => {
      const on = document.fullscreenElement === previewHost;
      if (on && store.get('three.presentHud', false)) setHud(true); else if (!on) { clearInterval(hudTimer); presentHud.hidden = true; setBlackout(false); }
      presentBtn.classList.toggle('on', on);
      previewHost.classList.toggle('presenting', on);
      box.send({ type: 'present', on });
      if (on) { presentHint.classList.remove('gone'); setTimeout(() => presentHint.classList.add('gone'), 2500); }
    });
    // While presenting, keys can land outside the Lab pane: pass them to the player.
    docOn('keydown', (e) => {
      if (document.fullscreenElement !== previewHost || pane.contains(e.target)) return;
      if (!e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePresent(); return; }
      if (presentKeys(e)) { e.preventDefault(); return; }
      if (player.onKey(e)) e.preventDefault();
    });
    toolbar.prepend(codeBtn, slidersBtn, consoleBtn, focusBtn, presentBtn);
    // (round 92, labchat92) the owner's keystrokes, per scene + layer: an AI edit meanwhile keeps their cursor and their
    // editor, and an AI's whole-layer rewrite that hasn't seen them is refused (tools/three-director.js)
    const hand = { at: new Map(), last: 0 };
    const noteHand = () => { if (!current || !selId) return; hand.last = Date.now(); hand.at.set(`${current.id}:${selId}`, hand.last); if (hand.at.size > 400) hand.at.delete(hand.at.keys().next().value); };
    // (round 102, labchat102) the owner's caret in the editor is enough: an AI edit to another layer used to take the editor
    // when their last key was over 5 s ago (reading, thinking), and the next key they typed landed in the AI's layer
    const typingNow = () => document.activeElement === editor.area;
    const editor = new LabEditor(editorHost, { lang: 'js', onRun: () => runChanged(), onChange: () => { persist(); noteHand(); if (autoRun) autoRunSoon(); } });
    // (round 92) an AI's change to the layer in the editor: the owner's cursor (and scroll) stay where they were
    function setCodeKeeping(code) {
      const area = editor.area; const was = editor.value;
      const focused = document.activeElement === area;
      const [a, b, top] = [area.selectionStart, area.selectionEnd, area.scrollTop];
      editor.setValue(code);
      if (!focused || was === code) return;
      const map = (p) => (window.LabChatCore ? LabChatCore.caret(was, code, p) : p);
      try { area.setSelectionRange(map(a), map(b)); area.scrollTop = top; } catch { /* gone */ }
    }

    // ---------- layers ----------
    const layersOf = () => current?.layers || [];
    const layerById = (id) => layersOf().find((L) => L.id === id);
    const sel = () => layerById(selId) || layersOf()[layersOf().length - 1];
    const baseOf = (L) => (L.slot || 0) * SLOT;
    function materialize(s) {
      if (!s.layers?.length) s.layers = [ThreeLayers.defaults({ id: 'main', name: 'Layer 1', code: s.code || '', color: ThreeLayers.COLORS[0], slot: 0 })];
      s.layers.forEach((L, i) => { L.slot ??= i; L.color ||= ThreeLayers.COLORS[i % ThreeLayers.COLORS.length]; });
      return s.layers;
    }
    // ---------- keyframes ----------
    // L.keys = { opacity | x | y | scale | rotate | 's:<slider key>': [{ t, v, ease }] } (ThreeLayers.evalKeys).
    const { ANIM, evalKeys, upsertKey, keyAt, KEY_EPS } = ThreeLayers;
    const keysOf = (L, prop) => L?.keys?.[prop] || [];
    const animKeys = (L) => Object.fromEntries(ANIM.filter((p) => L.keys?.[p]?.length).map((p) => [p, L.keys[p]]));
    function sliderKeysOf(L) {
      const c = controllers.get(L.id);
      const out = {};
      for (const [prop, keys] of Object.entries(L.keys || {})) {
        if (!prop.startsWith('s:') || !keys.length) continue;
        const info = c?.keyInfo(prop.slice(2));
        if (info) out[baseOf(L) + info.index] = { call: info.call, key: prop.slice(2), num: info.num, keys };
      }
      return out;
    }
    const baseValue = (L, prop) => (prop.startsWith('s:') ? controllers.get(L.id)?.keyInfo(prop.slice(2))?.value : L[prop] ?? (prop === 'scale' || prop === 'opacity' ? 1 : 0));
    const valueAt = (L, prop) => evalKeys(keysOf(L, prop), player.loaded ? player.time : null, baseValue(L, prop));
    const keyStateFor = (L, prop) => (!keysOf(L, prop).length ? 'none' : keyAt(keysOf(L, prop), player.time) ? 'on' : 'animated');
    function sendKeys(L) { box.send({ type: 'layer-props', id: L.id, props: { keys: animKeys(L), sliderKeys: sliderKeysOf(L) } }); }
    function setKeys(L, prop, keys) {
      L.keys ||= {};
      if (keys.length) L.keys[prop] = keys; else delete L.keys[prop];
      sendKeys(L);
      fitClock();
      touch();
      renderTracksOnly();
      syncKeyUI(true);
    }
    function toggleKeyFor(id, prop, value) {
      const L = layerById(id);
      if (!L) return;
      if (!player.loaded) ensureTimeline(); // no song: the scene's own timeline
      if (!player.loaded) { toast('Load a song first: keyframes sit on the song timeline', { type: 'error' }); return; }
      const ks = keysOf(L, prop);
      const at = keyAt(ks, player.time);
      if (at) setKeys(L, prop, ks.filter((k) => k !== at));
      else setKeys(L, prop, upsertKey(ks, player.time, value ?? valueAt(L, prop)));
      // (round 46, labkeys) a setting's first keyframe shows its lane under the layer: its diamonds, where you shape them
      if (!ks.length && !at && laneData(L, prop) && !lanesOf(L).includes(prop) && lanesOf(L).length < 3) setLanes(L, [...lanesOf(L), prop]);
    }
    // Moving an animated slider sets a keyframe where the move started (so dragging while it plays stays on one key).
    let dragKeyT = null;
    // Write (like a DAW's automation write): while the song plays, moves are recorded as a curve at the
    // playhead, replacing the points they pass over.
    let writeArmed = false;
    const writeLast = {};
    const writing = () => writeArmed && player.loaded && player.playing;
    let writeFlushT = 0;
    function writeFlush(final) {
      clearTimeout(writeFlushT);
      writeFlushT = setTimeout(() => { touch(); renderTracksOnly(); syncKeyUI(true); }, final ? 0 : 160);
    }
    function writeKey(L, prop, value, final) {
      const t = player.time; const k = `${L.id}|${prop}`;
      let last = writeLast[k];
      if (last == null || t < last - 0.05 || t - last > 1) last = t; // a new pass, or the loop jumped back
      L.keys ||= {};
      const kept = keysOf(L, prop).filter((x) => !(x.t > last + 1e-4 && x.t < t - 1e-4));
      if (final || t - last >= 0.03 || !kept.some((x) => Math.abs(x.t - t) < 0.03)) {
        L.keys[prop] = upsertKey(kept, t, value).map((x) => (Math.abs(x.t - t) < 1e-3 ? { ...x, ease: 'linear' } : x));
        writeLast[k] = t;
      }
      sendKeys(L);
      writeFlush(final);
    }
    function autoKey(id, prop, value, { final }) {
      const L = layerById(id);
      if (!L) return;
      if (writing()) { writeKey(L, prop, value, final); return; }
      if (dragKeyT == null) dragKeyT = player.time;
      L.keys ||= {};
      L.keys[prop] = upsertKey(keysOf(L, prop), dragKeyT, value);
      sendKeys(L);
      if (final) { dragKeyT = null; touch(); renderTracksOnly(); syncKeyUI(true); }
    }
    // All of a layer's keyframe times (for the ◆ on its track).
    function trackKeys(L) {
      const m = new Map();
      for (const ks of Object.values(L.keys || {})) for (const k of ks) { const r = Math.round(k.t * 1000) / 1000; if (![...m.keys()].some((x) => Math.abs(x - r) < KEY_EPS)) m.set(r, k.ease === 'bezier' && k.b ? { ease: 'bezier', b: k.b } : { ease: k.ease || 'ease' }); }
      return [...m].map(([t, o]) => ({ t, ...o })).sort((a, b) => a.t - b.t);
    }
    function editKeysAt(id, t, fn) {
      const L = layerById(id);
      if (!L?.keys) return;
      for (const [prop, ks] of Object.entries(L.keys)) L.keys[prop] = fn(ks.map((k) => ({ ...k })), (k) => Math.abs(k.t - t) < KEY_EPS).sort((a, b) => a.t - b.t);
      for (const prop of Object.keys(L.keys)) if (!L.keys[prop].length) delete L.keys[prop];
      sendKeys(L);
      touch();
      renderTracksOnly();
      syncKeyUI(true);
    }
    // (round 46, labkeys) several ◆ at once on the layers' tracks: sel = { layerId: [times] }; every setting keyed at
    // those times goes along. The timeline keeps snapKeys(ids) from before a change as its one undo step.
    const keysCopy = (keys) => JSON.parse(JSON.stringify(keys || {}));
    function putKeys(L, keys, final = true) {
      L.keys = keys;
      for (const p of Object.keys(L.keys)) if (!L.keys[p]?.length) delete L.keys[p];
      sendKeys(L);
      if (final) { fitClock(); touch(); renderTracksOnly(); syncKeyUI(true); }
    }
    const eachSel = (sel, fn) => { for (const [id, ts] of Object.entries(sel || {})) { const L = layerById(id); if (L && ts?.length) fn(L, ts); } };
    const keyable = (L) => (prop) => ANIM.includes(prop) || (prop.startsWith('s:') && Boolean(controllers.get(L.id)?.keyInfo(prop.slice(2))));
    const keysHandlers = {
      snapKeys: (ids) => ids.map((id) => layerById(id)).filter(Boolean).map((L) => ({ id: L.id, keys: keysCopy(L.keys) })),
      onKeysRestore: (snap) => { for (const s of snap || []) { const L = layerById(s.id); if (L) putKeys(L, keysCopy(s.keys)); } },
      onKeysShift: (sel, dt, { copy = false } = {}) => eachSel(sel, (L, ts) => putKeys(L, ThreeLayers.shiftKeysAt(L.keys, ts, dt, { copy }))),
      onKeysEase: (sel, ease, b, { final = true } = {}) => eachSel(sel, (L, ts) => putKeys(L, ThreeLayers.easeKeysAt(L.keys, ts, ease, b), final)),
      onKeysDelete: (sel) => eachSel(sel, (L, ts) => putKeys(L, ThreeLayers.shiftKeysAt(Object.fromEntries(Object.entries(L.keys || {}).map(([p, ks]) => [p, ks.filter((k) => !ts.some((t) => Math.abs(k.t - t) < KEY_EPS))])), [], 0))),
      // a copy: each layer's keys at its times, with where they start from the earliest one
      onKeysCopy: (sel) => {
        const parts = []; eachSel(sel, (L, ts) => { const clip = ThreeLayers.copyKeysAt(L.keys, ts); if (clip) parts.push({ id: L.id, t0: Math.min(...ts), clip }); });
        if (!parts.length) return null;
        const t0 = Math.min(...parts.map((x) => x.t0));
        return { layers: parts.map((x) => ({ id: x.id, off: Math.round((x.t0 - t0) * 1000) / 1000, clip: x.clip })) };
      },
      // pasted at `at`: one layer's keys go to the selected layer (another layer works: settings it doesn't have stay
      // out); several layers' keys go back to those layers. Returns the layers changed.
      onKeysPaste: (clip, at) => {
        const one = clip?.layers?.length === 1;
        const out = [];
        for (const part of clip?.layers || []) {
          const L = one ? sel() : layerById(part.id);
          if (!L) continue;
          putKeys(L, ThreeLayers.pasteKeys(L.keys, part.clip, at + part.off, keyable(L)));
          out.push(L.id);
        }
        return out;
      },
      pasteTargets: (clip) => (clip?.layers?.length === 1 ? [sel()?.id].filter(Boolean) : (clip?.layers || []).map((x) => x.id).filter((id) => layerById(id))),
    };
    const trackHandlers = {
      ...keysHandlers,
      onSelect: (id) => selectLayer(id),
      onChange: (id, v, { final }) => { editLayer(id, v, { live: !final }); if (final) window.LabDropMedia?.moved?.(id, v); }, // (round 140, dropmedia140) a dropped clip's own time follows its bar
      onKeyMove: (id, from, to) => editKeysAt(id, from, (ks, hit) => [...ks.filter((k) => !hit(k) && Math.abs(k.t - to) >= KEY_EPS), ...ks.filter(hit).map((k) => ({ ...k, t: Math.round(to * 1000) / 1000 }))]),
      onKeyDelete: (id, t) => editKeysAt(id, t, (ks, hit) => ks.filter((k) => !hit(k))),
      onKeyEase: (id, t, ease) => editKeysAt(id, t, (ks, hit) => ks.map((k) => (hit(k) ? { ...k, ease } : k))),
      onLanePick: (id, x, y, o) => lanePick(id, x, y, o),
      onLaneEdit: (id, prop, keys, o) => laneEdit(id, prop, keys, o),
      onLaneHide: (id, prop) => { const L = layerById(id); if (L) setLanes(L, lanesOf(L).filter((p) => p !== prop)); },
      onLaneTall: (id, prop) => { const L = layerById(id); if (!L) return; L.laneTall = { ...L.laneTall, [prop]: !L.laneTall?.[prop] }; if (!L.laneTall[prop]) delete L.laneTall[prop]; touch(); renderTracksOnly(); },
      onLanesAll: () => toggleAllLanes(),
      onMute: (id) => { const L = layerById(id); if (L) editLayer(id, { visible: L.visible === false }); },
      onSolo: (id) => setSolo(soloNow() === id ? null : id),
    };
    const trackList = () => [...layersOf()].reverse().map((L) => ({ id: L.id, name: L.name, color: L.color, in: L.in ?? null, out: L.out ?? null, fadeIn: L.in != null ? L.fadeIn || 0 : 0, fadeOut: L.out != null ? L.fadeOut || 0 : 0, visible: L.visible !== false, solo: Boolean(L.solo), selected: L.id === selId, keys: trackKeys(L), lanes: lanesOf(L).map((p) => laneData(L, p)).filter(Boolean), animated: Object.values(L.keys || {}).filter((k) => k?.length).length }));
    // Animated values follow the playhead in the panels.
    let lastSyncT = -1;
    let keyTimer = 0; let keyQuiet = 0; // (the follow timer below; declared here: an edit re-arms it from syncKeyUI)
    function syncKeyUI(force = false) {
      if (force && !keyTimer) keyLoop(); // (round 44, idlecpu) a key / layer edit: the follow timer runs again
      const L = sel();
      if (!L || !current) return;
      const t = player.time;
      if (!force && Math.abs(t - lastSyncT) < 1e-3) return;
      lastSyncT = t;
      const vals = {}; const states = {};
      for (const p of ANIM) { states[p] = keyStateFor(L, p); if (keysOf(L, p).length) vals[p] = valueAt(L, p); }
      layersPanel.sync(vals, states);
      const sv = {};
      for (const p of Object.keys(L.keys || {})) if (p.startsWith('s:')) sv[p.slice(2)] = valueAt(L, p);
      controllers.get(L.id)?.sync(sv);
    }
    // keyframed values follow the playhead while the Lab is on screen; the timer stops when it isn't (and
    // 'hearth:view' from start.js starts it again), so a hidden Lab doesn't wake up 10× a second
    // (round 44, idlecpu) it also stops when nothing can move: nothing keyframed on the selected layer, or the player
    // paused with its playhead where it was for a second. A layer picked, a key edited, the player playing / seeking
    // (its 'media-state' message, see onMessage), a click or key in the Lab and showing the Lab start it again. It
    // used to wake the window 10× a second while the Lab sat on screen untouched.
    // (round 21) nothing keyframed on the selected layer: nothing to do, not even the visibility check (a style
    // recalculation of the Lab ten times a second while you drag a slider or type)
    const keyStop = () => { clearInterval(keyTimer); keyTimer = 0; keyQuiet = 0; };
    const keyTick = () => {
      if (parkedNow && !box.onStage) { keyStop(); return; } // the preview isn't on screen (no layout read)
      const keys = current ? sel()?.keys : null;
      if (!keys || !Object.values(keys).some((k) => k?.length)) { keyStop(); return; }
      // (round 32, smooth32) not parked = on screen (syncPark keeps that current from view events, an observer and the
      // stall timer): asking the page again here styled the whole window 10× a second while a chat streamed beside it
      if ((parkedNow || player.recording) && !(split || previewHost).checkVisibility({ visibilityProperty: true }) && !box.onStage) { keyStop(); return; }
      if (!player.playing && Math.abs(player.time - lastSyncT) < 1e-3) { if (++keyQuiet >= 10) keyStop(); return; }
      keyQuiet = 0;
      // (round 142, smooth142) while it plays: the keyed sliders' positions about 3× a second (was 10×; the preview
      // animates them itself, these are the panels' readouts)
      if (player.playing && (++keyPlayN % 3)) return;
      if (player.playing) LabPlay.count('keyui');
      syncKeyUI();
    };
    let keyPlayN = 0;
    function keyLoop() { keyQuiet = 0; if (!keyTimer) keyTimer = setInterval(keyTick, 100); }
    function keyedNow() { const keys = current ? sel()?.keys : null; return Boolean(keys && Object.values(keys).some((k) => k?.length)); }
    keyLoop();
    addEventListener('hearth:view', keyLoop);
    for (const ev of ['pointerdown', 'keydown', 'wheel']) pane.addEventListener(ev, () => { if (!keyTimer) keyLoop(); }, { capture: true, passive: true });
    // ---------- automation lanes (Ableton placement, FL Studio curves) ----------
    // L.lanes = the settings shown as curves under the layer's track ('opacity' … or 's:<slider key>'), in order;
    // L.laneTall = { prop: true } for taller lanes. (Older sketches have a single L.lane.)
    const { fmtMs } = ThreeMedia._test;
    const lanesOf = (L) => L.lanes || (L.lane ? [L.lane] : []);
    function laneData(L, prop) {
      if (!prop) return null;
      const tall = Boolean(L.laneTall?.[prop]);
      const meta = ThreeLayers.ANIM_META[prop];
      if (meta) return { prop, label: meta.label, min: meta.min, max: meta.max, step: meta.step, base: baseValue(L, prop), keys: keysOf(L, prop), tall };
      if (prop.startsWith('s:')) {
        const c = controllers.get(L.id)?.controls().find((x) => x.key === prop.slice(2));
        if (c && c.min != null) return { prop, label: c.label, min: c.min, max: c.max, step: c.step, base: baseValue(L, prop), keys: keysOf(L, prop), tall };
      }
      return null;
    }
    // every setting of a layer that can have a curve: [{ prop, label }]
    function laneProps(L) {
      const out = Object.entries(ThreeLayers.ANIM_META).map(([prop, m]) => ({ prop, label: m.label }));
      for (const c of (controllers.get(L.id)?.controls() || []).filter((x) => x.min != null)) out.push({ prop: `s:${c.key}`, label: c.label });
      return out;
    }
    const animatedProps = (L) => laneProps(L).map((x) => x.prop).filter((p) => keysOf(L, p).length);
    function popup(x, y, items) { return popMenu(x, y, items, { width: 290 }); } // renderer.js (submenus, filter, keys)
    // (round 44, layergroups) a layer or a group alone, saved with the scene, one undo step (tools/three-groups.js)
    function setSolo(id) {
      if (typeof LabGroups !== 'undefined') { LabGroups.solo(id || null); return; }
      if (typeof LayerGroups === 'undefined' || !current) return;
      LayerGroups.solo(layersOf(), id || null);
      api.groupsHost.commit();
    }
    function setLanes(L, list) { L.lanes = [...new Set(list.filter(Boolean))]; delete L.lane; touch(); renderTracksOnly(); }
    function toggleAllLanes(...a) { return labPart(K, 'lanes', 'toggleAllLanes', a); } // tools/three-lab-lanes.js
    function lanePick(...a) { return labPart(K, 'lanes', 'lanePick', a); } // tools/three-lab-lanes.js
    function laneEdit(...a) { return labPart(K, 'lanes', 'laneEdit', a); } // tools/three-lab-lanes.js
    // One-click animations over the layer's time (or the loop, or the whole song).
    function applyPreset(id, presetId) {
      const L = layerById(id);
      const pr = ThreeLayers.PRESETS.find((x) => x.id === presetId);
      if (!L || !pr) return null;
      if (!player.loaded) ensureTimeline(); // no song: the scene's own timeline
      if (!player.loaded) { toast('Load a song first: animations sit on the song timeline', { type: 'error' }); return null; }
      const lp = player.loop;
      const a = L.in ?? lp?.a ?? 0;
      const b = L.out ?? (L.in != null ? player.duration : lp?.b ?? player.duration);
      const beat = 60 / player.bpm;
      const ctx = { a, b, beat, bar: beat * player.beatsPerBar, beats: player.beatsIn(a, b - 1e-3), kicks: player.markersIn('kick', a, b), snares: player.markersIn('snare', a, b), base: (p) => baseValue(L, p) };
      const out = pr.make(ctx);
      L.keys ||= {};
      for (const [prop, keys] of Object.entries(out)) {
        if (!keys.length) continue;
        const lo = Math.min(...keys.map((x) => x.t)); const hi = Math.max(...keys.map((x) => x.t));
        const kept = keysOf(L, prop).filter((x) => x.t < lo - KEY_EPS || x.t > hi + KEY_EPS);
        const merged = [...kept, ...keys].sort((p, q) => p.t - q.t).filter((x, i, arr) => i === 0 || Math.abs(x.t - arr[i - 1].t) >= KEY_EPS);
        L.keys[prop] = merged;
      }
      L.lanes = [...new Set([...lanesOf(L), ...Object.keys(out)])];
      delete L.lane;
      sendKeys(L);
      touch();
      renderTracksOnly();
      syncKeyUI(true);
      toast(`${pr.name} on "${L.name}" (${fmtMs(a)} → ${fmtMs(b)}). Edit it in the lane under the layer.`, { timeout: 3500 });
      return { layer: L.name, preset: pr.name, from: a, to: b, props: Object.keys(out) };
    }

    // ---------- notes on moments ----------
    // { sketchId: [{ id, t, text, image, at, done }] } in kv 'three-notes'. A note = the song time, a screenshot and what to change.
    let notesAll = {};
    const notesOf = () => (current ? (notesAll[current.id] ||= []) : []);
    const saveNotes = saver(() => (kvOk.has('three-notes') ? window.hub.kvSet('three-notes', notesAll) : null), 300);
    const fileUrl = (p) => WinMac.fileUrl(p); // (round 31, winmac) a # or ? in a file name no longer cuts the URL
    // ---------- contact sheet ----------
    // One picture of the whole piece: a frame at each cue (or evenly over the loop / song), labeled with
    // its time, for you, the director's self-review or Astra.
    let sheetBusy = false;
    function contactSheet(...a) { return labPart(K, 'capture', 'contactSheet', a); } // tools/three-lab-capture.js
    const sheetBtn = btn('🎞 Sheet', 'Contact sheet: a frame at every cue (or across the loop / song) in one picture, to check the whole piece or send to the director / Astra', () => showSheet(), 'ghost small imp-capture');
    sheetBtn.dataset.feature = 'Contact sheet';
    function showSheet(...a) { return labPart(K, 'capture', 'showSheet', a); } // tools/three-lab-capture.js

    // ---------- write button ----------
    const writeBtn = btn('⏺ Write', 'Write: while the song plays, moving a slider, a layer setting or a MIDI knob records it as a curve (replacing what was there). W', () => setWrite(!writeArmed), 'ghost small mb-write imp-live');
    writeBtn.dataset.feature = 'Write';
    function setWrite(on) {
      writeArmed = on;
      for (const k of Object.keys(writeLast)) delete writeLast[k];
      writeBtn.classList.toggle('armed', on);
      writeBtn.textContent = on ? '⏺ Writing' : '⏺ Write';
      if (on) toast('Write is on: play the song and move sliders or knobs to record curves (W to stop)', { timeout: 2600 });
    }

    // ---------- MIDI ----------
    // Knobs / faders (CC) drive sliders: extras[sketch].midi = { 'ch:ccN': { layer, key, label } } (key 'p:opacity' = layer opacity).
    // Pads (notes) do actions anywhere in the Lab: store 'three.midiPads' = { 'ch:nN': 'kick' | 'snare' | 'hit' | 'play' | 'note' | 'write' }.
    let midi = null;
    let midiLearn = null; // { stage: 'slider' } | { stage: 'control', layer, key, label } | { stage: 'pad', action }
    let midiSeen = '';
    const midiBtn = btn('🎛 MIDI', 'Use a MIDI controller: knobs move sliders, pads drop kick / snare / hit markers', (e) => midiMenu(e.currentTarget));
    midiBtn.dataset.feature = 'MIDI';
    const midiMap = () => (current ? ((extras[current.id] ||= {}).midi ||= {}) : {});
    const midiPads = () => store.get('three.midiPads', {});
    const PAD_ACTIONS = [['kick', 'Kick marker'], ['snare', 'Snare marker'], ['hit', 'Hit marker'], ['play', 'Play / pause'], ['write', 'Write on / off'], ['note', 'Note on this moment']];
    function midiInit(...a) { return labPart(K, 'midi', 'midiInit', a); } // tools/three-lab-midi.js
    const midiDevices = () => (midi ? [...midi.inputs.values()].filter((i) => i.state === 'connected').map((i) => i.name) : []);
    const midiRelease = {};
    let lastTouched = null; // (round 141, cmdbar141) the slider moved last ({ layer, key, label, at }): stageHooks.lastSlider
    function midiTouched(layer, key, label) {
      if (midiLearn?.stage !== 'slider') return;
      midiLearn = { stage: 'control', layer, key, label };
      toast(`Now turn the knob or fader for "${label}"`, { timeout: 4000 });
    }
    function onMidi(...a) { return labPart(K, 'midi', 'onMidi', a); } // tools/three-lab-midi.js
    function midiMenu(...a) { return labPart(K, 'midi', 'midiMenu', a); } // tools/three-lab-midi.js
    if (store.get('three.midiOn', false)) midiInit();

    // ---------- palette ----------
    // A sketch's colors (current.palette = ['#rrggbb', …]): picked from a reference picture, shown as swatches,
    // given to sketches as the global `palette`, and one click recolors the selected layer's color sliders.
    const paletteBox = el('span', { class: 'lab-palette' });
    const paletteBtn = btn('🎨', 'Palettes: import from Coolors, take one from a picture, or pick a saved one', (e) => paletteMenu(e.currentTarget));
    const savedPalettes = () => store.get('three.palettes', []);
    function savePalette(name, colors) {
      const list = savedPalettes().filter((p) => p.name !== name);
      store.set('three.palettes', [{ name, colors }, ...list].slice(0, 60));
      window.LabPresets?.changed(); // (round 87, labsync87) to the other computer too
    }
    function paletteMenu(...a) { return labPart(K, 'refs', 'paletteMenu', a); } // tools/three-lab-refs.js
    function renderPalette() {
      const pal = current?.palette || [];
      paletteBox.classList.toggle('empty', !pal.length);
      paletteBox.replaceChildren(paletteBtn, ...pal.map((c) => { const b = el('button', { class: 'lab-swatch', title: `${c}: click to copy`, on: { click: () => { navigator.clipboard.writeText(c); toast(`Copied ${c}`, { timeout: 1000 }); } } }); b.style.background = c; return b; }),
        ...(pal.length ? [btn('Recolor', 'Put these colors into the selected layer\'s color sliders', () => recolor())] : []));
      projLook(); // (round 129, looks129)
    }
    // (round 129, looks129) the project's look: a strip by 🎨 when the scene is in a project with a palette (Apply, the
    // moodboard's colors, save as a look): tools/three-projlook.js, lazy group "projlook", loaded for a project's scene
    const projLookBox = el('span', { class: 'lab-projlook' }); projLookBox.hidden = true; // (not .lab-palette: declutter.js tucks that one away)
    function projLook() {
      if (window.LabProjLook) { LabProjLook.mount(projLookBox); return; }
      if (current && typeof Projects !== 'undefined' && Projects.ofItem('scene', current.id).length && window.Lazy) Lazy.load('projlook').then(() => window.LabProjLook?.mount(projLookBox)).catch(() => {});
    }
    function setPalette(cols) {
      if (!current) return;
      if (cols.length) current.palette = cols; else delete current.palette;
      touch();
      renderPalette();
      sendRefs();
    }
    function recolor() {
      const pal = current?.palette || [];
      const c = controllers.get(sel()?.id);
      const colorKeys = (c?.controls() || []).filter((x) => typeof x.value === 'string' && /^#[0-9a-f]{6}$/i.test(x.value));
      if (!colorKeys.length) { toast('The selected layer has no color sliders', { type: 'error' }); return; }
      colorKeys.forEach((x, i) => c.setByKey(x.key, pal[i % pal.length], { release: true }));
      toast(`Recolored ${colorKeys.length} color slider${colorKeys.length === 1 ? '' : 's'} (↶ in Sliders to undo, Save to keep)`, { timeout: 2600 });
    }
    function paletteFrom(...a) { return labPart(K, 'refs', 'paletteFrom', a); } // tools/three-lab-refs.js

    // ---------- references ----------
    // { sketchId: [{ id, key, name, kind, path, size, at }] } in kv 'three-refs'. Files are copied into data/refs;
    // the sandbox gets their bytes (refs.<key> = blob URL, refTexture(key)) before each full run.
    let refsAll = {};
    const refBytes = new Map(); // id → ArrayBuffer
    // (round 75, labload75) the preview page keeps a scene's files in its asset cache (three-sandbox.html "the scene's files,
    // kept in this page"), keyed by `sig` (the file, its size and its time): what the page says it holds ('refs-held', per
    // page load) isn't read from disk or copied over again; a page that lost one asks ('refs-need')
    const refSigs = new Map(); // id → sig
    let pageN = null; let pageHeld = { n: null, sigs: new Set() };
    const assetCacheOn = () => store.get('three.assetCache', true) !== false; // (a dev switch for before / after: dev/checks/labload75.js)
    const heldNow = () => (assetCacheOn() && box.ready && pageHeld.n != null && pageHeld.n === pageN ? pageHeld.sigs : null);
    const refHeld = (r) => Boolean(heldNow()?.has(refSigs.get(r.id)));
    // (round 99, labmodels99) a model copied whole (data/refs/<time>-<name>/: a .gltf with its .bin and pictures, an .obj
    // with its .mtl, LabModelsCore.folderOf): its other files go to the preview with it, where its loaders find them
    // (three-sandbox.html refModelResolve), each kept in the page's asset cache by its own sig; the model's sig covers
    // them all (a picture changed on disk: the model is parsed again)
    const refFiles = new Map(); // id → { main: rel, list: [{ rel, path, size, sig }] }
    const fileBytes = new Map(); // a file's sig → its bytes (until the page holds it)
    const FILES_MAX = 400 * 1048576;
    let refAdded = null; // the last reference added: its files and what it came without (api.refAdded)
    const filesReady = (r) => { const fl = refFiles.get(r.id); if (!fl) return true; const held = heldNow(); return fl.list.every((x) => fileBytes.has(x.sig) || Boolean(held?.has(x.sig))); };
    const refReady = (r) => (refBytes.has(r.id) || refHeld(r)) && filesReady(r);
    let refsHold = null; // (round 48, labstartfast) a scene switch waiting for its references' bytes before its run (openSketch)
    const refsOf = () => (current ? (refsAll[current.id] ||= []) : []);
    const saveRefs = saver(() => { dispatchEvent(new Event('hearth:lab-refs')); return kvOk.has('three-refs') ? window.hub.kvSet('three-refs', refsAll) : null; }, 300); // (round 42: filewatch follows them)
    const REF_KINDS = [['image', /\.(png|jpe?g|gif|webp|bmp|svg)$/i], ['video', /\.(mp4|webm|mov|m4v|mkv)$/i], ['model', /\.(glb|gltf|obj|fbx|stl|ply)$/i],
      ['audio', /\.(mp3|wav|ogg|m4a|flac|aac)$/i], ['font', /\.(ttf|otf|woff2?)$/i], ['data', /\.(json|csv|txt|hdr|exr|bin)$/i]];
    const MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/mp4', m4v: 'video/mp4', mkv: 'video/webm', glb: 'model/gltf-binary', gltf: 'model/gltf+json', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', json: 'application/json', csv: 'text/csv', txt: 'text/plain', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
    const refKindOf = (name) => REF_KINDS.find(([, re]) => re.test(name))?.[0] || null;
    const refUse = (r) => (r.kind === 'image' || r.kind === 'video' ? `refTexture('${r.key}')` : `refs.${r.key}`);
    const REF_ICONS = { image: '🖼', video: '🎞', model: '🧊', audio: '🔊', font: '🔤', data: '📄' };
    const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    function refKey(name, except = null, among = refsOf()) {
      let k = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[^a-zA-Z_]+/, '') || 'ref';
      k = k[0].toLowerCase() + k.slice(1);
      const taken = new Set(among.filter((r) => r !== except).map((r) => r.key));
      let out = k; let i = 2;
      while (taken.has(out)) { out = `${k}${i}`; i += 1; }
      return out;
    }
    // (round 99, labmodels99) the folder's files (the model's own copy: what the copy wrote, or what sync brought)
    const hashStr = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
    async function listRefFiles(r) {
      const f = r.kind === 'model' && typeof LabModelsCore !== 'undefined' ? LabModelsCore.folderOf(r.path) : null;
      if (!f) { refFiles.delete(r.id); return null; }
      let all; try { all = await window.hub.fs.list(f.dir, { recursive: true, depth: 14 }); } catch { return refFiles.get(r.id) || null; } // (a listing that failed: what it had)
      const mainKey = LabModelsCore.key(r.path); let total = 0;
      const list = (all || []).filter((x) => x && !x.isDir && x.path && LabModelsCore.key(x.path) !== mainKey)
        .map((x) => ({ rel: String(x.path).slice(f.dir.length + 1).split(/[\\/]+/).join('/'), path: x.path, size: x.size || 0, sig: `${x.path}|${x.size || 0}|${Math.round(x.mtime || 0)}` }))
        .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0)).filter((x) => (total += x.size) <= FILES_MAX);
      const fl = { main: f.rel, list };
      const was = refFiles.get(r.id);
      refFiles.set(r.id, fl);
      // (round 100, modeltex100) the files followed on disk (filewatch.js) follow the listing
      if (!was || was.list.map((x) => x.path).join('\n') !== list.map((x) => x.path).join('\n')) dispatchEvent(new Event('hearth:lab-refs'));
      return fl;
    }
    // (round 100, modeltex100) a model's other files for filewatch.js: Hearth's copy of each, and the original it was
    // copied from when the layout says where (the reference's src: its main file's place in the original folder)
    function refFilesOf(r) {
      const fl = r ? refFiles.get(r.id) : null;
      if (!fl?.list.length) return [];
      let top = null; let sep = '/';
      if (r.src) {
        const sp = String(r.src).split(/[\\/]/); const mp = String(fl.main).split('/');
        sep = /\\/.test(r.src) && !/\//.test(r.src) ? '\\' : '/';
        if (sp.length > mp.length && sp.slice(-mp.length).join('/').toLowerCase() === mp.join('/').toLowerCase()) top = sp.slice(0, sp.length - mp.length).join(sep);
      }
      return fl.list.map((x) => ({ rel: x.rel, path: x.path, ...(top && !/^hearth-files\//.test(x.rel) ? { src: `${top}${sep}${x.rel.split('/').join(sep)}` } : {}) }));
    }
    function reloadRefFile(...a) { return labPart(K, 'refs', 'reloadRefFile', a); } // tools/three-lab-refs.js
    const withFiles = (r, sig) => { const fl = refFiles.get(r.id); return sig && fl?.list.length ? `${sig}+${fl.list.length}-${hashStr(fl.list.map((x) => x.sig).join('\n'))}` : sig; };
    function addRef(...a) { return labPart(K, 'refs', 'addRef', a); } // tools/three-lab-refs.js
    // (round 97, labproj97) a removed reference's file to the Trash: given as a list (a bare path was walked letter by
    // letter by fs:trash: the file never went, and "/" was asked for), and only when no other scene's reference or song
    // still uses it (a copied project whose copy of the file couldn't be made shares the original's)
    // (round 98, bundle98) a model a duplicate copied whole (data/refs/<time>-<name>/…: the model and the files it names)
    // goes as its folder, when no other reference or song lies in it
    function trashRefFile(r) {
      if (!r?.path || SceneSafeCore.refShared(r.path, { refsAll, extras, except: r })) return;
      const dir = /^(.*[\\/]refs[\\/]\d{10,}-[^\\/]+)[\\/]/.exec(r.path)?.[1];
      window.hub.fs.trash([dir && !SceneSafeCore.refShared(dir, { refsAll, extras, except: r, under: true }) ? dir : r.path]).catch(() => {});
    }
    function addRefs(...a) { return labPart(K, 'refs', 'addRefs', a); } // tools/three-lab-refs.js
    function removeRef(r) {
      refsAll[current.id] = refsOf().filter((x) => x !== r);
      refBytes.delete(r.id);
      saveRefs(); sendRefs(); renderRefsBtn();
      trashRefFile(r); // (round 97, labproj97)
    }
    function renameRef(r, to) {
      const k = refKey(to, r);
      const used = layersOf().some((L) => L.code.includes(r.key));
      const masked=layersOf().filter(L=>L.mask?.source===`ref:${r.key}`);
      r.key = k;
      saveRefs(); sendRefs(); renderRefsBtn();
      for(const L of masked)editLayer(L.id,{mask:{...L.mask,source:`ref:${k}`}});
      if (used) toast(`Renamed to ${k}: code that used the old name needs updating (ask the director)`, { timeout: 4000 });
      return k;
    }
    // Bytes for every reference of the open sketch; a run that needed a missing one runs again.
    async function loadRefBytes() {
      let added = false; const owner = current?.id;
      // (round 39, labmemory) only the open scene's references stay in memory: every scene visited kept its files' bytes
      // (a video reference is the whole video) until the Lab closed; another scene's are read again when it opens
      const mine = new Set(refsOf().map((r) => r.id));
      for (const id of [...refBytes.keys()]) if (!mine.has(id)) refBytes.delete(id);
      for (const id of [...refSigs.keys()]) if (!mine.has(id)) refSigs.delete(id);
      // (round 99, labmodels99) a model's other files: listed, the ones another scene's model used let go
      for (const id of [...refFiles.keys()]) if (!mine.has(id)) refFiles.delete(id);
      await Promise.all(refsOf().map((r) => listRefFiles(r).catch(() => null)));
      if (current?.id !== owner || workspaceReleased) return false;
      { const keep = new Set([...refFiles.values()].flatMap((fl) => fl.list.map((x) => x.sig))); for (const k of [...fileBytes.keys()]) if (!keep.has(k)) fileBytes.delete(k); }
      // (round 75, labload75) each file's sig (path | size | modified) first: a file the page holds isn't read at all
      if (assetCacheOn()) await Promise.all(refsOf().map(async (r) => { try { const st = await window.hub.fs.stat(r.path); const sig = withFiles(r, st && !st.error ? `${r.path}|${st.size}|${Math.round(st.mtimeMs || st.mtime || 0)}` : null); if (sig && refSigs.get(r.id) !== sig) { refSigs.set(r.id, sig); if (refBytes.has(r.id) && st.size !== refBytes.get(r.id).byteLength) refBytes.delete(r.id); } } catch { /* file gone */ } }));
      // (round 48, labstartfast) read at once, not one after the other
      await Promise.all(refsOf().filter((r) => !refReady(r)).map(async (r) => {
        if (!(refBytes.has(r.id) || refHeld(r))) { try { const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 400 * 1048576 }); if(current?.id!==owner||workspaceReleased)return; refBytes.set(r.id, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); added = true; } catch { /* file gone */ } }
        // (round 99, labmodels99) the model's other files (the ones the page doesn't hold), side by side
        const held = heldNow();
        await Promise.all((refFiles.get(r.id)?.list || []).filter((x) => !fileBytes.has(x.sig) && !held?.has(x.sig)).map(async (x) => {
          try { const u8 = await window.hub.fs.read(x.path, { encoding: 'buffer', maxBytes: FILES_MAX }); if (current?.id !== owner || workspaceReleased) return; fileBytes.set(x.sig, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); added = true; } catch { fileBytes.set(x.sig, new ArrayBuffer(0)); /* gone meanwhile: sent empty (its loader then says which) */ }
        }));
      }));
      if(current?.id===owner&&!workspaceReleased)sendRefs();
      return added;
    }
    // (round 39, labmemory) the same references and palette as the page already has aren't copied over again (each
    // scene switch sent every file whole: a video reference was copied twice per switch); a new page asks afresh
    let refsSig = null;
    const refsSigOf = (refs) => JSON.stringify([refs.map((r) => [r.id, r.key, r.kind, refSigs.get(r.id) || refBytes.get(r.id)?.byteLength, ...(refFiles.get(r.id)?.list || []).map((x) => x.sig)]), current?.palette || []]);
    function reloadRef(...a) { return labPart(K, 'refs', 'reloadRef', a); } // tools/three-lab-refs.js
    // (round 75, labload75) fresh: a run in a page that just started; a file the last page held (so not read) is read
    // now, and the scene runs again once it's here
    // (round 99, labmodels99) a model copied whole: where it sits in its folder and its other files (each with its sig; its
    // bytes unless the page holds it)
    function refFilesItem(r, held) {
      const fl = refFiles.get(r.id);
      if (!fl?.list.length) return {};
      const on = assetCacheOn();
      return { main: fl.main, files: fl.list.map((x) => ({ rel: x.rel, mime: MIMES[x.rel.split('.').pop().toLowerCase()] || '', ...(on ? { sig: x.sig } : {}), ...(on && held?.has(x.sig) ? {} : { buffer: (fileBytes.get(x.sig) || new ArrayBuffer(0)).slice(0) }) })) };
    }
    function sendRefs({ fresh = false } = {}) {
      const refs = refsOf().filter((r) => refReady(r));
      const missing = refsOf().filter((r) => !refReady(r) && refSigs.has(r.id));
      if (missing.length && !workspaceReleased) { const want = current; loadRefBytes().then((added) => { if (fresh && added && current === want && layersOf().some((L) => /\brefs\b|refTexture/.test(L.code))) run({ sync: true }); }).catch(() => {}); }
      const sig = refsSigOf(refs);
      if (sig === refsSig && refs.length) return;
      refsSig = sig;
      const held = heldNow(); const warm = layersOf().map((L) => L.code).join('\n');
      const items = refs.map((r) => { const s = assetCacheOn() ? refSigs.get(r.id) : null; return { key: r.key, kind: r.kind, mime: MIMES[r.name.split('.').pop().toLowerCase()] || '', ...(s ? { sig: s, ...(warm.includes(r.key) ? { warm: true } : {}) } : {}), ...(s && held?.has(s) ? {} : { buffer: refBytes.get(r.id).slice(0) }), ...refFilesItem(r, held) }; });
      box.send({ type: 'refs', items, palette: current?.palette || [] });
    }
    const refsBtn = btn('🖼 References', 'Images, videos, 3D models, sounds and data for this sketch. The Three Director can see and use them; you can also drop files in its chat.', () => openRefs());
    refsBtn.dataset.feature = 'References';
    function renderRefsBtn() { const n = refsOf().length; refsBtn.textContent = n ? `🖼 ${n}` : '🖼'; refsBtn.title = `References${n ? ` (${n})` : ''}: images, videos, 3D models, sounds and data for this sketch. The Three Director can see and use them; you can also drop files in its chat.`; }
    let refsDlg = null; let refsGrid = null;
    function openRefs(...a) { return labPart(K, 'refs', 'openRefs', a); } // tools/three-lab-refs.js
    function renderRefsDlg(...a) { return labPart(K, 'refs', 'renderRefsDlg', a); } // tools/three-lab-refs.js
    api.addRef = (p, o) => addRef(p, o);
    api.refAdded = () => refAdded; // (round 99, labmodels99)
    api.addRefs = (paths) => addRefs(paths);
    api.refsFor = (id) => (refsAll[id] || []).slice(); // (round 72) a scene's references, on screen or not
    // (round 102, labchat102) a layer changed backstage (a chat's scene not on screen: an AI's edit, ▶ Apply, its ↶ Undo):
    // the code it had goes into that scene's History, as on screen (it had none: History per scene missed those versions)
    api.keepVersion = (sid, layerId, code) => {
      if (!sid || !String(code || '').trim()) return false;
      const list = (history[!layerId || layerId === 'main' ? sid : `${sid}:${layerId}`] ||= []);
      if (list[0]?.code === code) return false;
      list.unshift({ at: Date.now(), code: String(code) });
      list.length = Math.min(list.length, 40);
      saveHistory(sid);
      return true;
    };
    // (round 73, labtools73) one taken out of a scene, on screen or not (a backstage chat's references remove, a tool call
    // undone as a whole): the file goes to the Trash like the References dialog's remove
    api.removeRef = (refId, { sketchId = null } = {}) => {
      const owner = sketchId || current?.id;
      const r = (refsAll[owner] || []).find((x) => x.id === refId);
      if (!r) return false;
      if (owner === current?.id) { removeRef(r); return true; }
      refsAll[owner] = refsAll[owner].filter((x) => x !== r);
      saveRefs();
      trashRefFile(r); // (round 97, labproj97)
      return true;
    };
    const noteBtn = btn('📌 Note', 'Take a screenshot and a note at this moment, for a change you want here (N)', () => takeNote(), 'ghost small imp-capture');
    const notesBtn = btn('Notes', 'Your notes on this sketch: jump to them, mark them done, send them to the Three Director', (e) => notesList(e.currentTarget));
    notesBtn.dataset.feature = 'Notes list';
    function renderNotes({ soon = false } = {}) { // (round 86, projopen86) soon: the timeline's pins drawn in the coming frame (see setNotes)
      player.setNotes(notesOf().map((n) => ({ id: n.id, t: n.t, text: n.text, done: n.done })), { onOpen: (id, x, y) => openNote(id, x, y) }, { soon });
      const open = notesOf().filter((n) => !n.done).length;
      notesBtn.textContent = notesOf().length ? `Notes ${open}${open !== notesOf().length ? `/${notesOf().length}` : ''}` : 'Notes';
    }
    function takeNote(...a) { return labPart(K, 'notes', 'takeNote', a); } // tools/three-lab-notes.js
    function openNote(...a) { return labPart(K, 'notes', 'openNote', a); } // tools/three-lab-notes.js
    function notesList(...a) { return labPart(K, 'notes', 'notesList', a); } // tools/three-lab-notes.js

    // ---------- focus: almost fullscreen ----------
    let focusOn = false;
    const exitFocus = el('button', { class: 'lab-focus-exit', text: '✕ Exit focus (Esc)', on: { click: () => setFocus(false) } });
    document.body.append(exitFocus);
    api.sketchList = () => [...sketches].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => ({ id: s.id, name: s.name }));
    api.openSketchById = (id) => { if (sketches.some((s) => s.id === id) && id !== current?.id) openSketch(id); };
    // (round 52, presentready) what getting ready for a show needs from the Lab (tools/three-ready.js)
    api.present = {
      host: previewHost, get player() { return player; }, send: (m) => box.send(m), syncPark: () => syncPark(),
      frame: () => (stage?.size?.id && stage.size.id !== 'fit' ? { w: stage.size.width, h: stage.size.height } : null),
      scene: () => (current ? { id: current.id, name: current.name } : null),
    };
    api.lab = {
      sheet: () => showSheet(),
      present: (mode) => togglePresent(mode), focus: () => setFocus(!focusOn), consoleMode: (m) => setConsoleMode(m),
      speed: (r) => player.setRate(r), cue: () => player.addCue(player.time),
      // what a controller would send (also used by tests): midiMessage([0xB0, 21, 64])
      midiMessage: (bytes) => onMidi({ data: bytes }), midiLearn: (o) => { midiLearn = o; }, write: (on) => setWrite(on),
    };
    api.shaderHost = { editor, errors: () => errors, selId: () => selId }; // (round 23) ◇ shader layers' inline errors (tools/three-shader.js)
    // (round 36, labsearch) what 🔎 Lab search lists and runs (tools/three-search*.js): the Lab's own menus as they are
    // built right now (the preview's right-click, the toolbar's ⋯, Sketch ▾, a layer's right-click), its layers and sliders
    api.search = {
      get pane() { return pane; },
      // (round 158, split158) the rows come from their part: at once once it is in (Lab search loads it first: lazy-data.js labsearch), a promise the first time
      menus: () => { const m = [previewMenuItems(), labMoreItems(), sketchMenuRows()]; const o = ([preview, more, sketch]) => ({ preview, more, sketch }); return m.some((x) => x instanceof Promise) ? Promise.all(m).then(o) : o(m); },
      layerMenu: (id) => layersPanel.menuFor?.(id) || null,
      layers: () => [...layersOf()].reverse().map((L) => ({ id: L.id, name: L.name, mask: L.mask || null, visible: L.visible !== false, selected: L.id === selId, color: L.color, filter: ThreeLayers.isFilter(L.code || '') })),
      selectLayer: (id) => { if (!layerById(id)) return false; selectLayer(id); return true; },
      showLine: (id, line) => { if (!layerById(id)) return false; if (selId !== id) selectLayer(id); setCodeVisible(true); requestAnimationFrame(() => goToLine(line)); return true; }, // (round 81, projsearch81) Find in this project › a code line
      // the sliders of the layers whose panel exists (the selected one at least)
      sliders: () => layersOf().flatMap((L) => { const c = controllers.get(L.id); return c ? c.controls().map((x) => ({ layerId: L.id, layer: L.name, key: x.key, label: x.label, group: x.group || '' })) : []; }),
      revealSlider(layerId, label) {
        if (!layerById(layerId)) return false;
        if (selId !== layerId) selectLayer(layerId);
        lkOpen(); // (round 142, panel142) its layer open in the panel
        const c = ctlFor(layerById(layerId));
        c?.find?.(label);
        c?.focusSearch?.();
        requestAnimationFrame(() => { const s = [...pane.querySelectorAll('.tw-search')].find((n) => n.checkVisibility?.({ visibilityProperty: true })); s?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        return true;
      },
      looks: () => { const c = selCtl(); return c ? c.looksApi.list() : []; },
      applyLook: (name) => { const c = selCtl(); if (!c) return false; c.looksApi.apply(name); return true; },
    };
    function setFocus(on) {
      focusOn = on;
      document.body.classList.toggle('lab-focus', on);
      focusBtn.classList.toggle('on', on);
      if (on) player.setSize('strip', { temporary: true }); else player.restoreSize();
    }
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && focusOn) setFocus(false); });

    const layerProps = (L, z) => ({ keys: animKeys(L), sliderKeys: sliderKeysOf(L), overrides: L.overrides || null, camMoves: L.camMoves?.length ? L.camMoves : null, name: L.name, mask: L.mask || null, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', in: L.in ?? null, out: L.out ?? null, fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0, x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, selected: L.id === selId, slot: L.slot, z: z ?? layersOf().indexOf(L) });
    const extrasOf = (L) => {
      const ex = (extras[current.id] ||= {});
      return L.id === 'main' ? ex : ((ex.layers ||= {})[L.id] ||= {});
    };
    // Sliders: one controller per layer (tools/three-tweaks.js); the panel shows the selected layer's.
    const controllers = new Map();
    // (round 142, panel142) slider moves reach the preview once a frame: a knob dragged with a 240 Hz mouse sent 4 messages
    // a drawn frame, each one cloned and handled by the page; now the newest value of each slider goes in the coming frame
    // (a timer stands in when no frame comes: a hidden window, a busy GPU)
    const tweakQ = new Map(); let tweakRaf = 0; let tweakT = 0;
    const tweakFlush = () => { cancelAnimationFrame(tweakRaf); clearTimeout(tweakT); tweakRaf = 0; tweakT = 0; const q = [...tweakQ.values()]; tweakQ.clear(); for (const m of q) box.send(m); };
    function tweakSoon(m) {
      tweakQ.delete(`${m.layer}:${m.index}`); tweakQ.set(`${m.layer}:${m.index}`, m);
      if (!tweakRaf) { tweakRaf = requestAnimationFrame(tweakFlush); tweakT = setTimeout(tweakFlush, 50); }
    }
    api.parkTweaks=on=>{for(const c of controllers.values())c.setParked(on);};
    const layerMods = {};
    const mergedMods = () => Object.assign({}, ...Object.values(layerMods));
    function ctlFor(L) {
      let c = controllers.get(L.id);
      if (c) return c;
      const id = L.id;
      c = ThreeTweaks.controller({
        send: (msg) => {
          const Lx = layerById(id);
          if (!Lx) return;
          if (msg.type === 'tweak') tweakSoon({ ...msg, index: msg.index + baseOf(Lx), layer: id }); // (round 142, panel142) once a frame
          else if (msg.type === 'tweak-mods') {
            layerMods[id] = Object.fromEntries(Object.entries(msg.mods || {}).map(([i, m]) => [Number(i) + baseOf(Lx), m]));
            box.send({ type: 'tweak-mods', mods: mergedMods() });
          } else box.send(msg);
        },
        // in place (a page that isn't up yet gets a full run anyway); resolves once that layer has drawn (≤ 1.5 s)
        rerun: () => (run({ hot: true, layer: id }) ? whenDrawn(id) : null),
        persist: (kind, data) => { const Lx = layerById(id); if (!Lx || !current) return; extrasOf(Lx)[kind] = data; saveExtras(); window.LabRecipesHook?.note?.(kind); }, // (round 39, labrecipes: ♪ links)
        quickAsk: (text) => askDirector(text === '3 variations to pick from'
          ? `Make 3 clearly different variations of the layer "${layerById(id)?.name}" using only its sliders (three_sliders), no code changes. For each: set the values, save it as a look named "Variation A", "B" or "C" (three_looks), and show it to me (chat_do show). Then ask me with chat_ask which one I like (A, B, C or none) and apply that look.`
          : text.endsWith('…') ? `${text.slice(0, -1)} ` : `${text} (layer "${layerById(id)?.name}")`, { send: !text.endsWith('…') }),
        goToLine: (line) => { if (selId !== id) selectLayer(id); setCodeVisible(true); requestAnimationFrame(() => goToLine(line)); },
        commit: (code) => {
          const Lx = layerById(id);
          if (!Lx) return;
          if (selId === id) { snapshot(); editor.setValue(code); persist(); } else { Lx.code = code; touch(); }
          window.ThreeHistory?.changed?.('sliders');
        },
        keyframes: {
          state: (key) => keyStateFor(layerById(id), `s:${key}`),
          toggle: (key, value) => toggleKeyFor(id, `s:${key}`, value),
          changed: (key, value, o) => autoKey(id, `s:${key}`, value, o),
          writing: () => writing(),
        },
        touched: (key, label) => { midiTouched(id, key, label); window.ThreeStage?.touched?.(id, key, label); lastTouched = { layer: id, key, label, at: Date.now() }; }, // (round 141, cmdbar141) lastTouched: the bar's "follow bass"
        learn: async (key, label) => { if (!(await midiInit())) return; midiLearn = { stage: 'control', layer: id, key, label }; toast(`Turn the knob or fader for "${label}"`, { timeout: 4000 }); },
        palette: () => current?.palette || [],
        pins: { has: (key) => favPinned(id, key), toggle: (key) => favsDo((F) => F.toggle({ t: 's', layer: id, key })), open: () => { const s = lkSecs.favs; if (s.d.open) s.d.open = false; else lkOpen('favs'); } }, // (round 142, panel142) the ★ section at the top of the panel // (round 138, favs138) ★ the scene's favourite controls
        explain: () => (window.LabEasy?.explainLayer ? LabEasy.explainLayer(id) : (window.Lazy ? Lazy.load('explain') : Promise.resolve()).then(() => LabExplain.open({ layerId: id })).catch((err) => toast(err.message, { type: 'error' }))), // (round 132, explain132) the Sliders ⋯ › ✦ Explain this layer
        clock: () => (!(player.loaded && player.playing) && window.ThreeStage?.clock?.()) || ({ t: player.loaded ? player.time : performance.now() / 1000, bpm: player.loaded ? player.bpm : (liveBpm?.bpm || 120), playing: player.playing, section: player.loaded ? player.sectionAt().energy : null }),
        askForSliders: () => askDirector(`Add clearly named sliders to the layer "${layerById(id)?.name}" of "${current?.name}" with tweak(): the 4–8 settings I'd most want to play with (motion, colors, lighting, glow, how much it reacts to the music…), with labels, groups and hints, read every frame so they change live. Keep everything else the same.`, { send: false }),
      });
      c.setVisible(!column.hidden);
      c.setParked(parkedNow);
      c.load(extrasOf(L));
      controllers.set(id, c);
      return c;
    }
    const selCtl = () => (sel() ? ctlFor(sel()) : null);
    // (round 138, favs138) ★ favourite controls (tools/three-favs.js, lazy group favs): the scene's pins, { v, list: [{ t: 's', layer, key } | { t: 'd', dial }] }
    const favPinned = (lid, key) => (current?.favs?.list || []).some((x) => x.t === 's' && x.layer === lid && x.key === key);
    const favsDo = (fn) => (window.Lazy && typeof LabFavs === 'undefined' ? Lazy.load('favs') : Promise.resolve()).then(() => fn(window.LabFavs)).catch((err) => toast(window.calmError ? calmError(err) : err.message, { type: 'error' }));
    // ---------- "building…" while the director works ----------
    // A shimmer on the preview's corner while a director turn runs on this scene (or its tool calls do), and on the
    // row of each layer that is being (re)built until its first new frame is drawn. CSS animations only (three-lab.css).
    const buildPill = el('div', { class: 'lab-building', attrs: { 'aria-hidden': 'true' } }, el('span', { class: 'lab-building-dot' }), 'building…');
    const builds = new Map(); // layer id → { t: safety timer (a layer that never draws stops anyway), loud: the director's }
    const turns = new Set(); // director chats answering right now
    let works = 0; // director tool calls in flight on the scene on screen
    const onThisScene = (chatId) => typeof ChatScenes === 'undefined' || !ChatScenes.linkOf?.(chatId) || ChatScenes.linkOf(chatId) === current?.id;
    const directorWorking = () => works > 0 || [...turns].some(onThisScene);
    // (round 21) rebuilds wait on these: the layer drew its first new frame, failed, or 1.5 s went by
    const drawnWaiters = new Map(); // layer id → [resolve]
    const whenDrawn = (id, ms = 1500) => new Promise((r) => { const l = drawnWaiters.get(id) || []; l.push(r); drawnWaiters.set(id, l); setTimeout(r, ms); });
    function building(id, on) {
      if (!on && drawnWaiters.has(id)) { const l = drawnWaiters.get(id); drawnWaiters.delete(id); for (const f of l) f(); }
      const was = builds.get(id);
      clearTimeout(was?.t);
      if (on) builds.set(id, { t: setTimeout(() => building(id, false), 6000), loud: Boolean(was?.loud) || directorWorking() });
      else if (!builds.delete(id)) return;
      paintBuilding();
    }
    let buildOffT = 0;
    function paintBuilding() {
      for (const row of layersPanel.el.querySelectorAll('.ly-row[data-id]')) {
        const b = builds.has(row.dataset.id);
        if (row.classList.contains('ly-building') !== b) row.classList.toggle('ly-building', b);
      }
      // a short linger, so quick calls one after another read as one stretch of work
      const busy = () => directorWorking() || [...builds.values()].some((b) => b.loud);
      if (busy()) { clearTimeout(buildOffT); buildOffT = 0; if (!buildPill.classList.contains('on')) buildPill.classList.add('on'); }
      else if (buildPill.classList.contains('on') && !buildOffT) buildOffT = setTimeout(() => { buildOffT = 0; if (!busy()) buildPill.classList.remove('on'); }, 700);
    }
    api.directorWork = (d) => { works = Math.max(0, works + d); paintBuilding(); };
    if (typeof Native !== 'undefined' && Native.hooks) {
      life.hook(Native.hooks.send, (agentId, chat) => { const a = H.agent?.(agentId); if (chat?.id && (a?.threeTools || a?.dock === 'three')) { turns.add(chat.id); paintBuilding(); } }); // (round 161, fix161: let go on ThreeLab.drop)
      life.hook(Native.hooks.event, (ev, chat) => { if (chat?.id && ev?.type !== 'delta' && turns.delete(chat.id)) paintBuilding(); });
    }
    addEventListener('hearth:sketch', () => paintBuilding());
    const tweaksSlot = el('div', { class: 'tw-slot' });
    const layersPanel = ThreeLayers.panel({
      onSolo: (id) => setSolo(soloNow() === id ? null : id),
      onSelect: (id) => selectLayer(id),
      onChange: (id, patch, { live }) => editLayer(id, patch, { live }),
      onAdd: (kind) => addLayer(kind),
      onMoodboard: id => layerStudio.moodboard(id),
      onMaskTrack: id => layerStudio.generate({maskSource:id}),
      onPaste: (copies) => { for (const copy of copies) { const { id, slot, group, solo, ...props } = copy; addLayer('paste', { code: copy.code, props: { ...props, name: `${copy.name} copy` } }); } },
      onRemove: (id) => removeLayer(id),
      onReorder: (ids) => reorderLayers(ids),
      now: () => player.time,
      duration: () => player.duration,
      loop: () => player.loop,
      keyState: (id, prop) => keyStateFor(layerById(id), prop),
      toggleKey: (id, prop, value) => toggleKeyFor(id, prop, value),
      valueAt: (L, prop) => valueAt(L, prop),
      onPreset: (id, presetId) => applyPreset(id, presetId),
      // (round 142, panel142) ONE Layers & knobs panel: under an open layer's row, its knobs (the selected layer's in the
      // slot the Lab fills; a pinned one's own sliders), built only once it is open
      knobs: (id, selected) => { if (selected) return tweaksSlot; const L = layerById(id); return L ? ctlFor(L).el : null; },
      shown: (id) => { const L = layerById(id); if (L) { const c = ctlFor(L); c.setVisible(!column.hidden); c.showUI(); } },
    });
    const column = el('div', { class: 'tw-column lk-merged' }, layersPanel.el);
    // (round 142, panel142) ★ Favourites and 🎛 Dials: two folded sections at the top of the panel, their cards inside
    const lkSecs = {};
    const lkSection = (key, label, title, group, glob) => {
      const body = el('div', { class: 'lk-sec-body' });
      const n = el('span', { class: 'lk-sec-n' });
      const d = el('details', { class: `lk-sec lk-${key}`, dataset: { feature: label } }, el('summary', { title }, el('span', { text: label }), n), body);
      d.addEventListener('toggle', () => {
        if (d.open) (window.Lazy && !window[glob] ? Lazy.load(group) : Promise.resolve()).then(() => window[glob].open({ inline: body })).catch((err) => { d.open = false; toast(window.calmError ? calmError(err) : err.message, { type: 'error' }); });
        else if (window[glob]?.state?.().open && body.firstChild) window[glob].close();
      });
      lkSecs[key] = { d, n, body };
      return d;
    };
    layersPanel.el.insertBefore(el('div', { class: 'lk-secs' },
      lkSection('favs', '★ Favourites', 'Your ★ favourite controls, from every layer (right-click a slider › ★ Pin to favourites)', 'favs', 'LabFavs'),
      lkSection('dials', '🎛 Dials', 'Mood dials: a few scene-wide knobs that move many sliders at once', 'dials', 'LabDials')), layersPanel.el.querySelector('.ly-find'));
    function paintSecs() {
      const f = (current?.favs?.list || []).length; const d = (current?.dials?.list || []).length;
      const ft = f ? String(f) : ''; const dt = d ? String(d) : '';
      if (lkSecs.favs.n.textContent !== ft) lkSecs.favs.n.textContent = ft;
      if (lkSecs.dials.n.textContent !== dt) lkSecs.dials.n.textContent = dt;
    }
    // open the panel at the right place: a section (favs / dials), or the selected layer's knobs
    function lkOpen(key) {
      setSlidersVisible(true);
      const s = lkSecs[key];
      if (s) { if (!s.d.open) s.d.open = true; requestAnimationFrame(() => s.d.scrollIntoView({ block: 'nearest' })); return s.body; }
      const L = sel(); if (!L) return null;
      layersPanel.open?.(L.id, true);
      requestAnimationFrame(() => { const b = layersPanel.knobsOf?.(L.id); (b?.previousElementSibling || b)?.scrollIntoView({ block: 'start' }); });
      return layersPanel.knobsOf?.(L.id) || null;
    }
    // Right-click a layer: everything for it in one menu (its ⧉ / 🗑 buttons were never used, so they're tucked away)
    layersPanel.el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.ly-row');
      if (!row || e.defaultPrevented) return; // (round 35, bugbash2) the row's own menu (LabEasy.layerMenu) took it: one menu, not two
      e.preventDefault();
      layerRowMenu(e, row);
    });
    function layerRowMenu(...a) { return labPart(K, 'dialogs', 'layerRowMenu', a); } // tools/three-lab-dialogs.js
    function renderLayers() {
      if (!current) return;
      if (LabPlay.playing) LabPlay.count('layers'); // (round 142, smooth142: counted while playing, dev/checks/smooth142.js)
      layersPanel.render(layersOf(), selId);
      paintSecs(); // (round 142, panel142)
      paintBuilding();
      player.setTracks(trackList(), trackHandlers, { soon: true }); // (round 54) the timeline draws in the coming frame (see setTracks)
      syncKeyUI(true);
    }
    function selectLayer(id) {
      const L = layerById(id);
      if (!L || !current) return;
      if (selId !== id) {
        selId = id;
        extras[current.id] = { ...(extras[current.id] || {}), selectedLayer: id };
        saveExtras();
        editor.setValue(L.code);
        editor.setErrorLines(errors.filter((e) => (e.layer || 'main') === id || (!e.layer && layersOf().length === 1)).map((e) => e.line).filter(Boolean));
        for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: { selected: x.id === id } });
        if (editOn) { editSel = null; box.send({ type: 'edit', cmd: 'on', layer: id }); paintEditSel(); }
      }
      tweaksSlot.replaceChildren(ctlFor(L).el); ctlFor(L).showUI();
      renderLayers();
    }
    const saveSoon = debounce(() => save(), 300);
    function touch() { current.updatedAt = Date.now(); current.code = layersOf()[0]?.code ?? current.code; saveSoon(); window.ThreeHistory?.changed?.('layers'); window.LabRecipesHook?.note?.('layers'); }
    // direct: set the base value even when the property is animated (the director does this; keyframes still win).
    function editLayer(id, patch, { live = false, direct = false } = {}) {
      const L = layerById(id);
      if (!L) return;
      patch = { ...patch };
      let wrote = false;
      if (!direct && writing()) for (const k of Object.keys(patch)) if (ANIM.includes(k) && typeof patch[k] === 'number') { writeKey(L, k, patch[k], !live); delete patch[k]; wrote = true; }
      // Animated properties: the move becomes a keyframe at the playhead (like After Effects).
      const animated = direct ? [] : Object.keys(patch).filter((k) => ANIM.includes(k) && keysOf(L, k).length);
      if (animated.length) {
        if (dragKeyT == null) dragKeyT = player.time;
        for (const k of animated) { L.keys[k] = upsertKey(keysOf(L, k), dragKeyT, patch[k]); delete patch[k]; }
        if (!live) dragKeyT = null;
      }
      if ('visible' in patch && typeof LayerGroups !== 'undefined') LayerGroups.manual(L); // (round 44) its own eye now, not a group's / a solo's
      Object.assign(L, patch);
      // (round 21) a drag (live) sends only what it moves, not every prop with every keyframe ~60 times a second (the
      // preview merges them); the timeline's tracks follow once a frame
      const part = live ? livePart(L, patch, wrote || animated.length > 0) : null;
      // (round 49, labscrub) …and once a frame: a clip or a value dragged sends its newest props in the coming frame
      // (merged), not one message per pointer event the preview can't draw anyway
      if (part) { livePend.set(id, { ...livePend.get(id), ...part }); if (!liveRaf) liveRaf = requestAnimationFrame(liveFlush); renderTracksSoon(); return; }
      livePend.delete(id);
      box.send({ type: 'layer-props', id, props: part || layerProps(L) });
      if (live) { renderTracksSoon(); return; }
      touch();
      renderLayers();
    }
    const livePend = new Map(); let liveRaf = 0;
    function liveFlush() { liveRaf = 0; for (const [id, props] of livePend) box.send({ type: 'layer-props', id, props }); livePend.clear(); }
    function renderTracksOnly() { cancelAnimationFrame(tracksRaf); tracksRaf = 0; player.setTracks(trackList(), trackHandlers); }
    let tracksRaf = 0;
    const renderTracksSoon = () => { if (!tracksRaf) tracksRaf = requestAnimationFrame(() => { tracksRaf = 0; renderTracksOnly(); }); };
    // the props a live drag changed, as layerProps() would give them; null: something else, send everything
    const LIVE_PROPS = { opacity: (L) => L.opacity ?? 1, x: (L) => L.x || 0, y: (L) => L.y || 0, scale: (L) => L.scale ?? 1, rotate: (L) => L.rotate || 0, in: (L) => L.in ?? null, out: (L) => L.out ?? null, fadeIn: (L) => L.fadeIn || 0, fadeOut: (L) => L.fadeOut || 0, blend: (L) => L.blend || 'normal' };
    function livePart(L, patch, keyed) {
      const part = {};
      for (const k of Object.keys(patch)) { if (!LIVE_PROPS[k]) return null; part[k] = LIVE_PROPS[k](L); }
      if (keyed) part.keys = animKeys(L);
      return part;
    }
    const uniqueName = (name) => { const names = new Set(layersOf().map((L) => L.name)); if (!names.has(name)) return name; let i = 2; while (names.has(`${name} ${i}`)) i += 1; return `${name} ${i}`; };
    // ◇ Shape generator, ◐ Mask layer, Fill from moodboard (tools/three-fx.js, the layers list): every method answers a
    // promise; (round 158, split158) the work is in layerStudioDo (a part)
    const layerStudio = api.layerStudio = Object.fromEntries(['generate', 'moodboard', 'pickMedia', 'useAsset'].map((m) => [m, (...a) => layerStudioDo(m, a)]));
    let studioImpl = null;
    function layerStudioDo(...a) { return labPart(K, 'dialogs', 'layerStudioDo', a); } // tools/three-lab-dialogs.js
    function newLayer(o) {
      const Ls = layersOf();
      const slot = Math.max(-1, ...Ls.map((L) => L.slot || 0)) + 1;
      return ThreeLayers.defaults({ color: ThreeLayers.COLORS[slot % ThreeLayers.COLORS.length], slot, ...o, name: uniqueName(o.name || 'Layer') });
    }
    // Adds a layer on top (or at `index`) and runs just that layer.
    function addLayer(kind, { code, name, index, props } = {}) {
      if (!current) return null;
      if (kind === 'ask') { askDirector('Add a layer: ', { send: false }); return null; }
      let L;
      if (kind === 'copy') {
        const S = sel();
        L = newLayer({ ...JSON.parse(JSON.stringify(S)), id: ThreeLayers.newId(), name: `${S.name} copy` });
      } else if (code != null) L = newLayer({ name: name || 'Layer', code, ...(props || {}) });
      else {
        const t = [...ThreeLayers.TEMPLATES, ...ThreeLayers.FILTERS].find((x) => x.id === kind) || ThreeLayers.TEMPLATES[0];
        L = newLayer({ name: name || t.name, code: t.code, ...(props || {}) });
      }
      const Ls = layersOf();
      Ls.splice(index == null ? Ls.length : Math.max(0, Math.min(Ls.length, index)), 0, L);
      touch();
      selId = L.id;
      extras[current.id] = { ...(extras[current.id] || {}), selectedLayer: L.id };
      saveExtras();
      editor.setValue(L.code);
      tweaksSlot.replaceChildren(ctlFor(L).el); ctlFor(L).showUI();
      for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: layerProps(x) });
      run({ hot: true, layer: L.id });
      renderLayers();
      return L;
    }
    function removeLayer(...a) { return labPart(K, 'dialogs', 'removeLayer', a); } // tools/three-lab-dialogs.js
    // (round 116, layerdelete116) one or several layers out as ONE step: the toast's Undo and the Lab's Ctrl/⌘+Z put them
    // all back where they were (the owner's typing in the selected one included). A chat deleting every layer leaves an
    // empty layer (a scene always has one), taken away again by the Undo. who: the AI that did it, for the toast.
    function removeLayers(ids, { who = null, quiet = false } = {}) { // (round 140, dropmedia140) quiet: an undo taking dropped layers away (no toast, no step of its own)
      if (!current) return null;
      const s = current;
      const gone = [...new Set(ids)].map((id) => layerById(id)).filter(Boolean);
      if (!gone.length) return null;
      persist(); // the code in the editor is in its layer (and comes back with it)
      const was = layersOf().slice();
      const keep = was.filter((L) => !gone.includes(L));
      const wasSel = selId;
      let blank = null;
      if (!keep.length) { blank = newLayer({ name: 'Empty layer', code: ThreeLayers.EMPTY_CODE }); keep.push(blank); }
      current.layers = keep;
      for (const L of gone) {
        controllers.get(L.id)?.destroy?.();
        controllers.delete(L.id);
        delete layerMods[L.id];
        box.send({ type: 'remove-layer', id: L.id, fade: true }); // its last picture fades out
        ranCode.delete(L.id);
      }
      box.send({ type: 'tweak-mods', mods: mergedMods() });
      if (blank) run({ hot: true, layer: blank.id });
      if (!layerById(selId)) { const at = was.indexOf(layerById(wasSel) || gone[0]); selectLayer(keep[Math.min(was.slice(0, Math.max(0, at)).filter((L) => keep.includes(L)).length, keep.length - 1)].id); }
      for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: layerProps(x) });
      touch();
      renderLayers();
      const label = gone.length === 1 ? `"${gone[0].name}"` : `${gone.length} layers`;
      let undone = false;
      const undo = () => {
        if (undone || current !== s) return false;
        undone = true;
        const drop = blank && blank.code === ThreeLayers.EMPTY_CODE && layerById(blank.id); // (still blank: nobody wrote in it)
        if (drop) { current.layers = layersOf().filter((L) => L !== blank); box.send({ type: 'remove-layer', id: blank.id }); controllers.get(blank.id)?.destroy?.(); controllers.delete(blank.id); }
        for (const L of gone) if (!layerById(L.id)) { const at = was.indexOf(L); current.layers.splice(was.slice(0, at).filter((x) => layerById(x.id)).length, 0, L); }
        touch();
        for (const L of gone) run({ hot: true, layer: L.id });
        if (gone.some((L) => L.id === wasSel) || !layerById(selId)) selectLayer(layerById(wasSel)?.id || gone[0].id);
        for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: layerProps(x) });
        renderLayers();
        return true;
      };
      if (!quiet) { // (round 140, dropmedia140)
        toast(`${who ? `${who} deleted` : 'Deleted'} ${label}`, { timeout: who ? 9000 : 4500, action: { label: 'Undo', fn: undo } });
        window.LabDirect?.push?.(null, `Deleted ${label}`, () => undo()); // the Lab's own Ctrl/⌘+Z
      }
      return { removed: gone.map((L) => L.name), ...(blank ? { left: `"${blank.name}" (a scene keeps one layer: a blank one to start from)` } : {}) };
    }
    function reorderLayers(idsBottomFirst) {
      const byId = new Map(layersOf().map((L) => [L.id, L]));
      const next = idsBottomFirst.map((i) => byId.get(i)).filter(Boolean);
      if (next.length !== layersOf().length) return;
      current.layers = next;
      next.forEach((L, z) => box.send({ type: 'layer-props', id: L.id, props: { z } }));
      touch();
      renderLayers();
    }
    // (round 44, layergroups) what the layer groups (tools/three-groups*.js) work with: the scene's layers as data, and
    // commit(next): the new order / visibility shown in place (no re-run), saved, noted for the time machine and recipes
    api.groupsHost = {
      sketchId: () => current?.id || null,
      sketchName: () => current?.name || '',
      layers: () => layersOf(),
      selected: () => selId,
      picked: () => layersPanel.picked?.() || [],
      clearPicks: () => layersPanel.clearPicks?.(),
      select: (id) => selectLayer(id),
      get panel() { return layersPanel.el; },
      commit(next) {
        if (!current) return;
        if (Array.isArray(next) && next !== current.layers) current.layers = next;
        layersOf().forEach((L, z) => box.send({ type: 'layer-props', id: L.id, props: layerProps(L, z) }));
        touch();
        renderLayers();
      },
      refresh: (want) => refreshInPlace(want),
      persist: () => persist(),
      // (round 136, outline136) a group faded / moved / keyed as one (tools/three-outline.js): each member's own values,
      // through the same path as its Layer settings (an animated value becomes a key at the playhead)
      edit: (id, patch, { live = false } = {}) => editLayer(id, patch, { live, direct: false }),
      value: (id, prop) => { const L = layerById(id); return L ? valueAt(L, prop) : null; },
      key(id, prop, v) { const L = layerById(id); if (!L) return false; if (!player.loaded) ensureTimeline(); if (!player.loaded) return false; setKeys(L, prop, upsertKey(keysOf(L, prop), player.time, v ?? valueAt(L, prop))); return true; },
      time: () => (player.loaded ? player.time : null),
      sliders: (id) => controllers.get(id)?.controls?.() || [],
      find: (q) => layersPanel.find?.(q),
    };

    // Sends (or drafts) a message to the Three Director docked next to the Lab.
    function askDirector(text, { send = true } = {}) {
      const agent = H.agents().find((a) => a.threeTools);
      // (round 92, labchat92) no agent with the Lab's tools: Claude gets it as a draft (its ▶ Apply puts code back here)
      if (!agent && window.LabChatLink && current) { LabChatLink.ask(text, { sceneId: current.id }); return; }
      if (!agent) { toast('Add an agent with Three.js tools first (the Three Director)', { type: 'error' }); return; }
      activate(agent.id);
      // (round 92) its open chat works on another scene: a chat for this one (before, that chat fixed its own scene)
      if (current) window.LabChatLink?.chatFor(agent.id, current.id);
      if (!send) { Native.setDraft(agent.id, text); return; }
      Native.send(agent.id, text).catch((err) => toast(err.message, { type: 'error' }));
    }
    // Music / video for audio-reactive sketches, and exact output sizes (tools/three-media.js).
    // Each sketch has its own song (and playback spot and frame size), kept in extras[id].media / .frame.
    const player = ThreeMedia.player({
      send: (msg) => box.send(msg),
      sketchName: () => current?.name,
      onPick: (path) => assignMedia(path),
      onLoaded: (o) => { if (o?.unloaded) assignMedia(null); else songTriggers(); if (o?.reload) box.send({ type: 'media-unload' }); if (o?.unloaded && !o.clock) songOut(o.from); renderLayers(); }, // the song you took out stops (no page reload); the scene's own timeline comes back
      // ✦ cue looks: each layer plays the look of the last cue (at or before the playhead) that set one for it
      onCue: ({ index, cues, playing }) => {
        for (const L of layersOf()) {
          const c = controllers.get(L.id);
          if (!c?.playLook) continue;
          if (window.ThreePerform?.holds?.(L.id)) continue; // (round 131, perform131) a look played live in ◉ Perform stays until its next switch
          let want = null;
          if (playing) for (let k = 0; k <= index; k += 1) { const l = cues[k].looks?.find((x) => x.layer === L.id || x.layer === L.name); if (l) want = l.name; }
          if (want) { if (c.playingLook !== want) c.playLook(want); } else c.endLook();
        }
      },
      lookChoices: () => layersOf().map((L) => ({ layer: L.id, layerName: L.name, names: ctlFor(L).looksApi.list() })),
      frame: { get: () => stage?.size, set: (id) => stage?.setMode(id) },
      onCueLookHere: (cue) => { const L = sel(); const c = L && ctlFor(L); if (!c) return null; c.looksApi.save(cue.name); toast(`"${cue.name}" plays these sliders from ${fmtMs(cue.t)} (while the song plays)`, { timeout: 2600 }); return { layer: L.id, name: cue.name }; },
    });
    // Every section cue gets its own look: a bold shuffle of the selected layer's sliders, saved and assigned
    // (your own values come back afterwards). Rough material to refine, for when you start from nothing.
    function looksForSections({ amount = 0.6 } = {}) {
      const L = sel(); const c = L && ctlFor(L);
      if (!c || !player.loaded) throw new Error('Load a song and open a sketch with sliders');
      if (!player.cues.length) player.autoSections();
      const keep = c.controls().reduce((o, x) => ({ ...o, [x.key]: x.value }), {});
      const add = [];
      for (const cue of player.cues) { c.shuffle({ amount }); c.looksApi.save(cue.name); add.push({ time: cue.time, name: cue.name, looks: [{ layer: L.id, name: cue.name }] }); }
      c.setMany(keep);
      player.editCues({ add });
      return add.length;
    }
    function assignMedia(path) {
      if (!current) return;
      if (path) songOnScene(path); // a song on a scene that had its own timeline: its cues come along
      (extras[current.id] ||= {}).media = path ? { path, time: 0 } : null;
      saveExtras();
    }
    function rememberMedia() {
      if (glp.phase) return; // (round 43, glrecover) nothing noted while the preview waits for the graphics card
      // the scene's own timeline: where its playhead is (no song)
      const tl = current && extras[current.id]?.timeline;
      if (tl && !extras[current.id].media && player.path === clockPath(current.id)) { const t = Math.round(player.time * 1000) / 1000; if (tl.time !== t) { tl.time = t; saveExtras(); } return; }
      if (!current || !extras[current.id]?.media || extras[current.id].media.path !== player.path) return;
      const t = Math.round(player.time * 1000) / 1000;
      if (extras[current.id].media.time === t) return; // paused: no rewrite of the kv file every 5 s
      extras[current.id].media.time = t;
      saveExtras();
    }
    // (round 39, powerwise) while Hearth is on screen (the background schedule; nothing to remember behind a minimized window)
    // (round 44, idlecpu) every 5 s while the song / timeline plays; paused, the place is noted at once and the timer
    // only looks every 30 s (it used to wake the window every 5 s to find the playhead where it was)
    let mediaPlaying = false;
    const mediaArm = (playing) => { mediaPlaying = playing; Power.every('lab-media', playing ? 5000 : 30000, rememberMedia, { hidden: 'skip', battery: false }); };
    if (window.Power) mediaArm(false); else setInterval(rememberMedia, 5000);
    // ---------- the scene's own timeline (round 10, orb) ----------
    // One clock per scene. A scene with a song plays on the song (as before); a scene without one plays on its own
    // timeline, extras[id].timeline = { len, fps, time }: the player's silent clock (tools/three-media.js loadClock),
    // so keyframes, slider keys, cues, the loop, Space and frame steps work with no song, and nothing reacts to music.
    // Loading a song on it keeps the keyframes at their seconds and brings its cues / markers along (✦ snap them to
    // bars, one click); taking the song out goes back to the scene's timeline. It travels with the scene: switching,
    // Duplicate, jams and Claude ⇄ Astra handoffs keep it, and its sequence (tools/three-seq.js) starts with it.
    const clockPath = (id) => `scene:${id}`;
    const lastKeyT = (sk) => { let m = 0; for (const L of materialize(sk)) for (const ks of Object.values(L.keys || {})) for (const k of ks || []) if (k.t > m) m = k.t; return m; };
    const fitLen = (sk) => Math.max(10, Math.ceil(lastKeyT(sk) - 1e-3));
    function timelineOf(id) {
      const ex = extras[id];
      if (ex?.timeline) return ex.timeline;
      // an older scene with keyframes and no song (they never played without one): it gets a timeline that holds them
      const sk = sketches.find((x) => x.id === id);
      if (!sk || ex?.media?.path || !(lastKeyT(sk) > 0)) return null;
      (extras[id] ||= {}).timeline = { len: fitLen(sk), fps: 30 };
      saveExtras();
      return extras[id].timeline;
    }
    const seqShowing = () => typeof ThreeSeq !== 'undefined' && ThreeSeq.active;
    // The Lab timeline of a scene: its song (as before), else its own timeline, else none.
    let sceneMediaTask = Promise.resolve();
    function sceneMedia(id, { playing = true } = {}) {
      const ex = extras[id] || {};
      const want = ex.media?.path || null;
      if (want) {
        if (want !== player.path) { player.unload({ silent: true }); sceneMediaTask=player.load(want, { startAt: ex.media.time || 0, quiet: true }); } else player.seek(ex.media.time || 0);
        return 'song';
      }
      const tl = timelineOf(id);
      if (tl) {
        if (player.path !== clockPath(id) || Math.abs((player.duration || 0) - tl.len) > 1e-3) { player.unload({ silent: true }); sceneMediaTask=player.loadClock({ key: id, seconds: tl.len, fps: tl.fps || 30, startAt: tl.time || 0, playing }); }
        return 'timeline';
      }
      if (player.loaded || player.path) player.unload({ silent: true });sceneMediaTask=Promise.resolve();
      return null;
    }
    function setTimeline(id, tl) {
      if (!sketches.some((x) => x.id === id)) return null;
      (extras[id] ||= {}).timeline = tl ? { len: Math.max(1, Math.min(600, Number(tl.len) || 10)), fps: Number(tl.fps) || 30, ...(tl.time ? { time: tl.time } : {}) } : null;
      if (!tl) delete extras[id].timeline;
      saveExtras();
      if (id === current?.id && !seqShowing()) sceneMedia(id);
      return extras[id].timeline || null;
    }
    // Something wants the timeline (keyframes, cues, a director's timeline edit) on a scene with no song and no
    // timeline yet: it gets its own, there and then (no "load a song first").
    function ensureTimeline() {
      if (!current || player.loaded || seqShowing()) return Boolean(player.loaded);
      setTimeline(current.id, { len: fitLen(current), fps: 30 });
      return Boolean(player.loaded);
    }
    // keyframes past the end of the scene's own timeline make it longer (never shorter)
    function fitClock() {
      if (!current || player.path !== clockPath(current.id)) return;
      const tl = extras[current.id]?.timeline;
      const last = lastKeyT(current);
      if (!tl || last <= tl.len + 1e-3) return;
      tl.len = Math.ceil(last);
      saveExtras();
      player.setClockLength(tl.len);
    }
    // (round 35, twocomputers) a song found again on this computer (another path): every scene using it follows
    player.on('relink', ({ from, to }) => { let n = 0; for (const id of Object.keys(extras)) if (extras[id]?.media?.path === from) { extras[id].media.path = to; n += 1; } if (n) saveExtras(); songFollows(from, to); });
    // (round 88, labsync88) the song's own ⚡ triggers and loop go with it to its new place (as its beat grid does: copyMap)
    function songFollows(from, to) {
      if (!from || !to || from === to) return;
      const by = store.get('three.triggersBySong', {}) || {}; let n = 0;
      if (by[from] && !by[to]) { store.set('three.triggersBySong', { ...by, [to]: by[from] }); n += 1; }
      const lp = store.get(`three.loop:${from}`, null); if (lp && !store.get(`three.loop:${to}`, null)) { store.set(`three.loop:${to}`, lp); n += 1; }
      if (n) window.LabPresets?.changed();
    }
    // (round 88, labsync88) a song loaded from outside Hearth's folder (Music, Downloads, another disk) stays on this
    // computer: the other one finds it only if it has the same file (round 35), else "Find this file". Hearth never copies
    // your music by itself. With sync on and another computer seen, the first time a song like that is on the timeline
    // you're offered, once, "Keep a copy with this scene so it plays on your other computer (its size)": one click copies
    // it into Hearth's references (refs/, which sync always brings down), and every scene using that song switches to the
    // copy (its beat grid, ⚡ triggers and loop come along). The original stays where it was. /song keep asks any time.
    const SONG_MAX = 400 * 1048576; // (as for references)
    async function songCopyInfo(path) {
      if (!path || /^scene:/.test(path) || player.isClock) return { why: 'no song' };
      const two = await window.hub.two?.info?.().catch(() => null);
      if (!two?.sync?.on) return { why: 'sync off' };
      const travels = SceneSafeCore.songTravels(path, two.roots);
      if (travels) return { why: travels === 'data' ? 'in Hearth' : 'in a cloud drive' };
      const st = await window.hub.fs.stat(path).catch(() => null);
      if (!st?.size) return { why: 'not here' };
      return { size: st.size, peers: (two.peers || []).length, big: st.size > SONG_MAX };
    }
    const songName = (p) => String(p).split(/[\\/]/).pop();
    async function keepSongCopy(path) {
      if (!path || player.path !== path) throw new Error('That song isn\'t on the timeline any more');
      const copy = await window.hub.importRef(path);
      const r = await player.follow(copy);
      if (r && r.ok === false) throw new Error('The copy was made, but the timeline couldn\'t switch to it');
      return copy;
    }
    const songAsked = () => { const l = store.get('three.songCopyAsked', []); return Array.isArray(l) ? l : []; };
    async function offerSongCopy(path, { ask = false } = {}) {
      if (!ask && songAsked().includes(path)) return null;
      const i = await songCopyInfo(path);
      if (player.path !== path) return null;
      if (!i.size) return ask ? (i.why === 'in Hearth' ? 'This song is in Hearth\'s folder already: it goes to your other computer by itself.' : i.why === 'in a cloud drive' ? 'This song is in your cloud drive: the drive brings it to your other computer.' : i.why === 'sync off' ? 'Sync is off: there is no other computer to bring it to.' : 'No song from a file on the timeline.') : null;
      if (!ask && !i.peers) return null;
      if (i.big) return ask ? `${songName(path)} is over 400 MB: too big to keep a copy with the scene.` : null;
      store.set('three.songCopyAsked', [path, ...songAsked().filter((x) => x !== path)].slice(0, 200));
      const label = `Keep a copy with this scene so it plays on your other computer (${fmtBytes(i.size)})`;
      const done = (copy) => toast(`A copy of ${songName(path)} is kept with your scenes (${fmtBytes(i.size)}) and goes to your other computer. The original stays where it was.`, { timeout: 7000, action: { label: 'Undo', fn: () => player.follow(path).then(() => window.hub.fs.trash([copy]).catch(() => {})) /* (round 97, labproj97: a list) */.catch((err) => toast(err.message, { type: 'error' })) } });
      const go = () => keepSongCopy(path).then(done).catch((err) => toast(err.message, { type: 'error' }));
      if (ask) { if (await Modal.confirm('Keep a copy with this scene?', `${songName(path)} is on this computer only. A copy (${fmtBytes(i.size)}) goes into Hearth's folder and syncs to your other computer, so the scene plays there too. The original stays where it is.`, { ok: 'Keep a copy' })) { await go(); return null; } return 'Nothing copied.'; }
      toast(`${songName(path)} is on this computer only: your other computer won't have it.`, { timeout: 20000, action: { label, fn: go } });
      return label;
    }
    player.on('load', ({ path, clock }) => { if (!clock && path) setTimeout(() => { if (player.path === path) offerSongCopy(path).catch(() => {}); }, 2500); });
    player.on('clock-length', (n) => { if (current && extras[current.id]?.timeline) { extras[current.id].timeline.len = n; saveExtras(); } });
    // A song loaded on a scene that played on its own timeline: its cues and markers come along at the same seconds
    // (keyframes are in seconds on the layers already), and once the song's bars are known one click snaps them.
    let carried = null; // { to: song path, sketch }
    function songOnScene(path) {
      if (!current || !path || player.path !== clockPath(current.id)) return;
      player.carry(player.path, path);
      carried = { to: path, sketch: current.id };
    }
    player.on('analysis', () => {
      const c = carried;
      if (!c || c.to !== player.path || c.sketch !== current?.id) return;
      carried = null;
      const keys = layersOf().reduce((n, L) => n + Object.values(L.keys || {}).reduce((m, ks) => m + (ks?.length || 0), 0), 0);
      const cues = player.cues.length;
      if (!keys && !cues) return;
      toast(`The scene's ${keys ? `${keys} keyframe${keys === 1 ? '' : 's'}` : ''}${keys && cues ? ' and ' : ''}${cues ? `${cues} cue${cues === 1 ? '' : 's'}` : ''} stay at their seconds on the song`, { timeout: 9000, action: { label: '✦ Snap them to bars', fn: () => { const r = snapToBars(); toast(r ? `${r.keys} keyframes and ${r.cues} cues on the song's ${r.unit}s` : 'No bars found on this song', { timeout: 5000, ...(r ? { action: { label: 'Undo', fn: r.undo } } : {}) }); } } });
    });
    // every keyframe and cue to the nearest bar line (to the nearest beat for a setting whose keys would land on the
    // same bar); returns { keys, cues, unit, undo } or null without a grid
    function snapToBars() {
      const g = player.timeline().grid;
      if (!g?.bpm || !player.loaded || player.isClock) return null;
      const beat = 60 / g.bpm; const bar = beat * (g.beatsPerBar || 4); const a0 = g.downbeat ?? 0;
      const at = (t, step) => Math.max(0, Math.round((a0 + Math.round((t - a0) / step) * step) * 1000) / 1000);
      const before = layersOf().map((L) => [L.id, JSON.parse(JSON.stringify(L.keys || {}))]);
      let nk = 0; let unit = 'bar';
      for (const L of layersOf()) {
        for (const [prop, ks] of Object.entries(L.keys || {})) {
          if (!ks?.length) continue;
          let ts = ks.map((k) => at(k.t, bar));
          if (new Set(ts).size < ts.length) { ts = ks.map((k) => at(k.t, beat)); unit = 'beat'; }
          if (new Set(ts).size < ts.length) continue; // too close for either: left alone
          L.keys[prop] = ks.map((k, i) => ({ ...k, t: ts[i] })).sort((p, q) => p.t - q.t);
          nk += ks.length;
        }
        sendKeys(L);
      }
      const cues = player.cues;
      const moved = cues.map((c) => ({ ...c, to: at(c.time, bar) })).filter((c) => Math.abs(c.to - c.time) > 1e-3);
      if (moved.length) player.editCues({ remove: moved.map((c) => c.time), add: moved.map((c) => ({ time: c.to, name: c.name, looks: c.looks })) });
      touch(); renderTracksOnly(); syncKeyUI(true);
      return {
        keys: nk, cues: cues.length, unit,
        undo: () => { for (const [id, k] of before) { const L = layerById(id); if (L) { L.keys = k; sendKeys(L); } } if (moved.length) player.undo?.(); touch(); renderTracksOnly(); syncKeyUI(true); },
      };
    }
    // The song taken out (×): the scene goes back to its own timeline (when it had one or has keyframes), with the
    // song's cues and markers, so nothing placed on the song is lost.
    function songOut(from) {
      if (!current || seqShowing()) return;
      const id = current.id;
      if (!extras[id]?.timeline && !(lastKeyT(current) > 0)) return;
      if (from) player.carry(from, clockPath(id));
      if (!extras[id]?.timeline) (extras[id] ||= {}).timeline = { len: fitLen(current), fps: 30 };
      saveExtras();
      sceneMedia(id, { playing: false });
    }
    addEventListener('beforeunload', () => { rememberMedia(); if (extrasLoaded && kvOk.has('three-lab-extras')) window.hub.kvSet('three-lab-extras', extras); });
    split = el('div', { class: 'three-split' }, editorHost, el('div', { class: 'three-right' }, previewHost, player.el, consoleWrap), column);
    previewHost.append(presentHint, presentHud, blackout, editPanel, stageNote);
    function setCodeVisible(show) {
      split.classList.toggle('no-code', !show);
      for (const n of [snippetSel, version, liveLabel]) n.hidden = !show; // code tools only matter with the code shown
      codeBtn.classList.toggle('on', show);
      store.set('three.showCode', show);
      consolePeek = null;
      syncConsole();
    }
    function setSlidersVisible(show) {
      const was = !column.hidden;
      column.hidden = !show;
      for (const c of controllers.values()) c.setVisible(show);
      split.classList.toggle('with-tweaks', show);
      slidersBtn.classList.toggle('on', show);
      store.set('three.showSliders', show);
      if (show && !was && current) run({ sync: true }); // sliders need the instrumented run (each layer re-runs in place)
    }
    setCodeVisible(store.get('three.showCode', false));
    column.hidden = true;
    setSlidersVisible(store.get('three.showSliders', true));
    pane.append(toolbar, split);
    let stage = null;
    const box = sandboxFrame(previewHost, 'sketch', onMessage, () => stage?.params || '', { lazy: true, pretty: true, name: 'preview' });
    previewHost.append(buildPill);
    box.onStageClosed = () => { dispatchEvent(new Event('hearth:stage-closed')); stageBtn.classList.remove('on'); stageNote.hidden = true; previewHost.classList.remove('on-stage'); run(); };
    queueMicrotask(() => { stage?.pill?.prepend(freezeBtn, compareBtn); stage?.pill?.append(stillBtn, previewMoreBtn); });
    stage = ThreeMedia.stage(previewHost, box.frame, { onChange: ({ id, reload }) => {
      // (the Lab sequence on screen: the swap is the sequence's shape, not the scene's own frame size: seqguard)
      const seqOn = typeof ThreeSeq !== 'undefined' && ThreeSeq.active;
      if (current && !seqOn) { (extras[current.id] ||= {}).frame = id; saveExtras(); }
      if (current && !seqOn) window.LabRecipesHook?.note?.('frame', { id, w: stage?.size?.width, h: stage?.size?.height }); // (round 39, labrecipes)
      if (seqOn) ThreeSeq.sizeChanged?.(id);
      if (reload && current) run();
    } });
    {
      const seg = stage.pill.querySelector('.stage-seg');
      seg.addEventListener('wheel', (e) => { e.preventDefault(); const o = stage.pillOrder; const i = o.indexOf(stage.size.id); stage.setMode(o[(Math.max(0, i) + (e.deltaY > 0 ? 1 : -1) + o.length) % o.length]); }, { passive: false });
      seg.querySelectorAll('.stage-btn').forEach((b, k) => b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = stage.pillOrder[k];
        if (id === 'fit') return;
        ThreeTweaks.menu(e.clientX, e.clientY, [`${id} · ${ThreeMedia.SIZES.find((z) => z.id === id).title}`, ['📷 Still at this size', 'Then back to the size you had', () => still({ size: id })], ['⏺ Record at this size…', 'Switches, then the record menu', () => { stage.setMode(id); setTimeout(() => player.recordMenu(), 300); }], ['🖥 Stage window at this size', 'A real-size canvas in its own window', () => { stage.setMode(id); setTimeout(() => setStage(true), 200); }], ['Safe zones', 'On / off', () => stage.setSafe()]]);
      }));
    }
    // Drop an mp3/mp4 on the preview to load it.
    previewHost.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); previewHost.classList.add('drop-on'); } });
    previewHost.addEventListener('dragleave', () => previewHost.classList.remove('drop-on'));
    // (round 28) files dragged into the window: the preview's page lets them through to this drop (it used to swallow them)
    addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) previewHost.classList.add('drag-files'); });
    for (const ev of ['drop', 'dragend']) addEventListener(ev, () => previewHost.classList.remove('drag-files'), true);
    addEventListener('dragleave', (e) => { if (!e.relatedTarget) previewHost.classList.remove('drag-files'); });
    previewHost.addEventListener('drop', (e) => {
      previewHost.classList.remove('drop-on');
      const f = [...e.dataTransfer.files].find((x) => ThreeMedia.isMedia(x.name));
      // (round 28) a picture: "Match this look" (tools/three-lookmatch.js)
      const pic = !f && typeof LookMatch !== 'undefined' ? [...e.dataTransfer.files].find((x) => /^image\//.test(x.type)) : null;
      if (pic) { e.preventDefault(); LookMatch.offerDrop(pic, e.clientX, e.clientY); return; }
      if (!f) return;
      e.preventDefault();
      const p = window.hub.pathForFile(f);
      assignMedia(p);
      player.load(p);
    });
    // Space plays / pauses; K S H tap hits in; [ ] set loop points; arrows nudge; Delete removes a marker.
    pane.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); restartSim(); }
      // Ctrl+S: save the selected layer's sliders into its code · Ctrl+Shift+S: save them as a look
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); const c = sel() && ctlFor(sel()); if (e.shiftKey) c?.saveLook(); else { c?.save(); toast('Sliders saved into the code', { timeout: 1200 }); } return; }
      const typingNow = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (!typingNow && !e.ctrlKey && !e.altKey) {
        if (e.key === '\\') { e.preventDefault(); e.stopPropagation(); setFreeze(!frozenNow); return; }
        if (e.key === '.' && frozenNow) { e.preventDefault(); e.stopPropagation(); box.send({ type: 'step' }); return; }
        if (e.key === '?') { e.preventDefault(); e.stopPropagation(); labKeys(); return; }
      }
      if (e.altKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
        const L = [...layersOf()].reverse()[Number(e.code.slice(5)) - 1];
        if (!L) return;
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) setSolo(soloNow() === L.id ? null : L.id);
        else editLayer(L.id, { visible: L.visible === false });
        Usage.key(`Alt+${e.shiftKey ? 'Shift+' : ''}digit`, 'Lab layers');
      }
    }, true);
    // Ctrl+R (reload) while the Lab shows: restart the simulation from scratch instead
    api.actions = {
      restart: () => restartSim(), freeze: () => setFreeze(!frozenNow), keys: () => labKeys(),
      triggers: () => toggleTriggers(true),
      writeTriggers: () => { toggleTriggers(true); setTimeout(() => trigPanel?.el.querySelector('button[title^="Write"]')?.click(), 60); },
      liveSystem: () => setLive('system'), liveOff: () => setLive(null), nowPlaying: () => (np ? stopNowPlaying() : startNowPlaying()),
      present: () => togglePresent(), stage: () => setStage(!box.onStage), code: () => setCodeVisible(split.classList.contains('no-code')),
      music: () => player.pick(), shot: () => box.send({ type: 'screenshot' }), copyShot: () => { copyNextShot = true; box.send({ type: 'screenshot' }); },
      sheet: () => showSheet(), newSketch: () => templateGallery(), allControls: () => player.toggleAllControls(), mute: () => player.toggleMute(),
      saveSliders: () => { const c = sel() && ctlFor(sel()); c?.save(); }, saveLook: () => { const c = sel() && ctlFor(sel()); c?.saveLook(); },
      guides: () => cycleGuides(), loopBar: () => player.loopBar(), snap: () => player.cycleSnap(), quantize: () => player.quantize(), dedupe: () => player.dedupe(),
      cycleLooks: () => setLookCycle(lookCycle ? 0 : 4), copyCode: () => { navigator.clipboard.writeText(layersOf().map((L) => `// ===== ${L.name} =====\n${L.code}`).join('\n\n')); toast('Code copied', { timeout: 1200 }); },
      shuffle: () => selCtl()?.shuffle(), shuffleBack: () => selCtl()?.shuffleStep(-1), slotA: () => selCtl()?.slotRecall('A'), slotB: () => selCtl()?.slotRecall('B'), slotC: () => selCtl()?.slotRecall('C'),
      storeA: () => selCtl()?.slotSave('A'), storeB: () => selCtl()?.slotSave('B'), quickLook: () => selCtl()?.quickLook(), nextLook: () => selCtl()?.lookStep(1),
      freezeBeat: () => freezeOn('beat'), pin: () => pinFrame(), compareOff: () => setCompare('off'), still: () => still(), safe: () => stage.setSafe(),
      live: () => setLive(liveKind ? null : store.get('three.lastLive', 'system')), autoBars: () => autoBars(), sections: () => player.autoSections(), clickTrack: () => player.setGridView({ click: !player.gridView.click }),
      quantizeTaps: () => player.setQuantize(!player.quantize), size916: () => stage.setMode('9:16'), size169: () => stage.setMode('16:9'), size45: () => stage.setMode('4:5'), size11: () => stage.setMode('1:1'), sizeFit: () => stage.setMode('fit'),
      nextSketch: () => stepSketch(1), prevSketch: () => stepSketch(-1), tools: () => toolsDrawer(document.querySelector('.lab-tools-btn')),
      stageUi: () => window.LabHudStage?.togglePin(), stageShow: () => window.LabHudStage?.pin(true), stageClean: () => window.LabHudStage?.pin(false), // (round 150, stage150) the preview's controls pinned / a clean stage (I)
      stageTop: async () => { const on = await window.hub.stageOnTop?.(); toast(on == null ? 'Open the Stage window first' : on ? 'Stage window stays on top' : 'Stage window: normal', { timeout: 1500 }); },
    };
    api.onScreen = () => Boolean(box.onStage || previewHost.offsetParent); // (the Lab's picture is on screen)
    api.restartVisible = () => { if (window.ThreeStage?.guard?.('restart')) return true; if (!box.onStage && !previewHost.offsetParent) return false; restartSim(); return true; };
    // (round 22, labstage) what the live / VJ stage (tools/three-stage*.js) drives: the preview, freeze, output window,
    // Light mode, frame rate, the sliders of the scene on screen
    api.stageHooks = {
      get box() { return box; }, get host() { return previewHost; }, get pane() { return pane; }, get player() { return player; },
      get params() { return stage?.params || ''; }, get frameRect() { return box.frame.getBoundingClientRect(); }, get size() { return stage?.size || null; },
      get onStage() { return box.onStage; }, setStage: (on) => { if (on !== box.onStage) setStage(on); else if (on) setStage(true); },
      get frozen() { return frozenNow; }, setFreeze: (on) => setFreeze(on),
      get light() { return lightOn; }, setLight: (on) => (on !== lightOn ? setLight(on) : lightOn),
      get fps() { return fpsPref(); }, setFps: (v) => { fpsSel.value = String(v); fpsSel.dispatchEvent(new Event('change')); },
      ctl: () => selCtl(), layer: () => sel() || null, layerById: (id) => layerById(id), ctlOf: (id) => { const L = layerById(id); return L ? ctlFor(L) : null; },
      lkOpen: (key) => lkOpen(key), lkPanel: () => layersPanel, // (round 142, panel142) the Layers & knobs panel at a place: 'favs', 'dials' or the selected layer
      sketchId: () => current?.id || null, sketchName: () => current?.name || '', blackout: (on) => setBlackout(on),
      // (round 37, abcompare) a palette on the preview for a moment, not saved (null: the scene's own again)
      // (round 130, songmap130) ✦ Map to the song (tools/three-songmap.js): a layer's keys as they are, and put back exactly
      layers: () => layersOf().map((L) => ({ id: L.id, name: L.name })), // (round 131, perform131) ◉ Perform: each layer's cue looks
      keysOf: (id, prop) => { const L = layerById(id); return L?.keys?.[prop] ? JSON.parse(JSON.stringify(L.keys[prop])) : []; },
      setKeys: (id, prop, keys) => { const L = layerById(id); if (!L) return false; setKeys(L, prop, JSON.parse(JSON.stringify(keys || []))); return true; },
      // (round 133, lyrics133) 🎤 the scene's lyrics (tools/three-lyrics.js): { kind, lines: [[a, b, "text", [w…]]…] }, saved with the scene
      lyrics: () => (current?.lyrics ? JSON.parse(JSON.stringify(current.lyrics)) : null),
      setLyrics: (v) => { if (!current) return false; if (v) current.lyrics = JSON.parse(JSON.stringify(v)); else delete current.lyrics; current.updatedAt = Date.now(); save(); return true; },
      // (round 135, mooddial135) 🎛 the scene's mood dials (tools/three-dials.js): { v, sel, list: [{ id, name, value, maps, keys, follow }] }, saved with the scene
      dials: () => (current?.dials ? JSON.parse(JSON.stringify(current.dials)) : null),
      setDials: (v) => { if (!current) return false; if (v?.list?.length) current.dials = JSON.parse(JSON.stringify(v)); else delete current.dials; current.updatedAt = Date.now(); save(); paintSecs(); return true; }, // (round 142, panel142) paintSecs: the section's count
      // (round 138, favs138) ★ the scene's favourite controls (tools/three-favs.js), saved with the scene; a slider's ◆ for the panel
      favs: () => (current?.favs ? JSON.parse(JSON.stringify(current.favs)) : null),
      setFavs: (v) => { if (!current) return false; if (v?.list?.length) current.favs = JSON.parse(JSON.stringify(v)); else delete current.favs; current.updatedAt = Date.now(); save(); paintSecs(); return true; }, // (round 142, panel142) paintSecs: the section's count
      lastSlider: () => lastTouched, // (round 141, cmdbar141) the command bar's "follow bass"
      keyState: (id, prop) => { const L = layerById(id); return L ? keyStateFor(L, prop) : 'none'; }, toggleKey: (id, prop, value) => toggleKeyFor(id, prop, value),
      // (round 140, dropmedia140) media dropped on the timeline (tools/three-dropmedia.js): its layers added at once, with
      // their times, fades, colour and group ([{ name, code, props }] at index, bottom = 0), and taken away again by its undo
      addLayers: (list, index = null) => { const ids = []; let at = index; for (const o of list || []) { const L = addLayer('code', { code: o.code, name: uniqueName(o.name || 'Dropped'), index: at, props: o.props || {} }); if (!L) continue; ids.push(L.id); if (at != null) at += 1; } return ids; },
      dropUndo: (ids) => Boolean(removeLayers(ids, { quiet: true })),
      peekPalette: (cols) => { if (!current) return; const was = current.palette; if (Array.isArray(cols)) current.palette = cols; try { sendRefs(); } finally { if (was) current.palette = was; else delete current.palette; } },
    };
    // ---------- everything the chat commands drive (tools/three-cmds.js); each returns a short result ----------
    const ctl = () => { const c = selCtl(); if (!c) throw new Error('No sketch is open'); if (!c.visible) setSlidersVisible(true); return c; };
    // the scene's timeline: its song, else its own (made there and then when it has none yet: no "load a song first")
    const needSong = () => { if (!player.loaded) ensureTimeline(); if (!player.loaded) throw new Error('Load a song first (🎵 in the timeline, or drop one on the preview)'); };
    api.cmd = {
      get player() { return player; }, // the song / video timeline (tools/three-cmds.js: /song-trim, /cut-loop)
      // (round 21: frame and song are read when asked for: frame measures the preview in "fit" (a layout right after a
      // switch) and song walks the whole analysis, for readers that only want the name, e.g. speed-resume.js on a switch)
      get state() { return { view: typeof ThreeGestures !== 'undefined' ? ThreeGestures.seq() : 0, sketch: current?.name, layer: sel()?.name, get frame() { return stage.size; }, frozen: frozenNow, live: liveKind, get song() { return player.loaded ? player.info().file : null; }, bpm: player.loaded ? player.bpm : liveBpm?.bpm ?? null, playing: player.playing, presenting: document.fullscreenElement === previewHost, stage: window.LabHudStage?.pinned ? 'pinned' : 'auto' }; },
      run: () => run(), restart: () => restartSim(),
      // a sketch that has a song is still loading it (just opened): wait for it a moment
      waitSong: async () => { for (let i = 0; i < 40 && current && extras[current.id]?.media?.path && !player.loaded; i += 1) await sleep(100); },
      // sliders
      save: () => { const c = ctl(); const n = c.dirty(); c.save(); return n; },
      saveLook: (name) => (name ? ctl().looksApi.save(name) && name : ctl().quickLook()),
      look: (name) => ctl().looksApi.apply(name), looks: () => ctl().looksApi.list(), deleteLook: (name) => ctl().looksApi.remove(name),
      lookStep: (d) => ctl().lookStep(d), morphLook: (name, ms) => ctl().morphLook(name, ms),
      shuffle: (o) => ctl().shuffle(o), shuffleStep: (d) => ctl().shuffleStep(d), tame: (k) => ctl().tame(k), paletteColors: () => ctl().paletteColors(), tweakCode: () => ctl().tweakCode(), saveOne: (q) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); c.saveOne(hit.key); return hit; },
      freezeOn: (unit) => freezeOn(unit), stepSketch: (d) => { stepSketch(d); return current?.name; },
      blackout: (on) => setBlackout(on), framesToDirector: (w) => framesToDirector(w), stills: (kind) => stillsAt(kind), fixErrors: () => fixErrors(), looksForSections: (o) => looksForSections(o),
      recordSpan: (o) => { needSong(); return player.recordSpan(o); }, autoMorph: (bars) => ctl().autoMorph(bars), swapSlots: () => ctl().swapSlots(), shuffleInfo: () => ctl().shuffleInfo, setShuffle: (o) => ctl().setShuffle(o),
      groups: () => ctl().groups(), showGroup: (g) => ctl().showGroup(g), find: (q) => ctl().find(q),
      slot: (n, action = 'recall') => { const c = ctl(); if (action === 'save') return c.slotSave(n); if (action === 'clear') return c.slotClear(n); return c.slotRecall(n); }, slots: () => ctl().slots,
      morph: (t, pair) => ctl().morph(t, pair),
      resetSliders: () => ctl().reset(), undoSliders: () => ctl().undo(),
      copySliders: () => ctl().copyValues(), pasteSliders: (text) => ctl().pasteValues(text),
      resolve: (q) => ctl().resolve(q),
      setSlider: (q, v) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(`No slider "${q}". Sliders: ${c.controls().map((x) => x.label).join(', ') || 'none'}`); const done = c.setMany({ [hit.key]: v }); return done.length ? hit : null; },
      knob: (q, u) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); return { ...hit, value: c.setNormalized(hit.key, u, { release: true }) }; },
      lock: (q, on) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); c.lock(hit.key, on); return hit; },
      fav: (q, on) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); c.fav(hit.key, on); return hit; },
      motion: (q, mo) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); if (!c.setMotion(hit.key, mo)) throw new Error(`"${hit.label}" isn't a number slider`); return hit; },
      follow: (q, band, amount) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); if (!c.bind(hit.key, band, amount)) throw new Error(`"${hit.label}" isn't a number slider`); return hit; },
      learn: (q) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); midiInit().then((ok) => { if (ok) { midiLearn = { stage: 'control', layer: sel().id, key: hit.key, label: hit.label }; toast(`Turn a knob for "${hit.label}"`, { timeout: 4000 }); } }); return hit; },
      sliders: () => ctl().controls(),
      searchSliders: () => { lkOpen(); selCtl()?.focusSearch(); },
      // preview
      customSize: (w, h) => stage.setCustom(w, h),
      size: (id) => { if (!ThreeMedia.SIZES.some((z) => z.id === id)) throw new Error(`Sizes: ${ThreeMedia.SIZES.map((z) => z.id).join(', ')}`); stage.setMode(id); return stage.size; },
      freeze: (on) => { setFreeze(on ?? !frozenNow); return frozenNow; }, step: () => { if (!frozenNow) setFreeze(true); box.send({ type: 'step' }); },
      compare: (mode) => (mode === 'pin' ? pinFrame() : setCompare(mode)),
      still: (o) => still(o || {}), safe: (on, plat) => stage.setSafe(on, plat), guides: () => { cycleGuides(); return guides || 'off'; },
      present: (mode) => togglePresent(typeof mode === 'string' ? mode : null), focus: () => setFocus(!focusOn), stage: () => setStage(!box.onStage),
      fps: (v) => { fpsSel.value = String(v); fpsSel.dispatchEvent(new Event('change')); return v; },
      // round 16 "labperf": the numbers (/lab perf), the HUD, Light mode
      // (kept out of lastStats: the director's reports stay as short as they were)
      perf: () => ({ ...(lastStats || {}), ...(lastStatsMsg?.p50 != null ? { frameMsP50: lastStatsMsg.p50, frameMsP95: lastStatsMsg.p95, drawCallsAll: lastStatsMsg.callsAll, gpuMB: lastStatsMsg.gpuMB, quality: lastStatsMsg.quality, fpsCap: lastStatsMsg.cap || 'screen', saved: lastStatsMsg.note } : {}), parked: parkedNow, focused: winFocused, fpsSetting: (FPS_OPTS.find(([v]) => v === String(fpsPref())) || FPS_OPTS[0])[1], light: lightOn, hud: perfHudOn, adapt: { on: adaptOn, ...(adaptLast || {}), note: !adaptNote.hidden }, pace: { readout: paceOn, text: paceText(paceLast), battery: onBattery, ...(paceLast || {}) }, line: perfLine(lastStatsMsg) }),
      pace: (on) => (on == null ? paceOn : setPaceOn(on)), // (round 33 "labpace") the Frame pace readout
      adapt: (on) => (on == null ? adaptOn : setAdaptOn(on)),
      perfHud: (on) => setPerfHud(on ?? !perfHudOn), light: (on) => (on == null || on !== lightOn ? setLight(on ?? !lightOn) : lightOn),
      // view
      code: (on) => setCodeVisible(on ?? split.classList.contains('no-code')), panel: (on) => setSlidersVisible(on ?? column.hidden),
      console: (what) => { if (what === 'clear') { consoleBox.replaceChildren(); consoleLines = []; return 'cleared'; } if (what === 'copy') { const t = consoleLines.map((l) => `${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n'); navigator.clipboard.writeText(t); return t; } consolePeek = what === 'show' ? true : what === 'hide' ? false : !consoleShown(); syncConsole(); return consoleLines.slice(-12); },
      edit: (on) => setEdit(on ?? !editOn), keys: () => labKeys(),
      // sketches
      sketches: () => [...sketches].sort((a, b) => b.updatedAt - a.updatedAt).map((x) => ({ id: x.id, name: x.name, layers: x.layers?.length || 1, current: x.id === current?.id })),
      openSketch: (q) => { const n = String(q || '').toLowerCase(); const hit = sketches.find((x) => x.name.toLowerCase() === n) || sketches.find((x) => x.name.toLowerCase().includes(n)); if (!hit) return null; if (hit.id !== current?.id) openSketch(hit.id); return hit.name; },
      browse: () => browseSketches(), newSketch: (tpl) => { if (!tpl) { templateGallery(); return null; } const t = ThreeData.TEMPLATES.find((x) => x.name.toLowerCase().includes(String(tpl).toLowerCase())); if (!t) return null; create(t.name, t.code); return t.name; },
      templates: () => ThreeData.TEMPLATES.map((t) => t.name), duplicate: () => duplicate(), rename: (n) => { if (!current || !n) return null; current.name = n; save(); renderPicker(); return n; },
      // layers
      layers: () => layersOf().map((L) => ({ name: L.name, mask: L.mask || null, visible: L.visible !== false, selected: L.id === selId })).reverse(),
      selectLayer: (q) => { const L = findLayer(q); if (!L) return null; selectLayer(L.id); return L.name; },
      showLayer: (q, on) => { const L = findLayer(q); if (!L) return null; editLayer(L.id, { visible: on ?? L.visible === false }); return L.name; },
      solo: (q) => { const L = q ? findLayer(q) : null; setSolo(L && soloNow() !== L.id ? L.id : null); return L?.name || null; },
      // music
      live: async (kind) => { if (kind === 'off') { await setLive(null); return 'off'; } await setLive(kind || (liveKind ? null : store.get('three.lastLive', 'system'))); return liveKind || 'off'; },
      liveIo: (patch) => (patch ? setLiveIo(patch) : liveIo()),
      tap: () => player.tap(), tapOne: () => { needSong(); return player.tapOne(); },
      bpm: (v) => { needSong(); if (v === 'auto') { player.clearGrid(); return player.bpm; } if (v === 'x2' || v === 'double') return player.scaleBpm(2); if (v === 'half') return player.scaleBpm(0.5); if (v === 'one') { player.oneHere(); return player.bpm; } if (!player.setBpm(Number(v))) throw new Error('A tempo between 20 and 400'); return player.bpm; },
      nudgeGrid: (ms) => { needSong(); return player.nudgeGrid(ms); },
      marker: (lane) => { needSong(); player.tapLane(lane); return lane; },
      fill: (kind) => { needSong(); return player.fill(kind); }, clearMarks: (lane) => { needSong(); return player.clearMarks(lane); },
      quantize: (on) => player.setQuantize(on ?? !player.quantize), snap: (m) => { if (!player.setSnap(m)) throw new Error(`Snap: ${player.snaps.join(', ')}`); return m; },
      loop: (a, b) => { needSong(); if (a == null) { player.setLoop(null); return null; } if (!player.setLoop(a, b)) throw new Error('The loop is locked'); player.setLoopOn(true); return player.loop; },
      loopBar: () => { needSong(); player.loopBar(); return player.loop; },
      loopBars: (n) => { needSong(); return player.loopBars(n); },
      sections: () => { needSong(); return player.autoSections(); }, cue: (name) => { needSong(); return player.addCue(player.time, name || undefined); },
      cues: () => player.cues, jumpCue: (d) => { needSong(); player.jumpCue(d); return player.time; },
      gridView: (patch) => player.setGridView(patch || {}),
      play: (on) => { needSong(); player.toggle(on); }, seek: (t) => { needSong(); player.seek(t); return player.time; }, speed: (r) => { player.setRate(r); return player.rate; },
      mute: () => player.toggleMute(), music: () => player.pick(),
      loadSong: async (path) => { songOnScene(path); const r = await player.load(path); if (r.ok) assignMedia(path); return r; }, zoom: (a, b) => player.setView(a, b),
      record: (kind, o) => player.record(kind, o),
      async recordClip(o) {
        if (typeof ThreeSeq !== 'undefined' && ThreeSeq.rendering) throw Error('Finish the scene render first.');
        const scene = current?.id, resume = player.loaded && !player.playing, time = player.time, frozen = frozenNow;
        const take = player.recordClip(o); syncPark(true);
        try {
          if (frozen) setFreeze(false);
          if (resume) player.toggle(true);
          return await take;
        } finally {
          // A paused music-driven animation otherwise records its empty opening frame for the whole take.
          // Restore only this scene: switching projects must never seek or pause the new one.
          if (current?.id === scene) {
            if (resume) { player.toggle(false); player.seek(time); }
            if (frozen) setFreeze(true);
          }
          syncPark(true);
        }
      },
      get recording() { return player.recording; },
      trigPreset: (name) => applyTrigPreset(name), trigPresets: () => [...Object.keys(trigPresets()), ...store.get('three.trigPresets', []).map((x) => x.name)],
      autoBars: () => autoBars(), triggers: (on) => toggleTriggers(on ?? !trigPanel),
      // assets
      palette: (text) => { if (!text) return current?.palette || []; const cols = parseColors(text); if (cols.length < 2) throw new Error('No colors found: give a coolors.co link or hex codes'); setPalette(cols); return cols; },
      recolor: () => recolor(), refs: () => openRefs(), note: (text) => takeNote(text ? { text } : {}), sheet: () => showSheet(),
      tools: (id) => { tabs?.show(id || "sketch"); return id || "sketch"; },
    };
    if (typeof ThreeMusic !== 'undefined') {
      ThreeMusic.attach({
        player, selCtl, layers: () => layersOf().map((L) => ({ id: L.id, name: L.name, ctl: ctlFor(L) })), selectedLayer: () => sel()?.id,
        triggers: { apply: (n, o) => applyTrigPreset(n, o), names: () => Object.keys(trigPresets()), songHasOwn: () => Boolean(player.path && store.get('three.triggersBySong', {})[player.path]), button: trigPresetBtn, cfg: () => trigCfg, restore: (c) => { trigCfg = ThreeTriggers.merge(c); trigTuned = true; sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg); } },
        live: { kind: () => liveKind, bpm: () => liveBpm, io: () => liveIo(), setIo: (p) => setLiveIo(p), button: liveBtn, autoGain: () => (hubLive.gain ? hubLive.auto : null) },
      });
    }
    // (round 23, labaudio) audio features: the live worklet, whole-song features, the preview's requests (tools/three-audio.js)
    if (typeof ThreeAudio !== 'undefined') ThreeAudio.attach({ player, send: (m) => box.send(m), selCtl, layers: () => layersOf().map((L) => ({ id: L.id, name: L.name, ctl: ctlFor(L) })), live: { kind: () => liveKind, io: () => liveIo(), setIo: (p) => setLiveIo(p), start: (k) => setLive(k) } });
    // (round 25, motion) the camera as a live input: frames to the preview, its tracking, the ● Camera pill (tools/three-motion-in.js)
    if (typeof LabMotionIn !== 'undefined') LabMotionIn.attach({ send: (m) => box.send(m), frame: () => box.frame, onStage: () => box.onStage, ready: () => box.ready, host: previewHost });
    // video footage on the timeline: exact frames, the cut list the sketch plays (tools/three-frames.js)
    if (typeof ThreeFrames !== 'undefined') ThreeFrames.attach({ player, send: (msg) => box.send(msg), sketchId: () => current?.id });
    // the Lab's Sequence: the timeline as a video timeline of scenes, footage, titles and the song (tools/three-seq.js)
    if (typeof ThreeSeq !== 'undefined') ThreeSeq.attach({ player, bar: player.el, pane, send: (msg) => box.send(msg), sketchId: () => current?.id, rerun: () => run(), reloadPage: () => box.reload(true), pageReady: () => box.ready, director: () => api.director, get stage() { return stage; }, get scenes() { return api.scenes; } });
    // precomps (tools/three-comp.js): other scenes as layers of this one, kept live in the preview
    if (typeof ThreeComp !== 'undefined') ThreeComp.attach({ send: (msg) => box.send(msg), sketchId: () => current?.id, persist: () => persist(), select: (id) => selectLayer(id), player });
    // 3D models (tools/three-models.js): drops on the preview, the gizmo on a model
    if (typeof ThreeModels !== 'undefined') ThreeModels.attach({ send: (msg) => box.send(msg), previewHost, sketchId: () => current?.id });
    // (round 34 "labgestures") Z / Shift+Z, the view rows, the hint (tools/three-gestures.js; the gestures are in the preview)
    if (typeof ThreeGestures !== 'undefined') ThreeGestures.attach({ send: (msg) => box.send(msg), pane, layer: () => sel()?.id });
    // (round 40, labcamera) 🎥 camera moves on the timeline (tools/three-camera.js; the moves are drawn in the preview)
    if (typeof LabCamera !== 'undefined') LabCamera.attach({ send: (msg) => box.send(msg), player, layers: () => layersOf(), layerById: (id) => layerById(id), sel: () => sel() || null, edit: (id, patch) => editLayer(id, patch, { direct: true }), sketchId: () => current?.id || null, host: previewHost, ensureClock: () => { if (!player.loaded) ensureTimeline(); } });
    // (round 46, labdirect) ✥ click / drag / scale / turn layers on the picture itself (tools/three-direct.js; the gestures are in the preview)
    if (typeof LabDirect !== 'undefined') LabDirect.attach({ send: (msg) => box.send(msg), pane, player, layerById: (id) => layerById(id), sel: () => sel() || null, select: (id) => selectLayer(id), edit: (id, patch, o) => editLayer(id, patch, o), sketchId: () => current?.id || null, setEdit: (on) => setEdit(on), frame: () => box.frame,
      openSliders: (id) => { if (selId !== id) selectLayer(id); lkOpen(); },
      snapshot: (L) => ({ x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, keys: JSON.parse(JSON.stringify(Object.fromEntries(['x', 'y', 'scale', 'rotate'].filter((p) => L.keys?.[p]?.length).map((p) => [p, L.keys[p]])))) }),
      restore: (L, b) => { Object.assign(L, { x: b.x, y: b.y, scale: b.scale, rotate: b.rotate }); L.keys ||= {}; for (const p of ['x', 'y', 'scale', 'rotate']) { if (b.keys?.[p]) L.keys[p] = JSON.parse(JSON.stringify(b.keys[p])); else delete L.keys[p]; } box.send({ type: 'layer-props', id: L.id, props: layerProps(L) }); touch(); renderLayers(); } });
    // (round 50, labmaterials) ◉ looks on 3D things: the picker, undo, the director's op (tools/three-materials-hook.js)
    if (window.LabMatHook) LabMatHook.attach({ send: (msg) => box.send(msg), pane, previewHost, frame: () => box.frame, layerById: (id) => layerById(id), sel: () => sel() || null, select: (id) => selectLayer(id), layers: () => layersOf(), sketchId: () => current?.id || null, palette: () => current?.palette || [],
      setLook: (L, look) => { const ov = { ...(L.overrides || {}) }; if (look && Object.keys(look).length) ov['@look'] = look; else delete ov['@look']; L.overrides = Object.keys(ov).length ? ov : undefined; box.send({ type: 'layer-props', id: L.id, props: { overrides: L.overrides || null } }); touch(); } });
    pane.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      const plain = !typing && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (plain && /^[nfpwrob`|/]$/i.test(e.key) && !e.repeat) Usage.key(`${e.shiftKey && /[a-z]/i.test(e.key) ? 'Shift+' : ''}${e.key.toUpperCase()}`, 'Lab');
      if (plain && presentKeys(e)) { e.preventDefault(); return; }
      if (plain && e.key.toLowerCase() === 'n') { e.preventDefault(); takeNote(); return; }
      // (round 150, stage150) I: the preview's controls and readouts stay out (I again: a clean stage); in Present, I is its info line (above)
      if (plain && !e.shiftKey && e.key.toLowerCase() === 'i' && !e.repeat && window.LabHudStage) { e.preventDefault(); LabHudStage.togglePin({ say: true }); return; }
      // F freezes the picture (you freeze a lot, Focus was never used: it moved to Shift+F)
      if (plain && e.key.toLowerCase() === 'f') { e.preventDefault(); if (e.shiftKey) setFocus(!focusOn); else setFreeze(!frozenNow); return; }
      // R shuffles the selected layer's sliders, Shift+R steps back through the shuffles
      if (plain && e.key.toLowerCase() === 'r' && !editOn) { e.preventDefault(); const c = selCtl(); if (!c) return; if (!c.visible) setSlidersVisible(true); if (e.shiftKey) c.shuffleStep(-1); else c.shuffle(); return; }
      // Shift+1…5: Fit, 9:16, 16:9, 4:5, 1:1 (the sizes you switch between)
      if (plain && e.shiftKey && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); stage.setMode(stage.pillOrder[Number(e.code.slice(5)) - 1]); Usage.key(`Shift+${e.code.slice(5)}`, 'Lab frame size'); return; }
      if (plain && e.key.toLowerCase() === 'o') { e.preventDefault(); browseSketches(); return; }
      if (plain && e.shiftKey && /^[abc]$/i.test(e.key)) { e.preventDefault(); const cc = selCtl(); if (cc && !cc.slotRecall(e.key.toUpperCase())) toast(`Slot ${e.key.toUpperCase()} is empty`, { timeout: 1000 }); return; }
      if (e.ctrlKey && !e.altKey && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); stepSketch(e.key === 'PageDown' ? 1 : -1); return; }
      if (plain && e.key === '`') { e.preventDefault(); consolePeek = !consoleShown(); syncConsole(); return; }
      // (round 36, labsearch) / opens 🔎 Lab search (sliders are in it too); in the sliders column it still finds a slider there
      if (plain && e.key === '/') { e.preventDefault(); if (typeof LabSearchHook !== 'undefined' && !e.target.closest?.('.tw-column')) { LabSearchHook.open(); return; } lkOpen(); selCtl()?.focusSearch(); return; }
      if (plain && e.key === '|') { e.preventDefault(); pinFrame(); return; }
      if (plain && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setLive(liveKind ? null : store.get('three.lastLive', /Mac/.test(navigator.platform) ? 'mic' : 'system')); return; }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePresent(); return; }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'w') { e.preventDefault(); setWrite(!writeArmed); return; }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setEdit(!editOn); return; }
      if (liveKind && !typing && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && !e.repeat && e.key.toLowerCase() === 't' && typeof ThreeMusic !== 'undefined') { e.preventDefault(); ThreeMusic.liveTap(); return; }
      // (Space on the button you just clicked, e.g. Tap, plays / pauses without also pressing that button on key-up)
      if (player.onKey(e)) { e.preventDefault(); if (e.key === ' ' && e.target.closest?.('button')) e.target.addEventListener('keyup', (u) => u.preventDefault(), { once: true }); if (!e.repeat) Usage.key(`${e.ctrlKey ? 'Ctrl+' : ''}${e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key}`, 'Lab'); }
    });
    pane.tabIndex = -1;
    let ranOnce = false;
    // what the preview runs now (see run()): each layer's code as sent (instrumented for sliders or not), and the sketch
    const ranCode = new Map(); let ranSketch = null;
    const ranRaw = new Map(); // (round 21) each layer's code as you wrote it, when it last ran (Ctrl+Enter compares)
    // Ctrl+Enter in the editor: only the layers whose code changed since they last ran run again, in place (the others
    // keep playing); nothing changed → every layer again, like ▶ Run. A page that isn't up gets a whole run anyway.
    function runChanged() {
      if (!current) return false;
      if (ranSketch !== current.id || !box.ready || box.stale || restartNext) return run();
      const Ls = layersOf();
      const changed = Ls.some((L) => ranRaw.get(L.id) !== L.code) || [...ranRaw.keys()].some((id) => !layerById(id));
      return changed ? run({ sync: true }) : run();
    }
    let rebuildWaiting = false;
    // Per-sketch looks and music links for the sliders, song, frame size and selected layer.
    let extras = {};
    let extrasLoaded = false; // never write the empty placeholder over your saved extras (a reload while loading)
    const saveExtras = saver(() => { if (extrasLoaded && kvOk.has('three-lab-extras')) return window.hub.kvSet('three-lab-extras', extras); }, 500);
    let consoleLines = [];
    let lastStats = null;
    // the fps / draw-call line (on hover): rebuilt only when its text changes, and painted when it shows again
    let lastStatsMsg = null; let statsSig = ''; let statsRaf = 0; let statsPaintAt = 0;
    // (round 72, labfps72) the preview's Quality, visible and one click away: "Quality: auto" (the preview draws lighter
    // while frames drop: resolution first, then filters, shadows, particles; stills, recordings and renders stay full)
    // or "Quality: full" (always full, frames may drop). It shows with the rest of the line on hover, and stays on screen
    // while the preview is lighter ("Quality: auto · 70 %"). Clicking it (or right-click › View) switches; it's the
    // same setting as before ("Lighten to stay smooth"). Opened on pointerdown: the line is redrawn twice a second.
    const qChip = el('button', { type: 'button', class: 'lab-q', dataset: { feature: 'Preview quality' } });
    qChip.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); qualityMenu(e.clientX, e.clientY); });
    qChip.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); qualityMenu(e.clientX, e.clientY); });
    function qualityMenu(...a) { return labPart(K, 'dialogs', 'qualityMenu', a); } // tools/three-lab-dialogs.js
    // what Smooth lowered right now, in plain words (the chip's tooltip, the ⚡ Speed check card)
    function qualityWhy(a = adaptLast) {
      if (!a) return '';
      const parts = [];
      if ((a.shown ?? a.scale ?? 1) < 1) parts.push(`${Math.round((a.shown ?? a.scale) * 100)} % resolution`);
      if (a.fx) parts.push(a.fx >= 2 ? 'filters at a third' : 'filters at half size');
      if (a.shadow != null && a.shadow < 1) parts.push(`shadow maps at ${Math.round(a.shadow * 100)} %`);
      if (a.parts != null && a.parts < 1) parts.push(`${Math.round(a.parts * 100)} % of the particles`);
      if (a.tier) parts.push(`a steady ${a.tier} fps`);
      if (a.half) parts.push('the heaviest layer every other frame');
      if (a.aaWish && a.mode === 'smooth') parts.push('no antialias from the next run');
      return parts.length ? `${parts.join(', ')}${a.why ? ` (${a.why})` : ''}` : '';
    }
    function qualityChip(msg) {
      const m = qMode();
      const lighter = adaptOn && msg.quality < 1;
      const name = adaptHeld || m === 'high' ? 'high' : m === 'balanced' ? 'balanced' : 'auto';
      const t = name === 'high' ? 'Quality: high' : lighter ? `Quality: ${name} · ${Math.round(msg.quality * 100)} %` : `Quality: ${name}`;
      if (qChip.textContent !== t) qChip.textContent = t;
      const tier = adaptOn && msg.adapt?.tier;
      qChip.classList.toggle('lighter', lighter || Boolean(tier)); qChip.classList.toggle('warn', lighter);
      const why = adaptOn ? qualityWhy(msg.adapt) : '';
      const title = name === 'high' ? 'Force high quality: the preview keeps full resolution, antialias and shadows, even when frames drop. Click: Smooth, Balanced or Force high.' : why ? `${name === 'auto' ? 'Smooth' : 'Balanced'}: the preview draws lighter to stay smooth: ${why}. Renders stay full quality. Click: Smooth, Balanced or Force high.` : `${name === 'auto' ? 'Smooth (auto): the preview lightens itself before frames drop' : 'Balanced: the preview lightens only while frames keep dropping'} (renders stay full). Click: Smooth, Balanced or Force high.`;
      if (qChip.title !== title) qChip.title = title; // (round 73) the same title written again still woke every page observer
      return qChip;
    }
    function paintStats(msg) {
      const sig = `${Math.round(msg.fps)}|${msg.quality}|${adaptOn}|${Math.round(msg.worst || 0)}|${msg.ms.toFixed(1)}|${msg.calls}|${msg.triangles}|${msg.points}|${msg.geometries}|${msg.textures}|${msg.programs}`;
      if (sig === statsSig) return;
      statsSig = sig;
      // (round 73, startfast73) the line's parts are made once and their words changed in place: a new line every stats
      // message (≈ every 3 s even on a still, dozing picture) woke three page-wide observers and a pass of a11y each time
      const fb = typeof FrameBar !== 'undefined' ? FrameBar.el() : null; // (round 64, framebar64) ▮ the frame budget bar (tools/framebar.js)
      if (!statsParts || statsParts.fb !== fb) {
        const t = (tag, o) => { const n = el(tag, o || {}); n.append(document.createTextNode('')); return n; };
        statsParts = { fb, fps: t('b'), worst: t('span', { title: 'The longest gap between two frames in the last half second: over ~25 ms shows as a stutter (60 Hz = 16.7 ms per frame)' }), ms: t('span'), calls: t('span'), tris: t('span'), points: t('span'), geo: t('span') };
        const P = statsParts;
        stats.replaceChildren(P.fps, ...(fb ? [fb] : []), qualityChip(msg), P.worst, P.ms, P.calls, P.tris, P.points, P.geo); // (round 72, labfps72) Quality: auto · 70 %, a click away from Full
      }
      const P = statsParts;
      const put = (n, text, cls) => { if (n.firstChild.data !== text) n.firstChild.data = text; if (cls !== undefined && n.className !== cls) n.className = cls; };
      qualityChip(msg);
      put(P.fps, `${Math.round(msg.fps)} fps`, msg.fps < 30 ? 'bad' : msg.fps < 55 ? 'warn' : 'ok');
      P.worst.hidden = !msg.worst; if (msg.worst) put(P.worst, `worst ${Math.round(msg.worst)} ms`, msg.worst > 40 ? 'bad' : msg.worst > 24 ? 'warn' : 'ok');
      put(P.ms, `${msg.ms.toFixed(1)} ms render`); put(P.calls, `${msg.calls} draw calls`); put(P.tris, `${msg.triangles.toLocaleString()} tris`);
      P.points.hidden = !msg.points; if (msg.points) put(P.points, `${msg.points.toLocaleString()} points`);
      put(P.geo, `${msg.geometries} geo · ${msg.textures} tex · ${msg.programs} shaders`);
      window.LabRegroup?.stats?.(msg, qChip.textContent); // (round 148, look148) the preview's instrument header: fps · quality (only when the line changed)
    }
    let statsParts = null;
    previewHost.addEventListener('mouseenter', () => { if (lastStatsMsg) requestAnimationFrame(() => paintStats(lastStatsMsg)); });
    // (round 64, framebar64) ▮ the frame budget bar lives in the stats line (the fps and the bar stay on screen, the rest
    // of the line shows on hover: tools/framebar.css). The bar only reads the stats; the preview measures each layer
    // only while the whole line shows (the pointer over the preview) or the bar's card is open: checked with each stats
    // message (twice a second at most), when the pointer enters / leaves the preview and when the card opens / closes.
    // Its code loads the first time the line shows (lazy group "framebar"); the line hidden (Customise this…): nothing.
    let fbOn = false;
    function fbShown(vis) {
      if (vis && typeof FrameBar === 'undefined') { if (window.Lazy && !fbShown.asked) { fbShown.asked = true; window.Lazy.load('framebar').then(() => { statsSig = ''; if (lastStatsMsg) { paintStats(lastStatsMsg); FrameBar.paint(lastStatsMsg); } }, () => {}); } return; }
      const on = Boolean(vis) && (previewHost.matches(':hover') || (typeof FrameBar !== 'undefined' && FrameBar.counting()));
      if (on !== fbOn) { fbOn = on; box.send({ type: 'framebar', on }); }
      if (!vis && typeof FrameBar !== 'undefined') FrameBar.visible(false);
    }
    const fbCheck = () => fbShown(stats.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    // (round 113, warmopen113) read after a painted frame: the preview coming in under a resting pointer (a name ▾
    // switch onto a project left on the Lab) sent mouseenter mid-switch, and the read laid out the window there (≈ 20–40 ms)
    let fbT = 0;
    const fbSoon = (ms) => { clearTimeout(fbT); fbT = setTimeout(() => { if (document.visibilityState === 'visible') requestAnimationFrame(() => setTimeout(fbCheck, 0)); else fbCheck(); }, ms); };
    previewHost.addEventListener('mouseenter', () => fbSoon(50));
    previewHost.addEventListener('mouseleave', () => fbSoon(400));
    api.framebar = { host: previewHost, call: (m, t) => sandboxCall(m, t), name: (id) => layerById(id)?.name || null, ids: () => layersOf().map((L) => L.id), selected: () => selId, recheck: () => fbCheck() };
    // (round 133, speed133) ⚡ Speed check (tools/three-speed*.js): the scene's preview-only speed settings, kept with the
    // scene (sketch.speed: px1 · noAA · sh · fxHalf; never read by an export page or ▶ Play), the 3-second measure, and
    // the place of the slow chip (beside the stats line). set(): saved, sent to the page; a change of antialias runs the
    // scene again on a fresh page (a context's antialias is fixed when it's made). The card's undo goes through set() too.
    const speedOf = (sk = current) => { const { q, ...own } = sk?.speed || {}; return { px1: false, noAA: false, sh: null, fxHalf: false, ...own }; }; // (round 142: q is the scene's quality choice, not a speed fix)
    // (round 142, smooth142) what the page gets: Force high quality sets the scene's preview fixes aside; Smooth adds
    // "no antialias" once the page asked for it on this scene (from its next run)
    const speedMsg = (lite = liteOn()) => { if (lite) return { type: 'speed', px1: true, noAA: true, sh: 0, fxHalf: true, lay: speedOf().lay || null }; if (safeOn()) return { type: 'speed', px1: true, noAA: true, sh: 0, fxHalf: true, lay: speedOf().lay || null }; const m = qMode(); if (m === 'high') return { type: 'speed', px1: false, noAA: false, sh: null, fxHalf: false, lay: null }; const s = speedOf(); return { type: 'speed', ...s, noAA: Boolean(s.noAA || (m === 'smooth' && current && aaAuto.has(current.id))) }; };
    api.speed = {
      host: previewHost, stats, sceneId: () => current?.id || null, sceneName: () => current?.name || '',
      get: () => speedOf(),
      set(next, { quiet = false } = {}) {
        if (!current) return null;
        const was = speedOf(); const now = { ...was, ...(next || {}) }; const aaWas = speedMsg().noAA;
        const clean = Object.fromEntries(Object.entries(now).filter(([k, v]) => (k === 'sh' ? v !== null && v !== undefined : k === 'lay' ? Boolean(v && Object.keys(v).length) : Boolean(v)))); // (round 146, layercost146) lay: { layerId: { half, sh0 } }, one layer's own preview lightening
        if (current.speed?.q) clean.q = current.speed.q; // (round 142, smooth142) the scene's quality choice stays
        if (Object.keys(clean).length) current.speed = clean; else delete current.speed;
        current.updatedAt = Date.now(); saveSoon();
        box.send(speedMsg());
        if (aaWas !== speedMsg().noAA) run({ reload: true, quiet });
        return speedOf();
      },
      quality: () => ({ mode: qMode(), own: current?.speed?.q || null, global: qGlobal(), held: adaptHeld, why: qualityWhy(), adapt: adaptLast, lite: liteOn() }), // (round 142, smooth142) for the ⚡ card
      measure: (ms = 3000, toggle = 3) => sandboxCall({ type: 'speed-measure', ms, toggle }, ms * 20 + 30000), // (a slow software GPU stretches each window to 6 frames)
      reopen: () => run({ reload: true }), // a fresh page for the scene (safe mode after the graphics card dropped it)
      name: (id) => layerById(id)?.name || null,
      userCap: () => { const v = fpsPref(); return v > 0 ? v : 0; },
      light: () => lightOn || liteOn(), frozen: () => frozenNow, parked: () => parkedNow, // (round 153a: Lite's 30 isn't "slow")
      layers: () => renderLayers(), // (round 146, layercost146) the cost badges on the Layers rows shown / hidden
    };
    // (round 142, smooth142) the preview's quality: get() → 'smooth' | 'balanced' | 'high' (this scene's, else the default);
    // set(mode, { scene }) keeps it for this scene (sketch.speed.q) and as the default
    // (round 153a, lite153) Lite on / off: the page told at once; antialias changes from a fresh page (fixed when made)
    addEventListener('hearth:lite', () => {
      const on = liteOn();
      box.send({ type: 'lite', on }); box.send(speedMsg()); if (box.ready) box.send(capMsg()); // (the Lab window's full rate behind other apps comes back with Lite off: labwin153)
      if (speedMsg(!on).noAA !== speedMsg().noAA && current) run({ reload: true, quiet: true });
      paintLiteTag(); statsSig = ''; if (lastStatsMsg) paintStats(lastStatsMsg);
    });
    api.quality = { get: () => qMode(), set: (m, o) => setQuality(m, o), global: () => qGlobal(), why: () => qualityWhy(), names: Q_NAMES, menu: (x = 200, y = 200) => qualityMenu(x, y), chip: () => qChip };
    // Perf HUD (/lab perf, round 16 "labperf"): a quiet line in the preview's corner, fps · frame ms (median / worst
    // 5 %) · draw calls · GPU memory estimate, 2 updates a second at most, written only when the text changes
    let perfHudOn = Boolean(store.get('three.perfHud', false));
    const perfHud = el('div', { class: 'lab-perf-hud', hidden: !perfHudOn, title: 'Lab perf: fps · frame ms (median / slowest 5 %) · draw calls · GPU memory estimate (/lab perf hides it)' });
    previewHost.append(perfHud);
    function perfLine(m) {
      if (!m) return 'no frames yet';
      const q = (m.quality < 1 ? ` · ${Math.round(m.quality * 100)}%` : '') + (m.adapt?.level > 3 ? ` · lighter ${m.adapt.level}/9` : '') + (m.adapt?.covered ? ` · ${m.adapt.covered} hidden skipped` : '');
      return `${Math.round(m.fps)} fps${m.cap ? `/${m.cap}` : ''} · ${m.p50 ?? m.ms.toFixed(1)}/${m.p95 ?? '–'} ms · ${m.callsAll ?? m.calls} calls · ≈${m.gpuMB ?? '?'} MB${q}${m.light ? ' · 🪶' : ''}${m.lite ? ' · ⚡ lite' : ''}`;
    }
    function paintPerfHud(m) { if (!perfHudOn) return; const t = perfLine(m); if (perfHud.textContent !== t) perfHud.textContent = t; }
    function setPerfHud(on) { perfHudOn = Boolean(on); store.set('three.perfHud', perfHudOn); perfHud.hidden = !perfHudOn; paintPerfHud(lastStatsMsg); return perfHudOn; }
    let pendingShot = null;
    // Requests to the sandbox that answer later (eval / input), by id.
    const sandboxCalls = new Map();
    // (round 72, labbridge72) the preview reloading (Run, a fresh page, a lost GPU…) while an eval / play-test waits on it: the
    // old page will never answer, so the call ends now, in words, instead of "did not answer" seconds later
    life.undo.push(live.onReload((name) => { // (round 161, fix161: let go on ThreeLab.drop)
      if (name !== 'preview' || !sandboxCalls.size) return;
      for (const [id, resolve] of [...sandboxCalls]) { sandboxCalls.delete(id); resolve({ ok: false, error: 'The Lab preview reloaded while this ran (the page it ran in is gone): nothing was changed by it. Call it again.' }); }
    }));
    function sandboxCall(msg, timeout) {
      return new Promise((resolve) => {
        const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        sandboxCalls.set(id, resolve);
        box.send({ ...msg, id });
        setTimeout(() => { if (sandboxCalls.has(id)) { sandboxCalls.delete(id); resolve({ ok: false, error: 'The sketch did not answer (is it running?)' }); } }, timeout);
      });
    }

    const HEALTH_MSG = /^(error|health|health-clear|layer-paused|gpu-lost|gpu-restored)$/;
    const layerName = (id) => (layersOf().length > 1 ? layerById(id || 'main')?.name : null);
    function log(level, text, line, layer) {
      const lname = layerName(layer);
      consoleLines.push({ level, text: String(text).slice(0, 500), line, layer: lname });
      if (consoleLines.length > 80) consoleLines.shift();
      const row = el('div', { class: `console-row ${level}` },
        lname ? el('button', { class: 'console-layer', text: lname, title: 'Select this layer', on: { click: () => selectLayer(layer) } }) : null,
        line ? el('button', { class: 'console-line', text: `line ${line}`, on: { click: () => { if (layer && layer !== selId) selectLayer(layer); setCodeVisible(true); requestAnimationFrame(() => goToLine(line)); } } }) : null,
        el('span', { text }));
      consoleBox.append(row);
      while (consoleBox.children.length > 300) consoleBox.firstChild.remove();
      consoleBox.scrollTop = consoleBox.scrollHeight;
      if (!consoleShown()) { if (level === 'error') unseen.errors += 1; else if (level === 'warn') unseen.other += 1; syncConsole(); }
    }
    function goToLine(line) {
      const lines = editor.value.split('\n');
      const pos = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
      editor.focus();
      editor.area.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
      editor.area.scrollTop = Math.max(0, (line - 5) * 19);
      editor.syncScroll();
    }
    function onMessage(msg) {
      window.LabSafe?.msg?.(msg); // (round 147, safeopen147) crashes, hangs and healthy frames, per scene
      if (HEALTH_MSG.test(msg.type)) window.LabHealth?.fromBox(msg, current?.id, 'screen'); // (round 80, laberrors80) the scene's health → its chats
      if(msg.type==='stack-drawn'&&!msg.noGl)workspaceDrawn=current?.id;
      workspaceMessage?.(msg);
      window.ThreeStage?.preview?.(msg); // (round 22, labstage) show-mode safety, tempo, crossfade hand-over
      window.ThreePerform?.preview?.(msg); // (round 131, perform131) ◉ Perform's frame rate on its strip
      if (/^gpu-(lost|restored|stuck)$/.test(msg.type)) { glPreview(msg); return; } // (round 43, glrecover)
      if (msg.type === 'frame-runaway') { glp.runaway.push({ ...msg, at: Date.now() }); if (glp.runaway.length > 10) glp.runaway.shift(); console.warn('[Lab] the preview\'s frames ran away; it went back to plain frames', JSON.stringify(msg)); return; } // (round 109, labchecks109) the page's runaway guard
      if (/^ready-/.test(msg.type)) { window.PresentReady?.onBox?.(msg); return; } // (round 52, presentready)
      if (msg.type === 'stack-drawn' && glp.phase === 'remaking') glBack('new page');
      if (msg.type === 'obs-frame') { window.InteropObs?.frame(msg); return; } // (round 25, interop) a frame for OBS's Browser Source
      if (msg.type === 'shader-info') { window.LabShader?.onBox?.(msg); return; } // (round 23) ◇ shader layers' compile state
      if (msg.type === 'particles-info') { window.LabParticles?.onBox?.(msg); return; } // (round 24) ✦ particle layers' counts / sources
      if (msg.type === 'type-info') { window.LabType?.onBox?.(msg); return; } // (round 25) 🅰 type layers' glyphs / fonts
      if (/^motionin-/.test(msg.type)) { window.LabMotionIn?.onBox?.(msg); return; } // (round 25) 📷 camera input: what the scene reads, tracking state
      if (msg.type === 'physics-info') { window.LabPhysics?.onBox?.(msg); return; } // (round 25) ⚛ physics layers' bodies
      if (msg.type === 'cam-info' && typeof LabCamera !== 'undefined' && LabCamera.onBox(msg)) return; // (round 40) the camera moves' answers
      if (msg.type === 'direct' && typeof LabDirect !== 'undefined' && LabDirect.onBox(msg)) return; // (round 46, labdirect) a pick / a move on the picture
      if (/^look-/.test(msg.type)) { window.LabMatHook?.onBox?.(msg); return; } // (round 50, labmaterials) ◉ looks: thumbnails, what a pick names
      if (/^view-/.test(msg.type) && typeof ThreeGestures !== 'undefined' && ThreeGestures.onBox(msg)) return; // (round 34) Z / Shift+Z answers, the first-time hint
      if (typeof ThreeDirector !== 'undefined') ThreeDirector.onBox?.(msg); // (round 21) a director call answers at the first new frame
      // the sequence's own messages (and a realtime render's recording) go to tools/three-seq.js
      if (!String(msg.recordId || '').startsWith('feedback-') && typeof ThreeSeq !== 'undefined' && (ThreeSeq.onMessage(msg) || ThreeSeq.takeRecording(msg))) return;
      // a key pressed while the picture had focus: the Lab's shortcuts handle it as if pressed here
      if (msg.type === 'host-key') { const { type: _t, source: _s, ...k } = msg; pane.dispatchEvent(new KeyboardEvent('keydown', { ...k, bubbles: true, cancelable: true })); return; }
      if (msg.type === 'host-keyup') { const { type: _t, source: _s, ...k } = msg; pane.dispatchEvent(new KeyboardEvent('keyup', { ...k, bubbles: true, cancelable: true })); return; } // (round 37: B held over the picture)
      if (msg.type === 'console') log(msg.level, msg.text, null, msg.layer);
      if (msg.type === 'tweak-reads') {
        // global indices → each layer's own
        for (const L of layersOf()) {
          const c = controllers.get(L.id);
          if (!c) continue;
          const b = baseOf(L);
          const pick = (arr) => arr.filter((i) => i >= b && i < b + SLOT).map((i) => i - b);
          c.onReads({ used: pick(msg.used), live: pick(msg.live) });
        }
      }
      if (/^(media-state|seek-ack|record-started|record-error|recording|av-event)$/.test(msg.type)) { // (round 135, seekfix135: seek-ack) // (round 77, labaudio77: av-event, the sound output changing)
        player.onMessage(msg);
        if (!keyTimer && msg.type === 'media-state' && keyedNow()) keyLoop(); // (round 44, idlecpu) playing / a seek: the knobs follow again · (round 54) only with something keyframed to follow: a scrub sends this ~60× a second, and each one made a 100 ms timer the first tick dropped again
        if (msg.type === 'media-state' && window.Power && Boolean(msg.playing) !== mediaPlaying) { if (!msg.playing) rememberMedia(); mediaArm(Boolean(msg.playing)); }
        if (msg.type === 'recording' && rebuildWaiting) { rebuildWaiting = false; run({ hot: true }); }
      }
      if (msg.type === 'drawn') { building(msg.layer, false); return; }
      if (msg.type === 'error') {
        const lid = msg.layer || (layersOf().length === 1 ? layersOf()[0].id : null);
        if (lid) building(lid, false);
        if (lid && controllers.get(lid)?.onError(msg)) return; // couldn't attach sliders: it re-runs as-is
        errors.push({ ...msg, layer: lid });
        log('error', msg.message, msg.line, lid);
        dispatchEvent(new CustomEvent('hearth:lab-error', { detail: { message: msg.message, line: msg.line, layer: lid } })); // (round 26) ⚡ hooks.js: "when the Lab scene shows an error"
        if (!lid || lid === selId) editor.setErrorLines(errors.filter((e) => !e.layer || e.layer === selId).map((e) => e.line).filter(Boolean));
      }
      if (msg.type === 'ctx') {
        const r = box.frame.getBoundingClientRect(); const k = r.width / (box.frame.offsetWidth || r.width);
        Promise.resolve(previewMenuItems()).then((rows) => showMenu(r.left + msg.x * k, r.top + msg.y * k, rows));
        return;
      }
      if (msg.type === 'adapt') { paintAdapt(msg); return; }
      // (round 39, labmemory) the preview cleaned up by itself after a scene switch and is still heavy: one calm tip
      if (msg.type === 'mem-note') {
        const go = () => toast('The Lab preview is holding a lot of graphics memory after many scenes. ⟲ Restart from scratch lightens it.', { timeout: 12000, action: { label: '⟲ Restart', fn: () => restartSim() } });
        if (window.Hints) Hints.offer({ id: 'lab-memory', place: 'lab', rank: 60, once: false, ttl: 10 * 60e3, show: go }); else go();
        return;
      }
      if (msg.type === 'trig-viz') { trigPanel?.feed(msg); return; }
      if (msg.type === 'stage-ptr' || msg.type === 'stage-tint') { window.LabHudStage?.msg(msg); return; } // (round 150, stage150) the pointer over the picture, the picture's colour
      if (msg.type === 'stats') {
        lastStatsAt = Date.now();
        if (stall.querySelector('.three-stall-text').textContent.includes('responding')) hideStall();
        lastStats = { fps: Math.round(msg.fps), worstFrameMs: Math.round(msg.worst || 0), renderMs: Number(msg.ms.toFixed(2)), drawCalls: msg.calls, triangles: msg.triangles, points: msg.points, geometries: msg.geometries, textures: msg.textures, shaders: msg.programs };
        lastStatsMsg = msg;
        window.Jank?.lab(msg); // (round 20) the jank watch: real frame times on this computer (/smooth)
        window.HearthLite?.stats?.(msg); // (round 153a, lite153) "Things are slow: turn on Lite mode?" once a session (lite.js)
        window.LabHudStage?.stats?.(msg); // (round 150, stage150) the stage's fps label (written only while it shows)
        if (typeof LabSpeedHook !== 'undefined') LabSpeedHook.stats(msg); // (round 133, speed133) ⚡ "Slow: 21 fps · Why?" after 5 s under 50 fps / half the screen's rate
        paintPerfHud(msg);
        if (msg.adapt) paintAdapt(msg.adapt);
        if (msg.pace) { paceLast = msg.pace; if (paceOn) paintPace(); restCheck(true); } // (round 33 "labpace") (round 151: a picture gone still / moving again)
        if (stats.hidden) stats.hidden = false;
        // (round 16: the line shows on hover; while it can't be seen it isn't rewritten, and never with the same text)
        // (round 38, inputlatency) asked right after the coming frame, when the page's style is fresh: asked here (a
        // message between two frames, twice a second) it styled and laid out the whole Lab first whenever a drag had
        // just changed it (in the frame's rAF it did the same before the frame's own writes)
        // (round 73) parked behind a chat or the window hidden: the line can't be seen, nothing is scheduled (the next message after it shows paints it)
        if (!statsRaf && !parkedNow && document.visibilityState === 'visible') statsRaf = requestAnimationFrame(() => setTimeout(() => { statsRaf = 0; const vis = stats.checkVisibility({ opacityProperty: !previewHost.classList.contains('st-on'), visibilityProperty: true }); /* (round 150, stage150: the stage only fades it while idle; it stays painted, as it was always on screen before, so it is right the moment it shows and the 01 header follows) */ fbShown(vis); if (lastStatsMsg && vis && !(LabPlay.playing && Date.now() - statsPaintAt < 900)) { statsPaintAt = Date.now(); if (LabPlay.playing) LabPlay.count('stats'); paintStats(lastStatsMsg); if (typeof FrameBar !== 'undefined') FrameBar.paint(lastStatsMsg); } }, 0)); // (round 142, smooth142: the line once a second at most while it plays)
      }
      if (/^edit-/.test(msg.type)) { onEditMessage(msg); return; }
      if (/^audio-/.test(msg.type) && typeof ThreeAudio !== 'undefined' && ThreeAudio.onMessage(msg)) return; // (round 23, labaudio)
      if (msg.type === 'live-tempo') { if (liveKind) { liveBpm = msg; paintLive(); if (typeof ThreeMusic !== 'undefined') ThreeMusic.liveTempo(msg); } return; }
      if (msg.type === 'live-state') { if (msg.error) toast(`Live sound: ${msg.error}`, { type: 'error', timeout: 5000 }); if (!msg.on && msg.error) { liveKind = null; paintLive(); } return; }
      if (msg.type === 'ready' && msg.again && ranOnce) { console.warn(msg.gl ? 'Lab preview made again after the GPU went away: running the scene again' : 'Lab preview restarted by itself: running the sketch again'); run({ again: true, quiet: Boolean(msg.gl) }); }
      if (msg.type === 'ready' && typeof ThreeAudio !== 'undefined') ThreeAudio.onReady();
      if (msg.type === 'ready') window.LabMotionIn?.onReady?.();
      if (msg.type === 'ready') window.LabHudStage?.onReady?.(); // (round 150, stage150) a fresh page: the pointer and the colour reading again // (round 25) 📷 a fresh page gets the tracker again
      if (msg.type === 'ready') fbOn = false; // (round 64, framebar64) a fresh page measures nothing until the stats line shows again
      if (msg.type === 'ready') { refsSig = null; pageN = msg.n ?? null; pageHeld = { n: null, sigs: new Set() }; } // (round 39, labmemory) a fresh page has no references yet · (round 75) nor any kept file
      if (msg.type === 'refs-held') { if (msg.n === pageN) { pageHeld = { n: msg.n, sigs: new Set(msg.sigs || []) }; for (const r of refsOf()) if (pageHeld.sigs.has(refSigs.get(r.id))) refBytes.delete(r.id); for (const k of [...fileBytes.keys()]) if (pageHeld.sigs.has(k)) fileBytes.delete(k); /* (round 99, labmodels99) */ } return; } // (round 75, labload75: the window keeps no copy of what the page holds)
      if (msg.type === 'refs-need') { if (msg.n === pageN) { for (const x of msg.sigs || []) pageHeld.sigs.delete(x); refsSig = null; const want = current; loadRefBytes().then(() => { if (current === want) run({ sync: true }); }).catch(() => {}); } return; }
      if (msg.type === 'asset-progress') return;
      if (msg.type === 'ready') window.PerfectLoop?.onReady?.(); // (round 31) ∞ a fresh page gets the scene's loop clock again
      if (msg.type === 'ready') { box.send(capMsg()); if (onBattery) box.send({ type: 'power', battery: true }); if (lightOn) box.send({ type: 'light', on: true }); if (liteOn()) box.send({ type: 'lite', on: true }); sendQuality(); adaptLast = null; paintAdapt(); parkedNow = false; parkSoon(); }
      if (msg.type === 'ready') { if (frozenNow) box.send({ type: 'freeze', on: true }); if (guides) box.send({ type: 'guides', kind: guides }); if (previewHost.classList.contains('presenting')) box.send({ type: 'present', on: true }); sendTriggers(); if (trigPanel) box.send({ type: 'trig-watch', on: true }); }
      if (msg.type === 'ready' && liveKind) {
        // a reloaded preview: the hub page keeps capturing, the Stage captures again by itself
        sendLiveGain();
        if (box.onStage) { hubLiveStop(); setTimeout(() => window.hub.liveStart(liveKind), 400); } else if (hubLive.stream) box.send({ type: 'live-remote', on: true, kind: liveKind }); else setTimeout(() => window.hub.liveStart(liveKind), 400);
      }
      if (msg.type === 'framebar-result' || msg.type === 'speed-result') { sandboxCalls.get(msg.id)?.(msg); sandboxCalls.delete(msg.id); return; } // (round 64, framebar64) "why?" · (round 133, speed133) ⚡ the speed check's measure
      if (msg.type === 'eval-result' || msg.type === 'input-result') { sandboxCalls.get(msg.id)?.(msg); sandboxCalls.delete(msg.id); return; }
      if (msg.type === 'shot') {
        if (msg.tag === 'thumb') { const fn = thumbShot; thumbShot = null; fn?.(msg.dataUrl, msg.small); return; }
        if (msg.tag === 'get') { const fn = pendingShot; pendingShot = null; fn?.(msg.dataUrl); return; }
        if (pendingShot) { pendingShot(msg.dataUrl); pendingShot = null; } else if (copyNextShot) {
          copyNextShot = false;
          Promise.resolve().then(() => pngBlob(msg.dataUrl)).then((b) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]))
            .then(() => toast('Screenshot copied: paste it anywhere', { timeout: 1800 }), (err) => toast(`Couldn't copy: ${err.message}`, { type: 'error' }));
        } else saveDataUrl(msg.dataUrl, `${current?.name || 'sketch'}.png`);
      }
    }
    // (round 21) …unless that code already ran meanwhile (Ctrl+Enter, ▶ Run): it isn't run a second time
    const autoRunSoon = debounce(() => { const L = sel(); if (L && current && ranSketch === current.id && ranRaw.get(L.id) === L.code) return; run({ hot: true, layer: selId }); }, 700);

    // Version history: a snapshot of a layer each time it runs (40 per layer), plus deleted sketches.
    let history = {};
    let trash = [];
    // (round 21: written 1.5 s after the last change, not 0.4 s: with auto-run every pause in typing takes a snapshot,
    // and the whole history, 40 versions of every layer, went to disk each time)
    // (round 88, labsync88) one file per scene: kv/three-hv-<scene>.json holds that scene's versions, kv/three-history.json
    // the trash ({ v: 2, versions: {}, trash }). A run writes its scene's file only (it was the whole history, every
    // scene's 40 versions per layer, sent whole to the other computer each time). A scene's file is read before it is
    // written (what's there joins what's here; one that can't be read is left alone and tried again), and read when the
    // scene opens (History shows it). Versions still in three-history.json (an older Hearth on the other computer, or
    // before this round) move into the scene files, and leave three-history.json only once their scene's file is written.
    // saveHistory(sceneId): that scene's versions changed · saveHistory(): the trash changed
    const histDirty = new Set(); const histRead = new Set();
    let histMove = null; let histMainDue = false; let histBusy = false; let histAgain = false;
    async function readHistSeg(name) {
      try {
        const r = await window.hub.kvGet(name, null, { status: true });
        if (!r || typeof r !== 'object' || !r.state) return { ok: true, value: r }; // an older main process
        return r.state === 'unreadable' ? { ok: false } : { ok: true, value: r.state === 'ok' ? r.value : null };
      } catch { return { ok: false }; }
    }
    async function loadHist(sid) {
      if (!sid || histRead.has(sid)) return true;
      const r = await readHistSeg(SceneSafeCore.histSegName(sid));
      if (!r.ok || histRead.has(sid)) return histRead.has(sid);
      SceneSafeCore.histTake(history, sid, SceneSafeCore.histJoin(SceneSafeCore.histSegOf(history, sid), SceneSafeCore.segVersions(r.value)));
      histRead.add(sid);
      return true;
    }
    async function flushHistory() {
      if (!kvOk.has('three-history')) return;
      if (histBusy) { histAgain = true; return; }
      histBusy = true;
      let failed = false;
      try {
        const st = { history, dirty: histDirty, read: histRead, move: histMove, mainDue: histMainDue, trash };
        histMainDue = false;
        ({ failed } = await SceneSafeCore.histFlush(st, { read: readHistSeg, write: (name, v) => window.hub.kvSet(name, v) }));
        histMainDue = histMainDue || st.mainDue;
      } finally { histBusy = false; }
      if (histAgain) { histAgain = false; saveHistoryNow(); } else if (failed) setTimeout(() => saveHistoryNow(), 20000);
    }
    const saveHistoryNow = debounce(() => { flushHistory().catch(() => {}); }, 1500);
    function saveHistory(sid) { if (sid) histDirty.add(sid); else histMainDue = true; saveHistoryNow(); }
    const histKey = (L) => (!L || L.id === 'main' ? current.id : `${current.id}:${L.id}`);
    function snapshot() {
      if (!current || !editor.value.trim() || api.tm?.quiet) return; // (round 23: not while the time machine shows a version)
      const list = (history[histKey(sel())] ||= []);
      if (list[0]?.code === editor.value) return;
      list.unshift({ at: Date.now(), code: editor.value });
      list.length = Math.min(list.length, 40);
      saveHistory(current.id); // (round 88) this scene's file only
    }
    function historyDialog(...a) { return labPart(K, 'dialogs', 'historyDialog', a); } // tools/three-lab-dialogs.js

    // Full runs reload the preview with every layer; hot runs (slider rebuilds, live code, a new layer)
    // re-run one layer in place, keeping three.js loaded, the other layers running and the music playing.
    // Cycle looks: every N bars while the song plays, each layer moves to its next saved look (morphing)
    let lookCycle = store.get('three.lookCycle', 0);
    let lookTimer = 0; let lookBar = -1;
    function lookCycleMenu(...a) { return labPart(K, 'dialogs', 'lookCycleMenu', a); } // tools/three-lab-dialogs.js
    function setLookCycle(...a) { return labPart(K, 'dialogs', 'setLookCycle', a); } // tools/three-lab-dialogs.js
    if (lookCycle) queueMicrotask(() => setLookCycle(lookCycle));
    function previewMenuItems(...a) { return labPart(K, 'menus', 'previewMenuItems', a); } // tools/three-lab-menus.js
    // ⌗ composition guides over the picture (not in screenshots / videos)
    const GUIDES = [['', 'off'], ['thirds', 'thirds'], ['golden', 'golden ratio'], ['center', 'center cross']];
    let guides = store.get('three.guides', '');
    const guidesBtn = el('button', { class: 'stage-btn', text: '⌗', title: 'Composition guides: thirds, golden ratio, center (not in screenshots or videos)', on: { click: () => cycleGuides() } });
    function cycleGuides() {
      guides = GUIDES[(GUIDES.findIndex(([k]) => k === guides) + 1) % GUIDES.length][0];
      store.set('three.guides', guides);
      box.send({ type: 'guides', kind: guides });
      guidesBtn.classList.toggle('on', Boolean(guides));
      toast(`Guides: ${GUIDES.find(([k]) => k === guides)[1]}`, { timeout: 900 });
    }
    guidesBtn.classList.toggle('on', Boolean(guides));
    // ❚❚ freeze: hold the picture (the music and the timeline go on); . steps one frame while frozen
    let frozenNow = false;
    const freezeBtn = el('button', { class: 'stage-btn freeze-btn', text: '❚❚ Freeze', title: 'Freeze the picture (F or \\) · while frozen, . steps one frame · | pins this frame to compare with what comes next', dataset: { feature: 'Freeze', key: 'F' }, on: { click: () => setFreeze(!frozenNow) } });
    freezeBtn.addEventListener('dblclick', (e) => { if (frozenNow) { e.preventDefault(); setFreeze(true); box.send({ type: 'step' }); } }); // frozen: double-click = one frame
    freezeBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); freezeMenu(e); });
    function freezeMenu(...a) { return labPart(K, 'dialogs', 'freezeMenu', a); } // tools/three-lab-dialogs.js
    // freeze exactly on the next beat / bar (counts in the song's grid; without a song: now)
    function freezeOn(unit = 'beat') {
      const wait = player.loaded && player.playing ? player.untilNext(unit) : 0;
      if (wait == null || wait > 8 || wait < 0.01) { setFreeze(true); return 0; }
      setTimeout(() => setFreeze(true), Math.max(0, wait * 1000 - 8));
      return wait;
    }
    function setFreeze(on) {
      frozenNow = on;
      box.send({ type: 'freeze', on });
      freezeBtn.textContent = on ? '▶ Frozen' : '❚❚ Freeze';
      if (on && store.get('three.pinOnFreeze', false)) setTimeout(() => pinFrame(), 120);
      freezeBtn.classList.toggle('on', on);
      previewHost.classList.toggle('frozen', on);
    }
    // ◐ Compare: pin a frame (|), then see it over the live picture as an onion skin, or a wipe you drag across.
    // Freeze, pin, unfreeze, move a slider: before and after side by side.
    let pinned = null; // { url, mode: 'onion' | 'wipe', opacity, split }
    const onionImg = el('img', { class: 'lab-onion-img', alt: '' });
    const wipeBar = el('div', { class: 'lab-wipe-bar', title: 'Drag to move the wipe' });
    const onion = el('div', { class: 'lab-onion', hidden: true }, onionImg, wipeBar);
    const compareBtn = el('button', { class: 'stage-btn', text: '◐', title: 'Compare: pin this frame (|) and see it over the live picture · click again: onion skin → wipe → off · right-click: options', dataset: { feature: 'Compare frame', key: '|' }, on: { click: () => cycleCompare() } });
    compareBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); compareMenu(e.clientX, e.clientY); });
    compareBtn.hidden = true;
    previewHost.append(onion);
    function placeOnion() { if (!pinned) return; const r0 = stage.rect; Object.assign(onion.style, { left: `${r0.left}px`, top: `${r0.top}px`, width: `${r0.width}px`, height: `${r0.height}px` }); paintOnion(); }
    function paintOnion() {
      onion.hidden = !pinned;
      compareBtn.hidden = !pinned; // ◐ shows while a frame is pinned (| or ⋯ pins one)
      compareBtn.classList.toggle('on', Boolean(pinned));
      compareBtn.textContent = pinned ? (pinned.mode === 'wipe' ? '◐ Wipe' : pinned.mode === 'diff' ? '◐ Diff' : '◐ Onion') : '◐';
      if (!pinned) return;
      onion.dataset.mode = pinned.mode;
      onionImg.style.opacity = pinned.mode === 'onion' ? pinned.opacity : 1;
      onionImg.style.mixBlendMode = pinned.mode === 'diff' ? 'difference' : 'normal';
      onionImg.style.clipPath = pinned.mode === 'wipe' ? `inset(0 ${100 - pinned.split * 100}% 0 0)` : 'none';
      wipeBar.style.left = `${pinned.split * 100}%`;
      wipeBar.hidden = pinned.mode !== 'wipe';
    }
    new ResizeObserver(() => placeOnion()).observe(previewHost);
    async function pinFrame({ mode } = {}) {
      const url = await director.shot();
      if (!url) { toast('Nothing is rendering to pin', { type: 'error' }); return false; }
      pinned = { url, mode: mode || pinned?.mode || 'onion', opacity: pinned?.opacity ?? 0.5, split: pinned?.split ?? 0.5 };
      onionImg.src = url;
      placeOnion();
      toast('Frame pinned: change something and compare · ◐ onion → wipe → off', { timeout: 2200 });
      return true;
    }
    function setCompare(mode) {
      if (mode === 'off' || !mode) { pinned = null; paintOnion(); return 'off'; }
      if (!pinned) { pinFrame({ mode }); return mode; }
      pinned.mode = mode; paintOnion(); return mode;
    }
    function cycleCompare() { if (!pinned) pinFrame(); else setCompare(pinned.mode === 'onion' ? 'wipe' : pinned.mode === 'wipe' ? 'diff' : 'off'); }
    function compareMenu(...a) { return labPart(K, 'capture', 'compareMenu', a); } // tools/three-lab-capture.js
    wipeBar.addEventListener('pointerdown', (e) => {
      wipeBar.setPointerCapture(e.pointerId);
      const move = (ev) => { const r0 = onion.getBoundingClientRect(); pinned.split = Math.max(0, Math.min(1, (ev.clientX - r0.left) / r0.width)); paintOnion(); };
      wipeBar.addEventListener('pointermove', move);
      wipeBar.addEventListener('pointerup', () => wipeBar.removeEventListener('pointermove', move), { once: true });
    });
    // 📷 Still: the frame at its exact output size (1080×1920…) as a PNG named after the sketch and size.
    // Shift+click copies it; right-click picks one of the four sizes (the preview switches, shoots, comes back).
    const stillBtn = el('button', { class: 'stage-btn', text: '📷', title: 'Still: save this frame as a PNG at the exact frame size · Shift+click: copy it · right-click: a still at 9:16 / 16:9 / 4:5 / 1:1', dataset: { feature: 'Still' } });
    stillBtn.addEventListener('click', (e) => still({ copy: e.shiftKey }));
    stillBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); stillMenu(e); });
    function stillMenu(...a) { return labPart(K, 'dialogs', 'stillMenu', a); } // tools/three-lab-dialogs.js
    function still(...a) { return labPart(K, 'capture', 'still', a); } // tools/three-lab-capture.js
    function framesToDirector(...a) { return labPart(K, 'capture', 'framesToDirector', a); } // tools/three-lab-capture.js
    function stillsFolder(...a) { return labPart(K, 'capture', 'stillsFolder', a); } // tools/three-lab-capture.js
    const pngBytes = (url) => Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
    // a data URL as a Blob without fetch() (the page's CSP blocks fetching data: URLs, so copying a still failed)
    function pngBlob(url) { return new Blob([pngBytes(url)], { type: 'image/png' }); }
    const safeName = (x) => String(x).replace(/[\\/:*?"<>|]/g, '_');
    function stillsAt(...a) { return labPart(K, 'capture', 'stillsAt', a); } // tools/three-lab-capture.js
    // the preview's own ⋯: guides, safe zones, stage, fps, present
    const previewMoreBtn = el('button', { class: 'stage-btn', text: '⋯', title: 'Guides, safe zones, Stage window, frame rate, present', dataset: { feature: 'Preview more' }, on: { click: (e) => { const r0 = e.currentTarget.getBoundingClientRect(); Promise.resolve(previewMenu()).then((rows) => ThreeTweaks.menu(r0.right - 280, r0.bottom + 4, rows)); } } });
    function previewMenu(...a) { return labPart(K, 'dialogs', 'previewMenu', a); } // tools/three-lab-dialogs.js
    let restartNext = false;
    function restartSim() {
      if (player.recording) { toast('Stop the recording first', { type: 'error' }); return; }
      restartNext = true;
      toast('Restarting the simulation from scratch', { timeout: 1400 });
      if (!run()) restartNext = false;
    }
    // When the preview stops answering (or loses its GPU), a banner offers the restart.
    let lastStatsAt = 0;
    const stall = el('div', { class: 'three-stall', hidden: true }, el('span', { class: 'three-stall-text' }),
      el('button', { class: 'primary small', text: '⟲ Restart', title: 'Restart the simulation from scratch', on: { click: () => restartSim() } }),
      el('button', { class: 'ghost small', text: '×', title: 'Hide', on: { click: () => hideStall() } }));
    function showStall(text) { stall.querySelector('.three-stall-text').textContent = text; stall.hidden = false; }
    function hideStall() { stall.hidden = true; }
    // (round 43, glrecover) the GPU took the preview's WebGL contexts. The page keeps the scene and rebuilds its layers
    // when they come back ('gpu-restored', in place: the song plays on at its place, sliders, camera views and undo as
    // they were); none back within a few seconds: sandboxFrame makes the page again and run({ again, quiet }) runs the
    // scene in it (the song re-sent at its place; nothing saved: no history snapshot, no thumbnail). No banner while it
    // works itself out; one calm note after (glrecover.js). The banner only when even a new page can't draw.
    const glp = { phase: null, at: 0, stuck: 0, waits: [], log: [], runaway: [] }; // (round 109) runaway: the page's frame-runaway notes
    const glEvent = (state, how = null) => { glp.log.push({ state, how, at: Date.now() }); if (glp.log.length > 20) glp.log.shift(); dispatchEvent(new CustomEvent('hearth:lab-gl', { detail: { state, how } })); };
    function glPreview(msg) {
      if (msg.type === 'gpu-lost') {
        if (glp.phase) return;
        glp.phase = 'lost'; glp.at = Date.now(); glp.stuck = 0;
        window.Jank?.gpu('The Lab preview');
        glEvent('lost');
      } else if (msg.type === 'gpu-restored') {
        if (msg.reload) return; // (not a sketch page: it loads again by itself)
        glBack('in place');
      } else if (msg.type === 'gpu-stuck') {
        if (!msg.crashed) glp.stuck += 1; else glp.at = Date.now(); // (round 50, crashsafe) the page's process crashed: not the GPU
        glp.phase = 'remaking';
        glEvent('remaking');
        if (player.recording || glp.stuck > 1) showStall('The graphics card isn\u2019t drawing the preview right now.');
      }
    }
    function glBack(how) {
      if (!glp.phase) return;
      glp.phase = null;
      if (/graphics card/.test(stall.querySelector('.three-stall-text').textContent)) hideStall();
      glEvent('restored', how);
      window.GLRecover?.labBack?.({ how, ms: Date.now() - glp.at });
      for (const fn of glp.waits.splice(0)) fn(true);
    }
    // a picture asked for while the GPU is away waits for it (≤ ms): 🎲 variations, ◧ before / after, the director
    const glWait = (ms = 8000) => (!glp.phase ? Promise.resolve(true) : new Promise((r) => { glp.waits.push(r); setTimeout(() => r(false), ms); }));
    api.gl = { wait: glWait, state: () => ({ phase: glp.phase, since: glp.phase ? glp.at : 0, stuck: glp.stuck, log: glp.log.slice(), box: box.gl, runaway: glp.runaway.slice() }) };
    previewHost.append(stall);
    // (round 147, safeopen147) what Safe open needs from the Lab (tools/three-safeopen.js)
    api.safe = {
      host: previewHost, box, sceneId: () => current?.id || null, sceneName: () => current?.name || '',
      layers: () => layersOf().map((L) => ({ id: L.id, name: L.name || 'Layer' })),
      run: (o) => run({ quiet: true, ...o }), resend: () => { sendQuality(); box.send(speedMsg()); },
      glDone: () => glBack('safe open'), // (the preview made again for Safe open drew: the graphics card's wait ends)
      watching: () => Boolean(box.ready && !box.onStage && !parkedNow && !player.recording && document.visibilityState === 'visible' && previewHost.offsetParent),
      unstick: () => (window.hub?.crashsafe?.unstick ? window.hub.crashsafe.unstick(box.n).catch(() => false) : Promise.resolve(false)),
    };
    api.healthHost = { host: previewHost, send: (m) => box.send(m), sceneId: () => current?.id || null }; // (round 80, laberrors80) a paused layer's note + ▶ Resume
    // (round 38, inputlatency) the safety check runs when the window is idle: it asks the page whether the preview is on
    // screen (a style and layout of the whole Lab), and on a timer it landed in the middle of slider drags and scrubs,
    // holding up the next pointer move
    const idleCheck = () => {
      syncPark();
      if (!lastStatsAt || !stall.hidden) return;
      if (parkedNow) { lastStatsAt = Math.max(lastStatsAt, Date.now() - 2000); return; } // (parked, e.g. behind a baked show: nothing to watch; round 52)
      const visible = document.visibilityState === 'visible' && (box.onStage || previewHost.offsetParent);
      if (!visible) { lastStatsAt = Math.max(lastStatsAt, Date.now() - 2000); return; } // hidden views draw nothing
      if (Date.now() - lastStatsAt > 8000) showStall('The preview stopped responding.');
    };
    let idleAsked = false;
    const stallTick = () => {
      window.LabSafe?.tick?.(); // (round 147, safeopen147) a page that stopped answering while it should draw
      if (typeof requestIdleCallback !== 'function') { idleCheck(); return; }
      if (idleAsked) return;
      idleAsked = true;
      // (round 57, lab240edit) no idle moment for 1.5 s (a drag, a splitter, a scrub): asked right after the coming
      // frame instead, when the page's style is fresh. On the timeout it landed mid-drag and styled the whole Lab first.
      // (a frame that doesn't come, an occluded window: 300 ms at most)
      const go = () => { if (!idleAsked) return; idleAsked = false; idleCheck(); };
      requestIdleCallback((dl) => { if (dl?.didTimeout && document.visibilityState === 'visible') { requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 300); return; } go(); }, { timeout: 1500 });
    };
    // (round 39, powerwise) only while Hearth is on screen (a hidden window's preview draws nothing to watch), and every
    // 10 s while the Lab is parked behind a chat (then it only makes sure a park can't stick; the view events come first)
    if (window.Power) { stallArm = (parked) => Power.every('lab-stall', parked ? 10000 : 4000, stallTick, { hidden: 'skip', battery: false }); stallArm(parkedNow); } else setInterval(stallTick, 2000);
    // How a change reaches the preview (round 6 "live": no whole-page reloads for edits):
    //   hot     one layer re-runs in place (its old picture cross-fades into the new one; a new layer wipes in)
    //   sync    only the layers whose code changed re-run, removed ones fade out, the others just get their props
    //           (a jam round, an undo, a backstage edit, sliders attached / detached)
    //   (none)  every layer runs again from the start, in the same page (another sketch, ▶ Run): the old picture
    //           cross-fades into the new one, three.js stays loaded, the music and live sound go on
    //   reload  a new page, only for what needs one: another three.js version or pixel ratio (exact frame sizes),
    //           the Stage window, ⟲ Restart from scratch, a page that isn't up. It keeps a picture of the scene on screen
    //           and cross-fades once the new page has drawn (sandboxFrame `pretty`).
    // again: the page restarted by itself and is up but empty: everything runs as on a new page, without loading another
    // quiet (round 43, glrecover): the same scene made again after the GPU went away: no history snapshot, no time
    // machine version, no thumbnail, no "ran" event (nothing changed, nothing is saved)
    function run({ hot = false, layer = null, sync = false, reload = false, again = false, quiet = false } = {}) {
      if (!current || workspaceReleased) return false;
      if (window.LabWinHost?.holds(current.id)) return false; // (round 153c, labwin153) open in the Lab window: never a second preview of it here
      workspaceDrawn = null;
      // (round 37, labboot) only the pixel ratio changed (a fit scene ⇄ one with its own frame size): the page switches
      // in place and every layer runs again in it, over the old picture, instead of a new page
      const seqKeeps = typeof ThreeSeq !== 'undefined' && ThreeSeq.keep(current.id);
      if (!again && !reload && !restartNext && !seqKeeps && !player.recording && box.ready && ranOnce && box.stale && box.retune()) { hot = false; sync = false; }
      const up = !again && box.ready && ranOnce && !box.stale && !restartNext && !reload;
      // the Sequence view owns the preview: the sketch's changes reach the clips that use it; a page that has to be
      // replaced (a new frame size, a restart) is, and the sequence goes back on it ('ready')
      if (typeof ThreeSeq !== 'undefined' && ThreeSeq.keep(current.id)) {
        if (!up) { if (!again && (!box.loading || box.stale || restartNext || reload)) box.reload(restartNext); restartNext = false; ranOnce = true; player.attach({ playing: false }); box.send(capMsg()); }
        ThreeSeq.sketchChanged(current.id);
        return true;
      }
      if ((hot || sync) && !up) { hot = false; sync = false; }
      if (player.recording) {
        // A rebuild would end the recording; it waits until the video is saved.
        if (hot || sync) { if (!rebuildWaiting) toast('That change rebuilds the scene: it applies when you stop recording', { timeout: 2500 }); rebuildWaiting = true; return false; }
        toast('Stop the recording first', { type: 'error' });
        return false;
      }
      if (!quiet) snapshot();
      // (round 147, safeopen147) a scene opening is noted (its crash marker), and Safe open's held layers stay out of the preview
      if (!hot && !sync) window.LabSafe?.opening?.(current, { again, fresh: !up });
      const held = window.LabSafe?.held?.(current.id) || null;
      const shown = held?.size ? layersOf().filter((L) => !held.has(L.id)) : layersOf();
      window.LabShader?.beforeRun?.(layersOf(), sel(), editor); // (round 23) ◇ shader layers: their sliders follow their uniforms
      if (!quiet) window.ThreeHistory?.changed?.('run'); // (round 23) a version for the time machine (tools/three-history.js)
      const target = hot ? layerById(layer || selId) : null;
      if (hot && !target) hot = false;
      // every layer's sliders go into one table, each layer at its own offset
      const values = {}; const keys = {}; const preps = new Map();
      for (const L of layersOf()) {
        const p = ctlFor(L).prepare(L.code, baseOf(L));
        preps.set(L.id, p);
        if (!p) { delete layerMods[L.id]; continue; }
        const b = baseOf(L);
        p.values.forEach((v, i) => { values[b + i] = v; });
        for (const [k, i] of Object.entries(p.keys)) keys[`${L.id}|${k}`] = b + i;
        layerMods[L.id] = Object.fromEntries(Object.entries(p.mods || {}).map(([i, m]) => [Number(i) + b, m]));
      }
      const codeOf = (L) => preps.get(L.id)?.code ?? L.code;
      // sync: which layers actually need to run again
      const rerun = (sync ? layersOf().filter((L) => ranCode.get(L.id) !== codeOf(L)) : hot ? [target] : layersOf()).filter((L) => !held?.has(L.id));
      const gone = sync ? [...ranCode.keys()].filter((id) => !layerById(id)) : [];
      const fresh = !hot && !sync && !up; // a new page
      const partial = hot || sync;
      if (partial) {
        const ids = new Set(rerun.map((L) => L.id));
        consoleLines = consoleLines.filter((l) => l.layer && ![...ids].some((id) => layerById(id)?.name === l.layer));
        errors = errors.filter((e) => e.layer && !ids.has(e.layer) && layerById(e.layer));
      } else { consoleLines = []; errors = []; }
      editor.setErrorLines(errors.filter((e) => e.layer === selId).map((e) => e.line).filter(Boolean));
      consoleBox.replaceChildren();
      unseen = { errors: 0, other: 0 };
      syncConsole();
      if (!partial) { lastStats = null; lastStatsAt = 0; hideStall(); }
      if (fresh) { stats.hidden = true; if (!again && (!box.loading || box.stale || restartNext || reload)) box.reload(restartNext); restartNext = false; }
      // (round 37, labboot) a warmed page that already drew a run of this scene: the run swaps in over that picture,
      // on the contexts and compiled shaders it left (tools/three-boot.js)
      const warmOf = fresh ? box.takeWarmRun() : false;
      const overWarm = Boolean(warmOf);
      sendQuality(); // (round 142, smooth142) the scene's quality choice (Smooth · Balanced · Force high)
      box.send(speedMsg()); // (round 133, speed133) ⚡ the scene's preview speed settings, before its layers make their renderers
      box.send({ type: 'tweak-init', values, keys, mods: mergedMods() });
      if (fresh) { player.attach(); sendRefs({ fresh: true }); } else if (!partial && ranSketch !== current.id) { sendRefs(); sendTriggers(); }
      if (!fresh && !partial && !player.path) box.send({ type: 'media-unload' }); // a sketch without a song: the last one stops
      const valuesOf = (L) => { const p = preps.get(L.id); if (!p) return undefined; const b = baseOf(L); return Object.fromEntries(p.values.map((v, i) => [b + i, v])); };
      // (a precomp: another scene as this layer, tools/three-comp.js: its scene's layers come with it)
      const pcOf = (L) => (L.precomp && typeof ThreeComp !== 'undefined' ? ThreeComp.specFor(L, current.id, layersOf().indexOf(L)) : null);
      const spec = (L) => { const pc = pcOf(L); return { id: L.id, code: codeOf(L), values: valuesOf(L), ...layerProps(L), ...(pc ? { precomp: pc } : {}) }; };
      // new code fades in over the old picture; a layer the sandbox doesn't run yet wipes in
      const fx = (L) => (ranCode.has(L.id) ? 'xfade' : 'reveal');
      if (partial) {
        for (const id of gone) { box.send({ type: 'remove-layer', id, fade: true }); ranCode.delete(id); }
        for (const L of shown) if (!rerun.includes(L)) box.send({ type: 'layer-props', id: L.id, props: layerProps(L) });
        for (const L of rerun) { box.send({ type: 'hot-layer', layer: { ...spec(L), fx: fx(L) } }); building(L.id, true); }
      } else {
        // (a warm run of another scene than this one, e.g. the chat on screen owns another: no cross-fade from it, as on a new page)
        // (round 73) a project opening swaps without the old picture: it lay under the opaque loading card, and taking it
        // read back every layer of the scene left (a few ms on a GPU, ≈ 0.1–0.4 s in software GL), in front of the new scene
        box.send(fresh && !overWarm ? { type: 'run-layers', layers: shown.map(spec) } : { type: 'swap-layers', layers: shown.map(spec), fx: plainSwap ? '' : !overWarm || warmOf === current.id ? 'xfade' : '' });
        plainSwap = false;
        for (const id of [...builds.keys()]) if (!layerById(id)) building(id, false);
        for (const L of shown) building(L.id, true);
      }
      if (!partial) { ranCode.clear(); ranRaw.clear(); }
      for (const L of rerun) { ranCode.set(L.id, codeOf(L)); ranRaw.set(L.id, L.code); }
      for (const id of gone) ranRaw.delete(id);
      ranSketch = current.id;
      if (!partial && !box.onStage && !quiet) window.LabBoot?.ran(current.id, box.query); // (round 37) the query to warm a page with next time
      if (editOn && !partial && sel()) box.send({ type: 'edit', cmd: 'on', layer: sel().id });
      if (fresh) box.send(capMsg());
      if (fresh) box.hold(false); // (round 74) a page preloaded at a project's click: its 'ready' now, with this scene's runs waiting
      ranOnce = true;
      if (!partial && !quiet && !held) scheduleThumb(); // (round 147: never a picture of a scene with layers held back)
      if (!quiet) dispatchEvent(new CustomEvent('hearth:lab-ran', { detail: { id: current.id, partial } })); // (round 34) 🩺 the blank-frame hint (tools/three-doctor-hook.js)
      return true;
    }

    const save = saver(() => { // (round 29) written during long typing too, and on leaving
      if (!kvOk.has('three-sketches')) return null; // (round 43) not before your scenes were read for sure
      const removed = [...removedIds]; removedIds.clear();
      // the store kept scenes this save would have dropped (sync, a list out of date): they join the list on screen
      const list = window.LabTry ? LabTry.disk(sketches) : sketches; // (round 43, directorpreview) an edit tried first isn't saved until Keep
      return window.hub.kvSet('three-sketches', list, removed.length ? { removed } : undefined).then((r) => { if (r?.error) throw Error(r.error); if (r?.restored?.length) { refreshFromDisk().catch(() => {}); window.LabSceneSafe?.kept?.(r.restored.length); } dispatchEvent(new CustomEvent('hearth:scene-saved', { detail: { id: current?.id } })); });
    }, 600);
    function persist() {
      if (!current) return;
      const L = sel();
      if (L) L.code = editor.value;
      current.code = layersOf()[0]?.code ?? editor.value;
      current.updatedAt = Date.now();
      save();
    }
    // ---------- sketch browser ----------
    // A grid of every sketch with a thumbnail taken automatically a few seconds after it runs (kv 'three-thumbs').
    let thumbs = {};
    const saveThumbs = debounce(() => { if (kvOk.has('three-thumbs')) window.hub.kvSet('three-thumbs', thumbs); }, 800);
    let thumbTimer = 0;
    let thumbShot = null;
    // (round 88, labsync88) a picture is saved (and sent to the other computer, the whole three-thumbs.json) only when it
    // looks different from the one kept: a 64-bit difference hash of it made tiny (scenesafe-core.js thumbHash), kept with
    // it as h. A scene that runs again with the same look — the same frame, or its animation a moment later — saves nothing.
    async function hashOfThumb(src) {
      try {
        let img = src;
        if (typeof src === 'string') { img = new Image(); img.src = src; await img.decode(); }
        const c = document.createElement('canvas'); c.width = 9; c.height = 8;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 9, 8);
        const d = g.getImageData(0, 0, 9, 8).data; const gray = new Array(72);
        for (let i = 0; i < 72; i++) gray[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
        return SceneSafeCore.thumbHash(gray);
      } catch { return null; }
    }
    async function keepThumb(id, url, img) {
      const h = await hashOfThumb(img || url);
      const old = thumbs[id];
      if (old?.url && !old.h && h) old.h = await hashOfThumb(old.url); // (a picture kept before this round: its hash, in memory)
      if (old?.url === url || (h && !SceneSafeCore.thumbChanged(old, h))) { if (old) old.at = Date.now(); thumbStats.same += 1; return false; } // (not taken again for 3 min; nothing written)
      thumbs[id] = { url, at: Date.now(), ...(h ? { h } : {}) };
      thumbStats.saved += 1;
      saveThumbs();
      return true;
    }
    const thumbStats = { saved: 0, same: 0 };
    function scheduleThumb() {
      clearTimeout(thumbTimer);
      const id = current?.id;
      if (!id || (thumbs[id] && Date.now() - thumbs[id].at < 3 * 60000)) return;
      thumbTimer = setTimeout(() => {
        // (the Lab sequence's program on screen isn't this sketch's picture)
        if (current?.id !== id || pendingShot || thumbShot || errors.length || (typeof ThreeSeq !== 'undefined' && ThreeSeq.active)) return;
        thumbShot = async (url, small) => {
          if (!url || (typeof ThreeSeq !== 'undefined' && ThreeSeq.active)) return;
          if (small) { await keepThumb(id, url, null); return; } // (already a small JPEG)
          const img = new Image(); img.src = url;
          try { await img.decode(); } catch { return; }
          const c = document.createElement('canvas'); const sc = Math.min(1, 360 / Math.max(img.width, img.height));
          c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height); // (round 54) in memory, encoded off the main thread (no wait for the GPU)
          const small2 = typeof canvasDataUrl === 'function' ? await canvasDataUrl(c, 'image/jpeg', 0.75) : c.toDataURL('image/jpeg', 0.75);
          await keepThumb(id, small2, img);
        };
        // (round 16: when the page is idle, and the preview makes it small and encodes it off its frames)
        const ask = () => box.send({ type: 'screenshot', tag: 'thumb', max: 360 });
        if (typeof requestIdleCallback === 'function') requestIdleCallback(ask, { timeout: 2000 }); else ask();
      }, 3500);
    }
    const browseBtn = btn('▦', 'All your sketches as pictures', () => browseSketches());
    function browseSketches(...a) { return labPart(K, 'dialogs', 'browseSketches', a); } // tools/three-lab-dialogs.js
    let pickerSig = '';
    // (round 86, projopen86) several scenes added in a row (a project import / Duplicate): one picker draw after them
    let pickerTimer = 0;
    function pickerSoon() { if (!pickerTimer) pickerTimer = setTimeout(() => { pickerTimer = 0; renderPicker(); }, 0); }
    function renderPicker() {
      if (pickerTimer) { clearTimeout(pickerTimer); pickerTimer = 0; }
      // ★ pinned ones (pin them in the sketch browser) first, then the most recent
      const pins = new Set(store.get('three.sketchPins', []));
      const list = [...sketches].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt);
      const mark = (id) => (typeof ChatScenes !== 'undefined' ? ChatScenes.glyphFor(id) : ''); // the chat that owns it (chat-scenes.js)
      const texts = list.map((s) => `${pins.has(s.id) ? '★ ' : ''}${mark(s.id) ? `${mark(s.id)} ` : ''}${s.name}`);
      // (round 21) the same list as last time (a scene switch): only the selection moves, no new options
      // (round 23) scenes of a project under its name (projects.js), the others after
      const pj = window.Lazy && !window.Lazy.loaded('projects') ? null : window.Projects;
      const groups = pj?.sketchGroups?.(list.map((s) => s.id)) || null;
      const sig = list.map((s, i) => `${s.id}\u0001${texts[i]}`).join('\u0002') + (groups ? JSON.stringify(groups) : '');
      const opt = (i) => el('option', { value: list[i].id, text: texts[i], selected: list[i].id === current?.id });
      const at = groups && new Map(list.map((s, i) => [s.id, i]));
      if (sig !== pickerSig) { pickerSig = sig; picker.replaceChildren(...(groups ? groups.map((g) => el('optgroup', { label: g.label }, ...g.ids.map((id) => opt(at.get(id))))) : list.map((s, i) => opt(i)))); } else if (current && picker.value !== current.id) picker.value = current.id;
      const title = `Your sketches (${sketches.length}) · O opens them as pictures · ★ pinned ones first`;
      if (picker.title !== title) picker.title = title;
    }
    // opts.by: who switched ('scene' = chat-scenes.js following the chat on screen); fires 'hearth:sketch'
    function openSketch(id, opts = {}) {
      if (kvOk.has('three-history')) loadHist(id).catch(() => {}); // (round 88) its versions (kv/three-hv-<scene>.json)
      plainSwap = opts.by === 'project' || window.ProjectWorkspace?.state?.().phase === 'opening'; // (round 73, see plainSwap)
      workspaceReleased = false; pageKept = false; REST.by = false; // (round 154, mem154)
      // unsaved slider values in any layer of the sketch you leave
      const left = current;
      const pendings = left ? [...controllers.entries()].map(([lid, c]) => ({ lid, p: c.pending() })).filter((x) => x.p) : [];
      if (left && left.id !== id && pendings.length) {
        toast(`Slider changes to "${left.name}" weren't saved`, { timeout: 8000, action: { label: 'Save them', fn: () => {
          for (const { lid, p } of pendings) {
            const L = left.layers?.find((x) => x.id === lid);
            if (!L || L.code !== p.from) continue;
            const key = lid === 'main' ? left.id : `${left.id}:${lid}`;
            (history[key] ||= []).unshift({ at: Date.now(), code: L.code });
            L.code = p.to;
          }
          saveHistory(left.id); // (round 88) this scene's file only
          left.code = left.layers?.[0]?.code ?? left.code;
          left.updatedAt = Date.now();
          save();
          if (current === left) { editor.setValue(sel().code); run({ sync: true }); }
          toast(`Saved into "${left.name}"`);
        } } });
      }
      for (const c of controllers.values()) c.destroy?.();
      controllers.clear();
      for (const k of Object.keys(layerMods)) delete layerMods[k];
      rememberMedia();
      // (the Lab sequence on screen keeps its own shape and song: the scenes' come back when it closes)
      const seqOn = typeof ThreeSeq !== 'undefined' && ThreeSeq.active;
      if (left && stage && !seqOn) { (extras[left.id] ||= {}).frame = stage.sizeId ?? stage.size.id; saveExtras(); } // (round 86, projopen86: sizeId, no layout)
      current = sketches.find((s) => s.id === id) || sketches[0];
      materialize(current);
      // This sketch's frame size and song (with where it was in the song).
      const ex = extras[current.id] || {};
      if (ex.frame && !seqOn) stage.setMode(ex.frame, { silent: true });
      if (!seqOn) sceneMedia(current.id); // its song, else its own timeline (the sequence's song stays while it shows)
      store.set('three.current', current.id);
      selId = layerById(ex.selectedLayer)?.id || layersOf()[layersOf().length - 1].id;
      editor.setValue(sel().code);
      tweaksSlot.replaceChildren(ctlFor(sel()).el); ctlFor(sel()).showUI();
      renderPicker();
      renderLayers();
      renderNotes({ soon: true });
      renderRefsBtn();
      renderPalette();
      // (round 48, labstartfast) a scene whose code uses its references runs once, with them: their bytes are read
      // first (a few ms from disk; the old picture stays meanwhile). It used to run without them (errors, no picture or
      // model), then again once they came: every layer built and every shader compiled twice. A read slower than
      // 1.5 s (a huge video on a slow drive) doesn't hold the scene back: it runs, and again with the files, as before.
      const usesRefs = () => layersOf().some((L) => /\brefs\b|refTexture/.test(L.code));
      const want = current;
      const reading = loadRefBytes();
      if (usesRefs() && refsOf().some((r) => !refReady(r))) {
        const token = refsHold = {};
        let ran = false;
        const go = () => { if (ran || refsHold !== token) return; ran = true; refsHold = null; if (current === want) run(); };
        reading.then(go, go);
        setTimeout(() => { if (ran || refsHold !== token) return; go(); reading.then((added) => { if (added && current === want && usesRefs()) run(); }).catch(() => {}); }, 1500);
      } else {
        refsHold = null;
        run();
        reading.then((added) => { if (added && current === want && usesRefs()) run(); }).catch(() => {});
      }
      dispatchEvent(new CustomEvent('hearth:sketch', { detail: { id: current.id, from: left?.id || null, by: opts.by || 'user' } }));
    }
    // The sketch on screen changed as data (a jam round, a backstage edit, an undo of several layers): the editor,
    // sliders and layer list follow, and only the layers whose code changed run again (in place).
    function refreshInPlace(want = null) {
      if (!current) return;
      materialize(current);
      for (const [lid, c] of controllers) if (!layerById(lid)) { c.destroy?.(); controllers.delete(lid); delete layerMods[lid]; }
      selId = layerById(want)?.id || layerById(selId)?.id || layerById(extras[current.id]?.selectedLayer)?.id || layersOf()[layersOf().length - 1].id;
      editor.setValue(sel().code);
      tweaksSlot.replaceChildren(ctlFor(sel()).el); ctlFor(sel()).showUI();
      renderLayers();
      run({ sync: true });
    }
    function create(name, code, layers, { timeline = null } = {}) {
      const s = { id: `s${Date.now()}`, name, code, updatedAt: Date.now(), ...(layers ? { layers: JSON.parse(JSON.stringify(layers)) } : {}) };
      sketches.push(s);
      if (timeline) { (extras[s.id] ||= {}).timeline = { len: timeline.len, fps: timeline.fps || 30 }; saveExtras(); }
      save();
      openSketch(s.id);
      return s;
    }
    async function renameSketch() {
      const name = await Modal.prompt('Rename sketch', { value: current.name });
      if (name) { current.name = name.trim(); save(); renderPicker(); }
    }
    function duplicate() { persist(); const from = current.id; const tl = extras[from]?.timeline; const s = create(`${current.name} copy`, current.code, current.layers, { timeline: tl }); if (tl) player.copyMap(clockPath(from), clockPath(s.id)).then((ok) => { if (ok && current === s) { player.unload({ silent: true }); sceneMedia(s.id); } }).catch(() => {}); if (typeof ThreeSeq !== 'undefined') ThreeSeq.sceneCopied(from, s.id).catch(() => {}); }
    function removeSketch(...a) { return labPart(K, 'dialogs', 'removeSketch', a); } // tools/three-lab-dialogs.js
    function templateGallery(...a) { return labPart(K, 'dialogs', 'templateGallery', a); } // tools/three-lab-dialogs.js
    function exportHtml(...a) { return labPart(K, 'dialogs', 'exportHtml', a); } // tools/three-lab-dialogs.js
    function askAbout(...a) { return labPart(K, 'dialogs', 'askAbout', a); } // tools/three-lab-dialogs.js

    picker.addEventListener('change', () => openSketch(picker.value));
    picker.addEventListener('contextmenu', (e) => { e.preventDefault(); pickerMenu(e); });
    function pickerMenu(...a) { return labPart(K, 'dialogs', 'pickerMenu', a); } // tools/three-lab-dialogs.js
    autoBox.addEventListener('change', () => { autoRun = autoBox.checked; store.set('three.autorun', autoRun); });
    version.addEventListener('change', () => { store.set('three.version', version.value); run(); });
    snippetSel.addEventListener('change', () => {
      const s = ThreeData.SNIPPETS[Number(snippetSel.value)];
      if (s) editor.insertAtCursor(s.code);
      snippetSel.value = '';
    });

    (async () => {
      // (round 37, labboot) the six reads at once: one IPC round trip's wait instead of six in a row
      // (round 43, scenesafe) each read says whether it worked: a store that couldn't be read is retried and never
      // saved over (tools/three-scenesafe.js); scenes made before the read finished (a chat's starter) are kept
      const SSafe = window.LabSceneSafe;
      const kv = (k, d) => (SSafe ? SSafe.read(k, d) : window.hub.kvGet(k, d).then((value) => ({ ok: true, state: 'ok', value })));
      const early = sketches;
      // (round 112, labopen112) the preview page starts loading now, beside these reads, instead of after them: it was
      // ≈ 0.1 s of a first open spent waiting (the reads, the toolbar, a painted frame, the sliders read) before the page
      // (≈ 0.4 s of its own start: a new process, 1.1 MB of page, three.js) even began. Its 'ready' is held until the
      // first run (as a project's preload, round 74). Not when a warm page is waiting to be taken (tools/three-boot.js):
      // that one shows its picture at once. A page loaded for another frame size than the scene wants is loaded again
      // by the run, as before. localStorage 'labopen.early' = '0': the old order (A/B)
      { let off = false; try { off = localStorage.getItem('labopen.early') === '0'; } catch { /* no storage */ }
        if (!off && !box.warm && !box.loading && !box.ready && !box.onStage && !current) { box.reload(); box.hold(true); } }
      // (round 48, labstartfast) the scene's own four first; the versions and the pictures (the two biggest: 40 versions
      // of every layer, a picture per scene, megabytes to copy into the window) after the first frame is on its way:
      // nothing on screen needs them (see laterReads)
      const reads = await Promise.all([kv('three-sketches', []), kv('three-lab-extras', {}), kv('three-notes', {}), kv('three-refs', {})]);
      const names = ['three-sketches', 'three-lab-extras', 'three-notes', 'three-refs'];
      reads.forEach((r, i) => { if (r.ok) kvOk.add(names[i]); });
      const val = (r, d) => (r.ok && r.value != null && typeof r.value === 'object' ? r.value : d);
      const scenesRead = reads[0];
      sketches = Array.isArray(scenesRead.value) && scenesRead.ok ? scenesRead.value : [];
      for (const x of early) if (!sketches.some((y) => y.id === x.id)) sketches.push(x);
      extras = val(reads[1], {}); notesAll = val(reads[2], {}); refsAll = val(reads[3], {});
      extrasLoaded = true;
      laterRead = laterReads(kv, val);
      // The toolbar in labeled groups: what you see, the sketch, its code, its assets, capture.
      const group = (cat, ...nodes) => el('span', { class: 'tb-group', dataset: { cat } }, ...nodes);
      // One row, in the order of your workflow: your sketch and Run, then what you look at, then assets. The
      // controls you never touched (Focus, snippets, three.js version, the toolbar 📷) are in ⋯ (they still work).
      toolbar.replaceChildren(
        // round 4: New, ▦ and ⟲ moved into Sketch ▾ (Ctrl+Shift+Enter still restarts)
        group('Sketch', picker, sketchMenuBtn, runBtn),
        group('View', ...LabCalmBar([[slidersBtn, '⚡', 'Sliders'], [codeBtn, '</>', 'Code'], [consoleBtn, '›_', 'Console'], [editBtn, '✥', 'Edit'], [presentBtn, '▣', 'Present'], [playBtn, '▶', 'Play']])),
        group('Code', liveLabel),
        el('span', { class: 'spacer' }),
        group('Assets', paletteBox, projLookBox, refsBtn, stageBtn, ...(typeof LabSearchHook !== 'undefined' ? [LabSearchHook.button()] : []), liteTag, labMoreBtn)); // (round 36) 🔎 Lab search (tools/three-search-hook.js)
      { const row = player.el.querySelector('.mb-main'); row.querySelector('.mb-g-capture').append(noteBtn, notesBtn, sheetBtn); row.querySelector('.mb-g-live').append(writeBtn, midiBtn); row.querySelector('.tb-group[data-cat="Beat"]').after(el('span', { class: 'tb-group mb-g-sound', dataset: { cat: 'Sound' } }, liveBtn, trigBtn, trigPresetBtn, autoBarsBtn, npBox)); for (const n of [notesBtn, sheetBtn, writeBtn, midiBtn]) n.classList.add('mb-adv'); const rec = row.querySelector('.mb-g-live .mb-rec'); if (rec) { row.querySelector('.mb-g-capture').prepend(rec); rec.classList.add('mb-adv'); } row.querySelector('.mb-g-live').classList.add('mb-adv'); }
      window.LabRegroup?.apply({ toolbar, bar: player.el, preview: previewHost, media: player }); // (round 148, look148: + the instrument headers) (round 143, lab143) ⚙ Inspect ▾ · ♩ Beat ▾ · ⚡ Sync ▾: folds holding the real controls (tools/three-regroup.js)
      window.LabHudStage?.apply({ preview: previewHost, frame: () => box.frame, send: (m) => box.send(m), ready: () => box.ready, media: player, frozen: () => frozenNow }); // (round 150, stage150) the stage around the preview: controls out of the way until wanted, the mono HUD frame that follows the scene and the song (tools/three-hudstage.js)
      // First run with per-sketch songs: the song that was loaded goes to the sketch that was open.
      const firstId = sketches.some((s) => s.id === store.get('three.current')) ? store.get('three.current') : sketches[0]?.id;
      const lastMedia = store.get('three.media', null);
      // (round 76, labframe76) only when no scene has a song of its own yet (a store from before per-scene songs):
      // 'three.media' is the last song loaded anywhere, so every Lab start used to hand it to an open scene that never
      // had one — the timeline then opened ≈ 0.1 s after the Lab was laid out (every canvas resized once)
      if (firstId && lastMedia && extras[firstId]?.media === undefined && !Object.values(extras).some((x) => x && 'media' in x)) { (extras[firstId] ||= {}).media = { path: lastMedia, time: 0 }; saveExtras(); }
      // the starter scene: saved only when there truly were no scenes (not when the read failed, nor when copies of
      // earlier scenes exist: then it waits on screen and the Recover card offers them)
      const fresh = !sketches.length;
      if (fresh) sketches = [{ id: `s${Date.now()}`, name: 'Basic scene', code: ThreeData.TEMPLATES[0].code, updatedAt: Date.now() }];
      if (fresh && kvOk.has('three-sketches') && !scenesRead.hold) save();
      else if (early.length && kvOk.has('three-sketches')) save();
      // the chat on screen may own another sketch (chat-scenes.js): open that one instead of the last one
      // (round 73) a project opening mounts the Lab with its own scene: the scene last open in the Lab ran first, then the
      // project's (its sliders scanned and its page loaded twice in the first open of a session)
      const hinted = startHint && sketches.some((x) => x.id === startHint) ? startHint : null; startHint = null;
      const want = hinted || (typeof ChatScenes !== 'undefined' ? ChatScenes.startSketch?.(sketches.map((x) => x.id)) : null);
      // (round 86, projopen86) the Lab's first start in two window tasks: its toolbar and lists above, a painted frame,
      // then the scene (its sliders scanned, its layers run: ≈ 60–120 ms for a big scene). It was one task of ≈ 100–
      // 350 ms. A scene opened meanwhile (a project opening asked for its own) stays: it was the one shown after anyway
      const nextPaint = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 50); });
      await nextPaint();
      // …and its layers' sliders read one layer per task (ThreeTweaks keeps each scan by its code: the run below finds
      // them read): a big scene's 6 layers were ≈ 40–60 ms of reading inside its first run
      { const first = sketches.find((x) => x.id === (want || store.get('three.current', sketches[0].id))) || sketches[0];
        for (const code of (first?.layers?.length ? first.layers.map((L) => L.code) : [first?.code])) { if (current || typeof code !== 'string' || typeof ThreeTweaks === 'undefined') break; try { ThreeTweaks.scan(code); } catch { /* read again in the run */ } await new Promise((r) => setTimeout(r, 0)); } }
      if (!current) openSketch(want || store.get('three.current', sketches[0].id), { by: hinted ? 'project' : want ? 'scene' : 'start' });
      api.director = director; // only once saved sketches are loaded, so director edits never land on a placeholder
      dispatchEvent(new Event('hearth:lab-ready'));
      SSafe?.opened?.({ read: scenesRead, fresh, others: reads.slice(1).map((r, i) => (r.ok ? null : names[i + 1])).filter(Boolean) }); // (round 43) the calm card, when needed
    })();
    // (round 48, labstartfast) the versions (History, the trash) and the scenes' pictures, read in the first idle moment
    // after the Lab's first run went out. What was made before they arrived (the first run's version, a scene deleted,
    // a picture taken) joins what was read, and is saved then. A read that failed is never saved over (round 43).
    let laterRead = null;
    async function laterReads(kv, val) {
      await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1200 }) : setTimeout(r, 300)));
      const [h, t] = await Promise.all([kv('three-history', {}), kv('three-thumbs', {})]);
      if (h.ok) {
        const hv = val(h, {});
        const disk = hv.versions && typeof hv.versions === 'object' && !Array.isArray(hv.versions) ? hv.versions : {};
        const made = trash.length; // (versions made before this read: their scene's file is written with them)
        // (round 88, labsync88) versions still in three-history.json: into their scenes' files (taken out of it once written)
        if (Object.keys(disk).length) {
          histMove = { ...disk };
          for (const sid of new Set(Object.keys(disk).map(SceneSafeCore.histSceneOf))) { SceneSafeCore.histTake(history, sid, SceneSafeCore.histJoin(SceneSafeCore.histSegOf(history, sid), SceneSafeCore.histSegOf(disk, sid))); histDirty.add(sid); }
        }
        const dt = Array.isArray(hv.trash) ? hv.trash : [];
        trash = SceneSafeCore.dedupeTrash([...trash, ...dt.filter((x) => !trash.some((y) => y.id === x.id && y.deletedAt === x.deletedAt))]); // (round 87) one entry per deleted scene
        kvOk.add('three-history');
        if (made) saveHistory(); else if (histDirty.size) saveHistoryNow();
        if (current) loadHist(current.id).catch(() => {}); // the scene on screen's versions, for History
      }
      if (t.ok) {
        const made = Object.keys(thumbs).length;
        thumbs = { ...val(t, {}), ...thumbs };
        kvOk.add('three-thumbs');
        if (made) saveThumbs();
      }
      window.LabPresets?.start().catch(() => {}); // (round 87, labsync87)
      const failed = [h.ok ? null : 'three-history', t.ok ? null : 'three-thumbs'].filter(Boolean);
      if (failed.length) console.warn('Lab: could not read', failed.join(', '), '(nothing was saved over them)');
      // (round 21) pictures of sketches that are gone (deleted and not in the trash) are let go
      // (round 43: only a few at a time, and only with every scene read: a short list must never wipe the pictures)
      if (kvOk.has('three-sketches') && kvOk.has('three-history') && kvOk.has('three-thumbs') && sketches.length) { const keep = new Set([...sketches.map((x) => x.id), ...trash.map((x) => x.id)]); const gone = Object.keys(thumbs || {}).filter((id) => !keep.has(id)); if (gone.length && gone.length <= Math.max(3, sketches.length / 4)) { for (const id of gone) delete thumbs[id]; saveThumbs(); } }
    }

    // ---------- per-chat scenes (chat-scenes.js, tools/three-backstage.js) ----------
    // The sketches as data: each director chat owns one; the backstage runs the ones that aren't on screen.
    // Scenes that arrived from the other computer (cloud sync, kv/three-sketches.json) join the ones in memory: new
    // ones are added, newer versions of the others replace them (the one on screen too, when it wasn't changed here
    // since). Without this the Lab kept its old list, and a chat whose scene was made on the other computer fell back
    // to a new starter (the orb) on its next message.
    async function refreshFromDisk() {
      await laterRead?.catch(() => {}); // (round 48: the trash says which scenes were deleted here)
      let disk;
      try { disk = await window.hub.kvGet('three-sketches', null); } catch { return { added: 0, updated: 0 }; }
      if (!Array.isArray(disk)) return { added: 0, updated: 0 };
      let added = 0; let updated = 0; let reopen = false;
      const deleted = new Set(trash.map((t) => t.id).filter(Boolean));
      let diskExtras = null;
      for (const d of disk) {
        if (!d?.id) continue;
        const mine = sketches.find((x) => x.id === d.id);
        if (!mine) {
          if (deleted.has(d.id)) continue;
          sketches.push(JSON.parse(JSON.stringify(d))); added += 1;
          diskExtras ||= await window.hub.kvGet('three-lab-extras', {}).catch(() => ({}));
          if (diskExtras?.[d.id] && !extras[d.id]) extras[d.id] = diskExtras[d.id];
        } else if ((d.updatedAt || 0) > (mine.updatedAt || 0)) {
          if (mine === current) { if (dirtyHere()) continue; reopen = true; }
          for (const k of Object.keys(mine)) delete mine[k];
          Object.assign(mine, JSON.parse(JSON.stringify(d))); updated += 1;
        }
      }
      if (added || updated) {
        renderPicker();
        if (reopen && current) openSketch(current.id, { by: 'scene' });
        dispatchEvent(new CustomEvent('hearth:lab-scenes-arrived', { detail: { added, updated } }));
      }
      return { added, updated };
    }
    // the sketch on screen has edits that aren't saved into it yet (sliders moved, code typed)
    const dirtyHere = () => { try { return Boolean(current && editor.value !== ((sel() || layersOf()[0])?.code ?? current.code)); } catch { return false; } };
    // (round 77, storeack77) the Lab's stores when the other computer's version arrives (StoreAck, storeack-core.js):
    // what changed here is written first (sync's guard merges it with what arrived), then the Lab takes what's on disk —
    // new scenes, newer ones, and scenes deleted there leave the picker — and sync is told, so a scene (or a note, a
    // reference) taken out here right after it arrived stays out. The scene on screen keeps your edit, selection and
    // scroll: it's only opened again when it changed. While an edit is being tried (Keep / Undo), or when the scene on
    // screen was deleted there, the Lab keeps what it has and sync keeps merging (nothing lost; acked next time).
    // (three-history / three-thumbs: megabytes of versions and pictures, left to sync's guard: never lost, not re-read)
    const SA = window.StoreAck && { ...window.StoreAck, hold: (...a) => { const r = window.StoreAck.hold(...a); if (r?.off) life.undo.push(() => r.off()); return r; } }; // (round 161, fix161: its holders let go on ThreeLab.drop)
    SA?.hold('three-sketches', {
      name: 'Lab scenes',
      pending: () => save.pending() || dirtyHere(), flush: () => { if (dirtyHere()) persist(); return save.flush(); },
      read: async () => { await laterRead?.catch(() => {}); return SA.kv('three-sketches', null); },
      apply: (disk) => {
        if (!kvOk.has('three-sketches')) return undefined; // not read yet: its first read is this version
        if (!Array.isArray(disk)) return false;
        const trying = window.LabTry && LabTry.disk(sketches) !== sketches;
        const deleted = new Set(trash.map((t) => t.id).filter(Boolean));
        const onDisk = new Map(disk.filter((d) => d?.id).map((d) => [d.id, d]));
        let added = 0; let updated = 0; let removed = 0; let reopen = false; let kept = trying;
        for (const d of onDisk.values()) {
          const mine = sketches.find((x) => x.id === d.id);
          if (!mine) { if (!deleted.has(d.id)) { sketches.push(JSON.parse(JSON.stringify(d))); added += 1; } continue; }
          if (JSON.stringify(mine) === JSON.stringify(d)) continue;
          if (trying && window.LabTry.holds?.(d.id)) continue;
          if (mine === current) { if (dirtyHere()) { kept = true; continue; } reopen = true; }
          for (const k of Object.keys(mine)) delete mine[k];
          Object.assign(mine, JSON.parse(JSON.stringify(d))); updated += 1;
        }
        const gone = []; // (round 87, labsync87) deleted there: into this computer's Lab trash too
        if (!trying) {
          for (const x of [...sketches]) {
            if (!x?.id || onDisk.has(x.id) || removedIds.has(x.id)) continue;
            if (x === current) { kept = true; continue; } // deleted there while it's on screen: stays here for now
            sketches.splice(sketches.indexOf(x), 1); removed += 1; gone.push(x);
          }
        }
        if (gone.length) trashArrived(gone).catch(() => {});
        if (added || updated || removed) {
          renderPicker();
          if (reopen && current) openSketch(current.id, { by: 'scene' });
          dispatchEvent(new CustomEvent('hearth:lab-scenes-arrived', { detail: { added, updated, removed } }));
        }
        return kept ? false : undefined;
      },
    });
    // (round 87, labsync87) a scene deleted on the other computer is in History → Deleted sketches here too, at once: the
    // other computer's own entry when its trash (three-history) is here already, else one made now (marked `there`, put
    // back by the real one when it arrives). The trash file is read only for such an arrival (rare; a read that fails: the
    // entry made here, nothing saved over it).
    async function trashArrived(gone) {
      let disk = null;
      if (kvOk.has('three-history')) { try { disk = (await SA.kv('three-history', null))?.trash || null; } catch { disk = null; } }
      const r = SceneSafeCore.trashArrived(trash, gone, disk);
      if (!r.changed) return;
      trash = r.trash;
      if (kvOk.has('three-history')) saveHistory();
    }
    // (round 87, labsync87) references that arrived for the scene on screen (made on the other computer): their files read
    // and sent to the preview, the scene run again when it uses them (before, they waited for the next scene switch). A
    // file not here yet (a big model still coming) is read when it lands (filewatch.js follows the new path).
    const refsLine = () => (current ? JSON.stringify((refsAll[current.id] || []).map((r) => [r.id, r.key, r.path, r.size])) : '');
    function refsArrived() {
      if (!current || workspaceReleased || !box) return;
      const want = current;
      renderRefsBtn(); if (refsDlg?.open) renderRefsDlg();
      loadRefBytes().then((added) => { if (added && current === want && !workspaceReleased && layersOf().some((L) => /\brefs\b|refTexture/.test(L.code || ''))) run({ sync: true }); }).catch(() => {});
    }
    // (a store gone or not an object: what's here stays, sync keeps merging) · storeack: holds three-lab-extras, three-notes, three-refs
    const labStore = (name, label, s, set) => SA?.hold(name, {
      name: label, saver: s, read: () => SA.kv(name, null),
      apply: (v) => { if (!kvOk.has(name)) return undefined; if (!v || typeof v !== 'object' || Array.isArray(v)) return false; set(v); return undefined; },
    });
    labStore('three-lab-extras', 'Lab scene settings', saveExtras, (v) => { extras = v; });
    labStore('three-notes', 'Lab notes', saveNotes, (v) => { notesAll = v; });
    labStore('three-refs', 'Lab references', saveRefs, (v) => { const was = refsLine(); refsAll = v; dispatchEvent(new Event('hearth:lab-refs')); if (refsLine() !== was) refsArrived(); }); // (round 87) refsArrived
    // (round 87, labsync87) the Lab presets you make (trigger presets, saved palettes) on both computers: the menus read them
    // from this window's storage (as before); kv/lab-presets.json carries them to the other computer (scenesafe-core.js
    // presetsMerge: a delete there goes here unless you changed it here; the same name made on both before they met: both
    // kept). Read in the Lab's first idle moment; a read that fails: nothing is saved over the store.
    const LabPresets = (() => {
      const KV = 'lab-presets';
      let ok = false; let kv = null;
      const local = () => ({ trig: store.get('three.trigPresets', []), palettes: store.get('three.palettes', []) });
      const saveKv = saver(() => (ok && kv ? window.hub.kvSet(KV, kv) : null), 400);
      // (round 88, labsync88) the rest of what you make in the Lab rides in the same store (scenesafe-core.js mineMerge):
      // each song's ⚡ triggers and loop, pinned scenes, effect favourites, the stage set list, each scene's sequence. The
      // places that use them still read this window's storage; they call LabPresets.changed() when they write it.
      const LOOP = 'hub.three.loop:';
      const loops = () => { const out = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(LOOP)) { const v = store.get(k.slice(4), null); if (v && v.a != null) out[k.slice(LOOP.length)] = v; } } } catch { /* storage is a convenience */ } return out; };
      const asSet = (l) => Object.fromEntries((Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && x).map((x) => [x, true]));
      const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      const mineLocal = () => ({
        song: obj(store.get('three.triggersBySong', {})), loop: loops(),
        pin: asSet(store.get('three.sketchPins', [])), fxfav: asSet(store.get('three.fx.favs', [])),
        setlist: (() => { const l = store.get('three.stage.setlist', []); return Array.isArray(l) && l.length ? { main: l } : {}; })(),
        seqpick: obj(store.get('three.seq.byScene', {})),
      });
      const inOrder = (key, m) => { const cur = (store.get(key, []) || []).filter((x) => m[x]); return [...cur, ...Object.keys(m).filter((x) => !cur.includes(x))]; };
      function mineWrite(kind, m) {
        if (kind === 'song') store.set('three.triggersBySong', m);
        else if (kind === 'pin') store.set('three.sketchPins', inOrder('three.sketchPins', m));
        else if (kind === 'fxfav') store.set('three.fx.favs', inOrder('three.fx.favs', m));
        else if (kind === 'setlist') store.set('three.stage.setlist', m.main || []);
        else if (kind === 'seqpick') store.set('three.seq.byScene', m);
        else if (kind === 'loop') { for (const k of Object.keys(loops())) if (!(k in m)) store.set(`three.loop:${k}`, null); for (const [k, v] of Object.entries(m)) store.set(`three.loop:${k}`, v); }
      }
      function take(disk) {
        const r = SceneSafeCore.labStoreMerge(disk, { presets: local(), presetsKnown: store.get('three.presetsKnown', null) || {}, mine: mineLocal(), mineKnown: store.get('three.mineKnown', null) || {} });
        kv = r.kv;
        for (const kind of r.mineChanged) mineWrite(kind, r.mine[kind]);
        store.set('three.mineKnown', r.mineKnown);
        if (r.presets) { store.set('three.trigPresets', r.presets.trig); store.set('three.palettes', r.presets.palettes); } // (a song's setup changed on both: the other one is one of your trigger presets)
        store.set('three.presetsKnown', r.presetsKnown);
        if (r.kvChanged) saveKv();
        if (r.mineChanged.size) dispatchEvent(new CustomEvent('hearth:lab-mine', { detail: { kinds: [...r.mineChanged] } }));
        // (round 94, keptaside94) a song's ⚡ triggers changed on both computers at once: this computer's stay, the other
        // one became a trigger preset — said, with where to find it (before: nothing told him)
        if (r.aside?.length) { const song = (a) => String(a.key).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').slice(0, 28); toast(`Your other computer changed the ⚡ triggers of ${r.aside.slice(0, 2).map((a) => `“${song(a)}”`).join(' and ')}${r.aside.length > 2 ? ` and ${r.aside.length - 2} more` : ''} at the same time. Yours stay; its setup is kept as the trigger preset “${song(r.aside[0])} (other setup)”, to load from the trigger presets any time.`, { timeout: 12000 }); }
        return r;
      }
      // (round 96, checkfix96) an arrival while start() is still reading: that read may be older than what arrived, so
      // it is read again before anything is taken or saved, and the arrival isn't acked (sync's guard stays meanwhile)
      let reading = false; let again = false;
      SA?.hold(KV, { name: 'Lab presets', saver: saveKv, read: () => SA.kv(KV, null),
        apply: (v) => { if (!ok) { if (reading) { again = true; return false; } return undefined; } if (!v || typeof v !== 'object' || Array.isArray(v)) return false; take(v); return undefined; } });
      const readKv = () => (SA ? SA.kv(KV, null) : window.hub.kvGet(KV, null));
      return {
        async start() { if (ok || reading) return; reading = true; try { let disk = await readKv(); while (again) { again = false; disk = await readKv(); } ok = true; take(disk); } catch { ok = false; } finally { reading = false; again = false; } },
        changed() { if (ok) take(kv); }, // a preset saved / deleted here (the menus wrote this window's storage)
      };
    })();
    window.LabPresets = LabPresets;
    api.scenes = {
      all: () => sketches,
      get: (id) => sketches.find((x) => x.id === id) || null,
      // deleted here (it's in History's trash), as opposed to not arrived yet from the other computer
      wasDeleted: (id) => trash.some((t) => t.id === id),
      refresh: () => refreshFromDisk(),
      // (round 153c, labwin153) the scene on disk now (one never saved yet too: the Lab window reads it from there), and
      // read back from disk after the Lab window closed (its settings, notes and references too: changed there)
      async saveNow(id) {
        if (current && current.id === id && !workspaceReleased && (sel()?.code !== editor.value || current.code !== (layersOf()[0]?.code ?? editor.value))) persist();
        save(); for (const ctl of controllers.values()) if (ctl.pending?.()) ctl.save?.();
        const r = await Promise.all([save.flush(), saveExtras.flush(), saveNotes.flush?.(), saveRefs.flush?.()]);
        for (const x of r) if (x?.error) throw Error(x.error);
        return true;
      },
      async refreshOne(id) {
        const [ex, no, rf] = await Promise.all(['three-lab-extras', 'three-notes', 'three-refs'].map((k) => window.hub.kvGet(k, null).catch(() => null)));
        if (ex && typeof ex === 'object' && id in ex) extras[id] = ex[id];
        if (no && typeof no === 'object' && id in no) notesAll[id] = no[id];
        if (rf && typeof rf === 'object' && id in rf) { refsAll[id] = rf[id]; dispatchEvent(new Event('hearth:lab-refs')); }
        return refreshFromDisk();
      },
      currentId: () => current?.id || null,
      // switch to a chat's sketch (the one you leave is saved first; unsaved sliders get the usual toast)
      open(id) {
        if (!sketches.some((x) => x.id === id)) return false;
        // (round 73, coldopen73) a scene a project closed was saved then (only if changed, round 72): not stamped and
        // rewritten again here when the next project's chat opens its own scene
        // (round 90, checkfix90) the scene left is saved only if its code changed here (as close() does since round 72):
        // a chat with its own scene, opened from the Desk, stamped the untouched scene "updated now" and rewrote every
        // scene (the whole scenes file, sent to the other computer too) — and Find in this project read it all again
        if (id !== current?.id || workspaceReleased) { if (!workspaceReleased && current && (sel()?.code !== editor.value || current.code !== (layersOf()[0]?.code ?? editor.value))) persist(); openSketch(id, { by: 'scene' }); }
        return true;
      },
      // id: (round 52, chatkeep) a scene that never reached the disk comes back under its own id (its chat still links it)
      create({ name, code, layers = null, open = false, frame = null, timeline = null, id = null }) {
        const x = { id: id && /^[\w-]{1,80}$/.test(id) && !sketches.some((y) => y.id === id) ? id : `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, code, updatedAt: Date.now(), ...(layers ? { layers: JSON.parse(JSON.stringify(layers)) } : {}) };
        sketches.push(x);
        if (frame) { (extras[x.id] ||= {}).frame = frame; saveExtras(); }
        if (timeline) { (extras[x.id] ||= {}).timeline = { len: timeline.len || 10, fps: timeline.fps || 30 }; saveExtras(); } // its own timeline (the orb)
        save();
        if (open) { persist(); openSketch(x.id, { by: 'scene' }); } else renderPicker();
        return x;
      },
      // a copy with its song link, frame size and look (a chat that starts from another chat's scene)
      duplicate(id, name) {
        const src = sketches.find((x) => x.id === id);
        if (!src) return null;
        if (src === current) persist();
        const copy = { ...JSON.parse(JSON.stringify(src)), id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, updatedAt: Date.now() };
        sketches.push(copy);
        if (extras[id]) { extras[copy.id] = JSON.parse(JSON.stringify(extras[id])); saveExtras(); }
        if (extras[id]?.timeline) player.copyMap(clockPath(id), clockPath(copy.id)).catch(() => {}); // its timeline's cues and markers
        save();
        renderPicker();
        if (typeof ThreeSeq !== 'undefined') ThreeSeq.sceneCopied(id, copy.id).catch(() => {}); // its sequence comes along
        return copy;
      },
      rename(id, name) {
        const x = sketches.find((y) => y.id === id);
        if (!x || !name || x.name === name) return false;
        x.name = name;
        save();
        renderPicker();
        return true;
      },
      // a sketch changed outside the editor (the backstage): saved; re-run when it's the one on screen
      changed(id) {
        const x = sketches.find((y) => y.id === id);
        if (!x) return;
        x.code = x.layers?.[0]?.code ?? x.code;
        x.updatedAt = Date.now();
        save();
        if (x === current) refreshInPlace();
        window.ThreeHistory?.changed?.('scene', id);
        dispatchEvent(new CustomEvent('hearth:scene-changed', { detail: { id } })); // (precomps showing it follow: tools/three-comp.js)
      },
      layersOf: (x) => materialize(x),
      frameOf: (id) => extras[id]?.frame || null,
      setFrame(id, f) { (extras[id] ||= {}).frame = f; saveExtras(); if (id === current?.id) stage.setMode(f); },
      selectedOf: (id) => extras[id]?.selectedLayer || null,
      songOf: (id) => extras[id]?.media?.path || null,
      // the scene's own timeline (no song): { len, fps, time } or null; set / clear it; the Lab timeline of the scene
      // on screen back to its song or its own timeline (the Lab sequence calls it when it leaves)
      timelineOf: (id) => timelineOf(id), setTimeline: (id, tl) => setTimeline(id, tl),
      mediaUp: (id = current?.id) => (id ? sceneMedia(id, { playing: false }) : null),
      extrasOf: (id) => extras[id] || null, // looks / music links per layer (the Lab sequence applies a clip's look)
      // (round 35, labtemplates) a scene made a moment ago, taken back (a toast's Undo): to History's deleted sketches, as Delete… does
      remove(id) {
        const s = sketches.find((x) => x.id === id);
        if (!s || sketches.length === 1) return false;
        if (s === current) persist();
        trash.unshift({ id: s.id, name: s.name, code: s.code, layers: s.layers, deletedAt: Date.now() });
        trash.length = Math.min(trash.length, 30);
        saveHistory();
        removedIds.add(id);
        sketches = sketches.filter((x) => x.id !== id);
        save();
        if (s === current) openSketch(sketches[0].id); else renderPicker();
        return true;
      },
      // (round 75, versions75) Deleted things › Restore: a deleted scene back under its own id, out of History's deleted list
      undelete(id) { const t = trash.find((x) => x.id === id); if (!t || sketches.some((x) => x.id === id)) return null; const x = api.scenes.create({ name: t.name, code: t.code ?? t.layers?.[0]?.code ?? '', layers: t.layers || null, id }); trash = trash.filter((y) => y.id !== id); saveHistory(); return x; },
      setExtras(id, ex) { if (!sketches.some((x) => x.id === id) || !ex || typeof ex !== 'object') return false; extras[id] = { ...(extras[id] || {}), ...JSON.parse(JSON.stringify(ex)) }; saveExtras(); return true; }, // (round 28, packs) a scene from a .hearthpack: its sliders, looks, song link
      // (round 75, projbundle75) a scene from a .hearthproject or a duplicated project (projbundle.js): the sketch as given
      // under its fresh id, its extras, references, notes, still and timeline cues; saved at once, never over a scene that's there
      adoptScene({ sketch, extras: ex = null, refs = null, notes = null, thumb = null, maps = null } = {}) {
        if (!sketch?.id || !/^[\w-]{1,80}$/.test(sketch.id) || sketches.some((x) => x.id === sketch.id)) return null;
        const x = JSON.parse(JSON.stringify(sketch));
        sketches.push(x);
        if (ex && typeof ex === 'object') { extras[x.id] = JSON.parse(JSON.stringify(ex)); saveExtras(); }
        if (Array.isArray(refs) && refs.length) { refsAll[x.id] = JSON.parse(JSON.stringify(refs)); saveRefs(); }
        if (Array.isArray(notes) && notes.length) { notesAll[x.id] = JSON.parse(JSON.stringify(notes)); saveNotes(); }
        if (thumb?.url) { thumbs[x.id] = { ...thumb }; saveThumbs(); }
        for (const [k, m] of Object.entries(maps || {})) player.adoptMap?.(k, m).catch?.(() => {});
        save(); pickerSoon(); // (round 86, projopen86) the picker drawn once for a project's scenes added together (it was once per scene, ≈ 15–20 ms each)
        return x;
      },
      thumbOf: (id) => thumbs[id]?.url || null,
      // (round 88, labsync88) a picture for a scene, kept only when it looks different (dev/checks/labsync88.js) · History's
      // versions of a scene, its file read first
      keepThumb: (id, url) => keepThumb(id, url, null), thumbStats: () => ({ ...thumbStats }),
      songCopy: { info: () => songCopyInfo(player.path), offer: (o) => offerSongCopy(player.path, o), keep: () => keepSongCopy(player.path) }, // (round 88) /song keep
      versionsOf: async (id) => { await loadHist(id); return SceneSafeCore.histSegOf(history, id); },
      previewHost: () => previewHost,
      // (round 43, scenesafe) 🛟 Recover lost scenes (tools/three-scenesafe.js): found scenes join the list (never replacing
      // one: SceneSafeCore.mergeInto), saved at once; unrecover takes exactly those back (the toast's Undo)
      blocked: () => !kvOk.has('three-sketches'),
      recover(picks) {
        const r = SceneSafeCore.mergeInto(sketches, picks);
        if (!r.added.length) return [];
        sketches = r.list;
        kvOk.add('three-sketches'); // (bringing scenes back is an answer to a scenes file that couldn't be read: saved now)
        save(); save.flush?.(); renderPicker();
        return r.added;
      },
      unrecover(ids) {
        const drop = new Set((ids || []).filter((id) => sketches.some((x) => x.id === id)));
        if (!drop.size || drop.size >= sketches.length) return 0;
        for (const id of drop) removedIds.add(id);
        sketches = sketches.filter((x) => !drop.has(x.id));
        save(); save.flush?.();
        if (current && drop.has(current.id)) openSketch(sketches[0].id); else renderPicker();
        return drop.size;
      },
      // the scenes file can be read again (the card's Retry): what it holds joins the list, saving is back on
      adopt(list) {
        if (!Array.isArray(list)) return false;
        const starter = sketches.length === 1 && SceneSafeCore.onlyStarter(sketches) && !list.some((x) => x.id === sketches[0].id) ? sketches[0] : null;
        const mine = sketches.filter((x) => x !== starter && !list.some((y) => y.id === x.id));
        sketches = [...list.map((x) => JSON.parse(JSON.stringify(x))), ...mine];
        if (!sketches.length) sketches = starter ? [starter] : sketches;
        kvOk.add('three-sketches');
        if (mine.length) save();
        if (!current || !sketches.includes(current)) openSketch(store.get('three.current', sketches[0].id)); else renderPicker();
        return true;
      },
      okStores: () => [...kvOk],
    };

    // (round 23, timemachine) the scene's state for its versions (tools/three-history*.js), and showing one: scrubbing
    // puts a version on screen without saving it (only the layers whose code differs re-run, in place); keep saves it
    const tmVals = (L) => { const c = controllers.get(L.id); if (!c?.dirty?.()) return null; const o = {}; for (const x of c.controls()) if (x.key != null) o[x.key] = x.value; return Object.keys(o).length ? o : null; };
    api.tm = {
      quiet: false,
      state(id = current?.id) {
        const s = sketches.find((x) => x.id === id);
        if (!s) return null;
        const layers = JSON.parse(JSON.stringify(materialize(s)));
        const vals = {};
        if (s === current) { const L = layers.find((x) => x.id === sel()?.id); if (L) L.code = editor.value; for (const x of layersOf()) { const v = tmVals(x); if (v) vals[x.id] = v; } }
        return { layers, vals, sel: s === current ? selId : extras[id]?.selectedLayer || null, palette: s.palette ? [...s.palette] : null };
      },
      show(st, { keep = false } = {}) {
        if (!current || !st?.layers?.length) return false;
        api.tm.quiet = !keep;
        try {
          current.layers = JSON.parse(JSON.stringify(st.layers));
          if (keep) { current.code = current.layers[0]?.code ?? current.code; current.updatedAt = Date.now(); if (JSON.stringify(st.palette || null) !== JSON.stringify(current.palette || null)) setPalette(st.palette || []); save(); }
          refreshInPlace(st.sel);
          for (const L of layersOf()) { const c = ctlFor(L); const v = st.vals?.[L.id]; if (v) c.setMany(v); else if (c.dirty?.()) c.reset(); }
        } finally { if (keep) api.tm.quiet = false; }
        return true;
      },
      unquiet() { api.tm.quiet = false; },
      persist: () => persist(),
    };
    api.openCode = (code) => create(`From chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, code);

    // What the Three Director (Claude) uses to build scenes from the user's prompts.
    // (round 21, labdirector) its waits after a run end at the preview's first new frame (tools/three-director.js settle)
    // A project owns a live preview only while open. The same preparation protocol as Present warms its assets
    // and shaders; releasing the sandbox document also releases WebGL, audio, game timers and decoded textures.
    api.workspace = {
      state: () => ({ released: workspaceReleased, preparing: workspacePreparing, ready: box.ready, parked: parkedNow, kept: pageKept, primed: pagePrimed, abandoned: workspaceAbandoned }),
      resume() { if (window.LabWinHost?.away?.() && window.LabWinHost.away() === current?.id) return; if(workspaceReleased && current)openSketch(current.id,{by:'workspace-resume'}); }, // (round 153c, labwin153: not while the Lab window has it)
      // a page kept for a switch that didn't happen (cancelled, back to Projects): released now
      releaseKept() { unprime(); if (workspaceReleased && pageKept) { pageKept = false; box.release(); ranOnce = false; } },
      // (round 74, projdesk74) a project opened from Projects found no page (released there: nothing stays loaded behind
      // Projects) and loaded one only once its chat, worktable and Lab were ready. The page now starts at the click's
      // first moment (the card's press, or open() itself), in parallel with that work; prepare() runs the scene in it.
      // Unclaimed in time (4 s after a press that didn't become a click; 20 s once open() asked) it is let go again.
      preload(ms = 4000) {
        if (pagePrimed) { clearTimeout(primeTimer); primeTimer = setTimeout(unprime, ms); return true; }
        if (!workspaceReleased || pageKept || player.recording || box.onStage || box.loading || box.ready) return false;
        pagePrimed = true; box.reload(); box.hold(true);
        primeTimer = setTimeout(unprime, ms);
        return true;
      },
      async prepare(id, { signal, progress = () => {} } = {}) {
        if (player.recording) throw Error('Finish the recording before switching projects.');
        if (!sketches.some(s => s.id === id)) throw Error('This scene is not available on this computer yet.');
        workspacePreparing = true;
        const request = 'project-' + Date.now();
        try {
          await new Promise((resolve, reject) => {
            let sent = false, finished = false;
            // (round 109, projopen109) the Lab sent off screen mid-open (the Desk asked for, another tab, the window
            // hidden): its page draws no frame there, so the warm-up's frames never came and the open sat at "Warming
            // shaders" until the 90 s error. Now the warm-up is let go at once: the open goes on (its scene already runs in
            // the page, held while off screen) and what wasn't warmed compiles with its first frames when the Lab shows.
            const offScreen = () => document.visibilityState !== 'visible' || previewHost.checkVisibility?.({ visibilityProperty: true }) === false;
            let awayT = 0;
            const away = () => { clearTimeout(awayT); awayT = setTimeout(() => { if (!finished && offScreen()) { workspaceAbandoned += 1; finish(); } }, 0); };
            document.addEventListener('hearth:activate', away); document.addEventListener('visibilitychange', away); // (hearth:activate goes to the document, not bubbling to the window)
            const finish = err => { if(finished)return;finished=true;clearTimeout(timer);clearTimeout(awayT);document.removeEventListener('hearth:activate', away);document.removeEventListener('visibilitychange', away); signal?.removeEventListener('abort', abort); workspaceMessage = null; err ? reject(err) : resolve(); };
            const abort = () => finish(new DOMException('Opening cancelled', 'AbortError'));
            const timer = setTimeout(() => finish(Error('The scene is taking too long to prepare. Retry, or open the editor to inspect it.')), 90000);
            const warm = async () => {
              sent=true;
              try{
                progress('Loading scene assets');const media=await sceneMediaTask;if(media?.ok===false)throw Error(media.error||'The project song could not be loaded.');
                await loadRefBytes();if(finished)return;
                progress('Preparing textures and shaders');box.send({type:'ready-prep',id:request});
              }catch(err){finish(err);}
            };
            workspaceMessage = msg => {
              if (msg.type === 'asset-progress' && msg.total > 1 && msg.done < msg.total) progress(`Loading scene assets (${msg.done + 1} of ${msg.total})`); // (round 75, labload75)
              if (msg.type === 'stack-drawn' && !sent) {
                if (msg.noGl) return finish(Error('The scene could not start its graphics context. Try opening it again.'));
                warm();
              }
              if (msg.id !== request) return;
              if (msg.type === 'ready-progress') progress(msg.stage === 'assets' ? 'Loading scene assets' : 'Warming shaders');
              if (msg.type === 'ready-prepped') {
                const left = Object.values(msg.assets?.left || {}).reduce((n,v) => n + Number(v || 0), 0);
                if (left || msg.pending) return finish(Error('Some scene assets or shaders are still unavailable. Retry, or open the editor.'));
                finish();
              }
            };
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) return abort();
            if(current?.id===id&&!workspaceReleased){
              if(box.ready&&workspaceDrawn===id)warm();
            }else{
              // (round 74) a page preloaded at the click is still loading (held): the scene's run waits for it (no new load)
              const primed=pagePrimed&&!box.onStage&&box.loading;pagePrimed=false;clearTimeout(primeTimer);
              if(!primed&&(!pageKept||!box.ready||box.onStage)){box.release();ranOnce=false;}refsSig=null;openSketch(id,{by:'project'}); // (its run lets the held page's 'ready' through)
            }
            syncPark(true);
          });
        } finally { workspacePreparing = false; syncPark(true); }
      },
      // keep: a switch straight to another project (its scene runs in this page next); otherwise the page is released
      async close({ keep = false } = {}) {
        if (workspaceReleased) { if (!keep) unprime(); if (!keep && pageKept) { pageKept = false; box.release(); ranOnce = false; } return; } // (round 74) unprime
        if (player.recording) throw Error('Finish the recording before closing this project.');
        await ThreeLab.idle();
        // Save live slider edits too: closing a document must not leave its current sound/look only in memory.
        for (const ctl of controllers.values()) if (ctl.pending?.()) ctl.save?.();
        // (round 72) only what changed: an untouched scene isn't stamped "updated now" and rewritten (all scenes, MBs) per close
        if (current && (sel()?.code !== editor.value || current.code !== (layersOf()[0]?.code ?? editor.value))) persist(); rememberMedia();
        const results = await Promise.all([save.flush(), saveExtras.flush()]);
        for (const r of results) if (r?.error) throw Error(r.error);
        window.PresentReady?.stop();
        await window.hub.game?.leave?.();
        await setLive(null); stopNowPlaying();
        player.toggle(false); player.unload({ silent: true });
        clearTimeout(thumbTimer); refsHold = null; refBytes.clear(); refsSig = null;
        if (keep && box.ready && !box.onStage) pageKept = true; else { pageKept = false; box.release(); ranOnce = false; }
        workspaceReleased = true; stallArm?.(true);
      },
    };
    // (round 154, mem154) The Lab rests when nobody can see it: out of view (a chat, another tool, Hearth hidden or
    // minimised) for 5 minutes with nothing going on in it, its preview page is let go as when you leave for Projects
    // (workspace.close(): the code and slider edits saved first, the song's place remembered; the page's process, its
    // WebGL contexts, decoded textures and sound output go: ≈ 390 MB and 2 processes here, docs/upgrades/mem154.md).
    // Showing the Lab runs the scene again (onShow → workspace.resume()); an AI call on the scene wakes it first
    // (handleVisible → api.rest.wake()). Never while the song / timeline plays, a recording or a render runs, live sound
    // is on, on the Stage window, ▶ Play or a baked show, a project opening, an AI turn on this scene, or while the Lab
    // window holds it (it is released then anyway). Tests: localStorage 'lab.restMs' (ms; '0' = never).
    const restMs = () => { let v = null; try { v = localStorage.getItem('lab.restMs'); } catch { /* none */ } const n = v == null || v === '' ? 300000 : Number(v); return Number.isFinite(n) && n >= 0 ? n : 300000; };
    const restUnseen = () => !box.onStage && !previewHost.checkVisibility?.({ visibilityProperty: true }); // (round 160, playfix: only when another tool covers the Lab; a hidden, minimised or covered window (Windows reports covered as hidden) no longer counts, so the Lab never rests while it is the tool on screen)
    const restBlock = () => (workspaceReleased ? 'released' : !current ? 'no scene' : !restUnseen() ? 'seen' : REST.closing ? 'closing'
      : workspacePreparing || pagePrimed || box.loading ? 'preparing' : player.playing ? 'playing' : player.recording ? 'recording' : liveKind ? 'live'
      : xpOn ? 'rendering' : previewHost.classList.contains('pr-baked') || document.documentElement.classList.contains('gm-playing') ? 'show'
      : directorWorking() ? 'ai' : window.ProjectWorkspace?.state?.().phase === 'opening' ? 'opening' : window.LabWinHost?.holds?.(current.id) ? 'lab window' : null);
    function restArm() {
      const ms = restMs();
      if (!parkedNow || !ms || workspaceReleased) { clearTimeout(REST.t); REST.t = 0; REST.since = 0; return; }
      if (REST.t) return;
      REST.since = Date.now();
      REST.t = setTimeout(restTry, ms);
    }
    function restTry() {
      REST.t = 0;
      const ms = restMs(); const why = restBlock(); REST.last = why;
      if (!ms || why === 'released' || why === 'seen' || why === 'no scene') { REST.since = 0; return; }
      if (why) { REST.since = Date.now(); REST.t = setTimeout(restTry, Math.min(ms, 30000)); return; } // busy: the quiet time starts again after it
      const left = REST.since + ms - Date.now();
      if (left > 250) { REST.t = setTimeout(restTry, left); return; }
      REST.closing = true;
      api.workspace.close().then(() => {
        REST.by = workspaceReleased; if (REST.by) REST.rested += 1;
        if (REST.by && !restUnseen()) { REST.by = false; api.workspace.resume(); } // shown while it was being let go
      }, (err) => { REST.last = `close: ${err?.message || err}`; }).finally(() => { REST.closing = false; });
    }
    // (round 161, fix161) ThreeLab.drop(): the rest path first (the code and slider edits saved, the song's place
    // remembered, the preview page let go: WebGL, sound, timers), then everything this tab hooked outside its own DOM, so
    // nothing outside keeps the tab (its scenes, DOM, state) alive once ThreeLab lets go of it
    api.teardown = async () => {
      await api.workspace.close();
      clearTimeout(REST.t); REST.t = 0;
      life.ac.abort();
      for (const o of life.obs.splice(0)) { try { o.disconnect(); } catch { /* gone */ } }
      for (const t of life.iv) clearInterval(t);
      life.iv.clear();
      for (const t of life.to) clearTimeout(t);
      life.to.clear();
      for (const u of life.undo.splice(0)) { try { u(); } catch { /* gone */ } }
      for (const id of ['lab-media', 'lab-stall']) window.Power?.stop?.(id);
      clearInterval(K.hudTimer); clearInterval(K.lookTimer); clearInterval(K.hubLive?.timer); // (the parts' timers: Present's HUD, cycle looks, live sound)
      keyHint.remove(); exitFocus.remove(); // (made on document.body)
      box.dispose(); player.dispose?.(); if (nowPlayingTo === onNowPlaying) nowPlayingTo = null;
      for (const k of ['__labRest', '__labLiveStart', 'LabPresets']) { try { delete window[k]; } catch { window[k] = undefined; } }
    };
    api.rest = {
      state: () => ({ rested: REST.rested, woke: REST.woke, by: REST.by && workspaceReleased, armed: Boolean(REST.t), since: REST.since, last: REST.last, block: restBlock(), ms: restMs() }),
      // an AI call on the scene (or anything that needs its page): the rested page comes back first (≤ 15 s for its 'ready')
      async wake() {
        if (!REST.by || !workspaceReleased || !current || window.LabWinHost?.holds?.(current.id)) return false;
        REST.by = false; REST.woke += 1;
        api.workspace.resume();
        for (let i = 0; i < 150 && !box.ready; i += 1) await new Promise((r) => setTimeout(r, 100));
        return true;
      },
    };
    const sleep = (ms) => (typeof ThreeDirector !== 'undefined' && ThreeDirector.settle ? ThreeDirector.settle(ms) : new Promise((r) => setTimeout(r, ms)));
    const layersSummary = () => layersOf().map((L, i) => ({
      id: L.id, name: L.name, ...(ThreeLayers.isFilter(L.code) ? { kind: 'filter (changes the layers below it)' } : {}), ...(typeof ShaderLib !== 'undefined' && ShaderLib.isShader(L.code) ? { kind: 'shader (GLSL: three_do shader)' } : {}), ...(typeof LabParticles !== 'undefined' && LabParticles.isParticles(L.code) ? { kind: 'particles (GPU: three_do particles)' } : {}), ...(typeof LabPhysics !== 'undefined' && LabPhysics.isPhysics(L.code) ? { kind: 'physics (three_do physics)' } : {}), ...(typeof LabType !== 'undefined' && LabType.isType(L.code) ? { kind: 'type (text / lyrics: three_do type)' } : {}), ...(L.precomp && typeof ThreeComp !== 'undefined' && ThreeComp.isComp(L) ? { kind: `precomp of ${ThreeComp.describe(L)} (three_do comp)` } : {}), order: `${i + 1} of ${layersOf().length} (1 = bottom)`, selected: L.id === selId,
      ...(L.group ? { group: L.group.name } : {}), ...(L.solo ? { solo: true } : {}), // (round 44, layergroups)
      visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal',
      ...(L.overrides?.['@look'] ? { materials: Object.fromEntries(Object.entries(L.overrides['@look']).map(([k, o]) => [k === '*' ? 'all meshes' : k, window.MatCore ? MatCore.describe(o) : o.k])) } : {}), // (round 50, labmaterials) ◉ looks
      ...(Object.keys(L.overrides || {}).some((k) => k !== '@look') ? { placedByUser: Object.fromEntries(Object.entries(L.overrides).filter(([k]) => k !== '@look').map(([k, o]) => [k, { position: o.p, rotationDegrees: o.rd, scale: o.s, ...(o.v === false ? { hidden: true } : {}), ...(o.fov ? { fov: o.fov } : {}) }])) } : {}),
      plays: L.in == null && L.out == null ? 'whole song' : { from: L.in ?? 0, to: L.out ?? 'end', fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0 },
      ...(L.x || L.y || (L.scale ?? 1) !== 1 || L.rotate ? { transform: { x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0 } } : {}),
      sliders: controllers.get(L.id)?.controls().map((c) => (favPinned(L.id, c.key) ? `${c.label}★` : c.label)) || [], // (round 138, favs138) ★ = pinned by the owner
      ...(Object.keys(L.keys || {}).length ? { keyframes: Object.fromEntries(Object.entries(L.keys).map(([p, ks]) => [p.replace(/^s:/, 'slider '), ks.map((k) => `${k.t}s=${k.v}${k.ease && k.ease !== 'ease' ? ` (${k.ease})` : ''}`)])) } : {}),
    }));
    const report = () => ({
      sketch: current?.name,
      layer: sel()?.name,
      layers: layersSummary(),
      errors: errors.map((e) => ({ layer: layerById(e.layer)?.name, message: e.message, line: e.line || undefined })),
      console: consoleLines.slice(-30).map((l) => `${l.layer ? `[${l.layer}] ` : ''}${l.level === 'log' ? '' : `[${l.level}] `}${l.line ? `(line ${l.line}) ` : ''}${l.text}`),
      stats: lastStats || 'no frames rendered yet (nothing calls renderer.render, or it failed)',
      frame: stage.size,
      ...(selCtl()?.controls().length ? { sliders: selCtl().controls() } : { sliders: 'none: add named controls with tweak()' }),
      ...(selCtl()?.unsaved().length ? { unsavedSliders: selCtl().unsaved() } : {}),
      music: player.isClock ? `none: the scene's own timeline (${player.duration} s at ${player.clock.fps} fps; nothing reacts to music)` : player.loaded ? (({ file, bpm, duration, time, playing }) => ({ file, bpm, duration, time, playing }))(player.info()) : 'none loaded (demo 120 bpm beat)',
      ...(document.hidden || !document.hasFocus() ? { note: 'The hub window is in the background, so fps is throttled here; judge performance by renderMs.' } : {}),
    });
    // "top", "bottom", "selected", a number (1 = bottom), an id or a name.
    function findLayer(ref) {
      const Ls = layersOf();
      if (ref == null || ref === '' || ref === 'selected') return sel();
      if (ref === 'top') return Ls[Ls.length - 1];
      if (ref === 'bottom') return Ls[0];
      if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return Ls[Number(ref) - 1];
      const r = String(ref).toLowerCase();
      return Ls.find((L) => L.id === ref) || Ls.find((L) => L.name.toLowerCase() === r) || Ls.find((L) => L.name.toLowerCase().includes(r));
    }
    const PROP_KEYS = ['name', 'visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
    const director = {
      getCode: () => ({ sketch: current?.name, layer: sel()?.name, layers: layersSummary(), frame: stage.size, lines: editor.value.split('\n').length, ...codeOrOutline(editor.value), ...(selCtl()?.controls().length ? { sliders: selCtl().controls() } : {}), ...(selCtl()?.unsaved().length ? { unsavedSliders: selCtl().unsaved(), note: 'The user moved these sliders but has not saved them into the code; keep their values when you rewrite.' } : {}) }),
      media: player,
      assignMedia, songOnScene, ensureTimeline, snapToBars,
      // a layer's code as it is now (the editor's text for the selected one), for diffs and the director's undo
      codeOf(ref = null) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        return { id: L.id, name: L.name, sketchId: current?.id, sketch: current?.name, code: L.id === sel()?.id ? editor.value : L.code };
      },
      openSketch: (id) => api.openSketchById?.(id),
      building: () => builds.size > 0, // (round 74, labcalls74) a layer that ran hasn't drawn its first frame yet
      built: (ms = 6000) => Promise.all([...builds.keys()].map((id) => whenDrawn(id, ms))), // …and once each drew or failed
      setFrame: (id) => stage.setMode(id),
      // The whole sketch as it is now (every layer), and putting such a capture back (jam.js: one undo point per
      // round). A capture whose sketch is gone, or restored with asNew, becomes a new sketch.
      // (round 74, labcalls74) o.save: false reads the scene as it is (the editor's text included) without stamping it
      // "updated now" and saving every scene: a Lab tool call notes its scene before and after, twice per call
      capture(o = {}) {
        if (o.save === false) { const L = sel(); if (L && current && L.code !== editor.value) persist(); } else persist();
        return { sketchId: current?.id, sketch: current?.name, selId, layers: JSON.parse(JSON.stringify(layersOf())), errors: errors.length };
      },
      async restore(snap, { asNew = null, wait = 2 } = {}) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        if (!snap?.layers?.length) throw new Error('Nothing to restore.');
        persist();
        const s = !asNew && sketches.find((x) => x.id === snap.sketchId);
        if (!s) {
          create(asNew || snap.sketch || 'Restored sketch', snap.layers[0].code, snap.layers);
        } else {
          if (s === current) snapshot();
          s.layers = JSON.parse(JSON.stringify(snap.layers));
          s.code = s.layers[0]?.code ?? s.code;
          s.updatedAt = Date.now();
          if (snap.selId) (extras[s.id] ||= {}).selectedLayer = snap.selId;
          save();
          if (s === current) refreshInPlace(snap.selId); else openSketch(s.id);
        }
        await sleep(Math.min(15, Math.max(0.3, wait)) * 1000);
        return report();
      },
      async setCode(code, wait = 2.5) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        snapshot();
        setCodeKeeping(code); // (round 92) the owner's cursor stays put
        persist();
        renderPicker();
        run({ hot: true, layer: selId }); // one layer or many: it re-runs in place
        await sleep(Math.min(15, Math.max(1, wait)) * 1000);
        return report();
      },
      async newSketch(name, code, wait = 2.5) {
        create(name, code);
        await sleep(Math.min(15, Math.max(1, wait)) * 1000);
        return report();
      },
      // ---------- layers ----------
      layers: () => ({ sketch: current?.name, selected: sel()?.name, ...(editOn && editSel ? { picked: pickedWords() } : {}), layers: layersSummary() }), // (round 92) + the object picked in the scene editor
      // (round 92, labchat92) the owner's last keystroke in a layer (ms, 0 = none here) and whether they're typing now
      handAt: (sketchId, layerId) => hand.at.get(`${sketchId}:${layerId}`) || 0,
      typing: () => typingNow(),
      async addLayer({ name, code, template, position, props = {} }, wait = 2.5) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        const Ls = layersOf();
        const index = position === 'bottom' ? 0 : typeof position === 'number' ? position - 1 : Ls.length;
        const p = Object.fromEntries(Object.entries(props).filter(([k]) => PROP_KEYS.includes(k)));
        const L = code ? addLayer('code', { code, name, index, props: p }) : addLayer(template || 'empty', { name, index, props: p });
        await sleep(Math.min(15, Math.max(1, wait)) * 1000);
        return { added: L?.name, ...report() };
      },
      async updateLayer(ref, patch = {}, wait = 1.5) {
        if (patch.sketchId && patch.sketchId !== current?.id) throw new Error('The scene on screen changed during this edit (the owner switched chats or sketches), so it stopped there. Check with three_console and carry on.');
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        const props = Object.fromEntries(Object.entries(patch).filter(([k]) => PROP_KEYS.includes(k)));
        if (Object.keys(props).length) editLayer(L.id, props, { direct: true });
        if (patch.code != null) {
          if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
          if (selId !== L.id && typingNow()) {
            // (round 92, labchat92) the owner is typing in another layer: this one changes without taking their editor
            // (before, the editor switched to it and their next keys landed in this layer)
            const list = (history[histKey(L)] ||= []);
            if (L.code.trim() && list[0]?.code !== L.code) { list.unshift({ at: Date.now(), code: L.code }); list.length = Math.min(list.length, 40); saveHistory(current.id); }
            L.code = String(patch.code);
            current.code = layersOf()[0]?.code ?? current.code;
            current.updatedAt = Date.now();
            save();
            renderLayers();
          } else {
            if (selId !== L.id) selectLayer(L.id);
            snapshot();
            setCodeKeeping(String(patch.code));
            persist();
          }
          run({ hot: true, layer: L.id });
        }
        if (patch.order != null) {
          const ids = layersOf().map((x) => x.id).filter((x) => x !== L.id);
          const to = patch.order === 'top' ? ids.length : patch.order === 'bottom' ? 0 : Math.max(0, Math.min(ids.length, Number(patch.order) - 1));
          ids.splice(to, 0, L.id);
          reorderLayers(ids);
        }
        // (round 74, labcalls74) props only (opacity, name, visible, x…): nothing runs again, so no first frame to wait for
        // (it waited ≥ 0.3 s for one); the preview gets them in its next frame, before any picture asked after this
        await sleep(patch.code == null && patch.order == null ? 0 : Math.min(15, Math.max(0.3, wait)) * 1000);
        return { updated: L.name, ...report() };
      },
      // property: opacity | x | y | scale | rotate or a slider (key or label); keys: [{ time, value, ease }]; clear removes them.
      setKeyframes(ref, property, keys, clear) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        let prop = String(property || '');
        if (!ANIM.includes(prop)) {
          const c = ctlFor(L);
          const ctl = c.controls().find((x) => x.key === prop || x.label.toLowerCase() === prop.toLowerCase());
          if (!ctl) throw new Error(`No property "${property}" on "${L.name}". Use opacity, x, y, scale, rotate or a slider: ${c.controls().map((x) => `${x.key} (${x.label})`).join(', ') || 'none'}`);
          prop = `s:${ctl.key}`;
        }
        const list = clear ? [] : (keys || []).map((k) => ({ t: Math.round(Number(k.time) * 1000) / 1000, v: k.value, ease: (ThreeLayers.EASE_IDS || ['linear', 'ease', 'hold']).includes(k.ease) ? k.ease : 'ease' })).filter((k) => Number.isFinite(k.t) && k.v != null).sort((a, b) => a.t - b.t);
        setKeys(L, prop, list);
        if (list.length) ensureTimeline(); // no song: the keys play on the scene's own timeline
        return { layer: L.name, property: prop.replace(/^s:/, ''), keyframes: list.length, ...report() };
      },
      // (round 116, layerdelete116) refs: one layer or a list (one undo step); the last one leaves an empty layer
      async removeLayer(refs, { who = null } = {}) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        const { list, error } = ThreeLayers.pickLayers(layersOf(), refs, selId);
        if (error) throw new Error(error);
        const r = removeLayers(list.map((L) => L.id), { who });
        if (!r) throw new Error('Nothing was deleted.');
        return { removed: r.removed.length === 1 ? r.removed[0] : r.removed, ...(r.left ? { left: r.left } : {}), ...report() };
      },
      // ---------- the running sketch: evaluate code inside it, press keys / click (play-testing) ----------
      evalInSketch: (code) => sandboxCall({ type: 'eval', code }, 6000),
      inputToSketch: (actions) => sandboxCall({ type: 'input', actions }, 70000),
      // ---------- reading and editing code in parts (big layers don't fit in one reply) ----------
      readCode(ref, from = 1, to = null) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        const code = L.id === sel()?.id ? editor.value : L.code;
        const lines = code.split('\n');
        const a = Math.max(1, Math.floor(from)); const b = Math.min(lines.length, Math.floor(to ?? a + 249));
        return { layer: L.name, totalLines: lines.length, from: a, to: b, code: numbered(lines, a, b), ...(b < lines.length ? { more: `Lines ${b + 1}–${lines.length} not shown: read them with from: ${b + 1}.` } : {}) };
      },
      searchCode(pattern, { layer = null, regex = false, context = 1 } = {}) {
        let re;
        try { re = regex ? new RegExp(pattern, 'i') : new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch (err) { throw new Error(`Bad pattern: ${err.message}`); }
        const scope = layer ? [findLayer(layer)].filter(Boolean) : layersOf();
        const hits = [];
        for (const L of scope) {
          const lines = (L.id === sel()?.id ? editor.value : L.code).split('\n');
          lines.forEach((ln, k) => {
            if (hits.length >= 120 || !re.test(ln)) return;
            const a = Math.max(0, k - context); const b = Math.min(lines.length - 1, k + context);
            hits.push({ layer: L.name, line: k + 1, text: numbered(lines, a + 1, b + 1) });
          });
        }
        return { pattern, matches: hits.length, hits };
      },
      // Exact find → replace edits (each must match once unless all: true), or replace a range of lines.
      async editCode(ref, edits = [], wait = 2.5) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        let code = L.id === sel()?.id ? editor.value : L.code;
        const done = [];
        for (const [n, e] of edits.entries()) {
          if (e.lines) {
            const lines = code.split('\n');
            const [a, b] = [Number(e.lines[0]), Number(e.lines[1] ?? e.lines[0])];
            if (!(a >= 1 && b >= a - 1 && b <= lines.length)) throw new Error(`Edit ${n + 1}: lines ${a}–${b} are outside 1–${lines.length}.`);
            lines.splice(a - 1, b - a + 1, ...String(e.replace ?? '').split('\n'));
            code = lines.join('\n');
            done.push(`lines ${a}–${b} replaced`);
            continue;
          }
          const find = String(e.find ?? '');
          if (!find) throw new Error(`Edit ${n + 1}: give find (exact text) or lines [from, to].`);
          const count = code.split(find).length - 1;
          if (!count) throw new Error(`Edit ${n + 1}: the text to find isn't in "${L.name}" (search with three_search_code; whitespace must match).`);
          if (count > 1 && !e.all) throw new Error(`Edit ${n + 1}: the text appears ${count} times; add more context to make it unique, or all: true.`);
          code = e.all ? code.split(find).join(String(e.replace ?? '')) : code.replace(find, () => String(e.replace ?? ''));
          done.push(`${count > 1 ? `${count}×` : ''}"${find.slice(0, 40).replace(/\n/g, '⏎')}${find.length > 40 ? '…' : ''}" replaced`);
        }
        const report = await director.updateLayer(L.id, { code }, wait);
        return { layer: L.name, edits: done, lines: code.split('\n').length, ...report };
      },
      selectLayer(ref) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        selectLayer(L.id);
        return director.getCode();
      },
      timeline(range) {
        return { ...player.timeline(range || {}), layers: layersSummary().map((x) => ({ name: x.name, plays: x.plays, keyframes: x.keyframes, lanes: lanesOf(layerById(x.id) || {}).map((p) => p.replace(/^s:/, 'slider ')) })), notes: notesOf().map(({ id, t, text, done }) => ({ id, time: t, text, done })) };
      },
      timelineEdit({ grid, markers, loop, zoom, lane, cues, speed, length, snapToBars: snapBars } = {}) {
        if (!player.loaded) ensureTimeline(); // no song: the scene's own timeline
        if (!player.loaded) throw new Error('No song loaded.');
        const did = [];
        // the scene's own timeline (no song): its length in seconds; with a song: keyframes and cues to its bars
        if (length != null) { if (!player.isClock) throw new Error('This scene plays on its song: its length is the song\'s.'); setTimeline(current.id, { ...extras[current.id].timeline, len: Number(length) }); did.push('length'); }
        if (snapBars) { const r = snapToBars(); if (!r) throw new Error('No song with bars on this scene.'); did.push(`snapped ${r.keys} keyframes and ${r.cues} cues to ${r.unit}s`); }
        if (grid === 'auto') { player.clearGrid(); did.push('grid back to the detected beats'); } else if (grid) { player.setGrid(grid); did.push('grid'); }
        if (markers) { player.editMarkers({ add: markers.add || {}, remove: markers.remove || {}, clear: markers.clear || [], range: markers.range || null, snap: markers.snap !== false }); did.push('markers'); }
        if (loop !== undefined) { if (!player.setLoop(loop ? loop.start : null, loop?.end)) throw new Error('The user locked the loop.'); did.push('loop'); }
        if (zoom !== undefined) { player.zoomTo(zoom ? zoom.start : null, zoom?.end); did.push('zoom'); }
        if (cues) { player.editCues({ add: cues.add || [], remove: cues.remove || [], clear: Boolean(cues.clear) }); did.push('cues'); }
        if (speed) { player.setRate(Number(speed)); did.push('speed'); }
        if (lane) {
          const L = findLayer(lane.layer);
          if (!L) throw new Error(`No layer "${lane.layer}".`);
          let prop = lane.property || null;
          if (prop === 'all') setLanes(L, [...lanesOf(L), ...animatedProps(L)]);
          else if (!prop) setLanes(L, []);
          else {
            if (!ThreeLayers.ANIM_META[prop]) { const c = ctlFor(L).controls().find((x) => x.key === prop || x.key === String(prop).replace(/^s:/, '') || x.label.toLowerCase() === String(prop).toLowerCase()); if (!c) throw new Error(`No property "${prop}" on "${L.name}".`); prop = `s:${c.key}`; }
            setLanes(L, lane.show === false ? lanesOf(L).filter((p) => p !== prop) : [...lanesOf(L), prop]);
          }
          did.push('lane');
        }
        return { changed: did, ...director.timeline() };
      },
      applyPreset(ref, presetId) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        const r = applyPreset(L.id, presetId);
        if (!r) throw new Error(`Unknown preset "${presetId}" (or no song). Presets: ${ThreeLayers.PRESETS.map((x) => x.id).join(', ')}`);
        return { ...r, ...report() };
      },
      sliders(ref, set) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        const c = ctlFor(L);
        const changed = set && Object.keys(set).length ? c.setMany(set) : [];
        return { layer: L.name, changed, sliders: c.controls(), looks: c.looksApi.list() };
      },
      looks(ref, action, name) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        const api2 = ctlFor(L).looksApi;
        if (action === 'save') return { looks: api2.save(name) };
        if (action === 'apply') return { applied: api2.apply(name), sliders: ctlFor(L).controls() };
        if (action === 'delete') return { looks: api2.remove(name) };
        return { looks: api2.list() };
      },
      refs: { list: () => refsOf(), all: () => refsAll, reload: (id, o) => reloadRef(id, o), add: (p, key) => addRef(p, { key }), rename: renameRef, remove: removeRef, use: refUse, size: fmtSize, url: fileUrl,
        reloadFile: (id, rel, o) => reloadRefFile(id, rel, o), files: (r) => refFilesOf(r), // (round 100, modeltex100: a model's other files, followed on disk)
        palette: () => current?.palette || [], setPalette: (cols) => setPalette(cols), paletteFrom: async (name) => { const r = refsOf().find((x) => x.key === name || x.name === name); if (!r || r.kind !== 'image') throw new Error(`No picture reference "${name}"`); const cols = await paletteFrom(r.path); setPalette(cols); return cols; } },
      notes: {
        list: () => notesOf().map(({ id, t, text, done, image }) => ({ id, time: t, text, done, image })),
        add: (time, text) => takeNote({ time, text: text || '' }),
        set: (id, patch) => { const n = notesOf().find((m) => m.id === id); if (!n) throw new Error(`No note ${id}`); Object.assign(n, patch); saveNotes(); renderNotes(); return n; },
        remove: (id) => { notesAll[current.id] = notesOf().filter((m) => m.id !== id); saveNotes(); renderNotes(); },
      },
      report,
      contactSheet: (o) => contactSheet(o),
      triggers: (patch) => (patch ? setTriggers(patch) : trigCfg),
      live: () => ({ input: liveKind, bpm: liveBpm?.bpm ?? null, tempoLocked: Boolean(liveBpm?.locked),
        nowPlaying: np?.title ? { title: np.title, artist: np.artist, album: np.album, app: np.app, position: Math.round(np.position || 0), duration: Math.round(np.duration || 0), playing: np.playing } : null }),
      // Shots asked for at the same time (a still while the director takes one) share the next picture: each
      // waiter used to replace the one before, which then never resolved. Tagged 'get' so a second reply never
      // falls through to the user's "save screenshot" dialog.
      // (round 21, labdirector) a small JPEG made by the preview itself (no full-size PNG): the director's pictures.
      // Shares the thumbnail channel: a Lab thumbnail on its way gets the same picture (shrunk to its size).
      shotSmall: (max) => glWait().then(() => new Promise((resolve) => { // (round 43: after the GPU is back, never a blank picture)
        const prev = thumbShot;
        let done = false;
        const mine = (url, small) => { if (done) return; done = true; if (thumbShot === mine) thumbShot = null; resolve(url || null); if (prev && url) prev(url, small && !prev.forDirector ? false : small); };
        mine.forDirector = true;
        thumbShot = mine;
        box.send({ type: 'screenshot', tag: 'thumb', max: Math.max(64, Math.round(max)) });
        setTimeout(() => mine(null), 10000); // a heavy scene can take a while to draw its next frame
      })),
      coverShot: (ms) => box.cover(ms), // (round 29, bugbash) quick picture for chat switching (see box.cover)
      shot: () => glWait().then(() => new Promise((resolve) => { // (round 43: after the GPU is back)
        const prev = pendingShot;
        const mine = (url) => { prev?.(url); resolve(url); };
        pendingShot = mine;
        box.send({ type: 'screenshot', tag: 'get' });
        // a slow frame (a heavy scene, a shader still compiling, software rendering) is not "not rendering": wait 15 s
        setTimeout(() => { if (pendingShot === mine) { pendingShot = null; mine(null); } }, 15000);
      })),
    };
    api.runSketch = run;
    // Nodes ⇄ Code (tools/three-nodes.js): the selected layer as a node graph over the code pane.
    if (typeof ThreeNodes !== 'undefined') ThreeNodes.attach({ host: editorHost, editor, layer: () => sel(), sketch: () => current, codeShown: () => !split.classList.contains('no-code'), showCode: setCodeVisible,
      setCode: (code, { rerun = true } = {}) => { if (rerun) snapshot(); editor.setValue(code); persist(); if (rerun) run({ hot: true, layer: selId }); },
      addLayer: (name, code) => addLayer('code', { name, code }), newSketch: (name, code) => create(name, code),
      slider: (key, v) => Boolean(selCtl()?.setByKey(key, v)), evalInSketch: (code) => sandboxCall({ type: 'eval', code }, 2000) });
  }

  function saveDataUrl(dataUrl, name) {
    window.hub.saveFile({ defaultPath: name, filters: [{ name: 'PNG image', extensions: ['png'] }], content: dataUrl.split(',')[1], base64: true })
      .then((p) => p && toast('Screenshot saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }));
  }

  function modelTab(...a) { return labPart(K0, 'tools', 'modelTab', a); } // tools/three-lab-tools.js

  function shaderTab(...a) { return labPart(K0, 'tools', 'shaderTab', a); } // tools/three-lab-tools.js

  function textureTab(...a) { return labPart(K0, 'tools', 'textureTab', a); } // tools/three-lab-tools.js

  function docsTab(...a) { return labPart(K0, 'tools', 'docsTab', a); } // tools/three-lab-tools.js

  // Secondary tools, one click away in the "Tools" drawer: [id, label, hint, render, icon]
  const TOOL_TABS = [
    ['models', 'Model viewer', 'Open a .glb / .fbx / .obj, audit it, copy loader code', modelTab, '🧊'],
    ['shader', 'Shader playground', 'GLSL fragment shaders with live compile', shaderTab, '✦'],
    ['textures', 'Textures', 'Sizes, power-of-two, alpha, GPU memory, resize', textureTab, '▦'],
    ['docs', 'Docs', 'three.js classes, manual, examples, forum', docsTab, '📖'],
    ['color', 'Color', 'Convert colors (three.js, GLSL, AE), tints, contrast', (p) => Kit.colorTool(p), '🎨'],
    ['easing', 'Easing', 'Draw a bezier, get CSS / GSAP / three.js / AE code', (p) => Kit.easingTool(p), '〰'],
  ];
  function toolsDrawer(...a) { return labPart(K0, 'tools', 'toolsDrawer', a); } // tools/three-lab-tools.js
  Tools.define({
    id: 'three', name: 'Three.js Lab', icon: '◭', color: '#4f8cff',
    description: 'Live sketches, model viewer, shaders, textures and docs',
    onShow() { if (dropped) { if (window.LabWinHost?.away?.()) window.LabWinHost.paintCover?.(); else ensureMounted(); return; } if(window.ProjectWorkspace?.state().phase!=='opening')api.workspace?.resume(); }, // (round 161, fix161) dropped: the Lab window's card, no Lab
    mount(body, head) {
      tabs = Tabs(body, [
        { id: 'sketch', label: 'Sketch', render: sketchTab },
        ...TOOL_TABS.map(([id, label, , render]) => ({ id, label, render })),
      ], { storeKey: 'three.tab' });
      // The music-visual workflow is the default path: the Sketch tab is the only one on show. The secondary tools
      // (model viewer, shaders, textures, docs, color, easing) live in a compact "Tools" drawer, and the tab strip
      // moves up into the tool header so the Lab gains a whole row.
      tabs.bar.classList.add('lab-tabs');
      const toolsBtn = el('button', { class: 'lab-tools-btn', text: '🧰 Tools ▾', title: 'Model viewer, shader playground, textures, docs, color and easing tools', dataset: { feature: 'Tools drawer' }, on: { click: (e) => toolsDrawer(e.currentTarget) } });
      const back = el('button', { class: 'lab-back', text: '◭ Sketch', title: 'Back to the sketch (Esc)', dataset: { feature: 'Back to sketch' }, on: { click: () => tabs.show('sketch') } });
      tabs.bar.prepend(back);
      tabs.bar.append(toolsBtn);
      const paintTabs = () => { const on = tabs.current; tabs.bar.classList.toggle('on-tool', on !== 'sketch'); toolsBtn.textContent = on !== 'sketch' ? `🧰 ${TOOL_TABS.find((t) => t[0] === on)?.[1] || 'Tools'} ▾` : '🧰 Tools ▾'; };
      const show0 = tabs.show;
      tabs.show = (id) => { show0(id); paintTabs(); };
      for (const b of tabs.bar.querySelectorAll('button[data-id]')) b.addEventListener('click', paintTabs);
      paintTabs();
      if (head) { head.classList.add('lab-head'); head.querySelector('.tool-desc')?.after(tabs.bar); }
      mountAC = new AbortController(); // (round 161, fix161: let go with a dropped Lab, the surface's body stays)
      body.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tabs && tabs.current !== 'sketch' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) tabs.show('sketch'); }, { signal: mountAC.signal });
    },
    get commands() { return [
      { label: 'New three.js sketch', run: () => { tabs?.show('sketch'); } },
      { label: 'Open a 3D model', run: () => { tabs?.show('models'); setTimeout(() => api.openModel?.(), 100); } },
      { label: 'Shader playground', run: () => tabs?.show('shader') },
      { label: 'Inspect textures', run: () => tabs?.show('textures') },
      { label: 'three.js docs', run: () => tabs?.show('docs') },
      { label: 'Color converter', run: () => tabs?.show('color') },
      { label: 'Easing curve editor', run: () => tabs?.show('easing') },
      { label: 'Lab: present the preview fullscreen (P)', run: () => { tabs?.show('sketch'); setTimeout(() => api.lab?.present(), 80); } },
      { label: 'Lab: focus mode (F)', run: () => { tabs?.show('sketch'); api.lab?.focus(); } },
      { label: 'Lab: drop a cue at the playhead (C)', run: () => { tabs?.show('sketch'); api.lab?.cue(); } },
      ...(api.sketchList?.() || []).map((s) => ({ label: `Open sketch: ${s.name}`, run: () => { activate('tool:three'); tabs?.show('sketch'); api.openSketchById?.(s.id); } })),
      { label: 'Lab: contact sheet of the whole piece', run: () => { tabs?.show('sketch'); api.lab?.sheet(); } },
      { label: 'Lab console: always show', run: () => api.lab?.consoleMode('always') },
      { label: 'Lab console: only with the code', run: () => api.lab?.consoleMode('code') },
      { label: 'Lab console: only when I open it', run: () => api.lab?.consoleMode('never') },
      { label: 'Lab playback speed: 1×', run: () => api.lab?.speed(1) },
      { label: 'Lab playback speed: ½×', run: () => api.lab?.speed(0.5) },
      { label: 'Lab playback speed: ¼×', run: () => api.lab?.speed(0.25) },
    ]; },
  });

  // (round 161, fix161) Hearth's Lab let go entirely while the Lab window holds its scene (tools/three-labwin.js asks):
  // the rest path (workspace.close: edits saved, the preview page released), then the tab's outside hooks
  // (api.teardown), its DOM, every api.* it set and the module's caches. Nothing of the tab is reachable after it: the
  // GC takes its scenes, layers, editors and DOM. The surface stays "mounted" (showing the Lab window's card, not a new
  // Lab); anything that needs the Lab here (ThreeLab.cmd, a director call for another scene, a code block…) mounts a new
  // one first (ensureMounted), as on the Lab's first open, which reads the scenes from disk.
  async function drop() {
    if (dropped) return { ok: true, already: true };
    if (!tabs || !api.teardown) return { ok: false, why: 'not mounted' };
    if (inflight) await new Promise((r) => idleWaiters.push(r));
    try { await api.teardown(); } catch (err) { return { ok: false, why: err?.message || String(err) }; }
    const s = H.surfaces?.get('tool:three');
    // what other modules keep of the Lab's DOM (their own chips and buttons, put back when a new Lab is made) leaves it
    // first, so it doesn't keep the rest of the tab alive through its parent: LabDirection's and Finish's chips, Lab
    // search's button, the frame budget, the project look, the footage chip, the live dot, the sequence view
    for (const n of s?.el.querySelectorAll('.dir-chip, .fl-chip, .ls-btn, .three-stats > .fb, .lab-projlook, .mb-framechip, .live-lock, .sq-view') || []) n.remove();
    tabs.bar?.remove(); mountAC?.abort(); mountAC = null;
    s?.body.replaceChildren(); s?.head?.classList.remove('lab-head');
    tabs = null;
    for (const k of Object.keys(api)) delete api[k];
    hlEditors.clear(); for (const k of Object.keys(libFiles)) delete libFiles[k];
    dropped = true;
    dispatchEvent(new CustomEvent('hearth:lab-drop', { detail: { dropped: true } }));
    return { ok: true };
  }
  function ensureMounted() {
    if (dropped) {
      dropped = false;
      const s = H.surfaces?.get('tool:three');
      if (s) s.mounted = false;
      dispatchEvent(new CustomEvent('hearth:lab-drop', { detail: { dropped: false } }));
    }
    if (!tabs) Tools.shown(Tools.get('three'));
  }

  // Entry points used by chat code blocks.
  function ensureOpen(tab) {
    ensureMounted(); // (round 161, fix161)
    activate('tool:three');
    tabs?.show(tab);
  }

  // Tools for the Three Director (Claude). Calls switch the Lab to the Sketch tab so the user sees the result.
  // Per-chat scenes: a call from a chat goes to that chat's sketch (chat-scenes.js). The one on screen is driven
  // here as before; another chat's runs backstage (tools/three-backstage.js), so no chat edits another's scene.
  let inflight = 0; let idleWaiters = [];
  const settle = () => { if (inflight) return; const w = idleWaiters; idleWaiters = []; for (const fn of w) fn(); };
  // (round 116, layerdelete116) who made a call, for the owner's toast ("Astra deleted …")
  const aiName = (chatId) => { const c = chatId && (H.chats || []).find((x) => x.id === chatId); const a = c && H.agent?.(c.agentId); return a ? (a.engine === 'codex' ? 'Astra' : a.name || 'Claude') : 'The AI'; };
  async function handleTool(tool, args, ctx = {}) {
    if (!tabs) ensureMounted(); // load the Lab in the background if needed (round 161: a dropped Lab too)
    if (!tabs) return { ok: false, error: 'Three.js Lab could not be loaded.' };
    for (let i = 0; i < 100 && !api.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!api.director) return { ok: false, error: 'The Three.js Lab is still starting (it took over 10 s): nothing was changed. Call it again in a moment.' }; // (round 72) not a silent fall-through
    // (round 72, labbridge72) the chats' scene links are read first (a call routed before that went to the scene on screen)
    if (ctx.chatId && typeof ChatScenes !== 'undefined' && ChatScenes.ready) await Promise.race([ChatScenes.ready(), new Promise((r) => setTimeout(r, 5000))]);
    const route = typeof ChatScenes !== 'undefined' && api.scenes ? ChatScenes.routeThree(tool, ctx.chatId) : null;
    HubBridge.mark?.('route'); // (round 74, labcalls74)
    if (route && !route.sketchId) return { ok: false, error: route.error || 'This chat has no Lab scene: nothing was changed.' }; // (round 72) unlinked / not arrived yet, in words
    // the Lab sequence is one for every chat (its scenes are anyone's): never backstage
    if (tool === 'three_sequence' && typeof ThreeSeq !== 'undefined') return ThreeSeq.handle(tool, args, { sketchId: route?.sketchId || null });
    // the motion-design kit (tools/three-motion.js): its layers go through three_add_layer, so they reach this chat's scene
    if (tool === 'three_motion' && window.LabMotionIn?.owns(args.op)) { try { return { ok: true, value: await LabMotionIn.op(args, ctx) }; } catch (err) { return { ok: false, error: err.message }; } } // (round 25) 📷 camera in
    if (tool === 'three_motion' && typeof ThreeMotion !== 'undefined') return ThreeMotion.handle(args, { chatId: ctx.chatId, call: (t, a) => handleTool(t, a, ctx) });
    // comp (tools/three-comp.js): precomps in this chat's scene (on screen or not), parts dispatched to other chats
    if (tool === 'three_comp' && typeof ThreeComp !== 'undefined') return ThreeComp.handle(args, { chatId: ctx.chatId, sketchId: route?.sketchId || null });
    if (route && route.sketchId !== api.scenes.currentId() && typeof ThreeBackstage !== 'undefined') {
      const r = await ThreeBackstage.handle(tool, args, ctx.batch ? { ...route, batch: ctx.batch } : route); // (round 73) a call inside a batch / a helper: no picture of its own
      if (tool === 'three_new_sketch' && r?.newSketchId) ChatScenes.relink(route.chatId, r.newSketchId);
      return r;
    }
    inflight += 1;
    try {
      const r = await handleVisible(tool, args, ctx);
      if (route && tool === 'three_new_sketch' && r?.ok !== false) ChatScenes.relink(route.chatId, api.scenes.currentId());
      return r;
    } finally { inflight -= 1; settle(); }
  }
  async function handleVisible(tool, args, ctx = {}) {
    tabs.show('sketch');
    // A hidden view renders no frames, so let the Lab render (behind the current view) while the director works.
    // Only while it's hidden: the Lab on screen keeps its place (marking it too dropped the whole view, docked chat
    // included, behind the window for the length of every call, and replayed the skins' entrance animation after it).
    const surface = H.surfaces.get('tool:three')?.el;
    const capture = () => { if (surface) { const on = !surface.classList.contains('active'); if (surface.classList.contains('capturing') !== on) surface.classList.toggle('capturing', on); } };
    capture();
    addEventListener('hearth:view', capture);
    api.directorWork?.(1); live.why = tool;
    try { await api.rest?.wake?.(); return await directorCall(tool, args, ctx); } finally { removeEventListener('hearth:view', capture); surface?.classList.remove('capturing'); api.directorWork?.(-1); live.why = null; }
  }
  async function directorCall(tool, args, ctx = {}) {
    for (let i = 0; i < 100 && !api.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    const d = api.director;
    if (!d) return { ok: false, error: 'The sketch editor did not load.' };
    // footage frames and the cut list (tools/three-frames.js): frame steps / reads, frames in keyframes and markers
    if (typeof ThreeFrames !== 'undefined') { const r = await ThreeFrames.handle(tool, args, d); if (r) return r; }
    // the director's fast loop (tools/three-director.js): compact results, batches, diffs, screenshot options, undo
    if (typeof ThreeDirector !== 'undefined') { const r = await ThreeDirector.handle(tool, args, d, ctx); if (r) return r; }
    // (round 37, directorlean) the Lab's own answers, trimmed for the model (small pictures, one-line transport)
    const r = await labCall(tool, args, d, ctx);
    return typeof ThreeDirector !== 'undefined' && ThreeDirector.trim ? ThreeDirector.trim(tool, args, r) : r;
  }
  async function labCall(tool, args, d, ctx = {}) {
    if (tool === 'three_get_code') return { ok: true, value: d.getCode() };
    if (tool === 'three_set_code') {
      if (!String(args.code || '').trim()) return { ok: false, error: 'No code given.' };
      toast('Three Director updated the sketch', { timeout: 1500 });
      return { ok: true, value: await d.setCode(String(args.code), Number(args.wait) || 2.5) };
    }
    if (tool === 'three_new_sketch') {
      toast(`Three Director made "${args.name}"`, { timeout: 1500 });
      return { ok: true, value: await d.newSketch(String(args.name || 'Untitled'), String(args.code || ''), Number(args.wait) || 2.5) };
    }
    if (tool === 'three_console') return { ok: true, value: d.report() };
    if (tool === 'three_media_info') { const live = d.live(); return { ok: true, value: live.input || live.nowPlaying ? { ...d.media.info(), live } : d.media.info() }; }
    if (tool === 'three_load_media') {
      d.songOnScene(String(args.path || '')); // a song on the scene's own timeline: its cues come along
      const r = await d.media.load(String(args.path || ''));
      if (r.ok) d.assignMedia(String(args.path));
      if (!r.ok) return { ok: false, error: r.error };
      for (let i = 0; i < 240 && d.media.info().analysis === 'still analyzing'; i += 1) await new Promise((res) => setTimeout(res, 250));
      return { ok: true, value: d.media.info() };
    }
    if (tool === 'three_media_control') {
      if (!d.media.loaded) d.ensureTimeline(); // no song: the scene's own timeline
      if (!d.media.loaded) return { ok: false, error: 'No music loaded.' };
      if (args.action === 'loop') {
        if (!d.media.setLoop(args.time == null ? null : Number(args.time), Number(args.end))) return { ok: false, error: 'The user locked the loop points; ask them before changing it.' };
        return { ok: true, value: d.media.info() };
      }
      if (args.action === 'seek' || args.time != null) d.media.seek(Number(args.time) || 0);
      if (args.action === 'play') d.media.toggle(true);
      if (args.action === 'pause') d.media.toggle(false);
      await new Promise((res) => setTimeout(res, 600));
      return { ok: true, value: d.media.info() };
    }
    if (tool === 'three_layers') return { ok: true, value: d.layers() };
    if (tool === 'three_add_layer') {
      toast(`Three Director added a layer${args.name ? ` "${args.name}"` : ''}`, { timeout: 1500 });
      return { ok: true, value: await d.addLayer({ name: args.name, code: args.code, template: args.template, position: args.position, props: args.settings || {} }, Number(args.wait) || 2.5) };
    }
    if (tool === 'three_read_code') return { ok: true, value: d.readCode(args.layer, Number(args.from) || 1, args.to != null ? Number(args.to) : null) };
    if (tool === 'three_search_code') return { ok: true, value: d.searchCode(String(args.pattern || ''), { layer: args.layer || null, regex: Boolean(args.regex), context: Math.min(5, Math.max(0, Number(args.context ?? 1))) }) };
    if (tool === 'three_edit_code') return { ok: true, value: await d.editCode(args.layer, Array.isArray(args.edits) ? args.edits : [], Number(args.wait) || 2.5) };
    if (tool === 'three_update_layer') {
      const patch = { ...(args.settings || {}) };
      if (args.code != null) patch.code = args.code;
      if (args.order != null) patch.order = args.order;
      return { ok: true, value: await d.updateLayer(args.layer, patch, Number(args.wait) || (args.code != null ? 2.5 : 0.5)) };
    }
    if (tool === 'three_sliders') return { ok: true, value: d.sliders(args.layer, args.set || null) };
    if (tool === 'three_looks') return { ok: true, value: d.looks(args.layer, args.action || 'list', args.name) };
    if (tool === 'three_remove_layer') return { ok: true, value: await d.removeLayer(args.layers ?? args.layer ?? args.name, { who: args._owner && args._owner === window.LabChatLink?.ownerToken ? null : aiName(ctx.chatId) }) }; // (round 116) layers: several in one step
    if (tool === 'three_select_layer') return { ok: true, value: d.selectLayer(args.layer) };
    if (tool === 'three_set_frame') {
      if (!ThreeMedia.SIZES.some((x) => x.id === args.size)) return { ok: false, error: `size must be one of ${ThreeMedia.SIZES.map((x) => x.id).join(', ')}` };
      d.setFrame(args.size);
      await new Promise((res) => setTimeout(res, 1500));
      return { ok: true, value: d.report() };
    }
    if (tool === 'three_screenshot') {
      const url = await d.shot();
      if (!url) return { ok: false, error: 'No image: the sketch is not rendering (check three_console for errors).' };
      // Shrink to a JPEG so the image stays light for the model.
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const jpeg = await canvasDataUrl(c, 'image/jpeg', 0.85); // (round 20) encoded off the window's thread
      return { ok: true, images: [{ data: jpeg.split(',')[1], mime: 'image/jpeg' }], value: `Screenshot of "${d.getCode().sketch}" (${c.width}×${c.height}).` };
    }
    return labCallMore(tool, args, d);
  }
  function labCallMore(...a) { return labPart(K0, 'ai', 'labCallMore', a); } // tools/three-lab-ai.js
  // (round 23) the time machine notes who changed the scene (tools/three-history.js: Claude / Astra, and their turns)
  HubBridge.register(['three_'], (tool, args, ctx) => (window.ThreeHistory?.director ? ThreeHistory.director(tool, args, ctx, handleTool) : handleTool(tool, args, ctx)));
  return {
    openCode(code) { ensureOpen('sketch'); setTimeout(() => api.openCode?.(code), 60); },
    get lab() { return api.lab; }, // Lab actions (palette commands, MIDI simulation for tests)
    get workspace() { return api.workspace; },
    get rest() { return api.rest; }, // (round 154, mem154) the Lab's rest when unseen: state(), wake()
    drop, dropped: () => dropped, mountAgain: () => { ensureMounted(); return Boolean(tabs); }, // (round 161, fix161) the Lab let go entirely while the Lab window holds its scene
    get director() { return api.director; }, // the Lab's layer / slider / palette API (the FX picker and its chat commands use it)
    get scenes() { return api.scenes || null; }, // the sketches as data, for per-chat scenes (chat-scenes.js)
    get stageHooks() { return api.stageHooks || null; }, // (round 22) tools/three-stage*.js
    get layerStudio() { return api.layerStudio || null; },
    get present() { return api.present || null; }, // (round 52, gamemode) the player (its song pauses while a game plays)
    get tm() { return api.tm || null; }, // (round 23) tools/three-history*.js
    get shaderHost() { return api.shaderHost || null; }, // (round 23) tools/three-shader.js: the code editor, its errors, the selected layer
    get safe() { return api.safe || null; }, // (round 147, safeopen147) Safe open (tools/three-safeopen.js)
    get healthHost() { return api.healthHost || null; }, // (round 80, laberrors80) tools/three-health.js
    get framebar() { return api.framebar || null; }, // (round 64, framebar64) ▮ the frame budget bar (tools/framebar.js)
    get speed() { return api.speed || null; }, // (round 133, speed133) ⚡ the speed check (tools/three-speed*.js)
    get quality() { return api.quality || null; }, // (round 142, smooth142) Smooth (auto) · Balanced · Force high quality
    get groupsHost() { return api.groupsHost || null; }, // (round 44) layer groups (tools/three-groups.js)
    get search() { return api.search || null; }, // (round 36) 🔎 Lab search: the menus, layers and sliders it lists (tools/three-search.js)
    // resolves when no director call is changing the sketch on screen (a chat switch waits for it)
    idle: () => (inflight ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve()),
    _sandbox: (parent, onMessage, params, o = {}) => sandboxFrame(parent, 'sketch', onMessage, params, { lazy: true, name: 'backstage', ...o }), // tools/three-backstage.js · (round 43) o.gpuStuck: 'owner' (the export page)
    _lib: sandboxLib, // (round 37, labboot) the motion / lab3d kits for the warm page (tools/three-boot.js)
    live: { counts: () => live.counts() }, // reloads vs in-place updates of the preview (dev/checks/live.js)
    // (round 43, glrecover) the preview without its GPU contexts: state() { phase: null | 'lost' | 'remaking', … },
    // wait(ms) resolves true once it draws again (at once when it does)
    gl: { state: () => api.gl?.state?.() || { phase: null }, wait: (ms) => (api.gl ? api.gl.wait(ms) : Promise.resolve(true)) },
    _util: { codeOrOutline, numbered },
    // A picture of the Lab preview (data URL) for second opinions; null when nothing renders.
    shot: async () => (api.director ? api.director.shot() : null),
    // Files dropped in the Three Director's chat become references of the open sketch.
    // (round 72, labbridge72) o.sketchId: that scene's references (a chat's scene backstage), not the one on screen
    addReference: (p, o = {}) => (api.addRef ? api.addRef(p, o) : Promise.reject(new Error('Open the Three.js Lab first'))),
    addReferences: (paths) => (api.addRefs ? api.addRefs(paths) : Promise.reject(new Error('Open the Three.js Lab first'))), // (round 99, labmodels99) a folder, or a model with its files
    refAdded: () => api.refAdded?.() || null, // (round 99, labmodels99) the last reference added: its files, what it came without
    refsOf: (id) => api.refsFor?.(id) || [],
    keepVersion: (sid, layerId, code) => api.keepVersion?.(sid, layerId, code) || false, // (round 102) tools/three-backstage.js
    removeReference: (refId, o = {}) => (api.removeRef ? api.removeRef(refId, o) : false), // (round 73)
    isReference: (name) => /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v|mkv|glb|gltf|obj|fbx|stl|ply|mp3|wav|ogg|m4a|flac|aac|ttf|otf|woff2?|hdr|exr)$/i.test(name),
    openShader(code) { ensureOpen('shader'); setTimeout(() => api.openShader?.(code), 60); },
    restartVisible: () => api.restartVisible?.() ?? false,
    onScreen: () => api.onScreen?.() ?? false,
    // The chat commands' way in (tools/three-cmds.js): the Lab, loaded and shown (unless show: false), with its
    // sketch tab on top; resolves to api.cmd.
    async cmd({ show = true, sketch = null } = {}) {
      if (show && H.surfaceIdFor?.(H.activeId) !== 'tool:three') activate('tool:three', { focus: false });
      if (!tabs && sketch) startHint = sketch; // (round 73) only the first mount: later ones keep the Lab's own scene
      if (!tabs) ensureMounted(); // (round 161, fix161: a dropped Lab mounts again)
      if (show && tabs?.current !== 'sketch') tabs.show('sketch');
      for (let i = 0; i < 80 && !(api.cmd && api.director); i += 1) await new Promise((r) => setTimeout(r, 100));
      if (!api.cmd) throw new Error('The Three.js Lab did not load');
      return api.cmd;
    },
    toolTabs: () => TOOL_TABS.map(([id, label, hint]) => ({ id, label, hint })),
    peek: () => api.cmd || null, // the commands' completions: only when the Lab is already loaded
    showTab(id) { ensureOpen(id); },
    // run a Lab action from anywhere (the command palette): opens the Lab first
    async act(name) {
      ensureOpen('sketch');
      for (let i = 0; i < 60 && !api.actions; i += 1) await new Promise((r) => setTimeout(r, 100));
      api.actions?.[name]?.();
    },
  };
})();

// ---------- the Lab in the command palette (Ctrl+K) ----------
for (const [label, name] of [
  ['Lab: Restart the simulation', 'restart'], ['Lab: Freeze / unfreeze the picture', 'freeze'], ['Lab: Keys', 'keys'],
  ['Lab: ⚡ Triggers', 'triggers'], ['Lab: Write triggers to the timeline', 'writeTriggers'],
  ['Lab: Live sound from this PC (Spotify, YouTube…)', 'liveSystem'], ['Lab: Live sound off', 'liveOff'], ['Lab: Show / hide what\'s playing', 'nowPlaying'],
  ['Lab: Present', 'present'], ['Lab: Stage window', 'stage'], ['Lab: Show / hide the code', 'code'], ['Lab: Load music or video…', 'music'],
  ['Lab: Save a screenshot', 'shot'], ['Lab: Copy a screenshot', 'copyShot'], ['Lab: Contact sheet', 'sheet'], ['Lab: New sketch from a template', 'newSketch'],
  ['Lab: All timeline controls / fewer', 'allControls'], ['Lab: Mute / unmute the music', 'mute'],
  ['Lab: Composition guides (thirds, golden, center)', 'guides'], ['Lab: Loop this bar', 'loopBar'], ['Lab: Next snap setting', 'snap'],
  ['Lab: Quantize markers to the grid', 'quantize'], ['Lab: Remove double markers', 'dedupe'], ['Lab: Cycle looks every 4 bars / off', 'cycleLooks'],
  ['Lab: Copy all the code', 'copyCode'], ['Lab: Save the sliders into the code', 'saveSliders'], ['Lab: Save the sliders as a look…', 'saveLook'], ['Lab: Stage window always on top / normal', 'stageTop'],
  ['Lab: Shuffle the sliders (R)', 'shuffle'], ['Lab: The shuffle before (Shift+R)', 'shuffleBack'], ['Lab: Recall slot A', 'slotA'], ['Lab: Recall slot B', 'slotB'], ['Lab: Recall slot C', 'slotC'],
  ['Lab: Store the sliders in slot A', 'storeA'], ['Lab: Store the sliders in slot B', 'storeB'], ['Lab: Save as a look (quick)', 'quickLook'], ['Lab: Next look', 'nextLook'],
  ['Lab: Freeze on the next beat', 'freezeBeat'], ['Lab: Pin this frame to compare (|)', 'pin'], ['Lab: Compare off', 'compareOff'], ['Lab: Still at the exact frame size', 'still'], ['Lab: Safe zones on / off', 'safe'],
  ['Lab: Live sound on / off (Shift+L)', 'live'], ['Lab: Auto bars', 'autoBars'], ['Lab: Mark the song\'s sections', 'sections'], ['Lab: Click track on / off', 'clickTrack'], ['Lab: Quantize taps on / off (Q)', 'quantizeTaps'],
  ['Lab: Frame 9:16 (1080×1920)', 'size916'], ['Lab: Frame 16:9 (1920×1080)', 'size169'], ['Lab: Frame 4:5 (1080×1350)', 'size45'], ['Lab: Frame 1:1 (1080×1080)', 'size11'], ['Lab: Fit the frame', 'sizeFit'],
  ['Lab: Show scene controls (I)', 'stageShow'], ['Lab: Clean stage (hide the preview\'s controls until you point at them)', 'stageClean'], // (round 150, stage150)
  ['Lab: Next sketch (Ctrl+PgDn)', 'nextSketch'], ['Lab: Previous sketch (Ctrl+PgUp)', 'prevSketch'], ['Lab: Tools drawer', 'tools'],
]) AppUI.addAction(label, () => ThreeLab.act(name));
