# twocopies64 — a second Hearth folder next to the real one (round 64)

The incident: the owner unzipped `Hearth-Windows.zip` into `%USERPROFILE%\Hearth` next to their real install
(`%USERPROFILE%\agent-hub`, chats in `data\chats`) and started it. The new copy started with an empty data folder: "all
my chats and stuff are gone". They found them again by opening the old copy. Both folders' `package.json` say
`agent-hub`, so Electron gave them **one profile** (`%APPDATA%\agent-hub`: localStorage, IndexedDB, cookies, the
one-window lock) while each kept **its own data folder**.

## Damage assessment (could the real copy have been affected?)
**Chats, memory, settings, Lab scenes, everything in `agent-hub\data`: no.** Nothing Hearth keeps in the profile holds a
chat; the empty copy never writes into another folder's `data`. Reproduced end to end (dev/checks/twocopies64.js, step
3): after the old-style empty copy ran on the shared profile, the real copy lists all its chats and its chat files are
byte-identical.

What the empty copy could have changed in the shared profile, and what the real copy does with it:

| Profile entry (localStorage unless said) | What the empty copy did | Effect on the real copy |
|---|---|---|
| `hearth.view` (screen / chat / scene after a crash or reload) | wrote its own ids | ignored: chats it doesn't have are skipped (freshen.putBack) |
| `hub.three.current` (the Lab's last scene) | wrote its starter scene's id | the Lab opens on the first scene instead of the last one (pick it in the scene list) |
| `hub.speed.resume` (the "pick up where you were" card) | wrote its chat | ignored (unknown chat); the real copy's own last place may not be offered once |
| `hub.offline.held` (messages typed while a reply ran, at the last close) | **took** the real copy's, then dropped them (their chat isn't there) | only if the real copy was closed with such a queue: those typed lines are gone |
| `hub.routines.list` (🔁 Keep going) | turned running ones into paused; one set to go on after a restart was **stopped** ("its chat is gone") | only if a routine was running: start it again from its chat |
| `firstrun.seen`, `whatsnew.seen`, hints, panel widths, zoom, UI toggles | read / set as if one install | cosmetic: a "what's new" may not show once; UI choices made in the empty copy apply |
| `hub.draft.<ai>.new` (the draft of a not-yet-started chat) | shared | cosmetic |
| cookies / website sign-ins (`Partitions`) | shared | harmless (the empty copy was signed in too) |
| `hearth-app-keys.json`, `hearth-app-windows.json` (profile files) | shared | harmless |
| `data\window.json`, `data\kv`, `data\config.json`, sync state | per folder | not shared, nothing to say |

Outside the profile:
- **"Start with Windows"**: both copies use one entry named "Hearth". The empty copy (setting off) **removed the real
  copy's entry** at its start. It comes back by itself the next time the real copy starts (it re-applies its setting).
  Fixed: a copy now only clears an entry that starts its own folder.
