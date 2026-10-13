# Mac + Windows polish (round 31, winmac)

The owner uses a Mac and a Windows PC every day. This stream audited the app for what behaves differently on the two
(paths, `file:` URLs, key names, programs a Dock launch can't find, shortcuts, notifications, the Dock), fixed what was
real, and left a scan + tests so it stays fixed. Nothing new on screen, no new setting, nothing added to any message.

New files: `winmac.js` (one set of helpers for both systems: `WinMac.fileUrl`, `fromFileUrl`, `baseName`, `dirName`,
`join`, `extOf`, `samePath`, `macKeys`, `withToolDirs`, `fixProcessPath`; loaded before `ui.js` in the window,
`require`d by `main.js`), `dev/winmac-scan.js` (static scan), `dev/winmac-test.js` (unit, in UNIT),
`dev/checks/winmac.js` (smoke check; `sh dev/run-checks.sh winmac`). Small edits elsewhere, listed in the table.

## The audit

| # | Issue | Where | Fix | How verified |
|---|---|---|---|---|
| A1 | `file:` URLs built by hand: a `#`, `?` or `%` in a file name cut the URL (the picture / video didn't load); some sent `file://C:\…` (drive read as a host) or `file:////Users/…` | Lab sequence (clip thumbnails, lengths, "latest renders" tiles: `tools/three-seq.js`), Lab notes / contact sheet / song cover / "Open images…" (`tools/three.js`), frames (`tools/three-frames.js`), camera input from a file (`tools/three-motion-in.js`), render probe (`renders.js`), chat attachment previews + show cards (`native.js`), Forge Debug (`tools/forge.js`, `tools/forge-game.js`) | all through `WinMac.fileUrl` (every name part encoded, drive kept, `\` read as `/`, UNC share as the host, `\\?\` long names stripped) | unit: 9 awkward names × 6 roots × win32 / posix, Node's `fileURLToPath` (Windows rules for Windows paths) gives the same path back; smoke: a PNG named `Músique 100% #2 ?.png` loads (3×2) through the new URL, the old `file://${path}` fails |
| A2 | Paths joined with `/` in the window: `C:\Users\me/Hearth exports/x.mp4` shown to the owner, and not equal to the same file named by Node | Lab exports + sequence render names (`tools/three-export.js`, `tools/three-seq.js`), `.cube` grades (`tools/three-grade.js`), lyric exports (`tools/three-type.js`) | `WinMac.join(dir, name)`: the folder's own slash | unit: equals `path.win32.join` / `path.posix.join`; smoke: one slash kind |
| A3 | Forge Debug on the Mac joined with `\`: files saved as `outputs\notes.md` next to the folder; every file looked top-level | `tools/forge.js` | the folder's own slash; "top-level" checks both slashes | `node --check`; scan |
| A4 | Started from the Dock / Finder, a Mac app gets `PATH=/usr/bin:/bin:/usr/sbin:/sbin`: an npm `claude` / `codex` (a Node script: "env: node: No such file"), `gh` for Report, Homebrew `ffmpeg` / `git` for the chats' own commands and MCP tools went missing (each module only patched its own lookups) | `main.js` (first lines) | `WinMac.fixProcessPath()`: Homebrew, `/usr/local`, MacPorts, `~/.local`, npm-global, volta, bun, `~/bin` and the newest nvm Node added at the END of PATH, only folders that exist, once; Windows / Linux untouched | unit: the Dock PATH gets them, the shell's order is kept, no duplicates, idempotent, Windows / Linux unchanged |
| A5 | Mac: with "Closing the window keeps Hearth running", a Dock click did nothing (only the menu-bar icon brought the window back) | `main.js` | `app.on('activate')` shows the hidden window | code read (no Mac here) |
| A6 | Mac: "Ctrl+…" in toasts, placeholders, hint text, menu labels ("Token dashboard (Ctrl+Shift+U)") and the node editor's key column (tooltips, menu keys and the keys sheet were already ⌘) | `ui.js` (`el` placeholder / `…hint` text, `toast`), `renderer.js` (`menuButton` label), `nodes.js` (menu key) | `macText` → `WinMac.macKeys` (Ctrl+ → ⌘, Alt+ → ⌥; "Ctrl+click / drag" stay: the Mac's right-click) | unit (`macKeys`); smoke: unchanged off the Mac, no page errors |
| A7 | Mac: the global show / hide hotkey is Control+Alt+H, but the keys sheet and the shortcuts list said ⌘⌥H (which hides other apps) | `keys-ui.js`, `appui.js` | shown as ⌃⌥H on a Mac | `node --check` |
| A8 | Windows: shortcuts made through PowerShell carried no app id, so Windows may not show Hearth's notifications (`setAppUserModelId('Hearth')` needs a Start-menu shortcut with that id); the desktop shortcut went to `%USERPROFILE%\Desktop` even when OneDrive moved the Desktop; a `'` in the app folder broke the PowerShell line | `appshell.js` `createShortcuts` | `shell.writeShortcutLink` with `appUserModelId: 'Hearth'`, `app.getPath('desktop')`; PowerShell kept as the fallback, quote escaped | `node --check` (no Windows here); click Settings → "Create Start menu & desktop shortcuts" once to refresh old ones |
| A9 | Nothing stopped these patterns coming back | — | `dev/winmac-scan.js` (9 rules, reviewed hits listed in it) at 0, enforced by `dev/winmac-test.js` | `node dev/winmac-scan.js` → 0 hits; the test plants one of each and the scan catches all 9 |

Reviewed and fine as they are (no change):

| Area | What was checked |
|---|---|
| High-DPI capture | `capturemain.js` takes device pixels (`scaleFactor`), the window's `devicePixelRatio` in `capture.js`. |
| Drag and drop from Finder / Explorer | every drop reads paths with `webUtils.getPathForFile` (`hub.pathForFile`); the Lab reads dropped media through `fs` (no URL); spaces / accents fine. |
| CRLF | `.srt` / `.vtt` / `.lrc` parsers drop `\r` first, `md.js` turns `\r\n` into `\n`, `theme.css` is CSS (either works), memory lines are trimmed. |
| Extension case (.JPG / .MOV) | every media test lower-cases or uses `/i` (scan rule `ext-case`: 0). |
| Long paths on Windows | Node's `fs` names paths `\\?\…` by itself (deep data folders work without LongPathsEnabled; unit-checked with `path.win32.toNamespacedPath`); "Check this computer" already reports LongPathsEnabled; `WinMac.fileUrl` strips `\\?\`. |
| One-OS commands | `osascript`, `open`, `reg`, `powershell.exe`, `taskkill`, `ps`, `sh` all sit inside their platform branch; no `shell: true`, no command strings (`exec`) anywhere. |
| Finding ffmpeg / git / Chrome / claude / codex | ffmpeg: Homebrew + winget / scoop / choco folders (`framereader.js`, `aemain.js`); Chrome: both systems + Windows' App Paths registry; claude / codex: PATH, desktop apps' folders, installers (`installs.js`). |
| Notifications | app id set on Windows (now also on the shortcuts); the Mac asks once by itself. |
| Quitting on the Mac | ⌘Q = the menu's Quit role → `before-quit` flushes saves; the tray's Quit and Restart set the quitting flag first. |
| Paths compared in Access rules | normalised to `/` and lower case on Windows; on a Mac a case mismatch only makes Hearth ask (safe). |

Left as they are (noted for later):
- **Windows + Claude installed with npm** (`claude.cmd`): the engine lookup takes `claude.exe` only (native installer, desktop app). Running a `.cmd` needs `cmd.exe` quoting of every argument: not changed blind without a Windows machine.
- **Closing the last window on a Mac quits Hearth** (as on Windows). Mac-style "keep running" is the existing setting "Closing the window keeps Hearth running"; with it the Dock click now brings the window back (A5).
- The Mac menu-bar icon is the colour 16 px icon, not a monochrome template image.
- Replies of typed commands that mention "Ctrl+…" still say Ctrl on a Mac (commands are rarely typed now).
- Forge Debug's default folders are the owner's Windows paths; "Choose the Forgeheart folder…" sets them on the Mac.

## Upgrades
### Files with any name
1. Lab sequence: clips whose file name has `#`, `?` or `%` show their thumbnail and length (were blank / 0 s).
2. Lab sequence: the "latest renders" tiles show their picture for any file name.
3. Lab notes: the note's picture, the contact sheet, the song cover and "Open images…" load for any file name.
4. Frame tools (frame cards, contact sheets) load any file name.
5. Camera input from a video file: any file name plays.
6. Renders: a finished render's size / length is read for any file name.
7. Chat: attached pictures and contact sheets preview for any file name.
8. Chat: "show" cards (pictures a chat shows) load for any file name.
9. Forge Debug: project pictures and the game build view load with any file name.
10. Pictures on a network share (`\\NAS\share\…`) and in very deep folders (`\\?\C:\…`) load as pictures.
### One slash kind per path
11. Lab exports are named with the folder's own slash (`C:\Users\me\Hearth exports\…` on Windows).
12. Sequence renders: the same.
13. `.cube` grades saved from the Lab: the same.
14. Lyric exports (`.lrc` / `.srt`): the same.
15. Forge Debug on a Mac writes notes, logs and release zips inside the project folder (were saved next to it, named `folder\name`).
16. Forge Debug on a Mac lists the builds and backups of the folder itself (subfolders were mixed in).
### Mac
17. Started from the Dock, Hearth finds Homebrew / npm / nvm / volta / bun programs: Claude or Codex installed with npm, `gh` for Report, `ffmpeg`, and what the chats run.
18. Clicking Hearth in the Dock brings back a window that "Closing the window keeps Hearth running" hid.
19. Toasts say ⌘ (not Ctrl).
20. Search boxes' grey hints say ⌘.
21. Small hint texts (menus, dialogs) say ⌘.
22. Menu rows like "Token dashboard (⌘Shift+U)" say ⌘.
23. The node editor's menu keys say ⌘.
24. The keys sheet shows the show / hide hotkey as ⌃⌥H (the real Control key).
25. The keyboard shortcuts list: the same.
### Windows
26. "Create Start menu & desktop shortcuts" makes shortcuts with Hearth's app id: Windows shows Hearth's notifications.
27. The desktop shortcut lands on the Desktop you see, also when OneDrive moved it.
28. Shortcuts work when the Hearth folder's name has an apostrophe.
### Kept fixed
29. `node dev/winmac-scan.js`: a scan for patterns that break on one of the two systems (9 rules; `--all` shows the reviewed ones).
30. `node dev/winmac-test.js` (in UNIT, 595 checks) + `sh dev/run-checks.sh winmac`.

30 upgrades.

## Tested
- `node dev/winmac-test.js`: 595 checks (file URLs with win32 and posix paths and Node's own reader, names / dirs / joins against `path.win32` / `path.posix`, long and UNC paths, key names, the Mac PATH, the scan at 0 and catching planted patterns).
- `sh dev/run-checks.sh winmac`: the smoke check (WinMac loaded, an awkward-named PNG loads through the new URL and not the old one, toasts / placeholders / hints / menus unchanged off the Mac) + the unit test. No page errors.
- `node dev/boot-test.js` (838 checks: the new script tag), `node --check` on every touched file.
- Not testable here: a real Mac (Dock launch PATH, Dock click, ⌘ text) and a real Windows PC (shortcut app id, notifications, OneDrive Desktop); each fix is a few lines and falls back to the old behaviour on error.

## For the patch notes
- Pictures, videos and songs whose file names have `#`, `?`, `%` or accents now show everywhere (Lab sequence, Lab notes, chats, renders, Forge Debug), on both computers.
- On a Mac, Hearth started from the Dock now finds programs installed with Homebrew or npm (Claude / Codex from npm, ffmpeg, GitHub's `gh` for Report).
- On a Mac, clicking Hearth in the Dock brings the window back when "Closing the window keeps Hearth running" hid it.
- On a Mac, toasts, search hints and menu rows say ⌘ instead of Ctrl; the show / hide hotkey is shown as ⌃⌥H (it is the Control key).
- On Windows, exports and renders are named with backslashes only (no more `C:\Users\me/Hearth exports/…`).
- On Windows, re-create the shortcuts once (Settings → "Create Start menu & desktop shortcuts") so notifications show as Hearth's; the desktop one now lands on your OneDrive Desktop if that's where yours is.
- Forge Debug works on the Mac too (it used to save notes next to the project folder).
- Caveat: Claude installed with npm on Windows (`claude.cmd`) still isn't found; the installer and desktop app versions are.
