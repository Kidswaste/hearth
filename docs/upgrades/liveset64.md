# liveset64 — Live set for an open mic (round 64)

The owner has an "open mic" personal quest ("Go to an open mic", parisquests61). This builds the thing to bring there: a
performance view in Codex's Sound desk (Creative Playground → Serum 2 / Vital). It plays park takes (parkjam62), the
arranged song (loopsong63) and bank / Sound-bank presets (soundbank63) on big pads, with Serum 2 / Vital played live on
the controller over them. Everything is reachable by clicking, with labels you can see; keyboard pads and chat commands
come second (owner: "I really don't use commands at all"). Touches of Codex's files are small, additive and marked
`(round 64, liveset64)`.

## What shipped
### Getting there (all by clicking)
1. **🎤 Live set** button in the Sound desk's top row, next to 🌳 Park mode.
2. **"🎤 Rehearse your set"** on the open-mic quest's card in Sidequest Studio. One click opens the Live set.
3. Ctrl/⌘+K "Sound desk: live set for an open mic (pads, stage)". `/liveset` also works from any chat, but you never need it.
### Building the set (click ＋ or drag)
4. An empty song shows one big **✎ Build this song** button. **✎ Edit** opens the editor at any time.
5. **Park takes**, **your arranged song** and **your presets** are listed as chips. Click a chip's ＋ to add it, or
   **drag it onto "This song's pads"**.
6. **A park take becomes a loop pad.** The first take sets the song's tempo. A take at another tempo (−20 % to +25 %) is
   time-stretched with the pitch kept and cut to exactly its bars. A take further off plays at its own tempo, with a
   plain warning.
7. **The arranged song becomes a one-shot pad in its own song.** It is mixed down at −1 dBFS, at its own tempo.
8. **Presets become preset pads.** They come from the desk's bank and the Sound bank (its plugin-folder presets and ✦
   Preset window presets), for the instrument the set plays.
9. **Several songs in a set** (‹ › to move between them). Each song has a name, a tempo, beats per bar, and up to 10 clip
   pads and 10 preset pads. Each pad has **Loop / One-shot** and **Remove**. You can also set the set's name and
   "Launch clips on" (the next bar by default; or the next beat, or right away).
### Performing
10. **Big pads.** Clips are launched / stopped **on the next bar**, and presets **switch on the next beat**. The timing is
    done by the instrument host's audio thread, to the exact sample, so a busy Hearth window can't make a pad late.
11. **Presets switch with no gap.** The next preset is **preloaded** into a second copy of the synth, off the audio thread.
    It swaps in on the beat with a 5 ms crossfade, and notes you're holding carry over to the new sound. Going back to
    the previous preset is instant too. The view always keeps the next preset in set order loaded.
12. **One knob per pad**: a filter. Left is low-pass (down to 150 Hz), the middle is off and right is high-pass (up to
    6 kHz). The knob is labelled, and double-click resets it. On a preset pad the knob filters the synth while that
    preset plays.
13. **Play live on your controller over the loops.** The controller goes straight into the host (vstlive61).
14. **Tempo and a bar counter**: "Bar 12 · 3/4" plus a beat cursor, drawn from the host's own position minus the output
    latency, so it shows what the audience hears.
15. **■ Panic** (or Esc): every clip and the synth fade out over 300 ms, queued launches are dropped and notes are
    released. The beat keeps going, so the next press lands on the bar again.
16. **Status line**: instrument · LIVE · latency · underruns · which preset is preloaded (and how long it took) · REC time.
### Rehearse and perform
17. **● Rehearse** records the whole run: the synth and the clips, before the monitor volume. **★ Perform** records the
    show itself. Press the same button (■) to stop. Both are recorded in the host straight to a WAV, up to 45 minutes. A
    log goes with each run: every launch, preset switch, filter on/off and panic, with its bar.
18. Runs are saved in `<Hearth data>/creative-live/<set>/`, as an MP3 too when ffmpeg is installed. The last run shows
    under the pads with **Show file**.
19. **Offer as open-mic proof** sends the run to "Go to an open mic" through Codex's proof contract. That means the file
    is copied into references and the excerpt comes from the log. The coverage says plainly that Astra can't hear audio.
    **No XP and no review happen by themselves.** The quest gains a 4th step, **"Play your set"**. A rehearsal counts for
    "Decide your own next step" and "Play your set". A performance also counts for "Go and watch the whole thing". If the
    quest is at an earlier step, the run is kept and the panel tells you when to offer it.
