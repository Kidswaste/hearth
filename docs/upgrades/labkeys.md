# labkeys (round 46): keyframes you can see and shape

The Lab already had slider keyframes (a slider's ◇ at the playhead, moving an animated slider, Write), automation lanes
under each layer (Ableton-style, ▾ / A) and a ◆ row per layer on its track. What it lacked was the After Effects part:
seeing the keyframes as diamonds, picking how each one moves without a right-click, shaping a move by hand, and moving
or copying several at once. This stream adds that on the existing timeline (no new panel, no new button row).

## Seeing them
1. **Diamonds in the lanes**: a slider's keyframes in its lane are drawn as diamonds like the layer's ◆ row (filled =
   eased, outline = straight, square = hold), white when picked.
2. **A slider's first keyframe shows its lane**: press a slider's ◇ and its lane opens under the layer (up to three
   lanes open by themselves; ✕ or ▾ hides it, the animation stays).

## How each keyframe moves (click a diamond)
3. **Click a diamond** (in a lane, or a ◆ on a layer's track): the playhead goes there and a small card opens.
4. **Six eases, each drawn**: Linear, Ease, Ease in, Ease out, Bounce, Hold; the current one is lit; one click sets it
   and closes the card.
5. **Curve**: the move to the next keyframe as a speed curve with **two handles to drag** (steeper = faster there;
   above the box overshoots). Live while you drag; the key's ease becomes a curve that renders exactly like the preview.
6. **Snap to beats** in the card while a song is loaded (the timeline's own Snap: Beat / off).
7. Clicked on a picked diamond, the card changes **every picked keyframe** ("3 keyframes").
8. **Esc** or a click outside closes the card.

## Several at once
9. **Shift+click** ◆ on the layers' tracks to pick several (across layers too); picked ones are ringed in gold.
10. **Shift+drag a box** over the tracks picks the ◆ inside.
11. **Drag one picked ◆**: they all move together, every slider keyed at those times goes along, landing on the beat
    (or the hits, per the timeline's Snap); none leaves the song.
12. **Alt+drag copies** them (the originals stay) — on the tracks and on lane points.
13. **Ctrl/⌘+C, Ctrl/⌘+V**: the picked ◆ go to the playhead; copied from one layer they paste onto the **selected
    layer** (another layer works: settings it doesn't have stay out); from several layers, back onto those.
14. **Delete** removes the picked ◆; **Esc** lets them go.

## One undo per change
15. Each move, copy, paste, ease pick, curve drag (the whole drag) and delete of ◆ is **one step** of the timeline's
    undo (Ctrl/⌘+Z in the Lab, ↶). The track ◆'s right-click Ease / Linear / Hold / Delete and double-click delete,
    which had no undo before, have one too.

## Renders match, nothing extra running
16. The curve is evaluated by the same lines in the Lab and in the preview / export page (`bezierAt`); a unit test
    compares both evaluators for every ease at 60 frames a second, and the check compares export frames with the
    Lab's values.
17. ∞ Perfect loop reads curved keyframes too.
18. Light: the card is one small file loaded the first time a diamond is clicked (lazy group `labkeys`); nothing runs
    while it is closed; a paused preview that dozes (idlecpu) wakes on each edit (the keys reach it as a message).

## Keys sheet (bottom left)
19. New lines: Click a ◆ (its ease), Shift+click / Shift+drag (pick several), Alt+drag (copy). **Changed**: stretching
    a lane selection's swing moved from Alt+drag to **Shift+Alt+drag** (Alt+drag copies everywhere now).

## How it works (for the next stream)
- `tools/three-layers.js`: `bezierAt(b, u)` and the `'bezier'` ease (`key.b = [x1, y1, x2, y2]`); pure helpers
  `shiftKeysAt`, `copyKeysAt`, `pasteKeys`, `easeKeysAt` on a layer's `keys` map. `tools/three-sandbox.html` has the
  same `bezierAt` lines in its `evalKeys` (keep them identical: `dev/labkeys-test.js` cuts the page's evaluator out
  and compares).
- `tools/three-media.js` (the timeline): `keySel` (picked ◆ per layer), drag kinds `keys` / `keyBox`, `moveGroup(…,
  copy)`, `keysChange` / `pushKeysUndo` (undo entries `{ keysSnap }`), `easeChooser` → `LabKeys.chooser`,
  `player._keysGeo()` for checks.
- `tools/three.js`: track handlers `snapKeys`, `onKeysRestore`, `onKeysShift`, `onKeysEase`, `onKeysDelete`,
  `onKeysCopy`, `onKeysPaste`, `pasteTargets`; `trackKeys` carries a ◆'s curve handles.
- `tools/three-keys.js` + `.css`: the card (six drawn eases, Curve with two handles, Snap to beats).
- Not the ♪ react-to curve editor (tools/three-audio-map.js): that one maps sound to a slider; this one shapes time.

## Tests
- `node dev/labkeys-test.js` (in UNIT): the curve (straight, symmetric, overshoot, steep handles), colors, the preview
  page's evaluator = the Lab's for 14 eases × 361 frames, move / clamp / replace, Alt copies, copy / paste across
  times and layers, an ease on several keys.
- `dev/checks/labkeys.js` (real mouse input over CDP on the timeline): ◇ keys a slider and shows its lane; a click in
  the lane adds a key on the beat; a click on a diamond opens the card; Ease in = one undo and the paused preview
  follows; the curve's handle dragged = one undo, the preview's values are the Lab's; export frames show the curve's
  values (and differ from the old ease); Shift+click two ◆, drag them together on the beat (one undo), Alt+drag copies
  (one undo), Esc, Ctrl+C / V at 11 s (one undo), the pasted keys play; undo walks all five changes back and the
  preview follows; saved on disk.
- `sh dev/run-checks.sh labkeys` runs it with labeasy, motionpolish, kinetictype, labrecipes, lazy, boot-test.

## Not done / risks
- The several-at-once selection lives on the layers' ◆ rows; inside a lane, Shift+drag / Shift+click still pick that
  one lane's points (as before), and a lane's Ctrl/⌘+V pastes the last thing copied (a lane's points or ◆).
- A ◆ on a track stands for every setting keyed at that time: its card shows the first one's ease.
- The director's `three_keyframes` tool still sets named eases only (no curve handles), to keep its tool text lean.
- Snap to beats uses the song's detected beats, a few ms off a perfect grid on real songs (as the timeline's Snap did).
- Not tried on the owner's Mac / PC (Linux, SwiftShader here).

## For the patch notes
- **Keyframes you can see**: a slider's keyframes now show as diamonds in its lane under the layer, and pressing a slider's ◇ opens that lane by itself.
- **Click a diamond to pick how it moves**: Linear, Ease, Ease in, Ease out, Bounce or Hold, each drawn small in the card that opens.
- **Curve**: in the same card, drag two handles to shape the move to the next keyframe (steeper = faster); it renders exactly like the preview.
- **Several at once**: Shift+click diamonds on the layers' tracks (or Shift+drag a box), then drag one — they all move together, on the beat.
- **Alt+drag copies** keyframes; **Ctrl/⌘+C, Ctrl/⌘+V** puts them at the playhead, on the selected layer if you like.
- **Snap to beats** sits in the card while a song is loaded.
- Every change is one undo (Ctrl/⌘+Z in the Lab). Note: stretching a selection of lane points is now **Shift+Alt+drag** (Alt+drag copies).
