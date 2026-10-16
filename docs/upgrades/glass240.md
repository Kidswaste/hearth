# glass240 (round 51): menus, Ctrl/⌘+K and tooltips at 240 Hz

scroll240 (round 49) took the blur off dialogs and left a list: "menus, the Ctrl/⌘+K card and toasts keep their
glass… measure them next". This pass measured every floating glass surface that was left and the decorations that
loop, with real input, in Forgeheart and Forge Light, at 1280×800 and 2560×1440:
- a long right-click menu (the chat header's: 10 rows, most with flyouts), pointed down row by row and into each flyout
- Ctrl/⌘+K over a busy chat while a long reply streams: typing, arrows, pointing down the list
- a burst of 8 notes while the reply streams
- the Lab with a picture that moves every frame, its right-click menu open and pointed through (into ✨ Look & motion)
- the docked Three Director streaming a reply beside the moving Lab
- the chat screen at rest (rail, chats list, chat)

The finding: the menus, Ctrl/⌘+K (its card and the whole dimmed page behind it) and tooltips still blurred what was
behind them. A backdrop blur is worked out again on every frame where anything under it or in it changes: a row lit as
you point down a menu, each letter typed in Ctrl/⌘+K, the streaming reply under it, the Lab's live picture under its
menu. Now none of them blur, like the dialogs. Nothing is added to any prompt (0 tokens).

## How it was measured
- `dev/checks/glass240.js` (new, in `smooth` and its own `glass240` group): real CDP mouse / key input, one timeline
  trace over 8 stretches, the GPU process's time per drawn frame per stretch (`dev/trace-stats.js`, as scroll240),
  which glass surfaces on screen still have a backdrop-filter (sampled while each one is open), the infinite
  animations running at idle, and a picture of each surface open (`G240_SHOTS`).
- Before = the base (1d31b0c) CSS, run with the same check, after = this branch, same machine, interleaved.
- The machine was heavily loaded (load 11–21 on 4 shared CPUs, other streams' checks, software GL, Xvfb). The GPU
  process managed 1–4 full frames a second, so milliseconds move ±100 % between runs; ranges below are min–max over the
  runs (4–5 before / 4 after at 1280×800, 2 / 1 at 2560×1440). The count of blurring surfaces is exact.

## Before → after

| Surface (stretch) | Before | After |
|---|---:|---:|
| **Glass surfaces on screen that blur what's behind them** | Ctrl/⌘+K 2 (page + card), a menu 1, the Lab's menu 1, a tooltip 1 | **0** |
| **Ctrl/⌘+K over a streaming chat**: GPU per frame, 1280×800 | 700–1,464 ms | **420–589 ms** |
| … 2560×1440 | 2,450–3,030 ms | **603 ms** |
| … the same 9 letters, 4 arrows, 20 pointer moves: time to get through them, 1280×800 | 23–55 s | **8–14 s** |
| … 2560×1440 | 46–63 s | **13 s** |
| **A long right-click menu, pointed through** (over a still chat): GPU per frame, 1280×800 | 93–347 ms | 86–352 ms (same: the blur over a still page is cheap) |
| … 2560×1440 | 436–448 ms | **216 ms** |
| **The Lab's right-click menu over the moving picture**: GPU per frame, 1280×800 | 194–389 ms | **203–252 ms** |
| … 2560×1440 | 324–392 ms | **307 ms** |
| … time to point through it, 2560×1440 | 16–37 s | **13 s** |
| **Notes burst over a streaming chat** | no blur since round 16 | a touch more solid (86 → 94–97 %) |
| **The docked director streaming beside the moving Lab** | no glass in it: 453–792 ms per frame | 533–754 ms (same) |
| **The chat screen at rest**: infinite animations on screen | 0 | 0 |
| … frames drawn | 2 a second (the chat box's text cursor blinking) | same |

The win grows with the screen: the blur's cost scales with the area it covers, and Ctrl/⌘+K's dimmed page covered the
whole window. On a real Mac or PC the GPU is far faster than this software one, but a 4K / Retina screen at 240 Hz
pays the same proportion.

## What looks different (pictures: before | after, dark and light)
- **Ctrl/⌘+K**: before, the page behind was blurred and dimmed; now it is dimmed a shade darker and sharp (you can
  make out the chat behind it, darkened, like behind a dialog). The card looks the same: a touch more solid.
- **Right-click menus and their flyouts, the Lab's menus**: side by side they look the same. At 84 % they already
  hid most of what was behind; at 94–97 % a busy picture shows through as a faint shade instead of a soft smear.
- **Tooltips**: the same (they were 92 %, now 97 %).
- **Notes**: the same; text scrolling under one shows through a little less.
- Forge Light: the same changes, on light glass.

## Upgrades
1. **Right-click menus and their flyouts don't re-blur the page as you point down them.** Same tint, edge light and
   shadow, a little more solid. `polish.css`
2. **Ctrl/⌘+K doesn't blur the page behind it** (it re-blurred the whole window on every letter typed over a
   streaming reply): the page is a shade darker instead, the card a little more solid. 2–5× faster to type through on
   this machine, more on a big screen. `polish.css`
3. **The Lab's menus over the live picture** (its right-click, the timeline's menus, the pops) no longer re-blur the
   picture every frame it moves. `polish.css`
4. **Tooltips, the slash / find / notes panels, the command bar and the node editor's pickers** the same way.
   `polish.css`
5. **Notes are a little more solid** (86 → 94–97 %), so a reply streaming under one reads less through it.
   `polish.css`

**5 upgrades.**

### For the next measurer (dev, not counted)
- `sh dev/run-checks.sh glass240`; also in `smooth` (which had lost `scroll240` in a merge: it's back).
- Budgets: no glass surface on screen blurs what's behind it (any stretch); no infinite animation on something seen
  at idle. The GPU per frame is reported per stretch, with its ratio to the stretch's reference (`vsRef`: Ctrl/⌘+K and
  notes against the plain stream, the Lab's menu against the Lab playing); not budgeted, since under load a stretch
  here draws 1–4 frames a second.
- Options: `window.G240_SIZE = '2560x1440'`, `G240_LIGHT = 1`, `G240_SHOTS = dir`, `G240_ONLY = 'palette,menu'`,
  `G240_CSS` (an A/B), `G240_REPORT = 1`, `G240_BUDGET`.
- The base fails the blurring budget (Ctrl/⌘+K 2, menu 1, Lab menu 1).

## Measured, left as is
- **Decorative loops**: none run at rest. The star dust, the empty-chat icon, the unread diamond and the lit tab's
  spark already stop after a few breaths in Forgeheart; the header glint is off (round 17). What loops while a reply
  streams (the writing dot, the shimmer, a chat's ✦ at work, the director's busy dot) says that something is working,
  runs on the compositor (opacity / transform), and stops with the work; Chromium stops them all when the window is
  hidden or covered. Turning the reply's shimmer off saved nothing measurable (541 vs 567 ms per frame).
- **The chat at rest still draws 2 frames a second**: the text cursor blinking in the chat box. That's the system's.
- **A streaming reply** is the heaviest thing here (its new text is drawn each frame), with or without glass; scroll240
  covers its scroll side.
- **A static snapshot blur** (a blurred picture taken once when a menu opens) was considered and not built: menus
  open over things that move, the snapshot would be stale at once, and at 94–97 % the blur barely showed.
- The capture title / caption glass (inside recordings) keeps its blur: it's part of the video's look.

## Tested
- `node --check` on the changed JS (the check through a wrapper, `dev/run-checks.js`).
- glass240 before / after at 1280×800 (dark: 4–5 / 3 runs, light 1 / 1) and 2560×1440 (2 / 1).
- `sh dev/run-checks.sh --exact glass240 scroll240 smooth46 menucalm appcalm inputlatency a11y idlecpu lazy
  unit:boot-test`: see the final report.

## Edits outside the lane
`polish.css` (one block at the end), `dev/run-checks.js` (`smooth` + the `glass240` group), `FEATURES.md` (a section).

## For the patch notes
- Right-click menus, Ctrl/⌘+K, tooltips and the Lab's menus are smoother: they no longer re-blur what's behind them on
  every frame, the same change the dialogs got last round.
- Ctrl/⌘+K over a chat that's writing was the costliest: in our test it went 2–5× faster, more on a big screen.
- The Lab's right-click menu no longer re-blurs the live picture underneath it while it plays.
- They look almost the same: a touch more solid, and the page behind Ctrl/⌘+K a shade darker instead of blurred.
- Nothing else changes; a new check (`glass240`) keeps it that way.
