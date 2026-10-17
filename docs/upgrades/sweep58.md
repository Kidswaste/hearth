# sweep58 (round 58): round 57's check sweep, continued

Round 57's sweep left 109 checks unrun (`docs/upgrades/sweep57-todo.txt`). Since then 12 app checks were added
(`framepace57`, `lab240edit`, eight `quest-*` checks, `workbench-vst`, `workbenches`) plus five quest unit tests.
This stream ran them on round 57's branch (c632c90), five at a time under the shared lock
(`flock /tmp/hearth-run.lock`). Three other streams shared the lock, so many batches waited 10 to 30 minutes for it.

**What ran.** After about 3 hours: 60 of the 121 app checks (the list from `liveness-ui` to `scenedoctor`, in
order) and the 6 quest unit tests. **Not run yet: 61 checks**, in `docs/upgrades/sweep58-todo.txt` (one name per
line, from `scenes` on; the 12 new checks are at the end). Run them the same way:
`flock /tmp/hearth-run.lock node dev/run-checks.js --exact $(sed -n 1,5p docs/upgrades/sweep58-todo.txt) --out <dir>`
and so on.

**Numbers.** First pass: 63 / 66 passed (3 failed: qa-sweep, robust, robust-lab). Every failure was run again alone
under the lock. After the fixes: 65 / 66 pass. The one still failing (robust) comes from Codex's engine check, so it
is listed for **codexcare58** and nothing was changed.
Required checks after the fixes: lazy, unit:boot-test, unit:datasafe-scan and unit:chatsafe-scan pass.
unit:winmac-test fails on one line in Codex's `creative-vstmain.js`, listed for **codexcare58**.

Classes: **a** the app did something wrong (fixed at the root) · **b** the check was out of date after an
intended change (updated to the new behaviour and still guards the same thing) · **c** timing under load only.

| Check | Failure | Class | Cause | Fix |
|---|---|---|---|---|
| qa-sweep | page exception "“◭ Flame line draw” has no 3D scene: pick a three.js layer or a 🧊 model" (it showed during `/pack`, after `/material`) | a | `/material` with no words opened the look picker without waiting for it. On a layer with no 3D scene, the picker's error became an unhandled rejection: a "Something went wrong" toast plus a page error, a few seconds later and under another command | `tools/three-materials.js` `command()` returns the picker's promise, so `/material` reports the error itself ("/material: … has no 3D scene …"), as the ◉ Material menu already did through its own catch. Passes alone |
| robust-lab | "the Lab preview draws with Claude as the director": lum 0 | b | labcanvas56 (round 56): the Lab's layer canvases keep no frame between draws, and the check copied the canvas with a plain `drawImage` | the probe reads the canvas through `window.__labCanvas.fresh(c)`, like labboot / labframes in round 57. It still fails on a black preview. Passes alone |
| robust | `TypeError: Cannot read properties of null (reading 'claude')` at step 0 (failed twice, the second time alone) | — (Codex) | the startup engine report (`engine:installs` → `engine-watch.js`, Codex's "Keep Astra runtime and model checks current", aa55146) now also waits for Codex's model catalog (`codexCapabilities({ kind: 'models' })`). With the fake Codex that takes longer than the check's 15 s wait for `EngineHealth.report()`. On a real Mac/PC this means the one calm startup notice (for example "Claude Code too old") waits for Codex's catalog as well | **listed for codexcare58** (not changed). Two options: report the installs first and add the model check when it arrives, or have the check wait longer, as flows does for /doctor |
| unit:winmac-test (required check) | `case-win-only`: 1 new hit, `creative-vstmain.js:14` (`process.platform === 'win32' ? p.toLowerCase() : p`) | — (Codex) | Codex's VST host (round 57 merge) treats paths as case-insensitive on Windows only; the Mac's default disk is case-insensitive too | **listed for codexcare58** |

Owned by other streams this round (not touched, not in this run's failures): labtype240 → labtype58; Codex's
workbench / VST / doctor items (workbench-vst and workbenches are still in the todo list) → codexcare58;
gameready's GPU context loss → ctxloss58.

Edits outside this stream's lane (small): `tools/three-materials.js` (labmaterials: one line in `command()`),
`dev/checks/robust-lab.js` (the pixel probe).

Tested after the fixes: qa-sweep, robust-lab, robust (alone, under the lock), lazy, unit: boot-test,
datasafe-scan, winmac-test, chatsafe-scan; `node --check tools/three-materials.js`.

## For the patch notes
- **/material on a flat layer explains itself.** Asking for a material look on a layer with no 3D scene in it now
  says so ("pick a three.js layer or a 🧊 model") right away. Before, a vague "Something went wrong" showed up a
  few seconds later, sometimes while you were doing something else.
- Behind the scenes: about half of the remaining app checks were run again. Everything else passed. The rest are
  queued for the next round.
