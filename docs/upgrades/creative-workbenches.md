# Creative workbenches + native Forgeheart instruments

## What is included

The existing fifteen Playground activities and their notebook remain intact. Seven new navigation entries open a worktable and six deeper creation stations, stored separately in `creative-workbenches` v1:

- **Plugin vault:** filename-only discovery of installed Windows x64 VST3s (including directory bundles and multi-plugin bundles), search, favorites, extra folders, parameter search, native editor, patch undo, local preset bank, portable patch JSON, note/chord/arpeggio audition, effect input files, stereo 44.1 kHz PCM16 WAV exports, silence/peak feedback, stop/retry.
- **Ember sound forge:** a local browser sample instrument with four oscillator shapes, ADSR, detune, low-pass, drive, overtone, tremolo, crush and echo. WAV and parameter JSON exports. This is not presented as the native VST binary, and its sound differs from it.
- **Pocket worlds:** 24×16 level painter (pointer + keyboard), undo, single player placement, walls, collectible sparks, hazards, exit, top-down/platform movement, speed/gravity/jump tuning, sandboxed playtest, portable level JSON and self-contained playable HTML.
- **Material foundry:** five periodic surface families, seed variations, scale/octaves/contrast/tint, relief/roughness, resolution selection, repeated preview and separate color/height/OpenGL normal/roughness PNGs.
- **Sketch to asset:** stroke drawing, whole-stroke erasing, undo/redo, color/width, mirrored strokes, SVG/transparent PNG, pixel-style PNG, repeated print, height mask, worktable and storyboard handoffs. Repeated drawings are not claimed to be seamless materials.
- **Storyboard table:** up to 24 shots, image imports, sketch shots, title/direction/duration, reorder/duplicate/remove, timed silent animatic, contact sheet PNG, offline animatic HTML. Images embed in the project.
- **Shared worktable:** named local project, autosave, validated JSON import/export, saved image shelf, preservation of unreadable/unknown saved data. New export names separate texture maps from drawing masks.

The UI uses charcoal, pink/violet/amber accents, SVG workbench illustration, finite hover reflections and reduced-motion support. New features remain lazy: no extra first-screen scripts/styles. The Playground surface opts out of the app's entrance animation because its frame-zero opacity could remain paused when the window was in the background.

## Native VST3 runtime

`creative-vstmain.js` registers five lazy IPC channels through the main window's preload. Only the main workspace frame is accepted. The helper is `creative-vst-host.py`; every inspection/editor/render has its own process and temporary directory. Discovery does not execute plugins. Only scanned plugin paths can be loaded. No shell command interpolation. Operations serialize, can be cancelled, and have timeouts; application exit/window destruction stops the child. Plugin stdout is ignored; bounded JSON response files carry the protocol. Job files are removed after success/failure.

The explicit **Install VST runtime** button creates a venv under Hearth's data folder and installs `pedalboard==0.9.26` and `numpy==2.5.4`. It requires an existing supported 64-bit Python (`py` on Windows, `python3` elsewhere). Nothing downloads or scans at application startup. Windows x64 is the verified platform. Runtime test override: `HEARTH_VST_PYTHON`.

Standard paths include system/user VST3 locations and `<dataDir>/creative-vst/plugins`. The latter is the intended location for the two Hearth-built plugins. Extra folders are user-picked. The package's native editor opens only when requested and returns its patch after the window closes. There is no live audio engine/keyboard while the native editor is open; preview is render-then-play. Rendered audio is not played automatically.

Patch state is zlib-compressed, marked `z1:`; older uncompressed base64 is accepted. Limits: 8 MiB compressed / 64 MiB expanded per patch; 9 MB total base64 preset bank; 12 bank slots; 64 MB portable workbench project; effect inputs up to 12 MB / 20 seconds, with one-second tail by default. MIDI auditions up to 20 seconds at the host boundary (12 in UI). Invalid/non-finite output is rejected; peaks over .98 are reduced and reported. Normalized controls address continuous plugin parameters that expose unit-bearing strings or infinite physical ranges; `display` retains the human value for the AI.

## Astra / Claude sound design

The vault prepares an **unsent** draft for either native agent. With Hearth chat tools enabled, `chat_do` routes `op: "sound"` to lazy `chat_sound`:

