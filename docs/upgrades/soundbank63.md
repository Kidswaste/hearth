# soundbank63 — Sound bank: every Serum 2 / Vital preset in one searchable picker (round 63)

Built on the Sound desk (Creative Playground → Serum 2 / Vital), vstlive61's `WorkbenchVST.api`, presethover61's ✦ Preset
window and parkjam62's Park jam. Touches of Codex's files are small, additive and marked `(round 63, soundbank63)`.
No AI by default; nothing runs while the picker is closed.

## What shipped
### The picker
1. **Sound bank** — one floating panel listing every preset you have: the Sound desk's bank, the ones the ✦ Preset window
   saved (marked "✦ Preset window"), and, if you turn it on, Serum 2's / Vital's own user preset folders. Opened from
   **Keep a patch › Sound bank…** in the desk, `/sounds`, or Ctrl/⌘+K "Sound desk: sound bank (find a preset)".
2. **Search by words and tags**: "dark bass", "pad fav", "vital pluck", a name prefix; a row of the most common tags
   (and ★) to tap.
3. **Hover = listen**: a short pause on a row plays its 3-second preview (a C3 stab, then a C minor 7 chord); moving off
   stops it.
4. **Click = play it live**: the preset loads into the open instrument (it opens Serum 2 or Vital first if needed) and
   live audio starts. Enter does the same; right-click has Play live / Similar / Favorite / Make its preview / Used in.
5. **Drag onto the desk** loads it; **drag onto the Park jam fold** loads it and notes it as used in that park sketch.
6. **★ Favorites**, kept across restarts; "fav" in the search shows only them.
7. **≈ Similar to this**: the nearest sounds by their controls (filter, envelope, unison, mono, effects, pitch), with
   the distance shown.
8. **Used in**: a park take recorded while a bank preset plays, and a drop on the Park jam fold, are noted on the preset
   ("used in 2", the list on hover / right-click).
9. Sits beside the ✦ Preset window, never on it; Esc or ✕ closes it.
### Previews
10. **Make previews** (the status line, or ⋯): every preset without one gets a 3-second WAV, rendered **once**, offline,
    **one at a time, in the background**, in a separate plugin host started for the job at below-normal priority and
    stopped when done: live audio never waits for it. Progress "Previews 3/12 · Stop" in the status line.
11. **Stop** cancels at once (the preview host is closed). A preset that can't render is marked "!" with the reason and
    isn't retried until you ask from its row.
12. Previews are cached in Hearth's data (`creative-vst/soundbank/previews`, at most 500, oldest dropped).
### Tags without AI
13. **Local tags** from the preset's own values: bass, lead, pad, pluck, keys, fx, seq, chord · dark / bright · mono /
    poly · wide (unison) · wet (reverb / delay) · gritty · soft (slow attack). Read from the desk's controls when you save,
    from Vital's own preset JSON, from the controls the preview render reads back, and from names / folders ("BA Reese",
    "LD_", "Plucks", Serum 2's own tags). A name's category always wins over a guess.
14. **Tag with AI…** (⋯, Claude or Astra): opt-in, one small prompt for up to 20 untagged presets (≈ 600 characters: one
    short line each), toolless lean helper run; usage counted as `soundbank`.
### Plugin folders (opt-in, read-only)
15. **Include Serum 2 / Vital folders (read-only)** (⋯): Serum 2 `Documents/Xfer/Serum 2 Presets/Presets/User` (also the
    OneDrive Documents on Windows; on the Mac also `~/Library/Audio/Presets/Xfer Records/Serum 2 Presets/Presets/User`),
    Vital `Documents/Vital/User/Presets` (Windows), `~/Music/Vital/User/Presets` (Mac), or Vital.config's `data_directory`.
    Hearth only lists and reads them: never writes, renames or deletes there.
16. **Add a preset folder…** (⋯) for any other folder of `.vital` / `.SerumPreset` files (read-only too).
### Chat
17. `/sounds` (alias `/sound-bank`): `/sounds dark bass` (open, searching), `/sounds fav`, `/sounds previews`, `/sounds stop`,
    `/sounds load <name>`, `/sounds similar <name>`, `/sounds folders on|off`, `/sounds ai [astra]`, `/sounds status`;
    suggestions while typing.

