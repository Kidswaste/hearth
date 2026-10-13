# lightweight (round 34): less memory held, nothing left behind after you close things

You want Hearth light. This pass measured what the app holds at start, during an hour-like session and once that
session's things are closed again, then fixed what was kept for nothing. The two big finds were in the background
(main) process, and only show with a real chat history: a search cache that held the text of every chat from the
first second, and the "what did we decide?" index, which took about 200 MB of memory for 400 long chats. In the
window itself, every ⋯ AI setup you opened stayed in memory. Nothing looks or works differently.

## How it was measured
- **The session** (`dev/checks/lightweight.js`, new): the soak test's counters (dev/soak.js) load before the app, then
  a compressed hour runs three times: the Lab opened (a scene drawn) and left, ⋯ AI setup opened and closed 3×, two new
  chats answered, six older 80-message chats reopened, a long streamed reply, Astra answering, ◉ Activity opened and
  closed, then everything closed again (one chat on screen; the chats it made deleted, so what stays is what it left
  behind). After a forced GC at each step: JS heap, DOM nodes, listeners (and where they were added), window / document
  listeners, observers, timers, detached DOM, WebGL contexts, every page / frame / worker, and each process's memory
  (main, window, GPU, utility). A 6-session run showed where it levels off.
- **A big history**: a throwaway data folder of 400 chats × 80 messages (16.9M characters, a 6,000-word vocabulary,
  like an imported claude.ai / ChatGPT history), the main process's memory at start, after the recall index (it builds
  itself ≈ 45 s after start) and after a search. The store thread and the recall index were also measured alone in Node.
- **IPC**: dev/boot-probe.js now optionally weighs every answer (`HEARTH_BOOT_PROBE_BYTES=1`, `HEARTH_BOOT_PROBE_MS`)
  over the whole session.
- **Cold start**: `node dev/coldstart-report.js`, base and branch interleaved, 4 rounds × 2 launches each.
- Before = this branch's starting commit (76bc6b0) from a copy, same machine (4 CPUs, software GL, shared with other
  agents: load 5–8; timings move ±30 %, the counts and megabytes are the reliable numbers).

## Numbers (before → after)

### The session (empty data folder, 3 sessions)
| After the sessions, everything closed | Before | After |
|---|---:|---:|
| JS heap (start 9.1 MB) | 13.8 MB | **13.5 MB** |
| DOM nodes (start 1,872) | 13,666 | **7,989** |
| JS listeners (start 397) | 1,685 | **1,158** |
| document listeners (start 66) | 92 | **76** |
| detached DOM nodes | 1,417 | **407** |
| **Each further session, once warm**: nodes · listeners · document listeners | **+2,562 · +226 · +6** | **+129 · +1 · 0** |
| Same: heap | +0.6 MB | +0.4 MB (levels off: 13.5 → 13.7 MB over sessions 3–6) |
| observers · timers · window listeners · object URLs | 27 · 5 · 168 · 0 | same (no growth) |
| Pages / frames / workers left | the window, the Lab preview, the Markdown worker | same |
| Processes: main · window · GPU · network | 186 → 195 · 171 → 298 · 169 → 235 · 75 MB | same |
| The check's verdict on the old code | 5 failures (nodes, listeners, document listeners, AI setup sheets ×2) | passes |

### The big history (400 long chats, main process)
| Main process | Before | After |
|---|---:|---:|
| At start | 305 MB | **249 MB** |
| After the recall index (by itself, ≈ 45 s after start) | 475 MB | **298 MB** |
| After a chats search | 494 MB | **350 MB** (texts kept 10 min, then let go) |
| The store thread's chats list alone: memory · time | +61 MB · 156 ms | **+12 MB · 96 ms** |
| The recall index alone (Node, after GC) | 355 MB | **30 MB** (−92 %) |
| Same: build · a question | 2.0 s · 6 ms | 1.7 s · 2 ms |
| First chats search after a quiet while · the next ones | 57 ms · 16 ms | 157 ms · 28 ms (on the store thread, not the window) |

### Start and IPC
| What | Before | After |
|---|---:|---:|
| Cold start: first screen ready (median of 8, interleaved) | 551 ms | 481 ms (same within noise) |
| Cold start: window shown · every feature loaded | 440 · 3,149 ms | 414 · 2,938 ms (noise) |
| IPC over the whole session (400 chats) | 142 KB in 337 calls; the biggest is the chats list, 41 KB | nothing worth changing |

## Upgrades

### Nothing left behind in the window
1. **⋯ AI setup no longer stays in memory after you close it.** Its "Files on this computer" and "Check this AI" parts
   each left a listener on the page that kept the whole closed sheet (≈ 250 nodes, ≈ 75 listeners) until a rare event
   came by; every open added another. Now one listener per part, and a closed sheet goes at once. `access.js`, `aicheck.js`
