# Files changed outside Hearth (round 42, filewatch)

You edit files outside Hearth too: in Finder or Explorer, VS Code, Photoshop, on the Mac and on the PC. You do it inside
the folders your AIs use and in the Lab's media. Before this round, Hearth mostly didn't notice:
- a picture a Lab scene used, saved again in Photoshop, kept its old look until the scene was opened again;
- a song saved again kept playing the old file;
- a file an AI had changed, then changed by you, still offered a plain ↶ Undo;
- a file waiting in the chat box was sent as it was when you attached it.

Now one watcher service in the main process follows the files Hearth uses. It absorbs each change quietly. Nothing
new shows on screen, apart from one small line in the Lab when a file there updates. Nothing is added to any prompt
(0 tokens).

New files:
- `filewatch-core.js`: the rules, pure (UMD). Ignored names, the plan per computer, coalescing, what a stat means,
  renames.
- `filewatchmain.js`: the service (main process, lazy IPC `fw:*`).
- `filewatch.js`: the window side, lazy group `filewatch`, loaded right after the first screen.
- `dev/filewatch-test.js` (UNIT) and `dev/checks/filewatch.js` (`sh dev/run-checks.sh filewatch`).

## How it works
- **Wants per topic.** The window sends what it follows: `lab`, `ai` and `attach:<agent>`. In the main process,
  `tree(dir, fn)` serves sync's data and cloud folders. One plan covers them all, so Hearth's data folder is watched
  once (sync and the Lab's references share that watch).
- **The fewest system watches.**
  - On the Mac (FSEvents) and Windows (ReadDirectoryChangesW): one recursive watch per folder.
  - Files are watched through their folder, never with a handle per file (kqueue would otherwise use one file
    descriptor per file on the Mac).
  - The home folder, a disk's root and /Users or C:\Users are never watched recursively.
  - On Linux, recursion is used only for small trees (300 folders or fewer). Sync's own folders stay recursive, as
    before.
  - An AI's folder is followed for presence only: whether it is there, renamed, or on a disk that was unplugged.
    Its whole tree isn't watched, so a dev server writing `node_modules` costs nothing.
- **Noise left out.** These are never treated as news:
  - system files: `.DS_Store`, `._x`, `Thumbs.db`, `desktop.ini`;
  - Office's `~$x.docx`, vim / emacs swap files, `4913`, JetBrains `___jb_tmp___`, LibreOffice locks, GNOME
    `.goutputstream`;
  - half downloads: `.crdownload`, `.part`, `.download`, `.tmp`;
  - Photoshop's temp files: `Photoshop Temp…`, `~PST….tmp`, `PSAutoRecover`;
  - the Mac's safe-save `.sb-xxxxxxxx-xxxxxx` files;
  - Google Drive / Dropbox temp files;
  - Hearth's own `.hubtmp` and `.hearth-part-`;
  - `.git`, `node_modules`, `.Trash` and `$RECYCLE.BIN`.

  An iCloud placeholder (`.x.icloud`) means "offloaded", not "deleted".
- **One batch per burst.** Raw events wait until things are quiet for 400 ms, and at most 3 s. Each path is then
  stat'ed once, and only a real size or modified-time change counts. A file still being written waits, up to a minute.
  A delete plus an add of the same size and time is a rename. Hearth's own writes (`fs:write`, `fs:copy`) are skipped.
- **Cheap when idle.** No timer runs and nothing is polled while nothing happens. A folder the system can't watch (a
  network drive, a full inotify table) gets the slow check on powerwise's schedule:
  - every 30 s;
  - half pace while Hearth is hidden or on battery;
  - none while the computer sleeps.

  The slow check stops once the watch works again.
- **Survives things going away.**
  - A watched folder renamed or deleted: its files are reported once, then it is checked slowly until it is back.
  - A disk unplugged: its files are "unavailable", not deleted.
  - A path that wasn't there when it was asked for (a file from the other computer): not polled; it is looked at again
    on the next plan and after a wake.
  - After a wake (once the 20 s settle is over): every watch is opened again and every wanted file is looked at once.

## Measured (`dev/checks/filewatch.js`, real app, a temp folder, "another app" writing through `fw:test`)

