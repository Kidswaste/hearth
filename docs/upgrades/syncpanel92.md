# syncpanel92: the sync panel says plainly what's happening and where to click

Round 92. Rounds 72 to 91 added a lot to sync: the states, "⚠ to fix", "Kept aside", deleted files, waiting items, very
long chats in pieces (packs89), Your computers (devices90) and Lab files (labsync87/88). Nobody had looked at the whole
panel the way the owner sees it. This round did that, by clicks, in every state, and fixed what it found. No sync logic
changed.

## How it was looked at

`dev/checks/syncpanel92.js` drives each state in the app and records what the owner sees: the chip in the rail, the
panel's title, its main text (the panel without its Details folds), its buttons, and the note after Sync now. The check
ran once on the old code, which gave the "before" column, and again after the fixes.

- **Real engine** (a temp cloud folder in the run's own scratch space; "Studio Mac" and an "Old laptop" are made-up
  machine records). States: in sync; a computer not seen for 20 days, then forgotten through "Your computers…"; the
  cloud folder gone (`Hearth/files` moved to the Trash); the whole cloud folder unplugged.
- **Made-up engine statuses** in the engine's own shape, once sync is off. States: syncing, pieces, placeholders, big
  files, conflict, kept aside, deleted files, the three file errors, sync error, read failure, emptied, old versions,
  deletions held, paused. `window.hub.sync` is read-only, so the check swaps the API through a small `_setApi` seam on
  `Sync` / `SyncPanel` (updater.js already has the same pattern). Nothing real is read or written, and nothing is
  uploaded.
- **First-time setup**: sync off, then `Sync.setup()`.

This computer acts as a Windows PC in the check, so the panel uses its words ("This PC", "Keep Mac").

## States, before and after

"Chip" means the chip in the rail. "Title" means the panel's heading, which also gives the indicator its name and
tooltip.

