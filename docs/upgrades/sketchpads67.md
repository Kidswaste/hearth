# sketchpads67 — sketches become playable material (round 67)

Round 66 (bouncelog66) keeps a 30-second sketch of a Sound desk session in the **Sessions** list. This stream lets you
play that sketch on a Live set pad, or cut a loop out of it. Everything is reached by clicking, with visible labels, in
the place where the sketch already is. The sketch itself is never changed: a trimmed loop is a new file next to it.
Edits to other streams' and Codex's files are small, additive and marked `(round 67, sketchpads67)`.

## What shipped
### On every sketch in Sessions (Sound desk › Sessions)
1. **🎛 Put on a pad** appears next to ▶ · Show file · Remove sketch.
   - It opens a small picker under the sketch. Each Live set song is a row with its 10 pads: used pads are filled, and
     the next empty pad is a **＋ 4** button you click.
   - **＋ A new song** puts the sketch on pad 1 of a new song.
2. **The whole sketch plays as a one-shot pad.** Its tempo comes from the session, or is found in the audio. When a song
   has no clips yet, the sketch sets the song's tempo, the same way a park take does. In a song that already has a
   different tempo, it's fitted to that tempo with the pitch kept, as liveset64 does for takes.
3. **"✓ On pad 2 (key 2) of “Song 1”"** confirms where it went, with a **🎤 Open the Live set** button. The clip plays from
   where the file is; nothing is copied.
4. **✂ Trim loop** opens a small waveform with two handles labelled **Start** and **End**.
### ✂ Trim loop
5. **Handles snap to the session's tempo.** Start snaps to a beat and End snaps to a whole number of bars. The loop never
   runs past the end of the sketch. Bar lines are drawn on the waveform.
6. **Drag the loop itself** to move it, keeping its length.
7. **The keyboard works too.** ← / → on Start moves it one beat; on End, one bar.
8. **Length** menu: 1, 2, 4, 8 or 16 bars.
9. **Tempo (BPM) field.** It shows where the tempo came from:
   - "from the session": the Live set song, Arrange or the park take you played that session;
   - "as your last loop": a loop you already trimmed from this sketch;
   - "found in the audio", or "found in the audio (unsure: check it)";
   - "typed": what you type in the field. A value outside 40–240 is refused with a message.
10. **Tempo finding.** When the tempo isn't known, Hearth finds it in the sketch, along with where the beats and the
    bar's first beat fall. Found tempos land on whole BPM.
11. **▶ Preview loop** plays the loop over and over in the window, and it follows the handles while you drag.
    **■ Stop** ends it.
12. **💾 Save loop** writes a **new 48 kHz WAV next to the sketch**:
    - its name looks like `Sketch 2026-10-26 14.05.33 loop 4 bars 124 BPM.wav`;
    - it holds exactly that many bars, with 3 ms edges so it loops without a click;
    - the sketch stays byte-for-byte the same, and an existing file is never overwritten (" 2" is added instead).
### Trimmed loops
13. **Each loop gets its own line under its sketch**: "↳ Loop · 4 bars · 124 BPM · 7.7 s", with ▶ (it loops),
    **🎛 Put on a pad** (a loop pad, launched on the bar), Show file and **Remove loop**. Remove loop moves the loop and
    its card to the Trash.
14. **Trimmed loops show up in Arrange's Take picker and in the Live set's "Park takes" shelf**, as "Sketch loop · 4 bars ·
    124 BPM", next to your park takes. The weekend plan still counts only real park loops.
### Also (secondary)
15. `/sessions trim` opens the trim of the newest sketch, and `/sessions pad` its pad picker. The clicks above are the way in.

## How it works
- `tools/sketchpads-core.js` (UMD, no DOM, node-tested):
  - the grid math: `barSec`, `beatSec`, `snap`, `grid`, `plan` (start on a beat, whole bars, clamped to the sketch),
    `initial`, `frames` (exact frames, rounded once), `barsOf`, `parseBpm`;
  - the tempo finder `detect`: a log-energy onset envelope (512-sample hop), lightly smoothed, then autocorrelation
    from 70 to 180 BPM. The double period reinforces the score, the 1.5× period counts against it, and a gentle prior
    centred on 120 BPM breaks octave ties. It's refined between lags, and a value within 0.15 of a whole BPM is set to
    that BPM;
  - `phase`: where the beats and the bar's first beat fall at a tempo that's already known;
  - `peaks`, `cut` (3 ms edges), `loopName`.
- `tools/sketchpads.js` (`SketchPads`) and `tools/sketchpads.css`:
  - a lazy group `sketchpads`, loaded when the Sessions list first shows a sketch, never at boot;
  - the waveform is drawn on a canvas once per tempo, and the handles move two divs;
  - the preview is a Web Audio `AudioBufferSourceNode` with `loop` / `loopStart` / `loopEnd`, so there's no device to
    pick and the instrument host isn't used;
  - the decoded sketch is kept only while its trim is open. Closing Sessions or redrawing it closes the trim and stops
    the preview.
