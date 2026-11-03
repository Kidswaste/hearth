# labchecks109 (round 109): the Lab's checks run a scene like the owner's, and the preview guards itself against a runaway

Round 107's frame gate (fps107) shipped a runaway: in a Lab scene with two or more frame loops (an `onHit` and an
`everyBeats`, two animation loops), a frame the gate held answered the id `0`, the page's layer queue (`LQ.raf`) took
that as "no frame coming" and queued its flush again, the extra flushes ran the next frame's callbacks in the same
frame, which queued more: about 20,000 callbacks a second on the owner's machine, until the preview lost its graphics
context over and over. Round 108 (beat108) fixed it (`GATE_ID`). **fps107's check scene had one frame loop**, so no
check could see it. This round makes the Lab's frame-timing checks run a scene that looks like the owner's, proves
that scene catches round 107's bug, and adds a guard in the preview page so a runaway can't take the preview down
for the owner either.

## 1. The audit: what scene each Lab check uses
From each check's source (its scene code and what it drives). "Loops": the frame loops in its scene(s) (a three.js
`setAnimationLoop`, a raw `requestAnimationFrame` loop, the Lab's `onHit` / `everyBeats` / `onBar` helpers, each one a
loop of its own); "240": runs on a faked fast screen (the only place the frame gate turns on).

| Check | Scene(s) | Loops in one scene | Song | Sound-reactive code | Model | Layers | Sequence / show | 240 |
|---|---|---|---|---|---|---|---|---|
| **fps107** | one torus knot | **1** | – | – | – | 1 | – | ✓ |
| **beat108** | one cube + `everyBeats` + `onHit('beat')` | 3 | ✓ (generated) | ✓ (`audio.*`, ⚡ kick) | – | 1 | – | ✓ (and 60) |
| gpuload84 | the Kit / Shader nodes / Model viewer pickers, not a Lab scene | 1 | – | – | – | – | – | ✓ |
| **labfps89** | 6 bundled demo scenes (gallery), first-use / texture / bloom stretches, `beat-burst` with a song | 1 a layer (2–3 layers) | ✓ (one stretch) | demo layers only | – | 2–4 | – | – |
| **labcompile90** | one lit scene; added layers (plain, heavy, 🧊 model) | 1 a layer | – | – | ✓ (plain .gltf) | 1–2 | – | – |
| modeltex100 | an empty background + 🧊 models with 4K pictures | 1 a layer | – | – | ✓ (textured) | 2 | – | – |
| modelcompile101 (group) | runs labcompile90 / modeltex100 / labmodels99 | – | – | – | – | – | – | – |
| labmodels99 | 🧊 multi-file models | 1 a layer | – | – | ✓ | 1–2 | – | – |
| labchat92 / labchat102 | starter-style scenes made by the fake AI's calls | 1 | – | – | 102: ✓ | 1–2 | – | – |
| labsync87 / labsync88 | scenes / references / ⚡ triggers arriving by sync (no timing) | 1 | 88: a song's triggers saved | – | – | 1 | 88: stage set list | – |
| labboot | open / switch scenes from templates | 1 | – | – | – | 1 | – | – |
| labstartfast | simple + heavy scenes (shader, 2K picture, 🧊, 🅰, 📁 group), one with a song | 1–2 | ✓ | – | ✓ | up to 5 | – | – |
| labpace | animated / still scenes at 30 / 60 caps | 1–2 | – | – | – | 1–3 | – | (fake 30–240 in its own way) |
| perfectloop | a 9:16 scene with the loop helpers, no song | 1 | – | – | – | 1–3 | – | – |
| lazy | the Lab loading from a held lazy group (no scene timing) | – | – | – | – | – | – | – |
| labaudio77 / -long | two scenes reading `audio.*` | 1 | ✓ | ✓ | – | 1 | – | ✓ (clock only) |
| labaudio, beatlink, labvisualizers, labshapes, labkeys | one scene each with a song | 1 | ✓ | ✓ (most) | – | 1 | – | – |
| lab240gpu / labtype240 | FX stacks, 🅰 type over 3D, counted GPU work | 1 a layer | – | – | labtype240: ✓ | 3–5 | – | ✓ |
| lab240edit / labsmooth54 / labplay55 | Clink-like game scenes (shadows, 2K textures, 🧊, HUD) | 2–3 | 240edit / smooth54: ✓ | – | ✓ | 3–6 | – | ✓ (real 60 Hz, counted) |
| labfps72 (opt-in) | a stress scene | 1 a layer | – | – | – | many | – | – |
| labcanvas56, labdraw74, labgpu, labshader, labadapt, labgestures, labcamera, labdirect, labmaterials, labtools73, labcalls74, laberrors80, labbridge72, labload75, labload94, labdrop61 | one-purpose scenes (canvases, still frames, filters, shaders, input, materials, errors, loading) | 1–2 | – | – | some (labtools73, labmaterials, labbridge72, labload75, labdrop61) | 1–3 | – | – |
| labscrub | a 4-minute song under 8 layers, 4 keyframed | 1 a layer | ✓ | – | – | 8 | – | ✓ |
| labperf | filter layers with a song | 1 | ✓ | – | – | 3 | – | – |
| labframes*, labcut-edit, labeasy, labsearch, labtemplates, labvariations, labrecipes, labexport, labmemory | footage, editor, renders, menus | – | some | – | – | – | **sequences / renders** | – |
| labstage, labcalm, labframes-lib | the live stage, the Lab at rest | 1 | some | – | labcalm: ✓ | 1–3 | **show** (labstage) | – |
| labhub, labbatch | the hub side of slider drags, batches | 1 | ✓ | – | labhub: ✓ | 1–3 | – | – |

