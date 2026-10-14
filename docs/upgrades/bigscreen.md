# Big screen (round 38, bigscreen): Hearth as a real full-screen app on a big monitor

The owner asked: "Optimize the app to run as a full fullscreen app on my big screen." They use a Mac and a Windows PC;
the big screen is a large external monitor (4K / ultrawide, maybe scaled). This stream makes full screen one obvious
thing, remembered for each screen, sizes everything for the screen it's on (Auto), keeps the layouts sensible on huge
windows, and keeps the Lab smooth on a preview that fills a 4K screen. Two new visible things only: **⛶** in the rail and
one **Size of everything** row in Appearance. Nothing is added to any message (0 tokens).

New files: `bigscreen-core.js` (pure, UMD: the Auto rule, picks, screens by their kind, memory; main requires it, the
window loads it), `bigscreenmain.js` (main: IPC `big:*`, the screen the window is on, full screen per screen, the start
zoom), `bigscreen.js` + `bigscreen.css` (the window: ⛶, the size row, the first-time hint, the rail peek, `/fullscreen`,
`/ui-size`), `dev/bigscreen-test.js` (UNIT), `dev/checks/bigscreen.js` + `bigscreen-hidpi.js` (+ `bigscreen-lib.js`,
their shared body). `sh dev/run-checks.sh bigscreen`.

## How it works
| Area | Before | Now | Where |
|---|---|---|---|
| Full screen | only the View menu / F11 / ⌃⌘F / the green button; nothing on screen; remembered per set of screens only | **⛶ in the rail** (under ☰; the icon turns into "leave" while on), Ctrl/⌘+K "Full screen", `/fullscreen on/off/status`, plus the system's own ways (View menu, F11 on Windows, ⌃⌘F and the green button on the Mac). The Mac gets its native full-screen space (the hidden title bar's traffic lights go with it, the rail gets its top back, also when Hearth *opens* full screen); Windows gets Electron's borderless full screen over the taskbar. Remembered **per screen** too: a set of screens not seen before opens full screen if the screen it lands on was full screen last (the big monitor), windowed if not (the laptop). A short hint the first time says how to leave | `bigscreenmain.js`, `bigscreen.js`, `nativefeelmain.js restore` |
| Esc | — | Esc never leaves the window's full screen (it's the window's, not the page's): typing / closing menus is safe. Only the Lab's Present (the page's own full screen) leaves on Esc, and Electron keeps the window full screen after it | checked with a real Esc key in the chat box |
| Size of everything | Ctrl +/− zoom stored once for the whole app (localStorage), applied after the page loaded | **per screen**: Auto from the screen's size in points (what the system's own scaling left): a 4K at 100 % → 150 %, a 4K at 125 % → 125 %, a 5K at 100 % → 175 %, a laptop / Retina / 4K at 150–200 % / 1440p / ultrawides → 100 %; never so big that a full window has less than 1280 × 720 points. A pick (Appearance row, Ctrl/⌘ + / −, `/ui-size`) is kept for that screen only; Ctrl/⌘ 0 goes back to Auto. Screens are told apart by their kind (pixels + scale), so a Windows screen id changing after a restart keeps its choice. The zoom is handed to preload.js and set **before the first frame** (no jump at start); moving the window to another screen re-zooms. The old Ctrl +/− size becomes the current screen's pick once | `bigscreen-core.js`, `bigscreenmain.js startArgs`, `preload.js`, `appui.js zoom` |
| Crisp | — | every size change moves `devicePixelRatio`; nativefeel's `hearth:dpr` re-ratios the Lab preview, the music wave and the sequence at once (checked: the preview's ratio equals the page's after 125 %, at DPR 1 and 2) | reuse of nativefeel |
| Layouts on huge windows | (measured, see below) | chats already keep a centred ≈ 820 px reading column (`--chat-width`), the Lab's side panel stays ≈ 265 px and the preview takes the room, AI setup is a ≈ 320 px drawer, the rail and chats list stay compact: kept as they are, now checked at 3840 × 2160, 2560 × 1440 (4K at Auto), 3440 × 1440 and 1920 × 1080 @2× with no sideways scrolling anywhere | `dev/checks/bigscreen-lib.js` |
| Full screen + chats list hidden | — | resting the pointer on the rail for ⅓ s shows the chats list over the page (compositor-only slide), leaving it (or picking a chat) hides it; nothing new on screen | `bigscreen.js` peek, `bigscreen.css` |
| The Lab on a 4K / 5K preview | labadapt stepped the resolution down after two slow windows | a preview drawing over ≈ 6 million pixels per frame steps down after **one** slow window (sustained slowness, not a single hitch); everything else in labadapt / labpace unchanged (renders, stills, exports full quality) | `tools/three-sandbox.html` (`quick` in `<adapt-core>`, `adBigPx`) |

