# ⧉ Make a batch (round 42, labbatch): one template → many videos, 0 tokens

You make many similar music videos: the same scene with another title, another song, another cover or other colors.
**Make a batch** takes one of your 📐 My templates (or the scene on screen) and a list of values, and renders one video
per row and per format. The values can be lines you type or paste, a CSV / TSV file, or every song or picture in a
folder. You see the first few as stills before anything starts. Then the whole batch goes into the render queue as one
row (cancel, pause, time left for the batch), the computer stays awake while it runs, and the videos land in one folder
with a `Batch summary.csv` of what was made. Nothing goes to an AI and nothing is uploaded.

How to get there, no commands needed: **right-click the preview › ✦ More › ⇪ Make › ⧉ Make a batch…** (right under
▦ All formats), **the Lab toolbar's ⋯ › ⧉ Make a batch**, **📐 My templates**: the picker's **⧉ Make a batch…** button
and a card's right-click, **🔎 Lab search** ("many videos", "every song", "csv", or the help answer "How do I make many
videos from one template…"), and **⌘/Ctrl+K** "Lab: Make a batch…". The app's internal command is `/batch`.

## Upgrades

### Ways in
1. **✦ More › ⇪ Make › ⧉ Make a batch…**, right under ▦ All formats.
2. **The Lab toolbar's ⋯ › ⧉ Make a batch**.
3. **📐 My templates' picker**: a **⧉ Make a batch…** button at its foot (it starts from the card you had focused).
4. **A template card's right-click › ⧉ Make a batch…** (starts from that template).
5. **🔎 Lab search** finds it from the menus, and from plain words ("many videos", "bulk", "csv", "spreadsheet",
   "every song", "one per song", "lyric videos"). There's also a short help answer with a button that opens it.
6. **⌘/Ctrl+K "Lab: Make a batch…"** (and Find anything), there before its files load.

### What it starts from and what fills it
7. **From**: any of My templates (the newest first) or **This scene** (the scene on screen as it is now, its unsaved
   slider moves included), in one menu.
8. **Type or paste lines**: one video per line. Each line fills the template's words (its first text), so 20 titles make
   20 videos. Commas in a title stay.
9. **"Each line fills"**: a small menu to point the lines at another field instead (a color, a picture, the song…).
   It only shows for plain lines.
10. **A table**: when the first line names fields, each column fills its field. Columns match by label, by slider key or
    by plain words (`title`, `song`, `music`, `logo`, `picture`, `video`, `colors`). A `name` column gives the file's name.
11. **Open a CSV / TSV…**: commas, tabs or semicolons (a decimal-comma Excel: `1,5` reads as 1.5), quoted cells, line
    breaks inside quotes, a BOM. File paths in it are read from the CSV's own folder.
12. **🔊 Every song in a folder…**: one video per song, sorted like Finder / Explorer (2 before 10). Each title comes
    from the file's name (`01 first_song.wav` → "first song"). Shown when the template has a song.
13. **🖼 Every picture in a folder…**: one video per picture (a logo, a cover). Shown when the template has a picture slot.
14. **Paths that work on both computers**: a Mac path, a Windows path (either slash, a drive letter, a `\\nas\share`
    share), `~/`, `file://` links and `..` are all understood.
15. **An empty cell keeps the template's own value**, so a column only needs the values that change.
16. **Each value is checked for its field**: a number out of range is brought into it, a choice must be one of its
    options, a color must be `#rrggbb`. A song cell can't hold a picture. What doesn't fit is said in one plain line
    under the box ("Row 3: "blue" isn't a color for Background (#rrggbb)"), and that cell keeps the template's own.
17. **Columns that aren't fields** are named in orange (the line's tooltip lists the template's fields).
18. **Missing files**: a row naming a file that isn't there is skipped before anything starts. The line under the box
    says so, and the summary lists it as "skipped".

### Before it starts
19. **A preview grid**: the first 4 videos as stills at the first picked shape, each one with the name its file will
    get. They're drawn by the same hidden export page the renders use, so they show exactly that row's words, colors
    and pictures. They redraw by themselves (a moment after you stop typing) and only when the first rows change.
