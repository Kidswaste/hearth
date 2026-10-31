# labflake95 (round 95): the Lab's speed checks stop failing at random

Two Lab checks failed now and then and passed on a re-run:

- **labfps89**, its texture stretch: "hitches over 2× budget judged the app's ≤ 1" (rounds 89, 90, 91, 94);
- **labstartfast**: one budget missed by 2 ms in round 94, and a run time that had crept to 280–400 s.

Each was reproduced first, then traced to its cause. There were three kinds of cause: one real app hitch, three ways
the checks counted wrong, and one CPU budget that load could push over. No check was skipped, and no budget was
raised.

All app runs were under `flock /tmp/hearth-run.lock`, with at most 5 checks per run. "Under load" means
`/tmp/lf95/burn.js N` beside the run: N worker threads, each spinning CPU and allocating, on the same 4 CPUs (load
average 8–12). That is checkfix88's burner. It started only once the lock was held, so other streams' runs never
shared it. SwiftShader under Xvfb, as always on this box.

## 1. labfps89, the texture stretch

### Reproduced
- Base (c33c1f3), texture stretch only (`LF89_ONLY=texture`):
  - **calm**: ✖ 1 of 1;
  - **6-thread burn**: ✖ 1 of 3.
- Reading the stretches turned up three separate problems.

### Cause 1 (the check counting wrong): one setup frame counted as two hitches
- The new picture layer's setup frame makes its 3 programs. Without background compiling (SwiftShader here) that is
  the "one setup frame per new layer" labfps89 allows. The late frames around it, from the failing calm run:
  - the frame with the compiles: 150 ms, 38.5 ms of render work;
  - the frame after it: 217 ms, 0.5 ms of work, while the software GPU finished the programs.
- The judging looked at each late frame's own compiles **and its neighbour's**. So both frames got "3 shader compiles
  in a frame on screen", and one setup counted as 2 hitches judged the app's. That alone fails "≤ 1". It is round 91's
  note, reproduced.
- The texture stretch was also left out of the setup-frame rule that every other stretch adding a layer has
  (`switch-on`, `reload`, `post:add`). labcompile90 already exempts it, and round 90's write-up (footnote ³) says it is
  allowed. labfps89's code never did.
- **Fix (check)**:
  - A compile frame, or an upload inside a frame, now explains **one** late frame: its own, or else the next one.
    Another late frame next to it is judged on its own (CPU, else load).
  - The texture stretch is under the setup-frame rule, with `layers: 1`. So its compiles in frames on screen are
    bounded at one frame by the "shaders compiled ahead" step.
  - An upload inside a frame is now a verdict of its own (`upload`). It **always** counts. Before, it shared the
    `compile` verdict, so the setup-frame allowance would have hidden it.

### Cause 2 (the check counting wrong): the stretch ended before the pictures were in
- The stretch was a fixed 5 s. The two 4096² pictures, every slice, the mipmaps and the take-over finish 4.0–5.0 s
  after the layer is added (`inMs`, 6 runs under load). With 0.3 s of lead-in, that is right at the window's end.
- Under load, all 3 base runs stopped mid-picture: 21, 25 and 31 of ~32 slices done (`slices.active 1`). Round 90 saw
  the same. The last slices and the mipmap pass (the biggest single call, 0.3–1.2 s here) were never judged, and what
  was left ran into the next stretch.
- **Fix (check)**: the stretch now lasts until `window.__labUploads()` shows nothing waiting, nothing being sliced and
  two more pictures handed over. Then it records 1 s more, with a 30 s cap. A new step checks that both pictures were
  in inside the stretch.
- Also fixed: `dev/trace-stats.js longTasks` cut the check's own list of late frames to 8. A 9th late frame came back
  with no CPU figure, and the check took it for "can't tell". A check's observed list now comes back whole. Only
  labfps89 and labcompile90 pass one.

### Cause 3 (a real app hitch): the picture's flip ran on the preview's thread
- In one loaded base run, the frame where the first picture arrived held **340 ms of the preview's own CPU**. The check
  rightly judged it the app's (`over`).
- Tracing the stretch (`LF89_CATS=devtools.timeline`, `LF89_DUMP`) showed two tasks on the preview's thread every
  time, one per picture: **74–83 ms of CPU each**, in 3 of 3 loaded runs. Both were posted from Chromium's
  `ImageBitmapFactories … DecodeImageOnDecoderThread`.
