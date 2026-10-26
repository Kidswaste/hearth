# firstscreen (round 40): Hearth starts fast again

The `fastboot` check had flagged "first-screen scripts ≤ 72" for several rounds: features kept adding files the window
read before its first frame (82 now). This pass measured the start again, moved ten of those files to right after the
first frame, found and removed a main-process stall during the start, and made the feature loads wait until the first
frame is really on screen. Nothing looks or works differently; every command, menu line, key and palette line is
there from the first moment, as before.

## What I found (measured first)
- **82 scripts and 30 stylesheets** before the first frame (2,485 KB of JS, 439 KB of CSS). Their own evaluation is
  small (≈ 35 ms in all on a reload: V8's code cache), but each file is a request, its own little tasks, and parsing.
- **The main process re-themed the window during every start.** The page tells the main process its light / dark
  (`native:look`), and setting `nativeTheme.themeSource` from the default 'system' to 'dark' re-themes every page that
  exists: 29–60 ms of main-process work per start (two thirds of all its IPC work in the first 5 s), while the first
  screen was being built.
- **Feature loads started the moment the first frame was made, not shown.** On a busy machine (software GL, 4 shared
  CPUs) the groups parsed right after it held back the drawing of that very frame: once 5 more small groups loaded
  "asap", a reload's first paint came ≈ 75 ms later in three separate A/B sets. Fixed (below).
- Main-process requires before the window: ≈ 13 ms in all (fastboot already moved the rest after the window); no
  sync file reads there besides config.json and window.json, which the window needs. Left as is.
- The one long task before the first screen on a reload is the navigation itself (≈ 50–80 ms, "Receive mojo message"),
  not Hearth's code. The rest of the ≈ 0.4–0.5 s of main-thread work before it is many small tasks: CSS parsing
  (≈ 70–130 ms), resource loading, style, script evaluation (≈ 35 ms), the lazy stand-ins (≈ 10 ms).

## Numbers (medians, before → after)
Interleaved A/B: this branch's starting commit (a31bfd9) from a copy and the finished branch, same machine (4 CPUs,
software GL, shared with four other streams, load 5–13: timings move ±30 %, compare the ratios; counts and bytes are
exact). Cold starts: `node dev/coldstart-report.js --runs 3` × 4 rounds = 12 launches each. Reloads:
`node dev/perf-report.js --startup-only --no-stream --runs 3` × 4 = 12 each. Earlier sets (21 launches, 21 reloads
each, before the last two fixes) agreed on the cold start.

| What | Before | After | |
|---|---:|---:|---|
| **First-screen scripts** (index.html, the fastboot budget is 72) | 82 | **72** | budget met |
| First-screen JS · CSS read before the first frame | 2,485 KB · 439 KB (30 sheets) | **2,232 KB · 436 KB (29)** | −253 KB |
| Cold start: **the first picture** (window shown with its first frame) | 1,353 ms | **1,207 ms** | −11 % |
| Cold start: first screen ready = **first usable chat** (the chat and its box drawn, typing works) | 731 ms | 718 ms | same (noise) |
| Cold start: window shown · every feature loaded | 495 · 3,922 ms | 510 · 4,086 ms | same (noise) |
| Main process: IPC work in the first 5 s | 88 ms | **38 ms** | −57 % |
| Main process: `native:look` (light / dark) during the start | 29–60 ms | **0.3 ms** | |
| Main process: requires before the window | 12.3 ms | 13.5 ms | same |
| Reload: **first paint** | 540 ms | **478 ms** | −11 % |
| Reload: first screen ready | 429 ms | 383 ms | −11 % |
| Reload: main-thread work before the first screen | 388 ms | **338 ms** | −13 % |
| Reload: script evaluation before it | 34.2 ms | 33.2 ms | same |
| Reload: long tasks before it | 1 · 51 ms (the navigation) | 1 · 54 ms | same |
| Reload: interactive (last long task ≤ 3 s after ready) | 1,233 ms | 1,252 ms | same |

On the owner's Mac (a real GPU, fast CPU) the file count matters less in milliseconds than here; the re-theme during
the start was a native call and goes away there too.

## Upgrades

### The window comes up sooner
1. **No more light / dark switch during the start.** Hearth now remembers this computer's light / dark (in its
   window memory) and sets it before the window is made, instead of re-theming the window while it builds the first
   screen: ≈ 30–60 ms less work for the background process, and on Windows the title bar should no longer start light
   for a moment when the look is dark (not tried on Windows) (`nativefeelmain.js`, one line in `main.js`).
