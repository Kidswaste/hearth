# modeltex100: a model's own pictures, off the page's thread and in slices; changed on disk, shown at once; ▶ Play and published pages carry every file (round 100)

Round 99 (`labmodels99.md`) made a model of several files (a `.gltf` with its `.bin` and pictures, an `.obj` with its
`.mtl`) work in the Lab. It left three things open:

1. A model's own pictures loaded through three's own loaders, so a 4K picture went to the graphics card **in one
   piece**. Only `refTexture`'s pictures used the decode worker (`decOff`, labflake95) and the slice queue
   (labcompile90 / labshadow91).
2. A model's other files weren't watched. A picture saved again showed only when the scene was opened again.
3. ▶ Play and published pages with such a model had never been checked.

All three are done. Nothing is added to any prompt (0 tokens). There is no new button or setting. Mac and Windows run
the same code. The owner's scene and game files are only read: Hearth writes only in its own copy (`data/refs/…`),
▶ Play's build folder and a publish's build folder.

## Before → after
Measured with the new app check `dev/checks/modeltex100.js` (below), at 480×270 on this machine (SwiftShader, no
background shader compiling), on the base (round 99, `1aa8a85`) and on this round's code. Base: 27 of its 43 steps
pass, with 16 failing. This round: all 43 pass.

| case | before (round 99) | after |
|---|---|---|
| a `.gltf` with a 4096² picture added (🧊 layer): biggest single upload | 16.8 MP (the whole picture, one call) | 2.1 MP (16 slices, each after a frame) |
| …its picture decoded | on the page (three's `ImageBitmapLoader`) | in the `decOff` worker, a 64-pixel stand-in made there too |
| …pixel uploads inside frames on screen, from the model's arrival | 0 | 0 |
| …the model's shaders compiled inside frames on screen | 0 | 0 |
| a `.glb` with a 4096² picture inside: biggest single upload | 16.8 MP | 1 MP (slices) |
| …pixel uploads inside frames on screen | 1 (1.1 MP) | 0 |
| an `.obj` + `.mtl` with a 2048² picture: biggest single upload | 4.2 MP (decoded on the page: `TextureLoader`) | 1 MP (slices; decoded in the worker) |
| a scene's own `GLTFLoader().load(refs.robot)` (4096² inside): uploads inside frames on screen | 1, carrying **16.8 MP** | 0 |
| …biggest single upload | 16.8 MP, inside the frame | 1 MP, after frames |
| the car's picture saved again by another app (as Photoshop would) | not followed (6 files watched); the old picture stays until the scene is opened again | followed (its copy and its original); the new picture shows in place (both corners read back), the scene not run again, 0 uploads inside frames, in slices |
| ▶ Play of a scene with a `.gltf` + `.bin` + picture | only `kart.gltf` copied: "The model "kart" didn't load: this .gltf points to .bin / texture files…" | all 3 files in the game's folder; the model loads, its picture on the graphics card (texel read back), no errors |
| a published page of the same scene | `assets/kart.gltf` alone; the page shows the error | `assets/kart/kart.gltf`, `kart.bin`, `tex/kart paint.png`; the page draws the model, no errors (deploy:verify) |

Late frames, each one judged on CPU as labcompile90 does:
- Before: one late frame each in the `.glb` and `hook` stretches was the app's (the upload inside the frame).
- After: none, in any stretch.

The other late frames on this busy machine are "can't tell (load)": up to 5 s gaps with 3–54 ms of
the preview's own CPU, the rest waiting for a CPU. The one late frame at a 🧊 layer's very start (3 shaders compiled
inside its first frame) is round 89's rule on a card without background compiling: a new layer's first scene compiles
before its first frame. It's the same before and after, and it isn't the model's. On a card with
`KHR_parallel_shader_compile` (the 4080) that compile happens under the switch's cover.

What changed in the numbers above: a 4K picture never goes up in one piece, and nothing of the model is uploaded inside
a frame. On this software GPU a slice of 1 MP took up to 217 ms, all of it in the gaps after frames. On a real card
it's a few ms (labcompile90's slices grow to 4 MP there).

