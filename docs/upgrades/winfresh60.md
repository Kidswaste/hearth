# winfresh60 — the fresh Windows install from the zip (round 60)

The owner installed Hearth on Windows from `Hearth-Windows.zip`: a shallow git checkout (the last 50 versions) in
`%USERPROFILE%\Hearth`, `core.autocrlf=false`, `core.filemode=false`, `electron\` inside, "Start Hearth.cmd" to start
it, origin = the private GitHub repo. This stream simulated that install on Linux with real git (a depth-50 clone of
an older main, a local "GitHub" with newer commits, no git identity, a folder path with a space) and fixed what broke.

## What was found and fixed
1. **The zip's old origin/main offered garbage before the first look.** The zip carries `refs/remotes/origin/main`
   from before it was made (a8442ba, 1520 versions older than its HEAD, below the shallow edge). Any status without a
   fetch (Check this computer, the start-up look) counted that old island as "50 new changes" and "50 of its own".
   Now a shallow copy that doesn't reach where it meets main says nothing (`stale`) until it has really looked.
2. **Wrong merge base in a shallow copy.** Through an old merged branch, git can find a shared *old* version while the
   real meeting point is hidden below the shallow edge (counts of 177 behind / 52 ahead for 1 / 1, and a merge from the
   wrong base). A merge base is trusted only above the edge; otherwise Hearth fetches deeper (`--deepen=100`,
   `--deepen=1000`, then `--unshallow`) before counting or merging.
3. **No merge base at all** (main rewritten or replaced) used to read as "this copy has 50 changes of its own" and a
   doomed merge ("unrelated histories"). Now only the versions made on this computer count (its own HEAD log). None made
   here: main is taken with `git reset --keep` (hand edits kept in the named stash, the version before kept as a
   `hearth-saved-<date>` branch, Go back works). Some made here: never merged; "Keep mine aside and update" saves them
   on a side branch, counted correctly ("1 change of its own").
4. **The update's file checks went blind without a merge base** (`git diff HEAD...origin/main` errs): the data-folder
   guard, long paths and hand-added clashes are now measured from the merge base itself (or main itself when there is
   none).
5. **Fetch didn't name where to write.** `git fetch origin main` only updates origin/main when the checkout's config
   has a fetch line; a zip built by `git fetch <url> main` wouldn't, and every update would say "no network". The fetch
   now spells out `+refs/heads/main:refs/remotes/origin/main` (rewritten main replaces the old one too).
6. **Every git status re-read every file on the unzipped copy** (the index carries the zip builder's file times and
   Hearth's git never saves the refresh). The index is refreshed once per session, quietly.
7. **A private repo read as "no network" or as a folder-permission problem.** 401 / 403 / 404, "Repository not found",
   "Permission to … denied", Git Credential Manager's "Cannot prompt…" and SSH's "Permission denied (publickey)" now all
   mean *sign in to GitHub*, checked before the network and file rules.
8. **The sign-in advice was wrong for Windows** (it said `gh auth login`, which isn't installed). Now one button,
   **Sign in to GitHub**, opens a visible PowerShell (Terminal on a Mac) running the same fetch: on Windows Git
   Credential Manager (part of Git for Windows) shows GitHub's own sign-in window and remembers it; on a Mac Git asks for
   the user name and a token, kept in the keychain. Git found off PATH is used by its full path. Hearth never sees a
   password.
9. **Install Git on Windows** now falls back to Git's download page when winget is missing, and right after the install
   the same window runs the sign-in fetch, so one click gets Git *and* GitHub access. The message says the code is
   private and that GitHub asks for a sign-in once.
10. **A fresh install never heard of updates** when Git was missing or it wasn't signed in (the quiet look failed
    quietly). Both now show the ⬆ button's "!" with their one fix; Check this computer says "Sign in to GitHub" instead
    of "offline?".
11. **"Start Hearth.cmd" promised shortcuts nobody made.** On a copy's first start on Windows, Hearth now makes the Start
    menu + Desktop "Hearth.lnk" (`electron\electron.exe "<folder>" --restart`, Hearth's icon and app id — the Start menu
    one is also what lets Windows show Hearth's notifications). Shortcuts that already open this copy are kept; another
    copy's (an older `agent-hub` folder that still exists, with its data) are left alone and said once ("Settings ›
    Create Start menu & desktop shortcuts points them at this one"); a gone copy's are pointed here. Once per copy (a
    note in `data/shortcuts.json`); test copies and smoke runs never touch real shortcuts.
12. **"Start with Windows" broke on a folder with a space** (`C:\Users\Jane Doe\Hearth`): Electron writes login-item
    arguments joined by spaces, unquoted. The folder is quoted now, and it is the folder Hearth runs from (`__dirname`).
13. Folder-name assumptions: none in code (only comments / test strings mention agent-hub); the updater's header now
    describes `%USERPROFILE%\Hearth`, and the shortcut uses Hearth's own folder, not `app.getAppPath()`.
14. Checked and fine on a shallow checkout: stash naming and finding (named stashes, `OWN_EDITS`), Go back, diverged
    merges with no git identity on the computer (signed "Hearth"; `git stash` has its own fallback identity), a gap of
    120+ versions (plain fetch keeps the history connected — a `--depth` fetch would have cut it), a branch forked below
    the edge, configsafe's first-start move (data/config.json made from the tracked defaults, tracked files left clean,
    `afterStart` settles nothing), new config.json defaults (a new agent, a new setting) reaching what Hearth uses.

## Files
`updatermain.js` (status / apply: trusted merge base, deeper fetch, made-here count, take, refspec, index refresh,
sign-in fix), `updatesafe-core.js` (auth rule first, `signIn`, Windows install + sign-in, plain words), new
`winfresh-core.js` (login-item args, shortcut plan), `appshell.js` (quoted login item, `firstRunShortcuts`), `main.js`
(one hook), `updater.js` (the "!" for auth / git), `firstrun-core.js` (the auth row), `dev/winfresh-test.js`,
`dev/run-checks.js` (unit + group `winfresh60`).

## Tests
- New `node dev/winfresh-test.js` (`unit:winfresh-test`, 60 steps): the zip layout with the island origin/main, no git
  identity, a folder path with a space; first start; stale before the first look; window / main-process / config.json
  updates; Go back and forward; a 121-version gap; a branch forked below the edge; diverged; main rewritten below the
  edge (deeper fetch); main replaced (taken / kept aside); no fetch line; the private-repo refusals; Git missing on
  Windows; stash names; the shortcut and login-item plans; no agent-hub paths.
- unit: updater-test, updatesafe-test, configsafe-test, winmac-test, firstrun-test, labchats54-test pass; winmac-scan 0.
- Browser: updater, firstrun, lazy, unit:boot-test pass (one flock hold).

## Risks
- A real Windows run wasn't possible: `shell.readShortcutLink` / `writeShortcutLink`, Git Credential Manager's window
  and winget are exercised by their documented behaviour only.
- On a fresh install `data/config.json` starts as a full copy of the defaults, so a later change of a default's *value*
  (not a new key or agent) doesn't reach it — the same as every install since configsafe.
- The zip build: setting `refs/remotes/origin/main` to the zipped HEAD (`git update-ref refs/remotes/origin/main HEAD`)
  before zipping avoids the island altogether; Hearth copes either way now.

## For the patch notes
- **Updates work on the Windows install from the zip.** That copy holds only the last 50 versions; Hearth now fetches
  deeper by itself when it needs to, counts only what you made on this computer, and never offers "updates" from the
  old note the zip carried before it has looked at GitHub.
- **Sign in to GitHub in one click.** Hearth's code is private: when GitHub says no, ⬆ shows "!" and a Sign in to GitHub
  button that opens GitHub's own sign-in window (on a Mac, Terminal asks for your user name and a token). It no longer
  says "check your internet" for this. Hearth never sees your password.
- **Install Git also signs you in.** On Windows the Install Git button installs Git (or opens its download page) and then
  asks GitHub once in the same window, so the next update just works.
- **Hearth shortcuts on the first start.** Starting Hearth from the new folder makes the "Hearth" shortcut in the Start
  menu and on the Desktop (it also lets Windows show Hearth's notifications). If your shortcuts still open an older copy,
  Hearth leaves them and tells you how to point them here.
- **Start with Windows works in any folder**, also one with a space in its path.
- **If main is ever rewritten**, Hearth takes it and keeps your previous version as a branch instead of mixing the two.
