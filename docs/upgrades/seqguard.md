# Seqguard: a Lab sequence that survives frame swaps, and a real editing timeline (round 13)

You said the sequence "bugs out often during frame swapping", and that you want to build videos right in the Lab.
I drove the sequence through every kind of swap (the size pills, Shift+1…5, `/size`, while paused, playing,
scrubbing, inside a transition, on footage and titles, with a song, right after an edit, with the Lab moving in the
page as when the dock opens, and several swaps under 300 ms) and compared the picture with the timeline's clock
each time. Seven separate causes turned up; each is fixed and has a step in `dev/checks/seqguard-swap.js` that
reproduces it. On top of that a small watchdog now repairs the preview by itself, and the timeline got the editing
moves a video editor needs, all behind keys, right-click, ⋯ and `/sequence` (no new buttons).

## What was breaking on frame swaps (all fixed)
1. **Swapping to or from Fit while playing stopped the sequence** (Fit reloads the preview page; the sequence came back paused). It now comes back playing, at the same frame.
2. **After a swap through Fit the sequence jumped to another time**: the reloaded page put the song where the hidden music timeline's playhead was, and the sequence's clock follows the song. The sequence now owns its song on a fresh page.
3. **A song moved by anything else is put back in step** instead of dragging the sequence's clock with it.
4. **Scrubbing through a swap landed on the frame before**: the page being replaced still answered its old seeks and pulled the playhead back. Its answers are ignored now.
5. **The playhead could flicker back to an older spot** when answers to quick seeks arrived late; every seek now carries a number and older answers are dropped.
6. **Black flashes on footage**: a cut into a footage clip, and every re-sync while it plays, painted a black frame while the video was seeking. The last good frame stays until the next one is ready.
7. **Footage that arrived after its clip was set up stayed black**; it now shows as soon as its file is in the preview.
8. A plan half-sent to a page that was being replaced can no longer land on the new page without its titles code or files.
9. **A swap while the sequence shows sets the sequence's shape** (9:16 · 16:9 · 1:1 · 4:5): the preview, the name chip and ⇪ Render agree, and a run of swaps is one undo step. Fit and the extra sizes only change the preview, with a small note saying so.
10. **Your scene's own frame size isn't overwritten any more** by the sequence's swaps: leaving the sequence gives the scene its size back.

## The preview watchdog (no reload needed)
11. **The clock stops while playing** → the plan is sent again, the playhead put back, playback resumed; if that doesn't take, a fresh preview page.
12. **The preview lost the sequence** (it restarted and nobody put it back) → back at the same frame.
13. **A footage / picture / sound file missing in the preview** → sent again.
14. **A clip that should show but can't** (a decoder that failed, a scene whose layers vanished) → set up again.
15. **The preview stops answering** → a fresh page by itself, the sequence back where it was.
16. Each repair shows a small **"Preview restored"** note in the sequence row (no dialog); **↻ Reload** stays as the manual way.
17. `/sequence health`: what the watchdog has repaired and why (it only runs while the sequence is on screen: a check a second, no per-frame work).

