# modelcompile101 (round 101): a new layer's shaders made between frames, on a card without background compiling

Round 100 (`modeltex100.md`) left one thing open. When a new layer was added to a scene already on screen, and the
graphics card couldn't compile shaders in the background (no `KHR_parallel_shader_compile`), round 89's rule compiled
the layer's whole first scene **inside its first frame**. Every layer already on screen stood still for that frame.
A 🧊 model layer made 3 programs there. A layer with many materials made far more: one frame of 4.6 s on this machine.

That rule only applies where background compiling is missing. This includes this test machine (SwiftShader), many
Macs, and some laptops. The owner's RTX 4080 has background compiling. There, round 89's other path (`compileAsync`
while the layer waits) already ran, so nothing changes on the PC.

Nothing is added to any prompt (0 tokens). There is no new button or setting. Mac and Windows run the same code. The
app change is in the Lab's preview page (`tools/three-sandbox.html`, loaded lazily outside the first screen, so the
start budget is unchanged). The owner's scene and game files are not touched.

## What changed
**A new layer added to a scene on screen waits while its shaders are made between frames** (`wgStart` / `wgGap` /
`wgDone`, "a new layer's first frame without background compiling" in the preview page). This is the approach
labcompile90 uses for things a running scene adds, and it reuses that code (`lcHas`, `lcGlass`, `lcShadows`, the
program-status read):
- The new layer's first draw is held. Its canvas stays empty, and the layers under it keep drawing.
- In the task right after a frame (the gap before the next one), its things are compiled one at a time with
  `renderer.compile(object, camera, scene)`. Each new program's link status is read there, so the wait for the driver
  happens in the gap and not in a frame.
- **Spread over several gaps:** a gap stops after about 8 ms of work (at least one program each time). The rest waits
  for the gap after the next frame. On this software GPU every program costs more than 8 ms, so it is one program per
  gap. On a Mac's GPU several fit in one gap.
- Then, each in a gap: the glass variants (`lcGlass`), three's shadow-pass materials (`lcShadows`), the textures
  (`rdyTextures`).
