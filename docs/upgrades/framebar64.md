# framebar64 (round 64): a frame budget bar in the Lab

The owner builds Clink (their three.js game) in the Lab and wants to see at a glance whether the scene fits one frame at
240 Hz (4.17 ms) on their own computer. If it doesn't, they want to know which layer is too heavy, why, and what to
ask the Three Director to change.

No new row and no new setting. Nothing is added to any prompt (0 tokens until the owner sends a draft). The code is
the same on Mac and Windows.

## What it is
1. **The bar**: a thin bar with a label ("3.1 / 4.2 ms") in the Lab preview's existing stats line, right after the fps.
   It shows **by default**: with the pointer away from the preview, the stats line keeps only the fps and the bar. Point
   at the preview and the whole line shows, as before. The bar is filled by the frame's measured time against the
   target refresh. The target sits at 2/3 of the bar's width, so a frame over budget shows. The bar is green when the
   frame fits, amber when it's over, and red at 1.5× the budget or more.
   - **What it measures**: the CPU work of the frame's renders (the median of the last 60 frames, already counted by
     the page). When frames come later than the screen's own frame, the gap between them counts instead (the pace
     meter's median, already counted). That gap is the GPU, or work outside the renders. The screen's own interval
     never counts (a 60 Hz screen measured against 240 isn't red for being 60 Hz). A capped preview's gaps are the
     cap's, and a still picture reads its last frame's work.
2. **The target**: Auto (the screen's own rate, measured by the page) or 240 / 144 / 60 Hz. Pick it from the card's
   "240 Hz (this screen) ▾", or right-click the bar. It's remembered.
3. **Point at the bar, or click it**: a card opens with each layer's share:
   - its own code (its frame callback minus the drawing inside it);
   - its drawing (each render() call, timed by the page's existing render wrapper, which already knows the layer);
   - draw calls, triangles, texture memory (≈ MB) and shader programs.

   Below them: "The most expensive layer is Heavy (6.8 ms)." The ✕ closes the card; a click on the bar keeps it open.
4. **Why?** (a visible button next to that sentence): looks at that layer for 3 seconds, on demand only, and lists its
   top costs:
   - its own code and its drawing (ms a frame, against the budget);
   - draw calls a frame by material ("brick" 300 · "glass" ×150 materials 150);
   - shadow casters, the shadow map sizes, and the extra draw calls the shadows cost;
   - an estimate of transparent overdraw (≈ 2.4× the screen);
   - post-processing: offscreen passes a frame and the filter layers over it, with their ms;
   - lights, triangles, and textures (≈ MB, the biggest one).
5. **What would help**: up to 5 plain suggestions, the biggest saving first. Each one is chosen from what the look
   found:
   - draw them as one InstancedMesh (the same shape and material repeated);
   - merge the static meshes (BufferGeometryUtils.mergeGeometries);
   - share one material instead of a clone() per object;
   - lower the shadow map to 1024;
   - turn off shadows on small or fast things;
   - no point-light shadows (6 passes);
   - fewer lights;
   - less transparency (alphaTest);
   - fewer or half-resolution post passes;
   - move work out of the frame loop;
   - LOD for heavy models;
   - smaller textures.
6. **Ask the Three Director** (a visible button on each suggestion): the request goes into the docked Three Director's
   message box, **never sent**. It names the layer, its ms against the budget at the target rate, the change, and
   "Keep how it looks the same." When the director's chat isn't open, the request is copied instead.
7. **Chat (secondary)**: `/framebar` (the frame and the most expensive layer), `/framebar why [layer]`,
   `/framebar target auto|240|144|60`.

## Cost (the owner's rule: no steady per-frame work)
- **The bar** reads only what the stats message already carries, twice a second. The page adds the screen's rate
  (`hz`) to that message. The bar's fill moves by `transform` and is written only when it changed.
- **Each layer's share** is counted only while the whole stats line shows (the pointer over the preview) or the card is
  open. That count is one float add per render() in the existing render wrapper, plus two clock reads per layer frame
  where the layers' frames already run (`lqFlush`). It goes into a `Float64Array` made once per layer (nothing made per
  frame), and is read twice a second with the stats.
- **Otherwise** the cost is one flag read per render and per layer frame. `framebar64` checks that the sums stay frozen
  while the pointer is away; labpace, gcchurn60 and labplay55 hold their budgets.
- **Texture memory** is walked again only when a layer's texture count changes.
- **The "why?" look** runs only on demand: 3 s of the counters above, then one walk of that layer's scenes.
- **The code loads on first use**: its lazy group `framebar` (core + UI + CSS) loads the first time the stats line
  shows. The rule that keeps only the fps and the bar on screen is in `tools/three-lab.css`.

## Files
- New: `tools/framebar-core.js` (the arithmetic: target, frame, rows, blend, sentence, costs, suggestions, drafts),
  `tools/framebar.js` (bar, card, Why?, Ask the Three Director, `/framebar`), `tools/framebar.css`,
  `dev/framebar-test.js` (unit), `dev/checks/framebar64.js`.
- `tools/three-sandbox.html`: the "frame budget bar" block (`FB`, `fbRender`, `fbRows`, `fbTex`, `fbScan`, `fbWhy`,
  `window.__labFramebar` for checks), a gated line in the render wrapper, two gated lines in `lqFlush`, `hz` + `fb` on
  the stats message, the `framebar` / `framebar-why` messages.
- `tools/three.js`: the bar in `paintStats` (right after the fps), when counting turns on and off (`fbShown`), the
  `framebar-result` route, `ThreeLab.framebar`; the stats line gets `fb-keep`.
- `tools/three-lab.css`: one rule (fps + bar on screen by default).
- Outside the lane, small: `declutter.js` (`lab-stats` gets `keep: '.fb-keep'`), `lazy-data.js` / `lazy-meta.js`
  (the group; `node dev/lazy-manifest.js`), `dev/run-checks.js` (`unit:framebar-test`, group `framebar64`).

## Tests
- `dev/framebar-test.js` (9 tests):
  - the target: Auto from a measured 239.6 Hz is 240, and a chosen rate;
  - the frame: CPU vs late frames, a 60 Hz screen, a cap, a still picture;
  - the levels and the bar's scale;
  - the breakdown: code = frame callback − draws inside it, total + draws outside it, the order, the sentence;
  - blending;
  - the costs, the suggestions and their order, and the drafts' words.
- `dev/checks/framebar64.js`, on the labplay55 fixture (the Clink-like game with 2K textures, 60 shadowed crates,
  cloned-material projectiles, a DOM HUD) plus a deliberately heavy layer (300 copies of one box drawn one by one,
  150 see-through spheres each with its own material, 450 shadow casters, 5 point lights, 2 ms of its own code):
  - the fps + bar show without pointing at the preview, with the rest of the line hidden;
  - nothing is counted per layer until the line shows;
  - pointing at the preview shows the whole line, with the bar right after the fps (level, numbers, scaleX), and the
    page counts each layer;
  - the over-budget layer is named Heavy, with its texture memory counted;
  - the card names it;
  - Why? lists draw calls by material ("brick" 300, "glass"), the shadow casters (450) and their map, and the overdraw;
  - the suggestions start with instancing, with casters and shared materials among them;
  - "Ask the Three Director" puts the words in the director's box and doesn't send them;
  - with the pointer away the line folds back to fps + bar and the sums freeze;
  - the target 144 Hz is 6.9 ms; `/framebar target auto`; `/framebar` status.
- Run under the shared lock (outputs in the stream's scratch folder): see the final report for the list and results.

## Notes
- On this machine (software GL), frames take ≈ 100 ms, so the bar is red and the target is the Xvfb screen's 60 Hz. The
  check reads the structure, not the times.
- The Lab may draw a shadow map smaller than the scene asks for while frames are slow (labadapt). The look reports the
  map as it is drawn.
- The page's CPU timing is the main thread's. The GPU shows only through late frames: the page has no GPU timer
  queries (adding them would be steady per-frame work).

## For the patch notes
- The Lab's stats line now shows a frame budget bar right after the fps. It tells you whether your scene fits one frame
  of your screen's rate: 4.2 ms at 240 Hz. Green fits, amber is over, red is well over.
- Point at the bar or click it to see what each layer costs: its own code, its drawing, draw calls, triangles, texture
  memory and shaders. It names the most expensive layer.
- Press **Why?** and Hearth looks at that layer for 3 seconds. It lists what costs the most (draw calls by material,
  shadows, see-through overdraw, post-processing) and what would help, in plain words.
- Each suggestion has an **Ask the Three Director** button. It puts the request in the director's box without sending
  it, so you can read it first.
- The bar measures against your screen's rate by default. You can pick 240, 144 or 60 Hz from the card (or right-click
  the bar).
- It costs nothing while you play. Each layer is only measured while you point at the preview or the card is open, and
  Why? runs only when you press it.
