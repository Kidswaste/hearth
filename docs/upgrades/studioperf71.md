# studioperf71: Life (Sidequest Studio) on a heavy journal (round 71)

Round 70 (bigprofile70) left the Studio's cost in Codex's `tools/quest-journal.js render()` and `QuestCore.clone`. It
measured the map open at 1.4–1.5 s, but that figure included its own 800 ms wait. lifechecks70 also saw closed Outing
desk dialogs stay in the page. This stream profiled four things on the bigprofile70 profile: opening Life › Map,
switching Life tabs, opening a quest dialog and stamping a visit. It fixed the biggest costs and the dialog leak.

## What the profile showed
- **Tab switches were mostly one forced layout.** `navigate()` calls `root.scrollTo(0)` after each page change. That
  forces a style + layout of the whole new page inside the click. On the full journal, that layout took 35–157 ms
  (Today ≈ 41 ms, Collection ≈ 90–157 ms, Find a quest ≈ 37 ms, Map ≈ 24–58 ms). Building the page took 10–38 ms.
  The pages are big: Today has 1,510 elements (about 100 side-quest cards), Find a quest 2,711, Collection 3,717
  (≈ 280 finished-quest cards).
- **`render()` does not clone the journal.** No `QuestCore.clone` runs per render. Clones happen per **save**, three of
  them: the draft in `mutate`, `validate()`'s own return copy, and the `hearth:quests` announce copy. Each is ≈ 4–5 ms on
  this 371 KB journal, so ≈ 7–15 ms per save. Round 70's ≈ 40 ms included the map's one-time guide seeding save.
- **Hidden tabs are not re-rendered.** `render()` already returns early when the Studio isn't visible, and the
  other Life tabs are not built until you open them. Nothing to change there.
- **The dialog leak.** Chromium fires a `<dialog>`'s `close` event with the next drawn frame. The journal's cleanup
  (remove the dialog, bring the page back, return focus) ran in that event. When frames stall, the cleanup stalled too,
  and closed dialogs piled up in the page. Frames stall when the window is hidden or minimized, or on a slow
  software-GL frame: under the Outing desk's blurred backdrop the test box drew 1 frame per 500 ms. Reproduced: open the
  desk → "Keep an event link" → close both → open again. After 200–500 ms, 4 closed dialogs were still in `.qj`.

## Fixed (all in Codex's files, marked `(round 71, studioperf71)`)
1. **No scroll (and so no forced layout) when the Studio is already at its top.** A passive scroll listener on the
   Studio keeps a `scrolledDown` flag. `navigate()` calls `scrollTo(0)` only when that flag is set. At the top, the old
   call did nothing except force the layout. When you are scrolled down, the page still jumps to the top as before.
2. **Long card lists lay out only the cards on screen.** The side-quest cards on Today, the Find a quest cards and the
   Collection cards get `content-visibility: auto; contain-intrinsic-size: auto 300px` (`quest-journal.css`, end).
   An off-screen card keeps its last measured size and is drawn as it scrolls in. Find-in-page, focus and screen readers
   still reach it.
3. **Closed Studio dialogs always leave the page.** In `dialog()`, the cleanup now runs once: from the `close` event,
   or, after a close by code, 120 ms later if the event hasn't come yet. Normally the event comes first and nothing
   changes. The event itself and every other listener are unchanged.

## Numbers
`dev/checks/studioperf71.js` on the bigprofile70 profile (Xvfb, software GL, a shared 4-CPU box). Script = handlers,
timers, frame callbacks and the style / layout they force (trace). Best of 3 runs; the before figures are from main
6f69d86 with the same check.

| interaction | before: script / wall (ms) | after: script / wall (ms) | target |
|---|---|---|---|
| Life › Map from a chat, cold (load, Today, Map) | wall 697–782 (Map click part 440–522) | wall 405–556 (Map part 132–175; the click itself 62–87 ms of script) | < 600 ✓ |
| Map tab (Today → Map), warm | 101–122 / 53–80 | 46–50 / 55–63 | |
| Map → Today | 163–168 / 57–60 | 40–49 / 28–31 | < 100 ✓ |
| Today → Progress (Collection) | 157–169 / 120–130 | 44–58 / 49–58 | < 100 ✓ |
| Progress → Today | 57–63 / 53–54 | 26–37 / 29–40 | < 100 ✓ |
| quest dialog open | 2.4–2.5 / 16–30 | 2.2–3 / 25–29 | < 50 ✓ |
| dialog × (the page comes back) | 60–65 / 58–93 | 40–47 / 43–75; restyle 2,058 → 865 elements | |
| visit stamp (save → re-render) | 4–5 script; CPU 76–83 | 5–7 script; CPU 76–99 (unchanged: see below) | |
| forced layout in a tab switch | 31–83 ms | 0 ms | |
| closed dialogs left after 3 × Outing desk + a quest dialog | up to 4 | 0 | |

