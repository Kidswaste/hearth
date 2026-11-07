# 🛟 A scene that crashes the preview never locks you out (round 147, safeopen147)

The owner: "vizualizer2 is even crashing and not rendering". This round makes Hearth notice a crash or hang of the Lab
preview **per scene**, recover once by itself, and after that reopen the scene in **Safe open**, pointing at the culprit.

## What existed (reused)

- **GPU loss** (glrecover43): the page keeps its scene and rebuilds the layers in place when the contexts come back; none
  back in 4 s → a new page for the same scene (`sandboxFrame` glStuck, `run({ again, quiet })`).
- **The page's process dying** (crashsafe50/51): a MessagePort `close` → `crashsafe:check` → the same "new page" path.
- **"The preview stopped responding"** banner after 8 s without stats (manual ⟲ Restart only). It never saw a hang
  *during a build* (no stats yet), and nothing ended a hung page.
- ⚡ Speed check's **Reopen in safe mode** (speed133): it *saves* 1× pixels, no AA, no shadows into `sketch.speed`.
- **Edits**: the Lab's `saver` (600 ms, and on leaving) plus the safety-net journal (whole-window crashes). The preview
  runs in its own process, so a preview crash never touched the Lab's pending save. Verified by the check; no gap found.
- **The AIs' read path**: `LabHealth` (laberrors80) adds one "health:" line to a linked chat's next Lab tool answer.

## What's new

- **`tools/three-safeopen.js` (`LabSafe`)** + `three-safeopen.css`, in the lazy **lab** group (not the first screen).
  - **Detect**: `gpu-lost` (window visible), `gpu-stuck` with `crashed`, an out-of-memory error from a layer, and a
    **hang**: no message from the page for 15 s while it should draw (visible, not parked, not on the Stage, not
    recording; a `ping` → `pong` after 2.5 s of quiet, so a dozing page isn't a hang). A hung page's process is ended
    (`crashsafe:unstick`, a new IPC in `crashsafemain.js`; only a sandbox page's process, never the window's), and the
    existing crash path makes the page again.
  - **Marker**: `localStorage hub.three.safeopen` (the app's state, never the scene): `{ name, open, n, kind, step,
    layers, at, costs }`. `open` is set when a scene opens and cleared after 5 s of healthy drawing (a clean open deletes
    the marker), on a scene switch and on a normal close; still set at the next start = Hearth went down with it. A read
    that fails writes nothing.
  - **Recover**: one crash per open → the existing recovery. A second (counted only after the first recovered), or a
    scene whose last open crashed → **Safe open**: every layer held back (`ThreeLab.safe` / `run()` leaves them out of
    what the page runs), Smooth held at its lowest step (`safe-open` message in the page), 1× pixels, no antialias, no
    shadows, filters at half (`speedMsg` override), a fresh page. Memory only; no thumbnail is taken meanwhile.
  - **Banner**: "vizualizer2 crashed last time · opened safely · [Bring layers back one by one] [Open normally] –"
    (folds to a "🛟 Safe open · 2/5" pill). Layers return lightest first (last known `LabCost` cost), the suspect last,
    one `run({ sync })` each, with the cost view (round 146) on. A crash right after a layer came back keeps that layer
    off and names it. **Open normally** clears the marker and reloads the page normally.
  - **AIs**: a `kind: 'safe'` LabHealth record → one "health:" line ("last open crashed (suspect "Heavy"); Safe open is
    on: 3 of 3 layers held back in the preview only. Don't re-run heavy code as is…"). Prompt budgets unchanged (0 tokens
    in prompts).
- `tools/three-speed-hook.js`: its "graphics card dropped the preview" chip stays away while Safe open is on.
- `sandboxFrame.load()`: a deliberate new page stops waiting for the lost one (no second remake behind Safe open's).

## Check

`dev/checks/safeopen147.js` (group `safeopen147`), on a temp-data fixture "vizualizer2" (Sky, Spinner, Heavy: Heavy's
first run in a page loses every context via `__glRecover.lose`, WEBGL_lose_context) and a "hang fixture" (a layer that
busy-loops its page). Steps: recover · marker · edit kept · safe · banner · health note · back one by one · cost view ·
culprit kept off · open normally · source byte-identical · hang → unstick → Safe open · reopen "crashed last time".
Screenshot `/tmp/hearth-checks/safeopen147.png`.

## Results

One batch (software GL, `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package`), all ✓: **safeopen147** (13 steps, 84 s),
**layercost146** (190 s), **smooth142** (136 s), **unit:lazymanifest-test**, **unit:boot-test** (first screen unchanged:
the new code is in the lazy lab group; preload gains one IPC name). The hang path: 2 hangs noticed, 2 page processes
ended, Safe open with the page answering.

## Risks / not done

- A GPU reset that has nothing to do with the scene, while the window is on screen, counts as that scene's crash: two in
  one open (or one, then the next open) give Safe open. Hidden-window resets are ignored.
- Killing a hung preview process also restarts any other Lab page sharing that process (the warm page, backstage);
  each comes back through its own crash path.
- The suspect is "the layers not yet drawn when it crashed", or "the layer just brought back"; a crash mid-play with
  every layer drawn names no suspect (all layers are held, scene order).

## For Codex

Nothing. No Codex-owned file touched.
