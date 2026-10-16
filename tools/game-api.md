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

The window: `hearth-game://<token>/…` (a privileged standard + secure scheme, its own in-memory session `hearth-game`):
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

## GameReady (gameready stream)
`GameReady.prepare(source, onProgress) → Promise` — called by `GameMode.play` before the window opens, when present.
`onProgress(p)` with `p` a 0–1 number or `{ done: 0–1, stage }`. A rejection is logged and the game plays anyway.

## GamePerf (gameperf stream)
`GamePerf.attach(handle)` (hub side) with `handle = { source, info, leave, state }`, called once the game window is up;
`GameMode.on` tells start / end. The window's own numbers: `game:eval` + `window.__gameInfo()`, or the main-side attach.
