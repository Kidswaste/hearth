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
  const st = { hushes: 0, wakes: 0 };
  function arm(ms = HUSH_MS) { if (!timer && !hushed) timer = setTimeout(check, Math.max(500, ms)); }
  function check() {
    timer = 0;
    const idle = performance.now() - last;
    if (idle < HUSH_MS || recording) { arm(HUSH_MS - idle); return; }
    hushed = true; st.hushes += 1;
    root.setAttribute('data-hush', '');
  }
  function input() {
    last = performance.now();
    if (!hushed) return;
    hushed = false; st.wakes += 1;
    root.removeAttribute('data-hush');
    arm();
  }
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, input, { capture: true, passive: true });
  // a capture of Hearth itself: the look stays as it is for the recording
  document.addEventListener('hearth:recording', (e) => { recording = Boolean(e.detail?.recording); if (recording) input(); });
  arm();
  return { state: () => ({ hushed, idleMs: Math.round(performance.now() - last), hushes: st.hushes, wakes: st.wakes, hushMs: HUSH_MS }) };
})();
