# sendpath122: building the prompt and starting the engine, off the main process's path (round 122)

Round 121 (sendlag121) left two main-process costs on every message: `engines.js` building the prompt and the
arguments (6–16 ms, the first message the slowest), and starting the engine's program (5–25 ms, the OS copying the big
Electron process). On a 240 Hz screen a frame is 4.2 ms, and every typed key and streamed word waits behind both.

## Before → after
"Heavy profile": an agent with 40 standing instructions, a 400-word personality, a big memory forced into the prompt
(40 shared, 30 own and 15 Lab facts), three of ten connections on (a 270 KB config.json read and parsed per use, as
main.js `readConfig` does), and file access to a Hearth source folder (hearthCode, datalock) plus a second folder.
Builds were timed in plain Node on this box (4 CPUs), one fresh process per column (the first message is the cold one).
The process starts were timed in a real Electron main process with a window open and 850 MB resident, like a long
session with the giant chat.

| What (per message) | Before (round 121) | After |
|---|---|---|
| Prompt + arguments, first message (Claude / Claude on Hearth's source / Director lean / full / Astra) | 7.5 / 9.3 / 8.7 / 3.1 / 4.4 ms | 4.0 / 2.1 / 2.0 / 1.7 / 2.0 ms (warmed at an idle moment) |
| Prompt + arguments, later messages (median, max) | 1.8–3.0 ms (max 3.8) | 0.5–0.9 ms (max 2.3) |
| config.json read for the connections, per send | up to 5 parses | 0 (main.js's own read for the message is passed in) |
| memory.json read, per send | 1 (Claude) – 3 (Astra) | 1 |
| Astra's prompt built, per send | 3 times | once |
| The MCP config file | `mkdirSync` + `writeFileSync` every message | written once per chat setup, reused while identical |
| Starting the engine's program: main-process hold | 7.7 ms median, p90 9.3, max 12.8 (calm box); 19 / 29 / 30 ms (busy box) | 0.04–0.05 ms median, max 0.7 (one message to the helper) |
| The helper's own start (once per run, at an idle moment 8 s after the start) | – | 8–21 ms once (`fork`) |
| Time until the program runs | the spawn itself | +1 ms (the helper's spawn takes 2–3 ms in its own process, the round trip 3.5 ms) |
| chatwindow86 send / reply2 / reply3: main-process holds of 8 ms or more | round 121: 0–16 ms of the app (prompt + spawn) in holds of 9–23 ms; this box with the helper off: 22 ms (own 20, 13 ms of it the spawn) / 12 / 11 ms | three runs: one 8 ms hold (own 6–7, none of it the app's), then nothing / nothing (one run also had a 109 ms hold with no CPU work under it, while another stream's app run shared the box) |

## The prompt, part by part
Measured per `promptParts` key (time spent until each part is added) on the heavy profile:
- **First message of a run, only:** `guide:chatTools` 1.7–12.6 ms, `guide:boardTools` 1.3–2.6, `guide:appsTools`
  0.6–1.6, `hearthCode` 1.5–3.0, `access` 2.0 (the first `require` of `reachmain` / `twocomputers-core`), `director`
  0.6–1.4. All of it is module loading: `toolGuide()` requires the MCP server's script for its `.guide`, `hearthCode`
  loads `mcp/hearth-map.js`, and the first build compiles the code it runs.
- **Every message:** each part is under 0.2 ms; `memory` 0.1–0.6 ms (memory.json read and parsed). The whole prompt is
  0.3 ms warm. The rest of a send's build was repeated reads around it: config.json for the connections (up to five
  times), memory.json once per prompt build (Astra builds three times), each folder's existence checks four to eight
  times, and the MCP config write.

## What changed
### 1. The prompt build (`engines.js`)
- **One read per send** (`scoped` / `memo`). A send's build runs inside a memo that lives for that synchronous build
  only. Each input is read once there: the connections list, memory.json, each folder's checks (`fileFolder`,
  `accessOf`, `dataLocksOf`, `isHearthSource`), and the prompt (Astra's app-server plan asked for it three times). Nothing
  is kept between messages by this memo, so a build sees the disk as it is right then.
- **The connections from main.js's read.** `engine:send` already reads config.json once (round 121). It now hands
  `cfg.connections` to `engines.send`, so the build parses nothing.
- **The prompt cache** (`promptParts` → `cachedParts`). Every part but the saved memory depends only on:
  - the agent as the run has it (its JSON: personality, instructions, tool sets, engine, folders, persona, lean…);
  - the folder facts read fresh for this build (which folder exists, the access folders, the data locks, Hearth's
    source);
  - whether Claude asks Hearth for permissions (the CLI may have dropped the flag);
  - whether the agent has connections;
  - fixed text (the tool guides and the map, loaded once per run).

  Those parts are kept (32 setups, least recently used out) under exactly that key. A later message rebuilds only the
  memory, through `memoryFor`, which is unchanged and still frozen per session. The whole build stays as
  `promptParts0`, the round-121 code, byte for byte. A miss runs it, and `HEARTH_PROMPT_CACHE=0` always runs it.
- **Warmed at an idle moment** (`engines.warm`, from main.js 8 s after the start, or 20 s when engines.js wasn't in
  yet). It runs one module per turn of the loop: the tool guides, the Lab guide, Hearth's map, datalock, the
  two-computers helper, Astra's server code, then one throwaway build of each kind. No file is written and nothing is
  kept. The first message then pays none of it.
- **The MCP config file, reused while identical** (`holdMcpFile` / `releaseMcpFile`):
  - The file is named after its content (agent, chat, a hash of the text) and counted by the runs holding it. The next
    message of the chat finds it written, so there is no write on the main process.
  - A retry's run takes its hold before the closing run lets go. That is the race round 9's one-file-per-run design
    fixed, and it can't come back.
  - A file that vanished is written again, so "Invalid MCP configuration" still gets its one fresh retry.
  - A file nobody holds is removed 10 minutes later, at quit (`exit`), or at the next start (a day old, as before).
  - `/astra-flags` (`shownArgs`) lets go of its hold instead of deleting a file a running chat may share.

### 2. The engine's program, started from a small helper (`spawnhelper.js`, `spawnhelper-child.js`)
- **Measured first** (an Electron main process with a window open, 850 MB resident, `/bin/true` started 20 times):
  - `child_process.spawn` from the main process held its loop 7.7 ms median, 12.8 ms max on a calm box, and 19 ms
    median, 30 ms max on a busy one.
  - Through a forked helper the main process sends one message: 0.04 ms median, 0.7 ms max.
  - The helper's own spawn takes 2–3 ms in its own small process.
  - `utilityProcess.fork` gave the same per-start result. It holds 8 ms at its own start, against 9–21 ms for `fork`.
  - **Chosen: `child_process.fork`** of a 40-line script, run as Hearth's own Electron in Node mode, the way the MCP
    servers already run. It works the same in Electron and in plain Node, so every engine test can run through it.
    `utilityProcess` needs Electron's main process and a different message API, and it has to drop
    `ELECTRON_RUN_AS_NODE` from its env. Its saving is a few ms, once, at an idle moment.
- **What runs is unchanged.** The main process still works out the command (`winpolish.js spawnPlan`, which
  `WinPolish.spawn` now uses too):
  - Windows' `cmd /d /s /c` with every argument quoted, and npm's `.cmd` run through its Node script;
  - the Mac's own Node for an npm copy;
  - the env given (or the main process's own: the helper's `ELECTRON_RUN_AS_NODE` never reaches the program);
  - the cwd and `windowsHide`.

  The helper only calls `spawn` with that.
- **The same object to the code that uses it.** `engines.send` and `codex-server.js` (the app-server's long-lived
  pipes, through the injected `spawn`) get a ChildProcess-like object. It has `pid`, `exitCode`, `signalCode`, `killed`
  and `hearthVia`, real `stdin` / `stdout` / `stderr` streams (`setEncoding`, `destroy`, `end`), and the `spawn`,
  `error`, `exit` and `close` events. Every byte comes back in order, and `close` comes after the last byte.
- **Kill.** `kill()` signals the program by its pid from the main process. That is the same signal a direct
  `child.kill()` sends, and a quit right after can't lose it in a message. Windows' tree kill (`engines.kill` →
  `taskkill /T /F`) uses the same pid. A kill before the start is confirmed is sent as soon as it is.
- **Input waits for the confirmation.** stdin is held in the main process until the helper says the program started.
  A program the helper started but never confirmed (the helper gone in between) gets no input, so it can't run a
  billable turn twice.
- **Fallback, automatic:**
  - Direct starts, as before, when:
    - the setting is off (`settings.spawnHelper: false`, or `HEARTH_SPAWN_HELPER=0`);
    - the helper can't start;
    - stdio is something a message can't carry (it never is for the engines).
  - The helper gone, or not answering within 4 s (20 s while it boots), before it confirmed a start: that start is
    made directly, with its held input.
  - The helper gone after a start: those programs are stopped, and their replies end as "stopped unexpectedly".
  - Two helper failures in a run: direct starts from then on.
  - A start the system refuses (spawn threw: EINVAL…) comes back as an `error` marked `hearthThrown`. `engines.send`
    says it exactly as it says a direct start's throw ("Couldn't start Claude Code (EINVAL).").
- **Started lazily, warmed at idle.** The first use forks the helper if `engines.warm` hasn't. While nothing runs
  through it, it is unref'd and keeps no quit or test waiting. It exits when the main process goes. `/doctor` shows
  its counts (`spawnHelper`).
- **Not through the helper** (rare, not on the send path): sign-in, version checks, `discoverConnectors`, the Codex
  apps catalog and account, `taskkill`.

### 3. Budgets
- **chatwindow86** `sendHold` 20 → **12** ms. A hold fails when its own time (without the wait for a CPU) is over 12 ms
  **and** the app's lines in it are too, so the budget stays load-aware. The spawn stays listed as known, because it
  is what a helper failure falls back to. In three runs with the helper the app had no hold of 8 ms in send, reply2 or
  reply3. The largest app stretch was `engines.js send`: 3–4 ms in a 10 ms busy stretch that was not a hold. With the
  helper off on the same box, the send step held 22 ms, 13 ms of it in the spawn.

## Decisions
- **The cache is keyed on every input, not invalidated by events.** A missed invalidation would quietly send a stale
  prompt. A key built from the agent's JSON and the folder facts read fresh can't go stale. The price is the folder
  checks and one `JSON.stringify` of the agent per message, ≈ 0.1 ms.
- **The memory part is never cached.** It is the part that changes most, and `memoryFor` has a side effect (the
  session's frozen notes) that must happen exactly as before.
- **The helper is on by default.** The gain is real (8–30 ms of main-process hold per message, the largest left on the
  send path). Its risks are contained: each failure mode falls back to the direct start, input is held until a start
  is confirmed, and the existing engine tests (`astra-engine-test`, `robust-engine-test`) now run their whole suites
  through it.

## Tests
- **`dev/sendpath122-test.js`** (new, in UNIT):
  1. The cached prompt equals the whole build (`promptParts0`, the round-121 code), parts and session side effects.
     It covers 36 groups of edits (about 55 builds) and 300 seeded random agents asked twice (a miss, then a hit), each with and without a session:
     - personality, standing instructions on / off, memory added / grown (frozen) / edited / big (relevant only) /
       forced in / off / cleared;
     - a folder appearing and going;
     - access read / write / full;
     - Hearth's source folder (hearthCode + datalock), the data folder itself, the source folder stopping being one;
     - the permission tool dropped and back;
     - Astra (web, folder edit, sandbox / no sandbox, Hearth's source), an engine switch both ways;
     - Director lean / full / crew / nodes off / on Astra, every tool set;
     - apps, connections on / off / removed;
     - lean, persona, answer length, visual review.

     Claude's whole command line and Astra's exec line and app-server thread are the same with the cache on and off.
     Astra builds its prompt once per send. A mutation check while writing the test showed that leaving the
     permission flag out of the key is caught.
  2. The MCP config file is reused (same inode, same mtime), held by both runs, kept after both let go, written again
     when it vanished, and given its own file for another setup. No connection secret appears in a prompt.
  3. The helper against a direct start:
     - the same env, cwd, stdin, every byte (a € split across two pieces, 3 MB of output), stderr, exit code and
       event order;
     - the program never sees `ELECTRON_RUN_AS_NODE`;
     - `kill()` (SIGTERM, as direct) and a kill before the confirmation;
     - a refused start;
     - the fallbacks: off, gone before a start (direct, ran once), gone after a start (ends as killed, the program
       stopped), two failures (direct from then on);
     - a whole `engines.send` Claude turn and Stop through it.
- **`astra-engine-test` and `robust-engine-test`** now copy the helper, so their whole suites (Claude and Astra exec
  and app-server turns, retries, unknown flags, lost sessions, network retries, Stop, MCP-file loss) run through it.
  `astra-engine-test`'s "one file per run" check became "the same content is the same file, held per run".
- Run under `flock /tmp/hearth-run.lock` with `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package CHATWINDOW86=1`:
  - **chatwindow86**, four runs:
    1. Passed. The `send` step had one 8 ms hold (own 7, not the app's). `reply2` had a 109 ms hold with no CPU work
       under it while another stream's app run shared the box.
    2. `HEARTH_SPAWN_HELPER=0` (the before, on this box): passed under the old budget. `send` held 22 ms (13 ms
       spawn), and reply2 / reply3 held 12 / 11 ms.
    3. Passed, with no hold of 8 ms in send, reply2 or reply3.
    4. With `sendHold: 12`, passed. One 8 ms hold (own 6, not the app's), then none.
  - `unit:sendpath122-test`, `unit:promptdiet-test`, `unit:tokens-test`, `unit:tokenaudit-test`, `unit:cache-test`,
    `unit:astraparity116-test`, `unit:datalock119-test`, `unit:astra-engine-test`, `unit:robust-engine-test`,
    `unit:codex-server-test` and `unit:boot-test` all passed (12/12 with chatwindow86 in the last run).
  - `node dev/boot-test.js` passed (2822 checks).

## For the patch notes
- Sending a message is lighter on Hearth. Before, Hearth paused for a moment on every send to start the AI's program:
  up to a few hundredths of a second, longer on a busy computer. A small helper now starts it in the background.
- The instructions Hearth gives the AI are put together once and reused while nothing in them changes, so later
  messages in a chat start faster. What the AI receives is exactly the same as before.
- The first message after opening Hearth is as quick as the rest: what it needs is loaded in a quiet moment just after
  the start.

## For Codex
No Codex-owned file was edited. `codex-server.js` gets its `spawn` injected from `engines.js` (`Pool({ spawn })`). That
is now `engineSpawn`, so an Astra app-server starts through the process helper with the same command, env and cwd, and
the same stdio, events, exit codes and kill. A start the helper refuses (spawn threw) reaches `Connection` as an
`error` event (with `err.hearthThrown`) instead of a synchronous throw from `spawn()`. Connection already handles
`error` by closing with it, so the run ends with that error.