- `createImageBitmap` decodes on a decoder thread. But the flip the Lab asks for (`imageOrientation: 'flipY'`, which
  the slices and three's upload need) is applied when the result comes back to the calling thread. For a 4096²
  picture that is a 67 MB copy. In a busy moment, the frame it lands in turns into a hitch the check can see.
- Measured in the preview, calm, 3 tries each (a 4096² PNG):

  | Way | Long task on the page's thread | Total time |
  |---|---|---|
  | decoded on the page, flipped | **80, 86, 83 ms** | 180–192 ms |
  | decoded on the page, not flipped | none | 98–120 ms |
  | decoded and flipped in a worker | **none** | 161–182 ms |

- **Fix (app, `tools/three-sandbox.html`, `decOff`)**:
  - The Lab's picture decodes now run in one small worker: a reference picture, the asset cache's decode, and a picture
    changed on disk. The worker decodes and flips, and hands the picture back transferred, with no copy.
  - If the worker fails (none, an error, a type it can't decode), the page decodes as before.
  - The export page keeps its own path.
  - The memory counters (`__labMemRaw`) still count every picture. `window.__labDecode()` reports what ran where.
- **Proof**:
  - The same traced stretch, under load, before → after:
    - before: the preview's tasks over 20 ms of CPU were the two decode replies (83 + 77, 77 + 78 and 74 + 75 ms);
    - after: none. The largest task in the whole stretch was 11–14 ms of CPU (3 of 3 runs).
  - A new labfps89 step checks that the pictures were decoded off the page's thread.
- The owner's PC is much faster, but a 67 MB flip on the page's thread is still a stuck frame at 240 Hz. Now it
  isn't on that thread.

### The check still catches the real problems (bugs put back on purpose, not committed)
- **Round 89's original bug**: big pictures uploaded inside the next frame. The `upRelease` hand-over was put back to
  "set the picture, let the next render upload it". Result:
  - ✖ "hitches over 2× budget judged the app's ≤ 1": app 2, a 1,283 ms frame with 71.6 ms of the preview's CPU, plus
    an `upload` hitch (16.8 MP inside frame 15);
  - ✖ "… uploaded right after a frame, not inside one".
- **This round's app bug**: the decode put back on the page's thread (`DEC.off = true`). Result: ✖ "the pictures were
  decoded and flipped off the page's thread (worker)".
- Also tried: the compile-ahead before a layer's first frame removed. `firstuse` still had 0 compiles, because round
  90's change watcher makes the hidden objects' programs in the gap anyway. That is not a regression the check should
  flag, so it isn't counted as a proof.

### Runs after the fix (texture stretch, 6-thread burn)
- **Check fix only**: ✓ 3 of 3. Every slice was done inside the stretch (30–33 slices, `active 0`). The one setup frame
  counted once. p99 0.9–1.4 s, all can't-tell.
- **Check fix and app fix**: ✓ 3 of 3. p99 833–900 ms, and every late frame but the setup frame was can't-tell
  (preview CPU 0.1–7 ms).
- **Full check**: see "Final runs".

## 2. labstartfast

### Its run time: 402–426 s, half of it waiting for something that never came
- Each stretch now reports its own times (`settleMs`, `ms`) and the GPU process's CPU every half second while it
  waits (`settleGpu`).
- The "GPU quiet" wait before each stretch looked for the GPU process under a quarter of a CPU (125 ms of 500). A
  software GPU drawing the check's animated shader scenes uses about 3 of the 4 CPUs: **1,350–1,660 ms every half
  second**, steady, after every switch. So all six switch stretches waited the whole 30 s cap: **181 s of a 402 s
  run**. The "quiet GPU" they were meant to start from never came.
- **Fix (check)**: the wait also ends after three half-seconds in a row within 12 % of each other. Steady is as quiet
  as a drawing scene gets. A heavy scene's leftover work (shaders finishing after its first frame) shows up as values
  that are still changing.
  - Measured: 1.7–3.1 s per switch instead of 30.
  - What the stretches measure didn't change. First visit to a heavy scene → correct frame was 4.8–5.2 s calm (4.7 s
    before), and every switch still ran its scene once.
- **No repeat was dropped.** labstartfast measures each stretch once, so there were no repeats to cut. The time went
  into the wait.
- **Run time** (smoke run only, lock wait excluded):

  | | calm | 8-thread burn |
  |---|---:|---:|
  | Before | 402 s | 426 s |
  | After | 229–235 s | 254–257 s |

  Through `run-checks`: 233 s calm and 263 s under the burn (it was 280–400 s).

### "songOpen: the window's CPU until the scenes were read: 152 ms (budget 150)" (round 94)
- **Measured**: songOpen's window CPU from the press to `hearth:lab-ready`, over 14 runs (calm, other streams' load,
  and an 8-thread burn): **68–126 ms**. None reached 150. The 152 didn't come back.
