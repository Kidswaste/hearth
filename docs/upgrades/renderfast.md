# renderfast (round 41): Lab renders and exports finish sooner, with the same frames

You asked for faster Lab renders without changing what comes out. Every render still goes through the hidden export
page (labexport, round 22), frame by frame on the scene's own clock, seeded. What changed is everything around the
drawing: how a frame is encoded, how it reaches ffmpeg, what the preview does meanwhile and how All formats is
scheduled. **Every output file is the same, byte for byte, as before**. The check renders each format both ways and
compares the files and every decoded frame.

Nothing new on screen. Exports are faster, the render queue's time left is right from the first frames, and the Lab
preview eases off a little while a render runs.

## Where the time went (measured before changing anything)

Each frame's time is now split in the export's stats (`/lab-export speed`, `LabExport.status().speeds`, the result's
`split`): **step** (the scene's own frame code and draw calls), **merge** (layers into one picture), **enc** (picture
→ JPEG / PNG), **wait** (the app waiting for the page), **ipc** (frame bytes to the main process), **ff** (ffmpeg after
the last frame). A profiling switch (`prof`) reads one pixel back after the merge, so the GPU's real drawing time
counts as "step" instead of hiding in the encode.

What it showed (Xvfb + SwiftShader, so the "GPU" is these 4 shared CPUs, with the machine at load 3–30 from the other
agents):
1. **The encode waited for an idle moment that never came.** `canvas.toBlob` uses Chromium's idle-time encoder. An
   export page is never idle, so each frame waited for the encoder's fallback timer. Bench (1080p JPEG q 0.97):
   toBlob **707 ms**, the same encode through `OffscreenCanvas.convertToBlob` **350 ms**. On a busy page: 1,120 vs
   669 ms.
2. **ffmpeg only started after the last frame.** Frames went to a temporary folder, one IPC + one file each, and x264
   (preset slow) ran afterwards: **4.5–15 s of a 1080p clip and 7–22 s of a 4K clip** were this tail alone.
3. **The preview drew the same scene at the screen's rate** next to the export page, on the same GPU (here, the same
   CPUs). Heavy scene, 4 frames: Lab on screen **54.6 s**, Lab hidden **44.8 s**.
4. **All formats** made its shapes strictly one after another, each with its own page start and ffmpeg tail.
5. Not the bottleneck: IPC (< 1 % of a render: a 1080p JPEG frame is ~60 KB), the merge (< 1 %), disk writes.
6. The real limits here are the drawing itself (SwiftShader) and x264 slow, which stay as they are: a different
   preset or encoder would change the frames.

## Before → after (same scenes, same sizes, same files; `dev/checks/renderfast.js`, reference path vs new path)

| Render | before (reference) | after | |
|---|---|---|---|
| Simple scene, 1080p MP4, 30 frames | 48.6 s | 41.8 s | −14 % |
| Simple scene, 4K MP4, 8 frames | 32.4 s | 22.4 s | **−31 %** |
| Simple scene, 1080p ProRes 4444 + alpha, 10 frames | 13.5 s | 12.8 s | −5 % |
| Heavy scene (4,000 physical-material instances, MSAA), 1080p MP4, 6 frames | 98.4 s | 95.6 s | −3 % (the draw is ~95 % of it here) |
| ▦ All formats 16:9 + 9:16 + 1:1, 15 frames each | 47.6 s | 23.4 s | **−51 %** (2 lanes) |
| **Total** | **240.6 s** | **195.9 s** | **−19 %** |
| Small renders checked for equality (MP4 / HEVC / ProRes / loop MP4) | 14.0 / 6.3 / 5.0 / 17.8 s | 12.0 / 4.4 / 4.5 / 16.5 s | |

Same files both ways: MP4 H.264, HEVC 10-bit, ProRes 4444 + alpha, GIF loop, MP4 loop, Still PNG, the three All
formats files, and every timed pair. Each was compared as the same SHA-256 and the same framemd5 for every frame.

