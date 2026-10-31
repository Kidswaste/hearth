# kvrename99: "Rename for Windows" never touches Hearth's own files (round 99)

Round 98 ("What's left", `docs/upgrades/syncrace98.md`) found an edge in round 74's **Rename for Windows**
(`docs/upgrades/synchard74.md`). On a Mac syncing with a Windows PC, a file whose path would be too long for the PC (its
data folder path over about 170 characters) or whose name Windows can't hold is held back and offered "Rename for
Windows". Applied to a **kv store** (`kv/*.json`), the click cut the store off from the app: a kv store's name is the
app's id for it, so Hearth never read the renamed file again. Projects, boards, Lab presets or settings would seem to
vanish.

## Reproduced (before the fix)
`dev/kvrename99-test.js`, scenario `repro`, through the two-computer simulator (`dev/sync-sim.js`, the worlds of
`dev/sync72-test.js`; temp folders only). The PC's data folder path is 180 characters, its cloud folder's as long; the Mac
makes a board whose id is as long as a kv name can be (`kv/board-<74 characters>.json`, 88 characters: 195 + 1 + 88 >
259). What the owner saw, as the test printed it on the code before this round:

```
· the Mac's sync panel for the board: {"why":"win-long","fix":"rename"}
· Rename for Windows on the board: {"ok":true,"to":"kv/board-aaaa…aaaa~1t9gd5.json","links":0}
· then Hearth reads the board: missing (the board comes up empty: cut off)
```

So the panel said "Its folders and name are too long for Windows… **Shorten for Windows**"; one click and the board was
gone from Hearth (no link points at a kv store: its name *is* the link, so round 74's "links follow" had nothing to
update). The PC said nothing at all. 23 of the test's checks failed before the fix (repro, refuse, older, oldheld,
rules); all 89 pass after.