## What changed
1. **`tools/three-sandbox.html` "a model's own pictures"** (new section, `MTX`):
   - A loader with the `TextureLoader`'s shape (`mtxLoader`) used in two places:
     - in place of the GLTFLoader parser's `ImageBitmapLoader`, through a GLTFLoader plugin (`mtxGltf`). This covers
       the Lab's 🧊 layers (`sandbox-lab3d.js` registers its loader) and a scene's own GLTFLoader (the import map's
       hook, `__labAssetLoad`). `.glb` embedded pictures go through it too.
     - for an `.mtl`'s maps, as a handler for `hearth-ref://` URLs on three's default manager.
   - Each picture is fetched from the model's files and decoded in the `decOff` worker. For a picture of a megapixel or
     more, the worker also makes a stand-in of at most 64 pixels a side. The model gets its texture with the stand-in,
     so it shows its colours at once.
   - Once a renderer has the texture on the graphics card, the full picture goes through the uploads' queue
     (`upRelease` → `upSlice`, rounds 72 / 90 / 91): 4 MP or more in slices after frames, with the stand-in drawn until
     the last slice; 1–4 MP in one piece after a frame. Every copy of the texture (the GLTFLoader's clones, the asset
     cache's copies) is followed through its own `clone()`, and takes the picture without a second upload where it
     shares the graphics card's.
   - The export page (exact frames) gets each picture whole, as before.
   - `decOff` takes a `small` size (the stand-in). `window.__labModelTex.state()` reports what happened (for checks).
     `?mtex=0` or `__labModelTex.set({ on: false })` turns it off.
2. **`lcAhead` → `lcTextures`** (labcompile90's runtime precompile): a model's new meshes already wait while their
   programs compile in the gap after a frame. Their textures (the stand-ins) are now uploaded in that gap too, and so
   is three's own 16×16 lookup table for lit materials when that renderer hasn't drawn one yet. An `.mtl`'s texture,
   handed out before its picture is in, gets its picture in a gap and is uploaded there.
3. **Live** (`tools/three.js` `reloadRefFile`, `refFilesOf`; `filewatch.js`):
   - filewatch follows a model's other files: Hearth's copy (`lab-file:`) and the original next to the file it was
     added from (`lab-fsrc:`, from the copy's layout).
   - A picture saved again: read again and sent as `ref-file-update`. The page (`rmodFileUpdate`) swaps its URL in the
     model's entries and the asset cache (the model's own sig too, which covers its files). It decodes the picture in
     the worker and swaps it into every texture made from it, in slices, with the old picture drawn until the last one.
     Nothing re-runs.
   - A `.bin` or `.mtl` saved again: the scene runs again (the model parsed again), as a model reference always did.
   - An original changed is copied over Hearth's copy first (as round 42 does for a reference). Hearth's copy deleted
     while the original is there: copied again.
4. **▶ Play** (`gamemodemain.js` `buildScene`) and **publish** (`deploymain.js` `build`, `deploy-core.js` `hostPage`):
   - a model the Lab copied whole goes whole: its folder's files in their layout under `assets/<key>/`
     (`deploymain.modelFiles`, read only).
   - The page is told where each one is (`main`, `files`), so the player finds them as in the Lab (`refModelResolve`).
   - ▶ Play's cache key now covers those files' stamps, so a changed picture builds the page again.
   - A published page now vendors a 🧊 layer's loaders, as ▶ Play has since round 52 (`sandbox-lab3d.js`'s imports:
     GLTFLoader, OBJLoader, RoomEnvironment…). Both vendor MTLLoader / OBJLoader when a reference is an `.obj`.
   - Before this, a published page with **any** 🧊 model, even a single `.glb`, failed to import GLTFLoader. The page
     then said "this .gltf points to .bin / texture files", whatever the cause.
5. **`window.__labHitch`** also counts every pixel upload inside a frame (`upInFrame`, and the first 40 as
   `inFrameUploads`: frame, call, MP), not only first uploads' megapixels.

## How it was measured
- **`dev/checks/modeltex100.js`** (group `modeltex100` in `dev/run-checks.js`, about 2 min). Fixtures are made in the
  check's temp folder: a `.gltf` with its `.bin`, a 4096² picture in `textures/` and a small one a folder up; a `.glb`
  with a 4096² picture inside; an `.obj` whose `.mtl` names a 2048² picture; a small `.gltf` "kart" whose picture has
  a space in its name. Steps:
  - `add:<model>`: each model added with `/model add`'s path. The page marks the frame the model enters its scene.
    From there it counts pixel uploads and shader compiles inside frames on screen, the biggest single upload, and the
    late frames, judged on CPU (load-aware, as labcompile90 does). Then it reads the picture's texels back from the
    graphics card at both corners: the far corner is only there once the whole picture is up. It also checks
    `__labDecode()` (decoded in the worker).
  - `hook`: the same for a scene's own `GLTFLoader().load(refs.robot)`.
  - `live`: the car's original picture is written by "another app" (`fw:test`, which filewatch doesn't take for Hearth
    itself). The check reads back the new colour at both corners, confirms the same scene object (not run again,
    `ThreeLab.live.counts()` unchanged) and Hearth's copy updated, and counts 0 uploads inside frames.
  - `play`: ▶ Play of the kart scene. In the game's page: the model's 2 other files, the model loaded, its texel, no
    errors.
  - `publish`: `deploy:build` of the same scene, the files under `assets/kart/`, and `deploy:verify` (a hidden window:
    drawn, no errors).
  - The originals are untouched.