- **Start menu / Desktop shortcuts**: verified left pointing at `agent-hub` (winfresh60's plan leaves another existing
  copy's shortcuts alone).
- **Backups** (`Documents\Hearth backups`, shared): the empty copy likely made one automatic backup of its empty folder
  ~30 s after the computer went idle. It shows in Settings › Backups with the same computer name: don't restore that
  one. Its rotation only considers backups made with its own computer id, so the real copy's backups were not its to
  remove; older backups with no details card (from before round 45) could have been moved to the Recycle Bin by its
  rotation (to the Bin, never deleted). Fixed: a backup now says which folder made it, and no folder rotates another's.

**What to tell the owner:** your chats were never touched — they are all in `C:\Users\you\agent-hub\data\chats`, and
that Hearth shows them. Keep using it (the Start menu and Desktop shortcuts still open it) and update it with ⬆. The
`Hearth` folder can be deleted, or kept: next time it starts it shows a card that opens your real one. If "Start with
Windows" was on, it is back after you open your real Hearth once. If the Lab opens on another scene, pick yours in the
scene list. In Settings › Backups, ignore a backup made when you tried the second copy (it is empty).

## What changed
1. **Each Hearth folder gets its own profile.** A stable id per data folder (`copyId` in `data/hearth-origin.json`, which
   moves with the folder and never syncs; portable.js keeps it). The copy that owns Electron's usual profile keeps it
   and notes it (`<profile>/hearth-copy.json`); any other copy gets its own next to it (`agent-hub-copy-<id>`), from
   then on. Decided at the very top of main.js, before the one-window lock and anything that reads the profile.
   With no note yet (every install before this round): a profile nobody used goes to the first copy; a used one goes
   to the copy with the most chats on this computer, never to a new empty copy — in whichever order they start. A
   moved copy keeps its profile; a gone owner's profile is taken over; an unreadable note decides nothing.
2. **The card before the window.** A copy with no chats that finds another Hearth folder with chats shows one card
   *before* any main window: "Your chats are in another Hearth folder — You already have Hearth with 142 chats in
   C:\Users\you\agent-hub. This one, in C:\Users\you\Hearth, is new and has no chats yet. Nothing is moved or deleted,
   whatever you pick."
   - **Open that one (recommended)** starts that copy (its own `electron\electron.exe`; on a Mac the Hearth.app that
     starts that folder) and quits this one. If it can't be started from here, its folder is opened instead.
   - **Bring its chats here** copies its chats, memory lines, the AIs this copy lacks and the chats' folders /
     bookmarks / projects / Lab scenes, with 🛟 Recover's own scan and bring-back (`datasafemain.scan({ copies })`):
     the other folder is only read (byte-identical afterwards). Then the window opens with one line saying so.
   - **Start fresh here** is remembered (`data/twocopies.json`); so is Bring. Closing the card opens this copy and
     asks again next time. Several other copies: one line each to pick from.
3. **Where it looks.** Windows: `%USERPROFILE%\agent-hub`, `%USERPROFILE%\Hearth`, Hearth-looking folders in the home
   folder, Desktop, Downloads, Documents and OneDrive's Desktop / Documents (and one level inside them, e.g.
   `Hearth-Windows\Hearth`), where the Start menu / Desktop `Hearth.lnk` and the login item point. Mac:
   `~/Library/Application Support/Hearth`, `~/agent-hub`, `~/Hearth`, Desktop / Downloads / Documents, the folder
   `~/Applications/Hearth.app`'s launcher starts and `/Applications/Hearth.app`'s `boot.js` HEARTH_DIR. Only folders with
   Hearth's code and at least one chat count; never itself.
4. **🛟 Recover… also lists another Hearth folder's chats** (and memory, AIs, chat lists), marked "Your other Hearth
   folder (…)" and **unticked**: two copies the owner keeps apart stay apart unless they tick them.
5. **Start with Windows** off in one copy never removes another copy's entry (`loginItemPlan`).
6. **Shortcuts**: a copy with no chats never makes or takes the Start menu / Desktop shortcuts while another copy has
   chats (quietly held; asked again at a later start). Verified: another existing copy's shortcuts are left alone.
7. **Backups** carry which folder made them; a folder never rotates another folder's backups away; backups from before
   this round are rotated only by the folder that owns the usual profile.
8. **`dev/make-windows-zip.sh`**, the fixed recipe for Hearth-Windows.zip: a depth-50 checkout of the version,
   `core.autocrlf=false`, `core.filemode=false`, origin + its fetch line, **`git update-ref refs/remotes/origin/main
   HEAD`** (no old origin/main island), **no `data/`** (nor electron-mac / node_modules / anything ignored), "Start
   Hearth.cmd", `--electron <dir>` for the Windows runtime, and a **README-FIRST.txt**: "If you already have Hearth,
   don't use this — press ⬆ Update in your Hearth instead."

Only the real app does any of this (package "agent-hub"): test copies (smoke runs rename the package) never look at
the computer's folders or change profiles. Tests: `HEARTH_TWOCOPIES=1/0`, `HEARTH_TWOCOPIES_HOME`, `HEARTH_TWOCOPIES_NOTE`.

