# still178: a v2 scene draws only what changed (round 178, part A, Nov 11)

Until now every layer of a v2 scene was drawn again on every frame. A layer whose picture cannot have changed is now
not drawn: the still layers at the bottom of the stack are kept as one finished picture, and a scene where nothing
changes draws nothing at all. All in tools/three-sandbox.html, block "Scenes v2" (`g2KeepHook`, `g2Kept`, `g2Sig`,
`g2Render`, `g2Draw`); v2 scenes only, old-format layers untouched.

## What counts as "changed"
The page redraws a layer whenever it can't tell. A layer is **still** only when all of this holds:
- **Its last 3 draws sent nothing new to the graphics card and drew the same set.** Every draw of a layer is watched
  at the backend: a uniform buffer whose values changed (a camera, TSL's `time`, a colour, a slider's uniform, an
  object's position), vertex / instance data, a texture upload, new bindings or pipelines, a compute pass, and its
  draw calls and triangles. A draw that sent nothing and drew the same things made the same picture.
- **It has no per-frame code of its own**: no `onFrame` callback, no node update callback it registered
  (`uniform().onRenderUpdate(() => audio.bass)`), no object with its own `onBeforeRender`, no video texture, and it
  doesn't read the picture under it (viewport texture, transmission). Such a layer reacts to the song on the very
  frame it changes, so it is never guessed still.

A still layer is drawn again:
- at once, when one of its own timers or event callbacks runs, when it calls `redraw()`, when it is re-run or edited
  (a new layer), and when its opacity, blend, move / scale / turn, mask, order or visibility changes, or the frame's
  size or quality does (the kept picture's signature);
- every 20th frame anyway (the "probe"), watched: a change no one announced (something set from a promise: a texture
  that finished loading, a model added later) shows at most 20 frames late, then the layer is live again. This is the
  one place a picture can lag: the owner's call if 20 frames is the right number (`G2_PROBE`).

A layer can also say it itself: `still()` ("I only change when I call `redraw()`": kept even with an `onFrame`, not
guessed at) and `still(false)` ("always draw me"). Both are in the layer's arguments next to `onFrame`.

## What is kept, and the memory
- **One picture for the whole still bottom run** (`C.K`: the resolved colours, no MSAA, no depth; 66 MB at 4K,
  16 MB at 1080p), made only when a layer above them moves, freed when unused for 600 frames. However many still layers
  share it, merges (opacity, blend, masks) included.
- **Every layer still: no picture at all.** The canvas keeps what it shows and the frame draws nothing (0 passes);
  a still or thumbnail read between frames draws the scene again.
- **A still layer above a moving one is drawn as before.** Its picture alone could not be laid over exactly (additive
  and custom-blended materials draw straight onto what is under them). Not done; see Open.

## Where it never applies
Renders, recordings and stills (`fullRes()`), offline frames (`SQ.off`), an export page: every layer drawn, as before.

## The same picture?
- Under a merged layer (opacity / blend / mask): the same pixels, 0 of 2,073,600 differ, at 1080p and 4K.
- Every layer still: the same pixels.
- Under a plain moving layer: the same but where its antialiased edge crosses an edge of the still layers below. The
  kept picture is the resolved one, so the moving edge blends with the pixel's colour instead of its 4 samples, as it
  already does over any merged layer. Measured: 11 pixels of 2,073,600 (0.0005 %), up to 24 levels of 255 on those.

## Measured (dev/checks/scenesv2-still.js, RTX 4080, test copy at 30 frames a second)
- 4 visible layers, 2 still under a spinner: over 60 frames the backdrop and the knot were drawn 3 times each (the
  probe), the spinner and the ring above it 61 times.
- Every layer still: 43 of 45 frames drew nothing (0 GPU passes); the other 2 are the probe.
- Not measured: milliseconds saved on a real scene. It depends entirely on how heavy the still layers are.

## For the AIs and the owner
- Stats: the Lab's line says "· 2 of 4 layers still (not redrawn)"; the read-back (`perf`) has `stillLayers` and
  `v2Layers`; `__labG2.state()` says per layer `kept`, `drawn`, `sent`, `still`, `code`, `reads`.
- The v2 help topic (mcp/three-guide.js, SMOOTH) gained two sentences: still layers are free, keep what never moves in
  its own layers at the bottom, `still()` / `redraw()` for a layer that changes rarely (+61 tokens).

## Checks (SMOKE_GPU_FLAGS="--ignore-gpu-blocklist", silent)
- New `scenesv2-still`: the draw counts above, the kept picture against every layer drawn (`__labG2.kab`), nothing
  drawn when all is still, and each way back: `redraw()`, the layer's own timer, an unannounced change (the probe),
  opacity, size; `still()` with an `onFrame`; a node callback never kept; `__labG2.keep(false)` draws everything.
- `scenesv2`, `scenesv2-onepass`, `scenesv2-comp` (its "merged" step now accepts a frame not drawn), `scenesv2-many`:
  pass. `unit:director-mcp-test`, `unit:tokens-test`: pass.
- `unit:promptdiet-test` fails one line, on main too: "Three Director (full): 8798 ≤ 7940 tokens" before this round,
  8859 with it.

## Open
- Still layers above a moving one (a static frame or logo on top): kept exactly only with a picture each and only for
  layers without additive materials. Not built.
- A layer with `onFrame` that happens not to change (a paused song) is drawn every frame unless it says `still()`.
- The probe's 20 frames, and whether layers should be told when they were guessed still.
