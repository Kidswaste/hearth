# refab68 — 🎧 Reference A/B in the Sound desk (round 68)

Compare your sound with a track you love, at the same loudness. A labelled **🎧 Reference** button in the Sound desk's
top row (after Sessions) opens a panel over the desk, the way Sessions does. Everything is reached by clicking, with
visible labels. The reference file is only read: nothing is copied, changed or uploaded. Edits to other streams' and
Codex's files are small, additive and marked `(round 68, refab68)`.

## What shipped
### The button
1. **🎧 Reference** in the desk's top row (Creative Playground › Serum 2 / Vital), next to Sessions. Its tooltip says
   what it does.
2. **Drop a track on the button itself.** The panel opens with that track already loaded.
### The panel
3. **The empty state**: "Drop a reference track here", with "WAV · MP3 · FLAC · M4A" under it and a **Choose a file…**
   button. Dropping anywhere on the panel works too, and its border lights up while you drag over it.
4. **Use again: “Track.flac”**: the last reference you loaded from a file comes back in one click.
5. **A file that isn't audio is refused in words** ("“notes.txt” isn't an audio file…"). Nothing is loaded.
6. **The reference line**: "B · Reference · Track.flac · 3:42 · ≈ −7.9 LUFS", with **Change…** to pick another track.
### Your sound (A)
7. **Your sound** is one menu, with its loudness beside it:
   - **The desk: the last 30 s Vital played** (or Serum 2). This is what the instrument host just played, the instrument
     plus the Live set's clips, before the monitor volume. It's the same audio a 30-second sketch keeps.
   - every **session sketch** from Sessions;
   - every **trimmed loop** under its sketch ("↳ Loop · 4 bars · 124 BPM").
8. **↻ Measure again** takes the desk's last 30 seconds again. It only shows when the desk is picked.
9. **A quiet desk is said in words**: "Nothing played in the desk yet…" or "The desk was silent for the last 30
   seconds: play something, then measure again."
### Loudness
10. **Integrated loudness in LUFS** for both tracks, K-weighted and gated as ITU-R BS.1770 describes. It's shown as
    "≈ −14.3 LUFS" because the file is decoded and resampled to 48 kHz by the window first.
11. **The loop has its own loudness**: "Loop 1:02.4 – 1:17.4 (15.0 s) · ≈ −7.2 LUFS".
### The loop on the reference
12. **The reference's waveform with a loop region.** Hearth picks the loudest 15 seconds (usually the chorus or the
    drop) for you.
13. **Two handles labelled Start and End**:
    - drag them, or drag the loop itself to move it;
    - ← / → nudge a handle by 0.5 s (Shift: 5 s);
    - a loop is at least 1 second and stays inside the track.
14. **Whole track / Loudest part** switches between looping the whole track and its loudest part.
### A ⇄ B
15. **One big A ⇄ B button** says what you're hearing ("Hearing A · yours" / "Hearing B · the reference"). Clicking it
    starts playback if nothing is playing, and switches with a short fade (no click).
16. **▶ Play / ■ Stop** next to it. Yours loops whole and the reference loops its region; both keep running, so
    switching is instant.
17. **Level-matched, with the dB shown**: "Level-matched: the reference plays 6.4 dB quieter, so both sit at
    ≈ −14.3 LUFS." The louder one is always turned down, never boosted, so nothing clips. When yours is the louder one,
    it says so.
18. **The match follows the loop.** Moving a handle re-measures the loop, re-matches the two, and moves the playing loop.
### Tone balance
19. **Low / Mid / High, yours against the reference**, with the loudness set aside: each band's share of the energy is
    compared. One bar per band shows lighter (blue, to the left) or heavier (amber, to the right).
20. **In plain words**: "Your low end is 4 dB lighter than the reference.", "Your mids are about the same…", "Your top
    end is 2 dB brighter…". The biggest difference is said first.
