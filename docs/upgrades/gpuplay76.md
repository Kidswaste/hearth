# gpuplay76 (round 76): measure ▶ Play on your own PC in one click, and the Windows graphics settings checked

The owner (Windows, RTX 4080, 240 Hz): "play does look best but the framerate is abysmal". Rounds 54–72 fixed what
could be measured here, but every test machine draws in software (SwiftShader), so nothing has been checked on a real
card. This stream does two things: it checks every Electron / Chromium graphics setting ▶ Play and the Lab use on
Windows (one real bug fixed), and it adds **📈 Test play performance**: 20 seconds of your game measured on your own
computer, explained in plain words, with one-click fixes and a report you can paste to Claude.

Nothing is sent anywhere (the report only goes to your clipboard when you click Copy). No tokens. The measuring code
goes into the game's page only for the 20 s of the test and takes itself out afterwards: no steady per-frame work.

## 1. The audit: Electron / Chromium graphics settings for ▶ Play and the Lab on Windows

| Setting | What Hearth does | Verdict for a 4080 at 240 Hz |
|---|---|---|
| Hardware acceleration | Never turned off: no `disableHardwareAcceleration()`, no `disable-gpu` / `disable-gpu-compositing` / `disable-software-rasterizer` switch anywhere (gpu52 keeps a NEVER list, and its check asserts it) | ✓ fine |
| ANGLE backend | Chromium's default on Windows, **D3D11**. Hearth adds `--use-angle` only when you picked another path (`/graphics backend`), and goes back by itself if that path never reached the card. D3D11on12 runs D3D11 through a translation layer on D3D12 (more processor time per draw call); Vulkan / OpenGL on Windows are less tested and lose video overlays | ✓ fine. The test now names the path **the game's WebGL really got**, and offers **Switch graphics path to D3D11** when it's anything else |
| Frame rate / vsync | No `disable-frame-rate-limit`, no `disable-gpu-vsync` (they tear, run the card at 100 %, and in a composited window don't put frames on screen any sooner). Chromium follows the refresh of the screen the window is on; ▶ Play adds no frame cap of its own (`cap=0`) | ✓ fine. One known Windows trap remains: with two screens, a window can be paced by the main display (a 240 Hz side screen next to a 60 Hz main one plays at 60). The test detects "a steady 60 while nothing is busy" and says what to change |
| `powerPreference: 'high-performance'` | Lab layers and ▶ Play's merged Lab canvas ask for it. **Bug fixed**: an HTML build made with three.js asked `'default'` — three always passes `powerPreference: 'default'`, and the game window's patch put the game's options after Hearth's default, so `'default'` won | **Fixed** (game-preload.js): `'default'` now counts as not asking, as gpu52 already did for the Lab |
| `force_high_performance_gpu` | Windows (power auto): added app-wide, and Windows' own per-app graphics choice set to High performance only if you never set one. On a desktop with only the 4080 it changes nothing; with the processor's built-in graphics also on (common on Intel desktops), it keeps Hearth on the 4080 | ✓ fine. The test shows which card drew and Windows' graphics preference for Hearth, and offers **Use the fast graphics card** if the small one drew |
| backgroundThrottling | ▶ Play window and the Stage window: off (never slowed when on another screen or partly covered). The main window keeps Chromium's default; the Lab preview parks itself while a game plays | ✓ fine |
| Offscreen / transparent windows | ▶ Play's window and Hearth's main window are opaque (black / splash background), no `transparent`, no vibrancy / Mica. Offscreen windows exist only for board website pictures and deploy checks (never during play); the capture indicator is the only transparent window (only while recording) | ✓ nothing forces software compositing |
| devicePixelRatio | ▶ Play draws at the screen's own pixel ratio (a 4K screen at 150 % → 3840×2160); **Quality: auto** (the default since round 72) lowers it to 85 / 75 / 67 % when frames drop | ✓ fine. The test shows the drawing size, the pixel ratio and Quality's step |
| preserveDrawingBuffer | Off for ▶ Play's merged canvas when nothing reads it (round 56) and for Lab layers (round 56) | ✓ fine; the report shows it |
| antialias (MSAA) | Lab scenes in ▶ Play always get MSAA (max fidelity); an HTML build keeps its own choice | ✓ left as is (Quality auto takes pixels off first); the report shows it |
| Low-latency canvas (`desynchronized`) | Off by default (`/game lowlatency on`) | ✓; the test offers to turn it off when frames drop |
| Shader cache / WebGL contexts | 32 MB compiled-shader cache; 64 live WebGL contexts | ✓ fine |
| Process priority | The game's page runs above normal on Windows | ✓ fine |

Not changed on purpose: the GPU process's priority (Chromium manages it; raising it can starve the game's own page),
Windows' occlusion detection (a covered Hearth should rest), `alpha: false` for the low-latency canvas (it would show a
layer's clear colour where it meant transparent), and VRR (G-Sync / FreeSync) can still not be read from Electron.