- `sketchpadsmain.js` (lazy IPC `sketchpads:save-loop | loops | trash-list`; preload `hub.sketchpads`):
  - `saveLoop` only accepts a sketch inside `<data>/creative-sketches` (bouncelogmain's `isOurs`), and only bytes that
    are a 16-bit 48 kHz WAV of at least 0.1 s with a 40–240 BPM tempo and whole bars;
  - the WAV and its card (`… BPM.json`, shaped like a park take: `v, loop, bpm, bars, beats, place: 'Sketch loop',
    sketch, at` + `kind: 'sketch-loop'`, `from`, `start`) are written whole (`.part`, then renamed) under a name that
    isn't taken;
  - cards are read through `datasafe-core` and never rewritten;
  - `loopTakes` lists every sketch loop for the pickers.
- The pad: `LiveSet.addFile(songIndex | 'new', { file, label, bpm, bars, beats, loop })` (new, in `tools/liveset.js`)
  uses liveset64's own `addPad` → `prepare` → `clip-load`.
- The session's tempo: `BounceLogCore.use` keeps `bpm` from the Live set song, Arrange or the last park take on each
  tick. The row (`entry`) and each new sketch carry it only when it's known, so the row's shape is otherwise unchanged.

## Touches outside my files
- `creative-vstmain.js` (Codex), 3 lines:
  - `liveClip` also accepts `<data>/creative-sketches`;
  - `parkList` appends `sketchpadsmain.loopTakes`, and lists them even when no park folder exists yet (it used to return
    early).
- `tools/liveset.js` (liveset64): `addFile`, exported.
- `tools/bouncelog.js` / `tools/bouncelog-core.js` (bouncelog66):
  - the tempo kept on the session and its sketches;
  - one line in `drawPanel` that loads the group and decorates the sketch lines;
  - `closePanel` / `drawPanel` close an open trim (only when the group is loaded, so no lazy miss);
  - `/sessions trim | pad`.
- `weekendplan.js`: skips `kind: 'sketch-loop'` takes, so "turn your park loops into a song" stays about park loops.
- `main.js` (one `lazyIpc` line), `preload.js` (`hub.sketchpads`), `index.html` (`sketchpads` added to an existing
  `lazy-at.js#…` tag), `lazy-data.js` (the group) + `lazy-meta.js` (regenerated), `dev/run-checks.js` (UNIT + the
  `sketchpads` group).

## Tests (no sound card, no real plugins, isolated profile)
- `node dev/sketchpads67-test.js` (`unit:sketchpads67-test`, in the `const UNIT` list, 66 checks):
  - **Bar math**:
    - a bar / beat in seconds, and the BPM field (40–240, a comma works too);
    - snapping and the grid (bar lines every 4 beats, beats before the first bar line);
    - `plan`: 2.1 s / 9.7 s give 2–10 s and 4 bars; the end dragged onto the start is still 1 bar; near the end, as
      many bars as fit; a start with no room moves back; it never runs past the end; a sketch shorter than a bar
      gives null; snapping uses the beat found;
    - `initial`;
    - exact frames: 4 bars at 120 BPM = 384,000; at 97 BPM, rounded once;
    - `barsOf`.
  - **Tempo**:
    - generated click tracks at 72, 85, 90, 97, 110, 120, 128, 140, 150, 160 and 174 BPM are each found exactly;
    - so are a track without accents and with louder noise (124), and an 8-second sketch (100);
    - silence and under 2 s give null;
    - the beat's phase is within 15 ms, and the accented beat is taken as the bar's first beat;
    - the phase is right at a known tempo.
  - **The cut**: the exact length, faded edges, the middle untouched, silence past the end, the WAV round trip, the
    file name (Windows paths too) and the info line.
  - **Main**:
    - a new file next to the sketch, the sketch byte-for-byte and mtime unchanged;
    - 16-bit, 48 kHz, stereo, 384,000 frames, its card, no `.part` left;
    - a second save gets " 2";
    - refused: outside the folder, a missing sketch, `..`, 44.1 kHz, not a WAV, BPM 300, 2.5 bars. A refusal writes
      nothing;
    - loops per sketch, `loopTakes`, and `parkList` with and without a park folder;
    - a card without its WAV isn't listed;
    - `liveClip` accepts a sketch or a loop and refuses a file outside;
    - the Trash list holds the loop and its card, never a sketch.
  - **Pads**: a loop at the song's tempo plays as is; a whole sketch at 128 BPM in a 120 BPM song becomes a one-shot
    on key 2, fitted.
- `dev/checks/sketchpads67.js` (`node dev/smoke.js --fake-vst --script dev/checks/sketchpads67.js`, 34 checks, all by
  clicking). It uses a generated 30 s / 48 kHz click track at 124 BPM and the fake instrument host:
  1. Nothing loads before Sessions; with a sketch, the group loads and the line shows ▶ · 🎛 Put on a pad · ✂ Trim loop.
  2. ✂ Trim loop finds 124 BPM "in the audio" and starts at the first bar line, with handles labelled Start / End:
     - End dragged to 8 bars + 0.3 s gives exactly 8 bars;
     - Start dragged 1.4 beats lands on the next beat;
     - ← on End gives 7 bars; dragging the loop moves it;
     - BPM 20 is refused in words; 128 typed re-grids the loop;
     - Length gives 4 bars.
  3. ▶ Preview loop: the loop points equal the handles, follow a drag, and ■ Stop works.
  4. 💾 Save loop: a new file next to the sketch, exactly 2 bars at 48 kHz, the sketch's SHA-256 unchanged, its card,
     its own line.
  5. Pads:
     - the loop's 🎛 Put on a pad picker shows "＋ 1", and the loop becomes a loop pad on pad 1 (the song takes
       124 BPM);
     - the sketch's picker shows pad 1 used and "＋ 2", and the sketch becomes a one-shot on pad 2.
  6. 🎤 Open the Live set: both pads are there, pad 1 plays in the host (the clip guard lets in creative-sketches).
  7. The loop is in `parkList`, on the Live set's shelf, and in Arrange's Take picker.
  8. Remove loop: the loop and its card go to the Trash, the sketch stays.
  9. `/sessions trim` opens the trim; closing Sessions closes it. Nothing is sent anywhere.
