# Game projects and playtest (round 180, gamekit)

The owner makes games in the Lab ("Ascend to Heaven", v2; "Clinky", old format). This round makes a game a kind of
project and gives it what a game needs: a playtest that runs v2 scenes where the owner chooses, input that is the
game's, saves that last, and a start to grow from. v2 (WebGPU) scenes first, as asked.

## What was wrong (measured before building, in a throwaway copy)

| | before |
|---|---|
| ▶ Play on a v2 scene | the window opened, the layer never ran, no error shown (`__labG2.state().on === false`, 0 canvases) |
| a save | the Lab preview refuses `localStorage` ("sandboxed… lacks allow-same-origin"); ▶ Play wipes its storage when the game ends |
| where ▶ Play runs | always full screen (the screen could be picked) |
| the mouse in ▶ Play | captured on the first click, whatever the game (a pointer-driven game lost its pointer) |
| projects | no kind; the new-project card only had visual starts |

## What there is now

### 1. ▶ Play runs v2 scenes, full screen or in a window
- `gamemode.js sceneSpec`: a v2 scene's layers carry `gpu: true` and the spec `format: 'gpu'`; no WebGL merge plan
  (a v2 scene is one canvas already).
- `gamemodemain.js buildScene`: `three.webgpu.js` and `three.tsl.js` are vendored into the game's folder with the
  page (preloaded), the page's entry gets `&gpu=1`, the build key includes the format.
- **Play in** (▶ Play's right-click): Full screen · Window 1280 × 720 · Window 1920 × 1080 (`gamemode.window`:
  `'full' | '720' | '1080'`). A window's picture is that many of the screen's own pixels, in the middle of the chosen
  screen ("Play on"), never bigger than its free area, with a title bar, resizable (`GameCore.windowPlan`). Ctrl+P
  (back to editing) and Side by side leave a window as a window.
