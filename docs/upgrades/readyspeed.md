# ▶ Play, ready sooner (round 56, readyspeed)

The owner: Clink should get from ▶ Play to its first smooth frame as fast as possible, especially the second and later
times. Getting ready (round 52) did everything again on every ▶ Play, at the same length: the same steady waits, two
warm-up passes, and playbudget's smooth check (the A/B of Hearth's helpers, 1–3.5 s on a real card, far more on this
test machine). Now each step is timed on one clock, and a game played before skips or shortens what is still valid for
it. The guarantees stay: 0 shaders compiled and 0 textures uploaded in the first 5 s of play (counted on every run),
nothing new per frame during play, the owner's files only read. Nothing goes into any prompt (0 tokens). No new button.

## What the owner sees
1. ▶ Play Clink as before. The card is the same.
2. The second time (and later), the card goes sooner. Once per game, the first time it is clearly sooner (≥ 15 % and
   ≥ 0.3 s), a quiet line shows under where the card was for 3 s, after the first frame of play: **"Ready in 7.5 s (was
   25.4 s)"**. It never takes the mouse and is never shown again for that game.
3. `/game ready` says how the last ▶ Play went, step by step:
   ```
   Clink: From ▶ Play to the first frame of play: 1.4 s (window 0.0 s, card 0.1 s, first frame behind it 0.3 s)
     Hearth looks at its files: 5 ms
     the window opens: 8 ms
     the page starts: 75 ms
     loading: 175 ms
     textures: 160 ms
     shaders: 1 ms
     warm-up frames: 957 ms
     smooth check: 3 ms
     …
   The smooth check was skipped: its last result for this game still holds.
   ```

## How it works
**One clock.** `GameMode.play` notes the press (epoch ms) and hands it to `GameReady.prepare`; the main process times
asking → page built (or kept) → window made → page loaded (`info.timing`); the game's page marks each step of getting
ready (`__gameReady.marks`, page ms, lined up through `performance.timeOrigin`); a Lab scene's page also times its files
read, its pictures decoded off the page's thread and its KTX2 copies transcoded. `ReadySpeedCore.timeline` turns them
into steps from the press to the first frame of play (`GameReady.state().speed`).

**What a run teaches the next** (`readyspeedmain.js`, `data/game-cache/readyspeed.json`, per game, read back on the
next launch; datasafe read, atomic write, 100 games). The window's page gets them in its script's query
(`gamereadymain.pageTag`), worked out once per window:
- **The smooth check's verdict is reused** (`abs`) when the last A/B of this very game found Hearth's helpers cost it
  nothing, and its key is the same: the game's files (a Lab scene: its built page's own key; an HTML build: every file
  in its folder by size + date), Hearth's helper scripts in the window, the screen's refresh, the look, the helpers kept
  off. Never for a game where a helper was ever switched off (by the A/B or by the watch while playing): that game is
  measured every time. The watch (2 % of a frame) still runs during play as before.
  Since shadowready (merged): only the helpers' cost pairs are skipped (`ab({ costs: false })`); the A/B still confirms
  the Best look's shadow size from the one remembered and makes both maps under the card, every run. On this software
  GPU that walk takes seconds (nothing fits the refresh); on a real card the remembered size fits at once.
- **Every program reports COMPLETION_STATUS** (`KHR_parallel_shader_compile`) before getting ready goes on, Lab player
  and HTML path (a `compileAsync` cut short by its 8 s guard could leave programs compiling into play).
- **No steady wait for the layers** (`rn`): a Lab scene waited until its count of drawing renderers held for 0.6 s; now
  it goes on once as many as last time draw (plus 2 frames of theirs: what a first frame starts, shadow maps).
- **No quiet wait for an HTML build's loads** (`ld`): it waited 0.35 s of quiet after the last load; now it goes on once as
  many loads as last time are in.
- **One short warm-up pass** (`wq`) when the last two runs' first warm-up pass found nothing more to compile or upload
  and their first 5 s were clean (a Lab scene: 3 frames instead of 2 passes of 5 + 0.25 s); any pass that finds work
  goes back to the full loop.
- **"Ready in x s (was y s)"**: was = the game's first ▶ Play (`was`, `sw` once).

