# Rounds 41–45 on a real Mac and a real Windows PC (round 46, platform46)

Nothing built in rounds 41–45 (routines, renderfast, undoall, handoff, filewatch, notify, sendpreview, errorcalm,
localanswers, backupauto, powerwise' new users…) had run on the owner's Mac or Windows PC. This stream read every part
of them that touches the system, fixed what would break there, and left simulated-platform tests and scan rules so it
stays fixed. Nothing new on screen, no new setting, nothing added to any prompt or message (0 tokens).

New files: `zipkit.js` (zips in plain Node, main process), `dev/platform46-test.js` (in UNIT, 35 checks).
Edited: `backupautomain.js`, `backupauto-core.js`, `fsapi.js` (zip / restore), `datasafemain.js` + `scenesafemain.js`
(Recover's unzip), `capturemain.js` (trash), `filewatch-core.js`, `filewatchmain.js`, `filewatch.js`, `aiundo.js`
(path matching), `errorcalm-core.js`, `renderfastmain.js`, `winmac.js` (`sameFile`, `keyWords`), `localanswers.js`,
`tools/three-kinetic.js` (one line), `dev/winmac-scan.js` (+3 rules), `dev/winmac-test.js`, `dev/filewatch-test.js`.

## What was found and fixed

| # | Would break on | What | Fix |
|---|---|---|---|
| P1 | **Mac** (every backup) | Backups were zipped with the system `tar`. On a recent macOS most files an app writes carry extended attributes, and the Mac's tar adds a `._name` AppleDouble file for each: the backup's check read `data/kv/._notes.json` as a damaged store, so **every automatic backup could be marked bad** and retried forever | `zipkit.js`: zips written and read with Node's zlib, the same on every computer; `._*`, `.DS_Store`, `Thumbs.db`, `desktop.ini` and iCloud placeholders never enter a backup |
| P2 | **Windows** (accents) | Windows' `tar.exe` writes names in the PC's old code page: a file with an accent / emoji in the data folder came back as `?` (or stopped the zip); it also fails past 260 characters | zipkit: UTF-8 names (flag 11), NFC, long paths through Node |
| P3 | Both | Backups depended on a tool being there and allowed (old / locked-down Windows; Linux needed zip / unzip) | no outside tool: zipkit only (Zip64 for very big zips; CRC of every file checked on read-back; a damaged file is named: "data/kv/notes.json doesn't read back the same") |
| P4 | Both | The other zips used the same tools: "Pack Hearth for a Mac…", board exports, Forge builds, restores, 🛟 Recover | `fsapi.zip` writes with zipkit; restore (`fsapi.unzipTo`), datasafe and scenesafe Recover read with zipkit first (the system tool stays the fallback for another program's zip); Recover takes every file that reads and leaves only a damaged one out |
| P5 | **Windows** (data loss) | Backup rotation called `shell.trashItem` directly: a backup folder on a network share or a USB stick has no Recycle Bin, so Windows would have **deleted old backups for good** | rotation asks WinPolish / MacPolish.trashCheck first; no bin → the zip stays |
| P6 | **Mac** (iCloud) | iCloud Drive on an older macOS swaps offloaded files for `.name.icloud`: the rotation took an offloaded card / big media file for a stray one and **deleted the media a backup still needed**; the check called an offloaded media file missing (a bad backup) | placeholders count as present; nothing in the media store is tidied while any card is offloaded; an offloaded media file isn't copied again |
| P7 | Both | Cloud-drive failures read as "Something went wrong: UNKNOWN…" (OneDrive paused / signed out: Windows' unmapped code; iCloud offline: EDEADLK); a path over 260 characters; too many open files | plain words with the fix (Retry once it runs / a folder only on this computer / a shorter folder) |
| P8 | **Mac** | "Inside the data folder?" compared Mac paths exactly; APFS ignores case and a typed accent can be NFD or NFC | the Mac compares without case, one Unicode form (as Windows already did without case) |
| P9 | **Mac** (filewatch) | FSEvents names files **decomposed** (NFD) while the window names them composed (NFC): a song / reference with an accent (`Músique.wav`) was **never noticed** when changed in another app; case also mattered | `keyOf` on the Mac: NFC + no case; the watcher composes names as they arrive; the window's and undo's path matching use `WinMac.sameFile` |
| P10 | **Windows** (errors) | "EPERM … rename" (an antivirus / OneDrive holding the file a moment) said "not allowed… blocked by privacy settings" (the Mac's words) | Windows: "held by another program — try again in a moment" + Retry |
| P11 | Both | Permission errors named no place to fix them | Windows: read-only or Windows Security's "Controlled folder access"; the Mac: System Settings › Privacy & Security › Files and Folders |
| P12 | Both | Online-only files (OneDrive Files On-Demand, iCloud "Optimise Storage") failing to download read as an unknown error | "“song.wav” is kept online by OneDrive / iCloud Drive, which couldn't download it right now" + Retry |
| P13 | **Windows** (renders) | Render fast (streamed encoding): an ffmpeg set as a `.cmd` / `.bat` (or blocked) makes `spawn` throw `EINVAL` / `EPERM` at once, which escaped as an exception the export never heard about | answered as "couldn't be started (…)" so the export says why; a half-written video's cleanup retries while an antivirus holds it |
| P14 | **Windows** (data loss) | Capture's "move to Trash" (recordings) and its WebM clean-up also called `trashItem` directly | the same bin check (no bin → left, said why) |
| P15 | **Mac** (labels) | Local answers (💡) said "Ctrl/⌘+K"; toasts turned it into "Ctrl/⌘K" | `WinMac.keyWords`: ⌘K on the Mac, Ctrl+K on Windows; `macKeys` collapses "Ctrl/⌘+" to ⌘ |
| P16 | **Windows** | A kinetic-type clip's name from text saved by a Windows editor kept a trailing `\r` (found by the existing `crlf` scan rule, which was failing) | split on `\r?\n` |

Reviewed and fine as they are (no change):

| Area | What was checked |
|---|---|
| notify | `app.setAppUserModelId('Hearth')` + the Start-menu shortcut with that id (made / updated on the first notification, never a desktop one); clicks restore + focus (the Mac: `app.focus({ steal })`); Focus / Do Not Disturb respected; the Mac asks for permission once by itself. |
| powerwise | battery / AC from `powerMonitor` (both), idle time from `getSystemIdleTime` (both), Mac Low Power Mode from `/usr/bin/pmset` (on a Dock launch's PATH), Windows battery saver from `GetSystemPowerStatus` through PowerShell (8 s cap, fails quiet under a locked-down PowerShell). |
| routines, handoff, sendpreview | no paths, programs or keys that differ (handoff's file finder already takes `C:\` and `\` paths). |
| undoall | ⌘Z on the Mac / Ctrl+Z and Ctrl+Y on Windows, by key code (an ⌥ letter on the Mac is a different character). |
| backups' places | Documents via `app.getPath('documents')` (OneDrive-moved Documents on Windows, iCloud "Desktop & Documents" on the Mac); OneDrive / iCloud offers from sync's detector; per-computer state in `data/.backup`. |
| renderfast paths | output paths with spaces / accents go to ffmpeg as one argument (no shell); below-normal priority works on both. |

Left as they are (noted):
- `importer.js` (claude.ai / ChatGPT export import) still reads zips with the system tool (other programs' zips, once).
- Windows: a watched folder (the Lab's song folder) may make Explorer refuse to rename its **parent** folder while Hearth runs (how Windows' directory watches work; VS Code has the same).
- The Mac's host name can change with the network on some setups; backups recognise the computer by sync's id once sync has made one (and remember the last six names).

## Upgrades
### Backups that work on both computers
1. Backups no longer need any zip tool: written and read the same way on the Mac, Windows and Linux.
2. The Mac: backups no longer fail their check because of hidden `._` files.
3. Windows: files with accents or emoji in their names come back with the same name.
4. Windows: deep folders (paths over 260 characters) back up.
5. Every file in a backup is checked when it's read back; a damaged one is named.
6. Very big backups (over 4 GB or 65,535 files) are written in the Zip64 form every tool reads.
7. The Mac's / Windows' own litter (`.DS_Store`, `Thumbs.db`, `desktop.ini`) stays out of backups.
8. Windows: old backups on a network share or USB stick are never deleted for good by the rotation.
9. The Mac: iCloud-offloaded backups keep their big media files and their cards.
10. The Mac: an offloaded big media file doesn't count as missing (the backup stays good) and isn't copied again.
11. A cloud drive that couldn't hand over a file: said in plain words, with Retry.
12. Windows: a path too long: said, with "choose a shorter folder".
13. The Mac: a backup folder typed with other capitals / accents is still recognised as inside the data folder (refused).
### Zips elsewhere
14. "Pack Hearth for a Mac…" (Settings) keep accented names and scripts' "run me" bit.
15. Board and Forge zips: the same.
16. Restoring a backup reads it the same way on both computers (the system tool only for another program's zip).
17. 🛟 Recover takes every file of a backup that reads, leaving only a damaged one out.
### Files changed outside Hearth
18. The Mac: songs, videos and references with accents in their names are noticed when another app changes them.
19. The Mac: a file named with other capitals is still the same file.
20. The Mac: one folder named two ways is watched once.
21. AI changes' undo notices outside edits on the Mac by the same rule.
### Errors in plain words
22. Windows: a file held a moment by an antivirus or OneDrive says so (Retry), not "not allowed".
23. Windows: "not allowed" names Controlled folder access.
24. The Mac: "not allowed" names System Settings › Privacy & Security › Files and Folders.
25. Online-only files (OneDrive, iCloud) that couldn't download say so, naming the drive.
### Renders and recordings
26. Windows: an ffmpeg that can't be started (a `.cmd`) says so instead of the export hanging on an error.
27. Windows: a cancelled render's half-written video is cleaned up even when an antivirus holds it a moment.
28. Recordings moved to the Trash from a network share / USB stick are left (said why), never deleted for good.
### Keys
29. 💡 Local answers say ⌘K on the Mac and Ctrl+K on Windows.
30. Toasts that say "Ctrl/⌘+…" read ⌘… on the Mac.
31. Kinetic-type clip names from text written on Windows no longer end in an invisible character.
### Kept fixed
32. `node dev/winmac-scan.js`: 3 new rules — `zip-tool` (zips through an outside tool), `trash-direct` (Trash without the bin check), `case-win-only` (paths folded on Windows but not the Mac) — all at 0, enforced by `dev/winmac-test.js` (609 checks, plants each).
33. `node dev/platform46-test.js` (in UNIT, 35 checks): zipkit, backups with Mac / Windows litter and iCloud placeholders, the no-bin rotation, words per computer, FSEvents NFD names, a `.cmd` ffmpeg.

33 upgrades.

## Tested
- Unit: `unit:winmac-test` (609), `unit:winpolish-test`, `unit:macpolish-test`, `unit:backupauto-test` (107), `unit:platform46-test` (35), `unit:filewatch-test` (127, its Mac case expectation updated), `unit:errorcalm-test` (313), `unit:errorcalm-scan`, `unit:datasafe-test`, `unit:scenesafe-test`, `unit:renderfast-test`, `unit:boot-test`: all pass.
- Smoke: `sh dev/run-checks.sh backupauto notify filewatch errorcalm lazy` (18 checks): 17/18 on a loaded machine, then 18/18 on the re-run.
- zipkit by hand: a 70,000-file zip (Zip64) read back by zipkit and Python's zipfile; zipkit zips pass `unzip -t`; a Linux `zip` archive reads with zipkit.
- Not possible here: a real Mac and a real Windows PC — see the list below.

## For the patch notes
- Automatic backups now work the same on your Mac and your Windows PC: no zip tool needed, and the Mac's hidden "._" files no longer make a good backup look damaged.
- Windows: files with accents or emoji keep their names in backups and packs.
- Old backups on a network drive or USB stick are never deleted for good when the rotation tidies up (Windows has no Recycle Bin there); recordings the same.
- iCloud Drive: backups whose files iCloud moved online keep their big media files.
- Recover and restore read every backup the same way on both computers, and take every file that's readable.
- On the Mac, songs and references with accents in their names are noticed when you change them in another app.
- Errors about files speak your computer's language: OneDrive / iCloud files that couldn't download, Windows' "held by another program", Controlled folder access, the Mac's Privacy & Security.
- Windows: a render whose ffmpeg can't start says so instead of stalling.
- 💡 answers show ⌘K on the Mac and Ctrl+K on Windows.
- Caveat: none of this has run on your machines yet — the 10 quick checks below are what to try.

### What still needs your machines (what to try)
1. **Mac — a backup.** Settings › This computer & sync › Backups… › Back up now. If macOS asks "Hearth would like to access files in your Documents folder", click OK. The row should turn ✓ (not ⚠ "damaged").
2. **Mac — accents.** In the Lab, load a song whose name has an accent (e.g. "Été.mp3"); open it in another app, change and save it; Hearth should say it updated from disk within a few seconds.
3. **Mac — iCloud.** Only if backups go to iCloud Drive: after a few backups, right-click the "Hearth backups" folder in Finder › Remove Download, then Back up now; the older backups should stay ✓ in the list.
4. **Mac — notifications.** Ask a chat something slow, switch to another app; a notification should appear (allow it the first time macOS asks); click it: Hearth comes forward on that chat.
5. **Mac — ⌘Z.** Change a setting, click on an empty part of the window, press ⌘Z: the setting goes back.
6. **Windows — a backup.** Settings › This computer & sync › Backups… › Back up now. If Windows Security says it blocked an app ("Controlled folder access"), allow Hearth there or pick another folder; the row should turn ✓.
7. **Windows — accents.** Copy any small file named with an accent (e.g. "Été.txt") into Hearth's `data\attachments` folder, Back up now, then open the new zip in File Explorer: the name should read "Été.txt", not "?t?.txt".
8. **Windows — notifications.** Settings › Create Start menu & desktop shortcuts once; ask a chat something slow, switch to another app: a toast titled Hearth should appear; click it to come back to that chat. (The very first one after the shortcut is made may not show.)
9. **Windows — OneDrive.** If the data or backup folder is in OneDrive: pause OneDrive, Back up now — the message should name OneDrive and offer Retry; resume it and Retry.
10. **Windows — a render.** Render a short Lab clip (⇪ Render): it should finish and play; if Settings has ffmpeg set to a `.cmd`, it should say ffmpeg couldn't be started.