## Measured (dev/checks/bigscreen*.js, SwiftShader under Xvfb on a busy shared machine: relative numbers)
- 4K at 100 % (3840 × 2160 virtual screen, DPR 1): Auto = 150 %, `devicePixelRatio` 1.5 already at the first check (set
  by preload); the window as big as the screen gives a 2560 × 1440-point page. Chat text column 820 px wide, centred.
- The Lab at that size: preview 1863 × 1247 points (≈ 5.2 M pixels at full quality), side panel 265 px. SwiftShader
  draws it at ≈ 3 fps; from full quality the preview stepped its resolution down by itself in **1.8 s** (one slow
  window; the unit test shows the old two-window rule takes longer on the same frames), to 70 % then 50 % (2.6 M → 1.3 M
  pixels). A real GPU keeps the full picture.
- 4K at 200 % (DPR 2, 1920 × 1080 points): Auto = 100 %, every page at twice the pixels, the Lab drawing at ratio 2;
  stepped down in 1.9 s on SwiftShader.
- Ultrawide 3440 × 1440 window (at 150 %: 2293 × 960 points): chat and Lab without sideways scrolling.
- Full screen on / off, the hint, Esc in the chat box (stays full screen), the rail peek, `/fullscreen`: all pass on
  both runs. Pictures: `/tmp/hearth-bigscreen/*.png` (looked at: chats, grid view, AI setup, Lab, Appearance at 125 %,
  full screen with the peek, ultrawide chat / Lab).

## Upgrades
### Full screen
1. **⛶ in the rail** (under ☰): full screen on / off; its icon and tooltip say how to leave while on.
2. Ctrl/⌘+K "Full screen (on / off)".
3. `/fullscreen on | off | status` (status also says the screen and its size).
4. Full screen remembered **per screen**: the big monitor reopens full screen, the laptop windowed (also for a set of screens Hearth hasn't seen yet).
5. Whatever way you go in or out (⛶, View menu, F11, ⌃⌘F, the green button) is remembered the same way.
6. Mac: the native full-screen space; the rail gets its top back when Hearth *opens* full screen too (it only did when you switched).
7. Windows: borderless full screen over the taskbar (F11 or ⛶).
8. Esc never leaves full screen (typing, closing a menu); the Lab's Present still leaves its own full screen on Esc and the window stays full screen.
9. A short hint the first time: "F11 / ⌃⌘F or ⛶ in the rail leaves it (Esc doesn't, so typing is safe)".
10. Full screen with the chats list hidden: rest on the rail and the list slides in over the page; leave and it goes.
### Size of everything
11. **Size of everything** in Appearance (and Settings → Look): Auto · 100 · 125 · 150 · 175 · 200, for the screen the window is on, with that screen's name.
12. **Auto** picks it from the screen: a 4K at 100 % gets 150 %, a 5K at 100 % 175 %, an 8K 200 %; screens the system already scales stay at 100 %.
13. Auto never makes a full window smaller than 1280 × 720 points (the app always fits).
14. Each screen keeps its own size (the laptop keeps 100 % while the monitor has 150 %); twin monitors share theirs; a Windows screen id changing after a restart keeps it.
15. The size is set before the first frame: no jump at start.
16. Moving the window to another screen re-sizes it for that screen.
17. Ctrl/⌘ + / − change this screen's size; Ctrl/⌘ 0 goes back to Auto (it went to 100 %).
18. View menu: Bigger / Smaller / Automatic size (it said "text", but it was always the whole window).
19. `/ui-size auto | 100 | 125 | 150 | 175 | 200` and Ctrl/⌘+K "Size of everything: bigger / smaller / automatic".
20. Find anything (Ctrl/⌘+K) finds "Size of everything" in Settings.
21. A size you had picked before this round becomes the current screen's size, once.
22. Crisp at every size: the Lab preview, the music wave and the sequence redraw at the new ratio at once.
### Big windows, smooth
23. The Lab on a huge preview (over ≈ 6 million pixels, a 4K / 5K screen) lowers its resolution after one slow moment instead of two; renders and exports stay full quality.
24. Checked at 3840 × 2160, 2560 × 1440, 3440 × 1440 and 1920 × 1080 at 2×: no sideways scrolling in chats, grid view, AI setup or the Lab; reading width stays ≈ 820 px; panels don't stretch.

24 upgrades.

## Tested
- `node dev/bigscreen-test.js` (UNIT, 112 checks): Auto for 15 kinds of screens (MacBooks, 1080p / 1440p, 4K at 100 /
  125 / 150 / 200 %, 5K at 100 / 200 %, 8K, ultrawides, portrait, junk), the room rule, picks / steps / clamps, screens
  by kind, memory per computer and per screen (12 kept), nativefeel's saves keeping them, main through a temp data
  folder with injected screens / window / IPC (start zoom for preload, info, full screen via IPC and remembered on the
  window's own events, a minimised window restored first, 125 % kept through nativefeel's save on close, the laptop's
  own size, a new set of screens opening full screen on the 4K with its 125 %, big:display on a move / screen change and
  not again when nothing changed, listeners removed, test-only bounds refused outside tests), the View menu, and the
  sandbox's adapt core (a huge slow preview steps down sooner, still stops at the lightest step, a huge preview that keeps
  up stays at full quality).