**Faster every time, also the first:**
- Every program is handed to the driver at once (`compileAsync` over every renderer and scene, `KHR_parallel_shader_compile`
  compiles them side by side) and the textures upload while they compile, then one wait for all (it was one scene's
  compile, its textures, the next). Both a Lab scene (the player's `rdyCompile`) and an HTML build.
- A Lab scene's page reads its pictures and song from its first line, while the player starts (it asked only after
  the player said ready), and three.js is `modulepreload`ed in the page's head (fetched and compiled while the page
  starts; the layers import it only once the pictures are in).
- Pictures still decoding off the thread now count as loading in the Lab player (they could land in a warm-up pass).
- An HTML build's two extra warm-up frames run only when its warm-up compiled or uploaded something.

**Already in place, kept:** pictures decoded off the page's thread (`createImageBitmap`), KTX2 transcoded in workers,
the shader disk cache of `persist:hearth-game`, the Lab page kept between runs (`hearth-play.json` key), hashes
remembered by size + date. **Not possible / not done:** WebGL has no program binaries to keep; the `hearth-game:`
responses don't go through Chromium's HTTP cache (a custom protocol), so cache headers change nothing there.

## Measured (dev/checks/readyspeed.js on this test machine: SwiftShader, the "GPU" is shared CPUs, other agents' checks running)
From ▶ Play to the first frame of play. Cold = a fresh Chromium profile and data folder (nothing compiled or remembered),
warm = the same game again. Frames here take 0.2–1 s each, so the frame-bound steps (warm-up, the smooth check) dominate;
on a real graphics card they are a few ms a frame and shader compiles are the bigger part of a cold start.

| | Before (round 55 + timing only, 1 run) | After (4 runs) |
|---|---|---|
| Lab scene ("Clink"), cold | 39.6 s | 25.4–49.4 s (the machine's load swings it 2×) |
| Lab scene, warm: 2nd / 3rd ▶ Play | 27.9 s / 31.3 s (**29 % less** than cold at best) | 13.3 / 7.5 s, 20.3 / 7.0 s, 52.2 / 12.9 s, 31.8 / 39.6 s (**36–84 % less**, median ≈ 67 %) |
| HTML build, cold | 6.6 s | 7.8–17.8 s |
| HTML build, warm: 2nd / 3rd ▶ Play | 7.8 s / 6.6 s (**1 % less**) | 3.4 / 1.4 s, 4.2 / 4.4 s, 3.8 / 4.2 s (**72–86 % less**) |
| First 5 s of play: compiles / links / uploads | 0 / 0 / 0 | 0 / 0 / 0 on every run but one (see Risks) |

Where the warm time went (the same check's steps): the smooth check 7.2–7.6 s → 0 (Lab), 4.8–6.0 s → 0 (HTML); the
layers' steady wait 1.8–4.1 s → 0.1–1 s when the frames come; warm-up 15 s (2 passes) → 0.1–1.5 s (one 3-frame pass,
3rd run) when the machine isn't swamped (one swamped run: 22 s either way); an HTML build's loading 0.5–0.9 s → 0.14–0.35 s.
The window is up 5–40 ms after the press on a warm run, the card 0.1–0.3 s. "Ready in x s (was y s)" showed once per
game (the 2nd ▶ Play) in every run. A Lab scene's pictures decoded in 0.23–1.6 s off the page's thread (alongside the
first frame, not added to it); its files read in 20–110 ms.

## Upgrades
### ▶ Play, ready sooner
1. **A game played before skips the smooth check** when its last result still holds (same game files, Hearth's helpers,
   screen, look); a game whose helpers ever cost frames is still measured every time.
2. Lab scenes: no 0.6 s steady wait once as many layers draw as last time.
3. HTML builds: no 0.35 s quiet wait once everything it loaded last time is in.
4. One short warm-up pass when the last runs needed nothing more (back to the full loop as soon as one finds work).
5. Shaders compile side by side (parallel compile) while the textures upload, for Lab scenes and HTML builds.
6. A Lab scene's pictures and song are read from the page's first line; three.js is preloaded while the page starts.
7. Pictures still decoding count as loading (their uploads land under the card, not in a warm-up pass).
8. An HTML build's extra warm-up frames only when its warm-up made something.
9. What each game's getting ready learnt is kept on disk: the next launch of Hearth uses it too.
### What you see
10. **"Ready in x s (was y s)"** once per game, under where the card was, after the first frame of play.
11. **`/game ready`**: from ▶ Play to the first frame of play, each step's time (window, card, loading, shaders, warm-up,
    smooth check…, pictures decoded / transcoded alongside).

11 upgrades.

