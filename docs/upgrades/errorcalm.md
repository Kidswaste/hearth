# Errors in plain words (round 45, errorcalm)

Rounds 32–34 made errors plain area by area: winpolish (Windows' engine errors), macpolish (the Mac's), offline (no
internet, busy, limits, signed out) and aicheck (Check this AI). Everywhere else, an error still reached you as the
computer wrote it: `ENOENT: no such file or directory, open '…'`, `Error invoking remote method 'fs:read'…`,
`TypeError: Cannot read properties of undefined`, `spawn ffmpeg ENOENT`, a JSON blob.

Now every error you can see, anywhere in the app, is **one plain sentence with the one action that fixes it**. What the
computer actually said waits behind a small **▸ Details** fold (with Copy), and it still goes with a report (⚑).
Nothing new on screen when nothing goes wrong, no new setting, nothing added to any message (0 tokens).

## How it works
- `errorcalm-core.js` (pure, Node-tested) reads a raw error and returns `{ text, action, raw }`. It asks the maps that
  already exist first, so nothing is duplicated:
  - `offline-core.js` for no internet / busy / limits / signed out / proxy
  - `renders-core.js` for ffmpeg's own failures
  - `winpolish.js` / `macpolish.js` for the engines' Windows / Mac errors (in Node: main process, tests)

  It only adds what nobody mapped: Node's file errors (with the file named), Electron's IPC wrapper, HTTP statuses for an
  app (Meshy, Suno…), Chromium's network errors, a program that can't start, WebGL / the graphics card, JSON, ffmpeg exit
  codes, code errors inside Hearth, and a Lab scene's code errors.
- The owner's own words before the raw part are kept: `Couldn't load song.wav: ENOENT…` becomes `Couldn't load
  song.wav: it isn't there any more (moved, renamed or deleted).`
- A message that already reads plain is left exactly as it is.
- `errorcalm.js` (lazy group `errorcalm`, loaded right after the first frame) shows it and runs the action:
  - **Retry**: only where the place can retry.
  - **Show file / Show folder**: the file, or the nearest folder that's still there.
  - **A Settings or ⋯ AI setup row**, opened through Find anything's targets: Sync settings, Meshy key…, Claude
    program, Codex program, Files it can use, Install ffmpeg… (Check this computer).
  - **Check this AI**, **Restart Hearth**, **Report…**, **🩺 Fix my scene**.
- `ui.js` hands every error toast to it (`toast(msg, { type: 'error', raw?, calm?, retry? })`). Toasts already up
  before it loaded are calmed when it loads. `calmError(err, ctx)` is the one-line helper for any other place.

