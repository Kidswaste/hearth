# vstlive61 — Serum 2 / Vital live: play them through the UA interface (ASIO) in real time (round 61)

The owner asked: "Help the Serum 2 / Vital integration with VST inclusion, make them run smoothly and have live creation
of audio work properly using ASIO (use Universal Audio drivers)."

This builds on Codex's Sound desk (Creative Playground → Serum 2 / Vital). Codex's design is kept: plugins run only in
a separate Python + Pedalboard process, never in Electron; only Serum 2 and Vital load; the runtime installs only when
the owner presses its button. Every change to a Codex file is additive and marked `(round 61, vstlive61)`.

## The truth about ASIO (checked against the actual wheels, 2026-10-18)

| Path | Windows device types | MIDI input | Verdict |
|---|---|---|---|
| **Pedalboard 0.9.26** `pedalboard.io.AudioStream` (JUCE) | WASAPI shared, WASAPI "Low Latency", WASAPI exclusive, DirectSound. **No ASIO**: pedalboard's `setup.py` never defines `JUCE_ASIO=1`, so JUCE's default `JUCE_ASIO 0` applies; the win_amd64 `.pyd` holds only the stub symbol `createAudioIODeviceType_ASIO` and none of JUCE's ASIO driver code. | None in Python (`AudioStream` has no MIDI; JUCE's `MidiInput` is compiled in but not exposed) | Not used. It also streams *audio through* a plugin chain, not MIDI into an instrument. |
| **sounddevice 0.5.6** (PortAudio, already in Codex's runtime) | Its Windows wheel ships **two** PortAudio DLLs: `libportaudio64bit.dll` (MME, DirectSound, WDM-KS, WASAPI) and **`libportaudio64bit-asio.dll` (the same + ASIO)**, picked when `SD_ENABLE_ASIO` is set before import (since sounddevice 0.5.1, 2024-10-12; verified in the downloaded wheel: both DLLs present, the ASIO one contains the ASIO host API). WASAPI exclusive via `WasapiSettings(exclusive=True)`. | — | **Used. True ASIO with no build step.** |
| python-rtmidi 1.5.8 | — | Yes, but wheels only for Python ≤ 3.12 (Hearth allows 3.10–3.14, installs `--only-binary`) | Optional: used off Windows when present, not installed by setup. |
| WinMM (`winmm.dll`, ctypes) | — | Yes, every Windows MIDI input, no package | **Used on Windows** for the controller. |

So: **ASIO is real**, through the PortAudio DLL that sounddevice already bundles. Hearth's host process is started with
`SD_ENABLE_ASIO=1`; the UA driver ("Universal Audio Thunderbolt" / "… Apollo …" / Volt) then appears as an ASIO
device and is opened directly. If that DLL is missing or fails to load, the host falls back to the plain DLL (WASAPI)
by itself; if an ASIO driver crashes the host while devices are listed, Hearth lists them again without ASIO and says
so under the picker. `HEARTH_VST_ASIO=0` (environment) turns ASIO off entirely. Nothing had to be faked or built.
No JUCE/PortAudio helper build was needed; if one is ever wanted (e.g. a newer PortAudio), it slots in by replacing
the DLL sounddevice loads (`_sounddevice_data/portaudio-binaries`), no Hearth code change.

ASIO notes for the UA interface: the **sample rate and the driver's buffer size are set in UA's own app** (UA Console /
UA Connect → Settings → Hardware: Sample Rate, Buffer Size). Hearth opens ASIO at the device's current rate (no rate
switch) and asks PortAudio for the buffer chosen in Hearth; if the driver uses another size, PortAudio adapts and the
readout shows the real output latency — set the same size in both places for the lowest latency. Outputs 1–2 are used
(Apollo: Monitor L/R; Volt: main outs). ASIO drivers are usually single-client: close a DAW that holds the UA ASIO
driver, or pick the WASAPI entry instead.

## What live mode does

1. **One host process per open instrument** (`creative-vstmain.js` `pool()`): Serum 2 and Vital each get their own
   long-lived host, loaded once and kept for the session; switching back is instant (≈ 60 ms with the fake plugin).
   The runtime check the desk makes on opening starts the first host, and the first instrument opened adopts it (no
   second Python start). Only one instrument streams to the device at a time (starting one pauses the other's stream,
   not its process).
2. **Opening an instrument goes live in one press**: `open` loads it and starts the audio stream in the same step; the
   keys play while the instrument's controls are still being read (Serum 2 exposes ≈ 2,600). After a restart the desk
   loads the last instrument straight away (no stream until a key is pressed). A key pressed while paused starts the
   stream by itself.
