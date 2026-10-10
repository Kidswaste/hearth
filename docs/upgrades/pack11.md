# Pack 11 (round 11): the editor, the mood board and capture, packed further

You said "keep packing upgrades": this round closes the known gaps in the video editor, the mood board and capture,
and adds the pro tools those three were missing. Nothing new sits on screen: everything is behind the menus you
already have (the editor's ⋯ › **Pro tools**, right-click a clip or a track, ＋ Add here, Export › **Render queue**;
the Board menu and right-click; Capture › Settings › Recording, the Tours menu), a chat command, and the agents'
tools (Claude and Astra).

## Gaps closed: the editor
1. **Music and voice-overs are heard in the preview.** Sounds on audio tracks used to play only in the render; now each one plays in step with the editor's clock, with its volume keys, fades and the track's mute.
2. **Sound effects are heard while you edit** (`/sound-effect echo`, right-click › Sound effects): the clip's sound runs through a live twin of the render's filter (EQ, compressors, echoes, rooms, stereo tricks, tremolo / auto-pan / chorus / flanger / phaser, bit-crush…). 35 of the 39 effects have a twin; the four without one (pitch up / down that keep the length, gate, noise reduction) say "heard in the render" when you pick them.
3. **Reversed clips are heard backwards** in the preview (and the Backwards effect too).
4. **Reversed clips play backwards in real time**: Hearth makes a reversed copy of the clip's part once (ffmpeg, in the background) and plays it forward; until it exists, the old frame-stepping is used, and paused frames stay exact.
5. **The real-time WebM export says how long it is** (no more "--:--" in players; scrubbing works): its header gets the length written, without ffmpeg.
6. **The real-time WebM export carries the music, voice-overs and sound effects** (mixed into its one sound track).
7. Picking a sound effect no longer says "heard in the render" unless it really is render-only.

## Gaps closed: the mood board
8. **Copied board items paste after a restart** (they are kept, not only in memory); a stale copy never pastes its marker as a note.
9. **A bare address becomes a website card**: paste or type `example.com/page`, `www.site.io`.
10. **A list of links becomes one website card each**, side by side (paste or drop several lines of links), instead of one note full of links.

## Gaps closed: capture
11. **A busy computer no longer loses the take**: when the encoder falls behind (no data for 4 s, or far fewer frames than the clock asks), the take drops to half the frame rate (down to 10 fps) and carries on; the toast after it says "the computer was busy: recorded at 15 fps", and the result tells the chats (`slowedTo`).
12. A recording made without ffmpeg (a WebM) gets its length written in its header too.

