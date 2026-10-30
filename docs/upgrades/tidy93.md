# tidy93: four leftovers from round 92

Round 93. Four small things that round 92 (syncpanel92, labchat92) and round 88 (labsync88) left open. Each one has its
cause, what was done and how it was checked.

## 1. sync72's "nothing polls while the panel is open" step could never fail

**Cause.** Step 2 of `dev/checks/sync72.js` wrapped `window.hub.sync.status` / `conflicts` / `preview` to count calls.
`window.hub.sync` is the read-only contextBridge object, so the assignments did nothing. Sync and the panel kept calling
the real functions, so the count was always 0.

**Fix.** The step now counts every call through the `Sync._setApi` / `SyncPanel._setApi` seam that syncpanel92 added.
A Proxy forwards each call to the real bridge and counts it. Before the 4 s wait, one `Sync.refresh()` has to show up as
exactly one counted status read. That is a new step, "the poll counter sees calls", so a seam that stops carrying calls
can't pass quietly. The seam is restored afterwards (`_setApi(null)`). Calls other than status / conflicts / preview are
listed in the step's detail (`other`).

**Proof.**
- On the real code: the counter saw `{"seam":true,"probe":{"calls":1}}`, then `{"status":0,"conflicts":0,"preview":0}`
  over 4 s. Pass.
- With a poll added to `SyncPanel.open()` on purpose (`setInterval(() => api().status(), 1000)`, not committed):
  `✖ open for 4 s with nothing changing: no status / conflict calls (no polling) · {"calls":{"status":4,…}}`. The step
  fails.

## 2. First run didn't flag "folder emptied" or "too old" as "to fix"

**Cause.** `firstrun-core.js` `syncRow` marked the sync line "to fix" only for `state: 'error'` or `offline` +
`error: 'missing'`. An emptied cloud folder (`emptied`) or a Hearth too old for the cloud copy (`old-version`) showed
**Ready**, even though the sync panel shows them as "⚠ Folder" / "⚠ Update". Also, the read failure of this computer's
own sync records (`held`) showed **Ready**. Sync is waiting in that case, so "Ready" was wrong too.

**Fix** (`firstrun-core.js`, lazy group `firstrun`):

| Sync state | Before | After |
|---|---|---|
| folder missing | To do, Choose the drive… | same |
| folder emptied | **Ready** | **To do**, Choose the drive… |
| this Hearth too old | **Ready** | **To do**, **Check for updates…** (the existing `update` action: Updater.check) |
| own records can't be read (`held`) | **Ready** | **Good to know**, no button (it retries by itself). It is never "empty" or "offline". |
| plain offline | Ready | same |

The line's text is still Sync's own sentence (`Sync.line()`), the same as the panel's.

**Proof.**
- `dev/firstrun-test.js` (`unit:firstrun-test`, 18/18): emptied / old-version are "fix" with their buttons; held is
  "note" with no button; plain offline is "ok".
- `dev/checks/firstrun.js`, new block: made-up engine statuses through `Sync._setApi`. Nothing is read or written. The
  results:
  - **Check this computer** shows:
    - emptied: To do, "The Hearth folder in iCloud Drive is empty right now (your cloud drive may be starting over).
      Sync is paused; nothing here was deleted.", Choose the drive…
    - missing: To do, Choose the drive…
    - too old: To do, "Update Hearth on this computer: …", Check for updates…
    - held: Good to know, "Sync is waiting: Hearth can't read its own sync records on this computer right now. Nothing
      was changed; it tries again by itself.", no button.
  - **Set up this computer** (the first launch) shows the emptied folder as To do too.

## 3. The ResizeObserver loop in labsync88

**What was asked.** labsync88 once hit an uncaught "ResizeObserver loop completed with undelivered notifications".
Find the observer, reproduce the error and fix it.

**Reproduction: not reproduced.** There is no log of the original failure in the repo history or in the check output
folders. The runs, all with a probe (below):
- labsync88 six times, with 4, 8, 8, 8, 6 and 6 busy CPU processes (`--burn`);
- syncpanel92 once;
- a stress script that opened the Lab and set 120 random window sizes in a row (some a frame apart, some 0–40 ms
  apart), with Focus mode on and off. It then did 60 more sizes on a chat.

None of them hit the error.

**The probe** (diagnosis only, not committed) ran in every frame from page start. It wrapped every `ResizeObserver` and
flagged a callback that did any of these:
- changed the size of any observed element, during the callback or in the microtasks it queued (they run before the
  next delivery);
- observed a new element during the callback.

These are the two ways Chromium gets to this error. It found **0 hits**. The callbacks that ran included the Lab
preview's stage layout (43× under stress), the onion skin, the A/B compare overlays, the warm-page watcher, the
timeline, the sequence and the node editor. None changed an observed size.

