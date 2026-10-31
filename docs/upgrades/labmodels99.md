# labmodels99: a model made of several files works in the Lab itself (round 99)

Round 98 (`bundle98.md`) made a model of several files travel whole in project files, and left two gaps in the Lab:
- its own **add a reference** copied the main file alone (`store.js` `importRef`);
- its preview read a reference as one file.

So a `.gltf` with its `.bin` and pictures, or an `.obj` with its `.mtl`, arrived broken in the Lab. This round closes
both gaps and makes drops of such a model work.

## Before → after
On the base code (round 98, `3e1b184`), the app check `dev/checks/labmodels99.js` fails 22 of its 33 steps. On this
round's code it passes all 33.

| case | before | after |
|---|---|---|
| **Add** a `.gltf` with `buffers/car.bin`, `textures/paint red.png` and `../shared/glow.png` (/model add, References, a drop) | only `car.gltf` copied into `refs/` | the 4 files copied into `refs/<time>-car/`, in their layout (`car/car.gltf`, `car/buffers/…`, `car/textures/…`, `shared/glow.png`); the `.gltf` byte for byte |
| …its preview (`lab3d.model`) | "this .gltf points to .bin / texture files next to it": nothing shows | it shows; both pictures on the graphics card (texels read back: 230,20,20 and 250,240,10); the middle of the frame is red |
| **Add** an `.obj` with its `.mtl` (`map_Kd -s 1 1 1 maps/seat.png`) | the `.obj` alone; a white model | the 3 files copied; the model shows its picture (texel 20,220,30; the middle of the frame green) |
| **Add** a `.glb` | one file in `refs/` | the same (a `.glb` naming outside files brings them, in a folder) |
| A scene's own `new GLTFLoader().load(refs.car)` | "Failed to load buffer buffers/car.bin" | loads, with its pictures |
| A scene's own `new OBJLoader().load(refs.chair)` | loads, no materials | loads with its `.mtl`'s materials and picture |
| A `.gltf` whose `wheels.bin` isn't there | added without a word; the layer says "this .gltf points to .bin / texture files…" | a note when it's added: "broken.gltf came without a file it uses: wheels.bin isn't next to broken.gltf…"; the layer says "wheels.bin isn't next to the model: put it there and add the model again"; References shows "⚠ 1 missing" |
| **Drop** a `.gltf` with its `.bin` and picture at once (onto the preview) | the model (broken), the picture as a picture layer, ".bin: The Lab can't use .bin files" | one model, whole: "drop.gltf: its 2 files came with it" |
| **Drop** a "glTF Separate" export folder | "Blender export is a folder: drop the files inside it" | its model added, whole |
| …in References (its drop and ＋ Add files…) | each file a reference of its own (the `.bin` as data) | the same grouping |
| **Remove** such a reference | its `.gltf` to the Trash | its whole folder to the Trash, unless another reference lies in it (round 97/98's rule) |
| A picture the model names in a folder sync never carries (`venv/tex.png`), a `.part` name, `id_rsa` | (only the main file was copied) | `venv/…` moved to `hearth-files/<n>-tex.png` (only that URI rewritten), the `.part` and the key never copied, both named |
| **Sync** of that folder to the other computer | — | every file comes down, nested folders included, also when the drive keeps them online-only (OneDrive on the PC, iCloud stubs and dataless files on the Mac) |

## What changed
1. **`labmodels-core.js`** (new; pure, no DOM, no IPC). It runs in the window (lazy group `lab`), in `store.js` and in
   the tests.
   - `folderOf`: a reference's folder in `refs/`.
   - `missingText`: the missing files in plain words.
   - `resolve` / `baseOf`: the preview's resolution of a model's files.
   - `groupDrop`: a drop or a pick grouped. A folder gives the models in it; a file one of the dropped models names
     comes with that model and isn't added on its own.
2. **`store.js` `importRef`**: a `.gltf` / `.glb` / `.obj` goes through `importRefWhole`.
   - It uses `projbundlemain.js` `copyAsset`, the same copy as ⧉ Duplicate. The plan runs on the project files' thread,
     a copy never lands over a file, and a half-done copy goes to the Trash.
   - It returns the model's path (a Promise) and `{ path, dir, files, missing, used }` through the new IPC
     `refs:importWhole`.
   - A model of one file is copied as before.
   - The edit is apart from round 98's `settle` and gates.
3. **`assetdeps-core.js` `plan`**: a `relOk` option. **`projbundle-work.js` `deps`**: `syncSafe`. **`projbundlemain.js`**:
   - `copyAsset` plans `syncSafe`. A name sync never carries (`sync-merge.js` `localOnly`: a `.tmp` / `.part`,
     `Thumbs.db`, a `venv/` folder…) is moved to `hearth-files/` or named.
   - `copyAsset` also returns `gone` (the raw missing list) and `used`.
   - `modelPlans` is exported, and the new IPC `refs:uses` (read only) uses it.
4. **`tools/three.js`**:
   - `addRef`: the whole copy, its missing files said and kept on the reference (`files`, `missing`).
   - `loadRefBytes`: a model's folder is listed (`hub.fs.list`). Its other files are read side by side, each with its
     own sig. The model's sig covers them all, so a changed picture parses it again.
   - `sendRefs`: each such model carries `main` and `files`, and the page's asset cache is honoured (`refs-held` /
     `refs-need`).
   - `addRefs`: References' pick and drop, grouped.
   - New: `ThreeLab.addReferences`, `ThreeLab.refAdded`.
