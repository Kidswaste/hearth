# layerdelete116: the chats delete layers (round 116)

The owner: "also allow the chats to delete layers". When he asked the Three Director, or a chat linked to a scene, to
delete a layer, it often did not happen, or the wrong layer went.

## How it was tested

One check, `dev/checks/layerdelete116.js` (group `layerdelete116` in `dev/run-checks.js`). It uses realscene-lib's
real scene (the bundled Beat burst demo: Backdrop, Beat burst, 🧊 RS bot, Beat rig, ✦ Bloom, a playing song). It adds
three particle layers, a 📁 group "Sparks" (Spark, Spark 2), a ◫ precomp "Intro", and two layers both named "Twin".
The fake engines make real MCP calls (`three_do remove_layer`, the lean list), from the docked Three Director on
screen, and from Claude and Astra chats linked to a scene that is not on screen (backstage). Every deletion is then put
back with one of the owner's undos (the toast's Undo, Ctrl+Z in the Lab, the dock's ↶) and compared with the scene
before it. Everything is in the check's temp folder. No owner scenes or data are used.

The same check was run on round 115's code (`dev/smoke.js --app <copy of 34d9ed5>`).

## What was blocking (round 115)

| Ask | Before |
|---|---|
| By name ("Beat rig") | worked, toast Undo worked |
| By number (3) | worked, but **Ctrl+Z in the Lab did not bring it back** (only the toast's Undo did) |
| "the selected one", a filter (✦ Bloom), a precomp (◫ Intro) | worked |
| A row as `three_layers` shows it ("4. Beat rig*") | refused: `No layer "4. Beat rig*"` |
| A group by its name ("Sparks") | refused: `No layer "Sparks"` |
| **Several at once** (`layers: [...]`) | **the wrong layer went**: `layers` was ignored, so `layer` was empty and the *selected* layer (◫ Intro) was deleted |
| A part several names have ("particles") | **the first match was deleted silently** (Particles A) |
| Two layers with the same name ("Twin") | the first was deleted silently, with no word that there were two |
| The last layer | refused: "A sketch keeps at least one layer", so the AI said it can't |
| Backstage (the chat's scene not on screen) | deleted, but **no toast and no Undo** for the owner; the last layer refused |
| Astra | same as backstage; its tool list never said `remove_layer` could take several |

The tool lists were not the problem: `remove_layer` is in the lean `three_do` list (Claude and Astra) and
`three_remove_layer` is in full mode. No director guard blocks a delete. The hand guard (round 92) only refuses
whole-layer rewrites. What was missing was the `layers` form, a safe way to name layers, and an Undo everywhere.

## What changed

- **`tools/three-layers.js` `ThreeLayers.pickLayers(layers, refs, selId)`**: one place, on screen and backstage, that
  turns what a chat named into layers. It accepts a name, an id, a number (1 = bottom), top, bottom, selected, a
  group's name (all its layers), or a `three_layers` row ("4. Beat rig*"). An exact name comes first. A part of a name
  counts only when one layer has it. A name two layers share, or a part several have, is refused with their numbers
  ("fits 3 layers: 7. Particles A, 8. Particles B, 9. Particles C. Name them by number (layers: [7, 8, 9] deletes
  them all); nothing was deleted"). So the wrong layer never goes.
- **`three_remove_layer` / `three_do remove_layer` take `layers: [...]`** (a list of any of the above), as one step.
- **On screen (`tools/three.js` `removeLayers`)**: one toast, "Claude deleted 3 layers · Undo" (9 s), and the same
  step on the Lab's Ctrl/⌘+Z (`LabDirect.push`; with a song loaded it sits in the timeline's undo, as other Lab steps
  do). Undo puts every layer back in its place, with what the owner had typed in the editor. A tool call is still one
  reply step for the dock's ↶ (LabTxn).
- **The last layer**: deleting every layer leaves one blank "Empty layer" (a transparent renderer, nothing drawn). The
  answer says so (`left: …`), with no refusal. Undo removes the blank layer again if nobody wrote in it.
- **Backstage (`tools/three-backstage.js`)**: the same rules, plus a toast for the owner, "Astra deleted "Glow A" in
  "Scene" · Undo", which puts it back in that scene's data even if the scene is opened meanwhile.
- `tools/three-direct.js`: a step with no layer (lid null) is allowed, and a step its toast already undid does nothing.
- `tools/three-chatlink.js`: the owner's own ↶ of an "Add as new layer" passes the owner token, so its toast doesn't
  say an AI deleted it.
- The words: `three_remove_layer` "Delete a layer, or several: layers [...] (one undo for the user)", and `three_do`
  "remove_layer {layer|layers}". The guide's layers topic: `"delete it / those three" → three_do remove_layer {layer |
  layers: [...]} (undoable; even the last)`. Prompt budgets were kept by trimming the same amount elsewhere
  (`three_layers`' description, a guide line the core already says, "batch … in one call"): lean Director 2127 → 2128
  tokens a message, full 9132 → 9138 (≤ 9150), three_do 200 (≤ 200).
- `bridge.js` (activity strip) and `director-task.js` (task log) name several deleted layers.

## After

`layerdelete116` passes every case above. Each deletion comes back exactly as before (same ids, names, code and groups)
with its undo: the toast for by name, a row, a filter, a precomp, a group, three at once, a twin by number, the owner's
typed layer and every layer. Ctrl+Z works for by number and for a layer in a group. The dock's ↶ works for "selected"
and for backstage replies. Backstage works by name, three at once and the last layer, from Claude, Astra (two at once)
and full mode.

## Tests run

- `dev/checks/layerdelete116.js` (new), before (round 115 code) and after
- `node dev/boot-test.js` (first screen 1693 / 1696 KB)
- `unit:promptdiet-test`, `unit:tokens-test`, `unit:directorlean-test`, `unit:director-mcp-test`
- `labchat92` (the chat ↔ Lab glue and its ↶ Undo of an added layer)

## Left

- The owner's own Delete in the layer menu still keeps one layer (unchanged; the request was about the chats).
- Layer-level merges between two computers (sync) were not touched.

## For the patch notes

- You can ask the Three Director, or any chat working on a scene, to delete layers: one, several at once ("delete the
  three particle layers"), a whole group, a precomp or a filter, even the last one (a blank layer is left).
- Every deletion by an AI shows a toast with Undo, also when the scene isn't on screen. In the Lab, Ctrl+Z brings it
  back too.
- When a name could mean more than one layer, the AI is told which ones instead of guessing, so the wrong layer is
  never deleted.

## For Codex

No Codex-owned file was changed. Astra uses the same `three_do remove_layer {layer | layers: [...]}`. Its tool words
come from `mcp/three-mcp.js` and were checked in the Astra case of the check.
