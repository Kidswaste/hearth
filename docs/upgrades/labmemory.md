# labmemory (round 39): the Lab stays light over a long session

Goal: hours in the Three.js Lab (dozens of scenes, director edits, variations, before / after, templates, recordings)
without the preview getting heavier. Nothing looks or works differently; it's only lighter. No new setting.

Where it lives: `tools/three-sandbox.html` ("what a gone layer's code still holds", "a quiet guard after scene
switches", `gutRenderer`, `setRefs`, the recorder's stop, `window.__labMem()` and counters in the head script),
`tools/three.js` (references kept for the open scene only and not re-sent unchanged; the `mem-note` tip),
`dev/checks/labmemory.js` (new), `dev/run-checks.js` (lab group + `labmemory` group), `dev/smoke.js` (`{ snapshot }`).

## What I found (measured first)
- **The GPU side was already fine.** The context pool (round 21) deletes every GL object a gone layer made, and the
  program cache is capped at 48 per context: over 40 switches GL objects, programs, contexts and three.js' counters
  stayed flat (≈ 150 GL objects, ≈ 25 programs, 1 context + 1 waiting).
- **The JS side leaked on every switch and every edit.** A layer's code is an ES module, and the page keeps every module
  it ever imported for its whole life (revoking its blob URL doesn't release it). Everything the module's top-level
  names reach stayed: geometry arrays, textures' pixels, its canvases, and the whole three.js renderer (its state,
  programs' objects, render lists, caches). A scene with a 2M-number point cloud kept **8 MB more per switch, forever**
  (99 MB after 12 switches, measured with a heap probe in the preview). Every director edit of a heavy scene kept a full
  copy of its data too.
- Why the renderer stayed (heap snapshot, retainer paths): three.js puts "dispose" listeners on every geometry,
  material, texture and render target it draws; those listeners are closures of the renderer, so a module that still
  held a mesh held its renderer's whole insides.
- **Object URLs** a scene made itself were never revoked; **references** were re-sent whole to the preview on every
  scene switch (a video reference is the whole video, copied twice) and the replaced URLs were never revoked, so every
  copy stayed; the hub kept the bytes of every visited scene's references until the Lab closed.
- **Sound and video a scene started kept playing after you left it** (a `new Audio()`, a video element, a
  `refTexture('clip')` video: hidden, decoding), and a scene's own AudioContext or camera / microphone stream stayed open.
- A **recording** left the canvas' capture track running after the take (it kept copying frames of a pooled canvas).
- ImageBitmaps of reference pictures were never closed (they're per layer run).
- Hub side (the window) was flat: heap 10.4 → 11.6 MB over the session, DOM nodes flat; 🎲 variations and ◧ before /
  after free their own things (their checks), labboot's warm page goes after 15 min. Nothing to fix there besides
  the references.

## Numbers (before → after)
`dev/checks/labmemory.js`: six scenes (each with its own shader, a canvas texture, a data texture, a render target
drawn every frame, PMREM on some, one 1.5M-number point cloud with sliders, one 2D canvas scene with a video element,
one making an object URL), 40 switches, two new scenes from templates, four director edits, 🎲 variations opened and
closed. Each sample after a forced GC in the preview and the window. "Before" = the same build with the new
let-go switched off (`localStorage.lmOwn = '0'`), same machine (SwiftShader under Xvfb).

| After 40 scene switches | Before | After |
|---|---:|---:|
| Preview JS heap (start 4.7–5.2 MB) | 12.2 MB, +1.4 MB per 8 switches | **9.0 MB**, +0.9 MB per 8 |
| Preview arrays memory (geometry, textures' data; start 3.1 MB) | **54.1 MB**, +7 MB per 8 switches | **5.6 MB**, flat |
| Object URLs alive | 8 (+1 per visit) | **1** |
| What gone scenes' code made, let go over the session | 0 | 56 arrays, 33 textures' data, 57 canvases, 7 URLs, 2 media: **56 MB** |
| GL objects · linked programs · contexts | 155 · 27 · 1+1 | 154 · 26 · 1+1 (already flat) |
| three.js geometries / textures / programs (on screen) | 26 / 6 / 5 | 26 / 6 / 5 |
| Canvases · AudioContexts · videos playing · ImageBitmaps | 1 · 0 · 0 · 0 | same |
| Window: heap · DOM nodes | 11.6 MB · 5,638 | 11.6 MB · 5,638 |
| A 2M-number point cloud scene, 12 switches between 3 copies (arrays) | 11 → 99 MB | flat |
| Its renderer internals per gone scene (heap snapshot: WebGLTextures / WebGLState objects alive after 28 switches) | one per renderer ever made | **1** (the live one) |

What still grows a little (≈ 100 KB per switch here): the module itself (its compiled code, its source) and the few
small objects its top-level names hold directly. The browser offers no way to unload a module; running each scene
in a fresh page would cost the instant switches of rounds 21 / 37.

## Upgrades

### Scene switches and edits let go of the old scene
1. **The old scene's data goes**: geometry arrays and texture pixels (32 KB and up) that a scene's code made are
   emptied 2.5 s after you switch away, re-run it, remove its layer or the director edits it (its last picture is
   taken and the new one drawn first). Before, every visit and every edit of a heavy scene stayed in memory.
2. **Its own canvases go** (2D canvases and OffscreenCanvases its code made: sized to nothing, never the pooled
   WebGL canvases).
3. **The old renderer's insides go**: three.js' "dispose" hooks on the old scene's objects are taken off, the gone
   renderer is emptied and the gone scene drops its children: about half the per-switch heap growth.
4. **Sound and video stop with their scene**: audio / video elements a scene played (including `refTexture` videos)
   pause the moment it stops and are unloaded a moment later; its AudioContexts are suspended then closed.
5. **Camera and microphone a scene opened itself are switched off** when it stops.
6. **Object URLs and ImageBitmaps a scene made are revoked / closed** (reference pictures' bitmaps included).
7. Never what something still running draws: before emptying anything the sweep checks every scene the live layers
   draw, and the page's own shared helpers (text atlases, grade, motion, sequence footage, the song) are never touched.

### References
8. **References aren't copied into the preview again on every switch** when nothing changed, and replaced copies are
   let go 5 s later (except one a reference video still plays). A 100 MB video reference used to be copied twice and
   kept on every switch.
9. **The Lab keeps only the open scene's reference files in memory**; another scene's are read again (from disk, a
   few ms) when it opens.

### Recording
10. **A Lab recording's capture stops with the take**: it no longer keeps copying the preview's frames afterwards.

### The guard
11. **A quiet clean-up after scene switches**: 3 s after a switch, the preview reads its GPU counters (GL objects,
    programs, contexts, GPU estimate). Above its budget (6,000 objects, 96 programs, 8 contexts, 1 GB: a tenth of it is
    a normal session) it cleans up by itself: leftovers emptied now, programs nothing uses trimmed to 8 per context,
    waiting contexts and the thumbnail renderer let go. Still above after two switches in a row: one calm tip through
    Hints ("The Lab preview is holding a lot of graphics memory after many scenes. ⟲ Restart from scratch lightens
    it.", with a ⟲ Restart button), once per page.

### For the next measurer (dev, not counted)
- `window.__labMem()` in the preview (`d.evalInSketch('return __labMem()')`): GL objects by kind on every context
  (pooled too), linked programs kept / idle, three.js counters, canvases, videos (playing), AudioContexts, object URLs,
  ImageBitmaps, layer modules, heap, and `guard` (what was emptied, MB, the guard's last reading).
- `window.__labMemGuard.set({ objects, programs, contexts, gpuMB })` / `.now()` / `.own(false)` (the before).
- `dev/checks/labmemory.js` (lab group; `sh dev/run-checks.sh labmemory` also runs labboot, labpace, labvariations,
  abcompare, beatlink): fails above budgets (preview heap 40 MB, arrays 40 MB, 900 GL objects, 60 programs, 3
  contexts, 12 object URLs, open bitmaps / AudioContexts / playing videos), when heap, arrays, GL objects, programs,
  URLs or the window's heap / nodes keep growing from the middle of the session to its end, when a switch doesn't
  draw, or when the guard doesn't clean / note. `localStorage.lmRounds` = rounds of 8 switches, `lmOwn = '0'` = before.
  On the old behaviour it fails 4 budgets (arrays 54 MB, heap / arrays / URLs growing).
- `dev/smoke.js`: `await smoke({ snapshot: file, target: 'three-sandbox' })` saves a heap snapshot (window or iframe).

## Tested
`node --check` on tools/three.js, dev/smoke.js, dev/run-checks.js and the sandbox's three scripts (extracted).
`sh dev/run-checks.sh labmemory lightweight capture-pack lazy unit:boot-test`: 12/13 — labmemory, labboot, labpace,
labvariations, abcompare, beatlink, capture-pack, lazy, boot-test and lightweight's three unit tests pass; the
`lightweight` check fails on "⋯ AI setup sheets / their buttons kept" (options.js), which fails the same way on this
branch's starting commit (run from a copy of it): not the Lab, not touched here. `jam` (records the Lab) passes after
the recorder change. labmemory before (`lmOwn = '0'`): fails 4 budgets (arrays 54 MB, heap / arrays / URLs growing).

## Caveats
- A scene's code that keeps its own data in a global (`window.cache = …`) to reuse across re-runs: if the new run
  draws it, it's kept (the sweep checks); if it's stashed and not drawn for 2.5 s, its arrays are emptied. No template
  or director pattern does this.
- Models loaded with a loader, and data the scene's code keeps only in its own variables (not in the scene), aren't
  attributed and stay as before.
- What a module is (its code) can't be unloaded by the browser: ≈ 100 KB per switch remains here; ⟲ Restart from
  scratch clears it all.
- Measured on SwiftShader; on a real GPU the GPU side was already flat, the JS / array numbers are the same.

## Edits outside the lab lane
- `dev/smoke.js`: the `{ snapshot }` request (additive). `dev/run-checks.js`: the check in `lab`, a `labmemory` group.

## For the patch notes
- The Three.js Lab now stays light over long sessions: switching scenes, re-running and director edits no longer keep
  the old scene's data in memory (in our test, 40 switches held 54 MB of scene data before, 6 MB now).
- Sounds, videos and a camera that a scene started now stop when you leave that scene or it's re-run, instead of
  playing on unseen.
- Reference files (pictures, videos) are no longer copied into the preview again on every scene switch, and only the
  open scene's references are kept in memory.
- A Lab recording no longer keeps working in the background after the take.
- If the preview ever gets heavy after many scenes, it tidies itself up quietly; if it can't, a single calm tip offers
  ⟲ Restart from scratch.
- Nothing looks or works differently.
