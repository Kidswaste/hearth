# Round 136 · outline136: 🗂 A clear scene outline the owner can tidy and the AI reads

The owner's Lab scenes keep growing. Blocks, lyrics, takes, drafts and dials all add layers. This round fills the gaps
in the Layers list so a long scene stays readable: groups with colour tags, faded, moved and keyed as one; names
changed in place; **✦ Name these for me**; a find field; Alt+↑ / ↓; and one undo for each change. The director's
scene outline now names the groups, so "make the bass group calmer" points at real layers.

## What existed (and what this round does with it)

| Piece | What it did | This round |
| --- | --- | --- |
| **Layers panel** (`tools/three-layers.js`) | Rows bottom-first, eye, S (solo), swatch, tags, drag to reorder, right-click menu, Ctrl/⌘+C / V, Delete. Rename opened a dialog. | **Extended:** rename in place, a ⋯ in its head, 🔍 find, colour tags. |
| **Layer groups** (layergroups, round 44: `tools/three-groups*.js`) | Folders as data on the layers (`L.group = {id, name, closed}`). Ctrl/⌘+G / Ctrl/⌘+Shift+G, fold, the group's eye, solo (saved, renders follow), drag in / out, precomps, recipes, `/group`. Its own undo: the toast and Ctrl/⌘+Z in the Layers list only. | **Extended:** colour tag, Alt+↑ / ↓, fade / move / key as one, and every step joins the Lab's own Ctrl/⌘+Z. |
| **Mute / solo in renders** | A group's eye or a solo sets `visible: false` with a reason (`L.hid`). The preview, stills, the export page, the sequence and backstage all read `visible`. | **Unchanged and proved again:** the check reads the screen, the merged still and an export-page frame. ◉ Perform plays the same preview, so it follows too. |
| **Reorder** | Drag (one group undo); the right-click's Move up / down / To the top called `reorderLayers` with **no undo**. | Move up / down now use the same step as Alt+↑ / ↓; To the top is one undo step. |
| **🧩 Blocks chain** (blocks134) | The card's own list of the scene's 🧩 layers, drag to reorder them. | Not changed. Blocks are ordinary layers, so they group, rename and move like the rest. |
| **The AI's outline** (`three_layers`, `three_get_code`, `three_do layers`, `tools/three-director.js` `layerLine`) | One line per layer, bottom first: name, kind, hidden, opacity, sliders… The full rows (`report: 'full'`) had `group`, but **the lean line the director reads left it out**. | **Fixed:** each grouped layer's line says `📁 <group>` (and `solo`). Names and order were already there. |
| **LabDirect** (`tools/three-direct.js`) | The Lab's own Ctrl/⌘+Z steps (picture moves, looks, deleted layers, dials). | **Reused:** every group, rename, reorder and group fade step is pushed there too. |

## What's new, and where the owner clicks

No new toolbar row. One small **⋯** sits in the Layers head next to ＋ Layer, ⧉ and 🗑.

- **Groups**
  - Make one as before: Ctrl/⌘+click a few layers, then **Ctrl/⌘+G** (or ⋯ › 📁 Group layers).
  - **Rename in place:** double-click the group's name, type, Enter (Esc keeps it).
  - **Colour tag:** right-click a group's header › **Colour tag** › red, orange, yellow, green, blue, violet, grey (or
    No colour). The header gets a coloured edge and its layers' line takes the colour.
  - **Drag layers in and out**, fold, eye (mute) and S (solo) work as before. Renders, stills and Perform follow.
  - **Fade, move & key as one:** right-click a group's header › **Fade, move & key…** opens a small card (260 px, ✕ or
    Esc closes it):
    - **Fade** scales every layer's own opacity (two layers at 100 % and 50 % faded to half → 50 % and 25 %).
    - **Move X / Move Y** shift every layer's own place.
    - **◆ Key here** puts a key for fade and place on every layer of the group, at the playhead. With no song, the
      scene's own timeline is turned on. An animated value gets a key where you move it, as in Layer settings.
    - Each release is one undo step.
  - Right-click a group › **Move up / Move down** (Alt+↑ / ↓ after clicking its header).
