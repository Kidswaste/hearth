# lab240edit (round 57): the Lab at 240 Hz while you edit, not only while a game plays

labplay55 and labcanvas56 made the Lab preview light while a game plays in it, hands off. This pass looked at the
other half of the owner's day: **editing** while the game keeps playing. It drove the owner's real habits over a
Clink-like scene and counted, per gesture, what the Lab window does that nobody sees: layout thrash, forced style
recalcs, whole-window restyles, lists rebuilt, JSON per input, storage writes, observers, extra redraws. Then it fixed
the biggest ones.

Nothing looks different and nothing behaves differently. Nothing is added to any prompt (0 tokens). No new setting.
The code paths are the same on Mac and Windows.

## How it was measured
**New check: `dev/checks/lab240edit.js`** (group `lab240edit`, also in `smooth`).
- **The fixture**: a Clink-like game (a shadowed world, a 2K ground texture, 200 instanced crates with a 2K texture,
  a moving camera), a sky shader layer, a DOM HUD layer, a 🧊 model, a 60 s song, the Three Director docked. The
  preview **plays** (not frozen) at a 320×180 frame, so the software GPU here keeps up.
- **Real input** (CDP mouse, keys and text), one timeline trace (`dev/trace-stats.js`) cut into stretches:
  - `slider`: dragging a slider back and forth (164 moves);
  - `knob`: turning a knob up and down;
  - `scrub`: dragging a number's name sideways;
  - `layers`: dragging layers in the Layers list (dragstart, a dragover on every move, drop), twice;
  - `timeline`: dragging the playhead across the song and back;
  - `orbit`: right-drag (turn), middle-drag (pan) and the wheel over the playing preview;
  - `typing`: typing a line into the code and deleting it again (106 keys);
  - `chat`: a director reply streaming in the docked chat while the preview plays;
  - `split`: dragging the dock's splitter (the chat's width) back and forth.
- **Per stretch**: frames over 4.2 ms, the worst frame, the longest task, style / layout passes (and how many
  elements / objects), forced passes (outside the frame's own steps, and inside input handlers, with the line that
  asked), DOM mutations by target, and the check's own probes: localStorage writes, `hub.kvSet` calls, JSON.stringify
  calls, ResizeObserver callbacks, frames asked, and the messages the preview received by type.
  `window.L240E_WHO = 1` names the callers; `window.L240E_PROFILE = 'typing'` adds a JS profile of a stretch.
- **Before** is this round's base (12138e4), run from a copy with the same check, side by side with the branch.
- **This machine**: 4 shared CPUs, software GL, load 25–30 from other streams. Wall times (longest task, worst frame)
  move 2–5× between runs here; element / object / call **counts** are steady and are what the check budgets.

## Before → after (2 side-by-side pairs)
| Gesture | What was wasted | Before → after |
|---|---|---|
| **Dock splitter** (164 moves) | The chat's width was a CSS variable on the whole tool: every move restyled the entire Lab (all of it inherits the variable) | elements restyled **92,822 / 49,774 → 6,735 / 3,853** (≈ 566 / 303 → 41 / 23 a move); style ms 9,375 / 4,489 → **289 / 577**; window CPU 3,768 / 2,460 → **2,080 / 1,435** ms; longest task 1,151 / 649 → 450 / 252 ms; ResizeObserver callbacks 320 → **240** |
| **Typing in the code** (106 keys) | Each key drew the highlight inside the key; the browser then laid the page out again for the next key's own editing; a scroll event drew again | layout objects 59,100 / 59,016 → **21,230 / 17,295**; elements restyled 19,124 → 6,545; forced passes in key handlers 8 → **0**; window CPU 762 / 643 → **611 / 469** ms |
| **Number scrub** (164 moves) | The body's class was set again on every move (each rewrite restyles) | body rewrites **160 → 0**; mutations 831 / 848 → 670 / 690; window CPU 1,464 → 1,267 ms (the other pair: within noise) |
| **Layer drag** (2 drags, 120 dragovers) | Each dragover set the row's drop mark again | row rewrites **96 → 12**; mutations 169 / 170 → **78 / 86** |
| **Timeline when its width changes** (part of the splitter) | The timeline and its minimap each had an observer and each drew both: two draws a frame, the second after a layout read | **one draw a frame**, sizes read before it |
| The stall / park safety check | When no idle moment came for 1.5 s (any drag), it ran on its timeout mid-drag and styled the whole Lab first (233 ms over one splitter stretch) | asked right after the coming frame, when style is fresh |
| Safe-zone overlay | Placed on every resize even while hidden | placed only while shown |

