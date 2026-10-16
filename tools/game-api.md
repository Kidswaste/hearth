# ▶ Play (game) — the shared contract (round 52)

Three parts share one entry point, ▶ Play: **GameMode** (the window / runtime), **GameReady** (preparation / cache),
**GamePerf** (overlay / doctor). This file is the contract between them; each stream keeps its own section.

A game is a `source`:

```js
{ kind: 'lab', id: '<Lab scene id>', title: 'Clink' }      // a Lab scene (the main path: Clink is a Lab scene)
{ kind: 'html', path: '/…/clink/index.html', title: 'Clink' } // a built game: its page (or its folder)
```

## GameReady (tools/gameready.js, lazy group `gameready`; main: gamereadymain.js)

```js
await Lazy.load('gameready');
const res = await GameReady.prepare(source, onProgress, opts);
```

- `onProgress({ stage, pct, text })`: `text` is the card's line, e.g. `Getting Clink ready… textures 40/120 · 50 %`.
- `opts.port` (Lab scenes): the game window to prepare, `{ send(msg), host, scene(), refs(), code(), open(id),
  reread(refIds) }`. Default: `ThreeLab.game`, the Lab's own preview (and the Stage window when the Lab draws there).
  A ▶ Play window that runs `tools/three-sandbox.html` passes a port whose `send` reaches that page and routes the
  page's `ready-*` answers to `GameReady.onBox(msg)` (the Lab does it through `window.__gameReadyHook.onBox`).
- `opts.card === false`: no card (▶ Play draws its own from `onProgress`). Default: the calm card over `port.host`
  with **Play now**, **Optimize for play** (when a model has no optimized copy yet) and Esc.
- `opts.play === false`: resolve when ready without starting play (call `GameReady.play()` later).
- Result: `{ ok, readyMs, ms: { assets, effects, warm }, steps, inventory, findings: [{ kind, text, n, bytes }],
  plan: { fresh, stale, missing, swapped }, first5 }` (`first5` arrives 5 s into play: `GameReady.state().first5` =
  shaders compiled / textures uploaded during the first 5 s of play; 0 / 0 when getting ready worked).
- `GameReady.play()` / `GameReady.stop()` (Esc / leaving: 100 % quality released, originals read again).
- `GameReady.optimize(source?)` → `{ ok, made, skipped, failed }` or `{ needTool: true, plan: { command } }`: writes
  only into `<data>/game-cache`. Never installs anything: the card shows the command and runs it after a click.
- HTML games: `prepare({ kind: 'html', path })` opens the game window itself (`hub.gameReady.openHtml`) when ▶ Play has
  none. A window ▶ Play makes for an HTML game should use the session partition `persist:hearth-game` and load the
  build as `hearth-game://<host>/…` through gamereadymain's handler (so the optimized copies are served by URL and
  `tools/gameready-page.js` runs before the game's own scripts); the page talks over `gameready:from` / `gameready:to`.

Rules for every game window (so a second launch skips its shader compiles): a **persistent** session (the default
one or a `persist:` partition: an in-memory partition has no shader disk cache), `backgroundThrottling: false`.
Chromium's GPU program cache is raised to 32 MB in main.js (`gpu-program-cache-size-kb`).

Lab-page messages GameReady sends (tools/three-sandbox.html): `ready-lock { on }` (100 % quality), `ready-scan { id }`
(everything in, textures at the best anisotropy, what the scene costs → `ready-scanned`), `ready-prep { id }`
(compile + upload → `ready-prepped` with `compileMs`), `ready-warm { id, n }`, `ready-count`.
