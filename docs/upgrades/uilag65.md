# uilag65: the main window's lag (renderer side)

The owner: "the app hangs a lot and is laggy when scrolling/clicking/hovering", then "a hiccup every few seconds, about
everywhere, lasts a second or two, and it's been lagging for a few versions". This stream took the renderer (the main
window's page); the main process was another stream's.

## What was measured
- `dev/checks/uilag65.js` (new): 300 more chats in the list, a 400-message chat with code and tables, a quest journal
  (the ✦ chip shows), a Lab scene open in another tab. Real CDP input under one timeline trace (dev/trace-stats.js):
  the list and the long chat wheeled, the pointer gliding over the rail / list / messages, clicks between chats and
  agents, the ✦ chip opened and shut, Sidequest Studio (the Paris map) opened / hovered / wheeled, the Sound desk
  opened / hovered, the everyday stretches again after visiting them, 5 modal dialogs, 3 s idle. Global listeners per
  type (CDP DOMDebugger) and live Mutation / Resize / Intersection observers (Runtime.queryObjects) at the start and
  the end.
- The same check on round 58 (d818e36), round 62 (cde10cd) and round 64 (534dab0): scroll / hover / click were the
  same within this machine's noise in all three (no feature of rounds 59–64 adds work per scroll, hover or click:
  hot global listeners 104 → 105, no capture listener left behind, the Lab preview fully rests when the Lab is not
  on screen: no frame callback, its timers held). So the bisect pointed away from per-event work.
- A big made-up profile (`dev/make-bigprofile-fixture.js`: 3,000 chats, 40 chats of 600 long messages, a year of
  usage tracking, 60 Lab sketches) at rest and in use for 40 s each: no main-thread task over 50 ms, no gap over
  150 ms in a 50 ms timer, no renderer timer or observer repeating work every few seconds.
- The owner's own week-long /smooth report and a Sidequest profile (from the lead) named the real culprits below.

## Fixed
1. **The jank watch froze the window it was watching.** After 3 long frames in 15 s, `jank.js` asked for an 8-second
   CPU profile of the window (debugger attach, Profiler start / stop), up to 12 times a day. That freezes the page
   while it attaches and while the profile is collected, then names whatever ran as it began: the owner's report put
   "jank.js viewArea" first (99 long frames, worst 8 s). The watch now only counts; a profile runs when asked
   (/smooth profile), or automatically after `localStorage['jank.autoprof'] = '1'`.
2. **Hidden pages restyled on every dialog.** A modal dialog makes the rest of the page inert, which restyles every
   element that isn't skipped. Hidden chats, the Board and Commands were skipped (`content-visibility: hidden`);
   the Lab, Sidequest Studio (its map, pins and layers grew in rounds 61–64) and the Creative Playground / Sound desk
   were not. They now are, when hidden (not in the grid, not while a director's background work marks the Lab
   `.capturing`). Sidequest's own dialogs were ≈ 100 ms each on the owner's PC; the same cost hit every page-wide
   change (the look, a resize, the glow slider).

## Numbers (this machine: Xvfb, software GL, before = round 64 → after)
| interaction | before | after |
|---|---|---|
| 5 modal dialogs over the chat (Lab / Studio / Sound desk mounted, hidden) | 15,316 elements restyled, 309 ms style, longest task 37 ms | 5,703 elements, 126 ms, longest 12 ms |
| chats list wheeled (50 notches) | longest task 31 ms CPU, 0 forced | 24 ms, 0 forced |
| long chat wheeled (60 notches) | longest 13 ms, 22 forced (frame callbacks bringing in earlier messages) | 6 ms, 10 |
| pointer over rail / list / messages (90 moves each) | longest 6 / 5 / 4 ms, ≤ 2 forced | 6 / 6 / 3 ms, ≤ 2 forced |
| clicks between chats and agents | longest 11 ms | 7 ms |
| ✦ chip open / shut ×3 | longest 13 ms | 13 ms |
| Sidequest Studio open | longest 27 ms | 18 ms |
| Sound desk open | longest 20 ms | 16 ms |
| hot global listeners (window / document / body / html) | 105 | 105 |
| idle 3 s, timer fires from the app | ≈ 0 | ≈ 0 |
| automatic CPU profiles of the window (owner's PC) | up to 12 a day, each freezing it (worst 8 s) | none unless asked |

## Budgets in dev/checks/uilag65.js
No task over 50 ms CPU in a scroll / hover / click stretch; ≤ 0.05 style / layout forced inside input handlers per
input; ≤ 110 hot global listeners (no growth); no capture-phase listener left behind by leaving the Studio / Sound desk;
≤ 6,000 elements restyled by 5 modal dialogs (round 64: 15,316, fails); ≤ 30 timer fires in 3 s idle.
`window.UL_REPORT = 1` reports without failing; `UL_BUDGET` overrides; `UL_DUMP` writes the raw trace.
`node dev/run-checks.js uilag65` runs it with what it touches.

## Not changed / for the next pass
- The owner's Lab preview draws (p95 1.6 s on an RTX 4080, GPU context losses, a GPU process crash) are the scene's
  GPU work while the Lab is on screen (the director lives docked there); the preview already rests when the Lab isn't
  shown or the window is hidden. Worth a look with the owner's scene: shadow maps, read-backs, stills.
- Sidequest re-renders its whole page after each saved change (Codex's `render()`); with the guide pins and layers of
  rounds 61–64 that is ≈ 60–90 ms per click on the owner's PC. A partial redraw belongs in Codex's file.
- The 1–2 s freezes "everywhere every few seconds" were not reproduced on the renderer with a big profile: input in
  Electron passes through the main process, so a busy main process freezes every page at once (the main-process
  stream's).

## For Codex
No Codex file was changed. `app.css` now gives the hidden `tool:quests` and `tool:creative` surfaces
`content-visibility: hidden` (like hidden chats): code that measures the Studio or the desk while it is hidden gets
the sizes of when it was last shown (or forces a layout of that part on demand).

## For the patch notes
- Hearth no longer freezes now and then to profile itself. The smoothness watch used to record a few seconds of
  "what is slow" on its own, up to 12 times a day, and that recording was itself a freeze of a second or more. It now
  only counts; a recording happens only when you ask for one.
- Opening a window or a dialog (Settings, Sidequest's cards, the week plan…) is quicker: the Lab, Sidequest Studio
  and the Sound desk no longer get redrawn behind the scenes while you aren't looking at them. Sidequest's dialogs
  opened in about 100 ms on a big profile; most of that is gone.
