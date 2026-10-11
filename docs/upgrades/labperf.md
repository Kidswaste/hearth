# Lab perf (round 16): a lighter, steadier Three.js Lab

You asked: "focus on framerate and making things lightweight". This stream did the Three.js Lab: the preview and
its layers / filters, scene switches, the backstage scenes, thumbnails, the timeline, the nodes view.

## Measured before → after

Headless (Xvfb + SwiftShader: the GPU is the CPU), same machine, `node dev/smoke.js --script dev/checks/labperf.js`.
The machine was shared with other agents (load 8–15 on 4 CPUs), so frame numbers are noisy; the counts are exact.

| | before | after |
|---|---|---|
| GL contexts / renderers left after 20 scene switches (1 layer on screen) | **3 / 3** (2 stray scenes still drawing behind) | **1 / 1** |
| JS heap after 20 switches (hub / preview) | 16 / 10 MB | 16 / 10 MB |
| Lab hidden behind a chat: preview draws / s | 0 (the browser) | 0 (the browser + parked: no layer callbacks, no stats messages) |
| Lab hidden: hub main-thread lag over 3 s | 24–218 ms | 56 ms |
| Lab hidden, song playing: timeline draws + text writes | 10 / s | 0 |
| Rings + bloom + grain + vignette, song playing: frame gap p50 / p95 | 450 / 700 ms | 583–667 / 716–800 ms (2 runs; SwiftShader on a CPU at load 15) |
| Same scene: adaptive resolution | stayed at 100 % (gaps over 250 ms were all ignored) | drops to 50 % within seconds; GPU estimate 26 → 6 MB |
| Same scene in Light mode | – | **167–233 / 217–333 ms** (2–3× the frames) |
| Same scene paused (own clock), frame gap p50 / p95 | 350 / 483 ms | 317 / 400 ms |
| Preview's own work per frame (JS, all layers) p50 / p95 | not measured | 2.3 / 10.5 ms |
| Thumbnail of a sketch | full-size PNG encoded on the preview's frame, resized in the hub | 360 px JPEG, encoded off the frame, asked when the hub is idle |
| Backstage scene (a director working on another chat's scene) | screen rate | 15 fps |

The smooth checks (same load caveat; `sandbox` = the preview's own frames):

| | before | after |
|---|---|---|
| smooth-lab, song playing: preview frames in 2.5 s / worst gap | 14 / 300 ms | 19 / 217 ms |
| smooth-lab, hub DOM changes while playing / slider drag / docked reply | 17 / 43 / 42 per s | 16 / 43 / 52 per s |
| smooth-labframes, footage playing / stepping / scrubbing: hub DOM changes | 13 / 16 / 6 per s | 21 / 15 / 6 per s |
| sequence-smooth, sequence playing: preview frames in 3 s / worst gap / hub DOM changes | 12 / 883 ms / 4 per s | 20 / 400 ms / 5 per s |

(sequence-smooth's "preview keeps drawing" step fails before and after on this loaded machine: it wants more than 20
frames in 3 s from SwiftShader.)

On a real GPU the filter work is what changes most: a filter whose input didn't change no longer merges and uploads
the picture under it, a filter at 0 doesn't draw at all, and a big blur draws a quarter of the pixels.

## Upgrades

### Scene switches and memory
1. Quick sketch / scene switches no longer leave the previous scene drawing behind the new one: a scene still loading when you switch away has its renderer dropped (3 → 1 GPU contexts after 20 switches).
2. Its frame loops and timers stop at once, so it can't steal frames from the scene on screen.
3. Its canvases never land on the page.
4. A filter layer frees its merged picture, feedback buffers and shader as soon as it's re-run, removed or switched away.

### Framerate that follows the screen and the window
5. **Auto fps** is the new default frame rate (⋯ on the preview → Frame rate, `/fps`): the screen's own rate while it keeps up.
6. Auto: 30 fps while Hearth's window is in the background (another app in front); full rate the moment you come back.
7. Auto: on a fast screen (120 Hz…) that drops frames even at the lowest resolution, the preview steps down to a steady 60 and tries the full rate again after a calm while.
8. The preview **parks** while the Lab isn't on screen (another tool, a chat, a hidden or minimised window, another Lab tab): nothing draws, no stats are sent; recordings, the Stage window and sequence renders go on.
9. Adaptive resolution now measures against the screen's own frame time, so a 120 Hz screen is protected too (it was always judged against 60).
10. Adaptive resolution also kicks in on a preview that can't keep up at all (long gaps in a row used to be ignored as "hitches"), and decides within 1.5 s.
11. Max fps, 60 and 30 are still there and do what they did.

### Filters (adjustment layers)
12. A filter merges the picture under it only when something under it drew, moved or changed: a still or frozen scene costs one merge, not one per frame.
13. The merge is made at the filter's own drawing size, so it gets cheaper together with the adaptive resolution.
14. Bloom, grain, vignette, blur, sharpen, zoom blur and motion blur at 0 step aside: the picture under them shows as is, nothing is drawn through the shader.
15. Blur, zoom blur and motion blur at a big radius draw at half resolution (they look the same: a quarter of the pixels).
16. Filters look the same at any internal resolution (pixel-sized effects keep their size when the preview lowers its resolution).

### Light mode (slower machines)
17. **🪶 Light mode**: 30 fps, at most 1× pixels in the preview (a Retina screen draws a quarter of the pixels), every filter at half resolution; stills, screenshots and recordings stay full size. ⋯ on the preview → Frame rate → Light mode, or `/lab light [on|off]`.
18. Light mode is remembered and comes back with the preview after a restart or a reload.

### Seeing it: /lab perf
19. `/lab perf` prints the preview's numbers in the chat: fps, frame ms (median and slowest 5 %), draw calls of every layer, triangles, a GPU memory estimate, the resolution, the frame-rate setting, Light mode, parked, and what was saved (filter merges reused, passes skipped, stray renderers dropped).
20. A quiet **perf HUD** in the preview's corner (fps · frame ms · draw calls · ≈ GPU MB), toggled by `/lab perf` (`/lab perf on|off`) or ⋯ → Frame rate → Perf HUD; it updates twice a second at most and only when its text changes.
21. The preview's stats now count draw calls across every layer (they showed one layer's), and frame time as the work of all layers in a frame.
22. `/lab` suggests `perf` and `light` as you type.

### Lighter hub side
23. The fps / draw-call line on the preview is rebuilt only when it shows (on hover) and only when its numbers changed (it was rebuilt twice a second, seen or not).
24. With a song playing and the Lab behind another tool, the timeline stops drawing, writing its time and placing its playheads (10 times a second before); the click track keeps ticking; one paint when you come back.
25. Sketch thumbnails (for ▦ your sketches) are made small and encoded off the preview's frames, when the hub is idle: no more hitch a few seconds after you open a sketch.
26. The nodes view's live values are read one at a time: a busy preview answering late no longer stacks up a read every 300 ms.
27. Backstage scenes (a director working on a chat you're not looking at) run at 15 fps: screenshots and its fps report still work, the GPU does a quarter of the work.

## For the next stream
- `dev/checks/labperf.js` measures all of the above (frame gaps inside the preview, draws / s, idle, hidden, unfocused,
  Light mode, 20 switches with GL contexts and heap) and reports `ok.hiddenDrawsNothing` / `ok.noContextLeak`.
- Not done: one shared WebGL context for all layers (every layer is its own module with its own renderer; sharing
  would change what layer code can do), a worker for filter merges.