3. **Device picker, ASIO first**: ASIO devices (★ Universal Audio first), then WASAPI exclusive ("low latency, other apps
   paused") and WASAPI shared (UA first), then the rest, then System output. Preselected: UA on ASIO › UA on WASAPI
   exclusive › the Windows default. The choice is remembered **by name** (device ids change between sessions).
   ASIO / exclusive streams run at the device's own rate; shared prefers 48 kHz (each rate is checked with
   `check_output_settings` first; a refusal says which rates were tried).
4. **Buffer 64 / 128 / 256 / 512 / 1024**; changing it (or the device) while live restarts the stream at once.
5. **Low-latency render-ahead**: the host renders ≈ 5 ms ahead of the device (64 samples → 4 blocks, 128 → 2,
   256/512 → 1) instead of Codex's fixed 2 blocks + 1; if underruns appear it renders one more block ahead (up to 8).
6. **Your MIDI controller plays the plugin inside the host** (WinMM on Windows, python-rtmidi elsewhere): no hop
   through Hearth's window, so a busy Hearth never delays a note. "MIDI in": All controllers (default) / one / Off;
   notes, CC (mod wheel), pitch bend, pressure, program change pass; clock / sysex dropped. Ports are released on Pause.
7. **On-screen keys + a phrase sequencer**: keys and knob moves travel on one persistent no-reply socket
   (`hub.vst.send`); "Phrase" (Chord stab, Arpeggio, Bass pulse, Held pad) loops in the host's audio thread,
   **sample-accurate** (the test checks 12,000 samples between 1/8 notes at 48 kHz).
8. **Knobs stream live**: each move reaches the running instrument at once (≤ 1 message / 25 ms), no re-render; one undo
   step per gesture. Reading the full patch / recalling a preset **keeps the audio playing** (the plugin lock is held
   per control, not for the whole read). Only an offline WAV bounce still pauses and resumes the stream on the same
   device.
9. **Native editor never blocks audio**: it owns the host's main thread, the stream runs on the worker + PortAudio
   threads; notes keep coming; when the editor closes the desk reads back the knobs turned in it.
10. **Readout**: device · driver (ASIO / WASAPI exclusive / shared) · rate · buffer · ≈ output latency · DSP load % ·
    underruns · MIDI in (+ events). One plain hint when needed (DSP > 85 %: bigger buffer; underruns at ≤ 128; a slow
    driver).
