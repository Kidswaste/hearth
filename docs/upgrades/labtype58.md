# labtype58 (round 58): a held title stops redrawing again when something happens

`labtype240`'s "still" step (a held 🅰 title, frames drawn a second, budget 2.5) failed now and then at 4–6 frames a
second. The title wasn't moving: the Lab preview kept drawing the same picture for a while after it stopped moving.
Nothing looks different. No new setting, nothing added to any prompt (0 tokens), the same on Mac and Windows.

## The cause
The still check (labpace, `paceCore().still` in `tools/three-sandbox.html`) has a "moving" count per renderer. Once a
scene has changed at 30 looks in a row for over 2 s, it is looked at only every 32nd frame (labplay55, round 55: a game
that keeps moving draws every frame anyway, so checking it on every frame was wasted work). In that same change a
**poke** (a message from the Lab, a click, a key) stopped resetting the count. Before, a poke started the count again
and the gate looked on every frame.

So a scene that had moved for over 2 s and then stopped as something happened from outside (a title switched, a game
paused, a setting changed) stayed on "every 32nd frame". It drew every frame until the next look found nothing new: 32
frames, or 64 if that look still saw the last change. That is 1–2 s of redrawing the same picture at 30 fps, ½ s at 60 Hz.
In the check, the title's "before" pass (the old whole-frame path, redrawn every frame) left its gate moving for a long
time. Then the message that switched on "drawn tight" came, and the fps window caught the tail when the look happened
to land late.

**Bisect**: the cause is labplay55 (`b965245`), not labcanvas56 (glFresh) or lab240edit. On this machine the held title
drew **49 / 54 frames** (1280×720 / fit) after the message before the fix. The fps step only failed when those frames
fell inside its 3-second window, which is why it failed only sometimes.

Looked at and ruled out: glFresh reads (0 frames drawn again while the title holds), the covered-layer probe (one layer:
nothing to cover), the text box's resizing (2–3 resizes in the whole run, none while it holds), font / glyph uploads
(0), ResizeObserver or fit loops (no resize events while it holds), thumbnails / probes (no messages while it holds).
While held, the frames drawn are the 1-a-second safety redraw plus ~3 per message, as labpace intends.

## The fix
1. **A poke after a quiet spell (≥ 250 ms since the last poke) restarts the long-moving clock.** The gate goes back to
   looking every 8th frame for 2 s, so a scene that stopped is seen still within 8 frames plus the 2 settling frames.
   A steady stream of pokes doesn't count as quiet: the pointer moving over a game, live sound, a slider being dragged.
   So a game that keeps moving goes back to every 32nd frame after 2 s, as labplay55 set. No extra scene walk happens
   on the poke itself. (`POKE_QUIET`, `st.pokeAt` in `still`)
2. `dev/checks/labtype240.js`: the held title is switched to drawn tight by a message right after its every-frame
   "before" pass. A new step counts the frames it draws until the gate skips one, **in frames, not time**, so the result
   holds on a loaded machine. Budget ≤ 24 frames (the old code drew 49–54). The existing fps budget (2.5) is unchanged.
3. `dev/labpace-test.js`: a long-moving scene that stops as a message comes is still within 8 + AFTER frames (16 + AFTER
   with one more change). Pokes every 50 ms on a moving game: every 8th frame for 2 s after the first, then every 32nd.
   Both "stops" lines fail on the old code (17 and 49 frames).

## Before → after (this machine, software GL, run alone under the lock)
| | before | after |
|---|---|---|
| Frames drawn after the message, until still (1280×720 / fit) | 49 / 54 | **12 / 17** |
| Held title, frames a second in the check's window | 1.7–4.3 (failed when the tail fell in it) | **1.7 / 1.7** |
| Look rate on a game that keeps moving (pokes every frame or every 50 ms) | every 32nd frame | every 32nd frame (every 8th for the first 2 s after a quiet spell) |

## Tests
- `node --check` on the sandbox page's scripts (extracted), `dev/labpace-test.js`, the check's body.
- All passed, under the shared run lock: labtype240 ×2 (frames until still 16 / 18 and 16 / 12; the held title at
  1.7 frames a second), labpace, unit:labpace-test, labplay55 (a moving game's looks per frame unchanged), labcanvas56,
  lab240edit, labsmooth54, lab240gpu, lazy, unit:boot-test.
- The new step, run against the old sandbox page: fails (49 / 54 frames). The new labpace-test lines fail there too
  (17 / 49 frames).

## Not done
- A scene that stops **by itself** after moving for over 2 s, with nothing from outside, is still caught within 32
  frames, as labplay55 chose (133 ms at 240 Hz). Catching it sooner would need more scene walks on every moving game.

## For the patch notes
- The Lab preview stops redrawing a still picture sooner again. When a title or scene stops moving as you do something
  (switch a setting, click, the Lab sends it a change), it now goes quiet within a few frames. Before, it could keep
  redrawing the same picture for 1–2 seconds.
- A game that keeps playing in the preview is checked as rarely as before, so nothing gets heavier while it moves.
- Nothing looks different.
