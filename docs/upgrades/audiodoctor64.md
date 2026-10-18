# audiodoctor64: Check my audio setup (round 64)

You haven't tried rounds 61–63 on your own PC yet: live Serum 2 / Vital on the UA interface, the ✦ Preset window, Park
jam, the Sound bank, songs. This adds one card that checks the music setup on your PC and fixes what it can, so you
can verify it all without reading docs. **It sits where you already look:** the Sound desk has a visible
**🎚 Check my audio setup** button, and if live audio fails to start, the card opens there by itself. It only runs when
you ask (or after such a failure). Nothing runs at startup.

## What shipped

**Where to find it** (buttons first, chat commands second)
1. **🎚 Check my audio setup**: a button in the Sound desk's top row (Creative Playground → Serum 2 / Vital), next to
   Plugin folder / Reset host. It shows even before live audio is set up.
2. **🎚 Check setup**: a button right after the live controls (Audio output · Buffer · Monitor volume · MIDI in · Phrase).
3. **Opens by itself when live audio fails to start** (Start live audio, or opening an instrument live). It then runs a
   quick check (no plugin loads, no test tone) and gives the reason in plain words. If the instrument's audio process
   had stopped, it says so and adds **Reset host** under the card.
4. **/doctor's card** gains a **Check my audio setup** button. Ctrl/⌘+K: "Check my audio setup (Serum 2 / Vital, ASIO, UA)".
5. Chat, secondary: `/audio doctor` (everything), `/audio quick` (no plugin loads, no sound), `/audio live`,
   `/audio loopback`, `/audio copy`. In a chat it's the same card as a note.

**The card**: one row per check, each marked ✓ / ! / ✗, with one plain sentence and at most one fix button
6. **Audio runtime**: is the private runtime there? Which Python, is it 64-bit and in 3.10–3.14? If it's missing, the
   row also says whether Python on your PC is good enough for the setup. Fix: **Install runtime** (with a progress row).
7. **Packages**: Pedalboard / sounddevice / numpy versions, compared with what Hearth installs (0.9.26 / 0.5.6 / 2.5.4).
   Fix: **Reinstall / Update runtime**.
8. **ASIO**: did the ASIO-enabled PortAudio DLL load (SD_ENABLE_ASIO)? It tells apart: loaded · didn't load (old
   sounddevice, or a blocked DLL) · an ASIO driver crashed the check (it checks again without ASIO) · turned off. Fixes:
   **Reinstall runtime**, **Turn off ASIO**, **Turn ASIO back on**. On a Mac it says ASIO isn't needed there.
9. **ASIO devices** (UA first): your Universal Audio driver and its rate. If the Sound desk plays through something else
   while the UA is connected, the fix is **Pick the UA device**: it sets the desk's own Audio output picker to the UA on
   ASIO and remembers that, like your own choice. If there's no UA, it asks whether the interface is on, and offers
   **Re-scan**.
10. **WASAPI**: how many outputs, the Windows default, the UA's WASAPI endpoint.
11. **MIDI in**: the controllers the host sees (or "close the DAW holding it", with **Re-scan**).
12. **Serum 2** and 13. **Vital**: found by the desk's own VST3 scan, then each one **loaded in a host of its own** (a
    crash can't take the other down): name, maker, number of controls, load time, plus a half-second test note.
    Fixes: **Open plugin folder** if it's not found, **Reset host** if it doesn't load.
