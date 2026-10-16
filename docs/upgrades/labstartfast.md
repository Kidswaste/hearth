# labstartfast (round 48): the Lab opens and switches scenes faster

Goal: the Three.js Lab opens faster (cold, warm, with a song, back from a chat) and switching scenes reaches the right
picture sooner, especially heavy scenes (references, 🧊 models, 🅰 text that moves, 📁 groups) added since rounds 37–46.
Nothing on screen changes and there is no new setting. Nothing goes into any prompt (0 tokens).

Where it lives: `tools/three.js` (openSketch: references before the run; the Lab's first reads; `laterReads`),
`tools/three-media.js` (the overview row while a song loads; same frame size → no relayout), `tools/sandbox-lab3d.js`
(the decoders a model needs), `tools/three-nodes.js` (filter types on first use), `dev/checks/labstartfast.js` (new),
`dev/run-checks.js` (lab group + a `labstartfast` group).

## How it was measured
`dev/checks/labstartfast.js` builds a throwaway store the size of a real one: 40 older scenes of two layers, a JPEG
picture of each, 20 versions of each. On top come two simple shader scenes and two heavy ones (a shader, a 2048² picture
reference, a 🧊 GLB model, 🅰 "START FAST" word by word, two layers in a 📁 group), plus a scene with a 20 s song. Then it
restarts the app three times:
- **cold**: no warm page. A real press on the Lab's rail button, then switches simple ⇄ simple and heavy ⇄ heavy (first
  visit and again), heavy → simple, then back to a chat and to the Lab again.
- **song**: the song scene was open last, warm page (as every day). Press → first frame, → the song in.
- **warm**: a simple scene, warm page.

Each stretch counts wall time and **CPU time per process** (window, Lab preview, GPU, main: `app.getAppMetrics` through
`hub.power.test`), the window's main-thread CPU from a trace (`dev/trace-stats.js` segments and `at:` marks) and the
scene's runs. "Correct frame" is the first frame after the scene's last run, with its model loaded. Between stretches
the check waits for the GPU process to go quiet: on a software GPU a heavy scene's shaders keep it busy for seconds after
its first frame, and that belongs to the stretch before.

Machine: SwiftShader under Xvfb (the "GPU" is the CPU), 4 shared CPUs at load 16–25 from the other streams. Before = the
base commit (ea03b29) from `git archive`, with the same check, run in turn with after. Three runs each, medians (each
run in brackets). GPU-bound numbers swing a lot here; the counts (runs, resizes) are exact.

| What | Before | After |
|---|---:|---:|
| **Switch to a heavy scene → its correct frame** (first visit) | 18.2 s (13.2 / 20.4 / 18.2) | **13.8 s** (9.8 / 13.9 / 13.8) |
| Switch back to a heavy scene → correct | 5.9 s (6.6 / 5.9 / 4.4) | **4.2 s** (3.8 / 4.2 / 4.3) |
| Switch heavy → other heavy → correct | 4.8 s (4.4 / 4.8 / 5.7) | **3.8 s** (3.8 / 5.4 / 3.0) |
| **Runs of a heavy scene per switch** | 2 (the first without its files: a half-built picture, then everything again) | **1** |
| **Warm open → the Lab's own run drawn** (song, sliders, exact values) | 1,900 ms (1,900 / 1,929 / 1,426) | **862 ms** (862 / 834 / 1,137) |
| Warm open: CPU of every process | 2,140 ms | **1,490 ms** |
| Warm open: GPU process CPU | 1,290 ms | **860 ms** |
| Warm open → the scene shown (the warm picture) | 186 ms | 208 ms (same: 129–620, noise) |
| **The preview resized after its first layout** (warm open / with a song) | 1 / 1 every time | **0 / 0** (one warm run had 1 before the last fix) |
| Cold open → first frame | 2,490 ms (2,855 / 2,363 / 2,490) | 1,902 ms (1,808 / 1,902 / 2,491) |
| Cold open: CPU all / window | 2,630 / 320 ms | 2,250 / 250 ms |
| The window's main-thread CPU until the Lab's scenes are read (cold / warm) | 74 / 59 ms | **62 / 50 ms** |
| Open with a song → first frame / → song in | 1,523 / 775 ms | 1,672 / 557 ms (noise) |
| Switch simple → simple, first visit / again | 630 / 747 ms | 626 / 584 ms |
| Switch heavy → simple | 1,059 ms | 3,012 ms in runs 1–2, 751 ms once the check waited for a quiet GPU (spill-over, see above) |
| Back to the Lab from a chat → shown / drawing | 83 / 220 ms | 104 / 247 ms (same) |

