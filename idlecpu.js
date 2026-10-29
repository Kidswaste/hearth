// Idle CPU (round 44, idlecpu): Hearth on screen with nobody using it costs next to nothing (fans quiet, battery kept).
// Most of that work is in the files that did it (the Lab's preview dozes on a still picture, the Lab's knob timer
// stops when nothing can move, the tips queue looks again only when a tip could show…: docs/upgrades/idlecpu.md).
// This file is the one shared part, the hush:
//   · after a minute without a key, a click, a wheel turn or a pointer move in the window, the look's ambient loops
//     (Forgeheart's star dust, floating icon, header glints and twinkles; the swirl look's turning rings) pause where
//     they are. An endless animation, even one the compositor runs by itself, makes the GPU process draw the whole
//     window again on every screen frame, forever, while nobody looks at it. The first input in the window plays them
//     on in the same frame. Indicators of something running (a streaming reply, a render, a sync) never pause (an
//     unread chat's dot stays lit, it only stops pulsing).
//   · never while Hearth records itself (a capture), so a recording of the app shows its look as it is
//   · <html data-hush> (idlecpu.css: the same loops Motion › Calm stops, paused instead of removed)
//   · one timer a minute at most while you use Hearth, none while hushed
// Tests: localStorage 'idlecpu.hushMs' shortens the minute; IdleCpu.state() → { hushed, idleMs, hushes, wakes }.
const IdleCpu = (() => {
  const root = document.documentElement;
  const HUSH_MS = (() => { try { return Number(localStorage.getItem('idlecpu.hushMs')) || 60000; } catch { return 60000; } })();
  let last = performance.now();
  let timer = 0; let hushed = false; let recording = false;
  const st = { hushes: 0, wakes: 0, blurHushes: 0 };
  function arm(ms = HUSH_MS) { if (!timer && !hushed) timer = setTimeout(check, Math.max(500, ms)); }
  function check() {
    timer = 0;
    const idle = performance.now() - last;
    if (idle < HUSH_MS || recording) { arm(HUSH_MS - idle); return; }
    hushed = true; st.hushes += 1;
    root.setAttribute('data-hush', '');
  }
  // (gpuload84) Hearth on screen but another app in front (the DAW, Spotify): after 5 s with no input in this window,
  // EVERY endless animation pauses where it is (spinners, streaming shimmers, pulses: <html data-blurhush>), not only
  // the look's ambient ones. Each one keeps the GPU drawing the window on every screen frame (240 a second on a fast
  // screen) for an app nobody is using, and that load made Windows' audio crackle. What they show stays on screen; they
  // move again on the first input here, or the moment Hearth is the window in front again. Never while recording.
  const BLUR_MS = (() => { try { return Number(localStorage.getItem('idlecpu.blurMs')) || 5000; } catch { return 5000; } })();
  let focused = document.hasFocus(); let blurT = 0; let blurHushed = false;
  const blurWake = () => { clearTimeout(blurT); blurT = 0; if (blurHushed) { blurHushed = false; root.removeAttribute('data-blurhush'); } };
  const blurArm = (ms = BLUR_MS) => {
    clearTimeout(blurT);
    blurT = focused || blurHushed ? 0 : setTimeout(() => {
      blurT = 0; if (focused || recording) return;
      const quiet = performance.now() - last; if (quiet < BLUR_MS - 50) { blurArm(BLUR_MS - quiet); return; }
      blurHushed = true; st.blurHushes += 1; root.setAttribute('data-blurhush', '');
    }, Math.max(200, ms));
  };
  const setFocused = (on) => { on = Boolean(on); if (on === focused) return; focused = on; if (on) blurWake(); else blurArm(); };
  try { window.hub?.onWindowFocus?.((on) => setFocused(on)); } catch { /* no hub: the page's own events below */ }
  addEventListener('focus', () => setFocused(true));
  addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) setFocused(false); }, 0)); // (focus going into a frame inside isn't a blur of the window)
  function input() {
    last = performance.now();
    if (blurHushed) { blurWake(); blurArm(); } // (a countdown already running looks at the last input when it ends)
    if (!hushed) return;
    hushed = false; st.wakes += 1;
    root.removeAttribute('data-hush');
    arm();
  }
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, input, { capture: true, passive: true });
  // a capture of Hearth itself: the look stays as it is for the recording
  document.addEventListener('hearth:recording', (e) => { recording = Boolean(e.detail?.recording); if (recording) input(); else blurArm(); });
  arm(); blurArm();
  return { state: () => ({ hushed, idleMs: Math.round(performance.now() - last), hushes: st.hushes, wakes: st.wakes, hushMs: HUSH_MS, focused, blurHushed, blurHushes: st.blurHushes, blurMs: BLUR_MS }) };
})();
