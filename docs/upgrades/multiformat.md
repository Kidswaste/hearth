# ▦ All formats (round 33, multiformat): one export, every shape

You post the same Lab visual to several apps ("Always give a 9:16 version too"). **▦ All formats** exports the Lab
scene (or the Lab sequence) to the shapes you tick (**16:9, 9:16, 1:1, 4:5**) in one go. Each shape gets its own
framing so the subject stays in the picture, and you can adjust it on a small preview before anything is made. The
videos are made one after another in the background with one progress line, and they land in one folder with clear
names. Nothing is uploaded and no AI is used (0 tokens).

How to get there (no command needed): **right-click the preview › ⇪ Export › ▦ All formats…**, **✦ More › ⇪ Make ›
▦ All formats** (first row), **the Lab toolbar's ⋯ › ▦ All formats**, **📮 Ready to post › ▦ All formats** (bottom
row), or ⌘/Ctrl+K "Lab: All formats". The app's internal command is `/all-formats`.

## Upgrades

### The picker
1. **▦ All formats**: one small dialog with the four shapes side by side (16:9 · 9:16 · 1:1 · 4:5), each with what
   it's for (YouTube, Shorts / TikTok / Reels, Instagram feed, Instagram portrait).
2. **Checkboxes, remembered**: the first time, the Lab's own shape + 9:16 are ticked. After that, what you ticked last.
3. **One line says what you'll get**: how many MP4s, how long (the loop, 10 s from the playhead, or the whole
   sequence), "one after another in the background, into one folder · nothing is uploaded".
4. **This scene or the sequence**: with ▤ Sequence open it exports the sequence (footage keeps the framing you gave it
   per format in the sequence); otherwise the scene on screen, with your sliders as they are now.

### A preview per shape, the subject kept in frame
5. **A real picture per shape**, drawn by the same hidden export page the exports use (the playhead's frame, at that
   shape's own composition), one page at a time, closed right after.
6. **Drawn zoomed out (2.5×)**, so every adjustment is a crop of that one picture: moving and zooming are instant and
   nothing is drawn again.
7. **Where the subject is, measured**: what stands out from the background in that picture.
8. **Framed by itself**: a subject already in frame stays as the scene frames it. One outside the frame is moved
   back in. One too wide is zoomed out just enough. A scene that fills every shape keeps its own framing.
9. **Clear of the apps' buttons**: the frame keeps the subject inside a safe line, using Ready to post's safe areas
   (the vertical apps' top bar, side buttons and caption; YouTube's bars). A corner stamp doesn't count.
10. **The dashed safe line on each preview**, so you can see where the apps' buttons stop.
11. **A short note under each one**: "as it is", "auto · 80 %" or "yours · 64 %" (hover for why).

### The nudge
12. **Drag a picture to move the framing**, scroll on it to zoom.
13. **− / +** to zoom out / in, **↺** to go back to the automatic framing.
14. **Kept inside the picture**: you can't move or zoom out past what was drawn (from 40 % to 300 %).
15. **Remembered per scene** (your last 40 scenes or sequences): open it again and your framing is there.

### The exports
16. **Exactly that framing in the video**: the export page pans / zooms every scene camera's picture for that shape (a
    wider or narrower lens plus a shifted frame, put back after each draw, so the scene's code never sees it).
    Full-screen effects, reflections and environment cubes are left alone.
17. **One after another in the background**: the dialog closes at once. The Lab stays usable. Each export uses the
    hidden export page (frame-exact, seeded, full quality).
18. **One progress line** ("▦ All formats · 16:9 · 9:16", with "9:16 (2 of 2) · frame 120 / 300 · 12 s left") and
    **one render-queue row** with ■ cancel and pause.
19. **One folder**: "<scene> · all formats 2026-10-13 21h05" next to your other Lab exports (never overwritten: "(2)").
20. **Clear names**: "<scene> 16x9 1920x1080.mp4", "<scene> 9x16 1080x1920.mp4", "<scene> 1x1 1080x1080.mp4",
    "<scene> 4x5 1080x1350.mp4", MP4 · H.264 with the song.
21. **A done note**: "3 formats ready in …" with **Show** (the folder in Finder / Explorer). If one shape fails, the
    others are still made and the note says which one failed.
22. **Nothing uploaded, no tokens**: everything happens on this computer, like Ready to post.

### Ways in
23. **Right-click the preview › ⇪ Export › ▦ All formats…**
24. **✦ More › ⇪ Make › ▦ All formats** (first row; the Lab audit lists it).
25. **The Lab toolbar's ⋯ › ▦ All formats**.
26. **📮 Ready to post › ▦ All formats** (bottom row): closes the kit and opens the picker on the Lab scene.
27. **⌘/Ctrl+K "Lab: All formats (16:9, 9:16, 1:1, 4:5 in one go)"**.
28. **For the AI**: `/all-formats [16:9 9:16 1:1 4:5 | socials] [now] | status | cancel` (no words opens the picker;
    "now" exports the remembered picks and framing at once), and one line in the app map's lab topic (read on demand:
    no prompt tokens, no new Director tool).

**28 upgrades.**