After the merge with shadowready / fixes56 (the A/B now draws a Lab scene for real and walks the shadow sizes, 20–50 s
here): readyspeed passed 4 runs; Lab cold → warm 37–61 s → 17–34 s (47–73 % less), HTML 8.6–12.4 s → 2.9–9.2 s (26–66 %
less, the shadow walk dominating). The check's threshold is judged without the smooth check's step.

## Tests
- `node dev/readyspeed-test.js` (UNIT, 9 groups): the one clock (Lab and HTML steps, missing marks left out, the steps
  adding up), the words, the "was" rule (and the page's copy of it), what a run teaches (said once, renderers, loads, one
  quiet pass after two clean runs, back after a dirty one), the A/B reuse (same key only, a fit only, never for a costly
  game), the threshold, the memory on disk (read back by a new launch, the key following files / helpers / refresh / look,
  an added file; an unreadable file never written over), the page tag's query.
- `flock /tmp/hearth-gameready.lock sh dev/run-checks.sh --exact readyspeed`: `dev/checks/readyspeed.js` (above), with its
  regression threshold: warm ≤ 0.85 × cold + 0.3 s for each kind; 0 / 0 in the first 5 s on every run; the line said
  once; `/game ready`; the files untouched. The group `readyspeed` adds gameready, gametex, playbudget, gamestream, lazy,
  unit:boot-test.

## Edits outside the new files
- `tools/gameready-page.js` (the marks, the hints, the reused verdict, the ready line, parallel compile + uploads in
  the HTML path, `first5.budgetOff`), `tools/gameready.js` (the clock, the note, `/game ready`'s text, the result kept
  fresh), `gamereadymain.js` (`pageTag(ctx)` with the hints, `gameready:speed`, `clickAt` in the arm).
- `gamemodemain.js`: `info.timing`; the page tag gets `{ root, file, source, hz, look, off }`; a Lab page's files read
  early, three.js `modulepreload`, its load times.
- `gamemode.js`: the press time to `GameReady.prepare`; `/game ready`.
- `tools/three-sandbox.html` (Lab player, small): decode / transcode times in `ready-count`, `rdyCompile` parallel with
  uploads, picture decodes count in `rdyAssets`.
- `preload.js` (`hub.gameReady.speed`), `lazy-data.js` (`tools/readyspeed-core.js` in the gameready group),
  `dev/run-checks.js` (UNIT, the group, HEARTH_THREE_DIR), `tools/game-api.md`.

## Risks
- **A reused verdict on a changed computer state**: the key covers the game's files, Hearth's scripts, the refresh, the
  look and the helpers off, not a new graphics driver or a much busier machine. The watch while playing still switches a
  costly helper off within seconds, and from then on that game is measured every time.
- **One short warm-up pass**: only after two runs whose first pass found nothing and whose first 5 s were clean; a pass
  that finds work restores the full loop. The first 5 s are still counted every run.
- **Times on this machine swing 2×** with the other checks running; the check judges warm against cold of the same run.
- The "was" time is the game's first ▶ Play after this update (not a slower one before it).
- **One unexplained cold run**: in one of the 11 Lab runs (a cold one, the A/B taking 24 s on a swamped machine) the first
  5 s of play compiled 56 shaders / linked 28 programs / uploaded 21 textures — the whole scene again, as after a lost
  GPU context. None of the warm-run skips were in play there (nothing was remembered yet); the page now records GPU
  context losses in `first5.gpuLost` so the next time says which it was. 0 / 0 in every other run, the gameready check's
  runs included.
- **Checks under load**: gamestream failed twice in a batch with other agents' checks running (once "the same picture",
  once the budget's watch switching loads during play off mid-run: frames at 1–2 s each); alone it passed, as does the
  base commit alone.

## For the patch notes
- **▶ Play gets a game ready much sooner the second time.** Hearth remembers what it learnt getting each game ready and
  skips what still holds: on the test game the second and third ▶ Play were 70–86 % quicker than the first.
- The smooth check (helpers on vs off) is skipped when its last result for that same game still holds; games where
  Hearth's helpers ever cost frames are still checked every time.
- Shaders compile side by side while the textures upload, and a Lab scene's files and three.js load from the first
  moment, so even the first ▶ Play has less waiting.
- Once per game, when it's clearly quicker, a quiet line says so as the game starts: "Ready in 7.5 s (was 25.4 s)".
- `/game ready` shows how long each step of getting ready took, from ▶ Play to the first frame.
- Still true every time: nothing left to compile or upload in the first seconds of play, and your files are only read.
