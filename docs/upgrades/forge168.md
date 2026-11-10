# Round 168 · forge168: Forgeheart frames cheaper, same pixels

Round 167 found that on software GL every frame redraws the whole window, and that in the Forgeheart look (the owner's)
one layer — the ground's lights over the chat — cost ≈ 25 % of each frame. This round found exactly what that layer
was, drew it only where it shows, and fixed polish8's "board item: look before send" (a check problem, not the menu).
The Lab, Scenes v2, the Lab's CSS and Codex's files were not touched.

## What the lights layer was

Forgeheart 2 (`data-skin="forge"` + `data-look="v2"`, look.css) paints the window's ground on `body`: a deep black that
darkens 3 levels downwards, and two see-through radial gradients on it — a warm light from above
(`ellipse 75% 48% at 50% -14%`, `--heat` at 9 %, transparent at 72 %) and a violet ember low right
(`ellipse 46% 40% at 104% 108%`, 6 %, transparent at 70 %). No blend mode, no filter, no animation.

Since round 166 the chat list takes the ground's plain base colour (an opaque box Chromium scrolls on the compositor,
with subpixel text) and the list's wrap draws the two lights over it (`.messages-wrap.tint-back::before`, chatcore.css,
`background-attachment: fixed`, z-index 1). Because it lies over a composited scroller, that `::before` is a GPU layer
of its own (reason "Overlap"): **1148 × 728 px, the whole chat**, drawn again in every frame. It never repainted (its
content never changes), so it wasn't paint: on software GL each layer is blended over the window in every frame, and
this one was 60 % of the window's area. Yet nearly all of it was transparent: the warm light ends 193 px below the
window's top (the chat starts at 105), the ember only covers x > 1062, y > 752.

The rest of the Forgeheart frame, measured by turning each part off: the `body::after` full-window overlay (z-index 70,
look v2 sets its background to the texture variable, which is `none` outside the rail and headers) costs nothing
measurable (59–64 ms with or without it); the composited list, the window's root layer and the scrollbar are the frame.

## The fix: each light only where it shines

