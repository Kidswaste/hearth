# midilearn69 — 🎹 Map my controller (round 69)

The ask: a labelled button in the Sound desk opens a mapping panel; click **Learn**, turn a knob / move a fader on the
controller, then pick the parameter (searchable list, or the last one touched in the plugin window). Mappings show as
rows (CC 21 → Filter Cutoff, range, invert), can be removed, are saved per plugin in Hearth's data folder; incoming CCs
move the parameter smoothly and visibly in the plugin window; Take over vs Jump pickup; pitch bend / mod wheel untouched.

Everything is reached by clicking. No new command, no new setting outside the panel.

## What shipped
1. **🎹 Map my controller** button in the Sound desk, next to *MIDI in* (where the controller already is). It opens /
   closes a panel in the desk, above the instrument — never over the plugin's own window, which stays visible and
   usable while you map.
2. **Learn**: click it, turn a knob or move a fader → "Got CC 21 · ch 1. Now pick what it controls in Vital:". If live
   audio was paused, Learn starts it (the controller is listened to while live audio runs). *Cancel learn* stops it.
3. **The mod wheel, sustain pedal and channel-mode messages are never learned**: moving the mod wheel during Learn says
   "That was the mod wheel: it always goes straight to the instrument. Turn another knob or move a fader."
4. **Pick from a searchable list** of the open instrument's controls ("Find a control": every word you type must match,
   e.g. `filt cut`).
5. **"↺ The last one you touched in Vital's window: Macro 2"**: while Learn is on, turning a control in the plugin's own
   window (or on the desk) offers it as a one-click choice. A preset change (many controls at once) is ignored.
6. **Rows**: "CC 21 → Filter cutoff", **From / To** (% of the control's range; From above To runs it backwards),
   **Invert**, **Remove**; under each row its live value ("now 70 %").
7. **Knob pickup: Take over** (default) — the control waits until the knob reaches (or passes) where it is, then
   follows: no jump. The row says "turn the knob towards 70 % to pick it up". If something else moves the control
   (a preset, the desk, the AI, the plugin window), it waits for the knob again. **Jump** — it follows at once.
8. **Smooth, no zipper**: the host glides each mapped control from its audio thread, block by block (one-pole, 12 ms
   time constant: ~60 % of a move in the first 10 ms block at 512 samples, ~95 % in 36 ms, frame-rate independent).
   Switches and lists of choices (waveform pickers…) are set at once (no glide through the choices in between).
9. **It shows in the plugin window**: the host sets the plugin's own parameters (its knobs follow) and asks its window to
   repaint at most every 50 ms while a mapping moves it; the desk's sliders follow as before.
10. **Pitch bend, the mod wheel, sustain, notes, pressure and program changes pass through untouched**; a mapped knob's
    CC is taken (not also sent to the plugin, so Serum 2 / Vital's own MIDI learn can't double-move something).
11. **Saved per instrument** (Serum 2 vs Vital) in Hearth's data folder (`<data>/creative-vst/midi-maps/Vital.json`,
    `Serum 2.json`) with the pickup choice; read back whenever the instrument loads (host restarts, Reset host, next
    session). Written atomically, the previous file kept as `.prev.json`; a file that can't be read is never
    overwritten: it is set aside (`.unreadable-<time>.json`) and the panel says so.
