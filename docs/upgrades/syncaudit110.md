# syncaudit110: sync walked end to end by clicks, the way the owner meets it (round 110)

The owner syncs a Windows PC and a Mac through a cloud folder (iCloud or OneDrive). Rounds 92–105 changed a lot
underneath sync: the panel's words (syncpanel92), compare and choose (keptaside94, aside95), offline pushes and the
restore guard (checkfix96), guarded writes and settle gates (syncsweep97, syncrace98), long paths (kvrename99), async
passes (syncstall103), "never empty" reads (emptyread104), the rename base (merge105), Your computers and pieces
(devices90, packs89). The internals are tested well. Nobody had walked the owner's side end to end by clicks since
round 92. This round did, found what was broken or confusing, and fixed it in the window. No sync logic changed.

## How it was walked

Two new app checks, run once on the code as it was (the "before" columns) and again after the fixes:

- **`dev/checks/syncaudit110.js`**: the real engine and a temp "OneDrive" folder in the run's own scratch space. A
  made-up "Studio Mac" is a machine record in that folder; it writes its versions straight into the cloud copy, as its
  Hearth would. It walks:
  - first-time setup on a new computer (Settings › Turn on sync… → Use this Hearth);
  - day to day (PC → Mac, Mac → PC);
  - both at once (a chat, a note);
  - deleted on one computer (a chat and a picture, both ways, then Restore);
  - trouble with the real engine (the cloud folder emptied, the drive unplugged and back, an old laptop forgotten and
    coming back, "Send very long chats in pieces" turned on by click).
- **`dev/checks/syncaudit110-states.js`**: the states only a made-up engine status can show on this Linux box (a file
  held by another program, disk full, an older or newer Hearth, a long folder path on the PC…). It uses the
  `Sync` / `SyncPanel._setApi` seam from round 92. Each fix button is **clicked** and judged by the call it made. In
  every state, the check compares what each place says: the chip, the panel's title, the indicator's tooltip and name,
  the ⋯ menu's first line and Sync now's note.

This computer acts as a Windows PC for the words. Nothing outside the run's scratch folder is read or written, except
what the app's own Delete moves to the Trash. Nothing is uploaded, and the update check is answered inside the check.

Kinds the round-94 check already walks by clicks (a project, a board, a Lab scene, a Lab preset, settings, a picture, a
sound, a very long chat) were run again as `keptaside94` and pass. They aren't repeated here.

## First-time setup on a new computer

| Step | Before | After |
|---|---|---|
| Settings › This computer & sync | "Sync is off." with **Turn on sync…** | Same (works). |
| The drive already has the Mac's Hearth | "Use this Hearth?" · "Found Hearth in OneDrive, from Studio Mac (1 min ago). Use it: … merged with it, nothing is overwritten." · **Use this Hearth**. No paths. | Same (works). |
| The first sync | Note: "Using the Hearth in OneDrive (from Studio Mac): merging, nothing is overwritten." Chip: ↻ Syncing → ✓ Synced, never ⚠ on the way. 3.0 s from the click to ✓. | Same (works; not slow). |
| What arrived | The Mac's chat is in the chat list without a reload; this PC's chat is in the cloud copy. | Same (works). |
| The welcome note | "Welcome to this computer … in sync with Mac (Studio Mac) … Check Claude / Check Astra · Got it". | Same (works). |
| The panel | ✓ Synced / "Synced just now", Studio Mac named, no paths. Settings: "Everything is synced with OneDrive". | Same (works). |

## Day to day

| Step | Before | After |
|---|---|---|
| A new message on the PC → Sync now | In the cloud copy in 0.4 s. | Same (works). |
| The Mac's new message and title | Here in 1.8 s (the engine waits 2 s for a cloud file to settle), the new title in the chat list without a reload. Chip, title and tooltip all "Synced". | Same (works). |

## Both at once

