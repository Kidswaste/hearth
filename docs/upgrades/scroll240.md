# scroll240 (round 49): every scroll and pan at 240 Hz

You want every scroll and every pan to stay at 240 Hz (4.2 ms a frame). This pass measured them all with real wheel
input, both mouse-wheel notches spun hard and a trackpad's small smooth deltas, in the Forgeheart look:
- a 1,000-message chat with code, tables and pictures, scrolled up (older messages load in) and back down
- the same chat while a long reply streams
- the chats list with 300 more chats (all of them shown)
- the board with 200 references, panned and pinch-zoomed
- the Usage window, Settings, the 📰 patch notes
- the Lab's Layers list with 40 layers

It found four things that cost frames while scrolling and fixed them. One of them changes the look very slightly:
dialogs no longer blur what's behind them (below). Nothing is added to any prompt (0 tokens).

## What was wrong (measured)
- **Dialogs blurred twice on every scrolled frame.** Settings, Usage and the patch notes are glass: a 16 px blur
  through the dialog and a 3 px blur over the whole window behind it. When the dialog's content scrolls, the
  compositor has to work out both blurs again on every frame. The cost is in the GPU, not the main thread, so the
  earlier checks never saw it. Here (software GPU) a scrolled frame of a dialog cost **4–11×** a scrolled frame of
  the chat. On a real Mac or PC the GPU is far faster, but the blur scales with the area, so a 4K / Retina screen at
  240 Hz pays the most.
- **Tooltips armed themselves as rows scrolled under a resting pointer.** After each scrolled frame the browser
  updates what's under the pointer. Every row that passed under it started a tooltip timer, and a tip that came due
  measured itself (a forced style + layout) and added its node to the page. That woke three page watchers (a11y,
  usage, the board drawer), and the chrome glint played on buttons going by. This happened in every list: the chat,
  the chats list, Settings, Layers.
- **The board forced a style pass of all its items while you panned.** A few times a second, its "what's on screen"
  test read the board's box right after the move had restyled every item (the `.bd-moving` class), and again when
  the move settled: 18–23 forced passes over a 2-second pan / pinch.
- **A chat's scroll handler forced a style + layout pass on every scrolled frame while a reply streamed.** It
  measured the list in the scroll event, before the reply's paint in the same frame, which then needed a second pass.

