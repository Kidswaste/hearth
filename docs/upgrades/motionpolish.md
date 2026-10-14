# motionpolish (round 36): every movement smooth and on one tempo

You asked for movement that feels smooth and consistent at 120–240 Hz: drawers, menus, popovers, toasts, dialogs,
folds, switching chats and windows, the rail, hovers, the chat box growing. This pass measured each of them opening
and closing, then made every entrance compositor-only (transform / opacity), put all of them on one set of durations
and easings, made the OS "reduce motion" setting turn movement into a short fade in every look, and removed the
page-wide restyles that some presses and drags caused. Nothing was redesigned: same looks, same places.

## How it was measured
- `dev/checks/motionpolish.js` (new, in the `smooth` group): real input (CDP) under a timeline trace
  (dev/trace-stats.js), in the Forgeheart look, with a docked Three Director: ⋯ AI setup ×5 · its folds ×8 · ◎ missions
  ×5 · ◉ Activity ×5 · right-click menu + submenu ×4 · 6 toasts · a dialog ×4 · the chats panel ×4 · switching chats
  ×6 · switching windows from the rail ×6 · the docked chat collapsing / expanding ×4 · a reply finishing ×2 · the chat
  box growing 8 lines. For each opening it also records what moved (every running animation / transition: its
  properties, duration, easing), the stylesheets' animations / transitions of non-compositor properties, and what
  still moves under emulated reduced motion and under /motion off. It fails on anything that moves off the
  compositor, a new layout / paint animation in a stylesheet, slides under reduced motion, anything under /motion off,
  or a finished reply replaying its entrance.
- Before = this branch's starting commit (fa52d34) from a copy, run with the same check interleaved with the after
  runs: 2 before / 2 after (4 shared CPUs, software GL, 60 Hz Xvfb; times move ±30 % between runs and other agents
  were running checks too: the counts — elements restyled, forced layouts — are the reliable numbers). Ranges are
  min–max of the runs.

## Numbers (before → after)