14. **Live test (2 s)**: a quiet chord through Vital (or a built-in sine if Vital doesn't load), played on the device the
    Sound desk uses, at its buffer. It reports underruns, the output latency PortAudio reports, how regular the
    callbacks were (average and longest gap) and Vital's DSP load. Live audio in the desk pauses for it. Fixes:
    **Test at <next buffer>** after dropouts, **Run again**, **Reset host** if the device wouldn't open.
15. **Loopback test** (under the card): patch output 1 into input 1 (a cable, or UA Console's loopback), and it plays a
    click and times the round trip ("Heard the click back after 10 ms round trip, 480 samples at 48 kHz").
16. **Preset folders**: the Sound bank's Serum 2 / Vital user preset folders, with a preset count each. Fixes:
    **Open preset folder** or **Open Sound bank**.
17. **ffmpeg**: found, or **Install ffmpeg** (the song's MP3 export needs it).
18. **Copy report**: a short plain-text version (dated, one line per row, the home folder shortened to ~) to paste to us.
19. **Check again** re-runs everything. **×** closes the card in the desk.
20. **Reset host and the ASIO switch reload the open instrument by themselves**: no "open it again" detour.

## Files
- New: `creative-vst-doctor.py` (the checks in a disposable process: probe / plugin / live with loopback; reuses
  `creative-vst-offline.import_sounddevice` and `creative-vst-host.MidiInputs` / `Engine.choose`), `audiodoctormain.js`
  (main side, lazyIpc: `audiodoctor:probe|live|open`), `audiodoctor-core.js` (rows + report, pure),
  `audiodoctor.js` + `audiodoctor.css` (the card: in the desk and as a chat note; lazy group `audiodoctor`),
  `tools/audiodoctor-desk.js` (the desk buttons + the failure hook; creative group), `dev/audiodoctor64-test.js`
  (unit), `dev/checks/audiodoctor64.js` (app check).
- Small hooks: `main.js` (one lazyIpc line), `preload.js` (`hub.audioDoctor`), `engine-health.js` (/doctor's button),
  `lazy-data.js` / `lazy-meta.js` (regenerated), `dev/run-checks.js` (UNIT + group `audiodoctor64`).
- The setting: `settings.vstAsio` (false = ASIO off for the Sound desk's hosts; only the card's ASIO buttons write it).

## Tested (Linux, no sound card: the real Python helper with vstlive61's fake Pedalboard / sounddevice / rtmidi)
- `unit:audiodoctor64-test` ✓ covers: no runtime · everything fine (UA on ASIO, every row ✓) · the live test through Vital on the
  UA's ASIO at 128 (750 callbacks, 0 underruns) · underruns (→ "Test at 256") · loopback (480 samples = 10 ms; silence
  → patch hint; an output-only device says so) · no ASIO DLL · an ASIO driver crash (checked again without ASIO) · UA
  absent · Serum 2 failing to load (Vital still ✓) · the desk on the laptop speakers (→ Pick the UA device) · ASIO
  off · no ffmpeg / no preset folders / Vital missing · the copied report.
- `audiodoctor64` (smoke `--fake-vst`) ✓: everything below is done by clicking. The desk button opens the card (≈3 s with
  the 2-s test). Pick the UA device switches the desk's picker to the UA on ASIO (≈0.3 s). Run again, Turn off ASIO,
  then Turn ASIO back on. Copy report. The button next to Audio output. A failed live start opens the card by itself,
  with Reset host, after which it plays again. Also `/audio quick` in a chat, and /doctor's button. Nothing is loaded
  before the first click.
- The rest of the run: see the final report.

## To test on the owner's PC
1. Update Hearth (⬆ Update) and restart it fully (the check's main-process part is new).
2. Creative Playground → **Serum 2 / Vital** → **🎚 Check my audio setup**. Within a few seconds the card fills in; you'll
   hear a quiet 2-second chord through your UA outputs (Vital), or a soft sine if Vital didn't load.
3. Expected on your PC: Audio runtime ✓ · Packages ✓ · ASIO ✓ · ASIO devices ✓ "★ Universal Audio Thunderbolt at 48
   kHz" · WASAPI ✓ · MIDI in ✓ (your controller) · Serum 2 ✓ (about 2,600 controls) · Vital ✓ (about 900) · Live test ✓
   "0 underruns, ≈ N ms out" · Preset folders ✓ · ffmpeg ✓.
4. Any row with a button: press it, and the card checks again by itself.
5. Optional: patch UA output 1 into input 1 (or use UA Console's loopback) → **Loopback test**: the round trip in ms.
6. Press **Copy report** and paste it to us in a chat. That's all we need to see how rounds 61–63 behave on your PC.

## Risks
- The live test opens the device itself, so an ASIO driver that another program holds (a DAW) fails it. The row says
  so. Live audio in the Sound desk is paused for the test and stays paused afterwards: press a key to resume.
- Listing devices loads every installed ASIO driver in the check's process. A broken driver crashing it is handled
  (checked again without ASIO, ✗ with Turn off ASIO), but that can take up to the 40-s timeout if the driver hangs
  instead of crashing.
- Loading Serum 2 in its own process for the check costs its load time (a few seconds) and its memory for that moment.
- The UA ASIO, WinMM MIDI and real plugin numbers can only come from your PC. Here everything ran with fakes.

## For the patch notes
- **🎚 Check my audio setup**: a new button in the Sound desk checks your music setup in a few seconds. It covers the
  audio runtime, ASIO and your Universal Audio interface, MIDI controllers, Serum 2 and Vital (each one really
  loaded), your preset folders and ffmpeg.
- **A 2-second live test**: a quiet chord through Vital on your interface, reporting dropouts, latency and how steady
  the audio is. A loopback test times the round trip if you patch an output into an input.
- **One-click fixes on every row**: install the runtime, pick the UA device, open the plugin folder, reset the host,
  turn ASIO off or back on, install ffmpeg.
- **It shows up by itself when live audio won't start**, with the reason in plain words and the fix right there.
- **Copy report**: a short text version to paste in a chat, so we can see what your PC sees.
- Caveat: close a DAW that holds the UA ASIO driver before the live test.

## For Codex
- Your files, all additive and marked `(round 64, audiodoctor64)`:
  - `creative-vstmain.js`: in `register()`, `settings().vstAsio === false` turns the pool's `flags.asio` off at start,
    and there's a new `creative-vst:asio` handle (on/off: sets `flags.asio`, clears `asioNote`, stops the hosts).
    Nothing else changed.
  - `tools/workbench-vst.js`: three guarded one-liners. `startLive()` calls `AudioDoctorDesk.failed(err)` before
    rethrowing. `open()` with `live` calls it when the host refuses. `AudioDoctorDesk.attach(setup)` goes after the top
    row, and `setup.append(AudioDoctorDesk.button(true))` after the live controls row.
  - `dev/fixtures/fake-vst-py`: `sounddevice.py` gains `FAKE_SD_NO_ASIO_DLL` (an OSError at import with
    SD_ENABLE_ASIO), `FAKE_SD_ASIO_CRASH`, `get_portaudio_version()` and a duplex `Stream` (`FAKE_SD_LOOPBACK`,
    `FAKE_SD_LOOP_SAMPLES`). `pedalboard.py` gains `FAKE_PB_FAIL=<name>`.
- `creative-vst-doctor.py` only *imports* your `creative-vst-offline.py` (`import_sounddevice`) and
  `creative-vst-host.py` (`MidiInputs`, `Engine.choose`, `BUFFERS`). If you rename those, please keep the names or tell
  us. Plugins load there only from paths your `create().scan()` found (the same Serum 2 / Vital allowlist).
- `audiodoctormain.pick()` uses `tools/workbench-vst-live.js` `options()` / `resolve()`, so the check tests the same
  device the desk would pick. `audiodoctor-core.UA` must match `WorkbenchVSTLive.UA` (the unit test checks this).
- The card reads the workbench project (`creative-workbenches`) for `vst.roots` and `vst.live`, read only. It sets the
  output only through `WorkbenchVST.api.setOutput`.