### Where it plays
21. **The panel says how it plays.** Playback is the window's Web Audio; the instrument host isn't used.
    - When the window can pick the desk's output device (for example "Speakers (Universal Audio Volt 2)" for the desk's
      "Universal Audio Volt 2 (ASIO)"), it plays there and says so.
    - Otherwise it says it plays on the computer's default output, and that you should set your interface as the
      system output to hear both on the same interface.
22. **✕ closes the panel and frees the audio.** Leaving the desk does the same.
### Also (secondary)
23. `/reference`, `/reference ab | play | stop`, and Ctrl/⌘+K "Sound desk: compare with a reference track". The button
    is the way in.

## How it works
- `tools/refab-core.js` (UMD, no DOM, Node-tested; it also runs as a Worker):
  - `kWeights(rate)`: the K-weighting shelf + low cut, made for any sample rate with libebur128's formulas (the BS.1770
    table at 48 kHz);
  - `analyze`: one pass over the audio that keeps 100 ms steps of K-weighted power and of the low / mid / high band
    power (2nd-order Butterworth at 250 Hz and 4 kHz on the mono sum), plus waveform peaks;
  - `integrated(res, from, to)`: 400 ms blocks every 100 ms, the −70 LUFS absolute gate, the −10 LU relative gate, for
    any region from the kept steps, so a moved handle costs no second pass. Mono counts as both speakers (dual mono);
  - `loudest`, `region`, `match` / `matchText`, `tone` / `compare` (the words), `pickSink` (the desk's device among the
    window's outputs: shared distinctive words, never "default"), `clock`, `lufsText`.
- `tools/refab.js` (`RefAB`) + `tools/refab.css`:
  - a lazy group `refab`, loaded on the button's first click, never at boot;
  - one `AudioContext` at 48 kHz decodes and plays: `decodeAudioData` handles WAV / MP3 / FLAC / M4A;
  - the measuring runs in a Worker (`new Worker('tools/refab-core.js')`), so there's no long task in the window. A
    4-minute stereo track takes about 0.6 s of Worker time;
  - playback is two looping `AudioBufferSourceNode`s and two gains; A ⇄ B is a 12 ms `setTargetAtTime`;
  - the waveform is drawn once; a drag moves divs, at most one region update per frame, and the last position is
    applied on release;
  - text is compared before it's written; there's no per-frame work while playing;
  - ✕ or leaving the desk stops the sound, closes the `AudioContext`, ends the Worker and drops the decoded audio;
  - "Use again" keeps `{ path, name }` in localStorage (a convenience: if it's gone, the button doesn't show).
- The desk's last 30 s: a new host action `sketch-peek` (the bouncelog66 ring buffer, written exactly like a sketch) to
  a scratch path that main makes: `refabmain.js` `peekPath` → `<temp>/hearth-refab/<data-folder hash>/desk-now.wav`.
  It's never in the sketches folder, so it isn't a sketch, isn't in Sessions, isn't synced, and isn't counted as a
  save. A path sent by the window is ignored.
- Sessions' sketches are read from `music-sessions` (read only) and their loops from `hub.sketchpads.loops`.

## Touches outside my files
- `creative-vst-sketch.py` (Codex's `creative-vst*` family, bouncelog66's module), additive:
  - `'sketch-peek'` added to `ACTIONS`;
  - `save(job, peek=False)`: a peek has its own "silent" wording and doesn't add to the saved count;
  - `command()` routes `sketch-peek` to `save(job, peek=True)`.
- `creative-vstmain.js` (Codex), 2 lines: `'sketch-peek'` in `SKETCH_ACTIONS`, and `job.output =
  require('./refabmain.js').peekPath(dataDir)` for it.
- `tools/parkjam.js` (parkjam62):
  - one block in `attach` that makes the 🎧 Reference button (click or drop → `Lazy.load('refab')`);
  - `pause()` closes the panel when the group is loaded.
- `lazy-data.js` (the `refab` group) + `lazy-meta.js` (regenerated), `index.html` (`refab` added to the existing
  `lazy-at.js#…creative,sketchpads…` tag), `dev/run-checks.js` (UNIT + the `refab` group).
- **Not touched**: `tools/workbench-vst.js`, `tools/bouncelog*.js`, `tools/sketchpads*.js`, `tools/liveset.js`.

## For Codex
- `creative-vst-sketch.py`: a new action `sketch-peek` = `save(job, peek=True)`. It writes the same last-30 s WAV to
  `job['output']`, which main sets to a temp-folder path (`refabmain.peekPath`). A peek keeps `self.saved` as it is,
  and a silent ring raises `PEEK_SILENT` instead of the sketch wording. `sketch-save` behaves as before.
- `creative-vstmain.js`: `SKETCH_ACTIONS` gains `'sketch-peek'`; the request handler sets its `job.output` next to the
  `sketch-save` line.

## Tests (no sound card, no real plugins, isolated profile)
- `node dev/refab68-test.js` (`unit:refab68-test`, in the `const UNIT` list, 42 checks):
  - **K-weighting**: the BS.1770 coefficients at 48 kHz (to 1e-9); the curve's shape (+0.7 dB at 1 kHz, +4 dB at
    10 kHz, −1.1 dB at 100 Hz, below −10 dB at 20 Hz); the same curve at 44.1 and 96 kHz.
  - **Loudness**, with generated stereo 1 kHz sines from EBU Tech 3341, each within ±0.1 LU:
    - −23 dBFS → −23.0, and −33 → −33.0;
    - −36 / −23 / −36 → −23.0 (relative gate);
    - with −72 dBFS ends → −23.0 (absolute gate);
    - −26 / −20 / −26 → −23.0;
    - 44.1 kHz measures the same, and mono = dual mono.
  - **Edge cases**: silence, under 400 ms, or all below −70 give null. White noise 6.02 dB down reads 6.02 LU less.
    One stereo minute takes about 150 ms.
  - **Matching**:
    - the louder one is turned down, never boosted, and the words say who and by how much;
    - after the gain, generated noise vs a sine re-measure equal (±0.05 LU).
  - **The loop**: the loudest 15 s is found in a quiet / loud / quiet track; a region's loudness from the steps; the
    peaks; a short track loops whole; handles are clamped.
  - **Tone**: three tones with the low one 4 dB down read "Your low end is 3 dB lighter" (the balance once shares are
    compared). The words, the thresholds and "close to the reference" are checked.
  - **pickSink**: "Universal Audio Volt 2 (ASIO)" picks "Speakers (Universal Audio Volt 2)", never "default"; only
    generic words pick nothing.
  - **Main**: the scratch path is in the temp folder, one per data folder, never in creative-sketches.
  - **The real host** (fake Pedalboard / sounddevice):
    - a silent `sketch-peek` is refused with the measuring wording;
    - after a note, the WAV lands at main's path (a window path is ignored), written whole;
    - there's no sketches folder and the saved count stays at 0;
    - it measures as finite LUFS, and measuring again overwrites the same file.