20. Every run is announced as a `hearth:quest-week` event (`kind: 'live-set'`) for the week in review.
### Stage-safe
21. **⛶ Stage** (or `\`) lifts the view over the whole window and hides the rest of Hearth: it stops painting, and toasts
    and dialogs are hidden. It also hushes Hearth's background timers. Editing is hidden on stage.
22. **Nothing ever opens a dialog over the pads.** Messages go to the view's own status line. The ✦ Preset window steps
    aside while the Live set is open. Offering proof asks you to turn the stage off first.
23. **Every action works from the keyboard**:
    - 1–0 clip pads, Q–P preset pads, Enter (the whole song), Space (stop on the bar), Esc (panic);
    - ↑ ↓ songs, ← → select a pad, `,` `.` `/` the knob, `[` `]` tempo, `\` stage;
    - Ctrl/⌘+Enter Rehearse, Ctrl/⌘+Shift+Enter Perform.

    On stage the keys reach the set even if something else grabbed focus. All keys are listed in the keys sheet (Live set).
24. **Zero idle cost.** Nothing loads until the Sound desk does (creative lazy group). An open view that hasn't been
    played doesn't poll. Once you play, one status request every 250 ms runs while the view is open, and the beat cursor
    runs on the compositor. Closing the view stops everything, frees the host's second synth and the clips, and removes
    the key listener.

## Where the audio runs, and why (the choice asked for)
**In the instrument host, not in the window.** Clips are mixed into the synth's output inside the same Python audio
worker that renders Serum 2 / Vital (`creative-vst-liveset.py`, loaded by `creative-vst-host.py`).
- The bar / beat grid, launches, stops, preset swaps and the panic fade are decided in that worker at sample positions.
  The window only sends "pad pressed" over vstlive61's no-reply socket.
- A busy or frozen Hearth window can delay a press reaching the host by a few ms. It can't make the sound late or
  glitchy, and loops keep playing.
- One output device: the UA on ASIO carries the synth and the loops together, with no second audio client fighting the
  single-client ASIO driver. One clock: loops and the synth can't drift apart.
- The run recorder sees exactly what the audience hears.

The alternative, playing clips in the window's Web Audio graph (the way loopsong63's Arrange previews), would use the
system output and not the ASIO stream. It would run on a second clock and stall when the renderer is busy, so it was
rejected for the stage. Arrange keeps its Web Audio preview; the Live set doesn't use it.

The second synth (the "twin") costs the memory of one more instance of the open instrument, only while a set is open.

## How it works
- `creative-vst-liveset.py` (new, loaded like `creative-vst-offline.py`): `LiveSet` holds:
  - the transport (`bpm`, `beats`, `origin`; `boundary` / `where`; re-anchored on a tempo change);
  - clips (16/24/32-bit WAV, resampled once at load, ≤ 64 clips / 30 min);
  - `Knob` (Pedalboard `LowpassFilter` / `HighpassFilter`);
  - the twin, loaded on the host's main thread and warmed at the stream's rate / block;
  - `render()`, which carries a pending swap out at its sample with held notes carried;
  - `mix()` for clips, knobs, panic and the run queue;
  - the run writer thread (16-bit WAV `.part` → renamed);
  - `on_stop()` / `close()`.

  Actions: `set-open/close/status/tempo`, `clip-load/unload`, `launch`, `pad-fx`, `preset-preload/switch`,
  `set-panic`, `run-record/stop`. The streamed ones are `launch`, `pad-fx`, `preset-switch`, `set-panic` and
  `set-tempo`.
- `tools/liveset-core.js` (pure, Node-tested): the set model, keys, grid (identical to the host's), knob curve (identical,
  tested across both), `switchPlan` (preload timing), `nextPreset`, `fit`, `fits`, `PLAY_STEP`, `proofText`.
- `tools/liveset.js` (`LiveSet`) and `tools/liveset.css`: the view, editor, perform, stage and keys, plus `/liveset`. The
  set lives in the Sound desk's project (`state.liveset`, next to `state.park` / `state.song`).
- `tools/liveset-quest.js` (questjournal group): the open-mic card's button (showprep62's `addDetailHook`).
- Main (`creative-vstmain.js`): `LIVESET_ACTIONS`; `liveFields()` in `jobOf`.
  - A clip file must be a WAV under `<data>/creative-live` or `<data>/creative-park` (`liveClip`).
  - A run's path is made by main (`liveRunPath`), never taken from the window.
  - `liveSave` (atomic, plain names) and `liveMp3`, with IPC `creative-vst:live-save` / `creative-vst:live-mp3`.
  - Preload: `hub.liveset.{ save, mp3 }`.

## Tests (Linux, no sound card, no real plugins)
- `node dev/liveset64-test.js` (unit:liveset64-test, 63 checks).
  - Pure parts: the set model / limits / validate, keys and typing, the bar grid and tempo re-anchoring, the counter, the
    knob curve (same numbers in Python), preload timing (preloaded → next beat; 400 ms load → the first beat after
    430 ms; 1.2 s on the bar), the next-preset order, tempo fit, the 4th quest step (no drift) and which steps a run
    fits, the proof text against `QuestCore.checkProof`, and the main guards (paths, names, jobOf).
  - The **real host with the fake Pedalboard** (a heavy preset: 0.15 s state load):
    - a clip queued on a bar line, and in the recording it starts at that exact sample;
    - the knob halves the clip's level, with on/off in the log;
    - the preset preloaded in the twin (≈ 200 ms) and switched on a beat line at exactly that sample with **0
      underruns**, against **12 underruns** loading the same preset the desk's way;
    - a held note carrying over (×1.8 level, 0.5 → 0.9);
    - panic fading clip and note to silence;
    - the run WAV + log written whole;
    - `set-close` going idle.
- `dev/checks/liveset64.js` (`node dev/smoke.js --fake-vst --script dev/checks/liveset64.js`, 31 checks). It does
  **everything by clicking and keys**, in this order:
  1. 🎤 Live set in the top row;
  2. ✎ Build this song;
  3. a take added with ＋, another by **drag and drop** (stretched 110 → 120 BPM, exactly 96,000 samples);
  4. the arranged song as a one-shot pad in its own song;
  5. two presets as chips;
  6. ✓ Done;
  7. a pad click launches it, the bar counter runs, and **W** switches to "Loud" exactly on a beat line with no underrun;
  8. the knob filters in the host;
  9. ● Rehearse, **Esc** panic, ■ Stop rehearsal (the run + log kept, shown under the pads);
  10. ⛶ Stage (the whole window, the rest hidden, no editing, **the 1 key works with focus in another field**), then `\`
      back, and Space stops on the bar;
  11. **Offer as open-mic proof**, which lands on "Decide your own next step" with no XP;
  12. the quest card's **🎤 Rehearse your set** opens the Live set;
  13. ✕ closes it, with no polling left.
- All run under `flock /tmp/hearth-run.lock` (≤ 5 per hold), outputs in my scratch folder:
  - liveset64 ✓, loopsong63 ✓, parkjam62 ✓, vst-live ✓, soundbank63 ✓;
  - lazy ✓, unit:boot-test ✓ (first screen unchanged: all new code is in lazy groups), unit:vst-live-host-test ✓,
    unit:datasafe-scan ✓, unit:winmac-test ✓;
  - also unit:liveset64-test ✓, unit:parkjam62-test ✓, unit:quest-paris-test ✓, unit:loopsong63-test ✓,
    unit:winmac-scan ✓.
- `claude/intelligent-galileo-yaiqem` and `origin/main` had nothing newer than this branch's base (9c5eccd) when merged.

## Risks
- **The twin doubles the synth's memory while a set is open.** Serum 2 is heavy; that's the price of a gapless switch.
  Closing the set frees it.
- **Real Serum 2 / Vital: unknowns.** Their `raw_state` load times, and whether a second instance in the same process
  behaves, weren't available here. The fake proves the mechanism, not Serum 2's numbers.
- **Clips at another tempo.** A tempo change (`[` `]`, or the song's tempo) re-fits loop takes, but only while no loop
  plays. Moving to a song at another tempo while loops play defers the new tempo until they stop.
- **Restarting the stream restarts the bar count.** Changing the device / buffer during a set restarts the stream, so the
  bars count from 1 again. A run being recorded continues in the same file.
- **Clips in memory.** Clips are held as float32 in the host: 30 minutes of clips ≈ 690 MB. The cap is there; keep sets
  short.
- **The set's folder size.** Rehearsal WAVs are ≈ 11 MB a minute (cloud-synced like other data). The MP3 is what goes to
  the journal; without ffmpeg a run over 80 MB is offered as its log only.
- **Offering proof leaves the Live set.** It opens Sidequest Studio, which closes the Live set with the desk.

## For the patch notes
- **🎤 Live set — your open-mic set on big pads.** In the Sound desk (Creative Playground → Serum 2 / Vital) press
  **🎤 Live set**, or **🎤 Rehearse your set** on your "Go to an open mic" quest.
- **Build it by clicking or dragging**: park loops, the song you arranged, and your Serum 2 / Vital presets, song by song.
- **Loops start on the bar, presets switch on the beat, with no gap.** Hearth's audio engine does the timing, so it stays
  tight even if the window is busy. Play your controller live over the loops.
- **A filter knob on every pad, a bar counter, and ■ Panic** (Esc) that fades everything out.
- **● Rehearse / ★ Perform record the whole run**, so you can listen back. Offer one as proof for your open-mic quest in
  one click; the review and XP stay your choice.
- **⛶ Stage hides everything else.** Every pad has a key (1–0 loops, Q–P presets), so you can play without the mouse.
- Caveat: while a set is open the synth is loaded twice (that's how preset switches have no gap), so Serum 2 uses more
  memory.

## For Codex
Your files touched (all additive, marked `(round 64, liveset64)`):
- `creative-vst-host.py`:
  - loads `creative-vst-liveset.py` (new, mine) as `liveset`; `Engine.liveset = LiveSet(self)`;
  - in `produce()`, with a set open: `self.liveset.render(messages)` instead of the plain plugin call, and
    `self.liveset.mix(block)` after parkjam62's `capture()`;
  - `stop()` calls `self.liveset.on_stop()`;
  - `command()` routes `liveset.ACTIONS`;
  - `STREAMED += liveset.STREAMED`;
  - `serve()` runs `preset-preload` on the main thread (like `inspect` / `snapshot`), so the twin is loaded where
    Pedalboard wants it.

  With no set open, the only cost is one attribute check per block.
- `creative-vstmain.js`: `LIVESET_ACTIONS`, `STREAMED` + 5, `liveFields()` spread into `jobOf`; `request()` fills
  `file` (`liveClip`) / `output` (`liveRunPath`); the pool's no-adopt list; `liveSave`, `liveClip`, `liveRunPath`,
  `liveMp3`, `liveFolder` (exported); two IPC handles.
- `tools/quest-paris.js`: a 4th step, "Play your set", on the `openmic` personal quest (equal to `LiveSetCore.PLAY_STEP`;
  the unit test guards drift). `LiveSet.offer` appends it to a campaign started before it, with the same shape and the
  id `q-pq-openmic-4`.
- `tools/workbench-vst.js`: **not touched**. The button goes in through parkjam62's `ParkJam.attach`, and leaving the desk
  goes through `ParkJam.pause` → `LiveSet.pause`.
- `dev/fixtures/fake-vst-py/pedalboard.py`: `FAKE_PB_STATE_S` (a slow `raw_state` load) and one-pole `LowpassFilter` /
  `HighpassFilter`.
- Others:
  - `tools/parkjam.js`: the button and the pause;
  - `preload.js`: `hub.liveset`;
  - `lazy-data.js` / `lazy-meta.js`: the creative group + `liveset-quest.js` in the questjournal group; META
    regenerated;
  - `dev/run-checks.js`: UNIT + group `liveset`.
- The quest-card button uses your `QuestJournal.addDetailHook` (showprep62's contract).

## To test on the owner's PC
With the UA interface on ASIO, Vital (then Serum 2) and the Sound desk's live audio set up. You need two or three park
takes (Park jam → Record loop) and two or three bank presets (Keep a patch → Save bank preset).
1. Update Hearth (⬆ Update) and **restart it fully** (the plugin host's live set part is new).
2. Creative Playground → Serum 2 / Vital → open **Vital** → press **🎤 Live set**.
3. Press **✎ Build this song**. Click ＋ on a park take, drag another onto "This song's pads", then ＋ two presets. If you
   arranged a song in Arrange, ＋ it: it becomes its own song. Press **✓ Done**.
4. Click pad **1**: it starts on the next bar, and the bar counter runs. Press **2** while it plays: it joins on the bar.
5. Press **Q**, then **W**: the sound changes exactly on a beat with no dropout. Hold a chord on your controller across
   the switch: it should carry over. The status line says "<preset> preloaded (N ms)". Write down N for Serum 2 and Vital.
6. Turn a pad's knob left and right (or `,` `.`): low-pass / high-pass on that loop.
7. **● Rehearse**, play for a minute, press **Esc** (everything fades), then **■ Stop rehearsal**. The run shows under the
   pads; **Show file** opens the folder; listen to it.
8. **⛶ Stage**: Hearth disappears behind the pads. Play with the keys only. Click somewhere else and press a pad key:
   it still plays. `\` brings Hearth back.
9. Make Hearth busy (open the Lab with a heavy scene in another window, switch chats): loops and preset switches must
   stay perfectly in time.
10. Watch underruns in the status line while switching presets on Serum 2 (heavy). If it climbs, raise the buffer one
    step and tell us the numbers.
11. **Offer as open-mic proof**: Sidequest Studio opens on "Go to an open mic". If you haven't done the first two steps,
    it tells you the rehearsal is kept for later.
12. In Sidequest Studio, open the open-mic quest: **🎤 Rehearse your set** brings you back to the Live set.
