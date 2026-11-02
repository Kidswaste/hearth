# projaudit108: every project flow again, by clicks, after 17 rounds of change (round 108)

Round 91 (`projaudit91.md`) walked every project flow by clicks, on one computer and on two, and fixed eight problems.
Since then a lot has touched projects: Lab work in bundles (labproj97, bundle98, labmodels99, modeltex100), the sync
engine (aside95, syncsweep97, syncrace98, kvrename99, syncstall103, emptyread104, merge105), the Desk's paint (desk89),
lazy loading (labload94, firstscreen96) and startup order (startup107). This round re-walks round 91's flows and the
new ones, and fixes what broke.

Everything ran in throwaway data:
- the app checks ran in smoke.js's temp profiles, each check in its own temp root;
- the two-computer runs used the sync simulator or a temp folder as the cloud;
- the giant chat was bigchat84's made-up fixture, copied into the check's temp folder.

No real data was touched.

## How it was walked

- **Round 91's checks, run again unchanged:**
  - `dev/checks/projaudit91.js` (one computer, by clicks);
  - `dev/checks/projaudit91-sync.js` (two computers in the app);
  - `dev/projaudit91-test.js` (the simulator).
- **`dev/checks/projaudit108.js`** (new; a node driver, like bundle98). It runs four app runs, each on its own fresh
  profile:
  - `pc` (`dev/projaudit108-src.js`): a project whose scene gets a model made of several files through the Lab's own
    add. The project is exported from the Desk's ⋯, then duplicated. The copy's scene is edited (two runs, so its
    History grows) and an earlier version is restored through Earlier versions…. Then the copy is deleted from its
    own ⋯.
  - `fresh` (`dev/projaudit108-dst.js`): "the other computer", on an empty profile. Projects › ⋯ › Import project…,
    with the file picked by the open dialog. The project opens, then its scene is opened from the Desk. The model's
    pictures are read back from the graphics card.
  - `start` (`dev/projaudit108-start.js`): two projects, and the session ends in one project's Scene. Then two
    restarts. Each time, while the Lab group is not loaded yet, Ctrl/⌘+K › the other project › Enter.
  - `giant` (`dev/projaudit108-big.js`, on bigchat84's fixture with a 6,000-message chat in "Clink"):
    - switch to Clink with the name ▾;
    - Find in this project: a word in message #30, and its row opens the chat on that message;
    - ⇪ Export project….
- **`dev/checks/projaudit108-sync.js`** (new): a project changed on both computers with settling on. This PC renames
  it and puts a chat in; the Mac renames it and writes notes. Then Compare…, Keep this one on the kept-aside side, and
  Undo, all by clicks. The Desk and the name ▾ are checked after each click.
- **`dev/projaudit108-test.js`** (new; unit, simulator). A rename on both computers while the PC's sync records are
  held (its `data/sync` state and bases, and its journal in the cloud, failing with EBUSY or EPERM):
  - `records`: both rename, the PC also puts a chat in and the Mac recolours, while the records are held;
  - `guard`: the window saves over the Mac's version while the file is held (EHELD);
  - `both`: the Mac's rename arrives while the records are held, then Keep both.

  It also has the unit tests for this round's fix (`imported-model`).

## Flows: before → after

Timings are headless on a shared 4-CPU box.

| Flow | Before (this round's base) | After |
|---|---|---|
| Round 91's 26 flows (create from the switcher, a chat or a Lab scene; rename, colour, mark, cover; things in and out; drops on the Desk; switching by the name ▾, the keyboard and Ctrl/⌘+K; archive; delete → Undo; Deleted things › Restore; the Lab's scenes in the project; two computers: arrive, archive, rename both, "told", deleted while open) | **works**: `projaudit91` and `projaudit91-sync` pass. Wizard ≈ 7.5 s, switch ≈ 3.7 s | works |
| A multi-file model added to a project's scene in the Lab (Lab's own add) | works: copied whole into `refs/`; the colour picture and the one a folder up show | works |
| Export that project (Desk ⋯ › ⇪ Export project… › Export…) | works (≈ 0.4 s) | works |
| Import it on the other computer (Projects ⋯ › ⇩ Import project…) | works: every file arrives in its layout. The project opens by itself in **7.6–15 s (slow)**, mostly the Lab's first start on a fresh profile | works (slow, noted) |
| …open its scene: **the textures show** | **broken**. Steps: import the file, open the project, open its scene. The model stays blank and the layer says "this .gltf points to .bin / texture files next to it: export as one .glb, or add those files too"; the console shows `GLTFLoader: Couldn't load texture`. Cause: the Lab only looked for a model's other files when the model was in `data/refs/<time>-<name>/`. An import unpacks it in `data/assets/projects/<project>/assets/<n>/`, so the Lab sent the .gltf alone | **works**: the colour picture and the one a folder up show (texels read back) |
| Duplicate (Desk ⋯ › ⧉ Duplicate project) | works: the copy's model gets its own folder | works |
| …edit the copy's scene (two runs) and its History (Earlier versions… › Preview › Restore this version) | works | works |
| …delete the copy (its ⋯ › Delete the project…) | works: it goes to Recently deleted. The original's code, layers, History, time machine and model files are unchanged, and its scene still shows the model's pictures | works |
| Rename on both computers while one computer's sync records are held (EHELD path) | **works**: nothing is merged halfway while held, and nothing goes up over the Mac's version. Once the records read, there is one name on both and the other is kept aside (the panel's note). The chat put in and the new colour are both kept. The window's save over the Mac's version waits (EHELD), then merges, so the rename made there survives and so do the Mac's notes. Keep both gives one project with both names | works |
| Switch right after a start, before the Lab group loaded (Ctrl/⌘+K › name › Enter) | **works**: the Lab ends on that project's scene and stays there (not the scene the Lab had last). **5–8.8 s (slow-ish)** to ready, which includes loading the Lab's code (about 3.4 MB). Tested both with the Lab's code held back and with it loading by itself during the switch | works |
| Giant chat: switch to its project with the name ▾ | works (≈ 4.8 s to ready) | works |
| …Find in this project | works: index ≈ 3 s in the background, a query 65 ms, its row opens the 6,000-message chat on the message in 1.5 s | works |
| …⇪ Export project… | works: the card in 0.7–2.3 s ("6 chats · 71.7 MB"), the file written in ≈ 6 s. Once in four runs, the ⋯ row's click did nothing (see below) | works; flaky menu click noted |
| Kept-aside compare, the project changed on both sides: Compare… | works: "In use now" / "Kept aside", both names in words, no paths or ids. What doesn't clash is kept from both (the chat put in here, the Mac's notes) | works |
| …Keep this one (the kept-aside side) | works: that name shows on the Desk and in the name ▾ at once (≈ 0.6 s). The replaced version goes to Deleted files and the choice reaches the cloud copy | works |
| …Undo | works: the earlier version is back with its things, on the Desk and in the name ▾ and in the cloud copy. One project, never two | works |