- `dev/checks/refab68.js` (`node dev/smoke.js --fake-vst --script dev/checks/refab68.js`, 25 checks, by clicking). It
  uses a generated 30 s / 48 kHz sketch with a light low end and a generated 40 s / 44.1 kHz reference (louder from 15
  to 30 s, a heavier low end):
  1. Nothing loads before the click. The labelled button is in the top row next to Sessions.
  2. The panel shows its empty state and the Your sound menu (the desk first, then the sketch).
  3. A silent desk is said in words. A note, then ↻ Measure again, gives the desk's LUFS.
  4. A dropped text file is refused. The dropped reference measures within 0.2 LU of the generated file's own LUFS,
     and the loop is its loudest 15 s (15.0–30.0 s), with Start / End handles.
  5. The sketch picked as yours: "the reference plays 9.4 dB quieter, so both sit at ≈ −17.7 LUFS".
  6. A ⇄ B:
     - it plays, B's gain = −9.4 dB and A is silent;
     - A is at 0 dB and B is silent;
     - the reference loops its region and yours loops whole.
  7. End dragged to 38 s: the loop, its loudness, the match and the playing loop follow. Whole track / Loudest part.
  8. Tone balance: Low / Mid / High rows, "Your low end is 7 dB lighter than the reference." first.
  9. The output line says Web Audio and "not through the instrument host".
  10. ✕ closes the AudioContext and drops everything. "Use again" loads by path. A track dropped on the button opens
      the panel with it. `/reference ab` works. Nothing is sent anywhere.
