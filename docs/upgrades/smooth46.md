# smooth46 (round 46): a 240 Hz pass over rounds 44–45

Rounds 44–45 added a lot that runs while you work: estimates while you type (sendpreview), calm error notes
(errorcalm), kept chat lists and getting a chat ready when you rest on it (chatswitch), groups in the Layers list
(layergroups), kinetic type stepping on the music every frame (kinetictype), notifications, automatic backups,
Hearth's own answers (localanswers) and the dozing preview (idlecpu). This pass traced the everyday gestures they sit
in — typing in a long chat, switching chats, pointing down the chats list, the Lab playing with a 🅰 layer and a group,
dragging a Lab slider, opening menus, a burst of error notes — found what ran when it didn't need to, and fixed the top
offenders. Nothing looks or behaves differently. Nothing is added to any prompt (0 tokens).

## How it was measured
- **CPU profiles** of each gesture (CDP `Profiler`, 0.1 ms sampling) in the hub and in the Lab preview's page, with
  native calls (style, layout, `querySelector`…) charged to the JS line that made them, inclusive times and line ticks.
  The probes drove real input (CDP mouse / keys), in Forgeheart, with the Lab loaded.
- **Timeline traces** (`dev/trace-stats.js` through the existing checks: inputlatency with `IL_TRACE`, chatswitch with
  `CS_DETAIL`) for forced styles / layouts and per-file CPU.
- **New check: `dev/checks/smooth46.js`** (`smooth` group, and its own `smooth46` group). It counts what this pass
  removed (counts don't move with this machine's load the way milliseconds do), checks that the same things still
  happen, and reports the handlers' times. Every budget fails on the base commit and passes here (below).
