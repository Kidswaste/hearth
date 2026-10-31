# bundle98: a model made of several files travels whole; a failed import leaves nothing behind (round 98)

Round 97 (`labproj97.md`) made a project's Lab work travel in **Export project…**, **Import project…** and
**⧉ Duplicate project**, and left two things open: a glTF made of several files carried only its main file, and the
History files written for scenes that a failed import took back stayed on disk. This round fixes both and audits the
whole import's rollback by making it fail at every step.

## Which files a model is made of (the Lab's loaders)
The Lab reads models with three.js's `GLTFLoader` (.glb, .gltf), `FBXLoader`, `OBJLoader`, `STLLoader` and `PLYLoader`
(`tools/sandbox-lab3d.js`).
- **.gltf**: names its `.bin` buffers and its pictures by relative URI (`buffers/car.bin`, `textures/wood%20grain.png`,
  `../shared/rock.jpg`). Several files.
- **.obj**: names its `.mtl` (`mtllib`), and the `.mtl` names its pictures (`map_Kd`, `bump`, …, options first:
  `map_Kd -s 1 1 1 maps/seat.png`). Several files.
- **.glb**: one file as a rule. It can name outside files too, so it is looked inside the same way.
- **.stl, .ply**: one file.
- **.fbx**: its textures are almost always inside it. The outside paths it may hold are absolute paths of the computer
  that made it, so they are not followed.

