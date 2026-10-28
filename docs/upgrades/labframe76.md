# labframe76 (round 76): the red Lab per-frame checks, and the timeline that grew after the Lab opened

checkhealth74 left seven Lab checks red on main: labpace, labgestures, gcchurn60, lab240edit, labscrub, memory48 and
labstartfast. This stream re-ran each one alone under the run lock on base 6e7defd, then decided for each: a real
regression, or a check that only failed under load. Real regressions are fixed in the app. No check was loosened.

Nothing is added to any prompt (0 tokens). No new button, setting or menu. Mac and Windows run the same code.
First-screen code is unchanged (1866 / 1872 KB): every file touched is in the lazy `lab` group or in ▶ Play's preload.

## Verdicts
| Check | Red in checkhealth74 | On base 6e7defd, alone | Verdict |
|---|---|---|---|
| gcchurn60 | per-frame garbage over budget | **fail**: ▶ Play 305 B a frame (budget 256), Lab 1016–1097 B (budget 1024) | **real regression** (rounds 64–74 added per-frame garbage). Fixed (1–9) |
| labstartfast | the timeline grows 78 → 281 px right after layout | **fail**, same | **real bug**: a scene with no song was given the song last played in another scene, on every Lab start. Fixed (10, 11) |
| labpace | still scene 3.2 draws/s (budget 2.5) | pass: 0.3 draws/s | load only (labdraw74's fixes hold) |
| labgestures | still scene 3.2 draws/s | pass: 0.4 draws/s | load only |
| lab240edit | slider drag 7 storage writes (budget 6) | pass: 2 writes | load only |
| labscrub | timeline pan 22.2 ms per move (budget 20) | pass | load only (a wall-clock budget, run while 4 agents shared 4 CPUs) |
| memory48 | Lab GL programs +9/h (budget 8) | pass: programs flat at 11–12 every round | noise (one program either way over three rounds reads as a slope) |

## gcchurn60: where the garbage came from
gcchurn60 counts the bytes Hearth's own code allocates per frame while a game plays: V8's sampling heap profiler, with
objects later collected kept in the count. At 240 Hz a minor garbage collection of a few ms is a visible hitch, and
the more a frame allocates, the sooner the next one comes. Round 60 brought ▶ Play to 165–175 B a frame and the Lab
preview to 670–775 B. Code added since rounds 64–74 brought them back up to the budget:

| Where | Added in | Cost (B a frame) | Why it allocated |
|---|---|---|---|
| ▶ Play's Quality auto, the phase it waits for | labfps72 | ≈ 40 | `JSON.parse(__gameReady.pub())` every second: the whole ready state built as text and parsed back, to read one field |
| ▶ Play's Quality auto, its look at the frame rate | labfps72 | ≈ 50–90 | a new closure, a growing array and a comparator sort for every look; an async tick (a promise and an async frame every second) |
| Lab: which layers are a video mask's source (`matteOnly`) | video layer fills (Codex, Oct 20; merged in round 66) | ≈ 110 | every frame: a `Map` iterator over all layers and `Set.clear()` (a new table), even with no mask anywhere |
| Lab: crowd culling's scene scan (`ccScan`) | labdraw74 | ≈ 30 | a new visitor closure per scan |
| Lab: crowd culling's frame test (`ccGap`) | labdraw74 | ≈ 6 | a fractional number handed to a function every frame |
| Lab: the stats message, twice a second | framebar64, labdraw74 | 70–175 (more when fps is low) | the message spread again by `post()`, `perfNote` copied, a closure and `toFixed` text for each percentile, the pace reading spread into a second object |
| Lab: the frame bar's rows | framebar64 | ≈ 60 | a callback per read, rows grown by `push`, a new object for each layer's texture count |

The Lab number also swings with load: the stats message is a fixed cost per second, so its share per frame doubles
when a busy machine halves the frame rate. Removing it is what makes the check pass with margin, not luck.

## The changes
1. **Quality auto reads the phase directly** (`gamequality-preload.js`): `__gameReady` *is* the state object, so its
   `phase` is read as it is. The text round trip is kept only as a fallback for an older page.
2. **Quality auto's look allocates nothing per frame.** It keeps one frame callback and a `Float64Array` of gaps. It
   uses the frame's own timestamp (no clock read per frame) and one 4-second timer per look, guarded by a
   generation counter so a stale timer can't end a later look. The engine sorts the gaps in place (the unused tail is
   padded with Infinity), and the answer is one kept object. A hand-written sort was tried first and was *worse*:
   unoptimised code boxes every typed-array number it compares.
