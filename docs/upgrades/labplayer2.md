# labplayer2 (Nov 10): why the separate Lab player drew black, and the fix

(Nov 11: the player is now the default way a scene runs on Windows, not an opt-in: `docs/upgrades/labplayer3.md`.)

The separate Lab player (Nov 9: `labplayer/`, `labplayermain.js`, the Lab dock's PLAYER › SEPARATE) runs the Lab preview
in its own Electron app, so a heavy scene has its own graphics process and Hearth's interface keeps its frame rate. It
was retired the same day (868f192c) because scenes "rendered black or partly"; nobody recorded why. This round finds the
cause with measurements, fixes it, puts the switch back as an opt-in (IN-APP stays the default) and adds a check.
Branch `claude/hungry-montalcini-6a79bf`, nothing committed.

## The cause

**The player's window was put on screen behind Chromium's back, so its page never presented a frame to it.**

`labplayer/main.js` placed the window like this: `setBounds`, then `win.moveAbove(Hearth's window)`, then
`if (!win.isVisible()) win.showInactive()`. On Windows `moveAbove` is `SetWindowPos(… SWP_SHOWWINDOW)`: it shows the
window itself. So `isVisible()` was already true and `showInactive()` (Electron's own show) never ran. Hearth's order
is *place, load the page, place again* (`labplayermain.js`: `ready` → `place()`, then `labplayer:open` → `load` +
`placeSoon`). A window shown that way before its page is loaded stays, for Chromium, a hidden window: the page runs
and draws into its canvases, but nothing reaches the screen and each frame waits for a presentation that never comes.

What that looks like, measured (RTX 4080, real GPU, the copy's windows really on screen):

| asked | answer in the broken state |
|---|---|
| the player's window (`win.isVisible()`, Windows' own list) | visible, at the frame's rectangle, **above** Hearth's window (z 6 vs 7) |
| its graphics (`app.getGPUFeatureStatus()`) | gpu_compositing / webgl / webgpu all `enabled` |
| `CalculateNativeWinOcclusion` | disabled in the player, as intended |
| its page | 2 layers, 2 WebGL contexts, no error, no lost context, `visibilityState` visible |
| a capture of its window (`capturePage`, which wakes it for one frame) | the scene, 100 % lit, 50 colours |
| **the frames Chromium gives the page in a second** | **1–5** (an in-app frame: 120–240) |
| **the desktop's own pixels at that rectangle** | **black** |

Same result after the app's first start, after a fresh restart, after off / 5 s / on, after a plain reload. "Partly
there" was not reproduced separately; a window in this state shows whichever single frames get through (a capture
forces one), which fits it.

Isolated without Hearth (a script that starts only `labplayer/` and a one-canvas test page, magenta):

| order of the messages | frames / s | the screen at the window |
|---|---|---|
| load, then place with `above` | 164 | magenta (100 % lit) |
| **place with `above`, load, place (Hearth's order)** | **1** | **black (0 % lit)** |
| the same order, with the fix | 141 | magenta |

The mechanism inside Chromium (the page's view is created hidden and never told "shown", because the native show
already happened) is an inference from these runs; the order dependence and the fix are measured.

The Nov 9 note in `labplayer/main.js` blamed Windows' occlusion check for "2 animation frames a second" and turned it
off. With it off the same 1–5 frames a second were measured here, so that was this bug's signature, not occlusion.

## What it was not (the earlier guesses, checked)

Every message the Lab sends was recorded at `deliver` (`window.__labTap`, tools/three.js) and again where it arrives in
the player's app, for the same old-format scene and the same v2 scene in Hearth's frame and in the player:

- **Nothing is missing or empty.** Old scene: 31 sent, 31 arrived; v2: 28 / 28. Kinds, both targets: `run-layers` /
  `swap-layers`, `refs`, `tweak-init`, `tweak`, `layer-props`, `quality`, `speed`, `stage`, `fps-cap`, `loop-clock`,
  `triggers-set`, `media-load`, `media`, `media-map`, `media-cuts`, `media-analysis`, `lib`. In the player's page:
  both layers running, the slider moved in the Lab read back as 3.5, `audio.bass` moving with the song, the clock
  advancing, the same `innerWidth × innerHeight` as the frame.
- **Transferables**: none of these messages carries one; all pass `structuredClone`. The one path that posts straight
  to the iframe with a transfer list is camera / hand input (`tools/three-motion-in.js`); it now takes the message
  route in the player as it does for the Stage window (not exercised by the check).
- **The crash-watch `MessagePort` (`life`)** is only for the iframe. The player's crash is reported by its app
  (`render-process-gone` → `labplayer:closed` → the preview goes back in Hearth's frame). Not a cause.
- **v2 (`?gpu=1`)**: the player loads the same query the frame would, and a v2 layer needs nothing else. A v2 scene
  ran in the player on WebGPU (0 WebGL contexts) before any change; it was black on screen for the same reason.

## What changed

1. **`labplayer/main.js` `place`**: the window is shown by Electron first (`showInactive()`, tracked by its own
   `shown` flag, cleared on every hide), then moved above Hearth's. One line of order; the rest of the app is as it was.
2. **Exact frame sizes** (1080p shown smaller): the Lab now sends the frame's own rectangle and its scale
   (`sendRect`, tools/three.js; `labplayer:rect { scale }`), and the player zooms its page by Hearth's zoom × that
   scale (`setZoomFactor`). The scene sees 1920 × 1080 as in Hearth's scaled frame. Before, the page got the host's
   size whatever the frame size.
3. **The switch is back, opt-in**: the dock's PLAYER › IN-APP / SEPARATE (tools/three.js `playerPref`, `setPlayer`).
   IN-APP is the default; Nov 9's retirement cleared any stored `separate`, so the player starts only for who picks it.
   If its app doesn't start or ends, the preview returns to Hearth's frame with a note (as before).
4. **For checks only** (`HEARTH_LP_DEBUG=1`, set by dev/smoke.js for its copies, never in the owner's app):
   `labplayer:debug` asks the player's app for `eval`, `capture` (what its window shows, counted), `info`, `seen` (what
   arrived for the page) and its console. `HEARTH_LP_USERDATA` gives a test copy's player its own profile folder.
5. **dev/smoke.js**: `--show` puts the copy's window on screen without the focus (Windows starts test copies hidden
   and ignores the app's own first show; `dev/win-show.ps1`); `smoke({ windows })` lists the visible windows front
   first (`dev/win-list.ps1`); `smoke({ screen, rect })` reads the desktop's own pixels (`dev/win-shot.ps1`).

## The check

`dev/checks/labplayer.js` (Windows, real GPU, about 2 minutes). **A test window is on screen meanwhile, without the
focus: ask the owner before running it** (their rule is that test copies stay out of sight). Without `--show` it runs silent (round 176's
`dev/smoke-silent.js`, brought into this branch: windows off screen, muted; the player's window follows Hearth's
there and its sound is muted too) and every step still runs, but that run cannot prove the fix:
with the player's window parked far off screen the bug does not happen (the unfixed `labplayer/main.js` got 236
frames a second there, against 1 on screen), so only a window really on screen tells the bug from the fix. The
diagnosis runs of this round showed such a window about eight times.

    SMOKE_GPU_FLAGS="--ignore-gpu-blocklist --disable-features=CalculateNativeWinOcclusion" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --show --check-timeout 400000 --script dev/checks/labplayer.js

22 steps, all passing here: two runs on screen (`--show`), then, after the silent mode came in, two silent runs.
After the last on-screen run `labplayer/main.js` got three small changes (the zoom is re-applied on every place, a test
copy's player is muted, more fields in the check-only `info`); those ran silent only. In a silent run an exact frame
size reads 1967 × 1103 in the page instead of 1919 × 1080: far off the screen Electron counts a frameless window's
unseen resize border as page area after a resize (measured: content 980 × 550 for a 964 × 542 window); the silent
run allows 3 % there.
- default: PLAYER on the dock, IN-APP on, no player running;
- SEPARATE with an old-format scene and with a v2 scene: the window visible, at the frame's place, above Hearth's;
  Chromium gives the page ≥ 20 frames a second (120–241 measured; the bug gave 1–5); its window's picture is not
  black; when no other app's window is over it, the desktop's own pixels there are not black either (100 % lit in the
  run where nothing covered it); sliders, song and messages arrive; v2 on WebGPU with 0 WebGL contexts;
- still drawing after: hidden under a menu and shown again, a fresh restart, an exact 1920 × 1080 frame (the page
  reports 1919 × 1080);
- a heavy scene, and back to IN-APP (the player's app ends, the frame draws again).

Hearth's own window with a heavy scene (5 full-picture shader layers at 3840 × 2160, Max fps; a game was running on the
same GPU during the run):

| | Hearth's window | worst frame | the scene |
|---|---|---|---|
| idle | 225 fps | 17 ms | |
| heavy scene in the player | **195 fps** | 133 ms | 12 fps |
| the same scene in Hearth's frame | **44 fps** | 192 ms | 20 fps |

Also run: `node dev/boot-test.js` (3799 passed), `node dev/slim116-test.js` (7601 passed).

## Not done / not verified

- What Hearth draws **over** the picture is under the player's window while SEPARATE is on: the size pill, guides,
  the scene editor's outlines, a file dropped on the preview. Unchanged from Nov 9.
- While a menu or dialog is open over the picture the player hides (it is a window above Hearth's and would cover
  them); the frame shows black for that moment.
- The player's window is kept above Hearth's on focus / move / resize, not owned by it: dragging Hearth's window, it
  follows a moment later.
- With the GPU saturated, Hearth still had single stutters (133 ms worst above); the average held.
- Camera / hand input and live audio input were not run in the player. The Mac was not run (the order change is
  harmless there; `moveAbove` behaves differently).
- Only the synthetic scenes above were asserted. The owner's Visualizer2 and Visualizer3 (v2) were opened in the
  player before the fix to look for content-specific failures: none (17 contexts, no errors; v2 on WebGPU).
- The owner has not tried it yet: IN-APP stays the default until they have.

## For the patch notes (when merged)

- The Lab's PLAYER switch is back on the dock: SEPARATE runs the preview in its own app, so a heavy scene no longer
  slows the rest of Hearth (measured: 195 fps instead of 44 with a very heavy scene). It was black before because its
  window was shown the wrong way; that is fixed. IN-APP stays the default.

## Files

`labplayer/main.js`, `labplayermain.js`, `preload.js`, `tools/three.js`, `dev/smoke.js`, new: `dev/checks/labplayer.js`,
`dev/win-show.ps1`, `dev/win-list.ps1`, `dev/win-shot.ps1`, `dev/smoke-silent.js` (round 176's, copied as it is from
branch `claude/smooth176`, with its hunk in `dev/smoke.js`), this note; `docs/upgrades/scenes-v2-webgpu.md` (two lines).
