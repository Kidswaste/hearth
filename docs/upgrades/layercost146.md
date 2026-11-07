# ⚡ Which layer costs the frames? (round 146, layercost146)

The owner: "my scenes are very costly in framerate lately, the last one (vizualizer2) is even crashing". This round
shows **which layer** costs the frames, on its row, and gives each heavy layer one-click ways to lighten it.

## What existed (reused, not duplicated)

- **⚡ Speed check** (speed133): the card measures 3 s and already gets each layer's **GPU time a frame** by leaving
  the heaviest 3 layers out in turn (`SPD.skip`), plus framebar's counters (draw calls, triangles, textures, shadow
  lights, pixel ratio, passes). It named the top 3 causes, with one-click fixes and its own undo stack.
- **The slow chip** "Slow: N fps · Why? · ✕" (speed133), **Smooth / Force high** (smooth142), the frame budget bar's
  per-layer CPU numbers (framebar64), `LabPlay.count` (smooth142), `LabDirect.push` (the Lab's Ctrl/⌘+Z).
- Missing: the cost **per layer in the Layers panel**, every layer probed (only 3 were), a heaviest-first list, and
  per-layer lighten actions (the fixes were scene-wide: 1× pixels, antialias, shadows on n lights, all filters half).
- No AI tool reads the speed check's results (`three_do perf` is ▶ Play's game), so nothing new reaches the directors
  (0 prompt tokens).
- No GPU timer query (EXT_disjoint_timer_query_webgl2): the "leave it out for a moment" probe already gives each layer's
  GPU time on every GPU, timer queries are often unavailable (and under ANGLE disabled), and they would need per-renderer
  plumbing in each layer's own context.

## What's new

- **Cost view** (`tools/three-layercost.js`, `LabCost`, in the lazy group **speedcheck**): on, a badge (a bar and
  "12 ms", ember when ≥ 35 % of the frame, gold ≥ 12 %) sits on each Layers & knobs row. Switched by the slow chip's new
  **▦** and the card's **▦ Cost on layers**. Turning it on measures once, with **up to 8 layers** left out in turn (the
  page's cap was 4, the card's default stays 3). The badges are static until the next measure: `tools/three-layers.js`
  asks `LabCost.badge(id)` / `sig(id)` when it builds a row (round 142's row cache), so nothing runs per frame and
  nothing measures while it plays. A scene switch turns the view off.
- **The card's "Each layer's cost"** list, heaviest first (top 6), its share of the frame; a layer at ≥ 15 % (or the
  heaviest) gets its actions (`SpeedCore.lighten`):
  - **Fewer**: its count slider halved (a scene change, as the existing "Cut to 100k");
  - **½ res**: that layer at half resolution in the preview;
  - **No shadows**: that layer's shadow lights off in the preview;
  - **Hide**: its eye (`director.updateLayer(id, { visible:false })`).
- ½ res and No shadows are the scene's preview settings, `sketch.speed.lay = { layerId: { half, sh0 } }`, saved with the
  scene by `ThreeLab.speed.set` (the normal Lab save path) and sent only to the preview page. In the page:
  - `prQ` halves the layer's share;
  - `spdShadows` keeps 0 lights for it.

  Export pages and ▶ Play never get the message, stills / recordings use `fullRes()`, and Force high quality sends
  `lay: null`.
- **One undo step each**: the card's ↶ on the row, the toast's Undo, and the Lab's Ctrl/⌘+Z (`LabDirect.push`; a step
  already undone from the card is a no-op). Undoing ½ res / No shadows puts back only the keys that action set. After each
  action and undo, the card measures again (that layer probed afresh) and the row shows "✓ Fewer · 40 → 12 ms".
- `ThreeLab.speed.layers()` re-renders the Layers list. The page's `__labSpeed.state().measures` counts measures (checks).

## Check

`dev/checks/layercost146.js` (group `layercost146`), with a fixture of Sky (flat colour) and Spinner (one cube), both
light, and **Particles**: 300k triangles with a Count slider, 2× pixels and a shadow light. Steps:
- off: no badges;
- the chip's ▦ turns the view on;
- Particles ranks first by its GPU time, and the card lists Fewer · ½ res · No shadows · Hide;
- a badge on each row, Particles heavy (screenshot `/tmp/hearth-checks/layercost146.png`);
- **Fewer**: Count 300000 → 150000, triangles halved, cost down (load-aware);
- **one** LabDirect undo puts back 300000;
- ½ res shows on the page, and the card's ↶ restores the settings exactly;
- 4 s of play with the view on: 0 measures, 0 badge builds, 0 Layers rebuilds;
- view off: no badges.

## Results

All with `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package` on software GL, so compare the numbers with each
other, not with an RTX 4080.

- **layercost146** ✓ (12 steps, 194 s). The fixture ran at about 1.7 fps:
  - Particles ranked first at ≈ 307 to 588 ms of a ≈ 525 to 625 ms frame;
  - **Fewer** took it from 588 → 227 ms (600k → 300k triangles, 1.7 → 3.2 fps);
  - 4 s of play with the view on: 0 measures, 0 badge builds, 0 Layers rebuilds.
- **speed133** ✓, **smooth142** ✓, **unit:lazymanifest-test** ✓ and **unit:boot-test** ✓, in the same batch.
- **panel142**: in the batch it missed its "a click selects a layer in under 16 ms" timing by a hair (p50 16.9 ms at load
  5.1). Alone it missed again at 16.1 ms (load 2.6). The code before this round, run alone, gave 14.8 ms, and this
  round's code, run alone again, gave 13.4 ms ✓ (the whole check passed). So it is box noise: the only change on that
  path is one `typeof` per row in the row signature.
- The first screen stays under the 1547 KB budget: the chip's ▦ and the Layers row hook add a few hundred bytes, and the
  card and the cost view are lazy.

## Risks / not done

- A layer's cost is "the frame with it, minus without it", so on a vsync-capped screen a light scene can't show gains
  past the cap. Layers beyond the 8 probed show "~" (their CPU-side draw time).
- ½ res on a layer whose code calls `setPixelRatio` every frame still works (the share applies on top), but a layer
  that renders through its own EffectComposer keeps its passes' sizes.
- No bake / freeze per layer (no such feature exists yet).

## For Codex

Nothing. No Codex-owned file touched.