## Before → after
| case | before | after |
|---|---|---|
| **Export** of a `.gltf` with `buffers/car.bin`, `textures/wood grain.png`, `textures/normals/car_n.png`, `../shared/rock.jpg` | only `car.gltf` packed | all 5 packed in their layout (`assets/0/car/car.gltf`, `assets/0/car/buffers/…`, `assets/0/shared/rock.jpg`); the `.gltf` byte for byte |
| …a buffer it names that isn't on the computer (`buffers/wheels.bin`) | dropped silently | named: "wheels.bin (used by car.gltf: not on this computer)" in the file's skipped list, the import card, and **What was skipped** |
| …the export card's size | the `.gltf` alone | the model and its files |
| …an `.obj` with its `.mtl` and textures (a project file) | the `.obj` alone | all of them; a missing texture named |
| …written on Windows: `Buffers\Truck.bin`, another case (`TEXTURES/Paint.PNG` for `textures/paint.png`), an absolute path, a dotfile, `con.png` | (only the main file) | packed under the URI's spelling, so they are found where case matters; only the URIs that can't travel as they are get rewritten (`\` → `/`, the others into `hearth-files/<n>-<name>`); nothing else in the JSON changes |
| **Import** of that file | the `.gltf` alone in Hearth's folder | the `.gltf` and every file next to it, same sizes |
| …an older project file holding the `.gltf` alone | nothing said | each missing file named ("…: it wasn't in the project file") |
| **Duplicate** of a scene with that model | the `.gltf` copied alone into `refs/` | the model's folder copied whole into `refs/<time>-car/`; a missing file named |
| …the model removed in the copy | its `.gltf` to the Trash, its files stayed | the copy's whole folder to the Trash (unless another reference lies in it); the original's files untouched |
| **A failed import / copy** (a thrown write, a full disk) at the second board, a scene, a sequence, a board's content, a chat, a giant chat, the worktable, the project's own save | boards, sequences, History files, the worktable's store and Duplicate's copied files **stayed**; a worktable write that failed was taken as done | every one of 11 steps × 2 kinds × import and Duplicate: nothing it made stays live; each thing is in its Trash (below) |
| …History files written for scenes taken back | stayed on disk | in the Trash |
| …the unpacked folder | removed for good | in the Trash |
| **A full disk while unpacking** | taken as a damaged file: the import **went on** without it | the import stops; its folder goes to the Trash; the card says "The disk is full: nothing was added (what it had unpacked is in the Trash)" |
| **Cancel** on the card | only while unpacking (removed for good) | while unpacking and while it adds its things; everything goes back, to the Trash |
| Chats of the import | listed and linked as they were saved | listed and linked once the project is in (nothing to take back there) |

On the base code (`dev/bundle98-test.js` run against round 97's `projbundle.js` and `labproj.js`, with the "went to its
Trash" checks turned off so only the live state was compared), 64 of the 69 window-side cases fail:
- The 5 that pass are the import with nothing failing and a failure at the first board, where nothing had been written
  yet.
- Duplicate with nothing failing also fails, because the missing buffer isn't named.

### Where each thing goes when an import or a copy is taken back
| it made | goes to |
|---|---|
| the project | Recently deleted (Projects ⋯) |
| chats | the chats' Trash (Recently deleted) |
| scenes | the Lab's deleted scenes (History › Deleted) |
| boards | out of the list, their stores (`kv/board-<id>.json` + `.prev`) to the Trash |
| sequences | removed from the Lab sequence's list (they were made by the import, so nothing earlier is lost) |
| pins, ⚡ bars, loops, sequence picks | set back as they were |
| History files (`kv/three-hv-<scene>.json`) | the Trash |
| the worktable's store (`kv/workbench-<project>.json`) | the Trash |
| Duplicate's copies (songs, references, a model's folder in `refs/`) | the Trash |
| the unpacked folder (`assets/projects/<name>/`) | the Trash |

A file that was there before the import is never touched. Each History file, board store and worktable store is
checked as missing before it is written, and the main side only takes names of those three kinds and copies named
`refs/<time>-…`. It refuses anything else (unit test).

## What changed
1. **`assetdeps-core.js`** (new, main side only, no DOM): `plan(model)` returns every file the model names, found on this
   computer, and where each goes:
   - Each file goes where its URI says. A URI that climbs a folder up puts the model in a folder named like its own.
   - A URI found by another case is packed under the URI's spelling.
   - A URI is rewritten only when it must be: an absolute path, a `\`, a name a project file may not hold, or two names
     that differ only by case. Those files go into `hearth-files/`.
   - A `.glb`'s JSON is never rewritten. A file it names that would need a rewrite is named as missing.
   - `data:` and `http(s):` URIs carry nothing.
2. **`projbundlemain.js`**: export packs the plan; the card's sizes count it; unpack names a model's missing files.
   A disk error while unpacking (`ENOSPC`, `EROFS`, `EACCES`, …) stops the import. Before, it was taken as a damaged
   entry. What an import wrote goes to the Trash through `fsapi.js` `trash`, which is now exported. Two new IPCs:
   - `projbundle:copyAsset`: Duplicate's copy of such a model, never over a file, a half-done copy to the Trash.
   - `projbundle:untake`: a failed import's own writes to the Trash, after the store's saves on their way.

   The plan runs on the bundle thread (`projbundle-work.js` `deps`).
3. **`projbundle.js`** `apply`: everything it writes is noted and taken back, newest first, on a failure or the card's
   **Cancel**. Cancel now stays on the card while it adds, and is checked between steps. The boards are made inside
   the guarded part (before, a failure at the second board left the first). The worktable's failed write throws.
   Chats are listed and linked once the project is in. `last.undone` / `last.left` tell checks what went back and
   what couldn't.
4. **`labproj.js`**: the songs a duplicate copies are noted (`ctx.copies`).
   **`board.js`**: `remove(id, { quiet })`.
   **`tools/three.js`** `trashRefFile` and **`scenesafe-core.js`** `refShared({ under })`: a model a duplicate copied
   whole goes as its folder.
5. Dev: `dev/bundle98-test.js` (UNIT, 86 cases, ≈ 3 s), `dev/checks/bundle98.js` (two app runs: `dev/bundle98-src.js`,
   `dev/bundle98-dst.js`, 14 steps), run-checks group `bundle98`.

## How it was measured
- **Node** (`dev/bundle98-test.js`):
  - fixtures in `os.tmpdir()/bd98-…`: a `.gltf` with a `.bin` in `buffers/`, textures in `textures/` and
    `textures/normals/`, one a folder up, a missing buffer, `data:` and `https:` URIs; a Windows-written `.gltf`; an
    `.obj` + `.mtl` with options; a `.glb` naming an outside file.
  - export → peek → unpack through the real `projbundlemain.js`.
  - failure injection on the main side: a full disk / `EACCES` / `EROFS` at the first, a middle and the last file, at
    the end, a cancel, a damaged file.
  - failure injection on the window side: the real `projbundle.js` + `labproj.js` in a `vm` sandbox with every store
    faked, a thrown write and a full disk at each of 11 steps plus Cancel at 10, for import and for Duplicate.
  - the Trash is a folder of the test's own, so "it went to the Trash" is checked.
- **In the app** (`dev/checks/bundle98.js`): a real export, duplicate, and import on a fresh profile; Duplicate failing
  at a board's save and at the project's own save; Import failing at a board's save; Import cancelled from the card
  while it adds. Each failure compares projects, scenes, boards, chats, Hearth's projects folder, refs and pins before
  and after, and checks that History and board stores are gone.

## Safety
- Deletes go to the Trash only (`shell.trashItem`, never a disk's root or the home folder). Node tools without a Trash
  remove instead. The giant chats' part files in the system's temp folder are still removed (they are not the owner's).
- A full disk leaves the unpacked folder in the Trash: the space comes back once the Trash is emptied (the card says
  where it went).
- Only files Hearth wrote for this import or copy are taken back. Nothing the owner had is touched; the model's own
  files are only read.
- Secrets never go in: a file a model names that looks like a key, a password or a sign-in (`projbundle-core.js`
  `secretFile`: `id_rsa`, `*-token*`, `credentials*`, `.ssh/`, …) is never packed or copied. It is named in **What was
  skipped** instead ("it looks like a key or a password file: never packed"; unit test).
- Nothing is uploaded. Nothing here runs on the window's thread: the plan is read on the bundle thread.
- First screen unchanged: 1686 / 1696 KB (`assetdeps-core.js` is main-side only).

## What's left
- **The Lab's own "add a reference" still copies one file** (`store.js` `importRef`, the syncrace98 stream's file).
  So a multi-file `.gltf` added that way already has no `.bin` next to its copy, and its export now says so. The
  preview also reads a reference as one file (a blob URL), so a `.gltf` reference doesn't show its textures in the Lab
  either way. A `.glb` (one file) is what the Lab loads well; its message says so. A project file (Files and captures)
  that is a `.gltf` travels whole and opens in other tools.
- A beat grid entry added for an imported song stays in the beat grid store under the trashed song's path: invisible,
  like the grid of any song whose file was deleted.
- The scenes an import takes back sit in the Lab's deleted list, restorable. Restoring one brings back a scene whose
  History file is in the Trash.
- Windows ↔ Mac with a real exporter: `docs/windows-test-plan.md` § 12.

## For Codex
No Codex-owned file was edited (`projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `quest-*`,
`workbench-*`, `creative-vst*`, `astra*`, `engine-watch` untouched). The import now calls `Projects.removeProject` on its
own project when it can't finish, and writes no `kv/workbench-<id>.json` it doesn't take back. Neither syncrace98's files
(`sync-engine.js`, `store.js`, the StoreAck paths) nor the creative-direction session's were touched.

## Tests run (final code)
See the commit message of the last commit of this round for the exact list and results.

## For the patch notes
- A 3D model made of several files (a `.gltf` with its `.bin` and texture pictures, or an `.obj` with its `.mtl`) now
  travels whole when you export, import or duplicate a project. Its files keep their folders, so the model still finds
  them. Before, only the main file came along.
- If one of those files is missing on your computer, **What was skipped** now says which one and which model uses it.
- If an import or a copy can't finish (a full disk, a write that fails, or you press **Cancel**), everything it had
  added goes away: the project, its scenes, chats, boards, sequences, pins and trigger bars, and its History. Files it
  had written go to the Trash. Before, some of it stayed behind.
- You can now press **Cancel** while an import is adding its scenes and chats, not just while it unpacks.
- A full disk during an import now stops it with a plain message. Before, the import went on and the file was listed
  as damaged.