2. **The rendered-Markdown cache is capped by size too** (6M characters, ≈ 1,000 ordinary replies): 600 very long
   replies (pasted logs, whole files) used to keep ≈ 40 MB of text and HTML. `md.js`
3. **The Lab's version pictures (time machine) stay in memory for the last 6 scenes**, like their histories; older
   ones are read from disk again when shown. `tools/three-history.js`

### A lighter background process
4. **Hearth no longer keeps the text of every chat from the first second.** The chats list read every chat at start
   and kept its messages (plus a lowercase copy after a search) for a search that may never come: tens of MB with an
   imported history. Now a search reads them in, and 10 minutes without one lets them go; the list itself is 40 %
   quicker. `storework.js`
5. **"What did we decide?" takes about a tenth of the memory.** Its index of every message (built by itself a minute
   after the start) was ≈ 200 MB of the background process for 400 long chats; now ≈ 20–30 MB, packed into typed
   arrays, same answers, same speed. `recall-core.js`, `storework.js`
6. **"What did we decide?" no longer loses words.** Once a chat that said a word in several messages was deleted or
   changed, that word could disappear from every later question (its count went below zero). Fixed. `recall-core.js`
7. **Hearth's Chrome closes itself after 5 minutes out of sight with no page open** (every Chrome view, app window and
   website chat in it closed): its processes held ≈ 150–300 MB until Hearth quit. The next use starts it again in
   about a second, still signed in. Never while it's shown or you're signing in. `chromemain.js`

### For the next measurer (dev, not counted)
- `dev/checks/lightweight.js` (`sh dev/run-checks.sh lightweight`, its own group with `unit:recall-test`,
  `unit:store-thread-test`, `unit:chrome-test`): fails when the heap after the sessions grows more than 8 MB over the
  start, when a warm session leaves > 1.2 MB / 600 nodes / 40 listeners, when document / window listeners, observers or
  timers grow per session, when closed AI setup sheets stay (> 2), or when a WebGL context, a hidden page other than the
  Lab preview, or an extra process is left. `localStorage.lwSessions = 6` (an `--eval`) runs more sessions.
- `dev/recall-test.js`: the index's size, a word surviving dropped chats, re-saves swept. `dev/store-thread-test.js`:
  no texts held before a search, held while searching, let go after (`HEARTH_TEXT_IDLE_MS`). `dev/chrome-test.js`: the
  idle quit against the fake DevTools (`HEARTH_CHROME_IDLE_MS`), and a page open keeps Chrome.
- `dev/boot-probe.js`: `HEARTH_BOOT_PROBE_BYTES=1` weighs IPC answers, `HEARTH_BOOT_PROBE_MS` counts past 5 s.

## Measured, left as is
- **The Lab once opened stays loaded** (its preview page ≈ 125 MB in its own process, ≈ 60 MB of GPU memory, ≈ 6,000
  nodes of panels). It's parked (no drawing) while hidden, and it's your main tool: unloading it would mean a reload,
  the music re-attached and the scene's clock restarting when you come back. Not worth it.
- **Groups that load after the first screen** (board, capture, projects, Adobe, deploy…) stay 'soon': each hooks
  into menus or chats at load (the board's right-click "Adobe" items, the composer's mic…), so moving them to
  first-use would change what you see. The JS heap after start is 9 MB with all of them in.
- Pictures in replies (`chat-things.js`, `chat-media.js`) are decoded at their file size and shown small; Chromium
  drops decoded pictures that leave the screen, and making thumbnails would need a new main-process path. Left.
- One or two closed AI setup sheets can still be held for a moment by the browser itself (the last clicked element);
  it doesn't grow (the check allows two).
- IPC payloads are small everywhere (above); the Lab's scenes store is the biggest read and it's needed.

## Tested
`node --check` on every touched JS file; `sh dev/run-checks.sh lightweight` (4/4), `lazy unit:boot-test aicheck
access-chat recall chat-stream` (8/8: aicheck includes options), `timemachine unit:timemachine-test` (2/2),
`node dev/chromeview-test.js` (22/22); the lightweight check on the starting commit fails 5 of its budgets, as it should.

## For the patch notes
- Hearth holds less memory in the background: with a big chat history (400 long chats here) its background process
  starts about 55 MB lighter and stays about 175 MB lighter once the "what did we decide?" index is built.
- "What did we decide?" now uses about a tenth of the memory, answers as fast, and no longer forgets a word after a
  chat that used it is deleted.
- Chat search reads your chats when you search and lets them go 10 minutes later; the first search after a quiet
  while takes a fraction of a second longer.
- Closing ⋯ AI setup now really frees it: opening it again and again no longer makes the window heavier.
- Hearth's own Chrome closes itself after 5 minutes with nothing open in it, and starts again (still signed in) the
  next time you use it.
- Very long replies no longer pile up in the chat's drawing cache, and the Lab's history pictures are kept for your
  last few scenes only.
- Nothing looks or works differently; a new check guards against these coming back.
