# Round 131 · renderpre131: one-click render presets for each project

The owner's ask: one click for the renders he makes again and again (a vertical reel, a seamless loop, the full song,
a 4K master, a square post), set up per project, several in one go, with clear names.

## What existed (reused, not duplicated)
- **The Render card** (`tools/three-export.js` `panel()`, "Export from the Lab"): What (this scene / the sequence),
  Format (MP4, ProRes 4444 + alpha, PNG seq, GIF, Still, and More ▾: HEVC, WebM + alpha, MP4 perfect loop, 16-bit
  still, GLB, web page, slider preset, contact sheet), Size (Lab frame, 1080p, 4K, 8K square, W×H…), Frame rate (24,
  25, 30, 50, 60), Quality (Draft / High / Best, supersample, motion blur). It had no length field: a render is the
  A–B loop or 10 s from the playhead (`/lab-export` takes `secs`, `at`, `range`). Since round 128 it starts on the
  project's frame rate and frame.
- **`LabExport.render(o)`**: one render at a time in a hidden export page, each a row of the render queue (progress,
  pause, cancel, retry); it already takes `dir`, `stem`, `range`, `at`, `secs`, `reframe`, `title`. Its names never
  overwrite (" (2)").
- **"Export presets"**: the only presets so far were the preview's right-click › ⇪ Export rows (4K MP4 supersampled,
  ProRes, perfect-loop GIF, 16-bit still…: fixed one-offs) and the "Slider preset" file format (the sliders, not render
  settings). Nothing kept render settings per project.
- **▦ All formats (multiformat, round 33)**: one scene to 16:9 / 9:16 / 1:1 / 4:5 MP4s in one go, with a framing per
  shape (nudges remembered per scene in `three.formats.nudge`). MP4 only, one length for all.
- **∞ Make it loop (perfectloop, round 31)**: the scene loops over N bars; `PerfectLoop.state()` gives the loop's start
  and length, and `LabExport.render({ format: 'loop', at, secs, perfect: true })` renders it seamless.
- **streamrender / renderfast (rounds 40–41)**: frames stream straight into ffmpeg; nothing to add.
- **The song analysis** (`tools/three-music-core.js`, the player's `analysis`): sections (Intro / Build / Drop / Break /
  Outro), `drops`, the beat grid. songmap130 and autoedit read the same.
- **The project's prefs** (round 128): `p.prefs.aspect`, `p.prefs.fps` (and `p.workspace.frame` / `fps`), an ordinary
  project field that syncs.
- **The Lab sequence**: the card's "▤ The sequence"; presets work on it too (Full song / 4K master render the whole
  sequence).
- **The renders folder**: `ThreeSeq.outDir()` = the captures folder's `made/` (Settings › captures folder), else
  `~/Hearth sequences`. Renders join the project in front of you (`Projects.onRenderJob`).

## What's new, and where the owner clicks
**The Lab › Render (or right-click the preview › ⇪ Export › ⇪ Export…)**: the card now starts with a **Presets** row of
small chips (no new toolbar row; it is inside the existing card):

| Chip | Fills the card with | Length |
|---|---|---|
| ▯ Vertical reel | MP4 · 1080×1920 · 30 fps · High | the song's best 15–30 s: its first drop with the build-up before it, on whole bars (about a third leads in) |
| ∞ Seamless loop | MP4 perfect loop · the project's size and fps, **plus** a small WebM (480 px long side, "GIF-sized") | the ∞ Make it loop loop, else the A–B loop, else 2 bars at the playhead |
| ♫ Full song | MP4 · the project's size and fps · High | the whole song (the whole sequence on "▤ The sequence") |
| ◆ 4K master | ProRes 4444 when this ffmpeg has it, else MP4 · Best · 3840×2160 (2160×3840 for a vertical project) · the project's fps | the whole song |
| ◻ Square post | MP4 · 1080×1080 · the project's fps | 15 s from the drop |

