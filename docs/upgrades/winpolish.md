# Windows, solid (round 32, winpolish)

The owner is using Hearth on a Windows PC right now. Round 31 left one known gap ("Claude installed through npm
(`claude.cmd`) still isn't found by itself") and round 32's winshell made commands work. This stream made the rest of
the Windows path solid: finding and starting the engines however they were installed, deletes that stay recoverable,
Windows' path spellings in the chats' folder checks, Chrome's places, and plain words with a fix button for every
error a Windows user can hit. Nothing new on screen, no new setting, nothing added to any message (0 tokens).

New files: `winpolish.js` (main process, plain Node: `candidates`, `readShim`, `plan`, `spawn`, `cleanPath`,
`trashCheck`, `trashError`, `plainError`, `dropStack`), `dev/winpolish-test.js` (in UNIT; `sh dev/run-checks.sh winpolish`).

## What was wrong, what changed

| # | Problem on Windows | Fix | Where |
|---|---|---|---|
| W1 | Only `claude.exe` / `codex.exe` were looked for: npm's `claude.cmd` / `codex.cmd` were never found (and Hearth started from the Start menu often lacks `%APPDATA%\npm` on PATH) | every `.exe` / `.cmd` / `.bat` copy in PATH, npm's folder and prefix (`npm_config_prefix`, `~\.npmrc`), nvm-windows (`NVM_SYMLINK`, every version in `NVM_HOME`), `Program Files\nodejs`, Volta, pnpm, Bun, scoop (user + global shims), winget (Links + Packages), the installer (`~\.local\bin`), the Claude app's bundled CLI, Codex's app and npm's bundled `codex.exe`; the `.exe` before the `.cmd` of one folder; Windows' case-insensitive env keys, quoted / `%VAR%` PATH entries | `winpolish.js` `candidates`, used by `engines.js` LOCATE and `installs.js` candidates |
| W2 | Even a `.cmd` set in Settings → Engines failed: Node ≥ 18.20.2 refuses to spawn `.cmd` / `.bat` without a shell (CVE-2024-27980: `spawn EINVAL`) | npm / pnpm / Yarn shims are read and their Node script run with `node.exe` (next to the shim, on PATH, Program Files, nvm, Volta; else Hearth's own Electron as Node): no cmd.exe, so the system prompt's newlines, quotes, `&`, `%` arrive untouched. A shim to a program runs the program. A `.cmd` Hearth can't read goes through `cmd.exe /d /s /c` with `windowsVerbatimArguments` and every argument quoted the cross-spawn way (C-runtime quoting, then `^` for cmd's specials, twice for a batch file) — never a string built from unquoted text | `winpolish.js` `plan` / `spawn`; every engine start in `engines.js` (replies, `--version`, sign-in, /doctor, connector discovery) and `installs.js` |
| W3 | A path pasted in Settings → Engines with File Explorer's "Copy as path" quotes, `%APPDATA%`, `~`, npm's extensionless script or `.ps1`, or a folder: "not found" | cleaned first (quotes, variables, `\\?\`, trailing slash; the `.cmd` / `.exe` next to it; the program inside a folder) | `cleanPath`, `engines.js` `given` |
| W4 | `shell.trashItem` on a network share, a mapped network drive or a USB stick deletes **for good** on Windows (no Recycle Bin there) | Hearth only recycles on a local fixed drive (system drive always; others asked once with `[System.IO.DriveInfo]`, cached, `$Recycle.Bin` as the fallback); otherwise the file stays and the chat is told why ("nothing was lost"). `\\?\` names and trailing slashes cleaned first | `trashCheck` in `fsapi.js` `trash` (every delete: chats' deletes, Astra's `.hearth-trash`, undo) |
| W5 | A failed move to the Trash showed "Failed to move item to trash" | plain words: already gone / open in another program / protected or antivirus / path too long / "nothing was deleted" | `trashError`; `access.js` passes it on as is |
| W6 | Windows' errors in a failed reply were raw (`'node' is not recognized…`, `Cannot find module …cli.js`, `spawn EINVAL`, `The command line is too long`, an old Node's `SyntaxError`, `EBUSY`, `spawn EPERM`) and some came with a Node stack trace | one plain sentence + "Fix:" + the button: **Install** (no Node.js / too old / too long / not for this PC), **Update** (half-removed npm install), **Run /doctor** (EINVAL, busy, antivirus); the raw line in brackets underneath; stack frames dropped from the failure line on every system; a synchronous spawn failure no longer escapes as an exception | `plainError`, `dropStack`; `engines.js` `friendlyError` (Windows only, after winshell's policy / sandbox notes), `lastErrorLine`, `send` |
| W7 | "Couldn't find Claude Code" didn't say where Hearth looked | lists them on Windows (PATH, npm's `%APPDATA%\npm`, nvm, Volta, scoop, winget, pnpm, the apps) | `engines.js` |
| W8 | /doctor called a pnpm / scoop / winget copy "on PATH", and nvm-windows / Volta / `nodejs` copies "on PATH" (Update ran the wrong thing) | kinds `pnpm` (updates with `pnpm add -g`), `scoop`, `winget`; nvm-windows / Volta / `Program Files\nodejs` are npm copies | `installs.js` `kindOf` / `updatePlan`, labels in `engine-health.js` |
| W9 | The chats' folder checks: `\\?\C:\…` / `\\.\C:\…` / `\\?\UNC\…` never matched the folder (always asked); `\x` (root of the current drive) was read as relative to the chat's folder (**inside**, silently allowed); `D:x` (drive-relative) was read as inside the chat's folder; `proj.` / `a.txt. ` (Windows drops those dots / spaces) didn't match; `..` could climb above a `\\server\share` | each normalised the Windows way (Windows' own trailing-dot rules: the last name loses trailing dots and spaces, a middle name its one dot, `...` stays a name; another drive is never inside) | `access-rules.js` `norm` |
| W10 | A refusal / outside-folder note didn't recognise `\\server\share\…` targets | recognised | `access.js` `whyNot`, `absPath` |
| W11 | Chrome on Windows: a plain env object with other key case missed the defaults; a 32-bit process didn't see 64-bit Program Files; Chrome Beta / Dev / Canary weren't found; "Chrome isn't installed" had no button | case-insensitive env, `ProgramW6432`, Beta / Dev / Canary after stable Chrome, **Get Chrome** button | `chrome-cdp.js` `candidates`, `chrome-ui.js` |

Reviewed and fine as they are: Chrome's App Paths registry lookup and LocalAppData installs (already there), `taskkill /T`
stopping the whole tree (so a cmd.exe-started engine stops too), PowerShell windows for update / sign-in (`& '…\claude.cmd'`
runs a .cmd fine), the MCP tool servers (started as Hearth's own Electron, an .exe), `fsapi` paths (`path.normalize` →
backslashes on Windows), `access.js` deletes taking a copy first (files up to 25 MB) before the Trash.

## Upgrades
### Claude / Codex found on Windows
1. Claude Code installed with npm (`claude.cmd` in `%APPDATA%\npm`) is found by itself, also when that folder isn't on Hearth's PATH.
2. Codex installed with npm (`codex.cmd`) is found by itself.
3. A custom npm folder (`npm_config_prefix` or `prefix=` in `~\.npmrc`) is looked in.
4. nvm-windows: the active Node's commands and every installed Node version's (newest first).
5. Node's own folder (`C:\Program Files\nodejs`) is looked in.
6. Volta's commands.
7. pnpm's global commands.
8. Bun's commands on Windows.
9. scoop (your shims and the machine-wide ones).
10. winget (its Links folder and its package folders).
11. Two copies in one folder (`claude.exe` and `claude.cmd`): the program is preferred.
12. Windows' own spellings of the environment (`Path`, `AppData`) and quoted / `%VAR%` PATH entries are understood.
### Started correctly
13. npm's `.cmd` copies start through their Node script: no "spawn EINVAL", no cmd.exe, every argument exactly as sent.
14. No Node.js installed? Hearth runs the script with its own Electron as Node.
15. A `.cmd` that points at a program (newer npm packages, Yarn chains) starts that program directly.
16. Any other `.cmd` / `.bat` goes through cmd.exe with every argument quoted (spaces, quotes, `&`, `%`, `^`, accents).
17. Version, sign-in, /doctor and connector checks start copies the same way (an npm copy shows its version and sign-in).
### Settings → Engines
18. A path pasted with quotes ("Copy as path"), `%APPDATA%`, `~` or a long-path `\\?\` prefix works.
19. npm's `claude` / `claude.ps1` paths, or just the folder, find the `.cmd` / program next to them.
### /doctor
20. pnpm, scoop and winget copies are named as such; a pnpm copy updates with pnpm.
21. nvm-windows, Volta and Node-folder copies are npm copies: Update runs npm.
### Plain errors with a fix button
22. "'node' is not recognized" → Node.js missing, with **Install** (the standalone version needs no Node.js).
23. "Cannot find module …cli.js" → an incomplete npm install, with **Update**.
24. "The command line is too long" → with **Install**.
25. A Node.js too old for the copy → with **Install**.
26. "spawn EINVAL", a busy file, the antivirus / SmartScreen → plain words with **Run /doctor**.
27. A crashed Node script's stack trace never shows; the failure line is the reason.
28. "Couldn't find Claude Code" lists where Hearth looked on Windows.
### Deletes stay recoverable
29. A file on a network share, mapped network drive or USB stick is never deleted for good: Hearth leaves it and says why.
30. A failed move to the Recycle Bin says what happened in plain words ("open in another program…", "nothing was deleted").
31. Long-path names and trailing slashes no longer make a move to the Recycle Bin fail.
### The chats' folders on Windows
32. `\\?\C:\…`, `\\.\C:\…` and `\\?\UNC\…` paths count as the folder they name.
33. `\Users\…` (root of the current drive) and `D:file` (another drive) are never mistaken for the chat's folder.
34. `proj.\a.txt` and `a.txt. ` match the files Windows really means.
35. `..` never climbs above a network share's root; a `\\server\share` target gets the "outside its folders" note.
### Chrome
36. Chrome Beta / Dev / Canary are used when stable Chrome isn't installed; a 32-bit Hearth sees 64-bit Program Files.
37. "Google Chrome isn't installed" has a **Get Chrome** button.

37 upgrades.

## Tested
- `node dev/winpolish-test.js` (in UNIT, 158 checks, no Windows needed): a fake Windows disk with path.win32 and an
  injected env: every install place above (and nothing from the other engine), npm's two shim forms, pnpm's, a shim to
  an .exe, Yarn's chain; the start plan for each (node.exe next to the shim / on PATH / Program Files / Electron as
  Node, .ps1 → .cmd, .js, unknown .cmd → cmd.exe /d /s /c verbatim); **cmd.exe quoting checked against a model of
  cmd.exe (^ removal, twice for a batch file) + the C runtime's argument splitting** on 15 awkward arguments, alone and
  as one line; Settings paths; the Recycle Bin guard (system / fixed / network / USB / CD / unknown with and without
  `$Recycle.Bin`, UNC, `\\?\UNC`, root, relative) and its plain errors; every plain error and its button; stack frames
  dropped; through a temp copy of engines.js: `friendlyError` on Windows (and not elsewhere, and winshell's policy note
  untouched), `lastErrorLine`, kinds / update plans; access-rules' Windows path forms (10 inside, 8 outside); Chrome's
  places with lower-case env keys.
- `sh dev/run-checks.sh unit:winpolish-test unit:access-test unit:astra-engine-test unit:winmac-test unit:chrome-test
  unit:robust-engine-test unit:liveness-test unit:connections-test unit:tokens-test unit:firstrun-test access-chat`:
  all passed. `node dev/winmac-scan.js`: 0 hits (the drive-type probe reviewed). `node --check` on every touched file.
- Not testable here: a real Windows PC (npm's real shim on the owner's machine, the drive-type probe, Electron's
  `trashItem` there). Each part falls back to the old behaviour when it can't decide (a direct spawn, or "ask" / "leave
  the file alone").

## Risks
- The Node-script route assumes npm's shim runs `node <script>` with nothing else (true for npm / pnpm / Yarn shims);
  a hand-written `.cmd` that sets variables first goes through cmd.exe instead (its newlines become spaces: the log says
  "via cmd").
- A second local drive that Windows reports as "unknown" and that never had a `$Recycle.Bin` is treated as having
  none: Hearth leaves the file and says so (safe, possibly over-careful).

## For the patch notes
- Fixed on Windows: Claude Code or Codex installed with npm (`claude.cmd` / `codex.cmd`) is now found and started by itself — no path to set. Hearth also looks in nvm-windows, Volta, scoop, winget, pnpm and Bun folders.
- npm copies start without cmd.exe (through their own Node script), so long instructions, quotes and `&` arrive exactly as sent; no Node.js installed? Hearth uses its own.
- Settings → Engines accepts a path pasted with quotes ("Copy as path"), `%APPDATA%`, or just the folder.
- Deletes stay recoverable on Windows: a file on a network share or USB stick (no Recycle Bin there) is left where it is, and the chat says why.
- Windows' own errors now read as one plain sentence with the button that fixes it (Install, Update or Run /doctor) — no more stack traces.
- The chats' folder checks understand every Windows way of writing a path (`\\?\C:\…`, `\Users\…`, `D:file`, `\\server\share`, trailing dots).
- Chrome Beta / Dev / Canary work for Google sign-in when stable Chrome isn't installed; "Chrome isn't installed" has a Get Chrome button.
- What to try on Windows: install Claude with `npm i -g @anthropic-ai/claude-code`, clear Settings → Engines → Claude, restart Hearth and send a message — then run /doctor: it shows the npm copy, its version and sign-in.