| Step | Before | After |
|---|---|---|
| A chat renamed on both | ⚠ 1 conflict; the tooltip "Synced with OneDrive …, but 1 conflict to choose."; a note "Something was changed on both computers: choose which version to keep." with **Choose**. | Same (works). |
| Choose → the panel → Compare… | Choose opens the panel at the card (both titles, Keep PC / Keep Mac / Keep both / Compare…); Compare… shows "This PC" and "Mac" side by side. | Same (works). |
| Keep the Mac's, then Undo | "Using the Mac's version of the chat …" with Undo; ✓ Synced again; Undo: "Back as it was …". | Same (works). |
| A note: the same line both ways | ⚠ 1 conflict, "Notes: “Rider”", Compare… colours the line on each side; Keep this one → "Kept this PC's version …" with **Use the Mac's instead**, which works; ✓ again. | Same (works). |
| A project, a board, a Lab scene, settings | `keptaside94`: Compare, choose, Combine, Undo, by clicks. | Passes again. |

## Deleted on one computer

| Step | Before | After |
|---|---|---|
| A chat deleted on the Mac | It leaves the PC's chat list in 1 s and lands in **Recently deleted** (Hearth's Delete moves a chat to its own trash, and sync follows that move). | Same (works). |
| …the owner opens the sync panel's **Deleted files** | **Confusing.** The chat isn't there (it's in Recently deleted), and nothing says so. What is there is an **older** version of it, named **"A chat"**, "the version before the last change from your other computer". Its Restore brings back that older version. | The chat is named ("Chat “Mac sketchbook (renamed)”"). A first row says "Deleted chats (1): Chats you delete, on either computer, are in Recently deleted on both. Restore there brings one back on both." with **Recently deleted…**, which opens it. |
| Recently deleted → Restore | Worked, but nothing said it covers both computers. | It says "With sync on, a chat deleted on either computer is here on both, and Restore brings it back on both." Restore: the chat is back here, back in the cloud copy's chats, and gone from the Mac's Recently deleted. |
| A deleted chat in Deleted files (a copy kept there by a choice) | Named **"A chat"**. Its Restore put the chat back but **left it in Recently deleted too** (on both computers). | Named by its title (from Recently deleted). Restore puts it back the app's own way, so it leaves Recently deleted. |
| Rows for "this computer's copy" | "replaced or deleted **on this computer** today", also for things the Mac deleted. | "deleted or replaced today (this computer's copy)". |
| A picture deleted on the Mac | Gone here; Deleted files: "sa110-shot.png · deleted or replaced today"; Restore brings it back here and to the cloud copy. | Same (works), with the new wording. |
| A chat / a picture deleted on this PC | The chat goes to the cloud copy's Recently deleted (the Mac's), the picture to the synced Deleted files; Restore from either brings it back on both. | Same (works). |

## Trouble