- Group: `node dev/run-checks.js refab`.
- Results (app checks under `flock /tmp/hearth-run.lock`, output in my scratch folder):
  - **pass**: refab68, bouncelog66, sketchpads67, lazy, unit:boot-test, unit:refab68-test, unit:bouncelog66-test,
    unit:sketchpads67-test, unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan;
  - the first screen is unchanged: everything is in the lazy `refab` group. `node dev/lazy-manifest.js` was
    regenerated (`/reference`).

## Risks / notes
- **Playback isn't through the instrument host.** The host plays the instrument and the Live set's prepared clips; it
  doesn't play arbitrary files with a level-matched A/B. The panel says so plainly.
  - With the desk on the UA interface in **ASIO**, the window's audio goes to the system output. On Windows, set the
    UA's WDM device as the default output to hear both on the same interface.
  - On a Mac, Core Audio shares the device, and the window usually finds it by name.
- **"The desk" is a snapshot** of the last 30 s, not a live meter. ↻ Measure again takes a new one, and A plays that
  snapshot.
- **LUFS is labelled ≈.** BS.1770 is followed exactly on the decoded samples, but the browser's decoder and
  resampler come first. On the generated test files it's within 0.2 LU after 44.1 → 48 kHz.
- **Tone balance compares shares** (balance), not absolute levels. A low end that is 4 dB down can read "3 dB
  lighter", because the whole mix gets quieter too.
- **Memory**: a decoded 4-minute stereo reference is about 90 MB while the panel is open. Closing the panel frees it.

## To test on the owner's PC
1. Update Hearth (⬆ Update) and **restart it fully**: the instrument host has a new action.
2. Creative Playground → Serum 2 / Vital → open Vital, play a phrase.
3. Click **🎧 Reference**, then drop a reference track (WAV, MP3, FLAC or M4A) on the panel.
4. "Your sound" shows the desk's last 30 s. Press **A ⇄ B** and listen: both should sound equally loud.
5. Read the tone balance lines. Drag the loop's **Start / End** onto the drop, and check the dB that's shown.
6. Check the line under the tone balance to see which output it plays on.

## For the patch notes
- **🎧 Reference** is a new button in the Sound desk's top row (Creative Playground › Serum 2 / Vital, next to
  Sessions). Drop a track you love on it (WAV, MP3, FLAC or M4A), or click it and choose a file.
- **A ⇄ B** is one big button that switches between your sound and the reference. Both play at the same loudness, and
  the panel says by how many dB the louder one was turned down.
- **Your sound** can be what the desk just played (its last 30 seconds), any sketch from Sessions, or a loop you
  trimmed from one. **↻ Measure again** takes a fresh 30 seconds of the desk.
- **Loudness in LUFS** for both, side by side: the whole reference, and the part that loops.
- **The loop starts on the reference's loudest 15 seconds.** Drag **Start** and **End** on its waveform to pick
  another part, or click **Whole track**.
- **Tone balance in plain words**: low, mid and high, yours against the reference, for example "Your low end is 4 dB
  lighter than the reference."
- **Where it plays**: through the window, on your interface when the window can pick it. The panel says which. The
  reference file is only read, and nothing is uploaded.
