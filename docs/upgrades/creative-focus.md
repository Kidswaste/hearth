# Creative desk focus pass

This pass makes Hearth's playground a connected worktable: Serum 2 / Vital, material maps, Sketch to Asset, a timed storyboard, and Seamless Tiles. The old Music, Games, Daily, poster, built-in synth and Pocket Worlds stations no longer appear or mount. Legacy saved notebook and project fields are preserved so updating does not erase earlier work.

## Connections to the rest of Hearth

- Sketches, tiles and material previews share a project worktable and can become storyboard frames. Project name, export and opening a copy live in a closed corner menu. Opening a project replaces the active worktable, as the menu explains.
- Sketch to Asset uses the existing Meshy image-to-3D integration and its key/credit approval. The drawing defines geometry; the description guides texture/materials. It is not a text-controlled geometry editor. Jobs survive navigation; completed GLBs can join the Lab and shared asset library, and their preview frames can join the storyboard. Actual paid generation quality depends on Meshy and the submitted sketch.
- Six drawing brushes plus a stroke eraser, undo/redo, mirroring and vector/PNG export support making inputs. Storyboards offer live frame thumbnails, editable duration blocks, drag order, keyboard-accessible reorder buttons, scrubbing, animatic playback, contact sheets and offline HTML export. The animatic is a silent timing preview; audio direction lives in shot notes.
- The quest shelf can save a selected Hearth chat message and its linked media as well as uploaded creations. WAV/audio, video, image/texture and text previews use the real saved files. Chat references remain linked; uploaded proof is copied into Hearth. Missing originals need restoring; a saved chat link is not a media backup.
- The quest desk prioritizes the current quest with a compact horizontal layout. Treats can carry a user-selected EUR amount and reserve part of a monthly reward budget. These are planned rewards, not bank balances, payments or automatic purchases.
- Paris is a real Web Mercator map with OpenStreetMap attribution, visible street tiles loaded when the Paris page opens, personal places, per-place missions and proof-gated quest routes. Visit stamps are explicitly self-reported. Friend notes and earlier trip plans remain available. No GPS verification, bookings or messages are inferred.

## Audio runtime and release

The native plugin host is a persistent isolated process. It allows only Serum 2 and Vital instruments, including backend checks, and processes live MIDI into short stereo blocks for PortAudio. Other plugin types and Serum 2 FX are excluded. The native editor, Hearth controls and consented chat patch tools operate on the selected instance. Sampling/export is a separate operation. Snapshot/preset/export operations may briefly pause audio because reading thousands of controls takes time.

Ship `creative-vstmain.js`, `creative-vst-host.py` and `creative-vst-offline.py` together. The private runtime setup adds pinned `sounddevice` alongside Pedalboard and NumPy. Existing users should use the Sound desk setup/update button if the new audio dependency is missing. Do not distribute HearthEmber/Prism from the previous pass as active playground plugins; they are no longer supported by this desk. Installed third-party plugins are not moved or deleted.

Monitor defaults are limited, with explicit live start, pause, all-notes-off and host reset. Output-device latency and queued audio are shown separately; a buffer size alone is not the end-to-end latency. WASAPI may be faster than the default Windows MME route. User audio hardware and heavier patches need real-use testing.

## Design and implementation review

Three specialist agents handled audio, sketch/storyboard, and quests/map. Integration review corrected stale asynchronous mounts, inaccurate timeline playheads for unequal block lengths, map pan bounds, unsafe imported media shapes, and device selection during audio snapshots. The remaining tools share Forgeheart charcoal, glass highlights and vivid accents. Specialized controls are folded until needed, rather than making another large dashboard of unrelated demos.

All new renderer modules remain lazy; this pass does not add first-screen scripts or stylesheets. Tests use a separate Electron profile and data directory. Provider tests use the local fake Meshy server, never paid generation. Audio tests use installed native plugins with zero monitor gain while checking pre-gain PCM and PortAudio processing. Map tests do not crawl the public tile service.

Claude owns merging to main and delivery through the normal updater. This branch must not restart the live app or overwrite live configuration/data.

## Checked release evidence

- Focused navigation, removed-link recovery, tile PNG/SVG exports, legacy notebook preservation and real reload: passed in isolated Electron.
- Drawing gestures/brushes, undo/redo, immediate storyboard strip, duration edits/scrubbing, contact-sheet/animatic export and real reload: passed.
- Actual installed Vital through Electron IPC: live MIDI blocks at muted monitor gain, AI opt-in/apply/undo, draft preservation/no send, navigation stopping audio, sample/preset/patch export and plugin rejection: passed.
- Real native Serum 2 and Vital host tests: continuous output, zero underruns in the final measured runs, snapshot/bounce preserving output device, host restart. See serum-vital-live.md for measurements and their limits.
- Sketch/model integration: existing cost gate, provider IPC/downloads, GLB to Assets/Lab and thumbnail to storyboard: passed using the local fake Meshy provider, no paid calls.
- Wide/narrow creative layouts and quest layouts visually inspected. Quest migration/proof/media/budget/route behavioral tests and the focused renderer/reload flow passed.
- Lazy manifest parity and boot budgets pass: first-screen script/style counts unchanged. Git whitespace checks pass.

Manual follow-up for release: native plugin-editor interaction, sound feel with the user's chosen patch/device, actual paid Meshy result quality, and the live OSM service. These were not represented as automated end-to-end verification.
