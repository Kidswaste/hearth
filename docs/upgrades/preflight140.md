# Round 140 · preflight140: a check before a render, so a broken video is caught before the wait

The owner's ask: when he presses ⇪ Export, catch the problems that would cost him minutes of waiting for a broken video
(a file that's gone, a scene error, no song, the wrong shape, a render that takes forever, a full disk, a layer left
solo). The check runs locally, in well under a second, with no AI. If nothing is found, the render starts at once.

## What existed (and what each does)
- **🩺 Fix my scene** (scenedoctor, `tools/three-doctor*.js`): a free check of the scene **on screen**, run when you ask
  for it, or from its hint after a layer error or a blank frame. It reads a screenshot (black, blown out, the subject
  off screen or tiny), the layers' three.js scenes (camera inside an object, NaN values), textures that never loaded
  and "404" lines in the console, and "very slow" (under 20 fps). Each finding has one fix as one undo step. It doesn't
  look at files on disk, the render's settings, the disk, or the project's shape, and nothing runs it before a render.
- **labhealth** (`tools/three-health.js`, laberrors80): the preview pages report each problem once (runtime error,
  shader compile failure, camera gone NaN, a 404, a layer paused after throwing on every frame, the GPU lost), kept per
  scene and layer. It tells the chat's AI (one "health:" line) and shows the "⚠ Scene error" note. `LabHealth.state(id)`
  lists the records. **Reused**: the check reads these records for "scene errors right now".