## How it works
- `tools/soundbank-core.js` (pure, Node-testable): `features(parameters)` (labels like "Env1 Atk", "Fil Cutoff", "A Uni",
  "Env 1 Attack", "Filter 1 Cutoff"; units read from the display: ms / s / Hz / kHz), `vitalFeatures(json)` (Vital's real
  units: envelope seconds = value⁴, cutoff in semitones, switches), `tagsOf`, `vector` / `distance` / `similar` (weighted
  RMS over the controls both know + a tag term; tags decide when fewer than 3 are shared), `search`, `serumMeta` (the
  readable "XferJson" header of a `.SerumPreset`; the compressed body isn't read), `aiPrompt` / `aiParse`, `PREVIEW`.
- `soundbankmain.js` (lazy IPC, one line in `main.js`): the index `<data>/creative-vst/soundbank/index.json` (temp file +
  fsync + rename; an unreadable index is kept aside as `index.json.unreadable`; saves debounced 250 ms, flushed on quit),
  the bank sync (id = hash of the state, so favorites / used in follow the sound), the read-only folder scan (≤ 3,000
  files, depth 6, cached by mtime + size; `.vital` ≤ 4 MB parsed, Serum 2 only its first 64 KB), the preview queue
  (`creative-vstmain.create({ lowPriority: true })` → `inspect` once per instrument, then `render` with the preset's
  state; the queue is grouped by instrument), `soundbank:*` IPC channels. Env `HEARTH_SOUNDBANK_ROOTS` overrides the
  plugin folders (tests).
- `tools/soundbank.js` + `.css` (in the `creative` lazy group): the panel, hover / click / drag, the `preset` and
  `hearth:quest-week` listeners for "used in", the AI helper, `/sounds`.
- Plugin-folder presets load and preview by handing the file's bytes to the plugin as its state (`raw_state`). Vital's
  plugin state is its preset JSON, so `.vital` files should load as they are; Serum 2's state format isn't public, so a
  `.SerumPreset` may not load this way (it shows "!" with the plugin's reason; it still lists, tags and searches).

## Tests (this machine: Linux, no sound card, no real plugins)
- `node dev/soundbank63-test.js` (unit:soundbank63-test, 48 checks): tags from 7 fixture parameter sets
  (`dev/fixtures/soundbank/params.json`) and a `.vital` file, names / folders, similarity order, search, the Serum 2
  header, the AI prompt size / parse; the index (sync, favorites, used in, a failed write leaves the old file whole and
  no temp file, 40 back-to-back atomic writes, an unreadable index set aside); plugin folders off by default, read with
  folder / tags, every write the main side made (163) inside its own folder, the preset files byte- and time-identical;
  the queue one at a time, cached, cancelable, its host stopped; and the REAL host with the fake Pedalboard: a 3-s
  preview rendered from a bank state while a live Vital kept playing in its own host (0 underruns), the preview host
  gone afterwards.
- `dev/checks/soundbank63.js` (`node dev/smoke.js --fake-vst --script dev/checks/soundbank63.js`, 24 checks): presets kept
  in the desk (one by the ✦ Preset window's door), Sound bank… opens the picker (≈ 330 ms), sources and tags shown,
  search, a plugin folder added (read-only, unchanged at the end), Make previews → queued, 4 made in ≈ 0.7 s and cached,
  the fake Serum 2 file marked "!", hover plays / leave stops, click loads live (≈ 40 ms), a plugin-folder preset loads,
  ★ + "fav", ≈ similar, drop on the Park jam fold, a park take → "used in 2", `/sounds` status / words / load.
- Also passed (under `flock /tmp/hearth-run.lock`, after merging claude/intelligent-galileo-yaiqem; origin/main had nothing
  newer): vst-live, presethover61, parkjam62, workbench-vst (its real-plugin part skipped: no runtime here), lazy,
  unit:boot-test, unit:vst-live-host-test, unit:winmac-test, unit:parkjam62-test, unit:vst-host-test.

## Risks
- Real Serum 2 / Vital control names weren't available here: matching is by common words (attack / atk, cutoff, unison /
  uni, mono / legato, polyphony, reverb / verb…); a control named otherwise just doesn't feed the tags (names, Vital JSON
  and the preview's read-back still do).
- Serum 2 `.SerumPreset` files may not load / preview through `raw_state` (see above). Serum 2's Mac folder depends on the
  installer; both known places are read, and "Add a preset folder…" covers the rest.
- Rendering a preview loads a second copy of the plugin in the preview host (Serum 2 is heavy) for the length of the
  queue; it runs below normal priority, but on a busy laptop with a small buffer the live host can still feel it —
  make previews while not playing.
- Hover previews play through the system output (the window's audio), not the live ASIO stream; with the UA on ASIO in
  exclusive use, Windows may route them elsewhere or not at all.
- Previews are ≈ 0.5 MB each (3 s, 44.1 kHz stereo WAV) in the data folder (cloud-synced by default); capped at 500.
- The fake instrument now honours MIDI offsets inside one call (needed for an offline bounce); the live / park tests pass.

## For the patch notes
- **Sound bank: all your Serum 2 and Vital presets in one place.** In the Sound desk, Keep a patch › **Sound bank…** (or
  `/sounds`): your bank, what the ✦ Preset window made, and — if you want — the synths' own user folders (read only).
- **Hover to hear, click to play.** Each preset gets a 3-second preview (made once in the background when you ask); a
  click loads it live into Serum 2 or Vital.
- **Find sounds by feel**: type "dark bass" or "wide pad", tap a tag, star favourites, or press ≈ for similar sounds.
  Tags come from the preset's own settings — no AI needed (or ask Claude / Astra to tag a batch).
- **Drag a sound onto your Park jam**, and see which park sketches and takes used it.
- From chat: `/sounds dark bass`, `/sounds previews`, `/sounds load <name>`, `/sounds similar <name>`.

## For Codex
Files of yours touched (all additive, marked `(round 63, soundbank63)`):
- `creative-vstmain.js`: `create({ …, lowPriority })` — when true, the spawned host gets `os.setPriority(PRIORITY_BELOW_NORMAL)`.
  Nothing else changes; the Sound bank makes its own `create()` instance for previews (never the pool's live hosts) and
  uses only your existing `inspect` / `render` actions (render with `state`).
- `tools/workbench-vst.js`: a "Sound bank…" button in the Keep a patch row (when `SoundBank` is loaded); `door.keep` (the ✦
  Preset window's save) stores `from: 'preset-hover'` on the bank entry and emits `source: 'preset-hover'` with the
  `preset` event. `WorkbenchCore.validate` keeps the extra field.
- `dev/fixtures/fake-vst-py/pedalboard.py` (vstlive61's fake): MIDI takes effect at its offset within a call.
- Others: `main.js` (one `lazyIpc('soundbankmain.js', …)`), `preload.js` (`hub.soundbank`), `lazy-data.js` / `lazy-meta.js`
  (creative group + regenerated META), `dev/run-checks.js` (UNIT + group `soundbank`), `dev/boot-test.js` (reads
  soundbankmain's register signature).
- If you add a preset source of your own, sync it the way the window does: `hub.soundbank.list({ bank: [{ label, name:
  'Vital' | 'Serum 2', path, state, from?, features? }] })`.

## To test on the owner's PC
With Serum 2 and Vital installed and the Sound desk's live audio set up (vstlive61).
1. Update Hearth (⬆ Update) and restart it fully (the bank's main-process part is new).
2. Creative Playground → **Serum 2 / Vital** → open Vital. Save two or three bank presets (Keep a patch › Save bank
   preset), and one from the ✦ Preset window (describe a sound, Save).
3. Keep a patch › **Sound bank…**: they're listed with tags (e.g. "pad · soft · wide"); the ✦ one says "✦ Preset window".
4. ⋯ → **Include Serum 2 / Vital folders (read-only)**: your user presets appear (⋯ → Folders read shows which folders
   were found; if your Serum 2 presets live elsewhere, ⋯ → Add a preset folder…). Check in Explorer / Finder afterwards
   that nothing in those folders changed.
5. Press **Make previews (n)** with live audio paused; watch "Previews n/N". Then play a few keys while it continues:
   the readout's underruns should stay at 0 (if not, note the buffer size and Serum 2 vs Vital).
6. Hover rows: each plays its preview through your speakers. Note any Serum 2 preset marked "!" (and its reason when
   hovering "!") — that tells us whether Serum 2 accepts its preset files as state.
7. Click a **Vital user preset**: it should load and sound like it does in Vital's own browser. Do the same for a Serum 2
   one (expected to work for bank presets; for `.SerumPreset` files, tell us if it doesn't).
8. Type "dark", "pad fav", press ★ and ≈ on a pad: the similar list should sound related.
9. Open Park jam, drag a preset from the bank onto it, record a 4-bar loop: the preset's row then says "used in 2".
10. In any chat: `/sounds status`, `/sounds load <a preset name>`.
