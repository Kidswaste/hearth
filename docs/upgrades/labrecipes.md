# 📜 Recipes (round 39, labrecipes): your finishing steps, recorded once, replayed on any scene, 0 tokens

The owner finishes most Lab scenes the same way: a glow or grain filter with its settings nudged, a palette, a frame
size, the same sliders moved, Speed pulsing on the kick, the export settings. **Recipes** records those steps once on
one scene and replays them on any other scene in one click, as one undo step. Nothing goes to an AI.

How to get there, no commands needed: **right-click the preview › ✦ More › 📜 Recipes** (● Record a recipe · Use a
recipe… · Use on several scenes…), **the Lab toolbar's ⋯ › 📜 Recipes**, **🔎 Lab search** ("record a recipe", "use a
recipe": it indexes those menu rows) and **⌘/Ctrl+K** ("Lab: Record a recipe…", "Lab: Use a recipe…"). The app's internal
command is `/recipe`.

## Recording
1. **● Record a recipe** starts recording on the scene on screen.
2. **A small red chip** over the preview (top left, under the frame bar) says "Recording · N steps", with a pulsing dot. Hovering it lists the steps captured so far.
3. **■ Stop** on the chip (or ✦ More › 📜 Recipes › ■ Stop recording…) asks for a name, with the steps summed up ("7 steps: 3 sliders, 1 effect…"). The default name is "Finish like <scene>".
4. **✕** on the chip throws the recording away.
5. **Effects picker items**: filters, layers, looks, palettes, trigger presets, animations, blends, eases and the packs' own families (motion…), with Shift+Enter's "other way" kept.
6. **The settings you move afterwards on a filter / layer it added** are steps on *that* layer (so on another scene they land on the new filter, not on a layer with the same name).
7. **Slider moves** on any layer, by the slider's name and its role. A drag session (or the same slider moved again with nothing else in between) is one step with its last value.
8. **♪ Music links** (Move with the music, the ♪ panel, ✦ Make it react): the link, its "how" and its range.
9. **The palette**, however it was set (🎨, a look, Palette from cover…).
10. **Trigger presets** from the timeline's Presets ▾ (and your own saved setups: the bands and timing themselves are kept).
11. **The frame size** (the pills, Shift+1…5, More…, a custom size). Clicking through sizes keeps the last one.
12. **▦ All formats picks** (which shapes are ticked).
13. **⇪ Export settings** (format, size, frame rate, quality, supersample, motion blur) when you export.
14. **✨ Make it look finished**: replayed as "measure and fix this scene", so it adapts to the scene it runs on.
15. **🎨 Look match**: the matched grade, lens and palette values are kept, so the replay doesn't need the reference picture.
16. **Layers added from the gallery** ("Add as a layer"): the layer's code travels in the step.
17. **Any other layer added** while recording (a ◐ grade, particles, a type layer…) is a step too.
18. **A layer's saved slider look**: its name, and its values as a fallback (another scene rarely has the same look).
19. **What isn't recorded**: mouse moves, code you type or a director's code edits, changes on another scene opened meanwhile, and what an action changes on its own (a look's filters, polish's slider moves are part of that one step, not extra steps).

