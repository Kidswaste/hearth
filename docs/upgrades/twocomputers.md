# Two computers, seamless (round 35, twocomputers)

The owner uses Hearth on a Mac and on a Windows PC, synced through a cloud drive. Sync already carried chats, scenes and
settings, with paths inside the data folder / home folder / cloud drive rewritten for each computer. What still broke on a
switch: things that only make sense on one computer. This stream makes each computer keep its own (folders, engines,
sign-ins, Chrome, OBS, the Windows-only "no sandbox" opt-in), carries the owner's *choices* in a portable form, maps them on
load where the same place exists, and asks with one click where it doesn't. Nothing is ever guessed by name, and nothing
is sent to any AI (0 tokens).

New files: `twocomputers-core.js` (pure, window + Node: portable forms, foreign paths, an AI's folders per computer,
media relink, the welcome list), `twocomputersmain.js` (main, lazy IPC `two:*`: machine id / name, quick hash, relink in
real folders, "Find this file" links), `twocomputers.js` + `twocomputers.css` (renderer, lazy group `twocomputers`, right after the first screen), `dev/twocomputers-test.js`
(in UNIT), `dev/checks/twocomputers.js` (smoke).

## What was wrong, what changed

| # | Problem on a switch | Fix | Where |
|---|---|---|---|
| T1 | **An AI's folders were wiped on every arrival**: the portable config drops absolute paths, and `applyPortable` then wrote the empty list over this computer's own (the Mac's folders gone after the PC synced) | lists holding this computer's own paths keep them | `sync-merge.js` `applyPortable` |
| T2 | **Astra's "Run commands without its sandbox"** (a warned Windows opt-in) synced to the Mac and ran Codex with `danger-full-access` there | per-computer field, never travels | `sync-merge.js` `MACHINE_FIELD` |
| T3 | `data/chrome-prefs.json` (which browser, Chrome shown) and `data/interop/obs.json` (OBS address + keychain-sealed password the other computer can't open) synced | this computer's own | `sync-merge.js` `LOCAL_FILES` |
| T4 | **Grant leak on Windows**: a Mac folder left in a chat ("/Users/x/proj") counted in Hearth's permission check, so a write to "/Users/x/proj/a.txt" (= `C:\Users\x\proj\a.txt` on Windows) was allowed silently; `engines.js` could pass it as `--add-dir` / a Codex writable root when `C:\Users\x\proj` existed; `reachmain.localize` used it as is | the other computer's way of writing a path is never used as it is: mapped (home / data / cloud), else dropped | `access.js` `hereOnly`, `engines.js` `accessOf`, `reachmain.js` `localize`, `TwoCore.foreign` |
| T5 | The other computer's folders vanished on the new one (stripped) with no way to know | each computer writes `agent.fileAccess.computers[<machine id>] = { os, name, folders: [{ name, rel, on }] }` (portable, no absolute path); the other maps on load | `twocomputers-core.js` `recordHere` / `pendingHere` |
| T6 | iCloud Drive sits in `~/Library/Mobile Documents/com~apple~CloudDocs` on the Mac and `C:\Users\…\iCloudDrive` on the PC: home-relative mapping missed it | drive-relative forms (`@icloud/…`, `@dropbox/…`, `@gdrive/…`, `@onedrive/…`) from the drives found on each computer | `toPortable` / `fromPortable` |
| T7 | A Lab song from the other computer: silent failure (`quiet` load) | found again by its place, else by content (quick hash + size, also renamed), else a calm "Find this file" | `tools/three-media.js` `load`, `TwoComputers.relink`, `twocomputersmain.js` |
| T8 | Beat grids / cues are keyed by the song's path | copied to the new path; every scene using the song follows | `three-media.js` `copyMap`, `tools/three.js` `relink` |

## Upgrades
### This computer
1. **"This computer: Mac (Quentin's MacBook Pro)" / "Windows PC (QUENT-PC)"** in Settings → Sync.
2. The same line at the top of the sync dot's menu (also when sync is off).
3. `/sync status` starts with it.
4. A stable id per computer (sync's own `data/sync/machine.json`, made even before sync is turned on) and the Mac's friendly name (System Settings → About).
### Folders your AIs use
5. **Fixed: an AI's folders on this computer are no longer wiped when settings arrive from the other computer.**
6. A folder the AI uses on the other computer that exists at the same place here (inside the home folder, a cloud drive or Hearth's data) is used here too, with one quiet line saying so.
7. **"Pick this folder on this computer"** in ⋯ AI setup → Files on this computer, for each folder that has no match here (another disk, a drive this computer doesn't have): one click, nothing granted until you pick.
8. ✕ "Not on this computer" next to it: it stays on the other computer only.
9. The other computer's *whole home folder* is never mapped by itself: "Use it here too…" shows the same warning first.
10. A folder you take out here stays out (it isn't mapped back the next time settings arrive); adding it again clears that.
11. iCloud Drive / Dropbox / Google Drive / OneDrive folders match between the Mac and the PC even though they live in different places.
12. The row says where it was on the other computer in plain words ("the D: drive", "~/Projects/site", "iCloud Drive/Notes"), never a path from that computer.
### Never the wrong folder
13. A path written the other computer's way is never handed to Claude or Astra as a folder (no `C:\Volumes\…` by accident).
14. Hearth's own permission check ignores such paths: a write there asks instead of passing silently.
15. Paths from the other computer opened from a chat are mapped (home / data / cloud) or reported missing, never used as they are.
### Engines and sign-ins stay on each computer
16. Astra's "Run commands without its sandbox" (Windows) never reaches the Mac.
17. Hearth's Chrome choices (which browser, shown or not) stay on each computer (its profile already did).
18. OBS' address and saved password stay on each computer.
19. (Kept, now tested across two computers) engine paths, Settings → Engines, engine installs, connector lists, the Chrome profile, sign-ins.
### The welcome note
20. **Once per computer, after the first sync on a new computer**: "Welcome to this computer" with what needs a click.
21. Its **Check Claude / Check Astra** buttons run Check this AI here (engines and sign-ins are this computer's own).
22. Its **Pick folders…** opens ⋯ AI setup on the AI that needs it.
23. "What needs a click on this computer…" in the sync dot's menu brings it back while something is left.
24. `/this-computer` (and `/computers`) says which computer this is and what needs a click; `/this-computer welcome` shows the note again.
25. Ctrl/⌘+K: "This computer: what needs a click here".
### Songs and videos in Lab scenes
26. A song / video from the other computer is found by its place relative to the home folder or a cloud drive.
27. …else by its content (a quick hash of its ends + its size) in Music, Movies / Videos, Downloads, Desktop, Documents, Pictures, the cloud drives and Hearth's media folders, also when it was renamed.
28. A name alone is never enough: a same-named file with other content is not taken.
29. **"Find this file"** on a calm note when it isn't anywhere (once per file per session).
30. A file you pick is remembered on this computer only (the other one keeps its own).
31. "Find this file" says so when the picked file's content differs from the one the scene used (use it anyway, or not).
32. The song's beat grid, markers and cues follow it to its path here; every scene using it follows.
33. 🩺 Fix my scene lists a file that isn't on this computer with the same **Find this file** button.
34. The app map (topic `sync`, read only when an engine asks) knows each computer keeps its own folders, engines and sign-ins.

34 upgrades.

## Tested
- `node dev/twocomputers-test.js` (in UNIT, 117 checks, no Electron): a Mac (path.posix, /Users/quent, iCloud in Mobile
  Documents, Dropbox in CloudStorage) and a Windows PC (path.win32, C:\Users\quent, iCloudDrive, Dropbox) with two machine
  ids: labels; foreign paths (C:\, UNC, /Users, file:// both ways); portable forms both ways (case on Windows, exact on the
  Mac, Finder's accents, data before home, never climbing out of a root, a drive this computer hasn't); the PC's folders
  recorded with no absolute path, unchanged → no rewrite; the PC's config through `portableConfig` / `applyPortable` onto
  the Mac (engine paths, the no-sandbox opt-in, folder matches stay; the Mac's own folders kept; no PC path on the Mac);
  mapping (same / missing / ask, never a PC path, nothing found → nothing granted), Pick → matched, removal → stays out,
  ✕, re-add clears; both records merging with `merge3`; the PC mapping back; **the grant leak** (before: a foreign folder
  let a write through; after: it asks) and `reachmain.localize`; local-only files; **the real sync engine with one shared
  folder** (two data folders, a Mac and a Windows engine): engine paths, folders, the opt-in, Chrome prefs, OBS, media
  links and the Chrome profile stay; the folders record and media ids (portable form untouched) arrive; media relink on a
  simulated PC (here, home-relative, iCloud-relative, renamed by content, same name elsewhere, other content refused,
  name alone refused, not found, remembered by hash / by path, a PC path never opened on the Mac); the welcome list;
  `twocomputersmain.js` on real files (quick hash reads only the ends, relink in Music, the link remembered, the next
  relink from the link, "Find this file" with other content, a stable machine id).
- `node dev/smoke.js … --script dev/checks/twocomputers.js` (16 steps): the line in Settings → Sync and the menu; an
  AI with a record from "the other computer": the folder at the same place used, nothing else granted, this computer's
  record with no absolute path; ⋯ AI setup → Files lists the others with "Pick this folder on this computer"; ✕ removes
  and remembers; the welcome note (folders, Check Claude / Astra, Got it); the sync menu entry; a missing song's note with
  Find this file; 🩺's list; `/this-computer`. Screenshots looked at (AI setup rows, the welcome note).
- `sh dev/run-checks.sh unit:twocomputers-test unit:sync-test unit:access-test unit:winpolish-test unit:macpolish-test
  unit:firstrun-test sync access-chat twocomputers scenedoctor unit:scenedoctor-test unit:boot-test lazy fastboot`; `node --check` on every
  touched file; `node dev/winmac-scan.js`.
- Not testable here: a real Mac and PC with a real cloud client, `scutil --get ComputerName`, a real file picker.

## Risks
- Folders at the same home-relative / drive-relative place are used without a click (the brief's "map on load"). A
  folder with the same relative path but different content on the two computers (not synced by anything) is still
  "the same place"; the toast names it, ✕ in AI setup takes it out and it stays out.
- The quick hash reads the first and last MiB plus the size: two different videos identical at both ends and in size
  would match (practically only for re-encodes that keep headers; the name must also match unless the hash does).
- A chat's *own* folders (⋯ → Access on one chat) from the other computer are mapped by sync's home-relative form as
  before; a foreign one is ignored here (never used), but it gets no "Pick" row (only the AI-level Files row has one).
- Existing owners get the welcome note once on each computer after this update (its first sync with another computer
  known).

## Edits outside the lane (small, additive)
`sync-merge.js` (applyPortable keeps own paths, MACHINE_FIELD, LOCAL_FILES), `engines.js` (accessOf drops foreign
folders), `reachmain.js` (localize: no raw lookup of a foreign path), `access.js` (`hereOnly` in the check and sendOptions,
one hook line in aiSection), `sync.js` (the line in Settings / menu / status, the menu entry), `tools/three-media.js`
(load: relink / missing / note the file), `tools/three.js` (one `relink` listener), `tools/three-doctor.js` (missing files
+ the `find` fix), `mcp/hearth-map.js` (one sentence in `sync`), `main.js` (one lazyIpc line), `preload.js` (`hub.two`),
`index.html` (`twocomputers` added to an existing lazy-at.js tag), `lazy-data.js` (the `twocomputers` group: loads right
after the first screen, so no new first-screen script; manifest regenerated), `dev/run-checks.js` (UNIT).

## For the patch notes
- Fixed: the folders an AI may use on your Mac were wiped whenever settings arrived from your PC (and the other way round). Each computer now keeps its own.
- Switching computers: a folder your AI uses on the other computer is used here too when it's at the same place (inside your home folder, iCloud Drive / Dropbox / Google Drive / OneDrive); otherwise ⋯ AI setup → Files shows "Pick this folder on this computer" — one click, nothing is ever granted by guess.
- Safety: a path from the other computer can no longer slip through as a folder here (on Windows "/Users/…" no longer quietly means C:\Users\…), and Astra's Windows "run without its sandbox" never reaches the Mac.
- Engines, sign-ins, Hearth's Chrome and OBS' password stay on each computer; sync never copies them.
- "This computer: Mac (…)" / "Windows PC (…)" shows in Settings → Sync and the sync dot's menu.
- After the first sync on a new computer, a one-time welcome note lists what needs a click there: folders to pick, and Check this AI for Claude and Astra.
- Lab songs and videos from the other computer are found again by their place or their content (even renamed); if not, a plain "Find this file" button — 🩺 Fix my scene shows it too.
- What to try: on the second computer, open ⋯ AI setup → Files on this computer and look for "Also used on your Mac"; or type /this-computer.