## Inventory: where an error reaches you (place → before → now → action)
| # | Place | Before | Now | Action |
|---|---|---|---|---|
| 1 | **Every error toast**: 577 `toast(…, { type: 'error' })` sites in 158 files, 453 of them passing `err.message` / `r.error` as is. Areas: Lab 240, chats 29, board 24, capture 19, apps 16, renders 6, sync 5, updater 5, Adobe 3, packs 3, templates 3, recipes 2, deploy 1… | the raw text, e.g. `Error invoking remote method 'fs:read': Error: ENOENT: no such file or directory, stat '/…/none.txt'` | `“none.txt” isn't there any more (moved, renamed or deleted).` + ▸ Details | Show folder (or the fitting action below) |
| 2 | Same family: IPC / Node codes (EACCES/EPERM, EBUSY, ENOSPC, EEXIST, EISDIR, ENOTDIR, ENOTEMPTY, EROFS, ENAMETOOLONG, EMFILE, EXDEV, ENOMEM, EADDRINUSE) | `EBUSY: resource busy or locked, open '…'` | `“scenes.json” is open in another program — close it there, then try again.` | Show folder / Retry / Restart |
| 3 | Same family: `No handler registered for '…'` | raw | `This part of Hearth was updated while it ran and needs a restart.` | Restart Hearth |
| 4 | Same family: code errors inside Hearth (TypeError, `x is not a function`, `[object Object]`, `undefined`) | `TypeError: Cannot read properties of undefined (reading 'layers')` | `Something went wrong inside Hearth (not your fault).` | ⚑ Report (the toast's own) |
| 5 | Same family: an app's HTTP status (401/403, 402, 404, 400/422, 408/504, 413) | `HTTP 401` | `Meshy didn't accept your key — paste it again.` | Meshy key… (Settings row) |
| 6 | Same family: no internet / busy / proxy / signed out (offline-core) | `getaddrinfo ENOTFOUND api.meshy.ai` | `There's no internet connection to Meshy right now — check it, then try again.` | Retry |
| 7 | Same family: a local app not running | `connect ECONNREFUSED 127.0.0.1:4455` | `OBS isn't running or not ready yet — open it, then try again.` | Retry |
| 8 | Same family: programs | `spawn ffmpeg ENOENT` | `ffmpeg isn't installed, so Hearth can't make or read this video here.` | Install ffmpeg… |
| 9 | Same family: WebGL | `THREE.WebGLRenderer: Context Lost.` | `The graphics card reset the preview — it rebuilds by itself; restart Hearth if it stays blank.` | Restart Hearth |
| 10 | Same family: JSON | `Unexpected token < in JSON at position 0` | `The answer came back garbled — try again.` (for a file: `“x.hearthpack” is damaged…`) | Retry / Show file |
| 11 | Recent notifications (Ctrl/⌘+K) | the raw toast text | the plain sentence | — |
| 12 | "Something broke inside Hearth: <raw>" (devreport's page-error offer) | the raw first line | `Something broke inside Hearth.` + Details | Report to the developer |
| 13 | "Couldn't open the report" (devreport) | `…: <err.message>` | plain + Details | — |
| 14 | **A failed reply** in a chat (engines.js `<raw>\n\nFix: …`) | `spawn /…/claude EACCES` then the Fix line | `Hearth couldn't start “claude”: it isn't a program this computer lets it run.` + the Fix line + Details | Run /doctor (engine-health), else Claude program / Check this AI |
| 15 | A failed reply on Windows / Mac (`<plain>\n\nFix: …\n\n(<raw>)`) | the raw line in brackets under it | the raw line moves into Details | the existing Install / Update / Allow… |
| 16 | A command's one-line note in a chat (`ctx.say`, `Native.note`) | `Couldn't save the preset: EACCES: permission denied, open '…'` | `Couldn't save the preset: Hearth wasn't allowed to open “preset.json” (…).` + Details | Show folder |
| 17 | **The Lab console** (scene code errors) | only raw lines (`ReferenceError: THREEE is not defined`) | one plain line above them: `Your scene uses “THREEE” on line 4, which doesn't exist (a typo, or something not loaded).` The raw lines stay for code work. | 🩺 Fix my scene |
| 18 | **Sync**: the dot's line / menu in the error state | `…: ENOTDIR: not a directory, scandir '…'` | `…: part of that path is a file where Hearth expected a folder` | Sync now (menu) |
| 19 | Sync: Sync now, error | the line, as an info toast | `Sync couldn't finish with Dropbox: …` + Details | Retry / Sync settings |
| 20 | Sync: the folder gone | `Offline: cloud isn't reachable…` (no button) | the same plain line + Details (which folder) | Pick the folder again… / Start it again from here |
| 21 | **A failed render** (render queue note) | plain reason + Fix (round 13); what ffmpeg said only in "Why it failed…" | same + ▸ Details with what ffmpeg said | ↻ Retry |
| 22 | A song / video not on this computer (twocomputers note) | plain + Find this file | same + Details (what the computer said) | Find this file |
| 23 | A song that can't be opened (the Lab, without twocomputers) | `Couldn't open gone-song.wav: Error invoking remote method…` | `Couldn't open gone-song.wav: it isn't there any more (…)` | Show folder |
| 24 | App window page didn't load (apps-window.js) | `Suno didn't load (ERR_NAME_NOT_RESOLVED). Offline?` | `Suno didn't load: Suno couldn't be reached — check the internet connection, then try again. ↻ tries again.` (raw in its tooltip) | ↻ |
| 25 | Meshy job failure said in a chat | the error as given | `calmError(…, { app: 'Meshy' })` | — |
| 26 | 🛟 Recover… "Couldn't look" (datasafe) | `Couldn't look: <raw>` | plain | — |
| 27 | Lab 🛟 Recover lost scenes "Couldn't look" | raw | plain | — |
| 28 | A tool that failed to load (tools.js) | `This tool failed to load: <err.message>` | plain | — |
| 29 | A lazy feature that didn't load (lazy.js) | `<name> didn't load: <err.message>` | plain | — |
| 30 | 📐 Templates preview caption | `⚠ <e.message>` | `⚠ <plain>` | — |
| 31 | Lab batch preview caption | `⚠ <e.message>` | `⚠ <plain>` | — |
| 32 | Lab class list (three.js reference) | `Couldn't load the class list: <raw>` | plain | — |
| 33 | Kit: colors from a picture | raw | plain | — |
| 34 | 📰 Patch notes reader | raw | plain | — |
| 35 | Discover panes | raw | plain | — |
| 36 | Asset library search note | raw | plain (`The asset library …`) | — |
| 37 | ⚡ Hook couldn't send (note) | `⚡ hook couldn't send: <raw>` | plain | — |
| 38 | Check this AI: "The check stopped" | raw | plain | Check again (existing) |
| 39 | Phone remote: a failed action's toast | raw | plain | — |
| 40 | Forge: package the zip | raw | plain | — |
| 41 | The loading screen: "Something went wrong while starting" | `…: <raw>` | plain (raw in its tooltip) | (its existing way in) |
| 42 | Updater / safe updates | the one-fix dialog (round 37, already plain); its toasts | toasts calmed (row 1) | the dialog's fix |
| 43 | Dialogs: render "Why it failed…" | plain reason + Fix + "ffmpeg said" | kept (already plain, raw labelled) | — |

43 places: one central family (every error toast: 577 sites) plus 42 individual places.

Audited and left raw on purpose, listed in `dev/errorcalm-baseline.json`: places where you work on code, like the Lab
console's own rows, the shader workbench's error lens, a shader layer's compile rows and the shader import box. A
batch tile that shows ⚠ keeps the raw reason only in its tooltip.

## Upgrades
### One sentence, one action
1. Every error toast in the app now reads as one plain sentence (577 places, Lab, chats, board, capture, apps, Adobe, deploy, packs, templates, recipes, sync, updates).
2. ▸ Details under the sentence holds what the computer said, word for word, with Copy (for reports).
3. Opening Details keeps the note on screen until you close it.
4. Your own words before the error are kept ("Couldn't load song.wav: it isn't there any more…").
5. Files are named in the sentence ("“scenes.json” is open in another program…").
6. Show file / Show folder: the file, or the nearest folder that's still there when it was moved.
7. A Settings row as the fix: Sync settings, Meshy key…, Claude program, Codex program, Files it can use, Install ffmpeg… (opened on that row through Find anything).
8. Check this AI as the fix for an engine that's missing.
9. Restart Hearth as the fix when part of Hearth was updated while it ran, the graphics card reset, or too many files are open.
10. Code errors inside Hearth say "not your fault" and offer the report (⚑).
11. Recent notifications (Ctrl/⌘+K) list the plain sentences.
### In the chats
12. A failed reply shows one plain sentence + the Fix line; the raw text moves into Details.
13. The Windows / Mac engine errors' raw line in brackets moves into Details.
14. A command's one-line raw note ("Couldn't save…: EACCES…") is calmed, with Details and its fix.
15. An engine program that isn't a program ("spawn … EACCES") says so plainly.
### The Lab
16. One plain line above the console for the scene's latest error ("Your scene uses “THREEE” on line 4, which doesn't exist…"), with 🩺 Fix my scene; the console keeps the raw lines for code work.
17. Eight kinds of scene errors in plain words: a name that doesn't exist, reading from something not there yet, calling something that isn't a function, a typo, a shader that doesn't compile, endless recursion, too much memory, a file it couldn't load.
18. The plain line goes away by itself when the console has no error left (Clear, a fixed run), or with ×.
19. Templates' and batch previews' "⚠" captions are plain.
### Sync, renders, files from the other computer
20. Sync's error line is plain; Sync now names what failed ("Sync couldn't finish with Dropbox: …") with Retry / Sync settings and Details.
21. The sync folder gone: the line says so with one click to fix ("Pick the folder again…" / "Start it again from here").
22. A failed render's note keeps its plain reason and now has Details with what ffmpeg said.
23. A song or video not on this computer: Details holds what the computer said.
### Apps and the rest
24. An app's service in plain words: a refused key (→ its key row), out of credits, not found, too big, too slow, busy, no internet, a VPN / proxy.
25. An app window that can't load its page says why in plain words (the raw code in its tooltip).
26. A local app not running (OBS, Adobe's bridge…) says "isn't running or not ready yet".
27. 🛟 Recover, Lab scene recovery, a tool / feature that didn't load, hooks, Check this AI, the phone remote, Forge's zip, the patch notes reader, Discover, the asset library, Kit colors and the loading screen: plain sentences.
### For the next stream
28. `calmError(err, ctx)`, `ErrorCalm.node(err, ctx, { retry })` and `toast(msg, { type: 'error', raw, calm, retry })` are the one way to show an error.
29. `node dev/errorcalm-scan.js` lints new code that would show a raw error (in UNIT; the audited list in dev/errorcalm-baseline.json).

29 upgrades.

## Tested
- `node dev/errorcalm-test.js` (in UNIT, 313 checks): 49 real raw texts. For each one:
  - its sentence and action (and the Settings row it opens)
  - no jargon in any sentence (isRaw is false on every output)
  - one sentence each
  - the raw text kept for Details

  It also covers:
  - leads kept (and a path never taken for one)
  - a lead that already says it broke
  - plain messages left exactly as they are ("line 401 is fine", "Copied as json")
  - eight Lab scene errors
  - the reuse of winpolish (simulated Windows), macpolish (simulated Mac), renders-core and offline-core
  - the helpers and the lint's rules
- `node dev/errorcalm-scan.js` (in UNIT): a self-test of 14 lines, then the app: 0 new findings, 4 audited.
- `dev/checks/errorcalm.js` (group `errorcalm`, fake engines, throwaway folder) provokes real errors: 31 steps, all passing. Each must read as one plain sentence + one action, with the raw text in Details:
  - a real IPC failure shown the old way. It names the file, Show folder runs, Details opens and keeps the toast up.
  - a missing song through the Lab's load path
  - ffmpeg on a damaged .mp4 through the render queue: Retry, and Details holds "Invalid data found…"
  - the sync folder removed: "Pick the folder again…"
  - Settings → Engines pointing at a text file: a real `spawn … EACCES`. The failed reply is plain, Run /doctor is there, and Details holds the raw text.
  - a Lab scene error: the plain line with 🩺 Fix my scene, while the console keeps the raw row
  - a command's raw note
  - a refused key: "Meshy key…" opens Settings on that row
  - no jargon anywhere, no page errors
- Also run (machine load 25–35):
  - These passed: `lazy`, `unit:boot-test` (first screen still 72 scripts / 29 sheets), `fastboot`, `offline` + `unit:offline-test`, `sync` + `unit:sync-test`, `devreport` + `unit:devreport-test`, `datasafe` + `unit:datasafe-scan` + `unit:store-thread-test`, `hintcalm`, `options`, `settingscalm`, `missions`, `labeasy`, `motionpolish`, `unit:winpolish-test`, `unit:macpolish-test`, `unit:renders-test`. `qa-keys` also passed when re-run alone.
  - The a11y audit passes (0 findings), but its run logged a SwiftShader shader / WebGL console error. The untouched base logs WebGL errors too.
  - `appsearch` ("Where its tokens go" fold), `labsearch` (keystroke timing, "backdrop") and `unit:datasafe-test` (token stats) fail the same way on the untouched base commit (a3341cf), run side by side, so this round didn't cause them.

## Risks
- The calm layer only rewrites a message that reads raw (a Node code, a stack, JSON, `undefined`, spawn, IPC, an HTTP
  status…). A plain message is never touched, but an app message that happens to contain the word "JSON" or
  "undefined" is now said in general words. The exact text is still in Details.
- A command's note is calmed only when it is one short line that reads like an error. Longer outputs (/doctor, tables,
  code) are left alone.
- Toasts shown before the lazy group loads (the first ~second) are calmed when it loads, not at once.
- Retry shows only where the place gave a way to retry (sync). Elsewhere the sentence says "try again".

## For the patch notes
- Errors now speak plainly everywhere: one sentence that says what happened and the one thing to do, never "ENOENT", stack traces or JSON.
- Each error has its fix as a button where there is one: Show folder, Retry, the right Settings row (Sync, Meshy key, Claude program, Install ffmpeg…), Check this AI, Restart Hearth, or 🩺 Fix my scene.
- What the computer actually said is still there, behind a small ▸ Details under the sentence (with Copy). Reports (⚑) send it along.
- The Lab console gets one plain line above it for your scene's error ("Your scene uses “THREEE” on line 4, which doesn't exist") with 🩺 Fix my scene; the raw lines stay below for code work.
- Failed replies, command notes, sync, failed renders and app windows (Meshy, Suno…) follow the same rule: "Meshy didn't accept your key — paste it again" with its Meshy key… button.
- If the sync folder disappears, the note says so and offers "Pick the folder again…".
- Caveat: tested with real errors provoked on throwaway files and simulated engines, not yet on the owner's Mac / PC. An error the mapper doesn't know reads "Something unexpected went wrong" with Report, and its exact words are still in Details.
