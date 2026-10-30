# labcompile90 (round 90): no shader compiles inside a frame mid-scene, 4K pictures in slices

Round 89 (`labfps89.md`) made the Lab preview compile a scene before its first frame and upload big pictures after a
frame. Three things were left open:

1. Shaders first made **while a scene runs**: a new material, a light added, glass.
2. A 4K picture still went to the graphics card **in one piece**.
3. Heavy setup in a scene's own code.

This round does 1 and 2. Item 3 was left alone on purpose (see "Item 3").

Nothing is added to any prompt (0 tokens). There is no new button or setting. Mac and Windows run the same code. Every
app change is in the Lab's preview page (`tools/three-sandbox.html`, which loads lazily outside the first screen, so
the budget is unchanged). The owner's scene and game code is not touched.

## How it was measured
- **The hitch recorder now sees inside the frame.** `window.__labHitch` now also keeps, for each frame:
  - the shader compiles and links made **inside** the page's frame callbacks (`compilesInFrame`), and the time spent
    waiting on a program there (`waitInFrame`). A compile in the gap after a frame doesn't make a frame late on a card
    that compiles in the background. One inside a frame does. Round 89 counted both together.
  - the biggest single upload of pixels (`bigUp`, and `bigUpInFrame` for one inside a frame). Uploading a picture in
    slices doesn't change the total. What changes is the biggest one-piece upload.
- **New check `dev/checks/labcompile90.js`** (group `labcompile90` in `dev/run-checks.js`, about 1 min). Its stretches,
  at 480×270:
  - `runtime:mats`: four meshes with new materials added to a running scene (physical + clearcoat, toon, lambert, a
    shader material);
  - `runtime:swap`: a running mesh given a new material;
  - `runtime:light`: a point light added;
  - `runtime:glass`: the scene's first glass sphere added (transmission);
  - `glass:shown`: a glass sphere that was hidden from the start and is shown after a second;
  - `texture`: two 4096² pictures arriving.