| Situation | Before | After |
|---|---|---|
| Cloud folder emptied (real engine) | ⚠ Folder / "The cloud folder is empty · paused", "nothing here was deleted" (true: every chat still here). **Start the cloud copy again from here** → ✓ Synced in 0.4 s, everything back in the cloud copy. | Same (works). |
| Drive unplugged (real engine) | ○ Offline; "Everything keeps working here and catches up when it's back"; Sync now's note the same. A chat written meanwhile goes up once it's back; ✓ again in 2 s. | Same (works). |
| …**Pick the folder again…** with the drive away | **Confusing.** "Sync Hearth · **No cloud drive found on this computer** (iCloud Drive, Google Drive, Dropbox or OneDrive desktop app). Install one…" while OneDrive is set up, only unplugged. | "Pick the folder again · OneDrive isn't on this computer right now (not connected, or its folder moved). Once it's back, sync catches up by itself; or choose the folder where it is now." With the same drive found again, the button says "Use OneDrive again" (it said "Switch to OneDrive"). |
| A file held by another program (EBUSY; EPERM on Windows), here or by the cloud drive; a drive that didn't answer | **Confusing.** "⚠ 1 to fix" / "1 file can't sync — see why", tooltip "…but 1 file can't sync", for a file Hearth retries by itself. | "↻ 1 waiting" / "1 file waits — Hearth tries again by itself"; tooltip and note "1 file waits (in use or the drive didn't answer; Hearth tries again by itself)". The panel: "Waiting until it's free (1)", why, and **Try again now** (clicked: it runs a pass). When the next pass finds it free: ✓ Synced, the row gone, by itself. With a file that needs a click as well, it stays "⚠ 2 to fix". |
| Disk full here / on the cloud folder's disk | ⚠ 1 to fix; "This PC's disk is full. Nothing was damaged…" with **Free up space…**. **Dead end:** when there was nothing Hearth could make online-only, the view said only "Nothing to free". | Same, and that view now says "To make room another way: empty the Recycle Bin, or move big files you don't need here to another disk. Sync goes on by itself once there is room." |
| The other computer on an older Hearth | ✓ Synced (it goes on) and "Hearth on Studio Mac is an older version. Update it there…". | Same (works). |
| A file a newer Hearth saved | "Update Hearth here (⬆ Update)…" with **no button**. ⬆ Update shows only once an update is known. | "…Update Hearth here to sync it" with **Check for updates…** (clicked: it checks). |
| This Hearth too old for the cloud copy | ⚠ Update with **Check for updates…** (clicked: it checks). | Same (works). |
| A long folder path on the PC (Hearth's own files) | **Broken (chip ≠ panel).** The chip said **✓ Synced**, and the tooltip, menu and Sync now's note said **"Everything is synced"**. The panel said "The folder path on this computer is too long". | "⚠ 3 to fix" / "3 files can't sync — see why", "…but 3 files can't sync". The panel says which folder to move. **Show Hearth's folder** / **Show the cloud folder** (clicked: they show it). |
| A file too long for Windows; a read-only file | **Shorten for Windows** → "Renamed to …"; **Allow changes** makes it writable (both clicked). | Same (works). |
| An old laptop not seen for 20 days | The line "Old laptop hasn't synced for 20 days…" with **Your computers…** → Settings at Your computers → Forget this computer… → Forget it → gone from the panel. | Same, and the Forget question no longer disappears (below). |
| …it comes back | Named again in the panel ("last synced just now"); Your computers: "Forgotten: Old laptop (came back just now)". | Same (works). |
| **Settings › Your computers: Forget this computer…** | **Broken, now and then.** The fold painted twice on opening (two lists in flight). A "Forget Old laptop?" question asked between the two vanished with its row. This is how `syncpanel92` failed on this round's base: "click: not visible". | One paint at a time; a fresh one asked for meanwhile runs right after; an open question is carried to the same computer's new row. |
| "Send very long chats in pieces", the Mac reading pieces | One click turns it on and sync goes on, but Settings' line stayed **empty** until Settings was opened again. | The line follows the next sync: "On: in use." 2.5 s after the click, without reopening. |
| …the Mac on a Hearth without it | "On here: waiting for **your other computer** to have it on too", even when the one holding it back is an old laptop. | "On here: waiting for **Studio Mac** to have it on too (until then everything syncs as before)". Its own notes unreadable and "starting" are said too. The panel stays ✓ Synced. |
| A very long chat's newest part on its way | ↻ 1 waiting, "a very long chat: its newest part is still coming…; it stays as it is here until all of it has arrived". | Same (works). |
| Many deletions at once | ⚠ Review; **Review them by name…** lists them; **Keep them** works. The list printed **paths** ("chats/…json") and "The chat “A chat”". | Names only (the path on hover); "A chat". |
| A sync error | ⚠ Problem, "Last problem" in plain words. Sync now's note: "…Hearth wasn't allowed to open **The** sync folder". | "…allowed to open **the** sync folder". |
| Online-only placeholders · big videos kept here · the cloud folder gone · paused · own records unreadable | Download those 2 now / Sync big videos / Start the cloud copy again from here / Resume sync: each clicked, each does its job. Own records unreadable: ‖ Waiting, "Nothing was changed; it tries again by itself". | Same (works). |

In every state the chip, the panel's title, the indicator's name, the menu's first line and Sync now's note now agree.
Nowhere does any of them say "Everything is synced" while something is wrong, and nothing on the panel warns while
the chip says ✓. Every "⚠" state has a button that does the fix, or says where the fix is (on the other computer, or
"Hearth tries again by itself"). No main text has a path, an id or an error code.

Not slow anywhere: the slowest step the owner waits for is the Mac's change arriving (1.8 s, the engine's 2-second
settle for a cloud file that just changed); the first sync of a joined Hearth took 3.0 s in the check.

## Files

