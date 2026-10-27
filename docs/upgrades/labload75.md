# labload75: a kept preview page stays light across project switches, and scenes seen before open from memory (round 75)

Since round 72 a project → project switch keeps the Lab's preview page (`ThreeLab.workspace.close({ keep: true })` →
`prepare(next)`), round 73 mounts the Lab after start and round 74 starts the page on the card's press. One page can
now run dozens of projects' scenes in a row. This stream measured what that page holds after many switches with
asset-heavy scenes, fixed what grew, and made a scene's files, pictures, models and skies survive the switches.

## What was found (measured first, base = main fcf203a)
`dev/checks/labload75.js`: 30 switches in a kept page between three heavy scenes (each: four 2048² photos, a 14 MB
GLB of 250k vertices with its own 1024² texture, an HDR sky + PMREM environment, a 1280×720 video, a 512² render
target drawn every frame, a 200k-point cloud, an AudioContext with an oscillator, a THREE.AudioListener + THREE.Audio).
Samples after a forced GC at switches 6, 15 and 30.
- **The GPU side was already flat.** The context pool (round 21) deletes every GL object a gone layer made: GL
  textures 16, buffers 57, framebuffers 12, contexts 1 at every sample; three.js' own counters flat; GPU process
  working set flat within noise.
- **The preview's arrays memory grew ≈ 4 MB per switch, forever** (47 → 83 → 144 MB). Each visit's HDR sky (a 4 MB
  half-float array) stayed alive with the gone scene's module: a sky loaded by the scene's own `HDRLoader` isn't
  "made by the layer" in labmemory's sense (it arrives in a loader callback), so round 39's let-go never saw it.
- **THREE.Audio went silent after the first scene that used it.** three.js keeps one AudioContext for the whole page
  (`THREE.AudioContext.getContext()`); the first `THREE.AudioListener` made it from a layer's code, so it counted as
  that layer's and was closed 2.5 s after the layer went. Every later scene's `THREE.Audio` played into a closed
  context, without an error (the check reads `closed` at every sample on the base).
- **A late loader callback of a gone scene threw.** A sky that finished loading after its scene was switched away
  built its PMREM on a renderer already let go (`TypeError: Cannot read properties of null (reading 'enabled')`).
- **Every visit started from nothing.** Each switch read every reference from disk in the window, copied it to the
  page (≈ 70 MB per visit here: the video, the GLB, the photos), decoded every photo again, parsed the GLB and the HDR
  again. The window also kept its own copy of the open scene's files.

## Upgrades
1. **The preview keeps a scene's files in memory across switches** (the asset cache, `three-sandbox.html` "the
   scene's files, kept in this page"): keyed by the file and its time (`path | size | modified`), so a file changed on
   disk is read again; one cache bounded by size (least recently used goes first; never the open scene's; 768 MB on
   an 8 GB+ machine, less on smaller ones).
2. **Files the page already holds aren't read or sent again.** The page tells the window what it holds
   (`refs-held`, per page load); the window sends only the rest, and asks the disk only for those. A page that let one
   go asks for it (`refs-need`) and the scene runs again with it.