## Editing power (keys, right-click, ⋯, chat)
18. **Nudge** the selected clips one frame: **, / .** (a main clip slides between its neighbours; the first / last one moves a gap; titles, overlays and sound just move).
19. **Nudge by a beat**: **Shift+, / Shift+.** (ten frames without a song).
20. Right-click a clip → More… → **Nudge ›** (− / + one frame, − / + one beat).
21. **Trim with keys**: **[ / ]** the clip ends one frame earlier / later.
22. **Shift+[ / Shift+]** the clip starts one frame earlier / later (a scene's content stays in place).
23. A run of nudges or key trims is **one undo step**.
24. **Per-clip speed for scenes**: the scene's own clock (its animation, keyframes, cue looks) runs at 0.25×–4×; the clip keeps its length.
25. **Speed for footage and sound clips** (their length follows, like the editor's).
26. Right-click → **Speed ›** (0.25 … 4×, Type a speed…), on one clip or the selection; the clip shows its speed.
27. **Clip colors**: right-click → **Color ›** (eight colors, No color): a tint and a stripe on the clip, for your own sorting.
28. **A marker with a name**: **Shift+M** (M still drops one at the playhead).
29. **Previous / next marker**: **Shift+↑ / Shift+↓**.
30. **⋯ → Markers ›**: every marker to jump to, ＋ here, ＋ with a name, next, the song's sections, clear (also on the ruler's right-click).
31. **Snapping on / off: Shift+S** (⋯ shows the key).
32. **Select every clip: ⌘/Ctrl+A** (the song stays out of it).
33. **Select from the playhead to the end: A**; right-click → More… → Select from here to the end.
34. **Zoom to the selection: Z** (nothing selected: the whole sequence); also ⋯ → Zoom › To the selection.
35. **⋯ → History ›**: your last steps by name ("Nudge +1f", "Speed 2×", "Format 16:9"…) with how long ago; click one to go back to just before it; steps you undid show at the top to redo.
36. Undo / Redo now say **which step** they undid or redid.
37. **Play around the playhead: Shift+Space** (2 s before to 1 s after, then back where you were) to check an edit without losing your place.
38. **The In–Out range: I / Shift+I** set In / Out at the playhead (it's the video editor's own range, so Video Review sees it).
39. The range shows as a **gold band on the ruler**.
40. **⟲ Loop plays just the range** when there is one.
41. **⇪ Render panel: "Only the In–Out range"** (on when a range exists): renders just those frames with their sound.
42. **⋯ → Range ›**: In here, Out here, the selected clip, go to the In, render the range, clear.
43. **⋯ → More… → Close every gap** (the clips after each gap move up; one undo step).
44. All the new keys are in the keys sheet (area "Lab sequence") and in ⋯ → Keys.

## Chat commands (`/sequence …`, alias `/seq`)
45. `/sequence nudge [clip n…] <+1 | -2 | +1 beat>`.
46. `/sequence trim <clip n> <in | out> <+2 | -1>` (frames).
47. `/sequence speed [clip n…] <0.5 | 2 | 150%>`.
48. `/sequence color [clip n…] <red | orange | yellow | green | teal | blue | violet | pink | none>`.
49. `/sequence ripple <clip n>` (delete and close the gap).
50. `/sequence markers list | go <n | name | next | prev> | rename <n> <label> | delete <n | name>` (`/sequence markers` alone still adds the song's sections).
51. `/sequence snap [on | off]`.
52. `/sequence select <all | none | after | 2 3 | from 4 to 8>`.
53. `/sequence history [back n | forward n]` and `/sequence undo 3` / `redo 2`.
54. `/sequence zoom selection`.
55. `/sequence clip <n | name>`: go to a clip (selected, playhead at its start).
56. `/sequence around`: play around the playhead.
57. `/sequence range <in | out | clip n | 2.5 6 | clear | render>`.
58. `/sequence close-gaps`.
59. `/sequence health` (above).
60. **Directors (Claude and Astra)**: `three_sequence` / `three_do sequence` ops nudge, trim_frames, speed, color, markers_list, marker_go / rename / delete, snap, select, history, clip, zoom_selection, range, close_gaps, health, render {range: true}; clip descriptions mention speed and color (help: op "help", read on demand: no extra prompt tokens).

## Tested
- `sh dev/run-checks.sh seqguard-swap seqguard-edit` (new): every swap scenario above against the picture, the watchdog's five repairs (simulated through test hooks in the preview page), and every editing move through real keys, right-click and commands, including a range render read back with ffprobe.
- The sequence's existing checks, robust-lab and qa (see the final report for the run).
- Not covered: the Stage window (a separate window) during swaps, and precomp clips inside sequence scenes at a non-1× speed (their own clock doesn't follow the clip's speed yet).
