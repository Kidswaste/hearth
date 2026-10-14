# 📐 My templates (round 35, labtemplates): any Lab scene becomes a reusable starting point, 0 tokens

The owner builds a scene they like, then wants "the same, with another title / song / logo / colors". **My templates**
keeps any Lab scene as a starting point: its words, colors, pictures, sound and sliders become a short form. Picking a
template opens that form next to a live preview, and **Create** makes a new scene with the fields filled in. Nothing
goes to an AI, so it costs 0 tokens.

How to get there, no commands needed: **right-click the preview › ✦ More › 📐 My templates** (New from my template… ·
Save as my template…), **the Lab toolbar's ⋯ › 📐 My templates**, **Sketch ▾ › 📐 My templates**, the **gallery**
("Start from something like…": a 📐 My templates row on top once you have one) and ⌘/Ctrl+K. The app's internal command
is `/my-template`.

## Saving a template
1. **Save as my template…**: a small card with a picture of the preview (the Lab's own small snapshot), the name (the scene's by default) and what becomes a field.
2. **Every field by default**: every slider, the palette, the text layers' words, and a slot per picture / video / sound (the scene's references and its song).
3. **Pick the fields per group**: Text · Pictures, video & sound · Palette · Sliders per layer, one tick each. Open a group to untick single fields. The card counts them ("7 fields to fill in").
4. **The sliders as you see them**: moved-but-unsaved slider values are what the template keeps.
5. **Replace one**: the same name as an existing template turns the button into "Replace "…"", and the old one goes to the Trash.
6. **Portable files**: `data/templates/<id>/template.json` (plain JSON), `thumb.jpg`, and `files/` with copies of its media, so the template still works when the scene's references change. Files over 100 MB stay where they are and the template points at them.
7. **Synced** like the rest of Hearth's data folder (cloud sync carries data/templates/), so templates show on the other computer.

