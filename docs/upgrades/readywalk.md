# ▶ Play, ready sooner the second time (round 57, readywalk)

Round 56's final test: a Lab scene's warm ▶ Play was barely faster than its cold one (7.4 s cold vs 7.3–8.8 s warm,
leaving out the shadow walk; totals 38 → 26 → 23 s). The A/B under Getting ready's card walked the Best look's shadow
sizes again on every run (8–27 s on this software GPU). Now a size that still holds is only checked, getting ready
skips frames that did nothing, and a GPU context lost under the card no longer spills its rebuild into play.

## Upgrades

### The shadow size: checked, not walked again
1. **A remembered shadow size is checked in a few frames.** `data/game-cache/readyspeed.json` keeps, per game, the size
   the A/B's walk chose and that size's time a frame then (`sh: { key, size, ms, ref }`), under the readyspeed key (the
   game's files, Hearth's helper scripts, the refresh rate, the look, helpers kept off). The screen size is the look's
   own check (`to`, the long edge the size was chosen for). The next ▶ Play passes it on (`sq=size:ms:refresh`), and the
   A/B's first 3 frames, already drawn at that size, are the check (`Rules.shadowHolds`). It holds when it fits the
   refresh now; when it fitted before and is now at most 25 % over; or when it didn't fit before and is now at most
   1.5× its time then (+2 ms). Only when the 3 frames read clearly slower is one more block of frames drawn, and the
   sizes are walked again only if that block also fails. A run that only checked the size keeps the walk's time, so a
   slow drift never lowers the bar.
2. **Kept:** the chosen size and its fallback are both made under the card (the fallback in its own frame) and sealed.
   No map is made while playing, and `budget.json` still remembers the size.
3. **Fewer frames on the check path.** No uncounted warm-up frame (the median of 3 already sets a slow first frame
   aside), and no extra frame after swapping back to the checked size (its maps are kept, so it's a pointer swap).
   A walk keeps every frame it had.

### Getting a Lab scene ready: no frames that do nothing
4. **No 2 extra frames once the renderers are counted.** A renderer only counts once it has drawn, so its scene is
   known and its shadow maps exist. With last run's count reached, getting ready moves on at the first count (it used
   to need two equal counts in a row).
5. **Kept on purpose: the 2 frames inside "shaders + textures".** Removing them was tried and measured. What a first
   frame makes (shadow depth programs, a transmission target: 5 programs + 1 upload on the test scene) then landed in the
   first warm-up pass, so that pass never read clean, and every warm run did 3 passes instead of one short one.

### First 5 s of play stay clean after a GPU loss
6. **A graphics-card context lost while getting ready is waited out under the card.** This was the "unexplained"
   56 compiles / 28 links / 21 uploads in the first 5 s from round 56's risks. Under load the GPU process took the
   context back during getting ready (most often during the A/B's back-to-back frames). glrecover rebuilt the layers
   just after the card went, so play compiled the whole scene again. `ready-count` now reports `rebuilds` / `lostNow`
   (plus `ctxMade` / `gmMade`). Getting ready checks before and after the A/B. After a loss the card says "the graphics
   card is back: getting ready again", waits for the rebuild, then prepares and warms again (`result.gpuBack`).
   `first5` records `rebuilds`, `ctxMade` and `gmMade`. Measured: the base commit, run at the same time, had
   56 / 28 / 21 in the first 5 s; with this change one cold run caught a rebuild under the card (19 s) and played its
   first 5 s with 0 / 0 / 0.

### The look's first-look cost (gamelook's "under 5 ms")
7. **The ~8 ms wasn't shadow maps.** A look makes no shadow maps: three.js makes them in its shadow pass, and
   shadowready's two sizes are drawn by the A/B. The cost was the card's best anisotropy, asked of the GPU process once
   per renderer: one round trip that waits behind other contexts' work (64–74 ms seen at a load of 30, 217 ms in one
   run). So neither spreading the fallback map nor a looser limit was the fix. That wait is now timed separately
   (`cost.ask`; it happens under the card, before the first frame). The look's own CPU time is split by when it ran:
   `cost.card` (the first, whole-scene look) and `cost.play` / `cost.playWholes` (while playing). gamelook keeps the
   5 ms bound on the card look's own CPU, which read 0.5–0.6 ms. It also requires 0 whole-scene looks while playing and
   about 0.1 ms on average for the looks there.

## Measured (this test machine: SwiftShader, 4 CPUs; runs one at a time under the shared run lock, load ≈ 4)
`dev/checks/readyspeed.js`, from the press to the first frame of play: base 12138e4 against this branch, one run
each, back to back under `flock /tmp/hearth-run.lock`:

