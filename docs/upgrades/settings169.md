# Round 169 · settings169: Settings cheaper to draw while open, the Mood board's +17 %

Round 168 left "what remains with Settings open is Settings itself" (a Forgeheart frame with Settings open ≈ 102–109 ms of
the graphics process' CPU vs 46 in a chat), and round 167 had made opening / leaving the Mood board ≈ 17 % dearer. This
round found why for both and cut them with no visible change. The Lab, Scenes v2, the Lab's CSS and Codex's files were
not touched.

Measured on this box as rounds 167–168: 4 shared CPUs, software GL (SwiftShader: every frame redraws the whole window),
Xvfb 1480 × 940, a 200-turn chat behind Settings. Layer trees from DevTools' LayerTree (`smoke({ layers: true, detail:
'xy' })` now also gives each layer's position, parent and paint count); every cause below was confirmed by turning that
one thing off and on in the same run.

## Settings in the plain looks: its backdrop was a full-window picture

- Settings' dialog was painted into its backdrop's GPU layer (the 60 % dim over the window). A dim alone is one colour,
  which the compositor fills for almost nothing; with the dialog in it, that layer became a 1480 × 940 picture drawn
  again in every frame. Measured: with the dialog hidden (no dialog, no dim) a frame costs 50 ms; dialog without its
  dim 69; dialog painted into its dim 85.
- Its form (the part that scrolls) has a transparent background, so Chromium didn't scroll it on the compositor (it
  would lose crisp text): each wheel step repainted and redrew that full-window layer. 16 wheel steps: ≈ 1,400 ms.
- Not the cause: the dialog's big shadow (0 20px 60px), the rounded corners, the scroll fade on the look grid (≤ 3 ms
  each, within noise).

**Fix** (`appui-dialogs.js`, `features.css`): when the dialog's background is one opaque colour and it has no clip-path
(the plain looks; checked again when the look changes while Settings is open), it gets class `.sd-solid`:
`will-change: opacity` (a layer of its own: the dim stays a plain fill) and the form takes the dialog's colour
(`background-color: inherit`): an opaque scroller, moved by the compositor without repainting.

## Settings in Forgeheart: its plates were layers, so its cut corners needed a mask

- Each Forgeheart 2 plate (`.settings-section`, look.css' forged-plate background: opaque) was a GPU layer of its own:
  Chromium keeps text that sits on an opaque background on its own layer rather than merge it into a see-through one
  (the dialog is 93–97 % opaque in Forgeheart 2), to keep it crisp. The first plate overlapped the ground's light (round
  168's layer) and everything after it went into a second layer (628 × 749).
- Composited content under the dialog's cut corners (`clip-path: polygon(…)`, forge-skin.css) can't be clipped by the
  compositor's rectangles, so Chromium drew a mask layer (684 × 886) and an offscreen pass for the whole dialog in every
  frame. Measured: plates on their own layers + mask 125 ms a frame; plates merged 87; the clip-path off (not shipped)
  98 with the plates still layers.

**Fix**: (1) `look.css`: in Settings the plate's own colour is 99.6 % opaque (≤ 1 level of 255 on screen), so the
plates are drawn with the dialog. (2) `forge-skin.css` / `look.css`: Settings' frame (background, border, shading) is
drawn by a `::before` that carries the clip-path, and the dialog itself has none, so nothing inside it is under a
clip-path: no mask layer, and its form scrolls on the compositor (`will-change: scroll-position`, rectangular clips
only). Only where the corners are cut (not with round or square corners, where `--cut` is `none`).

## The Mood board's +17 % (round 167)

A/B on the board surface's entrance (`polish.css` `.surface.active`, `hx-scene`; the instructions pointed at
polish8-board.css, whose only entrance is the quick bar's): `both` (round 166) vs `backwards` (167). Board open (4 s) and
leave (1.5 s), GPU-process CPU, 3 runs each way, same run:

| Entrance | Open + leave |
|---|---:|
| `both` (round 166) | 2,220–2,330 ms |
| `backwards` (rounds 167–168) | 2,630–2,750 ms (**+13–17 %**) |
| only the fade (opacity) part | 2,540 ms |
| only the slide (transform) part | 2,270 ms |
| `both` on the board's surface only | 2,290–2,470 ms, but a frame on the board 86 → 103 ms |
| no entrance at all (not shipped) | 1,650 ms |

So the cause is confirmed and narrowed: when the board's fade ends with `backwards`, its surface's layer goes and the
board's own layers under it (the overlay, the HUD) are rasterised afresh: a GPU trace shows the frame where the
entrance ends costing 90–111 ms (39–41 with `both`) and 77 tiles rastered vs 57. Not LCD text (same with
`--disable-lcd-text`), not Blink paint (same paints both ways). Keeping `both` (the always-alive *animated* layer) on the
board puts back +17 ms on every frame there, because an animated layer can't hide what's under it.

**Fix** (`polish8-board.css`): the board's active surface keeps a plain layer of its own (`will-change: opacity`,
motion on only). The layer exists before and after the entrance, so nothing is redrawn when the fade ends; being a
plain (not animated) opaque layer, a frame on the board costs the same within noise (0.97–1.05 × round 168 over four runs).
Leaving the board for a chat is the chat's own entrance ending (the same as any switch to a chat, where round 167's
saving on every later frame outweighs it); no always-alive layer is brought back anywhere else.

## Before / after

`dev/checks/settings169.js`, this way and round 168's way (put back with a style) in turn, same run:

Two full runs (the final one first, then the one before it), GPU-process CPU:

| | Round 168 | This round |
|---|---:|---:|
| One frame with Settings open, plain | 85 ms (103) | **74 ms** (87) — **−13 %** (−15 %) |
| One frame with Settings open, Forgeheart | 123 ms (131) | **105 ms** (108) — **−14 %** (−17 %) |
| 16 wheel steps inside Settings, plain | 1,313 ms (1,690) | **290 ms** (373) — **−78 %** |
| 16 wheel steps inside Settings, Forgeheart | 500 ms (517) | **227 ms** (250) — **−55 %** (−52 %) |
| Settings opened and closed twice, plain | 3,090 ms (3,445) | 2,845 ms (3,055) — −8 % (−11 %) |
| Settings opened and closed twice, Forgeheart | 6,560 ms (7,465) | 5,770 ms (6,100) — −12 % (−18 %) |
| Mood board opened (4 s) | 1,480 ms (1,477) | **1,153 ms** (1,280) — **−22 %** (−13 %) |
| …and left (1.5 s) | 1,413 ms (1,553) | 1,377 ms (1,290) — −3 % (−17 %) |
| One frame on the board | 81 ms (87) | 80 ms (86) — same |

In the same runs paint167 (its own old way: round 166's fills) and forge168 still hold: a frame 0.70 × round 166's in a
chat, 0.53 with Settings open, typing 0.77; Forgeheart chat frame 0.77 × round 167's, Settings 0.88. paint167's board
action is back to 1.03 × round 166 (it was 1.17).

Where Settings' frame now stands against a chat behind it (the floor: a frame with no dialog): plain 74 vs ≈ 52,
Forgeheart 105 vs ≈ 55–70. What remains is the dialog's own layer (plain), and in Forgeheart the backdrop (a radial
gradient: a full-window picture, not a plain fill) and the compositor-scrolled form (≈ 15 ms a frame: the price of
scrolling it without repainting; without it a frame was ≈ 87 ms but 16 wheel steps ≈ 700 ms, worse than round 168).

## Pixels

Settings open, this way vs round 168's: ≤ 2 levels of 255 everywhere except, in the plain looks, the form's two left
rounded corners (31 px, up to 6 levels: the same rounded edge anti-aliased by the compositor now, where the form meets
the border's inner curve), and in Forgeheart 6 px at 3 levels in the title's soft glow (Skia's dithering, drawn in
another layer now). The board: identical (0 pixels differ).

## Check

`dev/checks/settings169.js` (`node dev/run-checks.js --exact settings169`; group `settings169`): plain: the dialog on its
own layer and the form scrolling on the compositor; Forgeheart: no plate and no mask layer in Settings; pixels as above
(≤ 2 levels; ≤ 12 px at 3; plain corners ≤ 80 px at ≤ 8); a frame with Settings open ≤ 92 % of round 168's (plain),
≤ 88 % (Forgeheart); wheeling inside Settings ≤ 60 % (plain), reported in Forgeheart (fails > 115 %); opening / closing
Settings reported (fails > 110 %); the board: its surface on a plain layer (not an animated one), opening ≤ 95 % of
round 168's, open + leave ≤ 100 %, a frame on the board reported (fails > 110 %). `window.S169_REPORT = 1` reports
without failing; `window.S169_SHOTS = '<dir>'` keeps the pictures.

Final run (`--exact settings169 paint167 forge168 settingscalm board journey-board polish8 playfix fastboot
unit:boot-test unit:lazymanifest-test chatcore look148`): **13 / 13 passed**. In the run before it, paint167 failed on
its "no layer kept for an ended animation" step, which counted the two plain `will-change` layers this round keeps on
purpose (Settings' dialog, the board's surface); paint167 now leaves out a dialog / surface layer whose only reason is
`WillChangeOpacity` / `WillChangeTransform` (an animation's layer still counts). a11y fails its "AI setup: Esc did not
close it" step the same way on round 168 (3a6023e5, run through `--app`): not this round. `node dev/whatsnew-test.js`:
49 passed. `node dev/lazy-manifest.js --check`: clean; `node dev/trim-weights.js` rerun (appdialogs +1 KB); fastboot and
unit:boot-test (the boot budget) pass. origin/main and origin/claude/intelligent-galileo-yaiqem had nothing new to merge
(both at 3a6023e5, round 168's merge).

## For Codex

No Codex-owned file was edited; nothing in them builds Settings' dialog or the board's surface.

## Next candidates

1. Leaving the board for a chat (and every switch to a chat) still pays one raster of the chat's surface when its fade
   ends (≈ 150 ms of graphics-process CPU here). A plain opaque layer for the chat surface would avoid it, but the chat
   surface is see-through over the ground: it would cost every chat frame (round 167's saving).
2. Forgeheart's backdrop is a radial gradient: a full-window picture in every frame while any dialog is open (a plain
   fill would be ≈ 10 ms a frame cheaper); the same `::before` frame trick would help the other Forgeheart dialogs.