2. **Ten files the first screen doesn't need load right after it** (the fastboot budget of 72 is met again: 82 → 72,
   −253 KB): the chat's own /commands (chat-cmds.js), Claude Code / Codex health (engine-health.js), "pick up where you
   left" + Freshen + repeated-error fixes (speed-resume.js, freshen.js, speed-fix.js), Assist (assist.js and its CSS),
   the Kit (kit.js), the button sparkles (juice.js), the board / capture polish (polish8.js) and the Meshy API
   adapter (into the Apps group). Their commands, palette lines, keys and buttons are there from the first moment and
   load them when used before they're in (`lazy-data.js`, `index.html`).
3. **Feature loads wait until the first frame is on screen**, not only made (at most 0.6 s): on a busy computer the
   first picture comes ≈ 10 % sooner on a reload (`lazy.js`).

### Kept exactly as before
4. The Ctrl/⌘+K "/command — what it does" lines are the commands there were at the first screen, as before (not the
   ones registered since), and Claude Code's /engines and /astra-doctor still replace the chat's (load order).
5. A failed reply already on screen with a fix (Update Claude Code…) gets its button when the health module comes
   in; the window title follows the view from the start; Freshen's restore runs whether its file comes before or after
   the first screen.

### For the next streams (dev, not counted)
- **Budgets**: `node dev/boot-test.js` (unit:boot-test) now fails when the first screen grows past 72 scripts /
  2,350 KB of JS / 29 stylesheets / 450 KB of CSS: put a new file in a lazy group (lazy-data.js), or merge it into one
  that's already there. (Round 51, labshapes: 2,352 KB; the first screen as a whole was at 2,349.9 KB at 1d31b0c, and
  every new lazy group's line and command manifest are first-screen bytes. Round 52, lazymeta: back **down to 2,330 KB**
  with the first screen at 2,267 KB, see below.) `dev/checks/fastboot.js` adds a stall guard: the first screen up within 3 s (medians here are
  0.4–1.1 s; a wall-clock budget tighter than that isn't stable on this shared machine).
- `dev/perf-report.js` reports the work in front of the first screen: `busyToReadyMs`, `scriptToReadyMs`,
  `longToReady` / `longToReadyMs` (CPU time from navigation to 'hearth:ready', steadier than the wall clock).
- What must stay in front of the first screen and why: `missions.js` (Missions.add is called by other files as they
  load; ◎ is on the chat box), `hints.js` (Hints.offer is called at load by ui.js, powerwise, routerlearn…),
  `powerwise.js` (renderer.js picks Power.every at load, look.js reads Power.lite for the first look), `nativefeel.js`
  (data-os, the Mac's inset frame, before the first frame), `memorytidy-core.js` (native.js's `<remember>` and
  memory.js), `routerlearn.js` (Smart's pick for the first message), `offline*.js` (the waiting queue restored at
  start), `winmac.js` (ui.js / native.js at load), `updater.js` (brings the view back after an update before the first
  frame), `prompt-library.js` (notes.js reads it at load). The ⛶ bigscreen group was already lazy.
- Lazy groups that load "asap" now start after the first frame is presented (`afterPaint` waits for the paint entry).

## Tested
`node --check` on every touched JS file; `node dev/lazy-manifest.js` (✓ names 893, aliases 310, actions 1262, keys 473,
apps 51, tools 6, dups 0) and `--check`; `node dev/boot-test.js` (1,076 checks, with the new budgets);
`node dev/nativefeel-test.js` (184). `sh dev/run-checks.sh` (the last batch after the final change: fastboot, fastboot-lab, lazy, labboot, labpace, nativefeel, bigscreen, bigscreen-hidpi, freshen, robust, qa-commands, lightweight; earlier in the stream): unit:boot-test,
lightweight, robust (+ robust-lab), speed (+ habits), freshen, assist, polish8, apps-meshy, aicheck (+ options), firstrun,
safetynet, qa-commands, chat-cmds, missions (+ missions2, swarmlean), hintcalm, powerwise, bigscreen (+ bigscreen-hidpi),
nativefeel, memorytidy, routerlearn, appsearch, offline (+ their unit tests): all pass. Flaky once under load and
passing on re-run: apps-meshy ("a progress bar shows"), bigscreen-hidpi (the huge preview's resolution step-down timing).
`unit:winmac-test` fails the same way on the starting commit (a new PowerShell call in powerwisemain.js, round 39), not touched here.

## Risks
- In the first ≈ 0.1–1 s after the first frame, the ten moved files aren't in yet: a /command of theirs loads them
  first (a moment later), the Kit's Color / Easing tabs and Assist's Lab buttons are in before the Lab (they load
  first), a reply that finishes in that window isn't auto-titled (/auto-title, off by default).
- The first launch after this update still re-themes once (it learns the light / dark then); a look that changes
  light / dark writes window.json once per change.

## Edits outside the lane
`nativefeelmain.js` (nativefeel: remember / apply the light / dark early), `main.js` (one line), `engine-health.js`,
`freshen.js`, `juice.js`, `chat-cmds.js` (a few lines each so they work when loaded after the first screen),
`dev/perf-report.js`, `dev/boot-test.js`, `dev/checks/fastboot.js`.

## For the patch notes
- Hearth opens a little faster again: the first picture of the window comes about 10 % sooner, on a cold start and on
  a reload.
- The background process no longer switches the window's light / dark while it starts (it remembers yours), which
  saved about 30–60 ms of its work; on Windows the title bar should no longer start light for a moment with a dark look.
- Ten parts the first screen doesn't need (chat commands, the engine health check, "pick up where you left", Assist,
  the Kit, the button sparkles…) now load right after the window has drawn; everything still works from the first
  moment.
- Background loading waits until the first picture is really on screen, so it no longer slows that picture down.
- A new check keeps the first screen within its budget, so it doesn't creep back.
- Nothing was removed and nothing looks different.

## Round 52, lazymeta: the first screen lighter again (budget back down)
Every new lazy group pushed the first screen over its JS budget (2,353 KB > 2,352 at 36ee90f). Measured first:
`lazy-data.js` was the biggest first-screen file, **215 KB** (not the whole 2,350: that was the first screen's total);
its generated manifest (META) was 188 KB, of which the commands were 144 KB: descriptions 65 KB, argument words 21,
examples 14, keywords 14, names 13; then keys-sheet lines 17 KB, palette actions 10, app windows 10, rail tools 2.

- **What moved**: the lazy commands' descriptions, examples, keywords and undo lines now live in a new generated file,
  `lazy-meta.js` (`LazyText`, 98 KB), which is not in index.html. `lazy.js` reads it once right after the first frame
  (`Lazy.text()`, also in the `lazy.hold` test mode) and puts the words into the stand-in commands still waiting for
  their group, then refreshes the command search index. Every group load waits for it first (so a group's real
  commands never combine with a stand-in that has no words yet). Ctrl/⌘+K's "/name — what it does" lines read the
  description from the live command (the appui label getter, Codex's lazy-label fix), so they show the words as before.
- **What stays in lazy-data.js**: what registering a stand-in needs: names, aliases, args, area, keys, hidden, when /
  whenLabel / dcl / fallback, palette action labels, keys-sheet lines, app windows, rail tools, agent tool prefixes.
  A command whose name is shared (a `when` variant, or one combined with another registration under its name or an
  alias: /retry with /again, /recent with /history) keeps its words inline, since Commands.register combines the
  variants' descriptions when they register.
- **Numbers**: lazy-data.js 215.2 → **127.9 KB**; first-screen JS **2,353 → 2,267 KB** (−86 KB); 72 scripts and 29
  sheets unchanged. Budget **2,352 → 2,330 KB** (63 KB free). A new lazy group's first-screen cost is now mostly its
  names and args; its long words go to lazy-meta.js.
- `node dev/lazy-manifest.js` writes both files (and `--check` reports either out of date); `dev/boot-test.js` also
  checks that lazy-meta.js isn't a first-screen script and only names groups / commands the manifest has;
  `dev/commandonly-scan.js` skips lazy-meta.js like lazy-data.js.
- Risk: in the moment between the first frame and lazy-meta.js being read (a few ms), a still-waiting lazy command's
  description is empty in `/help list` or the "/" rows; Ctrl/⌘+K's first opening waits for Find anything, which loads
  after the words.

## Round 67, slowbutton67: +3 KB for the hiccup recorder
The first screen was at 2,330.2 KB of 2,330. 🐢 That was slow needs the jank watch (jank.js, first screen) to keep its
last minute raw and count the day's hiccups over 500 ms from the start: a hiccup can't be recorded by code that loads
when the button is clicked. That is ≈ 2.3 KB in jank.js (the card, its words and the report are in the lazy
'jankwatch' group; stale comments in jank.js were shortened to make room). Budget **2,330 → 2,333 KB** (first screen
2,332.5 KB). The next stream that needs first-screen room: look for a lazy candidate first (dev/coverage-report.js).
- Round 67 merge: 2333 → 2336 KB. The five round-67 streams each stayed lazy; together their manifest (lazy-data.js) and preload lines add ≈ 1.5 KB to the first screen.
