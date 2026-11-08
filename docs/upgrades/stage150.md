# Round 150 · stage150: the scene view as a clean, mono, futuristic stage

The owner: "make the look more mono/futuristic for the scene view, be original and make it reactive to its
surroundings while keeping the buttons either tucked away, hide-on-idle or less noisy around the scene… context-dependant
(mouse at the top right, a command, etc). It's okay if it affects the performance a bit as long as it looks fresh."

## 1. Quiet chrome (every Lab look)

| Overlay | Idle (2 s without the pointer moving over the picture) | Comes back |
| --- | --- | --- |
| `.stage-pill` (Freeze · Fit · 9:16 · 16:9 · 4:5 · 1:1 · More… · 📷 · ⋯) | transparent, `pointer-events: none` | pointer in the **top-right corner** (or on the strip), keyboard focus inside it (`:focus-visible`), pinned |
| `.three-stats` (fps, frame bar, Quality chip, worst ms, draw calls…), `.lab-adapt-note`, `.lab-pace-note`, `.lab-perf-hud` | same | pointer along the **bottom edge** (or on the line), focus, pinned |
| `.safe-zones` | transparent | any pointer movement over the picture |
| the 01 PREVIEW header's readouts (`.ih-meta`) | transparent | **hovering the header**, pinned |
| `.lab-speedchip` (Slow…), `.lab-safe` (Safe open) | shown by themselves for 6 s when they appear, then tucked into a 20 px glyph (`!`, 🛟) | any pointer movement, pinned |
| `.three-stall`, `.lab-health-pill`, menus, cards | never hidden | |

- **Pin**: `I` (Lab key; in Present `I` is still the info line), `/stage show | clean`, the command bar's plain words
  "show scene controls" / "clean stage" (`three-say-core.js`), Ctrl/⌘+K "Lab: Show scene controls (I)" / "Lab: Clean
  stage". `ThreeLab.cmd().state.stage` says `pinned` / `auto`.
- Nothing moved or was removed: same elements, classes, ids, listeners. The window gets no pointer events over the
  preview's page (another process), so the page posts the pointer's position (0..1, ≤ 8 a second, only while it moves;
  `stage-ptr`) and the window works out the corner. A pointer on a control itself counts as its corner (Chrome can keep
  `:hover` on a window element after the pointer went into the picture, so `:hover` is not used to keep things shown).

## 2. The stage frame (Forgeheart / Plate; not in Plain)

`.st-hud`, sized to the picture's own box (letterboxed sizes included), in the window's DOM with `pointer-events: none`:
four corner brackets with a registration notch, calibration rulers (8 px minor / 64 px major ticks, fading to the
corners), a hairline of the song's position along the bottom edge, an edge glow, and while awake: mono micro-labels
(state · frame size, beat pips · BPM, timecode, fps · quality), a centre reticle and two ghost hints (VIEW ◳, STATS ▁)
where the controls live. The strip and the stats line restyle as ghost instruments (transparent, outline on hover, mono
caps, one hue). Ember only for warnings and a held (frozen) picture. Nothing is drawn into the scene: stills, renders
and exports are unchanged (look148's "nothing on the picture" check still passes: its own classes, no pseudo-elements on
`.three-preview`).

## 3. Reactive

- **Colour**: the preview page (`three-sandbox.html`, "stage150") merges its layers at 32 × 18 on the graphics card right
  after a frame (`composite`, no redraw), takes it as an ImageBitmap and a small worker reads the 2,304 bytes; the
  chroma-weighted hue, saturation, brightness, edge colour go to the window when they change (or every 2 s), ≤ 4 a
  second. A first try read it on the main thread (getImageData / toBlob): **50–110 ms each** on software GL (the read
  waits for the busy graphics card), so it moved off the main thread. The window eases `--st-h` / `--st-k` (a rAF loop
  only while converging; τ 0.55 s reactive, 1.4 s calm) toward the scene's hue, back to the look's blue on a grey scene.
- **Song**: `three-media.js`'s `beatTick` (each worked timeline tick while it plays, ≤ 60 / s since play149) hands
  `LabHudStage.feed(t, …)` the analysis' kick / snare / hat onsets, your K / S / H markers and the level curve it already
  holds (no new analysis). Kicks pop the brackets outward (Web Animation on transform / opacity), snares flash the rulers,
  hats a dot, the edge glow follows the level (`opacity`, ≤ 30 writes / s), beat pips follow the grid.
- **Lab ⋯ › View & help › Stage: reactive → calm → off** (one cycling row under Lab look; store `three.stageFx`).
  calm = the colour only; off = still blue, no reading. Also `/stage reactive|calm|off`.
- Reduced motion / Motion calm or off: no pulse, no flash layers, no transitions, no colour reading while it plays (the
  colour still follows while stopped, applied without easing). Plain: hide-on-idle only.

## Cost (dev/checks/stage150.js, software GL, 4 CPUs, song playing, Stage off / reactive / off / reactive, 5 s each)

| | reactive |
| --- | --- |
| colour readings | 4.0 / s |
| preview page main thread for them | **≈ 2.4 ms / s** (≈ 0.6 ms a reading: the 32 × 18 merge + handing the bitmap over) |
| window: feed + tint + labels (own counters) | **≈ 1.0 ms / s** |
| per frame at 60 fps | page ≈ 0.04 ms, window ≈ 0.02 ms (budget 1 ms) |
| CDP TaskDuration, page on / off | 20.1 / 21.7 ms / s (noise) |
| CDP TaskDuration, window on / off | 55 / 35 ms / s (load-noisy; includes compositor-driven pulse animations' style ticks) |

## Files

- new `tools/three-hudstage.js` (`LabHudStage`), `tools/three-hudstage.css` (lazy group `lab`; `lazy-data.js`,
  `node dev/lazy-manifest.js`)
- `tools/three-sandbox.html`: the pointer and colour reader (only the Lab's own preview: never the export page, ▶ Play,
  a Stage window)
- `tools/three.js`: apply, messages, ready, the stats hand-off, `I`, actions + Ctrl+K rows, the View & help row, `state.stage`
- `tools/three-media.js`: the feed in `beatTick`
- `tools/three-say-core.js`, `tools/three-say.js`: "show scene controls" / "clean stage"
- `keys-lines.js`: the `I` line; `dev/checks/stage150.js`, `dev/run-checks.js` group `stage150`

Checks touched: none needed changes (controls are clickable the moment their corner is pointed at; checks that use
`.click()` / `checkVisibility()` are unaffected by opacity).