Round 70's 1.4–1.5 s for "Sidequest map" included an 800 ms wait in its own check. Measured from a chat to the pins
drawn, the cold open was 0.7–0.8 s before and 0.4–0.56 s now. The cold numbers vary ±150 ms from run to run on this
shared box.

## Not changed (reported)
- **Clones per save** (≈ 7–15 ms here): `validate()` returns a copy, and the announce makes another. Dropping either
  one would let a caller's returned object, or a listener's copy, share objects with the live journal. That is not
  behaviour-preserving without auditing every `mutate` caller, so they stay.
- **Visit stamp** (≈ 75–100 ms of CPU, most of it after the save): `worldMap` re-render with the layers (My Paris
  pins ≈ 5–7 ms, showprep `visitedPins`/`stats` ≈ 5 ms), `validate` ≈ 6–10 ms, clones, and the tracker / rewards
  listeners. No single part is above 25 ms.
- **Frames under the Outing desk on software GL are very slow** (1 frame per 500 ms here: the full-window blurred
  backdrop). This is a test-box artifact; a GPU draws it normally. It is the reason the leak showed up here first.
- `quest-field` failed once with "favorite keeps keyboard focus after saving" and passed on the re-run. The check
  presses ★ right after opening the map, while the one-time guide seeding save may re-render. This is timing only.

## The check
- `dev/checks/studioperf71.js` (new, opt-in like bigprofile70: it needs the 140 MB fixture):
  `BIGPROFILE70=1 node dev/run-checks.js --exact studioperf71`. It measures:
  - Cold: Life opened from a chat, with Map clicked as soon as it appears (wall, long tasks, long animation frames).
  - Traced, 3 rounds each: Map, Today, Progress, Today, a quest dialog and its ×, a visit stamp. Each gets one CPU
    profile, which includes the 400 ms after the click.
  - Last: the Outing desk opened and closed 3 times from Map › Events, then a quest dialog closed. No dialog may stay in
    the page.
  - Budgets (`window.SP_BUDGET` overrides; `window.SP_REPORT = 1` reports without failing): cold Life › Map < 600 ms
    wall, tab switch < 100 ms script, dialog open < 50 ms script. Before this change it fails on both tab switches and
    on the cold open.
- `node dev/run-checks.js studioperf71` (group): studioperf71, questperf65, quest-deck, quest-journal, quest-world,
  quest-field, quest-paris, mapfirst64, herepin66, errands67, outing-desk, city-integration, lazy, unit:boot-test.

Tested (≤ 5 per `flock /tmp/hearth-run.lock` hold): **pass**: studioperf71, questperf65, quest-deck, quest-journal,
quest-world, quest-paris, mapfirst64, herepin66, errands67, outing-desk, city-integration, lazy, unit:boot-test.
quest-field passed on the re-run (see above).

## For Codex
Every change is small and marked `(round 71, studioperf71)`:
- `tools/quest-journal.js`:
  - `let scrolledDown`, near the top.
  - `navigate()`: `scrollTo(0)` only when `scrolledDown`.
  - `mount()`: one passive `scroll` listener on the root.
  - `dialog()`: an idempotent `cleanup()` (the former `close` listener's body). It runs from the `close` event, or
    120 ms after a code `d.close()` if the event hasn't fired (the per-instance `d.close` wrapper). If you add work to
    the dialog's close handling, put it in `cleanup()` so it still runs once.
- `tools/quest-journal.css` (end): `content-visibility: auto` on `.qj-side-grid > .qj-card`,
  `.qj-catalog-grid > .qj-card` and `.qj-collection-grid > .qj-card`. A decoration that sticks out of one of those
  cards would now be clipped (paint containment). None does today: the side card's dot is inside, and keepsakes already
  have `overflow: hidden`.
- Noted, not touched: `render()` still has branches for `life` (lifeBoard), `deck` (mixtape), `commissions` and
  `campaigns`. `navigate()` maps all four to `catalog`, so those page builders are unreachable from the UI. Asking for
  the venue dialog twice (`openOutings({ venue })` while it's open) stacks a second copy of it. Both copies are open
  dialogs, not a leak. `validate()` could offer a no-copy mode for callers that own the object (the `mutate` draft):
  that would save one clone per save.

## For the patch notes
- **Switching between Today, Map and Progress in Life is snappier with a big journal.** Before, each switch made Hearth
  lay out the whole new page in one go, every card included, even when you were already at the top. Now it only lays
  out what's on screen. On a full journal, a switch went from about 0.12–0.17 s of work to 0.03–0.06 s.
- **Opening Life and going straight to the Map is quicker.** From a chat to the map's pins took about 0.7–0.8 s on the
  test machine and now takes 0.4–0.55 s.
- **Closed windows in Life no longer pile up out of sight.** Closing the Events desk (or any Life window) while Hearth
  wasn't redrawing, for example while minimized, could leave invisible copies behind. They're now always cleared away.
