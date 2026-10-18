# vstembed64 — Serum 2 / Vital: 48 kHz, faster to load, their real window inside Hearth, silent AI tweaks (round 64)

The owner asked: "make the sound generator 48khz, make it load faster, show me the real window of Serum/Vital within
the app, and when tweaking the parameters don't show them to me but just tweak them silently and have them reflect
visually in the app."

Built on Codex's Sound desk (Creative Playground → Serum 2 / Vital) and rounds 61–63 (vstlive61's live host and
`WorkbenchVST.api`, presethover61's ✦ Preset window, parkjam62's loop recorder, soundbank63's previews). Every touch of
a Codex file is additive and marked `(round 64, vstembed64)`. Everything is reached by clicking; no new command.

## What shipped
### 48 kHz everywhere
1. **Live audio opens at 48 kHz on every device**, ASIO and WASAPI exclusive included (before: ASIO / exclusive ran at
   the device's own rate). On ASIO the UA driver may switch the interface to 48 kHz when asked.
2. **A device that refuses 48 kHz says so in one plain line** under the readout ("… refused 48 kHz, so it plays at
   96 kHz (its own rate); loops you record are saved at 48 kHz") and plays at its own rate.
3. **Bounces, Sound bank previews and exports are 48 kHz** (were 44.1 kHz): the same rate as live play, so nothing is
   resampled and the plugin isn't re-prepared for another rate between playing and bouncing.
4. **Park takes are always written at 48 kHz**: as played when live runs at 48 kHz; converted once, when written, if
   the device refused 48 kHz. The park ambience (microphone) is decoded straight to 48 kHz, so the layered loop is
   resampled once at most.
### Faster to load
5. **An instrument plays ~0.2 s after the click instead of seconds.** Pedalboard's `load_plugin()` built a Python
   wrapper for every control before returning (1,001 text samples per control: ~2.6 million calls for Serum 2's
   2,600); the host now skips that and reads controls straight from the plugin's own parameter list.
6. **The list of controls is kept on disk per plugin version** (`<data>/creative-vst/controls-cache/`): from the second
   time on, "controls ready" follows the click by a few hundred ms. The very first time, the controls are read in the
   background while the keys already play, and show on the desk as they arrive ("N of M controls read").
7. **Reading values is direct**: no by-name scan over all 2,600 controls per value (the old read did several per
   control); reading or refreshing the desk's sliders is milliseconds.
8. **Warm host**: when the Sound desk opens, its host process starts and imports pedalboard / sounddevice once, in the
   background. **If you used the Sound desk last session**, 20 s after Hearth starts the host is started and your last
   instrument loaded (no audio device opened), so the first click only starts the sound. Never if you haven't used it
   (nothing is even written then).
9. **The VST folders aren't walked again when nothing changed** (one stat per folder; a plugin installed or removed is
   seen at once; kept across restarts).
10. **Saving / recalling a preset no longer re-reads every control** (a state-only snapshot, then one fast refresh).
### The real Serum 2 / Vital window inside Hearth
11. **The plugin's own editor sits in the Sound desk**, under the live controls, in a frame titled "Vital · its own
    window". On Windows it opens there by itself when you open an instrument; elsewhere, click **Open editor here**.
12. **Open editor here / Pop out / Close editor** on the frame: Pop out puts it in its own window (and back in with
    Open editor here, without reopening it); Close editor closes it. The choice is remembered.
13. **It follows the desk**: moves with the layout, scrolls with the desk (only the visible part shows), adapts to
    window resizes and display scale changes; **hides** while a menu, dialog or panel is over it and while another tool
    is on screen (it stays open, so coming back is instant).
14. **Keyboard and mouse go to the plugin when you click it** (it is a real child window).
15. **Audio never waits for the editor**; with it open you can still save / recall presets, read controls and bounce.
16. **It closes cleanly** when you switch instrument, reset the host or quit Hearth.
17. **If it can't be inside Hearth** (Windows refused, the Mac without pyobjc, Linux), it opens in its own window with
    one plain line saying why.
### Silent tweaks that show
18. **The ✦ Preset window shows one short line per change** — "Darker and slower — applied" — with ↶ / ↷ as before; no
    control names or values (hover the line for the token count / what was skipped). Validation and undo unchanged.
19. **The plugin's own knobs move** when the ✦ Preset window, the AI's sound tool or the desk changes a value (the host
    sets them on the live instrument; the editor is told to repaint).
20. **The desk's sliders move too**, and the ones an AI just changed glow for a moment.
21. **Knobs you turn in the plugin's window show on the desk's sliders** within 2 s (only the ones on screen are read).
22. **The AI's sound tool applies silently**: it gets a count and is asked to answer in one short line, without listing
    controls. Before writing a preset, the ✦ Preset window reads the current values (knobs you turned included).

## Measured (fake host, this machine; real plugins can't run here)
`node dev/vstembed64-bench.js` — before = the round-63 host from git, after = this branch, same fake Pedalboard shaped
like 0.9.26 (wrapper build at load, by-name scans). Click → sound / click → all controls ready:

| Run | 406 controls × 2 ms (default) | Serum 2-sized: 2,606 × 3 ms, 0.6 µs scan |
|---|---|---|
| Before, any session | 0.99 s / 1.28 s | 8.0 s / 18.1 s |
| After, first time ever (per plugin version) | 0.20 s / 1.23 s | 0.20 s / 13.2 s (controls read in the background, keys play) |
| After, next sessions (list on disk) | 0.19 s / 0.19 s | 0.30 s / 0.35 s |
| After the idle warm-up (used last session) | 0.004 s / 0.007 s | 0.004 s / 0.025 s |

Unit test (`dev/vstembed64-test.js`, 400 × 2 ms): open → live 61–72 ms cold; controls 1.1 s first time, 7–9 ms from
disk; 200 values 2–3 ms; warm-up 0.2 s, then click → live 4–5 ms; editor close 15 ms.

**Estimate for the real plugins** (assumes ~3 µs per text sample, i.e. ~3 ms per control wrapper, and a name scan of
~0.3 µs per control — not measured on real hardware): Serum 2 (~2,600 controls) went from ~8 s (+ its own load) to
first sound and ~18 s to controls, to its own load time + ~0.2 s to first sound, ~0.3 s to controls from the second
time, and near-instant after the idle warm-up. Vital (~800 controls, est.) from ~2.5 s / ~4 s to its own load + 0.2 s
and ~0.2 s. The plugin's own initialisation (Serum 2 loads wavetables) is not changed and not included.

## How it works
- `creative-vst-host.py`: `lean_pedalboard()` (skip the wrapper build in `load_plugin` when no initial values),
  `index_controls()` (python key → C++ parameter, pedalboard's names, its name map pre-filled so one wrapper is built
  alone when used), `LazyParams` (Engine.parameters without building them), `meta_of` / `fast` / `controls` / `entry`
  (description cached, value from `string_value` / `raw_value`), disk cache keyed by plugin binary size + mtime +
  pedalboard version + the list's digest, `start_meta()` background build, `state()` (state-only snapshot),
  `inspect()` (Codex's fields, from the cache), `to_target()` (take → 48 kHz), `TARGET_RATE`, `rateNote`, warm imports
  on the main thread, `sys.setswitchinterval(0.5 ms)` (a helper thread can't starve the audio worker of the GIL),
  `show_editor(close_event)`, editor actions, `editor-place` streamed.
- `creative-vst-embed.py` (new): `Win32` (EnumWindows by process + title "Pedalboard", SetParent + WS_CHILD, frame
  styles off, SetWindowPos HWND_TOP, SetWindowRgn clip / empty region to hide — JUCE's loop ends if the window is
  really hidden, MapWindowPoints), `Mac` (pyobjc: borderless, ordered above Hearth's window number, kept aligned),
  `Embedder` (find / embed / place / clip / watch 6×/s for the plugin moving or resizing itself / pop out / closed),
  per-monitor DPI awareness. Backend picked once: real Win32, `HEARTH_VST_FAKE_WIN32=1` fake, Mac, or none.
- `creative-vstmain.js`: new actions `controls`, `editor-place` (streamed), `editor-embed`, `editor-pop`,
  `editor-close`; `embed` / `stateOnly` / `limit` fields; **Hearth's window handle is added by `register()`, never by the
  page** (Windows: `getNativeWindowHandle()`; Mac: `getMediaSourceId()` window number + content origin);
  `discoverCached()`; `pool.warm()`, `closeEditors()` (on the window's close), `follow()` (Mac); `warm.json` +
  `warmLater()` (main.js, 20 s after start, only when used last session); `cacheDir` for the host;
  `creative-vst:warm-status`.
- `tools/workbench-vst-embed.js` (new, creative group): `geometry()` (placement / clip / hidden, physical px),
  `frame()` (header, buttons, placeholder sized to the editor, event-driven tracking: ResizeObserver on the slot and its
  containers, scroll, resize, DPI media query, body children and `[hidden]` / `[open]` changes, clicks / keys that open
  menus — no timer, sends only on change).
- `tools/workbench-vst.js`: the frame in `draw()` (the transport's "Open native editor" moved onto it as Pop out),
  controls from `controls` (partial while reading), state-only snapshots, `refreshValues` / `syncVisible`, glow,
  `api.timings()` / `api.editor()`, `door.fresh(keys)`, silent `soundTool apply`.
- `tools/preset-hover.js` / `-core.js`: `summary()` line, details in the tooltip, fresh values before a request, the
  embedded frame in KEEP_CLEAR. `tools/parkjam.js`: 48 kHz decode. `creative-vst-offline.py`: 48 kHz renders,
  `decode_state` / `encode_state`, `lean`, `reset`.

## Tests
- `dev/vstembed64-test.js` (unit:vstembed64-test, 55 checks): geometry, frame words, ✦ line, whitelist (no window
  handle from the page), scan cache, warm rule, window handle; the Embedder on the fake Win32 layer (find by title,
  SetParent, place, clip, hide, plugin resizes itself, pop out / back, refused → floating + line, no layer → floating);
  the real host: 48 kHz live / bounce / take, 96 kHz-only device → note + take converted once, controls partial then
  ready, cache on disk, timings, values, embedded editor (parent, clip, Hearth's changes in its window, audio
  continues, state snapshot / recall / bounce with it open, pop / back / close), warm host, cache hit.
- `dev/checks/vstembed64.js` (`--fake-vst --fake-vst-embed --fake-engines`): see "Tested" below.
- Updated: `dev/vst-live-host-test.js` (a snapshot with the editor open now works), `dev/checks/vst-live.js` (the editor
  button is "Pop out" on the frame), `dev/soundbank63-test.js` (previews 48 kHz). Fakes: `pedalboard.py` (real-shaped
  costs, `_parameters`, `_pedalboard`, `show_editor(close_event)`, a fake window), new `fakewin32.py`; `smoke.js`
  (`HEARTH_VST_FAKE_WIN32` with `--fake-vst`, `--fake-vst-embed`).

## Tested (this machine: Linux, fake host; app checks under `flock /tmp/hearth-run.lock`, after merging
claude/intelligent-galileo-yaiqem and origin/main)
- `vstembed64` ✓ (28 checks; in the app: click → LIVE 82 ms, controls 860 ms the first time (300 × 2 ms), 254 ms after
  Reset host from the disk list; the editor placed / followed / clipped / hidden under a menu and with the desk away;
  ✦ line "Darker and slower — applied"; the plugin window and the desk slider moved; ↶; a knob turned in the plugin
  reached the desk; the AI tool silent; Pop out / back / Close; 48 kHz bounce with the editor open; Serum 2's refusal
  → own window + line), `vst-live` ✓, `presethover61` ✓ (updated to the short line), `parkjam62` ✓, `soundbank63` ✓,
  `loopsong63` ✓, `liveset64` ✓, `workbench-vst` ✓ (its real-plugin part skipped: no runtime here), `lazy` ✓.
- Units: `vstembed64-test` ✓ (55), `vst-live-host-test` ✓, `boot-test` ✓, `datasafe-scan` ✓, `winmac-test` ✓,
  `liveset64-test` ✓, `soundbank63-test` ✓, `parkjam62-test` ✓, `presethover61-test` ✓, `vst-host-test` ✓,
  `loopsong63-test` ✓.
- Found and fixed on the way: the desk's 0–1 sliders were drawn on the default 0–100 scale (a 0.45 showed as 0): the
  value is set again once min / max / step are on.

## Not tested here (Linux, no plugin, no Windows)
- Real SetParent of pedalboard's JUCE window into Electron's window, its z-order over Chromium's child window, DPI at
  125/150 %, keyboard focus in the embedded plugin, JUCE re-positioning its own window (the watcher puts it back).
- The Mac path (pyobjc isn't installed by Hearth's setup: today the Mac gets the floating window + the line).
- Real pedalboard internals the speed-ups rely on (`_pedalboard._PythonExternalPluginMixin`, `_parameters`,
  `to_python_parameter_name`, `AudioProcessorParameter`); if any is missing the host falls back to Codex's full read.
- That the real Serum 2 / Vital editors repaint from host-set values (JUCE's parameter dispatcher on the editor's loop
  should do it); snapshot / bounce off the main thread with the editor open on real plugins.
- ASIO switching the UA interface to 48 kHz.

## Risks
- Reparenting another process's window is a known but unofficial technique; if the plugin or a driver misbehaves,
  Pop out is one click and the floating fallback is automatic.
- Reading state / bouncing off the main thread while the editor is open relies on pedalboard ≥ 0.8.8's background
  thread support; a plugin that dislikes it could glitch — close the editor first if a bounce misbehaves.
- The first-ever control read for Serum 2 still takes its seconds (in the background); it's cached afterwards (per
  plugin version: a Serum 2 update reads once again).
- ASIO at 48 kHz may change the UA interface's rate for other apps too (that's what 48 kHz everywhere means).

## For the patch notes
- **Serum 2 and Vital now run at 48 kHz** — live play, bounces, previews and your park loops. If your audio device
  refuses 48 kHz, the line under the controls tells you and the loops are still saved at 48 kHz.
- **Instruments open much faster**: click Vital or Serum 2 in the Sound desk and you can play within a fraction of a
  second; the controls are ready almost at once from the second time on. If you used the Sound desk last time, Hearth
  quietly gets your last instrument ready a little after it starts.
- **The real Serum 2 / Vital window is inside Hearth**: it sits in the Sound desk under the controls. Use **Pop out**
  to give it its own window, **Open editor here** to bring it back, **Close editor** to close it. It hides by itself
  under menus and when you switch tools.
- **Ask the ✦ Preset window for a sound and it just happens**: one short line ("Darker and slower — applied"), with ↶ ↷
  to step back — and you see the plugin's own knobs and the desk's sliders move.
- Knobs you turn in the plugin's window show up on the desk's sliders too.
- Caveat: on the Mac the editor still opens in its own window for now.

## For Codex
Files of yours touched (all additive, marked `(round 64, vstembed64)`):
- `creative-vst-host.py`: see "How it works". Protocol additions only: actions `controls {limit?}`, `editor {embed}`,
  `editor-place {embed}` (also streamed), `editor-embed`, `editor-pop`, `editor-close`; `snapshot {stateOnly}`;
  live-status gains `targetRate`, `rateNote`, `editor {mode, size, note, embeddable, why}`, `controlsReady`,
  `controlsSource`, `controlsBuilt`, `timings {bootMs, importMs, pluginMs}`; `record-take` gains `playedRate`,
  `converted` (sampleRate is always 48000); `inspect` / `snapshot` with the fast list run off the main thread and are
  allowed with the editor open; `render` is allowed with it open (no reset) and lists controls from the cache;
  host.json takes `cacheDir`. Rates: 48 kHz first everywhere.
- `creative-vst-offline.py`: `RATE = 48000`, `decode_state`, `encode_state`, `job['lean']`, `job['reset']`; effect
  inputs already at 48 kHz aren't resampled.
- `creative-vstmain.js`: `EMBED_ACTIONS`, `embedOf`, `discoverCached`, `windowOf`, `warmLater` / `noteUse` /
  `warmRead`, pool `warm` / `closeEditors` / `follow` / `roots`, `create().lastStart`, `hostStartMs` on `open`.
- `tools/workbench-vst.js`: see above; `WorkbenchVST.api` stays version 1 with additive `timings()` / `editor()`;
  the door gains `fresh(keys)`.
- Coordination with liveset64 / audiodoctor64: all protocol changes are additive; the readout's advice line shows
  `rateNote` first. `creative-vst-liveset.py` (liveset64) got two small marked edits: the preset twin's control index is
  made at preload (`e.index_of`, main thread) and the switch calls `e.adopt(new, index)` — the old
  `e.parameters = new.parameters` would now build every wrapper inside the audio thread. Known interplay: a twin preset
  switch happens under an open editor, which keeps showing the previous instance (close / reopen it); `preset-preload`
  is still refused while the editor is open (liveset64's rule), and the editor now opens by itself on Windows.
- Tests: `node dev/vstembed64-test.js`; `node dev/smoke.js --fake-vst --fake-vst-embed --fake-engines --script
  dev/checks/vstembed64.js`; `node dev/vstembed64-bench.js` (before → after); `sh dev/run-checks.sh vstembed`.

## To test on the owner's PC
With the UA interface on, Serum 2 and Vital installed, live audio set up (rounds 61–63).
1. Update Hearth (⬆ Update) and restart it fully (the plugin host and main process changed).
2. Creative Playground → **Serum 2 / Vital** → click **Vital**. The status line says "Vital ready in … ms"; the readout
   reads `LIVE · … · ASIO · 48 kHz · …`. If UA Console was at 44.1 kHz, check whether it switched to 48 kHz; if the
   line under the readout says the device refused 48 kHz, tell us.
3. Below the transport, Vital's own window should appear inside Hearth within a second or two (frame title "Vital ·
   its own window"). Check: no title bar of its own, it sits exactly in the frame, no flicker over Hearth's UI.
4. Click a knob in Vital's window and turn it, type in its preset browser: the keyboard and mouse go to Vital.
5. Scroll the desk: Vital's window scrolls with it and is cut where the desk ends. Resize Hearth's window, maximize,
   move it to another monitor (different scaling, e.g. 100 % ↔ 150 %): the window stays in place and the right size.
6. Open a right-click menu or Ctrl+K over it: Vital's window disappears while the menu is open and comes back after.
   Switch to a chat and back: same.
7. In the ✦ Preset window type "darker and slower": the window shows only "Darker and slower — applied"; **Vital's
   knobs move** and the desk's sliders (Shape the sound) change. ↶ puts the knobs back.
8. Turn a knob in Vital's window: within 2 s the same control on the desk's slider list follows (search for it).
9. **Pop out**: Vital goes to its own window; **Open editor here** brings it back; **Close editor** closes it. Sound
   never stops during any of this.
10. Click **Serum 2**: Vital's window closes, Serum 2 plays quickly. The first time ever its controls take a while
    ("N of M controls read") — note how long; then **Reset host** and click Serum 2 again: controls should be ready in
    well under a second. Its window should come into the desk (Serum 2's window is big: scroll sideways if needed).
11. With the editor open: **Save bank preset**, recall it, **Bounce WAV**: all work, the editor stays.
12. Quit Hearth with the editor open: no leftover Serum / Vital window, no error.
13. Restart Hearth, wait ~30 s without touching anything, then open the Sound desk and click your last instrument:
    sound should start almost at once (warm-up).
14. Record a park loop and check its file in Explorer → Properties → Details: 48 kHz. Same for a bounce and a Sound bank
    preview.
15. If anything about the embedded window misbehaves, note what (and Pop out works around it).
