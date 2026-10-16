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
const GL = `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { if (/^(webgl2?|experimental-webgl)$/.test(t)) o = { antialias: true, powerPreference: 'high-performance', ${I.lowLatency ? 'desynchronized: true, ' : ''}...(o || {}) }; return g.call(this, t, o); }; })();`;
const code = `${RAW}\n${I.kind === 'html' ? GL : ''}`;
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
    .chip { position: fixed; right: 12px; top: 10px; padding: 4px 9px; border-radius: 7px; background: #000a; font: 12px/1.3 ui-monospace, Menlo, Consolas, monospace; white-space: nowrap; }
    .card { position: fixed; inset: 0; display: grid; place-items: center; background: #000a; pointer-events: auto; }
    .box { min-width: 280px; padding: 22px 24px 18px; border-radius: 14px; background: #16181d; box-shadow: 0 12px 40px #000c; text-align: center; }
    .t { font-size: 16px; font-weight: 600; margin-bottom: 4px; } .s { color: #a7adb8; margin-bottom: 16px; }
    button { font: 600 14px system-ui, sans-serif; border: 0; border-radius: 9px; padding: 9px 16px; margin: 0 4px; cursor: pointer; }
    .back { background: #ff8a3d; color: #1a1206; } .keep { background: #2a2e37; color: #eef0f4; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    [hidden] { display: none !important; }
  </style><div class="w"><div class="hint">Esc: menu · F: stats</div><div class="chip" hidden></div>
  <div class="card" hidden role="dialog" aria-label="Leave the game"><div class="box"><div class="t"></div><div class="s">Esc again or Enter goes back</div>
  <button class="back">Back to Hearth</button><button class="keep">Keep playing</button></div></div></div>`;
  (document.documentElement || document).appendChild(host);
  const $ = (s) => root.querySelector(s);
  ui = { host, hint: $('.hint'), chip: $('.chip'), card: $('.card'), back: $('.back'), keep: $('.keep'), title: $('.t') };
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
  if (!on && !(ui && !ui.card.hidden) && document.hasFocus() && performance.now() - gameLetGo > 400) { menu(true); ipcRenderer.send('game:menu-on'); }
});

// ---------- the stats chip: frames counted only while it shows ----------
let statsOn = false; let raf = 0; let gaps = []; let last = 0; let lastPaint = 0; let how = I.how || ''; let hz = I.hz || 0;
function tick(t) {
  if (!statsOn) { raf = 0; return; }
  if (last) gaps.push(t - last);
  last = t;
  if (t - lastPaint > 500 && gaps.length) {
    lastPaint = t;
    const g = gaps.slice(-240); const avg = g.reduce((a, b) => a + b, 0) / g.length;
    const line = `${Math.round(1000 / avg)} fps · ${avg.toFixed(1)} ms · ${Math.round(hz || 60)} Hz${how ? ` · ${how}` : ''}`;
    if (ui.chip.textContent !== line) ui.chip.textContent = line;
    gaps = g.slice(-120);
  }
  raf = requestAnimationFrame(tick);
}
function stats(on) {
  statsOn = Boolean(on);
  const u = mount();
  u.chip.hidden = !statsOn;
  if (statsOn) {
    gaps = []; last = 0; lastPaint = 0; u.chip.textContent = '… fps';
    ipcRenderer.invoke('game:info').then((x) => { if (x) { how = x.how || how; hz = x.hz || hz; } }).catch(() => {});
    if (!raf) raf = requestAnimationFrame(tick);
  }
}
addEventListener('DOMContentLoaded', () => mount());
