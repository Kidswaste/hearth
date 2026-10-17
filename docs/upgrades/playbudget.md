# Round 55: ▶ Play keeps Hearth's own work under 2 % of a frame (playbudget)

The owner, after round 54: "Play does look best but the framerate is abysmal". gamefps54 fixed the cause; this round makes
sure it can't happen again, on any computer, even ones we can't test: Hearth measures its own work inside the game
window while the game plays, and steps aside by itself when it costs the game frames.

What counts as Hearth's: the page scripts ▶ Play adds to the game window (the look `gamelook-preload.js`, loads during
play `tools/gamestream-page.js`, the sound part `tools/gameaudio-page.js`, getting ready `tools/gameready-page.js`, the
performance probe `tools/gameperf-probe.js`, the F chip in `game-preload.js`) and the new watch itself. The budget: 2 %
of a frame at the screen's refresh, never under 0.1 ms (240 Hz: 0.1 ms; 144 Hz: 0.14 ms; 60 Hz: 0.33 ms).

## Upgrades

### Measured in the game window, per helper
1. **Every helper times its own hooks** (two clock reads around each, a running total, no per-frame allocation); work a
   helper only does *earlier* than the game would (a shader compiled before the first draw, a texture uploaded a frame
   ahead) is the game's own and isn't counted. The game window is cross-origin isolated, so the clock is in 5 µs steps.
2. **One watch** (`tools/playbudget-page.js`, first in every page the window serves): one frame callback of its own,
   once a second the totals become "ms a frame" per helper and Hearth's total.
3. **Getting ready's hooks retire 5 s into play** (once its first-5-seconds count is done) and no longer wrap
   `activeTexture` / `bindTexture` at all (hundreds of calls a frame): an upload's texture is read from the context's
   own binding instead.

### Steps aside by itself
4. **Over the budget for 3 s in a row while playing → the most expensive helper is switched off** for that game (its
   hooks put back or passing straight through; what it changed that costs frames put back: the look's shadow maps at the
   game's own size; anything held by loads during play shown at once), then the next one if Hearth is still over.
5. **One quiet A/B under Getting ready's card** (both a Lab scene and an HTML build): the game's own scene rendered in
   blocks of frames with the helpers on and stepped aside, alternating, each frame waited for to the end on the graphics
   card (so the screen's refresh can't hide a difference), plus the graphics card's own time where the browser has the
   timer extension. When the helpers' own measured time is over the budget AND the frames confirm it (on slower in
   nearly every pair, by more than the budget) → the most expensive helper is off before the first frame of play, and the
   A/B again until on ≈ off. Frames alone never switch a helper off (a busy computer's noise must not, since it's
   remembered for the game: found on this machine, where it did).
6. **The Best look's picture measured on the graphics card** in the same A/B (its shadow maps vs the game's own size),
   for the doctor. Whether that picture fits the screen's refresh stays the look's own guard's call (its frame gaps,
   round 54), so Best stays Best wherever it fits.
7. **Remembered per game** (`data/game-cache/budget.json`: a Lab scene by its id, an HTML build by its file; datasafe
   read, atomic write): the next ▶ Play of that game starts without that helper at all (the look not loaded, loads during
   play not added, the sound part off, getting ready skipped, the probe dormant).

### Said once, in plain words
8. **The F chip shows Hearth's cost**: "… · 240 Hz · HTML build · Hearth: 0.03 ms" (the chip's own time counts too).
9. **The F chip's note** when something was switched off: "Hearth's helpers were slowing Clink a little; turned off: the
   look".
10. **The performance doctor lists each helper's cost** ("Hearth's own work in the game: 0.03 ms a frame (at most 0.1 ms:
    2 % of a frame at 240 Hz) · the look 0.012 ms · loads during play 0.008 ms · …"), the note, and **Turn them back on**
    (from the next ▶ Play; still watched). The director's `three_do perf` gets the note as one line, only when something
    was switched off.
11. **`/game helpers`**: Hearth's cost now, each helper, what this game plays without; **`/game helpers on`** tries them
    again.

### Checked
12. **`dev/checks/playbudget.js`** (group `playbudget`): two throwaway games that make the look expensive (a fresh hidden
    group of thousands of debris meshes every frame / every render). The watch must switch the look off while playing,
    frames back to "off" speed, remembered (the next ▶ Play at "off" speed from the start), the chip, the doctor,
    `/game helpers`, Turn them back on; the A/B must catch the other game before its first frame. `dev/playbudget-test.js`
    (unit): the budget, the order, the A/B's verdict against its noise, the watch on a fake page (sustained vs a spike,
    waits for play), the look's own off / pause, the memory (an unreadable file never written over).

## Numbers (this machine: a shared software GPU, a slow CPU, a 60 Hz test screen → 0.33 ms budget)

`dev/checks/playbudget.js`, the work around the game's render a frame (in the page, as gamefps54 measures it):

| Heavy test (debris added every frame) | ms a frame |
|---|---|
| off (round 53's ▶ Play) | 0.29 |
| all helpers on, before the watch acted | 2.10 (the look: 1.92 of it) |
| after the watch switched the look off (6 s into play) | 0.35 (within 0.1 ms of off) |
| the next ▶ Play (remembered) | 0.36 |

Hearth's own total in a normal game here: 0.02 ms a frame (loads during play 0.004, getting ready 0.001, the watch
0.014); with the performance probe attached (the doctor) 0.11 ms (the probe 0.074). The owner's CPU does the same work
about three times faster. The A/B on the second test game: the look's own time 4.5 ms a frame → off before the first
frame, then on ≈ off; it takes 0.6–1 s under the card.

## For the patch notes
- **Hearth can't slow your game down any more.** While a game plays in ▶ Play, Hearth measures how much of each frame
  its own helpers take (the look, loads during play, the sound part, the stats) and keeps it under 2 % of a frame.
- If one of them ever costs your game frames (on any computer), Hearth switches it off by itself for that game, keeps it
  off next time, and tells you once: "Hearth's helpers were slowing Clink a little; turned off: loads during play".
- Before the first frame, while "Getting ready" shows, Hearth quietly compares a few frames with its helpers on and off,
  and starts without any that would make it slower.
- The F stats chip now shows Hearth's own cost ("Hearth: 0.03 ms"), and the performance doctor lists each helper's cost
  with a "Turn them back on" button.
- `/game helpers` shows the same; `/game helpers on` tries them again from the next ▶ Play.