- `action: "inspect", query?, offset?` returns at most 40 real parameters, with types/ranges and current values.
- `action: "apply", parameters: {...}` validates all changes before calling the selected plugin.
- `action: "render", note?, duration?` renders a short instrument audition into the vault.
- `action: "undo"` restores the previous patch.

The user must first load a plugin and enable session AI patch editing in the vault. An explicit button enables the selected agent's Hearth chat tools if disabled (Astra defaults to open-only tools); preparing a draft otherwise explains the missing setup. Inspection is read-only; no tool can pick/load arbitrary plugins or open their native editor. Changing the selected plugin resets this opt-in. Session opt-in survives navigation to the chat but not app reload. Patches do not replace installed factory presets. Rendering metrics are not a musical critique; the draft tells the agent to request listening feedback. Wavetable/sample file loading, modulation-matrix setup and controls not exposed by the plugin can still require manual native-editor actions. No claims of fully autonomous auditory evaluation. The bridge allows 120 seconds for sound operations, exceeding the helper's 90-second timeout so its failure can be reported.

## HearthEmber and HearthPrism

Real JUCE VST3 projects live in `plugins/forgeheart`. **Ember** has twelve voices and sine/saw/triangle/square, ADSR, detune and overtone. **Prism** is a stereo filter/drive/bitcrush/sample-hold/tremolo/echo/reverb rack. Both have a custom Forgeheart rotary editor, automatable parameters and native saved state. The vault also offers four Ember starter patches and three Prism racks.

Windows build succeeded at commit `68d16cf`:
https://github.com/Kidswaste/hearth/actions/runs/39044691547

Artifact: `Forgeheart-VST3-Windows`, id `12104449959`. No binaries are committed to Git or installed into a system folder. Local checked download:
`C:/Users/quent/Documents/Codex/2026-08-23/do-x20/outputs/Forgeheart-VST3-Windows.zip`

The workflow uses JUCE 8.0.13. See its upstream licence and the plugin README for redistribution terms. The plugin source/build is separate from Hearth's renderer and Pedalboard host. Parameter changes are block-rate in this first native version; this is not a Serum-scale wavetable/modulation engine.

## Verification

- `node dev/workbench-test.js`: project validation, periodic texture transitions, normal maps, oscillator output/ADSR, atomic patch validation, SVG/export safety, and executing the exported game's movement/collection/win loop.
- `node dev/vst-host-test.js`: scan/path limits, child crash isolation, single-operation locking, cancellation/retry, temporary-file cleanup.
- `node dev/creative-test.js` and `node dev/creative-preview-build.js --check`: existing generators and generated sandbox parity.
- `dev/checks/workbenches.js`: Electron station navigation, all export types, level paint/undo, drawing gesture, storyboard edits, real KV IPC and reload.
- `dev/checks/workbench-vst.js`: real installed Vital through Electron IPC, disabled-before-opt-in AI edit guard, parameter update, exact undo, non-silent stereo render, no autoplay, preset save/export and unscanned-path rejection.
- Existing `dev/checks/creative.js` + `dev/creative-export-test.js`: the old activities continue to work; saved notebook survives reload.
- Actual installed Vital: 903 exposed parameters, two-second stereo render, peak ~.366. Serum 2: 2,621 parameters, two-second stereo render, peak ~.192. Both on this PC. Compatibility with every other installed plugin is not claimed.
- Downloaded **native Ember binary**: all four waveforms rendered non-silent stereo; peaks .36–.41. **Native Prism binary**: processed an imported test WAV; non-silent stereo output. Native editor appearance/interaction has not been manually exercised on the user's desktop.
- Lazy manifest parity and boot budget checks; no added first-screen assets.

## Claude integration / release

This branch is stacked on PR #12 and therefore includes the pending quest progression, glass/life quests and Paris map. Main remained `c14cb65` at the final fetch. Integrate the combined branch once, preserving your later changes; do not cherry-pick the same quest commits twice. Main/preload changes are small additive registrations; MCP adds one `sound` dispatch line; global Forgeheart CSS is untouched. The generated lazy metadata includes `chat_sound`.

Claude owns the main merge and normal updater release. Do not copy a development data directory or replace live configuration. For first-party VSTs, include the checked bundles from the build artifact under `<dataDir>/creative-vst/plugins` (or another user plugin folder), retaining the full `.vst3/Contents` directories; the vault's rescan finds them. Native host additions require the updater's normal main-process activation path. Codex has not restarted live Hearth, invoked its updater, or pushed main.