## How it's built
- `tools/three-formats-core.js` (`FormatsCore`, no DOM, Node-tested): the shapes and sizes, the picks' defaults, the
  overscan crop (`view`), the nudge's limits (`clamp`), the safe box from publishkit's zones (`safeBox`), where the
  subject is (`subjectBox`: difference from the border's median color, its 4–96 % extent), the automatic framing
  (`autoFrame`: no change when it's in; else the smallest zoom-out, centred in the safe box; near the picture's edge,
  the framing that leaves the least of the subject outside), the names.
- `tools/three-formats.js` (`LabFormats`): the dialog, the previews (`LabExport.openPage` with a small pixel ratio and
  the export's own CSS size, `reframe` at 1 / 2.5, one `xp-frame` JPEG), the nudge, `exportAll` (one Progress line,
  one Renders row, `LabExport.render` per shape with `reframe`, `dir`, `stem`, `track: false`), `/all-formats`.
- `tools/three-formats.css`. Lazy group **multiformat** (tier `use`, after `lab`): nothing loads until you open it.

## Edits outside the new files (small, additive)
- `tools/three-sandbox.html`: a "reframe" block (`RF`, `rfSet`, `rfApply`: the projection matrix pre-multiplied by a
  2D zoom / shift for the draw, restored right after; full-screen ortho passes, cube cameras and nested renders
  skipped), one line in the render wrapper, one message line.
- `tools/three-export.js` (labexport): `openPage` takes an optional `pg`; `render` takes `reframe`, `dir`, `stem` and
  `track: false` (no own progress row: the batch shows one); `loadPlan`, `sceneEdit`, `compileLive`, `aspectKey`,
  `frameNow`, `playhead` exported; the ⇪ Export submenu row.
- `tools/three-easy.js`: the lazy loader (`LabEasy.formats`), the ✦ More › ⇪ Make row, the toolbar ⋯ row.
- `publishkit.js`: the ▦ All formats button in the kit's bottom row (shown when the Lab is loaded).
- `lazy-data.js` (group + regenerated manifest), `index.html` (`multiformat` on the existing lazy-at.js tag),
  `mcp/hearth-map.js` (one lab-topic line), `dev/run-checks.js` (check in `lab:`, unit test in UNIT).

## Tests
- `node dev/multiformat-test.js` (unit group), 13 tests: sizes (even, in shape), defaults and remembered picks, nudge
  limits, the crop a nudge shows, `toPage` (y up), the subject box on a synthetic picture (and none on an empty one),
  auto framing (in frame stays; a wide subject in 9:16 ends inside the safe box; an off-centre one is moved, not
  shrunk; one past the picture's reach ends as far in as it can; a full-frame scene keeps its framing), the safe box
  from publishkit's zones (a corner stamp ignored), names.
- `dev/checks/multiformat.js` (lab group, `--fake-engines`), **24 steps, all pass**. It uses a 3D scene with a red box
  on the right of a 16:9 frame. It checks the ways in, the lazy load on first use, and the picker (4 checkboxes;
  16:9 + 9:16 the first time; a pick remembered). There are 4 previews in the right shapes, and no export page is left
  open. 16:9 keeps its own framing. In 9:16 the scene's own framing has 0 red pixels and the automatic reframe has
  thousands, and the card shows that crop. A drag pans by exactly the dragged share, wheel and − zoom out, the nudge is
  remembered per scene, and ↺ goes back to auto. Two exported 90×160 stills compare without and with the reframe:
  0 vs 900+ red pixels. Then a real export of 16:9 + 9:16 (long side 160, 6 frames): ffprobe gives h264 160×90 and
  90×160, 6 frames each. There's exactly one progress line (no per-job rows), one folder with the 2 clearly named MP4s
  and no temp frames left, and `/all-formats status` lists them. 📮 Ready to post › ▦ All formats closes the kit and
  opens the picker. Cleanup leaves nothing open or running and no export page, and the files are removed.
- Also run and passing: `sh dev/run-checks.sh lazy unit:boot-test labeasy labexport publishkit` and
  `unit:director-mcp-test` (the app-map line; no Director op added).
- The screenshot of the dialog over a 16:9 scene was checked by eye: compact, four cards in one row, the 9:16 card
  showing the box brought back into frame.

## Risks / not done
- The reframe works on 3D scene cameras. A 2D canvas layer, a full-screen shader and a title keep their own layout at
  each shape (they follow the page's size as before). Footage in a sequence keeps its own per-format framing.
- "The subject" is what stands out from the background color at the playhead. A scene with a busy full-frame background
  reads as "fills every shape" and keeps its own framing. You can nudge it by hand.
- The preview is one frame at the playhead. A subject that travels far across the clip can leave the frame later.
- The sequence path (▤ Sequence open) uses the same machinery but isn't covered by the check.
- Screen-space effects (bloom radius, grain size) are drawn for the reframed picture, as they should be. A sketch that
  reads its own camera's projection matrix during the draw sees the reframed one.

## For the patch notes
- New: **▦ All formats**. Export your Lab scene as 16:9, 9:16, 1:1 and 4:5 in one go. Tick the shapes you want and
  Hearth remembers them (the first time, your frame's shape + 9:16).
- Each shape shows a small preview first. If your subject would fall out of a vertical or square frame, Hearth moves
  or zooms the framing so it stays in, clear of the apps' buttons (the dashed line).
- Not quite right? Drag a preview to move it, scroll (or − / +) to zoom, ↺ to go back. Your framing is remembered for
  that scene.
- The videos are made one after another in the background with one progress line. They go into one folder, named like
  "My scene 9x16 1080x1920.mp4".
- Find it: right-click the preview › ⇪ Export › ▦ All formats, ✦ More › ⇪ Make, the Lab toolbar's ⋯, or the
  ▦ All formats button in 📮 Ready to post.
- Nothing is uploaded and no AI is used: 0 tokens.
- Caveat: the reframe moves 3D cameras. Flat 2D layers and full-screen shaders keep their own layout in each shape.