- **Load-aware, judged on CPU and counts, not wall time** (round 88's rule, the same code as labfps89). Each
  stretch is traced lightly. Each frame over 2× budget is judged:
  - the app's, if the preview's own CPU was over budget;
  - the app's, if a compile or big upload landed inside a frame that was on screen;
  - otherwise it goes in the `cantTell` list ("load"). That list doesn't fail the check.
- **Budgets:**
  - 0 compiles inside frames on screen in every runtime stretch and in `glass:shown`;
  - each new thing is shown within 12 frames;
  - no single upload over 4.2 MP, at least 4 slices per picture, none inside a frame;
  - the picture's texel can be read back from the graphics card after the slices;
  - at most 1 hitch a stretch judged the app's. Without background compiling, a new layer's setup frame is allowed,
    as in labfps89.
- **Before → after** is the same check on both builds. Before is base 8b50d03 with only the recorder added (commit
  0814aba, run with `--app` on a copy of it and `LC90_REPORT=1`). After is this branch.

## The fixes
### 1. Shaders for things a running scene adds are made in the gap after a frame
- **What counts as a change** is noticed as it happens. While nothing changes, a render compares one number.
  - `Object3D.add` of something drawable or a light;
  - a material being made, or told `needsUpdate` (three bumps its `version` both times; the page reads it through an
    accessor on `Material.prototype`). Bumps made while three renders are ignored, such as glass toggling its side
    every frame.
- **On the next render of that scene,** its new things are found: materials this renderer has no program for, and
  lights it hasn't seen. They wait:
  - a new mesh is **hidden**;
  - a mesh given a new material **keeps drawing with its old one**;
  - a new light **stays off**, so every lit material keeps its current program.

  The rest of the scene draws as usual. This also covers a canvas read for a filter or a recording.
- **Their programs are made in a task right after that frame.** That is the gap before the next frame: at 60 on a
  240 Hz screen, three free refreshes.
  - With background compiling (KHR_parallel_shader_compile, which every desktop GPU including D3D11 has): through
    `renderer.compileAsync`. The things show when the GPU says their programs are ready.
  - Without it: through `renderer.compile`, and each new program's link status is read there, so the wait for the
    driver happens in the gap. They show on the next frame, one frame late.
  - Nothing waits more than 2.5 s.
- **Glass.** The transmission pass draws every opaque material again into a target, with linear colours and no tone
  mapping, plus the back faces of double-sided glass. Those variants are now compiled:
  - in round 89's compile before a layer's first frame (which covers glass hidden at the start);
  - for the scene's first glass when it arrives mid-scene.

  They are compiled under a 1×1 target, with the see-through things set aside for that moment.
- **A scene that spawns new materials every frame** (a game cloning a bullet material per shot) stops being watched
  after about five checks in a row. It is off for 3 s, then 12 s, then 48 s, up to 2 min. Its new things then show at
  once, as before. gcchurn60's Lab part reads 706 B a frame of Hearth's own code, against a budget of 1024 (it was
  1638 before this rule).

### 2. 4K pictures go up in slices
- **Which pictures.** A decoded picture of 4 MP or more (a 4K photo is 16.7 MP, 67 MB), drawn by one renderer, and not
  shown before.
- **How.** It is handed over as before, one per frame and after the frame (round 89). Then:
  - **One gap:** the texture's memory is made, every mip level, with no pixels yet.
  - **Then about 2 MP per gap:** one slice per gap after a frame. Each is a band of rows of the decoded `ImageBitmap`,
    sent with three's `renderer.copyTextureToTexture(src, dst, region, position)`. That is a `texSubImage2D` with
    `UNPACK_SKIP_ROWS`, so nothing is copied on the page's thread and no extra copy of the picture is kept.
  - **Mipmaps:** made once, with the last slice.
  - **Hand-over:** the scene's own texture then takes over that memory. It is the same picture with the same
    settings, so three finds it already made and uploads nothing. The temporary texture is then let go.
- **While it fills,** the texture shows what it showed before the picture arrived, as before this round.
- **When it isn't used:** two renderers drawing the picture, a picture already shown, an export page, or anything
  failing. The picture then goes up in one piece, as before.
- **Why this option.** It is what three r186 supports cleanly with public API (`copyTextureToTexture` with a source
  region, `initTexture`, `source.dataReady`). Decoding was already off the page's thread (`createImageBitmap` with
  `imageOrientation: 'flipY'`, round 37). KTX2/basis copies were already preferred where they exist (▶ Play's
  transcoded copies, round 53). They are compressed, so their upload is a fraction of the size.
- `dev/labfps72-test.js` now runs the slice queue with fake frames and a fake renderer. It checks:
  - the memory comes first;
  - 8 slices of 4096 × 512, one per frame;
  - mipmaps only with the last slice;
  - the take-over uploads nothing again;
  - two renderers, or a picture under 4 MP, go up in one piece.

