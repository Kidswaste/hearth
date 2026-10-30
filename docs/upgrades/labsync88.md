# labsync88: the rest of the Lab between the PC and the Mac (round 88)

Round 87 (labsync87.md) made scenes, imported files, trigger presets and palettes travel between the owner's Windows PC
and his Mac. It left three things open: other things made in the Lab still stayed on one computer; History's versions and
the scenes' pictures were sent whole on every save; and a song loaded from outside Hearth's folder didn't reach the other
computer. This round closes all three. Everything was measured on temp folders only, through the same fake second
computer (dev/sync-sim.js, the real sync engine), and in the real app with a temp cloud folder.

## How it was measured
- **Rules and two computers** (`dev/labsync88-test.js`, new, UNIT, ≈ 1 s): the Lab's merge rules exactly as the app runs
  them (`scenesafe-core.js` `labStoreMerge`, `mineMerge`, `histFlush`, `thumbHash`, `songTravels`), then both computers
  through the simulator. Times there are rounds (2 s of simulated time each; each computer one pass).
- **In the app** (`dev/checks/labsync88.js`, new, 14 steps): sync on a temp cloud folder; "the Mac" writes its version
  into the cloud copy, Sync now pulls it. History moved per scene, a pin / favourite / set list / song triggers from the
  Mac, a pin here reaching the cloud, an unpin from the Mac, a picture saved only when it changes, and a song from
  outside Hearth's folder (the offer, one click, the copy reaching the cloud).

