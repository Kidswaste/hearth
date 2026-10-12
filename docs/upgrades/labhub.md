# Lab hub (round 21): the Lab's own side feels instant

You asked: "optimize the three.js part since it's what I use most". This stream did the Lab's hub side (everything
around the preview: the code editor, sliders, layers, timeline, pickers, dialogs, scene switches). The preview's own
rendering is the labgpu stream, the Three Director loop is labdirector.

## Measured before → after

Headless (Xvfb + SwiftShader: the GPU is the CPU), same machine, `node dev/smoke.js --script dev/checks/labhub.js`
on the code before this round and after it. The machine was shared with other agents (load 8–15 on 4 CPUs), so
anything that waits for the preview's frames is noisy; the hub's own work (sync ms, element counts) is steady.

| | before | after |
|---|---|---|
| Instant (⚡) slider drag: input → the preview has the value, p50 | **51 ms** | **6 ms** |
| Rebuild (↻) slider drag: input → preview, p50 / p95 | 1,414 / 4,132 ms | 441–481 / 1,247–1,687 ms |
| Typing in a 2,000-line sketch: the editor's work per key, p50 / p95 | **345 / 724 ms** | **6–7 / 43–54 ms** |
| … the same key, to the painted frame, p50 / p95 | 527 / 2,096 ms | 115–159 / 292–405 ms |
| Pasting / opening a 2,000-line sketch in the editor | 379 ms | 1.4–6 ms |
| Elements in the editor's highlight + line numbers (2,000 lines) | 8,539 + 1,987 | 1 + 2 (the highlight is in its own shadow root) |
| Hub long tasks while typing and scrolling that sketch | 264 tasks, 64.5 s | 92–102 tasks, 9.4–9.8 s |
| Ctrl+Enter after an edit: what goes to the preview | every layer again (swap-layers) | only the changed layer, in place (hot-layer) |
| Scene switch: openSketch's own work p50 | 40 ms | 21–22 ms |
| Scene switch: the sliders panel built (profile, 4 switches) | 272 ms of 412 | 32 ms of 130 |
| Effects picker, Browse all: open (sync) / elements | 195 ms / 6,593 | 16–62 ms / 320 |
| Effects picker, Filters / Looks / Motion tabs: open (sync) | 40 / 28 / 28 ms | 12–14 / 9–12 / 12–20 ms |
| ▦ Your sketches: open (sync) | **505 ms** | **17–39 ms** |
| New sketch (templates): open (sync) | 492 ms | 10–11 ms |
| Lab behind a chat, song playing: hub frames / DOM writes per second | 12 / 10 | **0 / 0** |
| Whole check: hub long tasks | 464 tasks, 97.5 s | 133–162 tasks, 16.3–18.9 s |

Unchanged (already instant, measured to make sure): Shuffle 0.2 ms, Save 0.1 ms, Freeze 0.3–0.5 ms, frame sizes
2.3–2.7 ms (was 5.9), Tap 3.6–6.9 ms of the hub's work.

`smooth-lab` (song playing, docked director), before → after on the same machine (noisy: the preview's frames
depend on the load):

| | before | after |
|---|---|---|
| Slider drag: hub DOM changes / s · preview frames in 1.5 s | 49 · 28 | 28 · 41 |
| FX picker open with live thumbnails: layout objects · preview frames in 2.5 s | 2,957 · 10 | 1,162 · 27 |
| Song playing: hub DOM changes / s | 16 | 12 |

`labperf` after: the Lab hidden draws nothing, no GL context leak over 20 switches, hub heap 15 → 15 MB.

## Upgrades

### The code editor (long sketches type like short ones)
1. Typing in a long sketch is instant: only the lines on screen (and 60 around them) are highlighted, the rest as you scroll to it (2,000 lines: 345 → 6 ms a key).
2. Opening or pasting a long sketch shows it at once (379 → 2–6 ms).
3. The highlighted copy lives in its own shadow root, so the app's stylesheets don't restyle every word on each key; its colors still follow your theme (Forgeheart, light scheme, the v2 look) and change with it.
4. A multi-line comment or a GLSL shader in backticks is never cut in half by the window: its colors stay right wherever you scroll.
5. The line numbers are one block of text (an error line is still marked red); they're only redrawn when the window moves or the errors change.
6. A key reads no layout (the scroll position comes from the scroll events), so typing never forces the Lab to lay out mid-key.
7. **Ctrl+Enter runs only the layers you changed**, in place: the others keep playing (nothing changed → every layer again, like ▶ Run). The ▶ Run tooltip and the keys sheet say so.
8. The auto-run (as you pause typing) skips code that already ran: no second rebuild right after Ctrl+Enter.
9. The console updates only what changed on each run and scrolls to the newest line on the next frame (it forced a layout of the whole Lab in every run).