## Using a recipe
20. **Use a recipe…**: a picker with your recipes (newest first, with a one-line summary and the scene it came from), a search over names and step words, ↑ ↓ and Enter.
21. **What fits this scene, before anything changes**: each step shows ✓ and where it will land ("Bloom on Tunnel (same role)", "the new layer", "already this size"), or **"skipped here: no slider like "Glow" here"** in orange, struck through. The header says "6 of 7 steps fit "<scene>"".
22. **▶ Use on "<scene>"** replays every step that fits, then one toast: "📜 "Finish": 6 of 7 steps · 1 skipped (no slider like "Background" here)" with **Undo**.
23. **One undo step**: Undo (the toast, `/recipe undo`) puts back the layers, every slider value, the palette, the ♪ links, the frame size, the trigger setup and the export / format picks.
24. **◧ Before / after** sees the whole replay as one change, named "📜 Recipe "…"" (hold B, tap B for the split), and the time machine has one version for it.
25. **Finding the slider on another scene**: the same key, else the same label, else the same role (glow ≈ bloom ≈ glare, speed ≈ tempo, size, count, color, background, grain, blur…, the same kind of value). A number keeps its place in the range ("2.7 of 0–3" becomes 0.9 on a 0–1 slider); a ♪ link's range moves the same way.
26. **Steps never land on the wrong layer**: a step recorded on one of the scene's own layers never lands on a layer the recipe itself just added.
27. **Quiet while it plays**: the steps' own notes don't pile up as toasts; only errors show, then the one summary.
28. **Use on several scenes…**: tick recent scenes; the recipe runs on each one after another (each scene's time machine can take it back), then you're back on your scene.

## Editing and keeping them
29. **Edit a recipe in the picker**: ↑ / ↓ to reorder, ✕ to remove a step (they show on hover), and rename it in place. A step moved above the step that makes its layer says so.
30. **Files in Hearth's data folder**: `data/recipes/<id>.json`, plain JSON, synced to your other computer like the rest of the data folder.
31. **⇪ Share as a pack…**: one `.hearthpack` of kind **recipe** ("A recipe of 6 steps to replay on any Lab scene"). Opening it shows **Add to my recipes**.
32. **Delete…** moves the recipe's file to the system Trash. **Show in folder** opens it in Finder / Explorer. The same rows are on a recipe's right-click and its ⋯.

## For the AI and power users (no new tool, no prompt tokens)
33. **`/recipe`**: `list` · `show <name>` (its steps, and which fit the scene on screen) · `use <name>` · `undo` · `record` · `stop [name]` · `share <name>` · `delete <name>` · `batch <name>`; alone, the picker.
34. **The Three Director** reaches it through `three_do run '/recipe …'` (one line in the app map's lab topic, read on demand). Recording, sharing, deleting and batches are the owner's to do (it's told so).
35. **⌘/Ctrl+K**: "Lab: Record a recipe (your finishing steps, replayed on any scene)" and "Lab: Use a recipe… (replay recorded steps on this scene)".
36. **One discovery tip** (through Hints, so it waits its turn and respects "Don't show tips"): after finishing steps on two scenes in one session, with no recipe yet, a toast offers "● Record".

**36 upgrades.**

## How it's built
- `tools/three-recipes-core.js` (`RecipeCore`, no DOM, Node-tested): the step kinds, `snapDiff` (what changed between two snapshots of the scene: sliders + ♪ links per layer, the palette, new layers; a layer whose code changed isn't a slider move), `compress` (one step per change), `describe` / `summary` (plain words), `roleOf` (≈ 18 roles), `candidates` / `matchSlider` / `valueFor` / `linkFor` (replay mapping), `plan` (what fits a scene), `make` / `check` (the file), `move` / `drop` / `orphans`, `search`.
- `tools/three-recipes-hook.js` (`LabRecipesHook`, in the **lab** group, small): the taps (`note(kind, data)`, `begin(kind, data) → finish(extra | false)`), which do nothing unless a recording is on; the menu rows; the discovery tip.
- `tools/three-recipes.js` (`LabRecipes`, lazy group **labrecipes**, tier "use") + `tools/three-recipes.css`: the recorder (snapshots of the scene compared after each change, 450 ms after the last one; actions made of several changes recorded as one step through `begin`), the chip, storage, the picker, the replay (`runStep` per kind, through the Lab's own APIs: `ThreeFX.apply`, `director.sliders` / `looks` / `addLayer` / `triggers` / `refs.setPalette`, the sliders' `link`, the frame size), the undo, the batch, packs, `/recipe`, the ⌘K actions.

## Edits outside the new files (small, additive)
- `tools/three-fx.js`: `apply` wraps the old body (`applyItem`) with one `begin('fx', …)`.
- `tools/three-tweaks.js`: one `note('sliders')` beside the ◧ one at the slider checkpoint; a look applied is one `begin('look', …)`.
- `tools/three.js`: `note('frame')` in the frame-size change, `note(kind)` in a layer's persist (♪ links, looks), `note('layers')` in `touch()`.
- `tools/three-triggers.js` (Presets ▾), `tools/three-formats.js` (a pick), `tools/three-export.js` (Export): one `note` each.
- `tools/three-lookmatch.js`, `tools/three-autopolish.js`, `tools/three-gallery.js` ("Add as a layer"): one `begin` / `finish` each.
- `tools/three-abcompare-core.js`: the `recipe` kind (◧ names a replay).
- `tools/three-easy.js`: the ✦ More row and the toolbar ⋯ row (guarded by `typeof LabRecipesHook`).
- `packs-core.js`: kind `recipe` (no scene needed, its steps checked, "A recipe of N steps…"); `tools/three-packs.js`: the recipe passes through `save`, "Add to my recipes", its import goes to `LabRecipes.fromPack`.
- `lazy-data.js` (the hook in the lab group, the new group, the regenerated manifest), `index.html` (`labrecipes` on the existing lazy-at.js tag), `mcp/hearth-map.js` (one lab-topic line + aliases `labrecipe(s)`; "recipe" alone stays the studio's pipelines), `dev/run-checks.js` (the check first in `lab:`, the unit test in UNIT), `FEATURES.md` (a short section).

## Tests
- `node dev/labrecipes-test.js` (unit group), **10 tests, all pass**: capture (a slider move, a ♪ link, the palette, a new layer with its code and props; a code change isn't a slider move; a move on a layer the recipe made points at that step; another scene records nothing), one step per change, plain words, replay mapping (by key / label / role, numbers keep their place in the range, a choice must exist, a same-name layer wins, link ranges moved, a made layer only, never onto a layer the recipe made), roles, the preview (what fits, the skipped step's note, steps on a layer the recipe makes), the file (cleaned, a too-big layer refused, a newer version flagged), editing (move / drop / orphans), search, and the **.hearthpack round trip** in plain Node (packsmain write → peek → unpack: kind recipe, no scene, the steps and a layer step's code intact; a recipe pack without steps refused, a scene pack still needs a scene).
- `dev/checks/labrecipes.js` (lab group, ≈ 1 min), **15 steps, all pass**: not loaded before use; the ✦ More and toolbar ⋯ ways in; ● Record → the chip; 7 steps captured (a Glow filter, its strength on the layer it made, Glow amount moved twice = one step, Background, ♪ Speed on the kick, 9:16, a palette) with the chip's count; ■ Stop → name → `data/recipes/<id>.json`; a different scene: the picker shows 6 of 7 fitting, Background skipped with its note, Glow amount → Bloom by role; ▶ Use: the filter and its strength, Bloom 0.9, Speed's link range 2–8, 9:16, the palette; ◧ Before / after names it, the time machine has it; one Undo puts everything back; ✕ and ↑ in the picker rewrite the file; `/recipe list / show / delete` as the AI (delete refused); Share as a pack → Open → Add to my recipes; Delete → the Trash; Use on several scenes and back home.
- Also run: `sh dev/run-checks.sh lazy unit:boot-test unit:director-mcp-test abcompare labtemplates labsearch labeasy unit:packs-test packs lookmatch autopolish gallery`: **all pass** (manifest regenerated, 0 duplicate commands, the director's lean tool budget unchanged).
- Screenshots looked at: the red chip over a 9:16 preview ("Recording · 7 steps ■ Stop ✕"), the picker on the second scene (the skipped Background step in orange, "6 of 7 steps fit").

## Caveats / not done
- **Optional "after New from my template"** wasn't built; "Use on several scenes…" was.
- **Code isn't a step**: a director's code edit or code you type isn't recorded (it rarely fits another scene). Layers added are recorded with their code.
- **Role matching is a guess**: "Glow amount" finding "Bloom" is right most of the time; a scene with two glow-like sliders gets the one on the best-matching layer. The picker shows where each step will land before you use it.
- **Removing / hiding layers, blend and opacity edits in the Layers panel** aren't steps (blend presets from the effects picker are).
- **The discovery tip** isn't covered by the check (it waits for Hints' quiet moments).
- **A batch** is undone scene by scene in each scene's ◷ History, not with one Undo.
- Tested on Linux under Xvfb with software WebGL; the Trash move used Electron's own trash there.

## For the patch notes
- New in the Lab: **📜 Recipes**. Do your usual finishing steps once and replay them on any scene in one click, no tokens: right-click the preview › ✦ More › 📜 Recipes › **● Record a recipe** (also in the toolbar's ⋯, Lab search and ⌘/Ctrl+K).
- While it records, a small red chip counts the steps: effects and filters with their settings, looks, palettes, presets, sliders you move, ♪ music links, the frame size, All formats picks, ✨ polish, 🎨 look match, layers from the gallery, export settings. **■ Stop** names it.
- **Use a recipe…** shows its steps and which ones fit the scene on screen. A step that doesn't fit (say, no glow slider here) is skipped with a note. Sliders are found by name or by what they do, so "Glow amount" can land on "Bloom".
- The whole replay is **one Undo**, and ◧ Before / after shows it as one change.
- Edit a recipe in the picker (reorder or remove steps, rename), use it on several scenes at once, share it as a pack, or delete it to the Trash. Recipes are files in Hearth's data folder, so they sync to your other computer.
- You can also ask the director: "use my Finish recipe on this scene".
- Caveat: code edits aren't recorded, only Lab actions.
