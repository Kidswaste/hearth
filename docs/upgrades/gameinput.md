# ▶ Play feels instant to control (round 53, gameinput)

The owner wants Clink (a three.js Lab scene) buttery in ▶ Play at 240 Hz. This pass measured what happens between a
key or a mouse move and the game's next frame in the ▶ Play window, found Hearth's own code standing in that path, and
took it out. It also sets the window up for play: raw mouse, focus on open, no text selection or drag ghosts, an Esc
that always works. Nothing is added to any prompt (0 tokens); the game's files are never touched.

New files: `gameinputmain.js` (main: the window's keys, focus, the page's no-selection style), `dev/checks/gameinput.js`
(the measurement, with budgets), `dev/gameinput-test.js` (UNIT). Edits: `tools/three-sandbox.html` (the Lab player in
`?game=1`), `game-preload.js`, `gamemodemain.js`, `gamemode.js` (`/game input`, `/game lowlatency`), `tools/game-api.md`,
`dev/smoke.js` (`pageCdp`), `dev/run-checks.js`.

## How it was measured
`dev/checks/gameinput.js` sends real input into the ▶ Play window (CDP `Input.*` into the window's own page through the
new `pageCdp` bridge of `dev/smoke.js`: trusted events, as a keyboard and mouse send them) on the game-like Lab scene
(three layers on one canvas, WASD + mouse look) and on the test HTML game. A probe in the game's page notes, per event:
the OS timestamp → after every window-level capture listener ("handled"), → the next animation frame and how many of
the game's frames went by ("frames": 1 = the very next one), the Event Timing API's input → presented, and coalesced
moves. Next to that it counts what Hearth itself puts on the input path: listeners on `window` / `document` per input
type (CDP `DOMDebugger.getEventListeners`, the preload's included), messages a key starts in the page, GPU read-backs a
click starts, and whether the arrow keys reach the game. Before = the round's starting commit (04daee0) with the same
check (`window.GI_REPORT = 1`), after = this branch. Machine: Xvfb at 1280 × 720, 60 Hz, software GL (SwiftShader),
4 shared CPUs. Its milliseconds are mostly the machine's software compositor; the counts are Hearth's own and are the
numbers to read.

## Before → after

| In the ▶ Play window | Before (04daee0) | After |
|---|---|---|
| Hearth's listeners on the input path of a Lab scene's page (keys, pointer, wheel, mouse, right-click; the game's own not counted) | **30** (busiest type: 6 on pointerdown / pointerup) | **6** (1 per type at most: the click that captures the mouse, the shader helpers' mouse position, the right-click hold) |
| …on keydown / keyup | 4 / 2 | **0 / 0** |
| Messages the page sends itself per key press | **5.2** (each key: a timer + a "host-key" message for a Lab that isn't there; the Lab's stats twice a second) | **0** |
| GPU read-backs per click in the game | **2** (✥ Direct read the canvas back to pick a layer, then outlined it over the game) | **0**, nothing picked |
| Arrow keys after a click | **taken** (they nudged the picked layer; the game never got them) | reach the game |
| The game window's preload: key listeners in the game's page (by the code: CDP doesn't list an isolated world's) | 1 (every key crossed into the preload's world) | **0** (Esc / Enter / F read main-side, where the window's key handler already ran) |
| Key → the game's frame (game frames, p50 / p95) | 1 / 1 | 1 / 1 |
| Key → handled, ms p50 / p95 | 0.4 / 1.8 | 0.3–0.5 / 3–9 (machine) |
| Key → next frame, ms p50 / p95 | 6 / 29 | 19–77 / 150–267 (machine: SwiftShader frames) |
| Mouse move → the game's frame (frames p50 / p95; ms p50 / p95) | 1 / 1; 24 / 55 | 1 / 1; 14–26 / 19–50 |
| Key → presented (Event Timing, ms p50 / p95) | 56 / 152 | 88–176 / 264–568 (machine) |
| Coalesced moves (getCoalescedEvents, most in one event) | 13 | 5 (both available; depends on the frame time) |
| Raw mouse for an HTML game's own pointer lock | plain (accelerated) | `unadjustedMovement` asked, plain where refused |
| Focus on open | page focused (not checked main-side) | page + window focused, confirmed main-side (≈ 0.7–1.2 s here, incl. the load) |
| Esc twice in a stuck game | left only when the page recovered (5.2 s for a 6 s freeze) | **1.0 s** (main-side; the window is destroyed if it hasn't closed in 1.5 s) |
| Text selection / drag ghosts | possible (`user-select: auto`) | off (`none`; editable fields keep selection) |
| Low-latency canvas (`desynchronized`) | off | off by default; `/game lowlatency on` → on for the merged canvas and HTML games' WebGL |

Low-latency canvas, measured both ways here: no difference this machine can show (Xvfb / SwiftShader have no
low-latency path: key → presented 88 / 264 ms on vs 128–176 / 400–568 off across runs, inside the machine's noise).
On Windows Chromium can present such a canvas a frame sooner (≈ 4 ms at 240 Hz) but may tear; it stays opt-in.

In an HTML game the only listener left that isn't the game's is one keydown (a capture listener from a long injected
script: GamePerf's probe and its F key, when GamePerf is attached; the gameperf stream's, left as is).

## Upgrades
### Nothing of Hearth's between your input and the game
1. **The Lab player gets out of the game's way**: in ▶ Play's window it adds none of the Lab's own listeners (pace /
   doze pokes, ✥ Direct, look-around gestures, Lab shortcut forwarding, the right-click menu): 30 listeners on the
   input path → 6, none on keys.
2. **No message or timer per key**: each key press used to start a timer and send a message the page then answered
   itself; the Lab's stats messages (twice a second) are off in a game too.
3. **A click in the game reads nothing back from the GPU**: ✥ Direct no longer picks (two canvas read-backs) and
   outlines a layer under the mouse in the game.
4. **Arrow keys always reach the game** (after a click they used to move the picked layer instead).
5. **The game window's own helper listens to no key**: Esc, Enter and F are read by the window's key handler on the
   main side (it already ran for every key), so nothing crosses into the game's page per key.
### Raw, direct input
6. **Raw mouse for every game**: a pointer lock asks for `unadjustedMovement` (no OS acceleration, the mouse's own
   counts) unless the game asks itself; where the system has none, the plain kind, automatically. HTML games too.
7. **Every move of a fast mouse is there** (`getCoalescedEvents`, `pointerrawupdate`): checked available in the game
   window, nothing of Hearth's coalesces or re-sends them.
8. **Gamepads straight through**: the API and rumble (`vibrationActuator`) are there; Hearth adds no polling or copies
   (the game's own `getGamepads()` once a frame is the only one: checked).
### The window
9. **Focus on open**: the game window and its page get the keyboard without a click. Mac: Hearth becomes the active app
   (a game started from a chat or by the director while you were elsewhere), again once the full-screen space is in.
   Windows: the foreground lock (a taskbar flash instead of the game) is won by going topmost for a moment. Checked
   and retried once.
10. **Esc always works**: Esc shows "Back to Hearth" also when it only freed a captured mouse (Chromium keeps that Esc
    for itself, so it took two before); Esc again or Enter leave from the main side, so **a stuck game can always be
    left** (the window goes after 1.5 s even if the page doesn't answer, or its beforeunload says no).
11. **Keys held for the game**: every ⌘ shortcut on the Mac (as before; ⌘Q / ⌘W leave), and now Alt+Space (the window
    menu) on Windows; F (the stats chip) only while the mouse is free.
12. **No text selection, no drag ghosts** in the game window (a click-drag over a HUD or a picture no longer selects
    or drags it); text fields keep selection.
13. A game's own `requestFullscreen()` never resizes or re-animates the window.
### Commands
14. **`/game input`**: raw mouse, the keys held, focus on open (ms), the low-latency canvas.
15. **`/game lowlatency on | off`**: the low-latency (desynchronized) canvas for the next game; off by default.

15 upgrades.

## Mac and Windows
- **Mac**: native full screen moves the game to its own space (≈ 0.7 s): focus and the app activation run once it's in
  (`enter-full-screen`, or after 1.5 s). With `gamemode.macFullscreen: 'simple'` they run at once. Raw mouse
  (`unadjustedMovement`) is supported by Chromium on the Mac.
- **Windows**: borderless full screen; focus wins the foreground lock (topmost, then normal again after 120 ms). Raw
  mouse is supported (WM_INPUT).
- **The browser Keyboard Lock** (`navigator.keyboard.lock`, which would also keep ⌘Tab / the Windows key / Alt+Tab in
  the game) is refused by Electron 44: "lock() request could not be registered", in the game window and in Hearth's own
  window alike (measured; the permission is granted, Electron doesn't take the request). Those system keys stay the
  system's; Hearth holds what the window sees (above).

## Budgets (dev/checks/gameinput.js; `sh dev/run-checks.sh gameinput`, also in `smooth`)
Hearth's listeners per input type ≤ 4 (now 1) · messages per key 0 · GPU read-backs per click 0 · key / mouse → the
game's frame p95 ≤ 2 frames · key → handled p95 ≤ 60 ms (machine-bound, loose) · arrows reach the game · focus on open ·
raw mouse asked · no selection · Esc → card → leaves · a stuck game left by Esc twice in < 4 s. `window.GI_REPORT = 1`
reports without failing; `window.GI_LOWLAT = 1 / 0` runs with the low-latency canvas on / off.

## Tests
`node dev/gameinput-test.js` (UNIT: the main-side keys, the raw pointer lock and its fallbacks, the style). Checks run
alone: gameinput, gamemode, gameperf, inputlatency, lazy, unit:boot-test (results in the final report).

## Risks
- Raw mouse changes the feel: `movementX` is the mouse's own counts, not accelerated pixels; a game tuned on
  accelerated movement may want a new sensitivity. A game that passes `unadjustedMovement` itself keeps its choice.
- The Lab's mouse helpers that stay in a game (a shader layer's `uMouse`, the hidden cursor of Present) are one cheap
  listener each; a Lab scene that relied on ✥ Direct or the look-around gestures in ▶ Play no longer gets them there
  (the Lab preview keeps them).
- Under Xvfb there's no window manager: pointer lock is refused (SecurityError), so raw-vs-fallback was checked in the
  unit test, and focus / the Mac space / the Windows foreground lock were checked only as far as Electron reports them.
- Alt+Space is held on Windows (the window menu); a game that used Alt+Space no longer gets it.

## Edits outside the lane
`tools/three-sandbox.html` (`?game=1` only: listener registrations gated, `drOk`, `statsRun`, `GAME_LOWLAT` on the merged
canvas), `gamemodemain.js` (attach + key handler call, `info.input`, leave's destroy fallback, the Lab page's pointer
lock call, `disableHtmlFullscreenWindowResize`, `&lowlat=1`), `game-preload.js` (no key listener; raw pointer lock;
`game:stats` / `game:menu-on|off` / `game:lock`), `gamemode.js` (`input` in the play request, `/game input`,
`/game lowlatency`), `tools/game-api.md`, `dev/smoke.js` (`pageCdp`), `dev/run-checks.js` (group, smooth, unit, env).

## For the patch notes
- **▶ Play reacts faster to your keys and mouse**: Hearth no longer runs any of the Lab's own code on your input while
  you play (30 listeners on keys, mouse and wheel down to 6, none on keys), and a key press no longer sends a message
  around the page.
- **Clicking in the game no longer stalls the graphics card**: it used to read the picture back to pick a layer, and
  then the arrow keys moved that layer instead of your player. Fixed: arrows always reach the game.
- **Raw mouse**: when a game captures the mouse, it gets the mouse's own movement, without the system's acceleration
  (where the system has it), like a native game.
- **The game gets the keyboard as soon as it opens**, on the Mac (its own full-screen space) and on Windows (even when
  started from a chat or by the director).
- **Esc always works**: one Esc shows "Back to Hearth" even when it freed the mouse, and Esc twice leaves even a frozen
  game.
- No text selection or picture dragging in the game window; Alt+Space no longer opens the window menu over a game.
- `/game input` shows the game window's input setup; `/game lowlatency on` tries the low-latency canvas (it can tear).
