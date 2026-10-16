# ▶ Play (round 52, gamemode): your three.js game full screen, one canvas, max quality

The owner asked: "I have a project that's a three.js game right now (Clink) and I want it to run buttery smooth at max
graphical fidelity when I take the time to load it up properly instead of a window full of layers."

It's one button: **▶ Play**. The game opens in a window of its own, full screen on your big screen, with nothing of
Hearth around it, and runs at max quality. Esc brings you back. Nothing is added to any prompt (0 tokens), nothing is
uploaded, and your game's files are only read, never changed.

New files: `gamemode-core.js` (pure: sources, the one-canvas plan, page or live, the screen, fidelity, safe paths),
`gamemode.js` (hub side, lazy group `gamemode`: Play, the menus, `/play`, `/game`, Ctrl/⌘+K), `gamemodemain.js` (main:
the game window, the `hearth-game:` protocol, building a Lab scene's page), `game-preload.js` (the game window: Esc card,
stats chip, `window.hearthGame`), `tools/game-api.md` (the shapes shared with gameready / gameperf),
`dev/fixtures/game-html/` + `dev/fixtures/game-lab-scene.js` + `dev/make-game-fixture.js`, `dev/gamemode-test.js` (UNIT),
`dev/checks/gamemode.js`.

## How it works
1. **Where it is**: ▶ Play in the Lab's toolbar (plays the scene open now; right-click: your last games, an HTML game,
   the screen to play on); a scene's right-click (All as pictures, the scene picker) and the Lab's View menu; Forge
   Debug's ⋯ › **▶ Play full screen** (the build itself, no patches); Home / Projects' right-click on a Lab scene or an
   `.html` file; Ctrl/⌘+K **▶ Play the last game** / **▶ Play an HTML game…** / **▶ Play Clink** (your recent games by
   name); `/play Clink`, `/play last`, `/play ~/Games/clink/index.html`; `/game` plays the last one again,
   `/game stop` leaves, `/game screens` lists the screens and their refresh. Plain `/play` still plays the Lab's song.
2. **Its own window**: full screen on the screen picked (the biggest by default, then the fastest refresh; remembered
   when you pick one), no frame, no menus, black behind. Its **own renderer process** (chats and the Lab never share its
   main thread), `backgroundThrottling` off, its process at **above-normal priority** (Windows; a Mac / Linux user
   process keeps normal), the screen kept awake. Mac: its own full-screen space (`gamemode.macFullscreen: 'simple'` for
   the instant, same-space kind); Windows: borderless full screen over the taskbar (DWM flips it straight to the
   screen, like exclusive full screen).