- `dev/checks/bigscreen.js` (`--screen 3840x2160`) and `dev/checks/bigscreen-hidpi.js` (`--screen 3840x2160 --dpr 2`):
  see Measured. `dev/smoke.js` gained `--screen WxH` (the virtual screen) and `--dpr N` (the screen's scale);
  run-checks passes both through.
- Also run, all passing: nativefeel (+ unit nativefeel / winmac / winpolish / macpolish), grid-resize, motionpolish,
  labpace (+ unit:labadapt-test; unit:labpace-test's "signature of a 2000-object scene" timing failed once on the busy
  machine and passed on a re-run; that code isn't touched), options, lazy, unit:boot-test (988), fastboot (its
  "first-screen scripts ≤ 72" line still lists 78, the same as before this round: bigscreen adds a lazy group, no
  first-screen script). `node dev/lazy-manifest.js` re-run (new lazy group `bigscreen`, asap).
- Not testable here: a real Mac's full-screen space / green button / ⌃⌘F, a real Windows F11 over the taskbar, a real
  GPU at 4K (SwiftShader is ~50× slower), real monitors being plugged in.

## Risks
- Auto changes the size on a 4K monitor at 100 % (and a 5K / 8K at 100 %) the first time: 150 % on a 4K. That's the
  point, but it's a visible change; Ctrl/⌘ − or the Appearance row picks another size for that screen.
- The size is per screen kind: two different-size screens of the same pixels and scale share it (intended for twins).
- Full screen per screen only decides for a set of screens Hearth hasn't seen; a set seen before keeps nativefeel's
  own memory (what it was when you left it there).
- `--hearth-zoom` is set in preload before the page loads; Chromium could in theory reset it on navigation; the window
  re-applies it after start anyway (`big:info`).
- index.html gains one stylesheet link (`bigscreen.css`), no first-screen script (the module is a lazy group).

## For the patch notes
- **⛶ Full screen** in the left rail (under ☰): one click in, one click out. Also F11 on Windows, ⌃⌘F or the green button on the Mac, Ctrl/⌘+K "Full screen", or `/fullscreen`.
- Hearth remembers full screen for each screen: the big monitor opens full screen, the laptop windowed.
- Esc never throws you out of full screen while typing. The first time, a small note says how to leave.
- New in Appearance: **Size of everything** — Auto · 100 · 125 · 150 · 175 · 200, kept for each screen. Auto makes everything bigger on a big 4K monitor at 100 % (150 %) and leaves your laptop alone.
- Ctrl/⌘ + and − now change the size for the screen you're on; Ctrl/⌘ 0 goes back to Auto.
- In full screen with the chats list hidden (☰), rest the pointer on the left rail: the list slides in, and goes when you leave.
- The Lab stays smooth when its preview fills a 4K / 5K screen: it lowers its resolution sooner when frames get slow (renders stay full quality).
- What to try on the **Mac**: move Hearth to the big monitor, press ⛶ (or ⌃⌘F / the green button), quit, unplug the monitor and open Hearth on the laptop (windowed, its own size), plug it back (full screen again). Try Appearance → Size of everything on each screen.
- What to try on **Windows**: on the big screen press F11 or ⛶ (the taskbar disappears), type in a chat and press Esc (still full screen), press Ctrl + / Ctrl 0, restart Hearth; then drag the window to the other screen.