11. **Clean stop**: Stop fades one block out (no click), releases held notes and the controller, then closes the device.
    Gain changes ramp per block (no zipper noise). A stale-note guard releases Hearth's own held keys one by one if
    the window stops talking for 5 s (it used to send All Notes Off, which also cut the controller's notes).
12. **Connections**: every connection gets its own host thread, so a note never waits behind a snapshot or a bounce.

Chat: the AI's `chat_do op sound` (`chat_sound`) gains `status` (live device, latency, DSP load) and `play {note | phrase}`
(only while the owner has live audio on). Help text updated; nothing added to any prompt.

## API for other features (presethover61's chat hover sits on this)

`await Lazy.load('creative')`, then `WorkbenchVST.api` (version 1). It works on the instrument the owner opened in the
Sound desk; it never picks / loads another plugin or opens the native editor. Methods that touch controls throw
"…still reading its controls…" until `current().ready`.

| Call | Does |
|---|---|
| `current()` | `{ name, path, ready, controls, live, canEdit, stats }` or `null` |
| `parameters({ query?, offset?, limit? ≤ 200 })` | `{ count, parameters: [{ key, label, value, display, min, max, step, choices }] }` (copies) |
| `get(keys)` | `{ key: value }` from the desk's cache (instant) |
| `await values(keys)` | fresh from the plugin (includes native-editor moves): `{ key: { value, display } }`, updates the cache |
| `await set(values, { source })` | validated (all-or-nothing, `WorkbenchCore.patch` + the host again), applied to the live instrument, one undo step; emits `params` |
| `await undo()` | restores the previous values / patch |
| `presets()` / `await savePreset(label?)` / `await loadPreset(label \| index \| { state })` | the desk's bank (12 slots, 9 MB), recall stays live; emits `preset` |
| `await exportPatch()` | `{ v: 1, name, state }` (Codex's portable patch JSON) |
| `await play(note, { velocity, length })` / `await phrase('stab' \| 'arp' \| 'bass' \| 'pad' \| null)` | audition through the live stream (starts it if paused) |
| `await start()` / `await stop()` / `status()` | live stream control, last readout |
| `allowAI(bool)` / `aiAllowed()` | the same per-instrument "Allow AI patch edits" switch the chat tool honours; emits `consent` |
| `on(type, fn) → off()` | events: `instrument` (opened / controls ready), `params` `{ changed: [keys] \| null, source: 'desk' \| 'editor' \| 'preset' \| 'undo' \| <yours> }`, `preset`, `stats` (≈ 1/s), `phrase`, `consent` |

Rule for AI-written values: a feature applying values an AI wrote should go through `set(values, { source: 'ai-…' })`
only after the owner's own action in that feature (the hover's send / apply), and may mirror `aiAllowed()`.

## Files (Codex's files touched: all additive, marked `(round 61, vstlive61)`)

- `creative-vst-host.py` (Codex): MidiInputs (WinMM / rtmidi), device listing with host APIs, ASIO / exclusive /
  rate choice, adaptive render-ahead, gain ramp + fade-out stop, sequencer, `open` / `values` / `sequence` /
  `midi-in`, thread per connection + `stream` connection, live control reads, editor close count, richer stats.
- `creative-vst-offline.py` (Codex): `import_sounddevice()` (ASIO DLL with fallback), `parameter_entry()` (the old loop
  body), `run(…, guard)` (lock per native call). Output unchanged.
- `creative-vstmain.js` (Codex): `pool()` (host per instrument), `SD_ENABLE_ASIO` + the listing fallback, `send()` over
  a persistent socket, `jobOf()` field whitelist, new actions, `creative-vst:send` (ipcMain.on).
- `tools/workbench-vst.css` (Codex): one compact row for output / buffer / volume / MIDI in / phrase (appended rules).
- `tools/workbench-vst.js` (Codex): open-and-go-live, picker / buffer / MIDI in / Phrase, streamed keys and knobs,
  editor read-back, readout, `api`, `savePreset` / `loadPreset` (the bank buttons use them), chat `status` / `play`.
- `dev/vst-live-test.js` (Codex's opt-in real test): prefers the UA's ASIO entry, prints the device list summary.
- New: `tools/workbench-vst-live.js` (picker order, readout, phrases, event hub; in the `creative` lazy group),
  `dev/fixtures/fake-vst-py/` (fake pedalboard / sounddevice / rtmidi), `dev/vst-live-host-test.js` (unit),
  `dev/checks/vst-live.js` (app check), `smoke.js --fake-vst`, `preload.js` `vst.send`, `lazy-data.js`,
  `dev/run-checks.js` (UNIT + group `vstlive`).

## Tested (here: Linux, no sound card, no real plugins)

After merging origin/main (round 60), under `flock /tmp/hearth-run.lock`:
- `vst-live` ✓ (27 steps, fake host): open → LIVE in 82 ms, an on-screen key heard in 45 ms (incl. status polling);
  with the window blocked 1.5 s the host kept rendering (560 blocks, 1 underrun on this loaded 4-CPU machine).
  It caught one real bug on its first run (the first open went live on the system default before the device list
  was read; fixed: the first open picks the UA device first).
- `workbench-vst` ✓ with its real-plugin part **skipped** (no Pedalboard / Vital here), `workbenches` ✓, `creative` ✓, `lazy` ✓.
- `unit:vst-live-host-test` ✓ (real host + fakes: ASIO listed, UA preselected, sample-accurate phrase = 12,000 samples
  per 1/8 at 48 kHz, editor open while 20+ blocks render, 0 underruns reading 2,000 controls),
  `unit:vst-host-test` ✓ (Codex's, unchanged), `unit:winmac-test` ✓, `unit:boot-test` ✓.
Nothing real is claimed from the fakes: ASIO with the UA driver, WinMM controller input, Serum 2 / Vital timings need
the owner's PC (steps below).

## Risks

- ASIO enumeration loads every installed ASIO driver in the host process; a broken one can crash it — handled by
  listing again without ASIO, but that host session then has no ASIO until Reset host / restart.
- WinMM MIDI code is written to the documented API but could not run here (Linux). On Windows versions without the
  new multi-client MIDI service, a port another program holds is skipped (named in the stats' `midi.failed`), and the
  Lab's Web MIDI (if on) may hold the controller.
- WASAPI exclusive pauses other apps' sound on that output while live (said in the picker label).
- Reading controls / recalling a preset while live holds the plugin lock per control; a plugin whose state call is
  slow could still cost a block once. Real numbers for Serum 2 must come from the owner's PC.
- Two instruments loaded at once use the memory of both (Serum 2 is heavy); the pool keeps at most 3 hosts.

## For the patch notes
- **Serum 2 and Vital play live through your Universal Audio interface, on ASIO.** Open one in the Sound desk and it's
  ready to play right away — on-screen keys, your computer keyboard, or your MIDI controller.
- **Your controller plays the synth directly**, without going through Hearth's window, so nothing Hearth is doing can
  make notes late or crackly.
- **Pick the output and buffer that suit you**: ASIO is listed first with your UA interface already chosen; buffer from
  64 (tightest) to 1024 (safest). Hearth remembers your choice.
- **Turn knobs while you play**: every move is heard immediately, and the native editor's changes come back into the
  desk when you close it. Opening the editor never stops the sound.
- **See how it's running**: latency, CPU load of the synth and any dropouts, in one line under the controls.
- **Phrases**: loop a chord stab, an arpeggio, a bass pulse or a held pad while you shape the sound.
- **Switching between Serum 2 and Vital is instant** once both are open.
- Caveat: the sample rate and the UA driver's own buffer are set in UA Console / UA Connect; close a DAW that is using
  the UA ASIO driver first.

## For Codex
- Your design stands (separate process, allowlist, explicit setup, opt-in AI edits). The persistent host became a pool of
  hosts (one per instrument) in `creative-vstmain.js`; `create()` is unchanged apart from `flags`, `send()`, `knows()`
  and `alive`, so your `dev/vst-host-test.js` passes as is.
- ASIO needs nothing new in the runtime: sounddevice 0.5.6's Windows wheel carries `libportaudio64bit-asio.dll`; the host
  is spawned with `SD_ENABLE_ASIO=1`. Pedalboard's own AudioStream has no ASIO (JUCE_ASIO is off in its build).
- `offline.run()` gained an optional `guard` (a lock per native call); `parameter_entry()` is your old loop body.
- New host actions: `open {live?, device, exclusive, buffer, gain, midiIn}`, `values {keys}`, `sequence {sequence, loop}`,
  `midi-in {midiIn}`; `live-start` takes `exclusive` and `midiIn`, buffers 64–1024, and restarts only when the device /
  mode / buffer changed. `inspect` / `snapshot` no longer stop the stream; `render` still does (and resumes with the same
  device, mode and controller).
- `WorkbenchVST.api` is the instrument API for other features (table above). Please keep its names stable or bump
  `version`.
- Tests: `node dev/vst-live-host-test.js` (no hardware: the real host + `dev/fixtures/fake-vst-py`),
  `node dev/smoke.js --fake-vst --script dev/checks/vst-live.js`; `sh dev/run-checks.sh vstlive`.

## To test on the owner's PC
With the UA interface connected and powered, Serum 2 and Vital installed (VST3, in `C:\Program Files\Common Files\VST3`).
1. In UA Console / UA Connect → Settings → Hardware: set **Sample Rate 48 kHz** and **Buffer Size 128** (or 64). Close any
   DAW that is using the UA ASIO driver.
2. Update Hearth (⬆ Update) and restart it fully (the plugin host part runs in the main process).
3. Creative Playground → **Serum 2 / Vital**. First time only: press **Set up live audio** (≈ 1–3 min; installs Pedalboard,
   numpy and sounddevice in Hearth's own folder). If it was installed before, nothing to do — ASIO uses the same files.
4. Press **Vital**. Within about a second the line under the controls should read
   `LIVE · Universal Audio Thunderbolt · ASIO · 48 kHz · 512 samples · …` (the name is your interface's ASIO driver).
   **Audio output** should show `★ … · ASIO` selected. If no ASIO entry is listed, the note under the picker says why;
   the `★ … · WASAPI exclusive` entry is the fallback.
5. Set **Buffer** to 128 (then 64). Play the on-screen keys and the A–; keys: notes should feel immediate. Watch
   `≈ N ms out`, `DSP %` and `underruns` (underruns should stay at 0; if they climb, go up one buffer size).
6. Play your **MIDI controller**: the line shows `MIDI in: <your controller> (events)`. Mod wheel and pitch bend should
   work in Vital. If the controller isn't listed, close other apps using it (a DAW, the Lab's MIDI) and choose it again.
7. Turn controls under **Shape the sound** while holding a note: the change is heard immediately.
8. **Open native editor**, turn a knob in Vital's window, keep playing (sound must continue), close the window: the
   desk's control shows the new value.
9. Choose **Phrase → Arpeggio**: it loops in time; then make Hearth busy (open the Lab with a heavy scene, switch chats):
   the arpeggio must stay perfectly steady. **Phrase → off**.
10. Press **Serum 2**: Vital's sound stops and Serum 2 goes live (first load can take a few seconds while it reads
    2,600 controls; the keys play meanwhile). Press **Vital** again: instant.
11. **Keep a patch → Save bank preset**, change something, **Recall**: the sound comes back without stopping.
12. **Pause audio**: the sound fades out cleanly; the UA driver is released (a DAW can use it again).
13. Optional muted real-plugin test (developer): `set HEARTH_VST_PYTHON=%USERPROFILE%\Hearth\data\creative-vst\runtime\Scripts\python.exe`
    then `node dev\vst-live-test.js` — it prints the device list (`asio: true` expected) and runs both instruments muted.
