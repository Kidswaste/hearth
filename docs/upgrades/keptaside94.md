# keptaside94: when sync keeps two versions, choosing is easy and safe (round 94)

The owner syncs a Windows PC and a Mac. When the same thing changes on both before they sync, Hearth either asks him to
choose (a **conflict**), or keeps one version and puts the other **aside** by itself (auto-settle, on by default, or a
save that lands right after the other computer's version). Rounds 72–92 built the pieces: the sync chip and panel
(sync72, syncpanel92), Deleted files, "kept aside" notes (guardloss78), Keep both for projects as "A / B" (projaudit91),
and Lab scenes and presets between computers (labsync87/88). Nobody had walked the whole compare-and-choose flow by
clicks, for every kind of thing, the way the owner sees it: he can't read JSON and doesn't use commands.

## How it was looked at

- **By clicks, in the app** (`dev/checks/keptaside94.js`, new): the real sync engine, a temp cloud folder in the run's
  own scratch space, and a made-up "Studio Mac" that writes its version straight into the cloud copy. Auto-settle is
  off, so each kind waits for a choice; the last case turns it on, so sync keeps one version and puts the other aside.
  Each kind: is it said, are both versions shown in plain form, the choice by click, the result saved and in the
  cloud copy, the other version in Deleted files, and Undo. This computer acts as a Windows PC for the words.
- **Without a window** (`dev/keptaside94-test.js`, new, UNIT): the pure part (`keptaside-core.js`) and the main side
  (`keptasidemain.js`) on the real engine through the two-computer simulator (`dev/sync-sim.js`).
- **By reading the code** of each path that keeps a version aside: the engine's conflicts and kept-aside notes, a very
  long chat's pieces (`syncpack-core.js`), the Lab's presets and song triggers (`scenesafe-core.js`, `tools/three.js`),
  the panel, the Conflicts list and Deleted files.

The "before" column comes from the code as it was (the check drives the new view, so it can't run on the old code);
each "after" is a step of the check.

## The shared compare view

One view for every kind (`keptaside.js`, lazy group `keptaside`, loaded on the first Compare…). It opens from the
sync panel (**Compare…** on a conflict or on a "kept aside" line), from the Conflicts list (**Compare…** on each row),
and from the note that appears when sync keeps a version aside (**Compare**).

- The two versions in two columns: **This PC** / **Mac** for a conflict (the PC always left, the Mac right), **In use
  now** / **Kept aside** for a version kept aside (with whose each is). Each column has **Keep this one**.
- Under them, what differs, by kind:
  - **chat**: the title both ways; the messages only one side has, each in its column (You / Reply, when, the text);
    a message changed on both, side by side; how many messages each has and share.
  - **very long chat** (over 6 MB): the same, worked out on the store thread (`storework.js` `chatDiff`); nothing is
    parsed whole on the main process or in the window.
  - **Lab scene, note, any text**: each text that differs as a line-by-line diff, with line numbers, the changed lines
    coloured on each side, long unchanged stretches folded ("… 12 lines the same in both"). A scene's code is named
    by scene and layer ("“Neon Rose” › “Background” › code").
  - **settings**: one sentence per option, "Theme › accent: this PC says “#ff3366”, the Mac says “#33cc66”." Each
    computer's own parts (window layout, program paths) never sync and are not listed.
  - **picture / sound / video**: both, to look at or to play.
  - **project, board, Lab preset, other data**: what differs in words: "“Neon (PC)” › name" with both values; things
    only one side has; a Lab preset's setup looked into ("“Drop hits” › setup › bars: 8 · 16").
- **Keep both** where it makes sense (not for settings): a chat or a file as its own copy "… (from Mac)", a board or
  a scene twice, a project as ONE project named "A / B" (round 91).
- **Combine…** for a text both changed (a note, a scene's code, a board's text): an editor that starts with both
  versions' lines (where they differ, this side's first), with "Start again from both", "Only this PC's" and "Only the
  Mac's", and **Save the combined version**. Nothing changes until he saves.
- **Decide later** closes it; nothing changes.
- After a choice, a note says what happened and where the other version is, with **Undo** (or, when nothing changed
  here, "Use the Mac's instead"). Undo puts back what was there before; what replaced it goes to Deleted files too.

## By kind: before and after

### A chat
| | Before | After |
|---|---|---|
| Told | ⚠ 1 conflict in the rail; no note at the time | the same, plus a note at the time: "Something was changed on both computers: choose which version to keep." with **Choose** |
| Both in plain form | the panel card: the title and the last 2 messages only each side has | the card as before, plus **Compare…**: the title both ways, every message only one side has (the last 40, and how many more), a message changed on both side by side |
| Choices | Keep PC / Keep Mac / Keep both | the same, in the card and in the view; no Combine (messages from both already merge by themselves) |
| After | "Keep Mac: done. The other version waits in Deleted files." with **Deleted files** | "Using the Mac's version of the chat “…”. This PC's waits in Deleted files for 30 days." with **Undo**. Keep both's Undo puts the copy chat in the Trash (Recently deleted) |

### A very long chat (over 6 MB)
| | Before | After |
|---|---|---|
| Both in plain form | **nothing to compare**: the engine sends neither version over 6 MB, so both sides read "(not on this side)" | the titles and the differing messages, worked out on the store thread (0.6 s from the click to the view for 7 MB in the check) |
| A version kept aside by the pieces lane (packs89) | Restore from Deleted files made a **second chat file** "abc123-<id>.json" (its 6-character prefix wasn't taken off) | the prefix is 8 characters like the engine's, so Restore and Undo bring it back to its own chat |

### A note or a board
| | Before | After |
|---|---|---|
| Both in plain form | up to 3 lines "only here" per side, no context, no line numbers | the whole text line by line, the changed lines coloured on each side, line numbers, unchanged stretches folded |
| Choices | Keep PC / Keep Mac / Keep both; Merge in the Conflicts list (the newer line wins) | the same, plus **Combine…** (edit, then save) |
| After Merge / Keep both | where both changed one value, one side won and the other version was **only in a hidden folder** (the trash's `conflicts/`), not in Deleted files | the other version is put in Deleted files whole first (`sync:keepTheirs`); if that fails, nothing is changed |
| Board renamed both ways | Keep both: two boards | the same; Undo → one board again, both earlier versions in Deleted files |

### A project
| | Before | After |
|---|---|---|
| Both in plain form | "list › p1 › name" lines in the panel | "“Neon (PC)” › name": “Neon (PC)” · “Neon (Mac)” |
| Choices | Keep PC / Keep Mac / Keep both ("A / B") | the same, each with Undo (checked: Keep the Mac's, then Undo → this PC's name) |

### A Lab scene (code)
| | Before | After |
|---|---|---|
| Both in plain form | up to 3 code lines only each side has, in the panel card | the code line by line, named by scene and layer, the changed line coloured on each side, line numbers |
| Choices | Keep PC / Keep Mac / Keep both (the scene twice) | the same, plus **Combine…** (checked: "Only the Mac's", a line added, saved: the combined code is saved, in the cloud copy, and Undo brings this PC's back) |
| A scene open in the Lab | — | Combine writes through the Lab's own store (StoreAck: the Lab's unsaved edit is written first, then it reads the combined version) |

### A Lab preset or trigger setup
| | Before | After |
|---|---|---|
| Named | "Tool data “lab-presets”" | "The Lab preset “Drop hits”" (the panel's line: "Lab presets and trigger setups") |
| Both in plain form | `items › p1 › data: {"bars":8,…}` (raw text) | "“Drop hits” › setup › bars": 8 · 16 |
| A song's ⚡ triggers changed on both at once | this computer's stayed, the other's became a trigger preset "Song (other setup)" **without a word** | a note says so and where to find it |

### Settings
| | Before | After |
|---|---|---|
| Both in plain form | "theme › accent: “#ff3366” here · “#33cc66” on Mac" | "Theme › accent: this PC says “#ff3366”, the Mac says “#33cc66”." |
| Choices | Keep PC / Keep Mac (no Keep both: settings are one or the other) | the same, with Undo (checked: Keep the Mac's → its colour; Undo → this PC's) |

### A file: a picture or a sound
| | Before | After |
|---|---|---|
| Both in plain form | pictures: both, small, in the card. Sounds: a 📄 icon and a size | pictures: both, larger. Sounds: both with a player. Videos: both with a player |
| Choices | Keep PC / Keep Mac / Keep both ("… (from Mac).png") | the same, each with Undo. Keep both's Undo moves the copy into Deleted files (it goes from both computers; the original is untouched) |

### A version kept aside by itself (auto-settle on, or a save right after an arrival)
| | Before | After |
|---|---|---|
| Told | the rail said "✓ Synced" (only its tooltip said "kept aside"); no note at the time | the rail says "◐ 1 to compare"; a note at the time: "Both computers changed … at the same time. One version is in use; the other is kept aside, nothing is lost." with **Compare** |
| Both in plain form | Compare in the panel: up to 3 fields, "In use now" / "Kept aside" | the shared view, in full |
| Choices | Compare / Keep both / Use that one / OK | **Compare…** / **Keep the one in use** / **Use the one kept aside** / **Keep both**; in the view, **Keep this one** under each, Keep both, Combine… |
| After | Use that one: a note with **Deleted files** | each choice has Undo |

## Found and fixed across kinds

- **On one of the two computers, a conflict was labelled the wrong way round, and "Keep PC" kept the Mac's version.**
  A conflict's record syncs, so both computers list it. The version in place is the one of the computer that noticed
  it; the copy is the other's. On the computer the copy came from, the panel and the Conflicts list still called the
  version in place "This PC". The unit test shows the record on both computers; the panel card, the Conflicts list and
  the new view now label each side the way this computer sees it, and the buttons keep their meaning.
- **Merge and Keep both could leave the losing value only in a hidden folder** (see the note and board table above); fixed in the window
  (the Conflicts list and the new view keep the other version in Deleted files first).
- **Deleted files said every version here was "removed here because your other computer deleted it"**, including the
  ones a choice replaced or kept aside. It now says "replaced or deleted on this computer yesterday", and names a
  version kept twice the same day without its random prefix ("Notes", not "Tool data “1a2b3c4d-notes”").
- **Nothing told him when a conflict appeared** unless he looked at the rail: a note now says so, once, at the time.

## Found, not fixed

- Use the one kept aside / Keep both on a very long chat kept aside by the pieces lane reads both versions whole on
  the main process (the engine's `asideDo`); a 50 MB chat would hold the app for about half a second. In
  `sync-engine.js` (Codex's), not changed here.
- Choosing "Keep the Mac's" (theirs) by hand moves the conflict's copy into the trash's hidden `conflicts/` folder
  (the engine's `resolve`). Nothing is lost (that version is in place), but it isn't listed under its name.
- A conflict's record names the noticing computer (`by`) but not its id, so a third computer can't tell which
  version is whose; it labels them by computer name.
- The song-triggers note in the Lab has no button to swap the two setups; the other setup is one click away in the
  trigger presets.
- Settings: an option only one computer has (added by a newer Hearth) is not listed, because each computer's own
  parts can't be told from it without the engine's list.

## Files

- `keptaside-core.js` (new, pure): kinds, the line diff (Myers), Combine's starting text, a text put back in place, what
  differs in words, a chat's differing messages, Undo's Deleted-files entry.
- `keptaside.js`, `keptaside.css` (new, lazy group `keptaside`; `lazy-data.js`, `index.html` lazy-at tag,
  `docs/lazy-groups.md`).
- `keptasidemain.js` (new, main side, required by `syncmain.js`): `sync:keepCopy`, `sync:keepTheirs`, `sync:putAway`,
  `sync:chatDiff`; `preload.js` exposes them.
- `storework.js`: `chatDiff` on the store thread.
- `sync.js` (first screen, +1 KB: 1744 / 1751 KB): the chip "◐ n to compare", the notes when a conflict appears or a
  version is kept aside, "Lab presets and trigger setups".
- `sync-panel.js`: Compare… on a conflict; the kept-aside line's buttons; choices through the shared view (Undo);
  each side labelled the way this computer sees it.
- `sync-conflicts.js`: Compare… on each row; Merge / Keep both keep the other version first; each side labelled the
  way this computer sees it; Deleted files' words and names.
- `syncpack-core.js`: a very long chat's version kept aside gets an 8-character prefix.
- `tools/three.js` (`LabPresets.take`): the note when a song's triggers changed on both.
- Checks: `dev/checks/keptaside94.js` (new), `dev/keptaside94-test.js` (new, UNIT), `dev/run-checks.js` (group
  `keptaside94`, in `sync`). `dev/checks/sync72.js`, `syncpanel92.js`, `guardloss78.js`, `projaudit91-sync.js` follow
  the new names and the shared view. `dev/chatwin-scan.js`: `keptaside-core.js` reads two versions of a chat, not a
  windowed one.

## Runs

All passed:
- App checks: `keptaside94` (twice), `sync72`, `syncpanel92`, `projaudit91`, `projaudit91-sync`, `labsync88`, `sync`,
  `synchard74`, `syncmedia73`, `sync-switch-safety`, `guardloss78`, `lazy`.
- Unit tests and scans: `unit:keptaside94-test` (57), `unit:sync72-test`, `unit:sync-test`, `unit:projaudit91-test`,
  `unit:labsync88-test`, `unit:devices90-test`, `unit:guardloss78-test`, `unit:packs89-test`, `unit:datasafe-scan`,
  `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`, `unit:chatwin-scan`,
  `unit:boot-test`, `unit:lazymanifest-test`.

What only the real PC and Mac can confirm is in `docs/windows-test-plan.md` § 10.

## For Codex

No Codex-owned file was changed: `sync-engine.js`, `cloud-files.js`, `projects*`, `project-workspace*`, `quest-*`,
`workbench-*`, `creative-vst*`, `astra*` and `engine-watch` are untouched. Things to know:
- **Combine** saves a data store (`kv/*.json`, which includes `kv/projects.json`) through `hub.kvSet`, between two
  `StoreAck.arrived` calls: the holder's change waiting is written first, then it reads the combined version.
- The three engine notes under "Found, not fixed" are in `sync-engine.js`: whole-chat parsing on the main process in
  `asideDo`; `resolve('theirs')` moving the copy to the hidden `conflicts/` folder; the conflict record without the
  noticing computer's id (`byId` would let a third computer label both sides).

## For the patch notes

- **When both computers change the same thing, you see both and choose.** A new compare view shows the two versions
  side by side, in plain form:
  - for a chat, the messages that differ;
  - for a Lab scene's code or a note, the lines, with the changed ones coloured;
  - for pictures and sounds, both, to look at or play;
  - for settings, "this PC says X, the Mac says Y".
  It works for very long chats too.
- **Keep this one, Keep both, or Combine.** Under each version there's **Keep this one**. **Combine…** puts both
  versions of a text or code in one editor so you can make your own before saving.
- **Every choice has Undo**, and the version you don't keep waits in Deleted files for 30 days.
- **You're told when it happens.** A note appears when something was changed on both computers, and when Hearth kept
  one version and put the other aside. The sidebar shows "◐ 1 to compare" until you look.
- **Fixed: on one of your two computers, "Keep PC" could keep the Mac's version.** Each side is now labelled the way
  the computer you're on sees it.
- **Fixed: Merge and Keep both could hide one version.** Both now wait in Deleted files.
- **Lab triggers changed on both computers at once** now come with a note saying the other setup was saved as a
  trigger preset.
- **Deleted files** names things plainly and no longer says "your other computer deleted it" about a version you
  replaced yourself.
