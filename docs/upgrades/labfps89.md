# labfps89 (round 89): fewer hitches in the Lab preview and in shows

The owner (Windows, RTX 4080, 240 Hz) asked for framerate work and "connectivity to three js lab". Rounds 72 and 84
dealt with the average: wasted frames are capped (Lab preview Auto ≤ 60, nothing drawing at 240 for no reason). This
round is about **spikes**: a single frame that sticks for 100 ms to 3 s when something new happens: a scene switch,
an edit, a new layer, a big picture arriving, an object that appears halfway through a show.

Nothing is added to any prompt (0 tokens). No new button or setting. Mac and Windows run the same code. Every change
is in the Lab's preview page (`tools/three-sandbox.html`, lazy, outside the first screen: the budget is unchanged).
The owner's scene code and game files are not touched: everything is in Hearth's runtime around them.

## How it was measured
- **New: a hitch recorder in the preview** (`window.__labHitch`: `start()` / `mark()` / `stop()`). While it is on, it
  keeps each of the page's frames: its gap, the layers' render time, the shader compiles / links in it, the time
  spent waiting on a program, the first texture uploads with their megapixels, how many of those were uploaded *inside*
  a frame, and whether what drew was on screen or under the old scene's still picture. It uses typed arrays made once
  at start, so it costs nothing per frame. When it is off it does nothing at all.
- **New check `dev/checks/labfps89.js`** (group `labfps89` in `dev/run-checks.js`, ~2.5 min). It runs six bundled
  demo scenes (gallery starting points: Outrun sunset, Chrome blob, Particle galaxy, Beat burst, Kinetic opener,
  Spectrum crown) at 480×270 and covers:
  - each scene steady;
  - a switch to each, both ways: the still picture as before, and double-buffered;
  - a code edit;
  - a hidden object shown mid-scene;
  - two 4096² pictures arriving;
  - a bloom filter added, then hidden and shown;
  - a song loaded and played.
- **Load-aware, judged on CPU** (round 88's rule: `dev/loadwait.js`, the `cantTell` list). Each stretch is traced
  lightly (smoke trace `tasks`). Every frame over 2× the budget gets a verdict:
  - **the app's (CPU):** the preview's own tasks spent more CPU than the hitch budget;
  - **the app's (compile):** a shader compile or a big upload landed in a frame on screen;
  - **can't tell (load):** neither. The thread was off the CPU, waiting for a CPU or for the software GPU process.
    It goes into `cantTell`, which doesn't fail the check.
- **The frame budget** is the preview's cap (Auto 60 → 16.7 ms). This machine draws in software (SwiftShader, 15–30
  frames a second for these scenes), so the budget becomes the stretch's own median frame there. A hitch is a spike
  against the scene's own pace, not a slow pace.
- **GPU timer queries**: labfps72's opt-in check already wraps each render in `EXT_disjoint_timer_query_webgl2`. That
  is the number to read on a real card; here it would only time SwiftShader.
- **Before → after**: the same check, back to back, on base 8de32ea (with only the recorder added to its preview
  page) and on this branch.

## What was found (this machine: 4 shared CPUs, SwiftShader, load 1–3)
| Suspect | Found | Done |
|---|---|---|
| Shader compiles on first use | A layer's programs compiled in the first frame that drew it. **Hidden objects** (a group shown on a drop or a kick) compiled when they first showed, mid-scene: 3 programs, a 100–350 ms frame here, and on D3D11 it is one of the classic hitches. Background compiling (`compileAsync`, KHR_parallel_shader_compile) was used only when the layer was covered by its old picture | **fixed** (1) |
| Scene switch | The old scene became a **still picture** until every new layer had drawn: 0.6–3.9 s of frozen picture per switch here (median 1.3 s). On a real GPU it lasts as long as the new scene's imports, compiles and first uploads | **double-buffered** (2) |
| Big texture uploads | Already one 4K picture a frame (round 72), but each upload happened **inside** the next render of its layer: 33.6 MP uploaded inside frames for two 4K pictures (1.5–2.5 s frames here) | **uploaded right after a frame** (3) |
| Hot reload after a code edit | 0 compiles (the page keeps linked programs across re-runs). The old picture covers until the new run draws | already right |
| Post-processing toggles | Adding a filter: one compile frame (it now waits for its shaders where the GPU compiles in the background). Hiding and showing it again: 0 compiles | (1) for adding; toggling already right |
| Geometry creation | It happens in the scene's own module (its code), during its run, while the old picture or the old scene covers. No geometry is built per frame by Hearth | the owner's code: not changed |
| GC churn in the render loop | gcchurn60's Lab measure on this branch: Hearth's own code **635 B a frame** (budget 1024) next to the scene's 168 KB (three's uniforms and matrices), i.e. 0.4 %. The biggest items are 20–76 B each (stats timer, pace meter, shadow gate), mostly numbers boxed by code this slow machine still runs unoptimised (round 81). The recorder adds one `if` per frame when it is off. No per-frame allocation was added | nothing worth a hitch: left (gcchurn60 keeps the budget) |
| Audio-reactive start | Song load (analysis, whole-song features) and play: 0 compiles, 0 hitches judged the app's, before and after. The analysis runs in the Lab window and its workers, not in the preview | nothing to fix |
| A scene's own heavy setup | The Chrome blob builds its reflections (PMREM `fromScene`) in its module: 1.3–3.5 s of synchronous GPU work here, whatever Hearth does around it | the scene's code (bundled gallery data): left; see "What's left" |

