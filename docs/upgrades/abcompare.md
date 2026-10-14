# ◧ Before / after (round 37, abcompare)

Goal: in the Three.js Lab (the owner's most used tool), after any change that alters the look, the owner can compare
it with the previous state in one move, 0 tokens. That covers a director edit, a 🎲 variation, a 🩺 fix, ✨ Make it
look finished, 🎨 look match, a look / preset, a shuffle, a slider drag session and undo. There's no new button row:
hold a key, a small chip that shows up by itself, the preview's right-click menu, Lab search and the keys sheet.

New files (in the `lab` lazy group, loaded with the Lab): `tools/three-abcompare-core.js` (the logic, Node-tested),
`tools/three-abcompare.js` (`LabAB`: tracking changes, the peek, the split view, the chip, the ways in),
`tools/three-abcompare.css`.

## What you get
### Seeing before
1. **Hold B** in the Lab: the preview shows the scene as it was before the last change. Let go and it's back to now. A gold "Before" badge says which one you're seeing.
2. **Live when it's cheap**: when only slider values or the palette changed (sliders, a variation, a look, a shuffle, most polish / look-match / fix-my-scene results), "before" is the preview itself with the earlier values set for a moment. It stays animated, on the same renderer, and leaves no undo step.
3. **A picture otherwise**: when code, layers or their props changed (a director edit, a code run, a layer added, hidden or blended), "before" is a picture of the scene as it last settled. The preview made it itself (a small JPEG) after a change settled. For a scene's very first state, the Lab's own thumbnail of the scene stands in, so no picture is taken just for opening a scene, which would wake a still preview for nothing (labpace).
4. **B works over the picture too**: after you click the preview, its page now forwards B's key-up, so a hold always ends.
5. **Tap B** (a quick press): a **split view** over the preview, with before on the left and now on the right.
6. **Drag the line** to move the split. **Double-click the line** to swap the sides (now left, before right). **Esc** or tapping B again closes it. Right-clicking the line opens the same menu as the chip.
7. **The split's before side is made at the current moment**: for value changes the preview renders the earlier values for one frame behind a still cover (nothing flickers), then goes back.
8. **Moving around the scene** (labgestures: two-finger turn, pinch, Z) remakes the before side from the new view, so both sides share the camera.
9. **Frozen previews** work: a hold steps one frame so the earlier values show, and the split thaws for its one frame and freezes again.

### The chip
10. **After each look change, a small chip shows for 6 s** at the top centre of the frame, for example "◐ Before: Claude's edit · just now". It stays while you hover it, hold B or have the split open, and its time updates ("2 min ago").
11. **It names the change**: "Claude's edit" / "Astra's edit" (a whole director turn counts as one change), "🎲 New colors" (the variation's take), "🩺 <the fix>", "✨ Look finished", "🎨 Look of <reference>", "Look \"<name>\"", "Shuffle", "Slider change" (a drag session: drags close together count as one), "Undo", "Code run", "Layer change".
12. **Press and hold the chip** = hold B. **Click it** = the split view.
13. **⟲ Keep before** goes back to it, which is undo to it. Values come back as one ordinary slider step (the sliders' own ↶ works), and code / layers come back as a time-machine version ("Kept before: …"). The toast has Undo.
14. **⟲ swaps**: after Keep before, the chip offers the way back ("Before you kept the earlier one"), so ⟲ again returns to what you had.
15. **✓ Keep now** closes the comparison and drops its picture.

### Ways in (no commands needed)
16. **Right-click the preview › View › ◧ Before / after** opens: Split view · Show before for a moment · Swap the sides · ⟲ Keep before · ✓ Keep now. The row's hint says what changed and when.
17. **🔎 Lab search** finds it ("before after", "split", "keep before"), because it indexes the menu row.
18. **The keys sheet** (bottom left) lists **B**: hold to see before, tap for the split. Clicking the line opens the split.
19. **⌘/Ctrl+K**: "Lab: Before / after (split view of the last change)".
20. **For the AI and power users**: `/before-after [split | close | before | swap | keep-before | keep-now | status]`, plus one line in the app map's lab topic (read on demand, so the prompt doesn't grow).

### Light and right (labpace, labgestures, one renderer)
21. **No extra WebGL context**: no second stage and no canvas. Every picture comes from the preview's own renderer (the check counts canvases and iframes in the hub and in the preview's page).
22. **A still scene keeps not drawing**: dragging the line only moves a clip on a picture (measured: 2 frames drawn during a full drag, from the check's own messages). The line moves by `transform` and the clip is the only repaint.
23. **The pointer stays on the line while dragging**: the split view takes the pointer during a drag, so it doesn't slip into the preview's page (where it would orbit the scene).
24. **Nothing settles mid-way**: a change made of several steps (✨ polish measures, applies and measures again; 🎨 look match; a 🩺 fix) counts as one change, and so does a whole director turn. Nothing is recorded while Variations makes its pictures or you hover one, while the time machine shows a version, or during a hold.
25. **Freed when done**: closing, ✓ Keep now, the Lab going off screen and a scene switch drop the overlays, pictures, cover, badge and timers. A scene switch forgets the comparison, since it belonged to the other scene.

## How it works
- **Notes**: small hooks call `LabAB.note(kind, …)` when something changes. They sit in the time machine's `changed()` (run, layers, saved sliders, shuffle, variations) and its `director()` wrapper (who, which chat), the sliders' undo checkpoint and ↶, looks, and Variations / Fix my scene / Make it look finished / Look match (`LabAB.hold()` brackets a multi-step change).
- **Settling**: the notes of one change settle after a short quiet time (1.5 s for slider sessions, about 0.9 s otherwise, at the director turn's end). The scene is then compared with its last settled state (`ThreeLab.tm.state()` plus every slider value). If it differs, that earlier state becomes "before". A rename or a layer's list colour isn't a look change.
- **Pictures**: one small JPEG of each state that settled after a real change (≤ 1280 px, the frame's pixels, made off the preview's next frame at idle, right after it drew the change anyway). Nothing is shot when a scene opens. It's only shown when the next change touches code.

## Tests
- `node dev/abcompare-test.js` (unit, in `UNIT`): 12 tests. Notes merge into one change and the most telling kind names it (a director's who, a variation's take); slider sessions wait longer; values / palette give a live pair and code / layers / props a picture; a rename, a selection or another scene isn't a change; the swap values both ways; the chip's words; tap vs hold; the split clip both ways; the picture size.
- `dev/checks/abcompare.js` (`lab:` group, `--fake-engines`): **18 steps, all pass**. They cover:
  - the starting point taken with its picture
  - a fake-engine director edit through the real MCP route giving "Before: Claude's edit · just now" (picture), with a hold B showing it and the release removing it
  - a slider session giving a live pair, with hold B showing the earlier values and the release putting now back with no undo step left
  - tap B opening the split with before on the left
  - the line dragged to about 20 % on a still scene with 2 frames drawn, and a double-click swapping the sides
  - a view move remaking the before side
  - no new canvas / iframe in the hub or the preview page
  - Esc freeing the picture
  - Keep before, as one slider step undone by the sliders' own ↶, then ⟲ / ⟲ swapping back
  - ✓ Keep now
  - Variations' pictures not counting as a change, and an applied take named "🎲 New colors"
  - the View menu rows, the keys sheet, ⌘K and the command, Lab search finding it, and `/before-after status`
  - close freeing everything, and a scene switch forgetting the comparison
- The screenshots of the chip after a director edit and of the split view were checked by eye. The chip sits under the frame's bar, clear of the scene's own notes at the bottom, and the split sits under the bar like ◐ Compare.
- Also run (`sh dev/run-checks.sh …`): labgestures (+ unit), labvariations, scenedoctor, lazy, unit:boot-test and unit:director-mcp-test all pass.
- **labpace** failed twice at first. One cause was mine: a picture taken 2.5 s after a scene opened landed exactly when labpace measures a still scene. It was removed (the thumbnail stands in), and the check then passed. Its other occasional failures ("draws again within a frame or two", "a screenshot of a still scene") also happen on the parent commit under this machine's load (seen 1 of 3 runs there). The unit `labpace-test` also flickers under load on both, and passes alone.
- **qa-keys**: B works (pressed, not dead). The dead keys reported were the known flaky `|` and Shift+2 (each in one of two runs) and Capture's Ctrl+Alt+P (this machine's capture indicator window can't load). None of them are B.

## Edits outside the new files (small, additive)
- `tools/three-history.js`: one `LabAB.note` line in `changed()` (after its quiet / scrub guards) and one at the end of a director call.
- `tools/three-tweaks.js`: a note on each slider undo checkpoint, on ↶ and on a look.
- `tools/three.js`: the View submenu row, `stageHooks.peekPalette` (a palette shown for a moment, not saved), and the `host-keyup` relay.
- `tools/three-sandbox.html`: B's key-up forwarded to the Lab, and a `view-moved` message when a gesture's motion settles (`LV.told`).
- `tools/three-gestures.js`: `view-moved` becomes the `hearth:lab-view` event.
- `tools/three-variations.js`, `tools/three-doctor.js`, `tools/three-autopolish.js`, `tools/three-lookmatch.js`: one labelled note, or a `hold()` around the multi-step change.
- `lazy-data.js` (the lab group, plus the regenerated manifest), `mcp/hearth-map.js` (one lab-topic line), `dev/run-checks.js` (the check in `lab:` and the unit test).

## Risks / not done
- **Code changes show a picture, not a live "before"**: running the old code again would restart the scene twice per peek. The picture is from when that state settled, so for a moving scene it's a moment earlier, not "now". A view move can't remake it either (the before side of a code change keeps the view it had).
- **A change too fast for its picture**: a code change coming within about half a second of the previous one may have no picture of before. The chip still works and ⟲ Keep before still goes back; hold B then says so.
- **The first change after opening a scene** shows the scene's own Lab thumbnail as "before" (360 px, as old as the thumbnail) when it's a code change. Value changes are always live.
- **Sliders the scene only reads at setup** (counts, seeds) rebuild their layer when "before" is shown, the same as Variations' peeks.
- **Locked sliders** (🔒 in the panel) aren't changed by the peek, the same as everything else that sets values.
- **Code typed but not run yet** counts as part of the scene's state (the time machine's state reads the editor), so it can show up as a "code" change.
- Side-by-side for wide windows (optional in the brief) wasn't built: the split view covers the same need without a second picture slot.
- Tested on SwiftShader under Xvfb; real GPUs and a real trackpad weren't tried here.

## For the patch notes
- New in the Lab: **◧ Before / after**. After any change to the look (the director's edit, a 🎲 variation, a 🩺 fix, ✨ polish, a look, a shuffle, a slider session, undo), you can see how it was before.
- **Hold B** to see before; let go to see now. **Tap B** for a split view: before on the left, now on the right. Drag the line, and double-click it to swap sides.
- A small chip says what changed, like "Before: Claude's edit · 2 min ago", with **⟲ Keep before** (goes back to it, and can be undone) and **✓ Keep now**.
- Also under right-click the preview › View › ◧ Before / after, in 🔎 Lab search and in the keys sheet. It costs no tokens.
- Slider and colour changes show "before" live and animated in the preview itself; code changes show a picture of how it looked.
- It's light: no second 3D view, a still scene keeps not drawing while you drag the line, and moving around the scene updates the before side too.
- Caveat: for code changes, "before" is a picture of the scene from just before the change, not a live replay.