- A click on a chip **ticks it and fills the fields** below. The fields stay editable; a change is kept for that
  preset. A line under the chips says the length ("Vertical reel: 0:09.4–0:31.9 · 22.5 s · the drop at 0:16.9 with
  7.5 s of build-up"); **✎** changes where it starts and ends.
- **Tick several** and the button reads **⇪ Export 3 presets**: each renders one after another in the render queue
  (each its own row, with pause / cancel), and one note says when they're ready (**Show**).
- **Framing**: when a preset's shape isn't the scene's (a reel from a 16:9 scene) and you framed that shape in ▦ All
  formats, that framing is used (multiformat's saved nudges).
- **＋ Save as preset** (when the scene is in a project): asks a name and keeps the card's settings on the project
  (`p.prefs.renderPresets`, it syncs). It shows as a ★ chip on that project's card; right-click it to remove it.
- **The project menu › Share & keep › Render the main scene…** opens the card on the **project's last-used preset**
  (the one shown when ⇪ Export was clicked), ticked and filled.
- **Names and folder**: "Reel Test – Vertical reel – 2026-11-06.mp4" in a folder named after the project inside the
  usual renders folder (`<captures>/made/<project>/`). If that name is already there, Hearth **asks first**:
  **Replace it** (the old file goes to the Trash / Recycle Bin) or **Cancel** (both kept, the new one gets " (2)").
  Nothing is written into the project's own folders or anywhere else of the owner's.
- With no preset ticked, the card works exactly as before, and presets never change the last render's settings
  (`three.export`).

## Files
- New: `tools/three-renderpre-core.js` (`RenderPreCore`: the presets, the reel's drop window, the loop window, the
  fields, the jobs, names, saved presets; loads in Node), `tools/three-renderpre.js` (`LabRenderPre`: the row, the
  queue, save / last-used, the overwrite question), `tools/three-renderpre.css`.
- Lazy group **renderpre** (`tier: 'use'`, after `lab`), loaded when the Render card opens; `index.html`'s lazy-at tag,
  `docs/lazy-groups.md`. First screen unchanged (62 scripts, 1578 KB, budget 1586).
- `tools/three-export.js` `panel()`: marked `(round 131, renderpre131)`: a `preset` option, the row on top, the
  button's label, ⇪ Export hands ticked presets to `LabRenderPre`.
- `projmenu.js` `renderMain()`: `LabExport.panel({ preset: 'last' })`.
- `dev/checks/renderpre131.js`, group `renderpre131` in `dev/run-checks.js`.

## Tests
One app check, **dev/checks/renderpre131.js** (≈ 60 s), on a 16:9 scene with the fixture song
(`/tmp/hearth-autoedit-song.wav`) in a project at 60 fps:
1. Each chip fills the right fields (format, size, frame rate, quality, the length line), five ticked read
   "⇪ Export 5 presets", and a field changed by hand stays with its preset.
2. The reel's window from the song's analysis: 22.5 s, the drop (16.9 s) inside it with 7.5 s of build-up, on bars.
3. Reel + Square ticked, one ⇪ Export, in the check's tiny mode (1 s, 160 px long side): both probed (90×160 30 fps
   1 s; 160×160 60 fps 1 s), named "Reel Test – … – <date>.mp4" in `made/Reel Test/`, each joined to the project once.
4. The reel again: "Replace?" is asked; Replace leaves one file; Cancel keeps both (" (2)").
5. ＋ Save as preset "Promo" (from Square, 25 fps): on the project and in kv `projects` on disk; rendering it makes
   "Reel Test – Promo – <date>.mp4" at 25 fps and it becomes the last-used; the project menu's "Render the main
   scene…" opens the card on it.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, `flock … run-checks.js --exact`):
`renderpre131` ✓ (56 s), `projcreate128` ✓ (67 s), `projmenu128` ✓ (74 s), `labload94` ✓ (46 s): 4/4 passed. `node dev/boot-test.js`: 2928 checks passed. The check's renders are tiny and live in the smoke run's own
temp data folder, removed with it.

## For the patch notes
- **Render presets.** The Render card now starts with five one-click presets: **Vertical reel** (9:16, the best 15–30
  seconds of the song: the drop with its build-up), **Seamless loop** (the scene's loop as a perfect-loop MP4 plus a
  small WebM), **Full song** (your project's size and frame rate), **4K master** (ProRes when available) and **Square
  post** (15 seconds from the drop). A click fills the card; you can still change anything before Export.
- Tick several and Export makes them all, one after another.
- **Save as preset** keeps your own settings with the project, and it syncs to your other computer. "Render the main
  scene…" in the project menu opens the card on the preset you used last.
- Renders are named "Project – Preset – date" in a folder for the project next to your other renders. If a file with
  that name is already there, Hearth asks before replacing it (the old one goes to the Trash).

## For Codex
- No Codex-owned file was edited.
- New fields in kv `projects`, inside the existing `p.prefs` object (round 128, written like `projmenu.js`'s
  `setPrefs`: `p.updated` + `Projects.changed(p, 'prefs')`; they sync with the project):
  - `p.prefs.renderPresets`: `[{ id: 'my-<base36 time>', name, base: 'reel'|'loop'|'full'|'master'|'square', fields:
    { format, size, custom, fps, quality, ss, blur }, at }]`, at most 12.
  - `p.prefs.renderLast`: the id of the preset last rendered from the card (a built-in id or a `my-…` one).
  - `ProjectWorkspaceCore` / sync merge: nothing to do; `prefs` is an ordinary field. A change to both on two
    computers is a `prefs` conflict like any other.
- Renders join the project through the render queue (`Projects.onRenderJob`); if one didn't (the project wasn't the one
  in front of you), `LabRenderPre` calls `Projects.madeHere('render', path, p)` 1.5 s later, once.
