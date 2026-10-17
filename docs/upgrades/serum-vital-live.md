# Serum 2 / Vital sound desk

The Creative Playground now has one instrument desk. It discovers only `Vital.vst3` and `Serum2.vst3`, verifies their actual instrument identities before loading, and excludes Serum 2 FX and all other plugins. Existing native installs are untouched. Old project fields/presets remain readable but unsupported instruments are not exposed.

## Live path

- One persistent Python process owns one native plugin instance; Electron never loads native plugin code.
- Hearth IPC checks the originating main frame and a scanned instrument path/name. Node talks to the child through a random-token authenticated loopback socket; plugin stdout is not a protocol channel.
- A producer thread calls Pedalboard with `reset=False` for 256/512/1024-frame blocks at 48 kHz. A bounded queue feeds a PortAudio output callback that only copies PCM. Notes and parameter edits reach this existing instance while it runs.
- The callback never enumerates parameters, renders files or loads presets. It fills silence on starvation and exposes an underrun counter. The producer limits monitor output to ±0.98 and defaults to 20% gain.
- The UI shows the device-reported output latency separately from the maximum queued PCM time (up to three blocks including the producer's pending block). These are estimates, not measured end-to-end keyboard latency. On Windows, the equivalent WASAPI device is preferred over the default MME wrapper when identifiable; users can select the device/buffer.
- Pointer/keyboard release, window blur, workspace navigation and explicit panic clear notes. A five-second control-heartbeat watchdog also clears held notes if the renderer disappears. Host stop/quit kills the isolated child.
- Native editors stay on the child main thread; the audio producer runs separately. This path has not been visually exercised with the actual native editor during automated checks. Refresh captures editor changes after its window closes.

Full state snapshots and WAV bounces briefly stop/restart audio on the same device, buffer and gain. They are explicit operations; continuous controls use the fast patch action. WAV exports are deliberately separate from live playback. Any patch mutation invalidates the previous bounce so an old sound cannot silently be saved as the current one.

## Runtime and updater

The explicit setup button installs a private venv with Pedalboard 0.9.26, NumPy 2.5.4 and sounddevice 0.5.6. An existing runtime gets the new sounddevice dependency when Setup is pressed. No packages are downloaded on app startup. `HEARTH_VST_PYTHON` supports a scoped development runtime.

Ship `creative-vstmain.js`, `creative-vst-host.py` and **`creative-vst-offline.py`** together. Lazy renderer assets are `tools/workbench-vst.js` and `tools/workbench-vst.css`, before `workbench-ui.js`. Main/preload IPC names are unchanged.

## Checks

- `node dev/vst-host-test.js`: two-instrument allowlist, unscanned/name rejection, persistent IPC, child crash, cancellation/retry and session cleanup with a deterministic worker.
- `HEARTH_VST_PYTHON=... node dev/vst-live-test.js`: real installed Serum 2 and Vital, muted physical PortAudio output, nonzero native PCM, live MIDI and parameter changes, snapshot/WAV export preserving device/gain, WAV signature, invalid parameter rejection, panic, stop and restart.
- `dev/checks/workbench-vst.js`: isolated Electron UI/IPC check for the live keyboard, opt-in AI patch edits, exact parameter undo, chat draft preparation without sending, navigation cleanup, native preset save and exports.

Hardware checks deliberately set monitor gain to zero; they verify real processing and the device stream, not a subjective listening review. Complex patches and background CPU load can cause underruns. The counter and 1024-frame option make this visible; this Python bridge is a practical creative audition host, not a claim of hard real-time DAW guarantees or full VST automation coverage.

## Design review

The previous vault mixed installed-plugin discovery, custom instruments, offline rendering and AI requests. The focused sound desk makes the musical action first: select one of two instruments, start live audio, play. Advanced parameter search, patch storage, chat collaboration and sample export are collapsible secondary sections. It uses Hearth's project file/export helpers and chat tools instead of introducing another project system. Native WAV exports still use Hearth's save flow; a future common asset picker can surface those files in other workbenches without inventing an additional media library.

Primary implementation references: [Pedalboard process/reset API](https://spotify.github.io/pedalboard/reference/pedalboard.html), [sounddevice OutputStream/callback and latency contract](https://python-sounddevice.readthedocs.io/en/latest/api/streams.html).

Measured on the local Universal Audio Twin X USB WASAPI output with 512-frame blocks, muted monitoring and concurrent development checks:

| Instrument | Live patch round trip | Maximum observed block processing | Stream underruns | Device latency | Queue upper bound |
| --- | ---: | ---: | ---: | ---: | ---: |
| Serum 2 | 1 ms | 1.94 ms | 0 | 22 ms | 32 ms |
| Vital | 2 ms | 0.77 ms | 0 | 22 ms | 32 ms |

The block deadline is 10.67 ms. These are short default-patch runs, not a stress guarantee. Full Serum metadata/state/export integration took about 50 seconds; Vital took about 11 seconds. Those expensive operations are separate from the persistent live path. The MME system wrapper initially measured 106.7 ms output latency, which is why the UI prefers the corresponding WASAPI output where available.