- `sync.js` (first screen, +2 KB of code: 1694 / 1696 KB):
  - The chip, title, tooltip and menu: a file another program holds, or a drive that didn't answer, **waits**
    (`waitN`); Hearth's own files that a long PC path keeps out count as files that can't sync (`blockedN` +
    `longPath.n`).
  - "Pick the folder again…" with the drive away.
  - The many-deletions list without paths; "A chat".
  - The sync error note's `what`.
- `sync-panel.js` (lazy):
  - "Waiting until it's free (n)" for held files.
  - **Check for updates…** on a file a newer Hearth saved.
  - Free up space opened from "the disk is full" says the other ways.
- `sync-conflicts.js` (lazy):
  - Deleted files names a deleted chat from Recently deleted, and points there with **Recently deleted…**.
  - A deleted chat's Restore goes through Recently deleted.
  - "deleted or replaced today (this computer's copy)".
- `appui-dialogs.js` (lazy):
  - The pieces line names the computer it waits for and follows the next sync.
  - Recently deleted says what sync does with it.
- `devices90.js` (lazy): Your computers paints one at a time and keeps an open Forget question.
- `errorcalm-core.js`: a sentence that starts with "the …" gets its capital (so `what` can be written as it reads
  mid-sentence).
- `dev/checks/syncaudit110.js`, `dev/checks/syncaudit110-states.js`: new. They run in the `sync` group and have their
  own `syncaudit110` group in `dev/run-checks.js`.

## For Codex

No Codex-owned file was changed: `sync-engine.js` and `cloud-files.js` are untouched. Things seen from the window
that sit in the engine:

- **A deleted chat travels as a move** (`chats/<id>.json` → `trash/<id>.json`, Hearth's Recently deleted). So the
  engine's Deleted files never lists it. What it does list is a *recovery* copy ("the version before the last change
  from your other computer"), kept on each pull. Restoring that copy brings back an older chat while the newer one
  waits in Recently deleted. The window now points to Recently deleted and restores a deleted chat from there. The
  engine's `restore()` itself still leaves an app trash copy behind, both here and in the cloud, if it is called for a
  chat that is also in `trash/`.
- **The recovery copies add up after a first sync** of a joined Hearth (one per chat or store that arrived changed), and
  they all show in Deleted files. They are harmless, but noisy; a rule for which ones to keep could live in the engine.
- **`blocked` entries for `locked` / `drive`** aren't counted in `pending`, so a pass ends "synced" with them. The window
  now shows them as waiting. If the engine marked them itself (for example `waits: true`), other readers (first run,
  `/sync status`) would agree without knowing the codes.

## Runs

- `syncaudit110` and `syncaudit110-states`: failed on the base (as the "before" columns say), pass after the fixes.
- The checks named in the brief, the unit tests and `release`: see the end of this file.

## For the patch notes

- **A file that's busy for a moment no longer looks like a problem.** When another program (OneDrive, an antivirus,
  a player) holds a file, the sync label now says "↻ 1 waiting" and "Hearth tries again by itself", instead of
  "⚠ 1 to fix". It still has **Try again now**, and it goes back to ✓ by itself once the file is free.
- **Fixed: "✓ Synced" while some of Hearth's own files couldn't reach your PC.** When the folder path on the PC is too
  long, the label now says "⚠ 3 to fix" and the panel says which folder to move, with a button that shows it.
- **Finding a deleted chat is easier.** A chat you delete on either computer is in **Recently deleted** on both.
  Deleted files now says so, with a **Recently deleted…** button. Deleted chats are named there (they said "A chat").
  Restoring one brings it back on both computers and takes it out of Recently deleted.
- **"Pick the folder again…" with your drive unplugged** now says the drive isn't connected right now and that sync
  catches up when it's back. It no longer says "No cloud drive found".
- **Disk full:** Free up space now also says how else to make room (empty the Recycle Bin, move big files) when there's
  nothing Hearth can free.
- **A file saved by a newer Hearth on your other computer** now comes with a **Check for updates…** button.
- **"Send very long chats in pieces"** now names the computer it's waiting for, and shows "On: in use." right after you
  turn it on.
- **Fixed: in Settings › Your computers, the "Forget this computer?" question could vanish** right after you clicked.
- Small wording fixes: the list of many deletions shows names, not folder paths; a sync error's note reads as a normal
  sentence.