## The audit: other renames that take a file away from its name
| Path | Hearth-named file renamed out from under the app? | Now |
|---|---|---|
| **Rename for Windows** (`fix(rel, 'rename')`) on the Mac | **yes**: kv stores, chats, deleted chats, templates, show listings, the tickets' index, the data folder's own files (a kv store named like `con` too: Windows keeps that name) | never offered (the block says why instead), and refused if asked (`Own.REFUSE`) |
| **Rename here** (`renameHere`: a delete + the same bytes under a new name arriving from the other computer) | **yes, found by the test**: an older Hearth's Rename for Windows on a Hearth-named store other than kv (say `showsync/venues-paris.json`) that had already synced was followed here, so the show listings vanished on **both** computers (`older`: 3 failures with the fix taken out) | not followed: the file is kept here under its name and put back in the cloud; the new name arrives too; the other computer gets its name back; nothing lost |
| Rename here for **kv stores** and **chats** | no: sync never deletes a kv store (`appStore`), and deletes a chat only when its Deleted copy (`trash/<id>.json`) has the same bytes | unchanged; a kv store an older Hearth renamed comes back on that computer by itself (`older`) |
| The app's own moves: a chat to its Deleted copy and back, anything into `trash/` | they are Hearth's, not a rename away from the name | still followed (`older`: delete and Restore on the Mac, the PC follows) |
| **Rename there** (`renameThere`: this computer's own rename, moved in the cloud) | only this computer's own action (this Hearth never renames a Hearth-named file itself) | unchanged; the other computer, if up to date, doesn't follow it for a Hearth-named file |
| **Case only** (Mac ↔ Windows: `Venues.json` → `venues.json`) | no on a Mac / PC disk: both spellings are one file, the app still opens it | followed as before (`case`); on a disk that minds case (Linux) a Hearth-named file is not followed (`rules`) |
| `relink` (links in chats / scenes / boards follow a renamed owner's file) | rewrites links, renames nothing | unchanged |

## The fix, and why this one
Hearth-named files (`sync-own.js` `appNamed`): every `kv/` store, `chats/<id>.json`, `trash/<id>.json`, the data folder's
own files (`memory.json`, `usage.json`…), `templates/…`, and the JSON stores of `tickets/`, `showsync/`, `creative-vst/`,
`quest-guide/`, `prompts/` (and the per-computer ones that never sync). The owner's files (captures, attachments,
renders, refs, the workspace, photos, music, board media, a ticket's PDF) keep Rename for Windows: links follow them.

Of the three options, **"tell the owner plainly that the folder path is too long, with a button"** was taken:
- **Shorten Hearth's own path** without renaming the id: the only part that is Hearth's is `<cloud>\Hearth\files\`. It
  can't change without breaking the previous release on the other computer (it would look for the old place: two cloud
  copies), and it would win back at most ~14 characters, less than a long id's overrun.
- **A short hashed name with a map** for long kv names: every reader (`store.js` `kvPath`, StoreAck, the store thread,
  sync's `appStore` / guards, the Lab's own `labmodels99` stream) would have to know the map, and the previous release on
  the other computer would not: it would read the long name, find nothing and make a fresh empty store, and its saves
  would fork from the mapped one. Not safe with mixed versions.
- **Say it and show the folder** renames nothing, so every version reads every store where it always did. The trouble
  really is the PC's folder path, and it is fixed there, once, for every file.

What each computer shows:
- **The Mac** (any computer syncing with a PC): a Hearth-named file too long for the PC is listed with the new code
  `win-long-app` (a name Windows can't hold: `win-name-app`), **no button**: "One of Hearth's own files: Hearth finds it by
  this name, so it isn't renamed. The folder Hearth uses on your PC is 25 characters too long for it. On the PC, move
  Hearth's folder or the cloud folder somewhere shorter (this panel there says which, once Hearth is up to date there).
  Meanwhile it stays as it is on this Mac; nothing is lost." It stays held back as before (never in the cloud yet: kept
  on the Mac; already in the cloud: it keeps syncing).
- **The PC**: "The folder path on this computer is too long" in the sync panel, how many of Hearth's own files and how many
  characters over, which folder is the long one and how to move it, and a button: **Show Hearth's folder** (Hearth's
  folder selected in Explorer: quit Hearth, move the whole folder somewhere short, start it from there; saved file
  locations follow, `portable.js`) or **Show the cloud folder** (moved in the cloud app's own settings). The PC learns of
  the files the Mac holds back from the Mac's machine record (`winLong: { n, over, sample }`), and checks its own and the
  cloud's files against its own folders' length.
- Nothing is moved by Hearth itself: the buttons only show the folder.

**Mixed versions.** Nothing is renamed and no format changes, so the previous release on the other computer reads every
store where it always did. The record's new `winLong` field is ignored by it. If that older Hearth still offers Rename for
Windows on a Hearth-named store and the owner clicks it: a kv store or a chat that had synced comes back on that computer
by itself (as before); any other Hearth-named store is no longer followed here: this computer keeps it under its name and
puts it back, so it comes back there too (`older`). A kv store the older Hearth had held back (never in the cloud) is cut
off on that computer only, as it was; its bytes reach this computer under the new name, nothing is lost, and once that
computer is updated it is never offered again (`oldheld`).

## Proof
| What | Result |
|---|---|
| `node dev/kvrename99-test.js` | ✓ 89 / 89 (before the fix: 23 failures in repro, refuse, older, oldheld, rules) |
| app checks `kvrename99 sync72 syncpanel92 keptaside94 guardloss78` | ✓ 5 / 5 |
| app checks `sync lazy synchard74` | see "Final runs" |
| unit: synchard74, sync72, syncsweep97, syncrace98, sync, packs89, devices90, twocomputers, datasafe-scan, winmac, errorcalm-scan, storeack-scan, chatsafe-scan, boot, lazymanifest | ✓ all |
| `node dev/sync72-test.js --thread` | ✓ 209 / 209 |

- `dev/checks/kvrename99.js` (app check, real engine, this computer as a Mac, a made-up PC record with a 206-character
  data folder): the long-named board is held back, its row says why with no button, Rename asked anyway is refused and
  the board still reads; then the PC's side (made-up statuses, sync off): the note, which folder, no paths in the words,
  Show Hearth's folder / Show the cloud folder (answered by the made-up status: nothing opened). 20 steps.
- `syncrace98`'s pinned `rename-kv` / `rename-held` still pass (a store under a name the app doesn't own, `lists/`, is
  still followed).
- `synchard74`'s `many` (50,000-file pass times): the PC's look is one length comparison per name (a first run with a
  per-name rule check showed a 171 ms hold against a 150 ms budget; with the comparison first it passes).
- First screen unchanged (the panel is the lazy `syncpanel` group; `sync-own.js` is main-process only); `unit:boot-test`
  passes.

## What's left
- An older Hearth's Rename for Windows on a kv store it held back (never in the cloud) still cuts the store off **on that
  computer** until it is updated (its app may write the store again under its own name from memory). The renamed copy
  is on both computers; this release has no button to put it back under its name (the name can't be recovered from the
  new one with certainty).
- Hearth doesn't move its folder itself (it runs from it); the panel shows the folder and says how.

## For Codex
`sync-engine.js` (each edit marked `(round 99, kvrename99)`; the logic is in `sync-own.js`):
- `require('./sync-own')` as `Own`.
- `block()`: carries `over` (how many characters too long) like `part` / `code` / `to`.
- `writeMachine`: the record gets `...Own.record(status.blocked)` (`winLong` when Hearth-named files are held back for a
  PC); it is rewritten when that changes (folded into the packs89 `pk` comparison; with no packs and nothing held, the
  same writes as before).
- In a pass, after the scans: `status.longPath = platform === 'win32' ? Own.longHere({ dataDir, cloudRoot, rels:
  [local.keys(), cloud.keys()], peers }) : null`.
- The plan loop's Windows-name hold: the block's code / fix come from `Own.winBlock(rel, bad)` (a Hearth-named file:
  `win-long-app` / `win-name-app`, no fix). Held back exactly as before.
- `fix(rel, 'rename')`: `Own.appNamed(rel)` → `{ ok: false, error: Own.REFUSE }`.
- Rename matching, deleteHere side: `if (a && !Own.followMove(d.rel, a.rel, { ci: platform !== 'linux' }))` → the delete
  becomes a push of this computer's copy (`d.C = null`, `dropBase`), and the new name is pulled as a new file.

`cloud-files.js`: no change.

Other files: `sync-own.js` (new, pure), `sync-hard.js` (`BLOCK['win-long-app' | 'win-name-app']`), `sync-panel.js`
(the words, the PC's note and its button, Details line), `syncmain.js` (`longPath` in the status, `sync:showFolder`),
`preload.js` (`sync.showFolder`), `dev/kvrename99-test.js`, `dev/checks/kvrename99.js`, `dev/run-checks.js`.

## For the patch notes
- Sync no longer offers "Rename for Windows" for Hearth's own files (projects, boards, Lab presets, chats, settings).
  Their names are how Hearth finds them; renaming one made it seem to vanish. When one of them is too long for your PC,
  the sync panel now says the folder path on the PC is too long, and on the PC it says which folder to move, with a
  button that shows it.
- If an older Hearth on your other computer renames one of Hearth's own files, this computer keeps it under its own name
  and puts it back, so it doesn't disappear on either computer.
