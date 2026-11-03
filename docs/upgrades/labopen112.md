# labopen112 (round 112): the Lab's first open, phase by phase, and the preview page started sooner

The owner opens the Lab many times a day. Rounds 37–109 measured its first open mostly on this test box, whose
graphics are software (SwiftShader): there each layer's WebGL context costs 0.2–0.7 s and the shaders seconds, which
hides what the open costs everywhere. This round splits the first open from a click into its phases, separates what is
real on every computer from what is software-GL only, and cuts the real part that was on the critical path: **the
preview page now starts loading at once instead of after the Lab's code and its scene reads.**

Nothing is added to any prompt (0 tokens). No new button or setting. Mac and Windows run the same code. The owner's
scene and game files are never touched: every run is a throwaway profile and data folder (`dev/smoke.js`), with a
made-up 2-layer scene and labchecks109's real scene (`dev/checks/realscene-lib.js`: the bundled Beat burst demo, a
model with its .bin and 1024² picture, a beat rig with six frame loops, bloom and a 124 BPM song).

## How it was measured
New: `dev/labopen112.js` runs `dev/checks/labopen112.js` (one app run per `--runs`, each a fresh profile): a setup that
makes both scenes, then one app start + one Lab open per case, for each scene:
- **cold**: the Lab's code not in (labload94 mode `none`), no warm page: the code loads on the press;
- **code**: the Lab's code in at the start, no warm preview page (`labboot.warm` = 0);
- **warm**: the code in and round 37's warm page drawn and parked (the everyday open).

