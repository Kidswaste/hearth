# Cut: clip editing in Video Review and the Lab (round 6)

You asked: "Allow me to cut clips in the timeline, especially video, and pack in other features in that vein."
Video Review now has a compact, keyboard-first clip editor. Press **E** (or **✂** in the transport) on any video: the
timeline becomes a clip track, the player plays the edit, **⇪ Export** renders it with ffmpeg. Nothing on screen
changes until you ask for it (one ✂ button), there are no new settings, and every action is also a chat command
(area "Video", `/help cut`). The edit is a list saved per video: your files are never touched.

## The clip track (42)
1. **E / ✂ / `/cut`**: the timeline of the open video turns into a clip track (E, Esc or ✕ goes back to the review).
2. **Clips you can read**: a filmstrip and the clip's own waveform in every clip, a color per source file, name · speed · 🔇 tags.
3. **The player plays the edit**, seamlessly: the next clip waits preloaded at its first frame in a second decoder, so a cut is instant (a plain split keeps the same decoder running).
4. **Split at the playhead: S** (`/split [time]`).
5. **Click a clip** selects it and puts the playhead there; Shift+click selects several.
6. **Del** deletes and leaves a black gap of the same length (`/cut-delete [n…]`).
7. **Shift+Del ripple-deletes**: the clips after it close up (`/ripple-delete [n…]`).
8. **Remove a range**: with I / O set and nothing selected, Shift+Del cuts the range out (Del leaves it black).
9. **Trim by dragging a clip's edge** (ripple: the rest follows).
10. **Snapping** while you drag: beats and bars from the music analysis, cuts, markers, notes, the playhead, in / out (a cyan line shows it; hold Alt for free).
11. **Q / W** trim the clip's start / end to the playhead (`/trim-start`, `/trim-end`).
12. **Drag a clip to reorder** (a gold line shows where it lands; `/move-clip 3 1`).
13. **D duplicates** a clip (also ⌘/Ctrl+D; `/dup-clip`).
14. **A mutes** a clip's sound (`/clip-mute`).
15. **Speed 0.25×–4×** per clip with **[ / ]**, the sound keeps its pitch, in the preview and in the export (`/clip-speed 2`).
16. **Fades**: drag the gold squares on the selected clip, or the clip menu's 0.25 / 0.5 / 1 / 2 s presets; picture and sound fade in the preview and the export (`/clip-fade in|out|both <s>`).
17. **J / K / L** in the edit: L plays at 1× → 2× → 4×, J scrubs backwards, K stops.
18. **← / →** step one frame of the edit (Shift: 10).
19. **↑ / ↓** jump to the previous / next cut.
20. **, / .** jump to the previous / next beat (in the edit's time, speed included).
21. **I / O** set the edit's in–out range (it plays as a loop and is what the export renders); **X** clears it (`/cut-range`).
22. **M** drops a marker (gold flag; `/marker [label]`, `/markers`).
23. **Your notes show on the clip track** at every place their frame appears (category colors); clicking a note in the list jumps there in the edit.
24. **Undo / redo**: ⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z (or Ctrl+Y), the ↶ button (`/cut undo`, `/cut redo`).
25. **Freeze frame**: Shift+F holds the picture at the playhead for 1 s (`/freeze-frame [s]`).
26. **Title card**: Shift+T or `/title-card NEON TUNNEL 2` inserts white words on black, sized to the frame; double-click it to edit the words.
27. **Gaps are clips** (black, silent): ⋯ → Close the gaps (`/cut-close-gaps`).
28. **Drop video files on the track**: they go in at the nearest cut (or at the end).
29. **Drag library cards onto the track** to add them (several sources, Lab recordings included).
30. **Right-click a library card → ✂ Add to the cut** of the open video.
31. **⋯ → Add a video…** and `/cut-add <name> [from] [to]` (a part of another render).
32. **Auto-cut on the music** (⋯ or `/cut-auto`): every bar, 2 bars, 4 bars, every beat, on the drops or at the song's sections. It's a suggestion first (dashed ✂ lines, "Apply ⏎" / Esc); nothing changes until you accept.
33. **Auto-cut at your markers and notes** (`/cut-auto markers`).
34. **Clip menu** (right-click): split, delete, ripple delete, duplicate, mute, speed ▸, fade in ▸, fade out ▸, trims, freeze frame, edit title, open the source, show the file.
35. **The edit as text**: `/clips` lists every clip (times, source, range, speed, fades); ⋯ → Copy the edit list.
36. **Back to the whole video**: ⋯ (or `/cut reset`), undoable.
37. **Non-destructive and kept**: the edit is saved per video (data/kv/video-cuts.json) and comes back the next time you press E.
38. **✂ badge** on library cards that have a cut.
39. **Same frame both ways**: entering the cut starts at the review's playhead, leaving it puts the review on the frame you were on.
40. **The transport follows the edit**: time box and total in edit time (type a time and Enter), ⏮ ⏭, play, frame steps.
41. **Keys sheet**: ? in the cut (`/cut keys`); E is listed in Video Review's own ? sheet.
42. **No silent surprises**: N / P / C / Y (notes, picker, compare, scopes act on the source) say "E leaves the cut" instead of acting on a hidden video.

## Export the cut (10)
43. **⇪ Export → new version**: the cut is rendered next to the video as the next version (`neon_tunnel_v2` → `neon_tunnel_v3.mp4`), high quality H.264, and shows in the library grouped with its versions (`/cut-export`).
44. **Social presets**: TikTok, Reels, Shorts, feed 4:5, Square, YouTube 1080p, with your crop position from the crop preview, or fit / blurred fill (`/cut-export reels blur`).
45. **All 4 socials** (9:16 · 4:5 · 1:1 · 16:9) one after another, crop or blurred fill (`/cut-export-all`).
46. **GIF loop** of the cut (palette-optimized).
47. **PNG stills**: every frame of the cut into a folder (`/cut-export stills`).
48. **WebM (VP9)** and **ProRes 422 HQ master** of the cut.
49. **Only the in–out range** when one is set.
50. **Progress with Cancel**, then Open (or Show in folder for stills).
51. **Mixed sources just work**: other shapes are letterboxed into the frame, frame rates unified, files without sound get silence, everything 48 kHz stereo, speed changes keep the pitch (atempo).
52. Checked with ffprobe: lengths match the edit to the frame, the right source shows after each cut, freeze frames hold, gaps are black.

## The Lab's timeline: trim, cut, send (6)
53. **Trim the song**: { and } at the playhead, or right-click the waveform → "Song starts here / Song ends here": the sketch only hears that part (it stops at the out point, or loops back to the in point when Loop is on) (`/song-trim 0:04 1:32`, `/song-trim in|out`).
54. **The trim shows**: outside it is dimmed on the timeline and the overview, cyan brackets at in / out.
55. **Untrim** from the same menu or `/song-trim off`; the trim is kept per song with its grid and markers (and Ctrl+Z undoes it).
56. **Save the loop (or the trim) as a file** next to the original, with ffmpeg (`/cut-loop`, right-click the waveform); a video part joins Video Review's library.
57. **Send to Video Review as a clip**: the Lab video's loop (or trim) lands on the ✂ track of the video open there (`/send-clip`, right-click the waveform).
58. The Three Director sees the trim in the song info.

## Flows, Ctrl+K, the director, smoothness (9)
59. **Flow step "Auto-cut on the music"** (Video Review → Flow).
60. **Flow step "Export the cut"** (new version or any preset).
61. Ctrl+K → **Video: cut clips (E)**.
62. Ctrl+K → **Video: auto-cut on every bar**.
63. Ctrl+K → **Video: export the cut as a new version**.
64. **⋯ More → ✂ Cut clips (E)** in Video Review.
65. **The Video Director knows the cut**: `video_status` lists its clips and length when the video has one (only then, so no extra tokens otherwise).
66. **Video Review's playhead now glides on the compositor** (one animation while playing, re-timed only on play / pause / seek / drift): no style write per frame.
67. **The clip track is light**: its playhead is a compositor animation, the canvas is redrawn only when the edit changes, repaints are contained (≈3 DOM changes a second while the edit plays).

## Chat commands (26) — area "Video" (the Lab's three in "Three.js Lab")
68. `/cut [on|off|reset|undo|redo|keys]`
69. `/split [time]`
70. `/clips`
71. `/clip <n>`
72. `/ripple-delete [n…]`
73. `/cut-delete [n…]`
74. `/trim-start [time]`
75. `/trim-end [time]`
76. `/move-clip <n> <m>`
77. `/dup-clip [n]`
78. `/clip-speed <x> [n…]`
79. `/clip-mute [n…] [on|off]`
80. `/clip-fade <in|out|both> <s> [n…]`
81. `/freeze-frame [s]`
82. `/title-card <text> [s]`
83. `/marker [label]`
84. `/markers`
85. `/cut-auto <bars|2bars|4bars|beats|drops|sections|markers|apply|off>`
86. `/cut-close-gaps`
87. `/cut-range <in> <out> | off`
88. `/cut-add <video> [from] [to]`
89. `/cut-export [new|tiktok|reels|shorts|feed45|square|yt1080|gif|webm|master|stills] [crop|fit|blur]`
90. `/cut-export-all [crop|blur|fit]`
91. `/song-trim <in> <out> | in | out | off`
92. `/cut-loop`
93. `/send-clip`

`/split`, `/marker` and the others share their names with other tools through `when`: in Video Review (or its
director's chat) they cut, elsewhere they keep doing what they did. 0 duplicate names (`dev/checks/qa-commands.js`).

**Total: 93 upgrades.**

## How it's built
- `tools/cut-data.js` (`CutData`, loads in Node): the edit list and its operations (split, ripple / lift, trims,
  move, duplicate, speed, fades, freeze, titles, markers, slices), program ↔ source time, snapping, beat suggestions
  and the ffmpeg graph (per clip `trim` · `setpts` · `atempo` · `fade` / `afade` · fit to the frame → `concat` →
  the preset's scale / crop / blur from `VideoData.presetFilters` and encoder from `VideoData.codecArgs`).
- `tools/video-cut.js` (`VideoCut`): the clip track, the program player (two `<video>` decoders + a picture for
  titles, `requestVideoFrameCallback` switches on a clip's last frame, fades as one WAAPI animation per clip), keys,
  menus, export through `Review.startJob` (shared with single-file exports).
- `tools/cut-cmds.js`: the chat commands. Small hooks in `tools/review.js` (transport / keys / tick delegate to the
  edit while it's on, card badge / drag / menu, `startJob`, compositor playhead), `tools/three-media.js` (trim, cut,
  send), `tools/three-sandbox.html` (the song stops / loops at the trim), `tools/three.js` (`api.cmd.player`),
  `nodes-video.js` (two steps), `tools/ae.js` (Ctrl+K), `tools/video.css`.

## Tested
- `node dev/cut-test.js <test videos>`: 51 checks (operations, mapping, snapping, suggestions) plus real ffmpeg
  renders verified with ffprobe: program length = video and audio length, the right source on each side of a cut
  (frame colors), a freeze that holds, a black gap, a 1:1 preset, an in–out slice, GIF, PNG sequence, blurred fill.
- `node dev/smoke.js --lib dev/checks/journey-lib.js --script dev/checks/cut.js` (after `sh dev/make-test-videos.sh`):
  real keys and mouse: E / ✂, frame steps, S, edge drag that snaps to a beat, undo / redo, reorder by drag, D, A,
  ] speeds, Del / Shift+Del, M, I / O / X, fades by command and by dragging the gold square, auto-cut on bars with
  Enter, markers → cuts, Shift+F, title card, `/cut-add`, a library card dropped on the track, the whole 8-clip edit
  played with every frame sampled (right source and time after each cut: 1 boundary sample off in 232), DOM changes
  while playing (3/s), compositor playheads, exports checked with ffprobe (new version v3 in the library, square
  1080×1080 of the in–out range, GIF, 60 stills), the director's status, kv saved, ✂ badge, the Lab's `/song-trim`,
  `/cut-loop` (3.00 s file), `/send-clip`, and a flow (library → auto-cut → export the cut).
- `sh dev/journeys.sh video` (unchanged journey still passes), `dev/checks/nodes-video.js`, `dev/checks/qa-commands.js`
  (0 duplicates), the single-file export arguments are byte-identical to before the `presetFilters` refactor (324 cases).

## Not done / notes
- One video track (no layered tracks or transitions between clips beyond fades through black); the clip track always
  shows the whole edit (no zoom); reverse playback (J) scrubs rather than plays sound backwards.
- The Video Director has no cut tool of its own (that would grow its tool list every message); it sees the cut in
  `video_status`, and the chat commands do everything.
