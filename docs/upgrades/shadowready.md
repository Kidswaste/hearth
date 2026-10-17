# Round 56: ▶ Play's shadows are chosen while getting ready (shadowready)

Until now the Best look raised a game's shadow maps to the screen's size and then, a few seconds into play, measured
frames and stepped the size down if they didn't fit. Every step made the shadow maps again (a new colour + depth texture
per light: a hitch), and round 55 only moved that step to 5.5 s, after getting ready's first-5-seconds window. Now the
size is decided **under Getting ready's card** and nothing is made on the graphics card once the game plays.

## Upgrades

### Chosen before the first frame
1. **The shadow size is measured under Getting ready's card**: the budget's A/B (`tools/playbudget-page.js`) draws the
   game's own scene at each size from the screen's (2048 on a big screen) down to the game's own 512, each frame waited
   for to the end on the graphics card, and keeps the biggest size that fits the screen's refresh (with 10 % left for the
   game's own work). When none fits it steps down only while a step saves ≥ 8 % (past that the shadows aren't what's
   slow, so the sharper one stays).
2. **Exactly that size is made there**, plus the size below it as a ready-made fallback; any other size measured is let
   go before the card closes.
3. **Remembered per game** in the existing per-game record (`data/game-cache/budget.json`, `shadow: { size, to, hz }`;
   datasafe read, atomic write). The next ▶ Play of that game starts at that size from the first look (never makes the
   bigger maps) and the A/B only confirms it from there. A different refresh rate or screen size chooses again.

### Never a new texture while playing
4. **The guard only watches**: a 30-frame look every 2 s; frames over 1.25 × the refresh in every look for 10 s (a real
   slowdown, not a level loading) → the smaller maps made while getting ready are swapped in (a pointer swap: no texture
   made, no upload), kept only if that helps ≥ 8 %, else swapped back.
5. **When there's nothing prepared to swap to** (getting ready was skipped, or the shadows are already at the game's own
   size) the guard keeps them and says why, instead of making new maps mid-play.
6. **Switching the look off mid-play** (the budget's watch) reuses the 512 maps made while getting ready when there are
   some, instead of making them then.

### Said in plain words
7. **The F chip and the performance doctor** say the size and how it was decided: "Shadows: 2048 (chosen while getting
   ready)", "… (chosen while getting ready, remembered for this game)", "Shadows: 512, the game's own (bigger ones don't
   fit 60 Hz here: measured while getting ready)", "… lowered from 2048 to stay smooth: frames missed the refresh for
   10 s; that size was made while getting ready, so no hitch", or why they were kept.
8. **`/game look shadows`**: the size now and the one remembered for the game. **`/game look shadows reset`**: forget
   it, chosen again at the next ▶ Play. (In `/game`'s suggestions.)

### Checked
9. **`dev/checks/shadowready.js`** (group `shadowready`): a throwaway game with a heavy sun shadow (its shadow pass costs
   time in proportion to the map's area: 2048² = 1.2 frames at the refresh) on a 1600×1000 screen at 200 %. The A/B
   draws 2048 first and chooses smaller; both sizes made under the card; then 22 s of play where the game slows itself
   to 1.5 frames a frame: WebGL's prototypes counted from under the card, **0 textures / render buffers / framebuffers /
   buffers / shader compiles / program links after the first frame**; the guard decides without making anything; the F
   chip line; remembered; the next ▶ Play starts at the remembered size (no 2048 made, again 0 after the first frame);
   `/game look shadows [reset]`; the game's file unchanged. **`dev/shadowready-test.js`** (unit): the choice rule, the
   maps per size on a fake three.js (a size made before comes back with nothing made, the fallback while playing,
   switched off, remembered / not for another refresh or screen, the doctor's lines) and the per-game memory.
10. `dev/checks/gamelook.js` now expects the size chosen while getting ready and nothing made while playing.

## Measured (this container: SwiftShader, 60 Hz, 1600×1000 at 200 %)
`dev/checks/shadowready.js`, the same check on round 55's code (c09e048) and on this round's:

| | round 55 | round 56 |
|---|---|---|
| GPU objects made after the first frame, first ▶ Play (22 s, frames not fitting) | 10: shadow maps made again at 9.3 s and 13.5 s into play (each: 2 textures + a framebuffer) | **0** |
| … second ▶ Play of the same game | 5: made again at 9.8 s | **0** |
| shadow sizes made, second ▶ Play | 2048, then smaller mid-play | the remembered size and its fallback only, under the card |
| shadow size decided | 5.5 s+ into play, by stepping down | under Getting ready's card (≈ 0.5–1 s of the card: 2–3 sizes × 2 blocks of frames) |

Getting ready's own first-5-seconds count stays 0 compiles / 0 uploads; gameready and playbudget pass unchanged.

## For the patch notes
- **▶ Play: no more shadow hitch a few seconds in.** The Best look now picks the shadow size while "Getting ready" shows
  (the biggest that keeps your screen's refresh), prepares it there, and remembers it for the game; nothing is rebuilt
  while you play. The F chip / doctor say "Shadows: 2048 (chosen while getting ready)". `/game look shadows` shows it,
  `/game look shadows reset` chooses again.
