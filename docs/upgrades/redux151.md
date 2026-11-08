# Round 152 (redux151): "Hearth Redux" — the Lab in Forgeheart gold / ember on graphite, contextual controls

The owner: "get the colors closer to forgeheart's gold/orange/dark grey theme, and make the whole interface more
mono/futuristic and cleaner with a lot less appearing buttons at a glance. Add animations for things appearing and
disappearing, and make them pretty and use colors. think of it as a redux version and only contextually showing details,
but mostly, make sure performance is good again."

## Before → after

| | Round 148 / 150 | Round 151 (Hearth Redux) |
| --- | --- | --- |
| Base | navy-black panels (`#060a15`), a blue dot grid in the room, scanlines + a dot grid + two radial glows + corner ticks on every panel | graphite: room `#0b0b0c`, panels `#111113`, one 1 px hairline (`#ffffff10`); no textures, no shadows |
| Accent | electric blue (`--fh-hud: #3d7bff`), ember for the playhead / selection | **Forgeheart gold** `#f4b63f` (primary: ▶ Run, ▶ on the timeline, ＋ Layer, the 01 · 02 · 03 numbers, sliders, lit toggles, the stage's corners), **ember** `#ff7a1a` (hot: playhead, selected layer, open fold, warnings, the live dot while playing) |
| Text | `#d5e2ff` blue-white, glows | warm off-white `#ebe5d9`, labels `#b4ad9f`, mute `#8c867b`; mono micro-labels; no text glows |
| Buttons | boxed groups (gradient plates, bevels, clip-path cuts) | no group boxes; ghost buttons are mono text with a hairline on hover; primary = flat gold, dark ink; an `on` toggle = gold text + a 1 px gold underline |
| Loops | header live dot (2.4 s), header sweep (7 s), two panel glints (9 s), the playhead's breathing halo (2.8 s) | **none** |
| Stage (round 150) | blue frame: brackets with drop-shadow filters, rulers, reticle, song hairline, an inset-shadow edge glow and two full-picture flash layers (composited even with the reactive stage off) | four flat gold corner marks; labels / hints while awake; glow + flash layers only exist (display) when the stage is set to reactive; rulers, reticle, hairline gone |
| Looks | Forgeheart → Plate → Plain | **Forgeheart → Plain** (Plate dropped: a light lavender theme doesn't fit gold / ember on graphite; a stored `plate` opens as Forgeheart). Plain = flat, every control in sight, no motion |

Tokens: `--rx-*` on `html:not([data-lablook="plain"])` (`tools/three-regroup.css`); round 148's `--fh-hud-*` names are
kept and now carry the gold / graphite values (the stage and the stats line read them). The stage's base hue is gold
(`LabHudStage` BASE 40, was 222). The app shell (rail, top tabs) is not restyled: its look is the app's own skin, shared
with the chat views, so it was left alone.

## What is in sight at rest (pointer away, Forgeheart)

- Lab bar: **scene picker · ▶ Run · ▶ Play** (left) and **⋯** (right). The Sketch / View groups are `display: contents`
  with a static `order`, so these four line up first; nothing moves when the rest comes in.
- Timeline: **▶ and the time**, the 02 TIMELINE label, the canvas.
- Layers & knobs: the 03 title and count, ★ Favourites / 🎛 Dials, the rows (name, swatch, tags, ▸), the **selected
  row's 👁** (and any ◌ hidden / partly hidden eye), the open layer's knobs with Shuffle / Save and the slider search.
- Preview: the picture, four corner marks, the 01 PREVIEW label (round 150's hide-on-idle unchanged).

realscene-lib's scene at 1600×1000: **13** controls in sight in the toolbar / timeline / layers' heads at rest (the knobs'
own rows not counted); 22 secondaries tucked (check step "at rest").

## Where each hidden control comes in

Every one stays the same element in the same place (ids, classes, `data-feature`, listeners): transparent (`opacity: 0`,
`translateY(3px)`) but still hit by a click at its spot, so a quick click or a check's real click lands.

| Context | What comes in |
| --- | --- |
| pointer over / focus inside the **Lab bar** | Sketch ▾, ⚑ Finish line, ✦ Direction, ⚡ Sliders, ⚙ Inspect ▾ (always shown while lit or open), ▣ Present, the palette swatches, 🖼, 🖥, 🔎 |
| pointer over / focus inside the **timeline** (or a fold of it open: `.rg-raised`) | 🎵 + the song's name, ✦ Map, ♩ Beat ▾ + BPM readout, ⚡ Sync ▾, Sections ▾, View ▾, the rest of the transport row, ⋯, ▥ / Sequence / Render, the 02 header's tempo · meter · beats · bar · time. Empty timeline: Load audio / video stays in sight |
| pointer over / focus inside **Layers & knobs** | ＋ Layer, ⋯ (the head) |
| pointer over a **layer row** | its 👁 (with round 142's 📌 / S) |
| pointer over / focus inside an open layer's **knobs** | ★ and ⋯ next to SLIDERS |
| preview corners (round 150) | the view strip (top right), the stats line (bottom edge), the 01 header's readouts (its line) |
| **I** · `/stage show` · "show scene controls" (Ctrl/⌘+;) · Ctrl+K "Lab: Show scene controls" | everything above at once (`LabHudStage` now also sets `html.lab-pinned`); I again / "clean stage" tucks it away |
| keyboard focus (Tab) | the focused control and its area (`:focus-within`) |

Lab search (🔎 / `/`), the right-click menus and Ctrl/⌘+; reach every action as before.

## The animation system (CSS only)

- **Reveal:** `transition: opacity .18s, transform .22s` with `cubic-bezier(.2,.8,.2,1)` and a stagger of 22 ms per
  step left to right (`--rx-i`); the exit is `.12s ease-in`, no stagger. The timeline's groups only fade (they hold
  the fold trays, `position: fixed`, which a transform on an ancestor would move).
- **The area's line:** a 1 px `linear-gradient(90deg, gold, ember)` (`::after`) under the Lab bar, along the top of the
  timeline, under the layers' head, `scaleX(0 → 1)` from the left in 220 ms when the area wakes, 140 ms back.
- **Trays** (♩ Beat ▾, ⚡ Sync ▾, ⚙ Inspect ▾): in — `clip-path` from the edge they open from + a 4 px rise + fade
  (200 ms), their gold → ember top line drawn across (220 ms), rows rising one after another (30 ms apart); out — at
  once (a fade-out with `display` held by `allow-discrete` was tried: a folded tray then still counts as drawn for
  120 ms, which the folds' logic and lab143 rely on not happening).
- **A layer's knobs:** an ember → gold line drawn down their edge (260 ms). (A rise of the whole block was tried and
  dropped: a 300 × 2,700 px layer for 200 ms on every select.)
- **The BPM readout's beat flash** (`tools/three-lab.css` `mb-beat` / `mb-down`): a lift + fade on the compositor
  (it was a `brightness()` + `drop-shadow()` filter, a repaint per beat), and only while the timeline is under the
  pointer (or pinned).
- **Notices** (Slow, Safe open): wiped in from the left (`clip-path`) with an ember edge, 220 ms.
- **The Lab's pop-overs** (`.mb-menu`, `.lab-pop`): a 180 ms rise.
- Entry animations fill `backwards`, never `forwards` / `both`: an animation holding its last frame keeps a composited
  layer alive (round 150's tray and the knobs' rise did: 25 extra "overlap" layers on the slider rows). The scene cover's
  fade-out (polish.css `hx-reveal … both`) ends as a plain style in the Lab (`rx-cover-out`, `backwards`), its
  `animationend` kept.
- Nothing loops. Out of sight nothing moves: the BPM readout's beat flash only while the timeline is under the pointer
  (or pinned); the stats line's frame bar has no transition while the line is tucked away.
- Off under `prefers-reduced-motion: reduce` and `:root[data-motion=calm|off]` (controls still come in, at once).

## Cost

Measured by `dev/checks/redux151.js` (its cost step) on smooth142's heavy layers (2× pixels backdrop + 6,000 instances),
the Lab window at 1600×1000, software GL, 4 CPUs. Round 150 measured with the same probe on a copy of the round-150
build (`node dev/smoke.js --app <copy> …`, the check runs only its cost step there). Draw = Paint + Layerize /
UpdateLayer(Tree) + CompositeLayers / Commit / PrePaint, the window's renderer only (`{ trace: 'stop', window: true }`).
Both builds play the fixture once before measuring (its clock timeline comes up on the first play; a first, cold
measurement gave round 150 38 layers idle and lower paint, because the timeline wasn't drawn yet). A back-to-back
mutation probe (same procedure, both builds) showed the same DOM writes while playing (the time ≈ 5 / s, the 01
header's sparkline) and the same paint (3.0 ms / s each).

| Lab window | Round 150 (3 runs) | Round 151 |
| --- | --- | --- |
| composited layers, idle | 45 · 45 · 45 | RESULT_IDLE_LAYERS |
| composited layers, playing | 45 · 45 · 45 | RESULT_PLAY_LAYERS |
| draw ms / s, idle | 6.2 · 8.3 · 4.7 | RESULT_IDLE_DRAW |
| draw ms / s, playing | 5.5 · 8.0 · 10.8 | RESULT_PLAY_DRAW |
| window main thread (TaskDuration) ms / s, idle | 30.8 · 33.8 · 26.7 | RESULT_IDLE_TASK |
| window main thread ms / s, playing | 25.1 · 30.3 · 27.7 | RESULT_PLAY_TASK |
| running / held animations in the Lab, idle | 6 (dot, sweep, glints, breath) | 0 |

What made the layers: the loops (each animated pseudo-element a layer), `will-change` on the stage's glow, flash and
hairline, and everything that overlapped those or the preview's iframe (the stage's brackets, rulers, labels, the
panels' tick overlays, the timeline canvases…). What is left at rest: the document, the surface (its own app-wide
entry animation, held — not the Lab's), the preview and its iframe, scrollbars, and three tiny readout layers
(`.mb-time`, `.mb-minitime`, the 01 header's meta: `will-change` + `contain: paint`, so a new number repaints a few
dozen pixels and not the page layer). The panels are `isolation: isolate` (a cached paint boundary each).

## Files

- `tools/three-regroup.css` (rewritten look: palette, panels, contextual controls, the animation system),
  `tools/three-regroup.js` (two looks, Plate dropped)
- `tools/three-hudstage.css` (gold, flat corners, rulers / reticle / hairline gone, glow / flash only when reactive,
  shorter transitions, notices' wipe, scene cover), `tools/three-hudstage.js` (3 small edits: gold base hue, `html.lab-pinned`
  on I, a second measure 160 ms after a resize so the corners sit on a fitted 9:16 / 16:9 picture)
- `dev/smoke.js`: `{ layers: true[, detail: true] }` (LayerTree: count, drawing, px, per-layer element and reason) and
  `{ trace: 'stop', window: true }` (the window renderer's own paint / layerize / composite and painted nodes)
- `dev/checks/redux151.js` (new), `dev/run-checks.js` group `redux151`

Checks touched (the look changed on purpose): `lab143` part 3 (flat panels and "nothing loops" instead of scanlines /
glint / breathing playhead), `look148` parts 3–4 (nothing loops, the dot turns ember while playing; the look cycle is
Forgeheart → Plain, a stored "plate" opens as Forgeheart).