## Before → after
| case | before (round 87) | after | safe? |
|---|---|---|---|
| a song's own ⚡ trigger bars | stayed on this computer | **3 rounds (≈ 6 s simulated)**, under the other computer's own path for that song (Music on the PC → Music on the Mac) | yes: a delete there goes here unless you changed it here; set on both at once: yours stays, the other becomes a trigger preset "Song (other setup)" |
| a song's loop section | stayed here | syncs (same rules) | yes |
| pinned scenes (★ Pin to the top) | stayed here | **3 rounds**; unpinned on one → unpinned on the other | yes |
| effect favourites (★ in effects) | stayed here | syncs | yes |
| the stage set list | stayed here | **3 rounds**; on the stage screen at once | yes: made / changed on both at once: the two lists are joined, nothing dropped |
| which sequence a scene opens with | stayed here | syncs | yes |
| Lab layout, toolbar, export settings, MIDI pads, stage output, MIDI on/off, frame / grid views | each computer its own | same, by design (each computer's screen and gear) | — |
| History's versions (40 per layer) | **one file for every scene**, rewritten and sent whole 1.5 s after each run: **3.6 MB** per run with 30 scenes × 2 layers | **one file per scene** (`kv/three-hv-<scene>.json`): **121 KB** per run (only the scene that ran) — 30× less | yes: a scene's file is read before it is written (what's there is kept); one that can't be read is never written over and is tried again; the old file keeps the trash |
| versions already in the old file (or written there by an older Hearth on the other computer) | — | moved into the scene files on the Lab's first idle moment; taken out of the old file only once their scene's file is written | yes: nothing lost (checked version by version) |
| a scene's picture | re-saved (the whole pictures file sent) every time a scene ran 3 min after its last picture, even when it looked the same | saved only when it **looks different** (a 64-bit fingerprint of the picture; an animated scene a moment later counts as the same) | yes: the picture kept is never dropped |
| a song loaded from outside Hearth's folder (Music, Downloads, another disk) | never reached the other computer (found there only if it had the same file; else "Find this file") | **nothing is copied by itself**. With sync on and the other computer known, a note offers once: "Keep a copy with this scene so it plays on your other computer (16 KB)". One click copies it into Hearth's references (`refs/`, always brought down on the other side, round 87), and every scene on that song plays the copy; its beat grid, trigger bars and loop come along. Undo puts the original back. `/song keep` asks any time | yes: the original file is never moved or changed; a song in Hearth's folder or in a cloud drive isn't offered (it goes by itself) |

Also checked: a missing Lab store (never made, or gone) is never read as "everything deleted there"; an unreadable one
is never merged or written (as round 87); round-87 presets and anything a newer Hearth keeps in `kv/lab-presets.json`
stay; nothing changed → nothing written; song paths compare with `\` or `/` and without case (Windows); scene file names
are only lowercase letters, digits, `-` and `_` (an id with capitals gets a short hash instead, so Windows and the Mac never
see two names that differ only by case); secrets never sync (no change); nothing leaves except through the cloud folder.

## What changed
1. **More of the Lab syncs** (`scenesafe-core.js` `mineMerge` / `labStoreMerge`, `tools/three.js` `LabPresets`): the
   song triggers, loops, pins, effect favourites, the set list and each scene's sequence ride in the presets' store
   (`kv/lab-presets.json`, StoreAck-held), one item per thing with a key naming what it's about (a song, a scene, an
   effect). Each item remembers whether this computer wrote it and what value its writer built on, so "changed there"
   is told from "changed on both at once". The places that write them (`three.js`, `three-fx.js`, `three-stage.js`,
   `three-media.js`, `three-seq.js`) call `LabPresets.changed()`; a song followed to a new place takes its bars and loop
   with it.
2. **History one file per scene** (`scenesafe-core.js` `histFlush` / `histJoin`, `tools/three.js`): `saveHistory(scene)`
   writes that scene's file; `saveHistory()` (the trash changed) writes `three-history.json` (`{ v: 2, versions: {},
   trash }`). A scene's versions are read when it opens and before History shows. 🛟 Recover lost scenes also reads the
   scene files (`scenesafemain.js`).
3. **Pictures saved when they change** (`tools/three.js` `keepThumb`, `scenesafe-core.js` `thumbHash`): the fingerprint is
   kept with the picture (`h`); a picture from before this round gets its fingerprint in memory first, so the first run
   after the update doesn't rewrite it either.
4. **Keep a song with its scene** (`tools/three.js` `offerSongCopy`, `scenesafe-core.js` `songTravels`, `/song keep` in
   `tools/three-cmds.js`): Hearth's existing reference import (`hub.importRef`) and `player.follow` (round 42).
5. Dev: `dev/labsync88-test.js` (UNIT), `dev/checks/labsync88.js` (app), run-checks group `labsync88`.

## What's left
- The pictures file (`kv/three-thumbs.json`) is still one file: when one picture changes, the file goes whole (now only
  then). Splitting it per scene means changing Projects' reader (`projects.js`, Codex's), left for a later round.
- Scene files of scenes deleted for good stay on disk (small; never deleted by Hearth, by design).
- A song's loop or a set list changed on both computers in the same seconds: the set list joins; a loop keeps one (the
  other is in sync's Deleted files, as for presets in round 87).
- The other computer's "Find this file" note for a song kept only on the first computer doesn't yet say "keep a copy
  there"; `twocomputers.js` is first-screen code, left alone this round.
- An older Hearth (round 87) on the other computer shows only versions made since it started, until it's updated.
  Install this update on both computers.
- A Mac folder with two songs whose names differ only by case is taken as one song for its trigger bars.

## For Codex
No Codex-owned file was edited (sync-engine.js, cloud-files.js, projects*, quest-*, workbench-*, creative-vst*, astra*,
engine-watch untouched). `projects.js` still reads `kv/three-thumbs.json` as before (same shape; entries may carry `h`).

## Tests run (final code)
- `unit:labsync88-test` (60/60), `unit:labsync87-test`, `unit:scenesafe-test`, `unit:sync72-test`,
  `unit:syncscope79-test`.
- Scans: `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`,
  `unit:boot-test` (first screen 1741 / 1751 KB, unchanged), `unit:lazymanifest-test`: pass.
- App checks under the run lock: `labsync88` (14/14), `labsync87`, `sync72`, `labboot`, `projects`, `lazy`: pass.
  Also `scenesafe` and `timemachine` (they read or seed History): pass. `labstartfast` fails its `songOpen` step ("the
  preview changed size 2× after it was laid out") — the same failure on this round's base code (run there too, plus a CPU
  budget miss), so not from this round; left to checkfix88.

## For the patch notes
- More of what you make in the Lab now follows you between the PC and the Mac: the trigger bars you set for each song,
  a song's loop, the scenes you pinned to the top, your favourite effects, the stage set list, and which sequence each
  scene opens with. Unpin or remove something on one computer and it goes on the other too.
- If you change the same song's trigger bars on both computers at once, you keep both: the other computer's version shows
  up in your trigger presets as "(other setup)". Two set lists made at the same time are joined into one.
- A song you load from your Music or Downloads folder stays where it is. Hearth never copies your music by itself. When
  the other computer won't have that song, a note offers "Keep a copy with this scene so it plays on your other computer"
  with its size. One click and the scene plays on both computers. Typing /song keep asks again at any time.
- Live coding sends much less to OneDrive or iCloud. Each run used to re-send the history of every scene (several MB); now
  only the scene you're working on goes (about 30 times less). Scene pictures are only sent again when they actually look
  different.
- The first time you open the Lab after the update, your earlier versions are moved into the new layout by themselves.
  Nothing is lost, and History shows them as before.
- Install this update on both computers.
