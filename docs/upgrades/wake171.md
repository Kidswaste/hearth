# Round 171 · wake171: older turns wake cheaply; the Lab ↔ chat switch styles the page once

Two parts: chat165's "2000 turns scroll (Forgeheart): a task over 50 ms" (failing since round 170's kept layer, 56–77 ms)
and chatswitch's "the Lab ↔ a chat: the chat's own scripts" (≈ 50 ms vs a budget of 4, failing on round 169 too). The
Lab, Scenes v2, the Lab's CSS and Codex's files were not touched. Round 170's `will-change` layer is kept.

Measured on this box as rounds 165–170: 4 shared CPUs, software GL, Xvfb 1480 × 940. Traces with
`disabled-by-default-devtools.timeline.invalidationTracking` (who invalidated which element, and why) on chat165's
2,000-turn session, through a copy of the check with `cats` passed to its trace (kept out of the repo).

## 1. The long scroll task: two separate costs

Round 170's doc put the failing task on "one style pass over ~2,239 elements while older turns wake". The traces show
two different things, neither caused by the `will-change` layer:

**a) The one long task was the steady-cursor rule coming out — the whole page restyled.** bgmain.js (round 16, bgperf)
stops the chat box's caret blinking after 12 s without input by inserting `*, *::before, *::after { caret-animation:
manual !important }` (webContents.insertCSS) and removes it on the next wheel / click / key. A rule set with `*` added
or removed restyles every element of the page: the trace shows `StyleEngine::updateActiveStyleSheets` →
`scheduleInvalidationsForRuleSets` and a "Style rule change" on every element (HTML, HEAD, BODY, …): 2,239 elements,
44.7 ms in Forgeheart, 1,945 / 25 ms plain, in the first frame of the first wheel. The check's scroll always starts
after > 12 s without input, so its first wheel paid it; so does the owner, on the first scroll, click or key after every
12 s pause (and again, unseen, each time the rule goes in). The CSSOM showed nothing (Electron's inserted sheets are not
in `document.styleSheets`); found by its timing (the first wheel only, never a programmatic scroll; on a wheel over
the sidebar too) and the `input-event` hook in bgmain.js.
*Fix:* the rule names what can hold a text cursor: `textarea, input, [contenteditable]` (caret-animation is inherited,
so an editable's insides follow). Inserting / removing it now restyles those few boxes. bgperf's check reads the chat
box's computed `caret-animation`, as before.

**b) Each piece of a waking block restyled the whole chat list and everything in it.** chat-rest.js puts a woken block
in a piece per frame (≈ 260 elements, round 103). Each insertion into the list scheduled the page's `:nth-child`
invalidation set on the list (`ScheduleNthPseudoInvalidations`), and that set is "all descendants might be invalid"
(rules whose last part is a bare `:nth-child(n)`, e.g. the Lab's `.rg-tray > :nth-child(3)`), so every child of the list
was restyled with its whole subtree: ≈ 1,000 elements, 30–45 ms per piece (with tracking) — 5 pieces in a row while
climbing. Two things marked the list as "children affected by position":
- chatcore.css' `.messages > .msg:…:nth-last-child(n+9)` (round 16, chatperf: the last 8 children are never skipped);
- polish.css' menu stagger, `:root:not([data-motion=off]) :is(#menu, .lab-pop, …) > :nth-child(N)`: a selector whose
  last part is only `:nth-child` is tried on every element, and the parent inside `:is()` gives the browser nothing to
  skip elements by beforehand, so every element in the page was tested — and testing marks its parent.

*Fix:*
- **The tail is a class** (native.js `tailMark` / `tailWatch`, chatcore.css `.cv-far`): every message and day line before
  a list's last 8 children carries `.cv-far`, which is what content-visibility now keys on. Marked by a MutationObserver
  per list (before the next frame) and right after `placeChildren`; only a child crossing the line changes class (it
  alone is restyled). Same children skipped as before, at the same moments a frame sees them.
- **The menu rows name their menu** (`#menu:is(…) > …` ×4; the `:is()` keeps the specificity the rules had) and the
  stagger delays come from one rule with `sibling-index()` (`calc(14ms * sibling-index() * max(0, sign(11 - sibling-index())))`:
  14 … 140 ms for rows 1–10, 0 after; the same values, checked in the window). Elements outside a menu are skipped
  before the test.
After both, a wake piece's style pass is the piece itself plus a few dozen buttons (`.nv-run:not(:empty) + .nv-col`'s
set): 12–24 ms with tracking (30–45 before).