3. **A Lab scene** runs as a **standalone page**: the Lab's own player with three.js next to it, the scene's layers,
   pictures and song, built like ⇪ Publish into `data/game/<scene>` (kept: an unchanged scene opens at once, "page
   (ready)"). No hub in the loop while you play.
4. **One canvas**: the layers that can merge share **ONE WebGL context and ONE canvas** instead of a stack of canvases.
   Each layer keeps its own three.js renderer (scene, camera, materials) made on the same context; their frames run
   together in one animation frame and are drawn bottom first at its end (`resetState()` between them, only the bottom
   one clears the colour), exactly as the stack looked. A layer that only drew once is drawn again from its last scene.
   Layers that can't merge (a filter, a see-through / moved / keyframed / cropped one, post-processing, a precomp, a Lab
   helper's own canvas) keep their own canvas, and a toast says which and why ("“Glow” keeps its own (a filter)").
5. **Max fidelity**: every renderer at the screen's own pixel ratio (whatever the sketch asked, e.g.
   `Math.min(devicePixelRatio, 2)`), antialias (MSAA, 4 samples here), the high-performance GPU, quality locked at 100 %
   (no labadapt step, no doze, no Light mode, no pace skipping), **no fps cap**: frames come at the screen's own rate
   (60 / 120 / 144 / 240 Hz; the screen's refresh is read from the system and shown in the chip).
6. **Page or live, picked for you**: the page has the fewest moving parts. A scene that needs the Lab while it plays
   (the camera, MIDI, the live sound, scenes inside it) plays **live** instead: the Stage window, full screen on the
   same screen, with a note saying why. The chip says which one runs.
7. **An HTML / folder game** (like Forgeheart in Forge Debug) loads **as it is** from its folder through
   `hearth-game://<token>/…`, so its relative files (scripts, modules, models, sounds) load as from a web server. It
   can't reach Hearth (another origin, no Node, sandboxed), can't read anything outside its folder, can't write
   anything, can't post anything to the web (only downloads of its own libraries), and only gets pointer lock / full
   screen / gamepads. Its WebGL asks for antialias and the fast GPU unless the game says otherwise.
8. **Input**: a click captures the mouse (pointer lock, raw movement where the system has it) for a Lab scene; an HTML
   game captures it itself. Gamepads pass straight through. Keys go to the game; no Hearth shortcut runs while playing
   (⌘ shortcuts are held on the Mac), except the leave keys.
9. **Leaving**: **Esc** shows a small card, **Back to Hearth** (Enter, or Esc again) / **Keep playing**. ⌘Q / ⌘W on
   the Mac and Alt+F4 / Ctrl+W on Windows leave at once (⌘Q doesn't quit Hearth). Hearth comes to the front with
   "Back from Clink · ▶ Play again".
10. **F**: a tiny stats chip, off by default (F when the mouse isn't captured): fps · frame time · the screen's Hz · how
    it runs ("one canvas (3 of 3 layers) · page (ready)", "HTML build", "live from the Lab"). Its frames are only
    counted while it shows.
11. **While playing**, Hearth's background work waits (powerwise's quiet, like ▣ Present: updates, backups, sync,
    usage / cost checks, tips) and the Lab preview here rests (parked: no frames, no doze / adapt steps; its song
    pauses). Esc puts it all back.
12. **Remembered**: the last six games; ▶ Play's right-click, Ctrl/⌘+K and `/play last` play them in one step.

## Measured (dev/checks/gamemode.js, SwiftShader under Xvfb at 1600 × 1000, a shared machine)
| | The Lab preview (before) | ▶ Play (now) |
|---|---|---|
| The 3-layer game scene (sky, world, HUD) | 3 canvases, 3 WebGL contexts, blended by the page every frame, in the hub's window | **1 canvas, 1 WebGL context** (3 renderers on it), its own window and process |
| Pixel ratio | the sketch's `Math.min(devicePixelRatio, 2)` × labadapt's step | the screen's (canvas 1599 × 999 at DPR 1, = the window × DPR) |
| Antialias | as the sketch asked | on, 4 samples (MSAA) |
| fps cap / quality | Auto cap, labadapt, labpace, doze | none / locked 100 % / off / off |
| Background work while it runs | on | quiet (Power.quietNow), the Lab parked; back after Esc |

- Play → the window up: ≈ 0.2 s to the window, the scene's page built once (three.js copied from the local copy) and
  kept; the second Play of an unchanged scene: "page (ready)". The HTML test game: its level, texture, module and
  three.js from its own folder, drawing in ≈ 8 s here (software GL).
- Isolation, checked in the window: `require`, `process` and `window.hub` undefined; a `%2e%2e` path out of the folder:
  404; a POST: 405.
- A picture of the merged canvas (window's own pixels) shows the stars of the sky layer, the world and the HUD's bars
  on top, as in the Lab.
- Frame rate on SwiftShader is a few fps at 1600 × 1000 with MSAA (the CPU draws); a real GPU runs it at the screen's rate.

## Upgrades
### Play
1. **▶ Play** in the Lab's toolbar: the scene as a game, full screen, in its own window.
2. ▶ Play's right-click: your last games, Play an HTML game…, the screen to play on.
3. ▶ Play on a scene's right-click (All as pictures), in the scene picker's right-click and in the Lab's View menu.
4. Forge Debug ⋯ › ▶ Play full screen: the build itself, as it is.
5. Home / Projects: ▶ Play on a Lab scene or an `.html` file's right-click.
6. Ctrl/⌘+K: ▶ Play the last game, ▶ Play an HTML game…, and ▶ Play <each recent game> once Play has been used.
7. `/play <game | last | path>` (plain `/play` still plays the Lab's song).
8. `/game` (the last game again), `/game stop`, `/game screens`.
9. The last six games remembered: "Play Clink" is one click next time.
### The window
10. Its own window and renderer process, full screen on the big screen (biggest, then fastest refresh; your pick kept).
11. No background throttling, above-normal priority, the screen kept awake.
12. Mac: native full-screen space (or "simple" full screen); Windows: borderless full screen over the taskbar.
13. Esc: Back to Hearth / Keep playing (Esc again or Enter leaves).
14. ⌘Q / ⌘W, Alt+F4 / Ctrl+W leave at once; ⌘Q never quits Hearth while playing; no Hearth shortcuts while playing.
15. F: the stats chip (fps, frame time, Hz, how it runs), off by default.
16. "Back from Clink · ▶ Play again" when you're back.
### A Lab scene
17. Runs as a standalone page (the Lab's player, the scene's pictures and song), built once and kept.
18. **One canvas, one WebGL context** for its plain layers; the others keep their own canvas, with the reason.
19. Max fidelity: the screen's pixel ratio, antialias (MSAA), the fast GPU, quality locked, no fps cap.
20. A click captures the mouse (raw movement); the Lab's look-around gestures are off in the game.
21. Picks page or live by itself (live: the Stage window full screen, for the camera / MIDI / live sound / precomps).
### An HTML game
22. Loads as it is from its folder through a safe, read-only protocol: relative files work.
23. No access to Hearth, no Node, nothing outside its folder, nothing posted to the web.
24. Its WebGL asks for antialias and the fast GPU by default.
25. A narrow API only if the game asks: `window.hearthGame.leave()` / `.info()`.
### While playing
26. Hearth's background work waits and the Lab preview rests; everything back when you leave.
27. GameReady (preparing assets) runs first and GamePerf gets the game, when those parts are in (`tools/game-api.md`).

27 upgrades.

## Tests
- `node dev/gamemode-test.js` (UNIT): sources, recent games, the one-canvas plan and its reasons, page or live, the
  screen pick, fidelity, the chip line, safe paths (`..`, `%2e%2e`, drive letters, NUL), a scene's page built (three.js
  next to it, the plan in its host) and kept.
- `sh dev/run-checks.sh gamemode` (`dev/checks/gamemode.js` + presentready, bigscreen, idlecpu, powerwise, lazy,
  boot-test): ▶ Play from the Lab's toolbar opens a separate window (its own process, `hearth-game:`), one WebGL context
  and one canvas for the 3-layer scene, fidelity applied (antialias, pixel ratio, no cap, quality locked), the merged
  canvas drawing, keys reaching the game, the background work quiet and the Lab parked, Esc → Back to Hearth → Esc
  leaves and everything comes back; the HTML game's relative assets, its antialias, its isolation, keys, the F chip,
  `/game stop`; remembered: `/play last`, `/play <scene name>` (page ready).

## Edits outside the new files
- `tools/three-sandbox.html` (the Lab's player): `?game=1` in the 'three' shim (antialias, high-performance, the
  screen's pixel ratio, `__gmTake` for the shared context); a "▶ Play: one canvas" block (GM: the plan, the shared
  context, the frame queue, the bottom-first composite, `window.__gameInfo`); one-line hooks in `trackRenderer`,
  `letGoRenderer0`, the render instrument, `paceSkip`, the rAF wrapper (`run.__L`), `sched`, the gesture / key layers
  (off in a game), the messages (`game-plan`). All inert without `?game=1`.
- `tools/three.js`: the ▶ Play button + its right-click, rows in the scene card / picker / View menus, syncPark parks
  while a game plays, `hearth:stage-closed`, `ThreeLab.present`.
- `tools/forge-game.js` (⋯ row), `projects.js` (item right-click row), `deploymain.js` (exports `vendorThree`,
  `labPage`), `main.js` (the privileged scheme before 'ready', the lazy IPC line), `preload.js` (`hub.game`),
  `lazy-data.js` / `lazy-meta.js` (the group), `index.html` (the group's lazy-at name), `dev/run-checks.js` (unit, own
  group, the fixture, `HEARTH_THREE_DIR` for the check).

## Risks
- The shared context relies on each layer's three.js renderer calling `resetState()` before drawing (done for it);
  code that makes raw GL calls or render targets is kept off the merge by its text (EffectComposer, RenderTarget,
  getContext…), so a layer doing it in a way the text doesn't show could draw wrongly in the game (the Lab is
  unaffected). The toast and `window.__gameInfo().own` say what merged.
- A merged layer draws in the same frame as the others but its `render()` is drawn at the frame's end: a layer reading
  pixels back right after its own render would read the previous frame.
- The standalone page has no Lab hub: live slider moves, MIDI and the camera don't reach it (those scenes go live
  through the Stage window instead). Its sliders start from the values saved in the code.
- A scene's frame shape (9:16…) isn't letterboxed in the game: games fill the screen.
- Hz comes from the system's display info (Windows / Mac report it; Linux here says 60). Priority above normal works
  on Windows; a Mac keeps normal for a user process.
- Pointer lock and focus couldn't be checked under Xvfb (no window manager); keys and clicks were sent as real input.
- Mac native full screen animates into its own space (≈ 0.7 s); "simple" full screen is instant.

## How to play Clink
- **Clink as a Lab scene**: open it in the Three.js Lab, press **▶ Play** (in the toolbar, next to ▣ Present). It opens
  full screen on your big screen; click once to capture the mouse. Esc → **Back to Hearth**. Next time: ▶ Play's
  right-click › **▶ Play Clink**, Ctrl/⌘+K "Play the last game", or `/play Clink`. Press F (mouse free) to see the frame rate.
- **Clink as an HTML build**: `/play /path/to/clink/index.html` (or ▶ Play's right-click › Play an HTML game…, or
  right-click its `.html` in Home › ▶ Play). It loads straight from its folder; your files are never changed.
- On two screens: ▶ Play's right-click › Play on › your big screen (remembered); `/game screens` shows each screen's Hz.

## For the patch notes
- **▶ Play: your three.js game, full screen, at max quality.** One button in the Lab: the scene opens in its own window
  on your big screen, with nothing of Hearth around it, and runs at your screen's own refresh rate (240 Hz included).
- **One canvas instead of a stack of layers**: the scene's layers draw together on a single canvas and a single
  graphics context, in a window and process of their own, so chats and the Lab never slow it down.
- **Max quality, always**: full sharpness at your screen's pixel density, smoothing (antialias) on, the fast graphics
  card, no frame cap, nothing lowered when it's busy.
- **HTML games too**: play an HTML / folder build (like Forgeheart) straight from its folder, safely: it can't reach
  Hearth or change your files.
- **Esc** shows "Back to Hearth"; **F** shows a small frame-rate chip. Hearth pauses its background chores while you
  play and picks them up when you're back.
- **Remembered**: "Play Clink" is one click next time (▶ Play's right-click, Ctrl/⌘+K, or `/play Clink`).
- Caveat: layers that are see-through, moved, filters or post-processing keep their own canvas (Hearth tells you which).