### Sliders, knobs, shuffle
10. The first slider move after a frame goes to the preview at once (with anything else moved in the same instant: a shuffle, a look, a morph step), so the picture can show it in the coming frame: input → preview 51 → 6 ms. Later moves in the same frame still merge into one.
11. Sliders that rebuild the scene (↻) wait for the previous rebuild to draw before the next one: a heavy scene no longer queues rebuilds seconds behind your hand (p50 1.4 s → 0.45 s, p95 4.1 → 1.2–1.7 s).
12. Typing in the code no longer rebuilds the sliders panel when the controls are the same: your open sections, values, undo and scroll stay; only the line numbers (L12) move.
13. A slider's ♪ / ∿ panel (follow the music, move by itself) is built the first time you open it: those ~30 chips per slider were most of the panel's cost on every scene switch (272 → 32 ms).
14. Dragging a layer's opacity, position, scale, rotation, timing or blend sends only what moves (it sent every property with every keyframe ~60 times a second), and the timeline's tracks follow once a frame.

### Scene switches
15. Switching scenes does about half the work (40 → 21 ms before the first paint), and the sliders panel comes up without its hidden music panels.
16. The sketch list (top of the Lab) isn't rebuilt on a switch when the list didn't change: only the selection moves.
17. Reading the Lab's state for "where you were" (speed-resume, every switch) no longer measures the preview or walks the song's analysis.
18. The keyframe timer does nothing at all when the selected layer has no keyframes (it checked the Lab's visibility, a style recalculation, ten times a second), and stops when the preview isn't on screen.

### Pickers and dialogs
19. The effects picker (X) builds its rows as they scroll into view: Browse all opens in 16–62 ms instead of 195 (320 elements instead of 6,593); the scrollbar still shows the whole list, and the arrow keys build ahead.
20. Searching the picker builds only the first rows of the results on each key.
21. Filter thumbnails are kept for the same scene opened again within 2 minutes: they show at once, and the preview isn't made to render each one again.
22. ▦ Your sketches (O) opens in ~20 ms instead of ~500 ms: the Lab's dialogs no longer use a modal dialog, which restyled the whole app (every chat on screen) before showing.
23. The same for New sketch (templates: 492 → 10 ms), References, History, Lab keys and the contact sheet: same look, dimmed backdrop, Esc, their buttons, or a click outside closes them.

### A hidden Lab costs nothing
24. With the Lab behind a chat or another tool, the timeline stops completely (12 frames and 10 DOM writes a second → 0), even with a song playing; it picks up the moment you come back (and checks once a second while parked, so it can't stay stopped).
25. The nodes view stops reading live values from the preview while the Lab is hidden.

### Saves and memory
26. Version history is written 1.5 s after the last change instead of 0.4 s: with auto-run every pause in typing takes a snapshot, and all of it (40 versions of every layer) went to disk each time.
27. Pictures of deleted sketches (not in the trash) are let go when the Lab opens.

## For the next stream
- `dev/checks/labhub.js` measures all of the above: slider input → preview latency (⚡ and ↻), shuffle / save / tap /
  freeze / frame sizes, scene switch (sync, UI, first frame), typing and scrolling a 2,000-line sketch, Ctrl+Enter
  sends, picker open times, the Lab hidden. Run the old code the same way (copy the check next to it) for a before.
- Not done: the preview shares the window's thread here (a sandboxed iframe in the same process), so everything that
  waits for its frames (first frame of a scene, the painted frame after a key) depends on the preview's own cost:
  labgpu's side. The rebuild sliders would answer even faster with a per-message acknowledgement from the sandbox.

## Tests
- `node --check` on every file touched.
- `dev/checks/labhub.js` (new) before and after (the tables above).
- `sh dev/run-checks.sh smooth-lab labperf journey-lab seq-buttons labframes lazy qa-commands motion`: all pass
  except `labframes`' "→ ×45 = frame 45" step (44: one key press of 45 lost on the loaded machine), which fails the
  same way on the code before this round.
