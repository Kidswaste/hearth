# 📁 Layer groups and quick visibility (round 44, layergroups): folders for scenes with many layers, 0 tokens

The owner's Lab scenes grow to many layers. The Layers list now has **groups** (folders), a group's **eye**, **solo**
for a layer or a group, drag in and out, and it all reaches every place a scene is drawn or copied. Nothing new sits on
screen until you use it: the S buttons show on hover, a group's header only exists once you make a group.

How it works underneath (tools/three-groups-core.js): a group is data on the layers themselves (`layer.group = { id,
name, closed }`), and a group's eye or a solo hides layers with the same `visible: false` every renderer already reads
(marked with why, so showing the group or ending the solo brings back exactly those). So the preview, stills,
recordings, renders and exports, the Lab sequence, variations, ◧ before / after, the time machine, My templates,
📜 recipes, packs and backstage scenes all follow without each knowing about groups. Draw order is the list's order.

How to reach it, no commands needed: **Ctrl/⌘+click or Shift+click** layers in the Layers list, then **Ctrl/⌘+G**
(only while you work in the Layers list: elsewhere Ctrl+G is still "agents side by side"), or **right-click a layer ›
📁 Group layers ›**. **Right-click a group's header** for its menu. **Ctrl/⌘+K** (Find anything) and **🔎 Lab search**
find "group layers", "ungroup", "solo". The internal command is `/group`.

