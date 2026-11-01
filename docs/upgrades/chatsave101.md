# chatsave101: should long chats save by what changed? Measured: no (round 101)

Round 100 (`perf100.md`, "What's left") noted that a long chat under 800 messages is saved **whole** on every change:
the window sends the whole chat (≈ 600 KB for 778 messages) to the main process, which hands it to the store thread.
It estimated ≈ 68 ms from the call to "written", most of it copying. Giant chats (≥ 800 messages, `BIG_MSGS`, or opened
as bytes) have saved by change since round 82 (`chatDelta`, `bigchat82.md`).

This round measured that path piece by piece, built the change (option 1: extend `chatDelta` down to 100 messages),
proved it byte for byte, and A/B-tested it in the app. **The app shows no measurable win**, so the change is **not
shipped**. `native.js` and `storework.js` are exactly as at round 100. What ships is the measurements: a bench, a new
perfguard measure, and a test of the delta path against whole saves.

## Measured
### Node: each piece of one save
`node --expose-gc dev/chatsave101-bench.js --file /tmp/hearth-bigprofile72/chats/claude-long10.json`. This is the
752-message, 567 KB chat that perfguard sends in. Medians of 200, with the real modules and the real store thread.

| Piece | Whole save | By change |
|---|---|---|
| window: structured clone out (IPC send) / the shape compare | 0.79 ms | 0.15 ms |
| window: the shape made, once after a whole save | — | 0.19 ms |
| main: clone in + clone out to the thread | 1.45 + 0.90 ms | ≈ 0.02 ms (one message) |
| thread: clone in, `JSON.stringify` (pretty), sha1 | 0.94 + 1.45 + 0.71 ms | — |
| thread: the op, round trip with its fsync | 9.3 ms | 6.5 ms (first change: read + cut) · 4.3 ms (next) |
| window memory held per long chat (its shape; strings shared) | — | ≈ 280 KB |

So by change would save ≈ 3 ms of window + main-process CPU per save and ≈ 3–5 ms of store-thread time. The fsync
dominates both ways. None of it is a long task.

### The app: perfguard A/B against round 100 (ba7bcc8), app part, 4 launches per side
`perfguard.js --ab ba7bcc8 --only app --runs 4`, with the change in place (`DELTA_MSGS = 100`). Same probe on both sides.

| Measure | Round 100 | By change from 100 messages | p | Verdict |
|---|---|---|---|---|
| A mark in a long chat → on disk (`chat.markSaved`, new) | 7.55 ms | 7.85 ms | 0.44 | same |
| A mark: CPU, main + window, per save (`chat.markCpu`, new) | 14 ms | 18.5 ms | 0.29 | same (noisy) |
| Send in a long chat → on disk (`chat.sendSaved`) | 40.7 ms | 54.3 ms | 0.27 | same (noisy) |
| Send turn: CPU, main + window (`chat.sendCpu`) | 385 ms | 410 ms | 0.07 | same |
| A long chat saved whole: call → written (`chat.saveIpc`) | 22.6 ms | 26.0 ms | 0.19 | same |

The rest of the app part was "ok" or "too close to call" (project open / switch, ±100 ms of noise on a box at load 2–3).
Nothing came out better. Exit 3: inconclusive overall, 0 better.

### Why round 100's 68 ms was misleading
Round 100's probe saved the chat whole (`chat.saveIpc`) **right after each send turn**, while the reply's own saves and
drawing were still going. In this round's first A/B (round 100's probe, cut short when the problem showed) that was
still 61–84 ms. Measured 300 ms later, after the sends, the same whole save is **≈ 23 ms** from call to answer. A
change saved through the window's own path reaches the disk in **≈ 7.5 ms**. The copying of a 600 KB chat is a few ms,
not ≈ 55 ms.

That probe order also broke the experiment: a whole save without a version, between sends, makes the thread refuse the
next change, so every send's first save went whole again. The probe now does `chat.saveIpc` after the sends.

## Decision
Options weighed:
1. **Extend `chatDelta` down to normal chats** (built and A/B-tested). It's correct, since every guard is the existing
   one. But it gains ≈ 3 ms of CPU per save that the app can't show. It costs ≈ 280 KB of window memory per long chat,
   moves ≈ 100 more chats per profile onto the delta path, and adds a store-thread cache to bound (`bigs`, which had a
   64-entry cap in the build). **Not worth it.**
2. **Send only the changed messages and write the whole file on the thread.** The thread would have to keep every long
   chat parsed and still stringify it whole. It saves the same ≈ 3 ms at more memory and new code.
3. **Move the copy off the window thread.** The window's part is 0.8 ms.

None of them cuts anything the owner can feel. The line stays at `BIG_MSGS = 800`.