| What | Before | After |
|---|---|---|
| **Whole run: elements restyled · style time** | 58.4k–62.6k el · 2,699–2,762 ms | **33.6k–34.7k el · 1,577–1,864 ms (−44 % / −37 %)** |
| Whole run: forced style / layout in scripts | 634–637 · 1,613–1,711 ms | **617–625 · 698–902 ms (−52 %)** |
| Whole run: tasks over 50 ms · frame work p95 | 33–34 · 91–99 ms | **13–25 · 70–73 ms** |
| **Docked chat collapse / expand (double-click its edge) ×4: elements restyled** | 33,797–34,862 | **8,315–8,369 (−76 %)** |
| Same: style time · forced time · frames over 8.3 ms | 782–1,297 ms · 383–862 ms · 23–24 | 224–367 ms · 111–210 ms · 14–15 |
| ◎ missions ×5: forced style / layout time · elements restyled | 38–66 ms · 1,335–1,566 | **6–15 ms · 972–1,101** |
| ◉ Activity ×5: forced time | 9.3–10.4 ms | **1.8–2 ms** |
| AI setup folds ×8: forced time · worst frame | 7–52 ms · 37–66 ms | **2.7–3.1 ms · 21 ms** |
| ⋯ AI setup ×5: forced layouts | 36–46 | 26–34 (the rest is the check's own probing) |
| A reply finishing (Forgeheart): what plays on it | **the whole reply fades in again from transparent (220 ms)** | nothing |
| Durations / easings in use while the surfaces open | 23 different pairs (120 · 139 · 150 · 160 · 170 · 180 · 200 · 220 · 240 · 260 · 280 ms, 7 easings) | **three tokens: 120 / 180 / 240 ms, ease-out + "pop" for things that scale in** (what's left: the looks' sparks, glints, ambient loops) |
| Reduced motion: longest entrance · /motion off: still animating | 220 ms · the dialog backdrop | **120 ms (a fade) · nothing** |
| Things moving off the compositor during openings | frame-size buttons easing font-weight (a relayout of the Lab bar per frame), box-shadow, text-shadow, background-position | **none** (hover colors on small controls only) |
| Dialog ×4, switching chats, the rail, toasts, composer | same within noise (see Not fixed) | |
| Startup / first-screen weight | — | `lazy`, `fastboot`, `unit:boot-test` pass; no new file (+≈3 KB CSS) |

## Upgrades

### One tempo
1. **One set of motion tokens** for the whole app (polish.css): `--dur-fast` 120 ms (hovers, presses, small fades),
   `--dur-med` 180 ms (menus, popovers, toasts, folds), `--dur-slow` 240 ms (drawers, dialogs, switching windows and
   chats); `--ease-out` for entrances, `--ease-pop` (a hair of overshoot) for things that scale in, `--ease-in` for
   exits. /motion off sets them all to zero.
2. Menus, submenus, flyouts, the palette, the slash menu, the keys sheet, key badges, dialogs and their backdrop,
   switching windows and switching chats now all use the tokens (they used 9 different durations).
3. Forgeheart's own entrances (surfaces, tabs, dialogs, the palette, toasts, menus, notes) use the same tokens.
4. Hover and press feedback everywhere (rail buttons, chat rows, inputs, ghost buttons, primary buttons, tabs, cards,
   the palette's selected row, the copy button, Alt-revealed buttons) eases on the fast token: 120 / 150 / 160 /
   180 ms before.

### Drawers, popovers, folds come in instead of popping
5. **⋯ AI setup slides in** from the right (it popped), compositor-only.
6. **A fold opening in AI setup** (Memory, Habits, Spending, Your next message…) settles in under its title: a short
   fade and 4 px slide — no height animation at all, so nothing below it is laid out per frame.
7. **◎ missions rises** from the chat box; **◉ Activity flies out** of the rail, like the menus.
8. **The chats panel** (☰ / Ctrl+\) slides in from the rail when shown again.
9. **A docked chat** fades in when it opens or comes back from its thin bar (its width changes at once).
Closing stays instant everywhere: what you dismiss is gone at once.

### Reduced motion and /motion off
10. **The OS "reduce motion" setting now stills every slide, scale and spring in every look**: entrances become a
    120 ms fade (in Plain, Swirl and the v2 looks menus still slid and scaled before; Forgeheart Classic keeps
    everything off). Press bounces, shakes and the dice roll rest; menu rows stop cascading.
11. /motion off also stops the dialog backdrop's fade (it still faded).

### Glitches and jank fixed
12. **A reply no longer flashes when it finishes** (Forgeheart): the "last message slides in" rule matched as soon as
    the reply stopped streaming, so the whole reply faded in again from transparent. A message now comes in once:
    yours when you send it, a reply when it starts.
13. Switching chats no longer slides the last reply on its own inside the chat's slide (two animations, two layers).
14. The chat's slide on a switch ends on its own animation: a message's entrance ending inside it cut it short.
15. **Pressing a resize edge no longer restyles the whole page** (the docked chat's edge, the chats panel edge, the
    grid gaps, the game divider): the drag cursor was set on `<body>` and inherited by every element (≈ 34k elements
    restyled per double-click with the Lab open). A sheet over the window now holds the cursor during the drag.
    Row gaps in the grid show the row cursor.
16. **Scrubbing a Lab value** (dragging a number) starts and ends without restyling every element of the page (it was
    `body.tw-scrubbing *`).
17. Frame-size buttons and other v2 controls ease only colors, opacity and transforms: the shared hover tempo eased
    `all` of their properties, so a frame size turning bold relaid out the Lab's toolbar every frame and its glow
    repainted.
18. ◎ missions opens without measuring itself: it's placed by its bottom-right corner before it's in the page
    (measuring it forced a style + layout of the page on every opening); "More" grows it upwards.
19. ◉ Activity is placed before it's in the page (no forced layout on opening).
20. ⋯ AI setup doesn't ask a freshly built sheet for its scroll position (a forced style + layout as it came in).
21. ◎ missions and ◉ Activity lay out on their own (`contain: layout paint`): hovering their cards never reaches the
    page's layout.

## For the next measurer (not counted)
- `dev/checks/motionpolish.js` (`sh dev/run-checks.sh motionpolish`, in `smooth`): per-surface frames / work / style /
  forced layouts, what moved and on which tempo, the stylesheet audit, reduced motion, /motion off.
  `window.MP_ONLY = ['menu', …]` runs some stretches, `window.MP_REPORT = 1` reports without failing,
  `window.MP_ALLOW` replaces the allow-list.

## Not fixed (measured, left as is)
- **Dialogs**: ≈ 6,900 elements restyled per open and close. That's the browser making the rest of the window inert
  for a modal dialog (a whole-document restyle in Chromium), not the animation; replacing `showModal()` everywhere
  wasn't worth the risk.
- **Switching chats / windows**: the cost is drawing the new content (≈ 40 messages) and the Lab's own checks
  (`syncPark`, the preview sizer on a pointerdown, the chat's fold measuring); unchanged here, see smooth32's notes.
- **Folds and the chat box don't animate their height**, on purpose: a height animation is a layout per frame (even
  the grid 0fr→1fr trick lays out the content every frame); the fold's content fades in at its final size instead,
  and the chat box grows at once line by line.
- Left as they are (allow-listed in the check): one-shot attention flashes animating a box-shadow on one element (a
  found message, a control the keys sheet points at, ↻ Again, a Lab slider the director moved), thin progress fills
  easing their width a few times per task (a molten gradient that a transform would distort), the node editor's own
  wires and bars. The blur behind Forgeheart dialogs and the palette only fades with opacity (compositor-side).
- Closing is instant (no exit animations): checks and code across the app expect a dismissed surface to be gone at
  once.

## Tested
`node --check` on every touched JS file; `sh dev/run-checks.sh motionpolish options simplify3 missions missions2
swarmlean chat-stream activity grid-resize declutter polish director-dock lazy unit:boot-test smooth32 smooth26 labhub
fastboot` — all pass. Screenshots: the chat and ◎ missions in Forgeheart (placed exactly where it was, above ◎).

## Edits outside the motion CSS
`native.js` (the chat-switch slide's end, 4 lines), `missions.js` (placing ◎), `activity.js` (one line moved),
`options.js` (one line), `grid-resize.js` (the row cursor class), `declutter.js` (the reveal's tempo),
`tools/three-lab.css` (the scrub cursor), `dev/run-checks.js` (smooth group).

## For the patch notes
- Everything that moves now moves on one rhythm: menus, popovers, toasts and folds take 180 ms, drawers, dialogs and
  switching chats or windows 240 ms, hovers 120 ms, all with the same easing.
- ⋯ AI setup slides in, ◎ missions rises from the chat box, ◉ Activity flies out of the rail, the chats panel slides
  in, and a fold in AI setup settles in under its title, instead of popping. All of it runs on the GPU only.
- In Forgeheart, a reply no longer flashes (fades in again from transparent) the moment it finishes.
- Pressing or double-clicking the edge of the docked chat (or any resize edge) no longer makes the whole window
  recalculate its styles: about 4× less work. Scrubbing a Lab value starts and ends without that hitch too.
- The frame-size buttons over the Lab preview no longer relayout the toolbar for every frame of their hover.
- If your computer is set to "reduce motion", nothing slides, scales or bounces any more in any look: things just
  fade in quickly. /motion off now really stops everything, the dark backdrop behind dialogs included.
- Closing anything stays instant, and nothing looks different at rest.
