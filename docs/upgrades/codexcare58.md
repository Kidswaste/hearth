# codexcare58 — care for Codex's creative workbenches and Astra's model check (round 58)

Three small fixes in files Codex wrote (creative-vstmain.js, engine-watch.js) and their tests. Every edit is additive,
marked `(round 58, codexcare58)` in a comment, and written in the file's own style, so Codex can follow and keep going.

## What changed, and why (for Codex)

1. **One plugin, one row on the Mac too** (`creative-vstmain.js`).
   - Cause: `discover()` keyed the seen-paths set with `p.toLowerCase()` on `win32` only. The Mac's default disk
     (APFS) ignores case as well, and the Mac hands back accents decomposed (NFD), so the same VST3 reached through a
     folder spelled differently (an extra folder the owner adds, `/Library/...` vs `/library/...`) could be listed
     twice. `unit:winmac-test` caught it as `case-win-only`.
   - Fix: `pathKey(p, fold)` folds with `normalize('NFC').toLowerCase()` on `win32` and `darwin` (Linux keeps exact
     names, its disks are case-sensitive). `discover(roots, fold)` takes the fold as an optional second argument so
     the unit test can exercise both behaviours on any machine. Roots are also de-duplicated by
     `fs.realpathSync.native` (a symlinked / aliased folder is walked once; a missing root is skipped as before), but
     the walk still starts at the root **as given**, so listed paths — and the owner's saved favorites / selected
     plugin — don't change. No ignore marker was needed.
   - `create()` takes an optional `jobMs` (default 90000, unchanged) so the unit test can prove a plugin that never
     answers is stopped with "Plugin operation timed out…".
   - Tests added to `dev/vst-host-test.js`: symlinked root listed once, `Synth.vst3` + `synth.VST3` fold to one when
     folding and stay two when not, NFC/NFD keys equal, a missing root is harmless, a hanging job times out with the
     plain message and frees the host, and a host without the runtime answers "Install the local VST runtime first".

2. **`workbench-vst` on a computer without the VST runtime** (`dev/checks/workbench-vst.js`, one message in
   `tools/workbench-ui.js`, one line in `dev/run-checks.js`).
   - Cause: this machine, not the app. There is no Pedalboard (Python 3.13 exists, `import pedalboard` fails), no VST3
     plugins in any standard folder, and no desktop for a native editor. The check went straight for a real
     **Vital** button (`.wb-plugin-list button`), which never appears with 0 plugins, and waited 96 s →
     "VST UI timed out". The screenshot showed the app doing the right thing: the vault opened at once with
     "One-time local runtime setup… Install VST runtime" and "0 installed plugins found". `status()` returns
     `missing` without spawning anything, and a request answers "Install the local VST runtime first…" immediately.
   - The check now has two parts. **Part 1 (everywhere):** a throwaway `HearthFixture.vst3` bundle folder under the
     run's `SMOKE_TMP`, added (twice) as the project's extra folders; the vault opens and states the runtime in plain
     words (timed); the scan lists the fixture once, by name only; choosing it without the runtime shows
     "Install the local VST runtime first…" in the vault's status line (timed), and the same over IPC in < 5 s;
     unscanned paths are refused; Stop answers in the UI and over IPC; the host is free afterwards. **Part 2** is
     Codex's original real-Vital round trip, unchanged, run only when the runtime is ready and Vital is installed;
     otherwise it is put in a top-level `"skipped"` list ("real plugin part: no VST runtime here (Python 3.10–3.14 +
     Pedalboard)" / "no Vital VST3 installed here") — never counted as passed. `until()` now says what it was waiting
     for when it times out.
   - `dev/run-checks.js` prints a passing check's first `"skipped"` entry on its line, e.g.
     `✓ workbench-vst  20 s  (skipped: real plugin part: no VST runtime here …)`, so a partial pass is visible.
   - App edit: the plugin-list click without a runtime said "Install the runtime first."; it now says the same as the
     host: "Install the local VST runtime first: press Install VST runtime above."

