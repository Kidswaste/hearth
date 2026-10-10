# Sync (round 10): your Mac and your PC share one Hearth, through the cloud drive you already use

You asked: "make everything in the app run on the cloud so I can access it from everywhere, and sync it with local
storage for the times I wouldn't have access to the internet", and chose to sync through a cloud drive folder you
already use (iCloud Drive, Google Drive, Dropbox or OneDrive). Hearth still runs from its own folder on each computer
(fast, works offline); a sync engine copies what changed to `<your drive>/Hearth/` and back, merges what both
computers changed, and keeps both versions when something really was changed two ways. On screen: one small dot at
the bottom of the rail (only while sync is on) and one line in Settings. Everything else is in the dot's menu and `/sync`.

## Turning it on
1. **Sync through a cloud drive folder you already use**: Hearth makes a `Hearth` folder in it (`files/` mirror, `trash/`, a hidden `.sync/` for the journal) and keeps it in step with your data folder.
2. **Finds your drives on the Mac**: iCloud Drive, Google Drive (each signed-in account, "My Drive" in any language), Dropbox (also a custom location from Dropbox's own info file) and OneDrive (personal and work).
3. **Finds your drives on Windows**: iCloudDrive, Google Drive's drive letter (G: or any other), Dropbox (custom location too), %OneDrive% (personal and work).
4. **Proposes the obvious one, one click**: a drive that already holds a Hearth first, else Dropbox, Google Drive, OneDrive, iCloud. `/sync` or Settings → Sync → **Turn on sync**.
5. **"Use this Hearth" on the second computer**: the setup sees the Hearth already in the drive (which computer, when) and joins it; the first pass merges both sides, nothing is overwritten.
6. **A one-time offer on the second computer**: when a drive there already holds a Hearth and sync is off, a quiet notice offers "Use this Hearth".
7. **Other drive or any folder** (setup's "Other drive…" / "Choose a folder…", `/sync on <folder>`).
8. **Refuses to run your live data inside a cloud drive** and says why (cloud clients lock and half-download files).
9. **Settings → Sync**: one line saying where things stand and one button (Turn on sync… / Sync now), ⋯ for the rest.
10. **Turn off** keeps everything: this computer's data and the cloud copy stay as they are; turning on again picks up from there.

## The dot and its menu
11. **A calm status dot** at the bottom of the rail: green synced, blue breathing while syncing, a hollow ring offline, orange for a conflict or something waiting for you, a dash when paused. Its tooltip says it in words.
12. **A small gold mark on the dot** when tool data arrived that the open window still holds older (with "Reload to see changes from <computer>").
13. **Click or right-click the dot**: Sync now, Conflicts…, Download the files only in the cloud, Pause / Resume, Open the cloud folder (Show in Finder on a Mac), Sync big videos, and under More: Deleted files…, Other drive or folder…, Turn sync off.
14. **Conflicts view**: each one named (chat title, "Lab scenes", "Settings"…), when, from which computer, the fields with both values; **Keep this one** or **Use the other one**.
15. **Deleted files view** (the synced trash, 30 days): from either computer, filter, **Restore**.
16. **Many deletions at once wait for a yes** (an emptied folder, the wrong drive): "Delete those N files (to the trash)" or "Keep them (bring them back)".
17. **The cloud Hearth folder deleted by hand**: nothing here is touched; "Start the cloud copy again from this computer".
18. **Sync big videos**, one switch (Settings and the menu): on, captures and renders of any size sync in resumable pieces; off, files over 100 MB stay on each computer (listed, never deleted).
19. **Download the files only in the cloud** on demand (big videos your drive keeps online-only are never downloaded behind your back).
20. **Chats that arrive show at once**: the chat list and an open chat refresh in place (not mid-reply), no reload.
21. **Settings, agents and theme.css that arrive apply live** (they hot-reload).
22. **Other tool data that arrives**: one calm notice naming it, with Reload; meanwhile your saves are merged with it, never undoing it.

## Chat commands (no tokens)
23. `/sync`: turns it on (setup) when off, says where things stand when on.
24. `/sync status`: "Everything is synced with Dropbox (checked 1 min ago)", what's on the way, conflicts, big videos kept here, and when your other computers last synced. Plain words also find it ("is everything synced").
25. `/sync now`.
26. `/sync on [folder]`.
27. `/sync pause`, `/sync resume`.
28. `/sync conflicts`.
29. `/sync trash` and `/sync restore <name>` (a chat title, a file name).
30. `/sync open` (the cloud folder).
31. `/sync big on|off`.
32. `/sync download` (the files only in the cloud).
33. `/sync off`, `/sync menu`.
34. **Ctrl/⌘+K**: Sync now, Sync: turn on / choose a drive…, Sync: conflicts…, Sync: deleted files….
35. **Keys sheet** lists the dot's right-click.
36. **The app map knows sync** (topic `sync`, read only when an engine asks: nothing added to any prompt).

## What syncs
37. **Everything in the data folder that is yours**: chats (and the chat trash), Lab scenes and sketches, sequences, mood boards and their media, video projects and edits, notes, memory, prompts, references, attachments, tool data.
38. **Portable settings**: agents, the look, theme.css and the rest of your settings travel; engine paths, folders, the hotkey, startup / tray, window layout and sync's own choice of drive stay on each computer.
39. **Captures and recordings** (the frame reader's picture cache stays local).
40. **Renders saved outside the data folder** (Video Review exports and Lab recordings in your library) go up too and arrive in `data/renders` on the other computer, with the library pointing at them there.
41. **This computer's own files never sync**: engine sessions, logs, the window's place, MCP run files, installs found, the sync state itself.

## Correct, even when both computers work at once
42. **Three-way merge** for every JSON store, with the last version both computers had.
43. **Chats**: messages written on both computers all stay, in time order.
44. **Scenes, boards, settings**: merged field by field; lists with ids (sketches, layers, board items, agents) merge item by item.
45. **Counters add up** (token usage, button usage): both computers' counts kept.
46. **Times take the latest** (updatedAt, lastSeen…).
47. **A true conflict** (one field changed two ways): the same version on both computers, the other kept whole as a conflict copy with a note in the dot and the conflicts view.
48. **Whole files changed on both** (theme.css, a note, a picture): yours in place, theirs kept as a copy (moved inside the drive: nothing downloads).
49. **Your cloud client's own conflict copies** (Dropbox "conflicted copy", iCloud "x 2", Google Drive "x (1)", OneDrive "x-PCNAME") are merged back into the store, then trashed.
50. **A change journal per computer** with content hashes (and a computer id), so a file's version is known without reading it.
51. **Atomic writes on both sides** (a temp file, then a rename checked at the last moment: a file written meanwhile is never overwritten).
52. **A file the other computer is still bringing down waits** (size checked against its journal; a late journal can't hold a file more than a minute), and so does a half-written store.
53. **Cloud clients' files are ignored**: .icloud stubs, ~$ lock files, .tmp / .part / .crdownload, desktop.ini, .DS_Store, Thumbs.db, Google Docs links (.gdoc…), office lock files.
54. **Online-only files respected**: an iCloud "evicted" file is not a deletion; Mac "dataless" files are detected; small ones (stores, notes, pictures) are fetched, iCloud is asked to bring its stubs; big videos only when you ask.
55. **Deletions go to a synced trash** (30 days), and the other computer moves its copy to its own trash (`data/sync/trash`), never a hard delete.
56. **A delete never wins over an edit made meanwhile** on the other computer: the edited file comes back.
57. **Renames and moves** are moves in the cloud too: a big recording moved to another folder isn't uploaded again.
58. **A missing or unplugged drive never empties this computer** (offline instead).
59. **Paths work on both computers**: paths into the data folder, the cloud drive and your home folder are stored relative (file:/// links too), so a PC attachment opens on the Mac and the other way round.
60. **Old paths from the other computer are fixed on arrival** (like after "Pack Hearth for a Mac").
61. **Your saves can't undo what just arrived**: when the app saves an older version it still had in memory, it is merged with the arrival first.
62. **Big files copy in resumable pieces**: a copy cut by a quit, a crash or the drive going away goes on from where it stopped.
63. **Crash-safe**: each file is done or not done; the next start finishes the job.
64. **Accented file names** match between the Mac and Windows (Unicode forms).
65. **Windows**: a rename over a file your cloud client or antivirus holds for a moment is retried.
66. **Leftovers swept**: temp files of a crash (after a day) and pieces of copies whose source is gone (after a week).

## Light
67. **Watches both folders** and syncs a moment after things go quiet (2.5 s here, 4 s from the drive, at most every 20 s while busy), plus a calm check every minute (a drive coming back is noticed).
68. **Hashes only what changed** (size + time remembered); big files streamed.
69. **Runs in the background of the main process**, nothing in the window; no tokens, ever.
70. **At start, what the other computer did arrives before the window reads it** (up to 1.5 s, then it carries on in the background).
71. **Offline is normal**, not an error: the dot turns to a hollow ring, everything keeps working, changes go up when the drive is back.
72. **Pause survives a restart**.
73. **A README in the cloud Hearth folder** says what it is and not to edit it by hand.

## Tested here
`node dev/sync-test.js` (100 checks, no Electron): two computers with two data folders and one shared "cloud" folder in a
temp dir — edits on both sides, concurrent edits and merges, conflicts and resolving them, deletes + restore, a delete
against an edit, renames, a 9 MB and a 12 MB file in pieces, big videos off, cloud temp files, an iCloud stub, a
half-arrived file and a half-written store, a Dropbox conflicted copy, offline then back, the cloud folder deleted,
mass deletions held, the write guard, portable config, Mac ⇄ Windows path forms (Windows paths simulated), drives found
on a simulated Mac and PC, a crash mid-push and a big copy cut mid-way (resumed), both computers syncing at the same
moment, a third computer joining, and a randomized run (two computers, ~500 random edits, passes sometimes at the same
time, sometimes during edits): both end identical and no message is lost (8 seeds). `dev/checks/sync.js` (smoke, 26
steps): turn on, the dot, Settings, arrivals, a conflict and "Use the other one", the menu, pause, deleted files,
`/sync status`, joining an existing Hearth.

Not verified here (nothing could run them): the real iCloud Drive, Google Drive, Dropbox and OneDrive clients (their
timing, placeholders and conflict copies are simulated from their documented behaviour), OneDrive's online-only files
on Windows (Node can't see that attribute, so reading one downloads it), `brctl download` on a real Mac, and
`fs.watch` on a cloud drive mount (the minute check covers a drive that sends no events).