5. **`tools/three-sandbox.html`**:
   - A model's files get `blob:` URLs, kept in the asset cache by their sig and pinned while the scene is open.
   - The model gets a resource path of its own, `hearth-ref://m<n>/<its folder>/`.
   - The loading managers resolve it. `THREE.DefaultLoadingManager` from the start, and a scene's own manager when its
     loader reads such a model. `refModelResolve` handles `..`, `%20`, a query, and another case written on Windows.
   - The import map's hook covers `OBJLoader` too. An `.obj` reference gets its `.mtl` (`MTLLoader`, its pictures found
     the same way).
   - Revoked URLs and old entries wait 5 s, so a model still loading finds its files.
6. **`tools/sandbox-lab3d.js`**:
   - `parse` uses that resource path, and an `.obj` gets its materials.
   - A missing buffer is named.
7. **`dragdrop.js` `toLab`**: the drop is grouped before `planLab`. It adds what came with a model to its line, and
   names a folder with no model.
8. `main.js` (the two IPCs), `preload.js`, `lazy-data.js` (the core in group `lab`).

Untouched: round 89–95's upload and compile work. `refTexture`'s pictures still decode in the `decOff` worker and go up
through the slice queue (the check asks `__labDecode` and `__labUploads`).

## How it was measured
- **`dev/labmodels99-test.js`** (UNIT, 80 cases, ≈ 6 s). It runs a copy of the app's own files in a temp folder, so
  real data is never touched:
  - the core;
  - `store.js` `importRef` / `importRefWhole` on fixtures: a `.gltf` with sub-folders and a folder up, a missing
    buffer, an `.obj` + `.mtl` with options, a `.glb`, a `.glb` naming a picture, names sync never carries, a key file,
    two copies at once, a model that isn't there;
  - every file of every copy checked against `sync-merge.js` `localOnly` and `sync-kinds.js` `needed`;
  - the two-computer simulator (`dev/sync72-test.js`): a 12 MB `.bin` and a 9 MB picture in nested folders, PC → Mac
    with iCloud stubs, PC → Mac with dataless files, Mac → PC with OneDrive online-only;
  - the Trash rule (`refShared`, and the Lab's folder rule = `folderOf`);
  - the page's own `refModelResolve`, taken from `three-sandbox.html`, run on the same cases as the core.
- **`dev/checks/labmodels99.js`** (app, ≈ 100 s): fixtures made in the check's temp folder. Each model added with
  `/model add`'s path, then:
  - its preview: the texel of each map read back from the graphics card, and the middle pixel of the drawn frame;
  - a scene's own `GLTFLoader` and `OBJLoader`;
  - the missing buffer;
  - `DragDrop.toLab` of three files and of a folder;
  - each reference removed (its folder gone);
  - the originals untouched.

## Safety
- Deletes go to the Trash: a removed model's folder (`fs:trash`), and a half-done copy (`copyAsset`).
- A model's own files are only read. Hearth writes only in `data/refs/<time>-<name>/`, a new folder each time, never
  over a file.
- A file that looks like a key or a password is never copied (`projbundle-core.js` `secretFile`); it is named instead.
- Nothing is uploaded: the copy is in the data folder, and only the owner's sync brings it to the other computer
  (`refs/` is always brought down, round 87).
- No store read was changed. A folder listing that fails keeps what the preview had.
- First screen unchanged: 1686 / 1696 KB. The core loads with the Lab.

## What's left
- A model's pictures load through three's own loaders: the GLTFLoader's `ImageBitmapLoader` (decoded by the browser
  off the page's thread) and the MTLLoader's `TextureLoader`. A 4K picture inside a model goes to the graphics card in
  one piece in its first frame, as a `.glb`'s pictures always did. Only `refTexture`'s pictures go in slices.
- A model's other files aren't watched while the scene is open: a picture saved again in Photoshop shows when the scene
  is opened again (its sig changes), not at once. The model's own file is watched as before.
- An `.obj` naming several `.mtl` files: their materials are merged, with pictures found from the first one's folder.
- A published page (Publish / deploy) and ▶ Play with such a model weren't looked at this round.
- The project file's Duplicate copies such a model whole but doesn't note `files` / `missing` on the reference;
  the preview finds its files either way (it lists the folder).

## For Codex
No Codex-owned file was edited: `quest-*`, `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`,
`workbench-*`, `creative-vst*`, `astra*` and `engine-watch` are untouched. Also untouched: kvrename99's files
(`sync-engine.js`, the sync panel), the creative-direction session's files, and syncrace98's `settle` / gates in
`store.js`. `sync-merge.js` is only read (`localOnly`, on the project files' thread).

## Tests run (final code)
- App checks under the run lock:
  - `labmodels99` (33/33);
  - `bundle98`, `labproj97`, `labsync88`, `labfps89`, `labcompile90`, `labboot`, `labload94`, `lazy`.
- Unit tests:
  - `unit:labmodels99-test` (80/80), `unit:bundle98-test`, `unit:labproj97-test`, `unit:labfps72-test`,
    `unit:labshadow91-test`, `unit:scenesafe-test`, `unit:syncrace98-test`, `unit:store-thread-test`;
  - `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`;
  - `unit:boot-test` (first screen 1686 / 1696 KB), `unit:lazymanifest-test`, `unit:dragdrop-test`.

## For the patch notes
- A 3D model made of several files now works in the Lab. This means a `.gltf` with its `.bin` and texture pictures (for
  example Blender's "glTF Separate" export), or an `.obj` with its `.mtl`. When you add one, every file it uses is copied
  with it, in the same folders, so it shows with its textures. Before, only the main file came along and the model
  showed grey or not at all.
- You can drop the whole export folder on the Lab, or the model and its files together: you get one model, with its
  textures.
- If a file the model needs isn't there, Hearth says which one, for example "wheels.bin isn't next to car.gltf".
- Removing such a model sends its whole folder to the Trash, unless another scene still uses it.
- With sync on, all of the model's files go to your other computer, including ones your cloud drive keeps online
  only.
