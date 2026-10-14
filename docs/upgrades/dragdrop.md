# Drag and drop (round 38, dragdrop): files flow between Finder / Explorer and Hearth

Files now move the way they do between any two Mac or Windows apps: drag them from Finder / Explorer onto the spot
they're for, paste them, and drag Hearth's own things out as real files. No new buttons: one overlay appears only
while something is dragged over a spot and says what will happen there. Nothing is uploaded anywhere, nothing is added
to any message the AI didn't already get (0 extra tokens).

New files: `dragdrop-core.js` (the rules: what each dropped thing becomes on each spot, paths, iCloud placeholders, the
clipboard's copied files, names of dragged-out files; Node-tested), `dragdrop.js` + `dragdrop.css` (the window: overlay,
drops, pastes, drags out, `/drop`, `/paste-files`; lazy group "dragdrop", loaded right after the first screen),
`dragdropmain.js` (main, loaded on first use through `lazyIpc`: native drags with `webContents.startDrag`, the drop check,
files copied in Finder / Explorer), `dev/dragdrop-test.js` (UNIT, Mac + Windows paths), `dev/checks/dragdrop.js`.
`sh dev/run-checks.sh dragdrop`.

## What shipped

### Into a chat
1. **Drop files on a chat** (anywhere on it, not only the box): they're attached; the overlay says "Drop to attach this picture" / "… 3 pictures" / "… 3 files" while you drag.
2. **Pictures are previewed** in the chat box; a picture from Finder is attached **where it is** (not copied), big ones too.
3. **Big files are referenced by their place, never copied**: with file access on, a big log / PDF / zip is attached by its path for the AI to open; without it, one line says how to allow it (⋯ AI setup › Files on this computer).
4. **A dropped folder asks first**: "Let Claude use this folder?" (Let it use this folder · Cancel). Yes adds it to this chat's folders through the existing Files access (read-only to start, "Allow edits" after); Cancel grants nothing. It used to be granted silently.
5. **Videos** attach as their frames (contact sheet), as before, now also from Finder drops.
6. **Many files at once**: the first 20 are attached, the rest counted in one calm line ("5 more files not added, 20 at a time: drop the rest next"); at most 3 folders asked in one go.
7. **Files still in iCloud** (not downloaded: `.Name.icloud` or a "dataless" file) are not read; one line: "…is still in iCloud: download it first (Finder: right-click › Download Now), then drop it again".
8. **Missing / moved files**, **HEIC photos** (export as JPEG), **files with no place on the computer** each get one plain line.
9. **Unsupported types explained in one line**: "brief.pdf: PDFs need this AI to read files (⋯ AI setup › Files on this computer)".
10. **Paste a screenshot** (⌘⇧⌃4 / Win+Shift+S, then ⌘V / Ctrl+V) or a copied picture into the chat box: attached and previewed.
11. **Paste files copied in Finder / Explorer** (⌘C / Ctrl+C on a file, then ⌘V / Ctrl+V in the chat box): the files are attached (their name alone used to be pasted as text). Several at once work on the Mac.
12. **Paste a file: URL** (from a terminal, a link) into the chat box: the file is attached.
13. Paths with **spaces, accents (é, Mac's decomposed accents), #, %, quotes from Explorer's "Copy as path", `\\?\` long names, network shares** all resolve.
14. `/drop <path…>` — "as if you dropped them here" from a chat (paths with spaces in quotes, file: URLs, `~/`); `/drop lab <path…>` puts them on the Lab preview.
15. `/paste-files` (and `/paste-files lab`) — the files you copied in Finder / Explorer, without the keyboard.

### Onto the Lab preview
16. **Drop a song** → it's the song (overlay: "Drop to use as the song").
17. **Drop a video** → the footage (frame-exact on the timeline) **plus a Footage layer** when the scene has no song; when a song plays, a **looping video layer** instead, and the song stays ("Drop to add a video layer").
18. **Drop a picture** → a **picture layer** (a reference + a layer that fits it to the frame with Fit / Zoom / Slow drift sliders) ("Drop to add a picture layer"); several pictures → several layers (12 at a time).
19. The note after a picture drop offers **🎨 Match its look**; **Alt+drop** a picture goes straight to the old "Match this look" menu.
20. **3D models and sky lights** (.glb, .fbx, .obj, .hdr…) go to 🧊 as before, from the same drop; **fonts and data files** become references (refs.name).
21. **.hearthpack** dropped anywhere opens its preview card (as before; the overlay says so on the Lab).
22. A pasted **screenshot / copied picture / copied file** goes into the scene when the Lab is in front and you're not typing (Ctrl/⌘+V).
23. Folders, PDFs, iCloud placeholders, huge files (over 2 GB) are explained in one line; nothing half-added.

### Other spots
24. A **template's media slot** (📐 New from my template) shows "Drop to use as Logo" (its own name) while you drag.
25. The **mood board** shows its own "Drop to add to …" in the same overlay.

### Out of Hearth (real files, with an icon: the picture itself, or the system's icon for that kind of file)
26. **A reply's pictures** (and the big pictures / videos a reply made: drag the name under a video) → Finder, Explorer, Photoshop, Slack…
27. **A reply's code block**: drag its label ("js · 12 lines") out → a file named `snippet.js` (or the name in its first line, e.g. `// file: scene.js`); the label's tooltip says so.
28. **The chat box's attachments**: drag a chip out → the file (a pasted text becomes a .txt).
29. **Finished renders and exports** (⇪ panel rows) → the video file.
30. **📐 Templates** (cards in My templates) → the template's folder.
31. **A Lab still**: drag the preview's 📷 out → a PNG of the frame on screen. The time machine's snapshots drag out too.
32. Made-up files (code, stills, snapshots) are written to a small temp folder ("Hearth drag"), cleaned after a day.

### Keys sheet
33. Six lines in the keys sheet (Chat / Lab): dropping, Ctrl+V of copied files, dragging a code block out, Alt+drop for the look match, Ctrl+V in the Lab.

## How it works
- One window-level handler (capture phase) finds the spot under the pointer (a chat's view, `.three-preview`, a
  template's `.lt-media`, the board), shows the overlay (placed once per spot, opacity only, hidden 450 ms after the last
  dragover so a drag that leaves the window never leaves it up) and, for chats and the Lab, takes the drop. Drags that
  carry Hearth's own types (`application/x-hearth-*`, board / asset / scene tiles) are left to their handlers.
- Names aren't known while dragging (browsers only show types), so the overlay reads the types; the drop reads the
  names, asks main (`dragdrop:check`) what each path is (folder, missing, iCloud placeholder, size) and plans it with
  `DragDropCore.planChat` / `planLab`.
- Drags out: sources become draggable when the pointer reaches them (`pointerover`), `dragstart` sends `dragdrop:out`
  and main calls `webContents.startDrag` (one file or several). The icon: a picture's own thumbnail, else the system's
  icon for the extension (`app.getFileIcon`, cached after the first drag of that kind), else Hearth's flame.
- Clipboard files: Mac `public.file-url` + `NSFilenamesPboardType` (several), Windows `FileNameW`, Linux `text/uri-list`.

## Edits outside the lane (small, additive)
- `access.js` `maybeFolder`: asks before adding a dropped / pasted folder (Modal confirm). `dev/checks/access-chat.js`
  answers that question.
- `main.js` one `lazyIpc('dragdropmain.js', …)` line; `preload.js` `hub.dragdrop { out, check, clipboard }`.
- `index.html`: `dragdrop` added to the existing `lazy-at.js#…` tag; `lazy-data.js` one group (+ the regenerated manifest).
- `dev/run-checks.js`: `dragdrop-test` in UNIT, a `dragdrop` group. `dev/checks/lookmatch.js`: a dropped picture's note
  leads to the look-match menu.

## Tested
- `node dev/dragdrop-test.js`: 115 checks (Mac and Windows paths, file: URLs, # / accents / spaces, long names, UNC,
  iCloud placeholders on a real temp folder, every plan, the clipboard formats, safe names, temp files).
- `dev/checks/dragdrop.js` (smoke): synthetic drops on the chat and the Lab preview, overlay words per spot, pasted
  screenshot in the chat and the Lab, folder asked (Cancel / Let it), 25 files, iCloud / big text / PDF, song / footage /
  video layer / picture layer, `/drop`, drag-out of an attachment, a code block and the Lab still (IPC stubbed).
- `access-chat`, `lookmatch` (a real CDP file drag on the preview), `lazy`, `node dev/boot-test.js`.
- Not exercised for real: a held-mouse `startDrag` into Finder / Explorer (headless Linux), real iCloud / OneDrive
  placeholders, the Mac / Windows clipboard formats (parsed from their documented shapes).

## For the patch notes
- **Drag files from Finder / Explorer onto a chat**: they're attached, pictures previewed. A box over the chat says what will happen before you let go.
- **Drop a folder on a chat** and Hearth asks "Let this AI use this folder?" — it's never shared silently.
- **Drop on the Lab preview**: a song becomes the song, a video a video layer, a picture a picture layer (Alt+drop a picture to match its look instead). Packs and 3D models still work.
- **⌘V / Ctrl+V** pastes screenshots and files you copied in Finder / Explorer into a chat — or into the Lab when it's in front.
- **Drag things out of Hearth** into Finder, Explorer or any app: a reply's pictures, a code block (drag its little "js · 12 lines" label), attachments, finished renders, templates, and a Lab still (drag the preview's 📷).
- Big files are attached where they are, never copied; nothing is uploaded anywhere.
- Files still in iCloud, missing files, HEIC photos and types an AI can't open get one plain line saying what to do.
- Dropping 50 files at once is calm: the first 20 go in, the line says how many are left.
- From a chat: `/drop <path>` and `/paste-files`.