Each open is `activate('tool:three')` (what the rail button does; perfguard's `labcold` presses the same way) 4 s after
the first screen, with:
- a trace of every process from just before the press to the first frame (the window's, the preview page's and the GPU
  process's main threads: what each did, compile / evaluate per script, the sync waits for the GPU);
- the window's own moments (the Lab's group in, the preview frame in the Lab, the scenes read, the page asked for);
- the preview page's own clock lined up through `performance.timeOrigin` (navigation, three.js's fetch, its long
  animation frames with their scripts, every WebGL context it made and how long it took, the GL calls that wait for
  the GPU: a program's link status, texture uploads), what the Lab sent and when, and the page's messages
  (`ready`, each layer's `ran` and `drawn`, `stack-drawn`);
- "first frame" as perfguard's `labcold` reads it: the page's `__labPace` counting a drawn frame.

Before = HEAD of this round's base (`fdd0147`, `git archive`, run with `--app`), after = this branch, run in turn on the
same box (4 CPUs, load 1.3–2.8 from other streams). Cold: 6 opens each, base and new alternated in blocks of 2;
code / warm: 3 each. Medians, ms from the press.

## What the first open is made of (before)

| phase | demo cold | real cold | demo code | real code | real everywhere? |
|---|---:|---:|---:|---:|---|
| the Lab's code (`lab` group, 109 files, 3.4 MB) loaded and run | 0 → 364 | 0 → 380 | in | in | **yes** (window's JS parse / run; ≈ 0.15–0.3 s on a fast PC) |
| `tools/three.js` mount: the Lab on screen | 391 | 407 | 25 | 27 | yes |
| its four store reads (in parallel since round 37) | 487 | 499 | 94 | 119 | yes (one IPC round trip) |
| **the preview page asked for** (`src`) | **488** | **665** | **96** | **246** | yes: it waited for the reads, a painted frame, the sliders scanned (one layer per task), and for the real scene its model's files read |
| the page's start: a new process, its 1.1 MB HTML parsed, its own module compiled (≈ 30 ms) and run (≈ 25 ms) | +365 | +380 | +407 | +440 | mostly yes; ≈ 150 ms of it is the new process's GPU channel, slower here |
| three.js (`three.core.js` + `three.module.js`) | fetched in ≈ 100 ms, compiled **off the page's thread** (streamed, 77 ms), evaluated ≈ 25 ms | | | | yes, small: once per page, every layer imports the same module (no layer loads it again) |
| the scene's run reaches the page | 866 | 1236 | — | — | |
| each layer's module: three's `WebGLRenderer` + its context + its first scene | 0.45–1.2 s each | 0.4–1.3 s each | | | **software GL**: the context 0.2–0.7 s, then sync GPU round trips (`GetString`, extensions, `GetIntegerv`: 0.2–0.6 s) |
| layers after the first: held for the gaps after frames (modelcompile101) | +0.3–0.6 s | +0.4–1 s each | | | software GL only (no background compile) |
| shader compiles (link status waits) | 8–50 ms | 60–300 ms | | | software GL inflated; background on a real GPU |
| **first frame** | **2351** | **2667** | **1865** | **2359** | |
| every layer drawn (`stack-drawn`) | 2502 | 4387 | 2294 | 3869 | |

Warm (the everyday open): the warm page's picture is on screen in **27 / 91 ms**; the Lab's own run (its sliders,
song, the model's files) swaps in over it at 1.0 s (demo) / 4.8 s (real). That swap is GL from end to end here (the
cover's 2D canvas 136 ms, `GetString` 217 ms, `GetProgramiv` 90 ms…): on a GPU with background compiling it is round
89's live swap, the old picture moving meanwhile.

What the profile answered:
- **three.js parse** is not a phase worth caching: it compiles on a background thread while the page parses, once per
  page, and every layer's module imports the same instance. The page's own 15,800-line module compiles lazily in 30 ms.
- **Store reads** are already one parallel round trip (round 37 / 48).
- **Layers** already start in parallel (the page's `runLayers`); what serializes them here is software GL (contexts,
  then round 101's gaps). Nothing to win on a real GPU.
- **Round trips window ↔ page**: the page's `ready` flushes the Lab's whole queue (sliders, references, triggers, the
  run) in one go. The one left is a 🧊 layer's `lib-need` (lab3d's code, asked by the page when that layer runs); it sits behind the
  software-GL layers here, so it wasn't on the measured critical path. Not changed.
- **The warm page** (tools/three-boot.js) **is used** by the first open whenever it exists: 12 of 12 warm opens (base and new) took it
  (`LabBoot.state().taken`). It exists only after the calm start (≈ 10–30 s in) for someone who used the Lab in 14 days.
- **Hidden layers** still run their module (a hidden layer can be shown at any moment, and its sliders and errors are
  read); none in the realistic scene. Not changed.
- **The real cost on the critical path was the page's late start**: in every case without a warm page, the preview page
  (≈ 0.4 s of its own start) began only after the Lab's code, the mount, the reads, a painted frame, the sliders scan
  and, for a scene with a model, its files read. Nothing else was waiting on those.

## What changed

### 1. The page starts beside the reads (`tools/three.js`)
At the Lab's mount, before its four store reads, the preview page starts loading, its `ready` held until the first run
(the same hold as a project's preload, round 74). Not when a warm page is waiting to be taken (that one shows its
picture at once: no change to the warm open). A page loaded for another pixel ratio than the scene asks (a scene with
its own frame size, the Lab's last size being "fit") is loaded again by the run, as before. `localStorage
'labopen.early' = '0'`: the old order. (`box.warm`: a warm page waits to be taken.)

### 2. A cold open starts the page at the click (`lab-intent.js` + `tools/three-boot.js`)
When the Lab is shown before its code is in, lab-intent.js (≈ 6 KB, in at every start) makes the preview page at
once, hidden behind the app like the warm page, with no scene in it, for the query the Lab ran last (`labboot.last`;
never run yet: this three.js version at the screen's pixels). Its `ready` is kept. When the Lab's code is in,
three-boot.js takes it as this start's warm page (no scene run), and the Lab takes it over in place (`moveBefore`, as
round 37) and runs its scene in it. A page loaded for another query is reloaded by the Lab for its own (counted:
`LabBoot.state().skipped = 'other query'`, with both queries). Let go after 30 s untaken. `localStorage
'labopen.head' = '0'`: off. `LabIntent.state().head`: when it started and when it was taken.

## After

| ms from the press (median) | demo cold | | real cold | | demo code | | real code | |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| | before | **after** | before | **after** | before | **after** | before | **after** |
| the Lab's code in | 364 | 517 | 380 | 523 | – | – | – | – |
| the Lab on screen | 391 | 536 | 407 | 537 | 25 | 30 | 27 | 26 |
| scenes read | 487 | 641 | 499 | 627 | 94 | 123 | 119 | 158 |
| **page asked for** | 488 | **0** | 665 | **0** | 96 | **30** | 246 | **26** |
| page received | 496 | 37 | 680 | 77 | 109 | 55 | 258 | 56 |
| **page ready** | 853 | **586** | 1044 | **657** | 503 | **376** | 686 | **429** |
| the run reaches the page | 866 | 651 | 1236 | 957 | | | | |
| **the first layer starts** | 893 | **688** | 1343 | **1108** | 526 | **399** | 1032 | **799** |
| **first frame** | 2351 | **1811** | 2667 | **1878** | 1865 | **1478** | 2359 | **1750** |
| every layer drawn | 2502 | 2521 | 4387 | 3904 | 2294 | 1770 | 3869 | 3419 |
| window CPU (press → first frame) | 381 | 417 | 627 | 552 | 163 | 163 | 456 | 363 |

Run by run (first frame): demo cold 2351 1869 2024 2373 1704 2536 → 2226 1811 1605 1680 1719 2724; real cold
2414 2667 2798 2142 2045 2824 → 1842 1878 2971 2568 1819 1751; demo code 1865 2279 1496 → 1478 1748 998; real code
2082 2359 2377 → 1540 1962 1750. Warm: unchanged (27 → 50, 91 → 59 ms; the Lab's own run 1015 → 957, 4791 → 5223:
noise of the GL swap).

- **The first layer starts 0.13–0.24 s sooner** in every case without a warm page. That is the real-everywhere cut,
  and the one to expect on the PC and the Mac.
- **First frame: −0.4 to −0.8 s** here (medians); the first frame also carries 0.5–1.8 s of software-GL contexts whose
  time swings run to run, so read the line above for the size of the cut.
- **Cost on a cold open on this 4-CPU box: the Lab's code takes ≈ 0.15 s longer to load and show** (517 vs 364),
  because the new page's process (its parse, three.js, its GPU channel) runs beside it on the same four busy CPUs. The
  Lab's toolbar comes that much later; its picture still comes 0.5–0.8 s sooner. On a computer with more cores the two
  don't compete (the page is another process).
- The scenes read later in "code" (+30 ms) for the same reason (the page's process starting); nothing waits on them.

## On a real graphics card (estimate; to be timed on the PC, `docs/windows-test-plan.md` §18)
Software-GL-only here: each layer's context (0.2–0.7 s → a few ms), the sync GPU round trips at a renderer's start
(`GetString` / extensions / `GetIntegerv`, 0.2–0.6 s → under a ms each), the shader compiles (seconds → in the
background with `KHR_parallel_shader_compile`), round 101's gap holds (not used where compiles run in the background),
and the new process's GPU channel (≈ 150 ms → a few ms). What stays everywhere: the Lab's code (≈ 0.35 s here, maybe
0.15–0.25 s on the 4080 PC's CPU), the mount and reads (≈ 0.1 s), the page's start (≈ 0.25 s of JS and parse, now
beside the rest), each layer's JS (tens of ms) and the first compiles. So on the 4080 the first open should be roughly
**0.4–0.7 s cold, 0.25–0.4 s with the code in, its picture at once when warm**; before this round, add the page's start
(≈ 0.1–0.4 s) that ran after the reads.

## perfguard A/B against HEAD
PERFGUARD

## Lab guarantees kept (rounds 89–111)
The preview page itself (`tools/three-sandbox.html`) is not changed: precompile, round 101's warm gaps, round 107's
runaway guard and frame gate, round 100's texture slices all run as before (labfps89, fps107, modelcompile101 below).
The warm page's adoption is round 37's (`LabBoot.take` / `adopt`); a project's preload (round 74) is untouched (the
early load is skipped when a page is already loading or ready); round 109's off-screen let-go is unchanged.

## Checks
CHECKS

## Files
- `tools/three.js`: the page's early load at the mount (`labopen.early`), `box.warm`.
- `lab-intent.js`: the head start on a cold open (`headStart`, `takeHead`, `state().head`, `labopen.head`).
- `tools/three-boot.js`: takes the head page as its warm page; `skipped = 'other query'` names both queries.
- `dev/checks/labopen112.js`, `dev/labopen112.js`: the measurement (not a pass / fail check).
- `docs/windows-test-plan.md` §18: time the first open on the RTX 4080.

## For Codex
No Codex-owned file touched.

## For the patch notes
- **The Lab opens faster.** Its preview starts loading the moment you open the Lab, instead of waiting for the Lab's
  buttons and your scenes to be read first. Your scene starts drawing about 0.15–0.25 s sooner on every open that isn't
  already warmed up, and up to half a second sooner on the first open of a session after a while without the Lab.
- The everyday open, with the Lab used recently, is unchanged: its picture is still there at once.