| | base (12138e4) | readywalk |
|---|---|---|
| Lab scene ("Clink") cold / warm / warm2 | 42.4 / 29.9 / 22.2 s | 41.1 / **17.7 / 14.0 s** |
| Lab smooth check (A/B), warm / warm2 | 21.6 / 14.2 s (the shadow sizes walked) | 10.1 / 7.6 s (the size checked: frames ≈ 0.7 s each here) |
| Lab renderer wait ("every layer drawing"), warm / warm2 | 2.9 / 3.6 s | 1.1 / 0.1 s |
| HTML build cold / warm / warm2 | 10.0 / 8.3 / 3.8 s | 9.6 / **3.1 / 3.1 s** |
| HTML smooth check, warm / warm2 | 6.5 / 2.1 s | 1.3 / 1.1 s |
| first 5 s of play, compiles / links / uploads | 0 / 0 / 0 | 0 / 0 / 0 |

Leaving out the smooth check, as the check's threshold does, the Lab went from 13.3 → 8.3 / 8.0 s (base) to
8.3 → 7.6 / 6.4 s. Warm-up passes read clean (one quiet pass after two clean runs) in both.

Under heavy load (load 20–40, 7+ software-GPU processes: the two branches run side by side): base Lab 54.0 / 120.8 /
51.6 s with 56 / 28 / 21 in the cold run's first 5 s; readywalk Lab 72.3 (19.4 s of it waiting out a GPU rebuild under
the card) / 98.6 / 36.4 s with 0 / 0 / 0 in all three; HTML 19.9 / 9.9 / 8.2 s → 19.8 / 6.4 / 5.6 s.

The shadow check in practice: shadowready's second ▶ Play went from a 6.6 s A/B to 1.5 s ("confirmed": 3 frames read
124 ms, one more block 53 ms against 46 ms remembered, so it held). In another run, at a load of 40, the same check read
345 ms against 145 ms remembered and walked again, as designed. Lab A/B frames here take seconds each (a 4096×2048
picture, four lights, a software GPU), so the frame-bound steps dominate: warm-up passes that hit their 15 s timeout,
the first frame behind the card. On a real graphics card those frames take a few ms.

## Tests
- unit: readyspeed-test (10 groups; new: the shadow memory; a check keeps the walk's time; a fresh walk replaces it; a
  timed-out walk is kept; an unmeasured one is not; `sq=` in the page tag), shadowready-test (new: `shadowHolds`),
  playbudget-test, boot-test: pass.
- Under the run lock (final code): readyspeed ×2 pass, shadowready ×2 pass (the second ▶ Play's size "confirmed"),
  gameready ×2 pass, lazy pass. gamelook ×2 pass (`card` 0.5–0.6 ms, `ask` 64–74 ms). playbudget pass.
- Earlier, unlocked runs under load 20–40 failed on the machine (GPU contexts refused to the game window: "Error
  creating WebGL context"; a Lab cold run past the check's 180 s; a first walk cut short at 2048). The base commit
  failed the same way at the same time.

## Edits outside the stream's own files
`tools/playbudget-page.js` (the check), `tools/readyspeed-core.js`, `gamereadymain.js` (`sq`), `tools/gameready.js`
(the note carries `shadow`), `tools/gameready-page.js` (hints, frames, gpuBack), `tools/three-sandbox.html` (small:
`ready-count` diagnostics, a context counter), `gamelook-preload.js` (cost split, `ask`),
`dev/checks/{readyspeed,gamelook}.js`, `dev/{readyspeed,shadowready}-test.js`, `tools/game-api.md`.

## Risks
- **A checked size on a changed computer** (a new driver, a much busier machine): the check compares against that
  game's own time then. Clearly slower walks again, and the guard while playing still swaps in the fallback.
- **Fewer frames before the scan / prep**: covered by the warm-up pass and the first-5-s count on every run.
- **The A/B seems to be where the GPU process takes contexts back under load.** getting ready now waits it out
  (up to 30 s for the rebuild), but the A/B's long synced frames on a software GPU are worth a look next round.
- All timings above were taken under heavy load (other agents' checks, 7+ software-GPU processes at once).

## For the patch notes
- **▶ Play gets ready faster the second time.** Hearth remembers the shadow size it picked for each game and only
  checks it in a few frames, instead of trying every size again on every ▶ Play.
- If the game, the screen or the refresh rate changes, or the remembered size is clearly too slow now, it picks again.
- Getting a Lab scene ready skips a few frames that did nothing.
- If the graphics card hiccups while "Getting ready" shows, Hearth now waits for it and gets the game ready again, so
  the first seconds of play stay smooth instead of loading everything again.