## Starting from one
8. **New from my template…**: a calm picker in the gallery's look: picture cards, newest first, a search over names, field names and layer names. Enter takes the first card, and the arrow keys move between cards.
9. **The form**: the words (one line, or a box for multi-line text), a **drop slot** per picture / video / sound (drop a file or click to pick one, ↺ for the template's own), the palette swatches, color pickers, then sliders with their own ranges, switches and choices. Past 8 sliders, the rest fold under "More sliders (N)".
10. **A live preview**: the template runs on a small stage of its own next to the fields, with the values typed (words, colors, sliders, the new picture and the palette), at the template's frame shape. A layer error shows under it in one line. It uses one extra WebGL context only while the form is open.
11. **↺ Its own values** puts every field back. **New scene** names the scene (the template's name by default; a taken name gets a number).
12. **Create** (or Enter): a new scene with the fields applied. Sliders and words are written into the layers' code (like Save), the picture is a reference again (same key, so the code finds it), the song is the scene's song, and the palette and frame size come along. The scene you started from is untouched.
13. **Its own history entry**: the new scene's first version in the time machine reads *From my template "…"*.
14. **One undo**: the toast's **Undo** takes the new scene back (to History's deleted sketches, like Delete…) and reopens the scene you were on.
15. **Right-click a card**: ✦ Fill it in… · A new scene as it is (no form) · Rename… · ⇪ Share as a pack… · Show in folder · Delete… (to the Trash).
16. **"＋ Save this scene as a template…"** at the bottom of the picker. With no templates yet, the picker says what they are and offers the same button.

## Sharing and deleting
17. **⇪ Share as a pack…**: one `.hearthpack` (packs-core.js kind **template**) with the template's fields, its layers, picture and media. The save card says "A template with N fields to fill in".
18. **Opening such a pack** (dropped anywhere, Share › Open a pack…, Finder / Explorer) shows the usual card with **Add to my templates**. The template lands in My templates with its own copy of the media, and the unpacked copies go.
19. **Delete…** moves the template's folder (JSON, picture, media) to the system Trash. Scenes made from it stay.

## For the AI (no new tool, no prompt tokens)
20. `/my-template list` · `fields <name>` (each field: kind, range or options, default) · `use <name> {"Field": value}` or `field=value, …` (a new scene straight away; fields matched by label, slider key or plain words like *text*, *song*, *logo*, *colors*) · `save [name]` · `share <name>`. Typed by the owner, `use` without values opens the form and the bare command opens the picker.
21. A director reaches it through `three_do run` (one line in the app map's lab topic, read on demand). Deleting and renaming are the owner's to do.
22. ⌘/Ctrl+K: "Lab: New from my template", "Lab: Save this scene as my template".

**22 upgrades.**

## How it's built
- `tools/three-templates-core.js` (`TemplateCore`, no DOM, Node-tested): `extract` (fields from a scene: `textLayer(P, {"text"})` words, references / song, palette, the named tweak() controls through `ThreeTweaks.scan`, live values), `make` (the portable template; no MIDI mapping / selection / precomp layers), `apply` (a scene from values: sliders through `ThreeTweaks.applyValues`, words, palette, references, song), `coerce`, `parseValues` (chat values), `tokenize` / `resolve` / `unresolve` (`tpl:files/<name>` ↔ this computer's folder, Mac or Windows separators), `check`, `search`, `describe`.
- `tools/three-templates.js` (`LabTemplates`, lazy group **labtemplates**, tier `use`) with `tools/three-templates.css`: storage (fs IPC: list / read / write / copy / trash), the save card, the picker, the form, the live preview (`ThreeBackstage.make` with its own scene data; its page laid over the preview box with one transform; references and palette sent with the stage's new `send`), create / undo, share / fromPack, `/my-template`, ⌘K actions.
- `tools/three-templates-hook.js` (in the **lab** group, small): the ✦ More / toolbar ⋯ / Sketch ▾ rows, the gallery row, the lazy loader.

## Edits outside the new files (small, additive)
- `tools/three.js`: `ThreeLab.scenes.remove(id)` (the toast's Undo: to History's deleted sketches, as Delete… does) and one Sketch ▾ row.
- `tools/three-backstage.js`: a stage exposes `host` and `send(msg)` (the form's live preview).
- `tools/three-easy.js`: the ✦ More submenu and the toolbar ⋯ row (guarded by `typeof LabTemplatesHook`).
- `tools/three-gallery.js`: the 📐 My templates row on top (only with no search, "All", and at least one template).
- `packs-core.js`: kind `template` (manifest `template: { fields, desc }`, checked; described as "A template with N fields to fill in"). `tools/three-packs.js`: `save` passes `template` through and is exported; a template pack's card says "Add to my templates" and its import goes to `LabTemplates.fromPack`.
- `lazy-data.js` (hook in the lab group, the new group, the regenerated manifest), `index.html` (`labtemplates` on the existing lazy-at.js tag), `mcp/hearth-map.js` (one lab-topic line + aliases), `dev/run-checks.js` (the check first in `lab:`, the unit test in UNIT).

## Tests
- `node dev/labtemplates-test.js` (unit group), **11 tests, all pass**: the fields read from a scene (words, references and song but not a 3D model, palette, named sliders with range / label / options / whole step, unsaved values, no fields for a precomp layer), a portable template, apply with no values (identical code except the live value) and with values (sliders in the code, other literals untouched, words with quotes, palette, a reference's new file, a new song, the template untouched), coerce, chat values (JSON and key=value, by label / key / plain words, unknown names listed), `tpl:` tokens on Mac and Windows folders and back, no `..` escape, names already in the folder kept, the file check, search / newest first / describe, and the **.hearthpack round trip** in plain Node (packsmain write → peek → unpack: kind template, fields kept, the reference and its field pointing at the same unpacked file; a "template" pack without fields refused).
- `dev/checks/labtemplates.js` (lab group, ~2 min), **16 steps, all pass**: not loaded before use; the ✦ More / toolbar / Sketch ▾ ways in; the save card (picture, groups, all ticked; one slider unticked); the files on disk (`tpl:files/logo.png`, thumb.jpg, files/logo.png); the picker (picture card, search); the form (fields in order, the stage centred over its box, 97 % red in the preview); typing a new color / size / words / picture → the preview turns green (85 %); Create → the new scene with every field applied, 97 % green, the source untouched, its time-machine entry; the toast's Undo; `/my-template fields` and `three_run "/my-template use … {values}"`; the AI refused on delete; Share as a pack → Open → Add to my templates (same fields, own copy of the picture, the unpacked copies gone); Delete → the Trash; the gallery's top row.
- Also run: `sh dev/run-checks.sh lazy unit:boot-test unit:director-mcp-test unit:packs-test packs labeasy`: all pass (manifest regenerated, 0 duplicate commands, the director's lean tool budget unchanged). `gallery` failed twice on one step unrelated to this change ("Chrome blob"'s picture not drawn within 10 s, load average 16 on 4 CPUs); the new gallery row only shows when a template exists, and that check has none.
- Screenshots looked at: the save card, the picker, the form with its live preview (green background, the blue picture, HELLO).

## Caveats
- The live preview has no music and no video playback (like the backstage), so a scene that only moves with the song looks still there. The new scene plays normally.
- Text fields are type layers' words (`textLayer(P, { "text": … })`). Words written straight in other code aren't found, and lyrics aren't a field.
- Media slots are the scene's references and its song. A file path typed in a layer's code isn't a slot.
- A template keeps copies of its media (up to 100 MB each), so a big video in many templates takes room and syncs.
- Tested on Linux under Xvfb with software WebGL; the Trash move used Electron's own trash there. On a real Mac / Windows the same `shell.trashItem` is used as everywhere else in Hearth.

## For the patch notes
- New in the Lab: **📐 My templates**. Turn any scene into your own starting point: right-click the preview › ✦ More › 📐 My templates › **Save as my template…** (also in the toolbar's ⋯ and Sketch ▾).
- Its words, colors, palette, pictures, video, song and sliders become a short form. You choose which ones; all of them by default.
- **New from my template…** shows your templates as pictures, newest first, with a search. Pick one, fill in the form (drop a new logo, type a new title, pick colors) and watch the live preview change. **Create** makes a new scene. No tokens.
- One Undo takes the new scene back, and the time machine remembers which template it came from.
- Templates are files in Hearth's data folder, so they sync to your other computer. **⇪ Share as a pack…** sends one as a single file, and opening that file adds it to My templates. Delete moves a template to the Trash.
- You can also just ask the director, e.g. "make a new scene from my Neon title template with the title SUMMER". It can list your templates and fill them in itself.
- Caveat: the preview in the form has no music, so scenes that only move with the song look still there.