12. Plain empty state ("No knobs mapped yet. Click Learn, turn a knob on your controller, then pick what it moves in
    Vital.") and a footer saying what always passes through and where it's saved.

## How it works
- `creative-vst-midimap.py` (new, loaded by the host like the liveset / sketch modules): `MidiMap.feed()` on the MIDI
  input thread (WinMM / rtmidi) decides taken vs passed and records Learn; `tick()` on the audio worker (plugin lock
  held, before each block) applies queued CC values (range → invert → pickup) and glides; a short-lived painter thread
  repaints the editor; a watcher thread (only while Learn is on, ≤ 120 s) reads all values every 250 ms in slices of
  200 (lock per slice) to find the touched control. Pure math: `knob_value`, `picks_up`, `alpha`, `glide`, `clean`.
- `creative-vst-host.py` (Codex): 6 marked one-line hooks — module load, `Engine.midimap`, `from_controller` →
  `midimap.feed`, `load` → `midimap.loaded(name)`, `produce` → `midimap.tick`, `command` → `midimap.command`.
- `creative-vstmain.js` (Codex): `MIDIMAP_ACTIONS` (`midimap-status`, `midimap-learn`, `midimap-set`) in the request
  whitelist and the no-adopt list (only an open instrument's host); `jobOf` passes `maps` / `pickup` / `learn` through
  `tools/midilearn-core.js` `fields()` (validated again in the host). No new IPC, no change to main.js / preload.js.
- `tools/midilearn-core.js` (new, shared window / main): whitelist, add / remove / range / invert, the words.
- `tools/midilearn.js` + `.css` (new, lazy group `midilearn`, loaded on the button's first click; first screen
  unchanged: 73 scripts / 29 sheets): the panel; polls `midimap-status` only while it is on screen (200 ms while
  learning, 700 ms otherwise, not when the window is hidden), writes the DOM only when something changed.
- `tools/workbench-vst.js` (Codex): one marked line adds the button next to *MIDI in*.
- `lazy-data.js` group + `node dev/lazy-manifest.js`; `index.html` lazy-at tag (`midilearn`).

## Tests
- `dev/midilearn69-test.js` (UNIT, `unit:midilearn69-test`): the window's core and main-process whitelist (19 checks);
  `dev/midilearn69-test.py` on the host module (53 checks: range, invert, reversed range, clamping, takeover by reach /
  by crossing / never on one side, frame-rate-independent smoothing that lands exactly, stepped controls, taken vs
  passed messages, re-pickup after an outside change, Learn + mod wheel, the touched control vs a preset burst,
  `.prev.json`, unreadable file set aside); the real host through the pool with the fake Pedalboard and a fake
  controller fed from a file (15 checks: learn 62 ms, takeover, pitch bend / mod wheel / notes reach the plugin
  untouched while the mapped CC doesn't, jump + invert + range, Serum 2 separate, mappings back after a restart).
- `dev/checks/midilearn69.js` (own profile, `--fake-vst --fake-vst-embed`): the whole flow by clicking, 28 checks — the
  button next to MIDI in, code loaded on the click (44 ms to open), empty state, the plugin window visible below the
  panel, Learn (mod wheel named; CC 21 learned in 173 ms), search "cutoff", the row, Take over holds at 70 %, follows
  after crossing (knob → value 133 ms incl. polling), the plugin window shows it (repainted), Jump / From 20 / To 60 /
  Invert, the touched control ("Macro 2"), Remove, Close, Reset host → mapping back, Serum 2 empty.
- Fakes: `dev/fixtures/fake-vst-py/rtmidi.py` reads `FAKE_MIDI_INBOX` (MIDI lines, or `{"knob": …}` = a control turned
  in the plugin window); `pedalboard.py` keeps `_INSTANCES`; `dev/smoke.js --fake-vst` sets the inbox in the run's tmp.

Run here (Linux, fake host, under `flock /tmp/hearth-run.lock`): `midilearn69` ✓, `vst-live` ✓, `bouncelog66` ✓,
`lazy` ✓, `unit:boot-test` ✓, `unit:midilearn69-test` ✓, `unit:datasafe-scan` ✓, `unit:winmac-test` ✓.
`unit:vst-live-host-test` ✖ — pre-existing, not this change: it expects the monitor gain 0.1 back but gets 0.075
(the master volume at 75 %, Codex's change in volumemain.js).

## Not tested here (needs the owner's hardware)
- A real controller through WinMM on Windows (the path is the same as notes since round 61; only CCs are new here).
- Real Serum 2 / Vital: that setting `raw_value` from the audio thread right before the block moves the sound without
  clicks, and that their editors redraw (JUCE editors normally follow parameter changes; the repaint is a nudge).
- "The last one you touched" on Serum 2's ~2,600 controls: one read pass costs a few ms every 250 ms while Learn is on
  (estimated, not measured on the real plugin); controls a plugin moves by itself (rare for host parameters) could be
  offered by mistake — the searchable list is always there.
- The Mac: controllers need python-rtmidi there (not installed by Hearth's setup); the panel says so.

## For Codex
Touched files of yours (additive, marked `(round 69, midilearn69)`):
- `creative-vst-host.py`: docstring paragraph + six one-line hooks (see "How it works"). Protocol additions only:
  `midimap-status`, `midimap-learn {learn}`, `midimap-set {maps, pickup, learn?}` — all answer the same status shape
  `{instrument, pickup, maps: [{cc, ch, key, label, min, max, invert, value, picked, knob, cc_value}], learn, touched,
  file, savedAt, note, events, taken, listening, never}`. `from_controller` now returns early for a mapped CC.
- `creative-vstmain.js`: `MIDIMAP_ACTIONS` (whitelist + no-adopt list), `jobOf` spreads `midilearn-core.fields(r)`.
- `tools/workbench-vst.js`: one line in `draw()` after the audio doctor button.
- Liveset64's preset twin: mappings use the engine's current `index`, so they follow `adopt()`.

## For the patch notes
- **🎹 Map my controller**: in the Sound desk, next to *MIDI in*. Click **Learn**, turn a knob or move a fader on your
  controller, then pick what it should move — type to search Vital's or Serum 2's controls, or turn the control in the
  plugin's own window and click "The last one you touched".
- Each mapping is a row (**CC 21 → Filter cutoff**) with **From / To** (how much of the control the knob covers),
  **Invert** and **Remove**. Under it you see where the control is now.
- **Knob pickup**: *Take over* (default) waits until your knob reaches the control before moving it, so nothing jumps;
  *Jump* follows your knob at once.
- Moves are smoothed (no zipper noise) and you see the knob turn in Serum 2 / Vital's own window.
- Pitch bend, the mod wheel and the sustain pedal always go straight to the instrument, untouched.
- Mappings are saved separately for Serum 2 and Vital on this computer and come back next time.
- Needs testing with your real controller and the real plugins (it was tested here with a pretend controller and a
  pretend Vital): tell us if a knob feels laggy or steppy, or if the plugin window doesn't follow.