- The layer draws on the next frame. Anything added to its scene while it waited (a 🧊 layer's model arriving) goes
  through the same gaps first.
- Nothing waits more than 6 s. After that the layer draws and compiles what's left in its frame, as before.
- A sketch that draws only once (no frame loop) gets that one frame drawn once its shaders are ready.

**When the old rule stays (decided, see "The Lab's first open"):** when no other layer is on screen yet. That covers
the Lab's first scene (its first layer to draw) and a scene switch under the old scene's still picture. A compile in
that frame stops no moving picture, so holding the layer would only show it later.

`window.__labWarmGap.state()` reports what happened (`held`, `oldRule`, `gaps`, `programs`, `late`, `last`: the last
layer's hold in ms / frames / gaps). `.mode('auto' | 'on' | 'off')` is for checks: `off` is round 89's rule (the
"before"), `on` also holds a Lab's first scene.

## Before → after
Measured with labcompile90's new `layer:*` stretches (below), at 480×270 on this machine (SwiftShader, no
background compiling, 4 shared CPUs). "Before" is the same build with `__labWarmGap.mode('off')`, which is round 89's
code path exactly. "After" is the default.

| A new layer added to a moving scene | Compiles / links inside frames on screen | All compiles / links | Longest frame, ms | Late frames over 2× (the app's) | The layer waited | Gaps used |
|---|---:|---:|---:|---:|---:|---:|
| `layer:plain` (2 materials, lit) | **6 → 0** | 6 → 6 | 483 → 450–783 ¹ | 3 (1) → 2–4 (0) | 0 → 2 frames (200–400 ms) | 0 → 3 |
| `layer:model` (a 🧊 model layer) | **3 → 0** | 30 → 30 | 2767 → 2700–2750 ² | 5 (1) → 6 (0) | 0 → 2 frames (≈ 600 ms) | 0 → 3 |
| `layer:heavy` (12 materials, glass, shadows) | **72 → 0** | 72 → 75 ³ | **4616 → 1783–1850** | 3 (1) → 4–5 (0) | 0 → 14 frames (≈ 2 s) | 0 → 15 |

"After" is two runs (the check alone, then in the final batch); where they differ, both ends are shown.

¹ This machine's frame times swing 1.5–2× between runs (labfps89 ¹). Every late frame after this round is judged
"can't tell (load)": 0.5–12 ms of the preview's own CPU. The counts are what compare.

² The 🧊 layer's longest frames, before and after, are its own setup: the studio reflections it builds
(`PMREMGenerator.fromScene`) and the model's arrival. They are synchronous GPU work in the layer's code, judged "load"
both times. The compile frame (3 programs, judged the app's before) is gone.

³ Three programs more: the shadow-pass materials, made in a gap by one draw into a 1×1 target (labshadow91's
`lcShadows`), plus one cheap program for that draw. Before, the shadow pass made its own inside the first frame.

Late frames, each judged on CPU (round 88's load-aware rule, as in labcompile90):
- Before: in each stretch, one late frame was the app's: the frame with the compiles inside it.
- After: none. Every late frame left is "can't tell (load)": 1–12 ms of the preview's own CPU, the rest waiting for a
  CPU or for the software GPU process, which compiles right after the gap on these 4 busy CPUs.

The heavy layer shows that the compile time doesn't go away on a software GPU. It moves out of the frame and is spread
over 15 gaps, so the picture underneath keeps moving, if slowly here. On a real GPU without background compiling (a
Mac), one program takes a few ms to tens of ms, and the layer shows a few frames later with no stuck frame.

modeltex100 on this round's code: every model layer's own start compiled nothing inside a frame on screen
(`layerStartCompiles` 0 for `add:car`, `add:robot`, `add:chair`, `hook`; it was 3 per 🧊 layer in round 100). Each
🧊 layer waited 2 frames (480–640 ms here) in 3 gaps.

## The Lab's first open
Holding the very first scene costs more than it saves. Nothing else is on screen to stutter, and holding it adds a
frame plus the gaps before the picture. Measured with `labboot`, `labstartfast` and `labload94`, with the mode forced
three ways (one run each, same machine):

| Lab open (ms, first picture of the right scene) | `off` (round 89's rule, = before) | `auto` (this round's default; 2–3 runs) | `on` (first scene held too) |
|---|---:|---:|---:|
| labstartfast cold open | 1711 | 1404–1608 | **2334** |
| …its CPU, all processes | 4660 | 4050–4470 | **6370** (over the 6000 budget: fails) |
| labstartfast warm open | 1237 | 1040–1134 | 1202 |
| labstartfast open with a song | 2014 | 1500–1891 | 1594 |
| labstartfast back to the Lab | 109 / 116 | 115–141 / 122–168 | 131 / 192 |
| labboot open: shown / drawn | 160 / 843 | 155–158 / 812–1155 | 175 / 1052 |
| labload94 click → Lab on screen | 232 | 251–309 | 311 |
| labload94 project opened into the Lab | 5089 | 3452–5179 | 3646 |
| labstartfast heavy switch, first / correct | 2539 / 6868 | 2590–2722 / 3582–3647 | 3099 / 4904 |

- With the first scene held too (`on`), the cold open showed its first picture 0.6–0.9 s later (2334 ms against
  1404–1711), and its CPU went over labstartfast's budget (6370 ms against 6000; the GPU process spent 1.7 s more).
  That is the one clear difference in the table; the other rows are within this machine's noise.
- With the default (`auto`), a Lab open uses round 89's rule for its first layer, as before. The switches (all under
  the still picture) take the old path too. The differences between `off` and `auto` there are this machine's noise:
  single numbers swing 1.5–2× between runs (labfps89 ¹).
- A second layer of the first scene, drawing after the first one, is held: the first layer is moving on screen by then.

So the first scene of a Lab open keeps the old rule, and the owner won't notice a slower open.

## How it was measured
- **`dev/checks/labcompile90.js`** has three new stretches (`LC90_ONLY=layer`). Each adds a layer on top of a running
  lit scene, records the preview's frames with `__labHitch`, and judges every late frame on CPU:
  - `layer:plain`: a small lit scene (two materials);
  - `layer:model`: a 🧊 model layer (`ThreeModels.add` of a small `.gltf` written in the check's temp folder): its
    lights and shadow ground first, then the model;
  - `layer:heavy`: 12 kinds of material (physical with clearcoat / sheen / iridescence, toon, lambert, phong, matcap,
    normal, three shader materials, a wireframe), a glass sphere, a shadow-casting spot light.

  Budgets: 0 compiles inside frames on screen; the layer drew, after being held, with nothing timed out (`late` 0); at
  most 1 late frame judged the app's. `window.LC90_WG = 'off'` runs them with the old rule.
- **`dev/checks/modeltex100.js`** now also checks that each new layer's own start (`layerStartCompiles`) compiled
  nothing inside a frame on screen, and reports `wg` (the hold).
- **The Lab's first open:** labboot, labstartfast, labload94 with the mode set to `off`, `auto` and `on` in turn.

## Safety
- Only the Lab's preview page changes. The export page (exact frames: `fullRes`), sequences, ▶ Play's ready pass,
  helper renderers and renderers drawing into a target keep their paths (the same conditions as round 89's rule).
- Where the card compiles in the background (the 4080, D3D11), round 89's `compileAsync` path runs as before. This
  round's code isn't reached.
- Any failure falls back to the old behaviour: a compile that throws is left to the frame, a lost context lets the
  layer go, and after 6 s the layer draws whatever is left.

## What's left
- A Mac's real numbers: how many programs fit in one gap there, and how many frames a new layer waits. See
  `docs/windows-test-plan.md` §8.
- A scene's background picture (a texture or cube map as `scene.background`) makes its own program inside three's
  render. It still compiles in the layer's first frame, as before.

## For Codex
No Codex-owned file was edited. Also untouched: the creative-direction session's files, and chatsave101's files
(`native.js`, `store.js`, `storework.js`).

## Tests run (final code)
All under the run lock, at most 5 per run:
- `labcompile90` ✓ (with the new `layer:*` stretches), `modeltex100` ✓ (with the new start step), `labmodels99` ✓,
  `labfps89` ✓, `labboot` ✓ (one batch; can't-tell lines only: frames where the preview waited for the software GPU).
- `labstartfast`: ✖ once, then ✓. The failure was the main window's CPU before the Lab's scenes were read (182.7 ms
  against a 150 ms budget). That part runs before the preview page draws anything, so this round's code isn't in it.
  The other stream (chatsave101) had its perf run going on the same 4 CPUs at the time. The rerun passed (161.6 ms,
  judged load: the box was 1.2× slower than its fastest in that run).
- `labload94` ✓, `lazy` ✓.
- `unit:labfps72-test`, `unit:labshadow91-test`, `unit:labmodels99-test`, `unit:datasafe-scan`, `unit:winmac-test`,
  `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`, `unit:boot-test`, `unit:lazymanifest-test` ✓.
- The before / after and first-open runs above: `labcompile90` with `LC90_ONLY=layer` (`LC90_WG=off`, then the
  default), and `labboot labstartfast labload94` with the mode set to `off` and `on` in a scratch edit (not committed).
  The forced `on` run failed labstartfast's cold-open CPU budget, as reported above.

## For the patch notes
- **Adding a layer no longer makes the Lab preview stick, on computers that can't prepare shaders in the
  background** (many Macs, for example). A new layer, a 3D model or an effect-heavy scene now gets ready between frames
  while the rest of the picture keeps moving, then appears a moment later. Opening the Lab is as fast as before.