## Files
New: `twocopies-core.js` (plain rules), `twocopiesmain.js` (profile at start, the card, Open that one),
`twocopies.html` + `twocopies-preload.js` (the card), `dev/twocopies-test.js`, `dev/checks/twocopies64.js`,
`dev/make-windows-zip.sh`. Small edits: `main.js` (early profile call, the gate before the window, `bringFromCopy`, the
quiet shortcut hold), `datasafemain.js` (`scan({ copies })`, other folders in Recover, unticked), `datasafe.js`
(unticked rows, their line), `appshell.js` (login item plan, shortcut hold), `backupautomain.js` (which folder made a
backup), `portable.js` (keeps `copyId`), `sync-merge.js` (`twocopies.json` stays local), `dev/run-checks.js` (UNIT,
group `twocopies64`, checks with `// driver: node` run as Node scripts).

## Tests
- `node dev/twocopies-test.js` (unit:twocopies-test, 70 checks): Windows layout (agent-hub with 142 chats, the new
  Hearth, Desktop\Hearth-Windows\Hearth, Downloads, OneDrive Desktop, a Start-menu-only and a login-item-only copy;
  case / trailing-slash self exclusion); Mac layout (Application Support, `boot.js` HEARTH_DIR with escaped quotes, the
  old launcher); the profile in every start order, moved / gone owner, unreadable notes; profile entries kept apart
  (the empty copy sees none of the real copy's queue / routines, the real copy finds its own); Bring through Recover's
  code with the other folder byte-identical; Open that one plans; login item; shortcuts; the zip recipe.
- `dev/checks/twocopies64.js` (the real app, two copies, one `--user-data-dir`, one Xvfb): real copy notes the profile;
  the old-style empty copy shares it (reproduces the incident) and leaves foreign entries; the real copy still lists all
  3 chats, files byte-identical; the new empty copy shows the card before any window, on its own profile; Bring copies
  the 3 chats, the real folder byte-identical, the line shown; Open that one quits and starts the real copy on the usual
  profile; Start fresh is remembered (no card next start). 26 steps, pass.
- Also pass: chatkeep, firstrun, datasafe, lazy, unit:winfresh-test, unit:configsafe-test, unit:boot-test,
  unit:datasafe-scan, unit:winmac-test (scan 0), unit:chatsafe-scan, unit:datasafe-test, unit:backupauto-test,
  unit:sync-test, unit:chatkeep-test.

## Risks
- Not run on real Windows / a real Mac: `shell.readShortcutLink`, `getLoginItemSettings().launchItems` and `open -n` are
  used as documented. The profile switch itself is Electron's `app.setPath('userData')` before 'ready' (tested on Linux).
- A copy that moves to its own profile starts without that profile's website sign-ins and UI choices (the real copy's
  stay with the real copy). That is the point, but a second copy someone *uses* on purpose signs in once.
- If the folder owning the profile is deleted, the next copy started takes the profile over; a copy that later appears
  with the old id (restored from a backup into a new folder) gets its own.
- "Bring its chats here" brings chats, memory lines, missing AIs and the chats' lists; the other copy's own settings
  values (theme, renamed default AIs) are not copied (the new copy's settings already exist). Attachments stay where
  the chats point (in the other folder), so that folder should be kept while those chats are used.

## For the patch notes
- **Your chats were never gone.** A second Hearth folder (like the one from the Windows zip) started empty and shared
  some screen memory with your real Hearth; your chats stayed safe in your own Hearth's data folder all along.
- **A second Hearth now asks first.** If you open a Hearth that has no chats while another Hearth on this computer has
  them, a card shows before anything else: **Open that one (recommended)**, **Bring its chats here** (copied, the
  originals stay), or **Start fresh here**.
- **Each Hearth folder keeps its own screen memory**, so a second copy can't change which chat or scene your real
  Hearth opens, its waiting messages or its Keep going routines.
- **"Start with Windows" and your shortcuts stay with your real Hearth**: a second copy no longer switches them off or
  takes them over.
- **🛟 Recover… also finds chats in another Hearth folder** on this computer (unticked, so nothing comes over unless
  you tick it).
- **Backups made by another Hearth folder are never cleaned up by this one.**
- The Windows zip now says first: "If you already have Hearth, don't use this — press ⬆ Update in your Hearth instead."