3. **/doctor stays quick when Codex's model catalog can't be reached** (`engine-watch.js`, `engine-health.js`).
   - Cause: since Codex's engine watch, `/doctor` (and the Doctor flow's first step) calls
     `engines.codexCapabilities({ kind: 'models', refresh: true })`, which starts `codex app-server` and waits for its
     `initialize` handshake — a 30 s request time-out (`Catalog` → `Connection({ requestMs: 30000 })`). With an
     offline / stuck / fake Codex that is 30 s per check, 30–55 s per /doctor.
   - Fix: `engine-watch.js` races the catalog read against `MODELS_MS = 5000` (`within()`; `create({ modelsMs })`
     to override). Past it the status is `'slow'`; the read keeps going behind and its connection stays warm for the
     next check (the catalog's own 5-minute close is unchanged). Other failures stay `'unavailable'` as before.
     `engine-health.js` `watchText()` shows `'slow'` as: "**Astra model catalog** · couldn't check models right now
     (Codex didn't answer within a few seconds). Your models stay as they are; Check again later." The older
     `'unavailable'` line (Codex exits, signed out, offline) now starts with the same plain words: "couldn't check
     models right now (Codex, the connection or sign-in unavailable)…" — the rest of Codex's sentence is kept.
   - Tests: `dev/engine-watch-test.js` (a catalog that never answers → `'slow'` in well under 2 s, default ≤ 6 s),
     `dev/checks/flows.js` (Doctor's first step timed, must be < 25 s; the old comment about 30–55 s kept as history),
     `dev/checks/robust.js` (the /doctor card says "couldn't check models right now").

## After Codex's `codex/creative-focus` (origin/main 358f63b) — what still applies

Codex redesigned the vault into the **Sound desk** (Serum 2 + Vital only, one persistent native host over a local
socket, live audio). On merge, Codex's versions of `creative-vstmain.js`, `tools/workbench-ui.js`,
`dev/checks/workbench-vst.js` and `dev/vst-host-test.js` were taken whole, then:
- **Kept (re-applied):** the Mac case/accent fold `pathKey()` + realpath root de-duplication in Codex's new
  `discover()` (it still folded on win32 only); its unit tests now use Codex's allowlisted names (`Vital.vst3`).
- **Kept (re-applied):** the honest skip in `workbench-vst`: part 1 (Sound desk opens and says "Install the local audio
  runtime." with "Set up live audio"; a throwaway `Vital.vst3` found by name once; "Install the local audio runtime
  first" answered at once over IPC; unscanned paths / other names refused; Stop) then Codex's real Serum/Vital flow,
  unchanged, only when the runtime and Vital exist — otherwise `"skipped"`.
- **Dropped:** my vault message change ("Install the local VST runtime first: press Install VST runtime above"):
  Codex's Sound desk already shows the runtime's message with its setup button and lists no plugins without it.
- **Dropped:** the `jobMs` option: Codex's host has no per-job process any more (a 120 s socket timeout + Reset host).
- **Unchanged:** the 5 s model-catalog bound. It also covers sweep58's `robust` note: the startup engine report
  (`engine:installs` → `engineChecks().check()`) goes through the same `engine-watch.js` `check()`, so the calm
  startup notice waits at most ~5 s for Codex's catalog instead of 30 s.

## Tested

See the final report of this stream for the run list (outputs under the stream's scratch folder):
unit:winmac-test, unit:vst-host-test, unit:engine-watch-test, unit:flows-test, unit:boot-test, workbench-vst,
workbenches, creative, flows, robust, astra-ui, astra-collab, lazy.

## Risks

- 5 s for the model catalog: a real Codex that starts slowly (a cold Windows start) may show "couldn't check models
  right now" once; the read finishes behind it, so "Check again" shows the catalog.
- The real-Vital part of `workbench-vst` cannot run on this machine; it is unchanged and runs on the owner's PC.

## For the patch notes
- **Plugins are listed once on the Mac.** The Sound desk could show the same VST3 twice when a folder was added
  in another spelling (the Mac ignores upper / lower case, like Windows). Fixed.
- **The Doctor is quick again when Astra's model list can't be reached.** It used to wait up to a minute when
  offline; it now gives up after a few seconds and says "couldn't check models right now". Your models are unchanged.
- **The startup engine check doesn't wait on Astra's model list either**, so a startup notice (for example
  "Claude Code too old") shows within a few seconds even offline.
- **Tests say what they skipped.** The Sound desk test runs everything it can on a computer without the VST
  runtime and says plainly which part it skipped.
