// ▶ Play's edit → play → edit loop (round 53, playloop), main side. gamemodemain.js owns the game window; this adds:
//   rest / wake   Ctrl/⌘+P in the game goes back to Hearth without closing it: the window hides (the Mac leaves its
//                 full-screen space first), its frames stop (a Lab scene's page parks, an HTML build is throttled while
//                 hidden), its sound is muted, Hearth's background work comes back. Ctrl/⌘+P in the Lab shows it again at
//                 once, in the state it was left, with the edits made meanwhile already in it. A game left resting for
//                 10 minutes closes by itself (its memory back).
//   side by side  the game full screen on another screen while Hearth stays on this one: Ctrl/⌘+P only moves the focus.
//   blip          the small "Updated" line over the game after a live edit (the game window's preload draws it).
//   fix           "Fix with the director" on the game's error line: the error goes to Hearth, which drafts it in the
//                 docked director chat (never sent); on one screen the game rests so the chat is in view.
// Channels (hub only): game:loop { op: 'rest' | 'wake' | 'blip' | 'side' | 'state' } → state. Events to the hub:
// game:loop-ev { type: 'rested' | 'woke' | 'fix' | 'key', … }. From the game window: game:fix { message, line, layer, file }.
const REST_MAX_MS = 10 * 60 * 1000;
let api = null; // { ctx(), game(), leave(why) } from gamemodemain
const S = { resting: false, side: false, simple: false, timer: 0 };
const mac = process.platform === 'darwin';

const G = () => { const g = api?.game?.(); return g?.win && !g.win.isDestroyed() ? g : null; };
const hubWin = () => { const w = api?.ctx?.()?.getWin?.(); return w && !w.isDestroyed() ? w : null; };
const tell = (d) => { try { hubWin()?.webContents.send('game:loop-ev', d); } catch { /* gone */ } };
const state = () => ({ playing: Boolean(G()), resting: S.resting && Boolean(G()), side: S.side && Boolean(G()) });
const park = (g, on) => g.win.webContents.executeJavaScript(`void (window.__labHot && window.postMessage({ target: 'three-sandbox', type: 'park', on: ${on ? 'true' : 'false'} }, '*'))`, true).catch(() => {});
// (round 54, gameaudio) the game's sound pauses with it (its AudioContexts suspended, its playing media paused) and
// comes back where it was: tools/gameaudio-page.js; on wake the sound resumes before the window is unmuted
const sound = (g, on) => Promise.race([g.win.webContents.executeJavaScript(`window.__gameAudio ? window.__gameAudio.rest(${on ? 'true' : 'false'}, 'loop') : 0`, true).catch(() => 0), new Promise((r) => setTimeout(r, 500, 0))]); // (a stuck page: unmuted anyway)
function focusHub() { const h = hubWin(); if (!h) return; if (h.isMinimized()) h.restore(); h.show(); h.focus(); }