- **Rename a layer in place:** double-click its name (or right-click › Rename…), type, Enter.
- **✦ Name these for me** (⋯): plain names from each layer's code and sliders, worked out on this computer with no AI
  and no tokens. Examples:
  - "Gradient backdrop" (the liquid shader);
  - "Kick particles" (Beat burst);
  - "Glow ring" (a torus with a Glow slider);
  - "Kick rings", "Bass particles", "Film grain", "Bloom", "3D model", "Lyrics".

  It renames the picked layers. With none picked, it renames the layers with names like "Layer 3" or "… copy". If
  every layer already has its own name, it asks before renaming them all. Names stay unique. All of it is one undo.
- **✦ Name them with AI…** (⋯): only on a click. A confirm shows the cost first ("About 900 tokens in and 52 out ·
  Claude · … (the cheapest helper)"), and nothing is sent before **Name them**. It makes one lean helper pass on the
  dock's AI, like ✦ Explain this layer, and all its names are one undo.
- **🔍 Find a layer:** ⋯ › Find a layer, or **Ctrl/⌘+F** in the Layers list. A small field shows above the list only
  while you look. The list keeps the layers whose name (or group name) has every word typed, under their group's
  header. The count says "3 of 12". Enter selects the first, and Esc or ✕ closes the field.
- **Reorder with the keyboard:** click a layer, then **Alt+↑ / Alt+↓**.
  - A layer swaps with its neighbour.
  - At its group's edge it steps out of the group. Next to a group, it steps in.
  - After a click on a group's header, the whole group jumps past the next layer or group.
  - The keys sheet lists it.
- **One undo for each change:** every group step (make, drag in or out, mute, solo, colour, fold, rename, Alt+↑ / ↓,
  fade, move, ◆ key) and every rename is one step of the Lab's own **Ctrl/⌘+Z**. It works on the picture, in the
  Layers list and on the timeline. The toasts' Undo still works.

### The AI reads it
`three_layers`, `three_do layers` and `three_get_code`'s outline now read, for example:

```
1. Blue*
2. Spare · 📁 Warm
3. Red · 📁 Warm
4. Green · 📁 Warm
```

The owner's names, the order and the group names are all there, and nothing else was added. The prompt and tool list
are unchanged: promptdiet full 7782 / 7940, lean 2060 / 2100, three_do 186 / 190.

## Files
- `tools/three-outline-core.js` (new, pure, loads in Node): `OutlineCore`, which holds the local names (`nameFor`,
  `plan`, `isGeneric`), the ✦ prompt, the parse and the cost line.
- `tools/three-outline.js` + `tools/three-outline.css` (new): `LabOutline`, which holds the ⋯ menu, ✦ Name these for
  me, the AI pass, and the Fade, move & key card. It is lazy group **outline** (`tier: 'use'`, after `lab`) in
  `lazy-data.js` (the manifest was re-run, so `lazy-meta.js` changed too). It also needed `index.html`'s
  `lazy-at.js#…dials,outline,…` and `docs/lazy-groups.md`. The first screen is unchanged (boot-test: 62 scripts, 1584
  KB of 1586).
- `tools/three-groups-core.js`: `COLORS`, `color`, `nudge` (Alt+↑ / ↓), `filterRows` (🔍). A group brought together
  keeps its colour.
- `tools/three-groups.js`: `remember` (each step also goes to LabDirect), `undo(entry)` for names and fades, `color`,
  `nudge`, `names` / `renameLayer`, `snaps` / `propsDone`, the header menu rows, Alt+↑ / ↓, and the keys sheet lines.
- `tools/three-layers.js`: the ⋯ in the head, the 🔍 field, Ctrl/⌘+F, rename in place (layers and groups), colour
  tags, `find()` / `rename()`.
- `tools/three-lab.css`: the colour tag, the rename field and the find field.
- `tools/three.js` (marked): `groupsHost.edit / value / key / time / sliders / find`. The right-click's Rename… works
  in place, and its moves are each one undo step.
- `tools/three-direct.js` (marked): `LabDirect.last()`.
- `tools/three-director.js` (marked): `layerLine` says `📁 <group>` and `solo`.
- `dev/fake-common.js`: the fake ✦ names answer. `dev/fake-liveness.js`: that prompt is not a long-task scenario.
- `dev/run-checks.js`: the `outline136` group.

## Tests
One check, `dev/checks/outline136.js` (group `outline136`, with fake engines). Every step passes:
1. Ctrl/⌘+G makes a group, and a double-click renames it in place. Red and Green are dragged onto its header (real
   drag events), each one undo step, and the picture is unchanged.
2. The group's eye: only Blue on screen, in the merged still and in an export-page render frame. One Ctrl/⌘+Z brings
   it back. The group's S: only Red and Green in all three. A real Ctrl/⌘+Z in the Layers list ends it.
3. A layer renamed in place (no dialog) is one undo step, and Ctrl/⌘+Z puts the old name back.
4. Real Alt+↑, Alt+↑ and Alt+↓: into the group at its edge, a swap, back. Three Ctrl/⌘+Z restore the order and the
   group.
5. The director's outline has `📁 Warm` on the 3 grouped layers. A fake-engine `three_do layers` call answers with it.
6. Fade, move & key: the card opens (≤ 300 px). Fade to 0 hides Red and Green on screen and in the still, as one undo
   step, and Ctrl/⌘+Z brings them back. ◆ Key here keys fade and place on the 3 members as one step, and one Ctrl/⌘+Z
   in the list removes those keys.
7. 🔍 "gre" leaves only Green under its header, and closing it shows all 4.
8. On a scene of the bundled demo layers named "Layer 1–4", ⋯ › ✦ Name these for me gives "Gradient backdrop", "Kick
   particles", "Glow ring" and "Glow", with no AI sent. That is one undo step, and one Ctrl/⌘+Z puts all four names
   back. The AI pass's cost line is ready, and nothing is sent.

Also run, all passing: `layergroups`, `labchat92`, `blocks134`, `unit:layergroups-test`, `unit:promptdiet-test`,
`unit:director-mcp-test`, `unit:directorlean-test`, `node dev/boot-test.js` (3064), `dev/slim116-test.js` and
`dev/selfmap118-test.js`.

## For the patch notes
- The Lab's Layers list has a small ⋯ in its head. It holds Find a layer, ✦ Name these for me, groups, and move up /
  down.
- ✦ Name these for me gives your layers plain names from what they show ("Glow ring", "Bass particles", "Gradient
  backdrop"). It runs on your computer for free. ✦ Name them with AI is there too, and it shows the cost before
  anything is sent.
- Double-click a layer's or a group's name to rename it right there.
- Groups can have a colour tag (right-click the group's header › Colour tag).
- Right-click a group › Fade, move & key… fades, moves and keys the whole group as one.
- Alt+↑ / Alt+↓ moves the selected layer (or a group, after you click its header) up and down the list.
- Ctrl/⌘+F in the Layers list finds a layer by its name or its group's name.
- Every one of these changes is one Ctrl/⌘+Z in the Lab, including group changes, renames and moves (the right-click
  Move up / down had no undo before).
- The Three Director now sees your groups by name in its scene outline, so "make the bass group calmer" works.

## For Codex
No Codex-owned file was touched (astra*, codex-*, projects*, project-workspace*, sync-engine.js, cloud-files.js,
workbench-*, engine-watch.js). Groups, colour tags and names are on the layers in kv `three-sketches`, as before. They
sync with the scene with no new store and no new sync kind.
