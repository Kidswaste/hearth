// ▶ Play (round 52, gamemode): the game window's preload (sandboxed, isolated: the game never sees Node or Hearth).
// It adds three things over the game, in a shadow root so the game's styles can't touch them:
//   - a short hint at the start ("Esc: menu · F: stats"), gone after 3 s;
//   - the leave card on Esc: "Back to Hearth" (Enter, or Esc again) / "Keep playing";
//   - the stats chip on F (off by default; F while the mouse isn't captured by the game): fps, frame time, the
//     screen's refresh, and how the game runs ("one canvas (3 of 3 layers) · page", "HTML build").
// The game itself may use a narrow API, only if it asks: window.hearthGame = { leave(), info() } (tools/game-api.md).
// For an HTML build, WebGL contexts are asked for at max fidelity (antialias, the fast GPU) unless the game says otherwise.
// (round 53, gameinput) Nothing here listens to the game's input: Esc, Enter and F are read by the window's main-side
// key handler (gameinputmain.js), which tells this page to show the card or the chip; only the rare pointer-lock
// change is listened to. A game's pointer lock asks for raw mouse movement (unadjustedMovement: no OS acceleration)
// unless it asks itself, with the plain kind as the fallback where the system has none.
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const MODP = process.platform === 'darwin' ? '⌘P' : 'Ctrl+P'; // (round 53, playloop: back to editing, the game kept)

const arg = (process.argv || []).find((a) => a.startsWith('--hearth-game='));
let I = {}; try { I = JSON.parse(decodeURIComponent(arg ? arg.slice(14) : '%7B%7D')); } catch { I = {}; }

contextBridge.exposeInMainWorld('hearthGame', {
  leave: () => ipcRenderer.send('game:back'),
  info: () => ipcRenderer.invoke('game:info').then((x) => (x ? { title: x.title, hz: x.hz, how: x.how, display: x.display } : null)),
});

// before the game's own scripts, in its world:
//   - (an HTML build) a WebGL context it makes gets antialias + the high-performance GPU by default (+ the low-latency
//     canvas when /game lowlatency is on);
//   - (every game, round 53) requestPointerLock() asks for raw movement; where the system refuses (NotSupportedError)
//     the plain kind is asked instead. `.hearthRaw` on the function says how it went ('raw' | 'fallback' | 'refused (…)').
//     The game letting the mouse go itself (exitPointerLock) is told to this page (one event, only then): see below.
const RAW = `(() => { const P = Element.prototype; const rpl = P.requestPointerLock; if (!rpl || rpl.hearthRaw !== undefined) return;
  const f = function (o) {
    if (o && typeof o === 'object' && 'unadjustedMovement' in o) return rpl.call(this, o);
    f.hearthRaw = 'asked';
    let p; try { p = rpl.call(this, { ...(o || {}), unadjustedMovement: true }); } catch (e) { f.hearthRaw = 'fallback'; return rpl.call(this, o); }
    if (!p || !p.then) { f.hearthRaw = 'raw'; return p; }
    return p.then((v) => { f.hearthRaw = 'raw'; return v; }, (err) => { if (err && err.name === 'NotSupportedError') { f.hearthRaw = 'fallback'; return rpl.call(this, o); } f.hearthRaw = 'refused (' + (err && err.name) + ')'; throw err; });
  };
  f.hearthRaw = null; P.requestPointerLock = f;
  const D = Document.prototype; const xpl = D.exitPointerLock;
  if (xpl) D.exitPointerLock = function () { dispatchEvent(new Event('hearth-game-unlock')); return xpl.call(this); }; })();`;
// (round 76, gpuplay76) three.js always passes powerPreference: 'default' (it isn't asking for a card): that no longer
// overrides the fast card (on a two-card laptop / Mac an HTML build was left on the small one)
const GL = `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { if (/^(webgl2?|experimental-webgl)$/.test(t)) { o = { antialias: true, ${I.lowLatency ? 'desynchronized: true, ' : ''}...(o || {}) }; if (!o.powerPreference || o.powerPreference === 'default') o.powerPreference = 'high-performance'; } return g.call(this, t, o); }; })();`;
// (round 76, gpuplay76) the page's WebGL contexts, noted when made (only then: nothing per frame), for 📈 Test play
// performance (gpuplay.js times the graphics card's work on them during its 20 s, and reads the card WebGL got)
const REG = `(() => { const P = HTMLCanvasElement.prototype; const g = P.getContext; if (g.__hearthReg) return; const seen = new WeakSet(); let list = []; Object.defineProperty(window, '__hearthGLs', { value: () => { list = list.filter((w) => { const c = w.deref(); return c && !c.isContextLost(); }); return list.map((w) => w.deref()); }, configurable: true });
  const f = function (t, o) { const c = g.call(this, t, o); if (c && (t === 'webgl2' || t === 'webgl' || t === 'experimental-webgl') && !seen.has(c)) { seen.add(c); list.push(new WeakRef(c)); } return c; }; f.__hearthReg = true; P.getContext = f; })();`;