## Groups
1. **Group layers**: Ctrl/⌘+click (or Shift+click for a range) the layers, then Ctrl/⌘+G: they become one group, gathered where the topmost of them was (as in Photoshop), in their order.
2. **Picked rows are outlined** in gold, so you see what Ctrl/⌘+G will group.
3. **Right-click a layer › 📁 Group layers ›**: group the picked layers (or start a new group with this one), put it into an existing group, take it out of its group, ungroup, solo the group, make the group a precomp.
4. **A group's header** in the list: ▾ / ▸ fold, its own eye, 📁 its name, how many layers, S.
5. **Its layers are indented** under a thin gold line, so the folder reads at a glance.
6. **Fold / unfold** with ▾ (saved with the scene): a long list gets short.
7. **Rename**: double-click the group's name (or right-click › Rename…).
8. **Ungroup**: Ctrl/⌘+Shift+G (the selected layer's group) or right-click › Ungroup; the layers stay where they are and as they show.
9. **Drag a layer onto a group's header**: it joins the group, at its top.
10. **Drag a layer onto a layer of a group**: it joins that group at that place; onto an ungrouped layer: it leaves its group.
11. **Drag a group's header**: the whole group moves (never into another group); draw order follows the list.
12. **Drop under the last row**: the layer goes to the very bottom, out of any group.
13. **Bring its layers together**: a layer added between two members (by a director, say) splits a group into two headers with one name instead of moving anything in the picture; right-click › Bring its layers together joins them again.
14. **Undo**: every group change has an Undo on its toast, and **Ctrl/⌘+Z in the Layers list** takes back the last group / solo change (only what that change did: a layer you hid afterwards stays hidden).

## Quick visibility
15. **A group's eye hides the whole group**: its layers aren't drawn anywhere (preview, stills, renders, exports, the sequence).
16. **Showing the group brings back exactly what it hid**: a layer you had hidden yourself inside it stays hidden; a half-hidden group's eye shows dimmed.
17. **Solo a layer**: its small **S** (on hover), Alt+click its eye (as before), Alt+Shift+its number, the timeline's S, or right-click › Show only this one. Again: everything back.
18. **Solo a group**: its header's S or Alt+click its eye: only that group's layers show (a layer you hid inside it stays hidden; a hidden group shows for its solo and is hidden again after).
19. **Solo is saved with the scene now** (After Effects' way) and **renders show what you see**: a soloed scene renders, exports, records and makes variations of only that layer / group. (Before, solo was a preview-only state that vanished on a scene switch.)
20. **The S is lit** while a layer / group is solo, and the other rows dim, so a forgotten solo is easy to spot; **Show every layer** sits in any layer's right-click while a solo is on.
21. **A layer hidden by its group or by a solo** has a dimmer eye and says so when you point at it ("Hidden with its group: show it"); clicking it shows that one layer.
22. **Mute**: the timeline's M (hide a layer's track) keeps working; layers make no sound of their own, so a separate audio mute wasn't added (Lab music mute stays where it was).

## Precomps (a layer made of layers, tools/three-comp.js)
23. **◫ Make it a precomp** (right-click a group): its layers move to a scene of their own and show here as one ◫ precomp layer with the group's name, at the group's place, same picture; precomp settings (time, crop, mask, effects) then apply to it as a whole.
24. **📁 Back to a group** (right-click a precomp of a scene or sketch): its scene's layers come into this scene as a group named after it (the source scene stays as it is); it says first when the precomp's own time / crop / effects won't come along.
25. **Asks first when sliders aren't saved** in the group's layers (a precomp shows the saved values).
26. **One undo** for each (the toast's Undo, Ctrl/⌘+Z in the Layers list): the group comes back and the scene made for the precomp goes to History's deleted sketches.

## Everywhere a scene goes
27. **Saved with the scene** (and synced): groups, folds and solo live on the layers, so they come back after a restart, on the other computer, in the time machine's versions and in packs. Saved scenes go through the round 43 scene safety as before (nothing new is written outside the scenes store).
28. **Before / after (◧)** ignores a pure grouping / rename / fold (the picture didn't change) but sees a group's eye or a solo.
29. **📜 Recipes record group steps**: group (by layer names), ungroup, hide / show a group, rename it, solo (a layer or a group) and solo off, each one step in plain words ("📁 Group "Stars", "Glow" as "Back""), replayed by name on another scene (skipped with a note when no layer matches).
30. **My templates / variations / packs** carry the groups along with the layers (they copy the layers whole).
31. **The Three Director sees groups** in its layers summary (`group`, `solo`) and its app map (topic lab) explains that a hidden group or a solo is `visible: false`; it can run `/group` through `three_do run`. Nothing was added to its prompt or tool list.

## Ways in
32. **Ctrl/⌘+G / Ctrl/⌘+Shift+G / Ctrl/⌘+Z in the Layers list**, scoped to it (checked: the app's own Ctrl+G side-by-side doesn't fire there), listed in the keys sheet (bottom left) under Lab sliders & layers, with Ctrl/⌘+click / Shift+click.
33. **Find anything (Ctrl/⌘+K)**: "Lab: Group layers", "Lab: Ungroup layers", "Lab: Solo: show only the selected layer", "Lab: Show every layer (solo off)", "Lab: Hide / show the selected layer's group", and a help answer "How do I group Lab layers, or show only one (solo)?".
34. **🔎 Lab search** finds 📁 Group layers › rows and "solo" (the layer menu's Show only this one now says "solo").
35. **`/group`** (internal, for power use and the directors): `/group Stars, Glow as Back`, `/group list`, `/group hide|show|solo|fold|unfold|ungroup|precomp <group>`, `/group solo <layer>`, `/group all`, `/group rename <group> to <name>`, `/group unpack <precomp>`, `/group undo`.
36. **A tip, once**: a scene with 6 or more layers and no group yet offers "Many layers? Ctrl/⌘+click a few… Ctrl/⌘+G" through Hints.

## Tests
- `node dev/layergroups-test.js` (UNIT, 11 tests): grouping order, rows / folds / split runs, a group's eye, solo of a
  layer and of a group, drag in / out / group blocks, take out, three-way undo, cleaning saved data, words.
- `dev/checks/layergroups.js` (in `lab:`): 3 WebGL layers (red / green / blue thirds); real Ctrl+click and Ctrl+G
  (grid unchanged); the group's eye → nothing drawn in the merged picture, on screen and in the sequence compile; S →
  only Green; Alt+click eye; drag out / onto the header (draw order); real Ctrl+Z twice; 📜 recording catches rename /
  hide / show / solo; replay by name; menus, `/group list`, keys; precomp and back (same picture); reload: group,
  fold and solo kept and drawn so.

## For the patch notes
- 📁 Layer groups in the Lab: Ctrl/⌘+click a few layers in the Layers list, then Ctrl/⌘+G (or right-click a layer ›
  📁 Group layers). A group folds with ▾, has its own eye, and you drag layers in and out of it.
- A group's eye hides the whole group, and showing it again brings back exactly what it hid.
- S (point at a layer or a group) or Alt+click an eye shows only that layer or group. Solo is now saved with the scene
  and renders show what you see, like After Effects; the lit S tells you a solo is on.
- Ctrl/⌘+Shift+G ungroups, Ctrl/⌘+Z in the Layers list undoes the last group change; elsewhere Ctrl+G still puts
  agents side by side.
- Right-click a group › ◫ Make it a precomp turns it into one precomp layer; right-click a precomp › 📁 Back to a
  group brings its layers back as a group.
- Recipes record group steps (group, hide, show, solo) and replay them by layer names on other scenes.
- Groups travel with the scene: after a restart, on your other computer, in templates, packs and the time machine.
- Caveat: a layer added between two layers of a group splits it in the list (two headers, one name) rather than
  moving anything; right-click › Bring its layers together joins it again.