## 2. The Lab ↔ a chat: "the chat's own scripts"

Profiled with chatswitch's detail: all of it was native.js:241 (`backSoon`'s frame) → `solidBack` → `backdropOf`'s
`getComputedStyle`, which forced the style pass of the newly shown page inside the chat's code (43–46 ms per switch,
both ways). Its trigger: native.js judges every chat list's ground again when `<head>` changes (style sheets arriving),
and `<head>` changes on every switch — the window's `<title>`. Waste: a title says nothing about the chat's ground, and
the forced pass came on top of the frame's own (elements styled per switch: 7,233 → 3,661).
*Fix:* in `<head>` only `<style>` / `<link>` changes count (a sheet added or removed, a `<style>`'s text: applyTheme's
user theme still does). Not a Lab cost: no Lab file involved, the budget (4 ms) holds as it was.

## Before / after

| | Round 170 | Round 171 |
|---|---:|---:|
| chat165 Forgeheart scroll, longest task (own CPU) | 54–77 ms (failed in 3 of 8 runs) | no task over 50 ms in 8 runs |
| …first wheel after 12 s still: style pass | 2,239 elements, 44.7 ms (Forgeheart) / 25 ms plain | gone |
| …a waking piece's style pass (traced with invalidation tracking) | 30–45 ms, ≈ 1,000 elements | 12–24 ms |
| chat165 50-wheel scroll, style ms plain / Forgeheart (light trace) | 220 / 232 | 155 / 182 |
| chatswitch Lab ↔ chat: chat's scripts (median) | 47.5 ms | ≈ 0 (native.js not in the switch) |
| …click work CPU, Lab → chat / chat → Lab | 116.7 / 120 ms | 77.2 / 89.5 ms |
| …elements styled per switch | 7,233 / 7,129 | 3,661 / 3,561 |
| switch170 ratios (plain kept, plain projects, Forgeheart kept, Forgeheart projects) | 0.82 / 0.84 / 0.58 / 0.63 | 0.78 / 0.83 / 0.59 / 0.65 |

## Checks

No new check: chat165, switch170 and chatswitch cover it.

chat165's Forgeheart scroll had no task over 50 ms of its own CPU in any of 8 runs on the final code (3 inside full
suites, 4 standalone, 1 traced copy): trace verdict "ok", no long task listed; the plain scroll once "can't tell"
(a 260.6 ms wall-clock task with 8.5 ms of its own CPU: the box's load). 50-wheel style ms plain / Forgeheart in the 4
standalone runs: 179 / 213, 180 / 194, 186 / 204, 171 / 191.

Final run (`--exact chat165 switch170 chatswitch forge168 paint167 chatcore chat-stream fastboot playfix unit:boot-test
unit:lazymanifest-test`): **11 / 11 passed**. In the run before it, unit:boot-test failed on first-screen CSS (388 KB >
385: the menu rules first written out as 50 selectors); the `sibling-index()` form brought it to 382 KB. chat165 alone 4
more times: 4 passed (one "can't tell", above). motionpolish fails only on the Lab's own stylesheets (three-lab.css,
three-regroup.css, three-hudstage.css), as in rounds 167–170; menucalm passes. `node dev/whatsnew-test.js`: 49 passed.
`node dev/lazy-manifest.js --check`: clean; `node dev/trim-weights.js`: sizes unchanged. origin/main and
origin/claude/intelligent-galileo-yaiqem had nothing new to merge (both at eb79157d, round 170's merge).

## For the Lab's owner

`tools/three-regroup.css` and `three-lab.css` have rules whose last part is a bare `:nth-child(n)` (`.rg-tray:not([hidden])
> :nth-child(3)`, `.mb-main > :nth-child(5)`, `.three-stats.compact > :nth-child(n + 3)`): they make the page's
`:nth-child` invalidation set "every descendant", so any parent marked as position-affected restyles all it holds when a
child comes or goes. Harmless for the chat list now; `> button:nth-child(3)` (a type or class in that last part) would
narrow it.

## For Codex

No Codex-owned file was edited. `project-workspace.css`'s `.pw-tool:nth-child(n) svg` is fine (its `.pw-tool` lets the
browser skip other elements first).
