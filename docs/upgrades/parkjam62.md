# parkjam62 — Park jam: make music at the park on the laptop (round 62)

The owner's "make music at the park" quest, made real: on a bench in Belleville or the Buttes-Chaumont, on battery,
probably without the Universal Audio interface (laptop speakers, headphones, maybe a small MIDI keyboard). Built inside
Codex's Sound desk (Creative Playground → Serum 2 / Vital) and Codex's quest journal; every touch of a Codex file is
small, additive and marked `(round 62, parkjam62)`. Works fully offline: nothing here needs an AI.

## What shipped
### Park mode (one tap)
1. **🌳 Park mode** button in the Sound desk's top row (next to Check audio runtime / Plugin folder / Reset host). One
   tap does everything below; tap again (**Park mode on**) to put it all back.
2. **The laptop's own output** when the UA interface isn't connected: the built-in speakers or headphone jack on
   **WASAPI shared** (never exclusive, so other apps keep their sound), never a Bluetooth "Hands-Free" profile; if the
   default output is headphones (wired, or AirPods / Bluetooth), those are kept so nothing plays out loud in the park,
   with a plain note that Bluetooth is late for live keys. With the UA connected, Park mode keeps it on ASIO.
3. **A safe buffer**: 512 samples on the shared laptop output, 256 on ASIO, 1024 on the slow legacy drivers.
4. **One instrument loaded**: the other instrument's host process is stopped (battery and memory); the one open stays
   (or the one used at that park last time, else Vital, the lighter of the two).
5. **Lower polyphony and oversampling** where the plugin exposes them (polyphony ≤ 8 voices, oversampling to its lowest
   choice, an HQ switch off). Unison voices, macros, LFOs and envelopes are never touched. Said in one line when the
   plugin shows no such control. Put back by Park mode off.
6. **The screen dims** (a static dark overlay that never takes a click) and **Hearth's background timers are hushed**
   (the same `Power.hush` ▶ Play uses), both undone on Park mode off or when leaving the desk.
7. **Remembered per place**: the output (by name), buffer, instrument, loop length, tempo and ambience switch are kept per
   park (Belleville, Buttes-Chaumont, Luxembourg, La Villette, or any place you type). The place comes from the park
   sketch ("Park sketch · Belleville · 18 Oct", made by `/quest park belleville`) or from `/jam park <place>`.
8. **Home stays home**: Park mode never overwrites the desk's own remembered output; back home the UA on ASIO is chosen as
   before.
### Capture the moment
9. **Park jam · capture the moment**: one fold under the instrument (with Shape the sound, Keep a patch…): Loop length
   (4 / 8 / 16 bars), Tempo, Starts (on my first note / right away), Layer park ambience, **Record loop**.
10. **The loop is recorded inside the instrument host**, in its audio thread: exactly N bars of the instrument's own
    output (before the monitor volume), sample-accurate, with **every note played** (on-screen keys, computer keys, the
    MIDI controller, phrases) and its exact time. Hearth's window being busy can't make the loop late.
11. **"Starts on my first note"** (the default): nothing is kept until you play, then the loop begins at that note.
12. **Ambience · 10 s**: a field recording from the laptop mic (unprocessed: no echo cancelling or noise gate), saved in
    the sketch and **layered under each loop** at −14 dB, looped with a crossfaded seam and faded at the loop's ends so
    the result still loops.
13. **Saved in the park sketch's own folder** (`<Hearth data>/creative-park/Park sketch · Belleville · 18 Oct/`): the dry
    loop WAV, the layered WAV, the ambience WAV, a **MIDI file** of what you played (tempo + time signature) and a
    small JSON with the notes. The last takes show under the fold with a player and **Show file**.
### Proof and the week
14. **Offer as park-quest proof** (on each take, or the toast right after recording): the loop (layered when there is
    ambience) goes to the park quest ("Make music at the park") through Codex's own proof contract
    (`QuestCore.checkProof` + `QuestCore.submit`): file copied into Hearth's references, its levels measured like the
    journal's own audio proof, the notes and an intent line written for you, the quest opened on that step. **No XP and
    no review happen by themselves**: "Review saved proof" stays your choice (XP after the review, as always). The
    same loop can't be submitted twice.
15. **The week in review** (weekquest62, `/quest review`) shows the offered loop among the week's moments (it reads the
    journal's submissions). Every take is also announced as a `hearth:quest-week` event.
