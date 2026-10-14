# smooth41 (round 41): smoothness after rounds 33–40

Rounds 33–40 added a lot that runs on its own: a11y.js watches the whole page, chatcalm folds notes under replies,
hints go through one queue, powerwise keeps a background schedule, attachlean measures chips, and the Lab gained
camera moves, ♪ links, ◧ before / after, recipes and memory clean-up. This pass re-ran the smoothness checks on three
versions, looked for what got heavier at 120–240 Hz, and fixed the root causes with small edits. Nothing looks or
behaves differently.

## How it was measured
- **Versions.** Round 32's end (7a5713f), round 40's base (a31bfd9) and round 40's end (cc8f588). Each was a copy
  with the same current `dev/` harness, and they were run interleaved with this branch on the same machine.
- **Existing checks.** smooth32, motionpolish, labpace, inputlatency and streamrender. Some of them can't run on
  round 32 because its UI predates them: motionpolish and inputlatency look for controls added later, and labpace
  needs f60.
- **New check: `dev/checks/smooth41.js`** (smooth group, plus a `smooth41` group in `dev/run-checks.js`). It runs
  the everyday stretches under a timeline trace, in Forgeheart, with a docked Three Director and a Lab scene:
  - idle in a chat;
  - a 60,000-character paste (a "Pasted text" chip), then typing beside it;
  - a long streamed reply in a 300-message chat;
  - three short replies under two quiet notes;
  - AI setup and missions opened ×3 each with the mouse;
  - idle while a tip waits for another place;
  - a Lab slider drag;
  - the director's new chat (its keyframed orb, knobs in the panel) streaming beside the Lab;
  - the orb playing;
  - idle on the Lab.
- **New trace numbers.** `dev/trace-stats.js` now reports, per stretch, the script time and calls per file, what
  fired by itself (timers, idle callbacks, rAF) and forced styles per file.
- **Also used.** CPU profiles of single stretches (sampling, by function and file), and MutationObserver counts by
  target and attribute.
- **This machine.** 4 shared CPUs with load 10–26 (other streams were running their checks), software GL and 60 Hz
  Xvfb. Timings move ±100 % from run to run here. A trace's per-file ms for a MutationObserver callback swung
  between 6 and 158 ms on identical code. **Counts are the reliable numbers**: calls, mutations, controls looked
  at, rewrites, forced styles. The timings below are labelled as such.

## What got heavier, and what was done

