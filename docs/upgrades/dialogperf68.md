# dialogperf68 — the Paris place details dialog back under budget (round 68)

sweep67 found the place details dialog (Sidequest Studio › Map › a pin › ⓘ Place details) at 20–23 ms of script per
open, against 14 ms before round 66 and a 16 ms budget. The extra time was inside the click at
`tools/quest-journal.js:140`. This stream profiled it on cc8c65b (just before round 66) and on HEAD bcc24ba, found the
cause, and fixed it.

## What the profile showed
Both builds were run in the same lock hold: questperf65's fixture, 20 opens each, and the CDP sampling profiler
(50 µs) running only around each click.

| per open | cc8c65b (before 66) | HEAD bcc24ba |
|---|---|---|
| whole click | 19.9 ms | 17.6 ms |
| inside `showModal()` (native) | 17.9 ms self | 16.2 ms self |
| detail hooks / map layers (herepin, errands, mapfirst, invite-hook) | not in the profile | not in the profile |

1. **Round 66/67 did not make the dialog slower.** The Place details button calls `dialog()` with two lines of text.
   It never calls the detail hooks: `addDetailHook` hooks run only in a quest's detail dialog. The map layers don't run
   in it either. Today the same updated check gave 25.7 ms on cc8c65b and 21.2 / 15.2 / 17.6 ms on HEAD (best of 3),
   so the "before" figure of 14 ms in sweep67 was one lucky run on a noisy machine (that run's other tries were 34 and
   42 ms).
2. **The real cost is the modal itself.** `showModal()` makes the whole page inert. Chrome then restyles every element
   that is drawn, and it does this inside the click, because the dialog must find something to focus. On HEAD the
   trace counted 244–270 elements restyled in 10–16 ms of forced style.
   - Round 65 already hides the Studio's own page under a dialog (`.qj-under-dialog`).
   - What was left was the rest of the app: the rail (≈ 90 elements), the side panel (34), main's bars, the Studio's
     header, and the hidden Desk / Forgeheart / Options surfaces (≈ 70). The surfaces are invisible but they aren't
     skipped.
   - Each element costs a lot here, because the app has 102 stylesheets and ≈ 7,600 rules, and many of them end in
     `:is(…)`, so they get tried on every element.
   - A measurement: with all of those skipped, a bare modal dialog costs 5.4 ms. With the page as it was, it costs
     35 ms.

## What shipped
1. **While a Sidequest Studio dialog is open, the rest of the app skips style too.** `dialog()` sets
   `html.qj-modal-up`. The CSS rule, in `tools/quest-mapfirst.css`, gives `content-visibility: hidden` to:
   - the rail, the side panel, main's bars (workspace switcher, meter strip, broadcast, error)
   - the hidden surfaces, the Studio's header and its tool dock

   They sit under the dialog's 0.86 backdrop. They come back in the frame after the last dialog closes, the same way
   the page itself already does. Each selector ends in an id or a class, so the rule is only tried on those elements
   and adds no cost to other restyles.
2. **Nothing moves while they're skipped.** The same elements carry `contain-intrinsic-size: auto none`, so a skipped
   element keeps the last size it was drawn at.
   - `QuestMapFirst.modalSkip()` says yes only after this CSS is on and one more frame has been drawn, so every
     element has a size to keep. A dialog opened in the very first frame after the Studio loads just skips less.
   - Project dialogs (the journal moved over a project workspace, `qj-portal`) are left as they were.
3. **questperf65 checks it** (`out.modalUp`), and the check fails if any of these is wrong:
   - the class is on and the rail is skipped while the dialog is open
   - the dialog is visible
   - the rail, main, the surfaces and the Studio keep the same position and size, before, during and after
   - everything is back after ×
4. **The rules live in the lazy Studio stylesheet, not app.css.** The first screen's CSS is at its 450 KB budget
   (unit:boot-test). These rules matter only once the Studio is loaded.

## Numbers (questperf65, script ms per click, best of 3, this shared 4-CPU box; budget 16)
| run | details dialog open | forced style in the click | elements restyled |
|---|---|---|---|
| cc8c65b (before round 66) | 25.7 (25.7 / 37.1 / 26.3) | 19.2 ms | 246 |
| HEAD bcc24ba, run A | 21.2 (21.2 / 21.5 / 27.0) | 15.8 ms | 244 |
| HEAD bcc24ba, run B | 15.2 (36.5 / 15.2 / 16.5) | 10.2 ms | 270 |
| HEAD bcc24ba, run C | 17.6 (29.6 / 32.4 / 17.6), fails | 11.1 ms | 270 |
| **after, run 1** | **12.2** (26.6 / 18.9 / 12.2) | 6.1 ms | 174 |
| **after, run 2** | **12.6** (17.7 / 12.6 / 18.6) | 6.3 ms | 176 |
| **after, run 3** | **12.1** (15.1 / 14.7 / 12.1) | 5.8 ms | 177 |
| **after, run 4 (final)** | **11.6** (17.8 / 11.6 / 17.9) | 5.8 ms | 176 |

- Runs A–C were interleaved with "after" runs 1–2 in the same lock holds.
- In the page itself (median of 12–20 opens): `showModal()` went from 14.5–15.1 ms to 9.7 ms, and the whole click
  from 16.7 to 12.9 ms.
- The other interactions are unchanged within noise:
  - dialog × close: 2.9–4.1 → 3.7–5.0 ms
  - Outing desk open (it is a journal dialog too): 3.3–7.9 → 4.2–5.3 ms
- What's left in the click: about 5–6 ms of forced style, plus the dialog's own few elements. The rest is the
  journal's DOM building, and app-wide click listeners (usage.js, meter.js) that run on every click.

## Tests
- `questperf65` ✓ (includes the new `modalUp` part), `errands67` ✓, `herepin66` ✓, `mapbuttons66` ✓, `lazy` ✓,
  `outing-desk` ✓ (it opens a journal dialog), all under `flock /tmp/hearth-run.lock`.
- `unit:boot-test` ✓ (first screen 450 KB CSS, at budget, unchanged).
- `node --check` on `tools/quest-journal.js` and `tools/quest-mapfirst.js`.
- A screenshot with the dialog open shows the dialog drawn on the dark backdrop as before.

## For Codex
- `tools/quest-journal.js` `dialog()` has two additive lines, both marked `(dialogperf68)`:
  - On open, after `root.classList.add('qj-under-dialog')`, `html.qj-modal-up` is added, but only when the journal is
    not moved over a project (`!dialogHome`) and `window.QuestMapFirst?.modalSkip?.()` says yes.
  - On the last close, next to removing `qj-under-dialog`, `qj-modal-up` is removed.
  - Behaviour is otherwise the same. Without quest-mapfirst.js, nothing changes.
- If you add a new always-visible bar to `#app` / `main`, add it to the `html.qj-modal-up` list in
  `tools/quest-mapfirst.css`, with `contain-intrinsic-size: auto none`.

## For the patch notes
- **Place details on the Paris map opens faster.** Clicking a pin's ⓘ Place details now takes about 12 ms of work
  instead of 15–21 ms on our test machine.
- **The same goes for every other Sidequest Studio dialog**, such as quest details, Events (the Outing desk) and
  proof review. While one is open, Hearth no longer redraws the parts of the window hidden behind it.
- **What you'll see:** the faint left rail and the Studio's top bar behind an open dialog now stay fully dark, like
  the page behind it already did. They are back the moment you close the dialog, and nothing moves or changes size.
- Round 66's map features ("I'm here", errands, Layers, park jams) were checked and were not the cause, so nothing
  was removed.
