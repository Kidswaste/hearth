# Soak (round 20): Hearth doesn't get heavier the longer it stays open

You keep Hearth open for hours on two machines and want it smooth the whole time. This round adds a long-session test
that drives the app the way you use it and samples its memory every minute, fixes what grew, adds a few caps, and
adds a safety net called **Freshen**. If the window still grows a lot after hours, Freshen offers a one-click reload
that keeps everything you had open.

## Numbers
The test is `node dev/soak.js`. It runs 20 minutes of real mouse, keyboard and wheel input in a throwaway copy:
- **Chats.** About 45 messages sent to Claude and Astra with streamed replies. Chats are switched in the list, 40 older
  80-message chats are reopened in turn, and the conversations are scrolled.
- **Lab.** About 70 scene switches, 22 sequence playbacks and 11 3D-model layers added and then removed, plus slider
  shuffles.
- **Board.** Zoomed and panned. Notes and swatches added and removed.
- **Other parts of the app.** App windows opened, hidden and closed. Commands-page searches with hover previews. Menus,
  right-click menus and the palette. 7 real renders and 22 tracked renders. 22 sync passes against a fake cloud folder.

The test keeps the amount of data steady, so anything that still grows is a leak and not data you added. Every sample
is taken in the same state (after a forced garbage collection, the chat on screen, the Lab on its first scene).

The table shows the same 20-minute session on the round-19 build and on this one. The two runs used the same machine
with the same load. Growth per hour is the least-squares slope after a 3-minute warm-up.

| After 20 min | Before | After | Growth per hour, before → after |
|---|---:|---:|---|
| Renderer JS heap | 20.4 MB | **17.8 MB** | +8.2 → +3.5 MB/h (no longer linear: R² 0.47) |
| DOM nodes | 37,041 | **23,207** | **+31,500 → +1,200 /h** |
| Detached DOM nodes (kept alive after leaving the page) | 20,828 | **6,730** | **+31,000 → +500 /h** |
| Live observers (Resize / Intersection / Mutation) | 58 | **29** | **+61 → 0 /h** |
| JS event listeners | 2,391 | 2,370 | +134 → +26 /h (flat) |
| window + document listeners | 176 | 180 | 0 → 0 |
| Live intervals | 6 | 6 | 0 → 0 |
| Object URLs not revoked | 0 | 0 | 0 → 0 |
| Lab preview: heap / WebGL contexts / GPU estimate | 12.2 MB / 1 / 2.9 MB | 13.0 MB / 1 / 2.9 MB | flat |
| App windows' heap | 1.3 MB | 1.3 MB | flat |
| Main process: heap / RSS | 7.1 / 190 MB | 6.3 / 190 MB | +1.6 → −1.1 MB/h · +6.7 → +5.3 MB/h (noise) |
| Main process: IPC listeners / timers / child processes | 7 / 3 / 0 | 7 / 3 / 0 | flat |
| GPU process | 336 MB | 317 MB | noise (R² ≤ 0.24) |
| Frame time p95 while a chat scrolls (software GL) | 16.8 ms | 33.3 ms | noise (it jumps by whole frames here) |

At the old rate, eight hours of switching between long chats meant about 250,000 page nodes kept in memory, all
of them left over from chats already closed. Now it is about 10,000.

An earlier 20-minute run without the 40 older chats found nothing growing at all: heap +4.6 MB/h with no constructor
behind it in heap-snapshot diffs, so it was compiled code and warming caches.

## What was fixed
1. **Switching between long chats no longer leaks.** Every time a chat longer than 40 messages was drawn, a hidden
   "↑ Show earlier" watcher started. It stayed alive until you scrolled to it, and through its closure it kept every
   message node of that drawing in memory. That was about 110 nodes per switch, forever. Now there is one watcher per
   chat view, and the next drawing releases it (`native.js`). This leak caused all of the before → after difference
   in the table.
2. **Only the last 12 chats you opened stay in memory.** Before, every chat opened in a session stayed loaded for good,
   with its whole history. The chats on screen, a reply that is streaming, or a chat used in the last minute are never
   dropped. The others load again from disk when you open them (`native.js`).
3. **Two loads of the same chat at once now share one copy.** Before, a second load could replace the first, and two
   copies could be edited at once.
4. **The engine log no longer grows without limit.** It rotates at 2 MB into `engine.prev.log`. Before, it grew with
   every reply for months (`engines.js`).
5. **Files the apps fetch (Poly Haven, Meshy results) are capped at 200 entries in the downloads list,** like the apps'
   own downloads (`appsmain.js`).
6. **On the Mac, the record of iCloud download requests is pruned once it holds more than 500 entries**
   (`syncmain.js`).