What the measurements showed (the critical path since rounds 37–46):
- **A scene with references ran twice on every switch.** It ran at once without its files. Its picture layer threw "No
  reference", its model layer had no URL, and the swap's cover faded onto a half-built picture. Then the files arrived
  and the whole scene ran again: every layer built, every shader compiled, the text laid out a second time.
- **A song or a scene timeline grew the music bar under the preview** half a second into the Lab's first run (the
  overview row, 26 px, appeared when the song was decoded). Every canvas of the scene was resized then: on this machine
  a resize of the four layers cost 0.8 s on the preview's thread and about 1 s of GPU.
- **The Lab's first reads waited for the biggest two stores**, versions (40 per layer) and scene pictures (a JPEG each).
  Nothing on screen needs them, yet they're megabytes to copy into the window before the first run was even sent.
- **A model's first load imported four modules one after another**: GLTF, Draco, meshopt and KTX2. Most .glb files need
  none of the decoders, and on a real computer each one comes from the network.
- The node editor's ≈ 170 filter types were scanned in the idle moments of every Lab open (≈ 20–30 ms of the window),
  and a scene switch to the same frame size relaid the preview out.
- Not changed (GPU-bound or already done): a brand-new page's first WebGL context and three.js's renderer set-up
  (≈ 1–1.4 s of a cold open here). A tried "context made while three.js loads" blocked the page's thread just as long
  and gained nothing here, so it was taken out. Shaders already compile in the background on a real GPU (round 21), and
  the warm page (round 37) covers the everyday open.

## Upgrades

### Switching scenes
1. **A scene with pictures, models or videos as references switches in one go.** Its files are read first (a few ms
   from disk, the old picture stays meanwhile), then it runs once, complete. Before, you saw a half-built picture first
   (no model, a missing picture), then the scene was built a second time. Heavy scenes reach their right picture about
   30 % sooner here, with no wrong picture between. A file slower than 1.5 s to read (a huge video on a slow drive)
   doesn't hold the scene back: it runs, and again with the file, as before.
2. **A scene's reference files are read all at once**, not one after another.
3. **A switch to a scene with the same frame size no longer lays the preview out again** (a size change is still
   followed at once).

### Opening the Lab
4. **The Lab's own run starts sooner.** Opening reads only what the scene needs (your scenes, their songs and frame
   sizes, notes, references). Versions (History, the trash) and scene pictures come in the first idle moment after. On
   the everyday warm open, the Lab's own run (song, sliders, exact values) is drawn in about 0.9 s instead of 1.9 s here.
   A version taken, a scene deleted or a picture made before they arrive is merged in and saved then. A store that
   can't be read is still never saved over (round 43).
5. **The preview keeps its size while a song comes in.** The overview row under the timeline shows as soon as a song
   starts loading, and with a scene's own timeline at once, so the scene isn't resized right in its first frames.

### Models and nodes
6. **3D models load with only the decoders they need** (Draco, meshopt, KTX2 when the model uses them, all at once). A
   plain .glb no longer waits for three extra modules, each from the network on a real computer.
7. **The node editor's filter types are prepared when nodes are first used** (the nodes view, a graph, a node command),
   not in every Lab open.

**7 upgrades.**

## For the next measurer (dev, not counted)
- `sh dev/run-checks.sh labstartfast` (the check + labboot, labmemory, boot-test); the check is in the `lab` group too.
  Budgets, loose on time, strict on what was fixed: a heavy scene runs once per switch; no preview resize after the
  warm / song open's first layout; the window's CPU until the scenes are read ≤ 150 ms; a cold open ≤ 6 s CPU (window
  ≤ 0.9 s); warm shown ≤ 1.5 s, warm run ≤ 5 s; every stretch reaches its correct frame; back from a chat shown
  ≤ 0.6 s. The base commit fails 5 of them (three double runs, two resizes).