- **Where the spread comes from: the same work costing up to twice the CPU.**
  - Comparing the traces of a 116 ms and a 74 ms open: the Lab's first layout was the same 46 of 214 objects in both,
    and took 13.4 ms against 6.6 ms. The click's own script took 32.7 against 22.7 ms. Every phase scaled together.
  - That is the box, not more work. Other programs share the 4 CPUs (the GPU process drawing with ~3 of them, other
    streams' checks), and memory-bound work like layout slows the most.
  - The burner (busy loops and small allocations, which stay in the caches) barely moved it. The window CPU under the burn was 68–92 ms.
- **Fix (check, load-aware)**:
  - Right after each open (cold, song, warm), with the scene still drawing as it was during the open, the check times a
    fixed probe in the window: dev/perfguard-calib.js's benchmark (integer mixing, short-lived objects, layout of an
    off-screen box) in a smaller dose, plus reads all over 16 MB (memory-bound, like layout). It is warmed once, then
    run 3 times, with each run's own thread CPU taken from a light trace.
  - `slowBy(k)` is that stretch's probe over the run's fastest, between 1 and 2.
  - The window's CPU budgets (the cold open's window CPU, and the CPU until the scenes are read) are then judged like
    checkfix88's: within budget → ok; over, but within budget × slowBy → **"can't tell"** (listed on the check's line,
    not failed); over that → it fails.
  - A run that is slow all the way through gets no allowance. The budget itself is unchanged (150).
  - Probe values: 9.9–12.8 ms right after the opens. They read 12.7–14.7 ms when taken before the press, with the page
    still busy after its reload. That is why the probe is taken after.
- **Fix (check, the real guard)**:
  - The budget was meant to keep round 48's fix: the Lab's first reads don't wait for the two biggest stores (every
    scene's versions and the scenes' pictures).
  - Proof that the CPU budget alone doesn't keep it: with `three-history` and `three-thumbs` put back into the first
    reads (temporary), the warm open read **98.8 ms**. That is well under 150, so the budget passed it.
  - The check now records the stores the Lab reads (it wraps `LabSceneSafe.read`) and fails when either one is read
    before `hearth:lab-ready`.
- **Proof that it still catches the problem**:
  - The round 48 bug put back (not committed): ✖ "warmOpen: the Lab read three-history and three-thumbs before its
    scenes were up". Normal runs read `three-sketches, three-lab-extras, three-notes, three-refs`, in every open.
  - The load-aware verdict, shown with a deliberately tight `LSF_BUDGET` (readyCpu 70):
    - warmOpen 77.5 ms with slowBy 1.23 → can't tell;
    - songOpen 92.5 ms with slowBy 1.39 → can't tell;
    - coldOpen 91.4 ms with slowBy 1.14 (allowance 80) → **✖ fails**.
  - `LSF_BUDGET` used to be read only by the check's first page, so it never reached the verdict. It is now kept
    across the reloads.

## Final runs (this branch; `HEARTH_THREE_DIR=… flock /tmp/hearth-run.lock node dev/run-checks.js --exact …`)
- Calm (load 0.5–1.3): **labfps89 ✓ 181 s**, **labstartfast ✓ 233 s**.
- Under an 8-thread burn (load 11): **labfps89 ✓ 196 s**, **labstartfast ✓ 263 s**.
- Calm again: **labfps89 ✓ 193 s**.
- In all three labfps89 runs:
  - the texture stretch had both pictures in inside the stretch (2.9–4.5 s after the layer was added);
  - it ran on the worker;
  - its only app frame was the allowed setup frame.

  The can't-tell lines were steady frames waiting on the software GPU (preview CPU 1–14 ms).
- labfps89 now takes 181–196 s, against ~150 s in round 89: the texture stretch waits for the whole arrival.
- labstartfast's window CPU until the scenes were read:
  - calm: cold 125.7, song 98.2, warm 69.6 ms;
  - under the burn: 87.7 / 99.0 / 74.2 ms.

  All under 150, so no can't-tell was needed. The first reads were the four small stores every time.
- labcompile90 ✓ 130 s, labpace ✓ 107 s, labboot ✓ 93 s, labload94 ✓ 46 s, lazy ✓ 110 s.
- unit:labfps72-test, unit:labshadow91-test, unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan,
  unit:storeack-scan, unit:chatsafe-scan, unit:boot-test (3,074 checks; first screen 68 scripts, 1747 / 1751 KB,
  unchanged: the preview page is lazy) and unit:lazymanifest-test: 9 / 9 ✓.

## What's left
- The 152 ms songOpen wasn't reproduced in 14 runs. If it comes back, the check now says whether the box was slower
  right then ("can't tell", with the probe figures) or whether the open did more work (a fail, with the allowance it
  was judged against).
- labcompile90 still pairs a late frame with its neighbour's compiles, the way labfps89 did. It already exempts the
  texture stretch's setup frame, and it didn't fail here, so it was left alone. The same one-frame-per-compile rule
  would fit it.
- Main-process blocks are still judged on wall time (checkfix88's note).

## For Codex
No Codex-owned file was changed.

## For the patch notes
- **Smoother**: when a big picture (4K and up) arrives in a Lab scene, the preview no longer sticks for a moment while
  it is prepared. The picture is now turned the right way up in the background, not on the preview's own thread.
- **Behind the scenes**: the Lab's frame-rate check now measures a big picture's arrival from start to finish and counts
  a new layer's one setup moment once instead of twice. It no longer fails at random on a busy computer, and it still
  catches the real problems.
- **Behind the scenes**: the Lab's start-up check runs in about 4 minutes instead of 7. It no longer waits for a quiet
  moment that never comes while a scene is moving. It now checks directly that opening the Lab doesn't read the big
  history and picture files first. When the computer is too busy to judge the Lab's own work fairly, it says so
  instead of failing.