What this shows:
- **No frame-timing check ran a scene with two or more frame loops on a fast screen** before beat108 (whose three
  loops found the runaway by accident, in its own first runs). fps107, the gate's own check, had one.
- The checks that run several loops (lab240edit, labsmooth54, labplay55, labscrub) run on a 60 Hz screen or count work
  per drawn frame: the gate never turns on there.
- Songs, models, multiple layers and filters are each covered somewhere, but **never together** in a check that times
  frames; nothing ran the Lab's beat helpers (`onHit` / `everyBeats` / `onBar`) next to a model and a filter.
- The sequence and the show (stage) turn the gate off by design (`gateMs`): they were not part of the runaway.

## 2. The fixture: one shared real scene (`dev/checks/realscene-lib.js`)
`RS`, a helper put in front of any check that uses `RS.…` (dev/smoke.js's AUTO list; listed in run-checks.js's
LIBS, not a check). It builds, from the bundled **Beat burst** demo scene (never an owner's scene; files in the
check's own temp folder):

| Layer | What it is | Its frame loops |
|---|---|---|
| Backdrop | the demo's liquid-gradient shader | its animation loop |
| Beat burst | the demo's particles bursting on the kick (Particles slider at 4 thousand: see below) | `setAnimationLoop` |
| 🧊 RS bot | a lab3d model layer: a `.gltf` with its `.bin` in `buffers/` and a 1024² colour picture in `textures/`, turntable, pulse and glow on the kick | lab3d's per-frame model update |
| Beat rig | its own renderer with a **raw `requestAnimationFrame` loop**, plus `onHit('kick')`, `onHit('snare')`, `onHit('beat')`, `everyBeats(2)`, `onBar` | **6** |
| ✦ Bloom | the demo's post-processing filter, on top | the filter pass |

plus **a song** (124 BPM, generated: a kick on each beat, a snare on 2 and 4, hats on the eighths), analysed, with
**⚡ kick / snare / hats triggers** set on it, playing. Ten frame loops of the scene's own, five layers.

- `RS.install()`: a **switchable** fake screen in every preview page made from then on (fps107's: frames on a
  240-a-second grid while the page is really drawn; off, i.e. the real screen's frames counted, until `RS.hz(240)`).
  Checks with their own fake screen (fps107, beat108) keep theirs.
- `RS.open()`, `RS.watch(ms)`: plays and measures the page's frame callbacks a second and per page frame, the guard's
  state, graphics-context events (`hearth:lab-gl`, `ThreeLab.gl.state()`), the frame-runaway notes, and that the rig's
  loops ran (raw loop, `everyBeats`, `onHit('kick')`).
- `RS.problems(w)`: the bounds every check asserts: **≤ 24 frame callbacks per page frame** (the page runs 4 of its own
  loops a frame with this scene; round 107's runaway was ~285 here), **≤ 24 × 240 a second**, the guard **never
  tripped**, no loop over 4× the screen's rate nor more than 4 times in one frame, no frame-runaway note, **no
  graphics context lost**, the preview drew, the scene's loops ran.
- The frame is 192×108 and the particles 4 thousand: this machine's software GPU has to keep up with ~60 drawn frames
  for the gate to hold frames between them, which is where the runaway was (at 480×270 with 30,000 particles the page
  drew ~30 a second, the gate almost never held, and round 107's bug didn't show).

## 3. Where it runs now
| Check | What was added |
|---|---|
| fps107 | `labReal`: the real scene playing on its 240 Hz screen: `RS.problems`, and ≤ 2.5 page frames per drawn one (the gate still rests) |
| beat108 | the real scene at 240 Hz with its song: `RS.problems`, ≤ 2.6 page frames per drawn one; then **the guard against round 107's answer** (below) |
| labfps89 | `real`: the real scene on a 240 Hz screen (the fake screen on for this stretch only), its hitches judged as every stretch's, `RS.problems` |
| labcompile90 | `layer:real`: a new layer started in the real scene on a 240 Hz screen (the frame gate and a new layer's start together): the layer:* rules (0 compiles inside frames on screen, programs made in the gaps) and `RS.problems` |

(labcompile90's layer:* stretches are what modelcompile101 runs; the others that start a layer, modeltex100 and
labmodels99, add models to a single still layer with no song: the frame gate is never on there.)

## 4. The guard in the Lab page (`tools/three-sandbox.html`, "the frame runaway guard")
Its own marked block after the frame gate, called from three marked hooks (the wrapper in `realRAF`: `runSeen` /
`runCount`; `RUN.tripped` in `gateMs`; and `RUN.bug107`, a checks-only switch, in the gate's two "held" answers). Each
of the page's frame loops (its wrapper, made once) counts its calls in a window of about a second and its calls in the
current frame. At each window's end (on the next frame) it is **hot** when:
- the busiest loop's calls a second are over **4 × the screen's rate** (the frames seen in the window, the gate's learnt
  screen frame, at least 60): the owner's case, 20,000 a second on a fast GPU; or
- any loop ran **more than once in one frame** (a loop runs once a frame). This second test was needed: on a software
  GPU each runaway call draws, so frames slow down as it grows; round 107's runaway stayed under 4× the screen's rate a
  second here while running the layer flush ~285, then thousands of, times a frame.

Meanwhile a loop's calls **past 4 in one frame are dropped at once**: without that, a runaway on this machine grew to
a single frame of minutes before any window could end, and the page stopped answering (the first try of the guard
tripped too late: 10,000 calls in one frame, and the page never drew again). Hot for **2 s** in a row: the page posts a
calm line to the Lab's console and a `frame-runaway` message (the Lab keeps the last ten in
`ThreeLab.gl.state().runaway` and logs it), **drops the frame gate for good** (the plain `requestAnimationFrame` path),
lets out what the gate held, and from then on runs each loop at most once a frame. Normal use: three counters and two
compares per frame callback, a few divisions a second; a normal scene never trips it (peak 1 call per loop per frame
in every run here). `window.__labRunaway` is the checks' view (`state`, `reset`, `bug107(true)`: held frames answer
round 107's `0` again).

With round 107's answer switched on in the real scene (a diagnostic run, 240 Hz): the busiest loop reached 40 calls a
frame (capped at 4 run), the guard tripped after **2.2 s**, and the page went straight back to ~160 frames a second with
4 callbacks a frame, its raw loop and beat helpers running, no graphics context lost. beat108 now checks exactly that
on every run.

## 5. The proof: it would have caught round 107's bug
RESULTS_PROOF

## Runs
RESULTS_RUNS

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **Behind the scenes: the Lab's speed checks now play a scene like yours.** Several layers, a 3D model with its
  picture, a glow filter, a song with ⚡ triggers and several things following the beat at once, on a fast screen. The
  bug from two updates ago (a scene with two or more beat reactions made the preview work harder and harder until it
  restarted) passed the old checks; these ones catch it.
- **A safety net in the preview.** If the preview ever starts asking for pictures far faster than your screen can show
  them, it notices within two seconds, says so in the Lab's console, and goes back to its plain way of drawing, so it
  keeps running instead of losing its graphics card and restarting.
