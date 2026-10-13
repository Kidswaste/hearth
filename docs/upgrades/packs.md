# packs (round 28): share a scene as one file

A Lab scene used to live only inside your Hearth: its layers in one store, its references in data/refs, its LUTs in
another store, the song wherever it was on your disk. Now **Save as a pack** puts the whole thing in one
`.hearthpack` file you can send to someone (or to your other computer), and opening one shows you what's in it
before anything is added.

Where: **Sketch ▾ › Share** in the Lab toolbar, the preview's right-click **✦ More › ⇪ Share**, the gallery's
right-click on any card, and dropping a `.hearthpack` anywhere on Hearth (or opening it from Finder / Explorer).

Files: `packs-core.js` (the format, the guard, the card's words; no DOM), `packsmain.js` (reads / writes the files,
loaded on first use through `lazyIpc`), `tools/three-packs.js` + `tools/three-packs.css` (the cards, saving, adding;
lazy group `packs`, tier "use"), `tools/three-packs-hook.js` (the ways in, loaded with the Lab), `dev/packs-test.js`
(unit), `dev/checks/packs.js` (smoke; `sh dev/run-checks.sh packs`).
Small hooks elsewhere: `main.js` (one `lazyIpc` line, `open-file` / second-launch → the card, `packs:pending`),
`preload.js` (`hub.packs`), `tools/three.js` (the Share row in Sketch ▾, `scenes.setExtras`), `tools/three-easy.js`
(the ✦ More row), `tools/three-gallery.js` (the right-click row), `lazy-data.js` (+ manifest), `index.html` (the
lazy-at tag), `dev/run-checks.js`, `mcp/hearth-map.js` (one line: the directors know it).

Light by design: nothing loads at startup; the Lab brings a 60-line hook; the rest loads the first time you save or
open a pack. No new dependency: the zip is written and read by `packs-core.js` with Node's own zlib.

## Saving
1. **Sketch ▾ › Share › ⇪ Save as a pack…**: the scene on screen and every file it uses, as one `.hearthpack`.
2. **✦ More › ⇪ Share** on the preview's right-click: the same rows, where the other Lab extras live.
3. **The gallery's right-click › ⇪ Save as a pack…** on any card: your own scenes as they are; a starting point, a library item or a scene from history as a scene of its layers.
4. **⇪ Save its sequence as a pack…** (shown when the scene has a sequence): the sequence, every scene in it and its footage.
5. The whole scene comes along: every layer with its blend, opacity, timing and fades, the **sliders, saved looks, keyframes, palette, frame size and timeline**.
6. What you see is what's packed: code typed in the editor and not saved yet is in it too.
7. **Its references** (textures, HDRIs, 3D models, fonts, data files) come along under the same names, so the code works unchanged on the other side.
8. **The LUTs its grade uses** come along as real `.cube` files.
9. **The song**, if you want it: one tick on the card ("Include the song (4.2 MB)"), on by default under 200 MB.
10. **A save card first**: its picture, what's inside in plain words (layers, sliders, looks, keyframes, textures, LUTs, the song), about how big the file will be; Save… asks where (Downloads by default).
11. **Its picture**: the scene's still, or a live picture of the preview when it has none yet.
12. A file the scene points at that sits on your other computer is found through sync's path mapping (the same as opening a chat's file) and packed.
13. A file that isn't anywhere is listed on the card and in the pack ("1 file it used wasn't packed: …"), never silently lost; your own folder layout never ends up in the pack.
14. **Saved** toast with the size and **Show in folder**.
15. The file is a **plain zip**: anything that opens zips can look inside (hearthpack.json, thumb.jpg, files/).

## Opening
16. **Drop a `.hearthpack` anywhere on Hearth**: the chat, the Lab, the rail; it's always taken by packs, never attached to a chat by mistake.
17. **Sketch ▾ › Share › Open a pack…** (or ✦ More › ⇪ Share › Open a pack…): a file picker for `.hearthpack` files.
18. **Open it with Hearth from Finder / Explorer** ("Open with…", or a second launch with the file while Hearth runs): Hearth comes forward with the card.
19. **A preview card before anything is added**: its picture, name, what kind it is (scene, sequence, gallery starting point) and its description.
20. **What's inside**, in plain words: scenes and layers, sliders, saved looks, keyframes, textures, HDRIs, models, fonts, LUTs, videos, the song; files that weren't packed.
21. **Its size** (and how big it is unpacked when that's much more).
22. **Where it came from**: made with which Hearth, on a Mac / Windows / Linux, on what day, and the file's own place on your disk.
23. **The safety note**: its layers are code, the same kind as any Lab scene; they run only in the Lab's sandboxed preview, with no way into your files or the rest of Hearth.
24. **Nothing is added until "Add as a new scene"** (Cancel, Esc or a click outside leaves Hearth as it was).
25. It lands as **a new scene** (a new name if you already have one called that), opened right away.
26. Its files go into **Hearth's own folder**, one folder per pack (`data/assets/packs/<name>/`), never next to anything else.
27. They're in your **asset library** (Imported, tagged "pack" and with the pack's name).
28. Every path in it (the song, footage, references) is **rewritten** to where its files landed on this computer.
29. Its references are re-attached to the new scene with the same keys (copied like any reference).
30. Its LUTs go into the ◐ Grade; a name you already use gets a new one (yours stays as it was) and the scene follows it.
31. A sequence pack: its sequence is back too, owned by the new scene, its clips pointing at the new scenes, under its own name.
32. A pack with several scenes says so: **"Add as 2 new scenes"**.

## Safety
33. **No zip-slip**: a pack may only hold `hearthpack.json`, `thumb.jpg` and `files/<one plain name>`; "..", absolute or drive paths, backslashes, hidden files, Windows device names and control characters are refused before anything is read.
34. Every file's target is checked to sit **inside the pack's own folder** in Hearth's data folder before it's written.
35. **Size caps**: 1.5 GB for a pack, 600 MB for one file inside, 2 GB unpacked in all, 400 files, 8 MB for the description, 2 MB for the picture.
36. **No zip bombs**: a file that unpacks to far more than it weighs is refused, and unpacking stops at each file's stated size.
37. **Damaged files** (their check doesn't match) are refused, and what was already written for that pack is removed.
38. Unpacking **never writes over a file** that's there.
39. The description is checked too: a pack made by a newer Hearth says "update Hearth"; too many scenes or layers, or code that's too big, is refused.
40. A pack that can't be opened gets its own card with the reasons in plain words, a Close button, and "Nothing was added to Hearth."
41. A pack that points at a file it doesn't hold gets nothing there (listed as not packed), never a path of its choosing.

## Chat
42. `/pack` (save [scene] · sequence · open <file>): the same, for the directors and power users; opening still shows the card.

Tests: `node dev/packs-test.js` (12 tests: crc, the zip read back by the system's unzip, entry names, inside() on
POSIX and Windows paths, paths in the JSON, write → peek → unpack byte for byte, crafted zip-slip / bomb / too many /
damaged / no manifest / newer version / not a zip, dangling tokens, safe names) and `dev/checks/packs.js` (24 steps:
a scene with a texture, the song, a LUT, keyframes, a look and a palette saved from Sketch ▾ › Share and opened again
from Share › Open a pack…, landing as a new scene with no errors; a two-scene sequence round trip; a gallery starting
point; a crafted zip-slip pack refused on its card with nothing written; a drop caught).
