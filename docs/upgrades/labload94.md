# labload94: the Lab's code no longer loads at every start (round 94)

Round 93 found that the Lab's code (the `lab` lazy group: 109 files, ≈ 3.4 MB) loaded right after the first frame of
every start (`asap` since round 29), 200–350 ms of the window's time, also in sessions where the Lab was never opened.
This stream makes it load when it's wanted, and checks that the first Lab open doesn't get slower in the cases that
matter.

**Answer:** on a start where the Lab isn't used, the first 30 s cost **≈ 0.5–0.7 s less CPU** (main + window, −14 to
−19 %). The first Lab open is as fast as before once the start has settled (the Lab's code and its warm page are in
by then), and also right after a pointer rests on the Lab's button. Opening the Lab in the first few seconds of a start,
or for the first time after two weeks without it, costs **≈ 0.15–0.2 s more before its preview frame shows** (the code
loads on the click); the first picture inside it arrives at the same time as before (within this box's noise).

## What changed

### When the Lab's code loads (`lab-intent.js`, new lazy group `labintent`, asap, ≈ 6 KB)
`lab` is now a `use` group marked `prefetch`. Each start picks one mode:

| mode | when | what loads the Lab |
|---|---|---|
| **now** | the last start ended in the Lab, or Hearth opens on the Lab | right after the first frame, as before |
| **calm** | the Lab was opened in at least half of the last 8 starts, or the newest project was left on its Scene | in the background 5 s after the first screen (1.5 s without input), paced |
| **idle** | the Lab was used in the last 14 days, less often | in the background ≥ 40 s after the first screen, after the calm start and 3 s without input, paced |
| **none** | not used in 14 days | only on intent |

A history it can't read counts as **calm** (it behaves as for someone who uses the Lab). Whatever the mode, these
load it at once (**intent**):
- the pointer moving onto (or focus reaching) a button that opens the Lab: the workspace bar's Scene, a rail button of an
  agent docked in the Lab, a chat code block's **▶ Apply to scene**, **Open in Three.js Lab** or shader button
  (a project card already prefetched lab + board + creative on the pointer: projects-home.js);
- a Lab row among the first three rows of Ctrl/⌘+K while typing (a Lab command, a Lab Ctrl/⌘+K line, the Lab tool or
  one of its tool commands; appui.js calls `LabIntent.seen`);
- the Lab shown (its rail key, a project, a command, an AI's Lab tool: the stand-ins load it, as before).

"Pointer moving" means a `pointermove` with movement: Chromium's own moves after a layout or scroll have none, and a
pointer resting where a button happens to be drawn at start isn't intent. That also fixes the project cards: on the
heavy profile the cards were drawn under a resting pointer and prefetched lab + board + creative ≈ 0.8 s into every
start (round 93's "creative at 0.7 s" item).

The warm preview page (tools/three-boot.js, round 37) follows the Lab's code as before (unchanged: it waits for the
calm start and an idle moment, for someone who used the Lab in 14 days). `tools/three-sandbox.html` is untouched.

### lazy.js
- `Lazy.prefetch(name)`: a background load, 4 files at a time, each four run before the next go in, in idle moments.
  Any real use (a load asked without idle, by any group) puts it back at full speed at once.
- A 'soon' group that needs a 'use' group **follows** it: `labdirection` and `labfinish` (the creative-direction
  session's files, unchanged) load once the Lab is in and the start is calm, in their old order, never pulling the Lab
  in themselves.
- `Lazy.groupOfAction(label)`, `Lazy.by(name)` (who asked for a group first: a dev aid), `state()` shows `prefetch` /
  `pace` / `follow`.
- `dev/smoke.js`'s wait before a check also loads the prefetch groups (and their followers), so every existing check
  finds the Lab in as before; checks about the start itself run with `--no-lazy-wait`.

### Why not split the group
The rest of the app doesn't need any of the Lab's code early: its commands, palette lines, keys-sheet lines, agent
tools and rail tool are already stand-ins (lazy.js, round 16), and a heavy-profile session with the Lab never loaded
(below) found no app code touching a Lab global. What was missing were a few places that assumed the Lab was always in
by the time you could click:
- loaded first now: "Open in Three.js Lab" / shader on a chat code block, attaching a Lab reference from a chat,
  `/attach-frame`, `/attach-scene`, `/scene`, `/scene-timeline`, a chat scene chip's menu, the Apps window's
  "send to the Lab" (model, sky, reference, palette), Assist's commands and Ctrl/⌘+K lines, Decide (Lab kinds), a
  jam's share, Safety net's "open this Lab scene", comp dispatch, Studio flows, the code-flow view's "Open in the
  Lab", the chat ↔ scene link's menu;
- no longer loading the Lab by peeking at it: the work journal (safetynet.js: every key typed anywhere read the Lab's
  state), a chat's scene glyph in the chats list, the chat strip's scene chip (it shows the name kept with the link
  until the Lab is in), a director's screenshot check, `/director-edits` (says nothing to undo yet).

## Numbers

All on this 4-CPU box, software GL. Base = 63bb36f (round 93 release).

### perfguard A/B (`node dev/perfguard.js --ab 63bb36f --lock --only startup,app,fresh`, 63 min, load ≤ 1.7)
The heavy profile (40 projects, 1,500 chats); the Lab never used in these profiles, so mode **none**.

| measure | base | new | |
|---|---:|---:|---|
| Start → first usable chat | 656 ms | 698 ms | ok (p 0.08) |
| Start → first picture | 1012 ms | 1061 ms | ok |
| Start → usable (every early feature in) | 4802 ms | 4764 ms | ok |
| Start → first screen: CPU, main + window | 3350 ms | **2820 ms** | better (−16 %) |
| **First 30 s: CPU, main + window** | 3560 ms | **3050 ms** | better (−14 %) |
| After start (30 s): window JS heap | 16 MB | **13.4 MB** | −2.6 MB |
| Idle at 1 min / 5 min (every process) | 14 % / 0.6 % | 13.9 % / 0.6 % | ok |
| Lab first start (fresh part, ≈ 5 min in, Lab not used lately): press → preview on screen | 110 ms | 231 ms | **+121 ms** (flagged) |
| … press → first frame | 2422 ms | 2002 ms | ok (noise ± 1 s) |
| … window CPU | 287 ms | 374 ms | +87 ms (ok, p 0.2) |
| Project warm open (wall / window CPU) | 546 / 531 ms | 746 / 532 ms | "unsure" wall |

The one flagged row is the cold first open of someone who hasn't used the Lab in 14 days (mode none): the code now
loads on the press. That is the trade this stream makes; the next table shows it for the owner's own starts.
The project warm open's wall time was measured again on its own (`--only app --runs 4`, 24 min): 533 → 575 ms, ok;
its window CPU came out 463 → 522 ms "unsure" (p 0.1) there and 531 → 532 ms in the first run: noise, nothing in this
stream touches a project open once the Lab is in (the first open of a project loads it, as before).

### CPU of a start in each mode (`coldstart-report --data <heavy profile> --cpu-at 30000 --local lazy.lab.mode=…`, 8 starts each, two rounds alternating)

| | base | calm | idle | none |
|---|---:|---:|---:|---:|
| First 30 s: main + window | 3700 ms | 3620 ms | **3030 ms** | **3000 ms** |
| … the window | 1820 ms | 1770 ms | **1410 ms** | **1370 ms** |
| Window CPU by the time every early feature is in | 1730 ms | **1280 ms** | 1320 ms | 1290 ms |
| Start → usable | 5057 ms | 4652 ms | 4775 ms | 4687 ms |
| Start → first usable chat | 655 ms | 661 ms | 668 ms | 681 ms |

Honestly: in **calm** (the Lab opened in most starts) the Lab's code still loads inside the first 30 s, so the total
is about the same; it only moves off the burst right after the first frame (−450 ms of window CPU there). In **idle**
it loads after 40 s, so the 30 s window is clear, but the cost comes later in the session (in true idle). Only
**none** removes it. `--local` is new in `dev/coldstart-report.js` for this.

### The first Lab open (`node dev/labload94-open.js --base /tmp/base --reps 3 --modes calm,idle,none`)
A real click on the workspace bar's Scene button after a page reload, the Lab used lately (labboot.used, four scenes),
3 opens per cell, medians. "shown" = press → the preview frame on screen; "first frame" = press → the preview's
first frame drawn; CPU = the window thread, press → first frame. The first frame is dominated by the preview page
booting three.js in software GL (± 0.5 s between identical opens here); "shown" and the CPU are the clean signals.

| case | base | calm | idle | none |
|---|---|---|---|---|
| right after start (1.5 s) | 59 ms · 1249 ms · 95 ms | 214 · 946 · 175 | 215 · 1305 · 201 | 242 · 772 · 202 |
| after 10 s | 48 · 1120 · 93 | **52 · 755 · 99** | 252 · 1020 · 277 | 201 · 851 · 232 |
| after 60 s | 59 · 62 · 45 | **55 · 62 · 45** | **57 · 62 · 45** | 264 · 971 · 221 |
| hover 300 ms, then click (3 s in) | 53 · 1270 · 105 | **56 · 713 · 105** | **58 · 693 · 102** | **55 · 1204 · 109** |

(shown · first frame · CPU, ms. The calm column's first three rows are from the second run, after calm moved to 5 s;
the first run, with calm waiting for the calm start, gave 237 · 920 · 208 at 10 s.)

- **After the start settles** (10 s in calm, 60 s in calm / idle): the same as before, warm page and all.
- **Pointer on the button, then click**: the same as before; the 300 ms between them load the code.
- **Right after start** (1.5 s): +≈ 155 ms before the frame shows, +≈ 80 ms window CPU; the first frame isn't later.
  At 1.5 s the base was itself often still loading the Lab (`loading` at the press).
- **The worst case** is the first open after two weeks without the Lab (none): +≈ 200 ms shown and no warm page, so the
  first frame waits ≈ 1 s as on a first start (base: 62 ms at 60 s, with its warm page). An open 10 s in by key (no
  hover) in **idle** also pays ≈ +200 ms shown.

### labboot / labstartfast
- labboot (warm page, then a real press): base shown 149 ms, first frame 682 ms; new 183 ms / 689 ms; warm page drawn
  in both (`warmed 1`).
- labstartfast: cold open base 1362 ms → new 1063 ms (window CPU 320 → 280 ms); warm open 909 → 856 ms (280 → 190 ms);
  song open 1351 → 876 ms (window 590 → 700 ms). Its first run here failed one budget by 2 ms (songOpen: the window's
  CPU until the scenes were read 152 ms, budget 150); it passed when run again. labsync88's first run here hit a
  ResizeObserver loop note while the Lab mounted (three-media / three-boot observers); it passed when run again, and
  passed on the base. Both one-offs are noted, not explained.

## Checks
- `dev/checks/labload94.js` (new, registered; group `labload94`): from fresh reloads with the Lab held
  (`lazy.lab.mode` none): the pointer on Scene loads it and the click opens it (≈ 0.2 s pointer → loaded); ⋯ Sketch ›
  More › Ask Claude about this layer starts a chat about the scene; Ctrl/⌘+K "Three.js Lab" loads it from its row and
  Enter opens it; `/sketches`, an AI's `three_do layers` and the rail key Ctrl+4 (real key events); a project left on
  its Scene opens into the Lab; a fake-engine reply's ▶ Apply to scene (pointer → load, click › Replace "Ring" → the
  code is in the layer); calm mode (history 3 of 4) loads it paced ≈ 5.3 s in with the followers after; now mode after
  a start that ended in the Lab; no Lab global touched before it loaded. 37 / 37.
- `labboot labstartfast labpace labchat92 labsync88` ✓ (the two one-offs above passed on a second run) ·
  `lazy calmstart idlecpu projects firstscreen87` ✓.
- `unit:datasafe-scan unit:winmac-test unit:errorcalm-scan unit:storeack-scan unit:chatsafe-scan unit:chatwin-scan
  unit:boot-test unit:lazymanifest-test` ✓ · `node dev/lazy-manifest.js` rewritten (the labintent group).
- First screen: 1745 / 1751 KB (+2 KB: lazy.js and the call sites above).
- A heavy-profile session (`--data` the bigprofile fixture, no lazy wait): chats opened, typing, agents, Projects home,
  the pointer around, Ctrl/⌘+K "settings": the Lab stayed out until the pointer crossed a project card (intent), no
  Lab global touched (`Lazy.misses()`).

## Files
- New: `lab-intent.js`, `dev/checks/labload94.js`, `dev/labload94-open.js`.
- `lazy.js`, `lazy-data.js` (lab: use + prefetch; labintent), `index.html` (its lazy-at tag), `appui.js` (one line),
  `docs/lazy-groups.md`.
- Call sites: `native.js`, `apps.js`, `apps-lab.js`, `apps-more.js`, `jam.js`, `chat-scenes.js`, `chat-context.js`,
  `chat-attach.js`, `chat-scenelink.js`, `decide.js`, `director-cmds.js`, `safetynet.js`, `cmdbar.js`,
  `comp-dispatch.js`, `nodes-code.js`, `studio.js`, `assist.js`.
- Dev: `dev/smoke.js` (its wait loads prefetch groups), `dev/coldstart-report.js` (`--local`), `dev/run-checks.js`.

## For Codex
- `projects-home.js` (marked `round 94, labload94`, two lines): a project card prefetches lab + board + creative on a
  `pointermove` with movement instead of `pointerenter` (and drops its listener after). On the heavy profile the cards
  were drawn under a resting pointer and loaded all three ≈ 0.8 s into every start; this was round 93's "creative at
  0.7 s" note. A real pointer on a card still prefetches as before.
- Not changed, for you to consider: `project-workspace.js` and `projbundle.js` assume the Lab is in at some points
  only after loading it themselves (fine); `credits.js` (creative-direction) reads `window.ThreeHistory` before the Lab
  may be in — it says "Open the Lab first", as it did for a start before round 29.

## For the patch notes
- Hearth starts lighter. The Lab's code no longer loads at every start: when you don't use the Lab that day, the first
  half-minute after opening Hearth uses about a sixth less of your computer.
- Hearth learns how you use the Lab. If you open it most days, it gets it ready a few seconds after you start; if you
  use it now and then, it gets it ready later while you're not doing anything; if you closed Hearth in the Lab, it's
  ready right away as before.
- Just pointing at the Lab's button (or at "Apply to scene" in a chat, or seeing the Lab come up in Ctrl/⌘+K) gets it
  ready, so it opens as fast as before.
- If you haven't used the Lab for a couple of weeks, its first opening can take a moment longer (about a fifth of a
  second) while it loads.