const code = `${RAW}\n${REG}\n${I.kind === 'html' ? GL : ''}`;
try { if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: new Function(code) }); else webFrame.executeJavaScript(code); } catch { try { webFrame.executeJavaScript(code); } catch { /* plain */ } } // eslint-disable-line no-new-func

let ui = null;
function mount() {
  if (ui) return ui;
  const host = document.createElement('hearth-game-ui');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;all:initial;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { all: initial; }
    .w { position: fixed; inset: 0; pointer-events: none; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #eef0f4; }
    .hint { position: fixed; left: 16px; bottom: 14px; padding: 6px 10px; border-radius: 8px; background: #0009; opacity: 1; transition: opacity .6s; }
    .hint.out { opacity: 0; }
    .col { position: fixed; right: 12px; top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .chip { padding: 4px 9px; border-radius: 7px; background: #000a; font: 12px/1.3 ui-monospace, Menlo, Consolas, monospace; white-space: nowrap; }
    .look { padding: 3px 9px; border-radius: 7px; background: #0008; color: #c9ced8; font-size: 11.5px; white-space: nowrap; }
    .note { max-width: min(560px, 80vw); padding: 3px 9px; border-radius: 7px; background: #0008; color: #ffcf9e; font-size: 11.5px; }
    .acts { display: flex; gap: 6px; pointer-events: auto; } .acts button { font: 600 11.5px system-ui, sans-serif; padding: 3px 9px; margin: 0; border-radius: 7px; background: #000a; color: #eef0f4; }
    .acts button:hover { background: #2a2e37; }
    .card { position: fixed; inset: 0; display: grid; place-items: center; background: #000a; pointer-events: auto; }
    .box { min-width: 280px; padding: 22px 24px 18px; border-radius: 14px; background: #16181d; box-shadow: 0 12px 40px #000c; text-align: center; }
    .t { font-size: 16px; font-weight: 600; margin-bottom: 4px; } .s { color: #a7adb8; margin-bottom: 16px; }
    button { font: 600 14px system-ui, sans-serif; border: 0; border-radius: 9px; padding: 9px 16px; margin: 0 4px; cursor: pointer; }
    .back { background: #ff8a3d; color: #1a1206; } .keep { background: #2a2e37; color: #eef0f4; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    [hidden] { display: none !important; }
    .blip { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); padding: 4px 11px; border-radius: 999px; background: #000b; font-size: 12px; opacity: 0; transition: opacity .25s; }
    .blip.on { opacity: 1; }
    .err { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); max-width: min(760px, 92vw); display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 14px; border-radius: 10px; background: #1b1d22ee; box-shadow: 0 6px 24px #0008; pointer-events: auto; }
    .err .m { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .err button, .box .fix { padding: 5px 11px; font-size: 12px; margin: 0; } .err .x { background: transparent; color: #a7adb8; padding: 5px 7px; }
    .fixit { background: #ff8a3d; color: #1a1206; } .box .fix { display: block; margin: 12px auto 0; }
    .pfpill { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); padding: 5px 12px; border-radius: 999px; background: #000b; font-size: 12.5px; }
    .pf { position: fixed; right: 12px; top: 12px; width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; padding: 16px 18px 14px; border-radius: 14px; background: #16181df2; box-shadow: 0 12px 40px #000c; pointer-events: auto; }
    .pf h2 { margin: 0 0 6px; font-size: 15px; } .pf .ph { font-weight: 600; line-height: 1.4; margin: 0 0 8px; }
    .pf ul { margin: 0 0 8px; padding-left: 18px; color: #c9ced8; font-size: 12px; line-height: 1.45; } .pf .tip { margin: 0 0 8px; color: #ffcf9e; font-size: 12px; line-height: 1.4; }
    .pf .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } .pf .row button { font-size: 12px; padding: 6px 11px; margin: 0; background: #2a2e37; color: #eef0f4; } .pf .row button:hover { background: #3a3f4a; }
    .pf .row .copy { background: #ff8a3d; color: #1a1206; } .pf .pn { margin: 8px 0 0; font-size: 11.5px; color: #9fe0a8; } .pf .sm { margin: 8px 0 0; font-size: 11px; color: #8a909b; }
  </style><div class="w"><div class="hint">Esc: menu · F: stats · ${MODP}: back to editing${I.notesKey ? ` · ${String(I.notesKey).replace(/[<>&]/g, '')}: note` : ''}${I.hitch ? ' · ● recording the hitch map' : ''}</div><div class="col"><div class="chip" hidden></div><div class="acts" hidden>${I.notesKey ? `<button class="an" tabindex="-1">✎ Note (${String(I.notesKey).replace(/[<>&]/g, '')})</button>` : ''}<button class="aq" tabindex="-1" hidden title="Auto: fewer pixels when frames drop, back up when there's room · Full: every pixel (click to switch)"></button><button class="ah" tabindex="-1">${I.hitch ? '■ Stop hitch map' : '● Record hitch map'}</button><button class="ap" tabindex="-1" title="20 s of play measured: frames vs your screen, graphics card vs processor, what to change">📈 Test performance</button></div><div class="look" hidden></div><div class="note" hidden></div></div><div class="blip" aria-live="polite"></div><div class="pfpill" hidden aria-live="polite"></div><div class="pf" hidden role="dialog" aria-label="Play performance"></div>
  <div class="err" hidden role="alert"><span class="m"></span><button class="fixit">Fix with the director</button><button class="x" aria-label="Hide">✕</button></div>
  <div class="card" hidden role="dialog" aria-label="Leave the game"><div class="box"><div class="t"></div><div class="s">Esc again or Enter goes back</div>
  <button class="back">Back to Hearth</button><button class="keep">Keep playing</button><button class="fix fixit" hidden>Fix with the director</button></div></div></div>`;
  (document.documentElement || document).appendChild(host);
  const $ = (s) => root.querySelector(s);
  ui = { host, hint: $('.hint'), chip: $('.chip'), acts: $('.acts'), ah: $('.ah'), aq: $('.aq'), pfpill: $('.pfpill'), pf: $('.pf'), look: $('.look'), note: $('.note'), card: $('.card'), back: $('.back'), keep: $('.keep'), title: $('.t'), blip: $('.blip'), err: $('.err'), errText: $('.err .m'), cardFix: $('.box .fix') };
  for (const b of root.querySelectorAll('.fixit')) b.addEventListener('click', () => fixIt());
  // (round 64, clickfirst64) the F chip's two words, clicked with the mouse (when the game doesn't hold it): ✎ Note = F8;
  // ● Record / ■ Stop the hitch map (the hub keeps the setting). They never take the focus (Space / Enter stay the
  // game's), and the game never sees these clicks.
  for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick']) ui.acts.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'mousedown' || t === 'pointerdown') e.preventDefault(); });
  root.querySelector('.an')?.addEventListener('click', () => ipcRenderer.send('game:chip', 'note'));
  root.querySelector('.ap')?.addEventListener('click', () => ipcRenderer.send('game:chip', 'perftest')); // (round 76, gpuplay76) the hub runs the test on this game
  ui.ah.addEventListener('click', () => { ipcRenderer.send('game:chip', 'hitch'); ui.ah.textContent = /Record/.test(ui.ah.textContent) ? '■ Stop hitch map' : '● Record hitch map'; });
  // (round 72, labfps72) Quality: auto ⇄ full, now in this game (gamequality-preload.js) and remembered by the hub
  ui.aq.addEventListener('click', () => {
    const to = /auto/.test(ui.aq.textContent) ? 'full' : 'auto';
    ui.aq.textContent = `Quality: ${to}`;
    webFrame.executeJavaScript(`window.__gameQuality ? window.__gameQuality.set(${JSON.stringify(to)}) : ''`).then((t) => { if (t) qual = String(t); }).catch(() => {});
    ipcRenderer.send('game:chip', `quality-${to}`);
  });
  root.querySelector('.err .x').addEventListener('click', () => { ui.err.hidden = true; });
  ui.title.textContent = I.title ? `Leave ${I.title}?` : 'Leave the game?';
  ui.back.addEventListener('click', () => ipcRenderer.send('game:back'));
  ui.keep.addEventListener('click', () => { menu(false); ipcRenderer.send('game:menu-off'); });
  setTimeout(() => ui.hint.classList.add('out'), 3000);
  setTimeout(() => { ui.hint.hidden = true; }, 3800);
  return ui;
}
function menu(on) {
  const u = mount();
  u.card.hidden = !on;
  u.cardFix.hidden = !(on && lastErr);
  if (on) { try { document.exitPointerLock?.(); } catch { /* fine */ } setTimeout(() => u.back.focus(), 0); }
}
// (round 53, gameinput) the main side reads the keys (Esc: the card, Esc again / Enter: leave, F: the chip): no key
// listener of Hearth's in the game's page; only whether the mouse is captured is told (F is the game's then)
ipcRenderer.on('game:menu', () => menu(true));
ipcRenderer.on('game:stats', () => stats(!statsOn));
// the mouse let go while the game had it, not by the game itself and not by the window losing the focus: that was Esc,
// which Chromium keeps for itself while the mouse is captured (the card would have needed a second Esc)
let gameLetGo = -1e9;
addEventListener('hearth-game-unlock', () => { gameLetGo = performance.now(); });
document.addEventListener('pointerlockchange', () => {
  const on = Boolean(document.pointerLockElement);
  ipcRenderer.send('game:lock', on);
  if (!on && !(ui && !ui.card.hidden) && !NB.open && document.hasFocus() && performance.now() - gameLetGo > 400) { menu(true); ipcRenderer.send('game:menu-on'); } // (round 62, playnotes62: the notes' words box let the mouse go, not Esc)
});

// ---------- the stats chip: frames counted only while it shows ----------
let statsOn = false; let raf = 0; let gaps = []; let last = 0; let lastPaint = 0; let how = I.how || ''; let hz = I.hz || 0;
// (round 54, gameaudio) the sound's latency on the chip ("sound 12 ms"), read from the game's page (tools/gameaudio-page.js) every 2 s while the chip shows
let snd = ''; let sndAt = -1e9;
// (round 55, playbudget) and Hearth's own work in the game a frame ("Hearth: 0.03 ms", tools/playbudget-page.js), which
// counts this chip's own time too (told with the same read); a helper it switched off for being slow: one plain line
let hearth = ''; let note = ''; let chipMs = 0;
let qual = ''; // (round 72, labfps72) the game's Quality line (gamequality-preload.js), read with the same 2 s read
let hitchLine = ''; // (round 63, hitchmap63) "● Hitch map 2:31" first on the chip while it records (read with the same 2 s read)
const sound = () => {
  const ms = chipMs; chipMs = 0;
  try {
    webFrame.executeJavaScript(`(function () { var a = window.__gameAudio, b = window.__hearthBudget, h = window.__hearthHitch, q = window.__gameQuality; return JSON.stringify({ s: a ? a.line() : '', b: b ? b.chip(${ms.toFixed(4)}) : null, h: h ? h.line() : '', q: q ? q.line() : '' }); })()`).then((v) => {
      let o = null; try { o = JSON.parse(v); } catch { o = null; }
      snd = o && typeof o.s === 'string' ? o.s : ''; hearth = o?.b?.line || ''; note = o?.b?.note || ''; hitchLine = typeof o?.h === 'string' ? o.h : ''; qual = typeof o?.q === 'string' ? o.q : ''; // (round 72, labfps72) "Quality auto · 85 %"
      if (ui?.aq) { const qw = qual ? (/full/.test(qual) ? 'Quality: full' : 'Quality: auto') : ''; if (ui.aq.textContent !== qw) ui.aq.textContent = qw; ui.aq.hidden = !qw; }
      if (ui) { if (ui.note.textContent !== note) ui.note.textContent = note; ui.note.hidden = !(statsOn && note); const hw = hitchLine.startsWith('●') ? '■ Stop hitch map' : '● Record hitch map'; if (ui.ah.textContent !== hw) ui.ah.textContent = hw; } // (round 64, clickfirst64) the chip's hitch word follows the recording
    }).catch(() => {});
  } catch { /* fine */ }
};
function tick(t) {
  if (!statsOn) { raf = 0; return; }
  const a0 = performance.now();
  latFlush(); // (round 56, playlatency) the inputs since the last frame: this is the frame that reads them
  if (last) gaps.push(t - last);
  last = t;
  if (t - lastPaint > 500 && gaps.length) {
    lastPaint = t;
    const g = gaps.slice(-240); const avg = g.reduce((a, b) => a + b, 0) / g.length;
    if (t - sndAt > 2000) { sndAt = t; sound(); }
    const inp = latFigure();
    const line = `${hitchLine ? `${hitchLine} · ` : ''}${Math.round(1000 / avg)} fps · ${avg.toFixed(1)} ms · ${Math.round(hz || 60)} Hz${inp ? ` · ${inp}` : ''}${how ? ` · ${how}` : ''}${snd ? ` · ${snd}` : ''}${qual ? ` · ${qual}` : ''}${hearth ? ` · ${hearth}` : ''}`;
    if (ui.chip.textContent !== line) ui.chip.textContent = line;
    gaps = g.slice(-120);
  }
  raf = requestAnimationFrame(tick);
  chipMs += performance.now() - a0;
}
function stats(on) {
  statsOn = Boolean(on);
  latOn('chip', statsOn); // (round 56, playlatency) "Input: x ms" from your own keys / mouse, only while the chip shows
  const u = mount();
  u.chip.hidden = !statsOn; u.acts.hidden = !statsOn; // (round 64, clickfirst64) ✎ Note / ● Record hitch map under the chip, only while it shows
  u.look.hidden = true; u.note.hidden = !(statsOn && note);
  if (statsOn) {
    // (round 54, gamelook) under the chip, what the look did, in plain words (gamelook-preload.js, in the game's world)
    webFrame.executeJavaScript('window.__gameLook ? window.__gameLook.text() : ""').then((t) => { if (statsOn && t) { u.look.textContent = String(t); u.look.hidden = false; } }).catch(() => {});
    gaps = []; last = 0; lastPaint = 0; sndAt = -1e9; chipMs = 0; u.chip.textContent = '… fps';
    ipcRenderer.invoke('game:info').then((x) => { if (x) { how = x.how || how; hz = x.hz || hz; } }).catch(() => {});
    if (!raf) raf = requestAnimationFrame(tick);
  }
}
addEventListener('DOMContentLoaded', () => mount());

// ---------- input → the game's frame (round 56, playlatency) ----------
// Measured only while the F chip shows ("Input: 3.1 ms": your own keys and mouse) or /game latency runs (2 s of tiny
// synthetic input from the main side, playlatencymain.js); otherwise not one listener or frame callback of this exists.
// Per input: its own timestamp (the OS's) → handled (every capture listener so far) → the start of the next animation
// frame (where the game reads it). Passive listeners in this preload's world: nothing is held or re-sent.
const LAT = { users: new Set(), pend: [], k: [], m: [], et: [], gaps: [], last: 0, raf: 0, obs: null };
const LAT_TYPES = ['keydown', 'pointerdown', 'pointermove'];
const latEv = (e) => { if (LAT.pend.length < 64) LAT.pend.push([e.type === 'pointermove' ? 1 : 0, e.timeStamp, performance.now()]); };
function latFlush() {
  if (!LAT.pend.length) return;
  const now = performance.now();
  for (const [mv, ts, h] of LAT.pend) { const a = mv ? LAT.m : LAT.k; a.push([h - ts, now - ts]); if (a.length > 600) a.shift(); }
  LAT.pend.length = 0;
}
// the chip's figure: the typical input → frame of the last few seconds of play
function latFigure() {
  const a = [...LAT.k.slice(-120), ...LAT.m.slice(-120)].map((x) => x[1]).sort((x, y) => x - y);
  if (a.length < 3) return '';
  const v = a[Math.floor(a.length / 2)];
  return `Input: ${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
}
function latLoop(t) {
  if (!LAT.users.has('measure')) { LAT.raf = 0; return; }
  if (LAT.last) { LAT.gaps.push(t - LAT.last); if (LAT.gaps.length > 2400) LAT.gaps.shift(); }
  LAT.last = t; latFlush();
  LAT.raf = requestAnimationFrame(latLoop);
}
function latOn(who, on) {
  const had = LAT.users.size > 0;
  if (on) LAT.users.add(who); else LAT.users.delete(who);
  const has = LAT.users.size > 0;
  if (has && !had) { LAT.pend.length = 0; for (const t of LAT_TYPES) addEventListener(t, latEv, { capture: true, passive: true }); }
  if (!has && had) { for (const t of LAT_TYPES) removeEventListener(t, latEv, { capture: true }); LAT.pend.length = 0; LAT.k = []; LAT.m = []; }
  if (who !== 'measure') return;
  if (on) {
    LAT.k = []; LAT.m = []; LAT.et = []; LAT.gaps = []; LAT.last = 0;
    try { LAT.obs = new PerformanceObserver((l) => { for (const x of l.getEntries()) if (LAT.et.length < 600 && /^(keydown|pointerdown)$/.test(x.name)) LAT.et.push(x.duration); }); LAT.obs.observe({ type: 'event', durationThreshold: 16, buffered: false }); } catch { LAT.obs = null; }
    if (!LAT.raf) LAT.raf = requestAnimationFrame(latLoop);
  } else { try { LAT.obs?.disconnect(); } catch { /* fine */ } LAT.obs = null; }
}
ipcRenderer.on('game:lat', (_e, d = {}) => {
  if (d.on) { latOn('measure', true); return; }
  latFlush();
  const out = JSON.stringify({ k: LAT.k, m: LAT.m, et: LAT.et, gaps: LAT.gaps });
  latOn('measure', false);
  if (statsOn) { LAT.k = []; LAT.m = []; } // (the chip's own figure starts again from your input)
  ipcRenderer.send('game:lat-result', out);
});
// (round 55, playbudget) the page switched one of Hearth's helpers off (it was slowing the game): Hearth keeps that for
// this game (gamemodemain.js → playbudgetmain.js). One event, only then; the numbers are read from the page once
addEventListener('hearth-budget', () => {
  try { webFrame.executeJavaScript('window.__hearthBudget ? window.__hearthBudget.pub() : ""').then((j) => { if (j) ipcRenderer.send('game:budget', String(j).slice(0, 50000)); if (statsOn) sound(); }).catch(() => {}); } catch { /* fine */ }
});


// ---------- the edit → play loop (round 53, playloop: playloopmain.js, playloop.js) ----------
// "Updated" after a live edit; a runtime error as one calm line over the game ("Clink stopped: ReferenceError: … (line
// 12) — Fix with the director"), also on the Esc card. Fix sends the error to Hearth, which drafts it in the docked
// director chat (never sent). A Lab scene's page reports its errors itself (the Lab player's 'error' messages, with
// the layer and line); an HTML build's come from the page's error events.
let lastErr = null; let blipT = 0;
ipcRenderer.on('game:blip', (_e, b = {}) => {
  const u = mount();
  u.blip.textContent = `↻ ${b.text || 'Updated'}`;
  u.blip.classList.add('on');
  if (lastErr && b.clear) { lastErr = null; u.err.hidden = true; } // (a new version goes in: the old error may be gone; one of the new code shows after this)
  clearTimeout(blipT); blipT = setTimeout(() => u.blip.classList.remove('on'), 1400);
});
function showErr(d) {
  const msg = String(d.message || 'error').replace(/^Uncaught /, '').slice(0, 300);
  if (lastErr && lastErr.message === msg && lastErr.line === (d.line || null)) { lastErr.n += 1; return; }
  lastErr = { message: msg, line: Number(d.line) || null, layer: d.layer ? String(d.layer) : null, file: d.file ? String(d.file) : null, stack: d.stack ? String(d.stack).slice(0, 1200) : null, n: 1 };
  const u = mount();
  u.errText.textContent = `${I.title || 'The game'} stopped: ${msg}${lastErr.line ? ` (line ${lastErr.line})` : ''}`;
  u.err.title = u.errText.textContent;
  u.err.hidden = false;
}
function fixIt() {
  if (!lastErr) return;
  ipcRenderer.send('game:fix', lastErr);
  if (ui) { if (!ui.card.hidden) ipcRenderer.send('game:menu-off'); ui.err.hidden = true; ui.card.hidden = true; } // (gameinput's main side knows the card is gone)
}
// (playloop) back to editing with the card open: the card goes (the main side already forgot it)
ipcRenderer.on('game:menu-close', () => { if (ui) menu(false); });
if (I.kind === 'lab') {
  addEventListener('message', (e) => { const d = e.data; if (d && d.source === 'three-sandbox' && d.type === 'error') showErr(d); });
} else {
  const rel = (f) => { try { const u = new URL(f); return decodeURIComponent(u.pathname.replace(/^\//, '')); } catch { return f || null; } };
  addEventListener('error', (e) => { if (e.message) showErr({ message: e.message, line: e.lineno, file: rel(e.filename), stack: e.error && e.error.stack }); });
  addEventListener('unhandledrejection', (e) => { const r = e.reason; showErr({ message: (r && (r.message ? `${r.name || 'Error'}: ${r.message}` : String(r))) || 'a promise failed', stack: r && r.stack }); });
}


// ---------- playtest notes (round 62, playnotes62: playnotesmain.js reads the key main-side, like Esc / F) ----------
// F8 (the key set with /playtest key) drops a note: "✎ Note 3" shows here for a moment. Shift+F8 also opens a small box
// for words: typed here (Enter saves, Esc closes and keeps them), or said (🎤: Hearth's voice input, only when pressed).
// Nothing of this exists in the page until the key is pressed; while the box is open its keys stay in the box (window
// capture listeners added then, removed when it closes), so the game doesn't walk while you type.
const NB = { open: false, id: null, el: null, input: null, status: null, sent: '', stop: null };
function noteToast(text) {
  const u = mount();
  u.blip.textContent = String(text || '✎ Note');
  u.blip.classList.add('on');
  clearTimeout(blipT); blipT = setTimeout(() => u.blip.classList.remove('on'), 1600);
}
function noteBox() {
  if (NB.el) return NB.el;
  const u = mount();
  const st = document.createElement('style');
  st.textContent = `.nb { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); width: min(620px, 90vw); display: flex; gap: 8px; align-items: center; padding: 8px 8px 8px 12px; border-radius: 12px; background: #16181df2; box-shadow: 0 10px 32px #000b; pointer-events: auto; }
    .nb input { flex: 1; min-width: 0; font: 14px system-ui, sans-serif; color: #eef0f4; background: #0e1014; border: 1px solid #2c313b; border-radius: 8px; padding: 7px 9px; outline: none; }
    .nb input:focus { border-color: #ff8a3d; } .nb .mic { background: #2a2e37; color: #eef0f4; padding: 6px 10px; margin: 0; font-size: 14px; }
    .nb .st { position: absolute; left: 14px; top: -20px; font-size: 11.5px; color: #c9ced8; text-shadow: 0 1px 2px #000; white-space: nowrap; }`;
  u.host.shadowRoot.append(st);
  const box = document.createElement('div'); box.className = 'nb'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Words for this note');
  box.innerHTML = '<span class="st"></span><input maxlength="2000" placeholder="What happened here? (Enter saves · Esc closes)" aria-label="Words for this note"><button class="mic" title="Say it (Hearth\'s voice input)">🎤</button>';
  u.host.shadowRoot.querySelector('.w').append(box);
  NB.el = box; NB.input = box.querySelector('input'); NB.status = box.querySelector('.st');
  box.querySelector('.mic').addEventListener('click', () => { if (NB.id) { NB.status.textContent = '🎤 Starting Hearth\'s voice input…'; ipcRenderer.send('game:note-voice', { id: NB.id }); } });
  return box;
}
function sendWords(close) {
  if (!NB.id) return;
  const text = NB.input ? NB.input.value.trim() : '';
  if (text !== NB.sent || close) { NB.sent = text; ipcRenderer.send('game:note-text', { id: NB.id, text, close: Boolean(close) }); }
}
// the box's keys stay in it: window capture listeners (first on the path the game's listeners are on), only while open
const KEY_TYPES = ['keydown', 'keyup', 'keypress'];
// (stopped at the window, before the game's listeners, so the box's own Enter is read here too)
const boxKeys = (e) => {
  if (!NB.open || !NB.el || !e.composedPath().includes(NB.el)) return;
  e.stopImmediatePropagation();
  if (e.type === 'keydown' && e.key === 'Enter' && !e.isComposing && e.composedPath()[0] === NB.input) { e.preventDefault(); sendWords(true); }
};
function openNoteBox(id) {
  const box = noteBox();
  if (NB.open && NB.id !== id) sendWords(false);
  NB.open = true; NB.id = id; NB.sent = ''; NB.input.value = ''; NB.status.textContent = '✎ Words for this note';
  if (!NB.stop) { for (const t of KEY_TYPES) addEventListener(t, boxKeys, true); NB.stop = () => { for (const t of KEY_TYPES) removeEventListener(t, boxKeys, true); NB.stop = null; }; }
  try { document.exitPointerLock(); } catch { /* fine */ }
  box.hidden = false;
  setTimeout(() => { try { NB.input.focus(); } catch { /* fine */ } }, 0);
}
function closeNoteBox() {
  if (!NB.open) return false;
  sendWords(false);
  const had = Boolean(NB.sent);
  NB.open = false; NB.id = null;
  if (NB.el) NB.el.hidden = true;
  if (NB.stop) NB.stop();
  try { NB.input.blur(); } catch { /* fine */ }
  return had;
}
ipcRenderer.on('game:note', (_e, d = {}) => noteToast(d.text));
ipcRenderer.on('game:note-box', (_e, d = {}) => {
  if (d.open === true) openNoteBox(d.id);
  else if (d.open === false) { if (closeNoteBox()) noteToast('✎ Words kept with the note'); }
  if (d.status != null && NB.status) NB.status.textContent = String(d.status);
  if (d.text != null && NB.open && d.id === NB.id && NB.input) { NB.input.value = String(d.text); NB.sent = NB.input.value.trim(); NB.status.textContent = '✎ Heard: Enter saves, or keep typing'; NB.input.focus(); }
});


// ---------- the hitch map (round 63, hitchmap63: hitchmapmain.js, tools/hitchmap-page.js) ----------
// Only while the owner records it (/playtest hitchmap on, ▶ Play's right-click): the page's recorder says "a spike" with
// one event, and the main side takes that moment's picture (at most 4 a session). Off: no listener of this exists.
let hitchOn = false;
const onHitch = () => ipcRenderer.send('game:hitch-spike');
function hitchListen(on) { if (on === hitchOn) return; hitchOn = on; if (on) addEventListener('hearth-hitch', onHitch); else { removeEventListener('hearth-hitch', onHitch); hitchLine = ''; } }
if (I.hitch) hitchListen(true);
ipcRenderer.on('game:hitch-on', (_e, d = {}) => { hitchListen(Boolean(d.on)); if (statsOn) sound(); });

// ---------- 📈 Test play performance (round 76, gpuplay76) ----------
// The hub (gpuplay.js) measures 20 s of this game and sends: 'wait' / 'running' (a small pill at the bottom, nothing to
// click) → 'done' (the report in plain words, its one-click fixes, 📋 Copy report for Claude, Test again, Close) →
// 'off'. A button here only tells the hub (game:chip 'perf:<id>'); the game never sees these clicks.
let pfWired = false;
ipcRenderer.on('game:perf', (_e, d = {}) => {
  const u = mount();
  if (!pfWired) {
    pfWired = true;
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel']) u.pf.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'mousedown' || t === 'pointerdown') e.preventDefault(); });
  }
  const st = String(d.state || 'off');
  u.pfpill.hidden = !(st === 'wait' || st === 'running');
  if (!u.pfpill.hidden) { const t = String(d.text || '📈 Measuring…'); if (u.pfpill.textContent !== t) u.pfpill.textContent = t; }
  if (st !== 'done') { u.pf.hidden = true; return; }
  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const btn = (label, id, cls, title) => { const b = mk('button', cls || '', label); b.tabIndex = -1; b.dataset.k = id; if (title) b.title = String(title); b.addEventListener('click', () => ipcRenderer.send('game:chip', `perf:${id}`)); return b; };
  const kids = [mk('h2', '', `📈 ${d.title ? `${d.title}: ` : ''}play performance`), mk('p', 'ph', d.headline || '')];
  const ul = mk('ul', ''); for (const l of (d.lines || []).slice(0, 12)) ul.append(mk('li', '', l)); kids.push(ul);
  for (const t of (d.tips || []).slice(0, 4)) kids.push(mk('p', 'tip', t));
  const fixes = (d.actions || []).slice(0, 6);
  if (fixes.length) { const r = mk('div', 'row'); for (const a of fixes) r.append(btn(a.label, a.id, '', a.why)); kids.push(r); }
  const row = mk('div', 'row'); row.append(btn('📋 Copy report for Claude', 'copy', 'copy', 'Puts the numbers on your clipboard (nothing is sent anywhere): paste them into a Claude chat'), btn('📈 Test again', 'again'), btn('Close', 'close')); kids.push(row);
  if (d.note) kids.push(mk('p', 'pn', d.note));
  kids.push(mk('p', 'sm', 'Measured on this computer; nothing is sent anywhere. Esc: back to Hearth.'));
  u.pf.dataset.bound = String(d.bound || '');
  u.pf.replaceChildren(...kids);
  u.pf.hidden = false;
  try { document.exitPointerLock?.(); } catch { /* fine */ } // (the mouse, to click a fix)
});
