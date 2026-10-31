# labproj97: a project's Lab work travels whole (round 97)

Rounds 87–91 changed what the owner's Lab work is made of: History in one file per scene (`kv/three-hv-<scene>.json`),
references and songs copied into Hearth's folder (`refs/`), his ⚡ trigger bars, loops, pins and sequence picks synced
through `kv/lab-presets.json`, a song kept with its scene, pictures saved when they change, new scenes joining the open
project. Nobody had checked that **Export project… → Import project… on a fresh profile** and **⧉ Duplicate project**
still bring all of it along. This round measured both with fixtures in the app and fixed what was missing or unsafe.

## How it was measured
- **In the app** (`dev/checks/labproj97.js`, new, 33 steps, ≈ 2 min): two app runs, each on its own throwaway profile
  and empty data folder (dev/smoke.js), sharing only the folder the export is saved to.
  1. `dev/labproj97-src.js` builds "Labtrip": scene 1 with 4 layers, a texture and a glTF model as references, real runs
     (History), a song loaded and kept with the scene (a copy in `refs/`), its ⚡ trigger bars and a loop; scene 2 with
     2 layers, pinned; a picture per scene. It is exported, then duplicated (the copy is checked, edited, run, given its
     own bars, a reference removed), then the copy is deleted.
  2. `dev/labproj97-dst.js` starts on a **fresh profile**, imports the file through its card, and checks and opens each
     scene (its code throws if a reference is missing, so "it runs" means its files arrived).
- **Rules** (`dev/labproj97-test.js`, new, UNIT, < 1 s): the model, the reference guard, and a real export → peek →
  unpack through `projbundlemain.js` on temp folders.
- The base code ran the same check first (the "before" column). Everything ran on fixtures in temp folders (`/tmp/lp97…`,
  removed afterwards); no real data, scene or game file was touched.

## Before → after
| case | before | after |
|---|---|---|
| **Import on a fresh profile**: scenes, layers, code | there | same |
| …texture and model (references) | there, same bytes, in Hearth's folder; the scene runs | same |
| …the song kept with the scene | there; plays on the timeline | same |
| …its ⚡ trigger bars and loop | **lost** (kept in the window's storage, keyed by the song's path: never packed) | there, under the imported song's own path |
| …History (4 versions in the fixture) | **lost** (its per-scene file was never read) | all there; History shows them |
| …the pinned scene | **not pinned** | pinned |
| …which sequence a scene opens with | **lost** | follows (its sequence's new name) |
| …each scene's picture | right | right (the Lab's newest one, even before it's written) |
| the import card | scenes, files… | also "History (N versions) · ⚡ trigger bars for 1 song · 1 pinned scene" |
| **Duplicate**: scenes, layers, texture and model | copies, its own files | same |
| …the song kept with the scene | **shared** with the original | its own copy (a song in Hearth's folder is the project's copy, like its references); the owner's own music elsewhere stays shared |
| …History | **empty** | copied |
| …pin | **not pinned** | pinned |
| …new ⚡ bars set in the copy | **changed the original's too** (same song, same bars) | the original's stay |
| editing / running the copy | the original's code and History untouched | same |
| removing a reference in the copy | the file **never went to the Trash** (any scene: `fs:trash` got one path as text and walked it letter by letter, asking for "/" first) | its file goes to the Trash |
| …one whose file is the original's (a copy that couldn't be made) | safe only because of the bug above; fixed alone, it would have trashed the original's file | kept while another scene or song uses it; the duplicate now names such a reference |
| **Deleting the copy** (Recently deleted) | original untouched (except the bars above); the copy's scenes and files stay | original untouched; same |
| Windows paths for a song's bars (`C:\…` vs `c:/…`) | — | found either way (`\` or `/`, any case) |

9 of the 33 steps failed on the base code; all 33 pass now (two runs).

## What changed
1. **Each scene in a bundle carries its Lab work** (`labproj-core.js` new, `labproj.js` new, both in the projbundle lazy
   group): `scene.lab = { history, pinned, seqpick, song: { path, triggers, loop } }`. Export and Duplicate read History
   from the scene's own file, plus what the Lab holds in memory not written yet, plus versions still waiting in the old
   whole file (read only when the Lab hasn't read it). `song.path` is the scene's own song path, the same text, so the
   song is packed once and both are rewritten to the unpacked file; the bars and loop go back under that path.
2. **Fresh ids carry it** (`projbundle-core.js`, marked): History's keys follow the scene (layer ids stay), the sequence
   pick follows its sequence; another scene's versions never ride along. `checkBody` checks its shape (≤ 40 versions a
   layer, code size, types) before the card; the secrets scrub covers History's code.
