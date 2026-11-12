# governor178: the frame-time governor and v2 scenes (round 178, part B, Nov 11)

Asked for: an engine that watches how long frames take, lowers the resolution when a scene falls behind and restores
it when there is room. **Hearth already has it**, so this round did not build a second one: it proved the existing one
governs v2 scenes, closed one gap, and lists what it does not do for them.

## What is already there (rounds 31, 33, 38, 142: tools/three-sandbox.html, `adaptCore` / `adaptQuality`)
- The Lab's **QUALITY › Smooth (auto)**, the default. Every drawn frame's gap is judged against the frame time the
  screen (or Max fps) asks for, in windows of 20 frames. Tight windows step the preview's resolution down
  (1 → 0.85 → 0.7 → 0.5), a window at a time; calm windows with headroom step it back up, one level at a time, and a
  climb that had to come straight back waits twice as long next time (no pumping).
- Past the lowest resolution it goes to a steady lower frame rate (240 → 120 → 60) rather than a jittery one.
- **Never** in stills, screenshots, recordings (`fullRes()`), offline render frames (`SQ.off`), the export page
  (`?xp=1`), a show (`RDY.lock`), or while a slider is being dragged.
- The owner sees it and can turn it off: the stats line's chip ("Quality: auto · 85 %", its tooltip says why), the
  dock's QUALITY menu: Smooth, Balanced (the older, slower-to-react rules), Force high quality (nothing adapts).
  Claude and Astra read the same in `perf` (`quality`, `fps`).
- With **Max fps**: the cap's frame time is the target. A scene held at 30 fps by the cap is only "behind" when a
  frame takes over 33 ms.
- A v2 scene's one renderer takes its pixel ratio from it (`g2Size` → `prQ`), and the kept pictures of part A follow
  (a change of resolution makes them again).

## What this round changed
- `adBigPx`: a v2 scene's one canvas now counts as pixels the preview draws, so a 4K v2 frame steps down after one
  slow window, as a 4K old scene does.
- `__labG2.stillPr()` (checks): the pixel ratio now and the one a still is drawn at.
- New check `scenesv2-governor`.

## Measured (dev/checks/scenesv2-governor.js, RTX 4080, 3840×2160, the test copy runs at 30 frames a second)
| | frames a second | resolution |
|---|---|---|
| light v2 scene, Smooth | 30 | 100 % |
| heavy (800 full-frame additive planes), Force high | 12.2 | 100 % |
| the same, Smooth | 26.6 | 50 %, reached in steps (85 % first) |
| heavier (1600 planes), Force high | 6.1 | 100 % |
| the same, Smooth | 23.9 | 50 % |
| load gone, Smooth | 30 | back to 100 %, a step at a time (over 90 s after the heavier run) |

While lowered, a still is drawn at 100 %; an exported 640×360 still is 640×360.
Not measured: a scene so heavy that 50 % is not enough (the frame-rate steps), and anything above 30 frames a second
(the silent test copy is never the focused window, and the Lab holds an unfocused preview at 30).
Seen on the way: changing QUALITY between Force high and Smooth restarts the preview (the scene runs again), and under
about 6 frames a second the Lab takes the preview for stuck and restarts it.

## What it does not do for v2 scenes
- **Half rate for the heaviest layer.** Old scenes have it as Smooth's last step (`AD.half`: the heaviest layer's
  renderer draws every other frame). A v2 scene has one renderer and layers that share a pass, so there is no
  per-layer cost to pick the heaviest from, and a skipped layer needs its own kept picture: part A keeps only the
  still bottom run. Not built; it needs per-layer pictures first (still178's first open item).
- **The steps after resolution** (filters at half size, smaller shadow maps, fewer particles) look at old layers'
  renderers. For a v2 scene they are passed over: resolution, then the frame rate.
- **It is on in test copies** (as it always was; checks that measure set Force high). Left as it is: turning it off
  there would change what existing checks see.

## Owner's call
Nothing is blocked on it. Recommendation: keep the one governor. If v2 scenes should also drop a heavy layer to half
rate, that is a follow-up on top of per-layer kept pictures.