- **⚡ Speed check** (speed133, `tools/three-speed*.js`): measures the preview for 3 s (fps, each layer's GPU time) and
  offers preview-only fixes. **Reused**: its last measure of the scene (`LabSpeed._S.raw`: fps and drawing size) is one
  source of the frame cost for the estimate.
- **glrecover** (round 43): when the graphics card drops the preview or an export page, the Lab rebuilds it, and a
  render picks up at the frame it lost. Nothing to check beforehand: a render recovers by itself.
- **The Render card's own warnings** (`tools/three-export.js`): the summary line under the fields says when
  supersampling was capped to the GPU's budget; a 16-bit still over 24 MP and a missing ffmpeg stop with a message
  at once (no wait). It showed no time, size, file or scene checks before rendering.
- **The render queue** (`renders.js`): each render is a row with progress, **time left** (`LabExportCore.etaModel`,
  primed from the last renders' measured pace in `three.export.pace`), pause, cancel and retry. Time left only shows
  **once the render runs**. **Reused**: the same pace history gives the estimate before it starts; the queue's
  `LabExport.status()` says how many renders wait ahead.
- **⚑ Finish line** (labfinish, `tools/three-finish*.js`): a hand-ticked "done when" list ("Nothing looks broken at full
  size", "Looks right at the size you'll post") and ⏺ Record it. It has no automatic check. Not changed.
- **filewatch / twocomputers**: follow a reference or song that is renamed or moved while Hearth runs, and offer "Find
  this file" when one is deleted. They don't stop a render that needs a missing file. **Reused**: a reference is
  relinked through the Lab's own `refs.reload(id, { from })`, which filewatch uses too.

So no check ran before a render. This round **adds that one check** and draws on the pieces above for its readings.

## What's new, and where the owner clicks
Nothing new to click. **The Lab › Render › ⇪ Export** (and ⇪ Export N presets, and ⧉ Make a batch's **⇪ Make**) now
checks first:

- **Nothing found** → the render starts at once, exactly as before (no card, no extra click).
- **Something found** → one small card, **"Before you render"**, lists each problem in one plain line, with its fix
  beside it:

| What it looks for | The line | One-click fix |
|---|---|---|
| A reference (picture, footage, font, 3D model, sound) that's gone or moved; a model's other files; the song | The picture "logo.png" is missing: it was moved or deleted. | **Relink…** (pick where it is now; Hearth copies it back into place) |
| A reference the code names that the scene doesn't have (`refTexture('logo')`) | "Title" uses a reference called "logo" that this scene doesn't have. | **Add the file…** |
| Scene errors now (labhealth): a shader that didn't compile, a layer that throws or stopped | "Sparks" has an error now: a shader didn't compile (…) | **Hide "Sparks"** |
| A preset that follows the song (Vertical reel, Full song, 4K master, Square post) with no song | Full song follows the song, but this scene has no song… | **Add a song…** |
| A silent song | The song "x.wav" is silent… | **Use another song…** |
| A shape that isn't the project's (or the scene's, with no project) | The project "Reel Test" is 9:16, but this render is 16:9 (1920×1080). | **Switch to 9:16** (same long side) |
| Very slow | Very slow: 4K at 60 fps would take about 40 min. | **Render at half size**, **Render at 30 fps** |
| Not enough room on the disk of the output folder | Not enough room: the disk of "made" has 300 MB free, and this render needs about 1.2 GB. | **Render at half size** (when that fits), **Save somewhere else…** |
| Solo on | Only "Glow ring" is visible (solo is on): 2 layers won't be in the video. | **Turn solo off** |
| Every layer hidden, or most of them (3+ layers, half or more hidden) | Every layer is hidden: the video would be empty. | **Show every layer** |
| A batch's rows that name a missing file | 2 rows of the batch name a file that isn't there: they are skipped. | — |

- The card's foot says **⏱ about 3 min · ~120 MB** (and "starts after 2 renders in the queue" when others wait).
- After a fix, the card checks again: the line goes, "✓ Turn solo off" shows below, and when nothing is left the button
  reads **⇪ Render**. Otherwise it reads **Render anyway**. **Cancel** goes back to the Render card (or the batch
  dialog), still open, with nothing started.
- **Several presets ticked, or a batch**: **one** card for all of them ("Before these 3 presets", "Before this batch
  (8 videos)"). Time, size and disk add up over every render.
- **The Render card's summary line** now ends with the estimate for the fields shown: "MP4 · H.264 · 1920×1080 · about
  2 min · ~45 MB".
- A Vertical reel or a Square post is meant to be its own shape: no shape line for those (nor for a batch's formats).
- `store three.preflight = false` turns the check off (the render then starts at once, as before).

### How the estimate is made
- **The frame's cost**: the median of the last renders' own pace (`three.export.pace`, ms per megapixel, encoder
  included); else speed133's last measure of this scene, scaled from its drawing size to the render's; else the
  preview's frame time, scaled the same way; else a guess (12 ms per megapixel). Supersampling and motion blur count.
- **Frames**: the export's own rules (a still is 1, a loop its bars with the cross-fade, a range, the sequence's length,
  else the A–B loop or 10 s).
- **Size**: bits per pixel by format and quality (H.264 0.06 / 0.12 / 0.2; ProRes 4444 5.3; PNG sequence 10…), plus
  the sound. **Very slow** is over 15 minutes. **Not enough room** is less than the size × 1.2 + 300 MB.
- It's an estimate, said as "about". The render queue's own "time left" takes over once the render runs.

## Files
- New: `tools/three-preflight-core.js` (`PreflightCore`, pure, loads in Node: the check, the estimate, the fixes that
  change the jobs), `tools/three-preflight.js` (`LabPreflight`: reads the scene, its files, labhealth, the disk; the
  card and its fixes), `tools/three-preflight.css`.
- Lazy group **preflight** (`tier: 'use'`, after `lab`), loaded when the Render card opens (or a batch starts);
  `lazy-data.js` (`node dev/lazy-manifest.js`), `index.html`'s lazy-at tag, `docs/lazy-groups.md`.
- `tools/three-export.js` `panel()` (marked `(round 140, preflight140)`): loads the group, the estimate in the summary,
  ⇪ Export runs the check before `render()` (and passes it to the presets).
- `tools/three-renderpre.js` `run()` / `queue()`: one combined check of every ticked preset, before the "Replace?"
  question; the last-used preset is kept once the check passes.
- `tools/three-batch.js`: ⇪ Make checks the whole batch (rows × formats) first.
- `rendersmain.js` + `preload.js`: `renders:free` (`hub.renders.free(dir)`): the free bytes on the disk of a folder
  (or the nearest folder above it that exists). The channel is read by `lazyIpc` as before.
- `dev/checks/preflight140.js`, group `preflight140` in `dev/run-checks.js`.

First screen: 62 scripts, 1537 KB of code (budget 1547 KB), unchanged. No prompt, tool or guide changed (0 tokens).

## Tests
One check, **dev/checks/preflight140.js** (group `preflight140`, ≈ 60 s), on a 16:9 scene with three layers (Backdrop,
Glow ring, Title), the fixture song and a 1 s A–B loop, all in the smoke run's own temp data (renders 160 px, 1 s):
1. A clean scene: the Render card shows "about 2 s · ~42 KB"; ⇪ Export renders at once with **no card**; the check
   took 3 ms.
2. A picture reference whose copy was moved to the Trash: "The picture "logo.png" is missing" with **Relink…**; Relink
   (the original picked by the check's stand-in picker) puts the file back and the line goes; **Cancel** leaves the
   Render card open and renders nothing.
3. Solo on "Glow ring": "Only "Glow ring" is visible (solo is on)"; **Turn solo off** clears the solo, every layer
   shows, the button reads ⇪ Render, and it renders.
4. A 9:16 project with its own 16:9 preset ("Wide promo", 1920×1080) and the Vertical reel ticked: **one card** ("Before
   these 2 presets") with one line for the promo; **Switch to 9:16**, Render: the promo is probed 90×160.
5. 4K at 60 fps for 2 min with a slow measured pace: "Very slow: 4K at 60 fps would take about 36 min", "⏱ about 36 min
   · ~759 MB"; **Render at half size** cuts the time and size to under 40 %.
6. Low disk (40 MB, simulated through the check's switch): "Not enough room: the disk of "…" has 40 MB free" with
   **Save somewhere else…**.
7. ⧉ Make a batch (2 rows × its formats) from the scene with solo on and the reference missing: **one combined card**
   with both lines; Cancel keeps the batch dialog open, nothing started.
8. **Render anyway** with solo still on: the render goes ahead as it is.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`, `flock /tmp/hearth-run.lock timeout 2400 node
dev/run-checks.js --exact …`): see "Results" below. `node dev/boot-test.js`: 3170 checks passed (62 scripts, 1537 KB
of 1547); `node dev/lazy-manifest.js --check` ✓.

## Results
- `preflight140` ✓ (20/20 steps, 62 s; the clean scene's check took 3 ms).
- `renderpre131` ✓ (68 s), `cuelooks139` ✓ (48 s), `speed133` ✓ (589 s), `labchat92` ✓ (119 s), `unit:boot-test` ✓:
  5/5 in 14 min. renderpre131's renders (a clean scene) went through the check with no card, as they should.

## Risks / not done
- The estimate is rough on a computer that hasn't rendered yet (no pace history): it scales the preview's frame time,
  which a vsync cap or Quality: auto can make look slower or faster than an export page is. After the first render it
  uses that computer's own measured pace.
- A file that takes longer than 0.7 s to answer (a cloud file being fetched) counts as there: the check never waits.
- "Most layers hidden" can't know a layer was hidden on purpose; it shows only when half or more of 3+ layers are off.
- A batch from a saved template (not the scene on screen) is fixed for that batch only (solo off, a relinked file);
  the template itself is unchanged. Its scene errors aren't known (it isn't running).
- The sequence (▤) is checked for shape, time, size and disk, not for each clip's files.
- AI-driven renders (`/lab-export`, `three_*` tools) aren't gated: nobody is waiting at a card.

## For the patch notes
- **A quick check before every render.** When you press Export, Hearth now looks for the things that would spoil a
  long render: a picture, video, font, model or song that was moved or deleted, an error in a layer, a preset that
  needs a song when there isn't one (or the song is silent), a video in the wrong shape for your project (16:9 in a
  9:16 project), solo left on, a render that would take a very long time, and not enough room on the disk.
- If everything is fine, the render starts straight away, as before. If not, a small card says what it found in plain
  words, each with a one-click fix: **Relink…**, **Turn solo off**, **Switch to 9:16**, **Render at half size**…
  Then **Render** or **Render anyway**, or **Cancel** to go back.
- It also tells you about how long the render will take and how big the file will be, on the Render card itself.
- Several presets or a batch get one check for all of them.
- It runs on your computer in a blink, with no AI and no tokens.

## For Codex
- No Codex-owned file was edited (`astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
  `cloud-files.js`, `workbench-*`, `engine-watch.js` are unchanged).
- No new store or synced field. The check reads `p.prefs.aspect` / `p.workspace.frame` (round 128) for the project's
  shape and writes nothing to the project. The only setting is the local `store three.preflight` (on unless false).
- A new IPC channel `renders:free` in `rendersmain.js` (lazy, as before) and `hub.renders.free` in `preload.js`.