- `localStorage` switches (with `--eval`): `lsf.log = '1'` adds each stretch's message log and the preview's size
  changes with the Lab's row heights; `lsf.dump = <folder>` saves each stretch's trace (the window's, the preview's and
  the GPU's threads); `lsf.only = 'warm' | 'song'` skips the cold part. `window.LSF_BUDGET` / `LSF_REPORT`.
- In a trace, a preview or GPU thread with no events for seconds was blocked before tracing reached it (a long
  software-GPU job): read the GPU process's CPU from the metrics instead.

## Tested
- `node --check` on every touched JS file; the sandbox page unchanged in the end.
- labstartfast on before / after, three runs each (above): before fails 5 budget lines every run, after passes.
- `sh dev/run-checks.sh --exact labstartfast labboot labeasy labmemory scenesafe layergroups kinetictype labdirect
  idlecpu lazy unit:boot-test`: 11/11 passed (18 min, load ≈ 17), no re-runs needed.

## Caveats
- Measured on a software GPU under heavy load: the GPU-bound times (first context, shaders, a model's environment) are
  far smaller on a Mac or PC graphics card, and the counts (one run instead of two, no resize) hold there too.
- The warm page still runs a scene with references without its files (round 37: no references in the warm run), so a
  heavy scene's warm picture can miss its model until the Lab's own run, as before.
- History and the time machine have a scene's older versions about a second after the Lab opens, not at once.

## Edits outside the lab lane
- `tools/three-nodes.js` (nodes): filter types on first use (two lines).
- `dev/run-checks.js`: the check in `lab`, a `labstartfast` group.

## Round 52 fix: no extra layouts before the Lab's scenes are read
`labstartfast` started failing alone ("songOpen: the window's CPU until the Lab's scenes were read: 206.6 ms",
"cold open used 6500 ms CPU"). A bisect over clean `git archive` copies (1d31b0c, round 51 at 594bed3, presentready
at f8f2403, the Astra merge 36ee90f, crashsafe 269d3cc, lazymeta d2d8a84; the same HEAD check on each, two runs each)
found **no commit that added the cost**: songOpen's number was 143.7 / 144.2 ms at 1d31b0c already (6 ms under the
budget) and 122–194 ms at every later point, with no step; the cold open's CPU is ≈ 75 % the software GPU's and swung
3.7–6.3 s at every point. The margin was gone, and load decided pass / fail.
A trace of the window until `hearth:lab-ready` showed where those ms went: three **forced layouts while the Lab was
being built**, each before the scenes were even asked for:
- `tools/three-media.js` `addHooks()` (🎥 camera moves joining the timeline) drew the timeline at once: its width read
  laid the whole half-built Lab out (≈ 40 ms of style + layout). Now drawn in the next frame (`drawNext`).
- `tools/three.js` the park check after a page's 'ready' (the warm page taken on the first open) read
  `checkVisibility` right after the toolbar was rebuilt: a second whole layout (≈ 20–35 ms). Now in the next frame
  (`parkSoon`; at once when the window is hidden). The IntersectionObserver and the stall timer still follow it.
- `tools/three.js` the code editor's highlight colours (`hlTheme`) were read with `getComputedStyle` while the Lab was
  being built (≈ 10 ms of styling the page). Now in the next frame; the editors get them then (`paintTheme`).
Nothing on screen changes (each happens in the very next frame). The window's CPU until the scenes are read, after:
cold / song / warm **62 / 75 / 47 ms** at load 2 (round 48's 62 / 50), 64 / 109 / 55 and 85 / 80 / 38 at load 12,
86 / 108 / 60 at load 26. Before: 103–146 / 122–194 / 72–107 in the bisect (a machine that had run for hours, load
4–13), 66 / 97 / 49 in one run of 1d31b0c after the machine restarted (load 12): most of the failing numbers were the
machine's state, and the fix takes the song open's ≈ 20–40 ms of forced layout out of the way on top.

## For the patch notes
- Switching to a scene with pictures, 3D models or videos now happens in one go: no half-built picture first, and the
  right picture shows about a third sooner in our test.
- Opening the Three.js Lab gets your scene's music, sliders and exact values running sooner (about 1.9 s → 0.9 s in our
  test): versions and scene pictures now load just after, when nothing is waiting on them.
- With a song, the preview no longer jumps in size a moment after the Lab opens (that resized the whole scene right
  in its first frames).
- 3D models load quicker the first time: only the decoders a model actually uses are fetched.
- Opening the Lab and switching scenes do a little less work in the window (node filter types prepared only when you
  use nodes, no relayout when the frame size stays the same).
- Nothing looks or works differently; nothing new to learn.
- Caveat: History shows a scene's older versions about a second after the Lab opens.