| State | Before | After |
|---|---|---|
| Idle, in sync | ✓ Synced / "Synced just now". Paths and codes appeared nowhere, but they also had no place to go. | Same words. A **Details** fold (cloud folder, state, computers, what waits and why) with **Copy details for Claude**. |
| Syncing | ↻ Syncing / "Syncing…" | Same, plus Details. |
| Waiting for pieces (very long chat) | ↻ 1 waiting; "Chat “Tour diary”: a very long chat: its newest part is still coming…" | Same (it was already good). The note after Sync now says "1 file on the way". |
| Offline (drive unplugged) | ○ Offline / "Offline · catches up…". The panel body was **empty**, with no way to fix it except the ⋯ menu. | Same chip and title. The panel says "Offline: … isn't reachable (the drive isn't connected, or the folder moved). Everything keeps working here…" and has **Pick the folder again…**. |
| Cloud folder missing | Chip **○ Offline**, but the title said "The cloud folder isn't there · paused". The body was empty, and the fix was only in the ⋯ menu. | Chip **⚠ Folder**, in the attention colour. The full sentence ("moved, renamed or the drive isn't connected… nothing here was touched"), then **Start the cloud copy again from here** and **Pick the folder again…**. The note's button now has the same name. |
| Cloud folder emptied (cloud drive starting over) | ○ Offline / "The cloud folder is empty · paused". Empty body. | **⚠ Folder**, the full sentence ("nothing here was deleted"), and the same two buttons. |
| This computer's own sync records can't be read (`error: 'held'`) | **○ Offline / "Offline · catches up when iCloud Drive is back"**. Sync now's note said the drive "isn't reachable". Both are wrong: the drive was fine, and a read failure must never look like "offline" or "empty". | **‖ Waiting / "Sync waits · can't read its records here"**. "Hearth can't read its own sync records on this computer right now. Nothing was changed; it tries again by itself." The note says the same. |
| OneDrive / iCloud online-only placeholders | "only in the cloud for now" with no hint of what to do; "Download those 3 now" also counted a Lab file that downloads by itself. A chat showed as "**A chat (sp92-unknown)**", which is its id. | "only in the cloud for now (online-only): “Download” below brings it here". A Lab file reads "Lab file “neon-texture.png”: a Lab file only in the cloud for now: it downloads by itself", and the Download button counts only the files that need the click. An unknown chat is "A chat". |
| A big file waiting | "Big files on their way (2)" with bars; "1 big video kept on this computer (Sync big videos is off)" with **no button**. | Same bars, plus "…kept on this computer only: “Sync big videos” is off." and a **Sync big videos** button. |
| A conflict | ⚠ 1 conflict / "1 conflict — choose", with Keep PC / Keep Mac / Keep both. But the tooltip, Settings and Sync now's note said "**Everything is synced** with …: 1 conflict to look at". | Panel unchanged. The line is now "Synced with … , but 1 conflict to choose." |
| A conflict kept aside | "Mac's version of Mood boards kept aside — compare", with Compare / Keep both / Use that one / OK. | Unchanged (it was already good). |
| A deleted file (Deleted files) | Each row's first line was the **raw path and an ISO date**: "chats/sp92-diary.json · deleted 2026-10-29"; "kv/boards.json · saved before the last incoming sync". A failed Restore showed the raw error. | "Chat “Tour diary”: deleted yesterday (removed here because your other computer deleted it)"; "Mood boards: the version before the last change from your other computer". The path is shown on hover only. "Kept for 30 days. Restore brings one back here, and sync takes it to your other computer." A failed Restore is in plain words, with the raw text under Details. |
| Errors on a file: permission (Windows: in use), disk full, path too long on Windows, read-only | ⚠ 4 to fix / "4 files can't sync — see why". Each row had its fix (Try again now, Free up space…, Shorten for Windows, Allow changes). But **the tooltip, Settings › Sync, the ⋯ menu's first line and Sync now's note all said "Everything is synced with iCloud Drive."** | Same panel. Everywhere else now reads "Synced with iCloud Drive (checked just now), but 4 files can't sync (see why in the sync panel)." |
| Sync error (the whole pass failed) | Chip **⚠ Look**. "Last problem" in plain words, with the raw reason under Details. Settings and the menu said "**Syncing with** … : Hearth wasn't allowed…". | Chip **⚠ Problem**. The line is "Sync couldn't finish with …: Hearth wasn't allowed…" |
| The other computer on an old version | "…is an older version: update it there too (⬆ Update), so it handles these cases as well." | "Hearth on Studio Mac is an older version. Update it there (⬆ Update on that computer) so both keep files the same way; syncing goes on meanwhile." |
| This computer on an old version | Chip **○ Offline**, title "Update Hearth here to keep syncing". Empty body, no button. | Chip **⚠ Update**, a plainer sentence, and a **Check for updates…** button (the note after Sync now has it too). |
| A computer not seen for 20 days | Only "Old laptop (Windows) last synced 20 d ago" in the head line. | "Old laptop hasn't synced for 20 days. If it's gone for good, forget it in Your computers, so the others stop waiting for it." plus **Your computers…**, which opens Settings with that fold open. |
| A forgotten computer | Gone from the panel. | Same (checked: forgotten by clicks, then gone). |
| Many deletions waiting | Chip **⚠ Look** / "42 deletions wait for your yes", with Review them by name…. | Chip **⚠ Review**. |
| Paused | ‖ Paused. Empty body; resuming meant ⋯ → Resume sync. | "Paused: changes stay on this computer until you resume." plus a **Resume sync** button. |
| First-time setup | When a cloud drive is found, the hint printed the full folder path and said "**Engine paths** and window sizes stay per computer". | "…copies changes to a “Hearth” folder in iCloud Drive, and back. Each computer keeps its own AI programs and window sizes." The path is shown on hover. With no drive found, the wording was already plain. |

In every state the panel now ends with **Details** (folded) and **Copy details for Claude**. They hold the cloud folder,
the state and its code, the computers and their formats, the last problem word for word, each file that can't sync or
waits (path and reason code), the big files' bytes, what is kept aside, pieces and the last look. The main text has
none of these: the check rejects paths, ids, ".json", "manifest", "base" and error codes in it, in every state.

The check saves a picture of the cloud-folder-missing state in its own run folder (`sp92-missing.png`, removed with the
run) and a final one in the `--out` folder (`syncpanel92.png`).

## Found and fixed outside the words

- **The panel's redraw signature had half its fields inside a `//` comment** (sync-panel.js, round 74 edit). Five fields
  were never compared: the deletions held, the cloud-only count, the conflicts' ids, the "settled by itself" note and
  the minute. So a conflict replaced by another one with the same count, or "checked 2 min ago", didn't redraw until
  something else changed. Fixed by moving the comment. The signature now also includes the skipped big videos, the
  Sync big videos setting, each computer's last-seen day and the format a newer Hearth needs.
- **The chip's colour** for a sync that stopped by itself (folder missing / emptied, this Hearth too old) was grey, like
  "offline". It now uses the attention colour, as "to fix" does. A read failure of this computer's own records is grey
  ("waiting").
