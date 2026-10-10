# Renders (round 13): one render queue for everything Hearth renders, records or exports

You asked to keep packing upgrades, with progress bars and named makes for everything that gets created. Rendering
was spread out: Video Review exports had a toast with a percentage, the Lab sequence its own panel and toast, the
editor and video projects went through Video Review, recordings had their own note, and two renders at once fought
for the CPU. Now there is **one queue**: every render, export and recording shows in it with a progress bar and time
left, runs in the background while you keep working, can be paused, cancelled and retried, belongs to its make, and
says when it's done with the buttons you need. A failure says why in plain words, with the fix.

Where it is (no new row of buttons): a small **⇪** at the bottom of the rail that shows only while something renders
(or a failure waits to be seen); `/renders` in any chat; ⌘/Ctrl+K; Video Review's Export menu; the Lab sequence's
render panel ("More formats…").

Counted honestly: one line per thing you can see or use.

## One queue
1. **Everything in one list**: Video Review exports, the video editor's renders, video projects (`/intro`), the Lab sequence's renders, comp and scene renders, recordings, and the renders you start from the presets.
2. **One ffmpeg render at a time**, the others wait their turn ("waiting · 2 in line"), so the app stays smooth.
3. **Renders at once: 1, 2 or 3** (right-click ⇪ › More, or `/renders parallel 2`) when you'd rather go faster.
4. **The Lab lane**: sequence renders take the Lab preview one at a time; one asked while another runs waits in line instead of failing with "A render is running".
5. **In the background**: renders keep going while you work in another chat or tool.
6. **A progress bar per render** (the round 11 bars), with the real number, the frame, and **time left** from the measured speed.
7. **Waiting renders look waiting** in the bars list (paused style, "waiting · next"), not stuck at 0 %.
8. **Pause / resume an ffmpeg render**: on the Mac it is suspended and continues exactly where it was; on Windows (no suspend there) it stops quietly and starts again from the top when resumed.
9. **Pause / resume a Lab sequence render**: its frames stop, then go on.
10. **Pause / resume a recording** from the queue.
11. **Cancel anything** (waiting, running or paused); whatever asked for it hears it ended.
12. **Retry** a failed or cancelled render.
13. **⤒ Next in line** puts a waiting render first.
14. **Pause all / Resume all / Cancel all** (right-click ⇪).
15. **It joins its make**: made in a make's room, a render carries the make's mark and color on its row, its file carries the make's name ("Rose Bloom · clip_square….mp4") and becomes one of the make's outputs.
16. **Renders that were waiting when Hearth closed** are offered at the next start ("Render them").

## Presets: one place to pick them
17. **The Render panel** (⇪ Render… in the list, right-click ⇪, ⌘/Ctrl+K, Video Review's Export menu, the sequence's "More formats…"): what to render, then the presets as chips, grouped Socials / YouTube / Web / Master.
18. **Reels / TikTok / Shorts 9:16**: one file for the three (1080×1920, 30 fps, 12 Mbps).
19. **Story 9:16**, cut at 60 s.
20. **Feed 4:5** (1080×1350).
21. **Square 1:1** (1080×1080).
22. **YouTube 1080p** at the source's frame rate.
23. **YouTube 4K** (3840×2160).
24. **GIF loop** (720 wide, 15 fps, palette-optimized).
25. **WebM (VP9 + Opus)** for websites; refused with the fix when this ffmpeg has no VP9.
26. **ProRes master** (422 HQ, 4444 on Best, 24-bit sound); when ffmpeg has no ProRes encoder, a near-lossless H.264 master instead (and it says so).
27. **Audio only** (AAC 256k .m4a; Best: WAV 24-bit).
28. **✦ All socials**: Reels / TikTok / Shorts, Feed 4:5, Square and YouTube 16:9 in one click, one after the other.
29. **Frame rate** per render: the preset's own, 24, 30 or 60 fps.
30. **Quality** per render: Draft (small, quick), High (for posting), Best (near lossless).
31. **Size** per render: full, ⅔ or half.
32. **Reshape** when the shape changes: crop to fill, blurred fill, or fit with bars.
33. **What to render**: the video open in Video Review, the Lab sequence, or any file.
34. **The Lab sequence renders a preset at its real pixels** (9:16, 4:5, 1:1, 16:9, frame by frame, with the song); GIF, WebM, ProRes, audio, 4K and Story are its render converted right after (a two-step chain that shows as such).
35. **Your last choices are remembered** (presets, frame rate, quality, size, reshape, source).
36. **Files land next to the source in "exports"** and never replace an older one ("… (2).mp4").

## When it's done
37. **A quiet note** with the file's name, size and time, and **Open · Reveal in Finder** (Show in Explorer on Windows) **· Copy path · Open in Video Review**.
38. **A chain says it once**, when its last step is done.
39. **One note, not two**: Video Review's and the sequence's own "done" notes give way to the queue's.
40. **Hearth's icon flashes** when a render finishes while you're in another app.
41. **A failure in plain words, with its fix** (source moved, disk full, no permission to write there, missing encoder, damaged or unfinished source, no sound for audio only, odd size, the Lab preview stopped answering, the Lab not open, empty sequence, ffmpeg not installed, stopped from outside…), and the fix in your system's own words (Finder / Trash / Privacy & Security on the Mac, Explorer / Recycle Bin / Controlled folder access on Windows).
42. **The failure note has ↻ Retry**, and ⇪ stays red until you've looked.
43. **Failures go in your error log** (`/habits errors`) with their fix.
44. **Why it failed…** (right-click) shows ffmpeg's own last line too.
45. **History**: every past render, export and recording (size, when, in the Trash or not), kept across restarts.
46. **↻ Re-render (same settings)**: a new file next to the first.
47. **Move to Trash** (Recycle Bin on Windows) from the list or `/renders trash`.
48. **Remove from the list / Clear finished** (the history keeps them; `/renders clear all` empties both, files stay).