## 2. 📈 Test play performance

**Where:** right-click ▶ Play › **📈 Test play performance**, or in a game press **F** and click **📈 Test performance**
under the stats chip. Also Ctrl/⌘+K "Test play performance" and `/game test`.

If no game is playing, it plays the last one (or the Lab scene open now). Once the game is really playing (Getting ready
done), a small pill counts down 20 s while you play normally. Then a card opens over the game:

- **The verdict in one sentence**, e.g. "Clink runs at 120 fps on a 240 Hz screen: the graphics card is the limit
  (7.6 ms of GPU work a frame; 4.17 ms fits 240 Hz)." The verdicts: keeps up · graphics card-bound · processor-bound
  (the game's own frame) · paced lower while nothing is busy (screen / Windows settings) · software (no graphics card).
- **Frames**: fps vs the screen's refresh, frame time p50 / p95 / p99, hitches over 50 ms.
- **The graphics card WebGL really got** (from the game's own context) and the ANGLE path (D3D11 / D3D11on12 / Vulkan /
  OpenGL / Metal), and whether it's your fast card.
- **GPU work vs processor work a frame**: the card's own time (WebGL timer queries around each frame), and the main
  thread's frame (from the frame's start until its drawing work is done).
- **The canvas**: drawing size, megapixels, pixel ratio, MSAA, draw calls in one frame.
- **Hearth's side**: its helpers' cost in the game (and the top three), Quality and Graphics settings, processor use of
  the game, the graphics process, Hearth's window and main process over the 20 s, long frames with the function name.
- **Windows**: hardware-accelerated GPU scheduling, Windows' graphics preference for Hearth, optimizations for windowed
  games, and whether the game's screen is your main display.
- **One-click fixes** (only the ones that apply): Switch graphics path to D3D11 · Use the fast graphics card · Turn
  Quality: auto on · Try Graphics: Balanced · Back to the usual canvas renderer · Turn the low-latency canvas off · Stop
  recording the hitch map · Why is it slow? (the performance doctor) · Open Windows display settings · Restart Hearth.
  Fixes that need a restart say so (with a Restart button in Hearth).
- **📋 Copy report for Claude**: every number, the switches in effect, Chromium's feature status, the screens, the
  machine and the files to look at, ready to paste into a Claude chat. **📈 Test again**, **Close**.

Afterwards the same report is in Hearth: right-click ▶ Play › **📈 Last performance report** (or `/game report`).

How it works: `gpuplay.js` (hub; the probe it injects into the game's page; the card's actions), `gpuplay-core.js`
(pure summariser + report), `gpuplaymain.js` (main side, read-only: processor use per process from
`app.getAppMetrics()` cumulative CPU time, screens, `reg query` of HwSchMode / UserGpuPreferences; clipboard; display
settings), `game-preload.js` (the pill / card over the game, the 📈 chip button, the page's WebGL contexts noted when
made), `gamemodemain.js` (`game:perf-card`, chip clicks forwarded), `gamemode.js` (the right-click items, `/game test`,
`/game report`). Lazy group `gamemode` (not on the first screen).

## Upgrades
### Measuring on your own PC
1. **📈 Test play performance** in ▶ Play's right-click menu: plays the last game (or the open Lab scene) and measures 20 s.
2. **📈 Test performance** under the F chip in a game: tests the game you're playing.
3. **A countdown pill** over the game while it measures (nothing to click, never steals the mouse).
4. **The report card over the game**: one-sentence verdict and the numbers in plain words.
5. **fps vs your screen's refresh** and **frame time p50 / p95 / p99**, hitches over 50 ms.
6. **Graphics card vs processor**: the card's own time per frame (WebGL timer queries) vs the game's main-thread frame,
   and a verdict: keeps up / card-bound / processor-bound / paced lower / software.
