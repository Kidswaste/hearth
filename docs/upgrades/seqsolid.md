# Seqsolid: a Lab sequence that doesn't bug out (round 29)

You said the sequence "bugs out often during frame swapping". Round 13 (seqguard) fixed the frame-size swaps it
could reproduce and added the watchdog. This round I wrote a stress run on WebGL scenes (`dev/checks/seqsolid.js`)
that lets the preview page sample its own picture while it plays (`window.__seqWatch`, a test-only hook). It plays
through cuts, dissolves and a wipe, scrubs back and forth across cuts, switches scenes in quick bursts, swaps frame
sizes while playing, re-runs a scene while it plays, includes a scene that throws, makes and plays an auto-edit (🎬)
sequence, and compares the export page's frame for a time with the preview's. It found these bugs (all fixed):

## Bugs found and fixed
1. **Scrubbing across cuts left the preview black for a second or more.**
   *Cause:* each scrub step mounts the clips around the playhead and drops the ones that left. A dropped clip's code
   was often still loading, and when it arrived it still made a new WebGL context of its own (≈ 250 ms each here, a
   GPU-process round trip on a Mac). The pool can't serve code that no layer runs any more, so that context was thrown
   away again. One scrub made 45–46 of them, and the clip under the playhead waited behind them (still black 0.9 s
   after the scrub stopped).
   *Fix:* code that no layer runs any more gets no WebGL context: its renderer fails at once and quietly (`getContext`
   in tools/three-sandbox.html). After the fix: 0 wasted contexts, and the clip shows in about 0.4 s.
2. **A late run's failure could be blamed on a clip.** The error, console lines and uncaught errors of code replaced
   while it loaded (a scrub, a re-run) were posted as the layer's own error.
   *Fix:* a run that something newer replaced posts nothing, and what a gone module logs or throws is dropped
   (`runLayer`, the page's console / error hooks).
3. **A scene re-run while it plays went black** (a director edit, a saved slider, an undo on a clip's scene). The
   stress run caught a black frame in the middle of playback.
   *Cause:* the clip was taken off and mounted again, and stayed black until the new code had drawn.
   *Fix:* the clip's layers re-run in place. Each keeps its picture on top until the new version draws, then
   cross-fades, the same way a live edit does outside the sequence (`sqRerun`).
4. **A seek onto a clip that hadn't drawn yet showed black** (landing a scrub, a click on the ruler, jumping to a
   marker).
   *Fix:* the picture on screen holds on top until that clip has drawn, at most 2.5 s (`sqHold`). Nothing is held
   when nothing was showing.
5. **A cut onto a clip still loading showed black frames while playing** (a heavy scene on a busy computer: the
   stress run caught one right after a cut while other test runs loaded the machine).
   *Fix:* the same hold, at the cut. It is checked only when the clip being shown changes, so playback does no
   extra work per frame.
6. **Quick scene switches could show another scene's sequence.**
   *Cause:* switches ran side by side. A slower one could finish loading its sequence after a newer one, so the
   scene on screen got the wrong sequence.
   *Fix:* switches run one at a time, and only the latest one runs (`switchTo` in tools/three-seq.js).
7. **A scene that throws mid-sequence wasn't shown on its clip.** Its errors went to the Lab console under an
   internal layer id, and nothing on the timeline said which clip failed.
   *Fix:* the clip gets a red ⚠ corner on the timeline. The row's note says it once. Right-clicking the clip puts the
   message first, with "open the scene to fix it". The mark goes away when the clip's code changes, and
   `/sequence health` lists the clips with errors. Errors only go to the clip that threw (checked: no other clip is
   blamed, and the clips after it play normally).
8. **Timed-out waits stayed queued.** A `settle()` that timed out stayed in the waiting list until the next state
   came in. It is now removed.

## Checked and found solid (now covered by the stress run)
9. Rapid scene switches (pauses of 70 ms and none at all): the hub and the page end on the same plan.
10. Quick edits while it plays (eight transition changes, a length change, undo and redo, 15 ms apart): the page
    always ends on the latest plan, never an older one that arrived late.
11. Frame-size swaps while playing (16:9, 1:1, Fit, 9:16): it keeps playing, with the right scene and no black.
12. No WebGL context leak: after everything, contexts and renderers are at most the clips mounted + 1.
13. Nothing is left showing "loading": no cover, no building rows, no restore pending.
14. ↻ Reload is still the backstop and comes back at the same frame. When the preview recovers by itself, the
    round-13 "Preview restored" note still says so quietly in the sequence row.
15. The export page's frame for a time shows the same scene as the preview (clips and a dissolve's mix).
16. Auto-edit (🎬) sequences on the song with Lab transitions and looks: no black frames across cuts, nothing left
    behind after scrubbing.

## Tests
- `node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/seqsolid.js` (new, 21 steps, all pass).
- Still passing: sequence, sequence-render, sequence-smooth, scenes, labperf, autoedit and seqguard-swap. seqguard-swap failed once while the machine was loaded (load 12) and passed on the rerun. sequence-mcp fails the same 2 steps on main ("help sequence answered by the server", "Astra: render 1:1"), so that is not from this stream.
- The test scene that throws on purpose ("seqsolid boom") is ignored by dev/smoke.js's error report.

## For the patch notes
- The Lab sequence no longer goes black when you scrub quickly across cuts. The scene under the playhead shows in about half a second.
- Landing on a scene that is still loading keeps the last picture on screen until it's ready (at most 2.5 s), instead of black.
- The same goes for a cut while it plays, on a heavy scene or a busy computer.
- When the director (or you) changes a scene the sequence is playing, the clip cross-fades to the new version instead of blinking black.
- Switching chats or scenes quickly always lands on that scene's own sequence.
- A scene that errors in the sequence now shows a red ⚠ on its clip. Right-click it to see the message and open the scene to fix it.
- Errors from clips you have already scrubbed past no longer show up as if the current scene had failed.
- ↻ Reload is still there if the preview ever gets stuck. When the sequence fixes itself, it still says "Preview restored" quietly.
- Caveat: tested headless on a software GPU. Heavy scenes on a real Mac may still take a moment to appear, but you will see the last picture held instead of black.