Looked at and already right (no change):
- **Slider / knob drags**: moves reach the preview at most once a frame (round 21's coalescing), the panel's
  state is painted once a frame, the knob compares before writing. 0 storage writes during a gesture (the save waits
  for the release, debounced). A slider whose value is read only while the scene is built re-runs that layer at most
  every 180 ms and never before the last rebuild drew (round 21): that is how such a value can change at all, so it
  stays.
- **Timeline scrub**: one draw a frame, no timers per move (labsmooth54, labscrub).
- **Orbit / pan / zoom** over the preview: handled inside the preview page; the window gets nothing per move.
- **A streamed reply** with the preview playing: the reply's paint runs once in the frame (rounds 35, 49); its
  layout read there is that frame's own layout, done once.
- Forced passes are 0 in the slider, knob, scrub, layer and orbit handlers, before and after.

## The fixes
1. **The dock's splitter** (`tools.js`): while dragging, the width goes on the dock itself (`flex-basis`), once a
   frame (requestAnimationFrame), with the window's width read once at the press. On release the tool's `--dock-w`
   gets the final width and the width is remembered, as before (`/dock-width` and the dock read it). A cancelled
   pointer ends the drag the same way.
2. **The code editor** (`tools/three.js` `LabEditor`): a key's highlight and a scroll's redraw are drawn once, at the
   start of the coming frame, before it paints (the same frame as before). Keys faster than frames draw once. A
   folded editor still draws nothing; a draw asked from anywhere else does any waiting one.
3. **Number scrub** (`tools/three-tweaks.js`): the body's "scrubbing" class is set once per gesture.
4. **The timeline's size** (`tools/three-media.js`): one ResizeObserver for the timeline and its minimap: both sizes
   read, then one draw.
5. **The stall / park check** (`tools/three.js`): when its idle callback times out on a visible window, it waits for
   the next frame (and 300 ms at most).
6. **Layer drag** (`tools/three-layers.js`): the drop mark is set once per row. **Safe zones**
   (`tools/three-media.js`): placed only while they show (turning them on places them, as before).
7. `dev/trace-stats.js`: per stretch, forced passes outside the frame's animation-frame step (`outsideFrame`) and
   inside input handlers with a JS source (`inInputJs`).

## What the check fails on
Counts, steady on a loaded machine: a forced layout loop in input handlers (more than 0.25 forced passes per input
event in any stretch), more than 6 storage writes during a gesture, the preview getting more slider messages than
window frames, the splitter restyling more than 200 elements a move (before: ≈ 300–570), a scrub rewriting the body's
class more than 4 times (before: 160), a layer drag rewriting rows more than 48 times (before: 96), and the code editor
drawing inside a key. Plus a loose 1 s longest-task guard. The base fails the splitter, scrub, drag and editor ones.

## Tests
- `node --check` on every touched JS file; the check's body compiles.
- `dev/checks/lab240edit.js`: 3 side-by-side pairs with the base (the table uses the last two, after the check could
  reach a slider in the narrow test window).
- `node dev/run-checks.js --exact lab240edit labplay55 labcanvas56 unit:labpace-test labpace labsmooth54 lab240gpu
  labdirect sequence playloop labscrub lazy unit:boot-test`: see the final report.

## Edits outside the lane
`tools.js` (the dock splitter's drag, self-contained), `dev/trace-stats.js` (two counts), `dev/run-checks.js` (the
`lab240edit` group and the `smooth` list).

## For the patch notes
- Dragging the line between the Lab and the docked director chat is much lighter: the Lab no longer restyles itself
  on every move (about 14× fewer elements touched per move).
- Typing in the Lab's code is lighter: the colored code is drawn once per frame, and your next key no longer waits
  for the page to be laid out again.
- Scrubbing a number by dragging its name no longer restyles the window on every move.
- Dragging layers in the Layers list does less work per move.
- The timeline redraws once (not twice) per frame while the Lab changes width.
- Nothing looks different. A new check keeps it this way.
