# updatesafe (round 37): updating is safe and smooth on the Mac and the PC

The owner updates Hearth several times a day on two computers. ⬆ Update was a bare `git pull --autostash`: fine on a
good day, but a missing git, a copied folder, a hand-made commit, a VPN, Windows holding a file open or a crash in
the middle each ended in a red line of git words (or worse, a half-updated folder). Now every one of them is one plain
sentence with one button, nothing is ever discarded, and a bad update is one click away from undone.

## Upgrades
### Your edits are always safe
1. **Hand edits go into a named stash** ("hearth-update 2026-10-14 09:12 (abc1234 → def5678): your edits") and come back right after the update; the unnamed autostash is gone.
2. **A file you added by hand with the same name as a new file of the update** no longer stops the update: the update's file goes in, yours is kept in its own named stash, and the note after the update says which file and which stash.
3. A hand edit that clashes with the update: the file gets the new version (never a file full of conflict marks), your edit stays in the named stash, and the note names it.
4. The ⬆ dialog says beforehand what will happen to hand edits, hand-added files with clashing names and commits of your own.
5. **Updates never touch the data folder**: `data/` (and `electron/`) are never stashed, reset or written; an update that would change a file there is refused with a plain message.

### One plain sentence and one button for each failure
6. **Git isn't installed** → **Install Git**: `xcode-select --install` on the Mac, `winget install --id Git.Git …` on Windows, in a window you can watch, only after the click, the command shown first.
7. Git installed after Hearth started (not on its PATH yet), or Homebrew's git on a Mac started from the Dock: found where installers put it, no restart needed.
8. A Mac without Apple's command line tools (`xcrun: invalid active developer path`) reads as that, with Install Git.
9. **Not a git checkout** (a zip copy, a copied folder) → **Connect to Hearth on GitHub**: the same steps as `mac/connect-git.sh`, run by Hearth; no file on disk changes, your data included; differences count as your edits from then on.
10. **Hearth's folder inside another git project** (a home folder under git) is detected: Hearth never pulls the other project; Connect gives the folder its own link.
11. **"Dubious ownership"** (a folder copied as administrator / from another account) → **Trust Hearth's folder** (`git config --global --add safe.directory …`, shown).
12. **A stuck `index.lock`** from a git that crashed → **Clear the stuck marker** (only when older than a few seconds: a git running right now is left alone).
13. **Detached HEAD** (an old version checked out by hand) → **Go back onto main**; anything made there is kept on a `hearth-saved-<date>` branch first, hand edits move along.
14. **Diverged history** (commits of your own): merged with main by itself when they don't clash (Git's "divergent branches" refusal is gone); when they do, nothing changes and **Keep mine aside and update** puts your commits on a `hearth-mine-<date>` branch and takes main.
15. **No network**: "Couldn't reach GitHub… check the internet connection (or the VPN)" + Try again; nothing changed.
16. **Behind a proxy**: when the fetch fails, Hearth asks the computer's own proxy setting (Electron) and tries once more through it, then says so in plain words.
17. **Certificate checks failing** (a work network or antivirus inspecting HTTPS): on Windows **Use Windows' certificates** (`http.sslBackend schannel`, shown); elsewhere plain words.
18. **GitHub asking for a sign-in**: said plainly (Hearth never types a password); git can never sit waiting for a username.
19. **Windows files held open**: the half-written files are put back, nothing changes, and **Restart and finish the update** stages it; at the next start the update goes in before anything loads (then Hearth starts once more by itself if its own main files changed). Its helper processes are closed by the restart.
20. **Long paths on Windows**: new files whose path would pass 259 characters are found before anything is written → **Allow long paths for Hearth** (`git config core.longpaths true`, this folder only, no administrator).
21. **Permissions**: Mac/Linux → **Fix the folder's owner** (`sudo chown -R "$USER" …`), Windows → **Fix the folder's permissions** (`icacls … /grant`); the command is shown open before the click, runs only in a visible Terminal / PowerShell window, the password is typed there, never in Hearth.
22. Git never waits for an answer: no password prompt, no Windows "Unlink of file failed. Should I try again? (y/n)", English messages on a French or German system (so the plain words always match).
23. Background looks take no optional index lock, so the half-hourly check never collides with a git you run yourself.