- **F5** restarts the game: its page is loaded again (no global, timer or listener of the last run left), then the
  layers as they are in the Lab now if they changed since the build (`playloop.js restart`). **F6** pauses / resumes
  (the player's freeze), **F7** draws one frame while paused. Read in the main process like Esc; a Lab scene's game
  never sees these three keys.

### 2. Input is the game's
- A v2 game's mouse is never captured for it: the game calls `input.lock()` when it wants that. Old-format scenes
  keep the capture on click, as before.
- The stats chip is **F3** in a v2 game (F is the game's key); old-format scenes keep F.
- Right-click, middle-click, wheel and keys reach the page as plain events (round 53 already removed the Lab's own
  listeners and the context menu in ▶ Play). Way out, unchanged: Esc shows the card, Esc again (or Enter) leaves.
- `input`, given to every v2 layer (`tools/three-sandbox.html`, "gamekit"): made at the first read, so a scene that
  never asks has no listener of it.
  `held(code)` · `pressed(code)` · `released(code)` · `axis(neg, pos)` · `mouse { x, y, dx, dy, wheel, left, middle,
  right, locked }` · `pad(i)` → `{ connected, lx, ly, rx, ry, buttons, axes }` · `lock()` / `unlock()`.
  Codes are `KeyboardEvent.code` and `Mouse0` / `Mouse1` / `Mouse2` (left / middle / right).
- `onStep(fn)`: `fn(dt, t)` at a fixed 60 steps a second (dt = 1/60) for every layer in lockstep, before the frame's
  `onFrame`; at most 5 steps a frame; one step for an F7 frame. `pressed` / `released` are true for exactly one step
  inside it (and for one frame in `onFrame`), so a tap is never lost on a fast screen or doubled on a slow one.

### 3. Saves
- `save`, given to every v2 layer: `write(slot, data)` · `read(slot)` · `list()` · `remove(slot)` ·
  `get(key, fallback)` / `set(key, value)` (settings, no slot) · `start()` (the slot the owner chose to playtest
  from). All return promises.
- Kept by Hearth, one folder per game: `<data>/game-saves/<scene id>/slots/<slot>.json` and `settings.json`
  (`gamesavesmain.js`). Written whole (temp + rename). 4 MB a slot, 200 slots a game. Slot names: letters, digits,
  spaces, `-`, `_` (a name can't leave the folder). Deleting moves to the system Trash.
- ▶ Play's window asks through its preload (`hearthGame.save` → `game:save`: the game playing, never named by the
  page). The Lab's preview asks through the Lab (`game-save` message → `game:saves` with the open scene). A
  published page with no Hearth uses the browser's storage (memory where refused). The same game sees the same saves
  in the preview and in ▶ Play.
- **Saves** (▶ Play's right-click, and 💾 Saves in a game project's toolbar): each save with its date; ▶ Playtest
  from this save · Delete (to the Trash) · Show the saves folder · Clear all saves (to the Trash).

### 4. "Game" as a kind of project
- The new-project card's **Start from › 🎮 Game** (`projcreate-core.js`, `gamekit-core.js`): a v2 scene with four
  layers (World, Player, HUD, Game logic) that share `window.GAME`, read `input`, step in `onStep` and keep the run
  and the best score with `save`. The project's workspace gets `kind: 'game'`.
- In the Lab, a scene of a game project: ▶ Play reads **▶ Playtest**, with **💾 Saves** next to it. Nothing is
  hidden (song, timeline and render stay).
- The AI: nothing in any prompt. The Lab's report says `project: 'a game project…'` and `three_do help games`
  (also `game`, `save`, `saves`, `playtest`, `gamepad`) teaches the kit.

## Shapes
- `game:play` request: `+ window: 'full' | '720' | '1080'`, `+ saveStart: slot | null`; `scene.format: 'gpu'`.
- `game:state`: `+ windowed`, `size` (the picture, points), `format`, `paused`.
- `game:save` (game window only): `{ op: 'write' | 'read' | 'list' | 'remove' | 'get' | 'set' | 'start', … }`.
- `game:saves` (hub only): the same plus `game: { kind, id | path }`, `'reset'`, `'dir'` (`show: true` opens it).
- `game:click`: `+ button: 'left' | 'right' | 'middle'` (checks).
- Project: `workspace.kind === 'game'`.

## Checks (silent; WebGPU needs `SMOKE_GPU_FLAGS="--ignore-gpu-blocklist"`)
- `node dev/gamekit-test.js`: saves (whole writes, names that can't leave the folder, settings, Trash only, per
  game), the window's size on 1× / 2× / small screens, the starter layers, the guide. 7 groups.
- `dev/checks/gamekit180.js` (10 steps): a v2 scene with input / onStep / save in the preview; a save written from
  the preview is on disk for that scene; ▶ Play in a 1280 × 720 window with the WebGPU canvas drawing; Space, F,
  left and right click reach the game, the mouse isn't captured, Hearth's card stays closed; F6 / F7 / F6; a save
  written in the game, read back after F5, and again after the window closed and the game was played "from this save".
- `dev/checks/gamekit180-project.js` (journey-lib): the card's 🎮 Game by clicks → a game project, the four layers,
  the starter running in the preview, ▶ Playtest and 💾 Saves in the toolbar, the report's line, ▶ Playtest in a
  window, P pauses it through `input`.

Results, Nov 14 2026, this PC (Windows 11, 3440 × 1440, silent): unit 7 / 7 groups, `gamekit180` 10 / 10 steps,
`gamekit180-project` 7 / 7 steps. One extra run of the preview part with the separate Lab player
(`HEARTH_LP_DEFAULT=1`): the layer ran inside the player with `input` / `onStep` / `save`, and its save landed on disk
through the Lab.

## Not done
- The owner's games are not edited: Ascend to Heaven still writes `localStorage` (`'ascend.meta'`), which does not
  last; switching it to `save.get` / `save.set` is a few lines for its AI.
- Old-format scenes (Clinky) get the window, F5 / F6 / F7 and the Saves list, not `input` / `onStep` / `save` (those
  are handed to v2 layers only). F5 / F6 / F7 are no longer passed on to any Lab scene's game.
- Keys in the Lab preview with the separate player (round 178's limit: its window takes no keyboard). ▶ Playtest is
  where a game is played; PLAYER › IN-APP gives the preview the keys.
- No button to mark an existing project as a game (`workspace.kind = 'game'`); only the card's Game start sets it.
- Saves are not synced between computers. No import / export of a save, no rename.
- ▶ Playtest / 💾 Saves show for a game project's scene once the Projects group is loaded (always when the scene was
  opened from its project); the same Saves list is under ▶ Play's right-click everywhere.
- Auto quality (`gamequality`) and the look helpers act on WebGL renderers; a v2 game draws at the screen's own
  pixel ratio.

## Not verified
- The window's exact size on screen. Silent runs park windows off screen, where Windows gives them no title bar or
  edges: the picture measured 1296 × 759 for a 1280 × 720 window (the same artifact `labplayer3.md` notes). The size
  maths is unit-tested (`windowPlan`); on screen the picture should be exactly 1280 × 720.
- Full screen itself in the new code path (silent runs refuse full screen); only that the window is not marked windowed.
- A real second screen ("Play on" with a window), a real gamepad (`input.pad`), mouse capture (`input.lock()`), the
  wheel, the Mac.
- The Saves menu and 💾 Saves by clicks (their functions are covered: list, play from a save; delete / clear only in
  the unit test, with a stand-in Trash, so no test file went to the real Recycle Bin).
- A published page's fallback to the browser's storage.
- Ascend to Heaven itself in ▶ Play (the owner's data is read-only for checks): a one-layer v2 scene and the
  four-layer starter were played.
- `dev/gameinput-test.js` fails on this PC before and after this round (its regex wants `\n` line ends; the checkout
  has `\r\n`).

## Files
`gamesavesmain.js` (new), `gamekit-core.js` (new, lazy group "projcreate"), `gamemode.js`, `gamemode-core.js`,
`gamemodemain.js`, `gameinputmain.js`, `game-preload.js`, `playloop.js`, `playloopmain.js`, `preload.js`,
`projcreate.js`, `projcreate-core.js`, `lazy-data.js`, `tools/three-sandbox.html`, `tools/three.js`,
`mcp/three-guide.js`, `tools/game-api.md`, `dev/gamekit-test.js`, `dev/checks/gamekit180.js`,
`dev/checks/gamekit180-project.js`, `dev/run-checks.js`.