## Freshen: a safety net, never automatic
7. **Freshen** reloads the window and keeps everything:
   - the screen you were on
   - each agent's open chat
   - what you were typing in each chat
   - where each chat was scrolled
   - the chats list's scroll position
   - the Lab scene, and its sequence with the playhead

   You get a short "Freshened: everything is where you left it" note.
8. **It is offered only after hours, and only when memory grew a lot.** Every 5 minutes, while the window is visible,
   Hearth notes its JS heap floor, its page nodes and the memory of all its processes. The first calm reading after
   10 minutes is the baseline. After at least 2 hours, a quiet toast with a **Freshen** button appears if:
   - the heap is more than twice the baseline and at least 250 MB above it, or
   - page nodes are more than 2.5 times the baseline and at least 25k above it, or
   - all of Hearth is at least 1.5 GB above the baseline.
9. **It is never offered while you're busy.** It waits if you typed or clicked in the last 20 seconds, a reply is
   streaming, a render or recording is running, or the Lab or its sequence is playing. It is offered at most once every
   2 hours. It does nothing while the window is hidden.
10. **`/freshen`** reloads now.
11. **`/freshen status`** shows memory, page nodes and all of Hearth against the start, and whether anything is over
    the limits.
12. **`/freshen off`** and **`/freshen on`** turn the offer off or back on. `/freshen` itself always works.
13. **Ctrl/⌘+K → "Freshen the window (reload, keeps everything)".**

## The soak test (for the next rounds)
14. **`node dev/soak.js`** runs the realistic long session for N minutes (`--minutes`, default 20). It takes a sample
    every `--every` seconds (default 60), prints one table row per sample, then the trends. It flags every metric that
    grows linearly (5+ samples, R² ≥ 0.6, a real amount) and exits 1 when something grows. `--no-fail` only reports.
15. **What it samples:**
    - **Renderer.** JS heap after a GC, DOM nodes, documents and JS listeners (CDP), detached nodes, and the listeners
      on window and document (`DOMDebugger.getEventListeners`).
    - **Counted in every frame before the app's own scripts.** Live intervals, observers, object URLs, rAF callbacks,
      WebGL contexts with their textures, buffers and framebuffers, and a GPU memory estimate.
    - **Other windows and processes.** The Lab preview's own process (heap, how often it draws while hidden), the app
      windows' heaps, and the GPU process.
    - **Main process (through `--inspect`).** RSS, heap, handles (fs watchers, child processes, timers, sockets), IPC
      listeners and windows.
    - **Disk and smoothness.** Files and folders in data/ and in the cloud folder, and frame time p95 while a chat
      scrolls.
16. **"Where it grows."** Each listener, observer and interval is tracked to the line that added it. The test also
    reports DOM containers by size, detached DOM roots by class, and the main process' fs watchers and child processes
    by caller. Growth from the first sample after warm-up to the last is listed per place. This found item 1 directly:
    `IntersectionObserver at native.js:857 +20`, `div.msg +2,158 detached`.
17. **`--retainers [class,…]`** marks the biggest detached DOM trees and takes a heap snapshot. It prints the shortest
    path from a GC root to each one, which shows who keeps it alive.
18. **`--diff`** takes renderer and main heap snapshots after the warm-up and at the end. It shows what grew, by
    constructor.
19. **`--freshen`** freshens halfway through and checks that the chat, draft, scroll, Lab scene, screen, chat count and
    board all came back. The short run passed: nothing was missed.
20. **`--override <dir>`** swaps files into the copy, for a before → after on the same session.
21. **`dev/checks/freshen.js`** sets up two chats with replies, one scrolled up, a draft and a Lab scene of its own. It
    then reloads and checks that each came back. It also checks `/freshen status`, the Ctrl+K action and that nothing
    is over the limits at the start.

Lessons for whoever measures next:
- `DOM.enable` makes DevTools keep every node it has seen alive, so the first runs "found" +200k nodes/h that did not
  exist. The test enables the DOM domain only around one call.
- On Linux, Node's recursive `fs.watch` (sync) holds one watcher per file. The test discounts that ("watchers beyond
  files"). The Mac and Windows use one native watcher per folder tree.

## Tested
- `node dev/soak.js`, three times for 20 minutes (the round-19 baseline, then before → after on the same session), plus
  short runs, including `--freshen`.
- `sh dev/run-checks.sh qa-commands lazy smooth-app freshen`: 4/4 passed.
- `node --check` on every file changed.
- Not run here: hours-long sessions and the owner's real Mac / Windows GPUs. The offer's thresholds are set high on
  purpose, so a normal day never sees it.

Upgrades: 21.
