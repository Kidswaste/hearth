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
- `GameMode.play(source, { display, perf }) → Promise<info>`: GameReady first (if present), then the game window
  (round 57: `perf: true` = the performance probe from the first frame; otherwise GamePerf gets the window dormant).
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
| `game:lock` bool · `game:menu-on` · `game:menu-off` | game window preload | (round 53, gameinput) the mouse captured or not; the card shown by the page (Esc freed the mouse) / closed by "Keep playing" |
| `game:menu` · `game:stats` (events) | → game window preload | (round 53) show the card (Esc) / toggle the chip (F): the keys are read main-side, see below |

`info = { playing, source, title, route: 'page' | 'html' | 'live', how, display: { id, label, w, h, scale, hz }, hz,
fidelity: { level: 'max', pixelRatio, antialias, msaa, powerPreference, cap: 0, adapt: false, hz }, pid, priority,
separate, started, notes, input, fullscreen, url }`. (round 53) `input = { focus: { ok, tries, ms }, keys: { held, esc, system },
menu, locked, lowLatency, raw, selection }` (gameinputmain.js). `game:play` takes `input: { lowLatency }` (store
`gamemode.lowLatency`, `/game lowlatency on|off`, off by default; a Lab scene's page gets `&lowlat=1`). `how` is the line the stats chip shows ("one canvas (3 of 3 layers) ·
page (ready)", "HTML build", "live from the Lab (…)").

The window: `hearth-game://<token>/…` (a privileged standard + secure scheme, its own session `persist:hearth-game`, whose game-stored data is wiped when a game ends; only compiled shaders persist):
read-only (GET / HEAD), never outside the game's folder (`GameCore.safePath`), no Node, contextIsolation + sandbox,
only `pointerLock` / `fullscreen` / `keyboardLock` permissions, non-GET requests to the web refused, downloads refused.
`backgroundThrottling: false`, process priority above normal (where the system allows), powerwise `hold('present')` +
`quiet(true)` while it plays.

GamePerf, main side (optional): if `gameperfmain.js` exists, `require('./gameperfmain').attach(gameWindow, info)` runs
right after the window is made.

## The game window's input (round 53, gameinput: gameinputmain.js)
- **Nothing of Hearth's listens to the game's input.** The keys Hearth needs are read by the window's main-side
  `before-input-event` handler (`gameinputmain.key`): Esc → `game:menu` (the card; the game gets its Esc too), Esc
  again or Enter while the card shows → leave (from the main side: a stuck page can still be left), F while the mouse
  is free → `game:stats`, Alt+Space held (Windows' window menu), ⌘ shortcuts held / ⌘Q ⌘W, Alt+F4, Ctrl+W leave as
  before. The preload only listens to `pointerlockchange` (rare). In a Lab scene's page (`?game=1`) the Lab player adds
  no input listeners of its own (no pace / doze pokes, ✥ Direct, look-around gestures, host keys, right-click menu
  messages) and posts no stats to itself. Keep it that way: `dev/checks/gameinput.js` counts them (budgets).
- Pointer lock: the preload's code in the game's world makes `requestPointerLock()` ask for `unadjustedMovement: true`
  (raw mouse) unless the game passes the option itself; `NotSupportedError` → the plain kind. `.hearthRaw` on the
  function: 'raw' | 'fallback' | 'refused (…)'. `document.exitPointerLock()` dispatches `hearth-game-unlock` on
  window, so the preload can tell the game letting go from Esc (Chromium keeps an Esc that frees the mouse for
  itself; the card is shown then, and `game:menu-on` tells the main side).
- The browser Keyboard Lock (`navigator.keyboard.lock`) is refused by Electron 44 ("lock() request could not be
  registered", in Hearth's own window too): ⌘Tab / the Windows key / Alt+Tab stay the system's.
- Focus on open: `win.focus()` + `webContents.focus()` (Mac: `app.focus({ steal: true })`, after the full-screen space;
  Windows: topmost for a moment, the foreground lock), checked after 300 ms, tried once more.
- `insertCSS`: no text selection (editable fields keep it), no drag ghosts. `disableHtmlFullscreenWindowResize`: a
  game's own `requestFullscreen()` never resizes the window. Leaving destroys a window that hasn't closed in 1.5 s.

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
(round 57, framepace57) ▶ Play attaches it `dormant`: the probe is put into the window only when the doctor, the chip or
the director's perf asks (it then measures 4 s); `GameMode.play(source, { perf: true })` (a play-test with perf) puts
it in from the first frame.
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

## Lighter textures (round 53, gametex: tools/gametex-core.js, gametexmain.js, tools/gametex-worker.js)
- `GameReady.optimize` also sends the scene's pictures `pics: [{ path, hash, size, role: 'color'|'normal'|'data', flip }]`
  and the GPU's formats `caps` (`GameTexCore.caps(extensions)`); a model file may carry `variant: 'ktx2'` (its copy's
  pictures are KTX2: its own cache key). Result: `pictures { made, kept, keptNow }`, `tex` (the report:
  `{ before, after, text: 'Textures: … → … of video memory' }`), `meshTool`, `meshPlan` (gltfpack's install plan).
- `gameready:texplan { files, pics, caps }` → `{ map: { normPath → { out, mode, flip, w, h } }, report, kept, models }`.
- `gameready:arm` takes `tex` (that map) and `tx` (the report line: the card shows it; `__gameReady.pub().tx`).
- A Lab scene's page: a reference item may carry `ktx2` (the copy's bytes); `refTexture()` uses it when the GPU takes a
  compressed format (`texture.userData.ktx2`), else the picture.

## PlayLoop (round 53, playloop: playloop.js in the "gamemode" group, playloopmain.js)
- **A layer's hooks** (Lab scenes; the Lab player, `tools/three-sandbox.html`): `export function saveState()` → a
  cloneable value, `export function restoreState(value)`, `export function checkpoint(name)` (or `export const hot =
  { save, restore, checkpoint }`). A hot re-run of the layer (the Lab's edits, ▶ Play's live edits) hands the old run's
  saved value to the new run once it loaded; a broken run holds it for the next. `window.__labHot`: `save()` → `{ layer:
  value }`, `restore(states)` → n, `checkpoint(name)` → n, `info()` → `{ swaps, kept, lost, last, hooks, checkpoints }`.
- **Live edits** (hub): `hearth:lab-ran` for the game's scene → `GameMode.sceneSpec` compared with what the window runs:
  code only → `hot-layer` (fx '') / `layer-props` per layer; layers added / removed / reordered or another one-canvas
  plan → `game-plan` + `run-layers` in the same page, states handed back; pictures / song / palette / three.js version →
  the page built again (`GameMode.leave({ quiet: true })` + `GameMode.play`), states handed back. Posted through `game:eval`.
- `GameMode.rest(on)` (the window hidden and kept: `hold(false)` / `hold(true)`), `GameMode.state().resting`,
  `GameMode.leave({ quiet })` (no "Back from" toast). `PlayLoop.display()` → the side-by-side screen for `GameMode.play`.
- Main: `game:loop { op: 'rest' | 'wake' | 'side' (on, display) | 'blip' (text, clear) | 'state' }` → `{ playing, resting, side }`
  (hub only); events to the hub `game:loop-ev { type: 'rested' | 'woke' | 'fix' (error, source) | 'key' (what: 'here') }`;
  from the game window `game:fix { message, line, layer, file, stack }` (its error line's button); to it `game:blip { text, clear }` (clear: a new version goes in, the old error line goes).
  Resting: hidden (the Mac leaves its full-screen space first), throttled, muted, a Lab page parked (`park`); closes
  after 10 minutes resting. gamemodemain's `before-input-event`: gameinput's `gameinputmain.key` (Esc card, Enter, F), then `playloopmain.key(input)` (Ctrl/⌘+P; resting closes an open Esc card: `game:menu-close`, the card's Fix sends `game:menu-off`); no key listener in the preload.
- The game window's preload: `.blip` ("↻ Updated"), `.err` (`.m` the line, `.fixit`, `.x`), `.box .fix` on the Esc card.

## The look (round 54, gamelook: gamelook-preload.js, a second preload of the persist:hearth-game session)
- `game:play` takes `look: 'best' | 'balanced'` (hub store `gamemode.look`, Best by default; 'off' = round 53, checks
  only); `info.fidelity.look`; the window's `--hearth-game` JSON carries `look`. ▶ Play's right-click: "Graphics: Best /
  Balanced"; `/game look [best | balanced]`.
- In the game's world, before its scripts: `gameLookPage({ look, hz })` listens on `__THREE_DEVTOOLS__` (it makes it
  first: GameReady / GamePerf add their listeners to it) and wraps each renderer's `render` / `compile` / `compileAsync`
  / `initTexture` to look at the scene first (round 54 fix: whole only before its first frame; then what the game adds,
  through `Object3D.add` / `attach`, before it's drawn, and a background walk of ≤ 0.15 ms a frame every 2 s + 240 frames, or 1 s
  after textures came in: never a whole-scene sweep inside a frame of play).
  Both looks: mipmapped textures left at anisotropy 1 → the card's max (not yet on the GPU; `Texture.DEFAULT_ANISOTROPY`
  when the game left it at 1, so later textures too). Best also: a picture in a colour slot left with no colour space
  (`''`, 8-bit, not data / compressed; output 'srgb') → 'srgb'; a light's shadow left at 512² → the screen's size (long
  edge, nearest power of two, 1024–2048; point lights half, at most 1024: round 54 fix; or, round 56, the size remembered
  for this game when the refresh and that screen size match: `--hearth-game` carries `shadow: { size, to, hz }`).
  (round 56, shadowready) **The size is chosen under Getting ready's card, never by making maps while playing**: the
  budget's A/B draws the scene at each size down the ladder (`__gameLook.budget.shadow`: `plan()` → `{ ladder, start, to,
  hz, remembered }`, `set(size)`, `commit(size, { by, why, rows })` → the fallback size (half, 0 under 512), `seal()` →
  fallback ready); each light keeps its maps per size, so a size made before is a pointer swap (no texture made). The
  guard, from 0.5 s after GameReady's counted first 5 s: a 30-frame look every 2 s; frames over 1.25 × the refresh in
  every look for 10 s (≥ 3 looks) → the fallback made under the card swapped in, kept if it saves ≥ 8 % ('lowered'),
  else swapped back ('not-shadows'); no fallback made → 'held' (`guardWhy`: 'not-chosen' | 'smallest' | 'not-made').
  Never: tone mapping, output colour space, shadow type / radius, pixel ratio, any
  value the game set (a later write by the game wins). GameReady's prep and the Lab's ready-scan also keep a game's own
  anisotropy now (only 1 → max).
- `window.__gameLook = { report() → { look, three, renderers, frames, aniso: { max, sharp, set, kept, later }, colour,
  shadows: { lights, set, kept, from, to, now, chosen: { size, by: 'ready' | 'remembered', why, rows, hz, to } | null,
  fallback, ready, made: [sizes made], midPlay (maps made while playing: 0), lowered }, guard: 'waiting' | 'none' |
  'measuring' | 'fits' | 'tight' | 'trying' | 'lowered' | 'not-shadows' | 'held' | 'off', guardWhy, guardMs: { budget, steps: [[size, ms]] },
  cost: { sweeps, ms, max, playMax }, screen: { w, h, wide, hdr } },
  text() → "Best look: textures 16× sharp (4) · true colour on 1 picture · Shadows: 2048 (chosen while getting ready)",
  settle() → Promise<report>, renderers() }`. The F chip's second line and the performance doctor show `text()`.
  `/game look shadows [reset]`: the size now / remembered; forget it (chosen again next ▶ Play).


## Quality: auto (round 72, labfps72: gamequality-preload.js)
- A third preload of the game session (Lab scenes and HTML builds). `--hearth-game` carries `quality: 'auto' | 'full'`
  (Hearth's ▶ Play right-click › Quality, the F chip's Quality button, `/game quality auto|full`; hub store
  `gamemode.quality`). The scale lives in `window.devicePixelRatio` as the game reads it (real ratio × scale: 1, 0.85,
  0.75, 0.67); on a step every renderer three.js announced (`__THREE_DEVTOOLS__` observe, `__gameLook.renderers()`,
  `__rdyLive()`) gets `setPixelRatio(devicePixelRatio)` once, then one `resize` event. EffectComposer targets keep
  their own size (a composer game gains less).
- No per-frame work: a 24-frame look every second while the phase is 'playing' (2 s after it starts), never hidden.
  `qualityCore()` (pure, dev/labfps72-test.js): two looks over 1.2 × the refresh → a step down; no gain yet → the next
  step down (vsync); no gain at the floor → back to the start, held 30 s, 60 s, then for this play; 3 looks with room →
  a climb after `upWait` (8 s, ×2 after a climb that misses, ≤ 64 s).
- `window.__gameQuality = { state() → { level, scale, mode, downs, ups, undone, held, upWait, why, hz, budget, renderers,
  ratio, real, spentMs, looks, log: [[t, scale, why, medMs, renderers]] }, line() → "Quality auto · 85 %", set(mode),
  renderers() }`. The F chip shows `line()` and a Quality: auto / full button.

## Loads during play (round 54, gamestream: tools/gamestream-page.js)
- gamemodemain serves `/__gamestream-page.js` and puts `<script src="/__gamestream-page.js?off=0|1">` right after
  GameReady's tag in every HTML page of the window (Lab scene pages and HTML builds; always, armed or not). `game:play`
  takes `stream: { off }` (a check's "before": localStorage `gamestream.test = { off: true }` on the hub; not a setting).
- Active once `__gameReady.phase === 'playing'` (or 1.5 s after the first frame without GameReady; checked at each
  frame, not only when the game loads a file). Then:
  `img.src = …` (same origin, or CORS) is fetched + decoded to an ImageBitmap (`flipY`, no premultiply, no color
  conversion) before the real load (a blob: address; `src` / `complete` / `decode()` answer as the game set them);
  `texImage2D` / `texSubImage2D` with that `<img>` take the bitmap when the unpack state matches (flip on, premultiply
  off, conversion NONE: three r152+), else the element as before.
- `Object3D.prototype.add` / `attach` (the game's own three.js, found from the first scene drawn) note what's added; in
  the next `renderer.render` of that scene, an object whose materials have no program and are of a kind not compiled
  before on that renderer (round 54 fix: type, maps, shader, defines, geometry attributes…: a projectile with a cloned
  material is a kind seen before), or brings a picture never sent to the card (a canvas / data / video texture the game
  updates is never touched), gets `renderer.compile(obj, camera, scene)` (the whole scene when it brings lights; at most
  4 a frame, 0.5 ms of looking a frame) and is held only if that made a new program (or for those pictures): a fence,
  and it is drawn hidden (visible only during that
  render) until the fence is signaled, its programs' first use is done (getUniforms), its textures are uploaded one per
  frame (≥ 2M pixels: in strips, `UNPACK_SKIP_ROWS`, mipmaps after the last) and 2 frames passed; at most
  max(1.5 s, 45 frames) (× 2.5 while strips go in), then shown whatever is left (a strip job finishes first).
- `window.__gameStream`: `near(a, b, { w, h, shader })` → the name of the load most likely behind a slow frame,
  `renderers()` → `[{ renderer, scene, camera }]` (the probe's discover), `report(t0)` → `{ on, parallel, images,
  slices, holds, uploads, loads: [{ kind: model | picture | sound | file | object, name, t, done, mb, w, h, smooth }] }`,
  `pub()`. The gameperf probe puts `load` on its slow frames, `stream` in its report; GamePerfCore names it in the
  shader / texture findings ("— from “crate.glb”") and adds `load-late` for the other causes; the chip's last stutter
  shows it ("last: texture 84 ms · big.jpg").

## Hearth's budget in the game window (round 55, playbudget: tools/playbudget-page.js, playbudgetmain.js)
- gamemodemain serves `/__playbudget-page.js?hz=…&t=…&off=…` and puts its tag FIRST in every HTML page of the window
  (before the sound, getting-ready and loads-during-play tags). Hearth's helpers in the page may take at most 2 % of a
  frame at the screen's refresh (never under 0.1 ms) on the main thread.
- Each helper keeps a running total of its hooks' main-thread time and exposes `budget = { spent() → ms, pause(on),
  off(by) }`: `__gameLook.budget` (+ `picture(on)`: its shadow maps raised / at the game's own size), `__gameStream.budget`,
  `__gameAudio.budget`, `__gameReady.budget`, `__gamePerf.budget`. Work only moved earlier (a compile / upload the game's
  first draw would do) isn't counted. `pause(true)`: stepped aside (the A/B); `off(by)`: hooks back / passing straight
  through for the rest of the session. getting ready's hooks retire by themselves 5 s into play.
- `window.__hearthBudget = { pub() → JSON { hz, budgetMs, playing, totalMs, avgMs, line, helpers: { id: { name, ms, avg,
  max, on, off? } }, off: [{ id, name, by: 'watch' | 'ab' | 'remembered' | 'asked', ms, at }], note, ab, isolated },
  line() → 'Hearth: 0.03 ms', note() → "Hearth's helpers were slowing Clink a little; turned off: loads during play",
  chip(ms) → { line, note } (the F chip tells its own time), isOff(id), off(id, by), ab(opts) → Promise<result> }`.
- The watch: over the budget 3 windows of ~1 s in a row while playing → the most expensive helper still on goes
  (look, stream, perf, ready, audio; never the chip or the watch). The A/B: `gameready-page.js` calls `ab()` before the
  card goes (both kinds): blocks of N frames, helpers on / stepped aside, each frame synced (readPixels), the graphics
  card's time with EXT_disjoint_timer_query_webgl2 where present; slower → the most expensive off, again until on ≈ off.
  `ab.shadow` (round 56): `{ size, why, by, start, to, fallback, fallbackReady, rows: [[size, ms]], refreshMs }`, the
  Best look's shadow size chosen there (`Rules.shadowPick`: the biggest that fits 90 % of the refresh, else down while a
  step saves ≥ 8 %); `ab.picture`: that size vs the game's 512 where both were drawn. `pub().shadow` = `{ size, by, to,
  hz, why }` (a `hearth-budget` event after the choice: kept per game in budget.json as `shadow`).
- A switch-off fires `hearth-budget` on window; game-preload.js sends `pub()` as `game:budget` (game window → main);
  playbudgetmain keeps it per game (data/game-cache/budget.json). The next `game:play` of that game: look 'off', no
  loads-during-play tag, sound part off, `off=` on the budget page (getting ready: as np=1; the probe: dormant).
- Hub: `window.hub.game.budget({ op: 'get' | 'reset' | 'shadow-reset', source? })` → `{ known, off, by, ms, at, now, shadow? }`; `info.budget`.
  F chip: "… · Hearth: 0.03 ms" + `.note`; GamePerf's doctor: `.gp-budget` (each helper's cost, the note, "Turn them back
  on"); `/game helpers [on]`.

## Ready sooner (round 56, readyspeed: tools/readyspeed-core.js, readyspeedmain.js)
- One clock from ▶ Play to the first frame of play (epoch ms): `GameMode.play` passes `{ clickAt }` to
  `GameReady.prepare(source, onProgress, opts)`; `gameready:arm` takes `clickAt`; `info.timing = { asked, built, cached,
  window, loaded }` (gamemodemain); the page's `__gameReady.pub()` adds `origin` (performance.timeOrigin), `marks` (page
  ms: card, drawn, counted, scanned, prepped, warmed, inventory, sounds, ab, answered | settled, textures, effects, warmed,
  ab, answered; play, frame1), `hints`, `speedLine`; a Lab page's `result.load = { asked, fetched, run, refsAt, decode: { n,
  from, to }, ktx: { n, from, to } }` (the host script's `__hearthGame.load`, the player's `ready-count` → `times`).
- `GameReady.state().speed = ReadySpeedCore.timeline(…)` → `{ total, toWindow, toCard, toFirstFrame, toReady, steps: [{ id,
  label, ms }], side }`; `GameReady.speedText()` (`/game ready`).
- What a run teaches the next (data/game-cache/readyspeed.json, per game: the budget's key): `gameready:speed { op: 'note'
  | 'get', source, run }`. The page's query (gamereadymain `pageTag(ctx)`, ctx = `{ root, file, source, hz, look, off }`
  from gamemodemain's handler): `c` (the press), `was` + `sw` ("Ready in x s (was y s)" once), `rn` (renderers to wait
  for), `ld` (an HTML build's loads), `abs` (the budget's A/B verdict reused: same game files, Hearth's helper scripts,
  refresh, look, helpers off; never for a game where a helper was ever switched off), `wq` (one short quiet warm-up pass).
- `__gameReady.first5.budgetOff`: helpers the budget switched off during that run (not remembered ones).
- (round 57, readywalk) `sq=size:ms:refreshMs` (the hint `shadow`): the Best look's shadow size the last walk chose under the
  same key (game files, helpers, refresh, look; the screen size: the look's own `to`) and that size's time a frame then
  (readyspeed.json entry `sh: { key, size, ms, ref, at }`; a run that only confirmed it keeps the walk's time). The page
  passes it as `__hearthBudget.ab({ shadow })`: the A/B's first 3 frames (drawn at the remembered size) are the check;
  `Rules.shadowHolds(ms, rem, hz)` (fits now; fitted then → within 1.25 × 90 % of the refresh; else ≤ max(1.5 × then,
  then + 2 ms)); one more block of K frames only when they read clearly slower; the walk only when that fails too.
  `ab.shadow.quick = { ms, was, blocks, held }`, `ab.shadow.walked`; the chosen + fallback maps are made and sealed as before.
- `__gameLook.report().cost.card` / `.play` / `.playWholes`: the longest single look under Getting ready's card (the first,
  whole-scene one) / while playing, and whole-scene looks while playing (0).
- (round 58, ctxloss58) The A/B holds a Lab scene page's own frames while it draws (`globalThis.__gmHold(on)` in
  tools/three-sandbox.html: the one-canvas loop's flush waits, released at the end, at most 2 min; layers with their own canvas too; an HTML build's frames
  are already held by getting ready). Frames that aren't counted (the first, each block's first, a size's first, the
  fallback's, the way back) are waited for with a WebGL2 fence polled between tasks (cap 45 s), never readPixels; counted
  frames stay readPixels. A block's counted frames stop after 5 s (≥ 2 frames). A frame drawn on a lost context is NaN
  (never a "fit"); lost during the first frames → `ab = { skipped, lost: true }`. `ab` also carries `syncs`,
  `maxFrameMs`, `long: [[phase, ms]]` (frames over 1 s), `drains`, `drainMs`. `__glRecover.state()` adds `made` (WebGL
  contexts made on the page) and `none`; main `glrecover:state` adds `gone: [{ reason, exitCode, at }]` (GPU process exits).
- (round 59, readylab59) A Lab scene's `ready-prep` draws the first of its 2 frames with what the game hides for now shown
  (`RDY.reveal` in tools/three-sandbox.html: every object with `visible === false` that isn't a light, a camera or a
  group holding a light, at most 500, put back right after that one draw, never on a render target or a Hearth helper),
  so its shadow-depth programs and a transmission target are made under the card, not in the first warm-up pass.
  `ready-prepped.revealed` / `result.prep.revealed` = how many were shown; each `result.warm[i]` adds `ms` and `work`.
- (round 59, shadowlab59) While `__gmHold` holds a Lab scene page's frames, the Lab's shadow gate (tools/three-sandbox.html
  `shGate`, round 50) steps aside: every A/B draw runs three's shadow pass (before, back-to-back draws in one frame tick
  reused the tick's "no change", so sizes were timed without shadows and the fallback's maps were never made). The look's
  `swap()` (gamelook-preload.js) sets `renderer.shadowMap.needsUpdate = true` on its renderers (shadows enabled) whenever a
  size goes in, so no page that skips shadow passes draws with a missing map (three r186 then binds its RGBA stand-in to a
  `sampler2DShadow`: GL_INVALID_OPERATION, the draw dropped) or a stale one. `ab.glErrors = { before, during, codes }`:
  WebGL's error flags read at the A/B's start and end (under the card only); `result.ab.glErrors` in getting ready's result.

## Playtest notes (round 62, playnotes62: playnotes.js + playnotes-core.js in the "gamemode" group, playnotesmain.js)
- **The key is read main-side** (gamemodemain's `before-input-event` asks `playnotesmain.key(e, input)` first, before
  gameinput's Esc / F / Enter and playloop's Ctrl/⌘+P): F8 by default (hub store `playnotes.key`, `/playtest key F9`;
  `game:play` takes `notes: { key, label }`; the window's `--hearth-game` JSON carries `notesKey`, the hint shows it).
  F8 → a note; Shift+F8 → a note + the words box. The game never gets the key. Nothing of this is in the page before
  the key is pressed (no script, listener or frame callback); the box's three window capture listeners exist only while
  it's open (they stop its keys before the game's listeners; while it's open every key is the box's except Esc, which
  closes it, and Ctrl/⌘+P / Q / W, which close it and go on).
- **A note** = `capturePage()` (once; ≤ 1280 px wide, JPEG) + one `executeJavaScript` read (`playnotesmain.READ`):
  a Lab page's `window.__labHot.save()`, an HTML build's `window.hearthState()` / `game` / `__game` / `gameState`
  (plain data: depth 6, ≤ 6000 values; three's vectors as arrays, an Object3D as its position + quaternion), the
  cameras of `window.__scenes` (or `window.camera`) `{ p, q, z }`, the player's position (the state's player / position
  / x,y,z, else the camera), the frame rate: `__gamePerf.recent(60)` (the probe, when attached) else
  `__hearthBudget.pace()` (the budget watch's last second; both counted anyway).
- Stored per game in `data/game-cache/<lab-<scene id> | html-<name>-<hash>>/notes/`: `log.json` `{ v, game: { key, title,
  kind }, notes: [{ id, at, session (the window's start), secs, kind, text, shot, w, h, state, cams, pos, perf, hz, readMs }] }`
  (≤ 200 notes, a state over 64 KB kept as `stateBig`; datasafe read, atomic write, an unreadable log never written
  over) + `<id>.jpg`. Remove / clear go to the Trash. diskcalm's "Optimized 3D models" free-up leaves them.
- Hub: `window.hub.game.notes({ op: 'list' | 'get' | 'shot' (width | path) | 'text' (append, echo) | 'remove' | 'clear' |
  'state' | 'key' | 'take' | 'box' (status), source?, id? })`; events `window.hub.game.onNotes(fn)`: `{ type: 'added',
  source, session, n, note, saved }` / `{ type: 'voice', source, id }` (the box's 🎤: `Voice.start({ into })`) / `{ type:
  'text', source, id, text }`. Game window: `game:note { text }`, `game:note-box { open, id, status, text }` in;
  `game:note-text { id, text, close }`, `game:note-voice { id }`, `game:note-box-off` out.
- `PlayNotes.open({ source, session })` (the Playtest log), `.jump(source, id)` (a Lab scene: opened in the Lab, the
  layers' `restoreState()` through `__labHot.restore`, their cameras; an HTML build: in its ▶ Play window, through
  `window.hearthRestore(state)` if the game defines it, and its camera), `.fix(source, id)` (the director's draft +
  the picture attached, never sent), `.command(text)` (`/playtest notes | note <n> | fix <n> | clear | key`).
- A game can help: an HTML build that defines `window.hearthState()` (plain data) and `window.hearthRestore(state)` gets
  notes you can jump back to; a Lab layer's `saveState()` / `restoreState()` already do it.

## Hitch map (round 63, hitchmap63: hitchmap.js + hitchmap-core.js in the "gamemode" group, hitchmapmain.js, tools/hitchmap-page.js)
- **Off by default; off = nothing in the game window.** Hub store `hitchmap.on` (`/playtest hitchmap on | off`, ▶ Play's
  right-click "Record the hitch map", Ctrl/⌘+K). `game:play` takes `hitch: { on }`; only then gamemodemain serves
  `/__hitchmap-page.js?hz=…` and puts its tag right after the budget's, the window's `--hearth-game` JSON carries `hitch: true`
  (the hint says "● recording the hitch map"; game-preload.js listens to the page's `hearth-hitch` event only then).
- **The recorder** (`window.__hearthHitch`): one frame callback (the real `requestAnimationFrame`, captured at load); per
  frame `[t (ms since the recording started), dt, player x y z, camera x y z]` into one `Float32Array` ring (2^17 frames,
  made once, the oldest overwritten), records only while `__gameReady.phase === 'playing'` and the page is visible. The
  player: `window.game | __game | gameState | GAME` (`.player` Object3D / `.player.position` / `.position` / `.pos` / x y z),
  `window.player`, an object named "player" in the scene (≤ 5 looks), else the camera; the camera: `__scenes[k].camera`,
  `window.camera`, `__gameStream.renderers()[0].camera` — looked up once a second, positions read from `matrixWorld`. A spike
  (≥ 4× the usual frame, ≥ 3 refreshes, ≥ 20 ms; ≤ 4 pictures a session, 2 s apart, after the first two only a new worst,
  none in the first 1.5 s) → `hearth-hitch` event → `game:hitch-spike` → main: `playnotesmain.grab(wc)` (capturePage + READ).
  `budget = { spent, pause, off }` (playbudget helper id `'hitch'`: first in ORDER, never remembered per game), `line()` →
  "● Hitch map 2:31" (the F chip shows it first), `pub()`, `spike()`, `dump()` → `{ v, cols: 8, n, total, hz, t0, cost, off,
  camKey, posFrom, shots: [[t, dt]], data: base64 }`, `stop(by)`. Turned on mid-play: the script goes in through
  `executeJavaScript` (`window.__hearthHitchOpts = { hz }` first) and `game:hitch-on` tells the preload.
- **After the session** (the window's close waits once ≤ 1.2 s; Ctrl/⌘+P: the hub asks `collect` on `rested`; `/playtest
  hitchmap off`): `dump()` + GamePerf's `__gamePerf.slows()` (its kept slow frames with `at`, when the probe is attached) →
  `HitchMapCore.build` → `data/game-cache/<game>/hitch/h<session>.json` (+ `h<session>-<k>.jpg`; 20 maps a game, the oldest
  to the Trash) `{ v, game, session, secs, frames, hz, refresh, typical, hitch, hitches, moved, posFrom, camKey, cost,
  stopped, grid: { w, h, axes, bounds, n, mean, max, hitches }, timeline: { k, ms, mean, max }, radius, spots: [{ i, x, y, z,
  cam, u, v, worst, t, n, lost, typical, causes?, fn?, load?, shot?, times }], shots: [{ id, t, dt, file, pos, cams, state }] }`.
  Event to the hub `game:hitch-ev { type: 'built', source, why, id, hitches, top, line, cost }`.
- Hub: `window.hub.game.hitch({ op: 'state' | 'on' | 'off' | 'collect' | 'list' | 'get' (id) | 'shot' (file, width | path) |
  'clear', source? })`; `HitchMap.open({ source, id })` (the map), `.jump(source, map, i)` (`HitchMapCore.jumpOf`: the spot's
  picture's state + cameras through `PlayNotes.restore`, else its camera with `look` at the player), `.fix(source, map, i)`
  (`PlayNotes.toDirector`: drafted with the picture, never sent), `.command(text)` (`/playtest hitchmap [on | off | show |
  jump <n> | fix <n> | clear | status]`).