- **Before** = this round's base (2cbe79e) from a copy with the same probes and check, run interleaved with the branch.
- **This machine**: 4 shared CPUs (load 2–8 during these runs, other streams' checks), software GL, 60 Hz Xvfb.
  Milliseconds move ±50–100 % run to run; the counts are the reliable numbers.

## Before → after

| What (where) | Before | After |
|---|---:|---:|
| **A right-click (or any press) in the chat on screen**: "the view changed" rounds sent to ~20 modules | 1 per press | **0** |
| … the press's own handlers (mousedown, max over 4 right-clicks) | 1.5–9 ms | **0.1 ms** |
| **A menu opening**: page-wide searches for an open dialog | 1 per menu | **0** |
| **The jank watch noting long frames** (Lab play, slider drags, long lists on a busy machine): page-wide searches for 30 notes | 60 | **0–1** |
| … the hub's script while the Lab plays 5 s (a 🅰 layer, 3 layers, a group, the song) | 124 ms (22 of it that search) | **55 ms** (0) |
| … the hub's script during a 7 s Lab slider drag while playing | 260 ms (32 of it that search) | **132 ms** (0) |
| **A burst of 10 error notes** at once: placements (out of the chat box's way) / page-wide docked-chat searches | 10 / 10 | **1 / 1** |
| **The chats list search**, the first letter, 300 more chats (12 match): the projects' grouping asked about | 303 chats | **13** |
| **A 🅰 type layer moving on a clock**: new "plan" objects over ~1.2 s of frames | 19–31 (one a frame) | **1** (reused) |
| … plus per frame, per moving type layer: its hit state, its readout, a closure and a text key | made anew | reused |

The borderline budgets named for this round (run on this branch, load 2–8; the budgets are unchanged):

| Budget (check) | Base, earlier today (load 3) | After |
|---|---:|---:|
| chatlistfast: the search box's key handlers p95 (budget 6 ms; failed at 6.7 under load) | 2 ms | 1.2–1.5 ms |
| inputlatency: menu handlers p95 (budget 16 ms; failed at 17–21 under load) | 7.6 ms (mousedown up to 8.4) | 6.3–7.9 ms (mousedown 0.1) |
| chatswitch: a recent chat's own scripts CPU (budget 8 ms; failed at 9.1 under load) | 4.2–5.0 ms | 4.5 ms (unchanged) |

What those three spent their time on under load was mostly not their own code: the key / click waited behind other
work (input delay), and that work was largely the jank watch's page-wide searches on every long frame (a loaded machine
has many) and the "view changed" round in every press. Both are gone. The menu's own handlers are now ≈ 2 ms of script
plus its one style pass to measure itself (needed to place it). A chat switch's own click is the same as before: its
cost is the one style pass that focusing the chat box needs, and moving that made it worse (see Tried and reverted);
what it waited behind under load is lighter now.

## Upgrades

### Pressing and menus
1. **A press in the chat you're looking at doesn't re-open it.** Every mousedown in a chat (a right-click, Send, the
   chat box, a message) made it "active" again: about twenty modules were told the view changed and the chats list
   re-marked its open row, inside the press. Now a press in the chat already on screen only notes that you saw it.
   A press in another chat (side by side) still switches to it. `renderer.js`
2. **Menus open without searching the page for dialogs.** Placing a menu over an open dialog looked through every
   element of the page; it now reads the page's own list of dialogs. `renderer.js`

### Long frames (the Lab, long lists, a busy computer)
3. **The jank watch stops walking the page on every slow frame.** To note where a slow frame happened (a menu, a dialog,
   the Lab…) it searched the whole page twice per frame: the hub's top script while the Lab played or a slider was
   dragged. One search now answers for a second, or until your next press, key or change of view. `jank.js`

### Notes and the chats list
4. **A burst of error notes is placed once.** Each note looked for a docked chat and measured every chat box to stay
   out of your way; ten at once did it ten times. Now once, in the coming frame. `ui.js`
5. **Typing in the chats list's search box narrows by the letter first**, then asks the filters and projects' grouping
   only about the chats that match (it asked about all of them). The same chats show. `panel.js`

### The Lab
6. **A 🅰 type layer moving on the music makes nothing new per frame for its steps**: the question it asks the step
   math, its state and its readout are reused frame to frame (they were new objects every frame, 60–240 a second, for
   the garbage collector to clear). Renders stay identical. `tools/three-sandbox.html`, `tools/three-kinetic-core.js`

**6 upgrades.**

## Measured, found light (no change)
- **sendpreview** while typing: its input listener ≈ 1.5 ms over 150 keys; the estimate itself waits for a pause and an
  idle moment.
- **localanswers**: nothing while typing (it looks on submit); **notify**: event-driven only.
- **backupauto**: its idle schedule check ≈ 0.4 ms (powerwise's shared schedule).
- **idlecpu**'s input listener: under the profiler's resolution.
- **layergroups**: its key listener does nothing outside the Layers list; Layers rows are rebuilt only on a change.
- **chatswitch**'s ready-on-rest: the messages of a chat you rest on are made in idle slices (≈ 0.7 ms per chat in
  idle time); the kept lists don't add work to an ordinary press any more (fix 1).
- **errorcalm**: ≈ 1 ms per error note (its plain sentence and ▸ Details).
- The Lab preview's page during play and a drag: the 🅰 layer's own frame work is a few % of the page's script; three.js
  drawing is most of the rest.

## Tried and reverted
- **Focusing the chat box after the new chat is drawn** (instead of before) moved the new chat's style work into the
  click: chatswitch's "recent chat: own scripts" went from 4.2–5.0 to 6.2–7.5 ms (2 + 2 interleaved runs). Reverted;
  the focus stays where it was.

## For the next measurer (not counted)
- `dev/checks/smooth46.js` (`sh dev/run-checks.sh smooth46` runs it with the checks around it). Budgets (window
  `S46_BUDGET` overrides, `S46_REPORT = 1` reports without failing): 0 view rounds per right-click in the chat on
  screen, 0 dialog searches per menu opened, ≤ 2 page-wide searches while 30 long frames are noted, ≤ 1 placement and
  docked-chat search for a burst of 10 notes, ≤ 40 projects' asks for a first search letter (300 more chats), ≤ 2
  distinct plan objects over ~1.2 s of a 🅰 layer. Plus what must stay right: the menu opens each time, the area of a
  long frame with a dialog open is "dialogs", switching chats shows the chat clicked with its box focused and its draft
  back, the search shows the 12 matches, a burst shows the newest 5 notes, the 🅰 readout carries its step. The base
  commit fails 7 budget lines.
- `Jank._test.frame(entry)` feeds a fake long frame; `Jank._test.viewArea()` answers from the memo.
- Profiling probes: a sampling profile through `smoke({ cdp: 'Profiler.start' })` / `Profiler.stop` (add
  `target: 'three-sandbox'` for the preview's page) charged by function, with natives charged to their JS caller, is
  the quickest way to see who forces a style pass.

## Tested
- `node --check` on every touched JS file; the sandbox page's inline scripts extracted and checked;
  `node dev/kinetictype-test.js` 16/16.
- `sh dev/run-checks.sh smooth46` (load 2–8): smooth46, inputlatency, chatlistfast, chatswitch, streamrender, idlecpu,
  labpace, unit:kinetictype-test, layergroups, lazy, unit:boot-test passed; kinetictype failed once on "render two
  frames twice from the export page: identical bytes" (frames 1 and 3 identical, 0 and 2 not) and passed when run again
  alone.
- After the last changes (load 2–6): smooth46, jankwatch, hintcalm, errorcalm, menucalm, chatswitch, chatlistfast,
  inputlatency, layergroups, streamrender, lazy, unit:boot-test, unit:hintcalm-test passed. kinetictype failed the same
  "identical bytes" line once more inside that long run (the frames at 3.6 s differ between the two renders, those at
  6.4 s match: likely the song's analysis still settling on a busy machine). Run alone or after errorcalm + menucalm,
  interleaved with the base: 6 / 6 passes on the branch, 6 / 6 on the base.
- smooth46 interleaved on the base and the branch, twice: the base fails 7 budget lines (the toast lines were added
  for the second pair), the branch passes.

## Edits outside the lane
`renderer.js` (the surface's mousedown, topLayer's dialog lookup), `jank.js` (viewArea), `ui.js` (toast placement),
`panel.js` (one filter order), `tools/three-sandbox.html` and `tools/three-kinetic-core.js` (the 🅰 layer's reused
objects), `dev/run-checks.js` (smooth46 in `smooth`, a `smooth46` group). All small and self-contained.

## For the patch notes
- Right-clicks and presses in the chat you're looking at are lighter: Hearth no longer re-opens that chat behind the
  scenes on every press, which made about twenty parts of the app react for nothing.
- Menus open a little faster: they no longer search the whole page for an open dialog.
- The Lab is smoother while it plays and while you drag sliders, especially on a busy computer: Hearth's own slowdown
  watcher no longer searches the whole page on every slow frame (the app's own work during play roughly halved in our
  test).
- A burst of error notes no longer makes Hearth re-measure the chat box once per note.
- Typing in the chats list's search box does less work per letter with thousands of chats.
- Words that move with the music (🅰 Text that moves) no longer make throwaway objects every frame.
- Nothing looks or works differently. A new check (`smooth46`) keeps it that way.