## The fixes
1. **Shaders ready before a layer's first frame, hidden things included** (`instrument()` in the preview page).
   - Where the graphics card compiles in the background (KHR_parallel_shader_compile: every desktop GPU, D3D11
     included), *every* new layer now waits for `compileAsync` before its first draw. Before, only a covered one did.
     That includes a new layer wiping in, a filter added on top and a scene's first run. The other layers keep drawing
     meanwhile. Then its textures are uploaded (`initTexture`) in that same task, off the frame, and it draws.
   - Without background compiling (a software GPU), the scene is compiled in one go (`renderer.compile`) just
     before its first draw. Hidden objects are included, because three's `compile()` walks hidden objects too.
   - So an object hidden at the start and shown on a drop costs no compile when it shows: 1 compile frame → 0.
2. **Double-buffered scene switch** (`swapLayers`).
   - The old scene's layers leave the page's layer list but **keep running and drawing on top**. Their boxes sit above
     the new ones, nothing about them is counted or adapted, their sliders keep their values and their timers stay
     theirs.
   - Underneath, the new scene loads, compiles in the background and uploads its pictures. Once every new layer has
     drawn, the old scene fades out while still moving (the Stage's crossfade time, else 0.42 s). Then it is let go:
     its contexts go back to the pool, its listeners, timers and blob URLs are dropped.
   - Measured with it forced on here: the longest time nothing on screen moved during a switch, median over the five
     switches, went from **1.27 s to 0.48 s** (Chrome blob 3.5 → 1.8 s, galaxy 0.93 → 0.40, beat burst 0.83 → 0.43,
     kinetic opener 1.40 → 0.48, spectrum crown 1.27 → 0.55).
   - It is used **where shaders compile in the background** (`auto`, the owner's card). A software GPU compiles on the
     page's own thread, so there the old scene would stutter along with every compile instead of standing still. On
     this machine `auto` therefore keeps the still picture, and the check forces it on to measure it.
   - It falls back to the still picture when both scenes share layer ids (the same scene run again), when they would
     need more than 13 WebGL contexts together (Chromium keeps 16 a page), and during a recording or render, ▶ Play, a
     sequence, precomps or the scene editor. `window.__labSwap.state()` says which, and how long the switch held.
   - When the old scene keeps drawing, a new scene may take up to 6 s to be ready (it was 1.8 s with the still
     picture): nothing on screen is frozen meanwhile.
3. **Big pictures uploaded right after a frame** (`upRelease` / `upAhead`). A decoded picture of ≥ 1 MP is still
   handed over one per frame. The hand-over now happens in a task queued from the frame, right after it, and the upload
   is made there with `initTexture`, on each renderer whose scene uses that texture. With the preview at 60 on a 240 Hz
   screen, that leaves three free refreshes after each drawn frame, and the upload lands there instead of making the
   next frame late. In-frame uploads went from 33.6 MP to 0. Here the software GPU still spends ~2 s per 4K picture
   whatever frame it lands in. On a real card a 4K upload is a few ms.

## Before → after (labfps89, base 8de32ea + recorder vs this branch; frame gaps in ms at 480×270, SwiftShader)
| Stretch | p50 | p99 | Over 2× budget (the app's) | Compiles on screen | MP uploaded inside frames | Picture stood still (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Steady, 6 demo scenes (worst) | 33–100 → 50–83 | 66–233 → 67–200 | 3 (0) → 2 (0) | 0 → 0 | 0.2 → 0.2 | — |
| Switch, still picture (median of 5) | — | — | — | — | — | 1083 → 1267 ¹ |
| Switch, double-buffered (median of 5) | — | — | — | — | — | (n/a) → **483** |
| Switch, Chrome blob (its own 3 s setup) | — | 3550 → 1817 | 2 (2) → 2 (2) ² | — | — | 3933 → **1817** |
| Code edit (hot re-run) | 33 → 33 | 117 → 117 | 5 (0) → 3 (0) | 0 → 0 | 0 → 0 | 117 → 117 |
| Hidden object shown mid-scene | 50 → 50 | 100 → 117 | 2 (1) → 1 (0) | **1 → 0** | 0 → 0 | — |
| Two 4K pictures arriving | 50 → 50 | 1483 → 1967 ³ | 7 (4) → 4 (1) | 1 → 1 | **33.6 → 0** | — |
| Bloom filter added | 50 → 50 | 483 → 667 | 3 (1) → 1 (1) | 1 → 1 ⁴ | 0 → 0 | — |
| Bloom hidden / shown | 50 → 50 | 167 → 150 | 1 (0) → 2 (0) | 0 → 0 | 0 → 0 | — |
| Song loaded / played | 83 → 83 | 367 / 150 → 417 / 133 | 4 / 0 (0) → 5 / 0 (0) | 0 → 0 | 0 → 0 | — |
| GC (gcchurn60 Lab, Hearth's bytes a frame) | — | — | — | — | — | 635 B (budget 1024) ⁵ |

¹ The same path both times (the still picture). The difference is noise on this machine: SwiftShader's frame times
swing 1.5–2× between runs, so p99 and still times of single stretches are not comparable across runs. The counts are.

² The Chrome blob's own module builds its reflections with synchronous GPU work (1–3 s here). The old scene can't
draw during it, because it is the page's own thread. On a real GPU it is a few ms.

³ The upload itself still takes ~2 s of SwiftShader's time per 4K picture, wherever it lands. What changed is that
it is no longer inside a frame's render (0 MP), so on a real GPU it uses a refresh the preview leaves free.

⁴ Without background compiling (here) the new layer's programs are compiled in its setup frame, and the rest of the
preview waits that frame. On the owner's card, the filter now waits for its shaders and the rest keeps drawing.

⁵ After only (this branch). The game's own garbage is 168 KB a frame, so a GC pause comes from the scene's three.js
uniform copies, not Hearth's code.

### GC
gcchurn60 (Lab part, `GC60_ONLY=lab`) on this branch: ✓, Hearth's own code 635 B a frame (budget 1024; the self-test's
pretend hook reads 1460). This round adds no per-frame allocation (the recorder is off unless a check turns it on;
`upAhead` / `sceneUses` run once per big picture, the warm-up once per renderer).

## The check: `dev/checks/labfps89.js`
Budgets (counts, steady under load):
- double-buffered switches keep drawing (no fallback), and the median still time is lower than with the still picture;
- shaders compiled ahead: none in a frame on screen where the GPU compiles in the background, else one setup frame
  per new layer;
- a hidden object shown mid-scene compiles nothing, and a filter hidden / shown compiles nothing;
- big pictures go up one a frame, outside frames (`ahead` ≥ 2, 0 MP inside frames);
- each stretch has at most 1 hitch judged the app's;
- steady p99 ≤ 2× budget, unless every frame over it is can't-tell.

`window.LF89_REPORT = 1` only reports. `LF89_ONLY`, `LF89_SCENES` and `LF89_SIZE` narrow it. `dev/labfps72-test.js`
now also checks that the big-picture hand-over waits until after the frame.

Runs on this branch (`flock /tmp/hearth-run.lock node dev/run-checks.js --exact …`, ≤ 5 a run):
- labfps89 ✓ (with can't-tell lines: frames where the preview waited for the software GPU on a busy box);
- labpace ✓, labboot ✓, labstartfast ✓, labshader ✓, gcchurn60 (Lab part) ✓;
- nodes-shader ✓, gpuload84 ✓, gamemode ✓, lazy ✓;
- unit: datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, boot-test, lazymanifest-test,
  labfps72-test ✓.

## What's left
- **The real card's numbers.** Everything here is SwiftShader. Still to measure on the owner's PC:
  - the double-buffered switch, which only turns on with background compiling;
  - the D3D11 compile times;
  - a 4K upload in a free refresh.

  See the Windows test plan section below.
- **Materials made while a scene runs** (a new material created on a kick, a light added, which recompiles every
  material's program) still compile on first use. Hearth can't know them ahead without running the scene's code.
  Glass (`transmission`) materials make three draw the scene once more into a buffer with other shader variants: those
  variants are not covered by the precompile either.
- **A scene's own heavy setup** (PMREM `fromScene` in the module, big geometry built at the top level) still blocks
  the page while it runs. The old scene covers it on a switch. The bundled Chrome blob / Molten gold could build their
  reflections once and keep them. That is gallery data (another stream's), left as a suggestion.
- **Uploading a 4K picture in slices** (rows over several frames) would need three's internals for an ImageBitmap
  texture. It wasn't done: on a real card the upload in a free refresh should be enough. The real-GPU report will say.
- **▶ Play** keeps its own getting-ready (round 52: everything compiled and uploaded before play). Not changed.

## Windows test plan section
Added to `docs/windows-test-plan.md` as "## 7. Lab hitches (round 89)".

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **Switching scenes in the Lab no longer freezes the picture.** The scene you're leaving keeps moving until the new
  one is completely ready, then fades into it. Before, the old picture stood still for up to a few seconds while the
  new scene got ready.
- **No more stutter when something appears mid-show.** Things a scene shows later (on a drop, on a kick) are prepared
  when the scene starts, so they no longer make the picture stick the first time they appear.
- **New layers and effects come in smoothly.** A layer or an effect you add waits until it is fully prepared before
  it shows, and the rest of the picture keeps moving meanwhile.
- **Big pictures arrive without a jolt.** A large image is sent to the graphics card between two frames, not in the
  middle of one.