How to read these numbers: here everything shares 4 CPUs with other agents (load average up to 30 during these runs).
So when the streamed encode overlaps the drawing, x264 (at below-normal priority) still waits for CPU time, and the
ffmpeg tail shrinks less than it would on your Mac. There the drawing is on the GPU and x264 has idle cores. Both
columns already include the preview easing off (it applies to every render). Measured alone, it was worth ~18 % on the
heavy scene. Expect the 4K and All formats gains or better at home. The heavy scene stays bound by its own drawing.

## Upgrades

### Faster, same output
1. **Frames are encoded at once**: the export page hands its picture to an OffscreenCanvas
   (`createImageBitmap` snapshot, no copy) and `convertToBlob` encodes it immediately. Before, `toBlob` waited for an
   idle moment that a rendering page never has. It is the same encoder at the same quality, so the bytes are the same
   (checked). Also used by the sequence's in-preview frames.
2. **Videos stream into ffmpeg while they draw**: no folder of temporary frames, no file per frame, and the encode is
   done when the last frame is (new `renderfastmain.js`: ffmpeg's stdin, `image2pipe` with the decoder the file list
   would pick). The encoder sees the same pictures, so the video is the same file.
3. **Three frames in flight** when streaming (the old path kept two): the page draws one while two encode.
4. **The preview eases off while a render runs**: with Preview fps on Auto, the Lab preview drops to its background
   rate (30) until the last export ends, so the export page gets the GPU. Never in the Stage window, never during a
   recording. A fixed fps choice is left alone.
5. **▦ All formats side by side**: on a machine with 8+ cores, two shapes render at once, each in its own export page
   and ffmpeg (so each makes what it would alone). The files keep the order you picked. Pause and cancel reach both.
6. **Nothing left behind**: a cancelled or failed streamed render stops its ffmpeg and removes its half-made video
   (only one it started, never a file that was there before).
7. **Falls back by itself**: a loop searched in the frames, an ffmpeg that can't be reached this way, or an engine
   without OffscreenCanvas goes the old way, with the same result.

### Time left you can trust
8. **Time left from the first frame**: primed by your last renders' pace per megapixel (kept: the last 12), so a
   render shows a time before it has measured anything.
9. **Follows the render's real pace**: recent frames count more than old ones (the first frame, which compiles the
   shaders, is left out), so a speed change shows within a few frames.
10. **Counts the encode**: while streaming, what ffmpeg still holds. The old way, the encode after the frames.
11. **The render queue uses it** (⇪ in the rail, `/renders`), counting down between reports instead of guessing from
    the percentage. This covers Lab exports, the sequence's renders and All formats.
12. **▦ All formats shows one time for the whole batch**: the running shapes' own times, the waiting ones from the
    pace so far by their pixels, shared across the lanes.

### For you and the AI
13. **Where the time goes**, per render: `/lab-export speed` and the export's answer now carry the split (draw,
    merge, encode, wait, hand-on, ffmpeg) and whether it streamed.

**13 upgrades.**

## Not done, on purpose
- **WebCodecs / hardware H.264** (VideoEncoder works here: `avc1.640028` at 1080p is supported). It would be faster,
  but it is a different encoder, so every frame would change. That breaks "not a single output frame changes". The
  same goes for a faster x264 preset, and for raw RGBA instead of the JPEG frames MP4 has always been made from.
- **One scene evaluation shared by several All formats shapes**: each shape is its own page size. The scene's code
  lays itself out from `innerWidth` / `innerHeight` (and the reframe moves its cameras), so sharing one evaluation
  would change the frames of every shape but one. Side by side gets most of the gain without that.
- **Raw pixels for PNG-based formats**: the readback is the slow part here, not the PNG encode, so it would gain little
  and risk the alpha's exact bytes.

