# Lab export (round 22, labexport): the Lab's best-quality output, without freezing the app

You asked for the best quality the machine can make, light on the UI while it renders. Every Lab render now happens
in a **hidden export page** of its own (a second Lab page behind the app, in its own process with its own GPU
context): the preview never switches size or reloads, the Lab keeps playing and stays editable, and the render shows
in the render queue with its speed and time left. Frames are exact on the scene's own clock and randomness is seeded,
so a render is the same every time. On top: any size up to 8K (16K a side for stills), any frame rate,
supersampling, real motion blur, alpha, perfect loops, 16-bit stills, and exports of the scene itself (GLB, a one-file
web page, a slider preset, a contact sheet).

Where it is (nothing new on screen): **right-click the preview › ⇪ Export**, the sequence's **Render panel ›
Export…**, **⌘/Ctrl+K "Lab: Export…"** (and 7 direct actions), and **`/lab-export`** (alias `/lx`) in any chat.
Claude and Astra use it through `three_do run "/lab-export …"` (app map topic `labexport`, read on demand: no prompt
tokens).

## Measured (headless Xvfb + SwiftShader: the GPU is the CPU, so absolute speeds are far below a real Mac GPU)

| | number |
|---|---|
| 1080p MP4, frames drawn + encoded + written | **3.5 → 6.4 frames/s** (frames asked ahead, drawn while the last one encodes) |
| 4K MP4 (3840×2160) | **1.6 → 2.2 frames/s** |
| Quality cost at 960×540 (frames/s): plain · 2× supersampling · 8 motion-blur sub-frames | **5.3 · 3.4 · 2.3** |
| App window during a 1080p render: long tasks (> 50 ms) on the app's thread | **0** (worst animation frame 106 ms, from the shared CPU here) |
| App window frames/s, idle → while rendering 1080p | 52 → 29 (SwiftShader shares the CPU with the export page; on a real GPU the page's work is on the GPU) |
| A preview screenshot asked during the render | answered in 233 ms |
| Sequence render 1:1, 120 frames, old way vs the export page | preview switched size **16:9 → 1:1 → 16:9** vs **stayed 16:9**; 19 s vs 27 s (higher quality: x264 slow / CRF 17 / JPEG 97 vs medium / 18 / 92, plus the page's start); 0 long tasks both |
| Same frame rendered twice | mean pixel difference **0** (deterministic) |
| Plain vs 2× supersampled vs 8 sub-frame motion blur (same frame) | mean difference 0.23 and 0.19 of 255 (different pixels, as they should be) |
| Loop found in the frames (a turning cube) | 25 frames at 30 fps, no cross-fade needed |

## Upgrades

### Renders that leave the app alone
1. **The hidden export page**: every Lab export renders in its own page behind the app (its own process and GPU context), never in the preview.
2. **The preview keeps its frame size** during a render (no switch, no reload) and keeps playing.
3. **The Lab sequence's own ⇪ Render goes through the export page too** (same files, same queue row, same captions next to the video); the old in-preview render stays for real-time takes.
4. **The sequence stays editable while it renders** (adding a clip during a render works: measured).
5. **Renders step aside while you drag, scroll or type**: the next frame waits for the gesture to end (≤ 1.5 s).
6. **Frames are asked ahead**: the page draws the next frame while the last one is encoded and written (1080p: 3.5 → 6.4 frames/s here).
7. **Files are written while the next frame draws** (at most two in flight).
8. **GPU memory cap** (64 megapixels a frame by default): supersampling steps down to stay under it, and says so; `/lab-export gpu <MP>`.
9. **The export page goes away after each render** (its GPU memory with it), also on cancel or failure.
10. **One export at a time**: the next waits in line.

### The render queue
11. **Each export is a row of the render queue** with its progress bar, frames/s and **time left**.
12. **Pause / resume** from the queue (or `/lab-export pause | resume`): the frames stop and go on where they were.
13. **Cancel** from the queue, its bar, or `/lab-export cancel`.
14. **Retry / re-render** from the queue runs the same `/lab-export` line again.
15. **Done note** with the file, its size, frames and time, and **Open**.

### Frame-exact and repeatable
16. **The scene's own clock**: frame T of the export is the scene at T (the sequence's clock, keyframes, slider keys, cue looks, beat map), not the wall clock.
17. **Seeded randomness**: `Math.random` in the export page is seeded, so the same render gives the same pixels (measured: 0 difference); `seed=7` for another draw.
18. **Your sliders as they are now**, unsaved moves included.
19. **The song's beat grid and your hand-placed hits** go to the export page, so what reacts to the kick reacts the same; the spectrum is computed per frame from the song.
20. **Full resolution always**: the export page never lowers its resolution (the preview's adaptive quality is off), and a sketch's own `Math.min(devicePixelRatio, 2)` no longer caps a 4K or supersampled frame.
21. **Same composition as the preview at any size**: the page keeps the preview's layout size (≤ 1920 a side) and raises its pixel ratio, so 4K is the 1080p picture with 4× the pixels, not a smaller scene in a bigger frame.

### Sizes and frame rates
22. **Any size**: the Lab's frame, 720p, 1080p, 1440p, **4K**, 4K 9:16, 4K square, **8K**, **8K square**, A4 / A3 at 300 dpi, an 18×24 in poster, `2x` / `3x` the frame, or any `W×H` (up to 16384 a side).
23. **Named sizes follow your frame's orientation** (4K on a 9:16 frame is 2160×3840).
24. **Any frame rate** (24, 25, 30, 50, 60… `120fps`).
25. **Length in seconds, bars or frames** (`10s`, `4bars`, `120frames`), from the playhead or `at=12.5`; the scene's loop range when it has one; the whole sequence or its In–Out range.

### Quality options
26. **Supersampling 2×, 3×, 4×**: drawn at that many times the pixels and boxed down exactly (every sample averaged with its alpha): clean edges, fine lines, no shimmer.
27. **Real motion blur**: 4–64 sub-frames per frame across the shutter, averaged with their alpha (`blur`, `blur16`).
28. **Shutter angle** (`shutter=180`, default 180°).
29. **Exact accumulation** up to 4K (per-pixel sums); above it (8K) sub-frames blend on a canvas so memory stays bounded.
30. **Draft / High / Best** encoder quality per render.

### Video formats
31. **MP4 · H.264** (x264 slow, CRF 17 on High, 12 on Best, faststart).
32. **HEVC · H.265 10-bit** (hvc1 tag for QuickTime; the Mac's hardware HEVC encoder when ffmpeg has no x265).
33. **ProRes 4444 with alpha** (.mov, 16-bit alpha, 24-bit sound) for Premiere / Final Cut / Resolve / After Effects.
34. **WebM · VP9 with alpha** (Opus sound) for websites.
35. **PNG sequence with alpha** in its own folder (works without ffmpeg).
36. **Alpha where the scene has no background**: renderers in the export page keep an alpha channel and clear to transparent (`opaque` to keep black).
37. **The sound mixed in** (the song, sound clips, voice ducking, fades) like the sequence's own render; `mute` for none.
38. **Odd sizes are cropped to even** for the codecs that need it, and the note says so.
39. **A missing encoder says which and how to get it** (/ffmpeg install), never a raw ffmpeg error.

### Perfect loops
40. **GIF · perfect loop**: palette made for the clip, sierra dithering, loops forever; drawn at the frame size and scaled to 720 (a free supersample).
41. **MP4 · perfect loop** (silent, for Instagram, websites, wallpapers).
42. **Loops on the song's bars** (2 bars by default, `4bars`), starting on the bar at the playhead.
43. **Cross-faded seam**: the clip's last half beat fades into its first frames, so the last frame runs into the first like any two frames in a row (checked: the wrap changes no more than a normal step).
44. **Loop detection** (`detect`, default without a song): the page signs each frame (16 × 16) and finds the period where the picture comes back; the clip is cut there with no cross-fade needed.

### Stills
45. **Still · PNG** at the playhead, any size, with alpha.
46. **Still · 16-bit PNG for print**: the supersampled samples are kept at 16 bits a channel (smooth gradients after grading).

### The scene itself
47. **GLB of the 3D content** at the playhead (every layer's scene, animations included when the scene has them), with its mesh and triangle count.
48. **The scene as one self-contained .html**: deploy's builder, packed into one file (the Lab's player as srcdoc, three.js inside as modules from an import map, references as data): opens offline from the disk (checked: it draws).
49. **Sliders as a preset file** (`.hearth-preset.json`, every layer's slider values by name).
50. **Load a preset back** onto the scene (`/lab-export load <file>`), matched by layer id, then name.
51. **Contact sheet**: 6–48 frames across the clip on one PNG, each at its exact frame with its time and frame number.

### Getting there
52. **Right-click the preview › ⇪ Export**: Export…, 4K MP4 supersampled, ProRes 4444 + alpha, perfect-loop GIF, still for print, GLB, web page, preset, contact sheet.
53. **The Export panel**: what (this scene / the sequence), format (5 chips + More ▾), size, frame rate, quality, supersample, motion blur, with a line saying what it will make; your last choices are remembered.
54. **The sequence's Render panel › Export…** opens it on the sequence.
55. **⌘/Ctrl+K**: Lab: Export… · 4K MP4 supersampled · ProRes 4444 with alpha · perfect-loop GIF · 16-bit still for print · GLB · one web page · sliders as a preset.

### From chat
56. **`/lab-export`** (alias **`/lx`**): no words opens the panel; `/lab-export mp4 4k ss2 60fps blur best 10s seq`.
57. **`/lab-export formats`**: the 13 formats and every option.
58. **`/lab-export status`** and **`/lab-export speed`** (frames/s of the last renders).
59. **`/lab-export pause | resume | cancel`**.
60. **`/lab-export gpu <MP>`**: the GPU memory cap.
61. **Completions** for formats, sizes, frame rates and options.
62. **Claude and Astra**: `three_do { cmd: "run", command: "/lab-export …" }`; the answer carries the file's path, size, frames and speed.
63. **App map topic `labexport`** (also export, prores, alpha, supersampling, motionblur, loops, print, 4k, 8k), read on demand.

**Count: 63 upgrades.**

## How it was tested
- `dev/checks/labexport.js` (new, 31 steps, passes): MP4 (480×270, 30 fps, 12 frames), HEVC (10-bit, 24 fps), ProRes
  (yuva444, 25 fps), WebM (VP9 with the AlphaMode flag), PNG sequence (transparent background), GIF loop (30 frames,
  5-frame cross-fade), MP4 loop (found in the frames), stills (8 / 16-bit rgba64), the same frame twice = same pixels,
  supersampling and motion blur ≠ plain, GLB (glTF magic, 41 meshes), preset, contact sheet, the one-file page drawn
  in a hidden window, 1080p / 4K speed with long tasks counted, quality costs, pause / resume / cancel from the queue,
  the sequence's render via the export page (preview kept its size) with the old way measured beside it, chat.
- `node dev/labexport-test.js` (new, 18): formats, sizes, the page's pixel ratio and GPU cap, ffmpeg arguments,
  sound, loops on bars, loop detection, presets, words; real ffmpeg runs (ProRes alpha, VP9 alpha, MP4 loop frames,
  no seam at the wrap, GIF, HEVC 10-bit).
- `sequence-render`, `renders`, `renders-seq`, `unit:renders-test`, `labgpu`, `qa-commands`, `lazy`: pass.
  (`sequence-render` and `renders-seq` first failed on this branch: a sound-only filter graph mapped `[0:v]`, and the
  sequence didn't report `rendering` while the export page rendered it; both fixed.)

## For development (not counted)
- `tools/three-export-core.js` (`LabExportCore`, Node-tested): FORMATS, SIZES, `size`, `page` (CSS size, pixel ratio,
  GPU cap), `subTimes`, `args` (ffmpeg per format, loops, odd sizes, encoder fallbacks), `audio`, `loopLen`,
  `findLoop`, `preset` / `readPreset`, `sheet`, `parse`.
- `tools/three-export.js` (`LabExport`): `render(o)`, `renderEdit(e, opts)` (the sequence's hook), `panel`,
  `previewItem`, `pause`, `cancel`, `status`, `savePreset`, `loadPreset`, `packHtml`. `tools/three-export-cmds.js`:
  `/lab-export`, the palette actions. All three in lazy-data.js's lab group (manifest regenerated).
- Sandbox (`tools/three-sandbox.html`): `?xp=1` export pages (full pixel ratio, `?alpha=1` transparent clears,
  `?seed=` seeded `Math.random`, in the three.js shim / head), and the "export frames" block: `xp-frame`
  (supersampled / motion-blurred / 16-bit, a signature for loops; one at a time, encode overlapped), `xp-glb`,
  `xp-sheet`, `xp-info`.
- Small hooks outside the lane: `tools/three-seq.js` (renderEdit hands non-realtime renders to LabExport behind
  `store three.export.backstage` (default on); `audioPlan`, `duckOf` exported; `rendering` counts it; the Render
  panel's Export… button), `tools/three.js` (one line: the preview menu item), `mcp/hearth-map.js` (topic +
  aliases), `dev/run-checks.js` (`labexport` group, unit test).

## Risks / not done
- Measured on SwiftShader: on a real GPU the export page's drawing leaves the CPU, so the app should stay smoother
  than the numbers above; frames/s will be much higher.
- The preview itself isn't seeded: a sketch that places things with `Math.random` looks different render to preview
  (the clock matches; the random draw is the export page's own, the same every render).
- Alpha needs the scene to leave its background clear (`scene.background` set = opaque).
- GLB: shader materials export as plain materials (GLTFExporter's limit); points / lines as they are.
- Above 4K, motion blur averages on an 8-bit canvas (memory bound), and 16-bit stills go up to 24 megapixels (A3 at 300
  dpi fits; a bigger one is refused with the 8-bit still suggested).
- The one-file page is ~3 MB (three.js inside); `file://` was reasoned, the check served it over http.