3. **The window keeps no copy of a file the page holds** (it kept the open scene's whole files, videos included).
4. **Photos are decoded once per page** (ImageBitmap, off the page's thread) and reused on the next visit; the open
   scene's photos start decoding the moment its files arrive, side by side, before its code asks.
5. **Models a scene loads with its own `GLTFLoader` are parsed once per page.** Each visit gets its own copy (objects,
   geometries, materials, textures are new; vertex data and pictures are shared, read-only), so nothing one visit
   changes reaches the next. Skinned models keep their bones linked.
6. **Skies a scene loads with `HDRLoader` / `RGBELoader` / `EXRLoader` are parsed once per page** (same rule: a new
   texture each visit, the pixels shared). This is also what stopped the +4 MB per switch.
7. **Models and skies from a web address are kept by their address** in the same cache.
8. **A thin loading line at the top of the preview** ("Loading 3 of 8") when a scene's files take more than a
   quarter second; never in exports, ▶ Play or Present.
9. **A project's loading card counts the files** ("Loading scene assets (3 of 8)"), and getting ready (a project's
   opening, Present) now waits for the scene's own models and skies too, not only its photos.
10. **A scene that goes gives back what it held on the graphics card through three.js** (`ownDispose`): every
    geometry, material, texture (a video's too, paused), render target, instanced / skinned mesh data and shadow map
    its scenes and camera reach, and its `THREE.Audio` sources stop and let go of their nodes. Never what another
    running layer draws; skipped for a live edit that hands its state on (playloop). The context pool still sweeps
    whatever is left.
11. **THREE.Audio keeps working scene after scene**: three's shared AudioContext belongs to the page now (never
    suspended or closed with a layer), and a closed one is made anew.
12. **A gone scene's late model / sky never reaches its code** (no more errors from a scene switched away mid-load).
13. **Leak check** `dev/checks/labload75.js` (opt-in, `LABLOAD75=1`, ≈ 8–10 min): fails when GL objects, three.js
    counters, the preview's JS heap or arrays, the GPU process' memory, media elements or the window's heap grow from
    the 6th switch to the 30th beyond budgets, when media keep playing, AudioContexts pile up, or three's AudioContext
    is closed. Group `labload75` in `dev/run-checks.js`.
14. `power:test` metrics carry each process' working set (`mem`, KB): the check reads the GPU process' memory.

## Numbers (base fcf203a → this branch, same machine, back to back; SwiftShader under Xvfb, 4 shared CPUs)
| 30 switches in a kept page | Before | After |
|---|---:|---:|
| Preview arrays memory, switch 6 → 15 → 30 | 47 → 83 → **144 MB** (+96) | 98 → 98 → **98 MB** (+0.3) |
| Preview JS heap, switch 6 → 30 | 7.7 → 12.2 MB | 7.4 → 11.1 MB |
| GL textures / buffers / framebuffers (all samples) | 16 / 57 / 12 | 16 / 57 / 12 |
| three.js geometries / textures, live | 21 / 12 | 21 / 12 |
| GPU process working set, switch 6 → 30 | 437 → 456 MB | 439 → 442 MB |
| Window heap | 12.9 → 12.4 MB | 13.0 → 12.5 MB |
| Media playing / alive · AudioContexts | 1 / 1 · 1 | 1 / 1 · 2 (the scene's own + three's) |
| three's AudioContext after the first switch | **closed** (THREE.Audio silent) | running |
| Files copied to the page over 30 switches | ≈ 2.1 GB (every visit) | **209 MB** (first visits only) |
| Preview CPU per switch | 2,225 ms | **998 ms** |
| Window CPU per switch · main process | 604 · 294 ms | **225 · 69 ms** |
| Scene's assets in after its first frame (`ready-prepped` assets), revisits, median | 5.8 s | **3.3 s** |
| Switch → scene complete (model, sky, photos in), revisits, median | 10.2 s | 10.8 s |
| GPU process CPU per switch | 34.5 s | 34.2 s |
The asset cache held 45 entries / 318 MB for the three scenes (27 files, 12 photos, 3 models, 3 skies), 699 hits.

Read the wall times with care: on this machine the GPU is software (SwiftShader), and drawing these scenes costs the
GPU process ≈ 34 s of CPU per switch, the same before and after; that's what the 10 s of each switch is. Everything
the cache removes is CPU work in the page, the window and the main process (−55 %, −63 %, −77 %), which on the
owner's RTX 4080 is most of what a switch of an asset-heavy scene waits for. One honest trade: a revisit now has its
photos, model and sky before its first frame, so its first picture comes complete but ≈ 1.5 s later here (a software
GPU uploads them in that frame); before, the scene drew first and its files popped in over the next seconds.

## Files
- `tools/three-sandbox.html`: loader shims in the import map; "the scene's files, kept in this page" (`AST`,
  `setRefs`, `astPicture`, `__labAssetLoad`, `astGltfCopy`, the loading line, `window.__labAssets`); `refTexture()`
  reads decoded photos from it; `updateRef()` keeps a changed file under its new time; `ownDispose()` called from
  `teardownLayer()`; `ownInUse(list)`; three's AudioContext kept (OWN hooks, `ownRetire`, `ownSweep`); the sweep
  never closes a picture another texture shows or the cache keeps; `__labMem().assets`.
- `tools/three.js`: `refSigs`, `refs-held` / `refs-need`, `refReady()`, `loadRefBytes()` (stat first, read only what
  the page lacks), `sendRefs({ fresh })`, `reloadRef()` sends the new time, the loading card's count; dev switch
  `store three.assetCache = false` (files sent whole every time, as before).
- `dev/checks/labload75.js` (new), `dev/run-checks.js` (group `labload75`), `powerwisemain.js` (`mem`).

## For the patch notes
- **Switching between projects no longer makes the Lab heavier over time.** After 30 switches between big scenes,
  the preview's memory stays where it was after the first few; it used to grow with every switch.
- **Scenes you've opened before come back faster.** Their pictures, 3D models, skies and videos stay ready in the
  preview, so going back to a project doesn't load and unpack them all again.
- **A thin line at the top of the preview shows a scene's files loading** when it takes a moment, and the project's
  loading card counts them.
- **Sound made with three.js in a scene keeps working** after you switch scenes or projects (it went silent after the
  first switch).
- **A scene you leave lets go of its graphics memory and stops its sounds right away.**
- Behind the scenes: a new check switches projects 30 times with heavy scenes and fails if anything keeps growing.
