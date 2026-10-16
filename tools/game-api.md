# Game mode: the shared shapes (round 52: gamemode, gameready, gameperf)

One entry point: **▶ Play**. `GameMode` (gamemode stream) owns the window and the runtime, `GameReady` (gameready)
prepares and caches what a game loads, `GamePerf` (gameperf) measures and explains. Each works on its own; when the
others are in, they meet through the names below. Keep this file in sync when a shape changes.

## Source descriptor
```js
{ kind: 'lab', id: 's1abc', title: 'Clink' }                      // a Lab scene (its id in three-sketches)
{ kind: 'html', path: '/Users/me/Games/clink/index.html', title: 'clink' } // an HTML file, or a folder with index.html
```
`GameCore.source(x)` makes one from a string (a path → html, anything else → a Lab scene id) or a partial object;
`GameCore.sameSource(a, b)` compares two.

## GameMode (window, hub side: gamemode.js, lazy group "gamemode")
- `GameMode.play(source, { display }) → Promise<info>`: GameReady first (if present), then the game window.
- `GameMode.leave()`, `GameMode.state() → { playing, source, info, live, plan, last, recent }`, `GameMode.playing`.
- `GameMode.on(fn) → off`: `fn({ type: 'start', source, info })` / `fn({ type: 'end', source, why, secs })`.
- `GameMode.recent()` / `GameMode.last()` (store `gamemode.recent`, newest first, 6), `GameMode.resolve(text)` (a name,
  "last", a path → a source), `GameMode.sceneSpec(id)` (what a Lab scene's page is built from).
- Settings in `store`: `gamemode.display` (a screen id), `gamemode.macFullscreen` ('native' | 'simple').
- Commands: `/play <game | last>` (shares /play: plain /play still plays the Lab's song), `/game [stop | screens]`.

## Main process (gamemodemain.js; preload `window.hub.game`)
| Channel | From | What |
|---|---|---|
| `game:play` `{ source, scene?, display?, macFullscreen? }` → info | hub | opens the game window (scene: the Lab spec + `plan`) |
| `game:leave` · `game:state` → info · `game:displays` → `[{ id, label, w, h, scale, hz, primary, hub }]` | hub | |
| `game:left` `{ source, secs, why }` (event) | → hub | the game window closed |
| `game:eval` code → `{ value }` · `game:key` `{ key, mods }` · `game:click` `{ x, y }` | hub (checks) | real input through Chromium |
| `game:info` → info · `game:back` | game window preload | the chip's line, "Back to Hearth" |

`info = { playing, source, title, route: 'page' | 'html' | 'live', how, display: { id, label, w, h, scale, hz }, hz,
fidelity: { level: 'max', pixelRatio, antialias, msaa, powerPreference, cap: 0, adapt: false, hz }, pid, priority,
separate, started, notes, fullscreen, url }`. `how` is the line the stats chip shows ("one canvas (3 of 3 layers) ·
page (ready)", "HTML build", "live from the Lab (…)").

The window: `hearth-game://<token>/…` (a privileged standard + secure scheme, its own session `persist:hearth-game`, whose game-stored data is wiped when a game ends; only compiled shaders persist):
read-only (GET / HEAD), never outside the game's folder (`GameCore.safePath`), no Node, contextIsolation + sandbox,
only `pointerLock` / `fullscreen` / `keyboardLock` permissions, non-GET requests to the web refused, downloads refused.
`backgroundThrottling: false`, process priority above normal (where the system allows), powerwise `hold('present')` +
`quiet(true)` while it plays.

GamePerf, main side (optional): if `gameperfmain.js` exists, `require('./gameperfmain').attach(gameWindow, info)` runs
right after the window is made.

## The game window's page
- Preload (`game-preload.js`) gives the game, only if it asks: `window.hearthGame = { leave(), info() → { title, hz, how, display } }`.
- Its own UI is `<hearth-game-ui>` (an open shadow root): `.hint`, `.chip` (F), `.card` (Esc: `.back` "Back to Hearth", `.keep`).
- A Lab scene's page (`data/game/<scene>/play.html`, built from the Lab's player like ⇪ Publish) sets
  `window.__hearthGame = { ready, drawn, errors, started, plan }` and answers `window.__gameInfo() → { game, merged,
  own, renderers, frames, contexts, canvases, antialias, samples, power, pixelRatio, canvas: { w, h, cssW }, cap, lock,
  quality, pace }`.
- Messages into the Lab player (`postMessage({ target: 'three-sandbox', … })`): `game-plan { merge: [layer ids], why:
  { id: reason } }` (before `run-layers`), plus the existing `ready-lock { on: true }`, `pace { on: false }`,
  `adapt { on: false }`, `fps-cap { value: 0 }`, `tweak-init`, `refs`, `media-load`, `run-layers`.

## One canvas (GameCore.mergePlan)
Bottom first: a layer merges when it draws with its own `new THREE.WebGLRenderer` straight to the screen, normal blend,
opacity 1, not moved / scaled / turned, no keyframes, shown the whole time, no crop / mask / effects, not a filter, no
EffectComposer / render targets / its own GL calls, not a precomp. The merged layers are the bottom run of those;
`why[id]` says why the others keep their own canvas.

## GameReady (gameready stream: tools/gameready.js, lazy group "gameready"; main: gamereadymain.js)
`GameReady.prepare(source, onProgress) → Promise<{ ok, plan, models, … }>` — called by `GameMode.play` (after
`Lazy.load('gameready')`) before the window opens. `onProgress(p)` with `p` a 0–1 number or `{ done: 0–1, stage, text }`.
A rejection is logged and the game plays anyway. What it does before the window: the scan (a Lab scene's model
references; an HTML build's files from its last launch), the models hashed, Hearth's optimized copies looked up, then
`gameready:arm { kind, title, map, noPrep, opt }`: the next game window is armed.

In the game window (one window: gamemode's), when armed:
- gamemodemain's `hearth-game:` handler asks `gamereadymain.swapFor(file)` (an optimized copy in `data/game-cache`
  served for the original's address; for a Lab scene, copied into `data/game/<scene>/assets` instead of the reference)
  and puts `gamereadymain.pageTag()` — `<script src="/__gameready-page.js?t=…&k=lab|html">` — first in every HTML page
  it serves (the script itself, `tools/gameready-page.js`, is served on the game's own address). It notes what it
  served (`gameready:served`: the next launch's scan).
- `tools/gameready-page.js` shows the card (`<gameready-card>`, open shadow root) before the first frame, then prepares:
  a Lab scene through the Lab player's own messages (`ready-scan`, `ready-prep`, `ready-warm`, `ready-count`, posted
  with `target: 'three-sandbox'`, answered with `source: 'three-sandbox'`), an HTML build through three's devtools hook
  (its renderers / scenes), `compileAsync`, `initTexture` and held frames. Then the card goes and the first 5 s of play
  are counted.
- `window.__gameReady.pub()` → JSON `{ mode, phase: 'ready' | 'playing', pct, text, cardAt, firstFrameAt, result: { ms,
  steps, inventory, gl, total }, first5: { compiles, links, uploads, … }, want, wantN, errors, card }`; GameReady reads
  it through `game:eval` from `GameMode.on('start')` until `first5`, and answers the card's Optimize / Install with
  `window.__gameReady.answer({ kind: 'install', command, why } | { kind: 'done', text })`.
- `GameReady.state()` → `{ kind, title, phase, readyMs, page, result, findings: [{ kind, text, n, bytes }], first5,
  plan: { fresh, stale, missing, swapped }, models, decoders, loaded }`. `GameReady.optimize(source?)` →
  `{ ok, made, skipped, failed }` or `{ needTool: true, plan: { command } }` (never installs by itself).

The window's session is `persist:hearth-game`: Chromium keeps the compiled shaders on disk (a second launch skips the
compiles; `gpu-program-cache-size-kb` 32768 in main.js); what a game stores itself (cookies, local storage, IndexedDB,
service workers, cache storage) is wiped when it ends.

## GamePerf (gameperf stream)
`GamePerf.attach(handle)` (hub side) with `handle = { source, info, leave, state }`, called once the game window is up;
`GameMode.on` tells start / end. The window's own numbers: `game:eval` + `window.__gameInfo()`, or the main-side attach.

## Play-test (round 53, directorgame: tools/directorgame*.js, directorgamemain.js; preload `window.hub.gameTest`)
| Channel | From | What |
|---|---|---|
| `game:script` `{ ops: [{ at, do: down \| up \| move \| click \| mark, key, dx, dy, x, y, i }] }` → `{ ok, why, ms }` | hub | input timed on the main side, sent only to the ▶ Play window (its hearth-game origin); keys held are let go at the end; Esc / ⌘ never sent |
| `game:script-stop` · `game:shot { width }` → `{ data, mime, w, h }` | hub | stop a run · one small JPEG of the game window |

The page side is `window.__dgPlay` (injected through `game:eval`): `begin(n)`, `mark(i)`, `result()` → JSON, `frames()`.
A game can help it judge moves by exposing `window.game = { x, y, z, score, … }` (or `window.hearthState()`); a Lab
scene's `__scenes` gives the camera. The director: `three_do play {game, script, secs, perf, shot, op}` (`three_play` on
the hub); the owner: `/playtest`.