### An update cut short (crash, power cut, killed)
24. **A journal in `.git/hearth-update`** records each step; the next look sees an update that stopped half-way and the ⬆ button shows **!**.
25. **Finish the update** or **Go back to how it was**: the update's own half-written files are put back (only files provably identical to the new version: anything else is yours and stays), the named stashes come back, a merge left open is aborted.

### After updating
26. **Your view comes back after the reload / restart**: the screen you were on and the chat each AI had open (drafts and unsaved Lab / board work: the safetynet journal is written right before).
27. **↶ Go back** next to 📰 Patch notes in the "Hearth updated" note: one click (one confirmation) back to the version before the update with git, your chats, scenes, settings, data and hand edits untouched; it reloads or restarts as needed.
28. Go back is also in Settings › Updates › What's new…, the ⬆ right-click menu, ⌘K ("Go back to the previous Hearth version") and `/update back`.
29. After going back, ⬆ offers the same update again whenever you want; "Back on the previous version" is said once.
30. An update finished at a restart is announced like any other (with Patch notes and Go back).

### Polish
31. The ⬆ button shows **!** (orange) when something needs you before any update can land (half-finished, staged, detached, stuck lock, permissions); passing network hiccups stay quiet.
32. The ⬆ dialogs got proper padding and right-aligned buttons; the fix dialog folds the command under "What it runs" (open when it asks for a password or administrator).

## How it works (for the next developer)
- `updatesafe-core.js` (plain Node): `classify(gitText)` → reason, `explain(reason, ctx)` → `{ message, fix: { id, label, command, password?, admin? }, alt? }`, `tooLong(dir, files, platform)` (path.win32), `stashName`, the state folder `.git/hearth-update/` (`journal.json`, `pending.json`, `swapped.json`, `last.json`), `cleanPartialSync` (puts back only files identical to the target blob), `startSwap(app)` (main.js line 9: one stat on a normal start).
- `updatermain.js`: `create({ dir, platform, gitBin, originUrl, resolveProxy, terminal, gitCandidates })` for tests; the module's own instance serves IPC `update:status / apply / back / fix / restart / reload` (lazyIpc). `fix(id)` takes ids only: retry, install-git, connect, safe-dir, unlock, onto-main, side-branch, resume, rollback, longpaths, ssl-windows, own-folder, restart-swap. Password / admin commands go through `installs.runInTerminal` (a visible window).
- `updater.js`: `trouble(r)` (the one-fix dialog), `goBack()`, `keepView()` / `restoreView()` (localStorage `update.view`, used once within 10 min), `update.swapWait` for the staged swap.
- Tests: `node dev/updatesafe-test.js` (182 checks, real git in temp folders, Windows simulated), `node dev/updater-test.js`, `dev/checks/updater.js` (the window); `sh dev/run-checks.sh updatesafe`.

## Caveats
- Real Windows file locks, real `winget` / `xcode-select`, a real corporate proxy and a real `icacls` were simulated (a git wrapper fails the merge like Windows does; the platform is injected); the first real test is the owner's PC.
- Go back returns to the commit before the last update; after two updates in a row it goes back one step, not to the start of the day.
- A hand edit that clashes with the update stays in its stash: Hearth names it but doesn't merge it for you.

## For the patch notes
- ⬆ Update can't lose your work any more: hand edits go into a named stash and come straight back; a file you added with the same name as a new one is kept aside, named, and the note says where.
- When an update can't go through, you get one plain sentence and one button: Install Git, Connect to Hearth on GitHub, Go back onto main, Keep mine aside and update, Allow long paths, Fix the folder's owner, Try again…
- Nothing that needs your password runs by itself: the command is shown first and runs in a Terminal / PowerShell window you can see, after your click.
- Windows holding Hearth's files open? The update now finishes as Hearth restarts, cleanly, instead of failing half-way.
- An update cut short by a crash or a power cut is noticed (⬆ shows "!"): Finish the update, or Go back to how it was.
- After an update Hearth comes back on the same screen with the same chats open.
- Something feels wrong after an update? **↶ Go back** in the "Hearth updated" note (or Settings › Updates › What's new…, ⌘K, `/update back`) returns to the previous version; your chats and data are never touched, and ⬆ offers the update again when you're ready.
- Works behind a proxy (Hearth tries your computer's proxy setting by itself) and on a French or German system.