function rest(why = 'asked') {
  const g = G();
  if (!g) return state();
  if (S.side) { focusHub(); tell({ type: 'rested', side: true, why }); return state(); }
  if (S.resting) { focusHub(); return state(); }
  S.resting = true;
  if (g.input?.menu) { g.input.menu = false; try { g.win.webContents.send('game:menu-close'); } catch { /* gone */ } } // (gameinput's card: closed, so Esc after coming back shows it again)
  S.simple = mac && Boolean(g.win.isSimpleFullScreen?.());
  const wc = g.win.webContents;
  park(g, true);
  sound(g, true);
  try { wc.setAudioMuted(true); wc.setBackgroundThrottling(true); } catch { /* old Electron */ }
  try { api.ctx().powerwise.quiet(false); } catch { /* fine */ }
  const hide = () => { if (!g.win.isDestroyed()) g.win.hide(); focusHub(); };
  // the Mac: a full-screen space must be left first, or an empty black space stays behind
  if (mac && g.win.isFullScreen()) { g.win.once('leave-full-screen', hide); g.win.setFullScreen(false); setTimeout(hide, 1500); } else { if (mac) g.win.setSimpleFullScreen?.(false); hide(); }
  clearTimeout(S.timer);
  S.timer = setTimeout(() => { if (S.resting && G() === g) api.leave('rested too long'); }, REST_MAX_MS);
  tell({ type: 'rested', why });
  return state();
}
function wake() {
  const g = G();
  if (!g) return state();
  clearTimeout(S.timer);
  if (!S.resting) { g.win.show(); g.win.focus(); tell({ type: 'woke' }); return state(); }
  S.resting = false;
  const wc = g.win.webContents;
  try { wc.setBackgroundThrottling(false); } catch { /* old Electron */ }
  sound(g, false).finally(() => { try { if (!g.win.isDestroyed() && !S.resting) wc.setAudioMuted(false); } catch { /* gone */ } });
  park(g, false);
  try { api.ctx().powerwise.quiet(true); } catch { /* fine */ }
  g.win.show();
  if (mac) { if (S.simple) g.win.setSimpleFullScreen(true); else g.win.setFullScreen(true); } else if (!g.win.isFullScreen()) g.win.setFullScreen(true);
  g.win.focus();
  tell({ type: 'woke' });
  return state();
}
// side by side: the game full screen on another screen (the one asked, or any that isn't Hearth's), Hearth here
function side(on, displayId = null) {
  S.side = Boolean(on);
  const g = G();
  if (!g) return state();
  if (S.resting && S.side) wake();
  if (S.side) {
    const { screen } = require('electron');
    const hub = hubWin(); const mine = hub ? screen.getDisplayMatching(hub.getBounds()).id : null;
    const all = screen.getAllDisplays();
    const d = all.find((x) => x.id === displayId && x.id !== mine) || all.find((x) => x.id !== mine);
    if (!d) { S.side = false; return state(); } // (one screen: nothing to put side by side)
    if (screen.getDisplayMatching(g.win.getBounds()).id !== d.id) {
      const fs = g.win.isFullScreen();
      const move = () => { if (g.win.isDestroyed()) return; g.win.setBounds(d.bounds); g.win.setFullScreen(true); };
      if (fs && mac) { g.win.once('leave-full-screen', move); g.win.setFullScreen(false); } else { if (fs) g.win.setFullScreen(false); move(); }
    }
    focusHub();
  }
  return state();
}
function blip(text, clear = false) {
  const g = G();
  if (g && !S.resting) { try { g.win.webContents.send('game:blip', { text: String(text || 'Updated').slice(0, 80), clear: Boolean(clear) }); } catch { /* gone */ } }
  return state();
}

// (round 54, fixes54) the letter a key press means: its own letter, or (a Russian / Greek layout) the one on its place
const letter = (input) => { const k = String(input.key || '').toLowerCase(); return /^[a-z]$/.test(k) || !/^Key[A-Z]$/.test(String(input.code || '')) ? k : input.code.slice(3).toLowerCase(); };
// the keys in the game window (gamemodemain's before-input-event asks first): Ctrl/⌘+P back to editing,
// Ctrl/⌘+Shift+P "Play from here" (the hub does it)
function key(input) {
  if (input.type !== 'keyDown' || input.alt) return false;
  const mod = mac ? input.meta : input.control;
  if (!mod || letter(input) !== 'p') return false;
  if (input.shift) tell({ type: 'key', what: 'here' }); else rest('key');
  return true;
}

// gamemodemain.js registers the channels (main.js finds a lazy module's channels in its own source) and hands them here
function register(a) { api = a; }
function op(req = {}) {
  const o = String(req.op || 'state');
  if (o === 'rest') return rest(req.why || 'asked');
  if (o === 'wake') return wake();
  if (o === 'side') return side(req.on, req.display ?? null);
  if (o === 'blip') return blip(req.text, req.clear);
  return state();
}
// the error line's "Fix with the director": only from the game window playing now, only on a click there
function fix(e, d = {}) {
  const g = G();
  if (!g || e.sender !== g.win.webContents) return;
  const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
  tell({ type: 'fix', error: { message: clip(d.message, 600), line: Number(d.line) || null, layer: clip(d.layer, 80), file: clip(d.file, 300), stack: clip(d.stack, 1200) }, source: g.source });
  if (!S.side) rest('fix'); else focusHub();
}
// gamemodemain: a game ended (resting or not), or a new one started
function ended() { clearTimeout(S.timer); S.resting = false; }
module.exports = { letter, register, op, fix, key, ended, state, rest, wake, side, blip };
