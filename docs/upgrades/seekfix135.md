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

## For the patch notes
- **Seeking right after you press play now works every time.** Before, if you clicked the timeline, pressed a number in
  Perform or jumped to a cue just after pressing play, the song could start from the beginning or from where it was, as
  if your click never happened. Now the song goes where you clicked and stays there. This also covers a song you just
  loaded and a scene's own timeline.
- Map to the song, Perform and renders that jump right after starting the song land on the right spot too.

## For Codex
No Codex-owned file was changed this round (none of astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-*, engine-watch.js). There is nothing to merge on your side.