## How it was measured
- `dev/checks/scroll240.js` (new, in `smooth` and in its own `scroll240` group). It uses real CDP wheel input, sent
  at a device's pace without waiting for each event to be handled (Chromium merges what queues up, like a real wheel).
  One timeline trace covers nine stretches. For each it reports:
  - drawn frames over 4.2 / 8.3 ms and main-thread tasks over 4.2 ms
  - style / layout / forced passes, paints and raster
  - the scroll / wheel listeners' CPU time and IntersectionObserver passes
  - **the GPU process's time per drawn frame** (new in `dev/trace-stats.js`: `render.{gpuFrames, gpuMs, gpuCpuMs,
    rasterMs, scrollJs, io}` per stretch; `smoke({ trace, cats })` adds trace categories)
- **Before** = the round's base (40a5550), run from a copy with the same dev tools, interleaved with **after** runs:
  5 pairs. The machine was very loaded (load 9–25, 4 shared CPUs, software GL, Xvfb at 60 Hz), so wall-clock numbers
  move ±100 % between runs. The reliable numbers are counts, CPU time and ratios within a run. Ranges are min–max over
  the pairs.

## Before → after

| What (stretch) | Before | After |
|---|---:|---:|
| **Scrolling Settings**: GPU time per drawn frame | 857–2,571 ms | **94–266 ms** |
| **Scrolling the Usage window**: GPU per frame | 781–5,347 ms | **100–638 ms** |
| **Scrolling the patch notes**: GPU per frame | 1,165–4,475 ms | **120–477 ms** |
| … a dialog's scrolled frame against the chat's, same run | 3.8–11× | **≤ 1×** |
| … the same 40-odd wheel events, wall time (Usage · Settings · notes) | 6–19 s · 6–14 s · 6–19 s | **2–7.5 s · 0.6–3.4 s · 0.9–4.6 s** |
| **Panning / pinching the board** (200 references): forced style passes | 18–23 | **1–5** |
| … their time | 21–457 ms | **0.3–3 ms** |
| **Wheeling while a reply streams**: scroll listeners' CPU per 100 wheel events | 30.5–33.7 ms (once 13.6) | **8.9–13.4 ms** |
| **Tooltips measured while scrolling** (forced passes in juice.js), any stretch | 2–8 in most stretches | **0–2** (none in the last run) |
| Long chat wheel / trackpad, chats list, Layers: scroll listeners' CPU per wheel | 0.07–0.28 ms | 0.04–0.34 ms (same) |
| Older messages loading as you wheel up, the 300-chat list, 40 layers | ✓ | ✓ (same) |

Big screen: the base at 2560×1440 cost 1.6 s (Settings) and 2.5 s (notes) of GPU per scrolled frame, against
1.0–2.6 s at 1600×1000. The blur grows with the dialog's area. The matching after run was lost to a machine restart.
The fix removes the blur at every size, so the big-screen gain is at least the 1600×1000 one. To repeat it:
`--screen 2560x1440` (or `--screen 3840x2160 --dpr 2`).

## Upgrades

### Dialogs
1. **Settings, Usage, the patch notes and every other dialog scroll without re-blurring each frame.** The dialog no
   longer blurs what's behind it, and the dimmed page behind is no longer blurred either. To keep the look, the
   dialog is a little more opaque (86–92 % → 93–97 %) and the dim behind it a shade darker. The capture viewer has
   worked this way since round 8. `polish.css`

### Lists
2. **Tooltips don't pop up from scrolling.** Rows gliding under a resting pointer while you wheel (or while the wheel's
   scroll is still moving) no longer start a tip, measure it or add it to the page. A tip shows as before when you
   move the pointer. `juice.js`
3. **No chrome glint on buttons scrolling past** the pointer. `juice.js`

### The board
4. **Panning and pinching the board no longer forces a style pass of all its items.** The board's box is read once
   when a move starts and reused until it settles (also by the wheel / pinch zoom), and the settle reads it before
   its classes change. `board.js`

### Chats
5. **Scrolling a chat while a reply streams costs one style + layout pass a frame instead of two.** "Am I at the
   end?" is worked out in the frame's own step, after the reply's paint, not in the scroll event. Following, the ↓
   button and "↓ new" behave as before. `native.js`

**5 upgrades.**

### For the next measurer (dev, not counted)
- `sh dev/run-checks.sh scroll240` runs the check with the checks around what it touched.
- Budgets: scroll / wheel listeners ≤ 0.25 ms CPU per wheel event in every stretch; forced passes: board ≤ 8, each
  dialog ≤ 4, chats list and Layers ≤ 12; tooltips ≤ one (2 forced passes) per stretch; a dialog's GPU time per frame
  ≤ 2.5× the chat's.
- What must stay right: older messages come in as you wheel up, all 300 chats show, 40 layers listed, 200 board items.
- Options: `window.S240_ONLY = 'usage,notes'`, `S240_REPORT = 1` (report without failing), `S240_BUDGET`, `S240_CSS`
  (try CSS for an A/B), `S240_DUMP = file` (the raw trace).
- The base commit fails the dialog GPU ratio, the board forced passes, the streaming scroll-listener budget and the
  tooltip budget.

## Measured, left as is
- **The long chat by wheel and trackpad**: scroll listeners ≈ 0.1 ms CPU per event. IntersectionObserver passes run
  ≈ once a frame for 0.1–0.3 ms. The forced passes left are the fold measure of long replies coming near (needed to
  fold them) and a once-a-day "screen seen" pass of the weekly tidy (habits.js → usage.js `see`).
- **The chats list** (virtual past 150 rows), **Layers**: light. Their frames are bound by the compositor here.
- **Wheeling while streaming**: what's left is the reply's own paint and layout, plus the jank watch's
  `getAnimations()` at most once a second (only when long frames come and you aren't scrolling).
- **Menus, the Ctrl/⌘+K card and toasts** keep their glass. They rarely scroll, and a toast is short-lived.
  Measure them next if they show up.
- The streaming shimmer spans the whole reply. Only the tiles near the screen are drawn, so it's left as is.

## Tested
- `node --check` on every touched JS file.
- 5 interleaved before / after pairs of `scroll240` (loads 9–25). The final branch passes every budget. The base fails
  the dialog ratio, board, streaming listener and tooltip budgets.
- `sh dev/run-checks.sh scroll240` after merging da6859d: see the final report.

## Edits outside the lane
`polish.css` (one block after the round-5 "no backdrop blur over things that move" rule), `juice.js` (tooltips /
glint), `board.js` (box read per move), `native.js` (the scroll handler), `dev/trace-stats.js` (render numbers per
stretch), `dev/smoke.js` (`cats` for traces), `dev/run-checks.js` (`smooth` + `scroll240` group). All small and
self-contained.

## For the patch notes
- Settings, the Usage window, patch notes and other dialogs scroll much more smoothly. They no longer re-blur the
  screen behind them on every frame, which was the most expensive thing in a scrolled dialog (about 4–11× a chat's
  frame in our test, and more on big screens).
- Dialogs look almost the same: a touch more solid, with the page behind a shade darker instead of blurred.
- Tooltips no longer pop up while you scroll a list with the pointer resting on it. They show when you move the
  pointer.
- Panning and zooming the mood board does less work per move: no more restyling every reference a few times a second.
- Scrolling a chat while a reply streams does half the style work per frame.
- Nothing else changes; a new check (`scroll240`) keeps it that way.
