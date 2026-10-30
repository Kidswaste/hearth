# labsync87: the Lab's work between the PC and the Mac (round 87)

Rounds 72–79 made chats and projects travel safely between the owner's Windows PC and his Mac. This round followed the
Lab (tools/three*.js) the same way: scenes, their sliders, new / renamed / deleted scenes, the files imported into a scene
(textures, 3D models, sounds), the Lab's settings and presets, and a scene open and edited on both computers. Each case
was timed from the save on one computer to its arrival on the other, through the same fake second computer as before
(dev/sync-sim.js, the real sync engine, the app's real sync main side). Nothing real was touched: temp folders only.

## How it was measured
- **Time, end to end** (`dev/synclatency77.js`, new Lab items `--items labcode,labparams,labnew,labrename,labdelete,
  labsettings,texture,model,audio,template,presets`): two computers in real time, iCloud-like cloud (2 s up, 3 s down),
  idle, both directions. "Hearth" = the sender putting it in the cloud folder + the receiver writing it and telling the
  window; the rest (≈ 5 s, 7.6 s for 30 MB) is the cloud drive itself, the same before and after.
- **Safety and the hard cases** (`dev/labsync87-test.js`, new, UNIT): the two-computer simulator with placeholders
  (OneDrive online-only files on the PC, iCloud stubs and "dataless" files on the Mac), the write guard, StoreAck and
  scoped passes. Times there are in rounds (each round = 2 s of simulated time, each computer one pass).
  `--before` runs the engine as round 86 left it.
- **In the app** (`dev/checks/labsync87.js`, new): the real app with sync on a temp cloud folder; "the Mac" writes its
  version into the cloud copy, Sync now pulls it, the Lab must show it. Run on this round's base too: 4 of its 9 steps failed.

## Before → after
Times: PC→Mac / Mac→PC, idle, iCloud-like cloud. "Hearth" is up + down→window; total includes the cloud drive.

| case | before | after | safe? |
|---|---|---|---|
| a scene's code edited | 5.9 / 6.0 s (Hearth 0.7 / 0.8 s); the open scene on the other computer refreshes unless you're typing in it | same | yes: a change waiting there is written first and merged (different lines both kept) |
| a scene's slider values | 5.9 / 6.0 s (Hearth 0.7 / 0.8 s) | same | yes |
| a new scene | 5.9 / 6.0 s, joins the picker | same | yes |
| a scene renamed | 5.9 / 5.9 s | same | yes |
| a scene deleted | 5.9 s: it left the picker, but was **not in that Lab's trash** (History → Deleted sketches) until a restart, and only if the other computer's trash file had arrived (a copy of the list was kept aside in `.history`, found by 🛟 Recover lost scenes) | 5.9 s, **in the trash at once** (the other computer's own entry when it's here, else one made on arrival; replaced by the real one later, one entry per deletion) | **now yes** (was: recoverable, but not where the owner looks) |
| a scene's settings (song, timeline: three-lab-extras) | 5.8 s (Hearth 0.7 s) | same | yes |
| a texture (2 MB) imported into a scene | 5.9 s, file + its line in three-refs; **the scene on screen didn't use it** until you switched scenes | 5.9 s, **read and the scene runs again by itself** | yes |
| a 3D model (30 MB) | 9.7 s (Hearth 2.1 s: the big lane copies it beside the passes; a scene saved meanwhile goes at once) | same; the scene on screen picks it up when it lands | yes |
| a sound (6 MB) | 6.4 s (Hearth 0.8 s) | same | yes |
| **a model or any reference over 8 MB, when the cloud drive keeps it online-only** (OneDrive Files On-Demand on the PC, Optimise Mac Storage / iCloud stubs on the Mac) | **never**: big files were "not downloaded behind your back" (meant for renders) until *Download the big files now*; the scene on the other computer had no model | **3–4 rounds (≈ 6–8 s simulated)**, like a small file | **now yes** |
| a reference removed from a scene | the other computer's copy goes to its Deleted files | same | yes |
| a template (My templates) | 6.6 / 6.7 s (its first save waits 1.2 s, not 0.4) | same | yes |
| **Lab presets** (your trigger presets, saved palettes) | **never**: kept in each computer's own storage | **5.8 / 5.9 s** (kv/lab-presets.json), shown in the menus | **now yes**: a delete there goes here unless you changed it here; one name made on both: both kept ("Neon (2)") |
| Lab layout, toolbar, export settings, MIDI pads, stage setup | never (each computer its own) | same, by design | — |
| the scene open on both, edited on both, **different lines** | both edits kept on both, nothing kept aside | same | yes |
| …the **same line**, the other computer's window holding its change | that window's line stays on both; the first one's version **kept aside** (a "Kept aside" note in the sync panel, in Deleted files, Compare / Keep both / Use that one) | same | yes: nothing lost, never two versions pasted into code |
| …the same line, both offline | one version of that layer's code, the other recoverable (kept aside / a conflict settled by itself, said) | same | yes |
| scoped passes (round 79) | every Lab file (scenes, refs, templates, presets) syncs in scoped passes | same | yes |

Also checked, already right: reference paths in three-refs become the other computer's own (`hearth-data:/refs/…`,
Windows `\` vs Mac `/`); reference file names are made portable when imported (`<time>-name`, only letters, digits,
`.`, `-`, `_` and spaces: no case clash, no Windows-illegal or decomposed-Unicode names); unchanged references are never
copied again (0 copies over 4 passes); a store that can't be read is never taken as empty (presets: a missing store never
counts as "everything deleted there"); secrets never sync (no change); nothing leaves except through the cloud folder.

## What changed
1. **Big Lab files are brought down even when the cloud drive keeps them online-only** (`sync-kinds.js` `needed`,
   `syncmain.js`): `refs/` (references imported into scenes) and `templates/` are passed to the engine as files to
   download whatever their size (its existing `allowDownload` option). Renders, captures and other big media keep the old
   rule. *Download the big files now* still adds its own list.
2. **A scene deleted on the other computer goes to this Lab's trash** (`tools/three.js`, `scenesafe-core.js`
   `trashArrived` / `dedupeTrash`): on arrival, the trash file is read once (only for a delete) for the other computer's
   entry; if it isn't here yet, an entry is made from the scene that left (marked `there`) and saved; when the real one
   comes, one entry stays.
3. **References that arrive for the scene on screen are used at once** (`tools/three.js` `refsArrived`): the files are
   read, sent to the preview, and the scene runs again when its code uses references. A file still on its way is read
   when it lands (filewatch already follows the new path).
4. **Lab presets sync** (`tools/three.js` `LabPresets`, `scenesafe-core.js` `presetsMerge`, `tools/three-triggers.js`):
   trigger presets and saved palettes go into `kv/lab-presets.json` (each preset its own id, its value one piece of text),
   held with StoreAck (written first, read again, acked). The menus still read this computer's storage. Started in the
   Lab's first idle moment.
5. Dev: `dev/labsync87-test.js` (UNIT, ≈ 12 s, `--before`), `dev/checks/labsync87.js` (app), Lab items in
   `dev/synclatency77.js`, run-checks group `labsync87`.

## What's left
- **A song on the timeline loaded from outside Hearth's folder doesn't sync** (it isn't copied in, unlike references).
  The other computer finds it by its place in the home folder or a cloud drive, or by its content (round 35), else shows
  "Find this file". A "copy the song into Hearth" option while sync is on would close this (bigger change: beat grids and
  loops are keyed by the song's path).
- Other Lab things you make that stay per computer: per-song trigger setups, pinned scenes, effect favourites, the stage
  setlist (localStorage). Presets were the clearest case; the same `LabPresets` pattern would carry the rest.
- `kv/three-history.json` (40 versions of every layer + the trash) and `kv/three-thumbs.json` (a picture per scene) are
  whole stores: each save re-uploads the whole file (history 1.5 s after a run while live coding, pictures at most every
  3 min per scene). Splitting them per scene would make each save small; not done here (a format change).
- A trash entry made on arrival and the other computer's own one can both sit in the trash file until the Lab reads it
  (it shows one). A preset changed on both computers at once keeps one version; the other is in sync's Deleted files,
  not in the Lab.
- A template's first save syncs after 1.2 s instead of 0.4 s (its new folder is heard first).
- OneDrive Files On-Demand and iCloud placeholders were simulated, not run: the Windows / Mac test plan should import a
  50 MB model on one computer and open the scene on the other.
- `unit:synclatency77-test` failed once while this box was loaded (its "first" step: 4.0 s instead of < 2 s); it
  passed alone, here and on later runs (round 77 notes the same outliers under load).

## For Codex
No Codex-owned file was edited. `sync-engine.js` is unchanged: `syncmain.js` now passes `allowDownload: K.needed` (an
object with `has(rel)`, the only call the engine makes on it) at creation and restores it after *Download the big files
now* instead of `null`.

## Tests run (final code)
- `unit:labsync87-test` (100/100; `--before`: the big model never arrives behind a placeholder, 3 cases),
  `unit:scenesafe-test`, `unit:storeack77-test`, `unit:sync-test`, `unit:sync72-test`, `unit:synchard74-test`,
  `unit:syncstate75-test`, `unit:syncmedia73-test`, `unit:projsync76-test`, `unit:synclatency77-test` (see above),
  `unit:syncscope79-test`, `unit:guardloss78-test`, `unit:twocomputers-test`, `unit:filewatch-test`,
  `unit:cloud-files-test`, `unit:versions75-test`.
- Scans: `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan` (lab-presets declared),
  `unit:chatsafe-scan`, `unit:boot-test`, `unit:lazymanifest-test`: pass.
- App checks under the run lock: `labsync87`, `sync72`, `labboot`, `projects`, `lazy`: 5/5. (`syncscope79` is a group /
  unit test, run as `unit:syncscope79-test`.)
- First screen untouched: the Lab files are in the `lab` lazy group; sync's are main-process; no lazy-data change.

## For the patch notes
- A 3D model, a big texture or a sound you add to a Lab scene now always reaches your other computer, even when OneDrive
  or iCloud keeps files "online only" to save space. Before, files over 8 MB could stay in the cloud and the scene on the
  other computer had no model.
- When a picture or a model you added on one computer arrives, the scene you have open on the other one uses it right
  away. You no longer need to switch scenes to see it.
- Delete a scene on one computer and it goes into the Lab's Deleted sketches on the other one too. You can bring it back
  from there on either computer.
- Your own trigger presets and saved colour palettes now follow you between the PC and the Mac. Delete one on one
  computer and it goes on the other. If you made two with the same name before, you keep both.
- Scene edits, slider changes, new scenes and renames arrive in about 6 seconds with iCloud. Most of that is iCloud
  itself; Hearth's part is under a second.
- If you edit the same scene on both computers, nothing is lost. Different lines are combined. If you change the same line
  on both, Hearth keeps one and puts the other aside in the sync panel, where you can compare them and choose.
- Install this update on both computers.
