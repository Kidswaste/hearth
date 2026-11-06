# Round 135 · seekfix135: a seek right after play lands and holds

Round 134 found the bug (audiomap134's check had to seek again until the playhead held). In the Lab, a seek sent just
after pressing play was sometimes lost or late, and the song played from 0 or from where it was before. The owner hit
it on:
- a click on the timeline just after pressing play;
- a cue or ◉ Perform's number keys jumping right after starting;
- ✦ Map to the song, Perform or a render seeking right after play.

The rule now: **the last request wins.** A seek made while play is starting goes where it was sent and stays there.

## How it was reproduced
`dev/checks/seekfix135.js` presses play, then seeks 0, 10, 50 and 200 ms later, 20 times at each delay. It does this on
the fixture song and on a scene's own timeline (no song: the player's silent clock, the same element path in the
preview). Every 4th try loads the song (or the timeline) again first, then presses play and seeks as soon as the Lab has
the file. Each try reads three clocks at about 0.35 s and about 0.9 s after the seek:
- the preview's song element (`__labAV.state().time`);
- the sketch's `audio.time` (the audio clock that layers read);
- the Lab timeline's playhead (`player.time`).

Each value must lie between the target minus one frame (1/30 s, minus the speaker lead for `audio.time`) and the target
plus the time since the seek plus one frame.

A temporary log inside the preview page (commands received, element events, reports sent) and in the player (seeks
sent, answers) showed two separate causes.

## The causes
1. **The song's own "start here" step ran after the seek** (`tools/three-sandbox.html` `loadMedia`). A song that was
   just loaded (or a scene timeline just made) is still being read when play and the seek arrive. The element takes the
   seek, but its `loadedmetadata` handler then set `currentTime = startAt` from the load message (0, or where the load
   began) and started or kept playing according to the load's `playing`. That threw away the newer seek, and a newer
   pause too. Log: `cmd play` → `cmd seek 40` (readyState 0) → `loadedmetadata` → `seeking 0` → the song plays from 0.
   This is the "restarts from 0" the owner saw.
   - On the Lab side, `load()` sent the song with `attach({ playing: false })`. A play pressed while the file was being
     read (the Lab already has the bytes, the preview not yet) was therefore dropped.
2. **The seek after play waited behind the previous seek's answer** (`tools/three-media.js`, labscrub's one seek in
   flight). The Lab sends a seek only once the preview has answered the one before, which it does in a drawn frame. A
   paused preview with nothing to draw answers late, often only when play wakes it. The seek that follows play was
   therefore held for up to 1 s while the song played from the old spot. Log: `sendSeek 1` … `sendSeek 65` (held
   62 ms in) … the answer for 1 arrives 360 ms later … then 65 goes.
   - Linked to it: while a seek was in flight, a report the preview had sent before it (the song's `play` event, the
     4×/s tick) snapped the Lab's playhead back to the old spot. Anything that read the playhead in that moment (a cue,
     Perform's next bar, a render) started from the wrong time.

The other suspects were not involved:
- Play's promise resolving late: the sandbox never awaits it.
- The "start from the loop or 0" step in the play command: it only runs with a locked loop, or a trim, from outside it.
- The decOff worker: pictures only, not the song.
- The frame gate: it only made the answer in cause 2 late.
- Perform's and songmap's own seeks: they call the same `player.seek`.

## The fix
- `tools/three-sandbox.html`:
  - A new song element keeps `__want = { at, play }` until its length is known. A seek, play or pause that arrives
    meanwhile is recorded there, and the `loadedmetadata` step uses it instead of the load's `startAt` / `playing`. A
    Lab sequence that owns the song keeps its own rule.
  - A seek is always answered. With no song on the page, or while the sound output is being rebuilt (`AVD.busy`, where
    `sendState` reports nothing), the page sends `{ type: 'seek-ack' }`.
- `tools/three-media.js`:
  - `toggle()` (play / pause) clears the seek pacing (`seekQ.busy = 0`), so the seek that follows goes out at once.
    Messages keep their order, so the preview still applies them in order. The one-seek-at-a-time pacing still applies
    to scrubbing.
  - While a seek is in flight, a report without the answer keeps the seek's time on the playhead: `now()` while
    playing, the seek's spot paused. The answer itself carries where the seek landed.
  - The new `seek-ack` answer is handled.
  - `load()` clears `wish` when a new song starts and calls `attach()` without forcing pause, so a play pressed while
    the file is being read is sent with the song.
- `tools/three.js`: `seek-ack` is passed to the player (the message filter).