| What | Round 32 | Round 40's base → round 40's end | After (this branch) |
|---|---|---|---|
| **A tip waiting for another place** (a Lab tip while you're in a chat): the hints queue's looks in 3 s idle | — | 5–6 runs of `pump` (each queries the whole page twice: what's open, what's on screen) | **1–2 runs, no page queries** (5–6 → 1–2; profile: 8.6 → ≈ 0.4 ms per 3 s) |
| **The orb playing with its knobs** (a new director chat's scene): DOM writes per second | — | 186 → **211 /s** (a11y's `aria-valuenow` on every knob value) | **167 /s** (below round 39) |
| Same: the knobs' "code value" notch rewritten | | 128 → 128 per 3 s (it never moves while playing) | **0** |
| Same: knob value text rewritten | | 128 → 128 per 3 s | **93** (only when the shown digits change) |
| **a11y after each reply**: controls walked and named again (a chat redraw moves its messages: removed + added) | — | — → 146–166 per 3 replies (every one walked: its whole text and tooltip) | **93–104 named** (the rest unchanged, skipped; −37–40 %) |
| a11y during a long streamed reply (controls looked at) | — | — → 62–65 | 62–65 looked; only new ones named |
| Window listeners (`DOMDebugger.getEventListeners(window)`) | 166 | 193 → 202 | 203 (unchanged: each feature's own capture listener, < 0.3 ms per key all together) |

Measured and fine (no change needed):

| What | Round 40's base | Round 40's end / after |
|---|---|---|
| **attachlean: a 60,000-character paste**, longest task | 17–59 ms | 11–64 ms (studying the paste ≈ 6 ms, once; typing beside the chip runs no attachlean code) |
| **chatcalm**: notes folding / one order per reply (`restack`, `calmFoot`) | — | under the profiler's resolution (< 1 ms per reply); native.js per 3 replies within noise |
| **powerwise**: its schedule in 3 s idle | 0.2–0.5 ms | 0.2–0.5 ms; idle timers in a chat 5–6 vs 4–8 per 3 s |
| **inputlatency** (handlers p95, ms): typing 0.2 · long draft 0.3 · Enter 0.3 · Ctrl/⌘+K 6.4 · menu 17.2 · AI setup 7.5 · chat click 30.7 · wheel 8.1 · grid 0.6 · Lab slider 0.6 · scrub 0.3; Lab slider → frame p50 / p95 1 / 2 | (round 40's base) | round 40's end: 0.3 · 0.3 · 0.3 · 8 · 4.2 · 5.6 · 11.6 · 0.2 · 0.5 · 0.5 · 0.7; 1 / 2. No input path got heavier in round 40. |
| **streamrender**: DOM changes for its huge streamed reply | 2,215 | 2,059 |
| **smooth32**: a long reply's DOM changes | 505 (round 32) → 272 | 273 → 263 |
| **motionpolish**: elements restyled over the whole run | 36.1k | 36.8k |

One cost was measured and left as it is:
- **a11y moving focus into AI setup, missions and Activity, and back.** It forces one style pass each time
  (`focus()` needs fresh style): 20–25 forced styles over 6 openings + closings, ≈ 3 ms a time here. That is the
  price of focus going into what opens. I tried doing it right after the next frame instead of in a timer, and it
  measured no better: the sheet's own entrance makes style dirty again. So I reverted that; a11y's behaviour is
  unchanged.

## Upgrades

### Background
1. **A tip waiting for another place no longer makes Hearth check the page every 0.7 s.** The hints queue used to
   look at the whole page (what's open, what's on screen, is a reply streaming) on every tick while any tip waited,
   even when nothing fitted where you are. Now it waits quietly and looks again the moment you move to another place
   (the `hearth:view` event). A slow 5 s tick still drops tips that waited too long. When something does fit, it
   still shows as soon as you're calm, sooner than before. `hints.js`

### The Lab while a scene plays
2. **Knobs are written only when what they show changes.** While a keyframed scene plays (every new chat's orb),
   each knob used to rewrite its arc, pointer, value and "code value" notch ten times a second, even when the value
   hadn't moved. Now each part is written only when it differs: the notch is never rewritten while playing, and the
   value text only when its digits change. That also means fewer screen-reader value updates for VoiceOver /
   Narrator to process. `tools/three-tweaks.js`

### Chats
3. **After each reply, the screen-reader naming pass only looks at controls that are new or changed.** A chat redraw
   moves its messages, and a11y used to walk every moved button's text and tooltip again to name it. Now it
   remembers what it named (tooltip, label and text) and skips the ones that haven't changed. `a11y.js`

**3 upgrades.**

## For the next measurer (not counted)
- `dev/checks/smooth41.js` (`sh dev/run-checks.sh smooth41` runs it with the checks around it). Each stretch
  reports script ms and calls per file, timers / idle callbacks / rAF fired, and forced styles per file. Budgets
  (`window.S41_REPORT = 1` reports without failing; `window.S41_BUDGET` overrides them):
  - a11y names at most 80 % of the controls it looks at over 3 replies;
  - hints.js runs ≤ 2× in 3 s while a tip waits for another place;
  - the knobs' notch is rewritten 0× and the value text no more often than the arc while the orb plays;
  - a long paste's longest task is ≤ 120 ms;
  - knobs must be on screen, or it says the knob guard measured nothing.
- `A11y._stats` (`looked` / `named`): the naming pass's work, for checks.
- `dev/trace-stats.js` segments: `files`, `fired`, `forcedFiles`.
- `dev/run-checks.js`: the `chat` and `lab` groups were each defined twice, and the later definition won. That
  dropped `labcamera` from the lab group. Each is now defined once, with `chatcalm` and `labcamera` both in.
- Don't trust one trace's per-file ms for observer callbacks on a loaded machine. Use the counts (A11y._stats,
  mutations by target), or a CPU profile (`Profiler.start` through `smoke({ cdp })`).

## Tested
- `node --check` on every touched JS file. `node dev/hintcalm-test.js`: 59/59.
- `sh dev/run-checks.sh smooth41` (22 min, load ≈ 10–26): 13 of 14 checks passed. These were smooth41, smooth32,
  inputlatency, streamrender, motionpolish, a11y (0 problems), chatcalm, attachlean, hintcalm, unit:hintcalm-test,
  lazy, unit:boot-test and fastboot.
- labpace failed in that run on "the sketch changes itself: draws again within a frame or two" (the preview read
  10 fps). It passed when run again alone at load ≈ 9. Round 40's base and end both failed it the same way under the
  same load. This pass doesn't touch the preview page.
- smooth41 ran 6× on this branch and 6× on round 40's end, interleaved. The hints guard fails on round 40's end
  (5–6 runs) and passes here (1–2). The knob counts come from a dedicated orb-playing probe, run on both sides.

## Edits outside the lane
`hints.js` (the queue's tick), `a11y.js` (the naming memo, `_stats`), `tools/three-tweaks.js` (knob paint),
`dev/trace-stats.js` (per-file numbers), `dev/run-checks.js` (smooth41 group and in smooth; the duplicate keys).

## For the patch notes
- A tip waiting for the Lab (or any other place) no longer makes Hearth re-check the screen several times a second
  while you're elsewhere. It shows the moment you get there.
- Lab knobs are lighter while a scene plays: only the parts that changed are redrawn, about a fifth fewer page
  writes than in round 40, now below round 39.
- After each reply, the screen-reader naming pass only looks at buttons that are new or changed, not the whole chat
  again.
- Measured and found light: attachment cost chips while typing and pasting, the calmer chat's folded notes, the
  battery-aware background schedule, and every input path (typing, menus, Ctrl/⌘+K, the Lab slider).
- Nothing looks or works differently. Hearth just does less in the background.