## Before → after (labcompile90; base 8b50d03 + recorder vs this branch; SwiftShader, 4 shared CPUs)
| Stretch | Compiles inside frames on screen | All compiles / links | Hitches over 2× (the app's) | p99 ms | Biggest single upload | Frames the new thing waited |
|---|---:|---:|---:|---:|---:|---:|
| New meshes, new materials | **12 → 0** | 12 → 12 | 3 (2) → 3 (0) | 183 → 267 ¹ | — | 0 (shown the next frame) |
| Mesh given a new material | **3 → 0** | 3 → 3 | 1 (0) → 0 (0) | 100 → 100 | — | 0 |
| Point light added | **15 → 0** | 15 → 18 ² | 2 (1) → 3 (0) | 200 → 250 ¹ | — | 0 |
| First glass added | **24 → 0** | 24 → 21 | 2 (1) → 2 (0) | 433 → 500 ¹ | — | 0 |
| Glass hidden at start, shown | **3 → 0** | 3 → 0 | 2 (0) → 4 (0) | 150 → 183 ¹ | — | — |
| Two 4K pictures arriving | 3 → 3 ³ | 3 → 3 | 6 (3) → 8 (1 ³) | 1017 → 950 | **16.8 → 2.1 MP** (16 slices) | — |

¹ The compiles still cost the software GPU the same time. Here they run in the GPU process, on the same 4 busy CPUs,
right after the frame, so the next frame is still late. These late frames are judged "can't tell (load)": the
preview's own CPU in them was 0–5 ms. On a real card with background compiling, the gap absorbs them. Single p99s
swing 1.5–2× between runs on this machine (labfps89 ¹). The counts are what compare.

² With a light added, the lit materials' programs for the new light count are made in the gap. That is one program
more than the base made inside its frame, because `compile()` goes through every material in the scene, drawn or not.
Nothing is compiled inside a frame.

³ The new picture layer's own programs, in its one setup frame. Without background compiling that is allowed, as in
labfps89. With it, they compile behind the old picture (round 89).

Slices on this machine: 2 pictures, 16 slices, 2.2–3.5 s of the software GPU's time in all. The longest single call
was 0.9–1.6 s: the empty mip chain made with the memory, or the mipmaps made with the last slice. labfps89's texture
stretch on this branch: p99 933 ms (1967 in round 89's write-up), 0 MP inside frames, `ahead` 2.

## Item 3: heavy setup in a scene's own code (left alone)
- **The Chrome blob** (`tools/three-gallery-data.js`, `chrome-blob`) builds its reflections with `PMREMGenerator
  .fromScene` in its module, and again whenever a light colour changes. It is a bundled gallery starting point,
  Hearth's own data, not the owner's work.
- **Why it wasn't changed.** The only lighter version available is a smaller reflection map (`fromScene(…, { size:
  128 })` instead of 256). That makes the chrome's sharp light panels visibly softer. That is a change to how the
  scene looks, not a clearly safe speed-up.
- **What it costs.** 1–3 s on this software GPU, a few ms on a real card. Since round 89, on a switch the old scene
  keeps moving while it runs.
- **Left as a suggestion for the gallery's owner:** build the room once at the start and only rebuild it when the
  slider is let go.

## What's left
- **The real card's numbers.** See `docs/windows-test-plan.md` § 8. They are:
  - `khr` should be true, and the compileAsync path is what runs there;
  - how many frames a new thing waits;
  - the time per slice on the 4080.
- **Still compiled in the frame that needs them, as before:**
  - a light removed or shown again (its absence can't be held back);
  - a shadow-casting light's first shadow pass (three's internal depth materials);
  - a second scene drawn by the same renderer;
  - materials made inside three's own render (`onBeforeRender`);
  - a scene's background drawn inside the glass pass.
- **A picture changed on disk while shown** (round 42's reload) is still uploaded in one piece. Slicing it would need
  the old texture kept beside the new one.

## Runs on this branch (`flock /tmp/hearth-run.lock node dev/run-checks.js --exact …`, ≤ 5 a run)
- labcompile90 ✓, with can't-tell lines: frames where the preview waited for the software GPU on a busy box;
- labfps89 ✓, labpace ✓, labboot ✓, labstartfast ✓, labshader ✓;
- nodes-shader ✓, gpuload84 ✓, lazy ✓, gcchurn60 ✓ (Lab: 706 B a frame);
- unit: labfps72-test, datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, boot-test,
  lazymanifest-test ✓.

## Windows test plan section
Added to `docs/windows-test-plan.md` as "## 8. Shaders made mid-scene and 4K pictures in slices (round 90,
labcompile90)".

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **No more stutter when something new appears in a playing scene.** A new object, a new material, a new light or a
  glass object is now prepared in the moment between two frames, and shows as soon as it's ready. The rest of the
  picture keeps moving the whole time.
- **Glass is ready from the start.** Scenes with glass or see-through materials now prepare everything glass needs
  before they start, so the first glass frame doesn't stick.
- **Big pictures arrive in pieces.** A large image (4K and up) is sent to the graphics card a strip at a time between
  frames, and shows once it's all there, so it no longer causes one long jolt.
