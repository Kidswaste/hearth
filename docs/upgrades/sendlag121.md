# sendlag121: sending a message no longer holds the main process (round 121)

The owner's screen runs at 240 Hz. While the main process is busy, every IPC message from the window waits, including
the typing echo and the first words of a reply. Round 114's chatwindow86 runs showed a **107 ms** hold in the "send"
step, "the main process writing token stats (store.js)". This round measured every hold of 8 ms or more during a send,
the first token, streaming, the reply's end, and a sync arrival during a reply. It then moved what was the app's own
work off the main thread.

## Before → after
All runs are on this box (4 CPUs, shared with other streams' runs), with the giant chat (bigchat84's 63 MB fixture)
open windowed and the fake engine. "The meter's numbers" means a made-up year of `kv/token-stats.json` (≈ 1 MB: 365
days, 4,000 chats), the owner's scale. "App" means the CPU profile's time in Hearth's own lines in one hold. The
engine's process start, the test probes and GC are counted apart (see "What is left").

| Moment | Before (round 120's code) | After |
|---|---|---|
| A reply's end, first reply of the run | 37 ms block: `dayKey` 12 ms (Intl loading its locale data), stats stringify 6 ms, stats / usage read 4 ms (round 114: 107 ms) | no app block ≥ 8 ms |
| A reply's end, later replies | 14–15 ms (stringify 8 ms, read 3–5 ms) | the meter's read 4–8 ms (exploration run) → 0 (the text from the store thread, parsed in the window) |
| A reply's end with sync on | 69 ms block (stats 37 ms + a sync read 9 ms) | no app block from the stats |
| `addUsage` alone, Node, 800 KB stats, 10 replies | 28, 12, 7, 10, 9, 11, 5, 6, 6, 15 ms | 8.8 (first: module load), then 0.1–0.4 ms |
| Sending (engine:send) | config read and joined twice | once |
| First token, streaming | no app hold ≥ 8 ms (GC, Electron's IPC internals) | same |
| First message of a run: tool-set measure (mcp/cost.js) | 13–40 ms at send | done when the chat is shown, at an idle moment |
| chatwindow86 send / reply2 / reply3: the app's largest hold | 22+ ms of app at the reply's end | 0–16 ms (the engine's start: prompt + spawn); last run 0 app ms over 8 |

The holds were measured with the new per-hold watcher (`mainlag-probe.js` stalls, `HEARTH_LOOPLAG_MIN=8`). It splits
each hold into the main thread's wait for a CPU and its own time, as `dev/loadwait.js stallWatch` does. Each hold is
then matched to the CPU profile's busy stretches over it. The exploration script is
`dev/checks/chatwindow86.js`-shaped and was not committed; its phases were send, a second send, a "long" reply (13 s of
streaming), then sync on (a temp cloud folder), and a "long" reply with notes.json and token-stats.json arriving from
"the other computer" 1.5 s in.

## The culprits
Main process, holds of 8 ms or more:

1. **The reply's end: `dayKey`** (`store.js`). `toLocaleDateString('en-CA')`: its first call in the main process loads
   the locale data (12 ms here, most of round 114's 107 ms on a busier box), and each later call builds a new
   formatter.
2. **The reply's end: the token stats.** `addTokenStat` read and parsed `kv/token-stats.json` with a sync read, added
   the reply, and ran `JSON.stringify` of the whole file on the main thread (6–8 ms for 1 MB; 37 ms with sync on). Only
   the write itself was async (round 65).
3. **The reply's end: usage.json.** A sync read and parse on the main thread (small, but a sync read waits on a busy
   disk: holds of 20–30 ms with ~1 ms of CPU were seen).
4. **The reply's end: the meter's read.** meter.js asks for the stats after every reply. `getTokenStats` read and
   parsed the whole file on the main thread (4–8 ms for 1 MB), and then IPC copied the object.
5. **Sending: the config.** `engine:send` called `settings()` and `readConfig()`. Each one parses config.json's text
   and joins it with the defaults.
6. **Sending: the engine's process start** (`spawn`, 5–25 ms). Linux copies the big Electron process's page tables.
   Every app that starts a CLI pays this. It is not fixed here (see What is left).
7. **First message of a run: the tool-set measure** (`mcp/cost.js defOf` / `report`, 13–40 ms). chat-cost.js (at
   send) and the send preview ask what each tool set costs. The first ask compiles each MCP server's definitions
   (memoized afterwards).
8. **A sync arrival during a reply** (all in `sync-engine.js` / `sync-merge.js`, Codex-owned): the folder walk's
   `statSync` / `readdirSync` (12–26 ms per stretch), `same()` (16–33 ms), `canon` (14 ms), `localHash` (15 ms),
   `writeFlushed`'s fsync on the main thread (40 ms), `localOnly` (22 ms). Some of the stat time is the probe's own
   stack capture per sync fs call. See "For Codex".

Not culprits: chat saves during the reply (giant chat: by change, on the store thread since round 82), JSON of the
chat (never on the main process), streaming (the main process only forwards events), crashsafe's journal (no hold ≥ 8
ms seen).

## The fixes
- **`tokenstats-core.js` (new).** The meter's numbers as pure code (`statInto`, `bump`, `addAll`), moved from store.js
  unchanged and shared with the store thread. `dayKey` builds `YYYY-MM-DD` from `getFullYear / getMonth / getDate`.
  Its output is identical to `toLocaleDateString('en-CA')`; this was checked every ~90 minutes from 1970 to 2033 in
  UTC, Los Angeles, Kolkata and Kiritimati.
- **Token stats on the store thread** (`store.js addTokenStat` → `storework.js tokenStat`):
  - Each reply's numbers are queued and handed over a moment later (batched).
  - The thread reads the file the same careful way (datasafe's load) and keeps it while the file stays as it left it
    (size, time and inode). It adds the numbers and writes the file as before: compact, temp file, flush, rename.
  - A file that can't be read is not written over, and it is noted in doubt (as `readJson` did). A missing or
    never-built file is not created here (the meter builds it).
  - The main process never reads, parses or stringifies the stats.
- **usage.json by change** (`addUsage` → `mergeFile`, the round-75 `mergeKV` path, now for any file). The reply's counts
  go as `inc` ops, applied on the store thread. Where the thread can't take them (sync's guard wants usage.json, a save
  of it on its way or held, the file missing or unreadable, no thread), the old code runs on the main process. What
  is saved is the same, field for field and in the same order. `getUsage` reads after the counts on their way.
- **The meter's read as text** (`usage:stats` → `store.getTokenStatsText`). The store thread answers with the JSON
  text, and preload.js parses it in the window. Anything but a plain good read (the file in doubt, unreadable, missing,
  not built, no thread) goes through `getTokenStats` on the main process, as before.
- **The config read once per message** (`main.js engine:send`).
- **The tool-set measure warmed when a chat is shown** (`chat-cost.js`): asked at an idle moment
  (`requestIdleCallback`, once per agent setup). The first message then finds it made. The send preview's measure
  shares the same memo.

### Durability
- **What is saved:** the same files, the same shape, the same numbers. `sendlag121-test` compares the thread's file key
  for key with the old way's.
- **A crash mid-reply:** the reply's numbers are written right after it ends, as before (one `setImmediate` later). A
  crash mid-reply loses the same as before. crashsafe's journal is untouched.
- **Quit:** `flushSync` waits up to 5 s for the thread's finished-batch count (`statsSab`, as round 82 does for giant
  chats' deltas). It then adds whatever batch was not finished, and whatever was still queued, on the main process. Each
  reply is counted once.
- **Sync:** `store.settle(token-stats.json)` pings the batches already on the thread. Batches not yet sent wait until
  sync's write is released, then add to what arrived. The thread sees the new file (its size, time or inode changed)
  and reads it again.
- **A failed read is never "empty":** the stats are never rebuilt over a file that can't be read (datasafe-test,
  sendlag121-test). `choiceWrite` and the guard bases are untouched.

## Budgets
- **chatwindow86** (`send`, `reply2`, `reply3`; `sendHold: 20`):
  - each main-process hold is listed with its own time and what ran;
  - a hold fails when its own time (without the wait for a CPU) is over 20 ms **and** the app's own lines in it are
    too;
  - the engine's process start, the probes' wrappers, GC and Electron's internals are listed as known.
  - Round 120's code fails this budget at the reply's end (22+ ms of app, 107 ms in round 114).
  - This round's code reaches 0–16 ms: the largest is `engines.js send` building the prompt and starting the process
    on the first message (14 ms once).
  - `HEARTH_LOOPLAG_MIN: '8'` is added to chatwindow86's env.
- **`dev/sendlag121-test.js`** (new, in UNIT and the `sendlag121` group), with no app:
  - 40 replies on a year of stats: each `addUsage` call and each loop hold is under 8 ms of the main thread's own time
    (stallWatch, × the box factor);
  - the files equal the old way's;
  - the meter's read right after a reply (object and text);
  - quit with batches queued and on the thread (each once);
  - a garbled file (not written over, in doubt, "can't be read");
  - a missing file (not made);
  - sync writing the file (the reply waits, then adds to what arrived).

## Tests run
All under `flock /tmp/hearth-run.lock`, with `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package CHATWINDOW86=1
BIGCHAT84=1`:
- `chatwindow86`, four runs while tuning:
  1. The new budget's first draft counted a hold of 45 ms, mostly the process start, as the app's. The judging changed
     to the app's own lines.
  2. A 13 ms hold of the first tool-set measure, at 12 ms. This led to the warm in chat-cost.js.
  3. 16 ms of `engines.js send` on the first message, at 12 ms. The budget was set to 20.
  4. **Passed.** send / reply2 / reply3 had no app hold ≥ 8 ms (holds 9–23 ms of process start, GC and Electron's
     internals). Everything else in the check is unchanged.
- `unit:sendlag121-test`, `unit:storeack77-test`, `unit:crashsafe-test`, `unit:synchard74-test` and `unit:boot-test`
  passed.
- `unit:datasafe-test`: 103 passed, 1 failed. The failure is the scan's new unaudited read in `parityprobe.js:171`,
  from round 120's astraprobe120 commit, not this round. All token-stats and usage checks passed, with and without the
  store thread.


## What is left
- **The engine's process start** (5–25 ms per message on this box). Avoiding it needs a long-lived small helper
  process that starts the CLIs (Codex already keeps an app-server).
- **`engines.js send`** builds the prompt and the arguments on the main process: 6–16 ms per message (the first is
  the slowest). Building them ahead (when the box is focused) or on a worker would take it away.
- **The tool-set measure** still runs on the main process, now when a chat is shown (13–40 ms once per run and agent
  setup), and again on a send 2 minutes later (a few ms: memoized).
- **Small ones seen once:**
  - `chatmediamain.js statOf` / `exists`: 6–10 ms of sync stat right after a reply;
  - `assetsmain.js`: lazy module load, 13 ms once.
- **A sync arrival during a reply:** the sync engine's work on the main thread (below).

## For the patch notes
- Sending a message and the end of a reply no longer make Hearth pause for a moment. The token meter's numbers are now
  saved in the background. Before, a year of numbers was re-read and re-written on the app's main thread after every
  reply, which could freeze typing and the start of the next reply for up to a tenth of a second.
- The meter reads its numbers in the background too.
- Nothing about what is saved changed.

## For Codex
No Codex-owned file was edited this round. These are findings from a sync arrival (notes.json and token-stats.json
from "the other computer") during a streaming reply. Main-process holds, from the CPU profile:
- `sync-engine.js:353` / `:417` (the walk's per-file `statSync`) and `walk :331` (`readdirSync`): 12–26 ms per stretch,
  several stretches per pass. Some of this is the probe's own stack capture per sync call. Async stats in batches, or
  the walk on the store thread (`storework.js` already does `syncHash`), would free the loop.
- `same()` `:790`: 16–33 ms. `canon` `:315`: 14 ms. `localHash` `:906`: 15 ms.
- `writeFlushed` `:800`: 40 ms in `fsync` on the main thread. `renameRetry` `:75`: a 29 ms rename.
- `sync-merge.js localOnly :35`: 22 ms. `isJsonRel :59`: 10 ms.
- `syncmain.js` (not Codex-owned) was left alone. Its round-77 design runs a pass for an arrival soon even while a reply
  streams. Waiting for the reply's end would trade sync latency for smoothness, which is the owner's call.
