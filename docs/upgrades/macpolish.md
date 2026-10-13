# The Mac, solid (round 33, macpolish)

The owner runs Hearth on a Mac. Round 32's winpolish made Windows solid; this stream does the same for the Mac:
finding and starting the engines however they were installed (also when Hearth is started from the Dock), Gatekeeper
said in one plain sentence with a fix that runs only after a click, deletes that stay recoverable, the Mac's own path
spellings in the chats' folder checks, Chrome's Mac places, and plain words with a fix button for the Mac errors a user
can hit. Nothing new on screen, no new setting, nothing added to any message (0 tokens). Windows and Linux unchanged.

New files: `macpolish.js` (main process, plain Node: `candidates`, `whereOf`, `plan` / `spawn`, `cleanPath`,
`shellPath` / `adoptShellPath`, `quarantine`, `fixPlan` / `runFix`, `plainError`, `trashCheck` / `trashError`,
`caseless` / `volumeInfo`, `register` for two IPC calls), `dev/macpolish-test.js` (in UNIT; `sh dev/run-checks.sh
unit:macpolish-test`).

## What was wrong, what changed

| # | Problem on the Mac | Fix | Where |
|---|---|---|---|
| M1 | The engine search knew PATH, Homebrew, `~/.local/bin`, `~/.npm-global`, nvm, the apps; a copy installed through fnm, asdf, mise, Volta's packages, pnpm (`~/Library/pnpm`), Bun, a custom npm prefix (`npm_config_prefix` / `~/.npmrc`), MacPorts or a folder only the owner's `~/.zshrc` adds was "not found" | every one of those places, best first; one entry per real file (links followed) | `macpolish.js` `candidates`, used by `engines.js` LOCATE and `installs.js` candidates |
| M2 | A version manager's shim (asdf / mise shims, Volta's `bin/`) only works with that manager on PATH and its config around it: from the Dock it often fails | the real program behind it (`installs/…/bin`, Volta's `tools/image/packages`) is listed before the shim | `candidates`, `isShim` |
| M3 | From the Dock PATH has no `node`: an npm copy (`#!/usr/bin/env node`) failed with "env: node: No such file or directory" unless winmac's fixed folders happened to hold one | an npm script runs with the Node next to it (the one it was installed with), else PATH's, else one in the usual places, else Hearth's own Electron as Node; arguments untouched | `plan` / `spawn` (through `WinPolish.spawn`: replies, `--version`, sign-in, /doctor, connector discovery) |
| M4 | What the owner's own shell adds to PATH was never seen by a Dock launch | the login shell's PATH is read once in the background (zsh / bash / fish, 6 s timeout, after the window opens), added at the END of PATH and to the engine search; remembered for the next start | `shellPath`, `adoptShellPath`, `main.js` |
| M5 | Codex installed with npm needs Node; its own program ships inside the package | npm's Codex program (`vendor/<this Mac's chip>-apple-darwin/codex/codex`) is found too | `candidates` |
| M6 | The Claude / Codex / ChatGPT apps' bundled CLIs: only `/Applications/Codex.app` and `ChatGPT.app` | also `~/Applications/…`, and the Claude app bundle's own claude-code | `candidates` |
| M7 | /doctor said "npm" for every Node-based copy and "on PATH" for asdf / mise / fnm | "npm · nvm", "npm · asdf", "npm · fnm", "npm · mise", "on PATH · mise", "desktop app · ChatGPT app"…; asdf / mise / fnm copies count as npm copies | `whereOf`, `installs.js` `kindOf`, `engines.js` `checkEngine`, `engine-health.js` |
| M8 | Update on an nvm / fnm / asdf copy ran whichever `npm` the Terminal found first (possibly another Node's) | the npm next to the copy, with its Node first on PATH | `installs.js` `updatePlan` |
| M9 | Settings → Engines: a path dragged into Terminal (`My\ Tools/claude`), quoted, with `~`, a folder or an `.app` | cleaned: backslash escapes, quotes, `~`, the program in the folder or its `bin/`, the CLI an `.app` bundles | `cleanPath`, `engines.js` `given` |
| M10 | Gatekeeper: a downloaded copy killed at start ("killed: 9", nothing printed) read as "stopped unexpectedly: out of memory"; "developer cannot be verified" / "is damaged" / "Apple could not verify" came raw | one sentence ("macOS blocked claude because it was downloaded from the internet and hasn't been approved yet (Gatekeeper)") + **Allow it…**: a dialog shows the exact command (`xattr -d com.apple.quarantine '…'`, `-dr` for a whole app), it runs only after "Run it"; the quarantine mark is read (flag 0x40 = already approved, then it's called a damaged copy with Install instead) | `quarantine`, `fixPlan`, `runFix`, `plainError`, `engines.js` `end` / `friendlyError`, `engine-health.js` `macFix`, IPC `mac:fix` |
| M11 | Chrome blocked by Gatekeeper (downloaded, never opened) showed "The Hearth Chrome is open without Hearth's hand on it" | "macOS blocked Google Chrome…": open it once from Applications, or **Allow…** (the command shown first); a damaged Chrome says reinstall | `chromemain.js` `ensure`, `chrome-ui.js` |
| M12 | macOS' other errors came raw | plain sentence + button: another kind of Mac ("bad CPU type", -86) → Install; npm without Node → Install; half-removed npm install → Update; old Node → Install; `dyld: Library not loaded` → Install; `xcrun: invalid active developer path` → **Install tools…** (`xcode-select --install`, Apple's own installer); not marked as a program (EACCES) → **Make runnable…** (`chmod u+x` on that one file); privacy protection on Desktop / Documents / Downloads / iCloud Drive / an external disk → **Privacy settings** (Full Disk Access); the copy gone → Run /doctor. A sandbox refusal is never called a privacy problem | `plainError`, `engines.js` `friendlyError` (Mac only, after the sign-in / policy / sandbox notes) |
| M13 | No fix ever asks for a password or uses sudo | when the file belongs to another user / the system, a plain "Hearth never uses an administrator password" + Copy the command | `runFix` |
| M14 | "Couldn't find Claude Code" on a Mac didn't say where Hearth looked | lists them (PATH, your shell's PATH, Homebrew, npm, nvm, fnm, asdf, mise, Volta, pnpm, Bun, ~/.local/bin, the apps) | `engines.js` |
| M15 | A delete on a network share (SMB / AFP / NFS / WebDAV): the Mac has no Trash there (Finder deletes at once); a read-only disk can't change | Hearth leaves the file and says why ("nothing was lost"); never a whole disk or the home folder; USB sticks (.Trashes) and iCloud Drive (Recently Deleted) still go to the Trash | `trashCheck` (reads `mount`, cached a minute) in `fsapi.js` `trash` |
| M16 | A failed move to the Trash showed Electron's raw text | plain words: already gone / locked or read-only / privacy protection (with where to allow it) / in use; "Nothing was deleted" | `trashError` |
| M17 | The chats' folder checks compared Mac paths exactly: "~/proj/a.txt" asked although the chat was given "~/Proj" (one folder on APFS); `/private/var/…` and `/private/tmp/…` (what `realpath` and temp folders give) never matched `/var/…` / `/tmp/…`; `/Volumes/Macintosh HD/…` never matched `/…`; é typed (NFC) vs é from Finder (NFD) didn't match; `$HOME/…` in a command was read as relative | each normalised the Mac way; case is ignored only on a disk that ignores it (the boot disk unless measured otherwise; another disk only when main.js measured it: same inode with other case), so a mismatch on a case-sensitive disk still only asks | `access-rules.js` `norm` / `inside` / `classify({ mac })`, `access.js` (one call), IPC `mac:volumes` (`volumeInfo`) |
| M18 | Chrome on the Mac: only stable Chrome, Edge, Brave, Chromium | also Chrome Beta / Dev / Canary / Chrome for Testing in /Applications and ~/Applications, after stable Chrome | `chrome-cdp.js` `candidates` |

Reviewed and fine as they are: winmac's `fixProcessPath` (kept; the login-shell PATH extends it, no duplicate
folders), iCloud Drive paths with spaces and the `~` inside `com~apple~CloudDocs` (only a leading `~` is expanded),
`installs.js` dedupe by realpath, `runInTerminal`'s `.command` window for updates / sign-in, ffmpeg's Homebrew lookup.

## Upgrades
### Claude / Codex found on the Mac
1. Copies installed through fnm (Node versions in Application Support) are found.
2. asdf: the real copy in its Node install is used, its shim only as a fallback.
3. mise: the same.
4. Volta: the package's real command is used before Volta's shim.
5. A custom npm folder (`npm_config_prefix` or `prefix=` in `~/.npmrc`, `~` understood) is looked in.
6. nvm: the active Node (`NVM_BIN`, `NVM_DIR`) first, then every version newest first (22.10 before 22.9).
7. pnpm's `~/Library/pnpm` / `PNPM_HOME` and Bun's `BUN_INSTALL` are looked in.
8. MacPorts and `~/bin` are looked in.
9. What your own shell adds to PATH (`~/.zshrc`, `~/.zprofile`, fish) is read once and used, also when Hearth starts from the Dock.
10. The Claude app's bundled Claude Code and the Codex / ChatGPT apps' CLIs in `~/Applications` are found.
11. Codex installed with npm: its own program is found too, so it runs without any Node.js.
12. The same program reached by two links counts once.
### Started correctly
13. An npm copy started from the Dock runs with the Node it was installed with: no "env: node: No such file or directory".
14. No Node.js on the Mac at all? Hearth runs the npm script with its own Electron as Node.
### Settings → Engines
15. A path dragged into Terminal (`My\ Tools/claude`), quoted, or with `~` works.
16. Just the folder (or its `bin/`), or an `.app`, finds the program in it.
### /doctor
17. Each copy says where it came from: "npm · nvm", "npm · fnm", "npm · asdf", "npm · mise", "npm · Volta", "Homebrew", "desktop app · ChatGPT app"…
18. Update on an nvm / fnm / asdf copy runs that Node's own npm.
19. "Couldn't find Claude Code" lists every place Hearth looked on the Mac.
### Gatekeeper, said plainly
20. A copy blocked by Gatekeeper ("developer cannot be verified", "is damaged", killed at start) says so in one sentence, with **Allow it…**.
21. **Allow it…** shows the exact `xattr` command first and runs it only after "Run it" (no password, no sudo).
22. A copy whose quarantine was already approved but still gets killed is called a damaged copy, with **Install**.
23. Chrome blocked by Gatekeeper says so (not "open without Hearth's hand") with **Allow…** in the toast.
### Plain errors with a fix button
24. "Bad CPU type" (a copy for the other kind of Mac) → **Install**.
25. "env: node: No such file" → Node.js missing, with **Install** (the standalone version needs none).
26. "Cannot find module" → an incomplete npm install, with **Update**.
27. A Node.js too old for the copy → **Install**.
28. "dyld: Library not loaded" → a broken install, with **Install**.
29. "xcrun: invalid active developer path" → **Install tools…** (Apple's own installer).
30. Not marked as a program → **Make runnable…** (`chmod u+x` on that one file, shown first).
31. macOS' privacy protection (Desktop, Documents, Downloads, iCloud Drive, external disks) → **Privacy settings** opens Full Disk Access.
32. A fix Hearth can't apply (the file belongs to the system) says so plainly with the command to copy; never asks for a password.
### Deletes stay recoverable
33. A file on a network share (SMB / AFP / NFS / WebDAV) is never deleted for good: Hearth leaves it and says why.
34. A file on a read-only disk is left with a plain reason.
35. Hearth never sends a whole disk or your home folder to the Trash.
36. A failed move to the Trash says what happened in plain words ("locked", "privacy protection", "in use", "Nothing was deleted").
### The chats' folders on the Mac
37. Case is ignored where the disk ignores it: "~/Proj" given, "~/proj/a.txt" counts as inside (APFS' default).
38. A case-sensitive disk is measured and compared exactly (a mismatch only asks).
39. `/private/var/…`, `/private/tmp/…`, `/private/etc/…` count as `/var/…`, `/tmp/…`, `/etc/…`.
40. `/Volumes/Macintosh HD/…` counts as `/…`.
41. Accented names match however they were typed (Finder's NFD and typed NFC).
42. `$HOME/…` in a command is the home folder.
### Chrome
43. Chrome Beta / Dev / Canary / Chrome for Testing (in /Applications or ~/Applications) are used when stable Chrome isn't installed.

43 upgrades.

## Tested
- `node dev/macpolish-test.js` (in UNIT, 171 checks, no Mac needed): a fake Mac disk (files, symlinks incl. linked
  folders, mtimes, inodes) with path.posix and an injected env: every install place above, shims after real programs,
  dedupe by real file, the npm Codex program for this chip; /doctor labels; the start plan (Node next to the link, PATH's,
  nvm's, Electron as Node; `env -S`; Mach-O / shell scripts / fixed shebangs direct; Linux / Windows unchanged);
  Settings paths; the login shell (zsh / fish commands, noisy rc output, a strange $SHELL never run, merge at the end,
  the cache); Gatekeeper (flags 0081 / 00c1 / none, app bundles, the exact commands incl. a quote in a folder name, no
  sudo anywhere, runFix only runs its own three programs, "No such xattr" = already allowed, permission denied = plain
  no); 13 macOS error texts + killed-at-start with / without / with an approved mark; the Trash (real `mount` lines incl.
  names with spaces: smbfs / nfs / read-only / msdos, root / whole disk / home / relative / ~); case probing and
  volumeInfo; access-rules' Mac forms (9 inside, 5 outside, measured / unmeasured disks, iCloud with escaped spaces,
  $HOME, /private/tmp); through a temp copy of engines.js: `friendlyError` on a Mac (and not off it, sign-in / policy /
  sandbox notes untouched), installs kinds and the nvm update plan; Chrome's Mac places and Canary-only.
- `sh dev/run-checks.sh unit:macpolish-test unit:access-test unit:astra-engine-test unit:winpolish-test
  unit:winmac-test unit:robust-engine-test unit:chrome-test access-chat`: 8/8 passed. `node dev/winmac-scan.js`: 0 hits
  (macpolish.js listed as reviewed: it is the Mac-only helper). `node dev/smoke.js` with a check calling
  `hub.macFix` / `hub.macVolumes` / `EngineHealth.macFix` off the Mac ("Only on a Mac", no page errors).
  `node --check` on every touched file.
- Not testable here: a real Mac (Gatekeeper's real kill, `xattr`, `mount`, the login shell, Full Disk Access, a
  case-sensitive APFS disk). Each part falls back to the old behaviour when it can't decide (a direct spawn, "ask",
  "leave the file").

## Risks
- The login shell is started once per launch (interactive, like VS Code does), 3 s after the window, killed after 6 s;
  an rc file that prints or waits is ignored / cut off. Its folders only ever go at the END of PATH.
- Running an npm script with the Node next to it (instead of PATH's first `node`) is a behaviour change on the Mac when
  both exist; it is the Node that installed the copy, which is what npm intends.
- Case-insensitive matching on the boot disk is assumed until main.js measures it (`mac:volumes`, asked once per window).

## For the patch notes
- On a Mac, Claude Code / Codex are now found wherever you installed them: Homebrew, npm (also a custom prefix), nvm, fnm, asdf, mise, Volta, pnpm, Bun, the installer, the Claude / Codex / ChatGPT apps — even when Hearth is started from the Dock.
- npm copies start from the Dock even when your PATH has no Node ("env: node: No such file" is gone); Codex from npm also runs without Node.
- What your own shell adds to PATH (~/.zshrc) is picked up once, in the background.
- macOS blocking a download (Gatekeeper: "cannot be verified", "is damaged", killed at start) is said in one sentence with an Allow button that shows the exact command first and runs it only after your click — never a password.
- macOS' other errors (another kind of Mac, Node missing, Apple's command line tools, privacy protection on Desktop / Documents / iCloud) read as one plain sentence with the button that fixes it.
- Deletes stay recoverable on a Mac too: a file on a network share or a read-only disk is left where it is, and the chat says why.
- The chats' folder checks understand the Mac's spellings: other upper / lower case on APFS, /private/tmp, /Volumes/Macintosh HD, accented names, $HOME.
- /doctor says where each copy came from ("npm · nvm", "npm · asdf"…); Chrome Beta / Dev / Canary work for Google sign-in.
- What to try on the Mac: quit Hearth, start it from the Dock, send Claude a message, then run /doctor — every copy is listed with where it came from; if one was downloaded and macOS blocks it, press Allow it… under the error.