| | Result |
|---|---|
| A picture a scene uses, saved again | texture swapped in place (64 → 128 px), 0 preview reloads / re-runs, 1 update, 1 line "↻ logo.png updated from disk" |
| The song saved again (2 s → 3 s) | read again in place, same path, still playing, 1 update |
| 9 swap / temp / placeholder files written next to them | 0 batches |
| A safe save (temp file renamed over the picture) | 1 update |
| **200 writes in a burst** | **1 batch, 1 update** (the main process saw 4 raw events after the system's own coalescing) |
| The song deleted | "song.wav isn't on this computer. Find this file" (twocomputers), listed for 🩺 |
| Idle 12 s after all that | 0 timers of the service, no polling, 0 batches |
| Watches | 2 folders for 4 files (the temp folder, Hearth's refs folder) |

On real folders (`dev/filewatch-test.js`, Linux inotify):
- 200 writes to a song plus 200 new files in an AI folder: 1 batch, 1 change.
- A folder renamed away, then back: one delete, then "available", watched again, with the slow check on only meanwhile.
- A dropped watch: the slow check sees the change.
- A simulated wake: one batch with what changed while asleep.

## Upgrades
### The Lab follows your files
1. **A picture a scene uses, saved again** (Photoshop, Preview, replaced in Finder): the preview swaps that texture in
   place. No re-run, no reload; your sliders and the music don't move.
2. **The file you added a reference from is followed.** Saving the original updates Hearth's copy and the preview
   (references added from now on remember where they came from).
3. **A video reference saved again** is swapped in place and keeps its time and whether it was playing.
4. **A 3D model, sound or data reference saved again** runs the scene again in place (no reload).
5. **The scene's song or video saved again** (a new mix, a re-export) is read again in place: same time, still
   playing, beats and sections analysed again.
6. **A song renamed or moved in Finder / Explorer** is followed, along with its grid, markers, cues and every scene
   using it.
7. **A song deleted**: Hearth looks for it by its place and content (twocomputers). If it isn't found, the calm
   **Find this file** note shows, and 🩺 Fix my scene lists it too.
8. **Hearth's copy of a reference deleted** comes back from its original by itself; otherwise **Find this file**.
9. **An original deleted** changes nothing (Hearth's copy stays) and says nothing.
10. **My templates' folder changed** outside Hearth (a template copied in, or brought by sync): the picker shows it.
11. **One quiet line** in the Lab: "↻ logo.png updated from disk" (or "3 files updated from disk"). It comes through
    Hints: one at a time, never over your typing, and only when the Lab is on screen.
### What the AIs changed
12. **A file an AI changed, changed again by you outside Hearth.** Changes by AIs (◉ Activity) says "changed outside
    Hearth since: not safely undoable (it asks first)". Its undo then shows the warning before anything happens.
13. The same words in **Recent changes** (Ctrl/⌘+Z's list), `/ai-undo list` and `/undo-change list`.
14. **A file an AI created, deleted outside Hearth**: "can't be undone: it was deleted outside Hearth". No ↶ that
    would fail.
15. **Moved or renamed outside**: the entry says where it is now.
16. **A folder an AI uses renamed, deleted or on an unplugged disk** is noticed quietly. `/watching` lists it under
    "Not there now"; when it comes back, it is used again.
### The chat box
17. **A file waiting in the chat box, saved again before you send**, is read again. What goes is what's on disk now,
    and its cost is measured again. Sent before in this chat? attachlean's "same file again" then sends only the
    changed lines.
18. **A picture waiting in the chat box, saved again**: its preview and cost refresh.
### Calm and light
19. Editors' and apps' temp files never count: swap, lock, owner, half-download, Photoshop temp and safe-save files.
20. A safe save (a temp file renamed over the original) is one change, not three.
21. A burst (an export writing for minutes, 200 saves) becomes one update.
22. A file still being written (a long export, a big Photoshop save) waits until it's done.
23. Hearth's own writes never count as "changed outside".
24. A file iCloud offloaded ("Optimize Mac Storage") isn't treated as deleted.
25. **A disk unplugged**: its files are "unavailable", not deleted. Plugged back, changes made meanwhile are picked up.
26. **After sleep / wake**, every watch is opened again, and what changed while asleep arrives once (after the wake's
    settle, in line with powerwise).
27. **A folder the system can't watch** (a network drive, a full inotify table) gets a slow check about every 30 s.
    It is slower while hidden or on battery and doesn't run asleep. It stops as soon as the system can watch the
    folder again.
28. **Idle costs nothing**: no timer, no polling.
29. **Mac, Windows, Linux**:
    - one system watch per folder (FSEvents / ReadDirectoryChangesW);
    - files watched through their folder;
    - the home folder and disk roots never watched recursively;
    - Linux recursive only for small trees.
30. **Sync's data and cloud folders go through the same service.** Hearth's data folder is watched once, shared with
    the Lab's references and templates. A cloud folder that goes away and comes back is watched again by itself.
### Finding it
31. **`/watching`** (also `/file-watch`) says what Hearth follows, how, and what isn't there now.
32. Ctrl/⌘+K: **"Files Hearth follows (changed outside Hearth)"**.

32 upgrades.

## Tests
- `node dev/filewatch-test.js` (UNIT, 126 checks):
  - ignored and kept names (33 + 16);
  - the plan on a simulated Mac (`path.posix`, /Users/quent) and Windows PC (`path.win32`, C:\Users\quent, case),
    and Linux with small / big trees and sync's forced folders;
  - never-recursive folders and disks;
  - the coalescer on a fake clock: 200 events → 1 batch with ≤ 3 timers; a 10 s stream → a batch every 3 s;
  - classify, renames (same folder, moved, other size, Windows case), tags (presence-only, not deep), the words;
  - the real service on temp folders: change, swap files, safe save, a 200-write burst, own writes, a rename, a
    delete, sync's tree, a folder gone and back (slow check on, then off), a dropped watch (slow check), a wake,
    idle.
- `node dev/smoke.js --check-timeout 240000 --script dev/checks/filewatch.js` (24 steps, see above):
  `sh dev/run-checks.sh filewatch`.
- Also run: twocomputers, attachlean, labmemory, powerwise, unit:winpolish-test, unit:macpolish-test, lazy,
  unit:boot-test, unit:twocomputers-test, unit:sync-test, unit:aiundo-test, unit:undoall-test, unit:attachlean-test,
  unit:powerwise-test. Results are in the final report.
- `node --check` on every touched file; `node dev/lazy-manifest.js` regenerated (filewatch: 1 command, 1 action).

## Risks
- FSEvents on a real Mac and ReadDirectoryChangesW on a real PC weren't tried here: Linux inotify ran the real tests,
  and the Mac / Windows plans are unit-tested with their path rules. Node's recursive `fs.watch` is the system's own
  on both.
- Windows keeps a handle on a watched folder. libuv opens it with delete sharing, so renaming or deleting the folder
  in Explorer still works, but a USB stick may need "Eject" twice while Hearth watches a folder on it.
- A rename is recognised when the new name lands in the same folder or keeps its name (same size and modified time).
  A renamed parent folder isn't followed: the file reads as deleted, and twocomputers' content search or Find this
  file takes over.
- A picture swap re-decodes the new file (off the page's thread) and uploads it again. A huge PNG saved every second
  from Photoshop's "Generate" would re-upload each time (coalesced to at most once every few seconds).
- References added before this round have no `src`: their originals aren't followed, only Hearth's copy.

## Edits outside the lane (small, additive)
- `tools/three.js`: `reloadRef`, `refs.reload` / `refs.all`, `src` on new references, one event in `saveRefs`.
- `tools/three-media.js`: the player's `reload()` / `follow(to)`.
- `tools/three-sandbox.html`: textures remembered per reference, `ref-update` swap.
- `aiundo.js`: `outside()` and its words on rows / summary.
- `undoall.js`: the AI label and its repaint signature.
- `native.js`: `hooks.chips`.
- `fsapi.js`: own writes told to the service.
- `syncmain.js`: its two folders through `tree()` (the old `fs.watch` kept as the fallback).
- `main.js`: one `lazyIpc` line.
- `preload.js`: `hub.fw`.
- `lazy-data.js` (group + regenerated manifest), `index.html` (`filewatch` added to an existing lazy-at.js tag),
  `dev/run-checks.js` (UNIT + the `filewatch` group).

## For the patch notes
- Hearth now notices files you change in other apps (Finder / Explorer, VS Code, Photoshop) on the Mac and the PC.
- Lab: save a picture your scene uses again and the preview updates in place. No re-run, and your sliders and music
  don't move. A small "↻ logo.png updated from disk" line says so.
- Lab: a new mix of your song saved over the old one is picked up where you were, still playing. Rename or move it in
  Finder and the scene follows (grid, markers and cues too). Delete it and you get a calm "Find this file".
- If you edit a file an AI changed, Changes by AIs and Ctrl/⌘+Z's list say "changed outside Hearth since: not
  safely undoable". Undoing asks first instead of quietly overwriting your edit.
- A file waiting in the chat box that you save again before sending is read again, so the AI gets what's on disk now.
- Editors' temp files (.DS_Store, ~$ files, .swp, half downloads, Photoshop temp, iCloud placeholders) never count,
  and a burst of saves is one update.
- Light: nothing runs while nothing changes. A network drive gets a slow check only when the system can't watch it.
  Unplugging a disk or putting the laptop to sleep is handled calmly.
- `/watching` says what Hearth follows. Try it: open a Lab scene with a picture reference, then re-export that picture
  from Photoshop over the same file.