Found but not fixed, because it can't be reached by clicks: `ProjectWorkspace.go('overview')` called while an
open is still in "Building your scene…" leaves that open stuck at "Warming shaders". It ends 90 s later with "The scene
is taking too long to prepare". While a project opens, its card is modal, so the owner can't get to the Desk's tabs.
The scene preparation lives in `tools/three-sandbox.html` (the beat108 stream's file), so this round doesn't touch it.

## What changed

- **A model an imported project brought shows its pictures and its .bin in the Lab.** `labmodels-core.js`
  `folderOf()` now also recognises a model unpacked from a .hearthproject:
  `…/assets/projects/<project>/(assets|files)/<n>/<its layout>`. The Lab then sends its other files to the preview
  with it (`tools/three.js` listRefFiles, unchanged), and a published page or ▶ Play's folder copies them too
  (`deploymain.js` modelFiles, unchanged).
  - This also fixes projects imported before this round.
  - The Lab's own copies in `refs/` work as before.
  - A single file elsewhere is still one file.
  - The Trash rule for removing a reference (`tools/three.js` trashRefFile) is unchanged: removing an imported model
    sends its main file to the Trash, as before.

## Safety

- **A store read failure is never "empty":** nothing here reads a store. The EHELD paths are tested: held records hold
  the pass, and a held file holds the save (round 104's code, now checked against the projects store and a rename on
  both computers).
- **Deletes go to the Trash:** nothing new deletes anything. The duplicate's delete goes to Recently deleted.
- **Nothing is uploaded:** only temp folders serve as the cloud.
- **No real data:** every run uses a temp profile or a temp copy of a made-up fixture.

## Tested

- `node dev/projaudit108-test.js`: 31 passed.
- `node dev/labmodels99-test.js`: 80 passed. `node dev/bundle98-test.js`: 86 passed.
- `node dev/boot-test.js`: 3110 checks passed. `dev/lazy-manifest.js --check`: up to date.
- Under the lock:
  - `projaudit108` (pc, fresh, start, giant): passes (262 s);
  - `projaudit108-sync`, `unit:projaudit108-test`: pass.
- Under the lock, `projaudit91 projaudit91-sync projects desk89 projopen86 labproj97 bundle98 labmodels99 keptaside94
  lazy unit:boot-test unit:labmodels99-test unit:lazymanifest-test`: all pass except `projopen86`.
  - `projopen86` failed on its timing budgets: "export_card held the main process 60–73 ms", or "import: the window
    held 70–78 ms in one task (budget 60)".
  - It fails the same way on this round's base (`c4d7631`, run from a clean copy): "import: the window held 70 ms in
    one task". So this is the box under load, not this round. This round's only app change, `folderOf`, isn't on
    that path.
- `node dev/run-checks.js release`: 305/308 passed. The 3 failures are the known ones (`KNOWN_FAIL`, Codex's); 1 was
  skipped as opt-in.

### What the checks saw along the way (not fixed)

- **A Desk ⋯ menu row that didn't respond: 3 times in about 10 runs.** The row was under the pointer and clicked, the
  menu stayed open (or closed), and nothing happened: no card, no toast. Once on the giant chat's ⇪ Export project…,
  the ⋯ wouldn't even open on the next tries. It didn't happen in a probe made for it (Clink's Desk: its ⋯ never
  redrawn over 6 s, 4 of 4 clicks opened the menu).
  - `projaudit108`'s Desk actions now try a row once more when it does nothing, and record each miss with what was on
    screen in "slow steps" (`menuMissed`).
  - Worth a look if the owner ever reports a menu click that "did nothing".
- **Opening an imported project's scene:** 7.6–15 s on a fresh profile (the Lab's first start, the model's pictures
  decoded). Opening the same scene again takes about 0.5 s.
- **A switch right after a start:** 5–8.8 s to ready, including loading the Lab's code.

## Files

- New:
  - `dev/checks/projaudit108.js` (the driver);
  - `dev/projaudit108-lib.js`, `-src.js`, `-dst.js`, `-start.js`, `-big.js` (its app runs);
  - `dev/checks/projaudit108-sync.js`;
  - `dev/projaudit108-test.js`.
- Changed:
  - `labmodels-core.js` (`folderOf`);
  - `dev/run-checks.js` (`unit:projaudit108-test`, the `projaudit108` group).

## For Codex

No edits in `projects*.js` or `project-workspace*.js` this round.

## For the patch notes

- A 3D model made of several files (a .gltf with its .bin and pictures) in a project you import now shows with its
  pictures in the Lab. Before, it stayed blank on the computer that imported it. Projects you already imported are
  fixed too.
- Checked again from start to finish: creating, renaming, moving things in and out, switching, archiving, deleting and
  restoring projects, on one computer and between two. Also checked:
  - export and import with Lab models;
  - duplicating, then deleting the copy;
  - switching right after Hearth starts;
  - a project with a very long chat;
  - choosing between two versions kept by sync.