## New in the editor (⋯ › Pro tools, right-click, chat, `video_edit` for Claude / Astra)
13. **Duck the music under the voice** (`/duck`, `/duck -18`, ⋯ › Pro tools, right-click an audio track): Hearth finds where someone actually talks in the voice's own sound and dips every music bed there (−12 dB by default, soft attack / release), as volume keyframes you can see and change. The voice is a track named Voice / VO / Dialog, or one you mark, or clips with the Voice sound effect; with none, the main track's sound.
14. **The voice track** (`/voice-track A2`, right-click an audio track › The voice track): mark which track is the voice.
15. `/duck off` (⋯ › Pro tools › Remove the ducking) takes the dips back out.
16. **LUTs (.cube, 3D or 1D)** on any clip or layer (`/lut <file.cube>`, right-click › Look › LUT › Import a .cube LUT…): exact in the render (ffmpeg's lut3d, tetrahedral), file paths with spaces fine.
17. **The LUT in the preview**: a close live twin (the LUT's curves per channel + a fitted color matrix), within a few levels for usual grades.
18. **Your LUTs** stay listed (Look › LUT, `/lut` completion, `/lut <name>`), `/lut off` removes one.
19. **Adjustment layers** (`/adjustment-layer [look] [for 4]`, ＋ Add here › Adjustment layer, ⋯ › Pro tools): an item on a video track whose look, LUT and effects (and opacity, fades) apply to everything under it, over its range only, in the preview and the render; the in–out range sets its length when there is one.
20. **Multicam** (`/multicam`, or ⋯ › Pro tools › Multicam › from the selected clips): two or more takes of one moment become angles, **synced by their sound** (on a steady beat the smallest shift wins); angle 1 goes on the main track if none is there.
21. **Cut to an angle at the playhead**: Alt+1…9 while editing, `/angle 2 [at 4.5]`, right-click a clip › Angle; the cut keeps the same moment of the scene.
22. **Proxies** (`/edit-proxy make | all | on | off | clear`, ⋯ › Pro tools › Proxies, right-click › More… › Make a proxy): light copies (540p, a keyframe every 12 frames, the same frames at the same times) of heavy files (over 1080p, over 40 Mb/s, HEVC / ProRes) play in the preview; renders always use the originals; frame-exact stepping still checks out.
23. **Render queue** (`/render-queue add reels square`, `/render-queue run`, Export › Render queue): line up renders of one or several edits (this edit as a new version, the 4 socials, any preset), then render them one after another; the list shows waiting / done / failed and opens the results.
24. **Cuts paced like your mood board** (`/cut-to-vibe`, ⋯ › Auto-cut › at the mood board's pacing, ⋯ › Pro tools): the shot lengths of the board's clips (their cuts) become a cut suggestion on your edit, snapped to the music's beats when there is music; Enter applies, Esc dismisses (a suggestion, never forced).
25. **A recording's chapters become markers**: opening a capture in the editor brings its chapters (the markers capture placed at every tool / chat change, and yours) as editor markers once; `/chapters-to-markers` (⋯ › Pro tools) for clips already in an edit.
26. `/preview-sound on | off | status` (⋯ › Pro tools): hear effects and audio tracks while editing (default) or only the clean decoder sound; status says what is playing.
27. The edit list the chats read names LUTs, angles, ducked music and adjustment layers.
28. **For Claude and Astra**: `video_edit` ops duck, voice, lut, adjustment, multicam, angle, proxy, queue, vibecuts, chapters, preview-sound (one line on the existing tool: no new tool, ≈ 15 tokens), and the app map's editor topic explains them (read on demand).

## New on the mood board (Board menu, right-click, chat, `board_do`)
29. **Smart collections** (Board menu › Collections, `/board-collection save Night teal night`, `/board-collection show Night`): a saved search (words, #tags, colors, moods, kinds) that stays live, so new references that match join it; show lights them up, selects and frames them; delete from its submenu.
30. **The board's moods as ready collections**: every mood shared by two or more references is offered (Collections › Moods on this board), nothing to set up.
31. **Group by vibe** (Board menu, right-click a selection › Group these by vibe, `/board-groups [n]`): references that feel alike are gathered into frames named by their shared mood ("nocturnal · cold", "warm · clean"), beside your board; one Ctrl+Z puts everything back.
32. **Palette → Lab look in one click** (Board menu › Palette → Lab look, right-click › Their palette → Lab look, `/board-lab-look [name]`): the board's (or the selection's) colors become the Lab sketch's palette, recolor its color sliders and are saved as a look named after the board.
33. **The clips on a timeline** (Board menu › Clips on a timeline, `/board-timeline`): every clip on the board as a strip with a block per shot, its length, seconds per shot and cuts per minute, side by side; click a shot to watch it; ✂ Pace my edit like this sends that pacing to the editor (`/cut-to-vibe`).
34. **For Claude and Astra**: `board_do` (op collections | collection | show | groups | lab-look | timeline), part of the opt-in board tools (≈ 90 tokens, only for chats that have them).

## New in capture (Capture › Settings › Recording, the Tours menu, chat, `capture_record`)
35. **Cursor smoothing**: the cursor drawn in a take glides to the mouse through a light low-pass (no shaky hand); Settings › Recording › Cursor smoothing: off, light (default), silky; `/record raw-cursor` for one take without it.
36. **Click sounds in the take** (Settings › Recording › Click sounds: a soft tick, a mouse clack, a pop; `/record clicksound`, `/record clack`): mixed into the take's sound only (you don't hear them while recording); a silent take gets a sound track with just the clicks; tours' clicks tick too.
37. **Steadier auto-zoom on clicks**: a click near where the view already looks keeps it still (no bounce), a far one pans there on a softer, longer curve, typing while zoomed keeps the zoom, and the way out is slower than the way in.
38. **Preview a tour** (the tour editor's ◌ Preview button): everything plays (screens, moves, zooms, captions, titles), nothing is recorded or saved, and you come back to the editor with each step's timing ("9 steps in 12.4 s · longest: line 4 title 2.8 s").
39. Tours menu › **◌ Preview a tour (nothing recorded)**.
40. `/tour preview <name>`.
41. **For Claude and Astra**: `capture_record { action: "tour", dry: true }` previews a tour with its timing (one word on the existing tool).
42. The recording status and result say when a take was slowed (`slowedTo`), so a chat can suggest a lighter setting.

**Count: 42 upgrades** (one numbered line each).

## For development (not counted)
- `tools/video-sound.js` (`VideoSound`): the preview's sound engine, hooked into `tools/video-comp.js` (`sync`, `pause`, `record`); `plan(afx)` (pure) maps each effect id to node specs (`LIVE`, `RENDER_ONLY`); sounds are decoded from the file's bytes (`hub.fs.read` buffer → `decodeAudioData`, ≤ 400 MB), so file:// origins don't matter; `level()` reads the output (checks).
- `webm-duration.js` (`WebmDuration`, page + Node): `fix(bytes, ms)`, `read(bytes)`, `fixFile(path, ms)` (streams the rest of the file); a WebM with a seek index or a known Segment size is left alone (a browser's live WebM has neither).
- `tools/video-pack.js` (`VideoPack`): pure `parseCube`, `sample`, `fitLut`, `speechRanges`, `duckKeys`, `vibeCuts`, `boardIntervals`, `angleSwap`, `offsetByCorrelation`, `envelope`; proxies (kv `video-proxies`, files in `<captures>/.proxies/`, a hidden folder so sync keeps it per computer), LUT library (kv `video-luts`), render queue (kv `video-render-queue`), the menus (`lutMenu`, `clipItems`, `trackItems`, `addItems`, `moreItems`, `queueMenu`) and `agentOp`. Commands in `tools/video-pack-cmds.js`.
- Small additive hooks: `tools/video-comp.js` (deck URL → proxy, reversed decks while playing, LUT css, adjustment layers in `drawFrame`, `VideoSound` calls), `tools/video-cut.js` (`suggest(mode, times)`, `analysisMap` / `renderEdit` exported, menu entries, Alt+digit, the adjustment item's look on the track), `tools/cut-data.js` (`isRich` knows `lut`; describe lines), `tools/cut-ffmpeg.js` (`lutF` in `colorF`, adjustment layers as split → filters → overlay with `enable`), `tools/video-edit-tools.js` + `mcp/video-mcp.js` (ops), `capturemain.js` (`finish` writes the WebM duration without ffmpeg).
- `board-pack.js` (`BoardPack`): pure `features`, `clusterVibes` (k-means with farthest-point seeds), `groupName`, `moodCollections`; collections live on the board (`board.collections`); `board_do` routed by HubBridge's longest prefix; CSS in `board.css` (`.bdp-*`). `board.js` (`addTextSmart`) and `board-menus.js` (`copy` / `pasteItems`) got the paste / website fixes.
- `capture.js`: `cursorFx.follow`, `clickMixer`, `watchThroughput` (+ `R.startTicker`), the auto-zoom rules; `capture-tour.js`: `run(…, { dry })`, `previewLine`; `capture-cmds.js`: `/record clicksound | clack | raw-cursor`, `/tour preview`, `capture_record` dry.
- `mcp/hearth-map.js`: one paragraph each in the editor, board and capture topics.

## Tested
- `node dev/editor-test.js /tmp/hearth-editor-videos`: 100 checks (was 70), incl. every sound effect has a live twin or is named render-only; a browser-style live WebM (no seek index) gets 2.000 s ffprobe reads; LUT parsing / sampling / the preview twin's error (identity < 0.2 %, a warm grade < 1 %, a desaturation < 2 %); an inverting LUT on a clip (path with a space) and an adjustment layer rendered by ffmpeg and read back (inverted inside the range, untouched outside); speech found in a synthetic voice; ducking keys (low under the voice, no bounce between close parts) and a ducked bed rendered; pacing cuts, beat snapping; angle swaps; sync by correlation.
- `node dev/board-unit-test.js` (vibe groups, names, mood collections), `node dev/board-mcp-test.js` (5 lean tools), `node dev/capture-mcp-test.js` (tool list ≈ 556 tokens, under its 560 budget), `node dev/editor-mcp-test.js`.
- `dev/checks/editor-pack.js` (in the app, editor group): music on an audio track plays in step and pauses; an echo is heard (a live voice, output level measured) while the decoder is silent; a reversed part gets its reversed proxy and plays forward through it, heard backwards, paused frames exact; the LUT's preview inverts every pixel (mean error < 1 level); the adjustment layer inverts only inside its range; `/duck` writes keys on the music only, `/duck off`; `/multicam` + Alt+2 + `/angle 1 at 1.5`; `/edit-proxy all` → the preview plays the proxy with exact frames; `/render-queue` renders two files ffprobe reads; `/cut-to-vibe`; `/chapters-to-markers`; the agents' ops; the real-time WebM's length read back by ffprobe; Pro tools menu; 0 duplicate commands.
- `dev/checks/board-pack.js`: paste from storage, website cards from an address and a list, collections (live: a new clip joins), groups + undo, the clips timeline on screen (picture looked at), `board_do`, menus, `/board-lab-look` sets the Lab palette.
- `dev/checks/capture-pack.js`: cursor glide and raw mode, a silent take with clicks has a sound track, a 4.6 s busy page slows the take to 15 fps and keeps its 7.4 s, auto-zoom holds for a near click and pans for a far one, tour previews (dry steps, timing, `/tour preview`, `capture_record` dry, the menu).
- The groups `sh dev/run-checks.sh board editor capture video journeys qa unit`: see the stream's final report for the run's outcome.

## Not done / notes
- No local speech model exists on this machine, so **auto-captions from speech** were not built (captions still import from SRT / VTT).
- **Nested sequences** are still rendered compound clips (un-nest to change them), not edited in place.
- **Preview transitions** are still canvas look-alikes of ffmpeg's (the render is the reference); the reversed proxy and sound twins are previews too: the render stays exact.
- Pitch-keeping pitch shifts, the gate and noise reduction are heard in the render only.
- The motion kit items mentioned for this round (the 9:16 "Hearth on screen" card size, the flame wordmark under overlays) live in the Lab's sandbox (another stream's file): they were looked at, not changed.
- Click sounds are synthesized (no sample files); the macOS / Windows hardware encoders weren't available here, so the watchdog was exercised by blocking the page, not by a real slow encoder.