7. **The card and ANGLE path the game really got** (D3D11, D3D11on12, Vulkan, OpenGL, Metal, or software), and
   **whether it's the fast card** (built-in graphics flagged when a fast card exists).
8. **Hearth's own costs** in the game (its helpers, the top three), and processor use of the game, the graphics
   process, Hearth's window and main process over the test.
9. **Windows' graphics settings** read (never changed): hardware-accelerated GPU scheduling, Hearth's graphics
   preference, optimizations for windowed games; and whether the game's screen is the main display.
10. **The draw calls of one frame**, the drawing size, pixel ratio and MSAA.
### One click to fix
11. **Switch graphics path to D3D11** (when D3D11on12 / Vulkan / OpenGL is in use; after a restart).
12. **Use the fast graphics card** (when the built-in one drew, or the power-saving card was picked).
13. **Turn Quality: auto on** (when Quality is Full and the card is the limit; applies to the game at once).
14. **Try Graphics: Balanced** (when the card is the limit).
15. **Back to the usual canvas renderer** / **Turn the low-latency canvas off** / **Stop recording the hitch map**
    (when they're on and frames drop).
16. **Open Windows display settings** with the tip that applies: make the 240 Hz screen the main display, or pick 240 Hz
    when Windows runs the screen at 60.
17. **Why is it slow?** opens the performance doctor when the game's own frame is the limit.
### Sharing it
18. **📋 Copy report for Claude**: all the numbers, switches, feature status, screens and machine, clipboard only.
19. **📈 Last performance report** in ▶ Play's right-click: the same card in Hearth after you leave the game.
20. **/game test [seconds]**, **/game report**, Ctrl/⌘+K "📈 Test play performance".
### Settings fixed
21. **HTML builds on the fast card**: an HTML game made with three.js now gets `powerPreference: 'high-performance'`
    (three's `'default'` used to win).

### Checks
- `dev/gpuplay-test.js` (unit, 19 tests): percentiles, ANGLE strings, each verdict (a 4080 smooth at 240 Hz,
  GPU-bound at 4K with Quality full, CPU-bound, paced at 60 on a side screen, Windows at 60 Hz, SwiftShader, software
  with a real card, no GPU timer), the fixes offered (D3D11 never on a Mac, the fast card, Graphite / low-latency /
  hitch map), Hearth's costs, the report for Claude, an empty sample.
- `dev/checks/gpuplay76.js` (app, group `gpuplay76`): an HTML build's context asks for the fast card; F chip › 📈 →
  pill → card says **software drawing (SwiftShader)** with p50 / p95 / p99, GPU vs processor, the canvas and process
  lines; no D3D11 / Quality buttons on software; the probe out afterwards; Copy report → clipboard; a fix from the card
  (Quality auto) applied to the game; Close; right-click › Last performance report in Hearth; `/game test 4` on a Lab
  scene (three layers on one canvas: its merged context found and timed).

Count: 21 upgrades + 2 checks.

## What to try on your PC
1. ▶ Play Clink, play for a moment, press F, click **📈 Test performance**, keep playing for 20 s.
2. Read the first line. If it says the graphics card is the limit, check that Quality is Auto; if it says "paced at
   60" or "60 Hz", follow the tip (main display / refresh rate).
3. The second line should name your **NVIDIA GeForce RTX 4080 via D3D11**. Anything else (D3D11on12, Vulkan, Intel…):
   click the fix it offers and restart.
4. Click **📋 Copy report for Claude** and paste it into a chat with me: the numbers say exactly where the time goes.

## For the patch notes
- **📈 Test play performance**: right-click ▶ Play (or press F in a game and click **📈 Test performance**). Hearth
  plays your game for 20 seconds and tells you in plain words how fast it runs compared with your screen, whether your
  graphics card or your processor is the limit, which graphics card and drawing path it really uses, and what Hearth
  itself costs.
- **One-click fixes** right on the card when one applies: switch the graphics path to D3D11, use the fast graphics
  card, turn Quality: auto on, try Graphics: Balanced, or open Windows' display settings with the exact tip (main
  display, 240 Hz).
- **📋 Copy report for Claude** puts every number on your clipboard to paste into a chat; nothing is sent anywhere.
  The last report stays under right-click ▶ Play › **📈 Last performance report**.
- **HTML games now use your fast graphics card** in ▶ Play (they could land on the built-in one before).