- Group: `node dev/run-checks.js sketchpads`.
- Results (app checks under `flock /tmp/hearth-run.lock`, at most 5 per hold, output in my scratch folder):
  - **pass**: sketchpads67, bouncelog66, lazy, unit:boot-test, weekendplan66, unit:sketchpads67-test,
    unit:bouncelog66-test, unit:liveset64-test, unit:loopsong63-test, unit:weekendplan-test.
  - **These fail on the base commit too, not because of this stream:**
    - `liveset64`: "the pad's knob filters it in the host: Filter off". It's bouncelog66's documented baseline failure.
      One run under load also hit an underrun timing failure.
    - `loopsong63`: "Open Creative Playground → Serum 2 / Vital first". It fails the same way on an extracted copy of
      ffa46a9.
    - `unit:datasafe-scan`: only `tools/quest-chat.js` / `visual-feedback.js` (Codex's). My `sketchpadsmain.js` was
      flagged at first; it now reads cards through `datasafe-core`, and the scan no longer lists it.
    - `unit:winmac-test`: only `cloud-files.js` and `sync-engine.js`, as in round 66.

## Risks / notes
- **The preview plays through the window**, which means the system output, not the instrument host / UA ASIO stream.
  It's meant for choosing the cut; the Live set pad plays through the host.
- **Tempo finding is made for beats.** On a beatless pad it may say "unsure" or find nothing. Then it uses 120 BPM and
  the field asks you to type the tempo.
- **The bar grid assumes 4/4** unless the sketch has `beats`. Sessions don't record a time signature yet.
- **A whole sketch on a pad is a one-shot**, so its length in bars is rounded: 30 s at 124 BPM is 16 bars.
- **Removing a sketch leaves its loops on disk.** They stay in Arrange / the Live set shelf, but no longer show in
  Sessions under a sketch.
- Arrange's take label shows "· 0 notes" for a sketch loop (the label is loopsong63's).

## For Codex
`creative-vstmain.js`, all marked `(round 67, sketchpads67)`:
- `liveClip`'s roots gained `'creative-sketches'`. The error text keeps "park sketches or the live set", which
  liveset64-test matches;
- `parkList` no longer returns early when `creative-park` is missing (`dirs = []`), and appends
  `require('./sketchpadsmain.js').loopTakes(dataDir, …)` inside a try before sorting.

No other Codex file was touched (`workbench-*`, `creative-vst-host.py`, `creative-vst-sketch.py` are unchanged).

## To test on the owner's PC
1. Update Hearth (⬆ Update) and restart it.
2. Creative Playground → Serum 2 / Vital → **Sessions**. Under a sketch, click **✂ Trim loop**.
3. Check the tempo it shows. Drag **End** to 4 bars and click **▶ Preview loop**: it should loop cleanly. Then click
   **💾 Save loop**.
4. On the new loop's line, click **🎛 Put on a pad** and then **＋ 1**, then **🎤 Open the Live set** and press pad 1.
   It should play from the UA on the bar.
5. Click **Arrange loops** and open the Take menu: "Sketch loop · 4 bars · … BPM" is there.

## For the patch notes
- **Your sketches are playable now.** Go to the Sound desk and click **Sessions**. Every 30-second sketch has two new
  buttons.
- **🎛 Put on a pad**: pick an empty pad in your Live set (the next free one shows as **＋**). The sketch goes there, ready
  for your open mic or park jam. Click **🎤 Open the Live set** to play it.
- **✂ Trim loop**: a small waveform with **Start** and **End** handles. They snap to bars at your session's tempo, or a
  tempo Hearth hears in the sketch. Type your own BPM if it's off.
  - **▶ Preview loop** plays the loop over and over while you adjust it.
  - **💾 Save loop** saves it as a new WAV next to the sketch. Your original sketch is never changed.
- Saved loops show under their sketch, with ▶, 🎛 Put on a pad and Remove loop (to the Trash). They also show up in
  **Arrange loops** and in the Live set's "Park takes" list.
