# bugbash3 (round 48): the full suite after rounds 44–47

The whole suite on `claude/intelligent-galileo-yaiqem` at ea03b29 (rounds 44–46 and Codex's Astra round 47), plus the
Astra tests that sit outside it. Four other streams ran checks on the same 4-CPU machine (load 3–17), so every failure
was run again alone before it was called a bug.

## What ran
- **Electron checks:** 260 (`node dev/run-checks.js --names all`, in parts of 24 with `--exact`, two parts at a time).
  First pass: **230 passed, 30 failed.**
- **Node tests (unit):** 123 / 123 passed.
- **Outside the suite** (Codex's): `dev/codex-capabilities-test.js`, `codex-server-test.js`, `codex-usage-test.js`,
  `codex-workspace-test.js`, `dev/astra-connect-smoke.js`, `dev/astra-workspace-smoke.js`, plus `swarmlean-test` and
  `winmac-scan`, which no group lists. `codex-server-test` failed (fix 3). The rest passed.
- **After the fixes,** each of the 30 ran again alone: all 30 pass. particles needed fix 5. motion-in passed on its
  second run alone. My edits were also checked with lazy, qa-commands, fastboot, sync, twocomputers, director-tools,
  unit:boot-test and unit:twocomputers-test (8 / 8).

## Fixes
| Check | Symptom | Cause | Fix |
|---|---|---|---|
| liveness-ui, access-astra, access-chat (and astra-collab, astra-ui, below) | "Astra: 2 spawned agents kept", "Astra is still answering", a file Astra should have written missing | Since Codex's app-server work (acae12e), Hearth talks to Codex through `codex app-server` by default. The Electron checks' fake (`dev/fake-codex.js`) only speaks the old `codex exec` JSONL, so every Astra reply in a `--fake-engines` check failed to start. | `dev/smoke.js`: `--fake-engines` sets `HEARTH_CODEX_TRANSPORT=exec` (the exec transport is still in the app: `codexTransport: 'exec'`) unless the caller set it. The app-server path keeps its own fixture (`fake-codex-server.js`). Verified with liveness-ui and access-astra before and after. |
| astra-collab, astra-ui | "check still running after 90 s" | Same cause: `dev/astra-smoke.js` runs `fake-codex-astra.js` (exec only) without `--fake-engines` | `dev/astra-smoke.js` passes `HEARTH_CODEX_TRANSPORT=exec` (unless set). Both pass. |
| codex-server-test (outside the suite) | `spawn …/dev/fake-codex-server.js EACCES` in the "default engines.send uses app-server" group | The fixture was committed without its executable bit (Codex works on Windows, where it isn't needed). On Linux and the Mac it can't be started. The astra-connect / astra-workspace smokes start it the same way. | `git update-index --chmod=+x dev/fake-codex-server.js`. All 12 groups pass. |
| (silent: a console warning at every start) | `/astra-tools is taken; the director's version isn't registered` | Round 47's Astra tools window (`astra-connect.js`) registered `/astra-tools` first. The director's `/astra-tools on / off` (hub tools for an Astra director, round 22) was dropped, so `/astra-tools on` opened the Astra tools window instead. | `director-cmds.js`: the director's version shares the name through `when` (on / off / yes / no…), the way `/play` and `/ref` share theirs. `/astra-tools` alone still opens the Astra tools window. The command's description lists both. Probed: two variants, and `on` goes to the director's. |
| (silent: a console warning at every start) | `Lazy: /this-computer (twocomputers) wasn't registered by its module` | `twocomputers.js` registered `/this-computer` from `init()`, a timer after its file ran. The lazy loader had already dropped the stand-in by then. The command came back a moment later, but a press in that gap found nothing. | `twocomputers.js` registers the command as the file runs. The warning is gone (astra smokes, a plain start). |
| cachewise | "the reply's token line says what the cache saved" | Round 47 (Codex, `meter.js`) reworded the token line on purpose: "725 input tokens (673 from cache, 93%)" and "· 673 cached" on the badge, in place of "≈ … saved by the cache". | Check only: it accepts the new wording (it still needs the cached amount and its share). |
| particles | "a kick bursts them": before 0, after 0 (2 of 2 runs alone, a timeout in the full pass; also 1 of 2 on ccd3360 and 0 of 2 on eb96416, so it isn't from round 46) | In the preview, a particle layer started again from its warm-up whenever more than 0.5 s of simulation was due (30 steps), meant for seeks. A slow frame did that too, wiping the particles a kick had just burst (a probe saw steps jump 167 → 249). | `tools/three-sandbox.html`: the preview restarts only after more than 2 s, and the catch-up already there skips the time in between. Renders (`exact`) are unchanged. 3 of 3 passes after. |

## Also added
- `SMOKE_WARN=1 node dev/smoke.js …` (or the same before `run-checks.js`) lists the page's `console.warn` lines after
  the verdict, never as a failure. It's how the two warnings above were found. With it on journey-lab, journey-chat,
  kinetictype, labdirect, budget and chat-stream, only the known ones are left (below).

## Load flakes (failed in the full pass, passed alone; nothing changed for them)
aicheck, aiundo, bgperf (the layer after a zoom), budget, capture-lab ("the moving Lab sends frames"), capture-pack
(the drawn cursor), commands-page (`.cp-use` not on the page yet), comp (same-frame 2.34 vs 23.13), gallery, labadapt,
lab3d-models, labframes (frame 44 for 45), labkeys, labpace, live (the restart cover's picture came after 700 ms),
lookmatch, makes, motion-in (passed on its second run alone), motion-render, music ("Make it react" asked before the
sketch's sliders were there), offline, physics, reach-open (the permission card), and the 3 Astra checks above. Some
of these (aicheck, aiundo, budget, offline) use Astra, and the transport fix had landed before their rerun, so for
those two the cause is "load or the transport".

## Looked at, all right
- **/ref and the meter's palette lines after Codex's lazy-label change** (`b67e40e`: command lines' labels are now
  read from the live definition). A probe of `AppUI.actions()` after start and after the board group loads found
  1,311 lines, none empty or doubled. `/ref —` shows both meanings (the board's vibe, and the @ reference). Every meter
  line is there (Token dashboard, budgets, most expensive chats, exports…). board-chat, appsearch, qa-commands, lazy
  and fastboot pass.
- Unhandled rejections and page errors in every log: none beyond the checks' own on-purpose ones (scenedoctor's
  throwing test scene).

## Still failing now and then
- **kinetictype: "render two frames twice from the export page: identical bytes"** passed in the full pass and
  failed once in a later batch (load ~3). The failing pair: same `[false, true, false, true]` with equal JPEG sizes
  (1563 / 1723 bytes). The 3.6 s frames differ between the two renders, but each render agrees with itself (frame 0 ==
  frame 2). So it's a small difference in one export page, not a different time. Two probes that rebuild the check's
  scene and render 8 pairs right after the presets were added did not reproduce it. Between the renders, the layers'
  code, their sliders, the beat grid and the song's analysis did not change. My guess: one export page's
  font / SDF atlas or the kinetic math finishing after its first frame on a busy machine (fonts wait at most 6 s, the
  math 30 s). Not fixed: I had no reproduction to test a fix against.
- **Pre-existing warnings at every start** (no effect seen): `/director-engine is taken` (`astra.js` has its own
  `/director-engine [three|video] [claude|astra]`, which does the director's job too) and `Add-ons: /memory, /remember,
  /forget are taken` (chat-memory owns them).

## For Codex (Astra; not changed here)
- The Electron UI checks now drive Astra through the **exec** transport, because `dev/fake-codex.js` and
  `fake-codex-astra.js` don't speak `app-server`. The default transport is covered only by codex-server-test and the
  astra-connect / astra-workspace smokes. Their scenarios (subagents, offline, access, long tasks) never run through
  app-server. Teaching the fakes `app-server` would bring that coverage back.
- The app-server fixture needed its executable bit (fixed here). Anything else spawned directly from `dev/` must keep
  `100755` in git.
- `/astra-tools` is now shared with the director's on / off. If the Astra tools window ever takes arguments, keep
  on / off free or rename one of the two.

## Edits outside this stream's lane
`director-cmds.js` (a `when` on one command and a guard in its register loop), `twocomputers.js` (where one command is
registered), `tools/three-sandbox.html` (one threshold in the particle step), `dev/smoke.js`, `dev/astra-smoke.js`,
`dev/checks/cachewise.js`, and the git mode of `dev/fake-codex-server.js` (Codex's fixture, mode only).

## For the patch notes
- `/astra-tools on` / `off` gives an Astra director its hub tools again (round 47's Astra tools window had taken
  the name). `/astra-tools` on its own still opens the Astra tools window.
- Particle layers in the Lab preview no longer start over after a slow frame, so sparks that just burst on a kick
  stay on screen. Renders were never affected.
- `/this-computer` is ready right away after start (it was missing for a moment).
- Behind the scenes: the self-checks drive Astra again (its new connection had made every Astra step in them fail),
  one Astra test fixture can be started on a Mac, and the checks can now list the app's warnings too.
