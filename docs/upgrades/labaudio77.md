# labaudio77 (round 77): sound in the Lab, solid and in sync

The owner's focus is Lab connectivity, framerate, projects, sync and optimization. This stream made the Lab's sound
solid and its pictures match it:
- the pictures now follow what you hear, frame by frame;
- a scene running backstage has its song (silently), so AI tools and time-driven layers behave there as on screen;
- the sound survives the output device changing mid-song.

It continues round 75 (labload75: THREE.Audio kept working after a switch), round 76 (labframe76: no borrowed songs)
and round 73 (labtools73, which noted "song scenes still have no music backstage").

Nothing is added to any prompt (0 tokens). The backstage note the AI already gets is reworded at about the same
length. There's no new button or setting: one row in the play button's right-click menu and a `sync` word on `/hear`.
Mac and Windows run the same code. First-screen code is unchanged: every file touched is in the lazy `lab` group or
is the preview page.

## What was measured first
In the app on this machine, a probe in the preview showed the following:
- **The song's time moves in steps.** The song element's `currentTime` moves in steps of one audio callback (10 ms
  idle, 20–25 ms when the machine is busy), and it stays the same for a whole task. The AudioContext's `currentTime`
  steps the same way.
- **The pictures ran early.** The element reports where the audio graph has *read* the song to. The speakers play
  that `baseLatency + outputLatency` later (10 + 30 ms here; 150–250 ms on Bluetooth headphones).
  `getOutputTimestamp()` says which context time reaches the speakers at which moment: here 42 ms behind the render
  clock.
- **The page read that raw time everywhere.** Every picture-side read used `mediaEl.currentTime` as it was: the beat
  pulse, `audio.time`, bar and beat phase, the whole-song features, keyframes, layer in/out, the loop helpers,
  filters, type animations and the frame clock of layers under ✦ Make it loop. So the pictures ran 27–40 ms ahead of
  the sound. They also moved in a stair-step: at 240 Hz, 2–3 frames showed the same moment, then it jumped 10–25 ms.
- **Lab sequences drifted.** A Lab sequence's clock ran on the wall clock and was put back on the song only when the
  two were more than 30 ms apart. With a sound card 0.02 % off, that meant a visible 30 ms jump every ~2.5 minutes.
- **Song scenes had no music backstage.** A scene running backstage got a silent clock as long as its last keyframe
  (≥ 10 s, looping), the demo 120 BPM beat, no analysis and the demo values for every audio feature. A beat-following
  preset used 120 BPM unless you had set a grid by hand.
- **A sound output that stopped stayed stopped.** If the system suspended the song's context or closed its output,
  nothing brought it back: the song went silent and its time stood still.

## Upgrades

### The pictures follow what you hear
1. **Every frame shows the moment you hear when that frame reaches the screen**, not the moment the audio engine is
   reading. The preview keeps one clock per song, fitted on the sound output's own timestamps (when each moment of
   the song reaches your speakers). Each frame reads it at its show time (its frame time plus one screen frame). Every
   picture-side read of the song's time goes through it (`songNow()` in `three-sandbox.html`).
2. **Smooth at any refresh rate.** The 10–25 ms stair-step is gone: at 240 Hz each frame moves by its own 4.2 ms.
3. **No drift on long songs.** The fit learns how fast your sound card's clock really runs (here +21 to +106 ppm).
   A 5-minute song stays on the sound to the end. A clock on the frame time alone would have drifted 6–32 ms here.
4. **Bluetooth headphones and slow outputs:** the pictures wait for them. The output's real delay comes from its own
   timestamps (the reported latency is used only when there are none).
5. **A seek or a loop wrap while playing:** the picture keeps showing the old spot for as long as your speakers still
   play it, then jumps exactly when the sound does.