## How it was tested
- `dev/checks/renderfast.js` (new, 15 steps, **all pass**): bridge present. Reference vs new for MP4, ProRes + alpha,
  HEVC, GIF loop, MP4 loop: same bytes and same decoded frames, streamed. Still PNG same bytes. No temp folders left.
  Cancel mid-render: no half file. Time left at 20 % within ×0.5–×2 of the truth (said 17 s, took 11.5 s; the
  history was empty). The queue counts down. Auto preview 30 fps during, back after. All formats on 2 lanes = the
  reference files in order. Timing budget: new total < reference total.
- `node dev/renderfast-test.js` (new, unit group, 7 tests, pass): real ffmpeg, streamed = from files for H.264 from
  JPEG, ProRes 4444 from PNG with alpha, GIF loop with cross-fade (bytes + framemd5). A refused stream says why and
  leaves no file. A cancelled one leaves none, and a file that was already there is kept. `streamArgs`. The time-left
  model (prior, pace, lag, tail, no made-up number).
- Also run, all pass: `lazy`, `unit:boot-test`, `unit:labexport-test`, `unit:renders-test`, `unit:multiformat-test`,
  `multiformat`, `labexport`, `capture-pack`, `beatlink`, `labmemory` (+ its group: labboot, labvariations,
  abcompare), `renders`, `renders-seq`. `labpace` fails one timing step ("draws again within a frame or two": lag
  167–217 ms under load). It fails the same way on the code before this stream, so it's not caused by it. There is no
  `labcamera` check on this branch.
- beatlink, labpace, labmemory and labcamera all act inside the export page, which is unchanged: the scene's
  clock, links, camera moves and memory freeing run exactly as before. The equality checks cover the hand-off around
  it.

## Edits outside the new files (small, additive)
- `tools/three-export.js` (labexport): streaming, the split, the time-left model, the `direct` start, runs side by
  side (`S.runs`), the `hearth:lab-export` event.
- `tools/three-export-core.js`: `streamArgs`, `etaModel`. `tools/three-export-cmds.js`: the split in `/lab-export speed`.
- `tools/three-sandbox.html`: `xpEncode` (used by the export frames and the sequence's frames), the per-frame split,
  `prof`.
- `tools/three.js`: Auto's cap eases while `hearth:lab-export` is on (one listener + the `capMsg` line).
- `tools/three-formats.js` (multiformat): the pool of lanes and the batch time left.
- `renders.js` / `renders-core.js`: a tracked job's own time left (`progress(pct, label, left)`, `eta`).
- `main.js` (one `lazyIpc` line), `preload.js` (`hub.rfast`), `dev/run-checks.js` (labexport group + unit).

## Risks
- Streaming needs ffmpeg to read `image2pipe` (every ffmpeg build does). If opening fails, the render goes the old
  way by itself. `store three.export.stream = false` forces the old way.
- Side by side doubles the export pages' GPU memory while it runs (each stays under its 64 MP cap). It is only on with
  8+ cores. `parallel: 1` in `/all-formats`' options turns it off.
- The preview at 30 fps during a render is visible if you watch it closely. It's only with Auto, and it's back the
  moment the render ends.
- Absolute speed-ups were measured on a CPU-only, overloaded machine. The equality is exact. The size of the gain
  will differ on your Mac.

## For the patch notes
- Lab renders and exports are faster, with exactly the same result: same files, same frames. 4K clips about a third
  faster here, ▦ All formats about twice as fast.
- Videos now go straight into the encoder while they draw. No temporary frames on your disk, and the video is ready
  the moment the last frame is.
- Frames are encoded the moment they're drawn instead of waiting for a quiet moment that never came.
- ▦ All formats renders two shapes at once on computers with 8 or more cores.
- The render queue's "time left" is measured from the render's own pace (the encode included) and counts down
  smoothly. It shows from the first frame, using your last renders.
- While a render runs, the Lab preview eases to 30 fps (only when Preview fps is on Auto) so the render gets the
  graphics card. It's back to full speed as soon as the render ends.
- Cancelling a render now also removes its half-made video.