### From chat
16. `/jam park [place]` (Park mode on, e.g. `/jam park belleville`), `/jam park record [4|8|16] [96 bpm] [now] [dry]`,
    `/jam park ambience [seconds]`, `/jam park proof`, `/jam park week` (this week's park loops), `/jam park status`,
    `/jam park off`. Suggestions while typing `/jam park`.
17. Ctrl/⌘+K: **Sound desk: Park mode (music outside, on battery)**.

## How it works
- `tools/parkjam-core.js` (pure, Node-testable): `parkOutput(devices)`, `safeBuffer(api)`, `batterySaver(parameters)`,
  `loopSeconds`, `loopArgs`, `encodeWav` / `decodeWav`, `layer(loop, ambience)`, `analyse`, `midiFile`, `placeOf`,
  `placeName`, `placeKey`, `isoWeek`, `takeNames`, `proofText`.
- `tools/parkjam.js`: `ParkJam` (`attach`, `section`, `pause`, `on`, `off`, `record`, `recordAmbience`, `offer`, `week`,
  `run`, `complete`). Per-place memory and takes live in the workbench project, `state.vst.park = { places, takes }`
  (Codex's `validate` keeps extra fields of `vst`). The ambience is recorded with `getUserMedia` + `MediaRecorder` in
  the window (the app already has the mic permission; macOS asks Hearth, not Python).
- Host (`creative-vst-host.py`): `record {bars, beats, bpm, wait}`, `record-status`, `record-take`, `record-cancel`.
  The worker calls `capture(block, messages)` after each rendered block: one list append, no allocation beyond the
  block itself; notes open / close from the same messages the plugin gets. A stop or device change mid-take drops it
  with a reason. Up to 90 s; 1, 2, 4, 8 or 16 bars of 2–7 beats at 50–220 BPM.
- Main (`creative-vstmain.js`): the four actions in the allowlist (+ `bars`, `beats`, `bpm`, `wait` in `jobOf`);
  `record-take` writes the WAV in the host's session folder and returns its bytes (no base64, no 20 MB socket limit),
  then deletes it; `solo` stops the other instruments' hosts; IPC `creative-vst:park-save` (`hub.vst.parkSave(sketch,
  name, bytes)`) writes only plain `.wav / .mid / .json` names under `<data>/creative-park/<sketch>/`.

## Tests (this machine: Linux, no sound card, no mic, no real plugins)
- `node dev/parkjam62-test.js` (unit:parkjam62-test, 55 checks): the output pick (no UA → WASAPI shared speakers, never
  hands-free, Mac headphone jack, AirPods default kept, UA kept), buffers, battery controls, WAV round trip, ambience
  layering (level, resampling, looping, faded ends), the MIDI file, places / ISO weeks / file names, the proof text
  against `QuestCore.checkProof`, `parkSave` (folder, name rules, traversal), and the **real host's loop recorder** with
  vstlive61's fake host (`dev/fixtures/fake-vst-py`, `FAKE_SD_NO_UA`): solo, battery patch on the live instrument, a
  1-bar loop exactly 96,000 frames, a phrase's 1/8 notes exactly 12,000 samples apart, "starts on the first note" at
  time 0, cancel, a stop dropping a take, refusals.
- `dev/checks/parkjam62.js` (`node dev/smoke.js --fake-vst --fake-vst-no-ua --script dev/checks/parkjam62.js`, 45
  checks, offline): home output MME / 128 → one tap → built-in speakers WASAPI shared / 512, polyphony 16 → 8 and
  oversampling 2x → 1x on the running instrument, dimmed, timers hushed, remembered for Belleville (the desk's own
  memory untouched); 1.5 s of stubbed mic ambience; a 4-bar loop at 200 BPM played on the keys (exactly 4.8 s, 2 notes,
  ambience heard where nothing was played, MIDI + notes files in the park sketch's folder); offered as proof to the park
  quest (no review / XP by itself, no double submit), shown in the week in review; `/jam park week / status / off`
  restoring everything; `/jam park belleville` reusing the memory.
- Also passed after merging claude/intelligent-galileo-yaiqem (weekquest62) and origin/main (0b67d54): vst-live,
  presethover61, workbench-vst (its real-plugin part skipped: no runtime here), quest-paris, lazy, unit:boot-test
  (first screen unchanged: everything is in the `creative` lazy group), unit:vst-live-host-test.
- Noticed, not ours: `node dev/lazy-manifest.js`'s "recording the old order" run logs `ReferenceError: WeekQuestCore is
  not defined` from weekquest.js (weekquest62's file loads before questhud's weekquest-core.js in the old order). The
  manifest was still written and `lazy` passes.

## Risks
- Real Serum 2 / Vital parameter names for polyphony / oversampling weren't available here: matched by words
  ("polyphony", "voices", "oversampling", "quality", "HQ") on controls with real ranges; a plugin that names them
  otherwise is left alone (and Park mode says so).
- Built-in device names are matched by common words (Speakers, Realtek, Intel SST, Conexant, MacBook, Built-in,
  External Headphones…); an unusual laptop codec falls back to the system default output.
- The mic hears the laptop speakers: the fold says to wear headphones or record the ambience first.
- Takes are WAVs in the data folder, which cloud sync carries by default (16 bars at 120 BPM ≈ 6 MB per WAV).
- `PowerWise`'s hush pauses Hearth's background timers while Park mode is on in the desk (as ▶ Play does).

## For the patch notes
- **🌳 Park mode for making music outside.** In the Sound desk (Creative Playground → Serum 2 / Vital), one tap sets the
  laptop up for the park: its own speakers or headphones when the UA interface isn't plugged in, a buffer that won't
  crackle, only one synth loaded, fewer voices and less oversampling, a dimmer screen. It remembers each park.
- **Capture the moment**: record a 4, 8 or 16-bar loop of what you play, starting on your first note. Your notes are
  kept too (a MIDI file next to the audio).
- **Bring the park home**: record 10 seconds of the park from the laptop mic and it's layered softly under your loops.
- Everything lands in your park sketch's folder ("Park sketch · Belleville · 18 Oct").
- **Offer a loop as proof** for your "Make music at the park" quest in one click; it also shows up in your week in review.
- From chat: `/jam park belleville`, `/jam park record 8`, `/jam park ambience`, `/jam park proof`, `/jam park off`.
- Works offline; no AI needed. Wear headphones for the ambience (the mic hears the speakers).

## For Codex
Files of yours touched (all additive, marked `(round 62, parkjam62)`):
- `creative-vst-host.py`: `Engine.take` + `record()`, `capture()` (called by `produce()` after each block, before the
  monitor gain), `close_note()`, `take_status()`, `record_take()` (16-bit WAV via `wave`); `stop()` drops an unfinished
  take with a reason; four actions in `command()`. Nothing else changes; your tests pass as before.
- `creative-vstmain.js`: `PARK_ACTIONS` in the allowlist, `bars / beats / bpm / wait` in `jobOf`, `record-take` reads the
  WAV the host wrote in its session folder and returns `wav` bytes, pool action `solo`, `parkSave()` + IPC
  `creative-vst:park-save` (exported for tests).
- `tools/workbench-vst.js`: `ParkJam.attach(out, setup, h)` after the top row, `detail.append(ParkJam.section(h))` after
  "Export a sample", `ParkJam.pause()` in `pause()`; `WorkbenchVST.api` gains (same version 1, additive)
  `instruments()`, `open(name, { live })`, `devices()`, `output()`, `setOutput({ value, buffer, remember })`
  (`remember: false` = this session only).
- `dev/fixtures/fake-vst-py`: `pedalboard.py` gains `polyphony` (1–32, 16) and `oversampling` (1x/2x/4x, 2x);
  `sounddevice.py` honours `FAKE_SD_NO_UA` (the laptop alone + a Bluetooth hands-free headset). `dev/smoke.js
  --fake-vst-no-ua` sets it.
- Quest side: nothing of yours edited; `ParkJam.offer` uses `QuestParisUI.journal()`, `QuestJournal.paris.mutate / ui()`,
  `QuestParis.startPersonal('park')`, `QuestCore.next / checkProof / submit` and `hub.importRef`, like the proof form.
- Others: `jam.js` (`/jam park …` handed to `ParkJam.run`, two suggestion rows), `preload.js` (`vst.parkSave`),
  `lazy-data.js` (creative group + META regenerated), `dev/run-checks.js` (UNIT + group `parkjam`).

## To test on the owner's laptop
On the laptop you take outside (Windows or Mac), with Serum 2 / Vital and the Sound desk's live audio set up.
1. Update Hearth (⬆ Update) and restart it fully.
2. Unplug the UA interface. In chat: `/quest park belleville` (starts the park quest and names the sketch), then
   Creative Playground → **Serum 2 / Vital** → **🌳 Park mode**. The line under the controls should read
   `LIVE · Speakers (…) · WASAPI shared · 48 kHz · 512 samples` (Mac: your speakers / headphones); the screen dims.
   The status line says what was lowered (e.g. "Polyphony 16 → 8") or that the synth shows no such control.
3. Plug in wired headphones and tap Park mode off / on: the headphones should be chosen (on Windows they're often a
   separate "Headphones (Realtek…)" entry). With AirPods connected as the default, they should be kept, with the
   latency note.
4. Play a few notes (keys or a small MIDI keyboard): it should feel playable; if it crackles, choose Buffer 1024.
5. Open **Park jam · capture the moment**, press **Ambience · 10 s** with the sound paused (the mic permission prompt may
   appear once), then **Record loop** (4 bars, starts on your first note) and play. The take appears with a player.
6. **Show file**: the folder `creative-park/Park sketch · Belleville · …` holds the loop, the layered loop, the ambience,
   a .mid and a .json. Open the .mid in a DAW: the notes match what you played.
7. **Offer as park-quest proof**: Sidequest Studio opens on the park quest's step with the loop saved as proof (no XP
   yet). `/quest review` lists it among this week's moments.
8. Tap **Park mode on** to turn it off: output, buffer and the plugin's voices / oversampling come back; plug the UA back
   in and reopen the desk: it's on ASIO as before.
9. `/jam park belleville` next time: the same output and buffer are chosen without asking.
