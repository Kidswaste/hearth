# newtour64 — ✦ Try what's new (round 64)

The owner hasn't tried rounds 61–63 yet. This adds a hands-on, click-first walk through each of their 13 new things,
built on Hearth's own guided spotlight (tour.js: a ring on the real control + one small card), no new framework.
Owner rule (round 64): "I really don't use commands at all" — so every step shows **where to click**; no step asks to
type a command (`/try` exists only as the app's internal / power-user way in).

## What shipped
### The paths (13, 1–4 steps, 30–60 s each; ringing clickfirst64's, mapfirst64's and audiodoctor64's controls)
1. **✦ Quest tracker** — Studio › Paris after hours › Paris guide › Get my AirPods, then the ✦ chip in the rail.
2. **🗺 Paris map + guide** — Studio › Paris after hours, the map's Places · Shows · My walks · Visited row, then a pin ›
   Start this quest.
3. **🎟 This week's shows** — Paris after hours › the Shows layer (or ✦ › ⋯ More › Shows this week…).
4. **🎹 Live Serum 2 / Vital** — the Sound desk's Audio output picker (or Set up live audio), then 🎚 Check my audio
   setup (audiodoctor64; the step shows only when it's in this copy).
5. **✦ Preset window** — its text box over the Sound desk, then ↶ / ↷ / Save.
6. **🗓 Week plan + review** — the ✦ chip › This week › Plan your week › the week card (Week in review › beside it).
7. **🌳 Park jam → song** — 🌳 Park mode, Park jam · capture the moment, Arrange loops.
8. **🎫 Show night** — Paris after hours › a show's pin › Get ready; a show quest's card (Get ready / How was it?); ⋯ More ›
   Shows I went to….
9. **🎮 Playtest notes (F8)** — the Lab's Play, F8 (or F › ✎ Note), then ⋯ › Capture & playtest › ✎ Playtest log.
10. **🚶 Quest walk** — the ✦ chip › Make a walk (or the map's Plan a walk).
11. **🎛 Sound bank** — the Sound desk's Sound bank button, its search, its ⋯ (previews, plugin folders).
12. **📍 Hitch map** — ⋯ › Capture & playtest › ● Record the hitch map, Play, then ▦ Hitch map.
13. **🎁 Real rewards** — the ✦ chip › Rewards › All rewards ›, then + Add a reward.

### How a path behaves
14. Opens the right place (Sidequest Studio's map or Rewards, the Sound desk, the Lab, the week card, the Sound bank),
    rings the one control, and says what clicking it does.
15. **Clicking the ringed control is doing it for real**: it counts as tried, and where the click opens the next place
    (Paris guide → its dialog) the path follows by itself.
16. **Skip** (not for me) and **Later** (paused at that step; it picks up there) on every card; × and Esc pause too.
17. One click listener at a time on the ringed control; a panel that slides in gets the ring re-placed once it settles.
    The ring and card work **inside dialogs** now (the Paris guide is a modal dialog): they move into it, placed right
    even when the dialog has a transform, and stay inside its box.
18. A floating helper left by an earlier path (the week card, the Sound bank) closes when the next path opens its place,
    so it never covers the control being ringed.
19. Opening places writes nothing (the Paris map is only ever opened by the owner's click): on a fresh profile the quest journal stays "missing" through all 13 paths (checked).

### Where to find it
20. **What's new** (Settings › Updates & what's new › What's new… › Since you were away, and the after-update card):
    a "✦ Try it, hands-on: Round 61 · 2/5 · Round 62 · 0/4 · Round 63 · 1/4 — 3 of 13 tried" row; a round's button runs
    its untried paths one after another.
21. **Patch notes** of rounds 61–63: "✦ Try it · 2 of 5 tried" in the header.
22. **✦ tracker panel**: "✦ New 3/13" next to Open Sidequest Studio (until all 13 are tried).
23. Settings › What's new… › **Try what's new**; Ctrl/⌘+K "Try what's new…" (a menu by round with ✓ / paused / skipped).
24. **One offer, ever** (through Hints, a minute after a start, calm rules): "✦ Try what's new · Show me / Not now".
    Not now (or ×) = never again by itself; it also never comes once all 13 are tried.
25. `/try` (secondary): `/try`, `/try round 62`, `/try walk`, `/try next`, `/try list`, `/try reset`.

## Files
- New: `trynew-core.js` (paths + progress rules, Node-tested), `trynew.js` (UI), `trynew.css`, lazy group `trynew`
  (tier use, after discover), `dev/trynew-test.js` (unit), `dev/checks/newtour64.js`.
- Small additive hooks: `tour.js` (function targets / opens, onEnd / onTargetClick / clickNext, Skip / Later, dialog
  host + origin), `whatsnew.js` (tryRow), `patchnotes.js` (head button), `appui.js` (menu row), `updater.js` (the one
  offer at start; not in test copies unless `trynew.test`), `questhud.js` (panel link), `lazy-data.js` / `lazy-meta.js`,
  `index.html` (lazy-at tag), `dev/run-checks.js` (unit + group `newtour64`).
- Progress: store `trynew.progress` (this computer): `{ id: { state: tried|skipped|later, at } }`; offer: `trynew.offer`.
- No Codex file touched (quest / workbench files are only read and clicked).

## Tested
- `node dev/trynew-test.js`: 10 checks.
- `dev/checks/newtour64.js` (fresh profile): all 13 paths open their place and ring a visible control (≤ 1.7 s each);
  journal untouched; click-to-advance into the Paris guide dialog with the ring on Get my AirPods; Skip / Later /
  Done saved; paused path resumes; round 63 chain; What's new row + patch notes button; tracker link; one offer and no
  nag after Not now.
- Also run: whatsnew, tour-discover, questhud61, quest-paris, lazy, unit:boot-test, unit:datasafe-scan, unit:winmac-test.

## Risks / for later
- Since mapfirst64, opening the Paris map puts the guide's places into the journal (once). So no path opens the map by
  itself: the paths open Sidequest Studio's first page and ring **Paris after hours**, so the map opens by the owner's
  click (the check verifies the journal stays untouched through all 13 openings on a fresh profile).
- A ✦ panel step closes the panel if the owner clicks the tour card instead of the ringed button (the panel closes on
  any outside click); the ring just says "Not on screen" then — clicking the chip again brings it back.
- Steps inside ▶ Play (F8, right-click › Hitch map) are described, not ringed: the Play window is its own window.

## For the patch notes
- **✦ Try what's new**: a short hands-on tour of the 13 things from rounds 61–63 (quests in Paris, the ✦ tracker, live
  Serum 2 / Vital, the ✦ Preset window, shows, the week plan, park jams, playtest notes, walks, the Sound bank, the hitch
  map, rewards). 30–60 s each.
- Each one opens the right place and rings the one thing to click; clicking it is doing it for real. No commands to type.
- Skip what you don't care about, or Later to pick up at that step.
- Find it in What's new (a Try it button per round, with "7 of 13 tried"), in the patch notes of rounds 61–63, and in
  the ✦ tracker's panel.
- It offers itself once; "Not now" means never again by itself.
- Just looking changes nothing: your quests, presets and settings only change when you click.
