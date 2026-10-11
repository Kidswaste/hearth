# Splash (round 19): a loading screen, and a lighter start

You asked: "add a loading screen; reduce the load still as much as you can". Hearth now opens on a loading screen in
its own look, drawn in the window's very first frame, that follows what the start is really doing and gets out of the
way the moment the first screen is usable. Behind it, the start does less before you see anything.

## Numbers
Cold launches (`node dev/coldstart-report.js`, a warm-up launch then 5, three interleaved rounds of the round-18 build
and this one: 15 launches each, medians, ms from the moment the process starts; headless Linux, Xvfb, software GL):

| What | Before | After | |
|---|---:|---:|---|
| Main process: app ready | 154 | 157 | same (Electron's own start) |
| Main process: modules main.js requires before the window | 22 ms | 19 ms | engines / importer / now-playing on first use |
| Main process: app ready → window made | 22 | 21 | |
| With sync on: window made after the startup sync pass | + up to 1,500 | + 0 | the pass now runs beside the page (91 ms on a test drive) |
| Window on screen | 200 (empty, its background color) | 448 (with its first frame) | shown on ready-to-show, 0.25 s at most |
| **First frame drawn (ready-to-show): what you see first** | **815** (the whole app) | **467** (the loading screen) | **−43 %** |
| Main process: app ready → first frame | 654 | 310 | −53 % |
| First screen ready ('hearth:ready') | 494 | 490 | same |
| Every 'soon' feature loaded | 961 | 1,330–1,460 | later here, see below |
| Startup IPC: calls / main-process work in the first 5 s (before / after items 20–21) | 32 / 20 ms | 31 / 16 ms | no git fetch, doctor after the first screen |
| Stylesheets read before the first screen | 27 · 453 KB | 25 · 421 KB | −32 KB |

Reloads (`node dev/perf-report.js --startup-only --no-stream`, 5 reloads, interleaved): ready 219 → 226 ms (same),
interactive 219 → 236 ms, CSS parse 46 → 26 ms, script evaluation 64 → 60 ms, long tasks 0 → 0. The page's
"first contentful paint" moved 205 → 287 ms and the main thread's busy time 458 → 578 ms: the app's own first full
paint now happens when the loading screen leaves (the screen covers it until then).

Why "every feature loaded" is later here: on this machine the first swap of a frame to the screen takes ≈ 0.35 s of
software drawing, and the app's full first paint now comes after the loading screen instead of before; that work
lands while the features load in idle moments, so a few of those moments come later (with the window shown at once
instead, they finished at ≈ 1.1 s). On a Mac's GPU those paints take a few ms. Nothing waits on them: every command,
menu and key works from the first screen (a feature used before it's in loads first, as before).

## Upgrades
### The loading screen
1. **A loading screen from the first frame.** The Hearth mark (the app icon's flame, rainbow rim and three embers),
   HEARTH, a thin bar and one line of status, on the Forgeheart background. It's written into index.html itself (no
   file, font or stylesheet to load first), so it's what the window's first frame shows.
2. **No white or off-color frame.** The window is made hidden, painted in the loading screen's color, and shown with
   its first frame (Electron's ready-to-show), at most 0.25 s after it's made. A maximized window maximizes at that
   moment (maximizing used to show the empty window early).
3. **The bar follows real steps**: Starting… → the app's scripts are in ("Reading your chats…") → your chats, history
   and settings are read ("Opening your last view…") → the first screen is up. Then the screen fades out in 0.18 s.
4. **Features still loading: a hairline.** If the features that load after the first screen (Lab, board, capture,
   Commands page, renders, Adobe, deploy, apps, Discover, Studio) are still arriving 0.15 s after it, a 2 px line
   along the top edge fills as each one lands, then fades. It doesn't move between steps (no animation running while
   they load).
5. **"Taking longer than usual…" with the reason**, after 2.5 s on one step: what it's waiting for in plain words
   (reading your chats / history / settings, checking where Claude Code and Codex are installed, loading your look),
   a sync pass with your cloud drive (named), saved data waiting on that pass, the app's main process not answering,
   or "loading Hearth's scripts" / "building the first screen". The reason refreshes every 2 s, and only then does the
   flame's glow breathe.
6. **An error before the first screen shows on the loading screen** ("Something went wrong while starting: …")
   instead of leaving you looking at a frozen window.
7. **"Open anyway"** appears with any slow-start or error message and takes you straight into the app.
8. **Never longer than needed**: it leaves the moment the first screen is ready, and after 15 s at the very most.
   In the Swirl look it waits up to 0.6 s for that look's stylesheet, so the first screen never shows unstyled.
9. **Reduce motion is respected**: no fade, no easing, no breathing glow; the screen simply goes.
10. **Reloads look the same**: a reload (⟳, ⬆ Update, a hot reload) shows the loading screen instead of a blank flash.
11. **The mark is drawn in solid layers**, not SVG gradients: with gradients, the first frame took ≈ 0.3 s longer on
    software graphics (measured: first paint 1.27 s → 0.82–0.90 s here).

### See how a start went
12. **`/startup`** (alias `/boot-time`): this start step by step, in time since launch: app ready → window made →
    first frame (the loading screen) → on screen → scripts in → chats read → first screen ready → every feature loaded;
    the sync pass at launch (how long your data waited for it; the window doesn't); and, after a few starts, the
    typical numbers of the last 12.
13. **Ctrl/⌘+K → "Startup: how long Hearth took to open"** runs the same.

### A lighter start: before the window opens
14. **Cloud sync no longer holds the window back.** With sync on, Hearth waited for the startup sync pass (up to
    1.5 s) before it even made the window. Now the window opens at once, and only reading or writing your data
    (settings, chats, history, saved data, memory) waits for the pass, which runs while the page's scripts load.
    /startup shows how long the pass took.
15. **Three main-process modules load on first use** instead of before the window: the Claude Code / Codex plumbing
    (engines.js, ≈ 4–8 ms: it's needed a moment later, for the first screen's engine check, while the page loads), the
    past-chats importer, and "what's playing" for the Lab's live sound.
16. **The tray icon and its menu, the downloads handler, the global hotkey, the login item and the spellcheck
    languages are set up right after the window is on screen**, not before it.
17. **The window no longer reads config.json just for its background color** (it's the loading screen's color now).

### A lighter start: in the window
18. **Settings are read at the same time as your chats** (they were read after).
19. **The Claude Code / Codex install check never holds the first screen more than 0.4 s.** Unknown counts as found,
    as it did before the check; a late answer still lands for the next new chat.
20. **Astra's "is Codex there and signed in?" check** (it runs Codex and Claude to read their versions) waits until
    the first screen is up and the app is idle.
21. **⬆ Update no longer runs a git fetch on the window's first focus at launch** (git and the network while the first
    screen is built). Its check 25 s in, and the check when you come back after 10 minutes away, stay.
22. **capture.css (21 KB) loads with capture** (right after the first screen), back in its old place among the
    stylesheets so every rule wins or loses as before.
23. **swirl-skin.css (11 KB) loads only in the Swirl look**, in its old place right after forge-skin.css.
    Stylesheets read before the first screen: 27 → 25 (453 → 421 KB).

### For developers
24. `node dev/coldstart-report.js`: real cold launches (one warm-up, then N), each measured from the process start:
    app ready, window made, on screen, first frame (ready-to-show), first screen ready, every feature loaded, the
    main process's time from ready to the window on screen, what each module main.js requires costs, every IPC call
    of the first 5 s (count and main-process time per channel). `--app <dir>` measures another copy (for before →
    after), `--trace` records every process, `--shot` / `--hold` take a picture of the loading screen (held past its
    "taking longer" message), `--groups` prints when each feature group loaded. Main-process times come from
    `dev/boot-probe.js` (NODE_OPTIONS=--require), so old builds measure the same way.
25. `dev/checks/splash.js`: the milestones in order, the splash and the line gone, `/startup` and its Ctrl+K line,
    boot:status, capture.css in its place, the Swirl sheet only in Swirl (in its place, the splash waiting for it), a
    held splash saying why and "Open anyway" letting you in.
26. `Splash.track(what, promise)` names a startup wait (the slow message says it), `Splash.step(name)`,
    `Splash.state()`; `window.hub.bootStatus()` (main: boot times, sync pass, reads waiting); a lazy group's
    `cssBefore` puts its stylesheet back where index.html had it.

## Measured but left alone (and why)
- **V8 code cache for the window's scripts**: Chromium caches compiled code only for http(s) and custom schemes
  registered with `codeCache`, not file://. Tried `v8CacheOptions: 'bypassHeatCheck'`: the trace shows 166
  `v8.produceCache` calls of ≈ 1 µs that store nothing, and no cache consumed on the next launch. Serving the app from
  a custom scheme would change the page's origin, and with it the storage every UI setting lives in
  (localStorage): not worth the risk for the ≈ 20 ms of script evaluation the first screen has left (scripts are
  already compiled off the main thread, "streamed").
- **Fewer files**: on a reload, ≈ 100 ms of the ≈ 210 ms before the first screen is Chromium's per-file loading
  plumbing (≈ 1 ms of main-thread time per file, 25 stylesheets + 70 scripts), not parsing or running them. Merging
  them means a build step (against the "no build step" rule) or merging other streams' files (painful merges every
  round). The two sheets that are safe to drop from the start were moved (22, 23); the others style things the first
  screen can show (messages, cards in your chat history, menus) and would flash unstyled.
- **More main-process modules on first use**: the rest register IPC the window calls in its first second (sync,
  capture, app windows, the game bridge for agent tools); each costs 0.2–5 ms.
- **The page's first-paint numbers on this test machine**: software graphics under Xvfb take ≈ 0.35 s for the first
  swap to the screen, whatever is drawn. On a Mac's GPU that's a few ms, so the ready-to-show frame (the loading
  screen) is what you see right away.

## Tests
- `node --check` on every JS file touched; `node dev/lazy-manifest.js --check` ✓ (805 names, 255 aliases, actions, keys,
  apps, tools, no duplicates); `node dev/boot-test.js` ✓ (272).
- `sh dev/run-checks.sh qa-commands qa-mac lazy` ✓ 3/3.
- `node dev/smoke.js --script dev/checks/splash.js` ✓ (both phases), no page errors.
- A smoke start with cloud sync on (a test drive folder): window made before the pass, the pass 91 ms, /startup says so.
- Pictures of the loading screen: `node dev/coldstart-report.js --runs 1 --shot splash.png` (normal) and `--hold`
  (the "taking longer" message and Open anyway).

## Risks
- The window now appears with its first frame, at most 0.25 s after it's made: on this Linux test machine
  ready-to-show only comes once the window is shown, so it always waits the 0.25 s there. On a Mac and Windows
  Electron paints hidden windows, so it should show sooner; if a machine is like Linux, it's 0.25 s later than before,
  in the same color the empty window had.
- With sync on, a module that reads saved data in the first second now gets it once the sync pass is done (≤ 1.5 s)
  instead of the whole window waiting; writes wait too, so nothing is written before the pass.
- A first screen that shows an empty chat for an engine that's missing, with the install check slower than 0.4 s,
  shows the normal hint once instead of "couldn't find…"; the next new chat shows the right one.
- Shared files touched (small, additive): main.js, preload.js (one IPC), index.html, start.js, renderer.js (the Swirl
  sheet), lazy.js / lazy-data.js (cssBefore, capture.css), updater.js (one line), astra.js (a wait before the doctor).