- The **⋯ menu's first line** fell back to a fixed word table ("Offline · iCloud Drive") when the line was long. It now
  uses the same short line as the title, so it says "The cloud folder isn't there · paused".

## Found, not fixed (for later)

- **sync72's "nothing polls while the panel is open" step tests nothing.** It replaces `window.hub.sync.status`, and
  that object is read-only (contextBridge), so the assignment silently does nothing. The step can't see a poll. Steps
  to see it: in `dev/checks/sync72.js`, step 2, log `api.status === orig.status` after the assignment; it prints
  `true`. The fix: count the calls through the new `Sync._setApi` / `SyncPanel._setApi` seam, as `syncpanel92.js` does.
- **First run (firstrun-core.js)** marks the sync row "to fix" only for an error or a missing folder. An emptied folder
  or a too-old Hearth shows "ok" there, with the right sentence but no "to fix" mark. A one-line change, in
  firstrun-core.js; not in this round's files.

## Files

- `sync.js` (first screen, +2 KB of code: 1743 / 1751 KB):
  - `line()`: a fault is never "Everything is synced"; an error is "couldn't finish"; the paused wording.
  - `offlineLine()`: the read failure.
  - The chip and its colour, `shortLine()`.
  - `nameOf()`: no chat ids; Lab files by name.
  - The ⋯ menu's first line.
  - The old-version note gets **Check for updates…**.
  - The setup hint without the path.
  - The `_setApi` seam for checks.
- `sync-panel.js` (lazy, `syncpanel`): `stateSec` (what to do when sync stopped by itself, with its button), `peersSec`
  (a quiet computer → Your computers…), `detailsSec` (Details and Copy details for Claude), the placeholder and Lab file
  words, Sync big videos, the older-version line, the signature fix and `_setApi`.
- `sync-panel.css`: the state and Details styles.
- `sync-conflicts.js` (lazy, `syncconflicts`): Deleted files in plain words; Restore errors calm.
- `dev/checks/syncpanel92.js`: new. It runs in the `sync` group and has its own `syncpanel92` group in
  `dev/run-checks.js`.
- `dev/checks/sync72.js`: an arriving chat that isn't here yet is now "A chat", not its id; the step accepts that.
- `dev/checks/errorcalm.js`: the folder-gone note's button is now "Start the cloud copy again from here", the same as
  the panel; the step accepts that name.
- `dev/checks/synchard74.js`, `dev/checks/sync-switch-safety.js`: their exact-wording steps follow the new words
  ("…is an older version. Update it there…"; "the version before the last change from your other computer").

## Runs

All of these passed:

- **App checks**: `syncpanel92` (three runs in a row), `sync72`, `devices90`, `packs89`, `labsync88`, `errorcalm`,
  `lazy`, `sync`, `synchard74`, `syncmedia73`, `sync-switch-safety`, `guardloss78`.
- **Unit tests and scans**: `unit:sync72-test`, `unit:devices90-test`, `unit:packs89-test`, `unit:twocomputers-test`,
  `unit:datasafe-scan`, `unit:winmac-test`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`,
  `unit:boot-test`, `unit:lazymanifest-test`.

## For Codex

Nothing. No Codex-owned file was changed: not `sync-engine.js`, not `cloud-files.js`, nor any other.

## For the patch notes

- **The sync panel now says what's going on, and what to do.** When sync stops by itself, the panel says why in one
  sentence and puts the fix right there:
  - **Start the cloud copy again from here** or **Pick the folder again…** when the cloud folder moved or was emptied.
  - **Check for updates…** when this Hearth is too old.
  - **Resume sync** when it's paused.
  - **Sync big videos** when big videos stay on one computer.
- **The little sync label in the sidebar matches the panel.** It shows "⚠ Folder", "⚠ Update", "⚠ Problem" or
  "⚠ Review" instead of "Offline" or "Look" when something needs you.
- **"Everything is synced" now means everything.** If a file can't sync or a conflict is waiting, the tooltip,
  Settings and the Sync now note say "Synced, but 2 files can't sync".
- **A computer you haven't used for a while** shows up in the panel with a **Your computers…** button, so you can
  forget it if it's gone for good.
- **Deleted files** shows names and "deleted yesterday", not folder paths.
- **The technical details** (folders, codes) are folded away under **Details**, with a **Copy details for Claude**
  button for when something needs looking at.