3. **Quality auto's tick is a plain function** (no promise, no async step each second). Behaviour is the same: a look
   of 24 frames once a second after the first 2 s of play, and `core.feed` gets the same numbers (`dev/labfps72-test.js`
   passes).
4. **`matteOnly` looks at the layers with one kept callback.** It empties its set only when the set holds something,
   so a scene with no video mask makes nothing per frame. It still runs every frame, so a mask added without a layer
   change is still seen.
5. **Crowd culling's scan** uses one kept visitor.
6. **tickFrames** works out the frame gap once, into a typed slot. It tests the culling limit inline, and works the
   limit out again only when the screen's rate or the fps cap changes.
7. **The stats message is built once.** It goes straight to the parent (or the stage window): no second spread in
   `post()`, and `perfNote` is not copied. Both ways of sending copy the message at once, so nothing changes for the
   receiver. Percentiles are `Math.round(µs / 10) / 100` (the same value as `+(µs / 1000).toFixed(2)`, without the
   text), with no closure per call.
8. **`paceInfo`** adds its fields to the meter's fresh reading instead of spreading it into a second object.
9. **The frame bar's rows** are made at their final size with one kept callback, and `fbTex` fills one kept answer.
   The rows' format is unchanged (`tools/framebar-core.js` reads them as before).
10. **A scene no longer gets another scene's song** (`tools/three.js`). Lab start has a one-off step from the round
    that gave each scene its own song: "the song that was loaded goes to the scene that was open". But
    `three.media` is the last song loaded *anywhere*: it is written on every load and cleared only on an unload. The
    step therefore ran on every start for any scene that never had a song key. Close Hearth with a song scene open,
    start on another scene (a project's, a chat's, or the last one), and that scene silently got the song. Its
    timeline then opened about 0.1 s after the Lab was laid out, which resized every canvas of the scene once. The
    step now runs only for a store from before per-scene songs (no scene has a `media` key yet).
11. **A song being read keeps the timeline's height from the start** (`tools/three-media.js`). While a load is under
    way the bar isn't `.mb-empty` any more, so the grid row, the timeline and the overview hold their place. Before,
    a scene whose song took a moment to read laid the bar out at 78 px, then grew it to 281 px. If the load fails or
    is cancelled, the bar goes back to empty.

## Numbers (alone under the run lock, 4 shared CPUs, other agents' checks running)
| | Base 6e7defd | After |
|---|---|---|
| gcchurn60 ▶ Play, Hearth's bytes a frame (budget 256) | 305 · 271 | 195 |
| gcchurn60 Lab preview, Hearth's bytes a frame (budget 1024) | 1016 · 1059 · 1097 | 800 (at 23 fps; 866–885 in quieter runs) |
| labstartfast warm open: preview size changes after layout | 1 (78 → 281 px timeline) | 0 |
| labstartfast song open: preview size changes after layout | 0 | 0 |

## Checks run (final code)
gcchurn60, labpace, labdraw74, framebar64, labgestures, lab240edit, labscrub, memory48, labstartfast, glrecover,
labload75 (LABLOAD75=1, 261 s), lazy, unit:boot-test (first screen 1866 / 1872 KB) and `dev/labfps72-test.js`: all pass.

## Not done / for later
- The Lab's remaining per-frame bytes come mostly from the layer frame wrapper. A game that asks for its frame with a
  new function every frame gets a new owner record each time (labplay55's design, ≈ 100 B). Then come the render
  wrapper and the pace gate's clock reads. These are under budget and have been there since round 60.
- labscrub's pan budget is wall-clock ms per move: it can fail under heavy load with nothing wrong. It was left as it
  is.

## For the patch notes
- Opening the Lab on a scene without music no longer borrows the song you last played in another scene. Before, the
  song quietly attached itself to that scene, and the timeline popped open a moment after the Lab appeared.
- When a scene's song takes a moment to load, the timeline now keeps its full height from the start. The preview no
  longer jumps smaller after it appears.
- The Lab preview and ▶ Play make much less memory garbage per frame again. That means fewer tiny pauses for memory
  clean-up, which you can notice as hitches at 240 Hz. ▶ Play is down by about a third, and the Lab preview by about a
  fifth.