`native.js` (`tintBox`, `tintPlace`, `placeTints`): for each light of the ground that is a radial gradient with an
explicit size and centre and ends transparent, the box where it isn't transparent is computed from its own numbers
(centre ± radius × the stop where every later stop is transparent, + 2 px), in the window's pixels, and placed in the
wrap. The wrap's `::before` and `::after` (chatcore.css, `.tint-back` / `.tint-two`) each draw one light in its box,
still `background-attachment: fixed`, so the gradient is laid out against the window exactly as before. Two lights →
two small layers (here 1148 × 91 for the warm light and 420 × 84 for the ember: **17 % of the old layer's area**); a
light that misses the chat has no layer at all. Any other light (a linear or repeating gradient: Forgeheart Classic's
grid) keeps the whole wrap, as before; three or more lights share one box around them all.

A box is anchored to each wrap edge it reaches (the warm light: top, left and right; the ember: right and bottom), so
the side panel or project tools changing the chat's width change nothing; it is placed again when the wrap or the
window changes size (a `ResizeObserver` on the wrap, synchronously in its callback, so before that frame is drawn;
nothing is written when the placement is the same) and on every look change, as round 166's base colour. Toggling
`.tint-back` still turns all of it off (chat165's and audit166's "old way" pictures rely on that).

## Before / after

`dev/checks/forge168.js`, this way and the old way (round 167's single layer, put back with a style) in turn, same run,
a 200-turn chat, 4 shared CPUs, software GL (SwiftShader), Xvfb 1480 × 940:

| Forgeheart | Before (round 167) | After |
|---|---:|---:|
| The lights' layers | 1148 × 728 (the whole chat) | 1148 × 91 + 420 × 84 (**17 %**) |
| One frame in a chat (a 3 px change): GPU-process CPU | 62 ms (64 in another run) | **46 ms** (48) — **−26 %** |
| One frame with Settings open | 119 ms (122) | **102 ms** (109) — **−14 %** (−11 %) |
| 30 wheel turns up the chat: GPU-process CPU per run (3 runs each way) | 7,750 ms (7,833) | **6,673 ms** (6,983) — **−14 %** (−11 %) |
| …the window's paint / raster (one traced run each way) | 90 / 20 ms (82 / 21) | 118 / 18 ms (82 / 25): ≈ 1 ms a wheel turn either way, noise |
| The chat still scrolls on the compositor | yes | yes |
| Pixels vs the old way: chat / Settings open / the wrap 140 px shorter | | **max 1 / 1 / 0 levels** of 255 (188 / 4 / 0 of 1,391,200 pixels differ, by 1) |

The floor, measured by hiding the lights altogether (not shipped): 46 ms a frame in a chat, ≈ 100 ms with Settings
open; the boxes get to within 2 ms of it in a chat. What's left with Settings open is Settings itself (round 167's
next candidate #2: its scroller and two overlapping layers), not the lights.

On a real graphics card nothing here is saturated, so the gain is one 836,000-pixel blend less per frame — still less
work and battery, never more.

## polish8: "board item: look before send"

Not a regression in the menu. polish8 keeps each menu's labels joined into a string cut at 300 characters
(`out.menus`, for the report) and checked `indexOf('Look') < indexOf('Send vibe')` on that string. Round 141
(`c23aa741`, matchscore141) added "◎ Match against this in the Lab" to a picture's menu; the menu is still in the right
order (… Arrange | Look | Your note on it… | Tags | Stamp | Send vibe to a chat | Vibe …, polish8.js `ordered`), but
"Send vibe" now starts past character 300, so `indexOf` gave −1 and the check failed. Verified by running polish8 on
`c23aa741^` (passes, "Send vibe" at character ≈ 270) and `c23aa741` (fails), both through `--app`. The check now reads
the whole label list for the order (`rowsOf`) and requires both rows to be there; the report string is unchanged.

## Check

`dev/checks/forge168.js` (`node dev/run-checks.js --exact forge168`; group `forge168`): in Forgeheart the lights'
layers cover ≤ 25 % of the chat's wrap and the chat still scrolls on its own layer; the window matches the old way
(≤ 2 levels anywhere: the chat, Settings open, the wrap resized as by a grown composer); one frame ≤ 85 % of the old way
in a chat and ≤ 95 % with Settings open; wheeling reported, failing only on a regression (> 110 %); back in the plain
look no lights are drawn. `window.F168_REPORT = 1` reports without failing.

Final run (`--exact forge168 polish8 paint167 chat165 audit166 redux151 look148 settingscalm playfix fastboot
unit:boot-test unit:lazymanifest-test chatcore`): **13 / 13 passed** (forge168 in that run: a frame 0.74 × the old
way in a chat, 0.86 with Settings open, wheeling 0.86; paint167 still 0.75 / 0.71 / 0.76 of its own old way).
`node dev/whatsnew-test.js`: 49 passed. `node dev/lazy-manifest.js --check`: clean; `node dev/trim-weights.js` rerun
(native.js +3 KB); fastboot and unit:boot-test (the boot budget) pass. origin/main and
origin/claude/intelligent-galileo-yaiqem had nothing new to merge (both at 82c3c02b, round 167's merge).

## For Codex

No Codex-owned file was edited; nothing in them reads the wrap's lights.

## Next candidates

1. Settings in Forgeheart (≈ 110 ms a frame, plain 72): its dialog scroller is a layer of its own with an `::after` and a
   section over it ("Overlap"); the same box idea may apply to the `::after`.
2. The empty `body::after` overlay in Forgeheart 2 (texture `none` outside the rail) is still a full-window layer; it
   measured free here, but `content: none` when there's no texture would drop it from the tree.