- **Before:** the same check on the base, extracted with `git archive 1aa8a85`, with `REPORT` on (it only reports).

## Safety
- The owner's files are only read. Hearth writes only to:
  - its own copy in `data/refs/<time>-<name>/`, when an original changed. This is round 42's rule for a reference,
    now for a model's other files too.
  - ▶ Play's build folder and a publish's build folder.
- Nothing is uploaded or sent anywhere new. A publish sends what it always sent, plus the model's own files, which
  the model needs.
- Any trouble falls back to the old path for that picture, and nothing is lost: the worker fails (decoded on the page),
  no stand-in (one piece after a frame), two renderers drawing it (one piece after a frame). The GLTFLoader keeps its
  own loader where `createImageBitmap` is missing.
- First screen unchanged: everything is in the Lab's preview page (loaded lazily), `filewatch.js` (lazy group
  `filewatch`), `tools/three.js` (group `lab`) and main-process files.

## What's left
- An `.obj` naming several `.mtl` files: their pictures are found from the first one's folder (as round 99).
- A model's picture that isn't a reference's (a scene's own `GLTFLoader` of a web address) also takes the new path
  (decoded in the worker, slices). It isn't followed on disk: there's no file.
- A 🧊 layer's first frame still compiles its first scene inside it on a card without background compiling (round 89's
  rule; the same before and after).
- ▶ Play's "Optimize for play" (gltfpack) of a `.gltf` with outside files wasn't looked at. Its copy is a `.glb`, used
  when there is one, and the model's other files go with it anyway.

## For Codex
No Codex-owned file was edited: `quest-*`, `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`,
`workbench-*`, `creative-vst*`, `astra*` and `engine-watch` are untouched. Also untouched: the creative-direction
session's files, `store.js`, the sync files and startup code (perf100's area).

## Tests run (final code)
- App checks under the run lock: `modeltex100` (43/43); `labmodels99`, `labfps89`, `labcompile90`, `labboot`,
  `labload94`; `bundle98`, `lazy`, `gamemode`, `gpuplay76`, `deploy-build`; `filewatch`, `live`.
- Unit tests: `unit:labmodels99-test`, `unit:labfps72-test`, `unit:labshadow91-test`, `unit:bundle98-test`,
  `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`,
  `unit:boot-test`, `unit:lazymanifest-test`, `unit:gamemode-test`, `unit:winstart79-test`.

## For the patch notes
- 3D models with big textures no longer make the Lab preview stutter when they appear. A model's texture pictures are
  now prepared in the background and sent to the graphics card a little at a time between frames. Meanwhile a small
  version shows, so the model has its colours right away. This works for `.gltf`, `.glb` and `.obj` models, and for
  models your own scene code loads.
- When you save a model's texture again (for example in Photoshop), the Lab shows the new one right away, without
  reopening the scene. Saving its other files again (`.bin`, `.mtl`) reloads the model by itself.
- ▶ Play and published pages now work with models made of several files: every file the model uses goes with it.
  Published pages with a 3D model layer also load properly now, including a single `.glb`. Before, they showed
  "didn't load".