3. **Apply puts it back** (`projbundle.js`, marked): History written to the new scene's file before the Lab can open it
   (never over a file that's there), then the pin, bars, loop and sequence pick (never over bars already set for that
   song here); the presets store is told once, so they sync like any other change. A failed import takes them back.
4. **Duplicate gives a kept song its own copy**, with its beat grid, bars and loop. A song that can't be copied, or isn't
   on this computer, is named in the "What was skipped" list. So is a reference that couldn't be copied (before: shared
   silently).
5. **A removed reference's file** (`tools/three.js` `trashRefFile`, `scenesafe-core.js` `refShared`): sent to the Trash
   as a list, and only when no other scene's reference or song still uses it. `fsapi.js` `trash` now takes a single path
   as one path, and never trashes a disk's root or the home folder.
6. Dev: `dev/checks/labproj97.js` (two app runs), `dev/labproj97-test.js` (UNIT), run-checks group `labproj97`;
   `dev/checks/projbundle.js` compares History on its own (an imported scene that opens and runs adds a version).

## Safety
- Secrets never go in: History's code goes through the same scrub as everything else (a key in a version is removed;
  unit test). The bars and loops are numbers.
- A store that can't be read stops the export or copy with a calm error: a History file that can't be read is never
  taken as "no History". A song missing on the computer it came from is named in the file's skipped list, and on import
  its bars are named too ("its song wasn't in the file"). Nothing is dropped silently.
- Off the window thread: History and the stores are read through the main process; the old whole History file isn't
  copied into the window when the Lab already holds it. That copy cost a 263 ms task in `projbig85`'s Duplicate; after
  the change, two runs showed no long task.
- Deletes go to the Trash only, and only a file nobody else uses. Nothing is uploaded.

## What's left
- Effect favourites, the stage set list, trigger presets and palettes are global to the Lab (not a project's) and don't
  travel in a project file; they already sync between the two computers (labsync87/88).
- A duplicated scene that plays the owner's own music (outside Hearth's folder) shares that song, so its ⚡ bars are
  shared too: bars belong to a song, by design. "Keep a copy with this scene" first makes them independent.
- History files written for scenes taken back by a failed import stay on disk (small, nothing points at them), like
  labsync88's.
- A glTF made of several files (`.gltf` + `.bin` + textures) is one reference file today; only that file travels.
  Unchanged this round (GLB, the usual export, is one file).
- A bundle exported on Windows and imported on the Mac (and back) needs the real PC ↔ Mac run:
  `docs/windows-test-plan.md` § 11.

## For Codex
No Codex-owned file was edited (`projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`, `quest-*`,
`workbench-*`, `creative-vst*`, `astra*`, `engine-watch` untouched). Neither was the syncsweep97 stream's
(`sync-engine.js`, the StoreAck paths) or the creative-direction session's files. A project's delete still only forgets
the grouping (`projects.js` `removeProject`), which is what keeps the original's and the copy's scenes safe.

## Tests run (final code)
- App checks under the run lock: `labproj97` (33/33), `projbundle`, `projbig85` (PROJBIG85=1; passed twice in a row
  after the change; the base code also misses its import budget now and then: 151 ms vs 150 on one of two base runs),
  `projaudit91`, `projects`, `labsync88`, `labboot`, `lazy`: pass.
- `unit:labproj97-test` (11/11), `unit:projbundle-test`, `unit:projbig85-test`, `unit:projaudit91-test`,
  `unit:labsync88-test`, `unit:scenesafe-test`, `unit:desk89-test`, `unit:projopen86-test`, `unit:storeack77-test`.
- Scans: `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`,
  `unit:chatwin-scan`, `unit:boot-test` (first screen 1686 / 1696 KB, unchanged), `unit:lazymanifest-test`: pass.

## For the patch notes
- When you export a project and import it on your other computer, or on a new one, everything you made in the Lab
  comes along: each scene's History, your ⚡ trigger bars and the loop for its song, which scenes you pinned, and the
  sequence each scene opens with. Before, only the scenes, their files and pictures came. The import card now says how
  many versions and trigger setups are coming.
- **Duplicate project** now makes a real copy of your Lab work: History, pins, and its own copy of a song you kept with
  the scene. Changing the trigger bars in the copy no longer changes them in the original.
- Removing a picture, model or sound from a scene now really moves its file to the Trash. Before, the file stayed. A
  file that another scene still uses is kept.
- If something can't come along (a song that wasn't on the computer the project came from, a file that couldn't be
  copied), the "What was skipped" list names it.