## Getting there
49. **⇪ at the bottom of the rail**, only while something renders (or a failure is unseen): how many, and a tooltip with each one's progress.
50. **Right-click ⇪**: render with a preset, all socials, the queue, history, pause / resume / cancel all, renders at once, clear.
51. **Right-click a render** (or its ⋯): pause / resume / cancel, next in line, Open, Reveal, Copy path, Video Review, Retry / Re-render, why it failed, its make, Trash, remove.
52. **⌘/Ctrl+K**: "Renders: the render queue", "Render with a preset…", "Render for all socials".
53. **Video Review › Export**: "⇪ Render with a preset… (the render queue)" at the top.
54. **The Lab sequence's render panel**: "More formats…" opens the presets with the sequence picked.
55. **The keys sheet** lists the two right-clicks.

## From chat
56. **`/renders`** (also `/rq`): what renders now and the last ones, numbered; the list opens.
57. **`/renders render reels square [seq | <file>]`** with `fps=60`, `quality=best`, `size=half`, `fit=blur`; no preset opens the panel.
58. **`/renders socials`**: all socials of the open video (or sequence).
59. **`/renders presets`**: every preset with its size, frame rate and tip.
60. **`/renders pause | resume | cancel [n | all]`**.
61. **`/renders retry [n]`** and **`/renders again [n]`** (re-render with the same settings).
62. **`/renders open | reveal | copy | review | trash [n | last | words of its name]`**.
63. **`/renders history`** and **`/renders clear [all]`**.
64. **`/renders parallel 1-3`**.
65. **Plain names for presets**: reels, tiktok, shorts, 9:16, story, feed, square, youtube, 4k, gif, webm, prores, master, audio, "all socials".
66. **The app map has a `renderqueue` topic** (also queue, presets, exports) for Claude and Astra, read on demand: no tokens unless asked.

## Smooth (round 5 / 12 rules)
67. **No DOM writes per ffmpeg event**: events only update the queue's numbers; the open list and ⇪ repaint at most twice a second, compare before writing, and stop when the window is hidden or nothing runs (measured: 4–5 DOM changes a second while the list is open on a running render, 0 when idle).

**Count: 67 upgrades.**

## For development (not counted)
- `renders-core.js` (`RendersCore`, no DOM, Node-tested): presets, `pick`, `resolve`, `buildArgs(VideoData, id, src, opts)`, `seqPlan`, `outPath`, `nextFree`, `explain`, `schedule` (lanes ffmpeg / lab / live), `place`, `eta`, formatting.
- `renders.js` (`Renders`): `transcode(spec, overrides, meta)` (the hook in `Review.startJob`: same id, same `video:job-event` events, so every caller keeps working), `track({ kind, title, pk, cancel, pause, again, quiet })` (the hook in the Lab's `renderEdit`; recordings are tracked from `hearth:recording`), `enqueue`, `enqueueSeq`, `pause`, `resume`, `cancel`, `retry`, `trash`, `open`, `panel`, `owns(id)`; kv `renders` (history + waiting renders), `store` `renders.last` / `renders.parallel`.
- `renders-cmds.js`: `/renders`. `renders.css`: the badge, list, panel, notes.
- `rendersmain.js` (main side, one line in `main.js`): `renders:run` (aemain's ffmpeg runner, a Windows pause swallows its own end), `renders:pause` / `resume` (SIGSTOP / SIGCONT), `renders:cancel`, `renders:relay` (an event for a job that never reached ffmpeg), `renders:encoders`.
- Small hooks outside the lane: `aemain.js` (exports `transcode` and its job map), `main.js` (1 line), `preload.js` (`hub.renders`), `tools/review.js` (`startJob` through the queue, no progress toast when it exists, done / failed notes left to the queue, the Export menu entry), `tools/three-seq.js` (`renderEdit`: `Renders.track` + done / fail, a pause check in `renderFrames`, no duplicate note, the panel's "More formats…"), `mcp/hearth-map.js` (topic), `index.html` (3 scripts, 1 stylesheet), `dev/run-checks.js` (`renders` group).
- Tests: `node dev/renders-test.js` (20: presets, words → presets, per-render choices, encoder fallbacks, arguments, sequence plans, Mac / Windows paths, free names, failures → reason + fix per system, the scheduler and lanes, places in line, time left, history, and every preset rendered for real with ffmpeg and checked with ffprobe); `dev/checks/renders.js` (three presets queued: one runs, two wait, the badge, waiting bars; pause holds the number, resume; cancel a waiting one; files probed; the done note's buttons; a Video Review export through the queue with one note; a make's room: mark, output, file name; a missing source → plain words + fix + Retry + /habits; re-render → "(2)"; Trash; history + right-click; a recording; the panel: chips, all socials, details, remembered; pause all / cancel all; DOM writes while running and idle); `dev/checks/renders-seq.js` (a sequence render from the sequence shown, paused from the queue, one note; Square at its pixels and a GIF chain from the queue, one at a time in the Lab; cancel frees the Lab; a comp / scene render shown; re-render through the queue). `sh dev/run-checks.sh renders` runs the three.