6. **Play from pause:** the picture holds on the start until the sound arrives, never showing a moment before it.
   **Paused and scrubbing** stay exact (the playhead's spot, to the sample).
7. **Back from another tool or a hidden window,** the pictures are on the song from the first frames.
8. **A busy machine's audio hiccups** (the sound slipping 10–30 ms late) are caught within about three audio
   callbacks, instead of slowly drifting back over a second and a half.
9. **Footage and recordings keep the rendered time.** Video's own picture plays at the rendered time, so the pictures
   stay with it. A recording records the sound as rendered, so the recorded file stays in sync.
10. **Lab sequences follow the song as heard.** No more 30 ms jumps every few minutes; the wall clock only carries
    the sequence where there's no song.
11. **The timeline's playhead shows what's heard** (it is steered to the song time minus the output's delay).
12. **Play button › right-click › "♪ Pictures in sync with the sound"**: how many ms your speakers play behind the
    song's clock, and whether the sound output changed under the song. Clicking it gives the full readout.
13. **`/hear sync`** (chat): what the pictures follow, your speakers' delay, the sound card's drift, the output's rate
    and any recoveries, in plain words.

### Song scenes backstage
14. **A song scene running backstage now plays its song, silently.** It used to get the demo beat. Now the song plays
    in the hidden page at volume 0, on the song's real length, so `audio.time`, keyframes and layer in/out follow it.
15. **The same beats as on screen:** the song's analysis (tempo, beats, bar 1, sections, drops) and its beat map
    (your grid, markers, cues). One function builds that message for both: `ThreeMedia.songMap`. So `audio.beat`,
    `audio.bpm`, the bar / beat phase and the beat in the bar match on screen to the sample.
16. **The same audio features as on screen** (`audio.feat.kickOn`, `drop`, `intensity`…). They come from the same
    whole-song features and the same cache (`ThreeAudio.trackFor`), so a slider following the kick moves the same
    backstage.
17. **Presets that follow beats** (Pulse on beats, Shake on kicks…) applied by an AI backstage use the song's
    detected beats. They make exactly the keyframes the Lab on screen makes (138 / 138 in the check).
18. **The AI is told what's true backstage:** the timeline's grid ("auto-detected, the same as on screen"),
    three_media_info describes the song, and the backstage note says the scene runs on its song, silently.
19. **Each song is analysed once.** The analysis is kept by labload75's file key (path · size · modified time), so a
    song changed on disk is analysed again. When the Lab on screen analyses a song, it hands its analysis over, so a
    scene you just looked at needs no second analysis backstage. The 8 last songs are kept; samples are not.
20. **Backstage is silent, all of it.** Every AudioContext in a backstage page goes to a muted output (`?silent=1`):
    the song, a scene's own THREE.Audio, an oscillator. A sketch's own `<video>` / `<audio>` plays muted. The song's
    analyser and three.js' audio still run.

### When the sound output changes mid-song
21. **The system pausing the output** (another app taking it, a device going away for a moment): the song's sound
    is resumed within a quarter second.
22. **An output that closes, fails or stops moving:** the song's sound is rebuilt on the spot: a new audio context
    and a new element on the same file, ready where the old one is about to be. The old one stops exactly there and
    the new one starts, so the two never play together and there's no jump in the song.
23. **The output's sample rate changing** (44.1 ↔ 48 kHz when you switch to headphones or an audio interface): the
    song's sound is rebuilt at the new rate. That means no resampling and the shortest output path.
24. **Device changes the Lab window hears are passed to the preview** (and to a backstage page). The preview's frame
    may not hear them itself. three.js' own THREE.Audio context is resumed too if the system paused it.
25. A recording in progress keeps its sound: only a resume is tried, never a rebuild that would cut its track.

### Fix found on the way
26. **The whole-song features now wait for the song's analysis.** A sketch that read a feature the moment its song
    loaded used to get features made without the analysis' drops, kept under a length of 0. The drop pulse was then
    wrong for that song until the cache was cleared, and differed from a backstage scene on the same song (the check
    caught it).

### Checks
27. **`dev/labaudio77-test.js`** (unit) checks the song clock on a simulated audio pipeline shaped like Chromium's
    (10 ms callbacks with 0–2 ms timestamp jitter, an output path of 40 or 220 ms):
    - 16 five-minute songs at 60 / 120 / 144 / 240 Hz with sound cards −300…+300 ppm: worst 1.29 ms off what's heard
      (budget 4.17), never backwards;
    - seeks, a 50 ms loop wrap, a hidden tab, headphones switched mid-play (40 → 220 → 40 ms), underruns of
      12 / 30 / 20 ms, and the fallback without output timestamps;
    - the raw element time for comparison (+40.8 ms, 10 ms stair-step) and a frame-time clock (90 ms of drift over
      5 minutes at 300 ppm).
28. **`dev/checks/labaudio77.js`** (app, ~60 s) covers:
    - the sync offset budget and drift while playing;
    - a seek while playing (the new spot first shown when its sound arrives), pause, scrub and resume;
    - the Lab hidden for 3 s;
    - scene switch A → B → A;
    - simulated device changes: same rate, a new rate, suspended, closed (never two playing, no gap);
    - backstage parity: bpm / beat / bar / phases / kick / drop / intensity at 5 seconds, the preset's keyframes, the
      timeline, media info, silence, one analysis;
    - `/hear sync`.
29. **`dev/checks/labaudio77-long.js`** (opt-in `LABAUDIO77_LONG=1`, ≈ 6 min) plays a real 5-minute song. Every 30 s
    it logs 4 s of frames, judged against a line fitted offline through the audio clock's raw timestamps (they jitter
    by the audio callbacks). It checks there's no drift between the first and last three windows. Group `labaudio77`
    in `dev/run-checks.js`.

## Numbers (app check, under the run lock; SwiftShader under Xvfb, 4 shared CPUs, the preview at 33–39 fps)
| | Before (raw element time) | After |
|---|---:|---:|
| Pictures vs the audio clock while playing, median / p95 | +27–41 ms (always early) | 0.4–0.5 / 1.8–2.1 ms |
| After a seek while playing, from the 3rd frame, p95 | the new spot shown ~40 ms before its sound | 1.8 ms; new spot first shown 4–29 ms after its sound arrives (one preview frame) |
| Mean offset, first vs last third of 12 s of play | (stair-step ±12 ms) | −0.02 vs +0.43 ms |
| Back from another tool, p95 | | 1.8 ms |
| Output rate changed 44.1 → 48 kHz mid-play | (no handling) | rebuilt in 129–133 ms, never two playing (147 looks), song moved 2.51 s in 2.51 s |
| Output suspended by the system / closed | silent until reload | resumed / rebuilt in 12–18 ms, one element playing |
| Backstage vs on screen at 5 times | demo 120 BPM beat | identical (Δ 0 for every value) |
| "Pulse on beats" keyframes backstage | 120 BPM grid | 138 / 138 the same as on screen |
| Song analyses made backstage for a scene just seen | (none: no song) | 0 (handed over), 4 cache hits |
| 5-minute song, every 30 s, p95 vs the audio clock (smoothed) | | 0.41–0.93 ms in all 10 windows (an earlier run: 9 of 10, one window held an audio hiccup) |
| 5-minute song, drift start → end | (a frame-time clock: 25 ms with this card) | 0.09 ms |

One honest note: under the heaviest load in one run, a single audio hiccup put one frame 23 ms off before the clock
caught it, at p95 2.1 ms. The unit test shows the same thing on the simulated pipeline (back within 80 ms).

## Files
- `tools/three-sandbox.html`:
  - "the song's clock for the pictures": `<avsync-core>`, a pure core that runs in Node too;
  - "the song's clock, the page's side": `AV`, `avSample`, `songNow`, `avJump`;
  - every picture-side read of the song's time goes through `songNow`, and the sequence clock (`sqClock`) follows it;
  - `wireMedia()` is the song element's hooks, shared by a new song and a rebuilt one;
  - "the sound output changing under a playing song": `avWatch`, `avDevices`, `avRebuild`, `avHook`;
  - `window.__labAV` (state, the frame / sample log, simulated device events);
  - silent pages (`?silent=1`); the `lead` field on `media-state`; the `av-devices` message.
- `tools/three-backstage.js`: `SongPrep`, `syncSong`, `mapOf`, `audioWant` / `sendTrack`, `songReady`, `songInfo`;
  `timeOf` / timeline / media info from the song; the silent page parameter; `ThreeBackstage.songPrep` / `.song`.
- `tools/three-media.js`: `songMap` (exported, used by `sendMap`), the playhead steered by `lead`, the play menu's
  sync row, `av-event` kept, `player.av`, the analysis handed to `SongPrep`.
- `tools/three-audio.js`: `trackFor` / `trackMsg` (shared by on screen and backstage), features wait for the
  analysis, `devicechange` forwarded.
- `tools/three-audio-cmds.js`: `/hear sync`.
- `tools/three.js`: `av-event` routed to the player (one regex).
- `dev/labaudio77-test.js`, `dev/checks/labaudio77.js`, `dev/checks/labaudio77-long.js`, `dev/run-checks.js`
  (unit test, group).

Not touched: three-direction*, collab-eyes, credits*, Swarm (the creative-direction session's files), mcp/*.

## Left / risks
- **What the tests can't confirm.** The fit is checked against Chromium's own output timestamps and the reported
  latency (they agree within 2 ms here). On real Bluetooth headphones, whether the OS reports their full delay to
  Chromium is up to the driver. Where it doesn't, the pictures are early by the missing part, as before.
- **Device changes are simulated in the check.** The tests stand in for the device: they answer the rate probe and
  suspend or close the context. The rebuild itself is real. A real headphone or UA interface switch on the owner's
  Mac and Windows machines hasn't been tried.
- **Footage plays its picture at the rendered time**, as it always did. A scene that shows footage with its own
  sound through Bluetooth will still show it early by the headphones' delay. Delaying video frames is a larger change.
- **Backstage songs play the file in the hidden page.** That costs one decoder while a song scene works backstage. The
  page sleeps after a minute without calls, as before.

## For the patch notes
- **The visuals now line up with the music you hear, frame by frame.** Before, they ran a few hundredths of a second
  ahead of the sound, more with Bluetooth headphones, and stepped in small jumps at high refresh rates. Now each
  frame shows exactly the moment you're hearing, smooth at 240 Hz, from the first beat to the end of a long song.
- **Jumping around the song stays in sync:** when you click somewhere on the timeline or a loop starts over, the
  picture changes when the sound does, and pausing or scrubbing still shows the exact spot.
- **Your scenes keep their music when an AI works on them in the background.** If Claude or Astra edits a scene with
  a song while you look at another one, it now runs on that song, silently. Beat-following animations and anything
  that reacts to the music come out the same as if you were watching.
- **Switching headphones or your audio interface mid-song no longer kills the sound.** If the sound output changes,
  pauses or changes its sample rate (44.1 ↔ 48 kHz), the song keeps playing from the same spot, without playing
  twice.
- To see how far behind your speakers play, right-click the play button: "♪ Pictures in sync with the sound".