20. **Formats**: the four shapes (16:9, 9:16, 1:1, 4:5) as small checkboxes. The first time they start from your ▦ All
    formats picks; after that the batch remembers its own.
21. **A recipe on each** (when you have 📜 Recipes): replayed once on a scratch copy of the template, which opens for a
    moment and is then removed, and you're back on your scene. Every row starts from that. The preview shows it too.
22. **File names**: a pattern, `{title} {format}` by default, with a live example under it ("→ Summer 9x16.mp4").
    Tokens: `{title}`, `{format}`, `{size}`, `{n}` (the row's number), `{template}`, `{name}` and any field's name
    (`{song}` gives the song's file name). A token that isn't a field is pointed out.
23. **Names safe on a Mac and on Windows**: no `\ / : * ? " < > |`, no trailing dot, not a Windows device name. Two rows
    with the same title get "(2)".
24. **Length & size** (folded): seconds (empty means the song's length, else the template's own timeline, else 10 s)
    and **Half size** for quick drafts.
25. **One line says what you'll get**: "3 × 2 formats · one after another in the background, into one folder with a
    summary · nothing is uploaded", and the button counts the videos ("⇪ Make 6 videos").

### While it runs and after
26. **One row in the render queue** (⇪ in the rail) for the whole batch, with ■ cancel and ❚❚ pause. Its videos don't
    add rows of their own, and there's one progress line.
27. **Time left for the whole batch**: each video's share of the work (pixels × frames) is known before it starts. The
    pace comes from the videos already made, or the first one's own estimate (renderfast's model).
28. **Kept awake**: powerwise holds the computer awake while the batch is in the queue ("Keeping your computer awake:
    exporting"). It lets go the moment the batch ends, is cancelled or is paused.
29. **Each row is its own video, and the Lab on screen is untouched**: no scene is made per row. The template's scene,
    with that row's values written into its code, is compiled straight for the export page, with its pictures, palette
    and song. MP4 · H.264 with the row's song, through renderfast's streamed encoder.
30. **One folder**: "<template> · batch 2026-10-14 21h05" next to your other exports (never overwritten: "(2)").
31. **`Batch summary.csv`**: one line per video (file, format, size, frames, seconds, made / failed / cancelled /
    skipped, why) with the values each row used. It's rewritten after every video, so a cancelled batch still says what
    it made. It opens cleanly in Excel (BOM, CRLF) and Numbers, and a cell starting with `=` can't run as a formula.
32. **A failure doesn't stop the rest**: the done note says how many were made and the first failure ("⧉ 19 videos
    made · 1 failed: …"), with **Show** (the folder).
33. **Cancel mid-batch**: the video being drawn stops, its half file is removed, what was made stays, and the rest is
    "cancelled" in the summary.

### For the AI (no new tool, no prompt tokens)
34. `/batch [<template> | this] [lines A | B | C | file <csv> | folder <path>] [formats 9:16 1:1 | socials]
    [recipe <name>] [names "{title} {format}"] [secs N] [now]`, plus `status`, `cancel`, `pause`, `resume`. Without
    `now` it opens the dialog for you, filled in; with `now` it starts in the background and says how many videos. A
    director reaches it through `three_do run` (one line in the app map's lab topic, read on demand).

### A fix for every export
35. **Exported frames wait for a reference picture to be decoded** (like they already did for a type layer's font): a
    logo / cover added with `refTexture` no longer risks a blank first frame in an export, All formats or a batch.

**35 upgrades.**

## How it's built
- `tools/three-batch-core.js` (`BatchCore`, no DOM, Node-tested): `parseTable` (RFC 4180 with the usual leniency, the
  separator found by itself), `parseRows` (header or plain lines; columns → fields through `TemplateCore.fieldFor`;
  `cellValue` makes each cell safe for its field), `resolvePath` / `joinPath` (Mac + Windows, UNC, `~`, `file://`, `..`
  folded, never above the root), `folderText`, `fileName` / `safeName` / `uniqueNames`, `folder`, `jobs` (row by row),
  `batchLeft` (the whole batch's time left), `summaryCsv`, `parseArgs` (`/batch`'s words).
- `tools/three-batch.js` (`LabBatch`, lazy group **labbatch**, tier `use`, after `lab`, `labtemplates` and `multiformat`)
  + `tools/three-batch.css`:
  - the dialog;
  - `prep(base, row, format)`: `TemplateCore.apply` with the row's values → a one-clip Lab-sequence edit (`ThreeSeqData`)
    with the song → `ThreeSeq.compile` with the row's scene known to the Lab's scenes for that one synchronous call
    (`virtual`) → the references + palette message;
  - `still` (the preview: `LabExport.openPage` / `loadPlan` / one `xp-frame`);
  - `withRecipe` (`LabTemplates.create` → `LabRecipes.use` → `LabTemplates.sceneNow` → `undoCreate`);
  - `start` (one Progress line, one `Renders.track` row, `LabExport.render({ source: 'seq', edit, compiled, refs, dir,
    stem, track: false })` per video, the summary after each);
  - `/batch`, the ⌘K action.
- `tools/three-batch-hook.js` (`LabBatchHook`, in the **lab** group, tiny): the menu rows and the lazy loader.

## Edits outside the new files (small, additive)
- `tools/three-export.js` (labexport): `render` takes `compiled` (a plan compiled by the caller) and `refs` (a
  references message sent before the plan). Two lines.
- `tools/three-sandbox.html`: `refTexture`'s picture decode joins `TY.pending`, which an exact frame already waits for.
  Two lines.
- `tools/three-templates.js` (labtemplates): the card menu row, the picker's foot button, `sceneNow` exported.
- `tools/three-easy.js`: the ✦ More › ⇪ Make row and the toolbar ⋯ row (guarded by `typeof LabBatchHook`).
- `tools/three-search-core.js` (labsearch): seven phrases and one help answer.
- `lazy-data.js`: the hook in the lab group, the new group, the regenerated manifest.
- `index.html`: `labbatch` on the existing lazy-at.js tag.
- `mcp/hearth-map.js`: one lab-topic line and the aliases `labbatch`, `batch`, `make-batch`.
- `dev/run-checks.js`: the check first in `lab:`, the unit test in UNIT.
- `FEATURES.md`: a short section.

## Tests
- `node dev/labbatch-test.js` (UNIT), **12 tests, all pass**. They cover:
  - CSV parsing: quotes, `""`, line breaks in quotes, BOM, CRLF, blank lines; TSV / semicolon / one column detected;
  - plain lines: commas kept, another field picked;
  - header mapping: labels, keys, plain words, a name column, unknown columns, empty cells keep the default, a titled
    line with a comma isn't a header;
  - cells made safe: clamping, decimal commas, choices, wrong media kinds, bad numbers;
  - Mac paths: relative, `..`, `~/`, `file://`, quotes, a relative path without a folder flagged;
  - Windows paths: drive letters, either slash, `..` never above the drive, UNC, `file:///C:/`, `~\`, `dirOf`; a CSV row
    with a Windows path;
  - every song in a folder: natural order, only sounds, titles from names, read back as rows;
  - file names: tokens, unknown tokens, the fallback name, unsafe characters, CON, length, uniqueness, the folder name;
  - jobs order and the batch's time left (no made-up number before anything is measured);
  - the summary CSV round trip: BOM, CRLF, quoting, formulas defused;
  - `/batch`'s words.
- `dev/checks/labbatch.js` (lab group, `--fake-engines`, real ffmpeg), **22 steps, all pass** (≈ 2 min):
  - not loaded before use, `/batch` known;
  - the ✦ More › ⇪ Make and toolbar ⋯ rows;
  - a template saved from a scene with a Background color slider and a type layer;
  - the picker's foot button and a card's right-click; it opens the dialog with that template and loads the files;
  - a pasted CSV gives "3 rows · columns: Title, Background", "⇪ Make 6 videos" and "→ Alpha 16x9.mp4";
  - **the preview grid**: 3 stills in red / green / blue, named; no export page left open;
  - **3 rows × 2 formats rendered with real ffmpeg** (long side 160, 6 frames):
    - one render-queue row, one progress line, the computer kept awake;
    - 6 MP4s named `Alpha 16x9.mp4` … `Gamma 9x16.mp4` in one folder;
    - h264 160×90 / 90×160, 6 frames each;
    - each video's first frame in its row's color;
    - `Batch summary.csv` with 6 "made" lines and the Title / Background values;
  - **a recipe** (a layer drawing a white stripe): it is in the render, the scratch copy is gone, and the scene on
    screen is back;
  - **cancel mid-batch** (during the second video): 1 made, no half file, 5 "cancelled" in the summary, and the queue
    row says cancelled; `/batch status`;
  - **every song in a folder** (2 WAVs and a picture): 2 rows titled from the names; each video has AAC sound and
    15 frames for 0.5 s;
  - the AI's `/batch "Batch check" lines One | Two formats 1:1 … now` makes 2 × 96×96;
  - cleanup.
- Also run:
  - **pass**: `lazy` (manifest regenerated), `unit:boot-test`, `labtemplates`, `labrecipes`, `multiformat`,
    `labsearch`, `unit:hintcalm-test`, `node dev/labsearch-test.js`, `node dev/appsearch-test.js`.
  - **`powerwise`**: every step passed, but the Electron copy hung on quit and was stopped by hand after its result was
    printed.
  - **`unit:powerwise-test`**: 82 / 83. "hints: no look-again every 0.7 s while Hearth is hidden" fails the same way on
    this round's starting commit, so it isn't from this stream.
  - **`renderfast`**: every equality step passes, but its timing-budget step failed twice under load 10–11 (gain −20 %,
    −4 %). The same check on the starting commit passed once in the same window (+10 %). Its scenes don't use
    `refTexture` and the export changes only act when `compiled` / `refs` are given, so this reads as timing noise
    under load. Worth a re-run on a quiet machine.
- Screenshot looked at: the dialog over the Lab (the pasted CSV, 16:9 + 9:16 ticked, three colored stills on the right,
  "⇪ Make 6 videos"). An earlier picture showed the format checkboxes drawn as tall ovals (a modal-wide label style);
  fixed.

## Caveats / not done
- **Each format gets the scene's own framing**: the batch doesn't reframe per shape the way ▦ All formats does (no
  per-row subject measuring). Scenes that lay themselves out from the frame's size look right; a 3D subject far off
  centre may leave a vertical frame. Use All formats on one row to see it.
- **The recipe is replayed once on the template**, not on each row, so a step that measures the scene (✨ polish, 🩺)
  measures the template's look. The scratch copy it used ends in History's deleted sketches (like My templates' Undo).
- **A video file as the song** (footage templates) isn't used as the sound. Songs are audio files.
- **Music reaction in the render** follows the song as the export page hears it; a hand-placed beat grid belongs to the
  Lab's player song and isn't carried to other songs.
- **The preview** is one still per row at 1 s, at the first picked shape, drawn one at a time (≈ 1–3 s each here).
- Rows: at most 500 a batch. One batch at a time; a second one says so.
- Tested on Linux under Xvfb with software WebGL and real ffmpeg; not yet on the owner's Mac / PC with real songs.

## For the patch notes
- New in the Lab: **⧉ Make a batch**. Turn one of your templates (or the scene on screen) into many videos at once, no
  tokens: right-click the preview › ✦ More › ⇪ Make › **⧉ Make a batch…** (also in the toolbar's ⋯ and in 📐 My templates).
- Type one title per line and you get one video per title. Or open a CSV whose first line names the fields (Title,
  Song, Logo, Background…), or pick **every song in a folder** (the titles come from the file names) or every picture.
- Tick the shapes you want (16:9, 9:16, 1:1, 4:5), add a 📜 recipe if you like, and choose how files are named
  ("{title} {format}" → "Summer 9x16.mp4").
- The first four show as pictures before anything starts, so you can catch a typo or a wrong color.
- The batch runs in the render queue as one row with pause, cancel and the time left for the whole batch. Your
  computer stays awake until it's done.
- Everything lands in one folder with a **Batch summary.csv** listing every video (or why one wasn't made).
- You can also ask the director: "make a batch of my Neon title template with these titles: …".
- Caveat: each shape uses the scene's own framing; for per-shape reframing of one video, use ▦ All formats.