Beat sync (the audio clock's jumps, `avJump`), the frame gate and the answer in a drawn frame, the loop and trim edges
(beat108's timer) and the 240 Hz pacing are unchanged. Only the moment a seek is sent, and which start spot wins, changed.

## Before / after (seekfix135, 20 tries per delay, 120 readings per delay: 2 looks × 3 clocks)

| Clock | Before: 0 ms | Before: 10 ms | Before: 50 ms | Before: 200 ms | After: each delay |
| --- | --- | --- | --- | --- | --- |
| Song | 30 off (+ the first plain try held ≈ 0.4 s) | 30 off | 30 off | 6 off | 0 off |
| Scene timeline | 30 off | 30 off | 0 off | 0 off | 0 off |

Before, the misses were:
- every try right after a load, which played from 0 or 1 s, the seek lost;
- the first plain try after the song's analysis, where the seek was held until play woke the page.

After, every reading at every delay lands within one frame of the target and holds, on both clocks and on all three
readouts.

## Tests
- **New, one check:** `dev/checks/seekfix135.js`, group `seekfix135` (`node dev/run-checks.js seekfix135`: with
  audiomap134, beat108, songmap130, perform131, labload94 and unit:boot-test). It fails on the old code and passes now.
- `dev/checks/audiomap134.js`: the re-seek loop is gone. It now plays and seeks once.
- Run this round: seekfix135 ✓ · audiomap134 ✓ (without the workaround) · beat108 ✓ · songmap130 ✓ · perform131 ✓ ·
  labload94 ✓ · `node dev/boot-test.js` ✓ · `node dev/labaudio77-test.js` ✓.

## Follow-up: the one failed reading on a busy box
In one combined run (load ≈ 4.5), one reading in 240 failed: "timeline: play, then seek 10 ms later", try 7, a
fresh try (the scene's timeline loaded again first, no song). Run alone, the check passed.

**Reproduced.** CPU load alone (5 busy loops, load ≈ 11, plus another Electron check) did not do it: 0 in 240 fresh
tries. A test-only stall inside the preview did (a scratch copy of the check that reloads the timeline every try and
adds a listener in the page through `evalInSketch`: 250 ms of work on `media-load`, 30 ms on each `media` command,
frames up to 60 ms late). In 4 runs, 11 tries in 480 were off, every one the same: `audio.time` read 0 at the
350 ms look while the element (14.99, still unread: readyState 0, playing) and the Lab's playhead (15) were right.
A look right after the seek showed the same on a quiet box: `audio.time` 0 in 10 tries of 32 at 16 and 24 ms.

**A real race, not only load.** The page's state at the failed look (a temporary readout of the audio clock): a
"seek while playing" start with the old spot at −0.02 s, held for one output path (93 ms). Where it came from:
1. `loadClock` replaces the element. Play arrives while the new element is still unread, so the element counts as
   playing and its time is 0: the startAt of 1 s is applied only once its length is known.
2. A frame drawn before the seek arrives reads `audio.time`, and the audio clock starts fresh at 0.
3. The seek arrives. The element is "playing", so the clock takes it as a seek while playing: the speakers still
   play the old spot for one output path, so the pictures keep it. That spot was never heard (the element hadn't
   played a sample).

On a calm box the hold is over about 90 ms after the seek, long before the 350 ms look. Still, layers draw the
scene's start for that moment. On a busy box the preview handles the seek late, and the look landed inside the hold.
The song never does this because its fresh path unloads first. Play and seek then wait for the file, and the load
carries both. So this is a fix and not a load-aware step. Making that look load-aware would have hidden a wrong
frame the owner could see.

**The fix** (`tools/three-sandbox.html`):
- `songNow()`: a new element whose length isn't known yet (`m.__want` still set) counts as paused. It shows the spot
  it will start from, and the audio clock starts fresh there once it really plays (the existing `AV.held` restart).
  No sample is taken from it before then.
- `loadMedia()`: the new element starts with `currentTime = startAt`, the browser's start spot before its length is
  known. Before, it read 0 until then, including on a timeline length change while playing. The `loadedmetadata` step
  still decides where it goes, so the last request still wins.

The Lab side (`three-media.js`, `three.js`) and the avsync core are unchanged.

**The check.** `dev/checks/seekfix135.js` gets a step C: the timeline is loaded again before every try, then play,
then a seek 16 or 24 ms later, 12 tries at each delay, read at once and at 350 ms. `audio.time` may be the target,
or the spot the timeline really sounded from (the reload's 1 s, for one output path), but never its start. The
element and the playhead must be on the target. On the old page: 5 and 1 tries off. Now: 0.

Before / after on the stall copy (the timeline loaded again every try, 0 and 10 ms, 60 tries each): 11 off in 480
before, 0 in 240 after.

Run: `seekfix135` ✓ · `audiomap134` ✓ · `perform131` ✓ · `beat108` ✓ (`run-checks.js --exact`, under the run lock) ·
`node dev/boot-test.js` ✓ · `node dev/labaudio77-test.js` ✓.

## For the patch notes
- **Seeking right after you press play now works every time.** Before, if you clicked the timeline, pressed a number in
  Perform or jumped to a cue just after pressing play, the song could start from the beginning or from where it was, as
  if your click never happened. Now the song goes where you clicked and stays there. This also covers a song you just
  loaded and a scene's own timeline.
- Map to the song, Perform and renders that jump right after starting the song land on the right spot too.

## For Codex
No Codex-owned file was changed this round (none of astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-*, engine-watch.js). There is nothing to merge on your side.