**Code read** (every `new ResizeObserver` in the app): the observers that write in their callback only move
absolutely-positioned overlays (abcompare `place`, three-try `place`, the onion), write labels and classes that don't
change the observed box (three-media `layout`), or size a canvas whose CSS size is fixed (triggers, timeline, sequence:
`contain: strict`). The rest defer their work to a timer or the next frame (three-boot, chat-rest, grid-resize, panel,
tour, nodes, chromeview's resize call). No callback changes its own target's size.

**What changed.** No app code changed, because no loop was found to fix. The error was **not** added to any noise list.
To catch it if it comes back, `dev/checks/labsync88.js` now names the observers of every observer made after it starts
(the Lab's). On a loop error, a step fails and lists the observers whose callbacks ran in that frame, with the file and
line where each was made. The callbacks are called as they are, with no layout reads. To test the recorder, a
deliberate self-resizing observer was added for one run (not committed). The step failed and named it:
`✖ no ResizeObserver loop … [["<anonymous>:139:121 ×1"], …]`.

## 4. "8 quick AI edits while the owner types": 4 s → 7 s

**The guess** was that the owner's own layer now re-runs as they type. **It doesn't.** It runs once after their last
key, with the 700 ms debounce that was already there. It runs one more time only when the half-typed code doesn't parse:
the sliders' fallback run, once per broken text.

**Measured** (labchat92 step 5, this box: 4 CPUs, SwiftShader). Each layer's hot runs are now logged, tagged by layer:
`ThreeLab.live` log entries carry `layer`.

| Run | Total | Each edit call | Hot runs |
|---|---|---|---|
| Round 91 (`--app` copy of 7968a7b) | **3.9 s** | 124–155 ms | 18. Ring ended **broken**: `SyntaxError: Unexpected token '*'` |
| Round 92 / this round, as is | **6.6–6.9 s** (4 runs) | 377–811 ms | Ring 8, Base (the owner's) 2 |
| …with the owner's auto-runs turned off (temporary) | 7.3 s | 454–723 ms | Ring 8 |
| …with no typing at all (temporary) | 7.5 s | 470–828 ms | Ring 8 |

**Where the time goes.** In round 92, each call spends 300–530 ms in `page:ran`. That is the Ring layer's new code
loading and building in the preview, with its first frame right after. Then there is the 100 ms grace.

Round 91 was faster for the wrong reason. The owner's keys landed **in Ring** (the bug labchat92 fixed) and broke it at
character 5 (`impor/*busy*/t`). From then on, every AI edit's hot run failed with a SyntaxError within milliseconds. The
check answers on the first `error` / `drawn` message, so each call took about 130 ms. The pairs of runs 5–7 ms apart in
round 91 (18 runs) are each failed run plus the sliders' fallback.

In both rounds, about 2.2–2.3 s after the last call is the fake engine streaming its "MCP calls:" report. That is the
test harness, not the app.

**What changed: nothing to coalesce.** The owner's runs aren't the cost: turning them off didn't make it faster. The AI
edits arrive one call at a time, and each waits for its own result: whether the layer runs, its errors and console
lines. Batching them would mean answering an edit before its layer has run. That would drop what labchat92 guarantees
the AI learns. So no app behaviour changed, and every labchat92 guarantee is untouched: the owner's typing is never
overwritten, the cursor stays, and a stale rewrite is refused. Before/after for this round: 6.7 s → 6.8 s (the same
code, run to run).

The check keeps the measurement:
- `out.many` gives `callMs`, `runsBy` (hot runs per layer) and `runsAt`.
- `out.manyTime` gives each call's start + length, the last call's hop steps and the reply's tail.
- A new step fails if the owner's layer is re-run per key: Base ≤ 3 runs while 8 edits land on Ring.

## Runs (final code)

All passed:
- **App checks** (under the run lock): `sync72`, `syncpanel92`, `labsync88`, `labchat92`, `sync`, `lazy`, `firstrun`.
- **Unit tests and scans**:
  - Unit tests: `unit:firstrun-test`, `unit:labchat92-test`, `unit:sync72-test`, `unit:winmac-test`, `unit:boot-test`
    (first screen **1744 / 1751 KB**, the same as on the round-92 base: none of this round's files is on the first
    screen), `unit:lazymanifest-test`.
  - Scans: `unit:datasafe-scan`, `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`,
    `unit:chatwin-scan`.

## Files

- `dev/checks/sync72.js`: the poll step through `_setApi`, and a step that shows the counter sees calls.
- `firstrun-core.js` (lazy, `firstrun`): the sync row. `dev/firstrun-test.js`, `dev/checks/firstrun.js`: the new cases.
- `dev/checks/labsync88.js`: names the observers on a ResizeObserver loop.
- `tools/three.js` (lazy, `lab`): the live log's hot runs say which layer they were (dev counters only).
  `dev/checks/labchat92.js`: per-layer hot runs, call timeline, the no-run-per-key step.
- Not touched: sync.js, sync-panel.js, sync-engine.js, cloud-files.js, smoke.js and every Codex-owned or
  creative-direction file. perf93's areas (startup and idle) are not touched either.

## For Codex

Nothing. No Codex-owned file was changed.

## For the patch notes

- **"Check this computer" now flags sync problems it used to miss.** If your cloud folder was emptied, or this Hearth
  is too old to read what your other computer synced, the Sync line says "To do" with the right button: "Choose the
  drive…" or "Check for updates…". Before, it said "Ready". When Hearth can't read its own sync records for a moment,
  it says so and waits, without calling it ready.
- Behind the scenes: one sync safety check really checks again (that the sync panel doesn't keep asking for updates
  while it's open), and two other checks now say more when something goes wrong.