## What ships
- **`dev/chatsave101-bench.js`**: the table above, for any chat (`--file`). Run as plain Node. The comparison runs in
  one realm: in a `vm` context, objects crossing realms made the compare ≈ 25× slower than in the window. A first
  reading of 3.9 ms came from that.
- **perfguard** (`dev/perfguard-probe.js`, `dev/perfguard.js`):
  - New `chat.markSaved` / `chat.markCpu`: a bookmark toggled on an old message of the long chat through `Native.save`
    → on disk (×10), and its CPU per save.
  - `chat.saveIpc` now runs after the 5 sends, not between them.
  - `chat.sendSaved` reads lower than round 100's baseline for that reason (≈ 40 ms instead of ≈ 85 ms on this box).
    `dev/perf-baseline.json` was **not** rewritten, so whoever rebaselines next should expect that step.
- **`dev/chatsave101-test.js`** (`unit:chatsave101-test`, group `chatsave101`): native.js's real `saveChat` /
  `saveWhole` / `takeShape` / `shapeOf` / `sameShape` (read from its source) run against a copy of the real store
  (`store.js` + its thread). The old way (every save whole) runs against a second copy, through the same steps. After
  every step both files must be byte for byte the same. **87 checks** at the shipped line (800); with
  `--line 100` it reruns this round's experiment (also 87 / 87). Run with seeds 101, 7, 42, 1234.
  - **Every edit kind**:
    - exchanges: a new exchange, a streamed reply finishing;
    - reactions: added, a note, removed;
    - edits: an edit, edit-from-here (trunc + a new end), retry;
    - deletes: in the middle, at the end;
    - pins: pin / bookmark a message, the chat pinned;
    - the chat's own fields: renamed, its model and session changed, a field gone / added / `undefined`, the field
      order changed;
    - whole-list changes: a message replaced, the same content in new objects (nothing sent), six saves in flight at
      once, cut to 2, emptied, filled again.
  - **Every refusal**, each saved whole and then by change again:
    - another writer;
    - the file changed by another program, gone, or compact;
    - sync's guard wanting it (each whole save went through the guard);
    - sync writing it: `store.settle` holds the save until the write;
    - a change on its way when `settle` starts: it lands first.
  - A chat never read in this session is saved "blind" (datasafe), with no version: its next change is refused and
    it's saved whole once more.
  - A **random walk**: 300–400 steps, saves fired without waiting, another writer now and then. Every step must match
    the whole-save file, and the file must be the window's chat as JSON.
  - The chats list rows and the chats search match the whole way. `chats:get` right after a change waits for it.
  - Sabotage check (at line 100): dropping the changed own fields from the window's change gave 26 failures.

## Checks
All app checks ran under `flock /tmp/hearth-run.lock`, at most 5 per run, with `TMPDIR=/tmp/cs101` (since removed).

| What | Result |
|---|---|
| `node dev/chatsave101-test.js` (seeds 101, 7, 42, 1234; `--line 100` too) | ✓ 87 / 87 each |
| perfguard A/B against ba7bcc8, `--only app --runs 4` (29 min), with the line at 100 | no regression, nothing better, 4 rows too close to call (exit 3) |
| `chatwindow72 chatwindow86 (CHATWINDOW86=1) bigchat84 (BIGCHAT84=1) chatkeep versions75` (shipped tree) | 4 / 5; chatwindow86 held one 77 ms task scrolling to the top (budget 60; its code is round 100's, unchanged). Run again alone: ✓ (a 61 ms task put down to the box's load) |
| `sync72 keptaside94 lazy` | ✓ 3 / 3 |
| unit: `chatsave101-test bigchat82-test bigchat84-test chatwindow86-test chatcalc87-test store-thread-test syncrace98-test syncsweep97-test storeack77-test sync72-test versions75-test datasafe-scan winmac-test errorcalm-scan storeack-scan chatsafe-scan chatwin-scan boot-test lazymanifest-test` | ✓ 19 / 19 (also 19 / 19 earlier with the line at 100) |

The first screen is unchanged: **1686 / 1696 KB**, 64 scripts (`unit:boot-test`). No first-screen file changed.

## For Codex
Nothing in Codex's files changed.

## What's left
- Nothing here for long chats under 800 messages: a change reaches the disk in ≈ 7.5 ms and costs ≈ 15 ms of CPU
  (main + window).
- If perfguard is rebaselined, `chat.sendSaved` / `chat.saveIpc` will step down: their probe order changed (above).
  That isn't a speed-up of Hearth.

## For the patch notes
- No change you'll notice. We checked whether saving long chats could be made faster. Saving a message in a long chat
  already takes less than a hundredth of a second, and the faster way made no difference you could measure, so we kept
  the way that works.
